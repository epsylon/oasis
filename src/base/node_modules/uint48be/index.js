var TWOPOW32 = 0x100000000

exports.encodingLength = function () {
  return 6
}

exports.encode = function (num, buf, offset) {
  if (!buf) buf = Buffer.alloc(6)
  if (!offset) offset = 0

  var top = Math.floor(num / TWOPOW32)
  var rem = num - top * TWOPOW32

  buf.writeUInt16BE(top, offset)
  buf.writeUInt32BE(rem, offset + 2)
  return buf
}

exports.decode = function (buf, offset) {
  if (!offset) offset = 0

  var top = buf.readUInt16BE(offset)
  var rem = buf.readUInt32BE(offset + 2)

  return top * TWOPOW32 + rem
}

exports.encode.bytes = 6
exports.decode.bytes = 6
