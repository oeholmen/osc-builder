import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import osc from 'node-osc';
import { readFileSync } from 'node:fs';
import os from "os";

const readFile = (filePath) => {
    try {
        const fileData = readFileSync(filePath, 'utf8');
        return JSON.parse(fileData);
    } catch (error) {
        console.error('Error reading JSON file:', error);
        return {};
    }
};

const app = express();
const server = createServer(app);
const io = new Server(server);
const filePath = process.argv[2] || "programs/tweaksynthAnalog.json";
const { parameters, name } = readFile(filePath);
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
};

const localIpAddress = getLocalIpAddress();
const level = parseInt(process.argv[3]) || 0;
const minParams = parseInt(process.argv[4]) || 1;
const serverHost = process.argv[5] || localIpAddress;
const serverPort = parseInt(process.argv[6]) || 3334;
const assignedControls = level > 0;
const assignedParams = level > 1;
const hideLabel = level > 2;

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
};

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

    let currentIndex = assignedSocketIds.reduce((index, socketId, i) => {
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
    socket.on('message', (parameterIndex, value) => {
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
    });
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
