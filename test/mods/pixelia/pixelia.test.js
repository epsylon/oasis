const { eq, ok } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

describe('pixelia: paint pixel', (t) => {
  t('A paints a pixel', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('pixelia').paintPixel(10, 20, '#ff0000');
    const canvas = await A.use('pixelia').listPixels();
    ok(canvas.length >= 1);
  });

  t('A repaints pixel (replaces previous)', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    await A.use('pixelia').paintPixel(5, 5, '#00ff00');
    await A.use('pixelia').paintPixel(5, 5, '#0000ff');
    const canvas = await A.use('pixelia').listPixels();
    ok(Array.isArray(canvas));
    const greens = canvas.filter(p => p.color === '#00ff00');
    eq(greens.length, 0, 'old color tombstoned');
  });

  t('B repaints A pixel: one pixel with the latest colour, both contributors counted once', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('pixelia').paintPixel(7, 8, '#ff0000');
    B.setActor();
    await B.use('pixelia').paintPixel(7, 8, '#0000ff');
    for (const P of [A, B]) {
      P.setActor();
      const at = (await P.use('pixelia').listPixels()).filter(p => p.x === 7 && p.y === 8);
      eq(at.length, 1, 'one pixel per coordinate');
      eq(at[0].color, '#0000ff', 'the repaint wins');
      eq(at[0].author, B.keypair.id);
      eq(at[0].contributors_inhabitants.length, 2);
      ok(at[0].contributors_inhabitants.includes(A.keypair.id) && at[0].contributors_inhabitants.includes(B.keypair.id));
    }
    A.setActor();
    await A.use('pixelia').paintPixel(7, 8, '#00ff00');
    await A.use('pixelia').paintPixel(7, 8, '#ffbb00');
    const canvas = await A.use('pixelia').listPixels();
    eq(canvas.length, 1, 'repaints never add pixels');
    eq(canvas[0].color, '#ffbb00');
    eq(canvas[0].contributors_inhabitants.length, 2, 'no contributor counted twice');
  });

  t('a paint that did not see the current pixel does not leave two pixels at one coordinate', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('pixelia').paintPixel(3, 3, '#ff0000');
    const ssbB = await B.cooler.open();
    await new Promise((res, rej) => ssbB.publish({ type: 'pixelia', x: 2, y: 2, color: '#0000ff', author: B.keypair.id, contributors_inhabitants: [B.keypair.id], timestamp: Date.now(), coordinateKey: '3:3', replaces: null }, (e) => e ? rej(e) : res()));
    const canvas = await A.use('pixelia').listPixels();
    eq(canvas.filter(p => p.x === 3 && p.y === 3).length, 1);
    B.setActor();
    await B.use('pixelia').paintPixel(3, 3, '#ffffff');
    A.setActor();
    const after = await A.use('pixelia').listPixels();
    eq(after.length, 1);
    eq(after[0].color, '#ffffff');
  });

  t('a paint without a valid colour or with fractional coordinates is refused and never shown', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    let refused = 0;
    for (const args of [[4, 4, undefined], [4, 4, 'red'], [4.5, 4, '#ff0000']]) {
      try { await A.use('pixelia').paintPixel(...args); } catch (_) { refused++; }
    }
    eq(refused, 3);
    const ssbB = await B.cooler.open();
    await new Promise((res, rej) => ssbB.publish({ type: 'pixelia', x: 3, y: 3, author: B.keypair.id, timestamp: Date.now(), coordinateKey: '4:4', replaces: null }, (e) => e ? rej(e) : res()));
    eq((await A.use('pixelia').listPixels()).length, 0);
  });

  t('repainting another inhabitant\'s pixel publishes no deletion of it', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net);
    A.setActor();
    await A.use('pixelia').paintPixel(6, 6, '#ff0000');
    B.setActor();
    await B.use('pixelia').paintPixel(6, 6, '#0000ff');
    ok(!net.log.some(m => m.value.author === B.keypair.id && m.value.content.type === 'tombstone'));
  });

  t('B (other user) sees A pixel in canvas', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    await A.use('pixelia').paintPixel(1, 1, '#ffffff');
    B.setActor();
    const canvas = await B.use('pixelia').listPixels();
    ok(Array.isArray(canvas));
    ok(canvas.length >= 1);
  });
});
