const path = require('path');
const crypto = require('crypto');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { pathToFileURL } = require('url');

const WORKER_TAG = 'oasis-pdf-view';
const MUPDF_URL = pathToFileURL(path.join(__dirname, '..', 'server', 'node_modules', 'mupdf', 'dist', 'mupdf.js')).href;
const PDF_BASE_WIDTH = 1600;
const PDF_FIT_WIDTH = 1200;
const PDF_WEBP_EFFORT = 1;
const PDF_ZOOMS = [50, 75, 100, 125, 150, 200, 300];
const PDF_ZOOM_DEFAULT = 100;
const PDF_PAGE_MAX_PX = 4096;
const PDF_CALL_MS = 60000;
const PDF_DOCS_BYTES = 128 * 1024 * 1024;
const PDF_ROTATIONS = [0, 90, 180, 270];
const PDF_FRAME_ID_LEN = 12;
const PDF_PAGES_CACHE_BYTES = 64 * 1024 * 1024;
const PDF_WORKER_HEAP_MB = 256;
const PDF_WEBP_QUALITY = 85;
const PDF_MAGIC = Buffer.from('%PDF-');
const PDF_MAGIC_WINDOW = 1024;

const widthOf = (zoom) => (zoom <= PDF_ZOOM_DEFAULT ? PDF_FIT_WIDTH : Math.round(PDF_BASE_WIDTH * zoom / 100));
const PDF_WIDTHS = new Set(PDF_ZOOMS.map(widthOf));
const zoomOf = (value) => { const z = Number(value); return PDF_ZOOMS.includes(z) ? z : PDF_ZOOM_DEFAULT; };
const rotationOf = (value) => { const r = Number(value); return PDF_ROTATIONS.includes(r) ? r : 0; };
const looksLikePdf = (buf) => Buffer.isBuffer(buf) && buf.subarray(0, PDF_MAGIC_WINDOW).indexOf(PDF_MAGIC) >= 0;

if (!isMainThread && workerData === WORKER_TAG) {
  const docs = new Map();
  const sizes = new Map();
  let openBytes = 0;
  let mupdf = null;
  const need = (key) => {
    const doc = docs.get(key);
    if (!doc) throw new Error('NO_DOC');
    docs.delete(key);
    docs.set(key, doc);
    return doc;
  };
  const describe = (doc) => ({ pages: doc.countPages() });
  const ops = {
    open({ key, data }) {
      const doc = mupdf.Document.openDocument(Buffer.from(data), 'application/pdf');
      if (doc.needsPassword()) { doc.destroy(); throw new Error('LOCKED'); }
      docs.set(key, doc);
      sizes.set(key, data.byteLength);
      openBytes += data.byteLength;
      while (openBytes > PDF_DOCS_BYTES && docs.size > 1) {
        const [oldKey, oldDoc] = docs.entries().next().value;
        docs.delete(oldKey);
        openBytes -= sizes.get(oldKey) || 0;
        sizes.delete(oldKey);
        try { oldDoc.destroy(); } catch (_) {}
      }
      return describe(doc);
    },
    info({ key }) { return describe(need(key)); },
    render({ key, page, width }) {
      const doc = need(key);
      const pg = doc.loadPage(page - 1);
      try {
        const [x0, y0, x1, y1] = pg.getBounds();
        let scale = width / Math.max(1, x1 - x0);
        scale = Math.min(scale, PDF_PAGE_MAX_PX / Math.max(1, y1 - y0), PDF_PAGE_MAX_PX / Math.max(1, x1 - x0));
        const pix = pg.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
        try {
          const width = pix.getWidth();
          const height = pix.getHeight();
          const channels = pix.getNumberOfComponents() + pix.getAlpha();
          const stride = pix.getStride();
          const samples = pix.getPixels();
          const pixels = Buffer.alloc(width * height * channels);
          for (let y = 0; y < height; y++) pixels.set(samples.subarray(y * stride, y * stride + width * channels), y * width * channels);
          return { pixels, width, height, channels };
        } finally { pix.destroy(); }
      } finally { pg.destroy(); }
    }
  };
  const debug = process.argv.includes('--debug') || process.env.OASIS_DEBUG === '1' || process.env.OASIS_DEBUG === 'true';
  const ready = import(MUPDF_URL).then((m) => {
    mupdf = m;
    const PDF_LOG_NOISE = /xref|repair|trailer|object number|garbage|expected/i;
    mupdf.setLog(debug ? (message) => { if (!PDF_LOG_NOISE.test(String(message))) console.error(`[pdf] ${message}`); } : () => {});
  });
  parentPort.on('message', async ({ id, op, args }) => {
    try {
      await ready;
      if (!ops[op]) throw new Error('BAD_OP');
      const { data, ...rest } = args || {};
      if (data && !docs.has(rest.key)) ops.open({ key: rest.key, data });
      const value = op === 'open' ? describe(need(rest.key)) : ops[op](rest);
      parentPort.postMessage({ id, value });
    } catch (e) {
      parentPort.postMessage({ id, error: String((e && e.message) || e) });
    }
  });
} else {
  let worker = null;
  let current = null;
  const queue = [];
  const stop = () => { const w = worker; worker = null; if (w) w.terminate().catch(() => {}); };
  const settle = (outcome) => {
    const job = current;
    if (!job) return;
    current = null;
    clearTimeout(job.timer);
    if (outcome.error) job.reject(new Error(outcome.error)); else job.resolve(outcome.value);
    pump();
  };
  const start = () => {
    const w = new Worker(__filename, { workerData: WORKER_TAG, resourceLimits: { maxOldGenerationSizeMb: PDF_WORKER_HEAP_MB } });
    w.on('message', (msg) => { if (worker === w && current && msg.id === current.id) settle(msg); });
    const lost = () => { if (worker === w) { worker = null; settle({ error: 'WORKER' }); } };
    w.on('error', lost);
    w.on('exit', lost);
    w.unref();
    worker = w;
  };
  let seq = 0;
  const pump = () => {
    if (current || !queue.length) return;
    if (!worker) start();
    current = queue.shift();
    current.timer = setTimeout(() => { stop(); settle({ error: 'TIMEOUT' }); }, PDF_CALL_MS);
    worker.postMessage({ id: current.id, op: current.op, args: current.args });
  };
  const call = (op, args) => new Promise((resolve, reject) => {
    queue.push({ id: ++seq, op, args, resolve, reject, timer: null });
    pump();
  });
  const loading = new Map();
  const loadPdf = (key, load) => {
    if (!loading.has(key)) {
      loading.set(key, (async () => {
        const data = await load();
        if (!data) throw new Error('UNAVAILABLE');
        if (!looksLikePdf(data)) throw new Error('NOT_PDF');
        return data;
      })().finally(() => loading.delete(key)));
    }
    return loading.get(key);
  };
  const withDoc = async (key, load, op, args = {}) => {
    try { return await call(op, { key, ...args }); } catch (e) { if (e.message !== 'NO_DOC') throw e; }
    return call(op, { key, ...args, data: await loadPdf(key, load) });
  };
  const pages = new Map();
  let pagesBytes = 0;
  const remember = (k, v) => {
    pages.set(k, v);
    pagesBytes += v.body.length;
    for (const [old, entry] of pages) {
      if (pagesBytes <= PDF_PAGES_CACHE_BYTES) break;
      pages.delete(old);
      pagesBytes -= entry.body.length;
    }
  };
  const encode = async ({ pixels, width, height, channels }, rotation) => {
    const sharp = require('../server/node_modules/sharp');
    const raw = { raw: { width, height, channels } };
    return { body: await sharp(Buffer.from(pixels), raw).rotate(rotation).webp({ quality: PDF_WEBP_QUALITY, effort: PDF_WEBP_EFFORT }).toBuffer(), type: 'image/webp' };
  };
  const drawing = new Map();
  const keyOf = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
  const frameIdOf = (src) => `pdf-${keyOf(src).slice(0, PDF_FRAME_ID_LEN)}`;
  module.exports = {
    PDF_BASE_WIDTH, PDF_ZOOMS, PDF_ZOOM_DEFAULT, PDF_ROTATIONS,
    widthOf, zoomOf, rotationOf, looksLikePdf, keyOf, frameIdOf,
    isFrameId: (v) => new RegExp(`^pdf-[0-9a-f]{${PDF_FRAME_ID_LEN}}$`).test(String(v || '')),
    isPdfWidth: (w) => PDF_WIDTHS.has(Number(w)),
    info: (key, load) => withDoc(key, load, 'info'),
    async page(key, load, page, width, rotation) {
      const r = rotationOf(rotation);
      const cacheKey = `${key}|${page}|${width}|${r}`;
      const hit = pages.get(cacheKey);
      if (hit) { pages.delete(cacheKey); pages.set(cacheKey, hit); return hit; }
      if (!drawing.has(cacheKey)) {
        drawing.set(cacheKey, (async () => {
          const out = await encode(await withDoc(key, load, 'render', { page: Number(page), width: Number(width) }), r);
          remember(cacheKey, out);
          return out;
        })().finally(() => drawing.delete(cacheKey)));
      }
      return drawing.get(cacheKey);
    },
    shutdown: () => { stop(); while (queue.length) queue.shift().reject(new Error('STOPPED')); if (current) settle({ error: 'STOPPED' }); }
  };
}
