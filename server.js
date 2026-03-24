require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const http = require('http');           // for WebSocket
const { Server } = require('socket.io'); // Socket.IO
const cors = require('cors');
const twilio = require('twilio');

const app = express();
app.use(cors());
app.use(express.json());

// Twilio config helpers
function getTwilioConfigError() {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
        return 'Missing Twilio environment variables';
    }

    if (!TWILIO_ACCOUNT_SID.startsWith('AC')) {
        return 'TWILIO_ACCOUNT_SID must start with AC';
    }

    if (!TWILIO_PHONE_NUMBER.startsWith('+')) {
        return 'TWILIO_PHONE_NUMBER must be in E.164 format, e.g., +14155552671';
    }

    return null;
}

function getTwilioClient() {
    return twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );
}

function getFrontendBaseUrl() {
    return process.env.FRONTEND_BASE_URL || 'http://localhost:5173';
}

function buildChatLink(roomId) {
    return `${getFrontendBaseUrl()}/?room=${encodeURIComponent(roomId)}`;
}

function generateRoomId(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = crypto.randomBytes(length);

    return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
}

// Health check endpoint
app.get('/health', (req, res) => {
    const configError = getTwilioConfigError();

    res.send({
        success: true,
        service: 'callingwebsite',
        twilioConfigured: !configError,
        configError
    });
});

// API to send message
app.post('/send-message', async (req, res) => {
    const { phone, message } = req.body;

    if (!phone || !message) {
        return res.status(400).send({ error: 'Phone and message are required' });
    }

    const configError = getTwilioConfigError();
    if (configError) {
        return res.status(500).send({ error: configError });
    }

    try {
        const client = getTwilioClient();
        const sms = await client.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });

        res.send({ success: true, sid: sms.sid });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.message });
    }
});

// API to send chat link
app.post('/send-link', async (req, res) => {
    const { phone, roomId, message } = req.body;

    if (!phone) {
        return res.status(400).send({ error: 'Phone is required' });
    }

    const configError = getTwilioConfigError();
    if (configError) {
        return res.status(500).send({ error: configError });
    }

    const finalRoomId = roomId || generateRoomId();
    const chatLink = buildChatLink(finalRoomId);
    const smsBody = message
        ? `${message}\n${chatLink}`
        : `Hi! Join my chat here: ${chatLink}`;

    try {
        const client = getTwilioClient();
        const sms = await client.messages.create({
            body: smsBody,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });

        res.send({
            success: true,
            sid: sms.sid,
            roomId: finalRoomId,
            link: chatLink
        });
    } catch (err) {
        console.error(err);
        res.status(500).send({ error: err.message });
    }
});

// ----------------- WebSocket / Socket.IO Setup -----------------
const server = http.createServer(app);  // wrap express in HTTP server
const io = new Server(server, { cors: { origin: "*" } }); // allow all origins

io.on("connection", (socket) => {
    console.log("New user connected:", socket.id);

    // Join a chat room
    socket.on("join_room", (room) => {
        socket.join(room);
        console.log(`User ${socket.id} joined room ${room}`);
    });

    // Listen for sending messages
    socket.on("send_message", (data) => {
        // data = { room: 'abc123', message: 'Hello', sender: 'John' }
        socket.to(data.room).emit("receive_message", data); // send to everyone except sender
    });

    socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    const configError = getTwilioConfigError();
    console.log(`Server running on port ${PORT}`);
    console.log(`Frontend base URL: ${getFrontendBaseUrl()}`);

    if (configError) {
        console.warn(`Twilio configuration issue: ${configError}`);
    }
});
