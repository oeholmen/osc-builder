import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import osc from 'node-osc';

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://osc.test",
        methods: ["GET", "POST"]
    }
});

let oscServer, oscClient;

app.get('/', (req, res) => {
    res.sendFile(new URL('./index.html', import.meta.url).pathname);
});

server.listen(3000, () => {
    console.log('server running at http://localhost:3000');
});

io.on('connection', (socket) => {
    socket.on('config', function (obj) {
        console.log('config', obj);
        oscServer = new osc.Server(obj.server.port, obj.server.host);
        oscClient = new osc.Client(obj.client.host, obj.client.port);

        oscClient.send('/status', socket.id + ' connected');

        oscServer.on('message', function(msg, rinfo) {
            socket.emit('message', msg);
            console.log('Sent OSC message to WS', msg, rinfo);
        });
    });
    socket.on('message', function (address, arg) {
        oscClient.send(address, arg);
        console.log('sent WS message to OSC', address, arg);
    });
    socket.on("disconnect", function () {
        if (oscServer) {
            oscServer.kill();
        }
    });
});
