<!--
SPDX-FileCopyrightText: 2021 Andre Staltz

SPDX-License-Identifier: CC0-1.0
-->

# ssb-network-errors

*Detect the severity of a muxrpc error or network connection error to a remote SSB peer.*

Muxrpc and packet-stream throw specific errors when the stream terminates. In Node.js these errors have a specific message string. In go-ssb they have another specific message string. This module handles the pattern recognition of those error messages and classifies them with a severity level.


## Usage

```
npm install --save ssb-network-errors
```

This module is just a function that takes a network error and classifies it with
a **severity number** ranging from 0 to 3.

- **Severity 0**: the **local** peer (us) closed the muxrpc connection with the remote peer gracefully, there is nothing to handle here
- **Severity 1**: the **remote** peer (them) closed the muxrpc connection with us, we MAY have to close or clean up connection details
- **Severity 2**: a network error such as TCP or secret-handshake related occurred, may indicate a problem with the user's internet connectivity or authentication issues (related to secret-handshake)
- **Severity 3**: any other kind of error that this module cannot classify is labelled with severity 3

```js
const getSeverity = require('ssb-network-errors')
const pull = require('pull-stream')

// rpc is connection to a remote SSB peer
pull(
  rpc.createHistoryStream({ id })
  ssb.createWriteStream((err) => {
    const severity = getSeverity(err)
    if (severity === 0) {
      console.log('we closed the local stream')
      console.log('more details:', err)
    }
    else if (severity === 1) {
      console.log('THEY closed the local stream')
      console.log('more details:', err)
    }
    else if (severity === 2) {
      console.log('a typical TCP or internet error occurred')
      console.log('more details:', err)
    }
    else if (severity === 3) {
      console.log('something truly unexpected happened to the connection')
      console.log('more details:', err)
    }
  })
)
```

## License

LGPL-3.0
