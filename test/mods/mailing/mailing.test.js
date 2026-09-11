const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const subscribe = async (peer, id) => { peer.setActor(); await peer.use('subscriptions').setSubscription(id, 'mailing', true); };

describe('mailing: open lists, subscriptions and history', (t) => {
  t('A creates an OPEN list; it lists as ACTIVE with A as the only participant', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('mailing').createList({ title: 'Neighbours', description: 'Street news', listType: 'open', tags: 'street, news' });
    ok(r && r.key);
    const list = await A.use('mailing').listAll({ filter: 'all' });
    eq(list.length, 1);
    eq(list[0].title, 'Neighbours'); eq(list[0].listType, 'OPEN'); eq(list[0].status, 'ACTIVE');
    eq(list[0].participantCount, 1); eq(list[0].isOwner, true); eq(list[0].tags.join(','), 'street,news');
  });

  t('subscribers receive list messages in their private log and history; writing to an open list subscribes you', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('mailing').createList({ title: 'Neighbours', listType: 'OPEN' });
    await subscribe(B, r.key);
    A.setActor();
    const sent = await A.use('mailing').sendMessage(r.key, { subject: 'Hello', text: 'first message' });
    ok(sent.mid, 'a logical message id is generated');
    B.setActor();
    const inbox = await B.use('pm').listAllPrivate();
    const got = inbox.find(m => m.value.content.list === r.key);
    ok(got, 'the message reaches the inbox as a private post');
    eq(got.value.content.subject, 'Hello');
    const viewB = await B.use('mailing').getListById(r.key);
    eq(viewB.history.length, 1); eq(viewB.isMember, true); eq(viewB.participantCount, 2);
    C.setActor();
    const viewC = await C.use('mailing').getListById(r.key);
    eq(viewC.history.length, 0, 'outsiders see the list but not its messages');
    eq(viewC.canWrite, false);
    await C.use('mailing').sendMessage(r.key, { subject: 'x', text: 'y' });
    const viewC2 = await C.use('mailing').getListById(r.key);
    eq(viewC2.isMember, true, 'writing to an open list subscribes the writer');
    ok(viewC2.history.some(m => m.subject === 'x'), 'and the message is delivered');
  });

  t('replies keep the thread and the subject; everyone in the list can write', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('mailing').createList({ title: 'Neighbours', listType: 'OPEN' });
    await subscribe(B, r.key);
    A.setActor();
    const first = await A.use('mailing').sendMessage(r.key, { subject: 'Party', text: 'Saturday?' });
    B.setActor();
    const reply = await B.use('mailing').sendMessage(r.key, { text: 'Yes!', replyTo: first.mid });
    eq(reply.thread, first.thread, 'the reply lands in the same thread');
    A.setActor();
    const view = await A.use('mailing').getListById(r.key);
    eq(view.history.length, 2); eq(view.threadCount, 1);
    eq(view.history[1].subject, 'RE: Party'); eq(view.history[1].author, B.keypair.id);
  });

  t('the author updates title and status; an ARCHIVED list refuses new messages; others cannot edit', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('mailing').createList({ title: 'Old', listType: 'OPEN' });
    await subscribe(B, r.key);
    B.setActor();
    let denied = false;
    try { await B.use('mailing').updateList(r.key, { title: 'Hijack' }); } catch (_) { denied = true; }
    ok(denied, 'only the author updates');
    A.setActor();
    await A.use('mailing').updateList(r.key, { title: 'New' });
    await A.use('mailing').setStatus(r.key, 'ARCHIVED');
    const list = await A.use('mailing').getListById(r.key);
    eq(list.title, 'New'); eq(list.status, 'ARCHIVED'); eq(list.id, r.key, 'the id stays the root');
    let archived = false;
    try { await A.use('mailing').sendMessage(r.key, { subject: 's', text: 't' }); } catch (_) { archived = true; }
    ok(archived);
    eq((await A.use('mailing').listAll({ filter: 'archived' })).length, 1);
    eq((await A.use('mailing').listAll({ filter: 'active' })).length, 0);
  });

  t('deleting hides the list', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('mailing').createList({ title: 'Tmp', listType: 'OPEN' });
    await A.use('mailing').deleteList(r.key);
    notOk(await A.use('mailing').getListById(r.key));
    eq((await A.use('mailing').listAll({ filter: 'all' })).length, 0);
  });
});

describe('mailing: CLOSED lists are encrypted and invisible to outsiders', (t) => {
  t('members see the closed list and its messages; outsiders see nothing and the log carries only boxed content', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('mailing').createList({ title: 'Secret circle', listType: 'CLOSED', members: [B.keypair.id] });
    ok(r.key && !r.key.startsWith('%'), 'closed lists get a stable random id');
    const boxed = net.log.filter(m => typeof m.value.content === 'string');
    ok(boxed.length >= 1, 'the list record is boxed in the log');
    notOk(net.log.some(m => m.value.content && m.value.content.type === 'mailingList'), 'no plaintext list record');
    await A.use('mailing').sendMessage(r.key, { subject: 'Plan', text: 'meet at dawn' });
    notOk(net.log.some(m => m.value.content && m.value.content.text === 'meet at dawn'), 'no plaintext message');
    B.setActor();
    const viewB = await B.use('mailing').getListById(r.key);
    ok(viewB && viewB.closed, 'B sees the closed list');
    eq(viewB.history.length, 1); eq(viewB.history[0].text, 'meet at dawn');
    eq(viewB.participantCount, 2);
    C.setActor();
    notOk(await C.use('mailing').getListById(r.key), 'outsiders cannot even resolve the list');
    eq((await C.use('mailing').listAll({ filter: 'all' })).length, 0, 'not listed for outsiders');
  });

  t('a member leaves; the author removes members through an update', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('mailing').createList({ title: 'Circle', listType: 'CLOSED', members: [B.keypair.id, C.keypair.id] });
    B.setActor();
    await B.use('mailing').leaveList(r.key);
    A.setActor();
    let view = await A.use('mailing').getListById(r.key);
    eq(view.participantCount, 2, 'B left');
    notOk(view.members.includes(B.keypair.id));
    await A.use('mailing').updateList(r.key, { members: [] });
    view = await A.use('mailing').getListById(r.key);
    eq(view.participantCount, 1, 'C removed by the author');
    C.setActor();
    notOk(await C.use('mailing').getListById(r.key), 'a removed member loses access');
    eq((await C.use('mailing').listAll({ filter: 'closed' })).length, 0);
  });
});

describe('mailing: inbox integration', (t) => {
  t('list messages get their own inbox filter and a reply-to-list form; PMs stay in PMS', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const { privateView, getUserId } = require('../../../src/views/main_views');
    const viewer = await getUserId();
    const sender = makePeer(net).keypair.id;
    const listId = '%list.sha256';
    const iso = new Date().toISOString();
    const pm = (content) => ({ key: `%${Math.random().toString(36).slice(2)}.sha256`, value: { author: sender, content: { type: 'post', private: true, from: sender, sentAt: iso, ...content } }, timestamp: Date.now() });
    const messages = [
      pm({ to: [sender, viewer], subject: 'Hello', text: 'list message', list: listId, mid: 'm1', thread: 'm1' }),
      pm({ to: [sender, viewer], subject: 'Private', text: 'just for you' })
    ];
    const titles = { [listId]: { title: 'Neighbours', status: 'ACTIVE', closed: false } };
    const all = String(await privateView({ messages, listTitles: titles }, 'inbox'));
    ok(all.includes('value="mailing"'), 'the MAILING LISTS chip is offered');
    ok(all.includes('value="pms"'), 'the PMS chip is offered');
    const mailing = String(await privateView({ messages, listTitles: titles }, 'mailing'));
    ok(mailing.includes('list message') && !mailing.includes('just for you'), 'the mailing filter shows only list traffic');
    ok(mailing.includes(`/mailing/${encodeURIComponent(listId)}/message`), 'a reply form posts back to the list');
    ok(mailing.includes('Neighbours'), 'the card names the list');
    const pms = String(await privateView({ messages, listTitles: titles }, 'pms'));
    ok(pms.includes('just for you') && !pms.includes('list message'), 'PMS excludes list traffic');
  });
});
