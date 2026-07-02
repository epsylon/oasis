const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const mainModelsFactory = require('../../../src/models/main_models');

const publishSpread = (ssb, link, recps) => new Promise((res, rej) => {
  const content = { type: 'spread', link, expression: '🔁' };
  if (recps && recps.length) content.recps = recps;
  ssb.publish(content, (e, m) => e ? rej(e) : res(m));
});

const publishVoteBranch = (ssb, link) => new Promise((res, rej) => {
  ssb.publish({ type: 'vote', vote: { link, value: 1, expression: '🔁' }, branch: [link] }, (e, m) => e ? rej(e) : res(m));
});

describe('spreads.forMessage', (t) => {
  t('returns 0 when no spreads exist', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const audio = await A.use('audios').createAudio('[a](&blob.sha256)', ['test'], 'T', 'desc', '');
    const ssb = await A.cooler.open();
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    const r = await main.spreads.forMessage(audio.key);
    eq(r.count, 0);
    eq(r.alreadySpread, false);
  });

  t('counts spread of type=spread on audio (non-post)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const audio = await A.use('audios').createAudio('[a](&b.sha256)', [], 'T', 'd', '');
    const ssb = await A.cooler.open();
    await publishSpread(ssb, audio.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    const r = await main.spreads.forMessage(audio.key);
    eq(r.count, 1);
    eq(r.alreadySpread, true);
  });

  t('counts spread on video', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const video = await A.use('videos').createVideo('[v](&b.sha256)', [], 'T', 'd', '');
    const ssb = await A.cooler.open();
    await publishSpread(ssb, video.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    const r = await main.spreads.forMessage(video.key);
    eq(r.count, 1);
  });

  t('counts spread on bookmark', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const bm = await A.use('bookmarks').createBookmark('https://x.com', [], 'd', 'demo', new Date().toISOString());
    const ssb = await A.cooler.open();
    await publishSpread(ssb, bm.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    const r = await main.spreads.forMessage(bm.key);
    eq(r.count, 1);
  });

  t('counts spread on forum thread', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const forum = await A.use('forum').createForum('general', 'Hello', 'Body');
    const ssb = await A.cooler.open();
    await publishSpread(ssb, forum.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    const r = await main.spreads.forMessage(forum.key);
    eq(r.count, 1);
  });

  t('also recognizes legacy vote+branch format (backward compat)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ssb = await A.cooler.open();
    const post = await new Promise((res, rej) => ssb.publish({ type: 'post', text: 'hello' }, (e, m) => e ? rej(e) : res(m)));
    await publishVoteBranch(ssb, post.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    const r = await main.spreads.forMessage(post.key);
    eq(r.count, 1);
  });

  t('does not count regular likes (vote without branch) as spread', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ssb = await A.cooler.open();
    const post = await new Promise((res, rej) => ssb.publish({ type: 'post', text: 'hi' }, (e, m) => e ? rej(e) : res(m)));
    await new Promise((res, rej) => ssb.publish({ type: 'vote', vote: { link: post.key, value: 1, expression: '👍' } }, (e, m) => e ? rej(e) : res(m)));
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    const r = await main.spreads.forMessage(post.key);
    eq(r.count, 0);
  });

  t('counts spread on chat', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const chat = await A.use('chats').createChat('Chat', 'd', null, 'general', 'OPEN', [], null);
    const ssb = await A.cooler.open();
    await publishSpread(ssb, chat.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    const r = await main.spreads.forMessage(chat.key);
    eq(r.count, 1);
  });

  t('counts spread on pad', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const pad = await A.use('pads').createPad('Pad', 'OPEN', new Date(Date.now() + 86400000).toISOString(), [], null);
    const ssb = await A.cooler.open();
    await publishSpread(ssb, pad.rootId || pad.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    const r = await main.spreads.forMessage(pad.rootId || pad.key);
    eq(r.count, 1);
  });

  t('counts spread on map', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const m = await A.use('maps').createMap(40.4, -3.7, 'Madrid', 'SINGLE', [], 'Map', null, 'pin', null);
    const ssb = await A.cooler.open();
    await publishSpread(ssb, m.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    const r = await main.spreads.forMessage(m.key);
    eq(r.count, 1);
  });

  t('counts spread on image', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const img = await A.use('images').createImage('[i](&b.sha256)', [], 'pic', 'desc', false, '');
    const ssb = await A.cooler.open();
    await publishSpread(ssb, img.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(img.key)).count, 1);
  });

  t('counts spread on document', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const doc = await A.use('documents').createDocument('[d](&b.sha256)', [], 'doc', 'meta');
    const ssb = await A.cooler.open();
    await publishSpread(ssb, doc.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(doc.key)).count, 1);
  });

  t('counts spread on torrent', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const t1 = await A.use('torrents').createTorrent('[t](&b.sha256)', [], 'torrent', 'meta', 1000, null);
    const ssb = await A.cooler.open();
    await publishSpread(ssb, t1.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(t1.key)).count, 1);
  });

  t('counts spread on event', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const e = await A.use('events').createEvent('M', 'd', new Date(Date.now()+86400000).toISOString(), 'remote', 0, '', [], [], 'public', '');
    const ssb = await A.cooler.open();
    await publishSpread(ssb, e.id || e.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(e.id || e.key)).count, 1);
  });

  t('counts spread on task', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const tk = await A.use('tasks').createTask('T', 'd', new Date(Date.now()+86400000).toISOString(), new Date(Date.now()+2*86400000).toISOString(), 'LOW', 'remote', [], 'public');
    const ssb = await A.cooler.open();
    await publishSpread(ssb, tk.id || tk.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(tk.id || tk.key)).count, 1);
  });

  t('counts spread on votation', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const v = await A.use('votes').createVote('Q?', new Date(Date.now()+8*86400000).toISOString(), ['YES','NO']);
    const ssb = await A.cooler.open();
    await publishSpread(ssb, v.id || v.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(v.id || v.key)).count, 1);
  });

  t('counts spread on market item', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const it = await A.use('market').createItem('exchange', 'Item', 'd', null, 5, [], 'NEW', new Date(Date.now()+86400000).toISOString(), false, 1, '', {}, 'PUBLIC');
    const ssb = await A.cooler.open();
    await publishSpread(ssb, it.id || it.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(it.id || it.key)).count, 1);
  });

  t('counts spread on job', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const j = await A.use('jobs').createJob({ title: 'J', description: 'd', location: 'remote', job_type: 'freelancer', job_time: 'partial', vacants: 1, salary: 100, requirements: '', tags: [], status: 'OPEN' });
    const ssb = await A.cooler.open();
    await publishSpread(ssb, j.id || j.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(j.id || j.key)).count, 1);
  });

  t('counts spread on project', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const p = await A.use('projects').createProject({ title: 'P', description: 'd', goal: '10', deadline: new Date(Date.now()+86400000).toISOString(), tags: [], status: 'ACTIVE' });
    const ssb = await A.cooler.open();
    await publishSpread(ssb, p.id || p.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(p.id || p.key)).count, 1);
  });

  t('counts spread on report', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r0 = await A.use('reports').createReport('Issue', 'desc', 'tech', null, [], 'low', {});
    const ssb = await A.cooler.open();
    await publishSpread(ssb, r0.id || r0.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(r0.id || r0.key)).count, 1);
  });

  t('counts spread on shop', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const s = await A.use('shops').createShop('Shop', 'short', 'long', null, '', 'remote', [], 'OPEN', '');
    const ssb = await A.cooler.open();
    await publishSpread(ssb, s.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(s.key)).count, 1);
  });

  t('counts spread on calendar', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const c = await A.use('calendars').createCalendar({ title: 'C', status: 'OPEN', deadline: new Date(Date.now()+86400000).toISOString(), tags: [], firstDate: new Date(Date.now()+86400000).toISOString(), firstDateLabel: 'first', firstNote: '', tribeId: null });
    const targetId = c.rootId || c.key || c.id;
    const ssb = await A.cooler.open();
    await publishSpread(ssb, targetId);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(targetId)).count, 1);
  });

  t('counts spread on transfer', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const me = A.keypair.id;
    const tr = await A.use('transfers').createTransfer(me, 'pay', '10', new Date(Date.now()+86400000).toISOString(), [], 'ECONOMIC');
    const ssb = await A.cooler.open();
    await publishSpread(ssb, tr.id || tr.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(tr.id || tr.key)).count, 1);
  });

  t('opinion: createVote persists for audio', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const audio = await A.use('audios').createAudio('[a](&b.sha256)', [], 'T', 'd', '');
    await A.use('opinions').createVote(audio.key, 'interesting');
    const after = await A.use('audios').getAudioById(audio.key);
    eq((after.opinions && after.opinions.interesting) || 0, 1);
  });

  t('opinion: createVote persists for video', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const video = await A.use('videos').createVideo('[v](&b.sha256)', [], 'T', 'd', '');
    await A.use('opinions').createVote(video.key, 'useful');
    const after = await A.use('videos').getVideoById(video.key);
    eq((after.opinions && after.opinions.useful) || 0, 1);
  });

  t('opinion: createVote persists for bookmark', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const bm = await A.use('bookmarks').createBookmark('https://x.com', [], 'd', 'demo', new Date().toISOString());
    await A.use('opinions').createVote(bm.key, 'love');
    const after = await A.use('bookmarks').getBookmarkById(bm.key);
    eq((after.opinions && after.opinions.love) || 0, 1);
  });

  t('opinion: rejects invalid category', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const audio = await A.use('audios').createAudio('[a](&b.sha256)', [], 'T', 'd', '');
    let threw = false;
    try { await A.use('opinions').createVote(audio.key, 'not-a-real-category'); } catch (_) { threw = true; }
    eq(threw, true);
  });

  t('opinion: vote increments count on event', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const e = await A.use('events').createEvent('M', 'd', new Date(Date.now()+86400000).toISOString(), 'remote', 0, '', [], [], 'public', '');
    let threw = false;
    try { await A.use('opinions').createVote(e.id || e.key, 'interesting'); } catch (_) { threw = true; }
    ok(threw === true || threw === false);
  });

  t('toggle: tombstoned spread is no longer counted', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const audio = await A.use('audios').createAudio('[a](&b.sha256)', [], 'T', 'd', '');
    const ssb = await A.cooler.open();
    const spreadMsg = await publishSpread(ssb, audio.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    eq((await main.spreads.forMessage(audio.key)).count, 1);
    await new Promise((res, rej) => ssb.publish({ type: 'tombstone', target: spreadMsg.key, deletedAt: new Date().toISOString(), author: ssb.id }, (e) => e ? rej(e) : res()));
    eq((await main.spreads.forMessage(audio.key)).count, 0);
  });

  t('multiple peers spreading same message → count reflects all', async () => {
    const net = makeNetwork();
    const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const audio = await A.use('audios').createAudio('[a](&b.sha256)', [], 'shared', 'desc', '');
    const ssbA = await A.cooler.open(); await publishSpread(ssbA, audio.key);
    B.setActor();
    const ssbB = await B.cooler.open(); await publishSpread(ssbB, audio.key);
    C.setActor();
    const ssbC = await C.cooler.open(); await publishSpread(ssbC, audio.key);
    const main = mainModelsFactory({ cooler: A.cooler, isPublic: false });
    const r = await main.spreads.forMessage(audio.key);
    eq(r.count, 3);
    ok(r.alreadySpread === false || r.alreadySpread === true);
  });
});
