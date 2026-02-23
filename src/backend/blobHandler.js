const pull = require('../server/node_modules/pull-stream');
const FileType = require("../server/node_modules/file-type");
const promisesFs = require('fs').promises;
const ssb = require("../client/gui");
const config = require("../server/SSB_server").config;
const cooler = ssb({ offline: config.offline });

let sharp;
try {
  sharp = require("sharp");
} catch (e) {
}

const stripImageMetadata = async (buffer) => {
  if (typeof sharp !== "function") return buffer;
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

const MAX_BLOB_SIZE = 50 * 1024 * 1024;

class FileTooLargeError extends Error {
  constructor(fileName, fileSize) {
    super(`File too large: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
    this.name = 'FileTooLargeError';
    this.fileName = fileName;
    this.fileSize = fileSize;
  }
}

const handleBlobUpload = async function (ctx, fileFieldName) {
  if (!ctx.request.files || !ctx.request.files[fileFieldName]) {
    return null;
  }

  const blobUpload = ctx.request.files[fileFieldName];
  if (!blobUpload) return null;

  let data = await promisesFs.readFile(blobUpload.filepath);
  if (data.length === 0) return null;

  if (data.length > MAX_BLOB_SIZE) {
    throw new FileTooLargeError(blobUpload.originalFilename || blobUpload.name || fileFieldName, data.length);
  }

  const EXTENSION_MIME_MAP = {
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogg': 'video/ogg',
    '.ogv': 'video/ogg', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.flac': 'audio/flac', '.aac': 'audio/aac', '.opus': 'audio/opus',
    '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.bmp': 'image/bmp'
  };

  const blob = { name: blobUpload.originalFilename || blobUpload.name || 'file' };

  try {
    const fileType = await FileType.fromBuffer(data);
    blob.mime = (fileType && fileType.mime) ? fileType.mime : null;
  } catch {
    blob.mime = null;
  }

  if (!blob.mime && blob.name) {
    const ext = (blob.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    blob.mime = EXTENSION_MIME_MAP[ext] || 'application/octet-stream';
  }

  if (!blob.mime) {
    blob.mime = 'application/octet-stream';
  }

  if (blob.mime.startsWith('image/')) {
    data = await stripImageMetadata(data);
  } else if (blob.mime === 'application/pdf') {
    data = stripPdfMetadata(data);
  }

  const ssbClient = await cooler.open();

  blob.id = await new Promise((resolve, reject) => {
    pull(
      pull.values([data]),
      ssbClient.blobs.add((err, ref) => (err ? reject(err) : resolve(ref)))
    );
  });

  if (blob.mime.startsWith("image/")) return `\n![image:${blob.name}](${blob.id})`;
  if (blob.mime.startsWith("audio/")) return `\n[audio:${blob.name}](${blob.id})`;
  if (blob.mime.startsWith("video/")) return `\n[video:${blob.name}](${blob.id})`;
  if (blob.mime === "application/pdf") return `[pdf:${blob.name}](${blob.id})`;

  return `\n[${blob.name}](${blob.id})`;
};

function waitForBlob(ssbClient, blobId, timeoutMs = 60000) {
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
    await waitForBlob(ssbClient, blobId, 60000);
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

  const size = buffer.length;

  let mime = 'application/octet-stream';
  try {
    const ft = await FileType.fromBuffer(buffer);
    if (ft && ft.mime) mime = ft.mime;
  } catch {}

  ctx.type = mime;
  ctx.set('Content-Disposition', `inline; filename="${raw}"`);
  ctx.set('Cache-Control', 'public, max-age=31536000, immutable');

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

module.exports = { handleBlobUpload, serveBlob, FileTooLargeError };

