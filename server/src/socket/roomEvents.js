const { rooms } = require("../rooms/roomStore");
const { generateRoomCode, createPlayer, createRoom } = require("../rooms/roomFactory");
const { getRoomStateForPlayer, broadcastPrivateRoomState } = require("../rooms/roomState");
const { calculateCycleTarget } = require("../rooms/roomHelpers");
const { createDeck, shuffleDeck } = require("../gameLogic/cards");
const { LIMITS } = require("../../../shared/ruleConstants");

function registerRoomEvents(io, socket) {
  socket.on("createRoom", ({ playerName, startingCoins }, callback) => {
    const safeCoins = Number(startingCoins) > 0 ? Number(startingCoins) : 100;
    const roomCode = generateRoomCode();
    const adminPlayer = createPlayer({ socketId: socket.id, name: playerName, isAdmin: true, startingCoins: safeCoins });
    const room = createRoom({ roomCode, adminPlayer, startingCoins: safeCoins });
    rooms.set(roomCode, room);
    socket.join(roomCode);
    callback?.({ success: true, roomCode, playerId: adminPlayer.id, room: getRoomStateForPlayer(room, adminPlayer.id) });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("joinRoom", ({ roomCode, playerName }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found." });
    if (room.status !== "lobby") return callback?.({ success: false, error: "Game has already started." });
    if (room.players.length >= LIMITS.MAX_PLAYERS) return callback?.({ success: false, error: "Room is full." });
    if (room.players.some((p) => p.name.toLowerCase() === String(playerName || "").trim().toLowerCase())) {
      return callback?.({ success: false, error: "Name already exists in this room." });
    }
    const player = createPlayer({ socketId: socket.id, name: playerName, isAdmin: false, startingCoins: room.startingCoins });
    room.players.push(player);
    room.lastActionMessage = `${player.name} joined the room.`;
    socket.join(room.roomCode);
    callback?.({ success: true, roomCode: room.roomCode, playerId: player.id, room: getRoomStateForPlayer(room, player.id) });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("startGame", ({ roomCode }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found." });
    if (socket.id !== room.adminPlayerId) return callback?.({ success: false, error: "Only admin can start." });
    if (room.players.length < LIMITS.MIN_PLAYERS) return callback?.({ success: false, error: "At least 2 players required." });
    room.status = "placeCut";
    room.cycleTarget = calculateCycleTarget(room.players.length);
    room.placeCutDeck = shuffleDeck(createDeck());
    room.placeCutPicks = [];
    room.placeCutOrder = [];
    room.seatCount = room.players.length;
    room.chosenSeatIndex = null;
    room.players = room.players.map((p) => ({ ...p, status: "Waiting to Pick" }));
    room.lastActionMessage = "Game started. Each player must click Pick Card for Place Cut.";
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("leaveRoom", ({ roomCode }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found." });
    const idx = room.players.findIndex((p) => p.socketId === socket.id);
    if (idx === -1) return callback?.({ success: false, error: "Player not found." });
    const [leaving] = room.players.splice(idx, 1);
    socket.leave(room.roomCode);
    if (room.players.length === 0) { rooms.delete(room.roomCode); return callback?.({ success: true }); }
    if (leaving.id === room.adminPlayerId) { room.adminPlayerId = room.players[0].id; room.players[0].role = "admin"; }
    room.lastActionMessage = `${leaving.name} left the room.`;
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });
}
module.exports = { registerRoomEvents };
