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
});
