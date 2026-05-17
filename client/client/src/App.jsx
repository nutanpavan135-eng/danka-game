import { useEffect, useMemo, useState } from 'react';
import { useDankaRoom } from './hooks/useDankaRoom';
import PlayerSeat from './components/PlayerSeat';
import PlayingCard from './components/PlayingCard';
import ActionButtons from './components/ActionButtons';
import SettlementPanel from './components/SettlementPanel';
import RoomCodeBadge from './components/RoomCodeBadge';
import { roundLabel } from './utils/displayHelpers';
import { getPermissions } from './utils/buttonPermissions';

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
  return (
    <div className="real-pot cash-pot" aria-label={`Pot ${pot}`}>
      <div className="cash-stack" aria-hidden="true">
        <span className="cash-note note-a">$</span>
        <span className="cash-note note-b">$</span>
        <span className="cash-band" />
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
  if (relativeIndex === 0) return { x: 50, y: 78, scale: 1.12, zone: 'me' };

  const preset = {
    2: { 1: { x: 50, y: 22, scale: 0.9, zone: 'far' } },
    3: {
      1: { x: 82, y: 30, scale: 0.92, zone: 'side' },
      2: { x: 18, y: 30, scale: 0.92, zone: 'side' },
    },
    4: {
      1: { x: 82, y: 36, scale: 0.92, zone: 'side' },
      2: { x: 50, y: 20, scale: 0.88, zone: 'far' },
      3: { x: 18, y: 36, scale: 0.92, zone: 'side' },
    },
    5: {
      1: { x: 80, y: 44, scale: 0.94, zone: 'side' },
      2: { x: 64, y: 22, scale: 0.88, zone: 'far' },
      3: { x: 36, y: 22, scale: 0.88, zone: 'far' },
      4: { x: 20, y: 44, scale: 0.94, zone: 'side' },
    },
  };

  if (preset[n] && preset[n][relativeIndex]) return preset[n][relativeIndex];

  const rx = n <= 6 ? 44 : 46;
  const ry = n <= 6 ? 35 : 38;
  const angle = 90 - (360 * relativeIndex) / n;
  const x = 50 + rx * Math.cos((Math.PI / 180) * angle);
  const y = 50 + ry * Math.sin((Math.PI / 180) * angle);
  const frontScale = y > 68 ? 1.02 : y < 30 ? 0.86 : 0.94;
  return { x, y, scale: frontScale, zone: y > 70 ? 'near' : y < 35 ? 'far' : 'side' };
}

function roleTextForPlayer(room, playerIndex, n) {
  if (playerIndex === room.dealerIndex) return 'Dealer';
  if (playerIndex === (room.dealerIndex + 1) % n) return 'First Turn';
  return 'Player';
}

function TableSeatCards({ player, isMe, revealAllowed }) {
  const count = Math.max(player.cardCount || 0, player.cards?.length || 0);
  if (!count) return null;
  const backStatus = player.folded || String(player.status || '').toLowerCase().includes('drop')
    ? 'dropped'
    : player.sawCards
      ? 'open'
      : 'blind';

  return (
    <div className={`table-seat-cards ${isMe ? 'my-table-cards' : 'opponent-table-cards'} player-cards-${backStatus}`}>
      {Array.from({ length: count }).map((_, i) => {
        const card = player.cards?.[i];
        const hidden = !revealAllowed || player.cardsHidden || !card;
        const rotation = (i - (count - 1) / 2) * (isMe ? 5 : 3);
        return (
          <div key={i} className="table-card-wrap" style={{ transform: `rotate(${rotation}deg)` }}>
            <PlayingCard card={card} hidden={hidden} backStatus={backStatus} />
          </div>
        );
      })}
    </div>
  );
}

function PlayerTableSeat({ player, playerIndex, relativeIndex, n, room, playerId, actions }) {
  const pick = room.placeCut?.picks?.find((p) => p.playerId === player.id);
  const showSeatNumbers = room.status === 'chooseSeat';
  const canChooseSeat = room.status === 'chooseSeat' && room.placeCut?.highestPlayerId === playerId;
  const roleText = roleTextForPlayer(room, playerIndex, n);
  const pos = getPerspectivePosition(relativeIndex, n);
  const isMe = player.id === playerId;
  const isCurrentTurn = room.players[room.turnIndex]?.id === player.id;
  const showTableCards = ['betting', 'roundOver', 'cycleBreak', 'sessionEnded'].includes(room.status);
  const revealAllowed = isMe || ['roundOver', 'cycleBreak', 'sessionEnded'].includes(room.status) || !player.cardsHidden;

  return (
    <button
      type="button"
      disabled={!canChooseSeat}
      onClick={() => actions.chooseSeat(playerIndex)}
      className={`seat avatar-seat perspective-seat ${isMe ? 'my-seat' : ''} ${isCurrentTurn ? 'active-player-seat' : ''} ${playerIndex === room.dealerIndex ? 'dealer' : ''} ${canChooseSeat ? 'clickable-seat' : ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, '--seat-scale': pos.scale }}
    >
      {showSeatNumbers && <div className="seat-label">Seat {playerIndex + 1}</div>}
      <div className="avatar"><span className="avatar-head" /><span className="avatar-body" /></div>
      <b>{room.status === 'chooseSeat' ? 'Choose here' : player.name}</b>
      <small>{room.status === 'chooseSeat' ? 'Available seat' : roleText}</small>
      {showTableCards && <TableSeatCards player={player} isMe={isMe} revealAllowed={revealAllowed} />}
      {['placeCut', 'chooseSeat'].includes(room.status) && pick?.card && <div className="seat-pick"><PlayingCard card={pick.card} /></div>}
      {['placeCut', 'chooseSeat'].includes(room.status) && pick?.hasPicked && !pick?.card && <div className="seat-pick-mini">Picked</div>}
    </button>
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
  return <div className="cash-award-fly" style={{ '--cash-to-x': `${pos.x - 50}%`, '--cash-to-y': `${pos.y - 50}%` }}>💵</div>;
}

function SeatTable({ room, playerId, actions, cutPercent, setCutPercent, oneCardMode, setOneCardMode }) {
  if (!['placeCut', 'chooseSeat', 'chooseOneCardMode', 'betting', 'roundOver', 'cycleBreak', 'sessionEnded'].includes(room.status)) return null;
  const n = room.players.length;
  const dealer = room.players[room.dealerIndex];
  const permissions = getPermissions(room, playerId);
  const myIndex = Math.max(0, room.players.findIndex((p) => p.id === playerId));
  const perspectivePlayers = room.players.map((player, playerIndex) => ({
    player,
    playerIndex,
    relativeIndex: (playerIndex - myIndex + n) % n,
  }));

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
          {['betting', 'roundOver', 'cycleBreak', 'sessionEnded'].includes(room.status) && <PotOnTable pot={room.pot} />}
          <TimedCenterPopup announcement={room.oneCardModeAnnouncement} />
          <TimedCenterPopup announcement={room.wellCutAnnouncement} className="one-card-popup well-cut-popup" />
          <TimedCenterPopup announcement={room.winnerAnnouncement} className="one-card-popup winner-pop-popup" />
        </div>
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
  const { connected, room, roomCode, playerId, error, createRoom, joinRoom } = danka;

  function resetEntry() {
    setEntryMode('choose');
    setJoinCode('');
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
