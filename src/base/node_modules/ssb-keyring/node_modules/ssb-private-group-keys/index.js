const DiffieHellmanKeys = require('./diffie-hellman-keys')

module.exports = {
  SecretKey: require('./secret-key'),
  DiffieHellmanKeys,
  DHKeys: DiffieHellmanKeys, // alias

  directMessageKey: require('./direct-message-key'),
  poBoxKey: require('./po-box-key')
}
