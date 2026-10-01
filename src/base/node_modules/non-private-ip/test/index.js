const tape = require('tape')
const nonPrivate = require('../')
const ip = require('ip')

const vps = {
  lo: [
    { address: '127.0.0.1', family: 'IPv4', internal: true },
    { address: '::1', family: 'IPv6', internal: true },
  ],
  eth0: [
    { address: '176.58.117.63', family: 'IPv4', internal: false },
    {
      address: '2a01:7e00::f03c:91ff:fe56:9728',
      family: 'IPv6',
      internal: false,
    },
    { address: 'fe80::f03c:91ff:fe56:9728', family: 'IPv6', internal: false },
  ],
}

const vps2 = {
  lo: [
    { address: '127.0.0.1', family: 'IPv4', internal: true },
    { address: '::1', family: 'IPv6', internal: true },
  ],
  eth0: [
    { address: '176.58.117.63', family: 'IPv4', internal: false },
    {
      address: '2a01:7e00::f03c:91ff:fe56:9728',
      family: 'IPv6',
      internal: false,
    },
    {
      address: 'fe80::f03c:91ff:fe56:9728',
      family: 'IPv6',
      internal: false,
      scopeid: 4,
    },
  ],
}

const laptop = {
  lo: [
    { address: '127.0.0.1', family: 'IPv4', internal: true },
    { address: '::1', family: 'IPv6', internal: true },
  ],
  enp0s25: [
    { address: '192.168.1.41', family: 'IPv4', internal: false },
    { address: 'fe80::f2de:f1ff:fed9:5c68', family: 'IPv6', internal: false },
    { address: 'fe80::1ae1:738c:3004:75e5', family: 'IPv6', internal: false },
  ],
  wlp3s0: [
    { address: '192.168.1.61', family: 'IPv4', internal: false },
    { address: 'fe80::76e5:bff:fea6:151c', family: 'IPv6', internal: false },
    { address: 'fe80::5a4:f331:d041:9f71', family: 'IPv6', internal: false },
  ],
}

const windows = {
  Ethernet: [{ address: '192.168.1.41', family: 'IPv4', internal: false }],
  'Wi-Fi': [{ address: '192.168.1.42', family: 'IPv4', internal: false }],
}

tape('simple', function (t) {
  t.equal(nonPrivate(vps), '176.58.117.63')
  t.equal(nonPrivate(laptop), undefined)
  t.equal(nonPrivate.private(vps), 'fe80::f03c:91ff:fe56:9728%eth0')
  t.equal(nonPrivate.private(vps2), 'fe80::f03c:91ff:fe56:9728%4')
  t.equal(nonPrivate.private(laptop), '192.168.1.61')
  t.end()
})

tape('details', function (t) {
  t.deepEqual(nonPrivate(laptop, ip.isPrivate, true), {
    address: '192.168.1.61',
    family: 'IPv4',
    internal: false,
    interface: 'wlp3s0',
  })
  t.end()
})

tape('windows', function (t) {
  const previous = process.platform
  Object.defineProperty(process, 'platform', {
    value: 'win32',
  })

  t.equal(nonPrivate(windows), undefined, 'non private on windows')
  t.equal(nonPrivate.private(windows), '192.168.1.42', 'private on windows')

  Object.defineProperty(process, 'platform', {
    value: previous,
  })
  t.end()
})
