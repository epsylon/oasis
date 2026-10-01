# ssb-conn-query

Module that helps querying potential SSB peer connections. For use with the [SSB CONN](https://github.com/staltz/ssb-conn) family of modules.

## Usage

This module is only used to create an SSB CONN plugin, not used directly by applications. A ConnQuery instance should be available on the CONN plugin, with the following API:

### Types

All "peers" returned by these APIs are key-value arrays, of the format:

```typescript
type Peer = [Address, Data]
```

where

```typescript
type Address = string;

type Data = {pool: 'db' | 'hub' | 'staging'} &
  Partial<DBData> &
  Partial<HubData> &
  Partial<StagingData>;
```

In other words, a peer is an array where the first element is the [multiserver](https://github.com/ssbc/multiserver/) address for that peer, and the second element is an object that is either the ConnDB data or the ConnHub or the ConnStaging data (plus an additional field `pool`).

### Instance API

These methods are available on instances of the ConnQuery class:

* `connQuery.peersAll()`: returns an array of all known peers, from all sources (ConnDB, ConnHub, ConnStaging), either connected or disconnected.
* `connQuery.peersConnected()`: returns an array of peer objects that we are currently connected to.
* `connQuery.peersConnecting()`: returns an array of peer objects that we are currently attempting to connect with.
* `connQuery.peersInConnection()`: returns an array of peer objects that are either: currently connected to, or currently attempting to connect with.
* `connQuery.peersConnectable(pool)`: returns an array of peer objects that are candidates for potential connection, given a specified pool of candidates.
  - `pool` (optional, default is `'db'`) A string with the possible values: `'db'`, `'staging'`, `'dbAndStaging'`, referring to the pools [ssb-conn-db](https://github.com/staltz/ssb-conn-db) and [ssb-conn-staging](https://github.com/staltz/ssb-conn-staging).

### Static API

These functions are available as statics on the ConnQuery class:

* `ConnQuery.passesExpBackoff(step, max, timestamp): peer => boolean`: Answers whether a peer has passed an 'exponential backoff' check, relative to a given timestamp (or `Date.now()` if no timestamp is provided). The exponential backoff is a certain time gap counting from the latest stateChange timestamp, and this gap grows with the number of connection failures that have occurred for this peer. Returns a function where the input is a peer object and the output is a boolean.
  - `step` A temporal parameter (measured in milliseconds) for how much the exponential backoff grows for each connection failure.
  - `max` (optional, default is `Infinity`) The maximum time gap (in milliseconds) for the exponential backoff.
  - `timestamp` (optional, default is `Date.now()`) The timestamp to compare the exponential backoff with. If the time gap between the latest stateChange and the exponential backoff is less than this timestamp, this check passes.
* `ConnQuery.passesGroupDebounce(groupMin, timestamp): peersArray => boolean`: Answers whether a group of peers (as an array) has had enough time gap since the last stateChange for any peer. This is known as a "debounce". The time gap is determined by the 'groupMin' argument, the first argument. Returns a function where the input is an array of peers and the output is a boolean.
  - `groupMin` A temporal parameter (measured in milliseconds) for how long the time gap should last.
  - `timestamp` (optional, default is Date.now()) The timestamp to compare the time gap with. If the time gap between the latest stateChange (for any peer) is less than this timestapm, this check passes.
* `ConnQuery.hasNoAttempts(peer)` Answers a boolean whether a peer has not had a connection attempt yet.
* `ConnQuery.hasOnlyFailedAttempts(peer)` Answers a boolean whether a peer has never been successfully connected to yet, but has been tried.
* `ConnQuery.hasSuccessfulAttempts(peer)` Answers a boolean whether a peer has had some successful connection in the past.
* `ConnQuery.hasPinged(peer)` Answers a boolean whether a peer has successfully pinged us in the past.
* `ConnQuery.sortByStateChange(peers)` Sorts an array of peers from oldest 'stateChange' timestamp to newest.

## License

MIT
