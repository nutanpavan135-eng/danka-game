function previousActivePlayer(room, fromIndex) {
  if (!room?.players?.length) return null;
  for (let step = 1; step <= room.players.length; step++) {
    const idx = (fromIndex - step + room.players.length) % room.players.length;
    if (!room.players[idx].folded) return room.players[idx];
  }
  return null;
}


function hasLaterActiveBlindPlayer(room, fromIndex) {
  if (!room?.players?.length) return false;
  for (let step = 1; step < room.players.length; step++) {
    const idx = (fromIndex + step) % room.players.length;
    const player = room.players[idx];
    if (player?.folded) continue;
    if (!player?.sawCards) return true;
  }
  return false;
}

export function getPermissions(room, playerId) {
  if (!room) return {};
  const me = room.players.find((p) => p.id === playerId);
  const current = room.players[room.turnIndex];
  const active = room.players.filter((p) => !p.folded);
  const isMyTurn = current?.id === playerId;
  const isAdmin = room.adminPlayerId === playerId;
  const isCoAdmin = room.coAdminPlayerId === playerId || me?.role === 'co-admin';
  const isRoomManager = isAdmin || isCoAdmin;
  const allOpen = active.every((p) => p.sawCards);
  const dealer = room.players[room.dealerIndex];
  const dealerIsMe = dealer?.id === playerId;
  const dealerLeftIndex = room.players.length > 0 ? (room.dealerIndex - 1 + room.players.length) % room.players.length : -1;
  const dealerLeftPlayer = room.players[dealerLeftIndex];
  const canChooseOneCardMode = room.status === 'chooseOneCardMode' && dealerLeftPlayer?.id === playerId;
  const hasPickedPlaceCut = room.placeCut?.picks?.some((pick) => pick.playerId === playerId);
  const isHighestPicker = room.placeCut?.highestPlayerId === playerId;
  const prevActive = previousActivePlayer(room, room.turnIndex);
  const previousIsOpen = !!prevActive?.sawCards;
  const cutLocked = (me?.cutLockTurns || 0) > 0;
  const laterBlindExists = hasLaterActiveBlindPlayer(room, room.turnIndex);
  const cutRequired = room.status === 'betting' && isMyTurn && me && !me.sawCards && !me.folded && previousIsOpen && !cutLocked && laterBlindExists;

  return {
    isAdmin,
    dealerName: dealer?.name,
    hasPickedPlaceCut,
    isHighestPicker,
    canStartGame: room.status === 'lobby' && isAdmin && room.players.length >= 2,
    canPickPlaceCutCard: room.status === 'placeCut' && me && !hasPickedPlaceCut,
    canRunPlaceCut: room.status === 'placeCut' && isAdmin,
    canChooseSeat: room.status === 'chooseSeat' && isHighestPicker,
    canCutDeck: false,
    canSeeCards: room.status === 'betting' && isMyTurn && me && !me.sawCards && !me.folded,
    canBlindBet: room.status === 'betting' && isMyTurn && me && !me.sawCards && !me.folded && !cutRequired,
    canCut: cutRequired,
    canOpenBet: room.status === 'betting' && isMyTurn && me && me.sawCards,
    canDrop: room.status === 'betting' && isMyTurn && me && !me.folded,
    canShow: room.status === 'betting' && isMyTurn && active.length === 2,
    canSide: room.status === 'betting' && isMyTurn && active.length > 2 && allOpen && me?.sawCards,
    canStartNextRound: room.status === 'roundOver' && dealerIsMe,
    canChooseOneCardMode,
    canRequestPlaceCut: room.status === 'cycleBreak',
    canContinueSamePlayers: room.status === 'cycleBreak' && isRoomManager,
    canLeaveAtCycleBreak: room.status === 'cycleBreak',
    canEndSession: isRoomManager && ['lobby', 'cycleBreak', 'roundOver'].includes(room.status),
  };
}
