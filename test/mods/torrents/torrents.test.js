const { eq, ok, throwsAsync } = require('../../helpers/assert');
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

describe('torrents: get + update', (t) => {
  t('getTorrentById returns stored fields', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('torrents').createTorrent(BLOB, ['linux', 'iso'], 'Debian', 'a distro', 700, null);
    const tor = await A.use('torrents').getTorrentById(r.key, A.keypair.id);
    ok(tor);
    eq(tor.title, 'Debian');
    eq(tor.description, 'a distro');
    eq(tor.author, A.keypair.id);
    ok(tor.tags.includes('linux'));
  });

  t('A updates own torrent title/description', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('torrents').createTorrent(BLOB, ['x'], 'Old', 'old desc', 1, null);
    await A.use('torrents').updateTorrentById(r.key, null, undefined, 'New', 'new desc');
    const list = await A.use('torrents').listAll('all');
    const found = list.find(x => x.title === 'New');
    ok(found);
    eq(found.description, 'new desc');
    ok(!list.find(x => x.title === 'Old'));
  });

  t('getTorrentById throws after delete', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('torrents').createTorrent(BLOB, [], 'Gone', '', 1, null);
    await A.use('torrents').deleteTorrentById(r.key);
    await throwsAsync(() => A.use('torrents').getTorrentById(r.key, A.keypair.id), /not found/i);
  });
});

describe('torrents: permissions + filters', (t) => {
  t('non-author cannot update a torrent', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('torrents').createTorrent(BLOB, [], 'Mine', '', 1, null);
    B.setActor();
    await throwsAsync(() => B.use('torrents').updateTorrentById(r.key, null, undefined, 'Hacked', undefined), /author/i);
  });

  t('non-author cannot delete a torrent', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('torrents').createTorrent(BLOB, [], 'Mine', '', 1, null);
    B.setActor();
    await throwsAsync(() => B.use('torrents').deleteTorrentById(r.key), /author/i);
  });

  t("filter 'mine' returns only the viewer's torrents", async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('torrents').createTorrent(BLOB, [], 'ByA', '', 1, null);
    B.setActor();
    await B.use('torrents').createTorrent(BLOB, [], 'ByB', '', 1, null);
    const mine = await B.use('torrents').listAll('mine');
    ok(mine.length >= 1);
    ok(mine.every(x => x.author === B.keypair.id));
    ok(!mine.find(x => x.title === 'ByA'));
  });
});

describe('torrents: opinions validation', (t) => {
  t('invalid opinion category is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('torrents').createTorrent(BLOB, [], 'T', '', 1, null);
    await throwsAsync(() => A.use('torrents').createOpinion(r.key, 'not-a-category'), /category/i);
  });

  t('a voter cannot cast two opinions on the same torrent', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('torrents').createTorrent(BLOB, [], 'T', '', 1, null);
    await A.use('torrents').createOpinion(r.key, 'interesting');
    await throwsAsync(() => A.use('torrents').createOpinion(r.key, 'necessary'), /already voted/i);
  });
});
