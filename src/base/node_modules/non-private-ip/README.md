# non-private-ip

Picks the first reasonable looking IP address from network interfaces.
This should _just work_ when running on a VPS, but also provides `private` APIs
so that when running in LAN you get the first reasonable looking LAN IP address.

More info: http://en.wikipedia.org/wiki/Private_network

Your laptop probably does not have a non-local IP address, but your VPS server
probably does. This just returns the first address, which will probably be IPv4.

This module is based on the ["ip" module](https://www.npmjs.com/package/ip).

## API

The main export is a function `nonPrivateIP(interfaces, filter, details)` where:

- `interfaces` is either `null` or a mock of `os.networkInterfaces()`, typically
  **this should be `null`**
- `filter` is a **function** of the shape `(address, details) => boolean` where
  `address` is the IP address as a string, and `details` is the whole object
  with additional fields, e.g. `address`, `netmask`, `family`, `mac`, `cidr`,
  etc
- `details` is a boolean that controls whether you want the return of the
  function to be just the IP address as a string (`false`, this is the
  **default**) or the whole object with additional fields (`true`)

```js
// On a VPS:
const nonPrivateIP = require('non-private-ip')
nonPrivateIP() // 80.78.25.153
```

```js
// In a LAN:
const nonPrivateIP = require('non-private-ip')
nonPrivateIP.private() // 192.168.0.101
```

## License

MIT
