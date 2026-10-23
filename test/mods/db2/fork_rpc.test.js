const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { eq, ok } = require('../../helpers/assert');
const pull = require('../../../src/server/node_modules/pull-stream');
const SecretStack = require('../../../src/server/node_modules/secret-stack');
const ssbKeys = require('../../../src/server/node_modules/ssb-keys');

const SERVER = path.join(__dirname, '..', '..', '..', 'src', 'server');
const mod = (name) => require(path.join(SERVER, 'node_modules', name));
const caps = { shs: crypto.randomBytes(32).toString('base64') };
const tmpRoot = path.join(os.tmpdir(), 'oasis-db2-tests');
const freePort = () => 20000 + Math.floor(Math.random() * 20000);

const makeNode = (keys, { guard = true } = {}) => {
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'rpc-'));
  const port = freePort();
  const stack = SecretStack({ caps })
    .use(mod('ssb-db2/core'))
    .use(mod('ssb-classic'))
    .use(mod('ssb-box'))
    .use(mod('ssb-db2/compat/publish'))
    .use(mod('ssb-db2/compat/post'))
    .use(mod('ssb-db2/compat/db'))
    .use(mod('ssb-db2/compat/log-stream'))
    .use(mod('ssb-db2/compat/history-stream'))
    .use(require(path.join(SERVER, 'db2_legacy')));
  if (guard) stack.use(require(path.join(SERVER, 'feed_guard')));
  const sbot = stack.call(null, {
    path: dir, keys, port, host: '127.0.0.1',
    connections: { incoming: { net: [{ scope: 'private', transform: 'shs', port, host: '127.0.0.1' }] }, outgoing: { net: [{ transform: 'shs' }] } },
    db2: {}
  });
  sbot.__dir = dir;
  return sbot;
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const publish = (sbot, content) => new Promise((resolve, reject) => sbot.publish(content, (err, m) => err ? reject(err) : setTimeout(() => resolve(m), 5)));
const add = (sbot, value) => new Promise((resolve, reject) => sbot.db.add(value, (err, m) => err ? reject(err) : setTimeout(() => resolve(m), 5)));
const feedOf = async (sbot, id) => { await settle(50); return new Promise((resolve) => pull(sbot.createHistoryStream({ id, keys: true }), pull.collect((e, a) => resolve(a || [])))); };
const texts = (msgs) => msgs.map(m => m.value.content.text).join();
const closeSbot = (sbot) => new Promise((resolve) => sbot.close(() => resolve()));
const waitFor = async (test, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (test()) return true; await settle(200); } return false; };

describe('ssb-db2: the guard over a real connection', (t) => {
  t('connecting to a pub that holds the other branch is enough: the fork is detected and repaired through the wire', async () => {
    const her = ssbKeys.generate();
    const pub = makeNode(ssbKeys.generate());
    const device = makeNode(her);
    try {
      const seed = makeNode(her, { guard: false });
      let theirs;
      try {
        for (const text of ['one', 'two', 'three', 'four', 'five']) await publish(seed, { type: 'post', text });
        theirs = await feedOf(seed, her.id);
      } finally { await closeSbot(seed); fs.rmSync(seed.__dir, { recursive: true, force: true }); }
      for (const m of theirs) await add(pub, m.value);
      for (const m of theirs.slice(0, 3)) await add(device, m.value);
      await waitFor(() => device.feedGuard.status().selfChecked, 60000);
      const lost = await publish(device, { type: 'post', text: 'lost' });
      eq(lost.value.sequence, 4, 'the device forked on top of an old copy');

      await new Promise((resolve, reject) => device.connect(pub.getAddress('private'), (err) => err ? reject(err) : resolve()));
      ok(await waitFor(() => device.feedGuard.status().lastRepair, 60000), 'the guard acted on its own after the connection');
      const res = device.feedGuard.status().lastRepair;
      eq(res.kind, 'fork');
      eq([res.from, res.removed, res.adopted, res.republished].join(), '4,1,2,1');
      const healed = await feedOf(device, her.id);
      eq(texts(healed), 'one,two,three,four,five,lost', 'the device carries the network chain plus what it had written');
      eq(healed[5].value.previous, theirs[4].key);
      for (const m of healed.slice(5)) await add(pub, m.value);
      eq(texts(await feedOf(pub, her.id)), 'one,two,three,four,five,lost', 'the pub accepts the republished message');
    } finally {
      await closeSbot(device);
      await closeSbot(pub);
      await settle(500);
      try { fs.rmSync(device.__dir, { recursive: true, force: true }); } catch (_) {}
      try { fs.rmSync(pub.__dir, { recursive: true, force: true }); } catch (_) {}
    }
  });
});
