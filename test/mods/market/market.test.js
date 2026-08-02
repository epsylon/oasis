const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('market: create + list + bid', (t) => {
  t('A creates exchange item', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('market').createItem('exchange', 'Book', 'desc', null, 10, ['books'], 'OPEN', inDays(30), false, 1, '');
    ok(r);
    const list = await A.use('market').listAllItems('all');
    ok(list.length >= 1);
    eq(list[0].title, 'Book');
  });

  t('A creates auction', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('market').createItem('auction', 'Painting', '', null, 50, [], 'OPEN', inDays(30), false, 1, '');
    ok(r);
  });

  t('B bids on A auction (publish succeeds)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('market').createItem('auction', 'X', '', null, 10, [], 'OPEN', inDays(30), false, 1, '');
    B.setActor();
    await B.use('market').addBidToAuction(r.key, B.keypair.id, 15);
  });
});

describe('market: visibility (public / hidden)', (t) => {
  t('default visibility is PUBLIC', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('market').createItem('exchange', 'Bike', '', null, 10, [], 'OPEN', inDays(30), false, 1, '');
    const list = await A.use('market').listAllItems('all');
    const it = list.find(x => x.title === 'Bike');
    eq(it.visibility, 'PUBLIC');
  });

  t('HIDDEN item is visible to author', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('market').createItem('exchange', 'PrivateBook', '', null, 10, [], 'OPEN', inDays(30), false, 1, '', {}, 'HIDDEN');
    const list = await A.use('market').listAllItems('all');
    const it = list.find(x => x.title === 'PrivateBook');
    ok(it);
    eq(it.visibility, 'HIDDEN');
  });

  t('HIDDEN item is filtered out for non-author viewers', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('market').createItem('exchange', 'SecretBook', '', null, 10, [], 'OPEN', inDays(30), false, 1, '', {}, 'HIDDEN');
    B.setActor();
    const list = await B.use('market').listAllItems('all');
    eq(list.find(x => x.title === 'SecretBook'), undefined);
  });

  t('HIDDEN item getById returns null for non-author', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('market').createItem('exchange', 'OnlyMine', '', null, 10, [], 'OPEN', inDays(30), false, 1, '', {}, 'HIDDEN');
    B.setActor();
    eq(await B.use('market').getItemById(r.key), null);
  });

  t('invalid visibility falls back to PUBLIC', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('market').createItem('exchange', 'GarbageVis', '', null, 10, [], 'OPEN', inDays(30), false, 1, '', {}, 'NONSENSE');
    const list = await A.use('market').listAllItems('all');
    const it = list.find(x => x.title === 'GarbageVis');
    eq(it.visibility, 'PUBLIC');
  });

  t('update can flip visibility PUBLIC -> HIDDEN', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('market').createItem('exchange', 'Flip', '', null, 10, [], 'OPEN', inDays(30), false, 1, '');
    await A.use('market').updateItemById(r.key, { visibility: 'HIDDEN' });
    B.setActor();
    const list = await B.use('market').listAllItems('all');
    eq(list.find(x => x.title === 'Flip'), undefined);
  });
});

describe('market: deadlines never point at the past', (t) => {
  t('an item cannot be created with a deadline already gone', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    let failed = false;
    try { await A.use('market').createItem('auction', 'Late', '', null, 10, [], 'OPEN', inDays(-1), false, 1, ''); } catch (_) { failed = true; }
    ok(failed);
  });

  t('an edit cannot move the deadline into the past', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('market').createItem('auction', 'Chair', '', null, 10, [], 'OPEN', inDays(10), false, 1, '');
    let failed = false;
    try { await A.use('market').updateItemById(r.key, { deadline: inDays(-5) }); } catch (_) { failed = true; }
    ok(failed);
    const list = await A.use('market').listAllItems('all');
    ok(new Date(list.find(x => x.title === 'Chair').deadline).getTime() > Date.now(), 'the old deadline stands and is still ahead');
  });

  t('other fields can still be edited without touching the deadline', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('market').createItem('auction', 'Lamp', '', null, 10, [], 'OPEN', inDays(10), false, 1, '');
    await A.use('market').updateItemById(r.key, { title: 'Lamp II' });
    const list = await A.use('market').listAllItems('all');
    ok(list.some(x => x.title === 'Lamp II'));
  });
});

describe('market: ratings', (t) => {
  const sell = (A, title = 'Chair') => A.use('market').createItem('exchange', title, 'd', null, 10, [], 'OPEN', inDays(20), false, 3, '');

  t('a buyer can rate the item and the stars count it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await sell(A);
    B.setActor();
    eq((await B.use('market').getItemById(r.key)).purchasedByViewer, false, 'not a buyer yet');
    await B.use('market').decrementStock(r.key);
    eq((await B.use('market').getItemById(r.key)).purchasedByViewer, true, 'now a buyer');
    await B.use('market').createOpinion(r.key, 'interesting');
    const rated = await B.use('market').getItemById(r.key);
    eq(rated.opinions.interesting, 1);
    eq(rated.ratedByViewer, true);
    ok(rated.opinions_inhabitants.includes(B.keypair.id));
    A.setActor();
    eq((await A.use('market').getItemById(r.key)).opinions.interesting, 1, 'the seller sees the rating too');
  });

  t('one buyer, one rating', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await sell(A, 'Sofa');
    B.setActor();
    await B.use('market').decrementStock(r.key);
    await B.use('market').createOpinion(r.key, 'useful');
    let failed = false;
    try { await B.use('market').createOpinion(r.key, 'interesting'); } catch (_) { failed = true; }
    ok(failed);
    eq((await B.use('market').getItemById(r.key)).opinions_inhabitants.length, 1);
  });

  t('the rating survives an edit of the item', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await sell(A, 'Bookshelf');
    B.setActor();
    await B.use('market').decrementStock(r.key);
    await B.use('market').createOpinion(r.key, 'useful');
    A.setActor();
    await A.use('market').updateItemById(r.key, { title: 'Bookshelf II' });
    const list = await A.use('market').listAllItems('all');
    const item = list.find(x => x.title === 'Bookshelf II');
    eq(item.opinions.useful, 1, 'the rating follows the chain');
  });

  t('somebody who has not bought it cannot rate it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await sell(A, 'Table');
    B.setActor();
    let failed = false;
    try { await B.use('market').createOpinion(r.key, 'interesting'); } catch (_) { failed = true; }
    ok(failed);
  });

  t('the seller cannot rate their own item', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await sell(A, 'Lamp');
    let failed = false;
    try { await A.use('market').createOpinion(r.key, 'useful'); } catch (_) { failed = true; }
    ok(failed);
  });

  t('an invented category is refused', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await sell(A, 'Desk');
    B.setActor();
    let failed = false;
    try { await B.use('market').createOpinion(r.key, 'gorgeous'); } catch (_) { failed = true; }
    ok(failed);
  });
});
