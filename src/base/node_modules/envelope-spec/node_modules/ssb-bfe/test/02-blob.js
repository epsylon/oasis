const tape = require('tape')
const bfe = require('../')

tape('02 blob type ', function (t) {
  const values = ['&s7+cwhm6dz9si5vn4ftpk/l/ldbrmqzzjos+spzbwf4=.sha256']

  const encoded = bfe.encode(values)

  t.deepEquals(encoded[0].slice(0, 2), Buffer.from([2, 0]), 'classic blob')

  t.deepEquals(bfe.decode(encoded), values, 'decode works')

  /* unhappy paths */
  const unknownBlobId = '&' + Buffer.from('dog').toString('base64') + '.dog255'
  t.throws(() => bfe.encode(unknownBlobId), 'unknown blobId encode throws')
  t.throws(
    () => bfe.decode(Buffer.from([2, 200, 21])), // type 200 DNE
    'unknown blob type decode throws'
  )

  t.end()
})
