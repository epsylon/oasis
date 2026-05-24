const { eq, ok, notOk } = require('../../helpers/assert');
const { buildValidatedTombstoneSet } = require('../../../src/models/tombstone_validator');

describe('tombstone validation: author check', (t) => {
  t('honors a tombstone whose author matches the target author', () => {
    const messages = [
      { key: '%alice-event.sha256', value: { author: '@alice.ed25519', timestamp: 1, content: { type: 'event', title: 'A' } } },
      { key: '%alice-tomb.sha256',  value: { author: '@alice.ed25519', timestamp: 2, content: { type: 'tombstone', target: '%alice-event.sha256' } } }
    ];
    const tomb = buildValidatedTombstoneSet(messages);
    eq(tomb.size, 1);
    ok(tomb.has('%alice-event.sha256'));
  });

  t('ignores a tombstone whose author does NOT match the target author (Eve forgery)', () => {
    const messages = [
      { key: '%alice-event.sha256', value: { author: '@alice.ed25519', timestamp: 1, content: { type: 'event', title: 'A' } } },
      { key: '%eve-fake-tomb.sha256', value: { author: '@eve.ed25519', timestamp: 2, content: { type: 'tombstone', target: '%alice-event.sha256' } } }
    ];
    const tomb = buildValidatedTombstoneSet(messages);
    eq(tomb.size, 0, 'Eve\'s forged tombstone targeting Alice\'s event must be ignored');
  });

  t('latest tombstone wins when same author rebroadcasts', () => {
    const messages = [
      { key: '%post.sha256', value: { author: '@a.ed25519', timestamp: 1, content: { type: 'post', text: 'hi' } } },
      { key: '%t1.sha256',  value: { author: '@a.ed25519', timestamp: 2, content: { type: 'tombstone', target: '%post.sha256' } } },
      { key: '%t2.sha256',  value: { author: '@eve.ed25519', timestamp: 3, content: { type: 'tombstone', target: '%post.sha256' } } }
    ];
    const tomb = buildValidatedTombstoneSet(messages);
    notOk(tomb.has('%post.sha256'), 'Eve\'s later tombstone replaces in the claim map but is rejected at validation');
  });

  t('encrypted-tribe tombstone only honored when target was in the same tribe', () => {
    const messages = [
      { key: '%alice-public-msg.sha256', value: { author: '@alice.ed25519', timestamp: 1, content: { type: 'event', title: 'Public' } } },
      { key: '%tribe-msg.sha256', value: { author: '@bob.ed25519', timestamp: 2, content: { type: 'event', title: 'In tribe', _rootId: '%tribe.sha256' } } },
      { key: '%t-cross.sha256', value: { author: '@bob.ed25519', timestamp: 3, content: { type: 'tombstone', target: '%alice-public-msg.sha256', _rootId: '%tribe.sha256' } } },
      { key: '%t-same.sha256',  value: { author: '@bob.ed25519', timestamp: 4, content: { type: 'tombstone', target: '%tribe-msg.sha256',         _rootId: '%tribe.sha256' } } }
    ];
    const tomb = buildValidatedTombstoneSet(messages);
    notOk(tomb.has('%alice-public-msg.sha256'), 'tribe-flattened tombstone must not suppress unrelated public message');
    ok(tomb.has('%tribe-msg.sha256'), 'tribe-flattened tombstone honored when target lives in the same tribe');
  });

  t('returns empty set on malformed input', () => {
    eq(buildValidatedTombstoneSet(null).size, 0);
    eq(buildValidatedTombstoneSet(undefined).size, 0);
    eq(buildValidatedTombstoneSet([]).size, 0);
    eq(buildValidatedTombstoneSet([{ value: null }]).size, 0);
  });
});
