const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const loaded = new Map();

const load = (name) => {
  if (loaded.has(name)) return loaded.get(name);
  let data = { f: [] };
  try { data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), "utf8")); } catch (_) {}
  loaded.set(name, data);
  return data;
};

const countries = (detail) => load(detail === "high" ? "countries_50m" : "countries_110m").f;
const coast = () => load("coast_50m").f;
const lakes = () => load("lakes_50m").f;
const rivers = () => load("rivers_50m").f;
const states = () => load("states_50m").f;
const places = (detail) => load(detail === "high" ? "places_50m" : "places_110m").f;

const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

let placeIndex = null;
const buildPlaceIndex = () => {
  if (placeIndex) return placeIndex;
  const list = [];
  for (const p of places("high")) {
    list.push({ kind: "place", name: p.n, country: p.a, iso: p.i, pop: p.p || 0, capital: !!p.k, lat: p.la, lng: p.lo, key: fold(p.n) });
  }
  for (const c of countries("low")) {
    list.push({ kind: "country", name: c.n, country: "", iso: c.c, pop: Number.MAX_SAFE_INTEGER, capital: false, lat: c.ly, lng: c.lx, bbox: c.b, key: fold(c.n) });
  }
  for (const c of countries("high")) {
    if (list.some((e) => e.kind === "country" && e.key === fold(c.n))) continue;
    list.push({ kind: "country", name: c.n, country: "", iso: c.c, pop: Number.MAX_SAFE_INTEGER, capital: false, lat: c.ly, lng: c.lx, bbox: c.b, key: fold(c.n) });
  }
  placeIndex = list;
  return list;
};

const searchPlaces = (query, limit = 5) => {
  const q = fold(query);
  if (!q) return [];
  const index = buildPlaceIndex();
  const scored = [];
  for (const e of index) {
    let score = 0;
    if (e.key === q) score = 3;
    else if (e.key.startsWith(q)) score = 2;
    else if (e.key.includes(q)) score = 1;
    else if (e.iso && fold(e.iso) === q) score = 2;
    if (!score) continue;
    scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || b.e.pop - a.e.pop || a.e.key.localeCompare(b.e.key));
  return scored.slice(0, limit).map(({ e }) => ({ ...e, key: undefined }));
};

const toRad = (d) => d * Math.PI / 180;
const distanceKm = (lat1, lng1, lat2, lng2) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const nearestPlace = (lat, lng, maxKm = 300) => {
  if (typeof lat !== "number" || typeof lng !== "number" || !isFinite(lat) || !isFinite(lng)) return null;
  let best = null;
  for (const p of places("high")) {
    if (Math.abs(p.la - lat) > 4) continue;
    const d = distanceKm(lat, lng, p.la, p.lo);
    if (d > maxKm) continue;
    if (!best || d < best.km) best = { name: p.n, country: p.a, iso: p.i, km: Math.round(d), lat: p.la, lng: p.lo };
  }
  return best;
};

module.exports = { load, countries, coast, lakes, rivers, states, places, searchPlaces, nearestPlace, distanceKm, fold };
