const MSG_KEY_RE = /^%[A-Za-z0-9+/]{43}=\.sha256$/;

const isMsgKey = (value) => typeof value === 'string' && MSG_KEY_RE.test(value);

const pickMsgKeys = (value) => {
  const list = Array.isArray(value) ? value : (value == null ? [] : [value]);
  return Array.from(new Set(list.filter(isMsgKey)));
};

const isLocalPath = (value) => {
  if (typeof value !== 'string' || !value.startsWith('/')) return false;
  if (value.startsWith('//') || value.startsWith('/\\')) return false;
  if (/[\r\n\0]/.test(value)) return false;
  return true;
};

const safeReturnTo = (ctx, fallback, allowedPrefixes) => {
  const rt = ctx?.request?.body?.returnTo || ctx?.query?.returnTo;
  if (!isLocalPath(rt)) return fallback;
  return Array.isArray(allowedPrefixes) && allowedPrefixes.some(p => rt.startsWith(p)) ? rt : fallback;
};

const refererPath = (referer, host) => {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.host !== host) return null;
    const target = u.pathname + u.search + u.hash;
    return isLocalPath(target) ? target : null;
  } catch (_) {
    return null;
  }
};

const safeRefererRedirect = (ctx, fallback = '/') => {
  const target = refererPath(ctx.request.header.referer, ctx.host);
  ctx.redirect(target || fallback);
};

const isClearnetPath = (request) => {
  const url = String((request && request.url) || '');
  return url === '/c' || url.startsWith('/c/') || url.startsWith('/c?');
};

const isTrustedRequest = (request, validHosts) => {
  if (isClearnetPath(request)) return request.method === 'GET';
  if (!Array.isArray(validHosts) || !validHosts.includes(request.hostname)) return false;
  if (request.method === 'GET') return true;
  const referer = request.header && request.header.referer;
  if (referer == null) return false;
  try {
    const u = new URL(referer);
    if (!validHosts.includes(u.hostname)) return false;
    if (u.pathname.startsWith('/blob/')) return false;
  } catch (_) {
    return false;
  }
  return true;
};

const publicModeGuard = ({ isPublic, onBlocked }) => async (ctx, next) => {
  if (isPublic && ctx.method !== 'GET') { onBlocked(ctx); return; }
  await next();
};

const buildCsp = (isClearnet) => (isClearnet
  ? [
      "default-src 'self'",
      "script-src 'none'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "media-src 'self' blob:",
      "connect-src 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'"
    ]
  : [
      "default-src 'self'",
      "script-src 'self' http://localhost:3000/js",
      "style-src 'self'",
      "img-src 'self'",
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "frame-src 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'"
    ]).join('; ');

module.exports = { isMsgKey, pickMsgKeys, isLocalPath, safeReturnTo, refererPath, safeRefererRedirect, isClearnetPath, isTrustedRequest, publicModeGuard, buildCsp };
