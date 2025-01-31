/**
 * server.js
 *
 * Minimal ephemeral chat server w/ the following changes:
 *  - Logs messages to the console as "[timestamp] channel: message".
 *  - Only echoes back messages of 30 chars or less.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
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
    });

    socket.on('chatMessage', ({ channelUrl, text }) => {
        // 1) Log the message in the format: "[timestamp] channel: message"
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${channelUrl}: ${text}`);

        // 2) Only echo back if it's ≤ 30 chars
        if (text.length <= 30) {
            io.to(channelUrl).emit('chatMessage', { text });
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
