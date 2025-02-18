"use strict";

const debug = require("../server/node_modules/debug")("oasis");
const { isRoot, isReply: isComment } = require("../server/node_modules/ssb-thread-schema");
const lodash = require("../server/node_modules/lodash");
const prettyMs = require("../server/node_modules/pretty-ms");
const pullAbortable = require("../server/node_modules/pull-abortable");
const pullParallelMap = require("../server/node_modules/pull-paramap");
const pull = require("../server/node_modules/pull-stream");
const pullSort = require("../server/node_modules/pull-sort");

const ssbRef = require("../server/node_modules/ssb-ref");

const {
  RequestManager,
  HTTPTransport,
  Client } = require("../server/node_modules/@open-rpc/client-js");

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
    console.log(`Synced-feeds: [ ${allFeeds.length} ]`);
    console.time("Sync-time");

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
        console.timeEnd("Sync-time");
      })
      .catch((err) => {
        running = false;
        console.warn("lookup sync failed:", err);
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

    const raw = await getAbout({
      key: "image",
      feedId,
    });

    if (raw == null || raw.link == null) {
      return nullImage;
    }

    if (typeof raw.link === "string") {
      return raw.link;
    }
    return raw;
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


  models.blob = {
    get: async ({ blobId }) => {
      debug("get blob: %s", blobId);
      const ssb = await cooler.open();
      return ssb.blobs.get(blobId);
    },
    getResolved: async ({ blobId }) => {
      const bufferSource = await models.blob.get({ blobId });
      debug("got buffer source");
      return new Promise((resolve) => {
        pull(
          bufferSource,
          pull.collect(async (err, bufferArray) => {
            if (err) {
              await models.blob.want({ blobId });
              resolve(Buffer.alloc(0));
            } else {
              const buffer = Buffer.concat(bufferArray);
              resolve(buffer);
            }
          })
        );
      });
    },
    want: async ({ blobId }) => {
      debug("want blob: %s", blobId);
      cooler
        .open()
        .then((ssb) => {
          ssb.blobs.want(blobId);
        })
        .catch((err) => {
          console.warn(`failed to want blob:${blobId}: ${err}`);
        });
    },
    search: async ({ query }) => {
      debug("blob search: %s", query);
      const ssb = await cooler.open();

      return new Promise((resolve, reject) => {
        ssb.meme.search(query, (err, blobs) => {
          if (err) return reject(err);

          return resolve(blobs);
        });
      });
    },
  };

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
      return ssb.publish(content);
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

      const isFollowing = await ssb.friends.isFollowing({
        source: id,
        dest: feedId,
      });

      const isBlocking = await ssb.friends.isBlocking({
        source: id,
        dest: feedId,
      });

      const followsMe = await ssb.friends.isFollowing({
        source: feedId,
        dest: id,
      });

      return {
        me: false,
        following: isFollowing,
        blocking: isBlocking,
        followsMe: followsMe,
      };
    },
  };

  models.meta = {
    myFeedId: async () => {
      const ssb = await cooler.open();
      const { id } = ssb;
      return id;
    },
    get: async (msgId) => {
      const ssb = await cooler.open();
      return ssb.get({
        id: msgId,
        meta: true,
        private: true,
      });
    },
    status: async () => {
      const ssb = await cooler.open();
      return ssb.status();
    },
    peers: async () => {
      const ssb = await cooler.open();
      const peersSource = await ssb.conn.peers();

      return new Promise((resolve, reject) => {
        pull(
          peersSource,
          pull.take(1),
          pull.collect((err, val) => {
            if (err) return reject(err);
            resolve(val[0]);
          })
        );
      });
    },
    connectedPeers: async () => {
      const peers = await models.meta.peers();
      return peers.filter(([address, data]) => {
        if (data.state === "connected") {
          return [address, data];
        }
      });
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
      return await ssb.invite.accept(invite);
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

  const maxMessages = 64;

  const getMessages = async ({
    myFeedId,
    customOptions,
    ssb,
    query,
    filter = null,
  }) => {
    const options = configure({ query, index: "DTA" }, customOptions);
    const source = ssb.backlinks.read(options);
    const basicSocialFilter = await socialFilter();

    return new Promise((resolve, reject) => {
      pull(
        source,
        basicSocialFilter,
        pull.filter(
          (msg) =>
            isNotEncrypted(msg) &&
            isPost(msg) &&
            (filter == null || filter(msg) === true)
        ),
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
              "This is a public message that has been redacted because Oasis is running in public mode. This redaction is only meant to make Oasis consistent with other public SSB viewers. Please do not mistake this for privacy. All public messages are public. Any peer on the SSB network can see this message."
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

    const query = [
    {
      $filter: {
        dest: myFeedId,
      },
    },
    ];

  const messages = await getMessages({
    myFeedId,
    customOptions,
    ssb,
    query,
    filter: (msg) =>
      lodash.get(msg, "value.meta.private") !== true,
  });
  return messages;
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
            dest: rootId,
          },
        },
      ];

      const messages = await getMessages({
        myFeedId,
        customOptions,
        ssb,
        query,
        filter: (msg) => msg.value.content.root === rootId && hasNoFork(msg),
      });

      return messages;
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
                type: "vote",
              },
            },
          },
        },
      ];

      const options = configure(
        {
          query,
          reverse: true,
        },
        customOptions
      );

      const source = await ssb.query.read(options);

      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          pull.filter((msg) => {
            return (
              isNotEncrypted(msg) &&
              msg.value.author === feed &&
              typeof msg.value.content.vote === "object" &&
              typeof msg.value.content.vote.link === "string"
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
            // Retrieve a preview of this post's comments / thread
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
            // Retrieve a preview of this post's comments / thread
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
      debug("thread: %s", msgId);
      const ssb = await cooler.open();

      const myFeedId = ssb.id;

      const options = configure({ id: msgId }, customOptions);
      return ssb
        .get(options)
        .then(async (rawMsg) => {
          debug("got raw message");

          const parents = [];

          const getRootAncestor = (msg) =>
            new Promise((resolve, reject) => {
              if (msg.key == null) {
                debug("something is very wrong, we used `{ meta: true }`");
                resolve(parents);
              } else {
                debug("getting root ancestor of %s", msg.key);

                if (isEncrypted(msg)) {
                  debug("private message");
                  if (parents.length > 0) {
                    resolve(parents);
                  } else {
                    resolve(msg);
                  }
                } else if (msg.value.content.type !== "post") {
                  debug("not a post");
                  resolve(msg);
                } else if (
                  isLooseSubtopic(msg) &&
                  ssbRef.isMsg(msg.value.content.fork)
                ) {
                  debug("subtopic, get the parent");
                  try {
                    ssb
                      .get({
                        id: msg.value.content.fork,
                        meta: true,
                        private: true,
                      })
                      .then((fork) => {
                        resolve(getRootAncestor(fork));
                      })
                      .catch(reject);
                  } catch (e) {
                    debug(e);
                    resolve(msg);
                  }
                } else if (
                  isLooseComment(msg) &&
                  ssbRef.isMsg(msg.value.content.root)
                ) {
                  debug("comment: %s", msg.value.content.root);
                  try {
                    ssb
                      .get({
                        id: msg.value.content.root,
                        meta: true,
                        private: true,
                      })
                      .then((root) => {
                        resolve(getRootAncestor(root));
                      })
                      .catch(reject);
                  } catch (e) {
                    debug(e);
                    resolve(msg);
                  }
                } else if (isLooseRoot(msg)) {
                  debug("got root ancestor");
                  resolve(msg);
                } else {
                  debug(
                    "got mysterious root ancestor that fails all known schemas"
                  );
                  debug("%O", msg);
                  resolve(msg);
                }
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
                  if (isTextLike(msg) === false) {
                    return false;
                  }

                  const root = lodash.get(msg, "value.content.root");
                  const fork = lodash.get(msg, "value.content.fork");

                  if (root !== key && fork !== key) {
                    return false;
                  }

                  if (fork === key) {
                    return false;
                  }

                  return true;
                }),
                pull.collect((err, messages) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve(messages || undefined);
                  }
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

                if (descendants.length === 0) {
                  return descendants;
                }

                return Promise.all(
                  descendants.map(async (descendant) => {
                    const deeperDescendants = await oneDeeper(
                      descendant.key,
                      depth + 1
                    );
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

          const allMessages = [rootAncestor, ...deepDescendants].map(
            (message) => {
              const isThreadTarget = message.key === msgId;
              lodash.set(message, "value.meta.thread.target", isThreadTarget);
              return message;
            }
          );

          return await transform(ssb, allMessages, myFeedId);
        })
        .catch((err) => {
          if (err.name === "NotFoundError") {
            throw new Error(
              "Message not found in the database. You've done nothing wrong. Maybe try again later?"
            );
          } else {
            throw err;
          }
        });
    },
    get: async (msgId, customOptions) => {
      debug("get: %s", msgId);
      const ssb = await cooler.open();

      const myFeedId = ssb.id;

      const options = configure({ id: msgId }, customOptions);
      const rawMsg = await ssb.get(options);
      debug("got raw message");

      const transformed = await transform(ssb, [rawMsg], myFeedId);
      debug("transformed: %O", transformed);
      return transformed[0];
    },
    publish: async (options) => {
      const ssb = await cooler.open();
      const body = { type: "post", ...options };

      debug("Published: %O", body);
      return ssb.publish(body);
    },
    publishProfileEdit: async ({ name, description, image }) => {
      const ssb = await cooler.open();
      if (image.length > 0) {
        // 25 MiB check (here we set max file size allowed!)
        const megabyte = Math.pow(2, 20);
        const maxSize = 25 * megabyte;
        if (image.length > maxSize) {
          throw new Error("File is too big, maximum size is 25 megabytes");
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
                debug("Published: %O", content);
                resolve(ssb.publish(content));
              }
            })
          );
        });
      } else {
        const body = { type: "about", about: ssb.id, name, description };
        debug("Published: %O", body);
        return ssb.publish(body);
      }
    },
    publishCustom: async (options) => {
      const ssb = await cooler.open();
      debug("Published: %O", options);
      return ssb.publish(options);
    },
    subtopic: async ({ parent, message }) => {
      message.root = parent.key;
      message.fork = lodash.get(parent, "value.content.root");
      message.branch = await post.branch({ root: parent.key });
      message.type = "post"; // redundant but used for validation

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
        throw new Error(`message should be valid comment: ${messageString}`);
      }

      return post.publish(message);
    },
    branch: async ({ root }) => {
      const ssb = await cooler.open();
      const keys = await ssb.tangle.branch(root);

      return keys;
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
    inbox: async (customOptions = {}) => {
      const ssb = await cooler.open();

      const myFeedId = ssb.id;

      const options = configure(
        {
          query: [{ $filter: { dest: ssb.id } }],
        },
        customOptions
      );

      const source = ssb.backlinks.read(options);

      const messages = await new Promise((resolve, reject) => {
        pull(
          source,
          pull.filter(
            (message) =>
              isDecrypted(message) &&
              (lodash.get(message, "value.content.type") === "post" ||
                lodash.get(message, "value.content.type") === "blog")
          ),
          pull.unique((message) => {
            const { root } = message.value.content;
            if (root == null) {
              return message.key;
            } else {
              return root;
            }
          }),
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
  };
  models.post = post;

models.vote = {
    publish: async ({ messageKey, value, recps }) => {
      const ssb = await cooler.open();
      const branch = await ssb.tangle.branch(messageKey);

      await ssb.publish({
        type: "vote",
        vote: {
          link: messageKey,
          value: Number(value),
        },
        branch,
        recps,
      });
    },
  };

models.wallet = {
    client: async (url, user, pass) => {
      const transport = new HTTPTransport(url, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${user}:${pass}`)
        }
      });
      return new Client(new RequestManager([transport]));
    },
    execute: async (url, user, pass, method, params = []) => {
      try {
        const client = await models.wallet.client(url, user, pass);
        return await client.request({ method, params });
      } catch (error) {
        throw new Error(
          "ECOin wallet disconnected. " +
          "Check your wallet settings or connection status."
        );
      }
    },
    getBalance: async (url, user, pass) => {
      return await models.wallet.execute(url, user, pass, "getbalance");
    },
    getAddress: async (url, user, pass) => {
      const addresses = await models.wallet.execute(url, user, pass, "getaddressesbyaccount", ['']);
      return addresses[0]  // TODO: Handle multiple addresses
    },
    listTransactions: async (url, user, pass) => {
      return await models.wallet.execute(url, user, pass, "listtransactions", ["", 1000000, 0]);
    },
    sendToAddress: async (url, user, pass, address, amount) => {
      return await models.wallet.execute(url, user, pass, "sendtoaddress", [address, amount]);
    },
    validateSend: async (url, user, pass, address, amount, fee) => {
      let isValid = false
      const errors = [];
      const addressValid = await models.wallet.execute(url, user, pass, "validateaddress", [address]);
      const amountValid = amount > 0;
      const feeValid = fee > 0;
      if (!addressValid.isvalid) { errors.push("invalid_dest") }
      if (!amountValid) { errors.push("invalid_amount") }
      if (!feeValid) { errors.push("invalid_fee") }
      if (errors.length == 0) { isValid = true }
      return { isValid, errors }
    }
  }

//legacy: export/import .ssb secret (private key)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

function encryptFile(filePath, password) {
  if (typeof password === 'object' && password.password) {
    password = password.password;
  }
  const key = Buffer.from(password, 'utf-8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const homeDir = os.homedir();
  const encryptedFilePath = path.join(homeDir, 'oasis.enc');
  const output = fs.createWriteStream(encryptedFilePath);
  const input = fs.createReadStream(filePath);
  input.pipe(cipher).pipe(output);
  return new Promise((resolve, reject) => {
    output.on('finish', () => {
      resolve(encryptedFilePath);
    });
    output.on('error', (err) => {
      reject(err);
    });
  });
}

function decryptFile(filePath, password) {
  if (typeof password === 'object' && password.password) {
    password = password.password;
  } 
  const key = Buffer.from(password, 'utf-8');
  const iv = crypto.randomBytes(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv); 
  const homeDir = os.homedir();
  const decryptedFilePath = path.join(homeDir, 'secret');
  const output = fs.createWriteStream(decryptedFilePath);
  const input = fs.createReadStream(filePath);
  input.pipe(decipher).pipe(output);
  return new Promise((resolve, reject) => {
    output.on('finish', () => {
      resolve(decryptedFilePath);
    });
    output.on('error', (err) => {
      console.error('Error deciphering data:', err);
      reject(err);
    });
  });
}

models.legacy = {
  exportData: async (password) => {
    try {
      const homeDir = os.homedir();
      const secretFilePath = path.join(homeDir, '.ssb', 'secret');
      
      if (!fs.existsSync(secretFilePath)) {
        throw new Error(".ssb/secret file doesn't exist");
      }
      const encryptedFilePath = await encryptFile(secretFilePath, password);   
      fs.unlinkSync(secretFilePath);
      return encryptedFilePath;
    } catch (error) {
      throw new Error("Error exporting data: " + error.message);
    }
  },
  importData: async ({ filePath, password }) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error('Encrypted file not found.');
      }
      const decryptedFilePath = await decryptFile(filePath, password);

      if (!fs.existsSync(decryptedFilePath)) {
        throw new Error("Decryption failed.");
      }

      fs.unlinkSync(filePath);
      return decryptedFilePath;

    } catch (error) {
      throw new Error("Error importing data: " + error.message);
    }
  }
};

//cipher: encrypt/decrypt text at client side
function encryptText(text, password) {
  if (typeof password === 'object' && password.password) {
    password = password.password;
  }
  const key = Buffer.from(password, 'utf-8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encryptedText = cipher.update(text, 'utf-8', 'hex');
  encryptedText += cipher.final('hex');
  const ivHex = iv.toString('hex');
  return { encryptedText, iv: ivHex }; 
}

function decryptText(encryptedText, password, ivHex) {
  if (typeof password === 'object' && password.password) {
    password = password.password;
  }
  const key = Buffer.from(password, 'utf-8');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decryptedText = decipher.update(encryptedText, 'hex', 'utf-8');
  decryptedText += decipher.final('utf-8');
  return decryptedText;
}

models.cipher = {
  encryptData: (text, password) => {
    try {
      const { encryptedText, iv } = encryptText(text, password);
      return { encryptedText, iv }; 
    } catch (error) {
      throw new Error("Error encrypting data: " + error.message);
    }
  },
  decryptData: (encryptedText, password, iv) => {
    try {
      const decryptedText = decryptText(encryptedText, password, iv);
      return decryptedText;
    } catch (error) {
      throw new Error("Error decrypting data: " + error.message);
    }
  }
};

//return models
return models;
};
