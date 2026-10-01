const definitions = require('ssb-schema-definitions')

module.exports = {
  $schema: 'http://json-schema.org/schema#',
  type: 'object',
  required: ['type', 'root', 'text'],
  // see ./README.md for why branch not in required
  properties: {
    type: {
      type: 'string',
      pattern: '^post$'
    },
    root: { $ref: '#/definitions/root' },
    branch: { $ref: '#/definitions/branch' },
    text: { type: 'string' },

    // optional
    contentWarning: { $ref: '#/definitions/contentWarning' },
    recps: { $ref: '#/definitions/recps' },
    mentions: { $ref: '#/definitions/mentions/any' },

    // none of these
    fork: { type: 'null' }
  },
  definitions
}
