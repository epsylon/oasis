const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('market: create + list + bid', (t) => {
  t('A creates exchange item', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('market').createItem('exchange', 'Book', 'desc', null, 10, ['books'], 'OPEN', '2026-12-31', false, 1, '');
    ok(r);
    const list = await A.use('market').listAllItems('all');
    ok(list.length >= 1);
    eq(list[0].title, 'Book');
  });

  t('A creates auction', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('market').createItem('auction', 'Painting', '', null, 50, [], 'OPEN', '2026-12-31', false, 1, '');
    ok(r);
  });

  t('B bids on A auction (publish succeeds)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('market').createItem('auction', 'X', '', null, 10, [], 'OPEN', '2026-12-31', false, 1, '');
    B.setActor();
    await B.use('market').addBidToAuction(r.key, B.keypair.id, 15);
  });
});

describe('market: visibility (public / hidden)', (t) => {
  t('default visibility is PUBLIC', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('market').createItem('exchange', 'Bike', '', null, 10, [], 'OPEN', '2026-12-31', false, 1, '');
    const list = await A.use('market').listAllItems('all');
    const it = list.find(x => x.title === 'Bike');
    eq(it.visibility, 'PUBLIC');
  });

  t('HIDDEN item is visible to author', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('market').createItem('exchange', 'PrivateBook', '', null, 10, [], 'OPEN', '2026-12-31', false, 1, '', {}, 'HIDDEN');
    const list = await A.use('market').listAllItems('all');
    const it = list.find(x => x.title === 'PrivateBook');
    ok(it);
    eq(it.visibility, 'HIDDEN');
  });

  t('HIDDEN item is filtered out for non-author viewers', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('market').createItem('exchange', 'SecretBook', '', null, 10, [], 'OPEN', '2026-12-31', false, 1, '', {}, 'HIDDEN');
    B.setActor();
    const list = await B.use('market').listAllItems('all');
    eq(list.find(x => x.title === 'SecretBook'), undefined);
  });

  t('HIDDEN item getById returns null for non-author', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('market').createItem('exchange', 'OnlyMine', '', null, 10, [], 'OPEN', '2026-12-31', false, 1, '', {}, 'HIDDEN');
    B.setActor();
    eq(await B.use('market').getItemById(r.key), null);
  });

  t('invalid visibility falls back to PUBLIC', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('market').createItem('exchange', 'GarbageVis', '', null, 10, [], 'OPEN', '2026-12-31', false, 1, '', {}, 'NONSENSE');
    const list = await A.use('market').listAllItems('all');
    const it = list.find(x => x.title === 'GarbageVis');
    eq(it.visibility, 'PUBLIC');
  });

  t('update can flip visibility PUBLIC -> HIDDEN', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('market').createItem('exchange', 'Flip', '', null, 10, [], 'OPEN', '2026-12-31', false, 1, '');
    await A.use('market').updateItemById(r.key, { visibility: 'HIDDEN' });
    B.setActor();
    const list = await B.use('market').listAllItems('all');
    eq(list.find(x => x.title === 'Flip'), undefined);
  });
});
