const pull = require('../server/node_modules/pull-stream');
const Abortable = require('../server/node_modules/pull-abortable');

const JOB_TTL_MS = 6 * 60 * 60 * 1000;
const PROBE_TIMEOUT_MS = 8000;
const RECHECK_MS = 15000;

module.exports = ({ cooler }) => {
  const jobs = new Map();
  let recheckTimer = null;

  const openSsb = () => cooler.open();
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

  const peerRpcs = (ssb) => {
    const out = [];
    const live = ssb && ssb.peers && typeof ssb.peers === 'object' ? ssb.peers : {};
    for (const id of Object.keys(live)) {
      if (id === ssb.id) continue;
      for (const rpc of (Array.isArray(live[id]) ? live[id] : [])) {
        if (rpc && rpc.blobs && typeof rpc.blobs.get === 'function' && !rpc.closed) out.push({ id, rpc });
      }
    }
    return out;
  };

  const hasLocal = (ssb, blobId) => new Promise((resolve) => {
    try { ssb.blobs.has(blobId, (err, has) => resolve(!err && !!has)); } catch (_) { resolve(false); }
  });

  const remoteHas = (peer, blobId) => withTimeout(new Promise((resolve) => {
    try { peer.rpc.blobs.has(blobId, (err, has) => resolve(!err && !!has)); } catch (_) { resolve(false); }
  }), PROBE_TIMEOUT_MS).catch(() => false);

  const findSeeds = async (ssb, blobId) => {
    const peers = peerRpcs(ssb);
    const flags = await Promise.all(peers.map((p) => remoteHas(p, blobId)));
    return peers.filter((_, i) => flags[i]);
  };

  const fetchFrom = (ssb, seed, job) => new Promise((resolve, reject) => {
    const abortable = Abortable();
    job.abort = () => abortable.abort(new Error('cancelled'));
    let received = 0;
    const opts = job.size > 0 ? { key: job.blobId, max: job.size } : { key: job.blobId };
    pull(
      seed.rpc.blobs.get(opts),
      abortable,
      pull.through((buf) => { received += buf.length; job.received = received; }),
      ssb.blobs.add(job.blobId, (err) => { job.abort = null; err ? reject(err) : resolve(received); })
    );
  });

  const finish = (job, state, error) => {
    job.state = state;
    job.error = error ? String(error.message || error) : '';
    job.finishedAt = Date.now();
    job.abort = null;
    if (state === 'done' && job.size > 0) job.received = job.size;
  };

  const ensureRecheck = () => {
    if (recheckTimer) return;
    recheckTimer = setInterval(async () => {
      const pending = Array.from(jobs.values()).filter((j) => j.state === 'nosource');
      if (!pending.length) { clearInterval(recheckTimer); recheckTimer = null; return; }
      let ssb;
      try { ssb = await openSsb(); } catch (_) { return; }
      for (const job of pending) {
        if (await hasLocal(ssb, job.blobId)) { finish(job, 'done'); continue; }
        const seeds = await findSeeds(ssb, job.blobId);
        if (seeds.length) run(job);
      }
    }, RECHECK_MS);
    if (recheckTimer.unref) recheckTimer.unref();
  };

  const run = async (job) => {
    if (job.state === 'downloading' || job.state === 'probing') return;
    let ssb;
    try { ssb = await openSsb(); } catch (err) { finish(job, 'failed', err); return; }
    if (await hasLocal(ssb, job.blobId)) { finish(job, 'done'); return; }
    job.state = 'probing';
    job.error = '';
    const seeds = await findSeeds(ssb, job.blobId);
    job.seeds = seeds.map((s) => s.id);
    if (!seeds.length) {
      job.state = 'nosource';
      try { ssb.blobs.want(job.blobId, () => {}); } catch (_) {}
      ensureRecheck();
      return;
    }
    job.state = 'downloading';
    job.startedAt = job.startedAt || Date.now();
    let lastErr = null;
    for (const seed of seeds) {
      if (job.cancelled) { finish(job, 'cancelled'); return; }
      job.peer = seed.id;
      job.received = 0;
      try {
        await fetchFrom(ssb, seed, job);
        finish(job, 'done');
        return;
      } catch (err) {
        lastErr = err;
        if (job.cancelled) { finish(job, 'cancelled'); return; }
      }
    }
    finish(job, 'failed', lastErr);
  };

  const sweep = () => {
    const now = Date.now();
    for (const [key, job] of jobs) if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) jobs.delete(key);
  };

  const snapshot = (job) => ({
    blobId: job.blobId,
    name: job.name,
    size: job.size,
    received: Math.min(job.received || 0, job.size || job.received || 0),
    state: job.state,
    seeds: Array.isArray(job.seeds) ? job.seeds.length : 0,
    peer: job.peer || '',
    error: job.error || '',
    torrentKey: job.torrentKey || '',
    startedAt: job.startedAt || 0,
    finishedAt: job.finishedAt || 0,
    active: job.state === 'queued' || job.state === 'probing' || job.state === 'downloading' || job.state === 'nosource'
  });

  return {
    start({ blobId, size, name, torrentKey } = {}) {
      const id = String(blobId || '');
      if (!id.startsWith('&')) throw new Error('torrentFromContentMissing');
      sweep();
      let job = jobs.get(id);
      if (job && (job.state === 'downloading' || job.state === 'probing' || job.state === 'done')) return snapshot(job);
      job = { blobId: id, size: Number(size) || 0, name: String(name || ''), torrentKey: torrentKey || '', received: 0, state: 'queued', seeds: [], error: '', cancelled: false, startedAt: 0, finishedAt: 0, abort: null, peer: '' };
      jobs.set(id, job);
      run(job);
      return snapshot(job);
    },
    cancel(blobId) {
      const job = jobs.get(String(blobId || ''));
      if (!job) return false;
      job.cancelled = true;
      if (typeof job.abort === 'function') { try { job.abort(); } catch (_) {} }
      else if (job.state !== 'done') finish(job, 'cancelled');
      return true;
    },
    remove(blobId) { return jobs.delete(String(blobId || '')); },
    get(blobId) {
      const job = jobs.get(String(blobId || ''));
      return job ? snapshot(job) : null;
    },
    list() {
      sweep();
      return Array.from(jobs.values()).map(snapshot).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    },
    async hasLocal(blobId) {
      try { return await hasLocal(await openSsb(), String(blobId || '')); } catch (_) { return false; }
    },
    async seedsFor(blobId) {
      try { return (await findSeeds(await openSsb(), String(blobId || ''))).map((s) => s.id); } catch (_) { return []; }
    }
  };
};
