const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Modified channel storage to include message counters
const channelData = {
    // Format:
    // [channelUrl]: {
    //     history: [],
    //     count: 0
    // }
};

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

app.get('/', (req, res) => {
    res.send('urlings ephemeral chat server is running!');
});

io.on('connection', (socket) => {
    console.log(`[${new Date().toISOString()}] Socket ${socket.id} connected`);

    socket.on('joinChannel', (channelUrl) => {
        socket.join(channelUrl);
        console.log(`[${new Date().toISOString()}] Socket ${socket.id} joined channel ${channelUrl}`);
        if (!channelData[channelUrl]) {
            channelData[channelUrl] = {
                history: [],
                count: 0
            };
        }
        socket.emit('channelHistory', channelData[channelUrl].history);
    });

    socket.on('chatMessage', ({ channelUrl, text }) => {
        const timestamp = new Date().toISOString();
        if (text.length <= 30) {
            if (!channelData[channelUrl]) {
                channelData[channelUrl] = {
                    history: [],
                    count: 0
                };
            }

            // Always increment the counter
            channelData[channelUrl].count++;

            // Create message and add to history (limit history to 1000 messages)
            const message = { text, timestamp };
            channelData[channelUrl].history.push(message);
            if (channelData[channelUrl].history.length > 1000) {
                channelData[channelUrl].history.shift();
            }

            // Log the chat message with timestamp and socket ID
            console.log(`[${timestamp}] Chat message from socket ${socket.id} on channel ${channelUrl}: ${text}`);

            io.to(channelUrl).emit('chatMessage', { text, timestamp });
        }
    });

    socket.on('getTopChannels', () => {
        const channels = Object.keys(channelData);
        const sortedChannels = channels.sort((a, b) => {
            return channelData[b].count - channelData[a].count;
        });

        const topChannels = sortedChannels.slice(0, 5).map(ch => ({
            channel: ch,
            count: channelData[ch].count
        }));

        socket.emit('topChannels', topChannels);
    });

    socket.on('disconnect', () => {
        console.log(`[${new Date().toISOString()}] Socket ${socket.id} disconnected`);
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`[${new Date().toISOString()}] Server running on http://localhost:${port}`);
});
