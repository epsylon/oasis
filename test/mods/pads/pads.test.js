const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('pads: standalone create + list', (t) => {
  t('A creates pad', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('pads').createPad('Notes', 'OPEN', '2026-12-31', ['notes'], null);
    ok(r);
    const list = await A.use('pads').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(list.length >= 1);
    const m = list.find(p => p.title === 'Notes');
    ok(m);
  });

  t('A closes pad', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('pads').createPad('P', 'OPEN', '2026-12-31', [], null);
    await A.use('pads').closePadById(r.key);
    const p = await A.use('pads').getPadById(r.key);
    eq(p.status, 'CLOSED');
  });

  t('A deletes pad', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const r = await A.use('pads').createPad('Tmp', 'OPEN', '2026-12-31', [], null);
    await A.use('pads').deletePadById(r.key);
    const list = await A.use('pads').listAll({ filter: 'all', viewerId: A.keypair.id });
    const found = list.find(p => p.title === 'Tmp');
    ok(!found);
  });
});

describe('pads: single-use invitation', (t) => {
  t('a guest who cannot read the pad yet can redeem a single-use code once', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('pads').createPad('Private', 'INVITE-ONLY', '2026-12-31', [], null);
    const code = await A.use('pads').generateInvite(r.key);
    B.setActor();
    ok(await B.use('pads').joinByInvite(code), 'B joins with the code');
    ok((await B.use('pads').listAll({ filter: 'all', viewerId: B.keypair.id })).some(p => p.title === 'Private'), 'and can read the pad');
    C.setActor();
    let reused = false;
    try { await C.use('pads').joinByInvite(code); } catch (_) { reused = true; }
    ok(reused, 'the same code does not work twice');
  });
});

describe('pads: open (multi-use) invitation', (t) => {
  t('open invitation is multi-use and only one at a time', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    A.setActor();
    const r = await A.use('pads').createPad('Shared', 'INVITE-ONLY', '2026-12-31', [], null);
    const code = await A.use('pads').generateOpenInvite(r.key);
    ok(typeof code === 'string' && code.length > 0, 'open invite code generated');
    eq((await A.use('pads').getOpenInvite(r.key)).code, code, 'getOpenInvite returns the code');
    let dup = false;
    try { await A.use('pads').generateOpenInvite(r.key); } catch (_) { dup = true; }
    ok(dup, 'a second open invitation is rejected');
    B.setActor();
    ok(await B.use('pads').joinByInvite(code), 'B joins via open invite');
    C.setActor();
    ok(await C.use('pads').joinByInvite(code), 'C also joins via the same open invite (multi-use)');
  });

  t('author can remove the open invitation', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('pads').createPad('Shared2', 'INVITE-ONLY', '2026-12-31', [], null);
    const code = await A.use('pads').generateOpenInvite(r.key);
    await A.use('pads').removeOpenInvite(r.key);
    eq(await A.use('pads').getOpenInvite(r.key), null, 'open invite removed');
    B.setActor();
    let threw = false;
    try { await B.use('pads').joinByInvite(code); } catch (_) { threw = true; }
    ok(threw, 'removed open invite no longer works');
  });
});

describe('pads: encrypted visibility + duplicate collapse', (t) => {
  t('non-member never sees a blank encrypted pad', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('pads').createPad('Private Pad', 'INVITE-ONLY', '2026-12-31', [], null);
    B.setActor();
    const list = await B.use('pads').listAll({ filter: 'all', viewerId: B.keypair.id });
    ok(!list.some(p => p.undecryptable), 'no blank/undecryptable pad card shown to a non-member');
    ok(!list.some(p => p.title === 'Private Pad'), 'private pad not shown to a non-member');
  });

  t('duplicate pad roots are collapsed: original + freshest members', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('pads').createPad('Board', 'OPEN', '2026-12-31', ['t'], null);
    const before = (await A.use('pads').listAll({ filter: 'all', viewerId: A.keypair.id })).find(p => p.title === 'Board');
    ok(before, 'original pad exists');
    const ssbA = await A.cooler.open();
    await new Promise((res, rej) => ssbA.publish({
      type: 'pad', title: 'Board', status: 'OPEN', deadline: '2026-12-31', tags: ['t'], encrypted: false,
      author: A.keypair.id, members: [A.keypair.id, B.keypair.id], invites: [],
      createdAt: before.createdAt, updatedAt: new Date(Date.now() + 5000).toISOString()
    }, e => e ? rej(e) : res()));
    const list = await A.use('pads').listAll({ filter: 'all', viewerId: A.keypair.id });
    const boards = list.filter(p => p.title === 'Board');
    eq(boards.length, 1, 'the duplicate pad root is collapsed into a single card');
    eq(boards[0].key, before.key, 'canonical card keeps the original (first-created) key');
    eq((boards[0].members || []).length, 2, 'members taken from the freshest duplicate');
  });
});

describe('pads: cross-author replaces does not hide entries (regression)', (t) => {
  t('entries stay visible when the pad has a foreign-authored replaces version', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const pad = await A.use('pads').createPad('Notes', 'OPEN', '2026-12-31', [], null);
    await A.use('pads').addEntry(pad.key, 'first entry by A');

    const ssbB = await B.cooler.open();
    const v1 = await new Promise((res, rej) => ssbB.publish({
      type: 'pad', title: 'Notes', status: 'OPEN', deadline: '2026-12-31', tags: [],
      members: [A.keypair.id, B.keypair.id], invites: [], author: A.keypair.id,
      encrypted: false, replaces: pad.key, createdAt: new Date().toISOString()
    }, (e, r) => e ? rej(e) : res(r)));

    A.setActor();
    const viaRoot = await A.use('pads').getEntries(pad.key);
    ok(viaRoot.some(e => e.text === 'first entry by A'), 'entry visible via the original root');
    const viaVersion = await A.use('pads').getEntries(v1.key);
    ok(viaVersion.some(e => e.text === 'first entry by A'), 'entry visible when opened via the foreign-authored version id');
    eq(viaVersion.length, viaRoot.length, 'same entry count regardless of which chain version id is used');
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
    if (c && c.type === 'pad' && Array.isArray(c.invites)) for (const inv of c.invites) if (inv && typeof inv.ch === 'string') token = inv.ch;
  }
  return token;
};

describe('pads: the signed author is the author', (t) => {
  t('an entry claiming somebody else as author shows who really wrote it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const pad = await A.use('pads').createPad('Board', 'OPEN', '2026-12-31', [], null);
    B.setActor();
    await publishAs(B, { type: 'padEntry', padId: pad.key, text: 'impostor', author: A.keypair.id, createdAt: new Date().toISOString() });
    A.setActor();
    const entry = (await A.use('pads').getEntries(pad.key)).find(e => e.text === 'impostor');
    ok(entry, 'the entry is listed');
    eq(entry.author, B.keypair.id);
  });

  t('a pad claiming somebody else as author cannot be edited, closed or deleted by them', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    B.setActor();
    const fake = await publishAs(B, { type: 'pad', title: 'Fake', status: 'OPEN', deadline: '2026-12-31', tags: [], encrypted: false, author: A.keypair.id, members: [B.keypair.id], invites: [], createdAt: new Date().toISOString() });
    A.setActor();
    eq((await A.use('pads').getPadById(fake.key)).author, B.keypair.id);
    for (const attempt of [() => A.use('pads').updatePadById(fake.key, { title: 'Taken' }), () => A.use('pads').closePadById(fake.key), () => A.use('pads').deletePadById(fake.key)]) {
      let threw = false;
      try { await attempt(); } catch (_) { threw = true; }
      ok(threw, 'the named author is refused');
    }
    eq((await A.use('pads').getPadById(fake.key)).title, 'Fake');
  });
});

describe('pads: keys reach members and nobody else', (t) => {
  t('a member added by the author receives the key on the next listing', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const pad = await A.use('pads').createPad('Inner', 'INVITE-ONLY', '2026-12-31', [], null);
    await A.use('pads').addMemberToPad(pad.key, B.keypair.id);
    await A.use('pads').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(net.log.some(m => m.value.author === A.keypair.id && m.value.content.type === 'tribe-keys' && m.value.content.memberKeys && m.value.content.memberKeys[B.keypair.id]), 'the key is boxed for the member');
    B.setActor();
    await B.use('pads').ingestKeys();
    ok((await B.use('pads').listAll({ filter: 'all', viewerId: B.keypair.id })).some(p => p.title === 'Inner'), 'the member reads the pad');
  });

  t('a stranger who copies the visible invitation token gets neither a seat nor the key', async () => {
    const net = makeNetwork(); const A = makePeer(net); const C = makePeer(net);
    A.setActor();
    const pad = await A.use('pads').createPad('Locked', 'INVITE-ONLY', '2026-12-31', [], null);
    await A.use('pads').generateInvite(pad.key);
    const token = visibleTokenOf(net);
    ok(token, 'the token is readable by anybody');
    C.setActor();
    await publishAs(C, { type: 'padMember', target: pad.key, member: C.keypair.id, on: true, code: token, createdAt: new Date().toISOString() });
    A.setActor();
    await A.use('pads').listAll({ filter: 'all', viewerId: A.keypair.id });
    ok(!(await A.use('pads').getPadById(pad.key)).members.includes(C.keypair.id), 'the stranger is not a member');
    C.setActor();
    await C.use('pads').ingestKeys();
    ok(!(await C.use('pads').listAll({ filter: 'all', viewerId: C.keypair.id })).some(p => p.title === 'Locked'), 'the stranger cannot read');
  });
});

describe('pads: changing the key when someone leaves', (t) => {
  t('the owner changes the key and only those who stay receive it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); const C = makePeer(net);
    const pause = () => new Promise(r => setTimeout(r, 5));
    const keysOf = (P) => require('../../../src/models/crypto')(P.configDir, 'pads');
    A.setActor();
    const r = await A.use('pads').createPad('Rotating', 'INVITE-ONLY', '2030-12-31', [], null);
    const codeB = await A.use('pads').generateInvite(r.key);
    const codeC = await A.use('pads').generateInvite(r.key);
    B.setActor(); await B.use('pads').joinByInvite(codeB);
    C.setActor(); await C.use('pads').joinByInvite(codeC);
    A.setActor(); await A.use('pads').listAll({ filter: 'all', viewerId: A.keypair.id });
    await pause();
    const before = net.log.length;
    C.setActor(); await C.use('pads').leavePad(r.key);
    ok(!net.log.slice(before).some(m => m.value.content.type === 'tribe-keys'), 'the one who leaves does not hand out a key');
    await pause();
    A.setActor(); await A.use('pads').listAll({ filter: 'all', viewerId: A.keypair.id });
    const fresh = keysOf(A).getKey(r.key);
    ok(!keysOf(C).getKeys(r.key).includes(fresh), 'the new key is not the one the leaver had');
    B.setActor(); await B.use('pads').ingestKeys();
    C.setActor(); await C.use('pads').ingestKeys();
    ok(keysOf(B).getKeys(r.key).includes(fresh), 'the member who stays gets the new key');
    ok(!keysOf(C).getKeys(r.key).includes(fresh), 'the member who left does not');
  });
});
