const RAF = require('random-access-web')({name: 'raw', storeName: 'raw'})

module.exports = function (filename, opts) {
  if('string' === typeof filename) {
    const raf = RAF(filename, opts)
    raf.filename = filename
    return raf
  }
  if('function' === typeof filename) throw new Error('expected a filename or a random-access-storage instance')
  return filename
}

