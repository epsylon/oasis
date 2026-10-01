//returns true there is an available network interface which is neither
//local loopback (localhost) or tunneling (probably cjdns)
//On my system, cjdns always appears even when there is no actual internet.
//and in that case, cjdns doesn't work anyway. maybe somebody has a setup
//where they _ONLY_ have a tun interface, so this test will fail.
//lets cross that bridge when we come to it though.

var os = require('os')
module.exports = function () {
  var interfaces

  try {
      interfaces = os.networkInterfaces()
  } catch (e) {
      // As of October 2016, Windows Subsystem for Linux (WSL) does not support
      // the os.networkInterfaces() call and throws instead. For this platform,
      // assume we are online.
      if (e.syscall === 'uv_interface_addresses') {
          return true
      } else {
          throw e
      }
  }

  for(var k in interfaces)
    if(
      'lo' !== k //loopback
      &&
      !/^tun\d+$/.test(k) //cjdns
    )
      return true
  return false
}


if(!module.parent && process.title === 'node')  {
  var v = module.exports()
  console.error(v)
  //exit non-zero if not online
  process.exit(1 - v&1)
}

