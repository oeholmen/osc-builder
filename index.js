import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import osc from 'node-osc';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
import os from "os";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const readFile = (filePath, parseJson = true) => {
    try {
        const fileData = readFileSync(filePath, 'utf8');
        return parseJson ? JSON.parse(fileData) : fileData;
    } catch (error) {
        console.error('Error reading JSON file:', error);
        return {};
    }
};

const app = express();
const server = createServer(app);
const io = new Server(server);
const programPath = process.argv[2] || "programs/tweaksynthAnalog.json";
const program = readFile(programPath);
const name = program.name;
const parameters = program.parameters;

let socketIds = [];
let adminSocket = null;
let oscClient;

let waitMessage = [
    "<h3>Please wait...</h3>",
    "<p>We will be ready in just a minute.</p>",
    "<p>Your assigned parameters will be set on a green background. You may need to scroll down to see them.</p>",
    "<p>If you are on a small screen, landscape mode is recommended.</p>",
    "<p>You may choose to switch parameters only once during a session.</p>",
    "<p>Artwork by Sebastian Schepis</p>",
];

let completedMessage = [
    "<h3>The session is now closed!</h3>",
    "<p>Hope you enjoyed it ♫♬</p>",
    "<p>Artwork by Sebastian Schepis</p>",
];

const getLocalIpAddress = () => {
    const networkInterfaces = os.networkInterfaces();
    const interfaces = Object.values(networkInterfaces);
    const ipv4Addresses = interfaces
        .map((iface) => iface.filter((addr) => addr.family === 'IPv4'))
        .flat()
        .map((addr) => addr.address);
    return ipv4Addresses.find((addr) => addr !== '127.0.0.1');
}

const localIpAddress = getLocalIpAddress();
const level = parseInt(process.argv[3]) || 0;
const minParams = parseInt(process.argv[4]) || 1;
const clientPort = parseInt(process.argv[5]) || 3000;
const serverHost = process.argv[6] || localIpAddress;
const serverPort = parseInt(process.argv[7]) || 3334;
const assignedControls = level > 0; // Client gets assigned controls
const assignedParams = level > 1; // Client only sees assigned controls
const hideLabel = level > 2; // Client does not see control labels

let paramsActivated = level === 0;

const handleMessage = (parameter, parameterIndex) => {
    const values = [];
    let value = parameter.value;
    let address = parameter.address;
    let format = parameter.format || "i";
    if (format === "f") {
        value = parseFloat(value)
    } else if (format === "i" || format === "b") {
        value = parseInt(value)
    }
    if (typeof parameter.min === "number") {
        const min = parameter.min;
        const max = parameter.max ?? parameter.valueMap.length;
        if (value < min) {
            value = min;
        }
        if (value > max) {
            value = max;
        }
    }

    if (typeof address === 'string') {
        address = [address];
    }

    if (typeof parameter.valueOn === "number" && typeof parameter.valueMap === "object" && parameter.valueMap.length >= address.length) {
        const valueOn = parameter.valueOn;
        const valueOff = parameter.valueOff ?? 0;
        for (let i = 1; i < (parameter.valueMap.length+1); i++) {
            if (value === i) {
                values.push(valueOn)
            } else {
                values.push(valueOff)
            }
        };
    } else {
        address.forEach(() => {
            values.push(value)
        });
    }

    address.forEach((addr, i) => {
        oscClient.send(addr, values[i]);
        console.log('Sent OSC message to', addr, values[i]);
    });
    if (typeof parameterIndex === "number") {
        parameters[parameterIndex].value = value;
        io.emit('value', parameterIndex, value);
    }
}

const createPatch = async (prompt) => {
    const instructions = readFile("openai/instructions.txt", false);
    prompt = prompt || readFile("openai/defaultPrompt.txt", false);
    io.emit('startCreating', prompt);
    console.log(prompt);
    prompt += "\n" + JSON.stringify(program.parameters.map(p => {
        return {
            "name": p.name,
            "description": p.description,
            "value": p.value,
            "valueMap": p.valueMap || null,
            "min": p.min,
            "max": p.max || p.valueMap.length,
            "f": p.f
        };
    }));
    const request = {
        model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
        messages: [
            {
                "role": "system",
                "content": instructions
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature: 0.9,
    };
    try {
        const response = await openai.chat.completions.create(request);
        const patchData = JSON.parse(response.choices[0].message.content);
        console.log(patchData)
        for (let i = 0; i < patchData.parameters.length; i++) {
            handleMessage(i, patchData.parameters[i].value);
        }
        io.emit('patchCreated', `Patch created! ${patchData.name}: ${patchData.description}`);
    } catch (error) {
        console.error('Error occurred:', error);
        io.emit('patchCreated', "An error occurred. Please try again.");
    }
}

const getAssignedSocketIds = () => {
    const assignedSocketIds = parameters
        .filter((param) => typeof param.sid === "string")
        .map((param) => param.sid)
        .filter((id, index, arr) => arr.indexOf(id) === index);
    return assignedSocketIds;
}

const requestAccess = (socketId) => {
    const assignedSocketIds = getAssignedSocketIds();
    if (socketId !== adminSocket && !assignedSocketIds.find(id => id === socketId)) {
        if (assignedSocketIds.length < Math.ceil(parameters.length / minParams)) {
            assignedSocketIds.push(socketId);
        } else {
            console.log('No available parameters left');
        }
    }
    return assignedSocketIds;
}

const removeSocket = (socketId) => {
    parameters.forEach((param) => {
        if (param.sid === socketId) {
            param.sid = null;
        }
    });

    const index = socketIds.findIndex(id => id === socketId);
    if (index !== -1) {
        socketIds = socketIds.slice(0, index).concat(socketIds.slice(index + 1));
    }
}

const adminSetup = () => {
    io.emit('adminSetup', {
        'level': level,
        'clients': socketIds.length,
        'minParamsPerClient': minParams,
        'maxClients': Math.ceil(parameters.length / minParams),
        'assignedControls': assignedControls,
        'showAssignedParamsOnly': assignedParams,
        'hideLabel': hideLabel,
        'paramsActivated': paramsActivated,
    });
}

const distributeParametersBetweenSockets = (assignedSocketIds) => {
    assignedSocketIds.sort(() => Math.random() - 0.5);
    const numSockets = assignedSocketIds.length;
    const numParameters = parameters.length;
    const parametersPerSocket = Math.floor(numParameters / numSockets);
    const remainingParameters = numParameters % numSockets;

    assignedSocketIds.reduce((index, socketId, i) => {
        const numParametersForSocket = parametersPerSocket + (i < remainingParameters ? 1 : 0);
        for (let j = 0; j < numParametersForSocket; j++) {
            parameters[index].sid = socketId;
            index++;
        }
        return index;
    }, 0);

    if (paramsActivated) {
        io.emit('setParameters', name, parameters, assignedControls, assignedParams, hideLabel);
    } else {
        io.emit('status', waitMessage.join("\n"));
    }
}

app.get('/', (req, res) => {
    res.sendFile(new URL('./index.html', import.meta.url).pathname);
});

app.get('/keyboard', (req, res) => {
    res.sendFile(new URL('./keyboard.html', import.meta.url).pathname);
});

app.get('/client.css', (req, res) => {
    res.sendFile(new URL('./client.css', import.meta.url).pathname);
});

app.get('/client.js', (req, res) => {
    res.sendFile(new URL('./client.js', import.meta.url).pathname);
});

app.get('/tripoles.js', (req, res) => {
    res.sendFile(new URL('./tripoles.js', import.meta.url).pathname);
});

server.listen(clientPort, () => {
    console.log(`${name} running at http://${localIpAddress}:${clientPort}?admin`);
    console.log('Server', { 'host': serverHost, 'port': serverPort });
    console.log('Settings', {
        'level': level,
        'numParameters': parameters.length,
        'minParamsPerClient': minParams,
        'maxClients': Math.ceil(parameters.length / minParams),
        'assignedControls': assignedControls,
        'showAssignedParamsOnly': assignedParams,
        'hideLabel': hideLabel,
    });
});

io.on('connection', (socket) => {
    socket.on('ready', (isAdmin) => {
        socket.emit('socketId', socket.id);
        const adminConnect = isAdmin && typeof adminSocket !== 'string';
        if (adminConnect) {
            adminSocket = socket.id;
            console.log("admin connected", adminSocket);
        } else {
            socketIds.push(socket.id);
        }
        socket.emit('isAdmin', adminConnect);
        adminSetup();
        console.log("total connected clients", socketIds.length);
        oscClient = new osc.Client(serverHost, serverPort);
        oscClient.send('/status', `${socket.id} connected`);
        if (adminConnect) {
            socket.emit('setParameters', name, parameters, false, false, false);
        } else {
            const assignedSocketIds = requestAccess(socket.id);
            if (assignedSocketIds.includes(socket.id)) {
                distributeParametersBetweenSockets(assignedSocketIds);
            } else {
                if (paramsActivated) {
                    socket.emit('setParameters', name, parameters, assignedControls, assignedParams, hideLabel);
                }
                socket.emit('status', 'No available parameters left. Try again in a minute.');
            }
            console.log("total assigned clients", assignedSocketIds.length);
            console.log('connected', socket.id);
        }
    });
    socket.on('requestUpdate', (socketId) => {
        if (socketId === adminSocket) {
            paramsActivated = !paramsActivated;
            if (paramsActivated) {
                io.emit('setParameters', name, parameters, assignedControls, assignedParams, hideLabel);
            } else {
                io.emit('hideParameters', completedMessage.join("\n"));
            }
            adminSetup();
            return;
        }
        const assignedSocketIds = requestAccess(socketId);
        if (assignedSocketIds.includes(socketId)) {
            distributeParametersBetweenSockets(assignedSocketIds);
        } else {
            socket.emit('status', 'No available parameters left. Try again in a minute.');
        }
    });
    socket.on('createPatch', createPatch);
    socket.on('message', handleMessage);
    socket.on("disconnect", () => {
        console.log('disconnect', socket.id);
        if (socket.id === adminSocket) {
            adminSocket = null;
            console.log('admin disconnected');
            return;
        }
        removeSocket(socket.id);
        console.log('socketIds after disconnect', socketIds);
        const assignedSocketIds = getAssignedSocketIds();
        let assigned = 0;
        const index = socketIds.findIndex(id => !assignedSocketIds.includes(id) && requestAccess(id).includes(id));
        if (index) {
            assignedSocketIds.push(socketIds[index]);
            assigned++;
        }
        if (assigned > 0) {
            distributeParametersBetweenSockets(assignedSocketIds);
        }
        adminSetup();
    });
});
