const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('agenda: list + discard', (t) => {
  t('listAgenda returns aggregated items', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('events').createEvent('Meet', 'd', '2030-12-01', '', 0, '', [], [], 'public', '');
    const list = await A.use('agenda').listAgenda('all');
    ok(list);
  });
});

describe('agenda: housing', (t) => {
  const inDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const place = (over = {}) => ({
    housing_type: 'rent', property_type: 'apartment', title: 'Flat by the river',
    description: 'd', price: 300, place: 'Sevilla', availableFrom: inDays(2), ...over
  });

  t('a place I published shows up in my agenda', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('housing').createHousing(place());
    const { items, counts } = await A.use('agenda').listAgenda('all');
    const mine = items.filter(i => i.type === 'housing');
    eq(mine.length, 1);
    eq(mine[0].title, 'Flat by the river');
    eq(counts.housing, 1);
  });

  t('a place I requested shows up in my agenda, and stops when I cancel', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await A.use('housing').createHousing(place({ title: 'Sofa in Lisbon' }));
    B.setActor();
    eq((await B.use('agenda').listAgenda('all')).items.filter(i => i.type === 'housing').length, 0, 'not mine, not requested');
    await B.use('housing').requestHousing(res.key);
    const after = await B.use('agenda').listAgenda('housing');
    eq(after.items.length, 1, 'the requested place is on the agenda');
    eq(after.items[0].requested, true);
    await B.use('housing').cancelRequest(res.key);
    eq((await B.use('agenda').listAgenda('housing')).items.length, 0, 'cancelling takes it off');
  });

  t('the housing filter only returns places', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('housing').createHousing(place());
    await A.use('tasks').createTask('T', 'd', new Date(Date.now() + 3600000).toISOString(), new Date(Date.now() + 7200000).toISOString(), 'HIGH', '', [], 'PUBLIC');
    const { items } = await A.use('agenda').listAgenda('housing');
    ok(items.length >= 1);
    ok(items.every(i => i.type === 'housing'));
  });
});

describe('agenda: versions republished by other inhabitants', (t) => {
  const pub = (P, content) => new Promise((res, rej) => P.node.publish(content, (e, m) => e ? rej(e) : res(m)));
  const raw = (net, key) => net.log.find(m => m.key === key).value.content;

  t('a chain crossing other authors is one item, by its author, with its latest content', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('reports').createReport('Leak', 'd', 'BUGS', null, [], 'low', {});
    const b = await pub(B, { ...raw(net, r.key), replaces: r.key });
    const c = await pub(C, { ...raw(net, b.key), replaces: b.key });
    await pub(A, { ...raw(net, c.key), title: 'Leak II', replaces: c.key });
    const { items } = await A.use('agenda').listAgenda('reports');
    const list = items.filter(i => i.title === 'Leak' || i.title === 'Leak II');
    eq(list.length, 1);
    eq(list[0].author, A.keypair.id);
    eq(list[0].title, 'Leak II');
  });

  t('a foreign copy whose original is gone never lands on the agenda', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await pub(B, { type: 'report', title: 'Ghost', description: 'd', category: 'BUGS', author: A.keypair.id, replaces: '%missing00000000000000000000000000000000000.sha256', createdAt: new Date().toISOString() });
    const { items } = await A.use('agenda').listAgenda('reports');
    eq(items.filter(i => i.title === 'Ghost').length, 0);
  });
});
