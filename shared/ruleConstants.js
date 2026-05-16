const ROUND_TYPES = {
  FOUR: "four",
  THREE: "three",
  TWO: "two",
  ONE: "one",
};

const GAME_STATUS = {
  LOBBY: "lobby",
  PLACE_CUT: "placeCut",
  CUT_DECK: "cutDeck",
  BETTING: "betting",
  ROUND_OVER: "roundOver",
  CYCLE_BREAK: "cycleBreak",
  SESSION_ENDED: "sessionEnded",
};

const BETS = {
  ANTE: 1,
  BLIND: 1,
  OPEN: 2,
  SIDE: 2,
  SHOW: 2,
};

const LIMITS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 13,
};

module.exports = { ROUND_TYPES, GAME_STATUS, BETS, LIMITS };
