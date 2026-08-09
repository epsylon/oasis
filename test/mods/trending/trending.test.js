const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
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
    await A.use('opinions').createVote(v.key, 'interesting');
    const { filtered } = await A.use('trending').listTrending('ALL');
    const card = filtered.find(m => m.value.content.type === 'votes' && m.value.content.question === 'Pizza night?');
    ok(card, 'vote present in trending');
    eq(Number(card.value.content.totalVotes), 2, 'authoritative total, not the forged 99');
    eq(Number(card.value.content.votes.YES), 1, 'YES=1');
    eq(Number(card.value.content.votes.NO), 1, 'NO=1');
  });

  t('only opined content surfaces in the trending feed', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const opined = await A.use('bookmarks').createBookmark('https://trend.test/surface', [], 's', '');
    await A.use('bookmarks').createBookmark('https://trend.test/silent', [], 'q', '');
    await A.use('trending').createVote(opined.key, 'interesting');
    const { filtered } = await A.use('trending').listTrending('ALL');
    ok(Array.isArray(filtered), 'filtered is an array');
    ok(filtered.find(m => m.value.content.url === 'https://trend.test/surface'), 'opined bookmark surfaced');
    notOk(filtered.find(m => m.value.content.url === 'https://trend.test/silent'), 'content without opinions stays out');
  });

  t('createVote records the voter on the content and it stays as the live tip', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const bm = await A.use('bookmarks').createBookmark('https://trend.test/voted', [], 'v', '');
    await A.use('trending').createVote(bm.key, 'useful');
    const { filtered } = await A.use('trending').listTrending('ALL');
    const item = filtered.find(m => m.value.content.url === 'https://trend.test/voted');
    ok(item, 'voted bookmark present once (dedup by url)');
    ok((item.value.content.opinions_inhabitants || []).includes(A.keypair.id), 'voter recorded on content');
    eq(item.value.content.opinions.useful, 1, 'category incremented');
  });

  t('type filter restricts the feed to a single content type', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const bm = await A.use('bookmarks').createBookmark('https://trend.test/type', [], 'tp', '');
    const fd = await A.use('feed').createFeed('a trending feed post about things', []);
    await A.use('trending').createVote(bm.key, 'interesting');
    await A.use('trending').createVote(fd.key, 'interesting');
    const bookmarks = (await A.use('trending').listTrending('bookmark')).filtered;
    ok(bookmarks.length >= 1, 'has bookmarks');
    ok(bookmarks.every(m => m.value.content.type === 'bookmark'), 'only bookmarks');
    const feeds = (await A.use('trending').listTrending('feed')).filtered;
    ok(feeds.every(m => m.value.content.type === 'feed'), 'only feeds');
  });

  t('MINE filter restricts the feed to the viewer own content', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const aMine = await A.use('bookmarks').createBookmark('https://trend.test/amine', [], 'am', '');
    await A.use('trending').createVote(aMine.key, 'interesting');
    B.setActor();
    const bMine = await B.use('bookmarks').createBookmark('https://trend.test/bmine', [], 'bm', '');
    await B.use('trending').createVote(bMine.key, 'interesting');
    A.setActor();
    const { filtered } = await A.use('trending').listTrending('MINE');
    ok(filtered.every(m => m.value.author === A.keypair.id), 'all mine');
    notOk(filtered.find(m => m.value.content.url === 'https://trend.test/bmine'), 'peer content excluded');
  });

  t('invalid category and unsupported type are rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const bm = await A.use('bookmarks').createBookmark('https://trend.test/bad', [], 'b', '');
    await throwsAsync(() => A.use('trending').createVote(bm.key, 'notacategory'), /Invalid voting category/);
    const ssb = await A.cooler.open();
    const raw = await new Promise((res, rej) => ssb.publish({ type: 'post', text: 'x' }, (e, r) => e ? rej(e) : res(r)));
    await throwsAsync(() => A.use('trending').createVote(raw.key, 'interesting'), /Voting not allowed/);
  });
});
