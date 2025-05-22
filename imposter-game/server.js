const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid'); // Für Lobby-IDs

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let lobbies = {}; // Lobby-Daten: { lobbyId: { players: [], hostId, word, imposters, started } }

io.on('connection', socket => {
  console.log('Neue Verbindung:', socket.id);

  // Lobby erstellen
  socket.on('createLobby', () => {
    const lobbyId = nanoid(4).toUpperCase();
    lobbies[lobbyId] = {
      players: [],
      hostId: socket.id,
      word: '',
      imposters: 1,
      started: false,
    };
    socket.join(lobbyId);
    socket.emit('lobbyCreated', lobbyId);
    console.log(`Lobby ${lobbyId} erstellt von ${socket.id}`);
  });

  // Lobby beitreten
  socket.on('joinLobby', ({ lobbyId, name }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) {
      socket.emit('errorMsg', 'Lobby nicht gefunden');
      return;
    }
    if (lobby.started) {
      socket.emit('errorMsg', 'Spiel hat bereits begonnen');
      return;
    }
    lobby.players.push({ id: socket.id, name, role: null });
    socket.join(lobbyId);
    io.to(lobbyId).emit('playerList', lobby.players.map(p => p.name));
    console.log(`${name} ist Lobby ${lobbyId} beigetreten`);
  });

  // Einstellungen speichern (Host)
  socket.on('saveSettings', ({ lobbyId, word, imposters }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || socket.id !== lobby.hostId) return;
    lobby.word = word;
    lobby.imposters = imposters;
    io.to(lobbyId).emit('settingsSaved', { word, imposters });
  });

  // Spiel starten (Host)
  socket.on('startGame', (lobbyId) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || socket.id !== lobby.hostId) return;
    const total = lobby.players.length;
    const impostersCount = Math.min(lobby.imposters, total - 1);

    // Rollen verteilen
    let indices = [...Array(total).keys()];
    for (let i = 0; i < impostersCount; i++) {
      let idx = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];
      lobby.players[idx].role = 'imposter';
    }
    lobby.players.forEach(p => {
      if (!p.role) p.role = 'normal';
      io.to(p.id).emit('roleAssigned', {
        role: p.role,
        word: p.role === 'normal' ? lobby.word : null
      });
    });

    lobby.started = true;
    io.to(lobbyId).emit('gameStarted');
  });

  // Spieler trennt sich
  socket.on('disconnect', () => {
    for (const [lobbyId, lobby] of Object.entries(lobbies)) {
      const index = lobby.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        const name = lobby.players[index].name;
        lobby.players.splice(index, 1);
        io.to(lobbyId).emit('playerList', lobby.players.map(p => p.name));
        console.log(`${name} hat Lobby ${lobbyId} verlassen`);
        // Lobby löschen, wenn leer
        if (lobby.players.length === 0) {
          delete lobbies[lobbyId];
          console.log(`Lobby ${lobbyId} gelöscht (leer)`);
        }
        break;
      }
    }
  });
});

server.listen(3000, () => {
  console.log('Server läuft auf http://localhost:3000');
});
