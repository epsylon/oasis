/* eslint-disable camelcase */
const error_codes = require('envelope-spec/error_codes.json')

module.exports = function envelopeError (code) {
  if (!(code in error_codes)) {
    throw new Error(`trying to throw error with unknown code: ${code}`)
  }

  const error = new Error(`${code}: ${error_codes[code]}`)
  error.code = code

  return error
}
