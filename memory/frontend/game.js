const socket = io();

let jouwNummer = null;
let jouwNaam   = null;
let isAanDeBeurt = false;
let spelKlaar    = false;

// ─── Verbinding ──────────────────────────────────────────────────

socket.on('verbonden', (data) => {
  jouwNummer = data.jouwNummer;
  jouwNaam   = data.jouwNaam;
});

socket.on('volzet', (data) => {
  document.getElementById('wacht-scherm').innerHTML = `
    <div class="wacht-inhoud">
      <div class="wacht-emoji">🚫</div>
      <p>${data.bericht}</p>
    </div>`;
});

// ─── Spel update (real-time) ─────────────────────────────────────

socket.on('spelUpdate', (data) => {
  spelKlaar = data.spelKlaar;

  const heeftTweeSpelers = data.spelers.length === 2;
  document.getElementById('wacht-scherm').classList.toggle('verborgen', heeftTweeSpelers);
  document.getElementById('spel-inhoud').classList.toggle('verborgen', !heeftTweeSpelers);
  if (!heeftTweeSpelers) return;

  isAanDeBeurt = data.beurt === jouwNaam;

  updateSpelersBord(data.spelers);
  document.getElementById('pogingen').textContent = data.pogingen;
  document.getElementById('paren').textContent    = `${data.gevondenParen} / 12`;

  renderSpeelveld(data.kaarten);
});

socket.on('match', (data) => {
  const tekst = data.speler === jouwNaam
    ? '🎉 Jij vond een match! +10 punten'
    : `✨ ${data.speler} vond een match!`;
  toonBericht(tekst, 'match');
  setTimeout(verbergBericht, 1800);
});

socket.on('geenMatch', () => {
  toonBericht('❌ Geen match! Beurt wisselt...', 'fout');
  setTimeout(verbergBericht, 1200);
});

socket.on('nieuwSpelGestart', () => {
  document.getElementById('winnaar-overlay').classList.add('verborgen');
  verbergBericht();
});

socket.on('spelKlaar', (data) => toonWinnaar(data));
socket.on('fout',      (data) => {
  toonBericht(data.bericht, 'fout');
  setTimeout(verbergBericht, 1500);
});

// ─── Spelers scorebord ───────────────────────────────────────────

function updateSpelersBord(spelers) {
  spelers.forEach(speler => {
    const nr   = speler.nummer;
    const kaart = document.getElementById(`speler${nr}-kaart`);
    document.getElementById(`speler${nr}-naam`).textContent =
      speler.naam + (speler.naam === jouwNaam ? ' (jij)' : '');
    document.getElementById(`speler${nr}-score`).textContent = speler.score;
    kaart.classList.toggle('actief', speler.aanDeBeurt);
    kaart.classList.toggle('jij',    speler.naam === jouwNaam);
  });
}

// ─── Speelveld renderen ──────────────────────────────────────────

function renderSpeelveld(kaarten) {
  const veld = document.getElementById('speelveld');

  // Eerste keer: bouw het grid op
  if (veld.children.length !== kaarten.length) {
    veld.innerHTML = '';
    kaarten.forEach(kaart => {
      const el = maakKaartElement(kaart);
      veld.appendChild(el);
    });
    return;
  }

  // Daarna: update alleen wat veranderd is
  kaarten.forEach((kaartData, i) => {
    patchKaartElement(veld.children[i], kaartData);
  });
}

// Maak een nieuw kaart-element aan (inclusief innerHTML)
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
  voegClickToe(div, kaart);
  return div;
}

// Patch een bestaand element: pas klassen + emoji aan, GEEN innerHTML-reset
function patchKaartElement(el, kaart) {
  // Klassen bijwerken (triggert de CSS transitie!)
  zetKlassen(el, kaart);

  // Emoji / naam bijwerken als de kaart nu zichtbaar is
  const emojiEl = el.querySelector('.dier-emoji');
  const naamEl  = el.querySelector('.dier-naam');
  if (emojiEl) emojiEl.textContent = kaart.emoji || '';
  if (naamEl)  naamEl.textContent  = kaart.naam  || '';
}

// Zet de juiste CSS-klassen op een kaart-element
function zetKlassen(el, kaart) {
  // Basisklasse altijd aanwezig
  el.className = 'kaart';

  if (kaart.isJoker) {
    el.classList.add('joker', 'gevonden', 'omgedraaid');
  } else if (kaart.gevonden) {
    el.classList.add('gevonden');
  } else if (kaart.omgedraaid) {
    el.classList.add('omgedraaid');
  }

  if (!kaart.gevonden && !kaart.isJoker && (!isAanDeBeurt || spelKlaar)) {
    el.classList.add('geblokkeerd');
  }
}

// Voeg click-listener toe (één keer bij aanmaken)
function voegClickToe(el, kaart) {
  if (kaart.gevonden || kaart.isJoker) return;

  el.addEventListener('click', () => {
    // Lees live klassen op het moment van klikken
    if (el.classList.contains('geblokkeerd') ||
        el.classList.contains('omgedraaid')  ||
        el.classList.contains('gevonden')    ||
        spelKlaar) {
      toonBericht('⏳ Wacht op jouw beurt!', 'info');
      setTimeout(verbergBericht, 1200);
      return;
    }
    socket.emit('draaiKaart', kaart.kaartId);
  });
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