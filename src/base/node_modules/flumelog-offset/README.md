# flumelog-offset

An flumelog where the offset into the file is the key.
Each value is appended to the log with a double ended framing,
and the "sequence" is the position in the physical file where the value starts,
this means if you can do a read in O(1) time!

Also, this is built on top of [aligned-block-file](https://github.com/flumedb/aligned-block-file)
so that caching works very well.

## Usage

initialize with a file and a codec, and wrap with flumedb.

``` js
var OffsetLog = require('flumelog-offset')
var codec = require('flumecodec')
var Flume = require('flumedb')

var db = Flume(OffsetLog(filename, {codec: codec.json}))
  .use(...) //also add some flumeviews

db.append({greets: 'hello!'}, function (cb) {

})

```

## Options

```
var OffsetLog = require('flumelog-offset')
var log = OffsetLog('/data/log', {
  blockSize: 1024,        // default is 1024*16
  codec: {encode, decode} // defaults to no codec, expects buffers. for json use flumecodec/json
  flags: 'r',             // default is 'r+' (from aligned-block-file)
  cache: {set, get}       // default is require('hashlru')(1024)
  offsetCodec: {          // default is require('./frame/offset-codecs')[32]
    byteWidth,            // with the default offset-codec, the file can have
    encode,               // a size of 4GB max.
    decodeAsync
  }
})
```

## legacy

if you used `flumelog-offset` before 3, and want to read your old
data, use `require('flumelog-offset/legacy')`


## recovery

If your system crashes while an append is in progress, it's unlikely
but possible to have a partially written state. `flumelog-offset`
will rewind to the last good state on the next start up.

After running this for several months (in my personal secure-scuttlebutt
instance) I eventually got an error, which lead to the changes
in this version.

## format

data is stored in a append only log, where the byte index
of the start of a record is the primary key (`offset`).

```
offset-><data.length (UInt32BE)>
        <data ...>
        <data.length (UInt32BE)>
        <file_length (UInt32BE or Uint48BE or Uint53BE)>
```
by writing the length of the data both before and after each record
it becomes possible to scan forward and backward (like a doubly linked list)

It's very handly to be able to scan backwards, as often you want
to see the last N items, and so you don't need an index for this.

## future ideas

* secured file (hashes etc)
* encrypted file
* make the end of the record be the primary key.
  this might make other code nicer...

## License

MIT
