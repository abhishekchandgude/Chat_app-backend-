const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.on('connection', (socket) => {
    console.log('New user connected:', socket.id);

    socket.on('join_room', (room) => {
        socket.join(room);
        console.log(`User ${socket.id} joined room ${room}`);
    });

    socket.on('send_message', (data) => {
        socket.to(data.room).emit('receive_message', data);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    const configError = app.getTwilioConfigError();
    console.log(`Server running on port ${PORT}`);
    console.log(`Frontend base URL: ${app.getFrontendBaseUrl()}`);

    if (configError) {
        console.warn(`Twilio configuration issue: ${configError}`);
    }
});

module.exports = app;
