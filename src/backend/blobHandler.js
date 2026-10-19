const pull = require('../server/node_modules/pull-stream');
const FileType = require("../server/node_modules/file-type");
const promisesFs = require('fs').promises;
const ssb = require("../client/gui");
const config = require("../server/SSB_server").config;
const cooler = ssb({ offline: config.offline });

let sharpLib;
const getSharp = () => {
  if (sharpLib === undefined) {
    try { sharpLib = require('../server/node_modules/sharp'); } catch (_) { sharpLib = null; }
  }
  return sharpLib;
};

const stripImageMetadata = async (buffer) => {
  const sharp = getSharp();
  if (!sharp) return buffer;
  try {
    return await sharp(buffer).rotate().toBuffer();
  } catch {
    return buffer;
  }
};

const PDF_METADATA_KEYS = [
  '/Title', '/Author', '/Subject', '/Keywords',
  '/Creator', '/Producer', '/CreationDate', '/ModDate'
];

const stripPdfMetadata = (buffer) => {
  try {
    let str = buffer.toString('binary');
    for (const key of PDF_METADATA_KEYS) {
      const keyBytes = key;
      const regex = new RegExp(
        keyBytes.replace(/\//g, '\\/') + '\\s*\\([^)]*\\)',
        'g'
      );
      str = str.replace(regex, keyBytes + ' ()');
      const hexRegex = new RegExp(
        keyBytes.replace(/\//g, '\\/') + '\\s*<[^>]*>',
        'g'
      );
      str = str.replace(hexRegex, keyBytes + ' <>');
    }
    return Buffer.from(str, 'binary');
  } catch {
    return buffer;
  }
};

const STRIP_CHUNK = 64 * 1024;
const STRIP_IN_MEMORY_MAX = 256 * 1024 * 1024;
const FFMPEG_STRIP_MS = 120000;
const MP4_LIKE = /mp4|quicktime|m4a|m4v|3gpp/;
const MP4_METADATA_BOXES = new Set(['udta', 'meta']);
const MP4_WALKED_BOXES = new Set(['moov', 'trak']);
const XMP_UUID = Buffer.from('be7acfcb97a942e89c71999491e3afac', 'hex');
const WAV_METADATA_CHUNKS = new Set(['LIST', 'id3 ', 'ID3 ', 'bext', 'iXML', '_PMX', 'XMP ']);
const FLAC_METADATA_BLOCKS = new Set([4, 6]);
const FLAC_PADDING = 1;
const ID3V1_NO_GENRE = 255;
const FFMPEG_FORMATS = { 'video/webm': 'webm', 'audio/webm': 'webm', 'video/x-matroska': 'matroska', 'audio/x-matroska': 'matroska', 'video/ogg': 'ogg', 'audio/ogg': 'ogg', 'audio/opus': 'ogg', 'video/x-msvideo': 'avi' };

const readAt = async (fh, pos, len) => {
  const buf = Buffer.alloc(len);
  const { bytesRead } = await fh.read(buf, 0, len, pos);
  return buf.subarray(0, bytesRead);
};

const zeroAt = async (fh, pos, len) => {
  const zeros = Buffer.alloc(Math.min(len, STRIP_CHUNK));
  for (let done = 0; done < len; done += zeros.length) await fh.write(zeros, 0, Math.min(zeros.length, len - done), pos + done);
};

const stripMp4 = async (fh, start, end, depth = 0) => {
  let pos = start;
  while (pos + 8 <= end) {
    const head = await readAt(fh, pos, 16);
    if (head.length < 8) return;
    let size = head.readUInt32BE(0);
    let header = 8;
    const type = head.toString('latin1', 4, 8);
    if (size === 1) { if (head.length < 16) return; size = Number(head.readBigUInt64BE(8)); header = 16; }
    else if (size === 0) size = end - pos;
    if (size < header || pos + size > end) return;
    const isXmp = type === 'uuid' && (await readAt(fh, pos + header, XMP_UUID.length)).equals(XMP_UUID);
    if (MP4_METADATA_BOXES.has(type) || isXmp) {
      await fh.write(Buffer.from('free', 'latin1'), 0, 4, pos + 4);
      await zeroAt(fh, pos + header, size - header);
    }
    else if (MP4_WALKED_BOXES.has(type) && depth < MP4_WALKED_BOXES.size) await stripMp4(fh, pos + header, pos + size, depth + 1);
    pos += size;
  }
};

const stripMp3 = async (fh, size) => {
  const head = await readAt(fh, 0, 10);
  if (head.length === 10 && head.toString('latin1', 0, 3) === 'ID3') {
    const tagSize = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
    const footer = head[5] & 0x10 ? 10 : 0;
    await fh.write(Buffer.from([0]), 0, 1, 5);
    await zeroAt(fh, 10, Math.min(tagSize + footer, size - 10));
  }
  if (size >= 128 && (await readAt(fh, size - 128, 3)).toString('latin1') === 'TAG') {
    await zeroAt(fh, size - 125, 125);
    await fh.write(Buffer.from([ID3V1_NO_GENRE]), 0, 1, size - 1);
  }
};

const stripFlac = async (fh, size) => {
  if ((await readAt(fh, 0, 4)).toString('latin1') !== 'fLaC') return;
  for (let pos = 4; pos + 4 <= size;) {
    const head = await readAt(fh, pos, 4);
    if (head.length < 4) return;
    const last = head[0] & 0x80;
    const len = head.readUIntBE(1, 3);
    if (FLAC_METADATA_BLOCKS.has(head[0] & 0x7f)) {
      await fh.write(Buffer.from([last | FLAC_PADDING]), 0, 1, pos);
      await zeroAt(fh, pos + 4, len);
    }
    if (last) return;
    pos += 4 + len;
  }
};

const stripWav = async (fh, size) => {
  const head = await readAt(fh, 0, 12);
  if (head.length < 12 || head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 12) !== 'WAVE') return;
  for (let pos = 12; pos + 8 <= size;) {
    const chunk = await readAt(fh, pos, 8);
    if (chunk.length < 8) return;
    const len = chunk.readUInt32LE(4);
    if (WAV_METADATA_CHUNKS.has(chunk.toString('latin1', 0, 4))) {
      await fh.write(Buffer.from('JUNK', 'latin1'), 0, 4, pos);
      await zeroAt(fh, pos + 8, Math.min(len, size - pos - 8));
    }
    pos += 8 + len + (len & 1);
  }
};

const stripWithFfmpeg = (filepath, format) => new Promise((resolve) => {
  const out = `${filepath}.clean`;
  const args = ['-v', 'error', '-y', '-i', filepath, '-map', '0', '-map_metadata', '-1', '-c', 'copy', '-f', format, out];
  require('child_process').execFile(process.env.OASIS_FFMPEG || 'ffmpeg', args, { timeout: FFMPEG_STRIP_MS }, async (err) => {
    try {
      if (err) await promisesFs.unlink(out).catch(() => {});
      else await promisesFs.rename(out, filepath);
    } catch (_) {}
    resolve();
  });
});

const stripFileMetadata = async (filepath, mime) => {
  const m = String(mime || '');
  try {
    const { size } = await promisesFs.stat(filepath);
    if ((m.startsWith('image/') && m !== 'image/gif') || m === 'application/pdf') {
      if (size > STRIP_IN_MEMORY_MAX) return;
      const data = await promisesFs.readFile(filepath);
      const clean = m === 'application/pdf' ? stripPdfMetadata(data) : await stripImageMetadata(data);
      if (clean !== data) await promisesFs.writeFile(filepath, clean);
      return;
    }
    if (!m.startsWith('audio/') && !m.startsWith('video/')) return;
    if (FFMPEG_FORMATS[m]) { await stripWithFfmpeg(filepath, FFMPEG_FORMATS[m]); return; }
    const fh = await promisesFs.open(filepath, 'r+');
    try {
      if (MP4_LIKE.test(m)) await stripMp4(fh, 0, size);
      else if (m === 'audio/mpeg') await stripMp3(fh, size);
      else if (m === 'audio/flac' || m === 'audio/x-flac') await stripFlac(fh, size);
      else if (/wav|wave/.test(m)) await stripWav(fh, size);
    } finally { await fh.close(); }
  } catch (_) {}
};

const MAX_BLOB_SIZE = 75 * 1024 * 1024;
const KIND_MIME = { image: /^image\//, audio: /^audio\//, video: /^video\//, document: /^application\/pdf$/, torrent: /^application\/x-bittorrent$/ };
const looksLikeTorrent = (data) => data.length > 0 && data[0] === 0x64 && data.subarray(0, 4096).includes(Buffer.from('4:info'));

class WrongFileTypeError extends Error {
  constructor(fileName, mime) {
    super(`Wrong file type: ${fileName} (${mime})`);
    this.name = 'WrongFileTypeError';
  }
}

class FileTooLargeError extends Error {
  constructor(fileName, fileSize) {
    super(`File too large: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
    this.name = 'FileTooLargeError';
    this.fileName = fileName;
    this.fileSize = fileSize;
  }
}

const OGG_VIDEO_MARKERS = ['theora', 'VP80', 'OggDS', 'Dirac'];
const OGG_AUDIO_MARKERS = ['vorbis', 'OpusHead', 'FLAC', 'Speex'];

const oggMime = (buffer) => {
  const head = buffer.slice(0, 65536);
  for (const marker of OGG_VIDEO_MARKERS) if (head.includes(Buffer.from(marker))) return 'video/ogg';
  for (const marker of OGG_AUDIO_MARKERS) if (head.includes(Buffer.from(marker))) return 'audio/ogg';
  return 'video/ogg';
};

const sealedRef = (sealed, mime, name) => `/blob/sealed/${encodeURIComponent(sealed.manifestBlobId)}?k=${encodeURIComponent(sealed.key)}&t=${encodeURIComponent(mime)}&n=${encodeURIComponent(name)}`;

const storeUploadedFile = async function (blobUpload, seal = null, kind = null) {
  if (!blobUpload || !blobUpload.filepath) return null;

  let data = await promisesFs.readFile(blobUpload.filepath);
  if (data.length === 0) return null;

  if (data.length > MAX_BLOB_SIZE) {
    throw new FileTooLargeError(blobUpload.originalFilename || blobUpload.name || 'file', data.length);
  }

  const EXTENSION_MIME_MAP = {
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg',
    '.ogv': 'video/ogg', '.oga': 'audio/ogg', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.flac': 'audio/flac', '.aac': 'audio/aac', '.opus': 'audio/opus',
    '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
    '.torrent': 'application/x-bittorrent'
  };

  const blob = { name: blobUpload.originalFilename || blobUpload.name || 'file' };

  try {
    const fileType = await FileType.fromBuffer(data);
    blob.mime = (fileType && fileType.mime) ? fileType.mime : null;
  } catch {
    blob.mime = null;
  }

  if (blob.mime === 'application/ogg') blob.mime = oggMime(data);

  const GENERIC_MIMES = new Set(['application/octet-stream', 'video/x-matroska']);
  if ((!blob.mime || GENERIC_MIMES.has(blob.mime)) && blob.name) {
    const ext = (blob.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    blob.mime = EXTENSION_MIME_MAP[ext] || blob.mime || 'application/octet-stream';
  }

  if (!blob.mime) {
    blob.mime = 'application/octet-stream';
  }
  if (blob.mime === 'application/octet-stream' && looksLikeTorrent(data)) blob.mime = 'application/x-bittorrent';
  if (kind && KIND_MIME[kind] && !KIND_MIME[kind].test(blob.mime)) throw new WrongFileTypeError(blob.name, blob.mime);

  if (blob.mime.startsWith('image/') && blob.mime !== 'image/gif') {
    data = await stripImageMetadata(data);
  } else if (blob.mime === 'application/pdf') {
    data = stripPdfMetadata(data);
  } else if (blob.mime.startsWith('audio/') || blob.mime.startsWith('video/')) {
    await stripFileMetadata(blobUpload.filepath, blob.mime);
    data = await promisesFs.readFile(blobUpload.filepath);
  }

  if (typeof seal === 'function') {
    await promisesFs.writeFile(blobUpload.filepath, data);
    const sealed = await seal({ filepath: blobUpload.filepath, size: data.length, name: blob.name, mime: blob.mime });
    blob.id = sealedRef(sealed, blob.mime, blob.name);
  } else {
    const ssbClient = await cooler.open();
    blob.id = await new Promise((resolve, reject) => {
      pull(
        pull.values([data]),
        ssbClient.blobs.add((err, ref) => (err ? reject(err) : resolve(ref)))
      );
    });
  }

  if (blob.mime.startsWith("image/")) return `\n![image:${blob.name}](${blob.id})`;
  if (blob.mime.startsWith("audio/")) return `\n[audio:${blob.name}](${blob.id})`;
  if (blob.mime.startsWith("video/")) return `\n[video:${blob.name}](${blob.id})`;
  if (blob.mime === "application/pdf") return `[pdf:${blob.name}](${blob.id})`;
  if (blob.mime === "application/x-bittorrent") return `\n[torrent:${blob.name}](${blob.id})`;

  return `\n[${blob.name}](${blob.id})`;
};

const handleBlobUpload = async function (ctx, fileFieldName, seal = null, kind = null) {
  if (!ctx.request.files || !ctx.request.files[fileFieldName]) return null;
  const entry = ctx.request.files[fileFieldName];
  const first = Array.isArray(entry) ? entry[0] : entry;
  return storeUploadedFile(first, seal, kind);
};

const handleBlobUploads = async function (ctx, fileFieldName, max = 8, seal = null) {
  if (!ctx.request.files || !ctx.request.files[fileFieldName]) return [];
  const entry = ctx.request.files[fileFieldName];
  const files = (Array.isArray(entry) ? entry : [entry]).slice(0, Math.max(0, max));
  const out = [];
  for (const file of files) {
    const stored = await storeUploadedFile(file, seal);
    if (stored) out.push(stored);
  }
  return out;
};

function waitForBlob(ssbClient, blobId, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    let done = false;

    const finishOk = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };

    const finishErr = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    };

    const timer = setTimeout(() => {
      finishErr(new Error(`Timeout waiting for blob ${blobId}`));
    }, timeoutMs);

    if (!ssbClient.blobs || typeof ssbClient.blobs.has !== 'function') {
      return finishErr(new Error('ssb.blobs.has is not available'));
    }

    ssbClient.blobs.has(blobId, (err, has) => {
      if (err) return finishErr(err);
      if (has) return finishOk();

      if (typeof ssbClient.blobs.want !== 'function') {
        return finishErr(new Error('ssb.blobs.want is not available'));
      }

      ssbClient.blobs.want(blobId, (err2) => {
        if (err2) return finishErr(err2);
        finishOk();
      });
    });
  });
}

const contentDisposition = (type, name) => {
  const clean = String(name || 'file').replace(/["\r\n\\/]/g, '').trim() || 'file';
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_');
  if (ascii === clean) return `${type}; filename="${clean}"`;
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`;
};

const sendBlobBuffer = (ctx, buffer) => {
  const size = buffer.length;
  const range = ctx.headers.range;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      ctx.status = 416;
      ctx.set('Content-Range', `bytes */${size}`);
      return;
    }

    let start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : size - 1;

    if (Number.isNaN(start) || start < 0) start = 0;
    if (Number.isNaN(end) || end >= size) end = size - 1;

    if (start > end || start >= size) {
      ctx.status = 416;
      ctx.set('Content-Range', `bytes */${size}`);
      return;
    }

    const chunk = buffer.slice(start, end + 1);

    ctx.status = 206;
    ctx.set('Content-Range', `bytes ${start}-${end}/${size}`);
    ctx.set('Accept-Ranges', 'bytes');
    ctx.set('Content-Length', String(chunk.length));
    ctx.body = chunk;
  } else {
    ctx.status = 200;
    ctx.set('Accept-Ranges', 'bytes');
    ctx.set('Content-Length', String(size));
    ctx.body = buffer;
  }
};

const serveBlob = async function (ctx) {
  const encodedParam = (ctx.params.id || ctx.params.blobId || '').trim();
  const raw = decodeURIComponent(encodedParam);

  if (!raw) {
    ctx.status = 400;
    ctx.body = 'Invalid blob id';
    return;
  }

  const blobId = raw.startsWith('&') ? raw : `&${raw}`;

  const ssbClient = await cooler.open();

  try {
    await waitForBlob(ssbClient, blobId, 8000);
  } catch (err) {
    ctx.status = 504;
    ctx.body = 'Blob not available';
    return;
  }

  let buffer;
  try {
    buffer = await new Promise((resolve, reject) => {
      pull(
        ssbClient.blobs.get(blobId),
        pull.collect((err, chunks) => {
          if (err) return reject(err);
          resolve(Buffer.concat(chunks));
        })
      );
    });
  } catch (err) {
    ctx.status = 500;
    ctx.body = 'Error reading blob';
    return;
  }

  let mime = 'application/octet-stream';
  try {
    const ft = await FileType.fromBuffer(buffer);
    if (ft && ft.mime) mime = ft.mime;
  } catch {}

  if (mime === 'application/octet-stream' && buffer.length > 10 && buffer[0] === 0x64) {
    const head = buffer.slice(0, 512).toString('ascii');
    if (head.includes('announce') || head.includes('8:announce') || head.includes('4:info')) mime = 'application/x-bittorrent';
  }

  if (mime === 'application/octet-stream' || mime === 'text/plain' || mime === 'application/xml' || mime === 'text/xml') {
    let head = buffer.slice(0, 512).toString('utf8');
    if (head.charCodeAt(0) === 0xFEFF) head = head.slice(1);
    const trimmed = head.replace(/^\s+/, '').toLowerCase();
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<svg')) {
      if (trimmed.includes('<svg')) mime = 'image/svg+xml';
    }
  }

  if (mime === 'application/ogg') mime = oggMime(buffer);

  const isSvg = mime === 'image/svg+xml';
  const qName = ctx.query.name ? String(ctx.query.name).replace(/["\r\n\\]/g, '').trim() : '';
  const safeRaw = String(raw).replace(/["\r\n\\]/g, '');
  const wantsDownload = String(ctx.query.download || '') === '1';
  const extByMime = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'application/pdf': 'pdf', 'application/x-bittorrent': 'torrent' };
  const ext = extByMime[mime] || String(mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin';
  const filename = qName || (mime === 'application/x-bittorrent' ? 'download.torrent' : (wantsDownload ? `oasis-${safeRaw.replace(/^&/, '').slice(0, 8)}.${ext}` : safeRaw));
  const disposition = isSvg || wantsDownload ? 'attachment' : 'inline';
  ctx.type = mime;
  ctx.set('Content-Disposition', contentDisposition(disposition, filename));
  ctx.set('Cache-Control', 'public, max-age=31536000, immutable');

  sendBlobBuffer(ctx, buffer);
};

module.exports = { handleBlobUpload, handleBlobUploads, serveBlob, sendBlobBuffer, contentDisposition, oggMime, FileTooLargeError, WrongFileTypeError, stripImageMetadata, stripFileMetadata };

