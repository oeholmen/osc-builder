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
let oscClient;

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
const serverHost = process.argv[5] || localIpAddress;
const serverPort = parseInt(process.argv[6]) || 3334;
const assignedControls = level > 0; // Client gets assigned controls
const assignedParams = level > 1; // Client only sees assigned controls
const hideLabel = level > 2; // Client does not see control labels

const handleMessage = (parameterIndex, value) => {
    let address = parameters[parameterIndex].address;
    let format = parameters[parameterIndex].format;
    if (format === "f") {
        value = parseFloat(value)
    } else if (format === "i" || format === "b") {
        value = parseInt(value)
    }
    const min = parameters[parameterIndex].min;
    const max = parameters[parameterIndex].max ?? parameters[parameterIndex].valueMap.length;
    if (value < min) {
        value = min;
    }
    if (value > max) {
        value = max;
    }
    if (typeof address === 'string') {
        address = [address];
    }
    address.forEach((addr) => {
        oscClient.send(addr, value);
        console.log('Sent OSC message to', addr, value);
    });
    parameters[parameterIndex].value = value;
    io.emit('value', parameterIndex, value);
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
    if (!assignedSocketIds.find(id => id === socketId)) {
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

    io.emit('setParameters', name, parameters, assignedControls, assignedParams, hideLabel);
}

app.get('/', (req, res) => {
    res.sendFile(new URL('./index.html', import.meta.url).pathname);
});

app.get('/keyboard', (req, res) => {
    res.sendFile(new URL('./keyboard.html', import.meta.url).pathname);
});

/* app.post('/api', (req, res) => {
    const receivedData = req.body;
    console.log('Received JSON data:', receivedData);

    // Process the received data or send an appropriate response
    try {
        const patchData = JSON.parse(receivedData);
        console.log('patchData', patchData);
        for (let i = 0; i < parameters.length; i++) {
            handleMessage(i, patchData.parameters[i].value);
        }
    } catch (error) {
        console.error('Error reading JSON file:', error);
    }

    // Send a response back to the client
    res.json({ message: 'JSON received successfully!' });
}); */

server.listen(3000, () => {
    console.log(`${name} running at http://${localIpAddress}:3000`);
    console.log('Server', {'host': serverHost, 'port': serverPort});
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
    socket.on('ready', () => {
        socketIds.push(socket.id);
        socket.emit('socketId', socket.id);
        oscClient = new osc.Client(serverHost, serverPort);
        oscClient.send('/status', `${socket.id} connected`);
        const assignedSocketIds = requestAccess(socket.id);
        if (assignedSocketIds.includes(socket.id)) {
            distributeParametersBetweenSockets(assignedSocketIds);
        } else {
            socket.emit('setParameters', name, parameters, assignedControls, assignedParams, hideLabel);
            socket.emit('status', 'No available parameters left. Try again in a minute.');
        }
        console.log("total connected clients", socketIds.length);
        console.log("total assigned clients", assignedSocketIds.length);
        console.log('connected', socket.id);
    });
    socket.on('requestUpdate', (socketId) => {
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
    });
});
