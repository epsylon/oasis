
var tweetnacl = require('tweetnacl/nacl-fast')
var Sha256 = require('sha.js/sha256')
var ed2curve = require('ed2curve')
var auth = require('tweetnacl-auth')

//low order points that should not be allowed to scalarmult with:
var low_order = [
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0100000000000000000000000000000000000000000000000000000000000000', //1 in little endian
  'e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800',
  '5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f'
].map(function (e) {
  return Buffer.from(e, 'hex')
})

exports.crypto_hash_sha256 = function (msg) {
  return new Sha256().update(msg).digest()
}

function fix_keys(keys) {
  return {
    publicKey: new Buffer(keys.publicKey),
    secretKey: new Buffer(keys.secretKey),
  }
}

exports.crypto_sign_seed_keypair = function (seed) {
  return fix_keys(tweetnacl.sign.keyPair.fromSeed(seed))
}

exports.crypto_sign_keypair = function () {
  return fix_keys(tweetnacl.sign.keyPair())
}

exports.crypto_sign_detached = function (msg, skey) {
  return new Buffer(tweetnacl.sign.detached(msg, skey))
}

exports.crypto_sign = function (msg, sk) {
  return new Buffer(tweetnacl.sign(msg, sk))
}
exports.crypto_sign_open = function (ctxt, pk) {
  return new Buffer(tweetnacl.sign.open(ctxt, pk))
}

exports.crypto_sign_verify_detached = function (sig, msg, pkey) {
  return tweetnacl.sign.detached.verify(msg, sig, pkey)
}

exports.crypto_box_keypair = function () {
  return fix_keys(tweetnacl.box.keyPair())
}


exports.crypto_hash = function (msg) {
  return new Buffer(tweetnacl.hash(msg))
}

exports.crypto_secretbox_easy = function (msg, key, nonce) {
  return new Buffer(tweetnacl.secretbox(msg, key, nonce))
}

exports.crypto_secretbox_open_easy = function (ctxt, nonce, key) {
  var r = tweetnacl.secretbox.open(ctxt, nonce, key)
  return r ? new Buffer(r) : null
}

exports.crypto_sign_ed25519_pk_to_curve25519 = function (pk) {
  return new Buffer(ed2curve.convertPublicKey(pk))
}
exports.crypto_sign_ed25519_sk_to_curve25519 = function (sk) {
  return new Buffer(ed2curve.convertSecretKey(sk))
}

exports.crypto_box_easy = function (msg, nonce, pkey, skey) {
  return new Buffer(tweetnacl.box(msg, nonce, pkey, skey))
}

exports.crypto_box_open_easy = function (ctxt, nonce, pkey, skey) {
  var r = tweetnacl.box.open(ctxt, nonce, pkey, skey)
  return r ? new Buffer(r) : null
}

exports.crypto_scalarmult = function (sk, pk) {
  for(var i = 0; i < low_order.length; i++) {
    if(low_order[i].compare(pk) === 0) throw new Error('weak public key detected')
  }
  return new Buffer(tweetnacl.scalarMult(sk, pk))
}

//exports.crypto_auth = tweetnacl.auth
//exports.crypto_auth_verify = tweetnacl.auth.verify

exports.crypto_auth = function (msg, key) {
  return new Buffer(auth(msg, key))
}

exports.crypto_auth_verify = function (mac, msg, key) {
  var _mac = exports.crypto_auth(msg, key)
  var d = true
  //constant time comparson
  for(var i = 0; i < _mac.length; i++) {
    d = d && (_mac[i] === mac[i])
  }
  return +!d
}

exports.randombytes = function (buf) {
  var b = new Buffer(tweetnacl.randomBytes(buf.length))
  b.copy(buf)
  return null
}

