function cardSortDesc(cards) {
  return [...cards].sort((a, b) => b.value - a.value || b.suitRank - a.suitRank);
}
function getSequenceInfo(cards) {
  const values = cardSortDesc(cards).map((c) => c.value);

  // Normal sequence: Q-K-A, J-Q-K, 2-3-4, etc.
  if (values[0] - 1 === values[1] && values[1] - 1 === values[2]) {
    return { isSequence: true, highValue: values[0] };
  }

  // Ace-low sequence: A-2-3 is valid.
  // K-A-2 is NOT valid because Ace cannot sit in the middle of a sequence.
  if (values[0] === 14 && values[1] === 3 && values[2] === 2) {
    return { isSequence: true, highValue: 3 };
  }

  return { isSequence: false, highValue: 0 };
}

function isTwoCardSequence(a, b) {
  const high = Math.max(a.value, b.value);
  const low = Math.min(a.value, b.value);

  // Normal adjacent cards, including K-A.
  if (high - low === 1) return { isSequence: true, highValue: high };

  // Ace-low adjacency for the two-card special cycle: A-2 is valid.
  if (high === 14 && low === 2) return { isSequence: true, highValue: 2 };

  return { isSequence: false, highValue: 0 };
}
function compareScores(a, b) {
  const max = Math.max(a.score.length, b.score.length);
  for (let i = 0; i < max; i++) {
    const av = a.score[i] || 0;
    const bv = b.score[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}
function evaluateThreeCardHand(cards) {
  if (!cards || cards.length !== 3) return { level: 0, name: "No hand", score: [0], selectedCards: [] };
  const sorted = cardSortDesc(cards);
  const values = sorted.map((c) => c.value);
  const suitRanks = sorted.map((c) => c.suitRank);
  const sameRank = values[0] === values[1] && values[1] === values[2];
  const sequenceInfo = getSequenceInfo(sorted);
  const sequence = sequenceInfo.isSequence;
  const sameSuit = sorted.every((c) => c.suit === sorted[0].suit);
  const distinctSuitCount = new Set(sorted.map((c) => c.suit)).size;
  const isTrueTick = sequence && distinctSuitCount === 3;
  const sameColor = sorted.every((c) => c.color === sorted[0].color);
  if (sameRank) return { level: 6, name: "Danka", score: [6, values[0], Math.max(...suitRanks)], selectedCards: sorted };
  if (sequence && sameSuit) return { level: 5, name: "Flash", score: [5, sequenceInfo.highValue, Math.max(...suitRanks)], selectedCards: sorted };
  if (isTrueTick) return { level: 4, name: "Tick", score: [4, sequenceInfo.highValue, ...suitRanks], selectedCards: sorted };
  if (sameSuit) return { level: 3, name: "Color", score: [3, ...values, ...suitRanks], selectedCards: sorted };
  const counts = values.reduce((acc, value) => ({ ...acc, [value]: (acc[value] || 0) + 1 }), {});
  const pairValue = Number(Object.keys(counts).find((value) => counts[value] === 2));
  if (pairValue) {
    const kicker = values.find((v) => v !== pairValue);
    const pairSuitHigh = Math.max(...sorted.filter((c) => c.value === pairValue).map((c) => c.suitRank));
    return { level: 2, name: "Pair", score: [2, pairValue, kicker, pairSuitHigh], selectedCards: sorted };
  }
  return { level: 1, name: "High Card", score: [1, ...values, ...suitRanks], selectedCards: sorted };
}
function combinations(cards, size) {
  const result = [];
  function walk(start, combo) {
    if (combo.length === size) { result.push(combo); return; }
    for (let i = start; i < cards.length; i++) walk(i + 1, [...combo, cards[i]]);
  }
  walk(0, []);
  return result;
}
function evaluateTwoCardHand(cards) {
  if (!cards || cards.length !== 2) return { level: 0, name: "No hand", score: [0], selectedCards: [] };
  const sorted = cardSortDesc(cards);
  const [a, b] = sorted;
  const isPair = a.value === b.value;
  const sequenceInfo = isTwoCardSequence(a, b);
  const isSameSuit = a.suit === b.suit;
  const isSameColor = a.color === b.color;
  if (isPair) return { level: 5, name: "Pair", score: [5, a.value, Math.max(a.suitRank, b.suitRank)], selectedCards: sorted };
  if (sequenceInfo.isSequence && isSameSuit) return { level: 4, name: "Flash", score: [4, sequenceInfo.highValue, Math.max(a.suitRank, b.suitRank)], selectedCards: sorted };
  if (sequenceInfo.isSequence) return { level: 3, name: "Tick", score: [3, sequenceInfo.highValue, a.suitRank, b.suitRank], selectedCards: sorted };
  if (isSameSuit) return { level: 2, name: "Color", score: [2, a.value, b.value, a.suitRank, b.suitRank], selectedCards: sorted };
  return { level: 1, name: "High Card", score: [1, a.value, b.value, a.suitRank, b.suitRank], selectedCards: sorted };
}
function evaluateOneCardHand(cards, lowestWins = false) {
  if (!cards || cards.length !== 1) return { level: 0, name: "No hand", score: [0], selectedCards: [] };
  const card = cards[0];
  const rankScore = lowestWins ? 15 - card.value : card.value;
  // In Lowest Card mode, ties on rank must also use the lowest suit/symbol.
  // Suit rank order is Spade=4, Heart/Love=3, Diamond/Promise=2, Club=1.
  // compareScores rewards the larger score, so convert lower suitRank into a higher score.
  const suitScore = lowestWins ? 5 - card.suitRank : card.suitRank;
  return { level: 1, name: lowestWins ? "Lowest Card" : "Highest Card", score: [1, rankScore, suitScore], selectedCards: cards };
}
function evaluateHand(cards, roundType = "three", oneCardMode = "highest") {
  if (roundType === "four") {
    return combinations(cards || [], 3).map(evaluateThreeCardHand).sort((a, b) => compareScores(b, a))[0] || { level: 0, name: "No hand", score: [0], selectedCards: [] };
  }
  if (roundType === "two") return evaluateTwoCardHand(cards);
  if (roundType === "one") return evaluateOneCardHand(cards, oneCardMode === "lowest");
  return evaluateThreeCardHand(cards);
}
module.exports = { evaluateHand, compareScores };
