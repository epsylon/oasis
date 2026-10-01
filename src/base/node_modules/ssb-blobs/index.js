const path = require('path')
const Level = require('level')

const Inject = require('./inject')
const BlobStore = require('./blob-store')
const BlobPush = require('./blob-push')

exports.manifest = {
  get: 'source',
  getSlice: 'source',
  add: 'sink',
  rm: 'async',
  ls: 'source',
  has: 'async',
  size: 'async',
  want: 'async',
  push: 'async',
  changes: 'source',
  createWants: 'source',
  help: 'sync'
}

exports.name = 'blobs'

exports.version = require('./package.json').version

exports.permissions = {
  anonymous: { allow: ['has', 'get', 'getSlice', 'changes', 'createWants'] }
}

exports.init = function (sbot, config) {
  const level = Level(path.join(config.path, 'blobs_push'), { valueEncoding: 'json' })
  sbot.close.hook(function (fn, args) {
    level.close(() => fn(...args))
  })

  const blobs = Inject(
    BlobStore(path.join(config.path, 'blobs')),
    BlobPush(level),
    sbot.id,
    config.blobs
  )

  sbot.on('rpc:connect', function (rpc) {
    if (rpc.id === sbot.id) return
    blobs._onConnect(rpc, rpc.id)
  })

  return blobs
}
