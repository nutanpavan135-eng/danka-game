const { saveRooms, touchRoom } = require("./roomStore");
function getRoomStateForPlayer(room, receivingPlayerId) {
  const allPlaceCutPicked = room.placeCutPicks?.length === room.players.length && room.players.length > 0;
  const placeCutPicks = (room.placeCutPicks || []).map((pick) => ({
    playerId: pick.playerId,
    playerName: pick.playerName,
    card: allPlaceCutPicked || pick.playerId === receivingPlayerId ? pick.card : null,
    hasPicked: true,
  }));

  return {
    roomCode: room.roomCode,
    adminPlayerId: room.adminPlayerId,
    coAdminPlayerId: room.coAdminPlayerId || null,
    status: room.status,
    startingCoins: room.startingCoins,
    cyclesPerRound: room.cyclesPerRound,
    removedPlayers: (room.removedPlayers || []).map((p) => ({ id: p.id, name: p.name, role: p.role || "removed", coins: p.coins, startCoins: p.startCoins, status: p.status || "Removed" })),
    players: room.players.map((p) => {
      const sideRevealActive =
        room.sideReveal?.viewerIds?.includes(receivingPlayerId) &&
        room.sideReveal?.participantIds?.includes(p.id);
      const canSee =
        sideRevealActive ||
        (p.id === receivingPlayerId && p.sawCards) ||
        ["roundOver", "cycleBreak", "sessionEnded"].includes(room.status);
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        coins: p.coins,
        startCoins: p.startCoins,
        cardCount: p.cards.length,
        cards: canSee ? p.cards : [],
        cardsHidden: !canSee,
        sawCards: p.sawCards,
        folded: p.folded,
        status: p.status,
        seat: p.seat,
        connected: p.connected,
        cutLockTurns: p.cutLockTurns || 0,
      };
    }),
    pot: room.pot,
    dealerIndex: room.dealerIndex,
    turnIndex: room.turnIndex,
    roundType: room.roundType,
    oneCardMode: room.oneCardMode,
    specialQueue: room.specialQueue,
    completedRounds: room.completedRounds,
    cycleTarget: room.cycleTarget,
    winnerId: room.winnerId || null,
    winnerHand: room.winnerHand || null,
    lastCycleReveal: room.lastCycleReveal || null,
    sideReveal: room.sideReveal || null,
    oneCardModeAnnouncement: room.oneCardModeAnnouncement || null,
    wellCutAnnouncement: room.wellCutAnnouncement || null,
    winnerAnnouncement: room.winnerAnnouncement || null,
    nextCycleDealReadyAt: room.nextCycleDealReadyAt || null,
    nextCycleDealReadyInMs: room.nextCycleDealReadyAt ? Math.max(0, room.nextCycleDealReadyAt - Date.now()) : 0,
    cashAward: room.cashAward || null,
    settlement: room.settlement || null,
    lastActionMessage: room.lastActionMessage,
    placeCut: {
      picks: placeCutPicks,
      allPicked: allPlaceCutPicked,
      order: allPlaceCutPicked ? room.placeCutOrder || [] : [],
      highestPlayerId: room.placeCutOrder?.[0]?.playerId || null,
      seatCount: room.seatCount || room.players.length,
      chosenSeatIndex: room.chosenSeatIndex,
      remainingCards: room.placeCutDeck?.length ?? Math.max(0, 52 - (room.placeCutPicks?.length || 0)),
    },
  };
}

function broadcastPrivateRoomState(io, room) {
  touchRoom(room, "broadcast-update");
  saveRooms();
  for (const player of room.players) {
    io.to(player.socketId).emit("roomUpdated", getRoomStateForPlayer(room, player.id));
  }
}

module.exports = { getRoomStateForPlayer, broadcastPrivateRoomState };
