const RAF = require('random-access-file')

module.exports = function (filename, opts) {
  if('string' === typeof filename) {
    const raf = RAF(filename, opts)
    raf.filename = filename
    return raf
  }
  return filename
}



