// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const Cache = require('@alloc/quick-lru')
const RAF = require('polyraf')
const Obv = require('obz')
const AtomicFile = require('atomic-file-rw')
const debounce = require('lodash.debounce')
const isBufferZero = require('is-buffer-zero')
const debug = require('debug')('async-append-only-log')
const fs = require('fs')
const mutexify = require('mutexify')

const {
  deletedRecordErr,
  nanOffsetErr,
  negativeOffsetErr,
  outOfBoundsOffsetErr,
  delDuringCompactErr,
  appendLargerThanBlockErr,
  appendTransactionWantsArrayErr,
  unexpectedTruncationErr,
  compactWithMaxLiveStreamErr,
} = require('./errors')
const Stream = require('./stream')
const Record = require('./record')
const Compaction = require('./compaction')

/**
 * The "End of Block" is a special field used to mark the end of a block, and
 * in practice it's like a Record header "length" field, with the value 0.
 * In most cases, the end region of a block will have a larger length than this,
 * but we want to guarantee there is at *least* this many bytes at the end.
 */
const EOB = {
  SIZE: Record.HEADER_SIZE,
  asNumber: 0,
}

const DEFAULT_BLOCK_SIZE = 65536
const DEFAULT_CODEC = { encode: (x) => x, decode: (x) => x }
const DEFAULT_WRITE_TIMEOUT = 250
const DEFAULT_VALIDATE = () => true

const COMPACTION_PROGRESS_EMIT_INTERVAL = 1000

module.exports = function AsyncAppendOnlyLog(filename, opts) {
  const cache = new Cache({ maxSize: 1024 }) // This is potentially 64 MiB!
  const raf = RAF(filename)
  const statsFilename = filename + '.stats'
  const blockSize = (opts && opts.blockSize) || DEFAULT_BLOCK_SIZE
  const codec = (opts && opts.codec) || DEFAULT_CODEC
  const writeTimeout = (opts && opts.writeTimeout) || DEFAULT_WRITE_TIMEOUT
  const validateRecord = (opts && opts.validateRecord) || DEFAULT_VALIDATE
  let self

  const waitingLoad = []
  const waitingDrain = new Map() // blockIndex -> []
  const waitingFlushDelete = []
  const blocksToBeWritten = new Map() // blockIndex -> { blockBuf, offset }
  const blocksWithDeletables = new Map() // blockIndex -> blockBuf
  let flushingDelete = false
  let writingBlockIndex = -1

  let latestBlockBuf = null
  let latestBlockIndex = null
  let nextOffsetInBlock = null
  let deletedBytes = 0
  const since = Obv() // offset of last written record
  let compaction = null
  const compactionProgress = Obv()
  if (typeof window !== 'undefined') {
    // fs sync not working in browser
    compactionProgress.set({ percent: 1, done: true, sizeDiff: 0 })
  } else {
    compactionProgress.set(
      Compaction.stateFileExists(filename)
        ? { percent: 0, done: false }
        : { percent: 1, done: true, sizeDiff: 0 }
    )
  }

  const waitingCompaction = []

  onLoad(function maybeResumeCompaction() {
    // fs sync not working in browser
    if (typeof window !== 'undefined') return

    if (Compaction.stateFileExists(filename)) {
      compact(function onCompactDone(err) {
        if (err) throw err
      })
    }
  })()

  AtomicFile.readFile(statsFilename, 'utf8', function statsUp(err, json) {
    if (err) {
      debug('error loading stats: %s', err.message)
      deletedBytes = 0
    } else {
      try {
        const stats = JSON.parse(json)
        deletedBytes = stats.deletedBytes
      } catch (err) {
        debug('error parsing stats: %s', err.message)
        deletedBytes = 0
      }
    }

    raf.stat(function onRAFStatDone(err, stat) {
      if (err) debug('failed to stat ' + filename, err)

      const fileSize = stat ? stat.size : -1

      if (fileSize <= 0) {
        debug('empty file')
        latestBlockBuf = Buffer.alloc(blockSize)
        latestBlockIndex = 0
        nextOffsetInBlock = 0
        cache.set(0, latestBlockBuf)
        since.set(-1)
        while (waitingLoad.length) waitingLoad.shift()()
      } else {
        const blockStart = fileSize - blockSize
        loadLatestBlock(blockStart, function onLoadedLatestBlock(err) {
          if (err) throw err
          debug('opened file, since: %d', since.value)
          while (waitingLoad.length) waitingLoad.shift()()
        })
      }
    })
  })

  function loadLatestBlock(blockStart, cb) {
    raf.read(blockStart, blockSize, function onRAFReadLastDone(err, blockBuf) {
      if (err) return cb(err)
      getLastGoodRecord(
        blockBuf,
        blockStart,
        function gotLastGoodRecord(err, offsetInBlock) {
          if (err) return cb(err)
          latestBlockBuf = blockBuf
          latestBlockIndex = blockStart / blockSize
          const recSize = Record.readSize(blockBuf, offsetInBlock)
          nextOffsetInBlock = offsetInBlock + recSize
          since.set(blockStart + offsetInBlock)
          cb()
        }
      )
    })
  }

  function getOffsetInBlock(offset) {
    return offset % blockSize
  }

  function getBlockStart(offset) {
    return offset - getOffsetInBlock(offset)
  }

  function getNextBlockStart(offset) {
    return getBlockStart(offset) + blockSize
  }

  function getBlockIndex(offset) {
    return getBlockStart(offset) / blockSize
  }

  const writeLock = mutexify()

  function writeWithFSync(blockStart, blockBuf, successValue, cb) {
    writeLock(function onWriteLockReleased(unlock) {
      raf.write(blockStart, blockBuf, function onRAFWriteDone(err) {
        if (err) return unlock(cb, err)

        if (raf.fd) {
          fs.fsync(raf.fd, function onFSyncDone(err) {
            if (err) unlock(cb, err)
            else unlock(cb, null, successValue)
          })
        } else unlock(cb, null, successValue)
      })
    })
  }

  function truncateWithFSync(newSize, cb) {
    writeLock(function onWriteLockReleasedForTruncate(unlock) {
      raf.del(newSize, Infinity, function onRAFDeleteDone(err) {
        if (err) return unlock(cb, err)

        if (raf.fd) {
          fs.fsync(raf.fd, function onFSyncDoneForTruncate(err) {
            if (err) unlock(cb, err)
            else unlock(cb, null)
          })
        } else unlock(cb, null)
      })
    })
  }

  function fixBlock(blockBuf, badOffsetInBlock, blockStart, successValue, cb) {
    debug('found invalid record at %d, fixing last block', badOffsetInBlock)
    blockBuf.fill(0, badOffsetInBlock, blockSize)
    writeWithFSync(blockStart, blockBuf, successValue, cb)
  }

  function getLastGoodRecord(blockBuf, blockStart, cb) {
    let lastGoodOffset = 0
    for (let offsetInRecord = 0; offsetInRecord < blockSize; ) {
      const length = Record.readDataLength(blockBuf, offsetInRecord)
      if (length === EOB.asNumber) break
      const [dataBuf, recSize] = Record.read(blockBuf, offsetInRecord)
      const isLengthCorrupt = offsetInRecord + recSize > blockSize
      const isDataCorrupt = !isBufferZero(dataBuf) && !validateRecord(dataBuf)
      if (isLengthCorrupt || isDataCorrupt) {
        fixBlock(blockBuf, offsetInRecord, blockStart, lastGoodOffset, cb)
        return
      }
      lastGoodOffset = offsetInRecord
      offsetInRecord += recSize
    }

    cb(null, lastGoodOffset)
  }

  function getBlock(offset, cb) {
    const blockIndex = getBlockIndex(offset)

    if (cache.has(blockIndex)) {
      debug('getting offset %d from cache', offset)
      const cachedBlockBuf = cache.get(blockIndex)
      cb(null, cachedBlockBuf)
    } else {
      debug('getting offset %d from disc', offset)
      const blockStart = getBlockStart(offset)
      raf.read(blockStart, blockSize, function onRAFReadDone(err, blockBuf) {
        cache.set(blockIndex, blockBuf)
        cb(err, blockBuf)
      })
    }
  }

  function get(offset, cb) {
    const logSize = latestBlockIndex * blockSize + nextOffsetInBlock
    if (typeof offset !== 'number') return cb(nanOffsetErr(offset))
    if (isNaN(offset)) return cb(nanOffsetErr(offset))
    if (offset < 0) return cb(negativeOffsetErr(offset))
    if (offset >= logSize) return cb(outOfBoundsOffsetErr(offset, logSize))

    getBlock(offset, function gotBlock(err, blockBuf) {
      if (err) return cb(err)
      const [dataBuf] = Record.read(blockBuf, getOffsetInBlock(offset))
      if (isBufferZero(dataBuf)) return cb(deletedRecordErr())
      cb(null, codec.decode(dataBuf))
    })
  }

  // nextOffset can take 3 values:
  // -1: end of log
  //  0: need a new block
  // >0: next record within block
  function getDataNextOffset(blockBuf, offset, asRaw = false) {
    const offsetInBlock = getOffsetInBlock(offset)
    const [dataBuf, recSize] = Record.read(blockBuf, offsetInBlock)
    const nextLength = Record.readDataLength(blockBuf, offsetInBlock + recSize)

    let nextOffset
    if (nextLength === EOB.asNumber) {
      if (getNextBlockStart(offset) > since.value) nextOffset = -1
      else nextOffset = 0
    } else {
      nextOffset = offset + recSize
    }

    if (isBufferZero(dataBuf)) return [nextOffset, null, recSize]
    else return [nextOffset, asRaw ? dataBuf : codec.decode(dataBuf), recSize]
  }

  function del(offset, cb) {
    if (compaction) {
      cb(delDuringCompactErr())
      return
    }
    const blockIndex = getBlockIndex(offset)
    if (blocksToBeWritten.has(blockIndex)) {
      onDrain(function delAfterDrained() {
        del(offset, cb)
      })
      return
    }

    if (blocksWithDeletables.has(blockIndex)) {
      const blockBuf = blocksWithDeletables.get(blockIndex)
      gotBlockForDelete(null, blockBuf)
    } else {
      getBlock(offset, gotBlockForDelete)
    }
    function gotBlockForDelete(err, blockBuf) {
      if (err) return cb(err)
      const actualBlockBuf = blocksWithDeletables.get(blockIndex) || blockBuf
      Record.overwriteWithZeroes(actualBlockBuf, getOffsetInBlock(offset))
      deletedBytes += Record.readSize(actualBlockBuf, getOffsetInBlock(offset))
      blocksWithDeletables.set(blockIndex, actualBlockBuf)
      scheduleFlushDelete()
      cb()
    }
  }

  function hasNoSpaceFor(dataBuf, offsetInBlock) {
    return offsetInBlock + Record.size(dataBuf) + EOB.SIZE > blockSize
  }

  const scheduleFlushDelete = debounce(flushDelete, writeTimeout)

  function flushDelete() {
    if (blocksWithDeletables.size === 0) {
      for (const cb of waitingFlushDelete) cb()
      waitingFlushDelete.length = 0
      return
    }
    const blockIndex = blocksWithDeletables.keys().next().value
    const blockStart = blockIndex * blockSize
    const blockBuf = blocksWithDeletables.get(blockIndex)
    blocksWithDeletables.delete(blockIndex)
    flushingDelete = true

    writeWithFSync(blockStart, blockBuf, null, function flushedDelete(err) {
      saveStats(function onSavedStats(err) {
        if (err) debug('error saving stats: %s', err.message)
        flushingDelete = false
        if (err) {
          for (const cb of waitingFlushDelete) cb(err)
          waitingFlushDelete.length = 0
          return
        }
        flushDelete() // next
      })
    })
  }

  function onDeletesFlushed(cb) {
    if (flushingDelete || blocksWithDeletables.size > 0) {
      waitingFlushDelete.push(cb)
    } else cb()
  }

  function appendSingle(data) {
    let encodedData = codec.encode(data)
    if (typeof encodedData === 'string') encodedData = Buffer.from(encodedData)

    if (Record.size(encodedData) + EOB.SIZE > blockSize)
      throw appendLargerThanBlockErr()

    if (hasNoSpaceFor(encodedData, nextOffsetInBlock)) {
      const nextBlockBuf = Buffer.alloc(blockSize)
      latestBlockBuf = nextBlockBuf
      latestBlockIndex += 1
      nextOffsetInBlock = 0
      debug("data doesn't fit current block, creating new")
    }

    Record.write(latestBlockBuf, nextOffsetInBlock, encodedData)
    cache.set(latestBlockIndex, latestBlockBuf) // update cache
    const offset = latestBlockIndex * blockSize + nextOffsetInBlock
    blocksToBeWritten.set(latestBlockIndex, {
      blockBuf: latestBlockBuf,
      offset,
    })
    nextOffsetInBlock += Record.size(encodedData)
    scheduleWrite()
    debug('data inserted at offset %d', offset)
    return offset
  }

  function append(data, cb) {
    if (compaction) {
      waitingCompaction.push(() => append(data, cb))
      return
    }

    if (Array.isArray(data)) {
      let offset = 0
      for (let i = 0, length = data.length; i < length; ++i)
        offset = appendSingle(data[i])

      cb(null, offset)
    } else cb(null, appendSingle(data))
  }

  function appendTransaction(dataArray, cb) {
    if (!Array.isArray(dataArray)) {
      return cb(appendTransactionWantsArrayErr())
    }
    if (compaction) {
      waitingCompaction.push(() => appendTransaction(dataArray, cb))
      return
    }

    let size = 0
    const encodedDataArray = dataArray.map((data) => {
      let encodedData = codec.encode(data)
      if (typeof encodedData === 'string')
        encodedData = Buffer.from(encodedData)
      size += Record.size(encodedData)
      return encodedData
    })

    size += EOB.SIZE

    if (size > blockSize) return cb(appendLargerThanBlockErr())

    if (nextOffsetInBlock + size > blockSize) {
      // doesn't fit
      const nextBlockBuf = Buffer.alloc(blockSize)
      latestBlockBuf = nextBlockBuf
      latestBlockIndex += 1
      nextOffsetInBlock = 0
      debug("data doesn't fit current block, creating new")
    }

    const offsets = []
    for (const encodedData of encodedDataArray) {
      Record.write(latestBlockBuf, nextOffsetInBlock, encodedData)
      cache.set(latestBlockIndex, latestBlockBuf) // update cache
      const offset = latestBlockIndex * blockSize + nextOffsetInBlock
      offsets.push(offset)
      blocksToBeWritten.set(latestBlockIndex, {
        blockBuf: latestBlockBuf,
        offset,
      })
      nextOffsetInBlock += Record.size(encodedData)
      debug('data inserted at offset %d', offset)
    }

    scheduleWrite()

    return cb(null, offsets)
  }

  const scheduleWrite = debounce(write, writeTimeout)

  function write() {
    if (blocksToBeWritten.size === 0) return
    const blockIndex = blocksToBeWritten.keys().next().value
    const blockStart = blockIndex * blockSize
    const { blockBuf, offset } = blocksToBeWritten.get(blockIndex)
    blocksToBeWritten.delete(blockIndex)

    debug(
      'writing block of size: %d, to offset: %d',
      blockBuf.length,
      blockIndex * blockSize
    )
    writingBlockIndex = blockIndex
    writeWithFSync(blockStart, blockBuf, null, function onBlockWritten(err) {
      const drainsBefore = (waitingDrain.get(blockIndex) || []).slice(0)
      writingBlockIndex = -1
      if (err) {
        debug('failed to write block %d', blockIndex)
        throw err
      } else {
        since.set(offset)

        // write values to live streams
        for (const stream of self.streams) {
          if (stream.live) stream.liveResume()
        }

        debug(
          'draining the waiting queue for %d, items: %d',
          blockIndex,
          drainsBefore.length
        )
        for (let i = 0; i < drainsBefore.length; ++i) drainsBefore[i]()

        // the resumed streams might have added more to waiting
        let drainsAfter = waitingDrain.get(blockIndex) || []
        if (drainsBefore.length === drainsAfter.length)
          waitingDrain.delete(blockIndex)
        else if (drainsAfter.length === 0) waitingDrain.delete(blockIndex)
        else
          waitingDrain.set(
            blockIndex,
            waitingDrain.get(blockIndex).slice(drainsBefore.length)
          )

        write() // next!
      }
    })
  }

  function onStreamsDone(cb) {
    if ([...self.streams].every((stream) => stream.cursor === since.value)) {
      return cb()
    }
    const interval = setInterval(function checkIfStreamsDone() {
      for (const stream of self.streams) {
        if (stream.cursor < since.value) return
      }
      clearInterval(interval)
      cb()
    }, 100)
    if (interval.unref) interval.unref()
  }

  function overwrite(blockIndex, blockBuf, cb) {
    cache.set(blockIndex, blockBuf)
    const blockStart = blockIndex * blockSize
    writeWithFSync(blockStart, blockBuf, null, cb)
  }

  function truncate(newLatestBlockIndex, cb) {
    if (newLatestBlockIndex > latestBlockIndex) {
      return cb(unexpectedTruncationErr())
    }
    if (newLatestBlockIndex === latestBlockIndex) {
      const blockStart = latestBlockIndex * blockSize
      loadLatestBlock(blockStart, function onTruncateLoadedLatestBlock1(err) {
        if (err) cb(err)
        else cb(null, 0)
      })
      return
    }
    const size = (latestBlockIndex + 1) * blockSize
    const newSize = (newLatestBlockIndex + 1) * blockSize
    for (let i = newLatestBlockIndex + 1; i < latestBlockIndex; ++i) {
      cache.delete(i)
    }
    truncateWithFSync(newSize, function onTruncateWithFSyncDone(err) {
      if (err) return cb(err)
      const blockStart = newSize - blockSize
      loadLatestBlock(blockStart, function onTruncateLoadedLatestBlock2(err) {
        if (err) return cb(err)
        const sizeDiff = size - newSize
        cb(null, sizeDiff)
      })
    })
  }

  function stats(cb) {
    if (since.value == null) {
      since((totalBytes) => {
        cb(null, { totalBytes: Math.max(0, totalBytes), deletedBytes })
        return false
      })
    } else {
      cb(null, { totalBytes: Math.max(0, since.value), deletedBytes })
    }
  }

  function saveStats(cb) {
    const stats = JSON.stringify({ deletedBytes })
    AtomicFile.writeFile(statsFilename, stats, 'utf8', cb)
  }

  function compact(cb) {
    if (compaction) {
      debug('compaction already in progress')
      waitingCompaction.push(cb)
      return
    }
    for (const stream of self.streams) {
      if (stream.live && (stream.max || stream.max_inclusive)) {
        return cb(compactWithMaxLiveStreamErr())
      }
    }
    onStreamsDone(function startCompactAfterStreamsDone() {
      onDrain(function startCompactAfterDrain() {
        onDeletesFlushed(function startCompactAfterDeletes() {
          if (compactionProgress.value.done) {
            compactionProgress.set({ percent: 0, done: false })
          }
          compaction = new Compaction(self, (err, stats) => {
            compaction = null
            if (err) return cb(err)
            deletedBytes = 0
            saveStats(function onSavedStatsAfterCompaction(err) {
              if (err)
                debug('error saving stats after compaction: %s', err.message)
            })
            for (const stream of self.streams) {
              if (stream.live) stream.postCompactionReset(since.value)
            }
            compactionProgress.set({ ...stats, percent: 1, done: true })
            for (const callback of waitingCompaction) callback()
            waitingCompaction.length = 0
            cb()
          })
          let prevUpdate = 0
          compaction.progress((stats) => {
            const now = Date.now()
            if (now - prevUpdate > COMPACTION_PROGRESS_EMIT_INTERVAL) {
              prevUpdate = now
              compactionProgress.set({ ...stats, done: false })
            }
          })
        })
      })
    })
  }

  function close(cb) {
    onDrain(function closeAfterHavingDrained() {
      onDeletesFlushed(function closeAfterDeletesFlushed() {
        for (const stream of self.streams) stream.abort(true)
        self.streams.clear()
        raf.close(cb)
      })
    })
  }

  function onLoad(fn) {
    return function waitForLogLoaded(...args) {
      if (latestBlockBuf === null) waitingLoad.push(fn.bind(null, ...args))
      else fn(...args)
    }
  }

  function onDrain(fn) {
    if (compaction) {
      waitingCompaction.push(fn)
      return
    }
    if (blocksToBeWritten.size === 0 && writingBlockIndex === -1) fn()
    else {
      const latestBlockIndex =
        blocksToBeWritten.size > 0
          ? last(blocksToBeWritten.keys())
          : writingBlockIndex
      const drains = waitingDrain.get(latestBlockIndex) || []
      drains.push(fn)
      waitingDrain.set(latestBlockIndex, drains)
    }
  }

  function last(iterable) {
    let res = null
    for (let x of iterable) res = x
    return res
  }

  return (self = {
    // Public API:
    get: onLoad(get),
    del: onLoad(del),
    append: onLoad(append),
    appendTransaction: onLoad(appendTransaction),
    close: onLoad(close),
    onDrain: onLoad(onDrain),
    onDeletesFlushed: onLoad(onDeletesFlushed),
    compact: onLoad(compact),
    since,
    stats,
    compactionProgress,
    stream(opts) {
      const stream = new Stream(self, opts)
      self.streams.add(stream)
      return stream
    },

    // Internals needed by ./compaction.js:
    filename,
    blockSize,
    overwrite,
    truncate,
    hasNoSpaceFor,
    // Internals needed by ./stream.js:
    onLoad,
    getNextBlockStart,
    getDataNextOffset,
    getBlock,
    streams: new Set(),
  })
}
