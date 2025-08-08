const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const N = s => String(s || '').toUpperCase().replace(/\s+/g, '_');
const D = s => ({FOR_SALE:'FOR SALE',OPEN:'OPEN',RESERVED:'RESERVED',CLOSED:'CLOSED',SOLD:'SOLD'})[s] || (s ? s.replace(/_/g,' ') : s);
const ORDER = ['FOR_SALE','OPEN','RESERVED','CLOSED','SOLD'];
const OI = s => ORDER.indexOf(N(s));

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  return {
    type: 'market',

    async createItem(item_type, title, description, image, price, tagsRaw = [], item_status, deadline, includesShipping = false, stock = 0) {
      const ssbClient = await openSsb();
      const formattedDeadline = deadline ? moment(deadline, moment.ISO_8601, true).toISOString() : null;
      let blobId = null;
      if (image) {
        const match = image.match(/\(([^)]+)\)/);
        blobId = match ? match[1] : image;
      }
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : String(tagsRaw).split(',').map(t => t.trim()).filter(Boolean);
      const itemContent = {
        type: "market",
        item_type,
        title,
        description,
        image: blobId,
        price: parseFloat(price).toFixed(6),
        tags,
        item_status,
        status: 'FOR SALE',
        deadline: formattedDeadline,
        includesShipping,
        stock,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        seller: ssbClient.id,
        auctions_poll: []
      };
      return new Promise((resolve, reject) => {
        ssbClient.publish(itemContent, (err, res) => err ? reject(err) : resolve(res));
      });
    },

    async resolveCurrentId(itemId) {
      const ssbClient = await openSsb();
      const messages = await new Promise((resolve, reject) =>
        pull(
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
        )
      );
      const fwd = new Map();
      for (const m of messages) {
        const c = m.value?.content;
        if (!c || c.type !== 'market') continue;
        if (c.replaces) fwd.set(c.replaces, m.key);
      }
      let cur = itemId;
      while (fwd.has(cur)) cur = fwd.get(cur);
      return cur;
    },

    async updateItemById(itemId, updatedData) {
      const tipId = await this.resolveCurrentId(itemId);
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Item not found"));
          if (item.content.seller !== userId) return reject(new Error("Not the seller"));
          if (['SOLD','DISCARDED'].includes(D(N(item.content.status)))) return reject(new Error("Cannot update this item"));
          const updated = { ...item.content, ...updatedData, tags: updatedData.tags || item.content.tags, updatedAt: new Date().toISOString(), replaces: tipId };
          const tombstone = { type: 'tombstone', target: tipId, deletedAt: new Date().toISOString(), author: userId };
          ssbClient.publish(tombstone, err => {
            if (err) return reject(err);
            ssbClient.publish(updated, (err2, res) => err2 ? reject(err2) : resolve(res));
          });
        });
      });
    },

    async deleteItemById(itemId) {
      const tipId = await this.resolveCurrentId(itemId);
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Item not found"));
          if (item.content.seller !== userId) return reject(new Error("Not the seller"));
          const tombstone = { type: 'tombstone', target: tipId, deletedAt: new Date().toISOString(), author: userId };
          ssbClient.publish(tombstone, (err) => err ? reject(err) : resolve({ message: "Item deleted successfully" }));
        });
      });
    },

    async listAllItems(filter = 'all') {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const messages = await new Promise((resolve, reject) =>
        pull(
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
        )
      );

      const tomb = new Set();
      const nodes = new Map();
      const parent = new Map();
      const child = new Map();

      for (const m of messages) {
        const k = m.key;
        const c = m.value?.content;
        if (!c) continue;
        if (c.type === 'tombstone' && c.target) { tomb.add(c.target); continue; }
        if (c.type !== 'market') continue;
        nodes.set(k, { key: k, ts: m.value.timestamp, c });
        if (c.replaces) { parent.set(k, c.replaces); child.set(c.replaces, k); }
      }

      const rootOf = id => { let cur = id; while (parent.has(cur)) cur = parent.get(cur); return cur; };
      const groups = new Map();
      for (const id of nodes.keys()) {
        const r = rootOf(id);
        if (!groups.has(r)) groups.set(r, new Set());
        groups.get(r).add(id);
      }

      const items = [];
      for (const [root, ids] of groups.entries()) {
        let tip = Array.from(ids).find(id => !child.has(id)) || Array.from(ids).reduce((a,b)=> nodes.get(a).ts>nodes.get(b).ts?a:b);
        if (tomb.has(tip)) continue;

        let best = nodes.get(tip);
        let bestS = N(best.c.status || 'FOR_SALE');
        for (const id of ids) {
          const s = N(nodes.get(id).c.status);
          if (OI(s) > OI(bestS)) { best = nodes.get(id); bestS = s; }
        }

        const c = best.c;
        let status = D(bestS);
        if (c.deadline) {
          const dl = moment(c.deadline);
          if (dl.isValid() && dl.isBefore(moment()) && status !== 'SOLD') status = 'DISCARDED';
        }
        if (status === 'FOR SALE' && (c.stock || 0) === 0) continue;

        items.push({
          id: tip,
          title: c.title,
          description: c.description,
          image: c.image,
          price: c.price,
          tags: c.tags || [],
          item_type: c.item_type,
          item_status: c.item_status || 'NEW',
          status,
          createdAt: c.createdAt || best.ts,
          updatedAt: c.updatedAt,
          seller: c.seller,
          includesShipping: !!c.includesShipping,
          stock: c.stock || 0,
          deadline: c.deadline || null,
          auctions_poll: c.auctions_poll || []
        });
      }

      let list = items;
      switch (filter) {
        case 'mine':       list = list.filter(i => i.seller === userId); break;
        case 'exchange':   list = list.filter(i => i.item_type === 'exchange' && i.status === 'FOR SALE'); break;
        case 'auctions':   list = list.filter(i => i.item_type === 'auction'  && i.status === 'FOR SALE'); break;
        case 'new':        list = list.filter(i => i.item_status === 'NEW'    && i.status === 'FOR SALE'); break;
        case 'used':       list = list.filter(i => i.item_status === 'USED'   && i.status === 'FOR SALE'); break;
        case 'broken':     list = list.filter(i => i.item_status === 'BROKEN' && i.status === 'FOR SALE'); break;
        case 'for sale':   list = list.filter(i => i.status === 'FOR SALE'); break;
        case 'sold':       list = list.filter(i => i.status === 'SOLD'); break;
        case 'discarded':  list = list.filter(i => i.status === 'DISCARDED'); break;
        case 'recent':
          const oneDayAgo = moment().subtract(1, 'days');
          list = list.filter(i => i.status === 'FOR SALE' && moment(i.createdAt).isAfter(oneDayAgo));
          break;
      }

      return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },

    async getItemById(itemId) {
      const ssbClient = await openSsb();
      const messages = await new Promise((resolve, reject) =>
        pull(
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((err, msgs) => err ? reject(err) : resolve(msgs))
        )
      );

      const nodes = new Map();
      const parent = new Map();
      const child = new Map();
      for (const m of messages) {
        const k = m.key;
        const c = m.value?.content;
        if (!c || c.type !== 'market') continue;
        nodes.set(k, { key: k, ts: m.value.timestamp, c });
        if (c.replaces) { parent.set(k, c.replaces); child.set(c.replaces, k); }
      }

      let tip = itemId;
      while (child.has(tip)) tip = child.get(tip);

      const ids = new Set();
      let cur = tip;
      ids.add(cur);
      while (parent.has(cur)) { cur = parent.get(cur); ids.add(cur); }

      let best = nodes.get(tip) || (await new Promise(resolve => ssbClient.get(tip, (e, m) => resolve(m ? { key: tip, ts: m.timestamp, c: m.content } : null))));
      if (!best) return null;
      let bestS = N(best.c.status || 'FOR_SALE');
      for (const id of ids) {
        const n = nodes.get(id);
        if (!n) continue;
        const s = N(n.c.status);
        if (OI(s) > OI(bestS)) { best = n; bestS = s; }
      }

      const c = best.c;
      let status = D(bestS);
      if (c.deadline) {
        const dl = moment(c.deadline);
        if (dl.isValid() && dl.isBefore(moment()) && status !== 'SOLD') status = 'DISCARDED';
      }

      return {
        id: tip,
        title: c.title,
        description: c.description,
        image: c.image,
        price: c.price,
        tags: c.tags || [],
        item_type: c.item_type,
        item_status: c.item_status,
        status,
        createdAt: c.createdAt || best.ts,
        updatedAt: c.updatedAt,
        seller: c.seller,
        includesShipping: c.includesShipping,
        stock: c.stock,
        deadline: c.deadline,
        auctions_poll: c.auctions_poll || []
      };
    },

    async checkAuctionItemsStatus(items) {
      const now = new Date().toISOString();
      for (let item of items) {
        if ((item.item_type === 'auction' || item.item_type === 'exchange') && item.deadline && now > item.deadline) {
          if (['SOLD','DISCARDED'].includes(D(N(item.status)))) continue;
          let status = item.status;
          if (item.item_type === 'auction') {
            const highestBid = (item.auctions_poll || []).reduce((prev, curr) => {
              const parts = String(curr).split(':'); const bidAmount = parseFloat(parts[1] || 0);
              return bidAmount > prev ? bidAmount : prev;
            }, 0);
            status = highestBid > 0 ? 'SOLD' : 'DISCARDED';
          } else if (item.item_type === 'exchange') {
            status = 'DISCARDED';
          }
          await this.updateItemById(item.id, { status });
        }
      }
    },

    async setItemAsSold(itemId) {
      const tipId = await this.resolveCurrentId(itemId);
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Item not found"));
          if (['SOLD','DISCARDED'].includes(String(item.content.status).toUpperCase().replace(/\s+/g,'_')))
            return reject(new Error("Already sold/discarded"));
          if (item.content.stock <= 0) return reject(new Error("Out of stock"));

          const soldMsg = {
            ...item.content,
            stock: 0,
            status: 'SOLD',
            updatedAt: new Date().toISOString(),
            replaces: tipId
          };
          const tomb1 = { type: 'tombstone', target: tipId, deletedAt: new Date().toISOString(), author: userId };

          ssbClient.publish(tomb1, err => {
            if (err) return reject(err);
            ssbClient.publish(soldMsg, (err2, soldRes) => {
              if (err2) return reject(err2);

              const touchMsg = {
                ...soldMsg,
                updatedAt: new Date().toISOString(),
                replaces: soldRes.key
              };
              const tomb2 = { type: 'tombstone', target: soldRes.key, deletedAt: new Date().toISOString(), author: userId };

              ssbClient.publish(tomb2, err3 => {
                if (err3) return reject(err3);
                ssbClient.publish(touchMsg, (err4, finalRes) => err4 ? reject(err4) : resolve(finalRes));
              });
            });
          });
        });
      });
    },

    async addBidToAuction(itemId, userId, bidAmount) {
      const tipId = await this.resolveCurrentId(itemId);
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Item not found"));
          if (item.content.item_type !== 'auction') return reject(new Error("Not an auction"));
          if (item.content.seller === userId) return reject(new Error("Cannot bid on your own item"));
          if (parseFloat(bidAmount) <= parseFloat(item.content.price)) return reject(new Error("Bid too low"));
          const highestBid = (item.content.auctions_poll || []).reduce((prev, curr) => {
            const parts = String(curr).split(':'); const bid = parseFloat(parts[1] || 0);
            return Math.max(prev, bid);
          }, 0);
          if (parseFloat(bidAmount) <= highestBid) return reject(new Error("Bid not highest"));
          const bid = `${userId}:${bidAmount}:${new Date().toISOString()}`;
          const updated = { ...item.content, auctions_poll: [...(item.content.auctions_poll || []), bid], stock: item.content.stock - 1, updatedAt: new Date().toISOString(), replaces: tipId };
          const tombstone = { type: 'tombstone', target: tipId, deletedAt: new Date().toISOString(), author: userId };
          ssbClient.publish(tombstone, (err) => {
            if (err) return reject(err);
            ssbClient.publish(updated, (err2, res) => err2 ? reject(err2) : resolve(res));
          });
        });
      });
    },

    async decrementStock(itemId) {
      const tipId = await this.resolveCurrentId(itemId);
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Item not found"));

          const curStatus = String(item.content.status).toUpperCase().replace(/\s+/g,'_');
          if (['SOLD','DISCARDED'].includes(curStatus)) {
            return resolve({ ok: true, noop: true });
          }

          const current = Number(item.content.stock) || 0;
          if (current <= 0) {
            return resolve({ ok: true, noop: true });
          }

          const newStock = current - 1;
          const updated = {
            ...item.content,
            stock: newStock,
            status: newStock === 0 ? 'SOLD' : item.content.status,
            updatedAt: new Date().toISOString(),
            replaces: tipId
          };

          const tombstone = {
            type: 'tombstone',
            target: tipId,
            deletedAt: new Date().toISOString(),
            author: userId
          };

          ssbClient.publish(tombstone, (e1) => {
            if (e1) return reject(e1);
            ssbClient.publish(updated, (e2, res) => e2 ? reject(e2) : resolve(res));
          });
        });
      });
    }
    
  };
};

