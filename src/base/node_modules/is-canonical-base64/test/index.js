var crypto = require('crypto')
var isCannonicalBase64 = require('../')()
var isCannonicalBase64_3 = require('../')('','',4)
var isCannonicalBase64_2 = require('../')('','',3)
var isCannonicalBase64_1 = require('../')('','',2)

var b = Buffer.alloc(4)
var b1 = b.slice(1)
var b2 = b.slice(2)
for(var i = 0; i < 1<<16; i++) {
  b.writeUInt32BE(i, 0)

  if(!isCannonicalBase64.test(b.toString('base64')))
    throw new Error(b.toString('base64')+', ' + i + 'was not cannonical base64')
  if(!isCannonicalBase64.test(b1.toString('base64')))
    throw new Error(b1.toString('base64')+', ' + i + 'was not cannonical base64')
  if(!isCannonicalBase64.test(b2.toString('base64')))
    throw new Error(b2.toString('base64')+', ' + i + 'was not cannonical base64')

  if(!isCannonicalBase64_3.test(b.toString('base64')))
    throw new Error(b.toString('base64')+', ' + i + 'was not cannonical 4 byte base64')
  if(!isCannonicalBase64_2.test(b1.toString('base64')))
    throw new Error(b1.toString('base64')+', ' + i + 'was not cannonical 3 byte base64')
  if(!isCannonicalBase64_1.test(b2.toString('base64')))
    throw new Error(b2.toString('base64')+', ' + i + 'was not cannonical 2 byte base64')

}

function assertConsistentWithToString (t) {
  //if this is the same as it would be pased as, it's cannonical
  var isCannonical = t === Buffer.from(t, 'base64').toString('base64')
  if(isCannonical !== isCannonicalBase64.test(t))
    throw new Error('problem')
}

for(var i = 0; i < 1000; i++) {
  var s = crypto.randomBytes(8).toString('base64')
  assertConsistentWithToString(s.substring(0, 6)+'==')
  assertConsistentWithToString(s.substring(0, 7)+'=')
  //this should always be cannonical
  assertConsistentWithToString(s.substring(0, 8))
}

console.log('passed')




