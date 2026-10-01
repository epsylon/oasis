var assert = require('assert')
var path = require('path')
var fs = require('fs')
var pull = require('pull-stream')
var cat = require('pull-cat')
var many = require('pull-many')
var pushable = require('pull-pushable')
var toPull = require('stream-to-pull-stream')
var spawn = require('cross-spawn')
var mkdirp = require('mkdirp')
var osenv = require('osenv')
var rimraf = require('rimraf')
var mv = require('mv')
var explain = require('explain-error')
var valid = require('muxrpc-validation')({})

function isObject(o) {
  return o && 'object' === typeof o
}

function isString(s) {
  return 'string' === typeof s
}

module.exports = {
  name: 'plugins',
  version: '1.0.0',
  manifest: {
    install: 'source',
    uninstall: 'source',
    enable: 'async',
    disable: 'async',
    help: 'sync'
  },
  permissions: {
    master: {allow: ['install', 'uninstall', 'enable', 'disable']}
  },
  init: function (server, config) {
    var installPath = config.path
    config.plugins = config.plugins || {}
    mkdirp.sync(path.join(installPath, 'node_modules'))

    // helper to enable/disable plugins
    function configPluginEnabled (b) {
      return function (opts, cb) {
        var pluginName
        if(isString(opts)) {
          pluginName = opts
          opts = {}
        }

        checkInstalled(pluginName, function (err) {
          if (err) return cb(err)

          if(isObject(config.plugins[pluginName])) {
            if(b) delete config.plugins[pluginName].enabled
            else config.plugins[pluginName].enabled = false
          }
          else
            config.plugins[pluginName] = b

          writePluginConfig(pluginName, b)
          if (b) cb(null, '\''+pluginName+'\' has been enabled. Restart ssb-server to use the plugin.')
          else   cb(null, '\''+pluginName+'\' has been disabled. Restart ssb-server to stop using the plugin.')
        })
      }
    }

    // helper to check if a plugin is installed
    function checkInstalled (pluginName, cb) {
      if (!pluginName || typeof pluginName !== 'string')
        return cb(new Error('plugin name is required'))
      var modulePath = path.join(installPath, 'node_modules', pluginName)
      fs.stat(modulePath, function (err) {
        if (err)
          cb(new Error('Plugin "'+pluginName+'" is not installed.'))
        else
          cb()
      })
    }

    // write the plugin config to ~/.ssb/config
    function writePluginConfig (config) {

      var cfgPath = path.join(config.path, 'config')
      // load ~/.ssb/config
      let existingConfig
      fs.readFile(cfgPath, 'utf-8', (err, data) => {
        if (err) {
          if (err.code === 'ENOENT') {
            // only catch "file not found"
            existingConfig = {}
          } else {
            throw err
          }
        } else {
          existingConfig = JSON.parse(data)
        }


        // update the plugins config
        existingConfig.plugins = config.plugins

        // write to disc
        fs.writeFileSync(cfgPath, JSON.stringify(existingConfig, null, 2), 'utf-8')
      })

    }

    return {
      install: function (opts, _opts) {
        var pluginName
        if(isString(opts)) {
          pluginName = opts
          opts = _opts
          opts.module = pluginName
        }
        else {
          pluginName = opts.name
        }

        var p = pushable()
        var dryRun = opts && opts['dry-run']
        var from   = opts && opts.from

        if (!pluginName || typeof pluginName !== 'string')
          return pull.error(new Error('plugin name is required'))

        // pull out the version, if given
        if (pluginName.indexOf('@') !== -1) {
          var pluginNameSplitted = pluginName.split('@')
          pluginName = pluginNameSplitted[0]
          var version = pluginNameSplitted[1]

          if (version && !from)
            from = pluginName + '@' + version
        }
        
        if (!validatePluginName(pluginName))
          return pull.error(new Error('invalid plugin name: "'+pluginName+'"'))

        // create a tmp directory to install into
        var tmpInstallPath = path.join(osenv.tmpdir(), pluginName)
        rimraf.sync(tmpInstallPath); mkdirp.sync(tmpInstallPath)

        // build args
        // --global-style: dont dedup at the top level, gives proper isolation between each plugin
        // --loglevel error: dont output warnings, because npm just whines about the lack of a package.json in ~/.ssb
        var args = ['install', from||pluginName, '--global-style', '--loglevel', 'error']
        if (dryRun)
          args.push('--dry-run')

        // exec npm
        var child = spawn('npm', args, { cwd: tmpInstallPath })
          .on('close', function (code) {
            if (code == 0 && !dryRun) {
              var tmpInstallNMPath   = path.join(tmpInstallPath, 'node_modules')
              var finalInstallNMPath = path.join(installPath, 'node_modules')

              // delete plugin, if it's already there
              rimraf.sync(path.join(finalInstallNMPath, pluginName))

              // move the plugin from the tmpdir into our install path
              // ...using our given plugin name
              var dirs = fs.readdirSync(tmpInstallNMPath)
                .filter(function (name) { return name.charAt(0) !== '.' }) // filter out dot dirs, like '.bin'
              mv(
                path.join(tmpInstallNMPath,   dirs[0]),
                path.join(finalInstallNMPath, pluginName),
                function (err) {
                  if (err)
                    return p.end(explain(err, '"'+pluginName+'" failed to install. See log output above.'))

                  // enable the plugin
                  // - use basename(), because plugins can be installed from the FS, in which case pluginName is a path
                  var name = path.basename(pluginName)
                  config.plugins[name] = {
                    subprocess: opts.subprocess
                  }
                  writePluginConfig(config)
                  p.push(Buffer.from('"'+pluginName+'" has been installed. Restart ssb-server to enable the plugin.\n', 'utf-8'))
                  p.end()
                }
              )
            } else
              p.end(new Error('"'+pluginName+'" failed to install. See log output above.'))
          })
        return cat([
          pull.values([Buffer.from('Installing "'+pluginName+'"...\n', 'utf-8')]),
          many([toPull(child.stdout), toPull(child.stderr)]),
          p
        ])
      },
      uninstall: function (opts, _opts) {
        var pluginName
        if(isString(opts)) {
          pluginName = opts
          opts = _opts
        }
        else {
          pluginName = opts.name
        }

        var p = pushable()
        if (!pluginName || typeof pluginName !== 'string')
          return pull.error(new Error('plugin name is required'))

        var modulePath = path.join(installPath, 'node_modules', pluginName)

        rimraf(modulePath, function (err) {
          if (!err) {
            delete config.plugins[pluginName]
            writePluginConfig(config)
            p.push(Buffer.from('"'+pluginName+'" has been uninstalled. Restart ssb-server to disable the plugin.\n', 'utf-8'))
            p.end()
          } else
            p.end(err)
        })
        return p
      },
      enable: valid.async(configPluginEnabled(true), 'string'),
      disable: valid.async(configPluginEnabled(false), 'string'),
      help: function () { return require('./help') }
    }
  }
}

function validatePluginName (name) {
  if (/^[._]/.test(name))
    return false
  // from npm-validate-package-name:
  if (encodeURIComponent(name) !== name)
    return false
  return true
}

module.exports.loadUserPlugins = function (createSbot, config) {
  return createSbot.use(require('./load-user-plugins')(config))
}
