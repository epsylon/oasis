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

const BCS_BLOB_ID = '&bcs00000000000000000000000000000000000000000000.sha256';

describe('audios: BCS (Blockchain Sounds)', (t) => {
  t('createBcsAudio publishes an audio tagged "bcs" with composition', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const composition = [
      { type: 'post',  name: 'C4', durMs: 250, id: '%blk1.sha256' },
      { type: 'vote',  name: 'D4', durMs: 220, id: '%blk2.sha256' },
      { type: 'audio', name: 'E4', durMs: 280, id: '%blk3.sha256' }
    ];
    const r = await A.use('audios').createBcsAudio(BCS_BLOB_ID, 'Title', 'Desc', composition);
    ok(r && r.key);
    const list = await A.use('audios').listAll('all');
    eq(list.length, 1);
    const a = list[0];
    eq(a.title, 'Title');
    eq(a.description, 'Desc');
    eq(a.url, BCS_BLOB_ID);
    eq(a.isBcs, true);
    deepEq(a.tags, ['bcs']);
    ok(Array.isArray(a.bcsComposition));
    eq(a.bcsComposition.length, 3);
    eq(a.bcsComposition[0].t, 'post');
    eq(a.bcsComposition[0].n, 'C4');
    eq(a.bcsComposition[0].d, 250);
    eq(a.bcsComposition[0].id, '%blk1.sha256');
  });

  t('BCS filter returns only audios with composition / "bcs" tag', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio(BLOB, ['music'], 'Plain Audio', '', '');
    await A.use('audios').createBcsAudio(BCS_BLOB_ID, 'BCS One', '', [
      { type: 'post', name: 'C4', durMs: 250 }
    ]);
    const all = await A.use('audios').listAll('all');
    eq(all.length, 2);
    const bcsOnly = await A.use('audios').listAll('bcs');
    eq(bcsOnly.length, 1);
    eq(bcsOnly[0].title, 'BCS One');
    eq(bcsOnly[0].isBcs, true);
  });

  t('non-BCS audio has isBcs=false and null bcsComposition', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('audios').createAudio(BLOB, ['music'], 'Plain', '', '');
    const a = await A.use('audios').getAudioById(r.key);
    eq(a.isBcs, false);
    eq(a.bcsComposition, null);
  });

  t('B sees A BCS audio with composition preserved across feed boundary', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('audios').createBcsAudio(BCS_BLOB_ID, 'Shared BCS', 'd', [
      { type: 'post', name: 'C4', durMs: 250, id: '%blk1.sha256' },
      { type: 'vote', name: 'G4', durMs: 300, id: '%blk2.sha256' }
    ]);
    B.setActor();
    const list = await B.use('audios').listAll('bcs');
    eq(list.length, 1);
    eq(list[0].author, A.keypair.id);
    eq(list[0].isBcs, true);
    eq(list[0].bcsComposition.length, 2);
  });

  t('createBcsAudio drops malformed notes and caps to 512 entries', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const noisy = [
      { type: 'post', name: 'C4', durMs: 200, id: '%a.sha256' },
      { type: '',     name: 'D4', durMs: 200 },
      { type: 'vote', name: '',   durMs: 200 },
      { name: 'F4' },
      { type: 'audio', name: 'A4', durMs: 200, id: '%b.sha256' }
    ];
    const r = await A.use('audios').createBcsAudio(BCS_BLOB_ID, 'T', '', noisy);
    const a = await A.use('audios').getAudioById(r.key);
    eq(a.bcsComposition.length, 2);
    eq(a.bcsComposition[0].t, 'post');
    eq(a.bcsComposition[1].t, 'audio');
  });
});
