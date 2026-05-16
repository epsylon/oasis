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
  chat: 7,
  audio: 8,
  video: 9,
  image: 10,
  document: 11,
  torrent: 0,
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
  tombstone: 4
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
  const degree = TYPE_TO_DEGREE[type] != null ? TYPE_TO_DEGREE[type] : (Math.abs(hashStr(type)) % 12);
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
    return { feedId: me, total: seq.length, sequence: seq, stats };
  }

  return {
    NOTE_NAMES,
    OCTAVES,
    TYPE_TO_DEGREE,
    getUserMelody: getUserMelodyInternal
  };
};
