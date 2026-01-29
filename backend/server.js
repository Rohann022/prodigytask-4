const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const socketIO = require('socket.io');
const multer = require('multer');
const { Readable } = require('stream');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 10e6 // 10MB for file uploads
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://deepvanjari:deepbhai94@cluster0.2fdbx.mongodb.net/?appName=Cluster0';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('🛢️  Connected to MongoDB');
    initGridFS(mongoose.connection);
  })
  .catch((err) => console.error('MongoDB connection failed →', err));

// Import models and config
const Message = require('./models/Message');
const { initGridFS, getGridFSBucket, isFileAllowed, getFileCategory, MAX_FILE_SIZE } = require('./config/gridfs');

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (isFileAllowed(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const token = req.headers['x-auth'];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const bucket = getGridFSBucket();
    const filename = `${Date.now()}-${req.file.originalname}`;
    
    const readableStream = Readable.from(req.file.buffer);
    const uploadStream = bucket.openUploadStream(filename, {
      metadata: {
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        category: getFileCategory(req.file.mimetype)
      }
    });

    readableStream.pipe(uploadStream);

    uploadStream.on('finish', () => {
      res.json({
        fileId: uploadStream.id,
        filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        category: getFileCategory(req.file.mimetype),
        url: `/api/files/${uploadStream.id}`
      });
    });

    uploadStream.on('error', (error) => {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'File upload failed' });
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// File download endpoint
app.get('/api/files/:fileId', async (req, res) => {
  try {
    const bucket = getGridFSBucket();
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    
    const files = await bucket.find({ _id: fileId }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];
    res.set('Content-Type', file.metadata.mimetype);
    res.set('Content-Disposition', `inline; filename="${file.metadata.originalName}"`);
    
    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.pipe(res);

    downloadStream.on('error', (error) => {
      console.error('Download error:', error);
      res.status(500).json({ error: 'File download failed' });
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Invalid file ID' });
  }
});

// File thumbnail endpoint (for images)
app.get('/api/files/:fileId/thumb', async (req, res) => {
  try {
    const bucket = getGridFSBucket();
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    
    const files = await bucket.find({ _id: fileId }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = files[0];
    
    // Only serve thumbnails for images
    if (!file.metadata.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Not an image file' });
    }

    res.set('Content-Type', file.metadata.mimetype);
    
    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.pipe(res);
  } catch (error) {
    console.error('Thumbnail error:', error);
    res.status(500).json({ error: 'Invalid file ID' });
  }
});

// API endpoint to get chat history
app.get('/api/messages/room/:room', async (req, res) => {
  try {
    const { room } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    const messages = await Message.find({ room, isDM: false })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    
    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching room messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// API endpoint to get DM history
app.get('/api/messages/dm/:userId', async (req, res) => {
  try {
    const token = req.headers['x-auth'];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
    const currentUserId = payload.id;
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    const messages = await Message.find({
      isDM: true,
      participants: { $all: [currentUserId, userId] }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    
    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching DM messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Store online users
const onlineUsers = new Map();

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('❌ Token missing'));

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'devsecret');
    socket.user = payload;
    next();
  } catch {
    next(new Error('❌ Invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log('⚡ Connected →', socket.user.email);

  // Add user to online users list
  onlineUsers.set(socket.user.id, {
    socketId: socket.id,
    email: socket.user.email,
    name: socket.user.name || socket.user.email,
    id: socket.user.id
  });

  socket.join(socket.user.id);

  io.emit('users:online', Array.from(onlineUsers.values()).map(u => ({
    id: u.id,
    name: u.name,
    email: u.email
  })));

  // Handle regular chat messages
  socket.on('chat:msg', async ({ room, text, attachment }) => {
    try {
      const messageData = {
        sender: socket.user.id,
        senderName: socket.user.name || socket.user.email,
        senderEmail: socket.user.email,
        room,
        isDM: false
      };

      if (text) {
        messageData.text = text;
      }

      if (attachment) {
        messageData.hasAttachment = true;
        messageData.attachment = attachment;
      }

      const message = new Message(messageData);
      await message.save();

      const broadcastData = {
        _id: message._id,
        sender: message.senderName,
        senderId: socket.user.id,
        text: message.text,
        room: message.room,
        ts: message.createdAt,
        hasAttachment: message.hasAttachment,
        attachment: message.attachment
      };

      io.to(room).emit('chat:msg', broadcastData);
    } catch (error) {
      console.error('Error saving message:', error);
      socket.emit('message:error', { error: 'Failed to send message' });
    }
  });

  // Handle direct messages
  socket.on('dm:send', async ({ recipientId, text, attachment }) => {
    try {
      const dmRoomId = [socket.user.id, recipientId].sort().join('-dm-');

      const messageData = {
        sender: socket.user.id,
        senderName: socket.user.name || socket.user.email,
        senderEmail: socket.user.email,
        room: dmRoomId,
        isDM: true,
        participants: [socket.user.id, recipientId]
      };

      if (text) {
        messageData.text = text;
      }

      if (attachment) {
        messageData.hasAttachment = true;
        messageData.attachment = attachment;
      }

      const message = new Message(messageData);
      await message.save();

      const broadcastData = {
        _id: message._id,
        sender: message.senderName,
        senderId: socket.user.id,
        text: message.text,
        ts: message.createdAt,
        isDM: true,
        roomId: dmRoomId,
        hasAttachment: message.hasAttachment,
        attachment: message.attachment,
        from: {
          id: socket.user.id,
          name: socket.user.name || socket.user.email,
          email: socket.user.email
        }
      };

      io.to(recipientId).emit('dm:receive', broadcastData);
      socket.emit('dm:receive', broadcastData);
    } catch (error) {
      console.error('Error saving DM:', error);
      socket.emit('message:error', { error: 'Failed to send message' });
    }
  });

  // Request chat history for a room
  socket.on('history:room', async ({ room, limit = 50, skip = 0 }) => {
    try {
      const messages = await Message.find({ room, isDM: false })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      const formattedMessages = messages.reverse().map(msg => ({
        _id: msg._id,
        sender: msg.senderName,
        senderId: msg.sender,
        text: msg.text,
        room: msg.room,
        ts: msg.createdAt,
        hasAttachment: msg.hasAttachment,
        attachment: msg.attachment
      }));

      socket.emit('history:room', { room, messages: formattedMessages });
    } catch (error) {
      console.error('Error fetching room history:', error);
      socket.emit('history:error', { error: 'Failed to fetch history' });
    }
  });

  // Request DM history
  socket.on('history:dm', async ({ recipientId, limit = 50, skip = 0 }) => {
    try {
      const messages = await Message.find({
        isDM: true,
        participants: { $all: [socket.user.id, recipientId] }
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      const dmRoomId = [socket.user.id, recipientId].sort().join('-dm-');
      const formattedMessages = messages.reverse().map(msg => ({
        _id: msg._id,
        sender: msg.senderName,
        senderId: msg.sender,
        text: msg.text,
        roomId: dmRoomId,
        ts: msg.createdAt,
        isDM: true,
        hasAttachment: msg.hasAttachment,
        attachment: msg.attachment
      }));

      socket.emit('history:dm', { recipientId, messages: formattedMessages });
    } catch (error) {
      console.error('Error fetching DM history:', error);
      socket.emit('history:error', { error: 'Failed to fetch DM history' });
    }
  });

  socket.on('chat:join', (room) => {
    socket.join(room);
    console.log(`${socket.user.email} joined room: ${room}`);
  });

  socket.on('chat:leave', (room) => {
    socket.leave(room);
    console.log(`${socket.user.email} left room: ${room}`);
  });

  socket.on('dm:start', ({ recipientId }) => {
    const dmRoomId = [socket.user.id, recipientId].sort().join('-dm-');
    socket.join(dmRoomId);
    
    io.to(recipientId).emit('dm:invitation', {
      roomId: dmRoomId,
      from: {
        id: socket.user.id,
        name: socket.user.name || socket.user.email,
        email: socket.user.email
      }
    });
  });

  socket.on('typing:start', ({ room }) => {
    socket.to(room).emit('typing:start', {
      user: socket.user.name || socket.user.email,
      userId: socket.user.id
    });
  });

  socket.on('typing:stop', ({ room }) => {
    socket.to(room).emit('typing:stop', {
      userId: socket.user.id
    });
  });

  socket.on('disconnect', () => {
    console.log('👋 Disconnected →', socket.user.email);
    onlineUsers.delete(socket.user.id);
    io.emit('users:online', Array.from(onlineUsers.values()).map(u => ({
      id: u.id,
      name: u.name,
      email: u.email
    })));
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});