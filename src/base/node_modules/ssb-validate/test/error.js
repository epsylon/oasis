var tape = require('tape')
var ssbKeys = require('ssb-keys')
var crypto = require('crypto')

function hash (seed) {
  return crypto.createHash('sha256').update(seed).digest()
}

function id (msg) {
  return '%'+crypto.createHash('sha256').update(JSON.stringify(msg, null, 2), 'binary').digest('base64')+'.sha256'
}

var keys = ssbKeys.generate('ed25519', hash('validation-test-seed1'))
var keys2 = ssbKeys.generate('ed25519', hash('validation-test-seed2'))


//generate randomish but deterministic test data.
//this is not intended for security use.
//use a proper key stream (etc) instead.
function pseudorandom (seed, length) {
  var a = []
  for(var l = 0; l < length; l += 32)
    a.push(hash(''+seed+l))
  return Buffer.concat(a).slice(0, length)
}

var v = require('..')

var data = []

function test (hmac_key) { 
  var state = v.initial()
  tape('simple', function (t) {

    for(var i = 0; i < 10; i++) {
      var msg = v.create(state.feeds[keys.id], keys, hmac_key, {type: 'test', i: i}, +new Date('2017-04-11 8:08 UTC')+i)

      //append sets the state for this author,
      //as well as appends the message to the queue.
      state = v.append(state, hmac_key, msg)

    }
    console.log(state)
    t.end()
  })

  tape('rerun', function (t) {

    for(var i = 0; i < state.queue.length; i++) {
      try {
        console.log(state.queue[i])
        state = v.append(state, hmac_key, state.queue[i])
        t.fail('should have thrown')
      } catch (err) {
        t.equal(err.fatal, undefined)
      }
    }

    t.end()
  })

  tape('invalid - fork', function (t) {

    var last = state.queue[9]
      var m = v.create({
        id: last.previous,
        sequence: 10,
        timestamp: last.timestamp,
        queue: []
      }, keys, hmac_key, {type: 'invalid'}, last.timestamp+1)
      console.log(m)
    try {
      state = v.append(state, hmac_key, m)
      t.fail('should have thrown')
    } catch (err) {
      console.log(err)
      t.equal(err.fatal, true)
      t.end()
    }

  })

  // monotonic timestamps no longer a requirement
  tape('rewind ok', function (t) {
    var last = state.queue[9]
    var m = v.create({
      id: state.feeds[keys.id].id,
      sequence: 10,
      timestamp: last.timestamp-2, queue: []
    }, keys, hmac_key, {type: 'invalid'}, last.timestamp-1)
    console.log(m, last)

    state = v.append(state, hmac_key, m)
    t.end()
  })

  tape('create with invalid date', function (t) {
    t.throws(function () {
      v.create(null, keys, hmac_key, {type: 'invalid'}, new Date('foo'))
    })
    t.end()
  })

  tape('invalid because of empty content', function (t) {
    t.throws(function () {
      v.create(null, keys, hmac_key, null, Date.now())
    })
    t.end()
  })

  var ctxt =
        pseudorandom('test', 1024).toString('base64')+'.box'

  //create a purposefully invalid message (for testing)
//  function create_invalid (state, keys, hmac_key, content, timestamp) {
//    invalid.push(ssbKeys.signObj(keys, hmac_key, {
//      previous: state ? state.id : null,
//      sequence: state ? state.sequence + 1 : 1,
//      author: keys.id,
//      timestamp: +timestamp,
//      hash: 'sha256',
//      content: content,
//    }))
//    return v.create(state, keys, hmac_key, null, timestamp)
//  }

  function test_invalid(t, state, keys, hmac_key, content, timestamp) {
    var msg = ssbKeys.signObj(keys, hmac_key, {
      previous: state ? state.id : null,
      sequence: state ? state.sequence + 1 : 1,
      author: keys.id,
      timestamp: +timestamp,
      hash: 'sha256',
      content: content,
    })
    if(!Buffer.isBuffer(content))
      data.push({state: state, msg: msg, cap: hmac_key, valid: false, id: id(msg)})
    t.throws(function () {
      console.log(state, v.create(state, keys, hmac_key, content, timestamp))
    })
    t.throws(function () {
      var _state = {feeds: {}}
      _state.feeds[keys.id] = state
      v.append(_state, hmac_key, msg)
    })
  }

  //create invalid messages with invalid orders
  function test_invalid_msg(t, state, keys, hmac_key, _msg) {
    var msg = ssbKeys.signObj(keys, hmac_key, _msg)
    if(!state)
      state = {
        queue: [],
        feeds: {},
        validated: 0
      }
    data.push({state: state, msg: msg, cap: hmac_key, valid: false, id: id(msg)})

    t.throws(function () {
      console.log(v.append(state, hmac_key, msg))
    })
    t.throws(function () {
      var _state = {feeds: {}}
      _state.feeds[keys.id] = state
      v.append(_state, hmac_key, msg)
    })
  }


  function test_valid(t, state, keys, hmac_key, content, timestamp) {
    var msg
    msg = v.create(state, keys, hmac_key, content, timestamp)
    data.push({state: state, msg: msg, cap: hmac_key, valid: true, id: id(msg)})
    var _state = {queue: [], feeds: {}}
    _state.feeds[keys.id] = state
    v.append(_state, hmac_key, msg)
    t.deepEqual(msg.content, content)
    t.equal(msg.timestamp, timestamp)

  }

  function test_valid_msg(t, state, keys, hmac_key, _msg) {
    var msg = ssbKeys.signObj(keys, hmac_key, _msg)
    data.push({state: state, msg: msg, cap: hmac_key, valid: true, id: id(msg)})
    var _state = {queue: [], feeds: {}}
    _state.feeds[keys.id] = state
    v.append(_state, hmac_key, msg)
  }

  tape('various invalid first messages', function (t) {
    var date = +new Date('2017-04-11 9:09 UTC')
    test_invalid(t, null, keys, hmac_key, null, date)
    test_invalid(t, null, keys, hmac_key, date)
    test_invalid(t, null, keys, hmac_key, false, date)
    test_invalid(t, null, keys, hmac_key, 0, date)
    test_invalid(t, null, keys, hmac_key, 100, date)
    test_invalid(t, null, keys, hmac_key, [], date)
    test_invalid(t, null, keys, hmac_key, new Buffer('hello'), date)
    test_invalid(t, null, keys, hmac_key, new Date(date), date)

    test_invalid(t, null, keys, hmac_key, {}, date)
    test_invalid(t, null, keys, hmac_key, {tyfe:'not-okay' }, date)
    test_invalid(t,null, keys, hmac_key, {tyfe:'not-okay' }, date)
    test_invalid(t, null, keys, hmac_key, {
      type: //too long!
        pseudorandom('test', 100).toString('base64')
    }, date)

    //type too long
    test_invalid(t, null, keys, hmac_key, {type:keys.id }, date)
    // type too short
    test_invalid(t, null, keys, hmac_key, {type:'T' }, date)
    // type too short
    test_invalid(t, null, keys, hmac_key, {type:'TT' }, date)
    // content too long
    test_invalid(t,
      null, keys, hmac_key,
      pseudorandom('test', 8*1024).toString('base64')+'.box',
      date
    )

    t.end()
  })

  tape('extended invalid first messages', function (t) {
    var date = +new Date('2017-04-11 9:09 UTC')
    test_invalid_msg(t, null, keys, hmac_key, {
      previous: null,
      author: keys.id,
      sequence: 1,
      timestamp: +date,
      hash: 'oanteuhnoatehuneotuh', //unsupported hash
      content: {type:'invalid'}
    })
    test_invalid_msg(t, null, keys, hmac_key, {
      previous: null,
      author: keys.id,
      sequence: 1,
      timestamp: +date,
      //missing hash
      content: {type:'invalid'}
    })
    //invalid orders
    test_invalid_msg(t, null, keys, hmac_key, {
      content: {type:'invalid'},
      hash: 'sha256',
      author: keys.id,
      timestamp: +date,
      sequence: 1,
      previous: null,
    })
    test_invalid_msg(t, null, keys, hmac_key, {
      previous: null,
      author: keys.id,
      sequence: 1,
      timestamp: +date,
      content: {type:'invalid'},
      hash: 'sha256',
    })

    t.end()
  })

  tape('disallow extra fields', function (t) {

    var msg = ssbKeys.signObj(keys, hmac_key, {
      previous: null,
      author: keys.id,
      sequence: 1,
      timestamp: +new Date('2017-04-11 9:09 UTC'),
      hash: 'sha256',
      content: {type: 'invalid'},
      extra: 'INVALID'
    })
    var signature = msg.signature
    delete msg.signature
    delete msg.extra
    msg.signature = signature
    msg.extra = 'INVALID'
    var state = {
      queue: [],
      feeds: {},
      validated: 0
    }
    data.push({state: state, msg: msg, cap: hmac_key, valid: false, id: id(msg)})

    t.throws(function () {
      console.log(v.append(state, hmac_key, msg))
    })
    t.throws(function () {
      var _state = {feeds: {}}
      _state.feeds[keys.id] = state
      v.append(_state, hmac_key, msg)
    })
    t.end()
  })

  tape('valid messages', function (t) {
    //type must be 3 chars
    test_valid(t, null, keys, hmac_key, {type:'TTT' }, +new Date('2017-04-11 9:09 UTC'))

    //author and sequence fields may come in either order!
    //all other fields must be in exact order.
    test_valid_msg(t, null, keys, hmac_key, {
      previous: null,

      author: keys.id, sequence: 1,

      timestamp: +new Date('2017-04-11 9:09 UTC'),
      hash: 'sha256',
      content: { type: 'valid' }
    })

    test_valid_msg(t, null, keys, hmac_key, {
      previous: null,

      sequence: 1, author: keys.id,

      timestamp: +new Date('2017-04-11 9:09 UTC'),
      hash: 'sha256',
      content: { type: 'valid' }
    })


    //type can be msg id
    var msg_id = '%'+hash('test_msg_id').toString('base64')+'.sha256'
    test_valid(t, null, keys2, hmac_key, {type: msg_id}, +new Date('2017-04-11 9:09 UTC'))

    //content can be encrypted.
    test_valid(t, null, keys2, hmac_key, ctxt, +new Date('2017-04-11 9:09 UTC'))

    //content encrypted with future private box version
    test_valid(t, null, keys2, hmac_key, ctxt+'2', +new Date('2017-04-11 9:09 UTC'))

    test_valid(t, null, keys, hmac_key, {type: 'okay'}, +new Date('2019-01-01 0:00 UTC'))

    //for backwards compatibilty reasons, we only count the
    //javascript string length of a message, so it may actually
    //be encoded as longer that 8k, if it uses unicode.

    //so a message with 7000 euro signs is valid, even though
    //it is technically longer than we intended.

    //at some point, we'll introduce a binary encoding for
    //messages and we'll fix this then.
    var text = ''
    for(var i = 0; i < 7000; i++)
      text += '\u20ac'
    t.ok(text.length < 8124)

    console.log(text.length)
    console.log(new Buffer(JSON.stringify({text: text}), 'utf8').length)

    t.ok(new Buffer(JSON.stringify({text: text}), 'utf8').length > 8000)

    test_valid(t, null, keys, hmac_key, {type: 'euros', text: text}, +new Date('2019-01-01 0:00 UTC'))

    t.end()
  })

}

test()
test(hash('hmac_key').toString('base64'))
test(hash('hmac_key2').toString('base64'))
test(hash('hmac_key3'))
