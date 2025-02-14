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
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${channelUrl}: ${text}`);
    if (text.length <= 30) {
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
