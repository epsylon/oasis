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
