const tape = require('tape')
const bfe = require('../')

tape('04 signature type', function (t) {
  const values = [
    'az18LEvCgji1zqpAF/JcTool+y69WhyLVesvWcrnyj5pFJymXKALZ7zUDRuxOcBGr+wU4v6zN/+b3tAYsz+zBg==.sig.ed25519',
  ]
  const encoded = bfe.encode(values)

  t.deepEqual(encoded[0].slice(0, 2), Buffer.from([4, 0]), 'detected signature')

  t.deepEqual(bfe.decode(encoded), values, 'properly decoded')

  /* unhappy paths */
  t.throws(() => bfe.encode('ZG9n.sig.bob'), 'base64 + .sig.unknown throws')
  t.throws(
    () => bfe.decode(Buffer.from([4, 200, 21])), // type 200 DNE
    'unknown signature type decode throws'
  )

  t.end()
})
