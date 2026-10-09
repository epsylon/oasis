const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const publish = (peer, content) => new Promise((res, rej) => peer.node.publish(content, (e, m) => e ? rej(e) : res(m)));
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const openCase = async (A, B, method, title) => {
  A.setActor();
  await A.use('courts').openCase({ titleBase: title, respondentInput: B.keypair.id, method });
  const caseId = (await A.use('courts').listCases('all')).find(c => String(c.title || '').endsWith(title)).id;
  const rootCaseId = (await A.use('courts').getCaseById(caseId)).rootCaseId;
  return { caseId, rootCaseId };
};

const popularVote = async (owner, rootCaseId, voters, choices) => {
  const vote = await publish(owner, {
    type: 'votes', question: 'Case', options: ['YES', 'NO', 'ABSTENTION'], deadline: new Date(Date.now() + 300).toISOString(),
    createdBy: owner.keypair.id, status: 'OPEN', votes: { YES: 0, NO: 0, ABSTENTION: 0 }, totalVotes: 0, voters: [],
    tags: [`courtsCase:${rootCaseId}`, 'courtsMethod:POPULAR'], createdAt: new Date().toISOString()
  });
  for (let i = 0; i < voters.length; i++) await publish(voters[i], { type: 'votesVote', target: vote.key, choice: choices[i], createdAt: new Date().toISOString() });
  return vote.key;
};

describe('courts: only who the case names can decide it', (t) => {
  t('a later verdict from an outsider does not replace the verdict of the judge', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const J = makePeer(net); const O = makePeer(net);
    const { caseId, rootCaseId } = await openCase(A, B, 'JUDGE', 'fence');
    await A.use('courts').assignJudge({ caseId, judgeId: J.keypair.id });
    J.setActor();
    await J.use('courts').processIncomingCourtsKeys();
    await J.use('courts').issueVerdict({ caseId, result: 'DISMISSED', orders: 'none' });
    await wait(5);
    await publish(O, { type: 'courtsVerdict', caseId: rootCaseId, judgeId: O.keypair.id, result: 'GUILTY', orders: 'forged', createdAt: new Date(Date.now() + 60000).toISOString() });
    A.setActor();
    const d = await A.use('courts').getCaseDetails({ caseId });
    eq(String(d.status).toUpperCase(), 'DECIDED', 'the case stays decided');
    eq(d.verdict && d.verdict.result, 'DISMISSED', 'by the verdict of the judge');
  });

  t('a public vote decides a case only with a majority', async () => {
    const net = makeNetwork();
    const [A, B, C, D, E] = Array.from({ length: 5 }, () => makePeer(net));
    const tie = await openCase(A, B, 'POPULAR', 'tie');
    await publish(A, { type: 'courtsVoteLink', caseId: tie.rootCaseId, voteId: await popularVote(A, tie.rootCaseId, [C, D], ['YES', 'NO']), author: A.keypair.id, createdAt: new Date().toISOString() });
    const clear = await openCase(A, B, 'POPULAR', 'clear');
    await publish(A, { type: 'courtsVoteLink', caseId: clear.rootCaseId, voteId: await popularVote(A, clear.rootCaseId, [C, D, E], ['YES', 'YES', 'NO']), author: A.keypair.id, createdAt: new Date().toISOString() });
    await wait(400);
    A.setActor();
    notOk(String((await A.use('courts').getCaseById(tie.caseId)).status).toUpperCase() === 'DECIDED', 'a tie decides nothing');
    eq(String((await A.use('courts').getCaseById(clear.caseId)).status).toUpperCase(), 'DECIDED', 'a majority decides');
  });

  t('a vote opened by someone outside the case does not decide it', async () => {
    const net = makeNetwork();
    const [A, B, C, D, E, O] = Array.from({ length: 6 }, () => makePeer(net));
    const c = await openCase(A, B, 'POPULAR', 'outside');
    const voteId = await popularVote(O, c.rootCaseId, [C, D, E], ['YES', 'YES', 'YES']);
    await publish(A, { type: 'courtsVoteLink', caseId: c.rootCaseId, voteId, author: A.keypair.id, createdAt: new Date().toISOString() });
    await wait(400);
    A.setActor();
    notOk(String((await A.use('courts').getCaseById(c.caseId)).status).toUpperCase() === 'DECIDED');
  });

  t('the dictator named in a case decides it only while it really rules', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const D = makePeer(net);
    const openedAt = new Date().toISOString();
    const c = await publish(A, {
      type: 'courtsCase', title: 'x', accuser: A.keypair.id, respondentType: 'inhabitant', respondentId: B.keypair.id,
      method: 'DICTATOR', status: 'OPEN', openedAt, mediatorsAccuser: [], mediatorsRespondent: [], dictatorId: D.keypair.id, createdAt: openedAt
    });
    await publish(D, { type: 'courtsVerdict', caseId: c.key, judgeId: D.keypair.id, result: 'GUILTY', orders: '', createdAt: new Date().toISOString() });
    A.setActor();
    const courtsWith = (terms) => require('../../../src/models/courts_model')({ cooler: A.cooler, tribeCrypto: A.tribeCrypto, services: { parliament: { listTerms: async () => terms } } });
    const start = new Date(Date.now() - 86400000).toISOString();
    const end = new Date(Date.now() + 86400000).toISOString();
    notOk(String((await A.use('courts').getCaseById(c.key)).status).toUpperCase() === 'DECIDED', 'without a ruling dictator the verdict decides nothing');
    notOk(String((await courtsWith([{ method: 'DEMOCRACY', powerType: 'inhabitant', powerId: D.keypair.id, startAt: start, endAt: end }]).getCaseById(c.key)).status).toUpperCase() === 'DECIDED', 'nor while a democracy rules');
    ok(String((await courtsWith([{ method: 'DICTATORSHIP', powerType: 'inhabitant', powerId: D.keypair.id, startAt: start, endAt: end }]).getCaseById(c.key)).status).toUpperCase() === 'DECIDED', 'the ruling dictator does decide');
  });
});
