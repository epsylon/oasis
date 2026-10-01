# ssb-conn-db

Module that manages a local registry of connectable peers. For use with the [SSB CONN](https://github.com/staltz/ssb-conn) family of modules.

*Visual metaphor: a shelf of binders used for archival, holding static data on peers
and their previous addresses used for connections.*

![db.png](./db.png)

## Usage

This module is only used to create an SSB CONN plugin, not used directly by applications. A ConnDB instance should be available on the CONN plugin, with the following API:

## API

* `new ConnDB(opts)`: constructor for a connDB instance, with the following options:
  - `opts.path` (default `'~/.ssb'`): path to the directory where the database will be stored
  - `opts.writeTimeout` (default `2000` milliseconds): interval to wait when batching database writes in the filesystem
* `connDB.set(address, data)`: insert or update a connectable peer by its `address` (string, must conform to the [multiserver address convention](https://github.com/dominictarr/multiserver-address)) with `data` (object). If updating the data, it will *merge* the previous properties with the new properties. Returns the `connDB` instance.
* `connDB.update(address, data)`: update a connectable peer by its `address` (string, must conform to the [multiserver address convention](https://github.com/dominictarr/multiserver-address)) with `data` (object). If the peer is not in the database, this method performs no operations and silently returns. Returns the `connDB` instance.
* `connDB.update(address, updater)`: update a connectable peer by its `address` (string, must conform to the [multiserver address convention](https://github.com/dominictarr/multiserver-address)) with `updater` (a function where input is the previous data object and output should be the new data object). If the peer is not in the database, this method performs no operations and silently returns. Returns the `connDB` instance.
* `connDB.replace(address, data)`: insert or update a connectable peer by its `address` (string, must conform to the [multiserver address convention](https://github.com/dominictarr/multiserver-address)) with `data` (object). If updating the data, it will *replace* the previous properties with the new properties. Returns the `connDB` instance.
* `connDB.get(address)`: returns the data for an existing peer with the given `address`, or `undefined` if the address was not registered
* `connDB.getAddressForId(id)`: returns the connection address for an existing peer with the given SSB feed `id`, or `undefined` if the address does not exist
* `connDB.has(address)`: returns `true` if the given `address` is registered in the database, `false` otherwise
* `connDB.delete(address)`: remove an address and its associated data from the database. Returns `true` if the address existed and was deleted, `false` otherwise.
* `connDB.entries()`: returns a new `Iterator` object that gives `[address, data]` pairs
* `connDB.listen()`: returns a pull stream that notifies of changes made to the database, as an object `{type, address}` where `type` is either `'insert'`, `'update'`, or `'delete'`
* `connDB.loaded()`: returns a Promise that resolves successfully when the initial database loading (read) occurs, and rejects if there was a failure to load.
* `connDB.close()`: finishes writing any pending updates to the database, then gets ready for destroying this instance.

Notice that the API above mostly mirrors the API of the JavaScript [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map).

## License

MIT
