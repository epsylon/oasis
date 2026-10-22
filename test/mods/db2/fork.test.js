const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { eq, ok, notOk } = require('../../helpers/assert');
const pull = require('../../../src/server/node_modules/pull-stream');
const SecretStack = require('../../../src/server/node_modules/secret-stack');
const ssbKeys = require('../../../src/server/node_modules/ssb-keys');

const SERVER = path.join(__dirname, '..', '..', '..', 'src', 'server');
const mod = (name) => require(path.join(SERVER, 'node_modules', name));
const caps = { shs: crypto.randomBytes(32).toString('base64') };
const tmpRoot = path.join(os.tmpdir(), 'oasis-db2-tests');

const makeSbot = (keys) => {
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'fork-'));
  const sbot = SecretStack({ caps })
    .use(mod('ssb-db2/core'))
    .use(mod('ssb-classic'))
    .use(mod('ssb-box'))
    .use(mod('ssb-db2/compat/publish'))
    .use(mod('ssb-db2/compat/post'))
    .use(mod('ssb-db2/compat/db'))
    .use(mod('ssb-db2/compat/log-stream'))
    .use(mod('ssb-db2/compat/history-stream'))
    .use(require(path.join(SERVER, 'db2_legacy')))
    .use(require(path.join(SERVER, 'feed_guard')))
    .call(null, { path: dir, keys, connections: { incoming: {}, outgoing: {} }, db2: {} });
  sbot.__dir = dir;
  return sbot;
};

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const collect = (src) => new Promise((resolve, reject) => pull(src, pull.collect((err, arr) => err ? reject(err) : resolve(arr))));
const publish = (sbot, content) => new Promise((resolve, reject) => sbot.publish(content, (err, m) => err ? reject(err) : setTimeout(() => resolve(m), 5)));
const add = (sbot, value) => new Promise((resolve, reject) => sbot.db.add(value, (err, m) => err ? reject(err) : setTimeout(() => resolve(m), 5)));
const feedOf = async (sbot, id) => { await settle(50); return collect(sbot.createHistoryStream({ id, keys: true })); };
const texts = (msgs) => msgs.map(m => m.value.content.text).join();
const closeSbot = (sbot) => new Promise((resolve) => sbot.close(() => resolve()));

describe('ssb-db2: a forked identity heals itself against a real log', (t) => {
  t('the same secret on two nodes forks, the guard detects it on contact and both end up on one chain', async () => {
    const keys = ssbKeys.generate();
    const network = makeSbot(keys);
    const device = makeSbot(keys);
    const peer = { id: '@relay.ed25519', createHistoryStream: (o) => network.createHistoryStream(o) };
    try {
      for (const text of ['one', 'two', 'three', 'four', 'five']) await publish(network, { type: 'post', text });
      const theirs = await feedOf(network, keys.id);
      eq(theirs.length, 5);
      for (const m of theirs.slice(0, 3)) await add(device, m.value);
      eq(texts(await feedOf(device, keys.id)), 'one,two,three', 'the second device starts from an old copy');
      const lost = await publish(device, { type: 'post', text: 'lost' });
      eq(lost.value.sequence, 4, 'and publishes on top of it: the feed is now forked');
      ok((await feedOf(device, keys.id))[3].key !== theirs[3].key);

      const res = await device.feedGuard.check(peer);
      eq(res && res.kind, 'fork', 'the fork is detected on contact with a node that holds the other branch');
      eq([res.forkAt, res.removed, res.adopted, res.republished, res.skipped].join(), '4,1,2,1,0');

      const healed = await feedOf(device, keys.id);
      eq(healed.length, 6);
      eq(healed.slice(0, 5).map(m => m.key).join(), theirs.map(m => m.key).join(), 'the device now carries the chain the network knows');
      eq(healed[5].value.content.text, 'lost');
      eq(healed[5].value.sequence, 6);
      eq(healed[5].value.previous, theirs[4].key, 'what was lost is published again as a proper continuation');
      eq(device.db.getState().getAsKV(keys.id).value.sequence, 6, 'the log state agrees');

      const after = await publish(device, { type: 'post', text: 'after' });
      eq(after.value.sequence, 7, 'publishing keeps going from there');
      for (const m of (await feedOf(device, keys.id)).slice(5)) await add(network, m.value);
      eq(texts(await feedOf(network, keys.id)), 'one,two,three,four,five,lost,after', 'the network accepts everything the device wrote after the repair');
      eq(await device.feedGuard.check(peer), null, 'a second contact finds nothing to fix');

      const repairs = path.join(device.__dir, 'oasis', 'content', 'feed-repairs');
      const files = fs.readdirSync(repairs);
      ok(files.includes('last-repair.json'), 'the date of the repair is remembered');
      notOk(files.some(n => n.endsWith('-local-feed.json')), 'the copy of the old feed is removed once everything was published again');
    } finally {
      await closeSbot(device);
      await closeSbot(network);
      fs.rmSync(device.__dir, { recursive: true, force: true });
      fs.rmSync(network.__dir, { recursive: true, force: true });
    }
  });

  t('a device restored from an old copy picks up its own newer messages before writing anything', async () => {
    const keys = ssbKeys.generate();
    const network = makeSbot(keys);
    const device = makeSbot(keys);
    const peer = { id: '@relay.ed25519', createHistoryStream: (o) => network.createHistoryStream(o) };
    try {
      for (const text of ['one', 'two', 'three', 'four']) await publish(network, { type: 'post', text });
      const theirs = await feedOf(network, keys.id);
      for (const m of theirs.slice(0, 2)) await add(device, m.value);
      const res = await device.feedGuard.check(peer);
      eq(res && res.kind, 'missing-tail');
      eq(res.adopted, 2);
      eq(texts(await feedOf(device, keys.id)), 'one,two,three,four');
      const next = await publish(device, { type: 'post', text: 'five' });
      eq(next.value.sequence, 5);
      eq(next.value.previous, theirs[3].key, 'the next message continues the network chain, no fork is created');
    } finally {
      await closeSbot(device);
      await closeSbot(network);
      fs.rmSync(device.__dir, { recursive: true, force: true });
      fs.rmSync(network.__dir, { recursive: true, force: true });
    }
  });
});
