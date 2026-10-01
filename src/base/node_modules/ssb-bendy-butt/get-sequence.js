// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

const extract = require('./extract')

function getSequence(nativeMsg) {
  const { sequence } = extract(nativeMsg)
  return sequence
}

module.exports = getSequence
