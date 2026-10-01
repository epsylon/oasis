const test = require('tape')
const { join } = require('path')

function fakeLocalCall(type, name, args) {
  console.error('CALLED', type, name, args)
  var cb = args.pop()
  cb(null, { okay: true })
}


var manifest = require('../example/manifest.json')
const plugPath = join(__dirname, '..', 'example')

test('standalone: kill from host', (t) => {

    var { proc, remoteCall } = require('../run')(plugPath, fakeLocalCall)
    var api = require('muxrpc/api')({}, manifest, remoteCall)

    api.callback('bob', (err, value) => {
        t.error(err, 'callback err')
        t.deepEqual(value, { okay: true })
        api.hello('DARRYL', (err, value) => {
            t.error(err, 'hello err')
            t.equal(value, 'hello DARRYL')
            proc.kill()
            t.end()
        })
    })
})

test('standalone: let child crash', (t) => {

    var { remoteCall } = require('../run')(plugPath, fakeLocalCall)
    var api = require('muxrpc/api')({}, manifest, remoteCall)

    api.callback('bob', (err, value) => {
        t.error(err, 'callback err')
        t.deepEqual(value, { okay: true })
        api.crash((err) => {
            t.true(err)
            t.equal(err.message, 'unexpected end of parent stream')
            t.end()
        })
    })
})

test('standalone: goodbye', (t) => {

    var { remoteCall } = require('../run')(plugPath, fakeLocalCall)
    var api = require('muxrpc/api')({}, manifest, remoteCall)

    api.callback('bob', (err, value) => {
        t.error(err, 'callback err')
        t.deepEqual(value, { okay: true })
        api.goodbye((err, done) => {
            t.error(err, 'goodbye worked')
            t.equal(done,'done')
            t.end()
        })
    })
})

