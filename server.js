/**
 * server.js
 * 
 *  - Maintains up to 100 messages per channel in memory.
 *  - Enforces a 10MB total message limit across all channels.
 *  - On join, sends the existing channel backlog (for minimal history).
 *  - Ignores or disconnects clients if they send messages > 30 chars.
 *    (shown below as "ignore" for demonstration).
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// 10MB global limit
const MAX_GLOBAL_BYTES = 10 * 1024 * 1024;

// Data structures
// ===============
// channelMap: { [channelUrl]: Array of message objects }
// message objects: { text, size, timestamp, ... }
// globalMessages: array of all message objects in chronological order (for easy eviction)
let channelMap = {};
let globalMessages = [];
let totalBytesUsed = 0;

app.get('/', (req, res) => {
  res.send('urlings ephemeral chat server is running (with in-memory history)!');
});

io.on('connection', (socket) => {

  socket.on('joinChannel', (channelUrl) => {
    socket.join(channelUrl);
    console.log(`Socket ${socket.id} joined channel: ${channelUrl}`);

    // 1) If channel has a backlog, send it to this socket
    if (channelMap[channelUrl]) {
      // We'll emit an event 'channelHistory' with an array of messages
      // The client can decide how to display them
      socket.emit('channelHistory', channelMap[channelUrl].map(msg => ({
        text: msg.text,
        timestamp: msg.timestamp
      })));
    }
  });

  socket.on('chatMessage', ({ channelUrl, text }) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Attempting message in ${channelUrl}: "${text}"`);

    // 2) Enforce 30-char max
    if (!text || typeof text !== 'string' || text.length > 30) {
      console.log(` -> Rejected message from ${socket.id} (too long).`);
      socket.disconnect(true);
      return;
    }

    // 3) Measure size in bytes (UTF-8)
    let size = Buffer.byteLength(text, 'utf8');

    // 4) Store the message in memory
    const messageObj = {
      text, 
      size,
      timestamp
    };

    // Ensure channel array exists
    if (!channelMap[channelUrl]) {
      channelMap[channelUrl] = [];
    }

    // Push to the channel's array
    channelMap[channelUrl].push(messageObj);

    // If channel exceeds 100 messages, remove the oldest
    while (channelMap[channelUrl].length > 100) {
      const removed = channelMap[channelUrl].shift();
      removeFromGlobal(removed);
    }

    // Add to globalMessages
    globalMessages.push({ channelUrl, ...messageObj });

    // Increase total usage
    totalBytesUsed += size;

    // 5) Evict older messages if over 10MB globally
    while (totalBytesUsed > MAX_GLOBAL_BYTES && globalMessages.length > 0) {
      const oldest = globalMessages.shift(); 
      // oldest = { channelUrl, text, size, timestamp }

      // remove from channelMap for that channel
      if (channelMap[oldest.channelUrl]) {
        const arr = channelMap[oldest.channelUrl];
        // find the matching object by timestamp & text
        const idx = arr.findIndex(m => m.timestamp === oldest.timestamp && m.text === oldest.text);
        if (idx !== -1) {
          arr.splice(idx, 1);
        }
      }

      totalBytesUsed -= oldest.size;
      console.log(` -> Evicted an old message (size: ${oldest.size}) to keep under 10MB.`);
    }

    // 6) Broadcast this message to the channel
    console.log(`[${timestamp}] ${channelUrl}: "${text}" (size: ${size} bytes)`);
    io.to(channelUrl).emit('chatMessage', { text, timestamp });
  });

  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`);
  });
});

// Helper function to remove a single message from globalMessages & totalBytes
function removeFromGlobal(msgObj) {
  let idx = globalMessages.findIndex(m => m.timestamp === msgObj.timestamp && m.text === msgObj.text);
  if (idx !== -1) {
    globalMessages.splice(idx, 1);
  }
  totalBytesUsed -= msgObj.size;
}

// Start server
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
