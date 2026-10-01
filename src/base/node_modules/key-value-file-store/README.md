# Key value file store

Simple key value store where and each value is a file.

This project is a fork of [lossy-store] where raw fs is replaced with
[atomic-file-rw] to provide browser support.

## api

### store = LossyStore(dir, codec?)

create a lossy store with the given [codec] (or JSON by default) at
the `dir`

### store.has(key)

returns true if this key is currently in the store.

### store.ensure(key, cb)

ensure that this key is loaded from the file system.
if the file has already been read, `cb` is called immediately.
if `set` is called while waiting for the filesystem, `cb` is called immediately.

### store.get (key, cb)

get the current value for key, loading it if necessary

### store.get (key) => value

return the currently set `value` for `key`. may be null.

### store.set(key, value)

Set a new value. this will trigger a write to be performed (at some point)

### store.delete(key)

Delete a key-value from the store.

## License

MIT

[lossy-store]: https://github.com/dominictarr/lossy-store
[codec]: https://www.npmjs.com/package/flumecodec
[atomic-file-rw]: https://github.com/ssb-ngi-pointer/atomic-file-rw
