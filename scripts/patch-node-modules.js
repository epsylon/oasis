const fs = require('fs');
const path = require('path');

const log = (msg) => console.log(`[OASIS] [PATCH] ${msg}`);

// === Patch ssb-ref ===
const ssbRefPath = path.resolve(__dirname, '../src/server/node_modules/ssb-ref/index.js');
if (fs.existsSync(ssbRefPath)) {
  const data = fs.readFileSync(ssbRefPath, 'utf8');
  const alreadyClean = /exports\.parseAddress\s*=\s*parseAddress/.test(data);
  if (!alreadyClean) {
    const patched = data.replace(
      /exports\.parseAddress\s*=\s*deprecate\(\s*['"][^'"]*['"]\s*,\s*parseAddress\s*\)/,
      'exports.parseAddress = parseAddress'
    );
    if (patched !== data) {
      fs.writeFileSync(ssbRefPath, patched);
      log('Patched ssb-ref to remove deprecated usage of parseAddress');
    } else {
      log('ssb-ref patch skipped: unexpected parseAddress export format');
    }
  }
} else {
  log('ssb-ref patch skipped: file not found at ' + ssbRefPath);
}

// === Patch ssb-blobs ===
const ssbBlobsPath = path.resolve(__dirname, '../src/server/node_modules/ssb-blobs/inject.js');
if (fs.existsSync(ssbBlobsPath)) {
  let data = fs.readFileSync(ssbBlobsPath, 'utf8');

  const marker = 'want: function (id, cb)';
  const startIndex = data.indexOf(marker);
  if (startIndex !== -1) {
    const endIndex = data.indexOf('},', startIndex);
    if (endIndex !== -1) {
      const before = data.slice(0, startIndex);
      const after = data.slice(endIndex + 2);

      const replacement = `
  want: function (id, cb) {
    id = toBlobId(id);
    if (!isBlobId(id)) return cb(new Error('invalid id:' + id));

    if (blobStore.isEmptyHash(id)) return cb(null, true);

    if (wantCallbacks[id]) {
      if (!Array.isArray(wantCallbacks[id])) wantCallbacks[id] = [];
      wantCallbacks[id].push(cb);
    } else {
      wantCallbacks[id] = [cb];
      blobStore.size(id, function (err, size) {
        if (err) return cb(err);
        if (size != null) {
          while (wantCallbacks[id].length) {
            const fn = wantCallbacks[id].shift();
            if (typeof fn === 'function') fn(null, true);
          }
          delete wantCallbacks[id];
        }
      });
    }

    const peerId = findPeerWithBlob(id);
    if (peerId) get(peerId, id);

    if (wantCallbacks[id]) registerWant(id);
  },`;

      const finalData = before + replacement + after;
      fs.writeFileSync(ssbBlobsPath, finalData);
      log('Patched ssb-blobs to fix wantCallbacks handling');
    } else {
      log('ssb-blobs patch skipped: end of want function not found');
    }
  } else {
    log('ssb-blobs patch skipped: want function not found');
  }
}

// === Patch @xenova/transformers (onnxruntime 1.19 Tensor getter) ===
const xenovaTensorPath = path.resolve(__dirname, '../src/server/node_modules/@xenova/transformers/src/utils/tensor.js');
if (fs.existsSync(xenovaTensorPath)) {
  let data = fs.readFileSync(xenovaTensorPath, 'utf8');
  if (!data.includes('this.data = args[0].data')) {
    const patched = data
      .replace(
        "        if (args[0] instanceof ONNXTensor) {\n            // Create shallow copy\n            Object.assign(this, args[0]);\n",
        "        if (args[0] instanceof ONNXTensor) {\n            // Create shallow copy\n            Object.assign(this, args[0]);\n            if (this.data === undefined) this.data = args[0].data;\n"
      )
      .replace(
        "                args[2]\n            ));\n        }",
        "                args[2]\n            ));\n            if (this.data === undefined && this.cpuData !== undefined) this.data = this.cpuData;\n        }"
      );
    if (patched !== data) {
      fs.writeFileSync(xenovaTensorPath, patched);
      log('Patched @xenova/transformers tensor.js for onnxruntime 1.19 data getter');
    } else {
      log('@xenova/transformers patch skipped: unexpected tensor.js format');
    }
  }
} else {
  log('@xenova/transformers patch skipped: file not found');
}
