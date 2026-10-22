const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('blockchain (blockexplorer)', (t) => {
  t('member sees decrypted tribe content', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tribes').createTribe('G', '', null, '', [], true, 'strict', null, 'OPEN', '');
    await A.use('tribesContent').create(r.key, 'feed', { description: 'hi' });
    const blocks = await A.use('blockchain').listBlockchain('all', A.keypair.id, {});
    ok(Array.isArray(blocks));
    const ours = blocks.find(b => b.content && b.content.description === 'hi');
    ok(ours);
    eq(ours.content._decrypted, true);
  });

  t('non-member sees no decrypted tribe content', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const r = await A.use('tribes').createTribe('G', '', null, '', [], true, 'strict', null, 'OPEN', '');
    await A.use('tribesContent').create(r.key, 'feed', { description: 'top secret' });
    B.setActor();
    const blocks = await B.use('blockchain').listBlockchain('all', B.keypair.id, {});
    const leaked = blocks.find(b => b.content && b.content.description === 'top secret');
    notOk(leaked);
  });

  t('a private message never shows in the explorer, whoever is looking', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const V = makePeer(net); A.setActor();
    const ssbA = await A.cooler.open();
    const pm = await new Promise((res, rej) => ssbA.publish({ type: 'post', text: 'only for B', recps: [A.keypair.id, B.keypair.id] }, (e, m) => e ? rej(e) : res(m)));
    for (const viewer of [V.keypair.id, A.keypair.id]) {
      const blocks = await A.use('blockchain').listBlockchain('all', viewer, {});
      notOk(blocks.some(b => b.id === pm.key || JSON.stringify(b).includes('only for B')), 'the private message is not listed');
      const one = await A.use('blockchain').getBlockById(pm.key, viewer).catch(() => null);
      notOk(one && JSON.stringify(one).includes('only for B'), 'nor shown when asked for directly');
    }
  });

  t('hidden envelope types do not appear in blockexplorer', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('tribes').createTribe('T', '', null, '', [], true, 'strict', null, 'OPEN', '');
    await A.use('tribes').generateInvite(r.key);
    const blocks = await A.use('blockchain').listBlockchain('all', A.keypair.id, {});
    const inviteMsg = blocks.find(b => b.type === 'tribe-invite-msg');
    notOk(inviteMsg);
  });
});

describe('blockchain: opening a block older than the recent window', (t) => {
  t('a block is found in the whole log, and its deletion too', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const publish = (c) => new Promise((res, rej) => A.node.publish(c, (e, m) => e ? rej(e) : res(m)));
    const configManager = require('../../../src/configs/config-manager.js');
    const before = configManager.getConfig();
    configManager.saveConfig({ ...before, ssbLogStream: { ...(before.ssbLogStream || {}), limit: 2 } });
    try {
      const old = await publish({ type: 'post', text: 'ancient' });
      const gone = await publish({ type: 'post', text: 'ancient too' });
      await publish({ type: 'tombstone', target: gone.key });
      for (let i = 0; i < 4; i++) await publish({ type: 'post', text: `new ${i}` });
      const block = await A.use('blockchain').getBlockById(old.key, A.keypair.id);
      eq(block && block.type, 'post', 'an old block still opens');
      eq(block.isTombstoned, false, 'and is not marked as deleted');
      eq((await A.use('blockchain').getBlockById(gone.key, A.keypair.id)).isTombstoned, true, 'a deleted old block shows as deleted');
      eq(await A.use('blockchain').getBlockById('%' + 'x'.repeat(43) + '=.sha256', A.keypair.id), null, 'what is not in the log is not found');
    } finally { configManager.saveConfig(before); }
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

describe('blockchain: live version of items republished by other inhabitants', (t) => {
  const pub = (P, content) => new Promise((res, rej) => P.node.publish(content, (e, m) => e ? rej(e) : res(m)));
  const raw = (net, key) => net.log.find(m => m.key === key).value.content;

  t('in a chain crossing other authors only the latest version of the author is live', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('bookmarks').createBookmark('https://chain.test/x', [], 'first', '');
    const b = await pub(B, { ...raw(net, r.key), replaces: r.key });
    const c = await pub(C, { ...raw(net, b.key), replaces: b.key });
    const a2 = await pub(A, { ...raw(net, c.key), description: 'second', replaces: c.key });
    const blocks = await A.use('blockchain').listBlockchain('all', A.keypair.id, {});
    const flag = (key) => blocks.find(x => x.id === key).isReplaced;
    eq(flag(r.key), true);
    eq(flag(b.key), true);
    eq(flag(c.key), true);
    eq(flag(a2.key), false);
    eq((await A.use('blockchain').getBlockById(a2.key, A.keypair.id)).isReplaced, false);
    eq((await A.use('blockchain').getBlockById(c.key, A.keypair.id)).isReplaced, true);
  });

  t('a foreign copy never makes the original look replaced nor becomes live', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('bookmarks').createBookmark('https://chain.test/y', [], 'first', '');
    const b = await pub(B, { ...raw(net, r.key), description: 'by B', replaces: r.key });
    const orphan = await pub(B, { ...raw(net, r.key), replaces: '%missing00000000000000000000000000000000000.sha256' });
    const blocks = await A.use('blockchain').listBlockchain('all', A.keypair.id, {});
    const flag = (key) => blocks.find(x => x.id === key).isReplaced;
    eq(flag(r.key), false);
    eq(flag(b.key), true);
    eq(flag(orphan.key), true);
    eq((await A.use('blockchain').getBlockById(r.key, A.keypair.id)).isReplaced, false);
  });
});

describe('blockchain: searching by author', (t) => {
  t('an id or a name finds only that inhabitant\'s blocks', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const publishAs = async (P, content) => { const ssb = await P.cooler.open(); return new Promise((res, rej) => ssb.publish(content, (e, m) => e ? rej(e) : res(m))); };
    await publishAs(A, { type: 'about', about: A.keypair.id, name: 'Marina' });
    await publishAs(A, { type: 'post', text: 'from A' });
    await publishAs(B, { type: 'post', text: 'from B' });
    A.setActor();
    const byId = await A.use('blockchain').listBlockchain('all', A.keypair.id, { author: A.keypair.id });
    ok(byId.length > 0 && byId.every(b => b.author === A.keypair.id));
    const byName = await A.use('blockchain').listBlockchain('all', A.keypair.id, { author: 'marina' });
    ok(byName.length > 0 && byName.every(b => b.author === A.keypair.id));
  });
});
