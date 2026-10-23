const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { eq, ok, notOk } = require('../../helpers/assert');
const pull = require('../../../src/server/node_modules/pull-stream');
const SecretStack = require('../../../src/server/node_modules/secret-stack');
const ssbKeys = require('../../../src/server/node_modules/ssb-keys');
const longText = require('../../../src/backend/long_text');

const SERVER = path.join(__dirname, '..', '..', '..', 'src', 'server');
const mod = (name) => require(path.join(SERVER, 'node_modules', name));
const caps = { shs: crypto.randomBytes(32).toString('base64') };
const tmpRoot = path.join(os.tmpdir(), 'oasis-db2-tests');

const makeSbot = (keys) => {
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'long-'));
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
    .use(require(path.join(SERVER, 'long_content')))
    .call(null, { path: dir, keys, connections: { incoming: {}, outgoing: {} }, db2: {} });
  sbot.__dir = dir;
  return sbot;
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const publish = (sbot, content) => new Promise((resolve, reject) => sbot.publish(content, (err, m) => err ? reject(err) : setTimeout(() => resolve(m), 5)));
const collect = (src) => new Promise((resolve) => pull(src, pull.collect((e, a) => resolve(a || []))));
const closeSbot = (sbot) => new Promise((resolve) => sbot.close(() => resolve()));
const size = (v) => JSON.stringify(v, null, 2).length;

describe('ssb-db2: long content is split and put back together for every module', (t) => {
  t('a plain message with a huge description is stored in pieces that each fit, and read back whole', async () => {
    const keys = ssbKeys.generate();
    const sbot = makeSbot(keys);
    try {
      const text = Array.from({ length: 400 }, (_, i) => `línea ${i} con ñ y 🌴 `).join('\n');
      ok(text.length > 8192);
      const head = await publish(sbot, { type: 'audio', title: 'Larga', description: text, tags: ['a'] });
      await settle(200);
      const raw = await collect(sbot.createHistoryStream({ id: keys.id, keys: true }));
      ok(raw.length > 1, 'more than one message was written');
      ok(raw.every(m => size(m.value) <= 8192), 'every message fits what the network accepts');
      const log = await collect(sbot.createUserStream({ id: keys.id }));
      const audio = log.find(m => m.value.content.type === 'audio');
      eq(audio.key, head.key);
      eq(audio.value.content.description, text, 'a user stream gives the description back whole');
      notOk(audio.value.content.chunks, 'the reader never sees the pieces');
      eq(audio.value.content.title, 'Larga');
      const byType = await collect(sbot.messagesByType({ type: 'audio' }));
      eq(byType[0].value.content.description, text, 'messagesByType too');
      const single = await new Promise((resolve) => sbot.get(head.key, (e, v) => resolve(v)));
      eq(single.content.description, text, 'and get()');
      const chunks = log.filter(m => m.value.content.type === longText.CHUNK_TYPE);
      ok(chunks.length >= 1 && chunks.every(c => c.value.sequence < head.value.sequence), 'the pieces are published before the message that needs them');
    } finally { await closeSbot(sbot); await settle(500); try { fs.rmSync(sbot.__dir, { recursive: true, force: true }); } catch (_) {} }
  });

  t('a short message and a message that already brings its own pieces are left exactly as they are', async () => {
    const keys = ssbKeys.generate();
    const sbot = makeSbot(keys);
    try {
      await publish(sbot, { type: 'post', text: 'short' });
      await publish(sbot, { type: 'post', text: 'head', chunks: ['%' + 'A'.repeat(43) + '=.sha256'] });
      await settle(100);
      const log = await collect(sbot.createUserStream({ id: keys.id }));
      eq(log.length, 2, 'nothing extra was written');
      eq(log[1].value.content.chunks.length, 1, 'own pieces untouched');
    } finally { await closeSbot(sbot); await settle(500); try { fs.rmSync(sbot.__dir, { recursive: true, force: true }); } catch (_) {} }
  });

  t('a private message with a long text is split into private pieces and read back whole by the recipient side', async () => {
    const keys = ssbKeys.generate();
    const sbot = makeSbot(keys);
    try {
      const text = 'secreto '.repeat(1500);
      const sent = await new Promise((resolve, reject) => sbot.private.publish({ type: 'post', text }, [keys.id], (err, m) => err ? reject(err) : resolve(m)));
      await settle(200);
      const mine = await collect(sbot.createUserStream({ id: keys.id }));
      ok(mine.length > 1 && mine.every(m => typeof m.value.content === 'string'), 'every piece is encrypted');
      const read = await collect(sbot.private.read({}));
      const msg = read.find(m => m.key === sent.key);
      ok(msg, 'the message can be read');
      eq(msg.value.content.text, text, 'with the whole text');
    } finally { await closeSbot(sbot); await settle(500); try { fs.rmSync(sbot.__dir, { recursive: true, force: true }); } catch (_) {} }
  });

  t('something that cannot be split is refused instead of entering the log', async () => {
    const keys = ssbKeys.generate();
    const sbot = makeSbot(keys);
    try {
      let err = null;
      try { await publish(sbot, { type: 'votation', options: Array.from({ length: 300 }, (_, i) => `opción ${i} `.padEnd(60, '-')) }); } catch (e) { err = e; }
      ok(err && /too large/.test(err.message), 'the publish fails with the size error');
      eq((await collect(sbot.createUserStream({ id: keys.id }))).length, 0);
    } finally { await closeSbot(sbot); await settle(500); try { fs.rmSync(sbot.__dir, { recursive: true, force: true }); } catch (_) {} }
  });
});
