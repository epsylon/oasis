const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('stats: counts', (t) => {
  t('member sees their tribes counted in stats', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('tribes').createTribe('T', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const stats = await A.use('stats').getStats('ALL');
    ok(stats.content.tribe >= 1);
  });

  t('non-member sees zero tribes (privacy preserved)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    await A.use('tribes').createTribe('Secret', '', null, '', [], true, 'strict', null, 'OPEN', '');
    B.setActor();
    const stats = await B.use('stats').getStats('ALL');
    eq(stats.content.tribe || 0, 0);
  });

  t('counts other content types', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000000.sha256)', [], 'X', '', '');
    const stats = await A.use('stats').getStats('ALL');
    ok(stats.content.audio >= 1);
  });
});

describe('stats: versions republished by other inhabitants', (t) => {
  const pub = (P, content) => new Promise((res, rej) => P.node.publish(content, (e, m) => e ? rej(e) : res(m)));
  const raw = (net, key) => net.log.find(m => m.key === key).value.content;
  const offer = (A, title) => A.use('jobs').createJob({ title, description: 'd', location: 'remote', job_type: 'freelancer', job_time: 'partial', vacants: 1, salary: '', requirements: '', tags: ['numbat'], status: 'OPEN' });

  t('a chain crossing other authors counts once, with the latest content of its author, and only for its author', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await offer(A, 'Baker');
    const b = await pub(B, { ...raw(net, r.key), replaces: r.key });
    const c = await pub(C, { ...raw(net, b.key), replaces: b.key });
    await pub(A, { ...raw(net, c.key), status: 'CLOSED', replaces: c.key });
    const all = await A.use('stats').getStats('ALL');
    eq(all.content.job, 1);
    eq(all.jobsKPIs.closed, 1);
    eq(all.jobsKPIs.open, 0);
    eq(all.topTags.find(x => x.tag === 'numbat').count, 1);
    eq((await A.use('stats').getStats('MINE')).content.job, 1);
    B.setActor();
    eq((await B.use('stats').getStats('MINE')).content.job || 0, 0);
    C.setActor();
    eq((await C.use('stats').getStats('MINE')).content.job || 0, 0);
  });

  t('a foreign version never changes the counted content', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await offer(A, 'Cook');
    await pub(B, { ...raw(net, r.key), status: 'OPEN', title: 'Cook by B', replaces: r.key });
    await pub(A, { ...raw(net, r.key), status: 'CLOSED', replaces: r.key });
    const all = await A.use('stats').getStats('ALL');
    eq(all.content.job, 1);
    eq(all.jobsKPIs.closed, 1);
    eq(all.jobsKPIs.open, 0);
  });
});
