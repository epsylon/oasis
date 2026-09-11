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
    ok(kinds.includes('events'), 'even the unrelated party is listed');
    ok(all.matches[0].title !== 'unrelated party', 'but it is not the best match');
    const party = all.matches.find(m => m.title === 'unrelated party');
    ok(all.matches.every(m => m.score >= party.score), 'and it carries the lowest coefficient');
    ok(all.matches.every(m => m.score > 0), 'and no suggestion scores zero');

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

describe('data: what the network knows about me shapes the ranking', (t) => {
  t('content from someone I follow ranks above the same content from a stranger', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor(); await publishAs(A, cv(['solder']));
    await publishAs(A, { type: 'contact', contact: B.keypair.id, following: true });
    B.setActor(); await publishAs(B, { type: 'job', title: 'friend job', tags: ['solder'], tasks: [], createdAt: new Date().toISOString() });
    C.setActor(); await publishAs(C, { type: 'job', title: 'stranger job', tags: ['solder'], tasks: [], createdAt: new Date().toISOString() });

    A.setActor();
    const { matches } = await A.use('data').listMatches('JOBS');
    eq(matches.length, 2, 'both jobs are suggested');
    eq(matches[0].author, B.keypair.id, 'the followed author leads');
    ok(matches[0].score - matches[1].score >= 0.05, 'with a visible social boost');
    ok(matches[0].reasons.includes('following'), 'and the card can say why');
  });

  t('pinning content teaches the algorithm what I like', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor(); await publishAs(A, cv(['alpha']));
    B.setActor();
    const pinned = await publishAs(B, { type: 'project', title: 'pinned project', tags: ['beta'], createdAt: new Date().toISOString() });
    C.setActor(); await publishAs(C, { type: 'job', title: 'beta job', tags: ['beta'], tasks: [], createdAt: new Date().toISOString() });

    A.setActor();
    const plain = await A.use('data').listMatches('JOBS');
    const withPins = await require('../../../src/models/data_model')({
      cooler: A.cooler,
      favoriteIdsFor: async (kind) => (kind === 'projects' ? new Set([pinned.key]) : new Set())
    }).listMatches('JOBS');
    eq(withPins.matches.length, 1, 'the beta job is listed');
    ok(withPins.matches[0].common.includes('beta'), 'the pinned tag became part of my profile');
    ok(withPins.matches[0].score > plain.matches[0].score, 'so the beta job now scores higher');
    ok(withPins.matches[0].reasons.includes('pinned'), 'and the pin is given as the reason');
  });

  t('the mixed list does not let one kind crowd out the others', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await publishAs(A, cv(['alpha']));
    B.setActor();
    for (let i = 0; i < 3; i++) await publishAs(B, { type: 'job', title: `job ${i}`, tags: ['alpha'], tasks: [], createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'project', title: 'the project', tags: ['alpha'], createdAt: new Date().toISOString() });

    A.setActor();
    const { matches } = await A.use('data').listMatches('ALL');
    eq(matches.length, 4, 'everything is listed');
    eq(new Set(matches.slice(0, 2).map(m => m.kind)).size, 2, 'the first two entries are of different kinds');
  });
});

describe('data: the card can say why', (t) => {
  t('support in both directions is told apart', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor(); await publishAs(A, cv(['solder']));
    await publishAs(A, { type: 'contact', contact: B.keypair.id, following: true });
    B.setActor(); await publishAs(B, { type: 'contact', contact: A.keypair.id, following: true });
    await publishAs(B, { type: 'job', title: 'mutual job', tags: ['solder'], tasks: [], createdAt: new Date().toISOString() });
    C.setActor(); await publishAs(C, { type: 'contact', contact: A.keypair.id, following: true });
    await publishAs(C, { type: 'job', title: 'fan job', tags: ['solder'], tasks: [], createdAt: new Date().toISOString() });

    A.setActor();
    const { matches } = await A.use('data').listMatches('JOBS');
    const mutual = matches.find(m => m.title === 'mutual job');
    const fan = matches.find(m => m.title === 'fan job');
    ok(mutual.reasons.includes('mutual') && !mutual.reasons.includes('following'), 'mutual support is one chip, not two');
    ok(fan.reasons.includes('supportsYou'), 'someone who supports me without me supporting back is told so');
  });

  t('the origin of the overlap is named: CV skills, own content, or only related terms', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await publishAs(A, cv(['solder']));
    await publishAs(A, { type: 'job', title: 'my own', tags: ['weld'], tasks: [], createdAt: new Date().toISOString() });
    B.setActor();
    await publishAs(B, { type: 'job', title: 'cv match', tags: ['solder'], tasks: [], createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'job', title: 'content match', tags: ['weld'], tasks: [], createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'job', title: 'bridge', tags: ['solder', 'lathe'], tasks: [], createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'job', title: 'only related', tags: ['lathe'], tasks: [], createdAt: new Date().toISOString() });

    A.setActor();
    const { matches } = await A.use('data').listMatches('JOBS');
    const by = (title) => matches.find(m => m.title === title);
    ok(by('cv match').reasons.includes('cv'), 'a CV skill match says so');
    ok(by('content match').reasons.includes('content'), 'a match with my own content says so');
    ok(by('only related').reasons.includes('related') && !by('only related').common.length, 'a purely indirect match is explained as related');
  });

  t('well rated content and content near me are flagged', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await publishAs(A, { ...cv(['solder']), location: 'Bilbao' });
    B.setActor();
    await publishAs(B, { type: 'job', title: 'popular here', tags: ['solder'], tasks: [], location: 'bilbao', opinions: { interesting: 2, inspiring: 1 }, createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'job', title: 'quiet and far', tags: ['solder'], tasks: [], location: 'Oslo', createdAt: new Date().toISOString() });

    A.setActor();
    const { matches } = await A.use('data').listMatches('JOBS');
    const popular = matches.find(m => m.title === 'popular here');
    const quiet = matches.find(m => m.title === 'quiet and far');
    ok(popular.reasons.includes('rated') && popular.reasons.includes('near'), 'three opinions and a matching location earn both chips');
    ok(!quiet.reasons.includes('rated') && !quiet.reasons.includes('near'), 'the other job earns neither');
  });
});

describe('data: reasons double as filters', (t) => {
  t('only the reasons present are offered, and picking one narrows the list', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor(); await publishAs(A, cv(['solder']));
    await publishAs(A, { type: 'contact', contact: B.keypair.id, following: true });
    B.setActor(); await publishAs(B, { type: 'job', title: 'friend job', tags: ['solder'], tasks: [], createdAt: new Date().toISOString() });
    C.setActor(); await publishAs(C, { type: 'job', title: 'stranger job', tags: ['solder'], tasks: [], createdAt: new Date().toISOString() });

    A.setActor();
    const all = await A.use('data').listMatches('JOBS');
    ok(all.reasonsAvail.includes('following') && all.reasonsAvail.includes('cv'), 'the reasons found are offered');
    ok(!all.reasonsAvail.includes('rated') && !all.reasonsAvail.includes('near'), 'reasons nobody earned are not');
    eq(all.reason, '', 'nothing selected by default');

    const narrowed = await A.use('data').listMatches('JOBS', { reason: 'following' });
    eq(narrowed.matches.length, 1, 'the reason filter keeps only the matching cards');
    eq(narrowed.matches[0].title, 'friend job');
    eq(narrowed.reason, 'following', 'and reports the active reason');
    eq(narrowed.reasonsAvail.length, all.reasonsAvail.length, 'while the offered reasons stay those of the whole list');
  });
});

describe('data: privacy and versions', (t) => {
  t('content the viewer cannot see is never suggested', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor(); await publishAs(A, cv(['solder']));
    C.setActor(); await publishAs(C, cv(['solder']));
    B.setActor();
    const now = new Date().toISOString();
    await publishAs(B, { type: 'task', title: 'secret task', isPublic: 'PRIVATE', tags: ['solder'], assignees: [C.keypair.id], createdAt: now });
    await publishAs(B, { type: 'job', title: 'hidden job', visibility: 'HIDDEN', tags: ['solder'], tasks: [], createdAt: now });
    await publishAs(B, { type: 'schoolCourse', title: 'closed course', visibility: 'INVITE', tags: ['solder'], createdAt: now });
    await publishAs(B, { type: 'tribe', title: 'secret tribe', tags: ['solder'], members: [B.keypair.id], createdAt: now });
    await publishAs(B, { type: 'job', title: 'open job', tags: ['solder'], tasks: [], createdAt: now });

    A.setActor();
    const titles = (await A.use('data').listMatches('ALL')).matches.map(m => m.title);
    ok(titles.includes('open job'), 'public content is suggested');
    for (const hidden of ['secret task', 'hidden job', 'closed course', 'secret tribe']) {
      ok(!titles.includes(hidden), `${hidden} stays out for a stranger`);
    }

    C.setActor();
    const forC = (await C.use('data').listMatches('ALL')).matches.map(m => m.title);
    ok(forC.includes('secret task'), 'but the assignee of the private task does see it');
  });

  t('an updated item is suggested once, under its root id and latest title', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await publishAs(A, cv(['solder']));
    B.setActor();
    const first = await publishAs(B, { type: 'task', title: 'first title', tags: ['solder'], createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'task', title: 'second title', tags: ['solder'], replaces: first.key, createdAt: new Date().toISOString() });
    await publishAs(B, { type: 'task', title: 'third title', tags: ['solder'], replaces: first.key, createdAt: new Date().toISOString() });

    A.setActor();
    const { matches } = await A.use('data').listMatches('TASKS');
    eq(matches.length, 1, 'one card for the whole edit chain');
    eq(matches[0].title, 'third title', 'showing the latest version');
    eq(matches[0].id, first.key, 'identified by its root');
    ok(matches[0].href.includes(encodeURIComponent(first.key)), 'and linking to the root');
  });
});

describe('data: rendering', (t) => {
  t('reason chips render as filters and mark the active one', async () => {
    const { dataView } = require('../../../src/views/data_view');
    const match = { id: '%j.sha256', kind: 'jobs', author: '@a.ed25519', title: 'a job', href: '/jobs/%j.sha256', common: ['solder'], score: 0.5, createdAt: new Date().toISOString(), ts: Date.now(), reasons: ['following', 'cv'] };
    const html = String(await dataView({ hasProfile: true, matches: [match], reasonsAvail: ['following', 'cv'], reason: 'cv' }));
    ok(html.includes('name="reason" value="following"') && html.includes('name="reason" value="cv"'), 'one chip per offered reason');
    ok(!html.includes('name="reason" value="near"'), 'no chip for reasons not offered');
    ok(/value="cv"[^>]*>\s*<button[^>]*filter-btn active/.test(html), 'the active reason is highlighted');
    ok(!html.includes('href="#data-jobs"'), 'with a reason active the type shortcuts are hidden');
  });

  t('ALL lists one section per kind, each led by its best match, with shortcuts to jump to them', async () => {
    const { dataView } = require('../../../src/views/data_view');
    const mk = (kind, title, score) => ({ id: `%${title}.sha256`, kind, author: '@a.ed25519', title, href: `/${kind}/x`, common: [], score, createdAt: new Date().toISOString(), ts: Date.now(), reasons: [] });
    const html = String(await dataView({ hasProfile: true, reasonsAvail: [], reason: '', matches: [mk('jobs', 'job low', 0.2), mk('projects', 'project top', 0.9), mk('jobs', 'job high', 0.6)] }));
    ok(html.includes('href="#data-jobs"') && html.includes('href="#data-projects"'), 'a shortcut per kind present');
    ok(html.includes('id="data-jobs"') && html.includes('id="data-projects"'), 'and a section per kind');
    ok(html.indexOf('id="data-projects"') < html.indexOf('id="data-jobs"'), 'sections ordered by their best match');
    ok(html.indexOf('project top') < html.indexOf('id="data-projects"'), 'the best of the best is shown on top');
    ok((html.match(/data-best-card/g) || []).length === 3, 'one best match per section plus the global one');
  });

  t('long titles are shortened on the card', async () => {
    const { dataView } = require('../../../src/views/data_view');
    const longTitle = 'Once upon a time '.repeat(30).trim();
    const html = String(await dataView({ filter: 'ALL', hasProfile: true, matches: [{
      id: '%chat.sha256', kind: 'chats', author: '@a.ed25519', title: longTitle,
      href: '/chats/%chat.sha256', common: [], score: 0.01, createdAt: new Date().toISOString(), ts: Date.now(), reasons: ['following']
    }] }));
    ok(html.includes('data-reason-chip'), 'the reason chip is rendered');
    ok(!html.includes(longTitle), 'the full title is not rendered');
    ok(html.includes('Once upon a time') && html.includes('…'), 'a shortened title with an ellipsis is');
  });

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
