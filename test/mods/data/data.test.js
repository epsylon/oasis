const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const publishAs = (peer, content) => new Promise((res, rej) =>
  peer.node.publish(content, (err, msg) => err ? rej(err) : res(msg)));

const cv = (skills) => ({
  type: 'curriculum', name: 'someone', personalSkills: skills,
  oasisSkills: [], educationalSkills: [], professionalSkills: [],
  createdAt: new Date().toISOString()
});

describe('data: crossing what the network already knows', (t) => {
  t('a pair is scored by what the two sides share', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await publishAs(A, cv(['solder', 'weld', 'paint']));
    B.setActor(); await publishAs(B, cv(['solder', 'weld', 'cook']));

    A.setActor();
    const { matches, hasProfile } = await A.use('data').listMatches('INHABITANTS');
    ok(hasProfile, 'the viewer has a profile of their own');
    eq(matches.length, 1, 'one pair of inhabitants');
    eq(matches[0].common.sort().join(','), 'solder,weld', 'the shared skills are named');
    ok(matches[0].score > 0.25 && matches[0].score < 0.6, `rarity-weighted share of 2 of 4 terms (got ${matches[0].score})`);
    ok(matches[0].involvesMe, 'and the viewer is one of the two sides');
  });

  t('a single profile has nothing to be paired with', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await publishAs(A, cv(['solder']));
    const { matches } = await A.use('data').listMatches('INHABITANTS');
    eq(matches.length, 0, 'no pair can be formed');
  });

  t('jobs, projects and events are crossed with my skills too', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await publishAs(A, cv(['carpentry', 'design']));
    B.setActor();
    await publishAs(B, { type: 'job', title: 'build a shed', tasks: ['carpentry'], tags: ['wood'], createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'project', title: 'a design project', tags: ['design'], createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'event', title: 'unrelated party', tags: ['music'], createdAt: new Date().toISOString() });

    A.setActor();
    const all = await A.use('data').listMatches('ALL');
    const kinds = all.matches.map(m => [m.a.kind, m.b.kind].sort().join('+')).sort();
    ok(kinds.includes('inhabitants+jobs'), 'my curriculum is paired with the job');
    ok(kinds.includes('inhabitants+projects'), 'and with the project');
    ok(!kinds.includes('events+inhabitants'), 'the unrelated party is paired with nobody');

    const jobsOnly = await A.use('data').listMatches('JOBS');
    ok(jobsOnly.matches.length >= 1, 'filtering by kind narrows it');
    ok(jobsOnly.matches.every(m => m.a.kind === 'jobs' || m.b.kind === 'jobs'), 'every pair has a job on one side');
  });

  t('TOP puts the closest match first', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await publishAs(A, cv(['a', 'b', 'c']));
    B.setActor();
    await publishAs(B, { type: 'job', title: 'far', tags: ['a'], tasks: [], createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'job', title: 'near', tags: ['a', 'b', 'c'], tasks: [], createdAt: new Date().toISOString() });

    A.setActor();
    const { matches } = await A.use('data').listMatches('ALL');
    const titles = matches.map(m => [m.a.title, m.b.title].filter(t => t !== 'someone'));
    eq(titles[0][0], 'near', 'the closest pair leads');
    ok(matches[0].score > matches[matches.length - 1].score, 'and it scores higher than the loosest one');
  });

  t('without a CV the network cross-data is still there to explore', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    B.setActor(); await publishAs(B, cv(['solder', 'weld']));
    C.setActor(); await publishAs(C, { type: 'job', title: 'a job', tags: ['solder'], tasks: [], createdAt: new Date().toISOString() });

    A.setActor();
    const { matches, hasProfile } = await A.use('data').listMatches('ALL');
    notOk(hasProfile, 'no profile of my own');
    eq(matches.length, 1, 'but the network pair is still shown');
    notOk(matches[0].involvesMe, 'it is other people cross-data');
  });

  t('tribe-scoped and encrypted content stays out of the cross-data', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await publishAs(A, cv(['solder']));
    B.setActor();
    await publishAs(B, { type: 'job', title: 'tribal job', tags: ['solder'], tribeId: '%t.sha256', createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'poll', encryptedQuestion: 'xxx', chatId: '%c.sha256', tags: ['solder'], createdAt: new Date().toISOString() });

    A.setActor();
    const { matches } = await A.use('data').listMatches('ALL');
    eq(matches.length, 0, 'neither the tribe job nor the encrypted poll are crossed');
  });

  t('the cohesion coefficient measures how much the network has in common', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor(); await publishAs(A, cv(['a', 'b']));
    B.setActor(); await publishAs(B, cv(['a', 'b']));
    C.setActor(); await publishAs(C, cv(['x', 'y']));

    A.setActor();
    const c = await A.use('data').cohesion();
    eq(c.entities, 3, 'three entities compared');
    eq(c.comparisons, 3, 'three comparisons');
    eq(c.pairs, 1, 'only one of them is a connected pair');
    ok(c.coefficient > 0.3 && c.coefficient < 0.4, `two identical of three pairs (got ${c.coefficient})`);
    eq(c.people, 3, 'three profiles');
    eq(c.connected, 2, 'two people share something with someone');
    eq(c.isolated, 1, 'one is isolated');
    ok(c.topTerms.length > 0, 'and it reports the most common terms');
  });

});

describe('data: rendering', (t) => {
  t('the cross-data page renders', async () => {
    const { dataView } = require('../../../src/views/data_view');
    const side = (kind, id, title, href) => ({ id, kind, author: '@a.ed25519', title, href, createdAt: new Date().toISOString(), ts: Date.now() });
    const match = {
      id: '%job.sha256|%cv.sha256',
      a: side('jobs', '%job.sha256', 'build a shed', '/jobs/%job.sha256'),
      b: side('inhabitants', '%cv.sha256', 'Ada', '/author/@a.ed25519'),
      common: ['carpentry'], score: 0.5, connections: 3,
      createdAt: new Date().toISOString(), ts: Date.now(), involvesMe: false
    };
    const cohesion = {
      coefficient: 0.42, percent: 42, comparisons: 21, pairs: 3, entities: 7, distinctTerms: 9,
      topTerms: [{ term: 'carpentry', count: 3 }], perKind: { jobs: 2 },
      people: 3, connected: 2, isolated: 1, cvCoefficient: 0.3, cvPercent: 30
    };

    const page = String(await dataView({
      filter: 'ALL', matches: [match], hasProfile: true, cohesion
    }));
    ok(page.includes('build a shed') && page.includes('Ada'), 'both sides of the pair are listed');
    ok(page.includes('/jobs/') && page.includes('/author/'), 'and each side links to its own module');
    ok(page.includes('/search?query=%23carpentry'), 'a shared term is a way of navigating');
    ok(page.includes('42%'), 'the cohesion coefficient is shown');
    ok(page.includes('data-scale-'), 'the cohesion bar carries a colour step and a width class');
    notOk(page.includes('data-score-bar'), 'the match cards carry no bar, only the figures');
    notOk(page.includes('own-content'), 'no card is highlighted as mine, everything here is the network');
    ok(page.includes(String(require('../../../src/views/main_views').i18n.dataTermsTitle)),
      'the shared terms have their own heading');
    notOk(page.includes('style="'), 'no inline styles, the CSP would drop them');
    notOk(page.includes('>false<'), 'no falsy value leaked into the html');

    const noProfile = String(await dataView({ filter: 'MINE', matches: [], hasProfile: false, cohesion }));
    ok(noProfile.includes(String(require('../../../src/views/main_views').i18n.dataNoProfile)),
      'asking for my own matches without a curriculum explains what is missing');

    const few = String(await dataView({
      filter: 'ALL', matches: [], hasProfile: true,
      cohesion: { ...cohesion, entities: 1, comparisons: 0, percent: 0, people: 1, connected: 0, isolated: 1 }
    }));
    const i18n = require('../../../src/views/main_views').i18n;
    notOk(few.includes('42%'), 'with a single entity no meaningless percentage is shown');
    ok(few.includes(String(i18n.dataStatEntities)), 'but the entity and term counts are still there');
    ok(page.includes(String(i18n.dataMatchesTitle)), 'the list below says what it is');
  });
});

describe('data: whose matches are worth showing', (t) => {
  const { makeNetwork, makePeer } = require('../../helpers/setup');
  const publish = (peer, content) => new Promise((res, rej) =>
    peer.node.publish(content, (e, m) => e ? rej(e) : res(m)));

  t('two things of my own do not match each other, unless I ask for MINE', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await publish(A, { type: 'job', title: 'my first job', tags: ['carpentry'], tasks: [], createdAt: new Date().toISOString() });
    await publish(A, { type: 'job', title: 'my second job', tags: ['carpentry'], tasks: [], createdAt: new Date().toISOString() });
    B.setActor();
    await publish(B, { type: 'project', title: 'their project', tags: ['carpentry'], createdAt: new Date().toISOString() });

    A.setActor();
    const all = await A.use('data').listMatches('ALL');
    ok(all.matches.length > 0, 'there are matches');
    notOk(all.matches.some(m => m.sameAuthor), 'none of them pairs an author with itself');

    const mine = await A.use('data').listMatches('MINE');
    ok(mine.matches.some(m => m.sameAuthor), 'but MINE still relates my own content to itself');
    ok(mine.matches.every(m => m.involvesMe), 'and every one of them involves me');
  });
});
