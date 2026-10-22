const fs = require('fs');
const os = require('os');
const path = require('path');
const { eq, ok, notOk } = require('../../helpers/assert');

const makeScheduler = (opts = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-scheduler-'));
  const stateFile = path.join(dir, 'scheduled.json');
  const cooler = { open: async () => ({ id: opts.id || '@me.ed25519' }) };
  const scheduler = require('../../../src/models/scheduler_model')({ cooler, isPublic: opts.isPublic === true, stateFile });
  return { scheduler, stateFile, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
};
const future = (h = 1) => new Date(Date.now() + h * 3600000).toISOString();

describe('scheduler: the drafts file', (t) => {
  t('in public mode nobody can list or open the drafts of the node owner', async () => {
    const mine = makeScheduler();
    try {
      const entry = await mine.scheduler.schedule('blog', { text: 'secret draft' }, future());
      const pub = require('../../../src/models/scheduler_model')({ cooler: { open: async () => ({ id: '@me.ed25519' }) }, isPublic: true, stateFile: mine.stateFile });
      eq((await pub.listMine('blog')).length, 0, 'the list is empty for visitors');
      eq(await pub.get(entry.id), null, 'and a draft cannot be opened by id');
      eq((await pub.due('blog', Date.now() + 7200000)).length, 0, 'nor published from there');
      eq((await mine.scheduler.listMine('blog')).length, 1, 'the owner still sees it');
    } finally { mine.cleanup(); }
  });

  t('a draft that fails to publish is set aside with its error and does not block the others', async () => {
    const s = makeScheduler();
    try {
      const bad = await s.scheduler.schedule('blog', { text: '' }, future());
      const good = await s.scheduler.schedule('blog', { text: 'fine' }, future());
      const later = Date.now() + 7200000;
      eq((await s.scheduler.due('blog', later)).length, 2);
      await s.scheduler.fail(bad.id, 'Blog text is required');
      const due = await s.scheduler.due('blog', later);
      eq(due.map(e => e.id).join(), good.id, 'only the healthy draft is due');
      const kept = (await s.scheduler.listMine('blog')).find(e => e.id === bad.id);
      eq(kept.error, 'Blog text is required', 'the draft stays, with its error');
      await s.scheduler.update(bad.id, { text: 'now it has text' }, future(3));
      notOk((await s.scheduler.listMine('blog')).find(e => e.id === bad.id).error, 'editing it clears the error');
    } finally { s.cleanup(); }
  });

  t('a file that cannot be read is never overwritten, and writes go through a temporary file', async () => {
    const s = makeScheduler();
    try {
      await s.scheduler.schedule('blog', { text: 'one' }, future());
      fs.writeFileSync(s.stateFile, '{"truncated": [', 'utf8');
      eq((await s.scheduler.listMine('blog')).length, 0, 'an unreadable file reads as empty');
      let refused = false;
      try { await s.scheduler.schedule('blog', { text: 'two' }, future()); } catch (e) { refused = /refusing/.test(e.message); }
      ok(refused, 'and nothing is written over it');
      eq(fs.readFileSync(s.stateFile, 'utf8'), '{"truncated": [', 'the broken file is left for the owner to look at');
      fs.writeFileSync(s.stateFile, '[]', 'utf8');
      await s.scheduler.schedule('blog', { text: 'three' }, future());
      notOk(fs.readdirSync(path.dirname(s.stateFile)).some(n => n.endsWith('.tmp')), 'no temporary file is left behind');
      eq(JSON.parse(fs.readFileSync(s.stateFile, 'utf8')).length, 1);
    } finally { s.cleanup(); }
  });
});

describe('scheduler: a draft the model refuses', (t) => {
  t('publishDue skips it, reports it, and publishes the rest', async () => {
    const { makeNetwork, makePeer } = require('../../helpers/setup');
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const blogs = A.use('blogs');
    const bad = await blogs.scheduleBlog({ text: 'Will be refused', subject: 'empty', publishAt: future() });
    const good = await blogs.scheduleBlog({ text: 'A real post', subject: 'ok', publishAt: future() });
    const createBlog = blogs.createBlog;
    blogs.createBlog = async (data) => { if (data.subject === 'empty') throw new Error('Blog text is required'); return createBlog.call(blogs, data); };
    const quiet = console.error; console.error = () => {};
    let published;
    try { published = await blogs.publishDue(Date.now() + 7200000); } finally { console.error = quiet; }
    eq(published.length, 1, 'the healthy draft is published');
    eq(published[0].entry.subject, 'ok');
    const all = await blogs.listAll('MINE');
    ok(all.some(b => b.id === bad.id && b.scheduledAt), 'the refused draft is still listed as scheduled');
    notOk(all.some(b => b.id === good.id), 'the published one is no longer a draft');
    eq((await blogs.publishDue(Date.now() + 7200000)).length, 0, 'the refused draft is not retried on every request');
  });
});
