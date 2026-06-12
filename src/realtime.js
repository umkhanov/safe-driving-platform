const jwt = require('jsonwebtoken');

function authenticateSocket(socket, next) {
  const token = socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('missing token'));
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = user;
    socket.join(`user:${user.id}`);
    if (user.role === 'admin') socket.join('admins');
    return next();
  } catch {
    return next(new Error('invalid token'));
  }
}

function attachSocketServer(httpServer) {
  const { Server } = require('socket.io');
  const io = new Server(httpServer, { cors: { origin: '*' } });
  io.use(authenticateSocket);
  io.on('connection', (socket) => {
    socket.emit('hello', { userId: socket.user.id, role: socket.user.role });
  });
  return {
    io,
    emit: (event, payload, rooms) => {
      if (Array.isArray(rooms)) {
        let target = io;
        for (const r of rooms) target = target.to(r);
        target.emit(event, payload);
      } else if (rooms) {
        io.to(rooms).emit(event, payload);
      } else {
        io.emit(event, payload);
      }
    },
  };
}

module.exports = { authenticateSocket, attachSocketServer };
