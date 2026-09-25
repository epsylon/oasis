import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import { fileURLToPath } from 'url';
import { getLlama, LlamaChatSession } from '../server/node_modules/node-llama-cpp/dist/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.OASIS_AI_PORT) || 4001;
const TOKEN = String(process.env.OASIS_AI_TOKEN || '');
const PARENT_PID = Number(process.env.OASIS_AI_PARENT_PID) || 0;
const MODEL_FILE = 'oasis-42-1-chat.Q4_K_M.gguf';
const MODEL_PATH = process.env.OASIS_AI_MODEL || path.join(__dirname, MODEL_FILE);
const GENERATION_TIMEOUT_MS = 120000;
const MAX_TOKENS_DEFAULT = 400;
const MAX_INPUT_CHARS = 5000;
const MAX_CONTEXT_CHARS = 6000;

const state = { loading: false, ready: false, error: null, model: null, contextSize: 0, threads: 0 };
let llama, model, context;
let queue = Promise.resolve();
let loadingPromise = null;

const pickThreads = () => Math.max(1, Math.min(os.cpus().length - 1, 6));
const pickContextSize = () => {
  const gb = os.totalmem() / (1024 ** 3);
  if (gb < 6) return 2048;
  if (gb < 12) return 4096;
  return 8192;
};

async function initModel() {
  if (state.ready) return;
  if (loadingPromise) return loadingPromise;
  state.loading = true;
  loadingPromise = loadModel().finally(() => { loadingPromise = null; });
  return loadingPromise;
}

const DEBUG = process.env.OASIS_DEBUG === '1' || process.env.OASIS_DEBUG === 'true';
const log = (msg) => { if (!DEBUG) return; try { process.stderr.write(`[ai-service] ${msg}\n`); } catch (_) {} };

async function loadModel() {
  const t0 = Date.now();
  try {
    if (!fs.existsSync(MODEL_PATH)) throw new Error(`model_missing:${MODEL_PATH}`);
    log(`loading ${path.basename(MODEL_PATH)}`);
    llama = await getLlama({ gpu: false });
    log(`llama ready (${Date.now() - t0} ms)`);
    model = await llama.loadModel({ modelPath: MODEL_PATH });
    log(`model loaded (${Date.now() - t0} ms)`);
    state.threads = pickThreads();
    state.contextSize = pickContextSize();
    context = await model.createContext({ contextSize: state.contextSize, threads: state.threads });
    log(`context ready: ${state.contextSize} tokens, ${state.threads} threads (${Date.now() - t0} ms)`);
    state.model = path.basename(MODEL_PATH);
    state.ready = true;
    state.error = null;
  } catch (e) {
    state.error = String((e && e.message) || e);
    log(`load failed: ${state.error}`);
  } finally {
    state.loading = false;
  }
}

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

const buildHistory = ({ system, history, context: ctxLines }) => {
  const items = [];
  const sys = [clip(system, 2000)];
  const lines = Array.isArray(ctxLines) ? ctxLines.map(x => clip(x, 800)).filter(Boolean) : [];
  if (lines.length) {
    let block = '';
    for (const l of lines) { if ((block + l).length > MAX_CONTEXT_CHARS) break; block += `- ${l}\n`; }
    sys.push(`Knowledge from the Oasis network (use it when relevant, never invent beyond it):\n${block}`);
  }
  items.push({ type: 'system', text: sys.join('\n\n') });
  for (const turn of (Array.isArray(history) ? history : []).slice(-8)) {
    if (!turn || typeof turn.text !== 'string' || !turn.text.trim()) continue;
    if (turn.type === 'user') items.push({ type: 'user', text: clip(turn.text, MAX_INPUT_CHARS) });
    else if (turn.type === 'model') items.push({ type: 'model', response: [clip(turn.text, MAX_INPUT_CHARS)] });
  }
  return items;
};

async function answer(body) {
  await initModel();
  if (!state.ready) throw new Error(state.error || 'not_ready');
  const input = clip(body.input, MAX_INPUT_CHARS).trim();
  if (!input) throw new Error('empty_input');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
  const sequence = context.getSequence();
  const session = new LlamaChatSession({ contextSequence: sequence });
  try {
    session.setChatHistory(buildHistory(body));
    const text = await session.prompt(input, {
      maxTokens: Math.max(32, Math.min(1024, Number(body.maxTokens) || MAX_TOKENS_DEFAULT)),
      temperature: 0.6,
      signal: controller.signal,
      stopOnAbortSignal: true
    });
    return String(text || '').trim();
  } finally {
    clearTimeout(timer);
    try { session.dispose(); } catch (_) {}
    try { sequence.dispose(); } catch (_) {}
  }
}

const readJson = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 200000) { reject(new Error('body_too_large')); req.destroy(); } });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
  req.on('error', reject);
});

const send = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};

const server = http.createServer(async (req, res) => {
  if (TOKEN && req.headers['x-oasis-ai-token'] !== TOKEN) return send(res, 403, { error: 'forbidden' });
  if (req.method === 'GET' && req.url === '/status') {
    if (!state.ready && !state.loading && !state.error) initModel();
    return send(res, 200, { ...state });
  }
  if (req.method === 'POST' && req.url === '/ai') {
    let body;
    try { body = await readJson(req); } catch (e) { return send(res, 400, { error: 'bad_request' }); }
    const job = queue.then(() => answer(body));
    queue = job.catch(() => {});
    try {
      const text = await job;
      return send(res, 200, { answer: text });
    } catch (e) {
      const msg = String((e && e.message) || e);
      const status = msg.startsWith('model_missing') ? 503 : (msg === 'not_ready' ? 503 : 500);
      log(`answer failed: ${msg}`);
      return send(res, status, { error: msg, ...state });
    }
  }
  send(res, 404, { error: 'not_found' });
});

let listenAttempts = 0;
server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE' && listenAttempts < 20) {
    listenAttempts += 1;
    setTimeout(() => server.listen(PORT, '127.0.0.1'), 1000);
    return;
  }
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => { initModel(); });

const shutdown = () => { try { server.close(); } catch (_) {} process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
if (PARENT_PID > 0) {
  setInterval(() => {
    try { process.kill(PARENT_PID, 0); } catch (_) { shutdown(); }
  }, 5000).unref();
}
