<div style="text-align:center" align="center">

# SSB CONN

### SSB plugin for establishing and managing peer connections.

</div>

*CONN* (Connections Over Numerous Networks) plugin replaces the old `gossip` plugin, covering all its use cases. CONN has these responsibilities:

- Persistence of pub (and other servers) addresses (in the file `~/.ssb/conn.json`)
- Monitoring of all current connections and their state (connecting, disconnecting, etc)
- Monitoring of discovered peers and suggested connections (e.g. on LAN or Bluetooth)
- Selection and scheduling of connections and disconnections
- API compatibility with the old gossip plugin


## Installation

**Prerequisites:**

- Requires **Node.js 6.5** or higher
- Requires `secret-stack@^6.2.0`

**Recommended:**

Not required, but:

- The default scheduler in `ssb-conn@>=2.0.0` wants to use `ssb-db2@>=1.18.0` and `ssb-friends@>=4.4.4`
- The default scheduler in (older) `ssb-conn@1.0.0` wants to use `ssb-db@>=19` and `ssb-friends`

```
npm install --save ssb-conn
```

Add this plugin to ssb-server like this:

```diff
 var createSsbServer = require('ssb-server')
     .use(require('ssb-onion'))
     .use(require('ssb-unix-socket'))
     .use(require('ssb-no-auth'))
     .use(require('ssb-master'))
     .use(require('ssb-db2'))
+    .use(require('ssb-conn'))
     .use(require('ssb-replicate'))
     .use(require('ssb-friends'))
     // ...
```

Now you should be able to access the muxrpc APIs under `ssb.conn` and `ssb.gossip`, see next section.

## Basic API

You can call any of these APIs in your local peer.

This uses [multiserver](https://github.com/ssb-js/multiserver) addresses.

| API | Type | Description |
|-----|------|-------------|
| **`ssb.conn.connect(addr, data?, cb)`** | `async` | Connects to a peer known by its multiserver address `addr`, and stores additional optional `data` (as an object) during its connection lifespan. |
| **`ssb.conn.disconnect(addr, cb)`** | `async` | Disconnects a peer known by its multiserver address `addr`. |
| **`ssb.conn.peers()`** | `source` | A pull-stream that emits an array of all ConnHub entries whenever any connection updates (i.e. changes it state: connecting, disconnecting, connected, etc). |
| **`ssb.conn.remember(addr, data?)`** | `sync` | Stores (in cold storage) connection information about a new peer, known by its multiserver address `addr` and additional optional `data` (as an object). |
| **`ssb.conn.forget(addr)`** | `sync` | Removes (from cold storage) connection information about a peer known by its multiserver address `addr`. |
| **`ssb.conn.dbPeers()`** | `sync` | Returns an array of ConnDB entries known at the moment. Does not reactively update once the database is written to. |
| **`ssb.conn.stage(addr, data?)`** | `sync` | Registers a suggested connection to a new peer, known by its multiserver address `addr` and additional optional `data` (as an object). |
| **`ssb.conn.unstage(addr)`** | `sync` | Unregisters a suggested connection the peer known by its multiserver address `addr`. |
| **`ssb.conn.stagedPeers()`** | `source` | A pull-stream that emits an array of all ConnStaging entries whenever any staging status updates (upon stage() or unstage()). |
| **`ssb.conn.start()`** | `sync` | Triggers the start of the connections scheduler in CONN. |
| **`ssb.conn.stop()`** | `sync` | Stops the scheduler if it is currently active. |

An "entry" is a (tuple) array of form:

```javascript
[addr, data]
```
 where:
 - `addr` is a multiserver address (a **string** that [follows some rules](https://github.com/dominictarr/multiserver-address))
 - `data` is an **object** with additional information about the peer

<details>
  <summary>Full details on fields present in <code>data</code> (click here)</summary>

Fields marked 🔷 are important and often used, fields marked 🔹 come from CONN, fields marked 🔸 are ad-hoc and added by various other modules, and fields suffixed with `?` are not always present:

🔷 `key: string`: the peer's public key / feedId

🔷 `state?: 'connecting' | 'connected' | 'disconnecting'`: (only from `peers()`) the peer's current connection status

🔷 `type?: string`: what type of peer this is; it can be any string, but often is either `'lan'`, `'bt'`, `'pub'`, `'room'`, `'room-endpoint'`, `'dht'`

🔹 `inferredType?: 'bt' | 'lan' | 'dht' | 'internet' | 'tunnel'`: (only from `peers()`) when there is no `type` field, e.g. when a new and unknown peer initiates a client connection with us (as a server), then ConnHub makes a guess what type it is

🔹 `birth?: number`: Unix timestamp for when this peer was added to ConnDB

🔹 `stateChange?: number`: Unix timestamp for the last time the field `state` was changed; this is stored in ConnDB

🔹 `hubBirth?: number`: Unix timestamp for when this peer was added to ConnHub

🔹 `hubUpdated?: number`: Unix timestamp for when this data object was last updated in ConnHub, which means the last time it was connected or attempted

🔹 `stagingBirth?: number`: Unix timestamp for when this peer was added to ConnStaging

🔹 `stagingUpdated?: number`: Unix timestamp for when this data object was last updated in ConnStaging

🔹 `autoconnect?: boolean`: indicates whether this peer should be considered for automatic connection in the scheduler. By the default this field is considered `true` whenever it's undefined, and if you want opt-out of automatic connections for this peer (thus delegating it to a manual choice by the user), then set it to `false`.

🔹 `failure?: number`: typically stored in ConnDB, this is the number of connection errors since the last successful connection

🔹 `duration?: object`: typically stored in ConnDB, this is a [statistics](https://www.npmjs.com/package/statistics) object to measure the duration of connection with this peer

🔹 `ping?: object`: typically stored in ConnDB, this is [statistics](https://www.npmjs.com/package/statistics) object of various ping health measurements

🔹 `pool?: 'db' | 'hub' | 'staging'`: this only appears in ConnQuery APIs, and indicates from which pool (ConnDB or ConnHub or ConnStaging) was this peer picked

🔸 `name?: string`: a nickname for this peer, when there isn't an [ssb-about](https://github.com/ssbc/ssb-about) name

🔸 `room?: string`: (only if `type = 'room-attendant'`) the public key of the [room](https://github.com/staltz/ssb-room) server where this peer is in

🔸 `onlineCount?: number`: (only if `type = 'room'`) the number of room endpoints currently connected to this room

</details>

## Advanced API

CONN also provides more detailed APIs by giving you access to the internals, ConnDB, ConnHub, ConnStaging, ConnQuery. These are APIs that we discourage using, simply because in the vast majority of the cases, the basic API is enough (you might just need a few pull-stream operators on the basic APIs), but if you know what you're doing, don't feel afraid to use the advanced APIs!

| API | Type | Description |
|-----|------|-------------|
| **`ssb.conn.ping()`** | `duplex` | A duplex pull-stream for periodically pinging with peers, fully compatible with `ssb.gossip.ping`. |
| **`sbb.conn.db()`** | `sync` | Returns the instance of [ConnDB](https://github.com/staltz/ssb-conn-db) currently in use. Read their docs to get access to more APIs. |
| **`ssb.conn.hub()`** | `sync` | Returns the instance of [ConnHub](https://github.com/staltz/ssb-conn-hub) currently in use. Read their docs to get access to more APIs. |
| **`ssb.conn.staging()`** | `sync` | Returns the instance of [ConnStaging](https://github.com/staltz/ssb-conn-staging) currently in use. Read their docs to get access to more APIs. |
| **`ssb.conn.query()`** | `sync` | Returns the instance of [ConnQuery](https://github.com/staltz/ssb-conn-query) currently in use. Read their docs to get access to more APIs. |


## (Deprecated) Gossip API

The following gossip plugin APIs are available once you install CONN:

| API | Type |
|-----|------|
| **`ssb.gossip.ping()`** | `duplex` |

If you want to use other legacy `ssb.gossip.*` APIs and preserve the same gossip behavior as before, use [`ssb-legacy-conn`](https://github.com/staltz/ssb-legacy-conn) which uses parts of CONN and tries to mirrors the old gossip plugin as closely as possible, even its log messages.

## Config

Some parameters in CONN can be configured by the user or by application code through the conventional [ssb-config](https://github.com/ssbc/ssb-config). The possible options are listed below:

```typescript
{
  "conn": {
    /**
     * Whether the CONN scheduler should start automatically as soon as the
     * SSB app is initialized. Default is `true`.
     */
    "autostart": boolean,

    /**
     * Whether the CONN scheduler should look into the SSB database looking for
     * messages of type 'pub' and add them to CONN. Default is `true`.
     */
    "populatePubs": boolean,
  }
}
```

## Recipes

<details>
  <summary>How can I get a pull stream of all currently connected peers? (click here)</summary>
  <p>

You can use `ssb.conn.peers()` to get a stream of "all peers currently being processed" and then use Array `filter` to pick only peers that are strictly *connected*, ignoring those that are *connecting* or *disconnecting*:

```js
var connectedPeersStream = pull(
  ssb.conn.peers(),
  pull.map(entries =>
    entries.filter(([addr, data]) => data.state === 'connected')
  )
)
```

Then you can drain the stream to get an array of connected peers:

```js
pull(
  connectedPeersStream,
  pull.drain(connectedPeers => {
    console.log(connectedPeers)
    // [
    //   ['net:192.168.1...', {key: '@Ql...', ...}],
    //   ['net:192.168.2...', {key: '@ye...', ...}]
    // ]
  })
)
```

<ul></ul>

  </p>
</details>


<details>
  <summary>How can I <em>immediately</em> get all currently connected peers? (click here)</summary>
  <p>

[ssb-conn-query](https://github.com/staltz/ssb-conn-query) has APIs for that and others, e.g.

```js
var arr = ssb.conn.query().peersConnected()

console.log(arr)
// [
//   ['net:192.168.1...', {key: '@Ql...', ...}],
//   ['net:192.168.2...', {key: '@ye...', ...}]
// ]
```

If the above doesn't work (for instance, `conn.query()` is not available in the CLI and other similar cases), you can use `ssb.conn.peers()` plus some pull-stream operators:

```js
function getConnectedPeersNow(cb) {
  pull(
    ssb.conn.peers(),
    pull.map(entries =>
      entries.filter(([addr, data]) => data.state === 'connected')
    )
    pull.take(1), // This is important
    pull.drain(connectedPeers => cb(null, connectedPeers))
  )
}

getConnectedPeersNow(arr => console.log(arr))
```

<ul></ul>

  </p>
</details>

## Learn more

<details>
  <summary>How CONN works (click here)</summary>
  <p>

![diagram.png](diagram.png)

Under the hood, CONN is based on three "pools" of peers:

- [ConnDB](https://github.com/staltz/ssb-conn-db): a persistent database of addresses to connect to
- [ConnHub](https://github.com/staltz/ssb-conn-hub): a façade API for currently active connections
- [ConnStaging](https://github.com/staltz/ssb-conn-staging): a pool of potential new connections

ConnDB contains metadata on stable servers and peers that have been successfully connectable. ConnHub is the central API that allows us to issue new connections and disconnections, as well as to track the currently active connections. ConnStaging is an in-memory ephemeral storage of new possible connections that the user might want to approve or disapprove.

Then, [ConnQuery](https://github.com/staltz/ssb-conn-query) has access to those three pools, and provides utilities to query, filter, and sort connections across all those pools.

**ConnScheduler** is an **opinionated** (⚠️) plugin that utilizes ConnQuery to select peers to connect to, then schedules connections to happen via ConnHub, as well as schedules disconnections if necessary. Being opinionated, CONN provides an easy way of replacing the default scheduler with your own scheduler, see instructions below.

There is also a **Gossip Compatibility** plugin, implementing all the legacy APIs, so that other SSB plugins that call these APIs will continue to function as normal.

When you install the ssb-plugin, it will actually setup three plugins:

```
[conn, connScheduler, gossip]
```

  </p>
</details>

<details>
  <summary>Opinions built into the default scheduler (click here)</summary>
  <p>

The default scheduler is roughly the same as the legacy ssb-gossip plugin, with some opinions removed and others added. The scheduler has two parts: discovery setup on startup, and periodic connections/disconnections.

**Discovery setup:**

- Read the SSB log and look for "pub" messages, and `remember` them
- Listen to a stream of LAN peers (see [ssb-lan](https://github.com/staltz/ssb-lan)), and `stage` them
- Listen to a stream of Bluetooth nearby devices, and `stage` them
- Listen to a stream of peers online in Rooms, and `stage` them

**Periodic connections/disconnections:**

- Try to maintain connections with 5 room servers
  - If we're connected to more than 5, then after some minutes we'll start disconnecting from some rooms
- Try to maintain connections with 4 non-room peers (pubs, room attendants, LAN peers, etc)
  - If we're connected to more than 4, then after some minutes we'll start disconnecting from some
  - The lower the hops distance of the peer, the higher priority they receive
  - The more connection failures the peer has presented, the lower the priority
  - Room attendants and LAN peers have slight priority over pubs
  - After we've been connected to a peer for many minutes, disconnect from them
    and try to connect to different peers, to encourage diversity of connections

In none of the cases above shall we connect to a peer that we block. In addition to the above, the following actions happen automatically every (approximately) 1 second:

- Disconnect from connected peers that have just been blocked by us
- Disconnect from peers that have been connected with us for more than 30min
- Disconnect from peers that have been pending in "connecting" status for too long
  - "Too long" means 30sec for LAN peers
  - "Too long" means 30sec for Room attendants
  - "Too long" means 1min for Bluetooth peers
  - "Too long" means 5min for DHT invite peers
  - For other types of peers, "too long" means 10sec
- Stage non-blocked peers that are in ConnDB marked as `autoconnect=false`
- Unstage peers that have just been blocked by us
- Unstage LAN peers that haven't been updated in ConnStaging in 10 seconds
- Unstage Bluetooth peers that haven't been updated in ConnStaging in 30 seconds

**Database cleanups:**

Upon starting the scheduler:

- Remove database entries for any LAN or Bluetooth peers (these are rediscovered just-in-time)
- Remove room alias addresses if those aliases are in rooms where I have membership

**Other events:**

- Upon wakeup (from computer 'sleep'), fully reset the ConnHub
- Upon network (interface) changes, fully reset the ConnHub
- Upon a disconnection, try to connect to some peer (section above)

<ul></ul>

  </p>
</details>

<details>
  <summary>How to build your own ConnScheduler (click here)</summary>
  <p>

To experiment with your own opinions for establishing connections, you can make your own ConnScheduler, which is just a typical SSB plugin. You can write in the traditional style (like other SSB plugins), or with OOP decorators. The example below uses OOP decorators.

Here is the basic shape of the scheduler:

```javascript
module.exports = {
  name: 'connScheduler',
  version: '1.0.0',
  manifest: {
    start: 'sync',
    stop: 'stop',
  },
  init(ssb, config) {
    return {
      start() {
        // this is called when the scheduler should begin making connections

        // You have access to CONN core here:
        ssb.conn.stage('some multiserver address');
        ssb.conn.disconnect('another multiserver address');
        // ...
      },

      stop() {
        // this is called when the scheduler should cancel its jobs, if any
      }
    }
  }
}
```

Note that the name of the plugin must be **exactly `connScheduler`** (or `connScheduler`) and it **must have the methods start() and stop()**, because the CONN core will try to use your scheduler under those names. The rest of the contents of the ConnScheduler class are up to you, you can use private methods, etc.

When you're done building your scheduler, you can export it together with CONN core and the gossip compatibility plugin like this:

```js
var CONN = require('ssb-conn/core')
var Gossip = require('ssb-conn/compat')
var ConnScheduler = require('./my-scheduler')

module.exports = [CONN, ConnScheduler, Gossip]
```

That array is a valid secret-stack plugin which you can `.use()` in ssb-server.

<ul></ul>

  </p>
</details>

<details>
  <summary>Why was the gossip plugin refactored? (click here)</summary>
  <p>

The legacy gossip plugin is one of the oldest parts of the SSB stack in Node.js, and it contained several old opinions. It wasn't designed with multiserver in mind, so it made a lot of assumptions that peers have `host`/`port` fields. Nowadays with Bluetooth and other unusual modes of connectivity, that assumption breaks down often.

The gossip plugin also did not have the concept of "staging", which is useful for ephemeral connections (LAN or Bluetooth) in spaces that may have many strangers. So the gossip plugin tended to connect as soon as possible to any peer discovered.

Also, since the gossip plugin was a monolith, it had all these concerns (cold persistence, in-memory tracking of current connections, ephemeral peers, scheduling, old and new style addresses) squashed into one file, making it hard and brittle to change the code.

The objectives with CONN were to:

- Untangle the codebase into modular components with single responsibilities
- Standardize the assumption that addresses are always multiserver addresses
- All "pools" (DB, Hub, Staging) are key-value pairs `[address, dataObject]`
- Make scheduling logic easily swappable but provide an opinionated default

<ul></ul>

  </p>
</details>

## License

MIT
