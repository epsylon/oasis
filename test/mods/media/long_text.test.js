const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('media: a description longer than a message is stored in pieces and read back whole', (t) => {
  t('an audio with a 20000 character description lists and opens with the whole text', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const audios = A.use('audios');
    const text = Array.from({ length: 500 }, (_, i) => `párrafo ${i} con acentos y 🌴`).join('\n');
    ok(text.length > 12000);
    const created = await audios.createAudio('[a](&' + 'a'.repeat(43) + '=.sha256)', ['long'], 'Larga', text, '');
    const key = created.key || created.id || created;
    const item = await audios.getAudioById(key);
    eq(item.description, text, 'the description comes back whole');
    notOk(item.chunks, 'without the pieces showing');
    const me = (await A.cooler.open()).id;
    const stored = net.log.filter(m => m.value.author === me);
    ok(stored.filter(m => m.value.content.type === 'textChunk').length >= 2, 'the pieces exist in the log');
    const head = stored.find(m => m.value.content.type === 'audio');
    ok(head.value.content.description.length < text.length && head.value.content.chunks.length >= 2, 'what is stored is a head plus references to the pieces');
    ok(stored.every(m => JSON.stringify(m.value, null, 2).length <= 8192), 'each stored message fits the network');
  });
});
