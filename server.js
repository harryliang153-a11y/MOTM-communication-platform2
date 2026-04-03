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

// --- Global Data ---
let registeredUsers = { 'admin': '123456' }; 
let groups = ['General', 'Project-A'];
let roomHistory = { 'General': [], 'Project-A': [] };
let tasks = []; 
let externalLinks = [{ name: 'Apple Dev', url: 'https://developer.apple.com' }];
let documents = { 'Main': { title: 'Project Wiki', content: '<h1>Workspace</h1>' }};
let polls = [];
let onlineUsers = {};
const INVITE_CODE = "MOTM"; 

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.post('/upload', upload.single('myFile'), (req, res) => {
  res.json({ url: '/uploads/' + req.file.filename, fileName: req.file.originalname, isImage: req.file.mimetype.startsWith('image/') });
});

io.on('connection', (socket) => {
  socket.on('register', (data) => {
    if (data.invite !== INVITE_CODE) return socket.emit('auth_error', 'Wrong Secret Code!');
    if (registeredUsers[data.username]) return socket.emit('auth_error', 'User exists!');
    registeredUsers[data.username] = data.password;
    socket.emit('auth_success', 'Registered!');
  });
  socket.on('login', (data) => {
    if (registeredUsers[data.username] && registeredUsers[data.username] === data.password) {
      onlineUsers[socket.id] = { username: data.username, role: data.username === 'admin' ? 'admin' : 'user', currentRoom: 'General' };
      socket.join('General');
      socket.emit('login_success', { username: data.username, role: onlineUsers[socket.id].role, groups, history: roomHistory['General'], tasks, externalLinks, documents, polls });
    } else {
      socket.emit('auth_error', 'Invalid credentials!');
    }
  });

  socket.on('get-all-users', () => { if (onlineUsers[socket.id]?.role === 'admin') socket.emit('user-list', Object.keys(registeredUsers)); });
  socket.on('delete-user', (u) => { if (onlineUsers[socket.id]?.role === 'admin' && u !== 'admin') { delete registeredUsers[u]; socket.emit('user-list', Object.keys(registeredUsers)); } });

  // --- Voting Launch Logic (STABILIZED) ---
  socket.on('create-poll', (d) => {
    if(d.question && d.options && d.options.length > 0) {
      const newPoll = {
        id: Date.now(),
        question: d.question,
        options: d.options.map(o => ({ name: o.name, votes: 0 })),
        creator: onlineUsers[socket.id].username
      };
      polls.push(newPoll);
      io.emit('update-polls', polls);
    }
  });

  socket.on('cast-vote', (d) => {
    const p = polls.find(x => x.id == d.pollId);
    if(p) { p.options[d.optIdx].votes++; io.emit('update-polls', polls); }
  });

  // --- Other Cores (No Changes) ---
  socket.on('add-link', (l) => { if(l.name && l.url){ if(!l.url.startsWith('http')) l.url='https://'+l.url; externalLinks.push(l); io.emit('update-links', externalLinks); } });
  socket.on('create-group', (n) => { if(n && !groups.includes(n)){ groups.push(n); roomHistory[n]=[]; io.emit('update-groups', groups); } });
  socket.on('create-doc', (n) => { const id = Date.now().toString(); documents[id] = { title: n, content: `<h1>${n}</h1>` }; io.emit('update-doc-list', documents); });
  socket.on('edit-doc', (d) => { if(documents[d.docId]){ documents[d.docId].content=d.content; socket.to('General').emit('update-doc-content', d); } });
  socket.on('chat message', (m) => { const u = onlineUsers[socket.id]; if(u){ const fm = {...m, username: u.username, senderId: socket.id}; roomHistory[u.currentRoom].push(fm); io.to(u.currentRoom).emit('chat message', fm); } });
  socket.on('switch room', (r) => { const u = onlineUsers[socket.id]; socket.leave(u.currentRoom); socket.join(r); u.currentRoom = r; socket.emit('room history', roomHistory[r] || []); });
  socket.on('create-task', (d) => { tasks.push({id:Date.now(), ...d, creator:onlineUsers[socket.id].username, status:'pending'}); io.emit('update-tasks', tasks); });
  socket.on('delete-task', (id) => { tasks = tasks.filter(t => t.id != id); io.emit('update-tasks', tasks); });
  socket.on('claim-task', (id) => { const t = tasks.find(x => x.id == id); if(t){ t.assignee = onlineUsers[socket.id].username; t.status = 'ongoing'; io.emit('update-tasks', tasks); }});
  socket.on('spin-request', (i) => { io.emit('spin-result', { winner: i[Math.floor(Math.random()*i.length)], user: onlineUsers[socket.id].username }); });
  socket.on('disconnect', () => delete onlineUsers[socket.id]);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 V13.1.Final Fixed`));
