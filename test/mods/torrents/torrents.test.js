const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const BLOB = '[t](&torrent00000000000000000000000000000000000000000000.sha256)';

describe('torrents: create + list + opinion', (t) => {
  t('A creates torrent', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('torrents').createTorrent(BLOB, ['linux'], 'Iso', 'd', 1000000, null);
    ok(r);
    const list = await A.use('torrents').listAll('all');
    ok(list.length >= 1);
  });

  t('A casts opinion on torrent', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('torrents').createTorrent(BLOB, [], 'T', '', 1, null);
    await A.use('torrents').createOpinion(r.key, 'interesting');
  });

  t('A deletes own torrent', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('torrents').createTorrent(BLOB, [], 'T', '', 1, null);
    await A.use('torrents').deleteTorrentById(r.key);
    const list = await A.use('torrents').listAll('all');
    const found = list.find(x => x.title === 'T');
    ok(!found);
  });
});
