const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('events: crypto', (t) => {
  t('public event is published as plaintext', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r = await A.use('events').createEvent('Open meetup', 'desc', '2030-12-01T20:00:00Z', 'plaza', 0, '', [], [], 'public', '');
    ok(r && r.key);
    const ev = await A.use('events').getEventById(r.key);
    eq(ev.title, 'Open meetup');
    eq(ev.isPublic, 'public');
    notOk(ev.encrypted);
  });

  t('private event encrypts content and exposes encrypted flag', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r = await A.use('events').createEvent('Secret meetup', 'sensitive', '2030-12-01T20:00:00Z', 'undisclosed', 0, '', [], [], 'private', '');
    ok(r && r.key);
    const ev = await A.use('events').getEventById(r.key);
    eq(ev.title, 'Secret meetup');
    eq(ev.isPublic, 'private');
    ok(ev.encrypted);
  });

  t('outsider without key cannot decrypt private event', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('events').createEvent('Members only', 'private text', '2030-12-01T20:00:00Z', 'home', 0, '', [], [], 'private', '');
    B.setActor();
    let threw = false;
    try { await B.use('events').getEventById(r.key); } catch (_) { threw = true; }
    ok(threw, 'B without the key should not be able to read the encrypted event');
  });

  t('outsider redeems invite code, ends up as an attendee and can decrypt', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('events').createEvent('Invite-only', 'private', '2030-12-01T20:00:00Z', 'somewhere', 0, '', [], [], 'private', '');
    const { code } = await A.use('events').generateInvite(r.key);
    eq(typeof code, 'string');
    eq(code.length, 32);
    B.setActor();
    const result = await B.use('events').joinByInvite(code);
    eq(result.ok, true);
    const list = await B.use('events').listAll(null, 'all');
    const ev = list.find(e => e.title === 'Invite-only');
    ok(ev);
    ok(Array.isArray(ev.attendees) && ev.attendees.includes(B.keypair.id));
  });

  t('public → private toggle generates a key and encrypts subsequent reads', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r = await A.use('events').createEvent('Switch test', 'public-initially', '2030-12-01T20:00:00Z', 'public-loc', 0, '', [], [], 'public', '');
    let ev = await A.use('events').getEventById(r.key);
    eq(ev.isPublic, 'public');
    notOk(ev.encrypted);
    const upd = await A.use('events').updateEventById(r.key, { isPublic: 'private' });
    ok(upd);
    ev = await A.use('events').getEventById(upd.key);
    eq(ev.isPublic, 'private');
    ok(ev.encrypted);
  });

  t('private → public toggle stops encrypting future updates', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r = await A.use('events').createEvent('Open soon', 'will become public', '2030-12-01T20:00:00Z', 'somewhere', 0, '', [], [], 'private', '');
    const upd = await A.use('events').updateEventById(r.key, { isPublic: 'public' });
    const ev = await A.use('events').getEventById(upd.key);
    eq(ev.isPublic, 'public');
    notOk(ev.encrypted);
  });

  t('only the organizer can generate invites for a private event', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('events').createEvent('A event', 'd', '2030-12-01T20:00:00Z', '', 0, '', [], [], 'private', '');
    B.setActor();
    let threw = false;
    try { await B.use('events').generateInvite(r.key); } catch (_) { threw = true; }
    ok(threw);
  });

  t('public event invite generation is rejected', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const r = await A.use('events').createEvent('Public', 'd', '2030-12-01T20:00:00Z', '', 0, '', [], [], 'public', '');
    let threw = false;
    try { await A.use('events').generateInvite(r.key); } catch (_) { threw = true; }
    ok(threw);
  });
});
