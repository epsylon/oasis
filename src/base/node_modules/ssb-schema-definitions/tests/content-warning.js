const test = require('tape')
const Validator = require('is-my-json-valid')
const definitions = require('../')


test('isContentWarning', (t) => {
  const isContentWarning = Validator({
    $schema: 'http://json-schema.org/schema#',
    type: 'object',
    required: ['contentWarning'],
    properties: {
      contentWarning: { $ref: '#/definitions/contentWarning' }
    },
    definitions
  })

  const validWarning  = {
    type: 'post',
    text: 'I have a pet spider',
    contentWarning: 'spiders'
  }

  t.true(isContentWarning(validWarning), 'valid warning')

  const missingWarning = {
    type: 'post',
    text: 'I have a pet spider',
  }
  t.false(isContentWarning(missingWarning), 'missing warning')

  const arrayWarning = {
    type: 'post',
    text: 'I have a pet spider',
    contentWarning: ['spiders']
  }
  t.false(isContentWarning(arrayWarning), 'array warning')

  const numberWarning = {
    type: 'post',
    text: 'I have a pet spider',
    contentWarning: 42
  }
  t.false(isContentWarning(numberWarning), 'number warning')

  const nullWarning = {
    type: 'post',
    text: 'I have a pet spider',
    contentWarning: null
  }
  t.false(isContentWarning(nullWarning), 'null warning')

  const emptyWarning = {
    type: 'post',
    text: 'I have a pet spider',
    contentWarning: ''
  }
  t.false(isContentWarning(emptyWarning), 'empty warning')

  t.end()
})
