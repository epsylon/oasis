var tape = require('tape')
var ssbKeys = require('ssb-keys')

var seed = require('crypto').createHash('sha256').update('validation-test-seed').digest()
var keys = ssbKeys.generate('ed25519', seed)

var v = require('../')

tape('append ooo', function (t) {
  var hmac_key = null
  
  var state = v.initial()
  var msg = v.create(null, keys, hmac_key, {type: 'test'}, +new Date('2017-04-11 9:09 UTC'))

  state = v.append(state, hmac_key, msg)
  t.equal(state.validated, 1)
  
  var msg2 = v.create(state, keys, hmac_key, {type: 'test2'}, +new Date('2017-04-11 9:10 UTC'))

  var stateOOO = v.initial()

  stateOOO = v.appendOOO(stateOOO, hmac_key, msg2)
  t.equal(stateOOO.validated, 1)

  var invalidSignature = {
    previous: '%u5CkR2ik8jHMJFf0VY8STAY2+ou8C9kpRvmGOUEdr8A=.sha256',
    sequence: 2,
    author: '@dGm2+y3z0PCjt2Q08ruSFa7yh11g755dxZNjXWwxp90=.ed25519',
    timestamp: 1491901800000,
    hash: 'sha256',
    content: { type: 'test2' },
    signature:
    '/HAXhrhqHU6Zcmd3+CdiHgaoloXiVGPK3hB+6EiwoaMuC3PHv8TwfenWf8GIqptSrPJATyJfsdW1sMinqpirDA==.sig.ed25519'
  }

  var stateOOOSigError = v.appendOOO(v.initial(), hmac_key, invalidSignature)
  t.equal(stateOOOSigError.validated, 0)
  t.equal(stateOOOSigError.error.message, 'invalid signature')

  var missingPrevious = {
    sequence: 2,
    author: '@dGm2+y3z0PCjt2Q08ruSFa7yh11g755dxZNjXWwxp90=.ed25519',
    timestamp: 1491901800000,
    hash: 'sha256',
    content: { type: 'test2' },
    signature:
    '/IGohrhqHU6Zcmd3+CdiHgaoloXiVGPK3hB+6EiwoaMuC3PHv8TwfenWf8GIqptSrPJATyJfsdW1sMinqpirDA==.sig.ed25519'
  }

  var stateOOOError = v.appendOOO(v.initial(), hmac_key, missingPrevious)
  t.equal(stateOOOError.validated, 0)
  t.equal(stateOOOError.error.message, 'message must have keys in allowed order')

  t.end()
})
