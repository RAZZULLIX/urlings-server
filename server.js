const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Channel storage: history includes messages with text, timestamp, username, and color.
const channelData = {
    // Format:
    // [channelUrl]: {
    //     history: [{ text, timestamp, username, color }],
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

function getDefaultUsername() {
    const animals = ["tiger", "elephant", "monkey", "lion", "panda", "koala", "zebra", "giraffe"];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    const number = ("0" + Math.floor(Math.random() * 100)).slice(-2);
    return animal + number;
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

    // Save default identity on connection
    socket.defaultUsername = getDefaultUsername();
    socket.username = socket.defaultUsername;
    socket.defaultColor = getColorFromSocketId(socket.id);
    socket.color = socket.defaultColor;

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

    socket.on('chatMessage', (data) => {
        const { channelUrl, text, customEnabled } = data;
        const timestamp = new Date().toISOString();
        if (text.length <= 300) {
            if (!channelData[channelUrl]) {
                channelData[channelUrl] = {
                    history: [],
                    count: 0
                };
            }
            channelData[channelUrl].count++;

            if (customEnabled) {
                // Use the provided custom identity if valid
                if (data.username && data.username.trim().length > 0 && data.username.trim().length <= 12) {
                    socket.username = data.username.trim();
                }
                if (data.color && data.color.trim().length > 0) {
                    socket.color = data.color.trim();
                }
            } else {
                // Revert to the default identity if custom identity is disabled
                socket.username = socket.defaultUsername;
                socket.color = socket.defaultColor;
            }

            const message = { text, timestamp, username: socket.username, color: socket.color };
            channelData[channelUrl].history.push(message);
            if (channelData[channelUrl].history.length > 1000) {
                channelData[channelUrl].history.shift();
            }
            io.to(channelUrl).emit('chatMessage', message);
            console.log(`[${timestamp}] [Channel: ${channelUrl}] ${socket.username} (${socket.id}) says: ${text}`);
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
