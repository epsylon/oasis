const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok, notOk } = require('../../helpers/assert');

const plugin = require('../../../src/server/feed_guard');
const pull = require('../../../src/server/node_modules/pull-stream');
const validate = require('../../../src/server/node_modules/ssb-validate');
const keys = require('../../../src/server/node_modules/ssb-keys').generate();

const chain = (base, contents, t0 = 1700000000000) => {
  let state = validate.initial();
  for (const m of base) state = validate.append(state, null, m.value);
  let ts = t0 + base.length * 1000;
  const out = [];
  for (const c of contents) {
    const value = validate.create(state.feeds[keys.id] || null, keys, null, c, ts += 1000);
    state = validate.append(state, null, value);
    out.push({ key: validate.id(value), value, timestamp: ts });
  }
  return out;
};
const posts = (...texts) => texts.map(text => ({ type: 'post', text }));
const chainLoose = (base, contents, t0 = 1700000000000) => {
  let state = validate.initial();
  for (const m of base) state = validate.append(state, null, m.value);
  let ts = t0 + base.length * 1000;
  const out = [];
  const ssbKeys = require('../../../src/server/node_modules/ssb-keys');
  let prev = state.feeds[keys.id] || null;
  for (const c of contents) {
    const value = ssbKeys.signObj(keys, null, { previous: prev ? prev.id : null, sequence: (prev ? prev.sequence : 0) + 1, author: keys.id, timestamp: ts += 1000, hash: 'sha256', content: c });
    const key = validate.id(value);
    prev = { id: key, sequence: value.sequence, timestamp: value.timestamp };
    out.push({ key, value, timestamp: ts });
  }
  return out;
};

const fakeNode = (local, remote) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-feed-guard-'));
  const calls = { deleted: 0, added: [], published: [] };
  let feed = local.slice();
  let handler = null;
  const stream = (list) => (o) => pull.values(list.filter(m => m.value.sequence >= (o.seq || 1)).slice(0, o.limit || list.length));
  const server = {
    id: keys.id,
    on: (ev, fn) => { if (ev === 'rpc:connect') handler = fn; },
    createHistoryStream: (o) => stream(feed)(o),
    db: {
      getState: () => ({ getAsKV: () => (feed.length ? { key: feed[feed.length - 1].key, value: feed[feed.length - 1].value } : null) }),
      deleteFeed: (id, cb) => { calls.deleted += 1; feed = []; cb(null); },
      add: (value, cb) => { calls.added.push(value); feed.push({ key: validate.id(value), value }); cb(null); },
      publish: (content, cb) => {
        calls.published.push(content);
        const prev = feed[feed.length - 1];
        const st = prev ? { id: prev.key, sequence: prev.value.sequence, timestamp: prev.value.timestamp, queue: [] } : null;
        const value = validate.create(st, keys, null, content, Date.now());
        const msg = { key: validate.id(value), value };
        feed.push(msg);
        cb(null, msg);
      }
    }
  };
  const rpc = { id: '@peer.ed25519', createHistoryStream: stream(remote) };
  const api = plugin.init(server, { path: dir });
  const reports = () => { try { return fs.readdirSync(path.join(dir, 'oasis', 'content', 'feed-repairs')); } catch (_) { return []; } };
  return { api, rpc, server, calls, reports, feed: () => feed, connected: () => !!handler, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
};

describe('peers: my own feed is kept in step with the network', (t) => {
  t('a forked feed is rebuilt from the copy the network holds and the lost messages are published again', async () => {
    const base = chain([], posts('one', 'two', 'three'));
    const lostA = chain(base, posts('lost A'));
    const lostB = chain(base.concat(lostA), [{ type: 'post', text: 'lost B', root: lostA[0].key, branch: lostA[0].key }]);
    const theirs = chain(base, posts('four', 'five', 'six'));
    const node = fakeNode(base.concat(lostA, lostB), base.concat(theirs));
    try {
      ok(node.connected(), 'the guard listens for connections');
      const res = await node.api.check(node.rpc);
      eq(res && res.kind, 'fork');
      eq([res.from, res.removed, res.adopted, res.republished, res.skipped].join(), '4,2,3,2,0');
      eq(node.calls.deleted, 1, 'the local feed is deleted once');
      const feed = node.feed();
      eq(feed.length, 8, 'three kept, three adopted, two re-published');
      eq(feed.slice(0, 3).map(m => m.key).join(), base.map(m => m.key).join(), 'the common prefix is kept');
      eq(feed.slice(3, 6).map(m => m.key).join(), theirs.map(m => m.key).join(), 'the network copy replaces the divergent messages');
      eq(feed[6].value.content.text, 'lost A');
      eq(feed[7].value.content.root, feed[6].key, 'references to re-published messages point at their new keys');
      eq(feed[7].value.sequence, 8, 'the re-published messages continue the adopted chain');
      notOk(node.reports().some(n => n.endsWith('-local-feed.json')), 'the copy of the old feed is removed once everything is published again');
      ok(node.reports().includes('last-repair.json'), 'only the date of the repair is kept');
      eq(node.api.status().lastRepair.kind, 'fork');
      const branch = base.concat(chain(base, posts('x', 'y')));
      const other = { id: '@other.ed25519', createHistoryStream: (o) => pull.values(branch.filter(m => m.value.sequence >= (o.seq || 1)).slice(0, o.limit || 99)), ebt: { clock: (opts, cb) => cb(null, { [keys.id]: 5 }) } };
      const second = await node.api.check(other);
      ok(second && second.conflict, 'a second fork within a day is reported as a conflict');
      eq(node.calls.deleted, 1, 'and nothing is rebuilt again');
    } finally { node.cleanup(); }
  });

  t('while the feed is rebuilt, what the app publishes waits and lands on top afterwards', async () => {
    const base = chain([], posts('one', 'two', 'three'));
    const mine = chain(base, posts('lost'));
    const theirs = chain(base, posts('four'));
    const node = fakeNode(base.concat(mine), base.concat(theirs));
    const originalDelete = node.server.db.deleteFeed;
    let duringKey = null;
    node.server.db.deleteFeed = (id, cb) => originalDelete(id, (err) => { node.server.db.publish({ type: 'post', text: 'during' }, (e, m) => { duringKey = m && m.key; }); cb(err); });
    try {
      const res = await node.api.check(node.rpc);
      eq(res && res.kind, 'fork');
      const texts = node.feed().map(m => m.value.content.text);
      eq(texts.join(), 'one,two,three,four,lost,during', 'the message published during the repair comes after everything else');
      eq(node.feed()[5].value.sequence, 6);
      eq(duringKey, node.feed()[5].key);
    } finally { node.cleanup(); }
  });

  t('a peer that serves my real messages under altered keys cannot make me rebuild anything', async () => {
    const base = chain([], posts('one', 'two', 'three'));
    const forgedKeys = base.map(m => ({ ...m, key: m.key.replace(/^%./, '%Z') }));
    const node = fakeNode(base, forgedKeys);
    try {
      eq(await node.api.check(node.rpc), null);
      eq(node.calls.deleted + node.calls.published.length, 0);
    } finally { node.cleanup(); }
  });

  t('if the rebuild fails half way the old feed is put back', async () => {
    const base = chain([], posts('one', 'two', 'three'));
    const mine = chain(base, posts('lost'));
    const theirs = chain(base, posts('four', 'five'));
    const node = fakeNode(base.concat(mine), base.concat(theirs));
    const originalAdd = node.server.db.add;
    let failed = false;
    node.server.db.add = (value, cb) => { if (!failed && value.content.text === 'five') { failed = true; return cb(new Error('disk full')); } originalAdd(value, cb); };
    try {
      const res = await node.api.check(node.rpc);
      ok(res && res.error && res.restored, 'the failure is reported and the feed restored');
      eq(node.feed().map(m => m.value.content.text).join(), 'one,two,three,lost', 'the feed is exactly as before');
      eq(node.calls.published.length, 0, 'nothing is published again');
    } finally { node.cleanup(); }
  });

  t('a fork is also found when the network holds fewer messages of mine than I do', async () => {
    const base = chain([], posts('one', 'two', 'three'));
    const mine = chain(base, posts('A', 'B', 'C'));
    const theirs = chain(base, posts('four'));
    const node = fakeNode(base.concat(mine), base.concat(theirs));
    node.rpc.ebt = { clock: (opts, cb) => cb(null, { [keys.id]: 4 }) };
    try {
      const res = await node.api.check(node.rpc);
      eq(res && res.kind, 'fork');
      eq([res.from, res.removed, res.adopted, res.republished].join(), '4,3,1,3');
      eq(node.feed().length, 7);
      eq(node.feed()[3].key, theirs[0].key, 'the network message replaces mine at the fork');
      eq(node.feed().slice(4).map(m => m.value.content.text).join(), 'A,B,C', 'everything I had written is published again on top');
    } finally { node.cleanup(); }
  });

  t('messages of my own feed that only the network has are adopted before I publish on top of an old copy', async () => {
    const base = chain([], posts('one', 'two', 'three'));
    const theirs = chain(base, posts('four', 'five'));
    const node = fakeNode(base, base.concat(theirs));
    try {
      const res = await node.api.check(node.rpc);
      eq(res && res.kind, 'missing-tail');
      eq(res.adopted, 2);
      eq(node.calls.deleted, 0, 'nothing is deleted');
      eq(node.feed().map(m => m.key).join(), base.concat(theirs).map(m => m.key).join());
    } finally { node.cleanup(); }
  });

  t('a peer that is behind, in step, or holding a copy that does not validate changes nothing', async () => {
    const base = chain([], posts('one', 'two', 'three'));
    const mine = chain(base, posts('four'));
    const behind = fakeNode(base.concat(mine), base);
    try {
      eq(await behind.api.check(behind.rpc), null);
      eq(behind.calls.deleted + behind.calls.added.length + behind.calls.published.length, 0);
    } finally { behind.cleanup(); }
    const same = fakeNode(base.concat(mine), base.concat(mine));
    try {
      eq(await same.api.check(same.rpc), null);
      eq(same.calls.deleted + same.calls.added.length, 0);
    } finally { same.cleanup(); }
    const forged = chain(base, posts('four', 'five')).map(m => ({ ...m, value: { ...m.value, content: { ...m.value.content, text: 'tampered' } } }));
    const tampered = fakeNode(base.concat(mine), base.concat(forged));
    try {
      eq(await tampered.api.check(tampered.rpc), null);
      eq(tampered.calls.deleted, 0, 'the feed is not touched when the copy offered does not validate');
      eq(tampered.feed().length, 4);
      notOk(tampered.reports().length, 'nothing is written');
    } finally { tampered.cleanup(); }
  });

  t('without a database or a connection hook the guard stays idle', () => {
    const api = plugin.init({ id: keys.id }, { path: os.tmpdir() });
    eq(typeof api.status, 'function');
    eq(api.check, undefined);
  });
});

describe('peers: a feed nobody can accept any more', (t) => {
  const bigPost = () => ({ type: 'post', text: 'x'.repeat(8000) });
  t('a message that fits the local check but not the network is withdrawn with everything after it, and the rest is published again', async () => {
    const base = chain([], posts('one', 'two', 'three'));
    const tail = chainLoose(base, [bigPost(), { type: 'post', text: 'after' }, { type: 'contact', contact: '@x.ed25519', following: true }]);
    const node = fakeNode(base.concat(tail), base);
    try {
      ok(require('../../../src/server/feed_guard').firstInvalid(base.concat(tail)).seq === 4, 'the chain breaks at the big message');
      const res = await node.api.selfCheck();
      eq(res && res.kind, 'invalid-tail');
      eq([res.from, res.removed, res.republished, res.skipped].join(), '4,3,3,0', 'nothing is lost: the big one is published again in pieces');
      const feed = node.feed();
      const chunks = feed.filter(m => m.value.content.type === 'textChunk');
      ok(chunks.length >= 1, 'its pieces are in the feed');
      const big = feed.find(m => m.value.content.type === 'post' && m.value.content.chunks);
      ok(big && big.value.content.chunkField === 'text' && big.value.content.text.length < 8000, 'and the head carries the start of the text plus the references');
      ok(feed.every(m => JSON.stringify(m.value, null, 2).length <= 8192), 'every message now fits');
      eq(feed.slice(-2).map(m => m.value.content.text || m.value.content.type).join(), 'after,contact', 'the rest follows in order');
      eq(node.calls.deleted, 1);
      eq(await node.api.selfCheck(), null, 'a second look finds nothing');
      ok(!node.reports().some(n => n.endsWith('-local-feed.json')), 'nothing was left out, so the copy is removed');
    } finally { node.cleanup(); }
  });

  t('on contact with a peer that stopped at the bad message the same repair happens', async () => {
    const base = chain([], posts('one', 'two', 'three'));
    const tail = chainLoose(base, [bigPost(), { type: 'post', text: 'after' }]);
    const node = fakeNode(base.concat(tail), base);
    try {
      node.api.status().selfChecked = true;
      const res = await node.api.check(node.rpc);
      eq(res && res.kind, 'invalid-tail');
      eq([res.from, res.removed, res.republished, res.skipped].join(), '4,2,2,0');
    } finally { node.cleanup(); }
  });

  t('a peer that is simply behind a valid tail triggers nothing', async () => {
    const base = chain([], posts('one', 'two', 'three'));
    const node = fakeNode(base.concat(chain(base, posts('four', 'five'))), base);
    try {
      eq(await node.api.check(node.rpc), null);
      eq(node.calls.deleted, 0);
    } finally { node.cleanup(); }
  });

  t('publishing something the network would reject is refused before it enters the log', async () => {
    const base = chain([], posts('one'));
    const node = fakeNode(base, base);
    try {
      const err = await new Promise((resolve) => node.server.db.publish(bigPost(), (e) => resolve(e)));
      ok(err && /too large/.test(err.message), 'the publish fails with a clear error');
      eq(node.feed().length, 1, 'nothing was written');
      const fine = await new Promise((resolve) => node.server.db.publish({ type: 'post', text: 'small' }, (e, m) => resolve(e || m)));
      eq(fine.value.content.text, 'small', 'normal messages go through');
    } finally { node.cleanup(); }
  });
});
