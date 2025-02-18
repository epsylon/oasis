"use strict";

const path = require('path');
const fs = require('fs');
const os = require('os');
const ssbClient = require(path.join(__dirname, '../server/node_modules/ssb-client'));
const ssbConfig = require(path.join(__dirname, '../server/node_modules/ssb-config'));
const ssbKeys = require(path.join(__dirname, '../server/node_modules/ssb-keys'));
const debug = require('../server/node_modules/debug')('oasis');
const lodash = require('../server/node_modules/lodash');

if (process.env.OASIS_TEST) {
  ssbConfig.path = fs.mkdtempSync(path.join(os.tmpdir(), "oasis-"));
  ssbConfig.keys = ssbKeys.generate();
}

const socketPath = path.join(ssbConfig.path, "socket");
const publicInteger = ssbConfig.keys.public.replace(".ed25519", "");
const remote = `unix:${socketPath}~noauth:${publicInteger}`;

const log = (formatter, ...args) => {
  const isDebugEnabled = debug.enabled;
  debug.enabled = true;
  debug(formatter, ...args);
  debug.enabled = isDebugEnabled;
};

const connect = (options) =>
  new Promise((resolve, reject) => {
    const onSuccess = (ssb) => {
      resolve(ssb);
    };
    ssbClient(process.env.OASIS_TEST ? ssbConfig.keys : null, options)
      .then(onSuccess)
      .catch(reject);
  });

let closing = false;
let serverHandle;
let clientHandle;

const attemptConnection = () =>
  new Promise((resolve, reject) => {
    const originalConnect = process.env.OASIS_TEST
      ? new Promise((resolve, reject) =>
          reject({
            message: "could not connect to sbot",
          })
        )
      : connect({ remote });
    originalConnect
      .then((ssb) => {
        resolve(ssb);
      })
      .catch((e) => {
        if (closing) return;
        debug("Unix socket failed");
        if (e.message !== "could not connect to sbot") {
          throw e;
        }
        connect()
          .then((ssb) => {
            resolve(ssb);
          })
          .catch((e) => {
            if (closing) return;
            debug("TCP socket failed");
            if (e.message !== "could not connect to sbot") {
              throw e;
            }
            reject(new Error("Both connection options failed"));
          });
      });
  });

let pendingConnection = null;

const ensureConnection = (customConfig) => {
  if (pendingConnection === null) {
    pendingConnection = new Promise((resolve) => {
      setTimeout(() => {
      attemptConnection()
        .then((ssb) => {
          resolve(ssb);
        })
        });
    });

    const cancel = () => (pendingConnection = null);
    pendingConnection.then(cancel, cancel);
  }

  return pendingConnection;
};

module.exports = ({ offline }) => {
  if (offline) {
    log("Offline mode activated - not connecting to scuttlebutt peers or pubs");
  }

  const customConfig = JSON.parse(JSON.stringify(ssbConfig));

  if (offline === true) {
    lodash.set(customConfig, "conn.autostart", false);
  }

  lodash.set(
    customConfig,
    "conn.hops",
    lodash.get(ssbConfig, "conn.hops", lodash.get(ssbConfig.friends.hops, 0))
  );

  const cooler = {
    open() {
      return new Promise((resolve, reject) => {
        if (clientHandle && clientHandle.closed === false) {
          resolve(clientHandle);
        } else {
          ensureConnection(customConfig).then((ssb) => {
            clientHandle = ssb;
            if (closing) {
              cooler.close();
              reject(new Error("Closing Oasis"));
            } else {
              resolve(ssb);
            }
          });
        }
      });
    },
    close() {
      closing = true;
      if (clientHandle && clientHandle.closed === false) {
        clientHandle.close();
      }
    },
  };

  cooler.open();

  return cooler;
};

