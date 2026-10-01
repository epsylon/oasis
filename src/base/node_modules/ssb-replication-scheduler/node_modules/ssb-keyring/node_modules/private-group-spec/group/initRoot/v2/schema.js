// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: LGPL-3.0-only

const { secret, tangle } = require('../../definitions')

module.exports = {
  type: 'object',
  required: ['type', 'version', 'secret', 'tangles'],
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
      properties: {
        group: { $ref: '#/definitions/tangle/root' },
        epoch: { $ref: '#/definitions/tangle/root' },
        members: { $ref: '#/definitions/tangle/root' }
      }
    }
  },
  additionalProperties: false,
  definitions: {
    ...secret,
    ...tangle.root
  }
}
