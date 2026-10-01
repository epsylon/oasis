const { msgIdRegex, feedIdRegex, blobIdRegex } = require('ssb-ref')
const channelRegex = /^#[^\s]+/
// TODO find a canonical ssb definition of channel
if (!msgIdRegex || !feedIdRegex || !blobIdRegex) throw new Error('ssb-schema-definitions is missing a regex!')

module.exports = {
  messageId: {
    type: 'string',
    pattern: msgIdRegex
  },
  feedId: {
    type: 'string',
    pattern: feedIdRegex
  },
  blobId: {
    type: 'string',
    pattern: blobIdRegex
  },
  channel: {
    type: 'string',
    pattern: channelRegex
  },
  mentions: {
    message: {
      type: 'object',
      required: ['link'],
      properties: {
        link: { $ref: '#/definitions/messageId' }
      }
    },
    feed: {
      type: 'object',
      required: ['link', 'name'],
      properties: {
        link: { $ref: '#/definitions/feedId' },
        name: { type: 'string' }
      }
    },
    blob: {
      type: 'object',
      required: ['link', 'name'],
      properties: {
        link: { $ref: '#/definitions/blobId' },
        name: { type: 'string' }
      }
    },
    channel: {
      type: 'object',
      required: ['link'],
      properties: {
        link: { $ref: '#/definitions/channel' }
      }
    },
    any: {
      oneOf: [
        { type: 'null' },
        {
          type: 'array',
          items: {
            oneOf: [
              { $ref: '#/definitions/feedId' },
              { $ref: '#/definitions/messageId' },
              { $ref: '#/definitions/blobId' },
              { $ref: '#/definitions/mentions/feed' },
              { $ref: '#/definitions/mentions/message' },
              { $ref: '#/definitions/mentions/blob' },
              { $ref: '#/definitions/mentions/channel' }
            ]
          }
        }
      ]
    }
  },
  root: { $ref: '#/definitions/messageId' },
  branch: {
    oneOf: [
      { $ref: '#/definitions/messageId' },
      {
        type: 'array',
        items: {
          oneOf: [
            { $ref: '#/definitions/messageId' }
          ]
        }
      }
    ]
  },
  recps: {
    oneOf: [
      { type: 'null' },
      {
        type: 'array',
        items: {
          oneOf: [
            { $ref: '#/definitions/feedId' }
            // { $ref: '#/definitions/mentions/feed' }
          ]
        },
        minItems: 1,
        maxItems: 7
      }
    ]
  },
  contentWarning: {
    type: 'string',
    minLength: 1
  },
  encrypt: {
    // TODO this needs testing and probably needs the following added:
    // type: 'object'
    // required: ['box'],
    // properties: {
    box: {
      type: 'string',
      pattern: '\.box$' // was giving me grief so I brutally trimmed it
    }
  },
  image: {
    type: 'object',
    required: ['blob', 'mimeType'],
    properties: {
      blob: { $ref: '#/definitions/blobId' },
      mimeType: {
        type: 'string',
        pattern: '^image/.*$'
      },
      size: { type: 'integer' },
      width: { type: 'integer' },
      height: { type: 'integer' }
    }
  }
}
