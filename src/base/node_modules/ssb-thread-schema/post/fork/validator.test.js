const test = require('tape')
const valid = require('./validator')

const Mock = () => {
  return {
    type: 'post',
    fork: '%diVJunN4vNqnyN+1EMrMw4QitnJUgueD2ZUcXcZ+yMA=.sha256',
    text: 'ok this is a totally new topic. [@mix](@ye+QM09iPcDJD6YvQYjoQc7sLF/IFhmNbEqgdzQo3lQ=.ed25519), business business business\n ![outcomes.gif](&TdinUe+PEB0givWwy2VcO/UdIlOV8zvOXCFnMVGNGtE=.sha256)',
    mentions: [
      {
        link: '@ye+QM09iPcDJD6YvQYjoQc7sLF/IFhmNbEqgdzQo3lQ=.ed25519',
        name: 'mix'
      },
      {
        link: '&TdinUe+PEB0givWwy2VcO/UdIlOV8zvOXCFnMVGNGtE=.sha256',
        name: 'outcomes.gif'
      }
    ],
    recps: [
      '@ye+QM09iPcDJD6YvQYjoQc7sLF/IFhmNbEqgdzQo3lQ=.ed25519',
      '@SomeOne+PcDJD6YvQYjoQc7sLF/IFhmNbEqgdzQo3lQ=.ed25519'
    ]
  }
}

test('is-fork', t => {
  const minimalMsg = Mock()
  delete minimalMsg.mentions
  delete minimalMsg.recps
  t.true(valid(minimalMsg), 'minimal')

  const mentionsMsg = Mock()
  delete mentionsMsg.recps
  t.true(valid(mentionsMsg), 'mentions')

  const privateMsg = Mock()
  t.true(valid(privateMsg), 'private')

  // not other sorts of message:
  // - root
  // - reply
  // - fork / nested reply

  const rootMsg = Mock()
  delete rootMsg.fork
  t.false(valid(rootMsg), 'excludes roots')

  const replyMsg = Mock()
  delete rootMsg.fork
  replyMsg.root = '%diVJunN4vNqnyN+1EMrMw4QitnJUgueD2ZUcXcZ+yMA=.sha256'
  replyMsg.branch = ['%diVJunN4vNqnyN+1EMrMw4QitnJUgueD2ZUcXcZ+yMA=.sha256']
  t.false(valid(replyMsg), 'excludes replies')

  const nestedMsg = Mock()
  nestedMsg.root = '%diVJunN4vNqnyN+1EMrMw4vjitnJUgueD2ZUcXcZ+yMA=.sha256'
  t.false(valid(nestedMsg), 'excludes nested-replies')

  t.end()
})
