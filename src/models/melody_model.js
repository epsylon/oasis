"use strict";

const pull = require('../server/node_modules/pull-stream');

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const OCTAVES = [3, 4, 5];

const TYPE_TO_DEGREE = {
  post: 0,
  vote: 2,
  about: 4,
  contact: 5,
  forum: 7,
  tribe: 9,
  transfer: 11,
  shop: 1,
  shopProduct: 1,
  job: 3,
  project: 6,
  event: 8,
  task: 10,
  bookmark: 4,
  feed: 5,
  pad: 6,
  room: 6,
  chat: 7,
  audio: 8,
  video: 9,
  image: 10,
  document: 11,
  torrent: 0,
  file: 0,
  map: 2,
  pixelia: 3,
  gameScore: 5,
  votes: 7,
  calendar: 8,
  curriculum: 9,
  report: 10,
  parliament: 11,
  courts: 0,
  market: 1,
  aiExchange: 6,
  tombstone: 4,
  wikiPage: 2,
  emergency: 11,
  emergencyConfirm: 11,
  emergencyUpdate: 11,
  mailingList: 5,
  logisticsRoute: 3,
  logisticsRating: 3,
  podcast: 8,
  podcastEpisode: 8,
  podcastPlay: 8,
  campaign: 9,
  campaignSignature: 9,
  campaignUpdate: 9
};

const FAMILY_DEGREE = [
  ['tribeParliament', 11], ['parliament', 11], ['courts', 0], ['school', 1], ['housing', 4], ['industry', 6],
  ['poll', 2], ['blog', 0], ['larp', 9], ['chat', 7], ['pad', 6], ['room', 6], ['wiki', 2], ['emergency', 11],
  ['mailing', 5], ['logistics', 3], ['podcast', 8], ['campaign', 9], ['project', 6], ['market', 1], ['shop', 1],
  ['job', 3], ['event', 8], ['task', 10], ['report', 10], ['votes', 7], ['calendar', 8], ['map', 2],
  ['transfer', 11], ['bank', 11], ['ubi', 11], ['feed', 5], ['tribe', 9], ['forum', 7], ['bookmark', 4],
  ['audio', 8], ['video', 9], ['image', 10], ['document', 11], ['torrent', 0], ['file', 0]
];

const degreeOf = (type) => {
  if (TYPE_TO_DEGREE[type] != null) return TYPE_TO_DEGREE[type];
  const family = FAMILY_DEGREE.find(([prefix]) => type.startsWith(prefix));
  return family ? family[1] : (Math.abs(hashStr(type)) % 12);
};

const NOTE_FREQS = (() => {
  const a4 = 440;
  const map = {};
  for (const oct of [2, 3, 4, 5, 6]) {
    for (let i = 0; i < NOTE_NAMES.length; i++) {
      const name = NOTE_NAMES[i] + oct;
      const semis = (oct - 4) * 12 + (i - 9);
      map[name] = a4 * Math.pow(2, semis / 12);
    }
  }
  return map;
})();

function blockToNote(msg) {
  const c = msg && msg.value && msg.value.content;
  if (!c || typeof c !== 'object') return null;
  const type = String(c.type || '').trim() || 'unknown';
  const degree = degreeOf(type);
  const size = Buffer.byteLength(JSON.stringify(msg.value), 'utf8');
  const octIdx = size < 256 ? 0 : (size < 1024 ? 1 : 2);
  const octave = OCTAVES[octIdx];
  const name = NOTE_NAMES[degree] + octave;
  const freq = NOTE_FREQS[name] || 440;
  const durMs = Math.min(600, 200 + Math.round(size / 64));
  return {
    id: msg.key,
    ts: msg.value.timestamp,
    type,
    size,
    name,
    freq,
    durMs
  };
}

const NOTE_COLORS = ['#ff4040', '#ff7a30', '#ffb020', '#ffd83a', '#e8f53a', '#8ce03a', '#34d45a', '#2fd6b0', '#36b9ff', '#4a7dff', '#9a5cff', '#e152d8'];
const OCTAVE_SHADE = { 3: 0.55, 4: 0.8, 5: 1 };
const IMAGE_WIDTH = 1080;
const IMAGE_HEIGHT = 54;
const IMAGE_MAX_NOTES = 256;

const pitchOf = (name) => String(name || '').replace(/\d+$/, '');
const octaveOf = (name) => Number((String(name || '').match(/(\d+)$/) || [])[1]) || 4;
const noteColor = (name) => {
  const idx = NOTE_NAMES.indexOf(pitchOf(name));
  const hex = NOTE_COLORS[idx >= 0 ? idx : 0];
  const shade = OCTAVE_SHADE[octaveOf(name)] || 1;
  return [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * shade));
};
const colourCount = (sequence) => new Set((sequence || []).map((n) => n && (n.name || n.n)).filter(Boolean)).size;

function melodyImageRaw(sequence) {
  const notes = (sequence || []).filter((n) => n && (n.name || n.n)).slice(0, IMAGE_MAX_NOTES);
  const width = IMAGE_WIDTH;
  const height = IMAGE_HEIGHT;
  const data = Buffer.alloc(width * height * 4, 0);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const durs = notes.map((n) => Math.max(1, Number(n.durMs || n.d) || 1));
  const total = durs.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  notes.forEach((n, i) => {
    const x0 = Math.round((acc / total) * width);
    acc += durs[i];
    const x1 = Math.round((acc / total) * width);
    const [r, g, b] = noteColor(n.name || n.n);
    const right = x1 - x0 > 2 ? x1 - 1 : x1;
    for (let y = 0; y < height; y++) {
      for (let x = x0; x < right; x++) {
        const o = (y * width + x) * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = b;
      }
    }
  });
  return { width, height, data };
}

function embedTextInPixels(pixels, text, channels = 4) {
  const payload = Buffer.from(String(text || ''), 'utf8');
  if (!payload.length || payload.length > 4096) return pixels;
  const lenBuf = Buffer.alloc(2);
  lenBuf.writeUInt16BE(payload.length, 0);
  const full = Buffer.concat([STEG_MAGIC, lenBuf, payload]);
  const slots = Math.floor(pixels.length / channels) * 3;
  if (full.length * 8 > slots) return pixels;
  const out = Buffer.from(pixels);
  for (let i = 0; i < full.length * 8; i++) {
    const bit = (full[i >> 3] >> (7 - (i & 7))) & 1;
    const o = Math.floor(i / 3) * channels + (i % 3);
    out[o] = (out[o] & ~1) | bit;
  }
  return out;
}

function readPixelBits(pixels, channels, startBit, numBits) {
  const out = Buffer.alloc(Math.ceil(numBits / 8), 0);
  for (let i = 0; i < numBits; i++) {
    const k = startBit + i;
    const o = Math.floor(k / 3) * channels + (k % 3);
    if (o >= pixels.length) return null;
    out[i >> 3] |= (pixels[o] & 1) << (7 - (i & 7));
  }
  return out;
}

function extractTextFromPixels(pixels, channels = 4) {
  const magic = readPixelBits(pixels, channels, 0, 16);
  if (!magic || magic[0] !== STEG_MAGIC[0] || magic[1] !== STEG_MAGIC[1]) return null;
  const lenBuf = readPixelBits(pixels, channels, 16, 16);
  const len = lenBuf ? lenBuf.readUInt16BE(0) : 0;
  if (!len || len > 4096) return null;
  const payload = readPixelBits(pixels, channels, 32, len * 8);
  return payload ? payload.toString('utf8') || null : null;
}

async function melodyImagePng(sequence, text = '') {
  const sharp = require('../server/node_modules/sharp');
  const { width, height, data } = melodyImageRaw(sequence);
  const pixels = text ? embedTextInPixels(data, text) : data;
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

async function extractTextFromImage(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  try {
    const sharp = require('../server/node_modules/sharp');
    const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return extractTextFromPixels(data, info.channels);
  } catch (_) { return null; }
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

module.exports = ({ cooler }) => {
  let ssb = null;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  async function getUserMelodyInternal(userId, limit = 200) {
    const client = await openSsb();
    const me = userId || client.id;
    const msgs = await new Promise((resolve, reject) => {
      pull(
        client.createUserStream({ id: me, reverse: true, limit }),
        pull.collect((err, rows) => err ? reject(err) : resolve(rows))
      );
    });
    const seq = msgs
      .filter(m => m && m.value && m.value.content && typeof m.value.content === 'object')
      .map(blockToNote)
      .filter(Boolean)
      .reverse();
    const stats = {};
    for (const n of seq) {
      stats[n.type] = (stats[n.type] || 0) + 1;
    }
    return { feedId: me, total: seq.length, colours: colourCount(seq), sequence: seq, stats };
  }

  return {
    NOTE_NAMES,
    OCTAVES,
    TYPE_TO_DEGREE,
    NOTE_COLORS,
    OCTAVE_SHADE,
    getUserMelody: getUserMelodyInternal,
    noteColor,
    colourCount,
    melodyImagePng,
    extractTextFromImage,
    embedTextInWav,
    extractTextFromWav
  };
};

const STEG_MAGIC = Buffer.from([0xBC, 0x53]);
const STEG_HEADER_BITS = 32;

function embedTextInWav(wavBuffer, text) {
  if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length < 44) return wavBuffer;
  const payload = Buffer.from(String(text || ''), 'utf8');
  if (payload.length === 0) return wavBuffer;
  if (payload.length > 4096) return wavBuffer;
  const lenBuf = Buffer.alloc(2);
  lenBuf.writeUInt16BE(payload.length, 0);
  const fullData = Buffer.concat([STEG_MAGIC, lenBuf, payload]);
  const totalBits = fullData.length * 8;
  const dataLen = wavBuffer.readUInt32LE(40);
  const numSamples = Math.floor(dataLen / 2);
  if (totalBits > numSamples) return wavBuffer;
  const out = Buffer.from(wavBuffer);
  for (let i = 0; i < totalBits; i++) {
    const byteIdx = i >> 3;
    const bitIdx = i & 7;
    const bit = (fullData[byteIdx] >> (7 - bitIdx)) & 1;
    const sampleOffset = 44 + (i * 2);
    let sample = out.readInt16LE(sampleOffset);
    sample = (sample & ~1) | bit;
    out.writeInt16LE(sample, sampleOffset);
  }
  return out;
}

function readBitsAsBuffer(wavBuffer, startBit, numBits) {
  const bytes = Math.ceil(numBits / 8);
  const out = Buffer.alloc(bytes, 0);
  for (let i = 0; i < numBits; i++) {
    const sampleOffset = 44 + ((startBit + i) * 2);
    if (sampleOffset + 2 > wavBuffer.length) return null;
    const sample = wavBuffer.readInt16LE(sampleOffset);
    const bit = sample & 1;
    const byteIdx = i >> 3;
    const bitIdx = i & 7;
    out[byteIdx] |= bit << (7 - bitIdx);
  }
  return out;
}

function extractTextFromWav(wavBuffer) {
  if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length < 44 + STEG_HEADER_BITS * 2) return null;
  if (wavBuffer.slice(0, 4).toString('ascii') !== 'RIFF') return null;
  if (wavBuffer.slice(8, 12).toString('ascii') !== 'WAVE') return null;
  const magic = readBitsAsBuffer(wavBuffer, 0, 16);
  if (!magic || magic[0] !== STEG_MAGIC[0] || magic[1] !== STEG_MAGIC[1]) return null;
  const lenBuf = readBitsAsBuffer(wavBuffer, 16, 16);
  if (!lenBuf) return null;
  const len = lenBuf.readUInt16BE(0);
  if (len === 0 || len > 4096) return null;
  const payload = readBitsAsBuffer(wavBuffer, 32, len * 8);
  if (!payload) return null;
  try {
    const text = payload.toString('utf8');
    if (!text) return null;
    return text;
  } catch (_) { return null; }
}
