var path = require('path')
var assert = require('assert')
var load = require('./load')

function isObject(o) {
  return o && 'object' === typeof o
}

// predictate to check if an object appears to be a ssbServer plugin
function assertSsbServerPlugin (obj) {
  // function signature:
  if (typeof obj == 'function')
    return

  // object signature:
  assert(obj && typeof obj == 'object',   'module.exports must be an object')
  assert(typeof obj.name == 'string',     'module.exports.name must be a string')
  assert(typeof obj.version == 'string',  'module.exports.version must be a string')
  assert(obj.manifest &&
         typeof obj.manifest == 'object', 'module.exports.manifest must be an object')
  assert(typeof obj.init == 'function',   'module.exports.init must be a function')
}


module.exports = function (config) {
  // iterate all modules
  var nodeModulesPath = path.join(config.path, 'node_modules')
  //instead of testing all plugins, only load things explicitly
  //enabled in the config
  var a = []
  for(var module_name in config.plugins) {
    if(config.plugins[module_name]) {
    var name = config.plugins[module_name]
    var subprocess
    if(name === true) {
      name = /^ssb-/.test(module_name) ? module_name.substring(4) : module_name
    }
    else if(isObject(name)) {
      subprocess = name.subprocess
      var _name = name.name || module_name
      name = (/^ssb-/.test(_name) ? _name.substring(4) : _name)
    }
//    if (createSsbServer.plugins.some(plug => plug.name === name))
//      throw new Error('already loaded plugin named:'+name)

//      var pkg = require(path.join(nodeModulesPath, module_name, 'package.json'))
      var plugin
      if(subprocess) {
        plugin = load(path.join(nodeModulesPath, module_name), name)
      } else {
        plugin = require(path.join(nodeModulesPath, module_name))
      }

      if(!plugin || plugin.name !== name)
        throw new Error('plugin at:'+module_name+' expected name:'+name+' but had:'+(plugin||{}).name)
      assertSsbServerPlugin(plugin)
//      createSsbServer.use(plugin)
      a.push(plugin)
    }
  }
  return a
}
