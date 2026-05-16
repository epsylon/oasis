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

  t('B (other user) sees A pixel in canvas', async () => {
    const net = makeNetwork(); const A = makePeer(net); const B = makePeer(net); A.setActor();
    await A.use('pixelia').paintPixel(1, 1, '#ffffff');
    B.setActor();
    const canvas = await B.use('pixelia').listPixels();
    ok(Array.isArray(canvas));
    ok(canvas.length >= 1);
  });
});
