var maybeCallback = require("continuable/maybe-callback")

module.exports = maybeCallback(list)

//  list := (tasks:Array<Continuable<T>>)
//      => Continuable<Array<T>>
function list(tasks) {
    return function continuable(callback) {
        var result = []
        var count = 0

        if (tasks.length === 0) {
            return callback(null, result)
        }

        tasks.forEach(function invokeSource(source, index) {
            source(function continuation(err, value) {
                if (err && result) {
                    result = null
                    callback(err)
                } else if (!err && result) {
                    result[index] = value
                    if (++count === tasks.length) {
                        callback(null, result)
                    }
                }
            })
        })
    }
}
