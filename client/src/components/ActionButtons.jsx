import { useEffect, useState } from 'react';
import { getPermissions } from '../utils/buttonPermissions';
import { triggerHaptic } from '../utils/haptics';

export default function ActionButtons({ room, playerId, actions }) {
  const p = getPermissions(room, playerId);
  const [dealCountdownMs, setDealCountdownMs] = useState(0);
  const leftButtons = [];
  const rightButtons = [];
  const cycleBreakButtons = [];
  let fixedDropButton = null;

  useEffect(() => {
    if (!p.canStartNextRound) {
      setDealCountdownMs(0);
      return undefined;
    }

    const initialMs = Number.isFinite(room?.nextCycleDealReadyInMs)
      ? room.nextCycleDealReadyInMs
      : Math.max(0, (room?.nextCycleDealReadyAt || 0) - Date.now());
    setDealCountdownMs(Math.max(0, initialMs));
    if (initialMs <= 0) return undefined;

    const unlockAt = Date.now() + initialMs;
    const timer = window.setInterval(() => {
      setDealCountdownMs(Math.max(0, unlockAt - Date.now()));
    }, 250);
    return () => window.clearInterval(timer);
  }, [p.canStartNextRound, room?.nextCycleDealReadyAt, room?.nextCycleDealReadyInMs, room?.status, room?.winnerAnnouncement?.id]);

  function runAction(action, haptic = 'action') {
    triggerHaptic(haptic);
    action?.();
  }

  function actionButton(key, label, className, action, haptic = 'action') {
    return (
      <button key={key} type="button" className={className} onClick={() => runAction(action, haptic)}>
        {label}
      </button>
    );
  }

  if (p.canSeeCards) leftButtons.push(actionButton('see', 'See Cards', 'action-button action-primary', actions.seeCards, 'selection'));
  if (p.canBlindBet) leftButtons.push(actionButton('blind', 'Blind Bet', 'action-button action-secondary', actions.blindBet));
  if (p.canCut) leftButtons.push(actionButton('cut', 'Cut', 'action-button action-special', actions.cut, 'selection'));

  if (p.canOpenBet) rightButtons.push(actionButton('open', 'Open Bet', 'action-button action-money', actions.openBet));
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
          triggerHaptic('danger');
          actions.drop();
        }}
      >
        Drop
      </button>
    );
  }
  if (p.canSide) rightButtons.push(actionButton('side', 'Ask Side', 'action-button action-special', actions.askSide, 'selection'));
  if (p.canShow) rightButtons.push(actionButton('show', 'Show', 'action-button action-show', actions.askShow, 'selection'));
  if (p.canStartNextRound) {
    const dealLocked = dealCountdownMs > 0;
    const dealSeconds = Math.max(1, Math.ceil(dealCountdownMs / 1000));
    rightButtons.push(
      <button
        key="dealnext"
        type="button"
        className={`action-button action-primary deal-next-action ${dealLocked ? 'is-counting-down' : ''}`}
        disabled={dealLocked}
        onClick={() => {
          if (dealLocked) return;
          runAction(actions.startNextRound, 'selection');
        }}
      >
        {dealLocked ? `Deal in ${dealSeconds}s` : 'Deal Next Cycle'}
      </button>
    );
  }
  if (p.canChooseOneCardMode) {
    leftButtons.push(actionButton('highest', 'Highest Wins', 'action-button action-special', () => actions.chooseOneCardMode('highest'), 'selection'));
    rightButtons.push(actionButton('lowest', 'Lowest Wins', 'action-button action-special', () => actions.chooseOneCardMode('lowest'), 'selection'));
  }

  if (room?.status === 'cycleBreak') {
    if (p.canRequestPlaceCut) cycleBreakButtons.push(actionButton('placecut', 'Place Cut', 'cycle-break-button cycle-break-placecut', actions.requestPlaceCut, 'selection'));
    if (p.canContinueSamePlayers) cycleBreakButtons.push(actionButton('continue', 'Continue', 'cycle-break-button cycle-break-continue', actions.continueSamePlayers, 'selection'));
    if (p.canLeaveAtCycleBreak) cycleBreakButtons.push(actionButton('leave', 'Leave', 'cycle-break-button cycle-break-leave', actions.leaveGameAtCycleBreak, 'danger'));
  } else {
    if (p.canRequestPlaceCut) rightButtons.push(actionButton('placecut', 'Request Place Cut', 'action-button action-special', actions.requestPlaceCut, 'selection'));
    if (p.canContinueSamePlayers) rightButtons.push(actionButton('continue', 'Continue Same Players', 'action-button action-primary', actions.continueSamePlayers, 'selection'));
    if (p.canLeaveAtCycleBreak) rightButtons.push(actionButton('leave', 'Leave at Round Break', 'action-button action-secondary', actions.leaveGameAtCycleBreak, 'danger'));
  }

  if (cycleBreakButtons.length) {
    return (
      <div className="actions cycle-break-action-shell">
        <div className="cycle-break-actions" aria-label="Round break actions">
          {cycleBreakButtons}
        </div>
      </div>
    );
  }

  const hasActions = leftButtons.length > 0 || rightButtons.length > 0 || !!fixedDropButton;
  if (!hasActions) return null;

  return (
    <div className="actions">
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
