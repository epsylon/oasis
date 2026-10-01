const Debug = require('debug')

module.exports = function Log(server, name) {
  function output(level) {
    const debug = Debug(name)
    return function(...args) {
      debug(`${level.toUpperCase()} ${args[0]}`, ...args.slice(1))
      server.emit(`log:${level}`, [name, server.id, ...args])
    }
  }
  const ret = {}
  'error warning notice info'.split(' ').forEach(level => {
    ret[level] = output(level)
  })
  return ret
}
