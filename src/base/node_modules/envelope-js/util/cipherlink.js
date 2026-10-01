const na = require('sodium-universal')
const { bfeTypes } = require('ssb-bfe')

module.exports = class Cipherlink {
  constructor (opts = {}) {
    this.type = opts.type
    this.format = opts.format
    this.key = opts.key

    if (this.key) {
      const expected = bfeTypes[this.type].formats[this.format].data_length
      if (this.key.length !== expected) {
        throw new Error(`Cypherlink expected to have key of length ${expected} bytes, got ${this.key.length}`)
      }
    }
  }

  toBuffer () {
    return this.key
  }

  toTFK () {
    return Buffer.concat([
      Buffer.from([this.type]),
      Buffer.from([this.format]),
      this.key
    ])
  }

  // TODO in ssb-private2 can mutate prototype with Cipherlink.prototype.toSSB = ...
  // toSSB () {
  //   const { sigil, suffix } = bfeTypes[this.type].formats[this.format]

  //   return sigil + this.key.toString('base64') + suffix
  // }

  mock () {
    const bytes = (this.type === null && this.format === null)
      ? 32 //
      : bfeTypes[this.type].formats[this.format].data_length
    this.key = Buffer.alloc(bytes)
    na.randombytes_buf(this.key)

    return this
  }
}
