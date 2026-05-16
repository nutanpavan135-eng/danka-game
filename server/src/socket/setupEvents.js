const { rooms } = require("../rooms/roomStore");
const { broadcastPrivateRoomState } = require("../rooms/roomState");
const { createDeck, shuffleDeck, cardsPerPlayer, compareCardsForPlaceCut } = require("../gameLogic/cards");

function buildSeatsFromChoice(room, chosenSeatIndex) {
  const order = room.placeCutOrder || [];
  const n = room.players.length;
  const seats = new Array(n);

  // Highest card holder sits in chosen seat. Remaining players sit in descending
  // order anti-clockwise around the table. This matches the requested Danka layout:
  // second-highest on the dealer's right, and the lowest card on the dealer's left.
  order.forEach((pick, rankIndex) => {
    const seatIndex = (chosenSeatIndex - rankIndex + n) % n;
    const player = room.players.find((p) => p.id === pick.playerId);
    if (player) seats[seatIndex] = player;
  });

  return seats.filter(Boolean).map((p, index) => ({ ...p, seat: `Seat ${index + 1}` }));
}

function registerSetupEvents(io, socket) {
  socket.on("pickPlaceCutCard", ({ roomCode, deckIndex }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found." });
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
  socket.on("runPlaceCut", ({ roomCode }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found." });
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

  socket.on("chooseSeat", ({ roomCode, seatIndex }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found." });
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
          : index === (chosen + n - 1) % n
          ? "Right of Dealer / First Turn"
          : index === (chosen + 1) % n
          ? "Left of Dealer / Cutter"
          : "Player",
    }));

    room.dealerIndex = chosen;
    room.turnIndex = (chosen + n - 1) % n;
    room.chosenSeatIndex = chosen;
    room.status = "cutDeck";
    room.deck = shuffleDeck(createDeck());
    const dealer = room.players[room.dealerIndex];
    const cutter = room.players[(room.dealerIndex + 1) % n];
    room.lastActionMessage = `${dealer.name} chose Seat ${chosen + 1} and becomes dealer. ${cutter.name} must cut the deck.`;

    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });

  socket.on("cutDeckAndDeal", ({ roomCode, cutPercent, cutNumber, oneCardMode }, callback) => {
    const room = rooms.get(String(roomCode || "").trim());
    if (!room) return callback?.({ success: false, error: "Room not found." });
    if (room.status !== "cutDeck") return callback?.({ success: false, error: "Deck cut is not available now." });
    room.lastCycleReveal = null;
    room.winnerHand = null;
    room.sideReveal = null;
    const cutterIndex = (room.dealerIndex + 1) % room.players.length;
    const cutter = room.players[cutterIndex];
    if (socket.id !== cutter.socketId) return callback?.({ success: false, error: `Only ${cutter.name} can cut the deck.` });
    // The cutter does not type an exact card number. They move a hidden-percentage slider.
    // Backend converts the slider position into a card count. This prevents easy Perfect Cut calculation.
    const rawPercent = cutPercent !== undefined ? Number(cutPercent) : Number(cutNumber);
    const safePercent = Math.max(1, Math.min(Number.isFinite(rawPercent) ? rawPercent : 50, 99));
    const safeCut = Math.max(1, Math.min(Math.round((safePercent / 100) * 52), 51));
    const shuffled = shuffleDeck(createDeck());
    const dealerHandDeck = shuffled.slice(safeCut);
    const cutCards = shuffled.slice(0, safeCut);
    const dealingDeck = [...dealerHandDeck, ...cutCards];
    const requiredCards = room.players.length * cardsPerPlayer(room.roundType);
    const isPerfectCut = dealerHandDeck.length === requiredCards;
    room.players = room.players.map((p) => ({ ...p, cards: [], sawCards: false, folded: false, status: "Blind" }));
    if (room.roundType === "one" && oneCardMode) room.oneCardMode = oneCardMode === "lowest" ? "lowest" : "highest";
    let pointer = 0;
    for (let round = 0; round < cardsPerPlayer(room.roundType); round++) {
      for (let offset = 1; offset <= room.players.length; offset++) {
        const playerIndex = (room.dealerIndex - offset + room.players.length) % room.players.length;
        room.players[playerIndex].cards.push(dealingDeck[pointer++]);
      }
    }
    room.players = room.players.map((p) => ({ ...p, coins: p.coins - 1 }));
    room.pot = room.players.length;
    room.deck = dealingDeck.slice(pointer);
    room.turnIndex = (room.dealerIndex + room.players.length - 1) % room.players.length;
    room.status = "betting";
    if (isPerfectCut && room.roundType === "three" && room.specialQueue.length === 0) {
      room.specialQueue = ["four", "three", "two", "one"];
      room.lastActionMessage = "Perfect Cut detected. Four special games will begin after this round.";
    } else if (isPerfectCut && room.specialQueue.length > 0) {
      room.lastActionMessage = "Perfect Cut happened during special games and was ignored.";
    } else {
      room.lastActionMessage = `${cutter.name} cut the deck. ${room.players[room.dealerIndex].name} deals automatically. ${room.players[room.turnIndex].name} starts betting.`;
    }
    callback?.({ success: true });
    broadcastPrivateRoomState(io, room);
  });
}
module.exports = { registerSetupEvents };
