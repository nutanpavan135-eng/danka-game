import { useEffect, useRef, useState } from 'react';
import { socket, connectSocket } from '../socket';

const SESSION_KEY = 'danka.prototype7.phase4.session';
const SESSION_STORAGE_KEY = 'danka.prototype7.phase4.tab-session';
const LEGACY_SESSION_KEYS = ['danka.prototype526.session'];
const RESYNC_INTERVAL_MS = 6000;
const DUPLICATE_TAB_CHANNEL = 'danka.prototype7.phase4.tab-guard';

function getSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getPersistentStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readSavedSession() {
  try {
    const session = getSessionStorage();
    const persistent = getPersistentStorage();
    const raw = session?.getItem(SESSION_STORAGE_KEY) || persistent?.getItem(SESSION_KEY);
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
    const data = JSON.stringify({
      roomCode: session.roomCode,
      playerId: session.playerId,
      playerName: session.playerName || '',
      savedAt: Date.now(),
    });
    getSessionStorage()?.setItem(SESSION_STORAGE_KEY, data);
    getPersistentStorage()?.setItem(SESSION_KEY, data);
  } catch {
    // Storage can fail in private mode; the game still works without refresh restore.
  }
}

function clearSavedSession() {
  try {
    const storage = getSessionStorage();
    const persistent = getPersistentStorage();
    storage?.removeItem(SESSION_STORAGE_KEY);
    storage?.removeItem(SESSION_KEY);
    persistent?.removeItem(SESSION_KEY);
    LEGACY_SESSION_KEYS.forEach((key) => storage?.removeItem(key));
    LEGACY_SESSION_KEYS.forEach((key) => persistent?.removeItem(key));
  } catch {}
}

export function useDankaRoom() {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [error, setError] = useState('');
  const [isRestoringSession, setIsRestoringSession] = useState(() => !!readSavedSession());
  const [syncStatus, setSyncStatus] = useState('');
  const reconnectingRef = useRef(false);
  const syncingRef = useRef(false);
  const roomCodeRef = useRef('');
  const playerIdRef = useRef('');
  const roomRef = useRef(null);

  useEffect(() => { roomCodeRef.current = roomCode; }, [roomCode]);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { roomRef.current = room; }, [room]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return undefined;
    const channel = new BroadcastChannel(DUPLICATE_TAB_CHANNEL);
    const tabInstanceId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const saved = readSavedSession();
    const announce = () => {
      const activeRoomCode = roomCodeRef.current || readSavedSession()?.roomCode;
      const activePlayerId = playerIdRef.current || readSavedSession()?.playerId;
      if (!activeRoomCode || !activePlayerId) return;
      channel.postMessage({ type: 'claim-session', tabInstanceId, roomCode: activeRoomCode, playerId: activePlayerId });
    };

    channel.onmessage = (event) => {
      const message = event.data || {};
      if (message.tabInstanceId === tabInstanceId) return;
      const activeRoomCode = roomCodeRef.current || readSavedSession()?.roomCode;
      const activePlayerId = playerIdRef.current || readSavedSession()?.playerId;
      if (!activeRoomCode || !activePlayerId) return;
      const sameSession = message.roomCode === activeRoomCode && message.playerId === activePlayerId;
      if (!sameSession) return;

      if (message.type === 'claim-session') {
        channel.postMessage({ type: 'session-already-open', tabInstanceId, roomCode: activeRoomCode, playerId: activePlayerId });
      }

      if (message.type === 'session-already-open' && saved?.roomCode === activeRoomCode && saved?.playerId === activePlayerId && !roomRef.current) {
        // A duplicated browser tab copies sessionStorage. Clear only this tab's session so it can be used as a fresh Join Room tab.
        getSessionStorage()?.removeItem(SESSION_STORAGE_KEY);
        setIsRestoringSession(false);
        setError('');
      }
    };

    window.setTimeout(announce, 350);
    return () => channel.close();
  }, []);

  function rememberSession(nextRoomCode, nextPlayerId, nextRoom = null) {
    if (!nextRoomCode || !nextPlayerId) return;
    const playerName = nextRoom?.players?.find((p) => p.id === nextPlayerId)?.name || '';
    saveSession({ roomCode: nextRoomCode, playerId: nextPlayerId, playerName });
  }

  function applyRoomSession(response, message = '') {
    setError('');
    setRoomCode(response.roomCode);
    setPlayerId(response.playerId);
    setRoom(response.room);
    rememberSession(response.roomCode, response.playerId, response.room);
    if (message) {
      setSyncStatus(message);
      window.setTimeout(() => setSyncStatus(''), 2200);
    }
  }

  function restoreSavedSession(options = {}) {
    const saved = readSavedSession();
    if (!saved?.roomCode || !saved?.playerId) {
      setIsRestoringSession(false);
      return;
    }
    if (reconnectingRef.current || !socket.connected) return;
    setIsRestoringSession(true);
    reconnectingRef.current = true;
    socket.emit('reconnectRoom', { roomCode: saved.roomCode, playerId: saved.playerId }, (response) => {
      reconnectingRef.current = false;
      setIsRestoringSession(false);
      if (!response?.success) {
        // A saved room can disappear after a backend restart or local test cleanup.
        // Do not show this as an error on the entry page; simply clear the stale restore data.
        setError('');
        clearSavedSession();
        return;
      }
      applyRoomSession(response, options.showMessage ? 'Reconnected and synced.' : '');
    });
  }

  function syncCurrentRoom(options = {}) {
    const saved = readSavedSession();
    const activeRoomCode = roomCodeRef.current || saved?.roomCode;
    const activePlayerId = playerIdRef.current || saved?.playerId;
    if (!activeRoomCode || !activePlayerId || !socket.connected || syncingRef.current || reconnectingRef.current) return;

    syncingRef.current = true;
    socket.emit('syncRoom', { roomCode: activeRoomCode, playerId: activePlayerId }, (response) => {
      syncingRef.current = false;
      if (!response?.success) {
        if (options.showErrors) setError(response?.error || 'Unable to sync the game room.');
        return;
      }
      applyRoomSession(response, options.showMessage ? 'Reconnected and synced.' : '');
    });
  }

  useEffect(() => {
    connectSocket();
    const onConnect = () => {
      setConnected(true);
      const hasActiveSession = !!(roomCodeRef.current || readSavedSession()?.roomCode);
      if (hasActiveSession && roomRef.current) syncCurrentRoom({ showMessage: true });
      else restoreSavedSession({ showMessage: true });
    };
    const onDisconnect = () => {
      setConnected(false);
      if (roomRef.current) setSyncStatus('Connection lost. Reconnecting...');
    };
    const onRoomUpdated = (updatedRoom) => { setError(''); setRoom(updatedRoom); };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('roomUpdated', onRoomUpdated);
    if (socket.connected) onConnect();

    const onFocus = () => syncCurrentRoom({ showMessage: false });
    const onVisibilityChange = () => {
      if (!document.hidden) syncCurrentRoom({ showMessage: false });
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    const intervalId = window.setInterval(() => {
      if (!document.hidden && (roomRef.current || readSavedSession())) syncCurrentRoom({ showMessage: false });
    }, RESYNC_INTERVAL_MS);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('roomUpdated', onRoomUpdated);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(intervalId);
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
    setSyncStatus('');
    setRoom(null);
    setRoomCode('');
    setPlayerId('');
    clearSavedSession();
  }

  function leaveRoomToHome() {
    const activeRoomCode = roomCodeRef.current || roomCode;
    const activePlayerId = playerIdRef.current || playerId;
    setError('');
    setSyncStatus('');

    function goHome() {
      setIsRestoringSession(false);
      setRoom(null);
      setRoomCode('');
      setPlayerId('');
      clearSavedSession();
    }

    if (!activeRoomCode || !activePlayerId || !socket.connected) {
      goHome();
      return;
    }

    socket.emit('leaveRoom', { roomCode: activeRoomCode, playerId: activePlayerId }, (response) => {
      if (!response?.success) {
        setError(response?.error || 'Unable to leave the room.');
        return;
      }
      goHome();
    });
  }

  function pickPlaceCutCard(deckIndex = null) {
    setError('');
    socket.emit('pickPlaceCutCard', { roomCode, playerId, deckIndex }, (response) => {
      if (!response?.success) return setError(response?.error || 'Unable to pick Place Cut card.');
    });
  }

  return {
    connected, room, roomCode, playerId, error, isRestoringSession, syncStatus,
    createRoom, joinRoom, startNewGame, leaveRoomToHome,
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
    emergencyRemovePlayer: (targetPlayerId) => emitAction('emergencyRemovePlayer', { targetPlayerId }),
    startNextRound: () => emitAction('startNextRound'),
    chooseOneCardMode: (mode) => emitAction('chooseOneCardMode', { mode }),
    requestPlaceCut: () => emitAction('requestPlaceCut'),
    continueSamePlayers: () => emitAction('continueSamePlayers'),
    leaveGameAtCycleBreak: () => emitAction('leaveGameAtCycleBreak'),
    endSession: () => emitAction('endSession'),
  };
}
