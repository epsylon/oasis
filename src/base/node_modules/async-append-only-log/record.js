// SPDX-FileCopyrightText: 2022 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

/*
Binary format for a Record:

<record>
  <dataLength: UInt16LE>
  <dataBuf: Arbitrary Bytes>
</record>

The "Header" is the first two bytes for the dataLength.
*/

const HEADER_SIZE = 2 // uint16

function size(dataBuf) {
  return HEADER_SIZE + dataBuf.length
}

function readDataLength(blockBuf, offsetInBlock) {
  return blockBuf.readUInt16LE(offsetInBlock)
}

function readSize(blockBuf, offsetInBlock) {
  const dataLength = readDataLength(blockBuf, offsetInBlock)
  return HEADER_SIZE + dataLength
}

function read(blockBuf, offsetInBlock) {
  const dataLength = readDataLength(blockBuf, offsetInBlock)
  const dataStart = offsetInBlock + HEADER_SIZE
  const dataBuf = blockBuf.slice(dataStart, dataStart + dataLength)
  const size = HEADER_SIZE + dataLength
  return [dataBuf, size]
}

function write(blockBuf, offsetInBlock, dataBuf) {
  blockBuf.writeUInt16LE(dataBuf.length, offsetInBlock) // write dataLength
  dataBuf.copy(blockBuf, offsetInBlock + HEADER_SIZE) // write dataBuf
}

function overwriteWithZeroes(blockBuf, offsetInBlock) {
  const dataLength = readDataLength(blockBuf, offsetInBlock)
  const dataStart = offsetInBlock + HEADER_SIZE
  const dataEnd = dataStart + dataLength
  blockBuf.fill(0, dataStart, dataEnd)
}

module.exports = {
  HEADER_SIZE,
  size,
  readDataLength,
  readSize,
  read,
  write,
  overwriteWithZeroes,
}
