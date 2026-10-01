var tape = require('tape')
var zerr = require('../')

tape('set error params (.name, .message, .stack)', function (t) {
  var FirstError  = zerr('First',     'The First error')
  var SecondError = zerr('Second',    'The Second error')
  var ThirdError  = zerr('ThirdError','The Third error')

  function check (Cons, v) {
    try { throw new Cons() }
    catch (err) { tests(err, v) }
    try { throw Cons() }
    catch (err) { tests(err, v) }
  }
  function tests (err, v) {
    console.log(err.stack)
    t.equal(err.name, v+'Error')
    t.ok(err.stack && typeof err.stack == 'string')
    t.ok(err.stack.indexOf(v+'Error') >= 0)
    t.equal(err.message, 'The '+v+' error')
  }

  check(FirstError, 'First')
  check(SecondError, 'Second')
  check(ThirdError, 'Third')
  t.end()
})

tape('explain error', function (t) {
  var FirstError  = zerr('First',     'The First error')
  var SecondError = zerr('Second',    'The Second error')
  
  function makeFirst () {
    return new FirstError()
  }

  try {
    var first = makeFirst()
    throw new SecondError(first)
  } catch (err) {
    console.log(err.stack)
    t.ok(err.stack.indexOf('FirstError') >= 0)
    t.ok(err.stack.indexOf('SecondError') >= 0)
  }

  t.end()
})

tape('interpolated message', function (t) {
  var Foo = zerr('Foo', 'foo: %')
  var Bar = zerr('Bar', 'foo: %, bar: %')

  t.equal((Foo('FOO')).message, 'foo: FOO')
  t.equal((Bar('FOO')).message, 'foo: FOO, bar: ')
  t.equal((Foo('FOO', 'BAR')).message, 'foo: FOO')
  t.equal((Bar('FOO', 'BAR')).message, 'foo: FOO, bar: BAR')
  t.end()
})

tape('non-interpolated message', function (t) {
  var Foo = zerr('Foo')
  var Bar = zerr('Bar')

  t.equal((Foo('FOO')).message, 'FOO')
  t.equal((Bar('FOO')).message, 'FOO')
  t.equal((Foo('FOO', 'BAR')).message, 'FOO')
  t.equal((Bar('FOO', 'BAR')).message, 'FOO')
  t.end()
})