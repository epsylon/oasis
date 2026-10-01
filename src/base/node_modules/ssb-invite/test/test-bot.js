const ssbKeys = require('ssb-keys')
const crypto = require('crypto')

const caps = {
  shs: crypto.randomBytes(32).toString('base64')
}

module.exports = function (opts = {}) {
  if (!opts.caps) opts.caps = caps
  if (!opts.keys) opts.keys = ssbKeys.generate()
  if (!opts.timeout) opts.timeout = 100

  const stack = require('scuttle-testbot')
    .use(require('..'))
    .use(require('ssb-ws'))

  if (process.env.OLD_DEPS) {
    stack
      .use(require('ssb-replicate'))
      .use(require('ssb-friends-4'))
      .use(require('ssb-conn-1'))
  } else {
    stack
      .use(require('ssb-friends'))
      .use(require('ssb-ebt'))
      .use(require('ssb-replication-scheduler'))
  }

  return stack({
    db1: true,
    ...opts
  })
}
