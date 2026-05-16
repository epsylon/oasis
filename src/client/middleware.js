const path = require("path");
const os = require("os");
const Koa = require(path.join(__dirname, "../server/node_modules/koa"));
const koaStatic = require(path.join(__dirname, "../server/node_modules/koa-static"));
const { join } = require("path");
const mount = require(path.join(__dirname, "../server/node_modules/koa-mount"));

function obfuscateClearnetHtml(html) {
  if (typeof html !== 'string' || html.length === 0) return html;
  const preserve = [];
  const stash = (re) => {
    html = html.replace(re, (m) => {
      preserve.push(m);
      return `${preserve.length - 1}`;
    });
  };
  stash(/<pre[\s\S]*?<\/pre>/gi);
  stash(/<textarea[\s\S]*?<\/textarea>/gi);
  stash(/<style[\s\S]*?<\/style>/gi);
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  html = html.replace(/>[\s\n\r\t]+</g, '><');
  html = html.replace(/[ \t]{2,}/g, ' ');
  html = html.replace(/[\r\n]+/g, '');
  html = html.replace(/(\d+)/g, (_, i) => preserve[Number(i)] || '');
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
  assets.use(koaStatic(join(__dirname, "..", "client", "assets")));

  const app = new Koa();
  const validHosts = [];

  const isClearnetPath = (request) => {
    const url = String(request.url || '');
    return url === '/c' || url.startsWith('/c/') || url.startsWith('/c?');
  };

  const isValidRequest = (request) => {
    if (isClearnetPath(request)) return request.method === 'GET';
    if (validHosts.includes(request.hostname) !== true) {
      return false;
    }
    if (request.method !== "GET") {
      if (request.header.referer == null) {
        return false;
      }

      try {
        const refererUrl = new URL(request.header.referer);
        if (validHosts.includes(refererUrl.hostname) !== true) {
          return false;
        }

        if (refererUrl.pathname.startsWith("/blob/")) {
          return false;
        }
      } catch (e) {
        return false;
      }
    }

    return true;
  };

   app.on("error", (err, ctx) => {
    if (err && (err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
      return;
    }
    if (err && (err.name === 'BadRequestError' || err.status === 400)) {
      console.error(`[400] ${err.message}`);
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

  const maptiles = new Koa();
  maptiles.use(koaStatic(join(__dirname, "..", "maps", "tiles")));
  app.use(mount("/maptiles", maptiles));

  const mapcache = new Koa();
  mapcache.use(koaStatic(join(__dirname, "..", "maps", "cache")));
  app.use(mount("/mapcache", mapcache));


  const gamesStatic = new Koa();
  gamesStatic.use(koaStatic(join(__dirname, "..", "games")));
  app.use(mount("/game-assets", gamesStatic));

  app.use(mount("/js", koaStatic(path.join(__dirname, 'public/js'))));
  app.use(koaStatic(path.join(__dirname, 'public')));

  app.use(async (ctx, next) => {
  
    //console.log("Requesting:", ctx.path); // uncomment to check for HTTP requests
    
    const isClearnet = isClearnetPath(ctx.request);
    const csp = isClearnet
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
        ].join("; ")
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
        ].join("; ");

    ctx.set("Content-Security-Policy", csp);
    ctx.set("X-Frame-Options", "SAMEORIGIN");

    ctx.set("X-Content-Type-Options", "nosniff");

    ctx.set("Referrer-Policy", "same-origin");
    ctx.set("Permissions-Policy", "speaker=(self)");

    const validHostsString = validHosts.join(" or ");

    ctx.assert(
      isValidRequest(ctx.request),
      400,
      `Request must be addressed to ${validHostsString} and non-GET requests must contain non-blob referer.`
    );

    await next();

    if (isClearnet && typeof ctx.body === 'string') {
      const type = String(ctx.response.type || ctx.response.get('Content-Type') || '').toLowerCase();
      if (type.includes('html')) {
        ctx.body = obfuscateClearnetHtml(ctx.body);
      }
    }
  });
  
  // pdf viewer
  const pdfjsPath = path.join(__dirname, '../server/node_modules/pdfjs-dist/build/pdf.min.js');
  app.use(koaStatic(pdfjsPath));

  middleware.forEach((m) => app.use(m));

  const server = app.listen({ host, port });

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

