// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const { secret, tangle, groupId, feedId } = require('../../definitions')

module.exports = {
  type: 'object',
  required: ['type', 'version', 'secret', 'tangles', 'recps'],
  properties: {
    type: {
      type: 'string',
      pattern: '^group/init$'
    },
    version: {
      type: 'string',
      pattern: '^v2$'
    },
    secret: { $ref: '#/definitions/secret' },
    tangles: {
      type: 'object',
      required: ['group', 'epoch', 'members'],
      additionalProperties: false,
      properties: {
        group: { $ref: '#/definitions/tangle/update' },
        epoch: { $ref: '#/definitions/tangle/update' },
        members: { $ref: '#/definitions/tangle/root' }
      }
    },
    recps: {
      type: 'array',
      items: [
        { $ref: '#/definitions/groupId' },
        { $ref: '#/definitions/feedId' }
      ],
      minItems: 2,
      maxItems: 2
    }
  },
  additionalProperties: false,
  definitions: {
    ...secret,
    ...groupId,
    ...feedId,
    ...tangle.any // this pulls in tangle.root and tangle.update
  }
}
