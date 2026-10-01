module.exports = read

const MSB = 0x80
const REST = 0x7f
const MATH_POW_4 = Math.pow(2, 4*7)
const MATH_POW_5 = Math.pow(2, 5*7)
const MATH_POW_6 = Math.pow(2, 6*7)
const MATH_POW_7 = Math.pow(2, 7*7)

function read(buf, offset) {
  offset = offset || 0

  let b = buf[offset]
  let res = 0

  res += b & REST
  if (b < MSB) {
    read.bytes = 1
    return res
  }

  b = buf[offset + 1]
  res += (b & REST) << 7
  if (b < MSB) {
    read.bytes = 2
    return res
  }

  b = buf[offset + 2]
  res += (b & REST) << 14
  if (b < MSB) {
    read.bytes = 3
    return res
  }
  
  b = buf[offset + 3]
  res += (b & REST) << 21
  if (b < MSB) {
    read.bytes = 4
    return res
  }

  b = buf[offset + 4]
  res += (b & REST) * MATH_POW_4
  if (b < MSB) {
    read.bytes = 5
    return res
  }

  b = buf[offset + 5]
  res += (b & REST) * MATH_POW_5
  if (b < MSB) {
    read.bytes = 6
    return res
  }

  b = buf[offset + 6]
  res += (b & REST) * MATH_POW_6
  if (b < MSB) {
    read.bytes = 7
    return res
  }

  b = buf[offset + 7]
  res += (b & REST) * MATH_POW_7
  if (b < MSB) {
    read.bytes = 8
    return res
  }
  
  read.bytes = 0
  throw new RangeError('Could not decode varint')
}
