const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('opinions: cast + list', (t) => {
  t('A creates content (audio) then casts opinion via opinions model', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const audio = await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000000.sha256)', [], 'X', '', '');
    await A.use('opinions').createVote(audio.key, 'interesting');
    const list = await A.use('opinions').listOpinions('ALL', '');
    ok(Array.isArray(list));
  });

  t('opinion on a bookmark surfaces it with an aggregated category count', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const bm = await A.use('bookmarks').createBookmark('https://oasis.test/one', [], 'first', '');
    await A.use('opinions').createVote(bm.key, 'interesting');
    const list = await A.use('opinions').listOpinions('ALL', '');
    const item = list.find(m => m.value.content.type === 'bookmark' && m.value.content.url === 'https://oasis.test/one');
    ok(item, 'bookmark present in opinions list');
    eq(item.value.content.opinions.interesting, 1, 'interesting counted once');
    ok(item.value.content.opinions_inhabitants.includes(A.keypair.id), 'voter recorded');
  });

  t('two distinct peers voting aggregate to 2; a repeat by same author does not inflate', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const bm = await A.use('bookmarks').createBookmark('https://oasis.test/agg', [], 'agg', '');
    await A.use('opinions').createVote(bm.key, 'useful');
    await A.use('opinions').createVote(bm.key, 'useful');
    B.setActor();
    await B.use('opinions').createVote(bm.key, 'useful');
    A.setActor();
    const list = await A.use('opinions').listOpinions('ALL', '');
    const item = list.find(m => m.value.content.url === 'https://oasis.test/agg');
    ok(item, 'bookmark present');
    eq(item.value.content.opinions.useful, 2, 'two unique voters counted, duplicate ignored');
    eq(item.value.content.opinions_inhabitants.length, 2, 'exactly two inhabitants');
  });

  t('category filter returns only content opined in that category', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const one = await A.use('bookmarks').createBookmark('https://oasis.test/cat1', [], 'c1', '');
    const two = await A.use('bookmarks').createBookmark('https://oasis.test/cat2', [], 'c2', '');
    await A.use('opinions').createVote(one.key, 'insightful');
    await A.use('opinions').createVote(two.key, 'funny');
    const insightful = await A.use('opinions').listOpinions('insightful', '');
    ok(insightful.find(m => m.value.content.url === 'https://oasis.test/cat1'), 'insightful item present');
    notOk(insightful.find(m => m.value.content.url === 'https://oasis.test/cat2'), 'funny item excluded');
  });

  t('MINE filter only returns the viewer own content', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const mineBm = await A.use('bookmarks').createBookmark('https://oasis.test/mine', [], 'mine', '');
    await A.use('opinions').createVote(mineBm.key, 'interesting');
    B.setActor();
    const otherBm = await B.use('bookmarks').createBookmark('https://oasis.test/other', [], 'other', '');
    await B.use('opinions').createVote(otherBm.key, 'interesting');
    A.setActor();
    const mine = await A.use('opinions').listOpinions('MINE', '');
    ok(mine.every(m => m.value.author === A.keypair.id), 'all items authored by viewer');
    ok(mine.find(m => m.value.content.url === 'https://oasis.test/mine'), 'own bookmark present');
    notOk(mine.find(m => m.value.content.url === 'https://oasis.test/other'), 'other author excluded');
  });

  t('invalid category is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const bm = await A.use('bookmarks').createBookmark('https://oasis.test/bad', [], 'bad', '');
    await throwsAsync(() => A.use('opinions').createVote(bm.key, 'notarealcategory'), /Invalid voting category/);
  });

  t('voting on an unsupported content type is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ssb = await A.cooler.open();
    const raw = await new Promise((res, rej) => ssb.publish({ type: 'about', about: A.keypair.id, name: 'hi' }, (e, r) => e ? rej(e) : res(r)));
    await throwsAsync(() => A.use('opinions').createVote(raw.key, 'interesting'), /Voting not allowed/);
  });

  t('voting on a non-existent message is rejected and getMessageById resolves real ones', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await throwsAsync(() => A.use('opinions').createVote('%doesnotexist.sha256', 'interesting'), /not found/);
    const bm = await A.use('bookmarks').createBookmark('https://oasis.test/get', [], 'g', '');
    const msg = await A.use('opinions').getMessageById(bm.key);
    eq(msg.content.type, 'bookmark');
  });
});

describe('opinions: only opined content is listed', (t) => {
  t('content without any opinion never appears in the listing', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const opined = await A.use('bookmarks').createBookmark('https://oasis.test/has-op', [], 'a', '');
    await A.use('bookmarks').createBookmark('https://oasis.test/no-op', [], 'b', '');
    await A.use('opinions').createVote(opined.key, 'interesting');
    for (const f of ['ALL', 'TOP', 'MINE', 'RECENT']) {
      const list = await A.use('opinions').listOpinions(f, '');
      ok(list.find(m => m.value.content.url === 'https://oasis.test/has-op'), `opined item present in ${f}`);
      notOk(list.find(m => m.value.content.url === 'https://oasis.test/no-op'), `silent item absent in ${f}`);
    }
  });
});

describe('opinions: versions republished by other inhabitants', (t) => {
  const pub = (P, content) => new Promise((res, rej) => P.node.publish(content, (e, m) => e ? rej(e) : res(m)));
  const raw = (net, key) => net.log.find(m => m.key === key).value.content;
  const place = (title) => ({ housing_type: 'rent', property_type: 'apartment', title, description: 'd', price: 300, place: 'Sevilla', availableFrom: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) });
  const titled = (list, ...titles) => list.filter(m => titles.includes(m.value.content.title));

  t('a chain crossing other authors stays one item with the latest content of its author', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('housing').createHousing(place('Loft'));
    await A.use('opinions').createVote(r.key, 'interesting');
    const b = await pub(B, { ...raw(net, r.key), replaces: r.key });
    const c = await pub(C, { ...raw(net, b.key), replaces: b.key });
    await pub(A, { ...raw(net, c.key), title: 'Loft II', replaces: c.key });
    const list = titled(await A.use('opinions').listOpinions('ALL', ''), 'Loft', 'Loft II');
    eq(list.length, 1);
    eq(list[0].value.author, A.keypair.id);
    eq(list[0].value.content.title, 'Loft II');
    eq(list[0].value.content.opinions.interesting, 1);
    B.setActor();
    eq(titled(await B.use('opinions').listOpinions('MINE', ''), 'Loft', 'Loft II').length, 0);
  });

  t('a foreign copy next to an edit of the author neither duplicates nor wins, and opinions on it count for the item', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const D = makePeer(net);
    A.setActor();
    const r = await A.use('housing').createHousing(place('Barn'));
    await pub(A, { ...raw(net, r.key), title: 'Barn II', replaces: r.key });
    const b = await pub(B, { ...raw(net, r.key), title: 'Barn by B', replaces: r.key });
    D.setActor();
    await D.use('opinions').createVote(b.key, 'useful');
    A.setActor();
    const list = titled(await A.use('opinions').listOpinions('ALL', ''), 'Barn', 'Barn II', 'Barn by B');
    eq(list.length, 1);
    eq(list[0].value.content.title, 'Barn II');
    eq(list[0].value.author, A.keypair.id);
    eq(list[0].value.content.opinions.useful, 1);
  });
});
