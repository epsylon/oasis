const path = require("path");
const Koa = require(path.join(__dirname, "../server/node_modules/koa"));
const koaStatic = require(path.join(__dirname, "../server/node_modules/koa-static"));
const { join } = require("path");
const mount = require(path.join(__dirname, "../server/node_modules/koa-mount"));

module.exports = ({ host, port, middleware, allowHost }) => {
  const assets = new Koa()
  assets.use(koaStatic(join(__dirname, "..", "client", "assets")));
  
  const app = new Koa();
  const validHosts = [];

  const isValidRequest = (request) => {
    if (validHosts.includes(request.hostname) !== true) {
      console.log(`Invalid HTTP hostname: ${request.hostname}`);
      return false;
    }

    if (request.method !== "GET") {
      if (request.header.referer == null) {
        console.log("No referer");
        return false;
      }

      try {
        const refererUrl = new URL(request.header.referer);
        if (validHosts.includes(refererUrl.hostname) !== true) {
          console.log(`Invalid referer hostname: ${refererUrl.hostname}`);
          return false;
        }

        if (refererUrl.pathname.startsWith("/blob/")) {
          console.log(`Invalid referer path: ${refererUrl.pathname}`);
          return false;
        }
      } catch (e) {
        console.log(`Invalid referer URL: ${request.header.referer}`);
        return false;
      }
    }

    return true;
  };

  app.on("error", (err, ctx) => {
    console.error(err);

    if (isValidRequest(ctx.request)) {
      err.message = err.stack;
      err.expose = true;
    }

    return null;
  });

  app.use(mount("/assets", assets));

  app.use(async (ctx, next) => {
  
    //console.log("Requesting:", ctx.path); // uncomment to check for HTTP requests
    
    const csp = [
      "default-src 'none'",
      "img-src 'self'",
      "form-action 'self'",
      "media-src 'self'",
      "style-src 'self'",
    ].join("; ");

    ctx.set("Content-Security-Policy", csp);
    ctx.set("X-Frame-Options", "SAMEORIGIN");

    const isBlobPath = ctx.path.startsWith("/blob/");

    if (isBlobPath === false) {
      ctx.set("X-Content-Type-Options", "nosniff");
    }

    ctx.set("Referrer-Policy", "same-origin");
    ctx.set("Feature-Policy", "speaker 'self'");

    const validHostsString = validHosts.join(" or ");

    ctx.assert(
      isValidRequest(ctx.request),
      400,
      `Request must be addressed to ${validHostsString} and non-GET requests must contain non-blob referer.`
    );

    await next();
  });

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
  });

  return server;
};

