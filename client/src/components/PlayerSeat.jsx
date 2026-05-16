import PlayingCard from './PlayingCard';

export default function PlayerSeat({ player, isTurn, isWinner }) {
  return (
    <div className={`player-seat ${isTurn ? 'turn' : ''} ${isWinner ? 'winner-seat' : ''}`}>
      <div className="row between"><b>{player.name}</b><span>{player.role}</span></div>
      <div className="muted">{player.status} • {player.coins} coins{player.cutLockTurns > 0 ? ` • Cut lock: ${player.cutLockTurns}` : ""}</div>
      <div className="cards">
        {Array.from({ length: player.cardCount || player.cards?.length || 0 }).map((_, i) => (
          <div key={i} className={isWinner ? 'winner-card-wrap' : ''}>
            <PlayingCard card={player.cards?.[i]} hidden={player.cardsHidden || !player.cards?.[i]} />
          </div>
        ))}
      </div>
    </div>
  );
}
