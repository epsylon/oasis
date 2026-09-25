const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('parliament: propose + vote', (t) => {
  t('A proposes candidature for an inhabitant', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const r = await A.use('parliament').proposeCandidature({ candidateId: B.keypair.id, method: 'DEMOCRACY' });
    ok(r);
    const list = await A.use('parliament').listCandidatures('OPEN');
    ok(Array.isArray(list));
  });

  t('A creates a parliament proposal', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('parliament').createProposal({ title: 'Build park', description: 'in the city center' });
    ok(r);
  });
});

describe('parliament: the hemicycle', (t) => {
  const { hemicycle } = require('../../../src/models/parliament_model');
  const census = Array.from({ length: 61 }, (_, i) => ({ id: `@u${i}`, name: `u${i}` }));
  const cands = [
    { id: 'c1', targetType: 'inhabitant', targetId: '@u1', label: 'Ana', voters: ['@u1', '@u2', '@u3', '@u4', '@u5', '@u6', '@u7', '@u8', '@u9', '@u10', '@u11', '@u12', '@u13'] },
    { id: 'c2', targetType: 'inhabitant', targetId: '@u20', label: 'Bob', voters: ['@u21', '@u22', '@u23', '@u2'] }
  ];

  t('one seat per inhabitant, grouped into government, opposition and abstention', () => {
    const h = hemicycle.build({ census, candidatures: cands, powerType: 'inhabitant', powerId: '@u1', method: 'DEMOCRACY' });
    eq(h.population, 61);
    eq(h.seats.length, 61);
    const counts = Object.fromEntries(h.blocs.map(b => [b.kind, b.count]));
    eq(counts.government, 13, 'twelve voters plus the leader, whose own vote does not count');
    eq(counts.opposition, 3, 'a voter already counted for the government is not counted twice');
    eq(counts.abstention, 45);
    eq(h.blocs.reduce((s, b) => s + b.count, 0), 61, 'the blocs add up to the census');
    ok(h.seats[0].leader && h.seats[0].id === '@u1', 'the leader sits first in the government bloc');
  });

  t('thresholds follow the rules of the current method', () => {
    const dem = hemicycle.build({ census, candidatures: [], method: 'DEMOCRACY' });
    eq(dem.thresholds.quorum, 16, '25% of 61 rounded up');
    eq(dem.thresholds.pass, 31, 'half plus one');
    eq(hemicycle.build({ census, method: 'MAJORITY' }).thresholds.pass, 49);
    eq(hemicycle.build({ census, method: 'MINORITY' }).thresholds.pass, 13);
    eq(hemicycle.build({ census, method: 'DICTATORSHIP' }).thresholds.pass, null);
  });

  t('anarchy is a hemicycle without a government bloc, votes cast still show as opposition', () => {
    const h = hemicycle.build({ census, candidatures: cands, powerType: 'none', powerId: null, method: 'ANARCHY' });
    ok(!h.blocs.some(b => b.kind === 'government'));
    eq(h.blocs.filter(b => b.kind === 'opposition').length, 2);
  });

  t('a tribe in power marks its members and LARP houses colour the seats', () => {
    const h = hemicycle.build({ census, candidatures: [], powerType: 'tribe', powerId: '%t', method: 'DEMOCRACY', powerMembers: ['@u3', '@u4'], houses: { '@u3': 'solaris', '@u5': 'solaris', '@u6': 'dogma' } });
    eq(h.seats.filter(s => s.inPower).length, 2);
    eq(h.houses.solaris, 2);
    eq(h.houses.dogma, 1);
  });

  t('seat positions form a half circle above the base line, one per seat, ordered from left to right', () => {
    const pts = hemicycle.seatPositions(61, { width: 720, height: 380 });
    eq(pts.length, 61);
    ok(pts.every(p => p.y <= 380 - 20 + 0.5), 'no seat below the base line');
    ok(pts[0].x < pts[pts.length - 1].x, 'first seat on the left, last on the right');
    eq(hemicycle.seatPositions(0).length, 0);
    eq(hemicycle.seatPositions(1).length, 1);
  });

  t('the rendered hemicycle has one circle per seat, both threshold marks and a legend', () => {
    const { renderHemicycle } = require('../../../src/views/parliament_view');
    const h = hemicycle.build({ census, candidatures: cands, powerType: 'inhabitant', powerId: '@u1', method: 'DEMOCRACY', houses: { '@u3': 'solaris' } });
    const html = renderHemicycle(h, { mode: 'election', baseHref: '/parliament?filter=government', houseNames: { solaris: 'SOLARIS' } }).outerHTML;
    eq((html.match(/<circle /g) || []).length, 61);
    ok(/hemi-threshold-quorum/.test(html) && /hemi-threshold-pass/.test(html), 'threshold marks present');
    ok(/hemi-legend/.test(html) && /Ana/.test(html) && /Bob/.test(html), 'legend lists the blocs');
    ok(/hemi-leader/.test(html), 'the leader seat is marked');
    const houses = renderHemicycle(h, { mode: 'houses', baseHref: '/parliament?filter=government', houseNames: { solaris: 'SOLARIS' } }).outerHTML;
    ok(/hemi-house-solaris/.test(houses) && /SOLARIS/.test(houses), 'houses mode colours by house');
    ok(!/hemi-threshold-quorum/.test(houses), 'no threshold marks in houses mode');
  });
});

describe('parliament: a tribe elects its government and runs for the global Parliament', (t) => {
  const makeParliament = (peer) => require('../../../src/models/parliament_model')({ cooler: peer.cooler, services: { tribes: peer.use('tribes') } });
  const publishAs = async (peer, content) => { const ssb = await peer.cooler.open(); return new Promise((res, rej) => ssb.publish(content, (e, r) => e ? rej(e) : res(r))); };

  t('members propose and vote, the election resolves when the term ends, and the tribe can be sent to Parliament once per cycle', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const tribe = await A.use('tribes').createTribe('Solar', 'd', null, '', [], false, 'strict', null, 'OPEN', '');
    const tribeId = tribe.key;
    const pA = makeParliament(A);

    const cand = await pA.tribe.publishTribeCandidature({ tribeId, candidateId: B.keypair.id, method: 'DEMOCRACY' });
    ok(cand && cand.key, 'candidature published');
    let threw = null;
    try { await pA.tribe.publishTribeCandidature({ tribeId, candidateId: B.keypair.id, method: 'DEMOCRACY' }); } catch (e) { threw = e.message; }
    ok(/already/.test(String(threw)), 'the same candidate cannot be proposed twice in a cycle');
    await pA.tribe.voteTribeCandidature({ tribeId, candidatureId: cand.key });
    let twice = null;
    try { await makeParliament(A).tribe.voteTribeCandidature({ tribeId, candidatureId: cand.key }); } catch (e) { twice = e.message; }
    ok(/Already voted/.test(String(twice)), 'one vote per member and cycle');

    C.setActor();
    const pC = makeParliament(C);
    const openC = (await pC.tribe.listCandidatures(tribeId)).find(c => c.candidateId === B.keypair.id);
    await pC.tribe.voteTribeCandidature({ tribeId, candidatureId: openC.id });
    B.setActor();
    let self = null;
    try { const pB = makeParliament(B); const mine = (await pB.tribe.listCandidatures(tribeId)).find(c => c.candidateId === B.keypair.id); await pB.tribe.voteTribeCandidature({ tribeId, candidatureId: mine.id }); } catch (e) { self = e.message; }
    ok(/yourself/.test(String(self)), 'a candidate cannot vote for itself');

    A.setActor();
    const counted = (await makeParliament(A).tribe.listCandidatures(tribeId)).find(c => c.candidateId === B.keypair.id);
    eq(Number(counted.votes), 2, 'both votes are counted');

    const now = Date.now();
    await publishAs(A, { type: 'tribeParliamentTerm', tribeId, method: 'ANARCHY', leaderId: null, winnerVotes: 0, totalVotes: 0, startAt: new Date(now - 130 * 86400000).toISOString(), endAt: new Date(now - 70 * 86400000).toISOString(), createdBy: A.keypair.id, createdAt: new Date(now - 130 * 86400000).toISOString() });
    const expiredView = makeParliament(A);
    const latest = await expiredView.tribe.getCurrentTerm(tribeId);
    ok(latest && new Date(latest.endAt).getTime() < now, 'the only term on record has expired');
    await expiredView.tribe.resolveElection(tribeId);
    const term = await makeParliament(A).tribe.getCurrentTerm(tribeId);
    eq(term.leaderId, B.keypair.id, 'the most voted candidate leads the tribe once the term expires');
    eq(String(term.method).toUpperCase(), 'DEMOCRACY');
    eq(Number(term.winnerVotes), 2);
    await makeParliament(A).tribe.resolveElection(tribeId);
    const settled = await makeParliament(A).tribe.getCurrentTerm(tribeId);
    eq(settled.leaderId, B.keypair.id, 'while the new term runs, resolving again keeps the same government');

    const before = await pA.tribe.hasCandidatureInGlobalCycle(tribeId, null);
    notOk(before, 'not yet in the global Parliament');
    await pA.proposeCandidature({ candidateId: tribeId, method: 'DEMOCRACY' });
    const pA3 = makeParliament(A);
    const open = await pA3.listCandidatures('OPEN');
    ok(open.some(c => c.targetType === 'tribe' && c.targetId === tribeId), 'the tribe appears as a global candidature');
    const after = await pA3.tribe.hasCandidatureInGlobalCycle(tribeId, null);
    ok(after, 'and the tribe cannot be sent twice in the same cycle');
  });
});
