const test = require('tape')
const Validator = require('is-my-json-valid')
const definitions = require('../')

const blobId = '&1ZQM7TjQHBUEcdBijB6y7dkX047wCf4aXcjFplTjrJo=.sha256'

test('isImage', t => {
  const isValid = Validator({
    $schema: 'http://json-schema.org/schema#',
    type: 'object',
    required: ['avatar'],
    properties: {
      avatar: { $ref: '#/definitions/image' }
    },
    definitions
  })

  isValid({
    avatar: {
      blob: blobId,
      mimeType: 'image/png',
      size: 512,
      width: 300,
      height: 200
    }
  })
  t.equal(isValid.errors, null, 'full')

  t.true(
    isValid({
      avatar: {
        blob: blobId,
        mimeType: 'image/png'
      }
    }), 'minimal'
  )

  t.false(
    isValid({
      avatar: {
        blob: 'http://somelink',
        mimeType: 'image/png'
      }
    }), 'bad blob'
  )

  t.false(
    isValid({
      avatar: {
        blob: blobId,
        mimeType: 'png'
      }
    }), 'bad mimeType'
  )

  t.false(
    isValid({
      avatar: {
        blob: blobId,
        mimeType: 'image/png',
        size: 4.5
      }
    }), 'bad size'
  )

  t.end()
})
