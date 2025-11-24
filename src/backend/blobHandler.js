const pull = require('../server/node_modules/pull-stream');
const FileType = require("../server/node_modules/file-type");
const promisesFs = require('fs').promises;
const ssb = require("../client/gui");
const config = require("../server/SSB_server").config;
const cooler = ssb({ offline: config.offline });

const handleBlobUpload = async function (ctx, fileFieldName) {
  if (!ctx.request.files || !ctx.request.files[fileFieldName]) {
    return null;
  }

  const blobUpload = ctx.request.files[fileFieldName];
  if (!blobUpload) return null;

  const data = await promisesFs.readFile(blobUpload.filepath);
  if (data.length === 0) return null;

  const ssbClient = await cooler.open();

  const blob = { name: blobUpload.name };
  blob.id = await new Promise((resolve, reject) => {
    pull(
      pull.values([data]),
      ssbClient.blobs.add((err, ref) => (err ? reject(err) : resolve(ref)))
    );
  });

  try {
    const fileType = await FileType.fromBuffer(data);
    blob.mime = fileType.mime;
  } catch {
    blob.mime = "application/octet-stream";
  }

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

module.exports = { handleBlobUpload, serveBlob };

