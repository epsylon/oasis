const fs = require('fs');
const path = require('path');
const Module = require('module');

const SHARP_DIR = path.join(__dirname, 'node_modules', 'sharp');
const WASM_BINDING = path.join(__dirname, 'node_modules', '@img', 'sharp-wasm32', 'lib', 'sharp-wasm32.node.js');

let loaded;
let mode = null;

const nativeUnsupported = () => {
  if (process.platform !== 'linux' || process.arch !== 'x64') return false;
  try { return !/\bsse4_2\b/.test(fs.readFileSync('/proc/cpuinfo', 'utf8')); } catch (_) { return false; }
};

const loadNative = () => require(SHARP_DIR);

const loadWasm = () => {
  const binding = require(WASM_BINDING);
  const file = require.resolve(path.join(SHARP_DIR, 'lib', 'sharp.js'));
  const holder = new Module(file, module);
  holder.filename = file;
  holder.paths = Module._nodeModulePaths(path.dirname(file));
  holder.exports = binding;
  holder.loaded = true;
  require.cache[file] = holder;
  return require(SHARP_DIR);
};

const attempt = (name, load) => {
  try { const lib = load(); mode = name; return lib; } catch (_) { return null; }
};

const getSharp = () => {
  if (loaded !== undefined) return loaded;
  const wanted = String(process.env.OASIS_SHARP || '').toLowerCase();
  if (wanted === 'off') loaded = null;
  else if (wanted === 'wasm') loaded = attempt('wasm', loadWasm);
  else if (wanted === 'native') loaded = attempt('native', loadNative);
  else loaded = (!nativeUnsupported() && attempt('native', loadNative)) || attempt('wasm', loadWasm);
  return loaded;
};

const sharpMode = () => { getSharp(); return mode; };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const COLOR_OF_CHANNELS = { 1: 0, 2: 4, 3: 2, 4: 6 };
const CHANNELS_OF_COLOR = { 0: 1, 4: 2, 2: 3, 6: 4 };

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
};

const encodePng = ({ data, width, height, channels }) => {
  const color = COLOR_OF_CHANNELS[channels];
  if (color === undefined || !width || !height || data.length < width * height * channels) throw new Error('Unsupported raw image');
  const stride = width * channels;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) data.copy(rows, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = color;
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('IDAT', require('zlib').deflateSync(rows, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
};

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

const decodePng = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let o = 8, width = 0, height = 0, channels = 0;
  const idat = [];
  while (o + 8 <= buffer.length) {
    const len = buffer.readUInt32BE(o);
    const type = buffer.toString('ascii', o + 4, o + 8);
    const body = buffer.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = CHANNELS_OF_COLOR[body[9]] || 0;
      if (body[8] !== 8 || !channels || body[12] !== 0) return null;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (!width || !height || !idat.length) return null;
  let rows;
  try { rows = require('zlib').inflateSync(Buffer.concat(idat)); } catch (_) { return null; }
  const stride = width * channels;
  if (rows.length < (stride + 1) * height) return null;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const raw = rows[src + x];
      const left = x >= channels ? data[dst + x - channels] : 0;
      const up = y > 0 ? data[dst - stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? data[dst - stride + x - channels] : 0;
      const pred = filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth(left, up, upLeft) : 0;
      data[dst + x] = (raw + pred) & 0xff;
    }
  }
  return { data, width, height, channels };
};

const rotateRaw = ({ data, width, height, channels }, degrees) => {
  const turn = ((Math.round(Number(degrees) / 90) % 4) + 4) % 4;
  if (!turn) return { data, width, height, channels };
  const w = turn % 2 ? height : width;
  const h = turn % 2 ? width : height;
  const out = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = turn === 1 ? height - 1 - y : turn === 2 ? width - 1 - x : y;
      const ny = turn === 1 ? x : turn === 2 ? height - 1 - y : width - 1 - x;
      data.copy(out, (ny * w + nx) * channels, (y * width + x) * channels, (y * width + x + 1) * channels);
    }
  }
  return { data: out, width: w, height: h, channels };
};

module.exports = { getSharp, sharpMode, nativeUnsupported, encodePng, decodePng, rotateRaw };
