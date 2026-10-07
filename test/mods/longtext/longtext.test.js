const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const longText = require('../../../src/backend/long_text');

const SSB_MAX = 8192;
const fits = (m) => Buffer.byteLength(JSON.stringify(m.value), 'utf8') + 512 <= SSB_MAX;
const chunksIn = (net) => net.log.filter(m => m.value && m.value.content && m.value.content.type === longText.CHUNK_TYPE);
const paragraphs = (n, seed = 'palabra ñandú 日本語 🌱 ') => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(`${seed}${i} ` + 'lorem ipsum dolor sit amet, '.repeat(6).trim());
  return out.join('\n\n');
};
const longBody = (chars) => { let s = paragraphs(40); while (s.length < chars) s += '\n\n' + paragraphs(40); return s.slice(0, chars); };

describe('long text: split and join', (t) => {
  t('pieces concatenate back to the original and respect the byte budget', () => {
    const text = paragraphs(120);
    const pieces = longText.splitText(text, 1000);
    ok(pieces.length > 1, 'it was split');
    eq(pieces.join(''), text, 'round trip is exact');
    for (const p of pieces) ok(longText.byteLength(p) <= 1000, 'every piece is within the budget');
    ok(pieces.slice(0, -1).every(p => p.endsWith('\n\n') || p.endsWith('\n') || p.endsWith(' ')), 'cuts fall on paragraph, line or word boundaries');
  });

  t('multibyte characters are never cut in half', () => {
    const text = '日本語の文章'.repeat(400);
    const pieces = longText.splitText(text, 700);
    eq(pieces.join(''), text, 'exact round trip');
    for (const p of pieces) { ok(longText.byteLength(p) <= 700, 'within budget'); notOk(p.includes('�'), 'no broken characters'); }
  });

  t('a text within the budget is not chunked', async () => {
    const content = { type: 'post', text: 'short' };
    const out = await longText.chunkContent(content, 'text', { publish: async () => { throw new Error('must not publish'); } });
    eq(out.text, 'short');
    notOk(out.chunks, 'no chunk list');
  });

  t('the hard cap refuses texts beyond it', async () => {
    let threw = false;
    try { await longText.chunkContent({ type: 'post', text: 'x'.repeat(longText.TEXT_CAP + 1) }, 'text', { publish: async () => ({ key: '%a.sha256' }) }); }
    catch (_) { threw = true; }
    ok(threw, 'refused');
  });
});

describe('long text: blogs', (t) => {
  t('a 20000 character blog is read whole by the author and by another peer', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const text = longBody(20000);
    const created = await A.use('blogs').createBlog({ text, subject: 'long' });
    ok(chunksIn(net).length >= 2, 'continuation chunks were published');
    for (const m of net.log) ok(fits(m), 'every message fits in the SSB limit');
    eq((await A.use('blogs').getBlogById(created.key)).text, text, 'author reads it whole');
    B.setActor();
    eq((await B.use('blogs').getBlogById(created.key)).text, text, 'another peer reads it whole');
    eq((await B.use('blogs').listAll('ALL')).length, 1, 'chunks are not listed as blogs');
  });

  t('a chunk forged by a different author is ignored', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    B.setActor();
    const forged = await new Promise((res, rej) => B.node.publish({ type: longText.CHUNK_TYPE, text: ' FORGED', index: 1, total: 1, group: 'g' }, (e, m) => e ? rej(e) : res(m)));
    A.setActor();
    const parent = await new Promise((res, rej) => A.node.publish({ type: 'post', text: 'head', chunks: [forged.key] }, (e, m) => e ? rej(e) : res(m)));
    eq((await A.use('blogs').getBlogById(parent.key)).text, 'head', 'the foreign chunk is not appended');
  });
});

describe('long text: private messages', (t) => {
  t('a 15000 character PM is read whole by the recipient and not by a third peer', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const text = longBody(15000);
    await A.use('pm').sendMessage([B.keypair.id], 'long', text);
    for (const m of net.log) { ok(fits(m), 'every message fits'); ok(typeof m.value.content === 'string', 'everything is boxed'); }
    B.setActor();
    const mine = (await B.use('pm').listAllPrivate()).find(m => m.value.content.subject === 'long');
    ok(mine, 'B received it');
    eq(mine.value.content.text, text, 'B reads it whole');
    A.setActor();
    eq((await A.use('pm').listAllPrivate()).find(m => m.value.content.subject === 'long').value.content.text, text, 'A reads the sent copy whole');
    C.setActor();
    eq((await C.use('pm').listAllPrivate()).length, 0, 'C sees nothing');
  });
});

describe('long text: mailing lists', (t) => {
  t('a long list message reaches a member whole', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('mailing').createList({ title: 'Long', listType: 'CLOSED', members: [B.keypair.id] });
    const text = longBody(12000);
    await A.use('mailing').sendMessage(r.key, { subject: 'Hello', text });
    for (const m of net.log) ok(fits(m), 'every message fits');
    B.setActor();
    const list = await B.use('mailing').getListById(r.key);
    eq(list.history.length, 1, 'one message');
    eq(list.history[0].text, text, 'read whole by the member');
  });
});

describe('long text: forums', (t) => {
  t('a long public forum post and a long reply are read whole', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const text = longBody(14000);
    const r = await A.use('forum').createForum('general', 'Long', text);
    const reply = longBody(9000);
    await A.use('forum').addMessageToForum(r.key, { text: reply });
    for (const m of net.log) ok(fits(m), 'every message fits');
    B.setActor();
    eq((await B.use('forum').getForumById(r.key)).text, text, 'root read whole');
    const msgs = await B.use('forum').getMessagesByForumId(r.key);
    eq(msgs.messages[0].text, reply, 'reply read whole');
    eq((await B.use('forum').listAll('all'))[0].text, text, 'listing carries the full text');
  });

  t('a long private forum post stays sealed and is read whole by the author', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const text = longBody(10000);
    const r = await A.use('forum').createForum('general', 'Sealed', text, true);
    for (const m of net.log) ok(fits(m), 'every message fits');
    for (const m of chunksIn(net)) { ok(m.value.content.encryptedPayload, 'chunk is encrypted'); notOk(m.value.content.text, 'no plaintext'); }
    eq((await A.use('forum').getForumById(r.key)).text, text, 'read whole');
  });
});

describe('long text: tribe content', (t) => {
  t('a long tribe forum thread is read whole and an edit re-chunks it', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const tribe = await A.use('tribes').createTribe('T', 'd', null, '', [], true, 'strict', null, 'OPEN', '');
    const text = longBody(9000);
    const created = await A.use('tribesContent').create(tribe.key, 'forum', { title: 'Long', description: text });
    for (const m of net.log) { ok(fits(m), 'every message fits'); notOk(m.value.content.text, 'nothing in plaintext'); }
    eq((await A.use('tribesContent').getById(created.key)).description, text, 'read whole');
    const before = net.log.length;
    const edited = longBody(11000);
    await A.use('tribesContent').update(created.key, { description: edited });
    ok(net.log.length - before >= 3, 'the edit published new chunks');
    eq((await A.use('tribesContent').getById(created.key)).description, edited, 'the edit is read whole');
  });
});
