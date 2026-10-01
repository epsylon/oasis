const Notify = require('pull-notify')
const Dijkstra = require('dynamic-dijkstra')
const simple = require('dynamic-dijkstra/simple')
const Once = require('pull-stream/sources/once')
const pCont = require('pull-cont')

function isObject(o) {
  return o && 'object' === typeof o
}

function isEmpty(o) {
  for (let k in o) return false
  return true
}

function isString(s) {
  return 'string' === typeof s
}

module.exports = function (options) {
  var d = Dijkstra(simple)
  var byName = {}
  var layers = []
  var notify = Notify()
  var listeners = []
  var graph = {}
  var _graph = {}
  var hops = {}
  var ready = 0
  var readyListeners = []
  var layered
  hops[options.start] = simple.initial()
  if (isNaN(options.max)) throw new Error('options.max must be provided')
  if (!isString(options.start))
    throw new Error('options.start must be provided')
  var isReady = {}

  return (layered = {
    createLayer: function (name) {
      var index = layers.push({}) - 1
      name = name || 'unnamed_' + index
      byName[name] = index
      ready++
      return function update(from, to, value) {
        if (isObject(from)) {
          var g = from
          layers[index] = g
          layers.forEach(function (g) {
            for (var j in g)
              for (var k in g[j]) {
                graph[j] = graph[j] || {}
                graph[j][k] = g[j][k]
              }
          })
          _graph = d.reverse(graph)
          hops = d.traverse(graph, _graph, options.max, options.start)
          notify(hops)
          if (!isReady[name]) {
            isReady[name] = true
            ready--
            if (ready === 0) {
              while (readyListeners.length) readyListeners.shift()()
            }
          }
        } else {
          layers[index][from] = layers[index][from] || {}
          layers[index][from][to] = value

          if (listeners.length)
            for (var i = 0; i < listeners.length; i++)
              listeners[i](from, to, value)

          //check if higher layer overrides this
          for (var i = index + 1; i < layers.length; i++)
            if (layers[i][from] && layers[i][from][to] != null) return

          // for a remove,
          // check if there is a higher layer to fall back to
          if (value === null) {
            for (var i = index - 1; i >= 0; i--)
              if (layers[i][from] && layers[i][from][to] != null) {
                value = layers[i][from][to]
                break
              }
          }
          //update the main graph, if a higher layer doesn't override this.
          var diff = d.update(
            graph,
            _graph,
            hops,
            options.max,
            options.start,
            from,
            to,
            value
          )
          if (diff && !isEmpty(diff)) notify(diff)
        }
        return layers[index] //return graph from this layer
      }
    },
    onReady: function (fn) {
      if (ready == 0) fn()
      else readyListeners.push(fn)
    },
    onEdge: function (fn) {
      listeners.push(fn)
      return function () {
        listeners.splice(listeners.indexOf(fn), 1)
      }
    },
    //find everyone that follows you - reverse!
    getHops: function (opts) {
      opts = opts || {}
      var _start = (opts && opts.start) || options.start
      var _max = opts.max || options.max
      if (opts.reverse === true) {
        return d.traverse(_graph, graph, _max, _start)
      } else {
        if (_start === options.start) {
          if (_max === options.max) return hops
          else if (_max < options.max) {
            var hops2 = {}
            for (var k in hops) if (hops[k] <= _max) hops2[k] = hops[k]
            return hops2
          } else return d.traverse(graph, _graph, _max, _start)
        } else return d.traverse(graph, _graph, _max, _start)
      }
    },
    hopStream: function (opts) {
      opts = opts || {}
      var live = opts.live === true
      var old = opts.old !== false
      var source
      if (live) {
        return pCont(function (cb) {
          layered.onReady(function () {
            source = notify.listen()
            if (old && !isEmpty(hops)) source.push(hops)
            cb(null, source)
          })
        })
      } else {
        return pCont(function (cb) {
          layered.onReady(function () {
            source = Once(hops)
            cb(null, source)
          })
        })
      }
    },
    getGraph: function (name) {
      if (name == null) return graph
      else return layers[byName[name]]
    },
    reset: function () {
      byName = {}
      layers = []
      graph = {}
      _graph = {}
      hops = {}
      ready = 0
      hops[options.start] = simple.initial()
      isReady = {}
    },
  })
}
