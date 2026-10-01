const definitions = require('ssb-schema-definitions')

module.exports = {
  $schema: 'http://json-schema.org/schema#',
  type: 'object',
  required: ['type', 'root', 'fork', 'text'],
  properties: {
    type: {
      type: 'string',
      pattern: '^post$'
    },
    root: { $ref: '#/definitions/root' },
    branch: { $ref: '#/definitions/branch' },
    fork: { $ref: '#/definitions/messageId' },
    text: { type: 'string' },

    // optional
    recps: { $ref: '#/definitions/recps' },
    mentions: { $ref: '#/definitions/mentions/any' }
  },
  definitions
}
