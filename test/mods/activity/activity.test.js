const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('activity: feed', (t) => {
  t('A creates a public tribe → A sees it in activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('tribes').createTribe('Pub', '', null, '', [], false, 'strict', null, 'OPEN', '');
    const feed = await A.use('activity').listFeed('all');
    ok(Array.isArray(feed));
    const tribe = feed.find(a => a.type === 'tribe');
    ok(tribe);
  });

  t('A creates a private tribe → A (member) sees its create in activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('tribes').createTribe('Hidden', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const feed = await A.use('activity').listFeed('all');
    const tribe = feed.find(a => a.type === 'tribe');
    ok(tribe, 'A as member sees own private tribe creation');
  });

  t('B (non-member) does NOT see private tribe creation in activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('tribes').createTribe('Secret', '', null, '', [], true, 'strict', null, 'OPEN', '');
    B.setActor();
    const feed = await B.use('activity').listFeed('all');
    const tribe = feed.find(a => a.type === 'tribe');
    ok(!tribe, 'B sees no private tribe activity');
  });
});

describe('activity: private task comment does not leak', (t) => {
  const start = () => new Date(Date.now() + 3600e3).toISOString();
  const end = () => new Date(Date.now() + 7200e3).toISOString();

  const commentOnTask = async (peer, taskKey) => {
    const ssb = await peer.cooler.open();
    return new Promise((res, rej) =>
      ssb.publish({ type: 'post', root: taskKey, text: 'a comment about the task' }, (e, r) => e ? rej(e) : res(r)));
  };

  t('author sees the comment on their own private task', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const task = await A.use('tasks').createTask('Secret task', 'd', start(), end(), 'HIGH', '', [], 'PRIVATE');
    await commentOnTask(A, task.key);
    const feed = await A.use('activity').listFeed('all');
    const comment = feed.find(a => a.type === 'post' && a.content && a.content.root === task.key);
    ok(comment, 'author sees the comment referencing their private task');
  });

  t('non-author does NOT see a comment referencing a private task', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const task = await A.use('tasks').createTask('Secret task', 'd', start(), end(), 'HIGH', '', [], 'PRIVATE');
    await commentOnTask(A, task.key);
    B.setActor();
    const feed = await B.use('activity').listFeed('all');
    const leaked = feed.find(a => a.type === 'post' && a.content && a.content.root === task.key);
    ok(!leaked, 'B must not see a comment that references a private task');
  });

  t('comment referencing a PUBLIC task is visible to others', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const task = await A.use('tasks').createTask('Open task', 'd', start(), end(), 'LOW', '', [], 'PUBLIC');
    await commentOnTask(A, task.key);
    B.setActor();
    const feed = await B.use('activity').listFeed('all');
    const comment = feed.find(a => a.type === 'post' && a.content && a.content.root === task.key);
    ok(comment, 'B sees comments on public tasks');
  });
});

describe('activity: vote tally matches the votes module', (t) => {
  const OPTS = ['YES', 'NO', 'ABSTENTION', 'CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'];
  const deadline = () => new Date(Date.now() + 8 * 864e5).toISOString();

  t('activity aggregates votesVote and ignores non-owner content forgery', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net); const D = makePeer(net);

    A.setActor();
    const v = await A.use('votes').createVote('Best pasta?', deadline());
    B.setActor(); await B.use('votes').voteOnVote(v.key, 'YES');
    C.setActor(); await C.use('votes').voteOnVote(v.key, 'NO');

    D.setActor();
    const ssbD = await D.cooler.open();
    await new Promise((res, rej) => ssbD.publish({
      type: 'votes', replaces: v.key, question: 'Best pasta?', options: OPTS,
      deadline: deadline(), createdBy: A.keypair.id, status: 'OPEN',
      votes: { YES: 99, NO: 0, ABSTENTION: 0, CONFUSED: 0, FOLLOW_MAJORITY: 0, NOT_INTERESTED: 0 },
      totalVotes: 99, voters: Array.from({ length: 99 }, (_, i) => '@ballotstuff' + i + '.ed25519'),
      createdAt: new Date().toISOString()
    }, (e) => e ? rej(e) : res()));

    A.setActor();
    const authoritative = await A.use('votes').getVoteById(v.key);
    const feed = await A.use('activity').listFeed('votes');
    const card = feed.find(a => a.type === 'votes' && a.content && a.content.question === 'Best pasta?');
    ok(card, 'the vote shows up as an activity card');
    eq(Number(card.content.totalVotes), Number(authoritative.totalVotes), 'activity total equals the votes module total');
    eq(Number(card.content.totalVotes), 2, 'only the two real votesVote ballots are counted');
    eq(Number(card.content.votes.YES), 1, 'YES tallied from the votesVote, not the forged 99');
    eq(Number(card.content.votes.NO), 1, 'NO tallied from the real ballot');
  });

  t('a vote with no ballots still shows up in activity (no card dropped)', async () => {
    const net = makeNetwork(); const A = makePeer(net);
    A.setActor();
    const v = await A.use('votes').createVote('Lonely poll?', deadline());
    const inAll = (await A.use('activity').listFeed('all')).find(a => a.type === 'votes' && a.content.question === 'Lonely poll?');
    const inVotes = (await A.use('activity').listFeed('votes')).find(a => a.type === 'votes' && a.content.question === 'Lonely poll?');
    ok(inAll, 'vote appears under the all feed');
    ok(inVotes, 'vote appears under the votes feed');
    eq(Number(inVotes.content.totalVotes), 0, 'zero ballots reported as zero');
    ok(v);
  });
});

describe('activity: own content survives log window', (t) => {
  t('own old feed appears in filter=feed despite heavy later traffic from others', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('feed').createFeed('my ancient feed text');
    const ssbB = await B.cooler.open();
    for (let i = 0; i < 1100; i++) {
      await new Promise((res, rej) => ssbB.publish({ type: 'post', text: 'noise ' + i }, e => e ? rej(e) : res()));
    }
    A.setActor();
    A.use('activity').invalidateCache();
    const feed = await A.use('activity').listFeed('feed');
    const mine = feed.find(a => a.type === 'feed' && a.author === A.keypair.id);
    ok(mine, 'own old feed still appears in activity');
  });
});

describe('activity: foreign tombstone cannot hide content', (t) => {
  t('a tombstone by another author does not remove the victim feed from activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('feed').createFeed('my persistent feed');
    const ssbB = await B.cooler.open();
    await new Promise((res, rej) => ssbB.publish({ type: 'tombstone', target: r.key, deletedAt: new Date().toISOString() }, e => e ? rej(e) : res()));
    A.use('activity').invalidateCache();
    const feed = await A.use('activity').listFeed('feed');
    const mine = feed.find(a => a.type === 'feed' && a.author === A.keypair.id);
    ok(mine, 'foreign tombstone ignored, own feed still visible');
  });

  t('a self tombstone still removes own content from activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('feed').createFeed('to be deleted');
    const ssbA = await A.cooler.open();
    await new Promise((res, rej) => ssbA.publish({ type: 'tombstone', target: r.key, deletedAt: new Date().toISOString() }, e => e ? rej(e) : res()));
    A.use('activity').invalidateCache();
    const feed = await A.use('activity').listFeed('feed');
    const mine = feed.find(a => a.type === 'feed' && a.content && a.content.text === 'to be deleted');
    ok(!mine, 'self tombstone still hides the content');
  });
});

describe('activity: unconfirmed transfer does not leak to third parties', (t) => {
  t('sender sees own unconfirmed transfer in activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('transfers').createTransfer(B.keypair.id, 'Invoice - Shop order: Widget', '1.5', '2026-12-31', [], 'ECONOMIC');
    const feed = await A.use('activity').listFeed('all');
    ok(feed.find(a => a.type === 'transfer'), 'sender sees the unconfirmed transfer');
  });

  t('recipient sees the unconfirmed transfer in activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('transfers').createTransfer(B.keypair.id, 'Invoice - Shop order: Widget', '1.5', '2026-12-31', [], 'ECONOMIC');
    B.setActor();
    const feed = await B.use('activity').listFeed('all');
    ok(feed.find(a => a.type === 'transfer'), 'recipient sees the unconfirmed transfer');
  });

  t('third party does NOT see the unconfirmed transfer in activity (all)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    await A.use('transfers').createTransfer(B.keypair.id, 'Invoice - Shop order: Widget', '1.5', '2026-12-31', [], 'ECONOMIC');
    C.setActor();
    const feed = await C.use('activity').listFeed('all');
    ok(!feed.find(a => a.type === 'transfer'), 'third party sees no unconfirmed transfer');
  });

  t('third party does NOT see the unconfirmed transfer in the transfer filter tab', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    await A.use('transfers').createTransfer(B.keypair.id, 'Invoice - Shop order: Widget', '1.5', '2026-12-31', [], 'ECONOMIC');
    C.setActor();
    const feed = await C.use('activity').listFeed('transfer');
    ok(!feed.find(a => a.type === 'transfer'), 'third party sees no unconfirmed transfer in transfer tab');
  });

  t('a self-transfer (CLOSED) stays visible to third parties', async () => {
    const net = makeNetwork(); const A = makePeer(net); const C = makePeer(net);
    A.setActor();
    await A.use('transfers').createTransfer(A.keypair.id, 'self note', '2', '2026-12-31', [], 'ECONOMIC');
    C.setActor();
    const feed = await C.use('activity').listFeed('all');
    ok(feed.find(a => a.type === 'transfer'), 'CLOSED self-transfer remains public');
  });
});

describe('activity: general OPEN chat replies surface in activity as a thread', (t) => {
  t('a general OPEN chat with messages appears as a chatThread (all)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('chats').createChat('Lobby', 'general chat', null, 'general', 'OPEN', [], null);
    await A.use('chats').sendMessage(r.key, 'hello everyone');
    const feed = await A.use('activity').listFeed('all');
    const th = feed.find(a => a.type === 'chatThread' && a.content.chatRoot === r.key);
    ok(th, 'chatThread present in activity all');
    eq(th.content.title, 'Lobby');
    ok(th.content.replies.some(m => m.text === 'hello everyone'), 'reply text embedded');
  });

  t('the chatThread appears in the chat filter and carries the title', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('chats').createChat('Lobby2', 'general chat', null, 'general', 'OPEN', [], null);
    await A.use('chats').sendMessage(r.key, 'first message');
    const feed = await A.use('activity').listFeed('chat');
    const th = feed.find(a => a.type === 'chatThread' && a.content.chatRoot === r.key);
    ok(th, 'chatThread in chat filter');
    eq(th.content.title, 'Lobby2');
  });

  t('both the creation card and the thread appear when a chat has messages', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('chats').createChat('BothCard', 'g', null, 'general', 'OPEN', [], null);
    await A.use('chats').sendMessage(r.key, 'a message');
    const feed = await A.use('activity').listFeed('all');
    ok(feed.find(a => a.type === 'chat' && (a.rootId || a.id) === r.key), 'creation card present');
    ok(feed.find(a => a.type === 'chatThread' && a.content.chatRoot === r.key), 'thread present');
  });

  t('a third party sees the general OPEN chat thread', async () => {
    const net = makeNetwork(); const A = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('chats').createChat('PublicRoom', 'g', null, 'general', 'OPEN', [], null);
    await A.use('chats').sendMessage(r.key, 'anyone can read this');
    C.setActor();
    const feed = await C.use('activity').listFeed('all');
    ok(feed.find(a => a.type === 'chatThread' && a.content.chatRoot === r.key), 'third party sees the thread');
  });

  t('closing the chat removes its thread from activity', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('chats').createChat('Temp', 'g', null, 'general', 'OPEN', [], null);
    await A.use('chats').sendMessage(r.key, 'to be hidden');
    await A.use('chats').closeChatById(r.key);
    const feed = await A.use('activity').listFeed('all');
    ok(!feed.find(a => a.type === 'chatThread' && a.content.chatRoot === r.key), 'closed chat thread hidden');
    ok(!feed.find(a => a.type === 'chat' && (a.rootId || a.id) === r.key), 'closed chat card hidden');
  });
});

describe('activity: industry builds gated by approval', (t) => {
  t('a proposed build is hidden; it appears once the member vote approves it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const created = await A.use('industry').createFacility({ name: 'GateBuild', sector: 'software', membershipPolicy: 'open', quorum: 2, majority: 0.5 });
    const facId = created.key || created.id;
    B.setActor(); await B.use('industry').joinFacility(facId); A.setActor();
    const bpForBuild = await A.use('industry').createBlueprint(facId, { name: 'Recipe', laborHours: 1 });
    const build = await A.use('industry').createBuild(facId, { blueprintId: bpForBuild.key, title: 'Batch', notes: 'go', startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), endDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10) });
    const buildId = build.key || build.id;
    const feedA = await A.use('activity').listFeed('all');
    ok(!feedA.find(a => a.type === 'industryBuild'), 'proposed build hidden');
    await A.use('industry').voteBuild(buildId, 'yes');
    B.setActor(); await B.use('industry').voteBuild(buildId, 'yes');
    const feedB = await B.use('activity').listFeed('all');
    ok(feedB.find(a => a.type === 'industryBuild' && a.id === buildId), 'approved build visible');
  });
});

describe('activity: the TOP filter', (t) => {
  t('orders the feed by the most active inhabitant', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const publish = (peer, content) => new Promise((res, rej) =>
      peer.node.publish(content, (e) => e ? rej(e) : res()));

    B.setActor();
    await publish(B, { type: 'post', text: 'b only one' });

    A.setActor();
    await publish(A, { type: 'post', text: 'a one' });
    await publish(A, { type: 'post', text: 'a two' });
    await publish(A, { type: 'post', text: 'a three' });

    const activity = A.use('activity');
    activity.invalidateCache();
    const top = await activity.listFeed('top');
    ok(top.length >= 4, 'everything is listed');
    eq(top[0].author, A.keypair.id, 'the busiest inhabitant leads');
    eq(top[0].authorActions, 3, 'and carries their action count');
    eq(top[top.length - 1].author, B.keypair.id, 'the quietest one closes');
  });
});

describe('activity: filter layout', (t) => {
  t('chips follow the order of their menu group, and no filter is lost', () => {
    const { activityView } = require('../../../src/views/activity_view');
    const html = String(activityView([], 'all', '@me.ed25519'));
    const at = (type) => html.indexOf(`/activity?filter=${type}"`);

    const economy = ['banking', 'market', 'housing', 'project', 'industry', 'job', 'shop', 'transfer'];
    for (const type of economy) ok(at(type) > 0, `${type} is rendered`);
    for (let i = 1; i < economy.length; i++) {
      ok(at(economy[i]) > at(economy[i - 1]),
        `${economy[i]} comes after ${economy[i - 1]}, like in the ECONOMY menu`);
    }

    const office = ['votes', 'event', 'calendar', 'task', 'report'];
    for (let i = 1; i < office.length; i++) {
      ok(at(office[i]) > at(office[i - 1]), `${office[i]} comes after ${office[i - 1]}`);
    }

    ok(at('banking') < at('post'), 'the economy group comes before the network one');

    for (const type of ['all', 'mine', 'recent', 'top', 'video', 'banking', 'courts']) {
      ok(at(type) > 0, `${type} survived the regrouping`);
    }

    ok(/class="activity-chip active"[^>]*href="\/activity\?filter=all"|href="\/activity\?filter=all"[^>]*class="activity-chip active"/.test(html),
      'the current filter is highlighted');
  });
});

describe('activity: the pin on the feed', (t) => {
  t('a card that belongs to a favourites list offers the pin, in the right state', () => {
    const { activityView } = require('../../../src/views/activity_view');
    const id = '%event.sha256';
    const action = {
      id, key: id, type: 'event', author: '@a.ed25519', ts: Date.now(),
      content: { type: 'event', title: 'a meetup', date: new Date().toISOString(), attendees: [], isPublic: 'public' }
    };

    const plain = String(activityView([action], 'all', '@me.ed25519'));
    ok(plain.includes('/events/favorites/add/'), 'the pin is offered');
    ok(plain.indexOf('/events/favorites/add/') < plain.indexOf('/reports?filter=create'),
      'and it comes before the report button');

    const pinned = String(activityView([action], 'all', '@me.ed25519', '', {
      favIndex: new Map([[id, 'events']])
    }));
    ok(pinned.includes('/events/favorites/remove/'), 'an already pinned card offers to unpin');
    ok(pinned.includes('btn-pin-on'), 'and shows it as pinned');
  });

  t('a card with no favourites list of its own shows the rest of the bar anyway', () => {
    const { activityView } = require('../../../src/views/activity_view');
    const action = {
      id: '%about.sha256', key: '%about.sha256', type: 'about', author: '@a.ed25519', ts: Date.now(),
      content: { type: 'about', about: '@a.ed25519', name: 'someone' }
    };
    const html = String(activityView([action], 'all', '@me.ed25519'));
    notOk(html.includes('/favorites/add/'), 'no pin where there is nothing to pin');
    ok(html.includes('/blockexplorer/block/'), 'but the rest of the bar is there');
  });
});

describe('activity: every card can be visited', (t) => {
  t('a feed entry links to its own page', () => {
    const { getViewDetailsAction } = require('../../../src/views/activity_view');
    const href = getViewDetailsAction('feed', { id: '%f.sha256', content: {} });
    eq(href, `/feed/${encodeURIComponent('%f.sha256')}`, 'the feed card points at the feed detail');
  });
});
