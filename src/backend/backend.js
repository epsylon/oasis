#!/usr/bin/env node
"use strict";
const path = require("path");
const fs = require("fs");
const promisesFs = fs.promises;
const os = require('os');
const envPaths = require("../server/node_modules/env-paths");
const {cli} = require("../client/oasis_client");
const SSBconfig = require('../server/SSB_server.js');
const moment = require('../server/node_modules/moment');
const FileType = require('../server/node_modules/file-type');
const ssbRef = require("../server/node_modules/ssb-ref");
const defaultConfig = {};
const defaultConfigFile = path.join(envPaths("oasis", { suffix: "" }).config, "/default.json");
let haveConfig = false;
try {
  Object.assign(defaultConfig, JSON.parse(fs.readFileSync(defaultConfigFile, "utf8")));
  haveConfig = true;
} catch (e) { if (e.code !== "ENOENT") { console.log(`Problem loading ${defaultConfigFile}`); throw e; } }
const config = cli(defaultConfig, defaultConfigFile);
if (config.debug) {
  process.env.DEBUG = "oasis,oasis:*";
}
const axiosMod = require('../server/node_modules/axios');
const axios = axiosMod.default || axiosMod;
const { spawn } = require('child_process');
const { fieldsForSnippet, buildContext, clip, publishExchange, getBestTrainedAnswer } = require('../AI/buildAIContext.js');
let aiStarted = false;
function startAI() {
  if (aiStarted) return;
  aiStarted = true;
  const aiProcess = spawn('node', [path.resolve(__dirname, '../AI/ai_service.mjs')], { detached: true, stdio: 'ignore' });
  aiProcess.unref();
}
const ADDR_PATH = path.join(__dirname, '..', 'configs', 'wallet-addresses.json');
const readAddrMap = () => { try { return JSON.parse(fs.readFileSync(ADDR_PATH, 'utf8')); } catch { return {}; } };
const writeAddrMap = (map) => { fs.mkdirSync(path.dirname(ADDR_PATH), { recursive: true }); fs.writeFileSync(ADDR_PATH, JSON.stringify(map, null, 2)); };

//parliament model
let electionInFlight = null;
const ensureTerm = async () => {
  const cur = await parliamentModel.getCurrentTerm().catch(() => null);
  if (cur) return cur;
  if (electionInFlight) return electionInFlight;
  electionInFlight = parliamentModel.resolveElection().catch(() => null).finally(() => { electionInFlight = null; });
  return electionInFlight;
};

let sweepInFlight = null;
const runSweepOnce = async () => {
  if (sweepInFlight) return sweepInFlight;
  sweepInFlight = parliamentModel.sweepProposals().catch(() => {}).finally(() => { sweepInFlight = null; });
  return sweepInFlight;
};

async function buildState(filter) {
  const f = (filter || 'government').toLowerCase();
  await ensureTerm();
  await runSweepOnce();
  const [govCard, candidatures, proposals, canPropose, laws, historical] = await Promise.all([
    parliamentModel.getGovernmentCard(),
    parliamentModel.listCandidatures('OPEN'),
    parliamentModel.listProposalsCurrent(),
    parliamentModel.canPropose(),
    parliamentModel.listLaws(),
    parliamentModel.listHistorical()
  ]);
  return { filter: f, governmentCard: govCard, candidatures, proposals, canPropose, laws, historical };
}

function pickLeader(cands = []) {
  if (!cands.length) return null;
  return [...cands].sort((a, b) => {
    const d = (x, y) => y - x;
    return d(Number(a.votes||0), Number(b.votes||0)) || d(Number(a.karma||0), Number(b.karma||0)) ||
           (Number(a.profileSince||0) - Number(b.profileSince||0)) ||
           (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) ||
           String(a.targetId).localeCompare(String(b.targetId));
  })[0];
}

async function buildLeaderMeta(leader) {
  if (!leader) return null;
  if (leader.targetType === 'inhabitant') {
    let name = null, image = null, description = null;
    try { name = about?.name && await about.name(leader.targetId); } catch {}
    try { image = about?.image && await about.image(leader.targetId); } catch {}
    try { description = about?.description && await about.description(leader.targetId); } catch {}
    const imgId = typeof image === 'string' ? image : image?.link || image?.url || null;
    return { isTribe: false, name: name || leader.targetId, avatarUrl: imgId ? `/image/256/${encodeURIComponent(imgId)}` : '/assets/images/default-avatar.png', bio: typeof description === 'string' ? description : '' };
  }
  let tribe = null;
  try { tribe = await tribesModel.getTribeById(leader.targetId); } catch {}
  const imgId = tribe?.image || null;
  return { isTribe: true, name: leader.targetTitle || tribe?.title || tribe?.name || leader.targetId, avatarUrl: imgId ? `/image/256/${encodeURIComponent(imgId)}` : '/assets/images/default-tribe.png', bio: tribe?.description || '' };
}

const safeArr = v => Array.isArray(v) ? v : [];
const safeText = v => String(v || '').trim();
const safeReturnTo = (ctx, fb, ap) => { const rt = ctx.request?.body?.returnTo || ctx.query?.returnTo; return typeof rt === 'string' && ap?.some(p => rt.startsWith(p)) ? rt : fb; };
const parseBool01 = v => String(Array.isArray(v) ? v[v.length - 1] : v || '') === '1';
const checkMod = (ctx, mod) => (ctx.cookies.get(mod) || 'on') === 'on';
const getViewerId = () => SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;
const mediaFavorites = require("./media-favorites.js");
const customStyleFile = path.join(envPaths("oasis", { suffix: "" }).config, "/custom-style.css");
let haveCustomStyle = false;
try { fs.readFileSync(customStyleFile, "utf8"); haveCustomStyle = true; } catch (e) { if (e.code !== "ENOENT") { console.log(`Problem loading ${customStyleFile}`); throw e; } }
const { get } = require("node:http");
const debug = require("../server/node_modules/debug")("oasis");
const log = (formatter, ...args) => {
  const isDebugEnabled = debug.enabled;
  debug.enabled = true;
  debug(formatter, ...args);
  debug.enabled = isDebugEnabled;
};
delete config._;
delete config.$0;
const { host } = config;
const { port } = config;
const url = `http://${host}:${port}`;
debug("Current configuration: %O", config);
debug(`You can save the above to ${defaultConfigFile} to make \
these settings the default. See the readme for details.`);
const { saveConfig, getConfig } = require('../configs/config-manager');
const configPath = path.join(__dirname, '../configs/oasis-config.json');
const oasisCheckPath = "/.well-known/oasis";
process.on("uncaughtException", function (err) {
  if (err["code"] === "EADDRINUSE") {
    get(url + oasisCheckPath, (res) => {
      let rawData = "";
      res.on("data", (chunk) => {
        rawData += chunk;
      });
      res.on("end", () => {
        log(rawData);
        if (rawData === "oasis") {
          log(`Oasis is already running on host ${host} and port ${port}`);
          if (config.open === true) {
            log("Opening link to existing instance of Oasis");
            open(url);
          } else {
            log(
              "Not opening your browser because opening is disabled by your config"
            );
          }
          process.exit(0);
        } else {
          throw new Error(`Another server is already running at ${url}.
It might be another copy of Oasis or another program on your computer.
You can run Oasis on a different port number with this option:
    oasis --port ${config.port + 1}
Alternatively, you can set the default port in ${defaultConfigFile} with:
    {
      "port": ${config.port + 1}
    }
`);
        }
      });
    });
  } else {
    console.log("");
    console.log("Oasis traceback (share below content with devs to report!):");
    console.log("===========================================================");
    console.log(err);
    console.log("");
  }
});
process.argv = [];
const http = require("../client/middleware");
const {koaBody} = require("../server/node_modules/koa-body");
const { nav, ul, li, a, form, button, div } = require("../server/node_modules/hyperaxe");
const open = require("../server/node_modules/open");
const pull = require("../server/node_modules/pull-stream");
const koaRouter = require("../server/node_modules/@koa/router");
const ssbMentions = require("../server/node_modules/ssb-mentions");
const isSvg = require('../server/node_modules/is-svg');
const { isFeed, isMsg, isBlob } = require("../server/node_modules/ssb-ref");
const ssb = require("../client/gui");
const router = new koaRouter();
const extractMentions = async (text) => {
  const mentions = ssbMentions(text) || [];
  const resolvedMentions = await Promise.all(mentions.map(async (mention) => {
    const name = mention.name || await about.name(mention.link); 
    return {
      link: mention.link,
      name: name || 'Anonymous', 
    };
  }));
  return resolvedMentions;
};
const cooler = ssb({ offline: config.offline });
const models = require("../models/main_models");
const { about, blob, friend, meta, post, vote } = models({
  cooler,
  isPublic: config.public,
});
const { handleBlobUpload, serveBlob } = require('../backend/blobHandler.js');
const exportmodeModel = require('../models/exportmode_model');
const panicmodeModel = require('../models/panicmode_model');
const cipherModel = require('../models/cipher_model');
const legacyModel = require('../models/legacy_model');
const walletModel = require('../models/wallet_model')
const pmModel = require('../models/pm_model')({ cooler, isPublic: config.public });
const bookmarksModel = require("../models/bookmarking_model")({ cooler, isPublic: config.public });
const opinionsModel = require('../models/opinions_model')({ cooler, isPublic: config.public });
const eventsModel = require('../models/events_model')({ cooler, isPublic: config.public });
const tasksModel = require('../models/tasks_model')({ cooler, isPublic: config.public });
const votesModel = require('../models/votes_model')({ cooler, isPublic: config.public });
const reportsModel = require('../models/reports_model')({ cooler, isPublic: config.public });
const transfersModel = require('../models/transfers_model')({ cooler, isPublic: config.public });
const tagsModel = require('../models/tags_model')({ cooler, isPublic: config.public });
const cvModel = require('../models/cv_model')({ cooler, isPublic: config.public });
const inhabitantsModel = require('../models/inhabitants_model')({ cooler, isPublic: config.public });
const feedModel = require('../models/feed_model')({ cooler, isPublic: config.public });
const imagesModel = require("../models/images_model")({ cooler, isPublic: config.public });
const audiosModel = require("../models/audios_model")({ cooler, isPublic: config.public });
const videosModel = require("../models/videos_model")({ cooler, isPublic: config.public });
const documentsModel = require("../models/documents_model")({ cooler, isPublic: config.public });
const agendaModel = require("../models/agenda_model")({ cooler, isPublic: config.public });
const trendingModel = require('../models/trending_model')({ cooler, isPublic: config.public });
const statsModel = require('../models/stats_model')({ cooler, isPublic: config.public });
const tribesModel = require('../models/tribes_model')({ cooler, isPublic: config.public });
const searchModel = require('../models/search_model')({ cooler, isPublic: config.public });
const activityModel = require('../models/activity_model')({ cooler, isPublic: config.public });
const pixeliaModel = require('../models/pixelia_model')({ cooler, isPublic: config.public });
const marketModel = require('../models/market_model')({ cooler, isPublic: config.public });
const forumModel = require('../models/forum_model')({ cooler, isPublic: config.public });
const blockchainModel = require('../models/blockchain_model')({ cooler, isPublic: config.public });
const jobsModel = require('../models/jobs_model')({ cooler, isPublic: config.public });
const projectsModel = require("../models/projects_model")({ cooler, isPublic: config.public });
const bankingModel = require("../models/banking_model")({ services: { cooler }, isPublic: config.public });
const favoritesModel = require("../models/favorites_model")({services: { cooler }, audiosModel, bookmarksModel, documentsModel, imagesModel, videosModel });
const parliamentModel = require('../models/parliament_model')({ cooler, services: { tribes: tribesModel, votes: votesModel, inhabitants: inhabitantsModel, banking: bankingModel } });
const courtsModel = require('../models/courts_model')({ cooler, services: { votes: votesModel, inhabitants: inhabitantsModel, tribes: tribesModel, banking: bankingModel } });
const getVoteComments = async (voteId) => {
  const raw = await post.topicComments(voteId);
  return (raw || []).filter(c => c?.value?.content?.type === 'post' && c.value.content.root === voteId)
    .sort((a, b) => (a?.value?.timestamp || 0) - (b?.value?.timestamp || 0));
};
const enrichWithComments = async (items, idKey = 'id') => {
  await Promise.all(items.map(async x => { x.commentCount = (await getVoteComments(x[idKey] || x.key || x.rootId)).length; }));
  return items;
};
const withCount = (item, comments) => ({ ...item, commentCount: comments.length });

const mediaResolvers = {
  images: id => imagesModel.resolveRootId(id),
  audios: id => audiosModel.resolveRootId(id),
  videos: id => videosModel.resolveRootId(id),
  documents: id => documentsModel.resolveRootId(id),
  bookmarks: id => bookmarksModel.resolveRootId(id)
};
const mediaModCheck = { images: 'imagesMod', audios: 'audiosMod', videos: 'videosMod', documents: 'documentsMod', bookmarks: 'bookmarksMod', market: 'marketMod', jobs: 'jobsMod', projects: 'projectsMod' };
const favAction = async (ctx, kind, action) => {
  if (!checkMod(ctx, mediaModCheck[kind])) { ctx.redirect('/modules'); return; }
  const rootId = await mediaResolvers[kind](ctx.params.id);
  await mediaFavorites[action + 'Favorite'](kind, rootId);
  ctx.redirect(safeReturnTo(ctx, `/${kind}`, [`/${kind}`]));
};
const commentAction = async (ctx, kind, idParam) => {
  const modKey = mediaModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  const itemId = ctx.params[idParam];
  const trimmed = (ctx.request.body.text || '').trim();
  const rt = safeReturnTo(ctx, `/${kind}/${encodeURIComponent(itemId)}`, [`/${kind}`]);
  if (!trimmed) { ctx.redirect(rt); return; }
  await post.publish({ text: trimmed, root: itemId, dest: itemId });
  ctx.redirect(rt);
};
const opinionModels = { images: imagesModel, audios: audiosModel, videos: videosModel, documents: documentsModel, bookmarks: bookmarksModel };
const deleteModels = { images: imagesModel, audios: audiosModel, videos: videosModel, documents: documentsModel, bookmarks: bookmarksModel };
const opinionAction = async (ctx, kind, idParam) => {
  const modKey = mediaModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  await opinionModels[kind].createOpinion(ctx.params[idParam], ctx.params.category);
  ctx.redirect(safeReturnTo(ctx, `/${kind}`, [`/${kind}`]));
};
const deleteAction = async (ctx, kind, deleteFn = 'delete' + kind.charAt(0).toUpperCase() + kind.slice(1, -1) + 'ById') => {
  const modKey = mediaModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  await deleteModels[kind][deleteFn](ctx.params.id);
  ctx.redirect(safeReturnTo(ctx, `/${kind}?filter=mine`, [`/${kind}`]));
};

const mediaCreateModels = { audios: audiosModel, videos: videosModel };
const mediaCreateAction = async (ctx, kind) => {
  const modKey = mediaModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  const blob = await handleBlobUpload(ctx, kind.slice(0, -1));
  const { tags, title, description } = ctx.request.body;
  await mediaCreateModels[kind][`create${kind.charAt(0).toUpperCase()}${kind.slice(1, -1)}`](blob, tags, title, description);
  ctx.redirect(safeReturnTo(ctx, `/${kind}?filter=all`, [`/${kind}`]));
};
const mediaUpdateAction = async (ctx, kind) => {
  const modKey = mediaModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  const { tags, title, description } = ctx.request.body;
  const singular = kind.slice(0, -1);
  const blob = ctx.request.files?.[singular] ? await handleBlobUpload(ctx, singular) : null;
  await mediaCreateModels[kind][`update${kind.charAt(0).toUpperCase()}${kind.slice(1, -1)}ById`](ctx.params.id, blob, tags, title, description);
  ctx.redirect(safeReturnTo(ctx, `/${kind}?filter=mine`, [`/${kind}`]));
};
const qf = (ctx, def = 'all') => ctx.query.filter || def;
const qp = (ctx, def = 1) => Math.max(1, parseInt(ctx.query.page) || def);
about._startNameWarmup();
async function renderBlobMarkdown(text, mentions = {}, myFeedId, myUsername) {
  if (!text) return '';
  const mentionByFeed = {};
  Object.values(mentions).forEach(arr => {
    arr.forEach(m => {
      mentionByFeed[m.feed] = m;
    });
  });
  text = text.replace(/\[@([^\]]+)\]\(([^)]+)\)/g, (_, name, id) => {
    return `<a class="mention" href="/author/${encodeURIComponent(id)}">@${myUsername}</a>`;
  });
  const mentionRegex = /@([A-Za-z0-9_\-\.+=\/]+\.ed25519)/g;
  const words = text.split(' ');
  text = (await Promise.all(
    words.map(async (word) => {
      const match = mentionRegex.exec(word);
      if (match && match[1]) {
        const feedId = match[1];
        if (feedId === myFeedId) {
          return `<a class="mention" href="/author/${encodeURIComponent(feedId)}">@${myUsername}</a>`;
        } 
      }
      return word;
    })
  )).join(' ');
  text = text
    .replace(/!\[image:[^\]]+\]\(([^)]+)\)/g, (_, id) =>
      `<img src="/blob/${encodeURIComponent(id)}" alt="image" class="post-image" />`)
    .replace(/\[audio:[^\]]+\]\(([^)]+)\)/g, (_, id) =>
      `<audio controls class="post-audio" src="/blob/${encodeURIComponent(id)}"></audio>`)
    .replace(/\[video:[^\]]+\]\(([^)]+)\)/g, (_, id) =>
      `<video controls class="post-video" src="/blob/${encodeURIComponent(id)}"></video>`)
    .replace(/\[pdf:[^\]]+\]\(([^)]+)\)/g, (_, id) =>
      `<a class="post-pdf" href="/blob/${encodeURIComponent(id)}" target="_blank">PDF</a>`);
  return text;
}

const preparePreview = async function (ctx) {
  let text = String(ctx.request.body.text || "")
  const contentWarning = String(ctx.request.body.contentWarning || "")
  const ensureAt = (id) => {
    const s = String(id || "")
    if (!s) return ""
    return s.startsWith("@") ? s : `@${s.replace(/^@+/, "")}`
  }
  const stripAt = (id) => String(id || "").replace(/^@+/, "")
  const norm = (s) => String(s || "").trim().toLowerCase()
  const ssbClient = await cooler.open()
  const authorMeta = {
    id: ssbClient.id,
    name: await about.name(ssbClient.id),
    image: await about.image(ssbClient.id),
  }
  const myId = String(authorMeta.id)
  text = text.replace(
    /\[@([^\]]+)\]\s*\(\s*@?([^) \t\r\n]+\.ed25519)\s*\)/g,
    (_m, label, feed) => `[@${label}](@${stripAt(feed)})`
  )
  const mentions = {}
  const normalizeMatch = (m) => {
    const feed = ensureAt(m?.feed || m?.link || m?.id || "")
    const name = String(m?.name || "")
    const img = m?.img || m?.image || null
    const rel = m?.rel || {}
    return { ...m, feed, name, img, rel }
  }
  const pushUnique = (key, arr) => {
    const prev = Array.isArray(mentions[key]) ? mentions[key] : []
    const seen = new Set(prev.map((x) => String(x?.feed || "")))
    const out = prev.slice()
    for (const x of arr) {
      const f = String(x?.feed || "")
      if (!f) continue
      if (seen.has(f)) continue
      seen.add(f)
      out.push(x)
    }
    if (out.length) mentions[key] = out
  }
  const chooseByPhrase = (matches, phrase) => {
    const p = norm(phrase)
    const exact = matches.filter((mm) => norm(mm.name) === p)
    if (exact.length) return exact
    const starts = matches.filter((mm) => norm(mm.name).startsWith(p))
    if (starts.length) return starts
    const incl = matches.filter((mm) => norm(mm.name).includes(p))
    if (incl.length) return incl
    return null
  }
  const rex = /(^|\s)(?!\[)@([a-zA-Z0-9\-/.=+]{3,})(?:\s+([a-zA-Z0-9][a-zA-Z0-9\-/.=+]{1,}))?(?:\s+([a-zA-Z0-9][a-zA-Z0-9\-/.=+]{1,}))?\b/g
  let m
  while ((m = rex.exec(text)) !== null) {
    const w1 = m[2]
    const w2 = m[3]
    const w3 = m[4]
    if (/\.ed25519$/.test(w1)) {
      const feed = ensureAt(w1)
      const name = await about.name(feed)
      const img = await about.image(feed)
      pushUnique(w1, [
        {
          feed,
          name,
          img,
          rel: { followsMe: false, following: false, blocking: false, me: false }
        }
      ])
      continue
    }
    const phrase1 = w1
    const phrase2 = w2 ? `${w1} ${w2}` : null
    const phrase3 = w3 ? `${w1} ${w2 ? w2 : ""} ${w3}`.replace(/\s+/g, " ").trim() : null
    const matchesRaw = about.named(w1) || []
    const matchesAll = matchesRaw.map(normalizeMatch)
    const matches = matchesAll.filter((mm) => String(mm.feed) !== myId && !mm?.rel?.me)
    let chosenKey = phrase1
    let chosenMatches = matches
    if (phrase3) {
      const best3 = chooseByPhrase(matches, phrase3)
      if (best3 && best3.length) {
        chosenKey = phrase3
        chosenMatches = best3
      } else if (phrase2) {
        const best2 = chooseByPhrase(matches, phrase2)
        if (best2 && best2.length) {
          chosenKey = phrase2
          chosenMatches = best2
        }
      }
    } else if (phrase2) {
      const best2 = chooseByPhrase(matches, phrase2)
      if (best2 && best2.length) {
        chosenKey = phrase2
        chosenMatches = best2
      }
    }
    if (chosenMatches.length > 0) {
      pushUnique(chosenKey, chosenMatches)
    }
  }
  Object.keys(mentions).forEach((key) => {
    const matches = Array.isArray(mentions[key]) ? mentions[key] : []
    const meaningful = matches.filter((mm) => (mm?.rel?.followsMe || mm?.rel?.following) && !mm?.rel?.blocking && String(mm?.feed || "") !== myId && !mm?.rel?.me)
    mentions[key] = meaningful.length > 0 ? meaningful : matches
  })
  const rexReplace = /(^|\s)(?!\[)@([a-zA-Z0-9\-/.=+]{3,})(?:\s+([a-zA-Z0-9][a-zA-Z0-9\-/.=+]{1,}))?(?:\s+([a-zA-Z0-9][a-zA-Z0-9\-/.=+]{1,}))?\b/g
  const replacer = (match, prefix, w1, w2, w3) => {
    const phrase1 = w1
    const phrase2 = w2 ? `${w1} ${w2}` : null
    const phrase3 = w3 ? `${w1} ${w2 ? w2 : ""} ${w3}`.replace(/\s+/g, " ").trim() : null
    const tryKey = (k) => {
      const arr = mentions[k]
      if (arr && arr.length === 1) {
        return `${prefix}[@${arr[0].name}](${ensureAt(arr[0].feed)})`
      }
      return null
    }
    if (/\.ed25519$/.test(w1)) {
      const arr = mentions[w1]
      if (arr && arr.length === 1) return `${prefix}[@${arr[0].name}](${ensureAt(arr[0].feed)})`
      return match
    }
    const r3 = phrase3 ? tryKey(phrase3) : null
    if (r3) return r3
    const r2 = phrase2 ? tryKey(phrase2) : null
    if (r2) return r2
    const r1 = tryKey(phrase1)
    if (r1) return r1
    return match
  }
  text = text.replace(rexReplace, replacer)
  const blobMarkdown = await handleBlobUpload(ctx, "blob")
  if (blobMarkdown) {
    text += blobMarkdown
  }
  const renderedText = await renderBlobMarkdown(
    text,
    mentions,
    authorMeta.id,
    authorMeta.name
  )
  const hasBrTags = /<br\s*\/?>/i.test(renderedText)
  const hasBlockTags = /<(p|div|ul|ol|li|pre|blockquote|h[1-6]|table|tr|td|th|section|article)\b/i.test(renderedText)
  let formattedText = renderedText
  if (!hasBrTags && !hasBlockTags && /[\r\n]/.test(renderedText)) {
    formattedText = renderedText.replace(/\r\n|\r|\n/g, "<br>")
  }
  return { authorMeta, text, formattedText, mentions, contentWarning }
}
const megabyte = Math.pow(2, 20);
const maxSize = 50 * megabyte;
const homeDir = os.homedir();
const blobsPath = path.join(homeDir, '.ssb', 'blobs', 'tmp');
const gossipPath = path.join(homeDir, '.ssb', 'gossip.json');
const unfollowedPath = path.join(homeDir, '.ssb', 'gossip_unfollowed.json');
const ensureJSONFile = (p, init = []) => { fs.mkdirSync(path.dirname(p), { recursive: true }); if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(init, null, 2), 'utf8'); };
const readJSON = p => { ensureJSONFile(p, []); try { return JSON.parse(fs.readFileSync(p, 'utf8') || '[]'); } catch { return []; } };
const writeJSON = (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8'); };
const canonicalKey = k => { let c = String(k).replace(/^@/, '').replace(/\.ed25519$/, '').replace(/-/g, '+').replace(/_/g, '/'); if (!c.endsWith('=')) c += '='; return `@${c}.ed25519`; };
const msAddrFrom = (h, p, k) => `net:${h}:${Number(p) || 8008}~shs:${canonicalKey(k).slice(1, -9)}`;
ensureJSONFile(gossipPath, []);
ensureJSONFile(unfollowedPath, []);
const koaBodyMiddleware = koaBody({
  multipart: true,
  formidable: {
    uploadDir: blobsPath,
    keepExtensions: true, 
    maxFieldsSize: maxSize, 
    hash: 'sha256',
  },
  parsedMethods: ['POST'], 
});
const resolveCommentComponents = async function (ctx) {
  let parentId;
  try {
    parentId = decodeURIComponent(ctx.params.message);
  } catch {
    parentId = ctx.params.message;
  }
  const parentMessage = await post.get(parentId);
  if (!parentMessage || !parentMessage.value) {
    throw new Error("Invalid parentMessage or missing 'value'");
  }
  const myFeedId = await meta.myFeedId();
  const hasRoot =
    typeof parentMessage?.value?.content?.root === "string" &&
    ssbRef.isMsg(parentMessage.value.content.root);
  const hasFork =
    typeof parentMessage?.value?.content?.fork === "string" &&
    ssbRef.isMsg(parentMessage.value.content.fork);
  const rootMessage = hasRoot
    ? hasFork
      ? parentMessage
      : await post.get(parentMessage.value.content.root)
    : parentMessage;
  const messages = await post.topicComments(rootMessage.key);
  messages.push(rootMessage);
  let contentWarning;
  if (ctx.request.body) {
    const rawContentWarning = String(ctx.request.body.contentWarning || "").trim();
    contentWarning = rawContentWarning.length > 0 ? rawContentWarning : undefined;
  }
  return { messages, myFeedId, parentMessage, contentWarning };
};
const { authorView, previewCommentView, commentView, editProfileView, extendedView, latestView, likesView, threadView, hashtagView, mentionsView, popularView, previewView, privateView, publishCustomView, publishView, previewSubtopicView, subtopicView, imageSearchView, setLanguage, topicsView, summaryView, threadsView } = require("../views/main_views");
const { activityView } = require("../views/activity_view");
const { cvView, createCVView } = require("../views/cv_view");
const { indexingView } = require("../views/indexing_view");
const { pixeliaView } = require("../views/pixelia_view");
const { statsView } = require("../views/stats_view");
const { tribesView, tribeDetailView, tribesInvitesView, tribeView, renderInvitePage } = require("../views/tribes_view");
const { agendaView } = require("../views/agenda_view");
const { documentView, singleDocumentView } = require("../views/document_view");
const { inhabitantsView, inhabitantsProfileView } = require("../views/inhabitants_view");
const { walletViewRender, walletView, walletHistoryView, walletReceiveView, walletSendFormView, walletSendConfirmView, walletSendResultView, walletErrorView } = require("../views/wallet_view");
const { pmView } = require("../views/pm_view");
const { tagsView } = require("../views/tags_view");
const { videoView, singleVideoView } = require("../views/video_view");
const { audioView, singleAudioView } = require("../views/audio_view");
const { eventView, singleEventView } = require("../views/event_view");
const { invitesView } = require("../views/invites_view");
const { modulesView } = require("../views/modules_view");
const { reportView, singleReportView } = require("../views/report_view");
const { taskView, singleTaskView } = require("../views/task_view");
const { voteView } = require("../views/vote_view");
const { bookmarkView, singleBookmarkView } = require("../views/bookmark_view");
const { feedView, feedCreateView } = require("../views/feed_view");
const { legacyView } = require("../views/legacy_view");
const { opinionsView } = require("../views/opinions_view");
const { peersView } = require("../views/peers_view");
const { searchView } = require("../views/search_view");
const { transferView, singleTransferView } = require("../views/transfer_view");
const { cipherView } = require("../views/cipher_view");
const { imageView, singleImageView } = require("../views/image_view");
const { settingsView } = require("../views/settings_view");
const { trendingView } = require("../views/trending_view");
const { marketView, singleMarketView } = require("../views/market_view");
const { aiView } = require("../views/AI_view");
const { forumView, singleForumView } = require("../views/forum_view");
const { renderBlockchainView, renderSingleBlockView } = require("../views/blockchain_view");
const { jobsView, singleJobsView, renderJobForm } = require("../views/jobs_view");
const { projectsView, singleProjectView } = require("../views/projects_view")
const { renderBankingView, renderSingleAllocationView, renderEpochView } = require("../views/banking_views")
const { favoritesView } = require("../views/favorites_view");
const { parliamentView } = require("../views/parliament_view");
const { courtsView, courtsCaseView } = require('../views/courts_view');
let sharp;
try {
  sharp = require("sharp");
} catch (e) {
}
const readmePath = path.join(__dirname, "..", ".." ,"README.md");
const packagePath = path.join(__dirname, "..", "server", "package.json");
const readme = fs.readFileSync(readmePath, "utf8");
const version = JSON.parse(fs.readFileSync(packagePath, "utf8")).version;
const nullImageId = '&0000000000000000000000000000000000000000000=.sha256';
const getAvatarUrl = img => !img || img === nullImageId ? '/assets/images/default-avatar.png' : `/image/256/${encodeURIComponent(img)}`;
router
  .param("imageSize", (imageSize, ctx, next) => {
    const size = Number(imageSize);
    const isInteger = size % 1 === 0;
    const overMinSize = size > 2;
    const underMaxSize = size <= 256;
    ctx.assert(
      isInteger && overMinSize && underMaxSize,
      400,
      "Invalid image size"
    );
    return next();
  })
  .param("blobId", (blobId, ctx, next) => {
    ctx.assert(ssbRef.isBlob(blobId), 400, "Invalid blob link");
    return next();
  })
  .param("message", (message, ctx, next) => {
    ctx.assert(ssbRef.isMsg(message), 400, "Invalid message link");
    return next();
  })
  .param("feed", (message, ctx, next) => {
    ctx.assert(ssbRef.isFeedId(message), 400, "Invalid feed link");
    return next();
  })
  .get("/", async (ctx) => {
    const currentConfig = getConfig();
    const homePage = currentConfig.homePage || "activity";
    ctx.redirect(`/${homePage}`);
  })
  .get("/robots.txt", (ctx) => {
    ctx.body = "User-agent: *\nDisallow: /";
  })
  .get(oasisCheckPath, (ctx) => {
    ctx.body = "oasis";
  })
  .get('/stats', async (ctx) => {
    const filter = qf(ctx, 'ALL'), stats = await statsModel.getStats(filter);
    const myId = getViewerId();
    const myAddress = await bankingModel.getUserAddress(myId);
    const addrRows = await bankingModel.listAddressesMerged();
    stats.banking = {
      myAddress: myAddress || null,
      totalAddresses: Array.isArray(addrRows) ? addrRows.length : 0
    };
    ctx.body = statsView(stats, filter);
  })
  .get("/public/popular/:period", async (ctx) => {
    if (!checkMod(ctx, 'popularMod')) return ctx.redirect('/modules');
    const i18n = require("../client/assets/translations/i18n"), lang = ctx.cookies.get('lang') || 'en', t = i18n[lang] || i18n['en'];
    const messages = await post.popular({ period: ctx.params.period });
    ctx.body = await popularView({ messages, prefix: nav(div({ class: "filters" }, ul(['day','week','month','year'].map(p => li(form({ method: "GET", action: `/public/popular/${p}` }, button({ type: "submit", class: "filter-btn" }, t[p]))))))) });
  }) 
  .get("/modules", async (ctx) => {
    const modules = ['popular', 'topics', 'summaries', 'latest', 'threads', 'multiverse', 'invites', 'wallet', 'legacy', 'cipher', 'bookmarks', 'videos', 'docs', 'audios', 'tags', 'images', 'trending', 'events', 'tasks', 'market', 'tribes', 'votes', 'reports', 'opinions', 'transfers', 'feed', 'pixelia', 'agenda', 'favorites', 'ai', 'forum', 'jobs', 'projects', 'banking', 'parliament', 'courts'];
    const cfg = getConfig().modules;
    ctx.body = modulesView(modules.reduce((acc, m) => { acc[`${m}Mod`] = cfg[`${m}Mod`]; return acc; }, {}));
  })
  .get('/ai', async (ctx) => {
    if (!checkMod(ctx, 'aiMod')) return ctx.redirect('/modules');
    startAI();
    const lang = ctx.cookies.get('lang') || 'en', historyPath = path.join(__dirname, '..', '..', 'src', 'configs', 'AI-history.json');
    require('../views/main_views').setLanguage(lang);
    let chatHistory = []; try { chatHistory = JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch {}
    ctx.body = aiView(chatHistory, getConfig().ai?.prompt?.trim() || '');
  })
  .get('/pixelia', async (ctx) => {
    if (!checkMod(ctx, 'pixeliaMod')) { ctx.redirect('/modules'); return; }
    const pixelArt = await pixeliaModel.listPixels();
    ctx.body = pixeliaView(pixelArt);
  })  
  .get('/blockexplorer', async (ctx) => {
    const userId = getViewerId();
    const query = ctx.query || {};
    const search = {
      id: query.id || '',
      author: query.author || '',
      from: query.from || '',
      to: query.to || ''
    };
    const searchActive = Object.values(search).some(v => String(v || '').trim().length > 0);
    let filter = query.filter || 'recent';
    if (searchActive && String(filter).toLowerCase() === 'recent') filter = 'all';
    const blockchainData = await blockchainModel.listBlockchain(filter, userId, search);
    ctx.body = renderBlockchainView(blockchainData, filter, userId, search);
  })
  .get('/blockexplorer/block/:id', async (ctx) => {
    const userId = getViewerId();
    const query = ctx.query || {};
    const search = {
      id: query.id || '',
      author: query.author || '',
      from: query.from || '',
      to: query.to || ''
    };
    const searchActive = Object.values(search).some(v => String(v || '').trim().length > 0);
    let filter = query.filter || 'recent';
    if (searchActive && String(filter).toLowerCase() === 'recent') filter = 'all';
    const blockId = ctx.params.id;
    const block = await blockchainModel.getBlockById(blockId);
    ctx.body = renderSingleBlockView(block, filter, userId, search);
  })
  .get("/public/latest", async (ctx) => {
    if (!checkMod(ctx, 'latestMod')) { ctx.redirect('/modules'); return; }
    const messages = await post.latest();
    ctx.body = await latestView({ messages });
  })
  .get("/public/latest/extended", async (ctx) => {
    if (!checkMod(ctx, 'extendedMod')) { ctx.redirect('/modules'); return; }
    const messages = await post.latestExtended();
    ctx.body = await extendedView({ messages });
  })
  .get("/public/latest/topics", async (ctx) => {
    if (!checkMod(ctx, 'topicsMod')) { ctx.redirect('/modules'); return; }
    const messages = await post.latestTopics();
    const channels = await post.channels();
    const list = channels.map((c) => {
      return li(a({ href: `/hashtag/${c}` }, `#${c}`));
    });
    const prefix = nav(ul(list));
    ctx.body = await topicsView({ messages, prefix });
  })
  .get("/public/latest/summaries", async (ctx) => {
    if (!checkMod(ctx, 'summariesMod')) { ctx.redirect('/modules'); return; }
    const messages = await post.latestSummaries();
    ctx.body = await summaryView({ messages });
  })
  .get("/public/latest/threads", async (ctx) => {
    if (!checkMod(ctx, 'threadsMod')) { ctx.redirect('/modules'); return; }
    const messages = await post.latestThreads();
    ctx.body = await threadsView({ messages });
  })
  .get('/author/:feed', async (ctx) => {
    const feedId = decodeURIComponent(ctx.params.feed || ''), gt = Number(ctx.request.query.gt || -1), lt = Number(ctx.request.query.lt || -1);
    if (lt > 0 && gt > 0 && gt >= lt) throw new Error('Given search range is empty');
    const [description, name, image, messages, firstPost, lastPost, relationship, ecoAddress, bankData] = await Promise.all([
      about.description(feedId), about.name(feedId), about.image(feedId), post.fromPublicFeed(feedId, gt, lt),
      post.firstBy(feedId), post.latestBy(feedId), friend.getRelationship(feedId), bankingModel.getUserAddress(feedId), bankingModel.getBankingData(feedId)
    ]);
    const normTs = t => { const n = Number(t || 0); return !isFinite(n) || n <= 0 ? 0 : n < 1e12 ? n * 1000 : n; };
    const pull = require('../server/node_modules/pull-stream'), ssb = await require('../client/gui')({ offline: require('../server/ssb_config').offline }).open();
    const latestFromStream = await new Promise(res => pull(ssb.createUserStream({ id: feedId, reverse: true }), pull.filter(m => m?.value?.content?.type !== 'tombstone'), pull.take(1), pull.collect((err, arr) => res(!err && arr?.[0] ? normTs(arr[0].value?.timestamp || arr[0].timestamp) : 0))));
    const days = latestFromStream ? (Date.now() - latestFromStream) / 86400000 : Infinity;
    ctx.body = await authorView({ feedId, messages, firstPost, lastPost, name, description, avatarUrl: getAvatarUrl(image), relationship, ecoAddress, karmaScore: bankData.karmaScore, lastActivityBucket: days < 14 ? 'green' : days < 182.5 ? 'orange' : 'red' });
  })
  .get("/search", async (ctx) => {
    const query = ctx.query.query || '';
    if (!query) return ctx.body = await searchView({ messages: [], query, types: [] });
    const results = await searchModel.search({ query, types: [] });
    ctx.body = await searchView({ results: Object.entries(results).reduce((acc, [type, msgs]) => {
      acc[type] = msgs.map(msg => (!msg.value?.content) ? {} : { ...msg, content: msg.value.content, author: msg.value.content.author || 'Unknown' });
      return acc;
    }, {}), query, types: [] });
  })
  .get("/images", async (ctx) => {
    if (!checkMod(ctx, 'imagesMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const items = await imagesModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const fav = await mediaFavorites.getFavoriteSet('images');
    let enriched = items.map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    await Promise.all(enriched.map(async x => { x.commentCount = (await getVoteComments(x.key)).length; }));
    ctx.body = await imageView(enriched, filter, null, { q, sort });
  })
  .get("/images/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'imagesMod')) { ctx.redirect('/modules'); return; }
    const img = await imagesModel.getImageById(ctx.params.id, getViewerId());
    const fav = await mediaFavorites.getFavoriteSet('images');
    ctx.body = await imageView([{ ...img, isFavorite: fav.has(String(img.rootId || img.key)) }], 'edit', img.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/images/:imageId", async (ctx) => {
    if (!checkMod(ctx, 'imagesMod')) { ctx.redirect('/modules'); return; }
    const { imageId } = ctx.params; const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const img = await imagesModel.getImageById(imageId, getViewerId());
    const fav = await mediaFavorites.getFavoriteSet('images');
    const comments = await getVoteComments(img.key);
    ctx.body = await singleImageView({ ...img, isFavorite: fav.has(String(img.rootId || img.key)), commentCount: comments.length }, filter, comments, { q, sort, returnTo: safeReturnTo(ctx, `/images?filter=${encodeURIComponent(filter)}`, ['/images']) });
  })
  .get("/audios", async (ctx) => {
    if (!checkMod(ctx, 'audiosMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const items = await audiosModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const fav = await mediaFavorites.getFavoriteSet('audios');
    let enriched = items.map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    await Promise.all(enriched.map(async x => { x.commentCount = (await getVoteComments(x.key)).length; }));
    ctx.body = await audioView(enriched, filter, null, { q, sort });
  })
  .get("/audios/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'audiosMod')) { ctx.redirect('/modules'); return; }
    const audio = await audiosModel.getAudioById(ctx.params.id, getViewerId());
    const fav = await mediaFavorites.getFavoriteSet('audios');
    ctx.body = await audioView([{ ...audio, isFavorite: fav.has(String(audio.rootId || audio.key)) }], 'edit', audio.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/audios/:audioId", async (ctx) => {
    if (!checkMod(ctx, 'audiosMod')) { ctx.redirect('/modules'); return; }
    const { audioId } = ctx.params; const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const audio = await audiosModel.getAudioById(audioId, getViewerId());
    const fav = await mediaFavorites.getFavoriteSet('audios');
    const comments = await getVoteComments(audio.key);
    ctx.body = await singleAudioView({ ...audio, isFavorite: fav.has(String(audio.rootId || audio.key)), commentCount: comments.length }, filter, comments, { q, sort, returnTo: safeReturnTo(ctx, `/audios?filter=${encodeURIComponent(filter)}`, ['/audios']) });
  })
  .get("/videos", async (ctx) => {
    if (!checkMod(ctx, 'videosMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const items = await videosModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const fav = await mediaFavorites.getFavoriteSet('videos');
    let enriched = items.map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    await Promise.all(enriched.map(async x => { x.commentCount = (await getVoteComments(x.key)).length; }));
    ctx.body = await videoView(enriched, filter, null, { q, sort });
  })
  .get("/videos/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'videosMod')) { ctx.redirect('/modules'); return; }
    const video = await videosModel.getVideoById(ctx.params.id, getViewerId());
    const fav = await mediaFavorites.getFavoriteSet('videos');
    ctx.body = await videoView([{ ...video, isFavorite: fav.has(String(video.rootId || video.key)) }], 'edit', video.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/videos/:videoId", async (ctx) => {
    if (!checkMod(ctx, 'videosMod')) { ctx.redirect('/modules'); return; }
    const { videoId } = ctx.params; const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const video = await videosModel.getVideoById(videoId, getViewerId());
    const fav = await mediaFavorites.getFavoriteSet('videos');
    const comments = await getVoteComments(video.key);
    ctx.body = await singleVideoView({ ...video, isFavorite: fav.has(String(video.rootId || video.key)), commentCount: comments.length }, filter, comments, { q, sort, returnTo: safeReturnTo(ctx, `/videos?filter=${encodeURIComponent(filter)}`, ['/videos']) });
  })
  .get("/documents", async (ctx) => {
    const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const items = await documentsModel.listAll({ filter, q, sort });
    await Promise.all(items.map(async x => { x.commentCount = (await getVoteComments(x.rootId || x.key)).length; }));
    ctx.body = await documentView(items, filter, null, { q, sort });
  })
  .get("/documents/edit/:id", async (ctx) => {
    const doc = await documentsModel.getDocumentById(ctx.params.id);
    ctx.body = await documentView([doc], 'edit', doc.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/documents/:documentId", async (ctx) => {
    const { filter = "all", q = "", sort = "recent" } = ctx.query;
    const document = await documentsModel.getDocumentById(ctx.params.documentId);
    const comments = await getVoteComments(document.rootId || document.key);
    ctx.body = await singleDocumentView(withCount(document, comments), filter, comments, {
      q, sort,
      returnTo: safeReturnTo(ctx, `/documents/${encodeURIComponent(document.key)}?filter=${encodeURIComponent(filter)}${q ? `&q=${encodeURIComponent(q)}` : ""}${sort ? `&sort=${encodeURIComponent(sort)}` : ""}`, ["/documents"])
    });
  })
  .get('/cv', async ctx => {
    const cv = await cvModel.getCVByUserId()
    ctx.body = await cvView(cv)
  })
  .get('/cv/create', async ctx => {
    ctx.body = await createCVView()
  })
  .get('/cv/edit/:id', async ctx => {
    const cv = await cvModel.getCVByUserId()
    ctx.body = await createCVView(cv, true)
  })
  .get('/pm', async ctx => {
    const { recipients = '', subject = '', quote = '', preview = '' } = ctx.query;
    const quoted = quote ? quote.split('\n').map(l => '> ' + l).join('\n') + '\n\n' : '';
    const showPreview = preview === '1';
    ctx.body = await pmView(recipients, subject, quoted, showPreview);
  })
  .get('/inbox', async ctx => {
    if (!checkMod(ctx, 'inboxMod')) { ctx.redirect('/modules'); return; }
    const messages = await pmModel.listAllPrivate();
    ctx.body = await privateView({ messages }, ctx.query.filter || undefined);
  })
  .get('/tags', async ctx => {
    const filter = qf(ctx), tags = await tagsModel.listTags(filter);
    ctx.body = await tagsView(tags, filter);
  })
  .get('/reports', async ctx => {
    const filter = qf(ctx), reports = await enrichWithComments(await reportsModel.listAll());
    ctx.body = await reportView(reports, filter, null, ctx.query.category || '');
  })
  .get('/reports/edit/:id', async ctx => {
    const report = await reportsModel.getReportById(ctx.params.id);
    ctx.body = await reportView([report], 'edit', ctx.params.id);
  })
  .get('/reports/:reportId', async ctx => {
    const { reportId } = ctx.params, filter = qf(ctx), report = await reportsModel.getReportById(reportId);
    const comments = await getVoteComments(reportId);
    ctx.body = await singleReportView(withCount(report, comments), filter, comments);
  })
  .get('/trending', async (ctx) => {
    const filter = qf(ctx, 'RECENT'), { filtered = [] } = await trendingModel.listTrending(filter);
    ctx.body = await trendingView(filtered, filter, trendingModel.categories);
  })
  .get('/agenda', async (ctx) => {
    const filter = qf(ctx), data = await agendaModel.listAgenda(filter);
    ctx.body = await agendaView(data, filter);
  })
  .get("/hashtag/:hashtag", async (ctx) => {
    const { hashtag } = ctx.params;
    const messages = await post.fromHashtag(hashtag);
    ctx.body = await hashtagView({ hashtag, messages });
   })
  .get('/inhabitants', async (ctx) => {
    const filter = qf(ctx), query = { search: ctx.query.search || '' }, userId = getViewerId();
    if (['CVs', 'MATCHSKILLS'].includes(filter)) Object.assign(query, { location: ctx.query.location || '', language: ctx.query.language || '', skills: ctx.query.skills || '' });
    const inhabitants = await inhabitantsModel.listInhabitants({ filter, ...query });
    const [addresses, karmaList] = await Promise.all([bankingModel.listAddressesMerged(), Promise.all(inhabitants.map(async u => { try { return { id: u.id, karmaScore: (await bankingModel.getBankingData(u.id)).karmaScore || 0 }; } catch { return { id: u.id, karmaScore: 0 }; } }))]);
    const addrMap = new Map(addresses.map(x => [x.id, x.address])), karmaMap = new Map(karmaList.map(x => [x.id, x.karmaScore]));
    let enriched = inhabitants.map(u => ({ ...u, ecoAddress: addrMap.get(u.id) || null, karmaScore: karmaMap.get(u.id) ?? (typeof u.karmaScore === 'number' ? u.karmaScore : 0) }));
    if (filter === 'TOP KARMA') enriched = enriched.sort((a, b) => (b.karmaScore || 0) - (a.karmaScore || 0));
    ctx.body = await inhabitantsView(enriched, filter, query, userId);
  })
  .get('/inhabitant/:id', async (ctx) => {
    const id = ctx.params.id;
    const [about, cv, feed, photo, bank, lastTs] = await Promise.all([
      inhabitantsModel.getLatestAboutById(id),
      inhabitantsModel.getCVByUserId(id),
      inhabitantsModel.getFeedByUserId(id),
      inhabitantsModel.getPhotoUrlByUserId(id, 256),
      bankingModel.getBankingData(id).catch(() => ({ karmaScore: 0 })),
      inhabitantsModel.getLastActivityTimestampByUserId(id).catch(() => null)
    ]);
    const bucketInfo = inhabitantsModel.bucketLastActivity(lastTs || null);
    const currentUserId = getViewerId();
    const karmaScore = bank && typeof bank.karmaScore === 'number' ? bank.karmaScore : 0;
    ctx.body = await inhabitantsProfileView({ about, cv, feed, photo, karmaScore, lastActivityBucket: bucketInfo.bucket, viewedId: id }, currentUserId);
  })
  .get('/parliament', async (ctx) => {
    if (!checkMod(ctx, 'parliamentMod')) return ctx.redirect('/modules');
    const filter = (ctx.query.filter || 'government').toLowerCase();
    await ensureTerm();
    await runSweepOnce();
    const [governmentCardRaw, candidatures, proposals, futureLaws, canPropose, laws, historical, leaders, revocations, futureRevocations, revocationsEnactedCount, inhabitantsAll] = await Promise.all([
      parliamentModel.getGovernmentCard(),
      parliamentModel.listCandidatures('OPEN'),
      parliamentModel.listProposalsCurrent(),
      parliamentModel.listFutureLawsCurrent(),
      parliamentModel.canPropose(),
      parliamentModel.listLaws(),
      parliamentModel.listHistorical(),
      parliamentModel.listLeaders(),
      parliamentModel.listRevocationsCurrent(),
      parliamentModel.listFutureRevocationsCurrent(),
      parliamentModel.countRevocationsEnacted(),
      inhabitantsModel.listInhabitants({ filter: 'all' })
    ]);
    const inhabitantsTotal = Array.isArray(inhabitantsAll) ? inhabitantsAll.length : 0;
    const governmentCard = governmentCardRaw ? { ...governmentCardRaw, inhabitantsTotal } : null;
    const leader = pickLeader(candidatures || []);
    const getActorMeta = async (type, id) => (type === 'tribe' || type === 'inhabitant') ? parliamentModel.getActorMeta({ targetType: type, targetId: id }) : null;
    const leaderMeta = leader ? await getActorMeta(leader.targetType || leader.powerType || 'inhabitant', leader.targetId || leader.powerId) : null;
    const powerMeta = governmentCard ? await getActorMeta(governmentCard.powerType, governmentCard.powerId) : null;
    const buildMetas = async (items, limit) => {
      const m = {};
      for (const g of (items || []).slice(0, limit)) {
        if (g.powerType === 'tribe' || g.powerType === 'inhabitant') {
          const k = `${g.powerType}:${g.powerId}`;
          if (!m[k]) m[k] = await getActorMeta(g.powerType, g.powerId);
        }
      }
      return m;
    };
    const [historicalMetas, leadersMetas] = await Promise.all([buildMetas(historical, 12), buildMetas(leaders, 20)]);
    ctx.body = await parliamentView({
      filter,
      inhabitantsTotal,
      governmentCard,
      candidatures,
      proposals,
      futureLaws,
      canPropose,
      laws,
      historical,
      leaders,
      leaderMeta,
      powerMeta,
      historicalMetas,
      leadersMetas,
      revocations,
      futureRevocations,
      revocationsEnactedCount
    });
  })
  .get('/courts', async (ctx) => {
    if (!checkMod(ctx, 'courtsMod')) return ctx.redirect('/modules');
    const filter = String(ctx.query.filter || 'cases').toLowerCase(), search = String(ctx.query.search || '').trim();
    const currentUserId = await courtsModel.getCurrentUserId();
    const state = { filter, search, cases: [], myCases: [], trials: [], history: [], nominations: [], userId: currentUserId };
    const searchFilter = (items) => !search ? items : items.filter(c => [c.title, c.description].some(s => String(s || '').toLowerCase().includes(search.toLowerCase())));
    if (filter === 'cases') state.cases = searchFilter((await courtsModel.listCases('open')).map(c => ({ ...c, respondent: c.respondentId || c.respondent })));
    if (filter === 'mycases' || filter === 'actions') {
      let myCases = searchFilter(await courtsModel.listCasesForUser(currentUserId));
      if (filter === 'actions') myCases = myCases.filter(c => {
        const s = String(c.status || '').toUpperCase(), m = String(c.method || '').toUpperCase(), id = String(currentUserId || '');
        const roles = { a: !!c.isAccuser, r: !!c.isRespondent, m: !!c.isMediator, j: !!c.isJudge, d: !!c.isDictator };
        const open = s === 'OPEN' || s === 'IN_PROGRESS';
        return (roles.r && open) || (m === 'JUDGE' && !c.judgeId && (roles.a || roles.r) && open) || ((roles.j || roles.d || roles.m) && s === 'OPEN') || ((roles.a || roles.r || roles.m) && m === 'MEDIATION' && open) || ((roles.a || roles.r || roles.m || roles.j || roles.d) && open);
      });
      state.myCases = myCases;
    }
    if (filter === 'judges') state.nominations = (await courtsModel.listNominations()) || [];
    if (filter === 'history') {
      const id = String(currentUserId || '');
      state.history = searchFilter((await courtsModel.listCases('history')).map(c => {
        const ma = Array.isArray(c.mediatorsAccuser) ? c.mediatorsAccuser : [], mr = Array.isArray(c.mediatorsRespondent) ? c.mediatorsRespondent : [];
        return { ...c, respondent: c.respondentId || c.respondent, mine: [c.accuser, c.respondentId, c.judgeId].map(String).includes(id) || ma.includes(id) || mr.includes(id), publicDetails: c.publicPrefAccuser && c.publicPrefRespondent, decidedAt: c.verdictAt || c.closedAt || c.decidedAt };
      }));
    }
    ctx.body = await courtsView(state);
  })
  .get('/courts/cases/:id', async (ctx) => {
    if (!checkMod(ctx, 'courtsMod')) return ctx.redirect('/modules');
    ctx.body = await courtsCaseView({ caseData: await courtsModel.getCaseDetails({ caseId: ctx.params.id }).catch(() => null) });
  })
  .get('/tribes', async ctx => {
    const filter = qf(ctx), search = ctx.query.search || '', tribes = await tribesModel.listAll();
    const filteredTribes = search ? tribes.filter(t => t.title.toLowerCase().includes(search.toLowerCase())) : tribes;
    ctx.body = await tribesView(filteredTribes, filter, null, ctx.query);
  })
  .get('/tribes/create', async ctx => {
    ctx.body = await tribesView([], 'create', null)
  })
  .get('/tribes/edit/:id', async ctx => {
    const tribe = await tribesModel.getTribeById(ctx.params.id)
    ctx.body = await tribesView([tribe], 'edit', ctx.params.id)
  })
  .get('/tribe/:tribeId', koaBody(), async ctx => {
    const tribe = await tribesModel.getTribeById(ctx.params.tribeId);
    const userId = getViewerId();
    const query = { feedFilter: 'TOP', ...ctx.query }; 
    if (!tribe.members.includes(userId)) {
      ctx.status = 403;
      ctx.body = { message: 'You cannot access to this tribe!' };
      return;
    }
    ctx.body = await tribeView(tribe, userId, query);
  })
  .get('/activity', async ctx => {
    const filter = qf(ctx, 'recent'), userId = getViewerId();
    const q = String((ctx.query && ctx.query.q) || '');
    try { await bankingModel.ensureSelfAddressPublished(); } catch (_) {}
    try { await bankingModel.getUserEngagementScore(userId); } catch (_) {}
    const allActions = await activityModel.listFeed('all');
    ctx.body = activityView(allActions, filter, userId, q);
  })
  .get("/profile", async (ctx) => {
    const myFeedId = await meta.myFeedId(), gt = Number(ctx.request.query.gt || -1), lt = Number(ctx.request.query.lt || -1);
    if (lt > 0 && gt > 0 && gt >= lt) throw new Error("Given search range is empty");
    const [description, name, image, messages, firstPost, lastPost, ecoAddress, bankData] = await Promise.all([
      about.description(myFeedId), about.name(myFeedId), about.image(myFeedId), post.fromPublicFeed(myFeedId, gt, lt),
      post.firstBy(myFeedId), post.latestBy(myFeedId), bankingModel.getUserAddress(myFeedId), bankingModel.getBankingData(myFeedId)
    ]);
    const normTs = t => { const n = Number(t || 0); return !isFinite(n) || n <= 0 ? 0 : n < 1e12 ? n * 1000 : n; };
    const pickTs = obj => { if (!obj) return 0; const v = obj.value || obj; return normTs(v.timestamp || v.ts || v.time || v.meta?.timestamp || 0); };
    let lastActivityTs = Math.max(Array.isArray(messages) && messages.length ? Math.max(...messages.map(pickTs)) : 0, pickTs(lastPost), pickTs(firstPost));
    if (!lastActivityTs) {
      const pull = require("../server/node_modules/pull-stream"), ssb = await require("../client/gui")({ offline: require("../server/ssb_config").offline }).open();
      lastActivityTs = await new Promise(res => pull(ssb.createUserStream({ id: myFeedId, reverse: true }), pull.filter(m => m?.value?.content?.type !== "tombstone"), pull.take(1), pull.collect((err, arr) => res(!err && arr?.[0] ? normTs(arr[0].value?.timestamp || arr[0].timestamp) : 0))));
    }
    const days = lastActivityTs ? (Date.now() - lastActivityTs) / 86400000 : Infinity;
    ctx.body = await authorView({ feedId: myFeedId, messages, firstPost, lastPost, name, description, avatarUrl: getAvatarUrl(image), relationship: { me: true }, ecoAddress, karmaScore: bankData.karmaScore, lastActivityBucket: days < 14 ? "green" : days < 182.5 ? "orange" : "red" });
  })
  .get("/profile/edit", async (ctx) => {
    const myFeedId = await meta.myFeedId();
    ctx.body = await editProfileView({ name: await about.name(myFeedId), description: await about.description(myFeedId) });
  })
  .post("/profile/edit", koaBody({ multipart: true }), async (ctx) => {
    ctx.body = await post.publishProfileEdit({ name: String(ctx.request.body.name), description: String(ctx.request.body.description), image: await promisesFs.readFile(ctx.request.files.image.filepath) });
    ctx.redirect("/profile");
  })
  .get("/publish/custom", async (ctx) => {
    ctx.body = await publishCustomView();
  })
  .get("/json/:message", async (ctx) => {
    if (config.public) {
      throw new Error(
        "Sorry, many actions are unavailable when Oasis is running in public mode. Please run Oasis in the default mode and try again."
      );
    }
    const { message } = ctx.params;
    ctx.type = "application/json";
    const json = async (message) => {
      const json = await meta.get(message);
      return JSON.stringify(json, null, 2);
    };
    ctx.body = await json(message);
  })
  .get("/blob/:blobId", serveBlob)
  .get("/image/:imageSize/:blobId", async (ctx) => {
    const { blobId, imageSize } = ctx.params;
    const size = Number(imageSize);
    const fallbackPixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    const fakeImage = () => {
      if (typeof sharp !== "function") {
        return Promise.resolve(fallbackPixel);
      }
      return sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0.5 },
        },
      }).png().toBuffer();
    };
    try {
      const buffer = await blob.getResolved({ blobId });
      if (!buffer) {
        ctx.set("Content-Type", "image/png");
        ctx.body = await fakeImage();
        return;
      }
      const fileType = await FileType.fromBuffer(buffer);
      const mimeType = fileType?.mime || "application/octet-stream";
      ctx.set("Content-Type", mimeType);
      if (typeof sharp === "function") {
        ctx.body = await sharp(buffer)
          .resize(size, size)
          .png()
          .toBuffer();
      } else {
        ctx.body = buffer;
      }
    } catch (err) {
      ctx.set("Content-Type", "image/png");
      ctx.body = await fakeImage();
    }
  })
  .get("/settings", async (ctx) => {
    const cfg = getConfig(), theme = ctx.cookies.get("theme") || "Dark-SNH";
    ctx.body = await settingsView({ theme, version: version.toString(), aiPrompt: cfg.ai?.prompt || "", pubWalletUrl: cfg.walletPub?.url || '', pubWalletUser: cfg.walletPub?.user || '', pubWalletPass: cfg.walletPub?.pass || '' });
  })
  .get("/peers", async (ctx) => {
    const { discoveredPeers, unknownPeers } = await meta.discovered();
    ctx.body = await peersView({ onlinePeers: await meta.onlinePeers(), discoveredPeers, unknownPeers });
  })
  .get("/invites", async (ctx) => {
    if (!checkMod(ctx, 'invitesMod')) return ctx.redirect('/modules');
    ctx.body = await invitesView({});
  })
  .get("/likes/:feed", async (ctx) => {
    const { feed } = ctx.params;
    ctx.body = await likesView({ messages: await post.likes({ feed }), feed, name: await about.name(feed) });
  })
  .get("/mentions", async (ctx) => {
    const { messages, myFeedId } = await post.mentionsMe();
    ctx.body = await mentionsView({ messages, myFeedId });
  })
  .get('/opinions', async (ctx) => {
    const filter = qf(ctx, 'RECENT'), opinions = await opinionsModel.listOpinions(filter);
    ctx.body = await opinionsView(opinions, filter);
  })
  .get("/feed", async (ctx) => {
    const filter = String(ctx.query.filter || "ALL").toUpperCase();
    const q = typeof ctx.query.q === "string" ? ctx.query.q : "";
    const tag = typeof ctx.query.tag === "string" ? ctx.query.tag : "";
    const feeds = await feedModel.listFeeds({ filter, q, tag });
    ctx.body = feedView(feeds, { filter, q, tag });
  })
  .get("/feed/create", async (ctx) => {
    const q = typeof ctx.query.q === "string" ? ctx.query.q : "";
    const tag = typeof ctx.query.tag === "string" ? ctx.query.tag : "";
    ctx.body = feedCreateView({ q, tag });
  })
  .get('/forum', async ctx => {
    if (!checkMod(ctx, 'forumMod')) { ctx.redirect('/modules'); return; }
    const filter = qf(ctx, 'hot'), forums = await forumModel.listAll(filter);
    ctx.body = await forumView(forums, filter);
  })
  .get('/forum/:forumId', async ctx => {
    const msg = await forumModel.getMessageById(ctx.params.forumId), isReply = Boolean(msg.root), forumId = isReply ? msg.root : ctx.params.forumId;
    ctx.body = await singleForumView(await forumModel.getForumById(forumId), await forumModel.getMessagesByForumId(forumId), ctx.query.filter, isReply ? ctx.params.forumId : null);
  })
  .get('/legacy', async (ctx) => {
    if (!checkMod(ctx, 'legacyMod')) return ctx.redirect('/modules');
    try { ctx.body = await legacyView(); } catch (error) { ctx.body = { error: error.message }; }
  })
  .get('/bookmarks', async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) return ctx.redirect('/modules');
    const filter = qf(ctx), q = ctx.query.q || '', sort = ctx.query.sort || 'recent', viewerId = getViewerId();
    const favs = await mediaFavorites.getFavoriteSet("bookmarks");
    let bookmarks = (await bookmarksModel.listAll({ viewerId, filter: filter === "favorites" ? "all" : filter, q, sort })).map(b => ({ ...b, isFavorite: favs.has(String(b.rootId || b.id)) }));
    if (filter === "favorites") bookmarks = bookmarks.filter(b => b.isFavorite);
    await enrichWithComments(bookmarks, 'rootId');
    ctx.body = await bookmarkView(bookmarks, filter, null, { q, sort });
  })
  .get("/bookmarks/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) return ctx.redirect('/modules');
    const bookmark = await bookmarksModel.getBookmarkById(ctx.params.id, getViewerId()), favs = await mediaFavorites.getFavoritesSet("bookmarks");
    ctx.body = await bookmarkView([{ ...bookmark, isFav: favs.has(String(bookmark.rootId || bookmark.id)) }], "edit", bookmark.id, { returnTo: ctx.query.returnTo || "" });
  })
  .get('/bookmarks/:bookmarkId', async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) return ctx.redirect('/modules');
    const filter = qf(ctx), q = ctx.query.q || '', sort = ctx.query.sort || 'recent', favs = await mediaFavorites.getFavoriteSet("bookmarks");
    const bookmark = await bookmarksModel.getBookmarkById(ctx.params.bookmarkId), root = bookmark.rootId || bookmark.id, comments = await getVoteComments(root);
    ctx.body = await singleBookmarkView({ ...bookmark, commentCount: comments.length, isFavorite: favs.has(String(root)) }, filter, comments, { q, sort, returnTo: safeReturnTo(ctx, `/bookmarks?filter=${encodeURIComponent(filter)}`, ['/bookmarks']) });
  })
  .get('/tasks', async ctx => {
    const filter = qf(ctx), tasks = await enrichWithComments(await tasksModel.listAll());
    ctx.body = await taskView(tasks, filter, null, ctx.query.returnTo);
  })
  .get('/tasks/edit/:id', async ctx => {
    const id = ctx.params.id;
    const task = await tasksModel.getTaskById(id);
    ctx.body = await taskView(task, 'edit', id, ctx.query.returnTo);
  })
  .get('/tasks/:taskId', async ctx => {
    const { taskId } = ctx.params, filter = qf(ctx), task = await tasksModel.getTaskById(taskId);
    const comments = await getVoteComments(taskId);
    ctx.body = await singleTaskView(withCount(task, comments), filter, comments);
  })
  .get('/events', async (ctx) => {
    if (!checkMod(ctx, 'eventsMod')) { ctx.redirect('/modules'); return; }
    const filter = qf(ctx), events = await enrichWithComments(await eventsModel.listAll(null, filter));
    ctx.body = await eventView(events, filter, null, ctx.query.returnTo);
  })
  .get('/events/edit/:id', async (ctx) => {
    if (!checkMod(ctx, 'eventsMod')) { ctx.redirect('/modules'); return; }
    const eventId = ctx.params.id;
    const event = await eventsModel.getEventById(eventId);
    ctx.body = await eventView([event], 'edit', eventId, ctx.query.returnTo);
  })
  .get('/events/:eventId', async ctx => {
    const { eventId } = ctx.params, filter = qf(ctx), event = await eventsModel.getEventById(eventId);
    const comments = await getVoteComments(eventId);
    ctx.body = await singleEventView(withCount(event, comments), filter, comments);
  })
  .get('/votes', async ctx => {
    const filter = qf(ctx), voteList = await enrichWithComments(await votesModel.listAll(filter));
    ctx.body = await voteView(voteList, filter, null, [], filter);
  })
  .get('/votes/edit/:id', async ctx => {
    const id = ctx.params.id;
    const activeFilter = (ctx.query.filter || 'mine');
    const voteData = await votesModel.getVoteById(id);
    ctx.body = await voteView([voteData], 'edit', id, [], activeFilter);
  })
  .get('/votes/:voteId', async ctx => {
    const { voteId } = ctx.params, filter = qf(ctx), voteData = await votesModel.getVoteById(voteId);
    const comments = await getVoteComments(voteId);
    ctx.body = await voteView([withCount(voteData, comments)], 'detail', voteId, comments, filter);
  })
  .get("/market", async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const filter = qf(ctx), q = ctx.query.q || "", minPrice = ctx.query.minPrice ?? "", maxPrice = ctx.query.maxPrice ?? "", sort = ctx.query.sort || "recent";
    let marketItems = await marketModel.listAllItems("all");
    await marketModel.checkAuctionItemsStatus(marketItems);
    marketItems = await marketModel.listAllItems("all");
    await enrichWithComments(marketItems);
    ctx.body = await marketView(marketItems, filter, null, { q, minPrice, maxPrice, sort });
  })
  .get("/market/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const id = ctx.params.id
    let marketItem = await marketModel.getItemById(id)
    if (!marketItem) ctx.throw(404, "Item not found")
    await marketModel.checkAuctionItemsStatus([marketItem])
    marketItem = await marketModel.getItemById(id)
    if (!marketItem) ctx.throw(404, "Item not found")
    ctx.body = await marketView([marketItem], "edit", marketItem, { q: "", minPrice: "", maxPrice: "", sort: "recent" })
  })
  .get("/market/:itemId", async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const { itemId } = ctx.params, filter = qf(ctx), q = ctx.query.q || "", minPrice = ctx.query.minPrice ?? "", maxPrice = ctx.query.maxPrice ?? "", sort = ctx.query.sort || "recent";
    let item = await marketModel.getItemById(itemId)
    if (!item) ctx.throw(404, "Item not found")
    await marketModel.checkAuctionItemsStatus([item])
    item = await marketModel.getItemById(itemId)
    if (!item) ctx.throw(404, "Item not found")
    const comments = await getVoteComments(itemId)
    const returnTo = (() => {
    const params = []
      if (filter) params.push(`filter=${encodeURIComponent(filter)}`)
      if (q) params.push(`q=${encodeURIComponent(q)}`)
      if (minPrice !== "" && minPrice != null) params.push(`minPrice=${encodeURIComponent(String(minPrice))}`)
      if (maxPrice !== "" && maxPrice != null) params.push(`maxPrice=${encodeURIComponent(String(maxPrice))}`)
      if (sort) params.push(`sort=${encodeURIComponent(sort)}`)
      return `/market${params.length ? `?${params.join("&")}` : ""}`
    })()
    ctx.body = await singleMarketView(withCount(item, comments), filter, comments, { q, minPrice, maxPrice, sort, returnTo })
  })
  .get('/jobs', async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    let filter = String(ctx.query.filter || 'ALL').toUpperCase()
    if (filter === 'FAVS' || filter === 'NEEDS') filter = 'ALL'
    const query = {
      search: ctx.query.search || '',
      minSalary: ctx.query.minSalary ?? '',
      maxSalary: ctx.query.maxSalary ?? '',
      sort: ctx.query.sort || 'recent'
    }
    if (filter === 'CREATE') {
      ctx.body = await jobsView([], 'CREATE', query)
      return
    }
    if (filter === 'CV') {
      query.location = ctx.query.location || ''
      query.language = ctx.query.language || ''
      query.skills = ctx.query.skills || ''
      const inhabitants = await inhabitantsModel.listInhabitants({
        filter: 'CVs',
        ...query
      })
      ctx.body = await jobsView(inhabitants, filter, query)
      return
    }
    const viewerId = getViewerId()
    const jobs = await jobsModel.listJobs(filter, viewerId, query)
    await enrichWithComments(jobs)
    ctx.body = await jobsView(jobs, filter, query)
  })
  .get('/jobs/edit/:id', async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    const id = ctx.params.id
    const viewerId = getViewerId()
    const job = await jobsModel.getJobById(id, viewerId)
    ctx.body = await jobsView([job], 'EDIT', {})
  })
  .get('/jobs/:jobId', async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    const jobId = ctx.params.jobId
    let filter = String(ctx.query.filter || 'ALL').toUpperCase()
    if (filter === 'FAVS' || filter === 'NEEDS') filter = 'ALL'
    const viewerId = getViewerId()
    const params = {
      search: ctx.query.search || '',
      minSalary: ctx.query.minSalary ?? '',
      maxSalary: ctx.query.maxSalary ?? '',
      sort: ctx.query.sort || 'recent',
      returnTo: safeReturnTo(ctx, `/jobs?filter=${encodeURIComponent(filter)}`, ['/jobs'])
    }
    const job = await jobsModel.getJobById(jobId, viewerId)
    const comments = await getVoteComments(jobId)
    ctx.body = await singleJobsView(withCount(job, comments), filter, comments, params)
  })
  .get("/projects", async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || "ALL").toUpperCase()
    if (filter === "CREATE") {
      ctx.body = await projectsView([], "CREATE")
      return
    }
    const modelFilter = filter === "BACKERS" ? "ALL" : filter
    const projects = await projectsModel.listProjects(modelFilter)
    await enrichWithComments(projects)
    ctx.body = await projectsView(projects, filter)
  })
  .get("/projects/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = ctx.params.id
    const pr = await projectsModel.getProjectById(id)
    ctx.body = await projectsView([pr], "EDIT")
  })
  .get("/projects/:projectId", async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const projectId = ctx.params.projectId
    const filter = String(ctx.query.filter || "ALL").toUpperCase()
    const project = await projectsModel.getProjectById(projectId)
    const comments = await getVoteComments(projectId)
    ctx.body = await singleProjectView(withCount(project, comments), filter, comments)
  })
  .get("/banking", async (ctx) => {
    if (!checkMod(ctx, 'bankingMod')) { ctx.redirect('/modules'); return; }
    const userId = getViewerId();
    const query = ctx.query;
    const filter = (query.filter || 'overview').toLowerCase();
    const q = (query.q || '').trim();
    const msg = (query.msg || '').trim();
    await bankingModel.ensureSelfAddressPublished();
    const data = await bankingModel.listBanking(filter, userId);
    if (filter === 'addresses' && q) {
      data.addresses = (data.addresses || []).filter(x =>
        String(x.id).toLowerCase().includes(q.toLowerCase()) ||
        String(x.address).toLowerCase().includes(q.toLowerCase())
      );
      data.search = q;
    }
    data.flash = msg || '';
    const { ecoValue, inflationFactor, ecoInHours, currentSupply, isSynced } = await bankingModel.calculateEcoinValue();
    data.exchange = {
      ecoValue: ecoValue,
      inflationFactor,
      ecoInHours,
      currentSupply: currentSupply,
      totalSupply: 25500000,
      isSynced: isSynced
    };
    ctx.body = renderBankingView(data, filter, userId);
  })
  .get("/banking/allocation/:id", async (ctx) => {
    const userId = getViewerId();
    const allocation = await bankingModel.getAllocationById(ctx.params.id);
    ctx.body = renderSingleAllocationView(allocation, userId);
  })
  .get("/banking/epoch/:id", async (ctx) => {
    const epoch = await bankingModel.getEpochById(ctx.params.id);
    const allocations = await bankingModel.listEpochAllocations(ctx.params.id);
    ctx.body = renderEpochView(epoch, allocations);
  })
  .get("/favorites", async (ctx) => {
    const filter = qf(ctx), data = await favoritesModel.listAll({ filter });
    ctx.body = await favoritesView(data.items, filter, data.counts);
  })
  .get('/cipher', async (ctx) => {
    if (!checkMod(ctx, 'cipherMod')) { ctx.redirect('/modules'); return; }
    try {
      ctx.body = await cipherView();
    } catch (error) {
      ctx.body = { error: error.message };
    }
  })  
  .get("/thread/:message", async (ctx) => {
    const { message } = ctx.params;
    const thread = async (message) => {
      const messages = await post.fromThread(message);
      return threadView({ messages });
    };
    ctx.body = await thread(message);
  })
  .get("/subtopic/:message", async (ctx) => {
    const { message } = ctx.params;
    const rootMessage = await post.get(message);
    const myFeedId = await meta.myFeedId();
    debug("%O", rootMessage);
    const messages = [rootMessage];
    ctx.body = await subtopicView({ messages, myFeedId });
  })
  .get("/publish", async (ctx) => {
    ctx.body = await publishView();
  })
  .get("/comment/:message", async (ctx) => {
    const { messages, myFeedId, parentMessage } =
      await resolveCommentComponents(ctx);
    ctx.body = await commentView({ messages, myFeedId, parentMessage });
  })
  .get("/wallet", async (ctx) => {
    const { url, user, pass } = getConfig().wallet;
    if (!checkMod(ctx, 'walletMod')) { ctx.redirect('/modules'); return; }
    try {
      const balance = await walletModel.getBalance(url, user, pass);
      const address = await walletModel.getAddress(url, user, pass);
      const userId = getViewerId();
      if (address && typeof address === "string") {
        const map = readAddrMap();
        const was = map[userId];
        if (was !== address) {
          map[userId] = address;
          writeAddrMap(map);
          try { await publishActivity({ type: 'bankWallet', address }); } catch (e) {}
        }
      }
      ctx.body = await walletView(balance, address);
    } catch (error) {
      ctx.body = await walletErrorView(error);
    }
  })
  .get("/wallet/history", async (ctx) => {
    const { url, user, pass } = getConfig().wallet;
    try {
      const balance = await walletModel.getBalance(url, user, pass);
      const transactions = await walletModel.listTransactions(url, user, pass);
      const address = await walletModel.getAddress(url, user, pass);
      const userId = getViewerId();
      if (address && typeof address === "string") {
        const map = readAddrMap();
        const was = map[userId];
        if (was !== address) {
          map[userId] = address;
          writeAddrMap(map);
          try { await publishActivity({ type: 'bankWallet', address }); } catch (e) {}
        }
      }
      ctx.body = await walletHistoryView(balance, transactions, address);
    } catch (error) {
      ctx.body = await walletErrorView(error);
    }
  })
  .get("/wallet/receive", async (ctx) => {
    const { url, user, pass } = getConfig().wallet;
    try {
      const balance = await walletModel.getBalance(url, user, pass);
      const address = await walletModel.getAddress(url, user, pass);
      const userId = getViewerId();
      if (address && typeof address === "string") {
        const map = readAddrMap();
        const was = map[userId];
        if (was !== address) {
          map[userId] = address;
          writeAddrMap(map);
          try { await publishActivity({ type: 'bankWallet', address }); } catch (e) {}
        }
      }
      ctx.body = await walletReceiveView(balance, address);
    } catch (error) {
      ctx.body = await walletErrorView(error);
    }
  })
  .get("/wallet/send", async (ctx) => {
    const { url, user, pass, fee } = getConfig().wallet;
    try {
      const balance = await walletModel.getBalance(url, user, pass);
      const address = await walletModel.getAddress(url, user, pass);
      const userId = getViewerId();
      if (address && typeof address === "string") {
        const map = readAddrMap();
        const was = map[userId];
        if (was !== address) {
          map[userId] = address;
          writeAddrMap(map);
          try { await publishActivity({ type: 'bankWallet', address }); } catch (e) {}
        }
      }
      ctx.body = await walletSendFormView(balance, null, null, fee, null, address);
    } catch (error) {
      ctx.body = await walletErrorView(error);
    }
  })
  .get('/transfers', async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    let filter = ctx.query.filter || 'all'; if (filter === 'favs') filter = 'all';
    const list = await transfersModel.listAll(filter, getViewerId());
    ctx.body = await transferView(list, filter, null, { q: ctx.query.q || '', minAmount: ctx.query.minAmount ?? '', maxAmount: ctx.query.maxAmount ?? '', sort: ctx.query.sort || 'recent' });
  })
  .get('/transfers/edit/:id', async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    const tr = await transfersModel.getTransferById(ctx.params.id, getViewerId());
    ctx.body = await transferView([tr], 'edit', ctx.params.id, {});
  })
  .get('/transfers/:transferId', async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    let filter = ctx.query.filter || 'all'; if (filter === 'favs') filter = 'all';
    const transfer = await transfersModel.getTransferById(ctx.params.transferId, getViewerId());
    ctx.body = await singleTransferView(transfer, filter, { q: ctx.query.q || '', minAmount: ctx.query.minAmount ?? '', maxAmount: ctx.query.maxAmount ?? '', sort: ctx.query.sort || 'recent', returnTo: safeReturnTo(ctx, `/transfers?filter=${encodeURIComponent(filter)}`, ['/transfers']) });
  })
  .post('/ai', koaBody(), async (ctx) => {
    const { input } = ctx.request.body;
    if (!input) {
      ctx.status = 400;
      ctx.body = { error: 'No input provided' };
      return;
    }
    startAI();
    const i18nAll = require('../client/assets/translations/i18n');
    const lang = ctx.cookies.get('lang') || 'en';
    const translations = i18nAll[lang] || i18nAll['en'];
    const { setLanguage } = require('../views/main_views');
    setLanguage(lang);
    const historyPath = path.join(__dirname, '..', '..', 'src', 'configs', 'AI-history.json');
    let chatHistory = [];
    try {
      const fileData = fs.readFileSync(historyPath, 'utf-8');
      chatHistory = JSON.parse(fileData);
    } catch {
      chatHistory = [];
    }
    const config = getConfig();
    const userPrompt = config.ai?.prompt?.trim() || 'Provide an informative and precise response.';
    try {
      let aiResponse = '';
      let snippets = [];
      const trained = await getBestTrainedAnswer(input);
      if (trained && trained.answer) {
        aiResponse = trained.answer;
        snippets = Array.isArray(trained.ctx) ? trained.ctx : [];
      } else {
        const response = await axios.post('http://localhost:4001/ai', { input });
        aiResponse = response.data.answer;
        snippets = Array.isArray(response.data.snippets) ? response.data.snippets : [];
      }
      chatHistory.unshift({
        prompt: userPrompt,
        question: input,
        answer: aiResponse,
        timestamp: Date.now(),
        trainStatus: 'pending',
        snippets
      });
    } catch (e) {
      chatHistory.unshift({
        prompt: userPrompt,
        question: input,
        answer: translations.aiServerError || 'The AI could not answer. Please try again.',
        timestamp: Date.now(),
        trainStatus: 'rejected',
        snippets: []
      });
    }
    chatHistory = chatHistory.slice(0, 20);
    fs.writeFileSync(historyPath, JSON.stringify(chatHistory, null, 2), 'utf-8');
    ctx.body = aiView(chatHistory, userPrompt);
  })
  .post('/ai/approve', koaBody(), async (ctx) => {
    const ts = String(ctx.request.body.ts || '');
    const custom = String(ctx.request.body.custom || '').trim();
    const historyPath = path.join(__dirname, '..', '..', 'src', 'configs', 'AI-history.json');
    let chatHistory = [];
    try {
      const fileData = fs.readFileSync(historyPath, 'utf-8');
      chatHistory = JSON.parse(fileData);
    } catch {
      chatHistory = [];
    }
    const item = chatHistory.find(e => String(e.timestamp) === ts);
    if (item) {
      try {
        if (custom) item.answer = custom;
        item.type = 'aiExchange';
        let snippets = fieldsForSnippet('aiExchange', item);
        if (snippets.length === 0) {
          const context = await buildContext();
          snippets = [context];
        } else {
          snippets = snippets.map(snippet => clip(snippet, 200));
        }
        await publishExchange({
          q: item.question,
          a: item.answer,
          ctx: snippets,
          tokens: {}
        });
        item.trainStatus = 'approved';
      } catch {
        item.trainStatus = 'failed';
      }
      fs.writeFileSync(historyPath, JSON.stringify(chatHistory, null, 2), 'utf-8');
    }
    const config = getConfig();
    const userPrompt = config.ai?.prompt?.trim() || '';
    ctx.body = aiView(chatHistory, userPrompt);
  })
  .post('/ai/reject', koaBody(), async (ctx) => {
    const i18nAll = require('../client/assets/translations/i18n');
    const lang = ctx.cookies.get('lang') || 'en';
    const { setLanguage } = require('../views/main_views');
    setLanguage(lang);
    const ts = String(ctx.request.body.ts || '');
    const historyPath = path.join(__dirname, '..', '..', 'src', 'configs', 'AI-history.json');
    let chatHistory = [];
    try {
        const fileData = fs.readFileSync(historyPath, 'utf-8');
        chatHistory = JSON.parse(fileData);
    } catch {
        chatHistory = [];
    }
    const item = chatHistory.find(e => String(e.timestamp) === ts);
    if (item) {
        item.trainStatus = 'rejected';
        fs.writeFileSync(historyPath, JSON.stringify(chatHistory, null, 2), 'utf-8');
    }
    const config = getConfig();
    const userPrompt = config.ai?.prompt?.trim() || '';
    ctx.body = aiView(chatHistory, userPrompt);  
  })
  .post('/ai/clear', async (ctx) => {
    const i18nAll = require('../client/assets/translations/i18n');
    const lang = ctx.cookies.get('lang') || 'en';
    const { setLanguage } = require('../views/main_views');
    setLanguage(lang);
    const historyPath = path.join(__dirname, '..', '..', 'src', 'configs', 'AI-history.json');
    fs.writeFileSync(historyPath, '[]', 'utf-8');
    const config = getConfig();
    const userPrompt = config.ai?.prompt?.trim() || '';
    ctx.body = aiView([], userPrompt);
  })
  .post('/pixelia/paint', koaBody(), async (ctx) => {
    const { x, y, color } = ctx.request.body;
    if (x < 1 || x > 50 || y < 1 || y > 200) {
      const errorMessage = 'Coordinates are wrong!';
      const pixelArt = await pixeliaModel.listPixels();
      ctx.body = pixeliaView(pixelArt, errorMessage);
      return;
    }
    await pixeliaModel.paintPixel(x, y, color);
    ctx.redirect('/pixelia');
  })
  .post('/pm', koaBody(), async ctx => {
    const { recipients, subject, text } = ctx.request.body;
    const recipientsArr = (recipients || '').split(',').map(s => s.trim()).filter(Boolean);
    await pmModel.sendMessage(recipientsArr, subject, text);
    ctx.redirect('/inbox?filter=sent');
  })
  .post('/pm/preview', koaBody(), async ctx => {
    const { recipients = '', subject = '', text = '' } = ctx.request.body;
    ctx.body = await pmView(recipients, subject, text, true);
  })
  .post('/inbox/delete/:id', koaBody(), async ctx => {
    await pmModel.deleteMessageById(ctx.params.id);
    ctx.redirect('/inbox');
  })
  .post("/search", koaBody(), async (ctx) => {
    const b = ctx.request.body, query = b.query || "";
    let types = b.type || [];
    if (typeof types === "string") types = [types];
    if (!Array.isArray(types)) types = [];
    if (!query) return ctx.body = await searchView({ messages: [], query, types });
    const results = await searchModel.search({ query, types });
    ctx.body = await searchView({ results: Object.entries(results).reduce((acc, [type, msgs]) => {
      acc[type] = msgs.map(msg => (!msg.value?.content) ? {} : { ...msg, content: msg.value.content, author: msg.value.content.author || 'Unknown' });
      return acc;
    }, {}), query, types });
  })
  .post("/subtopic/preview/:message",
    koaBody({ multipart: true }),
    async (ctx) => {
      const { message } = ctx.params;
      const rootMessage = await post.get(message);
      const myFeedId = await meta.myFeedId();
      const rawContentWarning = String(ctx.request.body.contentWarning).trim();
      const contentWarning =
        rawContentWarning.length > 0 ? rawContentWarning : undefined;
      const messages = [rootMessage];
      const previewData = await preparePreview(ctx);
      ctx.body = await previewSubtopicView({
        messages,
        myFeedId,
        previewData,
        contentWarning,
      });
    }
  )
  .post("/subtopic/:message", koaBody(), async (ctx) => {
    const { message } = ctx.params;
    const text = String(ctx.request.body.text);
    const rawContentWarning = String(ctx.request.body.contentWarning).trim();
    const contentWarning =
      rawContentWarning.length > 0 ? rawContentWarning : undefined;
    const publishSubtopic = async ({ message, text }) => {
      const mentions = extractMentions(text);
      const parent = await post.get(message);
      return post.subtopic({
        parent,
        message: { text, mentions, contentWarning },
      });
    };
    ctx.body = await publishSubtopic({ message, text });
    ctx.redirect(`/thread/${encodeURIComponent(message)}`);
  })
  .post("/comment/preview/:message", koaBody({ multipart: true }), async (ctx) => {
   const { messages, contentWarning, myFeedId, parentMessage } = await resolveCommentComponents(ctx);
    const previewData = await preparePreview(ctx);
    ctx.body = await previewCommentView({
      messages,
      myFeedId,
      contentWarning,
      previewData,
      parentMessage,
    });
  })
  .post("/comment/:message", koaBody(), async (ctx) => {
    let decodedMessage;
    try {
      decodedMessage = decodeURIComponent(ctx.params.message);
    } catch {
      decodedMessage = ctx.params.message;
    }
    const text = String(ctx.request.body.text);
    const rawContentWarning = String(ctx.request.body.contentWarning);
    const contentWarning =
      rawContentWarning.length > 0 ? rawContentWarning : undefined;
    let mentions = extractMentions(text);
    if (!Array.isArray(mentions)) mentions = [];
    const parent = await meta.get(decodedMessage);
    ctx.body = await post.comment({
    parent,
    message: {
      text,
      mentions,
      contentWarning
    },
  });
  ctx.redirect(`/thread/${encodeURIComponent(parent.key)}`);
  })
  .post("/publish/preview", koaBody({multipart: true, formidable: { multiples: false }, urlencoded: true }), async (ctx) => {
    const cw = ctx.request.body.contentWarning?.toString().trim() || "";
    ctx.body = await previewView({ previewData: await preparePreview(ctx), contentWarning: cw.length > 0 ? cw : undefined });
  })
  .post("/publish", koaBody({ multipart: true, urlencoded: true, formidable: { multiples: false } }), async (ctx) => {
    const b = ctx.request.body, text = b.text?.toString().trim() || "", cw = b.contentWarning?.toString().trim() || "";
    let mentions = [];
    try { mentions = JSON.parse(b.mentions || "[]"); } catch { mentions = await extractMentions(text); }
    await post.root({ text, mentions, contentWarning: cw.length > 0 ? cw : undefined });
    ctx.redirect("/public/latest");
  })
  .post("/publish/custom", koaBody(), async (ctx) => {
    const text = String(ctx.request.body.text);
    const obj = JSON.parse(text);
    ctx.body = await post.publishCustom(obj);
    ctx.redirect(`/public/latest`);
  })
  .post("/follow/:feed", koaBody(), async (ctx) => {
    ctx.body = await friend.follow(ctx.params.feed);
    ctx.redirect(new URL(ctx.request.header.referer).href);
  })
  .post("/unfollow/:feed", koaBody(), async (ctx) => {
    ctx.body = await friend.unfollow(ctx.params.feed);
    ctx.redirect(new URL(ctx.request.header.referer).href);
  })
  .post("/block/:feed", koaBody(), async (ctx) => {
    ctx.body = await friend.block(ctx.params.feed);
    ctx.redirect(new URL(ctx.request.header.referer).href);
  })
  .post("/unblock/:feed", koaBody(), async (ctx) => {
    ctx.body = await friend.unblock(ctx.params.feed);
    ctx.redirect(new URL(ctx.request.header.referer).href);
  })
  .post("/like/:message", koaBody(), async (ctx) => {
    const { message } = ctx.params, voteValue = Number(ctx.request.body.voteValue);
    const referer = new URL(ctx.request.header.referer);
    referer.hash = `centered-footer-${encodeURIComponent(message)}`;
    const msgData = await post.get(message);
    const isPrivate = msgData.value.meta.private === true;
    const normalized = (isPrivate ? msgData.value.content.recps : []).map(r => typeof r === 'string' ? r : r?.link).filter(Boolean);
    ctx.body = await vote.publish({ messageKey: message, value: voteValue, recps: normalized.length ? normalized : undefined });
    ctx.redirect(referer.href);
  }) 
  .post('/forum/create', koaBody(), async ctx => {
    const { category, title, text } = ctx.request.body;
    await forumModel.createForum(category, title, text);
    ctx.redirect('/forum');
  })
  .post('/forum/:id/message', koaBody(), async ctx => {
    const { message, parentId } = ctx.request.body;
    await forumModel.addMessageToForum(ctx.params.id, { text: message, author: getViewerId(), timestamp: new Date().toISOString() }, parentId);
    ctx.redirect(`/forum/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/forum/:forumId/vote', koaBody(), async ctx => {
    await forumModel.voteContent(ctx.request.body.target, parseInt(ctx.request.body.value, 10));
    ctx.redirect(ctx.get('referer') || `/forum/${encodeURIComponent(ctx.params.forumId)}`);
  })
  .post('/forum/delete/:id', koaBody(), async ctx => {
    await forumModel.deleteForumById(ctx.params.id);
    ctx.redirect('/forum');
  })
  .post('/legacy/export', koaBody(), async (ctx) => {
    const pw = ctx.request.body.password;
    if (!pw || pw.length < 32) return ctx.redirect('/legacy');
    try {
      ctx.body = { message: 'Data exported successfully!', file: await legacyModel.exportData({ password: pw }) };
      ctx.redirect('/legacy');
    } catch (error) { ctx.status = 500; ctx.body = { error: `Error: ${error.message}` }; ctx.redirect('/legacy'); }
  })
  .post('/legacy/import', koaBody({ 
    multipart: true, 
    formidable: { 
      keepExtensions: true, 
      uploadDir: '/tmp', 
      } 
    }), async (ctx) => {
    const uploadedFile = ctx.request.files?.uploadedFile, pw = ctx.request.body.importPassword;
    if (!uploadedFile) { ctx.body = { error: 'No file uploaded' }; return ctx.redirect('/legacy'); }
    if (!pw || pw.length < 32) { ctx.body = { error: 'Password is too short or missing.' }; return ctx.redirect('/legacy'); }
    try {
      await legacyModel.importData({ filePath: uploadedFile.filepath, password: pw });
      ctx.body = { message: 'Data imported successfully!' };
      ctx.redirect('/legacy');
    } catch (error) { ctx.body = { error: error.message }; ctx.redirect('/legacy'); }
  })
  .post('/trending/:contentId/:category', async (ctx) => {
    const { contentId, category } = ctx.params, voterId = SSBconfig?.keys?.id;
    if ((await trendingModel.getMessageById(contentId))?.content?.opinions_inhabitants?.includes(voterId)) {
      ctx.flash = { message: 'You have already opined.' }; return ctx.redirect('/trending');
    }
    await trendingModel.createVote(contentId, category); ctx.redirect('/trending');
  })
  .post('/opinions/:contentId/:category', async (ctx) => {
    const { contentId, category } = ctx.params, voterId = SSBconfig?.keys?.id;
    if ((await opinionsModel.getMessageById(contentId))?.content?.opinions_inhabitants?.includes(voterId)) {
      ctx.flash = { message: 'You have already opined.' }; return ctx.redirect('/opinions');
    }
    await opinionsModel.createVote(contentId, category); ctx.redirect('/opinions');
  })
  .post('/agenda/discard/:itemId', async (ctx) => {
    await agendaModel.discardItem(ctx.params.itemId); ctx.redirect('/agenda');
  })
  .post('/agenda/restore/:itemId', async (ctx) => {
    await agendaModel.restoreItem(ctx.params.itemId); ctx.redirect('/agenda?filter=discarded');
  })
  .post("/feed/create", koaBody(), async (ctx) => {
    await feedModel.createFeed(ctx.request.body?.text != null ? String(ctx.request.body.text) : "");
    ctx.redirect(ctx.get("Referer") || "/feed");
  })
  .post("/feed/opinions/:feedId/:category", async (ctx) => {
    const { feedId, category } = ctx.params;
    await feedModel.addOpinion(feedId, category);
    ctx.redirect(ctx.get("Referer") || "/feed");
  })
  .post("/feed/refeed/:id", koaBody(), async (ctx) => {
    await feedModel.createRefeed(ctx.params.id);
    ctx.redirect(ctx.get("Referer") || "/feed");
  })
  .post("/bookmarks/create", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    await bookmarksModel.createBookmark(b.url, b.tags, b.description, b.category, b.lastVisit);
    ctx.redirect(safeReturnTo(ctx, '/bookmarks?filter=all', ['/bookmarks']));
  })
  .post("/bookmarks/update/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    await bookmarksModel.updateBookmarkById(ctx.params.id, { url: b.url, tags: b.tags, description: b.description, category: b.category, lastVisit: b.lastVisit });
    ctx.redirect(safeReturnTo(ctx, '/bookmarks?filter=mine', ['/bookmarks']));
  })
  .post("/bookmarks/delete/:id", koaBody(), async ctx => deleteAction(ctx, 'bookmarks'))
  .post("/bookmarks/opinions/:bookmarkId/:category", koaBody(), async ctx => opinionAction(ctx, 'bookmarks', 'bookmarkId'))
  .post("/bookmarks/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'bookmarks', 'add'))
  .post("/bookmarks/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'bookmarks', 'remove'))
  .post("/bookmarks/:bookmarkId/comments", koaBody(), async ctx => commentAction(ctx, 'bookmarks', 'bookmarkId'))
  .post("/images/create", koaBody({ multipart: true }), async (ctx) => {
    if (!checkMod(ctx, 'imagesMod')) { ctx.redirect('/modules'); return; }
    const blob = await handleBlobUpload(ctx, 'image'), b = ctx.request.body;
    await imagesModel.createImage(blob, b.tags, b.title, b.description, parseBool01(b.meme));
    ctx.redirect(safeReturnTo(ctx, '/images?filter=all', ['/images']));
  })
  .post("/images/update/:id", koaBody({ multipart: true }), async (ctx) => {
    if (!checkMod(ctx, 'imagesMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, blob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    await imagesModel.updateImageById(ctx.params.id, blob, b.tags, b.title, b.description, parseBool01(b.meme));
    ctx.redirect(safeReturnTo(ctx, '/images?filter=mine', ['/images']));
  })
  .post("/images/delete/:id", koaBody(), async ctx => deleteAction(ctx, 'images'))
  .post("/images/opinions/:imageId/:category", koaBody(), async ctx => opinionAction(ctx, 'images', 'imageId'))
  .post("/images/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'images', 'add'))
  .post("/images/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'images', 'remove'))
  .post("/images/:imageId/comments", koaBody(), async ctx => commentAction(ctx, 'images', 'imageId'))
  .post("/audios/create", koaBody({ multipart: true }), async ctx => mediaCreateAction(ctx, 'audios'))
  .post("/audios/update/:id", koaBody({ multipart: true }), async ctx => mediaUpdateAction(ctx, 'audios'))
  .post("/audios/delete/:id", koaBody(), async ctx => deleteAction(ctx, 'audios'))
  .post("/audios/opinions/:audioId/:category", koaBody(), async ctx => opinionAction(ctx, 'audios', 'audioId'))
  .post("/audios/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'audios', 'add'))
  .post("/audios/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'audios', 'remove'))
  .post("/audios/:audioId/comments", koaBody(), async ctx => commentAction(ctx, 'audios', 'audioId'))
  .post("/videos/create", koaBody({ multipart: true }), async ctx => mediaCreateAction(ctx, 'videos'))
  .post("/videos/update/:id", koaBody({ multipart: true }), async ctx => mediaUpdateAction(ctx, 'videos'))
  .post("/videos/delete/:id", koaBody(), async ctx => deleteAction(ctx, 'videos'))
  .post("/videos/opinions/:videoId/:category", koaBody(), async ctx => opinionAction(ctx, 'videos', 'videoId'))
  .post("/videos/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'videos', 'add'))
  .post("/videos/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'videos', 'remove'))
  .post("/videos/:videoId/comments", koaBody(), async ctx => commentAction(ctx, 'videos', 'videoId'))
  .post("/documents/create", koaBody({ multipart: true }), async (ctx) => {
    const docBlob = await handleBlobUpload(ctx, "document"), b = ctx.request.body;
    await documentsModel.createDocument(docBlob, b.tags, b.title, b.description);
    ctx.redirect(safeReturnTo(ctx, "/documents?filter=all", ["/documents"]));
  })
  .post("/documents/update/:id", koaBody({ multipart: true }), async (ctx) => {
    const b = ctx.request.body, blob = ctx.request.files?.document ? await handleBlobUpload(ctx, "document") : null;
    await documentsModel.updateDocumentById(ctx.params.id, blob, b.tags, b.title, b.description);
    ctx.redirect(safeReturnTo(ctx, "/documents?filter=mine", ["/documents"]));
  })
  .post("/documents/delete/:id", koaBody(), async ctx => deleteAction(ctx, 'documents'))
  .post("/documents/opinions/:documentId/:category", koaBody(), async ctx => opinionAction(ctx, 'documents', 'documentId'))
  .post("/documents/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'documents', 'add'))
  .post("/documents/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'documents', 'remove'))
  .post("/documents/:documentId/comments", koaBody(), async ctx => commentAction(ctx, 'documents', 'documentId'))
  .post('/cv/upload', koaBody({ multipart: true }), async ctx => {
    const photoUrl = await handleBlobUpload(ctx, 'image')
    await cvModel.createCV(ctx.request.body, photoUrl)
    ctx.redirect('/cv')
  })
  .post('/cv/update/:id', koaBody({ multipart: true }), async ctx => {
    const photoUrl = await handleBlobUpload(ctx, 'image')
    await cvModel.updateCV(ctx.params.id, ctx.request.body, photoUrl)
    ctx.redirect('/cv')
  })
  .post('/cv/delete/:id', async ctx => {
    await cvModel.deleteCVById(ctx.params.id)
    ctx.redirect('/cv')
  })
  .post('/cipher/encrypt', koaBody(), async (ctx) => {
    const { text, password } = ctx.request.body;
    if (password.length < 32) { ctx.body = { error: 'Password is too short or missing.' }; return ctx.redirect('/cipher'); }
    const { encryptedText, iv } = cipherModel.encryptData(text, password);
    ctx.body = await cipherView(encryptedText, "", iv, password);
  })
  .post('/cipher/decrypt', koaBody(), async (ctx) => {
    const { encryptedText, password } = ctx.request.body;
    if (password.length < 32) { ctx.body = { error: 'Password is too short or missing.' }; return ctx.redirect('/cipher'); }
    ctx.body = await cipherView("", cipherModel.decryptData(encryptedText, password), "", password);
  }) 
  .post('/tribes/create', koaBody({ multipart: true }), async ctx => {
    const b = ctx.request.body;
    if (b.isLARP === 'true' || b.isLARP === true) { ctx.status = 400; ctx.body = { error: "L.A.R.P. tribes cannot be created." }; return; }
    const image = await handleBlobUpload(ctx, 'image');
    await tribesModel.createTribe(b.title, b.description, image, b.location, b.tags, b.isLARP === 'true', b.isAnonymous === 'true', b.inviteMode);
    ctx.redirect('/tribes');
  })
  .post('/tribes/update/:id', koaBody({ multipart: true }), async ctx => {
    const b = ctx.request.body;
    if (b.isLARP === 'true' || b.isLARP === true) { ctx.status = 400; ctx.body = { error: "L.A.R.P. tribes cannot be updated." }; return; }
    const tags = b.tags ? b.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    await tribesModel.updateTribeById(ctx.params.id, { title: b.title, description: b.description, image: await handleBlobUpload(ctx, 'image'), location: b.location, tags, isLARP: b.isLARP === 'true', isAnonymous: b.isAnonymous === 'true', inviteMode: b.inviteMode });
    ctx.redirect('/tribes?filter=mine');
  })
  .post('/tribes/delete/:id', async ctx => {
    await tribesModel.deleteTribeById(ctx.params.id)
    ctx.redirect('/tribes?filter=mine')
  })
  .post('/tribes/generate-invite', koaBody(), async ctx => {
    ctx.body = await renderInvitePage(await tribesModel.generateInvite(ctx.request.body.tribeId));
  })
  .post('/tribes/join-code', koaBody(), async ctx => {
    await tribesModel.joinByInvite(ctx.request.body.inviteCode)
    ctx.redirect('/tribes?filter=membership')
  })
  .post('/tribes/leave/:id', koaBody(), async ctx => {
    await tribesModel.leaveTribe(ctx.params.id)
    ctx.redirect('/tribes?filter=membership')
  })
  .post('/tribes/:id/message', koaBody(), async ctx => {
    await tribesModel.postMessage(ctx.params.id, ctx.request.body.message);
    ctx.redirect(ctx.headers.referer); 
  })
  .post('/tribes/:id/refeed/:msgId', koaBody(), async ctx => {
    await tribesModel.refeed(ctx.params.id, ctx.params.msgId);
    ctx.redirect(ctx.headers.referer); 
  })
  .post('/tribe/:id/message', koaBody(), async ctx => {
    await tribesModel.postMessage(ctx.params.id, ctx.request.body.message);
    ctx.redirect('/tribes?filter=mine')
  })
  .post('/panic/remove', koaBody(), async (ctx) => {
    const { exec } = require('child_process');
    try {
      await panicmodeModel.removeSSB();
      ctx.body = { message: 'Your blockchain has been succesfully deleted!' };
      exec('pkill -f "node SSB_server.js start"');
      setTimeout(() => process.exit(0), 1000);
    } catch (error) { ctx.body = { error: 'Error deleting your blockchain: ' + error.message }; }
  })
  .post('/export/create', async (ctx) => {
    try {
      const outputPath = path.join(os.homedir(), 'ssb_exported.zip');
      await exportmodeModel.exportSSB(outputPath);
      ctx.set('Content-Type', 'application/zip');
      ctx.set('Content-Disposition', `attachment; filename=ssb_exported.zip`);
      ctx.body = fs.createReadStream(outputPath);
      ctx.res.on('finish', () => fs.unlinkSync(outputPath));
    } catch (error) { ctx.body = { error: 'Error exporting your blockchain: ' + error.message }; }
  })
  .post('/tasks/create', koaBody(), async ctx => {
    const b = ctx.request.body;
    await tasksModel.createTask(b.title, b.description, b.startTime, b.endTime, b.priority, b.location, b.tags, b.isPublic);
    ctx.redirect(safeReturnTo(ctx, '/tasks?filter=mine', ['/tasks']));
  })
  .post('/tasks/update/:id', koaBody(), async ctx => {
    const b = ctx.request.body, tags = Array.isArray(b.tags) ? b.tags.filter(Boolean) : (typeof b.tags === 'string' ? b.tags.split(',').map(t => t.trim()).filter(Boolean) : []);
    await tasksModel.updateTaskById(ctx.params.id, { title: b.title, description: b.description, startTime: b.startTime, endTime: b.endTime, priority: b.priority, location: b.location, tags, isPublic: b.isPublic });
    ctx.redirect(safeReturnTo(ctx, '/tasks?filter=mine', ['/tasks']));
  })
  .post('/tasks/assign/:id', koaBody(), async ctx => {
    await tasksModel.toggleAssignee(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/tasks', ['/tasks']));
  })
  .post('/tasks/delete/:id', koaBody(), async ctx => {
    await tasksModel.deleteTaskById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/tasks?filter=mine', ['/tasks']));
  })
  .post('/tasks/status/:id', koaBody(), async ctx => {
    await tasksModel.updateTaskStatus(ctx.params.id, ctx.request.body.status);
    ctx.redirect(safeReturnTo(ctx, '/tasks?filter=mine', ['/tasks']));
  })
  .post('/tasks/:taskId/comments', koaBody(), async ctx => commentAction(ctx, 'tasks', 'taskId'))
  .post('/reports/create', koaBody({ multipart: true }), async ctx => {
    const b = ctx.request.body, image = await handleBlobUpload(ctx, 'image');
    await reportsModel.createReport(b.title, b.description, b.category, image, b.tags, b.severity, {
      stepsToReproduce: b.stepsToReproduce, expectedBehavior: b.expectedBehavior, actualBehavior: b.actualBehavior, environment: b.environment, reproduceRate: b.reproduceRate,
      problemStatement: b.problemStatement, userStory: b.userStory, acceptanceCriteria: b.acceptanceCriteria,
      whatHappened: b.whatHappened, reportedUser: b.reportedUser, evidenceLinks: b.evidenceLinks,
      contentLocation: b.contentLocation, whyInappropriate: b.whyInappropriate, requestedAction: b.requestedAction
    });
    ctx.redirect('/reports');
  })
  .post('/reports/update/:id', koaBody({ multipart: true }), async ctx => {
    const b = ctx.request.body, image = await handleBlobUpload(ctx, 'image');
    await reportsModel.updateReportById(ctx.params.id, {
      title: b.title, description: b.description, category: b.category, image, tags: b.tags, severity: b.severity,
      template: {
        stepsToReproduce: b.stepsToReproduce, expectedBehavior: b.expectedBehavior, actualBehavior: b.actualBehavior, environment: b.environment, reproduceRate: b.reproduceRate,
        problemStatement: b.problemStatement, userStory: b.userStory, acceptanceCriteria: b.acceptanceCriteria,
        whatHappened: b.whatHappened, reportedUser: b.reportedUser, evidenceLinks: b.evidenceLinks,
        contentLocation: b.contentLocation, whyInappropriate: b.whyInappropriate, requestedAction: b.requestedAction
      }
    });
    ctx.redirect('/reports?filter=mine');
  })
  .post('/reports/delete/:id', async ctx => {
    await reportsModel.deleteReportById(ctx.params.id);
    ctx.redirect('/reports?filter=mine');
  })
  .post('/reports/confirm/:id', async ctx => {
    await reportsModel.confirmReportById(ctx.params.id);
    ctx.redirect('/reports');
  })
  .post('/reports/status/:id', koaBody(), async ctx => {
    await reportsModel.updateReportById(ctx.params.id, { status: ctx.request.body.status });
    ctx.redirect('/reports?filter=mine');
  })
  .post('/reports/:reportId/comments', koaBody(), async ctx => commentAction(ctx, 'reports', 'reportId'))
  .post('/events/create', koaBody(), async (ctx) => {
    const b = ctx.request.body;
    await eventsModel.createEvent(b.title, b.description, b.date, b.location, b.price, b.url, b.attendees || [], b.tags, b.isPublic);
    ctx.redirect(safeReturnTo(ctx, '/events?filter=mine', ['/events'])); 
  })
  .post('/events/update/:id', koaBody(), async (ctx) => {
    const b = ctx.request.body, existing = await eventsModel.getEventById(ctx.params.id);
    await eventsModel.updateEventById(ctx.params.id, { title: b.title, description: b.description, date: b.date, location: b.location, price: b.price, url: b.url, attendees: b.attendees, tags: b.tags, isPublic: b.isPublic, createdAt: existing.createdAt, organizer: existing.organizer });
    ctx.redirect(safeReturnTo(ctx, '/events?filter=mine', ['/events']));
  })
  .post('/events/attend/:id', koaBody(), async ctx => {
    await eventsModel.toggleAttendee(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/events', ['/events']));
  })
  .post('/events/delete/:id', koaBody(), async ctx => {
    await eventsModel.deleteEventById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/events?filter=mine', ['/events']));
  })
  .post('/events/:eventId/comments', koaBody(), async ctx => commentAction(ctx, 'events', 'eventId'))
  .post('/votes/create', koaBody(), async ctx => {
    const b = ctx.request.body, defaultOptions = ['YES', 'NO', 'ABSTENTION', 'CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'];
    const parsedOptions = b.options ? b.options.split(',').map(o => o.trim()).filter(Boolean) : defaultOptions;
    await votesModel.createVote(b.question, b.deadline, parsedOptions, String(b.tags || '').split(',').map(t => t.trim()).filter(Boolean));
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=mine', ['/votes']));
  })
  .post('/votes/update/:id', koaBody(), async ctx => {
    const b = ctx.request.body, parsedOptions = b.options ? b.options.split(',').map(o => o.trim()).filter(Boolean) : undefined;
    await votesModel.updateVoteById(ctx.params.id, { question: b.question, deadline: b.deadline, options: parsedOptions, tags: b.tags ? b.tags.split(',').map(t => t.trim()).filter(Boolean) : [] });
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=mine', ['/votes']));
  })
  .post('/votes/delete/:id', koaBody(), async ctx => {
    await votesModel.deleteVoteById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=mine', ['/votes']));
  })
  .post('/votes/vote/:id', koaBody(), async ctx => {
    await votesModel.voteOnVote(ctx.params.id, ctx.request.body.choice);
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=open', ['/votes']));
  })
  .post('/votes/opinions/:voteId/:category', koaBody(), async ctx => {
    try { await votesModel.createOpinion(ctx.params.voteId, ctx.params.category); } 
    catch (e) { if (!/already/i.test(String(e?.message || ''))) throw e; ctx.flash = { message: "You have already opined." }; }
    ctx.redirect(safeReturnTo(ctx, '/votes', ['/votes']));
  })
  .post('/votes/:voteId/comments', koaBody(), async ctx => commentAction(ctx, 'votes', 'voteId'))
  .post('/parliament/candidatures/propose', koaBody(), async (ctx) => {
    const b = ctx.request.body || {}, id = String(b.candidateId || '').trim(), m = String(b.method || '').trim().toUpperCase();
    if (!id) ctx.throw(400, 'Candidate is required.');
    if (!new Set(['DEMOCRACY','MAJORITY','MINORITY','DICTATORSHIP','KARMATOCRACY']).has(m)) ctx.throw(400, 'Invalid method.');
    await parliamentModel.proposeCandidature({ candidateId: id, method: m }).catch(e => ctx.throw(400, String(e?.message || e)));
    ctx.redirect('/parliament?filter=candidatures');
  })
  .post('/parliament/candidatures/:id/vote', koaBody(), async (ctx) => {
    await parliamentModel.voteCandidature(ctx.params.id).catch(e => ctx.throw(400, String(e?.message || e)));
    ctx.redirect('/parliament?filter=candidatures');
  })
  .post('/parliament/proposals/create', koaBody(), async (ctx) => {
    const b = ctx.request.body || {}, t = String(b.title || '').trim(), d = String(b.description || '').trim();
    if (!t) ctx.throw(400, 'Title is required.');
    if (d.length > 1000) ctx.throw(400, 'Description must be ≤ 1000 chars.');
    await parliamentModel.createProposal({ title: t, description: d }).catch(e => ctx.throw(400, String(e?.message || e)));
    ctx.redirect('/parliament?filter=proposals');
  })
  .post('/parliament/proposals/close/:id', koaBody(), async (ctx) => {
    await parliamentModel.closeProposal(ctx.params.id).catch(e => ctx.throw(400, String(e?.message || e)));
    ctx.redirect('/parliament?filter=proposals');
  })
  .post('/parliament/resolve', koaBody(), async (ctx) => {
    await ensureTerm();
    ctx.redirect('/parliament?filter=government');
  })
  .post('/parliament/revocations/create', koaBody(), async (ctx) => {
    const b = ctx.request.body || {}, rawLawId = Array.isArray(b.lawId) ? b.lawId[0] : (b.lawId ?? b['lawId[]'] ?? b.law_id ?? '');
    const lawId = String(rawLawId || '').trim();
    if (!lawId) ctx.throw(400, 'Law required');
    await parliamentModel.createRevocation({ lawId, title: b.title, reasons: b.reasons });
    ctx.redirect('/parliament?filter=revocations');
  })
  .post('/courts/cases/create', koaBody(), async (ctx) => {
    const b = ctx.request.body || {}, titleSuffix = String(b.titleSuffix || '').trim(), titlePreset = String(b.titlePreset || '').trim();
    const respondent = String(b.respondentId || '').trim(), method = String(b.method || '').trim().toUpperCase();
    if (!titleSuffix && !titlePreset) { ctx.flash = { message: 'Title is required.' }; return ctx.redirect('/courts?filter=cases'); }
    if (!respondent) { ctx.flash = { message: 'Accused / Respondent is required.' }; return ctx.redirect('/courts?filter=cases'); }
    if (!new Set(['JUDGE','DICTATOR','POPULAR','MEDIATION','KARMATOCRACY']).has(method)) { ctx.flash = { message: 'Invalid resolution method.' }; return ctx.redirect('/courts?filter=cases'); }
    try { await courtsModel.openCase({ titleBase: [titlePreset, titleSuffix].filter(Boolean).join(' - '), respondentInput: respondent, method }); }
    catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect('/courts?filter=mycases');
  })
  .post('/courts/cases/:id/evidence/add', koaBody({ multipart: true }), async (ctx) => {
    const caseId = ctx.params.id, b = ctx.request.body || {};
    if (!caseId) { ctx.flash = { message: 'Case not found.' }; return ctx.redirect('/courts?filter=cases'); }
    try { await courtsModel.addEvidence({ caseId, text: String(b.text || ''), link: String(b.link || ''), imageMarkdown: ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null }); }
    catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/answer', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, b = ctx.request.body || {}, answer = String(b.answer || ''), stance = String(b.stance || '').toUpperCase();
    if (!caseId) { ctx.flash = { message: 'Case not found.' }; return ctx.redirect('/courts?filter=cases'); }
    if (!answer) { ctx.flash = { message: 'Response brief is required.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    if (!new Set(['DENY','ADMIT','PARTIAL']).has(stance)) { ctx.flash = { message: 'Invalid stance.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.answerCase({ caseId, stance, text: answer }); } catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/decide', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, b = ctx.request.body || {}, result = String(b.outcome || '').trim(), orders = String(b.orders || '');
    if (!caseId) { ctx.flash = { message: 'Case not found.' }; return ctx.redirect('/courts?filter=cases'); }
    if (!result) { ctx.flash = { message: 'Result is required.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.issueVerdict({ caseId, result, orders }); } catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/settlements/propose', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, terms = String(ctx.request.body?.terms || '');
    if (!caseId) { ctx.flash = { message: 'Case not found.' }; return ctx.redirect('/courts?filter=cases'); }
    if (!terms) { ctx.flash = { message: 'Terms are required.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.proposeSettlement({ caseId, terms }); } catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/settlements/accept', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    if (!caseId) { ctx.flash = { message: 'Case not found.' }; return ctx.redirect('/courts?filter=cases'); }
    try { await courtsModel.acceptSettlement({ caseId }); } catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/mediators/accuser', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, mediators = String(ctx.request.body?.mediators || '').split(',').map(s => s.trim()).filter(Boolean);
    const uid = ctx.state?.user?.id;
    if (!caseId) { ctx.flash = { message: 'Case not found.' }; return ctx.redirect('/courts?filter=cases'); }
    if (!mediators.length) { ctx.flash = { message: 'At least one mediator is required.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    if (uid && mediators.includes(uid)) { ctx.flash = { message: 'You cannot appoint yourself as mediator.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.setMediators({ caseId, side: 'accuser', mediators }); } catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/mediators/respondent', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, mediators = String(ctx.request.body?.mediators || '').split(',').map(s => s.trim()).filter(Boolean);
    const uid = ctx.state?.user?.id;
    if (!caseId) { ctx.flash = { message: 'Case not found.' }; return ctx.redirect('/courts?filter=cases'); }
    if (!mediators.length) { ctx.flash = { message: 'At least one mediator is required.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    if (uid && mediators.includes(uid)) { ctx.flash = { message: 'You cannot appoint yourself as mediator.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.setMediators({ caseId, side: 'respondent', mediators }); } catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/judge', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, judgeId = String(ctx.request.body?.judgeId || '').trim(), uid = ctx.state?.user?.id;
    if (!caseId) { ctx.flash = { message: 'Case not found.' }; return ctx.redirect('/courts?filter=cases'); }
    if (!judgeId) { ctx.flash = { message: 'Judge is required.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    if (uid && judgeId === uid) { ctx.flash = { message: 'You cannot assign yourself as judge.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.assignJudge({ caseId, judgeId }); } catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/public', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, pref = String(ctx.request.body?.preference || '').toUpperCase();
    if (!caseId) { ctx.flash = { message: 'Case not found.' }; return ctx.redirect('/courts?filter=cases'); }
    if (pref !== 'YES' && pref !== 'NO') { ctx.flash = { message: 'Invalid visibility preference.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.setPublicPreference({ caseId, preference: pref === 'YES' }); } catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/openVote', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    if (!caseId) { ctx.flash = { message: 'Case not found.' }; return ctx.redirect('/courts?filter=cases'); }
    try { await courtsModel.openPopularVote({ caseId }); } catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/judges/nominate', koaBody(), async (ctx) => {
    const judgeId = String(ctx.request.body?.judgeId || '').trim();
    if (!judgeId) { ctx.flash = { message: 'Judge is required.' }; return ctx.redirect('/courts?filter=judges'); }
    try { await courtsModel.nominateJudge({ judgeId }); } catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect('/courts?filter=judges');
  })
  .post('/courts/judges/:id/vote', koaBody(), async (ctx) => {
    if (!ctx.params.id) { ctx.flash = { message: 'Nomination not found.' }; return ctx.redirect('/courts?filter=judges'); }
    try { await courtsModel.voteNomination(ctx.params.id); } catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect('/courts?filter=judges');
  })  
  .post("/market/create", koaBody({ multipart: true }), async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, image = await handleBlobUpload(ctx, "image"), parsedStock = parseInt(String(b.stock || "0"), 10);
    if (!parsedStock || parsedStock <= 0) ctx.throw(400, "Stock must be a positive number.");
    const pickLast = v => Array.isArray(v) ? v[v.length - 1] : v, shpVal = pickLast(b.includesShipping);
    await marketModel.createItem(b.item_type, b.title, b.description, image, b.price, b.tags, b.item_status, b.deadline, shpVal === "1" || shpVal === "on" || shpVal === true || shpVal === "true", parsedStock);
    ctx.redirect(safeReturnTo(ctx, "/market", ["/market"]));
  })
  .post("/market/update/:id", koaBody({ multipart: true }), async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, parsedStock = parseInt(String(b.stock || "0"), 10);
    if (parsedStock < 0) ctx.throw(400, "Stock cannot be negative.");
    const pickLast = v => Array.isArray(v) ? v[v.length - 1] : v, shpVal = pickLast(b.includesShipping);
    const updatedData = { item_type: b.item_type, title: b.title, description: b.description, price: b.price, item_status: b.item_status, deadline: b.deadline, includesShipping: shpVal === "1" || shpVal === "on" || shpVal === true || shpVal === "true", tags: String(b.tags || "").split(",").map(t => t.trim()).filter(Boolean), stock: parsedStock };
    const image = await handleBlobUpload(ctx, "image");
    if (image) updatedData.image = image;
    await marketModel.updateItemById(ctx.params.id, updatedData);
    ctx.redirect(safeReturnTo(ctx, "/market?filter=mine", ["/market"]));
  })
  .post("/market/delete/:id", koaBody(), async ctx => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    await marketModel.deleteItemById(ctx.params.id)
    ctx.redirect(safeReturnTo(ctx, "/market?filter=mine", ["/market"]))
  })
  .post("/market/sold/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const item = await marketModel.getItemById(ctx.params.id);
    if (!item) ctx.throw(404, "Item not found");
    if (Number(item.stock || 0) <= 0) ctx.throw(400, "No stock left to mark as sold.");
    if (item.status !== "SOLD") { await marketModel.setItemAsSold(ctx.params.id); await marketModel.decrementStock(ctx.params.id); }
    ctx.redirect(safeReturnTo(ctx, "/market?filter=mine", ["/market"]));
  })
  .post("/market/buy/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const item = await marketModel.getItemById(ctx.params.id);
    if (!item) ctx.throw(404, "Item not found");
    if (item.item_type === "exchange" && item.status !== "SOLD") {
      await pmModel.sendMessage([item.seller], "MARKET_SOLD", `item "${item.title}" has been sold -> /market/${ctx.params.id}  OASIS ID: ${getViewerId()}  for: ${item.price} ECO`);
      await marketModel.setItemAsSold(ctx.params.id);
    } else await marketModel.decrementStock(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, "/inbox?filter=sent", ["/inbox", "/market"]));
  })
  .post("/market/status/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const desired = String(ctx.request.body.status || "").toUpperCase().replace(/_/g, " ").replace(/\s+/g, " ").trim();
    if (!["FOR SALE", "SOLD", "DISCARDED"].includes(desired)) ctx.throw(400, "Invalid status.");
    const item = await marketModel.getItemById(ctx.params.id);
    if (!item) ctx.throw(404, "Item not found");
    const cur = String(item.status || "").toUpperCase().replace(/\s+/g, " ").trim();
    if (cur !== "SOLD" && cur !== "DISCARDED" && desired !== cur && desired !== "FOR SALE") {
      if (desired === "SOLD") {
        if (Number(item.stock || 0) <= 0) ctx.throw(400, "No stock left to mark as sold.");
        await marketModel.setItemAsSold(ctx.params.id); await marketModel.decrementStock(ctx.params.id);
      } else if (desired === "DISCARDED") await marketModel.updateItemById(ctx.params.id, { status: "DISCARDED", stock: 0 });
    }
    ctx.redirect(safeReturnTo(ctx, "/market?filter=mine", ["/market"]));
  })
  .post("/market/bid/:id", koaBody(), async ctx => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    await marketModel.addBidToAuction(ctx.params.id, getViewerId(), ctx.request.body.bidAmount)
    ctx.redirect(safeReturnTo(ctx, "/market?filter=auctions", ["/market"]))
  })
  .post("/market/:itemId/comments", koaBody(), async ctx => commentAction(ctx, 'market', 'itemId'))
  .post('/jobs/create', koaBody({ multipart: true }), async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    await jobsModel.createJob({ job_type: b.job_type, title: b.title, description: b.description, requirements: b.requirements, languages: b.languages, job_time: b.job_time, tasks: b.tasks, location: b.location, vacants: b.vacants ? parseInt(b.vacants, 10) : 1, salary: b.salary != null && b.salary !== '' ? parseFloat(String(b.salary).replace(',', '.')) : 0, tags: b.tags, image: imageBlob });
    ctx.redirect(safeReturnTo(ctx, '/jobs?filter=MINE', ['/jobs']));
  })
  .post('/jobs/update/:id', koaBody({ multipart: true }), async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : undefined;
    const patch = { job_type: b.job_type, title: b.title, description: b.description, requirements: b.requirements, languages: b.languages, job_time: b.job_time, tasks: b.tasks, location: b.location, tags: b.tags };
    if (b.vacants !== undefined && b.vacants !== '') patch.vacants = parseInt(b.vacants, 10);
    if (b.salary !== undefined && b.salary !== '') patch.salary = parseFloat(String(b.salary).replace(',', '.'));
    if (imageBlob !== undefined) patch.image = imageBlob;
    await jobsModel.updateJob(ctx.params.id, patch);
    ctx.redirect(safeReturnTo(ctx, '/jobs?filter=MINE', ['/jobs']));
  })
  .post('/jobs/delete/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    await jobsModel.deleteJob(ctx.params.id)
    ctx.redirect(safeReturnTo(ctx, '/jobs?filter=MINE', ['/jobs']))
  })
  .post('/jobs/status/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    await jobsModel.updateJobStatus(ctx.params.id, String(ctx.request.body.status).toUpperCase())
    ctx.redirect(safeReturnTo(ctx, '/jobs?filter=MINE', ['/jobs']))
  })
  .post('/jobs/subscribe/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    const userId = getViewerId(), job = await jobsModel.getJobById(ctx.params.id, userId);
    await jobsModel.subscribeToJob(ctx.params.id, userId);
    await pmModel.sendMessage([job.author], 'JOB_SUBSCRIBED', `has subscribed to your job offer "${job.title || ''}" -> /jobs/${encodeURIComponent(job.id)}`);
    ctx.redirect(safeReturnTo(ctx, '/jobs', ['/jobs']));
  })
  .post('/jobs/unsubscribe/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    const userId = getViewerId(), job = await jobsModel.getJobById(ctx.params.id, userId);
    await jobsModel.unsubscribeFromJob(ctx.params.id, userId);
    await pmModel.sendMessage([job.author], 'JOB_UNSUBSCRIBED', `has unsubscribed from your job offer "${job.title || ''}" -> /jobs/${encodeURIComponent(job.id)}`);
    ctx.redirect(safeReturnTo(ctx, '/jobs', ['/jobs']));
  })
  .post('/jobs/:jobId/comments', koaBody(), async ctx => commentAction(ctx, 'jobs', 'jobId'))
  .post("/projects/create", koaBody({ multipart: true }), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {}, image = ctx.request.files?.image ? await handleBlobUpload(ctx, "image") : null;
    const bounties = b.bountiesInput ? String(b.bountiesInput).split("\n").filter(Boolean).map(l => { const [t,a,d] = String(l).split("|"); return { title: String(t||"").trim(), amount: parseFloat(a||0)||0, description: String(d||"").trim(), milestoneIndex: null }; }) : [];
    await projectsModel.createProject({ title: b.title, description: b.description, goal: b.goal != null && b.goal !== "" ? parseFloat(b.goal) : 0, deadline: b.deadline ? new Date(b.deadline).toISOString() : null, progress: b.progress != null && b.progress !== "" ? parseInt(b.progress,10) : 0, bounties, image, milestoneTitle: b.milestoneTitle, milestoneDescription: b.milestoneDescription, milestoneTargetPercent: b.milestoneTargetPercent, milestoneDueDate: b.milestoneDueDate });
    ctx.redirect(safeReturnTo(ctx, "/projects?filter=MINE", ["/projects"]));
  })
  .post("/projects/update/:id", koaBody({ multipart: true }), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = await projectsModel.getProjectTipId(ctx.params.id), b = ctx.request.body || {};
    const image = ctx.request.files?.image ? await handleBlobUpload(ctx, "image") : undefined;
    const bounties = b.bountiesInput !== undefined ? String(b.bountiesInput).split("\n").filter(Boolean).map(l => { const [t,a,d] = String(l).split("|"); return { title: String(t||"").trim(), amount: parseFloat(a||0)||0, description: String(d||"").trim(), milestoneIndex: null }; }) : undefined;
    await projectsModel.updateProject(id, { title: b.title, description: b.description, goal: b.goal !== "" && b.goal != null ? parseFloat(b.goal) : undefined, deadline: b.deadline ? new Date(b.deadline).toISOString() : undefined, progress: b.progress !== "" && b.progress != null ? parseInt(b.progress,10) : undefined, bounties, image });
    ctx.redirect(safeReturnTo(ctx, "/projects?filter=MINE", ["/projects"]));
  })
  .post("/projects/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    await projectsModel.deleteProject(await projectsModel.getProjectTipId(ctx.params.id));
    ctx.redirect(safeReturnTo(ctx, "/projects?filter=MINE", ["/projects"]));
  })
  .post("/projects/status/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = await projectsModel.getProjectTipId(ctx.params.id);
    await projectsModel.updateProjectStatus(id, String(ctx.request.body?.status || "").toUpperCase());
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]));
  })
  .post("/projects/progress/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = await projectsModel.getProjectTipId(ctx.params.id);
    await projectsModel.updateProjectProgress(id, ctx.request.body?.progress);
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]));
  })
  .post("/projects/pledge/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const latestId = await projectsModel.getProjectTipId(ctx.params.id), b = ctx.request.body || {};
    const pledgeAmount = parseFloat(b.amount), uid = getViewerId();
    if (isNaN(pledgeAmount) || pledgeAmount <= 0) ctx.throw(400, "Invalid amount");
    const project = await projectsModel.getProjectById(latestId);
    if (String(project.status || "ACTIVE").toUpperCase() !== "ACTIVE") ctx.throw(400, "Project is not active");
    if (project.deadline && moment(project.deadline).isValid() && moment(project.deadline).isBefore(moment())) ctx.throw(400, "Project deadline passed");
    if (project.author === uid) ctx.throw(403, "Authors cannot pledge to their own project");
    let milestoneIndex = null, bountyIndex = null, mob = b.milestoneOrBounty || "";
    if (String(mob).startsWith("milestone:")) milestoneIndex = parseInt(String(mob).split(":")[1], 10);
    else if (String(mob).startsWith("bounty:")) bountyIndex = parseInt(String(mob).split(":")[1], 10);
    const transfer = await transfersModel.createTransfer(project.author, "Project Pledge", pledgeAmount, moment().add(14, "days").toISOString(), ["backer-pledge", `project:${latestId}`]);
    const backers = [...(project.backers || []), { userId: uid, amount: pledgeAmount, at: new Date().toISOString(), transferId: transfer.key || transfer.id, confirmed: false, milestoneIndex, bountyIndex }];
    const pledged = (parseFloat(project.pledged || 0) || 0) + pledgeAmount;
    await projectsModel.updateProject(latestId, { backers, pledged, progress: project.goal ? (pledged / parseFloat(project.goal)) * 100 : 0 });
    await pmModel.sendMessage([project.author], "PROJECT_PLEDGE", `has pledged ${pledgeAmount} ECO to your project "${project.title || ''}" -> /projects/${latestId}`);
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(latestId)}`, ["/projects"]));
  })
  .post("/projects/confirm-transfer/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId(), transfer = await transfersModel.getTransferById(ctx.params.id);
    if (transfer.to !== uid) ctx.throw(403, "Unauthorized action");
    const tagProject = (Array.isArray(transfer.tags) ? transfer.tags : []).find(t => String(t).startsWith("project:"));
    if (!tagProject) ctx.throw(400, "Missing project tag on transfer");
    const projectId = String(tagProject).split(":")[1];
    await transfersModel.confirmTransferById(ctx.params.id);
    const project = await projectsModel.getProjectById(projectId), backers = [...(project.backers || [])];
    const idx = backers.findIndex(b => b?.transferId === ctx.params.id);
    if (idx !== -1) backers[idx].confirmed = true;
    await projectsModel.updateProject(projectId, { backers, progress: project.goal ? (parseFloat(project.pledged || 0) / parseFloat(project.goal)) * 100 : 0 });
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(projectId)}`, ["/projects", "/transfers"]));
  })
  .post("/projects/follow/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const latestId = await projectsModel.getProjectTipId(ctx.params.id), project = await projectsModel.getProjectById(latestId);
    await projectsModel.followProject(ctx.params.id, getViewerId());
    await pmModel.sendMessage([project.author], "PROJECT_FOLLOWED", `has followed your project "${project.title || ''}" -> /projects/${latestId}`);
    ctx.redirect(safeReturnTo(ctx, "/projects", ["/projects"]));
  })
  .post("/projects/unfollow/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const latestId = await projectsModel.getProjectTipId(ctx.params.id), project = await projectsModel.getProjectById(latestId);
    await projectsModel.unfollowProject(ctx.params.id, getViewerId());
    await pmModel.sendMessage([project.author], "PROJECT_UNFOLLOWED", `has unfollowed your project "${project.title || ''}" -> /projects/${latestId}`);
    ctx.redirect(safeReturnTo(ctx, "/projects", ["/projects"]));
  })
  .post("/projects/milestones/add/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = await projectsModel.getProjectTipId(ctx.params.id), b = ctx.request.body || {};
    await projectsModel.addMilestone(id, { title: b.title, description: b.description || "", targetPercent: b.targetPercent != null && b.targetPercent !== "" ? parseInt(b.targetPercent, 10) : 0, dueDate: b.dueDate ? new Date(b.dueDate).toISOString() : null });
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]));
  })
  .post("/projects/milestones/update/:id/:index", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = await projectsModel.getProjectTipId(ctx.params.id), idx = parseInt(ctx.params.index, 10), b = ctx.request.body || {};
    const patch = { title: b.title, ...(b.description !== undefined ? { description: b.description } : {}), ...(b.targetPercent !== undefined && b.targetPercent !== "" ? { targetPercent: parseInt(b.targetPercent, 10) } : {}), ...(b.dueDate !== undefined ? { dueDate: b.dueDate ? new Date(b.dueDate).toISOString() : null } : {}), ...(b.done !== undefined ? { done: !!b.done } : {}) };
    await projectsModel.updateMilestone(id, idx, patch);
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]));
  })
  .post("/projects/milestones/complete/:id/:index", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = await projectsModel.getProjectTipId(ctx.params.id);
    await projectsModel.completeMilestone(id, parseInt(ctx.params.index, 10), getViewerId());
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]));
  })
  .post("/projects/bounties/add/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = await projectsModel.getProjectTipId(ctx.params.id), b = ctx.request.body || {};
    await projectsModel.addBounty(id, { title: b.title, amount: b.amount, description: b.description, milestoneIndex: b.milestoneIndex === "" || b.milestoneIndex === undefined ? null : parseInt(b.milestoneIndex, 10) });
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]));
  })
  .post("/projects/bounties/update/:id/:index", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = await projectsModel.getProjectTipId(ctx.params.id), idx = parseInt(ctx.params.index, 10), b = ctx.request.body || {};
    const patch = { ...(b.title !== undefined ? { title: b.title } : {}), ...(b.amount !== undefined && b.amount !== "" ? { amount: parseFloat(b.amount) } : {}), ...(b.description !== undefined ? { description: b.description } : {}), ...(b.milestoneIndex !== undefined ? { milestoneIndex: b.milestoneIndex === "" ? null : parseInt(b.milestoneIndex, 10) } : {}), ...(b.done !== undefined ? { done: !!b.done } : {}) };
    await projectsModel.updateBounty(id, idx, patch);
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]));
  })
  .post("/projects/bounties/claim/:id/:index", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = await projectsModel.getProjectTipId(ctx.params.id);
    await projectsModel.claimBounty(id, parseInt(ctx.params.index, 10), getViewerId());
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]));
  })
  .post("/projects/bounties/complete/:id/:index", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = await projectsModel.getProjectTipId(ctx.params.id);
    await projectsModel.completeBounty(id, parseInt(ctx.params.index, 10), getViewerId());
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]));
  })
  .post("/projects/:projectId/comments", koaBody(), async ctx => commentAction(ctx, 'projects', 'projectId'))
  .post("/banking/claim/:id", koaBody(), async (ctx) => {
    const userId = getViewerId(), allocation = await bankingModel.getAllocationById(ctx.params.id);
    if (!allocation) { ctx.body = { error: i18n.errorNoAllocation }; return; }
    if (allocation.to !== userId || allocation.status !== "UNCONFIRMED") { ctx.body = { error: i18n.errorInvalidClaim }; return; }
    const { url, user, pass } = getConfig().walletPub;
    const { txid } = await bankingModel.claimAllocation({ transferId: ctx.params.id, claimerId: userId, pubWalletUrl: url, pubWalletUser: user, pubWalletPass: pass });
    await bankingModel.updateAllocationStatus(ctx.params.id, "CLOSED", txid);
    await bankingModel.publishBankClaim({ amount: allocation.amount, epochId: allocation.epochId, allocationId: allocation.id, txid });
    ctx.redirect(`/banking?claimed=${encodeURIComponent(txid)}`);
  })
  .post("/banking/simulate", koaBody(), async (ctx) => {
    const { epochId, rules } = ctx.request.body || {};
    ctx.body = await bankingModel.computeEpoch({ epochId, rules });
  })
  .post("/banking/run", koaBody(), async (ctx) => {
    const { epochId, rules } = ctx.request.body || {};
    ctx.body = await bankingModel.executeEpoch({ epochId, rules });
  })
  .post("/banking/addresses", koaBody(), async (ctx) => {
    const b = ctx.request.body || {}, res = await bankingModel.addAddress({ userId: (b.userId || "").trim(), address: (b.address || "").trim() });
    ctx.redirect(`/banking?filter=addresses&msg=${encodeURIComponent(res.status)}`);
  })
  .post("/banking/addresses/delete", koaBody(), async (ctx) => {
    const res = await bankingModel.removeAddress({ userId: ((ctx.request.body?.userId) || "").trim() });
    ctx.redirect(`/banking?filter=addresses&msg=${encodeURIComponent(res.status)}`);
  })
  .post("/favorites/remove/:kind/:id", koaBody(), async (ctx) => {
    await favoritesModel.removeFavorite(ctx.params.kind, ctx.params.id);
    const fallback = `/favorites?filter=${encodeURIComponent(ctx.query.filter || "all")}`;
    ctx.redirect(safeReturnTo(ctx, fallback, ["/favorites"]));
  })
  .post("/update", koaBody(), async (ctx) => {
    const exec = require("node:util").promisify(require("node:child_process").exec);
    const { stdout, stderr } = await exec("git reset --hard && git pull");
    console.log("oasis@version: updating Oasis...", stdout, stderr);
    const { stdout: shOut, stderr: shErr } = await exec("sh install.sh");
    console.log("oasis@version: running install.sh...", shOut, shErr);
    ctx.redirect(new URL(ctx.request.header.referer).href);
  })  
  .post("/settings/theme", koaBody(), async (ctx) => {
    const theme = String(ctx.request.body.theme || "").trim(), cfg = getConfig();
    cfg.themes.current = theme || "Dark-SNH";
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    ctx.cookies.set("theme", cfg.themes.current);
    ctx.redirect("/settings");
  })
  .post("/language", koaBody(), async (ctx) => {
    ctx.cookies.set("language", String(ctx.request.body.language));
    ctx.redirect(new URL(ctx.request.header.referer).href);
  })
  .post("/settings/conn/start", koaBody(), async ctx => { await meta.connStart(); ctx.redirect("/peers"); })
  .post("/settings/conn/stop", koaBody(), async ctx => { await meta.connStop(); ctx.redirect("/peers"); })
  .post("/settings/conn/sync", koaBody(), async ctx => { await meta.sync(); ctx.redirect("/peers"); })
  .post("/settings/conn/restart", koaBody(), async ctx => { await meta.connRestart(); ctx.redirect("/peers"); })
  .post("/settings/invite/accept", koaBody(), async ctx => { await meta.acceptInvite(String(ctx.request.body.invite)); ctx.redirect("/invites"); })
  .post("/settings/invite/unfollow", koaBody(), async (ctx) => {
    const { key } = ctx.request.body || {};
    if (!key) return ctx.redirect("/invites");
    const pubs = readJSON(gossipPath), kcanon = canonicalKey(key);
    const idx = pubs.findIndex(x => x && canonicalKey(x.key) === kcanon);
    const removed = idx >= 0 ? (pubs.splice(idx, 1)[0], writeJSON(gossipPath, pubs), pubs[idx-1] !== undefined ? pubs.splice(idx,1)[0] : null) : null;
    const ssb = await cooler.open(), addr = removed?.host ? msAddrFrom(removed.host, removed.port, removed.key) : null;
    if (addr) { try { await new Promise(res => ssb.conn.disconnect(addr, res)); } catch {} try { ssb.conn.forget(addr); } catch {} }
    try { await new Promise((res, rej) => ssb.publish({ type: "contact", contact: kcanon, following: false, blocking: true }, e => e ? rej(e) : res())); } catch {}
    const unf = readJSON(unfollowedPath);
    if (!unf.find(x => x && canonicalKey(x.key) === kcanon)) { unf.push(removed || { key: kcanon }); writeJSON(unfollowedPath, unf); }
    ctx.redirect("/invites");
  })
  .post("/settings/invite/follow", koaBody(), async (ctx) => {
    const { key, host, port } = ctx.request.body || {};
    if (!key || !host) return ctx.redirect("/invites");
    const pubs = readJSON(gossipPath), kcanon = canonicalKey(key);
    if (pubs.find(p => p.host === host)?.error) return ctx.redirect("/invites");
    const ssb = await cooler.open(), unf = readJSON(unfollowedPath);
    const rec = unf.find(x => x && canonicalKey(x.key) === kcanon) || { host, port: Number(port) || 8008, key: kcanon };
    if (!pubs.find(x => x && canonicalKey(x.key) === kcanon)) { pubs.push({ host: rec.host, port: Number(rec.port) || 8008, key: kcanon }); writeJSON(gossipPath, pubs); }
    const addr = msAddrFrom(rec.host, rec.port, kcanon);
    try { ssb.conn.remember(addr, { type: "pub", autoconnect: true, key: kcanon }); } catch {}
    try { await new Promise(res => ssb.conn.connect(addr, { type: "pub" }, res)); } catch {}
    try { await new Promise((res, rej) => ssb.publish({ type: "contact", contact: kcanon, blocking: false }, e => e ? rej(e) : res())); } catch {}
    writeJSON(unfollowedPath, unf.filter(x => !(x && canonicalKey(x.key) === kcanon)));
    ctx.redirect("/invites");
  })
  .post("/settings/ssb-logstream", koaBody(), async (ctx) => {
    const logLimit = parseInt(ctx.request.body.ssb_log_limit, 10);
    if (!isNaN(logLimit) && logLimit > 0 && logLimit <= 100000) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.ssbLogStream = { ...(config.ssbLogStream || {}), limit: logLimit };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
    ctx.redirect("/settings");
  })
  .post("/settings/home-page", koaBody(), async (ctx) => {
    const cfg = getConfig();
    cfg.homePage = String(ctx.request.body.homePage || "").trim() || "activity";
    saveConfig(cfg);
    ctx.redirect("/settings");
  })
  .post("/settings/rebuild", async ctx => { meta.rebuild(); ctx.redirect("/settings"); })
  .post("/save-modules", koaBody(), async (ctx) => {
    const modules = ['popular', 'topics', 'summaries', 'latest', 'threads', 'multiverse', 'invites', 'wallet', 'legacy', 'cipher', 'bookmarks', 'videos', 'docs', 'audios', 'tags', 'images', 'trending', 'events', 'tasks', 'market', 'tribes', 'votes', 'reports', 'opinions', 'transfers', 'feed', 'pixelia', 'agenda', 'favorites', 'ai', 'forum', 'jobs', 'projects', 'banking', 'parliament', 'courts'];
    const cfg = getConfig();
    modules.forEach(mod => cfg.modules[`${mod}Mod`] = ctx.request.body[`${mod}Form`] === 'on' ? 'on' : 'off');
    saveConfig(cfg);
    ctx.redirect(`/modules`);
  })
  .post("/settings/ai", koaBody(), async (ctx) => {
    const aiPrompt = String(ctx.request.body.ai_prompt || "").trim();
    if (aiPrompt.length > 128) { ctx.status = 400; ctx.body = "Prompt too long. Must be 128 characters or fewer."; return; }
    const cfg = getConfig();
    cfg.ai = { ...(cfg.ai || {}), prompt: aiPrompt };
    saveConfig(cfg);
    ctx.redirect("/settings");
  })
  .post("/settings/pub-wallet", koaBody(), async (ctx) => {
    const b = ctx.request.body, cfg = getConfig();
    cfg.walletPub = { url: String(b.wallet_url || "").trim(), user: String(b.wallet_user || "").trim(), pass: String(b.wallet_pass || "").trim() };
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    ctx.redirect("/settings");
  })
  .post('/transfers/create', koaBody(), async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    await transfersModel.createTransfer(b.to, b.concept, b.amount, b.deadline, b.tags);
    ctx.redirect(safeReturnTo(ctx, '/transfers?filter=all', ['/transfers']));
  })
  .post('/transfers/update/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    await transfersModel.updateTransferById(ctx.params.id, b.to, b.concept, b.amount, b.deadline, b.tags);
    ctx.redirect(safeReturnTo(ctx, '/transfers?filter=mine', ['/transfers']));
  })
  .post('/transfers/confirm/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    await transfersModel.confirmTransferById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/transfers', ['/transfers']));
  })
  .post('/transfers/delete/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    await transfersModel.deleteTransferById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/transfers?filter=mine', ['/transfers']));
  })
  .post('/transfers/opinions/:transferId/:category', koaBody(), async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    await transfersModel.createOpinion(ctx.params.transferId, ctx.params.category);
    ctx.redirect(safeReturnTo(ctx, '/transfers', ['/transfers']));
  })
  .post("/settings/wallet", koaBody(), async (ctx) => {
    const b = ctx.request.body, cfg = getConfig();
    if (b.wallet_url) cfg.wallet.url = String(b.wallet_url);
    if (b.wallet_user) cfg.wallet.user = String(b.wallet_user);
    if (b.wallet_pass) cfg.wallet.pass = String(b.wallet_pass);
    if (b.wallet_fee) cfg.wallet.fee = String(b.wallet_fee);
    saveConfig(cfg);
    const res = await bankingModel.ensureSelfAddressPublished();
    ctx.redirect(`/banking?filter=addresses&msg=${encodeURIComponent(res.status)}`);
  })
  .post("/wallet/send", koaBody(), async (ctx) => {
    const b = ctx.request.body, action = String(b.action), dest = String(b.destination), amt = Number(b.amount), fee = Number(b.fee);
    const { url, user, pass } = getConfig().wallet;
    let balance = null;
    try { balance = await walletModel.getBalance(url, user, pass); } catch (error) { ctx.body = await walletErrorView(error); return; }
    if (action === 'confirm') {
      const v = await walletModel.validateSend(url, user, pass, dest, amt, fee);
      try { ctx.body = v.isValid ? await walletSendConfirmView(balance, dest, amt, fee) : await walletSendFormView(balance, dest, amt, fee, { type: 'error', title: 'validation_errors', messages: v.errors }); }
      catch (error) { ctx.body = await walletErrorView(error); }
    } else if (action === 'send') {
      try { ctx.body = await walletSendResultView(balance, dest, amt, await walletModel.sendToAddress(url, user, pass, dest, amt)); }
      catch (error) { ctx.body = await walletErrorView(error); }
    }
  });
const routes = router.routes();
const middleware = [
  async (ctx, next) => {
    if (config.public && ctx.method !== "GET") throw new Error("Sorry, many actions are unavailable when Oasis is running in public mode. Please run Oasis in the default mode and try again.");
    await next();
  },
  async (ctx, next) => { setLanguage(ctx.cookies.get("language") || "en"); await next(); },
  async (ctx, next) => {
    const ssb = await cooler.open(), status = await ssb.status(), values = Object.values(status.sync.plugins);
    const totalCurrent = values.reduce((acc, cur) => acc + cur, 0), totalTarget = status.sync.since * values.length;
    if (totalTarget - totalCurrent > 1024 * 1024) ctx.response.body = indexingView({ percent: Math.floor((totalCurrent / totalTarget) * 1000) / 10 });
    else { try { await next(); } catch (err) { ctx.status = err.status || 500; ctx.body = { message: err.message || 'Internal Server Error' }; } }
  },
  routes,
];
const app = http({ host, port, middleware, allowHost: config.allowHost });
app._close = () => { nameWarmup.close(); cooler.close(); };
module.exports = app;
if (config.open === true) open(url);
