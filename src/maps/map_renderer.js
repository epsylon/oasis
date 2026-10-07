const data = require("./map_data");

const MAP_W = 1024;
const MAP_H = 640;
const TILE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 9;
const TILE_MAX_ZOOM = 6;
const TILE_PATH = "/maptiles";
const TILE_ENV = process.env.OASIS_MAP_TILES || "";
const CRISP_ZOOM = 9;
const MAX_LAT = 85.0511;
const GRID_COLS = 24;
const GRID_ROWS = 15;
const CLUSTER_PX = 28;
const EDGE = 6;
const POPUP_W = 320;
const POPUP_H = 400;
const POPUP_GAP = 10;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v) => { const n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : null; };
const r1 = (v) => Math.round(v * 10) / 10;
const r4 = (v) => Math.round(v * 10000) / 10000;
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const worldPx = (zoom) => TILE * Math.pow(2, zoom);

const project = (lat, lng, zoom) => {
  const w = worldPx(zoom);
  const la = clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI / 180;
  return {
    x: (lng + 180) / 360 * w,
    y: (1 - Math.log(Math.tan(Math.PI / 4 + la / 2)) / Math.PI) / 2 * w
  };
};

const unproject = (x, y, zoom) => {
  const w = worldPx(zoom);
  const n = Math.PI - 2 * Math.PI * y / w;
  return { lat: 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lng: x / w * 360 - 180 };
};

const latLngToPx = (lat, lng) => {
  const p = project(lat, lng, MIN_ZOOM);
  return { x: Math.round(p.x), y: Math.round(p.y) };
};

const pxToLatLng = (px, py) => {
  const p = unproject(px, py, MIN_ZOOM);
  return { lat: Math.round(p.lat * 100) / 100, lng: Math.round(p.lng * 100) / 100 };
};

const normalizeZoom = (z) => clamp(Math.round(num(z) == null ? MIN_ZOOM : num(z)), MIN_ZOOM, MAX_ZOOM);

const makeView = (centerLat, centerLng, zoom) => {
  const z = normalizeZoom(zoom);
  const w = worldPx(z);
  const c = project(num(centerLat) == null ? 0 : num(centerLat), num(centerLng) == null ? 0 : num(centerLng), z);
  const cx = w <= MAP_W ? w / 2 : clamp(c.x, MAP_W / 2, w - MAP_W / 2);
  const cy = w <= MAP_H ? w / 2 : clamp(c.y, MAP_H / 2, w - MAP_H / 2);
  const center = unproject(cx, cy, z);
  return { zoom: z, lat: r4(center.lat), lng: r4(center.lng), x0: cx - MAP_W / 2, y0: cy - MAP_H / 2, world: w };
};

const toScreen = (view, lat, lng) => {
  const p = project(lat, lng, view.zoom);
  return { x: p.x - view.x0, y: p.y - view.y0 };
};

const fromScreen = (view, x, y) => {
  const p = unproject(view.x0 + x, view.y0 + y, view.zoom);
  return { lat: r4(clamp(p.lat, -MAX_LAT, MAX_LAT)), lng: r4(clamp(p.lng, -180, 180)) };
};

const getViewportBounds = (centerLat, centerLng, zoom) => {
  const view = makeView(centerLat, centerLng, zoom);
  const nw = fromScreen(view, 0, 0);
  const se = fromScreen(view, MAP_W, MAP_H);
  return { latMin: se.lat, latMax: nw.lat, lngMin: nw.lng, lngMax: se.lng };
};

const fitView = (points, opts = {}) => {
  const pts = (Array.isArray(points) ? points : []).filter((p) => p && num(p.lat) != null && num(p.lng) != null);
  const single = normalizeZoom(opts.singleZoom || 8);
  if (!pts.length) return { zoom: MIN_ZOOM, lat: 10, lng: 0 };
  if (pts.length === 1) return { zoom: single, lat: num(pts[0].lat), lng: num(pts[0].lng) };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    const q = project(num(p.lat), num(p.lng), 0);
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
  }
  const pad = opts.pad == null ? 70 : opts.pad;
  const dx = Math.max(x1 - x0, 1e-6);
  const dy = Math.max(y1 - y0, 1e-6);
  const z = Math.floor(Math.log2(Math.min((MAP_W - 2 * pad) / dx, (MAP_H - 2 * pad) / dy)));
  const c = unproject((x0 + x1) / 2, (y0 + y1) / 2, 0);
  return { zoom: clamp(z, MIN_ZOOM, Math.min(MAX_ZOOM, opts.maxZoom || MAX_ZOOM)), lat: r4(c.lat), lng: r4(c.lng) };
};

const parseView = (raw) => {
  const s = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  const m = /^\s*(\d{1,2})\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)\s*$/.exec(String(s || ""));
  if (!m) return null;
  return { zoom: normalizeZoom(m[1]), lat: clamp(parseFloat(m[2]), -MAX_LAT, MAX_LAT), lng: clamp(parseFloat(m[3]), -180, 180) };
};

const viewParam = (v) => `${normalizeZoom(v.zoom)}/${r4(v.lat)}/${r4(v.lng)}`;

const parsePick = (raw) => {
  const s = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  const m = /^\s*(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\s*$/.exec(String(s || ""));
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: r4(lat), lng: r4(lng) };
};

const resolveView = (params = {}, pins = [], opts = {}) => {
  const explicit = parseView(params.view);
  if (explicit) return makeView(explicit.lat, explicit.lng, explicit.zoom);
  const clat = num(Array.isArray(params.clat) ? params.clat[0] : params.clat);
  const clng = num(Array.isArray(params.clng) ? params.clng[0] : params.clng);
  const zoomParam = num(Array.isArray(params.zoom) ? params.zoom[0] : params.zoom);
  if (clat != null && clng != null) return makeView(clat, clng, zoomParam == null ? (opts.singleZoom || 8) : zoomParam);
  const fit = fitView(pins, opts);
  if (zoomParam != null && zoomParam >= MIN_ZOOM) return makeView(opts.focusLat != null ? opts.focusLat : fit.lat, opts.focusLng != null ? opts.focusLng : fit.lng, zoomParam);
  return makeView(fit.lat, fit.lng, fit.zoom);
};

const metersPerPx = (view) => 156543.03392 * Math.cos(view.lat * Math.PI / 180) / Math.pow(2, view.zoom);

const bboxHit = (b, vb) => b[0] <= vb[2] && b[2] >= vb[0] && b[1] <= vb[3] && b[3] >= vb[1];

const clipPolygon = (pts, x0, y0, x1, y1) => {
  let out = pts;
  const passes = [
    (p) => p.x >= x0, (p, q) => ({ x: x0, y: p.y + (q.y - p.y) * (x0 - p.x) / (q.x - p.x) }),
    (p) => p.x <= x1, (p, q) => ({ x: x1, y: p.y + (q.y - p.y) * (x1 - p.x) / (q.x - p.x) }),
    (p) => p.y >= y0, (p, q) => ({ x: p.x + (q.x - p.x) * (y0 - p.y) / (q.y - p.y), y: y0 }),
    (p) => p.y <= y1, (p, q) => ({ x: p.x + (q.x - p.x) * (y1 - p.y) / (q.y - p.y), y: y1 })
  ];
  for (let i = 0; i < passes.length && out.length; i += 2) {
    const inside = passes[i], cross = passes[i + 1];
    const res = [];
    let prev = out[out.length - 1];
    for (const cur of out) {
      const ci = inside(cur), pi = inside(prev);
      if (ci) {
        if (!pi) res.push(cross(prev, cur));
        res.push(cur);
      } else if (pi) {
        res.push(cross(prev, cur));
      }
      prev = cur;
    }
    out = res;
  }
  return out;
};

const clipSegment = (a, b, x0, y0, x1, y1) => {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  const checks = [[-dx, a.x - x0], [dx, x1 - a.x], [-dy, a.y - y0], [dy, y1 - a.y]];
  for (const [p, q] of checks) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
};

const simplify = (pts, tol) => {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const ax = pts[a].x, ay = pts[a].y, bx = pts[b].x, by = pts[b].y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1, bestD = 0;
    for (let i = a + 1; i < b; i++) {
      let d;
      if (len2 === 0) { d = (pts[i].x - ax) ** 2 + (pts[i].y - ay) ** 2; }
      else {
        const t = clamp(((pts[i].x - ax) * dx + (pts[i].y - ay) * dy) / len2, 0, 1);
        d = (pts[i].x - ax - t * dx) ** 2 + (pts[i].y - ay - t * dy) ** 2;
      }
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0 && bestD > tol2) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
};

const projectFlat = (flat, view, tol) => {
  const out = [];
  let lx = NaN, ly = NaN;
  for (let i = 0; i < flat.length; i += 2) {
    const p = toScreen(view, flat[i + 1], flat[i]);
    if (Math.abs(p.x - lx) + Math.abs(p.y - ly) < tol) continue;
    out.push(p);
    lx = p.x; ly = p.y;
  }
  return simplify(out, tol);
};

const pathOf = (pts, close) => {
  if (pts.length < 2) return "";
  let d = `M${r1(pts[0].x)} ${r1(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) d += `L${r1(pts[i].x)} ${r1(pts[i].y)}`;
  return close ? d + "Z" : d;
};

const polygonPath = (rings, view, tol) => {
  let d = "";
  for (const ring of rings) {
    const pts = projectFlat(ring, view, tol);
    if (pts.length < 3) continue;
    const clipped = clipPolygon(pts, -EDGE, -EDGE, MAP_W + EDGE, MAP_H + EDGE);
    if (clipped.length >= 3) d += pathOf(clipped, true);
  }
  return d;
};

const linePath = (flat, view, tol) => {
  const pts = projectFlat(flat, view, tol);
  let d = "";
  let run = [];
  const flush = () => { if (run.length >= 2) d += pathOf(run, false); run = []; };
  for (let i = 1; i < pts.length; i++) {
    const seg = clipSegment(pts[i - 1], pts[i], -EDGE, -EDGE, MAP_W + EDGE, MAP_H + EDGE);
    if (!seg) { flush(); continue; }
    if (!run.length || Math.abs(run[run.length - 1].x - seg[0].x) + Math.abs(run[run.length - 1].y - seg[0].y) > 0.05) { flush(); run.push(seg[0]); }
    run.push(seg[1]);
  }
  flush();
  return d;
};

const viewBoxLatLng = (view) => {
  const nw = fromScreen(view, -EDGE, -EDGE);
  const se = fromScreen(view, MAP_W + EDGE, MAP_H + EDGE);
  return [nw.lng, se.lat, se.lng, nw.lat];
};

const baseCache = new Map();
const cacheGet = (key) => baseCache.get(key);
const cacheSet = (key, val) => {
  if (baseCache.size >= 64) baseCache.delete(baseCache.keys().next().value);
  baseCache.set(key, val);
};

const tileZoom = (zoom, thumb) => clamp(Math.floor(zoom) - (thumb ? 2 : 0), 0, TILE_MAX_ZOOM);

const tileCoverage = (view, opts = {}) => {
  const tz = tileZoom(view.zoom, !!opts.thumb);
  const size = TILE * Math.pow(2, view.zoom - tz);
  const n = Math.pow(2, tz);
  const tx0 = Math.max(0, Math.floor(view.x0 / size)), tx1 = Math.min(n - 1, Math.ceil((view.x0 + MAP_W) / size) - 1);
  const ty0 = Math.max(0, Math.floor(view.y0 / size)), ty1 = Math.min(n - 1, Math.ceil((view.y0 + MAP_H) / size) - 1);
  const out = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) out.push({ z: tz, x: tx, y: ty, sx: tx * size - view.x0, sy: ty * size - view.y0, size });
  }
  return out;
};

const tileHref = (base, t) => `${base}/${t.z}/${t.x}_${t.y}.jpg`;

const tileBaseOf = (opts) => opts.tileBase || TILE_ENV || `${opts.publicBase || ""}${TILE_PATH}`;

const renderRaster = (view, opts) => {
  const tiles = tileCoverage(view, { thumb: !!opts.thumb });
  if (!tiles.length) return "";
  const base = tileBaseOf(opts);
  const clipId = `${opts.id || "map"}-clip`;
  let out = `<clipPath id="${esc(clipId)}"><rect x="0" y="0" width="${MAP_W}" height="${MAP_H}"/></clipPath><g class="map-raster" clip-path="url(#${esc(clipId)})">`;
  for (const t of tiles) {
    out += `<image class="map-tile" href="${esc(tileHref(base, t))}" x="${r1(t.sx)}" y="${r1(t.sy)}" width="${t.size + 1}" height="${t.size + 1}" preserveAspectRatio="none"/>`;
  }
  return out + "</g>";
};

const graticuleStep = (zoom) => zoom <= 2 ? 30 : zoom === 3 ? 15 : zoom === 4 ? 10 : 0;

const renderGraticule = (view, vb) => {
  const step = graticuleStep(view.zoom);
  if (!step) return "";
  let d = "";
  for (let lng = Math.ceil(vb[0] / step) * step; lng <= vb[2]; lng += step) {
    const x = r1(toScreen(view, 0, lng).x);
    d += `M${x} 0L${x} ${MAP_H}`;
  }
  for (let lat = Math.ceil(vb[1] / step) * step; lat <= vb[3]; lat += step) {
    if (Math.abs(lat) >= 85) continue;
    const y = r1(toScreen(view, lat, 0).y);
    d += `M0 ${y}L${MAP_W} ${y}`;
  }
  return d ? `<path class="map-grat" d="${d}"/>` : "";
};

const renderBase = (view, detail) => {
  const key = `${view.zoom}|${Math.round(view.x0)}|${Math.round(view.y0)}|${detail}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  const z = view.zoom;
  const tol = detail === "low" ? 4 : z <= 3 ? 1.1 : 0.7;
  const vb = viewBoxLatLng(view);
  const high = z >= 5;
  let out = detail === "low" ? "" : renderGraticule(view, vb);
  let borders = "";
  for (const c of data.countries(high ? "high" : "low")) {
    if (!bboxHit(c.b, vb)) continue;
    for (const poly of c.p) {
      const d = polygonPath(poly, view, tol);
      if (d) borders += `<path class="map-border" d="${d}"/>`;
    }
  }
  out += `<g class="map-countries">${borders}</g>`;
  if (high && detail !== "low") {
    let st = "";
    for (const s of data.states()) {
      if (s.z > z || !bboxHit(s.b, vb)) continue;
      const d = linePath(s.l, view, tol);
      if (d) st += `<path class="map-state" d="${d}"/>`;
    }
    if (st) out += `<g class="map-states">${st}</g>`;
  }
  if (z >= CRISP_ZOOM && detail !== "low") {
    let co = "";
    for (const c of data.coast()) {
      if (!bboxHit(c.b, vb)) continue;
      const d = linePath(c.l, view, tol);
      if (d) co += `<path class="map-coast" d="${d}"/>`;
    }
    for (const l of data.lakes()) {
      if (l.z > z || !bboxHit(l.b, vb)) continue;
      for (const poly of l.p) {
        const d = polygonPath(poly, view, tol);
        if (d) co += `<path class="map-lake" d="${d}"/>`;
      }
    }
    if (co) out += `<g class="map-coasts">${co}</g>`;
  }
  cacheSet(key, out);
  return out;
};

const textWidth = (s, size) => String(s || "").length * size * 0.58;

const collides = (boxes, b) => boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);

const renderLabels = (view, boxes) => {
  const z = view.zoom;
  let out = "";
  if (z >= 3 && z <= 7) {
    const list = data.countries(z >= 5 ? "high" : "low").filter((c) => c.ml <= z && c.n).sort((a, b) => a.r - b.r);
    for (const c of list) {
      const p = toScreen(view, c.ly, c.lx);
      if (p.x < 20 || p.x > MAP_W - 20 || p.y < 10 || p.y > MAP_H - 10) continue;
      const w = textWidth(c.n, 14);
      const b = { x0: p.x - w / 2 - 4, x1: p.x + w / 2 + 4, y0: p.y - 10, y1: p.y + 6 };
      if (collides(boxes, b)) continue;
      boxes.push(b);
      out += `<text class="map-label-country" x="${r1(p.x)}" y="${r1(p.y)}">${esc(c.n)}</text>`;
    }
  }
  if (z >= 2) {
    const list = data.places(z >= 5 ? "high" : "low").filter((p) => p.z <= z).sort((a, b) => (b.k - a.k) || (b.p - a.p));
    for (const pl of list) {
      const p = toScreen(view, pl.la, pl.lo);
      if (p.x < 4 || p.x > MAP_W - 4 || p.y < 4 || p.y > MAP_H - 4) continue;
      const w = textWidth(pl.n, 12);
      const dot = { x0: p.x - 5, x1: p.x + 5, y0: p.y - 5, y1: p.y + 5 };
      if (collides(boxes, dot)) continue;
      const lb = { x0: p.x + 5, x1: p.x + 9 + w, y0: p.y - 8, y1: p.y + 8 };
      const withLabel = !collides(boxes, lb) && lb.x1 <= MAP_W;
      boxes.push(dot);
      if (withLabel) boxes.push(lb);
      const cls = pl.k ? "map-place-dot map-place-capital" : "map-place-dot";
      out += `<circle class="${cls}" cx="${r1(p.x)}" cy="${r1(p.y)}" r="${pl.k ? 3.4 : 2.4}"/>`;
      if (withLabel) out += `<text class="map-place-label${pl.k ? " map-place-label-capital" : ""}" x="${r1(p.x + 7)}" y="${r1(p.y + 4)}">${esc(pl.n)}</text>`;
    }
  }
  return out ? `<g class="map-labels">${out}</g>` : "";
};

const niceScale = (view) => {
  const mpp = metersPerPx(view);
  const target = 150 * mpp;
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const nice = [1, 2, 5, 10].map((n) => n * pow).filter((n) => n <= target).pop() || pow;
  const px = nice / mpp;
  const label = nice >= 1000 ? `${Math.round(nice / 1000)} km` : `${Math.round(nice)} m`;
  return { px, label };
};

const renderScale = (view) => {
  const { px, label } = niceScale(view);
  const x = 14, y = MAP_H - 16;
  return `<g class="map-scale"><path class="map-scale-line" d="M${x} ${y - 5}L${x} ${y}L${r1(x + px)} ${y}L${r1(x + px)} ${y - 5}"/><text class="map-scale-text" x="${x + 2}" y="${y - 8}">${esc(label)} · z${view.zoom}</text></g>`;
};

const renderAttribution = () => `<text class="map-attrib" x="${MAP_W - 8}" y="${MAP_H - 8}">Natural Earth</text>`;

const truncate = (s, n) => {
  const line = String(s || "").split(/\r?\n/)[0].trim();
  return line.length > n ? line.slice(0, n - 1) + "…" : line;
};

const pinPath = (s) => `M0 0C${-7 * s} ${-9 * s} ${-11 * s} ${-14 * s} ${-11 * s} ${-21 * s}A${11 * s} ${11 * s} 0 1 1 ${11 * s} ${-21 * s}C${11 * s} ${-14 * s} ${7 * s} ${-9 * s} 0 0Z`;

const clusterPins = (placed, view) => {
  if (view.zoom >= MAX_ZOOM) return placed.map((p) => ({ ...p, members: [p] }));
  const clusters = [];
  for (const p of placed) {
    const near = clusters.find((c) => Math.abs(c.x - p.x) <= CLUSTER_PX && Math.abs(c.y - p.y) <= CLUSTER_PX);
    if (near) {
      near.members.push(p);
      near.x = near.members.reduce((s, m) => s + m.x, 0) / near.members.length;
      near.y = near.members.reduce((s, m) => s + m.y, 0) / near.members.length;
    } else {
      clusters.push({ x: p.x, y: p.y, members: [p] });
    }
  }
  return clusters;
};

const renderPins = (view, pins, opts, boxes, hit = {}) => {
  const placed = [];
  pins.forEach((m, i) => {
    const lat = num(m.lat), lng = num(m.lng);
    if (lat == null || lng == null) return;
    const p = toScreen(view, lat, lng);
    if (p.x < -20 || p.x > MAP_W + 20 || p.y < -10 || p.y > MAP_H + 50) return;
    placed.push({ ...m, lat, lng, x: p.x, y: p.y, idx: i });
  });
  if (!placed.length) return "";
  const clusters = clusterPins(placed.filter((p) => !p.pick), view);
  for (const p of placed.filter((p) => p.pick)) clusters.push({ x: p.x, y: p.y, members: [p], pick: true });
  clusters.sort((a, b) => a.y - b.y);
  const quiet = !!opts.popup;
  let out = "";
  for (const c of clusters) {
    const x = r1(c.x), y = r1(c.y);
    if (c.members.length > 1) {
      const n = c.members.length;
      const center = fromScreen(view, c.x, c.y);
      if (c.members.some((m) => m.focus)) hit.focus = { x: c.x, y: c.y, top: 20 };
      let gap = Infinity;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) gap = Math.min(gap, Math.max(Math.abs(c.members[i].x - c.members[j].x), Math.abs(c.members[i].y - c.members[j].y)));
      const splitZoom = gap > 0 ? view.zoom + Math.ceil(Math.log2((CLUSTER_PX + 1) / gap)) : MAX_ZOOM;
      const href = opts.viewHref ? opts.viewHref({ zoom: clamp(Math.max(splitZoom, view.zoom + 1), MIN_ZOOM, MAX_ZOOM), lat: center.lat, lng: center.lng }) : null;
      const title = opts.clusterTitle ? `${n} ${opts.clusterTitle}` : String(n);
      const glyph = `<g class="map-cluster" transform="translate(${x} ${y})"><title>${esc(title)}</title><circle class="map-cluster-ring" r="19"/><circle class="map-cluster-dot" r="14"/><text class="map-cluster-count" y="4.5">${n}</text></g>`;
      out += href ? `<a href="${esc(href)}">${glyph}</a>` : glyph;
      boxes.push({ x0: c.x - 20, x1: c.x + 20, y0: c.y - 20, y1: c.y + 20 });
      continue;
    }
    const m = c.members[0];
    if (m.pick) {
      out += `<g class="map-pin-pick" transform="translate(${x} ${y})"><circle class="map-pick-ring" r="11"/><path class="map-pick-cross" d="M-16 0H-6M6 0H16M0 -16V-6M0 6V16"/><circle class="map-pick-center" r="2.5"/></g>`;
      continue;
    }
    const s = m.main ? 1.25 : 1;
    const cls = ["map-pin", m.main ? "map-pin-main" : "", m.focus ? "map-pin-focus" : ""].filter(Boolean).join(" ");
    let g = `<g class="${cls}" transform="translate(${x} ${y})">`;
    if (m.title) g += `<title>${esc(m.title)}</title>`;
    g += `<path class="map-pin-body" d="${pinPath(s)}"/><circle class="map-pin-eye" cy="${-21 * s}" r="${4 * s}"/>`;
    const silent = quiet && m.focus;
    if (silent) hit.focus = { x: c.x, y: c.y, top: 32 * s };
    const label = silent ? "" : truncate(m.label, 28);
    if (label) {
      const w = textWidth(label, 12) + 12;
      const ly = -21 * s - 11 * s - 16;
      g += `<rect class="map-pin-label-bg" x="${r1(-w / 2)}" y="${r1(ly - 12)}" width="${r1(w)}" height="17" rx="4"/><text class="map-pin-label" y="${r1(ly)}">${esc(label)}</text>`;
      boxes.push({ x0: c.x - w / 2, x1: c.x + w / 2, y0: c.y + ly - 12, y1: c.y });
    } else {
      boxes.push({ x0: c.x - 12, x1: c.x + 12, y0: c.y - 34, y1: c.y });
    }
    if (m.image && !silent) {
      const size = 38;
      g += `<rect class="map-pin-img-frame" x="${r1(13 * s)}" y="${r1(-21 * s - size / 2 - 2)}" width="${size + 4}" height="${size + 4}" rx="4"/><image class="map-pin-img" href="${esc(m.image)}" x="${r1(13 * s + 2)}" y="${r1(-21 * s - size / 2)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice"/>`;
      boxes.push({ x0: c.x + 13 * s, x1: c.x + 13 * s + size + 4, y0: c.y - 21 * s - size / 2 - 2, y1: c.y - 21 * s + size / 2 + 2 });
    }
    g += "</g>";
    out += m.href ? `<a href="${esc(m.href)}">${g}</a>` : g;
  }
  return `<g class="map-pins">${out}</g>`;
};

const popupPlacement = (at) => {
  const roomAbove = at.y - at.top - POPUP_GAP;
  const roomBelow = MAP_H - at.y - POPUP_GAP;
  const below = roomAbove < POPUP_H && roomBelow > roomAbove;
  const h = Math.min(POPUP_H, Math.max(below ? roomBelow : roomAbove, 60));
  const x = clamp(at.x - POPUP_W / 2, 4, MAP_W - POPUP_W - 4);
  const y = below ? at.y + POPUP_GAP : at.y - at.top - POPUP_GAP - h;
  return { x, y, w: POPUP_W, h, below, tipX: clamp(at.x, x + 14, x + POPUP_W - 14) };
};

const renderPopup = (at, html) => {
  if (!at || !html) return "";
  const p = popupPlacement(at);
  const pointer = p.below
    ? `M${r1(p.tipX - 8)} ${r1(p.y)}L${r1(p.tipX)} ${r1(p.y - 8)}L${r1(p.tipX + 8)} ${r1(p.y)}Z`
    : `M${r1(p.tipX - 8)} ${r1(p.y + p.h)}L${r1(p.tipX)} ${r1(p.y + p.h + 8)}L${r1(p.tipX + 8)} ${r1(p.y + p.h)}Z`;
  return `<g class="map-popup${p.below ? " map-popup--below" : ""}"><path class="map-popup-pointer" d="${pointer}"/>` +
    `<foreignObject x="${r1(p.x)}" y="${r1(p.y)}" width="${p.w}" height="${r1(p.h)}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" class="map-popup-wrap"><div class="map-popup-card">${html}</div></div></foreignObject></g>`;
};

const renderGrid = (view, opts) => {
  const pick = opts.pick;
  const legacy = opts.clickUrl;
  if (!pick && !legacy) return "";
  const cells = [];
  for (let gy = 0; gy < GRID_ROWS; gy++) {
    for (let gx = 0; gx < GRID_COLS; gx++) {
      const c = fromScreen(view, (gx + 0.5) / GRID_COLS * MAP_W, (gy + 0.5) / GRID_ROWS * MAP_H);
      const val = `${c.lat},${c.lng}`;
      if (pick) {
        cells.push(`<button form="${esc(pick.form)}" formmethod="GET" formaction="${esc(pick.action)}" name="${esc(pick.name || "pick")}" value="${val}" class="map-pick-cell" title="${val}"></button>`);
      } else {
        const latParam = opts.latParam || "lat", lngParam = opts.lngParam || "lng";
        cells.push(`<a href="${esc(`${legacy}${latParam}=${c.lat}&${lngParam}=${c.lng}${opts.anchor || ""}`)}" class="map-pick-cell" title="${val}"></a>`);
      }
    }
  }
  return `<div class="map-pick-grid">${cells.join("")}</div>`;
};

const renderControls = (view, opts) => {
  const nav = opts.nav;
  if (!nav) return "";
  const t = opts.text || {};
  const el = (target, label, cls, title) => {
    const value = target ? viewParam(target) : "";
    if (nav.form) {
      return `<button form="${esc(nav.form)}" formmethod="GET" formaction="${esc(nav.action)}" name="view" value="${value}" class="map-ctrl ${cls}" title="${esc(title)}">${label}</button>`;
    }
    return `<a href="${esc(nav.href(target))}" class="map-ctrl ${cls}" title="${esc(title)}">${label}</a>`;
  };
  const pan = (dx, dy) => {
    const c = fromScreen(view, MAP_W / 2 + dx * MAP_W * 0.4, MAP_H / 2 + dy * MAP_H * 0.4);
    return { zoom: view.zoom, lat: c.lat, lng: c.lng };
  };
  const zoomIn = view.zoom < MAX_ZOOM ? el({ zoom: view.zoom + 1, lat: view.lat, lng: view.lng }, "+", "map-ctrl-in", t.zoomIn || "+") : `<span class="map-ctrl map-ctrl-off">+</span>`;
  const zoomOut = view.zoom > MIN_ZOOM ? el({ zoom: view.zoom - 1, lat: view.lat, lng: view.lng }, "−", "map-ctrl-out", t.zoomOut || "−") : `<span class="map-ctrl map-ctrl-off">−</span>`;
  const fit = el(null, "⌖", "map-ctrl-fit", t.fit || "⌖");
  return `<div class="map-controls map-controls-zoom">${zoomIn}${zoomOut}</div>` +
    `<div class="map-controls map-controls-pan">` +
    `<span></span>${el(pan(0, -1), "↑", "map-ctrl-up", t.pan || "↑")}<span></span>` +
    `${el(pan(-1, 0), "←", "map-ctrl-left", t.pan || "←")}${fit}${el(pan(1, 0), "→", "map-ctrl-right", t.pan || "→")}` +
    `<span></span>${el(pan(0, 1), "↓", "map-ctrl-down", t.pan || "↓")}<span></span>` +
    `</div>`;
};

const renderMapHtml = (view, pins, opts = {}) => {
  const detail = opts.thumb ? "low" : "normal";
  const boxes = [];
  const pinList = Array.isArray(pins) ? pins : [];
  const grid = renderGrid(view, opts);
  const hit = {};
  const pinsSvg = renderPins(view, pinList, opts, boxes, hit) + renderPopup(hit.focus, opts.popup);
  const labels = opts.thumb ? "" : renderLabels(view, boxes);
  const extras = opts.thumb ? "" : renderScale(view) + renderAttribution();
  const base = `<rect class="map-ocean" x="0" y="0" width="${MAP_W}" height="${MAP_H}"/>` + renderRaster(view, opts) + renderBase(view, detail);
  const svgOpen = `<svg class="map-svg" viewBox="0 0 ${MAP_W} ${MAP_H}" xmlns="http://www.w3.org/2000/svg" role="img">`;
  let html = `<div class="map-stage${opts.thumb ? " map-stage-thumb" : ""}" id="${esc(opts.id || "map")}">`;
  if (grid || opts.nav) {
    html += svgOpen + base + labels + extras + "</svg>";
    html += grid;
    html += `<svg class="map-svg map-pins-layer" viewBox="0 0 ${MAP_W} ${MAP_H}" xmlns="http://www.w3.org/2000/svg">${pinsSvg}</svg>`;
  } else {
    html += svgOpen + base + labels + pinsSvg + extras + "</svg>";
  }
  html += renderControls(view, opts);
  html += "</div>";
  return html;
};

const renderMapWithPins = (markers, mainIdx) => {
  const pins = (Array.isArray(markers) ? markers : []).map((m, i) => ({ ...m, main: i === (mainIdx || 0) }));
  const fit = fitView(pins);
  return renderMapHtml(makeView(fit.lat, fit.lng, fit.zoom), pins, {});
};

const renderZoomedMapWithPins = (centerLat, centerLng, zoom, markers, mainIdx) => {
  const pins = (Array.isArray(markers) ? markers : []).map((m, i) => ({ ...m, main: i === (mainIdx || 0) }));
  return renderMapHtml(makeView(centerLat, centerLng, zoom), pins, {});
};

module.exports = {
  MAP_W, MAP_H, MIN_ZOOM, MAX_ZOOM, TILE_MAX_ZOOM, TILE_PATH,
  project, unproject, latLngToPx, pxToLatLng, makeView, toScreen, fromScreen, fitView, resolveView,
  parseView, viewParam, parsePick, getViewportBounds, metersPerPx, clusterPins, niceScale, tileCoverage, popupPlacement,
  renderMapHtml, renderMapWithPins, renderZoomedMapWithPins
};
