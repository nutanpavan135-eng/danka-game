export default function PlayingCard({ card, hidden = false, backStatus = "blind" }) {
  if (hidden || !card) {
    return (
      <div className={`card premium-card card-back clean-card-back back-${backStatus}`} aria-label="Hidden Danka card">
        <div className="back-pattern">
          <span className="back-logo">D</span>
        </div>
      </div>
    );
  }

  const red = card.color === 'red';
  const label = card.label;
  const suit = card.suit;

  return (
    <div className={`card premium-card face-card clean-face-card ${red ? 'red' : 'black'}`} aria-label={`${label}${suit}`}>
      <div className="clean-corner top-left rank-only">
        <strong>{label}</strong>
      </div>
      <div className="clean-card-center suit-only">
        <span>{suit}</span>
      </div>
      <div className="clean-corner bottom-right rank-only">
        <strong>{label}</strong>
      </div>
    </div>
  );
}
