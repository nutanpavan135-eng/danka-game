const fs = require("fs");
const path = require("path");

const STORE_PATH = process.env.DANKA_ROOM_STORE || path.join("/tmp", "danka-rooms.json");
const rooms = new Map();

function serializeRooms() {
  return JSON.stringify([...rooms.entries()], null, 2);
}

function saveRooms() {
  try {
    fs.writeFileSync(STORE_PATH, serializeRooms(), "utf8");
  } catch (err) {
    console.warn("Unable to save Danka room store:", err.message);
  }
}

function loadRooms() {
  try {
    if (!fs.existsSync(STORE_PATH)) return;
    const data = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    rooms.clear();
    for (const [code, room] of data) rooms.set(code, room);
    console.log(`Loaded ${rooms.size} Danka room(s) from store.`);
  } catch (err) {
    console.warn("Unable to load Danka room store:", err.message);
  }
}

module.exports = { rooms, saveRooms, loadRooms };
