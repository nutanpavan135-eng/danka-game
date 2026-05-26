const { rooms, deleteRoom, saveRooms, touchRoom } = require("../rooms/roomStore");
const { generateRoomCode, createPlayer, createRoom } = require("../rooms/roomFactory");
const { getRoomStateForPlayer, broadcastPrivateRoomState } = require("../rooms/roomState");
const { calculateCycleTarget, attachSocketToPlayer } = require("../rooms/roomHelpers");
const { createDeck, shuffleDeck } = require("../gameLogic/cards");
const { LIMITS } = require("../../../shared/ruleConstants");

function registerRoomEvents(io, socket) {
  socket.on("createRoom", ({ playerName, startingCoins, cyclesPerRound }, callback) => {
    const rawCoins = Number(startingCoins);
    const safeCoins = Number.isFinite(rawCoins) ? Math.floor(rawCoins) : 0;
    const rawCycles = Number(cyclesPerRound);
    const safeCyclesPerRound = Number.isFinite(rawCycles) && rawCycles > 0 ? Math.max(1, Math.min(Math.floor(rawCycles), 50)) : 20;
    const roomCode = generateRoomCode();
    const adminPlayer = createPlayer({ socketId: socket.id, name: playerName, isAdmin: true, startingCoins: safeCoins });
    const room = createRoom({ roomCode, adminPlayer, startingCoins: safeCoins, cyclesPerRound: safeCyclesPerRound });
    rooms.set(roomCode, room);
    socket.join(roomCode);
    callback?.({ success: true, roomCode, playerId: adminPlayer.id, room: getRoomStateForPlayer(room, adminPlayer.id) });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("joinRoom", ({ roomCode, playerName }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    if (room.status !== "lobby") return callback?.({ success: false, error: "Game has already started." });
    if (room.players.length >= LIMITS.MAX_PLAYERS) return callback?.({ success: false, error: "Room is full." });
    if (room.players.some((p) => p.name.toLowerCase() === String(playerName || "").trim().toLowerCase())) {
      return callback?.({ success: false, error: "Name already exists in this room." });
    }
    const player = createPlayer({ socketId: socket.id, name: playerName, isAdmin: false, startingCoins: room.startingCoins });
    if (!room.coAdminPlayerId && room.players.length >= 1) {
      room.coAdminPlayerId = player.id;
      player.role = "co-admin";
    }
    room.players.push(player);
    room.lastActionMessage = `${player.name} joined the room.`;
    socket.join(room.roomCode);
    callback?.({ success: true, roomCode: room.roomCode, playerId: player.id, room: getRoomStateForPlayer(room, player.id) });
    broadcastPrivateRoomState(io, room);
  });



  socket.on("reconnectRoom", ({ roomCode, playerId }, callback) => {
    const safeRoomCode = String(roomCode || "").trim();
    const room = rooms.get(safeRoomCode);
    if (!room) {
      return callback?.({ success: false, error: "Saved room was not found. It may have expired after a server restart. Please create or join a new room." });
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      return callback?.({ success: false, error: "Saved player was not found in this room. Please rejoin with your name." });
    }

    attachSocketToPlayer(room, socket, player.id);
    room.lastActionMessage = `${player.name} reconnected to the game.`;
    callback?.({ success: true, roomCode: room.roomCode, playerId: player.id, room: getRoomStateForPlayer(room, player.id) });
    broadcastPrivateRoomState(io, room);
  });



  socket.on("syncRoom", ({ roomCode, playerId }, callback) => {
    const safeRoomCode = String(roomCode || "").trim();
    const room = rooms.get(safeRoomCode);
    if (!room) {
      return callback?.({ success: false, error: "Room not found. It may have expired or the session ended." });
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      return callback?.({ success: false, error: "Player not found in this room. Please rejoin." });
    }

    attachSocketToPlayer(room, socket, player.id);
    socket.join(room.roomCode);
    touchRoom(room, "sync-room");
    saveRooms();
    callback?.({ success: true, roomCode: room.roomCode, playerId: player.id, room: getRoomStateForPlayer(room, player.id) });
  });

  socket.on("startGame", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (playerId !== room.adminPlayerId) return callback?.({ success: false, error: "Only admin can start." });
    if (room.players.length < LIMITS.MIN_PLAYERS) return callback?.({ success: false, error: "At least 2 players required." });
    room.status = "placeCut";
    room.cycleTarget = room.cyclesPerRound || calculateCycleTarget(room.players.length);
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

  socket.on("leaveRoom", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. It may have expired or the session ended." });
    attachSocketToPlayer(room, socket, playerId);
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return callback?.({ success: false, error: "Player not found." });

    const [leaving] = room.players.splice(idx, 1);
    socket.leave(room.roomCode);

    // Remove old Place Cut references for the leaving player so future setup screens stay clean.
    room.placeCutPicks = (room.placeCutPicks || []).filter((p) => p.playerId !== leaving.id);
    room.placeCutOrder = (room.placeCutOrder || []).filter((p) => p.playerId !== leaving.id);

    if (room.players.length === 0) {
      deleteRoom(room.roomCode);
      return callback?.({ success: true });
    }

    if (leaving.id === room.adminPlayerId) {
      const nextAdmin = room.players.find((p) => p.id === room.coAdminPlayerId) || room.players[0];
      room.adminPlayerId = nextAdmin.id;
      room.coAdminPlayerId = room.players.find((p) => p.id !== nextAdmin.id)?.id || null;
      room.players = room.players.map((p, i) => ({
        ...p,
        role: p.id === room.adminPlayerId ? "admin" : p.id === room.coAdminPlayerId ? "co-admin" : "player",
      }));
    } else if (leaving.id === room.coAdminPlayerId) {
      const nextCoAdmin = room.players.find((p) => p.id !== room.adminPlayerId) || null;
      room.coAdminPlayerId = nextCoAdmin?.id || null;
      room.players = room.players.map((p) => ({
        ...p,
        role: p.id === room.adminPlayerId ? "admin" : p.id === room.coAdminPlayerId ? "co-admin" : "player",
      }));
    }

    room.dealerIndex = Math.max(0, Math.min(room.dealerIndex || 0, room.players.length - 1));
    room.turnIndex = Math.max(0, Math.min(room.turnIndex || 0, room.players.length - 1));
    room.seatCount = room.players.length;

    if (room.players.length < LIMITS.MIN_PLAYERS && !["lobby", "sessionEnded"].includes(room.status)) {
      room.status = "sessionEnded";
      room.lastActionMessage = `${leaving.name} left the room. Session ended because fewer than two players remain.`;
    } else {
      room.lastActionMessage = `${leaving.name} left the room.`;
    }

    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });
}
module.exports = { registerRoomEvents };
