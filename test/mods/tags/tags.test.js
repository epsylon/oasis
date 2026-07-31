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
    await A.use('bookmarks').createBookmark('https://tags.test/x', ['shared'], 'bm', '', '');
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
