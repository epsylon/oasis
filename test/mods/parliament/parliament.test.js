const { eq, ok } = require('../../helpers/assert');
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
