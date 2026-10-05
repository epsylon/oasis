const fs = require('fs');
const path = require('path');

const verbose = process.argv.includes('--verbose') || process.env.OASIS_DEBUG === '1' || process.env.OASIS_DEBUG === 'true';
const log = (msg) => { if (verbose) console.log(`[OASIS] [PATCH] ${msg}`); };

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
  if (data.includes('if (wantCallbacks[id]) registerWant(id);')) {
    log('ssb-blobs already patched');
  } else if (startIndex !== -1) {
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

// === Patch ssb-db2 (onceWhen leaks its listener when the condition already holds) ===
const ssbDb2UtilsPath = path.resolve(__dirname, '../src/server/node_modules/ssb-db2/utils.js');
if (fs.existsSync(ssbDb2UtilsPath)) {
  const data = fs.readFileSync(ssbDb2UtilsPath, 'utf8');
  if (!data.includes('answered = true\n    cb()\n    return false')) {
    const start = data.indexOf('function onceWhen(obv, filter, cb) {');
    const end = data.indexOf('\n}\n', start);
    if (start >= 0 && end > start) {
      const replacement = `function onceWhen(obv, filter, cb) {
  if (!obv) return cb()
  let answered = false
  obv((x) => {
    if (answered) return false
    if (!filter(x)) return
    answered = true
    cb()
    return false
  })
}`;
      fs.writeFileSync(ssbDb2UtilsPath, data.slice(0, start) + replacement + data.slice(end + 2));
      log('Patched ssb-db2 utils.js so onceWhen releases its listener once answered');
    } else {
      log('ssb-db2 patch skipped: onceWhen not found');
    }
  }
} else {
  log('ssb-db2 patch skipped: file not found');
}

// === Patch @xenova/transformers (onnxruntime 1.19 Tensor getter) ===
const xenovaTensorPath = path.resolve(__dirname, '../src/AI/node_modules/@xenova/transformers/src/utils/tensor.js');
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

// === Patch ssb-gossip (forgotten pubs stay forgotten; a bad gossip.json entry no longer stops the server) ===
const ssbGossipPath = path.resolve(__dirname, '../src/server/node_modules/ssb-gossip/index.js');
if (fs.existsSync(ssbGossipPath)) {
  const data = fs.readFileSync(ssbGossipPath, 'utf8');
  if (!data.includes('function isForgotten (key)')) {
    const forgottenBlock = `    var stateFile = AtomicFile(gossipJsonPath)
    var forgottenPath = (function () {
      try { return require(path.join(__dirname, '..', '..', '..', 'configs', 'state-manager')).statePath('gossip_unfollowed.json') }
      catch (e) { return path.join(config.path, 'oasis', 'peers', 'gossip_unfollowed.json') }
    })()
    var forgotten = { at: -1, keys: new Set() }
    function isForgotten (key) {
      try {
        var st = fs.statSync(forgottenPath)
        if (st.mtimeMs !== forgotten.at) {
          forgotten.at = st.mtimeMs
          var list = JSON.parse(fs.readFileSync(forgottenPath, 'utf8') || '[]')
          forgotten.keys = new Set((Array.isArray(list) ? list : []).map(function (e) { return e && e.key }).filter(Boolean))
        }
      } catch (e) { forgotten.at = -1; forgotten.keys = new Set() }
      return !!key && forgotten.keys.has(key)
    }`;
    const patched = data
      .replace('    var stateFile = AtomicFile(gossipJsonPath)', forgottenBlock)
      .replace("        if(addr.key === server.id) return\n", "        if(addr.key === server.id) return\n        if(isForgotten(addr.key)) return\n")
      .replace("          if(v.source !== 'local') {\n            gossip.add(v, 'stored')\n          }", "          if(v.source !== 'local' && !isForgotten(v.key)) {\n            try { gossip.add(v, 'stored') } catch (e) {}\n          }")
      .replace("    var int = setInterval(function () {\n      var copy = peers.filter(", "    var int = setInterval(function () {\n      for (var i = peers.length - 1; i >= 0; i--) {\n        if (peers[i] && isForgotten(peers[i].key)) peers.splice(i, 1)\n      }\n      var copy = peers.filter(");
    const applied = ['function isForgotten (key)', 'if(isForgotten(addr.key)) return', "try { gossip.add(v, 'stored') } catch (e) {}", 'if (peers[i] && isForgotten(peers[i].key)) peers.splice(i, 1)'].every(m => patched.includes(m));
    if (applied) {
      fs.writeFileSync(ssbGossipPath, patched);
      log('Patched ssb-gossip so forgotten pubs are not re-added and bad gossip.json entries are skipped');
    } else {
      log('ssb-gossip patch skipped: unexpected index.js format');
    }
  }
} else {
  log('ssb-gossip patch skipped: file not found');
}

// === Patch ssb-gossip scheduler (no connection attempts while Oasis is paused) ===
const ssbGossipSchedulePath = path.resolve(__dirname, '../src/server/node_modules/ssb-gossip/schedule.js');
if (fs.existsSync(ssbGossipSchedulePath)) {
  const data = fs.readFileSync(ssbGossipSchedulePath, 'utf8');
  if (!data.includes('server.oasisNetworkPaused')) {
    const patched = data.replace('    if(connecting || closed) return\n', '    if(connecting || closed || server.oasisNetworkPaused) return\n');
    if (patched !== data) {
      fs.writeFileSync(ssbGossipSchedulePath, patched);
      log('Patched ssb-gossip scheduler to stay quiet while Oasis is paused');
    } else {
      log('ssb-gossip scheduler patch skipped: unexpected schedule.js format');
    }
  }
} else {
  log('ssb-gossip scheduler patch skipped: file not found');
}

// === Patch ssb-lan (broadcast address detection throws without a private IPv4) ===
const ssbLanPath = path.resolve(__dirname, '../src/server/node_modules/ssb-lan/lib/index.js');
if (fs.existsSync(ssbLanPath)) {
  const data = fs.readFileSync(ssbLanPath, 'utf8');
  if (!data.includes("e.family === 'IPv4' && IP.isPrivate(addr)")) {
    const start = data.indexOf('    getBroadcastIPs() {');
    const end = data.indexOf('\n    }\n', start);
    if (start >= 0 && end > start) {
      const replacement = `    getBroadcastIPs() {
        if (process.platform === 'ios')
            return ['255.255.255.255'];
        try {
            const details = nonPrivateIP(null, (addr, e) => e.family === 'IPv4' && IP.isPrivate(addr), true);
            if (!details || details.family !== 'IPv4')
                return ['255.255.255.255'];
            const { broadcastAddress } = IP.subnet(details.address, details.netmask);
            return [broadcastAddress];
        }
        catch (err) {
            debug('LAN broadcast address detection failed: %s', err);
            return ['255.255.255.255'];
        }
    }`;
      fs.writeFileSync(ssbLanPath, data.slice(0, start) + replacement + data.slice(end + 6));
      log('Patched ssb-lan to fall back to the global broadcast address');
    } else {
      log('ssb-lan patch skipped: getBroadcastIPs not found');
    }
  }
} else {
  log('ssb-lan patch skipped: file not found');
}
