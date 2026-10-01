const definitions = require('ssb-schema-definitions')

module.exports = {
  $schema: 'http://json-schema.org/schema#',
  type: 'object',
  required: ['type', 'fork', 'text'],
  properties: {
    type: {
      type: 'string',
      pattern: '^post$'
    },
    fork: { $ref: '#/definitions/messageId' },
    text: { type: 'string' },

    // optional
    recps: { $ref: '#/definitions/recps' },
    mentions: { $ref: '#/definitions/mentions/any' },

    // none of these
    root: { type: 'null' },
    branch: { type: 'null' }
  },
  definitions
}
