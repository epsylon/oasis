var hypercore = require("hypercore")
var RandomAccessStorage = require("../../../")

let lastIndex = 0
let now = Date.now()

module.exports = async function create(key, opts) {
  const storage = await RandomAccessStorage.mount()
  return hypercore(
    file => storage(`test-${now}-${lastIndex++}/${file}`),
    key,
    opts
  )
}
