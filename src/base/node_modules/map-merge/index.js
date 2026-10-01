
function isObject(o) {
  return o && 'object' === typeof o
}

var isArray = Array.isArray

function isUndefined (u) {
  return 'undefined' === typeof u
}

var find = exports.find = function find(ary, test) {
  for(var i in ary)
    if(test(ary[i], i, ary)) return ary[i]
}

exports = module.exports = merge
exports.merge = exports

var clone = exports.clone = function clone (obj, mapper) {
  function map(v, k) {
    return isObject(v) ? clone(v, mapper) : mapper(v, k)
  }
  if(isArray(obj))
    return obj.map(map)
  else if(isObject(obj)) {
    var o = {}
    for(var k in obj)
      o[k] = map(obj[k], k)
    return o
  }
  else
    return map(obj)
}

var mergeKeys = exports.mergeKeys = function (a, b, iter) {
  var o = {}
  for(var k in a) {
    if(!isUndefined(a[k]))
      o[k] = iter(a[k], b[k], k)
  }
  for(var k in b) {
    if(isUndefined(a[k]))
      o[k] = iter(undefined, b[k], k)
  }
  return o
}

var mergeArrays = exports.mergeArrays = function (a, b, iter) {
  var o = []
  a.forEach(function (v, i) {
    var j = b.indexOf(v)
    o.push(iter(v, b[j], o.length))
  })
  b.forEach(function (v, i) {
    var j = a.indexOf(v)
    if(!~j)
      o.push(iter(undefined, b[i], o.length))
  })
  return o
}

function merge (a, b, merge) {

  //merge a and b objects

  merge = merge || function (x, y) {
    return y == null ? x : y
  }

  function merger(a, b, k) {

    if(isArray(a) && isArray(b))
      return mergeArrays(a, b, merger)
    else if(isObject(a) && isObject(b)) {
      return mergeKeys(a, b, merger)
    }
    else
      return merge(a, b, k)

  }

  return merger(a, b, undefined)


}
