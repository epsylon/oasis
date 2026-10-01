const test = require('tape')
const Validator = require('is-my-json-valid')
const definitions = require('../')

const messageMention = { link: '%ePSl+oM1qNuKOe13WBVAwKLETgCvs0/GLPrJsDCeNmA=.sha256', name: 'a new release of Patchfox' }
const humynMention = { link: '@ye+QM09iPcDJD6YvQYjoQc7sLF/IFhmNbEqgdzQo3lQ=.ed25519', name: 'mixmix' }
const blobMention = { link: '&1ZQM7TjQHBUEcdBijB6y7dkX047wCf4aXcjFplTjrJo=.sha256', name: 'beep boop' }
const channelMention = { link: '#spiders' }

test('isMention (any)', t => {
  const isMentionAny = Validator({
    $schema: 'http://json-schema.org/schema#',
    type: 'object',
    required: ['mentions'],
    properties: {
      mentions: { $ref: '#/definitions/mentions/any' }
    },
    definitions
  })

  t.true(isMentionAny({ mentions: [ messageMention ] }), 'messageMention')
  t.true(isMentionAny({ mentions: [ humynMention ] }), 'human mention')
  t.true(isMentionAny({ mentions: [ blobMention ] }), 'blob mention')
  t.true(isMentionAny({ mentions: [ channelMention ] }), 'channel mention')

  t.true(isMentionAny({
    mentions: [
      messageMention, humynMention, blobMention, channelMention
    ]
  }), 'multi-mention')

  t.true(isMentionAny({
    mentions: null
  }), 'null mention')

  t.false(isMentionAny({
    mentions: [
      { href: '%ePSl+oM1qNuKOe13WBVAwKLETgCvs0/GLPrJsDCeNmA=.sha256', name: 'some place' }
    ]
  }), 'non-standard mention (fail)')

  t.end()
})
