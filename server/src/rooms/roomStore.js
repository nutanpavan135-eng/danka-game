const fs = require("fs");
const path = require("path");

const STORE_PATH = process.env.DANKA_ROOM_STORE || path.join("/tmp", "danka-rooms.json");
const STORE_KEY = process.env.DANKA_ROOM_STORE_KEY || "danka:rooms:v1";
const REDIS_REST_URL = process.env.DANKA_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_REST_TOKEN = process.env.DANKA_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const STORE_TTL_SECONDS = Number(process.env.DANKA_ROOM_STORE_TTL_SECONDS || 86400);

const rooms = new Map();

function hasRedisStore() {
  return Boolean(REDIS_REST_URL && REDIS_REST_TOKEN);
}

function getStoreMode() {
  return hasRedisStore() ? "redis-rest-with-local-file-fallback" : "local-file-fallback";
}

function serializeRooms() {
  return JSON.stringify([...rooms.entries()]);
}

function hydrateRooms(serializedRooms) {
  if (!serializedRooms) return 0;
  const data = typeof serializedRooms === "string" ? JSON.parse(serializedRooms) : serializedRooms;
  if (!Array.isArray(data)) return 0;
  rooms.clear();
  for (const [code, room] of data) rooms.set(code, room);
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

function saveRooms() {
  const payload = serializeRooms();

  // Always keep a local fallback copy for same-instance restarts.
  saveRoomsToFile(payload);

  // If Redis/Key Value credentials are configured, also persist there.
  if (hasRedisStore()) {
    const command = Number.isFinite(STORE_TTL_SECONDS) && STORE_TTL_SECONDS > 0
      ? ["SET", STORE_KEY, payload, "EX", String(Math.floor(STORE_TTL_SECONDS))]
      : ["SET", STORE_KEY, payload];

    redisCommand(command).catch((err) => {
      console.warn("Unable to save Danka Redis room store:", err.message);
    });
  }
}

async function loadRooms() {
  if (hasRedisStore()) {
    try {
      const result = await redisCommand(["GET", STORE_KEY]);
      if (result?.result) {
        const count = hydrateRooms(result.result);
        console.log(`Loaded ${count} Danka room(s) from Redis room store.`);
        return count;
      }
      console.log("Redis room store is configured but no active Danka rooms were found.");
    } catch (err) {
      console.warn("Unable to load Danka Redis room store. Falling back to local file:", err.message);
    }
  }

  return loadRoomsFromFile();
}

function deleteRoom(roomCode) {
  rooms.delete(roomCode);
  saveRooms();
}

module.exports = {
  rooms,
  saveRooms,
  loadRooms,
  deleteRoom,
  getStoreMode,
};
