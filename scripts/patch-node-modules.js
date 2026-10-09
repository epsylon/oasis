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

// === Patch ssb-conn (the scheduler prefers up-to-date peers that replicate what we follow) ===
const connSchedulerPath = path.resolve(__dirname, '../src/server/node_modules/ssb-conn/lib/conn-scheduler.js');
if (fs.existsSync(connSchedulerPath)) {
  const data = fs.readFileSync(connSchedulerPath, 'utf8');
  const best = "            .z((peers) => typeof this.ssb.oasisPeerRank === 'function' ? peers.sort((a, b) => this.ssb.oasisPeerRank(b) - this.ssb.oasisPeerRank(a)) : peers)\n";
  const worst = "                .z((peers) => typeof this.ssb.oasisPeerRank === 'function' ? peers.sort((a, b) => this.ssb.oasisPeerRank(a) - this.ssb.oasisPeerRank(b)) : peers)\n";
  const connectAnchor = "            .z(sortByCooldownAscending)\n            .z(take(freeSlots))";
  const rotateAnchor = "                .z(sortByOldestConnection)\n                .z(take(1))";
  if (data.includes('this.ssb.oasisPeerRank')) {
    log('ssb-conn scheduler already patched');
  } else if (data.includes(connectAnchor) && data.includes(rotateAnchor)) {
    fs.writeFileSync(connSchedulerPath, data
      .replace(connectAnchor, "            .z(sortByCooldownAscending)\n" + best + "            .z(take(freeSlots))")
      .replace(rotateAnchor, "                .z(sortByOldestConnection)\n" + worst + "                .z(take(1))"));
    log('Patched ssb-conn scheduler to rank peers by version and shared replication');
  } else {
    log('ssb-conn scheduler patch skipped: unexpected conn-scheduler.js format');
  }
} else {
  log('ssb-conn scheduler patch skipped: file not found');
}

// === Patch ssb-conn (connection limits apply to the connections we open, never to the ones others open to us) ===
const connHubPath = path.resolve(__dirname, '../src/server/node_modules/ssb-conn-hub/lib/index.js');
if (fs.existsSync(connHubPath) && fs.existsSync(connSchedulerPath)) {
  const hub = fs.readFileSync(connHubPath, 'utf8');
  const sched = fs.readFileSync(connSchedulerPath, 'utf8');
  const hubFrom = 'this._setPeer(address, { ...data, state, disconnect });';
  const hubTo = 'this._setPeer(address, { ...data, state, disconnect, inbound: !isClient });';
  const schedFrom = 'const peersUp = query.peersConnected().filter(isDesiredPeer);';
  const schedTo = 'const peersUp = query.peersConnected().filter(isDesiredPeer).filter((p) => !p[1].inbound);';
  if (hub.includes(hubTo) && sched.includes(schedTo)) {
    log('ssb-conn inbound limits already patched');
  } else if ((hub.includes(hubFrom) || hub.includes(hubTo)) && (sched.includes(schedFrom) || sched.includes(schedTo))) {
    fs.writeFileSync(connHubPath, hub.replace(hubFrom, hubTo));
    fs.writeFileSync(connSchedulerPath, sched.replace(schedFrom, schedTo));
    log('Patched ssb-conn so its connection limits only apply to the connections it opens');
  } else {
    log('ssb-conn inbound patch skipped: unexpected format');
  }
} else {
  log('ssb-conn inbound patch skipped: file not found');
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

// === Patch ssb-box (map leaks the index as libsodium's output format without native bindings) ===
const ssbBoxPath = path.resolve(__dirname, '../src/server/node_modules/ssb-box/format.js');
if (fs.existsSync(ssbBoxPath)) {
  const data = fs.readFileSync(ssbBoxPath, 'utf8');
  const target = '.map(sodium.crypto_sign_ed25519_pk_to_curve25519);';
  if (data.includes(target)) {
    fs.writeFileSync(ssbBoxPath, data.replace(target, '.map((pk) => sodium.crypto_sign_ed25519_pk_to_curve25519(pk));'));
    log('Patched ssb-box so recipient keys are converted one argument at a time');
  }
} else {
  log('ssb-box patch skipped: file not found');
}

// === Patch multiserver (voice frames are small and frequent: send them without Nagle's delay) ===
const msNetPath = path.resolve(__dirname, '../src/server/node_modules/multiserver/plugins/net.js');
if (fs.existsSync(msNetPath)) {
  let data = fs.readFileSync(msNetPath, 'utf8');
  if (data.includes('setNoDelay(true)')) {
    log('multiserver already patched');
  } else {
    const serverTarget = `        function connectionListener(stream) {
          onConnection(toDuplex(stream))`;
    const clientTarget = `        .on('connect', function onConnect() {
          if (started) return
          started = true
          cb(null, toDuplex(stream))`;
    if (data.includes(serverTarget) && data.includes(clientTarget)) {
      data = data
        .replace(serverTarget, `        function connectionListener(stream) {
          try { stream.setNoDelay(true) } catch (_) {}
          onConnection(toDuplex(stream))`)
        .replace(clientTarget, `        .on('connect', function onConnect() {
          if (started) return
          started = true
          try { stream.setNoDelay(true) } catch (_) {}
          cb(null, toDuplex(stream))`);
      fs.writeFileSync(msNetPath, data);
      log('Patched multiserver net plugin to disable Nagle on every connection');
    } else {
      log('multiserver patch skipped: unexpected net plugin layout');
    }
  }
} else {
  log('multiserver patch skipped: file not found');
}

// === Patch hyperaxe (only strings and nodes become children; raw HTML only through a private symbol) ===
const hyperaxePath = path.resolve(__dirname, '../src/server/node_modules/hyperaxe/factory.js');
if (fs.existsSync(hyperaxePath)) {
  let data = fs.readFileSync(hyperaxePath, 'utf8');
  if (data.includes('oasis.rawHtml')) {
    log('hyperaxe already patched');
  } else {
    const target = `    return function (props) {
      return isObject(props)
        ? fn(tag, props, sliceKids(arguments, 1))
        : fn(tag, sliceKids(arguments))
    }`;
    if (data.includes(target)) {
      data = data.replace(target, `    return function (props) {
      return isObject(props)
        ? fn(tag, cleanProps(props), scrubKids(sliceKids(arguments, 1)))
        : fn(tag, scrubKids(sliceKids(arguments)))
    }`);
      data += `
const RAW_HTML = Symbol.for('oasis.rawHtml')
function isNodeLike (v) {
  return !!(v && v.nodeName && v.nodeType)
}
function scrubKids (arr) {
  return arr.map(function (v) {
    if (Array.isArray(v)) return scrubKids(v)
    if (v !== null && typeof v === 'object' && !isNodeLike(v) && !(v instanceof Date) && !(v instanceof RegExp)) return null
    return v
  })
}
function cleanProps (props) {
  if (isNodeLike(props)) return props
  const out = {}
  for (const k of Object.keys(props)) if (k !== 'innerHTML') out[k] = props[k]
  if (typeof props[RAW_HTML] === 'string') out.innerHTML = props[RAW_HTML]
  return out
}
`;
      fs.writeFileSync(hyperaxePath, data);
      log('Patched hyperaxe so peer objects never become attributes or raw HTML');
    } else {
      log('hyperaxe patch skipped: unexpected factory layout');
    }
  }
} else {
  log('hyperaxe patch skipped: file not found');
}

// === Patch html-element (standard attributes missing from its list are written instead of dropped) ===
const htmlAttributesPath = path.resolve(__dirname, '../src/server/node_modules/html-element/html-attributes.js');
if (fs.existsSync(htmlAttributesPath)) {
  const data = fs.readFileSync(htmlAttributesPath, 'utf8');
  const anchor = 'function isStandardAttribute(attrName, tagName) {';
  const marker = 'OASIS_EXTRA_ATTRIBUTES';
  if (data.includes(marker)) {
    log('html-element attributes already patched');
  } else if (data.includes(anchor)) {
    const extra = `var OASIS_EXTRA_ATTRIBUTES = {
  'formmethod': ['input', 'button'],
  'formenctype': ['input', 'button'],
  'formnovalidate': ['input', 'button'],
  'formtarget': ['input', 'button'],
  'minlength': ['input', 'textarea'],
  'inputmode': 'GLOBAL',
  'capture': ['input'],
  'loading': ['img', 'iframe'],
  'decoding': ['img'],
  'crossorigin': ['audio', 'img', 'link', 'script', 'video'],
  'referrerpolicy': ['a', 'area', 'iframe', 'img', 'link', 'script'],
  'playsinline': ['video'],
  'role': 'GLOBAL',
  'label': ['option', 'optgroup', 'track']
};
Object.keys(OASIS_EXTRA_ATTRIBUTES).forEach(function (name) {
  var tags = OASIS_EXTRA_ATTRIBUTES[name];
  var current = HTML_ATTRIBUTES[name];
  if (tags === 'GLOBAL' || current === 'GLOBAL') { HTML_ATTRIBUTES[name] = 'GLOBAL'; return; }
  var set = current instanceof Set ? current : new Set();
  tags.forEach(function (t) { set.add(t); });
  HTML_ATTRIBUTES[name] = set;
});

`;
    fs.writeFileSync(htmlAttributesPath, data.replace(anchor, extra + anchor));
    log('Patched html-element so standard attributes such as formmethod, minlength and loading are written');
  } else {
    log('html-element attributes patch skipped: unexpected html-attributes.js format');
  }
} else {
  log('html-element attributes patch skipped: file not found');
}
