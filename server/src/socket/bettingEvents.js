const { rooms } = require("../rooms/roomStore");
const { broadcastPrivateRoomState } = require("../rooms/roomState");
const { evaluateHand, compareScores } = require("../gameLogic/handEvaluator");
const { completeRound } = require("../gameLogic/roundFlow");
const { getCurrentPlayer, getActivePlayers, nextActiveIndex, isCurrentPlayersSocket, attachSocketToPlayer } = require("../rooms/roomHelpers");

function previousActiveIndex(room, fromIndex) {
  for (let step = 1; step <= room.players.length; step++) {
    const idx = (fromIndex - step + room.players.length) % room.players.length;
    if (!room.players[idx].folded) return idx;
  }
  return fromIndex;
}


function clearSideReveal(room) {
  room.sideReveal = null;
}

function hasLaterActiveBlindPlayer(room, fromIndex) {
  for (let step = 1; step < room.players.length; step++) {
    const idx = (fromIndex + step) % room.players.length;
    const player = room.players[idx];
    if (player.folded) continue;
    if (!player.sawCards) return true;
  }
  return false;
}

function cutIsRequiredForCurrentPlayer(room) {
  const player = getCurrentPlayer(room);
  if (!player || player.folded || player.sawCards) return false;
  if ((player.cutLockTurns || 0) > 0) return false;
  const previousPlayer = room.players[previousActiveIndex(room, room.turnIndex)];
  return !!previousPlayer?.sawCards && hasLaterActiveBlindPlayer(room, room.turnIndex);
}

function registerBettingEvents(io, socket) {
  socket.on("seeCards", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "betting") return callback?.({ success: false, error: "Cards can be seen only during betting." });
    if (!isCurrentPlayersSocket(room, socket.id)) return callback?.({ success: false, error: "It is not your turn." });
    clearSideReveal(room);
    const player = getCurrentPlayer(room);
    if (cutIsRequiredForCurrentPlayer(room)) return callback?.({ success: false, error: "Cut is required now. You cannot See Cards on this turn." });
    if (player.sawCards) return callback?.({ success: false, error: "Already seen cards." });
    player.sawCards = true;
    player.cutLockTurns = 0;
    player.status = "Open";
    room.lastActionMessage = `${player.name} opened their cards.`;
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("blindBet", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "betting") return callback?.({ success: false, error: "Blind Bet only during betting." });
    if (!isCurrentPlayersSocket(room, socket.id)) return callback?.({ success: false, error: "It is not your turn." });
    clearSideReveal(room);
    const player = getCurrentPlayer(room);
    if (player.sawCards) return callback?.({ success: false, error: "Blind Bet not allowed after seeing cards." });
    if (cutIsRequiredForCurrentPlayer(room)) return callback?.({ success: false, error: "Cut is required now. Blind Bet is not available on this turn." });
    player.coins -= 1;
    room.pot += 1;
    let cutMessage = "";
    if (player.cutLockTurns > 0) {
      player.cutLockTurns -= 1;
      if (player.cutLockTurns === 0) {
        player.sawCards = true;
        player.status = "Open";
        cutMessage = " Cut protection ended, so cards are now open.";
      } else {
        player.status = `Cut Blind (${player.cutLockTurns} turns left)`;
        cutMessage = ` Cut lock remaining: ${player.cutLockTurns}.`;
      }
    } else {
      player.status = "Blind";
    }
    room.lastActionMessage = `${player.name} placed Blind Bet: 1 coin.${cutMessage}`;
    room.turnIndex = nextActiveIndex(room, room.turnIndex);
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("cut", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "betting") return callback?.({ success: false, error: "Cut is allowed only during betting." });
    if (!isCurrentPlayersSocket(room, socket.id)) return callback?.({ success: false, error: "It is not your turn." });
    const player = getCurrentPlayer(room);
    if (player.sawCards) return callback?.({ success: false, error: "Open player cannot use Cut." });
    const previousPlayer = room.players[previousActiveIndex(room, room.turnIndex)];
    if (!previousPlayer?.sawCards) return callback?.({ success: false, error: "Cut is available only after the previous active player is Open." });
    if (!hasLaterActiveBlindPlayer(room, room.turnIndex)) return callback?.({ success: false, error: "Cut is available only when at least one later active player is still Blind." });
    if (player.cutLockTurns > 0) return callback?.({ success: false, error: "You already used Cut. Continue Blind or See Cards." });
    player.coins -= 1;
    room.pot += 1;
    player.sawCards = false;
    player.cutLockTurns = 3;
    player.status = "Cut / Blind (3 turns left)";

    room.players = room.players.map((p) => {
      if (!p.folded && p.id !== player.id) return { ...p, sawCards: true, status: p.status === "Dropped" ? p.status : "Open" };
      return p;
    });

    room.lastActionMessage = `${player.name} used Cut and stays Blind. All other active players are Open. ${player.name} may continue Blind for up to 3 of their own turns, but can See Cards earlier.`;
    room.turnIndex = nextActiveIndex(room, room.turnIndex);
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("openBet", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "betting") return callback?.({ success: false, error: "Open Bet only during betting." });
    if (!isCurrentPlayersSocket(room, socket.id)) return callback?.({ success: false, error: "It is not your turn." });
    clearSideReveal(room);
    const player = getCurrentPlayer(room);
    if (!player.sawCards) return callback?.({ success: false, error: "You must see cards before Open Bet." });
    player.coins -= 2;
    room.pot += 2;
    player.status = "Open";
    room.lastActionMessage = `${player.name} placed Open Bet: 2 coins.`;
    room.turnIndex = nextActiveIndex(room, room.turnIndex);
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("drop", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "betting") return callback?.({ success: false, error: "Drop only during betting." });
    if (!isCurrentPlayersSocket(room, socket.id)) return callback?.({ success: false, error: "It is not your turn." });
    clearSideReveal(room);
    const player = getCurrentPlayer(room);
    player.folded = true;
    player.status = "Dropped";
    const remaining = getActivePlayers(room);
    if (remaining.length === 1) {
      completeRound(room, remaining[0], `${remaining[0].name} wins because all other players dropped.`);
    } else {
      room.lastActionMessage = `${player.name} dropped.`;
      room.turnIndex = nextActiveIndex(room, room.turnIndex);
    }
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("askShow", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "betting") return callback?.({ success: false, error: "Show only during betting." });
    if (!isCurrentPlayersSocket(room, socket.id)) return callback?.({ success: false, error: "It is not your turn." });
    clearSideReveal(room);
    const active = getActivePlayers(room);
    if (active.length !== 2) return callback?.({ success: false, error: "Show allowed only when exactly two players remain." });
    const asker = getCurrentPlayer(room);
    asker.coins -= 2;
    asker.sawCards = true;
    asker.status = "Asked Show";
    room.pot += 2;
    const finalists = getActivePlayers(room);
    const handA = evaluateHand(finalists[0].cards, room.roundType, room.oneCardMode);
    const handB = evaluateHand(finalists[1].cards, room.roundType, room.oneCardMode);
    const comparison = compareScores(handA, handB);
    let winner = comparison > 0 ? finalists[0] : comparison < 0 ? finalists[1] : finalists.find((p) => p.id !== asker.id);
    const loser = finalists.find((p) => p.id !== winner.id);
    completeRound(room, winner, `${asker.name} asked for Show. ${loser?.name || "Opponent"} showed cards.`);
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });
}
module.exports = { registerBettingEvents };
