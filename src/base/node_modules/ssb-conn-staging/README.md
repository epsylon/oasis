# ssb-conn-staging

Module that manages potential and optional peer connections. For use with the [SSB CONN](https://github.com/staltz/ssb-conn) family of modules.

*Visual metaphor: a bench with substitute players, idle and not actively in the game, optionally available and waiting for further instructions to join or not.*

![staging.png](./staging.png)

## Usage

This module is only used to create an SSB CONN plugin, not used directly by applications. A ConnStaging instance should be available on the CONN plugin, with the following API:

### Types

All staging entries are key-value pairs returned as an array, with the following shape:

```typescript
type StagingEntry = [Address, Data]

// where...
type Address = string;
type Data = {
  key?: string;
  type?: 'bt' | 'lan' | 'internet';
  stagingBirth: number; // timestamp
  stagingUpdated: number; // timestamp
  [misc: string]: any;
}
```

In other words, it is an array where the first element is the [multiserver](https://github.com/ssbc/multiserver/) address for a staged peer, and the second element is an object that has some fields, e.g. `key`, `type`, `stagingBirth`, `stagingUpdated`, etc.

### API

* `connStaging.stage(address, data)`: register a peer known by its `address` (string, must conform to the [multiserver address convention](https://github.com/dominictarr/multiserver-address)) as a newly available peer for potential connections, and a `data` object argument. Returns a boolean indicating whether stage() inserted the peer (`true`) or just updated it (`false`)
* `connStaging.unstage(address)`: remove the potential peer from the staging database, by its `address` (string, must conform to the multiserver address convention). Returns a boolean indicating whether unstage() succeeded or not (it fails if the entry we are trying to unstage was not staged in the first place)
* `connStaging.get(address)`: returns the staged data for an existing peer with the given `address`, or `undefined` if the address was not staged
* `connStaging.entries()`: returns a new `Iterator` object that gives `[address, data]` pairs of the peers currently in staging
* `connStaging.liveEntries()`: returns a pull-stream that emits an array of entries (like `connStaging.entries()`, but an array instead of an `Iterator`) everytime there are updates to the staging.
* `connStaging.listen()`: returns a pull stream that notifies of connection events, as an object `{type, address}` where `type` is either `'staged'` or `'unstaged'`
* `connStaging.close()`: terminates any used resources and listeners, in preparation to destroy this instance.


## License

MIT
