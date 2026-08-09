const { eq, ok, notOk } = require('../../helpers/assert');
const bot = require('../../../src/backend/pm_policy');

describe('political bot: only a real change is worth a message', (t) => {
  t('the first time it looks, it takes note and stays quiet', () => {
    const seen = {};
    const first = bot.decideAnnouncement({ subject: 'LARP_RULING', ref: 'cycle-8', announced: new Set(), seen });
    notOk(first.send, 'somebody arriving mid-cycle is not told the house "has changed"');
    ok(first.remember, 'but the current period is remembered');
  });

  t('the next cycle does get announced', () => {
    const seen = { LARP_RULING: 'cycle-8' };
    const same = bot.decideAnnouncement({ subject: 'LARP_RULING', ref: 'cycle-8', announced: new Set(), seen });
    notOk(same.send, 'the same period is never announced twice');

    const next = bot.decideAnnouncement({ subject: 'LARP_RULING', ref: 'cycle-9', announced: new Set(), seen });
    ok(next.send, 'a new period is a real change');
  });

  t('somebody who already received announcements keeps receiving them', () => {
    const announced = new Set(['LARP_RULING|cycle-7']);
    const decision = bot.decideAnnouncement({ subject: 'LARP_RULING', ref: 'cycle-8', announced, seen: {} });
    ok(decision.send, 'no silent first run for an instance that already announced before');
  });

  t('what was already sent is not sent again', () => {
    const announced = new Set(['LARP_RULING|cycle-8']);
    const decision = bot.decideAnnouncement({ subject: 'LARP_RULING', ref: 'cycle-8', announced, seen: {} });
    notOk(decision.send, 'the message published in the log is enough');
  });

  t('each subject keeps its own memory', () => {
    const seen = { LARP_RULING: 'cycle-8' };
    const parliament = bot.decideAnnouncement({ subject: 'PARLIAMENT_GOV', ref: 'gov-1', announced: new Set(), seen });
    notOk(parliament.send, 'parliament starts quiet on its own account');
    ok(parliament.remember, 'and remembers its own first sight');
  });

  t('a missing reference decides nothing', () => {
    const decision = bot.decideAnnouncement({ subject: 'LARP_RULING', ref: '', announced: new Set(), seen: {} });
    notOk(decision.send, 'no ref, no message');
    notOk(decision.remember, 'and nothing to remember');
  });
});

describe('political bot: the note it keeps on disk', (t) => {
  t('it survives a round trip and ignores a corrupt file', () => {
    const fs = require('fs');
    ok(bot.writeAnnounceSeen({ LARP_RULING: 'cycle-9' }), 'the state is written');
    eq(bot.readAnnounceSeen().LARP_RULING, 'cycle-9', 'and read back');

    fs.writeFileSync(bot.announceSeenPath(), 'not json at all');
    eq(Object.keys(bot.readAnnounceSeen()).length, 0, 'a corrupt file reads as empty instead of throwing');
    bot.writeAnnounceSeen({});
  });
});
