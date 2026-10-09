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

describe('peers: a pub with more than one address', (t) => {
  t('a pub that fails over one address but works over another is not failing', () => {
    const m = load();
    const f = m.failuresByKey(
      [{ key: id('F'), host: 'abcdefghij.onion', port: 8008, failure: 40 }],
      [['onion:abcdefghij.onion:8008~shs:x', { key: id('F'), failure: 40 }], ['net:pub.example:8008~shs:x', { key: id('F'), failure: 0 }]]
    );
    eq(f.get(id('F')), 0, 'the working address wins');
    const g = m.failuresByKey([['onion:abcdefghij.onion:8008~shs:x', { key: id('G'), failure: 40 }], ['net:pub.example:8008~shs:x', { key: id('G'), failure: 12 }]]);
    eq(g.get(id('G')), 12, 'when every address fails, the least failing one counts');
    m.restoreEnv();
  });
});

describe('peers: why a pub cannot be reached', (t) => {
  t('network and handshake failures are told apart instead of shown raw', () => {
    const m = load();
    const { classifyNetError } = m;
    const err = (message, code) => Object.assign(new Error(message), code ? { code } : {});
    eq(classifyNetError(err('connect ECONNREFUSED 127.0.0.1:9050', 'ECONNREFUSED'), 'onion:abcdefghij.onion:8008~shs:x'), 'tor', 'an onion address without a local Tor');
    eq(classifyNetError(err('shs.client: error when expecting server to accept challenge (phase 1).\npossibly the server is busy, does not speak shs or uses a different application cap')), 'keys', 'another network key');
    eq(classifyNetError(err('shs.client: server hung up when we sent hello (phase 3).\nPossibly we dailed a wrong number, or the server does not wish to talk to us.')), 'identity', 'another identity, or not welcome');
    eq(classifyNetError(err('connect ECONNREFUSED 10.0.0.5:8008', 'ECONNREFUSED'), 'net:10.0.0.5:8008~shs:x'), 'refused');
    eq(classifyNetError(err('getaddrinfo ENOTFOUND pub.example', 'ENOTFOUND')), 'notfound');
    eq(classifyNetError(err('connect EHOSTUNREACH 10.0.0.5:8008', 'EHOSTUNREACH')), 'unreachable');
    eq(classifyNetError(err('connect ETIMEDOUT 10.0.0.5:8008', 'ETIMEDOUT')), 'timeout');
    eq(classifyNetError(err('network paused')), 'paused');
    eq(classifyNetError(err('something nobody expected')), 'other');
    eq(classifyNetError(err('could not connect to:onion:abcdefghij.onion:8008~shs:x, only know:net~shs'), 'onion:abcdefghij.onion:8008~shs:x'), 'tor', 'no way to reach onion addresses here');
    m.restoreEnv();
  });
});

describe('peers: a pub that answers on another address', (t) => {
  t('when one address of a pub fails, its other known address is tried once', async () => {
    const pull = require('../../../src/server/node_modules/pull-stream');
    const Pushable = require('../../../src/server/node_modules/pull-pushable');
    const pausePlugin = require('../../../src/server/network_pause');
    const events = Pushable();
    const tried = [];
    const key = id('T');
    const core = key.slice(1, -8);
    const netAddr = `net:pub.example:8008~shs:${core}`;
    const onionAddr = `onion:abcdefghij.onion:8008~shs:${core}`;
    const server = {
      id: id('S'), peers: {},
      conn: { hub: () => ({ listen: () => events }), dbPeers: () => [[netAddr, { key }], [onionAddr, { key }]], connect: (addr, data, cb) => { tried.push(addr); cb && cb(); } }
    };
    const api = pausePlugin.init(server);
    await new Promise(r => setTimeout(r, 1300));
    events.push({ type: 'connecting-failed', address: netAddr, key, details: Object.assign(new Error('getaddrinfo ENOTFOUND pub.example'), { code: 'ENOTFOUND' }) });
    await new Promise(r => setTimeout(r, 50));
    eq(tried[0], onionAddr, 'the onion address is tried when the normal one does not resolve');
    eq(api.lastErrors()[key].reason, 'notfound', 'and the failure is remembered with its reason');
    events.push({ type: 'connecting-failed', address: onionAddr, key, details: new Error('connect ECONNREFUSED 127.0.0.1:9050') });
    await new Promise(r => setTimeout(r, 50));
    eq(tried.length, 1, 'it does not bounce back and forth right away');
    events.end();
  });
});

describe('peers: which pubs come first', (t) => {
  t('up-to-date pubs that replicate what you follow are preferred, outdated ones go last', async () => {
    const pull = require('../../../src/server/node_modules/pull-stream');
    const pausePlugin = require('../../../src/server/network_pause');
    const own = require('../../../src/server/package.json').version;
    const [maj, min] = own.split('.').map(Number);
    const me = id('M'), fresh = id('N'), similar = id('P'), old = id('Q'), silent = id('R'), stranger = id('U');
    const friendsOf = (...ids) => Object.fromEntries(ids.map(k => [k, 1]));
    const graph = {
      [me]: friendsOf(id('a'), id('b'), id('c')),
      [fresh]: friendsOf(id('x'), id('y'), id('z'), id('w')),
      [similar]: friendsOf(id('a'), id('b')),
      [old]: friendsOf(id('a'), id('b'), id('c')),
      [silent]: friendsOf(id('a'))
    };
    const msg = (author, version) => ({ value: { author, timestamp: Date.now(), content: { type: 'oasisVersion', version } } });
    const server = {
      id: me, peers: {},
      messagesByType: () => pull.values([msg(fresh, own), msg(similar, own), msg(old, `${maj}.${Math.max(0, min - 1)}.0`)]),
      friends: { graph: (cb) => cb(null, graph) },
      conn: { hub: () => ({ listen: () => pull.empty() }), dbPeers: () => [] }
    };
    pausePlugin.init(server);
    await new Promise(r => setTimeout(r, 100));
    const order = [old, stranger, silent, fresh, similar].sort((a, b) => server.oasisPeerRank([null, { key: b }]) - server.oasisPeerRank([null, { key: a }]));
    eq(order[0], similar, 'an up-to-date pub replicating what you follow comes first');
    eq(order[1], fresh, 'then other up-to-date pubs');
    eq(order[2], stranger, 'then pubs we know nothing about');
    ok(order.indexOf(old) > order.indexOf(stranger) && order.indexOf(silent) > order.indexOf(stranger), 'outdated pubs, and those that never announce a version, go last');
    ok(server.oasisPeerRank([null, { key: old }]) > server.oasisPeerRank([null, { key: silent }]), 'among outdated ones, the one sharing more of what you follow first');
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

describe('peers: the list of pubs this node uses', (t) => {
  t('pubs on the list are connected to on their own, with the normal address first, and forgotten ones stay forgotten', async () => {
    const pausePlugin = require('../../../src/server/network_pause');
    const statePath = require('../../../src/configs/state-manager').statePath;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-book-'));
    const forgottenFile = statePath('gossip_unfollowed.json');
    const previous = fs.existsSync(forgottenFile) ? fs.readFileSync(forgottenFile, 'utf8') : null;
    const joined = id('J'), both = id('K'), gone = id('G'), older = id('L');
    const core = (k) => k.slice(1, -8);
    fs.writeFileSync(path.join(dir, 'gossip.json'), JSON.stringify([
      { host: 'pub.example', port: 8008, key: joined },
      { host: 'abcdefghij.onion', port: 8008, key: both },
      { host: 'two.example', port: 8009, key: both },
      { host: 'old.example', port: 8008, key: gone }
    ]));
    fs.writeFileSync(forgottenFile, JSON.stringify([{ key: gone }]));
    const book = new Map([[`net:old.example:8008~shs:${core(gone)}`, { key: gone, type: 'pub', autoconnect: false }], [`net:legacy.example:8008~shs:${core(older).slice(0, -1)}`, { key: older, type: 'peer', autoconnect: true }]]);
    const server = {
      id: id('S'), peers: {},
      conn: {
        hub: () => ({ listen: () => require('../../../src/server/node_modules/pull-stream').empty() }),
        dbPeers: () => [...book],
        db: () => ({ has: (addr) => book.has(addr) }),
        remember: (addr, data) => { book.set(addr, data); },
        forget: (addr) => { book.delete(addr); }
      }
    };
    try {
      pausePlugin.init(server, { path: dir });
      await new Promise(r => setTimeout(r, 5600));
      const entry = (k) => [...book].filter(([, d]) => d.key === k);
      eq(entry(joined).length, 1, 'a pub on the list is handed to the connection manager');
      eq(entry(joined)[0][1].autoconnect, true, 'to be connected to on its own');
      eq(entry(both).length, 1, 'a pub with two addresses is added once');
      ok(entry(both)[0][0].startsWith('net:two.example:8009'), 'on its normal address rather than the onion one');
      eq(entry(gone).length, 0, 'a forgotten pub is removed even when the network announces it again');
      eq(entry(older).length, 1, 'an address written without the key padding is not kept twice');
      ok(entry(older)[0][0].endsWith('='), 'it is kept in the standard form');
      eq(entry(older)[0][1].autoconnect, true, 'with the same settings');
    } finally {
      if (previous === null) fs.rmSync(forgottenFile, { force: true }); else fs.writeFileSync(forgottenFile, previous);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('peers: pubs that keep the network together', (t) => {
  t('a pub connects to the pubs announced on the network and to its seeds; a normal node only suggests them', async () => {
    const pausePlugin = require('../../../src/server/network_pause');
    const announced = id('A'), seed = id('E'), forgottenPub = id('F');
    const core = (k) => k.slice(1, -8);
    const statePath = require('../../../src/configs/state-manager').statePath;
    const forgottenFile = statePath('gossip_unfollowed.json');
    const previous = fs.existsSync(forgottenFile) ? fs.readFileSync(forgottenFile, 'utf8') : null;
    fs.writeFileSync(forgottenFile, JSON.stringify([{ key: forgottenPub }]));
    const run = async (isPub) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-mesh-'));
      const book = new Map([[`net:a.example:8008~shs:${core(announced)}`, { key: announced, type: 'pub', autoconnect: false }]]);
      const server = {
        id: id('S'), peers: {},
        conn: {
          hub: () => ({ listen: () => require('../../../src/server/node_modules/pull-stream').empty() }),
          dbPeers: () => [...book],
          db: () => ({ has: (addr) => book.has(addr), update: (addr, patch) => book.set(addr, { ...book.get(addr), ...patch }) }),
          remember: (addr, data) => { book.set(addr, data); },
          forget: (addr) => { book.delete(addr); }
        }
      };
      pausePlugin.init(server, { path: dir, pub: isPub, connections: { seeds: [`net:seed.example:8008~shs:${core(seed)}`, `net:f.example:8008~shs:${core(forgottenPub)}`] } });
      await new Promise(r => setTimeout(r, 5600));
      fs.rmSync(dir, { recursive: true, force: true });
      return (k) => [...book].filter(([, d]) => d.key === k).map(([, d]) => d);
    };
    try {
      const onPub = await run(true);
      eq(onPub(announced)[0].autoconnect, true, 'a pub connects on its own to pubs announced on the network');
      eq(onPub(seed)[0].autoconnect, true, 'and to the seeds in its settings');
      eq(onPub(forgottenPub).length, 0, 'but never to one it was told to forget');
      const onNode = await run(false);
      eq(onNode(announced)[0].autoconnect, false, 'a normal node keeps announced pubs only as suggestions');
      eq(onNode(seed)[0].autoconnect, true, 'while its seeds are connected to');
    } finally {
      if (previous === null) fs.rmSync(forgottenFile, { force: true }); else fs.writeFileSync(forgottenFile, previous);
    }
  });
});

describe('peers: connections others open to this node', (t) => {
  t('a node keeps every connection others open to it; its limit is only for the ones it opens', async () => {
    const crypto = require('crypto');
    const SecretStack = require('../../../src/server/node_modules/secret-stack');
    const ssbKeys = require('../../../src/server/node_modules/ssb-keys');
    const caps = { shs: crypto.randomBytes(32).toString('base64') };
    const base = 30000 + Math.floor(Math.random() * 15000);
    const nodes = [];
    const make = (port, autostart) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-inbound-'));
      const keys = ssbKeys.generate();
      const node = SecretStack({ caps }).use(require('../../../src/server/node_modules/ssb-conn')).call(null, {
        path: dir, keys, port, host: '127.0.0.1', conn: { autostart, populatePubs: false }, timers: { inactivity: 0, handshake: 10000 },
        connections: { incoming: { net: [{ scope: 'device', transform: 'shs', port, host: '127.0.0.1' }] }, outgoing: { net: [{ transform: 'shs' }] } }
      });
      node.__dir = dir; node.__keys = keys;
      nodes.push(node);
      return node;
    };
    try {
      const hub = make(base, true);
      const addr = `net:127.0.0.1:${base}~shs:${hub.__keys.public.replace('.ed25519', '')}`;
      for (let i = 0; i < 14; i++) {
        const c = make(base + 50 + i * 3, false);
        await new Promise(r => setTimeout(r, 150));
        await new Promise((res) => c.connect(addr, () => res()));
      }
      const count = () => hub.conn.query().peersConnected().length;
      eq(count(), 14, 'fourteen others are connected');
      await new Promise(r => setTimeout(r, 25000));
      eq(count(), 14, 'and they are all still there after the connection manager has run');
    } finally {
      await Promise.all(nodes.map(n => new Promise((res) => n.close(() => { try { fs.rmSync(n.__dir, { recursive: true, force: true }); } catch (_) {} res(); }))));
    }
  });
});
