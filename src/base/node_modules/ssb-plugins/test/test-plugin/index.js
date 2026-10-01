module.exports = {
  name: 'test',
  version: '1.0.0',
  manifest: require('./manifest.json'),
  permissions: {
    master: {allow: ['ping', 'pid']}
  },
  init: function () {
    return {
      ping: function (str, cb) {
        return cb(null, str + ' pong')
      },
      pid: function (cb) {
        cb(null, process.pid)
      }
    }
  }
}


