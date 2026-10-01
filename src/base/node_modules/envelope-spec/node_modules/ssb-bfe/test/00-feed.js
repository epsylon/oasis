const tape = require('tape')
const bfe = require('../')

const { bfeNamedTypes, bfeTypes } = bfe

tape('00 feed type', function (t) {
  const values = [
    '@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.ed25519', // classic
    '@6CAxOI3f+LUOVrbAl0IemqiS7ATpQvr9Mdw9LC4+Uv0=.bbfeed-v1', // bendy-butt
  ]

  const encoded = bfe.encode(values)

  t.deepEquals(encoded[0].slice(0, 2), Buffer.from([0, 0]), 'classic feed')
  t.deepEquals(encoded[1].slice(0, 2), Buffer.from([0, 3]), 'bendy feed')

  t.deepEquals(bfe.decode(encoded), values, 'decode works')

  /* unhappy paths */
  const unknownFeedId = '@' + Buffer.from('dog').toString('base64') + '.dog255'
  t.throws(() => bfe.encode(unknownFeedId), 'unknown feedId encode throws')
  t.throws(
    () => bfe.decode(Buffer.from([0, 200, 21])), // type 200 DNE
    'unknown feed type decode throws'
  )

  /* MISC function */
  const FEED = bfeNamedTypes['feed'] // eslint-disable-line
  t.equal(FEED.formats['ssb/classic'].data_length, 32, '32 bytes')

  const classicKeyLength = bfeTypes[0].formats[0].data_length
  t.equal(classicKeyLength, 32, '32 bytes')
  t.end()
})
