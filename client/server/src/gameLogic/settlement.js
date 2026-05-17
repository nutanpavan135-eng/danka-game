function calculateSettlement(players) {
  const results = players.map((p) => ({
    playerId: p.id,
    name: p.name,
    startCoins: p.startCoins,
    currentCoins: p.coins,
    net: p.coins - p.startCoins,
  }));
  const winners = results.filter((p) => p.net > 0).map((p) => ({ ...p })).sort((a, b) => b.net - a.net);
  const losers = results.filter((p) => p.net < 0).map((p) => ({ ...p })).sort((a, b) => a.net - b.net);
  const payments = [];
  let wi = 0, li = 0;
  while (wi < winners.length && li < losers.length) {
    const amount = Math.min(winners[wi].net, Math.abs(losers[li].net));
    if (amount > 0) payments.push({ from: losers[li].name, to: winners[wi].name, amount });
    winners[wi].net -= amount;
    losers[li].net += amount;
    if (winners[wi].net === 0) wi++;
    if (losers[li].net === 0) li++;
  }
  return { results, payments };
}
module.exports = { calculateSettlement };
