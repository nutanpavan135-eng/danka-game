export default function PlayingCard({ card, hidden = false }) {
  if (hidden || !card) {
    return (
      <div className="card premium-card card-back" aria-label="Hidden Danka card">
        <div className="back-border">
          <span className="back-logo">D</span>
          <span className="back-name">DANKA</span>
        </div>
      </div>
    );
  }

  const red = card.color === 'red';
  return (
    <div className={`card premium-card face-card ${red ? 'red' : 'black'}`} aria-label={`${card.label}${card.suit}`}>
      <div className="corner top-left">
        <b>{card.label}</b>
        <span>{card.suit}</span>
      </div>
      <div className="center-suit">{card.suit}</div>
      <div className="corner bottom-right">
        <b>{card.label}</b>
        <span>{card.suit}</span>
      </div>
    </div>
  );
}
