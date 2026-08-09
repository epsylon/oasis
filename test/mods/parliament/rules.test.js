const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('parliament: the rules of candidatures and proposals', (t) => {
  t('proposeCandidature validates method and candidate', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    await throwsAsync(() => A.use('parliament').proposeCandidature({ candidateId: B.keypair.id, method: 'BOGUS' }), /Invalid method/);
    await throwsAsync(() => A.use('parliament').proposeCandidature({ candidateId: 'nobody-here', method: 'DEMOCRACY' }), /Candidate not found/);
  });

  t('a candidature can be voted and the tally reflects the voter', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('parliament').proposeCandidature({ candidateId: C.keypair.id, method: 'DEMOCRACY' });
    B.setActor();
    await B.use('parliament').voteCandidature(r.key);
    const list = await B.use('parliament').listCandidatures('OPEN');
    const cand = list.find(c => c.targetId === C.keypair.id);
    ok(cand, 'candidature listed');
    ok(cand.votes >= 1);
    ok(cand.voters.includes(B.keypair.id));
  });

  t('a candidate cannot vote for their own candidature', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('parliament').proposeCandidature({ candidateId: B.keypair.id, method: 'DEMOCRACY' });
    B.setActor();
    await throwsAsync(() => B.use('parliament').voteCandidature(r.key), /yourself/);
  });

  t('duplicate candidature in the same cycle is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    await A.use('parliament').proposeCandidature({ candidateId: B.keypair.id, method: 'DEMOCRACY' });
    await throwsAsync(() => A.use('parliament').proposeCandidature({ candidateId: B.keypair.id, method: 'MAJORITY' }), /already proposed/);
  });

  t('a proposer may not exceed three candidatures per cycle', async () => {
    const net = makeNetwork();
    const A = makePeer(net);
    const targets = [makePeer(net), makePeer(net), makePeer(net), makePeer(net)];
    A.setActor();
    for (let i = 0; i < 3; i++) {
      await A.use('parliament').proposeCandidature({ candidateId: targets[i].keypair.id, method: 'DEMOCRACY' });
    }
    await throwsAsync(() => A.use('parliament').proposeCandidature({ candidateId: targets[3].keypair.id, method: 'DEMOCRACY' }), /limit/);
  });

  t('with nobody elected the government is ANARCHY, and nothing is written down', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const term = await A.use('parliament').getCurrentTerm();
    eq(term.method, 'ANARCHY', 'an empty parliament is an anarchy');
    ok(term.virtual, 'and it is derived from the calendar, not from a message');
    eq(await A.use('parliament').getPublishedTerm(), null, 'no term was published');
    const terms = await A.use('parliament').listTerms('all');
    ok(Array.isArray(terms) && terms.length === 0, 'the log stays empty');
  });

  t('createProposal validates title and description, and opens an ANARCHY term', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await throwsAsync(() => A.use('parliament').createProposal({ title: '   ' }), /Title required/);
    await throwsAsync(() => A.use('parliament').createProposal({ title: 'ok', description: 'x'.repeat(1001) }), /too long/);
    const r = await A.use('parliament').createProposal({ title: 'Plant trees', description: 'greener city' });
    ok(r && r.key);
    const term = await A.use('parliament').getCurrentTerm();
    ok(term, 'a term was created by the first proposal');
    eq(String(term.method).toUpperCase(), 'ANARCHY');
    ok(await A.use('parliament').canPropose());
  });

  t('proposals are limited to three per term and are listed as current', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    for (let i = 0; i < 3; i++) {
      await A.use('parliament').createProposal({ title: 'Motion ' + i, description: 'd' });
    }
    await throwsAsync(() => A.use('parliament').createProposal({ title: 'Motion 4', description: 'd' }), /limit/);
    const current = await A.use('parliament').listProposalsCurrent();
    ok(Array.isArray(current) && current.length >= 3);
  });
});
