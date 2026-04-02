const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

if (!fs.existsSync('./uploads')) fs.mkdirSync('./uploads');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

// Default Global Data
let groups = ['General Chat', 'Tech Support', 'Design Sync'];
const roomHistory = { 'General Chat': [], 'Tech Support': [], 'Design Sync':[] };
let tasks = []; 
let externalLinks = [
  { name: 'Apple Dev', url: 'https://developer.apple.com' },
  { name: 'Bing Search', url: 'https://www.bing.com' }
];
const users = {};

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.post('/upload', upload.single('myFile'), (req, res) => {
  res.json({ url: '/uploads/' + req.file.filename, fileName: req.file.originalname, isImage: req.file.mimetype.startsWith('image/') });
});

io.on('connection', (socket) => {
  socket.on('login', (data) => {
    const { username, password } = data;
    if(!username) return;
    let role = (username === 'admin' && password === '123456') ? 'admin' : 'user';
    users[socket.id] = { username, role, currentRoom: 'General Chat' };
    socket.join('General Chat');
    socket.emit('login_success', { username, role, groups, history: roomHistory['General Chat'], tasks, externalLinks });
  });

  // --- Group Creation Logic ---
  socket.on('create group', (name) => {
    if (name && !groups.includes(name)) {
      groups.push(name);
      roomHistory[name] = [];
      io.emit('update groups', groups); // Notify everyone to update their sidebar
    }
  });

  socket.on('switch room', (newRoom) => {
    const user = users[socket.id];
    if(!user) return;
    socket.leave(user.currentRoom);
    socket.join(newRoom);
    user.currentRoom = newRoom;
    socket.emit('room history', roomHistory[newRoom] || []);
  });

  socket.on('chat message', (msgData) => {
    const user = users[socket.id];
    if(!user) return;
    const msg = { senderId: socket.id, username: user.username, role: user.role, ...msgData };
    if(!roomHistory[user.currentRoom]) roomHistory[user.currentRoom] = [];
    roomHistory[user.currentRoom].push(msg);
    io.to(user.currentRoom).emit('chat message', msg);
  });

  socket.on('create task', (d) => { 
    const user = users[socket.id];
    tasks.push({id:Date.now(), title:d.title, creator:user.username, status:'pending'}); 
    io.emit('update tasks', tasks); 
  });

  socket.on('add external link', (linkData) => {
    const user = users[socket.id];
    if (user && user.role === 'admin') {
      externalLinks.push({ name: linkData.name, url: linkData.url });
      io.emit('update links', externalLinks);
    }
  });

  socket.on('disconnect', () => delete users[socket.id]);
});

// 优先使用云平台分配的端口，如果没有（比如在自己电脑上），则使用 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 TeamHub Global V8.2 Live on port ${PORT}`));
