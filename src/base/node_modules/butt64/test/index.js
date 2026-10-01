/* eslint-disable camelcase */

const tape = require('tape')
const crypto = require('crypto')
const Butt64 = require('../')
const { bufferToButt64, butt64ToBuffer } = Butt64

tape('basic use', t => {
  const regex = new Butt64()

  const b = Buffer.alloc(4)
  const b1 = b.slice(1)
  const b2 = b.slice(2)

  let allGood = true
  for (let i = 0; i < 1 << 16; i++) {
    b.writeUInt32BE(i, 0)

    const errors = []
    if (!regex.test(bufferToButt64(b))) errors.push(bufferToButt64(b) + ', ' + i + ' is canonical butt64')
    if (!regex.test(bufferToButt64(b1))) errors.push(bufferToButt64(b1) + ', ' + i + ' is canonical butt64')
    if (!regex.test(bufferToButt64(b2))) errors.push(bufferToButt64(b2) + ', ' + i + ' is canonical butt64')

    if (errors.length) {
      allGood = false
      errors.forEach(error => t.fail(error))
    }
  }
  t.true(allGood, 'buffers up to ' + (1 << 16) + ' behave correctly')

  allGood = true
  function assertConsistentWithToString (str) {
    // if this is the same as it would be pased as, it's canonical
    const isCanonical = str === bufferToButt64(butt64ToBuffer(str))

    if (isCanonical !== regex.test(str)) {
      allGood = false
      t.fail('problem with ' + str)
    }
  }
  for (let i = 0; i < 1000; i++) {
    const s = bufferToButt64(crypto.randomBytes(8))
    assertConsistentWithToString(s.substring(0, 6) + '==')
    assertConsistentWithToString(s.substring(0, 7) + '=')
    // this should always be canonical
    assertConsistentWithToString(s.substring(0, 8))
  }
  t.true(allGood, 'random buffers behave correctly')

  t.end()
})

tape('opts: length', t => {
  const regex_4 = new Butt64(null, null, 4)
  const regex_3 = new Butt64(null, null, 3)
  const regex_2 = new Butt64(null, null, 2)

  const b = Buffer.alloc(4)
  const b1 = b.slice(1)
  const b2 = b.slice(2)

  let allGood = true
  for (let i = 0; i < 1 << 16; i++) {
    b.writeUInt32BE(i, 0)

    const errors = []
    if (!regex_4.test(bufferToButt64(b))) errors.push(bufferToButt64(b) + ', ' + i + ' is canonical 4 byte butt64')
    if (!regex_3.test(bufferToButt64(b1))) errors.push(bufferToButt64(b1) + ', ' + i + ' is canonical 3 byte butt64')
    if (!regex_2.test(bufferToButt64(b2))) errors.push(bufferToButt64(b2) + ', ' + i + ' is canonical 2 byte butt64')

    if (errors.length) {
      allGood = false
      errors.forEach(error => t.fail(error))
    }
  }
  t.true(allGood, 'buffers up to ' + (1 << 16) + ' behave correctly')

  t.end()
})
