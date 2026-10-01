

var tape = require('tape')
var Hoox = require('../')

function hello (name) {
  return 'Hello, '+name+'.'
}

function post(fn, args) {
  var s = fn.apply(this, args)
  return s.replace('.', '!!!')
}


function pre (fn, args) {
  return fn(args[0].toUpperCase())
}

//hello = Hoox(hello).hook(pre).hook(post)
console.log(hello('foo'))


tape('simple', function (t) {
  t.equal(hello('foo'), 'Hello, foo.')
  hello2 = Hoox(hello)
  t.equal(hello2('foo'), 'Hello, foo.')
  hello2.hook(post)
  t.equal(hello2('foo'), 'Hello, foo!!!')

  t.equal(Hoox(hello).hook(pre)('foo'), 'Hello, FOO.')
  t.equal(Hoox(hello).hook(post).hook(pre)('foo'), 'Hello, FOO!!!')
  t.equal(Hoox(hello).hook(pre).hook(post)('foo'), 'Hello, FOO!!!')

  t.end()
})


function async (n, cb) {
  cb(null, n + 1)
}

function alwaysAsync(fn, args) {
  var sync = true
  fn(args[0], function (err, value) {
    if(sync) process.nextTick(function () {
      args[1](err, value, false)
    })
    else
      args[1](err, value, true)
  })
  sync = false
}

function double (fn, args) {
  return fn(args[0]*2, args[1])
}

function precheck (fn, args) {
  setTimeout(function () {
    fn.apply(null, args)
  })
}

tape('callback', function (t) {
  var n = 3

  Hoox(async)
    (1, function (_, v) {
      t.equal(v, 2)
      next()
    })

  Hoox(async).hook(alwaysAsync).hook(double)
    (3, function (_, v, async) {
      t.equal(v, 7)
      t.notOk(async)
      next()
    })

  Hoox(async).hook(precheck).hook(alwaysAsync)
    (7, function (_, v, async) {
      t.equal(v, 8)
      t.ok(async)
      next()
    })

  function next () {
    if(--n) return
    t.end()
  }
})



tape('left to right, async', function (t) {
  var a, b, c
  Hoox(async).hook(function (fn, args) {
    a = true
    fn(args[0], function (_, v) {
      t.equal(v, 4)
      args[1](_, v * 2)
    })
  })
    (3, function (_, v) {

      t.equal(v, 8)
      t.end()
    })

})


tape('check a thing, maybe return something different, else change result', function (t) {

  var h = Hoox(function (a) {
    return a * 100
  }).hook(function (fn, args) {
    var a = args[0]

    if(isNaN(a)) return 0

    return ~~fn(a)
  })

  t.equal(h(1/0), 0)
  t.equal(h(0.5), 50)

  t.end()

})
