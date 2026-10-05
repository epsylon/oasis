const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const SecretStack = require('../../../src/server/node_modules/secret-stack');
const ssbKeys = require('../../../src/server/node_modules/ssb-keys');
const pull = require('../../../src/server/node_modules/pull-stream');
const phone = require('../../../src/server/phone_module');
const { roomNumberOf } = require('../../../src/models/phone_number');

const caps = { shs: crypto.randomBytes(32).toString('base64') };
const tmpRoot = path.join(os.tmpdir(), 'oasis-rooms-tests');
const freePort = () => 30000 + Math.floor(Math.random() * 20000);
const waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const asP = (fn, ...args) => new Promise((resolve, reject) => fn(...args, (err, v) => err ? reject(err) : resolve(v)));

const devices = new Map();
const fakeAudio = (server) => {
  const dev = { played: [], mics: new Set() };
  devices.set(server.id, dev);
  return {
    capture(onPcm) { dev.mics.add(onPcm); return { stop() { dev.mics.delete(onPcm); } }; },
    player() { return { write(buf) { dev.played.push(Buffer.from(buf)); return true; }, stop() {} }; }
  };
};
const speak = (id, value, frames = 5) => {
  const pcm = Buffer.alloc(320 * frames);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(value, i);
  for (const mic of devices.get(id).mics) mic(pcm);
};
const heard = (id, value) => devices.get(id).played.some(b => b.length >= 320 && Math.abs(b.readInt16LE(0) - value) < value * 0.05 && Math.abs(b.readInt16LE(318) - value) < value * 0.05);
const listen = async (id, rounds = 8) => { for (let i = 0; i < rounds; i++) { speak(id, 0); await sleep(25); } };
const hears = (id, value) => waitFor(async () => { await listen(id, 2); return heard(id, value); });

const makeNode = (prefs = {}) => {
  phone.setAudioFactory(fakeAudio);
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'node-'));
  const port = freePort();
  const keys = ssbKeys.generate();
  const node = SecretStack({ caps })
    .use(phone)
    .call(null, { path: dir, keys, port, host: '127.0.0.1', phone: { ringMs: 1500, ...prefs }, connections: { incoming: { net: [{ scope: 'device', transform: 'shs', port, host: '127.0.0.1' }] }, outgoing: { net: [{ transform: 'shs' }] } } });
  node.__dir = dir;
  node.__port = port;
  node.__keys = keys;
  node.__events = [];
  pull(node.phone.events(), pull.drain(ev => { node.__events.push(ev); }));
  return node;
};
const closeNode = (n) => new Promise((resolve) => n.close(() => { try { fs.rmSync(n.__dir, { recursive: true, force: true }); } catch (_) {} resolve(); }));
const closeAll = (...nodes) => Promise.all(nodes.map(closeNode));
const link = async (a, b) => {
  const addr = `net:127.0.0.1:${b.__port}~shs:${b.__keys.public.replace('.ed25519', '')}`;
  let lastErr = null;
  for (let i = 0; i < 40; i++) {
    lastErr = await new Promise((resolve) => a.connect(addr, (err) => resolve(err || null)));
    if (!lastErr) break;
    await sleep(100);
  }
  if (lastErr) throw lastErr;
  await waitFor(() => Array.isArray(a.peers[b.id]) && a.peers[b.id].length > 0);
};
const roomFor = (owner, hub, extra = {}) => {
  const rid = crypto.randomBytes(16).toString('hex');
  return { rid, owner: owner.id, token: owner.phone.roomToken(rid), hub: hub.id, address: '', ref: '%room', title: 'Room', ...extra };
};
const count = (n) => (n.phone.roomState() || {}).count || 0;
const secure = (n) => !!(n.phone.roomState() || {}).secure;
const joinError = async (n, room) => { try { await asP(n.phone.roomJoin, room); return null; } catch (e) { return e.message; } };

phone.setAudioFactory(fakeAudio);

describe('rooms: meeting on a pub', (t) => {
  t('inhabitants meet in a room on a pub and hear each other; the pub only forwards', async () => {
    const pub = makeNode({ relayOpen: true });
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, pub); await link(b, pub);
      notOk(a.peers[b.id] && a.peers[b.id].length, 'A and B have no direct connection');
      const room = roomFor(a, pub);
      eq((await asP(a.phone.roomJoin, room)).count, 1, 'the first one is alone in the room');
      await asP(b.phone.roomJoin, room);
      ok(await waitFor(() => count(a) === 2 && count(b) === 2), 'both see two participants');
      ok(await waitFor(() => secure(a) && secure(b)), 'both hold the room key');
      eq(a.phone.roomState().peers[0].id, b.id, 'A sees B inside');
      speak(a.id, 8000);
      ok(await hears(b.id, 8000), 'B hears A');
      speak(b.id, 4000);
      ok(await hears(a.id, 4000), 'A hears B');
      eq(pub.phone.roomState(), null, 'the pub is not a participant');
      eq((await asP(a.phone.roomCount, { rid: room.rid, hub: pub.id })).count, 2, 'the pub reports how many are inside');
      await asP(b.phone.roomLeave);
      ok(await waitFor(() => count(a) === 1), 'leaving is seen by the others');
      ok(b.__events.some(e => e.type === 'roomEnded' && e.room.outcome === 'left'), 'the one who leaves gets the room in its history');
    } finally { await closeAll(a, b, pub); }
  });

  t('silence and a muted microphone send nothing', async () => {
    const pub = makeNode({ relayOpen: true });
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, pub); await link(b, pub);
      const room = roomFor(a, pub);
      await asP(a.phone.roomJoin, room); await asP(b.phone.roomJoin, room);
      ok(await waitFor(() => secure(a) && secure(b)), 'the room is ready');
      await listen(b.id, 20); await listen(a.id, 10);
      notOk(a.phone.roomState().peers[0].speaking, 'a silent participant is not heard as speaking');
      speak(b.id, 5000);
      ok(await waitFor(() => a.phone.roomState().peers[0].speaking), 'a voice is');
      await asP(b.phone.roomMute, true);
      ok(b.phone.roomState().muted, 'B is muted');
      await sleep(1200);
      speak(b.id, 6000);
      await listen(a.id, 10);
      notOk(heard(a.id, 6000), 'nothing leaves a muted microphone');
      notOk(a.phone.roomState().peers[0].speaking);
    } finally { await closeAll(a, b, pub); }
  });

  t('the room keeps working after the first participant leaves, also for newcomers', async () => {
    const pub = makeNode({ relayOpen: true });
    const a = makeNode(); const b = makeNode(); const c = makeNode(); const d = makeNode();
    try {
      for (const n of [a, b, c, d]) await link(n, pub);
      const room = roomFor(a, pub);
      for (const n of [a, b, c]) await asP(n.phone.roomJoin, room);
      ok(await waitFor(() => [a, b, c].every(n => count(n) === 3 && secure(n))), 'three inside');
      speak(c.id, 4000);
      ok(await hears(b.id, 4000), 'B hears C while A is inside');
      speak(b.id, 5000);
      ok(await hears(c.id, 5000), 'and C hears B');
      await asP(a.phone.roomLeave);
      ok(await waitFor(() => count(b) === 2 && count(c) === 2), 'A left');
      speak(c.id, 7000);
      ok(await hears(b.id, 7000), 'B still hears C');
      speak(b.id, 8000);
      ok(await hears(c.id, 8000), 'and C still hears B');
      await asP(d.phone.roomJoin, room);
      ok(await waitFor(() => secure(d)), 'a newcomer gets the key from those inside');
      speak(b.id, 3000);
      ok(await hears(d.id, 3000), 'and hears them');
    } finally { await closeAll(a, b, c, d, pub); }
  });

  t('invite-only rooms use the participants\' shared secret: someone without it hears nothing', async () => {
    const pub = makeNode({ relayOpen: true });
    const a = makeNode(); const b = makeNode(); const c = makeNode();
    try {
      for (const n of [a, b, c]) await link(n, pub);
      const room = roomFor(a, pub);
      await asP(a.phone.roomJoin, { ...room, secrets: ['k1'] });
      await asP(b.phone.roomJoin, { ...room, secrets: ['k1'] });
      await asP(c.phone.roomJoin, { ...room, secrets: ['someone else'] });
      ok(await waitFor(() => count(a) === 3), 'all three reached the room');
      ok(secure(a) && secure(b), 'members are ready at once');
      speak(a.id, 9000);
      ok(await hears(b.id, 9000), 'a member hears');
      await listen(c.id, 20);
      notOk(heard(c.id, 9000), 'without the secret nothing can be heard');
    } finally { await closeAll(a, b, c, pub); }
  });
});

describe('rooms: limits and refusals', (t) => {
  t('a full room refuses one more until someone leaves', async () => {
    const pub = makeNode({ relayOpen: true, roomMax: 2 });
    const a = makeNode(); const b = makeNode(); const c = makeNode();
    try {
      for (const n of [a, b, c]) await link(n, pub);
      const room = roomFor(a, pub);
      await asP(a.phone.roomJoin, room); await asP(b.phone.roomJoin, room);
      eq(await joinError(c, room), 'full', 'the third one is refused');
      eq(c.phone.roomState(), null, 'and is not inside');
      eq((await asP(c.phone.roomCount, { rid: room.rid, hub: pub.id })).max, 2, 'the limit is visible before joining');
      await asP(b.phone.roomLeave);
      ok(await waitFor(() => count(a) === 1));
      eq(await joinError(c, room), null, 'once someone leaves there is room again');
    } finally { await closeAll(a, b, c, pub); }
  });

  t('a pub only hosts rooms it can verify and opened by inhabitants it serves', async () => {
    const open = makeNode({ relayOpen: true });
    const strict = makeNode();
    const off = makeNode({ relayOpen: true, relay: false });
    const a = makeNode(); const b = makeNode();
    try {
      for (const p of [open, strict, off]) await link(a, p);
      const forged = { ...roomFor(a, open), token: b.phone.roomToken('0'.repeat(32)) };
      eq(await joinError(a, forged), 'refused', 'a room not signed by its creator is refused');
      eq(await joinError(a, roomFor(a, strict)), 'refused', 'a pub that does not serve the creator refuses');
      eq(await joinError(a, roomFor(a, off)), 'refused', 'a pub with relaying off refuses');
      eq(await joinError(a, roomFor(a, b)), 'unreachable', 'an unreachable meeting point is reported as such');
    } finally { await closeAll(a, b, open, strict, off); }
  });

  t('the creator\'s own node can hold the room, and nobody rings while inside', async () => {
    const a = makeNode(); const b = makeNode();
    try {
      await link(b, a);
      const room = roomFor(a, a);
      await asP(a.phone.roomJoin, room);
      await asP(b.phone.roomJoin, room);
      ok(await waitFor(() => count(a) === 2 && secure(b)), 'B joined the room held by A');
      speak(a.id, 6000);
      ok(await hears(b.id, 6000), 'and hears A');
      let busy = null;
      try { await asP(a.phone.call, b.id); } catch (e) { busy = e.message; }
      eq(busy, 'busy', 'no call can start from inside a room');
      await asP(b.phone.roomLeave);
      await asP(b.phone.call, a.id);
      await sleep(600);
      eq(a.phone.state(), null, 'a call to someone inside a room never rings');
      await asP(b.phone.end);
    } finally { await closeAll(a, b); }
  });
});

describe('rooms: model', (t) => {
  t('open rooms are listed with their participants and a stable number', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('rooms').createRoom({ title: 'Plaza', description: 'Open talk', status: 'OPEN', tags: 'talk' });
    const room = (await A.use('rooms').listAll({ filter: 'all' })).find(x => x.title === 'Plaza');
    ok(room, 'the room is listed');
    eq(room.type, 'OPEN');
    eq(room.members.length, 1, 'the creator is the first participant');
    eq(room.number, roomNumberOf(r.key), 'it has a stable phone number');
    ok(/^[0-9a-f]{32}$/.test(room.rid), 'and a meeting id');
    B.setActor();
    await B.use('rooms').addMemberToRoom(r.key, B.keypair.id);
    eq((await B.use('rooms').getRoomById(r.key)).members.length, 2, 'joining adds a participant');
    eq((await B.use('rooms').findByNumber(room.number.replace('-', ''))).map(x => x.rootId)[0], r.key, 'the room is found by its number');
  });

  t('invite-only rooms stay hidden and sealed until an invitation is used', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('rooms').createRoom({ title: 'Backroom', description: 'secret plans', status: 'INVITE-ONLY' });
    const mine = await A.use('rooms').getRoomById(r.key);
    eq(mine.type, 'INVITE-ONLY');
    const raw = await new Promise((res, rej) => B.node.get(r.key, (e, m) => e ? rej(e) : res(m)));
    notOk(JSON.stringify(raw.content).includes('secret plans') || JSON.stringify(raw.content).includes(mine.rid), 'neither the text nor the meeting id travel in clear');
    B.setActor();
    notOk((await B.use('rooms').listAll({ filter: 'all' })).some(x => x.rootId === r.key), 'outsiders do not see it');
    A.setActor();
    const code = await A.use('rooms').generateInvite(r.key);
    B.setActor();
    eq(await B.use('rooms').joinByInvite(code), r.key, 'the invitation opens it');
    const seen = await B.use('rooms').getRoomById(r.key);
    eq(seen.title, 'Backroom', 'the guest can read it');
    eq(seen.rid, mine.rid, 'and meet in the same place');
    ok(seen.members.includes(B.keypair.id), 'as a participant');
    eq((await B.use('rooms').liveParams({ ...seen, token: 'x' })).secrets[0], (await A.use('rooms').liveParams({ ...mine, token: 'x' })).secrets[0], 'both share the room secret');
  });

  t('removing the open invitation renews the room secret for those inside, not for whoever kept the code', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('rooms').createRoom({ title: 'Den', description: 'x', status: 'INVITE-ONLY' });
    const code = await A.use('rooms').generateOpenInvite(r.key);
    B.setActor();
    await B.use('rooms').joinByInvite(code);
    A.setActor();
    const before = (await A.use('rooms').liveParams({ ...(await A.use('rooms').getRoomById(r.key)), token: 'x' })).secrets;
    await A.use('rooms').removeOpenInvite(r.key);
    const after = (await A.use('rooms').liveParams({ ...(await A.use('rooms').getRoomById(r.key)), token: 'x' })).secrets;
    eq(after.length, 1, 'a room meets with a single secret');
    ok(after[0] !== before[0], 'the secret changes once the open invitation is gone');
    B.setActor();
    await B.use('rooms').ingestKeys();
    eq((await B.use('rooms').liveParams({ ...(await B.use('rooms').getRoomById(r.key)), token: 'x' })).secrets[0], after[0], 'a participant receives the new one');
  });

  t('tribe rooms are sealed with the tribe', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const tribe = await A.use('tribes').createTribe('Guild', '', null, '', [], true, 'strict', null, 'OPEN', '');
    const tribeId = tribe.key || tribe.id;
    const r = await A.use('rooms').createRoom({ title: 'Assembly', description: 'tribe only', tribeId });
    const room = (await A.use('rooms').listAll({ filter: 'all' })).find(x => x.rootId === r.key);
    ok(room && room.title === 'Assembly' && room.tribeId === tribeId, 'members read it');
    ok((await A.use('rooms').liveParams({ ...room, token: 'x' })).secrets.length, 'the tribe key protects it');
    B.setActor();
    notOk((await B.use('rooms').listAll({ filter: 'all' })).some(x => x.rootId === r.key), 'outsiders do not see it');
    const raw = await new Promise((res, rej) => B.node.get(r.key, (e, m) => e ? rej(e) : res(m)));
    notOk(JSON.stringify(raw.content).includes('tribe only'), 'nothing travels in clear');
  });

  t('only the creator edits, closes and deletes a room', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    const r = await A.use('rooms').createRoom({ title: 'Draft', status: 'OPEN' });
    const before = await A.use('rooms').getRoomById(r.key);
    B.setActor();
    let refused = false;
    try { await B.use('rooms').updateRoomById(r.key, { title: 'Hijack' }); } catch (_) { refused = true; }
    ok(refused, 'others cannot edit it');
    A.setActor();
    await A.use('rooms').updateRoomById(r.key, { title: 'Final', description: 'now described' });
    const after = await A.use('rooms').getRoomById(r.key);
    eq(after.title, 'Final');
    eq(after.rid, before.rid, 'editing keeps the meeting place');
    eq(after.number, before.number, 'and the number');
    await A.use('rooms').closeRoomById(r.key);
    ok((await A.use('rooms').getRoomById(r.key)).isClosed, 'a closed room stays listed as closed');
    eq((await A.use('rooms').findByNumber(after.number)).length, 0, 'but can no longer be dialled');
    await A.use('rooms').deleteRoomById(r.key);
    eq(await A.use('rooms').getRoomById(r.key), null, 'deleting removes it');
  });
});
