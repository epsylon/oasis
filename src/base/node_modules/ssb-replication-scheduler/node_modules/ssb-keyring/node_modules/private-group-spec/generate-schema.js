// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const { join } = require('path')
const fs = require('fs')

const types = [
  'group/initRoot/v2',
  'group/initEpoch/v2',
  'group/add-member/v2',
  'group/content',
  'group/exclude-member',
]

module.exports = types

if (!module.parent) {
  types.forEach((type) => {
    const inputPath = '.' + join('/', type, 'schema.js')
    const schema = require(inputPath)

    const outputPath = join(__dirname, type, 'schema.json')
    const content = JSON.stringify(schema, null, 2)
    fs.writeFileSync(outputPath, content)
  })
}
