const Blobs = require('../inject')
const MockStore = require('./mock/blob-store')
const MockPush = require('./mock/blob-push')
const { sync } = require('./util')

const createBlobs = (name, _async) => Blobs(
  MockStore(name, _async),
  MockPush(_async),
  name
)

const name = 'SYNC'
require('./suite/integration')(createBlobs, sync, name)
require('./suite/simple')(createBlobs, sync, name)
require('./suite/push')(createBlobs, sync, name)
require('./suite/legacy')(createBlobs, sync, name)
