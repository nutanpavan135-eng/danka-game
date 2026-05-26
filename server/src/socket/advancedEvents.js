const { rooms } = require("../rooms/roomStore");
const { broadcastPrivateRoomState } = require("../rooms/roomState");
const { evaluateHand, compareScores } = require("../gameLogic/handEvaluator");
const { completeRound, startNextRoundFromRoundOver, prepareFreshCycle, dealCardsDirectly } = require("../gameLogic/roundFlow");
const { calculateSettlement } = require("../gameLogic/settlement");
const { getCurrentPlayer, getActivePlayers, nextActiveIndex, isCurrentPlayersSocket, attachSocketToPlayer, findPreviousActiveIndex, findDealerLeftIndex } = require("../rooms/roomHelpers");

function compareSideHands(requesterCards, opponentCards, roundType, oneCardMode) {
  const requesterHand = evaluateHand(requesterCards, roundType, oneCardMode);
  const opponentHand = evaluateHand(opponentCards, roundType, oneCardMode);
  return compareScores(requesterHand, opponentHand);
}


function isRoomManager(room, playerId) {
  return !!playerId && (playerId === room.adminPlayerId || playerId === room.coAdminPlayerId || room.players.find((p) => p.id === playerId)?.role === "admin" || room.players.find((p) => p.id === playerId)?.role === "co-admin");
}

function normalizeRoomManagers(room) {
  if (!room.players.length) {
    room.adminPlayerId = null;
    room.coAdminPlayerId = null;
    return;
  }
  let admin = room.players.find((p) => p.id === room.adminPlayerId);
  if (!admin) {
    admin = room.players.find((p) => p.id === room.coAdminPlayerId) || room.players[0];
    room.adminPlayerId = admin.id;
  }
  let coAdmin = room.players.find((p) => p.id === room.coAdminPlayerId && p.id !== room.adminPlayerId);
  if (!coAdmin) {
    coAdmin = room.players.find((p) => p.id !== room.adminPlayerId) || null;
    room.coAdminPlayerId = coAdmin?.id || null;
  }
  room.players = room.players.map((p) => ({
    ...p,
    role: p.id === room.adminPlayerId ? "admin" : p.id === room.coAdminPlayerId ? "co-admin" : "player",
  }));
}

function removePlayerReferences(room, removedId) {
  room.placeCutPicks = (room.placeCutPicks || []).filter((p) => p.playerId !== removedId);
  room.placeCutOrder = (room.placeCutOrder || []).filter((p) => p.playerId !== removedId);
  if (room.sideReveal) {
    room.sideReveal.viewerIds = (room.sideReveal.viewerIds || []).filter((id) => id !== removedId);
    room.sideReveal.participantIds = (room.sideReveal.participantIds || []).filter((id) => id !== removedId);
  }
}

function emergencyRemovePlayerFromRoom(room, targetPlayerId, managerName) {
  const targetIndex = room.players.findIndex((p) => p.id === targetPlayerId);
  if (targetIndex === -1) return { success: false, error: "Player not found." };
  const target = room.players[targetIndex];
  const targetWasCurrentTurn = room.players[room.turnIndex]?.id === target.id;

  if (!room.removedPlayers) room.removedPlayers = [];
  const removedSnapshot = {
    ...target,
    status: room.status === "betting" && !target.folded ? "Removed by Admin (counted as Drop)" : "Removed by Admin",
    removedAt: Date.now(),
    removedBy: managerName,
  };

  if (room.status === "betting" && !target.folded) {
    target.folded = true;
    target.status = "Dropped by Admin";
    const remaining = getActivePlayers(room);
    if (remaining.length === 1) {
      completeRound(room, remaining[0], `${target.name} was removed by ${managerName} and counted as dropped.`);
    } else if (targetWasCurrentTurn) {
      room.turnIndex = nextActiveIndex(room, targetIndex);
    }
  }

  room.removedPlayers.push(removedSnapshot);
  removePlayerReferences(room, target.id);

  const currentDealerId = room.players[room.dealerIndex]?.id;
  const currentTurnId = room.players[room.turnIndex]?.id;
  room.players.splice(targetIndex, 1);

  normalizeRoomManagers(room);
  room.seatCount = room.players.length;

  const dealerIndex = room.players.findIndex((p) => p.id === currentDealerId);
  room.dealerIndex = dealerIndex >= 0 ? dealerIndex : Math.max(0, Math.min(room.dealerIndex || 0, room.players.length - 1));
  const turnIndex = room.players.findIndex((p) => p.id === currentTurnId && !p.folded);
  room.turnIndex = turnIndex >= 0 ? turnIndex : Math.max(0, Math.min(room.turnIndex || 0, room.players.length - 1));
  if (room.status === "betting" && room.players.length > 0 && room.players[room.turnIndex]?.folded) {
    room.turnIndex = nextActiveIndex(room, room.turnIndex);
  }

  if (room.players.length < 2 && room.status !== "sessionEnded") {
    room.status = "sessionEnded";
    room.settlement = calculateSettlement([...(room.players || []), ...(room.removedPlayers || [])]);
    room.lastActionMessage = `${target.name} was removed by ${managerName}. Session ended because fewer than two players remain.`;
  } else if (room.status !== "sessionEnded") {
    const suffix = room.status === "betting" ? " If they were active in this cycle, their hand was counted as dropped." : "";
    room.lastActionMessage = `${target.name} was removed by ${managerName}.${suffix}`;
  }

  return { success: true, removed: removedSnapshot };
}

function registerAdvancedEvents(io, socket) {
  socket.on("emergencyRemovePlayer", ({ roomCode, playerId, targetPlayerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (!isRoomManager(room, playerId)) return callback?.({ success: false, error: "Only admin or co-admin can remove a stuck player." });
    if (!targetPlayerId || targetPlayerId === playerId) return callback?.({ success: false, error: "Select another player to remove." });
    const manager = room.players.find((p) => p.id === playerId);
    const result = emergencyRemovePlayerFromRoom(room, targetPlayerId, manager?.name || "admin");
    if (!result.success) return callback?.(result);
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

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
    const comparison = compareSideHands(requester.cards, opponent.cards, room.roundType, room.oneCardMode);
    // Side compares full hand strength first: Danka > Flash > Tick > Color > Pair > High Card.
    // Hand tie-breakers are handled by the normal hand score. If fully tied, the requester loses/drops.
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
    if (!chooser || chooser.id !== playerId) {
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
    if (dealer?.id !== playerId) return callback?.({ success: false, error: `Only ${dealer?.name || "the dealer"} can deal the next cycle.` });
    startNextRoundFromRoundOver(room);
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("requestPlaceCut", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "cycleBreak") return callback?.({ success: false, error: "Place Cut only at cycle break." });
    const requester = room.players.find((p) => p.id === playerId);
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
    if (!isRoomManager(room, playerId)) return callback?.({ success: false, error: "Only admin or co-admin can continue." });
    prepareFreshCycle(room, "Admin continued with same players. Fresh cycle started.");
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("leaveGameAtCycleBreak", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "cycleBreak") return callback?.({ success: false, error: "Players can leave only at cycle break." });
    const idx = room.players.findIndex((p) => p.id === playerId);
    if (idx === -1) return callback?.({ success: false, error: "Player not found." });
    const settlement = calculateSettlement([...(room.players || []), ...(room.removedPlayers || [])]);
    const [leaving] = room.players.splice(idx, 1);
    if (room.players.length < 2) {
      room.status = "sessionEnded";
      room.settlement = settlement;
      room.lastActionMessage = `${leaving.name} left. Not enough players remain, so session ended.`;
    } else {
      if (leaving.id === room.adminPlayerId || leaving.id === room.coAdminPlayerId) normalizeRoomManagers(room);
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
    if (!isRoomManager(room, playerId)) return callback?.({ success: false, error: "Only admin or co-admin can end session." });
    const safeEndStatuses = ["lobby", "cycleBreak", "roundOver"];
    if (!safeEndStatuses.includes(room.status)) {
      return callback?.({ success: false, error: "End Session is available only after the current cycle is finished." });
    }
    room.status = "sessionEnded";
    room.settlement = calculateSettlement([...(room.players || []), ...(room.removedPlayers || [])]);
    room.lastActionMessage = "Session ended. Final settlement generated.";
    callback?.({ success: true, settlement: room.settlement });
    broadcastPrivateRoomState(io, room);
  });
}
module.exports = { registerAdvancedEvents };
