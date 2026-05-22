const fs = require("fs");
const path = require("path");

const STORE_PATH = process.env.DANKA_ROOM_STORE || path.join("/tmp", "danka-rooms.json");
const STORE_PREFIX = process.env.DANKA_ROOM_STORE_PREFIX || "danka:rooms:v2";
const STORE_INDEX_KEY = `${STORE_PREFIX}:index`;
const REDIS_REST_URL = process.env.DANKA_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_REST_TOKEN = process.env.DANKA_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const STORE_TTL_SECONDS = Number(process.env.DANKA_ROOM_STORE_TTL_SECONDS || 86400);

const rooms = new Map();

function hasRedisStore() {
  return Boolean(REDIS_REST_URL && REDIS_REST_TOKEN);
}

function getStoreMode() {
  return hasRedisStore() ? "redis-key-value-with-local-file-fallback" : "local-file-fallback";
}

function getStoreDetails() {
  return {
    mode: getStoreMode(),
    redisConfigured: hasRedisStore(),
    redisKeyPrefix: STORE_PREFIX,
    ttlSeconds: Number.isFinite(STORE_TTL_SECONDS) && STORE_TTL_SECONDS > 0 ? Math.floor(STORE_TTL_SECONDS) : null,
    localFallbackPath: STORE_PATH,
  };
}

function roomKey(roomCode) {
  return `${STORE_PREFIX}:room:${String(roomCode || "").trim()}`;
}

function serializeRooms() {
  return JSON.stringify([...rooms.entries()]);
}

function hydrateRooms(serializedRooms) {
  if (!serializedRooms) return 0;
  const data = typeof serializedRooms === "string" ? JSON.parse(serializedRooms) : serializedRooms;
  if (!Array.isArray(data)) return 0;
  rooms.clear();
  for (const [code, room] of data) {
    if (code && room) rooms.set(code, room);
  }
  return rooms.size;
}

async function redisCommand(command) {
  if (!hasRedisStore()) return null;
  const response = await fetch(REDIS_REST_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Redis REST ${response.status}: ${text || response.statusText}`);
  }

  return response.json();
}

function saveRoomsToFile(payload) {
  try {
    fs.writeFileSync(STORE_PATH, payload, "utf8");
  } catch (err) {
    console.warn("Unable to save Danka local room store:", err.message);
  }
}

function loadRoomsFromFile() {
  try {
    if (!fs.existsSync(STORE_PATH)) return 0;
    const count = hydrateRooms(fs.readFileSync(STORE_PATH, "utf8"));
    if (count) console.log(`Loaded ${count} Danka room(s) from local file store.`);
    return count;
  } catch (err) {
    console.warn("Unable to load Danka local room store:", err.message);
    return 0;
  }
}

async function saveRoomsToRedis() {
  if (!hasRedisStore()) return;

  const ttlEnabled = Number.isFinite(STORE_TTL_SECONDS) && STORE_TTL_SECONDS > 0;
  const ttl = String(Math.floor(STORE_TTL_SECONDS));
  const activeCodes = [...rooms.keys()];

  if (activeCodes.length > 0) {
    await redisCommand(["SADD", STORE_INDEX_KEY, ...activeCodes]);
  }

  await Promise.all(activeCodes.map((code) => {
    const payload = JSON.stringify(rooms.get(code));
    const command = ttlEnabled
      ? ["SET", roomKey(code), payload, "EX", ttl]
      : ["SET", roomKey(code), payload];
    return redisCommand(command);
  }));
}

function saveRooms() {
  const payload = serializeRooms();

  // Always keep a local fallback copy for same-instance restarts.
  saveRoomsToFile(payload);

  // Redis/Key Value is the professional persistent store when credentials are configured.
  if (hasRedisStore()) {
    saveRoomsToRedis().catch((err) => {
      console.warn("Unable to save Danka Redis room store:", err.message);
    });
  }
}

async function loadRoomsFromRedis() {
  if (!hasRedisStore()) return 0;

  const members = await redisCommand(["SMEMBERS", STORE_INDEX_KEY]);
  const codes = Array.isArray(members?.result) ? members.result : [];
  if (!codes.length) {
    console.log("Redis room store is configured but no active Danka rooms were found.");
    return 0;
  }

  rooms.clear();
  const staleCodes = [];

  for (const code of codes) {
    const result = await redisCommand(["GET", roomKey(code)]);
    if (!result?.result) {
      staleCodes.push(code);
      continue;
    }

    try {
      const room = JSON.parse(result.result);
      if (room?.roomCode) rooms.set(room.roomCode, room);
    } catch (err) {
      staleCodes.push(code);
      console.warn(`Unable to parse Redis room ${code}:`, err.message);
    }
  }

  if (staleCodes.length) {
    redisCommand(["SREM", STORE_INDEX_KEY, ...staleCodes]).catch(() => {});
  }

  console.log(`Loaded ${rooms.size} Danka room(s) from Redis Key Value store.`);
  return rooms.size;
}

async function loadRooms() {
  if (hasRedisStore()) {
    try {
      const count = await loadRoomsFromRedis();
      if (count > 0) return count;
    } catch (err) {
      console.warn("Unable to load Danka Redis room store. Falling back to local file:", err.message);
    }
  }

  return loadRoomsFromFile();
}

function deleteRoom(roomCode) {
  const safeRoomCode = String(roomCode || "").trim();
  rooms.delete(safeRoomCode);
  saveRooms();

  if (hasRedisStore() && safeRoomCode) {
    Promise.all([
      redisCommand(["DEL", roomKey(safeRoomCode)]),
      redisCommand(["SREM", STORE_INDEX_KEY, safeRoomCode]),
    ]).catch((err) => {
      console.warn("Unable to delete Danka room from Redis store:", err.message);
    });
  }
}

module.exports = {
  rooms,
  saveRooms,
  loadRooms,
  deleteRoom,
  getStoreMode,
  getStoreDetails,
};
