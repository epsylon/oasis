var isMsgRef = require('ssb-ref').isMsg

//messages in thread that are not referenced by another message in the thread.
function heads (thread) {
  var counts = messages(thread)

  thread.forEach(function (msg) {
    links(msg.value, function (link) {
      counts[link] = 0
    })
  })
  var ary = []
  for(var k in counts) if(counts[k] !== 0) ary.push(k)
  return ary.sort()
}

function roots (thread) {
  sort(thread)
  var counts = messages(thread)

  thread.forEach(function (msg) {
    links(msg.value, function (link) {
      if(counts[link]) counts[msg.key] = 2
    })
  })

  var ary = []
  for(var k in counts) if(counts[k] === 1) ary.push(k)
  return ary
}

function sort (thread) {
  var dict = arrayToDict(thread)
  function compare(a, b) {
    return ancestorOf(a, b, dict) ? 1 : ancestorOf(b, a, dict) ? -1 : 0
  }

  return thread.sort(function (a, b) {
    return (
      compare(a, b)
      //received timestamp, may not be present
      || a.timestamp - b.timestamp
      //declared timestamp, may by incorrect or a lie
      || a.value.timestamp - b.value.timestamp
      //finially, sort hashes lexiegraphically.
      || (a.key > b.key ? -1 : a.key < b.key ? 1 : 0)
    )
  })
}

function ancestors (thread, start, isTarget) {
  if(Array.isArray(thread))
    thread = arrayToDict(thread)
  start = isString(start) ? start : start.key
  var seen = {}
  function traverse (key) {
    if(seen[key]) return
    seen[key] = true
    if(isTarget(thread[key], key)) return true
    return links(thread[key], function (link) {
      if(thread[link]) return traverse(link)
    })
  }

  return traverse(start)
}

function ancestorOf (a, b, thread) {
  return ancestors(thread, a.key, function (_b, k) {
    return b.key === k
  })
}

function missingContext (thread) {
  var dict = arrayToDict(thread)
  var results = {}

  thread.forEach(function (msg) {
    const noLineage = thread
      .filter(function (m) { return m.key !== msg.key })
      .map(function (m) {
        return areCausallyLinked(m, msg)
          ? null  // if it's an ancestor, that's all good
          : m     // if it's not an ancestor, bingo!
      })
      .filter(Boolean)

    if (noLineage.length) results[msg.key] = noLineage
  })
  return results

  function areCausallyLinked (a, b) {
    return ancestorOf(a, b, dict) || ancestorOf(b, a, dict)
  }
}

exports = module.exports = sort
exports.heads = heads
exports.roots = roots
exports.ancestors = ancestors
exports.missingContext = missingContext


// Utils ///////////////////////////////////

function links (obj, each) {
  if(isMsgRef(obj)) return each(obj)
  if(!obj || 'object' !== typeof obj) return
  for(var k in obj)
    if(links(obj[k], each)) return true
}

//used to initialize sort
function messages (thread) {
  var counts = {}

  for(var i = 0; i < thread.length; i++) {
    var key = thread[i].key
    if(counts[key])
      throw new Error('thread has duplicate message:'+key)
    counts[key] = 1
  }

  return counts
}

function arrayToDict (thread) {
  var o = {}
  thread.forEach(function (e) {
    o[e.key] = e.value
  })
  return o
}

function isString(s) { return 'string' === typeof s }

