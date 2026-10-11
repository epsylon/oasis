const { eq, ok, notOk, throwsAsync } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const publishAs = async (peer, content) => {
  const ssb = await peer.cooler.open();
  return new Promise((res, rej) => ssb.publish(content, (err, msg) => err ? rej(err) : res(msg)));
};

describe('reports: create + list + confirm', (t) => {
  t('A creates a report', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('reports').createReport('Bug', 'description', 'tech', null, ['bug'], 'medium', {});
    ok(r);
    const list = await A.use('reports').listAll();
    ok(list.length >= 1);
    eq(list[0].title, 'Bug');
  });

  t('B confirms A report', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('reports').createReport('X', 'd', 'tech', null, [], 'low', {});
    B.setActor();
    await B.use('reports').confirmReportById(r.key);
    const list = await B.use('reports').listAll();
    const target = list.find(x => x.title === 'X');
    ok(target);
    ok(target.confirmations.includes(B.keypair.id));
  });

  t('A deletes own report', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('reports').createReport('Y', 'd', 'tech', null, [], 'low', {});
    await A.use('reports').deleteReportById(r.key);
    const list = await A.use('reports').listAll();
    const found = list.find(x => x.title === 'Y');
    ok(!found);
  });
});

describe('reports: get + normalization + edit', (t) => {
  t('getReportById returns created fields', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('reports').createReport('Detail', 'body', 'tech', null, ['a', 'b'], 'medium', {});
    const rep = await A.use('reports').getReportById(r.key);
    eq(rep.title, 'Detail');
    eq(rep.description, 'body');
    eq(rep.author, A.keypair.id);
    eq(rep.status, 'OPEN');
    ok(rep.tags.includes('a'));
  });

  t('severity and category are normalized', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('reports').createReport('Norm', 'd', 'bugs', null, [], 'HIGH', {});
    const rep = await A.use('reports').getReportById(r.key);
    eq(rep.severity, 'high');
    eq(rep.category, 'BUGS');
  });

  t('BUGS template fields are captured', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('reports').createReport('Tpl', 'd', 'BUGS', null, [], 'low', {
      stepsToReproduce: 'click', expectedBehavior: 'works', actualBehavior: 'breaks'
    });
    const rep = await A.use('reports').getReportById(r.key);
    eq(rep.template.stepsToReproduce, 'click');
    eq(rep.template.expectedBehavior, 'works');
  });

  t('author edits title and severity', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('reports').createReport('Old', 'd', 'tech', null, [], 'low', {});
    await A.use('reports').updateReportById(r.key, { title: 'New', severity: 'high' });
    const rep = await A.use('reports').getReportById(r.key);
    eq(rep.title, 'New');
    eq(rep.severity, 'high');
  });

  t('status transition via update is normalized', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('reports').createReport('St', 'd', 'tech', null, [], 'low', {});
    await A.use('reports').updateReportById(r.key, { status: 'in progress' });
    const rep = await A.use('reports').getReportById(r.key);
    eq(rep.status, 'IN_PROGRESS');
  });
});

describe('reports: confirm + opinions', (t) => {
  t('author cannot confirm own report', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('reports').createReport('Own', 'd', 'tech', null, [], 'low', {});
    await throwsAsync(() => A.use('reports').confirmReportById(r.key), /Cannot confirm own report/);
  });

  t('cannot confirm twice', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('reports').createReport('Twice', 'd', 'tech', null, [], 'low', {});
    B.setActor();
    await B.use('reports').confirmReportById(r.key);
    await throwsAsync(() => B.use('reports').confirmReportById(r.key), /Already confirmed/);
  });

  t('B opines on A report', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('reports').createReport('Op', 'd', 'tech', null, [], 'low', {});
    B.setActor();
    await B.use('reports').createOpinion(r.key, 'interesting');
    const rep = await B.use('reports').getReportById(r.key);
    ok(rep.opinions_inhabitants.includes(B.keypair.id));
    eq(rep.opinions.interesting, 1);
    await throwsAsync(() => B.use('reports').createOpinion(r.key, 'interesting'), /Already opined/);
  });
});

describe('reports: permissions', (t) => {
  t('non-author cannot edit report', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('reports').createReport('Guarded', 'd', 'tech', null, [], 'low', {});
    B.setActor();
    await throwsAsync(() => B.use('reports').updateReportById(r.key, { title: 'Hacked' }), /Not the author/);
  });

  t('non-author cannot delete report', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('reports').createReport('Guarded2', 'd', 'tech', null, [], 'low', {});
    B.setActor();
    await throwsAsync(() => B.use('reports').deleteReportById(r.key), /Not the author/);
  });

  t('getReportById throws after delete', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('reports').createReport('Del', 'd', 'tech', null, [], 'low', {});
    await A.use('reports').deleteReportById(r.key);
    await throwsAsync(() => A.use('reports').getReportById(r.key), /not found/i);
  });
});

describe('reports: versions republished by other inhabitants', (t) => {
  t('foreign versions in the chain do not duplicate the item and the author edit after them wins', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('reports').createReport('Original', 'd', 'tech', null, [], 'low', {});
    const raw = net.log.find(m => m.key === r.key).value.content;
    const vB = await publishAs(B, { ...raw, replaces: r.key });
    const vC = await publishAs(C, { ...raw, replaces: vB.key });
    await publishAs(A, { ...raw, title: 'Edited', replaces: vC.key });
    const list = await A.use('reports').listAll();
    eq(list.length, 1);
    eq(list[0].author, A.keypair.id);
    eq(list[0].title, 'Edited');
    const viaC = await A.use('reports').getReportById(vC.key);
    eq(viaC.id, list[0].id);
    eq(viaC.title, 'Edited');
  });

  t('a foreign version with a changed title does not change the item', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('reports').createReport('Original', 'd', 'tech', null, [], 'low', {});
    const raw = net.log.find(m => m.key === r.key).value.content;
    await publishAs(B, { ...raw, title: 'Hijacked', replaces: r.key });
    const list = await A.use('reports').listAll();
    eq(list.length, 1);
    eq(list[0].author, A.keypair.id);
    eq(list[0].title, 'Original');
  });
});
