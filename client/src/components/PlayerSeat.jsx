import PlayingCard from './PlayingCard';

export default function PlayerSeat({ player, isTurn, isWinner, canRemove = false, onRemove }) {
  function handleRemove() {
    if (!canRemove || !onRemove) return;
    const confirmed = window.confirm(`Remove ${player.name} from this room? If they are active in the current cycle, their hand will be counted as dropped.`);
    if (confirmed) onRemove(player.id);
  }

  return (
    <div className={`player-seat ${isTurn ? 'turn' : ''} ${isWinner ? 'winner-seat' : ''} ${!player.connected ? 'disconnected-player' : ''}`}>
      <div className="row between player-seat-head">
        <b>{player.name}</b>
        <span>{player.role}</span>
      </div>
      <div className="muted">{player.status} • {player.coins} coins{player.cutLockTurns > 0 ? ` • Cut lock: ${player.cutLockTurns}` : ""}</div>
      {!player.connected && <div className="disconnect-warning">Disconnected</div>}
      <div className="cards">
        {Array.from({ length: player.cardCount || player.cards?.length || 0 }).map((_, i) => (
          <div key={i} className={isWinner ? 'winner-card-wrap' : ''}>
            <PlayingCard card={player.cards?.[i]} hidden={player.cardsHidden || !player.cards?.[i]} />
          </div>
        ))}
      </div>
      {canRemove && (
        <button type="button" className="emergency-remove-button" onClick={handleRemove}>
          Remove
        </button>
      )}
    </div>
  );
}
