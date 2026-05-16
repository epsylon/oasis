const { eq, ok } = require('../../helpers/assert');
const QRCode = require('../../../src/server/node_modules/qrcode');

describe('profile: QR code generation', (t) => {
  t('QRCode.toDataURL produces a base64 PNG data URL for an SSB feedId', async () => {
    const feedId = '@AbCdEfGhIjKlMnOpQrStUvWxYz1234567890+/=.ed25519';
    const dataUrl = await QRCode.toDataURL(feedId, { type: 'image/png', width: 240, margin: 1 });
    ok(typeof dataUrl === 'string');
    ok(dataUrl.startsWith('data:image/png;base64,'), 'PNG data URL prefix');
    const b64 = dataUrl.slice('data:image/png;base64,'.length);
    ok(b64.length > 100, 'non-trivial payload');
  });

  t('QR data URLs are deterministic for the same input', async () => {
    const feedId = '@deterministicFeedId.ed25519';
    const a = await QRCode.toDataURL(feedId, { type: 'image/png', width: 240, margin: 1 });
    const b = await QRCode.toDataURL(feedId, { type: 'image/png', width: 240, margin: 1 });
    eq(a, b);
  });

  t('QR data URLs differ for different inputs', async () => {
    const a = await QRCode.toDataURL('@feed-A.ed25519', { type: 'image/png', width: 240, margin: 1 });
    const b = await QRCode.toDataURL('@feed-B.ed25519', { type: 'image/png', width: 240, margin: 1 });
    ok(a !== b);
  });

  t('toDataURL with empty string rejects (handled by authorView try/catch)', async () => {
    let threw = false;
    try { await QRCode.toDataURL('', { type: 'image/png', width: 240, margin: 1 }); } catch (_) { threw = true; }
    ok(threw, 'empty input rejects — authorView wraps the call in try/catch and falls back to no QR');
  });
});
