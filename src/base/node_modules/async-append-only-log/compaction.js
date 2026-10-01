// SPDX-FileCopyrightText: 2022 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const RAF = require('polyraf')
const fs = require('fs')
const Obv = require('obz')
const push = require('push-stream')
const mutexify = require('mutexify')
const debug = require('debug')('async-append-only-log')
const Record = require('./record')

function getStateFilename(logFilename) {
  return logFilename + '.compaction'
}

function stateFileExists(logFilename) {
  return fs.existsSync(getStateFilename(logFilename))
}

const NO_TRUNCATE = 0xffffffff

/**
 * This file has state describing the continuation of the compaction algorithm.
 *
 * - bytes 0..3: UInt32LE for the version of this file format
 *               smallest version is 1.
 * - bytes 4..7: UInt32LE for the startOffset, usually the start of some block
 * - bytes 8..11: UInt32LE for block index where to perform truncation
 *                where 0xFFFFFFFF means no truncation to-be-done yet
 * - bytes 12..15: UInt32LE for the blockIndex to-be-compacted
 * - bytes 16..19: UInt32LE for the 1st unshifted record's offset
 * - bytes 20..(20+blockSize-1): blockBuf containing the 1st unshifted record
 */
function PersistentState(logFilename, blockSize) {
  const raf = RAF(getStateFilename(logFilename))
  const writeLock = mutexify()
  const stateFileSize = 4 + 4 + 4 + 4 + 4 + blockSize

  function load(cb) {
    raf.stat(function onRAFStatDone(err, stat) {
      const fileSize = !err && stat ? stat.size : -1
      if (fileSize <= 0) {
        const state = {
          version: 1,
          startOffset: 0,
          truncateBlockIndex: NO_TRUNCATE,
          compactedBlockIndex: 0,
          unshiftedOffset: 0,
          unshiftedBlockBuffer: null,
          initial: true,
        }
        cb(null, state)
      } else {
        raf.read(0, stateFileSize, function onFirstRAFReadDone(err, buf) {
          if (err) return cb(err)
          const state = {
            version: buf.readUInt32LE(0),
            startOffset: buf.readUInt32LE(4),
            truncateBlockIndex: buf.readUInt32LE(8),
            compactedBlockIndex: buf.readUInt32LE(12),
            unshiftedOffset: buf.readUInt32LE(16),
            unshiftedBlockBuf: buf.slice(20),
            initial: false,
          }
          cb(null, state)
        })
      }
    })
  }

  function save(state, cb) {
    const buf = Buffer.alloc(stateFileSize)
    buf.writeUInt32LE(state.version, 0)
    buf.writeUint32LE(state.startOffset, 4)
    buf.writeUInt32LE(state.truncateBlockIndex, 8)
    buf.writeUInt32LE(state.compactedBlockIndex, 12)
    buf.writeUInt32LE(state.unshiftedOffset, 16)
    state.unshiftedBlockBuf.copy(buf, 20)
    writeLock((unlock) => {
      raf.write(0, buf, function onRafWriteDone(err) {
        if (err) return unlock(cb, err)
        if (raf.fd) {
          fs.fsync(raf.fd, function onFsyncDone(err) {
            if (err) unlock(cb, err)
            else unlock(cb, null, state)
          })
        } else unlock(cb, null, state)
      })
    })
  }

  function destroy(cb) {
    if (stateFileExists(logFilename)) {
      raf.close(function onRAFClosed(err) {
        if (err) return cb(err)
        fs.unlink(raf.filename, cb)
      })
    } else {
      cb()
    }
  }

  return {
    load,
    save,
    destroy,
  }
}

/**
 * Compaction is the process of removing deleted records from the log by
 * rewriting blocks in the log *in situ*, moving ("shifting") subsequent records
 * to earlier slots, to fill the spaces left by the deleted records.
 *
 * The compaction algorithm is, at a high level:
 * - Keep track of some state, comprised of:
 *   - compactedBlockIndex: blockIndex of the current block being compacted.
 *     all blocks before this have already been compacted. This state always
 *     increases, never decreases.
 *   - unshiftedOffset: offset of the first unshifted record in the log, that
 *     is, the first record that has not been shifted to earlier slots. This
 *     offset is greater or equal to the compacted block's start offset, and
 *     may be either in the same block as the compacted block, or even in a much
 *     later block. This state always increases, never decreases.
 *   - unshiftedBlockBuf: the block containing the first unshifted record
 * - Save the state to disk
 * - Compact one block at a time, in increasing order of blockIndex
 * - When a block is compacted, the state file is updated
 * - Once all blocks have been compacted, delete the state file
 */
function Compaction(log, onDone) {
  const persistentState = PersistentState(log.filename, log.blockSize)
  const progress = Obv() // for the unshifted offset
  let startOffset = 0
  let version = 0
  let holesFound = 0
  let hasHoles = true // assume true

  let compactedBlockIndex = -1
  let compactedBlockBuf = null
  let compactedOffset = 0
  let compactedBlockIdenticalToUnshifted = true

  let unshiftedBlockIndex = 0
  let unshiftedBlockBuf = null
  let unshiftedOffset = 0

  let truncateBlockIndex = NO_TRUNCATE

  loadPersistentState(function onCompactionStateLoaded2(err) {
    if (err) return onDone(err)
    if (truncateBlockIndex !== NO_TRUNCATE) {
      truncateAndBeDone()
    } else {
      compactedBlockIndex -= 1 // because it'll be incremented very soon
      compactNextBlock()
    }
  })

  function loadPersistentState(cb) {
    persistentState.load(function onCompactionStateLoaded(err, state) {
      if (err) return cb(err)
      if (state.version !== 1) return cb(new Error('unsupported state version'))
      version = state.version
      startOffset = state.startOffset
      truncateBlockIndex = state.truncateBlockIndex
      compactedBlockIndex = state.compactedBlockIndex
      unshiftedOffset = state.unshiftedOffset
      unshiftedBlockBuf = state.unshiftedBlockBuf
      unshiftedBlockIndex = Math.floor(state.unshiftedOffset / log.blockSize)
      if (state.initial) {
        findStateFromLog(function foundStateFromLog(err, state) {
          if (err) return cb(err)
          compactedBlockIndex = state.compactedBlockIndex
          startOffset = compactedBlockIndex * log.blockSize
          unshiftedOffset = state.unshiftedOffset
          unshiftedBlockBuf = state.unshiftedBlockBuf
          unshiftedBlockIndex = Math.floor(unshiftedOffset / log.blockSize)
          savePersistentState(cb)
        })
      } else {
        cb()
      }
    })
  }

  function savePersistentState(cb) {
    if (!unshiftedBlockBuf) {
      loadUnshiftedBlock(saveIt)
    } else {
      saveIt()
    }

    function saveIt() {
      persistentState.save(
        {
          version,
          startOffset,
          truncateBlockIndex,
          compactedBlockIndex,
          unshiftedOffset,
          unshiftedBlockBuf,
        },
        cb
      )
    }
  }

  function findStateFromLog(cb) {
    findFirstDeletedOffset(function gotFirstDeleted(err, holeOffset) {
      if (err) return cb(err)
      if (holeOffset === -1) {
        compactedBlockIndex = Math.floor(log.since.value / log.blockSize)
        hasHoles = false
        stop()
        return
      }
      const blockStart = holeOffset - (holeOffset % log.blockSize)
      const blockIndex = Math.floor(holeOffset / log.blockSize)
      findNonDeletedOffsetGTE(blockStart, function gotNonDeleted(err, offset) {
        if (err) return cb(err)
        if (offset === -1) {
          compactedBlockIndex = Math.floor((holeOffset - 1) / log.blockSize)
          stop()
          return
        }
        holesFound = offset > holeOffset ? 1 : 0
        const state = {
          compactedBlockIndex: blockIndex,
          unshiftedOffset: offset,
          unshiftedBlockBuf: null,
        }
        cb(null, state)
      })
    })
  }

  function findFirstDeletedOffset(cb) {
    log.stream({ offsets: true, values: true }).pipe(
      push.drain(
        function sinkToFindFirstDeleted(record) {
          if (record.value === null) {
            cb(null, record.offset)
            return false // abort push.drain
          }
        },
        function sinkEndedLookingForDeleted() {
          cb(null, -1)
        }
      )
    )
  }

  function findNonDeletedOffsetGTE(gte, cb) {
    log.stream({ gte, offsets: true, values: true }).pipe(
      push.drain(
        function sinkToFindNonDeleted(record) {
          if (record.value !== null) {
            cb(null, record.offset)
            return false // abort push.drain
          }
        },
        function sinkEndedLookingForNonDeleted() {
          cb(null, -1)
        }
      )
    )
  }

  function continueCompactingBlock() {
    while (true) {
      // Fetch the unshifted block, if necessary
      if (!unshiftedBlockBuf) {
        loadUnshiftedBlock(continueCompactingBlock)
        return
      }
      // When all records have been shifted (thus end of log), stop compacting
      if (unshiftedBlockIndex === -1) {
        saveCompactedBlock(function onCompactedBlockSaved(err) {
          if (err) return onDone(err)
          stop()
        })
        return
      }
      const [unshiftedDataBuf, unshiftedRecSize] = getUnshiftedRecord()
      // Get a non-deleted unshifted record, if necessary
      if (!unshiftedDataBuf) {
        holesFound += 1
        goToNextUnshifted()
        continue
      }
      const compactedBlockStart = compactedBlockIndex * log.blockSize
      const offsetInCompactedBlock = compactedOffset - compactedBlockStart
      // Proceed to compact the next block if this block is full
      if (log.hasNoSpaceFor(unshiftedDataBuf, offsetInCompactedBlock)) {
        saveCompactedBlock()
        setImmediate(compactNextBlock)
        return
      }

      if (
        compactedBlockIndex !== unshiftedBlockIndex ||
        compactedOffset !== unshiftedOffset
      ) {
        compactedBlockIdenticalToUnshifted = false
      }

      // Copy record to new compacted block
      Record.write(compactedBlockBuf, offsetInCompactedBlock, unshiftedDataBuf)
      goToNextUnshifted()
      compactedOffset += unshiftedRecSize
    }
  }

  function saveCompactedBlock(cb) {
    if (compactedBlockIdenticalToUnshifted) {
      if (cb) cb()
    } else {
      const blockIndex = compactedBlockIndex
      log.overwrite(blockIndex, compactedBlockBuf, function onOverwritten(err) {
        if (err && cb) cb(err)
        else if (err) return onDone(err)
        else {
          debug('compacted block %d', blockIndex)
          if (cb) cb()
        }
      })
    }
  }

  function loadUnshiftedBlock(cb) {
    const blockStart = unshiftedBlockIndex * log.blockSize
    log.getBlock(blockStart, function onBlockLoaded(err, blockBuf) {
      if (err) return onDone(err)
      unshiftedBlockBuf = blockBuf
      cb()
    })
  }

  function getUnshiftedRecord() {
    const [, dataBuf, recSize] = log.getDataNextOffset(
      unshiftedBlockBuf,
      unshiftedOffset,
      true
    )
    return [dataBuf, recSize]
  }

  function goToNextUnshifted() {
    let [nextOffset] = log.getDataNextOffset(
      unshiftedBlockBuf,
      unshiftedOffset,
      true
    )
    if (nextOffset === -1) {
      unshiftedBlockIndex = -1
    } else if (nextOffset === 0) {
      unshiftedBlockIndex += 1
      unshiftedBlockBuf = null
      unshiftedOffset = unshiftedBlockIndex * log.blockSize
    } else {
      unshiftedOffset = nextOffset
    }
  }

  function compactNextBlock() {
    compactedBlockIndex += 1
    compactedBlockBuf = Buffer.alloc(log.blockSize)
    compactedOffset = compactedBlockIndex * log.blockSize
    compactedBlockIdenticalToUnshifted = true
    progress.set(calculateProgressStats())
    savePersistentState(function onCompactionStateSaved(err) {
      if (err) return onDone(err)
      continueCompactingBlock()
    })
  }

  function calculateProgressStats() {
    const percent =
      (unshiftedOffset - startOffset) / (log.since.value - startOffset)
    return {
      startOffset,
      compactedOffset,
      unshiftedOffset,
      percent,
    }
  }

  function stop() {
    compactedBlockBuf = null
    unshiftedBlockBuf = null
    truncateBlockIndex = compactedBlockIndex
    const state = {
      version,
      startOffset,
      truncateBlockIndex,
      compactedBlockIndex: 0,
      unshiftedOffset: 0,
      unshiftedBlockBuf: Buffer.alloc(0),
    }
    persistentState.save(state, function onTruncateStateSaved(err) {
      if (err) return onDone(err)
      truncateAndBeDone()
    })
  }

  function truncateAndBeDone() {
    if (truncateBlockIndex === NO_TRUNCATE) {
      return onDone(new Error('Cannot truncate log yet'))
    }
    log.truncate(truncateBlockIndex, function onTruncatedLog(err, sizeDiff) {
      if (err) return onDone(err)
      persistentState.destroy(function onStateDestroyed(err) {
        if (err) return onDone(err)
        if (sizeDiff === 0 && hasHoles) {
          // Truncation did not make the log smaller but it did rewrite the log.
          // So report 1 byte as a way of saying that compaction filled holes.
          onDone(null, { sizeDiff: 1, holesFound })
        } else {
          onDone(null, { sizeDiff, holesFound })
        }
      })
    })
  }

  return {
    progress,
  }
}

Compaction.stateFileExists = stateFileExists

module.exports = Compaction
