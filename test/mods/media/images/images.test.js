const { eq, ok } = require('../../../helpers/assert');
const { makeNetwork, makePeer } = require('../../../helpers/setup');

const BLOB = '[i](&image000000000000000000000000000000000000000000000.sha256)';

describe('images: publish + list', (t) => {
  t('A creates image (non-meme)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('images').createImage(BLOB, [], 'Pic', '', '');
    ok(r.key);
    const list = await A.use('images').listAll('all');
    eq(list.length, 1);
    eq(list[0].title, 'Pic');
  });

  t('an image no longer carries a meme category', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('images').createImage(BLOB, ['funny'], 'Funny', '', '');
    const list = await A.use('images').listAll('all');
    eq(list[0].title, 'Funny', 'the image is stored');
    eq(list[0].meme, undefined, 'and has no meme flag');
  });

  t('A casts opinion', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('images').createImage(BLOB, [], 'P', '', '');
    await A.use('images').createOpinion(r.key, 'interesting');
    const list = await A.use('images').listAll('all');
    ok(list[0].opinions_inhabitants.includes(A.keypair.id));
  });
});
