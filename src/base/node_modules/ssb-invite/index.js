'use strict'
const valid = require('muxrpc-validation')({})
const crypto = require('crypto')
const ssbKeys = require('ssb-keys')
const cont = require('cont')
const explain = require('explain-error')
const ip = require('ip')
const ref = require('ssb-ref')
const level = require('level')
const path = require('path')

const createClient = require('ssb-client/client')

const ALREADY_FOLLOWING = 'already following'

// invite plugin
// adds methods for producing invite-codes,
// which peers can use to command your server to follow them.

function isFunction (f) {
  return typeof f === 'function'
}

function isObject (o) {
  return o && typeof o === 'object'
}

function isNumber (n) {
  return typeof n === 'number' && !isNaN(n)
}

function logErrorCb (err) {
  if (err) console.log(err)
}

function contNoop (cb) {
  cb()
}

module.exports = {
  name: 'invite',
  version: '1.0.0',
  manifest: require('./manifest.json'),
  permissions: {
    master: { allow: ['create'] }
    // temp: {allow: ['use']}
  },
  init: function (server, config) {
    const codesDB = level(path.join(config.path, 'invites'), {
      valueEncoding: 'json'
    })

    // make sure to close our leveldb instance when the server quits
    server.close.hook(function (fn, args) {
      codesDB.close(err => {
        if (err) console.error(`error closing leveldb: ${err.message}`)
        fn.apply(this, args)
      })
    })

    // add an auth hook.
    server.auth.hook((fn, args) => {
      const pubkey = args[0]; const cb = args[1]

      // run normal authentication
      fn(pubkey, function (err, auth) {
        if (err || auth) return cb(err, auth)

        // if no rights were already defined for this pubkey
        // check if the pubkey is one of our invite codes
        codesDB.get(pubkey, function (_, code) {
          // disallow if this invite has already been used.
          if (code && (code.used >= code.total)) cb()
          else cb(null, code && code.permissions)
        })
      })
    })

    function getInviteAddress () {
      return (config.allowPrivate
        ? server.getAddress('public') || server.getAddress('local') || server.getAddress('private')
        : server.getAddress('public')
      )
    }

    return {
      create: valid.async(function (opts, cb) {
        opts = opts || {}
        if (isNumber(opts)) {
          opts = { uses: opts }
        } else if (isObject(opts) && opts.modern) {
          opts.uses = 1
        } else if (isFunction(opts)) {
          cb = opts
          opts = {}
        }

        let addr = getInviteAddress()
        if (!addr) {
          return cb(new Error(
            'no address available for creating an invite,' +
          'configuration needed for server.\n' +
          'see: https://github.com/ssbc/ssb-config/#connections'
          ))
        }
        addr = addr.split(';').shift()
        let host = ref.parseAddress(addr).host
        if (typeof host !== 'string') {
          return cb(new Error('Could not parse host portion from server address:' + addr))
        }

        if (opts.external) { host = opts.external }

        if (!config.allowPrivate && (ip.isPrivate(host) || host === 'localhost' || host === '')) {
          return cb(new Error(
            'Server has no public ip address, cannot create useable invitation')
          )
        }

        // this stuff is SECURITY CRITICAL
        // so it should be moved into the main app.
        // there should be something that restricts what
        // permissions the plugin can create also:
        // it should be able to diminish it's own permissions.

        // generate a key-seed and its key
        const seed = crypto.randomBytes(32)
        const keyCap = ssbKeys.generate('ed25519', seed)

        // store metadata under the generated pubkey
        codesDB.put(keyCap.id, {
          id: keyCap.id,
          total: +opts.uses || 1,
          note: opts.note,
          used: 0,
          permissions: { allow: ['invite.use', 'getAddress'], deny: null }
        }, function (err) {
          // emit the invite code: our server address, plus the key-seed
          if (err) cb(err)
          else if (opts.modern) {
            const wsAddr = getInviteAddress().split(';').sort(function (a, b) {
              return +/^ws/.test(b) - +/^ws/.test(a)
            }).shift()

            if (!/^ws/.test(wsAddr)) throw new Error('not a ws address:' + wsAddr)
            cb(null, wsAddr + ':' + seed.toString('base64'))
          } else {
            addr = ref.parseAddress(addr)
            cb(null, [opts.external ? opts.external : addr.host, addr.port, addr.key].join(':') + '~' + seed.toString('base64'))
          }
        })
      }, 'number|object', 'string?'),
      use: valid.async(function (req, cb) {
        const rpc = this

        // fetch the code
        codesDB.get(rpc.id, function (err, invite) {
          if (err) return cb(err)

          // check if we're already following them
          server.friends.isFollowing({ source: server.id, dest: req.feed }, (err, isFollowing) => {
            if (err) return cb(err)
            if (isFollowing) { return cb(new Error('already following')) }

            // although we already know the current feed
            // it's included so that request cannot be replayed.
            if (!req.feed) { return cb(new Error('feed to follow is missing')) }

            if (invite.used >= invite.total) { return cb(new Error('invite has expired')) }

            invite.used++

            // never allow this to be used again
            if (invite.used >= invite.total) {
              invite.permissions = { allow: [], deny: null }
            }
            // TODO
            // okay so there is a small race condition here
            // if people use a code massively in parallel
            // then it may not be counted correctly...
            // this is not a big enough deal to fix though.
            // -dominic

            // update code metadata
            codesDB.put(rpc.id, invite, (err) => {
              if (err) return cb(err)
              server.emit('log:info', ['invite', rpc.id, 'use', req])

              // follow the user
              server.publish({
                type: 'contact',
                contact: req.feed,
                following: true,
                pub: true,
                note: invite.note || undefined
              }, cb)
            })
          })
        })
      }, 'object'),
      accept: valid.async((invite, cb) => {
        // remove surrounding quotes, if found
        if (isObject(invite)) { invite = invite.invite }

        if (invite.charAt(0) === '"' && invite.charAt(invite.length - 1) === '"') { invite = invite.slice(1, -1) }
        let opts
        // connect to the address in the invite code
        // using a keypair generated from the key-seed in the invite code
        if (ref.isInvite(invite)) { // legacy invite
          if (ref.isLegacyInvite(invite)) {
            const parts = invite.split('~')
            opts = ref.parseAddress(parts[0])// .split(':')
            // convert legacy code to multiserver invite code.
            let protocol = 'net:'
            if (opts.host.endsWith('.onion')) { protocol = 'onion:' }
            invite = protocol + opts.host + ':' + opts.port + '~shs:' + opts.key.slice(1, -8) + ':' + parts[1]
          }
        }

        const parsedInvite = ref.parseInvite(invite)
        if (!parsedInvite || !parsedInvite.remote) {
          return cb(new Error(`ssb-invite failed to parse invite ${invite}`))
        }
        opts = ref.parseAddress(parsedInvite.remote)
        function connect (cb) {
          createClient({
            keys: true, // use seed from invite instead.
            remote: invite,
            config,
            manifest: { invite: { use: 'async' }, getAddress: 'async' }
          }, cb)
        }

        // retry 3 times, with timeouts.
        // This is an UGLY hack to get the test/invite.js to pass
        // it's a race condition, I think because the server isn't ready
        // when it connects?

        function retry (fn, cb) {
          let n = 0
          ;(function next () {
            const start = Date.now()
            fn(function (err, value) {
              n++
              if (n >= 3) cb(err, value)
              else if (err) setTimeout(next, 500 + (Date.now() - start) * n)
              else cb(null, value)
            })
          })()
        }

        retry(connect, (err, rpc) => {
          if (err) return cb(explain(err, 'could not connect to server'))

          // command the peer to follow me
          rpc.invite.use({ feed: server.id }, (err, msg) => {
            if (err && err.message !== ALREADY_FOLLOWING) {
              return cb(explain(err, 'invite not accepted'))
            }

            // (maybe) follow and announce the pub
            cont.para([
              (
                (err && err.message === ALREADY_FOLLOWING)
                  ? contNoop
                  : cont(server.publish)({
                    type: 'contact',
                    following: true,
                    autofollow: true,
                    contact: opts.key
                  })
              ),
              (
                opts.host
                  ? cont(server.publish)({
                    type: 'pub',
                    address: opts
                  })
                  : contNoop
              )
            ])((err, results) => {
              if (err) return cb(err)
              rpc.close(logErrorCb)
              rpc.close(logErrorCb)
              // ignore err if this is new style invite
              if (server.gossip && server.gossip.add) server.gossip.add(ref.parseInvite(invite).remote, 'seed')
              cb(null, results)
            })
          })
        })
      }, 'string')
    }
  }
}
