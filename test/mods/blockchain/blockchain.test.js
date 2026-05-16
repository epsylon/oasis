const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('blockchain (blockexplorer)', (t) => {
  t('member sees decrypted tribe content', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tribes').createTribe('G', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    await A.use('tribesContent').create(r.key, 'feed', { description: 'hi' });
    const blocks = await A.use('blockchain').listBlockchain('all', A.keypair.id, {});
    ok(Array.isArray(blocks));
    const ours = blocks.find(b => b.content && b.content.description === 'hi');
    ok(ours);
    eq(ours.content._decrypted, true);
  });

  t('non-member sees no decrypted tribe content', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const r = await A.use('tribes').createTribe('G', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    await A.use('tribesContent').create(r.key, 'feed', { description: 'top secret' });
    B.setActor();
    const blocks = await B.use('blockchain').listBlockchain('all', B.keypair.id, {});
    const leaked = blocks.find(b => b.content && b.content.description === 'top secret');
    notOk(leaked);
  });

  t('hidden envelope types do not appear in blockexplorer', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tribes').createTribe('T', '', null, '', [], false, true, 'strict', null, 'OPEN', '');
    await A.use('tribes').generateInvite(r.key);
    const blocks = await A.use('blockchain').listBlockchain('all', A.keypair.id, {});
    const inviteMsg = blocks.find(b => b.type === 'tribe-invite-msg');
    notOk(inviteMsg);
  });
});

describe('blockchain: computeStats (explorer stats panel)', (t) => {
  const { computeStats } = require('../../../src/views/blockchain_view');

  t('empty input returns zero totals', () => {
    const s = computeStats([]);
    eq(s.total, 0);
    eq(s.typeBreakdown.length, 0);
    eq(s.topAuthors.length, 0);
  });

  t('counts by type and sorts descending', () => {
    const blocks = [
      { type: 'forum', author: '@a' },
      { type: 'forum', author: '@b' },
      { type: 'forum', author: '@a' },
      { type: 'post',  author: '@a' },
      { type: 'vote',  author: '@c' }
    ];
    const s = computeStats(blocks);
    eq(s.total, 5);
    eq(s.typeBreakdown[0].type, 'forum');
    eq(s.typeBreakdown[0].count, 3);
    eq(s.typeBreakdown[1].count, 1);
  });

  t('topAuthors caps at 5 and ranks correctly', () => {
    const blocks = [];
    for (let i = 0; i < 10; i++) blocks.push({ type: 'post', author: '@a' });
    for (let i = 0; i < 5; i++)  blocks.push({ type: 'post', author: '@b' });
    for (let i = 0; i < 3; i++)  blocks.push({ type: 'post', author: '@c' });
    blocks.push({ type: 'post', author: '@d' });
    blocks.push({ type: 'post', author: '@e' });
    blocks.push({ type: 'post', author: '@f' });
    const s = computeStats(blocks);
    eq(s.topAuthors.length, 5);
    eq(s.topAuthors[0].author, '@a');
    eq(s.topAuthors[0].count, 10);
    eq(s.topAuthors[1].author, '@b');
    eq(s.topAuthors[2].author, '@c');
    notOk(s.topAuthors.find(a => a.author === '@f'), 'overflow author excluded');
  });

  t('ignores entries with missing type', () => {
    const blocks = [
      { type: 'post', author: '@a' },
      { author: '@a' },
      { type: null, author: '@a' }
    ];
    const s = computeStats(blocks);
    eq(s.typeBreakdown.length, 1);
    eq(s.typeBreakdown[0].count, 1);
  });

  t('ignores entries with missing author for topAuthors', () => {
    const blocks = [
      { type: 'post' },
      { type: 'post', author: '@a' }
    ];
    const s = computeStats(blocks);
    eq(s.topAuthors.length, 1);
    eq(s.topAuthors[0].author, '@a');
  });
});
