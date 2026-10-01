
var PeerIds = {
    id: {
      type: "FeedId",
      optional: true,
      description: 'An ssb feed identity',
    },
    address: {
      type: 'MultiServerAddress',
      optional: true,
      description: 'a multiserver address of an ssb peer'
    }
  }

module.exports = {
  description: 'keep track of peers, and decide when to connect to them',
  commands: {
    add: {
      type: 'sync',
      description: 'add peer to table',
      args: PeerIds
    },
    rm: {
      type: 'sync',
      description: 'remove peer from table',
      args: PeerIds,
    },
    connect: {
      type: 'sync',
      description: 'connect to a peer',
      args: PeerIds
    },
    disconnect: {
      type: 'sync',
      description: 'disconnect from a peer',
      args: PeerIds
    },
    changes: {
      type: 'source',
      description: 'stream of changes to peers table',
      args: {}
    },
    reconnect: {
      type: 'sync',
      description: 'reconnect to all peers',
      args: {}
    },
    disable: {
      type: 'sync',
      description: 'disable gossip',
      args:{}
    },
    enable: {
      type: 'sync',
      description: 'enable gossip',
      args:{}
    }
  }
}




