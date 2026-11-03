const fs = require('fs');
const path = require('path');
const { eq, ok, notOk, deepEq } = require('../../helpers/assert');
const { makeNetwork, makePeer } = require('../../helpers/setup');

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const seqOf = (n) => Array.from({ length: n }, (_, i) => ({ id: '%' + String(i).padStart(43, 'x') + '=.sha256', type: 'post', name: NAMES[i % 12] + (3 + (i % 3)), durMs: 200 + i }));

describe('melody: note colours and the image of the blockchain', (t) => {
  t('the image is a strip as tall as the player and keeps the hidden message', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const mm = A.use('melody');
    const sharp = require('../../../src/server/node_modules/sharp');
    const msg = JSON.stringify({ id: '@me', ts: 1, msg: 'hola ñ 🌴' });
    const png = await mm.melodyImagePng(seqOf(40), msg);
    const meta = await sharp(png).metadata();
    eq(meta.format, 'png');
    eq(meta.width, 1080);
    eq(meta.height, 54);
    eq(await mm.extractTextFromImage(png), msg);
    eq(await mm.extractTextFromImage(await mm.melodyImagePng(seqOf(40))), null);
  });

  t('Colours counts the different notes', () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const mm = A.use('melody');
    eq(mm.colourCount(seqOf(40)), 12);
    eq(mm.colourCount([{ name: 'C4' }, { name: 'C4' }, { name: 'D4' }]), 2);
  });

  t('a published blockchain image is a BCS image with its composition', async () => {
    const net = makeNetwork(); const A = makePeer(net); A.setActor();
    const images = A.use('images');
    const blob = '&' + 'b'.repeat(43) + '=.sha256';
    await images.createBcsImage(blob, `BCS-${A.keypair.id}`, '', seqOf(5));
    const list = await images.listAll({ filter: 'bcs', viewerId: A.keypair.id });
    eq(list.length, 1);
    ok(list[0].isBcs);
    eq(list[0].bcsComposition.length, 5);
    eq(list[0].bcsComposition[0].n, 'C3');
  });

});
