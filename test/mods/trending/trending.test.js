const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('trending: opinion + list', (t) => {
  t('listTrending returns array', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000000.sha256)', [], 'X', '', '');
    const list = await A.use('trending').listTrending({});
    ok(list);
  });

  t('A casts opinion on audio via trending model', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000001.sha256)', [], 'Y', '', '');
    await A.use('trending').createVote(r.key, 'interesting');
  });

  t('vote poll tally is authoritative (ignores forged content edits)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net); const D = makePeer(net);
    const OPTS = ['YES', 'NO', 'ABSTENTION', 'CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'];
    const deadline = new Date(Date.now() + 8 * 864e5).toISOString();
    A.setActor();
    const v = await A.use('votes').createVote('Pizza night?', deadline);
    B.setActor(); await B.use('votes').voteOnVote(v.key, 'YES');
    C.setActor(); await C.use('votes').voteOnVote(v.key, 'NO');
    D.setActor();
    const ssbD = await D.cooler.open();
    await new Promise((res, rej) => ssbD.publish({
      type: 'votes', replaces: v.key, question: 'Pizza night?', options: OPTS, deadline,
      createdBy: A.keypair.id, status: 'OPEN',
      votes: { YES: 99, NO: 0, ABSTENTION: 0, CONFUSED: 0, FOLLOW_MAJORITY: 0, NOT_INTERESTED: 0 },
      totalVotes: 99, voters: Array.from({ length: 99 }, (_, i) => '@z' + i + '.ed25519'),
      opinions: {}, opinions_inhabitants: [], createdAt: new Date().toISOString()
    }, e => e ? rej(e) : res()));
    A.setActor();
    const { filtered } = await A.use('trending').listTrending('ALL');
    const card = filtered.find(m => m.value.content.type === 'votes' && m.value.content.question === 'Pizza night?');
    ok(card, 'vote present in trending');
    eq(Number(card.value.content.totalVotes), 2, 'authoritative total, not the forged 99');
    eq(Number(card.value.content.votes.YES), 1, 'YES=1');
    eq(Number(card.value.content.votes.NO), 1, 'NO=1');
  });
});
