const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// In-memory storage for channel history
const channelHistory = {};

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

// Simple landing page
app.get('/', (req, res) => {
    res.send('urlings ephemeral chat server is running!');
});

// Endpoint to return the top 5 channels by message count
app.get('/api/topchannels', (req, res) => {
    const channels = Object.keys(channelHistory).map(channelUrl => ({
        name: channelUrl,
        messageCount: channelHistory[channelUrl].length,
        urling: channelUrl
    }));
    channels.sort((a, b) => b.messageCount - a.messageCount);
    const topChannels = channels.slice(0, 5);
    res.json(topChannels);
});

io.on('connection', (socket) => {
    socket.on('joinChannel', (channelUrl) => {
        socket.join(channelUrl);
        console.log(`Socket ${socket.id} joined channel: ${channelUrl}`);
        // Emit history for this channel (if any)
        if (channelHistory[channelUrl]) {
            socket.emit('channelHistory', channelHistory[channelUrl]);
        }
    });

    socket.on('chatMessage', ({ channelUrl, text }) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${channelUrl}: ${text}`);
        if (text.length <= 30) {
            // Save message in history
            if (!channelHistory[channelUrl]) {
                channelHistory[channelUrl] = [];
            }
            const message = { text, timestamp };
            channelHistory[channelUrl].push(message);
            // Optionally limit history to last 50 messages
            if (channelHistory[channelUrl].length > 50) {
                channelHistory[channelUrl].shift();
            }
            io.to(channelUrl).emit('chatMessage', { text, timestamp });
        }
    });

    socket.on('disconnect', () => {
        console.log(`Socket ${socket.id} disconnected`);
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
