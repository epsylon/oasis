
module.exports = function split (data, max) {

  if(max <= 0) throw new Error('cannot split into zero (or smaller) length buffers')

  if(data.length <= max)
    return [data]
  var out = [], len = 0

  while(len < data.length) {
    out.push(data.slice(len, Math.min(len + max, data.length)))
    len += max
  }

  return out
}

