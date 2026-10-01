// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const { tangle, feedId, groupId } = require('../definitions')

module.exports = {
  type: 'object',
  required: ['type', 'excludes', 'recps', 'tangles'],
  properties: {
    type: {
      type: 'string',
      pattern: '^group/exclude-member$'
    },
    excludes: {
      type: 'array',
      items: [{ $ref: '#/definitions/feedId' }],
      minItems: 1
    },
    recps: {
      type: 'array',
      items: [{ $ref: '#/definitions/groupId' }],
      minItems: 1,
      maxItems: 1
    },
    tangles: {
      type: 'object',
      required: ['group', 'members'],
      additionalProperties: false,
      properties: {
        group: { $ref: '#/definitions/tangle/update' },
        members: { $ref: '#/definitions/tangle/update' }
      }
    }
  },
  additionalProperties: false,
  definitions: {
    ...feedId,
    ...groupId,
    ...tangle.update
  }
}
