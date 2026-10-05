const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok, notOk } = require('../../helpers/assert');

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-peer-health-'));
const load = () => {
  const prev = process.env.OASIS_STATE_DIR;
  process.env.OASIS_STATE_DIR = stateDir;
  const file = require.resolve('../../../src/models/peer_health');
  delete require.cache[file];
  const mod = require(file);
  mod.restoreEnv = () => { if (prev === undefined) delete process.env.OASIS_STATE_DIR; else process.env.OASIS_STATE_DIR = prev; };
  return mod;
};
const id = (c) => `@${c.repeat(43)}=.ed25519`;
const DAY = 24 * 60 * 60 * 1000;

describe('peers: a pub that stopped working', (t) => {
  t('a few failures, or a few days of maintenance, do not mark a pub as unreachable', () => {
    const h = load();
    notOk(h.isDead({ key: id('A'), failures: 2 }));
    notOk(h.isDead({ key: id('A'), failures: 20 }), 'a couple of days of retries is still maintenance');
    h.restoreEnv();
  });

  t('a pub that keeps failing for a whole week is unreachable', () => {
    const h = load();
    const t0 = Date.now();
    h.observe({ failing: [id('B')], now: t0 });
    notOk(h.isDead({ key: id('B'), failures: 3, now: t0 + 6 * DAY }));
    ok(h.isDead({ key: id('B'), failures: 3, now: t0 + 7 * DAY }));
    ok(h.isDead({ key: id('C'), failures: 80 }), 'a long record of failures from before is enough');
    h.restoreEnv();
  });

  t('as soon as it connects again it is fine again', () => {
    const h = load();
    const t0 = Date.now() - 10 * DAY;
    h.observe({ failing: [id('D')], now: t0 });
    ok(h.isDead({ key: id('D'), failures: 3 }));
    h.observe({ connected: [id('D')] });
    notOk(h.isDead({ key: id('D'), failures: 3 }), 'the failing time starts over');
    h.restoreEnv();
  });

  t('the record survives a restart and failures take the worst of both connection managers', () => {
    const t0 = Date.now() - 8 * DAY;
    load().observe({ failing: [id('E')], now: t0 });
    const again = load();
    ok(again.isDead({ key: id('E'), failures: 3 }), 'the failing time was kept');
    const f = again.failuresByKey([{ key: id('E'), failure: 4 }], [['net:x:8008~shs:y', { key: id('E'), failure: 9 }], ['net:z:8008~shs:w', { key: 'not-a-key', failure: 99 }]]);
    eq(f.get(id('E')), 9);
    eq(f.size, 1, 'invalid keys are ignored');
    again.restoreEnv();
  });
});

describe('peers: pausing the network', (t) => {
  const crypto = require('crypto');
  const SecretStack = require('../../../src/server/node_modules/secret-stack');
  const ssbKeys = require('../../../src/server/node_modules/ssb-keys');
  const pausePlugin = require('../../../src/server/network_pause');
  const caps = { shs: crypto.randomBytes(32).toString('base64') };
  const makeNode = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-pause-'));
    const port = 30000 + Math.floor(Math.random() * 20000);
    const keys = ssbKeys.generate();
    const node = SecretStack({ caps }).use(pausePlugin).call(null, { path: dir, keys, port, host: '127.0.0.1', connections: { incoming: { net: [{ scope: 'device', transform: 'shs', port, host: '127.0.0.1' }] }, outgoing: { net: [{ transform: 'shs' }] } } });
    node.__addr = `net:127.0.0.1:${port}~shs:${keys.public.replace('.ed25519', '')}`;
    node.__dir = dir;
    return node;
  };
  const tryConnect = (from, to) => new Promise((resolve) => from.connect(to.__addr, (err, rpc) => { if (rpc) { try { rpc.close(true, () => {}); } catch (_) {} } resolve(!err); }));
  const close = (n) => new Promise((resolve) => n.close(() => { try { fs.rmSync(n.__dir, { recursive: true, force: true }); } catch (_) {} resolve(); }));

  t('a paused node neither reaches out nor lets anyone in, and resuming brings it back', async () => {
    const a = makeNode(); const b = makeNode();
    try {
      await new Promise(r => setTimeout(r, 300));
      ok(await tryConnect(a, b), 'connections work before pausing');
      a.networkPause.pause();
      ok(a.networkPause.paused());
      notOk(await tryConnect(a, b), 'a paused node does not connect to anyone');
      notOk(await tryConnect(b, a), 'and nobody can connect to it');
      a.networkPause.resume();
      notOk(a.networkPause.paused());
      ok(await tryConnect(a, b), 'resuming lets it connect again');
      ok(await tryConnect(b, a), 'and others can reach it again');
    } finally { await close(a); await close(b); }
  });
});
