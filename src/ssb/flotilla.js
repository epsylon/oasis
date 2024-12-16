const SecretStack = require("secret-stack");
const debug = require("debug")("oasis");
const ssbConfig = require("ssb-config");

const caps = require('ssb-caps')

const plugins = [
  // Authentication often hooked for authentication.
  require("ssb-master"),
  require("ssb-db"),
  require("ssb-backlinks"),
  require("ssb-conn"),
  require("ssb-about"),
  require("ssb-blobs"),
  require("ssb-ebt"),
  require("ssb-friends"),
  require("ssb-replication-scheduler"),
  require("ssb-invite"),
  require("ssb-lan"),
  require("ssb-logging"),
  require("ssb-meme"),
  require("ssb-no-auth"),
  require("ssb-onion"),
  require("ssb-ooo"),
  require("ssb-plugins"),
  require("ssb-private1"),
  require("ssb-query"),
  require("ssb-room/tunnel/client"),
  require("ssb-search"),
  require("ssb-tangle"),
  require("ssb-unix-socket"),
  require("ssb-ws"),
];

module.exports = (config) => {
  const server = SecretStack({caps});
  const walk = (input) => {

    if (Array.isArray(input)) {
      input.forEach(walk);
    } else {
      debug(input.name || "???");
      server.use(input);
    }
  };

  walk(plugins);

  return server({ ...ssbConfig, ...config });
};

