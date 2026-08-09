const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const parliament = require('../../../src/models/parliament_model');
const { termWindowFor, compareTermsForWindow, collapseOverlappingTerms, TERM_DAYS } = parliament;

const SPAN = TERM_DAYS * 86400000;

describe('parliament: the cycle is a calendar, not whoever opens the page first', (t) => {
  t('every instant inside a window resolves to the same window', () => {
    const start = Date.UTC(2026, 6, 28);
    const a = termWindowFor(start);
    const b = termWindowFor(start + 1);
    const c = termWindowFor(start + SPAN - 1);
    eq(a.cycle, b.cycle, 'a millisecond later is the same cycle');
    eq(a.cycle, c.cycle, 'and so is the last millisecond of it');
    eq(a.startAt, c.startAt, 'the window keeps its start');
    eq(a.endAt, c.endAt, 'and its end');
  });

  t('windows are contiguous and the boundary belongs to the next one', () => {
    const first = termWindowFor(Date.UTC(2026, 0, 5));
    const next = termWindowFor(new Date(first.endAt).getTime());
    eq(next.cycle, first.cycle + 1, 'the boundary opens the next cycle');
    eq(next.startAt, first.endAt, 'with no gap between them');
    eq(new Date(next.endAt) - new Date(next.startAt), SPAN, 'and the same length');
  });

  t('two peers computing at different moments of the same window agree', () => {
    const early = termWindowFor(Date.UTC(2026, 6, 28, 3, 0, 0));
    const late = termWindowFor(Date.UTC(2026, 8, 25, 22, 30, 0));
    eq(early.startAt, late.startAt, 'the calendar does not depend on when you looked');
    eq(early.endAt, late.endAt, 'nor on who looked first');
  });

  t('the government in course always sits on the grid', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('parliament').resolveElection();
    const term = await A.use('parliament').getCurrentTerm();
    ok(term, 'there is a government for the window in course');
    const window = termWindowFor(Date.now());
    eq(term.startAt, window.startAt, 'it starts when the calendar says');
    eq(term.endAt, window.endAt, 'and ends when the calendar says');
    eq(term.cycle, window.cycle, 'and records which cycle it is');
  });

  t('nobody writes to the log just for opening Parliament', async () => {
    const net = makeNetwork();
    const peers = [makePeer(net), makePeer(net), makePeer(net), makePeer(net)];

    for (const peer of peers) {
      peer.setActor();
      await peer.use('parliament').resolveElection();
      await peer.use('parliament').getCurrentTerm();
    }

    const last = peers[peers.length - 1];
    last.setActor();
    const published = await last.use('parliament').listTerms('all');
    eq(published.length, 0, 'four inhabitants looked, four inhabitants wrote nothing');
    const term = await last.use('parliament').getCurrentTerm();
    eq(term.method, 'ANARCHY', 'and they all read the same anarchy');
    eq(term.startAt, termWindowFor(Date.now()).startAt, 'for the same window');
  });
});

describe('parliament: which government prevails when two peers elected apart', (t) => {
  const term = (over = {}) => ({
    id: '%a.sha256', method: 'DEMOCRACY', population: 0, totalVotes: 0, winnerVotes: 0,
    startAt: '2026-07-28T00:00:00.000Z', endAt: '2026-09-26T00:00:00.000Z', ...over
  });

  t('a lone inhabitant cannot impose a government where there are more', () => {
    const alone = term({ id: '%alone.sha256', method: 'DICTATORSHIP', population: 1, totalVotes: 1, winnerVotes: 1 });
    const crowd = term({ id: '%crowd.sha256', method: 'ANARCHY', population: 12, totalVotes: 0, winnerVotes: 0 });
    const [winner] = collapseOverlappingTerms([alone, crowd]);
    eq(winner.id, '%crowd.sha256', 'the side with more inhabitants behind it prevails');
  });

  t('with the same population, the election with more participation wins', () => {
    const quiet = term({ id: '%quiet.sha256', population: 10, totalVotes: 2, winnerVotes: 2 });
    const busy = term({ id: '%busy.sha256', population: 10, totalVotes: 9, winnerVotes: 5 });
    const [winner] = collapseOverlappingTerms([quiet, busy]);
    eq(winner.id, '%busy.sha256', 'more votes cast means a better founded result');
  });

  t('with the same turnout, the clearer winner wins', () => {
    const narrow = term({ id: '%narrow.sha256', population: 10, totalVotes: 9, winnerVotes: 4 });
    const clear = term({ id: '%clear.sha256', population: 10, totalVotes: 9, winnerVotes: 7 });
    const [winner] = collapseOverlappingTerms([narrow, clear]);
    eq(winner.id, '%clear.sha256', 'the candidature with more support');
  });

  t('all else equal, a government beats an absence of government', () => {
    const anarchy = term({ id: '%anarchy.sha256', method: 'ANARCHY', population: 5 });
    const elected = term({ id: '%elected.sha256', method: 'DEMOCRACY', population: 5 });
    const [winner] = collapseOverlappingTerms([anarchy, elected]);
    eq(winner.id, '%elected.sha256', 'an elected government says more than none');
  });

  t('a complete tie is broken the same way on every machine', () => {
    const one = term({ id: '%aaa.sha256', population: 5, createdAt: '2030-01-01T00:00:00.000Z' });
    const two = term({ id: '%bbb.sha256', population: 5, createdAt: '2020-01-01T00:00:00.000Z' });

    const straight = collapseOverlappingTerms([one, two])[0].id;
    const reversed = collapseOverlappingTerms([two, one])[0].id;
    eq(straight, reversed, 'the order the messages arrived in does not decide');
    eq(straight, '%aaa.sha256', 'the message identifier does, and it reads the same everywhere');
  });

  t('no clock decides anything', () => {
    const older = term({ id: '%zzz.sha256', population: 5, createdAt: '2000-01-01T00:00:00.000Z' });
    const newer = term({ id: '%aaa.sha256', population: 5, createdAt: '2040-01-01T00:00:00.000Z' });
    eq(collapseOverlappingTerms([older, newer])[0].id, '%aaa.sha256', 'publishing first is not an argument');
    ok(compareTermsForWindow(older, newer) > 0, 'the comparator ignores createdAt entirely');
  });

  t('terms of different cycles are never mixed together', () => {
    const before = term({ id: '%before.sha256', startAt: '2026-05-29T00:00:00.000Z', endAt: '2026-07-28T00:00:00.000Z', population: 3 });
    const now = term({ id: '%now.sha256', population: 1 });
    const kept = collapseOverlappingTerms([before, now]);
    eq(kept.length, 2, 'each window keeps its own government');
    eq(kept[0].id, '%now.sha256', 'the most recent window comes first');
  });
});

describe('parliament: there is always exactly one government in force', (t) => {
  const publish = (peer, content) => new Promise((res, rej) =>
    peer.node.publish(content, (e, m) => e ? rej(e) : res(m)));

  const termFor = (window, over = {}) => ({
    type: 'parliamentTerm',
    cycle: window.cycle,
    method: 'ANARCHY',
    powerType: 'none',
    powerId: null,
    powerTitle: 'ANARCHY',
    winnerTribeId: null,
    winnerInhabitantId: null,
    winnerVotes: 0,
    totalVotes: 0,
    population: 0,
    startAt: window.startAt,
    endAt: window.endAt,
    createdAt: new Date().toISOString(),
    ...over
  });

  t('two peers that elected apart end up under a single government', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const window = termWindowFor(Date.now());

    A.setActor();
    await publish(A, termFor(window, {
      method: 'DICTATORSHIP', powerType: 'inhabitant', powerId: A.keypair.id, powerTitle: 'A',
      population: 1, totalVotes: 1, winnerVotes: 1
    }));

    B.setActor();
    await publish(B, termFor(window, { population: 12 }));

    for (const peer of [A, B]) {
      peer.setActor();
      const active = await peer.use('parliament').listTerms('active');
      eq(active.length, 1, 'exactly one government is in force');
      eq(Number(active[0].population), 12, 'the one backed by more inhabitants');

      const current = await peer.use('parliament').getCurrentTerm();
      eq(current.startAt, window.startAt, 'and it is the one of the running cycle');
      eq(Number(current.population), 12, 'both peers read the same government');
    }
  });

  t('the government that loses stops applying, on both sides', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const window = termWindowFor(Date.now());

    A.setActor();
    await publish(A, termFor(window, {
      method: 'DEMOCRACY', powerType: 'inhabitant', powerId: A.keypair.id, powerTitle: 'A',
      population: 2, totalVotes: 2, winnerVotes: 2
    }));
    B.setActor();
    await publish(B, termFor(window, {
      method: 'MAJORITY', powerType: 'inhabitant', powerId: B.keypair.id, powerTitle: 'B',
      population: 9, totalVotes: 6, winnerVotes: 5
    }));

    A.setActor();
    const card = await A.use('parliament').getLatestGovernmentCard();
    eq(card.method, 'MAJORITY', 'the smaller government no longer governs its own author');
    notOk(card.powerId === A.keypair.id, 'not even for the peer that published it');
  });
});

describe('parliament: an elected government is written down, an empty one is not', (t) => {
  t('a real election does publish, and only once', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net); const D = makePeer(net);

    A.setActor();
    const cand = await A.use('parliament').proposeCandidature({ candidateId: C.keypair.id, method: 'DEMOCRACY' });
    B.setActor();
    await B.use('parliament').voteCandidature(cand.key);
    D.setActor();
    await D.use('parliament').voteCandidature(cand.key);

    A.setActor();
    await A.use('parliament').resolveElection();
    const terms = await A.use('parliament').listTerms('all');
    eq(terms.length, 1, 'the elected government is recorded');
    eq(terms[0].powerId, C.keypair.id, 'with the winner it elected');
    ok(Number(terms[0].population) >= 0, 'and the population that backed it');

    B.setActor();
    await B.use('parliament').resolveElection();
    const afterB = await B.use('parliament').listTerms('all');
    eq(afterB.length, 1, 'a second peer looking does not publish another one');
  });

  t('the candidatures of a past window do not leak into the new one', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const stale = {
      type: 'parliamentCandidature',
      targetType: 'inhabitant', targetId: B.keypair.id, targetTitle: 'B',
      method: 'DEMOCRACY', votes: 0, voters: [], proposer: A.keypair.id, status: 'OPEN',
      createdAt: new Date(Date.now() - 200 * 86400000).toISOString()
    };
    await new Promise((res, rej) => A.node.publish(stale, (e, m) => e ? rej(e) : res(m)));

    const open = await A.use('parliament').listCandidatures('OPEN');
    eq(open.length, 0, 'an old candidature is not open in the window in course');

    await A.use('parliament').resolveElection();
    const terms = await A.use('parliament').listTerms('all');
    eq(terms.length, 0, 'and it does not elect anybody either');
  });
});
