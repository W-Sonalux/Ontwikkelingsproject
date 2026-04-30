const socket    = io('/homepage');
const player    = document.body.dataset.player;
localStorage.setItem('sozzialSpeler', player);

const isPlayer1 = player === 'player1';

const GAME_URLS = {
  'memory':        '/memory',
  'four-in-a-row': '/four-in-a-row',
  'stokvangen':    '/stokvangen',
  'puzzel':        '/puzzel',
  'kleurenflits':  '/kleurenflits',   // ← toegevoegd
};

const statusBar = document.getElementById('status-bar');
const gameCards = document.querySelectorAll('.game-card');
const modeBtns  = document.querySelectorAll('.mode-btn');

let currentMode = 'p1';

// ── Achtergrondmuziek — alleen speler 1 ──
const bgMuziek = document.getElementById('bg-muziek');

if (isPlayer1) {
  bgMuziek.volume = 0.1;

  function startMuziek() {
    bgMuziek.play().catch(() => {});
  }

  bgMuziek.play().catch(() => {
    document.addEventListener('click',      startMuziek, { once: true });
    document.addEventListener('touchstart', startMuziek, { once: true });
    document.addEventListener('keydown',    startMuziek, { once: true });
    document.addEventListener('mousemove',  startMuziek, { once: true });
  });
}

// ── Geluiden ──
function speelGeluid(bestand) {
  const audio = new Audio('/sounds/' + bestand);
  audio.volume = 0.6;
  audio.play().catch(() => {});
}

// ── Mode switch — alleen speler 1 ──
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    speelGeluid('knop.mp3');
    socket.emit('setMode', btn.dataset.mode);
  });
});

// ── Kaart klikken ──
gameCards.forEach(card => {
  card.addEventListener('click', () => {
    speelGeluid('knop.mp3');
    socket.emit('chooseGame', { player, game: card.dataset.game });
  });
});

// ── Beginstatus ──
socket.on('state', (state) => {
  currentMode = state.mode;
  updateModeUI(state.mode);
  updateCardsForMode(state.mode);
});

// ── Stemmen ontvangen ──
socket.on('votes', (votes) => {
  resetCardHighlights();
  const myVote = votes[player];
  if (myVote) {
    document.querySelector(`.game-card[data-game="${myVote}"]`)?.classList.add('voted');
    setStatus('✅ Stem ontvangen! Wachten op de ander...');
  }
});

// ── Geen akkoord bij stemmen ──
socket.on('voteConflict', () => {
  speelGeluid('geen-match.mp3');
  resetCardHighlights();
  setStatus('🤔 Geen akkoord! Kies opnieuw.');
  setTimeout(() => setStatus(getModeStatus(currentMode)), 2500);
});

// ── Spel gekozen ──
socket.on('gameChosen', (game) => {
  speelGeluid('nieuw-spel.mp3');
  bgMuziek.pause();
  bgMuziek.currentTime = 0;
  toonOverlay(game);
  setTimeout(() => {
    window.location.href = GAME_URLS[game] + '?speler=' + player;
  }, 2000);
});

// ── HELPERS ──

function updateModeUI(mode) {
  modeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

function updateCardsForMode(mode) {
  resetCardHighlights();
  if (mode === 'p1' && !isPlayer1) {
    gameCards.forEach(c => c.classList.add('disabled'));
    setStatus('⏳ Wacht op speler 1...');
  } else {
    gameCards.forEach(c => c.classList.remove('disabled'));
    setStatus(getModeStatus(mode));
  }
}

function getModeStatus(mode) {
  if (mode === 'p1')    return isPlayer1 ? '👇🏼 Kies een spel!' : '⏳ Wacht op speler 1...';
  if (mode === 'vote')  return '🗳️ Kies allebei een spel!';
  if (mode === 'click') return '⚡ Wie klikt het eerst?';
  return '';
}

function resetCardHighlights() {
  gameCards.forEach(c => c.classList.remove('voted', 'selected'));
}

function setStatus(msg) {
  if (statusBar) statusBar.textContent = msg;
}

function toonOverlay(game) {
  const namen = {
    'memory':        '🧠 Memory',
    'four-in-a-row': '🔴 4 op een rij',
    'stokvangen':    '🪵 Stokvangen',
    'puzzel':        '🧩 Puzzel',
    'kleurenflits':  '🌈 Kleurenflits',  // ← toegevoegd
  };
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="overlay-icon">🎮</div>
    <h2 class="overlay-title">${namen[game]}</h2>
    <p class="overlay-sub">Het spel start zo...</p>
  `;
  document.body.appendChild(overlay);
}