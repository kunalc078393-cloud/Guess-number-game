const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(express.json());

const ADMIN_USER = "admin";
const ADMIN_PASS = "1234";

let gameKey = null;
let maxPlayers = 5;
let chancesPerPlayer = 5;
let players = {};
let secretNumber = null;
let gameActive = false;

// Admin login
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ success: true });
  }
  res.json({ success: false, message: "Invalid credentials" });
});

// Admin generates key
app.post("/admin/generateKey", async (req, res) => {
  gameKey = Math.random().toString(36).substring(2, 8).toUpperCase();
  maxPlayers = req.body.maxPlayers || 5;
  chancesPerPlayer = req.body.chancesPerPlayer || 5;
  secretNumber = Math.floor(Math.random() * 100) + 1;
  gameActive = true;
  players = {};

  const joinUrl = `http://localhost:3000/game.html?key=${gameKey}`;
  const qr = await QRCode.toDataURL(joinUrl);

  res.json({ success: true, key: gameKey, qr });
});

// Player join request
app.post("/join", (req, res) => {
  const { key, playerName } = req.body;
  if (!gameActive || key !== gameKey) {
    return res.json({ success: false, message: "Invalid or expired key" });
  }
  if (Object.keys(players).length >= maxPlayers) {
    return res.json({ success: false, message: "Room full" });
  }
  players[playerName] = { chancesLeft: chancesPerPlayer, won: false };
  return res.json({ success: true, chances: chancesPerPlayer });
});

// Socket handling
io.on("connection", (socket) => {
  socket.on("guess", ({ playerName, guess }) => {
    if (!players[playerName] || players[playerName].won) return;

    if (players[playerName].chancesLeft <= 0) {
      socket.emit("result", { message: "Out of chances! Restarting your game." });
      players[playerName].chancesLeft = chancesPerPlayer;
      secretNumber = Math.floor(Math.random() * 100) + 1;
      return;
    }

    players[playerName].chancesLeft--;

    if (guess == secretNumber) {
      players[playerName].won = true;
      io.emit("gameOver", { winner: playerName, number: secretNumber });
      gameActive = false;
      gameKey = null;
    } else if (guess < secretNumber) {
      socket.emit("result", { message: "Number is greater" });
    } else {
      socket.emit("result", { message: "Number is smaller" });
    }
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
