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

const makeSbot = (keys, opts = {}) => {
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = opts.dir || fs.mkdtempSync(path.join(tmpRoot, 'fork-'));
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
    .use(opts.guard === false ? (() => ({ name: 'noGuard', version: '1.0.0', manifest: {}, init: () => ({}) }))() : require(path.join(SERVER, 'feed_guard')))
    .call(null, { path: dir, keys, connections: { incoming: {}, outgoing: {} }, db2: {} });
  sbot.__dir = dir;
  return sbot;
};

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const ready = async (sbot) => { const t0 = Date.now(); while (!sbot.feedGuard.status().selfChecked && Date.now() - t0 < 60000) await settle(200); };
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

      await ready(device);
      const res = await device.feedGuard.check(peer);
      eq(res && res.kind, 'fork', 'the fork is detected on contact with a node that holds the other branch');
      eq([res.from, res.removed, res.adopted, res.republished, res.skipped].join(), '4,1,2,1,0');

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
      await settle(500);
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
      await ready(device);
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
      await settle(500);
      fs.rmSync(device.__dir, { recursive: true, force: true });
      fs.rmSync(network.__dir, { recursive: true, force: true });
    }
  });
});

describe('ssb-db2: a message the node accepted but the network never will', (t) => {
  t('an older Oasis lets it through, the new one withdraws it on start and refuses to publish another', async () => {
    const keys = ssbKeys.generate();
    const old = makeSbot(keys, { guard: false });
    const dir = old.__dir;
    const network = makeSbot(keys);
    const peer = { id: '@relay.ed25519', createHistoryStream: (o) => network.createHistoryStream(o) };
    let device = null;
    try {
      for (const text of ['one', 'two', 'three']) await publish(old, { type: 'post', text });
      const stuck = await publish(old, { type: 'post', text: 'x'.repeat(8000) });
      eq(stuck.value.sequence, 4, 'the old node happily stores a message the network will reject');
      await publish(old, { type: 'post', text: 'after' });
      const before = await feedOf(old, keys.id);
      for (const m of before.slice(0, 3)) await add(network, m.value);
      let rejected = null;
      try { await add(network, before[3].value); } catch (e) { rejected = e; }
      ok(rejected, 'another node refuses it, so nothing after it ever replicates');
      await new Promise((resolve) => old.close(() => resolve()));
      await settle(800);

      device = makeSbot(keys, { dir });
      const t0 = Date.now();
      while (!device.feedGuard.status().selfChecked && Date.now() - t0 < 60000) await settle(200);
      const res = device.feedGuard.status().lastRepair;
      eq(res && res.kind, 'invalid-tail', 'the new version checks its own feed when it starts');
      eq([res.from, res.removed, res.republished, res.skipped].join(), '4,2,2,0', 'both are published again, nothing is lost');
      const healed = await feedOf(device, keys.id);
      ok(healed.every(m => JSON.stringify(m.value, null, 2).length <= 8192), 'every message now fits the network');
      eq(healed[healed.length - 1].value.content.text, 'after', 'the good message comes last, in order');
      const joined = await collect(device.createUserStream({ id: keys.id }));
      const big = joined.find(m => m.value.content.type === 'post' && m.value.content.text.length === 8000);
      ok(big && !big.value.content.chunks, 'the big message reads back whole, in pieces underneath');
      for (const m of healed.slice(3)) await add(network, m.value);
      const theirsNow = await collect(network.createUserStream({ id: keys.id }));
      eq(theirsNow.filter(m => m.value.content.type === 'post').map(m => m.value.content.text.length).join(), '3,3,5,8000,5', 'and the network takes everything, the big one included');
      eq(await device.feedGuard.check(peer), null, 'nothing left to fix on contact');
      const err = await new Promise((resolve) => device.db.publish({ type: 'post', text: 'x'.repeat(8000) }, (e) => resolve(e)));
      ok(err && /too large/.test(err.message), 'the same mistake is refused from now on');
    } finally {
      if (device) await closeSbot(device);
      await closeSbot(network);
      await settle(500);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(network.__dir, { recursive: true, force: true });
    }
  });
});
