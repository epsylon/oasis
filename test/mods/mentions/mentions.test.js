const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const publishAs = (peer, content) => new Promise((res, rej) =>
  peer.node.publish(content, (err, msg) => err ? rej(err) : res(msg)));

describe('mentions: every module, not only posts', (t) => {
  t('a mention inside a blog post is found', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await publishAs(A, { type: 'post', text: `hello ${B.keypair.id}, look at this` });
    B.setActor();
    const list = await B.use('mentions').listMentions('ALL');
    eq(list.length, 1, 'one mention');
    eq(list[0].type, 'post', 'from a post');
  });

  t('a mention in an event description is found — it was invisible before', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const when = new Date(Date.now() + 86400000).toISOString();
    await A.use('events').createEvent('a meetup', `bring ${B.keypair.id} along`, when, 'here', 0, '', [], [], 'public');
    B.setActor();
    const list = await B.use('mentions').listMentions('ALL');
    eq(list.length, 1, 'the event is a mention');
    eq(list[0].type, 'event', 'typed as an event');
    ok(list[0].title, 'carries a title for the card');
  });

  t('mentions in a task, a report and a market item are all found', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const start = new Date(Date.now() + 3600000).toISOString();
    const end = new Date(Date.now() + 7200000).toISOString();
    await A.use('tasks').createTask('a task', `assigned with ${B.keypair.id}`, start, end, 'HIGH', '', [], 'PUBLIC');
    await A.use('reports').createReport('a report', `about ${B.keypair.id}`, 'BUGS', null, [], 'low', {});
    await publishAs(A, { type: 'market', title: 'a thing', description: `ask ${B.keypair.id}`, createdAt: new Date().toISOString() });

    B.setActor();
    const list = await B.use('mentions').listMentions('ALL');
    const types = list.map(x => x.type).sort();
    eq(list.length, 3, 'three mentions across three modules');
    eq(types.join(','), 'market,report,task', 'one per module');
  });

  t('the structured mentions array is honoured, not just the raw text', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await publishAs(A, { type: 'post', text: 'see [@friend](link)', mentions: [{ link: B.keypair.id, name: 'friend' }] });
    B.setActor();
    const list = await B.use('mentions').listMentions('ALL');
    eq(list.length, 1, 'found through the mentions array');
  });

  t('your own messages are not mentions of yourself', async () => {
    const net = makeNetwork(); const A = makePeer(net);
    A.setActor();
    await publishAs(A, { type: 'post', text: `note to self ${A.keypair.id}` });
    const list = await A.use('mentions').listMentions('ALL');
    eq(list.length, 0, 'self-mention ignored');
  });

  t('a deleted message stops being a mention', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const msg = await publishAs(A, { type: 'post', text: `hi ${B.keypair.id}` });
    B.setActor();
    eq((await B.use('mentions').listMentions('ALL')).length, 1, 'visible while alive');
    A.setActor();
    await publishAs(A, { type: 'tombstone', target: msg.key, deletedAt: new Date().toISOString() });
    B.setActor();
    eq((await B.use('mentions').listMentions('ALL')).length, 0, 'gone once tombstoned');
  });

  t('profile and vote noise never shows up as a mention', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await publishAs(A, { type: 'about', about: B.keypair.id, name: 'friend' });
    await publishAs(A, { type: 'contact', contact: B.keypair.id, following: true });
    B.setActor();
    eq((await B.use('mentions').listMentions('ALL')).length, 0, 'about/contact filtered out');
  });

  t('filtering by type narrows the list and the counts add up', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await publishAs(A, { type: 'post', text: `one ${B.keypair.id}` });
    await publishAs(A, { type: 'post', text: `two ${B.keypair.id}` });
    const when = new Date(Date.now() + 86400000).toISOString();
    await A.use('events').createEvent('meetup', `with ${B.keypair.id}`, when, 'here', 0, '', [], [], 'public');

    B.setActor();
    const mentions = B.use('mentions');
    const all = await mentions.listMentions('ALL');
    eq(all.length, 3, 'three in total');
    const counts = await mentions.countTypes(all);
    eq(counts.post, 2, 'two posts');
    eq(counts.event, 1, 'one event');
    eq((await mentions.listMentions('event')).length, 1, 'filtering by event returns one');
  });
});

describe('mentions: what must never show up there', (t) => {
  t('private and tribe-scoped content is not a mention', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await publishAs(A, { type: 'post', text: `psst ${B.keypair.id}`, recps: [A.keypair.id, B.keypair.id] });
    await publishAs(A, { type: 'task', title: 'inside the tribe', description: `for ${B.keypair.id}`, tribeId: '%tribe.sha256' });
    await publishAs(A, { type: 'report', title: 'sealed', encryptedPayload: `xxx ${B.keypair.id}` });
    await publishAs(A, { type: 'post', text: `and this one is public, ${B.keypair.id}` });

    B.setActor();
    const list = await B.use('mentions').listMentions('ALL');
    eq(list.length, 1, 'only the public one');
    ok(list[0].text.includes('public'), 'and it is the public post');
  });

  t('editing the message that mentions me leaves one mention, not two', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const first = await publishAs(A, { type: 'post', text: `hi ${B.keypair.id}` });
    await publishAs(A, { type: 'post', text: `hi again ${B.keypair.id}`, replaces: first.key });

    B.setActor();
    const list = await B.use('mentions').listMentions('ALL');
    eq(list.length, 1, 'only the current version');
    ok(list[0].text.includes('again'), 'and it is the edited one');
  });
});

describe('mentions: the notification counter', (t) => {
  t('what I have already opened stops counting, what arrives later does not', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await publishAs(A, { type: 'post', text: `one for ${B.keypair.id}` });

    B.setActor();
    const mentions = B.use('mentions');
    const first = await mentions.listMentions('ALL');
    eq(mentions.unseenOf(first).length, 1, 'the first one is unseen');

    mentions.markSeen(first);
    eq(mentions.unseenOf(first).length, 0, 'after opening the page it stops counting');

    A.setActor();
    await publishAs(A, { type: 'post', text: `another for ${B.keypair.id}` });
    B.setActor();
    const second = await mentions.listMentions('ALL');
    eq(second.length, 2, 'both mentions are listed');
    eq(mentions.unseenOf(second).length, 1, 'only the new one is counted');
  });

  t('a mention that replicates late is still counted even if its timestamp is old', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await publishAs(A, { type: 'post', text: `seen one ${B.keypair.id}` });
    B.setActor();
    const mentions = B.use('mentions');
    const known = await mentions.listMentions('ALL');
    mentions.markSeen(known);

    const late = [{ key: '%late.sha256', ts: 1, type: 'post', text: 'old but new to me' }];
    eq(mentions.unseenOf(known.concat(late)).length, 1, 'the late arrival is counted');
  });

  t('a mention can be marked read and unread one by one, and the counter follows', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await publishAs(A, { type: 'post', text: `first ${B.keypair.id}` });
    await publishAs(A, { type: 'post', text: `second ${B.keypair.id}` });
    B.setActor();
    const mentions = B.use('mentions');
    const list = await mentions.listMentions('ALL');
    eq(list.length, 2, 'two mentions');
    eq(mentions.unseenOf(list).length, 2, 'both unread at first');

    mentions.markRead(list[0].key);
    ok(mentions.readKeys().has(list[0].key), 'the key is stored as read');
    eq(mentions.unseenOf(list).length, 1, 'one left unread');

    mentions.markUnread(list[0].key);
    ok(!mentions.readKeys().has(list[0].key), 'unread removes the key');
    eq(mentions.unseenOf(list).length, 2, 'back to two unread');

    mentions.markReadMany(list.map(x => x.key));
    eq(mentions.unseenOf(list).length, 0, 'mark all leaves nothing unread');
  });
});

describe('mentions: a feed post from somebody else', (t) => {
  t('pasting my oasis id into their feed reaches my mentions', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    B.setActor();
    await B.use('feed').createFeed(`look at this ${A.keypair.id}`, []);
    A.setActor();
    const list = await A.use('mentions').listMentions('ALL');
    eq(list.length, 1, 'the feed post is a mention');
    eq(list[0].type, 'feed', 'and it is tagged as a feed');
  });

  t('pasting my own id into my own feed is not a mention of me', async () => {
    const net = makeNetwork(); const A = makePeer(net);
    A.setActor();
    await A.use('feed').createFeed(`note to self ${A.keypair.id}`, []);
    const list = await A.use('mentions').listMentions('ALL');
    eq(list.length, 0, 'talking to yourself never notifies you');
  });
});

describe('mentions: versions republished by other inhabitants', (t) => {
  const raw = (net, key) => net.log.find(m => m.key === key).value.content;

  t('a chain crossing other authors is one mention, by its author, with its latest content', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net); const V = makePeer(net);
    A.setActor();
    const r = await publishAs(A, { type: 'event', title: 'Picnic', description: `bring ${V.keypair.id}`, author: A.keypair.id, createdAt: new Date().toISOString() });
    const b = await publishAs(B, { ...raw(net, r.key), replaces: r.key });
    const c = await publishAs(C, { ...raw(net, b.key), replaces: b.key });
    await publishAs(A, { ...raw(net, c.key), title: 'Picnic II', replaces: c.key });
    V.setActor();
    const list = await V.use('mentions').listMentions('ALL');
    eq(list.length, 1);
    eq(list[0].author, A.keypair.id);
    eq(list[0].title, 'Picnic II');
  });

  t('a foreign copy neither hides the original nor shows up as the copier mention', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const V = makePeer(net);
    A.setActor();
    const r = await publishAs(A, { type: 'event', title: 'Fair', description: `see ${V.keypair.id}`, author: A.keypair.id, createdAt: new Date().toISOString() });
    await publishAs(B, { ...raw(net, r.key), title: 'Fair by B', replaces: r.key });
    V.setActor();
    const list = await V.use('mentions').listMentions('ALL');
    eq(list.length, 1);
    eq(list[0].key, r.key);
    eq(list[0].author, A.keypair.id);
    eq(list[0].title, 'Fair');
  });
});

describe('mentions: by name, not only by id', (t) => {
  t('writing @name reaches the mentions of the inhabitant with that name; an email address does not', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    B.setActor();
    await publishAs(B, { type: 'about', about: B.keypair.id, name: 'jdrm' });
    A.setActor();
    await publishAs(A, { type: 'post', text: 'gracias @jdrm, era cosa nuestra.' });
    await publishAs(A, { type: 'post', text: 'escribe a mail@jdrm.com' });
    await publishAs(A, { type: 'post', text: 'hola @JDRM' });
    B.setActor();
    const list = await B.use('mentions').listMentions('ALL');
    eq(list.length, 2, 'the two mentions by name, in any case, and not the email');
    ok(list.every(m => /@jdrm/i.test(m.content.text)));
  });

  t('rendered text links a known @name, leaves unknown names and emails alone, and stays plain on the clearnet', () => {
    const rst = require('../../../src/backend/renderStyledText');
    const id = '@' + 'J'.repeat(43) + '=.ed25519';
    rst.setMentionResolver(null);
    const plain = String(rst.renderStyledHtml('hola @jdrm'));
    ok(plain.includes('@jdrm') && !plain.includes('href'), 'without a resolver the name is plain text');
    rst.setMentionResolver((name) => name === 'jdrm' ? id : null);
    try {
      const linked = String(rst.renderStyledHtml('hola @jdrm, mira mail@jdrm.com y @nadie'));
      ok(linked.includes(`href="/author/${encodeURIComponent(id)}"`) && linked.includes('class="mention"'), 'a known name becomes a mention link');
      ok(linked.includes('mail@jdrm.com') && !linked.includes('mailto:@'), 'the email keeps its shape');
      ok(linked.includes('@nadie') && (linked.match(/class="mention"/g) || []).length === 1, 'an unknown name is left alone');
      const clearnet = String(rst.renderStyledHtml('hola @jdrm', { internalLinks: false }));
      ok(clearnet.includes('@jdrm') && !clearnet.includes('/author/'), 'on the clearnet names are not linked');
    } finally { rst.setMentionResolver(null); }
  });
});
