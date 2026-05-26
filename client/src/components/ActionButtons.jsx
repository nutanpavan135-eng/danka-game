import { getPermissions } from '../utils/buttonPermissions';

export default function ActionButtons({ room, playerId, actions }) {
  const p = getPermissions(room, playerId);
  const leftButtons = [];
  const rightButtons = [];
  let fixedDropButton = null;

  if (p.canSeeCards) leftButtons.push(<button key="see" className="action-button action-primary" onClick={actions.seeCards}>See Cards</button>);
  if (p.canBlindBet) leftButtons.push(<button key="blind" className="action-button action-secondary" onClick={actions.blindBet}>Blind Bet</button>);
  if (p.canCut) leftButtons.push(<button key="cut" className="action-button action-special" onClick={actions.cut}>Cut</button>);

  if (p.canOpenBet) rightButtons.push(<button key="open" className="action-button action-money" onClick={actions.openBet}>Open Bet</button>);
  if (p.canDrop) {
    fixedDropButton = (
      <button
        key="drop"
        type="button"
        className="action-button action-danger drop-action fixed-drop-action"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          actions.drop();
        }}
      >
        Drop
      </button>
    );
  }
  if (p.canSide) rightButtons.push(<button key="side" className="action-button action-special" onClick={actions.askSide}>Ask Side</button>);
  if (p.canShow) rightButtons.push(<button key="show" className="action-button action-show" onClick={actions.askShow}>Show</button>);
  if (p.canStartNextRound) rightButtons.push(<button key="dealnext" className="action-button action-primary" onClick={actions.startNextRound}>Deal Next Cycle</button>);
  if (p.canChooseOneCardMode) {
    leftButtons.push(<button key="highest" className="action-button action-special" onClick={() => actions.chooseOneCardMode('highest')}>Highest Wins</button>);
    rightButtons.push(<button key="lowest" className="action-button action-special" onClick={() => actions.chooseOneCardMode('lowest')}>Lowest Wins</button>);
  }
  if (p.canRequestPlaceCut) rightButtons.push(<button key="placecut" className="action-button action-special" onClick={actions.requestPlaceCut}>Request Place Cut</button>);
  if (p.canContinueSamePlayers) rightButtons.push(<button key="continue" className="action-button action-primary" onClick={actions.continueSamePlayers}>Continue Same Players</button>);
  if (p.canLeaveAtCycleBreak) rightButtons.push(<button key="leave" className="action-button action-secondary" onClick={actions.leaveGameAtCycleBreak}>Leave at Round Break</button>);

  const hasActions = leftButtons.length > 0 || rightButtons.length > 0 || !!fixedDropButton;
  const shouldShowCutPanel = false;

  if (!shouldShowCutPanel && !hasActions) return null;

  return (
    <div className="actions">
      {shouldShowCutPanel && (
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

      {hasActions && (
        <div className={`action-groups ${leftButtons.length && rightButtons.length ? 'both-sides' : leftButtons.length ? 'only-left' : 'only-right'}`}>
          {leftButtons.length > 0 && <div className="action-group action-group-left">{leftButtons}</div>}
          {leftButtons.length > 0 && rightButtons.length > 0 && <div className="action-center-gap" aria-hidden="true" />}
          {rightButtons.length > 0 && <div className="action-group action-group-right">{rightButtons}</div>}
        </div>
      )}
      {fixedDropButton}
    </div>
  );
}
