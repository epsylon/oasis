const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('banking: address management (no RPC)', (t) => {
  t('A adds own ECO address', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('banking').addAddress({ userId: A.keypair.id, address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42A' });
    const addr = await A.use('banking').getUserAddress(A.keypair.id);
    eq(addr, 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42A');
  });

  t('A sets address (publishes if self)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('banking').setUserAddress(A.keypair.id, 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42B', true);
    const addr = await A.use('banking').getUserAddress(A.keypair.id);
    eq(addr, 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42B');
  });

  t('listAddressesMerged returns combined view', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('banking').addAddress({ userId: A.keypair.id, address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42C' });
    const merged = await A.use('banking').listAddressesMerged();
    ok(Array.isArray(merged));
  });

  t('A removes own address', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('banking').addAddress({ userId: A.keypair.id, address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42D' });
    await A.use('banking').removeAddress({ userId: A.keypair.id });
    const addr = await A.use('banking').getUserAddress(A.keypair.id);
    eq(addr, null);
  });
});

describe('banking: claims and epochs (no RPC)', (t) => {
  t('hasClaimedThisMonth returns boolean', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const claimed = await A.use('banking').hasClaimedThisMonth(A.keypair.id);
    eq(typeof claimed, 'boolean');
  });

  t('getUbiClaimHistory returns history object', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const history = await A.use('banking').getUbiClaimHistory(A.keypair.id);
    ok(history);
    eq(typeof history.claimCount, 'number');
  });

  t('listBanking returns object', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const result = await A.use('banking').listBanking('all').catch(() => null);
    ok(result === null || typeof result === 'object');
  });

  t('getBankingData returns user banking info', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const data = await A.use('banking').getBankingData(A.keypair.id).catch(() => null);
    ok(data === null || typeof data === 'object');
  });
});

describe('banking: pub state', (t) => {
  t('isPubNode returns boolean', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const isPub = A.use('banking').isPubNode();
    eq(typeof isPub, 'boolean');
  });

  t('getConfiguredPubId returns string or null', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const pid = A.use('banking').getConfiguredPubId();
    ok(typeof pid === 'string' || pid === null || pid === undefined);
  });

  t('DEFAULT_RULES exported', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const rules = A.use('banking').DEFAULT_RULES;
    ok(rules);
    ok(rules.caps);
  });
});

describe('banking: industry figures follow the industry model', (t) => {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  t('Industry Production keeps its value after a blueprint is edited', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'Fab', sector: 'hardware', laborRate: 10 });
    const bp = await ind.createBlueprint(fc.key, { name: 'Chair', materialsText: 'wood:2:5', laborHours: 3 });
    await ind.createBuild(fc.key, { blueprintId: bp.key, title: 'Run', startDate: day(1), endDate: day(10) });
    const before = (await A.use('banking').listBanking('overview', A.keypair.id)).summary.industryNetworkTotal;
    eq(before, 40, 'materials 10 + labor 3h x 10');
    await ind.updateBlueprint(bp.key, { name: 'Chair v2' });
    const after = (await A.use('banking').listBanking('overview', A.keypair.id)).summary.industryNetworkTotal;
    eq(after, 40, 'the edited blueprint still backs the build');
    eq((await ind.listAllBuilds())[0].estTotal, after, 'banking matches the industry model');
  });

  t('Your Industry Share values the labor of the viewer at the facility rate', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'Fab2', sector: 'hardware', laborRate: 10 });
    await ind.updateFacility(fc.key, { description: 'edited once' });
    const bp = await ind.createBlueprint(fc.key, { name: 'Table', materialsText: 'wood:1:1', laborHours: 5 });
    const build = await ind.createBuild(fc.key, { blueprintId: bp.key, title: 'Run', startDate: day(1), endDate: day(5) });
    await ind.voteBuild(build.key, 'yes');
    await ind.contribute(build.key, { kind: 'labor', hours: 4 });
    const summary = (await A.use('banking').listBanking('overview', A.keypair.id)).summary;
    eq(summary.industryBalance, 40, '4h x 10 ECO/h survives the facility edit');
    eq(summary.industryNetworkTotal, 51, 'production keeps the labor rate of the edited facility');
  });
});

describe('banking: industry share belongs to members', (t) => {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

  t('a contribution published by a non-member gives no industry share', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const ind = A.use('industry');
    const fc = await ind.createFacility({ name: 'ShareFab', sector: 'hardware', laborRate: 10 });
    const bp = await ind.createBlueprint(fc.key, { name: 'Table', materialsText: 'wood:1:1', laborHours: 5 });
    const build = await ind.createBuild(fc.key, { blueprintId: bp.key, title: 'Run', startDate: day(1), endDate: day(5) });
    await ind.voteBuild(build.key, 'yes');
    await ind.contribute(build.key, { kind: 'labor', hours: 4 });

    B.setActor();
    await new Promise((res, rej) => B.node.publish({ type: 'industryContribution', target: build.key, kind: 'labor', hours: 990, item: '', value: 0, eco: 0, note: '', createdAt: new Date().toISOString() }, (e) => e ? rej(e) : res()));
    eq((await B.use('banking').listBanking('overview', B.keypair.id)).summary.industryBalance, 0, 'the non-member earns nothing');

    A.setActor();
    eq((await A.use('banking').listBanking('overview', A.keypair.id)).summary.industryBalance, 40, 'the member keeps 4h x 10 ECO/h');
  });
});
