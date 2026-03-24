const { createApp, getTwilioConfigError, getFrontendBaseUrl } = require('./app');

const app = createApp();

if (process.env.VERCEL) {
    module.exports = app;
} else {
    const http = require('http');           // for WebSocket
    const { Server } = require('socket.io'); // Socket.IO

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

    module.exports = app;
}
