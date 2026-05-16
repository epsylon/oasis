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
