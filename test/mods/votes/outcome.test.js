const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const votesFactory = require('../../../src/models/votes_model');
const { voteResultOf, hasVoteRules, voteMajorityOf, voteQuorumOf } = votesFactory;

const future = (days = 30) => new Date(Date.now() + days * 86400000).toISOString();
const ballots = (yes, no, others = 0) => ({ votes: { YES: yes, NO: no, ABSTENTION: others }, totalVotes: yes + no + others });

describe('votes: required majority and minimum participation', (t) => {
  t('a votation without rules is decided by simple majority and needs a single vote', () => {
    eq(voteResultOf({ votes: {}, totalVotes: 0 }).outcome, 'NO_QUORUM', 'with nobody voting there is no result');
    eq(voteResultOf(ballots(1, 0)).outcome, 'APPROVED');
    eq(voteResultOf(ballots(2, 2)).outcome, 'REJECTED', 'a tie is not a majority');
    eq(voteResultOf(ballots(3, 2)).majority, 'SIMPLE');
    eq(voteResultOf(ballots(3, 2)).quorum, 0);
    eq(voteResultOf(ballots(3, 2)).participation, null, 'without a census there is no percentage');
  });

  t('abstentions and the other options count for participation, never for the majority', () => {
    const r = voteResultOf({ votes: { YES: 2, NO: 1, ABSTENTION: 5, CONFUSED: 1, FOLLOW_MAJORITY: 3, NOT_INTERESTED: 2 }, totalVotes: 14, eligible: 20, quorum: 50, majority: 'TWO_THIRDS' });
    eq(r.voters, 14);
    eq(r.participation, 70);
    ok(r.quorumMet);
    eq(r.outcome, 'APPROVED', '2 YES of 3 decisive votes reach 2/3');
    eq(voteResultOf({ votes: { YES: 0, NO: 0, ABSTENTION: 4 }, totalVotes: 4 }).outcome, 'REJECTED', 'abstentions alone approve nothing');
  });

  t('each majority sets its own threshold over YES + NO', () => {
    const at = (majority, yes, no) => voteResultOf({ ...ballots(yes, no), majority }).outcome;
    eq(at('SIMPLE', 51, 49), 'APPROVED');
    eq(at('TWO_THIRDS', 2, 1), 'APPROVED', 'exactly two thirds is enough');
    eq(at('TWO_THIRDS', 65, 35), 'REJECTED');
    eq(at('THREE_QUARTERS', 3, 1), 'APPROVED');
    eq(at('THREE_QUARTERS', 74, 26), 'REJECTED');
    eq(at('UNANIMITY', 9, 0), 'APPROVED');
    eq(at('UNANIMITY', 9, 1), 'REJECTED');
  });

  t('below the minimum participation the result is NO QUORUM whatever the votes say', () => {
    const r = voteResultOf({ ...ballots(9, 0), eligible: 40, quorum: 25 });
    eq(r.required, 10);
    eq(r.participation, 22);
    notOk(r.quorumMet);
    eq(r.outcome, 'NO_QUORUM');
    eq(voteResultOf({ ...ballots(9, 1), eligible: 40, quorum: 25 }).outcome, 'APPROVED', 'one more voter reaches it');
    eq(voteResultOf({ ...ballots(5, 5, 1), eligible: 40, quorum: 25 }).outcome, 'REJECTED', 'an abstention can complete the quorum');
    eq(voteResultOf({ ...ballots(50, 0), eligible: 40, quorum: 75 }).participation, 100, 'newcomers never push it over 100%');
  });

  t('unknown parameters fall back to simple majority and no quorum', () => {
    eq(voteMajorityOf('HALF'), 'SIMPLE');
    eq(voteMajorityOf('two_thirds'), 'TWO_THIRDS');
    eq(voteQuorumOf('33'), 0);
    eq(voteQuorumOf('50'), 50);
    eq(voteQuorumOf(undefined), 0);
  });

  t('only YES/NO votations of the module follow these rules', () => {
    ok(hasVoteRules({ options: ['YES', 'NO', 'ABSTENTION'], tags: ['budget'] }));
    notOk(hasVoteRules({ options: ['Red', 'Blue'] }), 'free options keep the plain winner');
    notOk(hasVoteRules({ contentType: 'votation', options: ['YES', 'NO'] }), 'and so does a tribe votation');
    notOk(hasVoteRules({ options: ['YES', 'NO'], tags: ['gov:2026', 'govMethod:DEMOCRACY'] }), 'Parliament decides its own');
    notOk(hasVoteRules({ options: ['YES', 'NO'], tags: ['courtsCase:x'] }), 'Courts decides its own');
    notOk(hasVoteRules({ options: ['YES', 'NO', 'ABSTENTION'], tags: ['decree', 'house'] }), 'LARP decrees decide their own');
  });

  t('createVote stores the chosen rules and the inhabitants who can vote', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await votesFactory({ cooler: A.cooler, countInhabitants: async () => 11 }).createVote('Adopt it?', future(), undefined, [], { majority: 'THREE_QUARTERS', quorum: '50' });
    const v = await votesFactory({ cooler: A.cooler }).getVoteById(r.key);
    eq(v.majority, 'THREE_QUARTERS');
    eq(v.quorum, 50);
    eq(v.eligible, 10, 'everybody but the author');
    B.setActor();
    await votesFactory({ cooler: B.cooler }).voteOnVote(r.key, 'YES');
    const res = voteResultOf(await votesFactory({ cooler: B.cooler }).getVoteById(r.key));
    eq(res.voters, 1);
    eq(res.participation, 10);
    eq(res.outcome, 'NO_QUORUM');
  });

  t('a votation opened by another module carries no rules', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await votesFactory({ cooler: A.cooler, countInhabitants: async () => 5 }).createVote('Law?', future(), ['YES', 'NO', 'ABSTENTION'], ['gov:1']);
    const v = await votesFactory({ cooler: A.cooler }).getVoteById(r.key);
    eq(v.majority, undefined);
    eq(v.eligible, undefined);
  });

  t('the author can change the rules before anyone votes, and a scheduled votation keeps them', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const votes = votesFactory({ cooler: A.cooler, scheduler: A.use('scheduler'), countInhabitants: async () => 4 });
    const r = await votes.createVote('Change?', future(), undefined, [], { majority: 'SIMPLE', quorum: '0' });
    await votes.updateVoteById(r.key, { question: 'Change?', majority: 'UNANIMITY', quorum: '25' });
    const v = await votes.getVoteById(r.key);
    eq(v.majority, 'UNANIMITY');
    eq(v.quorum, 25);
    eq(v.eligible, 3, 'the census of the first publication stays');
    const hour = 3600000;
    const scheduled = await votes.scheduleVote('Later?', future(), undefined, [], new Date(Date.now() + hour).toISOString(), { majority: 'TWO_THIRDS', quorum: '10' });
    eq(scheduled.majority, 'TWO_THIRDS');
    eq((await votes.publishDue(Date.now() + hour + 1)).length, 1);
    const published = (await votes.listAll('all')).find(x => x.question === 'Later?');
    eq(published.majority, 'TWO_THIRDS');
    eq(published.quorum, 10);
    eq(published.eligible, 3);
  });
});
