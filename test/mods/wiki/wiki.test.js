const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('wiki: pages, slugs and versions', (t) => {
  t('A creates a page and finds it by slug, with a stable id across edits', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const created = await A.use('wiki').createPage({ title: 'Cartografía Dimensional', body: 'First body', tags: 'maps, science' });
    ok(created.key && !created.existing, 'page created');
    const page = await A.use('wiki').getPage('cartografia-dimensional');
    ok(page, 'found by slug (accents stripped)');
    eq(page.id, created.key);
    eq(page.tags.join(','), 'maps,science');
    eq(page.versionCount, 1);

    const again = await A.use('wiki').createPage({ title: 'Cartografia dimensional', body: 'dup' });
    ok(again.existing && again.key === created.key, 'the same title maps to the existing page instead of a duplicate');

    await A.use('wiki').updatePage(created.key, { body: 'Second body', summary: 'typo' });
    const list = await A.use('wiki').listPages({ filter: 'all' });
    eq(list.length, 1, 'still one page after an edit');
    eq(list[0].body, 'Second body');
    eq(list[0].versionCount, 2);
    eq(list[0].versions[1].summary, 'typo');
  });

  t('history can be restored and deletion hides the page', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const created = await A.use('wiki').createPage({ title: 'Recipes', body: 'v1' });
    await A.use('wiki').updatePage(created.key, { body: 'v2' });
    const before = await A.use('wiki').getPage(created.key);
    await A.use('wiki').restoreVersion(created.key, before.versions[0].key);
    const restored = await A.use('wiki').getPage(created.key);
    eq(restored.body, 'v1', 'the restored body is the old one');
    eq(restored.versionCount, 3, 'restoring adds a version rather than rewriting history');
    ok(restored.versions[2].summary.startsWith('restore:'), 'and says it was a restore');

    await A.use('wiki').deletePage(created.key);
    notOk(await A.use('wiki').getPage(created.key), 'deleted page is gone');
    eq((await A.use('wiki').listPages({ filter: 'all' })).length, 0);
  });

  t('recent changes lists every version, newest first', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const p1 = await A.use('wiki').createPage({ title: 'One', body: 'a' });
    await A.use('wiki').createPage({ title: 'Two', body: 'b' });
    await A.use('wiki').updatePage(p1.key, { body: 'a2', summary: 'more' });
    const changes = await A.use('wiki').recentChanges();
    eq(changes.length, 3);
    eq(changes[0].title, 'One');
    eq(changes[0].summary, 'more');
    ok(changes[2].isCreation, 'the oldest entry is a creation');
  });
});

describe('wiki: links between pages', (t) => {
  t('wikilinks build backlinks, flag missing pages and reveal orphans', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('wiki').createPage({ title: 'Hub', body: 'See [[Spoke]] and [[Ghost page|the ghost]] and [[Tribu:Spoke]]' });
    await A.use('wiki').createPage({ title: 'Spoke', body: 'plain' });
    const hub = await A.use('wiki').getPage('hub');
    const spoke = await A.use('wiki').getPage('spoke');
    eq(hub.links.sort().join(','), 'ghost-page,spoke', 'links are collected once per target, prefix stripped');
    eq(hub.missingLinks.join(','), 'ghost-page', 'the ghost is a missing link');
    eq(spoke.backlinks.length, 1, 'spoke is linked from hub');
    eq(spoke.backlinks[0].title, 'Hub');
    ok(hub.isOrphan && !spoke.isOrphan, 'hub has no inbound links, spoke has');
    const orphans = await A.use('wiki').listPages({ filter: 'orphans' });
    eq(orphans.length, 1);
    eq(orphans[0].title, 'Hub');
  });

  t('aliases resolve to the page', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('wiki').createPage({ title: 'Solar panels', body: 'x', aliases: 'PV, Photovoltaics' });
    const page = await A.use('wiki').getPage('photovoltaics');
    ok(page && page.title === 'Solar panels', 'an alias opens the page');
  });

  t('renderUrl turns [[wikilinks]] into links everywhere', async () => {
    const { renderUrl } = require('../../../src/backend/renderUrl');
    const html = renderUrl('read [[Solar panels|panels]] now').map(x => (x && x.outerHTML) || String(x)).join('');
    ok(html.includes('href="/wiki/solar-panels"') && html.includes('>panels<'), 'a wikilink renders as a link to the slug');
  });
});

describe('wiki: who can edit', (t) => {
  t('open pages accept edits from anyone; author-only pages do not', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const open = await A.use('wiki').createPage({ title: 'Open page', body: 'a' });
    const locked = await A.use('wiki').createPage({ title: 'Locked page', body: 'a', editPolicy: 'author' });
    B.setActor();
    await B.use('wiki').updatePage(open.key, { body: 'b edited' });
    let failed = false;
    try { await B.use('wiki').updatePage(locked.key, { body: 'b edited' }); } catch (_) { failed = true; }
    ok(failed, 'B cannot edit an author-only page');
    const openPage = await B.use('wiki').getPage(open.key);
    eq(openPage.body, 'b edited');
    eq(openPage.lastAuthor, B.keypair.id, 'the last author is B');
    eq(openPage.author, A.keypair.id, 'while the creator stays A');
    let deleted = false;
    try { await B.use('wiki').deletePage(open.key); } catch (_) { deleted = true; }
    ok(deleted, 'only the creator can delete');
  });
});

describe('wiki: tribe pages stay inside the tribe', (t) => {
  t('a tribe page is encrypted with the tribe key and invisible to outsiders', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const tribe = await A.use('tribes').createTribe('Secret', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const tribeId = tribe.key || tribe.id;
    const created = await A.use('wiki').createPage({ title: 'Tribe lore', body: 'hidden text', tribeId });
    const mine = await A.use('wiki').listPages({ tribeId });
    eq(mine.length, 1, 'the member lists the tribe page');
    ok(mine[0].encrypted, 'and it is flagged as encrypted');
    eq((await A.use('wiki').listPages({ filter: 'all' })).length, 0, 'it does not appear among the public pages');

    B.setActor();
    notOk(await B.use('wiki').getPage(created.key, { tribeId }), 'an outsider cannot read it');
    eq((await B.use('wiki').listPages({ tribeId })).length, 0, 'nor list it');

    const raw = await new Promise((res, rej) => B.node.get(created.key, (e, m) => e ? rej(e) : res(m)));
    eq(raw.content.type, 'tribe-msg', 'on the log it is an opaque tribe envelope');
    notOk(JSON.stringify(raw.content).includes('hidden text'), 'the body never travels in clear');
  });
});

describe('wiki: link targets and title limits', (t) => {
  t('wikilinks accept full page URLs and paths, and titles are capped at 100 characters', async () => {
    const { linkTarget, slugify } = require('../../../src/models/wiki_model');
    eq(slugify(linkTarget('http://localhost:3000/wiki/this-is-my-new-wiki')), 'this-is-my-new-wiki');
    eq(slugify(linkTarget('/wiki/This%20Page?tribeId=x')), 'this-page');
    eq(linkTarget('Tribe:Page name'), 'Page name');
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('wiki').createPage({ title: 'x'.repeat(300), body: 'b' });
    const page = await A.use('wiki').getPage(r.key);
    eq(page.title.length, 100);
    ok(page.slug.length <= 80);
  });
});
