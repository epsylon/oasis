const fs = require("fs");
const path = require("path");

const STORAGE_DIR = path.join(__dirname, "..", "configs");
const ADDR_PATH = path.join(STORAGE_DIR, "wallet-addresses.json");

function ensure() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  if (!fs.existsSync(ADDR_PATH)) fs.writeFileSync(ADDR_PATH, "{}");
}
function readAll() { ensure(); return JSON.parse(fs.readFileSync(ADDR_PATH, "utf8")); }
function writeAll(m) { fs.writeFileSync(ADDR_PATH, JSON.stringify(m, null, 2)); }

async function getAddress(userId) { const m = readAll(); return m[userId] || null; }
async function setAddress(userId, address) { const m = readAll(); m[userId] = address; writeAll(m); return true; }

module.exports = { getAddress, setAddress };
