const { eq, ok, notOk, deepEq } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const basePoll = { question: 'Where do we meet?', options: ['Plaza', 'Park', 'Bar'] };

describe('polls: asking and answering', (t) => {
  t('a poll needs a question and at least two options', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const polls = A.use('polls');
    let threw = 0;
    try { await polls.createPoll({ question: '', options: ['a', 'b'] }); } catch (_) { threw++; }
    try { await polls.createPoll({ question: 'q', options: ['only one'] }); } catch (_) { threw++; }
    eq(threw, 2, 'both malformed polls refused');
  });

  t('duplicate and blank options are cleaned up', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const polls = A.use('polls');
    const created = await polls.createPoll({ question: 'q', options: ['Yes', '  ', 'yes', 'No', ''] });
    const poll = await polls.getPollById(created.key);
    deepEq(poll.options, ['Yes', 'No'], 'kept two distinct options');
  });

  t('a single-choice poll refuses two answers, a multiple one accepts them', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const single = await A.use('polls').createPoll(basePoll);
    const multi = await A.use('polls').createPoll({ ...basePoll, multiple: true });

    B.setActor();
    const pollsB = B.use('polls');
    let threw = false;
    try { await pollsB.vote(single.key, ['Plaza', 'Park']); } catch (_) { threw = true; }
    ok(threw, 'single-choice poll refused two options');
    await pollsB.vote(multi.key, ['Plaza', 'Park']);
    const m = await pollsB.getPollById(multi.key);
    eq(m.counts.Plaza, 1, 'first option counted');
    eq(m.counts.Park, 1, 'second option counted');
    eq(m.totalVoters, 1, 'but only one voter');
  });

  t('an option that is not on the ballot is ignored', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const created = await A.use('polls').createPoll(basePoll);
    B.setActor();
    let threw = false;
    try { await B.use('polls').vote(created.key, ['Moon']); } catch (_) { threw = true; }
    ok(threw, 'invented option refused');
  });

  t('voting again replaces your previous answer instead of adding one', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const created = await A.use('polls').createPoll(basePoll);
    B.setActor();
    const pollsB = B.use('polls');
    await pollsB.vote(created.key, ['Plaza']);
    await pollsB.vote(created.key, ['Bar']);
    const poll = await pollsB.getPollById(created.key);
    eq(poll.totalVoters, 1, 'still one voter');
    eq(poll.counts.Plaza, 0, 'the old answer is gone');
    eq(poll.counts.Bar, 1, 'the new answer counts');
    deepEq(poll.myChoices, ['Bar'], 'the viewer sees their own answer');
  });

  t('an anonymous poll hides who voted but still counts', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const open = await A.use('polls').createPoll(basePoll);
    const anon = await A.use('polls').createPoll({ ...basePoll, anonymous: true });
    B.setActor();
    await B.use('polls').vote(open.key, ['Plaza']);
    await B.use('polls').vote(anon.key, ['Plaza']);

    A.setActor();
    const shown = await A.use('polls').getPollById(open.key);
    const hidden = await A.use('polls').getPollById(anon.key);
    deepEq(shown.voters, [B.keypair.id], 'a normal poll lists its voters');
    deepEq(hidden.voters, [], 'an anonymous poll does not');
    ok(hidden.votersHidden, 'and says so');
    eq(hidden.counts.Plaza, 1, 'the tally is the same');
  });

  t('a closed poll accepts no more votes', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const created = await A.use('polls').createPoll(basePoll);
    await A.use('polls').closePoll(created.key);
    B.setActor();
    let threw = false;
    try { await B.use('polls').vote(created.key, ['Plaza']); } catch (_) { threw = true; }
    ok(threw, 'vote refused');
    eq((await B.use('polls').getPollById(created.key)).status, 'CLOSED', 'shown as closed');
  });

  t('only the author can close or delete a poll', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const created = await A.use('polls').createPoll(basePoll);
    B.setActor();
    let threw = 0;
    try { await B.use('polls').closePoll(created.key); } catch (_) { threw++; }
    try { await B.use('polls').deletePoll(created.key); } catch (_) { threw++; }
    eq(threw, 2, 'both refused');
  });

  t('a poll with votes can no longer be edited', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const created = await A.use('polls').createPoll(basePoll);
    await A.use('polls').updatePoll(created.key, { question: 'Where do we meet tonight?' });
    eq((await A.use('polls').getPollById(created.key)).question, 'Where do we meet tonight?', 'edit allowed while empty');

    B.setActor();
    await B.use('polls').vote(created.key, ['Plaza']);
    A.setActor();
    let threw = false;
    try { await A.use('polls').updatePoll(created.key, { question: 'changed again' }); } catch (_) { threw = true; }
    ok(threw, 'edit refused once someone voted');
  });

  t('a deleted poll disappears for everyone', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const created = await A.use('polls').createPoll(basePoll);
    await A.use('polls').deletePoll(created.key);
    B.setActor();
    eq((await B.use('polls').listAll('ALL')).length, 0, 'gone from the list');
  });

  t('filters split mine, voted, open and closed', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const mine = await A.use('polls').createPoll({ question: 'mine', options: ['a', 'b'] });
    await A.use('polls').closePoll(mine.key);
    B.setActor();
    const theirs = await B.use('polls').createPoll({ question: 'theirs', options: ['a', 'b'] });

    A.setActor();
    const polls = A.use('polls');
    eq((await polls.listAll('ALL')).length, 2, 'two polls in total');
    eq((await polls.listAll('MINE')).length, 1, 'one of mine');
    eq((await polls.listAll('CLOSED')).length, 1, 'one closed');
    eq((await polls.listAll('OPEN')).length, 1, 'one open');
    eq((await polls.listAll('VOTED')).length, 0, 'i have not voted yet');
    await polls.vote(theirs.key, ['a']);
    eq((await polls.listAll('VOTED')).length, 1, 'now one voted');
  });

  t('a poll inside a tribe does not leak into the global list', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const polls = A.use('polls');
    await polls.createPoll({ question: 'global', options: ['a', 'b'] });
    await polls.createPoll({ question: 'tribal', options: ['a', 'b'], tribeId: '%tribe.sha256' });
    const global = await polls.listAll('ALL');
    eq(global.length, 1, 'only the global one');
    eq(global[0].question, 'global', 'the right one');
    const tribal = await polls.listAll('ALL', { tribeId: '%tribe.sha256' });
    eq(tribal.length, 1, 'the tribe sees its own');
    eq(tribal[0].question, 'tribal', 'the right one');
  });

  t('a deadline in the past closes the poll by itself', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const polls = A.use('polls');
    let threw = false;
    try { await polls.createPoll({ ...basePoll, deadline: '2020-01-01T00:00:00Z' }); } catch (_) { threw = true; }
    ok(threw, 'a poll cannot be born expired');

    const created = await polls.createPoll({ ...basePoll, deadline: new Date(Date.now() + 1000).toISOString() });
    await new Promise(r => setTimeout(r, 1100));
    eq((await polls.getPollById(created.key)).status, 'CLOSED', 'closed once the deadline passed');
  });
});

describe('polls: inside a chat', (t) => {
  t('a poll created in a chat belongs to that chat, not to the global list', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const chat = await A.use('chats').createChat('the chat', 'desc', null, 'GENERAL', 'OPEN', [], null);
    const polls = A.use('polls');
    await polls.createPoll({ question: 'pizza tonight?', options: ['yes', 'no'], chatId: chat.key });
    eq((await polls.listAll('ALL')).length, 0, 'not in the global list');
    const inChat = await polls.listAll('ALL', { chatId: chat.key });
    eq(inChat.length, 1, 'listed inside its chat');
    eq(inChat[0].chatId, chat.key, 'carries the chat it belongs to');
  });

  t('a poll in an open chat is readable and votable by another member', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('open chat', 'desc', null, 'GENERAL', 'OPEN', [], null);
    const created = await A.use('polls').createPoll({ question: 'when?', options: ['now', 'later'], chatId: chat.key });

    B.setActor();
    const poll = await B.use('polls').getPollById(created.key);
    eq(poll.question, 'when?', 'the question is readable');
    await B.use('polls').vote(created.key, ['later']);
    eq((await B.use('polls').getPollById(created.key)).counts.later, 1, 'the vote counts');
  });
});

describe('polls: rendering', (t) => {
  t('the list, the ballot, the results and the create form render', async () => {
    const { pollsView, singlePollView } = require('../../../src/views/polls_view');
    const poll = {
      id: '%poll.sha256', rootId: '%poll.sha256', tipId: '%poll.sha256',
      author: '@someone.ed25519', question: 'Where do we meet?',
      options: ['Plaza', 'Park'], anonymous: false, multiple: false, deadline: '', tags: ['meetup'],
      createdAt: new Date().toISOString(), status: 'OPEN',
      counts: { Plaza: 3, Park: 1 }, totalVoters: 4, voters: ['@a.ed25519'], votersHidden: false,
      myChoices: [], hasVoted: false, commentCount: 0, opinions: {}, opinions_inhabitants: []
    };

    const list = String(await pollsView([poll], 'ALL', { spreadMap: new Map() }));
    ok(list.includes('Where do we meet?'), 'the question is on the card');
    notOk(list.includes('type="radio"'), 'the reduced card keeps no ballot in the listing');
    notOk(list.includes('poll-bar-fill-75'), 'nor the results');
    notOk(list.includes('>false<'), 'no falsy value leaked into the html');

    const single = String(await singlePollView(poll, [], {}));
    ok(single.includes('type="radio"'), 'a single-choice poll offers radio buttons');

    const multi = String(await singlePollView({ ...poll, multiple: true }, [], {}));
    ok(multi.includes('type="checkbox"'), 'a multiple poll offers checkboxes');

    const voted = String(await singlePollView({ ...poll, hasVoted: true, myChoices: ['Plaza'] }, [], {}));
    ok(voted.includes('poll-bar-fill-75'), 'results show the winning bar at 75%');
    ok(voted.includes('3 (75%)'), 'and the numbers');

    const form = String(await pollsView([], 'CREATE', {}));
    ok(form.includes('/polls/create'), 'the form posts to the module');
    ok(form.includes('anonymous'), 'the anonymous switch is there');
    ok(form.includes('multiple'), 'the multiple switch is there');

    const detail = String(await singlePollView(poll, [], {}));
    ok(detail.includes('/polls/opinions/'), 'opinions are votable');
    ok(detail.includes('/comments'), 'comments are open');
    ok(detail.includes('@a.ed25519'), 'a public poll lists its voters');

    const anon = String(await singlePollView({ ...poll, anonymous: true, votersHidden: true, voters: [] }, [], {}));
    notOk(anon.includes('@a.ed25519'), 'an anonymous poll does not list voters');
  });
});

describe('polls: inside a tribe', (t) => {
  t('a tribe poll is encrypted, readable by members and invisible to outsiders', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const tribe = await A.use('tribes').createTribe('Secret Club', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const created = await A.use('polls').createPoll({
      question: 'secret question', options: ['a', 'b'], tribeId: tribe.key
    });

    const mine = await A.use('polls').listAll('ALL', { tribeId: tribe.key });
    eq(mine.length, 1, 'the member sees it');
    eq(mine[0].question, 'secret question', 'and can read it');
    ok(mine[0].encrypted, 'it travelled encrypted');

    const raw = net.log.find(m => m.key === created.key);
    const rawText = JSON.stringify(raw);
    notOk(rawText.includes('secret question'), 'the question is not in the clear in the log');
    notOk(rawText.includes('"a"') && rawText.includes('"b"'), 'nor are the options');

    B.setActor();
    const outside = await B.use('polls').listAll('ALL', { tribeId: tribe.key });
    eq(outside.filter(p => p.question).length, 0, 'an outsider reads nothing');
    eq((await B.use('polls').listAll('ALL')).length, 0, 'and it never shows in the global list');
  });

  t('a vote inside a tribe poll is encrypted too', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const tribe = await A.use('tribes').createTribe('Club', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const created = await A.use('polls').createPoll({ question: 'q', options: ['tomatoes', 'potatoes'], tribeId: tribe.key });
    await A.use('polls').vote(created.key, ['tomatoes']);

    const votes = net.log.filter(m => m.value && m.value.content && m.value.content.type === 'pollVote');
    eq(votes.length, 1, 'one vote published');
    notOk(JSON.stringify(votes[0]).includes('tomatoes'), 'the choice is not in the clear');
    const poll = await A.use('polls').getPollById(created.key);
    eq(poll.counts.tomatoes, 1, 'but the member tallies it fine');
  });
});

describe('polls: inside a LARP house', (t) => {
  t('a house poll stays in its house and never in the global list', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const polls = A.use('polls');
    await polls.createPoll({ question: 'global one', options: ['a', 'b'] });
    await polls.createPoll({ question: 'house one', options: ['a', 'b'], houseKey: 'solaris' });

    const global = await polls.listAll('ALL');
    eq(global.length, 1, 'only the global poll');
    eq(global[0].question, 'global one', 'the right one');

    const house = await polls.listAll('ALL', { houseKey: 'solaris' });
    eq(house.length, 1, 'the house sees its own');
    eq(house[0].houseKey, 'solaris', 'and it carries its house');
  });

  t('a house poll is public content, readable by anyone who can see the wall', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const created = await A.use('polls').createPoll({ question: 'what do we decree?', options: ['this', 'that'], houseKey: 'solaris' });
    B.setActor();
    const seen = await B.use('polls').getPollById(created.key);
    eq(seen.question, 'what do we decree?', 'a house poll is not encrypted');
    await B.use('polls').vote(created.key, ['this']);
    eq((await B.use('polls').getPollById(created.key)).counts.this, 1, 'and anyone shown it can vote');
  });
});

describe('polls: they travel with votations', (t) => {
  t('activity lists a poll under the votations filter, not on its own', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('polls').createPoll({ question: 'poll in activity', options: ['a', 'b'] });
    await new Promise((res, rej) => A.node.publish(
      { type: 'votes', question: 'a votation', options: ['YES', 'NO'], createdAt: new Date().toISOString() },
      (e) => e ? rej(e) : res()));

    const activity = A.use('activity');
    activity.invalidateCache();
    const votes = await activity.listFeed('votes');
    const types = votes.map(a => a.type).sort();
    eq(types.join(','), 'poll,votes', 'the votations filter carries both');
  });

  t('the trending votations filter carries polls too', () => {
    const { trendingView } = require('../../../src/views/trending_view');
    const poll = {
      key: '%poll.sha256',
      value: {
        author: '@a.ed25519', timestamp: Date.now(),
        content: { type: 'poll', question: 'trending poll', options: ['a', 'b'], votes: { a: 1 }, totalVotes: 1, opinions: {}, opinions_inhabitants: [] }
      }
    };
    const html = String(trendingView([poll], 'votes'));
    ok(html.includes('trending poll'), 'the poll shows under VOTATIONS');
  });
});

describe('polls: what you see once you have voted', (t) => {
  t('the ballot gives way to the result, and the outcome is named', async () => {
    const { pollsView, singlePollView } = require('../../../src/views/polls_view');
    const base = {
      id: '%p.sha256', rootId: '%p.sha256', tipId: '%p.sha256', author: '@a.ed25519',
      question: 'Where?', options: ['Plaza', 'Park'], anonymous: false, multiple: false,
      deadline: new Date(Date.now() + 86400000).toISOString(), tags: [],
      createdAt: new Date().toISOString(), status: 'OPEN',
      counts: { Plaza: 3, Park: 1 }, totalVoters: 4, voters: [], votersHidden: false,
      myChoices: [], hasVoted: false, commentCount: 0, opinions: {}, opinions_inhabitants: []
    };

    const list = String(await pollsView([base], 'ALL', {}));
    ok(list.includes('Where?'), 'the listing shows the question');
    notOk(list.includes('type="radio"'), 'but the ballot only lives in the detail view');

    const open = String(await singlePollView(base, [], {}));
    ok(open.includes('type="radio"'), 'before voting there is a ballot');
    ok(open.includes('A) Plaza') && open.includes('B) Park'), 'the ballot letters every option');
    notOk(open.includes(String(require('../../../src/views/main_views').i18n.pollChangeVote)), 'and no change-vote button');

    const voted = String(await singlePollView({ ...base, hasVoted: true, myChoices: ['Plaza'] }, [], {}));
    notOk(voted.includes('type="radio"'), 'after voting the options are gone');
    ok(voted.includes('poll-hue-0') && voted.includes('poll-hue-1'), 'each option keeps its own colour');
    ok(voted.includes('3 (75%)'), 'and the result is shown');

    const detail = String(await singlePollView({ ...base, hasVoted: true, myChoices: ['Plaza'] }, [], {}));
    ok(detail.includes('A) 75%'), 'the outcome names the winning option by its letter');
    notOk(/>\s*Plaza\s*</.test(detail.split('poll-results')[1] || ''), 'the results never echo what someone typed');
  });

  t('a poll with no votes says so instead of claiming a winner', async () => {
    const { singlePollView } = require('../../../src/views/polls_view');
    const empty = {
      id: '%p.sha256', rootId: '%p.sha256', tipId: '%p.sha256', author: '@a.ed25519',
      question: 'Where?', options: ['Plaza', 'Park'], anonymous: false, multiple: false,
      deadline: '', tags: [], createdAt: new Date().toISOString(), status: 'OPEN',
      counts: { Plaza: 0, Park: 0 }, totalVoters: 0, voters: [], votersHidden: false,
      myChoices: [], hasVoted: false, commentCount: 0, opinions: {}, opinions_inhabitants: []
    };
    const html = String(await singlePollView(empty, [], {}));
    ok(html.includes(String(require('../../../src/views/main_views').i18n.pollNoVotesYet)), 'it says there are no votes yet');
  });
});
