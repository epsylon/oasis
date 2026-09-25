const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const intents = require('../../../src/AI/intents');
const guardsPath = '../../../src/AI/';

describe('ai: questions about the network are answered from live data, not from the model', (t) => {
  const me = '@' + 'm'.repeat(43) + '=.ed25519';
  const other = '@' + 'o'.repeat(43) + '=.ed25519';
  const hrefFor = (type, id) => `/${type}/${id}`;
  const sharedState = { getInboxPmCount: () => 2, getInboxNotifCount: () => 3, getMentionsCount: () => 1, getInhabitantCount: () => 61, getTribesCount: () => 4, getOnlinePeerCount: () => 2, getLastSyncTs: () => 0, getEcoValue: () => '0.1234' };

  t('an intent is recognised from keywords in several languages', () => {
    eq(intents.detectByKeywords('¿cuánto saldo tengo?'), 'funds');
    eq(intents.detectByKeywords('can I claim my UBI this month?'), 'ubi');
    eq(intents.detectByKeywords('who follows me'), 'relationships');
    eq(intents.detectByKeywords('quién gobierna ahora'), 'government');
    eq(intents.detectByKeywords('What is, right now, the value of 1 ECO?'), 'exchange');
    eq(intents.detectByKeywords('¿cuánto vale un ECO ahora?'), 'exchange');
    eq(intents.detectByKeywords('tell me a story about a dragon'), null);
    eq(intents.detectByKeywords('what do the shops sell?'), 'shops');
    eq(intents.detectByKeywords('¿qué hay en el mercado?'), 'market');
    eq(intents.detectByKeywords('which modules are enabled?'), 'modules');
    eq(intents.detectByKeywords('¿qué puedes hacer?'), 'help');
  });

  t('every intent has a runner and a runner never throws on an empty node', async () => {
    const empty = new Proxy({}, { get: () => new Proxy({}, { get: () => async () => [] }) });
    for (const it of intents.INTENTS) {
      ok(typeof intents.RUNNERS[it.key] === 'function', `runner for ${it.key}`);
      const facts = await intents.run(it.key, { models: empty, me, sharedState, hrefFor, nameOf: async (id) => id, version: '1', config: { modules: { aiMod: 'on', wikiMod: 'off' } } });
      ok(Array.isArray(facts) && facts.length > 0, `${it.key} answers something`);
      ok(facts.every(f => typeof f.text === 'string' && (f.href === null || String(f.href).startsWith('/'))), `${it.key} facts are text plus local links`);
    }
  });

  t('the ECO value comes from the exchange, and says so when the wallet is not synced', async () => {
    const synced = { banking: { listBanking: async () => ({ exchange: { isSynced: true, ecoValue: 0.25, ecoTimeMs: 4 * 3600000, totalSupply: 1000, currentSupply: 900, inflationFactor: 12, inflationMonthly: 1, pubsSupply: 10, holdingSupply: 890 } }) } };
    const facts = await intents.run('exchange', { models: synced, me, sharedState, hrefFor });
    ok(/Value of 1 ECO right now: 0\.2500/.test(facts[0].text) && /4\.00 hours/.test(facts[0].text));
    ok(facts.every(f => f.href === '/banking?filter=exchange'));
    const unsynced = { banking: { listBanking: async () => ({ exchange: { isSynced: false } }) } };
    const none = await intents.run('exchange', { models: unsynced, me, sharedState, hrefFor });
    ok(/not synced/.test(none[0].text));
  });

  t('funds come from banking, with the wallet state and the published address', async () => {
    const models = {
      banking: {
        listBanking: async () => ({ summary: { hasValidWallet: true, userBalance: 12.5, industryBalance: 0 }, exchange: { isSynced: true, ecoValue: 0.25 } }),
        getUserAddress: async () => 'EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42A'
      }
    };
    const facts = await intents.run('funds', { models, me, sharedState, hrefFor });
    ok(facts.some(f => /12\.500000 ECO/.test(f.text)), 'balance listed');
    ok(facts.some(f => /EQXcDugPjmxZyGpv6mC6jo2mEBpLDnw42A/.test(f.text)), 'address listed');
    ok(facts.every(f => typeof f.text === 'string' && (f.href === null || f.href.startsWith('/'))), 'every fact is text plus a local link');
  });

  t('the UBI status reflects claimed, refused or available', async () => {
    const mk = (summary, pendingUBI) => ({
      banking: { listBanking: async () => ({ summary, pendingUBI, ubiPubs: [{}] }), getBankingData: async () => ({ estimatedUBI: 1.5, totalClaimed: 3, lastClaimedDate: '2026-08-01T00:00:00Z' }) }
    });
    const claimed = await intents.run('ubi', { models: mk({ epochId: '2026-09', alreadyClaimed: true }, null), me, sharedState, hrefFor });
    ok(claimed.some(f => /already claimed/.test(f.text)));
    const available = await intents.run('ubi', { models: mk({ epochId: '2026-09' }, { amount: 2 }), me, sharedState, hrefFor });
    ok(available.some(f => /2\.000000 ECO available/.test(f.text)));
    const refused = await intents.run('ubi', { models: mk({ epochId: '2026-09', alreadyRefused: true }, null), me, sharedState, hrefFor });
    ok(refused.some(f => /refused/.test(f.text)));
  });

  t('only my open tasks and my unconfirmed transfers are reported', async () => {
    const models = {
      tasks: { listAll: async () => [
        { id: 't1', title: 'mine', status: 'OPEN', author: me, assignees: [] },
        { id: 't2', title: 'assigned', status: 'OPEN', author: other, assignees: [me] },
        { id: 't3', title: 'closed', status: 'CLOSED', author: me, assignees: [] },
        { id: 't4', title: 'not mine', status: 'OPEN', author: other, assignees: [other] }
      ] },
      transfers: { listAll: async () => [
        { id: 'x1', from: other, to: me, amount: 1, concept: 'waiting', status: 'UNCONFIRMED', confirmedBy: [other] },
        { id: 'x2', from: other, to: me, amount: 1, concept: 'done', status: 'UNCONFIRMED', confirmedBy: [other, me] },
        { id: 'x3', from: other, to: other, amount: 1, concept: 'foreign', status: 'UNCONFIRMED', confirmedBy: [] }
      ] }
    };
    const tasks = await intents.run('tasks', { models, me, sharedState, hrefFor });
    eq(tasks.map(f => f.text.split(' ')[0]).join(), 'mine,assigned');
    const transfers = await intents.run('transfers', { models, me, sharedState, hrefFor });
    eq(transfers.length, 1);
    ok(/waiting/.test(transfers[0].text) && transfers[0].href === '/transfer/x1');
  });

  t('relationships are split into mutual, following and followers', async () => {
    const users = [{ id: other, name: 'Other' }, { id: '@' + 'p'.repeat(43) + '=.ed25519', name: 'Pat' }, { id: '@' + 'q'.repeat(43) + '=.ed25519', name: 'Quinn' }, { id: me, name: 'Me' }];
    const rels = { [other]: { following: true, followsMe: true }, [users[1].id]: { following: true, followsMe: false }, [users[2].id]: { following: false, followsMe: true } };
    const models = { inhabitants: { listInhabitants: async () => users }, friend: { getRelationship: async (id) => rels[id] } };
    const facts = await intents.run('relationships', { models, me, sharedState, hrefFor });
    ok(/Mutual contacts: 1 · Other/.test(facts[0].text));
    ok(/You follow: 2 · also Pat/.test(facts[1].text));
    ok(/Follow you: 2 · also Quinn/.test(facts[2].text));
  });

  t('counters come straight from the shared state', async () => {
    const inbox = await intents.run('inbox', { sharedState, me, hrefFor, models: {} });
    ok(/messages: 2/.test(inbox[0].text) && /notifications: 3/.test(inbox[1].text) && /mentions: 1/.test(inbox[2].text));
    const network = await intents.run('network', { sharedState, me, hrefFor, models: {} });
    ok(/Inhabitants: 61/.test(network[0].text) && /never/.test(network[3].text));
  });

  t('a failing model never breaks the answer: the runner returns null', async () => {
    const models = { events: { listAll: async () => { throw new Error('boom'); } } };
    const facts = await intents.run('events', { models, me, sharedState, hrefFor });
    ok(Array.isArray(facts) && /none upcoming/.test(facts[0].text));
    eq(await intents.run('nope', {}), null);
  });
});

describe('ai: the network knowledge is ranked before it reaches the model', (t) => {
  const vecFor = (text) => {
    const v = new Array(8).fill(0);
    for (const w of String(text).toLowerCase().split(/\W+/)) { if (!w) continue; let h = 0; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % 8; v[h] += 1; }
    const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
    return v.map(x => x / n);
  };
  const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  const embed = async (t) => vecFor(t);

  t('approved exchanges close to the question come first, votes and rating break ties', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ctxMod = require(guardsPath + 'buildAIContext.js');
    ctxMod.useCooler(A.cooler);
    await ctxMod.publishExchange({ q: 'what is the UBI in oasis', a: 'A monthly income paid by PUBs', rating: 5 });
    await ctxMod.publishExchange({ q: 'what is the UBI in oasis', a: 'Something vague', rating: 1 });
    await ctxMod.publishExchange({ q: 'how do I bake bread', a: 'With flour', rating: 5 });
    const ranked = await ctxMod.rankExchanges('what is the UBI in oasis', { embed, cosine, k: 5 });
    ok(ranked.length >= 2, 'the two UBI answers are found');
    eq(ranked[0].answer, 'A monthly income paid by PUBs', 'the best rated identical question wins');
    ok(!ranked.some(x => /bread/.test(x.question)) || ranked.findIndex(x => /bread/.test(x.question)) > 1, 'unrelated knowledge does not come first');
  });

  t('a nearly identical approved question is answered directly, a loosely related one is not', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ctxMod = require(guardsPath + 'buildAIContext.js');
    ctxMod.useCooler(A.cooler);
    await ctxMod.publishExchange({ q: 'what is a tribe', a: 'A private group with its own key' });
    const direct = await ctxMod.getBestTrainedAnswer('what is a tribe', { embed, cosine });
    ok(direct && direct.answer === 'A private group with its own key');
    const loose = await ctxMod.getBestTrainedAnswer('how many members can a tribe have and who pays for it', { embed, cosine });
    ok(!loose || loose.answer !== 'A private group with its own key' || false, 'a different question is not short-circuited');
  });

  t('the fine-tuning export is one JSON line per exchange, in chat format, without downvoted ones', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const ctxMod = require(guardsPath + 'buildAIContext.js');
    ctxMod.useCooler(A.cooler);
    const good = await ctxMod.publishExchange({ q: 'q1', a: 'a1', rating: 4, tags: ['x'] });
    const bad = await ctxMod.publishExchange({ q: 'q2', a: 'a2' });
    B.setActor();
    ctxMod.useCooler(B.cooler);
    await ctxMod.publishExchangeVote({ targetId: bad.key, helpful: false });
    A.setActor();
    ctxMod.useCooler(A.cooler);
    const out = await ctxMod.exportFineTuning({ system: 'sys' });
    const lines = out.trim().split('\n').map(l => JSON.parse(l));
    eq(lines.length, 1);
    eq(lines[0].messages.map(m => m.role).join(), 'system,user,assistant');
    eq(lines[0].messages[2].content, 'a1');
    eq(lines[0].meta.rating, 4);
  });
});

describe('ai: nothing personal leaves the node through the assistant', (t) => {
  t('answers built from live data cannot be rated, so they are never published', () => {
    const { aiView } = require('../../../src/views/AI_view');
    const page = aiView([
      { question: 'my balance', answer: 'You have 12 ECO', timestamp: 1, trainStatus: 'pending', source: 'data', facts: [{ text: 'Wallet balance: 12 ECO', href: '/wallet' }] },
      { question: 'what is oasis', answer: 'A network', timestamp: 2, trainStatus: 'pending', source: 'model' },
      { question: 'reused', answer: 'From the network', timestamp: 3, trainStatus: 'approved', source: 'network' },
      { question: 'failed', answer: 'I cannot answer properly.', timestamp: 4, trainStatus: 'rejected', source: 'error' }
    ], '', {}).toString();
    eq((page.match(/ai-star-btn/g) || []).length, 5, 'only the model answer offers the five stars');
    notOk(/ai-fact-link/.test(page), 'the facts used are not rendered');
  });

  t('encrypted or private content never reaches the semantic index', () => {
    const sem = require('../../../src/AI/semantic_search.js');
    eq(sem.textOf({ type: 'post', encryptedPayload: 'abc', title: 'secret' }), '');
    eq(sem.textOf({ type: 'poll', encryptedQuestion: 'abc', question: 'secret' }), '');
    eq(sem.textOf('box1==.box'), '');
    ok(!sem.TYPES.includes('chatMessage') && !sem.TYPES.includes('calendar') && !sem.TYPES.includes('pad'), 'private-by-design types are not indexed');
  });

  t('the network knowledge only comes from approved exchanges, never from private messages', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    const ctxMod = require('../../../src/AI/buildAIContext.js');
    ctxMod.useCooler(A.cooler);
    await A.use('pm').sendMessage([B.keypair.id], 'secret subject', 'my secret balance is 999');
    await ctxMod.publishExchange({ q: 'public question', a: 'public answer' });
    const { exchanges } = await ctxMod.listExchanges();
    eq(exchanges.length, 1);
    ok(!JSON.stringify(exchanges).includes('secret'), 'private messages are not part of the knowledge');
    const out = await ctxMod.exportFineTuning({});
    ok(!out.includes('secret') && out.includes('public answer'));
  });
});

describe('ai: the service client fails fast and safely', (t) => {
  t('without a model file nothing is spawned and status says so', async () => {
    process.env.OASIS_AI_MODEL = '/nonexistent/model.gguf';
    delete require.cache[require.resolve(guardsPath + 'ai_client.js')];
    const client = require(guardsPath + 'ai_client.js');
    notOk(client.isModelInstalled());
    const st = await client.status();
    eq(st.installed, false);
    let threw = null;
    try { await client.ask({ input: 'hi' }); } catch (e) { threw = e.message; }
    eq(threw, 'model_missing');
    delete process.env.OASIS_AI_MODEL;
  });
});

describe('ai: semantic search only indexes readable text', (t) => {
  const sem = require(guardsPath + 'semantic_search.js');
  t('encrypted or empty content produces no text, titles and tags do', () => {
    eq(sem.textOf({ encryptedPayload: 'x', title: 'secret' }), '');
    eq(sem.textOf({}), '');
    ok(/bread flour #?tag1/.test(sem.textOf({ title: 'bread', description: 'flour', tags: ['tag1'] }).replace(' tag1', ' #tag1')) || sem.textOf({ title: 'bread', description: 'flour', tags: ['tag1'] }) === 'bread flour tag1');
  });
});
