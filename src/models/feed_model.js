const pull = require("../server/node_modules/pull-stream");
const { getConfig } = require("../configs/config-manager.js");
const categories = require("../backend/opinion_categories");
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const FEED_TEXT_MIN = Number(getConfig().feed?.minLength ?? 1);
const FEED_TEXT_MAX = Number(getConfig().feed?.maxLength ?? 280);

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const cleanText = (t) => (typeof t === "string" ? t.trim() : "");

  const isValidFeedText = (t) => {
    const s = cleanText(t);
    return s.length >= FEED_TEXT_MIN && s.length <= FEED_TEXT_MAX;
  };

  const getMsg = (ssbClient, id) =>
    new Promise((resolve, reject) => {
      ssbClient.get(id, (err, val) => (err ? reject(err) : resolve({ key: id, value: val })));
    });

  const getAllMessages = (ssbClient) =>
    new Promise((resolve, reject) => {
      pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((err, msgs) => (err ? reject(err) : resolve(msgs))));
    });

  const extractTags = (text) => {
    const list = (String(text || "").match(/#[A-Za-z0-9_]{1,32}/g) || []).map((t) => t.slice(1).toLowerCase());
    return Array.from(new Set(list));
  };

  const buildIndex = async (ssbClient) => {
    const messages = await getAllMessages(ssbClient);

    const forward = new Map();
    const replacedIds = new Set();
    const tombstoned = new Set();
    const feedsById = new Map();
    const actions = [];

    for (const msg of messages) {
      const c = msg?.value?.content;
      const k = msg?.key;
      if (!c || !k) continue;
      if (c.type === "tombstone" && c.target) {
        tombstoned.add(c.target);
        continue;
      }
      if (c.type === "feed") {
        feedsById.set(k, msg);
        if (c.replaces) {
          forward.set(c.replaces, k);
          replacedIds.add(c.replaces);
        }
        continue;
      }
      if (c.type === "feed-action") {
        actions.push(msg);
        continue;
      }
    }

    const resolve = (id) => {
      let cur = id;
      const seen = new Set();
      while (forward.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        cur = forward.get(cur);
      }
      return cur;
    };

    const actionsByRoot = new Map();
    for (const a of actions) {
      const c = a?.value?.content || {};
      const target = c.root || c.target;
      if (!target) continue;
      const root = resolve(target);
      if (!actionsByRoot.has(root)) actionsByRoot.set(root, []);
      actionsByRoot.get(root).push(a);
    }

    return { resolve, tombstoned, feedsById, replacedIds, actionsByRoot };
  };

  const resolveCurrentId = async (id) => {
    const ssbClient = await openSsb();
    const idx = await buildIndex(ssbClient);
    return idx.resolve(id);
  };

  const createFeed = async (text) => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;

    if (typeof text !== "string") throw new Error("Invalid text");
    const cleaned = cleanText(text);

    if (!isValidFeedText(cleaned)) {
      if (cleaned.length < FEED_TEXT_MIN) throw new Error("Text too short");
      if (cleaned.length > FEED_TEXT_MAX) throw new Error("Text too long");
      throw new Error("Text required");
    }

    const content = {
      type: "feed",
      text: cleaned,
      author: userId,
      createdAt: new Date().toISOString(),
      tags: extractTags(cleaned)
    };

    return new Promise((resolve, reject) => {
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)));
    });
  };

  const createRefeed = async (contentId) => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;

    const idx = await buildIndex(ssbClient);
    const tipId = idx.resolve(contentId);

    let msg;
    try {
      msg = idx.feedsById.get(tipId) || (await getMsg(ssbClient, tipId));
    } catch {
      throw new Error("Invalid feed");
    }

    const c = msg?.value?.content;
    if (!c || c.type !== "feed") throw new Error("Invalid feed");
    if (!isValidFeedText(c.text)) throw new Error("Invalid feed");

    const existing = idx.actionsByRoot.get(tipId) || [];
    for (const a of existing) {
      const ac = a?.value?.content || {};
      if (ac.type === "feed-action" && ac.action === "refeed" && a.value?.author === userId) throw new Error("Already refeeded");
    }

    const action = {
      type: "feed-action",
      action: "refeed",
      root: tipId,
      createdAt: new Date().toISOString(),
      author: userId
    };

    return new Promise((resolve, reject) => {
      ssbClient.publish(action, (err, out) => (err ? reject(err) : resolve(out)));
    });
  };

  const addOpinion = async (contentId, category) => {
    if (!categories.includes(category)) throw new Error("Invalid voting category");

    const ssbClient = await openSsb();
    const userId = ssbClient.id;

    const idx = await buildIndex(ssbClient);
    const tipId = idx.resolve(contentId);

    let msg;
    try {
      msg = idx.feedsById.get(tipId) || (await getMsg(ssbClient, tipId));
    } catch {
      throw new Error("Invalid feed");
    }

    const c = msg?.value?.content;
    if (!c || c.type !== "feed") throw new Error("Invalid feed");
    if (!isValidFeedText(c.text)) throw new Error("Invalid feed");

    const existing = idx.actionsByRoot.get(tipId) || [];
    for (const a of existing) {
      const ac = a?.value?.content || {};
      if (ac.type === "feed-action" && ac.action === "vote" && a.value?.author === userId) throw new Error("Already voted");
    }

    const action = {
      type: "feed-action",
      action: "vote",
      category,
      root: tipId,
      createdAt: new Date().toISOString(),
      author: userId
    };

    return new Promise((resolve, reject) => {
      ssbClient.publish(action, (err, result) => (err ? reject(err) : resolve(result)));
    });
  };

  const listFeeds = async (filterOrOpts = "ALL") => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;
    const now = Date.now();

    const opts = typeof filterOrOpts === "string" ? { filter: filterOrOpts } : (filterOrOpts || {});
    const filter = String(opts.filter || "ALL").toUpperCase();
    const q = typeof opts.q === "string" ? opts.q.trim().toLowerCase() : "";
    const tag = typeof opts.tag === "string" ? opts.tag.trim().toLowerCase() : "";

    const idx = await buildIndex(ssbClient);

    const isValidFeedMsg = (m) => {
      const c = m?.value?.content;
      return !!c && c.type === "feed" && isValidFeedText(c.text);
    };

    let tips = Array.from(idx.feedsById.values()).filter(
      (m) =>
        !idx.replacedIds.has(m.key) &&
        !idx.tombstoned.has(m.key) &&
        isValidFeedMsg(m)
    );

    const textEditedEver = (m) => {
      const seen = new Set();
      let cur = m;
      let lastText = cur?.value?.content?.text;
      while (cur?.value?.content?.replaces) {
        const prevId = cur.value.content.replaces;
        if (!prevId || seen.has(prevId)) break;
        seen.add(prevId);
        const prev = idx.feedsById.get(prevId);
        if (!prev) break;
        const prevText = prev?.value?.content?.text;
        if (typeof lastText === "string" && typeof prevText === "string" && lastText !== prevText) return true;
        cur = prev;
        lastText = prevText;
      }
      return false;
    };

    const materialize = (feedMsg) => {
      const base = feedMsg || {};
      const content = { ...(base.value?.content || {}) };
      const root = base.key;

      let refeeds = Number(content.refeeds || 0) || 0;
      const refeedsInhabitants = new Set(Array.isArray(content.refeeds_inhabitants) ? content.refeeds_inhabitants : []);

      const opinionsCounts = {};
      const oldOpinions = content.opinions && typeof content.opinions === "object" ? content.opinions : {};
      for (const [k, v] of Object.entries(oldOpinions)) opinionsCounts[k] = (Number(v) || 0);

      const opinionsInhabitants = new Set(Array.isArray(content.opinions_inhabitants) ? content.opinions_inhabitants : []);

      const actions = idx.actionsByRoot.get(root) || [];
      for (const a of actions) {
        const ac = a?.value?.content || {};
        const author = a?.value?.author || ac.author;
        if (!author) continue;

        if (ac.action === "refeed") {
          if (!refeedsInhabitants.has(author)) {
            refeedsInhabitants.add(author);
            refeeds += 1;
          }
          continue;
        }

        if (ac.action === "vote") {
          if (!opinionsInhabitants.has(author)) {
            opinionsInhabitants.add(author);
            const cat = String(ac.category || "");
            opinionsCounts[cat] = (Number(opinionsCounts[cat]) || 0) + 1;
          }
          continue;
        }
      }

      content.refeeds = refeeds;
      content.refeeds_inhabitants = Array.from(refeedsInhabitants);
      content.opinions = opinionsCounts;
      content.opinions_inhabitants = Array.from(opinionsInhabitants);

      if (!Array.isArray(content.tags)) content.tags = extractTags(content.text);

      content._textEdited = textEditedEver(base);

      return { ...base, value: { ...base.value, content } };
    };

    let feeds = tips.map(materialize);

    if (q) {
      const terms = q.split(/\s+/).map((s) => s.trim()).filter(Boolean);
      feeds = feeds.filter((m) => {
        const t = String(m.value?.content?.text || "").toLowerCase();
        return terms.every((term) => t.includes(term));
      });
    }
    if (tag) feeds = feeds.filter((m) => Array.isArray(m.value?.content?.tags) && m.value.content.tags.includes(tag));

    const getTs = (m) => m?.value?.timestamp || Date.parse(m?.value?.content?.createdAt || "") || 0;
    const totalVotes = (m) => Object.values(m?.value?.content?.opinions || {}).reduce((s, x) => s + (Number(x) || 0), 0);

    if (filter === "MINE") {
      feeds = feeds.filter((m) => (m.value?.content?.author || m.value?.author) === userId);
    } else if (filter === "TODAY") {
      feeds = feeds.filter((m) => now - getTs(m) < 86400000);
    }

    if (filter === "TOP") {
      feeds.sort(
        (a, b) =>
          totalVotes(b) - totalVotes(a) ||
          (b.value?.content?.refeeds || 0) - (a.value?.content?.refeeds || 0) ||
          getTs(b) - getTs(a)
      );
    } else {
      feeds.sort((a, b) => getTs(b) - getTs(a));
    }

    return feeds;
  };

  return { createFeed, createRefeed, addOpinion, listFeeds, resolveCurrentId };
};

