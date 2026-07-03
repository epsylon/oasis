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
