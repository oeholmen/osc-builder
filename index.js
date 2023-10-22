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
//const { parameters, name } = readFile(programPath);
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
const assignedControls = level > 0;
const assignedParams = level > 1;
const hideLabel = level > 2;

const handleMessage = (parameterIndex, value) => {
    let address = parameters[parameterIndex].address;
    let format = parameters[parameterIndex].format;
    if (format === "f") {
        value = parseFloat(value)
    } else if (format === "i" || format === "b") {
        value = parseInt(value)
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

const createPatch = async (prompt) => {;
    console.log('createPatch from prompt', prompt);
    const instructions = readFile("openai/instructions.txt", false);
    //console.log('instructions', instructions);
    prompt = prompt || readFile("openai/defaultPrompt.txt", false);
    prompt += "\n" + JSON.stringify(program);
    //console.log('prompt', prompt);
    const request = {
        model: "gpt-3.5-turbo",
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
        //max_tokens: 256,
        //top_p: 1,
        //frequency_penalty: 0,
        //presence_penalty: 0,
    };
    //console.log('request', request);
    const response = await openai.chat.completions.create(request);
    try {
        //console.log('response', response.choices[0].message);
        const patchData = JSON.parse(response.choices[0].message.content);
        //console.log('patchData', typeof patchData);
        //console.log('patchData.parameters', patchData.parameters);
        for (let i = 0; i < patchData.parameters.length; i++) {
            //console.log("Setting", patchData.parameters[i].name, patchData.parameters[i].value);
            handleMessage(i, patchData.parameters[i].value);
        }
    } catch (error) {
        console.error('Error reading JSON file:', error);
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

app.post('/api', (req, res) => {
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
});

server.listen(3000, () => {
    console.log(`${name} running at http://${localIpAddress}:3000`);
    console.log('Server', {'host': serverHost, 'port': serverPort});
});

io.on('connection', (socket) => {
    socket.on('ready', () => {
        console.log('parameters', parameters.length);
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
        if (socketIds.some((id) => !assignedSocketIds.includes(id) && requestAccess(id).includes(id))) {
            assignedSocketIds.push(socketIds[i]);
            assigned++;
        }
        if (assigned > 0) {
            distributeParametersBetweenSockets(assignedSocketIds);
        }
    });
});
