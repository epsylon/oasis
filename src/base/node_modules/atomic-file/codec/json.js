module.exports = {
  encode: function (obj) {
    return JSON.stringify(obj, null, 2)
  },
  decode: function (b) {
    return JSON.parse(b.toString())
  }
}

