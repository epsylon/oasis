var ref = require('ssb-ref')
var ssbKeys = require('ssb-keys')
var isFeedId = ref.isFeedId
var timestamp = require('monotonic-timestamp')
var isCanonicalBase64 = require('is-canonical-base64')
var isEncryptedRx = isCanonicalBase64('','\\.box.*')
var isSignatureRx = isCanonicalBase64('','\\.sig.\\w+')

function isValidOrder (msg, signed) {
  var keys = Object.keys(msg)
  if(signed && keys.length !== 7) return false
  if(
    keys[0] !== 'previous' ||
    keys[3] !== 'timestamp' ||
    keys[4] !== 'hash' ||
    keys[5] !== 'content' ||
    (signed && keys[6] !== 'signature')
  ) return false
  //author and sequence may be swapped.
  if(!(
    (keys[1] === 'sequence' && keys[2] === 'author') ||
    (keys[1] === 'author' && keys[2] === 'sequence')
  ))
    return false
  return true
}

var encode = exports.encode = function (obj) {
  return JSON.stringify(obj, null, 2)
}

exports.initial = function () {
  return {
    validated: 0,
    queued: 0,
    queue: [],
    feeds: {},
    error: null
  }
}


function isString (s) {
  return s && 'string' === typeof s
}

function isInteger (n) {
  return ~~n === n
}

function isObject (o) {
  return o && 'object' === typeof o
}

function isEncrypted (str) {
  //NOTE: does not match end of string,
  //so future box version are accepted.
  //XXX check that base64 is canonical!
  return isString(str) && isEncryptedRx.test(str) ///^[0-9A-Za-z\/+]+={0,2}\.box/.test(str)
}

var isInvalidContent = exports.isInvalidContent = function (content) {
  if(!isEncrypted(content)) {
    var type = content.type
    if (!(isString(type) && type.length <= 52 && type.length >= 3)) {
      return new Error('type must be a string' +
        '3 <= type.length < 52, was:' + type
      )
    }
  }
  return false
}

var isSupportedHash = exports.isSupportedHash = function (msg) {
  return msg.hash === 'sha256'
}

var isSigMatchesCurve = exports.isSigMatchesCurve = function (msg) {
  if(!isSignatureRx.test(msg.signature)) return
  var curve = /\.(\w+)/.exec(msg.author)
  if(!(curve && curve[1])) return

  const signatureBase64Length = msg.signature.length - (curve[1].length + 5)

  if (signatureBase64Length !== 88) return
  if ('.sig.'+curve[1] !== msg.signature.substring(signatureBase64Length)) return

  return true
}

var isInvalidShape = exports.isInvalidShape = function (msg) {
  if(
    !isObject(msg) ||
    !isInteger(msg.sequence) ||
    !isFeedId(msg.author) ||
    !(isObject(msg.content) || isEncrypted(msg.content)) ||
    !isValidOrder(msg, false) || //false, because message may not be signed yet.
    !isSupportedHash(msg)
  )
    return new Error('message has invalid properties:'+JSON.stringify(msg, null, 2))

  //allow encrypted messages, where content is a base64 string.

  //NOTE: since this checks the length of javascript string,
  //it's not actually the byte length! it's the number of utf8 chars
  //for latin1 it's gonna be 8k, but if you use all utf8 you can
  //approach 32k. This is a weird legacy thing, obviously, that
  //we will fix at some point...
  var asJson = encode(msg)
  if (asJson.length > 8192) // 8kb
    return new Error('Encoded message must not be larger than 8192 bytes. Current size is '+asJson.length)

  return isInvalidContent(msg.content)
}

const isInvalidHmacKey = (hmacKey) => {
  if (hmacKey === undefined) return false
  if (hmacKey === null) return false
  const bytes = Buffer.isBuffer(hmacKey) ? hmacKey : Buffer.from(hmacKey, 'base64')

  if (typeof hmacKey === 'string') {
    if (bytes.toString('base64') !== hmacKey) return true
  }

  if (bytes.length !== 32) return true
  return false
}

function fatal(err) {
  err.fatal = true
  return err
}

exports.checkInvalidCheap = function (state, msg) {
  //the message is just invalid
  if(!ref.isFeedId(msg.author))
    return new Error('invalid message: must have author')
  if(!isSigMatchesCurve(msg))
    return new Error('invalid message: signature type must match author type')

  //state is id, sequence, timestamp
  if(state) {
    //most likely, we just tried to append two messages twice
    //or append another message after an error.
    if(msg.sequence != state.sequence + 1)
      return new Error('invalid message: expected sequence ' + (state.sequence + 1) + ' but got:'+ msg.sequence + 'in state:'+JSON.stringify(state)+', on feed:'+msg.author)
    //if we have the correct sequence and wrong previous,
    //this must be a fork!
    if(msg.previous != state.id)
      return fatal(new Error('invalid message: expected different previous message, on feed:'+msg.author))
    //and check type, and length, and some other stuff. finally check the signature.
  }
  else {
    if(msg.previous !== null)
      return fatal(new Error('initial message must have previous: null, on feed:'+msg.author))
    if(msg.sequence !== 1)
      return fatal(new Error('initial message must have sequence: 1, on feed:'+msg.author))
    if('number' !== typeof msg.timestamp)
      return fatal(new Error('initial message must have timestamp, on feed:'+msg.author))
  }
  if(!isValidOrder(msg, true))
    return fatal(new Error('message must have keys in allowed order'))

  return isInvalidShape(msg)
}

exports.checkInvalid = function (state, hmac_key, msg) {
  var err = exports.checkInvalidCheap(state, msg)
  if(err) return err

  if (isInvalidHmacKey(hmac_key)) {
    return fatal(new Error('invalid HMAC key'))
  }
  if(!ssbKeys.verifyObj({public: msg.author.substring(1)}, hmac_key, msg))
    return fatal(new Error('invalid signature'))
  return false //not invalid
}

/*
{
  //an array of messages which have been validated, but not written to the database yet.
  valid: [],
  //a map of information needed to know if something should be appeneded to the valid queue.
  feeds: {
    <feed>: {id, sequence, ts}
  },
  error: null
}
*/

exports.queue = function (state, msg) {
  state.error = exports.checkInvalidCheap(flatState(state.feeds[msg.author]), msg)

  if(state.error)
    return state
  state.feeds[msg.author] = state.feeds[msg.author] || {
    id: null, sequence: null, timestamp: null, queue: []
  }
  state.queued += 1
  state.feeds[msg.author].queue.push(exports.toKeyValueTimestamp(msg))
  return state
}

exports.toKeyValueTimestamp = function (msg, id) {
  return {
    key: id ? id : exports.id(msg),
    value: msg,
    timestamp: timestamp()
  }
}

function flatState (fstate) {
  if(!fstate) return null
  if(fstate.queue.length) {
    var last = fstate.queue[fstate.queue.length - 1]
    return {
      id: last.key,
      timestamp: last.value.timestamp,
      sequence: last.value.sequence
    }
  }
  else
    return fstate
}

exports.appendKVT = function (state, hmac_key, kvt) {
  var err
  var msg_id = kvt.key
  var msg = kvt.value
  var _state = flatState(state.feeds[msg.author])
  err = exports.checkInvalid(_state, hmac_key, msg)

  if(err)
    throw err
  else if(state.feeds[msg.author]) {
    var a = state.feeds[msg.author]
    a.id = msg_id
    a.sequence = msg.sequence
    a.timestamp = msg.timestamp
    var q = state.feeds[msg.author].queue
    state.validated += q.length
    state.queued -= q.length
    for (var i = 0; i < q.length; ++i)
      state.queue.push(q[i])
    q = []
  }
  else if(msg.sequence === 1) {
    state.feeds[msg.author] = {
      id: msg_id,
      sequence: msg.sequence,
      timestamp: msg.timestamp,
      queue: []
    }
  }

  state.queue.push(kvt)
  state.validated += 1
  return state
}

exports.append = function (state, hmac_key, msg) {
  return exports.appendKVT(state, hmac_key, exports.toKeyValueTimestamp(msg))
}

exports.checkInvalidOOO = function(msg, hmac_key) {
  if(!ref.isFeedId(msg.author))
    return new Error('invalid message: must have author')
  if(!isSigMatchesCurve(msg))
    return new Error('invalid message: signature type must match author type')
  if('number' !== typeof msg.timestamp)
    return fatal(new Error('message must have timestamp, on feed:'+msg.author))
  if(!isValidOrder(msg, true))
    return fatal(new Error('message must have keys in allowed order'))
  if (isInvalidShape(msg))
    return fatal(new Error('message has invalid shape'))
  if (isInvalidHmacKey(hmac_key))
    return fatal(new Error('invalid HMAC key'))
  if(!ssbKeys.verifyObj({public: msg.author.substring(1)}, hmac_key, msg))
    return fatal(new Error('invalid signature'))

  return false // ok
}

exports.appendOOO = function(state, hmac_key, msg) {

  state.error = exports.checkInvalidOOO(msg, hmac_key)
  if (state.error)
    return state

  var kvt = exports.toKeyValueTimestamp(msg)

  if (!state.feeds[msg.author]) {
    state.feeds[msg.author] = {
      id: kvt.key,
      sequence: msg.sequence,
      timestamp: msg.timestamp,
      queue: []
    }
  }

  state.queue.push(kvt)
  state.validated += 1
  return state
}

exports.validate = function (state, hmac_key, feed) {
  if(!isFeedId(feed)) throw new Error('validate takes a feedId')
  if(!state.feeds[feed] || !state.feeds[feed].queue.length) {
    return state
  }
  var kvt = state.feeds[feed].queue.pop()
  state.queued -= 1
  return exports.appendKVT(state, hmac_key, kvt)
}

//pass in your own timestamp, so it's completely deterministic
exports.create = function (state, keys, hmac_key, content, timestamp) {
  if(timestamp == null || isNaN(+timestamp)) throw new Error('timestamp must be provided')

  if(!isObject(content) && !isEncrypted(content))
    throw new Error('invalid message content, must be object or encrypted string')

  state = flatState(state)

  var msg = {
    previous: state ? state.id : null,
    sequence: state ? state.sequence + 1 : 1,
    author: keys.id,
    timestamp: +timestamp,
    hash: 'sha256',
    content: content
  }

  var err = isInvalidShape(msg)
  if(err) throw err
  return ssbKeys.signObj(keys, hmac_key, msg)
}

exports.id = function (msg) {
  return '%'+ssbKeys.hash(JSON.stringify(msg, null, 2))
}

exports.appendNew = function (state, hmac_key, keys, content, timestamp) {
  var msg = exports.create(state.feeds[keys.id], keys, hmac_key, content, timestamp)
  state = exports.append(state, hmac_key, msg)
  return state
}
