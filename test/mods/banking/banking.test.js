const { eq, ok, notOk } = require('../../helpers/assert');
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

describe('banking: a restored identity is not disturbed', (t) => {
  t('karma is never published onto an empty feed', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    eq(net.log.length, 0, 'the feed starts empty, as it does right after importing keys');
    await A.use('banking').getUserEngagementScore(A.keypair.id);
    eq(net.log.length, 0, 'looking at your own profile publishes nothing before you have a history');
    A.node.publish({ type: 'post', text: 'my first message' }, () => {});
    const before = net.log.length;
    await A.use('banking').getUserEngagementScore(A.keypair.id);
    ok(net.log.length >= before, 'and once there is a history the score may be published');
  });

  t('own volume has diminishing returns: 40 posts in a day score far below 40 times one post', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    A.node.publish({ type: 'post', text: 'one' }, () => {});
    const one = await A.use('banking').getUserEngagementScore(A.keypair.id);
    for (let i = 0; i < 39; i++) A.node.publish({ type: 'post', text: `spam ${i}` }, () => {});
    const many = await A.use('banking').getUserEngagementScore(A.keypair.id);
    ok(many >= one, 'more activity never lowers the score');
    ok(many < one * 40, `40 posts scored ${many}, one post scored ${one}`);
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

  t('discoverUbiPub returns the announced PUB shape', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const found = await A.use('banking').discoverUbiPub();
    ok(typeof found.pubId === 'string');
    eq(typeof found.available, 'boolean');
  });

  t('listUbiPubs returns an array of announcements', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const pubs = await A.use('banking').listUbiPubs();
    ok(Array.isArray(pubs));
  });

  t('rebalance and incoming confirmation are no-ops outside PUB mode', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const b = A.use('banking');
    eq((await b.rebalanceUbiPools()).length, 0);
    eq((await b.confirmIncomingTransfers()).length, 0);
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

describe('banking: address book (no RPC)', (t) => {
  t('an entry with a label is stored locally and listed with it', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const b = A.use('banking');
    const label = `Bob ${Date.now()}`;
    eq(b.addAddressBookEntry({ label, address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42E' }).status, 'added');
    const entry = b.listAddressBook().find(e => e.label === label);
    ok(entry, 'the entry is listed');
    eq(entry.source, 'book');
    eq(entry.address, 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42E');
    eq(await b.getUserAddress(A.keypair.id), null, 'the book never becomes the payment address of the viewer');
    eq(b.removeAddressBookEntry(entry.entryId).status, 'deleted');
    ok(!b.listAddressBook().some(e => e.entryId === entry.entryId));
  });

  t('the same label + address is not stored twice and a bad address is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const b = A.use('banking');
    const label = `Alice ${Date.now()}`;
    eq(b.addAddressBookEntry({ label, address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42F' }).status, 'added');
    eq(b.addAddressBookEntry({ label, address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42F' }).status, 'exists');
    eq(b.addAddressBookEntry({ label, address: 'not-an-address' }).status, 'invalid');
    const entry = b.listAddressBook().find(e => e.label === label);
    b.removeAddressBookEntry(entry.entryId);
  });
});

describe('banking: UBI rules (no RPC)', (t) => {
  t('the floor is always paid and taxes only eat the surplus', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const { ubiAmountFor, DEFAULT_RULES } = A.use('banking');
    const floor = DEFAULT_RULES.caps.floor_user;
    eq(ubiAmountFor({ pool: 0, userW: 1, totalW: 1, score: 0, ecoTax: 5, archTax: 5 }), floor, 'no pool: the floor, taxes cannot push it below');
    eq(ubiAmountFor({ pool: 10, userW: 1, totalW: 1, score: 0, ecoTax: 2, archTax: 1 }), 7, 'gross 10 = floor 1 + surplus 9; taxes 3 leave 6 + floor');
    eq(ubiAmountFor({ pool: 10, userW: 1, totalW: 1, score: 0, ecoTax: 50, archTax: 50 }), floor, 'taxes above the surplus stop at the floor');
    eq(ubiAmountFor({ pool: 100000, userW: 6, totalW: 1, score: 0, ecoTax: 0, archTax: 0 }), DEFAULT_RULES.caps.cap_user_epoch, 'the per-user cap holds');
  });

  t('a feed younger than 30 days is not eligible to be paid, even with a published address', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('banking').addAddress({ userId: A.keypair.id, address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42G' });
    A.node.publish({ type: 'post', text: 'hello' }, () => {});
    const el = await A.use('banking').isEligibleClaimant(A.keypair.id);
    eq(el.ok, false);
    ok(/30 days/.test(el.reason), el.reason);
  });

  t('interactions from a fresh feed do not raise anyone\'s karma', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    let postKey = null;
    A.node.publish({ type: 'post', text: 'content by A' }, (err, msg) => { postKey = msg && msg.key; });
    const before = await A.use('banking').getUserEngagementScore(A.keypair.id);
    for (let i = 0; i < 5; i++) B.node.publish({ type: 'vote', vote: { link: postKey, value: 1 } }, () => {});
    B.node.publish({ type: 'contact', contact: A.keypair.id, following: true }, () => {});
    const after = await A.use('banking').getUserEngagementScore(A.keypair.id);
    eq(after, before, 'votes and follows from a feed younger than 30 days are ignored');
  });

  t('PUB discovery prefers an available PUB over a fresher unavailable one', async () => {
    const net = makeNetwork(); const P1 = makePeer(net); const P2 = makePeer(net); const A = makePeer(net); A.setActor();
    P2.node.publish({ type: 'pubAvailability', coin: 'ECO', available: true, timestamp: Date.now() - 60000 }, () => {});
    P1.node.publish({ type: 'pubAvailability', coin: 'ECO', available: false, timestamp: Date.now() }, () => {});
    const found = await A.use('banking').discoverUbiPub();
    eq(found.pubId, P2.keypair.id);
    eq(found.available, true);
  });

  t('with nobody announcing, the default PUB from the invite file is used, marked unavailable', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const raw = require('../../../src/configs/snh-invite-code.json');
    const snh = (String(raw.code).match(/(@[A-Za-z0-9+/]+={0,2}\.ed25519)/) || [])[1];
    const found = await A.use('banking').discoverUbiPub();
    eq(found.pubId, snh);
    eq(found.available, false);
  });

  t('the UBI tab reports each PUB\'s last payment from its UBI transfers', async () => {
    const net = makeNetwork(); const P = makePeer(net); const A = makePeer(net); A.setActor();
    P.node.publish({ type: 'pubAvailability', coin: 'ECO', available: true, balance: 300, timestamp: Date.now() }, () => {});
    const now = new Date().toISOString();
    P.node.publish({ type: 'transfer', from: P.keypair.id, to: A.keypair.id, concept: 'OASIS UBI Payment · 2026-09', amount: '2.500000', createdAt: now, updatedAt: now, deadline: null, confirmedBy: [P.keypair.id], status: 'UNCONFIRMED', tags: ['UBI'], opinions: {}, opinions_inhabitants: [], txid: 'a'.repeat(64) }, () => {});
    const pubs = await A.use('banking').listUbiPubsDetailed();
    const row = pubs.find(p => p.pubId === P.keypair.id);
    ok(row, 'the announcing PUB is listed');
    eq(row.balance, 300);
    eq(row.payouts, 1);
    eq(row.paidOut, 2.5);
    ok(row.lastPayoutAt > 0);
  });
});


describe('banking: the UBI is claimed once per epoch', (t) => {
  const countClaims = (peer) => new Promise((resolve) => {
    const pull = require('../../../src/server/node_modules/pull-stream');
    let n = 0;
    pull(peer.node.messagesByType({ type: 'ubiClaim' }),
      pull.drain(msg => { if (msg.value?.content?.type === 'ubiClaim') n += 1; }, () => resolve(n)));
  });

  t('two claims sent at the same time leave a single claim in the feed', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const banking = A.use('banking');
    const results = await Promise.allSettled([banking.claimUBI(A.keypair.id), banking.claimUBI(A.keypair.id)]);
    eq(results.filter(r => r.status === 'fulfilled').length, 1, 'only one of the two goes through');
    eq(await countClaims(A), 1, 'and only one claim reaches the feed');
  });

  t('claiming again after the first one is refused', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const banking = A.use('banking');
    await banking.claimUBI(A.keypair.id);
    let failed = false;
    try { await banking.claimUBI(A.keypair.id); } catch (_) { failed = true; }
    ok(failed, 'the second claim is rejected');
    eq(await countClaims(A), 1, 'the feed still holds a single claim');
  });
});

describe('banking: only a PUB can say that the UBI was paid', (t) => {
  const epochNow = () => new Date().toISOString().slice(0, 7);
  const publish = (peer, content) => new Promise((res, rej) => peer.node.publish(content, (e, m) => e ? rej(e) : res(m)));

  t('a payment result published by an ordinary inhabitant is ignored', async () => {
    const net = makeNetwork(); const A = makePeer(net); const X = makePeer(net);
    X.setActor();
    await publish(X, { type: 'ubiClaimResult', allocationId: 'x', epochId: epochNow(), txid: 'f'.repeat(64), userId: A.keypair.id, amount: 50, processedAt: new Date().toISOString() });
    A.setActor();
    notOk(await A.use('banking').hasClaimedThisMonth(A.keypair.id), 'a forged result cannot block the claim');
    eq((await A.use('banking').getUbiClaimHistory(A.keypair.id)).claimCount, 0, 'nor count as income');
  });

  t('a payment result published by an announcing PUB is honoured', async () => {
    const net = makeNetwork(); const A = makePeer(net); const P = makePeer(net);
    P.setActor();
    await publish(P, { type: 'pubAvailability', coin: 'ECO', available: true, balance: 100, timestamp: Date.now() });
    await publish(P, { type: 'ubiClaimResult', allocationId: 'a', epochId: epochNow(), txid: 'a'.repeat(64), userId: A.keypair.id, amount: 50, processedAt: new Date().toISOString() });
    A.setActor();
    ok(await A.use('banking').hasClaimedThisMonth(A.keypair.id), 'the PUB result counts');
    eq((await A.use('banking').getUbiClaimHistory(A.keypair.id)).claimCount, 1, 'and shows up as income');
  });
});

describe('banking: the UBI can only be answered once per epoch', (t) => {
  const { renderBankingView } = require('../../../src/views/banking_views');
  const baseData = (summary) => ({
    summary: {
      userBalance: 0, epochId: '2026-09', pool: 100, userEngagementScore: 10, futureUBI: 1,
      pubId: '@pub.ed25519', hasValidWallet: true, addressPublished: true, ubiAvailability: 'OK',
      alreadyClaimed: false, alreadyRefused: false, wealthTotals: { distributed: 0, taxes: 0 },
      pubLastSeen: Date.now(), pubBalance: null, ...summary
    },
    exchange: { isSynced: true }, allocations: [], epochs: [], charts: {}, rules: {}, taxRules: {},
    alreadyClaimed: !!(summary || {}).alreadyClaimed, pendingUBI: null, isPub: false
  });
  const render = (summary, filter = 'ubi') => String(renderBankingView(baseData(summary), filter, '@me.ed25519', false));

  t('both buttons are offered in the UBI tab while the month is untouched', () => {
    const html = render({});
    ok(html.includes('/banking/claim-ubi'), 'claim is offered');
    ok(html.includes('/banking/refuse-ubi'), 'refuse is offered');
    const exchange = render({}, 'exchange');
    notOk(exchange.includes('/banking/claim-ubi'), 'and they do not show up anywhere else');
  });

  t('after claiming, neither button is offered again', () => {
    const html = render({ alreadyClaimed: true });
    notOk(html.includes('/banking/claim-ubi'), 'claim is gone');
    notOk(html.includes('/banking/refuse-ubi'), 'refuse is gone');
  });

  t('after refusing, neither button is offered again', () => {
    const html = render({ alreadyRefused: true });
    notOk(html.includes('/banking/claim-ubi'), 'claim is gone');
    notOk(html.includes('/banking/refuse-ubi'), 'refuse is gone');
  });
});

describe('banking: the epoch answer is remembered', (t) => {
  t('after claiming, the UBI is no longer offered', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const banking = A.use('banking');
    await banking.claimUBI(A.keypair.id);
    ok(await banking.hasClaimedThisMonth(A.keypair.id), 'the month is marked as claimed');
    eq((await banking.claimAvailability(A.keypair.id)).available, false, 'and nothing else is offered');
  });

  t('after refusing, claiming is refused too', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const banking = A.use('banking');
    await banking.refuseUBI(A.keypair.id);
    let failed = false;
    try { await banking.claimUBI(A.keypair.id); } catch (_) { failed = true; }
    ok(failed, 'claiming after refusing is rejected');
    ok(await banking.hasRefusedThisMonth(A.keypair.id), 'the refusal is remembered');
    eq((await banking.claimAvailability(A.keypair.id)).available, false, 'and nothing is offered');
  });
});

describe('banking: a wallet counts as configured only with its credentials', (t) => {
  t('url alone is not enough, url + user + password is', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const banking = A.use('banking');
    notOk(banking.hasWalletCredentials({ wallet: { url: 'http://localhost:7474', user: '', pass: '' } }), 'the default url is not a configured wallet');
    notOk(banking.hasWalletCredentials({ wallet: { url: '', user: 'u', pass: 'p' } }), 'credentials without a url are not either');
    ok(banking.hasWalletCredentials({ wallet: { url: 'http://localhost:7474', user: 'u', pass: 'p' } }), 'all three together are');
  });

  t('a published address without credentials does not offer the UBI', async () => {
    const net = makeNetwork(); const A = makePeer(net); const P = makePeer(net);
    P.setActor();
    await new Promise((res, rej) => P.node.publish({ type: 'pubAvailability', coin: 'ECO', available: true, balance: 100, timestamp: Date.now() }, (e) => e ? rej(e) : res()));
    A.setActor();
    await A.use('banking').setUserAddress(A.keypair.id, 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42E', true);
    const avail = await A.use('banking').claimAvailability(A.keypair.id);
    eq(avail.available, false);
    eq(avail.reason, 'no_wallet');
  });
});

describe('banking: exchange charts need a synced ECOin node', (t) => {
  const { renderBankingView } = require('../../../src/views/banking_views');
  const history = [{ ts: Date.now() - 3600000, currentSupply: 100, inflationFactor: 1 }, { ts: Date.now(), currentSupply: 101, inflationFactor: 1 }];
  const data = (isSynced) => ({
    summary: { userBalance: 0, epochId: '2026-09', pool: 0, userEngagementScore: 0, futureUBI: 0, pubId: '', hasValidWallet: false, addressPublished: false, ubiAvailability: 'OK', alreadyClaimed: false, alreadyRefused: false, wealthTotals: { distributed: 0, taxes: 0 }, pubLastSeen: 0, pubBalance: null },
    exchange: { isSynced, ecoValue: 1, currentSupply: 101, totalSupply: 25500000, ecoTimeMs: 0, inflationFactor: 1, inflationMonthly: 0, inflationIssuance: 0 },
    exchangeHistory: history, allocations: [], epochs: [], charts: {}, rules: {}, taxRules: {}, alreadyClaimed: false, pendingUBI: null, isPub: false
  });

  t('when the node is out of sync, the supply and inflation charts are not drawn', () => {
    const html = String(renderBankingView(data(false), 'exchange', '@me.ed25519', false));
    notOk(html.includes('eco-supply-chart-block'), 'no supply chart');
    notOk(html.includes('eco-inflation-chart-block'), 'no inflation chart');
  });

  t('when it is synced and there are samples, they are', () => {
    const html = String(renderBankingView(data(true), 'exchange', '@me.ed25519', false));
    ok(html.includes('eco-supply-chart-block'), 'supply chart present');
    ok(html.includes('eco-inflation-chart-block'), 'inflation chart present');
  });
});

describe('banking: an inhabitant can withdraw a published address', (t) => {
  t('after removing it, neither they nor the network resolve it any more, and it can be published again', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('banking').setUserAddress(A.keypair.id, 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42A', true);
    B.setActor();
    eq(await B.use('banking').getUserAddress(A.keypair.id), 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42A', 'a peer sees the published address');
    A.setActor();
    await A.use('banking').removeAddress({ userId: A.keypair.id });
    eq(await A.use('banking').getUserAddress(A.keypair.id), null, 'the owner no longer has it');
    notOk(await A.use('banking').hasPublishedAddress(A.keypair.id), 'and it is no longer published');
    B.setActor();
    eq(await B.use('banking').getUserAddress(A.keypair.id), null, 'nor does the peer');
    notOk(Object.keys(await B.use('banking').scanAllWalletsSSB()).includes(A.keypair.id), 'so nobody would donate to it');
    A.setActor();
    await A.use('banking').setUserAddress(A.keypair.id, 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42B', true);
    B.setActor();
    eq(await B.use('banking').getUserAddress(A.keypair.id), 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42B', 'a fresh address is picked up again');
  });
});
