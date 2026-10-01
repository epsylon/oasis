#! /usr/bin/env node

var path = require('path')
var Blobs = require('./')
var pull = require('pull-stream')
var toPull = require('stream-to-pull-stream')

var u = require('./util')
var createHash = u.createHash

var cmd = process.argv[2], arg = process.argv[3]

var dir = path.join(process.env.HOME, 'tmp', 'multiblob')

var blobs = Blobs(dir)

if(cmd === 'add')
  pull(
    toPull.source(process.stdin),
    blobs.add(arg, function (err, hash) {
      if(err) throw err
      console.log(hash)
    })
  )

if(cmd === 'get')
  pull(blobs.get(arg), toPull.sink(process.stdout))

if(cmd === 'has')
  blobs.has(arg, function (err) {
    if(err) throw err
    console.error('okay')
  })

if(cmd === 'ls' || cmd === 'list')
  pull(blobs.ls(), pull.drain(console.log))

if(cmd === 'hash') {
  var hasher = createHash('sha256')
  pull(toPull.source(process.stdin), hasher, pull.drain(null, function () {
    console.log(hasher.digest)
  }))
}

if(cmd === 'resolve')
  console.log(blobs.resolve(arg))
