// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const blake3 = require('blake3')

function makeContentHash(contentBuffer) {
  return Buffer.concat([Buffer.from([0]), blake3.hash(contentBuffer)])
}

module.exports = makeContentHash
