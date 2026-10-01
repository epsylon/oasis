const test = require('tape')
const Validator = require('../')

test('schema-and-extras', t => {
  const schema = {
    required: ['type'],
    properties: {
      type: {
        type: 'string',
        date: 'string'
      }
    }
  }

  function isEDTF (msgContent) {
    // imagine we did a more complex check to see if the date could be parsed as edtf
    if (!msgContent.date) return true

    try {
      if (msgContent.date.length === 10) return true
      throw new Error('ARRRRR! (could not parse!)')
    } catch (e) {
      return new Error('data.date requires an EDTF format date, got: ' + msgContent.date)
    }
  }

  const validator = Validator(schema, [isEDTF])

  t.true(validator({ type: 'post' }))
  t.true(validator({ type: 'post', date: '2020-05-18' }))

  t.false(validator({ type: 100, date: '202' }))

  t.equal(validator.errors.length, 2, 'multiple errors!')
  t.equal(validator.errorsString.split(';').length, 2, 'errors in errorsString are ;-seperated')

  t.true(
    validator.errors.find(e => e.toString().match(/requires an EDTF/)),
    'validator.errors gets extra errors'
  )
  t.true(
    validator.errorsString.match(/requires an EDTF format/),
    'validator.errorsString gets extra errors'
  )

  // checking errors get reset
  validator({ type: 'post' })
  t.equal(validator.errors, null, 'no validator.errors when last passed')
  t.equal(validator.errorsString, '', 'empty validator.errorsString when last passed')
  t.end()
})
