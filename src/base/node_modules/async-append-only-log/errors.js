// SPDX-FileCopyrightText: 2022 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

class ErrorWithCode extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

function nanOffsetErr(offset) {
  return new ErrorWithCode(
    `Offset ${offset} is not a number`,
    'ERR_AAOL_INVALID_OFFSET'
  )
}

function negativeOffsetErr(offset) {
  return new ErrorWithCode(
    `Offset ${offset} is negative`,
    'ERR_AAOL_INVALID_OFFSET'
  )
}

function outOfBoundsOffsetErr(offset, logSize) {
  return new ErrorWithCode(
    `Offset ${offset} is beyond log size ${logSize}`,
    'ERR_AAOL_OFFSET_OUT_OF_BOUNDS'
  )
}

function deletedRecordErr() {
  return new ErrorWithCode('Record has been deleted', 'ERR_AAOL_DELETED_RECORD')
}

function delDuringCompactErr() {
  return new Error('Cannot delete while compaction is in progress')
}

function compactWithMaxLiveStreamErr() {
  return new Error(
    'Compaction cannot run if there are live streams ' +
      'configured with opts.lt or opts.lte'
  )
}

function appendLargerThanBlockErr() {
  return new Error('Data to be appended is larger than block size')
}

function appendTransactionWantsArrayErr() {
  return new Error('appendTransaction expects first argument to be an array')
}

function unexpectedTruncationErr() {
  return new Error(
    'truncate() is trying to *increase* the log size, ' +
      'which is totally unexpected. ' +
      'There may be a logic bug in async-append-only-log'
  )
}

module.exports = {
  ErrorWithCode,
  nanOffsetErr,
  negativeOffsetErr,
  outOfBoundsOffsetErr,
  deletedRecordErr,
  delDuringCompactErr,
  compactWithMaxLiveStreamErr,
  appendLargerThanBlockErr,
  appendTransactionWantsArrayErr,
  unexpectedTruncationErr,
}
