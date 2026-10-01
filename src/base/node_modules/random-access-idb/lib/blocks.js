module.exports = function (size, start, end) {
  var result = []
  for (var n = Math.floor(start/size)*size; n < end; n += size) {
    result.push({
      block: Math.floor(n/size),
      start: Math.max(n,start) % size,
      end: Math.min(n+size,end) % size || size
    })
  }
  return result
}
