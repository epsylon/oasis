
var PCont = require('../')
var tape = require('tape')

var pull = require('pull-stream')

tape('continuable to a pull-stream', function (t) {

  pull(
    PCont(function (cb) {
      cb(null, pull.values([1,2,3]))
    }),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary, [1,2,3])
      t.end()
    })
  )

})

var fs = require('fs')
var path = require('path')

tape('make ls as a continuable', function (t) {
  pull(
    PCont(function (cb) {
      fs.readdir(path.join(__dirname, '..'), function (err, ls) {
        if(err) cb(err)
        else cb(null, pull.values(ls))
      })
    }),
    pull.collect(function (err, ary) {
      if(err) throw err
      t.deepEqual(ary.filter(function (e) {
        return e[0] !== '.'
      }), ['LICENSE', 'README.md', 'index.js', 'node_modules', 'package.json', 'test'])
      t.end()
    })
  )

})
