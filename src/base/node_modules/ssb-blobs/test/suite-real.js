const rimraf = require('rimraf')
const osenv = require('osenv')
const path = require('path')
const mkdirp = require('mkdirp')
const level = require('level')

const Blobs = require('../inject')
const BlobStore = require('../blob-store')
const BlobPush = require('../blob-push')
const { sync } = require('./util')

const createBlobs = (name, async) => {
  const dir = path.join(
    osenv.tmpdir(),
    'test-blobstore_' + name + '_' + Date.now() + Math.random()
  )
  rimraf.sync(dir)
  mkdirp.sync(dir)

  return Blobs(
    BlobStore(dir),
    BlobPush(level(dir, { valueEncoding: 'json' })),
    name
  )
}

// since we are using the real FS this time,
// we don't need to apply fake async.
const name = 'REAL'
require('./suite/simple')(createBlobs, sync, name)
require('./suite/integration')(createBlobs, sync, name)
require('./suite/legacy')(createBlobs, sync, name)
require('./suite/push')(createBlobs, sync, name)
