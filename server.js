const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { ExpressPeerServer } = require('peer');

// PeerJS Server
const peerServer = ExpressPeerServer(http, {
  debug: true,
  path: '/peerjs'
});
app.use('/peerjs', peerServer);

// Serve static files
app.use(express.static('public'));

// Room storage
const rooms = new Map();
const callIds = new Map();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io connection
io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUser = null;

  // Room creation and joining
  socket.on('create-room', (driveUrl) => {
    const roomId = uuidv4().substring(0, 8);
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    
    rooms.set(roomId, {
      driveUrl,
      pin,
      admin: socket.id,
      users: new Map([[socket.id, { id: socket.id, name: 'Admin', isAdmin: true }]]),
      playbackState: { isPlaying: false, currentTime: 0 }
    });
    
    currentRoom = roomId;
    currentUser = { id: socket.id, name: 'Admin', isAdmin: true };
    socket.join(roomId);
    
    socket.emit('room-created', { roomId, pin });
  });

  socket.on('join-room', ({ roomId, pin, username }) => {
    if (!rooms.has(roomId)) {
      socket.emit('invalid-room');
      return;
    }
    
    const room = rooms.get(roomId);
    if (room.pin !== pin) {
      socket.emit('invalid-pin');
      return;
    }
    
    currentRoom = roomId;
    currentUser = { id: socket.id, name: username, isAdmin: false };
    room.users.set(socket.id, currentUser);
    socket.join(roomId);
    
    socket.emit('room-joined', { 
      roomId, 
      driveUrl: room.driveUrl,
      isAdmin: false,
      users: Array.from(room.users.values()),
      playbackState: room.playbackState
    });
    
    socket.to(roomId).emit('user-joined', currentUser);
    io.to(roomId).emit('update-users', Array.from(room.users.values()));
  });

  // Video sync
  socket.on('sync', (data) => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      if (room.admin === socket.id) {
        room.playbackState = {
          isPlaying: data.action === 'play',
          currentTime: data.time
        };
        socket.to(currentRoom).emit('sync', data);
      }
    }
  });

  // Call functionality
  socket.on('register-call-id', ({ userId }) => {
    if (currentRoom) {
      if (!callIds.has(currentRoom)) {
        callIds.set(currentRoom, []);
      }
      callIds.get(currentRoom).push(userId);
    }
  });

  socket.on('request-call-ids', () => {
    if (currentRoom) {
      socket.emit('call-ids', callIds.get(currentRoom) || []);
    }
  });

  // Chat
  socket.on('chat-message', (message) => {
    if (currentRoom && currentUser) {
      io.to(currentRoom).emit('chat-message', {
        user: currentUser,
        message,
        timestamp: new Date().toLocaleTimeString()
      });
    }
  });

  // Disconnection
  socket.on('disconnect', () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.users.delete(socket.id);
      
      // Clean up call IDs
      if (callIds.has(currentRoom)) {
        callIds.set(currentRoom, 
          callIds.get(currentRoom).filter(id => id !== socket.id));
      }

      // Admin reassignment
      if (room.admin === socket.id && room.users.size > 0) {
        const newAdmin = room.users.values().next().value;
        newAdmin.isAdmin = true;
        room.admin = newAdmin.id;
        io.to(newAdmin.id).emit('promoted-to-admin');
      }

      io.to(currentRoom).emit('user-left', socket.id);
      io.to(currentRoom).emit('update-users', Array.from(room.users.values()));
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});