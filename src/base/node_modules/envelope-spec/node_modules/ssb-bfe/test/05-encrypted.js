const tape = require('tape')
const bfe = require('../')

tape('05 encrypted type', function (t) {
  const values = [
    'oIogDumL0H7+2TzipPTqZXmwx+04i9aE2mCDOb+hE0Pe+b0pGW0BUdVafzHdiGuDq7/r6Bi8wcNXhYoB4bSMlhNrdK7FJ40VoqXITcEHFwiQTxrkFxhD35oh2+J2J73jxxSXRzvn1fFgu+E7t22WfMkyfh3VpZSYniuh297KzwQBPDA5pjBMskp4pnuMk0ZYcxaGUrP33Q==.box',
    'oIogDumL0H7+2TzipPTqZXmwx+04i9aE2mCDOb+hE0Pe+b0pGW0BUdVafzHdiGuDq7/r6Bi8wcNXhYoB4bSMlhNrdK7FJ40VoqXITcEHFwiQTxrkFxhD35oh2+J2J73jxxSXRzvn1fFgu+E7t22WfMkyfh3VpZSYniuh297KzwQBPDA5pjBMskp4pnuMk0ZYcxaGUrP33Q==.box2',
  ]
  const encoded = bfe.encode(values)

  t.deepEqual(encoded[0].slice(0, 2), Buffer.from([5, 0]), 'detected box')
  t.deepEqual(encoded[1].slice(0, 2), Buffer.from([5, 1]), 'detected box2')

  t.deepEqual(
    encoded[0].slice(2),
    Buffer.from(values[0].replace('.box', ''), 'base64'),
    'box1 encoded correctly'
  )
  t.deepEqual(
    encoded[1].slice(2),
    Buffer.from(values[1].replace('.box2', ''), 'base64'),
    'box2 encoded correctly'
  )

  t.deepEquals(bfe.decode(encoded), values, 'decode works')

  /* unhappy paths */
  const invalidValue = values[0] + 200
  t.throws(() => bfe.encode(invalidValue), 'unknown box encode throws')
  t.throws(
    () => bfe.decode(Buffer.from([5, 200, 21])), // type 200 DNE
    'unknown box type decode throws'
  )

  t.end()
})
