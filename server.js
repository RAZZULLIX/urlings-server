const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// In-memory storage for message history per channel
const channelHistory = {};

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

// Simple landing page (optional)
app.get('/', (req, res) => {
    res.send('urlings ephemeral chat server is running!');
});

io.on('connection', (socket) => {
    socket.on('joinChannel', (channelUrl) => {
        socket.join(channelUrl);
        console.log(`Socket ${socket.id} joined channel: ${channelUrl}`);
        // Emit the stored history for this channel, if any.
        if (channelHistory[channelUrl]) {
            socket.emit('channelHistory', channelHistory[channelUrl]);
        }
    });

    socket.on('chatMessage', ({ channelUrl, text }) => {
        // Generate the timestamp (ISO format) on the server.
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${channelUrl}: ${text}`);

        // Only echo back if it's ≤ 30 chars
        if (text.length <= 30) {
            // Save message in the channel's history
            if (!channelHistory[channelUrl]) {
                channelHistory[channelUrl] = [];
            }
            const message = { text, timestamp };
            channelHistory[channelUrl].push(message);
            // Optionally, limit history to the last 50 messages.
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

// Start server on Render or local port 3000
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
