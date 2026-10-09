const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('chats: standalone create + list', (t) => {
  t('A creates standalone chat', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('chats').createChat('Lobby', 'general chat', null, 'general', 'OPEN', ['casual'], null);
    ok(r);
    const list = await A.use('chats').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.length >= 1);
    const my = list.find(c => c.title === 'Lobby');
    ok(my);
  });

  t('A creates closed chat', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('chats').createChat('Private', 'd', null, 'cat', 'CLOSED', [], null);
    ok(r);
    const t = await A.use('chats').getChatById(r.key);
    eq(t.status, 'CLOSED');
  });

  t('A closes chat after creation', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('chats').createChat('Open', '', null, '', 'OPEN', [], null);
    await A.use('chats').closeChatById(r.key);
    const t = await A.use('chats').getChatById(r.key);
    eq(t.status, 'CLOSED');
  });

  t('A deletes chat', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('chats').createChat('Tmp', '', null, '', 'OPEN', [], null);
    await A.use('chats').deleteChatById(r.key);
    const list = await A.use('chats').listAll({ filter: 'all', viewerId: A.keypair.id });
    const found = list.find(c => c.title === 'Tmp');
    ok(!found, 'chat removed from list after delete');
  });
});

describe('chats: open (multi-use) invitation', (t) => {
  t('open invitation is multi-use and only one at a time', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('chats').createChat('Club', 'd', null, '', 'INVITE-ONLY', [], null);
    const code = await A.use('chats').generateOpenInvite(r.key);
    ok(typeof code === 'string' && code.length > 0, 'open invite code generated');
    eq((await A.use('chats').getOpenInvite(r.key)).code, code, 'getOpenInvite returns the code');
    let dup = false;
    try { await A.use('chats').generateOpenInvite(r.key); } catch (_) { dup = true; }
    ok(dup, 'a second open invitation is rejected');
    B.setActor();
    ok(await B.use('chats').joinByInvite(code), 'B joins via open invite');
    C.setActor();
    ok(await C.use('chats').joinByInvite(code), 'C also joins via the same open invite (multi-use)');
  });

  t('author can remove the open invitation', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('chats').createChat('Club2', 'd', null, '', 'INVITE-ONLY', [], null);
    const code = await A.use('chats').generateOpenInvite(r.key);
    await A.use('chats').removeOpenInvite(r.key);
    eq(await A.use('chats').getOpenInvite(r.key), null, 'open invite removed');
    B.setActor();
    let threw = false;
    try { await B.use('chats').joinByInvite(code); } catch (_) { threw = true; }
    ok(threw, 'removed open invite no longer works');
  });
});

describe('chats: encrypted visibility (no blank duplicate cards)', (t) => {
  t('non-member does not see a private invite-only chat as a blank card', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('chats').createChat('Secret Room', 'd', null, 'GENERAL', 'INVITE-ONLY', [], null);
    B.setActor();
    const list = await B.use('chats').listAll({ filter: 'all', viewerId: B.keypair.id });
    ok(!list.some(c => c.title === 'Secret Room'), 'non-member cannot see a private invite-only chat');
    ok(!list.some(c => c.undecryptable), 'no blank/undecryptable chat card shown to a non-member');
  });

  t('non-member discovers an open-invite chat decrypted (not blank)', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('chats').createChat('Public Club', 'd', null, 'GENERAL', 'INVITE-ONLY', [], null);
    await A.use('chats').generateOpenInvite(r.key);
    B.setActor();
    const list = await B.use('chats').listAll({ filter: 'all', viewerId: B.keypair.id });
    const club = list.find(c => c.title === 'Public Club');
    ok(club, 'open-invite chat is discoverable by a non-member');
    ok(!club.undecryptable, 'and it is decrypted, not a blank card');
  });

  t('duplicate chat roots are collapsed: original content + freshest members', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('chats').createChat('Town Square', 'the original', null, 'GENERAL', 'OPEN', ['x'], null);
    const orig = await A.use('chats').getChatById(r.key);
    const ssbA = await A.cooler.open();
    await new Promise((res, rej) => ssbA.publish({
      type: 'chat', title: 'Town Square', description: 'the original', image: null, category: 'GENERAL',
      status: 'OPEN', tags: ['x'], members: [A.keypair.id, B.keypair.id], invites: [],
      author: A.keypair.id, createdAt: orig.createdAt, updatedAt: new Date(Date.now() + 5000).toISOString()
    }, e => e ? rej(e) : res()));
    const list = await A.use('chats').listAll({ filter: 'all', viewerId: A.keypair.id });
    const towns = list.filter(c => c.title === 'Town Square');
    eq(towns.length, 1, 'the duplicate root is collapsed into a single card');
    eq(towns[0].key, r.key, 'canonical card keeps the original (first-created) key');
    eq((towns[0].members || []).length, 2, 'participants are taken from the freshest duplicate');
  });
});

describe('chats: cross-author replaces does not hide content (regression)', (t) => {
  t('messages stay visible when the chat has a foreign-authored replaces version', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Cantina', 'd', null, '', 'OPEN', [], null);
    await A.use('chats').sendMessage(chat.key, 'hello from A');

    const ssbB = await B.cooler.open();
    const v1 = await new Promise((res, rej) => ssbB.publish({
      type: 'chat', title: 'Cantina', description: 'd', category: '', status: 'OPEN', tags: [],
      members: [A.keypair.id, B.keypair.id], invites: [], author: A.keypair.id,
      replaces: chat.key, createdAt: new Date().toISOString()
    }, (e, r) => e ? rej(e) : res(r)));

    A.setActor();
    const viaRoot = await A.use('chats').listMessages(chat.key);
    ok(viaRoot.some(m => m.text === 'hello from A'), 'message visible via the original root');
    const viaVersion = await A.use('chats').listMessages(v1.key);
    ok(viaVersion.some(m => m.text === 'hello from A'), 'message visible when opened via the foreign-authored version id');
    eq(viaVersion.length, viaRoot.length, 'same message count regardless of which chain version id is used');
  });

  t('a foreign tombstone cannot delete the chat from listing', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Persist', 'd', null, '', 'OPEN', [], null);
    const ssbB = await B.cooler.open();
    await new Promise((res, rej) => ssbB.publish({ type: 'tombstone', target: chat.key, deletedAt: new Date().toISOString() }, (e) => e ? rej(e) : res()));
    A.setActor();
    const list = await A.use('chats').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.some(c => c.title === 'Persist'), 'foreign tombstone ignored; chat still listed');
  });
});

describe('chats: E2E crypto round-trip and key auto-heal (regression)', (t) => {
  t('invited member receives the key and both sides decrypt messages', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Secret', 'd', null, '', 'INVITE-ONLY', [], null);
    const code = await A.use('chats').generateOpenInvite(chat.key);
    await A.use('chats').sendMessage(chat.key, 'from A encrypted');

    B.setActor();
    await B.use('chats').joinByInvite(code);
    await B.use('chats').ingestKeys();
    await B.use('chats').sendMessage(chat.key, 'from B encrypted');

    const bView = await B.use('chats').listMessages(chat.rootId || chat.key);
    ok(bView.some(m => m.text === 'from A encrypted'), 'B (invited) decrypts A message');

    A.setActor();
    const aView = await A.use('chats').listMessages(chat.key);
    ok(aView.some(m => m.text === 'from B encrypted'), 'A decrypts B message');
  });

  t('an invite-only chat cannot be entered by adding yourself, and an invited member who lost the keyring recovers it from the log', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Healme', 'd', null, '', 'INVITE-ONLY', [], null);
    await A.use('chats').sendMessage(chat.key, 'secret from A');

    B.setActor();
    try { await B.use('chats').joinChat(chat.key); } catch (_) {}
    await B.use('chats').ingestKeys();
    const sneaked = await B.use('chats').listMessages(chat.rootId || chat.key).catch(() => []);
    ok(!sneaked.some(m => m.text === 'secret from A'), 'adding yourself to an invite-only chat does not get you in');
    A.setActor();
    const seen = await A.use('chats').getChatById(chat.key);
    ok(!seen.members.includes(B.keypair.id), 'the self-added outsider is not listed as a member');

    const code = await A.use('chats').generateInvite(chat.key);
    B.setActor();
    await B.use('chats').joinByInvite(code);
    await B.use('chats').ingestKeys();
    const joined = await B.use('chats').listMessages(chat.rootId || chat.key);
    ok(joined.some(m => m.text === 'secret from A'), 'the invited member reads the chat');

    const os = require('os'); const fs = require('fs'); const path = require('path');
    const lostDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-lost-keys-'));
    const lostCrypto = require('../../../src/models/crypto')(lostDir, 'chats');
    const restored = require('../../../src/models/chats_model')({ cooler: B.cooler, isPublic: false, tribeCrypto: lostCrypto, chatCrypto: lostCrypto, tribesModel: B.use('tribes') });
    const blind = await restored.listMessages(chat.rootId || chat.key).catch(() => []);
    ok(!blind.some(m => m.text === 'secret from A'), 'without the keyring the member cannot read');
    await restored.ingestKeys();
    const healed = await restored.listMessages(chat.rootId || chat.key);
    ok(healed.some(m => m.text === 'secret from A'), 'after ingesting keys from the log the member reads again');
  });
});

describe('chats: invitation codes', (t) => {
  t('a stranger who copies an invitation token cannot use it up', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const S = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Burn', 'd', null, '', 'INVITE-ONLY', [], null);
    const code = await A.use('chats').generateInvite(chat.key);
    const withInvites = net.log.filter(m => m.value.content && Array.isArray(m.value.content.invites) && m.value.content.invites.length).pop();
    const token = withInvites.value.content.invites[0].ch;
    ok(token, 'the invitation token is readable by anyone');
    S.setActor();
    const ssbS = await S.cooler.open();
    await new Promise((res, rej) => ssbS.publish({ type: 'chatMember', target: chat.key, member: S.keypair.id, on: true, code: token, createdAt: new Date().toISOString() }, (e) => e ? rej(e) : res()));
    B.setActor();
    await B.use('chats').joinByInvite(code);
    A.setActor();
    const seen = await A.use('chats').getChatById(chat.key);
    ok(seen.members.includes(B.keypair.id), 'the invited inhabitant still gets in');
    ok(!seen.members.includes(S.keypair.id), 'the stranger does not');
  });

  t('someone without the key yet does not accept one from a stranger', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const S = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Bootstrap', 'd', null, '', 'INVITE-ONLY', [], null);
    const ssbKeys = require('../../../src/server/node_modules/ssb-keys');
    const planted = require('crypto').randomBytes(32).toString('hex');
    const ssbS = await S.cooler.open();
    await new Promise((res, rej) => ssbS.publish({ type: 'tribe-keys', tribeId: chat.key, generation: 1, memberKeys: { [B.keypair.id]: S.tribeCrypto.boxKeyForMember(planted, B.keypair.id, ssbKeys) } }, (e) => e ? rej(e) : res()));
    B.setActor();
    await B.use('chats').ingestKeys();
    const ring = require('../../../src/models/crypto')(B.configDir, 'chats');
    ok(!ring.getKeys(chat.key).includes(planted), 'the planted key is ignored');
  });

  t('when a member leaves, the owner changes the key and only those who stay receive it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const pause = () => new Promise(r => setTimeout(r, 5));
    const keysOf = (P) => require('../../../src/models/crypto')(P.configDir, 'chats');
    A.setActor();
    const chat = await A.use('chats').createChat('Rotate', 'd', null, '', 'INVITE-ONLY', [], null);
    const codeB = await A.use('chats').generateInvite(chat.key);
    const codeC = await A.use('chats').generateInvite(chat.key);
    B.setActor(); await B.use('chats').joinByInvite(codeB);
    C.setActor(); await C.use('chats').joinByInvite(codeC);
    await pause();
    const before = net.log.length;
    C.setActor(); await C.use('chats').leaveChat(chat.key);
    ok(!net.log.slice(before).some(m => m.value.content.type === 'tribe-keys'), 'the one who leaves does not hand out a key');
    await pause();
    A.setActor();
    await A.use('chats').listAll({ filter: 'all', viewerId: A.keypair.id });
    const fresh = keysOf(A).getKey(chat.key);
    ok(!keysOf(C).getKeys(chat.key).includes(fresh), 'the new key is not the one the leaver had');
    const settled = net.log.length;
    await A.use('chats').listAll({ filter: 'all', viewerId: A.keypair.id });
    eq(net.log.length, settled, 'the key changes once, not on every visit');
    B.setActor(); await B.use('chats').ingestKeys();
    C.setActor(); await C.use('chats').ingestKeys();
    ok(keysOf(B).getKeys(chat.key).includes(fresh), 'the member who stays gets the new key');
    ok(!keysOf(C).getKeys(chat.key).includes(fresh), 'the member who left does not');
  });

  t('a fake delivery entry from a stranger does not stop the owner from sending a member the key', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const S = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Deliver', 'd', null, '', 'INVITE-ONLY', [], null);
    await A.use('chats').sendMessage(chat.key, 'for members');
    S.setActor();
    const ssbS = await S.cooler.open();
    await new Promise((res, rej) => ssbS.publish({ type: 'tribe-keys', tribeId: chat.key, generation: 1, memberKeys: { [B.keypair.id]: 'not-a-key' } }, (e) => e ? rej(e) : res()));
    A.setActor();
    const ssbA = await A.cooler.open();
    await new Promise((res, rej) => ssbA.publish({ type: 'chatMember', target: chat.key, member: B.keypair.id, on: true, createdAt: new Date().toISOString() }, (e) => e ? rej(e) : res()));
    await A.use('chats').listAll({ filter: 'all', viewerId: A.keypair.id });
    B.setActor();
    await B.use('chats').ingestKeys();
    const view = await B.use('chats').listMessages(chat.key).catch(() => []);
    ok(view.some(m => m.text === 'for members'), 'the member receives the key and reads the chat');
  });
});

describe('chats: how fast one inhabitant can fill a room', (t) => {
  t('a normal conversation is no longer cut off after three messages', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const chats = A.use('chats');
    const chat = await chats.createChat('a room', 'desc', null, 'GENERAL', 'OPEN', [], null);
    for (let i = 0; i < 20; i++) {
      await chats.sendMessage(chat.key, `message ${i}`, null);
    }
    const msgs = await chats.listMessages(chat.key);
    eq(msgs.length, 20, 'twenty messages went through');
  });

  t('the cap still exists, and says so instead of failing like a crash', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const chats = A.use('chats');
    const chat = await chats.createChat('a room', 'desc', null, 'GENERAL', 'OPEN', [], null);
    let err = null;
    try {
      for (let i = 0; i < 80; i++) await chats.sendMessage(chat.key, `message ${i}`, null);
    } catch (e) { err = e; }
    ok(err, 'the cap is reached eventually');
    eq(err.code, 'CHAT_RATE_LIMIT', 'and it is typed, so the route can answer properly');
    ok(/60/.test(err.message), 'the message names the actual limit');
  });

  t('the cap counts per room, not across all of them', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const chats = A.use('chats');
    const one = await chats.createChat('room one', '', null, 'GENERAL', 'OPEN', [], null);
    const two = await chats.createChat('room two', '', null, 'GENERAL', 'OPEN', [], null);
    for (let i = 0; i < 40; i++) await chats.sendMessage(one.key, `a ${i}`, null);
    await chats.sendMessage(two.key, 'still fine here', null);
    eq((await chats.listMessages(two.key)).length, 1, 'the other room is unaffected');
  });
});

describe('chats: the conversation reads downwards', (t) => {
  t('the newest message is the last one, and can be reached', async () => {
    const { singleChatView } = require('../../../src/views/chats_view');
    const chat = {
      key: '%c.sha256', title: 'a chat', author: '@a.ed25519', members: ['@a.ed25519'],
      status: 'OPEN', createdAt: new Date().toISOString(), tags: []
    };
    const msg = (text, minutesAgo) => ({
      key: `%m${minutesAgo}.sha256`, author: '@a.ed25519', text,
      createdAt: new Date(Date.now() - minutesAgo * 60000).toISOString()
    });

    const html = String(await singleChatView(chat, 'all', [msg('oldest', 30), msg('middle', 20), msg('newest', 1)], {}));

    ok(html.indexOf('oldest') < html.indexOf('middle'), 'the oldest comes first');
    ok(html.indexOf('middle') < html.indexOf('newest'), 'and the newest goes last');
    ok(html.includes('id="chat-latest"'), 'the last message is an anchor');
    ok(html.includes('href="#chat-latest"'), 'with a way to jump straight to it');
    ok(html.indexOf('chat-messages-list') < html.indexOf('chat-message-form'), 'and you write underneath the conversation');
    ok(html.includes('%23chat-latest') || html.includes('#chat-latest'), 'after writing you come back to it');
  });
});

describe('chats: reactions', (t) => {
  t('a member reacts and the reaction toggles off on repeat', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Reacts', '', null, '', 'OPEN', [], null);
    await A.use('chats').sendMessage(chat.key, 'react to me');
    const [msg] = await A.use('chats').listMessages(chat.key);
    B.setActor();
    await B.use('chats').toggleReaction(chat.key, msg.key, 'heart');
    let seen = (await A.use('chats').listMessages(chat.key))[0];
    eq(seen.reactions.counts.heart, 1, 'heart counted once');
    await B.use('chats').toggleReaction(chat.key, msg.key, 'heart');
    seen = (await A.use('chats').listMessages(chat.key))[0];
    eq(seen.reactions.counts.heart, 0, 'second toggle removes it');
  });

  t('invalid emoji is rejected and mine flag reflects the viewer', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const chat = await A.use('chats').createChat('Mine', '', null, '', 'OPEN', [], null);
    await A.use('chats').sendMessage(chat.key, 'hola');
    const [msg] = await A.use('chats').listMessages(chat.key);
    let bad = false;
    try { await A.use('chats').toggleReaction(chat.key, msg.key, 'rocket'); } catch (_) { bad = true; }
    ok(bad, 'unknown emoji rejected');
    await A.use('chats').toggleReaction(chat.key, msg.key, 'up');
    const seen = (await A.use('chats').listMessages(chat.key))[0];
    ok(seen.reactions.mine.up, 'my own reaction is flagged');
  });
});

describe('chats: replies', (t) => {
  t('a reply carries the quoted author and text', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Replies', '', null, '', 'OPEN', [], null);
    await A.use('chats').sendMessage(chat.key, 'original words');
    const [orig] = await A.use('chats').listMessages(chat.key);
    B.setActor();
    await B.use('chats').sendMessage(chat.key, 'my answer', null, orig.key);
    const msgs = await A.use('chats').listMessages(chat.key);
    const reply = msgs.find(m => m.text === 'my answer');
    eq(reply.replyTo, orig.key, 'replyTo points at the original');
    eq(reply.reply.author, A.keypair.id, 'quoted author resolved');
    ok(reply.reply.text.includes('original words'), 'quoted text resolved');
  });

  t('a replyTo pointing outside the chat is dropped', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const one = await A.use('chats').createChat('One', '', null, '', 'OPEN', [], null);
    const two = await A.use('chats').createChat('Two', '', null, '', 'OPEN', [], null);
    await A.use('chats').sendMessage(one.key, 'foreign');
    const [foreign] = await A.use('chats').listMessages(one.key);
    await A.use('chats').sendMessage(two.key, 'local', null, foreign.key);
    const msgs = await A.use('chats').listMessages(two.key);
    eq(msgs[0].replyTo, null, 'cross-chat replyTo is not stored');
  });
});

describe('chats: pinned messages', (t) => {
  t('only the chat author can pin, and pinning toggles', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Pins', '', null, '', 'OPEN', [], null);
    await A.use('chats').sendMessage(chat.key, 'pin me');
    const [msg] = await A.use('chats').listMessages(chat.key);
    B.setActor();
    await B.use('chats').joinChat(chat.key);
    let denied = false;
    try { await B.use('chats').togglePin(chat.key, msg.key); } catch (_) { denied = true; }
    ok(denied, 'a plain member cannot pin');
    A.setActor();
    await A.use('chats').togglePin(chat.key, msg.key);
    let seen = (await A.use('chats').listMessages(chat.key))[0];
    ok(seen.pinned, 'author pin sticks');
    await A.use('chats').togglePin(chat.key, msg.key);
    seen = (await A.use('chats').listMessages(chat.key))[0];
    ok(!seen.pinned, 'second toggle unpins');
  });
});

const publishAs = async (P, content) => {
  const ssb = await P.cooler.open();
  return new Promise((res, rej) => ssb.publish(content, (e, m) => e ? rej(e) : res(m)));
};

const visibleTokenOf = (net) => {
  let token = null;
  for (const m of net.log) {
    const c = m.value && m.value.content;
    if (c && c.type === 'chat' && Array.isArray(c.invites)) for (const inv of c.invites) if (inv && typeof inv.ch === 'string') token = inv.ch;
  }
  return token;
};

describe('chats: the signed author is the author', (t) => {
  t('a message claiming somebody else as author shows who really sent it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Agora', '', null, '', 'OPEN', [], null);
    B.setActor();
    await B.use('chats').joinChat(chat.key);
    await publishAs(B, { type: 'chatMessage', chatId: chat.key, text: 'impostor', author: A.keypair.id, createdAt: new Date().toISOString() });
    A.setActor();
    const msg = (await A.use('chats').listMessages(chat.key)).find(m => m.text === 'impostor');
    ok(msg, 'the message is listed');
    eq(msg.author, B.keypair.id);
  });

  t('a chat claiming somebody else as author belongs to whoever signed it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    B.setActor();
    const fake = await publishAs(B, { type: 'chat', title: 'Fake', description: '', image: null, category: '', status: 'OPEN', tags: [], members: [B.keypair.id], invites: [], author: A.keypair.id, createdAt: new Date().toISOString() });
    A.setActor();
    const chat = await A.use('chats').getChatById(fake.key);
    eq(chat.author, B.keypair.id);
    let threw = false;
    try { await A.use('chats').deleteChatById(fake.key); } catch (_) { threw = true; }
    ok(threw, 'the named author cannot delete it');
  });
});

describe('chats: a private invitation token is not a key', (t) => {
  t('a stranger who copies the visible invitation token gets neither a seat nor the key', async () => {
    const net = makeNetwork(); const A = makePeer(net); const C = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Vault', 'd', null, '', 'INVITE-ONLY', [], null);
    await A.use('chats').generateInvite(chat.key);
    await A.use('chats').sendMessage(chat.key, 'secret from A');
    const token = visibleTokenOf(net);
    ok(token, 'the token is readable by anybody');
    C.setActor();
    await publishAs(C, { type: 'chatMember', target: chat.key, member: C.keypair.id, on: true, code: token, createdAt: new Date().toISOString() });
    A.setActor();
    await A.use('chats').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(!(await A.use('chats').getChatById(chat.key)).members.includes(C.keypair.id), 'the stranger is not a member');
    C.setActor();
    await C.use('chats').ingestKeys();
    const seen = await C.use('chats').listMessages(chat.key).catch(() => []);
    ok(!seen.some(m => m.text === 'secret from A'), 'the stranger cannot read');
  });

  t('the invited inhabitant joins once and the code is then spent', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const chat = await A.use('chats').createChat('Guild', 'd', null, '', 'INVITE-ONLY', [], null);
    await A.use('chats').sendMessage(chat.key, 'welcome');
    const code = await A.use('chats').generateInvite(chat.key);
    B.setActor();
    await B.use('chats').joinByInvite(code);
    ok((await B.use('chats').listMessages(chat.key)).some(m => m.text === 'welcome'), 'the invited inhabitant reads');
    A.setActor();
    ok((await A.use('chats').getChatById(chat.key)).members.includes(B.keypair.id), 'and is a member for the author');
    C.setActor();
    let reused = false;
    try { await C.use('chats').joinByInvite(code); } catch (_) { reused = true; }
    ok(reused, 'the same code does not work twice');
  });
});
