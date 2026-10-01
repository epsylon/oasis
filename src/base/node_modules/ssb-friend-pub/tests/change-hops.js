const test = require('tape')
const Server = require('scuttle-testbot')
const ssbKeys = require('ssb-keys')
const pull = require('pull-stream')

const keyMe = ssbKeys.generate()
const keyFriend = ssbKeys.generate()
const keyPub = ssbKeys.generate()

test('change hops', t => {
  Server.use(require('ssb-backlinks'))
    .use(require('scuttlebot/plugins/replicate'))
    .use(require('ssb-friends'))
    .use(require('..'))

  const server = Server({name: 'test.retract', keys: keyMe})

  var me = server.createFeed(keyMe)
  var friend = server.createFeed(keyFriend)
  var pub = server.createFeed(keyPub)

  const befriend = { type: "contact", contact: friend.id, following: true }
  me.add(befriend, (err) => {
    if (err) console.error(err)
    
    const befriendPub = { type: "contact", contact: pub.id, following: true }
    friend.add(befriendPub, (err) => {
      if (err) console.error(err)

      const announce = { type: 'pub-owner-announce', pub: keyPub.id }

      friend.add(announce, (err, announceMsg) => {
        if (err) console.error(err)

        const confirm = { type: 'pub-owner-confirm', announcement: announceMsg.key,
                          address: "4fqstkswahy3n7mupr2gvvp2qcsp6juwzn3mnqvhkaixxepvxrrtfbid.onion",
                          features: ["tor", "incoming-guard"] }
    
        pub.add(confirm, (err) => {
          if (err) console.error(err)
          
          setTimeout(() => {
            t.equal(server.friendPub.pubs().length, 1, "1 pub available")

            server.friendPub.changeHops(0)
            
            setTimeout(() => {
              t.equal(server.friendPub.pubs().length, 0, "0 pubs available")
              t.end()
              server.close()
            }, 100)
            
          }, 100)
        })
      })
    })
  })
})

