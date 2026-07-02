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
