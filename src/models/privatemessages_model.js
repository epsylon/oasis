const pull = require('../server/node_modules/pull-stream');
const util = require('../server/node_modules/util');

module.exports = ({ cooler }) => {
  let ssb;
  let userId;
  const openSsb = async () => {
    if (!ssb) {
      ssb = await cooler.open();
      userId = ssb.id;
    }
    return ssb;
  };
  
  return {
    type: 'post',
    async sendMessage(recipients = [], subject = '', text = '') {
      const ssbClient = await openSsb();
      const content = {
        type: 'post',
        from: userId,
        to: recipients,
        subject,
        text,
        sentAt: new Date().toISOString(),
        private: true
      };
      const publishAsync = util.promisify(ssbClient.private.publish);
      return publishAsync(content, recipients);
    },

    async deleteMessageById(messageId) {
      const ssbClient = await openSsb();
      const rawMsg = await new Promise((resolve, reject) =>
        ssbClient.get(messageId, (err, m) =>
          err ? reject(new Error("Error retrieving message.")) : resolve(m)
        )
      );
      let decrypted;
      try {
        decrypted = ssbClient.private.unbox({
          key: messageId,
          value: rawMsg,
          timestamp: rawMsg.timestamp || Date.now()
        });
      } catch {
        throw new Error("Malformed message.");
      }
      const content = decrypted?.value?.content;
      const author = decrypted?.value?.author;
      const recps = content?.to;

      if (!content || !author || !Array.isArray(recps)) throw new Error("Malformed message.");
      if (content.type === 'tombstone') throw new Error("Message already deleted.");

      const tombstone = {
        type: 'tombstone',
        target: messageId,
        deletedAt: new Date().toISOString(),
        private: true
      };
      const publishAsync = util.promisify(ssbClient.private.publish);
      return publishAsync(tombstone, recps);
    }
  };
};
