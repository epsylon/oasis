const messageId = {
  type: 'string',
  $comment: '42 chars + 1 char from a limited subset (last bits are 0) + 1 =',
  pattern: '^ssb:message/classic/[a-zA-Z0-9_\\-]{42}[AEIMQUYcgkosw048]=$'
}

const groupId = {
  type: 'string',
  pattern: '^ssb:identity/group/[a-zA-Z0-9_\\-]{42}[AEIMQUYcgkosw048]=$'
}

const feedId = {
  type: 'string',
  pattern: '^ssb:feed/bendybutt-v1/[a-zA-Z0-9_\\-]{42}[AEIMQUYcgkosw048]=$'
}

const secret = {
  type: 'string',
  pattern: '^[a-zA-Z0-9\\/+]{42}[AEIMQUYcgkosw048]=$'
}

const tangle = {
  root: {
    type: 'object',
    required: ['root', 'previous'],
    properties: {
      root: { type: 'null' },
      previous: { type: 'null' }
    }
  },
  update: {
    type: 'object',
    required: ['root', 'previous'],
    properties: {
      root: { $ref: '#/definitions/messageId' },
      previous: {
        type: 'array',
        items: [{ $ref: '#/definitions/messageId' }],
        minItems: 1
      }
    }
  },
  any: {
    oneOf: [
      { $ref: '#/definitions/tangle/root' },
      { $ref: '#/definitions/tangle/update' }
    ]
  }
}

// USAGE:
// definitions: {
//   ...definitions.groupId,
//   ...definitions.tangle.update   // not this pull in everything needed for this defn
// }

module.exports = {
  messageId: { messageId },
  groupId: { groupId },
  feedId: { feedId },
  secret: { secret },
  tangle: {
    root: {
      tangle: {
        root: tangle.root
      }
    },
    update: {
      messageId,
      tangle: {
        update: tangle.update
      }
    },
    any: {
      messageId,
      tangle: {
        root: tangle.root,
        update: tangle.update,
        any: tangle.any
      }
    }
  }
}
