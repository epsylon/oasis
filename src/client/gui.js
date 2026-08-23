const path = require('path');
const fs = require('fs');
const os = require('os');
const debug = require('../server/node_modules/debug')('oasis');
const lodash = require('../server/node_modules/lodash');
const ssbClient = require('../server/node_modules/ssb-client');
const ssbConfig = require('../server/node_modules/ssb-config');
const ssbKeys = require('../server/node_modules/ssb-keys');
const { printMetadata } = require('../server/ssb_metadata');
const updateFlagPath = path.join(__dirname, "../server/.update_required");

let internalSSB = null;
try {
  const { server } = require('../server/SSB_server');
  internalSSB = server;
} catch {}

if (process.env.OASIS_TEST) {
  ssbConfig.path = fs.mkdtempSync(path.join(os.tmpdir(), "oasis-"));
  ssbConfig.keys = ssbKeys.generate();
}

const socketPath = path.join(ssbConfig.path, "socket");
const publicInteger = ssbConfig.keys.public.replace(".ed25519", "");
const remote = `unix:${socketPath}~noauth:${publicInteger}`;

const windowLogStream = (ssb) => {
  if (!ssb || ssb._logStreamWindowed || typeof ssb.createLogStream !== "function") return ssb;
  const pull = require("../server/node_modules/pull-stream");
  const defer = require("../server/node_modules/pull-defer");
  const orig = ssb.createLogStream;
  ssb.createLogStream = function (opts) {
    const o = opts || {};
    const plain = o.limit && !o.reverse && !o.live && !o.raw && o.old === undefined && !o.gt && !o.lt;
    if (!plain) return orig.call(ssb, opts);
    const src = defer.source();
    pull(
      orig.call(ssb, { ...o, reverse: true }),
      pull.collect((err, msgs) => {
        if (err) return src.abort(err);
        src.resolve(pull.values(msgs.reverse()));
      })
    );
    return src;
  };
  ssb._logStreamWindowed = true;
  return ssb;
};

const connect = (options) =>
  new Promise((resolve, reject) => {
    ssbClient(process.env.OASIS_TEST ? ssbConfig.keys : null, options)
      .then((ssb) => resolve(windowLogStream(ssb)))
      .catch(reject);
  });

let closing = false;
let clientHandle;

const attemptConnectionWithBackoff = (attempt = 1) => {
  const maxAttempts = 5;
  const delay = Math.min(1000 * Math.pow(2, attempt), 10000);

  return new Promise((resolve, reject) => {
    connect({ remote })
      .then(resolve)
      .catch((error) => {
        if (attempt >= maxAttempts) {
          return reject(new Error("Failed to connect after multiple attempts"));
        }
        setTimeout(() => {
          attemptConnectionWithBackoff(attempt + 1).then(resolve).catch(reject);
        }, delay);
      });
  });
};

let pendingConnection = null;

const ensureConnection = (customConfig) => {
  if (pendingConnection === null) {
    pendingConnection = new Promise((resolve) => {
      setTimeout(() => {
        attemptConnectionWithBackoff()
          .then(resolve)
          .catch(() => {
            resolve(null);
          });
      });
    });

    const cancel = () => (pendingConnection = null);
    pendingConnection.then(cancel, cancel);
  }

  return pendingConnection;
};

module.exports = ({ offline, port = 3000, host = 'localhost', isPublic = false }) => {
  const customConfig = JSON.parse(JSON.stringify(ssbConfig));
  if (offline === true) {
    lodash.set(customConfig, "conn.autostart", false);
  }
  lodash.set(
    customConfig,
    "conn.hops",
    lodash.get(ssbConfig, "conn.hops", lodash.get(ssbConfig.friends, "hops", 0))
  );

  const cooler = {
    open() {
      return new Promise((resolve, reject) => {
        if (internalSSB) {
          const { printMetadata, colors } = require('../server/ssb_metadata');
          printMetadata('OASIS GUI', colors.yellow, port, host, offline, isPublic);
          return resolve(windowLogStream(internalSSB));
        }

        if (clientHandle && clientHandle.closed === false) {
          return resolve(clientHandle);
        }

        ensureConnection(customConfig).then((ssb) => {
          if (!ssb) return reject(new Error("No SSB server available"));
          clientHandle = ssb;
          if (closing) {
            cooler.close();
            reject(new Error("Closing Oasis"));
          } else {
            const { printMetadata, colors } = require('../server/ssb_metadata');
            printMetadata('OASIS GUI', colors.yellow, port, host, offline, isPublic);
            resolve(ssb);
          }
        }).catch(reject);
      });
    },

    close() {
      closing = true;
      if (clientHandle && clientHandle.closed === false) {
        clientHandle.close();
      }
    },
  };

  return cooler;
};
