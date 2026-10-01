# ssb-lan

SSB plugin for discovery of other peers in the same LAN. Works by broadcasting UDP packets to all other peers in the local network. The data in these packets is (symmetrically) encrypted using your chosen [network caps](https://github.com/ssbc/ssb-caps). **Is backwards-compatible** with [ssb-local](https://github.com/ssbc/ssb-local).

## Usage

**Prerequisites:**

- Requires **Node.js 6.5** or higher
- Requires `secret-stack@^6.2.0`

```
npm install --save ssb-lan
```

Add this plugin to ssb-server like this:

```diff
 var createSsbServer = require('ssb-server')
     .use(require('ssb-onion'))
     .use(require('ssb-unix-socket'))
     .use(require('ssb-no-auth'))
     .use(require('ssb-plugins'))
     .use(require('ssb-master'))
     .use(require('ssb-conn'))
+    .use(require('ssb-lan'))
     .use(require('ssb-replicate'))
     .use(require('ssb-friends'))
     // ...
```

Now you should be able to access the following muxrpc APIs under `ssb.lan.*`:

| API | Type | Description |
|-----|------|-------------|
| **`start()`** | `sync` | Triggers the start of LAN discovery of peers. |
| **`stop()`** | `sync` | Stops the LAN discovery of peers if it is currently active. |
| **`discoveredPeers()`** | `source` | A pull-stream that emits "discovery objects" (see definition below) every time a peer is (re)discovered on the local area network. Only peers using the same [network caps](https://github.com/ssbc/ssb-caps) are discovered. |

A "discovery" is an object with the following shape:

```typescript
type Discovery = {
  address: string;
  verified: boolean;
};
```

- **address**: this is a [multiserver address](https://github.com/dominictarr/multiserver-address) that the remote peer is declaring to us in the LAN
- **verified**: this is a boolean indicating whether we are cryptographically sure the remote peer is not spoofing their multiserver address, and that they actually own the ed25519 identity which they announced

## Modes: legacy and normal

By default, ssb-lan will operate two modes: *legacy* and *normal*. Legacy mode mimics how ssb-local behaves, broadcasting UDP packets with the same format for the contents of the packet, i.e. multiserver addresses as strings. Normal mode broadcasts packets with encrypted contents, using the *network caps* as symmetric encryption key.

**You can turn off legacy mode** by updating your SSB config object:

```diff
 {
   path: ssbPath,
   keys: keys,
   port: 8008,
   conn: {
     autostart: false
   },
+  lan: {
+    legacy: false
+  }
 }
```

## License

MIT
