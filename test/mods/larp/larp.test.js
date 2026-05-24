const { eq, ok, notOk, deepEq } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const HOUSES = ['academia','solaris','arrakis','terraverde','unsystem','dogma','helix','quark','hermandad'];

describe('larp: house membership', (t) => {
  t('a new user is outside the LARP (no house) by default', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const house = await A.use('larp').getUserHouse(A.keypair.id);
    eq(house, null);
  });

  t('publishLeaveLarp returns a previously-in-LARP user to the no-house state', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    await lm.publishJoin('academia');
    eq(await lm.getUserHouse(A.keypair.id), 'academia');
    await lm.publishLeaveLarp();
    eq(await lm.getUserHouse(A.keypair.id), null);
  });

  t('after publishLeaveLarp the user is not counted in any house', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    await lm.publishJoin('solaris');
    await lm.publishLeaveLarp();
    const members = await lm.getMembersOfHouse('solaris');
    notOk(members.includes(A.keypair.id));
    const acaMembers = await lm.getMembersOfHouse('academia');
    notOk(acaMembers.includes(A.keypair.id));
  });

  t('publishJoin moves user to chosen house', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    await A.use('larp').publishJoin('dogma');
    const house = await A.use('larp').getUserHouse(A.keypair.id);
    eq(house, 'dogma');
  });

  t('latest publishJoin wins over earlier ones', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    await A.use('larp').publishJoin('solaris');
    await A.use('larp').publishJoin('quark');
    eq(await A.use('larp').getUserHouse(A.keypair.id), 'quark');
  });

  t('publishJoin rejects invalid house key', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    let threw = false;
    try { await A.use('larp').publishJoin('not-a-house'); } catch (_) { threw = true; }
    ok(threw);
  });

  t('listHousesWithCounts returns all 9 houses with member counts', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await A.use('larp').publishJoin('helix');
    B.setActor(); await B.use('larp').publishJoin('helix');
    const houses = await A.use('larp').listHousesWithCounts();
    eq(houses.length, 9);
    deepEq(houses.map(h => h.key), HOUSES);
    const helix = houses.find(h => h.key === 'helix');
    eq(helix.memberCount, 2);
  });

  t('getMembersOfHouse returns only that house members', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor(); await A.use('larp').publishJoin('arrakis');
    B.setActor(); await B.use('larp').publishJoin('arrakis');
    C.setActor(); await C.use('larp').publishJoin('solaris');
    A.setActor();
    const arrakisMembers = await A.use('larp').getMembersOfHouse('arrakis');
    eq(arrakisMembers.length, 2);
    ok(arrakisMembers.includes(A.keypair.id));
    ok(arrakisMembers.includes(B.keypair.id));
    notOk(arrakisMembers.includes(C.keypair.id));
  });
});

describe('larp: governance cycle', (t) => {
  t('computeCycle returns formatted string', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const cycle = A.use('larp').computeCycle();
    ok(cycle);
    eq(typeof cycle.formatted, 'string');
    ok(cycle.formatted.length > 0);
    ok(HOUSES.includes(cycle.houseKey));
  });

  t('getGoverningHouseKey maps month index to house', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(2026, i, 15);
      eq(lm.getGoverningHouseKey(d), HOUSES[i % 9]);
    }
  });
});

describe('larp: house wall posts', (t) => {
  t('member can publish a post visible to other members', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await A.use('larp').publishJoin('terraverde');
    await A.use('larp').publishHousePost({ house: 'terraverde', text: 'inside the gardens' });
    B.setActor(); await B.use('larp').publishJoin('terraverde');
    const posts = await B.use('larp').listHousePosts('terraverde', { viewerHouse: 'terraverde' });
    eq(posts.length, 1);
    eq(posts[0].text, 'inside the gardens');
    eq(posts[0].author, A.keypair.id);
  });

  t('non-member sees nothing when the house is not governing', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await A.use('larp').publishJoin('quark');
    await A.use('larp').publishHousePost({ house: 'quark', text: 'reserved' });
    B.setActor();
    const posts = await B.use('larp').listHousePosts('quark', { viewerHouse: 'academia', isGoverning: false });
    eq(posts.length, 0);
  });

  t('non-member sees the wall when the house is currently governing', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor(); await A.use('larp').publishJoin('quark');
    await A.use('larp').publishHousePost({ house: 'quark', text: 'public address' });
    B.setActor();
    const posts = await B.use('larp').listHousePosts('quark', { viewerHouse: 'academia', isGoverning: true });
    eq(posts.length, 1);
    eq(posts[0].text, 'public address');
  });

  t('post from non-member of the house is filtered out', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    await A.use('larp').publishJoin('solaris');
    await A.use('larp').publishHousePost({ house: 'dogma', text: 'spoof' });
    const posts = await A.use('larp').listHousePosts('dogma', { isGoverning: true });
    eq(posts.length, 0);
  });

  t('publishHousePost rejects invalid house', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    let threw = false;
    try { await A.use('larp').publishHousePost({ house: 'invalid', text: 'x' }); } catch (_) { threw = true; }
    ok(threw);
  });

  t('publishHousePost rejects empty text', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    let threw = false;
    try { await A.use('larp').publishHousePost({ house: 'academia', text: '   ' }); } catch (_) { threw = true; }
    ok(threw);
  });
});

describe('larp: entrance test attempts', (t) => {
  t('canTakeTest is true for a fresh user', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const can = await A.use('larp').canTakeTest(A.keypair.id);
    eq(can.allowed, true);
    eq(can.last, null);
  });

  t('getProfileTest returns 10 questions with multiple options each', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const questions = A.use('larp').getProfileTest();
    eq(questions.length, 10);
    for (const q of questions) {
      ok(typeof q.question === 'string' && q.question.length > 0);
      ok(Array.isArray(q.options) && q.options.length >= 2);
      for (const opt of q.options) ok(typeof opt === 'string' && opt.length > 0);
    }
  });

  t('scoreProfileAnswers always picks a non-academia house', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    const allZero = lm.getProfileTest().map(() => 0);
    const flat = lm.scoreProfileAnswers(allZero);
    ok(typeof flat.bestHouse === 'string');
    ok(HOUSES.includes(flat.bestHouse));
    notOk(flat.bestHouse === 'academia');
  });

  t('scoreProfileAnswers tie-breaks by fewer members then alphabetical', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    const empty = lm.getProfileTest().map(() => -1);
    const noCounts = lm.scoreProfileAnswers(empty);
    eq(noCounts.bestHouse, 'arrakis', 'with empty answers and no counts, alpha order wins (arrakis < dogma < ...)');
    const withCounts = lm.scoreProfileAnswers(empty, { arrakis: 5, dogma: 0 });
    eq(withCounts.bestHouse, 'dogma', 'with counts, the less-populated house should win the tie');
  });

  t('submitProfileTest fills WILL form, assigns a house and records the attempt', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    const questions = lm.getProfileTest();
    const answers = questions.map(() => 0);
    const result = await lm.submitProfileTest({ answers });
    eq(result.ok, true);
    eq(result.passed, true);
    ok(typeof result.house === 'string' && result.house !== 'academia');
    eq(await lm.getUserHouse(A.keypair.id), result.house);
    const last = await lm.getLastTestAttempt(A.keypair.id);
    ok(last);
    eq(last.house, result.house);
  });

  t('cooldown blocks a second profile test within 30 cycles', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    const answers = lm.getProfileTest().map(() => 0);
    await lm.submitProfileTest({ answers });
    const can = await lm.canTakeTest(A.keypair.id);
    eq(can.allowed, false);
    ok(Number.isFinite(can.nextAt));
    ok(can.last);
    const second = await lm.submitProfileTest({ answers });
    eq(second.ok, false);
    eq(second.reason, 'cooldown');
  });
});

describe('larp: tribe integration', (t) => {
  t('joining a non-academia house auto-creates the matching tribe', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    await lm.publishJoin('helix');
    const tribe = await lm.findMyHouseTribe('helix');
    ok(tribe, 'house tribe should exist after joining');
    eq(tribe.author, A.keypair.id);
    ok(Array.isArray(tribe.members) && tribe.members.includes(A.keypair.id));
    ok((tribe.tags || []).includes('larp-HeliX'));
    eq(tribe.status, 'PRIVATE');
    eq(tribe.inviteMode, 'open');
    eq(tribe.isAnonymous, true);
    eq(tribe.image, '/assets/larp/images/helix.jpg', 'tribe image should match house image');
  });

  t('ensureHouseTribe is idempotent — does not create duplicates', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    await lm.publishJoin('arrakis');
    const first = await lm.ensureHouseTribe('arrakis');
    const second = await lm.ensureHouseTribe('arrakis');
    ok(first && second);
    eq(first.id, second.id);
  });

  t('academia tribe is public and not E2E-encrypted', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    await lm.publishJoin('academia');
    const tribe = await lm.findMyHouseTribe('academia');
    ok(tribe);
    eq(tribe.status, 'PUBLIC');
    eq(tribe.isAnonymous, false);
    eq(tribe.inviteMode, 'open');
    ok((tribe.tags || []).includes('larp-ACADEMIA'));
    eq(tribe.image, '/assets/larp/images/academia.jpg');
  });

  t('leaving a house leaves its tribe', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    await lm.publishJoin('dogma');
    const before = await lm.findMyHouseTribe('dogma');
    ok(before);
    await lm.publishJoin('academia');
    const after = await lm.findMyHouseTribe('dogma');
    ok(!after, 'previous house tribe should no longer list viewer as member');
  });

  t('publishJoin keeps the joiner attached to the newly entered tribe', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    await lm.publishJoin('solaris');
    await lm.publishJoin('quark');
    const sol = await lm.findMyHouseTribe('solaris');
    const qua = await lm.findMyHouseTribe('quark');
    ok(!sol, 'should have left solaris tribe');
    ok(qua, 'should be in quark tribe');
  });
});

describe('larp: invitation codes (tribe-backed)', (t) => {
  t('member generates a code via tribesModel.generateInvite', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const lm = A.use('larp');
    await lm.publishJoin('quark');
    const { code, house, tribeId } = await lm.createHouseInvite('quark');
    eq(house, 'quark');
    eq(typeof code, 'string');
    eq(code.length, 32);
    ok(typeof tribeId === 'string' && tribeId.length > 0);
  });

  t('non-member cannot create a house invite', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    let threw = false;
    try { await A.use('larp').createHouseInvite('quark'); } catch (_) { threw = true; }
    ok(threw);
  });

  t('createHouseInvite rejects academia', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    let threw = false;
    try { await A.use('larp').createHouseInvite('academia'); } catch (_) { threw = true; }
    ok(threw);
  });

  t('redeeming a malformed code fails silently', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const result = await A.use('larp').redeemHouseInvite('not-a-real-code');
    eq(result.ok, false);
  });

  t('A invites B (outsider) to her house; B ends up in the same house AND tribe', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('larp').publishJoin('solaris');
    const { code, tribeId } = await A.use('larp').createHouseInvite('solaris');
    eq(typeof code, 'string');
    eq(code.length, 32);
    B.setActor();
    eq(await B.use('larp').getUserHouse(B.keypair.id), null);
    const result = await B.use('larp').redeemHouseInvite(code);
    eq(result.ok, true);
    eq(result.house, 'solaris');
    eq(result.tribeId, tribeId);
    eq(await B.use('larp').getUserHouse(B.keypair.id), 'solaris');
    const tribe = await B.use('tribes').getTribeById(tribeId);
    ok(tribe.members.includes(B.keypair.id), 'B should be member of the tribe');
    ok(tribe.members.includes(A.keypair.id), 'A should still be member of the tribe');
  });

  t('A invites B (already in academia); B switches from academia tribe to solaris tribe', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('larp').publishJoin('solaris');
    const { code } = await A.use('larp').createHouseInvite('solaris');
    B.setActor();
    await B.use('larp').publishJoin('academia');
    const academiaTribeBefore = await B.use('larp').findMyHouseTribe('academia');
    ok(academiaTribeBefore, 'B is in academia tribe before redeeming');
    const result = await B.use('larp').redeemHouseInvite(code);
    eq(result.ok, true);
    eq(result.house, 'solaris');
    eq(await B.use('larp').getUserHouse(B.keypair.id), 'solaris');
    const academiaTribeAfter = await B.use('larp').findMyHouseTribe('academia');
    ok(!academiaTribeAfter, 'B should have left the academia tribe');
    const solarisTribe = await B.use('larp').findMyHouseTribe('solaris');
    ok(solarisTribe, 'B is in solaris tribe');
  });

  t('a tribe invite for a house can be used only once', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    await A.use('larp').publishJoin('helix');
    const { code } = await A.use('larp').createHouseInvite('helix');
    B.setActor();
    const first = await B.use('larp').redeemHouseInvite(code);
    eq(first.ok, true);
    C.setActor();
    const second = await C.use('larp').redeemHouseInvite(code);
    eq(second.ok, false, 'a consumed invite cannot be reused');
  });

  t('open inviteMode allows new members to generate further invites', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    await A.use('larp').publishJoin('arrakis');
    const inviteAB = await A.use('larp').createHouseInvite('arrakis');
    B.setActor();
    await B.use('larp').redeemHouseInvite(inviteAB.code);
    eq(await B.use('larp').getUserHouse(B.keypair.id), 'arrakis');
    const inviteBC = await B.use('larp').createHouseInvite('arrakis');
    eq(typeof inviteBC.code, 'string');
    eq(inviteBC.code.length, 32);
    C.setActor();
    const result = await C.use('larp').redeemHouseInvite(inviteBC.code);
    eq(result.ok, true);
    eq(result.house, 'arrakis');
  });

  t('redeeming an invite while already in a non-academia house is rejected', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('larp').publishJoin('quark');
    const { code } = await A.use('larp').createHouseInvite('quark');
    B.setActor();
    await B.use('larp').publishJoin('dogma');
    const result = await B.use('larp').redeemHouseInvite(code);
    eq(result.ok, false, 'must leave current house before redeeming a different invite');
    eq(await B.use('larp').getUserHouse(B.keypair.id), 'dogma');
  });
});
