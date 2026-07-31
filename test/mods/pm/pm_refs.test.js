const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('pm: notifications that must not repeat', (t) => {
  t('a message can carry a reference and it is read back', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const pm = A.use('pm');
    await pm.sendMessage([], 'PARLIAMENT_GOV', 'The parliament has a new government', false, 'term-2026-01');
    const refs = await pm.sentRefs();
    ok(refs.has('PARLIAMENT_GOV|term-2026-01'), 'the reference is indexed');
    notOk(refs.has('PARLIAMENT_GOV|term-2026-02'), 'other terms are not');
  });

  t('a message without a reference is not indexed', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const pm = A.use('pm');
    await pm.sendMessage([], 'HELLO', 'a plain private note');
    eq((await pm.sentRefs()).size, 0);
  });

  t('the same event is only announced once, a new one is announced again', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const pm = A.use('pm');
    const announce = async (subject, ref, text) => {
      const refs = await pm.sentRefs();
      if (refs.has(`${subject}|${ref}`)) return false;
      await pm.sendMessage([], subject, text, false, ref);
      return true;
    };
    ok(await announce('TRIBE_GOV', 'tribe1:term1', 'first government'), 'announced');
    notOk(await announce('TRIBE_GOV', 'tribe1:term1', 'first government'), 'not announced twice');
    ok(await announce('TRIBE_GOV', 'tribe1:term2', 'second government'), 'a new term is announced');
    const inbox = await pm.listAllPrivate();
    eq(inbox.filter(m => m.value.content.subject === 'TRIBE_GOV').length, 2);
  });

  t('references of other inhabitants do not count as mine', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    B.setActor();
    await B.use('pm').sendMessage([A.keypair.id], 'TRIBE_GOV', 'their announcement', false, 'tribe1:term1');
    A.setActor();
    const refs = await A.use('pm').sentRefs();
    notOk(refs.has('TRIBE_GOV|tribe1:term1'), 'only what I sent myself counts');
  });
});
