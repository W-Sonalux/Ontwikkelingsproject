// ===== SOZZIAL Homepagina Server =====
// Express + Socket.io server op poort 8080
// Beheert de spelkeuze tussen twee touchscreens

const express = require('express');
const http    = require('http');
const path    = require('path');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

const PORT = 8080;

// ─── Statische bestanden serveren vanuit de frontend map ─────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── Routes ──────────────────────────────────────────────────────────────────

// Speler 1 scherm (linkerscherm)
app.get('/player1', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'player1.html'));
});

// Speler 2 scherm (rechterscherm)
app.get('/player2', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'player2.html'));
});

// Standaard redirect naar player1
app.get('/', (req, res) => {
  res.redirect('/player1');
});

// ─── Spellenlijst met bijbehorende poorten ───────────────────────────────────
const SPELLEN = [
  {
    id:          'stokvangen',
    naam:        'Stokvangen',
    emoji:       '🪵',
    beschrijving: 'Gooi en vang!',
    url:         'http://localhost:3000',
  },
  {
    id:          'memory',
    naam:        'Memory',
    emoji:       '🐾',
    beschrijving: 'Vind de paren!',
    url:         'http://localhost:3001',
  },
  {
    id:          'vierop',
    naam:        '4 op een rij',
    emoji:       '🔴',
    beschrijving: 'Vier op een rij!',
    url:         'http://localhost:3002',
  },
];

// ─── Selectiestatus ──────────────────────────────────────────────────────────

// Huidige modus: 'speler1' | 'stemmen' | 'eerst'
let selectieModus = 'speler1';

// Stemtellers per spel (spelId -> aantal stemmen)
let stemmen = {};

// Bijhouden welke speler op welk spel heeft gestemd (spelerNummer -> spelId)
let spelerStemmen = {};

// Vlag voor wie-het-eerst-klikt modus (voorkomt dubbele navigatie)
let eersteKlikVerwerkt = false;

// Reset de selectiestatus naar een lege beginstaat
function resetSelectie() {
  stemmen             = {};
  spelerStemmen       = {};
  eersteKlikVerwerkt  = false;
  SPELLEN.forEach(s => { stemmen[s.id] = 0; });
}

resetSelectie();

// Bereken het spel met de meeste stemmen (geeft spelId of null terug)
function berekenWinnaar() {
  let maxStemmen = 0;
  let winnaar    = null;

  for (const [spelId, aantal] of Object.entries(stemmen)) {
    if (aantal > maxStemmen) {
      maxStemmen = aantal;
      winnaar    = spelId;
    }
  }

  return winnaar;
}

// ─── Socket.io events ────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('✅ Verbonden:', socket.id);

  // Stuur de huidige status naar de nieuw verbonden client
  socket.emit('status', {
    modus:         selectieModus,
    stemmen,
    spelerStemmen,
    spellen:       SPELLEN,
  });

  // ── Modus wisselen (alleen speler 1 mag dit) ──────────────────────────────
  socket.on('wisselModus', (modus) => {
    if (!['speler1', 'stemmen', 'eerst'].includes(modus)) return;

    selectieModus = modus;
    resetSelectie();

    console.log(`🔄 Modus gewijzigd naar: ${modus}`);
    io.emit('modusGewijzigd', { modus, stemmen, spelerStemmen });
  });

  // ── Stem uitbrengen (modus: stemmen) ─────────────────────────────────────
  socket.on('stem', ({ spelId, spelerNummer }) => {
    if (selectieModus !== 'stemmen') return;
    if (!Object.prototype.hasOwnProperty.call(stemmen, spelId)) return;

    // Verwijder eventuele vorige stem van deze speler
    const vorigeStem = spelerStemmen[spelerNummer];
    if (vorigeStem) {
      stemmen[vorigeStem] = Math.max(0, stemmen[vorigeStem] - 1);
    }

    // Registreer de nieuwe stem
    spelerStemmen[spelerNummer] = spelId;
    stemmen[spelId]++;

    console.log(`🗳️  Speler ${spelerNummer} stemt op: ${spelId} (${stemmen[spelId]} stem(men))`);
    io.emit('stemUpdate', { stemmen, spelerStemmen });

    // Navigeer zodra beide spelers hebben gestemd
    const aantalGestemd = Object.keys(spelerStemmen).length;
    if (aantalGestemd >= 2) {
      const winnaarId = berekenWinnaar();
      const winnaar   = SPELLEN.find(s => s.id === winnaarId);

      if (winnaar) {
        console.log(`🏆 Winnaar (stemmen): ${winnaar.naam} → ${winnaar.url}`);
        io.emit('navigeer', { url: winnaar.url, spelId: winnaarId });
        resetSelectie();
      }
    }
  });

  // ── Spel kiezen (modus: speler1 of eerst) ────────────────────────────────
  socket.on('kiesSpel', ({ spelId, spelerNummer }) => {
    // Speler 1 kiest: alleen speler 1 mag selecteren
    if (selectieModus === 'speler1' && spelerNummer !== 1) return;

    // Wie het eerst klikt: voorkom dat een tweede klik wordt verwerkt
    if (selectieModus === 'eerst') {
      if (eersteKlikVerwerkt) return;
      eersteKlikVerwerkt = true;
    }

    const spel = SPELLEN.find(s => s.id === spelId);
    if (!spel) return;

    console.log(`🎮 Speler ${spelerNummer} kiest: ${spel.naam} → ${spel.url}`);
    io.emit('navigeer', { url: spel.url, spelId });
    resetSelectie();
  });

  // ── Verbinding verbroken ──────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log('❌ Verbroken:', socket.id);
  });
});

// ─── Server starten ──────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🎉 SOZZIAL homepagina draait op http://localhost:${PORT}`);
  console.log(`   ▶ Speler 1: http://localhost:${PORT}/player1`);
  console.log(`   ▶ Speler 2: http://localhost:${PORT}/player2\n`);
});
