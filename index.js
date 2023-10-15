import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import osc from 'node-osc';
import fs from 'node:fs';

const readFile = (filePath) => {
    try {
        const fileData = fs.readFileSync(filePath, 'utf8');
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
const program = readFile(filePath);
const parameters = program['parameters'];
const level = parseInt(process.argv[3]) || 0;
const assignedControls = level > 0; // Allow only control of the assigned parameters (but see all params)
const assignedParams = level > 1; // Show only assigned parameters
const hideLabel = level > 2; // Show only slider
const minParams = 2; // TODO Parameter?
let socketIds = []; // Holds all connected sockets
let oscClient;

const getAssignedSocketIds = () => {
    const assignedSocketIds = [];

    for (let i = 0; i < parameters.length; i++) {
        const socketId = parameters[i].sid;

        if (typeof socketId === "string" && !assignedSocketIds.includes(socketId)) {
            assignedSocketIds.push(socketId);
        }
    }

    return assignedSocketIds;
}

const requestAccess = (socketId) => {
    let assignedSocketIds = getAssignedSocketIds();
    if (assignedSocketIds.includes(socketId) === false) {
        // Not assigned yet - check for availability
        if (assignedSocketIds.length >= Math.ceil(parameters.length / minParams)) {
            // Not enough parameters left
            console.log('No available parameters left');
            socket.emit('status', 'No available parameters left. Try again in a minute.');
        } else {
            assignedSocketIds.push(socketId);
        }
    }
    return assignedSocketIds;
};

const requestUpdate = (socketId) => {
    let assignedSocketIds = requestAccess(socketId);
    if (assignedSocketIds.includes(socketId) === true) {
        distributeParametersBetweenSockets(assignedSocketIds);
    }
}

const removeElementFromArray = (array, value) => {
    const index = array.indexOf(value);

    if (index > -1) {
        array.splice(index, 1);
    }

    return array;
}

const randomizeArrayOrder = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
}

const distributeParametersBetweenSockets = (assignedSocketIds) => {
    assignedSocketIds = randomizeArrayOrder(assignedSocketIds);
    const numSockets = assignedSocketIds.length;
    const numParameters = parameters.length;
    const parametersPerSocket = Math.floor(numParameters / numSockets);
    const remainingParameters = numParameters % numSockets;

    let currentIndex = 0;

    for (let i = 0; i < numSockets; i++) {
        const numParametersForSocket = parametersPerSocket + (i < remainingParameters ? 1 : 0);

        for (let j = 0; j < numParametersForSocket; j++) {
            parameters[currentIndex].sid = assignedSocketIds[i];
            currentIndex++;
        }
    }
    io.emit('setParameters', program['name'], parameters, assignedControls, assignedParams, hideLabel);
}

app.get('/', (req, res) => {
    res.sendFile(new URL('./index.html', import.meta.url).pathname);
});

server.listen(3000, () => {
    console.log(program['name'] + ' running at http://localhost:3000');
});

io.on('connection', (socket) => {
    socket.on('config', function (obj) {
        console.log('config', obj);
        console.log('parameters', parameters.length);
        socketIds.push(socket.id); // Add to all active sockets
        socket.emit('socketId', socket.id); // Register the socket id with the client
        oscClient = new osc.Client(obj.client.host, obj.client.port);
        oscClient.send('/status', socket.id + ' connected');
        let assignedSocketIds = requestAccess(socket.id);
        if (assignedSocketIds.includes(socket.id) === true) {
            distributeParametersBetweenSockets(assignedSocketIds);
        } else {
            // Not enough parameters left
            console.log('No available parameters left');
            socket.emit('status', 'No available parameters left. Try again in a minute.');
            socket.emit('setParameters', program['name'], parameters, assignedControls, assignedParams, hideLabel);
        }
        console.log("total connected clients", socketIds.length);
        console.log("total assigned clients", assignedSocketIds.length);
        console.log('connected', socket.id);
    });
    socket.on('requestUpdate', requestUpdate);
    socket.on('message', function (parameterIndex, value) {
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
        for (let i = 0; i < address.length; i++) {
            oscClient.send(address[i], value);
            console.log('Sent OSC message to', address[i], value);
        }
        // Set the value on the parameter
        parameters[parameterIndex].value = value;
        // Send updated parameters to all connected users
        io.emit('value', parameterIndex, value);
    });
    socket.on("disconnect", function () {
        console.log('disconnect', socket.id);
        for (let i = 0; i < parameters.length; i++) {
            if (parameters[i].sid === socket.id) {
                parameters[i].sid = null;
            }
        }
        socketIds = removeElementFromArray(socketIds, socket.id);
        console.log('socketIds', socketIds);
        const assignedSocketIds = getAssignedSocketIds();
        for (let i = 0; i < socketIds.length; i++) {
            if (!assignedSocketIds.includes(socketIds[i]) && requestAccess(socketIds[i]).includes(socketIds[i]) === true) {
                assignedSocketIds.push(socketIds[i]);
            }
        }
        distributeParametersBetweenSockets(assignedSocketIds);
        //io.emit('setParameters', program['name'], parameters, assignedControls, assignedParams, hideLabel);
    });
});
