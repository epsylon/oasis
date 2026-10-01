module.exports = {
  description: 'accept and create pub/followbot invites',
  commands: {
    create: {
      type: 'async',
      description: 'create an invite code, must be called on a pub with a static address',
      args: {
        uses: {
          type: 'number',
          description: 'number of times this invite may be used'
        },
        modern: {
          type: 'boolean',
          description: 'return an invite which is also a multiserver address. all modern invites have a single use'
        },
        external: {
          type: 'Host',
          description: "overide the pub's host name in the invite code"
        },
        note: {
          type: 'any',
          description: 'metadata to attach to invite. this will be included in the contact message when the pub accepts this code'
        }
      }
    },
    accept: {
      type: 'async',
      description: 'accept an invite, connects to the pub, requests invite, then follows pub if successful',
      args: {
        invite: {
          type: 'InviteCode',
          description: 'the invite code to accept'
        }
      }
    }
  }
}
