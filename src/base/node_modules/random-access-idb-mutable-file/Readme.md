# random-access-idb-mutable-file

[![travis][travis.icon]][travis.url]
[![package][version.icon] ![downloads][downloads.icon]][package.url]
[![styled with prettier][prettier.icon]][prettier.url]

[random-access][random-access-storage] storage layer over [IDBMutableFile][], which is **non-standard** IndexedDB extension in Gecko to provide virtual file system API with-in the IndexedDB.

This library will only work in Firefox (unless other browsers implement [IDBMutableFile][] API) and it's mostly targeted at [WebExtensions][]. It mostly amis to be a drop-in replacement for [random-access-file][]. It is also an alternative to [random-access-idb][] that is able to avoid loading all of the file content for random read / writes at the expanse of limited runtime suport.

## Usage

```js
import RandomAccess from "random-access-idb-mutable-file"

const main = async (filename, options) => {
  const randomAccessFile = await RandomAccess.mount()

  const file = randomAccessFile(filename, options)
  file.write(10, Buffer.from("hello"), error => {
    // write a buffer to offset 10
    file.read(10, 5, (error, buffer) => {
      console.log(buffer) // read 5 bytes from offset 10
      file.close(() => {
        console.log("file is closed")
      })
    })
  })
}
```

## Install

    npm install random-access-idb-mutable-file

[travis.icon]: https://travis-ci.org/Gozala/random-access-idb-mutable-file.svg?branch=master
[travis.url]: https://travis-ci.org/Gozala/random-access-idb-mutable-file
[version.icon]: https://img.shields.io/npm/v/random-access-idb-mutable-file.svg
[package.url]: https://npmjs.org/package/random-access-idb-mutable-file
[downloads.icon]: https://img.shields.io/npm/dm/random-access-idb-mutable-file.svg
[downloads.url]: https://npmjs.org/package/random-access-idb-mutable-file
[prettier.icon]: https://img.shields.io/badge/styled_with-prettier-ff69b4.svg
[prettier.url]: https://github.com/prettier/prettier
[random-access-storage]: https://github.com/random-access-storage/random-access-storage
[random-access-file]: https://github.com/random-access-storage/random-access-file
[idbmutablefile]: https://developer.mozilla.org/en-US/docs/Web/API/IDBMutableFile
[webextensions]: https://developer.mozilla.org/en-US/Add-ons/WebExtensions
[random-access-idb]: https://github.com/random-access-storage/random-access-idb
