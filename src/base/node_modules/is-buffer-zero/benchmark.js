const crypto = require('crypto');
const isZero = require('./')
const isZeroOriginal = require('is-zero-buffer')

console.log("Benchmarking 10.000 0 buffers:")

const runs = 10000
const buf = Buffer.alloc(65536)
let then = Date.now()

for (let i = 0; i < runs; ++i)
  isZero(buf)

console.log("is-buffer-zero:", Date.now() - then, "ms")

then = Date.now()

for (let i = 0; i < runs; ++i)
  isZeroOriginal(buf)

console.log("is-zero-buffer:", Date.now() - then, "ms")

function isZeroUsingLoop(buf) {
  return buf.every(x => x === 0)
}

then = Date.now()

for (let i = 0; i < runs; ++i)
  isZeroUsingLoop(buf)

console.log("is zero using loop:", Date.now() - then, "ms")

console.log("Benchmarking 100.000 random buffers:")

const random_runs = 100000

const buffers = []
for (var i = 0; i < random_runs; ++i)
  buffers.push(crypto.randomBytes(65536))

then = Date.now()

for (let i = 0; i < random_runs; ++i)
  isZero(buffers[i])

console.log("is-buffer-zero:", Date.now() - then, "ms")

then = Date.now()

for (let i = 0; i < random_runs; ++i)
  isZeroOriginal(buffers[i])

console.log("is-zero-buffer:", Date.now() - then, "ms")

then = Date.now()

for (let i = 0; i < random_runs; ++i)
  isZeroUsingLoop(buffers[i])

console.log("is zero using loop:", Date.now() - then, "ms")
