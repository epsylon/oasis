# aligned-block-file

read and write to a file in a cache-friendly way by using aligned blocks.

This module provides an interface to read arbitary buffers from a file,
and manages it as a series of aligned buffers. This allows you to write
high performance binary file formats, where many reads do not necessarily
mean many fs reads.

## Blocks(filename, block_size, flags) => AlignedBlockFile

create an instance, `block_size` is the size of the underlying block.
I suggest 1024 or 4096 or some multiple of your OS block size.
`flags` is passed to [fs.open](http://devdocs.io/node/fs#fs_fs_open_path_flags_mode_callback)

### abf.read(start, end, cb)

read a buffer from the file. If the range is already in the cache
`cb` will be called synchronously.

### abf.readUInt32BE (start, cb)

read a UInt32BE from the file. (`cb` may be sync, if the buffer is already in cache)

### abf.readUInt48BE (start, cb)

read a UInt48BE from the file. (`cb` may be sync, if the buffer is already in cache)

### abf.readUInt64BE (start, cb)

read a UInt64BE from the file, since javascript numbers are restricted to double
this will only set the first 53 bits. Take care with your 53 bit int! if you use bitwise
operations it will collapse back to 32 bit, you need to use `*2` instead of `<< 1`, etc.
(`cb` may be sync, if the buffer is already in cache)

### abf.size

an observable of the files size.

### abf.offset

an observable of the end of the file

### append (buf, cb)

append `buf` to the file.

this must not be called again until the previous call has returned.
updated values for size and offset will be triggered immediately before the `cb` is called.

### truncate(length, cb)

shorten the file to `length` removing anything after that point.

## License

MIT

