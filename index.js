import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import osc from 'node-osc';
import fs from 'node:fs';

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://osc.test",
        methods: ["GET", "POST"]
    }
});

const readFile = (filePath) => {
    try {
        const fileData = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(fileData);
    } catch (error) {
        console.error('Error reading JSON file:', error);
        return {};
    }
};

const filePath = process.argv[2] || "programs/tweaksynth.json";
const program = readFile(filePath);
const parameters = program['parameters'];
const hideAddress = process.argv[3] === "hidden";// || program['hidden'] === true;

let oscClient;

app.get('/', (req, res) => {
    res.sendFile(new URL('./index.html', import.meta.url).pathname);
});

server.listen(3000, () => {
    console.log('server running at http://localhost:3000');
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
        // Select random from available parameters
        let randomIndex = Math.floor(Math.random() * available.length);
        console.log('randomIndex', randomIndex);
        let parameterIndex = available[randomIndex];
        console.log('parameterIndex', parameterIndex);
        parameters[parameterIndex].sid = socket.id;
        socket.emit('message', parameters, parameterIndex, hideAddress);
        console.log('connected', socket.id);
        /*oscServer.on('message', function(msg, rinfo) {
            socket.emit('message', msg);
            console.log('Sent OSC message to WS', msg, rinfo);
        });*/
    });
    socket.on('message', function (address, value, parameterIndex) {
        let format = parameters[parameterIndex]?.format;
        if (format === "f") {
            value = parseFloat(value)
        } else if (format === "i") {
            value = parseInt(value)
        }
        oscClient.send(address, value);
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
