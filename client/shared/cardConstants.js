const SUITS = [
  { symbol: "♠", name: "Spades", rank: 4, color: "black" },
  { symbol: "♥", name: "Hearts", rank: 3, color: "red" },
  { symbol: "♦", name: "Diamonds", rank: 2, color: "red" },
  { symbol: "♣", name: "Clubs", rank: 1, color: "black" },
];

const RANKS = [
  { label: "2", value: 2 }, { label: "3", value: 3 }, { label: "4", value: 4 },
  { label: "5", value: 5 }, { label: "6", value: 6 }, { label: "7", value: 7 },
  { label: "8", value: 8 }, { label: "9", value: 9 }, { label: "10", value: 10 },
  { label: "J", value: 11 }, { label: "Q", value: 12 }, { label: "K", value: 13 },
  { label: "A", value: 14 },
];

module.exports = { SUITS, RANKS };
