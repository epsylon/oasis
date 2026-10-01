// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const test = require('tape')
const { join } = require('path')
const types = require('../generate-schema')

test('generate-schema : up to date', t => {
  types.forEach(type => {
    const jsonSchema = require(join('..', type, 'schema.json'))
    const jsSchema = require(join('..', type, 'schema.js'))

    t.deepEqual(jsonSchema, jsSchema, type)
  })

  t.end()
})
