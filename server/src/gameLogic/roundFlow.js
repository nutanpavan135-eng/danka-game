const { calculateCycleTarget } = require("../rooms/roomHelpers");
const { evaluateHand, compareScores } = require("./handEvaluator");
const { createDeck, shuffleDeck, cardsPerPlayer } = require("./cards");

function prepareNextRoundType(room) {
  room.roundType = room.specialQueue.length > 0 ? room.specialQueue.shift() : "three";
}

function handCardsText(hand) {
  return (hand.selectedCards || []).map((card) => `${card.label}${card.suit}`).join(" ");
}


function dealerLeftIndex(room) {
  return (room.dealerIndex - 1 + room.players.length) % room.players.length;
}

function prepareOneCardModeChoice(room, message) {
  const chooserIndex = dealerLeftIndex(room);
  const chooser = room.players[chooserIndex];
  room.status = "chooseOneCardMode";
  room.turnIndex = chooserIndex;
  room.pot = 0;
  room.winnerId = null;
  room.winnerHand = null;
  room.revealed = false;
  room.sideReveal = null;
  room.players = room.players.map((p) => ({
    ...p,
    cards: [],
    sawCards: false,
    folded: false,
    status: p.id === chooser?.id ? "Choose Highest/Lowest" : "Waiting for Single Card Mode",
    cutLockTurns: 0,
  }));
  room.lastActionMessage = `${message} ${chooser?.name || "Dealer's left-side player"} must confirm whether Highest Card Wins or Lowest Card Wins before the single-card cycle is dealt.`;
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


function dealCardsDirectly(room, message = "Dealer deals automatically.") {
  room.lastCycleReveal = room.lastCycleReveal || null;
  room.winnerHand = null;
  room.sideReveal = null;
  room.revealed = false;
  room.winnerAnnouncement = null;
  room.cashAward = null;

  const n = room.players.length;
  const dealer = room.players[room.dealerIndex] || room.players[0];
  const dealingDeck = shuffleDeck(createDeck());

  room.players = room.players.map((p) => ({
    ...p,
    cards: [],
    sawCards: false,
    folded: false,
    status: "Blind",
    cutLockTurns: 0,
  }));

  let pointer = 0;
  const cardsEach = cardsPerPlayer(room.roundType);
  for (let round = 0; round < cardsEach; round++) {
    for (let offset = 1; offset <= n; offset++) {
      const playerIndex = (room.dealerIndex - offset + n) % n;
      room.players[playerIndex].cards.push(dealingDeck[pointer++]);
    }
  }

  room.players = room.players.map((p) => ({ ...p, coins: p.coins - 1 }));
  room.pot = n;
  room.deck = dealingDeck.slice(pointer);
  room.turnIndex = (room.dealerIndex + 1) % n;
  room.status = "betting";

  const perfectCutTriggered = Math.random() < 0.15;
  const specialCanStart = perfectCutTriggered && room.roundType === "three" && room.specialQueue.length === 0;

  const oneCardNotice = room.roundType === "one" ? ` Single-card rule: ${room.oneCardMode === "lowest" ? "Lowest Card Wins" : "Highest Card Wins"}.` : "";
  if (specialCanStart) {
    room.specialQueue = ["four", "three", "two", "one"];
    room.wellCutAnnouncement = { id: Date.now(), text: "Well Cut" };
    room.lastActionMessage = `${message} Well Cut. The next four cycles will be special scenario games.${oneCardNotice}`;
  } else if (perfectCutTriggered && room.specialQueue.length > 0) {
    room.lastActionMessage = `${message}${oneCardNotice}`;
  } else {
    room.lastActionMessage = `${message} ${dealer?.name || "Dealer"} deals automatically.${oneCardNotice} ${room.players[room.turnIndex]?.name || "First player"} starts betting.`;
  }
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
  room.winnerAnnouncement = { id: Date.now(), winnerId: winner.id, text: `${winner.name} won with ${winningHand.name}` };
  room.cashAward = { id: Date.now() + 1, winnerId: winner.id };
  room.lastCycleReveal = {
    winnerId: winner.id,
    winnerName: winner.name,
    winningHand,
    players: room.players
      .map((p) => revealSummaryForPlayer(room, p))
      .sort((a, b) => compareScores(b.hand, a.hand)),
  };
  room.dealerIndex = winnerIndex >= 0 ? winnerIndex : room.dealerIndex;
  room.turnIndex = (room.dealerIndex + 1) % room.players.length;

  if (!room.cycleTarget) room.cycleTarget = room.cyclesPerRound || calculateCycleTarget(room.players.length);

  const handMessage = `${winner.name} wins with ${winningHand.name}${handCardsText(winningHand) ? ` (${handCardsText(winningHand)})` : ""}.`;

  const specialMustContinue = room.specialQueue.length > 0 || room.roundType === "four" || room.roundType === "two";

  if (room.completedRounds >= room.cycleTarget && !specialMustContinue) {
    room.status = "cycleBreak";
    room.lastActionMessage = `${message} ${handMessage}${dankaBonusMessage} Round break: Place Cut is now available.`;
  } else {
    room.status = "roundOver";
    room.placeCutCards = [];
    room.placeCutPicks = [];
    room.placeCutOrder = [];
    room.lastActionMessage = `${message} ${handMessage}${dankaBonusMessage} Cycle ${room.completedRounds}/${room.cycleTarget} completed. ${winner.name} will deal the next cycle when ready.`;
  }
}

function startNextRoundFromRoundOver(room, messagePrefix = "") {
  const dealer = room.players[room.dealerIndex] || room.players[0];
  room.players = room.players.map((p) => ({ ...p, cards: [], sawCards: false, folded: false, status: "Waiting" }));
  room.pot = 0;
  room.winnerId = null;
  room.winnerHand = null;
  room.revealed = false;
  room.wellCutAnnouncement = null;
  room.winnerAnnouncement = null;
  room.cashAward = null;
  room.placeCutCards = [];
  room.placeCutPicks = [];
  room.placeCutOrder = [];
  prepareNextRoundType(room);
  const prefix = messagePrefix ? `${messagePrefix} ` : "";
  if (room.roundType === "one") {
    prepareOneCardModeChoice(room, `${prefix}${dealer?.name || "Winner"} is the dealer for the next single-card cycle.`);
  } else {
    dealCardsDirectly(room, `${prefix}${dealer?.name || "Winner"} is the dealer for the next cycle.`);
  }
}

function prepareFreshCycle(room, message = "Fresh round started.") {
  room.completedRounds = 0;
  room.cycleTarget = room.cyclesPerRound || calculateCycleTarget(room.players.length);
  room.specialQueue = [];
  room.roundType = "three";
  room.oneCardMode = "highest";
  room.status = "placeCut";
  room.pot = 0;
  room.winnerId = null;
  room.winnerHand = null;
  room.revealed = false;
  room.wellCutAnnouncement = null;
  room.winnerAnnouncement = null;
  room.cashAward = null;
  room.placeCutCards = [];
  room.players = room.players.map((p) => ({ ...p, startCoins: p.coins, cards: [], sawCards: false, folded: false, status: "Waiting to Pick", seat: "Unassigned", cutLockTurns: 0 }));
  room.placeCutDeck = shuffleDeck(createDeck());
  room.placeCutPicks = [];
  room.placeCutOrder = [];
  room.seatCount = room.players.length;
  room.chosenSeatIndex = null;
  room.lastActionMessage = `${message} Each player must pick one Place Cut card.`;
}
module.exports = { completeRound, startNextRoundFromRoundOver, prepareFreshCycle, dealCardsDirectly };
