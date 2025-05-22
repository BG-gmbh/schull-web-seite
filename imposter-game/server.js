const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let lobby = {
  players: [],
  settings: { word: "", imposters: 1 },
  started: false
};

app.use(express.static('public'));

io.on('connection', socket => {
  console.log('Spieler verbunden:', socket.id);

  socket.on('join', name => {
    if (lobby.started) return;
    lobby.players.push({ id: socket.id, name, role: null });
    io.emit('updatePlayers', lobby.players.map(p => p.name));
  });

  socket.on('settings', (data) => {
    lobby.settings = data;
  });

  socket.on('startGame', () => {
    const word = lobby.settings.word;
    const imposters = lobby.settings.imposters;
    const total = lobby.players.length;

    // Rollen verteilen
    let indices = [...Array(total).keys()];
    for (let i = 0; i < imposters; i++) {
      let idx = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];
      lobby.players[idx].role = "imposter";
    }
    lobby.players.forEach(p => {
      if (!p.role) p.role = "normal";
      io.to(p.id).emit("role", { role: p.role, word: p.role === "normal" ? word : null });
    });

    lobby.started = true;
  });

  socket.on('disconnect', () => {
    console.log('Spieler getrennt:', socket.id);
    lobby.players = lobby.players.filter(p => p.id !== socket.id);
    io.emit('updatePlayers', lobby.players.map(p => p.name));
  });
});

server.listen(3000, () => {
  console.log('Server läuft auf http://localhost:3000');
});
