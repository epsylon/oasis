# packet-stream-buffers

A tight binary codec for packet-streams (the internal component to
[muxrpc](https://github.com/ssbc/muxrpc))

This allows streams of binary data, and also supports json objects.
(although, you can't send a buffer inside a json object, but so far
we have not done this in secure-scuttlebutt, so performance is more
important)


The protocol sends zero or more header:body pairs,
then a final header that is all zeros.

```
(
  [flags (1byte), length (4 bytes, UInt32BE), req (4 bytes, Int32BE)]
  [body (length bytes)]
) *
[zeros (9 bytes)]
```

`flags` indicates the encoding type of the body, and whether it's
part of a stream, or an error/end value.

flags is just one byte.
``` js
[ignored (4 bits), stream (1 bit), end/err (1 bit), type (2 bits)]
type = {0 => Buffer, 1 => String, 2 => JSON}

```


## License

MIT
