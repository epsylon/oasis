const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const BLOB = (n) => `&hou0000000000000000000000000000000000000000000000${n}.sha256`;

const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const base = (over = {}) => ({
  housing_type: 'rent',
  property_type: 'apartment',
  title: 'Sunny flat',
  description: 'Two rooms next to the river',
  place: 'Lavapiés',
  price: 300,
  rooms: 2,
  size: 65,
  availableFrom: inDays(1),
  ...over
});

const create = (peer, over = {}) => peer.use('housing').createHousing(base(over));

describe('housing: publishing a place', (t) => {
  t('an offer is published and read back', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A);
    const item = await A.use('housing').getHousingById(res.key);
    eq(item.title, 'Sunny flat');
    eq(item.housing_type, 'rent');
    eq(item.property_type, 'apartment');
    eq(item.price, '300.000000');
    eq(item.status, 'OPEN');
    eq(item.author, A.keypair.id);
  });

  t('the three offer types are accepted and anything else is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    for (const type of ['sale', 'rent', 'couchsurfing']) {
      const res = await create(A, { housing_type: type, title: `place ${type}` });
      eq((await A.use('housing').getHousingById(res.key)).housing_type, type);
    }
    let failed = false;
    try { await create(A, { housing_type: 'timeshare' }); } catch (_) { failed = true; }
    ok(failed, 'an unknown type is refused');
  });

  t('couchsurfing is always free, whatever price is sent', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A, { housing_type: 'couchsurfing', price: 500, capacity: 2 });
    const item = await A.use('housing').getHousingById(res.key);
    eq(item.price, '0.000000');
    eq(item.capacity, 2);
  });

  t('a title and a description are required', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    let noTitle = false, noDescription = false;
    try { await create(A, { title: '   ' }); } catch (_) { noTitle = true; }
    try { await create(A, { description: '' }); } catch (_) { noDescription = true; }
    ok(noTitle); ok(noDescription);
  });

  t('the end date cannot be earlier than the start date', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    let failed = false;
    try { await create(A, { availableFrom: inDays(30), availableTo: inDays(10) }); } catch (_) { failed = true; }
    ok(failed);
    const res = await create(A, { availableFrom: inDays(10), availableTo: inDays(30) });
    const item = await A.use('housing').getHousingById(res.key);
    eq(item.availableFrom, inDays(10));
    eq(item.availableTo, inDays(30));
  });

  t('the start date is required and cannot be in the past', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    let missing = false, past = false;
    try { await create(A, { availableFrom: '' }); } catch (_) { missing = true; }
    try { await create(A, { availableFrom: inDays(-1) }); } catch (_) { past = true; }
    ok(missing, 'it is required');
    ok(past, 'yesterday is refused');
    const res = await create(A, { availableFrom: inDays(0) });
    eq((await A.use('housing').getHousingById(res.key)).availableFrom, inDays(0), 'today is fine');
  });

  t('an old listing can still be edited without touching its start date', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A, { availableFrom: inDays(1) });
    const tip = await A.use('housing').updateHousing(res.key, { availableFrom: inDays(-40) }).then(() => 'ok').catch(() => 'refused');
    eq(tip, 'refused', 'moving the start date into the past is refused');
    await A.use('housing').updateHousing(res.key, { price: 999 });
    const list = await A.use('housing').listHousing('ALL');
    eq(list[0].price, '999.000000', 'other fields can be edited');
  });

  t('the end date is optional', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A, { availableTo: '' });
    eq((await A.use('housing').getHousingById(res.key)).availableTo, '');
  });
});

describe('housing: photo gallery', (t) => {
  t('a listing keeps several photos in order', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A, { images: [BLOB(1), BLOB(2), BLOB(3)] });
    const item = await A.use('housing').getHousingById(res.key);
    eq(item.images.length, 3);
    eq(item.images[0], BLOB(1));
    eq(item.images[2], BLOB(3));
  });

  t('the cover is the first photo of the gallery', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A, { images: [BLOB(4), BLOB(5)] });
    eq((await A.use('housing').getHousingById(res.key)).image, BLOB(4));
  });

  t('an upload keeps its media kind and duplicates are dropped by blob id', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A, { images: [`\n![image:a.png](${BLOB(6)})`, BLOB(6), `![image:b.png](${BLOB(7)})`] });
    const item = await A.use('housing').getHousingById(res.key);
    eq(item.images.length, 2, 'the repeated blob counts once');
    ok(item.images[0].includes(BLOB(6)));
    ok(item.images[1].includes(BLOB(7)));
  });

  t('a listing carries at most one video, apart from the photos', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A, { images: [BLOB(8)], video: `[video:tour.mp4](${BLOB(9)})` });
    const item = await A.use('housing').getHousingById(res.key);
    eq(item.images.length, 1, 'the video does not enter the gallery');
    ok(item.video.includes(BLOB(9)));
    await A.use('housing').updateHousing(res.key, { video: '' });
    eq((await A.use('housing').listHousing('ALL'))[0].video, '', 'the video can be removed');
  });

  t('a gallery never grows past the limit', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const many = Array.from({ length: 12 }, (_, i) => BLOB(String(i).padStart(2, 'x')));
    const res = await create(A, { images: many });
    eq((await A.use('housing').getHousingById(res.key)).images.length, 8);
  });

  t('a listing with no photo has an empty gallery and no cover', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const item = await A.use('housing').getHousingById((await create(A)).key);
    eq(item.images.length, 0);
    eq(item.image, null);
  });
});

describe('housing: editing and closing', (t) => {
  t('the owner edits and the listing keeps a single live version', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A);
    await A.use('housing').updateHousing(res.key, { price: 450, title: 'Sunny flat (updated)' });
    const list = await A.use('housing').listHousing('ALL');
    eq(list.length, 1, 'the old version is gone');
    eq(list[0].title, 'Sunny flat (updated)');
    eq(list[0].price, '450.000000');
  });

  t('somebody else cannot edit or delete my listing', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await create(A);
    B.setActor();
    let edit = false, del = false;
    try { await B.use('housing').updateHousing(res.key, { price: 1 }); } catch (_) { edit = true; }
    try { await B.use('housing').deleteHousing(res.key); } catch (_) { del = true; }
    ok(edit); ok(del);
    A.setActor();
    eq((await A.use('housing').getHousingById(res.key)).price, '300.000000');
  });

  t('closing keeps the listing visible but blocks new requests', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await create(A);
    await A.use('housing').updateHousingStatus(res.key, 'CLOSED');
    B.setActor();
    const item = await B.use('housing').listHousing('ALL');
    eq(item.length, 1);
    eq(item[0].status, 'CLOSED');
    let failed = false;
    try { await B.use('housing').requestHousing(item[0].id); } catch (_) { failed = true; }
    ok(failed, 'a closed place cannot be requested');
  });

  t('deleting removes it from the listing', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A);
    await A.use('housing').deleteHousing(res.key);
    eq((await A.use('housing').listHousing('ALL')).length, 0);
  });

  t('a hidden listing is only visible to its owner', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await create(A, { visibility: 'HIDDEN' });
    eq((await A.use('housing').listHousing('ALL')).length, 1);
    B.setActor();
    eq((await B.use('housing').listHousing('ALL')).length, 0);
    let failed = false;
    try { await B.use('housing').getHousingById(res.key); } catch (_) { failed = true; }
    ok(failed, 'not reachable by direct id either');
  });
});

describe('housing: encryption', (t) => {
  const rawOf = async (peer, id) => new Promise((res, rej) =>
    peer.node.get(id, (e, m) => e ? rej(e) : res(m && m.content)));

  t('a hidden listing travels encrypted on the log', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A, { visibility: 'HIDDEN', title: 'Secret loft', place: 'Somewhere' });
    const raw = await rawOf(A, res.key);
    eq(raw.type, 'housing', 'the envelope still declares its type');
    ok(raw.encryptedPayload, 'there is an encrypted payload');
    notOk(raw.title, 'the title is not in the clear');
    notOk(raw.place, 'neither is the location');
    notOk(raw.price, 'nor the price');
  });

  t('a public listing is published in the clear so the network can read it', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A, { title: 'Open flat' });
    const raw = await rawOf(A, res.key);
    notOk(raw.encryptedPayload);
    eq(raw.title, 'Open flat');
  });

  t('the owner still reads their hidden listing', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A, { visibility: 'HIDDEN', title: 'Secret loft', price: 1234 });
    const item = await A.use('housing').getHousingById(res.key);
    eq(item.title, 'Secret loft');
    eq(item.price, '1234.000000');
    eq(item.visibility, 'HIDDEN');
  });

  t('a peer without the key cannot read it, not even by id', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await create(A, { visibility: 'HIDDEN', title: 'Secret loft' });
    B.setActor();
    eq((await B.use('housing').listHousing('ALL')).length, 0);
    let failed = false;
    try { await B.use('housing').getHousingById(res.key); } catch (_) { failed = true; }
    ok(failed);
  });

  t('editing a hidden listing keeps the same key and stays readable', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A, { visibility: 'HIDDEN', title: 'Secret loft' });
    await A.use('housing').updateHousing(res.key, { title: 'Secret loft II', price: 999 });
    const list = await A.use('housing').listHousing('ALL');
    eq(list.length, 1);
    eq(list[0].title, 'Secret loft II');
    eq(list[0].price, '999.000000');
    ok((await rawOf(A, list[0].id)).encryptedPayload, 'the new version is encrypted too');
  });

  t('making a listing public decrypts it for everyone', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await create(A, { visibility: 'HIDDEN', title: 'Was secret' });
    B.setActor();
    eq((await B.use('housing').listHousing('ALL')).length, 0);
    A.setActor();
    await A.use('housing').updateHousing(res.key, { visibility: 'PUBLIC' });
    B.setActor();
    const seen = await B.use('housing').listHousing('ALL');
    eq(seen.length, 1);
    eq(seen[0].title, 'Was secret');
  });
});

describe('housing: requests', (t) => {
  t('a seeker requests a place and the owner sees the request', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await create(A);
    B.setActor();
    await B.use('housing').requestHousing(res.key);
    A.setActor();
    const item = await A.use('housing').getHousingById(res.key);
    eq(item.requestCount, 1);
    ok(item.requests.includes(B.keypair.id));
  });

  t('a request can be cancelled', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await create(A);
    B.setActor();
    await B.use('housing').requestHousing(res.key);
    await B.use('housing').cancelRequest(res.key);
    A.setActor();
    eq((await A.use('housing').getHousingById(res.key)).requestCount, 0);
  });

  t('you cannot request your own place', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A);
    let failed = false;
    try { await A.use('housing').requestHousing(res.key); } catch (_) { failed = true; }
    ok(failed);
  });

  t('requests are private: a third party sees neither who asked nor how many', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const res = await create(A);
    B.setActor(); await B.use('housing').requestHousing(res.key);
    C.setActor();
    const seenByC = await C.use('housing').getHousingById(res.key);
    eq(seenByC.requests.length, 0, 'C does not see B');
    eq(seenByC.requestCount, 0, 'the request is encrypted between B and the owner');
    B.setActor();
    eq((await B.use('housing').getHousingById(res.key)).requests.length, 1, 'B still sees their own request');
  });
});

describe('housing: ratings', (t) => {
  const rate = async (peer, id, category) => peer.use('housing').createOpinion(id, category);

  t('a seeker who requested the place can rate it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await create(A);
    B.setActor();
    await B.use('housing').requestHousing(res.key);
    await rate(B, res.key, 'interesting');
    const item = await B.use('housing').getHousingById(res.key);
    eq(item.opinions.interesting, 1);
    ok(item.opinions_inhabitants.includes(B.keypair.id));
  });

  t('somebody who never requested it cannot rate it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await create(A);
    B.setActor();
    let failed = false;
    try { await rate(B, res.key, 'interesting'); } catch (_) { failed = true; }
    ok(failed);
    eq(Object.keys((await B.use('housing').getHousingById(res.key)).opinions).length, 0);
  });

  t('the owner cannot rate their own place', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await create(A);
    let failed = false;
    try { await rate(A, res.key, 'useful'); } catch (_) { failed = true; }
    ok(failed);
  });

  t('one inhabitant, one rating', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await create(A);
    B.setActor();
    await B.use('housing').requestHousing(res.key);
    await rate(B, res.key, 'interesting');
    let failed = false;
    try { await rate(B, res.key, 'useful'); } catch (_) { failed = true; }
    ok(failed);
    const item = await B.use('housing').getHousingById(res.key);
    eq(item.opinions_inhabitants.length, 1);
    notOk(item.opinions.useful);
  });

  t('ratings survive an edit of the listing', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await create(A);
    B.setActor();
    await B.use('housing').requestHousing(res.key);
    await rate(B, res.key, 'interesting');
    A.setActor();
    await A.use('housing').updateHousing(res.key, { price: 500 });
    const list = await A.use('housing').listHousing('ALL');
    eq(list.length, 1);
    eq(list[0].opinions.interesting, 1, 'the rating follows the chain');
    eq(list[0].price, '500.000000');
  });

  t('an invented category is refused', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await create(A);
    B.setActor();
    await B.use('housing').requestHousing(res.key);
    let failed = false;
    try { await rate(B, res.key, 'gorgeous'); } catch (_) { failed = true; }
    ok(failed);
  });
});

describe('housing: discovery from other modules', (t) => {
  t('the tags of a listing feed the tag cloud', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await create(A, { tags: ['loft', 'riverside'] });
    const names = (await A.use('tags').listTags('all')).map(x => x.name.toLowerCase());
    ok(names.includes('loft'));
    ok(names.includes('riverside'));
  });

  t('a hidden listing does not leak its tags', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await create(A, { visibility: 'HIDDEN', tags: ['secretplace'] });
    B.setActor();
    const names = (await B.use('tags').listTags('all')).map(x => x.name.toLowerCase());
    notOk(names.includes('secretplace'));
  });

  t('a listing is findable through the search module', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await create(A, { title: 'Riverside loft', place: 'Sevilla' });
    const results = await A.use('search').search({ query: 'riverside', types: [] });
    ok(results.housing, 'housing is one of the searchable types');
    ok(results.housing.length >= 1, 'the listing shows up');
  });
});

describe('housing: filters and search', (t) => {
  const seed = async (A) => {
    await create(A, { housing_type: 'sale', title: 'Old house', place: 'Cadiz', price: 90000 });
    await create(A, { housing_type: 'rent', title: 'Studio', place: 'Madrid', price: 500 });
    await create(A, { housing_type: 'couchsurfing', title: 'Sofa', place: 'Madrid', price: 0, capacity: 1 });
  };

  t('filters by offer type', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await seed(A);
    eq((await A.use('housing').listHousing('SALE')).length, 1);
    eq((await A.use('housing').listHousing('RENT')).length, 1);
    eq((await A.use('housing').listHousing('COUCHSURFING')).length, 1);
    eq((await A.use('housing').listHousing('ALL')).length, 3);
  });

  t('MINE and REQUESTED separate offering from seeking', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await seed(A);
    const target = (await A.use('housing').listHousing('ALL'))[0];
    B.setActor();
    await B.use('housing').requestHousing(target.id);
    eq((await B.use('housing').listHousing('MINE')).length, 0);
    eq((await B.use('housing').listHousing('REQUESTED')).length, 1);
    A.setActor();
    eq((await A.use('housing').listHousing('MINE')).length, 3);
    eq((await A.use('housing').listHousing('REQUESTED')).length, 0);
  });

  t('free text searches title, place and description', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await seed(A);
    eq((await A.use('housing').listHousing('ALL', null, { search: 'studio' })).length, 1);
    eq((await A.use('housing').listHousing('ALL', null, { search: 'madrid' })).length, 2);
    eq((await A.use('housing').listHousing('ALL', null, { search: 'zzz' })).length, 0);
  });

  t('the place filter narrows by location', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await seed(A);
    eq((await A.use('housing').listHousing('ALL', null, { place: 'Cadiz' })).length, 1);
    eq((await A.use('housing').listHousing('ALL', null, { place: 'madrid' })).length, 2);
  });

  t('the price range filters and sorting by price is ascending', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await seed(A);
    eq((await A.use('housing').listHousing('ALL', null, { maxPrice: 1000 })).length, 2, 'the sale is out');
    eq((await A.use('housing').listHousing('ALL', null, { minPrice: 1000 })).length, 1, 'only the sale');
    const sorted = await A.use('housing').listHousing('ALL', null, { sort: 'price' });
    eq(sorted[0].title, 'Sofa');
    eq(sorted[2].title, 'Old house');
  });

  t('sorting by requests puts the most requested first', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor(); await seed(A);
    const all = await A.use('housing').listHousing('ALL');
    const wanted = all.find(x => x.title === 'Sofa');
    B.setActor(); await B.use('housing').requestHousing(wanted.id);
    C.setActor(); await C.use('housing').requestHousing(wanted.id);
    A.setActor();
    const sorted = await A.use('housing').listHousing('ALL', null, { sort: 'requests' });
    eq(sorted[0].title, 'Sofa');
    eq(sorted[0].requestCount, 2);
  });
});

describe('housing: privacy of a hidden place', (t) => {
  const secret = (over = {}) => ({
    housing_type: 'rent', property_type: 'apartment', title: 'Secret loft',
    description: 'only for me', place: 'Calle Escondida 1', price: 700,
    availableFrom: inDays(2), visibility: 'HIDDEN', tags: ['secretplace'], ...over
  });

  t('a stranger finds nothing: not in the list, not by id, not in search, not in tags', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await A.use('housing').createHousing(secret());
    B.setActor();
    eq((await B.use('housing').listHousing('ALL')).length, 0, 'listing');
    let byId = false;
    try { await B.use('housing').getHousingById(res.key); } catch (_) { byId = true; }
    ok(byId, 'by id');
    const found = await B.use('search').search({ query: 'secret loft', types: [] });
    notOk(found.housing && found.housing.length, 'search');
    const tags = (await B.use('tags').listTags('all')).map(x => x.name.toLowerCase());
    notOk(tags.includes('secretplace'), 'tags');
  });

  t('the address and the price never travel in the clear', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const res = await A.use('housing').createHousing(secret());
    const raw = await new Promise((resolve, reject) =>
      A.node.get(res.key, (e, m) => e ? reject(e) : resolve(m && m.content)));
    notOk(raw.place, 'the address is not in the envelope');
    notOk(raw.price, 'neither is the price');
    notOk(raw.tags, 'nor the tags');
    notOk(raw.title, 'nor the title');
    notOk(JSON.stringify(raw).includes('Calle Escondida'), 'no trace of the address anywhere in the envelope');
    ok(raw.encryptedPayload, 'everything is inside the encrypted payload');
  });

  t('a request never names the requester to anybody else', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const res = await A.use('housing').createHousing({
      housing_type: 'rent', property_type: 'room', title: 'Open room', description: 'd',
      price: 100, availableFrom: inDays(1)
    });
    B.setActor(); await B.use('housing').requestHousing(res.key);
    C.setActor();
    const seen = await C.use('housing').getHousingById(res.key);
    eq(seen.requests.length, 0);
    eq(seen.requestCount, 0);
    A.setActor();
    const owner = await A.use('housing').getHousingById(res.key);
    ok(owner.requests.includes(B.keypair.id), 'only the owner sees who asked');
  });

  t('only somebody who requested the place is allowed to rate it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await A.use('housing').createHousing({
      housing_type: 'rent', property_type: 'room', title: 'Rateable', description: 'd',
      price: 100, availableFrom: inDays(1)
    });
    B.setActor();
    eq((await B.use('housing').getHousingById(res.key)).everRequestedByViewer, false, 'the panel stays hidden');
    await B.use('housing').requestHousing(res.key);
    eq((await B.use('housing').getHousingById(res.key)).everRequestedByViewer, true, 'now it shows');
    await B.use('housing').cancelRequest(res.key);
    eq((await B.use('housing').getHousingById(res.key)).everRequestedByViewer, true, 'cancelling does not erase that you asked');
    await B.use('housing').createOpinion(res.key, 'interesting');
    eq((await B.use('housing').getHousingById(res.key)).ratedByViewer, true);
  });
});
