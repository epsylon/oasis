//with buffers instead of json default
module.exports = function (filename, suffix) {
  return require('./index')(filename, suffix, require('./codec/buffer'))
}
