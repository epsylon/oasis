const test = require('tape')
const Server = require('scuttle-testbot')
const ssbKeys = require('ssb-keys')
const pull = require('pull-stream')

const keyMe = ssbKeys.generate()
const keyPub = ssbKeys.generate()
const keyHax = ssbKeys.generate()

test('only the correct nodes can post messages', t => {
  Server.use(require('ssb-backlinks'))
    .use(require('scuttlebot/plugins/replicate'))
    .use(require('ssb-friends'))
    .use(require('..'))

  const server = Server({name: 'test.announce', keys: keyMe})

  var me = server.createFeed(keyMe)
  var pub = server.createFeed(keyPub)
  var haxer = server.createFeed(keyHax)
  
  const announce = { type: 'pub-owner-announce', pub: keyPub.id }

  me.add(announce, (err, announceMsg) => {
    if (err) console.error(err)

    const confirm = { type: 'pub-owner-confirm', announcement: announceMsg.key,
                      address: "4fqstkswahy3n7mupr2gvvp2qcsp6juwzn3mnqvhkaixxepvxrrtfbid.onion",
                      features: ["tor", "incoming-guard"] }
    
    haxer.add(confirm, (err) => {
      if (err) console.error(err)

      setTimeout(() => {
        t.equal(server.friendPub.pubs().length, 0, "0 pubs announced")
        t.end()
        server.close()
      }, 100)
    })
  })
})

