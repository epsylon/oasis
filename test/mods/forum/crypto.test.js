const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('forum: crypto', (t) => {
  t('public forum is plaintext and any peer can read', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r = await A.use('forum').createForum('GENERAL', 'Hello world', 'open thread', false);
    ok(r && r.key);
    const f = await A.use('forum').getForumById(r.key);
    eq(f.title, 'Hello world');
    notOk(f.isPrivate);
  });

  t('private forum encrypts title/text; author can decrypt', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r = await A.use('forum').createForum('GENERAL', 'Secret thread', 'sensitive', true);
    const f = await A.use('forum').getForumById(r.key);
    eq(f.title, 'Secret thread');
    eq(f.isPrivate, true);
  });

  t('outsider without key cannot decrypt private forum', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('forum').createForum('GENERAL', 'Members only', 'private text', true);
    B.setActor();
    let threw = false;
    try { await B.use('forum').getForumById(r.key); } catch (_) { threw = true; }
    ok(threw);
  });

  t('outsider redeems forum invite and can read', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('forum').createForum('GENERAL', 'Invite-only', 'private', true);
    const { code } = await A.use('forum').generateInvite(r.key);
    eq(typeof code, 'string');
    eq(code.length, 32);
    B.setActor();
    const result = await B.use('forum').joinByInvite(code);
    eq(result.ok, true);
    const f = await B.use('forum').getForumById(r.key);
    eq(f.title, 'Invite-only');
    eq(f.isPrivate, true);
  });

  t('private forum rejects invite generation by non-author', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('forum').createForum('GENERAL', 'A', 'a', true);
    B.setActor();
    let threw = false;
    try { await B.use('forum').generateInvite(r.key); } catch (_) { threw = true; }
    ok(threw);
  });

  t('public forum invite generation is rejected', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r = await A.use('forum').createForum('GENERAL', 'A', 'a', false);
    let threw = false;
    try { await A.use('forum').generateInvite(r.key); } catch (_) { threw = true; }
    ok(threw);
  });

  t('private forum reply encrypts content with the same key', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r = await A.use('forum').createForum('GENERAL', 'Discussion', 'topic', true);
    const reply = await A.use('forum').addMessageToForum(r.key, { text: 'a reply' });
    ok(reply);
    const data = await A.use('forum').getMessagesByForumId(r.key);
    ok(data);
    const found = (data.messages || []).find(rp => rp.text === 'a reply');
    ok(found, 'reply text should decrypt for the author');
    eq(data.total, 1);
  });
});
