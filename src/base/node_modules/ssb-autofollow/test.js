const test = require('tape')
const pull = require('pull-stream')
const ssbKeys = require('ssb-keys')
const rimraf = require('rimraf')
const {createSbot} = require('scuttlebot')

const lucyKeys = ssbKeys.generate()

test('do nothing if no autofollow feed is specified', t => {
  const myTestSbot = createSbot().use(require('.'))({
    temp: true,
    keys: lucyKeys
  })

  setTimeout(() => {
    pull(
      myTestSbot.createLogStream(),
      pull.collect((err, msgs) => {
        t.error(err)
        t.equals(msgs.length, 0, 'no message')
        myTestSbot.close(() => t.end() )
      })
    )
  }, 300)
})

test('one follow message, if one feed is specified', t => {
  const myTestSbot = createSbot().use(require('.'))({
    temp: true,
    keys: lucyKeys,
    autofollow: 'alice'
  })

  setTimeout(() => {
    pull(
      myTestSbot.createLogStream({}),
      pull.collect((err, msgs) => {
        t.error(err);
        t.equals(msgs.length, 1, 'one message');
        const msg = msgs[0]

        t.equals(msg.value.author, lucyKeys.id, 'message author is lucy')
        t.equals(msg.value.content.type, 'contact', 'content type is cotact');
        t.equals(
          msg.value.content.contact,
          'alice',
          'contact is correct'
        )
        t.equals(msg.value.content.following, true, 'following is true')
        myTestSbot.close( ()=> t.end() )
      })
    )
  }, 300)
})

test('array of feeds', t => {
  const myTestSbot = createSbot().use(require('.'))({
    temp: true,
    keys: lucyKeys,
    autofollow: ['alice', 'bob']
  })

  setTimeout(() => {
    pull(
      myTestSbot.createLogStream({}),
      pull.collect((err, msgs) => {
        t.error(err);
        t.equals(msgs.length, 2, 'two messages');
        let msg

        msg = msgs[0]
        t.equals(msg.value.author, lucyKeys.id, 'message author is lucy')
        t.equals(msg.value.content.type, 'contact', 'content type is cotact');
        t.equals(
          msg.value.content.contact,
          'alice',
          'contact is alice'
        )
        t.equals(msg.value.content.following, true, 'following is true')
        
        msg = msgs[1]
        t.equals(msg.value.author, lucyKeys.id, 'message author is lucy')
        t.equals(msg.value.content.type, 'contact', 'content type is cotact')
        t.equals(
          msg.value.content.contact,
          'bob',
          'contact is bob'
        )
        t.equals(msg.value.content.following, true, 'following is true')
        
        myTestSbot.close( ()=> t.end() )
      })
    )
  }, 300)
})

test('pre-existing message', t => {
  const path = '/tmp/test_preexisting'
  rimraf.sync(path)

  function publish(cb) {
    const myTestSbot = createSbot()({
      path, 
      keys: lucyKeys
    })
    const lucy = myTestSbot.createFeed(lucyKeys)

    lucy.publish({
      type: 'contact',
      contact: 'alice',
      following: true
    }, err => {
      t.error(err)
      myTestSbot.close(cb)
    }) 
  }
      
  publish( err => {
    t.error(err)
    
    const myTestSbot = createSbot().use(require('.'))({
      path, 
      keys: lucyKeys,
      autofollow: ['alice', 'bob']
    })

    setTimeout( ()=>{
      pull(
        myTestSbot.createFeedStream({}),
        pull.collect((err, msgs) => {
          t.error(err);
          t.equals(msgs.length, 2, 'two messages');
          let msg

          msg = msgs[1]
          t.equals(msg.value.author, lucyKeys.id, 'message author is lucy')
          t.equals(msg.value.content.type, 'contact', 'content type is cotact');
          t.equals(
            msg.value.content.contact,
            'bob',
            'contact is bob'
          )
          t.equals(msg.value.content.following, true, 'following is true')
          
          myTestSbot.close( () => t.end() )
        })
      )
    }, 300)
  })
})
