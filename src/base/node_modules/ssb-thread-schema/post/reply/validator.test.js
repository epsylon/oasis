const test = require('tape')
const valid = require('./validator')

const Mock = () => {
  return {
    type: 'post',
    root: '%diVJunN4vNqnyN+1EMrMw4QitnJUgueD2ZUcXcZ+yMA=.sha256',
    branch: [
      '%LeafA+N4vNqnyN+1EMrMw4QitnJUgueD2ZUcXcZ+yMA=.sha256',
      '%LeafB+N4vNqnyN+1EMrMw4QitnJUgueD2ZUcXcZ+yMA=.sha256'
    ],
    text: 'hey my name is [@mix](@ye+QM09iPcDJD6YvQYjoQc7sLF/IFhmNbEqgdzQo3lQ=.ed25519), business business business\n ![outcomes.gif](&TdinUe+PEB0givWwy2VcO/UdIlOV8zvOXCFnMVGNGtE=.sha256)',
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
    ],
    contentWarning: 'business'
  }
}

test('is-reply', t => {
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
  // - fork / nested reply

  const rootMsg = Mock()
  delete rootMsg.root
  delete rootMsg.branch
  t.false(valid(rootMsg), 'excludes root')

  const forkMsg = Mock() // also covers nested-replies
  delete rootMsg.root
  delete rootMsg.branch
  forkMsg.fork = '%diVJunN4vNqnyN+1EMrMw4vjitnJUgueD2ZUcXcZ+yMA=.sha256'
  t.false(valid(forkMsg), 'excludes forks')

  t.end()
})
