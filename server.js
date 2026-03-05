// --- File: server.js ---

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

/* ---------- 1. Express & HTTP server ---------- */
const app = express();
const server = http.createServer(app);

/* ---------- 2. Socket.io instance ---------- */
const io = new Server(server, {
    maxHttpBufferSize: 1024, // 1kb
    cors: { origin: "*" }          // allow all origins (public server)
});

/* ---------- 2b. Optional password authentication ---------- */
const serverPassword = process.env.SERVER_PASSWORD || '';
if (serverPassword) {
    io.use((socket, next) => {
        const password = socket.handshake.auth?.password;
        if (password !== serverPassword) {
            return next(new Error('Authentication error: invalid password'));
        }
        next();
    });
    console.log('Password protection enabled.');
}

/* ---------- 3. Basic route ---------- */
app.get('/', (req, res) => {
    res.send('urlings transient chat server is running!');
});

/* ---------- 4. In‑memory channel data ---------- */
const channelData = {
    // [channelUrl]: { history: [{ text, timestamp, username, color }], count: 0 }
};

/* ---------- 5. Helper functions ---------- */
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

/* ---------- 6. Environment variables ---------- */
const args = process.argv.slice(2);
const csvStorageEnabled =
    args.some(arg => arg === '--csvStorage') ||
    !!process.env.npm_config_csvStorage ||
    process.env.CSV_STORAGE === 'true' ||
    process.env.CSV_STORAGE === '1';

const privacyMode = process.env.PRIVACY_MODE === '1' || process.env.PRIVACY_MODE === 'true';

// Rate limiting: messages per minute (0 or undefined = no limit)
const rateLimit = parseInt(process.env.RATE_LIMIT, 10) || 0;

// Per‑channel message limit (default 1000)
const MAX_MESSAGES_PER_CHANNEL = parseInt(process.env.MAX_MESSAGES, 10) || 1000;

// Total channel limit (default 10000)
const MAX_CHANNELS_TOTAL = parseInt(process.env.MAX_CHANNELS, 10) || 10000;

console.log('CSV storage enabled:', csvStorageEnabled);
console.log('Privacy mode:', privacyMode);
console.log('Rate limit (msgs/min):', rateLimit || 'unlimited');
console.log('Max messages per channel:', MAX_MESSAGES_PER_CHANNEL);
console.log('Max total channels:', MAX_CHANNELS_TOTAL);

/* ---------- 7. CSV helpers ---------- */
function escapeCsvField(field) {
    if (field == null) return '';
    const str = String(field);
    if (/[\",\\n]/.test(str)) {
        return '\"' + str.replace(/\"/g, '\"\"') + '\"';
    }
    return str;
}

function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '\"') {
            if (inQuotes && line[i + 1] === '\"') {
                current += '\"';
                i++; // skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

/* ---------- 8. CSV storage setup & loading (with timestamp sorting) ---------- */
let dataDir = null;
if (csvStorageEnabled) {
    dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir);
    }

    // Collect all messages from all CSV files
    const allMessages = []; // { channelUrl, timestamp, username, color, text }

    const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv'));
    files.forEach(file => {
        const filePath = path.join(dataDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split(/\r?\n/);
        lines.forEach(line => {
            if (!line.trim()) return;
            const fields = parseCsvLine(line);
            // Expected order: channelUrl, timestamp, username, color, text, socketId, ip
            if (fields.length < 5) return; // skip malformed lines
            const [channelUrl, timestamp, username, color, text] = fields;
            allMessages.push({ channelUrl, timestamp, username, color, text });
        });
    });

    // Sort by timestamp (oldest first) and populate channelData
    allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    allMessages.forEach(({ channelUrl, timestamp, username, color, text }) => {
        if (!channelData[channelUrl]) {
            channelData[channelUrl] = { history: [], count: 0 };
        }
        const message = { text, timestamp, username, color };
        channelData[channelUrl].history.push(message);
        if (channelData[channelUrl].history.length > MAX_MESSAGES_PER_CHANNEL) {
            channelData[channelUrl].history.shift();
        }
        channelData[channelUrl].count++;
    });
}

/* ---------- 9. Asynchronous CSV write queue ---------- */
let csvWriteQueue = [];
let isWriting = false;

function queueCsvWrite(line) {
    if (!csvStorageEnabled) return;
    csvWriteQueue.push(line);
    if (!isWriting) {
        processNextCsvWrite();
    }
}

function processNextCsvWrite() {
    if (csvWriteQueue.length === 0) {
        isWriting = false;
        return;
    }
    isWriting = true;
    const line = csvWriteQueue.shift();
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filePath = path.join(dataDir, `${today}.csv`);
    fs.appendFile(filePath, line, err => {
        if (err) console.error('CSV write error:', err);
        processNextCsvWrite();
    });
}

/* ---------- 10. Input sanitization ---------- */
function sanitizeColor(color) {
    if (!color) return null;
    const trimmed = color.trim();

    // Allow HSL format: hsl(120, 50%, 90%)
    const hslRegex = /^hsl\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%\s*\)$/i;
    if (hslRegex.test(trimmed)) {
        return trimmed; // already a valid CSS HSL string
    }

    // Allow hex 3 or 6 digits, with or without leading #
    if (/^#?[0-9A-Fa-f]{6}$/.test(trimmed) || /^#?[0-9A-Fa-f]{3}$/.test(trimmed)) {
        // Ensure it starts with #
        return trimmed.startsWith('#') ? trimmed : '#' + trimmed;
    }

    // Optionally allow a few basic CSS color names
    const basicColors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'brown', 'black', 'white', 'gray'];
    if (basicColors.includes(trimmed.toLowerCase())) {
        return trimmed.toLowerCase();
    }

    return null; // invalid
}

function sanitizeUsername(username) {
    if (!username) return null;
    // Trim and allow letters, numbers, spaces, underscores, hyphens; max 12 chars
    const cleaned = username.trim().replace(/[^\w\s\-]/g, ''); // remove unwanted chars
    if (cleaned.length > 0 && cleaned.length <= 12) {
        return cleaned;
    }
    return null;
}

/* ---------- 11. Rate limiting ---------- */
const messageTimestamps = new Map(); // socketId -> array of timestamps (ms)

function isRateLimited(socketId) {
    if (rateLimit <= 0) return false; // unlimited
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    let timestamps = messageTimestamps.get(socketId) || [];
    // Remove timestamps older than 1 minute
    timestamps = timestamps.filter(ts => now - ts < windowMs);
    if (timestamps.length >= rateLimit) {
        return true; // rate limited
    }
    // Add current timestamp and store back
    timestamps.push(now);
    messageTimestamps.set(socketId, timestamps);
    return false;
}

// Clean up rate limit map periodically (every 5 minutes)
setInterval(() => {
    const now = Date.now();
    const windowMs = 60 * 1000;
    for (let [socketId, timestamps] of messageTimestamps.entries()) {
        timestamps = timestamps.filter(ts => now - ts < windowMs);
        if (timestamps.length === 0) {
            messageTimestamps.delete(socketId);
        } else {
            messageTimestamps.set(socketId, timestamps);
        }
    }
}, 5 * 60 * 1000);

/* ---------- 12. Socket.io event handling ---------- */
io.on('connection', socket => {
    console.log(`[${new Date().toISOString()}] Socket ${socket.id} connected.`);

    // Default identity
    socket.defaultUsername = getDefaultUsername();
    socket.username = socket.defaultUsername;
    socket.defaultColor = getColorFromSocketId(socket.id);
    socket.color = socket.defaultColor;

    /* Helper: check if a new channel can be created */
    function canCreateChannel() {
        return Object.keys(channelData).length < MAX_CHANNELS_TOTAL;
    }

    /* Join channel */
    socket.on('joinChannel', channelUrl => {
        // Limit channel URL length to avoid abuse
        if (channelUrl.length > 200) {
            socket.emit('error', 'Channel URL too long');
            return;
        }

        // If channel doesn't exist, check if we can create a new one
        if (!channelData[channelUrl] && !canCreateChannel()) {
            socket.emit('error', 'Server has reached maximum number of channels. Cannot join new channel.');
            return;
        }

        socket.join(channelUrl);
        if (!channelData[channelUrl]) {
            channelData[channelUrl] = { history: [], count: 0 };
        }
        socket.emit('channelHistory', channelData[channelUrl].history);
        console.log(`[${new Date().toISOString()}] Socket ${socket.id} joined channel: ${channelUrl}`);
    });

    /* Send chat message */
    socket.on('chatMessage', data => {
        const { channelUrl, text, customEnabled } = data;

        // Basic checks
        if (!channelUrl || channelUrl.length > 200) return;
        if (!text || text.length > 300) return;

        // If channel doesn't exist, check if we can create it
        if (!channelData[channelUrl] && !canCreateChannel()) {
            socket.emit('error', 'Server has reached maximum number of channels. Cannot send message.');
            return;
        }

        // Rate limiting
        if (isRateLimited(socket.id)) {
            socket.emit('error', 'Rate limit exceeded. Please wait.');
            return;
        }

        const timestamp = new Date().toISOString();

        if (!channelData[channelUrl]) {
            channelData[channelUrl] = { history: [], count: 0 };
        }
        channelData[channelUrl].count++;

        // Identity handling with sanitization
        if (customEnabled) {
            if (data.username) {
                const cleanUsername = sanitizeUsername(data.username);
                if (cleanUsername) socket.username = cleanUsername;
            }
            if (data.color) {
                const cleanColor = sanitizeColor(data.color);
                if (cleanColor) socket.color = cleanColor;
            }
        } else {
            socket.username = socket.defaultUsername;
            socket.color = socket.defaultColor;
        }

        const message = { text, timestamp, username: socket.username, color: socket.color };
        channelData[channelUrl].history.push(message);
        if (channelData[channelUrl].history.length > MAX_MESSAGES_PER_CHANNEL) {
            channelData[channelUrl].history.shift();
        }

        io.to(channelUrl).emit('chatMessage', message);
        console.log(`[${timestamp}] [Channel: ${channelUrl}] ${socket.username} (${socket.id}) says: ${text}`);

        /* Append to CSV asynchronously */
        if (csvStorageEnabled) {
            const ip = privacyMode ? 'redacted' : (socket.handshake.address || 'unknown');
            const socketId = privacyMode ? 'redacted' : socket.id;
            const csvLine = [
                escapeCsvField(channelUrl),
                escapeCsvField(timestamp),
                escapeCsvField(socket.username),
                escapeCsvField(socket.color),
                escapeCsvField(text),
                escapeCsvField(socketId),
                escapeCsvField(ip)
            ].join(',') + '\n';
            queueCsvWrite(csvLine);
        }
    });

    /* Top channels request */
    socket.on('getTopChannels', () => {
        const channels = Object.keys(channelData);
        const sorted = channels.sort((a, b) => channelData[b].count - channelData[a].count);
        const top = sorted.slice(0, 50).map(ch => ({
            channel: ch,
            count: channelData[ch].count
        }));
        socket.emit('topChannels', top);
    });

    /* Disconnect */
    socket.on('disconnect', () => {
        console.log(`[${new Date().toISOString()}] Socket ${socket.id} disconnected.`);
        // Rate limit cleanup is handled periodically, but we can also remove immediately
        messageTimestamps.delete(socket.id);
    });
});

/* ---------- 13. Start server ---------- */
const port = process.env.PORT || 5300;
server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});

