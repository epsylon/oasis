const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 16);
const DEADLINE = inDays(400);
const FIRST_DATE = inDays(30);
const MID_DATE = inDays(90);


describe('calendars: create + dates + list', (t) => {
  t('A creates calendar with first date', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('calendars').createCalendar({
      title: 'Year', status: 'OPEN', deadline: DEADLINE, tags: ['cal'],
      firstDate: FIRST_DATE, firstDateLabel: 'NY', firstNote: 'happy',
      tribeId: null
    });
    ok(r);
    const list = await A.use('calendars').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.length >= 1);
  });

  t('A adds date to own calendar', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('calendars').createCalendar({
      title: 'C', status: 'OPEN', deadline: DEADLINE, tags: [],
      firstDate: FIRST_DATE, firstDateLabel: '', firstNote: '',
      tribeId: null
    });
    await A.use('calendars').addDate(r.key, MID_DATE, 'mid-year', null, null, null, null);
    const dates = await A.use('calendars').getDatesForCalendar(r.key);
    ok(Array.isArray(dates));
    ok(dates.length >= 2);
  });

  t('A closes own calendar by setting status', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('calendars').createCalendar({
      title: 'X', status: 'OPEN', deadline: DEADLINE, tags: [],
      firstDate: FIRST_DATE, firstDateLabel: '', firstNote: '', tribeId: null
    });
    const list = await A.use('calendars').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.find(c => c.title === 'X'));
  });
});

describe('calendars: open (multi-use) invitation', (t) => {
  const mk = (A, title) => A.use('calendars').createCalendar({
    title, status: 'CLOSED', deadline: DEADLINE, tags: [],
    firstDate: FIRST_DATE, firstDateLabel: '', firstNote: '', tribeId: null
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

describe('calendars: owner edits survive foreign versions (regression)', (t) => {
  t('owner title edit renders even after a foreign-authored replaces version', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const cal = await A.use('calendars').createCalendar({ title: 'Original', status: 'OPEN', deadline: DEADLINE, tags: [], firstDate: FIRST_DATE, firstDateLabel: 'NY', firstNote: 'n', tribeId: null });

    const ssbB = await B.cooler.open();
    await new Promise((res, rej) => ssbB.publish({
      type: 'calendar', title: 'Original', status: 'OPEN', deadline: DEADLINE, tags: [],
      author: A.keypair.id, participants: [A.keypair.id, B.keypair.id], invites: [],
      replaces: cal.key, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }, (e, r) => e ? rej(e) : res(r)));

    A.setActor();
    await A.use('calendars').updateCalendarById(cal.key, { title: 'Edited by owner' });
    const got = await A.use('calendars').getCalendarById(cal.key);
    eq(got.title, 'Edited by owner', 'owner edit is the displayed content tip, not stranded by the foreign version');
  });

  t('dates stay visible when the calendar has a foreign-authored replaces version', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const cal = await A.use('calendars').createCalendar({ title: 'Cal', status: 'OPEN', deadline: DEADLINE, tags: [], firstDate: FIRST_DATE, firstDateLabel: 'NY', firstNote: 'n', tribeId: null });
    await A.use('calendars').addDate(cal.key, MID_DATE, 'mid', null, null, null, null);

    const ssbB = await B.cooler.open();
    const v1 = await new Promise((res, rej) => ssbB.publish({
      type: 'calendar', title: 'Cal', status: 'OPEN', deadline: DEADLINE, tags: [],
      author: A.keypair.id, participants: [A.keypair.id, B.keypair.id], invites: [],
      replaces: cal.key, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }, (e, r) => e ? rej(e) : res(r)));

    A.setActor();
    const viaVersion = await A.use('calendars').getDatesForCalendar(v1.key);
    ok(viaVersion.some(d => d.label === 'mid'), 'date visible when opened via the foreign-authored version id');
  });
});

describe('calendars: personal calendars are readable by their author', (t) => {
  t('the author can delete a personal calendar', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const cal = await A.use('calendars').createCalendar({ title: 'Mine', status: 'OPEN', tags: [], firstDate: new Date(Date.now() + 86400000).toISOString(), firstDateLabel: 'start' });
    const id = cal.key || cal.id;
    await A.use('calendars').deleteCalendarById(id);
    const list = await A.use('calendars').listAll({ filter: 'all', viewerId: A.keypair.id });
    eq(list.filter(c => c.title === 'Mine').length, 0, 'it is gone');
  });

  t('a note can be added, read back and removed', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const cal = await A.use('calendars').createCalendar({ title: 'With notes', status: 'OPEN', tags: [], firstDate: new Date(Date.now() + 86400000).toISOString(), firstDateLabel: 'start' });
    const id = cal.key || cal.id;
    const root = await A.use('calendars').resolveRootId(id);
    const date = await A.use('calendars').addDate(root, new Date(Date.now() + 2 * 86400000).toISOString(), 'Meeting');
    const dateId = date.key || date.id;
    const note = await A.use('calendars').addNote(root, dateId, 'bring the keys');
    const notes = await A.use('calendars').getNotesForDate(root, dateId);
    eq(notes.length, 1, 'the note is readable');
    eq(notes[0].text, 'bring the keys');
    await A.use('calendars').deleteNote(note.key || note.id);
    eq((await A.use('calendars').getNotesForDate(root, dateId)).length, 0, 'and removable');
  });
});

describe('calendars: recurrence', (t) => {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString();

  const occurrences = async (A, opts) => {
    const cal = await A.use('calendars').createCalendar({
      title: 'Recurring', status: 'OPEN', tags: [],
      firstDate: day(1), firstDateLabel: 'first', ...opts
    });
    const root = await A.use('calendars').resolveRootId(cal.key || cal.id);
    return A.use('calendars').getDatesForCalendar(root);
  };

  t('the Until field drives the recurrence even without a calendar deadline', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const weekly = await occurrences(A, { deadline: '', intervalDeadline: day(60), intervalWeekly: true });
    ok(weekly.length >= 8, `weekly expands (${weekly.length})`);
    const yearly = await occurrences(A, { deadline: '', intervalDeadline: day(800), intervalYearly: true });
    eq(yearly.length, 3, 'yearly expands over two years');
    const monthly = await occurrences(A, { deadline: '', intervalDeadline: day(90), intervalMonthly: true });
    ok(monthly.length >= 3, `monthly expands (${monthly.length})`);
  });

  t('without any end date there is a single occurrence', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const dates = await occurrences(A, { deadline: '', intervalDeadline: '', intervalWeekly: true });
    eq(dates.length, 1);
  });

  t('the calendar deadline is still used when there is no Until', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const dates = await occurrences(A, { deadline: day(60), intervalWeekly: true });
    ok(dates.length >= 8);
  });
});

describe('calendars: map location', (t) => {
  t('a calendar keeps its map link through create and update', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const cals = A.use('calendars');
    const cal = await cals.createCalendar({
      title: 'Mapped', status: 'OPEN', tags: [],
      firstDate: new Date(Date.now() + 86400000).toISOString(), firstDateLabel: 'x',
      mapUrl: '/maps/%25abc.sha256'
    });
    const id = cal.key || cal.id;
    const root = await cals.resolveRootId(id);
    eq((await cals.getCalendarById(root)).mapUrl, '/maps/%25abc.sha256');
    await cals.updateCalendarById(root, { title: 'Mapped', status: 'OPEN', tags: [], mapUrl: '/maps/%25def.sha256' });
    eq((await cals.getCalendarById(root)).mapUrl, '/maps/%25def.sha256', 'the new link is stored');
    await cals.updateCalendarById(root, { title: 'Mapped II' });
    eq((await cals.getCalendarById(root)).mapUrl, '/maps/%25def.sha256', 'editing other fields keeps it');
  });
});

describe('calendars: the dates have to add up', (t) => {
  const create = (A, over = {}) => A.use('calendars').createCalendar({
    title: 'C', status: 'OPEN', deadline: DEADLINE, tags: [],
    firstDate: FIRST_DATE, firstDateLabel: '', firstNote: '', tribeId: null, ...over
  });

  t('a deadline in the past is refused, on create and on edit', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    let refused = false;
    try { await create(A, { deadline: inDays(-1) }); } catch (_) { refused = true; }
    ok(refused, 'yesterday is not a deadline');

    const cal = await create(A);
    const moved = await A.use('calendars').updateCalendarById(cal.key, { deadline: inDays(-10) })
      .then(() => 'accepted').catch(() => 'refused');
    eq(moved, 'refused', 'and it cannot be moved into the past afterwards either');
  });

  t('a date cannot fall after the deadline of its own calendar', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    let refused = false;
    try { await create(A, { firstDate: inDays(500) }); } catch (_) { refused = true; }
    ok(refused, 'the first date has to fit inside the calendar');

    const cal = await create(A);
    const late = await A.use('calendars').addDate(cal.key, inDays(500), 'too late', null, null, null, null)
      .then(() => 'accepted').catch(() => 'refused');
    eq(late, 'refused', 'and neither does a date added later');

    const fine = await A.use('calendars').addDate(cal.key, MID_DATE, 'in time', null, null, null, null)
      .then(() => 'accepted').catch(() => 'refused');
    eq(fine, 'accepted', 'a date before the deadline is fine');
  });

  t('the recurrence cannot end before it starts nor outlive the deadline', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const cal = await create(A);

    const backwards = await A.use('calendars').addDate(cal.key, MID_DATE, 'weekly', '1', null, null, inDays(60))
      .then(() => 'accepted').catch(() => 'refused');
    eq(backwards, 'refused', 'until cannot be earlier than the date it repeats from');

    const outliving = await A.use('calendars').addDate(cal.key, MID_DATE, 'weekly', '1', null, null, inDays(600))
      .then(() => 'accepted').catch(() => 'refused');
    eq(outliving, 'refused', 'until cannot go past the calendar deadline');

    const ok1 = await A.use('calendars').addDate(cal.key, MID_DATE, 'weekly', '1', null, null, inDays(200))
      .then(() => 'accepted').catch(() => 'refused');
    eq(ok1, 'accepted', 'a recurrence that ends inside the calendar is fine');
  });
});
