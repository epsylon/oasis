const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('events: create + list + attend', (t) => {
  t('A creates event', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('events').createEvent('Concert', 'desc', '2030-12-01T20:00:00Z', 'venue', 0, '', [], ['music'], 'public', '');
    ok(r);
    const list = await A.use('events').listAll(null, 'all');
    ok(list.length >= 1);
    eq(list[0].title, 'Concert');
  });

  t('A toggles attendance on own event', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('events').createEvent('Party', 'd', '2030-12-01', '', 0, '', [], [], 'public', '');
    await A.use('events').toggleAttendee(r.key);
    const ev = await A.use('events').getEventById(r.key);
    ok(ev.attendees.includes(A.keypair.id));
  });

  t('B (other user) attends A event', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('events').createEvent('Open', 'd', '2030-12-01', '', 0, '', [], [], 'public', '');
    B.setActor();
    const before = await B.use('events').listAll(null, 'all');
    const ev = before.find(e => e.title === 'Open');
    ok(ev);
    await B.use('events').toggleAttendee(ev.id);
    const after = await B.use('events').listAll(null, 'all');
    const updated = after.find(e => e.title === 'Open');
    ok(updated.attendees.includes(B.keypair.id));
  });

  t('A deletes own event', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('events').createEvent('X', 'd', '2030-12-01', '', 0, '', [], [], 'public', '');
    await A.use('events').deleteEventById(r.key);
    const list = await A.use('events').listAll(null, 'all');
    eq(list.length, 0);
  });
});

describe('events: versions republished by other inhabitants', (t) => {
  const pub = (P, content) => new Promise((res, rej) => P.node.publish(content, (e, m) => e ? rej(e) : res(m)));
  const raw = (net, key) => net.log.find(m => m.key === key).value.content;

  t('a chain crossing other authors stays one event with the latest content of its organizer', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('events').createEvent('Gala', 'd', '2030-12-01', '', 0, '', [], [], 'public', '');
    const b = await pub(B, { ...raw(net, r.key), replaces: r.key });
    const c = await pub(C, { ...raw(net, b.key), replaces: b.key });
    await pub(A, { ...raw(net, c.key), title: 'Gala II', replaces: c.key });
    const list = (await A.use('events').listAll(null, 'all')).filter(e => e.title === 'Gala' || e.title === 'Gala II');
    eq(list.length, 1);
    eq(list[0].organizer, A.keypair.id);
    eq(list[0].title, 'Gala II');
    const byCopy = await A.use('events').getEventById(c.key);
    eq(byCopy.id, list[0].id);
    eq(byCopy.title, 'Gala II');
  });

  t('attending through a foreign version lands on the event', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('events').createEvent('Fest', 'd', '2030-12-01', '', 0, '', [], [], 'public', '');
    const b = await pub(B, { ...raw(net, r.key), replaces: r.key });
    B.setActor();
    await B.use('events').toggleAttendee(b.key);
    A.setActor();
    const list = (await A.use('events').listAll(null, 'all')).filter(e => e.title === 'Fest');
    eq(list.length, 1);
    ok(list[0].attendees.includes(B.keypair.id));
  });

  t('a foreign version never changes the event', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('events').createEvent('Fair', 'd', '2030-12-01', '', 0, '', [], [], 'public', '');
    await pub(B, { ...raw(net, r.key), title: 'Fair by B', replaces: r.key });
    const list = (await A.use('events').listAll(null, 'all')).filter(e => e.title === 'Fair' || e.title === 'Fair by B');
    eq(list.length, 1);
    eq(list[0].title, 'Fair');
    eq(list[0].organizer, A.keypair.id);
  });
});
