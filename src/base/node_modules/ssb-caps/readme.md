# SSB Caps

This is the "Caps" key for accessing the SSB protocol. It will be updated
whenever breaking changes are made. See the secret-handshake paper for a full
explanation:

http://dominictarr.github.io/secret-handshake-paper/shs.pdf

## Installation

```
npm install --save ssb-caps
```

## Usage

From JavaScript:

```js
var caps = require('ssb-caps')

console.log(caps) // JSON object: {shs, sign}
console.log(caps.shs) // this is a string to be interpreted as base64
console.log(caps.sign) // this is so far null

var buf = Buffer.from(caps.shs, 'base64')
```

From other languages: download the `caps.json` file from this package and
parse it using some JSON parser in your language.

## Details


### shs (secret-handshake connection key)

There is nothing special about the Caps SHS value, it was randomly generated in
the Node.js REPL with:

    crypto.randomBytes(32).toString('base64')

This value is presented as a string to be interpreted in base64. To convert
from this string to binary (in Node.js):

    Buffer.from(require('ssb-caps').shs, 'base64')

If this library updates the Caps, we MUST issue a new major version.

### sign (message validation key)

this is used to hmac messages before signing/verification.
because originally, ssb does not use anything, this defaults to null.

### invite (peer invites signing key)

peer invites sign a message content using the private key which is given to
the guest. It is the hash of the string `"peer-invites"`

    crypto.createHash('sha256').update('peer-invites', 'utf8').digest('base64')

## Legal

- Written in 2015 by 'Dominic Tarr' <dominic.tarr@gmail.com>
- Contributor: Andre Medeiros <andre@staltz.com>

To the extent possible under law, the author(s) have dedicated all copyright
and related and neighboring rights to this software to the public domain
worldwide. This software is distributed without any warranty.

You should have received a copy of the CC0 Public Domain Dedication along
with this software. If not, see
<http://creativecommons.org/publicdomain/zero/1.0/>.
