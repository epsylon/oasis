const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('logs: keeping a personal record', (t) => {
  t('a manual entry is stored and listed', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const logs = A.use('logs');
    eq((await logs.createManual('Harvest', 'Planted 20 tomatoes')).status, 'ok');
    const items = await logs.listLogs('always');
    eq(items.length, 1);
    eq(items[0].label, 'Harvest');
    eq(items[0].text, 'Planted 20 tomatoes');
    eq(await logs.countLogs(), 1);
  });

  t('an empty entry is not stored', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const logs = A.use('logs');
    eq((await logs.createManual('Empty', '   ')).status, 'empty');
    eq((await logs.createManual('Empty', '')).status, 'empty');
    eq(await logs.countLogs(), 0);
  });

  t('an entry can be read back by its id', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const logs = A.use('logs');
    await logs.createManual('Notes', 'The pump is leaking');
    const [item] = await logs.listLogs('always');
    const found = await logs.getLogById(item.key);
    ok(found, 'the entry is found');
    eq(found.text, 'The pump is leaking');
    eq(await logs.getLogById('%missing.sha256'), null, 'an unknown id returns nothing');
  });
});

describe('logs: editing and removing entries', (t) => {
  t('editing replaces the entry without duplicating it', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const logs = A.use('logs');
    await logs.createManual('Notes', 'first version');
    const [before] = await logs.listLogs('always');
    eq((await logs.updateLog(before.key, { text: 'second version' })).status, 'ok');
    const after = await logs.listLogs('always');
    eq(after.length, 1, 'still a single entry');
    eq(after[0].text, 'second version');
    eq(after[0].label, 'Notes', 'the untouched field is preserved');
  });

  t('a deleted entry disappears from the record', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const logs = A.use('logs');
    await logs.createManual('Keep', 'stays');
    await logs.createManual('Drop', 'goes away');
    const target = (await logs.listLogs('always')).find(i => i.label === 'Drop');
    eq((await logs.deleteLog(target.key)).status, 'ok');
    const left = await logs.listLogs('always');
    eq(left.length, 1);
    eq(left[0].label, 'Keep');
    eq(await logs.countLogs(), 1);
  });

  t('editing or deleting something that is not there is reported', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const logs = A.use('logs');
    eq((await logs.updateLog('%missing.sha256', { text: 'x' })).status, 'not_found');
    eq((await logs.deleteLog('%missing.sha256')).status, 'not_found');
  });
});

describe('logs: a record is private to its author', (t) => {
  t('another inhabitant does not see your entries', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('logs').createManual('Mine', 'my own notes');
    B.setActor();
    const theirs = await B.use('logs').listLogs('always');
    notOk(theirs.find(i => i.text === 'my own notes'), 'B does not read the log of A');
    eq(await B.use('logs').countLogs(), 0);
  });
});

describe('logs: nothing of this leaves the author', (t) => {
  t('there is no way to publish a log to the network', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const logs = A.use('logs');
    for (const gone of ['publishPublicLog', 'unpublishLog', 'listPublicLogs', 'getPublicLogById']) {
      eq(typeof logs[gone], 'undefined', `${gone} no longer exists`);
    }
  });

  t('editing or deleting a log touches nothing but the private entry', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('logs').createManual('Note', 'first version');
    const entry = (await A.use('logs').listLogs('always'))[0];
    await A.use('logs').updateLog(entry.key, { text: 'second version' });
    const after = await A.use('logs').listLogs('always');
    eq(after.length, 1, 'still one entry');
    eq(after[0].text, 'second version', 'and it is the edited one');

    B.setActor();
    eq(await B.use('logs').countLogs(), 0, 'and no copy reached anybody else');
  });
});

describe('logs: the pages render', (t) => {
  const { logsView } = require('../../../src/views/logs_view');
  const entry = {
    key: '%l.sha256', text: 'test', label: 'Note', mode: 'manual',
    ts: Date.now(), createdAt: new Date().toISOString(), author: '@a.ed25519'
  };

  t('the table and the detail come out whole', () => {
    const list = String(logsView([entry], 'today', null, { view: 'list', aiModOn: false, search: {} }));
    ok(list.includes('test'), 'the entry is in the table');
    ok(list.includes('logs-table'), 'and it is the table that renders it');

    const detail = String(logsView([], 'today', 'manual', { view: 'detail', aiModOn: false, entry }));
    ok(detail.includes('test'), 'the detail shows the entry');
    notOk(detail.includes('/logs/public'), 'and nothing public is left behind');
  });

  t('a long entry is cut short in the table, not in the detail', () => {
    const long = { ...entry, text: 'x'.repeat(400) };
    const list = String(logsView([long], 'today', null, { view: 'list', aiModOn: false, search: {} }));
    ok(list.includes('…'), 'the preview is truncated');

    const detail = String(logsView([], 'today', 'manual', { view: 'detail', aiModOn: false, entry: long }));
    ok(detail.includes('x'.repeat(400)), 'the detail keeps the whole text');
  });
});

describe('logs: every screen belongs to the module', (t) => {
  const { logsView } = require('../../../src/views/logs_view');
  const i18n = require('../../../src/views/main_views').i18n;
  const entry = {
    key: '%l.sha256', text: 'test', label: 'Note', mode: 'manual',
    ts: Date.now(), createdAt: new Date().toISOString(), author: '@a.ed25519'
  };

  const screens = [
    ['list', { view: 'list', aiModOn: false, search: {} }],
    ['create', { view: 'create', aiModOn: false }],
    ['edit', { view: 'edit', aiModOn: false, entry }],
    ['detail', { view: 'detail', aiModOn: false, entry }]
  ];

  t('title, description and filters are on all of them', () => {
    for (const [name, opts] of screens) {
      const html = String(logsView([entry], 'today', 'manual', opts));
      ok(html.includes(String(i18n.logsTitle)), `${name}: the module title is there`);
      ok(html.includes(String(i18n.logsDescription)), `${name}: and its description`);
      ok(html.includes(String(i18n.logsFilterAlways)), `${name}: and the period filters`);
      ok(html.includes(String(i18n.logsExport)), `${name}: and Export Logs`);
    }
  });
});

describe('logs: editing follows the same shape as the other modules', (t) => {
  t('the form posts to /logs/update/:id', () => {
    const { logsView } = require('../../../src/views/logs_view');
    const entry = {
      key: '%l.sha256', text: 'test', label: 'Note', mode: 'manual',
      ts: Date.now(), createdAt: new Date().toISOString(), author: '@a.ed25519'
    };
    const edit = String(logsView([], 'today', 'manual', { view: 'edit', aiModOn: false, entry }));
    ok(edit.includes('/logs/update/'), 'it updates through the update route');
    notOk(edit.includes('action="/logs/edit/'), 'not through a bespoke edit endpoint');

    const detail = String(logsView([], 'today', 'manual', { view: 'detail', aiModOn: false, entry }));
    ok(detail.includes('/logs/edit/'), 'and the detail reaches the form by its own url');
    notOk(detail.includes('name="view" value="edit"'), 'no query-string screen switching left');
  });
});
