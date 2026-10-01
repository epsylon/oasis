const os = require('os')
const ip = require('ip')
// pick the first reasonable looking host.
// this should *just work* when running on a vps.

const isPrivate = ip.isPrivate

function isNonPrivate(e) {
  return !isPrivate(e)
}

function address(inter, filter, details) {
  inter = inter || os.networkInterfaces()
  filter = filter || isNonPrivate
  let score = 0
  let candidate = undefined
  function setCandidate(e) {
    if (details) {
      candidate = e
    } else {
      if (e.family === 'IPv6') {
        candidate = e.address + '%' + (e.scopeid || e.interface)
      } else {
        candidate = e.address
      }
    }
  }
  for (const k of Object.keys(inter)) {
    for (const e of inter[k]) {
      e.interface = k
      // Must not be loopback:
      if (e.internal) continue
      // Must pass our filter:
      if (!filter(e.address, e)) continue

      if (process.platform === 'win32') {
        if (k.includes('Wi-Fi') && e.family === 'IPv4' && score < 4) {
          score = 4
          setCandidate(e)
        } else if (k.includes('Ethernet') && e.family === 'IPv4' && score < 3) {
          score = 3
          setCandidate(e)
        } else if (k.includes('Wi-Fi') && e.family === 'IPv6' && score < 2) {
          score = 2
          setCandidate(e)
        } else if (k.includes('Ethernet') && e.family === 'IPv6' && score < 1) {
          score = 1
          setCandidate(e)
        } else if (score === 0) {
          setCandidate(e)
        }
      } else {
        // Prioritize IPv4 wlan:
        if (k.startsWith('wl') && e.family === 'IPv4' && score < 8) {
          score = 8
          setCandidate(e)
        }
        // Prioritize IPv4 ethernet:
        else if (k.startsWith('en') && e.family === 'IPv4' && score < 7) {
          score = 7
          setCandidate(e)
        }
        // Prioritize IPv4 OLD ethernet:
        else if (k.startsWith('eth') && e.family === 'IPv4' && score < 6) {
          score = 6
          setCandidate(e)
        }
        // Prioritize wlan:
        else if (k.startsWith('wl') && e.family === 'IPv6' && score < 5) {
          score = 5
          setCandidate(e)
        }
        // Prioritize ethernet:
        else if (k.startsWith('en') && e.family === 'IPv6' && score < 4) {
          score = 4
          setCandidate(e)
        }
        // Prioritize OLD ethernet:
        else if (k.startsWith('eth') && e.family === 'IPv6' && score < 3) {
          score = 3
          setCandidate(e)
        }
        // Prioritize IPv4 tunnels (VPN):
        else if (k.startsWith('tun') && e.family === 'IPv4' && score < 2) {
          score = 2
          setCandidate(e)
        }
        // Prioritize tunnels (VPN):
        else if (k.startsWith('tun') && e.family === 'IPv6' && score < 1) {
          score = 1
          setCandidate(e)
        }
        // Allow everything else
        else if (score === 0) {
          setCandidate(e)
        }
      }
    }
  }
  return candidate
}

function _private(inter) {
  return address(inter, isPrivate)
}

function isV4(e) {
  return e.family === 'IPv4'
}

function isV6(e) {
  return e.family === 'IPv6'
}

// Functions
module.exports = address
module.exports.private = _private

// Values
module.exports.v4 = address(null, (adr, e) => isV4(e) && isNonPrivate(adr))
module.exports.v6 = address(null, (adr, e) => isV6(e) && isNonPrivate(adr))
module.exports.private.v4 = address(null, (adr, e) => isV4(e) && isPrivate(adr))
module.exports.private.v6 = address(null, (adr, e) => isV6(e) && isPrivate(adr))
module.exports.all = {
  public: {
    v4: module.exports.v4,
    v6: module.exports.v6,
  },
  private: {
    v4: module.exports.private.v4,
    v6: module.exports.private.v6,
  },
}
