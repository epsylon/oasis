const definitions = require('ssb-schema-definitions')

module.exports = {
  $schema: 'http://json-schema.org/schema#',
  type: 'object',
  required: ['type', 'text'],
  properties: {
    type: {
      type: 'string',
      pattern: '^post$'
    },
    text: { type: 'string' },

    // optional
    contentWarning: { $ref: '#/definitions/contentWarning' },
    recps: { $ref: '#/definitions/recps' },
    mentions: { $ref: '#/definitions/mentions/any' },

    // none of these
    root: { type: 'null' },
    branch: { type: 'null' },
    fork: { type: 'null' }
  },
  definitions
}
