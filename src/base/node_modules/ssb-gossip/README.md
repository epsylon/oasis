# ssb-gossip

ssb-server gossip plugin

to have a peer to peer network, a ssb instance needs to have some other peers to connect with.
This module keeps track of those peers. There are a number of ways a you can know about a peer,

* observed a local udp broadcast from them [ssb-server/plugins/local](https://github.com/ssbc/ssb-server/blob/master/plugins/local.js)
* received their device-address message [ssb-device-address](https://github.com/ssbc/ssb-device-address)
* received a pub message about them [ssb-gossip/init](https://github.com/ssbc/ssb-gossip/blob/master/init.js#L14-L29)
* configured their address manually as a [seed](https://github.com/ssbc/ssb-gossip/blob/master/init.js#L11-L12)
* or the user called [gossip.add](#add-sync)

Notice these are mostly managed by other plugins.

The gossip plugin then decides when to connect to those peers, which it does mostly randomly.
(connecting randomly means you will _eventually_ connect to everyone, thus a useful database property: [eventual consistency](https://en.wikipedia.org/wiki/Eventual_consistency)) 

## peers: sync

Get the current known peers.

```bash
peers
```

```js
peers(cb)
```

## add: sync

Add a peer.

```bash
#add a multiserver address.
add {addr}
#legacy format
add --host {string} --port {number} --key {feedid}
```

```js
add(addr, cb)
add({ host:, port:, key: }, cb)
```

 - `addr` (address string): A [multiserver address](https://github.com/ssbc/multiserver#address-format)
 - `host` (host string): IP address or hostname.
 - `port` (port number)
 - `key` (feedid)

## remove: sync

Remove an address from the peer table.

```bash
remove {addr}
remove --host {string} --port {number} --key {feedid}
```

```js
remove(addr)
remove({ host:, port:, key: })
```

## ping: duplex

used internally by the gossip plugin to measure latency and clock skew

## connect: async

Add an address to the peer table, and connect immediately.

```bash
connect {addr}
connect --host {string} --port {number} --key {feedid}
```

```js
connect(addr, cb)
connect({ host:, port:, key: }, cb)
```

 - `addr` (address string): An address string, of the following format: `hostname:port:feedid`.
 - `host` (host string): IP address or hostname.
 - `port` (port number)
 - `key` (feedid)


## changes: source

Listen for gossip events.

```bash
changes
```

```js
changes()
```

Events come in the following forms:

```
{ type: 'discover', peer:, source: }
{ type: 'connect', peer: }
{ type: 'connect-failure', peer: }
{ type: 'disconnect', peer: }
```

## reconnect: sync

Tell ssb-server to reinitiate gossip connections now.


## enable: sync

Update the config to enable a gossip type.

```bash
enable {type}
```
```js
enable(type, cb)
```

 - type (string): The type of gossip to enable: local, global, or seed. Default
     global.


## disable: sync

Update the config to disable a gossip type.

```bash
disable {type}
```
```js
disable(type, cb)
```

 - type (string): The type of gossip to enable: local, global, or seed. Default
     global.

## License

MIT


