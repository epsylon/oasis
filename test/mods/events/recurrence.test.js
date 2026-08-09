const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const { expandRecurrence, nextOccurrence } = require('../../../src/models/recurrence');

const iso = (d) => new Date(d).toISOString();
const DAY = 24 * 60 * 60 * 1000;

describe('events: recurrence', (t) => {
  t('without a rule an event has a single date', () => {
    const list = expandRecurrence('2026-03-01T10:00:00Z', '', false, false, false);
    eq(list.length, 1, 'just the first one');
  });

  t('a weekly rule repeats until the end date and no further', () => {
    const list = expandRecurrence('2026-03-01T10:00:00Z', '2026-03-29T10:00:00Z', true, false, false);
    eq(list.length, 5, 'five weekly dates');
    eq(iso(list[1]), '2026-03-08T10:00:00.000Z', 'a week later');
    eq(iso(list[4]), '2026-03-29T10:00:00.000Z', 'the last one lands on the deadline');
  });

  t('monthly and yearly rules can be combined without duplicates', () => {
    const list = expandRecurrence('2026-01-15T10:00:00Z', '2028-01-15T10:00:00Z', false, true, true);
    const times = list.map(d => d.getTime());
    eq(times.length, new Set(times).size, 'no repeated dates');
    ok(times.includes(new Date('2027-01-15T10:00:00Z').getTime()), 'the yearly one is there once');
  });

  t('a rule without an end date does not run away', () => {
    const list = expandRecurrence('2026-03-01T10:00:00Z', '', true, false, false);
    eq(list.length, 1, 'no deadline means no repetition');
  });

  t('the next occurrence is the first one still ahead', () => {
    const start = Date.now() - 30 * DAY;
    const until = Date.now() + 30 * DAY;
    const next = nextOccurrence(iso(start), iso(until), true, false, false, Date.now());
    ok(next.getTime() >= Date.now(), 'it is in the future');
    ok(next.getTime() - Date.now() < 8 * DAY, 'and within a week');
  });

  t('a recurring event stays open after its first date has passed', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const events = A.use('events');
    const first = iso(Date.now() + DAY);
    const created = await events.createEvent('weekly meetup', 'desc', first, 'here', 0, '', [], [], 'public', '', false, {},
      { weekly: true, until: iso(Date.now() + 60 * DAY) });

    const ev = await events.getEventById(created.key);
    ok(ev.recurring, 'it is marked as recurring');
    eq(ev.status, 'OPEN', 'and open');
    ok(ev.occurrences.length > 5, `it lists the upcoming dates (${ev.occurrences.length})`);

    await events.updateEventById(created.key, { title: 'renamed' });
    const after = await events.getEventById(created.key);
    eq(after.title, 'renamed', 'edited');
    ok(after.recurring, 'and the rule survived the edit');
  });

  t('a non-recurring event is unaffected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const events = A.use('events');
    const created = await events.createEvent('one off', 'desc', iso(Date.now() + DAY), 'here', 0, '', [], [], 'public');
    const ev = await events.getEventById(created.key);
    notOk(ev.recurring, 'not recurring');
    eq(ev.occurrences.length, 1, 'a single date');
  });
});
