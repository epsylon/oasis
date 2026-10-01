var test = require('tape')
var mentions = require('../')

test('mentions in links are detected', function (t) {
  function testMention(string, output, message) {
    t.deepEquals(mentions(string), output, message)
    t.deepEquals(mentions(string+ ' ' + string), output, message+', doubled')
  }

  testMention(
    '[@feed](@3HO6R2i60XNR3h6XCHAWCdt1k9Dwy+gaa2rVs6LzZ6Y=.ed25519)', [
      {
        link: '@3HO6R2i60XNR3h6XCHAWCdt1k9Dwy+gaa2rVs6LzZ6Y=.ed25519',
        name: 'feed',
      }
    ], 'feed link')


  testMention(
    '[a msg](%A2LvseOYKDXyuSGlXl3Sz0F5j2khVCN6JTf8ORD/tM8=.sha256)', [
      {
        link: '%A2LvseOYKDXyuSGlXl3Sz0F5j2khVCN6JTf8ORD/tM8=.sha256',
        name: 'a msg',
      }
    ], 'msg link')

    testMention(
      '[a secret msg](%A2LvseOYKDXyuSGlXl3Sz0F5j2khVCN6JTf8ORD/tM8=.sha256?unbox=9SSTQys34p9f4zqjxvRwENjFX0JapgtesRey7=.boxs)', [
        {
          link: '%A2LvseOYKDXyuSGlXl3Sz0F5j2khVCN6JTf8ORD/tM8=.sha256',
          name: 'a secret msg',
          query: {
            unbox: '9SSTQys34p9f4zqjxvRwENjFX0JapgtesRey7=.boxs'
          }
        }
      ], 'msg link with unbox')

  testMention(
    '[a blob](&9SSTQys34p9f4zqjxvRwENjFX0JapgtesRey7+fxK14=.sha256)', [
      {
        link: '&9SSTQys34p9f4zqjxvRwENjFX0JapgtesRey7+fxK14=.sha256',
        name: 'a blob',
      }
    ], 'blob link')

  testMention(
    '[a blob](&9SSTQys34p9f4zqjxvRwENjFX0JapgtesRey7+fxK14=.sha256?unbox=A2LvseOYKDXyuSGlXl3Sz0F5j2khVCN6JTf8ORD/tM8=.boxs)', [
      {
        link: '&9SSTQys34p9f4zqjxvRwENjFX0JapgtesRey7+fxK14=.sha256',
        name: 'a blob',
        query: {
          unbox: 'A2LvseOYKDXyuSGlXl3Sz0F5j2khVCN6JTf8ORD/tM8=.boxs'
        }
      }
    ], 'secret blob link')

  t.end()
})

test('ref mentions are detected', function (t) {
  function testMention(string, output, message) {
    t.deepEquals(mentions(string), output, message)
    t.deepEquals(mentions(string+ ' ' + string), output, message+', doubled')
  }

  testMention(
    '@3HO6R2i60XNR3h6XCHAWCdt1k9Dwy+gaa2rVs6LzZ6Y=.ed25519', [
      {
        link: '@3HO6R2i60XNR3h6XCHAWCdt1k9Dwy+gaa2rVs6LzZ6Y=.ed25519',
        name: undefined
      }
    ], 'feed link')

  testMention(
    '%A2LvseOYKDXyuSGlXl3Sz0F5j2khVCN6JTf8ORD/tM8=.sha256', [
      {
        link: '%A2LvseOYKDXyuSGlXl3Sz0F5j2khVCN6JTf8ORD/tM8=.sha256',
        name: undefined
      }
    ], 'msg link')

  testMention(
    '&9SSTQys34p9f4zqjxvRwENjFX0JapgtesRey7+fxK14=.sha256', [
      {
        link: '&9SSTQys34p9f4zqjxvRwENjFX0JapgtesRey7+fxK14=.sha256',
        name: undefined
      }
    ], 'blob link')

  t.end()
})

test('bare feed name mentions can be detected', function (t) {
  t.deepEqual(mentions('a @feed mention', {bareFeedNames: true}),
    [{name: 'feed', link: '@'}], 'feed link')
  t.end()
})

test('detect hashtags', function (t) {
  t.deepEquals(mentions('a nice #hashtag here'),
    [{link: '#hashtag'}], 'hashtag link')
  t.end()
})

test('no html tags in link names', function (t) {
  t.deepEquals(mentions('link: [`code` *em* **strong** ~~del~~]' +
    '(&9SSTQys34p9f4zqjxvRwENjFX0JapgtesRey7+fxK14=.sha256)'), [
    {
      link: '&9SSTQys34p9f4zqjxvRwENjFX0JapgtesRey7+fxK14=.sha256',
      name: 'code em strong del'
    }
  ], 'no tags')
  t.end()
})

test('detect emoji', function (t) {
  t.deepEquals(mentions('some nice :+1: :emoji: here', {emoji: true}), [
    {name: '+1', emoji: true},
    {name: 'emoji', emoji: true},
  ], 'emoji')
  t.end()
})

test('links don\'t return null mentions', function (t) {
  t.deepEquals(mentions('look at http://example.com friends'), [] , 'empty array')
  t.end()
})
