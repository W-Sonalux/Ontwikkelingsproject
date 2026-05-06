const express  = require('express');
const http     = require('http');
const path     = require('path');
const fs       = require('fs');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT = 8080;

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:;"
  );
  next();
});

app.use(express.static(path.join(__dirname, 'frontend')));

app.get('/',              (req, res) => res.redirect('/player1'));
app.get('/player1',       (req, res) => res.sendFile(path.join(__dirname, 'frontend/homepage/player1.html')));
app.get('/player2',       (req, res) => res.sendFile(path.join(__dirname, 'frontend/homepage/player2.html')));
app.get('/memory',        (req, res) => res.sendFile(path.join(__dirname, 'frontend/memory/index.html')));
app.get('/stokvangen',    (req, res) => res.sendFile(path.join(__dirname, 'frontend/stokvangen/index.html')));
app.get('/four-in-a-row', (req, res) => res.sendFile(path.join(__dirname, 'frontend/four-in-a-row/index.html')));
app.get('/puzzel',        (req, res) => res.sendFile(path.join(__dirname, 'frontend/puzzel/index.html')));
app.get('/kleurenflits',  (req, res) => res.sendFile(path.join(__dirname, 'frontend/kleurenflits/index.html')));
app.get('/api/puzzel/fotos', (req, res) => {
  const dir = path.join(__dirname, 'frontend/puzzel/pictures');
  fs.readdir(dir, (err, files) => {
    if (err) return res.json([]);
    const fotos = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    res.json(fotos);
  });
});


// ════════════════════════════════════════════════════════════════
// HOMEPAGE
// ════════════════════════════════════════════════════════════════
const homepageNS = io.of('/homepage');
let homepageState = { mode: 'p1', votes: {}, chosen: null };

homepageNS.on('connection', (socket) => {
  console.log('Homepage verbonden:', socket.id);
  socket.emit('state', homepageState);

  socket.on('setMode', (mode) => {
    homepageState.mode   = mode;
    homepageState.votes  = {};
    homepageState.chosen = null;
    homepageNS.emit('state', homepageState);
  });

  socket.on('chooseGame', ({ player, game }) => {
    if (homepageState.mode === 'p1') {
      if (player === 'player1') {
        homepageState.chosen = game;
        homepageNS.emit('gameChosen', game);
      }
    } else if (homepageState.mode === 'click') {
      if (!homepageState.chosen) {
        homepageState.chosen = game;
        homepageNS.emit('gameChosen', game);
      }
    } else if (homepageState.mode === 'vote') {
      homepageState.votes[player] = game;
      homepageNS.emit('votes', homepageState.votes);
      if (homepageState.votes.player1 && homepageState.votes.player2) {
        if (homepageState.votes.player1 === homepageState.votes.player2) {
          homepageState.chosen = homepageState.votes.player1;
          homepageNS.emit('gameChosen', homepageState.chosen);
        } else {
          homepageNS.emit('voteConflict');
          homepageState.votes = {};
        }
      }
    }
  });

  socket.on('resetHomepage', () => {
    homepageState.votes  = {};
    homepageState.chosen = null;
    homepageNS.emit('state', homepageState);
  });
});


// ════════════════════════════════════════════════════════════════
// MEMORY
// ════════════════════════════════════════════════════════════════
const memoryNS = io.of('/memory');

const DIEREN = [
  { id: 1,  emoji: '🐶', naam: 'Hond' },
  { id: 2,  emoji: '🐱', naam: 'Kat' },
  { id: 3,  emoji: '🐸', naam: 'Kikker' },
  { id: 4,  emoji: '🦁', naam: 'Leeuw' },
  { id: 5,  emoji: '🐘', naam: 'Olifant' },
  { id: 6,  emoji: '🦊', naam: 'Vos' },
  { id: 7,  emoji: '🐧', naam: 'Pinguïn' },
  { id: 8,  emoji: '🦋', naam: 'Vlinder' },
  { id: 9,  emoji: '🐢', naam: 'Schildpad' },
  { id: 10, emoji: '🦄', naam: 'Eenhoorn' },
  { id: 11, emoji: '🐬', naam: 'Dolfijn' },
  { id: 12, emoji: '🦉', naam: 'Uil' },
  { id: 13, emoji: '🐻', naam: 'Beer' },
  { id: 14, emoji: '🐒', naam: 'Aap' },
  { id: 15, emoji: '🦛', naam: 'Nijlpaard' },
  { id: 16, emoji: '🦒', naam: 'Giraf' },
  { id: 17, emoji: '🐊', naam: 'Krokodil' },
  { id: 18, emoji: '🐯', naam: 'Tijger' },
];

function maakSpeelveld(gridSize) {
  const aantalParen = (gridSize * gridSize) / 2;
  const gebruikteDieren = DIEREN.slice(0, aantalParen);
  let kaarten = [];
  gebruikteDieren.forEach(dier => {
    kaarten.push({ ...dier, kaartId: `${dier.id}a`, gevonden: false, omgedraaid: false });
    kaarten.push({ ...dier, kaartId: `${dier.id}b`, gevonden: false, omgedraaid: false });
  });
  for (let i = kaarten.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kaarten[i], kaarten[j]] = [kaarten[j], kaarten[i]];
  }
  return kaarten;
}

let memSpelers      = {};
let memBeurt        = null;
let memFase         = 'kiesGrid';
let memGridSize     = null;
let memStarterIndex = 0;
let memStatus       = { kaarten: [], pogingen: 0, gevondenParen: 0, totaalParen: 0, spelKlaar: false };

function memGetVeiligKaarten() {
  return memStatus.kaarten.map(k => ({
    kaartId:    k.kaartId,
    emoji:      k.omgedraaid || k.gevonden ? k.emoji : null,
    naam:       k.omgedraaid || k.gevonden ? k.naam  : null,
    gevonden:   k.gevonden,
    omgedraaid: k.omgedraaid,
  }));
}

function memGetSpelersInfo() {
  return Object.entries(memSpelers).map(([id, s]) => ({
    naam: s.naam, score: s.score, nummer: s.nummer, aanDeBeurt: id === memBeurt,
  }));
}

function memStuurSpelUpdate() {
  memoryNS.emit('spelUpdate', {
    kaarten:       memGetVeiligKaarten(),
    pogingen:      memStatus.pogingen,
    gevondenParen: memStatus.gevondenParen,
    totaalParen:   memStatus.totaalParen,
    spelKlaar:     memStatus.spelKlaar,
    spelers:       memGetSpelersInfo(),
    beurt:         memBeurt ? memSpelers[memBeurt]?.naam : null,
    fase:          memFase,
    gridSize:      memGridSize,
  });
}

function memResetSpel() {
  memFase     = 'kiesGrid';
  memGridSize = null;
  memStatus   = { kaarten: [], pogingen: 0, gevondenParen: 0, totaalParen: 0, spelKlaar: false };
  Object.keys(memSpelers).forEach(id => { memSpelers[id].score = 0; });
  const ids       = Object.keys(memSpelers);
  memStarterIndex = (memStarterIndex + 1) % Math.max(ids.length, 1);
  memBeurt        = ids.length > 0 ? ids[memStarterIndex] : null;
}

memoryNS.on('connection', (socket) => {
  if (Object.keys(memSpelers).length === 0) {
    memSpelers = {}; memBeurt = null; memFase = 'kiesGrid';
    memGridSize = null; memStarterIndex = 0;
    memStatus = { kaarten: [], pogingen: 0, gevondenParen: 0, totaalParen: 0, spelKlaar: false };
  }

  if (Object.keys(memSpelers).length >= 2) {
    socket.emit('volzet', { bericht: 'Het spel is al vol! Max 2 spelers.' });
    socket.disconnect();
    return;
  }

  const nummer = Object.keys(memSpelers).length + 1;
  memSpelers[socket.id] = { naam: `Speler ${nummer}`, score: 0, nummer };
  if (nummer === 1) memBeurt = socket.id;

  console.log(`✅ Memory: Speler ${nummer} verbonden`);
  socket.emit('verbonden', { jouwNummer: nummer, jouwNaam: `Speler ${nummer}` });
  memStuurSpelUpdate();

  socket.on('kiesGrid', (gridSize) => {
    if (memFase !== 'kiesGrid') return;
    if (!memSpelers[socket.id] || memSpelers[socket.id].nummer !== 1) return;
    if (![2, 4, 6].includes(gridSize)) return;
    memGridSize = gridSize;
    memFase     = 'playing';
    memStatus   = { kaarten: maakSpeelveld(gridSize), pogingen: 0, gevondenParen: 0, totaalParen: (gridSize * gridSize) / 2, spelKlaar: false };
    memoryNS.emit('gridGekozen', gridSize);
    memStuurSpelUpdate();
  });

  socket.on('draaiKaart', (kaartId) => {
    if (memFase !== 'playing' || socket.id !== memBeurt || memStatus.spelKlaar) return;
    const alOmgedraaid = memStatus.kaarten.filter(k => k.omgedraaid && !k.gevonden);
    if (alOmgedraaid.length >= 2) return;
    const kaart = memStatus.kaarten.find(k => k.kaartId === kaartId);
    if (!kaart || kaart.gevonden || kaart.omgedraaid) return;
    kaart.omgedraaid = true;
    memStuurSpelUpdate();
    const omgedraaid = memStatus.kaarten.filter(k => k.omgedraaid && !k.gevonden);
    if (omgedraaid.length === 2) {
      memStatus.pogingen++;
      const [k1, k2] = omgedraaid;
      if (k1.id === k2.id) {
        k1.gevonden = k2.gevonden = true;
        k1.omgedraaid = k2.omgedraaid = false;
        memSpelers[socket.id].score += 10;
        memStatus.gevondenParen++;
        memoryNS.emit('match', { kaartId1: k1.kaartId, kaartId2: k2.kaartId, speler: memSpelers[socket.id].naam });
        if (memStatus.gevondenParen === memStatus.totaalParen) {
          memStatus.spelKlaar = true;
          memStuurSpelUpdate();
          const lijst   = Object.values(memSpelers);
          const winnaar = lijst.reduce((a, b) => a.score >= b.score ? a : b);
          memoryNS.emit('spelKlaar', { winnaar: winnaar.naam, scores: lijst.map(s => ({ naam: s.naam, score: s.score })) });
        } else { memStuurSpelUpdate(); }
      } else {
        memoryNS.emit('geenMatch', { kaartId1: k1.kaartId, kaartId2: k2.kaartId });
        memStuurSpelUpdate();
        setTimeout(() => {
          k1.omgedraaid = k2.omgedraaid = false;
          memBeurt = Object.keys(memSpelers).find(id => id !== socket.id) || socket.id;
          memStuurSpelUpdate();
        }, 1200);
      }
    }
  });

  socket.on('nieuwSpel', () => {
    memResetSpel();
    memoryNS.emit('nieuwSpelGestart', { bericht: 'Nieuw spel gestart!' });
    memStuurSpelUpdate();
  });

  socket.on('naarHome', () => { memoryNS.emit('stuurNaarHome'); });

  socket.on('disconnect', () => {
    console.log(`❌ Memory: ${memSpelers[socket.id]?.naam} verbroken`);
    if (memBeurt === socket.id) {
      const overige = Object.keys(memSpelers).filter(id => id !== socket.id);
      memBeurt = overige.length > 0 ? overige[0] : null;
    }
    delete memSpelers[socket.id];
    memStuurSpelUpdate();
  });
});


// ════════════════════════════════════════════════════════════════
// STOKVANGEN
// ════════════════════════════════════════════════════════════════
const stokvangenNS = io.of('/stokvangen');

function freshStokState() {
  return {
    players:        {},
    fallen:         { player1: [false,false,false,false,false], player2: [false,false,false,false,false] },
    currentThrower: null,
    currentCatcher: null,
    phase:          'waiting',
    fallingStick:   null,
    scores:         { player1: 0, player2: 0 },
    playerIds:      [],
  };
}

let stokState = freshStokState();

function stokGetRolesMap() {
  const map = {};
  for (const [id, data] of Object.entries(stokState.players)) map[id] = data.role;
  return map;
}

function stokSendEach(event, extra = {}) {
  stokState.playerIds.forEach(id => {
    const role         = stokState.players[id].role;
    const opponentRole = role === 'player1' ? 'player2' : 'player1';
    stokvangenNS.to(id).emit(event, {
      throwerId:   stokState.currentThrower,
      catcherId:   stokState.currentCatcher,
      mySticks:    stokState.fallen[role].map(f => !f),
      theirSticks: stokState.fallen[opponentRole].map(f => !f),
      scores:      stokState.scores,
      roles:       stokGetRolesMap(),
      ...extra,
    });
  });
}

stokvangenNS.on('connection', (socket) => {
  if (stokState.playerIds.length === 0) {
    stokState = freshStokState();
  }

  if (stokState.playerIds.length >= 2) {
    socket.emit('full', 'Het spel is al vol.');
    socket.disconnect();
    return;
  }

  console.log('Stokvangen verbonden:', socket.id);

  const playerRole = stokState.playerIds.length === 0 ? 'player1' : 'player2';
  stokState.playerIds.push(socket.id);
  stokState.players[socket.id] = { role: playerRole };

  socket.emit('assignRole', { role: playerRole });
  stokvangenNS.emit('playerCount', stokState.playerIds.length);

  if (stokState.playerIds.length === 2) {
    stokState.phase          = 'choosing';
    stokState.currentThrower = stokState.playerIds[0];
    stokState.currentCatcher = stokState.playerIds[1];
    stokSendEach('gameStart');
  }

  socket.on('throwStick', (stickIndex) => {
    const throwerRole = stokState.players[socket.id]?.role;
    const catcherRole = throwerRole === 'player1' ? 'player2' : 'player1';
    if (stokState.phase !== 'choosing' || socket.id !== stokState.currentThrower || stokState.fallen[catcherRole][stickIndex]) return;

    stokState.fallingStick = { catcherRole, index: stickIndex };
    stokState.phase        = 'falling';

    stokvangenNS.to(socket.id).emit('stickThrown', { stickIndex });
    stokvangenNS.to(stokState.currentCatcher).emit('stickFalling', { stickIndex });

    setTimeout(() => { if (stokState.phase === 'falling') stokState.phase = 'catching'; }, 500);

    setTimeout(() => {
      if (stokState.phase === 'catching' &&
          stokState.fallingStick?.index === stickIndex &&
          stokState.fallingStick?.catcherRole === catcherRole) {
        stokState.fallen[catcherRole][stickIndex] = true;
        stokState.phase        = 'roundEnd';
        stokState.fallingStick = null;
        stokvangenNS.to(stokState.currentThrower).emit('roundResult', { stickIndex, caught: false, scores: stokState.scores });
        stokvangenNS.to(stokState.currentCatcher).emit('stickMissed',  { stickIndex, scores: stokState.scores });
        stokNextRound();
      }
    }, 3000);
  });

  socket.on('catchStick', () => {
    if ((stokState.phase !== 'catching' && stokState.phase !== 'falling') || socket.id !== stokState.currentCatcher) return;
    const { catcherRole, index: stickIndex } = stokState.fallingStick;
    stokState.fallen[catcherRole][stickIndex] = true;
    stokState.scores[catcherRole]++;
    stokState.phase        = 'roundEnd';
    stokState.fallingStick = null;
    stokvangenNS.to(stokState.currentThrower).emit('roundResult', { stickIndex, caught: true,  scores: stokState.scores });
    stokvangenNS.to(stokState.currentCatcher).emit('stickCaught',  { stickIndex, scores: stokState.scores });
    stokNextRound();
  });

  function stokNextRound() {
    const p1done = stokState.fallen.player1.every(Boolean);
    const p2done = stokState.fallen.player2.every(Boolean);

    setTimeout(() => {
      if (p1done && p2done) {
        const winner = stokState.scores.player1 > stokState.scores.player2 ? 'player1'
                     : stokState.scores.player2 > stokState.scores.player1 ? 'player2' : 'draw';
        stokState.phase = 'gameOver';
        stokvangenNS.emit('gameOver', { scores: stokState.scores, winner });
        return;
      }

      let temp = stokState.currentThrower;
      stokState.currentThrower = stokState.currentCatcher;
      stokState.currentCatcher = temp;

      const newCatcherRole = stokState.players[stokState.currentCatcher]?.role;
      if (stokState.fallen[newCatcherRole].every(Boolean)) {
        temp = stokState.currentThrower;
        stokState.currentThrower = stokState.currentCatcher;
        stokState.currentCatcher = temp;
      }

      stokState.phase        = 'choosing';
      stokState.fallingStick = null;
      stokSendEach('nextRound');
    }, 2000);
  }

  socket.on('restartGame', () => {
    stokState.fallen         = { player1: [false,false,false,false,false], player2: [false,false,false,false,false] };
    stokState.scores         = { player1: 0, player2: 0 };
    stokState.phase          = 'choosing';
    stokState.fallingStick   = null;
    const temp               = stokState.currentThrower;
    stokState.currentThrower = stokState.currentCatcher;
    stokState.currentCatcher = temp;
    stokSendEach('gameStart');
  });

  socket.on('naarHome', () => { stokvangenNS.emit('stuurNaarHome'); });

  socket.on('disconnect', () => {
    // ── DE FIX: als deze socket nooit toegevoegd is (geweigerd), niets doen ──
    if (!stokState.players[socket.id]) return;

    console.log('Stokvangen verbroken:', socket.id);
    stokState.playerIds      = stokState.playerIds.filter(id => id !== socket.id);
    delete stokState.players[socket.id];
    stokState.fallen         = { player1: [false,false,false,false,false], player2: [false,false,false,false,false] };
    stokState.scores         = { player1: 0, player2: 0 };
    stokState.phase          = 'waiting';
    stokState.fallingStick   = null;
    stokState.currentThrower = null;
    stokState.currentCatcher = null;
    stokvangenNS.emit('playerDisconnected');
    stokvangenNS.emit('playerCount', stokState.playerIds.length);
  });
});


// ════════════════════════════════════════════════════════════════
// FOUR-IN-A-ROW
// ════════════════════════════════════════════════════════════════
const fourNS = io.of('/four-in-a-row');

const FOUR_ROWS = 6;
const FOUR_COLS = 5;
const FOUR_WIN  = 4;

let fourLastStarter = 1;
let fourState = {
  board: Array(FOUR_ROWS).fill(null).map(() => Array(FOUR_COLS).fill(null)),
  currentPlayer: 1, winner: null, winningCells: [],
  players: {}, connectedPlayers: 0, gameStarted: false,
};
let fourClientId = 0;

function fourResetGame() {
  fourLastStarter         = fourLastStarter === 1 ? 2 : 1;
  fourState.board         = Array(FOUR_ROWS).fill(null).map(() => Array(FOUR_COLS).fill(null));
  fourState.currentPlayer = fourLastStarter;
  fourState.winner        = null;
  fourState.winningCells  = [];
  fourState.gameStarted   = fourState.connectedPlayers === 2;
}

function fourCheckWinner(board, row, col, player) {
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of directions) {
    let cells = [[row, col]];
    for (let i = 1; i < FOUR_WIN; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r >= 0 && r < FOUR_ROWS && c >= 0 && c < FOUR_COLS && board[r][c] === player) cells.push([r, c]);
      else break;
    }
    for (let i = 1; i < FOUR_WIN; i++) {
      const r = row - dr * i, c = col - dc * i;
      if (r >= 0 && r < FOUR_ROWS && c >= 0 && c < FOUR_COLS && board[r][c] === player) cells.push([r, c]);
      else break;
    }
    if (cells.length >= FOUR_WIN) return cells;
  }
  return null;
}

function fourCheckDraw(board) {
  return board.every(row => row.every(cell => cell !== null));
}

fourNS.on('connection', (socket) => {
  const clientId = ++fourClientId;
  if (fourState.connectedPlayers === 0) {
    fourState.board = Array(FOUR_ROWS).fill(null).map(() => Array(FOUR_COLS).fill(null));
    fourState.currentPlayer = fourLastStarter;
    fourState.winner = null; fourState.winningCells = [];
    fourState.gameStarted = false; fourState.players = {};
  }
  if (fourState.connectedPlayers >= 2) {
    socket.emit('error', { message: 'Spel is al vol!' });
    socket.disconnect(); return;
  }
  fourState.connectedPlayers++;
  const playerNumber = fourState.connectedPlayers;
  fourState.players[clientId] = playerNumber;
  console.log(`4-op-een-rij: Speler ${playerNumber} verbonden`);
  socket.emit('assigned', { playerNumber, board: fourState.board, currentPlayer: fourState.currentPlayer, gameStarted: fourState.connectedPlayers === 2 });
  if (fourState.connectedPlayers === 2) {
    fourState.gameStarted = true;
    fourNS.emit('start', { board: fourState.board, currentPlayer: fourState.currentPlayer });
  }
  socket.on('move', ({ col }) => {
    const player = fourState.players[clientId];
    if (!fourState.gameStarted || fourState.winner || fourState.currentPlayer !== player) return;
    let targetRow = -1;
    for (let r = FOUR_ROWS - 1; r >= 0; r--) {
      if (fourState.board[r][col] === null) { targetRow = r; break; }
    }
    if (targetRow === -1) return;
    fourState.board[targetRow][col] = player;
    const winningCells = fourCheckWinner(fourState.board, targetRow, col, player);
    if (winningCells) {
      fourState.winner = player; fourState.winningCells = winningCells;
      fourNS.emit('gameOver', { board: fourState.board, winner: player, winningCells, lastMove: { row: targetRow, col, player } });
      return;
    }
    if (fourCheckDraw(fourState.board)) { fourNS.emit('draw', { board: fourState.board }); return; }
    fourState.currentPlayer = fourState.currentPlayer === 1 ? 2 : 1;
    fourNS.emit('update', { board: fourState.board, currentPlayer: fourState.currentPlayer, lastMove: { row: targetRow, col, player } });
  });
  socket.on('restart', () => { fourResetGame(); fourNS.emit('restart', { board: fourState.board, currentPlayer: fourState.currentPlayer }); });
  socket.on('naarHome', () => { fourNS.emit('stuurNaarHome'); });
  socket.on('disconnect', () => {
    console.log(`4-op-een-rij: Speler ${playerNumber} verbroken`);
    delete fourState.players[clientId];
    fourState.connectedPlayers--;
    if (fourState.connectedPlayers < 2) {
      fourState.gameStarted = false;
      fourNS.emit('playerLeft', { message: 'De andere speler heeft de verbinding verbroken.' });
    }
  });
});


// ════════════════════════════════════════════════════════════════
// PUZZEL
// ════════════════════════════════════════════════════════════════
const puzzelNS = io.of('/puzzel');

function freshPuzzelState() {
  return { phase: 'waiting', foto: null, gridSize: 2, spelers: {}, playerIds: [], startTijd: null, eersteKlaar: null };
}

let puzzelState = freshPuzzelState();

puzzelNS.on('connection', (socket) => {
  if (puzzelState.playerIds.length === 0) puzzelState = freshPuzzelState();
  if (puzzelState.playerIds.length >= 2) { socket.emit('vol', 'Het spel is al vol.'); socket.disconnect(); return; }
  const rol = puzzelState.playerIds.length === 0 ? 'player1' : 'player2';
  puzzelState.playerIds.push(socket.id);
  puzzelState.spelers[socket.id] = { rol, geplaatst: 0, klaar: false, tijd: null };
  console.log(`Puzzel: ${rol} verbonden`);
  socket.emit('verbonden', { rol });
  puzzelNS.emit('spelersCount', puzzelState.playerIds.length);
  puzzelNS.emit('gridGekozen', puzzelState.gridSize);
  socket.on('kiesGrid', (size) => {
    if (puzzelState.spelers[socket.id]?.rol !== 'player1' || ![2,3,4,5].includes(size)) return;
    puzzelState.gridSize = size; puzzelNS.emit('gridGekozen', size);
  });
  socket.on('kiesFoto', (foto) => {
    const speler = puzzelState.spelers[socket.id];
    if (!speler) return;
    speler.foto = foto; socket.emit('fotoBevestigd', foto);
    puzzelNS.emit('fotoStatus', puzzelState.playerIds.every(id => puzzelState.spelers[id]?.foto));
  });
  socket.on('startSpel', () => {
    if (puzzelState.spelers[socket.id]?.rol !== 'player1' || puzzelState.playerIds.length < 2) return;
    if (!puzzelState.playerIds.every(id => puzzelState.spelers[id]?.foto)) return;
    puzzelState.phase = 'playing'; puzzelState.startTijd = Date.now();
    const seed = puzzelState.startTijd;
    puzzelState.playerIds.forEach(id => {
      puzzelNS.to(id).emit('spelStart', { foto: puzzelState.spelers[id].foto, gridSize: puzzelState.gridSize, seed });
    });
  });
  socket.on('stukGeplaatst', (count) => {
    const speler = puzzelState.spelers[socket.id];
    if (!speler) return;
    speler.geplaatst = count;
    const counts = { player1: 0, player2: 0 };
    for (const sp of Object.values(puzzelState.spelers)) counts[sp.rol] = sp.geplaatst;
    puzzelNS.emit('voortgangUpdate', counts);
    const totaal = puzzelState.gridSize * puzzelState.gridSize;
    if (count >= totaal && !speler.klaar) {
      speler.klaar = true; speler.tijd = Date.now() - puzzelState.startTijd;
      if (!puzzelState.eersteKlaar) { puzzelState.eersteKlaar = speler.rol; puzzelNS.emit('eersteKlaar', { winnaar: speler.rol, tijd: speler.tijd }); }
      else { puzzelNS.emit('tweedeKlaar', { speler: speler.rol, tijd: speler.tijd }); }
    }
  });
  socket.on('restartGame', () => {
    puzzelState.phase = 'selecting'; puzzelState.foto = null; puzzelState.gridSize = 2;
    puzzelState.startTijd = null; puzzelState.eersteKlaar = null;
    for (const id of puzzelState.playerIds) {
      puzzelState.spelers[id].geplaatst = 0; puzzelState.spelers[id].klaar = false;
      puzzelState.spelers[id].tijd = null; puzzelState.spelers[id].foto = null;
    }
    puzzelNS.emit('naarSelectie'); puzzelNS.emit('spelersCount', puzzelState.playerIds.length); puzzelNS.emit('gridGekozen', puzzelState.gridSize);
  });
  socket.on('naarHome', () => { puzzelNS.emit('stuurNaarHome'); });
  socket.on('disconnect', () => {
    console.log('Puzzel verbroken:', socket.id);
    puzzelState.playerIds = puzzelState.playerIds.filter(id => id !== socket.id);
    delete puzzelState.spelers[socket.id];
    puzzelNS.emit('spelersCount', puzzelState.playerIds.length);
  });
});


// ════════════════════════════════════════════════════════════════
// KLEURENFLITS
// ════════════════════════════════════════════════════════════════
const kleurenflitsNS = io.of('/kleurenflits');
const KF_KLEUREN     = ['rood', 'blauw', 'groen', 'geel'];
const KF_LEVENS      = 3;

function freshKleurenflitsState() {
  return { phase: 'waiting', playerIds: [], spelers: {}, reeks: [], ronde: 0, rondeTimer: null };
}

let kleurenflitsState = freshKleurenflitsState();

function kfToonReeksEnStart() {
  kleurenflitsState.phase = 'showing';
  for (const id of kleurenflitsState.playerIds) {
    kleurenflitsState.spelers[id].inputIndex = 0;
    kleurenflitsState.spelers[id].rondeDone  = false;
  }
  kleurenflitsNS.emit('toonReeks', { reeks: kleurenflitsState.reeks, ronde: kleurenflitsState.ronde });
  const showTime = 600 + kleurenflitsState.reeks.length * 800 + 500;
  kleurenflitsState.rondeTimer = setTimeout(() => {
    kleurenflitsState.phase = 'inputting';
    kleurenflitsNS.emit('startInput', { ronde: kleurenflitsState.ronde });
  }, showTime);
}

function kfNieuweRonde() {
  kleurenflitsState.ronde++;
  kleurenflitsState.reeks.push(KF_KLEUREN[Math.floor(Math.random() * 4)]);
  kfToonReeksEnStart();
}

function kfCheckRondeKlaar() {
  if (!kleurenflitsState.playerIds.every(id => kleurenflitsState.spelers[id].rondeDone)) return;
  kleurenflitsState.phase = 'tussenRonde';
  kleurenflitsNS.emit('rondeKlaar', { ronde: kleurenflitsState.ronde });
  setTimeout(() => kfNieuweRonde(), 2000);
}

function kfHerproberenVoorSpeler(socketId) {
  kleurenflitsState.spelers[socketId].inputIndex = 0;
  kleurenflitsState.spelers[socketId].rondeDone  = false;
  kleurenflitsNS.to(socketId).emit('herproberenDirect', { ronde: kleurenflitsState.ronde, reeks: kleurenflitsState.reeks });
}

kleurenflitsNS.on('connection', (socket) => {
  if (kleurenflitsState.playerIds.length === 0) kleurenflitsState = freshKleurenflitsState();
  if (kleurenflitsState.playerIds.length >= 2) { socket.emit('vol', 'Het spel is al vol.'); socket.disconnect(); return; }
  const rol = kleurenflitsState.playerIds.length === 0 ? 'player1' : 'player2';
  kleurenflitsState.playerIds.push(socket.id);
  kleurenflitsState.spelers[socket.id] = { rol, levens: KF_LEVENS, inputIndex: 0, rondeDone: false };
  console.log(`Kleurenflits: ${rol} verbonden`);
  socket.emit('verbonden', { rol });
  kleurenflitsNS.emit('spelersCount', kleurenflitsState.playerIds.length);
  if (kleurenflitsState.playerIds.length === 2) {
    setTimeout(() => {
      kleurenflitsState.phase = 'playing';
      kleurenflitsNS.emit('spelStart');
      setTimeout(() => kfNieuweRonde(), 2500);
    }, 1000);
  }
  socket.on('drukKnop', (kleur) => {
    if (kleurenflitsState.phase !== 'inputting') return;
    const speler = kleurenflitsState.spelers[socket.id];
    if (!speler || speler.rondeDone) return;
    const verwacht = kleurenflitsState.reeks[speler.inputIndex];
    if (kleur === verwacht) {
      speler.inputIndex++;
      socket.emit('knopOk', { index: speler.inputIndex - 1, kleur });
      if (speler.inputIndex >= kleurenflitsState.reeks.length) {
        speler.rondeDone = true; socket.emit('reeksVoltooid');
        const andereId = kleurenflitsState.playerIds.find(id => id !== socket.id);
        if (andereId) kleurenflitsNS.to(andereId).emit('tegenstallerKlaar', { rol: speler.rol });
        kfCheckRondeKlaar();
      }
    } else {
      speler.levens--;
      socket.emit('knopFout', { kleur, verwacht, levens: speler.levens });
      const andereId = kleurenflitsState.playerIds.find(id => id !== socket.id);
      if (andereId) kleurenflitsNS.to(andereId).emit('tegenstallerFout', { rol: speler.rol, levens: speler.levens });
      if (speler.levens <= 0) {
        kleurenflitsState.phase = 'gameOver';
        const winnaarId = kleurenflitsState.playerIds.find(id => kleurenflitsState.spelers[id].levens > 0);
        kleurenflitsNS.emit('gameOver', { winnaar: winnaarId ? kleurenflitsState.spelers[winnaarId].rol : null, ronde: kleurenflitsState.ronde });
      } else { setTimeout(() => kfHerproberenVoorSpeler(socket.id), 1500); }
    }
  });
  socket.on('restartGame', () => {
    if (kleurenflitsState.rondeTimer) clearTimeout(kleurenflitsState.rondeTimer);
    kleurenflitsState.reeks = []; kleurenflitsState.ronde = 0; kleurenflitsState.phase = 'playing';
    for (const id of kleurenflitsState.playerIds) {
      kleurenflitsState.spelers[id].levens = KF_LEVENS;
      kleurenflitsState.spelers[id].inputIndex = 0;
      kleurenflitsState.spelers[id].rondeDone  = false;
    }
    kleurenflitsNS.emit('spelStart');
    setTimeout(() => kfNieuweRonde(), 2500);
  });
  socket.on('naarHome', () => { kleurenflitsNS.emit('stuurNaarHome'); });
  socket.on('disconnect', () => {
    console.log('Kleurenflits verbroken:', socket.id);
    if (kleurenflitsState.rondeTimer) clearTimeout(kleurenflitsState.rondeTimer);
    kleurenflitsState.playerIds = kleurenflitsState.playerIds.filter(id => id !== socket.id);
    delete kleurenflitsState.spelers[socket.id];
    kleurenflitsNS.emit('spelersCount', kleurenflitsState.playerIds.length);
  });
});


// ═════════════════════════════════���══════════════════════════════
// START
// ════════════════════════════════════════════════════════════════
server.listen(PORT, () => {
  console.log('');
  console.log('✅ SOZZIAL draait op http://localhost:' + PORT);
  console.log('   Speler 1  → http://localhost:' + PORT + '/player1');
  console.log('   Speler 2  → http://localhost:' + PORT + '/player2');
  console.log('');
});