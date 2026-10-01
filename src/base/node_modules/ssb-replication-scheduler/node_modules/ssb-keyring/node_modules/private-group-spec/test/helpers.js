const crypto = require('crypto')
const { SecretKey } = require('ssb-private-group-keys')

const key = () =>
  crypto
    .randomBytes(32)
    .toString('base64')
    .replace(/\//g, '_')
    .replace(/\+/g, '-')

const Secret = () => new SecretKey().toString()

const GroupId = () => `ssb:identity/group/${key()}`
const FeedId = () => `ssb:feed/bendybutt-v1/${key()}`
const MsgId = () => `ssb:message/classic/${key()}`

module.exports = {
  key,
  Secret,
  GroupId,
  FeedId,
  MsgId
}
