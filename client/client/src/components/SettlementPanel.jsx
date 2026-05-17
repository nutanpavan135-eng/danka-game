export default function SettlementPanel({ room }) {
  const settlement = room?.settlement;
  if (!settlement) return null;
  return (
    <div className="panel">
      <h3>Settlement</h3>
      {settlement.results.map((r) => <p key={r.playerId}>{r.name}: {r.net >= 0 ? '+' : ''}{r.net} coins</p>)}
      <h4>Payments</h4>
      {settlement.payments.length === 0 ? <p>No payments needed.</p> : settlement.payments.map((p, i) => <p key={i}>{p.from} pays {p.amount} coins to {p.to}</p>)}
    </div>
  );
}
