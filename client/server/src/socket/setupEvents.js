const { rooms } = require("../rooms/roomStore");
const { broadcastPrivateRoomState } = require("../rooms/roomState");
const { createDeck, shuffleDeck, cardsPerPlayer, compareCardsForPlaceCut } = require("../gameLogic/cards");
const { dealCardsDirectly } = require("../gameLogic/roundFlow");
const { attachSocketToPlayer } = require("../rooms/roomHelpers");

function buildSeatsFromChoice(room, chosenSeatIndex) {
  const order = room.placeCutOrder || [];
  const n = room.players.length;
  const seats = new Array(n);

  // Highest card holder sits in chosen seat. Remaining players sit in descending
  // order around the table so the second-highest sits on the dealer's right.
  order.forEach((pick, rankIndex) => {
    const seatIndex = (chosenSeatIndex + rankIndex) % n;
    const player = room.players.find((p) => p.id === pick.playerId);
    if (player) seats[seatIndex] = player;
  });

  return seats.filter(Boolean).map((p, index) => ({ ...p, seat: `Seat ${index + 1}` }));
}

function registerSetupEvents(io, socket) {
  socket.on("pickPlaceCutCard", ({ roomCode, deckIndex, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "placeCut") return callback?.({ success: false, error: "Place Cut picking is not available now." });

    const player = room.players.find((p) => p.socketId === socket.id);
    if (!player) return callback?.({ success: false, error: "Player not found in room." });
    if (room.placeCutPicks?.some((p) => p.playerId === player.id)) {
      return callback?.({ success: false, error: "You already picked your Place Cut card." });
    }

    if (!room.placeCutDeck || room.placeCutDeck.length < room.players.length) {
      room.placeCutDeck = shuffleDeck(createDeck());
    }

    const rawIndex = Number(deckIndex);
    const selectedIndex = Number.isFinite(rawIndex) ? Math.max(0, Math.min(rawIndex, room.placeCutDeck.length - 1)) : 0;
    const [card] = room.placeCutDeck.splice(selectedIndex, 1);
    room.placeCutPicks.push({ playerId: player.id, playerName: player.name, card });
    player.status = "Picked Place Cut";
    room.lastActionMessage = `${player.name} picked a Place Cut card. Waiting for others.`;

    if (room.placeCutPicks.length === room.players.length) {
      const ordered = [...room.placeCutPicks].sort((a, b) => compareCardsForPlaceCut(a.card, b.card));
      room.placeCutOrder = ordered;
      room.status = "chooseSeat";
      room.seatCount = room.players.length;
      room.chosenSeatIndex = null;
      room.lastActionMessage = `All Place Cut cards are revealed. ${ordered[0].playerName} picked the highest card and must choose a seat.`;
    }

    callback?.({ success: true, card });
    broadcastPrivateRoomState(io, room);
  });

  // Backward-compatible admin shortcut for testing only: auto-pick for all players.
  socket.on("runPlaceCut", ({ roomCode, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "placeCut") return callback?.({ success: false, error: "Place Cut is not available now." });
    if (socket.id !== room.adminPlayerId) return callback?.({ success: false, error: "Only admin can auto-run Place Cut." });

    const deck = shuffleDeck(createDeck());
    room.placeCutPicks = room.players.map((player, index) => ({ playerId: player.id, playerName: player.name, card: deck[index] }));
    room.placeCutOrder = [...room.placeCutPicks].sort((a, b) => compareCardsForPlaceCut(a.card, b.card));
    room.players = room.players.map((p) => ({ ...p, status: "Picked Place Cut" }));
    room.status = "chooseSeat";
    room.seatCount = room.players.length;
    room.chosenSeatIndex = null;
    room.lastActionMessage = `Auto Place Cut complete. ${room.placeCutOrder[0].playerName} must choose a seat.`;
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("chooseSeat", ({ roomCode, seatIndex, playerId }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found. The server may have restarted and this room expired. Please create a new room." });
    attachSocketToPlayer(room, socket, playerId);
    if (room.status !== "chooseSeat") return callback?.({ success: false, error: "Seat choice is not available now." });

    const highestPick = room.placeCutOrder?.[0];
    if (!highestPick) return callback?.({ success: false, error: "Place Cut order is missing." });
    const chooser = room.players.find((p) => p.id === highestPick.playerId);
    if (!chooser || chooser.socketId !== socket.id) {
      return callback?.({ success: false, error: `Only ${highestPick.playerName} can choose the first seat.` });
    }

    const n = room.players.length;
    const chosen = Math.max(0, Math.min(Number(seatIndex) || 0, n - 1));
    const seatedPlayers = buildSeatsFromChoice(room, chosen);

    room.players = seatedPlayers.map((p, index) => ({
      ...p,
      status: "Place Cut Done",
      seat:
        index === chosen
          ? "Dealer"
          : index === (chosen + 1) % n
          ? "Right of Dealer / First Turn"
          : index === (chosen + n - 1) % n
          ? "Left of Dealer"
          : "Player",
    }));

    room.dealerIndex = chosen;
    room.turnIndex = (chosen + 1) % n;
    room.chosenSeatIndex = chosen;

    const dealer = room.players[room.dealerIndex];
    dealCardsDirectly(room, `${dealer.name} chose Seat ${chosen + 1} and becomes dealer.`);

    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  // Pre-game cutter flow has been removed from Danka online.
  // The system shuffles/deals fairly, so after Place Cut seat selection the dealer deals directly.
  socket.on("cutDeckAndDeal", ({ roomCode, playerId }, callback) => {
    return callback?.({ success: false, error: "Manual deck cut has been removed. Dealer now deals directly after Place Cut." });
  });
}
module.exports = { registerSetupEvents };
