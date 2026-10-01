module.exports = function slpEncode (arr) {
  const length = arr.map(x => 2 + x.length).reduce((sum, x) => sum + x, 0)
  const output = Buffer.alloc(length)
  let index = 0

  arr.forEach(el => {
    if (!Buffer.isBuffer(el)) throw new Error(`slp.encode expects Buffers, got ${el}`)

    const len = el.length
    output.writeInt16LE(len, index)
    el.copy(output, index + 2)
    index += 2 + len
  })

  return output
}
