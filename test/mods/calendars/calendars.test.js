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
