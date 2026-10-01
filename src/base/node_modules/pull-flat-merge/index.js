var S = require('pull-stream/pull')
var once = require('pull-stream/sources/once')
S.drain = require('pull-stream/sinks/drain')
var many = require('pull-many')

module.exports = function flatMerge (onErr) {
    return function sink (source) {
        var m = many()
        S(source, S.drain(function onEvent (s) {
            if (typeof s !== 'function') return m.add(once(s))
            m.add(s)
        }, function onEnd (err) {
            m.cap()
            if (err) {
                if (onErr) onErr(err)
                else throw err
            }
        }))
        return m
    }
}

