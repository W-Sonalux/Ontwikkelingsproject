const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

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
];

const JOKER = { id: 0, emoji: '⭐', naam: 'Joker', isJoker: true };

function maakSpeelveld() {
  let kaarten = [];
  DIEREN.forEach(dier => {
    kaarten.push({ ...dier, kaartId: `${dier.id}a`, gevonden: false, omgedraaid: false });
    kaarten.push({ ...dier, kaartId: `${dier.id}b`, gevonden: false, omgedraaid: false });
  });

  for (let i = kaarten.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kaarten[i], kaarten[j]] = [kaarten[j], kaarten[i]];
  }

  const jokerKaart = { ...JOKER, kaartId: 'joker', gevonden: true, omgedraaid: true };
  kaarten.splice(12, 0, jokerKaart);
  return kaarten;
}

// Spelers: max 2
let spelers = {}; // socketId -> { naam, score, nummer }
let beurt = null; // socketId van wie aan de beurt is

let spelStatus = {
  kaarten: maakSpeelveld(),
  pogingen: 0,
  gevondenParen: 0,
  spelKlaar: false,
};

function getVeiligKaarten() {
  return spelStatus.kaarten.map(k => ({
    kaartId: k.kaartId,
    emoji: k.omgedraaid || k.gevonden ? k.emoji : null,
    naam: k.omgedraaid || k.gevonden ? k.naam : null,
    gevonden: k.gevonden,
    omgedraaid: k.omgedraaid,
    isJoker: k.isJoker || false,
  }));
}

function getSpelersInfo() {
  return Object.entries(spelers).map(([id, s]) => ({
    naam: s.naam,
    score: s.score,
    nummer: s.nummer,
    aanDeBeurt: id === beurt,
  }));
}

function stuurSpelUpdate() {
  io.emit('spelUpdate', {
    kaarten: getVeiligKaarten(),
    pogingen: spelStatus.pogingen,
    gevondenParen: spelStatus.gevondenParen,
    spelKlaar: spelStatus.spelKlaar,
    spelers: getSpelersInfo(),
    beurt: beurt ? spelers[beurt]?.naam : null,
  });
}

function resetSpel() {
  spelStatus = {
    kaarten: maakSpeelveld(),
    pogingen: 0,
    gevondenParen: 0,
    spelKlaar: false,
  };
  // Reset scores
  Object.keys(spelers).forEach(id => { spelers[id].score = 0; });
  // Eerste speler begint
  const ids = Object.keys(spelers);
  beurt = ids.length > 0 ? ids[0] : null;
}

// ─── Socket.io ───────────────────────────────────────────────────

io.on('connection', (socket) => {
  const aantalSpelers = Object.keys(spelers).length;

  if (aantalSpelers >= 2) {
    socket.emit('volzet', { bericht: 'Het spel is al vol! Max 2 spelers.' });
    socket.disconnect();
    return;
  }

  // Wijs spelernummer toe
  const nummer = aantalSpelers + 1;
  spelers[socket.id] = { naam: `Speler ${nummer}`, score: 0, nummer };

  // Eerste speler begint
  if (nummer === 1) beurt = socket.id;

  console.log(`✅ ${spelers[socket.id].naam} verbonden (${socket.id})`);

  // Stuur huidige spelstatus naar nieuwe speler
  socket.emit('verbonden', {
    jouwNummer: nummer,
    jouwNaam: `Speler ${nummer}`,
  });

  stuurSpelUpdate();

  // ── Kaart omdraaien ──
  socket.on('draaiKaart', (kaartId) => {
    // Controleer beurt
    if (socket.id !== beurt) {
      socket.emit('fout', { bericht: 'Het is niet jouw beurt!' });
      return;
    }
    if (spelStatus.spelKlaar) {
      socket.emit('fout', { bericht: 'Het spel is al klaar!' });
      return;
    }

    const kaart = spelStatus.kaarten.find(k => k.kaartId === kaartId);
    if (!kaart || kaart.gevonden || kaart.omgedraaid || kaart.isJoker) {
      socket.emit('fout', { bericht: 'Ongeldige kaart' });
      return;
    }

    const omgedraaideLijst = spelStatus.kaarten.filter(k => k.omgedraaid && !k.gevonden && !k.isJoker);
    if (omgedraaideLijst.length >= 2) {
      socket.emit('fout', { bericht: 'Wacht even...' });
      return;
    }

    kaart.omgedraaid = true;
    stuurSpelUpdate();

    const nieuweOmgedraaid = spelStatus.kaarten.filter(k => k.omgedraaid && !k.gevonden && !k.isJoker);

    if (nieuweOmgedraaid.length === 2) {
      spelStatus.pogingen++;
      const [k1, k2] = nieuweOmgedraaid;

      if (k1.id === k2.id) {
        // MATCH!
        k1.gevonden = true;
        k2.gevonden = true;
        k1.omgedraaid = false;
        k2.omgedraaid = false;
        spelers[socket.id].score += 10;
        spelStatus.gevondenParen++;

        io.emit('match', { kaartId1: k1.kaartId, kaartId2: k2.kaartId, speler: spelers[socket.id].naam });

        if (spelStatus.gevondenParen === 12) {
          spelStatus.spelKlaar = true;
          stuurSpelUpdate();
          // Bepaal winnaar
          const spelersLijst = Object.values(spelers);
          const winnaar = spelersLijst.reduce((a, b) => a.score >= b.score ? a : b);
          io.emit('spelKlaar', {
            winnaar: winnaar.naam,
            scores: spelersLijst.map(s => ({ naam: s.naam, score: s.score })),
          });
        } else {
          // Bij match: zelfde speler blijft aan de beurt
          stuurSpelUpdate();
        }

      } else {
        // Geen match — kaarten na 1.2s terugdraaien, beurt wisselen
        io.emit('geenMatch', { kaartId1: k1.kaartId, kaartId2: k2.kaartId });
        stuurSpelUpdate();

        setTimeout(() => {
          k1.omgedraaid = false;
          k2.omgedraaid = false;

          // Wissel beurt
          const ids = Object.keys(spelers);
          beurt = ids.find(id => id !== socket.id) || socket.id;

          stuurSpelUpdate();
        }, 1200);
      }
    }
  });

  // ── Nieuw spel ──
  socket.on('nieuwSpel', () => {
    resetSpel();
    io.emit('nieuwSpelGestart', { bericht: 'Nieuw spel gestart!' });
    stuurSpelUpdate();
  });

  // ── Verbinding verbroken ──
  socket.on('disconnect', () => {
    console.log(`❌ ${spelers[socket.id]?.naam} verbroken`);
    delete spelers[socket.id];

    // Als de speler die weg ging aan de beurt was, geef beurt aan andere speler
    if (beurt === socket.id) {
      const overige = Object.keys(spelers);
      beurt = overige.length > 0 ? overige[0] : null;
    }

    stuurSpelUpdate();
  });
});

server.listen(PORT, () => {
  console.log(`🐾 Dieren Memory server draait op http://localhost:${PORT}`);
});