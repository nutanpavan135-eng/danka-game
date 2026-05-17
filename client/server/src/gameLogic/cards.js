const { SUITS, RANKS } = require("../../../shared/cardConstants");

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${rank.label}${suit.symbol}`,
        label: rank.label,
        value: rank.value,
        suit: suit.symbol,
        suitName: suit.name,
        suitRank: suit.rank,
        color: suit.color,
      });
    }
  }
  return deck;
}

function shuffleDeck(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardsPerPlayer(roundType) {
  if (roundType === "four") return 4;
  if (roundType === "two") return 2;
  if (roundType === "one") return 1;
  return 3;
}

function compareCardsForPlaceCut(a, b) {
  if (a.value !== b.value) return b.value - a.value;
  return b.suitRank - a.suitRank;
}

module.exports = { createDeck, shuffleDeck, cardsPerPlayer, compareCardsForPlaceCut };
