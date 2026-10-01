// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const { groupId, tangle } = require('../definitions')

module.exports = {
  $schema: 'http://json-schema.org/schema#',
  type: 'object',
  required: [
    'type',
    'recps',
    'tangles'
  ],
  properties: {
    type: { type: 'string' },
    recps: {
      type: 'array',
      items: [
        { $ref: '#/definitions/groupId' }
      ],
      minItems: 1,
      maxItems: 1
    },
    tangles: {
      type: 'object',
      required: ['group'],
      properties: {
        group: { $ref: '#/definitions/tangle/update' }
      }
    }
  },
  definitions: {
    ...groupId,
    ...tangle.update
  }
}
