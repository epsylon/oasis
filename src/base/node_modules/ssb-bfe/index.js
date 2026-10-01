// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

// Following the BFE spec (formerly known as TFK), the naming convention in this
// file uses "T" to mean "Type byte", "TF" to mean "Type byte and Format byte"
// and "D" to mean "Data bytes".

const definitions = require('ssb-bfe-spec')
const SSBURI = require('ssb-uri2')
const { isExperimentalSSBURI, isAddressSSBURI } = SSBURI
const {
  decorateBFE,
  definitionsToDict,
  findTypeFormatForSigilSuffix,
} = require('./util')

const TYPES = decorateBFE(definitions)
const NAMED_TYPES = definitionsToDict(definitions)

function toTF(type, format) {
  if (!NAMED_TYPES[type]) {
    throw new Error('toTF() got unknown type: ' + type)
  }
  if (!NAMED_TYPES[type].formats[format]) {
    throw new Error('toTF() got unknown format: ' + format)
  }
  return Buffer.from([
    NAMED_TYPES[type].code,
    NAMED_TYPES[type].formats[format].code,
  ])
}

const STRING_TF = toTF('generic', 'string-UTF8')
const NIL_TF = toTF('generic', 'nil')
const BYTES_TF = toTF('generic', 'any-bytes')
const BOOL_TF = toTF('generic', 'boolean')
const BOOL_TRUE = Buffer.from([1])
const BOOL_FALSE = Buffer.from([0])

const isEncodedFnMaker = (type, format) => (input) => {
  const tf = toTF(type, format)
  const formatDetails = NAMED_TYPES[type].formats[format]
  return (
    Buffer.isBuffer(input) &&
    input.slice(0, 2).equals(tf) &&
    (!formatDetails.data_length ||
      input.length - 2 === formatDetails.data_length)
  )
}

function capitalCamelCase(str) {
  const camel = str.replace(/[-_](\w)/g, (m, c) => c.toUpperCase())
  return camel.charAt(0).toUpperCase() + camel.slice(1)
}

const isEncodedFns = {}
for (const type of TYPES) {
  const typeName = capitalCamelCase(type.type)
  for (const format of type.formats) {
    const formatName = capitalCamelCase(format.format)
    isEncodedFns[`isEncoded${typeName}${formatName}`] = isEncodedFnMaker(
      type.type,
      format.format
    )
  }
  isEncodedFns[`isEncoded${typeName}`] = (input) => {
    for (const format of type.formats) {
      const formatName = capitalCamelCase(format.format)
      if (isEncodedFns[`isEncoded${typeName}${formatName}`](input)) {
        return true
      }
    }
    return false
  }
}

const encoder = {
  sigilSuffix(input, type, format) {
    let data = input
    if (format.sigil) data = data.slice(1)
    if (format.suffix) data = data.slice(0, -format.suffix.length)

    return Buffer.concat([type.code, format.code, Buffer.from(data, 'base64')])
  },

  ssbURI(input) {
    // These URIs do not have BFE counterparts, so treat them as strings:
    if (isAddressSSBURI(input) || isExperimentalSSBURI(input)) {
      return encoder.string(input)
    }

    const { type: typeName, format: formatName, data } = SSBURI.decompose(input)

    const type = NAMED_TYPES[typeName]
    if (!type) return encoder.string(input)
    const format = type.formats[formatName]
    if (!format) {
      throw new Error(
        `No encoder for type=${typeName} format=${formatName} for SSB URI ${input}`
      )
    }
    const d = Buffer.from(data, 'base64')

    if (format.data_length && d.length !== format.data_length) {
      throw new Error(
        `expected data to be length ${format.data_length}, but found ${d.length}`
      )
    }

    const tf = Buffer.from([type.code, format.code])
    return Buffer.concat([tf, d])
  },

  string(input) {
    return Buffer.concat([STRING_TF, Buffer.from(input, 'utf8')])
  },

  boolean(input) {
    const d = input ? BOOL_TRUE : BOOL_FALSE
    return Buffer.concat([BOOL_TF, d])
  },

  nil() {
    return NIL_TF // note this type contains no data
  },

  bytes(input) {
    return Buffer.concat([BYTES_TF, input])
  },
}

function encode(input) {
  // cases we don't encode
  if (input === undefined) {
    return input
  } else if (Number.isInteger(input)) {
    return input
  }

  // strings
  else if (typeof input === 'string') {
    if (input.startsWith('ssb:')) return encoder.ssbURI(input)

    /* looks for classic sigil/suffix matches */
    const { type, format } = findTypeFormatForSigilSuffix(input, TYPES)
    if (type) {
      if (format) return encoder.sigilSuffix(input, type, format)
      else {
        throw new Error(
          `No encoder for type=${type.type} format=? for string ${input}`
        )
      }
    }
    // not a sigil-suffix ref
    return encoder.string(input)
  }

  // boolean
  else if (typeof input === 'boolean') {
    return encoder.boolean(input)
  }

  // nil
  else if (input === null) {
    return encoder.nil()
  }

  // bytes
  else if (Buffer.isBuffer(input)) {
    return encoder.bytes(input)
  }

  // recursions
  else if (Array.isArray(input)) {
    return input.map((x) => {
      const y = encode(x)
      return y === undefined ? encoder.nil() : y
    })
  } else if (typeof input === 'object') {
    const output = {}
    for (const key in input) {
      const y = encode(input[key])
      if (y !== undefined) output[key] = y
    }
    return output
  }

  // unknown
  else {
    throw new Error('No encoder for input ' + input)
  }
}

const decoder = {
  ssbURI(input, type, format) {
    const d = input.slice(2)
    const data = d.toString('base64')
    return SSBURI.compose({ type: type.type, format: format.format, data })
  },
  sigilSuffix(input, type, format) {
    const d = input.slice(2)
    return [format.sigil || '', d.toString('base64'), format.suffix || ''].join(
      ''
    )
  },

  string(input) {
    const d = input.slice(2)
    return d.toString('utf8')
  },

  bool(input) {
    if (input.size > 3) {
      throw new Error('Boolean BFE must be 3 bytes, was ' + input.size)
    }
    const d = input.slice(2)
    if (d.equals(BOOL_FALSE)) return false
    if (d.equals(BOOL_TRUE)) return true

    throw new Error('Invalid boolean BFE ' + input.toString('hex'))
  },

  bytes(input) {
    const d = input.slice(2)
    return d
  },
}

function decode(input) {
  // cases we don't decode
  if (input === null) {
    return null
  } else if (Number.isInteger(input)) {
    return input
  }

  // most values are buffers
  else if (Buffer.isBuffer(input)) {
    if (input.length < 2) {
      throw new Error(
        'Cannot decode buffer that is missing type & format fields: ' +
          input.toString('hex')
      )
    }

    const tf = input.slice(0, 2)
    if (tf.equals(NIL_TF)) return null
    else if (tf.equals(BOOL_TF)) return decoder.bool(input)
    else if (tf.equals(STRING_TF)) return decoder.string(input)
    else if (tf.equals(BYTES_TF)) return decoder.bytes(input)

    const t = input.slice(0, 1)
    const type = TYPES.find((type) => type.code.equals(t))
    if (type) {
      const f = input.slice(1, 2)
      const format = type.formats.find((format) => format.code.equals(f))
      if (format) {
        if (format.sigil || format.suffix) {
          return decoder.sigilSuffix(input, type, format)
        } else {
          return decoder.ssbURI(input, type, format)
        }
      } else {
        throw new Error(
          `No decoder for type=${type.type} format=<${f.toString(
            'hex'
          )}> for buffer ${input.toString('hex')}`
        )
      }
    }

    throw new Error('Cannot decode buffer ' + input.toString('hex'))
  }

  // recursions
  else if (Array.isArray(input)) {
    return input.map(decode)
  } else if (typeof input === 'object') {
    const output = {}
    for (const key in input) {
      output[key] = decode(input[key])
    }
    return output
  }

  // FIXME: more checks, including floats!

  // unknown
  else {
    throw new Error('Cannot decode input: ' + input)
  }
}

function decodeTypeFormat(input, typeName, formatName) {
  const tf = input.slice(0, 2)
  if (tf.equals(NIL_TF)) return null

  const type = NAMED_TYPES[typeName]
  const format = NAMED_TYPES[typeName].formats[formatName]

  if (format.sigil || format.suffix)
    return decoder.sigilSuffix(input, type, format)
  else return decoder.ssbURI(input, type, format)
}

module.exports = {
  encode,
  decode,
  decodeTypeFormat,
  bfeTypes: definitions,
  bfeNamedTypes: NAMED_TYPES,
  toTF,
  ...isEncodedFns,
}
