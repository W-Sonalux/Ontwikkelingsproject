const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 8080;
const ROWS = 6;
const COLS = 5;
const WIN_COUNT = 4;

// ===== HTTP SERVER =====
const httpServer = http.createServer((req, res) => {
  let filePath = path.join(
    __dirname,
    "../frontend",
    req.url === "/" ? "index.html" : req.url
  );

  const ext = path.extname(filePath);
  const mimeTypes = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
  };

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Niet gevonden");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
    res.end(data);
  });
});

// ===== WEBSOCKET SERVER =====
const wss = new WebSocket.Server({ server: httpServer });

let gameState = {
  board: Array(ROWS)
    .fill(null)
    .map(() => Array(COLS).fill(null)),
  currentPlayer: 1,
  winner: null,
  winningCells: [],
  players: {},
  connectedPlayers: 0,
  gameStarted: false,
};

let clientIdCounter = 0;

function resetGame() {
  gameState.board = Array(ROWS)
    .fill(null)
    .map(() => Array(COLS).fill(null));
  gameState.currentPlayer = 1;
  gameState.winner = null;
  gameState.winningCells = [];
  gameState.gameStarted = gameState.connectedPlayers === 2;
}

function checkWinner(board, row, col, player) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of directions) {
    let cells = [[row, col]];

    for (let i = 1; i < WIN_COUNT; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        cells.push([r, c]);
      } else break;
    }

    for (let i = 1; i < WIN_COUNT; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        cells.push([r, c]);
      } else break;
    }

    if (cells.length >= WIN_COUNT) return cells;
  }
  return null;
}

function checkDraw(board) {
  return board.every((row) => row.every((cell) => cell !== null));
}

function broadcast(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on("connection", (ws) => {
  const clientId = ++clientIdCounter;

  if (gameState.connectedPlayers >= 2) {
    ws.send(JSON.stringify({ type: "error", message: "Spel is al vol!" }));
    ws.close();
    return;
  }

  gameState.connectedPlayers++;
  const playerNumber = gameState.connectedPlayers;
  gameState.players[clientId] = playerNumber;

  console.log(`Speler ${playerNumber} verbonden (client ${clientId})`);

  ws.send(
    JSON.stringify({
      type: "assigned",
      playerNumber,
      board: gameState.board,
      currentPlayer: gameState.currentPlayer,
      gameStarted: gameState.connectedPlayers === 2,
    })
  );

  if (gameState.connectedPlayers === 2) {
    gameState.gameStarted = true;
    broadcast({
      type: "start",
      board: gameState.board,
      currentPlayer: gameState.currentPlayer,
    });
  }

  ws.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data);
    } catch {
      return;
    }

    if (message.type === "move") {
      const { col } = message;
      const player = gameState.players[clientId];

      if (!gameState.gameStarted) return;
      if (gameState.winner) return;
      if (gameState.currentPlayer !== player) return;

      // Vind de laagste lege rij in de kolom
      let targetRow = -1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (gameState.board[r][col] === null) {
          targetRow = r;
          break;
        }
      }
      if (targetRow === -1) return; // Kolom vol

      gameState.board[targetRow][col] = player;

      const winningCells = checkWinner(
        gameState.board,
        targetRow,
        col,
        player
      );
      if (winningCells) {
        gameState.winner = player;
        gameState.winningCells = winningCells;
        broadcast({
          type: "gameOver",
          board: gameState.board,
          winner: player,
          winningCells,
          lastMove: { row: targetRow, col, player },
        });
        return;
      }

      if (checkDraw(gameState.board)) {
        broadcast({ type: "draw", board: gameState.board });
        return;
      }

      gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
      broadcast({
        type: "update",
        board: gameState.board,
        currentPlayer: gameState.currentPlayer,
        lastMove: { row: targetRow, col, player },
      });
    }

    if (message.type === "restart") {
      resetGame();
      broadcast({
        type: "restart",
        board: gameState.board,
        currentPlayer: gameState.currentPlayer,
      });
    }
  });

  ws.on("close", () => {
    console.log(`Speler ${playerNumber} verbroken (client ${clientId})`);
    delete gameState.players[clientId];
    gameState.connectedPlayers--;

    if (gameState.connectedPlayers < 2) {
      gameState.gameStarted = false;
      broadcast({
        type: "playerLeft",
        message: "De andere speler heeft de verbinding verbroken.",
      });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server gestart → http://localhost:${PORT}`);
});