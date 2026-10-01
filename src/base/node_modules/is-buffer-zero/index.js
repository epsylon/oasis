let blank = Buffer.alloc(8192)

function realloc(len) {
  let size = blank.length
  while (len > size) size *= 2
  blank = Buffer.alloc(size)
}

function isZeroBuffer(buf, peekLength = 8) {
  if (buf.length > blank.length) realloc(buf.length)
  if (peekLength) {
    const len = Math.min(peekLength, buf.length)
    for (let i = 0; i < len; ++i)
      if (buf[i] !== 0) return false
  }
  return buf.compare(blank, 0, buf.length) === 0
}

module.exports = isZeroBuffer
