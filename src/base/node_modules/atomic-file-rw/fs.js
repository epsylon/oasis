// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: MIT

const fs = require('fs')
const path = require('path')
const mutexify = require('mutexify')

function getEncoding(opts) {
  return opts && opts.encoding ? opts.encoding : null
}

const locks = {
  _map: new Map(),
  getOrCreate: function(filename) {
    if (this._map.has(filename)) {
      return this._map.get(filename)
    } else {
      const lock = mutexify()
      this._map.set(filename, lock)
      return lock
    }
  }
}

module.exports = {
  readFile: function(filename, opts, cb) {
    if (!cb) cb = opts
    fs.readFile(filename, getEncoding(opts), cb)
  },
  writeFile: function(filename, value, opts, cb) {
    if (!cb) cb = opts

    const lock = locks.getOrCreate(filename)

    lock((unlock) => {
      const tempFile = filename + '~'

      // make sure dir exists
      fs.mkdirSync(path.dirname(tempFile), { recursive: true })

      fs.open(tempFile, 'w', (err, fd) => {
        if (err) return unlock(cb, err)
        fs.writeFile(fd, value, getEncoding(opts), (err) => {
          if (err) return unlock(cb, err)
          fs.fsync(fd, (err) => {
            if (err) return unlock(cb, err)
            fs.close(fd, (err) => {
              if (err) return unlock(cb, err)
              fs.rename(tempFile, filename, (err) => {
                if (err) return unlock(cb, err)
                unlock(cb, null, value)
              })
            })
          })
        })
      })
    })
  },
  deleteFile: function(filename, cb) {
    const lock = locks.getOrCreate(filename)

    lock((unlock) => {
      fs.unlink(filename, (err) => {
        if (err) return unlock(cb, err)
        unlock(cb, null, null)
      })
    })
  }
}
