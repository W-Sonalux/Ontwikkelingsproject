const socket     = io('/kleurenflits');
const params     = new URLSearchParams(window.location.search);
const mijnSpeler = params.get('speler') || 'player1';

// ── State ──
let mijnRol    = null;
let reeks      = [];
let inputIndex = 0;
let magKlikken = false;
let ronde      = 0;

// ── Geluid ──
function speelGeluid(naam) {
  const audio = new Audio('/sounds/' + naam);
  audio.volume = 0.6;
  audio.play().catch(() => {});
}

// ── Schermen ──
function toonSpel() {
  document.getElementById('wacht-scherm').classList.add('verborgen');
  document.getElementById('spel-inhoud').classList.remove('verborgen');
}

// ════════════════════════════════════════════════════════════════
// SOCKET LISTENERS
// ════════════════════════════════════════════════════════════════

socket.on('verbonden', ({ rol }) => {
  mijnRol = rol;
  const nummer = rol === 'player1' ? 1 : 2;
  document.getElementById(`speler${nummer}-naam`).textContent = '🧩 Jij';
});

socket.on('spelersCount', (count) => {
  if (count < 2) {
    document.querySelector('.wacht-inhoud p').textContent = 'Wachten op tweede speler...';
  }
});

socket.on('spelStart', () => {
  toonSpel();
  reeks      = [];
  inputIndex = 0;
  ronde      = 0;
  magKlikken = false;

  resetLevens(1);
  resetLevens(2);
  setStatus('speler1', '');
  setStatus('speler2', '');
  setBlokkeer(true);
  updateVoortgang([]);
  setStatusBericht('Klaar voor de start! 🌈', 'kijk');
  speelGeluid('Score_03.mp3');
});

// Reeks tonen aan het begin van elke nieuwe ronde
socket.on('toonReeks', ({ reeks: r, ronde: ro }) => {
  reeks      = r;
  ronde      = ro;
  magKlikken = false;

  document.getElementById('ronde-nummer').textContent = ro;
  setBlokkeer(true);
  updateVoortgang([]);
  setStatus('speler1', '');
  setStatus('speler2', '');
  setStatusBericht('🔴 Kijk goed...', 'kijk');

  speelReeks(r);
});

// Beide spelers mogen tegelijk invoeren
socket.on('startInput', ({ ronde: ro }) => {
  magKlikken = true;
  inputIndex = 0;
  setBlokkeer(false);
  updateVoortgang(reeks.map(() => null));
  setStatusBericht('⚡ Jouw beurt! Herhaal de reeks!', 'jij');
});

socket.on('knopOk', ({ index, kleur }) => {
  updateVoortgangStip(index, kleur);
  inputIndex++;
});

// Deze speler heeft de reeks volledig correct ingevoerd
socket.on('reeksVoltooid', () => {
  magKlikken = false;
  setBlokkeer(true);
  setStatusBericht('✅ Goed! Wachten op tegenstander...', 'wacht');
  setStatusZelf('klaar', '✅ Klaar!');
});

// Fout gemaakt — geen animatie, direct opnieuw proberen via herproberenDirect
socket.on('knopFout', ({ kleur, verwacht, levens }) => {
  magKlikken = false;
  setBlokkeer(true);
  updateLevens(mijnRol === 'player1' ? 1 : 2, levens);
  setStatusBericht('❌ Fout! Zo meteen mag je het opnieuw proberen...', 'fout');
  setStatusZelf('fout', `❌ Fout! (${levens}♥ over)`);
});

// Geen animatie, geen geluid — direct opnieuw invoeren
socket.on('herproberenDirect', ({ ronde: ro, reeks: r }) => {
  reeks      = r;
  ronde      = ro;
  inputIndex = 0;
  magKlikken = true;

  setBlokkeer(false);
  updateVoortgang(reeks.map(() => null));
  setStatusBericht('🔄 Probeer opnieuw!', 'jij');
  setStatusZelf('', '🔄 Opnieuw...');
});

// De tegenstander heeft de reeks goed
socket.on('tegenstallerKlaar', ({ rol }) => {
  const nr = rol === 'player1' ? 1 : 2;
  setStatus(`speler${nr}`, '✅ Klaar!', 'klaar');

  if (magKlikken) {
    setStatusBericht('⚡ Tegenstander is klaar — jij bent nog bezig!', 'jij');
  }
});

// De tegenstander heeft een fout gemaakt
socket.on('tegenstallerFout', ({ rol, levens }) => {
  const nr = rol === 'player1' ? 1 : 2;
  updateLevens(nr, levens);
  setStatus(`speler${nr}`, `❌ Fout! (${levens}♥)`, 'fout');

  if (!magKlikken) {
    setStatusBericht('⏳ Tegenstander probeert opnieuw...', 'wacht');
  }
});

// Beide spelers klaar → volgende ronde
socket.on('rondeKlaar', ({ ronde: ro }) => {
  magKlikken = false;
  setBlokkeer(true);
  speelGeluid('Win_01.mp3');
  setStatusBericht(`✅ Ronde ${ro} klaar! Volgende ronde...`, 'kijk');
});

socket.on('gameOver', ({ winnaar, ronde: ro }) => {
  magKlikken = false;
  setBlokkeer(true);

  const ikWin = winnaar === mijnRol;
  speelGeluid('Win_01.mp3');

  document.getElementById('winnaar-emoji').textContent      = ikWin ? '🏆' : '😔';
  document.getElementById('winnaar-titel').textContent      = ikWin ? 'Jij wint! 🎉' : (winnaar === 'player1' ? 'Speler 1 wint!' : 'Speler 2 wint!');
  document.getElementById('winnaar-ondertitel').textContent = `Gehaald tot ronde ${ro}`;
  document.getElementById('winnaar-overlay').classList.remove('verborgen');
});

socket.on('stuurNaarHome', () => {
  window.location.href = '/' + mijnSpeler;
});

// ════════════════════════════════════════════════════════════════
// KNOPPEN
// ════════════════════════════════════════════════════════════════

function drukKnop(kleur) {
  if (!magKlikken) return;
  flitsKnop(kleur);
  socket.emit('drukKnop', kleur);
}

function opnieuw() {
  document.getElementById('winnaar-overlay').classList.add('verborgen');
  socket.emit('restartGame');
}

function naarHome() {
  socket.emit('naarHome');
}

// ════════════════════════════════════════════════════════════════
// ANIMATIES
// ════════════════════════════════════════════════════════════════

async function speelReeks(r) {
  await wacht(600);
  for (let i = 0; i < r.length; i++) {
    await flitsKnop(r[i]);
    await wacht(200);
  }
}

function flitsKnop(kleur) {
  return new Promise(resolve => {
    const knop = document.querySelector(`.flits-knop.${kleur}`);
    knop.classList.add('actief');

    const kleurNaam = kleur.charAt(0).toUpperCase() + kleur.slice(1);
    speelGeluid(`Kleurenflits_${kleurNaam}.mp3`);

    setTimeout(() => {
      knop.classList.remove('actief');
      resolve();
    }, 600);
  });
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

function wacht(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setBlokkeer(geblokkeerd) {
  document.querySelectorAll('.flits-knop').forEach(k => {
    k.classList.toggle('geblokkeerd', geblokkeerd);
    k.classList.toggle('klikbaar',   !geblokkeerd);
  });
}

function setStatusBericht(tekst, type = '') {
  const el = document.getElementById('status-bericht');
  el.textContent = tekst;
  el.className   = `status-bericht ${type}`;
}

function setStatus(id, tekst, type = '') {
  const el = document.getElementById(`${id}-status`);
  if (!el) return;
  el.textContent = tekst;
  el.className   = `speler-status ${type}`;
}

function setStatusZelf(type, tekst) {
  const nr = mijnRol === 'player1' ? 1 : 2;
  setStatus(`speler${nr}`, tekst, type);
}

function updateLevens(spelernr, levens) {
  const rij = document.getElementById(`speler${spelernr}-levens`);
  if (!rij) return;
  const harten = rij.querySelectorAll('.hart');
  harten.forEach((h, i) => {
    h.classList.toggle('actief', i < levens);
    h.classList.toggle('leeg',   i >= levens);
  });
}

function resetLevens(spelernr) {
  updateLevens(spelernr, 3);
}

function updateVoortgang(stippen) {
  const rij = document.getElementById('voortgang-rij');
  rij.innerHTML = '';
  stippen.forEach((kleur) => {
    const stip = document.createElement('div');
    stip.className = `voortgang-stip${kleur ? ' ' + kleur : ''}`;
    rij.appendChild(stip);
  });
}

function updateVoortgangStip(index, kleur) {
  const rij     = document.getElementById('voortgang-rij');
  const stippen = rij.querySelectorAll('.voortgang-stip');
  if (stippen[index]) {
    stippen[index].className = `voortgang-stip ${kleur}`;
  }
}