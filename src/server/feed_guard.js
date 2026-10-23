const fs = require('fs');
const path = require('path');
const pull = require('./node_modules/pull-stream');
const validate = require('./node_modules/ssb-validate');
const longText = require('../backend/long_text');

const REMOTE_TIMEOUT_MS = 20000;
const REPORT_DIR = ['oasis', 'content', 'feed-repairs'];
const REPAIR_COOLDOWN_MS = 24 * 3600 * 1000;
const LAST_REPAIR_FILE = 'last-repair.json';
const STATUS_FILE = 'status.json';
const MAX_MSG_CHARS = 8192;
const SIGNATURE_PLACEHOLDER = 'x'.repeat(88) + '.sig.ed25519';

const collect = (source, timeoutMs) => new Promise((resolve) => {
  let done = false;
  let timer = null;
  const finish = (err, items) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    if (err) { try { source(true, () => {}); } catch (_) {} }
    resolve(err ? null : (items || []));
  };
  timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
  if (timer.unref) timer.unref();
  try { pull(source, pull.collect(finish)); } catch (e) { finish(e); }
});

const remap = (value, map) => {
  if (typeof value === 'string') return map.get(value) || value;
  if (Array.isArray(value)) return value.map(v => remap(v, map));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v, map)]));
  return value;
};

const firstInvalid = (msgs) => {
  let state = validate.initial();
  for (const m of msgs) {
    try { state = validate.append(state, null, m.value); } catch (e) { return { seq: seqOf(m), reason: String(e && e.message ? e.message : e).split('\n')[0] }; }
  }
  return null;
};
const chainIsValid = (msgs) => firstInvalid(msgs) === null;

const seqOf = (m) => (m && m.value && Number(m.value.sequence)) || 0;
const keyed = (list) => {
  const seen = new Set();
  const out = [];
  for (const m of (Array.isArray(list) ? list : [])) {
    if (!m || !m.value) continue;
    let key = null;
    try { key = validate.id(m.value); } catch (_) { continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, value: m.value });
  }
  return out.sort((a, b) => seqOf(a) - seqOf(b));
};
const contiguous = (msgs, from) => msgs.every((m, i) => seqOf(m) === from + i);
const encodedLength = (author, tip, content) => validate.encode({
  previous: tip ? tip.key : null,
  sequence: (tip && tip.value ? Number(tip.value.sequence) : 0) + 1,
  author,
  timestamp: Date.now(),
  hash: 'sha256',
  content,
  signature: SIGNATURE_PLACEHOLDER
}).length;

module.exports = {
  name: 'feedGuard',
  version: '1.0.0',
  manifest: { status: 'sync' },
  remap,
  chainIsValid,
  firstInvalid,
  MAX_MSG_CHARS,
  init(server, config) {
    const state = { checks: 0, lastCheckAt: null, lastPeer: null, lastRepair: null, busy: false, reportedOk: false, selfChecked: false, repairedFrom: 0 };
    const api = { status: () => ({ ...state }) };
    const db = server.db;
    if (!db || typeof db.getState !== 'function' || typeof db.deleteFeed !== 'function' || typeof db.add !== 'function' || typeof server.createHistoryStream !== 'function' || typeof server.on !== 'function') return api;
    const me = server.id;
    const isDebug = () => process.argv.includes('--debug') || process.env.OASIS_DEBUG === '1' || process.env.OASIS_DEBUG === 'true';
    const log = (...args) => { if (isDebug()) console.log('[feed-guard]', ...args); };
    const localTip = () => { try { return db.getState().getAsKV(me); } catch (_) { return null; } };
    const tooLarge = (content) => {
      if (content === null || content === undefined) return 0;
      if (typeof content !== 'object' && typeof content !== 'string') return 0;
      try { const n = encodedLength(me, localTip(), content); return n > MAX_MSG_CHARS ? n : 0; } catch (_) { return 0; }
    };
    const rawPublish = typeof db.publish === 'function' ? db.publish.bind(db) : (typeof server.publish === 'function' ? server.publish.bind(server) : null);
    let repairing = false;
    const held = [];
    let afterPublish = () => {};
    const gate = (fn, self) => function (...args) {
      const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      const size = cb && args.length ? tooLarge(args[0]) : 0;
      if (size) { cb(new Error(`Message too large: ${size} characters, the network accepts up to ${MAX_MSG_CHARS}`)); return; }
      if (repairing) { held.push(() => fn.apply(self, args)); return; }
      if (!cb) return fn.apply(self, args);
      return fn.apply(self, args.slice(0, -1).concat((err, msg) => { cb(err, msg); if (!err) afterPublish(); }));
    };
    if (typeof db.publish === 'function') db.publish = gate(db.publish, db);
    if (typeof server.publish === 'function') server.publish = gate(server.publish, server);
    const release = () => { repairing = false; held.splice(0).forEach(fn => { try { fn(); } catch (_) {} }); };
    const publish = (content) => new Promise((resolve) => {
      if (!rawPublish) return resolve(null);
      try { rawPublish(content, (err, msg) => resolve(err ? null : msg)); } catch (_) { resolve(null); }
    });
    const waitUntil = (test, everyMs, tries) => new Promise((resolve) => {
      (function again(left) {
        let ok = false;
        try { ok = !!test(); } catch (_) { ok = false; }
        if (ok) return resolve(true);
        if (left <= 0) return resolve(false);
        const timer = setTimeout(() => again(left - 1), everyMs);
        if (timer.unref) timer.unref();
      })(tries);
    });
    const drained = () => new Promise((resolve) => { if (typeof db.onDrain !== 'function') return resolve(); try { db.onDrain(() => resolve()); } catch (_) { resolve(); } });
    const pause = (ms) => new Promise((resolve) => { const t = setTimeout(resolve, ms); if (t.unref) t.unref(); });
    const fullHistory = async () => {
      for (let tries = 0; tries < 240; tries++) {
        const tip = localTip();
        const tipSeq = tip && tip.value ? Number(tip.value.sequence) : 0;
        const local = await localHistory(1);
        if (local && tipSeq > 0 && local.length === tipSeq && contiguous(local, 1)) return local;
        await pause(500);
      }
      return null;
    };
    const history = async (source, seq, limit) => { const r = await collect(source({ id: me, seq, keys: true, live: false, ...(limit ? { limit } : {}) }), REMOTE_TIMEOUT_MS); return r ? keyed(r) : null; };
    const localHistory = (seq, limit) => history((o) => server.createHistoryStream(o), seq, limit);
    const remoteHistory = (rpc, seq, limit) => history((o) => rpc.createHistoryStream(o), seq, limit);
    const oneOf = async (p) => { const r = await p; return r && r.length ? r[0] : null; };
    const reportPath = () => path.join(config && config.path ? config.path : '.', ...REPORT_DIR);
    const writeReport = (name, data) => {
      try {
        fs.mkdirSync(reportPath(), { recursive: true });
        fs.writeFileSync(path.join(reportPath(), name), JSON.stringify(data, null, 2), 'utf8');
      } catch (_) {}
    };
    const dropReport = (name) => { try { fs.unlinkSync(path.join(reportPath(), name)); } catch (_) {} };
    const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
    const lastRepairAt = () => { try { return Date.parse(JSON.parse(fs.readFileSync(path.join(reportPath(), LAST_REPAIR_FILE), 'utf8')).at) || 0; } catch (_) { return 0; } };

    const forkPoint = async (rpc, hi) => {
      let lo = 1;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const [remote, local] = await Promise.all([oneOf(remoteHistory(rpc, mid, 1)), oneOf(localHistory(mid, 1))]);
        if (remote && local && remote.key !== local.key) hi = mid; else lo = mid + 1;
      }
      return lo;
    };

    const remoteTip = async (rpc, upper) => {
      let lo = 0;
      let hi = upper;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (await oneOf(remoteHistory(rpc, mid, 1))) lo = mid; else hi = mid - 1;
      }
      return lo;
    };

    const adoptTail = async (rpc, tipSeq) => {
      const tail = await remoteHistory(rpc, tipSeq + 1);
      if (!tail || !tail.length || !contiguous(tail, tipSeq + 1)) return null;
      const local = await localHistory(1);
      if (!local || !chainIsValid(local.concat(tail))) return null;
      for (const m of tail) {
        const err = await new Promise((resolve) => db.add(m.value, (e) => resolve(e || null)));
        if (err) { log('could not adopt message', seqOf(m), err.message || err); return { adopted: tail.indexOf(m) }; }
      }
      return { adopted: tail.length };
    };

    const BATCH = 200;
    const deletesFlushed = () => new Promise((resolve) => {
      let lg = null;
      try { lg = typeof db.getLog === 'function' ? db.getLog() : null; } catch (_) { lg = null; }
      if (!lg || typeof lg.onDeletesFlushed !== 'function') return resolve();
      try { lg.onDeletesFlushed(() => resolve()); } catch (_) { resolve(); }
    });
    const resealTribe = async (content) => {
      const cryptoModel = require('../models/crypto_model')(config.path);
      const body = await cryptoModel.decryptFromGroup(content, null);
      if (!body || body._undecryptable || typeof body !== 'object' || !body.rootId) return null;
      const key = cryptoModel.getKey(body.rootId);
      if (!key) return null;
      const { _decrypted, ...plain } = body;
      const sealedChunk = (chunk) => publish(cryptoModel.wrapMsg({ k: longText.CHUNK_TYPE, rootId: plain.rootId, text: chunk.text, index: chunk.index, total: chunk.total, group: chunk.group }, key));
      const field = plain.k === 'tribe-content' ? longText.chunkableField(plain) : null;
      if (field) {
        const head = await longText.chunkContent(plain, field, { maxBytes: longText.CONTENT_BYTES.sealed, extra: { rootId: plain.rootId }, publish: sealedChunk });
        return cryptoModel.wrapMsg(head, key);
      }
      return cryptoModel.wrapMsgPacked(plain, key, publish);
    };
    const shrink = async (content, seq) => {
      try {
        if (typeof content === 'string') return null;
        const split = content.type === 'tribe-msg' ? await resealTribe(content) : await longText.autoChunk(content, publish);
        if (!split || tooLarge(split)) { log(`message #${seq} is above the ${MAX_MSG_CHARS} characters the network accepts and cannot be split: it cannot be published again`); return null; }
        log(`message #${seq} was too large for the network: published again in pieces`);
        return split;
      } catch (e) {
        log(`message #${seq} could not be split (${e && e.message ? e.message : e}): it cannot be published again`);
        return null;
      }
    };
    const rebuild = (msgs) => new Promise((resolve) => db.deleteFeed(me, async (err) => {
      if (err) return resolve(err);
      await deletesFlushed();
      await drained();
      (function next(i) {
        if (i >= msgs.length) return resolve(null);
        const tip = localTip();
        const have = tip && tip.value ? Number(tip.value.sequence) : 0;
        if (have >= seqOf(msgs[i])) return next(i + 1);
        if (typeof db.addBatch === 'function') {
          const slice = msgs.slice(i, i + BATCH).map(m => m.value);
          return db.addBatch(slice, (e) => e ? resolve(e) : next(i + slice.length));
        }
        db.add(msgs[i].value, (e) => e ? resolve(e) : next(i + 1));
      })(0);
    }));

    const repair = async ({ local, at, remote, peer, why }) => {
      const kept = local.filter(m => seqOf(m) < at);
      const lost = local.filter(m => seqOf(m) >= at);
      const safety = `${stamp()}-local-feed.json`;
      writeReport(safety, { savedAt: new Date().toISOString(), peer, why, from: at, messages: local });
      repairing = true;
      const rebuildError = await rebuild(kept.concat(remote));
      if (rebuildError) {
        const restoreError = await rebuild(local);
        release();
        if (!restoreError) dropReport(safety);
        log(`Feed status: REPAIR FAILED (${rebuildError.message || rebuildError}); ${restoreError ? `the feed could not be put back either, a copy is in ${path.join(reportPath(), safety)}: ${restoreError.message || restoreError}` : 'the local feed was put back as it was'}`);
        return { from: at, removed: 0, adopted: 0, republished: 0, skipped: 0, error: String(rebuildError.message || rebuildError), restored: !restoreError, safety };
      }
      writeReport(LAST_REPAIR_FILE, { at: new Date().toISOString(), peer, from: at, why });
      await drained();
      const map = new Map();
      let republished = 0;
      const skipped = [];
      try {
        for (const m of lost) {
          const content = m.value && m.value.content;
          if (!content || (typeof content !== 'object' && typeof content !== 'string')) { skipped.push(seqOf(m)); continue; }
          let next = remap(content, map);
          if (tooLarge(next)) next = await shrink(next, seqOf(m));
          if (!next) { skipped.push(seqOf(m)); continue; }
          const msg = await publish(next);
          if (msg && msg.key) { map.set(m.key, msg.key); republished += 1; } else skipped.push(seqOf(m));
        }
      } finally { release(); }
      if (!skipped.length) dropReport(safety);
      return { from: at, removed: lost.length, adopted: remote.length, republished, skipped: skipped.length, skippedSeqs: skipped, safety: skipped.length ? safety : null };
    };

    const resolveFork = async (rpc, tipSeq, theirTip) => {
      const at = await forkPoint(rpc, theirTip);
      const [local, remote] = await Promise.all([localHistory(1), remoteHistory(rpc, at)]);
      if (!local || !remote || !remote.length || local.length !== tipSeq || !contiguous(local, 1) || !contiguous(remote, at)) return null;
      const kept = local.filter(m => seqOf(m) < at);
      if (!chainIsValid(kept.concat(remote))) { log('the copy held by', rpc.id, 'does not validate, nothing changed'); return null; }
      if (Date.now() - lastRepairAt() < REPAIR_COOLDOWN_MS) {
        log(`Feed status: BIFURCATION DETECTED at #${at} with ${rpc.id}, but the feed was already repaired in the last 24 hours: this identity is probably being used from another device. Not repairing again`);
        return { kind: 'fork', peer: rpc.id, from: at, conflict: true, removed: 0, adopted: 0, republished: 0, skipped: local.length - kept.length };
      }
      log(`Feed status: BIFURCATION DETECTED at #${at} (${rpc.id} holds a different feed from there), repairing`);
      const res = await repair({ local, at, remote, peer: rpc.id, why: 'fork' });
      return { kind: 'fork', peer: rpc.id, ...res };
    };

    const lastRepairFrom = () => { try { const r = JSON.parse(fs.readFileSync(path.join(reportPath(), LAST_REPAIR_FILE), 'utf8')); return Date.now() - (Date.parse(r.at) || 0) < REPAIR_COOLDOWN_MS ? Number(r.from) || 0 : 0; } catch (_) { return 0; } };
    const repairInvalidTail = async (local, bad, peer) => {
      if (state.repairedFrom === bad.seq || lastRepairFrom() === bad.seq) {
        log(`Feed status: INVALID TAIL from #${bad.seq} again (${bad.reason}) right after repairing it: what this node publishes is not accepted either, so nothing is touched. Check the keys of this identity`);
        return { kind: 'invalid-tail', peer, reason: bad.reason, from: bad.seq, stuck: true, removed: 0, adopted: 0, republished: 0, skipped: 0, skippedSeqs: [] };
      }
      state.repairedFrom = bad.seq;
      log(`Feed status: INVALID TAIL from #${bad.seq} (${bad.reason}): nobody can accept these messages, publishing them again from #${bad.seq - 1}`);
      const res = await repair({ local, at: bad.seq, remote: [], peer, why: bad.reason });
      return { kind: 'invalid-tail', peer, reason: bad.reason, ...res };
    };

    const announce = (result, peer) => {
      result.at = new Date().toISOString();
      state.lastRepair = result;
      if (result.conflict) writeReport(STATUS_FILE, { kind: 'conflict', at: result.at, peer, from: result.from, seen: false });
      if (result.error || result.conflict || result.stuck) return;
      if (result.kind === 'fork') log(`Feed status: REPAIRED with ${peer}: ${result.removed} local messages replaced by ${result.adopted} from the network, ${result.republished} published again`);
      if (result.kind === 'invalid-tail') log(`Feed status: REPAIRED: ${result.removed} messages nobody could accept were withdrawn, ${result.republished} published again${result.skipped ? `, ${result.skipped} left out (#${result.skippedSeqs.join(', #')})` : ''}`);
      if (result.kind === 'missing-tail') log(`Feed status: ${result.adopted} messages of my own feed recovered from ${peer}`);
    };

    const selfCheck = async () => {
      if (state.busy) return null;
      const tip = localTip();
      if (!tip || !tip.value) return null;
      state.busy = true;
      try {
        const local = await fullHistory();
        if (!local) return null;
        const bad = firstInvalid(local);
        if (!bad || bad.seq <= 1) { if (!bad) log('Feed status: my own feed validates'); state.selfChecked = true; return null; }
        const result = await repairInvalidTail(local, bad, null);
        announce(result, null);
        state.selfChecked = true;
        return result;
      } catch (e) {
        log('self check failed', e && e.message ? e.message : e);
        return null;
      } finally {
        state.busy = false;
      }
    };

    const check = async (rpc) => {
      if (state.busy || !rpc || rpc.id === me || typeof rpc.createHistoryStream !== 'function') return null;
      const tip = localTip();
      if (!tip || !tip.value) return null;
      if (!state.selfChecked) { const own = await selfCheck(); if (own) return own; }
      state.busy = true;
      state.checks += 1;
      state.lastCheckAt = new Date().toISOString();
      state.lastPeer = rpc.id;
      try {
        const tipSeq = Number(tip.value.sequence) || 0;
        const remote = await oneOf(remoteHistory(rpc, tipSeq, 1));
        let result = null;
        if (!remote) {
          const theirs = await remoteTip(rpc, tipSeq - 1);
          if (!(theirs > 0)) return null;
          const [r, l] = await Promise.all([oneOf(remoteHistory(rpc, theirs, 1)), oneOf(localHistory(theirs, 1))]);
          if (!r || !l) return null;
          if (r.key !== l.key) {
            result = await resolveFork(rpc, tipSeq, theirs);
          } else {
            const local = await fullHistory();
            const bad = local ? firstInvalid(local) : null;
            if (bad && bad.seq > theirs) result = await repairInvalidTail(local, bad, rpc.id);
          }
        } else if (remote.key === tip.key) {
          const tail = await adoptTail(rpc, tipSeq);
          if (tail && tail.adopted) result = { kind: 'missing-tail', peer: rpc.id, ...tail };
        } else {
          result = await resolveFork(rpc, tipSeq, tipSeq);
        }
        if (result) announce(result, rpc.id);
        else if (!state.reportedOk) { state.reportedOk = true; log(`Feed status: OK (checked with ${rpc.id})`); }
        return result;
      } catch (e) {
        log('check failed', e && e.message ? e.message : e);
        return null;
      } finally {
        state.busy = false;
      }
    };

    const livePeer = () => {
      const peers = server.peers || {};
      for (const id of Object.keys(peers)) {
        if (id === me) continue;
        const rpc = (peers[id] || []).find(r => r && !r.closed && typeof r.createHistoryStream === 'function');
        if (rpc) return rpc;
      }
      return null;
    };
    afterPublish = () => { const rpc = livePeer(); if (rpc) check(rpc).catch(() => {}); };
    server.on('rpc:connect', (rpc) => { check(rpc).catch(() => {}); });
    if (typeof db.onDrain === 'function') {
      try { db.onDrain('base', () => { waitUntil(() => localTip() !== null, 500, 240).then((ready) => { if (ready) return selfCheck(); }).catch(() => {}); }); } catch (_) {}
    }
    api.check = check;
    api.selfCheck = selfCheck;
    return api;
  }
};
