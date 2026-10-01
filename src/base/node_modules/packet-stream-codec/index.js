const Through = require('pull-through')
const Reader = require('pull-reader')
const Debug = require('debug')

const BUFFER = 0
const STRING = 1
const OBJECT = 2

const GOODBYE = 'GOODBYE'

function encodePair(msg) {
  let head = Buffer.alloc(9)
  let flags = 0
  let body = msg.value !== undefined ? msg.value : msg.end

  // final packet
  if (typeof msg === 'string' && msg === GOODBYE) {
    head.fill(0)
    return [head, null]
  }

  if (typeof body === 'string') {
    flags = STRING
    body = Buffer.from(body, 'utf-8')
  } else if (Buffer.isBuffer(body)) {
    flags = BUFFER
  } else {
    flags = OBJECT
    body = Buffer.from(JSON.stringify(body), 'utf-8')
  }

  // does this frame represent a msg, a req, or a stream?

  // end, stream

  flags = (msg.stream << 3) | (msg.end << 2) | flags

  head[0] = flags

  head.writeUInt32BE(body.length, 1)
  head.writeInt32BE(msg.req || 0, 5)

  return [head, body]
}

function decodeHead(bytes) {
  if (bytes.length !== 9) throw new Error('expected header to be 9 bytes long')
  const flags = bytes[0]
  const length = bytes.readUInt32BE(1)
  const req = bytes.readInt32BE(5)

  return {
    req: req,
    stream: !!(flags & 8),
    end: !!(flags & 4),
    value: null,
    length: length,
    type: flags & 3,
  }
}

function decodeBody(bytes, msg) {
  if (bytes.length !== msg.length)
    throw new Error(
      'incorrect length, expected:' + msg.length + ' found:' + bytes.length
    )
  if (msg.type === BUFFER) msg.value = bytes
  else if (msg.type === STRING) msg.value = bytes.toString()
  else if (msg.type === OBJECT) msg.value = JSON.parse(bytes.toString())
  else throw new Error('unknown message type')
  return msg
}

function encode(debug) {
  return Through(function pscEncodeHeadAndBody(data) {
    if (debug) debug('encoded: %o', data)
    const [head, body] = encodePair(data)
    this.queue(head)
    if (body !== null) this.queue(body)
  })
}

function decode(debug) {
  const reader = Reader()
  let ended = false

  return function pscDecodeReader(read) {
    reader(read)

    return function pscDecodeRead(abort, cb) {
      if (ended) return cb(true)
      if (abort) return reader.abort(abort, cb)
      reader.read(9, function pscDecodeHead(err, head) {
        if (err) return cb(err)
        const msg = decodeHead(head)
        if (msg.length === 0) {
          // final packet
          ended = true
          return cb(null, GOODBYE)
        }
        reader.read(msg.length, function pscDecodeBody(err, body) {
          if (err) return cb(err)
          try {
            decodeBody(body, msg)
          } catch (e) {
            return cb(e)
          }
          if (debug) debug('decoded: %o', msg)
          cb(null, msg)
        })
      })
    }
  }
}

exports = module.exports = function packetStreamCodec(stream, debugEnabled) {
  const debug =
    debugEnabled === true
      ? Debug('packet-stream-codec')
      : typeof debugEnabled === 'string'
      ? Debug(debugEnabled)
      : null

  return {
    source: encode(debug)(stream.source),
    sink(read) {
      return stream.sink(decode(debug)(read))
    },
  }
}

exports.encodePair = encodePair
exports.decodeHead = decodeHead
exports.decodeBody = decodeBody

exports.encode = encode
exports.decode = decode
