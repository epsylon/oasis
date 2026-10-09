const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('forum: publish + list + reply + vote', (t) => {
  t('A creates forum thread, lists it', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('forum').createForum('general', 'My title', 'body');
    ok(r);
    const list = await A.use('forum').listAll('all');
    ok(list.length >= 1);
    eq(list[0].title, 'My title');
  });

  t('A replies to own forum', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('forum').createForum('general', 'T', 'b');
    await A.use('forum').addMessageToForum(r.key, { text: 'reply text', category: 'general', title: 'reply' });
    const result = await A.use('forum').getMessagesByForumId(r.key);
    ok(result);
    ok(Array.isArray(result.messages));
  });

  t('A votes on forum', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('forum').createForum('general', 'T', 'b');
    await A.use('forum').voteContent(r.key, 1);
  });

  t('one inhabitant counts once however many votes they publish', async () => {
    const net = makeNetwork(); const A = makePeer(net); const S = makePeer(net); A.setActor();
    const r = await A.use('forum').createForum('general', 'Counted', 'b');
    const ssbS = await S.cooler.open();
    for (let i = 0; i < 4; i++) await new Promise((res, rej) => ssbS.publish({ type: 'vote', vote: { link: r.key, value: 1, expression: 'Like' } }, (e) => e ? rej(e) : res()));
    const f = await A.use('forum').getForumById(r.key);
    eq(f.positiveVotes, 1, 'four votes from one author count as one');
  });

  t('B (other user) sees A forum', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('forum').createForum('general', 'Hello', 'world');
    B.setActor();
    const list = await B.use('forum').listAll('all');
    ok(list.length >= 1);
  });

  t('participant count is consistent between list and detail', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('forum').createForum('general', 'Thread', 'root');
    B.setActor();
    await B.use('forum').addMessageToForum(r.key, { text: 'a reply', category: 'general', title: 'reply' });
    A.setActor();
    const fromList = (await A.use('forum').listAll('all')).find(f => f.key === r.key);
    const fromDetail = await A.use('forum').getForumById(r.key);
    eq((fromDetail.participants || []).length, (fromList.participants || []).length, 'detail participant count matches the list');
    eq((fromDetail.participants || []).length, 2, 'author + replier = 2 participants (not 1)');
  });
});

const publishAs = async (P, content) => {
  const ssb = await P.cooler.open();
  return new Promise((res, rej) => ssb.publish(content, (e, m) => e ? rej(e) : res(m)));
};

const forumKeyOf = (net, P, forumId) => {
  const ssbKeys = require('../../../src/server/node_modules/ssb-keys');
  for (const m of net.log) {
    const c = m.value.content;
    if (c && c.type === 'tribe-keys' && c.tribeId === forumId && c.memberKeys && c.memberKeys[P.keypair.id]) return ssbKeys.unbox(c.memberKeys[P.keypair.id], P.keypair);
  }
  return null;
};

describe('forum: the signed author is the author', (t) => {
  t('a thread and a reply claiming somebody else are shown under their real author', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const own = await A.use('forum').createForum('general', 'Real', 'root');
    B.setActor();
    const fake = await publishAs(B, { type: 'forum', category: 'general', title: 'Fake', text: 'x', createdAt: new Date().toISOString(), author: A.keypair.id, votes: { positives: 0, negatives: 0 }, votes_inhabitants: [], isPrivate: false });
    const reply = await publishAs(B, { type: 'forum', root: own.key, text: 'impostor', author: A.keypair.id, timestamp: new Date().toISOString(), votes: { positives: 0, negatives: 0 }, votes_inhabitants: [] });
    A.setActor();
    eq((await A.use('forum').listAll('all')).find(f => f.title === 'Fake').author, B.keypair.id, 'listed under the signer');
    eq((await A.use('forum').getForumById(fake.key)).author, B.keypair.id, 'detail under the signer');
    eq((await A.use('forum').getMessagesByForumId(own.key)).messages.find(m => m.text === 'impostor').author, B.keypair.id, 'the reply under the signer');
    eq((await A.use('forum').getMessageById(reply.key)).author, B.keypair.id, 'and when fetched alone');
  });

  t('an encrypted reply claiming somebody else stays readable under its real author', async () => {
    const { fresh } = require('../../helpers/setup');
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('forum').createForum('GENERAL', 'Sealed', 'topic', true);
    const { code } = await A.use('forum').generateInvite(r.key);
    B.setActor();
    await B.use('forum').joinByInvite(code);
    const key = forumKeyOf(net, A, r.key);
    ok(key, 'the forum key is known to the members');
    const sealer = require('../../../src/models/crypto')(fresh(), 'forum');
    await publishAs(B, sealer.encryptContent({ type: 'forum', root: r.key, text: 'sealed impostor', author: A.keypair.id, timestamp: new Date().toISOString() }, [key], true));
    A.setActor();
    const found = (await A.use('forum').getMessagesByForumId(r.key)).messages.find(m => m.text === 'sealed impostor');
    ok(found, 'the encrypted reply is decrypted');
    eq(found.author, B.keypair.id);
  });
});

describe('forum: invitations come from the forum author', (t) => {
  t('an open invitation planted by somebody else is not offered', async () => {
    const net = makeNetwork(); const A = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('forum').createForum('GENERAL', 'Club', 'private', true);
    C.setActor();
    await publishAs(C, { type: 'forum-open-invite', v: 1, target: r.key, code: 'planted', by: A.keypair.id, createdAt: new Date().toISOString() });
    A.setActor();
    eq(await A.use('forum').getOpenInvite(r.key), null, 'nothing is offered');
    const { code } = await A.use('forum').generateOpenInvite(r.key);
    const offered = await A.use('forum').getOpenInvite(r.key);
    eq(offered.code, code);
    eq(offered.by, A.keypair.id);
  });

  t('a stranger cannot withdraw an invitation of the author', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('forum').createForum('GENERAL', 'Kept', 'private', true);
    const { code } = await A.use('forum').generateOpenInvite(r.key);
    const marker = net.log.find(m => m.value.content.type === 'forum-open-invite');
    C.setActor();
    await publishAs(C, { type: 'forum-open-invite-tombstone', target: marker.key, ts: new Date().toISOString() });
    await publishAs(C, { type: 'forum-invite-tombstone', target: marker.value.content.inviteKey, ts: new Date().toISOString() });
    A.setActor();
    eq((await A.use('forum').getOpenInvite(r.key)).code, code, 'still offered');
    B.setActor();
    eq((await B.use('forum').joinByInvite(code)).ok, true, 'and still works');
  });

  t('an invitation planted by a stranger hands out nothing', async () => {
    const { fresh } = require('../../helpers/setup');
    const planted = require('../../../src/models/crypto')(fresh(), 'forum');
    const net = makeNetwork(); const A = makePeer(net); const C = makePeer(net); const D = makePeer(net);
    A.setActor();
    const r = await A.use('forum').createForum('GENERAL', 'Guarded', 'private', true);
    C.setActor();
    const code = 'cafebabecafebabecafebabecafebabe';
    const salt = planted.generateInviteSalt();
    await publishAs(C, { type: 'forum-invite', target: r.key, ek: planted.encryptForInvite(planted.generateTribeKey(), code, salt), salt, codeHash: planted.hashInviteCode(code, salt) });
    D.setActor();
    let threw = false;
    try { await D.use('forum').joinByInvite(code); } catch (_) { threw = true; }
    ok(threw, 'the planted code is rejected');
  });
});
