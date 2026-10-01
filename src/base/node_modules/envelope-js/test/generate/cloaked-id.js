const { CloakedMsgId } = require('../../index')
const { MsgId, Key, print } = require('../helpers')

const generators = [
  /* box for 2 recps */
  (i) => {
    const public_msg_id = MsgId()
    const read_key = Key()

    const vector = {
      type: 'cloaked_id',
      description: 'derive a cloaked message id following the spec. NOTE all ids are in TFK format',
      input: {
        public_msg_id,
        read_key
      },
      output: {
        cloaked_msg_id: new CloakedMsgId(public_msg_id, read_key).toBuffer()
      },
      error_code: null
    }
    print(`cloaked_id${i + 1}.json`, vector)
  }
]

generators.forEach((fn, i) => fn(i))
