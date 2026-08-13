const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const publishAs = (peer, content) => new Promise((res, rej) =>
  peer.node.publish(content, (err, msg) => err ? rej(err) : res(msg)));

const cv = (skills) => ({
  type: 'curriculum', name: 'someone', personalSkills: skills,
  oasisSkills: [], educationalSkills: [], professionalSkills: [],
  createdAt: new Date().toISOString()
});

describe('data: suggesting what the network holds for me', (t) => {
  t('a suggestion is scored by how much of it overlaps my profile', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await publishAs(A, cv(['solder', 'weld', 'paint']));
    B.setActor(); await publishAs(B, cv(['solder', 'weld', 'cook']));

    A.setActor();
    const { matches, hasProfile } = await A.use('data').listMatches('INHABITANTS');
    ok(hasProfile, 'the viewer has a profile of their own');
    eq(matches.length, 1, 'the other inhabitant is suggested');
    eq(matches[0].common.sort().join(','), 'solder,weld', 'the shared skills are named');
    ok(matches[0].score > 0.3 && matches[0].score < 0.8, `rarity-weighted coverage of their terms (got ${matches[0].score})`);
  });

  t('without CV nor published content nothing can be suggested, and it says so', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    B.setActor(); await publishAs(B, cv(['solder', 'weld']));
    C.setActor(); await publishAs(C, { type: 'job', title: 'a job', tags: ['solder'], tasks: [], createdAt: new Date().toISOString() });

    A.setActor();
    const { matches, hasProfile } = await A.use('data').listMatches('ALL');
    notOk(hasProfile, 'no profile of my own');
    eq(matches.length, 0, 'so there is nothing to suggest');
  });

  t('my own published content builds my profile even without a CV', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await publishAs(A, { type: 'job', title: 'my workshop', tags: ['carpentry'], tasks: [], createdAt: new Date().toISOString() });
    B.setActor();
    await publishAs(B, { type: 'project', title: 'their project', tags: ['carpentry'], createdAt: new Date().toISOString() });

    A.setActor();
    const { matches, hasProfile } = await A.use('data').listMatches('ALL');
    ok(hasProfile, 'my own tags are my profile');
    eq(matches.length, 1, 'their project is suggested to me');
    eq(matches[0].kind, 'projects', 'and it is the project, not my own job');
    notOk(matches.some(m => String(m.title) === 'my workshop'), 'my own content is never suggested back to me');
  });

  t('module filters list every matching item of that kind', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await publishAs(A, cv(['carpentry', 'design']));
    B.setActor();
    await publishAs(B, { type: 'job', title: 'build a shed', tasks: ['carpentry'], tags: ['wood'], createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'job', title: 'fix a fence', tasks: ['carpentry'], tags: [], createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'project', title: 'a design project', tags: ['design'], createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'event', title: 'unrelated party', tags: ['music'], createdAt: new Date().toISOString() });

    A.setActor();
    const all = await A.use('data').listMatches('ALL');
    const kinds = all.matches.map(m => m.kind).sort();
    ok(kinds.includes('jobs') && kinds.includes('projects'), 'jobs and projects that fit me are suggested');
    ok(!kinds.includes('events'), 'the unrelated party is not');

    const jobsOnly = await A.use('data').listMatches('JOBS');
    eq(jobsOnly.matches.length, 2, 'the JOBS filter lists every job that matches me');
    ok(jobsOnly.matches.every(m => m.kind === 'jobs'), 'and nothing else');
  });

  t('the closest suggestion comes first', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await publishAs(A, cv(['alpha', 'beta', 'gamma']));
    B.setActor();
    await publishAs(B, { type: 'job', title: 'loose', tags: ['alpha'], tasks: [], createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'job', title: 'tight', tags: ['alpha', 'beta', 'gamma'], tasks: [], createdAt: new Date().toISOString() });

    A.setActor();
    const { matches } = await A.use('data').listMatches('ALL');
    eq(matches[0].title, 'tight', 'the closest suggestion leads');
    ok(matches[0].score > matches[matches.length - 1].score, 'and it scores higher than the loosest one');
  });

  t('tribe-scoped and encrypted content stays out of the suggestions', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await publishAs(A, cv(['solder']));
    B.setActor();
    await publishAs(B, { type: 'job', title: 'tribal job', tags: ['solder'], tribeId: '%t.sha256', createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'poll', encryptedQuestion: 'xxx', chatId: '%c.sha256', tags: ['solder'], createdAt: new Date().toISOString() });

    A.setActor();
    const { matches } = await A.use('data').listMatches('ALL');
    eq(matches.length, 0, 'neither the tribe job nor the encrypted poll are suggested');
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
    eq(c.connected, 2, 'two entities share something with someone');
    eq(c.isolated, 1, 'one entity is isolated');
    ok(c.topTerms.length > 0, 'and it reports the most common terms');
  });
});

describe('data: rendering', (t) => {
  t('the suggestions page renders', async () => {
    const { dataView } = require('../../../src/views/data_view');
    const match = {
      id: '%job.sha256', kind: 'jobs', author: '@a.ed25519', title: 'build a shed',
      href: '/jobs/%job.sha256', common: ['carpentry'], score: 0.5,
      createdAt: new Date().toISOString(), ts: Date.now()
    };
    const cohesion = {
      coefficient: 0.42, percent: 42, comparisons: 21, pairs: 3, entities: 7, distinctTerms: 9,
      topTerms: [{ term: 'carpentry', count: 3 }], perKind: { jobs: 2 },
      people: 3, connected: 2, isolated: 1, cvCoefficient: 0.3, cvPercent: 30
    };

    const page = String(await dataView({
      filter: 'ALL', matches: [match], hasProfile: true, cohesion
    }));
    ok(page.includes('build a shed'), 'the suggested content is listed');
    ok(page.includes('/jobs/'), 'and it links to its own module');
    ok(page.includes('/search?query=%23carpentry'), 'a shared term is a way of navigating');
    ok(page.includes('42%'), 'the cohesion coefficient is shown');
    ok(page.includes('data-scale-'), 'the cohesion bar carries a colour step and a width class');
    notOk(page.includes('data-score-bar'), 'the suggestion cards carry no bar, only the figures');
    notOk(page.includes('own-content'), 'nothing here is mine, so nothing is highlighted as mine');
    notOk(page.includes('style="'), 'no inline styles, the CSP would drop them');
    notOk(page.includes('>false<'), 'no falsy value leaked into the html');

    const noProfile = String(await dataView({ filter: 'ALL', matches: [], hasProfile: false, cohesion }));
    ok(noProfile.includes(String(require('../../../src/views/main_views').i18n.dataNoProfile)),
      'without a profile it explains what is missing');

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
