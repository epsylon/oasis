// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: LGPL-3.0-only

module.exports = function init(ssb) {
  if (ssb.db) ssb.db.installFeedFormat(require('./format'))
}
