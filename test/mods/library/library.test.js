const { eq, ok, notOk } = require('../../helpers/assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SECRET = 'SECRET-PLACE-40.4168';
const box = (type, payload) => { const b = Buffer.alloc(8); b.writeUInt32BE(8 + payload.length, 0); b.write(type, 4, 'latin1'); return Buffer.concat([b, payload]); };
const syncsafe = (n) => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
const samples = () => {
  const secret = Buffer.from(SECRET, 'latin1');
  const frame = Buffer.concat([Buffer.from('TIT2', 'latin1'), Buffer.from([0, 0, 0, secret.length + 1, 0, 0, 0]), secret]);
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), syncsafe(frame.length), frame, Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(64), Buffer.from('TAG'), Buffer.from(SECRET.padEnd(124, ' '), 'latin1'), Buffer.from([1])]);
  const listChunk = Buffer.concat([Buffer.from('LIST', 'latin1'), Buffer.from([secret.length, 0, 0, 0]), secret]);
  const fmt = Buffer.concat([Buffer.from('fmt ', 'latin1'), Buffer.from([16, 0, 0, 0]), Buffer.alloc(16)]);
  const data = Buffer.concat([Buffer.from('data', 'latin1'), Buffer.from([4, 0, 0, 0]), Buffer.alloc(4)]);
  const riffBody = Buffer.concat([Buffer.from('WAVE', 'latin1'), fmt, listChunk, data]);
  const wav = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([riffBody.length & 0xff, (riffBody.length >> 8) & 0xff, 0, 0]), riffBody]);
  const block = (type, last, payload) => Buffer.concat([Buffer.from([(last ? 0x80 : 0) | type, (payload.length >> 16) & 0xff, (payload.length >> 8) & 0xff, payload.length & 0xff]), payload]);
  const flac = Buffer.concat([Buffer.from('fLaC', 'latin1'), block(0, false, Buffer.alloc(34)), block(4, true, secret)]);
  const mp4 = Buffer.concat([box('ftyp', Buffer.from('isom0000', 'latin1')), box('moov', Buffer.concat([box('mvhd', Buffer.alloc(16)), box('udta', box('©xyz', secret))])), box('mdat', Buffer.alloc(32))]);
  return { 'audio/mpeg': mp3, 'audio/wav': wav, 'audio/flac': flac, 'video/mp4': mp4 };
};

describe('library: what leaves the device with a file', (t) => {
  t('audio and video keep no personal tags, and stay the same size and playable', async () => {
    const { stripFileMetadata } = require('../../../src/backend/blobHandler.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-meta-'));
    try {
      for (const [mime, data] of Object.entries(samples())) {
        const file = path.join(dir, mime.replace('/', '-'));
        fs.writeFileSync(file, data);
        ok(fs.readFileSync(file).includes(Buffer.from(SECRET, 'latin1')), `${mime} starts with the secret`);
        await stripFileMetadata(file, mime);
        const clean = fs.readFileSync(file);
        notOk(clean.includes(Buffer.from(SECRET, 'latin1')), `${mime} keeps nothing of it`);
        eq(clean.length, data.length, `${mime} keeps its size`);
      }
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('library: a torrent is known by its content', (t) => {
  const enc = (v) => typeof v === 'number' ? `i${v}e` : Buffer.isBuffer(v) ? `${v.length}:${v.toString('latin1')}` : typeof v === 'string' ? `${Buffer.byteLength(v)}:${v}` : Array.isArray(v) ? `l${v.map(enc).join('')}e` : `d${Object.keys(v).sort().map(k => enc(k) + enc(v[k])).join('')}e`;

  t('its infohash, files and size come from the torrent itself, and give a magnet link', () => {
    const { parseTorrent, magnetFor } = require('../../../src/models/torrents_model');
    const info = { name: 'album', 'piece length': 16384, pieces: Buffer.alloc(20), files: [{ length: 300, path: ['one.flac'] }, { length: 200, path: ['two.flac'] }] };
    const torrent = Buffer.from(enc({ announce: 'udp://tracker.example:1337', info }), 'latin1');
    const parsed = parseTorrent(torrent);
    eq(parsed.infoHash, crypto.createHash('sha1').update(Buffer.from(enc(info), 'latin1')).digest('hex'));
    eq(parsed.length, 500);
    eq(parsed.fileCount, 2);
    const magnet = magnetFor(parsed);
    ok(magnet.startsWith(`magnet:?xt=urn:btih:${parsed.infoHash}`));
    ok(magnet.includes('tr=udp%3A%2F%2Ftracker.example%3A1337'));
    let refused = false;
    try { parseTorrent(Buffer.from('not a torrent')); } catch (_) { refused = true; }
    ok(refused, 'anything else is not a torrent');
  });
});

describe('library: sizes read like people say them', (t) => {
  t('from bytes to terabytes', () => {
    const { formatSize } = require('../../../src/views/main_views');
    eq(formatSize(512), '512 B');
    eq(formatSize(1536), '1.5 KB');
    eq(formatSize(3 * 1024 ** 3), '3.0 GB');
    eq(formatSize(2 * 1024 ** 4), '2.0 TB');
  });
});
