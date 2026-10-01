const { DHFeedKeys, DHPOBoxKeys, print } = require('../helpers')
const { poBoxKey } = require('../..')

const generators = [
  (i) => {
    const my = DHFeedKeys()
    const poBox = DHPOBoxKeys()

    const sharedKey = poBoxKey(my.dh.secret, my.dh.public, my.feedId, poBox.dh.public, poBox.id)

    const vector = {
      type: 'po_box_key',
      description: 'calculate a shared key between an author and a P.O. Box',
      input: {
        my_dh_secret: my.dh.secret,
        my_dh_public: my.dh.public,
        my_feed_id: my.feedId,

        po_box_dh_public: poBox.dh.public,
        po_box_id: poBox.id
      },
      output: {
        shared_key: sharedKey.key,
        key_scheme: sharedKey.scheme
      }
    }
    print(`vectors/po-box-key${i + 1}.json`, vector)
  }
]

generators.forEach((fn, i) => fn(i))
