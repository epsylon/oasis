var S = require('pull-stream/pull')
var map = require('pull-stream/throughs/map')
var flatMerge = require('./')

function chain (predicate, onEnd) {
    return S(
        map(predicate),
        flatMerge(onEnd)
    )
}

module.exports = chain
