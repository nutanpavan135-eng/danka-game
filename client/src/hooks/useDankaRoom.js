import { useEffect, useRef, useState } from 'react';
import { socket, connectSocket } from '../socket';

const SESSION_KEY = 'danka.prototype526.session';

function readSavedSession() {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.roomCode || !parsed?.playerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    if (!session?.roomCode || !session?.playerId) return;
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({
      roomCode: session.roomCode,
      playerId: session.playerId,
      playerName: session.playerName || '',
      savedAt: Date.now(),
    }));
  } catch {
    // Storage can fail in private mode; the game still works without refresh restore.
  }
}

function clearSavedSession() {
  try { window.localStorage.removeItem(SESSION_KEY); } catch {}
}

export function useDankaRoom() {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [error, setError] = useState('');
  const [isRestoringSession, setIsRestoringSession] = useState(() => !!readSavedSession());
  const reconnectingRef = useRef(false);

  function rememberSession(nextRoomCode, nextPlayerId, nextRoom = null) {
    if (!nextRoomCode || !nextPlayerId) return;
    const playerName = nextRoom?.players?.find((p) => p.id === nextPlayerId)?.name || '';
    saveSession({ roomCode: nextRoomCode, playerId: nextPlayerId, playerName });
  }

  function restoreSavedSession() {
    const saved = readSavedSession();
    if (!saved?.roomCode || !saved?.playerId) {
      setIsRestoringSession(false);
      return;
    }
    if (reconnectingRef.current) return;
    setIsRestoringSession(true);
    reconnectingRef.current = true;
    socket.emit('reconnectRoom', { roomCode: saved.roomCode, playerId: saved.playerId }, (response) => {
      reconnectingRef.current = false;
      setIsRestoringSession(false);
      if (!response?.success) {
        setError(response?.error || 'Saved game session could not be restored. Please rejoin the room.');
        clearSavedSession();
        return;
      }
      setError('');
      setRoomCode(response.roomCode);
      setPlayerId(response.playerId);
      setRoom(response.room);
      rememberSession(response.roomCode, response.playerId, response.room);
    });
  }

  useEffect(() => {
    connectSocket();
    const onConnect = () => {
      setConnected(true);
      restoreSavedSession();
    };
    const onDisconnect = () => setConnected(false);
    const onRoomUpdated = (updatedRoom) => { setError(''); setRoom(updatedRoom); };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('roomUpdated', onRoomUpdated);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('roomUpdated', onRoomUpdated);
    };
  }, []);

  function emitAction(event, payload = {}) {
    setError('');
    socket.emit(event, { roomCode, playerId, ...payload }, (response) => {
      if (!response?.success) setError(response?.error || `Unable to complete ${event}.`);
      if (response?.room) setRoom(response.room);
    });
  }

  function createRoom({ playerName, startingCoins, cyclesPerRound }) {
    setIsRestoringSession(false);
    setError('');
    socket.emit('createRoom', { playerName, startingCoins, cyclesPerRound }, (response) => {
      if (!response?.success) return setError(response?.error || 'Unable to create room.');
      setRoomCode(response.roomCode);
      setPlayerId(response.playerId);
      setRoom(response.room);
      rememberSession(response.roomCode, response.playerId, response.room);
    });
  }

  function joinRoom({ roomCode, playerName }) {
    setIsRestoringSession(false);
    setError('');
    socket.emit('joinRoom', { roomCode, playerName }, (response) => {
      if (!response?.success) return setError(response?.error || 'Unable to join room.');
      setRoomCode(response.roomCode);
      setPlayerId(response.playerId);
      setRoom(response.room);
      rememberSession(response.roomCode, response.playerId, response.room);
    });
  }

  function startNewGame() {
    setIsRestoringSession(false);
    setError('');
    setRoom(null);
    setRoomCode('');
    setPlayerId('');
    clearSavedSession();
  }

  function pickPlaceCutCard(deckIndex = null) {
    setError('');
    socket.emit('pickPlaceCutCard', { roomCode, playerId, deckIndex }, (response) => {
      if (!response?.success) return setError(response?.error || 'Unable to pick Place Cut card.');
    });
  }

  return {
    connected, room, roomCode, playerId, error, isRestoringSession,
    createRoom, joinRoom, startNewGame,
    startGame: () => emitAction('startGame'),
    pickPlaceCutCard,
    runPlaceCut: () => emitAction('runPlaceCut'),
    chooseSeat: (seatIndex) => emitAction('chooseSeat', { seatIndex }),
    cutDeckAndDeal: (cutPercent, oneCardMode) => emitAction('cutDeckAndDeal', { cutPercent, oneCardMode }),
    seeCards: () => emitAction('seeCards'),
    blindBet: () => emitAction('blindBet'),
    cut: () => emitAction('cut'),
    openBet: () => emitAction('openBet'),
    drop: () => emitAction('drop'),
    askShow: () => emitAction('askShow'),
    askSide: () => emitAction('askSide'),
    startNextRound: () => emitAction('startNextRound'),
    chooseOneCardMode: (mode) => emitAction('chooseOneCardMode', { mode }),
    requestPlaceCut: () => emitAction('requestPlaceCut'),
    continueSamePlayers: () => emitAction('continueSamePlayers'),
    leaveGameAtCycleBreak: () => emitAction('leaveGameAtCycleBreak'),
    endSession: () => emitAction('endSession'),
  };
}
