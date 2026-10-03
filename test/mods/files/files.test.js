const { eq, ok, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const BLOB = '[t](&file00000000000000000000000000000000000000000000.sha256)';

describe('files: create + list + opinion', (t) => {
  t('A creates file', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('files').createFile(BLOB, ['linux'], 'Iso', 'd', 1000000, null);
    ok(r);
    const list = await A.use('files').listAll('all');
    ok(list.length >= 1);
  });

  t('A casts opinion on file', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('files').createFile(BLOB, [], 'T', '', 1, null);
    await A.use('files').createOpinion(r.key, 'interesting');
  });

  t('A deletes own file', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('files').createFile(BLOB, [], 'T', '', 1, null);
    await A.use('files').deleteFileById(r.key);
    const list = await A.use('files').listAll('all');
    const found = list.find(x => x.title === 'T');
    ok(!found);
  });
});

describe('files: get + update', (t) => {
  t('getFileById returns stored fields', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('files').createFile(BLOB, ['linux', 'iso'], 'Debian', 'a distro', 700, null);
    const tor = await A.use('files').getFileById(r.key, A.keypair.id);
    ok(tor);
    eq(tor.title, 'Debian');
    eq(tor.description, 'a distro');
    eq(tor.author, A.keypair.id);
    ok(tor.tags.includes('linux'));
  });

  t('A updates own file title/description', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('files').createFile(BLOB, ['x'], 'Old', 'old desc', 1, null);
    await A.use('files').updateFileById(r.key, null, undefined, 'New', 'new desc');
    const list = await A.use('files').listAll('all');
    const found = list.find(x => x.title === 'New');
    ok(found);
    eq(found.description, 'new desc');
    ok(!list.find(x => x.title === 'Old'));
  });

  t('getFileById throws after delete', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('files').createFile(BLOB, [], 'Gone', '', 1, null);
    await A.use('files').deleteFileById(r.key);
    await throwsAsync(() => A.use('files').getFileById(r.key, A.keypair.id), /not found/i);
  });
});

describe('files: permissions + filters', (t) => {
  t('non-author cannot update a file', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('files').createFile(BLOB, [], 'Mine', '', 1, null);
    B.setActor();
    await throwsAsync(() => B.use('files').updateFileById(r.key, null, undefined, 'Hacked', undefined), /author/i);
  });

  t('non-author cannot delete a file', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('files').createFile(BLOB, [], 'Mine', '', 1, null);
    B.setActor();
    await throwsAsync(() => B.use('files').deleteFileById(r.key), /author/i);
  });

  t("filter 'mine' returns only the viewer's files", async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('files').createFile(BLOB, [], 'ByA', '', 1, null);
    B.setActor();
    await B.use('files').createFile(BLOB, [], 'ByB', '', 1, null);
    const mine = await B.use('files').listAll('mine');
    ok(mine.length >= 1);
    ok(mine.every(x => x.author === B.keypair.id));
    ok(!mine.find(x => x.title === 'ByA'));
  });
});

describe('files: opinions validation', (t) => {
  t('invalid opinion category is rejected', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('files').createFile(BLOB, [], 'T', '', 1, null);
    await throwsAsync(() => A.use('files').createOpinion(r.key, 'not-a-category'), /category/i);
  });

  t('a voter cannot cast two opinions on the same file', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('files').createFile(BLOB, [], 'T', '', 1, null);
    await A.use('files').createOpinion(r.key, 'interesting');
    await throwsAsync(() => A.use('files').createOpinion(r.key, 'necessary'), /already voted/i);
  });
});
