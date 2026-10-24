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

describe('stats: usage and chain growth over time', (t) => {
  const pub = (P, content) => new Promise((res, rej) => P.node.publish(content, (e, m) => e ? rej(e) : res(m)));
  const total = (series, field) => series.points.reduce((acc, pt) => acc + (Number(pt[field]) || 0), 0);

  t('ALL, MINE and TOMBSTONE count their own messages and the growth only ever rises', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    B.setActor();
    await B.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000400.sha256)', [], 'B', '', '');
    A.setActor();
    const mine = await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000401.sha256)', [], 'A', '', '');
    await pub(A, { type: 'tombstone', target: mine.key, deletedAt: new Date().toISOString(), author: A.keypair.id });
    const stats = A.use('stats');
    const all = await stats.chainSeries('ALL', 'all', true);
    const own = await stats.chainSeries('MINE', 'all', true);
    const tomb = await stats.chainSeries('TOMBSTONE', 'all', true);
    eq(total(all.usage, 'count'), net.log.length, 'ALL counts every message of the chain');
    eq(total(own.usage, 'count'), net.log.filter(m => m.value.author === A.keypair.id).length, 'MINE counts only mine');
    eq(total(tomb.usage, 'count'), 1, 'TOMBSTONE counts only tombstones');
    eq(tomb.evolution.points[tomb.evolution.points.length - 1].total, 1, 'the tombstone evolution ends at the number of tombstones');
    eq(all.evolution.points[all.evolution.points.length - 1].total, net.log.length, 'and the whole chain ends at every message');
    for (const s of [all, own, tomb]) {
      const mb = s.growth.points.map(pt => pt.mb);
      ok(mb.every((v, i) => i === 0 || v >= mb[i - 1]), 'the size never goes down');
      ok(mb[mb.length - 1] > 0, 'and ends above zero');
    }
    ok(all.growth.points[all.growth.points.length - 1].mb >= own.growth.points[own.growth.points.length - 1].mb, 'the whole chain weighs at least what mine weighs');
  });
});
