const tape = require('tape')
const { bfeTypes } = require('../')

tape('bfe', function (t) {
  const sigiledTypes = bfeTypes.reduce((acc, type) => {
    if (type.sigil) return [...acc, type]
    return acc
  }, [])
  t.equal(
    sigiledTypes.length,
    new Set(sigiledTypes.map((type) => type.sigil)).size, // unique sigil
    'each sigil is unique to a type'
  )

  const sigiledFormats = bfeTypes.reduce((acc, type) => {
    if (type.sigil) return [...acc, ...type.formats]
    return acc
  }, [])
  t.true(
    sigiledFormats.every((f) => f.suffix),
    'every format with a sigil also has a suffix'
  )

  const sigillessSuffixFormats = bfeTypes.reduce((acc, type) => {
    if (type.sigil) return acc

    return [...acc, ...type.formats.filter((format) => format.suffix)]
  }, [])
  t.equal(
    sigillessSuffixFormats.length,
    new Set(sigillessSuffixFormats.map((type) => type.suffix)).size,
    'every suffix-only format is unique'
  )

  t.end()
})
