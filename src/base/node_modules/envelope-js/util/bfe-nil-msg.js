const { toTF } = require('ssb-bfe')
const error = require('./error')

const NIL_TFD = toTF('generic', 'nil')

const CLASSIC_FEED_TF = toTF('feed', 'classic')
const GABBYGR_FEED_TF = toTF('feed', 'gabbygrove-v1')
const BENDYBT_FEED_TF = toTF('feed', 'bendybutt-v1')
const BUTTWOO_FEED_TF = toTF('feed', 'buttwoo-v1')

const CLASSIC_MSG_TF = toTF('message', 'classic')
const GABBYGR_MSG_TF = toTF('message', 'gabbygrove-v1')
const BENDYBT_MSG_TF = toTF('message', 'bendybutt-v1')
const BUTTWOO_MSG_TF = toTF('message', 'buttwoo-v1')

const ZEROS = Buffer.alloc(32)

module.exports = function convertBFENilMsg (msgTFD, feedTFK) {
  if (!msgTFD.equals(NIL_TFD)) return msgTFD

  const feedTF = feedTFK.slice(0, 2)
  if (feedTF.equals(CLASSIC_FEED_TF)) return Buffer.concat([CLASSIC_MSG_TF, ZEROS])
  if (feedTF.equals(GABBYGR_FEED_TF)) return Buffer.concat([GABBYGR_MSG_TF, ZEROS])
  if (feedTF.equals(BENDYBT_FEED_TF)) return Buffer.concat([BENDYBT_MSG_TF, ZEROS])
  if (feedTF.equals(BUTTWOO_FEED_TF)) return Buffer.concat([BUTTWOO_MSG_TF, ZEROS])

  throw error('Unknown feed type', feedTF)
}
