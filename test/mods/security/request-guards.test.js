const { eq, ok, notOk } = require('../../helpers/assert');
const guards = require('../../../src/backend/request_guards');

const KEY = '%' + 'A'.repeat(43) + '=.sha256';
const fakeCtx = ({ referer = null, host = 'localhost:3000', body = {}, query = {}, method = 'POST' } = {}) => {
  const ctx = { host, method, query, request: { body, header: {} }, redirected: null, thrown: null };
  if (referer !== null) ctx.request.header.referer = referer;
  ctx.redirect = (to) => { ctx.redirected = to; };
  return ctx;
};

describe('security: message keys coming from forms', (t) => {
  t('only well-formed message ids are accepted', () => {
    ok(guards.isMsgKey(KEY));
    notOk(guards.isMsgKey('%short.sha256'));
    notOk(guards.isMsgKey('@' + 'A'.repeat(43) + '=.ed25519'));
    notOk(guards.isMsgKey('../../etc/passwd'));
    notOk(guards.isMsgKey(KEY + '\n%x'));
    notOk(guards.isMsgKey(42));
  });

  t('a list of keys keeps only the valid ones, once each, whatever shape the form sent', () => {
    const bad = '%' + 'B'.repeat(10) + '.sha256';
    eq(guards.pickMsgKeys([KEY, bad, KEY, 7, null]).join(), KEY);
    eq(guards.pickMsgKeys(KEY).join(), KEY);
    eq(guards.pickMsgKeys(undefined).length, 0);
    eq(guards.pickMsgKeys({ a: 1 }).length, 0);
  });
});

describe('security: redirects never leave the node', (t) => {
  t('returnTo only follows the allowed local prefixes', () => {
    eq(guards.safeReturnTo(fakeCtx({ body: { returnTo: '/inbox?filter=all' } }), '/', ['/inbox']), '/inbox?filter=all');
    eq(guards.safeReturnTo(fakeCtx({ body: { returnTo: '/settings' } }), '/', ['/inbox']), '/');
    eq(guards.safeReturnTo(fakeCtx({ query: { returnTo: '/blogs/x' } }), '/', ['/blogs']), '/blogs/x');
  });

  t('an absolute or protocol-relative returnTo is dropped even when "/" is allowed', () => {
    for (const evil of ['https://evil.example/', '//evil.example/', '/\\evil.example', 'javascript:alert(1)', '/ok\r\nLocation: https://evil.example', '']) {
      eq(guards.safeReturnTo(fakeCtx({ body: { returnTo: evil } }), '/activity', ['/']), '/activity', `rejected: ${JSON.stringify(evil)}`);
    }
  });

  t('a referer from this host is followed, anything else falls back', () => {
    const same = fakeCtx({ referer: 'http://localhost:3000/inbox?filter=notifications#x' });
    guards.safeRefererRedirect(same, '/inbox');
    eq(same.redirected, '/inbox?filter=notifications#x');

    for (const referer of ['http://evil.example/inbox', 'ftp://localhost:3000/inbox', 'not a url', 'http://localhost:3001/inbox']) {
      const c = fakeCtx({ referer });
      guards.safeRefererRedirect(c, '/fallback');
      eq(c.redirected, '/fallback', `fell back for ${referer}`);
    }
    const none = fakeCtx();
    guards.safeRefererRedirect(none, '/fallback');
    eq(none.redirected, '/fallback');
  });
});

describe('security: which requests the HTTP layer trusts', (t) => {
  const hosts = ['localhost', '127.0.0.1'];
  const req = ({ method = 'POST', hostname = 'localhost', referer, url = '/inbox' } = {}) => ({ method, hostname, url, header: referer === undefined ? {} : { referer } });

  t('a GET from a valid host is trusted, from an unknown host it is not', () => {
    ok(guards.isTrustedRequest(req({ method: 'GET' }), hosts));
    notOk(guards.isTrustedRequest(req({ method: 'GET', hostname: 'evil.example' }), hosts));
  });

  t('a POST needs a referer from this node that is not a blob (CSRF)', () => {
    ok(guards.isTrustedRequest(req({ referer: 'http://localhost:3000/inbox' }), hosts));
    notOk(guards.isTrustedRequest(req(), hosts), 'no referer');
    notOk(guards.isTrustedRequest(req({ referer: 'http://evil.example/' }), hosts), 'foreign referer');
    notOk(guards.isTrustedRequest(req({ referer: 'http://localhost:3000/blob/%abc' }), hosts), 'blob referer');
    notOk(guards.isTrustedRequest(req({ referer: 'garbage' }), hosts), 'unparsable referer');
  });

  t('the clearnet HUB is read-only for everyone', () => {
    ok(guards.isTrustedRequest(req({ method: 'GET', hostname: 'pub.example', url: '/c/blog/x' }), hosts));
    notOk(guards.isTrustedRequest(req({ method: 'POST', hostname: 'pub.example', url: '/c/blog/x', referer: 'http://pub.example/c' }), hosts));
    ok(guards.isClearnetPath({ url: '/c' }) && guards.isClearnetPath({ url: '/c?type=blog' }));
    notOk(guards.isClearnetPath({ url: '/chats' }));
  });

  t('in public mode every non-GET is blocked before reaching a route', async () => {
    const blocked = [];
    const guard = guards.publicModeGuard({ isPublic: true, onBlocked: (ctx) => blocked.push(ctx.method) });
    let reached = 0;
    await guard({ method: 'POST' }, async () => { reached++; });
    await guard({ method: 'DELETE' }, async () => { reached++; });
    await guard({ method: 'GET' }, async () => { reached++; });
    eq(blocked.join(), 'POST,DELETE');
    eq(reached, 1);

    const open = guards.publicModeGuard({ isPublic: false, onBlocked: () => { throw new Error('must not block'); } });
    await open({ method: 'POST' }, async () => { reached++; });
    eq(reached, 2);
  });

  t('the content security policy forbids scripts on the HUB and framing everywhere', () => {
    const hub = guards.buildCsp(true);
    const app = guards.buildCsp(false);
    ok(hub.includes("script-src 'none'"), 'no scripts on the HUB');
    ok(app.includes("frame-ancestors 'none'") && hub.includes("frame-ancestors 'none'"), 'never framed by others');
    ok(app.includes("object-src 'none'") && app.includes("base-uri 'none'"), 'no plugins, no base hijack');
    ok(app.includes("form-action 'self'"), 'forms only post to this node');
  });
});
