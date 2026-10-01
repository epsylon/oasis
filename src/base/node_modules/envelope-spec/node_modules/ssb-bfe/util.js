const IsCanonicalBase64 = require('is-canonical-base64')
const { isFeedType, isMsgType, isBlobType } = require('ssb-ref')

const encryptedTypeRegex = IsCanonicalBase64('', '\\.box\\d*')
const sigTypeRegex = IsCanonicalBase64('', '\\.sig\\.[a-zA-Z0-9]+')

const isEncryptedType = (input) => encryptedTypeRegex.test(input)
const isSigType = (input) => sigTypeRegex.test(input)

function decorateBFE(types) {
  const sigilSuffixRegexp = (type, format) => {
    if (!type.sigil && !format.suffix) return

    return IsCanonicalBase64(
      type.sigil || '',
      (format.suffix && format.suffix.replace('.', '\\.')) || '',
      format.key_length
    )
    // NOTE this assumes all sigil / suffic encodings are base64
  }

  return types.map((type) => {
    return {
      ...type,
      code: Buffer.from([type.code]),
      formats: type.formats.map((format) => {
        return {
          ...format,
          code: Buffer.from([format.code]),
          // TFCode: Buffer.from([type.code, format.code]),
          sigilSuffixRegexp: sigilSuffixRegexp(type, format),
        }
      }),
    }
  })
}

function findTypeFormatForSigilSuffix(input, types) {
  // NOTE tests guarentee that sigil is unique across types
  let type
  let format
  if (typeof input !== 'string') return { type, format }

  if (isFeedType(input)) type = types[0]
  else if (isMsgType(input)) type = types[1]
  else if (isBlobType(input)) type = types[2]
  else if (isEncryptedType(input)) type = types[5]
  else if (isSigType(input)) type = types[4]
  // first regexp match to narrow type

  if (type) {
    format = type.formats.find((format) => format.sigilSuffixRegexp.test(input))
    // second regexp check to be 100% sure of match

    return { type, format }
  }

  return { type, format }
}

function definitionsToDict(types) {
  const NAMED_TYPES = {}

  function convertFormats(type) {
    const formats = {}
    for (const format of type.formats) {
      formats[format.format] = format
    }

    return { ...type, formats }
  }

  for (const type of types) {
    NAMED_TYPES[type.type] = convertFormats(type)
  }

  return NAMED_TYPES
}

module.exports = {
  decorateBFE,
  findTypeFormatForSigilSuffix,
  definitionsToDict,
}
