/* app.js – gedeelde homepage logica voor player1 en player2 */

function initHomepage(role) {
  const socket = io();

  const SPEL_NAMEN = {
    stokvangen:   '🪵 Stokvangen',
    memory:       '🐾 Dieren Memory',
    '4opeenrij':  '🔴 4 op een rij',
  };

  let huidigeModus = 1;

  // ── DOM-verwijzingen ─────────────────────────────────────────
  const spelKeuzeEl    = document.getElementById('spelKeuze');
  const wachtSchermEl  = document.getElementById('wachtScherm');
  const statusBerichtEl = document.getElementById('statusBericht');
  const modusKnoppen   = document.querySelectorAll('.modus-knop');
  const spelKaarten    = document.querySelectorAll('.spel-kaart');
  const overlayEl      = document.getElementById('geenAkkoordOverlay');
  const keuzeVergEl    = document.getElementById('keuzeVergelijking');
  const sluitOverlayBtn = document.getElementById('sluitOverlay');

  // ── Hulpfuncties ─────────────────────────────────────────────
  function setStatus(tekst) {
    if (!statusBerichtEl) return;
    if (tekst) {
      statusBerichtEl.textContent = tekst;
      statusBerichtEl.classList.remove('verborgen');
    } else {
      statusBerichtEl.classList.add('verborgen');
    }
  }

  function setModus(mode) {
    huidigeModus = mode;

    // Update modus-knoppen (alleen player1 heeft ze)
    modusKnoppen.forEach(btn => {
      btn.classList.toggle('actief', parseInt(btn.dataset.modus) === mode);
    });

    updateScherm();
    setStatus('');
    resetStemVisueel();
  }

  function updateScherm() {
    if (huidigeModus === 1 && role === 'player2') {
      // Speler 2 ziet wacht-scherm
      spelKeuzeEl?.classList.add('verborgen');
      wachtSchermEl?.classList.remove('verborgen');
    } else {
      // Alle andere gevallen: spel-keuze tonen
      spelKeuzeEl?.classList.remove('verborgen');
      wachtSchermEl?.classList.add('verborgen');
    }

    // Kaarten in-/uitschakelen op basis van modus en rol
    spelKaarten.forEach(kaart => {
      const uitgeschakeld = (huidigeModus === 1 && role === 'player2');
      kaart.disabled = uitgeschakeld;
    });
  }

  function resetStemVisueel() {
    spelKaarten.forEach(k => {
      k.classList.remove('gestemd-p1', 'gestemd-p2');
      const dotP1 = k.querySelector('.stem-dot.p1');
      const dotP2 = k.querySelector('.stem-dot.p2');
      if (dotP1) dotP1.style.display = 'none';
      if (dotP2) dotP2.style.display = 'none';
    });
  }

  function updateStemVisueel(votes) {
    resetStemVisueel();
    spelKaarten.forEach(kaart => {
      const spel = kaart.dataset.spel;
      if (votes.player1 === spel) {
        kaart.classList.add('gestemd-p1');
        const dot = kaart.querySelector('.stem-dot.p1');
        if (dot) dot.style.display = 'block';
      }
      if (votes.player2 === spel) {
        kaart.classList.add('gestemd-p2');
        const dot = kaart.querySelector('.stem-dot.p2');
        if (dot) dot.style.display = 'block';
      }
    });

    // Status bericht
    if (votes.player1 && !votes.player2) {
      setStatus('⏳ Speler 2 kiest nog...');
    } else if (!votes.player1 && votes.player2) {
      setStatus('⏳ Speler 1 kiest nog...');
    } else if (votes.player1 && votes.player2) {
      setStatus('🤝 Beide spelers hebben gekozen...');
    }
  }

  function toonGeenAkkoord(votes) {
    if (!overlayEl) return;
    if (keuzeVergEl) {
      keuzeVergEl.innerHTML = `
        <div class="keuze-item">
          <div class="speler-label">👤 Speler 1</div>
          <div>${SPEL_NAMEN[votes.player1] || votes.player1}</div>
        </div>
        <div class="keuze-vs">≠</div>
        <div class="keuze-item">
          <div class="speler-label">👤 Speler 2</div>
          <div>${SPEL_NAMEN[votes.player2] || votes.player2}</div>
        </div>
      `;
    }
    overlayEl.classList.remove('verborgen');
    setStatus('');
  }

  // ── Socket-events ─────────────────────────────────────────────
  socket.on('stateUpdate', ({ mode }) => {
    setModus(mode);
  });

  socket.on('modeChanged', ({ mode }) => {
    setModus(mode);
  });

  socket.on('spelGekozen', ({ url }) => {
    overlayEl?.classList.add('verborgen');
    setStatus('🚀 Spel wordt gestart...');
    setTimeout(() => {
      window.location.href = url;
    }, 600);
  });

  socket.on('stemUpdate', ({ votes }) => {
    updateStemVisueel(votes);
  });

  socket.on('geenAkkoord', ({ votes }) => {
    toonGeenAkkoord(votes);
  });

  socket.on('stemReset', () => {
    overlayEl?.classList.add('verborgen');
    resetStemVisueel();
    setStatus('');
  });

  // ── UI-interacties ─────────────────────────────────────────────

  // Modus-knoppen (alleen player1)
  if (role === 'player1') {
    modusKnoppen.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = parseInt(btn.dataset.modus);
        socket.emit('setMode', mode);
      });
    });
  }

  // Spel-kaart klikken
  spelKaarten.forEach(kaart => {
    kaart.addEventListener('click', () => {
      if (kaart.disabled) return;
      const spel = kaart.dataset.spel;
      socket.emit('kiesSpel', { game: spel, role });
    });
  });

  // Overlay sluiten / opnieuw kiezen
  sluitOverlayBtn?.addEventListener('click', () => {
    socket.emit('resetStemmen');
  });
}
