// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros <contact@staltz.com>
//
// SPDX-License-Identifier: LGPL-3.0-only

module.exports = function init(ssb) {
  if (ssb.db) ssb.db.installFeedFormat(require('./format'))
}
