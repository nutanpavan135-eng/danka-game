function getRoomByCode(rooms, roomCode) { return rooms.get(String(roomCode || "").trim()); }
function getCurrentPlayer(room) { return room.players[room.turnIndex]; }
function getActivePlayers(room) { return room.players.filter((p) => !p.folded); }
function nextActiveIndex(room, fromIndex) {
  for (let step = 1; step <= room.players.length; step++) {
    const idx = (fromIndex - step + room.players.length) % room.players.length;
    if (!room.players[idx].folded) return idx;
  }
  return fromIndex;
}
function isCurrentPlayersSocket(room, socketId) {
  return getCurrentPlayer(room)?.socketId === socketId;
}
function calculateCycleTarget(count) { return count <= 5 ? count * 3 : count * 2; }
function findLeftActiveIndex(room, fromIndex) {
  for (let step = 1; step <= room.players.length; step++) {
    const idx = (fromIndex + step) % room.players.length;
    if (!room.players[idx].folded) return idx;
  }
  return fromIndex;
}
module.exports = { getRoomByCode, getCurrentPlayer, getActivePlayers, nextActiveIndex, isCurrentPlayersSocket, calculateCycleTarget, findLeftActiveIndex };
