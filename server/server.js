const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { PORT, CLIENT_ORIGIN } = require("./src/config/serverConfig");
const { rooms, loadRooms, saveRooms, getStoreMode, getStoreDetails } = require("./src/rooms/roomStore");
const { broadcastPrivateRoomState } = require("./src/rooms/roomState");
const { registerRoomEvents } = require("./src/socket/roomEvents");
const { registerSetupEvents } = require("./src/socket/setupEvents");
const { registerBettingEvents } = require("./src/socket/bettingEvents");
const { registerAdvancedEvents } = require("./src/socket/advancedEvents");

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN === "*" ? true : CLIENT_ORIGIN }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CLIENT_ORIGIN === "*" ? true : CLIENT_ORIGIN, methods: ["GET", "POST"] } });

app.get("/", (req, res) => res.send("Danka backend server is running — Prototype 5.30 Redis/Key Value persistence ready"));
app.get("/health", (req, res) => res.json({
  status: "ok",
  prototype: "5.30-redis-key-value-persistence",
  activeRooms: rooms.size,
  roomStore: getStoreMode(),
  roomStoreDetails: getStoreDetails(),
}));

function findPlayerRoom(socketId) {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.socketId === socketId);
    if (player) return room;
  }
  return null;
}

io.on("connection", (socket) => {
  console.log(`Connected: ${socket.id}`);
  socket.emit("connected", { socketId: socket.id, message: "Connected to Danka backend." });

  registerRoomEvents(io, socket);
  registerSetupEvents(io, socket);
  registerBettingEvents(io, socket);
  registerAdvancedEvents(io, socket);

  socket.on("disconnect", () => {
    console.log(`Disconnected: ${socket.id}`);
    const room = findPlayerRoom(socket.id);
    if (!room) return;
    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return;
    player.connected = false;
    player.status = "Disconnected";
    room.lastActionMessage = `${player.name} disconnected.`;
    saveRooms();
    broadcastPrivateRoomState(io, room);
  });
});

async function startServer() {
  await loadRooms();
  server.listen(PORT, () => console.log(`Danka backend running on http://localhost:${PORT} with ${getStoreMode()}`));
}

startServer().catch((err) => {
  console.error("Failed to start Danka backend:", err);
  process.exit(1);
});
