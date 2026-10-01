var maybeCallback = require("continuable/maybe-callback")

module.exports = maybeCallback(hash)

//  hash := (tasks:Object<String, Continuable<T>>)
//      => Continuable<Object<String, T>>
function hash(tasks) {
    return function continuable(callback) {
        var keys = Object.keys(tasks)
        var count = 0
        var result = {}

        if (keys.length === 0) {
            return callback(null, result)
        }

        keys.forEach(function (key) {
            tasks[key](function (err, value) {
                if (err && result) {
                    result = null
                    callback(err)
                } else if (!err && result) {
                    result[key] = value
                    if (++count === keys.length) {
                        callback(null, result)
                    }
                }
            })
        })
    }
}
