const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  return {
    type: 'market',

    async createItem(item_type, title, description, image, price, tagsRaw = [], item_status, deadline, includesShipping = false) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const formattedDeadline = deadline ? moment(deadline, moment.ISO_8601, true).toISOString() : null;
      let blobId = null;
      if (image) {
        const match = image.match(/\(([^)]+)\)/);
        blobId = match ? match[1] : image;
      }
      const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        seller: userId,
        auctions_poll: []
      };
      return new Promise((resolve, reject) => {
        ssbClient.publish(itemContent, (err, res) => err ? reject(err) : resolve(res));
      });
    },

    async updateItemById(itemId, updatedData) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(itemId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Item not found"));
          if (item.content.seller !== userId) return reject(new Error("Not the seller"));
          if (['SOLD', 'DISCARDED'].includes(item.content.status)) return reject(new Error("Cannot update this item"));
          const updated = {
            ...item.content,
            ...updatedData,
            tags: updatedData.tags || item.content.tags,
            updatedAt: new Date().toISOString(),
            replaces: itemId
          };
          const tombstone = {
            type: 'tombstone',
            target: itemId,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          ssbClient.publish(tombstone, (err) => {
            if (err) return reject(err);
            ssbClient.publish(updated, (err2, res) => err2 ? reject(err2) : resolve(res));
          });
        });
      });
    },

    async deleteItemById(itemId) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(itemId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Item not found"));
          if (item.content.seller !== userId) return reject(new Error("Not the seller"));
          const tombstone = {
            type: 'tombstone',
            target: itemId,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          ssbClient.publish(tombstone, (err) => err ? reject(err) : resolve({ message: "Item deleted successfully" }));
        });
      });
    },

    async listAllItems(filter = 'all') {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
	  return new Promise((resolve, reject) => {
	    pull(
	      ssbClient.createLogStream(),
	      pull.collect(async (err, results) => {
		if (err) return reject(new Error("Error listing items: " + err.message));
		const tombstoned = new Set();
		const replaces = new Map();
		const itemsById = new Map();

		for (const msg of results) {
		  const c = msg.value?.content;
		  const k = msg.key;
		  if (!c) continue;
		  if (c.type === 'tombstone' && c.target) {
		    tombstoned.add(c.target);
		    continue;
		  }
		  if (c.type === 'market') {
		    if (tombstoned.has(k)) continue;
		    if (c.replaces) replaces.set(c.replaces, k);
		    itemsById.set(k, { id: k, ...c });
		  }
		}

		for (const replacedId of replaces.keys()) {
		  itemsById.delete(replacedId);
		}

		let filteredItems = Array.from(itemsById.values());
		await this.checkAuctionItemsStatus(filteredItems);

		switch (filter) {
		  case 'mine':
		    filteredItems = filteredItems.filter(e => e.seller === userId);
		    break;
		  case 'exchange':
		    filteredItems = filteredItems.filter(e => e.item_type === 'exchange' && e.status === 'FOR SALE');
		    break;
		  case 'auctions':
		    filteredItems = filteredItems.filter(e => e.item_type === 'auction' && e.status === 'FOR SALE');
		    break;
		  case 'new':
		    filteredItems = filteredItems.filter(e => e.item_status === 'NEW' && e.status === 'FOR SALE');
		    break;
		  case 'used':
		    filteredItems = filteredItems.filter(e => e.item_status === 'USED' && e.status === 'FOR SALE');
		    break;
		  case 'broken':
		    filteredItems = filteredItems.filter(e => e.item_status === 'BROKEN' && e.status === 'FOR SALE');
		    break;
		  case 'for sale':
		    filteredItems = filteredItems.filter(e => e.status === 'FOR SALE');
		    break;
		  case 'sold':
		    filteredItems = filteredItems.filter(e => e.status === 'SOLD');
		    break;
		  case 'discarded':
		    filteredItems = filteredItems.filter(e => e.status === 'DISCARDED');
		    break;
		  default:
		    break;
		}

		filteredItems = filteredItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
		resolve(filteredItems);
	      })
	    );
	  });
	},

    async checkAuctionItemsStatus(items) {
      const now = new Date().toISOString();
      for (let item of items) {
        if ((item.item_type === 'auction' || item.item_type === 'exchange') && item.deadline && now > item.deadline) {
          if (['SOLD', 'DISCARDED'].includes(item.status)) continue;
          let status = item.status;
          if (item.item_type === 'auction') {
            const highestBid = item.auctions_poll.reduce((prev, curr) => {
              const [_, bidAmount] = curr.split(':');
              return parseFloat(bidAmount) > prev ? parseFloat(bidAmount) : prev;
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
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      return new Promise((resolve, reject) => {
        ssbClient.get(itemId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Item not found"));
          if (['SOLD', 'DISCARDED'].includes(item.content.status)) return reject(new Error("Already sold/discarded"));
          const updated = {
            ...item.content,
            status: 'SOLD',
            updatedAt: new Date().toISOString(),
            replaces: itemId
          };
          const tombstone = {
            type: 'tombstone',
            target: itemId,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          ssbClient.publish(tombstone, (err) => {
            if (err) return reject(err);
            ssbClient.publish(updated, (err2, res) => err2 ? reject(err2) : resolve(res));
          });
        });
      });
    },

    async getItemById(itemId) {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.get(itemId, async (err, item) => {
          if (err || !item?.content) return reject(new Error("Item not found"));
          const c = item.content;
          let status = c.status || 'FOR SALE';
          if (c.deadline) {
            const deadlineMoment = moment(c.deadline);
            if (deadlineMoment.isValid() && deadlineMoment.isBefore(moment()) && status !== 'SOLD') {
              status = 'DISCARDED';
              const tombstone = {
                type: 'tombstone',
                target: itemId,
                deletedAt: new Date().toISOString(),
                author: c.seller
              };
              const updated = { ...c, status, updatedAt: new Date().toISOString() };
              await ssbClient.publish(tombstone);
              await ssbClient.publish(updated);
            }
          }
          resolve({
            id: itemId,
            title: c.title,
            description: c.description,
            price: c.price,
            status,
            item_status: c.item_status,
            seller: c.seller,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
            image: c.image || null,
            tags: c.tags || [],
            includesShipping: c.includesShipping,
            deadline: c.deadline,
            auctions_poll: c.auctions_poll || [],
            item_type: c.item_type
          });
        });
      });
    },

    async addBidToAuction(itemId, userId, bidAmount) {
      const ssbClient = await openSsb();
      return new Promise((resolve, reject) => {
        ssbClient.get(itemId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Item not found"));
          if (item.content.item_type !== 'auction') return reject(new Error("Not an auction"));
          if (item.content.seller === userId) return reject(new Error("Cannot bid on your own item"));
          if (parseFloat(bidAmount) <= parseFloat(item.content.price)) return reject(new Error("Bid too low"));
          const highestBid = item.content.auctions_poll.reduce((prev, curr) => {
            const [_, bid] = curr.split(':');
            return Math.max(prev, parseFloat(bid));
          }, 0);
          if (parseFloat(bidAmount) <= highestBid) return reject(new Error("Bid not highest"));
          const bid = `${userId}:${bidAmount}:${new Date().toISOString()}`;
          const updated = {
            ...item.content,
            auctions_poll: [...(item.content.auctions_poll || []), bid],
            updatedAt: new Date().toISOString(),
            replaces: itemId
          };
          const tombstone = {
            type: 'tombstone',
            target: itemId,
            deletedAt: new Date().toISOString(),
            author: userId
          };
          ssbClient.publish(tombstone, (err) => {
            if (err) return reject(err);
            ssbClient.publish(updated, (err2, res) => err2 ? reject(err2) : resolve(res));
          });
        });
      });
    }
  };
};

