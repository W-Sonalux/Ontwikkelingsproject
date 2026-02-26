const socket = io();

const screenWaiting  = document.getElementById('screen-waiting');
const screenGame     = document.getElementById('screen-game');
const screenGameover = document.getElementById('screen-gameover');

const playerCountEl      = document.getElementById('player-count');
const statusMsg          = document.getElementById('status-msg');
const selectorsContainer = document.getElementById('selectors-container');
const sticksContainer    = document.getElementById('sticks-container');
const restartBtn         = document.getElementById('restart-btn');
const scoreP1            = document.getElementById('score-p1-val');
const scoreP2            = document.getElementById('score-p2-val');
const scoreBoxP1         = document.getElementById('score-p1');
const scoreBoxP2         = document.getElementById('score-p2');
const winnerMsg          = document.getElementById('winner-msg');
const finalScores        = document.getElementById('final-scores');

let myRole              = null;
let throwerId           = null;
let catcherId           = null;
let isThrower           = false;
let catchingEnabled     = false;
let currentFallingIndex = null;
const playerRoles       = {};
const selectorResults   = {};

function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

function buildSelectors(theirSticks) {
  selectorsContainer.innerHTML = '';
  theirSticks.forEach((available, i) => {
    const dot = document.createElement('div');
    dot.classList.add('selector');
    dot.dataset.index = i;
    if (selectorResults[i]) {
      dot.classList.add(selectorResults[i]);
    } else if (!available) {
      dot.classList.add('used');
    }
    selectorsContainer.appendChild(dot);
  });
}

function buildSticks() {
  sticksContainer.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const stick = document.createElement('div');
    stick.classList.add('stick');
    stick.dataset.index = i;
    sticksContainer.appendChild(stick);
  }
}

function updateScores(scores) {
  scoreP1.textContent = scores.player1;
  scoreP2.textContent = scores.player2;
}

function highlightThrower(throwerId_) {
  scoreBoxP1.classList.remove('active-player');
  scoreBoxP2.classList.remove('active-player');
  const role = playerRoles[throwerId_];
  if (role === 'player1') scoreBoxP1.classList.add('active-player');
  else if (role === 'player2') scoreBoxP2.classList.add('active-player');
}

function shadowStick(stickIndex) {
  const stick = sticksContainer.querySelector(`.stick[data-index="${stickIndex}"]`);
  if (!stick) return;
  stick.className = 'stick shadow';
  stick.style.transform = 'none';
}

function enableSelectors() {
  selectorsContainer.querySelectorAll(
    '.selector:not(.caught):not(.missed):not(.thrown):not(.used)'
  ).forEach(dot => {
    dot.classList.add('active');
    dot.addEventListener('click', onSelectStick);
    dot.addEventListener('touchstart', onSelectStick, { passive: true });
  });
}

function disableSelectors() {
  selectorsContainer.querySelectorAll('.selector').forEach(dot => {
    dot.classList.remove('active');
    dot.removeEventListener('click', onSelectStick);
    dot.removeEventListener('touchstart', onSelectStick);
  });
}

function onSelectStick(e) {
  const index = parseInt(e.currentTarget.dataset.index);
  disableSelectors();
  const dot = selectorsContainer.querySelector(`.selector[data-index="${index}"]`);
  if (dot) dot.classList.add('thrown');
  socket.emit('throwStick', index);
}

function enableCatching(stickIndex) {
  catchingEnabled = true;
  currentFallingIndex = stickIndex;
  const stick = sticksContainer.querySelector(`.stick[data-index="${stickIndex}"]`);
  if (!stick) return;
  stick.classList.add('catchable');
  stick.addEventListener('click', onCatchStick);
  stick.addEventListener('touchstart', onCatchStick, { passive: true });
}

function disableCatching() {
  catchingEnabled = false;
  if (currentFallingIndex === null) return;
  const stick = sticksContainer.querySelector(`.stick[data-index="${currentFallingIndex}"]`);
  if (stick) {
    stick.classList.remove('catchable');
    stick.removeEventListener('click', onCatchStick);
    stick.removeEventListener('touchstart', onCatchStick);
  }
}

function onCatchStick() {
  if (!catchingEnabled) return;
  catchingEnabled = false;
  disableCatching();
  socket.emit('catchStick');
}

socket.on('assignRole', (data) => {
  myRole = data.role;
  playerRoles[socket.id] = data.role;
});

socket.on('playerCount', (count) => {
  playerCountEl.textContent = `Verbonden: ${count} / 2`;
});

socket.on('full', (msg) => {
  document.getElementById('waiting-msg').textContent = msg;
});

socket.on('playerDisconnected', () => {
  showScreen(screenWaiting);
  document.getElementById('waiting-msg').textContent = 'Een speler heeft de verbinding verbroken. Wacht op herverbinding...';
});

socket.on('gameStart', (data) => {
  showScreen(screenGame);
  throwerId = data.throwerId;
  catcherId = data.catcherId;
  isThrower = socket.id === throwerId;
  if (data.roles) Object.assign(playerRoles, data.roles);

  Object.keys(selectorResults).forEach(k => delete selectorResults[k]);

  buildSelectors(data.theirSticks);
  buildSticks();
  updateScores(data.scores);
  highlightThrower(throwerId);
  catchingEnabled = false;
  currentFallingIndex = null;

  if (isThrower) {
    statusMsg.textContent = '👆 Jij gooit! Kies een rondje.';
    enableSelectors();
  } else {
    statusMsg.textContent = '👀 De tegenstander kiest een stok...';
  }
});

socket.on('stickThrown', () => {
  statusMsg.textContent = '⏳ Wachten of de tegenstander vangt...';
});

socket.on('stickFalling', (data) => {
  currentFallingIndex = data.stickIndex;
  statusMsg.textContent = '🎯 Klik op de vallende stok om hem te vangen!';
  enableCatching(data.stickIndex);
});

socket.on('roundResult', (data) => {
  const result = data.caught ? 'caught' : 'missed';
  selectorResults[data.stickIndex] = result;
  const dot = selectorsContainer.querySelector(`.selector[data-index="${data.stickIndex}"]`);
  if (dot) {
    dot.classList.remove('thrown', 'active');
    dot.classList.add(result);
  }
  updateScores(data.scores);
  statusMsg.textContent = data.caught
    ? '😮 De tegenstander heeft hem gevangen!'
    : '😄 De tegenstander miste de stok!';
});

socket.on('stickCaught', (data) => {
  disableCatching();
  updateScores(data.scores);
  setTimeout(() => shadowStick(data.stickIndex), 1400);
  statusMsg.textContent = '🎉 Gevangen! Goed gedaan!';
});

socket.on('stickMissed', (data) => {
  catchingEnabled = false;
  updateScores(data.scores);
  const idx = currentFallingIndex;
  setTimeout(() => shadowStick(idx), 1400);
  statusMsg.textContent = '😬 Je hebt de stok gemist!';
});

socket.on('nextRound', (data) => {
  throwerId = data.throwerId;
  catcherId = data.catcherId;
  isThrower = socket.id === throwerId;
  catchingEnabled = false;
  currentFallingIndex = null;
  if (data.roles) Object.assign(playerRoles, data.roles);
  updateScores(data.scores);
  highlightThrower(throwerId);

  buildSelectors(data.theirSticks);

  sticksContainer.querySelectorAll('.stick:not(.shadow)').forEach(stick => {
    stick.classList.remove('catchable');
    stick.style.transform = 'none';
  });

  if (isThrower) {
    statusMsg.textContent = '👆 Jij gooit! Kies een rondje.';
    enableSelectors();
  } else {
    statusMsg.textContent = '👀 De tegenstander kiest een stok...';
  }
});

socket.on('gameOver', (data) => {
  updateScores(data.scores);
  let msg = '';
  if (data.winner === 'draw') {
    msg = "🤝 Gelijkspel!";
  } else if (
    (data.winner === 'player1' && myRole === 'player1') ||
    (data.winner === 'player2' && myRole === 'player2')
  ) {
    msg = "🏆 Jij hebt gewonnen!";
  } else {
    msg = "😔 Je hebt verloren...";
  }
  winnerMsg.textContent = msg;
  finalScores.innerHTML = `
    Speler 1: ${data.scores.player1} stokken gevangen<br>
    Speler 2: ${data.scores.player2} stokken gevangen
  `;
  showScreen(screenGameover);
});

restartBtn.addEventListener('click', () => {
  socket.emit('restartGame');
});

socket.on('connect', () => {
  playerRoles[socket.id] = myRole;
});