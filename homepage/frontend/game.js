// ===== SOZZIAL — Spelkeuze logica (game.js) =====
// Beheert de Socket.io verbinding en de spelkaartjes voor beide schermen

const socket = io();

// ─── Lokale staat ─────────────────────────────────────────────────────────────
let huidigeModus      = 'speler1'; // actieve selectiemodus
let huidigeSpellen    = [];        // lijst met spelgegevens van de server
let huidigeStemmen    = {};        // spelId -> aantal stemmen
let huidigeSpelerStemmen = {};     // spelerNummer -> spelId

// ─── Modus labels in het Nederlands ─────────────────────────────────────────
const MODUS_NAMEN = {
  speler1: '👆 Speler 1 kiest',
  stemmen: '🗳️ Stemmen',
  eerst:   '⚡ Wie het eerst klikt',
};

// ─── Verbindingsstatus ───────────────────────────────────────────────────────

socket.on('connect', () => {
  const el = document.getElementById('status-tekst');
  if (el) el.textContent = 'Verbonden ✓';
});

socket.on('disconnect', () => {
  const el = document.getElementById('status-tekst');
  if (el) el.textContent = 'Verbinding verbroken…';
});

// ─── Initiële status ontvangen van de server ─────────────────────────────────
socket.on('status', ({ modus, stemmen, spelerStemmen, spellen }) => {
  huidigeModus         = modus;
  huidigeSpellen       = spellen;
  huidigeStemmen       = stemmen;
  huidigeSpelerStemmen = spelerStemmen;

  // Bouw de kaartjes en pas de weergave aan
  bouwSpelkaartjes(spellen);
  updateModus(modus);
  updateStemTellers(stemmen, spelerStemmen);
});

// ─── Modus is gewijzigd door speler 1 ────────────────────────────────────────
socket.on('modusGewijzigd', ({ modus, stemmen, spelerStemmen }) => {
  huidigeModus         = modus;
  huidigeStemmen       = stemmen;
  huidigeSpelerStemmen = spelerStemmen;

  updateModus(modus);
  updateStemTellers(stemmen, spelerStemmen);
});

// ─── Stemupdate ontvangen ────────────────────────────────────────────────────
socket.on('stemUpdate', ({ stemmen, spelerStemmen }) => {
  huidigeStemmen       = stemmen;
  huidigeSpelerStemmen = spelerStemmen;

  updateStemTellers(stemmen, spelerStemmen);
});

// ─── Navigeer naar het gekozen spel ─────────────────────────────────────────
socket.on('navigeer', ({ url }) => {
  // Korte visuele feedback (uitfaden) voor navigatie
  document.body.classList.add('navigeren');
  setTimeout(() => {
    window.location.href = url;
  }, 550);
});

// ─── Spelkaartjes bouwen ──────────────────────────────────────────────────────
function bouwSpelkaartjes(spellen) {
  const container = document.getElementById('spellen-rij');
  if (!container) return;

  container.innerHTML = '';

  spellen.forEach(spel => {
    const kaartje = document.createElement('div');
    kaartje.classList.add('spel-kaartje');
    kaartje.dataset.spelId = spel.id;

    kaartje.innerHTML = `
      <div class="spel-emoji">${spel.emoji}</div>
      <div class="spel-naam">${spel.naam}</div>
      <div class="spel-beschrijving">${spel.beschrijving}</div>
      <div class="stem-teller" id="teller-${spel.id}"></div>
    `;

    // Klik-handler
    kaartje.addEventListener('click', () => kiesSpel(spel.id));

    container.appendChild(kaartje);
  });
}

// ─── Spel aanklikken ─────────────────────────────────────────────────────────
function kiesSpel(spelId) {
  if (huidigeModus === 'stemmen') {
    // Stem uitbrengen (of wijzigen)
    socket.emit('stem', { spelId, spelerNummer: window.SPELER_NUMMER });

  } else if (huidigeModus === 'speler1' || huidigeModus === 'eerst') {
    // Spel direct kiezen
    socket.emit('kiesSpel', { spelId, spelerNummer: window.SPELER_NUMMER });
  }
}

// ─── Modus weergave bijwerken ─────────────────────────────────────────────────
function updateModus(modus) {
  huidigeModus = modus;

  // Modus knoppen highlighten (alleen aanwezig op player1)
  document.querySelectorAll('.modus-knop').forEach(knop => {
    knop.classList.toggle('actief', knop.dataset.modus === modus);
  });

  // Huidige modus tekst bijwerken (alleen aanwezig op player2)
  const modusLabel = document.getElementById('huidige-modus-tekst');
  if (modusLabel) {
    modusLabel.textContent = MODUS_NAMEN[modus] || modus;
  }

  // Kaartjes opnieuw stylen op basis van modus en spelernummer
  document.querySelectorAll('.spel-kaartje').forEach(kaartje => {
    // Verwijder alle modus-gerelateerde klassen
    kaartje.classList.remove('klikbaar', 'grijs', 'stembaar', 'pulseren');

    if (modus === 'speler1') {
      if (window.SPELER_NUMMER === 1) {
        // Speler 1 mag klikken
        kaartje.classList.add('klikbaar');
      } else {
        // Speler 2 ziet grayed-out kaartjes
        kaartje.classList.add('grijs');
      }

    } else if (modus === 'stemmen') {
      // Beide spelers mogen stemmen
      kaartje.classList.add('stembaar');

    } else if (modus === 'eerst') {
      // Beide spelers zien klikbare, pulserende kaartjes
      kaartje.classList.add('klikbaar', 'pulseren');
    }
  });

  // Stemtellers verbergen/tonen op basis van modus
  updateStemTellers(huidigeStemmen, huidigeSpelerStemmen);
}

// ─── Stemtellers bijwerken ────────────────────────────────────────────────────
function updateStemTellers(stemmen, spelerStemmen) {
  huidigeStemmen       = stemmen;
  huidigeSpelerStemmen = spelerStemmen;

  // Eigen stem van deze speler (spelerNummer -> spelId)
  const eigenStem = spelerStemmen[window.SPELER_NUMMER];

  Object.entries(stemmen).forEach(([spelId, aantal]) => {
    // Teller element
    const teller  = document.getElementById(`teller-${spelId}`);
    // Kaartje element
    const kaartje = document.querySelector(`[data-spel-id="${spelId}"]`);

    if (teller) {
      if (huidigeModus === 'stemmen' && aantal > 0) {
        teller.textContent = aantal === 1 ? '1 stem' : `${aantal} stemmen`;
        teller.classList.add('zichtbaar');
      } else {
        teller.textContent = '';
        teller.classList.remove('zichtbaar');
      }
    }

    if (kaartje) {
      // Markeer het kaartje waarop deze speler heeft gestemd
      kaartje.classList.toggle('eigen-stem', eigenStem === spelId);
    }
  });
}

// ─── Modus schakelaar events (alleen aanwezig op player1.html) ────────────────
document.querySelectorAll('.modus-knop').forEach(knop => {
  knop.addEventListener('click', () => {
    const modus = knop.dataset.modus;
    socket.emit('wisselModus', modus);
  });
});
