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

    async sendMessage(recipients = [], subject = '', text = '', crypter = false) {
      const ssbClient = await openSsb();
      const recps = uniqueRecps([userId, ...recipients]);
      const content = {
        type: 'post',
        from: userId,
        to: recps,
        subject,
        text,
        sentAt: new Date().toISOString(),
        private: true,
        ...(crypter ? { crypter: true } : {})
      };
      const publishAsync = util.promisify(ssbClient.private.publish);
      return publishAsync(content, recps);
    },

    async sendFileShare(recipients = [], subject = '', fileShare = null, crypter = false) {
      const ssbClient = await openSsb();
      const recps = uniqueRecps([userId, ...recipients]);
      if (!fileShare || typeof fileShare !== 'object') throw new Error('Invalid file share');
      const content = {
        type: 'post',
        from: userId,
        to: recps,
        subject,
        text: '',
        sentAt: new Date().toISOString(),
        private: true,
        fileShare,
        ...(crypter ? { crypter: true } : {})
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
      const isAuthor = author === userId;
      const isRecipient = originalRecps.includes(userId);
      if (!isAuthor && !isRecipient) throw new Error("Not authorized.");
      if (content.type === 'tombstone') throw new Error("Message already deleted.");
      const tombstone = {
        type: 'tombstone',
        target: messageId,
        deletedAt: new Date().toISOString(),
        private: true
      };
      const tombstoneRecps = isAuthor
        ? uniqueRecps([userId, author, ...originalRecps])
        : uniqueRecps([userId]);
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
      const tombClaims = new Map();
      const authorByKey = new Map();
      const recpsByKey = new Map();
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
          const set = tombClaims.get(c.target) || new Set();
          set.add(v.author);
          tombClaims.set(c.target, set);
          continue;
        }
        authorByKey.set(k, v.author);
        if (c.type === 'post') {
          const to = Array.isArray(c.to) ? c.to : [];
          recpsByKey.set(k, to);
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
      for (const [target, tombAuthors] of tombClaims.entries()) {
        const origAuthor = authorByKey.get(target);
        const origRecps = recpsByKey.get(target) || [];
        for (const tombAuthor of tombAuthors) {
          if (tombAuthor === origAuthor || tombAuthor === userId || origRecps.includes(tombAuthor)) {
            tombed.add(target);
            break;
          }
        }
      }
      return posts.filter(m => m && m.key && !tombed.has(m.key));
    }
  };
};
