function getRoomByCode(rooms, roomCode) { return rooms.get(String(roomCode || "").trim()); }
function getCurrentPlayer(room) { return room.players[room.turnIndex]; }
function getActivePlayers(room) { return room.players.filter((p) => !p.folded); }
function nextActiveIndex(room, fromIndex) {
  for (let step = 1; step <= room.players.length; step++) {
    const idx = (fromIndex + step) % room.players.length;
    if (!room.players[idx].folded) return idx;
  }
  return fromIndex;
}
function isCurrentPlayersSocket(room, socketId) {
  return getCurrentPlayer(room)?.socketId === socketId;
}

function attachSocketToPlayer(room, socket, playerId) {
  if (!room || !socket || !playerId) return null;
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return null;
  player.socketId = socket.id;
  player.connected = true;
  if (player.status === "Disconnected") player.status = player.sawCards ? "Open" : "Blind";
  socket.join(room.roomCode);
  return player;
}
function calculateCycleTarget(count) { return count <= 5 ? count * 3 : count * 2; }
function findPreviousActiveIndex(room, fromIndex) {
  for (let step = 1; step <= room.players.length; step++) {
    const idx = (fromIndex - step + room.players.length) % room.players.length;
    if (!room.players[idx].folded) return idx;
  }
  return fromIndex;
}
function findDealerLeftIndex(room) {
  if (!room?.players?.length) return -1;
  return (room.dealerIndex - 1 + room.players.length) % room.players.length;
}
module.exports = { getRoomByCode, getCurrentPlayer, getActivePlayers, nextActiveIndex, isCurrentPlayersSocket, attachSocketToPlayer, calculateCycleTarget, findPreviousActiveIndex, findDealerLeftIndex };
