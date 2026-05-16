import { useMemo, useState } from 'react';
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
  const count = potChipCount(pot);
  return (
    <div className="real-pot" aria-label={`Pot ${pot} coins`}>
      <div className="pot-top">
        <div className="pot-bowl-shell" />
        <div className="chip-pile">
          {Array.from({ length: count }).map((_, index) => {
            const colors = ['chip-red', 'chip-blue', 'chip-green', 'chip-gold'];
            const x = ((index % 4) - 1.5) * 14 + (Math.floor(index / 4) % 2 ? 4 : -4);
            const y = (Math.floor(index / 4) - 1) * -8;
            return <span key={index} className={`table-chip ${colors[index % colors.length]}`} style={{ transform: `translate(${x}px, ${y}px) rotate(${index * 13}deg)` }} />;
          })}
        </div>
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
          <p className="muted">Winner cards are highlighted. Cards stay visible until the next cut/deal.</p>
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
  } else if (room.status === 'cutDeck') {
    text = permissions.canCutDeck
      ? 'Your turn: cut the deck. After you cut, the dealer will deal automatically.'
      : `Waiting for ${permissions.cutterName || 'the cutter'} to cut the deck.`;
  } else if (room.status === 'betting') {
    if (current?.id === playerId) {
      if (permissions.canSeeCards && permissions.canBlindBet && permissions.canCut) text = 'Your turn: you may See Cards, Blind Bet, or use Cut.';
      else if (permissions.canSeeCards && permissions.canBlindBet) text = 'Your turn: you may See Cards or Blind Bet.';
      else if (permissions.canOpenBet) text = 'Your turn: place an Open Bet, or use another valid action.';
      else if (permissions.canDrop && permissions.canShow) text = 'Your turn: choose Drop or Show.';
      else if (permissions.canDrop && permissions.canSide) text = 'Your turn: choose Drop or Ask Side.';
      else text = 'Your turn: take your next action.';
    } else {
      text = `Waiting for ${current?.name || 'the current player'} to take an action.`;
    }
  } else if (room.status === 'cycleBreak') {
    text = 'Cycle complete. Eligible players can request Place Cut, leave at round break, or continue with the same players.';
  } else if (room.status === 'roundOver') {
    text = 'Round complete. Review the result on the right.';
  }

  if (!text) return null;
  return <div className="table-action-banner">{text}</div>;
}


function PlayerTableSeat({ player, index, n, room, playerId, actions }) {
  const pick = room.placeCut?.picks?.find((p) => p.playerId === player.id);
  const showSeatNumbers = room.status === 'chooseSeat';
  const canChooseSeat = room.status === 'chooseSeat' && room.placeCut?.highestPlayerId === playerId;
  const roleText = index === room.dealerIndex
    ? 'Dealer'
    : index === (room.dealerIndex + 1) % n
      ? 'Cutter'
      : index === (room.dealerIndex + n - 1) % n
        ? 'First Turn'
        : 'Player';

  // Midpoint angles place players on the table sides, not the sharp polygon corners.
  const angle = -90 + (180 / n) + (360 * index) / n;
  const radius = n <= 4 ? 41 : n <= 6 ? 38 : 40;
  const x = 50 + radius * Math.cos((Math.PI / 180) * angle);
  const y = 50 + radius * Math.sin((Math.PI / 180) * angle);

  return (
    <button
      type="button"
      disabled={!canChooseSeat}
      onClick={() => actions.chooseSeat(index)}
      className={`seat avatar-seat ${index === room.dealerIndex ? 'dealer' : ''} ${index === (room.dealerIndex + 1) % n ? 'cutter' : ''} ${canChooseSeat ? 'clickable-seat' : ''}`}
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {showSeatNumbers && <div className="seat-label">Seat {index + 1}</div>}
      <div className="avatar"><span className="avatar-head" /><span className="avatar-body" /></div>
      <b>{room.status === 'chooseSeat' ? 'Choose here' : player.name}</b>
      <small>{room.status === 'chooseSeat' ? 'Available seat' : roleText}</small>
      {pick?.card && <div className="seat-pick"><PlayingCard card={pick.card} /></div>}
      {pick?.hasPicked && !pick?.card && <div className="seat-pick-mini">Picked</div>}
    </button>
  );
}

function SeatTable({ room, playerId, actions }) {
  if (!['placeCut', 'chooseSeat', 'cutDeck', 'betting', 'roundOver', 'cycleBreak', 'sessionEnded'].includes(room.status)) return null;
  const n = room.players.length;
  const dealer = room.players[room.dealerIndex];
  const cutter = room.players[(room.dealerIndex + 1) % n];
  const permissions = getPermissions(room, playerId);

  return (
    <section className="seat-table-panel table-half-panel">
      <div className="between row wrap table-header-mini">
        <div>
          <h2>Danka Table</h2>
          <p className="muted">Dealer: <b>{dealer?.name || '-'}</b> • Cutter: <b>{cutter?.name || '-'}</b></p>
        </div>
        <p className="muted">{n}-player table</p>
      </div>

      <TableActionBanner room={room} playerId={playerId} permissions={permissions} />

      <div className="seats polygon-seats big-table-stage" style={{ '--player-count': n }}>
        <div className="table-center polygon-table real-table" style={{ clipPath: `polygon(${polygonPoints(n)})` }}>
          {['cutDeck', 'betting', 'roundOver', 'cycleBreak', 'sessionEnded'].includes(room.status) && <PotOnTable pot={room.pot} />}
        </div>

        <PlaceCutDeck room={room} playerId={playerId} actions={actions} />
        <PlaceCutRanking room={room} playerId={playerId} actions={actions} />

        {room.players.map((player, index) => (
          <PlayerTableSeat key={player.id} player={player} index={index} n={n} room={room} playerId={playerId} actions={actions} />
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [name, setName] = useState('Nutan');
  const [joinCode, setJoinCode] = useState('');
  const [startingCoins, setStartingCoins] = useState(100);
  const [cutPercent, setCutPercent] = useState(50);
  const [oneCardMode, setOneCardMode] = useState('highest');
  const danka = useDankaRoom();
  const { connected, room, roomCode, playerId, error, createRoom, joinRoom } = danka;

  if (!room) {
    return (
      <main className="page home">
        <section className="hero">
          <h1>DANKA</h1>
          <p>Prototype 3.9 — seat direction fix, clearer results, action banner, and improved pot chips.</p>
          <p className={connected ? 'ok' : 'bad'}>{connected ? 'Backend connected' : 'Backend not connected'}</p>
        </section>
        <section className="panel form">
          <label>Your Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <label>Starting Coins</label>
          <input type="number" value={startingCoins} onChange={(e) => setStartingCoins(Number(e.target.value))} />
          <button onClick={() => createRoom({ playerName: name, startingCoins })}>Create Room</button>
          <hr />
          <label>Room Code</label>
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
          <button onClick={() => joinRoom({ roomCode: joinCode, playerName: name })}>Join Room</button>
          {error && <p className="error">{error}</p>}
        </section>
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
          {permissions.canEndSession && <button className="danger" onClick={danka.endSession}>End Session</button>}
        </div>
      </header>

      {error && <p className="error">{error}</p>}
      <p className="notice compact-notice">{room.lastActionMessage}</p>

      <section className="game-split game-split-38">
        <div className="table-half">
          <SeatTable room={room} playerId={playerId} actions={danka} />
        </div>

        <div className="control-half">
          <CycleResultPanel room={room} />
          <section className="action-panel">
            <div className="control-head">
              <div>
                <h2>Controls</h2>
                <p className="muted">Only valid actions are shown here.</p>
              </div>
              <div className="mini-pot">{room.status}</div>
            </div>
            <ActionButtons
              room={room}
              playerId={playerId}
              actions={danka}
              cutPercent={cutPercent}
              setCutPercent={setCutPercent}
              oneCardMode={oneCardMode}
              setOneCardMode={setOneCardMode}
            />
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
