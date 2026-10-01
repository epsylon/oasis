const test = require('tape')
const Server = require('scuttle-testbot')
const ssbKeys = require('ssb-keys')
const pull = require('pull-stream')

const keyMe = ssbKeys.generate()
const keyPub = ssbKeys.generate()

test('basic case, announce + confirm', t => {
  Server.use(require('ssb-backlinks'))
    .use(require('scuttlebot/plugins/replicate'))
    .use(require('ssb-friends'))
    .use(require('../'))

  const server = Server({name: 'test.announce', keys: keyMe})

  var me = server.createFeed(keyMe)
  var pub = server.createFeed(keyPub)
  
  const announce = { type: 'pub-owner-announce', pub: keyPub.id }

  me.add(announce, (err, announceMsg) => {
    if (err) console.error(err)

    const confirm = { type: 'pub-owner-confirm', announcement: announceMsg.key,
                      address: "4fqstkswahy3n7mupr2gvvp2qcsp6juwzn3mnqvhkaixxepvxrrtfbid.onion",
                      features: ["tor", "incoming-guard"] }
    
    pub.add(confirm, (err) => {
      if (err) console.error(err)

      setTimeout(() => {
        //console.log(server.friendPub.pubs())
        t.equal(server.friendPub.pubs().length, 1, "1 pub announced")
        t.end()
        server.close()
      }, 100)
    })
  })
})

