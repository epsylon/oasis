# ssb-conn-hub

Module that manages active connections to peers. For use with the [SSB CONN](https://github.com/staltz/ssb-conn) family of modules.

*Visual metaphor: a network switch managing connections to other peers, capable of starting or stopping connections.*

![hub.png](./hub.png)

## Usage

**Prerequisites:**

- Requires **Node.js 6.5** or higher
- Requires `secret-stack@^6.3.0`

This module is only used to create an SSB CONN plugin, not used directly by applications. A ConnHub instance should be available on the CONN plugin, with the following API:

## API

* `connHub.connect(address, data?)`: connect to a peer known by its `address` (string, must conform to the [multiserver address convention](https://github.com/dominictarr/multiserver-address)). The second argument `data` is optional, and allows you to attach additional metadata, that can be read later when this connection data is retrieved. Returns a Promise, with the three possible outcomes:
  - Resolves with an RPC object that represents the successfully connected peer
  - Resolves with `false` when the connect was unnecessary, therefore not performed
  - Rejects with an error indicating why the connection failed
* `connHub.disconnect(address)`: disconnect from a peer known by its `address` (string, must conform to the multiserver address convention). Returns a Promise, with the three possible outcomes:
  - Resolves with `true` when disconnected successfully
  - Resolves with `false` when the disconnect was unnecessary, therefore not performed
  - Rejects with an error indicating why the disconnection failed
* `connHub.update(address, data)`: update the metadata of a peer currently in connection with us, where the peer is known by its `address` and the new data is in `data`. If the peer is not registered in ConnHub, this method performs no operations and returns false. Returns true if the update has succeeded.
* `connHub.reset()`: closes all connections, basically resetting this instance as if it had just been started
* `connHub.entries()`: returns a new `Iterator` object that gives `[address, data]` pairs, where data has the state and key of the peer
* `connHub.liveEntries()`: returns a pull-stream that emits an array of entries (like `connHub.entries()`, but an array instead of an `Iterator`) everytime there are updates to connections.
* `connDB.listen()`: returns a pull stream that notifies of connection events, as an object `{type, address, key, details}` where:
  - `type` is either `'connecting'`, `'connecting-failed'`, `'connected'`, `'disconnecting'`, `'disconnecting-failed'`, `'disconnected'`
  - `address` is the original address used for connecting
  - (maybe present) `key` is the cryptographic public id
  - (maybe present, see below) `details` is an object with additional info
    - **Present when** when `type === 'connected'` and contains `details.rpc` (the MuxRPC object for the remote peer) and `details.isClient` (boolean indicating whether **we** are the client)
    - Does not exist when `type === 'disconnecting'`
    - Does not exist when `type === 'disconnected'`
    - Does not exist when `type === 'connecting'`
    - **Present when** `type === 'connecting-failed'` and `details` is the error object for the connection failure
    - **Present when** `type === 'disconnecting-failed'` and `details` is the error object for the connection failure
* `connHub.getState(address)`: returns undefined if the peer for that address is disconnected, otherwise returns one of `'connecting'`, `'connected'`, or `'disconnecting'`
* `connHub.close()`: terminates any used resources and listeners, in preparation to destroy this instance.

## Recipes

**How can I get the RPC object for the remote peer connected with me?**

Assuming you're access ConnHub from ssb-conn, listen to connection events on ConnHub, `filter` for `'connected'` events, and they should contain the RPC object on the event's `details` field:

```js
pull(
  ssb.conn.hub().listen(),
  pull.filter(event => event.type === 'connected'),
  pull.drain(event => {
    const rpc = event.details.rpc
    // `rpc` object has public methods such as `rpc.createHistoryStream()`
  })
)
```

## License

MIT
