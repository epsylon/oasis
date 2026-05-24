const { eq, ok, notOk } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

function makeSilentWav(numSamples = 4096) {
  const sampleRate = 22050;
  const dataLen = numSamples * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < numSamples; i += 1) {
    buf.writeInt16LE(((Math.sin(i / 50) * 2000) | 0), 44 + i * 2);
  }
  return buf;
}

describe('melody: steganography embed/extract round-trip', (t) => {
  t('extracts the same ascii message that was embedded', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const mm = A.use('melody');
    const wav = makeSilentWav();
    const message = 'hello blockchain sounds';
    const encoded = mm.embedTextInWav(wav, message);
    const decoded = mm.extractTextFromWav(encoded);
    eq(decoded, message);
  });

  t('extracts a multi-line UTF-8 message with non-ascii characters', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const mm = A.use('melody');
    const wav = makeSilentWav(32768);
    const message = 'línea 1\nlínea 2 — ñ — 中文 🎵';
    const encoded = mm.embedTextInWav(wav, message);
    const decoded = mm.extractTextFromWav(encoded);
    eq(decoded, message);
  });

  t('extracts a JSON payload identical to what was embedded', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const mm = A.use('melody');
    const wav = makeSilentWav(65536);
    const payload = { id: '@feedid.ed25519', ts: 1747512345678, msg: 'embedded text' };
    const encoded = mm.embedTextInWav(wav, JSON.stringify(payload));
    const decoded = mm.extractTextFromWav(encoded);
    ok(decoded);
    const parsed = JSON.parse(decoded);
    eq(parsed.id, payload.id);
    eq(parsed.ts, payload.ts);
    eq(parsed.msg, payload.msg);
  });

  t('preserves the WAV RIFF header bytes after embedding', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const mm = A.use('melody');
    const wav = makeSilentWav();
    const encoded = mm.embedTextInWav(wav, 'data');
    eq(encoded.slice(0, 4).toString('ascii'), 'RIFF');
    eq(encoded.slice(8, 12).toString('ascii'), 'WAVE');
    eq(encoded.slice(12, 16).toString('ascii'), 'fmt ');
    eq(encoded.slice(36, 40).toString('ascii'), 'data');
    eq(encoded.length, wav.length);
  });

  t('only the LSB of samples is modified; >99% of bits unchanged', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const mm = A.use('melody');
    const wav = makeSilentWav();
    const encoded = mm.embedTextInWav(wav, 'small');
    let diffBits = 0;
    let diffNonLsb = 0;
    for (let off = 44; off < wav.length; off += 2) {
      const a = wav.readInt16LE(off);
      const b = encoded.readInt16LE(off);
      if (a !== b) {
        diffBits += 1;
        if ((a & ~1) !== (b & ~1)) diffNonLsb += 1;
      }
    }
    eq(diffNonLsb, 0);
    ok(diffBits >= 1);
  });

  t('extractTextFromWav returns null when no payload was embedded', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const mm = A.use('melody');
    const wav = makeSilentWav();
    const decoded = mm.extractTextFromWav(wav);
    eq(decoded, null);
  });

  t('extractTextFromWav returns null for a non-WAV buffer', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const mm = A.use('melody');
    const bogus = Buffer.alloc(2048, 0xAA);
    const decoded = mm.extractTextFromWav(bogus);
    eq(decoded, null);
  });

  t('embedTextInWav returns input unchanged for empty message', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const mm = A.use('melody');
    const wav = makeSilentWav();
    const encoded = mm.embedTextInWav(wav, '');
    eq(encoded.length, wav.length);
    eq(encoded.equals(wav), true);
  });

  t('embedTextInWav returns input unchanged when payload exceeds 4096 bytes', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const mm = A.use('melody');
    const wav = makeSilentWav(200000);
    const big = 'x'.repeat(5000);
    const encoded = mm.embedTextInWav(wav, big);
    eq(encoded.equals(wav), true);
  });
});

describe('melody: blockchain-to-note mapping', (t) => {
  t('exports note + octave tables', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    const mm = A.use('melody');
    eq(mm.NOTE_NAMES.length, 12);
    eq(mm.OCTAVES.length, 3);
    ok(mm.TYPE_TO_DEGREE.post != null);
  });

  t('getUserMelody returns a sequence of notes for a user with published content', async () => {
    const net = makeNetwork();
    const A = makePeer(net); A.setActor();
    await A.use('audios').createAudio('[a](&blob0000000000000000000000000000000000000000000.sha256)', [], 'X', '', '');
    await A.use('audios').createAudio('[b](&blob0000000000000000000000000000000000000000000.sha256)', [], 'Y', '', '');
    const m = await A.use('melody').getUserMelody(A.keypair.id);
    eq(m.feedId, A.keypair.id);
    ok(m.total >= 2);
    ok(Array.isArray(m.sequence));
    for (const n of m.sequence) {
      ok(typeof n.name === 'string');
      ok(typeof n.type === 'string');
      ok(typeof n.freq === 'number');
      ok(typeof n.durMs === 'number');
      ok(typeof n.id === 'string');
    }
  });
});
