const pull = require('../server/node_modules/pull-stream');
const fs = require('fs');
const crypto = require('crypto');
const { Readable } = require('stream');
const fsc = require('../backend/fileshare_crypto');

const MAX_CHUNK_SIZE = 5 * 1024 * 1024;

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const addBlob = (client, buffer) =>
    new Promise((resolve, reject) => {
      pull(pull.values([buffer]), client.blobs.add((err, ref) => err ? reject(err) : resolve(ref)));
    });

  const getBlob = (client, ref) =>
    new Promise((resolve, reject) => {
      pull(client.blobs.get(ref), pull.collect((err, chunks) => err ? reject(err) : resolve(Buffer.concat(chunks))));
    });

  const hasBlob = (client, ref) =>
    new Promise((resolve) => {
      if (!client.blobs || typeof client.blobs.has !== 'function') return resolve(false);
      client.blobs.has(ref, (err, has) => resolve(!err && !!has));
    });

  const wantBlob = (client, ref, timeoutMs) =>
    new Promise((resolve) => {
      if (typeof client.blobs.want !== 'function') return resolve(true);
      let done = false;
      const finish = (ok) => { if (done) return; done = true; if (timer) clearTimeout(timer); resolve(ok); };
      const timer = timeoutMs ? setTimeout(() => finish(false), timeoutMs) : null;
      client.blobs.want(ref, (err) => finish(!err));
    });

  const rmBlob = (client, ref) =>
    new Promise((resolve) => {
      if (typeof client.blobs.rm !== 'function') return resolve(false);
      client.blobs.rm(ref, (err) => resolve(!err));
    });

  const createShareFromBuffer = async ({ buffer, filename, mime, chunkSize } = {}) => {
    if (!Buffer.isBuffer(buffer)) throw new Error('buffer required');
    const client = await openSsb();
    const key = fsc.generateFileKey();
    const size = fsc.DEFAULT_CHUNK_SIZE;
    const useChunk = Math.min(Number(chunkSize) || fsc.DEFAULT_CHUNK_SIZE, MAX_CHUNK_SIZE);

    const chunkHashes = [];
    for (const part of fsc.splitBuffer(buffer, useChunk)) {
      const payload = fsc.encryptChunk(part, key);
      chunkHashes.push(await addBlob(client, payload));
    }

    const manifest = fsc.buildManifest({
      filename, mime, size: buffer.length, chunkSize: useChunk,
      chunkHashes, plainSha256: fsc.sha256Hex(buffer)
    });
    const manifestBlobId = await addBlob(client, fsc.encryptManifest(manifest, key));

    return {
      type: 'fileShare',
      v: 1,
      key: fsc.keyToHex(key),
      manifestBlobId,
      filename: manifest.filename,
      mime: manifest.mime,
      size: manifest.size,
      chunkCount: chunkHashes.length
    };
  };

  const createShareFromFile = async ({ filepath, filename, mime, chunkSize } = {}) => {
    if (!filepath) throw new Error('filepath required');
    const client = await openSsb();
    const key = fsc.generateFileKey();
    const useChunk = Math.min(Number(chunkSize) || fsc.DEFAULT_CHUNK_SIZE, MAX_CHUNK_SIZE);
    const chunkHashes = [];
    const hashAll = crypto.createHash('sha256');
    let total = 0;
    let carry = Buffer.alloc(0);
    const flush = async (part) => {
      hashAll.update(part);
      total += part.length;
      chunkHashes.push(await addBlob(client, fsc.encryptChunk(part, key)));
    };
    for await (const data of fs.createReadStream(filepath, { highWaterMark: useChunk })) {
      carry = carry.length ? Buffer.concat([carry, data]) : data;
      while (carry.length >= useChunk) {
        await flush(carry.subarray(0, useChunk));
        carry = carry.subarray(useChunk);
      }
    }
    if (carry.length || !chunkHashes.length) await flush(carry);

    const manifest = fsc.buildManifest({
      filename, mime, size: total, chunkSize: useChunk,
      chunkHashes, plainSha256: hashAll.digest('hex')
    });
    const manifestBlobId = await addBlob(client, fsc.encryptManifest(manifest, key));

    return {
      type: 'fileShare', v: 1,
      key: fsc.keyToHex(key), manifestBlobId,
      filename: manifest.filename, mime: manifest.mime, size: manifest.size,
      chunkCount: chunkHashes.length
    };
  };

  const openManifest = async (pointer) => {
    const client = await openSsb();
    const key = fsc.keyFromHex(pointer.key);
    await wantBlob(client, pointer.manifestBlobId);
    const payload = await getBlob(client, pointer.manifestBlobId);
    return fsc.decryptManifest(payload, key);
  };

  const CHUNK_WANT_TIMEOUT = 30000;
  const PREFLIGHT_TIMEOUT = 12000;

  const readShareStream = (pointer) => {
    const key = fsc.keyFromHex(pointer.key);
    async function* gen() {
      const client = await openSsb();
      if (!(await wantBlob(client, pointer.manifestBlobId, CHUNK_WANT_TIMEOUT))) throw new Error('fileshare blob unavailable');
      const manifest = fsc.decryptManifest(await getBlob(client, pointer.manifestBlobId), key);
      for (const ref of manifest.chunks) {
        if (!(await wantBlob(client, ref, CHUNK_WANT_TIMEOUT))) throw new Error('fileshare blob unavailable');
        yield fsc.decryptChunk(await getBlob(client, ref), key);
      }
    }
    return Readable.from(gen());
  };

  const ensureAvailable = async (pointer, timeoutMs = PREFLIGHT_TIMEOUT) => {
    try {
      const client = await openSsb();
      const key = fsc.keyFromHex(pointer.key);
      if (!(await wantBlob(client, pointer.manifestBlobId, timeoutMs))) return false;
      const manifest = fsc.decryptManifest(await getBlob(client, pointer.manifestBlobId), key);
      if (manifest.chunks.length && !(await wantBlob(client, manifest.chunks[0], timeoutMs))) return false;
      return true;
    } catch (_) {
      return false;
    }
  };

  const reassembleToBuffer = async (pointer) => {
    const parts = [];
    for await (const chunk of readShareStream(pointer)) parts.push(chunk);
    return Buffer.concat(parts);
  };

  const isAvailable = async (pointer) => {
    const client = await openSsb();
    if (!(await hasBlob(client, pointer.manifestBlobId))) return false;
    try {
      const key = fsc.keyFromHex(pointer.key);
      const manifest = fsc.decryptManifest(await getBlob(client, pointer.manifestBlobId), key);
      for (const ref of manifest.chunks) if (!(await hasBlob(client, ref))) return false;
      return true;
    } catch (_) {
      return false;
    }
  };

  const removeLocalBlobs = async (pointer) => {
    const client = await openSsb();
    let removed = 0;
    try {
      const key = fsc.keyFromHex(pointer.key);
      if (await hasBlob(client, pointer.manifestBlobId)) {
        const manifest = fsc.decryptManifest(await getBlob(client, pointer.manifestBlobId), key);
        for (const ref of manifest.chunks) if (await rmBlob(client, ref)) removed++;
      }
    } catch (_) {}
    if (await rmBlob(client, pointer.manifestBlobId)) removed++;
    return removed;
  };

  const pruneExpired = async (sentFileShares, ttlMs, now) => {
    const cutoff = (Number.isFinite(now) ? now : Date.now()) - (Number(ttlMs) || 0);
    let pruned = 0;
    for (const item of (Array.isArray(sentFileShares) ? sentFileShares : [])) {
      if (!item || !item.pointer) continue;
      const sentAt = new Date(item.sentAt || 0).getTime();
      if (!(sentAt <= cutoff)) continue;
      const n = await removeLocalBlobs(item.pointer);
      if (n > 0) pruned++;
    }
    return pruned;
  };

  return { createShareFromBuffer, createShareFromFile, openManifest, readShareStream, reassembleToBuffer, isAvailable, ensureAvailable, removeLocalBlobs, pruneExpired };
};
