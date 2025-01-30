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

// We'll just serve a small landing page so we know it's running
app.get('/', (req, res) => {
    res.send('urlings ephemeral chat server is running!');
});

// This is the ephemeral chat logic
io.on('connection', (socket) => {

    // Client tells us which channel (URL) to join
    socket.on('joinChannel', (channelUrl) => {
        socket.join(channelUrl);
        console.log(`Socket ${socket.id} joined channel: ${channelUrl}`);
    });

    // When a client sends a "chatMessage", broadcast it to everyone in the same channel
    socket.on('chatMessage', ({ channelUrl, text }) => {
        // Send to everyone (including sender) in that channel
        io.to(channelUrl).emit('chatMessage', { text });
    });

    socket.on('disconnect', () => {
        console.log(`Socket ${socket.id} disconnected`);
    });
});

// Start server on the port that Render will provide, or 3000 locally
const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
