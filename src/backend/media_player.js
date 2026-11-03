const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const RATE = 48000;
const CHANNELS = 2;
const SEEK_STEP = 15;
const PROBE_MS = 10000;
const DRAIN_MS = 15000;
const AVAILABLE_MS = 60000;

const onPath = (bin) => (path.isAbsolute(String(bin || ''))
  ? fs.existsSync(bin)
  : (process.env.PATH || '').split(path.delimiter).some((d) => d && fs.existsSync(path.join(d, bin))));
const ffmpegBin = () => process.env.OASIS_FFMPEG || 'ffmpeg';
const ffprobeBin = () => process.env.OASIS_FFPROBE || 'ffprobe';

const OUTPUTS = [
  ['pacat', ['--playback', '--raw', `--rate=${RATE}`, `--channels=${CHANNELS}`, '--format=s16le']],
  ['pw-play', ['--rate', String(RATE), '--channels', String(CHANNELS), '--format', 's16', '-']],
  ['aplay', ['-q', '-t', 'raw', '-f', 'S16_LE', '-r', String(RATE), '-c', String(CHANNELS)]]
];
const systemOutput = () => {
  if (process.platform === 'android') return null;
  const found = OUTPUTS.find(([bin]) => onPath(bin));
  if (!found) return null;
  return {
    open() {
      const p = spawn(found[0], found[1], { stdio: ['pipe', 'ignore', 'ignore'] });
      p.on('error', () => {});
      p.stdin.on('error', () => {});
      const done = new Promise((resolve) => { p.once('exit', resolve); p.once('error', resolve); });
      return { sink: p.stdin, done, stop() { try { p.stdin.destroy(); } catch (_) {} try { p.kill('SIGTERM'); } catch (_) {} } };
    }
  };
};

const decodeArgs = (file, offset) => [
  '-loglevel', 'quiet', '-nostdin', '-ss', String(Math.max(0, Number(offset) || 0)), '-i', file,
  '-map', '0:a:0', '-ac', String(CHANNELS), '-ar', String(RATE), '-f', 's16le', 'pipe:1'
];
const systemDecoder = () => {
  const bin = ffmpegBin();
  if (!onPath(bin)) return null;
  return {
    open: (file, offset) => spawn(bin, decodeArgs(file, offset), { stdio: ['ignore', 'pipe', 'ignore'] })
  };
};

const systemProbe = (file) => new Promise((resolve) => {
  execFile(ffprobeBin(), ['-v', 'quiet', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', file], { timeout: PROBE_MS, maxBuffer: 1 << 20 }, (err, out) => {
    if (err) return resolve(null);
    try {
      const j = JSON.parse(out);
      const types = (j.streams || []).map((s) => s && s.codec_type);
      resolve({ duration: Number(j.format && j.format.duration) || 0, audio: types.includes('audio') });
    } catch (_) { resolve(null); }
  });
});

let outputFactory = systemOutput;
let decoderFactory = systemDecoder;
let probe = systemProbe;
let current = null;
let session = 0;
let availableCache = null;
let nextResolver = null;

const available = () => {
  const now = Date.now();
  if (availableCache && now - availableCache.at < AVAILABLE_MS) return availableCache.ok;
  const ok = !!decoderFactory() && !!outputFactory() && (probe !== systemProbe || onPath(ffprobeBin()));
  availableCache = { at: now, ok };
  return ok;
};

const positionOf = (st) => Math.max(0, st.offset + (st.startedAt ? (Date.now() - st.startedAt) / 1000 : 0));
const clampPosition = (st, pos) => Math.min(Math.max(0, pos), st.duration > 1 ? st.duration - 1 : Math.max(0, pos));

const halt = (st) => {
  const run = st.run;
  st.run = null;
  if (!run) return;
  try { run.proc.kill('SIGTERM'); } catch (_) {}
  if (run.out) run.out.stop();
};

const finish = (st) => {
  if (current !== st) return;
  current = null;
  halt(st);
};

const launch = (st) => {
  const decoder = decoderFactory();
  const output = outputFactory();
  if (!decoder || !output) return false;
  const proc = decoder.open(st.file, st.offset);
  if (!proc) return false;
  const out = output.open();
  const run = { proc, out };
  st.run = run;
  proc.on('error', () => {});
  if (proc.stdout) {
    proc.stdout.on('error', () => {});
    proc.stdout.pipe(out.sink);
  }
  proc.on('close', () => {
    if (st.run !== run) return;
    st.run = null;
    if (current === st) advance(st, out);
  });
  st.startedAt = Date.now();
  return true;
};

const drained = (out) => (out && out.done
  ? Promise.race([out.done, new Promise((resolve) => { const t = setTimeout(resolve, DRAIN_MS); if (t.unref) t.unref(); })])
  : Promise.resolve());

const advance = async (st, out) => {
  await drained(out);
  if (current !== st) return;
  let next = null;
  try { next = nextResolver ? await nextResolver(status(), 1) : null; } catch (_) { next = null; }
  if (current !== st) return;
  if (next && next.file && await start(next)) return;
  if (current !== st) return;
  st.offset = 0;
  st.startedAt = null;
  if (!launch(st)) finish(st);
};

const skip = async (step) => {
  const st = current;
  if (!st) return;
  let target = null;
  try { target = nextResolver ? await nextResolver(status(), step < 0 ? -1 : 1) : null; } catch (_) { target = null; }
  if (current !== st) return;
  if (target && target.file && await start(target)) return;
  if (current === st && step < 0) seek(-positionOf(st));
};

const stop = () => {
  if (current) finish(current);
};

const start = async ({ file, blobId, title, href }) => {
  if (!file || !available()) return null;
  const info = await probe(file);
  if (!info || !info.audio) return null;
  stop();
  const st = { id: ++session, file, blobId: String(blobId || ''), title: String(title || ''), href: String(href || ''), duration: info.duration, offset: 0, startedAt: null, run: null };
  current = st;
  if (!launch(st)) { current = null; return null; }
  return status();
};

const pause = () => {
  const st = current;
  if (!st || !st.startedAt) return;
  st.offset = positionOf(st);
  st.startedAt = null;
  halt(st);
};

const resume = () => {
  const st = current;
  if (!st || st.startedAt) return;
  if (!launch(st)) finish(st);
};

const seek = (delta) => {
  const st = current;
  if (!st) return;
  const playing = !!st.startedAt;
  const pos = clampPosition(st, positionOf(st) + (Number(delta) || 0));
  halt(st);
  st.offset = pos;
  st.startedAt = null;
  if (playing && !launch(st)) finish(st);
};


const status = () => {
  const st = current;
  if (!st) return null;
  return { id: st.id, blobId: st.blobId, title: st.title, href: st.href, duration: st.duration, position: positionOf(st), paused: !st.startedAt };
};

const reset = () => { availableCache = null; };

module.exports = {
  SEEK_STEP,
  RATE,
  CHANNELS,
  decodeArgs,
  available,
  start,
  pause,
  resume,
  seek,
  skip,
  stop,
  status,
  setOutputFactory: (factory) => { outputFactory = typeof factory === 'function' ? factory : systemOutput; reset(); },
  setDecoderFactory: (factory) => { decoderFactory = typeof factory === 'function' ? factory : systemDecoder; reset(); },
  setProbe: (fn) => { probe = typeof fn === 'function' ? fn : systemProbe; reset(); },
  setNextResolver: (fn) => { nextResolver = typeof fn === 'function' ? fn : null; }
};
