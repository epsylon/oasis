const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const AUDIO = '\n[audio:ep1.mp3](&aaaa.sha256)';
const VIDEO = '\n[video:ep2.mp4](&bbbb.sha256)';
const COVER = '\n![image:cover.png](&cccc.sha256)';

describe('podcasts: channels and episodes', (t) => {
  t('A creates a channel with a cover; episodes get numbered by publication order', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const ch = await A.use('podcasts').createChannel({ title: 'Night talks', description: 'Late conversations', category: 'talk', cover: COVER, tags: 'night, talk' });
    ok(ch && ch.key);
    const e1 = await A.use('podcasts').addEpisode(ch.key, { title: 'Pilot', media: AUDIO });
    const e2 = await A.use('podcasts').addEpisode(ch.key, { title: 'Second', media: VIDEO, description: 'with video' });
    const list = await A.use('podcasts').listAll({ filter: 'all' });
    eq(list.length, 1);
    const c = list[0];
    eq(c.title, 'Night talks'); eq(c.category, 'TALK'); eq(c.cover.kind, 'image'); eq(c.cover.blobId, '&cccc.sha256');
    eq(c.episodeCount, 2); eq(c.episodes[0].number, 1); eq(c.episodes[1].number, 2);
    eq(c.episodes[0].media.kind, 'audio'); eq(c.episodes[1].media.kind, 'video'); eq(c.episodes[1].media.name, 'ep2.mp4');
    eq((await A.use('podcasts').listAll({ filter: 'talk' })).length, 1, 'category filter');
    eq((await A.use('podcasts').listAll({ filter: 'music' })).length, 0);
    const ep = await A.use('podcasts').getEpisodeById(e1.key);
    eq(ep.channel.id, ch.key);
    ok(e2.key);
    let bad = false;
    try { await A.use('podcasts').addEpisode(ch.key, { title: 'No media', media: COVER }); } catch (_) { bad = true; }
    ok(bad, 'an episode needs audio or video');
  });

  t('only the author publishes, edits and deletes; edits keep the ids; deleting the channel hides it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const ch = await A.use('podcasts').createChannel({ title: 'Show', category: 'MUSIC' });
    const e1 = await A.use('podcasts').addEpisode(ch.key, { title: 'One', media: AUDIO });
    B.setActor();
    let denied = 0;
    try { await B.use('podcasts').addEpisode(ch.key, { title: 'Hijack', media: AUDIO }); } catch (_) { denied++; }
    try { await B.use('podcasts').updateChannel(ch.key, { title: 'Hijack' }); } catch (_) { denied++; }
    try { await B.use('podcasts').deleteEpisode(e1.key); } catch (_) { denied++; }
    eq(denied, 3);
    A.setActor();
    await A.use('podcasts').updateChannel(ch.key, { title: 'Show v2' });
    await A.use('podcasts').updateEpisode(e1.key, { title: 'One (remastered)' });
    const c = await A.use('podcasts').getChannelById(ch.key);
    eq(c.title, 'Show v2'); eq(c.id, ch.key); eq(c.episodes.length, 1); eq(c.episodes[0].title, 'One (remastered)'); eq(c.episodes[0].id, e1.key);
    eq((await A.use('podcasts').listAll({ filter: 'all' })).length, 1, 'one channel after the edit, not two');
    await A.use('podcasts').deleteEpisode(e1.key);
    eq((await A.use('podcasts').getChannelById(ch.key)).episodeCount, 0);
    await A.use('podcasts').deleteChannel(ch.key);
    notOk(await A.use('podcasts').getChannelById(ch.key));
  });

  t('plays count once per inhabitant and opinions once per inhabitant; VIEWERS and TOP order by them', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const quiet = await A.use('podcasts').createChannel({ title: 'Quiet', category: 'NEWS' });
    await A.use('podcasts').addEpisode(quiet.key, { title: 'q1', media: AUDIO });
    const loud = await A.use('podcasts').createChannel({ title: 'Loud', category: 'NEWS' });
    const ep = await A.use('podcasts').addEpisode(loud.key, { title: 'l1', media: AUDIO });
    B.setActor();
    await B.use('podcasts').markPlayed(ep.key);
    eq(await B.use('podcasts').markPlayed(ep.key), null, 'a second play by the same inhabitant is ignored');
    await B.use('podcasts').createOpinion(ep.key, 'interesting');
    let twice = false;
    try { await B.use('podcasts').createOpinion(ep.key, 'useful'); } catch (_) { twice = true; }
    ok(twice);
    C.setActor();
    await C.use('podcasts').markPlayed(ep.key);
    A.setActor();
    const e = await A.use('podcasts').getEpisodeById(ep.key);
    eq(e.playCount, 2); eq(e.opinions.interesting, 1); eq(e.opinions_inhabitants.length, 1);
    const viewers = await A.use('podcasts').listAll({ filter: 'viewers' });
    eq(viewers.length, 1); eq(viewers[0].id, loud.key); eq(viewers[0].playCount, 2);
    const top = await A.use('podcasts').listAll({ filter: 'top' });
    eq(top.length, 1); eq(top[0].id, loud.key);
    const eps = await A.use('podcasts').listEpisodes({ filter: 'viewers' });
    eq(eps.length, 1); eq(eps[0].channel.title, 'Loud');
  });

  t('inhabitants can give one opinion on a channel, and the channel total adds episode opinions', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const ch = await A.use('podcasts').createChannel({ title: 'Night talks', description: '', category: 'TALK', tags: '' });
    const ep = await A.use('podcasts').addEpisode(ch.key, { title: 'Pilot', description: '', media: '[audio:a.mp3](&a.sha256)' });
    B.setActor();
    await B.use('podcasts').createOpinion(ch.key, 'interesting');
    let twice = false;
    try { await B.use('podcasts').createOpinion(ch.key, 'inspiring'); } catch (_) { twice = true; }
    ok(twice, 'one opinion per inhabitant on a channel');
    C.setActor();
    await C.use('podcasts').createOpinion(ep.key, 'interesting');
    A.setActor();
    const view = await A.use('podcasts').getChannelById(ch.key);
    eq(view.opinions.interesting, 1); eq(view.opinions_inhabitants.length, 1); eq(view.opinionCount, 2);
    eq(view.episodes[0].opinionCount, 1);
  });
});
