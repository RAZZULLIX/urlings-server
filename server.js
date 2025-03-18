const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const channelData = {};

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

app.get('/', (req, res) => {
    res.send('Urlinks ephemeral chat server is running!');
});

io.on('connection', (socket) => {
    console.log(`[${new Date().toISOString()}] Socket ${socket.id} connected.`);

    socket.on('joinChannel', (channelUrl) => {
        socket.join(channelUrl);

        if (!channelData[channelUrl]) {
            channelData[channelUrl] = {
                history: [],
                count: 0
            };
        }

        console.log(`[${new Date().toISOString()}] Socket ${socket.id} joined channel: ${channelUrl}`);
        socket.emit('channelHistory', channelData[channelUrl].history);
    });

    socket.on('chatMessage', ({ channelUrl, text }) => {
        const timestamp = new Date().toISOString();

        if (text.length <= 300) {
            if (!channelData[channelUrl]) {
                channelData[channelUrl] = {
                    history: [],
                    count: 0
                };
            }

            channelData[channelUrl].count++;

            const message = { text, timestamp, socketId: socket.id };
            channelData[channelUrl].history.push(message);

            if (channelData[channelUrl].history.length > 1000) {
                channelData[channelUrl].history.shift();
            }

            console.log(`[${timestamp}] [Channel: ${channelUrl}] Socket ${socket.id} says: ${text}`);

            io.to(channelUrl).emit('chatMessage', message);
        }
    });

    socket.on('getTopChannels', () => {
        const channels = Object.keys(channelData);
        const sortedChannels = channels.sort((a, b) => channelData[b].count - channelData[a].count);

        const topChannels = sortedChannels.slice(0, 5).map(ch => ({
            channel: ch,
            count: channelData[ch].count
        }));

        socket.emit('topChannels', topChannels);
    });

    socket.on('disconnect', () => {
        console.log(`[${new Date().toISOString()}] Socket ${socket.id} disconnected.`);
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
