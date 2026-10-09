const path = require("path");
const os = require("os");
const Koa = require(path.join(__dirname, "../server/node_modules/koa"));
const koaStatic = require(path.join(__dirname, "../server/node_modules/koa-static"));
const { join } = require("path");
const mount = require(path.join(__dirname, "../server/node_modules/koa-mount"));

function obfuscateClearnetHtml(html) {
  if (typeof html !== 'string' || html.length === 0) return html;
  const preserve = [];
  const tag = require('crypto').randomBytes(12).toString('hex');
  const stash = (re) => {
    html = html.replace(re, (m) => {
      preserve.push(m);
      return `\u0001${tag}:${preserve.length - 1}\u0001`;
    });
  };
  stash(/<pre[\s\S]*?<\/pre>/gi);
  stash(/<textarea[\s\S]*?<\/textarea>/gi);
  stash(/<style[\s\S]*?<\/style>/gi);
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/>[ \t]*[\r\n][\s]*</g, '><');
  html = html.replace(/[ \t]{2,}/g, ' ');
  html = html.replace(/[\r\n]+/g, '');
  html = html.replace(new RegExp(`\\u0001${tag}:(\\d+)\\u0001`, 'g'), (_, i) => preserve[Number(i)] || '');
  return html;
}

const collectLocalIPs = () => {
  const out = [];
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const info of (ifaces[name] || [])) {
        if (info && !info.internal && (info.family === 'IPv4' || info.family === 4)) {
          out.push(info.address);
        }
      }
    }
  } catch (_) {}
  return out;
};

module.exports = ({ host, port, middleware, allowHost }) => {
  const assets = new Koa()
  assets.use(async (ctx, next) => {
    ctx.set("Cache-Control", ctx.query && ctx.query.v ? "public, max-age=31536000, immutable" : "public, max-age=3600");
    await next();
  });
  assets.use(koaStatic(join(__dirname, "..", "client", "assets")));

  const app = new Koa();
  const validHosts = [];

  const { isClearnetPath, isTrustedRequest, buildCsp } = require(path.join(__dirname, "..", "backend", "request_guards"));
  const isValidRequest = (request) => isTrustedRequest(request, validHosts);

  const httpDebug = process.argv.includes('--debug') || process.env.OASIS_DEBUG === '1' || process.env.OASIS_DEBUG === 'true';

   app.on("error", (err, ctx) => {
    if (err && (err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
      return;
    }
    if (err && (err.name === 'BadRequestError' || err.status === 400)) {
      if (httpDebug) console.error(`[400] ${err.message}`);
      return null;
    }
    console.error(err);
    if (ctx && isValidRequest(ctx.request)) {
      err.message = err.message || 'Internal server error';
      err.expose = true;
    }
    return null;
  });

  app.use(mount("/assets", assets));
  app.use(mount("/c/assets", assets));

  const mapTiles = new Koa();
  mapTiles.use(koaStatic(join(__dirname, "..", "maps", "tiles"), { maxage: 30 * 24 * 60 * 60 * 1000, immutable: true }));
  app.use(mount("/maptiles", mapTiles));
  app.use(mount("/c/maptiles", mapTiles));

  const gamesStatic = new Koa();
  gamesStatic.use(async (ctx, next) => {
    ctx.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob: mediastream:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'");
    ctx.set("X-Content-Type-Options", "nosniff");
    ctx.set("X-Frame-Options", "SAMEORIGIN");
    ctx.set("Referrer-Policy", "same-origin");
    await next();
  });
  gamesStatic.use(koaStatic(join(__dirname, "..", "games")));
  app.use(mount("/game-assets", gamesStatic));

  app.use(mount("/js", koaStatic(path.join(__dirname, 'public/js'))));
  app.use(koaStatic(path.join(__dirname, 'public')));

  app.use(async (ctx, next) => {

    if (httpDebug) console.log(`[http] ${ctx.method} ${ctx.path}`);
    
    const isClearnet = isClearnetPath(ctx.request);
    ctx.set("Content-Security-Policy", buildCsp(isClearnet, { frames: ctx.method === "GET" && /^\/games\/[a-z0-9]+\/?$/.test(ctx.path) }));
    ctx.set("X-Frame-Options", "SAMEORIGIN");

    ctx.set("X-Content-Type-Options", "nosniff");

    ctx.set("Referrer-Policy", "same-origin");
    ctx.set("Permissions-Policy", "speaker=(self)");

    ctx.assert(
      isValidRequest(ctx.request),
      400,
      "Request must be addressed to this node and non-GET requests must come from its own pages."
    );

    await next();

    if (isClearnet && typeof ctx.body === 'string') {
      const type = String(ctx.response.type || ctx.response.get('Content-Type') || '').toLowerCase();
      if (type.includes('html')) {
        ctx.body = obfuscateClearnetHtml(ctx.body);
      }
    }
  });
  
  middleware.forEach((m) => app.use(m));

  const server = require("http").createServer({ maxHeaderSize: 256 * 1024 }, app.callback()).listen({ host, port });


  server.on("listening", () => {
    const address = server.address();

    if (typeof address === "string") {
      throw new Error("HTTP server should never bind to Unix socket");
    }

    if (allowHost !== null) {
      validHosts.push(allowHost);
    }

    validHosts.push(address.address);

    if (validHosts.includes(host) === false) {
      validHosts.push(host);
    }

    for (const ip of collectLocalIPs()) {
      if (validHosts.includes(ip) === false) validHosts.push(ip);
    }

    for (const loopback of ['localhost', '127.0.0.1']) {
      if (validHosts.includes(loopback) === false) validHosts.push(loopback);
    }
  });

  return server;
};

