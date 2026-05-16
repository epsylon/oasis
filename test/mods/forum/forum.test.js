const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('forum: publish + list + reply + vote', (t) => {
  t('A creates forum thread, lists it', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('forum').createForum('general', 'My title', 'body');
    ok(r);
    const list = await A.use('forum').listAll('all');
    ok(list.length >= 1);
    eq(list[0].title, 'My title');
  });

  t('A replies to own forum', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('forum').createForum('general', 'T', 'b');
    await A.use('forum').addMessageToForum(r.key, { text: 'reply text', category: 'general', title: 'reply' });
    const result = await A.use('forum').getMessagesByForumId(r.key);
    ok(result);
    ok(Array.isArray(result.messages));
  });

  t('A votes on forum', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('forum').createForum('general', 'T', 'b');
    await A.use('forum').voteContent(r.key, 1);
  });

  t('B (other user) sees A forum', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('forum').createForum('general', 'Hello', 'world');
    B.setActor();
    const list = await B.use('forum').listAll('all');
    ok(list.length >= 1);
  });
});
