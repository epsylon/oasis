'use strict'
var uint48be = require('uint48be')
var int53 = require('int53')

module.exports = {
  32: {
    byteWidth: 4,
    encode: function(buf, value, offset) {
      buf.writeUInt32BE(value, offset)
    },
    decode: function(buf, offset) {
      return buf.readUInt32BE(offset)
    },
    decodeAsync: function(blocks, offset, cb) {
      blocks.readUInt32BE(offset, cb) 
    }
  },
  48: {
    byteWidth: 6,
    encode: function(buf, value, offset) {
      uint48be.encode(value, buf, offset)
    },
    decode: function(buf, offset) {
      return uint48be.decode(buf, offset)
    },
    decodeAsync: function(blocks, offset, cb) {
      blocks.readUInt48BE(offset, cb) 
    }
  },
  53: {
    byteWidth: 8,
    encode: function(buf, value, offset) {
      int53.writeUInt64BE(value, buf, offset)
    },
    decode: function(buf, offset) {
      return int53.readUInt64BE(buf, offset)
    },
    decodeAsync: function(blocks, offset, cb) {
      blocks.readUInt64BE(offset, cb)
    }
  }
}
