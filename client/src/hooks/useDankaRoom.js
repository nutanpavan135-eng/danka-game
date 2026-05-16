import { useEffect, useState } from 'react';
import { socket, connectSocket } from '../socket';

export function useDankaRoom() {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    connectSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onRoomUpdated = (updatedRoom) => setRoom(updatedRoom);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('roomUpdated', onRoomUpdated);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('roomUpdated', onRoomUpdated);
    };
  }, []);

  function emitAction(event, payload = {}) {
    setError('');
    socket.emit(event, { roomCode, ...payload }, (response) => {
      if (!response?.success) setError(response?.error || `Unable to complete ${event}.`);
      if (response?.room) setRoom(response.room);
    });
  }

  function createRoom({ playerName, startingCoins }) {
    setError('');
    socket.emit('createRoom', { playerName, startingCoins }, (response) => {
      if (!response?.success) return setError(response?.error || 'Unable to create room.');
      setRoomCode(response.roomCode);
      setPlayerId(response.playerId);
      setRoom(response.room);
    });
  }

  function joinRoom({ roomCode, playerName }) {
    setError('');
    socket.emit('joinRoom', { roomCode, playerName }, (response) => {
      if (!response?.success) return setError(response?.error || 'Unable to join room.');
      setRoomCode(response.roomCode);
      setPlayerId(response.playerId);
      setRoom(response.room);
    });
  }

  function pickPlaceCutCard(deckIndex = null) {
    setError('');
    socket.emit('pickPlaceCutCard', { roomCode, deckIndex }, (response) => {
      if (!response?.success) return setError(response?.error || 'Unable to pick Place Cut card.');
    });
  }

  return {
    connected, room, roomCode, playerId, error,
    createRoom, joinRoom,
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
    requestPlaceCut: () => emitAction('requestPlaceCut'),
    continueSamePlayers: () => emitAction('continueSamePlayers'),
    leaveGameAtCycleBreak: () => emitAction('leaveGameAtCycleBreak'),
    endSession: () => emitAction('endSession'),
  };
}
