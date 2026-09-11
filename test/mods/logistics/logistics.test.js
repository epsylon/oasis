const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const tomorrow = () => new Date(Date.now() + 86400000).toISOString();
const yesterday = () => new Date(Date.now() - 86400000).toISOString();

describe('logistics: trips and shipments', (t) => {
  t('A offers a trip; it lists as OPEN with its seats, price and zones', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('logistics').createRoute({ kind: 'trip', mode: 'offer', title: 'To the market', origin: 'Village', destination: 'Town', date: tomorrow(), seats: 3, priceType: 'eco', price: 2, tags: 'car' });
    ok(r && r.key);
    const list = await A.use('logistics').listAll({ filter: 'all' });
    eq(list.length, 1);
    const x = list[0];
    eq(x.kind, 'TRIP'); eq(x.mode, 'OFFER'); eq(x.status, 'OPEN'); eq(x.seats, 3); eq(x.seatsLeft, 3); eq(x.priceType, 'ECO'); eq(x.price, 2);
    eq((await A.use('logistics').listAll({ filter: 'trips' })).length, 1);
    eq((await A.use('logistics').listAll({ filter: 'shipments' })).length, 0);
    eq((await A.use('logistics').listAll({ zone: 'town' })).length, 1, 'zone filter matches origin or destination');
    eq(A.use('logistics').zonesOf(list).length, 2);
    let bad = false;
    try { await A.use('logistics').createRoute({ title: 'No date', origin: 'a', destination: 'b' }); } catch (_) { bad = true; }
    ok(bad, 'a valid date is required');
  });

  t('bookings are encrypted between booker and owner; the owner confirms, seats go down, a receipt closes the loop', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('logistics').createRoute({ kind: 'TRIP', mode: 'OFFER', title: 'Ride', origin: 'X', destination: 'Y', date: tomorrow(), seats: 2 });
    B.setActor();
    const booking = await B.use('logistics').book(r.key, { seats: 2, notes: 'two of us' });
    ok(booking && booking.key);
    notOk(net.log.some(m => m.value.content && m.value.content.type === 'logistics-booking'), 'the booking is boxed');
    let twice = false;
    try { await B.use('logistics').book(r.key, { seats: 1 }); } catch (_) { twice = true; }
    ok(twice, 'one booking per inhabitant');
    C.setActor();
    const viewC = await C.use('logistics').getRouteById(r.key);
    eq(viewC.bookings.length, 0, 'outsiders see no bookings');
    eq(viewC.seatsLeft, 2, 'pending bookings do not take seats');
    A.setActor();
    let viewA = await A.use('logistics').getRouteById(r.key);
    eq(viewA.bookings.length, 1); eq(viewA.bookings[0].status, 'PENDING'); eq(viewA.bookings[0].notes, 'two of us');
    await A.use('logistics').setBookingStatus(booking.key, 'CONFIRMED');
    viewA = await A.use('logistics').getRouteById(r.key);
    eq(viewA.seatsLeft, 0); eq(viewA.confirmedCount, 1);
    C.setActor();
    let full = false;
    try { await C.use('logistics').book(r.key, { seats: 1 }); } catch (_) { full = true; }
    ok(full, 'no seats left');
    B.setActor();
    let notOwner = false;
    try { await B.use('logistics').setBookingStatus(booking.key, 'DELIVERED'); } catch (_) { notOwner = true; }
    ok(notOwner, 'only the owner delivers');
    A.setActor();
    await A.use('logistics').setBookingStatus(booking.key, 'DELIVERED', { receipt: 'Delivered at the station' });
    B.setActor();
    const mine = await B.use('logistics').myBookings();
    eq(mine.length, 1); eq(mine[0].status, 'DELIVERED'); eq(mine[0].receipt, 'Delivered at the station');
    eq((await B.use('logistics').listAll({ filter: 'booked' })).length, 1);
  });

  t('ratings only from participants, only once the route is closed; history lists closed routes I took part in', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('logistics').createRoute({ kind: 'SHIPMENT', mode: 'REQUEST', title: 'Move a fridge', origin: 'X', destination: 'Y', date: tomorrow(), size: 'big', weight: '60kg', orderRef: '/market/%item.sha256' });
    B.setActor();
    const booking = await B.use('logistics').book(r.key, { notes: 'I have a van' });
    A.setActor();
    await A.use('logistics').setBookingStatus(booking.key, 'CONFIRMED');
    B.setActor();
    let early = false;
    try { await B.use('logistics').rate(r.key, { score: 5 }); } catch (_) { early = true; }
    ok(early, 'open routes cannot be rated yet');
    A.setActor();
    await A.use('logistics').closeRoute(r.key);
    C.setActor();
    let stranger = false;
    try { await C.use('logistics').rate(r.key, { score: 1 }); } catch (_) { stranger = true; }
    ok(stranger, 'outsiders cannot rate');
    B.setActor();
    await B.use('logistics').rate(r.key, { score: 4, text: 'smooth' });
    A.setActor();
    await A.use('logistics').rate(r.key, { score: 5 });
    const view = await A.use('logistics').getRouteById(r.key);
    eq(view.status, 'CLOSED'); eq(view.ratingCount, 2); eq(view.ratingAvg, 4.5);
    eq((await B.use('logistics').listAll({ filter: 'history' })).length, 1, 'B has the closed route in history');
    C.setActor();
    eq((await C.use('logistics').listAll({ filter: 'history' })).length, 0);
  });

  t('a dated route in the past reads as PAST; edits keep the root id; others cannot edit or delete', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('logistics').createRoute({ kind: 'TRIP', mode: 'REQUEST', title: 'Old ride', origin: 'X', destination: 'Y', date: yesterday() });
    eq((await A.use('logistics').getRouteById(r.key)).status, 'PAST');
    await A.use('logistics').updateRoute(r.key, { title: 'Old ride (edited)', date: tomorrow() });
    const v = await A.use('logistics').getRouteById(r.key);
    eq(v.title, 'Old ride (edited)'); eq(v.status, 'OPEN'); eq(v.id, r.key);
    B.setActor();
    let denied = false;
    try { await B.use('logistics').updateRoute(r.key, { title: 'nope' }); } catch (_) { denied = true; }
    ok(denied);
    let del = false;
    try { await B.use('logistics').deleteRoute(r.key); } catch (_) { del = true; }
    ok(del);
    A.setActor();
    await A.use('logistics').deleteRoute(r.key);
    notOk(await A.use('logistics').getRouteById(r.key));
  });

  t('inhabitants give one opinion per route', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('logistics').createRoute({ kind: 'TRIP', mode: 'OFFER', title: 'Ride', origin: 'A', destination: 'B', date: tomorrow() });
    B.setActor();
    await B.use('logistics').createOpinion(r.key, 'interesting');
    let twice = false;
    try { await B.use('logistics').createOpinion(r.key, 'inspiring'); } catch (_) { twice = true; }
    ok(twice, 'one opinion per inhabitant');
    A.setActor();
    const v = await A.use('logistics').getRouteById(r.key);
    eq(v.opinions.interesting, 1); eq(v.opinionCount, 1); eq(v.opinions_inhabitants[0], B.keypair.id);
  });
});
