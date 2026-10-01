var assert = require('assert')
var setTimeout = require('timers').setTimeout

var para = require('./index.js')

function delay(time, value) {
    return function (cb) {
        setTimeout(function () {
            cb(null, value)
        }, time)
    }
}

testOne()

function testOne() {
    para({
        a: delay(100, 'a'),
        b: delay(50, 'b')
    }, function (err, result) {
        assert.ifError(err)
        assert.deepEqual(result, { a: 'a', b: 'b' })

        para({
            a: delay(100, 'a'),
            b: delay(50, 'b')
        })(function (err, result) {
            assert.ifError(err)
            assert.deepEqual(result, { a: 'a', b: 'b' })

            testTwo()
        })
    })
}

function testTwo() {
    para([
        delay(100, 'a'),
        delay(50, 'b')
    ], function (err, result) {
        assert.ifError(err)
        assert.deepEqual(result, ['a', 'b'])

        para([
            delay(100, 'a'),
            delay(50, 'b')
        ])(function (err, result) {
            assert.ifError(err)
            assert.deepEqual(result, ['a', 'b'])

            testThree()
        })
    })
}

function testThree() {
    para(
        delay(100, 'a'),
        delay(50, 'b')
    )(function (err, result) {
        assert.ifError(err)
        assert.deepEqual(result, ['a', 'b'])

        end()
    })
}

function end() {
    console.log('ok')
}
