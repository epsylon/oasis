const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const pull = require('../../../src/server/node_modules/pull-stream');

const readLog = async (peer) => {
  const ssb = await peer.cooler.open();
  return new Promise((res, rej) => pull(ssb.createLogStream({}), pull.collect((e, a) => (e ? rej(e) : res(a)))));
};

const idOf = async (peer) => (await peer.cooler.open()).id;
const publishRaw = async (peer, content) => {
  const ssb = await peer.cooler.open();
  return new Promise((res, rej) => ssb.publish(content, (e, r) => (e ? rej(e) : res(r))));
};
const FUTURE = '2030-12-31T00:00:00.000Z';

// These tests reproduce the "content overwrite via replaces" report: a peer B
// publishes a signed message with `replaces` pointing at A's content and forged
// body fields. A correct resolver must (a) ignore B's overwrite of A's core
// content, and (b) still aggregate B's LEGITIMATE collaborative contribution.

describe('security: replaces-overwrite hijack (CWE content spoofing)', (t) => {

  t('votes: B cannot overwrite A vote question via replaces', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('votes').createVote('Original question?', FUTURE, ['YES', 'NO']);
    const aId = r.key; const aAuthor = await idOf(A);
    B.setActor();
    await publishRaw(B, { type: 'votes', replaces: aId, question: 'HIJACKED', options: ['YES', 'NO'], createdBy: aAuthor, deadline: FUTURE, status: 'OPEN', votes: {}, voters: [], opinions: {}, opinions_inhabitants: [], createdAt: new Date().toISOString() });
    const v = await B.use('votes').getVoteById(aId);
    eq(v.question, 'Original question?', 'vote question must NOT be hijacked');
    const list = await B.use('votes').listAll('all');
    eq(list.filter(x => x.question === 'HIJACKED').length, 0, 'hijack must not appear as a vote');
  });

  t('votes: B legitimate vote + opinion are preserved', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('votes').createVote('Q?', FUTURE, ['YES', 'NO']);
    B.setActor();
    await B.use('votes').voteOnVote(r.key, 'NO');
    await B.use('votes').createOpinion(r.key, 'interesting');
    const v = await B.use('votes').getVoteById(r.key);
    ok(v.totalVotes >= 1, 'B vote counted');
    ok((v.opinions_inhabitants || []).includes(await idOf(B)), 'B opinion counted');
  });

  t('votes: ballot integrity — forged extra voters are ignored', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('votes').createVote('Q?', FUTURE, ['YES', 'NO']);
    const aId = r.key; const aAuthor = await idOf(A);
    B.setActor();
    // B tries to stuff the ballot by overwriting with fake voters
    await publishRaw(B, { type: 'votes', replaces: aId, question: 'Q?', options: ['YES', 'NO'], createdBy: aAuthor, deadline: FUTURE, status: 'OPEN', votes: { YES: 999 }, voters: ['@fake1.ed25519', '@fake2.ed25519'], totalVotes: 999, opinions: {}, opinions_inhabitants: [], createdAt: new Date().toISOString() });
    const v = await A.use('votes').getVoteById(aId);
    notOk((v.voters || []).includes('@fake1.ed25519'), 'forged voter must be ignored');
    ok((v.totalVotes || 0) < 999, 'forged tally must not stick');
  });

  t('market: B cannot overwrite A item title via replaces', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await A.use('market').createItem('auction', 'Original Item', 'desc', null, '1.00', ['x'], 'NEW', FUTURE, false, 1, '', {}, 'PUBLIC');
    const aId = res.key; const aAuthor = await idOf(A);
    B.setActor();
    await publishRaw(B, { type: 'market', replaces: aId, title: 'HIJACKED', seller: aAuthor, status: 'FOR SALE', item_type: 'auction', price: '1.000000', stock: 1, deadline: FUTURE, auctions_poll: [], createdAt: new Date().toISOString() });
    const item = await A.use('market').getItemById(aId);
    eq(item.title, 'Original Item', 'item title must NOT be hijacked');
  });

  t('market: B legitimate bid is preserved and bound to B', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const res = await A.use('market').createItem('auction', 'Item', 'desc', null, '1.00', ['x'], 'NEW', FUTURE, false, 1, '', {}, 'PUBLIC');
    const bAuthor = await idOf(B);
    B.setActor();
    await B.use('market').addBidToAuction(res.key, bAuthor, '10');
    A.setActor();
    const item = await A.use('market').getItemById(res.key);
    ok((item.auctions_poll || []).some(line => String(line).startsWith(bAuthor)), 'B bid recorded and attributed to B');
  });

  t('bookmarks: B cannot overwrite A bookmark url via replaces', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('bookmarks').createBookmark('https://original.example', 'tag', 'desc', 'news', null);
    const aId = r.key; const aAuthor = await idOf(A);
    B.setActor();
    await publishRaw(B, { type: 'bookmark', replaces: aId, url: 'https://hijacked.evil', author: aAuthor, tags: [], description: '', category: '', opinions: {}, opinions_inhabitants: [], createdAt: new Date().toISOString() });
    const bm = await A.use('bookmarks').getBookmarkById(aId);
    eq(bm.url, 'https://original.example', 'bookmark url must NOT be hijacked');
  });

  t('bookmarks: B legitimate opinion is preserved', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('bookmarks').createBookmark('https://x.example', 'tag', 'desc', 'news', null);
    B.setActor();
    await B.use('bookmarks').createOpinion(r.key, 'interesting');
    const bm = await B.use('bookmarks').getBookmarkById(r.key);
    ok((bm.opinions_inhabitants || []).includes(await idOf(B)), 'B opinion counted');
  });

  t('projects: B cannot overwrite A project title via replaces', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('projects').createProject({ title: 'Original Project', description: 'd', goal: 100, deadline: FUTURE });
    const aId = r.key; const aAuthor = await idOf(A);
    B.setActor();
    await publishRaw(B, { type: 'project', replaces: aId, title: 'HIJACKED', author: aAuthor, status: 'ACTIVE', followers: [], backers: [], bounties: [], milestones: [], opinions: {}, opinions_inhabitants: [], createdAt: new Date().toISOString() });
    const p = await A.use('projects').getProjectById(aId);
    eq(p.title, 'Original Project', 'project title must NOT be hijacked');
  });

  t('projects: B legitimate follow + pledge are preserved and attributed', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('projects').createProject({ title: 'P', description: 'd', goal: 100, deadline: FUTURE });
    const bAuthor = await idOf(B);
    B.setActor();
    await B.use('projects').followProject(r.key, bAuthor);
    await B.use('projects').pledgeToProject(r.key, bAuthor, '25');
    const p = await A.use('projects').getProjectById(r.key);
    ok((p.followers || []).includes(bAuthor), 'B follow preserved');
    ok((p.backers || []).some(x => x && x.userId === bAuthor), 'B pledge preserved and attributed');
  });

  t('projects: pledge transferId preserved and only author can confirm', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('projects').createProject({ title: 'P', description: 'd', goal: 100, deadline: FUTURE });
    const bId = await idOf(B);
    B.setActor();
    await B.use('projects').pledgeToProject(r.key, bId, '25', { transferId: 'tx-abc' });
    let p = await A.use('projects').getProjectById(r.key);
    let backer = (p.backers || []).find(x => x.userId === bId);
    ok(backer && backer.transferId === 'tx-abc', 'pledge carries transferId');
    ok(backer.confirmed === false, 'pledge starts unconfirmed');
    A.setActor();
    await A.use('projects').confirmPledge(r.key, 'tx-abc');
    p = await A.use('projects').getProjectById(r.key);
    backer = (p.backers || []).find(x => x.userId === bId);
    ok(backer && backer.confirmed === true, 'author confirmation marks backer confirmed');
  });

  t('projects: forged pledge (non-signed backer) is ignored', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('projects').createProject({ title: 'P', description: 'd', goal: 100, deadline: FUTURE });
    const aId = r.key; const aAuthor = await idOf(A);
    B.setActor();
    await publishRaw(B, { type: 'project', replaces: aId, title: 'P', author: aAuthor, status: 'ACTIVE', followers: [], backers: [{ userId: '@fakerich.ed25519', amount: 999999, confirmed: true }], pledged: 999999, bounties: [], milestones: [], opinions: {}, opinions_inhabitants: [], createdAt: new Date().toISOString() });
    const p = await A.use('projects').getProjectById(aId);
    notOk((p.backers || []).some(x => x && x.userId === '@fakerich.ed25519'), 'forged backer must be ignored');
  });

  t('transfers: B cannot overwrite A transfer amount via replaces', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const bAuthor = await idOf(B);
    A.setActor();
    const r = await A.use('transfers').createTransfer(bAuthor, 'coffee', '5', FUTURE, ['t'], 'ECONOMIC');
    const aId = r.key; const aAuthor = await idOf(A);
    B.setActor();
    await publishRaw(B, { type: 'transfer', replaces: aId, from: aAuthor, to: bAuthor, concept: 'HIJACKED', amount: '999999', confirmedBy: [aAuthor], status: 'UNCONFIRMED', deadline: FUTURE, tags: [], opinions: {}, opinions_inhabitants: [], createdAt: new Date().toISOString() });
    const tr = await A.use('transfers').getTransferById(aId);
    eq(tr.concept, 'coffee', 'transfer concept must NOT be hijacked');
    eq(String(tr.amount), '5.000000', 'transfer amount must NOT be hijacked');
  });

  t('transfers: user cannot forge a pub-confirmed UBI via confirmTransferById', async () => {
    const net = makeNetwork(); const A = makePeer(net); const P = makePeer(net);
    A.setActor();
    const pubId = await idOf(P);
    const claim = await publishRaw(A, { type: 'ubiClaim', pubId, epochId: 'e1', amount: '100', claimedAt: new Date().toISOString() });
    let threw = false;
    try { await A.use('transfers').confirmTransferById(claim.key); } catch (_) { threw = true; }
    ok(threw, 'confirming a ubiClaim must be rejected');
    const list = await A.use('transfers').listAll('all');
    const forged = (list || []).find(t => Array.isArray(t.tags) && t.tags.includes('UBI') && String(t.status).toUpperCase() === 'CLOSED' && (t.confirmedBy || []).includes(pubId));
    notOk(forged, 'no forged pub-confirmed CLOSED UBI transfer must exist');
  });

  t('transfers: recipient B legitimate confirmation is preserved', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const bAuthor = await idOf(B);
    A.setActor();
    const r = await A.use('transfers').createTransfer(bAuthor, 'coffee', '5', FUTURE, ['t'], 'ECONOMIC');
    B.setActor();
    await B.use('transfers').confirmTransferById(r.key);
    const tr = await B.use('transfers').getTransferById(r.key);
    ok((tr.confirmedBy || []).includes(bAuthor), 'B confirmation recorded');
    eq(tr.status, 'CLOSED', 'transfer closes after both confirmations');
  });

  t('tribes-content: member B legitimate vote is aggregated, content unchanged', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const tribe = await A.use('tribes').createTribe('Sec', 'd', null, '', [], true, 'strict', null, 'OPEN', '');
    const tribeId = tribe.key;
    const code = await A.use('tribes').generateInvite(tribeId);
    B.setActor();
    await B.use('tribes').joinByInvite(code);
    A.setActor();
    await A.use('tribesContent').create(tribeId, 'votation', { title: 'Poll', description: 'd', options: ['A', 'B'], votes: {} });
    let list = await A.use('tribesContent').listByTribe(tribeId, 'votation');
    const item = list[0];
    ok(item, 'votation created');
    B.setActor();
    await B.use('tribesContent').castVote(item.id, 0);
    A.setActor();
    list = await A.use('tribesContent').listByTribe(tribeId, 'votation');
    eq(list.length, 1, 'still a single votation (no duplicate/hijack node)');
    eq(list[0].title, 'Poll', 'votation content unchanged');
    const voters = Object.values(list[0].votes || {}).flat();
    ok(voters.includes(await idOf(B)), 'B vote aggregated onto the votation');
  });

  t('courts: forged case replaces cannot set status/judge, nor spawn a duplicate', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const X = makePeer(net);
    A.setActor();
    await A.use('courts').openCase({ titleBase: 'dispute', respondentInput: B.keypair.id, method: 'JUDGE' });
    let list = await A.use('courts').listCases('all');
    const c = list[0];
    ok(c, 'case exists');
    eq(String(c.status || '').toUpperCase(), 'OPEN', 'case starts OPEN');
    X.setActor();
    await publishRaw(X, { type: 'courtsCase', replaces: c.id, rootCaseId: c.rootCaseId || c.id, status: 'DECIDED', judgeId: X.keypair.id, method: 'JUDGE', createdAt: new Date().toISOString() });
    A.setActor();
    list = await A.use('courts').listCases('all');
    eq(list.length, 1, 'forged replaces must not create a second case');
    const c2 = list[0];
    eq(String(c2.status || '').toUpperCase(), 'OPEN', 'forged DECIDED status must be ignored');
    notOk(String(c2.judgeId || '') === X.keypair.id, 'forged judge must be ignored');
  });

  t('courts: opening a case does not leak respondent/title in plaintext', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const X = makePeer(net);
    A.setActor();
    await A.use('courts').openCase({ titleBase: 'secretdispute', respondentInput: B.keypair.id, method: 'JUDGE' });
    const msgs = await readLog(X);
    const caseMsgs = msgs.filter(m => m.value && m.value.content && m.value.content.type === 'courtsCase');
    ok(caseMsgs.length >= 1, 'case messages exist in the log');
    for (const m of caseMsgs) {
      const c = m.value.content;
      notOk(c.respondentId, 'no plaintext respondentId in any courtsCase message');
      notOk(c.accuser, 'no plaintext accuser in any courtsCase message');
      notOk(c.title && /secretdispute/.test(String(c.title)), 'no plaintext title');
    }
  });

  const MEDIA = [
    { mod: 'images', type: 'image', create: (m) => m.createImage('&x.sha256', ['t'], 'Original', 'd', false, ''), get: (m, id) => m.getImageById(id) },
    { mod: 'audios', type: 'audio', create: (m) => m.createAudio('&x.sha256', ['t'], 'Original', 'd', ''), get: (m, id) => m.getAudioById(id) },
    { mod: 'videos', type: 'video', create: (m) => m.createVideo('&x.sha256', ['t'], 'Original', 'd', ''), get: (m, id) => m.getVideoById(id) },
    { mod: 'documents', type: 'document', create: (m) => m.createDocument('&x.sha256', ['t'], 'Original', 'd'), get: (m, id) => m.getDocumentById(id) },
    { mod: 'torrents', type: 'torrent', create: (m) => m.createTorrent('&x.sha256', ['t'], 'Original', 'd', '1MB', null), get: (m, id) => m.getTorrentById(id) }
  ];

  for (const M of MEDIA) {
    t(`${M.mod}: B cannot overwrite A ${M.type} via replaces`, async () => {
      const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
      A.setActor();
      const r = await M.create(A.use(M.mod));
      const aId = r.key; const aAuthor = await idOf(A);
      B.setActor();
      await publishRaw(B, { type: M.type, replaces: aId, title: 'HIJACKED', author: aAuthor, url: 'x', tags: [], description: '', opinions: {}, opinions_inhabitants: [], createdAt: new Date().toISOString() });
      const item = await M.get(A.use(M.mod), aId);
      eq(item.title, 'Original', `${M.type} title must NOT be hijacked`);
    });

    t(`${M.mod}: B legitimate opinion is preserved`, async () => {
      const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
      A.setActor();
      const r = await M.create(A.use(M.mod));
      B.setActor();
      await B.use(M.mod).createOpinion(r.key, 'interesting');
      const item = await M.get(B.use(M.mod), r.key);
      ok((item.opinions_inhabitants || []).includes(await idOf(B)), `${M.type} B opinion counted`);
    });
  }

  t('feed: B cannot overwrite A post text via replaces', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('feed').createFeed('Original text', []);
    const aId = r.key; const aAuthor = await idOf(A);
    B.setActor();
    await publishRaw(B, { type: 'feed', replaces: aId, text: 'HIJACKED', author: aAuthor, opinions: {}, opinions_inhabitants: [], createdAt: new Date().toISOString() });
    const post = await A.use('feed').getFeedById(aId);
    eq(post.value.content.text, 'Original text', 'feed text must NOT be hijacked');
  });

  t('feed: B legitimate opinion is preserved', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('feed').createFeed('hi there', []);
    B.setActor();
    await B.use('feed').addOpinion(r.key, 'interesting');
    const post = await B.use('feed').getFeedById(r.key);
    ok((post.value.content.opinions_inhabitants || []).includes(await idOf(B)), 'B feed opinion counted');
  });

  t('tasks: B cannot overwrite A task title via replaces', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('tasks').createTask('Original Task', 'd', '2030-12-31T00:00:00.000Z', '2030-12-31T01:00:00.000Z', 'MEDIUM', '', ['t'], true);
    const aId = r.key; const aAuthor = await idOf(A);
    B.setActor();
    await publishRaw(B, { type: 'task', replaces: aId, title: 'HIJACKED', author: aAuthor, assignees: [], opinions: {}, opinions_inhabitants: [], status: 'OPEN', createdAt: new Date().toISOString() });
    const task = await A.use('tasks').getTaskById(aId);
    eq(task.title, 'Original Task', 'task title must NOT be hijacked');
  });

  t('tasks: B legitimate assignee toggle + opinion are preserved', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('tasks').createTask('T', 'd', '2030-12-31T00:00:00.000Z', '2030-12-31T01:00:00.000Z', 'MEDIUM', '', ['t'], true);
    const bId = await idOf(B);
    B.setActor();
    await B.use('tasks').toggleAssignee(r.key);
    await B.use('tasks').createOpinion(r.key, 'interesting');
    const task = await A.use('tasks').getTaskById(r.key);
    ok((task.assignees || []).includes(bId), 'B assignee preserved and attributed');
    ok((task.opinions_inhabitants || []).includes(bId), 'B opinion counted');
  });

  t('reports: B cannot overwrite A report title via replaces', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('reports').createReport('Original Report', 'desc', 'general', null, ['t'], 'low', {});
    const aId = r.key; const aAuthor = await idOf(A);
    B.setActor();
    await publishRaw(B, { type: 'report', replaces: aId, title: 'HIJACKED', author: aAuthor, confirmations: [], opinions: {}, opinions_inhabitants: [], status: 'OPEN', category: 'GENERAL', createdAt: new Date().toISOString() });
    const rep = await A.use('reports').getReportById(aId);
    eq(rep.title, 'Original Report', 'report title must NOT be hijacked');
  });

  t('reports: B legitimate confirmation + opinion are preserved', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('reports').createReport('R', 'desc', 'general', null, ['t'], 'low', {});
    const bId = await idOf(B);
    B.setActor();
    await B.use('reports').confirmReportById(r.key);
    await B.use('reports').createOpinion(r.key, 'interesting');
    const rep = await A.use('reports').getReportById(r.key);
    ok((rep.confirmations || []).includes(bId), 'B confirmation preserved and attributed');
    ok((rep.opinions_inhabitants || []).includes(bId), 'B opinion counted');
  });

  t('chats: single-use invite cannot be reused by a second joiner', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Room', 'd', null, 'general', 'PUBLIC', [], null);
    const code = await A.use('chats').generateInvite(chat.key);
    B.setActor();
    await B.use('chats').joinByInvite(code);
    C.setActor();
    let threw = false;
    try { await C.use('chats').joinByInvite(code); } catch (e) { threw = /already used/i.test(e.message); }
    ok(threw, 'second joiner must be rejected for a used single-use invite');
  });

  t('chats: open (public) invite remains reusable by multiple joiners', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Room', 'd', null, 'general', 'PUBLIC', [], null);
    const code = await A.use('chats').generateInvite(chat.key, { public: true });
    B.setActor();
    await B.use('chats').joinByInvite(code);
    C.setActor();
    await C.use('chats').joinByInvite(code);
    A.setActor();
    const chat2 = await A.use('chats').getChatById(chat.key);
    ok((chat2.members || []).includes(await idOf(B)) && (chat2.members || []).includes(await idOf(C)), 'both joiners are members via the open invite');
  });

  t('events: B cannot overwrite A event title via replaces', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('events').createEvent('Original Event', 'd', '2030-12-31T00:00:00.000Z', 'here', 0, '', [], ['t'], 'public', '', false);
    const aId = r.key; const aAuthor = await idOf(A);
    B.setActor();
    await publishRaw(B, { type: 'event', replaces: aId, title: 'HIJACKED', organizer: aAuthor, isPublic: 'public', date: '2030-12-31T00:00:00.000Z', attendees: [], opinions: {}, opinions_inhabitants: [], createdAt: new Date().toISOString() });
    const ev = await A.use('events').getEventById(aId);
    eq(ev.title, 'Original Event', 'event title must NOT be hijacked');
  });

  t('events: B legitimate attendance + opinion are preserved', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('events').createEvent('E', 'd', '2030-12-31T00:00:00.000Z', 'here', 0, '', [], ['t'], 'public', '', false);
    const bId = await idOf(B);
    B.setActor();
    await B.use('events').toggleAttendee(r.key);
    await B.use('events').createOpinion(r.key, 'interesting');
    const ev = await A.use('events').getEventById(r.key);
    ok((ev.attendees || []).includes(bId), 'B attendance preserved and attributed');
    ok((ev.opinions_inhabitants || []).includes(bId), 'B opinion counted');
  });

});
