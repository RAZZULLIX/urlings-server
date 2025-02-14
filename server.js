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

    // Handle request for top channels
    socket.on('getTopChannels', () => {
        const channels = Object.keys(channelHistory);
        const sortedChannels = channels.sort((a, b) => {
            const countA = channelHistory[a] ? channelHistory[a].length : 0;
            const countB = channelHistory[b] ? channelHistory[b].length : 0;
            return countB - countA;
        });
        const topChannels = sortedChannels.slice(0, 5).map(ch => ({
            channel: ch,
            count: channelHistory[ch] ? channelHistory[ch].length : 0
        }));
        socket.emit('topChannels', topChannels);
    });

    socket.on('disconnect', () => {
        console.log(`Socket ${socket.id} disconnected`);
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
