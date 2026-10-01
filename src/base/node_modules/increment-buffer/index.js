

module.exports = function (buf) {
  var len = buf.length, i

  for(i = len - 1; i >= 0 && buf[i] === 255; i--) buf[i] = 0
  if(~i) buf[i] = buf[i] + 1

  return buf
}
