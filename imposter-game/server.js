const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { nanoid } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let lobbies = {}; // Lobby-Daten: { lobbyId: { players: [{id, name, deviceId, role}], hostId, words: [], imposters, started } }
let votes = {}; // Voting-Status pro Lobby speichern

io.on('connection', socket => {
  console.log('Neue Verbindung:', socket.id);

  socket.on('createLobby', () => {
    const lobbyId = nanoid(4).toUpperCase();
    lobbies[lobbyId] = {
      players: [],
      hostId: socket.id,
      words: [],
      imposters: 1,
      started: false,
    };
    socket.join(lobbyId);
    socket.emit('lobbyCreated', lobbyId);
    console.log(`Lobby ${lobbyId} erstellt von ${socket.id}`);
  });

  socket.on('joinLobby', ({ lobbyId, name, deviceId }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby) {
      socket.emit('errorMsg', 'Lobby nicht gefunden');
      return;
    }
    if (lobby.started) {
      socket.emit('errorMsg', 'Spiel hat bereits begonnen');
      return;
    }
    // Check ob Name schon vergeben
if (lobby.players.find(p => p.name.toLowerCase() === name.toLowerCase())) {
  socket.emit('errorMsg', 'Dieser Name ist in der Lobby bereits vergeben.');
  return;
}
    // Check ob Gerät schon drin ist
    if (lobby.players.find(p => p.deviceId === deviceId)) {
      socket.emit('errorMsg', 'Dieses Gerät ist bereits in der Lobby.');
      return;
    }
    lobby.players.push({ id: socket.id, name, deviceId, role: null });
    socket.join(lobbyId);
    io.to(lobbyId).emit('playerList', lobby.players.map(p => p.name));
    console.log(`${name} ist Lobby ${lobbyId} beigetreten`);
  });

  socket.on('saveSettings', ({ lobbyId, words, imposters }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || socket.id !== lobby.hostId) return;
    lobby.words = words.filter(w => w.trim().length > 0);
    lobby.imposters = imposters;
    io.to(lobbyId).emit('settingsSaved', { words: lobby.words, imposters });
  });

  socket.on('startGame', (lobbyId) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || socket.id !== lobby.hostId) return;
    const total = lobby.players.length;
    const impostersCount = Math.min(lobby.imposters, total - 1);

    // Imposter zuweisen
    let indices = [...Array(total).keys()];
    for (let i = 0; i < impostersCount; i++) {
      let idx = indices.splice(Math.floor(Math.random() * indices.length), 1)[0];
      lobby.players[idx].role = 'imposter';
    }

    // EIN Wort für alle normalen Spieler auswählen
    const word = lobby.words.length > 0
      ? lobby.words[Math.floor(Math.random() * lobby.words.length)]
      : null;

    lobby.players.forEach(p => {
      if (!p.role) p.role = 'normal';
      io.to(p.id).emit('roleAssigned', {
        role: p.role,
        word: p.role === 'normal' ? word : null
      });
    });

    lobby.started = true;
    io.to(lobbyId).emit('gameStarted');
  });

  socket.on('votePlayer', ({ lobbyId, votedName }) => {
    const lobby = lobbies[lobbyId];
    if (!lobby || !lobby.started) return;
    if (!votes[lobbyId]) votes[lobbyId] = {};
    votes[lobbyId][socket.id] = votedName;

    // Wenn alle lebenden Spieler abgestimmt haben
    if (Object.keys(votes[lobbyId]).length >= lobby.players.length) {
      // Stimmen auswerten
      const tally = {};
      Object.values(votes[lobbyId]).forEach(name => {
        tally[name] = (tally[name] || 0) + 1;
      });
      // Spieler mit meisten Stimmen finden
      let max = 0, outName = null;
      for (const [name, count] of Object.entries(tally)) {
        if (count > max) {
          max = count;
          outName = name;
        }
      }
      // Spieler entfernen
      const idx = lobby.players.findIndex(p => p.name === outName);
      if (idx !== -1) {
        const outPlayer = lobby.players.splice(idx, 1)[0];
        io.to(lobbyId).emit('playerVotedOut', outName);
        io.to(outPlayer.id).emit('votedOut');
      }
      // Votes zurücksetzen für nächste Runde
      votes[lobbyId] = {};
      // Neue Spieler-Liste senden
      if (lobby.players.length === 0) {
        io.to(lobbyId).emit('gameOver', 'Alle Spieler wurden gewählt!');
        delete lobbies[lobbyId];
      }
      else if (lobby.players.every(p => p.role === 'imposter')) {
        io.to(lobbyId).emit('gameOver', 'Imposter haben gewonnen!');
        delete lobbies[lobbyId];
      } else {
        io.to(lobbyId).emit('playerList', lobby.players.map(p => p.name));
    }
  };

  socket.on('disconnect', () => {
    for (const [lobbyId, lobby] of Object.entries(lobbies)) {
      const index = lobby.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        const name = lobby.players[index].name;
        lobby.players.splice(index, 1);
        io.to(lobbyId).emit('playerList', lobby.players.map(p => p.name));
        console.log(`${name} hat Lobby ${lobbyId} verlassen`);
        if (lobby.players.length === 0) {
          delete lobbies[lobbyId];
          console.log(`Lobby ${lobbyId} gelöscht (leer)`);
        }
        break;
      }
    }
    // Votes aufräumen
    for (const lobbyId in votes) {
      delete votes[lobbyId][socket.id];
    }
  });
});

server.listen(3000, () => {
  console.log('Server läuft auf http://localhost:3000');
  })
})
