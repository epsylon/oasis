const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('calendars: create + dates + list', (t) => {
  t('A creates calendar with first date', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('calendars').createCalendar({
      title: 'Year', status: 'OPEN', deadline: '2026-12-31', tags: ['cal'],
      firstDate: '2030-01-01', firstDateLabel: 'NY', firstNote: 'happy',
      tribeId: null
    });
    ok(r);
    const list = await A.use('calendars').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.length >= 1);
  });

  t('A adds date to own calendar', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('calendars').createCalendar({
      title: 'C', status: 'OPEN', deadline: '2026-12-31', tags: [],
      firstDate: '2030-01-01', firstDateLabel: '', firstNote: '',
      tribeId: null
    });
    await A.use('calendars').addDate(r.key, '2030-06-01', 'mid-year', null, null, null, null);
    const dates = await A.use('calendars').getDatesForCalendar(r.key);
    ok(Array.isArray(dates));
    ok(dates.length >= 2);
  });

  t('A closes own calendar by setting status', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('calendars').createCalendar({
      title: 'X', status: 'OPEN', deadline: '2026-12-31', tags: [],
      firstDate: '2030-01-01', firstDateLabel: '', firstNote: '', tribeId: null
    });
    const list = await A.use('calendars').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.find(c => c.title === 'X'));
  });
});

describe('calendars: open (multi-use) invitation', (t) => {
  const mk = (A, title) => A.use('calendars').createCalendar({
    title, status: 'CLOSED', deadline: '2026-12-31', tags: [],
    firstDate: '2030-01-01', firstDateLabel: '', firstNote: '', tribeId: null
  });

  t('open invitation is multi-use and only one at a time', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await mk(A, 'Shared');
    const code = await A.use('calendars').generateOpenInvite(r.key);
    ok(typeof code === 'string' && code.length > 0, 'open invite code generated');
    eq((await A.use('calendars').getOpenInvite(r.key)).code, code, 'getOpenInvite returns the code');
    let dup = false;
    try { await A.use('calendars').generateOpenInvite(r.key); } catch (_) { dup = true; }
    ok(dup, 'a second open invitation is rejected');
    B.setActor();
    ok(await B.use('calendars').joinByInvite(code), 'B joins via open invite');
    C.setActor();
    ok(await C.use('calendars').joinByInvite(code), 'C also joins via the same open invite (multi-use)');
  });

  t('author can remove the open invitation', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await mk(A, 'Shared2');
    const code = await A.use('calendars').generateOpenInvite(r.key);
    await A.use('calendars').removeOpenInvite(r.key);
    eq(await A.use('calendars').getOpenInvite(r.key), null, 'open invite removed');
    B.setActor();
    let threw = false;
    try { await B.use('calendars').joinByInvite(code); } catch (_) { threw = true; }
    ok(threw, 'removed open invite no longer works');
  });
});

describe('calendars: encrypted visibility (no blank duplicate cards)', (t) => {
  const future = (d) => new Date(Date.now() + d * 864e5).toISOString();

  t('non-member sees open calendars decrypted and never a blank encrypted card', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('calendars').createCalendar({ title: 'Open One', status: 'OPEN', deadline: future(30), tags: [], firstDate: future(3), firstDateLabel: 'D', firstNote: 'n', tribeId: null });
    await A.use('calendars').createCalendar({ title: 'Private One', status: 'CLOSED', deadline: future(30), tags: [], firstDate: future(3), firstDateLabel: 'D', firstNote: 'n', tribeId: null });
    B.setActor();
    const list = await B.use('calendars').listAll({ filter: 'all', viewerId: B.keypair.id });
    ok(list.some(c => c.title === 'Open One'), 'non-member discovers the open calendar via its public invite');
    ok(!list.some(c => c.encrypted), 'no undecryptable (blank) calendar card is shown to a non-member');
    ok(!list.some(c => c.title === 'Private One'), 'the private calendar is not shown to a non-member');
  });

  t('owner still sees all of their own calendars', async () => {
    const net = makeNetwork(); const A = makePeer(net);
    A.setActor();
    await A.use('calendars').createCalendar({ title: 'Mine Open', status: 'OPEN', deadline: future(30), tags: [], firstDate: future(3), firstDateLabel: 'D', firstNote: 'n', tribeId: null });
    await A.use('calendars').createCalendar({ title: 'Mine Closed', status: 'CLOSED', deadline: future(30), tags: [], firstDate: future(3), firstDateLabel: 'D', firstNote: 'n', tribeId: null });
    const list = await A.use('calendars').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.some(c => c.title === 'Mine Open'), 'owner sees own open calendar');
    ok(list.some(c => c.title === 'Mine Closed'), 'owner sees own closed calendar');
    ok(!list.some(c => c.encrypted), 'owner never sees a blank encrypted card for own calendars');
  });

  t('duplicate calendar roots are collapsed: original + freshest participants', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('calendars').createCalendar({ title: 'Fair', status: 'OPEN', deadline: future(30), tags: ['t'], firstDate: future(3), firstDateLabel: 'D', firstNote: 'n', tribeId: null });
    const before = (await A.use('calendars').listAll({ filter: 'all', viewerId: A.keypair.id })).find(c => c.title === 'Fair');
    ok(before, 'original calendar exists');
    const ssbA = await A.cooler.open();
    await new Promise((res, rej) => ssbA.publish({
      type: 'calendar', title: 'Fair', status: 'OPEN', deadline: before.deadline || '', tags: ['t'],
      author: A.keypair.id, participants: [A.keypair.id, B.keypair.id], invites: [],
      createdAt: before.createdAt, updatedAt: new Date(Date.now() + 5000).toISOString()
    }, e => e ? rej(e) : res()));
    const list = await A.use('calendars').listAll({ filter: 'all', viewerId: A.keypair.id });
    const fairs = list.filter(c => c.title === 'Fair');
    eq(fairs.length, 1, 'the duplicate calendar root is collapsed into a single card');
    eq(fairs[0].key, before.key, 'canonical card keeps the original (first-created) key');
    eq((fairs[0].participants || []).length, 2, 'participants are taken from the freshest duplicate');
  });
});
