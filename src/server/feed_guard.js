const fs = require('fs');
const path = require('path');
const pull = require('./node_modules/pull-stream');
const validate = require('./node_modules/ssb-validate');

const REMOTE_TIMEOUT_MS = 20000;
const REPORT_DIR = ['oasis', 'content', 'feed-repairs'];

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

const chainIsValid = (msgs) => {
  try {
    let state = validate.initial();
    for (const m of msgs) state = validate.append(state, null, m.value);
    return true;
  } catch (_) { return false; }
};

const seqOf = (m) => (m && m.value && Number(m.value.sequence)) || 0;
const keyed = (list) => (Array.isArray(list) ? list : []).map((m) => {
  if (!m || !m.value) return null;
  try { return { key: validate.id(m.value), value: m.value }; } catch (_) { return null; }
}).filter(Boolean);
const REPAIR_COOLDOWN_MS = 24 * 3600 * 1000;
const LAST_REPAIR_FILE = 'last-repair.json';
const contiguous = (msgs, from) => msgs.every((m, i) => seqOf(m) === from + i);

module.exports = {
  name: 'feedGuard',
  version: '1.0.0',
  manifest: { status: 'sync' },
  remap,
  chainIsValid,
  init(server, config) {
    const state = { checks: 0, lastCheckAt: null, lastPeer: null, lastRepair: null, busy: false, reportedOk: false };
    const api = { status: () => ({ ...state }) };
    const db = server.db;
    if (!db || typeof db.getState !== 'function' || typeof db.deleteFeed !== 'function' || typeof db.add !== 'function' || typeof server.createHistoryStream !== 'function' || typeof server.on !== 'function') return api;
    const me = server.id;
    const isDebug = () => process.argv.includes('--debug') || process.env.OASIS_DEBUG === '1' || process.env.OASIS_DEBUG === 'true';
    const log = (...args) => { if (isDebug()) console.log('[feed-guard]', ...args); };
    const debug = log;
    const rawPublish = typeof db.publish === 'function' ? db.publish.bind(db) : (typeof server.publish === 'function' ? server.publish.bind(server) : null);
    let repairing = false;
    const held = [];
    let afterPublish = () => {};
    const gate = (fn, self) => function (...args) {
      if (repairing) { held.push(() => fn.apply(self, args)); return; }
      const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
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
    const localTip = () => { try { return db.getState().getAsKV(me); } catch (_) { return null; } };
    const compact = () => new Promise((resolve) => {
      if (typeof db.compact !== 'function') return resolve(null);
      try { db.compact((err) => resolve(err || null)); } catch (e) { resolve(e); }
    });
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

    const forkPoint = async (rpc, tipSeq) => {
      let lo = 1;
      let hi = tipSeq;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const [remote, local] = await Promise.all([oneOf(remoteHistory(rpc, mid, 1)), oneOf(localHistory(mid, 1))]);
        if (remote && local && remote.key !== local.key) hi = mid; else lo = mid + 1;
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
        if (err) { debug('could not adopt message', seqOf(m), err.message || err); return { adopted: tail.indexOf(m) }; }
      }
      return { adopted: tail.length };
    };

    const peerSeq = (rpc) => new Promise((resolve) => {
      if (!rpc.ebt || typeof rpc.ebt.clock !== 'function') return resolve(0);
      let done = false;
      const finish = (n) => { if (done) return; done = true; clearTimeout(timer); resolve(n); };
      const timer = setTimeout(() => finish(0), REMOTE_TIMEOUT_MS);
      if (timer.unref) timer.unref();
      try { rpc.ebt.clock({}, (err, clock) => finish(!err && clock ? Number(clock[me]) || 0 : 0)); } catch (_) { finish(0); }
    });

    const resolveFork = async (rpc, tipSeq, theirTip) => {
      const at = await forkPoint(rpc, theirTip);
      const [local, remote] = await Promise.all([localHistory(1), remoteHistory(rpc, at)]);
      if (!local || !remote || !remote.length || local.length !== tipSeq || !contiguous(local, 1) || !contiguous(remote, at)) return null;
      const kept = local.filter(m => seqOf(m) < at);
      const lost = local.filter(m => seqOf(m) >= at);
      if (!chainIsValid(kept.concat(remote))) { debug('the copy held by', rpc.id, 'does not validate, nothing changed'); return null; }
      if (Date.now() - lastRepairAt() < REPAIR_COOLDOWN_MS) {
        log(`Feed status: BIFURCATION DETECTED at #${at} with ${rpc.id}, but the feed was already repaired in the last 24 hours: this identity is probably being used from another device. Not repairing again`);
        return { forkAt: at, conflict: true, removed: 0, adopted: 0, republished: 0, skipped: lost.length };
      }
      log(`Feed status: BIFURCATION DETECTED at #${at} (${rpc.id} holds a different feed from there), repairing`);
      const safety = `${stamp()}-local-feed.json`;
      writeReport(safety, { savedAt: new Date().toISOString(), peer: rpc.id, forkAt: at, messages: local });
      repairing = true;
      const rebuild = (msgs) => new Promise((resolve) => db.deleteFeed(me, (err) => {
        if (err) return resolve(err);
        (function next(i) {
          if (i >= msgs.length) return resolve(null);
          const tip = localTip();
          if (tip && tip.value && Number(tip.value.sequence) >= seqOf(msgs[i])) return next(i + 1);
          db.add(msgs[i].value, (e) => e ? resolve(e) : next(i + 1));
        })(0);
      }));
      const rebuildError = await rebuild(kept.concat(remote));
      if (rebuildError) {
        const restoreError = await rebuild(local);
        release();
        if (!restoreError) dropReport(safety);
        log(`Feed status: REPAIR FAILED (${rebuildError.message || rebuildError}); ${restoreError ? `the feed could not be put back either, a copy is in ${path.join(reportPath(), safety)}: ${restoreError.message || restoreError}` : 'the local feed was put back as it was'}`);
        return { forkAt: at, removed: 0, adopted: 0, republished: 0, skipped: 0, error: String(rebuildError.message || rebuildError), restored: !restoreError, safety };
      }
      writeReport(LAST_REPAIR_FILE, { at: new Date().toISOString(), peer: rpc.id, forkAt: at });
      const compactError = await compact();
      if (compactError) log('the log could not be compacted after the repair:', compactError.message || compactError);
      const map = new Map();
      let republished = 0;
      let skipped = 0;
      try {
        for (const m of lost) {
          const content = m.value && m.value.content;
          if (!content || typeof content !== 'object') { skipped += 1; continue; }
          const msg = await publish(remap(content, map));
          if (msg && msg.key) { map.set(m.key, msg.key); republished += 1; } else skipped += 1;
        }
      } finally { release(); }
      if (!skipped) dropReport(safety);
      return { forkAt: at, removed: lost.length, adopted: remote.length, republished, skipped, safety: skipped ? safety : null };
    };

    const check = async (rpc) => {
      if (state.busy || !rpc || rpc.id === me || typeof rpc.createHistoryStream !== 'function') return null;
      const tip = localTip();
      if (!tip || !tip.value) return null;
      state.busy = true;
      state.checks += 1;
      state.lastCheckAt = new Date().toISOString();
      state.lastPeer = rpc.id;
      try {
        const tipSeq = Number(tip.value.sequence) || 0;
        const remote = await oneOf(remoteHistory(rpc, tipSeq, 1));
        let result = null;
        if (!remote) {
          const theirs = await peerSeq(rpc);
          if (!(theirs > 0 && theirs < tipSeq)) return null;
          const [r, l] = await Promise.all([oneOf(remoteHistory(rpc, theirs, 1)), oneOf(localHistory(theirs, 1))]);
          if (!r || !l || r.key === l.key) return null;
          result = await resolveFork(rpc, tipSeq, theirs);
          if (result) result = { kind: 'fork', peer: rpc.id, ...result };
        } else if (remote.key === tip.key) {
          const tail = await adoptTail(rpc, tipSeq);
          if (tail && tail.adopted) result = { kind: 'missing-tail', peer: rpc.id, ...tail };
        } else {
          result = await resolveFork(rpc, tipSeq, tipSeq);
          if (result) result = { kind: 'fork', peer: rpc.id, ...result };
        }
        if (result) {
          result.at = new Date().toISOString();
          state.lastRepair = result;
          if (result.kind === 'fork' && !result.error && !result.conflict) log(`Feed status: REPAIRED with ${rpc.id}: ${result.removed} local messages replaced by ${result.adopted} from the network, ${result.republished} published again`);
          if (result.kind === 'missing-tail') log(`Feed status: ${result.adopted} messages of my own feed recovered from ${rpc.id}`);
        } else if (!state.reportedOk) {
          state.reportedOk = true;
          debug(`Feed status: OK (checked with ${rpc.id})`);
        }
        return result;
      } catch (e) {
        debug('check failed', e && e.message ? e.message : e);
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
    api.check = check;
    return api;
  }
};
