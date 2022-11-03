const stack = require("secret-stack");
const shuffle = require("lodash.shuffle");
const debug = require("debug")("oasis");
const ssbConfig = require("ssb-config");

const plugins = [
  // Authentication often hooked for authentication.
  require("ssb-master"),
  require("ssb-db"),
  require("ssb-replicate"),
  require("ssb-backlinks"),
  require("ssb-conn"),
  shuffle([
    require("ssb-about"),
    require("ssb-blobs"),
    require("ssb-ebt"),
    require("ssb-friends"),
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
  ]),
];

module.exports = (config) => {
  const server = stack();
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
