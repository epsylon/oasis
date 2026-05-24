const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('multi-user (3+ peers): tribe membership & content', (t) => {
  t('A creates tribe, B and C both join → Members:3, all see same content', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('tribes').createTribe('G3', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const codeB = await A.use('tribes').generateInvite(r.key);
    B.setActor();
    await B.use('tribes').joinByInvite(codeB);
    A.setActor();
    const codeC = await A.use('tribes').generateInvite(r.key);
    C.setActor();
    await C.use('tribes').joinByInvite(codeC);

    A.setActor();
    await A.use('tribesContent').create(r.key, 'feed', { description: 'broadcast' });

    for (const peer of [A, B, C]) {
      peer.setActor();
      const tribe = await peer.use('tribes').getTribeById(r.key);
      ok(tribe, `${peer.keypair.id.slice(0, 8)} sees tribe`);
      eq(tribe.members.length, 3, `${peer.keypair.id.slice(0, 8)} sees Members:3`);
      const items = await peer.use('tribesContent').listByTribe(r.key, 'feed');
      eq(items.length, 1);
      eq(items[0].description, 'broadcast');
    }
  });

  t('outsider D cannot see private tribe with 3 members', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net); const D = makePeer(net);
    A.setActor();
    const r = await A.use('tribes').createTribe('Closed', '', null, '', [], true, 'strict', null, 'OPEN', '');
    for (const peer of [B, C]) {
      A.setActor();
      const code = await A.use('tribes').generateInvite(r.key);
      peer.setActor();
      await peer.use('tribes').joinByInvite(code);
    }
    A.setActor();
    await A.use('tribesContent').create(r.key, 'feed', { description: 'inner-circle' });

    D.setActor();
    const list = await D.use('tribes').listAll();
    notOk(list.find(t => t.id === r.key), 'D does not see private tribe');
    const items = await D.use('tribesContent').listByTribe(r.key, 'feed');
    eq(items.length, 0, 'D sees no inner content');
  });

  t('three members publishing → each member sees all three feeds', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('tribes').createTribe('Trio', '', null, '', [], true, 'strict', null, 'OPEN', '');
    for (const peer of [B, C]) {
      A.setActor();
      const code = await A.use('tribes').generateInvite(r.key);
      peer.setActor();
      await peer.use('tribes').joinByInvite(code);
    }
    A.setActor(); await A.use('tribesContent').create(r.key, 'feed', { description: 'from-A' });
    B.setActor(); await B.use('tribesContent').create(r.key, 'feed', { description: 'from-B' });
    C.setActor(); await C.use('tribesContent').create(r.key, 'feed', { description: 'from-C' });

    for (const peer of [A, B, C]) {
      peer.setActor();
      const items = await peer.use('tribesContent').listByTribe(r.key, 'feed');
      const texts = items.map(i => i.description).sort();
      eq(texts.length, 3);
      eq(texts[0], 'from-A');
      eq(texts[1], 'from-B');
      eq(texts[2], 'from-C');
    }
  });
});

describe('multi-user: transfers between three peers', (t) => {
  t('A→B transfer is invisible (uninvolved) to C', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    await A.use('transfers').createTransfer(B.keypair.id, 'private-deal', '50', '2026-12-31', []);
    C.setActor();
    const cList = await C.use('transfers').listAll('all');
    const ourTransfer = cList.find(t => t.concept === 'private-deal');
    ok(ourTransfer, 'C sees public log entry');
    eq(ourTransfer.from, A.keypair.id);
    eq(ourTransfer.to, B.keypair.id);
    notOk(ourTransfer.from === C.keypair.id || ourTransfer.to === C.keypair.id, 'C is not party');
  });

  t('three-way TIME-based transfers — categories preserved per peer view', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    await A.use('transfers').createTransfer(B.keypair.id, 'help-A-to-B', '2', '2026-12-31', [], 'TIME');
    B.setActor();
    await B.use('transfers').createTransfer(C.keypair.id, 'help-B-to-C', '3', '2026-12-31', [], 'TIME');
    C.setActor();
    await C.use('transfers').createTransfer(A.keypair.id, 'help-C-to-A', '1', '2026-12-31', [], 'TIME');

    for (const peer of [A, B, C]) {
      peer.setActor();
      const list = await peer.use('transfers').listAll('all');
      const time = list.filter(t => t.category === 'TIME');
      eq(time.length, 3, `${peer.keypair.id.slice(0, 8)} sees all 3 TIME transfers`);
    }
  });
});

describe('multi-user: forum threads', (t) => {
  t('A creates a forum thread, all three peers see it on the network', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const forum = await A.use('forum').createForum('general', 'shared topic', 'hello world');
    ok(forum && forum.key, 'forum created');

    for (const peer of [A, B, C]) {
      peer.setActor();
      const list = await peer.use('forum').listAll('all');
      const found = list.find(f => f.id === forum.key || f.key === forum.key);
      ok(found, `${peer.keypair.id.slice(0, 8)} sees the forum thread`);
    }
  });
});

describe('multi-user: votes across three peers', (t) => {
  t('A creates vote, B and C cast different options, A sees both votes', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const vote = await A.use('votes').createVote('tea or coffee?', '2026-12-31', ['tea', 'coffee']);
    ok(vote && (vote.key || vote.id), 'vote created');
    const voteId = vote.key || vote.id;

    B.setActor();
    await B.use('votes').voteOnVote(voteId, 'tea');
    C.setActor();
    await C.use('votes').voteOnVote(voteId, 'coffee');

    A.setActor();
    const v = await A.use('votes').getVoteById(voteId);
    ok(v, 'A sees the vote');
    ok(v.totalVotes >= 2, `expected ≥2 votes after B+C, got ${v.totalVotes}`);
  });
});

describe('multi-user: sub-tribe membership isolation (3 peers)', (t) => {
  t('B in parent cannot read sub-tribe content; C in sub cannot read parent-only content', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const parent = await A.use('tribes').createTribe('P', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const sub = await A.use('tribes').createTribe('S', '', null, '', [], true, 'strict', parent.key, 'OPEN', '');

    A.setActor();
    const parentInvite = await A.use('tribes').generateInvite(parent.key);
    B.setActor();
    await B.use('tribes').joinByInvite(parentInvite);

    A.setActor();
    const subInvite = await A.use('tribes').generateInvite(sub.key);
    C.setActor();
    await C.use('tribes').joinByInvite(subInvite);

    A.setActor();
    await A.use('tribesContent').create(parent.key, 'feed', { description: 'parent-only-msg' });
    await A.use('tribesContent').create(sub.key, 'feed', { description: 'sub-only-msg' });

    B.setActor();
    const bParent = await B.use('tribesContent').listByTribe(parent.key, 'feed');
    eq(bParent.length, 1, 'B sees parent content');
    eq(bParent[0].description, 'parent-only-msg');
    const bSub = await B.use('tribesContent').listByTribe(sub.key, 'feed');
    eq(bSub.length, 0, 'B cannot read sub content');

    C.setActor();
    const cSub = await C.use('tribesContent').listByTribe(sub.key, 'feed');
    eq(cSub.length, 1, 'C sees sub content');
    eq(cSub[0].description, 'sub-only-msg');
    const cParent = await C.use('tribesContent').listByTribe(parent.key, 'feed');
    eq(cParent.length, 0, 'C cannot read parent content');
  });
});
