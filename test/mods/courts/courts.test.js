const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('courts: open + list cases', (t) => {
  t('A opens a case against B', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const r = await A.use('courts').openCase({ titleBase: 'dispute', respondentInput: B.keypair.id, method: 'JUDGE' });
    ok(r);
    const list = await A.use('courts').listCases('all');
    ok(Array.isArray(list));
    ok(list.length >= 1);
  });

  t('A nominates a judge', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const r = await A.use('courts').nominateJudge({ judgeId: B.keypair.id });
    ok(r);
  });

  t('full JUDGE dispute: open -> key to B -> answer -> assign judge -> verdict -> DECIDED', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const J = makePeer(net);

    A.setActor();
    await A.use('courts').openCase({ titleBase: 'boundary', respondentInput: B.keypair.id, method: 'JUDGE' });
    const caseId = (await A.use('courts').listCases('all'))[0].id;
    ok(caseId, 'case created');
    eq(String((await A.use('courts').getCaseById(caseId)).status || '').toUpperCase(), 'OPEN', 'starts OPEN');

    B.setActor();
    await B.use('courts').processIncomingCourtsKeys();
    const caseB = await B.use('courts').getCaseById(caseId);
    ok(caseB && caseB.accuser === A.keypair.id, 'B decrypts the case after receiving the distributed key');
    eq(caseB.respondentId, B.keypair.id, 'B is the respondent');
    await B.use('courts').answerCase({ caseId, stance: 'DENY', text: 'not guilty' });

    let d = await A.use('courts').getCaseDetails({ caseId });
    eq(String(d.status).toUpperCase(), 'IN_PROGRESS', 'answer -> IN_PROGRESS (derived)');
    ok(d.answers.length >= 1, 'answer recorded as separate message');

    A.setActor();
    await A.use('courts').assignJudge({ caseId, judgeId: J.keypair.id });
    d = await A.use('courts').getCaseDetails({ caseId });
    eq(d.judgeId, J.keypair.id, 'judgeId derived from role-validated courtsJudge message');

    B.setActor();
    let partyBlocked = false;
    try { await B.use('courts').issueVerdict({ caseId, result: 'GUILTY', orders: 'x' }); } catch (_) { partyBlocked = true; }
    ok(partyBlocked, 'a party cannot issue the verdict');

    J.setActor();
    await J.use('courts').processIncomingCourtsKeys();
    await J.use('courts').issueVerdict({ caseId, result: 'DISMISSED', orders: 'case dismissed' });

    d = await A.use('courts').getCaseDetails({ caseId });
    eq(String(d.status).toUpperCase(), 'DECIDED', 'verdict by the assigned judge -> DECIDED');
    ok(d.verdict && d.verdict.result === 'DISMISSED', 'verdict content present and decrypted');
    ok(d.decidedAt, 'decidedAt populated for the history list');
  });

  t('a party cannot forge DECIDED by publishing a raw courtsVerdict', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const J = makePeer(net);
    A.setActor();
    await A.use('courts').openCase({ titleBase: 'forgery', respondentInput: B.keypair.id, method: 'JUDGE' });
    const caseId = (await A.use('courts').listCases('all'))[0].id;
    const rootCaseId = (await A.use('courts').getCaseById(caseId)).rootCaseId;
    await A.use('courts').assignJudge({ caseId, judgeId: J.keypair.id });
    // B (a party, NOT the judge) forges a raw courtsVerdict
    B.setActor();
    const ssbB = await B.cooler.open();
    await new Promise((res, rej) => ssbB.publish({ type: 'courtsVerdict', caseId: rootCaseId, judgeId: B.keypair.id, result: 'GUILTY', orders: 'forged', createdAt: new Date().toISOString() }, (e) => e ? rej(e) : res()));
    // status must stay non-DECIDED (verdict author != derived judge)
    A.setActor();
    const d = await A.use('courts').getCaseDetails({ caseId });
    ok(String(d.status).toUpperCase() !== 'DECIDED', 'forged verdict by a non-judge must not decide the case');
  });
});
