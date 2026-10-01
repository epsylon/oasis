const char = '[a-zA-Z0-9_-]'
const trail2 = '[AQgw]=='
const trail4 = '[AEIMQUYcgkosw048]='
const rx = '(?:' + char + '{4})*(?:' + char + '(?:(?:' + trail2 + ')|(?:' + char + trail4 + ')))?'

module.exports = class Butt64 extends RegExp {
  static bufferToButt64 (buf) {
    return buf.toString('base64')
      .replace(/\//g, '_').replace(/\+/g, '-')
  }

  static butt64ToBuffer (str) {
    return Buffer.from(
      str.replace(/_/g, '/').replace(/-/g, '+'),
      'base64'
    )
  }

  constructor (prefix, suffix, length) {
    if (!Number.isInteger(length)) {
      super(
        '^' +
        (prefix || '') +
        rx +
        (suffix || '') +
        '$'
      )
    } // eslint-disable-line
    else {
      const mod = length % 3
      super(
        '^' +
        (prefix || '') +
        char + '{' + ~~((length * 8) / 6) + '}' +
        (
          mod === 0
            ? ''
            : mod === 1
              ? trail2
              : trail4
        ) +
        (suffix || '') +
        '$'
      )
    }
  }
}
