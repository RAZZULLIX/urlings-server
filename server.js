/**
 * server.js
 *
 * A minimal ephemeral chat server using Express + Socket.IO.
 * Everyone in the same "channelUrl" sees each other's messages.
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

// Serve a simple landing page (optional)
app.get('/', (req, res) => {
  res.send('urlings ephemeral chat server is running!');
});

// Socket.IO ephemeral chat logic
io.on('connection', (socket) => {

  socket.on('joinChannel', (channelUrl) => {
    socket.join(channelUrl);
    console.log(`Socket ${socket.id} joined channel: ${channelUrl}`);
  });

  socket.on('chatMessage', ({ channelUrl, text }) => {
    // Broadcast to everyone (including sender) in that channel
    io.to(channelUrl).emit('chatMessage', { text });
  });

  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`);
  });
});

// Start on port 3000 (local) or environment port
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
