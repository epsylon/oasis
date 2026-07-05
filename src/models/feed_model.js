const pull = require("../server/node_modules/pull-stream");
const { getConfig } = require("../configs/config-manager.js");
const categories = require("../backend/opinion_categories");
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const { dedupeBy, mergeDuplicatesBy, norm } = require('../backend/dedupe');
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
    const tombstoned = buildValidatedTombstoneSet(messages);
    const feedsById = new Map();
    const authorById = new Map();
    const actions = [];
    const opinionMsgs = [];

    for (const msg of messages) {
      const c = msg?.value?.content;
      const k = msg?.key;
      if (!c || !k) continue;
      if (c.type === 'tombstone') continue;
      if (c.type === "feedOpinion") {
        opinionMsgs.push({ target: c.target, author: msg?.value?.author, category: c.category });
        continue;
      }
      if (c.type === "feed") {
        feedsById.set(k, msg);
        authorById.set(k, msg?.value?.author);
        continue;
      }
      if (c.type === "feed-action") {
        actions.push(msg);
        continue;
      }
    }

    for (const [k, msg] of feedsById) {
      const t = msg?.value?.content?.replaces;
      if (!t) continue;
      if (authorById.get(t) === authorById.get(k)) {
        forward.set(t, k);
        replacedIds.add(t);
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

    const opinionsByTip = new Map();
    for (const op of opinionMsgs) {
      if (!op.target || !feedsById.has(op.target)) continue;
      const tip = resolve(op.target);
      if (!opinionsByTip.has(tip)) opinionsByTip.set(tip, []);
      opinionsByTip.get(tip).push(op);
    }

    return { resolve, tombstoned, feedsById, replacedIds, actionsByRoot, opinionsByTip };
  };

  const resolveCurrentId = async (id) => {
    const ssbClient = await openSsb();
    const idx = await buildIndex(ssbClient);
    return idx.resolve(id);
  };

  const createFeed = async (text, mentions) => {
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
      tags: extractTags(cleaned),
      mentions: Array.isArray(mentions) && mentions.length > 0 ? mentions : undefined
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

  const aggregateOpinions = (idx, tipId, ownerContent) => {
    const opinions = {};
    const voters = new Set();

    const cc = ownerContent || idx.feedsById.get(tipId)?.value?.content || {};
    const ownerVoters = Array.isArray(cc.opinions_inhabitants) ? cc.opinions_inhabitants : [];
    const ownerOpinions = cc.opinions && typeof cc.opinions === "object" ? cc.opinions : {};
    for (const [k, v] of Object.entries(ownerOpinions)) opinions[k] = (Number(v) || 0);
    for (const voter of ownerVoters) voters.add(voter);

    const actions = idx.actionsByRoot.get(tipId) || [];
    for (const a of actions) {
      const ac = a?.value?.content || {};
      if (ac.type !== "feed-action" || ac.action !== "vote") continue;
      const author = a?.value?.author || ac.author;
      if (!author || voters.has(author)) continue;
      voters.add(author);
      const cat = String(ac.category || "");
      opinions[cat] = (Number(opinions[cat]) || 0) + 1;
    }

    for (const op of (idx.opinionsByTip.get(tipId) || [])) {
      if (!op.author || voters.has(op.author)) continue;
      voters.add(op.author);
      const cat = String(op.category || "");
      opinions[cat] = (Number(opinions[cat]) || 0) + 1;
    }

    return { opinions, voters };
  };

  const addOpinion = async (contentId, category) => {
    if (!categories.includes(category)) throw new Error("Invalid voting category");

    const ssbClient = await openSsb();
    const userId = ssbClient.id;

    const idx = await buildIndex(ssbClient);
    const tipId = idx.resolve(contentId);

    const msg = idx.feedsById.get(tipId);
    const c = msg?.value?.content;
    if (!c || c.type !== "feed") throw new Error("Invalid feed");
    if (!isValidFeedText(c.text)) throw new Error("Invalid feed");

    const agg = aggregateOpinions(idx, tipId, c);
    if (agg.voters.has(userId)) throw new Error("Already voted");

    const content = { type: "feedOpinion", target: tipId, category, createdAt: new Date().toISOString() };
    return new Promise((resolve, reject) => {
      ssbClient.publish(content, (err, result) => (err ? reject(err) : resolve(result)));
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
        if (prev?.value?.author !== cur?.value?.author) break;
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

      let commentCount = 0;

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

        if (ac.action === "comment") {
          commentCount++;
          continue;
        }
      }

      const agg = aggregateOpinions(idx, root, content);

      content.refeeds = refeeds;
      content.refeeds_inhabitants = Array.from(refeedsInhabitants);
      content.opinions = agg.opinions;
      content.opinions_inhabitants = Array.from(agg.voters);
      content.commentCount = commentCount;

      if (!Array.isArray(content.tags)) content.tags = extractTags(content.text);

      content._textEdited = textEditedEver(base);

      return { ...base, value: { ...base.value, content } };
    };

    let feeds = dedupeBy(tips.map(materialize), m => {
      const c = (m && m.value && m.value.content) || {};
      const author = (m && m.value && m.value.author) || c.author;
      return c.text ? [norm(author), norm(c.text)].join('|') : null;
    });

    const tsOf = (m) => m?.value?.timestamp || Date.parse(m?.value?.content?.createdAt || "") || 0;
    const isOwn = (m) => m?.value?.author === userId;
    feeds = mergeDuplicatesBy(feeds, m => norm(m?.value?.content?.text) || null, (a, b) => {
      let keep;
      if (isOwn(a) !== isOwn(b)) keep = isOwn(a) ? a : b;
      else keep = tsOf(a) <= tsOf(b) ? a : b;
      const drop = keep === a ? b : a;
      const kc = keep.value.content || {};
      const dc = drop.value.content || {};
      const voters = new Set([...(kc.opinions_inhabitants || []), ...(dc.opinions_inhabitants || [])]);
      const ops = { ...(kc.opinions || {}) };
      for (const [cat, n] of Object.entries(dc.opinions || {})) ops[cat] = (Number(ops[cat]) || 0) + (Number(n) || 0);
      const refeeders = new Set([...(kc.refeeds_inhabitants || []), ...(dc.refeeds_inhabitants || [])]);
      keep.value = {
        ...keep.value,
        content: {
          ...kc,
          opinions: ops,
          opinions_inhabitants: Array.from(voters),
          refeeds_inhabitants: Array.from(refeeders),
          refeeds: refeeders.size,
          commentCount: (Number(kc.commentCount) || 0) + (Number(dc.commentCount) || 0)
        }
      };
      return keep;
    });

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
      feeds = feeds.filter((m) => (m.value?.author || m.value?.content?.author) === userId);
    } else if (filter === "TODAY") {
      feeds = feeds.filter((m) => now - getTs(m) < 86400000);
    }

    if (filter === "TOP") {
      feeds.sort(
        (a, b) =>
          (b.value?.content?.refeeds || 0) - (a.value?.content?.refeeds || 0) ||
          getTs(b) - getTs(a)
      );
    } else {
      feeds.sort((a, b) => getTs(b) - getTs(a));
    }

    return feeds;
  };

  const getFeedById = async (feedId) => {
    const ssbClient = await openSsb();
    const idx = await buildIndex(ssbClient);
    const currentId = idx.resolve(feedId);
    if (idx.tombstoned.has(currentId)) return null;
    const msg = idx.feedsById.get(currentId);
    if (!msg) return null;
    const actions = idx.actionsByRoot.get(currentId) || [];
    const content = msg.value?.content || {};
    const refeedsInhabitants = [];
    let refeeds = 0;
    let commentCount = 0;
    for (const a of actions) {
      const ac = a?.value?.content || {};
      if (ac.type === "feed-action" && ac.action === "refeed") {
        refeeds++;
        if (ac.author || a?.value?.author) refeedsInhabitants.push(ac.author || a.value.author);
      }
      if (ac.type === "feed-action" && ac.action === "comment") {
        commentCount++;
      }
    }
    const agg = aggregateOpinions(idx, currentId, content);
    const merged = { ...content, opinions: agg.opinions, opinions_inhabitants: Array.from(agg.voters), refeeds_inhabitants: refeedsInhabitants, refeeds, commentCount };
    return { key: currentId, value: { ...msg.value, content: merged } };
  };

  const getComments = async (feedId) => {
    const ssbClient = await openSsb();
    const idx = await buildIndex(ssbClient);
    const currentId = idx.resolve(feedId);
    const actions = idx.actionsByRoot.get(currentId) || [];
    return actions
      .filter(a => a?.value?.content?.type === "feed-action" && a?.value?.content?.action === "comment")
      .sort((a, b) => (a?.value?.timestamp || 0) - (b?.value?.timestamp || 0));
  };

  const addComment = async (feedId, text) => {
    const ssbClient = await openSsb();
    const idx = await buildIndex(ssbClient);
    const currentId = idx.resolve(feedId);
    await new Promise((resolve, reject) => {
      ssbClient.publish({ type: "feed-action", action: "comment", root: currentId, text: cleanText(text) }, (err) => (err ? reject(err) : resolve()));
    });
  };

  return { createFeed, createRefeed, addOpinion, listFeeds, resolveCurrentId, getFeedById, getComments, addComment };
};

