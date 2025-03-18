const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Modified channel storage to include message counters and sender color in message history
const channelData = {
    // Format:
    // [channelUrl]: {
    //     history: [{ text, timestamp, color }],
    //     count: 0
    // }
};

function getColorFromSocketId(socketId) {
    let hash = 0;
    for (let i = 0; i < socketId.length; i++) {
        hash = socketId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 50%, 90%)`;
}

const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

app.get('/', (req, res) => {
    res.send('urlings ephemeral chat server is running!');
});

io.on('connection', (socket) => {

    console.log(`[${new Date().toISOString()}] Socket ${socket.id} connected.`);
    socket.on('joinChannel', (channelUrl) => {
        socket.join(channelUrl);
        if (!channelData[channelUrl]) {
            channelData[channelUrl] = {
                history: [],
                count: 0
            };
        }
        socket.emit('channelHistory', channelData[channelUrl].history);

        console.log(`[${new Date().toISOString()}] Socket ${socket.id} joined channel: ${channelUrl}`);

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

            // Increment the message counter
            channelData[channelUrl].count++;

            // Compute color based on the socket id and include it in the message
            const color = getColorFromSocketId(socket.id);
            const message = { text, timestamp, color };
            channelData[channelUrl].history.push(message);
            if (channelData[channelUrl].history.length > 1000) {
                channelData[channelUrl].history.shift();
            }

            io.to(channelUrl).emit('chatMessage', { text, timestamp, color });

            console.log(`[${timestamp}] [Channel: ${channelUrl}] Socket ${socket.id} says: ${text}`);
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
        console.log(`[${new Date().toISOString()}] Socket ${socket.id} disconnected.`);
    });
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
