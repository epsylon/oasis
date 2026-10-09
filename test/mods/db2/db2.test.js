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

const makeSbot = () => {
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'node-'));
  const keys = ssbKeys.generate();
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
    .call(null, { path: dir, keys, connections: { incoming: {}, outgoing: {} }, db2: {} });
  return sbot;
};

const collect = (src) => new Promise((resolve, reject) => pull(src, pull.collect((err, arr) => err ? reject(err) : resolve(arr))));
const publish = (sbot, content) => new Promise((resolve, reject) => sbot.publish(content, (err, m) => err ? reject(err) : setTimeout(() => resolve(m), 2)));
const closeSbot = (sbot) => new Promise((resolve) => sbot.close(() => resolve()));

describe('ssb-db2: the legacy surface the models rely on', (t) => {
  t('public messages: log, user and type streams, get, status and progress', async () => {
    const sbot = makeSbot();
    try {
      const me = sbot.id;
      const a = await publish(sbot, { type: 'post', text: 'first' });
      const b = await publish(sbot, { type: 'post', text: 'second' });
      await publish(sbot, { type: 'wikiPage', title: 'W', body: 'b' });
      const log = await collect(sbot.createLogStream({}));
      eq(log.length, 3); eq(log[0].key, a.key, 'log order is arrival order');
      ok(log.every(m => m.key && m.value && typeof m.timestamp === 'number' && m.meta === undefined), 'legacy {key,value,timestamp} shape');
      const rev = await collect(sbot.createLogStream({ reverse: true, limit: 2 }));
      eq(rev.map(m => m.value.content.type).join(','), 'wikiPage,post');
      const user = await collect(sbot.createUserStream({ id: me, reverse: true, limit: 1 }));
      eq(user[0].value.content.title, 'W');
      const userFwd = await collect(sbot.createUserStream({ id: me }));
      eq(userFwd.map(m => m.value.sequence).join(','), '1,2,3');
      const posts = await collect(sbot.messagesByType({ type: 'post', reverse: true }));
      eq(posts.map(m => m.value.content.text).join(','), 'second,first');
      const one = await collect(sbot.messagesByType({ type: 'post', limit: 1 }));
      eq(one[0].key, a.key);
      const value = await new Promise((res, rej) => sbot.get(b.key, (e, v) => e ? rej(e) : res(v)));
      eq(value.content.text, 'second', 'get(id) returns the value');
      const full = await new Promise((res, rej) => sbot.get({ id: b.key, meta: true }, (e, v) => e ? rej(e) : res(v)));
      eq(full.key, b.key); eq(full.value.content.text, 'second');
      const st = sbot.status();
      ok(st.sync && typeof st.sync.since === 'number' && st.sync.plugins && typeof st.sync.plugins === 'object', 'status keeps the sync shape the indexing gate reads');
      const who = await new Promise((res, rej) => sbot.whoami((e, info) => e ? rej(e) : res(info)));
      eq(who.id, me, 'sync methods still answer a callback, as the models call them');
      const stCb = await new Promise((res, rej) => sbot.status((e, v) => e ? rej(e) : res(v)));
      eq(stCb.sync.since, st.sync.since);
      const pr = sbot.progress();
      ok(pr.indexes && pr.indexes.target >= pr.indexes.current, 'progress keeps the indexes shape');
      const since = (await collect(sbot.createLogStream({ gte: log[1].timestamp }))).map(m => m.key);
      eq(since.join(','), [log[1].key, log[2].key].join(','), 'gte on arrival time narrows the log');
    } finally { await closeSbot(sbot); }
  });

  t('private messages stay encrypted in the streams and open with unbox, read and get({private})', async () => {
    const sbot = makeSbot();
    try {
      const me = sbot.id;
      const other = ssbKeys.generate().id;
      await publish(sbot, { type: 'post', text: 'public' });
      const pm = await new Promise((res, rej) => sbot.private.publish({ type: 'post', text: 'secret', to: [other] }, [me, other], (e, m) => e ? rej(e) : res(m)));
      ok(typeof pm.value.content === 'string' && pm.value.content.endsWith('.box'), 'the stored content is a box');
      const log = await collect(sbot.createLogStream({}));
      const stored = log.find(m => m.key === pm.key);
      ok(typeof stored.value.content === 'string', 'createLogStream hands out the ciphertext, as ssb-db did');
      eq(log.filter(m => typeof m.value.content === 'object').length, 1, 'so a public-only filter still excludes it');
      const opened = sbot.private.unbox(stored);
      eq(opened.value.content.text, 'secret'); eq(opened.value.private, true); eq(opened.key, pm.key);
      eq(sbot.private.unbox(log.find(m => m.key !== pm.key)), undefined, 'a public message is not "unboxed", as before');
      const byType = await collect(sbot.messagesByType({ type: 'post' }));
      eq(byType.length, 1, 'type indexes do not see inside boxes');
      const mine = await collect(sbot.private.read({ reverse: true }));
      eq(mine.length, 1); eq(mine[0].value.content.text, 'secret'); eq(mine[0].value.private, true);
      const got = await new Promise((res, rej) => sbot.get({ id: pm.key, private: true, meta: true }, (e, v) => e ? rej(e) : res(v)));
      eq(got.value.content.text, 'secret'); eq(got.value.meta.private, true); eq(got.value.private, true);
      const plain = await new Promise((res, rej) => sbot.get(pm.key, (e, v) => e ? rej(e) : res(v)));
      ok(typeof plain.content === 'string', 'get without private keeps the box');
      const auto = await publish(sbot, { type: 'post', text: 'auto', recps: [me] });
      ok(typeof auto.value.content === 'string', 'publish with recps boxes by itself');
    } finally { await closeSbot(sbot); }
  });

  t('typed reads still find a private message of a wanted type once it has fallen out of the log window', async () => {
    const sbot = makeSbot();
    try {
      const { readTyped } = require('../../../src/models/typed_log');
      const me = sbot.id;
      const other = ssbKeys.generate().id;
      const pm = await new Promise((res, rej) => sbot.private.publish({ type: 'schoolEnroll', courseId: '%course', value: true }, [me, other], (e, m) => e ? rej(e) : res(m)));
      for (let i = 0; i < 12; i++) await publish(sbot, { type: 'post', text: 'noise ' + i });
      const seen = await readTyped(sbot, ['schoolEnroll'], { limit: 5, withWindow: true, withPrivate: true });
      ok(seen.some(m => m.key === pm.key && m.value.content.type === 'schoolEnroll' && m.value.private === true), 'the enrolment is there, already opened');
      const again = await readTyped(sbot, ['schoolEnroll'], { limit: 5, withWindow: true, withPrivate: true });
      eq(again.filter(m => m.key === pm.key).length, 1, 'and only once');
      const publicOnly = await readTyped(sbot, ['schoolEnroll'], { limit: 5, withWindow: true });
      notOk(publicOnly.some(m => m.key === pm.key && typeof m.value.content === 'object'), 'a reader that did not ask for private messages keeps the box closed');
    } finally { await closeSbot(sbot); }
  });

  t('a flood of junk deletions cannot push a real deletion out of a typed read', async () => {
    const sbot = makeSbot();
    try {
      const { readTyped } = require('../../../src/models/typed_log');
      const post = await publish(sbot, { type: 'post', text: 'to be deleted' });
      const real = await publish(sbot, { type: 'tombstone', target: post.key, deletedAt: new Date().toISOString() });
      for (let i = 0; i < 12; i++) await publish(sbot, { type: 'tombstone', target: '%junk' + i, deletedAt: new Date().toISOString() });
      const seen = await readTyped(sbot, ['tombstone'], { limit: 5 });
      ok(seen.some(m => m.key === real.key), 'the real deletion is still read');
    } finally { await closeSbot(sbot); }
  });

  t('deletions do not use up the window of recent content', async () => {
    const sbot = makeSbot();
    try {
      const { readContentWindow } = require('../../../src/models/typed_log');
      const posts = [];
      for (let i = 0; i < 3; i++) posts.push(await publish(sbot, { type: 'post', text: 'kept ' + i }));
      for (let i = 0; i < 12; i++) await publish(sbot, { type: 'tombstone', target: '%junk' + i, deletedAt: new Date().toISOString() });
      const win = await readContentWindow(sbot, 3);
      ok(posts.every(p => win.some(m => m.key === p.key)), 'every recent post is still in the window');
      eq(win.filter(m => m.value.content.type === 'tombstone').length, 12, 'the deletions met on the way are kept too');
      const newest = await publish(sbot, { type: 'post', text: 'newest' });
      const next = await readContentWindow(sbot, 3);
      ok(next.some(m => m.key === newest.key), 'the newest post enters the window');
      notOk(next.some(m => m.key === posts[0].key), 'the oldest post leaves it once the limit is full');
    } finally { await closeSbot(sbot); }
  });

  t('links: backlinks by destination, votes, replies, tangle heads and self-about', async () => {
    const sbot = makeSbot();
    try {
      const me = sbot.id;
      await publish(sbot, { type: 'about', about: me, name: 'Ana' });
      await publish(sbot, { type: 'about', about: me, description: 'd' });
      await publish(sbot, { type: 'about', about: me, name: 'Ana B' });
      const root = await publish(sbot, { type: 'post', text: 'root' });
      const reply = await publish(sbot, { type: 'post', text: 'reply', root: root.key, branch: root.key });
      const reply2 = await publish(sbot, { type: 'post', text: 'reply2', root: root.key, branch: reply.key });
      const vote = await publish(sbot, { type: 'vote', vote: { link: root.key, value: 1 } });
      await publish(sbot, { type: 'tombstone', target: reply2.key });
      const about = await collect(sbot.backlinks.read({ reverse: true, query: [{ $filter: { dest: me, value: { author: me, content: { type: 'about', about: me } } } }] }));
      eq(about.length, 3); eq(about[0].value.content.name, 'Ana B', 'newest first');
      const named = about.find(m => m.value.content.name !== undefined);
      eq(named.value.content.name, 'Ana B');
      const refs = await collect(sbot.backlinks.read({ query: [{ $filter: { dest: root.key } }], index: 'DTA' }));
      eq(refs.map(m => m.key).sort().join(','), [reply.key, reply2.key, vote.key].sort().join(','), 'everything pointing at the root');
      const last = await collect(sbot.backlinks.read({ query: [{ $filter: { dest: root.key } }], index: 'DTA', reverse: true, limit: 1 }));
      eq(last[0].key, vote.key, 'latest by claimed time with limit');
      const onlyVotes = await collect(sbot.backlinks.read({ query: [{ $filter: { dest: root.key, value: { content: { type: 'vote' } } } }] }));
      eq(onlyVotes.length, 1);
      const votes = await collect(sbot.links({ dest: root.key, rel: 'vote', values: true, keys: true }));
      eq(votes.length, 1); eq(votes[0].value.content.vote.value, 1); eq(votes[0].key, vote.key);
      const byVoter = await collect(sbot.links({ source: me, dest: root.key, rel: 'vote', values: true, keys: true }));
      eq(byVoter.length, 1);
      const byStranger = await collect(sbot.links({ source: ssbKeys.generate().id, dest: root.key, rel: 'vote', values: true, keys: true }));
      eq(byStranger.length, 0);
      const tomb = await collect(sbot.backlinks.read({ query: [{ $filter: { dest: reply2.key } }], meta: true }));
      eq(tomb.length, 1); eq(tomb[0].value.content.type, 'tombstone');
      const branch = await new Promise((res, rej) => sbot.tangle.branch(root.key, (e, keys) => e ? rej(e) : res(keys)));
      eq(branch.join(','), reply2.key, 'the tangle head is the last reply');
    } finally { await closeSbot(sbot); }
  });

  t('query.read understands the filters the models use, including live streams with a sync marker', async () => {
    const sbot = makeSbot();
    try {
      const me = sbot.id;
      await publish(sbot, { type: 'post', text: 'p1' });
      await publish(sbot, { type: 'blog', title: 'b1' });
      await publish(sbot, { type: 'vote', vote: { link: '%x', value: 1 } });
      const both = await collect(sbot.query.read({ reverse: true, query: [{ $filter: { value: { timestamp: { $lte: Date.now() }, content: { type: { $in: ['post', 'blog'] } } } } }] }));
      eq(both.map(m => m.value.content.type).join(','), 'blog,post');
      const future = await collect(sbot.query.read({ query: [{ $filter: { value: { timestamp: { $gte: Date.now() + 60000 }, content: { type: 'vote' } } } }] }));
      eq(future.length, 0);
      const mine = await collect(sbot.query.read({ query: [{ $filter: { value: { author: me, content: { type: 'vote' } } } }] }));
      eq(mine.length, 1);
      const named = await collect(sbot.query.read({ query: [{ $filter: { value: { content: { type: 'about', name: { $is: 'string' } } } } }] }));
      eq(named.length, 0);
      const seen = [];
      let sawSync = false;
      const done = new Promise((resolve) => {
        pull(
          sbot.query.read({ live: true, query: [{ $filter: { value: { content: { type: 'about', name: { $is: 'string' } } } } }] }),
          pull.drain((m) => {
            if (m.sync) { sawSync = true; return; }
            seen.push(m.value.content.name);
            if (seen.length === 1) { resolve(); return false; }
          })
        );
      });
      await publish(sbot, { type: 'about', about: me, name: 'Live' });
      await done;
      ok(sawSync, 'the sync marker arrives before live messages');
      eq(seen.join(','), 'Live');
    } finally { await closeSbot(sbot); }
  });

  t('search scans text fields, rebuild resets and rebuilds the indexes', async () => {
    const sbot = makeSbot();
    try {
      await publish(sbot, { type: 'post', text: 'the quick brown fox' });
      await publish(sbot, { type: 'blog', title: 'Fox hunting', summary: 'nothing' });
      await publish(sbot, { type: 'post', text: 'unrelated' });
      const found = await collect(sbot.search.query({ query: 'fox' }));
      eq(found.length, 2);
      const both = await collect(sbot.search.query({ query: 'quick fox' }));
      eq(both.length, 1);
      await sbot.rebuild();
      const after = await collect(sbot.messagesByType({ type: 'post' }));
      eq(after.length, 2, 'data is intact after a rebuild');
    } finally { await closeSbot(sbot); }
  });

  t('keys:false and values:false keep their classic shapes, which ssb-gossip relies on', async () => {
    const sbot = makeSbot();
    try {
      const pub = await publish(sbot, { type: 'pub', address: { host: 'pub.example', port: 8008, key: sbot.id } });
      const values = await collect(sbot.messagesByType({ type: 'pub', keys: false }));
      eq(values.length, 1); ok(values[0].content && values[0].content.address, 'keys:false yields the value alone'); eq(values[0].key, undefined);
      const keys = await collect(sbot.messagesByType({ type: 'pub', values: false }));
      eq(keys[0], pub.key, 'values:false yields the key alone');
      const logValues = await collect(sbot.createLogStream({ keys: false }));
      ok(logValues.every(v => v.author && v.content), 'createLogStream honours it too');
      const seen = [];
      const done = new Promise((resolve) => {
        pull(sbot.messagesByType({ type: 'pub', live: true, keys: false }), pull.drain((m) => {
          if (m.sync) { seen.push('sync'); return; }
          seen.push(m.content.address.host);
          if (seen.length === 3) { resolve(); return false; }
        }));
      });
      await publish(sbot, { type: 'pub', address: { host: 'pub2.example', port: 8008, key: sbot.id } });
      await done;
      eq(seen.join(','), 'pub.example,sync,pub2.example', 'old values, the sync marker, then live values');
    } finally { await closeSbot(sbot); }
  });

  t('messagesByType and links can follow the log live, as the pub announcer needs', async () => {
    const sbot = makeSbot();
    try {
      const root = await publish(sbot, { type: 'pub-owner-announce', text: 'a' });
      const got = [];
      const first = new Promise((resolve) => {
        pull(sbot.messagesByType({ type: 'pub-owner-announce', live: true }), pull.drain((m) => { if (m.sync) return; got.push(m.key); if (got.length === 2) { resolve(); return false; } }));
      });
      const second = await publish(sbot, { type: 'pub-owner-announce', text: 'b' });
      await first;
      eq(got.join(','), [root.key, second.key].join(','));
      const refs = [];
      const linkDone = new Promise((resolve) => {
        pull(sbot.backlinks.read({ query: [{ $filter: { dest: root.key } }], live: true, old: false }), pull.filter(m => !m.sync), pull.drain((m) => { refs.push(m.key); resolve(); return false; }));
      });
      const confirm = await publish(sbot, { type: 'pub-owner-confirm', announce: root.key });
      await linkDone;
      eq(refs.join(','), confirm.key);
    } finally { await closeSbot(sbot); }
  });

  t('a live stream the consumer abandons releases its log listener', async () => {
    const sbot = makeSbot();
    try {
      const root = await publish(sbot, { type: 'post', text: 'root' });
      const listeners = () => sbot.db.getLog().streams.size;
      const base = listeners();
      const takeOne = (src) => new Promise((resolve) => pull(src, pull.take(1), pull.collect(() => resolve())));
      for (let i = 0; i < 20; i++) {
        await takeOne(sbot.createLogStream({ live: true }));
        await takeOne(sbot.messagesByType({ type: 'post', live: true }));
        await takeOne(sbot.createUserStream({ id: sbot.id, live: true }));
        await takeOne(sbot.query.read({ query: [{ $filter: { value: { content: { type: 'post' } } } }], live: true }));
        await takeOne(sbot.backlinks.read({ query: [{ $filter: { dest: root.key } }], live: true }));
        await takeOne(sbot.links({ dest: root.key, live: true }));
        await takeOne(sbot.private.read({ live: true }));
      }
      await new Promise((r) => setTimeout(r, 50));
      eq(listeners(), base, 'no live query survives its consumer');
      const woke = new Promise((resolve) => pull(sbot.createLogStream({ live: true, old: false }), pull.filter(m => !m.sync), pull.drain((m) => { resolve(m.value.content.text); return false; })));
      await publish(sbot, { type: 'post', text: 'wake' });
      eq(await woke, 'wake', 'a live stream still delivers what arrives after it opened');
      await new Promise((r) => setTimeout(r, 50));
      eq(listeners(), base, 'live streams never hold a log listener of their own');
    } finally { await closeSbot(sbot); }
  });
});
