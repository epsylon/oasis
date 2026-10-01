# ssb-plugins

`ssb-plugins` is a plugin that provides additional plugin related functionality to a [secret-stack](https://github.com/ssbc/secret-stack) instance.

Without `ssb-plugins`, plugins can only be loaded explicitly by an ssb-server with the `.use()` method.

Generally speaking, this plugin provides the abilility for plugins to be loaded and run as a separate process, with communication over muxrpc.

There are 2 main ways that plugins can be enabled using `ssb-plugins`:
1. loaded explicitly as part of the creation of a secret-stack instance
2. loaded as a set of user configured plugins, defined in one's ssb config folder

Additionally, if enabling plugins from user-configuration, making use of `.use(require('ssb-plugins'))` explicitly will enable the CLI commands for users to install / uninstall / enable / disable plugins manually.

For explicit documentation of the CLI API, see [here](api.md).

## How to write plugins

[See `secret-stack/PLUGINS.md` for how to create a plugin](https://github.com/ssbc/secret-stack/blob/master/PLUGINS.md)


# Examples

```
var createSbot = require('secret-stack')()
.use(require('ssb-db'))

createSbot
  .use(require('ssb-plugins/load-user-plugins')()) //load user plugins from configuration. This may be used without the above!
  .use(require('ssb-plugins/load')(path, name))  //load an out of process plugin directly.
  .use(require('ssb-plugins'))  //provides install, uninstall, enable, disable. (optional)
```

## In-line out of process plugins

Run a plugin as a separate process. The process is
started by the parent process, and they communicate
by running muxrpc over stdio. This means that plugins
may now be written in a language other than javascript.

out of process plugins can be loaded manually.
using require('ssb-plugins/load')(location, name)`

``` js
var Load = require('ssb-plugins/load')
createSbot
  .use(Load(path/to/plugin, 'plugin'))
```

## Load user configured plugins

add all plugins defined in configuration.
``` js
createSbot
  .use(require('ssb-plugins/load-user-plugins'))
```

Plugins are configured as following:
Normally this is created by `sbot plugins.install <plugin-name>` but it can also be installed manually.

```
  "plugins": {
    //load a javascript plugin, exposed as "plugin1"
    "ssb-plugin1: true,
    //load your own version of plugin2. note it is renamed to "plugin2"
    //so it is exposed as "plugin2" not "plugin2-forked"
    "ssb-plugin2-forked: "plugin2",
    "ssb-plugin2": {
      enabled: true,
      name, process
    }
  }
```

### Installing a user configured ssb-plugin manually

```
cd ~/.ssb
npm install <plugin-name>
# open `./config` in your favorite editor
nano config
# set the config
"plugins": {
  "<plugin-name>": true
}
# or if it's an out of process plugin
"plugins": {
  "<plugin-name>": {
    "process": true,
    "name": ... //if it should be exposed with a different name...
  }
} 
```

## License

MIT


