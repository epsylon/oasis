const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const joinPub = (peer, pub) => new Promise((res, rej) => peer.node.publish({ type: 'contact', contact: pub.keypair.id, following: true, autofollow: true }, (e) => e ? rej(e) : peer.node.publish({ type: 'pub', address: { host: 'pub.example', port: 8008, key: pub.keypair.id } }, (e2) => e2 ? rej(e2) : res())));

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
    await joinPub(A, P1); await joinPub(A, P2);
    P2.node.publish({ type: 'pubAvailability', coin: 'ECO', available: true, timestamp: Date.now() - 60000 }, () => {});
    P1.node.publish({ type: 'pubAvailability', coin: 'ECO', available: false, timestamp: Date.now() }, () => {});
    const found = await A.use('banking').discoverUbiPub();
    eq(found.pubId, P2.keypair.id);
    eq(found.available, true);
  });

  t('a peer that only announces itself as a PUB is never offered, listed or used for the UBI', async () => {
    const net = makeNetwork(); const M = makePeer(net); const A = makePeer(net); A.setActor();
    M.node.publish({ type: 'pubAvailability', coin: 'ECO', available: true, balance: 900, address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42J', timestamp: Date.now() }, () => {});
    const found = await A.use('banking').discoverUbiPub();
    ok(found.pubId !== M.keypair.id, 'the self-announced PUB is not discovered');
    eq(found.available, false);
    ok(!(await A.use('banking').listUbiPubs()).some(p => p.pubId === M.keypair.id), 'nor listed to be funded');
    await A.use('banking').claimUBI(A.keypair.id).catch(() => null);
    const claims = net.log.filter(m => m.value.author === A.keypair.id && m.value.content.type === 'ubiClaim');
    ok(claims.every(m => m.value.content.pubId !== M.keypair.id), 'nor addressed by a claim');
  });

  t('a PUB the inhabitant left is no longer trusted', async () => {
    const net = makeNetwork(); const P = makePeer(net); const A = makePeer(net); A.setActor();
    await joinPub(A, P);
    P.node.publish({ type: 'pubAvailability', coin: 'ECO', available: true, balance: 900, timestamp: Date.now() }, () => {});
    eq((await A.use('banking').discoverUbiPub()).pubId, P.keypair.id, 'a joined PUB is used');
    A.node.publish({ type: 'contact', contact: P.keypair.id, following: false, blocking: true }, () => {});
    const B = makePeer(net, A.keypair); B.setActor();
    ok((await B.use('banking').discoverUbiPub()).pubId !== P.keypair.id, 'once left, it is not');
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
    await joinPub(A, P);
    P.node.publish({ type: 'pubAvailability', coin: 'ECO', available: true, balance: 300, address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42A', timestamp: Date.now() }, () => {});
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

  t('the UBI tab only lists PUBs that publish their ECOin address', async () => {
    const net = makeNetwork(); const P1 = makePeer(net); const P2 = makePeer(net); const A = makePeer(net); A.setActor();
    await joinPub(A, P1); await joinPub(A, P2);
    P1.node.publish({ type: 'pubAvailability', coin: 'ECO', available: true, balance: 50, address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42A', timestamp: Date.now() }, () => {});
    P2.node.publish({ type: 'pubAvailability', coin: 'ECO', available: true, balance: 50, timestamp: Date.now() }, () => {});
    const ids = (await A.use('banking').listUbiPubsDetailed()).map(p => p.pubId);
    ok(ids.includes(P1.keypair.id), 'a PUB with its address is listed');
    ok(!ids.includes(P2.keypair.id), 'a PUB without an address is not');
  });
});

describe('banking: the age of a feed counts from when this node received it', (t) => {
  const publish = (peer, content) => new Promise((res, rej) => peer.node.publish(content, (e, m) => e ? rej(e) : res(m)));
  const backdated = async (ms, fn) => {
    const realNow = Date.now;
    Date.now = () => realNow() - ms;
    try { return await fn(); } finally { Date.now = realNow; }
  };
  const arrivesNow = (receiver, author, claimedAgeMs, content) => new Promise((res, rej) => receiver.node.add({ previous: null, sequence: 1, author: author.keypair.id, timestamp: Date.now() - claimedAgeMs, hash: 'sha256', content, signature: 'mock-sig' }, (e, m) => e ? rej(e) : res(m)));

  t('a feed whose first message only claims to be old is not eligible to be paid', async () => {
    const net = makeNetwork(); const A = makePeer(net); const P = makePeer(net); P.setActor();
    await arrivesNow(P, A, 40 * 86400000, { type: 'post', text: 'an old hello, or so it says' });
    for (let i = 0; i < 3; i++) await publish(A, { type: 'post', text: `still here ${i}` });
    await publish(A, { type: 'wallet', coin: 'ECO', address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42H' });
    const el = await P.use('banking').isEligibleClaimant(A.keypair.id);
    eq(el.ok, false);
    ok(/30 days/.test(el.reason), el.reason);
  });

  t('votes from a feed that only claims to be old do not raise karma, votes from a feed received long ago do', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const post = await publish(A, { type: 'post', text: 'content by A' });
    const scoreSeenByNewcomer = async () => { const V = makePeer(net); V.setActor(); return V.use('banking').getUserEngagementScore(A.keypair.id); };
    const base = await scoreSeenByNewcomer();
    await arrivesNow(C, B, 40 * 86400000, { type: 'post', text: 'an old hello, or so it says' });
    await publish(B, { type: 'vote', vote: { link: post.key, value: 1 } });
    await publish(B, { type: 'contact', contact: A.keypair.id, following: true });
    eq(await scoreSeenByNewcomer(), base, 'a forged clock does not make the voter old enough');
    await backdated(40 * 86400000, () => publish(C, { type: 'post', text: 'a really old hello' }));
    await publish(C, { type: 'vote', vote: { link: post.key, value: 1 } });
    ok(await scoreSeenByNewcomer() > base, 'a voter this node has known for long does count');
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

  t('a payment result published by a PUB the inhabitant joined is honoured', async () => {
    const net = makeNetwork(); const A = makePeer(net); const P = makePeer(net);
    await joinPub(A, P);
    P.setActor();
    await publish(P, { type: 'pubAvailability', coin: 'ECO', available: true, balance: 100, timestamp: Date.now() });
    await publish(P, { type: 'ubiClaimResult', allocationId: 'a', epochId: epochNow(), txid: 'a'.repeat(64), userId: A.keypair.id, amount: 50, processedAt: new Date().toISOString() });
    A.setActor();
    ok(await A.use('banking').hasClaimedThisMonth(A.keypair.id), 'the PUB result counts');
    eq((await A.use('banking').getUbiClaimHistory(A.keypair.id)).claimCount, 1, 'and shows up as income');
  });

  t('a payment result published by a peer that only announces itself as a PUB is ignored', async () => {
    const net = makeNetwork(); const A = makePeer(net); const M = makePeer(net);
    M.setActor();
    await publish(M, { type: 'pubAvailability', coin: 'ECO', available: true, balance: 100, timestamp: Date.now() });
    await publish(M, { type: 'ubiClaimResult', allocationId: 'm', epochId: epochNow(), txid: 'e'.repeat(64), userId: A.keypair.id, amount: 50, processedAt: new Date().toISOString() });
    A.setActor();
    notOk(await A.use('banking').hasClaimedThisMonth(A.keypair.id), 'announcing is not enough to block the claim');
    eq((await A.use('banking').getUbiClaimHistory(A.keypair.id)).claimCount, 0, 'nor to count as income');
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
    await joinPub(A, P);
    P.setActor();
    await new Promise((res, rej) => P.node.publish({ type: 'pubAvailability', coin: 'ECO', available: true, balance: 100, timestamp: Date.now() }, (e) => e ? rej(e) : res()));
    A.setActor();
    await A.use('banking').setUserAddress(A.keypair.id, 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42E', true);
    const avail = await A.use('banking').claimAvailability(A.keypair.id);
    eq(avail.available, false);
    eq(avail.reason, 'no_wallet');
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

describe('banking: a PUB pays each UBI claim once, and only its own', (t) => {
  const http = require('http');
  const crypto = require('crypto');
  const fs = require('fs');
  const path = require('path');
  const { realConfig, setTestWallet } = require('../../helpers/setup');
  const epochNow = () => new Date().toISOString().slice(0, 7);
  const publish = (peer, content) => new Promise((res, rej) => peer.node.publish(content, (e, m) => e ? rej(e) : res(m)));
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const randomAddress = () => 'E' + Array.from(crypto.randomBytes(33), b => B58[b % B58.length]).join('');
  const ledgerPath = () => path.join(process.env.OASIS_BANKING_DIR, 'banking-ubi-paid.json');

  const fakeWallet = (opts = {}) => new Promise((resolve) => {
    const state = { sends: [...(opts.preload || [])], dropAnswers: opts.dropAnswers || 0, failSends: opts.failSends || 0, sendCalls: 0 };
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const { method, params } = JSON.parse(body || '{}');
        const reply = (result, error = null) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ result, error, id: 'oasis' })); };
        if (method === 'getbalance') return reply(opts.balance ?? 1000);
        if (method === 'listtransactions') return reply(state.sends.slice());
        if (method === 'sendtoaddress') {
          state.sendCalls += 1;
          if (state.failSends > 0) { state.failSends -= 1; return reply(null, { code: -6, message: 'Insufficient funds' }); }
          const txid = crypto.randomBytes(32).toString('hex');
          state.sends.push({ category: 'send', address: params[0], amount: -Number(params[1]), comment: params[2], txid, time: Math.floor(Date.now() / 1000) });
          if (state.dropAnswers > 0) { state.dropAnswers -= 1; req.socket.destroy(); return; }
          return reply(txid);
        }
        return reply(null, { code: -32601, message: 'Method not found' });
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise(r => server.close(r)) }));
  });

  const backdated = async (ms, fn) => {
    const realNow = Date.now;
    Date.now = () => realNow() - ms;
    try { return await fn(); } finally { Date.now = realNow; }
  };

  const makeClaimant = async (net, address = randomAddress()) => {
    const A = makePeer(net);
    await backdated(40 * 86400000, () => publish(A, { type: 'post', text: 'an old hello' }));
    for (let i = 0; i < 3; i++) await publish(A, { type: 'post', text: `still here ${i}` });
    await publish(A, { type: 'wallet', coin: 'ECO', address });
    return { A, address };
  };

  const claim = (A, pubId, ageMs = 0) => backdated(ageMs, () => publish(A, { type: 'ubiClaim', pubId, epochId: epochNow(), claimedAt: new Date(Date.now()).toISOString() }));

  const runAsPub = async (P, wallet, fn) => {
    const prevPub = realConfig.pub;
    realConfig.pub = true;
    setTestWallet({ url: wallet.url, user: 'u', pass: 'p', fee: '5' });
    P.setActor();
    try { return await fn(P.use('banking')); } finally { realConfig.pub = prevPub; setTestWallet(null); }
  };

  const results = (peer, userId) => new Promise((resolve) => {
    const pull = require('../../../src/server/node_modules/pull-stream');
    const out = [];
    pull(peer.node.messagesByType({ type: 'ubiClaimResult' }),
      pull.drain(m => { const c = m.value && m.value.content; if (c && c.userId === userId) out.push(c); }, () => resolve(out)));
  });

  t('a PUB pays a claim addressed to it exactly once, however many times it runs', async () => {
    const net = makeNetwork(); const P = makePeer(net);
    const { A, address } = await makeClaimant(net);
    await claim(A, P.keypair.id);
    const wallet = await fakeWallet();
    try {
      await runAsPub(P, wallet, async (bank) => { await bank.processPendingClaims(); await bank.processPendingClaims(); });
      eq(wallet.state.sends.filter(s => s.address === address).length, 1, 'one payment reaches the inhabitant');
      eq((await results(P, A.keypair.id)).length, 1, 'and one payment result is published');
    } finally { await wallet.close(); }
  });

  t('a claim for the previous month is paid once, even repeated with a new address', async () => {
    const net = makeNetwork(); const P = makePeer(net);
    const { A, address } = await makeClaimant(net);
    const [y, mo] = epochNow().split('-').map(Number);
    const prev = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
    const claimFor = (epochId) => publish(A, { type: 'ubiClaim', pubId: P.keypair.id, epochId, claimedAt: new Date().toISOString() });
    await claimFor(prev);
    const wallet = await fakeWallet();
    try {
      await runAsPub(P, wallet, (bank) => bank.processPendingClaims());
      const second = randomAddress();
      await publish(A, { type: 'wallet', coin: 'ECO', address: second });
      await claimFor(prev);
      await runAsPub(P, wallet, (bank) => bank.processPendingClaims());
      eq(wallet.state.sends.filter(s => s.address === address || s.address === second).length, 1, 'that month is paid only once');
    } finally { await wallet.close(); }
  });

  t('a PUB leaves alone a fresh claim addressed to another PUB', async () => {
    const net = makeNetwork(); const P = makePeer(net); const Other = makePeer(net);
    const { A, address } = await makeClaimant(net);
    await claim(A, Other.keypair.id);
    const wallet = await fakeWallet();
    try {
      await runAsPub(P, wallet, (bank) => bank.processPendingClaims());
      eq(wallet.state.sendCalls, 0, 'nothing is sent');
      eq(wallet.state.sends.filter(s => s.address === address).length, 0);
    } finally { await wallet.close(); }
  });

  t('when the wallet sends but its answer is lost, the payment is found and not repeated', async () => {
    const net = makeNetwork(); const P = makePeer(net);
    const { A, address } = await makeClaimant(net);
    await claim(A, P.keypair.id);
    const wallet = await fakeWallet({ dropAnswers: 1 });
    try {
      await runAsPub(P, wallet, async (bank) => { await bank.processPendingClaims(); await bank.processPendingClaims(); });
      const paid = wallet.state.sends.filter(s => s.address === address);
      eq(paid.length, 1, 'a single payment went out');
      const res = await results(P, A.keypair.id);
      eq(res.length, 1, 'the payment is recorded');
      eq(res[0].txid, paid[0].txid, 'with the txid the wallet really used');
    } finally { await wallet.close(); }
  });

  t('a payment that failed is retried later, once the wallet shows nothing went out', async () => {
    const net = makeNetwork(); const P = makePeer(net);
    const { A, address } = await makeClaimant(net);
    await claim(A, P.keypair.id);
    const wallet = await fakeWallet({ failSends: 1 });
    try {
      await runAsPub(P, wallet, (bank) => bank.processPendingClaims());
      eq(wallet.state.sends.filter(s => s.address === address).length, 0, 'the first attempt sent nothing');
      await runAsPub(P, wallet, (bank) => bank.processPendingClaims());
      eq(wallet.state.sendCalls, 1, 'it is not retried straight away');
      const key = `${epochNow()}:${A.keypair.id}`;
      const ledger = JSON.parse(fs.readFileSync(ledgerPath(), 'utf8'));
      ledger[key].lastAttemptAt = new Date(Date.now() - 2 * 3600000).toISOString();
      fs.writeFileSync(ledgerPath(), JSON.stringify(ledger));
      await runAsPub(P, wallet, (bank) => bank.processPendingClaims());
      eq(wallet.state.sends.filter(s => s.address === address).length, 1, 'later it is paid once');
      eq((await results(P, A.keypair.id)).length, 1);
    } finally { await wallet.close(); }
  });

  t('a UBI payment already in the wallet this month is recorded instead of paid again', async () => {
    const net = makeNetwork(); const P = makePeer(net);
    const address = randomAddress();
    const { A } = await makeClaimant(net, address);
    await claim(A, P.keypair.id);
    const txid = 'b'.repeat(64);
    const wallet = await fakeWallet({ preload: [{ category: 'send', address, amount: -3, comment: 'OASIS UBI Payment', txid, time: Math.floor(Date.now() / 1000) - 60 }] });
    try {
      await runAsPub(P, wallet, (bank) => bank.processPendingClaims());
      eq(wallet.state.sendCalls, 0, 'nothing new is sent');
      const res = await results(P, A.keypair.id);
      eq(res.length, 1);
      eq(res[0].txid, txid, 'the earlier payment is the one recorded');
    } finally { await wallet.close(); }
  });

  t('a rebalance whose answer is lost is recorded once and not sent again', async () => {
    const net = makeNetwork(); const P = makePeer(net); const Q = makePeer(net);
    const qAddress = randomAddress();
    await publish(Q, { type: 'pubAvailability', coin: 'ECO', available: false, balance: 0, address: qAddress, timestamp: Date.now() });
    await publish(P, { type: 'contact', contact: Q.keypair.id, following: true });
    for (let i = 0; i < 3; i++) { const { A } = await makeClaimant(net); await claim(A, Q.keypair.id); }
    const wallet = await fakeWallet({ balance: 100000, dropAnswers: 1 });
    const transfersToQ = () => new Promise((resolve) => {
      const pull = require('../../../src/server/node_modules/pull-stream');
      let n = 0;
      pull(P.node.messagesByType({ type: 'transfer' }), pull.drain(m => { const c = m.value && m.value.content; if (c && c.to === Q.keypair.id) n += 1; }, () => resolve(n)));
    });
    try {
      await runAsPub(P, wallet, async (bank) => { await bank.rebalanceUbiPools(); await bank.rebalanceUbiPools(); });
      eq(wallet.state.sends.filter(s => s.address === qAddress).length, 1, 'a single rebalance went out');
      eq(await transfersToQ(), 1, 'and it is recorded once');
    } finally { await wallet.close(); }
  });

  t('the default PUB takes over a claim another PUB left unpaid for days, but not a fresh one', async () => {
    const net = makeNetwork(); const P = makePeer(net); const Other = makePeer(net);
    const fresh = await makeClaimant(net);
    const stale = await makeClaimant(net);
    await claim(fresh.A, Other.keypair.id);
    await claim(stale.A, Other.keypair.id, 4 * 86400000);
    const realRead = fs.readFileSync;
    fs.readFileSync = function (p, ...rest) {
      if (String(p).endsWith('snh-invite-code.json')) return JSON.stringify({ code: `pub.example:8008:${P.keypair.id}~invite` });
      return realRead.call(this, p, ...rest);
    };
    const wallet = await fakeWallet();
    try {
      await runAsPub(P, wallet, (bank) => bank.processPendingClaims());
      eq(wallet.state.sends.filter(s => s.address === fresh.address).length, 0, 'a fresh claim stays with its PUB');
      eq(wallet.state.sends.filter(s => s.address === stale.address).length, 1, 'an old unpaid one is paid by the default PUB');
    } finally { fs.readFileSync = realRead; await wallet.close(); }
  });

  t('the default PUB does not pay again a claim that the PUB it was addressed to already paid', async () => {
    const net = makeNetwork(); const P = makePeer(net); const Other = makePeer(net);
    const stale = await makeClaimant(net);
    await claim(stale.A, Other.keypair.id, 4 * 86400000);
    await publish(Other, { type: 'ubiClaimResult', allocationId: 'o', epochId: epochNow(), txid: 'd'.repeat(64), userId: stale.A.keypair.id, amount: 5, processedAt: new Date().toISOString() });
    const realRead = fs.readFileSync;
    fs.readFileSync = function (p, ...rest) {
      if (String(p).endsWith('snh-invite-code.json')) return JSON.stringify({ code: `pub.example:8008:${P.keypair.id}~invite` });
      return realRead.call(this, p, ...rest);
    };
    const wallet = await fakeWallet();
    try {
      await runAsPub(P, wallet, (bank) => bank.processPendingClaims());
      eq(wallet.state.sendCalls, 0, 'the result of the addressed PUB is enough');
    } finally { fs.readFileSync = realRead; await wallet.close(); }
  });

  t('a PUB still pays a claimant when a peer that only announces itself as a PUB says it already did', async () => {
    const net = makeNetwork(); const P = makePeer(net); const M = makePeer(net);
    const { A, address } = await makeClaimant(net);
    await claim(A, P.keypair.id);
    await publish(M, { type: 'pubAvailability', coin: 'ECO', available: true, balance: 900, timestamp: Date.now() });
    await publish(M, { type: 'ubiClaimResult', allocationId: 'm', epochId: epochNow(), txid: 'e'.repeat(64), userId: A.keypair.id, amount: 50, processedAt: new Date().toISOString() });
    const wallet = await fakeWallet();
    try {
      await runAsPub(P, wallet, (bank) => bank.processPendingClaims());
      eq(wallet.state.sends.filter(s => s.address === address).length, 1, 'the forged result does not stop the payment');
    } finally { await wallet.close(); }
  });

  t('a self-announced PUB that this PUB follows only because it used one of its invites gets no rebalance and no say', async () => {
    const net = makeNetwork(); const P = makePeer(net); const Q = makePeer(net);
    const qAddress = randomAddress();
    await publish(Q, { type: 'pubAvailability', coin: 'ECO', available: false, balance: 0, address: qAddress, timestamp: Date.now() });
    await publish(P, { type: 'contact', contact: Q.keypair.id, following: true, pub: true });
    const { A, address } = await makeClaimant(net);
    await claim(A, P.keypair.id);
    await publish(Q, { type: 'ubiClaimResult', allocationId: 'q', epochId: epochNow(), txid: 'c'.repeat(64), userId: A.keypair.id, amount: 50, processedAt: new Date().toISOString() });
    for (let i = 0; i < 3; i++) { const c = await makeClaimant(net); await claim(c.A, Q.keypair.id); }
    const wallet = await fakeWallet({ balance: 100000 });
    try {
      await runAsPub(P, wallet, (bank) => bank.rebalanceUbiPools());
      eq(wallet.state.sends.filter(s => s.address === qAddress).length, 0, 'nothing is sent to it');
      await runAsPub(P, wallet, (bank) => bank.processPendingClaims());
      eq(wallet.state.sends.filter(s => s.address === address).length, 1, 'and its result does not stop a payment');
    } finally { await wallet.close(); }
  });

  t('a PUB does not pay a feed whose first message only claims to be old', async () => {
    const net = makeNetwork(); const P = makePeer(net); const A = makePeer(net);
    const address = randomAddress();
    await new Promise((res, rej) => P.node.add({ previous: null, sequence: 1, author: A.keypair.id, timestamp: Date.now() - 40 * 86400000, hash: 'sha256', content: { type: 'post', text: 'an old hello, or so it says' }, signature: 'mock-sig' }, (e) => e ? rej(e) : res()));
    for (let i = 0; i < 3; i++) await publish(A, { type: 'post', text: `still here ${i}` });
    await publish(A, { type: 'wallet', coin: 'ECO', address });
    await claim(A, P.keypair.id);
    const wallet = await fakeWallet();
    try {
      await runAsPub(P, wallet, (bank) => bank.processPendingClaims());
      eq(wallet.state.sendCalls, 0, 'the feed is as young as its arrival');
    } finally { await wallet.close(); }
  });

  t('a PUB whose wallet is down to its reserve pays nothing and does not announce itself as available', async () => {
    const net = makeNetwork(); const P = makePeer(net);
    const { A } = await makeClaimant(net);
    await claim(A, P.keypair.id);
    const wallet = await fakeWallet({ balance: P.use('banking').DEFAULT_RULES.reserveMin });
    try {
      await runAsPub(P, wallet, async (bank) => { await bank.processPendingClaims(); await bank.publishPubAvailability(); });
      eq(wallet.state.sendCalls, 0, 'the reserve is not spent');
      eq((await results(P, A.keypair.id)).length, 0);
      const announced = net.log.filter(m => m.value.author === P.keypair.id && m.value.content.type === 'pubAvailability').pop();
      eq(announced.value.content.available, false);
    } finally { await wallet.close(); }
  });

  t('two inhabitants sharing one address are paid once in the epoch', async () => {
    const net = makeNetwork(); const P = makePeer(net);
    const shared = randomAddress();
    const one = await makeClaimant(net, shared);
    const two = await makeClaimant(net, shared);
    await claim(one.A, P.keypair.id);
    await claim(two.A, P.keypair.id);
    const wallet = await fakeWallet();
    try {
      await runAsPub(P, wallet, async (bank) => { await bank.processPendingClaims(); await bank.processPendingClaims(); });
      eq(wallet.state.sends.filter(s => s.address === shared).length, 1, 'the shared address is paid once');
    } finally { await wallet.close(); }
  });

  t('an address another trusted PUB already paid this epoch is not paid again elsewhere', async () => {
    const net = makeNetwork(); const P1 = makePeer(net); const P2 = makePeer(net);
    const shared = randomAddress();
    const one = await makeClaimant(net, shared);
    const two = await makeClaimant(net, shared);
    await publish(P2, { type: 'contact', contact: P1.keypair.id, following: true });
    await claim(one.A, P1.keypair.id);
    await claim(two.A, P2.keypair.id);
    const w1 = await fakeWallet();
    const w2 = await fakeWallet();
    try {
      await runAsPub(P1, w1, async (bank) => { await bank.processPendingClaims(); });
      eq(w1.state.sends.filter(s => s.address === shared).length, 1, 'the first PUB pays');
      try { fs.unlinkSync(ledgerPath()); } catch (_) {}
      await runAsPub(P2, w2, async (bank) => { await bank.processPendingClaims(); });
      eq(w2.state.sends.filter(s => s.address === shared).length, 0, 'the second PUB sees the published payment to that address');
    } finally { await w1.close(); await w2.close(); }
  });

  t('an allocation is not paid out of the reserve, nor twice to one address in an epoch', async () => {
    const net = makeNetwork(); const P = makePeer(net);
    const shared = randomAddress();
    const one = await makeClaimant(net, shared);
    const two = await makeClaimant(net, shared);
    const opts = { balance: P.use('banking').DEFAULT_RULES.reserveMin };
    const wallet = await fakeWallet(opts);
    const refused = async (fn) => { try { await fn(); return false; } catch (_) { return true; } };
    try {
      await runAsPub(P, wallet, async (bank) => {
        await bank.executeEpoch({ epochId: '2099-01' });
        ok(await refused(() => bank.claimAllocation({ transferId: `alloc:2099-01:${one.A.keypair.id}` })), 'at the reserve the allocation is refused');
        eq(wallet.state.sendCalls, 0, 'and nothing is sent');
        opts.balance = 100000;
        await bank.claimAllocation({ transferId: `alloc:2099-01:${one.A.keypair.id}` });
        ok(await refused(() => bank.claimAllocation({ transferId: `alloc:2099-01:${two.A.keypair.id}` })), 'a second inhabitant with the same address is refused');
      });
      eq(wallet.state.sends.filter(s => s.address === shared).length, 1, 'the address is paid once');
    } finally { await wallet.close(); }
  });
});

describe('banking: an incoming transfer is confirmed only by a real receive in the wallet', (t) => {
  const http = require('http');
  const { setTestWallet } = require('../../helpers/setup');
  const publish = (peer, content) => new Promise((res, rej) => peer.node.publish(content, (e, m) => e ? rej(e) : res(m)));
  const future = () => new Date(Date.now() + 30 * 86400000).toISOString();
  const tx = (ch) => ch.repeat(64);
  const receive = (amount, address = 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42A') => ({ confirmations: 3, details: [{ category: 'receive', amount, address }] });

  const wallet = (txs) => new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const { method, params } = JSON.parse(body || '{}');
        const found = method === 'gettransaction' ? txs[params[0]] : null;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(found ? { result: found, error: null, id: 'oasis' } : { result: null, error: { code: -5, message: 'Invalid or non-wallet transaction id' }, id: 'oasis' }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) }));
  });

  const confirmAs = async (B, txs) => {
    const w = await wallet(txs);
    setTestWallet({ url: w.url, user: 'u', pass: 'p', fee: '5' });
    B.setActor();
    try { return await require('../../../src/models/banking_model')({ services: { cooler: B.cooler, transfers: B.use('transfers') } }).confirmIncomingTransfers(); }
    finally { setTestWallet(null); await w.close(); }
  };

  const statusOf = async (B, key) => (await B.use('transfers').getTransferById(key)).status;

  t('a payment that reached the wallet confirms the transfer', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('transfers').createTransfer(B.keypair.id, `paid · tx ${tx('a')}`, '10', future(), ['WALLET']);
    eq((await confirmAs(B, { [tx('a')]: receive(10) })).length, 1);
    eq(await statusOf(B, r.key), 'CLOSED');
  });

  t('a send, a smaller receive or an unconfirmed tx does not confirm it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const send = await A.use('transfers').createTransfer(B.keypair.id, `send · tx ${tx('b')}`, '10', future(), []);
    const small = await A.use('transfers').createTransfer(B.keypair.id, `small · tx ${tx('c')}`, '10', future(), []);
    const fresh = await A.use('transfers').createTransfer(B.keypair.id, `fresh · tx ${tx('d')}`, '10', future(), []);
    const txs = { [tx('b')]: { confirmations: 3, details: [{ category: 'send', amount: -10, address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42A' }] }, [tx('c')]: receive(1), [tx('d')]: { ...receive(10), confirmations: 0 } };
    eq((await confirmAs(B, txs)).length, 0);
    for (const r of [send, small, fresh]) eq(await statusOf(B, r.key), 'UNCONFIRMED');
  });

  t('a transfer naming another destination address is not confirmed by a receive elsewhere', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const now = new Date().toISOString();
    const r = await publish(A, { type: 'transfer', from: A.keypair.id, to: B.keypair.id, concept: `addr · tx ${tx('e')}`, amount: '10.000000', category: 'ECONOMIC', createdAt: now, updatedAt: now, deadline: future(), confirmedBy: [A.keypair.id], status: 'UNCONFIRMED', tags: [], opinions: {}, opinions_inhabitants: [], address: 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42Z' });
    eq((await confirmAs(B, { [tx('e')]: receive(10) })).length, 0);
    eq(await statusOf(B, r.key), 'UNCONFIRMED');
  });

  t('a transfer published in the payer name by someone else is never confirmed', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const now = new Date().toISOString();
    await publish(C, { type: 'transfer', from: A.keypair.id, to: B.keypair.id, concept: `forged · tx ${tx('f')}`, amount: '10.000000', category: 'ECONOMIC', createdAt: now, updatedAt: now, deadline: future(), confirmedBy: [A.keypair.id], status: 'UNCONFIRMED', tags: [], opinions: {}, opinions_inhabitants: [] });
    eq((await confirmAs(B, { [tx('f')]: receive(10) })).length, 0);
    eq(net.log.filter(m => m.value.content.type === 'transferConfirm').length, 0, 'nothing is published');
  });

  t('one txid never confirms two different transfers', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const first = await A.use('transfers').createTransfer(B.keypair.id, `rent · tx ${tx('1')}`, '10', future(), []);
    eq((await confirmAs(B, { [tx('1')]: receive(10) })).length, 1);
    C.setActor();
    const copy = await C.use('transfers').createTransfer(B.keypair.id, `me too · tx ${tx('1')}`, '10', future(), []);
    eq((await confirmAs(B, { [tx('1')]: receive(10) })).length, 0, 'an already used txid is not reused');
    eq(await statusOf(B, first.key), 'CLOSED');
    eq(await statusOf(B, copy.key), 'UNCONFIRMED');
    A.setActor();
    const p1 = await A.use('transfers').createTransfer(B.keypair.id, `twin · tx ${tx('2')}`, '5', future(), []);
    C.setActor();
    const p2 = await C.use('transfers').createTransfer(B.keypair.id, `twin too · tx ${tx('2')}`, '5', future(), []);
    eq((await confirmAs(B, { [tx('2')]: receive(5) })).length, 0, 'a txid claimed by two pending transfers confirms neither');
    eq(await statusOf(B, p1.key), 'UNCONFIRMED');
    eq(await statusOf(B, p2.key), 'UNCONFIRMED');
  });
});
