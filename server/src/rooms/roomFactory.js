const { rooms } = require("./roomStore");

function generateRoomCode() {
  let code;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(code));
  return code;
}

function createPlayer({ socketId, name, isAdmin, startingCoins }) {
  return {
    id: socketId,
    socketId,
    name: String(name || "Player").trim() || "Player",
    role: isAdmin ? "admin" : "player",
    coins: startingCoins,
    startCoins: startingCoins,
    cards: [],
    sawCards: false,
    folded: false,
    status: "Waiting",
    seat: "Unassigned",
    connected: true,
    cutLockTurns: 0,
  };
}

function createRoom({ roomCode, adminPlayer, startingCoins, cyclesPerRound }) {
  return {
    roomCode,
    adminPlayerId: adminPlayer.id,
    coAdminPlayerId: null,
    status: "lobby",
    startingCoins,
    cyclesPerRound: Number(cyclesPerRound) > 0 ? Number(cyclesPerRound) : 20,
    players: [adminPlayer],
    removedPlayers: [],
    deck: [],
    pot: 0,
    dealerIndex: 0,
    turnIndex: 0,
    roundType: "three",
    oneCardMode: "highest",
    specialQueue: [],
    completedRounds: 0,
    cycleTarget: Number(cyclesPerRound) > 0 ? Number(cyclesPerRound) : 20,
    lastActionMessage: `${adminPlayer.name} created the room.`,
    wellCutAnnouncement: null,
    winnerAnnouncement: null,
    nextCycleDealReadyAt: null,
    cashAward: null,
    settlement: null,
    placeCutDeck: [],
    placeCutPicks: [],
    placeCutOrder: [],
    seatCount: 0,
    chosenSeatIndex: null,
    createdAt: Date.now(),
  };
}

module.exports = { generateRoomCode, createPlayer, createRoom };
