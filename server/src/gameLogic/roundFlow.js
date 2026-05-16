const { calculateCycleTarget } = require("../rooms/roomHelpers");
const { evaluateHand, compareScores } = require("./handEvaluator");

function prepareNextRoundType(room) {
  room.roundType = room.specialQueue.length > 0 ? room.specialQueue.shift() : "three";
}

function handCardsText(hand) {
  return (hand.selectedCards || []).map((card) => `${card.label}${card.suit}`).join(" ");
}


function revealSummaryForPlayer(room, player) {
  const hand = evaluateHand(player.cards, room.roundType, room.oneCardMode);
  return {
    id: player.id,
    name: player.name,
    status: player.status,
    cards: hand.selectedCards?.length ? hand.selectedCards : player.cards,
    folded: player.folded,
    hand,
    handName: hand.name,
    orderedCardsText: handCardsText(hand),
  };
}

function applyDankaBonus(room, winner, winningHand) {
  if (!winningHand || winningHand.name !== "Danka") return "";
  const playerCount = room.players.length;
  const isAceDanka = (winningHand.selectedCards || []).every((card) => card.value === 14);
  const bonusEach = isAceDanka ? playerCount * 2 : playerCount;
  let totalBonus = 0;
  room.players.forEach((player) => {
    if (player.id !== winner.id) {
      player.coins -= bonusEach;
      totalBonus += bonusEach;
    }
  });
  winner.coins += totalBonus;
  return isAceDanka
    ? ` Ace Danka bonus applied: each other player pays ${bonusEach} coins.`
    : ` Danka bonus applied: each other player pays ${bonusEach} coins.`;
}

function completeRound(room, winner, message) {
  const winningHand = evaluateHand(winner.cards, room.roundType, room.oneCardMode);
  const winnerIndex = room.players.findIndex((player) => player.id === winner.id);

  winner.coins += room.pot;
  winner.status = "Cycle Winner";

  const dankaBonusMessage = applyDankaBonus(room, winner, winningHand);

  room.pot = 0;
  room.completedRounds += 1;
  room.revealed = true;
  room.winnerId = winner.id;
  room.winnerHand = winningHand;
  room.sideReveal = null;
  room.lastCycleReveal = {
    winnerId: winner.id,
    winnerName: winner.name,
    winningHand,
    players: room.players
      .map((p) => revealSummaryForPlayer(room, p))
      .sort((a, b) => compareScores(b.hand, a.hand)),
  };
  room.dealerIndex = winnerIndex >= 0 ? winnerIndex : room.dealerIndex;
  room.turnIndex = (room.dealerIndex + room.players.length - 1) % room.players.length;

  if (!room.cycleTarget) room.cycleTarget = calculateCycleTarget(room.players.length);

  const handMessage = `${winner.name} wins with ${winningHand.name}${handCardsText(winningHand) ? ` (${handCardsText(winningHand)})` : ""}.`;

  if (room.completedRounds >= room.cycleTarget) {
    room.status = "cycleBreak";
    room.lastActionMessage = `${message} ${handMessage}${dankaBonusMessage} Round break: Place Cut is now available.`;
  } else {
    prepareNextRoundType(room);
    room.status = "cutDeck";
    room.revealed = false;
    room.placeCutCards = [];
    room.placeCutPicks = [];
    room.placeCutOrder = [];
    room.deck = [];
    room.pot = 0;
    room.players = room.players.map((p) => ({
      ...p,
      cards: [],
      sawCards: false,
      folded: false,
      cutLockTurns: 0,
      status: p.id === winner.id ? "Dealer" : "Waiting",
    }));
    const n = room.players.length;
    const cutter = room.players[(room.dealerIndex + 1) % n];
    room.turnIndex = (room.dealerIndex + n - 1) % n;
    room.lastActionMessage = `${message} ${handMessage}${dankaBonusMessage} Cycle ${room.completedRounds}/${room.cycleTarget} completed. ${winner.name} is the dealer for the next cycle. ${cutter?.name || "Cutter"} must cut the deck.`;
  }
}

function startNextRoundFromRoundOver(room) {
  const dealer = room.players[room.dealerIndex] || room.players[0];
  room.players = room.players.map((p) => ({ ...p, cards: [], sawCards: false, folded: false, status: "Waiting" }));
  room.pot = 0;
  room.winnerId = null;
  room.winnerHand = null;
  room.revealed = false;
  room.placeCutCards = [];
  room.placeCutPicks = [];
  room.placeCutOrder = [];
  prepareNextRoundType(room);
  room.status = "cutDeck";
  room.deck = [];
  const n = room.players.length;
  room.turnIndex = (room.dealerIndex + n - 1) % n;
  const cutter = room.players[(room.dealerIndex + 1) % n];
  room.lastActionMessage = `${dealer?.name || "Winner"} is the dealer for the next cycle. ${cutter?.name || "Cutter"} must cut the deck.`;
}

function prepareFreshCycle(room, message = "Fresh round started.") {
  room.completedRounds = 0;
  room.cycleTarget = calculateCycleTarget(room.players.length);
  room.specialQueue = [];
  room.roundType = "three";
  room.oneCardMode = "highest";
  room.status = "placeCut";
  room.pot = 0;
  room.winnerId = null;
  room.winnerHand = null;
  room.revealed = false;
  room.placeCutCards = [];
  room.players = room.players.map((p) => ({ ...p, startCoins: p.coins, cards: [], sawCards: false, folded: false, status: "Waiting to Pick", seat: "Unassigned", cutLockTurns: 0 }));
  room.placeCutDeck = [];
  room.placeCutPicks = [];
  room.placeCutOrder = [];
  room.seatCount = room.players.length;
  room.chosenSeatIndex = null;
  room.lastActionMessage = message;
}
module.exports = { completeRound, startNextRoundFromRoundOver, prepareFreshCycle };
