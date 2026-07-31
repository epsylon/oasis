const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const openJudgeCase = async (A, B, method = 'JUDGE', title = 'dispute') => {
  A.setActor();
  const res = await A.use('courts').openCase({ titleBase: title, respondentInput: B.keypair.id, method });
  return res.key;
};

describe('courts: generic functionality', (t) => {
  t('openCase validates title, method and respondent', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    await throwsAsync(() => A.use('courts').openCase({ titleBase: '   ', respondentInput: B.keypair.id, method: 'JUDGE' }), /Title is required/);
    await throwsAsync(() => A.use('courts').openCase({ titleBase: 'x', respondentInput: B.keypair.id, method: 'NONSENSE' }), /Invalid resolution method/);
    await throwsAsync(() => A.use('courts').openCase({ titleBase: 'x', respondentInput: 'nobody-here', method: 'JUDGE' }), /not found/);
    await throwsAsync(() => A.use('courts').openCase({ titleBase: 'x', respondentInput: B.keypair.id, method: 'DICTATOR' }), /DICTATOR/);
  });

  t('getCaseById exposes case fields and status filters work', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const caseId = await openJudgeCase(A, B);
    const c = await A.use('courts').getCaseById(caseId);
    eq(c.method, 'JUDGE');
    eq(c.accuser, A.keypair.id);
    eq(c.respondentId, B.keypair.id);
    eq(String(c.status).toUpperCase(), 'OPEN');
    const open = await A.use('courts').listCases('open');
    ok(open.some(x => x.id === caseId));
    const history = await A.use('courts').listCases('history');
    notOk(history.some(x => x.id === caseId));
  });

  t('answerCase: only respondent may answer, stance is validated', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const caseId = await openJudgeCase(A, B);
    A.setActor();
    await throwsAsync(() => A.use('courts').answerCase({ caseId, stance: 'DENY', text: 'me' }), /Only the respondent/);
    B.setActor();
    await B.use('courts').processIncomingCourtsKeys();
    await throwsAsync(() => B.use('courts').answerCase({ caseId, stance: 'PERHAPS', text: 'hmm' }), /Invalid stance/);
    await B.use('courts').answerCase({ caseId, stance: 'DENY', text: 'not guilty' });
    const d = await A.use('courts').getCaseDetails({ caseId });
    eq(String(d.status).toUpperCase(), 'IN_PROGRESS');
  });

  t('addEvidence: parties can add, outsiders cannot, content required', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const caseId = await openJudgeCase(A, B);
    A.setActor();
    const ev = await A.use('courts').addEvidence({ caseId, text: 'photo of the scene' });
    ok(ev && ev.key);
    await throwsAsync(() => A.use('courts').addEvidence({ caseId }), /required/);
    C.setActor();
    await throwsAsync(() => C.use('courts').addEvidence({ caseId, text: 'butting in' }), /not involved/);
  });

  t('settlement: party proposes, respondent accepts -> CLOSED, outsiders blocked', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const caseId = await openJudgeCase(A, B);
    A.setActor();
    await A.use('courts').proposeSettlement({ caseId, terms: 'pay back the debt' });
    C.setActor();
    await throwsAsync(() => C.use('courts').acceptSettlement({ caseId }), /Only parties/);
    B.setActor();
    await B.use('courts').processIncomingCourtsKeys();
    const closed = await B.use('courts').acceptSettlement({ caseId });
    eq(String(closed.status).toUpperCase(), 'CLOSED');
  });

  t('supportCase: outsiders support once, parties cannot', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const caseId = await openJudgeCase(A, B);
    C.setActor();
    const s = await C.use('courts').supportCase({ caseId });
    ok(s && s.key);
    await throwsAsync(() => C.use('courts').supportCase({ caseId }), /already support/);
    A.setActor();
    await throwsAsync(() => A.use('courts').supportCase({ caseId }), /Parties cannot/);
    const d = await A.use('courts').getCaseDetails({ caseId });
    ok(d.supportCount >= 1);
  });

  t('assignJudge validates method, judge identity and party exclusion', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const J = makePeer(net);
    const medCaseId = await openJudgeCase(A, B, 'MEDIATION', 'mediation');
    A.setActor();
    await throwsAsync(() => A.use('courts').assignJudge({ caseId: medCaseId, judgeId: J.keypair.id }), /does not use a judge/);
    const caseId = await openJudgeCase(A, B, 'JUDGE', 'judged');
    A.setActor();
    await throwsAsync(() => A.use('courts').assignJudge({ caseId, judgeId: 'not-a-feed' }), /Invalid judge ID/);
    await throwsAsync(() => A.use('courts').assignJudge({ caseId, judgeId: B.keypair.id }), /cannot be a party/);
    const c = await A.use('courts').assignJudge({ caseId, judgeId: J.keypair.id });
    eq(c.judgeId, J.keypair.id);
  });

  t('nominations: nominate, vote, list; self-vote and repeat blocked', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const J = makePeer(net);
    A.setActor();
    await throwsAsync(() => A.use('courts').nominateJudge({ judgeId: 'not-a-feed' }), /Invalid judge ID/);
    const nom = await A.use('courts').nominateJudge({ judgeId: J.keypair.id });
    ok(nom && nom.key);
    J.setActor();
    await throwsAsync(() => J.use('courts').voteNomination(nom.key), /yourself/);
    B.setActor();
    await B.use('courts').voteNomination(nom.key);
    await throwsAsync(() => B.use('courts').voteNomination(nom.key), /already voted/);
    const rows = await B.use('courts').listNominations();
    const row = rows.find(r => r.judgeId === J.keypair.id);
    ok(row && row.supports >= 1);
  });

  t('openPopularVote: only on public cases, once, by a party', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const judgeCaseId = await openJudgeCase(A, B, 'JUDGE', 'nojvote');
    A.setActor();
    await throwsAsync(() => A.use('courts').openPopularVote({ caseId: judgeCaseId }), /does not use public voting/);
    const popularId = await openJudgeCase(A, B, 'POPULAR', 'popular');
    A.setActor();
    const c = await A.use('courts').openPopularVote({ caseId: popularId });
    ok(c.voteId);
    await throwsAsync(() => A.use('courts').openPopularVote({ caseId: popularId }), /already opened/);
  });
});
