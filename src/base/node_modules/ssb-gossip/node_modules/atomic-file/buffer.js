//with buffers instead of json default
module.exports = function (filename, suffix) {
  return require('./')(filename, suffix, require('./codec/buffer'))
}
