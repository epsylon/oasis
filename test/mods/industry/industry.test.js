const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const FUTURE_DAY = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const FUTURE_END = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

describe('industry: facility creation + independent governance', (t) => {
  t('A creates a facility and is its steward and sole member', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Foundry', sector: 'hardware', description: 'd', membershipPolicy: 'vote' });
    ok(r);
    const fc = await A.use('industry').getFacilityById(r.key);
    eq(fc.name, 'Foundry');
    eq(fc.sector, 'hardware');
    eq(fc.steward, A.keypair.id);
    eq(fc.memberCount, 1);
    ok(fc.members.includes(A.keypair.id));
    eq(fc.status, 'ACTIVE');
  });

  t('vote policy: B applies, A admits, B becomes a member', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Coop', membershipPolicy: 'vote', quorum: 1, majority: 0.5 });
    B.setActor();
    await B.use('industry').joinFacility(r.key);
    let fc = await A.use('industry').getFacilityById(r.key);
    notOk(fc.members.includes(B.keypair.id));
    eq(fc.pendingApplicants.length, 1);
    eq(fc.pendingApplicants[0].id, B.keypair.id);
    A.setActor();
    await A.use('industry').voteGovernance(r.key, 'admit', B.keypair.id, 'yes');
    fc = await A.use('industry').getFacilityById(r.key);
    ok(fc.members.includes(B.keypair.id));
    eq(fc.pendingApplicants.length, 0);
  });

  t('open policy: B joins directly', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Open', membershipPolicy: 'open' });
    B.setActor();
    await B.use('industry').joinFacility(r.key);
    const fc = await A.use('industry').getFacilityById(r.key);
    ok(fc.members.includes(B.keypair.id));
    eq(fc.memberCount, 2);
  });

  t('invite policy: join is blocked without an invitation, allowed after invite', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Guild', membershipPolicy: 'invite' });
    B.setActor();
    await throwsAsync(() => B.use('industry').joinFacility(r.key), /invitation/i);
    A.setActor();
    await A.use('industry').inviteToFacility(r.key, B.keypair.id);
    B.setActor();
    await B.use('industry').joinFacility(r.key);
    const fc = await A.use('industry').getFacilityById(r.key);
    ok(fc.members.includes(B.keypair.id));
  });

  t('a member can leave; the steward cannot leave', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'X', membershipPolicy: 'open' });
    B.setActor();
    await B.use('industry').joinFacility(r.key);
    await B.use('industry').leaveFacility(r.key);
    let fc = await A.use('industry').getFacilityById(r.key);
    notOk(fc.members.includes(B.keypair.id));
    A.setActor();
    await throwsAsync(() => A.use('industry').leaveFacility(r.key), /steward/i);
  });

  t('dissolution requires a collective vote (quorum 2, majority 1.0)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Commons', membershipPolicy: 'open', quorum: 2, majority: 1 });
    B.setActor();
    await B.use('industry').joinFacility(r.key);
    A.setActor();
    await A.use('industry').voteGovernance(r.key, 'dissolve', '', 'yes');
    let fc = await A.use('industry').getFacilityById(r.key);
    eq(fc.status, 'ACTIVE');
    B.setActor();
    await B.use('industry').voteGovernance(r.key, 'dissolve', '', 'yes');
    fc = await A.use('industry').getFacilityById(r.key);
    eq(fc.status, 'DISSOLVED');
  });

  t('the steward cannot dissolve alone via updateFacility', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Solo', membershipPolicy: 'open' });
    await throwsAsync(() => A.use('industry').updateFacility(r.key, { status: 'DISSOLVED' }), /governance/i);
  });

  t('pause/resume is a member vote (WORKING <-> PAUSED), reversible', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Pausable', membershipPolicy: 'open', quorum: 2, majority: 1 });
    B.setActor();
    await B.use('industry').joinFacility(r.key);
    A.setActor();
    await A.use('industry').voteGovernance(r.key, 'pause', '', 'yes');
    let fc = await A.use('industry').getFacilityById(r.key);
    eq(fc.status, 'ACTIVE');
    B.setActor();
    await B.use('industry').voteGovernance(r.key, 'pause', '', 'yes');
    fc = await A.use('industry').getFacilityById(r.key);
    eq(fc.status, 'PAUSED');
    A.setActor();
    await A.use('industry').voteGovernance(r.key, 'pause', '', 'no');
    fc = await A.use('industry').getFacilityById(r.key);
    eq(fc.status, 'ACTIVE');
  });

  t('builds cannot be proposed while PAUSED', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Halt', membershipPolicy: 'open', quorum: 1, majority: 0.5 });
    await A.use('industry').voteGovernance(r.key, 'pause', '', 'yes');
    const fc = await A.use('industry').getFacilityById(r.key);
    eq(fc.status, 'PAUSED');
    await throwsAsync(() => A.use('industry').createBuild(r.key, { title: 'X', startDate: FUTURE_DAY, endDate: FUTURE_END }), /not active/i);
  });

  t('delete is allowed for a solo facility and blocked once it has members', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const solo = await A.use('industry').createFacility({ name: 'DelOk', membershipPolicy: 'open' });
    await A.use('industry').deleteFacility(solo.key);
    await throwsAsync(() => A.use('industry').getFacilityById(solo.key), /not found/i);
    const shared = await A.use('industry').createFacility({ name: 'DelNo', membershipPolicy: 'open' });
    B.setActor();
    await B.use('industry').joinFacility(shared.key);
    A.setActor();
    await throwsAsync(() => A.use('industry').deleteFacility(shared.key), /dissolved/i);
  });

  t('listFacilities filters: MINE and MEMBER', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Filterable', membershipPolicy: 'open' });
    B.setActor();
    await B.use('industry').joinFacility(r.key);
    const mineB = await B.use('industry').listFacilities('MINE');
    eq(mineB.length, 0);
    const memberB = await B.use('industry').listFacilities('MEMBER');
    eq(memberB.length, 1);
    A.setActor();
    const mineA = await A.use('industry').listFacilities('MINE');
    eq(mineA.length, 1);
  });

  t('non-members cannot vote governance', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Closed', membershipPolicy: 'vote' });
    B.setActor();
    await throwsAsync(() => B.use('industry').voteGovernance(r.key, 'dissolve', '', 'yes'), /members/i);
  });
});

describe('industry: blueprints, builds, contributions, distribution', (t) => {
  t('members can add blueprints; non-members cannot', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Plant', membershipPolicy: 'open' });
    const bp = await A.use('industry').createBlueprint(r.key, { name: 'Widget', outItem: 'widget', outQty: 10, outKind: 'physical', laborHours: 5 });
    ok(bp);
    const list = await A.use('industry').listBlueprints(r.key);
    eq(list.length, 1);
    eq(list[0].name, 'Widget');
    B.setActor();
    await throwsAsync(() => B.use('industry').createBlueprint(r.key, { name: 'X' }), /members/i);
  });

  t('build lifecycle: propose, approve by vote, contributions gated by status', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Coop', membershipPolicy: 'open', laborRate: 10, reserve: 0, quorum: 1, majority: 0.5 });
    B.setActor();
    await B.use('industry').joinFacility(r.key);
    A.setActor();
    const bpFor1 = await A.use('industry').createBlueprint(r.key, { name: 'Recipe 1', laborHours: 1 });
    const build = await A.use('industry').createBuild(r.key, { blueprintId: bpFor1.key, title: 'Batch 1', startDate: FUTURE_DAY, endDate: FUTURE_END });
    let b = await A.use('industry').getBuild(build.key);
    eq(b.status, 'PROPOSED');
    await throwsAsync(() => A.use('industry').contribute(build.key, { kind: 'labor', hours: 5 }), /not accepting/i);
    await A.use('industry').voteBuild(build.key, 'yes');
    b = await A.use('industry').getBuild(build.key);
    eq(b.status, 'APPROVED');
    await A.use('industry').contribute(build.key, { kind: 'labor', hours: 10 });
    b = await A.use('industry').getBuild(build.key);
    eq(b.contributions.length, 1);
  });

  t('shares are computed proportionally across labor, material and eco', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Shares', membershipPolicy: 'open', laborRate: 10, reserve: 10, quorum: 1, majority: 0.5 });
    B.setActor();
    await B.use('industry').joinFacility(r.key);
    A.setActor();
    const bpFor2 = await A.use('industry').createBlueprint(r.key, { name: 'Recipe 2', laborHours: 1 });
    const build = await A.use('industry').createBuild(r.key, { blueprintId: bpFor2.key, title: 'B', startDate: FUTURE_DAY, endDate: FUTURE_END });
    await A.use('industry').voteBuild(build.key, 'yes');
    await A.use('industry').contribute(build.key, { kind: 'labor', hours: 10 });
    B.setActor();
    await B.use('industry').contribute(build.key, { kind: 'eco', eco: 50 });
    await B.use('industry').contribute(build.key, { kind: 'material', item: 'steel', value: 50 });
    A.setActor();
    const b = await A.use('industry').getBuild(build.key);
    eq(b.totalPoints, 200);
    eq(b.shares[A.keypair.id], 0.5);
    eq(b.shares[B.keypair.id], 0.5);
    eq(b.treasury, 50);
  });

  t('distribution: steward-only, completed-only, computes pot and amounts', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Dist', membershipPolicy: 'open', laborRate: 10, quorum: 1, majority: 0.5 });
    B.setActor();
    await B.use('industry').joinFacility(r.key);
    A.setActor();
    const bpFor3 = await A.use('industry').createBlueprint(r.key, { name: 'Recipe 3', laborHours: 1 });
    const build = await A.use('industry').createBuild(r.key, { blueprintId: bpFor3.key, title: 'B', startDate: FUTURE_DAY, endDate: FUTURE_END });
    await A.use('industry').voteBuild(build.key, 'yes');
    await A.use('industry').contribute(build.key, { kind: 'labor', hours: 10 });
    B.setActor();
    await B.use('industry').contribute(build.key, { kind: 'eco', eco: 50 });
    await B.use('industry').contribute(build.key, { kind: 'material', item: 'steel', value: 50 });
    A.setActor();
    await throwsAsync(() => A.use('industry').distributeBuild(build.key, { outputValue: 150 }), /completed/i);
    await A.use('industry').setBuildStatus(build.key, 'STOCKING');
    await A.use('industry').setBuildStatus(build.key, 'IN_PRODUCTION');
    B.setActor();
    await throwsAsync(() => B.use('industry').setBuildStatus(build.key, 'COMPLETED'), /steward/i);
    A.setActor();
    await A.use('industry').setBuildStatus(build.key, 'COMPLETED');
    const res = await A.use('industry').distributeBuild(build.key, { outputValue: 150 });
    eq(Math.round(res.plan.pot), 200);
    eq(Math.round(res.plan.distributable), 200);
    eq(Math.round(res.plan.amounts[A.keypair.id]), 100);
    eq(Math.round(res.plan.amounts[B.keypair.id]), 100);
    const b = await A.use('industry').getBuild(build.key);
    ok(b.distributed);
    await throwsAsync(() => A.use('industry').distributeBuild(build.key, { outputValue: 150 }), /already/i);
  });

  t('facilitiesOf and listMyBuilds return a member\'s facilities and builds', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'Hub', membershipPolicy: 'open', laborRate: 10, quorum: 1, majority: 0.5 });
    B.setActor();
    await B.use('industry').joinFacility(r.key);
    const facs = await B.use('industry').facilitiesOf(B.keypair.id);
    eq(facs.length, 1);
    eq(facs[0].name, 'Hub');
    A.setActor();
    const bpFor4 = await A.use('industry').createBlueprint(r.key, { name: 'Recipe 4', laborHours: 1 });
    const build = await A.use('industry').createBuild(r.key, { blueprintId: bpFor4.key, title: 'B1', startDate: FUTURE_DAY, endDate: FUTURE_END });
    const myBuildsA = await A.use('industry').listMyBuilds();
    eq(myBuildsA.length, 1);
    eq(myBuildsA[0].title, 'B1');
    B.setActor();
    const myBuildsB = await B.use('industry').listMyBuilds();
    eq(myBuildsB.length, 1);
    const outsider = makePeer(net); outsider.setActor();
    const none = await outsider.use('industry').listMyBuilds();
    eq(none.length, 0);
  });

  t('non-steward cannot distribute', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('industry').createFacility({ name: 'NS', membershipPolicy: 'open', laborRate: 10, quorum: 1, majority: 0.5 });
    B.setActor();
    await B.use('industry').joinFacility(r.key);
    A.setActor();
    const bpFor5 = await A.use('industry').createBlueprint(r.key, { name: 'Recipe 5', laborHours: 1 });
    const build = await A.use('industry').createBuild(r.key, { blueprintId: bpFor5.key, title: 'B', startDate: FUTURE_DAY, endDate: FUTURE_END });
    await A.use('industry').voteBuild(build.key, 'yes');
    await A.use('industry').contribute(build.key, { kind: 'labor', hours: 1 });
    await A.use('industry').setBuildStatus(build.key, 'STOCKING');
    await A.use('industry').setBuildStatus(build.key, 'IN_PRODUCTION');
    await A.use('industry').setBuildStatus(build.key, 'COMPLETED');
    B.setActor();
    await throwsAsync(() => B.use('industry').distributeBuild(build.key, { outputValue: 10 }), /steward/i);
  });
});

describe('industry: global blueprint and build listings', (t) => {
  t('listAllBlueprints and listAllBuilds aggregate across facilities with facility info', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const f1 = await ind.createFacility({ name: 'Fac One', sector: 'software', membershipPolicy: 'open' });
    const f2 = await ind.createFacility({ name: 'Fac Two', sector: 'energy', membershipPolicy: 'open' });
    const bpOne = await ind.createBlueprint(f1.key, { name: 'BP One', description: 'first design', outKind: 'digital', laborHours: 2 });
    await ind.createBlueprint(f2.key, { name: 'BP Two', description: 'second design', laborHours: 3 });
    await ind.createBuild(f1.key, { blueprintId: bpOne.key, title: 'Run One', startDate: FUTURE_DAY, endDate: FUTURE_END });
    const bps = await ind.listAllBlueprints();
    eq(bps.length, 2, 'both blueprints listed');
    ok(bps.find(b => b.name === 'BP One' && b.facilityName === 'Fac One'), 'blueprint carries facility name');
    ok(bps.every(b => b.facilityId), 'facilityId set');
    const builds = await ind.listAllBuilds();
    eq(builds.length, 1, 'build listed');
    eq(builds[0].facilityName, 'Fac One', 'build carries facility name');
    eq(builds[0].status, 'PROPOSED', 'status resolved');
  });

  t('blueprint description is stored and survives update', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'DescFac', sector: 'software', membershipPolicy: 'open' });
    const bp = await ind.createBlueprint(fc.key, { name: 'BP', description: 'weighs 2kg', laborHours: 1 });
    let list = await ind.listBlueprints(fc.key);
    eq(list[0].description, 'weighs 2kg', 'description stored');
    await ind.updateBlueprint(bp.key, { laborHours: 4 });
    list = await ind.listBlueprints(fc.key);
    eq(list[0].description, 'weighs 2kg', 'description survives unrelated update');
    eq(list[0].laborHours, 4, 'update applied');
  });
});

describe('industry: blueprint price estimate', (t) => {
  t('estimate = materials(qty*price) + laborHours*laborRate', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'EstFac', sector: 'hardware', membershipPolicy: 'open', laborRate: 10 });
    await ind.createBlueprint(fc.key, { name: 'EstBP', laborHours: 2, materialsText: 'steel:2:12\nbolt:8:0.5' });
    const [bp] = await ind.listBlueprints(fc.key);
    eq(bp.estMaterialsCost, 28, 'materials cost = 2*12 + 8*0.5');
    eq(bp.estLaborCost, 20, 'labor cost = 2h * 10 ECO/h');
    eq(bp.estTotal, 48, 'total = materials + labor');
    eq(bp.materials[0].price, 12, 'material price parsed from name:quantity:price');
  });
});

const inDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('industry: build metadata (dates, media, blueprint ref)', (t) => {
  t('a build stores start/end dates and image; listings expose blueprintName and estimate', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'MetaFac', sector: 'hardware', membershipPolicy: 'open', laborRate: 10 });
    const bp = await ind.createBlueprint(fc.key, { name: 'Widget plan', laborHours: 2, materialsText: 'steel:1:10', image: '&img0000000000000000000000000000000000000000000.sha256' });
    const build = await ind.createBuild(fc.key, { title: 'Run', blueprintId: bp.key, startDate: inDays(1), endDate: inDays(15), image: '&img1111111111111111111111111111111111111111111.sha256' });
    const got = await ind.getBuild(build.key);
    eq(got.startDate, inDays(1), 'start date stored');
    eq(got.endDate, inDays(15), 'end date stored');
    ok(got.image, 'build image stored');
    eq(got.blueprintName, 'Widget plan', 'blueprint name resolved');
    eq(got.estMaterialsCost, 10, 'estimate follows the referenced blueprint');
    const all = await ind.listAllBuilds();
    eq(all[0].blueprintName, 'Widget plan', 'global list carries blueprintName');
    const [lbp] = await ind.listBlueprints(fc.key);
    ok(lbp.image, 'blueprint image stored');
  });

  t('a build with end date before start date is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'DateFac', sector: 'software', membershipPolicy: 'open' });
    const bpFor7 = await ind.createBlueprint(fc.key, { name: 'Recipe 7', laborHours: 1 });
    await throwsAsync(() => ind.createBuild(fc.key, { blueprintId: bpFor7.key, title: 'Bad', startDate: inDays(15), endDate: inDays(1) }), /End date/);
  });
});

describe('industry: blueprint/build update+delete governance', (t) => {
  t('solo steward can update and delete a blueprint directly', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'SoloGov', sector: 'software', membershipPolicy: 'open' });
    const bp = await ind.createBlueprint(fc.key, { name: 'BP', laborHours: 1 });
    await ind.updateBlueprint(bp.key, { laborHours: 3 });
    let list = await ind.listBlueprints(fc.key);
    eq(list[0].laborHours, 3, 'solo update applied');
    await ind.deleteBlueprint(list[0].id);
    list = await ind.listBlueprints(fc.key);
    eq(list.length, 0, 'solo delete applied');
  });

  t('with members, blueprint update/delete require a passing vote', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'MultiGov', sector: 'software', membershipPolicy: 'open', quorum: 2, majority: 0.5 });
    B.setActor(); await B.use('industry').joinFacility(fc.key); A.setActor();
    const bp = await ind.createBlueprint(fc.key, { name: 'BP', laborHours: 1 });
    await throwsAsync(() => ind.updateBlueprint(bp.key, { laborHours: 5 }), /governance vote/);
    const [before] = await ind.listBlueprints(fc.key);
    await ind.voteGovernance(fc.key, 'bpUpdate', before.root, 'yes');
    B.setActor(); await B.use('industry').voteGovernance(fc.key, 'bpUpdate', before.root, 'yes'); A.setActor();
    await ind.updateBlueprint(bp.key, { laborHours: 5 });
    const [after] = await ind.listBlueprints(fc.key);
    eq(after.laborHours, 5, 'update applied once vote passed');
    await throwsAsync(() => ind.deleteBlueprint(after.id), /governance vote/);
    await ind.voteGovernance(fc.key, 'bpDelete', after.root, 'yes');
    B.setActor(); await B.use('industry').voteGovernance(fc.key, 'bpDelete', after.root, 'yes'); A.setActor();
    await ind.deleteBlueprint(after.id);
    eq((await ind.listBlueprints(fc.key)).length, 0, 'delete applied once vote passed');
  });

  t('only the author executes; a member vote can be revoked (latest preference)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'RevGov', sector: 'software', membershipPolicy: 'open', quorum: 2, majority: 0.5 });
    B.setActor(); await B.use('industry').joinFacility(fc.key); A.setActor();
    const bp = await ind.createBlueprint(fc.key, { name: 'BP', laborHours: 1 });
    const [cur] = await ind.listBlueprints(fc.key);
    B.setActor();
    await throwsAsync(() => B.use('industry').deleteBlueprint(cur.id), /author/);
    await B.use('industry').voteGovernance(fc.key, 'bpDelete', cur.root, 'yes');
    await B.use('industry').voteGovernance(fc.key, 'bpDelete', cur.root, 'no');
    A.setActor();
    await ind.voteGovernance(fc.key, 'bpDelete', cur.root, 'yes');
    await throwsAsync(() => ind.deleteBlueprint(cur.id), /governance vote/);
  });

  t('with members, build delete requires a vote; proposer executes', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'BuildGov', sector: 'software', membershipPolicy: 'open', quorum: 2, majority: 0.5 });
    B.setActor(); await B.use('industry').joinFacility(fc.key); A.setActor();
    const bpFor8 = await ind.createBlueprint(fc.key, { name: 'Recipe 8', laborHours: 1 });
    const build = await ind.createBuild(fc.key, { blueprintId: bpFor8.key, title: 'Run', startDate: FUTURE_DAY, endDate: FUTURE_END });
    await throwsAsync(() => ind.deleteBuild(build.key), /governance vote/);
    B.setActor();
    await throwsAsync(() => B.use('industry').deleteBuild(build.key), /proposer/);
    await B.use('industry').voteGovernance(fc.key, 'buildDelete', build.key, 'yes');
    A.setActor();
    await ind.voteGovernance(fc.key, 'buildDelete', build.key, 'yes');
    await ind.deleteBuild(build.key);
    const all = await ind.listAllBuilds();
    eq(all.length, 0, 'build deleted after vote');
  });
});

describe('industry: build rejection and paused-facility gating', (t) => {
  t('no-votes reaching the threshold mark the build REJECTED, reversibly', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'RejFac', sector: 'software', membershipPolicy: 'open', quorum: 2, majority: 0.5 });
    B.setActor(); await B.use('industry').joinFacility(fc.key); A.setActor();
    const bpFor9 = await ind.createBlueprint(fc.key, { name: 'Recipe 9', laborHours: 1 });
    const build = await ind.createBuild(fc.key, { blueprintId: bpFor9.key, title: 'Run', startDate: FUTURE_DAY, endDate: FUTURE_END });
    await ind.voteBuild(build.key, 'no');
    B.setActor(); await B.use('industry').voteBuild(build.key, 'no'); A.setActor();
    let b = await ind.getBuild(build.key);
    eq(b.status, 'REJECTED', 'both no -> REJECTED');
    await ind.voteBuild(build.key, 'yes');
    B.setActor(); await B.use('industry').voteBuild(build.key, 'yes'); A.setActor();
    b = await ind.getBuild(build.key);
    eq(b.status, 'APPROVED', 'votes flipped -> APPROVED');
  });

  t('a paused facility freezes contributions and status transitions', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'FreezeFac', sector: 'software', membershipPolicy: 'open', laborRate: 5 });
    const bpFor10 = await ind.createBlueprint(fc.key, { name: 'Recipe 10', laborHours: 1 });
    const build = await ind.createBuild(fc.key, { blueprintId: bpFor10.key, title: 'Run', startDate: FUTURE_DAY, endDate: FUTURE_END });
    await ind.voteBuild(build.key, 'yes');
    eq((await ind.getBuild(build.key)).status, 'APPROVED', 'approved by solo steward');
    await ind.voteGovernance(fc.key, 'pause', '', 'yes');
    eq((await ind.getFacilityById(fc.key)).status, 'PAUSED', 'facility paused');
    await throwsAsync(() => ind.contribute(build.key, { kind: 'labor', hours: 2 }), /not active/);
    await throwsAsync(() => ind.setBuildStatus(build.key, 'STOCKING'), /not active/);
    await ind.voteGovernance(fc.key, 'pause', '', 'no');
    await ind.contribute(build.key, { kind: 'labor', hours: 2 });
    await ind.setBuildStatus(build.key, 'STOCKING');
    eq((await ind.getBuild(build.key)).status, 'STOCKING', 'resumes after unpause');
  });
});

describe('industry: contribution validation', (t) => {
  t('zero or negative contributions are rejected for every kind', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'ValFac', sector: 'software', membershipPolicy: 'open', laborRate: 10 });
    const bpFor11 = await ind.createBlueprint(fc.key, { name: 'Recipe 11', laborHours: 1 });
    const build = await ind.createBuild(fc.key, { blueprintId: bpFor11.key, title: 'Run', startDate: FUTURE_DAY, endDate: FUTURE_END });
    await ind.voteBuild(build.key, 'yes');
    await throwsAsync(() => ind.contribute(build.key, { kind: 'labor', hours: 0 }), /hours above zero/);
    await throwsAsync(() => ind.contribute(build.key, { kind: 'labor', hours: -5 }), /hours above zero/);
    await throwsAsync(() => ind.contribute(build.key, { kind: 'material', item: 'steel', value: 0 }), /value above zero/);
    await throwsAsync(() => ind.contribute(build.key, { kind: 'material', item: 'steel', value: -3 }), /value above zero/);
    await throwsAsync(() => ind.contribute(build.key, { kind: 'material', item: '', value: 10 }), /require an item/);
    await throwsAsync(() => ind.contribute(build.key, { kind: 'eco', eco: 0 }), /amount above zero/);
    await throwsAsync(() => ind.contribute(build.key, { kind: 'eco', eco: -1 }), /amount above zero/);
    const b = await ind.getBuild(build.key);
    eq(b.contributions.length, 0, 'nothing was recorded');
  });

  t('a valid contribution only stores the fields of its kind', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'CleanFac', sector: 'software', membershipPolicy: 'open', laborRate: 10 });
    const bpFor12 = await ind.createBlueprint(fc.key, { name: 'Recipe 12', laborHours: 1 });
    const build = await ind.createBuild(fc.key, { blueprintId: bpFor12.key, title: 'Run', startDate: FUTURE_DAY, endDate: FUTURE_END });
    await ind.voteBuild(build.key, 'yes');
    await ind.contribute(build.key, { kind: 'labor', hours: 2, item: 'ignored', value: 99, eco: 77, note: 'ok' });
    const [c] = (await ind.getBuild(build.key)).contributions;
    eq(c.kind, 'labor', 'kind kept');
    eq(c.hours, 2, 'hours kept');
    eq(c.item, '', 'other-kind item cleared');
    eq(c.value, 0, 'other-kind value cleared');
    eq(c.eco, 0, 'other-kind eco cleared');
  });
});

describe('industry: build scheduling', (t) => {
  t('dates are mandatory and a build can be rescheduled to gain more time', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'SchedFac', sector: 'software', membershipPolicy: 'open' });
    const bpFor13 = await ind.createBlueprint(fc.key, { name: 'Recipe 13', laborHours: 1 });
    await throwsAsync(() => ind.createBuild(fc.key, { blueprintId: bpFor13.key, title: 'NoDates' }), /start date is required/);
    const bpFor14 = await ind.createBlueprint(fc.key, { name: 'Recipe 14', laborHours: 1 });
    await throwsAsync(() => ind.createBuild(fc.key, { blueprintId: bpFor14.key, title: 'NoEnd', startDate: FUTURE_DAY }), /end date is required/);
    const bpFor15 = await ind.createBlueprint(fc.key, { name: 'Recipe 15', laborHours: 1 });
    const build = await ind.createBuild(fc.key, { blueprintId: bpFor15.key, title: 'Run', startDate: FUTURE_DAY, endDate: FUTURE_END });
    const later = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    await ind.updateBuild(build.key, { startDate: FUTURE_DAY, endDate: later });
    const b = await ind.getBuild(build.key);
    eq(b.endDate, later, 'deadline extended');
    eq(b.startDate, FUTURE_DAY, 'start kept');
    await throwsAsync(() => ind.updateBuild(build.key, { startDate: FUTURE_END, endDate: FUTURE_DAY }), /End date must be after/);
  });

  t('rescheduling keeps contributions and status attached to the build', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'KeepFac', sector: 'software', membershipPolicy: 'open', laborRate: 10 });
    const bpFor16 = await ind.createBlueprint(fc.key, { name: 'Recipe 16', laborHours: 1 });
    const build = await ind.createBuild(fc.key, { blueprintId: bpFor16.key, title: 'Run', startDate: FUTURE_DAY, endDate: FUTURE_END });
    await ind.voteBuild(build.key, 'yes');
    await ind.contribute(build.key, { kind: 'labor', hours: 3 });
    const later = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    await ind.updateBuild(build.key, { startDate: FUTURE_DAY, endDate: later });
    const b = await ind.getBuild(build.key);
    eq(b.status, 'APPROVED', 'status survives the reschedule');
    eq(b.contributions.length, 1, 'contribution survives the reschedule');
    eq(b.endDate, later, 'new deadline applied');
  });
});

describe('industry: build reschedule governance', (t) => {
  t('with members, rescheduling needs a vote; the solo steward reschedules directly', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const ind = A.use('industry');
    const solo = await ind.createFacility({ name: 'SoloResched', sector: 'software', membershipPolicy: 'open' });
    const bpSolo = await ind.createBlueprint(solo.key, { name: 'R', laborHours: 1 });
    const soloBuild = await ind.createBuild(solo.key, { blueprintId: bpSolo.key, title: 'S', startDate: FUTURE_DAY, endDate: FUTURE_END });
    const later = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    await ind.updateBuild(soloBuild.key, { startDate: FUTURE_DAY, endDate: later });
    eq((await ind.getBuild(soloBuild.key)).endDate, later, 'solo steward reschedules with no vote');

    const fc = await ind.createFacility({ name: 'MultiResched', sector: 'software', membershipPolicy: 'open', quorum: 2, majority: 0.5 });
    const bp = await ind.createBlueprint(fc.key, { name: 'R', laborHours: 1 });
    const build = await ind.createBuild(fc.key, { blueprintId: bp.key, title: 'M', startDate: FUTURE_DAY, endDate: FUTURE_END });
    B.setActor(); await B.use('industry').joinFacility(fc.key); A.setActor();
    await throwsAsync(() => ind.updateBuild(build.key, { startDate: FUTURE_DAY, endDate: later }), /governance vote/);
    await ind.voteGovernance(fc.key, 'buildUpdate', build.key, 'yes');
    B.setActor(); await B.use('industry').voteGovernance(fc.key, 'buildUpdate', build.key, 'yes'); A.setActor();
    await ind.updateBuild(build.key, { startDate: FUTURE_DAY, endDate: later });
    eq((await ind.getBuild(build.key)).endDate, later, 'reschedule applied once the vote passed');
  });
});

describe('industry: karma shares belong to the members', (t) => {
  t('only contributions from members count towards the shares of a build', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'SharesFab', sector: 'hardware', membershipPolicy: 'vote', laborRate: 10 });
    const bp = await ind.createBlueprint(fc.key, { name: 'Chair', materialsText: 'wood:2:5', laborHours: 3 });
    const build = await ind.createBuild(fc.key, { blueprintId: bp.key, title: 'Run', startDate: FUTURE_DAY, endDate: FUTURE_END });
    await ind.voteBuild(build.key, 'yes');
    await ind.contribute(build.key, { kind: 'labor', hours: 10 });

    B.setActor();
    await throwsAsync(() => B.use('industry').contribute(build.key, { kind: 'labor', hours: 990 }), /Only members can contribute/);
    await new Promise((res, rej) => B.node.publish({ type: 'industryContribution', target: build.key, kind: 'labor', hours: 990, item: '', value: 0, eco: 0, note: '', createdAt: new Date().toISOString() }, (e) => e ? rej(e) : res()));

    A.setActor();
    const b = await ind.getBuild(build.key);
    eq(b.contributions.length, 1, 'the contribution of the non-member is ignored');
    eq(b.totalPoints, 100, 'points come from the member only');
    eq(Object.keys(b.shares).length, 1);
    eq(b.shares[A.keypair.id], 1, 'the member holds the whole share');
    notOk(b.shares[B.keypair.id], 'the non-member holds no share');
  });
});

describe('industry: blueprint lifecycle integrity', (t) => {
  t('a blueprint backing a build cannot be deleted until the build is gone', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'IntegrityFab', sector: 'hardware', laborRate: 10 });
    const bp = await ind.createBlueprint(fc.key, { name: 'Chair', materialsText: 'wood:2:5', laborHours: 3 });
    const build = await ind.createBuild(fc.key, { blueprintId: bp.key, title: 'Run', startDate: FUTURE_DAY, endDate: FUTURE_END });
    await throwsAsync(() => ind.deleteBlueprint(bp.key), /used by 1 build/);
    ok(await ind.getBlueprint(bp.key), 'the blueprint survives the refused deletion');
    await ind.deleteBuild(build.key);
    await ind.deleteBlueprint(bp.key);
    await throwsAsync(() => ind.getBlueprint(bp.key), /Blueprint not found/);
  });

  t('a blueprint whose facility is gone is not reachable either', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'Doomed', sector: 'software', laborRate: 1 });
    const bp = await ind.createBlueprint(fc.key, { name: 'Orphan', laborHours: 1 });
    await ind.deleteFacility(fc.key);
    await throwsAsync(() => ind.getBlueprint(bp.key), /Facility not found/);
    eq((await ind.listAllBlueprints()).length, 0, 'nor is it listed');
  });
});
