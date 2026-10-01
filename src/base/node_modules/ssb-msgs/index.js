var ref = require('ssb-ref')

function isObject (o) { return o && 'object' === typeof o }
function isBool (o) { return 'boolean' === typeof o }
function isString (s) { return 'string' === typeof s }

function toArray (v, force) {
  if (Array.isArray(v))
    return v

  // maybe it's an array-like object? (object with ordered numeric keys)
  var i=0, arr=[]
  if (isObject(v)) {
    while (v[i]) {
      arr[i] = v[i]
      i++
    }
    if (Object.keys(arr).length > 0)
      return arr // it was!
  }

  // it wasnt...
  if (force) {
    // ...just put v in the arr
    arr.push(v)
    return arr
  }
  return v
}

// given any part of the message-obj hierarchy, pull out the content-object
// - uses ducktyping to find the content
function toMsgContent (obj) {
  if (!obj)
    return null
  if (obj.value && obj.value.content && obj.value.content.type)
    return obj.value.content
  if (obj.content && obj.content.type)
    return obj.content
  return obj
}

function traverse (obj, each) {
  for (var k in obj) {
    if (!obj[k])
      continue
    var arr = toArray(obj[k], false)
    if (Array.isArray(arr)) {
      arr.forEach(function (v) {
        each(v, k)
      })
    } else
      each(obj[k], k)
  }
}

// iterate links in the message
exports.indexLinks = function (message, opts, each) {
  if (typeof opts == 'function') {
    each = opts
    opts = null
  }
  if (typeof opts == 'string')
    opts = { rel: opts }
  if (!opts)
    opts = {}
  var msg  = opts.msg
  var feed = opts.feed
  var blob = opts.blob
  var any  = !(msg || feed || blob)

  traverse(toMsgContent(message), function (obj, rel) {
    if (opts.rel && rel !== opts.rel) return

    var r = (typeof obj == 'string') ? obj : obj.link
    if (any) {
      if (!ref.isLink(r)) return
    } else {
      if (msg) {
        if (isBool(msg) && ref.type(r) != 'msg') return 
        if (!isBool(msg) && r != msg) return
      }

      if (feed) {
        if (isBool(feed) && ref.type(r) != 'feed') return 
        if (!isBool(feed) && r != feed) return
      }

      if (blob) {
        if (isBool(blob) && ref.type(r) != 'blob') return 
        if (!isBool(blob) && r != blob) return
      }
    }

    each((typeof obj == 'string') ? { link: obj } : obj, rel)
  })
}

// coerce to link object, optionally of a given type
// null if coersion fails
exports.link =
exports.asLink = function (obj, type) {
  if (!obj)
    return null
  if (isString(obj))
    obj = { link: obj }
  return isLink(obj, type) ? obj : null
}

// coerce to links array, optionally of a given type
// filters out failed coersions
exports.links =
exports.asLinks = function (obj, type) {
  if (!obj)
    return []
  var arr = toArray(obj, true)
  return arr
    .filter(function (l) { return isLink(l, type) })
    .map(function (o) { return (typeof o == 'string') ? { link: o } : o })
}

// detects whether the given string/object is a link
// - `type` optional
var isLink =
exports.isLink = function (obj, type) {
  if (!obj)
    return false
  var r = (isString(obj)) ? obj : obj.link
  return (type) ? (ref.type(r) == type) : ref.isLink(r)
}

function indexLinksTo (msgA, msgB, each) {
  if (!msgA || !msgB || !msgB.key)
    return
  exports.indexLinks(msgA, function (l, rel) {
    if (l.link === msgB.key)
      each(l, rel)
  })
}

// iterate `msgA` and find all links to `msgB`, returning an array of the link objects
exports.linksTo = function (msgA, msgB) {
  var links = []
  indexLinksTo(msgA, msgB, function (link, rel) {
    links.push(link)
  })
  return links
}

// iterate `msgA` and find all links to `msgB`, returning an array of the link rels 
exports.relationsTo = function (msgA, msgB) {
  var rels = []
  indexLinksTo(msgA, msgB, function (link, rel) {
    rels.push(rel)
  })
  return rels
}