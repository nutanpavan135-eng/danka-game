function cardSortDesc(cards) {
  return [...cards].sort((a, b) => b.value - a.value || b.suitRank - a.suitRank);
}
function isSequence(cards) {
  const values = cardSortDesc(cards).map((c) => c.value);
  return values[0] - 1 === values[1] && values[1] - 1 === values[2];
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
  const sequence = isSequence(sorted);
  const sameSuit = sorted.every((c) => c.suit === sorted[0].suit);
  const distinctSuitCount = new Set(sorted.map((c) => c.suit)).size;
  const isTrueTick = sequence && distinctSuitCount === 3;
  const sameColor = sorted.every((c) => c.color === sorted[0].color);
  if (sameRank) return { level: 6, name: "Danka", score: [6, values[0], Math.max(...suitRanks)], selectedCards: sorted };
  if (sequence && sameSuit) return { level: 5, name: "Flash", score: [5, values[0], Math.max(...suitRanks)], selectedCards: sorted };
  if (isTrueTick) return { level: 4, name: "Tick", score: [4, values[0], ...suitRanks], selectedCards: sorted };
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
  const isTwoCardSequence = Math.abs(a.value - b.value) === 1;
  const isSameSuit = a.suit === b.suit;
  const isSameColor = a.color === b.color;
  if (isPair) return { level: 5, name: "Pair", score: [5, a.value, Math.max(a.suitRank, b.suitRank)], selectedCards: sorted };
  if (isTwoCardSequence && isSameSuit) return { level: 4, name: "Flash", score: [4, Math.max(a.value, b.value), Math.max(a.suitRank, b.suitRank)], selectedCards: sorted };
  if (isTwoCardSequence) return { level: 3, name: "Tick", score: [3, Math.max(a.value, b.value), a.suitRank, b.suitRank], selectedCards: sorted };
  if (isSameSuit) return { level: 2, name: "Color", score: [2, a.value, b.value, a.suitRank, b.suitRank], selectedCards: sorted };
  return { level: 1, name: "High Card", score: [1, a.value, b.value, a.suitRank, b.suitRank], selectedCards: sorted };
}
function evaluateOneCardHand(cards, lowestWins = false) {
  if (!cards || cards.length !== 1) return { level: 0, name: "No hand", score: [0], selectedCards: [] };
  const card = cards[0];
  const rankScore = lowestWins ? 15 - card.value : card.value;
  return { level: 1, name: lowestWins ? "Lowest Card" : "Highest Card", score: [1, rankScore, card.suitRank], selectedCards: cards };
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
