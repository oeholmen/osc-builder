import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import osc from 'node-osc';
import fs from 'node:fs';

const app = express();
const server = createServer(app);
const io = new Server(server);

const readFile = (filePath) => {
    try {
        const fileData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileData);
    } catch (error) {
        console.error('Error reading JSON file:', error);
        return {};
    }
};

const filePath = process.argv[2] || "programs/tweaksynthAnalog.json";
const program = readFile(filePath);
const parameters = program['parameters'];
const singleParam = parseInt(process.argv[3]) === 1; // Show only a single parameter
const singleControl = parseInt(process.argv[4]) === 1; // Allow only control of the assigned parameter
const showAddress = parseInt(process.argv[5]) === 1; // Show the osc address

let oscClient;

app.get('/', (req, res) => {
    res.sendFile(new URL('./index.html', import.meta.url).pathname);
});

server.listen(3000, () => {
    console.log(program.name + ' running at http://localhost:3000');
});

io.on('connection', (socket) => {
    socket.on('config', function (obj) {
        console.log('config', obj);
        console.log('parameters', parameters.length);
        //oscServer = new osc.Server(obj.server.port, obj.server.host);
        oscClient = new osc.Client(obj.client.host, obj.client.port);
        oscClient.send('/status', socket.id + ' connected');
        let available = [];
        for (let i = 0; i < parameters.length; i++) {
            if (parameters[i].sid === null) {
                available.push(i);
            }
        }
        console.log('available', available.length);
        if (available.length > 0) {
            // Select random from available parameters
            let randomIndex = Math.floor(Math.random() * available.length);
            //console.log('randomIndex', randomIndex);
            let parameterIndex = available[randomIndex];
            //console.log('parameterIndex', parameterIndex);
            parameters[parameterIndex].sid = socket.id;
            socket.emit('message', program['name'], parameters, parameterIndex, singleParam, singleControl, showAddress);
        } else {
            console.log('No available parameters left');
            socket.emit('status', 'No available parameters left. Try again in a minute.');
        }
        console.log('connected', socket.id);
        /*oscServer.on('message', function(msg, rinfo) {
            socket.emit('message', msg);
            console.log('Sent OSC message to WS', msg, rinfo);
        });*/
    });
    socket.on('message', function (parameterIndex, value) {
        let address = parameters[parameterIndex].address;
        let format = parameters[parameterIndex].format;
        if (format === "f") {
            value = parseFloat(value)
        } else if (format === "i") {
            value = parseInt(value)
        }
        oscClient.send(address, value);
        // Set the value on the parameter
        parameters[parameterIndex].value = value;
        // Send updated parameters to all connected users
        io.emit('value', parameterIndex, value);
        console.log('Sent OSC message to', address, value);
    });
    socket.on("disconnect", function () {
        for (let i = 0; i < parameters.length; i++) {
            if (parameters[i].sid === socket.id) {
                parameters[i].sid = null;
                console.log('disconnect', socket.id);
            }
        }
        /*if (oscServer) {
            oscServer.kill();
        }*/
    });
});
