const fs = require('fs')
const path = require('path')

const TF = {
  encryptionKeys: {
    dm: Buffer.from([3, 0]), //   box2-dm-dh
    poBox: Buffer.from([3, 1]) // box2-poBox-dh
  }
}

print(underline('Test vectors'))
newline()
fs.readdir(path.join(__dirname, 'vectors'), (_, fileNames) => {
  fileNames.forEach(fileName => {
    try {
      print(fileName)
      const vector = require(path.join(__dirname, 'vectors', fileName))

      isTrue(isString(vector.type), 'type')
      isTrue(isString(vector.description), 'description')
      isTrue(isObject(vector.input), 'input')

      for (const key in vector.input) {
        if (
          key === 'my_dh_secret' ||
          key === 'my_dh_public' ||
          key === 'your_dh_public'
        ) isTrue(isTypeFormat(vector.input[key], TF.encryptionKeys.dm), key + ' is dm key')
        else if (
          key === 'po_box_dh_public'
        ) isTrue(isTypeFormat(vector.input[key], TF.encryptionKeys.poBox), key + ' is poBox key')
      }

      isTrue(isObject(vector.output), 'output')
    } catch (err) {
      print(red('! is not valid JSON'), 4)
    }
    newline()
  })
})

function print (s, indent = 2) { console.log(new Array(indent).fill(' ').join('') + s) }
function underline (s) { return '\x1b[4m' + s + '\x1b[0m' }
function newline () { console.log() }
function green (s) { return '\x1b[32m' + s + '\x1b[0m' }
function red (s) { return '\x1b[31m' + s + '\x1b[0m' }

function isString (s) { return typeof s === 'string' && s.length > 0 }
function isObject (o) {
  return typeof o === 'object' && o !== null && !Array.isArray(o) &&
    Object.keys(o).length > 0
}
function isTypeFormat (str, typeFormatBuffer) {
  return Buffer.from(str, 'base64').slice(0, 2)
    .equals(typeFormatBuffer)
}
function isTrue (bool, msg = '') {
  bool
    ? print(green('✓ ') + msg, 4)
    : print(red('✗ ' + msg), 4)
}
