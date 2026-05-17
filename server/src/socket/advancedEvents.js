const { rooms } = require("../rooms/roomStore");
const { broadcastPrivateRoomState } = require("../rooms/roomState");
const { evaluateHand, compareScores } = require("../gameLogic/handEvaluator");
const { completeRound, startNextRoundFromRoundOver, prepareFreshCycle, dealCardsDirectly } = require("../gameLogic/roundFlow");
const { calculateSettlement } = require("../gameLogic/settlement");
const { getCurrentPlayer, getActivePlayers, nextActiveIndex, isCurrentPlayersSocket, attachSocketToPlayer, findPreviousActiveIndex, findDealerLeftIndex } = require("../rooms/roomHelpers");

function compareSideCards(requesterCards, opponentCards) {
  const a = [...(requesterCards || [])].sort((x, y) => y.value - x.value);
  const b = [...(opponentCards || [])].sort((x, y) => y.value - x.value);
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    const av = a[i]?.value || 0;
    const bv = b[i]?.value || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function registerAdvancedEvents(io, socket) {
  socket.on("askSide", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "betting") return callback?.({ success: false, error: "Side only during betting." });
    if (!isCurrentPlayersSocket(room, socket.id)) return callback?.({ success: false, error: "It is not your turn." });
    const active = getActivePlayers(room);
    if (active.length <= 2) return callback?.({ success: false, error: "Use Show when only two players remain." });
    if (!active.every((p) => p.sawCards)) return callback?.({ success: false, error: "Side only after all active players are Open." });
    const requester = getCurrentPlayer(room);
    if (!requester.sawCards) return callback?.({ success: false, error: "You must be Open before Side." });
    if (requester.coins < 2) return callback?.({ success: false, error: "Not enough coins." });
    const opponentIndex = findPreviousActiveIndex(room, room.turnIndex);
    const opponent = room.players[opponentIndex];
    requester.coins -= 2;
    requester.status = "Asked Side";
    room.pot += 2;
    room.sideReveal = {
      viewerIds: [requester.id, opponent.id],
      participantIds: [requester.id, opponent.id],
      message: `${requester.name} asked Side with ${opponent.name}. Only these two players can view each other's cards for this Side comparison.`,
    };
    const comparison = compareSideCards(requester.cards, opponent.cards);
    // Side uses card-by-card rank comparison: highest card first, then second, then third.
    // If all card ranks are tied, the requester loses/drops.
    const winner = comparison > 0 ? requester : opponent;
    const loser = comparison > 0 ? opponent : requester;
    loser.folded = true;
    loser.status = "Dropped by Side";
    winner.status = "Won Side";
    const remaining = getActivePlayers(room);
    if (remaining.length === 1) {
      completeRound(room, remaining[0], `${requester.name} asked Side with ${opponent.name}. ${loser.name} lost. ${remaining[0].name} wins the pot.`);
    } else {
      room.turnIndex = nextActiveIndex(room, room.turnIndex);
      room.lastActionMessage = `${requester.name} asked Side with ${opponent.name}. ${winner.name} won Side. ${loser.name} dropped.`;
    }
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });


  socket.on("chooseOneCardMode", ({ roomCode, mode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "chooseOneCardMode") return callback?.({ success: false, error: "Single-card mode choice is not available now." });
    const chooserIndex = findDealerLeftIndex(room);
    const chooser = room.players[chooserIndex];
    if (!chooser || chooser.socketId !== socket.id) {
      return callback?.({ success: false, error: `Only ${chooser?.name || "the dealer's left-side player"} can choose Highest or Lowest for this single-card cycle.` });
    }
    const selectedMode = mode === "lowest" ? "lowest" : "highest";
    room.oneCardMode = selectedMode;
    room.roundType = "one";
    const label = selectedMode === "lowest" ? "Lowest Card Wins" : "Highest Card Wins";
    room.oneCardModeAnnouncement = {
      id: Date.now(),
      text: label,
      mode: selectedMode,
    };
    dealCardsDirectly(room, `${chooser.name} confirmed ${label} for this single-card cycle.`);
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("startNextRound", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "roundOver") return callback?.({ success: false, error: "Next round only after round over." });
    const dealer = room.players[room.dealerIndex];
    if (dealer?.socketId !== socket.id) return callback?.({ success: false, error: `Only ${dealer?.name || "the dealer"} can deal the next cycle.` });
    startNextRoundFromRoundOver(room);
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("requestPlaceCut", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "cycleBreak") return callback?.({ success: false, error: "Place Cut only at cycle break." });
    const requester = room.players.find((p) => p.socketId === socket.id);
    if (!requester) return callback?.({ success: false, error: "Player not found." });
    prepareFreshCycle(room, `${requester.name} requested Place Cut. Fresh cycle started.`);
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("continueSamePlayers", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "cycleBreak") return callback?.({ success: false, error: "Continue only at cycle break." });
    if (socket.id !== room.adminPlayerId) return callback?.({ success: false, error: "Only admin can continue." });
    prepareFreshCycle(room, "Admin continued with same players. Fresh cycle started.");
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("leaveGameAtCycleBreak", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "cycleBreak") return callback?.({ success: false, error: "Players can leave only at cycle break." });
    const idx = room.players.findIndex((p) => p.socketId === socket.id);
    if (idx === -1) return callback?.({ success: false, error: "Player not found." });
    const settlement = calculateSettlement(room.players);
    const [leaving] = room.players.splice(idx, 1);
    if (room.players.length < 2) {
      room.status = "sessionEnded";
      room.settlement = settlement;
      room.lastActionMessage = `${leaving.name} left. Not enough players remain, so session ended.`;
    } else {
      if (leaving.id === room.adminPlayerId) { room.adminPlayerId = room.players[0].id; room.players[0].role = "admin"; }
      room.settlement = settlement;
      prepareFreshCycle(room, `${leaving.name} left at cycle break. Settlement generated. Remaining players start fresh cycle.`);
    }
    callback?.({ success: true, settlement });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("endSession", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (socket.id !== room.adminPlayerId) return callback?.({ success: false, error: "Only admin can end session." });
    const safeEndStatuses = ["lobby", "cycleBreak", "roundOver"];
    if (!safeEndStatuses.includes(room.status)) {
      return callback?.({ success: false, error: "End Session is available only after the current cycle is finished." });
    }
    room.status = "sessionEnded";
    room.settlement = calculateSettlement(room.players);
    room.lastActionMessage = "Session ended. Final settlement generated.";
    callback?.({ success: true, settlement: room.settlement });
    broadcastPrivateRoomState(io, room);
  });
}
module.exports = { registerAdvancedEvents };
