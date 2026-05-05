const socket = io('/memory');

let jouwNummer   = null;
let jouwNaam     = null;
let isAanDeBeurt = false;
let spelKlaar    = false;
let totaalParen  = 0;

// ─── Verbinding ──────────────────────────────────────────────────

socket.on('verbonden', (data) => {
  jouwNummer = data.jouwNummer;
  jouwNaam   = data.jouwNaam;
});

socket.on('volzet', (data) => {
  document.getElementById('wacht-scherm').innerHTML = `
    <div class="wacht-inhoud">
      <div style="font-size:100px">🚫</div>
      <h1>Spel vol</h1>
      <p>${data.bericht}</p>
    </div>`;
});

// ─── Eén click listener op het speelveld (event delegation) ──────
document.getElementById('speelveld').addEventListener('click', (e) => {
  const kaartEl = e.target.closest('.kaart');
  if (!kaartEl) return;

  if (kaartEl.classList.contains('geblokkeerd') ||
      kaartEl.classList.contains('omgedraaid')  ||
      kaartEl.classList.contains('gevonden')    ||
      spelKlaar) {
    toonBericht('Niet jouw beurt!', 'info');
    setTimeout(verbergBericht, 1200);
    return;
  }

  socket.emit('draaiKaart', kaartEl.dataset.kaartId);
});

// ─── Spel update (real-time) ─────────────────────────────────────

socket.on('spelUpdate', (data) => {
  spelKlaar   = data.spelKlaar;
  totaalParen = data.totaalParen;

  const heeftTweeSpelers = data.spelers.length === 2;
  document.getElementById('wacht-scherm').classList.toggle('verborgen', heeftTweeSpelers);
  if (!heeftTweeSpelers) return;

  // Fase: grid kiezen
  if (data.fase === 'kiesGrid') {
    toonGridKeuze();
    document.getElementById('spel-inhoud').classList.add('verborgen');
    return;
  }

  // Fase: spelen
  verbergGridKeuze();
  document.getElementById('spel-inhoud').classList.remove('verborgen');

  isAanDeBeurt = data.beurt === jouwNaam;

  updateSpelersBord(data.spelers);
  document.getElementById('pogingen').textContent = data.pogingen;
  document.getElementById('paren').textContent    = `${data.gevondenParen} / ${data.totaalParen}`;

  renderSpeelveld(data.kaarten, data.gridSize);
});

// ─── Grid keuze ──────────────────────────────────────────────────

socket.on('gridGekozen', () => {
  verbergGridKeuze();

  if (jouwNummer === 1) {
    const startGeluid = new Audio('/sounds/Score_03.mp3');
    startGeluid.volume = 0.6;
    startGeluid.play().catch(() => {});
  }
});

function toonGridKeuze() {
  let overlay = document.getElementById('grid-keuze-overlay');
  if (overlay) {
    overlay.classList.remove('verborgen');
    return;
  }

  overlay = document.createElement('div');
  overlay.id        = 'grid-keuze-overlay';
  overlay.className = 'grid-keuze-overlay';

  if (jouwNummer === 1) {
    overlay.innerHTML = `
      <div class="grid-keuze-inhoud">
        <img src="/media/memory.png" class="grid-keuze-icoon" alt="Memory"/>
        <h2>Kies een speelveld</h2>
        <p>Speler 1 kiest de moeilijkheid</p>
        <div class="grid-keuze-knoppen">
          <button class="grid-knop" data-size="2">2×2<span>2 paren</span></button>
          <button class="grid-knop" data-size="4">4×4<span>8 paren</span></button>
          <button class="grid-knop" data-size="6">6×6<span>18 paren</span></button>
        </div>
      </div>`;

    overlay.querySelectorAll('.grid-knop').forEach(btn => {
      btn.addEventListener('click', () => {
        socket.emit('kiesGrid', parseInt(btn.dataset.size));
      });
    });
  } else {
    overlay.innerHTML = `
      <div class="grid-keuze-inhoud">
        <img src="/media/memory.png" class="grid-keuze-icoon" alt="Memory"/>
        <h2>Wachten op Speler 1...</h2>
        <p>Speler 1 kiest het speelveld</p>
      </div>`;
  }

  document.body.appendChild(overlay);
}

function verbergGridKeuze() {
  const overlay = document.getElementById('grid-keuze-overlay');
  if (overlay) overlay.classList.add('verborgen');
}

// ─── Match / geen match ──────────────────────────────────────────

socket.on('match', (data) => {
  const tekst = data.speler === jouwNaam
    ? 'MATCH! +10 punten 🔥'
    : `${data.speler} scoort! 💀`;
  toonBericht(tekst, 'match');

  if (jouwNummer === 1) {
    const matchGeluid = new Audio('/sounds/Score_02.mp3');
    matchGeluid.volume = 0.6;
    matchGeluid.play().catch(() => {});
  }

  setTimeout(verbergBericht, 1800);
});

socket.on('geenMatch', () => {
  toonBericht('Geen match — volgende speler!', 'fout');

  if (jouwNummer === 1) {
    const foutGeluid = new Audio('/sounds/Hit_03.mp3');
    foutGeluid.volume = 0.6;
    foutGeluid.play().catch(() => {});
  }

  setTimeout(verbergBericht, 1200);
});

socket.on('nieuwSpelGestart', () => {
  document.getElementById('winnaar-overlay').classList.add('verborgen');
  verbergBericht();
});

socket.on('spelKlaar', (data) => toonWinnaar(data));

socket.on('fout', (data) => {
  toonBericht(data.bericht, 'fout');
  setTimeout(verbergBericht, 1500);
});

// ─── Spelers scorebord ───────────────────────────────────────────

function updateSpelersBord(spelers) {
  // Bereken beschikbare ruimte in het paneel
  const paneel      = document.getElementById('speler1-kaart');
  const paneelHoog  = paneel.clientHeight;
  const reserveer   = 220; // score + naam + beurt indicator + padding
  const maxBalkHoog = paneelHoog - reserveer;

  // Max score = totaal paren * 10 punten
  const maxScore = totaalParen * 10 || 1;

  spelers.forEach(speler => {
    const nr    = speler.nummer;
    const kaart = document.getElementById(`speler${nr}-kaart`);

    document.getElementById(`speler${nr}-naam`).textContent =
      speler.naam + (speler.naam === jouwNaam ? ' (jij)' : '');
    document.getElementById(`speler${nr}-score`).textContent = speler.score;

    // Balk schaalt naar beschikbare ruimte op basis van score / maxScore
    const balkEl = document.getElementById(`speler${nr}-balk`);
    const ratio  = Math.min(speler.score / maxScore, 1);
    const hoogte = Math.max(4, ratio * maxBalkHoog);
    balkEl.style.height = hoogte + 'px';

    kaart.classList.toggle('actief', speler.aanDeBeurt);
    kaart.classList.toggle('jij',    speler.naam === jouwNaam);
  });
}

// ─── Speelveld renderen ──────────────────────────────────────────

function renderSpeelveld(kaarten, gridSize) {
  const veld = document.getElementById('speelveld');

  if (gridSize) {
    veld.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;

    // Emoji grootte aanpassen aan kaartgrootte
    const emojiGrootte = gridSize <= 2 ? '5rem' : gridSize <= 4 ? '3.6rem' : '2.2rem';
    document.documentElement.style.setProperty('--emoji-grootte', emojiGrootte);
  }

  if (veld.children.length !== kaarten.length) {
    veld.innerHTML = '';
    kaarten.forEach(kaart => {
      const el = maakKaartElement(kaart);
      veld.appendChild(el);
    });
    return;
  }

  kaarten.forEach((kaartData, i) => {
    patchKaartElement(veld.children[i], kaartData);
  });
}

function maakKaartElement(kaart) {
  const div = document.createElement('div');
  div.classList.add('kaart');
  div.dataset.kaartId = kaart.kaartId;

  div.innerHTML = `
    <div class="kaart-inner">
      <div class="kaart-voor"></div>
      <div class="kaart-achter">
        <span class="dier-emoji">${kaart.emoji || ''}</span>
        <span class="dier-naam">${kaart.naam  || ''}</span>
      </div>
    </div>`;

  zetKlassen(div, kaart);
  return div;
}

function patchKaartElement(el, kaart) {
  el.dataset.kaartId = kaart.kaartId;
  zetKlassen(el, kaart);
  const emojiEl = el.querySelector('.dier-emoji');
  const naamEl  = el.querySelector('.dier-naam');
  if (emojiEl) emojiEl.textContent = kaart.emoji || '';
  if (naamEl)  naamEl.textContent  = kaart.naam  || '';
}

function zetKlassen(el, kaart) {
  el.className = 'kaart';
  if (kaart.gevonden) {
    el.classList.add('gevonden');
  } else if (kaart.omgedraaid) {
    el.classList.add('omgedraaid');
  }
  if (!kaart.gevonden && (!isAanDeBeurt || spelKlaar)) {
    el.classList.add('geblokkeerd');
  }
}

// ─── Nieuw spel ──────────────────────────────────────────────────

function nieuwSpel() {
  socket.emit('nieuwSpel');
}

// ─── Winnaar scherm ──────────────────────────────────────────────

function toonWinnaar(data) {
  const overlay = document.getElementById('winnaar-overlay');
  const titel   = document.getElementById('winnaar-titel');
  const scores  = document.getElementById('eind-scores');

  const isWinnaar = data.winnaar === jouwNaam;
  document.querySelector('.winnaar-emoji').textContent = isWinnaar ? '🏆' : '🥈';
  titel.textContent = isWinnaar ? 'Jij wint! 🎉' : `${data.winnaar} wint!`;

  if (jouwNummer === 1) {
    const winGeluid = new Audio('/sounds/Win_01.mp3');
    winGeluid.volume = 0.6;
    winGeluid.play().catch(() => {});
  }

  scores.innerHTML = data.scores
    .sort((a, b) => b.score - a.score)
    .map(s => `
      <div class="score-rij">
        <span>${s.naam === jouwNaam ? s.naam + ' (jij)' : s.naam}</span>
        <span>${s.score} punten</span>
      </div>`)
    .join('');

  overlay.classList.remove('verborgen');
}

// ─── Berichten ────────────────────────────────────────────────────

function toonBericht(tekst, type) {
  const el = document.getElementById('bericht');
  el.textContent = tekst;
  el.className   = `bericht ${type}`;
}

function verbergBericht() {
  document.getElementById('bericht').className = 'bericht verborgen';
}

// ─── Naar home ────────────────────────────────────────────────────

socket.on('stuurNaarHome', () => {
  const params = new URLSearchParams(window.location.search);
  const speler = params.get('speler') || 'player1';
  window.location.href = '/' + speler;
});

function naarHome() {
  socket.emit('naarHome');
}