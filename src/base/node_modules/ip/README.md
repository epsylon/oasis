# NeoIP

IP address utilities for node.js, forked from `indutny/node-ip`.

## Version 2.x

Version 2.x aims to be API compatible with `indutny/node-ip`. If you need
strict compatibility with the original version use the latest 2.x version.

## Version 3.x

Version 3.x has a very similar API, but has been refactored internally to remove
edge cases introduced by atypical IP address formats. If you're starting a new
project, or are willing to do some minor remedial work, use the latest 3.x.

3.x exports versions for ESM and for CommonJS.

## Installation

### npm

```shell
npm install neoip
```

### git

```shell
git clone https://github.com/zaptic/neoip.git
```

## Usage

Get your ip address, compare ip addresses, validate ip addresses, etc.

```js
import * as ip from 'neoip';
// Or const ip = require("ip");

ip.address(); // my ip address
ip.isEqual('::1', '::0:1'); // true
ip.toBuffer('127.0.0.1'); // Buffer([127, 0, 0, 1])
ip.toString(new Buffer([127, 0, 0, 1])); // 127.0.0.1
ip.fromPrefixLen(24); // 255.255.255.0
ip.mask('192.168.1.134', '255.255.255.0'); // 192.168.1.0
ip.cidr('192.168.1.134/26'); // 192.168.1.128
ip.not('255.255.255.0'); // 0.0.0.255
ip.or('192.168.1.134', '0.0.0.255'); // 192.168.1.255
ip.isPrivate('127.0.0.1'); // true
ip.isV4Format('127.0.0.1'); // true
ip.isV6Format('::ffff:127.0.0.1'); // true

// operate on buffers in-place
const buf = Buffer.alloc(128);
const offset = 64;
ip.toBuffer('127.0.0.1', buf, offset); // [127, 0, 0, 1] at offset 64
ip.toString(buf, offset, 4); // '127.0.0.1'

// subnet information
ip.subnet('192.168.1.134', '255.255.255.192');
// { networkAddress: '192.168.1.128',
//   firstAddress: '192.168.1.129',
//   lastAddress: '192.168.1.190',
//   broadcastAddress: '192.168.1.191',
//   subnetMask: '255.255.255.192',
//   subnetMaskLength: 26,
//   numHosts: 62,
//   length: 64,
//   contains: function(addr){...} }

// This is equivalent to the above
ip.cidrSubnet('192.168.1.134/26');

// range checking
ip.cidrSubnet('192.168.1.134/26').contains('192.168.1.190'); // true

// ipv4 long conversion
ip.toLong('127.0.0.1'); // 2130706433
ip.fromLong(2130706433); // '127.0.0.1'
```

### License

This software is licensed under the MIT License.

Copyright Fedor Indutny, 2012.
Copyright Juliand Digital Ltd, and other contributors 2024.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
