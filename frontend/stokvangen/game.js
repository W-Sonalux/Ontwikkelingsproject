const socket = io('/stokvangen');

// ── DOM ──────────────────────────────────────────────────────────
const wachtScherm       = document.getElementById('wacht-scherm');
const spelInhoud        = document.getElementById('spel-inhoud');
const winnaarOverlay    = document.getElementById('winnaar-overlay');
const playerCountEl     = document.getElementById('player-count');
const statusMsg         = document.getElementById('status-msg');
const playArea          = document.getElementById('play-area');
const restartBtn        = document.getElementById('restart-btn');
const restartBtnOverlay = document.getElementById('restart-btn-overlay');
const scoreP1           = document.getElementById('score-p1-val');
const scoreP2           = document.getElementById('score-p2-val');
const scoreBoxP1        = document.getElementById('score-p1');
const scoreBoxP2        = document.getElementById('score-p2');
const winnerMsg         = document.getElementById('winner-msg');
const finalScores       = document.getElementById('final-scores');
const overlayIcon       = document.getElementById('overlay-icon');

// ── SPELSTATUS ───────────────────────────────────────────────────
let myRole              = null;
let throwerId           = null;
let catcherId           = null;
let isThrower           = false;
let catchingEnabled     = false;
let currentFallingIndex = null;
const playerRoles       = {};
const selectorResults   = {};

// ── GELUID ───────────────────────────────────────────────────────
function speelGeluid(bestand) {
  const audio = new Audio('/sounds/' + bestand);
  audio.volume = 0.6;
  audio.play().catch(() => {});
}

// ── SCHERMEN ─────────────────────────────────────────────────────
function toonSpel() {
  wachtScherm.classList.add('verborgen');
  spelInhoud.classList.remove('verborgen');
  winnaarOverlay.classList.add('verborgen');
}

function toonWacht() {
  wachtScherm.classList.remove('verborgen');
  spelInhoud.classList.add('verborgen');
  winnaarOverlay.classList.add('verborgen');
}

function toonOverlay() {
  winnaarOverlay.classList.remove('verborgen');
}

// ── HELPERS ──────────────────────────────────────────────────────

// Geeft de selector el voor een index
function getSelector(i) {
  return playArea.querySelector(`.selector[data-index="${i}"]`);
}

// Geeft de stick el voor een index
function getStick(i) {
  return playArea.querySelector(`.stick[data-index="${i}"]`);
}

function resetSelectors(theirSticks) {
  for (let i = 0; i < 5; i++) {
    const dot = getSelector(i);
    if (!dot) continue;
    dot.className = 'selector';
    if (selectorResults[i]) {
      dot.classList.add(selectorResults[i]);
    } else if (!theirSticks[i]) {
      dot.classList.add('used');
    }
  }
}

function resetSticks() {
  for (let i = 0; i < 5; i++) {
    const stick = getStick(i);
    if (!stick) continue;
    stick.className = 'stick';
    stick.style.transform = 'none';
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
  const stick = getStick(stickIndex);
  if (!stick) return;
  stick.className = 'stick shadow';
  stick.style.transform = 'none';
}

function enableSelectors() {
  for (let i = 0; i < 5; i++) {
    const dot = getSelector(i);
    if (!dot) continue;
    if (dot.classList.contains('caught') ||
        dot.classList.contains('missed') ||
        dot.classList.contains('thrown') ||
        dot.classList.contains('used')) continue;
    dot.classList.add('active');
    dot.addEventListener('click', onSelectStick);
    dot.addEventListener('touchstart', onSelectStick, { passive: true });
  }
}

function disableSelectors() {
  for (let i = 0; i < 5; i++) {
    const dot = getSelector(i);
    if (!dot) continue;
    dot.classList.remove('active');
    dot.removeEventListener('click', onSelectStick);
    dot.removeEventListener('touchstart', onSelectStick);
  }
}

function onSelectStick(e) {
  const index = parseInt(e.currentTarget.dataset.index);
  disableSelectors();
  const dot = getSelector(index);
  if (dot) dot.classList.add('thrown');
  socket.emit('throwStick', index);
}

function enableCatching(stickIndex) {
  catchingEnabled = true;
  currentFallingIndex = stickIndex;
  const stick = getStick(stickIndex);
  if (!stick) return;
  stick.classList.add('catchable');
  stick.addEventListener('click', onCatchStick);
  stick.addEventListener('touchstart', onCatchStick, { passive: true });
}

function disableCatching() {
  catchingEnabled = false;
  if (currentFallingIndex === null) return;
  const stick = getStick(currentFallingIndex);
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

// ── SOCKET EVENTS ────────────────────────────────────────────────
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
  toonWacht();
  document.getElementById('waiting-msg').textContent = 'Een speler heeft de verbinding verbroken. Wacht op herverbinding...';
});

socket.on('gameStart', (data) => {
  toonSpel();
  throwerId = data.throwerId;
  catcherId = data.catcherId;
  isThrower = socket.id === throwerId;
  if (data.roles) Object.assign(playerRoles, data.roles);

  Object.keys(selectorResults).forEach(k => delete selectorResults[k]);

  resetSelectors(data.theirSticks);
  resetSticks();
  updateScores(data.scores);
  highlightThrower(throwerId);
  catchingEnabled = false;
  currentFallingIndex = null;
  restartBtn.disabled = false;

  speelGeluid('Score_03.mp3');

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
  const dot = getSelector(data.stickIndex);
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
  speelGeluid('Score_02.mp3');
  setTimeout(() => shadowStick(data.stickIndex), 1400);
  statusMsg.textContent = '🎉 Gevangen! Goed gedaan!';
});

socket.on('stickMissed', (data) => {
  catchingEnabled = false;
  updateScores(data.scores);
  speelGeluid('Hit_01.mp3');
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

  resetSelectors(data.theirSticks);

  for (let i = 0; i < 5; i++) {
    const stick = getStick(i);
    if (!stick || stick.classList.contains('shadow')) continue;
    stick.classList.remove('catchable');
    stick.style.transform = 'none';
  }

  if (isThrower) {
    statusMsg.textContent = '👆 Jij gooit! Kies een rondje.';
    enableSelectors();
  } else {
    statusMsg.textContent = '👀 De tegenstander kiest een stok...';
  }
});

socket.on('gameOver', (data) => {
  updateScores(data.scores);
  speelGeluid('Win_01.mp3');

  let icon = '';
  let msg  = '';
  if (data.winner === 'draw') {
    icon = '🤝';
    msg  = 'Gelijkspel!';
  } else if (
    (data.winner === 'player1' && myRole === 'player1') ||
    (data.winner === 'player2' && myRole === 'player2')
  ) {
    icon = '🏆';
    msg  = 'Jij hebt gewonnen!';
  } else {
    icon = '😔';
    msg  = 'Je hebt verloren...';
  }

  overlayIcon.textContent = icon;
  winnerMsg.textContent   = msg;
  finalScores.innerHTML   = `
    <div class="score-rij">
      <span>Speler 1</span>
      <span>${data.scores.player1} stokken gevangen</span>
    </div>
    <div class="score-rij">
      <span>Speler 2</span>
      <span>${data.scores.player2} stokken gevangen</span>
    </div>
  `;

  toonOverlay();
});

// ── RESTART ──────────────────────────────────────────────────────
restartBtn.addEventListener('click', () => socket.emit('restartGame'));
restartBtnOverlay.addEventListener('click', () => socket.emit('restartGame'));

// ── NAAR HOME ────────────────────────────────────────────────────
socket.on('connect', () => {
  playerRoles[socket.id] = myRole;
});

socket.on('stuurNaarHome', () => {
  const params = new URLSearchParams(window.location.search);
  const speler = params.get('speler') || 'player1';
  window.location.href = '/' + speler;
});

function naarHome() {
  socket.emit('naarHome');
}