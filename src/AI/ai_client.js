const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const axiosMod = require('../server/node_modules/axios');
const axios = axiosMod.default || axiosMod;

const net = require('net');
const BASE_PORT = Number(process.env.OASIS_AI_PORT) || 4001;
let PORT = BASE_PORT;

const portIsFree = (port) => new Promise((resolve) => {
  const probe = net.createServer();
  probe.once('error', () => resolve(false));
  probe.once('listening', () => probe.close(() => resolve(true)));
  probe.listen(port, '127.0.0.1');
});

const pickPort = async () => {
  for (let p = BASE_PORT; p < BASE_PORT + 20; p++) {
    if (await portIsFree(p)) return p;
  }
  return BASE_PORT;
};
const MODEL_FILE = 'oasis-42-1-chat.Q4_K_M.gguf';
const MODEL_PATH = process.env.OASIS_AI_MODEL || path.join(__dirname, MODEL_FILE);
const ASK_TIMEOUT_MS = 130000;
const DEBUG = process.env.OASIS_DEBUG === '1' || process.env.OASIS_DEBUG === 'true';
const STATUS_TIMEOUT_MS = 3000;

const token = crypto.randomBytes(24).toString('hex');
let child = null;
let started = false;

const isModelInstalled = () => { try { return fs.existsSync(MODEL_PATH); } catch (_) { return false; } };

let starting = null;
const start = () => {
  if (started) return starting || Promise.resolve();
  started = true;
  if (process.env.OASIS_TEST) return Promise.resolve();
  starting = pickPort().then((port) => { PORT = port; spawnService(); }).catch(() => { spawnService(); }).finally(() => { starting = null; });
  return starting;
};

const spawnService = () => {
  try {
    child = spawn(process.execPath, [path.join(__dirname, 'ai_service.mjs')], {
      stdio: ['ignore', 'ignore', DEBUG ? 'inherit' : 'ignore'],
      env: { ...process.env, OASIS_AI_TOKEN: token, OASIS_AI_PORT: String(PORT), OASIS_AI_PARENT_PID: String(process.pid), OASIS_AI_MODEL: MODEL_PATH }
    });
    child.on('exit', () => { child = null; started = false; });
  } catch (_) { child = null; started = false; }
};

const stop = () => {
  if (!child) return;
  try { child.kill('SIGTERM'); } catch (_) {}
  child = null;
  started = false;
};

const headers = () => ({ 'x-oasis-ai-token': token });

const status = async () => {
  if (!isModelInstalled()) return { installed: false, ready: false, loading: false, error: 'model_missing' };
  await start();
  try {
    const r = await axios.get(`http://127.0.0.1:${PORT}/status`, { headers: headers(), timeout: STATUS_TIMEOUT_MS });
    return { installed: true, ...(r.data || {}) };
  } catch (_) {
    return { installed: true, ready: false, loading: true, error: null };
  }
};

const CONNECT_RETRIES = 300;
const CONNECT_RETRY_MS = 1000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const ask = async ({ system = '', history = [], context = [], input = '', lang = 'en', maxTokens } = {}) => {
  if (!isModelInstalled()) throw new Error('model_missing');
  await start();
  let lastErr = null;
  for (let attempt = 0; attempt < CONNECT_RETRIES; attempt++) {
    try {
      const r = await axios.post(`http://127.0.0.1:${PORT}/ai`, { system, history, context, input, lang, maxTokens }, { headers: headers(), timeout: ASK_TIMEOUT_MS });
      if (!r.data || typeof r.data.answer !== 'string') throw new Error('bad_answer');
      return r.data.answer;
    } catch (e) {
      lastErr = e;
      const httpStatus = e && e.response && e.response.status;
      const retryable = (e && e.code === 'ECONNREFUSED') || httpStatus === 503 || httpStatus === 403;
      if (!retryable) break;
      await sleep(CONNECT_RETRY_MS);
    }
  }
  throw lastErr || new Error('not_ready');
};

process.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { stop(); process.exit(0); });
}

module.exports = { start, stop, status, ask, isModelInstalled, MODEL_PATH, MODEL_FILE, port: () => PORT };
