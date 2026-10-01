var test = require('tape')
var S = require('pull-stream')
var flatMerge = require('../')
var chain = require('../chain')

test('chain', function (t) {
    t.plan(2)

    S(
        S.values([1,2,3]),
        // return a stream that gets merged back in
        chain(function (n) {
            if (n === 1) {
                return S(
                    S.values([1]),
                    S.asyncMap(function (n, cb) {
                        process.nextTick(function () {
                            cb(null, n)
                        })
                    })
               )
            }

            return S.once(n + 1)
        }),
        S.collect(function (err, res) {
            t.error(err)
            t.deepEqual(res, [ 3, 4, 1 ], 'should flat map')
        })
    )

})

test('flat merge', function (t) {
    t.plan(2)
    var ss = S.values([
        S.values([1,2,3]),
        S.values(['a', 'b', 'c'])
    ])

    S(
        ss,
        flatMerge(),
        S.collect(function (err, evs) {
            t.error(err)
            t.deepEqual(evs, [1,'a',2,'b',3,'c'], 'should emit the events')
        })
    )
})

