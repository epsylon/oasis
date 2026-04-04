const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const BASE_MAP = path.join(__dirname, "..", "client", "assets", "images", "worldmap-z2.png");
const CACHE_DIR = path.join(__dirname, "cache");
const TILES_DIR = path.join(__dirname, "tiles");
const MAP_W = 1024;
const MAP_H = 1024;

const latLngToPx = (lat, lng) => {
  const latRad = lat * Math.PI / 180;
  const x = Math.round((lng + 180) / 360 * MAP_W);
  const y = Math.round((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * MAP_H);
  return { x: Math.max(12, Math.min(MAP_W - 12, x)), y: Math.max(12, Math.min(MAP_H - 12, y)) };
};

const pxToLatLng = (px, py) => {
  const lng = px / MAP_W * 360 - 180;
  const n = Math.PI - 2 * Math.PI * py / MAP_H;
  const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
};

const getMaxTileZoom = () => {
  try {
    const dirs = fs.readdirSync(TILES_DIR).filter(d => /^\d+$/.test(d) && fs.existsSync(path.join(TILES_DIR, d, '0_0.png')));
    return dirs.length ? Math.max(...dirs.map(Number)) : 0;
  } catch (_) { return 0; }
};

const getViewportBounds = (centerLat, centerLng, zoom) => {
  const effectiveZ = Math.min(zoom, getMaxTileZoom());
  const n = Math.pow(2, effectiveZ);
  const tileSize = 256;
  const worldPx = n * tileSize;
  const scale = Math.pow(2, zoom - effectiveZ);
  const vw = MAP_W / scale;
  const vh = MAP_H / scale;

  const latRad = centerLat * Math.PI / 180;
  const cx = (centerLng + 180) / 360 * worldPx;
  const cy = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * worldPx;

  const x0 = cx - vw / 2;
  const y0 = cy - vh / 2;
  const x1 = cx + vw / 2;
  const y1 = cy + vh / 2;

  const pxToLng = (px) => px / worldPx * 360 - 180;
  const pxToLat = (py) => { const nn = Math.PI - 2 * Math.PI * py / worldPx; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(nn) - Math.exp(-nn))); };

  return {
    latMin: Math.max(-85, pxToLat(Math.min(y1, worldPx - 1))),
    latMax: Math.min(85, pxToLat(Math.max(y0, 0))),
    lngMin: Math.max(-180, pxToLng(Math.max(x0, 0))),
    lngMax: Math.min(180, pxToLng(Math.min(x1, worldPx - 1)))
  };
};

const renderMapWithPins = (markers, mainIdx) => {
  const pins = (Array.isArray(markers) ? markers : [])
    .filter((m) => m && typeof m.lat === "number" && typeof m.lng === "number")
    .map((m, i) => ({ ...latLngToPx(m.lat, m.lng), main: i === (mainIdx || 0) }));

  const hash = crypto.createHash("md5")
    .update(pins.map((p) => `${p.x},${p.y},${p.main}`).join(";"))
    .digest("hex")
    .slice(0, 12);

  const outFile = path.join(CACHE_DIR, `map_${hash}.png`);

  if (fs.existsSync(outFile)) return `map_${hash}.png`;

  const script = `
from PIL import Image, ImageDraw
import sys, json

pins = json.loads(sys.argv[1])
im = Image.open(sys.argv[2]).copy()
draw = ImageDraw.Draw(im)

for p in pins:
    x, y, main = p['x'], p['y'], p.get('main', False)
    sw = 3 if main else 2
    sh = 18 if main else 13
    clr = '#e74c3c' if main else '#3498db'
    dark = '#c0392b' if main else '#2980b9'
    draw.polygon([(x, y + 2), (x - sw, y - sh + sw * 2), (x + sw, y - sh + sw * 2)], fill=clr)
    draw.ellipse([x - sw - 1, y - sh - sw, x + sw + 1, y - sh + sw], fill=dark, outline='white', width=1)

im.save(sys.argv[3], optimize=True)
`;

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    execFileSync("python3", [
      "-c", script,
      JSON.stringify(pins),
      BASE_MAP,
      outFile
    ], { timeout: 10000 });
  } catch (e) {
    return null;
  }

  return `map_${hash}.png`;
};

const renderZoomedMapWithPins = (centerLat, centerLng, zoom, markers, mainIdx) => {
  const maxZ = getMaxTileZoom();
  if (!maxZ || zoom <= 2) return renderMapWithPins(markers, mainIdx);

  const effectiveZ = Math.min(zoom, maxZ);
  const scale = Math.pow(2, zoom - effectiveZ);
  const n = Math.pow(2, effectiveZ);
  const tileSize = 256;
  const worldPx = n * tileSize;

  const latRad = centerLat * Math.PI / 180;
  const cx = (centerLng + 180) / 360 * worldPx;
  const cy = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * worldPx;

  const vw = MAP_W / scale;
  const vh = MAP_H / scale;
  const x0 = cx - vw / 2;
  const y0 = cy - vh / 2;

  const pinData = (Array.isArray(markers) ? markers : [])
    .filter((m) => m && typeof m.lat === "number" && typeof m.lng === "number")
    .map((m, i) => {
      const latR = m.lat * Math.PI / 180;
      const wx = (m.lng + 180) / 360 * worldPx;
      const wy = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * worldPx;
      return { px: (wx - x0) * scale, py: (wy - y0) * scale, main: i === (mainIdx || 0) };
    });

  const hashInput = `z${zoom}_${Math.round(centerLat * 100)}_${Math.round(centerLng * 100)}_` + pinData.map(p => `${Math.round(p.px)},${Math.round(p.py)},${p.main}`).join(";");
  const hash = crypto.createHash("md5").update(hashInput).digest("hex").slice(0, 12);
  const outFile = path.join(CACHE_DIR, `map_${hash}.png`);

  if (fs.existsSync(outFile)) return `map_${hash}.png`;

  const txMin = Math.max(0, Math.floor(x0 / tileSize));
  const txMax = Math.min(n - 1, Math.floor((x0 + vw) / tileSize));
  const tyMin = Math.max(0, Math.floor(y0 / tileSize));
  const tyMax = Math.min(n - 1, Math.floor((y0 + vh) / tileSize));

  const tiles = [];
  for (let tx = txMin; tx <= txMax; tx++) {
    for (let ty = tyMin; ty <= tyMax; ty++) {
      const tp = path.join(TILES_DIR, String(effectiveZ), `${tx}_${ty}.png`);
      tiles.push({ tx, ty, tp, exists: fs.existsSync(tp) });
    }
  }

  const script = `
from PIL import Image, ImageDraw
import sys, json, os

args = json.loads(sys.argv[1])
out_file = sys.argv[2]

tile_size = 256
tx_min = args['txMin']
ty_min = args['tyMin']
tx_max = args['txMax']
ty_max = args['tyMax']
x0 = args['x0']
y0 = args['y0']
vw = args['vw']
vh = args['vh']
scale = args['scale']
pins = args['pins']
tiles = args['tiles']

canvas_w = (tx_max - tx_min + 1) * tile_size
canvas_h = (ty_max - ty_min + 1) * tile_size
canvas = Image.new('RGB', (canvas_w, canvas_h), (170, 211, 223))

for t in tiles:
    if t['exists']:
        try:
            tile = Image.open(t['tp']).convert('RGB')
            canvas.paste(tile, ((t['tx'] - tx_min) * tile_size, (t['ty'] - ty_min) * tile_size))
        except:
            pass

crop_x = x0 - tx_min * tile_size
crop_y = y0 - ty_min * tile_size
cropped = canvas.crop((int(crop_x), int(crop_y), int(crop_x + vw), int(crop_y + vh)))
result = cropped.resize((1024, 1024), Image.LANCZOS)

draw = ImageDraw.Draw(result)
for p in pins:
    px, py, main = p['px'], p['py'], p.get('main', False)
    if -20 <= px <= 1044 and -20 <= py <= 1044:
        sw = 3 if main else 2
        sh = 18 if main else 13
        clr = '#e74c3c' if main else '#3498db'
        dark = '#c0392b' if main else '#2980b9'
        draw.polygon([(px, py + 2), (px - sw, py - sh + sw * 2), (px + sw, py - sh + sw * 2)], fill=clr)
        draw.ellipse([px - sw - 1, py - sh - sw, px + sw + 1, py - sh + sw], fill=dark, outline='white', width=1)

result.save(out_file, optimize=True)
`;

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    execFileSync("python3", [
      "-c", script,
      JSON.stringify({ txMin, tyMin, txMax, tyMax, x0, y0, vw, vh, scale, pins: pinData, tiles }),
      outFile
    ], { timeout: 15000 });
  } catch (e) {
    return renderMapWithPins(markers, mainIdx);
  }

  return `map_${hash}.png`;
};

module.exports = { renderMapWithPins, renderZoomedMapWithPins, getViewportBounds, getMaxTileZoom, latLngToPx, pxToLatLng, MAP_W, MAP_H };
