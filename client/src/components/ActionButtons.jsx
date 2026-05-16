import { getPermissions } from '../utils/buttonPermissions';

export default function ActionButtons({ room, playerId, actions, cutPercent, setCutPercent, oneCardMode, setOneCardMode }) {
  const p = getPermissions(room, playerId);
  return (
    <div className="actions">
      {room?.status === 'cutDeck' && (
        <div className="cut-panel">
          <p className="hint">
            Dealer: {p.dealerName}. Cutter: {p.cutterName}. Only the cutter can cut the deck. After the cut, the dealer deals automatically.
          </p>
          {p.canCutDeck ? (
            <>
              <label className="cut-label">Slide to cut the deck</label>
              <input
                className="cut-slider"
                type="range"
                min="1"
                max="99"
                value={cutPercent}
                onChange={(e) => setCutPercent(Number(e.target.value))}
              />
              <p className="hint">The exact card count is hidden, so players cannot calculate Perfect Cut easily.</p>
              {room?.roundType === 'one' && (
                <select value={oneCardMode} onChange={(e) => setOneCardMode(e.target.value)}>
                  <option value="highest">Highest wins</option>
                  <option value="lowest">Lowest wins</option>
                </select>
              )}
              <button onClick={() => actions.cutDeckAndDeal(cutPercent, oneCardMode)}>Cut Deck</button>
            </>
          ) : (
            <p className="hint waiting-text">Waiting for {p.cutterName} to cut the deck.</p>
          )}
        </div>
      )}

      {p.canSeeCards && <button onClick={actions.seeCards}>See Cards</button>}
      {p.canBlindBet && <button onClick={actions.blindBet}>Blind Bet</button>}
      {p.canCut && <button onClick={actions.cut}>Cut</button>}
      {p.canOpenBet && <button onClick={actions.openBet}>Open Bet</button>}
      {p.canDrop && <button onClick={actions.drop}>Drop</button>}
      {p.canSide && <button onClick={actions.askSide}>Ask Side</button>}
      {p.canShow && <button onClick={actions.askShow}>Show</button>}
      {p.canRequestPlaceCut && <button onClick={actions.requestPlaceCut}>Request Place Cut</button>}
      {p.canContinueSamePlayers && <button onClick={actions.continueSamePlayers}>Continue Same Players</button>}
      {p.canLeaveAtCycleBreak && <button onClick={actions.leaveGameAtCycleBreak}>Leave at Round Break</button>}
    </div>
  );
}
