const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Modified channel storage to include message counters and sender IDs in message history
const channelData = {
    // Format:
    // [channelUrl]: {
    //     history: [{ text, timestamp, socketId }],
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
    socket.on('joinChannel', (channelUrl) => {
        socket.join(channelUrl);
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
        if (text.length <= 300) {
            if (!channelData[channelUrl]) {
                channelData[channelUrl] = {
                    history: [],
                    count: 0
                };
            }

            // Always increment the counter
            channelData[channelUrl].count++;

            // Add sender's socketId to the message for client-side color generation
            const message = { text, timestamp, socketId: socket.id };
            channelData[channelUrl].history.push(message);
            if (channelData[channelUrl].history.length > 1000) {
                channelData[channelUrl].history.shift();
            }

            io.to(channelUrl).emit('chatMessage', { text, timestamp, socketId: socket.id });
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
        console.log(`Socket ${socket.id} disconnected`);
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
