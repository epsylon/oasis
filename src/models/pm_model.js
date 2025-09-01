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

  function uniqueRecps(list) {
    const out = [];
    const seen = new Set();
    for (const x of (list || [])) {
      if (typeof x !== 'string') continue;
      const id = x.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  return {
    type: 'post',

    async sendMessage(recipients = [], subject = '', text = '') {
      const ssbClient = await openSsb();
      const recps = uniqueRecps([userId, ...recipients]);
      const content = {
        type: 'post',
        from: userId,
        to: recps,
        subject,
        text,
        sentAt: new Date().toISOString(),
        private: true
      };
      const publishAsync = util.promisify(ssbClient.private.publish);
      return publishAsync(content, recps);
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
          timestamp: rawMsg?.timestamp || Date.now()
        });
      } catch {
        throw new Error("Malformed message.");
      }
      const content = decrypted?.value?.content;
      const author = decrypted?.value?.author;
      const originalRecps = Array.isArray(content?.to) ? content.to : [];
      if (!content || !author) throw new Error("Malformed message.");
      if (content.type === 'tombstone') throw new Error("Message already deleted.");
      const tombstone = {
        type: 'tombstone',
        target: messageId,
        deletedAt: new Date().toISOString(),
        private: true
      };
      const tombstoneRecps = uniqueRecps([userId, author, ...originalRecps]);
      const publishAsync = util.promisify(ssbClient.private.publish);
      return publishAsync(tombstone, tombstoneRecps);
    },

    async listAllPrivate() {
      const ssbClient = await openSsb();
      const raw = await new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream({ reverse: false }),
          pull.collect((err, arr) => err ? reject(err) : resolve(arr))
        );
      });
      const posts = [];
      const tombed = new Set();
      for (const m of raw) {
        if (!m || !m.value) continue;
        const keyIn = m.key || m.value?.key || m.value?.hash || '';
        const valueIn = m.value || m;
        const tsIn = m.timestamp || m.value?.timestamp || Date.now();
        let dec;
        try {
          dec = ssbClient.private.unbox({ key: keyIn, value: valueIn, timestamp: tsIn });
        } catch {
          continue;
        }
        const v = dec?.value || {};
        const c = v.content || {};
        const k = dec?.key || keyIn;
        if (!c || c.private !== true || !k) continue;
        if (c.type === 'tombstone' && c.target) {
          tombed.add(c.target);
          continue;
        }
        if (c.type === 'post') {
          const to = Array.isArray(c.to) ? c.to : [];
          const author = v.author;
          if (author === userId || to.includes(userId)) {
            posts.push({
              key: k,
              value: { author, content: c },
              timestamp: v.timestamp || tsIn
            });
          }
        }
      }
      return posts.filter(m => m && m.key && !tombed.has(m.key));
    }
  };
};
