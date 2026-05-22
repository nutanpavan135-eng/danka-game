import { useEffect, useRef, useState } from 'react';
import { useDankaRoom } from './hooks/useDankaRoom';
import PlayerSeat from './components/PlayerSeat';
import PlayingCard from './components/PlayingCard';
import ActionButtons from './components/ActionButtons';
import SettlementPanel from './components/SettlementPanel';
import RoomCodeBadge from './components/RoomCodeBadge';
import { roundLabel } from './utils/displayHelpers';
import { getPermissions } from './utils/buttonPermissions';


function useDankaSoundEffects(room) {
  const audioRef = useRef(null);
  const unlockedRef = useRef(false);
  const previousRef = useRef({ status: null, pot: null, winnerId: null, wellCutId: null, oneCardId: null });

  function getAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioRef.current) audioRef.current = new AudioContextClass();
    return audioRef.current;
  }

  function unlockAudio() {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    unlockedRef.current = true;
  }

  function tone(frequency, duration = 0.08, type = 'sine', volume = 0.045, delay = 0) {
    if (!unlockedRef.current) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  function play(name) {
    if (name === 'deal') {
      [260, 310, 360, 410].forEach((freq, i) => tone(freq, 0.055, 'triangle', 0.035, i * 0.055));
    } else if (name === 'flip') {
      tone(520, 0.06, 'square', 0.025, 0);
      tone(760, 0.08, 'sine', 0.035, 0.06);
    } else if (name === 'coin') {
      tone(780, 0.05, 'triangle', 0.035, 0);
      tone(1040, 0.075, 'triangle', 0.035, 0.055);
    } else if (name === 'winner') {
      [523, 659, 784, 1046].forEach((freq, i) => tone(freq, 0.13, 'sine', 0.045, i * 0.09));
    } else if (name === 'wellCut') {
      [180, 250, 360, 520].forEach((freq, i) => tone(freq, 0.16, 'sawtooth', 0.035, i * 0.08));
    } else if (name === 'drop') {
      tone(180, 0.11, 'sawtooth', 0.035, 0);
    }
  }

  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);

  useEffect(() => {
    if (!room) return;
    const prev = previousRef.current;
    if (prev.status && prev.status !== room.status) {
      if (room.status === 'betting') play('deal');
      if (room.status === 'roundOver' || room.status === 'cycleBreak') play('winner');
    }
    if (prev.pot !== null && room.pot > prev.pot) play('coin');
    if (prev.winnerId !== room.winnerAnnouncement?.id && room.winnerAnnouncement?.id) play('winner');
    if (prev.wellCutId !== room.wellCutAnnouncement?.id && room.wellCutAnnouncement?.id) play('wellCut');
    if (prev.oneCardId !== room.oneCardModeAnnouncement?.id && room.oneCardModeAnnouncement?.id) play('flip');
    previousRef.current = {
      status: room.status,
      pot: room.pot,
      winnerId: room.winnerAnnouncement?.id || null,
      wellCutId: room.wellCutAnnouncement?.id || null,
      oneCardId: room.oneCardModeAnnouncement?.id || null,
    };
  }, [room?.status, room?.pot, room?.winnerAnnouncement?.id, room?.wellCutAnnouncement?.id, room?.oneCardModeAnnouncement?.id]);
}

function cardText(card) {
  return card ? `${card.label}${card.suit}` : 'Hidden';
}

function polygonPoints(sides, cx = 50, cy = 50, r = 44) {
  const n = Math.max(3, Math.min(13, sides));
  return Array.from({ length: n }).map((_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return `${x.toFixed(1)}% ${y.toFixed(1)}%`;
  }).join(', ');
}

function potChipCount(pot) {
  if (!pot) return 5;
  return Math.min(18, Math.max(5, Math.ceil(pot / 2)));
}

function PotOnTable({ pot }) {
  const chips = Array.from({ length: potChipCount(pot) });
  return (
    <div className="real-pot casino-pot" aria-label={`Pot ${pot}`}>
      <div className="casino-pot-stack" aria-hidden="true">
        {chips.map((_, index) => (
          <span
            key={index}
            className={`pot-casino-chip chip-tone-${index % 4}`}
            style={{ '--i': index }}
          />
        ))}
      </div>
      <b>Pot: {pot}</b>
    </div>
  );
}

function PlaceCutDeck({ room, playerId, actions }) {
  if (room.status !== 'placeCut') return null;
  const picks = room.placeCut?.picks || [];
  const myPick = picks.find((p) => p.playerId === playerId);
  const remaining = room.placeCut?.remainingCards ?? Math.max(0, 52 - picks.length);
  const cards = Array.from({ length: remaining });

  return (
    <div className="placecut-table-layer">
      <div className="placecut-instructions">
        <h2>Place Cut</h2>
        <p>Pick any facedown card from the spread. Your selected card will appear beside your player.</p>
        {myPick?.card && <strong>You picked {cardText(myPick.card)}</strong>}
      </div>
      <div className="deck-spread" style={{ '--deck-count': cards.length }}>
        {cards.map((_, index) => {
          const row = Math.floor(index / 13);
          const col = index % 13;
          const angle = ((index % 7) - 3) * 3;
          return (
            <button
              key={index}
              type="button"
              disabled={!!myPick}
              className="spread-card hidden-card"
              style={{ '--row': row, '--col': col, transform: `rotate(${angle}deg)` }}
              onClick={() => actions.pickPlaceCutCard(index)}
              title="Pick this card"
            >
              D
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlaceCutRanking({ room, actions, playerId }) {
  if (room.status !== 'chooseSeat') return null;
  const order = room.placeCut?.order || [];
  const highest = order[0];
  const canChoose = room.placeCut?.highestPlayerId === playerId;

  return (
    <div className="placecut-table-layer ranking-layer">
      <div className="placecut-instructions">
        <h2>Place Cut Result</h2>
        <p>Picked cards are arranged from highest to lowest. Highest card holder chooses the first seat.</p>
        {highest && <strong>{highest.playerName} picked highest: {cardText(highest.card)}</strong>}
      </div>
      <div className="ranked-picks">
        {order.map((pick, index) => (
          <div key={pick.playerId} className={`ranked-pick ${index === 0 ? 'top-rank' : ''}`}>
            <span>#{index + 1}</span>
            <PlayingCard card={pick.card} />
            <b>{pick.playerName}</b>
          </div>
        ))}
      </div>
      {canChoose && <p className="seat-choose-hint">Click one of the table seats to choose where you want to sit.</p>}
      {!canChoose && <p className="seat-choose-hint">Waiting for {highest?.playerName} to choose a seat.</p>}
    </div>
  );
}

function CycleResultPanel({ room }) {
  const reveal = room.lastCycleReveal;
  if (!reveal) return null;
  return (
    <section className="cycle-result-panel">
      <div className="between row wrap">
        <div>
          <h2>Previous Cycle Result</h2>
          <p className="muted">Winner cards are highlighted. Cards stay visible until the next deal.</p>
        </div>
        <div className="winner-badge">{reveal.winnerName} won with {reveal.winningHand?.name}</div>
      </div>
      <div className="result-grid">
        {reveal.players.map((player, index) => (
          <div key={player.id} className={`result-player ${player.id === reveal.winnerId ? 'winner-result' : ''}`}>
            <div className="row between">
              <b>#{index + 1} {player.name}</b>
              <span className="muted">{player.handName}</span>
            </div>
            <div className="muted result-summary">{player.handName}: {player.orderedCardsText}</div>
            <div className="cards">
              {(player.cards || []).map((card, cardIndex) => <PlayingCard key={cardIndex} card={card} hidden={false} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
function TableActionBanner({ room, playerId, permissions }) {
  const me = room.players.find((p) => p.id === playerId);
  const highest = room.placeCut?.order?.[0];
  const current = room.players[room.turnIndex];
  let text = '';

  if (room.status === 'placeCut') {
    text = permissions.canPickPlaceCutCard
      ? 'Your turn: pick one Place Cut card from the table.'
      : me?.status === 'Picked Place Cut'
        ? 'You picked your Place Cut card. Waiting for the other players.'
        : 'Waiting for players to pick their Place Cut cards.';
  } else if (room.status === 'chooseSeat') {
    text = permissions.canChooseSeat
      ? 'Your turn: choose your seat on the table. You will become the dealer.'
      : `Waiting for ${highest?.playerName || 'the highest card holder'} to choose a seat.`;
  } else if (room.status === 'chooseOneCardMode') {
    if (current?.id === playerId) text = 'Single-card special cycle: choose whether Highest Card Wins or Lowest Card Wins.';
    else text = `Waiting for ${current?.name || "the dealer's left-side player"} to choose Highest or Lowest for the single-card cycle.`;
  } else if (room.status === 'betting') {
    const singleCardText = room.roundType === 'one' ? ` Single-card rule: ${room.oneCardMode === 'lowest' ? 'Lowest Card Wins' : 'Highest Card Wins'}.` : '';
    if (current?.id === playerId) {
      if (permissions.canSeeCards && permissions.canBlindBet && permissions.canCut) text = 'Your turn: you may See Cards, Blind Bet, or use Cut.';
      else if (permissions.canSeeCards && permissions.canBlindBet) text = 'Your turn: you may See Cards or Blind Bet.';
      else if (permissions.canOpenBet) text = `Your turn: place an Open Bet, or use another valid action.${singleCardText}`;
      else if (permissions.canDrop && permissions.canShow) text = 'Your turn: choose Drop or Show.';
      else if (permissions.canDrop && permissions.canSide) text = 'Your turn: choose Drop or Ask Side.';
      else text = `Your turn: take your next action.${singleCardText}`;
    } else {
      text = `Waiting for ${current?.name || 'the current player'} to take an action.${singleCardText}`;
    }
  } else if (room.status === 'cycleBreak') {
    text = 'Cycle complete. Eligible players can request Place Cut, leave at round break, or continue with the same players.';
  } else if (room.status === 'roundOver') {
    const dealer = room.players[room.dealerIndex];
    text = permissions.canStartNextRound
      ? 'You won the previous cycle. Click Deal Next Cycle when you are ready to distribute the next hand.'
      : `Waiting for ${dealer?.name || 'the dealer'} to deal the next cycle.`;
  }

  if (!text) return null;
  return <div className="table-action-banner">{text}</div>;
}



function getPerspectivePosition(relativeIndex, n) {
  // Seats stay on the outer rail of the table; cards are positioned separately on the felt.
  if (relativeIndex === 0) return { x: 50, y: 88, scale: 1.10, zone: 'me' };

  const preset = {
    2: { 1: { x: 50, y: 10, scale: 0.9, zone: 'far' } },
    3: {
      1: { x: 93, y: 38, scale: 0.9, zone: 'right-rail' },
      2: { x: 7, y: 38, scale: 0.9, zone: 'left-rail' },
    },
    4: {
      1: { x: 93, y: 45, scale: 0.9, zone: 'right-rail' },
      2: { x: 50, y: 10, scale: 0.86, zone: 'far' },
      3: { x: 7, y: 45, scale: 0.9, zone: 'left-rail' },
    },
    5: {
      1: { x: 93, y: 52, scale: 0.88, zone: 'right-rail' },
      2: { x: 64, y: 10, scale: 0.84, zone: 'far' },
      3: { x: 36, y: 10, scale: 0.84, zone: 'far' },
      4: { x: 7, y: 52, scale: 0.88, zone: 'left-rail' },
    },
  };

  if (preset[n] && preset[n][relativeIndex]) return preset[n][relativeIndex];

  const angle = 90 - (360 * relativeIndex) / n;
  const x = 50 + 46 * Math.cos((Math.PI / 180) * angle);
  const y = 50 + 41 * Math.sin((Math.PI / 180) * angle);
  const railX = Math.max(6, Math.min(94, x));
  const railY = Math.max(9, Math.min(88, y));
  const frontScale = railY > 70 ? 1.02 : railY < 22 ? 0.84 : 0.9;
  return { x: railX, y: railY, scale: frontScale, zone: railY > 70 ? 'near' : railY < 25 ? 'far' : railX > 50 ? 'right-rail' : 'left-rail' };
}

function getCardTargetPosition(relativeIndex, n) {
  if (relativeIndex === 0) return { x: 50, y: 64, scale: 1.08, zone: 'me-cards' };

  const preset = {
    2: { 1: { x: 50, y: 32, scale: 0.86, zone: 'far-cards' } },
    3: {
      1: { x: 74, y: 42, scale: 0.82, zone: 'right-cards' },
      2: { x: 26, y: 42, scale: 0.82, zone: 'left-cards' },
    },
    4: {
      1: { x: 75, y: 47, scale: 0.82, zone: 'right-cards' },
      2: { x: 50, y: 30, scale: 0.82, zone: 'far-cards' },
      3: { x: 25, y: 47, scale: 0.82, zone: 'left-cards' },
    },
    5: {
      1: { x: 76, y: 52, scale: 0.80, zone: 'right-cards' },
      2: { x: 62, y: 31, scale: 0.78, zone: 'far-cards' },
      3: { x: 38, y: 31, scale: 0.78, zone: 'far-cards' },
      4: { x: 24, y: 52, scale: 0.80, zone: 'left-cards' },
    },
  };

  if (preset[n] && preset[n][relativeIndex]) return preset[n][relativeIndex];
  const angle = 90 - (360 * relativeIndex) / n;
  const x = 50 + 31 * Math.cos((Math.PI / 180) * angle);
  const y = 50 + 28 * Math.sin((Math.PI / 180) * angle);
  return { x, y, scale: y > 58 ? 0.88 : y < 36 ? 0.78 : 0.82, zone: x > 58 ? 'right-cards' : x < 42 ? 'left-cards' : 'far-cards' };
}

function useDealtCardVisibility(room, myIndex) {
  const [visibleCounts, setVisibleCounts] = useState({});
  const n = room.players.length || 1;
  const cardsEach = cardDealCountForRoom(room);
  const dealKey = `${room.status}-${room.completedRounds}-${room.roundType}-${room.dealerIndex}-${room.players.map((p) => p.cardCount || 0).join('.')}`;

  useEffect(() => {
    if (room.status !== 'betting' || cardsEach <= 0) {
      setVisibleCounts({});
      return;
    }

    const initialCounts = Object.fromEntries(room.players.map((p) => [p.id, 0]));
    setVisibleCounts(initialCounts);
    const timers = [];
    let order = 0;

    for (let round = 0; round < cardsEach; round += 1) {
      for (let offset = 1; offset <= n; offset += 1) {
        const playerIndex = (room.dealerIndex - offset + n) % n;
        const player = room.players[playerIndex];
        const delay = 900 + order * 330 + 300;
        timers.push(setTimeout(() => {
          setVisibleCounts((current) => ({
            ...current,
            [player.id]: Math.max(current[player.id] || 0, round + 1),
          }));
        }, delay));
        order += 1;
      }
    }

    timers.push(setTimeout(() => {
      setVisibleCounts(Object.fromEntries(room.players.map((p) => [p.id, Math.max(p.cardCount || 0, p.cards?.length || 0)])));
    }, 1000 + order * 330 + 500));

    return () => timers.forEach(clearTimeout);
  }, [dealKey, myIndex]);

  return visibleCounts;
}

function roleTextForPlayer(room, playerIndex, n) {
  if (playerIndex === room.dealerIndex) return 'Dealer';
  if (playerIndex === (room.dealerIndex + 1) % n) return 'First Turn';
  return 'Player';
}

function TableSeatCards({ player, isMe, revealAllowed, visibleCount, cardPosition }) {
  const totalCount = Math.max(player.cardCount || 0, player.cards?.length || 0);
  const count = visibleCount === undefined ? totalCount : Math.min(totalCount, visibleCount);
  if (!count) return null;
  const backStatus = player.folded || String(player.status || '').toLowerCase().includes('drop')
    ? 'dropped'
    : player.sawCards
      ? 'open'
      : 'blind';

  return (
    <div className={`table-seat-cards floating-table-cards ${isMe ? 'my-table-cards' : 'opponent-table-cards'} ${cardPosition?.zone || ''} player-cards-${backStatus}`} style={{ '--card-x': `${cardPosition?.x ?? 50}%`, '--card-y': `${cardPosition?.y ?? 50}%`, '--card-target-scale': cardPosition?.scale ?? 1 }}>
      {Array.from({ length: count }).map((_, i) => {
        const card = player.cards?.[i];
        const hidden = !revealAllowed || player.cardsHidden || !card;
        const rotation = (i - (count - 1) / 2) * (isMe ? 5 : 3);
        return (
          <div
            key={`${i}-${hidden ? 'back' : 'face'}-${backStatus}-${card ? `${card.label}${card.suit}` : 'x'}`}
            className={`table-card-wrap ${hidden ? 'is-card-back' : 'is-card-face'} ${backStatus === 'dropped' ? 'is-dropped-card' : ''}`}
            style={{ '--card-rotation': `${rotation}deg` }}
          >
            <PlayingCard card={card} hidden={hidden} backStatus={backStatus} />
          </div>
        );
      })}
    </div>
  );
}

function PlayerTableSeat({ player, playerIndex, relativeIndex, n, room, playerId, actions, visibleCardCount }) {
  const pick = room.placeCut?.picks?.find((p) => p.playerId === player.id);
  const showSeatNumbers = room.status === 'chooseSeat';
  const canChooseSeat = room.status === 'chooseSeat' && room.placeCut?.highestPlayerId === playerId;
  const roleText = roleTextForPlayer(room, playerIndex, n);
  const pos = getPerspectivePosition(relativeIndex, n);
  const cardPosition = getCardTargetPosition(relativeIndex, n);
  const isMe = player.id === playerId;
  const isCurrentTurn = room.players[room.turnIndex]?.id === player.id;
  // During cycle break / show result, keep the table clean so the winner popup is readable.
  // The previous-cycle panel still shows the finished hand details.
  const showTableCards = room.status === 'betting';
  const revealAllowed = isMe || !player.cardsHidden;

  return (
    <>
      {showTableCards && <TableSeatCards player={player} isMe={isMe} revealAllowed={revealAllowed} visibleCount={visibleCardCount} cardPosition={cardPosition} />}
      <button
        type="button"
        disabled={!canChooseSeat}
        onClick={() => actions.chooseSeat(playerIndex)}
        className={`seat avatar-seat perspective-seat player-tone-${playerIndex % 8} ${isMe ? 'my-seat' : ''} ${isCurrentTurn ? 'active-player-seat' : ''} ${playerIndex === room.dealerIndex ? 'dealer' : ''} ${canChooseSeat ? 'clickable-seat' : ''}`}
        style={{ left: `${pos.x}%`, top: `${pos.y}%`, '--seat-scale': pos.scale }}
      >
        {showSeatNumbers && <div className="seat-label">Seat {playerIndex + 1}</div>}
        <div className="avatar"><span className="avatar-head" /><span className="avatar-body" /></div>
        <b>{room.status === 'chooseSeat' ? 'Choose here' : player.name}</b>
        <small>{room.status === 'chooseSeat' ? 'Available seat' : roleText}</small>
        {['placeCut', 'chooseSeat'].includes(room.status) && pick?.card && <div className="seat-pick"><PlayingCard card={pick.card} /></div>}
        {['placeCut', 'chooseSeat'].includes(room.status) && pick?.hasPicked && !pick?.card && <div className="seat-pick-mini">Picked</div>}
      </button>
    </>
  );
}



function TimedCenterPopup({ announcement, className = "one-card-popup" }) {
  const [visibleId, setVisibleId] = useState(null);
  useEffect(() => {
    if (!announcement?.id) return;
    setVisibleId(announcement.id);
    const timer = setTimeout(() => setVisibleId(null), 2600);
    return () => clearTimeout(timer);
  }, [announcement?.id]);

  if (!announcement || visibleId !== announcement.id) return null;
  return (
    <div className={className}>
      <strong>{announcement.text}</strong>
    </div>
  );
}

function CashAwardAnimation({ award, players, myIndex }) {
  const [visibleId, setVisibleId] = useState(null);
  useEffect(() => {
    if (!award?.id) return;
    setVisibleId(award.id);
    const timer = setTimeout(() => setVisibleId(null), 1600);
    return () => clearTimeout(timer);
  }, [award?.id]);

  if (!award || visibleId !== award.id) return null;
  const winnerIndex = players.findIndex((p) => p.id === award.winnerId);
  const n = players.length || 1;
  const relativeIndex = winnerIndex >= 0 ? (winnerIndex - myIndex + n) % n : 0;
  const pos = getPerspectivePosition(relativeIndex, n);
  const cardPosition = getCardTargetPosition(relativeIndex, n);
  return <div className="cash-award-fly" style={{ '--cash-to-x': `${pos.x - 50}%`, '--cash-to-y': `${pos.y - 50}%` }}>💵</div>;
}


function cardDealCountForRoom(room) {
  return Math.max(0, ...room.players.map((p) => p.cardCount || p.cards?.length || 0));
}

function CenterDeck({ dealKey, show, duration = 5 }) {
  if (!show) return null;
  return (
    <div className="center-deck-523" aria-hidden="true" key={`deck-${dealKey}`} style={{ '--deck-duration': `${duration}s` }}>
      {Array.from({ length: 5 }).map((_, index) => <span key={index} style={{ '--i': index }} />)}
    </div>
  );
}

function DealingCardsOverlay({ room, myIndex }) {
  const [deal, setDeal] = useState(null);
  const n = room.players.length || 1;
  const cardsEach = cardDealCountForRoom(room);
  const dealKey = `${room.status}-${room.completedRounds}-${room.roundType}-${room.dealerIndex}-${room.players.map((p) => p.cardCount || 0).join('.')}`;

  useEffect(() => {
    if (room.status !== 'betting' || cardsEach <= 0) return;
    const sequence = [];
    let order = 0;
    for (let round = 0; round < cardsEach; round += 1) {
      for (let offset = 1; offset <= n; offset += 1) {
        const playerIndex = (room.dealerIndex - offset + n) % n;
        const relativeIndex = (playerIndex - myIndex + n) % n;
        const pos = getPerspectivePosition(relativeIndex, n);
  const cardPosition = getCardTargetPosition(relativeIndex, n);
        sequence.push({ order, x: pos.x, y: pos.y, scale: pos.scale, round });
        order += 1;
      }
    }
    setDeal({ id: dealKey, sequence });
    const totalTime = 800 + sequence.length * 330;
    const timer = setTimeout(() => setDeal((current) => current?.id === dealKey ? null : current), totalTime);
    return () => clearTimeout(timer);
  }, [dealKey]);

  if (!deal) return null;
  return (
    <div className="dealing-overlay-523" aria-hidden="true">
      {deal.sequence.map((item) => (
        <span
          key={`${deal.id}-${item.order}`}
          className="flying-deal-card-523"
          style={{
            '--to-x': `${item.x - 50}%`,
            '--to-y': `${item.y - 50}%`,
            '--deal-delay': `${0.9 + item.order * 0.33}s`,
            '--deal-scale': item.scale,
            '--deal-rotate': `${((item.order % 5) - 2) * 5}deg`,
          }}
        >D</span>
      ))}
    </div>
  );
}

function ChipFlights({ room, myIndex }) {
  const [flights, setFlights] = useState([]);
  const previousRef = useRef(null);
  const n = room.players.length || 1;
  const dealKey = `${room.status}-${room.completedRounds}-${room.roundType}-${room.dealerIndex}-${room.players.map((p) => p.cardCount || 0).join('.')}`;

  useEffect(() => {
    const previous = previousRef.current;
    const next = { pot: room.pot || 0, status: room.status, dealKey, coins: Object.fromEntries(room.players.map((p) => [p.id, p.coins])) };
    const created = [];

    if (room.status === 'betting' && previous?.dealKey !== dealKey && room.pot >= room.players.length && cardDealCountForRoom(room) > 0) {
      room.players.forEach((player, playerIndex) => {
        const relativeIndex = (playerIndex - myIndex + n) % n;
        const pos = getPerspectivePosition(relativeIndex, n);
  const cardPosition = getCardTargetPosition(relativeIndex, n);
        created.push({ id: `ante-${dealKey}-${player.id}`, x: pos.x, y: pos.y, delay: Math.max(0, ((playerIndex - room.dealerIndex + n) % n)) * 0.08, label: '1' });
      });
    } else if (previous && room.pot > previous.pot) {
      const changedPlayers = room.players.filter((p) => previous.coins[p.id] !== undefined && p.coins < previous.coins[p.id]);
      const sources = changedPlayers.length ? changedPlayers : [room.players[(room.turnIndex - 1 + n) % n]].filter(Boolean);
      sources.forEach((player, sourceIndex) => {
        const playerIndex = room.players.findIndex((p) => p.id === player.id);
        const relativeIndex = (playerIndex - myIndex + n) % n;
        const pos = getPerspectivePosition(relativeIndex, n);
  const cardPosition = getCardTargetPosition(relativeIndex, n);
        const amount = Math.max(1, (previous.coins[player.id] || player.coins) - player.coins);
        for (let i = 0; i < Math.min(4, amount); i += 1) {
          created.push({ id: `bet-${Date.now()}-${player.id}-${i}`, x: pos.x, y: pos.y, delay: sourceIndex * 0.05 + i * 0.06, label: amount > 1 ? '2' : '1' });
        }
      });
    }

    if (created.length) {
      setFlights(created);
      const timer = setTimeout(() => setFlights([]), 1500);
      previousRef.current = next;
      return () => clearTimeout(timer);
    }
    previousRef.current = next;
  }, [room.pot, room.status, dealKey, room.players.map((p) => `${p.id}:${p.coins}`).join('|')]);

  if (!flights.length) return null;
  return (
    <div className="chip-flight-layer-523" aria-hidden="true">
      {flights.map((chip, index) => (
        <span
          key={chip.id}
          className={`flying-chip-523 chip-tone-${index % 4}`}
          style={{
            '--from-x': `${chip.x - 50}%`,
            '--from-y': `${chip.y - 50}%`,
            '--chip-delay': `${chip.delay}s`,
          }}
        >{chip.label}</span>
      ))}
    </div>
  );
}

function SeatTable({ room, playerId, actions, cutPercent, setCutPercent, oneCardMode, setOneCardMode }) {
  if (!['placeCut', 'chooseSeat', 'chooseOneCardMode', 'betting', 'roundOver', 'cycleBreak', 'sessionEnded'].includes(room.status)) return null;
  const n = room.players.length;
  const dealer = room.players[room.dealerIndex];
  const permissions = getPermissions(room, playerId);
  const myIndex = Math.max(0, room.players.findIndex((p) => p.id === playerId));
  const dealtCardVisibility = useDealtCardVisibility(room, myIndex);
  const perspectivePlayers = room.players.map((player, playerIndex) => ({
    player,
    playerIndex,
    relativeIndex: (playerIndex - myIndex + n) % n,
  }));
  const dealKey = `${room.status}-${room.completedRounds}-${room.roundType}-${room.dealerIndex}-${room.players.map((p) => p.cardCount || 0).join('.')}`;
  const cardsEach = cardDealCountForRoom(room);
  const showCenterDeck = room.status === 'betting' && cardsEach > 0;
  const deckDuration = Math.max(3.2, 1 + (n * cardsEach * 0.33) + 0.7);

  return (
    <section className="seat-table-panel table-half-panel perspective-table-panel">
      <div className="between row wrap table-header-mini perspective-header">
        <div>
          <h2>Danka Table</h2>
          <p className="muted">Dealer: <b>{dealer?.name || '-'}</b></p>
        </div>
        <p className="muted">{n}-player table • your perspective</p>
      </div>

      <TableActionBanner room={room} playerId={playerId} permissions={permissions} />

      <div className="seats polygon-seats big-table-stage perspective-stage" style={{ '--player-count': n }}>
        <div className="table-center polygon-table real-table perspective-felt-table">
          <CenterDeck dealKey={dealKey} show={showCenterDeck} duration={deckDuration} />
          {['betting', 'roundOver', 'cycleBreak', 'sessionEnded'].includes(room.status) && <PotOnTable pot={room.pot} />}
          <TimedCenterPopup announcement={room.oneCardModeAnnouncement} />
          <TimedCenterPopup announcement={room.wellCutAnnouncement} className="one-card-popup well-cut-popup" />
          <TimedCenterPopup announcement={room.winnerAnnouncement} className="one-card-popup winner-pop-popup" />
        </div>
        <DealingCardsOverlay room={room} myIndex={myIndex} />
        <ChipFlights room={room} myIndex={myIndex} />
        <CashAwardAnimation award={room.cashAward} players={room.players} myIndex={myIndex} />

        <PlaceCutDeck room={room} playerId={playerId} actions={actions} />
        <PlaceCutRanking room={room} playerId={playerId} actions={actions} />

        {perspectivePlayers.map(({ player, playerIndex, relativeIndex }) => (
          <PlayerTableSeat
            key={player.id}
            player={player}
            playerIndex={playerIndex}
            relativeIndex={relativeIndex}
            n={n}
            room={room}
            playerId={playerId}
            actions={actions}
            visibleCardCount={dealtCardVisibility[player.id]}
          />
        ))}

        <div className="table-action-dock">
          <ActionButtons
            room={room}
            playerId={playerId}
            actions={actions}
            cutPercent={cutPercent}
            setCutPercent={setCutPercent}
            oneCardMode={oneCardMode}
            setOneCardMode={setOneCardMode}
            showCutPanel={false}
          />
        </div>
      </div>
    </section>
  );
}


function MobileInfoDrawers({ room }) {
  const [openPanel, setOpenPanel] = useState(null);
  const reveal = room.lastCycleReveal;
  const close = () => setOpenPanel(null);

  return (
    <div className="mobile-drawer-system" aria-label="Mobile game panels">
      <button type="button" className="mobile-edge-tab mobile-left-tab" onClick={() => setOpenPanel(openPanel === 'left' ? null : 'left')} aria-label="Open previous result panel">‹</button>
      <button type="button" className="mobile-edge-tab mobile-right-tab" onClick={() => setOpenPanel(openPanel === 'right' ? null : 'right')} aria-label="Open players panel">›</button>

      {openPanel && <button type="button" className="mobile-drawer-backdrop" onClick={close} aria-label="Close mobile panel" />}

      <aside className={`mobile-slide-panel left-panel ${openPanel === 'left' ? 'is-open' : ''}`}>
        <div className="mobile-panel-head">
          <h2>Previous Result</h2>
          <button type="button" onClick={close}>×</button>
        </div>
        {!reveal && <p className="muted">No previous cycle result yet.</p>}
        {reveal && (
          <div className="mobile-result-list">
            <p className="winner-badge mobile-winner-badge">{reveal.winnerName} won with {reveal.winningHand?.name}</p>
            {reveal.players.map((player, index) => (
              <div key={player.id} className={`mobile-result-card ${player.id === reveal.winnerId ? 'winner-result' : ''}`}>
                <div className="row between">
                  <b>#{index + 1} {player.name}</b>
                  <span>{player.handName}</span>
                </div>
                <p className="muted">{player.orderedCardsText}</p>
                <div className="cards compact-picks">
                  {(player.cards || []).map((card, cardIndex) => <PlayingCard key={cardIndex} card={card} hidden={false} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      <aside className={`mobile-slide-panel right-panel ${openPanel === 'right' ? 'is-open' : ''}`}>
        <div className="mobile-panel-head">
          <h2>Players</h2>
          <button type="button" onClick={close}>×</button>
        </div>
        <div className="mobile-player-list">
          {room.players.map((player, index) => (
            <div key={player.id} className={`mobile-player-card player-tone-${index % 8} ${index === room.turnIndex ? 'turn' : ''} ${player.id === room.winnerId ? 'winner-result' : ''}`}>
              <div className="row between">
                <b>{player.name}</b>
                <span>{index === room.turnIndex ? 'Turn' : player.role}</span>
              </div>
              <p className="muted">Coins: <b>{player.coins}</b> • Status: {player.status || '-'}</p>
              <p className="muted">Cards: {player.cardCount || player.cards?.length || 0} • {player.sawCards ? 'Open' : 'Blind'}</p>
            </div>
          ))}
        </div>
        <SettlementPanel room={room} />
      </aside>
    </div>
  );
}

function MobilePortraitNotice() {
  return (
    <div className="mobile-portrait-notice">
      <div>
        <strong>Rotate your phone</strong>
        <p>Danka mobile is designed for landscape mode. Turn your phone sideways to play.</p>
      </div>
    </div>
  );
}

export default function App() {
  const [entryMode, setEntryMode] = useState('choose');
  const [createName, setCreateName] = useState('Nutan');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [startingCoins, setStartingCoins] = useState(100);
  const [cyclesPerRound, setCyclesPerRound] = useState(20);
  const [cutPercent, setCutPercent] = useState(50);
  const [oneCardMode, setOneCardMode] = useState('highest');
  const danka = useDankaRoom();
  const { connected, room, roomCode, playerId, error, isRestoringSession, createRoom, joinRoom } = danka;
  useDankaSoundEffects(room);

  function resetEntry() {
    setEntryMode('choose');
    setJoinCode('');
  }


  if (!room && isRestoringSession) {
    return (
      <main className="page reconnect-page">
        <section className="reconnect-card">
          <div className="reconnect-loader" aria-hidden="true" />
          <h1>Reconnecting to your Danka table...</h1>
          <p>Hold on. We are restoring your room and player seat.</p>
          <small>{connected ? 'Backend connected' : 'Connecting to backend...'}</small>
        </section>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="page home entry-home">
        <section className="hero entry-hero">
          <h1>DANKA</h1>
          <p>Play Danka online with your friends.</p>
          <p className={connected ? 'ok' : 'bad'}>{connected ? 'Backend connected' : 'Backend not connected'}</p>
        </section>

        {entryMode === 'choose' && (
          <section className="panel entry-choice-panel">
            <h2>Welcome to Danka</h2>
            <p className="muted entry-muted">Choose how you want to enter the game.</p>
            <div className="entry-choice-grid">
              <button className="entry-card-button" onClick={() => setEntryMode('create')}>
                <span>Create Room</span>
                <small>Start a new table and become the admin.</small>
              </button>
              <button className="entry-card-button secondary-choice" onClick={() => setEntryMode('join')}>
                <span>Join Room</span>
                <small>Enter a room code shared by your friend.</small>
              </button>
            </div>
            {error && <p className="error">{error}</p>}
          </section>
        )}

        {entryMode === 'create' && (
          <section className="panel form entry-form-panel">
            <div className="entry-form-head">
              <button className="back-link" onClick={resetEntry}>← Back</button>
              <h2>Create Room</h2>
              <p className="muted">Enter your name, starting coins, and how many cycles should make one round.</p>
            </div>
            <label>Your Name</label>
            <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Enter your name" />
            <label>Coins Per Person</label>
            <input type="number" min="1" value={startingCoins} onChange={(e) => setStartingCoins(Number(e.target.value))} />
            <label>Cycles Per Round</label>
            <input type="number" min="1" max="50" value={cyclesPerRound} onChange={(e) => setCyclesPerRound(Number(e.target.value))} />
            <p className="muted tiny-help">After this many completed cycles, players can request Place Cut, continue with the same players, or leave at the round break.</p>
            <button onClick={() => createRoom({ playerName: createName, startingCoins, cyclesPerRound })}>Create Room</button>
            {error && <p className="error">{error}</p>}
          </section>
        )}

        {entryMode === 'join' && (
          <section className="panel form entry-form-panel">
            <div className="entry-form-head">
              <button className="back-link" onClick={resetEntry}>← Back</button>
              <h2>Join Room</h2>
              <p className="muted">Enter your name and the room code shared by the room admin.</p>
            </div>
            <label>Your Name</label>
            <input value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="Enter your name" />
            <label>Room Code</label>
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Enter room code" />
            <button onClick={() => joinRoom({ roomCode: joinCode, playerName: joinName })}>Join Room</button>
            {error && <p className="error">{error}</p>}
          </section>
        )}
      </main>
    );
  }

  const me = room.players.find((p) => p.id === playerId);
  const permissions = getPermissions(room, playerId);

  return (
    <main className="page game-page">
      <header className="topbar compact-topbar">
        <div>
          <h1>Danka Table</h1>
          <p>{room.status} • {roundLabel(room.roundType, room.oneCardMode)} • Cycles completed {room.completedRounds}/{room.cycleTarget || '-'}</p>
          <p className="you-line">You are playing as: <strong>{me?.name}</strong> ({me?.role})</p>
        </div>
        <div className="top-right-controls">
          <RoomCodeBadge code={roomCode} />
          {permissions.canStartGame && <button onClick={danka.startGame}>Start Game</button>}
          {room.status === 'sessionEnded' && <button onClick={danka.startNewGame}>Start New Game</button>}
          {permissions.canEndSession && <button className="danger" onClick={danka.endSession}>End Session</button>}
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      <p className="notice compact-notice">{room.lastActionMessage}</p>
      <MobilePortraitNotice />
      <MobileInfoDrawers room={room} />

      <section className="game-split game-split-38">
        <div className="table-half">
          <SeatTable room={room} playerId={playerId} actions={danka} cutPercent={cutPercent} setCutPercent={setCutPercent} oneCardMode={oneCardMode} setOneCardMode={setOneCardMode} />
        </div>

        <div className="control-half">
          <CycleResultPanel room={room} />
          <section className="action-panel status-panel-54">
            <div className="control-head">
              <div>
                <h2>Game Status</h2>
                <p className="muted">Main action buttons now appear beside your seat area.</p>
              </div>
              <div className="mini-pot">{room.status}</div>
            </div>
            <p className="hint waiting-text">Watch the table banner and use the buttons near your seat when it is your turn.</p>
            {room.status === 'sessionEnded' && <button onClick={danka.startNewGame}>Start New Game</button>}
          </section>

          <section className="players-panel">
            <h2>Players</h2>
            <div className="player-list-grid">
              {room.players.map((player, index) => (
                <PlayerSeat key={player.id} player={player} isTurn={index === room.turnIndex} isWinner={player.id === room.winnerId} />
              ))}
            </div>
            <SettlementPanel room={room} />
</section>
        </div>
      </section>
    </main>
  );
}
