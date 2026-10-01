# ssb-blobs

Protocol for gossiping "blobs", in no particular order. This is a plugin for [secret-stack](https://github.com/ssbc/secret-stack) and such general information about these type of plugins is [documented in `plugins.md` in that repository](https://github.com/ssbc/secret-stack/blob/master/PLUGINS.md).

## Protocol

When two peers connect, they request the blobs they "want" from each other.
They do this by sending a JSON object that is a map of
`{<blob_id>: -hop_count}` (note, the hop count is negative) to the peer.
If they have a blob wanted by the peer, they respond with the size they have
for that blob: `{<blob_id>: size}` (note, size is positive - this is how sizes
and blobs are distinguished).

Peers can only request blobs they know about. In the legacy
[scuttlebot/plugins/blobs](https://github.com/ssbc/scuttlebot/tree/99fad7c5f6e436cbd670346b4da20c57222a1419/plugins/blobs)
peers would request blobs that where mentioned in an
[ssb-feed](https://github.com/ssbc/ssb-feed) but this approach
means they cannot know about (encrypted) blobs shared in private
messages, or about blobs recursively linked from other blobs.

This protocol addresses that by implementing _sympathetic wants_.
If a peer requests a blob that you do not have, you start to want it too.
To prevent these requests from flooding the entire network, you signal how much
you want a blob with a hop count.
If you want it for yourself, you use a `hop_count` of -1.
If you want it for a friend, you use a `hop_count` of -2 (and so on..)

This allows you to publish a secret blob, without creating
a permanent cryptographic record of that blob.

However, this alone would mean that to upload a blob,
someone else needs to request it from you, which requires
both peers to be online at the same time.

To address this, we have a `push` method. "pushing" a blob,
just makes a peer "pretend" that they want a blob,
triggering sympathetic wants from intermediate nodes,
ensuring that there are at least some peers that will have the blob.
(currently, your peer will continue to pretend they want the
blob until at least 3 peers report having it)

## API

### `ssb.blobs.add(blobId, cb) => sink`

Creates a pull-stream sink that works well with e.g. `pull-files`
- `blobId` *String* - (optional) the hash id of the blob you're adding. If the hash of what arrives in the stream doesn't match this the add is aborted
- `cb` *Function* - a callback which is run which reveives `err, blobId`

Note: as of 2.0.0 any blob you try to add with size >= max (set in config) will result in an Error.
The error message will say something about can't write to tmpfile, but if you look in the stack trace
you will see an error about file size

### `ssb.blobs.push(blobId, cb)`

Push a blob out to other peers. This is useful for blobs which are attached to encrypted messages.
(Because pubs will generally not know about blobs attached to encrypted messgages so won't replicate)
You will keep pushing the blob out until `pushy` (see config) peers have taken it.

### `ssb.blobs.has(blobId, cb)`

Find out if you have a copy of blob locally

### `ssb.blobs.want(blobId, cb)`

Declare that you want a particular blob. `cb` will be run once the blob arrives

### `ssb.blobs.get(blobId) => source`

Creates a pull-stream source of a blob

### other methods

The following are less commonly used externally but are available:
- `ssb.blobs.getSlice`
- `ssb.blobs.rm`
- `ssb.blobs.ls`
- `ssb.blobs.meta`
- `ssb.blobs.changes`
- `ssb.blobs.createWants`
- `ssb.blobs.help`

you can read about these in the source code or `./help.js`

## Configuration

By changing `.ssb/config`, you can control how generous
ssb-blobs will be. These are the default values:

``` js
"blobs": {
  "stingy": false,
  "sympathy": 3,
  "pushy": 3,
  "legacy": true,
  "max": 5 * 1024 * 1024 // 5MB 
}
```

### `stingy` (default `false`)

Enabling `stingy` mode will make your pub pretend it does not have blobs
unless it _wants_ to push those blobs to the network. (because you have uploaded that file)

### `sympathy` (default `3`)

When a peer asks for a blob, if you do not have it, then out of sympathy you'll
ask for it from your other peers.
The value for `sympathy` determines how many hops away from you that peer may be.
Note that this depends on hops on the current network topology, not the follow
graph: `ssb-blobs` is actually completely independent of the ssb logs.

Set this to 0 to never request a blob that someone else has asked for, unless _you_ want it too.

### `pushy` (default `3`)

When you publish a blob, tell everyone about it, until at least this many peers have taken it.
Of course for this they will need a setting for `sympathy` > 0.


### `legacy` (default `true`)

Whether you support the legacy style blob replication or not.
It's probably safe to disable this now since most pubs will have updated by now.

### `max` (default `5MB`)

Maximum size of blobs to replicate.
Notes:
- blobs of size >= this max cannot be added using `blobs.add`
- if you request a blob and discover its size is >= max, you will not replicate it from other peers

## Usage

This plugin is required by default by [ssb-server](https://github.com/ssbc/ssb-server) and doesn't need to be added to your system if you're using a standard Secure Scuttlebutt install. If you're rolling your own, please refer to [the documentation in `plugins.md` in the `secret-stack` repository](https://github.com/ssbc/secret-stack/blob/master/plugins.md) for how to create your own peer-to-peer solution that uses this plugin.

## License

MIT



