"use strict";

const debug = require("../server/node_modules/debug")("oasis");
const { isRoot, isReply: isComment } = require("../server/node_modules/ssb-thread-schema");
const lodash = require("../server/node_modules/lodash");
const prettyMs = require("../server/node_modules/pretty-ms");
const pullAbortable = require("../server/node_modules/pull-abortable");
const pullParallelMap = require("../server/node_modules/pull-paramap");
const pull = require("../server/node_modules/pull-stream");
const pullSort = require("../server/node_modules/pull-sort");

const path = require('path');
const fs = require('fs/promises');
const os = require('os');

const ssbRef = require("../server/node_modules/ssb-ref");

const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const isEncrypted = (message) => typeof message.value.content === "string";
const isNotEncrypted = (message) => isEncrypted(message) === false;

const isDecrypted = (message) =>
  lodash.get(message, "value.meta.private", false);

const isPrivate = (message) => isEncrypted(message) || isDecrypted(message);

const isNotPrivate = (message) => isPrivate(message) === false;

const hasRoot = (message) =>
  ssbRef.isMsg(lodash.get(message, "value.content.root", null));

const hasFork = (message) =>
  ssbRef.isMsg(lodash.get(message, "value.content.fork", null));

const hasNoRoot = (message) => hasRoot(message) === false;
const hasNoFork = (message) => hasFork(message) === false;

const isPost = (message) =>
  lodash.get(message, "value.content.type") === "post" &&
  typeof lodash.get(message, "value.content.text") === "string";

const isBlogPost = (message) =>
  lodash.get(message, "value.content.type") === "blog" &&
  typeof lodash.get(message, "value.content.title") === "string" &&
  ssbRef.isBlob(lodash.get(message, "value.content.blog", null));

const isTextLike = (message) => isPost(message) || isBlogPost(message);

const isSubtopic = require("../server/node_modules/ssb-thread-schema/post/nested-reply/validator");

const nullImage = `&${"0".repeat(43)}=.sha256`;

const defaultOptions = {
  private: true,
  reverse: true,
  meta: true,
};

const publicOnlyFilter = pull.filter(isNotPrivate);

const configure = (...customOptions) =>
  Object.assign({}, defaultOptions, ...customOptions);
 
// peers 
const ebtDir = path.join(os.homedir(), '.ssb', 'ebt');
const unfollowedPath = path.join(os.homedir(), '.ssb', 'gossip_unfollowed.json');

async function loadPeersFromEbt() {
  let result = [];
  try {
    await fs.access(ebtDir);
    const files = await fs.readdir(ebtDir);
    for (const file of files) {
      if (!file.endsWith('.ed25519')) continue;
      const base = file.replace(/^@/, '').replace('.ed25519', '');
      let core = base.replace(/_/g, '/').replace(/-/g, '+');
      if (!core.endsWith('=')) core += '=';
      const filePath = path.join(ebtDir, file);
      try {
        const data = await fs.readFile(filePath, 'utf8');
        const users = JSON.parse(data);
        const userList = Object.keys(users).map(u => ({
          id: u,
          link: `/author/${encodeURIComponent(u)}`
        }));
        result.push({
          pub: `@${core}.ed25519`,
          users: userList
        });
      } catch {}
    }
  } catch {}
  return result;
}

async function loadConnectedUsersFromEbt(pubId) {
  const filePath = path.join(ebtDir, `@${pubId.replace(/\//g, '_')}.ed25519`);
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const users = JSON.parse(data);
    return Object.keys(users).map(userId => ({
      id: userId,
      link: `/author/${encodeURIComponent(userId)}`
    }));
  } catch {
    return [];
  }
}

const canonicalizePubId = (s) => {
  const core0 = String(s).replace(/^@/, '').replace(/\.ed25519$/, '');
  let core = core0.replace(/_/g, '/').replace(/-/g, '+');
  if (!core.endsWith('=')) core += '=';
  return `@${core}.ed25519`;
};

const parseRemote = (remote) => {
  // net: format (TCP)
  let m = /^net:([^:]+):\d+~shs:([^=]+)=/.exec(remote);
  if (m) return { host: m[1], pubId: canonicalizePubId(m[2]) };
  // ws/wss format (WebSocket)
  m = /^wss?:\/\/([^:/]+)(?::\d+)?.*~shs:([^=]+)=/.exec(remote);
  if (m) return { host: m[1], pubId: canonicalizePubId(m[2]) };
  // Generic: extract ~shs: part from any format
  m = /~shs:([^=]+)=/.exec(remote);
  if (m) return { host: null, pubId: canonicalizePubId(m[1]) };
  return { host: null, pubId: null };
};

async function ensureJSONFile(p, initial = []) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  try { await fs.access(p) } catch { await fs.writeFile(p, JSON.stringify(initial, null, 2), 'utf8') }
}

async function readJSON(p) {
  await ensureJSONFile(p, []);
  try { return JSON.parse((await fs.readFile(p, 'utf8')) || '[]') } catch { return [] }
}

function canonicalKey(key) {
  let core = String(key).replace(/^@/, '').replace(/\.ed25519$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!core.endsWith('=')) core += '=';
  return `@${core}.ed25519`;
}

async function loadUnfollowedSet() {
  const list = await readJSON(unfollowedPath);
  return new Set(list.map(x => canonicalKey(x && x.key)));
}

function toLegacyInvite(s) {
  const t = String(s || '').trim();
  if (/^[^:]+:\d+:@[^~]+~[^~]+$/.test(t)) return t;
  let m = t.match(/^net:([^:]+):(\d+)~shs:([^~]+)~invite:([^~]+)$/);
  if (!m) m = t.match(/^([^:]+):(\d+)~shs:([^~]+)~invite:([^~]+)$/);
  if (!m) return t;
  let key = m[3].replace(/^@/, '');
  if (!/\.ed25519$/.test(key)) key += '.ed25519';
  return `${m[1]}:${m[2]}:@${key}~${m[4]}`;
}

// core modules
module.exports = ({ cooler, isPublic }) => {
  const models = {};
  const getAbout = async ({ key, feedId }) => {
    const ssb = await cooler.open();
    const source = ssb.backlinks.read({
      reverse: true,
      query: [
        {
          $filter: {
            dest: feedId,
            value: {
              author: feedId,
              content: { type: "about", about: feedId },
            },
          },
        },
      ],
    });
    return new Promise((resolve, reject) =>
      pull(
        source,
        pull.find(
          (message) => message.value.content[key] !== undefined,
          (err, message) => {
            if (err) {
              reject(err);
            } else {
              if (message === null) {
                resolve(null);
              } else {
                resolve(message.value.content[key]);
              }
            }
          }
        )
      )
    );
  };
  const feeds_to_name = {};
  let all_the_names = {};
  let dirty = false;
  let running = false;
  const transposeLookupTable = () => {
    if (!dirty) return;
    if (running) return;
    running = true;

    all_the_names = {};

    const allFeeds = Object.keys(feeds_to_name);
    console.log(`- Synced-peers: [ ${allFeeds.length} ]`);
    console.time("- Sync-time");

    const lookups = [];
    for (const feed of allFeeds) {
      const e = feeds_to_name[feed];
      let pair = { feed, name: e.name };
      lookups.push(enhanceFeedInfo(pair));
    }
    Promise.all(lookups)
      .then(() => {
        dirty = false; 
        running = false;
        console.timeEnd("- Sync-time");
      })
      .catch((err) => {
        running = false;
        console.warn("- Lookup Sync failed: ", err);
      });
  };
  const enhanceFeedInfo = ({ feed, name }) => {
    return new Promise((resolve, reject) => {
      getAbout({ feedId: feed, key: "image" })
        .then((img) => {
          if (
            img !== null &&
            typeof img !== "string" &&
            typeof img === "object" &&
            typeof img.link === "string"
          ) {
            img = img.link;
          } else if (img === null) {
            img = nullImage; 
          }

          models.friend
            .getRelationship(feed)
            .then((rel) => {
              let feeds_named = all_the_names[name] || [];
              feeds_named.push({ feed, name, rel, img });
              all_the_names[name.toLowerCase()] = feeds_named;
              resolve();
            })
            .catch(reject);
        })
        .catch(reject);
    });
  };
  
  async function enrichEntries(entries) {
  const ebtList = await loadPeersFromEbt();
  const ebtMap = new Map(ebtList.map(e => [e.pub, e.users]));
  const ssb = await cooler.open();
  return Promise.all(
    entries.map(async ([remote, data]) => {
      const { host, pubId } = parseRemote(remote);
      const effectiveKey = pubId || (data && data.key ? canonicalizePubId(data.key) : null);
      const name = host || (effectiveKey ? await models.about.name(effectiveKey).catch(() => (effectiveKey || '').slice(0, 10)) : remote);
      const users = effectiveKey && ebtMap.has(effectiveKey) ? ebtMap.get(effectiveKey) : [];
      const usersWithNames = await Promise.all(
        users.map(async (user) => {
          const userName = await models.about.name(user.id).catch(() => user.id);
          return { ...user, name: userName };
        })
      );
      return [
        remote,
        {
          ...data,
          key: effectiveKey || remote,
          name,
          users: usersWithNames
        }
      ];
    })
  );
};
  
//ABOUT MODEL
models.about = {
  publicWebHosting: async (feedId) => {
    const result = await getAbout({
      key: "publicWebHosting",
      feedId,
    });
    return result === true;
  },
  name: async (feedId) => {
    if (isPublic && (await models.about.publicWebHosting(feedId)) === false) {
      return "Redacted";
    }
    return (
      (await getAbout({
        key: "name",
        feedId,
      })) || feedId.slice(1, 1 + 8)
    );
  },
  named: (name) => {
    let found = [];
    let matched = Object.keys(all_the_names).filter((n) => {
      return n.startsWith(name.toLowerCase());
    });
    for (const m of matched) {
      found = found.concat(all_the_names[m]);
    }
    return found;
  },
  image: async (feedId) => {
    if (isPublic && (await models.about.publicWebHosting(feedId)) === false) {
      return nullImage; 
    }
    const timeoutPromise = (timeout) => new Promise((_, reject) => setTimeout(() => reject('Timeout'), timeout));

    try {
      const raw = await Promise.race([
        getAbout({
          key: "image",
          feedId,
        }),
        timeoutPromise(5000),
      ]);
      if (raw == null || raw.link == null) {
        return nullImage;
      }
      if (typeof raw.link === "string") {
        return raw.link;
      }
      return raw;
    } catch (error) {
      return '/assets/images/default-avatar.png';
    }
  },
  description: async (feedId) => {
    if (isPublic && (await models.about.publicWebHosting(feedId)) === false) {
      return "Redacted";
    }
    const raw =
      (await getAbout({
        key: "description",
        feedId,
      })) || "";
    return raw;
  },
  _startNameWarmup() {
    const abortable = pullAbortable();
    let intervals = [];
    cooler.open().then((ssb) => {
      console.time("Warmup-time");
      pull(
        ssb.query.read({
          live: true,
          query: [
            {
              $filter: {
                value: {
                  content: {
                    type: "about",
                    name: { $is: "string" },
                  },
                },
              },
            },
          ],
        }),
        abortable,
        pull.filter((msg) => {
          if (msg.sync && msg.sync === true) {
            console.timeEnd("Warmup-time");
            transposeLookupTable();
            intervals.push(setInterval(transposeLookupTable, 1000 * 60)); 
            return false;
          }
          return msg.value.author == msg.value.content.about;
        }),
        pull.drain((msg) => {
          const name = msg.value.content.name;
          const ts = msg.value.timestamp;
          const feed = msg.value.author;

          const newEntry = { name, ts };
          const currentEntry = feeds_to_name[feed];
          if (typeof currentEntry == "undefined") {
            dirty = true;
            feeds_to_name[feed] = newEntry;
          } else if (currentEntry.ts < ts) {
            dirty = true;
            feeds_to_name[feed] = newEntry;
          }
        }, (err) => {
          console.error(err);
        })
      );
    });
    return {
      close: () => {
        abortable.abort();
        intervals.forEach((i) => clearInterval(i));
      },
    };
  },
};

// BLOBS MODEL
function blobIdToHexPath(blobId) {
  const homeDir = os.homedir();
  const m = /^&([A-Za-z0-9+/=]+)\.sha256$/.exec(blobId);
  if (!m) throw new Error('Invalid blobId: ' + blobId);
  const b64 = m[1];
  const buf = Buffer.from(b64, 'base64');
  const hex = buf.toString('hex');
  const prefix = hex.slice(0, 2);
  return path.join(homeDir, '.ssb', 'blobs', 'sha256', prefix, hex);
}

async function checkLocalBlob(blobId) {
  const filePath = blobIdToHexPath(blobId);
  try {
    const buf = await fs.readFile(filePath);
    if (buf && buf.length) return buf;
  } catch (_) { /* not found */ }
  return null;
}

models.blob = {
  getResolved: async ({ blobId, timeout = 30000 }) => {
    let buf = await checkLocalBlob(blobId);
    if (buf) return buf;
    const ssb = await cooler.open();
    await new Promise((resolve, reject) => {
      ssb.blobs.want(blobId, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return new Promise((resolve, reject) => {
      let timer = setTimeout(() => resolve(null), timeout);
      pull(
        ssb.blobs.get(blobId),
        pull.collect(async (err, bufs) => {
          clearTimeout(timer);
          if (err || !bufs || !bufs.length) return resolve(null);
          const buffer = Buffer.concat(bufs);
          try {
            const filePath = blobIdToHexPath(blobId);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, buffer);
          } catch (e) { /* ignore */ }
          resolve(buffer);
        })
      );
    });
  },
  want: async ({ blobId }) => {
    const ssb = await cooler.open();
    return new Promise((resolve, reject) => {
      ssb.blobs.want(blobId, (err) => {
        if (err) reject(new Error(`Failed to request blob: ${blobId}`));
        else resolve();
      });
    });
  }
};

//FRIENDS MODEL
models.friend = {
  setRelationship: async ({ feedId, following, blocking }) => {
    if (following && blocking) {
      throw new Error("Cannot follow and block at the same time");
    }
    const current = await models.friend.getRelationship(feedId);
    const alreadySet =
     current.following === following && current.blocking === blocking;

    if (alreadySet) {
      return;
    }
    const ssb = await cooler.open();
    const content = {
      type: "contact",
      contact: feedId,
      following,
      blocking,
    };
    transposeLookupTable();
    return new Promise((resolve, reject) => {
      ssb.publish(content, (err, msg) => {
        if (err) reject(err);
        else resolve(msg);
      });
    });
  },
    follow: (feedId) =>
      models.friend.setRelationship({
        feedId,
        following: true,
        blocking: false,
      }),
    unfollow: (feedId) =>
      models.friend.setRelationship({
        feedId,
        following: false,
        blocking: false,
      }),
    block: (feedId) =>
      models.friend.setRelationship({
        feedId,
        blocking: true,
        following: false,
      }),
    unblock: (feedId) =>
      models.friend.setRelationship({
        feedId,
        blocking: false,
        following: false,
      }),
  getRelationship: async (feedId) => {
    const ssb = await cooler.open();
    const { id } = ssb;
    if (feedId === id) {
    return {
      me: true,
      following: false,
      blocking: false,
      followsMe: false,
      };
    }
    const isFollowing = await new Promise((resolve, reject) => {
      ssb.friends.isFollowing({ source: id, dest: feedId }, (err, val) => {
        if (err) reject(err);
        else resolve(val);
      });
    });
    const isBlocking = await new Promise((resolve, reject) => {
      ssb.friends.isBlocking({ source: id, dest: feedId }, (err, val) => {
        if (err) reject(err);
        else resolve(val);
      });
    });
    const followsMe = await new Promise((resolve, reject) => {
      ssb.friends.isFollowing({ source: feedId, dest: id }, (err, val) => {
        if (err) reject(err);
        else resolve(val);
     });
    });
    return {
      me: false,
      following: isFollowing,
      blocking: isBlocking,
      followsMe,
      };
    },
  };
  
//META MODEL
models.meta = {
    myFeedId: async () => {
      const ssb = await cooler.open();
      const { id } = ssb;
      return id;
    },
    get: async (msgId) => {
      const ssb = await cooler.open();
      return new Promise((resolve, reject) => {
        ssb.get(
          {
            id: msgId,
            meta: true,
            private: true,
          },
          (err, msg) => {
            if (err) reject(err);
            else resolve(msg);
          }
        );
       });
    },
    status: async () => {
      const ssb = await cooler.open();
      return ssb.status();
    },
    peers: async () => {
      const ssb = await cooler.open();
      return new Promise((resolve, reject) => {
        pull(
          ssb.conn.peers(),
          pull.take(1),
          pull.collect((err, [entries]) => {
            if (err) return reject(err);
            resolve(entries);
          })
        );
      });
    },
    connectedPeers: async () => {
      const peers = await models.meta.peers();
      return peers.filter(([_, data]) => data.state === "connected");
    },
    onlinePeers: async () => {
      const entries = await models.meta.connectedPeers();
      return enrichEntries(entries);
    },
    discovered: async () => {
      const ssb = await cooler.open();
      const snapshot = await ssb.conn.dbPeers();
      // Read gossip.json to merge announcers data
      const gossipPath = path.join(os.homedir(), '.ssb', 'gossip.json');
      let gossipMap = new Map();
      try {
        const gossipData = JSON.parse(await fs.readFile(gossipPath, 'utf8'));
        if (Array.isArray(gossipData)) {
          for (const g of gossipData) {
            if (g.key) gossipMap.set(canonicalizePubId(g.key), g);
          }
        }
      } catch {}
      const allDbPeers = await enrichEntries(snapshot);
      // Merge announcers from gossip.json into enriched peers
      for (const [, peerData] of allDbPeers) {
        if ((!peerData.announcers || peerData.announcers === 0) && gossipMap.has(peerData.key)) {
          const gossipEntry = gossipMap.get(peerData.key);
          if (gossipEntry.announcers) peerData.announcers = gossipEntry.announcers;
        }
      }
      const connectedEntries = await models.meta.connectedPeers();
      const onlineKeys = new Set(connectedEntries.map(([remote]) => {
        const m = /~shs:([^=]+)=/.exec(remote);
        if (!m) return null;
        let core = m[1].replace(/-/g, '+').replace(/_/g, '/');
        if (!core.endsWith('=')) core += '=';
        return `@${core}.ed25519`;
      }).filter(Boolean));
      const discoveredPeers = allDbPeers.filter(([, d]) => !onlineKeys.has(d.key));
      const discoveredIds = new Set(allDbPeers.map(([, d]) => d.key));
      const ebtList = await loadPeersFromEbt();
      const ebtMap = new Map(ebtList.map(e => [e.pub, e.users]));
      const unknownPeers = [];
      for (const { pub } of ebtList) {
        if (!discoveredIds.has(pub) && !onlineKeys.has(pub)) {
          const name = await models.about.name(pub).catch(() => pub);
          unknownPeers.push([pub, { key: pub, name, users: ebtMap.get(pub) || [] }]);
        }
      }
      return { discoveredPeers, unknownPeers };
    },
    connStop: async () => {
      const ssb = await cooler.open();
      try {
        const result = await ssb.conn.stop();
        return result;
      } catch (e) {
        const expectedName = "TypeError";
        const expectedMessage = "Cannot read property 'close' of null";
        if (e.name === expectedName && e.message === expectedMessage) {
          debug("ssbConn is already stopped -- caught error");
        } else {
          throw new Error(e);
        }
      }
    },
    connStart: async () => {
      const ssb = await cooler.open();
      const result = await ssb.conn.start();

      return result;
    },
    connRestart: async () => {
      await models.meta.connStop();
      await models.meta.connStart();
    },
    sync: async () => {
      const ssb = await cooler.open();

      const progress = await ssb.progress();
      let previousTarget = progress.indexes.target;

      let keepGoing = true;
      const timeoutInterval = setTimeout(() => {
        keepGoing = false;
      }, 5 * 60 * 1000);

      await ssb.conn.start();

      const diff = async () =>
        new Promise((resolve) => {
          setTimeout(async () => {
            const currentProgress = await ssb.progress();
            const currentTarget = currentProgress.indexes.target;
            const difference = currentTarget - previousTarget;
            previousTarget = currentTarget;
            debug(`Difference: ${difference} bytes`);
            resolve(difference);
          }, 5000);
        });

      debug("Starting sync, waiting for new messages...");
      while (keepGoing && (await diff()) === 0) {
        debug("Received no new messages.");
      }
      debug("Finished waiting for first new message.");
      while (keepGoing && (await diff()) > 0) {
        debug(`Still receiving new messages...`);
      }
      debug("Finished waiting for last new message.");
      clearInterval(timeoutInterval);
      await ssb.conn.stop();
    },
    acceptInvite: async (invite) => {
      const ssb = await cooler.open();
      const code = toLegacyInvite(String(invite || ''));
      return await new Promise((resolve, reject) => {
        ssb.invite.accept(code, (err, res) => err ? reject(err) : resolve(res));
      });
    },
    rebuild: async () => {
      const ssb = await cooler.open();
      return ssb.rebuild();
    },
  };

  const isLooseRoot = (message) => {
    const conditions = [
      isPost(message),
      hasNoRoot(message),
      hasNoFork(message),
    ];

    return conditions.every((x) => x);
  };

  const isLooseSubtopic = (message) => {
    const conditions = [isPost(message), hasRoot(message), hasFork(message)];

    return conditions.every((x) => x);
  };

  const isLooseComment = (message) => {
    const conditions = [isPost(message), hasRoot(message), hasNoFork(message)];

    return conditions.every((x) => x === true);
  };

  const maxMessages = 30; // change it to control post overloading

  const getMessages = async ({
    myFeedId,
    customOptions,
    ssb,
    query,
    filter = null,
  }) => {
    const source = ssb.createLogStream({ reverse: true,  limit: logLimit });

    return new Promise((resolve, reject) => {
      pull(
        source,
        pull.filter((msg) => {
          return msg.value.content.type === "post";
        }),
        pull.collect((err, collectedMessages) => {
          if (err) {
           reject(err);
          } else {
           resolve(collectedMessages);
          }
        })
      );
    });
  };

  const socialFilter = async ({
    following = null,
    blocking = false,
    me = null,
    } = {}) => {
    const ssb = await cooler.open();
    const { id } = ssb;

    const relationshipObject = await new Promise((resolve, reject) => {
      ssb.friends.graph((err, graph) => {
        if (err) {
          console.error(err);
          reject(err);
        }
        resolve(graph[id] || {});
      });
    });

    const followingList = Object.entries(relationshipObject)
      .filter(([, val]) => val >= 0)
      .map(([key]) => key);

    const blockingList = Object.entries(relationshipObject)
      .filter(([, val]) => val === -1)
      .map(([key]) => key);

    return pull.filter((message) => {
      if (message.value.author === id) {
        return me !== false;
      } else {
        return (
          (following === null ||
            followingList.includes(message.value.author) === following) &&
          (blocking === null ||
            blockingList.includes(message.value.author) === blocking)
        );
      }
    });
  };
  const getUserInfo = async (feedId) => {
    const pendingName = models.about.name(feedId);
    const pendingAvatarMsg = models.about.image(feedId);
    const pending = [pendingName, pendingAvatarMsg];
    const [name, avatarMsg] = await Promise.all(pending);
    const avatarId =
      avatarMsg != null && typeof avatarMsg.link === "string"
        ? avatarMsg.link || nullImage
        : avatarMsg || nullImage;

    const avatarUrl = `/image/64/${encodeURIComponent(avatarId)}`;
    return { name, feedId, avatarId, avatarUrl };
  };

  function getRecipientFeedId(recipient) {
    if (typeof recipient === "string") {
      return recipient;
    } else {
      return recipient.link;
    }
  }

  const transform = (ssb, messages, myFeedId) =>
   Promise.all(
    messages.map(async (msg) => {
      try {
        debug("transforming %s", msg.key);

        if (msg == null) {
          return null;
        }

        const filterQuery = {
          $filter: {
            dest: msg.key,
          },
        };

        const referenceStream = ssb.backlinks.read({
          query: [filterQuery],
          index: "DTA",
          private: true,
          meta: true,
        });
        if (lodash.get(msg, "value.content.type") === "blog") {
          const blogTitle = msg.value.content.title;
          const blogSummary = lodash.get(msg, "value.content.summary", null);
          const blobId = msg.value.content.blog;
          const blogContent = await models.blob.getResolved({ blobId });
          let textElements = [`# ${blogTitle}`, blogContent];
          if (blogSummary) {
            textElements.splice(1, 0, `**${blogSummary}**`);
          }
          lodash.set(msg, "value.content.text", textElements.join("\n\n"));
        }
        const rawVotes = await new Promise((resolve, reject) => {
          pull(
            referenceStream,
            pull.filter(
              (ref) =>
                isNotEncrypted(ref) &&
                ref.value.content.type === "vote" &&
                ref.value.content.vote &&
                typeof ref.value.content.vote.value === "number" &&
                ref.value.content.vote.value >= 0 &&
                ref.value.content.vote.link === msg.key
            ),
            pull.collect((err, collectedMessages) => {
              if (err) {
                reject(err);
              } else {
                resolve(collectedMessages);
              }
            })
          );
        });
        const reducedVotes = rawVotes.reduce((acc, vote) => {
          acc[vote.value.author] = vote.value.content.vote.value;
          return acc;
        }, {});

        const voters = Object.entries(reducedVotes)
          .filter(([, value]) => value === 1)
          .map(([key]) => key);

        const pendingVoterNames = voters.map(async (author) => ({
          name: await models.about.name(author),
          key: author,
        }));
        const voterNames = await Promise.all(pendingVoterNames);
        const { name, avatarId, avatarUrl } = await getUserInfo(
          msg.value.author
        );

        if (isPublic) {
          const publicOptIn = await models.about.publicWebHosting(
            msg.value.author
          );
          if (publicOptIn === false) {
            lodash.set(
              msg,
              "value.content.text",
              "This is a public message that has been redacted because Oasis is running in public mode. This redaction is only meant to make Oasis consistent with other public SSB viewers. Please do not mistake this for privacy. All public messages are public. Any peer on the Oasis network can see this message."
            );

            if (msg.value.content.contentWarning != null) {
              msg.value.content.contentWarning = "Redacted";
            }
          }
        }
        const ts = new Date(msg.value.timestamp);
        let isoTs;

        try {
          isoTs = ts.toISOString();
        } catch (e) {
          const receivedTs = new Date(msg.timestamp);
          isoTs = receivedTs.toISOString();
        }

        lodash.set(msg, "value.meta.timestamp.received.iso8601", isoTs);

        const ago = Date.now() - Number(ts);
        const prettyAgo = prettyMs(ago, { compact: true });
        lodash.set(msg, "value.meta.timestamp.received.since", prettyAgo);
        lodash.set(msg, "value.meta.author.name", name);
        lodash.set(msg, "value.meta.author.avatar", {
          id: avatarId,
          url: avatarUrl,
        });
        if (isTextLike(msg) && hasNoRoot(msg) && hasNoFork(msg)) {
          lodash.set(msg, "value.meta.postType", "post");
        } else if (isTextLike(msg) && hasRoot(msg) && hasNoFork(msg)) {
          lodash.set(msg, "value.meta.postType", "comment");
        } else if (isTextLike(msg) && hasRoot(msg) && hasFork(msg)) {
          lodash.set(msg, "value.meta.postType", "subtopic");
        } else {
          lodash.set(msg, "value.meta.postType", "mystery");
        }

        lodash.set(msg, "value.meta.votes", voterNames);
        lodash.set(msg, "value.meta.voted", voters.includes(myFeedId));

        if (isPrivate(msg)) {
          msg.value.meta.recpsInfo = await Promise.all(
            msg.value.content.recps.map((recipient) => {
              return getUserInfo(getRecipientFeedId(recipient));
            })
          );
        }

        const { blocking } = await models.friend.getRelationship(
          msg.value.author
        );
        lodash.set(msg, "value.meta.blocking", blocking);

        return msg;

      } catch (err) {
        return null; 
      }
    })
  );

  const getLimitPost = async (feedId, reverse) => {
    const ssb = await cooler.open();
    const source = ssb.createUserStream({ id: feedId, reverse: reverse });
    const messages = await new Promise((resolve, reject) => {
      pull(
        source,
        pull.filter((msg) => isDecrypted(msg) === false && isPost(msg)),
        pull.take(1),
        pull.collect((err, collectedMessages) => {
          if (err) {
            reject(err);
          } else {
            resolve(transform(ssb, collectedMessages, feedId));
          }
        })
      );
    });
    return messages.length ? messages[0] : undefined;
  };

// POST MODEL
const post = {
    firstBy: async (feedId) => {
      return getLimitPost(feedId, false);
    },
    latestBy: async (feedId) => {
      return getLimitPost(feedId, true);
    },
    fromPublicFeed: async (feedId, gt = -1, lt = -1, customOptions = {}) => {
      const ssb = await cooler.open();

      const myFeedId = ssb.id;

      let defaultOptions = { id: feedId };
      if (lt >= 0) defaultOptions.lt = lt;
      if (gt >= 0) defaultOptions.gt = gt;
      defaultOptions.reverse = !(gt >= 0 && lt < 0);
      const options = configure(defaultOptions, customOptions);
      const { blocking } = await models.friend.getRelationship(feedId);
      if (blocking) {
        return [];
      }

      const source = ssb.createUserStream(options);

      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          pull.filter((msg) => isDecrypted(msg) === false && isTextLike(msg)),
          pull.take(maxMessages),
          pull.collect((err, collectedMessages) => {
            if (err) {
              reject(err);
            } else {
              resolve(transform(ssb, collectedMessages, myFeedId));
            }
          })
        );
      });

      if (!defaultOptions.reverse) return messages.reverse();
      else return messages;
    },

  mentionsMe: async (customOptions = {}) => {
    const ssb = await cooler.open();
    const myFeedId = ssb.id;
    const { name: myUsername } = await getUserInfo(myFeedId);
    const query = [
        {
        $filter: {
          "value.content.type": "post",
        },
      },
    ];
    const messages = await getMessages({
      myFeedId,
      customOptions,
      ssb,
      query,
      filter: (msg) => {
        const content = msg.value.content;
        if (content.mentions) {
          if (Array.isArray(content.mentions)) {
            return content.mentions.some(m => m.link === myFeedId || m.name === myUsername || m.name === '@' + myUsername);
          }
          if (typeof content.mentions === 'object' && !Array.isArray(content.mentions)) {
            const values = Object.values(content.mentions);
            return values.some(v => v.link === myFeedId || v.name === myUsername || v.name === '@' + myUsername);
          }
        }
        const mentionsText = lodash.get(content, "text", "");
        if (mentionsText.includes(myFeedId) || mentionsText.includes(myFeedId.slice(1))) return true;
        const mdMentionRegex = /\[@[^\]]*\]\(@?([A-Za-z0-9+/=.\-]+\.ed25519)\)/g;
        let match;
        while ((match = mdMentionRegex.exec(mentionsText))) {
          if ('@' + match[1] === myFeedId || match[1] === myFeedId.slice(1)) return true;
        }
        return false; 
      },
    });
    return { messages, myFeedId };
  },

  fromHashtag: async (hashtag, customOptions = {}) => {
   const ssb = await cooler.open();
   const myFeedId = ssb.id;
   const query = [
    {
      $filter: {
        dest: `#${hashtag}`,
      },
    },
  ];
  const messages = await getMessages({
    myFeedId,
    customOptions,
    ssb,
    query,
   });

   return messages;
  },  
  topicComments: async (rootId, customOptions = {}) => {
    const ssb = await cooler.open();
    const myFeedId = ssb.id;
    const query = [
      {
        $filter: {
          value: {
            content: {
              type: "post",
              root: rootId,
            },
          },
        },
      },
    ];
    const messages = await getMessages({
      myFeedId,
      customOptions,
      ssb,
      query,
    });
    const fullMessages = await Promise.all(
      messages.map(async (msg) => {
        if (typeof msg === "string") {
          return new Promise((resolve, reject) => {
            ssb.get({ id: msg, meta: true, private: true }, (err, fullMsg) => {
              if (err) reject(err);
              else resolve(fullMsg);
            });
          });
        }
        return msg;
      })
    );
    return fullMessages;
  },
  likes: async ({ feed }, customOptions = {}) => {
      const ssb = await cooler.open();
      const query = [
        {
          $filter: {
            value: {
              author: feed,
              timestamp: { $lte: Date.now() },
              content: {
                type: 'vote',
              },
            },
          },
        },
      ];
      const options = { ...defaultOptions, query, reverse: true, ...customOptions };
      const source = await ssb.query.read(options);
      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          pull.filter((msg) => {
            return (
              isNotEncrypted(msg) &&
              msg.value.author === feed &&
              typeof msg.value.content.vote === 'object' &&
              typeof msg.value.content.vote.link === 'string'
            );
          }),
          pull.take(maxMessages),
          pull.unique((message) => message.value.content.vote.link),
          pullParallelMap(async (val, cb) => {
            const msg = await post.get(val.value.content.vote.link);
            cb(null, msg);
          }),
          pull.filter((message) =>
            message.value.meta.votes.map((voter) => voter.key).includes(feed)
          ),
          pull.collect((err, collectedMessages) => {
            if (err) {
              reject(err);
            } else {
              resolve(collectedMessages);
            }
          })
        );
      });
      return messages;
    },
    search: async ({ query }) => {
      const ssb = await cooler.open();

      const myFeedId = ssb.id;

      const options = configure({
        query,
      });

      const source = await ssb.search.query(options);
      const basicSocialFilter = await socialFilter();

      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          basicSocialFilter,
          pull.filter(isNotPrivate),
          pull.take(maxMessages),
          pull.collect((err, collectedMessages) => {
            if (err) {
              reject(err);
            } else {
              resolve(transform(ssb, collectedMessages, myFeedId));
            }
          })
        );
      });

      return messages;
    },
    latest: async () => {
      const ssb = await cooler.open();

      const myFeedId = ssb.id;

      const source = ssb.query.read(
        configure({
          query: [
            {
              $filter: {
                value: {
                  timestamp: { $lte: Date.now() },
                  content: {
                    type: { $in: ["post", "blog"] },
                  },
                },
              },
            },
          ],
        })
      );
      const followingFilter = await socialFilter({ following: true });

      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          followingFilter,
          publicOnlyFilter,
          pull.take(maxMessages),
          pull.collect((err, collectedMessages) => {
            if (err) {
              reject(err);
            } else {
              resolve(transform(ssb, collectedMessages, myFeedId));
            }
          })
        );
      });

      return messages;
    },
    latestExtended: async () => {
      const ssb = await cooler.open();

      const myFeedId = ssb.id;

      const source = ssb.query.read(
        configure({
          query: [
            {
              $filter: {
                value: {
                  timestamp: { $lte: Date.now() },
                  content: {
                    type: { $in: ["post", "blog"] },
                  },
                },
              },
            },
          ],
        })
      );

      const extendedFilter = await socialFilter({
        following: false,
        me: false,
      });

      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          publicOnlyFilter,
          extendedFilter,
          pull.take(maxMessages),
          pull.collect((err, collectedMessages) => {
            if (err) {
              reject(err);
            } else {
              resolve(transform(ssb, collectedMessages, myFeedId));
            }
          })
        );
      });

      return messages;
    },
    latestTopics: async () => {
      const ssb = await cooler.open();

      const myFeedId = ssb.id;

      const source = ssb.query.read(
        configure({
          query: [
            {
              $filter: {
                value: {
                  timestamp: { $lte: Date.now() },
                  content: {
                    type: { $in: ["post", "blog"] },
                  },
                },
              },
            },
          ],
        })
      );

      const extendedFilter = await socialFilter({
        following: true,
      });

      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          publicOnlyFilter,
          pull.filter(hasNoRoot),
          extendedFilter,
          pull.take(maxMessages),
          pull.collect((err, collectedMessages) => {
            if (err) {
              reject(err);
            } else {
              resolve(transform(ssb, collectedMessages, myFeedId));
            }
          })
        );
      });

      return messages;
    },
    latestSummaries: async () => {
      const ssb = await cooler.open();

      const myFeedId = ssb.id;

      const options = configure({
        type: "post",
        private: false,
      });

      const source = ssb.messagesByType(options);

      const extendedFilter = await socialFilter({
        following: true,
      });

      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          pull.filter((message) => isNotPrivate(message) && hasNoRoot(message)),
          extendedFilter,
          pull.take(maxMessages),
          pullParallelMap(async (message, cb) => {
            const thread = await post.fromThread(message.key);
            lodash.set(
              message,
              "value.meta.thread",
              await transform(ssb, thread, myFeedId)
            );
            cb(null, message);
          }),
          pull.collect((err, collectedMessages) => {
            if (err) {
              reject(err);
            } else {
              resolve(transform(ssb, collectedMessages, myFeedId));
            }
          })
        );
      });

      return messages;
    },
    latestThreads: async () => {
      const ssb = await cooler.open();

      const myFeedId = ssb.id;

      const source = ssb.query.read(
        configure({
          query: [
            {
              $filter: {
                value: {
                  timestamp: { $lte: Date.now() },
                  content: {
                    type: { $in: ["post", "blog"] },
                  },
                },
              },
            },
          ],
        })
      );
      const basicSocialFilter = await socialFilter();

      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          basicSocialFilter,
          pull.filter((message) => isNotPrivate(message) && hasNoRoot(message)),
          pull.take(maxMessages),
          pullParallelMap(async (message, cb) => {
            const thread = await post.fromThread(message.key);
            lodash.set(
              message,
              "value.meta.thread",
              await transform(ssb, thread, myFeedId)
            );
            cb(null, message);
          }),
          pull.filter((message) => message.value.meta.thread.length > 1),
          pull.collect((err, collectedMessages) => {
            if (err) {
              reject(err);
            } else {
              resolve(transform(ssb, collectedMessages, myFeedId));
            }
          })
        );
      });

      return messages;
    },

    popular: async ({ period }) => {
      const ssb = await cooler.open();

      const periodDict = {
        day: 1,
        week: 7,
        month: 30.42,
        year: 365,
      };

      if (period in periodDict === false) {
        throw new Error("invalid period");
      }

      const myFeedId = ssb.id;

      const now = new Date();
      const earliest = Number(now) - 1000 * 60 * 60 * 24 * periodDict[period];
      const source = ssb.query.read(
        configure({
          query: [
            {
              $filter: {
                value: {
                  timestamp: { $gte: earliest },
                  content: {
                    type: "vote",
                  },
                },
              },
            },
          ],
        })
      );
      const basicSocialFilter = await socialFilter();

      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          publicOnlyFilter,
          pull.filter((msg) => {
            return (
              isNotEncrypted(msg) &&
              typeof msg.value.content.vote === "object" &&
              typeof msg.value.content.vote.link === "string" &&
              typeof msg.value.content.vote.value === "number"
            );
          }),
          pull.reduce(
            (acc, cur) => {
              const author = cur.value.author;
              const target = cur.value.content.vote.link;
              const value = cur.value.content.vote.value;

              if (acc[author] == null) {
                acc[author] = {};
              }
              acc[author][target] = Math.max(-1, Math.min(1, value));

              return acc;
            },
            {},
            (err, obj) => {
              if (err) {
                return reject(err);
              }
              const adjustedObj = Object.entries(obj).reduce(
                (acc, [author, values]) => {
                  if (author === myFeedId) {
                    return acc;
                  }
                  const entries = Object.entries(values);
                  const total = 1 + Math.log(entries.length);

                  entries.forEach(([link, value]) => {
                    if (acc[link] == null) {
                      acc[link] = 0;
                    }
                    acc[link] += value / total;
                  });
                  return acc;
                },
                []
              );

              const arr = Object.entries(adjustedObj);
              const length = arr.length;

              pull(
                pull.values(arr),
                pullSort(([, aVal], [, bVal]) => bVal - aVal),
                pull.take(Math.min(length, maxMessages)),
                pull.map(([key]) => key),
                pullParallelMap(async (key, cb) => {
                  try {
                    const msg = await post.get(key);
                    cb(null, msg);
                  } catch (e) {
                    cb(null, null);
                  }
                }),
                pull.filter(
                  (message) =>
                    message &&
                    isNotPrivate(message) &&
                    (message.value.content.type === "post" ||
                      message.value.content.type === "blog")
                ),
                basicSocialFilter,
                pull.collect((collectErr, collectedMessages) => {
                  if (collectErr) {
                    reject(collectErr);
                  } else {
                    resolve(collectedMessages);
                  }
                })
              );
            }
          )
        );
      });

      return messages;
    },
  fromThread: async (msgId, customOptions) => {
    const ssb = await cooler.open();
    const myFeedId = ssb.id;
    const options = configure({ id: msgId }, customOptions);

    const rawMsg = await new Promise((resolve, reject) => {
      ssb.get(options, (err, msg) => {
        if (err) reject(err);
        else resolve(msg);
      });
    });
    const parents = [];
    const getRootAncestor = (msg) =>
      new Promise((resolve, reject) => {
      if (msg.key == null) {
        resolve(parents);
      } else if (isEncrypted(msg)) {
        if (parents.length > 0) {
          resolve(parents);
        } else {
          resolve(msg);
        }
      } else if (msg.value.content.type !== "post") {
        resolve(msg);
      } else if (isLooseSubtopic(msg) && ssbRef.isMsg(msg.value.content.fork)) {
        ssb.get(
          { id: msg.value.content.fork, meta: true, private: true },
          (err, fork) => {
            if (err) reject(err);
            else getRootAncestor(fork).then(resolve).catch(reject);
          }
        );
      } else if (isLooseComment(msg) && ssbRef.isMsg(msg.value.content.root)) {
        ssb.get(
          { id: msg.value.content.root, meta: true, private: true },
          (err, root) => {
            if (err) reject(err);
            else getRootAncestor(root).then(resolve).catch(reject);
          }
        );
      } else if (isLooseRoot(msg)) {
        resolve(msg);
      } else {
        resolve(msg);
      }
    });

    const getDirectDescendants = (key) =>
      new Promise((resolve, reject) => {
      const filterQuery = {
        $filter: {
          dest: key,
        },
      };

      const referenceStream = ssb.backlinks.read({
        query: [filterQuery],
        index: "DTA",
      });

      pull(
        referenceStream,
        pull.filter((msg) => {
          if (!isTextLike(msg)) return false;
          const root = lodash.get(msg, "value.content.root");
          const fork = lodash.get(msg, "value.content.fork");
          if (root !== key && fork !== key) return false;
          if (fork === key) return false;
          return true;
        }),
        pull.collect((err, messages) => {
          if (err) reject(err);
          else resolve(messages || undefined);
        })
      );
    });

    const flattenDeep = (arr1) =>
      arr1.reduce(
        (acc, val) =>
          Array.isArray(val)
            ? acc.concat(flattenDeep(val))
            : acc.concat(val),
        []
      );

    const getDeepDescendants = (key) =>
      new Promise((resolve, reject) => {
        const oneDeeper = async (descendantKey, depth) => {
        const descendants = await getDirectDescendants(descendantKey);
        if (descendants.length === 0) return descendants;
        return Promise.all(
          descendants.map(async (descendant) => {
            const deeperDescendants = await oneDeeper(descendant.key, depth + 1);
            lodash.set(descendant, "value.meta.thread.depth", depth);
            lodash.set(descendant, "value.meta.thread.subtopic", true);
            return [descendant, deeperDescendants];
          })
        );
      };
      oneDeeper(key, 0)
        .then((nested) => {
          const nestedDescendants = [...nested];
          const deepDescendants = flattenDeep(nestedDescendants);
          resolve(deepDescendants);
        })
        .catch(reject);
      });
    const rootAncestor = await getRootAncestor(rawMsg);
    const deepDescendants = await getDeepDescendants(rootAncestor.key);
    const allMessages = [rootAncestor, ...deepDescendants].map((message) => {
      const isThreadTarget = message.key === msgId;
      lodash.set(message, "value.meta.thread.target", isThreadTarget);
      return message;
    });
    return await transform(ssb, allMessages, myFeedId);
  },
  get: async (msgId, customOptions) => {
    const ssb = await cooler.open();
    const myFeedId = ssb.id;
    const options = configure({ id: msgId }, customOptions);
    const rawMsg = await new Promise((resolve, reject) => {
      ssb.get(options, (err, msg) => {
        if (err) reject(err);
        else resolve(msg);
      });
    });
    const transformed = await transform(ssb, [rawMsg], myFeedId);
    return transformed[0];
  },
   publish: async (options) => {
      const ssb = await cooler.open();
      const body = { type: "post", ...options };
      return new Promise((resolve, reject) => {
        ssb.publish(body, (err, msg) => {
          if (err) reject(err);
          else resolve(msg);
        });
      });
    },
    publishProfileEdit: async ({ name, description, image }) => {
      const ssb = await cooler.open();
      if (image.length > 0) {
        const megabyte = Math.pow(2, 20);
        const maxSize = 50 * megabyte;
        if (image.length > maxSize) {
          throw new Error("File is too big, maximum size is 50 megabytes");
        }
        return new Promise((resolve, reject) => {
          pull(
            pull.values([image]),
            ssb.blobs.add((err, blobId) => {
              if (err) {
                reject(err);
              } else {
                const content = {
                  type: "about",
                  about: ssb.id,
                  name,
                  description,
                  image: blobId,
                };
                ssb.publish(content, (err, msg) => {
                  if (err) reject(err);
                  else resolve(msg);
                });
              }
            })
          );
        });
      } else {
        const body = { type: "about", about: ssb.id, name, description };
        return new Promise((resolve, reject) => {
          ssb.publish(body, (err, msg) => {
            if (err) reject(err);
            else resolve(msg);
          });
        });
      }
    },
    publishCustom: async (options) => {
      const ssb = await cooler.open();
      return new Promise((resolve, reject) => {
        ssb.publish(options, (err, msg) => {
          if (err) reject(err);
          else resolve(msg);
        });
      });
    },
    subtopic: async ({ parent, message }) => {
      message = { ...message };
      message.root = parent.key;
      message.fork = lodash.get(parent, "value.content.root");
      message.branch = await post.branch({ root: parent.key });
      message.type = "post";
      if (!Array.isArray(message.mentions)) message.mentions = [];
      if (isSubtopic(message) !== true) {
        const messageString = JSON.stringify(message, null, 2);
        throw new Error(`message should be valid subtopic: ${messageString}`);
      }
      return post.publish(message);
    },
    root: async (options) => {
      const message = { type: "post", ...options };
      if (isRoot(message) !== true) {
        const messageString = JSON.stringify(message, null, 2);
      }
      return post.publish(message);
    },
  comment: async ({ parent, message }) => {
    if (!parent || !parent.value) {
      throw new Error("Invalid parent message: Missing 'value'");
    }

    const parentKey = parent.key;
    const parentFork = lodash.get(parent, "value.content.fork");
    const parentRoot = lodash.get(parent, "value.content.root", parentKey);

    if (isDecrypted(parent)) {
      message.recps = lodash
      .get(parent, "value.content.recps", [])
      .map((recipient) => {
        if (
          typeof recipient === "object" &&
          typeof recipient.link === "string" &&
          recipient.link.length
        ) {
          return recipient.link;
        } else {
          return recipient;
        }
      });

     if (message.recps.length === 0) {
        throw new Error("Refusing to publish message with no recipients");
      }
    }

    const parentHasFork = parentFork != null;
    message.root = parentHasFork ? parentKey : parentRoot;
    message.branch = await post.branch({ root: parent.key });
    message.type = "post";

    if (isComment(message) !== true) {
      const messageString = JSON.stringify(message, null, 2);
      throw new Error(`Message should be a valid comment: ${messageString}`);
    }
    return post.publish(message);
  },
  branch: async ({ root }) => {
    const ssb = await cooler.open();
    return new Promise((resolve, reject) => {
    ssb.tangle.branch(root, (err, keys) => {
      if (err) {
        return reject(err);
      }
      resolve(keys);
    });
  });
  },
    channels: async () => {
      const ssb = await cooler.open();

      const source = ssb.createUserStream({ id: ssb.id });

      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          pull.filter((message) => {
            return lodash.get(message, "value.content.type") === "channel"
              ? true
              : false;
          }),
          pull.collect((err, collectedMessages) => {
            if (err) {
              reject(err);
            } else {
              resolve(transform(ssb, collectedMessages, ssb.id));
            }
          })
        );
      });

      const channels = messages.map((msg) => {
        return {
          channel: msg.value.content.channel,
          subscribed: msg.value.content.subscribed,
        };
      });

      let subbedChannels = [];

      channels.forEach((ch) => {
        if (ch.subscribed && !subbedChannels.includes(ch.channel)) {
          subbedChannels.push(ch.channel);
        }
        if (ch.subscribed === false && subbedChannels.includes(ch.channel)) {
          subbedChannels = lodash.pull(subbedChannels, ch.channel);
        }
      });

      return subbedChannels;
    },    
    inbox: async () => {
      const ssb = await cooler.open();
      const myFeedId = ssb.id;
      const rawMessages = await new Promise((resolve, reject) => {
        pull(
          ssb.createLogStream({ reverse: true, limit: logLimit }),
          pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs)))
        );
      });
     const decryptedMessages = rawMessages.map(msg => {
        try {
          return ssb.private.unbox(msg);
        } catch {
          return null;
        }
      }).filter(Boolean);
      const tombstoneTargets = new Set(
        decryptedMessages
          .filter(msg => msg.value?.content?.type === 'tombstone')
          .map(msg => msg.value.content.target)
      );
      return decryptedMessages.filter(msg => {
        if (tombstoneTargets.has(msg.key)) return false;
          const content = msg.value?.content;
          const author = msg.value?.author;
          return content?.type === 'post' && content?.private === true && (author === myFeedId || content.to?.includes(myFeedId));
      });
    }

  };
  models.post = post;

// SPREAD MODEL
models.vote = {
  publish: async ({ messageKey, value, recps }) => {
      const ssb = await cooler.open();
      const branch = await new Promise((resolve, reject) => {
        ssb.tangle.branch(messageKey, (err, result) => {
          if (err) {
            console.error("Error fetching branch:", err);
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
      const content = {
        type: "vote",
        vote: {
          link: messageKey,
          value: Number(value),
        },
        branch,
        recps,
      };
      return new Promise((resolve, reject) => {
        ssb.publish(content, (err, msg) => {
          if (err) {
            console.error("Publish error:", err);
            reject(err);
          } else {
            resolve(msg);
          }
        });
      });
  },
};

//return models
return models;
};
