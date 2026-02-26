// ===== CONFIGURATIE =====
const WS_URL    = `ws://${window.location.host}`;
const ROWS      = 6;
const COLS      = 5;
const CELL_SIZE = 90;
const GAP       = 10;
const PADDING   = 10;
const RADIUS    = CELL_SIZE * 0.44;

// Canvas afmetingen
const CW = COLS * CELL_SIZE + (COLS - 1) * GAP + PADDING * 2;
const CH = ROWS * CELL_SIZE + (ROWS - 1) * GAP + PADDING * 2;

// ===== DOM =====
const discCanvas     = document.getElementById("discCanvas");
const boardCanvas    = document.getElementById("boardCanvas");
const discCtx        = discCanvas.getContext("2d");
const boardCtx       = boardCanvas.getContext("2d");

// Beide canvassen exact dezelfde afmeting
discCanvas.width     = CW;
discCanvas.height    = CH;
boardCanvas.width    = CW;
boardCanvas.height   = CH;

const colButtons     = document.querySelectorAll(".col-btn");
const statusMessage  = document.getElementById("status-message");
const restartBtn     = document.getElementById("restartBtn");
const overlayEl      = document.getElementById("overlay");
const overlayTitle   = document.getElementById("overlay-title");
const overlayIcon    = document.getElementById("overlay-icon");
const overlaySub     = document.getElementById("overlay-subtitle");
const overlayRestart = document.getElementById("overlayRestartBtn");
const player1Info    = document.getElementById("player1-info");
const player2Info    = document.getElementById("player2-info");
const player1Label   = document.getElementById("player1-label");
const player2Label   = document.getElementById("player2-label");

// ===== SPELSTATUS =====
let board         = emptyBoard();
let myPlayer      = null;
let currentPlayer = 1;
let gameStarted   = false;
let gameOver      = false;
let winningCells  = [];
let ws            = null;

// ===== ANIMATIE =====
let fallingDisc  = null; // { col, player, targetRow, currentY, targetY }
let animFrameId  = null;
let pulsePhase   = 0;

// ===== HULPFUNCTIES =====
function emptyBoard() {
  return Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
}

// Geeft het middelpunt van een cel terug
function cellCenter(row, col) {
  const x = PADDING + col * (CELL_SIZE + GAP) + CELL_SIZE / 2;
  const y = PADDING + row * (CELL_SIZE + GAP) + CELL_SIZE / 2;
  return { x, y };
}

// ===== BORD CANVAS (wordt maar 1x getekend) =====
function drawBoardCanvas() {
  boardCtx.clearRect(0, 0, CW, CH);

  // Stap 1: vul het hele canvas met de blauwe bordkleur
  boardCtx.fillStyle = "#1a4a8a";
  boardCtx.beginPath();
  boardCtx.roundRect(0, 0, CW, CH, 14);
  boardCtx.fill();

  // Stap 2: knip ronde gaten uit met destination-out
  // destination-out verwijdert pixels waar we tekenen → echte transparante gaten
  boardCtx.globalCompositeOperation = "destination-out";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { x, y } = cellCenter(r, c);
      boardCtx.beginPath();
      boardCtx.arc(x, y, RADIUS, 0, Math.PI * 2);
      boardCtx.fillStyle = "rgba(0, 0, 0, 1)";
      boardCtx.fill();
    }
  }

  // Stap 3: zet composite terug naar normaal
  boardCtx.globalCompositeOperation = "source-over";

  // Stap 4: subtiele binnenrand in de gaten voor diepte-effect
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { x, y } = cellCenter(r, c);
      boardCtx.beginPath();
      boardCtx.arc(x, y, RADIUS, 0, Math.PI * 2);
      boardCtx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      boardCtx.lineWidth = 5;
      boardCtx.stroke();
    }
  }
}

// ===== DISC CANVAS (wordt elke frame opnieuw getekend) =====
function drawDiscCanvas() {
  discCtx.clearRect(0, 0, CW, CH);

  // Stap 1: donkere achtergrond
  discCtx.fillStyle = "#0d1b35";
  discCtx.beginPath();
  discCtx.roundRect(0, 0, CW, CH, 14);
  discCtx.fill();

  // Stap 2: teken alle geplaatste schijfjes
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const val = board[r][c];
      if (!val) continue;

      // Sla de cel over die nu valt — die tekenen we apart
      if (fallingDisc && fallingDisc.targetRow === r && fallingDisc.col === c) {
        continue;
      }

      const { x, y } = cellCenter(r, c);
      const isWinning = winningCells.some(([wr, wc]) => wr === r && wc === c);
      drawDisc(discCtx, x, y, val, isWinning);
    }
  }

  // Stap 3: teken de vallende schijf op zijn huidige positie
  if (fallingDisc) {
    const { x } = cellCenter(0, fallingDisc.col);
    drawDisc(discCtx, x, fallingDisc.currentY, fallingDisc.player, false);
  }
}

// Teken één schijfje
function drawDisc(ctx, x, y, player, isWinning) {
  const glow = isWinning ? 0.5 + 0.5 * Math.sin(pulsePhase) : 0;

  // Gloed voor winnende schijfjes
  if (isWinning) {
    ctx.shadowColor = player === 1
      ? `rgba(232, 64, 64, ${0.6 + glow * 0.4})`
      : `rgba(245, 200, 0, ${0.6 + glow * 0.4})`;
    ctx.shadowBlur = 20 + glow * 20;
  }

  // Radiale gradient voor 3D effect
  const grad = ctx.createRadialGradient(
    x - RADIUS * 0.3, y - RADIUS * 0.3, RADIUS * 0.05,
    x, y, RADIUS
  );

  if (player === 1) {
    grad.addColorStop(0,   "#ff8080");
    grad.addColorStop(0.5, "#e84040");
    grad.addColorStop(1,   "#7f0000");
  } else {
    grad.addColorStop(0,   "#ffe066");
    grad.addColorStop(0.5, "#f5c800");
    grad.addColorStop(1,   "#7a5c00");
  }

  ctx.beginPath();
  ctx.arc(x, y, RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Rand
  ctx.strokeStyle = player === 1
    ? (isWinning ? "#ff6666" : "#b52a2a")
    : (isWinning ? "#ffe066" : "#c49a00");
  ctx.lineWidth = isWinning ? 3 : 1.5;
  ctx.stroke();

  // Gloed uitzetten
  ctx.shadowBlur  = 0;
  ctx.shadowColor = "transparent";
}

// ===== ALLES HERTEKENEN =====
function drawAll() {
  drawDiscCanvas();
  // boardCanvas hoeft niet opnieuw — die verandert nooit
}

// ===== VAL ANIMATIE =====
function startFallAnimation(col, player, targetRow) {
  if (animFrameId) cancelAnimationFrame(animFrameId);

  const { y: targetY } = cellCenter(targetRow, col);

  fallingDisc = {
    col,
    player,
    targetRow,
    targetY,
    currentY: -RADIUS, // start net boven het canvas
  };

  animatefall();
}

function animatefall() {
  if (!fallingDisc) return;

  const { targetY } = fallingDisc;
  const dist = targetY - fallingDisc.currentY;

  if (dist > 1) {
    // Versnelling op basis van afstand (zwaartekracht gevoel)
    const speed = Math.max(6, dist * 0.2);
    fallingDisc.currentY += speed;

    // Niet voorbij het doel gaan
    if (fallingDisc.currentY >= targetY) {
      fallingDisc.currentY = targetY;
      drawAll();
      fallingDisc = null;

      // Als er winnaars zijn, start de puls animatie
      if (winningCells.length > 0) {
        startPulseLoop();
      }
      return;
    }
  } else {
    fallingDisc.currentY = targetY;
    drawAll();
    fallingDisc = null;

    if (winningCells.length > 0) {
      startPulseLoop();
    }
    return;
  }

  drawAll();
  animFrameId = requestAnimationFrame(animatefall);
}

// ===== PULS ANIMATIE voor winnende schijfjes =====
function startPulseLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);

  function loop() {
    if (winningCells.length === 0) return;
    pulsePhase += 0.06;
    drawAll();
    animFrameId = requestAnimationFrame(loop);
  }
  loop();
}

// ===== KOLOM KNOPPEN =====
function updateColButtons() {
  colButtons.forEach((btn) => {
    const col     = parseInt(btn.dataset.col);
    const colFull = board[0][col] !== null;
    const myTurn  = gameStarted && !gameOver && currentPlayer === myPlayer;

    btn.disabled = !myTurn || colFull;
    btn.classList.remove("active-player-1", "active-player-2");
    if (myTurn) {
      btn.classList.add(myPlayer === 1 ? "active-player-1" : "active-player-2");
    }
  });
}

colButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!gameStarted || gameOver || currentPlayer !== myPlayer) return;
    if (fallingDisc) return; // wacht tot animatie klaar is
    const col = parseInt(btn.dataset.col);
    ws.send(JSON.stringify({ type: "move", col }));
  });
});

// ===== WEBSOCKET =====
function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => setStatus("Verbonden! Wachten op tweede speler...");

  ws.onmessage = (e) => handleMessage(JSON.parse(e.data));

  ws.onclose = () => {
    setStatus("Verbinding verloren. Herlaad de pagina.");
    gameStarted = false;
    updateColButtons();
  };

  ws.onerror = () => setStatus("❌ Kan niet verbinden met server.");
}

function handleMessage(msg) {
  switch (msg.type) {

    case "assigned":
      myPlayer      = msg.playerNumber;
      board         = msg.board;
      currentPlayer = msg.currentPlayer;
      gameStarted   = msg.gameStarted;
      updatePlayerLabels();
      updateColButtons();
      drawAll();
      setStatus(gameStarted ? getTurnMessage() : "Wachten op tweede speler...");
      break;

    case "start":
      board         = msg.board;
      currentPlayer = msg.currentPlayer;
      gameStarted   = true;
      gameOver      = false;
      winningCells  = [];
      pulsePhase    = 0;
      fallingDisc   = null;
      restartBtn.disabled = false;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      updateColButtons();
      updateActivePlayer();
      drawAll();
      setStatus(getTurnMessage());
      break;

    case "update":
      board         = msg.board;
      currentPlayer = msg.currentPlayer;
      updateColButtons();
      updateActivePlayer();
      setStatus(getTurnMessage());
      if (msg.lastMove) {
        startFallAnimation(msg.lastMove.col, msg.lastMove.player, msg.lastMove.row);
      } else {
        drawAll();
      }
      break;

    case "gameOver":
      board        = msg.board;
      winningCells = msg.winningCells;
      gameOver     = true;
      gameStarted  = false;
      updateColButtons();
      if (msg.lastMove) {
        startFallAnimation(msg.lastMove.col, msg.lastMove.player, msg.lastMove.row);
        setTimeout(() => showWinOverlay(msg.winner), 800);
      } else {
        startPulseLoop();
        setTimeout(() => showWinOverlay(msg.winner), 300);
      }
      break;

    case "draw":
      board       = msg.board;
      gameOver    = true;
      gameStarted = false;
      updateColButtons();
      drawAll();
      setTimeout(() => showDrawOverlay(), 400);
      break;

    case "restart":
      board         = msg.board;
      currentPlayer = msg.currentPlayer;
      gameOver      = false;
      gameStarted   = true;
      winningCells  = [];
      fallingDisc   = null;
      pulsePhase    = 0;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      hideOverlay();
      updateColButtons();
      updateActivePlayer();
      drawAll();
      setStatus(getTurnMessage());
      break;

    case "playerLeft":
      setStatus("⚠️ " + msg.message);
      gameStarted = false;
      updateColButtons();
      break;

    case "error":
      setStatus("❌ " + msg.message);
      break;
  }
}

// ===== OVERLAY =====
function showWinOverlay(winner) {
  const isMe = winner === myPlayer;
  overlayIcon.textContent  = isMe ? "🏆" : "😔";
  overlayTitle.textContent = isMe ? "Gewonnen!" : "Verloren!";
  overlaySub.textContent   = isMe
    ? "Gefeliciteerd, jij hebt 4 op een rij!"
    : `Speler ${winner} heeft 4 op een rij!`;
  overlayEl.classList.remove("hidden");
}

function showDrawOverlay() {
  overlayIcon.textContent  = "🤝";
  overlayTitle.textContent = "Gelijkspel!";
  overlaySub.textContent   = "Het bord is vol, niemand wint!";
  overlayEl.classList.remove("hidden");
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
}

// ===== HULPFUNCTIES =====
function setStatus(msg) {
  statusMessage.textContent = msg;
}

function getTurnMessage() {
  return currentPlayer === myPlayer
    ? "⚡ Jouw beurt!"
    : "⏳ Wachten op tegenstander...";
}

function updatePlayerLabels() {
  if (myPlayer === 1) {
    player1Label.textContent = "Jij (Rood)";
    player2Label.textContent = "Tegenstander (Geel)";
  } else {
    player1Label.textContent = "Tegenstander (Rood)";
    player2Label.textContent = "Jij (Geel)";
  }
  updateActivePlayer();
}

function updateActivePlayer() {
  player1Info.classList.toggle("active", currentPlayer === 1);
  player2Info.classList.toggle("active", currentPlayer === 2);
}

// ===== RESTART =====
restartBtn.addEventListener("click", sendRestart);
overlayRestart.addEventListener("click", sendRestart);

function sendRestart() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "restart" }));
  }
}

// ===== START =====
// Bord canvas 1x tekenen bij opstarten (verandert nooit)
drawBoardCanvas();
// Disc canvas tekenen
drawAll();
// WebSocket verbinding starten
connect();