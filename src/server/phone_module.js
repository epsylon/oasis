const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const nodeCrypto = require('crypto');
const pull = require('./node_modules/pull-stream');
const Pushable = require('./node_modules/pull-pushable');
const sodium = require('./node_modules/chloride');
const ssbKeys = require('./node_modules/ssb-keys');

const RING_MS = 20000;
const PAM_MIN_MS = 500;
const dbg = process.env.OASIS_DEBUG ? (...a) => console.log('[phone]', ...a) : () => {};
const sid = (id) => String(id || '').slice(0, 9);
const PAM_WARN_MS = 10000;
const VOICEMAIL_MAX_MS = 60000;
const RATE = 8000;
const FRAME_BYTES = 320;
const FRAME_MS = 20;
const MAX_BACKLOG = 4000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const RING_WINDOW_MS = 60 * 1000;
const RING_PER_WINDOW = 20;
const SEEN_MAX = 5000;
const HUB_ROOMS_MAX = 256;
const HUB_RIDS_PER_ROOM = 4;
const GROUP_MAX = 10;
const MIX_QUEUE = 10;
const ROOM_MAX = 50;
const ROOM_QUIET_AT = 10;
const ROOM_JOIN_MS = 10000;
const ROOM_PEEK_MS = 1500;
const ROOM_FRAME_MAX = 2048;
const ROOM_RATE_MAX = 120;
const HUB_LAG_MAX = 2000;
const ROOM_ACK_EVERY = 100;
const ROUTES_MAX = 4096;
const MUTE_BEACON_MS = 2000;
const MUTE_TTL_MS = 6000;
const ROOM_EVENTS_MAX = 50;
const REC_TOGGLE_MIN_MS = 250;
const CHIMES_AT_ONCE = 3;
const ROOM_REC_MAX_BYTES = 4 * 3600 * 8000 * 2;
const CHIMES = {
  join: [[660, 90], [0, 20], [990, 140]],
  leave: [[990, 90], [0, 20], [660, 190]],
  recStart: [[880, 70], [0, 60], [880, 70], [0, 60], [1320, 160]],
  recStop: [[1320, 70], [0, 60], [660, 200]],
  mute: [[523, 80], [0, 30], [392, 160]],
  unmute: [[392, 80], [0, 30], [523, 180]],
  hand: [[784, 60], [0, 40], [988, 60], [0, 40], [1175, 110]]
};
const chimeMs = (kind) => (CHIMES[kind] || []).reduce((n, [, ms]) => n + ms, 0);
const K_CTRL = 0;
const K_AUDIO = 1;
const K_DATA = 2;
const K_KEY = 3;
const K_VIDEO = 4;
const VIDEO_CHUNK = 8 * 1024;
const VIDEO_PAD = 1024;
const VIDEO_HDR = 6;
const VIDEO_FILM = 0x80;
const VIDEO_FRAME_MAX = 256 * 1024;
const VIDEO_FPS = 8;
const VIDEO_SIZE = { w: 320, h: 240 };
const STREAM_SIZE = { w: 640, h: 480 };
const GRID_TILE_LARGE = { w: 640, h: 480 };
const GRID_LARGE_MAX = 4;
const ROOM_VIDEO_CHUNK_EXTRA = 45;
const VIDEO_HOLD_MS = 3000;
const ROOM_VIDEO_FRAME_MAX = 10 * 1024;
const ROOM_VIDEO_BYTES_PER_S = 200 * 1024;
const ROOM_VIDEO_SEND_MAX = Math.floor(ROOM_VIDEO_BYTES_PER_S * 0.9);
const VAD_MIN = 200;
const VAD_FLOOR_MAX = 1500;
const VAD_HANG = 15;
const RID = /^[0-9a-f]{32}$/;

const BIAS = 0x84;
const CLIP = 32635;
const ulawEncodeSample = (sample) => {
  let s = sample;
  const sign = (s >> 8) & 0x80;
  if (sign) s = -s;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; exponent--, mask >>= 1);
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
};
const ULAW_DECODE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  const t = (((u & 0x0f) << 3) + BIAS) << ((u & 0x70) >> 4);
  ULAW_DECODE[i] = (u & 0x80) ? BIAS - t : t - BIAS;
}
const ulawEncode = (pcm) => {
  const out = Buffer.alloc(pcm.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = ulawEncodeSample(pcm.readInt16LE(i * 2));
  return out;
};
const ulawDecode = (ulaw) => {
  const out = Buffer.alloc(ulaw.length * 2);
  for (let i = 0; i < ulaw.length; i++) out.writeInt16LE(ULAW_DECODE[ulaw[i]], i * 2);
  return out;
};

const wavFile = (pcm) => {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};

const connectingCycle = () => {
  const n = RATE * 2;
  const buf = Buffer.alloc(n * 2);
  let seed = 0x2545f491;
  let lp = 0;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    lp += (((seed >>> 8) / 0x800000) - 1 - lp) * 0.08;
    const env = Math.sin(Math.PI * i / n);
    buf.writeInt16LE(Math.round(lp * 9000 * env * env), i * 2);
  }
  return buf;
};
const toneCycle = (kind) => {
  if (kind === 'connecting') return connectingCycle();
  const segs = kind === 'ring'
    ? [{ ms: 1000, freq: (k) => (Math.floor(k / (RATE / 20)) % 2 ? 1250 : 1000) }, { ms: 2000 }]
    : [{ ms: 1500, freq: () => 425 }, { ms: 3000 }];
  const total = segs.reduce((a, s) => a + s.ms, 0) * RATE / 1000;
  const buf = Buffer.alloc(total * 2);
  let i = 0;
  let phase = 0;
  for (const s of segs) {
    const n = s.ms * RATE / 1000;
    for (let k = 0; k < n; k++, i++) {
      let v = 0;
      if (s.freq) { phase += 2 * Math.PI * s.freq(k) / RATE; v = Math.round(Math.sin(phase) * 6000); }
      buf.writeInt16LE(v, i * 2);
    }
  }
  return buf;
};

const onPath = (bin) => (process.env.PATH || '').split(path.delimiter).some(d => d && fs.existsSync(path.join(d, bin)));
const BACKENDS = [
  { rec: ['parec', ['--raw', `--rate=${RATE}`, '--channels=1', '--format=s16le', '--latency-msec=20']], play: ['pacat', ['--playback', '--raw', `--rate=${RATE}`, '--channels=1', '--format=s16le', '--latency-msec=60']] },
  { rec: ['pw-record', ['--rate', String(RATE), '--channels', '1', '--format', 's16', '-']], play: ['pw-play', ['--rate', String(RATE), '--channels', '1', '--format', 's16', '-']] },
  { rec: ['arecord', ['-q', '-t', 'raw', '-f', 'S16_LE', '-r', String(RATE), '-c', '1']], play: ['aplay', ['-q', '-t', 'raw', '-f', 'S16_LE', '-r', String(RATE), '-c', '1']] }
];
const systemAudio = () => {
  const backend = BACKENDS.find(b => onPath(b.rec[0]) && onPath(b.play[0]));
  if (!backend) return null;
  return {
    capture(onPcm) {
      const p = spawn(backend.rec[0], backend.rec[1], { stdio: ['ignore', 'pipe', 'ignore'] });
      p.on('error', () => {});
      p.stdout.on('data', onPcm);
      return { stop() { try { p.kill('SIGTERM'); } catch (_) {} } };
    },
    player() {
      const p = spawn(backend.play[0], backend.play[1], { stdio: ['pipe', 'ignore', 'ignore'] });
      p.on('error', () => {});
      p.stdin.on('error', () => {});
      return {
        write(buf) {
          if (!p.stdin.writable || p.stdin.writableLength > MAX_BACKLOG) return false;
          p.stdin.write(buf);
          return true;
        },
        end() { try { p.stdin.end(); } catch (_) {} },
        stop() { try { p.stdin.end(); p.kill('SIGTERM'); } catch (_) {} }
      };
    }
  };
};
let audioFactory = systemAudio;

const JPEG_SOI = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);
const jpegSplitter = (onJpeg) => {
  let pending = Buffer.alloc(0);
  return (chunk) => {
    pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
    for (;;) {
      const start = pending.indexOf(JPEG_SOI);
      if (start < 0) { pending = Buffer.alloc(0); return; }
      const end = pending.indexOf(JPEG_EOI, start + 3);
      if (end < 0) { pending = pending.length - start > VIDEO_FRAME_MAX ? Buffer.alloc(0) : pending.subarray(start); return; }
      onJpeg(Buffer.from(pending.subarray(start, end + 2)));
      pending = pending.subarray(end + 2);
    }
  };
};
const VIDEO_BACKENDS = [
  { bin: 'v4l2-ctl', args: (dev) => ['--device', dev, `--set-fmt-video=width=${VIDEO_SIZE.w},height=${VIDEO_SIZE.h},pixelformat=MJPG`, `--set-parm=${VIDEO_FPS}`, '--stream-mmap', '--stream-to=-'] },
  { bin: 'gst-launch-1.0', args: (dev) => ['-q', 'v4l2src', `device=${dev}`, '!', `video/x-raw,width=${VIDEO_SIZE.w},height=${VIDEO_SIZE.h}`, '!', 'videorate', '!', `video/x-raw,framerate=${VIDEO_FPS}/1`, '!', 'videoconvert', '!', 'jpegenc', 'quality=60', '!', 'fdsink', 'fd=1'] },
  { bin: 'ffmpeg', args: (dev) => ['-loglevel', 'quiet', '-f', 'v4l2', '-video_size', `${VIDEO_SIZE.w}x${VIDEO_SIZE.h}`, '-i', dev, '-vf', `fps=${VIDEO_FPS}`, '-c:v', 'mjpeg', '-q:v', '8', '-f', 'image2pipe', '-'] }
];
const videoDevices = () => {
  try { return fs.readdirSync('/dev').filter(n => /^video\d+$/.test(n)).sort((a, b) => Number(a.slice(5)) - Number(b.slice(5))).map(n => `/dev/${n}`); } catch (_) { return []; }
};
const systemVideo = (server, device) => {
  const backend = VIDEO_BACKENDS.find(b => onPath(b.bin));
  const dev = device || videoDevices()[0];
  if (!backend || !dev) return null;
  return {
    capture(onJpeg) {
      const p = spawn(backend.bin, backend.args(dev), { stdio: ['ignore', 'pipe', 'ignore'] });
      p.on('error', () => {});
      p.stdout.on('data', jpegSplitter(onJpeg));
      return { stop() { try { p.kill('SIGTERM'); } catch (_) {} } };
    }
  };
};
let videoFactory = systemVideo;

const hasBin = (bin) => (path.isAbsolute(String(bin || '')) ? fs.existsSync(bin) : onPath(bin));
const gstQuote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const STREAM_BACKENDS = [
  {
    bin: () => process.env.OASIS_FFMPEG || 'ffmpeg',
    retryWithoutAudio: true,
    args: (file, withAudio) => [
      '-loglevel', 'quiet', '-protocol_whitelist', 'file,crypto', '-re', '-i', file,
      '-map', '0:v:0', '-vf', `fps=${VIDEO_FPS},scale=${STREAM_SIZE.w}:${STREAM_SIZE.h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${STREAM_SIZE.w}:${STREAM_SIZE.h}:(ow-iw)/2:(oh-ih)/2`,
      '-c:v', 'mjpeg', '-q:v', '9', '-f', 'image2pipe', 'pipe:1',
      ...(withAudio ? ['-map', '0:a:0', '-ac', '1', '-ar', String(RATE), '-f', 's16le', 'pipe:3'] : [])
    ]
  },
  {
    bin: () => process.env.OASIS_GST_LAUNCH || 'gst-launch-1.0',
    args: (file) => [
      '-q', 'filesrc', `location=${gstQuote(file)}`, '!', 'decodebin', 'name=d',
      'd.', '!', 'queue', '!', 'videoconvert', '!', 'videoscale', 'add-borders=true', '!', `video/x-raw,width=${STREAM_SIZE.w},height=${STREAM_SIZE.h},pixel-aspect-ratio=1/1`, '!', 'videorate', '!', `video/x-raw,framerate=${VIDEO_FPS}/1`, '!', 'jpegenc', 'quality=50', '!', 'fdsink', 'fd=1', 'sync=true',
      'd.', '!', 'queue', '!', 'audioconvert', '!', 'audioresample', '!', `audio/x-raw,format=S16LE,rate=${RATE},channels=1`, '!', 'fdsink', 'fd=3', 'sync=true', 'async=false'
    ]
  }
];
const STREAM_STALL_MS = 5000;
const STREAM_START_MS = 20000;
const systemStream = () => {
  const backend = STREAM_BACKENDS.find(b => hasBin(b.bin()));
  if (!backend) return null;
  return {
    open(file, { onJpeg, onPcm, onEnd }) {
      let proc = null;
      let frames = 0;
      let lastAt = 0;
      let ended = false;
      const startedAt = Date.now();
      const watch = setInterval(() => {
        const now = Date.now();
        if (frames ? now - lastAt > STREAM_STALL_MS : now - startedAt > STREAM_START_MS) finish();
      }, 1000);
      if (watch.unref) watch.unref();
      const halt = () => { ended = true; clearInterval(watch); try { if (proc) proc.kill('SIGTERM'); } catch (_) {} };
      const finish = () => { if (ended) return; halt(); onEnd(); };
      const run = (withAudio) => {
        const p = spawn(backend.bin(), backend.args(file, withAudio), { stdio: ['ignore', 'pipe', 'ignore', 'pipe'] });
        proc = p;
        p.on('error', () => {});
        p.stdout.on('error', () => {});
        p.stdout.on('data', jpegSplitter((jpeg) => { if (ended || proc !== p) return; frames++; lastAt = Date.now(); onJpeg(jpeg); }));
        if (p.stdio[3]) {
          p.stdio[3].on('error', () => {});
          p.stdio[3].on('data', (pcm) => { if (!ended && proc === p) onPcm(pcm); });
        }
        p.on('close', () => {
          if (ended || proc !== p) return;
          if (withAudio && !frames && backend.retryWithoutAudio) return run(false);
          finish();
        });
      };
      run(true);
      return { stop() { if (!ended) halt(); } };
    }
  };
};
let streamFactory = systemStream;

const videoChunks = (seq, jpeg, track = 0) => {
  const n = Math.ceil(jpeg.length / VIDEO_CHUNK);
  const out = [];
  for (let i = 0; i < n; i++) {
    const data = jpeg.subarray(i * VIDEO_CHUNK, (i + 1) * VIDEO_CHUNK);
    const plain = Buffer.alloc(Math.ceil((VIDEO_HDR + data.length) / VIDEO_PAD) * VIDEO_PAD);
    plain.writeUInt16BE(seq & 0xffff, 0);
    plain[2] = i;
    plain[3] = n | (track ? VIDEO_FILM : 0);
    plain.writeUInt16BE(data.length, 4);
    data.copy(plain, VIDEO_HDR);
    nodeCrypto.randomFillSync(plain, VIDEO_HDR + data.length);
    out.push(plain);
  }
  return out;
};
const videoOff = (track = 0) => { const plain = Buffer.alloc(VIDEO_PAD); plain[3] = track ? VIDEO_FILM : 0; nodeCrypto.randomFillSync(plain, VIDEO_HDR); return plain; };
const videoTrack = (plain) => (Buffer.isBuffer(plain) && plain.length >= VIDEO_HDR && (plain[3] & VIDEO_FILM) ? 1 : 0);
const videoAssembler = () => {
  let cur = null;
  return (plain) => {
    if (!Buffer.isBuffer(plain) || plain.length < VIDEO_HDR) return null;
    const seq = plain.readUInt16BE(0), idx = plain[2], n = plain[3] & ~VIDEO_FILM, len = plain.readUInt16BE(4);
    if (!n) { cur = null; return 'off'; }
    if (idx >= n || VIDEO_HDR + len > plain.length || n * VIDEO_CHUNK > VIDEO_FRAME_MAX) return null;
    if (!cur || cur.seq !== seq) cur = { seq, n, parts: new Array(n), got: 0 };
    if (cur.parts[idx]) return null;
    cur.parts[idx] = Buffer.from(plain.subarray(VIDEO_HDR, VIDEO_HDR + len));
    cur.got++;
    if (cur.got < n) return null;
    const jpeg = Buffer.concat(cur.parts);
    cur = null;
    return jpeg;
  };
};

const BEEP_MS = 700;
const playBeep = (audio, count = 1) => {
  const on = (count > 1 ? 150 : BEEP_MS) * RATE / 1000;
  const gap = 150 * RATE / 1000;
  const pcm = Buffer.alloc((on * count + gap * (count - 1)) * 2);
  let phase = 0;
  for (let b = 0; b < count; b++) {
    const start = b * (on + gap);
    for (let k = 0; k < on; k++) {
      phase += 2 * Math.PI * 1000 / RATE;
      pcm.writeInt16LE(Math.round(Math.sin(phase) * 9000), (start + k) * 2);
    }
  }
  const player = audio.player();
  player.write(pcm);
  if (typeof player.end === 'function') player.end();
  else setTimeout(() => player.stop(), pcm.length / (RATE * 2) * 1000 + 300);
};

const chimeBusy = new WeakMap();
const playChime = (audio, kind) => {
  const notes = CHIMES[kind];
  if (!audio || !notes) return;
  const now = Date.now();
  const playing = (chimeBusy.get(audio) || []).filter(t => t > now);
  if (playing.length >= CHIMES_AT_ONCE) return;
  playing.push(now + chimeMs(kind));
  chimeBusy.set(audio, playing);
  const pcm = Buffer.alloc(Math.round(chimeMs(kind) * RATE / 1000) * 2);
  let at = 0, phase = 0;
  for (const [freq, ms] of notes) {
    const n = Math.round(ms * RATE / 1000);
    for (let k = 0; k < n && (at + k) * 2 + 1 < pcm.length; k++) {
      if (freq > 0) {
        phase += 2 * Math.PI * freq / RATE;
        const env = Math.min(1, k / 40, (n - k) / 40);
        pcm.writeInt16LE(Math.round(Math.sin(phase) * 7000 * env), (at + k) * 2);
      }
    }
    at += n;
  }
  const player = audio.player();
  player.write(pcm);
  if (typeof player.end === 'function') player.end();
  else setTimeout(() => player.stop(), pcm.length / (RATE * 2) * 1000 + 300);
};
const recordingPrefix = (ref) => nodeCrypto.createHash('sha256').update(String(ref || '')).digest('hex').slice(0, 16);

const startTone = (audio, kind) => {
  const cycle = toneCycle(kind);
  const player = audio.player();
  const chunk = RATE * 2 / 10;
  let pos = 0;
  const tick = () => {
    const end = Math.min(pos + chunk, cycle.length);
    player.write(cycle.subarray(pos, end));
    pos = end >= cycle.length ? 0 : end;
  };
  tick();
  const t = setInterval(tick, 100);
  return { stop() { clearInterval(t); player.stop(); } };
};

const mixInto = (acc, pcm) => { for (let i = 0; i < acc.length && i * 2 + 1 < pcm.length; i++) acc[i] += pcm.readInt16LE(i * 2); };
const clampPcm = (acc) => {
  const out = Buffer.alloc(acc.length * 2);
  for (let i = 0; i < acc.length; i++) out.writeInt16LE(Math.max(-32768, Math.min(32767, acc[i])), i * 2);
  return out;
};

let OpusScript = null;
try { OpusScript = require('opusscript'); } catch (_) {}
let sharpLib = null;
try { sharpLib = require('./node_modules/sharp'); } catch (_) {}
const OPUS_TAG = 0xf0;
const OPUS_BITRATE = 16000;
const makeEncoder = (codec) => {
  if (codec !== 'opus' || !OpusScript) return { encode: ulawEncode, free() {} };
  let enc = null;
  return {
    encode(pcm) {
      try {
        if (!enc) { enc = new OpusScript(RATE, 1, OpusScript.Application.VOIP); try { enc.encoderCTL(4002, OPUS_BITRATE); } catch (_) {} }
        return Buffer.concat([Buffer.from([OPUS_TAG]), enc.encode(pcm, pcm.length >> 1)]);
      } catch (_) { return ulawEncode(pcm); }
    },
    free() { if (enc) { try { enc.delete(); } catch (_) {} enc = null; } }
  };
};
const makeDecoder = () => {
  let dec = null;
  return {
    decode(buf) {
      if (buf.length === FRAME_BYTES / 2 || buf[0] !== OPUS_TAG || !OpusScript) return ulawDecode(buf);
      try {
        if (!dec) dec = new OpusScript(RATE, 1, OpusScript.Application.VOIP);
        return Buffer.from(dec.decode(buf.subarray(1)));
      } catch (_) { return Buffer.alloc(FRAME_BYTES); }
    },
    free() { if (dec) { try { dec.delete(); } catch (_) {} dec = null; } }
  };
};
const ctrlFrame = (obj) => Buffer.concat([Buffer.from([K_CTRL]), Buffer.from(JSON.stringify(obj))]);
const levelOf = (pcm) => {
  const n = pcm.length >> 1;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs(pcm.readInt16LE(i * 2));
  return n ? sum / n : 0;
};
const voiceGate = () => {
  let floor = 0;
  let hang = 0;
  return (pcm) => {
    const lv = levelOf(pcm);
    floor = lv < floor ? lv : floor + (lv - floor) * 0.002;
    if (lv > Math.max(VAD_MIN, Math.min(floor, VAD_FLOOR_MAX) * 3)) hang = VAD_HANG;
    else if (hang > 0) hang--;
    return hang > 0;
  };
};

const b64 = (buf) => Buffer.from(buf).toString('base64');
const isFeedId = (id) => typeof id === 'string' && /^@[A-Za-z0-9+/]{43}=\.ed25519$/.test(id);
const pkOf = (id) => Buffer.from(String(id).slice(1, -8), 'base64');
const signParts = (keys, parts) => b64(sodium.crypto_sign_detached(Buffer.from(parts.join('|')), Buffer.from(String(keys.private).replace(/\.ed25519$/, ''), 'base64')));
const verifyParts = (id, parts, sig) => {
  try { return !!sodium.crypto_sign_verify_detached(Buffer.from(String(sig), 'base64'), Buffer.from(parts.join('|')), pkOf(id)); } catch (_) { return false; }
};
const ephKey = (v) => {
  try { const b = Buffer.from(String(v), 'base64'); return b.length === 32 ? b : null; } catch (_) { return null; }
};
const deriveKeys = (mySecret, theirPublic, callId, callerPk, calleePk) => {
  const shared = sodium.crypto_scalarmult(mySecret, theirPublic);
  const label = (l) => sodium.crypto_hash_sha256(Buffer.concat([Buffer.from(shared), Buffer.from(l), Buffer.from(callId, 'hex'), callerPk, calleePk]));
  return { a2b: label('oasis-voices-a2b'), b2a: label('oasis-voices-b2a'), va2b: label('oasis-video-a2b'), vb2a: label('oasis-video-b2a') };
};
const sealer = (key) => {
  const prefix = nodeCrypto.randomBytes(16);
  let counter = 0n;
  return (plain) => {
    const nonce = Buffer.alloc(24);
    prefix.copy(nonce, 0);
    nonce.writeBigUInt64BE(++counter, 16);
    return Buffer.concat([nonce, Buffer.from(sodium.crypto_secretbox_easy(plain, nonce, key))]);
  };
};
const opener = (key) => {
  let prefix = null;
  let last = 0n;
  return (frame) => {
    if (!Buffer.isBuffer(frame) || frame.length < 40) return null;
    const nonce = frame.subarray(0, 24);
    const p = nonce.subarray(0, 16).toString('hex');
    const counter = nonce.readBigUInt64BE(16);
    if ((prefix && p !== prefix) || counter <= last) return null;
    const plain = sodium.crypto_secretbox_open_easy(frame.subarray(24), nonce, key);
    if (!plain) return null;
    prefix = p;
    last = counter;
    return Buffer.from(plain);
  };
};

module.exports = {
  name: 'phone',
  version: '1.0.0',
  manifest: {
    ring: 'async', answer: 'async', hangup: 'async', audio: 'duplex', relay: 'async', relayAudio: 'duplex', video: 'duplex', relayVideo: 'duplex',
    call: 'async', accept: 'async', reject: 'async', end: 'async', mute: 'async', silence: 'async', dismiss: 'async', camera: 'async', stream: 'async', videoFrames: 'source',
    viewerJoin: 'async', viewerLeave: 'async', viewerRooms: 'sync', publicFeed: 'source',
    recordStop: 'async', recordCancel: 'async',
    roomHub: 'duplex', roomInfo: 'async', roomAdmits: 'async', roomJoin: 'async', roomLeave: 'async', roomMute: 'async', roomHand: 'async', roomCount: 'async',
    roomRecStart: 'async', roomRecStop: 'async', roomNotify: 'async', roomClearEvents: 'async',
    roomState: 'sync', roomToken: 'sync', roomHubFor: 'async',
    state: 'sync', available: 'sync', pubs: 'sync', events: 'source'
  },
  permissions: { anonymous: { allow: ['ring', 'answer', 'hangup', 'audio', 'relay', 'relayAudio', 'video', 'relayVideo', 'roomHub', 'roomInfo', 'roomAdmits'] } },
  init(server, config) {
    const keys = config.keys;
    const audio = audioFactory(server);
    const recBase = String((config && config.path) || os.tmpdir());
    const recDir = path.join(recBase, 'oasis', 'rooms');
    try { if (!fs.existsSync(recDir) && fs.existsSync(path.join(recBase, 'rooms-recordings'))) { fs.mkdirSync(path.dirname(recDir), { recursive: true }); fs.renameSync(path.join(recBase, 'rooms-recordings'), recDir); } } catch (_) {}
    const subscribers = new Set();
    const seenCalls = new Map();
    const routes = new Map();
    const hubRooms = new Map();
    let call = null;
    let room = null;
    const silenced = new Set();

    const policy = () => {
      if (config.phone && typeof config.phone === 'object') return config.phone;
      try {
        const cfg = require('../configs/config-manager.js').getConfig();
        return { ...(cfg.phone || {}), off: !!(cfg.modules && cfg.modules.phoneMod === 'off') };
      } catch (_) { return {}; }
    };
    const ringMs = Number(policy().ringMs) > 0 ? Number(policy().ringMs) : RING_MS;
    const voicemailMaxMs = Number(policy().voicemailMaxMs) > 0 ? Number(policy().voicemailMaxMs) : VOICEMAIL_MAX_MS;
    const pamWarnMs = Number(policy().pamWarnMs) > 0 ? Number(policy().pamWarnMs) : PAM_WARN_MS;
    const roomMax = Number(policy().roomMax) > 0 ? Math.min(ROOM_MAX, Number(policy().roomMax)) : ROOM_MAX;
    const roomQuietAt = Number(policy().roomQuietAt) > 0 ? Number(policy().roomQuietAt) : ROOM_QUIET_AT;
    const video = videoFactory(server, policy().videoDevice);
    const streamer = streamFactory(server);
    const videoAllowed = () => policy().video !== false;
    const videoOn = () => !!video && videoAllowed();
    const codecsOffered = () => [...(OpusScript && policy().opus !== false ? ['opus'] : []), ...(videoOn() ? ['mjpeg'] : [])];
    const pickCodec = (offer) => (codecsOffered().includes('opus') && Array.isArray(offer) && offer.includes('opus') ? 'opus' : 'ulaw');
    const pickVideo = (offer, mine = false) => (videoAllowed() && ((Array.isArray(offer) && offer.includes('mjpeg')) || mine) ? 'mjpeg' : null);
    const frameWatchers = new Map();
    const publishFrame = (target, jpeg) => { const set = frameWatchers.get(target); if (set) for (const p of set) p.push(jpeg); };
    const endFrames = (target) => {
      const set = frameWatchers.get(target);
      if (!set) return;
      frameWatchers.delete(target);
      for (const p of set) { try { p.end(); } catch (_) {} }
    };
    let cam = null;
    let camSeq = 0;
    const startCam = (onJpeg) => {
      if (cam || !videoOn()) return false;
      const cap = video.capture((jpeg) => {
        if (!cam || jpeg.length > VIDEO_FRAME_MAX) return;
        camSeq = (camSeq + 1) & 0xffff;
        publishFrame('me', jpeg);
        onJpeg(jpeg, camSeq);
      });
      cam = { stop() { cap.stop(); } };
      return true;
    };
    const stopCam = () => { if (!cam) return; const c = cam; cam = null; c.stop(); endFrames('me'); };
    const relation = (method, source, dest, done) => {
      const friends = server.friends;
      if (!friends || typeof friends[method] !== 'function') return done(false);
      friends[method]({ source, dest }, (err, yes) => done(!err && !!yes));
    };
    const allowedCaller = (from, done) => {
      const p = policy();
      if (p.off || p.dnd === true) return done(false);
      relation('isBlocking', server.id, from, (blocked) => {
        if (blocked) return done(false);
        if (p.visibility !== 'mutuals') return done(true);
        relation('isFollowing', server.id, from, (a) => {
          if (!a) return done(false);
          relation('isFollowing', from, server.id, (b) => done(!!b));
        });
      });
    };
    const relayAllowed = (a, b, done) => {
      const p = policy();
      if (p.relay === false) return done(false);
      if (p.relayOpen === true) return done(true);
      relation('isFollowing', server.id, a, (x) => x ? done(true) : relation('isFollowing', server.id, b, (y) => done(!!y)));
    };
    const seal = (payload, to) => { try { return ssbKeys.box(payload, [to]); } catch (_) { return null; } };
    const unseal = (sealed) => { try { return ssbKeys.unbox(String(sealed), keys) || null; } catch (_) { return null; } };
    const opened = (req) => (req && typeof req.sealed === 'string' ? unseal(req.sealed) : req);
    const pubKeys = () => {
      const set = new Set();
      const add = (list) => { for (const e of list || []) if (Array.isArray(e) && e[1] && e[1].type === 'pub' && e[1].key) set.add(e[1].key); };
      try { add(server.conn.dbPeers()); } catch (_) {}
      try { add(server.conn.query().peersAll()); } catch (_) {}
      return set;
    };
    const knownPubs = () => {
      const connected = Object.keys(server.peers || {}).filter(id => id !== server.id && liveRpc(id));
      if (!server.conn || typeof server.conn.query !== 'function') return connected;
      const set = pubKeys();
      return connected.filter(id => set.has(id));
    };
    let routesPrunedAt = 0;
    const learn = (cid, target, from, forwarded) => {
      const now = Date.now();
      if (now - routesPrunedAt > 1000) {
        routesPrunedAt = now;
        for (const [k, v] of routes) if (now - v.ts > CLOCK_SKEW_MS * 2) routes.delete(k);
      }
      if (!routes.has(cid) && routes.size >= ROUTES_MAX) return { id: target, via: liveRpc(target) ? target : null };
      const r = routes.get(cid) || { sides: [], ts: now };
      let t = r.sides.find(x => x.id === target) || r.sides.find(x => x.id === null);
      if (!t) { t = { id: target, via: null }; r.sides.push(t); }
      t.id = target;
      if (liveRpc(target)) t.via = target;
      let o = r.sides.find(x => x !== t);
      if (!o) { o = { id: forwarded ? null : from, via: from }; r.sides.push(o); }
      else if (!o.via) o.via = from;
      r.ts = now;
      routes.set(cid, r);
      return t;
    };
    let seenPrunedAt = 0;
    const directRings = new Map();
    const ringBudget = new Map();
    const trimOldest = (map, max) => { while (map.size > max) map.delete(map.keys().next().value); };
    const firstSeen = (callId) => {
      const now = Date.now();
      if (now - seenPrunedAt > 1000) {
        seenPrunedAt = now;
        for (const [k, t] of seenCalls) if (now - t > CLOCK_SKEW_MS * 2) seenCalls.delete(k);
        for (const [k, t] of directRings) if (now - t > CLOCK_SKEW_MS * 2) directRings.delete(k);
        for (const [k, list] of ringBudget) { const live = list.filter(t => now - t < RING_WINDOW_MS); if (live.length) ringBudget.set(k, live); else ringBudget.delete(k); }
      }
      if (seenCalls.has(callId)) return false;
      seenCalls.set(callId, now);
      trimOldest(seenCalls, SEEN_MAX);
      trimOldest(directRings, SEEN_MAX);
      return true;
    };
    const callerAllowed = (from) => {
      const now = Date.now();
      const list = (ringBudget.get(from) || []).filter(t => now - t < RING_WINDOW_MS);
      if (list.length >= RING_PER_WINDOW) { ringBudget.set(from, list); return false; }
      list.push(now);
      ringBudget.set(from, list);
      trimOldest(ringBudget, SEEN_MAX);
      return true;
    };

    const emit = (ev) => { for (const p of subscribers) p.push(ev); };
    const snapshot = () => call ? {
      id: call.id, peer: call.peer, dir: call.dir, phase: call.phase,
      startedAt: call.startedAt, answeredAt: call.answeredAt || 0, ringUntil: call.ringUntil || 0,
      muted: !!call.muted, silenced: silenced.has(call.peer), recordingStartedAt: call.recordingStartedAt || 0,
      reached: call.group ? call.legs.some(l => l.reached) : !!call.reached, why: call.why || '', codec: call.codec || '',
      video: !!call.video, cam: !!call.cam, peerCam: !!call.peerCam, videoAvailable: videoOn(),
      ...(call.group ? { group: true, peers: call.legs.map(l => ({ id: l.peer, phase: l.phase, reached: !!l.reached, silenced: silenced.has(l.peer) })) } : {})
    } : null;
    const changed = () => emit({ type: 'state', state: snapshot() });
    const stopTone = (c) => { if (c.tone) { c.tone.stop(); c.tone = null; } };
    const stopRecorder = (c) => { clearTimeout(c.recDelay); clearTimeout(c.recWarn); if (c.recorder) { c.recorder.stop(); c.recorder = null; } clearTimeout(c.recTimer); };
    const startRecording = (c) => {
      const max = voicemailMaxMs * RATE * 2 / 1000;
      c.rec = { chunks: [], bytes: 0 };
      c.phase = 'recording';
      c.recordingStartedAt = Date.now() + BEEP_MS + 400;
      playBeep(audio);
      c.recDelay = setTimeout(() => {
        if (call !== c || c.phase !== 'recording') return;
        c.recordingStartedAt = Date.now();
        c.recorder = audio.capture((pcm) => {
          if (!c.rec || c.rec.bytes >= max) return;
          const take = Buffer.from(pcm.subarray(0, Math.max(0, max - c.rec.bytes)));
          c.rec.chunks.push(take);
          c.rec.bytes += take.length;
        });
        if (voicemailMaxMs > pamWarnMs) c.recWarn = setTimeout(() => { if (call === c && c.phase === 'recording') playBeep(audio, 2); }, voicemailMaxMs - pamWarnMs);
        c.recTimer = setTimeout(() => {
          if (call !== c || c.phase !== 'recording') return;
          stopRecorder(c);
          c.phase = 'recorded';
          changed();
          emit({ type: 'recordLimit', id: c.id });
        }, voicemailMaxMs);
        changed();
      }, BEEP_MS + 400);
    };
    const finish = (outcome) => {
      const c = call;
      if (!c) return;
      call = null;
      clearTimeout(c.timer);
      stopTone(c);
      stopRecorder(c);
      if (c.media) c.media.stop();
      stopCallVideo(c);
      if (c.group) {
        for (const leg of c.legs) { clearTimeout(leg.timer); if (leg.out) { try { leg.out.end(); } catch (_) {} } }
        if (c.mixer) c.mixer.stop();
        for (const leg of c.legs) { if (leg.enc) leg.enc.free(); if (leg.dec) leg.dec.free(); }
      }
      emit({ type: 'ended', call: { id: c.id, peer: c.peer, ...(c.group ? { peers: c.legs.map(l => l.peer) } : {}), dir: c.dir, startedAt: c.startedAt, answeredAt: c.answeredAt || 0, endedAt: Date.now(), outcome } });
      changed();
    };
    const liveRpc = (id) => {
      const list = server.peers && server.peers[id];
      return Array.isArray(list) ? list.find(r => r && !r.closed && r.phone) || null : null;
    };
    const sendVia = (via, to, method, payload, cb = () => {}) => {
      try {
        if (via) {
          const r = liveRpc(via);
          const sealed = seal(payload, to);
          if (!r || !sealed) return cb(new Error('no-connection'));
          return r.phone.relay({ to, method, cid: payload.callId, sealed }, cb);
        }
        const r = liveRpc(to);
        if (!r) return cb(new Error('no-connection'));
        return r.phone[method](payload, cb);
      } catch (err) { cb(err); }
    };
    const notifyHangup = (c) => {
      const ts = Date.now();
      const payload = { callId: c.id, from: server.id, ts, sig: signParts(keys, ['hangup', c.id, c.peer, ts]) };
      if (c.phase === 'calling' && c.dir === 'out') {
        for (const via of c.paths || []) sendVia(via, c.peer, 'hangup', payload, (err) => dbg('hangup sent', sid(c.peer), via ? 'via ' + sid(via) : 'direct', err ? 'error ' + err.message : 'ok'));
      } else {
        sendVia(c.via || null, c.peer, 'hangup', payload, (err) => dbg('hangup sent', sid(c.peer), c.via ? 'via ' + sid(c.via) : 'direct', err ? 'error ' + err.message : 'ok'));
      }
    };
    const senderOf = (rpcCtx, payload) => {
      const direct = rpcCtx && rpcCtx.id;
      const claimed = payload && isFeedId(payload.from) ? payload.from : direct;
      return { sender: claimed, via: claimed && direct && claimed !== direct ? direct : null };
    };
    const netFirst = (entries) => entries.slice().sort((x, y) => (/^onion:/.test(String(x && x[0])) ? 1 : 0) - (/^onion:/.test(String(y && y[0])) ? 1 : 0));
    const reach = (id, done) => {
      const now = liveRpc(id);
      if (now) return done(now);
      let entries = [];
      try { entries = netFirst(server.conn.query().peersAll()); } catch (_) {}
      const hit = entries.find(e => Array.isArray(e) && e[0] && e[1] && e[1].key === id);
      if (!hit) return done(null);
      try {
        server.conn.connect(hit[0], (err, rpc) => done(!err && rpc && rpc.phone ? rpc : liveRpc(id)));
      } catch (_) { done(null); }
    };
    const relayCandidates = (target) => knownPubs().filter(id => id !== target);

    const calleePubs = (target, done) => {
      if (!server.friends || typeof server.friends.hops !== 'function' || !server.conn || typeof server.conn.query !== 'function') return done([]);
      try {
        server.friends.hops({ start: target, max: 1 }, (err, hops) => {
          if (err || !hops) return done([]);
          let entries = [];
          try { entries = netFirst(server.conn.dbPeers().concat(server.conn.query().peersAll())); } catch (_) {}
          const seen = new Set();
          done(entries
            .filter(e => Array.isArray(e) && e[0] && e[1] && e[1].type === 'pub' && hops[e[1].key] === 1 && !liveRpc(e[1].key) && !seen.has(e[1].key) && seen.add(e[1].key))
            .slice(0, 5)
            .map(e => ({ address: e[0], key: e[1].key })));
        });
      } catch (_) { done([]); }
    };

    const ringPaths = (holder, target, req, alive, onReached, legacy = false) => {
      dbg('ring', sid(target), 'legacy=' + legacy, 'live-pubs=' + knownPubs().map(sid).join(','));
      reach(target, (rpc) => {
        dbg('direct', sid(target), rpc ? 'reachable' : 'unreachable');
        if (!alive() || !rpc) return;
        holder.paths.push(null);
        if (legacy) onReached();
        sendVia(null, target, 'ring', req, (err) => { dbg('direct ring', sid(target), err ? 'error ' + err.message : 'delivered'); if (!err && alive()) onReached(); });
      });
      for (const via of relayCandidates(target)) {
        holder.paths.push(via);
        sendVia(via, target, 'ring', req, (err) => dbg('relay via', sid(via), err ? 'error ' + err.message : 'accepted'));
      }
      calleePubs(target, (pubs) => {
        dbg('callee pubs', pubs.map(p => sid(p.key) + '@' + p.address).join(' ') || 'none');
        for (const entry of pubs) {
          try {
            server.conn.connect(entry.address, (err) => {
              dbg('connect callee pub', sid(entry.key), err ? 'failed ' + err.message : 'ok');
              if (err || !alive()) return;
              holder.paths.push(entry.key);
              sendVia(entry.key, target, 'ring', req, (e2) => dbg('relay via callee pub', sid(entry.key), e2 ? 'error ' + e2.message : 'accepted'));
            });
          } catch (_) {}
        }
      });
    };
    const ringRequest = (callId, eph, target) => {
      const ts = Date.now();
      const ephPk = b64(eph.publicKey);
      return { callId, from: server.id, to: target, ephPk, ts, sig: signParts(keys, ['ring', callId, ephPk, target, ts]), codecs: codecsOffered() };
    };

    const legOf = (c, callId) => (c && c.group ? c.legs.find(l => l.id === callId) || null : null);
    const toVoicemail = (c, why) => {
      if (call !== c || c.phase !== 'calling') return;
      dbg('voicemail', sid(c.peer), why, 'reached=' + !!c.reached);
      clearTimeout(c.timer);
      stopTone(c);
      if (why !== 'busy') notifyHangup(c);
      c.why = why;
      startRecording(c);
      changed();
    };
    const reachedCall = (c) => {
      if (call !== c || c.phase !== 'calling' || c.reached) return;
      dbg('reached', sid(c.peer), 'now ringing there');
      c.reached = true;
      c.ringUntil = Date.now() + ringMs;
      stopTone(c);
      c.tone = startTone(audio, 'ringback');
      clearTimeout(c.timer);
      c.timer = setTimeout(() => toVoicemail(c, 'noanswer'), ringMs);
      changed();
    };
    const reachedLeg = (c, leg) => {
      if (call !== c || leg.phase !== 'calling' || leg.reached) return;
      leg.reached = true;
      clearTimeout(leg.timer);
      leg.timer = setTimeout(() => { if (call === c && leg.phase === 'calling') dropLeg(c, leg, true); }, ringMs);
      if (c.phase === 'calling' && !c.ringing) { stopTone(c); c.ringing = true; c.tone = startTone(audio, 'ringback'); c.ringUntil = Date.now() + ringMs; }
      changed();
    };
    const ringingAck = (c, req, from, cb) => {
      const target = c && c.group ? legOf(c, req.callId) : c;
      if (!target || c.dir !== 'out' || target.phase !== 'calling' || from !== target.peer || req.callId !== target.id) return cb(new Error('no-call'));
      if (Math.abs(Date.now() - Number(req.ts)) > CLOCK_SKEW_MS || !verifyParts(from, ['ringing', req.callId, req.ringing, server.id, req.ts], req.sig)) return cb(new Error('rejected'));
      cb(null, true);
      if (req.ringing === 'busy') {
        if (c.group) { target.reached = true; return dropLeg(c, target, false); }
        c.reached = true;
        return toVoicemail(c, 'busy');
      }
      if (c.group) reachedLeg(c, target);
      else reachedCall(c);
    };
    const hangupLeg = (leg) => {
      const ts = Date.now();
      const payload = { callId: leg.id, from: server.id, ts, sig: signParts(keys, ['hangup', leg.id, leg.peer, ts]) };
      if (leg.phase === 'calling') for (const via of leg.paths) sendVia(via, leg.peer, 'hangup', payload);
      else sendVia(leg.via || null, leg.peer, 'hangup', payload);
    };
    const settleGroup = (c) => {
      if (call !== c) return;
      if (c.legs.some(l => l.phase === 'connected' || l.phase === 'calling')) return changed();
      finish(c.answeredAt ? 'ended' : 'noanswer');
    };
    const dropLeg = (c, leg, notify) => {
      if (leg.phase === 'gone') return;
      if (notify) hangupLeg(leg);
      clearTimeout(leg.timer);
      leg.phase = 'gone';
      if (leg.out) { try { leg.out.end(); } catch (_) {} leg.out = null; }
      if (leg.enc) leg.enc.free();
      if (leg.dec) leg.dec.free();
      leg.queue = [];
      settleGroup(c);
    };
    const startMixer = (c) => {
      if (c.mixer) return;
      const player = audio.player();
      const samples = FRAME_BYTES / 2;
      let pending = Buffer.alloc(0);
      const capture = audio.capture((pcm) => {
        if (call !== c) return;
        pending = pending.length ? Buffer.concat([pending, pcm]) : Buffer.from(pcm);
        while (pending.length >= FRAME_BYTES) {
          const mic = pending.subarray(0, FRAME_BYTES);
          pending = pending.subarray(FRAME_BYTES);
          const legs = c.legs.filter(l => l.phase === 'connected' && l.out);
          const heard = legs.map(l => l.queue.shift() || null);
          const all = new Int32Array(samples);
          heard.forEach((f, i) => { if (f && !silenced.has(legs[i].peer)) mixInto(all, f); });
          player.write(clampPcm(all));
          legs.forEach((leg, i) => {
            const acc = new Int32Array(samples);
            if (!c.muted) mixInto(acc, mic);
            heard.forEach((f, j) => { if (f && j !== i) mixInto(acc, f); });
            leg.out.push(leg.seal(leg.enc.encode(clampPcm(acc))));
          });
        }
      });
      c.mixer = { stop() { capture.stop(); player.stop(); } };
    };
    const startLegMedia = (c, leg, duplex) => {
      const open = opener(leg.keys.b2a);
      leg.seal = sealer(leg.keys.a2b);
      leg.enc = makeEncoder(leg.codec);
      leg.dec = makeDecoder();
      leg.out = Pushable(() => {});
      leg.queue = [];
      pull(leg.out, duplex.sink);
      pull(duplex.source, pull.drain((frame) => {
        const plain = open(Buffer.isBuffer(frame) ? frame : Buffer.from(frame || []));
        if (!plain || leg.phase !== 'connected') return;
        leg.queue.push(leg.dec.decode(plain));
        if (leg.queue.length > MIX_QUEUE) leg.queue.shift();
      }, () => { if (call === c) dropLeg(c, leg, false); }));
      startMixer(c);
    };
    const groupCall = (targets, legacy, cb) => {
      const startedAt = Date.now();
      const c = { id: nodeCrypto.randomBytes(16).toString('hex'), peer: targets[0], dir: 'out', group: true, phase: 'calling', startedAt, ringUntil: startedAt + ringMs, legs: [] };
      call = c;
      c.tone = startTone(audio, 'connecting');
      for (const peer of targets) {
        const leg = { id: nodeCrypto.randomBytes(16).toString('hex'), peer, phase: 'calling', eph: sodium.crypto_box_keypair(), paths: [], via: null, queue: [] };
        c.legs.push(leg);
        leg.timer = setTimeout(() => { if (call === c && leg.phase === 'calling') dropLeg(c, leg, true); }, ringMs);
        ringPaths(leg, peer, ringRequest(leg.id, leg.eph, peer), () => call === c && leg.phase === 'calling', () => reachedLeg(c, leg), legacy.has(peer));
      }
      changed();
      cb(null, snapshot());
    };
    const groupAnswer = (c, req, from, via, cb) => {
      const leg = legOf(c, req && req.callId);
      if (!leg || leg.phase !== 'calling' || from !== leg.peer) return cb(new Error('no-call'));
      const calleePk = ephKey(req.ephPk);
      if (!calleePk || !verifyParts(from, ['answer', req.callId, req.ephPk, server.id, req.ts], req.sig)) return cb(new Error('rejected'));
      const path = via ? liveRpc(via) : liveRpc(from);
      if (!path) return cb(new Error('no-connection'));
      leg.keys = deriveKeys(leg.eph.secretKey, calleePk, leg.id, Buffer.from(leg.eph.publicKey), calleePk);
      leg.codec = pickCodec([req.codec]);
      clearTimeout(leg.timer);
      leg.via = via;
      leg.phase = 'connected';
      leg.answeredAt = Date.now();
      if (c.phase === 'calling') { stopTone(c); c.phase = 'connected'; c.answeredAt = leg.answeredAt; }
      cb(null, true);
      changed();
      const quiet = () => {};
      startLegMedia(c, leg, via ? path.phone.relayAudio({ to: leg.peer, callId: leg.id }, quiet) : path.phone.audio({ callId: leg.id }, quiet));
    };

    const startMedia = (c, duplex, role) => {
      const seal = sealer(role === 'out' ? c.keys.a2b : c.keys.b2a);
      const open = opener(role === 'out' ? c.keys.b2a : c.keys.a2b);
      const out = Pushable(() => {});
      const player = audio.player();
      const enc = makeEncoder(c.codec);
      const dec = makeDecoder();
      let pending = Buffer.alloc(0);
      const capture = audio.capture((pcm) => {
        if (call !== c || c.phase !== 'connected') return;
        pending = pending.length ? Buffer.concat([pending, pcm]) : Buffer.from(pcm);
        while (pending.length >= FRAME_BYTES) {
          const frame = pending.subarray(0, FRAME_BYTES);
          pending = pending.subarray(FRAME_BYTES);
          if (!c.muted) out.push(seal(enc.encode(frame)));
        }
      });
      const incoming = [];
      c.audioLag = () => incoming.length * FRAME_MS;
      const pace = setInterval(() => {
        if (call !== c) return;
        if (incoming.length > MIX_QUEUE) incoming.splice(0, incoming.length - MIX_QUEUE);
        const next = incoming.shift();
        if (next) player.write(next);
      }, FRAME_MS);
      if (pace.unref) pace.unref();
      const sink = pull.drain((frame) => {
        const plain = open(Buffer.isBuffer(frame) ? frame : Buffer.from(frame || []));
        if (plain && !silenced.has(c.peer)) incoming.push(dec.decode(plain));
      }, () => { if (call === c) finish('ended'); });
      c.media = { stop() { clearInterval(pace); try { out.end(); } catch (_) {} capture.stop(); player.stop(); enc.free(); dec.free(); } };
      if (!duplex) return { source: out, sink };
      pull(out, duplex.sink);
      pull(duplex.source, sink);
      return null;
    };

    const peerFrameSeen = (c) => {
      clearTimeout(c.peerTimer);
      c.peerTimer = setTimeout(() => { if (call === c && c.peerCam) { c.peerCam = false; endFrames(c.peer); changed(); } }, VIDEO_HOLD_MS);
      if (c.peerTimer.unref) c.peerTimer.unref();
      if (!c.peerCam) { c.peerCam = true; changed(); }
    };
    const startVideo = (c, duplex, role) => {
      const seal = sealer(role === 'out' ? c.keys.va2b : c.keys.vb2a);
      const open = opener(role === 'out' ? c.keys.vb2a : c.keys.va2b);
      const out = Pushable(() => {});
      const assemble = videoAssembler();
      const sink = pull.drain((frame) => {
        const plain = open(Buffer.isBuffer(frame) ? frame : Buffer.from(frame || []));
        if (!plain || call !== c) return;
        const got = assemble(plain);
        if (got === 'off') { clearTimeout(c.peerTimer); if (c.peerCam) { c.peerCam = false; endFrames(c.peer); changed(); } return; }
        if (!got) return;
        peerFrameSeen(c);
        const hold = setTimeout(() => { if (call === c && c.peerCam) publishFrame(c.peer, got); }, typeof c.audioLag === 'function' ? c.audioLag() : 0);
        if (hold.unref) hold.unref();
      }, () => { if (call === c) stopCallVideo(c); });
      c.vmedia = { out, seal, stop() { try { out.end(); } catch (_) {} } };
      if (!duplex) return { source: out, sink };
      pull(out, duplex.sink);
      pull(duplex.source, sink);
      return null;
    };
    const stopCallVideo = (c) => {
      clearTimeout(c.peerTimer);
      if (c.cam) { c.cam = false; stopCam(); }
      if (c.vmedia) { c.vmedia.stop(); c.vmedia = null; }
      endFrames(c.peer);
      c.peerCam = false;
    };
    const sendCallVideo = (c, plain) => { if (c.vmedia) c.vmedia.out.push(c.vmedia.seal(plain)); };

    const deliver = (m, frame, droppable) => {
      if (droppable && m.sent - m.acked > HUB_LAG_MAX) return;
      m.sent++;
      m.out.push(frame);
    };
    const hubBroadcast = (r, from, frame, droppable) => {
      for (const [slot, m] of r.members) {
        if (slot !== from) deliver(m, frame, droppable);
      }
    };
    const hubHumans = (h) => [...h.members.values()].filter(m => !m.viewer).length;
    const hubAttach = (rid, id, out, scope = null, viewer = false) => {
      let r = hubRooms.get(rid);
      if (!r) {
        if (hubRooms.size >= HUB_ROOMS_MAX) return null;
        if (scope && [...hubRooms.values()].filter(h => h.scope === scope).length >= HUB_RIDS_PER_ROOM) return null;
        r = { members: new Map(), scope };
        hubRooms.set(rid, r);
      }
      if (scope && r.scope !== scope) return null;
      for (const old of [...r.members.values()]) if (old.id === id) old.kick();
      if (!hubRooms.has(rid)) hubRooms.set(rid, r);
      if (r.members.size >= roomMax) return null;
      let slot = 0;
      while (r.members.has(slot)) slot++;
      const peers = [...r.members].map(([s, m]) => (m.viewer ? { slot: s, id: m.id, viewer: true } : { slot: s, id: m.id }));
      const m = { id, out, sent: 0, acked: 0, viewer: !!viewer };
      m.leave = () => {
        if (r.members.get(slot) !== m) return;
        r.members.delete(slot);
        if (r.members.size) hubBroadcast(r, slot, ctrlFrame({ t: 'leave', slot }), false);
        else if (hubRooms.get(rid) === r) hubRooms.delete(rid);
      };
      m.kick = () => { m.leave(); try { out.end(); } catch (_) {} };
      m.handle = (frame) => {
        if (r.members.get(slot) !== m || frame.length < 2) return;
        const kind = frame[0];
        if (kind === K_VIDEO) {
          if (frame.length > ROOM_VIDEO_FRAME_MAX || policy().video === false) return;
          const at = Date.now();
          if (at - (m.vwindowAt || 0) >= 1000) { m.vwindowAt = at; m.vbytes = 0; }
          m.vbytes = (m.vbytes || 0) + frame.length;
          if (m.vbytes > ROOM_VIDEO_BYTES_PER_S) return;
          hubBroadcast(r, slot, Buffer.concat([Buffer.from([K_VIDEO, slot]), frame.subarray(1)]), true);
          return;
        }
        if (frame.length > ROOM_FRAME_MAX) return;
        if (kind === K_CTRL) {
          let msg = null;
          try { msg = JSON.parse(frame.subarray(1).toString('utf8')); } catch (_) {}
          if (msg && msg.t === 'bye') return m.kick();
          const n = msg && msg.t === 'ack' ? Number(msg.n) : NaN;
          if (Number.isFinite(n) && n > m.acked && n <= m.sent) m.acked = n;
          return;
        }
        const now = Date.now();
        if (now - (m.windowAt || 0) >= 1000) { m.windowAt = now; m.windowCount = 0; }
        if (++m.windowCount > ROOM_RATE_MAX) return;
        if (kind === K_AUDIO || kind === K_DATA) {
          hubBroadcast(r, slot, Buffer.concat([Buffer.from([kind, slot]), frame.subarray(1)]), true);
        } else if (kind === K_KEY && frame.length > 2 && frame[1] !== slot) {
          const target = r.members.get(frame[1]);
          if (target) deliver(target, Buffer.concat([Buffer.from([K_KEY, slot]), frame.subarray(2)]), false);
        }
      };
      r.members.set(slot, m);
      deliver(m, ctrlFrame({ t: 'hello', slot, peers, max: roomMax, video: policy().video !== false }), false);
      hubBroadcast(r, slot, ctrlFrame(viewer ? { t: 'join', slot, id, viewer: true } : { t: 'join', slot, id }), false);
      return m;
    };
    const hubDuplex = (from, opts) => {
      let member = null;
      let closed = false;
      const out = Pushable(() => { closed = true; if (member) member.leave(); });
      const sink = pull.drain((frame) => {
        if (member) member.handle(Buffer.isBuffer(frame) ? frame : Buffer.from(frame || []));
      }, () => { closed = true; if (member) member.leave(); try { out.end(); } catch (_) {} });
      const refuse = (t) => { out.push(ctrlFrame({ t })); out.end(); };
      const rid = String((opts && opts.rid) || '');
      const roomId = String((opts && opts.roomId) || '');
      const tokenOk = roomId ? (RID.test(roomId) && verifyParts(opts.owner, ['room', roomId], opts.token)) : verifyParts(opts.owner, ['room', rid], opts.token);
      if (!from || !RID.test(rid) || !isFeedId(opts.owner) || !tokenOk) {
        refuse('refused');
        return { source: out, sink };
      }
      const admit = () => {
        if (closed) return;
        member = hubAttach(rid, from, out, roomId ? `${opts.owner}|${roomId}` : null, opts.viewer === true);
        if (!member) refuse('full');
      };
      if (opts.owner === server.id || from === server.id) admit();
      else relayAllowed(opts.owner, from, (ok) => (ok ? admit() : refuse('refused')));
      return { source: out, sink };
    };

    const viewers = new Map();
    const active = (r) => !!r && (r === room || viewers.get(r.rid) === r);
    const touched = (r) => { if (r === room) roomChanged(); };
    const humansIn = (r) => [...r.peers.values()].filter(p => !p.viewer).length;
    const roomSnapshot = () => {
      const r = room;
      if (!r) return null;
      const now = Date.now();
      return {
        rid: r.rid, ref: r.ref, title: r.title, phase: r.phase, joinedAt: r.joinedAt, muted: !!r.muted, hand: !!r.hand, handSince: r.hand ? r.handAt : 0,
        secure: !!r.kid, count: humansIn(r) + 1, max: r.max, public: [...r.peers.values()].some(p => p.viewer), speaking: now - r.sentAt < 1000,
        cam: !!r.cam, videoAvailable: videoOn() && r.hubVideo === true, grid: !!sharpLib, gridOrder: gridIds(r),
        streaming: r.stream ? r.stream.name : null, streamAvailable: fileStreamOn() && r.hubVideo === true,
        notify: !!r.notify, recording: !!r.rec, recordingSince: r.rec ? r.rec.at : 0, recordingBy: [...r.recPeers],
        events: r.notify ? r.events.slice(-ROOM_EVENTS_MAX) : [],
        peers: [...r.peers.values()].map(p => ({ id: p.id, speaking: now - p.heardAt < 1000, muted: now - p.mutedAt < MUTE_TTL_MS, hand: now - (p.handBeat || 0) < MUTE_TTL_MS, handSince: p.handSince || 0, silenced: silenced.has(p.id), recording: r.recPeers.has(p.id), cam: now - (p.frameAt || 0) < VIDEO_HOLD_MS, film: now - (p.filmAt || 0) < VIDEO_HOLD_MS, viewer: !!p.viewer }))
      };
    };
    const roomChanged = () => emit({ type: 'room', room: roomSnapshot() });
    const pushEvent = (r, t, id) => {
      r.events.push({ t, id, ts: Date.now() });
      if (r.events.length > ROOM_EVENTS_MAX) r.events.splice(0, r.events.length - ROOM_EVENTS_MAX);
      touched(r);
    };
    const startRoomRec = (r) => {
      if (!r || r.rec || r.phase !== 'live') return false;
      try {
        fs.mkdirSync(recDir, { recursive: true, mode: 0o700 });
        try { fs.chmodSync(recDir, 0o700); } catch (_) {}
        const file = path.join(recDir, `${recordingPrefix(r.ref)}-${Date.now()}.wav`);
        const fd = fs.openSync(file, 'w', 0o600);
        fs.writeSync(fd, wavFile(Buffer.alloc(0)));
        r.rec = { fd, file, bytes: 0, at: Date.now() };
      } catch (_) { return false; }
      sendRoomData(r, { t: 'rec', on: true });
      playChime(audio, 'recStart');
      pushEvent(r, 'recStart', server.id);
      return true;
    };
    const stopRoomRec = (r) => {
      if (!r || !r.rec) return false;
      const rec = r.rec;
      r.rec = null;
      try {
        const h = Buffer.alloc(4);
        h.writeUInt32LE(36 + rec.bytes, 0); fs.writeSync(rec.fd, h, 0, 4, 4);
        h.writeUInt32LE(rec.bytes, 0); fs.writeSync(rec.fd, h, 0, 4, 40);
        fs.closeSync(rec.fd);
        if (!rec.bytes) fs.unlinkSync(rec.file);
      } catch (_) {}
      if (room === r) {
        sendRoomData(r, { t: 'rec', on: false });
        playChime(audio, 'recStop');
        pushEvent(r, 'recStop', server.id);
      }
      if (rec.bytes) emit({ type: 'roomRecorded', room: { ref: r.ref, title: r.title }, file: rec.file, bytes: rec.bytes, durationMs: Math.round(rec.bytes / (RATE * 2) * 1000) });
      return true;
    };
    const keeperSlot = (r) => r.order[0];
    const trimKeys = (r) => { while (r.keys.size > 3) r.keys.delete(r.keys.keys().next().value); };
    const useKey = (r, kid, key) => {
      if (r.kid === kid && r.sealer && r.keys.get(kid) && r.keys.get(kid).equals(key)) return;
      r.keys.set(kid, key);
      trimKeys(r);
      r.kid = kid;
      r.sealer = sealer(key);
      sendCodecs(r);
    };
    const newRoomKey = (r) => useKey(r, nodeCrypto.randomBytes(4).toString('hex'), nodeCrypto.randomBytes(32));
    const sendRoomKey = (r, slot) => {
      const p = r.peers.get(slot);
      const key = r.kid && r.keys.get(r.kid);
      if (!p || !key) return;
      const ts = Date.now();
      const sealed = seal({ rid: r.rid, kid: r.kid, key: b64(key), from: server.id, ts, sig: signParts(keys, ['roomkey', r.rid, r.kid, p.id, ts]) }, p.id);
      if (sealed) r.out.push(Buffer.concat([Buffer.from([K_KEY, slot]), Buffer.from(sealed)]));
    };
    const peerEntry = (id, viewer = false) => ({ id, viewer: !!viewer, queue: [], openers: new Map(), heardAt: 0, mutedAt: 0, dec: null, opus: false, greeted: false });
    const dropPeer = (r, slot) => { const p = r.peers.get(slot); if (p) { if (p.dec) p.dec.free(); clearTimeout(p.vtimer); clearTimeout(p.ftimer); endFrames(r.tag + p.id); endFrames(r.tag + filmKey(p.id)); gridNote(r, p.id, null); gridNote(r, filmKey(p.id), null); } r.peers.delete(slot); };
    const sendCodecs = (r) => { if (r.out && r.sealer && codecsOffered().length) sendRoomData(r, { t: 'codecs', codecs: codecsOffered() }); };
    const onRoomCtrl = (r, msg) => {
      if (msg.t === 'hello' && r.slot === null) {
        r.slot = Number(msg.slot);
        r.max = Number(msg.max) > 0 ? Number(msg.max) : ROOM_MAX;
        r.hubVideo = msg.video === true;
        for (const p of Array.isArray(msg.peers) ? msg.peers : []) {
          if (!p || !isFeedId(p.id)) continue;
          r.peers.set(Number(p.slot), peerEntry(p.id, p.viewer === true));
          r.order.push(Number(p.slot));
        }
        r.order.push(r.slot);
        if (r.peers.size >= roomQuietAt) r.muted = true;
        if (!r.static && keeperSlot(r) === r.slot) newRoomKey(r);
        r.phase = 'live';
        if (r.ready) return r.ready(null);
      } else if (msg.t === 'join' && isFeedId(msg.id)) {
        const slot = Number(msg.slot);
        dropPeer(r, slot);
        r.peers.set(slot, peerEntry(msg.id, msg.viewer === true));
        r.order = r.order.filter(s => s !== slot).concat(slot);
        if (!r.static && keeperSlot(r) === r.slot) sendRoomKey(r, slot);
        if (r.notify && msg.viewer !== true) playChime(audio, 'join');
        pushEvent(r, 'join', msg.id);
      } else if (msg.t === 'leave') {
        const slot = Number(msg.slot);
        const wasKeeper = keeperSlot(r) === slot;
        const gone = r.peers.get(slot);
        dropPeer(r, slot);
        r.order = r.order.filter(s => s !== slot);
        if (gone) {
          if (r.recPeers.delete(gone.id)) pushEvent(r, 'recStop', gone.id);
          if (r.notify) playChime(audio, 'leave');
          pushEvent(r, 'leave', gone.id);
        }
        if (!r.static && keeperSlot(r) === r.slot && (wasKeeper || !r.kid)) {
          newRoomKey(r);
          for (const s of r.peers.keys()) sendRoomKey(r, s);
        }
      } else if (msg.t === 'full' || msg.t === 'refused') {
        if (r.ready) return r.ready(new Error(msg.t));
      }
      touched(r);
    };
    const onRoomKey = (r, slot, payload) => {
      const p = r.peers.get(slot);
      if (r.static || !p || keeperSlot(r) !== slot) return;
      const msg = unseal(payload.toString('utf8'));
      if (!msg || msg.rid !== r.rid || msg.from !== p.id || !/^[0-9a-f]{8}$/.test(String(msg.kid))) return;
      if (!verifyParts(p.id, ['roomkey', r.rid, msg.kid, server.id, msg.ts], msg.sig)) return;
      const key = Buffer.from(String(msg.key || ''), 'base64');
      if (key.length !== 32) return;
      useKey(r, msg.kid, key);
      touched(r);
    };
    const openRoomFrame = (r, p, payload) => {
      if (!p || payload.length < 44) return null;
      const kid = payload.subarray(0, 4).toString('hex');
      const key = r.keys.get(kid);
      if (!key) return null;
      let open = p.openers.get(kid);
      if (!open) { open = opener(key); p.openers.set(kid, open); }
      return open(payload.subarray(4));
    };
    const sendRoomData = (r, msg) => {
      if (!r.sealer) return;
      r.out.push(Buffer.concat([Buffer.from([K_DATA]), Buffer.from(r.kid, 'hex'), r.sealer(Buffer.from(JSON.stringify(msg)))]));
      r.beaconAt = Date.now();
    };
    const onRoomAudio = (r, slot, payload) => {
      const p = r.peers.get(slot);
      const plain = openRoomFrame(r, p, payload);
      if (!plain) return;
      if (!p.dec) p.dec = makeDecoder();
      p.queue.push(p.dec.decode(plain));
      if (p.queue.length > MIX_QUEUE) p.queue.shift();
      p.heardAt = Date.now();
      p.mutedAt = 0;
      noteMute(r, p, false);
    };
    const noteMute = (r, p, on, quiet = false) => {
      if (!!p.muted === on) return;
      p.muted = on;
      if (quiet) return touched(r);
      const now = Date.now();
      const announce = now - (p.muteToggleAt || 0) >= REC_TOGGLE_MIN_MS;
      p.muteToggleAt = now;
      if (!announce) return touched(r);
      if (r.notify) playChime(audio, on ? 'mute' : 'unmute');
      pushEvent(r, on ? 'mute' : 'unmute', p.id);
    };
    const noteHand = (r, p, on, at, quiet = false) => {
      if (!!p.hand === on) return;
      p.hand = on;
      const now = Date.now();
      p.handSince = on ? (quiet && Number.isFinite(at) && at > 0 ? Math.min(at, now) : now) : 0;
      if (!on || quiet) return touched(r);
      const announce = now - (p.handToggleAt || 0) >= REC_TOGGLE_MIN_MS;
      p.handToggleAt = now;
      if (!announce) return touched(r);
      if (r.notify) playChime(audio, 'hand');
      pushEvent(r, 'hand', p.id);
    };
    const onRoomData = (r, slot, payload) => {
      const p = r.peers.get(slot);
      const plain = openRoomFrame(r, p, payload);
      if (!plain) return;
      let msg = null;
      try { msg = JSON.parse(plain.toString('utf8')); } catch (_) {}
      if (msg && msg.t === 'codecs') {
        p.opus = Array.isArray(msg.codecs) && msg.codecs.includes('opus');
        if (!p.greeted) { p.greeted = true; sendCodecs(r); }
        return;
      }
      if (msg && msg.t === 'rec') {
        const was = r.recPeers.has(p.id);
        if (!!msg.on === was) return;
        const now = Date.now();
        const announce = now - (p.recToggleAt || 0) >= REC_TOGGLE_MIN_MS;
        p.recToggleAt = now;
        if (msg.on) r.recPeers.add(p.id); else r.recPeers.delete(p.id);
        if (announce) { playChime(audio, msg.on ? 'recStart' : 'recStop'); pushEvent(r, msg.on ? 'recStart' : 'recStop', p.id); }
        else touched(r);
        return;
      }
      if (msg && msg.t === 'hand') {
        p.handBeat = msg.on ? Date.now() : 0;
        noteHand(r, p, !!msg.on, Number(msg.at), msg.beacon === true);
        return;
      }
      if (!msg || msg.t !== 'mute') return;
      p.mutedAt = msg.on ? Date.now() : 0;
      noteMute(r, p, !!msg.on, msg.beacon === true);
    };
    const gridIds = (r) => {
      const now = Date.now();
      const ids = [];
      if (r.cam) ids.push(server.id);
      if (r.stream) ids.push(filmKey(server.id));
      for (const slot of r.order) {
        const p = r.peers.get(slot);
        if (!p) continue;
        if (now - (p.frameAt || 0) < VIDEO_HOLD_MS) ids.push(p.id);
        if (now - (p.filmAt || 0) < VIDEO_HOLD_MS) ids.push(filmKey(p.id));
      }
      return ids;
    };
    const newGrid = () => ({ frames: new Map(), busy: false, dirty: false, timer: null });
    const composeGrid = async (r) => {
      const g = r.grid;
      const ids = gridIds(r).filter(id => g.frames.has(id));
      if (!ids.length) {
        if (r.tag && !g.empty) { g.empty = true; const b = await blankFrame(); if (b && active(r)) publishFrame(r.tag + 'grid', b); }
        return;
      }
      g.empty = false;
      if (ids.length === 1 && ids[0] !== server.id) { if (active(r)) publishFrame(r.tag + 'grid', g.frames.get(ids[0])); return; }
      const size = ids.length <= GRID_LARGE_MAX ? GRID_TILE_LARGE : VIDEO_SIZE;
      const cols = Math.ceil(Math.sqrt(ids.length));
      const rows = Math.ceil(ids.length / cols);
      const tiles = [];
      for (let i = 0; i < ids.length; i++) {
        try {
          let tile = sharpLib(g.frames.get(ids[i])).resize(size.w, size.h, { fit: 'contain', background: '#000000' });
          if (ids[i] === server.id) tile = tile.flop();
          tiles.push({ input: await tile.toBuffer(), left: (i % cols) * size.w, top: Math.floor(i / cols) * size.h });
        } catch (_) {}
      }
      if (!tiles.length) return;
      const jpeg = await sharpLib({ create: { width: cols * size.w, height: rows * size.h, channels: 3, background: '#000000' } }).composite(tiles).jpeg({ quality: 80 }).toBuffer();
      if (active(r)) publishFrame(r.tag + 'grid', jpeg);
    };
    const gridTick = (r) => {
      const g = r && r.grid;
      if (!g || !active(r) || !sharpLib || g.busy || !g.dirty || !frameWatchers.has(r.tag + 'grid')) return;
      g.dirty = false;
      g.busy = true;
      composeGrid(r).catch(() => {}).then(() => { g.busy = false; });
    };
    const gridNote = (r, id, jpeg) => { if (!r || !r.grid) return; if (jpeg) r.grid.frames.set(id, jpeg); else r.grid.frames.delete(id); r.grid.dirty = true; };
    const startGrid = (r) => { if (!sharpLib || !r.grid || r.grid.timer) return; r.grid.timer = setInterval(() => gridTick(r), Math.round(1000 / VIDEO_FPS)); if (r.grid.timer.unref) r.grid.timer.unref(); };
    const stopGrid = (r) => { if (!r || !r.grid) return; clearInterval(r.grid.timer); r.grid.timer = null; r.grid.frames.clear(); r.grid.dirty = false; endFrames(r.tag + 'grid'); };
    const onRoomVideo = (r, slot, payload) => {
      const p = r.peers.get(slot);
      if (!videoAllowed()) return;
      const plain = openRoomFrame(r, p, payload);
      if (!plain) return;
      const film = videoTrack(plain) === 1;
      const key = film ? filmKey(p.id) : p.id;
      const at = film ? 'filmAt' : 'frameAt';
      const timer = film ? 'ftimer' : 'vtimer';
      const asm = film ? 'fasm' : 'vasm';
      if (!p[asm]) p[asm] = videoAssembler();
      const got = p[asm](plain);
      if (got === 'off') { clearTimeout(p[timer]); if (p[at]) { p[at] = 0; endFrames(r.tag + key); gridNote(r, key, null); touched(r); } return; }
      if (!got) return;
      const fresh = !(Date.now() - (p[at] || 0) < VIDEO_HOLD_MS);
      p[at] = Date.now();
      clearTimeout(p[timer]);
      p[timer] = setTimeout(() => { if (active(r)) { endFrames(r.tag + key); gridNote(r, key, null); touched(r); } }, VIDEO_HOLD_MS);
      if (p[timer].unref) p[timer].unref();
      const hold = setTimeout(() => { if (!active(r) || !(Date.now() - (p[at] || 0) < VIDEO_HOLD_MS)) return; publishFrame(r.tag + key, got); gridNote(r, key, got); }, p.queue.length * FRAME_MS);
      if (hold.unref) hold.unref();
      if (fresh) touched(r);
    };
    const sendRoomVideo = (r, plain) => {
      if (!r.sealer || !r.hubVideo) return;
      r.out.push(Buffer.concat([Buffer.from([K_VIDEO]), Buffer.from(r.kid, 'hex'), r.sealer(plain)]));
    };
    const fileStreamOn = () => videoAllowed() && !!streamer;
    const streamFile = (file) => {
      const raw = String(file || '');
      if (!path.isAbsolute(raw)) return null;
      try { const full = fs.realpathSync(raw); return fs.statSync(full).isFile() ? full : null; } catch (_) { return null; }
    };
    const filmKey = (id) => `film:${id}`;
    const videoBudget = (r, chunks) => {
      const bytes = chunks.reduce((n, c) => n + c.length + ROOM_VIDEO_CHUNK_EXTRA, 0);
      const now = Date.now();
      const sent = r.vsent || (r.vsent = []);
      while (sent.length && now - sent[0][0] >= 1000) sent.shift();
      if (sent.reduce((n, e) => n + e[1], 0) + bytes > ROOM_VIDEO_SEND_MAX) return false;
      sent.push([now, bytes]);
      return true;
    };
    const sendRoomJpeg = (r, seq, jpeg, track = 0) => {
      const chunks = videoChunks(seq, jpeg, track);
      if (!videoBudget(r, chunks)) return;
      for (const plain of chunks) sendRoomVideo(r, plain);
    };
    const stopRoomStream = (r, notify = true) => {
      const s = r && r.stream;
      if (!s) return false;
      r.stream = null;
      try { if (s.handle) s.handle.stop(); } catch (_) {}
      endFrames('film:me');
      gridNote(r, filmKey(server.id), null);
      if (room === r) sendRoomVideo(r, videoOff(1));
      if (notify) roomChanged();
      return true;
    };
    const startRoomStream = (r, file, name) => {
      if (!r || r.phase !== 'live' || !r.hubVideo || !fileStreamOn()) return false;
      stopRoomStream(r, false);
      const s = { name: String(name || '').slice(0, 120), pcm: Buffer.alloc(0), seq: 0, handle: null };
      r.stream = s;
      try {
        s.handle = streamer.open(file, {
          onJpeg: (jpeg) => {
            if (r.stream !== s || room !== r || !Buffer.isBuffer(jpeg) || jpeg.length > VIDEO_FRAME_MAX) return;
            s.seq = (s.seq + 1) & 0xffff;
            publishFrame('film:me', jpeg);
            gridNote(r, filmKey(server.id), jpeg);
            sendRoomJpeg(r, s.seq, jpeg, 1);
          },
          onPcm: (pcm) => {
            if (r.stream !== s || !pcm || !pcm.length) return;
            s.pcm = s.pcm.length ? Buffer.concat([s.pcm, pcm]) : Buffer.from(pcm);
            const drop = (s.pcm.length - RATE * 2) & ~1;
            if (drop > 0) s.pcm = s.pcm.subarray(drop);
          },
          onEnd: () => { if (r.stream === s) stopRoomStream(r); }
        });
      } catch (_) { s.handle = null; }
      if (!s.handle || r.stream !== s) { if (r.stream === s) r.stream = null; return false; }
      return true;
    };
    const streamFrame = (r) => {
      const s = r.stream;
      if (!s || s.pcm.length < FRAME_BYTES) return null;
      const f = s.pcm.subarray(0, FRAME_BYTES);
      s.pcm = s.pcm.subarray(FRAME_BYTES);
      return f;
    };
    const onRoomFrame = (r, frame) => {
      if (!active(r)) return;
      const buf = Buffer.isBuffer(frame) ? frame : Buffer.from(frame || []);
      if (!buf.length) return;
      r.received = (r.received || 0) + 1;
      if (r.received - (r.ackedAt || 0) >= ROOM_ACK_EVERY) { r.ackedAt = r.received; r.out.push(ctrlFrame({ t: 'ack', n: r.received })); }
      if (buf[0] === K_CTRL) {
        let msg = null;
        try { msg = JSON.parse(buf.subarray(1).toString('utf8')); } catch (_) {}
        if (msg && typeof msg === 'object') onRoomCtrl(r, msg);
        return;
      }
      if (buf.length < 3) return;
      if (buf[0] === K_AUDIO) onRoomAudio(r, buf[1], buf.subarray(2));
      else if (buf[0] === K_VIDEO) onRoomVideo(r, buf[1], buf.subarray(2));
      else if (buf[0] === K_DATA) onRoomData(r, buf[1], buf.subarray(2));
      else if (buf[0] === K_KEY) onRoomKey(r, buf[1], buf.subarray(2));
    };
    const startRoomMedia = (r) => {
      const player = audio.player();
      const gate = voiceGate();
      const samples = FRAME_BYTES / 2;
      let pending = Buffer.alloc(0);
      const capture = audio.capture((pcm) => {
        if (room !== r) return;
        pending = pending.length ? Buffer.concat([pending, pcm]) : Buffer.from(pcm);
        while (pending.length >= FRAME_BYTES) {
          const mic = pending.subarray(0, FRAME_BYTES);
          pending = pending.subarray(FRAME_BYTES);
          const acc = new Int32Array(samples);
          for (const p of r.peers.values()) { const f = p.queue.shift(); if (f && !silenced.has(p.id)) mixInto(acc, f); }
          const film = streamFrame(r);
          if (film) mixInto(acc, film);
          player.write(clampPcm(acc));
          if (r.rec) {
            const both = Int32Array.from(acc);
            if (!r.muted) mixInto(both, mic);
            const take = clampPcm(both);
            try { fs.writeSync(r.rec.fd, take); r.rec.bytes += take.length; } catch (_) { stopRoomRec(r); }
            if (r.rec && r.rec.bytes >= ROOM_REC_MAX_BYTES) stopRoomRec(r);
            if (r.rec && r.sealer && Date.now() - (r.recBeaconAt || 0) >= MUTE_BEACON_MS) { sendRoomData(r, { t: 'rec', on: true }); r.recBeaconAt = Date.now(); }
          }
          const voiced = gate(mic);
          if (r.muted && r.sealer && Date.now() - (r.beaconAt || 0) >= MUTE_BEACON_MS) sendRoomData(r, { t: 'mute', on: true, beacon: true });
          if (r.hand && r.sealer && Date.now() - (r.handBeaconAt || 0) >= MUTE_BEACON_MS) { sendRoomData(r, { t: 'hand', on: true, at: r.handAt, beacon: true }); r.handBeaconAt = Date.now(); }
          const talk = !r.muted && voiced;
          if (!r.sealer || (!talk && !film)) continue;
          r.sentAt = Date.now();
          let send = mic;
          if (film) { const mix = new Int32Array(samples); mixInto(mix, film); if (talk) mixInto(mix, mic); send = clampPcm(mix); }
          const opus = codecsOffered().includes('opus') && r.peers.size > 0 && [...r.peers.values()].every(p => p.opus);
          if (opus && !r.enc) r.enc = makeEncoder('opus');
          r.out.push(Buffer.concat([Buffer.from([K_AUDIO]), Buffer.from(r.kid, 'hex'), r.sealer(opus ? r.enc.encode(send) : ulawEncode(send))]));
        }
      });
      r.media = { stop() { capture.stop(); player.stop(); } };
    };
    const closeDuplex = (duplex) => {
      if (!duplex) return;
      try { duplex.source(true, () => {}); } catch (_) {}
      try { pull(pull.empty(), duplex.sink); } catch (_) {}
    };
    const leaveRoom = (r, outcome) => {
      if (!r || room !== r) return;
      if (r.ready) { r.ready(new Error('left')); return; }
      stopRoomRec(r);
      room = null;
      clearTimeout(r.timer);
      stopRoomStream(r, false);
      if (r.cam) { r.cam = false; stopCam(); }
      for (const p of r.peers.values()) { clearTimeout(p.vtimer); clearTimeout(p.ftimer); endFrames(p.id); endFrames(filmKey(p.id)); }
      stopGrid(r);
      if (r.media) r.media.stop();
      if (r.enc) { r.enc.free(); r.enc = null; }
      for (const p of r.peers.values()) if (p.dec) p.dec.free();
      try { r.out.push(ctrlFrame({ t: 'bye' })); } catch (_) {}
      try { r.out.end(); } catch (_) {}
      if (outcome) emit({ type: 'roomEnded', room: { rid: r.rid, ref: r.ref, title: r.title, joinedAt: r.joinedAt, endedAt: Date.now(), outcome } });
      roomChanged();
    };
    const openHub = (opts, req, attach) => {
      if (opts.hub === server.id) return attach(hubDuplex(server.id, req));
      const viaRpc = (rpc) => attach(rpc && rpc.phone && typeof rpc.phone.roomHub === 'function' ? rpc.phone.roomHub(req, () => {}) : null);
      const live = liveRpc(opts.hub);
      if (live) return viaRpc(live);
      if (typeof opts.address === 'string' && opts.address) {
        try {
          return server.conn.connect(opts.address, (err, rpc) => {
            const got = !err && rpc && rpc.phone ? rpc : liveRpc(opts.hub);
            return got ? viaRpc(got) : reach(opts.hub, viaRpc);
          });
        } catch (_) {}
      }
      reach(opts.hub, viaRpc);
    };
    let blank = null;
    const blankFrame = async () => {
      if (blank || !sharpLib) return blank;
      try { blank = await sharpLib({ create: { width: GRID_TILE_LARGE.w, height: GRID_TILE_LARGE.h, channels: 3, background: '#000000' } }).jpeg().toBuffer(); } catch (_) { blank = null; }
      return blank;
    };
    const soundKey = (r) => r.tag + 'sound';
    const dropViewer = (r) => {
      if (!r || viewers.get(r.rid) !== r) return;
      viewers.delete(r.rid);
      clearTimeout(r.timer);
      clearInterval(r.mixTimer);
      stopGrid(r);
      endFrames(soundKey(r));
      for (const p of r.peers.values()) { if (p.dec) p.dec.free(); clearTimeout(p.vtimer); clearTimeout(p.ftimer); }
      try { r.out.push(ctrlFrame({ t: 'bye' })); } catch (_) {}
      try { r.out.end(); } catch (_) {}
    };
    const startViewerMedia = (r) => {
      const samples = FRAME_BYTES / 2;
      r.mixTimer = setInterval(() => {
        if (viewers.get(r.rid) !== r) return;
        const acc = new Int32Array(samples);
        for (const p of r.peers.values()) { const f = p.queue.shift(); if (f) mixInto(acc, f); }
        if (frameWatchers.has(soundKey(r))) publishFrame(soundKey(r), clampPcm(acc));
        if (r.sealer && Date.now() - (r.beaconAt || 0) >= MUTE_BEACON_MS) sendRoomData(r, { t: 'mute', on: true, beacon: true });
      }, FRAME_MS);
      if (r.mixTimer.unref) r.mixTimer.unref();
    };
    const staticKey = (rid, secret) => {
      const key = Buffer.from(sodium.crypto_hash_sha256(Buffer.concat([Buffer.from('oasis-room|'), Buffer.from(rid, 'hex'), Buffer.from(String(secret))])));
      return { kid: Buffer.from(sodium.crypto_hash_sha256(key)).subarray(0, 4).toString('hex'), key };
    };

    if (server.close && typeof server.close.hook === 'function') {
      server.close.hook(function (fn, args) { finish('ended'); leaveRoom(room, 'ended'); stopCam(); for (const v of [...viewers.values()]) dropViewer(v); return fn.apply(this, args); });
    }

    return {
      ring(raw, cb) {
        const reply = typeof cb === 'function' ? cb : () => {};
        const req = opened(raw);
        const { sender: from, via } = senderOf(this, req);
        reply(null, true);
        if (!from || from === server.id || !req || typeof req !== 'object') return;
        const { callId, to, ephPk, ts, sig } = req;
        dbg('incoming ring from', sid(from), via ? 'via ' + sid(via) : 'direct');
        if (!/^[0-9a-f]{32}$/.test(String(callId)) || to !== server.id || Math.abs(Date.now() - Number(ts)) > CLOCK_SKEW_MS) return;
        const remotePk = ephKey(ephPk);
        if (!remotePk || !verifyParts(from, ['ring', callId, ephPk, to, ts], sig)) return;
        if (!seenCalls.has(callId) && !callerAllowed(from)) return;
        if (!via) directRings.set(callId, Date.now());
        if (call && call.id === callId && call.dir === 'in') {
          if (!via && call.phase === 'incoming' && call.peer === from) call.via = null;
          return;
        }
        if (!firstSeen(callId)) return;
        const ack = (state) => {
          const at = Date.now();
          sendVia(directRings.has(callId) ? null : via, from, 'answer', { callId, from: server.id, ringing: state, ts: at, sig: signParts(keys, ['ringing', callId, state, from, at]) });
        };
        allowedCaller(from, (ok) => {
          if (!ok || !audio) return ack('ringing');
          if (call || room) {
            ack('busy');
            const at = Date.now();
            emit({ type: 'ended', call: { id: callId, peer: from, dir: 'in', startedAt: at, answeredAt: 0, endedAt: at, outcome: 'missed' } });
            return;
          }
          const startedAt = Date.now();
          call = { id: callId, peer: from, dir: 'in', phase: 'incoming', startedAt, ringUntil: startedAt + ringMs, remotePk, via: directRings.has(callId) ? null : via, codec: pickCodec(req.codecs), video: pickVideo(req.codecs, videoOn()) };
          call.tone = startTone(audio, 'ring');
          call.timer = setTimeout(() => { if (call && call.id === callId && call.phase === 'incoming') finish('missed'); }, ringMs);
          changed();
          emit({ type: 'incoming', id: callId, peer: from });
          ack('ringing');
        });
      },
      answer(raw, cb) {
        const req = opened(raw);
        const { sender: from, via } = senderOf(this, req);
        const c = call;
        if (req && (req.ringing === 'ringing' || req.ringing === 'busy')) return ringingAck(c, req, from, cb);
        if (c && c.group) return groupAnswer(c, req, from, via, cb);
        if (!c || c.dir !== 'out' || c.phase !== 'calling' || from !== c.peer || !req || req.callId !== c.id) return cb(new Error('no-call'));
        const calleePk = ephKey(req.ephPk);
        if (!calleePk || !verifyParts(from, ['answer', req.callId, req.ephPk, server.id, req.ts], req.sig)) return cb(new Error('rejected'));
        const path = via ? liveRpc(via) : liveRpc(from);
        if (!path) return cb(new Error('no-connection'));
        c.keys = deriveKeys(c.eph.secretKey, calleePk, c.id, Buffer.from(c.eph.publicKey), calleePk);
        c.codec = pickCodec([req.codec]);
        c.video = pickVideo([req.video]);
        clearTimeout(c.timer);
        stopTone(c);
        c.via = via;
        c.phase = 'connected';
        c.answeredAt = Date.now();
        cb(null, true);
        changed();
        const quiet = () => {};
        startMedia(c, via ? path.phone.relayAudio({ to: c.peer, callId: c.id }, quiet) : path.phone.audio({ callId: c.id }, quiet), 'out');
        if (c.video) startVideo(c, via ? path.phone.relayVideo({ to: c.peer, callId: c.id }, quiet) : path.phone.video({ callId: c.id }, quiet), 'out');
      },
      hangup(raw, cb) {
        const reply = typeof cb === 'function' ? cb : () => {};
        const req = opened(raw);
        const { sender: from } = senderOf(this, req);
        const c = call;
        dbg('hangup received from', sid(from), c ? 'call ' + sid(c.peer) + ' ' + c.phase : 'no call');
        if (c && c.group) {
          const leg = legOf(c, req && req.callId);
          if (leg && from === leg.peer && verifyParts(from, ['hangup', req.callId, server.id, req.ts], req.sig)) dropLeg(c, leg, false);
          return reply(null, true);
        }
        if (c && req && req.callId === c.id && from === c.peer && verifyParts(from, ['hangup', req.callId, server.id, req.ts], req.sig)) {
          if (c.dir === 'in') finish(c.phase === 'incoming' ? 'missed' : 'ended');
          else if (c.phase === 'calling' || c.phase === 'connected') finish(c.phase === 'connected' ? 'ended' : 'noanswer');
        }
        reply(null, true);
      },
      audio(opts) {
        const direct = this && this.id;
        const from = opts && isFeedId(opts.from) ? opts.from : direct;
        const c = call;
        const viaOk = direct === c?.peer || (c?.via && direct === c.via);
        if (!c || c.dir !== 'in' || !c.keys || c.media || from !== c.peer || !viaOk || !opts || opts.callId !== c.id || (c.phase !== 'connecting' && c.phase !== 'connected')) {
          return { source: pull.error(new Error('no-call')), sink: pull.drain(null, () => {}) };
        }
        c.phase = 'connected';
        return startMedia(c, null, 'in');
      },
      relay(req, cb) {
        const reply = typeof cb === 'function' ? cb : () => {};
        const from = this && this.id;
        reply(null, true);
        if (!from || policy().relay === false || !req || typeof req !== 'object' || !isFeedId(req.to) || req.to === from) return;
        if (!['ring', 'answer', 'hangup'].includes(req.method) || typeof req.sealed !== 'string' || !/^[0-9a-f]{32}$/.test(String(req.cid))) return;
        const forwarded = req.hop === 1;
        dbg('relay', req.method, 'from', sid(from), 'to', sid(req.to), forwarded ? 'forwarded' : 'origin', 'target-live=' + !!liveRpc(req.to));
        if (forwarded && !knownPubs().includes(from)) return;
        const msg = { to: req.to, method: req.method, cid: req.cid, sealed: req.sealed, hop: 1 };
        const side = learn(req.cid, req.to, from, forwarded);
        if (side.via === req.to) {
          relayAllowed(req.to, forwarded ? req.to : from, (ok) => {
            const target = ok ? liveRpc(req.to) : null;
            dbg('relay deliver', sid(req.to), ok ? (target ? 'delivering' : 'not connected here') : 'policy refuses');
            if (!target) return;
            try { target.phone[req.method]({ sealed: req.sealed }, () => {}); } catch (_) {}
          });
          return;
        }
        if (side.via && side.via !== from && liveRpc(side.via)) {
          try { liveRpc(side.via).phone.relay(msg, () => {}); } catch (_) {}
          return;
        }
        if (forwarded || req.method !== 'ring') return;
        relayAllowed(from, from, (ok) => {
          if (!ok) return;
          for (const pub of knownPubs().filter(id => id !== from)) {
            try { liveRpc(pub).phone.relay(msg, () => {}); } catch (_) {}
          }
        });
      },
      relayAudio(opts) {
        const from = this && this.id;
        const refuse = { source: pull.error(new Error('no-route')), sink: pull.drain(null, () => {}) };
        if (!from || !opts || !isFeedId(opts.to) || opts.to === from || policy().relay === false) return refuse;
        const forwarded = knownPubs().includes(from) && isFeedId(opts.from);
        const caller = forwarded ? opts.from : from;
        const r = routes.get(String(opts.callId || ''));
        const side = r && r.sides.find(x => x.id === opts.to);
        const direct = liveRpc(opts.to);
        const next = direct || (side && side.via && side.via !== from ? liveRpc(side.via) : null);
        if (!next) return refuse;
        const remote = direct
          ? next.phone.audio({ callId: opts.callId, from: caller }, () => {})
          : next.phone.relayAudio({ to: opts.to, callId: opts.callId, from: caller }, () => {});
        return { source: remote.source, sink: remote.sink };
      },
      video(opts) {
        const direct = this && this.id;
        const from = opts && isFeedId(opts.from) ? opts.from : direct;
        const c = call;
        const viaOk = direct === c?.peer || (c?.via && direct === c.via);
        if (!c || c.dir !== 'in' || !c.keys || !c.video || c.vmedia || from !== c.peer || !viaOk || !opts || opts.callId !== c.id || (c.phase !== 'connecting' && c.phase !== 'connected')) {
          return { source: pull.error(new Error('no-call')), sink: pull.drain(null, () => {}) };
        }
        return startVideo(c, null, 'in');
      },
      relayVideo(opts) {
        const from = this && this.id;
        const refuse = { source: pull.error(new Error('no-route')), sink: pull.drain(null, () => {}) };
        if (!from || !opts || !isFeedId(opts.to) || opts.to === from || policy().relay === false || policy().video === false) return refuse;
        const forwarded = knownPubs().includes(from) && isFeedId(opts.from);
        const caller = forwarded ? opts.from : from;
        const r = routes.get(String(opts.callId || ''));
        const side = r && r.sides.find(x => x.id === opts.to);
        const direct = liveRpc(opts.to);
        const next = direct || (side && side.via && side.via !== from ? liveRpc(side.via) : null);
        if (!next) return refuse;
        const remote = direct
          ? next.phone.video({ callId: opts.callId, from: caller }, () => {})
          : next.phone.relayVideo({ to: opts.to, callId: opts.callId, from: caller }, () => {});
        return { source: remote.source, sink: remote.sink };
      },
      camera(flag, cb) {
        const on = !!flag;
        const c = call;
        if (c && c.vmedia && !c.group) {
          if (on === !!c.cam) return cb(null, snapshot());
          if (on) {
            if (!startCam((jpeg, seq) => { if (call === c) for (const plain of videoChunks(seq, jpeg)) sendCallVideo(c, plain); })) return cb(new Error('unavailable'));
            c.cam = true;
          } else {
            c.cam = false;
            stopCam();
            sendCallVideo(c, videoOff());
          }
          changed();
          return cb(null, snapshot());
        }
        const r = room;
        if (r && r.phase === 'live') {
          if (on === !!r.cam) return cb(null, roomSnapshot());
          if (on) {
            if (!r.hubVideo || !startCam((jpeg, seq) => { if (room !== r) return; gridNote(r, server.id, jpeg); sendRoomJpeg(r, seq, jpeg, 0); })) return cb(new Error('unavailable'));
            r.cam = true;
          } else {
            r.cam = false;
            stopCam();
            gridNote(r, server.id, null);
            sendRoomVideo(r, videoOff());
          }
          roomChanged();
          return cb(null, roomSnapshot());
        }
        cb(new Error('no-call'));
      },
      stream(opts, cb) {
        const o = opts && typeof opts === 'object' ? opts : {};
        const r = room;
        if (!r || r.phase !== 'live') return cb(new Error('no-room'));
        if (o.stop) { stopRoomStream(r); return cb(null, roomSnapshot()); }
        const file = streamFile(o.file);
        if (!file) return cb(new Error('invalid'));
        if (!startRoomStream(r, file, o.name || path.basename(file))) return cb(new Error('unavailable'));
        roomChanged();
        cb(null, roomSnapshot());
      },
      viewerJoin(opts, cb) {
        const o = opts && typeof opts === 'object' ? opts : {};
        const rid = String(o.rid || '');
        if (!RID.test(rid) || !isFeedId(o.owner) || !isFeedId(o.hub) || typeof o.token !== 'string') return cb(new Error('invalid'));
        if (viewers.has(rid)) return cb(null, true);
        if (room && room.rid === rid) return cb(new Error('busy'));
        const r = {
          rid, ref: String(o.ref || ''), title: '', hub: o.hub, phase: 'joining', joinedAt: Date.now(), muted: true, slot: null, max: ROOM_MAX,
          peers: new Map(), order: [], keys: new Map(), kid: null, sealer: null, static: false, sentAt: 0,
          events: [], notify: false, rec: null, recPeers: new Set(), hand: false, handAt: 0, tag: `pub:${rid}:`, grid: newGrid()
        };
        viewers.set(rid, r);
        r.out = Pushable(() => {});
        r.ready = (err) => {
          r.ready = null;
          clearTimeout(r.timer);
          if (err) { dropViewer(r); return cb(err); }
          startViewerMedia(r);
          startGrid(r);
          cb(null, true);
        };
        r.timer = setTimeout(() => { if (r.ready) r.ready(new Error('unreachable')); }, ROOM_JOIN_MS);
        const attach = (duplex) => {
          if (viewers.get(rid) !== r || !r.ready) return closeDuplex(duplex);
          if (!duplex) return r.ready(new Error('unreachable'));
          pull(r.out, duplex.sink);
          pull(duplex.source, pull.drain((frame) => onRoomFrame(r, frame), () => {
            if (viewers.get(rid) !== r) return;
            if (r.ready) r.ready(new Error('unreachable'));
            else dropViewer(r);
          }));
        };
        openHub(o, { rid, owner: o.owner, token: o.token, viewer: true, ...(RID.test(String(o.roomId || '')) ? { roomId: String(o.roomId) } : {}) }, attach);
      },
      viewerLeave(opts, cb) {
        dropViewer(viewers.get(String((opts && opts.rid) || '')));
        cb(null, true);
      },
      viewerRooms() { return [...viewers.values()].filter(r => r.phase === 'live').map(r => r.rid); },
      publicFeed(opts) {
        const rid = String((opts && opts.rid) || '');
        const kind = opts && opts.kind === 'sound' ? 'sound' : 'grid';
        const r = viewers.get(rid);
        const target = r ? r.tag + kind : '';
        const p = Pushable(() => { const set = frameWatchers.get(target); if (set) { set.delete(p); if (!set.size) frameWatchers.delete(target); } });
        if (!r || r.phase !== 'live' || (kind === 'grid' && !sharpLib)) { p.end(); return p; }
        if (!frameWatchers.has(target)) frameWatchers.set(target, new Set());
        frameWatchers.get(target).add(p);
        if (kind === 'grid') { r.grid.dirty = true; r.grid.empty = false; }
        return p;
      },
      videoFrames(opts) {
        const target = String((opts && opts.peer) || '');
        const p = Pushable(() => { const set = frameWatchers.get(target); if (set) { set.delete(p); if (!set.size) frameWatchers.delete(target); } });
        const now = Date.now();
        const filmOf = target.startsWith('film:') && target !== 'film:me' ? target.slice(5) : null;
        const live = target === 'me'
          ? !!cam
          : target === 'film:me' ? !!(room && room.stream)
          : target === 'grid' ? !!(room && sharpLib && gridIds(room).length)
          : filmOf ? !!room && [...room.peers.values()].some(x => x.id === filmOf && now - (x.filmAt || 0) < VIDEO_HOLD_MS)
          : call ? (call.peer === target && !!call.peerCam)
          : room ? [...room.peers.values()].some(x => x.id === target && now - (x.frameAt || 0) < VIDEO_HOLD_MS)
          : false;
        if (!live) { p.end(); return p; }
        if (!frameWatchers.has(target)) frameWatchers.set(target, new Set());
        frameWatchers.get(target).add(p);
        return p;
      },

      call(target, opts, cb) {
        if (typeof opts === 'function') { cb = opts; opts = {}; }
        const legacy = new Set(Array.isArray(opts && opts.legacy) ? opts.legacy : []);
        if (!audio) return cb(new Error('unavailable'));
        const targets = [...new Set(Array.isArray(target) ? target : [target])];
        if (!targets.length || targets.length > GROUP_MAX || targets.some(t => !isFeedId(t) || t === server.id)) return cb(new Error('invalid'));
        if (call || room) return cb(new Error('busy'));
        if (targets.length > 1) return groupCall(targets, legacy, cb);
        target = targets[0];
        const id = nodeCrypto.randomBytes(16).toString('hex');
        const eph = sodium.crypto_box_keypair();
        const startedAt = Date.now();
        const c = { id, peer: target, dir: 'out', phase: 'calling', startedAt, ringUntil: startedAt + ringMs, eph, paths: [], via: null };
        call = c;
        c.tone = startTone(audio, 'connecting');
        c.timer = setTimeout(() => toVoicemail(c, 'unreachable'), ringMs);
        changed();
        ringPaths(c, target, ringRequest(id, eph, target), () => call === c && c.phase === 'calling', () => reachedCall(c), legacy.has(target));
        cb(null, snapshot());
      },
      accept(cb) {
        const c = call;
        if (!c || c.dir !== 'in' || c.phase !== 'incoming') return cb(new Error('no-call'));
        const eph = sodium.crypto_box_keypair();
        c.keys = deriveKeys(eph.secretKey, c.remotePk, c.id, c.remotePk, Buffer.from(eph.publicKey));
        stopTone(c);
        clearTimeout(c.timer);
        c.phase = 'connecting';
        c.answeredAt = Date.now();
        changed();
        const ts = Date.now();
        const ephPk = b64(eph.publicKey);
        sendVia(c.via || null, c.peer, 'answer', { callId: c.id, from: server.id, ephPk, ts, sig: signParts(keys, ['answer', c.id, ephPk, c.peer, ts]), codec: c.codec, video: c.video }, (err) => {
          if (call !== c) return;
          if (err) return finish('failed');
          if (c.phase === 'connecting') { c.phase = 'connected'; changed(); }
        });
        cb(null, snapshot());
      },
      reject(cb) {
        const c = call;
        if (c && c.dir === 'in' && c.phase === 'incoming') finish('rejected');
        cb(null, snapshot());
      },
      end(cb) {
        const c = call;
        if (!c) return cb(null, null);
        if (c.group) {
          for (const leg of c.legs) if (leg.phase === 'calling' || leg.phase === 'connected') hangupLeg(leg);
          finish(c.answeredAt ? 'ended' : 'cancelled');
          return cb(null, null);
        }
        if (c.dir === 'in' && c.phase === 'incoming') { finish('rejected'); return cb(null, null); }
        if (c.phase === 'calling' || c.phase === 'connecting' || c.phase === 'connected') notifyHangup(c);
        finish(c.phase === 'connected' || c.phase === 'connecting' ? 'ended' : (c.phase === 'calling' ? 'cancelled' : 'noanswer'));
        cb(null, null);
      },
      mute(flag, cb) {
        if (call) { call.muted = !!flag; changed(); }
        cb(null, snapshot());
      },
      silence(opts, cb) {
        const id = opts && opts.id;
        if (!isFeedId(id) || id === server.id) return cb(new Error('invalid'));
        if (opts.on) silenced.add(id); else silenced.delete(id);
        if (call) changed();
        if (room) roomChanged();
        cb(null, { id, on: silenced.has(id) });
      },
      dismiss(cb) {
        const c = call;
        if (c && c.dir === 'out' && (c.phase === 'noanswer' || c.phase === 'recorded')) finish('noanswer');
        cb(null, snapshot());
      },
      recordStop(cb) {
        const c = call;
        if (!c || c.dir !== 'out' || (c.phase !== 'recording' && c.phase !== 'recorded') || !c.rec) return cb(new Error('no-recording'));
        stopRecorder(c);
        const pcm = Buffer.concat(c.rec.chunks);
        c.rec = null;
        if (pcm.length < RATE * 2 * PAM_MIN_MS / 1000) { finish('noanswer'); return cb(new Error('empty')); }
        const file = path.join(os.tmpdir(), `oasis-voice-${c.id}.wav`);
        try { fs.writeFileSync(file, wavFile(pcm), { mode: 0o600 }); } catch (err) { return cb(err); }
        const out = { file, durationMs: Math.round(pcm.length / (RATE * 2) * 1000), peer: c.peer, callId: c.id };
        finish('pam');
        cb(null, out);
      },
      recordCancel(cb) {
        const c = call;
        if (c && (c.phase === 'recording' || c.phase === 'recorded')) {
          stopRecorder(c);
          c.rec = null;
          finish('noanswer');
        }
        cb(null, snapshot());
      },
      roomHub(opts) { return hubDuplex(this && this.id, opts); },
      roomInfo(opts, cb) {
        const r = hubRooms.get(String((opts && opts.rid) || ''));
        cb(null, { count: r ? hubHumans(r) : 0, max: roomMax, video: policy().video !== false });
      },
      roomAdmits(opts, cb) {
        const from = this && this.id;
        if (!from) return cb(null, false);
        relayAllowed(from, from, (ok) => cb(null, !!ok));
      },
      roomJoin(opts, cb) {
        if (!audio) return cb(new Error('unavailable'));
        if (call || room) return cb(new Error('busy'));
        const rid = String((opts && opts.rid) || '');
        if (viewers.has(rid)) dropViewer(viewers.get(rid));
        if (!RID.test(rid) || !isFeedId(opts.owner) || !isFeedId(opts.hub) || typeof opts.token !== 'string') return cb(new Error('invalid'));
        const secrets = (Array.isArray(opts.secrets) ? opts.secrets : []).filter(x => typeof x === 'string' && x);
        const r = {
          rid, ref: String(opts.ref || ''), title: String(opts.title || '').slice(0, 200), hub: opts.hub,
          phase: 'joining', joinedAt: Date.now(), muted: false, slot: null, max: ROOM_MAX, peers: new Map(), order: [],
          keys: new Map(), kid: null, sealer: null, static: secrets.length > 0, sentAt: 0,
          events: [], notify: true, rec: null, recPeers: new Set(), hand: false, handAt: 0, tag: '', grid: newGrid()
        };
        if (r.static) {
          for (const secret of secrets.slice().reverse()) { const k = staticKey(rid, secret); r.keys.set(k.kid, k.key); }
          const first = staticKey(rid, secrets[0]);
          r.kid = first.kid;
          r.sealer = sealer(first.key);
        }
        room = r;
        r.out = Pushable(() => {});
        r.ready = (err) => {
          r.ready = null;
          clearTimeout(r.timer);
          if (err) { leaveRoom(r, null); return cb(err); }
          startRoomMedia(r);
          startGrid(r);
          roomChanged();
          cb(null, roomSnapshot());
        };
        r.timer = setTimeout(() => { if (r.ready) r.ready(new Error('unreachable')); }, ROOM_JOIN_MS);
        const attach = (duplex) => {
          if (room !== r || !r.ready) return closeDuplex(duplex);
          if (!duplex) return r.ready(new Error('unreachable'));
          pull(r.out, duplex.sink);
          pull(duplex.source, pull.drain((frame) => onRoomFrame(r, frame), () => {
            if (room !== r) return;
            if (r.ready) r.ready(new Error('unreachable'));
            else leaveRoom(r, 'lost');
          }));
        };
        openHub(opts, { rid, owner: opts.owner, token: opts.token, ...(RID.test(String(opts.roomId || '')) ? { roomId: String(opts.roomId) } : {}) }, attach);
      },
      roomLeave(cb) {
        leaveRoom(room, 'left');
        cb(null, null);
      },
      roomRecStart(cb) { cb(null, startRoomRec(room) ? roomSnapshot() : null); },
      roomRecStop(cb) { cb(null, stopRoomRec(room) ? roomSnapshot() : null); },
      roomNotify(flag, cb) {
        if (room) { room.notify = !!flag; roomChanged(); }
        cb(null, roomSnapshot());
      },
      roomClearEvents(cb) {
        if (room) { room.events = []; roomChanged(); }
        cb(null, roomSnapshot());
      },
      roomHand(flag, cb) {
        if (room) {
          room.hand = !!flag;
          room.handAt = room.hand ? Date.now() : 0;
          sendRoomData(room, { t: 'hand', on: room.hand, at: room.handAt });
          room.handBeaconAt = Date.now();
          roomChanged();
        }
        cb(null, roomSnapshot());
      },
      roomMute(flag, cb) {
        if (room) { room.muted = !!flag; sendRoomData(room, { t: 'mute', on: room.muted }); roomChanged(); }
        cb(null, roomSnapshot());
      },
      roomCount(opts, cb) {
        const rid = String((opts && opts.rid) || '');
        if (!RID.test(rid) || !isFeedId(opts.hub)) return cb(null, null);
        if (room && room.rid === rid && room.phase === 'live') return cb(null, { count: humansIn(room) + 1, max: room.max });
        if (opts.hub === server.id) { const h = hubRooms.get(rid); return cb(null, { count: h ? hubHumans(h) : 0, max: roomMax }); }
        const rpc = liveRpc(opts.hub);
        if (!rpc || typeof rpc.phone.roomInfo !== 'function') return cb(null, null);
        let done = false;
        const finishPeek = (v) => { if (done) return; done = true; clearTimeout(t); cb(null, v); };
        const t = setTimeout(() => finishPeek(null), ROOM_PEEK_MS);
        try {
          rpc.phone.roomInfo({ rid }, (err, info) => finishPeek(!err && info && Number.isFinite(Number(info.count)) ? { count: Number(info.count), max: Number(info.max) > 0 ? Math.min(ROOM_MAX, Number(info.max)) : ROOM_MAX } : null));
        } catch (_) { finishPeek(null); }
      },
      roomState() { return roomSnapshot(); },
      roomToken(rid) { return RID.test(String(rid || '')) ? signParts(keys, ['room', String(rid)]) : null; },
      roomHubFor(cb) {
        const done = typeof cb === 'function' ? cb : () => {};
        let entries = [];
        try { entries = netFirst(server.conn.query().peersAll()); } catch (_) {}
        const ranked = typeof server.oasisPeerRank === 'function' ? (id) => server.oasisPeerRank([null, { key: id }]) : () => 0;
        const candidates = knownPubs().filter(id => { const rpc = liveRpc(id); return rpc && rpc.phone && typeof rpc.phone.roomHub === 'function'; }).sort((x, y) => ranked(y) - ranked(x));
        const admits = (id, next) => {
          const rpc = liveRpc(id);
          const byGraph = () => relation('isFollowing', id, server.id, next);
          if (!rpc || typeof rpc.phone.roomAdmits !== 'function') return byGraph();
          let settled = false;
          const finishAsk = (fn) => { if (settled) return; settled = true; clearTimeout(t); fn(); };
          const t = setTimeout(() => finishAsk(() => next(false)), ROOM_PEEK_MS);
          try { rpc.phone.roomAdmits({}, (err, ok) => finishAsk(err ? byGraph : () => next(!!ok))); } catch (_) { finishAsk(byGraph); }
        };
        const pick = (i) => {
          if (i >= candidates.length) return done(null, { key: server.id, address: '' });
          admits(candidates[i], (ok) => {
            if (!ok) return pick(i + 1);
            const hit = entries.find(e => Array.isArray(e) && e[0] && e[1] && e[1].key === candidates[i]);
            done(null, { key: candidates[i], address: hit ? hit[0] : '' });
          });
        };
        pick(0);
      },
      state() { return snapshot(); },
      available() { return !!audio; },
      pubs() { return [...pubKeys()]; },
      events() {
        const p = Pushable(() => subscribers.delete(p));
        subscribers.add(p);
        p.push({ type: 'state', state: snapshot() });
        return p;
      }
    };
  }
};

module.exports.setAudioFactory = (factory) => { audioFactory = typeof factory === 'function' ? factory : systemAudio; };
module.exports.setVideoFactory = (factory) => { videoFactory = typeof factory === 'function' ? factory : systemVideo; };
module.exports.setStreamFactory = (factory) => { streamFactory = typeof factory === 'function' ? factory : systemStream; };
module.exports.jpegSplitter = jpegSplitter;
module.exports.VIDEO_CHUNK = VIDEO_CHUNK;
module.exports.VIDEO_HOLD_MS = VIDEO_HOLD_MS;
module.exports.ROOM_VIDEO_BYTES_PER_S = ROOM_VIDEO_BYTES_PER_S;
module.exports.ulawEncode = ulawEncode;
module.exports.ulawDecode = ulawDecode;
module.exports.RING_MS = RING_MS;
module.exports.GROUP_MAX = GROUP_MAX;
module.exports.ROOM_MAX = ROOM_MAX;
module.exports.RING_PER_WINDOW = RING_PER_WINDOW;
module.exports.chimeMs = chimeMs;
module.exports.recordingPrefix = recordingPrefix;
module.exports.VOICEMAIL_MAX_MS = VOICEMAIL_MAX_MS;
module.exports.SOUND_RATE = RATE;
