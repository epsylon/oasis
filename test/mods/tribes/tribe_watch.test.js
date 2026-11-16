const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok, notOk } = require('../../helpers/assert');

const withWatch = (fn) => {
  const prev = process.env.OASIS_STATE_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-tribe-watch-'));
  process.env.OASIS_STATE_DIR = dir;
  const file = require.resolve('../../../src/models/tribe_watch_model');
  delete require.cache[file];
  try { return fn(require(file)); } finally {
    if (prev === undefined) delete process.env.OASIS_STATE_DIR; else process.env.OASIS_STATE_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const later = (ms) => Date.now() + ms;

describe('tribes: following what happens inside a tribe', (t) => {
  t('only activity after the node started watching counts as new, by section', () => withWatch((w) => {
    w.setActivity([
      { id: 'c1', tribeId: 'T', section: 'chats', lastOtherAt: Date.now() - 86400000 },
      { id: 'c2', tribeId: 'T', section: 'chats', lastOtherAt: later(1000) },
      { id: 'f1', tribeId: 'T', section: 'forum', lastOtherAt: later(1000) },
      { id: 'x1', tribeId: 'U', section: 'chats', lastOtherAt: later(1000) }
    ]);
    const counts = w.newCounts('T');
    eq(counts.total, 2);
    eq(counts.sections.chats, 1);
    eq(counts.sections.forum, 1);
  }));

  t('opening an element, or a section, clears what was new there', () => withWatch((w) => {
    w.setActivity([
      { id: 'c2', tribeId: 'T', section: 'chats', lastOtherAt: later(1000) },
      { id: 'e1', tribeId: 'T', section: 'events', lastOtherAt: later(1000) }
    ]);
    w.markSeen('c2', later(2000));
    w.markSectionSeen('T', 'events', later(2000));
    eq(w.newCounts('T').total, 0);
  }));

  t('a followed tribe sends one notice per element until it is opened again', () => withWatch((w) => {
    const entry = { id: 'c2', tribeId: 'T', section: 'chats', lastOtherAt: later(1000) };
    w.setActivity([entry]);
    eq(w.pendingNotices().length, 0, 'nothing is followed yet');
    w.setTribe('T', true);
    eq(w.pendingNotices().length, 1);
    w.markNoticed('c2', entry.lastOtherAt);
    w.setActivity([{ ...entry, lastOtherAt: later(5000) }]);
    eq(w.pendingNotices().length, 0, 'no second notice while the first one is unread');
    w.markSeen('c2', later(6000));
    w.setActivity([{ ...entry, lastOtherAt: later(9000) }]);
    eq(w.pendingNotices().length, 1, 'new activity after the visit notifies again');
  }));

  t('an element can be followed or silenced on its own, over the tribe choice', () => withWatch((w) => {
    w.setTribe('T', true);
    w.setItem('quiet', false);
    w.setItem('loud', true);
    notOk(w.watches({ id: 'quiet', tribeId: 'T' }));
    ok(w.watches({ id: 'other', tribeId: 'T' }));
    ok(w.watches({ id: 'loud', tribeId: 'U' }));
    notOk(w.watches({ id: 'other', tribeId: 'U' }));
  }));

  t('a sub-tribe counts under its parent and the parent bell covers it', () => withWatch((w) => {
    w.setActivity([
      { id: 's1', tribeId: 'SUB', parentTribeId: 'T', section: 'pads', lastOtherAt: later(1000) },
      { id: 't1', tribeId: 'T', section: 'calendars', lastOtherAt: later(1000) }
    ]);
    const parent = w.newCounts('T');
    eq(parent.total, 2);
    eq(parent.sections.subtribes, 1);
    eq(parent.sections.calendars, 1);
    eq(w.newCounts('SUB').sections.pads, 1);
    w.setTribe('T', true);
    eq(w.pendingNotices().map((e) => e.id).sort().join(), 's1,t1');
  }));

  t('content in a tribe is placed in the section where it is shown', () => withWatch((w) => {
    eq(w.sectionOf('forum-reply'), 'forum');
    eq(w.sectionOf('event'), 'events');
    eq(w.sectionOf('media', 'image'), 'images');
    eq(w.sectionOf('media', 'nothing'), null);
    eq(w.sectionOf('pixelia'), null);
  }));
});
