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

  t('open invitation is multi-use, single, and removable', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('events').createEvent('Gala', 'private', '2030-12-01T20:00:00Z', 'hall', 0, '', [], [], 'private', '');
    const { code } = await A.use('events').generateOpenInvite(r.key);
    eq(typeof code, 'string');
    eq((await A.use('events').getOpenInvite(r.key)).code, code);
    let dup = false;
    try { await A.use('events').generateOpenInvite(r.key); } catch (_) { dup = true; }
    ok(dup, 'a second open invitation is rejected');
    B.setActor();
    eq((await B.use('events').joinByInvite(code)).ok, true);
    C.setActor();
    eq((await C.use('events').joinByInvite(code)).ok, true);
    A.setActor();
    await A.use('events').removeOpenInvite(r.key);
    eq(await A.use('events').getOpenInvite(r.key), null);
    const D = makePeer(net); D.setActor();
    let threw = false;
    try { await D.use('events').joinByInvite(code); } catch (_) { threw = true; }
    ok(threw, 'removed open invite no longer works');
  });
});

describe('events: open invitations', (t) => {
  t('an open invitation marker published by someone else for my event is ignored', async () => {
    const net = makeNetwork(); const A = makePeer(net); const S = makePeer(net);
    A.setActor();
    const r = await A.use('events').createEvent('Garden day', 'd', '2030-12-01T20:00:00Z', 'garden', 0, '', [], [], 'private', '');
    const ssbS = await S.cooler.open();
    await new Promise((res, rej) => ssbS.publish({ type: 'event-open-invite', v: 1, target: r.key, code: 'f'.repeat(32), by: A.keypair.id, createdAt: new Date().toISOString() }, (e) => e ? rej(e) : res()));
    eq(await A.use('events').getOpenInvite(r.key), null, 'no open invitation appears');
  });

  t('a key planted by a stranger is ignored', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const S = makePeer(net);
    A.setActor();
    const r = await A.use('events').createEvent('Closed doors', 'd', '2030-12-01T20:00:00Z', 'home', 0, '', [], [], 'private', '');
    const ssbKeys = require('../../../src/server/node_modules/ssb-keys');
    const planted = require('crypto').randomBytes(32).toString('hex');
    S.setActor();
    const ssbS = await S.cooler.open();
    await new Promise((res, rej) => ssbS.publish({ type: 'tribe-keys', tribeId: r.key, generation: 9, memberKeys: { [B.keypair.id]: S.tribeCrypto.boxKeyForMember(planted, B.keypair.id, ssbKeys) } }, (e) => e ? rej(e) : res()));
    B.setActor();
    await B.use('events').ingestKeys();
    notOk(require('../../../src/models/crypto')(B.configDir, 'events').getKeys(r.key).includes(planted), 'the planted key is not stored');
  });

  t('when an attendee leaves, the organizer changes the key and only those who stay receive it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const pause = () => new Promise(r => setTimeout(r, 5));
    const keysOf = (P) => require('../../../src/models/crypto')(P.configDir, 'events');
    A.setActor();
    const r = await A.use('events').createEvent('Rotating', 'd', '2030-12-01T20:00:00Z', 'home', 0, '', [], [], 'private', '');
    const codeB = (await A.use('events').generateInvite(r.key)).code;
    const codeC = (await A.use('events').generateInvite(r.key)).code;
    B.setActor(); await B.use('events').joinByInvite(codeB);
    C.setActor(); await C.use('events').joinByInvite(codeC);
    await pause();
    const before = net.log.length;
    C.setActor(); await C.use('events').toggleAttendee(r.key);
    notOk(net.log.slice(before).some(m => m.value.content.type === 'tribe-keys'), 'the one who leaves does not hand out a key');
    await pause();
    A.setActor();
    await A.use('events').listAll(null, 'all');
    const fresh = keysOf(A).getKey(r.key);
    notOk(keysOf(C).getKeys(r.key).includes(fresh), 'the new key is not the one the leaver had');
    const settled = net.log.length;
    await A.use('events').listAll(null, 'all');
    eq(net.log.length, settled, 'the key changes once, not on every visit');
    B.setActor(); await B.use('events').ingestKeys();
    C.setActor(); await C.use('events').ingestKeys();
    ok(keysOf(B).getKeys(r.key).includes(fresh), 'the attendee who stays gets the new key');
    notOk(keysOf(C).getKeys(r.key).includes(fresh), 'the attendee who left does not');
  });
});
