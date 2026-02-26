const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = 3000;
app.use(express.static(path.join(__dirname, '../frontend')));

function freshState() {
  return {
    players: {},
    fallen: {
      player1: [false, false, false, false, false],
      player2: [false, false, false, false, false]
    },
    currentThrower: null,
    currentCatcher: null,
    phase: 'waiting',
    fallingStick: null,
    scores: { player1: 0, player2: 0 },
    playerIds: []
  };
}

let gameState = freshState();

function getRolesMap() {
  const map = {};
  for (const [id, data] of Object.entries(gameState.players)) {
    map[id] = data.role;
  }
  return map;
}

function sendEach(event, extra = {}) {
  gameState.playerIds.forEach(id => {
    const role         = gameState.players[id].role;
    const opponentRole = role === 'player1' ? 'player2' : 'player1';
    io.to(id).emit(event, {
      throwerId:   gameState.currentThrower,
      catcherId:   gameState.currentCatcher,
      mySticks:    gameState.fallen[role].map(f => !f),
      theirSticks: gameState.fallen[opponentRole].map(f => !f),
      scores:      gameState.scores,
      roles:       getRolesMap(),
      ...extra
    });
  });
}

io.on('connection', (socket) => {
  console.log('Verbonden:', socket.id);

  if (gameState.playerIds.length >= 2) {
    socket.emit('full', 'Het spel is al vol.');
    socket.disconnect();
    return;
  }

  const playerRole = gameState.playerIds.length === 0 ? 'player1' : 'player2';
  gameState.playerIds.push(socket.id);
  gameState.players[socket.id] = { role: playerRole };

  socket.emit('assignRole', { role: playerRole });
  io.emit('playerCount', gameState.playerIds.length);

  if (gameState.playerIds.length === 2) {
    gameState.phase = 'choosing';
    gameState.currentThrower = gameState.playerIds[0];
    gameState.currentCatcher = gameState.playerIds[1];
    sendEach('gameStart');
  }

  socket.on('throwStick', (stickIndex) => {
    const throwerRole = gameState.players[socket.id]?.role;
    const catcherRole = throwerRole === 'player1' ? 'player2' : 'player1';

    if (
      gameState.phase !== 'choosing' ||
      socket.id !== gameState.currentThrower ||
      gameState.fallen[catcherRole][stickIndex] === true
    ) return;

    gameState.fallingStick = { catcherRole, index: stickIndex };
    gameState.phase = 'falling';

    io.to(socket.id).emit('stickThrown', { stickIndex });
    io.to(gameState.currentCatcher).emit('stickFalling', { stickIndex });

    setTimeout(() => {
      if (gameState.phase === 'falling') gameState.phase = 'catching';
    }, 500);

    setTimeout(() => {
      if (
        gameState.phase === 'catching' &&
        gameState.fallingStick?.index === stickIndex &&
        gameState.fallingStick?.catcherRole === catcherRole
      ) {
        gameState.fallen[catcherRole][stickIndex] = true;
        gameState.phase = 'roundEnd';
        gameState.fallingStick = null;

        io.to(gameState.currentThrower).emit('roundResult', {
          stickIndex, caught: false, scores: gameState.scores
        });
        io.to(gameState.currentCatcher).emit('stickMissed', {
          stickIndex, scores: gameState.scores
        });
        nextRound();
      }
    }, 3000);
  });

  socket.on('catchStick', () => {
    if (
      (gameState.phase !== 'catching' && gameState.phase !== 'falling') ||
      socket.id !== gameState.currentCatcher
    ) return;

    const { catcherRole, index: stickIndex } = gameState.fallingStick;

    gameState.fallen[catcherRole][stickIndex] = true;
    gameState.scores[catcherRole]++;
    gameState.phase = 'roundEnd';
    gameState.fallingStick = null;

    io.to(gameState.currentThrower).emit('roundResult', {
      stickIndex, caught: true, scores: gameState.scores
    });
    io.to(gameState.currentCatcher).emit('stickCaught', {
      stickIndex, scores: gameState.scores
    });
    nextRound();
  });

  function nextRound() {
    const p1done = gameState.fallen.player1.every(Boolean);
    const p2done = gameState.fallen.player2.every(Boolean);

    setTimeout(() => {
      if (p1done && p2done) {
        const winner =
          gameState.scores.player1 > gameState.scores.player2 ? 'player1' :
          gameState.scores.player2 > gameState.scores.player1 ? 'player2' :
          'draw';
        gameState.phase = 'gameOver';
        io.emit('gameOver', { scores: gameState.scores, winner });
        return;
      }

      let temp = gameState.currentThrower;
      gameState.currentThrower = gameState.currentCatcher;
      gameState.currentCatcher = temp;

      const newCatcherRole = gameState.players[gameState.currentCatcher]?.role;
      if (gameState.fallen[newCatcherRole].every(Boolean)) {
        temp = gameState.currentThrower;
        gameState.currentThrower = gameState.currentCatcher;
        gameState.currentCatcher = temp;
      }

      gameState.phase = 'choosing';
      gameState.fallingStick = null;
      sendEach('nextRound');
    }, 2000);
  }

  socket.on('restartGame', () => {
    gameState.fallen = {
      player1: [false, false, false, false, false],
      player2: [false, false, false, false, false]
    };
    gameState.scores = { player1: 0, player2: 0 };
    gameState.phase = 'choosing';
    gameState.fallingStick = null;
    gameState.currentThrower = gameState.playerIds[0];
    gameState.currentCatcher = gameState.playerIds[1];
    sendEach('gameStart');
  });

  socket.on('disconnect', () => {
    console.log('Verbroken:', socket.id);
    gameState.playerIds = gameState.playerIds.filter(id => id !== socket.id);
    delete gameState.players[socket.id];

    // ✅ Reset alleen de speldata, niet de hele state
    // zodat de volgende speler gewoon kan verbinden
    gameState.fallen = {
      player1: [false, false, false, false, false],
      player2: [false, false, false, false, false]
    };
    gameState.scores = { player1: 0, player2: 0 };
    gameState.phase = 'waiting';
    gameState.fallingStick = null;
    gameState.currentThrower = null;
    gameState.currentCatcher = null;

    io.emit('playerDisconnected');
    io.emit('playerCount', gameState.playerIds.length);
  });
});

server.listen(PORT, () => console.log(`Server draait op http://localhost:${PORT}`));