const { ok, eq } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('tribes: a sealed message must still fit the network', (t) => {
  t('sealing refuses content whose message would exceed what other nodes accept', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const tribes = A.use('tribes');
    const tribe = await tribes.createTribe('Sealed', 'd', null, '', [], true, 'strict', null, 'OPEN', '');
    const key = A.cryptoModel.getKey(tribe.key || tribe.id || tribe);
    ok(key, 'the tribe has a key');
    const small = A.cryptoModel.wrapMsg({ k: 'post', text: 'hello tribe' }, key);
    eq(small.type, 'tribe-msg', 'a normal message is sealed');
    let refused = null;
    try { A.cryptoModel.wrapMsg({ k: 'post', text: 'x'.repeat(9000) }, key); } catch (e) { refused = e; }
    ok(refused && /too long/i.test(refused.message), 'a message that would weigh more than 8192 characters once sealed is refused');
    ok(/8192/.test(refused.message), 'the error tells the limit');
    const edge = A.cryptoModel.wrapMsg({ k: 'post', text: 'y'.repeat(3500) }, key);
    eq(edge.type, 'tribe-msg', 'a message that fits is sealed');
    let refusedGroup = null;
    try { await A.cryptoModel.encryptForGroup({ type: 'post', text: 'z'.repeat(9000) }, tribe.key || tribe.id || tribe, tribes); } catch (e) { refusedGroup = e; }
    ok(refusedGroup && /too long|key chain/i.test(refusedGroup.message), 'the field-level sealing is guarded as well');
  });
});

describe('tribes: a tribe record that no longer fits is packed in pieces, never lost', (t) => {
  t('an anonymous tribe with a huge description is updated, stored in pieces that fit, and read back whole', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const tribes = A.use('tribes');
    const r = await tribes.createTribe('Packed', 'd', null, '', [], true, 'strict', null, 'OPEN', '');
    const text = Array.from({ length: 600 }, (_, i) => `línea ${i} de una descripción muy larga`).join('\n');
    ok(text.length > 12000);
    await tribes.updateTribeById(r.key, { description: text });
    const me = (await A.cooler.open()).id;
    const stored = net.log.filter(m => m.value.author === me);
    ok(stored.every(m => JSON.stringify(m.value, null, 2).length <= 8192), 'every stored message fits the network');
    ok(stored.filter(m => m.value.content.type === 'tribe-msg').length >= 3, 'the record travels as several sealed messages');
    const tribe = await tribes.getTribeById(r.key);
    eq(tribe.description, text, 'the tribe reads back with the whole description');
    eq(tribe.title, 'Packed');
  });
});
