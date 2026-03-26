const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

if (!process.env.VERCEL) {
    const envPath = path.resolve(__dirname, '.env');

    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
    }
}

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
//hello

function getTwilioClient() {
    const twilio = require('twilio');

    return twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );
}

function getFrontendBaseUrl() {
    if (process.env.FRONTEND_BASE_URL) {
        return process.env.FRONTEND_BASE_URL;
    }

    return 'https://chat-app-frontend-gamma-murex.vercel.app';
}

function buildChatLink(roomId) {
    return `${getFrontendBaseUrl()}/?room=${encodeURIComponent(roomId)}`;
}

function generateRoomId(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = crypto.randomBytes(length);

    return Array.from(bytes, (byte) => chars[byte % chars.length]).join('');
}

function createApp() {
    const app = express();

    app.use(cors());
    app.use(express.json());

    // Vercel may invoke the function with an /api prefix; normalize that so the
    // same routes work both locally and in the serverless runtime.
    app.use((req, res, next) => {
        const [pathname, query = ''] = req.url.split('?');
        const prefixes = ['/api/index', '/api'];

        for (const prefix of prefixes) {
            if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
                const strippedPath = pathname.slice(prefix.length) || '/';
                req.url = strippedPath + (query ? `?${query}` : '');
                break;
            }
        }

        next();
    });

    app.get('/', (req, res) => {
        const configError = getTwilioConfigError();

        res.send({
            success: true,
            service: 'callingwebsite',
            message: 'API is running',
            twilioConfigured: !configError,
            configError
        });
    });

    app.get('/health', (req, res) => {
        const configError = getTwilioConfigError();

        res.send({
            success: true,
            service: 'callingwebsite',
            twilioConfigured: !configError,
            configError
        });
    });

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
            ? `${message}\nRoom ID: ${finalRoomId}\nJoin the chat: ${chatLink}`
            : `Hi! Join my chat here:\nRoom ID: ${finalRoomId}\nJoin the chat: ${chatLink}`;

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

    return app;
}

const app = createApp();

app.getTwilioConfigError = getTwilioConfigError;
app.getFrontendBaseUrl = getFrontendBaseUrl;
app.buildChatLink = buildChatLink;
app.generateRoomId = generateRoomId;
app.createApp = createApp;

module.exports = app;
module.exports.default = app;
