var ssbKeys = require('ssb-keys')
var tape    = require('tape')
var u       = require('./util')
var pull    = require('pull-stream')
var osenv   = require('osenv')
var path    = require('path')
var fs      = require('fs')
var createSsbServer = 
  require('secret-stack')(require('./util/defaults'))
    .use(require('ssb-db'))

var initialPlugins = createSsbServer.plugins.slice()
function resetSsbServer () {
  createSsbServer.plugins = initialPlugins.slice()
  createSsbServer.use(require('..'))
}

function testTestPlugin(t, ssbServer, subProcess) {
  console.log(ssbServer)
  t.ok(ssbServer.test, 'has test')
  t.ok(ssbServer.test.ping, 'has test.ping')
  t.ok(ssbServer.test.pid, 'has test.pid')
  ssbServer.test.ping('ping', function (err, res) {
    if (err) throw err
    t.equal(res, 'ping pong')

    ssbServer.test.pid(function (err, pid) {
      if(err) throw err
      if(!subProcess)
        t.equal(pid, process.pid)
      else
        t.notEqual(pid, process.pid)

      console.error('CLOSING')
      ssbServer.close(true, function () {
        console.error('CLOSED')
        t.end()
      })
    })
  })
}


tape('install and load plugins', function (t) {

  var aliceKeys = ssbKeys.generate()
  var datadirPath = path.join(osenv.tmpdir(), 'test-plugins1')

  t.test('install plugin', function (t) {

    resetSsbServer()
    var ssbServer = createSsbServer({
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys
    })

    console.log('installing plugin...')
    pull(
      ssbServer.plugins.install('test-plugin', { from: __dirname + '/test-plugin' }),
      pull.collect(function (err, out) {
        if (err) throw err
        console.log(out.map(function (b) { return b.toString('utf-8') }).join(''))

        t.ok(fs.statSync(path.join(datadirPath, 'node_modules/test-plugin')))

        ssbServer.close(function () {
          t.end()
        })
      })
    )
  })

  t.test('installed and enabled plugin is loaded', function (t) {

    var config = {
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys,
      plugins: {
        'test-plugin': 'test'
      }
    }
    resetSsbServer()
    require('..').loadUserPlugins(createSsbServer, config)
    var ssbServer = createSsbServer(config)

    testTestPlugin(t, ssbServer)
  })

  t.test('installed and disabled plugin is not loaded', function (t) {

    var config = {
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys,
      plugins: {
        'test-plugin': false
      }
    }
    resetSsbServer()
    require('..').loadUserPlugins(createSsbServer, config)
    var ssbServer = createSsbServer(config)

    t.equal(ssbServer.test, undefined)

    ssbServer.close(function () {
      t.end()
    })
  })

  t.test('uninstall plugin', function (t) {

    resetSsbServer()
    var ssbServer = createSsbServer({
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys
    })

    console.log('uninstalling plugin...')
    pull(
      ssbServer.plugins.uninstall('test-plugin'),
      pull.collect(function (err, out) {
        if (err) throw err
        console.log(out.map(function (b) { return b.toString('utf-8') }).join(''))

        t.throws(function () { fs.statSync(path.join(datadirPath, 'node_modules/test-plugin')) })

        ssbServer.close(function () {
          t.end()
        })
      })
    )
  })

  t.test('install plugin under custom name', function (t) {

    resetSsbServer()
    var ssbServer = createSsbServer({
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys
    })

    console.log('installing plugin...')
    pull(
      ssbServer.plugins.install('my-test-plugin', { from: __dirname + '/test-plugin' }),
      pull.collect(function (err, out) {
        if (err) throw err
        console.log(out.map(function (b) { return b.toString('utf-8') }).join(''))

        t.ok(fs.statSync(path.join(datadirPath, 'node_modules/my-test-plugin')))

        ssbServer.close(true, function () {
          t.end()
        })
      })
    )
  })

  t.test('installed and enabled plugin is loaded, under custom name', function (t) {

    var config = {
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys,
      plugins: {
        'my-test-plugin': 'test'
      }
    }
    resetSsbServer()
    require('..').loadUserPlugins(createSsbServer, config)
    var ssbServer = createSsbServer(config)

    testTestPlugin(t, ssbServer)
  })

  t.test('load-user-plugins', function (t) {

    var config = {
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys,
      plugins: {
        'my-test-plugin': 'test'
      }
    }
    resetSsbServer()
    createSsbServer
      .use(require('../load-user-plugins')(config))

    var ssbServer = createSsbServer(config)
    testTestPlugin(t, ssbServer)
  })


  t.test('load-user-plugins, subprocess', function (t) {

    var config = {
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys,
      plugins: {
        'my-test-plugin': {
          name: 'test',
          subprocess: true
        }
      }
    }

    resetSsbServer()
    createSsbServer
      .use(require('../load-user-plugins')(config))

    var ssbServer = createSsbServer(config)
    testTestPlugin(t, ssbServer, true)
  })


  t.test('uninstall plugin under custom name', function (t) {

    resetSsbServer()
    var ssbServer = createSsbServer({
      path: datadirPath,
      port: 45451, host: 'localhost',
      keys: aliceKeys
    })

    console.log('uninstalling plugin...')
    pull(
      ssbServer.plugins.uninstall('my-test-plugin'),
      pull.collect(function (err, out) {
        if (err) throw err
        console.log(out.map(function (b) { return b.toString('utf-8') }).join(''))

        t.throws(function () { fs.statSync(path.join(datadirPath, 'node_modules/my-test-plugin')) })

        ssbServer.close(function () {
          t.end()
        })
      })
    )
  })
})

