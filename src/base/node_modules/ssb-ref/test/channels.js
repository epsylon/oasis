const tape = require('tape')
const { normalizeChannel } = require('../')

tape('happy path', (assert) => {
  assert.equal(normalizeChannel('hello'), 'hello')
  assert.equal(normalizeChannel('WORLD'), 'world')
  assert.equal(normalizeChannel('👍👍👍'), '👍👍👍')
  assert.equal(normalizeChannel('!@#$%^&*()_'), '@$%^&*_')
  assert.end()
})

tape('truncate', (assert) => {
  assert.equal(normalizeChannel('a'.repeat(63)), 'a'.repeat(30))
  assert.equal(normalizeChannel('A'.repeat(63)), 'a'.repeat(30))
  assert.end()
})

tape('failure', (assert) => {
  assert.equal(normalizeChannel(''), null)
  assert.equal(normalizeChannel(42), null)
  assert.equal(normalizeChannel('!#()'), null)
  assert.end()
})
