const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');
const SecretStack = require('../../../src/server/node_modules/secret-stack');
const ssbKeys = require('../../../src/server/node_modules/ssb-keys');
const phone = require('../../../src/server/phone_module');

const caps = { shs: crypto.randomBytes(32).toString('base64') };
const tmpRoot = path.join(os.tmpdir(), 'oasis-phone-tests');
const freePort = () => 30000 + Math.floor(Math.random() * 20000);
const waitFor = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

const BEEP_BYTES = 8000 * 0.7 * 2;
const DOUBLE_BEEP_BYTES = 8000 * 0.45 * 2;
const makeNode = (prefs = {}) => {
  phone.setAudioFactory(fakeAudio);
  fs.mkdirSync(tmpRoot, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'node-'));
  const port = freePort();
  const keys = ssbKeys.generate();
  const node = SecretStack({ caps })
    .use(phone)
    .call(null, { path: dir, keys, port, host: '127.0.0.1', phone: { ringMs: 1500, voicemailMaxMs: 3000, opus: false, ...prefs }, connections: { incoming: { net: [{ scope: 'device', transform: 'shs', port, host: '127.0.0.1' }] }, outgoing: { net: [{ transform: 'shs' }] } } });
  node.__dir = dir;
  node.__port = port;
  node.__keys = keys;
  const events = [];
  require('../../../src/server/node_modules/pull-stream')(node.phone.events(), require('../../../src/server/node_modules/pull-stream').drain(ev => { events.push(ev); }));
  node.__events = events;
  return node;
};
const closeNode = (n) => new Promise((resolve) => n.close(() => { try { fs.rmSync(n.__dir, { recursive: true, force: true }); } catch (_) {} resolve(); }));
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
const asP = (fn, ...args) => new Promise((resolve, reject) => fn(...args, (err, v) => err ? reject(err) : resolve(v)));
const ended = (n) => n.__events.filter(e => e.type === 'ended').map(e => e.call);
const speakTone = (id, amp, frames = 25) => {
  const pcm = Buffer.alloc(320 * frames);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 400 * i / 8000) * amp), i * 2);
  for (const mic of devices.get(id).mics) mic(pcm);
};
const rms = (buf) => { let e = 0; const n = buf.length >> 1; for (let i = 0; i < n; i++) { const v = buf.readInt16LE(i * 2); e += v * v; } return n ? Math.sqrt(e / n) : 0; };
const hearsTone = (id, amp) => devices.get(id).played.some(b => b.length >= 320 && rms(b) > amp * 0.55);
const peak = (buf) => { let m = 0; for (let i = 0; i + 1 < buf.length; i += 2) m = Math.max(m, Math.abs(buf.readInt16LE(i))); return m; };

phone.setAudioFactory(fakeAudio);

describe('phone: audio codec', (t) => {
  t('telephone encoding keeps a voice-range signal within a few percent', () => {
    const pcm = Buffer.alloc(320);
    for (let i = 0; i < 160; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 5) * 12000), i * 2);
    const back = phone.ulawDecode(phone.ulawEncode(pcm));
    eq(back.length, pcm.length);
    let worst = 0;
    for (let i = 0; i < 160; i++) worst = Math.max(worst, Math.abs(back.readInt16LE(i * 2) - pcm.readInt16LE(i * 2)));
    ok(worst < 12000 * 0.04, `max error ${worst}`);
  });
});

describe('phone: a call between two nodes', (t) => {
  t('ring, answer, encrypted audio both ways and hang up', async () => {
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, b);
      await asP(a.phone.call, b.id);
      eq(a.phone.state().phase, 'calling');
      ok(await waitFor(() => b.phone.state() && b.phone.state().phase === 'incoming'), 'the callee rings');
      ok(await waitFor(() => a.phone.state().reached), 'the caller learns that the call reached the other side');
      eq(b.phone.state().peer, a.id, 'and sees who is calling');
      await asP(b.phone.accept);
      ok(await waitFor(() => a.phone.state() && a.phone.state().phase === 'connected' && b.phone.state() && b.phone.state().phase === 'connected'), 'both sides are connected');
      speak(a.id, 9000);
      speak(b.id, 5000);
      ok(await waitFor(() => heard(b.id, 9000)), 'the callee hears the caller');
      ok(await waitFor(() => heard(a.id, 5000)), 'the caller hears the callee');
      await asP(a.phone.end);
      ok(await waitFor(() => !b.phone.state()), 'hanging up ends the call on the other side');
      eq(ended(a)[0].outcome, 'ended');
      eq(ended(b)[0].outcome, 'ended');
      ok(ended(b)[0].answeredAt > 0, 'the answered time is recorded');
    } finally { await closeNode(a); await closeNode(b); }
  });

  t('a muted side sends nothing', async () => {
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, b);
      await asP(a.phone.call, b.id);
      await waitFor(() => b.phone.state() && b.phone.state().phase === 'incoming');
      await asP(b.phone.accept);
      await waitFor(() => a.phone.state() && a.phone.state().phase === 'connected' && b.phone.state().phase === 'connected');
      await asP(a.phone.mute, true);
      speak(a.id, 7000, 20);
      await sleep(400);
      ok(!heard(b.id, 7000), 'muted audio never reaches the other side');
      await asP(a.phone.mute, false);
      speak(a.id, 7000);
      ok(await waitFor(() => heard(b.id, 7000)), 'and flows again when unmuted');
      await asP(b.phone.end);
    } finally { await closeNode(a); await closeNode(b); }
  });
});

describe('phone: the caller always sees the same thing', (t) => {
  t('a rejected call keeps ringing for the caller and ends as no answer', async () => {
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, b);
      await asP(a.phone.call, b.id);
      await waitFor(() => b.phone.state() && b.phone.state().phase === 'incoming');
      await asP(b.phone.reject);
      await sleep(300);
      eq(a.phone.state().phase, 'calling', 'rejecting tells the caller nothing');
      ok(await waitFor(() => a.phone.state().phase === 'recording', 4000), 'after the ringing time it is just no answer: leave a message');
      eq(a.phone.state().why, 'noanswer');
      eq(ended(b)[0].outcome, 'rejected');
    } finally { await closeNode(a); await closeNode(b); }
  });

  t('do not disturb never rings and looks like no answer', async () => {
    const a = makeNode(); const b = makeNode({ dnd: true });
    try {
      await link(a, b);
      await asP(a.phone.call, b.id);
      await sleep(400);
      eq(b.phone.state(), null, 'nothing rings');
      ok(a.phone.state().reached, 'for the caller it rings as usual');
      ok(await waitFor(() => a.phone.state().phase === 'recording', 4000), 'the caller only sees no answer');
      eq(a.phone.state().why, 'noanswer');
      eq(b.__events.filter(e => e.type === 'incoming').length, 0, 'and nothing is recorded on the callee side');
    } finally { await closeNode(a); await closeNode(b); }
  });

  t('a call that reaches nobody stays connecting, without ringing, and ends in a message', async () => {
    const a = makeNode();
    try {
      await asP(a.phone.call, '@' + crypto.randomBytes(32).toString('base64') + '.ed25519');
      eq(a.phone.state().phase, 'calling');
      await sleep(300);
      notOk(a.phone.state().reached, 'it is still connecting');
      ok(devices.get(a.id).played.length > 0 && devices.get(a.id).played.every(b => peak(b) < 3000), 'only a soft connecting sound plays, no ringing tone');
      ok(await waitFor(() => a.phone.state().phase === 'recording', 4000), 'then a message can be left');
      eq(a.phone.state().why, 'unreachable', 'saying the person could not be reached');
    } finally { await closeNode(a); }
  });

  t('a person on an older Oasis that never confirms still gets the usual ringing once reached', async () => {
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, b);
      await asP(a.phone.call, b.id, { legacy: [b.id] });
      ok(a.phone.state().reached, 'it rings straight away');
      ok(await waitFor(() => devices.get(a.id).played.some(b => peak(b) > 5000)), 'with the ringing tone');
      ok(await waitFor(() => a.phone.state().phase === 'recording', 4000));
      eq(a.phone.state().why, 'noanswer', 'and ends as an ordinary no answer');
    } finally { await closeNode(a); await closeNode(b); }
  });

  t('an older Oasis that cannot be reached does not pretend to ring', async () => {
    const a = makeNode();
    try {
      const old = '@' + crypto.randomBytes(32).toString('base64') + '.ed25519';
      await asP(a.phone.call, old, { legacy: [old] });
      await sleep(300);
      notOk(a.phone.state().reached, 'it is still connecting');
      ok(devices.get(a.id).played.length > 0 && devices.get(a.id).played.every(b => peak(b) < 3000), 'without a ringing tone');
      ok(await waitFor(() => a.phone.state().phase === 'recording', 4000));
      eq(a.phone.state().why, 'unreachable', 'and says the person could not be reached');
    } finally { await closeNode(a); }
  });

  t('someone already on a call answers busy, and the call shows up as missed for them', async () => {
    const a = makeNode(); const b = makeNode(); const c = makeNode();
    try {
      await link(b, c);
      await link(a, b);
      await asP(c.phone.call, b.id);
      await waitFor(() => b.phone.state() && b.phone.state().phase === 'incoming');
      await asP(b.phone.accept);
      ok(await waitFor(() => c.phone.state() && c.phone.state().phase === 'connected'), 'B is talking with C');
      await asP(a.phone.call, b.id);
      ok(await waitFor(() => a.phone.state() && a.phone.state().phase === 'recording', 1200), 'A hears busy straight away and can leave a message');
      eq(a.phone.state().why, 'busy');
      eq(b.phone.state().peer, c.id, 'B\'s call goes on');
      ok(await waitFor(() => ended(b).some(e => e.peer === a.id && e.outcome === 'missed')), 'and B sees a missed call from A');
      await asP(a.phone.recordCancel);
      await asP(c.phone.end);
    } finally { await closeNode(a); await closeNode(b); await closeNode(c); }
  });

  t('a caller who keeps ringing is ignored once the budget for the minute is spent', async () => {
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, b);
      const rpc = a.peers[b.id][0];
      const chloride = require('../../../src/server/node_modules/chloride');
      const ring = async () => {
        const callId = crypto.randomBytes(16).toString('hex');
        const ephPk = crypto.randomBytes(32).toString('base64');
        const ts = Date.now();
        const sig = chloride.crypto_sign_detached(Buffer.from(['ring', callId, ephPk, b.id, ts].join('|')), Buffer.from(a.__keys.private.replace('.ed25519', ''), 'base64')).toString('base64');
        await asP(rpc.phone.ring, { callId, to: b.id, ephPk, ts, sig });
      };
      for (let i = 0; i < phone.RING_PER_WINDOW; i++) await ring();
      ok(await waitFor(() => b.phone.state() && b.phone.state().phase === 'incoming'), 'the first ring of the burst arrives');
      await asP(b.phone.end);
      await sleep(200);
      await ring();
      await sleep(300);
      eq(b.phone.state(), null, 'one more ring from the same caller is dropped');
    } finally { await closeNode(a); await closeNode(b); }
  });

  t('a forged ring signed by someone else is ignored', async () => {
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, b);
      const other = ssbKeys.generate();
      const rpc = a.peers[b.id][0];
      const ts = Date.now();
      const sig = require('../../../src/server/node_modules/chloride').crypto_sign_detached(Buffer.from(['ring', 'ab'.repeat(16), 'x', b.id, ts].join('|')), Buffer.from(other.private.replace('.ed25519', ''), 'base64')).toString('base64');
      await asP(rpc.phone.ring, { callId: 'ab'.repeat(16), to: b.id, ephPk: crypto.randomBytes(32).toString('base64'), ts, sig });
      await sleep(300);
      eq(b.phone.state(), null);
    } finally { await closeNode(a); await closeNode(b); }
  });
});

describe('phone: Opus', (t) => {
  t('two up-to-date nodes talk with Opus, both ways', async () => {
    const a = makeNode({ opus: true }); const b = makeNode({ opus: true });
    try {
      await link(a, b);
      await asP(a.phone.call, b.id);
      await waitFor(() => b.phone.state() && b.phone.state().phase === 'incoming');
      await asP(b.phone.accept);
      ok(await waitFor(() => a.phone.state() && a.phone.state().phase === 'connected' && b.phone.state().phase === 'connected'), 'connected');
      eq(a.phone.state().codec, 'opus', 'the caller uses Opus');
      eq(b.phone.state().codec, 'opus', 'and so does the callee');
      ok(await waitFor(async () => { speakTone(a.id, 12000); await sleep(60); return hearsTone(b.id, 12000); }), 'B hears A');
      ok(await waitFor(async () => { speakTone(b.id, 12000); await sleep(60); return hearsTone(a.id, 12000); }), 'A hears B');
      await asP(a.phone.end);
    } finally { await closeNode(a); await closeNode(b); }
  });

  t('with a node that has no Opus the call falls back to the old codec and still works', async () => {
    const a = makeNode({ opus: true }); const b = makeNode({ opus: false });
    try {
      await link(a, b);
      await asP(a.phone.call, b.id);
      await waitFor(() => b.phone.state() && b.phone.state().phase === 'incoming');
      await asP(b.phone.accept);
      ok(await waitFor(() => a.phone.state() && a.phone.state().phase === 'connected' && b.phone.state().phase === 'connected'));
      eq(a.phone.state().codec, 'ulaw', 'both agree on the old codec');
      ok(await waitFor(async () => { speak(a.id, 9000); await sleep(40); return heard(b.id, 9000); }), 'B hears A');
      ok(await waitFor(async () => { speak(b.id, 5000); await sleep(40); return heard(a.id, 5000); }), 'A hears B');
      await asP(a.phone.end);
    } finally { await closeNode(a); await closeNode(b); }
  });
});

describe('phone: private audio messages', (t) => {
  t('after the ringing time a beep sounds and the message records by itself', async () => {
    const a = makeNode(); const b = makeNode({ dnd: true });
    try {
      await link(a, b);
      await asP(a.phone.call, b.id);
      ok(await waitFor(() => a.phone.state().phase === 'recording', 4000), 'no answer turns into a message on its own');
      ok(await waitFor(() => devices.get(a.id).mics.size > 0, 2000), 'the microphone opens after the beep');
      ok(devices.get(a.id).played.some(buf => buf.length === BEEP_BYTES), 'a beep tells the caller to speak');
      speak(a.id, 3000, 50);
      const out = await asP(a.phone.recordStop);
      ok(fs.existsSync(out.file), 'the message is written');
      const wav = fs.readFileSync(out.file);
      eq(wav.toString('ascii', 0, 4), 'RIFF');
      eq(out.peer, b.id);
      ok(out.durationMs >= 900 && out.durationMs <= 1100, `about one second recorded (${out.durationMs} ms)`);
      eq(a.phone.state(), null, 'and the call is over');
      eq(ended(a)[0].outcome, 'pam');
      fs.unlinkSync(out.file);
    } finally { await closeNode(a); await closeNode(b); }
  });

  t('a recording too short to hold a word is never sent', async () => {
    const a = makeNode(); const b = makeNode({ dnd: true });
    try {
      await link(a, b);
      await asP(a.phone.call, b.id);
      ok(await waitFor(() => a.phone.state().phase === 'recording', 4000), 'the message starts');
      ok(await waitFor(() => devices.get(a.id).mics.size > 0, 2000));
      speak(a.id, 3000, 5);
      let err = null;
      try { await asP(a.phone.recordStop); } catch (e) { err = e; }
      eq(err && err.message, 'empty', 'a tenth of a second is not a message');
      eq(a.phone.state(), null, 'the call is over');
      eq(ended(a)[0].outcome, 'noanswer', 'and nothing was left for the other side');
    } finally { await closeNode(a); await closeNode(b); }
  });

  t('two beeps warn before the limit, then recording stops by itself', async () => {
    const a = makeNode({ pamWarnMs: 1000 });
    try {
      await asP(a.phone.call, '@' + crypto.randomBytes(32).toString('base64') + '.ed25519');
      ok(await waitFor(() => a.phone.state().phase === 'recording', 4000), 'recording starts by itself');
      ok(await waitFor(() => devices.get(a.id).played.some(buf => buf.length === DOUBLE_BEEP_BYTES), 4000), 'two beeps before the end');
      ok(await waitFor(() => a.phone.state().phase === 'recorded', 3000), 'it stops on its own');
      ok(a.__events.some(e => e.type === 'recordLimit'), 'and announces it so the message can be sent automatically');
      await asP(a.phone.recordCancel);
      eq(a.phone.state(), null, 'cancelling ends the call without a message');
    } finally { await closeNode(a); }
  });
});

describe('phone: calls through a pub', (t) => {
  t('two people who never connect to each other talk through a shared pub', async () => {
    const pub = makeNode({ relayOpen: true });
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, pub);
      await link(b, pub);
      ok(!(a.peers[b.id] && a.peers[b.id].length), 'A and B have no direct connection');
      await asP(a.phone.call, b.id);
      ok(await waitFor(() => b.phone.state() && b.phone.state().phase === 'incoming'), 'B rings through the pub');
      ok(await waitFor(() => a.phone.state().reached), 'and A learns through the pub that B has the call');
      eq(b.phone.state().peer, a.id, 'and sees who is really calling, not the pub');
      await asP(b.phone.accept);
      ok(await waitFor(() => a.phone.state() && a.phone.state().phase === 'connected' && b.phone.state() && b.phone.state().phase === 'connected'), 'both are connected');
      ok(await waitFor(async () => { speak(a.id, 8000); await sleep(40); return heard(b.id, 8000); }), 'B hears A through the pub');
      ok(await waitFor(async () => { speak(b.id, 4000); await sleep(40); return heard(a.id, 4000); }), 'A hears B through the pub');
      eq(pub.phone.state(), null, 'the pub is not part of the call');
      await asP(b.phone.end);
      ok(await waitFor(() => !a.phone.state()), 'hanging up reaches A through the pub');
    } finally { await closeNode(a); await closeNode(b); await closeNode(pub); }
  });

  t('when both can reach each other directly, the call goes direct and does not depend on the pub', async () => {
    const pub = makeNode({ relayOpen: true });
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, pub);
      await link(b, pub);
      await link(a, b);
      await asP(a.phone.call, b.id);
      ok(await waitFor(() => b.phone.state() && b.phone.state().phase === 'incoming'), 'B rings');
      await sleep(300);
      await asP(b.phone.accept);
      ok(await waitFor(() => a.phone.state() && a.phone.state().phase === 'connected' && b.phone.state() && b.phone.state().phase === 'connected'), 'both are connected');
      await closeNode(pub);
      speak(a.id, 8000);
      speak(b.id, 4000);
      ok(await waitFor(() => heard(b.id, 8000)), 'B still hears A without the pub');
      ok(await waitFor(() => heard(a.id, 4000)), 'and A hears B');
    } finally { await closeNode(a); await closeNode(b); await closeNode(pub).catch(() => {}); }
  });

  t('rejecting and do not disturb look the same through a pub', async () => {
    const pub = makeNode({ relayOpen: true });
    const a = makeNode(); const b = makeNode({ dnd: true });
    try {
      await link(a, pub);
      await link(b, pub);
      await asP(a.phone.call, b.id);
      await sleep(400);
      eq(b.phone.state(), null, 'B does not ring');
      ok(await waitFor(() => a.phone.state().phase === 'recording', 4000), 'A only sees no answer');
    } finally { await closeNode(a); await closeNode(b); await closeNode(pub); }
  });

  t('a pub that does not relay never delivers the call', async () => {
    const pub = makeNode({ relay: false });
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, pub);
      await link(b, pub);
      await asP(a.phone.call, b.id);
      await sleep(600);
      eq(b.phone.state(), null);
      ok(await waitFor(() => a.phone.state().phase === 'recording', 4000));
    } finally { await closeNode(a); await closeNode(b); await closeNode(pub); }
  });

  t('what a pub relays is sealed: it only sees where to deliver, never who calls', async () => {
    const seen = [];
    const spyPlugin = { name: 'phone', version: '1.0.0', manifest: { relay: 'async' }, permissions: { anonymous: { allow: ['relay'] } }, init() { return { relay(req, cb) { seen.push(req); cb(null, true); } }; } };
    fs.mkdirSync(tmpRoot, { recursive: true });
    const dir = fs.mkdtempSync(path.join(tmpRoot, 'spy-'));
    const port = freePort();
    const keys = ssbKeys.generate();
    const spy = SecretStack({ caps }).use(spyPlugin).call(null, { path: dir, keys, port, host: '127.0.0.1', connections: { incoming: { net: [{ scope: 'device', transform: 'shs', port, host: '127.0.0.1' }] }, outgoing: { net: [{ transform: 'shs' }] } } });
    spy.__dir = dir; spy.__port = port; spy.__keys = keys;
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, spy);
      await asP(a.phone.call, b.id);
      ok(await waitFor(() => seen.length > 0), 'the ring was handed to the pub');
      const req = seen[0];
      eq(req.to, b.id, 'it knows where to deliver');
      ok(typeof req.sealed === 'string' && !('from' in req) && !('ephPk' in req) && !('sig' in req), 'but the message itself is sealed');
      ok(!req.sealed.includes(a.id.slice(1, 20)), 'and the caller does not appear in it');
      await asP(a.phone.end);
    } finally { await closeNode(a); await closeNode(b); await closeNode(spy); }
  });

  t('a relayed ring with a forged signature is ignored', async () => {
    const pub = makeNode({ relayOpen: true });
    const a = makeNode(); const b = makeNode(); const c = makeNode();
    try {
      await link(b, pub);
      await link(c, pub);
      const ts = Date.now();
      const callId = 'cd'.repeat(16);
      const ephPk = crypto.randomBytes(32).toString('base64');
      const sig = require('../../../src/server/node_modules/chloride').crypto_sign_detached(Buffer.from(['ring', callId, ephPk, b.id, ts].join('|')), Buffer.from(c.__keys.private.replace('.ed25519', ''), 'base64')).toString('base64');
      const sealed = ssbKeys.box({ callId, from: a.id, to: b.id, ephPk, ts, sig }, [b.id]);
      await asP(c.peers[pub.id][0].phone.relay, { to: b.id, method: 'ring', cid: callId, sealed });
      await sleep(500);
      eq(b.phone.state(), null, 'C cannot ring B pretending to be A');
    } finally { await closeNode(a); await closeNode(b); await closeNode(c); await closeNode(pub); }
  });

  t('when the caller and the callee use different pubs, the pubs find each other', async () => {
    const p = makeNode({ relayOpen: true }); const q = makeNode({ relayOpen: true });
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, p);
      await link(p, q);
      await link(b, q);
      ok(!(a.peers[q.id] && a.peers[q.id].length) && !(b.peers[p.id] && b.peers[p.id].length), 'A only knows P and B only knows Q');
      await asP(a.phone.call, b.id);
      ok(await waitFor(() => b.phone.state() && b.phone.state().phase === 'incoming'), 'B rings: P passed the ring to Q');
      eq(b.phone.state().peer, a.id);
      await asP(b.phone.accept);
      ok(await waitFor(() => a.phone.state() && a.phone.state().phase === 'connected' && b.phone.state().phase === 'connected'), 'the answer found its way back');
      ok(await waitFor(async () => { speak(a.id, 7500); await sleep(40); return heard(b.id, 7500); }), 'B hears A across both pubs');
      ok(await waitFor(async () => { speak(b.id, 3500); await sleep(40); return heard(a.id, 3500); }), 'A hears B across both pubs');
      await asP(a.phone.end);
      ok(await waitFor(() => !b.phone.state()), 'hanging up crosses both pubs too');
    } finally { await closeNode(a); await closeNode(b); await closeNode(p); await closeNode(q); }
  });
});

describe('phone: one audio channel per call', (t) => {
  t('a second audio channel cannot take over an active call', async () => {
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, b);
      await asP(a.phone.call, b.id);
      await waitFor(() => b.phone.state() && b.phone.state().phase === 'incoming');
      await asP(b.phone.accept);
      await waitFor(() => a.phone.state() && a.phone.state().phase === 'connected' && b.phone.state().phase === 'connected');
      const pull = require('../../../src/server/node_modules/pull-stream');
      const extra = a.peers[b.id][0].phone.audio({ callId: b.phone.state().id }, () => {});
      pull(pull.empty(), extra.sink);
      const refused = await new Promise((resolve) => pull(extra.source, pull.collect((err) => resolve(!!err))));
      ok(refused, 'the extra channel is refused');
      speak(a.id, 6000);
      ok(await waitFor(() => heard(b.id, 6000)), 'and the original call keeps working');
      await asP(a.phone.end);
    } finally { await closeNode(a); await closeNode(b); }
  });
});

describe('phone: joint calls', (t) => {
  const pump = async (id, rounds = 6) => { for (let i = 0; i < rounds; i++) { speak(id, 0, 5); await sleep(30); } };
  const ringing = (n) => waitFor(() => n.phone.state() && n.phone.state().phase === 'incoming');

  t('everyone hears everyone through the caller, and each person keeps their own encrypted channel', async () => {
    const a = makeNode(); const b = makeNode(); const c = makeNode();
    try {
      await link(a, b); await link(a, c);
      await asP(a.phone.call, [b.id, c.id]);
      ok(a.phone.state().group, 'the caller sees a joint call');
      ok(await ringing(b) && await ringing(c), 'both people ring');
      eq(b.phone.state().peer, a.id);
      ok(b.phone.state().id !== c.phone.state().id, 'each person gets a separate call');
      await asP(b.phone.accept); await asP(c.phone.accept);
      ok(await waitFor(() => a.phone.state().peers.every(p => p.phase === 'connected') && b.phone.state().phase === 'connected' && c.phone.state().phase === 'connected'), 'both are connected');
      speak(b.id, 5000);
      await sleep(200);
      await pump(a.id);
      ok(await waitFor(() => heard(a.id, 5000)), 'the caller hears B');
      ok(await waitFor(() => heard(c.id, 5000)), 'C hears B through the caller');
      speak(c.id, 3000);
      await sleep(200);
      await pump(a.id);
      ok(await waitFor(() => heard(b.id, 3000)), 'B hears C through the caller');
      speak(a.id, 9000);
      ok(await waitFor(() => heard(b.id, 9000) && heard(c.id, 9000)), 'both hear the caller');
      await asP(a.phone.end);
      ok(await waitFor(() => !b.phone.state() && !c.phone.state()), 'the caller hanging up ends it for everyone');
      eq(ended(a)[0].outcome, 'ended');
      eq(ended(a)[0].peers.length, 2, 'the history keeps everyone who was called');
    } finally { await closeNode(a); await closeNode(b); await closeNode(c); }
  });

  t('you can stop hearing one person while everyone else keeps hearing them', async () => {
    const a = makeNode(); const b = makeNode(); const c = makeNode();
    try {
      await link(a, b); await link(a, c);
      await asP(a.phone.call, [b.id, c.id]);
      await ringing(b); await ringing(c);
      await asP(b.phone.accept); await asP(c.phone.accept);
      ok(await waitFor(() => a.phone.state().peers.every(p => p.phase === 'connected') && b.phone.state().phase === 'connected' && c.phone.state().phase === 'connected'), 'everyone is in');
      await asP(a.phone.silence, { id: b.id, on: true });
      ok(a.phone.state().peers.find(p => p.id === b.id).silenced, 'the caller sees whom they silenced');
      speak(b.id, 5000);
      await sleep(200);
      await pump(a.id);
      ok(await waitFor(() => heard(c.id, 5000)), 'C still hears B');
      notOk(heard(a.id, 5000), 'the caller does not');
      await asP(a.phone.silence, { id: b.id, on: false });
      notOk(a.phone.state().peers.find(p => p.id === b.id).silenced);
      speak(b.id, 4000);
      await sleep(200);
      await pump(a.id);
      ok(await waitFor(() => heard(a.id, 4000)), 'hearing again brings the voice back');
      let bad = null;
      try { await asP(a.phone.silence, { id: a.id, on: true }); } catch (e) { bad = e; }
      ok(bad, 'you cannot silence yourself this way');
    } finally { await closeNode(a); await closeNode(b); await closeNode(c); }
  });

  t('in a call for two, silencing the other keeps the call alive', async () => {
    const a = makeNode(); const b = makeNode();
    try {
      await link(a, b);
      await asP(a.phone.call, b.id);
      await ringing(b);
      await asP(b.phone.accept);
      ok(await waitFor(() => a.phone.state().phase === 'connected' && b.phone.state().phase === 'connected'));
      await asP(a.phone.silence, { id: b.id, on: true });
      ok(a.phone.state().silenced, 'the call shows the other side is silenced');
      speak(b.id, 7000);
      await sleep(300);
      notOk(heard(a.id, 7000), 'A does not hear B');
      ok(await waitFor(async () => { speak(a.id, 9000); await sleep(40); return heard(b.id, 9000); }), 'B still hears A');
      eq(a.phone.state().phase, 'connected', 'and the call goes on');
      await asP(a.phone.silence, { id: b.id, on: false });
      ok(await waitFor(async () => { speak(b.id, 6000); await sleep(40); return heard(a.id, 6000); }), 'A hears B again');
    } finally { await closeNode(a); await closeNode(b); }
  });

  t('people who leave or never answer drop out while the rest keep talking', async () => {
    const a = makeNode(); const b = makeNode(); const c = makeNode();
    try {
      await link(a, b); await link(a, c);
      await asP(a.phone.call, [b.id, c.id]);
      await ringing(b);
      await asP(b.phone.accept);
      ok(await waitFor(() => a.phone.state().phase === 'connected'), 'the call starts with the first answer');
      ok(await waitFor(() => (a.phone.state().peers.find(p => p.id === c.id) || {}).phase === 'gone', 4000), 'whoever does not answer drops out after the ringing time');
      ok(await waitFor(() => !c.phone.state()), 'and stops ringing');
      eq(a.phone.state().phase, 'connected', 'the call goes on');
      speak(a.id, 6500);
      ok(await waitFor(() => heard(b.id, 6500)), 'B still hears the caller');
      await asP(b.phone.end);
      ok(await waitFor(() => !a.phone.state()), 'when the last person leaves the call ends');
      eq(ended(a)[0].outcome, 'ended');
    } finally { await closeNode(a); await closeNode(b); await closeNode(c); }
  });

  t('a joint call nobody answers ends as no answer, and the size is limited', async () => {
    const a = makeNode(); const b = makeNode(); const c = makeNode();
    try {
      await link(a, b); await link(a, c);
      const many = Array.from({ length: phone.GROUP_MAX + 1 }, () => ssbKeys.generate().id);
      let refused = false;
      try { await asP(a.phone.call, many); } catch (_) { refused = true; }
      ok(refused && !a.phone.state(), `more than ${phone.GROUP_MAX} people is refused`);
      await asP(a.phone.call, [b.id, c.id]);
      await ringing(b);
      await asP(b.phone.reject);
      ok(await waitFor(() => !a.phone.state(), 4000), 'nobody answering ends the call');
      eq(ended(a)[0].outcome, 'noanswer');
    } finally { await closeNode(a); await closeNode(b); await closeNode(c); }
  });
});

describe('phone: numbers', (t) => {
  const numbers = require('../../../src/models/phone_number');
  const randomId = () => '@' + crypto.randomBytes(32).toString('base64') + '.ed25519';

  t('every Oasis ID has a stable six-digit number', () => {
    const id = randomId();
    const n = numbers.phoneNumberOf(id);
    ok(/^\d{3}-\d{3}$/.test(n), n);
    eq(numbers.phoneNumberOf(id), n, 'always the same for the same ID');
    eq(numbers.phoneNumberOf('not-an-id'), null);
  });

  t('numbers can be typed with or without separators', () => {
    eq(numbers.normalizeNumber('482913'), '482-913');
    eq(numbers.normalizeNumber('482 913'), '482-913');
    eq(numbers.normalizeNumber('482-913'), '482-913');
    eq(numbers.normalizeNumber('48291'), null);
    eq(numbers.normalizeNumber('@abc.ed25519'), null);
  });

  t('a number resolves only among known people, the ones you follow first', () => {
    const seen = new Map();
    let pair = null;
    while (!pair) {
      const id = randomId();
      const n = numbers.phoneNumberOf(id);
      if (seen.has(n)) pair = [seen.get(n), id]; else seen.set(n, id);
    }
    const number = numbers.phoneNumberOf(pair[0]);
    const known = new Map([[pair[1], 2], [pair[0], 1], [randomId(), 1]]);
    const found = numbers.resolveNumber(number, known);
    eq(found.length, 2, 'both people sharing the number are offered');
    eq(found[0].id, pair[0], 'someone you follow comes first');
    eq(numbers.resolveNumber(number, new Map()).length, 0, 'strangers are never found');
  });
});

describe('phone: answering from the desktop notification', (t) => {
  t('an incoming call can be answered or rejected from the notification itself', async () => {
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-notify-'));
    const argsFile = path.join(bin, 'args');
    fs.writeFileSync(path.join(bin, 'notify-send'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${argsFile}'\necho answer\n`, { mode: 0o755 });
    const oldPath = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
    try {
      const { notify } = require('../../../src/backend/desktopNotify');
      let chosen = null;
      ok(notify('Phone', 'someone is calling', `call:${crypto.randomBytes(8).toString('hex')}`, {
        timeoutMs: 10000,
        actions: [{ key: 'answer', label: 'Answer' }, { key: 'reject', label: 'Reject' }],
        onAction: (key) => { chosen = key; }
      }), 'the notification is shown');
      ok(await waitFor(() => chosen !== null, 3000), 'the click reaches Oasis');
      eq(chosen, 'answer', 'as the button that was pressed');
      const args = fs.readFileSync(argsFile, 'utf8').split('\n');
      ok(args.includes('answer=Answer') && args.includes('reject=Reject'), 'both buttons are offered');
      ok(args.includes('10000'), 'and it lasts as long as the ringing');
    } finally {
      process.env.PATH = oldPath;
      fs.rmSync(bin, { recursive: true, force: true });
    }
  });
});

describe('phone: room notices on the desktop', (t) => {
  t('what others do in your room reaches the desktop once, and only with the notices on', async () => {
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'oasis-notify-'));
    const log = path.join(bin, 'shown');
    fs.writeFileSync(path.join(bin, 'notify-send'), `#!/bin/sh\nfor a in "$@"; do last="$a"; done\nprintf '%s\\n' "$last" >> '${log}'\n`, { mode: 0o755 });
    const oldPath = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${oldPath}`;
    const sharedState = require('../../../src/configs/shared-state');
    try {
      const events = require('../../../src/server/node_modules/pull-pushable')();
      const me = ssbKeys.generate().id; const other = ssbKeys.generate().id;
      const model = require('../../../src/models/phone_model')({
        cooler: { open: async () => ({ id: me, phone: { events: () => events, state: (cb) => cb(null, null), roomState: (cb) => cb(null, null) } }) },
        pmModel: { listPams: async () => [] }, nameOf: async (id) => id === other ? 'Nadia' : '', isPublic: false
      });
      await model.state();
      const shown = () => { try { return fs.readFileSync(log, 'utf8').split('\n').filter(Boolean); } catch (_) { return []; } };
      const room = { rid: crypto.randomBytes(16).toString('hex'), joinedAt: Date.now() - 1000, notify: true, events: [] };
      const push = (patch) => { events.push({ type: 'room', room: { ...room, ...patch } }); return sleep(150); };
      const t0 = Date.now();
      const joined = { t: 'join', id: other, ts: t0 };
      await push({ events: [joined] });
      await push({ events: [joined] });
      eq(shown().length, 1, 'someone entering is shown once, however often the room is redrawn');
      ok(shown()[0].includes('@Nadia'), 'with the name of who did it');
      await push({ events: [joined, { t: 'recStart', id: me, ts: t0 + 1 }] });
      eq(shown().length, 1, 'what I do myself is not shown');
      const whileOff = { t: 'mute', id: other, ts: Date.now() };
      await push({ notify: false, events: [] });
      await push({ notify: true, events: [joined, whileOff] });
      eq(shown().length, 1, 'nothing from while the notices were off');
      await sleep(5);
      await push({ events: [joined, whileOff, { t: 'leave', id: other, ts: Date.now() }] });
      eq(shown().length, 2, 'and new things show again');
      await sleep(5);
      await push({ events: [joined, whileOff, { t: 'hand', id: other, ts: Date.now() }] });
      eq(shown().length, 3, 'a raised hand is shown too');
      ok(shown()[2].includes('@Nadia'), 'with who raised it');
    } finally {
      process.env.PATH = oldPath;
      sharedState.setPhoneRoom(null);
      fs.rmSync(bin, { recursive: true, force: true });
    }
  });
});

describe('phone: voice messages left for you', (t) => {
  const share = { key: 'k', manifestBlobId: '&m.sha256' };

  t('a received voicemail counts as pending until it is listened to', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('pm').sendPam(B.keypair.id, share, 7);
    B.setActor();
    const phoneB = B.use('phone');
    const pams = await phoneB.pams();
    eq(pams.length, 1, 'B sees the voicemail');
    eq(pams[0].from, A.keypair.id);
    eq(pams[0].heard, false, 'not listened to yet');
    eq(await phoneB.refreshCount(), 1, 'it is counted as pending');
    ok(await phoneB.pamCipher(pams[0].key), 'opening it hands back the audio');
    eq((await phoneB.pams())[0].heard, false, 'looking at it is not listening to it');
    eq(phoneB.markHeard(pams[0].key), true, 'playing it to the end marks it as listened');
    eq((await phoneB.pams())[0].heard, true);
    eq(await phoneB.refreshCount(), 0, 'so it is no longer pending');
    eq(phoneB.markHeard(pams[0].key), false, 'listening again changes nothing');
  });

  t('a voicemail whose audio has not arrived yet is shown as still downloading', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('pm').sendPam(B.keypair.id, share, 5);
    B.setActor();
    const asked = [];
    const phoneB = require('../../../src/models/phone_model')({
      cooler: { open: async () => ({ id: B.keypair.id }) }, pmModel: B.use('pm'), nameOf: async () => '', isPublic: false,
      isAvailable: async () => false, prefetch: async (s) => { asked.push(s.manifestBlobId); }
    });
    const pams = await phoneB.pams();
    eq(pams.length, 1, 'the message is listed');
    eq(pams[0].ready, false, 'but its audio is not ready');
    eq(asked.join(','), share.manifestBlobId, 'and the audio is requested from the network');
    const ready = require('../../../src/models/phone_model')({
      cooler: { open: async () => ({ id: B.keypair.id }) }, pmModel: B.use('pm'), nameOf: async () => '', isPublic: false,
      isAvailable: async () => true
    });
    eq((await ready.pams())[0].ready, true, 'once every piece is here it can be played');
  });

  t('your own voicemails are never pending for you', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('pm').sendPam(B.keypair.id, share, 3);
    eq((await A.use('phone').pams()).length, 0);
    eq(await A.use('phone').refreshCount(), 0);
  });
});
