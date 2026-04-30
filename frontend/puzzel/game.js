const socket     = io('/puzzel');
const params     = new URLSearchParams(window.location.search);
const mijnSpeler = params.get('speler') || 'player1';

// ── State ──
let mijnRol            = null;
let gridSize           = 2;
let gekozenFoto        = null;
let stukkenData        = [];
let geplaatst          = 0;
let totaal             = 0;
let timerInterval      = null;
let startTijd          = null;
let iedereeenHeeftFoto = false;
let bordX = 0;
let bordY = 0;

// ── Constanten puzzel ──
const BOARD_SIZE   = 600;
const IMG_RENDER_H = BOARD_SIZE;
const IMG_RENDER_W = Math.round(1920 * BOARD_SIZE / 1080);
const IMG_OFFSET_X = Math.round((IMG_RENDER_W - BOARD_SIZE) / 2);

// ── Geluid ──
function speelGeluid(bestand) {
  const audio = new Audio('/sounds/' + bestand);
  audio.volume = 0.6;
  audio.play().catch(() => {});
}

// ── Schermen ──
function toonScherm(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ── Verbonden ──
socket.on('verbonden', ({ rol }) => {
  mijnRol = rol;
  toonScherm('screen-selecting');
  if (rol === 'player2') vergrendelSelectie();
  laadFotos();
});

socket.on('spelersCount', (count) => {
  const status = document.getElementById('spelers-status');
  if (count >= 2) {
    status.textContent = '✅ Beide spelers verbonden!';
    status.classList.add('klaar');
    controleerStartKnop();
  } else {
    status.textContent = '⏳ Wachten op speler 2...';
    status.classList.remove('klaar');
  }
});

// ── Foto laden ──
async function laadFotos() {
  const res   = await fetch('/api/puzzel/fotos');
  const fotos = await res.json();
  const lijst = document.getElementById('foto-lijst');
  lijst.innerHTML = '';
  fotos.forEach(foto => {
    const img     = document.createElement('img');
    img.src       = `/puzzel/pictures/${foto}`;
    img.className = 'foto-thumb';
    img.addEventListener('click', () => kiesFoto(foto));
    lijst.appendChild(img);
  });
}

function kiesFoto(foto) {
  gekozenFoto = foto;
  document.querySelectorAll('.foto-thumb').forEach(t => t.classList.remove('active'));
  document.querySelector(`.foto-thumb[src="/puzzel/pictures/${foto}"]`)?.classList.add('active');
  document.getElementById('gekozen-img').src = `/puzzel/pictures/${foto}`;
  document.getElementById('gekozen-preview').style.display = 'flex';
  socket.emit('kiesFoto', foto);
  controleerStartKnop();
}

socket.on('fotoBevestigd', (foto) => {
  gekozenFoto = foto;
  controleerStartKnop();
});

socket.on('fotoStatus', (iedereen) => {
  controleerStartKnop(iedereen);
});

// ── Grid knoppen ──
document.querySelectorAll('.grid-knop').forEach(btn => {
  btn.addEventListener('click', () => {
    if (mijnRol !== 'player1') return;
    gridSize = parseInt(btn.dataset.grid);
    document.querySelectorAll('.grid-knop').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    socket.emit('kiesGrid', gridSize);
  });
});

socket.on('gridGekozen', (size) => {
  gridSize = size;
  document.querySelectorAll('.grid-knop').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.grid) === size);
  });
  document.getElementById('p2-grid-info').textContent = `${size}×${size}`;
  document.getElementById('p2-preview').style.display = 'flex';
});

// ── Random knop ──
document.getElementById('random-knop').addEventListener('click', async () => {
  const res   = await fetch('/api/puzzel/fotos');
  const fotos = await res.json();
  if (!fotos.length) return;
  kiesFoto(fotos[Math.floor(Math.random() * fotos.length)]);
});

// ── Start knop ──
function controleerStartKnop(iedereen) {
  if (iedereen !== undefined) iedereeenHeeftFoto = iedereen;
  const klaar = document.getElementById('spelers-status').classList.contains('klaar');
  document.getElementById('start-knop').disabled =
    !(gekozenFoto && klaar && mijnRol === 'player1' && iedereeenHeeftFoto);
}

document.getElementById('start-knop').addEventListener('click', () => {
  socket.emit('startSpel');
});

// ── Vergrendel voor speler 2 ──
function vergrendelSelectie() {
  document.querySelectorAll('.grid-knop').forEach(b => {
    b.classList.add('disabled');
    b.style.pointerEvents = 'none';
    b.style.opacity = '0.4';
  });
  const startKnop = document.getElementById('start-knop');
  startKnop.disabled = true;
  startKnop.style.pointerEvents = 'none';
  startKnop.style.opacity = '0.3';
}

// ── Spel start ──
socket.on('spelStart', ({ foto, gridSize: gs, seed }) => {
  gridSize    = gs;
  gekozenFoto = foto;
  toonScherm('screen-game');
  bouwPuzzel(foto, gs, seed);
  startTimer();
  speelGeluid('Score_03.mp3');
});

// ════════════════════════════════════════════════════════════════
// PUZZEL BOUWEN
// ════════════════════════════════════════════════════════════════
function bouwPuzzel(foto, gs, seed) {
  totaal      = gs * gs;
  geplaatst   = 0;
  stukkenData = [];

  const stukSize = BOARD_SIZE / gs;

  const gebied  = document.getElementById('puzzel-gebied');
  const gebW    = gebied.offsetWidth;
  const gebH    = gebied.offsetHeight;
  const BOARD_X = Math.round((gebW - BOARD_SIZE) / 2) - 20;
  const BOARD_Y = Math.round((gebH - BOARD_SIZE) / 2) - 20;
  bordX = BOARD_X;
  bordY = BOARD_Y;

  // ── Bord ──
  const bord = document.getElementById('puzzel-bord');
  bord.innerHTML = '';
  bord.style.left   = BOARD_X + 'px';
  bord.style.top    = BOARD_Y + 'px';
  bord.style.width  = BOARD_SIZE + 'px';
  bord.style.height = BOARD_SIZE + 'px';
  bord.style.gridTemplateColumns = `repeat(${gs}, ${stukSize}px)`;
  bord.style.gridTemplateRows    = `repeat(${gs}, ${stukSize}px)`;

  for (let r = 0; r < gs; r++) {
    for (let c = 0; c < gs; c++) {
      const cel = document.createElement('div');
      cel.className     = 'puzzel-cel';
      cel.dataset.rij   = r;
      cel.dataset.kolom = c;
      cel.style.width   = stukSize + 'px';
      cel.style.height  = stukSize + 'px';

      cel.addEventListener('dragover',  (e) => { e.preventDefault(); cel.classList.add('sleep-over'); });
      cel.addEventListener('dragleave', ()  => cel.classList.remove('sleep-over'));
      cel.addEventListener('drop', (e) => {
        e.preventDefault();
        cel.classList.remove('sleep-over');
        plaatsStuk(cel, parseInt(e.dataTransfer.getData('stukIndex')));
      });

      bord.appendChild(cel);
    }
  }

  // ── Maak stukken en scatter ze random ──
  const volgorde = seededShuffle([...Array(totaal).keys()], seed);
  gebied.querySelectorAll('.puzzel-stuk').forEach(s => s.remove());

  volgorde.forEach((origIndex) => {
    const rij   = Math.floor(origIndex / gs);
    const kolom = origIndex % gs;

    const stuk = document.createElement('div');
    stuk.className    = 'puzzel-stuk';
    stuk.draggable    = true;
    stuk.dataset.orig = origIndex;
    stuk.style.width  = stukSize + 'px';
    stuk.style.height = stukSize + 'px';

    const img = document.createElement('img');
    img.src              = `/puzzel/pictures/${foto}`;
    img.style.width      = IMG_RENDER_W + 'px';
    img.style.height     = IMG_RENDER_H + 'px';
    img.style.marginLeft = -(IMG_OFFSET_X + kolom * stukSize) + 'px';
    img.style.marginTop  = -(rij * stukSize) + 'px';

    stuk.appendChild(img);

    const pos = randomPos(stukSize, stukSize, gebW, gebH, BOARD_X, BOARD_Y, BOARD_SIZE);
    stuk.style.left = pos.x + 'px';
    stuk.style.top  = pos.y + 'px';

    stuk.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('stukIndex', origIndex);
      stuk.classList.add('gesleept');
    });
    stuk.addEventListener('dragend', () => stuk.classList.remove('gesleept'));

    stukkenData[origIndex] = { element: stuk, geplaatst: false };
    gebied.appendChild(stuk);
  });

  // ── Labels: links = altijd speler 1, rechts = altijd speler 2 ──
  document.getElementById('label-links').textContent  = mijnRol === 'player1' ? '🧩 Jij (Speler 1)' : '🧩 Speler 1';
  document.getElementById('label-rechts').textContent = mijnRol === 'player2' ? '🧩 Jij (Speler 2)' : '🧩 Speler 2';
  updateVoortgang('links',  0, totaal);
  updateVoortgang('rechts', 0, totaal);
}

// ── Random positie buiten het bord ──
function randomPos(w, h, gebW, gebH, boardX, boardY, boardSize) {
  const pad      = 12;
  const boardPad = 20;

  for (let i = 0; i < 300; i++) {
    const x = pad + Math.random() * (gebW - w - pad * 2);
    const y = pad + Math.random() * (gebH - h - pad * 2);

    const overlapsBord =
      x + w > boardX - boardPad &&
      x     < boardX + boardSize + boardPad &&
      y + h > boardY - boardPad &&
      y     < boardY + boardSize + boardPad;

    if (!overlapsBord) return { x, y };
  }

  return {
    x: pad + Math.random() * Math.max(0, boardX - w - boardPad - pad),
    y: pad + Math.random() * (gebH - h - pad * 2),
  };
}

// ── Stuk plaatsen ──
function plaatsStuk(cel, origIndex) {
  const rij      = parseInt(cel.dataset.rij);
  const kolom    = parseInt(cel.dataset.kolom);
  const verwacht = rij * gridSize + kolom;

  if (verwacht !== origIndex) return;
  if (cel.classList.contains('heeft-stuk')) return;

  const stukData = stukkenData[origIndex];
  if (!stukData || stukData.geplaatst) return;

  stukData.element.style.position = 'relative';
  stukData.element.style.left     = '';
  stukData.element.style.top      = '';

  const startRot = (Math.random() * 40 - 20) + 'deg';
  stukData.element.style.setProperty('--start-rot', startRot);
  stukData.element.classList.add('inleggen');
  setTimeout(() => stukData.element.classList.remove('inleggen'), 400);

  cel.appendChild(stukData.element);
  cel.classList.add('heeft-stuk');
  stukData.element.draggable = false;
  stukData.geplaatst = true;

  geplaatst++;
  socket.emit('stukGeplaatst', geplaatst);

  if (geplaatst >= totaal) stopTimer();
}

// ── Voortgang update van server ──
// links = altijd speler 1, rechts = altijd speler 2
socket.on('voortgangUpdate', ({ player1, player2 }) => {
  updateVoortgang('links',  player1, totaal);
  updateVoortgang('rechts', player2, totaal);
});

// ── Voortgang ──
function updateVoortgang(kant, aantal, max) {
  const pct = max > 0 ? (aantal / max * 100) : 0;
  document.getElementById(`voortgang-${kant}`).style.width = pct + '%';
  document.getElementById(`tekst-${kant}`).textContent     = `${aantal} / ${max}`;
}

// ── Timer ──
function startTimer() {
  startTijd = Date.now();
  timerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - startTijd) / 1000);
    const m   = String(Math.floor(sec / 60)).padStart(2, '0');
    const s   = String(sec % 60).padStart(2, '0');
    document.getElementById('timer').textContent = `${m}:${s}`;
  }, 500);
}

function stopTimer() {
  clearInterval(timerInterval);
}

function formatTijd(ms) {
  const sec = Math.floor(ms / 1000);
  const m   = String(Math.floor(sec / 60)).padStart(2, '0');
  const s   = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// ── Seeded shuffle ──
function seededShuffle(arr, seed) {
  let s = seed;
  function rand() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Voorbeeld ──
function toonVoorbeeld(zichtbaar) {
  const overlay = document.getElementById('voorbeeld-overlay');
  if (zichtbaar) {
    overlay.style.left     = bordX + 'px';
    overlay.style.top      = bordY + 'px';
    overlay.style.width    = BOARD_SIZE + 'px';
    overlay.style.height   = BOARD_SIZE + 'px';
    overlay.style.overflow = 'hidden';

    const img = document.getElementById('voorbeeld-img');
    img.src              = `/puzzel/pictures/${gekozenFoto}`;
    img.style.width      = IMG_RENDER_W + 'px';
    img.style.height     = IMG_RENDER_H + 'px';
    img.style.marginLeft = -IMG_OFFSET_X + 'px';
    img.style.marginTop  = '0px';
    img.style.objectFit  = '';

    overlay.style.display = 'block';
  } else {
    overlay.style.display = 'none';
  }
}

// ── Opnieuw / beide spelers terug naar selectie ──
socket.on('naarSelectie', () => {
  geplaatst          = 0;
  totaal             = 0;
  gekozenFoto        = null;
  stukkenData        = [];
  iedereeenHeeftFoto = false;

  stopTimer();
  document.getElementById('gameover-overlay').style.display        = 'none';
  document.getElementById('winnaar-badge-links').style.display      = 'none';
  document.getElementById('winnaar-badge-rechts').style.display     = 'none';
  document.getElementById('timer').textContent                       = '00:00';
  document.querySelectorAll('.foto-thumb').forEach(t => t.classList.remove('active'));
  document.getElementById('gekozen-preview').style.display          = 'none';
  document.getElementById('spelers-status').textContent             = '✅ Beide spelers verbonden!';
  document.getElementById('spelers-status').classList.add('klaar');

  toonScherm('screen-selecting');

  if (mijnRol === 'player2') {
    vergrendelSelectie();
  } else {
    // Reset start knop voor speler 1
    const startKnop = document.getElementById('start-knop');
    startKnop.disabled       = true;
    startKnop.style.opacity  = '0.3';
  }
});

function naarSelectie() {
  socket.emit('restartGame');
}

// ── Winnaar events ──
socket.on('eersteKlaar', ({ winnaar, tijd }) => {
  stopTimer();
  const kant = winnaar === 'player1' ? 'links' : 'rechts';
  document.getElementById(`winnaar-badge-${kant}`).style.display = 'block';
  if (winnaar === mijnRol) {
    document.getElementById('timer').textContent = '🏆 ' + formatTijd(tijd);
  }
});

socket.on('tweedeKlaar', () => {
  stopTimer();
  toonGameOver();
});

function toonGameOver() {
  speelGeluid('Win_01.mp3');
  document.getElementById('gameover-overlay').style.display = 'flex';
  const winL = document.getElementById('winnaar-badge-links').style.display !== 'none';
  let titel  = '';
  if (winL) titel = mijnRol === 'player1' ? 'Jij wint! 🎉' : 'Speler 1 wint!';
  else      titel = mijnRol === 'player2' ? 'Jij wint! 🎉' : 'Speler 2 wint!';
  document.getElementById('gameover-icon').textContent  = '🏆';
  document.getElementById('gameover-titel').textContent = titel;
}

// ── Terug naar home ──
socket.on('stuurNaarHome', () => {
  window.location.href = '/' + mijnSpeler;
});

function naarHome() {
  socket.emit('naarHome');
}