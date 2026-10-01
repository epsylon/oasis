#! /usr/bin/env node

var Blake2s = require('./')
var b = new Blake2s()

var stream = process.stdin.isTTY
  ? require('fs').createReadStream(process.argv[2])
  : process.stdin

stream.on('data', function (d) { b.update(d) })
.on('end', function () { console.log(b.hexDigest()) })

