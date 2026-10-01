
module.exports = {
  encode: JSON.stringify,
  decode: function (data) { return JSON.parse(data.toString()) },
  buffer: false
}



