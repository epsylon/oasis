const { eq, ok, deepEq } = require('../../../helpers/assert');
const { makeNetwork, makePeer } = require('../../../helpers/setup');

const BLOB = '[file](&audio0000000000000000000000000000000000000000000.sha256)';

describe('audios: publish + list', (t) => {
  t('A creates an audio, lists it', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('audios').createAudio(BLOB, ['music', 'electronic'], 'Track 1', 'description', '');
    ok(r && r.key);
    const list = await A.use('audios').listAll('all');
    eq(list.length, 1);
    eq(list[0].title, 'Track 1');
    deepEq(list[0].tags, ['music', 'electronic']);
  });

  t('A casts opinion on own audio (interesting)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('audios').createAudio(BLOB, [], 'T', '', '');
    await A.use('audios').createOpinion(r.key, 'interesting');
    const list = await A.use('audios').listAll('all');
    ok(list[0].opinions.interesting >= 1);
    ok(list[0].opinions_inhabitants.includes(A.keypair.id));
  });

  t('A updates an audio (no opinions yet)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('audios').createAudio(BLOB, [], 'Old', '', '');
    await A.use('audios').updateAudioById(r.key, BLOB, ['x'], 'New', 'newdesc', '');
    const list = await A.use('audios').listAll('all');
    eq(list[0].title, 'New');
  });

  t('A deletes audio (tombstone)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('audios').createAudio(BLOB, [], 'T', '', '');
    await A.use('audios').deleteAudioById(r.key);
    const list = await A.use('audios').listAll('all');
    eq(list.length, 0);
  });

  t('B sees A audio (public content)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('audios').createAudio(BLOB, [], 'Public Track', '', '');
    B.setActor();
    const list = await B.use('audios').listAll('all');
    eq(list.length, 1);
    eq(list[0].title, 'Public Track');
  });
});
