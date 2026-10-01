var path = require('path')
var MuxrpcApi = require('muxrpc/remote-api')
var Run = require('./run')
module.exports = (location, name) => {
  const manifest = require(path.join(location, 'manifest.json'))
  return {
  name: name,
  version: require(path.join(location, 'package.json')).version,
  manifest: manifest,
  init: (server, conf) => {
      const localCall = require('muxrpc/local-api')(server, server.getManifest())
      var run = Run(location, localCall)
      server.close.hook(function (fn, args) {
        var self = this
        run.kill(function () {
          fn.apply(self, args)
        })
      })
      return MuxrpcApi({}, manifest, run.remoteCall)
    }
  }
}
