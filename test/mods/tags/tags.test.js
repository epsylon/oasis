const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const find = (tags, name) => tags.find(t => t.name.toLowerCase() === name.toLowerCase());

describe('tags: aggregate from content with tags', (t) => {
  t('listTags returns aggregated tags', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000000.sha256)', ['music', 'electronic'], 'X', '', '');
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000001.sha256)', ['music', 'jazz'], 'Y', '', '');
    const tagList = await A.use('tags').listTags('all');
    ok(Array.isArray(tagList));
  });

  t('counts reflect how many items carry each tag', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000010.sha256)', ['music', 'electronic'], 'X', '', '');
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000011.sha256)', ['music', 'jazz'], 'Y', '', '');
    const tags = await A.use('tags').listTags('all');
    eq(find(tags, 'music').count, 2, 'music on two items');
    eq(find(tags, 'electronic').count, 1, 'electronic on one');
    eq(find(tags, 'jazz').count, 1, 'jazz on one');
  });

  t('the same tag on different content types aggregates together', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000020.sha256)', ['shared'], 'A', '', '');
    await A.use('bookmarks').createBookmark('https://tags.test/x', ['shared'], 'bm', '');
    const tags = await A.use('tags').listTags('all');
    eq(find(tags, 'shared').count, 2, 'tag spans audio + bookmark');
  });

  t('top filter orders by descending count', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000030.sha256)', ['common', 'rare'], 'A', '', '');
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000031.sha256)', ['common'], 'B', '', '');
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000032.sha256)', ['common'], 'C', '', '');
    const tags = await A.use('tags').listTags('top');
    eq(tags[0].name.toLowerCase(), 'common', 'most used tag first');
    for (let i = 1; i < tags.length; i++) ok(tags[i - 1].count >= tags[i].count, 'non-increasing counts');
  });

  t('cloud filter attaches a normalized weight with the peak at 1', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000040.sha256)', ['big', 'small'], 'A', '', '');
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000041.sha256)', ['big'], 'B', '', '');
    const tags = await A.use('tags').listTags('cloud');
    ok(tags.every(x => typeof x.weight === 'number'), 'weights present');
    eq(find(tags, 'big').weight, 1, 'top tag weight is 1');
    ok(find(tags, 'small').weight < 1, 'less used tag below 1');
  });

  t('content without tags is not aggregated', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000050.sha256)', [], 'untagged', '', '');
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000051.sha256)', ['onlytag'], 'tagged', '', '');
    const tags = await A.use('tags').listTags('all');
    ok(find(tags, 'onlytag'), 'tagged content aggregated');
    eq(find(tags, 'onlytag').count, 1, 'only the tagged item counts');
  });

  t('tag matching is case-insensitive and hash-prefix tolerant', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000060.sha256)', ['Music'], 'A', '', '');
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000061.sha256)', ['#music'], 'B', '', '');
    const tags = await A.use('tags').listTags('all');
    eq(find(tags, 'music').count, 2, 'Music and #music collapse to one tag');
  });
});

describe('tags: search', (t) => {
  const seed = async (A, base) => {
    await A.use('audios').createAudio(`[a](&aud0000000000000000000000000000000000000000000${base}0.sha256)`, ['solarpunk', 'energy'], 'A', '', '');
    await A.use('audios').createAudio(`[a](&aud0000000000000000000000000000000000000000000${base}1.sha256)`, ['solar', 'music'], 'B', '', '');
  };

  t('an empty search returns everything', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await seed(A, '07');
    const all = await A.use('tags').listTags('all');
    eq((await A.use('tags').listTags('all', '')).length, all.length);
    eq((await A.use('tags').listTags('all', '   ')).length, all.length);
  });

  t('search keeps the tags containing the text', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await seed(A, '08');
    const names = (await A.use('tags').listTags('all', 'sol')).map(x => x.name.toLowerCase());
    ok(names.includes('solarpunk'));
    ok(names.includes('solar'));
    notOk(names.includes('music'));
  });

  t('search is case-insensitive and tolerates a leading hash', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await seed(A, '09');
    eq((await A.use('tags').listTags('all', 'ENERGY')).length, 1);
    eq((await A.use('tags').listTags('all', '#energy')).length, 1);
  });

  t('search that matches nothing returns an empty list', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await seed(A, '10');
    eq((await A.use('tags').listTags('all', 'zzzznope')).length, 0);
  });

  t('search composes with the top and cloud filters', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000110.sha256)', ['solar', 'moon'], 'A', '', '');
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000111.sha256)', ['solar', 'solarpunk'], 'B', '', '');
    const top = await A.use('tags').listTags('top', 'solar');
    eq(top.length, 2);
    eq(top[0].name.toLowerCase(), 'solar', 'most used match first');
    const cloud = await A.use('tags').listTags('cloud', 'solar');
    eq(cloud.length, 2);
    ok(cloud.every(x => typeof x.weight === 'number'), 'weights still computed');
  });
});

describe('tags: mine and recent', (t) => {
  t('the mine filter only keeps tags I have used', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    B.setActor();
    await B.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000200.sha256)', ['theirs'], 'B', '', '');
    A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000201.sha256)', ['mine'], 'A', '', '');
    const names = (await A.use('tags').listTags('mine')).map(x => x.name.toLowerCase());
    ok(names.includes('mine'));
    notOk(names.includes('theirs'), 'somebody else tag is out');
  });

  t('the recent filter keeps what was tagged this week', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000210.sha256)', ['fresh'], 'A', '', '');
    const names = (await A.use('tags').listTags('recent')).map(x => x.name.toLowerCase());
    ok(names.includes('fresh'));
  });

  t('every tag carries how many are mine and when it was last used', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&aud00000000000000000000000000000000000000000000220.sha256)', ['counted'], 'A', '', '');
    const tag = (await A.use('tags').listTags('all')).find(x => x.name.toLowerCase() === 'counted');
    eq(tag.mine, 1);
    ok(tag.lastTs > 0);
  });
});
