// Following the BFE spec (formerly known as TFK), the naming convention in this
// file uses "T" to mean "Type byte", "TF" to mean "Type byte and Format byte"
// and "D" to mean "Data bytes".

const definitions = require('./bfe.json')
const {
  decorateBFE,
  definitionsToDict,
  findTypeFormatForSigilSuffix,
} = require('./util')

const TYPES = decorateBFE(definitions)
const NAMED_TYPES = definitionsToDict(definitions)

const toTF = (type, format) =>
  Buffer.from([NAMED_TYPES[type].code, NAMED_TYPES[type].formats[format].code])

const STRING_TF = toTF('generic', 'UTF8 string')
const NIL_TF = toTF('generic', 'nil')
const BYTES_TF = toTF('generic', 'arbitrary bytes')
const BOOL_TF = toTF('generic', 'boolean')
const BOOL_TRUE = Buffer.from([1])
const BOOL_FALSE = Buffer.from([0])

const encoder = {
  boolean(input) {
    const d = input ? BOOL_TRUE : BOOL_FALSE
    return Buffer.concat([BOOL_TF, d])
  },
  sigilSuffix(input, type, format) {
    let data = input
    if (type.sigil) data = data.slice(1)
    if (format.suffix) data = data.slice(0, -format.suffix.length)

    return Buffer.concat([type.code, format.code, Buffer.from(data, 'base64')])
  },
  string(input) {
    return Buffer.concat([STRING_TF, Buffer.from(input, 'utf8')])
  },
  nil() {
    return NIL_TF // note this type contains no data
  },
  bytes(input) {
    return Buffer.concat([BYTES_TF, input])
  },
}

function encode(input) {
  /* cases we don't encode */
  if (input === undefined || Number.isInteger(input)) return input

  if (typeof input === 'string') {
    /* looks for classic sigil/suffix matches */
    const { type, format } = findTypeFormatForSigilSuffix(input, TYPES)
    if (type) {
      if (format) return encoder.sigilSuffix(input, type, format)
      else {
        throw new Error(
          `No encoder for type=${type} format=? for string ${input}`
        )
      }
    }

    /* fallback */
    return encoder.string(input)
  }

  if (typeof input === 'boolean') return encoder.boolean(input)
  if (input === null) return encoder.nil()
  if (Buffer.isBuffer(input)) return encoder.bytes(input)

  /* recursions */
  if (Array.isArray(input)) {
    return input.map((x) => {
      const y = encode(x)
      return y === undefined ? encoder.nil() : y
    })
  }
  if (typeof input === 'object') {
    // we have already checked it's not a Buffer/null/Array
    const output = {}
    for (const key in input) {
      const y = encode(input[key])
      if (y !== undefined) output[key] = y
    }
    return output
  }

  throw new Error('No encoder for input ' + input)
}

const decoder = {
  sigilSuffix(input, type, format) {
    const d = input.slice(2)
    return [type.sigil || '', d.toString('base64'), format.suffix || ''].join(
      ''
    )
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
  string(input) {
    const d = input.slice(2)
    return d.toString('utf8')
  },
  bytes(input) {
    const d = input.slice(2)
    return d
  },
}

function decode(input) {
  /* cases we don't decode */
  if (input === null) return null
  if (Number.isInteger(input)) return input

  if (Buffer.isBuffer(input)) {
    if (input.length < 2) {
      throw new Error(
        'Cannot decode buffer that is missing type & format fields: ' +
          input.toString('hex')
      )
    }

    const tf = input.slice(0, 2)
    if (tf.equals(NIL_TF)) return null
    if (tf.equals(BOOL_TF)) return decoder.bool(input)
    if (tf.equals(STRING_TF)) return decoder.string(input)
    if (tf.equals(BYTES_TF)) return decoder.bytes(input)

    const t = input.slice(0, 1)
    const type = TYPES.find((type) => type.code.equals(t))
    if (type) {
      const f = input.slice(1, 2)
      const format = type.formats.find((format) => format.code.equals(f))
      if (format) {
        if (type.sigil || format.suffix) {
          return decoder.sigilSuffix(input, type, format)
        } else {
          throw new Error(
            `No decoder for type=${type.type} format=${
              format.format
            } for buffer ${input.toString('hex')}`
          )
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

  /* recurse */
  if (Array.isArray(input)) return input.map(decode)
  if (typeof input === 'object') {
    // know it's not null, Array
    const output = {}
    for (const key in input) {
      output[key] = decode(input[key])
    }
    return output
  }

  // FIXME: more checks, including floats!
  throw new Error('Cannot decode input: ' + input)
}

module.exports = {
  encode,
  decode,
  bfeTypes: definitions,
  bfeNamedTypes: NAMED_TYPES,
}
