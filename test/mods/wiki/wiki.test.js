const { eq, ok, notOk } = require('../../helpers/assert');
const { slugify } = require('../../../src/models/wiki_model');
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
  t('wikilinks build backlinks, flag missing pages and mark linked ones', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('wiki').createPage({ title: 'Hub', body: 'See [[Spoke]] and [[Ghost page|the ghost]] and [[Tribu:Spoke]]' });
    await A.use('wiki').createPage({ title: 'Spoke', body: 'plain' });
    const hub = await A.use('wiki').getPage('hub');
    const spoke = await A.use('wiki').getPage('spoke');
    eq(hub.links.sort().join(','), 'ghost-page,spoke', 'links are collected once per target, prefix stripped');
    eq(hub.missingLinks.join(','), 'ghost-page', 'the ghost is a missing link');
    eq(spoke.backlinks.length, 1, 'spoke is linked from hub');
    eq(spoke.backlinks[0].title, 'Hub');
    ok(!hub.isLinked && spoke.isLinked, 'hub has no inbound links, spoke has');
    const linked = await A.use('wiki').listPages({ filter: 'linked' });
    eq(linked.length, 1);
    eq(linked[0].title, 'Spoke');
    const hubPage = await A.use('wiki').getPage(hub.id);
    const spokePage = await A.use('wiki').getPage(spoke.id);
    eq(hubPage.linkedPages.map(p => p.title).join(','), 'Spoke', 'a page lists what it points at, even with nothing pointing back');
    eq(spokePage.linkedPages.map(p => p.title).join(','), 'Hub', 'and what points at it');
  });

  t('aliases resolve to the page', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('wiki').createPage({ title: 'Solar panels', body: 'x', aliases: 'PV, Photovoltaics' });
    const page = await A.use('wiki').getPage('photovoltaics');
    ok(page && page.title === 'Solar panels', 'an alias opens the page');
  });

  t('a title already taken comes back to the form with your text', async () => {
    const { wikiView } = require('../../../src/views/wiki_view');
    const draft = { title: 'Recipes', body: 'my long text', tags: 'food', status: 'OPEN', summary: '' };
    const html = String(await wikiView([], 'create', { draft, censusList: [] }));
    ok(html.includes('my long text'), 'what you wrote is still in the form');
    ok(html.includes('value="Recipes"'), 'and so is the title, ready to be changed');
  });

  t('the text renderer turns [[wikilinks]] into links everywhere', async () => {
    const { renderStyledText } = require('../../../src/backend/renderStyledText');
    const html = renderStyledText('read [[Solar panels|panels]] now').map(x => (x && x.outerHTML) || String(x)).join('');
    ok(html.includes('href="/wiki/solar-panels"') && html.includes('>panels<'), 'a wikilink renders as a link to the slug');
  });
});

describe('wiki: following a page', (t) => {
  t('editing someone else\'s page subscribes you, and an explicit choice is never overridden', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const page = await A.use('wiki').createPage({ title: 'Shared notes', body: 'v1' });
    B.setActor();
    eq(await B.use('subscriptions').myState(page.key), null, 'nobody is subscribed before touching the page');
    const edited = await B.use('wiki').updatePage(page.key, { body: 'v2' });
    ok(edited.author && edited.author !== B.node.id, 'the update reports who owns the page, so the author is not subscribed to their own');
    await B.use('subscriptions').setSubscription(page.key, 'wiki', true);
    eq(await B.use('subscriptions').myState(page.key), 'on');
    await B.use('subscriptions').setSubscription(page.key, 'wiki', false);
    eq(await B.use('subscriptions').myState(page.key), 'off', 'unsubscribing is remembered as a decision, not as absence');
    eq((await A.use('subscriptions').listSubscribers(page.key)).length, 0, 'and it takes you off the list');
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

describe('wiki: long pages', (t) => {
  t('a body beyond the message limit is stored as a blob and reads back whole, through edits and inside tribes', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    const long = 'Acuíferos y nitratos. '.repeat(700).trim();
    const longer = long + ' Segunda versión.';
    A.setActor();
    const created = await A.use('wiki').createPage({ title: 'Long page', body: long });
    const raw = await new Promise((res, rej) => A.node.get(created.key, (e, m) => e ? rej(e) : res(m)));
    ok(raw.content.bodyBlob && raw.content.bodyBlob.startsWith('&'), 'the message points at a blob');
    eq(raw.content.body, '', 'and carries no inline body');
    eq((await A.use('wiki').getPage(created.key)).body, long, 'the page reads back whole');
    await A.use('wiki').updatePage(created.key, { body: longer, summary: 'more' });
    const page = await A.use('wiki').getPage(created.key);
    eq(page.body, longer); eq(page.versions.length, 2); eq(page.versions[0].body, long, 'earlier versions keep their own body');
    const tribe = await A.use('tribes').createTribe('Secret', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const tribeId = tribe.key || tribe.id;
    const secret = await A.use('wiki').createPage({ title: 'Tribe long', body: long, tribeId });
    eq((await A.use('wiki').getPage(secret.key, { tribeId })).body, long, 'a member reads the long tribe page');
    B.setActor();
    notOk(await B.use('wiki').getPage(secret.key, { tribeId }), 'an outsider still cannot read it');
    const blobRef = (await new Promise((res, rej) => A.node.get(secret.key, (e, m) => e ? rej(e) : res(m)))).content;
    notOk(JSON.stringify(blobRef).includes('Acuíferos'), 'the envelope carries no clear text');
  });
});

describe('wiki: links inside a tribe', (t) => {
  t('pages link to each other within the tribe and stay apart from the global wiki', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const tribe = await A.use('tribes').createTribe('Guild', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const tribeId = tribe.key || tribe.id;
    await A.use('wiki').createPage({ title: 'Target', body: 'inside', tribeId });
    await A.use('wiki').createPage({ title: 'Source', body: 'see [[Target]]', tribeId });
    await A.use('wiki').createPage({ title: 'Target', body: 'outside' });
    const inside = await A.use('wiki').listPages({ tribeId, filter: 'all' });
    const outside = await A.use('wiki').listPages({ filter: 'all' });
    eq(inside.length, 2, 'the tribe sees only its own pages');
    eq(outside.length, 1, 'and the global wiki only sees the global one');
    const tribeTarget = inside.find(p => p.title === 'Target');
    const globalTarget = outside.find(p => p.title === 'Target');
    ok(tribeTarget.isLinked, 'the tribe page is marked as linked');
    ok(!globalTarget.isLinked, 'a page with the same title outside the tribe is not');
    const full = await A.use('wiki').getPage(tribeTarget.id, { tribeId });
    eq(full.linkedPages.map(p => p.title).join(','), 'Source', 'and it lists the page that links to it');
  });
});

describe('wiki: link targets and title limits', (t) => {
  t('wikilinks accept full page URLs and paths, and titles are capped at 100 characters', async () => {
    const { linkTarget, slugify } = require('../../../src/models/wiki_model');
    eq(slugify(linkTarget('http://localhost:3000/wiki/this-is-my-new-wiki')), 'this-is-my-new-wiki');
    eq(slugify(linkTarget('/wiki/This%20Page?tribeId=x')), 'this-page');
    eq(linkTarget('Tribe:Page name'), 'Page name');
    eq(linkTarget('TCP/IP'), 'TCP/IP', 'a slash inside a title is part of the title');
    eq(linkTarget('Docs/wiki/setup'), 'Docs/wiki/setup', 'even when the title happens to contain /wiki/');
    eq(linkTarget('Notas: 1/2'), 'Notas: 1/2', 'a colon followed by a space is punctuation, not a namespace');
    eq(linkTarget('Ratio 16:9'), 'Ratio 16:9');
    eq(slugify(linkTarget('Guía/Instalación')), slugify('Guía/Instalación'), 'so a [[link]] to such a page resolves to its slug');
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('wiki').createPage({ title: 'x'.repeat(300), body: 'b' });
    const page = await A.use('wiki').getPage(r.key);
    eq(page.title.length, 100);
    ok(page.slug.length <= 80);
  });
});

describe('wiki: pages created with an older slug format', (t) => {
  t('a [[link]] to a page whose stored slug kept the accents as dashes still resolves, and the old URL keeps working', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const title = 'Soberanía Distribuida/La Revolución Silenciosa en Marcha';
    const oldSlug = 'soberan-a-distribuida-la-revoluci-n-silenciosa-en-marcha';
    const now = new Date().toISOString();
    await new Promise((res, rej) => A.node.publish({ type: 'wikiPage', title, slug: oldSlug, body: 'old page', tags: [], aliases: [], editPolicy: 'OPEN', author: A.keypair.id, createdAt: now, updatedAt: now }, (e, m) => e ? rej(e) : res(m)));
    const w = A.use('wiki');
    const page = await w.getPage(oldSlug);
    ok(page, 'the old URL still finds the page');
    eq(page.slug, slugify(title), 'but its canonical slug now follows the current rules');
    ok(page.aliases.includes(oldSlug), 'and the stored slug survives as an alias');
    const linking = await w.createPage({ title: 'Índice', body: `1. [[${title}|La Revolución Silenciosa en Marcha]]` });
    const index = await w.getPage(linking.key);
    eq(index.missingLinks.length, 0, 'the link is not reported as a page to create');
    eq(index.links[0], page.slug);
    const dup = await w.createPage({ title, body: 'again' });
    ok(dup.existing && dup.key === page.id, 'creating it again is detected as the same page');
  });
});

describe('wiki: license', (t) => {
  t('the creator sets and changes the license; other editors keep it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const created = await A.use('wiki').createPage({ title: 'Licensed page', body: 'a', license: 'LAL-1.3' });
    eq((await A.use('wiki').getPage(created.key)).license, 'LAL-1.3');
    B.setActor();
    await B.use('wiki').updatePage(created.key, { body: 'b edited', license: 'CC-BY-4.0' });
    const afterB = await B.use('wiki').getPage(created.key);
    eq(afterB.body, 'b edited', 'the edit itself is accepted');
    eq(afterB.license, 'LAL-1.3', 'but the license is not B to change');
    A.setActor();
    await A.use('wiki').updatePage(created.key, { body: 'a again', license: 'CC-BY-SA-4.0' });
    eq((await A.use('wiki').getPage(created.key)).license, 'CC-BY-SA-4.0', 'the creator can change it');
    await A.use('wiki').updatePage(created.key, { body: 'no license field' });
    eq((await A.use('wiki').getPage(created.key)).license, 'CC-BY-SA-4.0', 'and edits that do not touch it keep it');
  });
});
