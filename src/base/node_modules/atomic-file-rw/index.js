// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: MIT

if (typeof localStorage === "undefined" || localStorage === null)
  module.exports = require("./fs")
else
  module.exports = require("./browser")
