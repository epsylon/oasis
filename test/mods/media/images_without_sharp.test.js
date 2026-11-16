const path = require('path');
const { spawnSync } = require('child_process');
const { eq, ok } = require('../../helpers/assert');

const LOADER = path.resolve(__dirname, '../../../src/server/sharp_loader');
const SETUP = path.resolve(__dirname, '../../helpers/setup');

const runWith = (mode, body) => {
  const res = spawnSync(process.execPath, ['-e', `
    const loader = require(${JSON.stringify(LOADER)});
    (async () => { ${body} })().then((out) => { process.stdout.write(JSON.stringify(out)); process.exit(0); }, (e) => { process.stdout.write(JSON.stringify({ error: String(e && e.message) })); process.exit(1); });
  `], { env: { ...process.env, OASIS_SHARP: mode }, encoding: 'utf8', timeout: 60000 });
  return JSON.parse(res.stdout || '{}');
};

const sample = (w, h, c) => Buffer.from(Array.from({ length: w * h * c }, (_, i) => (i * 37 + 11) & 255));

describe('images: when the native sharp cannot run', (t) => {
  t('the WebAssembly build gives the same images as the native one', () => {
    const body = `
      const sharp = loader.getSharp();
      const img = sharp({ create: { width: 40, height: 30, channels: 3, background: '#336699' } });
      const bufs = await Promise.all([img.clone().resize(10, 10).png().toBuffer(), img.clone().rotate(90).png().toBuffer()]);
      return { mode: loader.sharpMode(), out: bufs.map((b) => b.toString('base64')) };`;
    const native = runWith('native', body);
    const wasm = runWith('wasm', body);
    eq(native.mode, 'native');
    eq(wasm.mode, 'wasm');
    eq(wasm.out.join(','), native.out.join(','));
  });

  t('without any sharp, raw pixels still become a PNG that sharp reads back exactly, in any rotation', async () => {
    const loader = require(LOADER);
    const sharp = loader.getSharp();
    for (const channels of [3, 4]) {
      const data = sample(7, 5, channels);
      const png = loader.encodePng({ data, width: 7, height: 5, channels });
      const back = await sharp(png).raw().toBuffer({ resolveWithObject: true });
      ok(back.data.equals(data) && back.info.channels === channels, `${channels} channels`);
      const decoded = loader.decodePng(await sharp(data, { raw: { width: 7, height: 5, channels } }).png({ adaptiveFiltering: true }).toBuffer());
      ok(decoded.data.equals(data), `a filtered PNG with ${channels} channels decodes exactly`);
      for (const deg of [90, 180, 270]) {
        const mine = loader.rotateRaw({ data, width: 7, height: 5, channels }, deg);
        const theirs = await sharp(data, { raw: { width: 7, height: 5, channels } }).rotate(deg).raw().toBuffer({ resolveWithObject: true });
        ok(mine.data.equals(theirs.data) && mine.width === theirs.info.width, `${deg}°`);
      }
    }
  });

  t('without any sharp, the melody image is still made and keeps its hidden message', () => {
    const out = runWith('off', `
      const { makeNetwork, makePeer } = require(${JSON.stringify(SETUP)});
      const A = makePeer(makeNetwork()); A.setActor();
      const mm = A.use('melody');
      const seq = Array.from({ length: 30 }, (_, i) => ({ id: '%' + String(i).padStart(43, 'x') + '=.sha256', type: 'post', name: 'C' + (3 + (i % 3)), durMs: 200 + i }));
      const png = await mm.melodyImagePng(seq, 'hola ñ');
      return { sharp: loader.getSharp() === null, signature: png.subarray(1, 4).toString('ascii'), text: await mm.extractTextFromImage(png) };`);
    ok(out.sharp, 'sharp is off');
    eq(out.signature, 'PNG');
    eq(out.text, 'hola ñ');
  });
});
