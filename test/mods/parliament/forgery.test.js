const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const { termWindowFor, TERM_DAYS } = require('../../../src/models/parliament_model');

const SPAN = TERM_DAYS * 86400000;
const publish = (peer, content) => new Promise((res, rej) => peer.node.publish(content, (e, m) => e ? rej(e) : res(m)));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const signedBy = (net, peer, type) => net.log.filter(m => m.value.author === peer.keypair.id && m.value.content && m.value.content.type === type);

const candidature = async (proposer, leader, method, voters, window) => {
  const createdAt = new Date(Math.min(Date.now(), new Date(window.startAt).getTime() + 3600000)).toISOString();
  const cand = await publish(proposer, {
    type: 'parliamentCandidature', targetType: 'inhabitant', targetId: leader.keypair.id, targetTitle: 'L',
    method, votes: 0, voters: [], proposer: proposer.keypair.id, status: 'OPEN', createdAt
  });
  for (const v of voters) await publish(v, { type: 'parliamentCandidatureVote', target: cand.key, createdAt: new Date().toISOString() });
  return cand;
};

const govern = async (proposer, leader, method, voters, window) => {
  await candidature(proposer, leader, method, voters, window);
  const term = await publish(proposer, {
    type: 'parliamentTerm', cycle: window.cycle, method, powerType: 'inhabitant', powerId: leader.keypair.id, powerTitle: 'L',
    winnerVotes: voters.length, totalVotes: voters.length, population: 0, startAt: window.startAt, endAt: window.endAt,
    createdBy: proposer.keypair.id, createdAt: window.startAt
  });
  return term.key;
};

const ballotBox = async (owner, termId, voters, choices) => {
  const vote = await publish(owner, {
    type: 'votes', question: 'Q', options: ['YES', 'NO', 'ABSTENTION'], deadline: new Date(Date.now() + 300).toISOString(),
    createdBy: owner.keypair.id, status: 'OPEN', votes: { YES: 0, NO: 0, ABSTENTION: 0 }, totalVotes: 0, voters: [],
    tags: [`gov:${termId}`, 'govMethod:DEMOCRACY', 'proposal'], createdAt: new Date().toISOString()
  });
  for (let i = 0; i < voters.length; i++) await publish(voters[i], { type: 'votesVote', target: vote.key, choice: choices[i], createdAt: new Date().toISOString() });
  return vote.key;
};

const proposal = (peer, termId, over = {}) => publish(peer, {
  type: 'parliamentProposal', title: 'Plant trees', description: 'greener', method: 'DEMOCRACY',
  termId, proposer: peer.keypair.id, status: 'OPEN', createdAt: new Date().toISOString(), ...over
});

describe('parliament: a government nobody voted for does not exist', (t) => {
  t('a forged term with a huge population and a far end is ignored, and elections still happen', async () => {
    const net = makeNetwork();
    const [Q, B, C, D, E] = Array.from({ length: 5 }, () => makePeer(net));
    const window = termWindowFor(Date.now());
    const forged = {
      type: 'parliamentTerm', cycle: window.cycle, method: 'DICTATORSHIP', powerType: 'inhabitant', powerId: Q.keypair.id,
      powerTitle: 'Q', winnerVotes: 1e9, totalVotes: 1e9, population: 1e9, createdBy: Q.keypair.id, createdAt: new Date().toISOString()
    };
    await publish(Q, { ...forged, startAt: window.startAt, endAt: new Date(Date.now() + 3650 * 86400000).toISOString() });
    await publish(Q, { ...forged, startAt: window.startAt, endAt: window.endAt });

    B.setActor();
    const current = await B.use('parliament').getCurrentTerm();
    eq(current.method, 'ANARCHY', 'nobody governs');
    ok(current.virtual, 'the anarchy of the calendar, not the forged dictatorship');
    eq((await B.use('parliament').listTerms('all')).length, 0, 'the forged terms are not governments');
    notOk((await B.use('parliament').getGovernmentCard()).powerId === Q.keypair.id, 'the forger is nobody');

    const cand = await B.use('parliament').proposeCandidature({ candidateId: C.keypair.id, method: 'DEMOCRACY' });
    D.setActor();
    await D.use('parliament').voteCandidature(cand.key);
    E.setActor();
    await E.use('parliament').voteCandidature(cand.key);
    B.setActor();
    await wait(300);
    await B.use('parliament').resolveElection();
    const elected = await B.use('parliament').getCurrentTerm();
    eq(elected.powerId, C.keypair.id, 'the real election was not frozen by the forged end date');
  });

  t('a term that changes the method of the candidature it claims is ignored', async () => {
    const net = makeNetwork();
    const [A, C, D, E] = Array.from({ length: 4 }, () => makePeer(net));
    const window = termWindowFor(Date.now());
    await candidature(A, C, 'DEMOCRACY', [D, E], window);
    await publish(C, {
      type: 'parliamentTerm', cycle: window.cycle, method: 'DICTATORSHIP', powerType: 'inhabitant', powerId: C.keypair.id,
      powerTitle: 'C', winnerVotes: 2, totalVotes: 2, population: 0, startAt: window.startAt, endAt: window.endAt, createdAt: new Date().toISOString()
    });
    A.setActor();
    const current = await A.use('parliament').getCurrentTerm();
    ok(current.virtual, 'a democracy voted for is not a dictatorship');
  });
});

describe('parliament: one vote per inhabitant and cycle', (t) => {
  t('a second vote in the same cycle does not elect anybody, however often Parliament is opened', async () => {
    const net = makeNetwork();
    const [A, B, C, D, V, W, E] = Array.from({ length: 7 }, () => makePeer(net));
    const window = termWindowFor(Date.now());
    const first = await candidature(A, C, 'DEMOCRACY', [V], window);
    const second = await candidature(B, D, 'DEMOCRACY', [W], window);
    await publish(V, { type: 'parliamentCandidatureVote', target: second.key, createdAt: new Date().toISOString() });
    ok(first.key, 'V voted first for the candidature of C');
    for (let i = 0; i < 2; i++) {
      E.setActor();
      await E.use('parliament').resolveElection();
      await wait(300);
    }
    eq(net.log.filter(m => m.value.content && m.value.content.type === 'parliamentTerm').length, 0, 'no term is written for a count that does not hold');
    ok((await E.use('parliament').getCurrentTerm()).virtual, 'and the cycle stays in anarchy');
  });
});

describe('parliament: statuses and results are worked out from signed messages', (t) => {
  t('nobody can change the status of the proposal of someone else', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const p = await A.use('parliament').createProposal({ title: 'Bike lanes', description: 'safer' });
    const original = (await new Promise((res, rej) => A.node.get(p.key, (e, m) => e ? rej(e) : res(m)))).content;
    await publish(B, { ...original, replaces: p.key, status: 'APPROVED', votes: { YES: 99, NO: 0, ABSTENTION: 0, total: 99 } });
    await publish(B, { ...original, title: 'Impostor', proposer: A.keypair.id });
    B.setActor();
    const current = await B.use('parliament').listProposalsCurrent();
    eq(current.length, 1, 'neither the rewrite nor the impostor become proposals');
    eq(current[0].id, p.key, 'the proposal of A stays as A wrote it');
    eq(current[0].derivedStatus, 'OPEN', 'its vote is still running');
    eq(Number(current[0].yes), 0, 'and no invented vote is counted');
  });

  t('an approved proposal becomes one law, signed only by its proposer', async () => {
    const net = makeNetwork();
    const [L, X, V1, V2, W] = Array.from({ length: 5 }, () => makePeer(net));
    const past = termWindowFor(Date.now() - SPAN);
    const termId = await govern(X, L, 'DEMOCRACY', [V1, V2], past);
    const voteId = await ballotBox(L, termId, [V1, V2], ['YES', 'YES']);
    await proposal(L, termId, { voteId });
    await wait(400);

    W.setActor();
    await W.use('parliament').resolveElection();
    eq(signedBy(net, W, 'parliamentLaw').length, 0, 'a node does not enact the proposals of others');

    L.setActor();
    await L.use('parliament').resolveElection();
    await wait(300);
    await L.use('parliament').resolveElection();
    eq(signedBy(net, L, 'parliamentLaw').length, 1, 'the proposer enacts its own law, once');

    await wait(300);
    W.setActor();
    const laws = await W.use('parliament').listLaws();
    eq(laws.length, 1, 'everybody reads that one law');
    eq(laws[0].proposer, L.keypair.id);
    eq(Number(laws[0].votes.YES), 2, 'with the votes counted from the ballots');

    const enacted = signedBy(net, L, 'parliamentLaw')[0].value.content;
    await publish(L, { ...enacted, question: 'Ban bicycles', enactedAt: new Date(Date.now() - 1000).toISOString() });
    await publish(W, { ...enacted, description: 'something else', enactedAt: new Date(Date.now() - 1000).toISOString() });
    await wait(300);
    const after = await W.use('parliament').listLaws();
    eq(after.length, 1, 'a law whose text differs from what was approved is not listed');
    eq(after[0].question, 'Plant trees', 'whoever signs it');
  });

  t('invented votes, unknown methods and unauthorised proposers never become law', async () => {
    const net = makeNetwork();
    const [L, X, V1, V2, Q, W] = Array.from({ length: 6 }, () => makePeer(net));
    const past = termWindowFor(Date.now() - SPAN);
    const termId = await govern(X, L, 'DEMOCRACY', [V1, V2], past);
    const invented = { YES: 99, NO: 0, ABSTENTION: 0, total: 99 };

    const fake = await proposal(Q, termId, { method: 'FOO', status: 'APPROVED', votes: invented });
    await proposal(Q, termId, { status: 'APPROVED', votes: invented, voteId: await ballotBox(Q, termId, [V1, V2], ['YES', 'YES']) });
    await proposal(L, termId, { method: 'FOO', status: 'APPROVED', votes: invented });
    await proposal(L, termId, { status: 'APPROVED', votes: invented, voteId: await ballotBox(L, termId, [V1, V2], ['YES', 'NO']) });
    await proposal(L, termId, { title: 'No vote at all', status: 'APPROVED', votes: invented });
    await publish(Q, {
      type: 'parliamentLaw', question: 'Plant trees', description: 'greener', method: 'DEMOCRACY', proposer: Q.keypair.id,
      termId, voteId: null, votes: invented, proposedAt: new Date().toISOString(), proposalId: fake.key, enactedAt: new Date().toISOString()
    });
    await wait(400);

    for (const peer of [Q, L, W]) {
      peer.setActor();
      await peer.use('parliament').resolveElection();
    }
    for (const peer of [L, W]) eq(signedBy(net, peer, 'parliamentLaw').length, 0, 'nothing is enacted');
    await wait(300);
    W.setActor();
    eq((await W.use('parliament').listLaws()).length, 0, 'and the law the forger wrote is not listed');
  });

  t('a revocation only ever deletes a law of the node that enacts it', async () => {
    const net = makeNetwork();
    const [L, X, V1, V2, Victim, Q, W] = Array.from({ length: 7 }, () => makePeer(net));
    const older = termWindowFor(Date.now() - 2 * SPAN);
    const past = termWindowFor(Date.now() - SPAN);
    const olderId = await govern(X, L, 'DEMOCRACY', [V1, V2], older);
    const p0 = await proposal(L, olderId, { voteId: await ballotBox(L, olderId, [V1, V2], ['YES', 'YES']) });
    await wait(400);
    const law = await publish(L, {
      type: 'parliamentLaw', question: 'Plant trees', description: 'greener', method: 'DEMOCRACY', proposer: L.keypair.id,
      termId: olderId, voteId: null, votes: { YES: 2, NO: 0, ABSTENTION: 0, total: 2 }, proposedAt: new Date().toISOString(),
      proposalId: p0.key, enactedAt: new Date().toISOString()
    });
    const victimPost = await publish(Victim, { type: 'post', text: 'mine' });
    const ownPost = await publish(L, { type: 'post', text: 'also mine' });

    W.setActor();
    eq((await W.use('parliament').listLaws()).length, 1, 'the law of the older term is in force');

    const termId = await govern(X, L, 'DEMOCRACY', [V1, V2], past);
    const revoke = async (peer, lawId) => publish(peer, {
      type: 'parliamentRevocation', lawId, title: 'Revoke', reasons: 'r', method: 'DEMOCRACY', termId,
      voteId: await ballotBox(peer, termId, [V1, V2], ['YES', 'YES']), proposer: peer.keypair.id, status: 'OPEN', createdAt: new Date().toISOString()
    });
    await revoke(L, law.key);
    await revoke(L, victimPost.key);
    await revoke(L, ownPost.key);
    await revoke(Q, victimPost.key);
    await wait(400);

    W.setActor();
    eq((await W.use('parliament').listLaws()).length, 0, 'an approved revocation of an expired term takes the law out');

    for (const peer of [Victim, Q, W, L]) {
      peer.setActor();
      await peer.use('parliament').resolveElection();
    }
    eq(signedBy(net, Victim, 'tombstone').length, 0, 'the victim deletes nothing of its own');
    const tombs = signedBy(net, L, 'tombstone').map(m => m.value.content.target);
    eq(tombs.length, 1, 'the enacting node deletes exactly one message');
    eq(tombs[0], law.key, 'its own law, and not a post');
    eq(signedBy(net, W, 'tombstone').length + signedBy(net, Q, 'tombstone').length, 0, 'nobody else deletes anything');
  });
});
