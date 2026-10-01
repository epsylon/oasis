const BlobId = {
  type: 'BlobId',
  description: 'the hash of the blob, in ssb blob id format: &{hash-as-base64}.{hash-algorithum}',
  optional: false
}

const BlobOpts = {
  id: BlobId
}

module.exports = {
  description: 'retrive, store, and share blobs',
  commands: {
    add: {
      type: 'sink',
      description: 'add a blob',
      args: {
        id: Object.assign(BlobId, { optional: true })
      }
    },
    get: {
      type: 'source',
      description: 'get a blob',
      args: BlobOpts
    },
    getSlice: {
      type: 'source',
      description: 'get part of a blob',
      args: {
        id: BlobId,
        size: {
          type: 'number',
          description: 'reject if not exactly this size',
          optional: true
        },
        max: {
          type: 'number',
          description: 'reject if more than this size',
          optional: true
        },
        start: {
          type: 'number',
          description: 'start stream from this byte',
          optional: true
        },
        end: {
          type: 'number',
          description: 'stream until this byte',
          optional: true
        }
      }
    },
    has: {
      type: 'async',
      description: 'check if a blob is in the local store',
      args: BlobOpts
    },
    size: {
      type: 'async',
      description: 'get the size for a blob in the local store',
      args: BlobOpts
    },
    want: {
      type: 'async',
      description: 'request a blob from the network, wait until found or timeout',
      args: BlobOpts
    },
    push: {
      type: 'async',
      description: 'ask the network to take the blob, wait until at least 3 peers have it',
      args: BlobOpts
    },
    rm: {
      type: 'async',
      description: 'remove a blob from the local store',
      args: BlobOpts
    },
    ls: {
      type: 'source',
      description: 'list all blobs',
      args: {
        meta: {
          type: 'boolean',
          description: 'include all metadata, id, size, receive timestamp',
          optional: true
        },
        long: {
          type: 'boolean',
          description: 'long format, like in `ls -l synonym for --meta. `',
          optional: true
        },
        old: {
          type: 'boolean',
          description: 'include old data, default: true',
          optional: true
        },
        live: {
          type: 'boolean',
          description: 'stream real time changes, default: false',
          optional: true
        }
      }
    }
  }

}
