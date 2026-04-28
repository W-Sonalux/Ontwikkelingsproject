const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = 8080;

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Player screens
app.get('/player1', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'player1.html'));
});

app.get('/player2', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'player2.html'));
});

// Game state
let currentMode = 1; // 1 = speler1 kiest, 2 = stemmen, 3 = wie het eerst klikt
let votes = {};      // { player1: 'game', player2: 'game' }
let firstClickDone = false; // guard for mode 3

const SPEL_URLS = {
  stokvangen: 'http://localhost:3000',
  memory:     'http://localhost:3001',
  '4opeenrij': 'http://localhost:3002',
};

io.on('connection', (socket) => {
  console.log('Verbonden:', socket.id);

  // Stuur huidige status naar nieuwe verbinding
  socket.emit('stateUpdate', { mode: currentMode, votes });

  // === Modus wijzigen (alleen player1) ===
  socket.on('setMode', (mode) => {
    currentMode = mode;
    votes = {};
    firstClickDone = false;
    io.emit('modeChanged', { mode });
  });

  // === Spel kiezen ===
  socket.on('kiesSpel', ({ game, role }) => {
    const url = SPEL_URLS[game] || '#';

    if (currentMode === 1) {
      // Alleen speler 1 kiest
      if (role === 'player1') {
        io.emit('spelGekozen', { game, url });
      }

    } else if (currentMode === 2) {
      // Stemmen: beide spelers kiezen
      votes[role] = game;
      io.emit('stemUpdate', { votes: { ...votes } });

      if (votes.player1 && votes.player2) {
        if (votes.player1 === votes.player2) {
          io.emit('spelGekozen', { game, url });
        } else {
          io.emit('geenAkkoord', { votes: { ...votes } });
          votes = {};
        }
      }

    } else if (currentMode === 3) {
      // Wie het eerst klikt
      if (!firstClickDone) {
        firstClickDone = true;
        io.emit('spelGekozen', { game, url });
      }
    }
  });

  // === Stemmen resetten (na conflict) ===
  socket.on('resetStemmen', () => {
    votes = {};
    firstClickDone = false;
    io.emit('stemReset');
  });

  socket.on('disconnect', () => {
    console.log('Verbroken:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🎮 SOZZIAL Homepage → http://localhost:${PORT}`);
  console.log(`   Speler 1 → http://localhost:${PORT}/player1`);
  console.log(`   Speler 2 → http://localhost:${PORT}/player2`);
});
