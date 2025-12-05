#!/usr/bin/env node

"use strict";

const path = require("path");
const envPaths = require("../server/node_modules/env-paths");
const {cli} = require("../client/oasis_client");
const fs = require("fs");
const os = require('os');
const promisesFs = require("fs").promises;
const SSBconfig = require('../server/SSB_server.js');
const moment = require('../server/node_modules/moment');
const FileType = require('../server/node_modules/file-type');
const ssbRef = require("../server/node_modules/ssb-ref");

const defaultConfig = {};
const defaultConfigFile = path.join(
  envPaths("oasis", { suffix: "" }).config,
  "/default.json"
);

let haveConfig;

try {
  const defaultConfigOverride = fs.readFileSync(defaultConfigFile, "utf8");
  Object.entries(JSON.parse(defaultConfigOverride)).forEach(([key, value]) => {
    defaultConfig[key] = value;
  });
  haveConfig = true;
} catch (e) {
  if (e.code === "ENOENT") {
    haveConfig = false;
  } else {
    console.log(`There was a problem loading ${defaultConfigFile}`);
    throw e;
  }
}

const config = cli(defaultConfig, defaultConfigFile);
if (config.debug) {
  process.env.DEBUG = "oasis,oasis:*";
}

//AI
const axiosMod = require('../server/node_modules/axios');
const axios = axiosMod.default || axiosMod;
const { spawn } = require('child_process');

const { fieldsForSnippet, buildContext, clip, publishExchange, getBestTrainedAnswer } = require('../AI/buildAIContext.js');

let aiStarted = false;
function startAI() {
    if (aiStarted) return;
    aiStarted = true;
    const aiPath = path.resolve(__dirname, '../AI/ai_service.mjs');
    const aiProcess = spawn('node', [aiPath], {
        detached: true,
        stdio: 'ignore' // set 'inherit' for debug
    });
    aiProcess.unref();
}

//banking
function readWalletMap() {
  const candidates = [
    path.join(__dirname, '..', 'configs', 'wallet-addresses.json'),
    path.join(process.cwd(), 'configs', 'wallet-addresses.json')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (obj && typeof obj === 'object') return obj;
      }
    } catch {}
  }
  return {};
}

//parliament
let electionInFlight = null;
async function ensureTerm() {
  const current = await parliamentModel.getCurrentTerm().catch(() => null);
  if (current) return current;
  if (electionInFlight) return electionInFlight;
  electionInFlight = (async () => {
    try { return await parliamentModel.resolveElection(); } catch { return null; }
    finally { electionInFlight = null; }
  })();
  return electionInFlight;
}
let sweepInFlight = null;
async function runSweepOnce() {
  if (sweepInFlight) return sweepInFlight;
  sweepInFlight = (async () => {
    try { await parliamentModel.sweepProposals(); } catch {}
    finally { sweepInFlight = null; }
  })();
  return sweepInFlight;
}
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
    const va = Number(a.votes || 0), vb = Number(b.votes || 0);
    if (vb !== va) return vb - va;
    const ka = Number(a.karma || 0), kb = Number(b.karma || 0);
    if (kb !== ka) return kb - ka;
    const sa = Number(a.profileSince || 0), sb = Number(b.profileSince || 0);
    if (sa !== sb) return sa - sb;
    const ca = new Date(a.createdAt).getTime(), cb = new Date(b.createdAt).getTime();
    if (ca !== cb) return ca - cb;
    return String(a.targetId).localeCompare(String(b.targetId));
  })[0];
}

async function buildLeaderMeta(leader) {
  if (!leader) return null;
  if (leader.targetType === 'inhabitant') {
    let name = null;
    let image = null;
    let description = null;
    try { if (about && typeof about.name === 'function') name = await about.name(leader.targetId); } catch {}
    try { if (about && typeof about.image === 'function') image = await about.image(leader.targetId); } catch {}
    try { if (about && typeof about.description === 'function') description = await about.description(leader.targetId); } catch {}
    const imgId = typeof image === 'string' ? image : (image && (image.link || image.url)) || null;
    const avatarUrl = imgId ? `/image/256/${encodeURIComponent(imgId)}` : '/assets/images/default-avatar.png';
    return {
      isTribe: false,
      name: name || leader.targetId,
      avatarUrl,
      bio: typeof description === 'string' ? description : ''
    };
  } else {
    let tribe = null;
    try { tribe = await tribesModel.getTribeById(leader.targetId); } catch {}
    const imgId = tribe && tribe.image ? tribe.image : null;
    const avatarUrl = imgId ? `/image/256/${encodeURIComponent(imgId)}` : '/assets/images/default-tribe.png';
    return {
      isTribe: true,
      name: leader.targetTitle || (tribe && (tribe.title || tribe.name)) || leader.targetId,
      avatarUrl,
      bio: (tribe && tribe.description) || ''
    };
  }
}

//security fallback
const safeArr = v => (Array.isArray(v) ? v : []);
const safeText = v => String(v || "").trim();
const safeReturnTo = (ctx, fallback, allowedPrefixes) => {
  const rt = (ctx.request && ctx.request.body && ctx.request.body.returnTo) || (ctx.query && ctx.query.returnTo);
  if (typeof rt === 'string' && Array.isArray(allowedPrefixes) && allowedPrefixes.some(p => rt.startsWith(p))) return rt;
  return fallback;
};
const parseBool01 = (v) => {
  if (Array.isArray(v)) v = v[v.length - 1];
  return String(v || "") === "1";
};

//media favorites
const mediaFavorites = require("./media-favorites.js");

//custom styles
const customStyleFile = path.join(
  envPaths("oasis", { suffix: "" }).config,
  "/custom-style.css"
);
let haveCustomStyle;

try {
  fs.readFileSync(customStyleFile, "utf8");
  haveCustomStyle = true;
} catch (e) {
  if (e.code === "ENOENT") {
    haveCustomStyle = false;
  } else {
    console.log(`There was a problem loading ${customStyleFile}`);
    throw e;
  }
}

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

// load core models (cooler)
const models = require("../models/main_models");
const { about, blob, friend, meta, post, vote } = models({
  cooler,
  isPublic: config.public,
});
const { handleBlobUpload, serveBlob } = require('../backend/blobHandler.js');

// load plugin models (static)
const exportmodeModel = require('../models/exportmode_model');
const panicmodeModel = require('../models/panicmode_model');
const cipherModel = require('../models/cipher_model');
const legacyModel = require('../models/legacy_model');
const walletModel = require('../models/wallet_model')

// load plugin models (cooler)
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

// content (comments)
const getVoteComments = async (voteId) => {
  const rawComments = await post.topicComments(voteId);
  const comments = (rawComments || [])
    .filter(c => {
      const content = c.value && c.value.content;
      if (!content) return false;
      return content.type === 'post' && content.root === voteId;
    })
    .sort((a, b) => {
      const ta = a.value && a.value.timestamp ? a.value.timestamp : 0;
      const tb = b.value && b.value.timestamp ? b.value.timestamp : 0;
      return ta - tb;
    });
  return comments;
};

// starting warmup
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

const ADDR_PATH = path.join(__dirname, "..", "configs", "wallet-addresses.json");
function readAddrMap() {
  try { return JSON.parse(fs.readFileSync(ADDR_PATH, "utf8")); } catch { return {}; }
}
function writeAddrMap(map) {
  fs.mkdirSync(path.dirname(ADDR_PATH), { recursive: true });
  fs.writeFileSync(ADDR_PATH, JSON.stringify(map, null, 2));
}

const preparePreview = async function (ctx) {
    let text = String(ctx.request.body.text || "");
    const contentWarning = String(ctx.request.body.contentWarning || "");
    const mentions = {};
    const rex = /(^|\s)(?!\[)@([a-zA-Z0-9\-/.=+]{3,})\b/g;
    let m;

    while ((m = rex.exec(text)) !== null) {
        const token = m[2];
        const key = token;
        let found = mentions[key] || [];

        if (/\.ed25519$/.test(token)) {
            const name = await about.name(token);
            const img = await about.image(token);
            found.push({
                feed: token,
                name,
                img,
                rel: { followsMe: false, following: false, blocking: false, me: false }
            });
        } else {
            const matches = about.named(token);
            for (const match of matches) {
                found.push(match);
            }
        }

        if (found.length > 0) {
            mentions[key] = found;
        }
    }

    Object.keys(mentions).forEach((key) => {
        const matches = mentions[key];
        const meaningful = matches.filter(
            (m) => (m.rel?.followsMe || m.rel?.following) && !m.rel?.blocking
        );
        mentions[key] = meaningful.length > 0 ? meaningful : matches;
    });

    const replacer = (match, prefix, token) => {
        const matches = mentions[token];
        if (matches && matches.length === 1) {
            return `${prefix}[@${matches[0].name}](${matches[0].feed})`;
        }
        return match;
    };

    text = text.replace(rex, replacer);

    const blobMarkdown = await handleBlobUpload(ctx, "blob");
    if (blobMarkdown) {
        text += blobMarkdown;
    }

    const ssbClient = await cooler.open();
    const authorMeta = {
        id: ssbClient.id,
        name: await about.name(ssbClient.id),
        image: await about.image(ssbClient.id),
    };

    const renderedText = await renderBlobMarkdown(
        text,
        mentions,
        authorMeta.id,
        authorMeta.name
    );

    const hasBrTags = /<br\s*\/?>/i.test(renderedText);
    const hasBlockTags = /<(p|div|ul|ol|li|pre|blockquote|h[1-6]|table|tr|td|th|section|article)\b/i.test(renderedText);

    let formattedText = renderedText;
    if (!hasBrTags && !hasBlockTags && /[\r\n]/.test(renderedText)) {
        formattedText = renderedText.replace(/\r\n|\r|\n/g, "<br>");
    }

    return { authorMeta, text, formattedText, mentions, contentWarning };
};

// set koaMiddleware maxSize: 50 MiB (voted by community at: 09/04/2025)
const megabyte = Math.pow(2, 20);
const maxSize = 50 * megabyte;

// koaMiddleware to manage files
const homeDir = os.homedir();
const blobsPath = path.join(homeDir, '.ssb', 'blobs', 'tmp');
const gossipPath = path.join(homeDir, '.ssb', 'gossip.json');
const unfollowedPath = path.join(homeDir, '.ssb', 'gossip_unfollowed.json');

function ensureJSONFile(p, initial = []) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(initial, null, 2), 'utf8');
}

function readJSON(p) {
  ensureJSONFile(p, []);
  try { return JSON.parse(fs.readFileSync(p, 'utf8') || '[]') } catch { return [] }
}

function writeJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

function canonicalKey(key) {
  let core = String(key).replace(/^@/, '').replace(/\.ed25519$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!core.endsWith('=')) core += '=';
  return `@${core}.ed25519`;
}

function msAddrFrom(host, port, key) {
  const core = canonicalKey(key).replace(/^@/, '').replace(/\.ed25519$/, '');
  return `net:${host}:${Number(port) || 8008}~shs:${core}`;
}

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

// import views (core)
const { authorView, previewCommentView, commentView, editProfileView, extendedView, latestView, likesView, threadView, hashtagView, mentionsView, popularView, previewView, privateView, publishCustomView, publishView, previewSubtopicView, subtopicView, imageSearchView, setLanguage, topicsView, summaryView, threadsView } = require("../views/main_views");

// import views (modules)
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
  // Optional dependency
}

const readmePath = path.join(__dirname, "..", ".." ,"README.md");
const packagePath = path.join(__dirname, "..", "server", "package.json");

const readme = fs.readFileSync(readmePath, "utf8");
const version = JSON.parse(fs.readFileSync(packagePath, "utf8")).version;

const nullImageId = '&0000000000000000000000000000000000000000000=.sha256';
const getAvatarUrl = (image) => {
  if (!image || image === nullImageId) {
    return '/assets/images/default-avatar.png';
  }
  return `/image/256/${encodeURIComponent(image)}`;
};

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
  
  //GET backend routes
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
    const filter = ctx.query.filter || 'ALL';
    const stats = await statsModel.getStats(filter);
    const myId = SSBconfig.config.keys.id;
    const myAddress = await bankingModel.getUserAddress(myId);
    const addrRows = await bankingModel.listAddressesMerged();
    stats.banking = {
      myAddress: myAddress || null,
      totalAddresses: Array.isArray(addrRows) ? addrRows.length : 0
    };
    ctx.body = statsView(stats, filter);
  })
  .get("/public/popular/:period", async (ctx) => {
    const { period } = ctx.params;
    const popularMod = ctx.cookies.get("popularMod") || 'on';
    if (popularMod !== 'on') {
     ctx.redirect('/modules');
      return;
    }
    const i18n = require("../client/assets/translations/i18n");
    const lang = ctx.cookies.get('lang') || 'en'; 
    const translations = i18n[lang] || i18n['en']; 
    const publicPopular = async ({ period }) => {
    const messages = await post.popular({ period });
      const prefix = nav(
       div({ class: "filters" },
        ul(
          li(
            form({ method: "GET", action: "/public/popular/day" },
              button({ type: "submit", class: "filter-btn" }, translations.day)
            )
          ),
         li(
            form({ method: "GET", action: "/public/popular/week" },
              button({ type: "submit", class: "filter-btn" }, translations.week)
            )
          ),
          li(
            form({ method: "GET", action: "/public/popular/month" },
              button({ type: "submit", class: "filter-btn" }, translations.month)
            )
          ),
          li(
            form({ method: "GET", action: "/public/popular/year" },
              button({ type: "submit", class: "filter-btn" }, translations.year)
            )
          )
        )
       )
      );
      return popularView({
        messages,
        prefix,
      });
    };
    ctx.body = await publicPopular({ period });
   }) 
   
   // modules
  .get("/modules", async (ctx) => {
    const configMods = getConfig().modules;
    const modules = [
    'popular', 'topics', 'summaries', 'latest', 'threads', 'multiverse', 'invites', 'wallet', 
    'legacy', 'cipher', 'bookmarks', 'videos', 'docs', 'audios', 'tags', 'images', 'trending', 
    'events', 'tasks', 'market', 'tribes', 'votes', 'reports', 'opinions', 'transfers', 
    'feed', 'pixelia', 'agenda', 'favorites', 'ai', 'forum', 'jobs', 'projects', 'banking', 'parliament', 'courts'
    ];
    const moduleStates = modules.reduce((acc, mod) => {
      acc[`${mod}Mod`] = configMods[`${mod}Mod`];
      return acc;
    }, {});
    ctx.body = modulesView(moduleStates);
  })
   // AI
  .get('/ai', async (ctx) => {
    const aiMod = ctx.cookies.get('aiMod') || 'on';
    if (aiMod !== 'on') {
        ctx.redirect('/modules');
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
    } catch {}
    const config = getConfig();
    const userPrompt = config.ai?.prompt?.trim() || '';
    ctx.body = aiView(chatHistory, userPrompt);
  })
   // pixelArt
  .get('/pixelia', async (ctx) => {
    const pixeliaMod = ctx.cookies.get("pixeliaMod") || 'on';
    if (pixeliaMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const pixelArt = await pixeliaModel.listPixels();
    ctx.body = pixeliaView(pixelArt);
  })
   // blockexplorer
  .get('/blockexplorer', async (ctx) => {
    const userId = SSBconfig.config.keys.id; 
    const query = ctx.query;
    const filter = query.filter || 'recent';
    const blockchainData = await blockchainModel.listBlockchain(filter, userId);
    ctx.body = renderBlockchainView(blockchainData, filter, userId);
  })
  .get('/blockexplorer/block/:id', async (ctx) => {
    const blockId = ctx.params.id;
    const block = await blockchainModel.getBlockById(blockId);
    ctx.body = renderSingleBlockView(block);
  })
  .get("/public/latest", async (ctx) => {
    const latestMod = ctx.cookies.get("latestMod") || 'on';
    if (latestMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const messages = await post.latest();
    ctx.body = await latestView({ messages });
  })
  .get("/public/latest/extended", async (ctx) => {
    const extendedMod = ctx.cookies.get("extendedMod") || 'on';
    if (extendedMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const messages = await post.latestExtended();
    ctx.body = await extendedView({ messages });
  })
  .get("/public/latest/topics", async (ctx) => {
    const topicsMod = ctx.cookies.get("topicsMod") || 'on';
    if (topicsMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const messages = await post.latestTopics();
    const channels = await post.channels();
    const list = channels.map((c) => {
      return li(a({ href: `/hashtag/${c}` }, `#${c}`));
    });
    const prefix = nav(ul(list));
    ctx.body = await topicsView({ messages, prefix });
  })
  .get("/public/latest/summaries", async (ctx) => {
    const summariesMod = ctx.cookies.get("summariesMod") || 'on';
    if (summariesMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const messages = await post.latestSummaries();
    ctx.body = await summaryView({ messages });
  })
  .get("/public/latest/threads", async (ctx) => {
    const threadsMod = ctx.cookies.get("threadsMod") || 'on';
    if (threadsMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const messages = await post.latestThreads();
    ctx.body = await threadsView({ messages });
  })
  .get('/author/:feed', async (ctx) => {
    const feedId = decodeURIComponent(ctx.params.feed || '');
    const gt = Number(ctx.request.query.gt || -1);
    const lt = Number(ctx.request.query.lt || -1);
    if (lt > 0 && gt > 0 && gt >= lt) throw new Error('Given search range is empty');
    const description = await about.description(feedId);
    const name = await about.name(feedId);
    const image = await about.image(feedId);
    const messages = await post.fromPublicFeed(feedId, gt, lt);
    const firstPost = await post.firstBy(feedId);
    const lastPost = await post.latestBy(feedId);
    const relationship = await friend.getRelationship(feedId);
    const avatarUrl = getAvatarUrl(image);
    const ecoAddress = await bankingModel.getUserAddress(feedId);
    const { ecoValue, karmaScore } = await bankingModel.getBankingData(feedId);
    const normTs = (t) => {
      const n = Number(t || 0);
      if (!isFinite(n) || n <= 0) return 0;
      return n < 1e12 ? n * 1000 : n;
    };
    const pull = require('../server/node_modules/pull-stream');
    const ssbClientGUI = require('../client/gui');
    const coolerInstance = ssbClientGUI({ offline: require('../server/ssb_config').offline });
    const ssb = await coolerInstance.open();
    const latestFromStream = await new Promise((resolve) => {
      pull(
        ssb.createUserStream({ id: feedId, reverse: true }),
        pull.filter(m => m && m.value && m.value.content && m.value.content.type !== 'tombstone'),
        pull.take(1),
        pull.collect((err, arr) => {
          if (err || !arr || !arr.length) return resolve(0);
          const m = arr[0];
          const ts = normTs((m.value && m.value.timestamp) || m.timestamp);
          resolve(ts || null);
        })
      );
    });
    const days = latestFromStream ? (Date.now() - latestFromStream) / 86400000 : Infinity;
    const lastActivityBucket = days < 14 ? 'green' : days < 182.5 ? 'orange' : 'red';
    ctx.body = await authorView({
      feedId,
      messages,
      firstPost,
      lastPost,
      name,
      description,
      avatarUrl,
      relationship,
      ecoAddress,
      karmaScore,
      lastActivityBucket
    });
  })
  .get("/search", async (ctx) => {
    const query = ctx.query.query || '';
    if (!query) {
      return ctx.body = await searchView({ messages: [], query, types: [] });
    }
    const results = await searchModel.search({ query, types: [] });
    const groupedResults = Object.entries(results).reduce((acc, [type, msgs]) => {
      acc[type] = msgs.map(msg => {
        if (!msg.value || !msg.value.content) {
         return {};
        }
        return {
          ...msg,
          content: msg.value.content,
          author: msg.value.content.author || 'Unknown', 
        };
      });
      return acc;
    }, {});
    ctx.body = await searchView({ results: groupedResults, query, types: [] });
   })

  .get("/images", async (ctx) => {
    const imagesMod = ctx.cookies.get("imagesMod") || "on";
    if (imagesMod !== "on") { ctx.redirect("/modules"); return; }
    const filter = ctx.query.filter || "all";
    const q = ctx.query.q || "";
    const sort = ctx.query.sort || "recent";
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;

    const modelFilter = filter === "favorites" ? "all" : filter;
    const images = await imagesModel.listAll({ filter: modelFilter, q, sort, viewerId });

    const fav = await mediaFavorites.getFavoriteSet("images");
    const withFavorites = images.map((im) => ({
      ...im,
      isFavorite: fav.has(String(im.rootId || im.key))
    }));

    const filtered = filter === "favorites" ? withFavorites.filter((im) => !!im.isFavorite) : withFavorites;

    const commentsCountByImageId = {};
    await Promise.all(
      filtered.map(async (im) => {
        const comments = await getVoteComments(im.key);
        commentsCountByImageId[im.key] = comments.length;
      })
    );

    const enriched = filtered.map((im) => ({ ...im, commentCount: commentsCountByImageId[im.key] || 0 }));
    ctx.body = await imageView(enriched, filter, null, { q, sort });
  })
  .get("/images/edit/:id", async (ctx) => {
    const imagesMod = ctx.cookies.get("imagesMod") || "on";
    if (imagesMod !== "on") { ctx.redirect("/modules"); return; }
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;
    const image = await imagesModel.getImageById(ctx.params.id, viewerId);
    const fav = await mediaFavorites.getFavoriteSet("images");
    const imageWithFav = { ...image, isFavorite: fav.has(String(image.rootId || image.key)) };
    ctx.body = await imageView([imageWithFav], "edit", imageWithFav.key, { returnTo: ctx.query.returnTo || "" });
  })
  .get("/images/:imageId", async (ctx) => {
    const imagesMod = ctx.cookies.get("imagesMod") || "on";
    if (imagesMod !== "on") { ctx.redirect("/modules"); return; }
    const imageId = ctx.params.imageId;
    const filter = ctx.query.filter || "all";
    const q = ctx.query.q || "";
    const sort = ctx.query.sort || "recent";
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;

    const image = await imagesModel.getImageById(imageId, viewerId);
    const fav = await mediaFavorites.getFavoriteSet("images");
    const imageWithFav = { ...image, isFavorite: fav.has(String(image.rootId || image.key)) };

    const comments = await getVoteComments(imageWithFav.key);
    const imageWithCount = { ...imageWithFav, commentCount: comments.length };

    ctx.body = await singleImageView(imageWithCount, filter, comments, {
      q,
      sort,
      returnTo: safeReturnTo(ctx, `/images?filter=${encodeURIComponent(filter)}`, ["/images"])
    });
  })
  .get("/audios", async (ctx) => {
    const audiosMod = ctx.cookies.get("audiosMod") || "on";
    if (audiosMod !== "on") { ctx.redirect("/modules"); return; }
    const filter = ctx.query.filter || "all";
    const q = ctx.query.q || "";
    const sort = ctx.query.sort || "recent";
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;

    const modelFilter = filter === "favorites" ? "all" : filter;
    const audios = await audiosModel.listAll({ filter: modelFilter, q, sort, viewerId });

    const fav = await mediaFavorites.getFavoriteSet("audios");
    const withFavorites = audios.map((a) => ({
      ...a,
      isFavorite: fav.has(String(a.rootId || a.key))
    }));

    const filtered = filter === "favorites" ? withFavorites.filter((a) => !!a.isFavorite) : withFavorites;

    const commentsCountByAudioId = {};
    await Promise.all(
      filtered.map(async (a) => {
        const comments = await getVoteComments(a.key);
        commentsCountByAudioId[a.key] = comments.length;
      })
    );
    const enrichedAudios = filtered.map((a) => ({ ...a, commentCount: commentsCountByAudioId[a.key] || 0 }));
    ctx.body = await audioView(enrichedAudios, filter, null, { q, sort });
  })
  .get("/audios/edit/:id", async (ctx) => {
    const audiosMod = ctx.cookies.get("audiosMod") || "on";
    if (audiosMod !== "on") { ctx.redirect("/modules"); return; }
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;
    const audio = await audiosModel.getAudioById(ctx.params.id, viewerId);
    const fav = await mediaFavorites.getFavoriteSet("audios");
    const audioWithFav = {
      ...audio,
      isFavorite: fav.has(String(audio.rootId || audio.key))
    };
    ctx.body = await audioView([audioWithFav], "edit", audioWithFav.key, { returnTo: ctx.query.returnTo || "" });
  })
  .get("/audios/:audioId", async (ctx) => {
    const audiosMod = ctx.cookies.get("audiosMod") || "on";
    if (audiosMod !== "on") { ctx.redirect("/modules"); return; }
    const audioId = ctx.params.audioId;
    const filter = ctx.query.filter || "all";
    const q = ctx.query.q || "";
    const sort = ctx.query.sort || "recent";
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;

    const audio = await audiosModel.getAudioById(audioId, viewerId);
    const fav = await mediaFavorites.getFavoriteSet("audios");
    const audioWithFav = {
      ...audio,
      isFavorite: fav.has(String(audio.rootId || audio.key))
    };

    const comments = await getVoteComments(audioWithFav.key);
    const audioWithCount = { ...audioWithFav, commentCount: comments.length };
    const params = {
      q,
      sort,
      returnTo: safeReturnTo(ctx, `/audios?filter=${encodeURIComponent(filter)}`, ["/audios"])
    };
    ctx.body = await singleAudioView(audioWithCount, filter, comments, params);
  })
  .get("/videos", async (ctx) => {
    const videosMod = ctx.cookies.get("videosMod") || "on";
    if (videosMod !== "on") { ctx.redirect("/modules"); return; }
    const filter = ctx.query.filter || "all";
    const q = ctx.query.q || "";
    const sort = ctx.query.sort || "recent";
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;

    const modelFilter = filter === "favorites" ? "all" : filter;
    const videos = await videosModel.listAll({ filter: modelFilter, q, sort, viewerId });

    const fav = await mediaFavorites.getFavoriteSet("videos");
    const withFavorites = videos.map((v) => ({
      ...v,
      isFavorite: fav.has(String(v.rootId || v.key))
    }));

    const filtered = filter === "favorites" ? withFavorites.filter((v) => !!v.isFavorite) : withFavorites;

    const commentsCountByVideoId = {};
    await Promise.all(
      filtered.map(async (v) => {
        const comments = await getVoteComments(v.key);
        commentsCountByVideoId[v.key] = comments.length;
      })
    );

    const enrichedVideos = filtered.map((v) => ({ ...v, commentCount: commentsCountByVideoId[v.key] || 0 }));
    ctx.body = await videoView(enrichedVideos, filter, null, { q, sort });
  })
  .get("/videos/edit/:id", async (ctx) => {
    const videosMod = ctx.cookies.get("videosMod") || "on";
    if (videosMod !== "on") { ctx.redirect("/modules"); return; }
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;
    const video = await videosModel.getVideoById(ctx.params.id, viewerId);
    const fav = await mediaFavorites.getFavoriteSet("videos");
    const videoWithFav = {
      ...video,
      isFavorite: fav.has(String(video.rootId || video.key))
    };
    ctx.body = await videoView([videoWithFav], "edit", videoWithFav.key, { returnTo: ctx.query.returnTo || "" });
  })
  .get("/videos/:videoId", async (ctx) => {
    const videosMod = ctx.cookies.get("videosMod") || "on";
    if (videosMod !== "on") { ctx.redirect("/modules"); return; }
    const videoId = ctx.params.videoId;
    const filter = ctx.query.filter || "all";
    const q = ctx.query.q || "";
    const sort = ctx.query.sort || "recent";
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;

    const video = await videosModel.getVideoById(videoId, viewerId);
    const fav = await mediaFavorites.getFavoriteSet("videos");
    const videoWithFav = {
      ...video,
      isFavorite: fav.has(String(video.rootId || video.key))
    };

    const comments = await getVoteComments(videoWithFav.key);
    const videoWithCount = { ...videoWithFav, commentCount: comments.length };

    ctx.body = await singleVideoView(videoWithCount, filter, comments, {
      q,
      sort,
      returnTo: safeReturnTo(ctx, `/videos?filter=${encodeURIComponent(filter)}`, ["/videos"])
    });
  })
  .get("/documents", async (ctx) => {
    const filter = ctx.query.filter || "all";
    const q = ctx.query.q || "";
    const sort = ctx.query.sort || "recent";
    const documents = await documentsModel.listAll({ filter, q, sort });
    const commentsCountByDocumentId = {};
    await Promise.all(
      documents.map(async (d) => {
        const root = d.rootId || d.key;
        const comments = await getVoteComments(root);
        commentsCountByDocumentId[d.key] = comments.length;
      })
    );
    const enriched = documents.map((d) => ({ ...d, commentCount: commentsCountByDocumentId[d.key] || 0 }));
    ctx.body = await documentView(enriched, filter, null, { q, sort });
  })
  .get("/documents/edit/:id", async (ctx) => {
    const document = await documentsModel.getDocumentById(ctx.params.id);
    ctx.body = await documentView([document], "edit", document.key, { returnTo: ctx.query.returnTo || "" });
  })
  .get("/documents/:documentId", async (ctx) => {
    const documentId = ctx.params.documentId;
    const filter = ctx.query.filter || "all";
    const q = ctx.query.q || "";
    const sort = ctx.query.sort || "recent";
    const document = await documentsModel.getDocumentById(documentId);
    const root = document.rootId || document.key;  
    const comments = await getVoteComments(root);
    const documentWithCount = { ...document, commentCount: comments.length };
    ctx.body = await singleDocumentView(documentWithCount, filter, comments, {
      q,
      sort,
      returnTo: safeReturnTo(
        ctx,
        `/documents/${encodeURIComponent(document.key)}?filter=${encodeURIComponent(filter)}${q ? `&q=${encodeURIComponent(q)}` : ""}${sort ? `&sort=${encodeURIComponent(sort)}` : ""}`,
        ["/documents"]
      )
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
    const inboxMod = ctx.cookies.get('inboxMod') || 'on';
    if (inboxMod !== 'on') { ctx.redirect('/modules'); return; }
    const messages = await pmModel.listAllPrivate();
    ctx.body = await privateView({ messages }, ctx.query.filter || undefined);
  })
  .get('/tags', async ctx => {
    const filter = ctx.query.filter || 'all'
    const tags = await tagsModel.listTags(filter)
    ctx.body = await tagsView(tags, filter)
  })
  .get('/reports', async ctx => {
    const filter = ctx.query.filter || 'all';
    const category = ctx.query.category || '';
    const reports = await reportsModel.listAll();
    const commentsCountById = {};
    await Promise.all(
      reports.map(async r => {
        const comments = await getVoteComments(r.id);
        commentsCountById[r.id] = comments.length;
      })
    );
    const enrichedReports = reports.map(r => ({
      ...r,
      commentCount: commentsCountById[r.id] || 0
    }));
    ctx.body = await reportView(enrichedReports, filter, null, category);
  })
  .get('/reports/edit/:id', async ctx => {
    const report = await reportsModel.getReportById(ctx.params.id);
    ctx.body = await reportView([report], 'edit', ctx.params.id);
  })
  .get('/reports/:reportId', async ctx => {
    const reportId = ctx.params.reportId;
    const filter = ctx.query.filter || 'all';
    const report = await reportsModel.getReportById(reportId);
    const comments = await getVoteComments(reportId);
    const reportWithCount = { ...report, commentCount: comments.length };
    ctx.body = await singleReportView(reportWithCount, filter, comments);
  })
  .get('/trending', async (ctx) => {
    const filter = ctx.query.filter || 'RECENT'; 
    const trendingItems = await trendingModel.listTrending(filter);
    const items = trendingItems.filtered || [];
    const categories = trendingModel.categories;
    ctx.body = await trendingView(items, filter, categories);
  })
  .get('/agenda', async (ctx) => {
    const filter = ctx.query.filter || 'all';
    const data = await agendaModel.listAgenda(filter);
    ctx.body = await agendaView(data, filter);
  })
  .get("/hashtag/:hashtag", async (ctx) => {
    const { hashtag } = ctx.params;
    const messages = await post.fromHashtag(hashtag);
    ctx.body = await hashtagView({ hashtag, messages });
   })
  .get('/inhabitants', async (ctx) => {
    const filter = ctx.query.filter || 'all';
    const query = { search: ctx.query.search || '' };
    if (['CVs', 'MATCHSKILLS'].includes(filter)) {
      query.location = ctx.query.location || '';
      query.language = ctx.query.language || '';
      query.skills = ctx.query.skills || '';
    }
    const userId = SSBconfig.config.keys.id;
    const inhabitants = await inhabitantsModel.listInhabitants({ filter, ...query });
    const [addresses, karmaList] = await Promise.all([
    bankingModel.listAddressesMerged(),
    Promise.all(
      inhabitants.map(async (u) => {
          try {
            const { karmaScore } = await bankingModel.getBankingData(u.id);
            return { id: u.id, karmaScore: typeof karmaScore === 'number' ? karmaScore : 0 };
          } catch {
            return { id: u.id, karmaScore: 0 };
          }
        })
      )
    ]);
    const addrMap = new Map(addresses.map(x => [x.id, x.address]));
    const karmaMap = new Map(karmaList.map(x => [x.id, x.karmaScore]));
    let enriched = inhabitants.map(u => ({
      ...u,
      ecoAddress: addrMap.get(u.id) || null,
      karmaScore: karmaMap.has(u.id)
        ? karmaMap.get(u.id)
        : (typeof u.karmaScore === 'number' ? u.karmaScore : 0)
    }));
    if (filter === 'TOP KARMA') {
      enriched = enriched.sort((a, b) => (b.karmaScore || 0) - (a.karmaScore || 0));
    }
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
    const currentUserId = SSBconfig.config.keys.id;
    const karmaScore = bank && typeof bank.karmaScore === 'number' ? bank.karmaScore : 0;
    ctx.body = await inhabitantsProfileView({ about, cv, feed, photo, karmaScore, lastActivityBucket: bucketInfo.bucket, viewedId: id }, currentUserId);
  })
  .get('/parliament', async (ctx) => {
    const mod = ctx.cookies.get('parliamentMod') || 'on';
    if (mod !== 'on') { ctx.redirect('/modules'); return; }
    const filter = (ctx.query.filter || 'government').toLowerCase();
    await ensureTerm();
    await runSweepOnce();
    const [
      governmentCard,
      candidatures, proposals, futureLaws, canPropose, laws,
      historical, leaders, revocations, futureRevocations, revocationsEnactedCount,
      inhabitantsAll
    ] = await Promise.all([
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
    const leader = pickLeader(candidatures || []);
    const leaderMeta = leader
      ? await parliamentModel.getActorMeta({
          targetType: leader.targetType || leader.powerType || 'inhabitant',
          targetId: leader.targetId || leader.powerId
        })
      : null;
    const powerMeta = (governmentCard && (governmentCard.powerType === 'tribe' || governmentCard.powerType === 'inhabitant'))
      ? await parliamentModel.getActorMeta({ targetType: governmentCard.powerType, targetId: governmentCard.powerId })
      : null;
    const historicalMetas = {};
    for (const g of (historical || []).slice(0, 12)) {
      if (g.powerType === 'tribe' || g.powerType === 'inhabitant') {
        const k = `${g.powerType}:${g.powerId}`;
        if (!historicalMetas[k]) historicalMetas[k] = await parliamentModel.getActorMeta({ targetType: g.powerType, targetId: g.powerId });
      }
    }
    const leadersMetas = {};
    for (const r of (leaders || []).slice(0, 20)) {
      if (r.powerType === 'tribe' || r.powerType === 'inhabitant') {
        const k = `${r.powerType}:${r.powerId}`;
        if (!leadersMetas[k]) leadersMetas[k] = await parliamentModel.getActorMeta({ targetType: r.powerType, targetId: r.powerId });
      }
    }
    const govWithPopulation = governmentCard ? { ...governmentCard, inhabitantsTotal } : { inhabitantsTotal };
    ctx.body = await parliamentView({
      filter,
      governmentCard: govWithPopulation,
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
    const mod = ctx.cookies.get('courtsMod') || 'on';
    if (mod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const filter = String(ctx.query.filter || 'cases').toLowerCase();
    const search = String(ctx.query.search || '').trim();
    const state = {
      filter,
      search,
      cases: [],
      myCases: [],
      trials: [],
      history: [],
      nominations: [],
      userId: null
    };
    const currentUserId = await courtsModel.getCurrentUserId();
    state.userId = currentUserId;
    if (filter === 'cases') {
      let allCases = await courtsModel.listCases('open');
      allCases = allCases.map((c) => ({
        ...c,
        respondent: c.respondentId || c.respondent
      }));
      if (search) {
        const sLower = search.toLowerCase();
        allCases = allCases.filter((c) => {
          const t = String(c.title || '').toLowerCase();
          const d = String(c.description || '').toLowerCase();
          return t.includes(sLower) || d.includes(sLower);
        });
      }
      state.cases = allCases;
    }
    if (filter === 'mycases' || filter === 'actions') {
      let myCases = await courtsModel.listCasesForUser(currentUserId);
      if (search) {
        const sLower = search.toLowerCase();
        myCases = myCases.filter((c) => {
          const t = String(c.title || '').toLowerCase();
          const d = String(c.description || '').toLowerCase();
          return t.includes(sLower) || d.includes(sLower);
        });
      }
      if (filter === 'actions') {
        myCases = myCases.filter((c) => {
          const status = String(c.status || '').toUpperCase();
          const method = String(c.method || '').toUpperCase();
          const isAccuser = !!c.isAccuser;
          const isRespondent = !!c.isRespondent;
          const isMediator = !!c.isMediator;
          const isJudge = !!c.isJudge;
          const isDictator = !!c.isDictator;
          const canAnswer =
            isRespondent && (status === 'OPEN' || status === 'IN_PROGRESS');
          const canAssignJudge =
            method === 'JUDGE' &&
            !c.judgeId &&
            (isAccuser || isRespondent) &&
            (status === 'OPEN' || status === 'IN_PROGRESS');
          const canIssueVerdict =
            (isJudge || isDictator || isMediator) &&
            status === 'OPEN';
          const canProposeSettlement =
            (isAccuser || isRespondent || isMediator) &&
            method === 'MEDIATION' &&
            (status === 'OPEN' || status === 'IN_PROGRESS');
          const canAddEvidence =
            (isAccuser ||
              isRespondent ||
              isMediator ||
              isJudge ||
              isDictator) &&
            (status === 'OPEN' || status === 'IN_PROGRESS');
          return (
            canAnswer ||
            canAssignJudge ||
            canIssueVerdict ||
            canProposeSettlement ||
            canAddEvidence
          );
        });
      }
      state.myCases = myCases;
    }
    if (filter === 'judges') {
      const nominations = await courtsModel.listNominations();
      state.nominations = nominations || [];
    }
    if (filter === 'history') {
      let history = await courtsModel.listCases('history');
      history = history.map((c) => {
        const id = String(currentUserId || '');
        const isAccuser = String(c.accuser || '') === id;
        const isRespondent = String(c.respondentId || '') === id;
        const ma = Array.isArray(c.mediatorsAccuser)
          ? c.mediatorsAccuser
          : [];
        const mr = Array.isArray(c.mediatorsRespondent)
          ? c.mediatorsRespondent
          : [];
        const isMediator = ma.includes(id) || mr.includes(id);
        const isJudge = String(c.judgeId || '') === id;
        const mine = isAccuser || isRespondent || isMediator || isJudge;
        const publicDetails =
          c.publicPrefAccuser === true &&
          c.publicPrefRespondent === true;
        const decidedAt =
          c.verdictAt ||
          c.closedAt ||
          c.decidedAt;
        return {
          ...c,
          respondent: c.respondentId || c.respondent,
          mine,
          publicDetails,
          decidedAt
        };
      });
      if (search) {
        const sLower = search.toLowerCase();
        history = history.filter((c) => {
          const t = String(c.title || '').toLowerCase();
          const d = String(c.description || '').toLowerCase();
          return t.includes(sLower) || d.includes(sLower);
        });
      }
      state.history = history;
    }
    ctx.body = await courtsView(state);
  })
  .get('/courts/cases/:id', async (ctx) => {
    const mod = ctx.cookies.get('courtsMod') || 'on';
    if (mod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const caseId = ctx.params.id;
    let caseData = null;
    try {
      caseData = await courtsModel.getCaseDetails({ caseId });
    } catch (e) {
      caseData = null;
    }
    const state = { caseData };
    ctx.body = await courtsCaseView(state);
  })
  .get('/tribes', async ctx => {
    const filter = ctx.query.filter || 'all';
    const search = ctx.query.search || ''; 
    const tribes = await tribesModel.listAll();
    let filteredTribes = tribes;
    if (search) {
      filteredTribes = tribes.filter(tribe => 
      tribe.title.toLowerCase().includes(search.toLowerCase()) 
      );
    }
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
    const tribeId = ctx.params.tribeId;
    const tribe = await tribesModel.getTribeById(tribeId);
    const userId = SSBconfig.config.keys.id;
    const query = ctx.query; 
    if (!query.feedFilter) {
      query.feedFilter = 'TOP';
    }
    if (tribe.isAnonymous === false && !tribe.members.includes(userId)) {
      ctx.status = 403;
      ctx.body = { message: 'You cannot access to this tribe!' };
       return;
    }
    if (!tribe.members.includes(userId)) {
      ctx.status = 403;
      ctx.body = { message: 'You cannot access to this tribe!' };
      return;
   }
    ctx.body = await tribeView(tribe, userId, query);
  })
  .get('/activity', async ctx => {
    const filter = ctx.query.filter || 'recent';
    const userId = SSBconfig.config.keys.id;
    try { await bankingModel.ensureSelfAddressPublished(); } catch (_) {}
    try { await bankingModel.getUserEngagementScore(userId); } catch (_) {}
    const actions = await activityModel.listFeed(filter);
    ctx.body = activityView(actions, filter, userId);
  })
  .get("/profile", async (ctx) => {
    const myFeedId = await meta.myFeedId()
    const gt = Number(ctx.request.query["gt"] || -1)
    const lt = Number(ctx.request.query["lt"] || -1)
    if (lt > 0 && gt > 0 && gt >= lt) throw new Error("Given search range is empty")
    const description = await about.description(myFeedId)
    const name = await about.name(myFeedId)
    const image = await about.image(myFeedId)
    const messages = await post.fromPublicFeed(myFeedId, gt, lt)
    const firstPost = await post.firstBy(myFeedId)
    const lastPost = await post.latestBy(myFeedId)
    const avatarUrl = getAvatarUrl(image)
    const ecoAddress = await bankingModel.getUserAddress(myFeedId)
    const { karmaScore } = await bankingModel.getBankingData(myFeedId)
    const normTs = (t) => {
    const n = Number(t || 0)
      if (!isFinite(n) || n <= 0) return 0
      return n < 1e12 ? n * 1000 : n
    }
    const pickTs = (obj) => {
      if (!obj) return 0
      const v = obj.value || obj
      return normTs(v.timestamp || v.ts || v.time || (v.meta && v.meta.timestamp) || 0)
    }
    const msgTs = Array.isArray(messages) && messages.length ? Math.max(...messages.map(pickTs)) : 0
    const tsLastPost = pickTs(lastPost)
    const tsFirstPost = pickTs(firstPost)
    let lastActivityTs = Math.max(msgTs, tsLastPost, tsFirstPost)

    if (!lastActivityTs) {
      const pull = require("../server/node_modules/pull-stream")
      const ssbClientGUI = require("../client/gui")
      const coolerInstance = ssbClientGUI({ offline: require("../server/ssb_config").offline })
      const ssb = await coolerInstance.open()
      lastActivityTs = await new Promise((resolve) => {
        pull(
          ssb.createUserStream({ id: myFeedId, reverse: true }),
          pull.filter(m => m && m.value && m.value.content && m.value.content.type !== "tombstone"),
          pull.take(1),
          pull.collect((err, arr) => {
            if (err || !arr || !arr.length) return resolve(0)
            const m = arr[0]
            resolve(normTs((m.value && m.value.timestamp) || m.timestamp))
          })
        )
      })
    }
    const days = lastActivityTs ? (Date.now() - lastActivityTs) / 86400000 : Infinity
    const lastActivityBucket = days < 14 ? "green" : days < 182.5 ? "orange" : "red"
    ctx.body = await authorView({
      feedId: myFeedId,
      messages,
      firstPost,
      lastPost,
      name,
      description,
      avatarUrl,
      relationship: { me: true },
      ecoAddress,
      karmaScore,
      lastActivityBucket
    })
  })
  .get("/profile/edit", async (ctx) => {
    const myFeedId = await meta.myFeedId();
    const description = await about.description(myFeedId);
    const name = await about.name(myFeedId);

    ctx.body = await editProfileView({
      name,
      description,
    });
  })
  .post("/profile/edit", koaBody({ multipart: true }), async (ctx) => {
    const name = String(ctx.request.body.name);
    const description = String(ctx.request.body.description);

    const image = await promisesFs.readFile(ctx.request.files.image.filepath);

    ctx.body = await post.publishProfileEdit({
      name,
      description,
      image,
    });
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
    const theme = ctx.cookies.get("theme") || "Dark-SNH";
    const config = getConfig();
    const aiPrompt = config.ai?.prompt || "";
    const pubWalletUrl = config.walletPub?.url || '';
    const pubWalletUser = config.walletPub?.user || '';
    const pubWalletPass = config.walletPub?.pass || '';
    const getMeta = async ({ theme, aiPrompt, pubWalletUrl, pubWalletUser, pubWalletPass }) => {
      return settingsView({
        theme,
        version: version.toString(),
        aiPrompt,
        pubWalletUrl, 
        pubWalletUser,
        pubWalletPass
      });
    };
    ctx.body = await getMeta({ 
      theme, 
      aiPrompt, 
      pubWalletUrl, 
      pubWalletUser, 
      pubWalletPass 
    });
  })
  .get("/peers", async (ctx) => {
    const { discoveredPeers, unknownPeers } = await meta.discovered();
    const onlinePeers = await meta.onlinePeers();
    ctx.body = await peersView({
      onlinePeers,
      discoveredPeers,
      unknownPeers
    });
  })
  .get("/invites", async (ctx) => {
    const theme = ctx.cookies.get("theme") || config.theme;
    const invitesMod = ctx.cookies.get("invitesMod") || 'on'; 
    if (invitesMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const getMeta = async ({ theme }) => {
      return invitesView({});
    };
    ctx.body = await getMeta({ theme });
  })
  .get("/likes/:feed", async (ctx) => {
    const { feed } = ctx.params;
    const likes = async ({ feed }) => {
      const pendingMessages = post.likes({ feed });
      const pendingName = about.name(feed);
      return likesView({
        messages: await pendingMessages,
        feed,
        name: await pendingName,
      });
    };
    ctx.body = await likes({ feed });
  })
  .get("/mentions", async (ctx) => {
    const { messages, myFeedId } = await post.mentionsMe();
    ctx.body = await mentionsView({ messages, myFeedId });
  })
  .get('/opinions', async (ctx) => {
    const filter = ctx.query.filter || 'RECENT';
    const opinions = await opinionsModel.listOpinions(filter);
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
    const forumMod = ctx.cookies.get("forumMod") || 'on';
    if (forumMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const filter = ctx.query.filter || 'hot';
    const forums = await forumModel.listAll(filter);
    ctx.body = await forumView(forums, filter);
  })
  .get('/forum/:forumId', async ctx => {
    const rawId = ctx.params.forumId
    const msg = await forumModel.getMessageById(rawId)
    const isReply = Boolean(msg.root)
    const forumId = isReply ? msg.root : rawId
    const highlightCommentId = isReply ? rawId   : null
    const forum = await forumModel.getForumById(forumId)
    const messagesData = await forumModel.getMessagesByForumId(forumId)
    ctx.body = await singleForumView(
      forum,
      messagesData,
      ctx.query.filter,
      highlightCommentId
    )
  })
  .get('/legacy', async (ctx) => {
    const legacyMod = ctx.cookies.get("legacyMod") || 'on';
    if (legacyMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    try {
      ctx.body = await legacyView();
    } catch (error) {
      ctx.body = { error: error.message };
    }
  }) 
  .get('/bookmarks', async (ctx) => {
    const bookmarksMod = ctx.cookies.get("bookmarksMod") || 'on';
    if (bookmarksMod !== 'on') { ctx.redirect('/modules'); return; }

    const filter = ctx.query.filter || 'all';
    const q = ctx.query.q || '';
    const sort = ctx.query.sort || 'recent';
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;

    const favs = await mediaFavorites.getFavoriteSet("bookmarks");

    const effectiveFilter = filter === "favorites" ? "all" : filter;
    const bookmarks = await bookmarksModel.listAll({ viewerId, filter: effectiveFilter, q, sort });

    let withFav = bookmarks.map(b => {
      const root = b.rootId || b.id;
      return { ...b, isFavorite: favs.has(String(root)) };
    });

    if (filter === "favorites") {
      withFav = withFav.filter(b => b.isFavorite);
    }

    const commentsCountByBookmarkId = {};
    await Promise.all(
      withFav.map(async b => {
        const root = b.rootId || b.id;
        const comments = await getVoteComments(root);
        commentsCountByBookmarkId[b.id] = comments.length;
      })
    );

    const enrichedBookmarks = withFav.map(b => ({
      ...b,
      commentCount: commentsCountByBookmarkId[b.id] || 0
    }));

    ctx.body = await bookmarkView(enrichedBookmarks, filter, null, { q, sort });
  })
  .get("/bookmarks/edit/:id", async (ctx) => {
    const bookmarksMod = ctx.cookies.get("bookmarksMod") || "on";
    if (bookmarksMod !== "on") { ctx.redirect("/modules"); return; }
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;
    const bookmark = await bookmarksModel.getBookmarkById(ctx.params.id, viewerId);
    const favs = await mediaFavorites.getFavoritesSet("bookmarks");
    const withFav = { ...bookmark, isFav: favs.has(String(bookmark.rootId || bookmark.id)) };
    ctx.body = await bookmarkView([withFav], "edit", withFav.id, { returnTo: ctx.query.returnTo || "" });
  })
  .get('/bookmarks/:bookmarkId', async (ctx) => {
    const bookmarksMod = ctx.cookies.get("bookmarksMod") || 'on';
    if (bookmarksMod !== 'on') { ctx.redirect('/modules'); return; }

    const bookmarkId = ctx.params.bookmarkId;
    const filter = ctx.query.filter || 'all';
    const q = ctx.query.q || '';
    const sort = ctx.query.sort || 'recent';

    const favs = await mediaFavorites.getFavoriteSet("bookmarks");

    const bookmark = await bookmarksModel.getBookmarkById(bookmarkId);
    const root = bookmark.rootId || bookmark.id;

    const comments = await getVoteComments(root);

    const bookmarkWithCount = {
      ...bookmark,
      commentCount: comments.length,
      isFavorite: favs.has(String(root))
    };

    ctx.body = await singleBookmarkView(bookmarkWithCount, filter, comments, {
      q, sort,
      returnTo: safeReturnTo(ctx, `/bookmarks?filter=${encodeURIComponent(filter)}`, ['/bookmarks'])
    });
  })
  .get('/tasks', async ctx => {
    const filter = ctx.query.filter || 'all';
    const tasks = await tasksModel.listAll();
    const commentsCountByTaskId = {};
    await Promise.all(
      tasks.map(async t => {
        const comments = await getVoteComments(t.id);
        commentsCountByTaskId[t.id] = comments.length;
      })
    );
    const enrichedTasks = tasks.map(t => ({
      ...t,
      commentCount: commentsCountByTaskId[t.id] || 0
    }));
    ctx.body = await taskView(enrichedTasks, filter, null, ctx.query.returnTo);
  })
  .get('/tasks/edit/:id', async ctx => {
    const id = ctx.params.id;
    const task = await tasksModel.getTaskById(id);
    ctx.body = await taskView(task, 'edit', id, ctx.query.returnTo);
  })
  .get('/tasks/:taskId', async ctx => {
    const taskId = ctx.params.taskId;
    const filter = ctx.query.filter || 'all';
    const task = await tasksModel.getTaskById(taskId);
    const comments = await getVoteComments(taskId);
    const taskWithCount = { ...task, commentCount: comments.length };
    ctx.body = await singleTaskView(taskWithCount, filter, comments);
  })
  .get('/events', async (ctx) => {
    const eventsMod = ctx.cookies.get("eventsMod") || 'on';
    if (eventsMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const filter = ctx.query.filter || 'all';
    const events = await eventsModel.listAll(null, filter);
    const commentsCountByEventId = {};
    await Promise.all(
      events.map(async e => {
        const comments = await getVoteComments(e.id);
        commentsCountByEventId[e.id] = comments.length;
      })
    );
    const enrichedEvents = events.map(e => ({
      ...e,
      commentCount: commentsCountByEventId[e.id] || 0
    }));
    ctx.body = await eventView(enrichedEvents, filter, null, ctx.query.returnTo);
  })
  .get('/events/edit/:id', async (ctx) => {
    const eventsMod = ctx.cookies.get("eventsMod") || 'on';
    if (eventsMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const eventId = ctx.params.id;
    const event = await eventsModel.getEventById(eventId);
    ctx.body = await eventView([event], 'edit', eventId, ctx.query.returnTo);
  })
  .get('/events/:eventId', async ctx => {
    const eventId = ctx.params.eventId;
    const filter = ctx.query.filter || 'all';
    const event = await eventsModel.getEventById(eventId);
    const comments = await getVoteComments(eventId);
    const eventWithCount = { ...event, commentCount: comments.length };
    ctx.body = await singleEventView(eventWithCount, filter, comments);
  })
  .get('/votes', async ctx => {
    const filter = ctx.query.filter || 'all';
    const voteList = await votesModel.listAll(filter);
    const commentsCountByVoteId = {};
    await Promise.all(
      voteList.map(async v => {
        const comments = await getVoteComments(v.id);
        commentsCountByVoteId[v.id] = comments.length;
      })
    );
    const enrichedVotes = voteList.map(v => ({
      ...v,
      commentCount: commentsCountByVoteId[v.id] || 0
    }));
    ctx.body = await voteView(enrichedVotes, filter, null, [], filter);
  })
  .get('/votes/edit/:id', async ctx => {
    const id = ctx.params.id;
    const activeFilter = (ctx.query.filter || 'mine');
    const voteData = await votesModel.getVoteById(id);
    ctx.body = await voteView([voteData], 'edit', id, [], activeFilter);
  })
  .get('/votes/:voteId', async ctx => {
    const voteId = ctx.params.voteId;
    const activeFilter = (ctx.query.filter || 'all');
    const voteData = await votesModel.getVoteById(voteId);
    const comments = await getVoteComments(voteId);
    const voteWithCount = { ...voteData, commentCount: comments.length };
    ctx.body = await voteView([voteWithCount], 'detail', voteId, comments, activeFilter);
  })
  .get("/market", async (ctx) => {
    const marketMod = ctx.cookies.get("marketMod") || "on"
    if (marketMod !== "on") {
      ctx.redirect("/modules")
      return
    }
    const filter = ctx.query.filter || "all"
    const q = ctx.query.q || ""
    const minPrice = ctx.query.minPrice ?? ""
    const maxPrice = ctx.query.maxPrice ?? ""
    const sort = ctx.query.sort || "recent"
    let marketItems = await marketModel.listAllItems("all")
    await marketModel.checkAuctionItemsStatus(marketItems)
    marketItems = await marketModel.listAllItems("all")
    const commentsCountById = {}
    await Promise.all(
      marketItems.map(async (item) => {
        const comments = await getVoteComments(item.id)
        commentsCountById[item.id] = comments.length
      })
    )
    marketItems = marketItems.map((item) => ({ ...item, commentCount: commentsCountById[item.id] || 0 }))
    ctx.body = await marketView(marketItems, filter, null, { q, minPrice, maxPrice, sort })
  })
  .get("/market/edit/:id", async (ctx) => {
    const marketMod = ctx.cookies.get("marketMod") || "on"
    if (marketMod !== "on") {
      ctx.redirect("/modules")
      return
    }
    const id = ctx.params.id
    let marketItem = await marketModel.getItemById(id)
    if (!marketItem) ctx.throw(404, "Item not found")
    await marketModel.checkAuctionItemsStatus([marketItem])
    marketItem = await marketModel.getItemById(id)
    if (!marketItem) ctx.throw(404, "Item not found")
    ctx.body = await marketView([marketItem], "edit", marketItem, { q: "", minPrice: "", maxPrice: "", sort: "recent" })
  })
  .get("/market/:itemId", async (ctx) => {
    const marketMod = ctx.cookies.get("marketMod") || "on"
    if (marketMod !== "on") {
      ctx.redirect("/modules")
      return
    }
    const itemId = ctx.params.itemId
    const filter = ctx.query.filter || "all"
    const q = ctx.query.q || ""
    const minPrice = ctx.query.minPrice ?? ""
    const maxPrice = ctx.query.maxPrice ?? ""
    const sort = ctx.query.sort || "recent"
    let item = await marketModel.getItemById(itemId)
    if (!item) ctx.throw(404, "Item not found")
    await marketModel.checkAuctionItemsStatus([item])
    item = await marketModel.getItemById(itemId)
    if (!item) ctx.throw(404, "Item not found")
    const comments = await getVoteComments(itemId)
    const itemWithCount = { ...item, commentCount: comments.length }
    const returnTo = (() => {
    const params = []
      if (filter) params.push(`filter=${encodeURIComponent(filter)}`)
      if (q) params.push(`q=${encodeURIComponent(q)}`)
      if (minPrice !== "" && minPrice != null) params.push(`minPrice=${encodeURIComponent(String(minPrice))}`)
      if (maxPrice !== "" && maxPrice != null) params.push(`maxPrice=${encodeURIComponent(String(maxPrice))}`)
      if (sort) params.push(`sort=${encodeURIComponent(sort)}`)
      return `/market${params.length ? `?${params.join("&")}` : ""}`
    })()
    ctx.body = await singleMarketView(itemWithCount, filter, comments, { q, minPrice, maxPrice, sort, returnTo })
  })
  .get('/jobs', async (ctx) => {
    const jobsMod = ctx.cookies.get("jobsMod") || 'on'
    if (jobsMod !== 'on') { ctx.redirect('/modules'); return }
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
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id
    let jobs = await jobsModel.listJobs(filter, viewerId, query)
    const commentsCountById = {}
    await Promise.all(
      jobs.map(async job => {
        const comments = await getVoteComments(job.id)
        commentsCountById[job.id] = comments.length
      })
    )
    jobs = jobs.map(job => ({
      ...job,
      commentCount: commentsCountById[job.id] || 0
    }))
    ctx.body = await jobsView(jobs, filter, query)
  })
  .get('/jobs/edit/:id', async (ctx) => {
    const jobsMod = ctx.cookies.get("jobsMod") || 'on'
    if (jobsMod !== 'on') { ctx.redirect('/modules'); return }
    const id = ctx.params.id
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id
    const job = await jobsModel.getJobById(id, viewerId)
    ctx.body = await jobsView([job], 'EDIT', {})
  })
  .get('/jobs/:jobId', async (ctx) => {
    const jobsMod = ctx.cookies.get("jobsMod") || 'on'
    if (jobsMod !== 'on') { ctx.redirect('/modules'); return }
    const jobId = ctx.params.jobId
    let filter = String(ctx.query.filter || 'ALL').toUpperCase()
    if (filter === 'FAVS' || filter === 'NEEDS') filter = 'ALL'
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id
    const params = {
      search: ctx.query.search || '',
      minSalary: ctx.query.minSalary ?? '',
      maxSalary: ctx.query.maxSalary ?? '',
      sort: ctx.query.sort || 'recent',
      returnTo: safeReturnTo(ctx, `/jobs?filter=${encodeURIComponent(filter)}`, ['/jobs'])
    }
    const job = await jobsModel.getJobById(jobId, viewerId)
    const comments = await getVoteComments(jobId)
    const jobWithCount = { ...job, commentCount: comments.length }
    ctx.body = await singleJobsView(jobWithCount, filter, comments, params)
  })
  .get("/projects", async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }
    const filter = String(ctx.query.filter || "ALL").toUpperCase()
    if (filter === "CREATE") {
      ctx.body = await projectsView([], "CREATE")
      return
    }
    const modelFilter = filter === "BACKERS" ? "ALL" : filter
    let projects = await projectsModel.listProjects(modelFilter)
    const commentsCountById = {}
    await Promise.all(
      projects.map(async (pr) => {
        const comments = await getVoteComments(pr.id)
        commentsCountById[pr.id] = comments.length
      })
    )
    projects = projects.map((pr) => ({ ...pr, commentCount: commentsCountById[pr.id] || 0 }))
    ctx.body = await projectsView(projects, filter)
  })
  .get("/projects/edit/:id", async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }
    const id = ctx.params.id
    const pr = await projectsModel.getProjectById(id)
    ctx.body = await projectsView([pr], "EDIT")
  })
  .get("/projects/:projectId", async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }
    const projectId = ctx.params.projectId
    const filter = String(ctx.query.filter || "ALL").toUpperCase()
    const project = await projectsModel.getProjectById(projectId)
    const comments = await getVoteComments(projectId)
    const projectWithCount = { ...project, commentCount: comments.length }
    ctx.body = await singleProjectView(projectWithCount, filter, comments)
  })
  .get("/banking", async (ctx) => {
    const bankingMod = ctx.cookies.get("bankingMod") || 'on';
    if (bankingMod !== 'on') { 
      ctx.redirect('/modules'); 
      return; 
    }
    const userId = SSBconfig.config.keys.id;
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
    const userId = SSBconfig.config.keys.id;
    const allocation = await bankingModel.getAllocationById(ctx.params.id);
    ctx.body = renderSingleAllocationView(allocation, userId);
  })
  .get("/banking/epoch/:id", async (ctx) => {
    const epoch = await bankingModel.getEpochById(ctx.params.id);
    const allocations = await bankingModel.listEpochAllocations(ctx.params.id);
    ctx.body = renderEpochView(epoch, allocations);
  })
  .get("/favorites", async (ctx) => {
    const filter = ctx.query.filter || "all";
    const data = await favoritesModel.listAll({ filter });
    ctx.body = await favoritesView(data.items, filter, data.counts);
  })
  .get('/cipher', async (ctx) => {
    const cipherMod = ctx.cookies.get("cipherMod") || 'on';
    if (cipherMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
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
    const walletMod = ctx.cookies.get("walletMod") || 'on';
    if (walletMod !== 'on') { ctx.redirect('/modules'); return; }
    try {
      const balance = await walletModel.getBalance(url, user, pass);
      const address = await walletModel.getAddress(url, user, pass);
      const userId = SSBconfig.config.keys.id;
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
      const userId = SSBconfig.config.keys.id;
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
      const userId = SSBconfig.config.keys.id;
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

      const userId = SSBconfig.config.keys.id;
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
    const transfersMod = ctx.cookies.get("transfersMod") || 'on'
    if (transfersMod !== 'on') { ctx.redirect('/modules'); return }
    let filter = ctx.query.filter || 'all'
    if (filter === 'favs') filter = 'all'
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id
    const list = await transfersModel.listAll(filter, viewerId)
    ctx.body = await transferView(list, filter, null, {
      q: ctx.query.q || '',
      minAmount: ctx.query.minAmount ?? '',
      maxAmount: ctx.query.maxAmount ?? '',
      sort: ctx.query.sort || 'recent'
    })
  })
  .get('/transfers/edit/:id', async ctx => {
    const transfersMod = ctx.cookies.get("transfersMod") || 'on'
    if (transfersMod !== 'on') { ctx.redirect('/modules'); return }
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id
    const tr = await transfersModel.getTransferById(ctx.params.id, viewerId)
    ctx.body = await transferView([tr], 'edit', ctx.params.id, {})
  })
  .get('/transfers/:transferId', async ctx => {
    const transfersMod = ctx.cookies.get("transfersMod") || 'on'
    if (transfersMod !== 'on') { ctx.redirect('/modules'); return }
    const transferId = ctx.params.transferId
    let filter = ctx.query.filter || 'all'
    if (filter === 'favs') filter = 'all'
    const viewerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id
    const transfer = await transfersModel.getTransferById(transferId, viewerId)
    const params = {
      q: ctx.query.q || '',
      minAmount: ctx.query.minAmount ?? '',
      maxAmount: ctx.query.maxAmount ?? '',
      sort: ctx.query.sort || 'recent',
      returnTo: safeReturnTo(ctx, `/transfers?filter=${encodeURIComponent(filter)}`, ['/transfers'])
    }
    ctx.body = await singleTransferView(transfer, filter, params)
  })

  //POST backend routes   
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
    const { id } = ctx.params;
    await pmModel.deleteMessageById(id);
    ctx.redirect('/inbox');
  })
  .post('/inbox/delete/:id', koaBody(), async ctx => {
    const { id } = ctx.params;
    await pmModel.deleteMessageById(id);
    ctx.redirect('/inbox');
  })
  .post("/search", koaBody(), async (ctx) => {
    const body = ctx.request.body;
    const query = body.query || "";
    let types = body.type || [];
    if (typeof types === "string") types = [types];
    if (!Array.isArray(types)) types = [];
    if (!query) {
      return ctx.body = await searchView({ messages: [], query, types });
    }
    const results = await searchModel.search({ query, types });
    const groupedResults = Object.entries(results).reduce((acc, [type, msgs]) => {
      acc[type] = msgs.map(msg => {
        if (!msg.value || !msg.value.content) {
         return {};
        }
        return {
          ...msg,
          content: msg.value.content,
          author: msg.value.content.author || 'Unknown', 
        };
      });
      return acc;
    }, {});
    ctx.body = await searchView({ results: groupedResults, query, types });
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
    const rawContentWarning = ctx.request.body.contentWarning?.toString().trim() || "";
    const contentWarning = rawContentWarning.length > 0 ? rawContentWarning : undefined;
    const previewData = await preparePreview(ctx);
    ctx.body = await previewView({ previewData, contentWarning });
  })
  .post("/publish", koaBody({ multipart: true, urlencoded: true, formidable: { multiples: false } }), async (ctx) => {
    const text = ctx.request.body.text?.toString().trim() || "";
    const rawContentWarning = ctx.request.body.contentWarning?.toString().trim() || "";
    const contentWarning = rawContentWarning.length > 0 ? rawContentWarning : undefined;
    let mentions = [];
    try {
      mentions = JSON.parse(ctx.request.body.mentions || "[]");
   } catch (e) {
      mentions = await extractMentions(text);
    }
    await post.root({ text, mentions, contentWarning });
    ctx.redirect("/public/latest");
  })
  .post("/publish/custom", koaBody(), async (ctx) => {
    const text = String(ctx.request.body.text);
    const obj = JSON.parse(text);
    ctx.body = await post.publishCustom(obj);
    ctx.redirect(`/public/latest`);
  })
  .post("/follow/:feed", koaBody(), async (ctx) => {
    const { feed } = ctx.params;
    const referer = new URL(ctx.request.header.referer);
    ctx.body = await friend.follow(feed);
    ctx.redirect(referer.href);
  })
  .post("/unfollow/:feed", koaBody(), async (ctx) => {
    const { feed } = ctx.params;
    const referer = new URL(ctx.request.header.referer);
    ctx.body = await friend.unfollow(feed);
    ctx.redirect(referer.href);
  })
  .post("/block/:feed", koaBody(), async (ctx) => {
    const { feed } = ctx.params;
    const referer = new URL(ctx.request.header.referer);
    ctx.body = await friend.block(feed);
    ctx.redirect(referer.href);
  })
  .post("/unblock/:feed", koaBody(), async (ctx) => {
    const { feed } = ctx.params;
    const referer = new URL(ctx.request.header.referer);
    ctx.body = await friend.unblock(feed);
    ctx.redirect(referer.href);
  })
  .post("/like/:message", koaBody(), async (ctx) => {
    const { message } = ctx.params;
    const messageKey = message;
    const voteValue = Number(ctx.request.body.voteValue);
    const encoded = {
      message: encodeURIComponent(message),
    };
    const referer = new URL(ctx.request.header.referer);
    referer.hash = `centered-footer-${encoded.message}`;
    const like = async ({ messageKey, voteValue }) => {
      const value = Number(voteValue);
      const message = await post.get(messageKey);

      const isPrivate = message.value.meta.private === true;
      const messageRecipients = isPrivate ? message.value.content.recps : [];

      const normalized = messageRecipients.map((recipient) => {
        if (typeof recipient === "string") {
          return recipient;
        }

        if (typeof recipient.link === "string") {
          return recipient.link;
        }
        return null;
      });
      const recipients = normalized.length > 0 ? normalized : undefined;
      return vote.publish({ messageKey, value, recps: recipients });
    };
    ctx.body = await like({ messageKey, voteValue });
    ctx.redirect(referer.href);
  }) 
  .post('/forum/create', koaBody(), async ctx => {
    const { category, title, text } = ctx.request.body;
    await forumModel.createForum(category, title, text);
    ctx.redirect('/forum');
  })
  .post('/forum/:id/message', koaBody(), async ctx => {
    const forumId = ctx.params.id;
    const { message, parentId } = ctx.request.body;
    const userId = SSBconfig.config.keys.id;
    const newMessage = { text: message, author: userId, timestamp: new Date().toISOString() };
    await forumModel.addMessageToForum(forumId, newMessage, parentId);
    ctx.redirect(`/forum/${encodeURIComponent(forumId)}`);
  })
  .post('/forum/:forumId/vote', koaBody(), async ctx => {
    const { forumId } = ctx.params;
    const { target, value } = ctx.request.body;
    await forumModel.voteContent(target, parseInt(value, 10));
    const back = ctx.get('referer') || `/forum/${encodeURIComponent(forumId)}`;
    ctx.redirect(back);
  })
  .post('/forum/delete/:id', koaBody(), async ctx => {
    await forumModel.deleteForumById(ctx.params.id);
    ctx.redirect('/forum');
  })
  .post('/legacy/export', koaBody(), async (ctx) => {
    const password = ctx.request.body.password;
    if (!password || password.length < 32) {
      ctx.redirect('/legacy'); 
      return;
    }
    try {
      const encryptedFilePath = await legacyModel.exportData({ password });
      ctx.body = {
        message: 'Data exported successfully!',
        file: encryptedFilePath
      };
      ctx.redirect('/legacy');
    } catch (error) {
      ctx.status = 500;
      ctx.body = { error: `Error: ${error.message}` };
      ctx.redirect('/legacy');
    }
  })
  .post('/legacy/import', koaBody({ 
    multipart: true, 
    formidable: { 
      keepExtensions: true, 
      uploadDir: '/tmp', 
      } 
    }), async (ctx) => {
    const uploadedFile = ctx.request.files?.uploadedFile;
    const password = ctx.request.body.importPassword;
    if (!uploadedFile) {
      ctx.body = { error: 'No file uploaded' };
      ctx.redirect('/legacy');
      return;
    }
    if (!password || password.length < 32) {
      ctx.body = { error: 'Password is too short or missing.' };
      ctx.redirect('/legacy');
      return;
    }
    try {
      await legacyModel.importData({ filePath: uploadedFile.filepath, password });
      ctx.body = { message: 'Data imported successfully!' };
      ctx.redirect('/legacy');
    } catch (error) {
      ctx.body = { error: error.message };
      ctx.redirect('/legacy');
    }
  })
  .post('/trending/:contentId/:category', async (ctx) => {
    const { contentId, category } = ctx.params;
    const voterId = SSBconfig?.keys?.id;
    const target = await trendingModel.getMessageById(contentId);
    if (target?.content?.opinions_inhabitants?.includes(voterId)) {
      ctx.flash = { message: 'You have already opined.' };
      ctx.redirect('/trending');
      return;
    }
    await trendingModel.createVote(contentId, category);
    ctx.redirect('/trending');
  })
  .post('/opinions/:contentId/:category', async (ctx) => {
    const { contentId, category } = ctx.params;
    const voterId = SSBconfig?.keys?.id;
    const target = await opinionsModel.getMessageById(contentId);
    if (target?.content?.opinions_inhabitants?.includes(voterId)) {
      ctx.flash = { message: 'You have already opined.' };
      ctx.redirect('/opinions');
      return;
    }
    await opinionsModel.createVote(contentId, category);
    ctx.redirect('/opinions');
  })
  .post('/agenda/discard/:itemId', async (ctx) => {
    const { itemId } = ctx.params;
    await agendaModel.discardItem(itemId);
    ctx.redirect('/agenda');
  })
  .post('/agenda/restore/:itemId', async (ctx) => {
    const { itemId } = ctx.params;
    await agendaModel.restoreItem(itemId);
    ctx.redirect('/agenda?filter=discarded');
  })
  .post("/feed/create", koaBody(), async (ctx) => {
    const text = ctx.request.body && ctx.request.body.text != null ? String(ctx.request.body.text) : "";
    await feedModel.createFeed(text);
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
    const bookmarksMod = ctx.cookies.get("bookmarksMod") || "on";
    if (bookmarksMod !== "on") { ctx.redirect("/modules"); return; }
    const { url, tags, description, category, lastVisit } = ctx.request.body;
    await bookmarksModel.createBookmark(url, tags, description, category, lastVisit);
    ctx.redirect(safeReturnTo(ctx, "/bookmarks?filter=all", ["/bookmarks"]));
  })
  .post("/bookmarks/update/:id", koaBody(), async (ctx) => {
    const bookmarksMod = ctx.cookies.get("bookmarksMod") || "on";
    if (bookmarksMod !== "on") { ctx.redirect("/modules"); return; }
    const { url, tags, description, category, lastVisit } = ctx.request.body;
    await bookmarksModel.updateBookmarkById(ctx.params.id, { url, tags, description, category, lastVisit });
    ctx.redirect(safeReturnTo(ctx, "/bookmarks?filter=mine", ["/bookmarks"]));
  })
  .post("/bookmarks/delete/:id", koaBody(), async (ctx) => {
    const bookmarksMod = ctx.cookies.get("bookmarksMod") || "on";
    if (bookmarksMod !== "on") { ctx.redirect("/modules"); return; }
    await bookmarksModel.deleteBookmarkById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, "/bookmarks?filter=mine", ["/bookmarks"]));
  })
  .post("/bookmarks/opinions/:bookmarkId/:category", koaBody(), async (ctx) => {
    const bookmarksMod = ctx.cookies.get("bookmarksMod") || "on";
    if (bookmarksMod !== "on") { ctx.redirect("/modules"); return; }
    const { bookmarkId, category } = ctx.params;
    await bookmarksModel.createOpinion(bookmarkId, category);
    ctx.redirect(safeReturnTo(ctx, "/bookmarks", ["/bookmarks"]));
  })
  .post("/bookmarks/favorites/add/:id", koaBody(), async (ctx) => {
    const bookmarksMod = ctx.cookies.get("bookmarksMod") || "on";
    if (bookmarksMod !== "on") { ctx.redirect("/modules"); return; }
    const rootId = await bookmarksModel.resolveRootId(ctx.params.id);
    await mediaFavorites.addFavorite("bookmarks", rootId);
    ctx.redirect(safeReturnTo(ctx, "/bookmarks", ["/bookmarks"]));
  })
  .post("/bookmarks/favorites/remove/:id", koaBody(), async (ctx) => {
    const bookmarksMod = ctx.cookies.get("bookmarksMod") || "on";
    if (bookmarksMod !== "on") { ctx.redirect("/modules"); return; }
    const rootId = await bookmarksModel.resolveRootId(ctx.params.id);
    await mediaFavorites.removeFavorite("bookmarks", rootId);
    ctx.redirect(safeReturnTo(ctx, "/bookmarks", ["/bookmarks"]));
  })
  .post("/bookmarks/:bookmarkId/comments", koaBody(), async (ctx) => {
    const bookmarksMod = ctx.cookies.get("bookmarksMod") || "on";
    if (bookmarksMod !== "on") { ctx.redirect("/modules"); return; }
    const { bookmarkId } = ctx.params;
    const { text, rootId } = ctx.request.body;
    const trimmed = (text || "").trim();
    const rt = safeReturnTo(ctx, `/bookmarks/${encodeURIComponent(bookmarkId)}`, ["/bookmarks"]);
    if (!trimmed) { ctx.redirect(rt); return; }
    const root = String(rootId || "").trim() || bookmarkId;
    await post.publish({ text: trimmed, root, dest: root });
    ctx.redirect(rt);
  })
  .post("/images/create", koaBody({ multipart: true }), async (ctx) => {
    const imagesMod = ctx.cookies.get("imagesMod") || "on";
    if (imagesMod !== "on") { ctx.redirect("/modules"); return; }
    const blob = await handleBlobUpload(ctx, "image");
    const { tags, title, description, meme } = ctx.request.body;
    const memeBool = parseBool01(meme);
    await imagesModel.createImage(blob, tags, title, description, memeBool);
    ctx.redirect(safeReturnTo(ctx, "/images?filter=all", ["/images"]));
  })
  .post("/images/update/:id", koaBody({ multipart: true }), async (ctx) => {
    const imagesMod = ctx.cookies.get("imagesMod") || "on";
    if (imagesMod !== "on") { ctx.redirect("/modules"); return; }
    const { tags, title, description, meme } = ctx.request.body;
    const memeBool = parseBool01(meme);
    const blob = ctx.request.files?.image ? await handleBlobUpload(ctx, "image") : null;
    await imagesModel.updateImageById(ctx.params.id, blob, tags, title, description, memeBool);
    ctx.redirect(safeReturnTo(ctx, "/images?filter=mine", ["/images"]));
  })
  .post("/images/delete/:id", koaBody(), async (ctx) => {
    const imagesMod = ctx.cookies.get("imagesMod") || "on";
    if (imagesMod !== "on") { ctx.redirect("/modules"); return; }
    await imagesModel.deleteImageById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, "/images?filter=mine", ["/images"]));
  })
  .post("/images/opinions/:imageId/:category", koaBody(), async (ctx) => {
    const imagesMod = ctx.cookies.get("imagesMod") || "on";
    if (imagesMod !== "on") { ctx.redirect("/modules"); return; }
    const { imageId, category } = ctx.params;
    await imagesModel.createOpinion(imageId, category);
    ctx.redirect(safeReturnTo(ctx, "/images", ["/images"]));
  })
  .post("/images/favorites/add/:id", koaBody(), async (ctx) => {
    const imagesMod = ctx.cookies.get("imagesMod") || "on";
    if (imagesMod !== "on") { ctx.redirect("/modules"); return; }
    const rootId = await imagesModel.resolveRootId(ctx.params.id);
    await mediaFavorites.addFavorite("images", rootId);
    ctx.redirect(safeReturnTo(ctx, "/images", ["/images"]));
  })
  .post("/images/favorites/remove/:id", koaBody(), async (ctx) => {
    const imagesMod = ctx.cookies.get("imagesMod") || "on";
    if (imagesMod !== "on") { ctx.redirect("/modules"); return; }
    const rootId = await imagesModel.resolveRootId(ctx.params.id);
    await mediaFavorites.removeFavorite("images", rootId);
    ctx.redirect(safeReturnTo(ctx, "/images", ["/images"]));
  })
  .post("/images/:imageId/comments", koaBody(), async (ctx) => {
    const imagesMod = ctx.cookies.get("imagesMod") || "on";
    if (imagesMod !== "on") { ctx.redirect("/modules"); return; }
    const { imageId } = ctx.params;
    const { text } = ctx.request.body;
    const trimmed = (text || "").trim();
    const rt = safeReturnTo(ctx, `/images/${encodeURIComponent(imageId)}`, ["/images"]);
    if (!trimmed) { ctx.redirect(rt); return; }
    await post.publish({
      text: trimmed,
      root: imageId,
      dest: imageId
    });
    ctx.redirect(rt);
  })
  .post("/audios/create", koaBody({ multipart: true }), async (ctx) => {
    const audiosMod = ctx.cookies.get("audiosMod") || "on";
    if (audiosMod !== "on") { ctx.redirect("/modules"); return; }
    const audioBlob = await handleBlobUpload(ctx, "audio");
    const { tags, title, description } = ctx.request.body;
    await audiosModel.createAudio(audioBlob, tags, title, description);
    ctx.redirect(safeReturnTo(ctx, "/audios?filter=all", ["/audios"]));
  })
  .post("/audios/update/:id", koaBody({ multipart: true }), async (ctx) => {
    const audiosMod = ctx.cookies.get("audiosMod") || "on";
    if (audiosMod !== "on") { ctx.redirect("/modules"); return; }
    const { tags, title, description } = ctx.request.body;
    const blob = ctx.request.files?.audio ? await handleBlobUpload(ctx, "audio") : null;
    await audiosModel.updateAudioById(ctx.params.id, blob, tags, title, description);
    ctx.redirect(safeReturnTo(ctx, "/audios?filter=mine", ["/audios"]));
  })
  .post("/audios/delete/:id", koaBody(), async (ctx) => {
    const audiosMod = ctx.cookies.get("audiosMod") || "on";
    if (audiosMod !== "on") { ctx.redirect("/modules"); return; }
    await audiosModel.deleteAudioById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, "/audios?filter=mine", ["/audios"]));
  })
  .post("/audios/opinions/:audioId/:category", koaBody(), async (ctx) => {
    const audiosMod = ctx.cookies.get("audiosMod") || "on";
    if (audiosMod !== "on") { ctx.redirect("/modules"); return; }
    const { audioId, category } = ctx.params;
    await audiosModel.createOpinion(audioId, category);
    ctx.redirect(safeReturnTo(ctx, "/audios", ["/audios"]));
  })
  .post("/audios/favorites/add/:id", koaBody(), async (ctx) => {
    const audiosMod = ctx.cookies.get("audiosMod") || "on";
    if (audiosMod !== "on") { ctx.redirect("/modules"); return; }
    const rootId = await audiosModel.resolveRootId(ctx.params.id);
    await mediaFavorites.addFavorite("audios", rootId);
    ctx.redirect(safeReturnTo(ctx, "/audios", ["/audios"]));
  })
  .post("/audios/favorites/remove/:id", koaBody(), async (ctx) => {
    const audiosMod = ctx.cookies.get("audiosMod") || "on";
    if (audiosMod !== "on") { ctx.redirect("/modules"); return; }
    const rootId = await audiosModel.resolveRootId(ctx.params.id);
    await mediaFavorites.removeFavorite("audios", rootId);
    ctx.redirect(safeReturnTo(ctx, "/audios", ["/audios"]));
  })
  .post("/audios/:audioId/comments", koaBody(), async (ctx) => {
    const audiosMod = ctx.cookies.get("audiosMod") || "on";
    if (audiosMod !== "on") { ctx.redirect("/modules"); return; }
    const { audioId } = ctx.params;
    const { text } = ctx.request.body;
    const trimmed = (text || "").trim();
    const rt = safeReturnTo(ctx, `/audios/${encodeURIComponent(audioId)}`, ["/audios"]);
    if (!trimmed) { ctx.redirect(rt); return; }
    await post.publish({
      text: trimmed,
      root: audioId,
      dest: audioId
    });
    ctx.redirect(rt);
  })
  .post("/videos/create", koaBody({ multipart: true }), async (ctx) => {
    const videosMod = ctx.cookies.get("videosMod") || "on";
    if (videosMod !== "on") { ctx.redirect("/modules"); return; }
    const videoBlob = await handleBlobUpload(ctx, "video");
    const { tags, title, description } = ctx.request.body;
    await videosModel.createVideo(videoBlob, tags, title, description);
    ctx.redirect(safeReturnTo(ctx, "/videos?filter=all", ["/videos"]));
  })
  .post("/videos/update/:id", koaBody({ multipart: true }), async (ctx) => {
    const videosMod = ctx.cookies.get("videosMod") || "on";
    if (videosMod !== "on") { ctx.redirect("/modules"); return; }
    const { tags, title, description } = ctx.request.body;
    const blob = ctx.request.files?.video ? await handleBlobUpload(ctx, "video") : null;
    await videosModel.updateVideoById(ctx.params.id, blob, tags, title, description);
    ctx.redirect(safeReturnTo(ctx, "/videos?filter=mine", ["/videos"]));
  })
  .post("/videos/delete/:id", koaBody(), async (ctx) => {
    const videosMod = ctx.cookies.get("videosMod") || "on";
    if (videosMod !== "on") { ctx.redirect("/modules"); return; }
    await videosModel.deleteVideoById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, "/videos?filter=mine", ["/videos"]));
  })
  .post("/videos/opinions/:videoId/:category", koaBody(), async (ctx) => {
    const videosMod = ctx.cookies.get("videosMod") || "on";
    if (videosMod !== "on") { ctx.redirect("/modules"); return; }
    const { videoId, category } = ctx.params;
    await videosModel.createOpinion(videoId, category);
    ctx.redirect(safeReturnTo(ctx, "/videos", ["/videos"]));
  })
  .post("/videos/favorites/add/:id", koaBody(), async (ctx) => {
    const videosMod = ctx.cookies.get("videosMod") || "on";
    if (videosMod !== "on") { ctx.redirect("/modules"); return; }
    const rootId = await videosModel.resolveRootId(ctx.params.id);
    await mediaFavorites.addFavorite("videos", rootId);
    ctx.redirect(safeReturnTo(ctx, "/videos", ["/videos"]));
  })
  .post("/videos/favorites/remove/:id", koaBody(), async (ctx) => {
    const videosMod = ctx.cookies.get("videosMod") || "on";
    if (videosMod !== "on") { ctx.redirect("/modules"); return; }
    const rootId = await videosModel.resolveRootId(ctx.params.id);
    await mediaFavorites.removeFavorite("videos", rootId);
    ctx.redirect(safeReturnTo(ctx, "/videos", ["/videos"]));
  })
  .post("/videos/:videoId/comments", koaBody(), async (ctx) => {
    const videosMod = ctx.cookies.get("videosMod") || "on";
    if (videosMod !== "on") { ctx.redirect("/modules"); return; }
    const { videoId } = ctx.params;
    const { text } = ctx.request.body;
    const trimmed = (text || "").trim();
    const rt = safeReturnTo(ctx, `/videos/${encodeURIComponent(videoId)}`, ["/videos"]);
    if (!trimmed) { ctx.redirect(rt); return; }
    await post.publish({
      text: trimmed,
      root: videoId,
      dest: videoId
    });
    ctx.redirect(rt);
  })
  .post("/documents/create", koaBody({ multipart: true }), async (ctx) => {
    const docBlob = await handleBlobUpload(ctx, "document");
    const { tags, title, description } = ctx.request.body;
    await documentsModel.createDocument(docBlob, tags, title, description);
    ctx.redirect(safeReturnTo(ctx, "/documents?filter=all", ["/documents"]));
  })
  .post("/documents/update/:id", koaBody({ multipart: true }), async (ctx) => {
    const { tags, title, description } = ctx.request.body;
    const blob = ctx.request.files?.document ? await handleBlobUpload(ctx, "document") : null;
    await documentsModel.updateDocumentById(ctx.params.id, blob, tags, title, description);
    ctx.redirect(safeReturnTo(ctx, "/documents?filter=mine", ["/documents"]));
  })
  .post("/documents/delete/:id", koaBody(), async (ctx) => {
    await documentsModel.deleteDocumentById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, "/documents?filter=mine", ["/documents"]));
  })
  .post("/documents/opinions/:documentId/:category", koaBody(), async (ctx) => {
    const { documentId, category } = ctx.params;
    await documentsModel.createOpinion(documentId, category);
    ctx.redirect(safeReturnTo(ctx, "/documents", ["/documents"]));
  })
  .post("/documents/favorites/add/:id", koaBody(), async (ctx) => {
    const rootId = await documentsModel.resolveRootId(ctx.params.id);
    await mediaFavorites.addFavorite("documents", rootId);
    ctx.redirect(safeReturnTo(ctx, "/documents", ["/documents"]));
  })
  .post("/documents/favorites/remove/:id", koaBody(), async (ctx) => {
    const rootId = await documentsModel.resolveRootId(ctx.params.id);
    await mediaFavorites.removeFavorite("documents", rootId);
    ctx.redirect(safeReturnTo(ctx, "/documents", ["/documents"])); 
  })
  .post("/documents/:documentId/comments", koaBody(), async (ctx) => {
    const { documentId } = ctx.params;
    const { text, rootId } = ctx.request.body;
    const trimmed = (text || "").trim();
    const rt = safeReturnTo(ctx, `/documents/${encodeURIComponent(documentId)}`, ["/documents"]);
    if (!trimmed) {
      ctx.redirect(rt);
      return;
    }
    const root = safeText(rootId) || documentId;
    await post.publish({ text: trimmed, root, dest: root });
    ctx.redirect(rt);
  })
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
    if (password.length < 32) {
      ctx.body = { error: 'Password is too short or missing.' };
      ctx.redirect('/cipher');
      return;
    }
    const { encryptedText, iv, salt, authTag } = cipherModel.encryptData(text, password);
    const view = await cipherView(encryptedText, "", iv, password); 
    ctx.body = view;
  })
  .post('/cipher/decrypt', koaBody(), async (ctx) => {
    const { encryptedText, password } = ctx.request.body;
    if (password.length < 32) {
      ctx.body = { error: 'Password is too short or missing.' };
      ctx.redirect('/cipher');
      return;
    }
    const decryptedText = cipherModel.decryptData(encryptedText, password);
    const view = await cipherView("", decryptedText, "", password);
    ctx.body = view;
  }) 
  .post('/tribes/create', koaBody({ multipart: true }), async ctx => {
    const { title, description, location, tags, isLARP, isAnonymous, inviteMode } = ctx.request.body;
    
    // Block L.A.R.P. creation
    if (isLARP === 'true' || isLARP === true) {
      ctx.status = 400;
      ctx.body = { error: "L.A.R.P. tribes cannot be created." };
      return;
    }  
    
    const image = await handleBlobUpload(ctx, 'image');
    await tribesModel.createTribe(
      title,
      description,
      image,
      location,
      tags,
      isLARP === 'true',
      isAnonymous === 'true',
      inviteMode
    );
    ctx.redirect('/tribes');
  })
  .post('/tribes/update/:id', koaBody({ multipart: true }), async ctx => {
    const { title, description, location, isLARP, isAnonymous, inviteMode, tags } = ctx.request.body;
    
    // Block L.A.R.P. creation
    if (isLARP === 'true' || isLARP === true) {
      ctx.status = 400;
      ctx.body = { error: "L.A.R.P. tribes cannot be updated." };
      return;
    }
    
    const parsedTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const image = await handleBlobUpload(ctx, 'image');
    await tribesModel.updateTribeById(ctx.params.id, {
      title,
      description,
      image,
      location,
      tags: parsedTags,
      isLARP: isLARP === 'true',
      isAnonymous: isAnonymous === 'true',
      inviteMode
    });
    ctx.redirect('/tribes?filter=mine');
  })
  .post('/tribes/delete/:id', async ctx => {
    await tribesModel.deleteTribeById(ctx.params.id)
    ctx.redirect('/tribes?filter=mine')
  })
  .post('/tribes/generate-invite', koaBody(), async ctx => {
    const { tribeId } = ctx.request.body;
    const inviteCode = await tribesModel.generateInvite(tribeId);
    ctx.body = await renderInvitePage(inviteCode);
  })
  .post('/tribes/join-code', koaBody(), async ctx => {
    const { inviteCode } = ctx.request.body
    await tribesModel.joinByInvite(inviteCode)
    ctx.redirect('/tribes?filter=membership')
  })
  .post('/tribes/leave/:id', koaBody(), async ctx => {
    await tribesModel.leaveTribe(ctx.params.id)
    ctx.redirect('/tribes?filter=membership')
  })
  .post('/tribes/:id/message', koaBody(), async ctx => {
    const tribeId = ctx.params.id;
    const message = ctx.request.body.message;
    await tribesModel.postMessage(tribeId, message);
    ctx.redirect(ctx.headers.referer); 
  })
  .post('/tribes/:id/refeed/:msgId', koaBody(), async ctx => {
    const tribeId = ctx.params.id;
    const msgId = ctx.params.msgId;
    await tribesModel.refeed(tribeId, msgId);
    ctx.redirect(ctx.headers.referer); 
  })
  .post('/tribe/:id/message', koaBody(), async ctx => {
    const tribeId = ctx.params.id;
    const message = ctx.request.body.message;
    await tribesModel.postMessage(tribeId, message);
    ctx.redirect('/tribes?filter=mine')
  })
  .post('/panic/remove', koaBody(), async (ctx) => {
    const { exec } = require('child_process');
    try {
      await panicmodeModel.removeSSB();
      ctx.body = {
        message: 'Your blockchain has been succesfully deleted!'
      };
     exec('pkill -f "node SSB_server.js start"');
     setTimeout(() => {
      process.exit(0);
    }, 1000);
    } catch (error) {
       ctx.body = {
       error: 'Error deleting your blockchain: ' + error.message
      };
    }
  })
  .post('/export/create', async (ctx) => {
    try {
      const outputPath = path.join(os.homedir(), 'ssb_exported.zip');  
      await exportmodeModel.exportSSB(outputPath);
      ctx.set('Content-Type', 'application/zip');
      ctx.set('Content-Disposition', `attachment; filename=ssb_exported.zip`);
      ctx.body = fs.createReadStream(outputPath);
      ctx.res.on('finish', () => {
        fs.unlinkSync(outputPath);
      });
    } catch (error) {
      ctx.body = {
        error: 'Error exporting your blockchain: ' + error.message
      };
    }
  })
  .post('/tasks/create', koaBody(), async ctx => {
    const { title, description, startTime, endTime, priority, location, tags, isPublic } = ctx.request.body;
    await tasksModel.createTask(title, description, startTime, endTime, priority, location, tags, isPublic);
    ctx.redirect(safeReturnTo(ctx, '/tasks?filter=mine', ['/tasks']));
  })
  .post('/tasks/update/:id', koaBody(), async ctx => {
    const { title, description, startTime, endTime, priority, location, tags, isPublic } = ctx.request.body;
    const taskId = ctx.params.id;
    const parsedTags = Array.isArray(tags)
      ? tags.filter(Boolean)
      : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);
    await tasksModel.updateTaskById(taskId, {
      title,
      description,
      startTime,
      endTime,
      priority,
      location,
      tags: parsedTags,
      isPublic
    });
    ctx.redirect(safeReturnTo(ctx, '/tasks?filter=mine', ['/tasks']));
  })
  .post('/tasks/assign/:id', koaBody(), async ctx => {
    const taskId = ctx.params.id;
    await tasksModel.toggleAssignee(taskId);
    ctx.redirect(safeReturnTo(ctx, '/tasks', ['/tasks']));
  })
  .post('/tasks/delete/:id', koaBody(), async ctx => {
    const taskId = ctx.params.id;
    await tasksModel.deleteTaskById(taskId);
    ctx.redirect(safeReturnTo(ctx, '/tasks?filter=mine', ['/tasks']));
  })
  .post('/tasks/status/:id', koaBody(), async ctx => {
    const taskId = ctx.params.id;
    const { status } = ctx.request.body;
    await tasksModel.updateTaskStatus(taskId, status);
    ctx.redirect(safeReturnTo(ctx, '/tasks?filter=mine', ['/tasks']));
  })
  .post('/tasks/:taskId/comments', koaBody(), async ctx => {
    const { taskId } = ctx.params;
    const { text } = ctx.request.body;
    const trimmed = (text || '').trim();
    const fallback = `/tasks/${encodeURIComponent(taskId)}`;
    if (!trimmed) {
      ctx.redirect(safeReturnTo(ctx, fallback, ['/tasks']));
      return;
    }
    await post.publish({
      text: trimmed,
      root: taskId,
      dest: taskId
    });
    ctx.redirect(safeReturnTo(ctx, fallback, ['/tasks']));
  })
  .post('/reports/create', koaBody({ multipart: true }), async ctx => {
    const {
      title, description, category, tags, severity,
      stepsToReproduce, expectedBehavior, actualBehavior, environment, reproduceRate,
      problemStatement, userStory, acceptanceCriteria,
      whatHappened, reportedUser, evidenceLinks,
      contentLocation, whyInappropriate, requestedAction
    } = ctx.request.body;
    const image = await handleBlobUpload(ctx, 'image');
    const template = {
      stepsToReproduce, expectedBehavior, actualBehavior, environment, reproduceRate,
      problemStatement, userStory, acceptanceCriteria,
      whatHappened, reportedUser, evidenceLinks,
      contentLocation, whyInappropriate, requestedAction
    };
    await reportsModel.createReport(title, description, category, image, tags, severity, template);
    ctx.redirect('/reports');
  })
  .post('/reports/update/:id', koaBody({ multipart: true }), async ctx => {
    const {
    title, description, category, tags, severity,
    stepsToReproduce, expectedBehavior, actualBehavior, environment, reproduceRate,
    problemStatement, userStory, acceptanceCriteria,
    whatHappened, reportedUser, evidenceLinks,
      contentLocation, whyInappropriate, requestedAction
    } = ctx.request.body;
    const image = await handleBlobUpload(ctx, 'image');
    const template = {
      stepsToReproduce, expectedBehavior, actualBehavior, environment, reproduceRate,
      problemStatement, userStory, acceptanceCriteria,
      whatHappened, reportedUser, evidenceLinks,
      contentLocation, whyInappropriate, requestedAction
    };
    await reportsModel.updateReportById(ctx.params.id, {
      title, description, category, image, tags, severity, template
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
    const reportId = ctx.params.id;
    const { status } = ctx.request.body;
    await reportsModel.updateReportById(reportId, { status });
    ctx.redirect('/reports?filter=mine');
  })
  .post('/reports/:reportId/comments', koaBody(), async ctx => {
    const { reportId } = ctx.params;
    const { text } = ctx.request.body;
    const trimmed = (text || '').trim();
    if (!trimmed) {
      ctx.redirect(`/reports/${encodeURIComponent(reportId)}`);
      return;
    }
    await post.publish({
      text: trimmed,
      root: reportId,
      dest: reportId
    });
    ctx.redirect(`/reports/${encodeURIComponent(reportId)}`);
  })
  .post('/events/create', koaBody(), async (ctx) => {
    const { title, description, date, location, price, url, attendees, tags, isPublic } = ctx.request.body;
    await eventsModel.createEvent(title, description, date, location, price, url, attendees || [], tags, isPublic);
    ctx.redirect(safeReturnTo(ctx, '/events?filter=mine', ['/events'])); 
  })
  .post('/events/update/:id', koaBody(), async (ctx) => {
    const { title, description, date, location, price, url, attendees, tags, isPublic } = ctx.request.body;
    const eventId = ctx.params.id;
    const existing = await eventsModel.getEventById(eventId);
    await eventsModel.updateEventById(eventId, {
      title,
      description,
      date,
      location,
      price,
      url,
      attendees,
      tags,
      isPublic,
      createdAt: existing.createdAt,
      organizer: existing.organizer
    });
    ctx.redirect(safeReturnTo(ctx, '/events?filter=mine', ['/events']));
  })
  .post('/events/attend/:id', koaBody(), async (ctx) => {
    const eventId = ctx.params.id;
    await eventsModel.toggleAttendee(eventId);
    ctx.redirect(safeReturnTo(ctx, '/events', ['/events']));
  })
  .post('/events/delete/:id', koaBody(), async (ctx) => {
    const eventId = ctx.params.id;
    await eventsModel.deleteEventById(eventId);
    ctx.redirect(safeReturnTo(ctx, '/events?filter=mine', ['/events']));
  })
  .post('/events/:eventId/comments', koaBody(), async (ctx) => {
    const { eventId } = ctx.params;
    const { text } = ctx.request.body;
    const trimmed = (text || '').trim();
    const fallback = `/events/${encodeURIComponent(eventId)}`;
    if (!trimmed) {
      ctx.redirect(safeReturnTo(ctx, fallback, ['/events']));
      return;
    }
    await post.publish({
      text: trimmed,
      root: eventId,
      dest: eventId
    });
    ctx.redirect(safeReturnTo(ctx, fallback, ['/events']));
  })
  .post('/votes/create', koaBody(), async ctx => {
    const { question, deadline, options, tags = '', returnTo } = ctx.request.body;
    const defaultOptions = ['YES', 'NO', 'ABSTENTION', 'CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'];
    const parsedOptions = options
      ? options.split(',').map(o => o.trim()).filter(Boolean)
      : defaultOptions;
    const parsedTags = String(tags || '').split(',').map(t => t.trim()).filter(Boolean);
    await votesModel.createVote(question, deadline, parsedOptions, parsedTags);
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=mine', ['/votes']));
  })
  .post('/votes/update/:id', koaBody(), async ctx => {
    const id = ctx.params.id;
    const { question, deadline, options, tags = '', returnTo } = ctx.request.body;
    const parsedOptions = options
      ? options.split(',').map(o => o.trim()).filter(Boolean)
      : undefined;
    const parsedTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    await votesModel.updateVoteById(id, { question, deadline, options: parsedOptions, tags: parsedTags });
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=mine', ['/votes']));
  })
  .post('/votes/delete/:id', koaBody(), async ctx => {
    const id = ctx.params.id;
    await votesModel.deleteVoteById(id);
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=mine', ['/votes']));
  })
  .post('/votes/vote/:id', koaBody(), async ctx => {
    const id = ctx.params.id;
    const { choice } = ctx.request.body;
    await votesModel.voteOnVote(id, choice);
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=open', ['/votes']));
  })
  .post('/votes/opinions/:voteId/:category', koaBody(), async ctx => {
    const { voteId, category } = ctx.params;
    try {
      await votesModel.createOpinion(voteId, category);
    } catch (e) {
      const msg = String(e && e.message ? e.message : '');
      if (/already/i.test(msg)) {
        ctx.flash = { message: "You have already opined." };
      } else {
        throw e;
      }
    }
    ctx.redirect(safeReturnTo(ctx, '/votes', ['/votes']));
  })
  .post('/votes/:voteId/comments', koaBody(), async ctx => {
    const { voteId } = ctx.params;
    const { text } = ctx.request.body;
    const trimmed = (text || '').trim();
    const fallback = `/votes/${encodeURIComponent(voteId)}`;
    if (!trimmed) {
      ctx.redirect(safeReturnTo(ctx, fallback, ['/votes']));
      return;
    }
    await post.publish({
      text: trimmed,
      root: voteId,
      dest: voteId
    });
    ctx.redirect(safeReturnTo(ctx, fallback, ['/votes']));
  })
  .post('/parliament/candidatures/propose', koaBody(), async (ctx) => {
    const { candidateId = '', method = '' } = ctx.request.body || {};
    const id = String(candidateId || '').trim();
    const m = String(method || '').trim().toUpperCase();
    const ALLOWED = new Set(['DEMOCRACY','MAJORITY','MINORITY','DICTATORSHIP','KARMATOCRACY']);
    if (!id) ctx.throw(400, 'Candidate is required.');
    if (!ALLOWED.has(m)) ctx.throw(400, 'Invalid method.');
    await parliamentModel.proposeCandidature({ candidateId: id, method: m }).catch(e => ctx.throw(400, String((e && e.message) || e)));
    ctx.redirect('/parliament?filter=candidatures');
  })
  .post('/parliament/candidatures/:id/vote', koaBody(), async (ctx) => {
    await parliamentModel.voteCandidature(ctx.params.id).catch(e => ctx.throw(400, String((e && e.message) || e)));
    ctx.redirect('/parliament?filter=candidatures');
  })
  .post('/parliament/proposals/create', koaBody(), async (ctx) => {
    const { title = '', description = '' } = ctx.request.body || {};
    const t = String(title || '').trim();
    const d = String(description || '').trim();
    if (!t) ctx.throw(400, 'Title is required.');
    if (d.length > 1000) ctx.throw(400, 'Description must be ≤ 1000 chars.');
    await parliamentModel.createProposal({ title: t, description: d }).catch(e => ctx.throw(400, String((e && e.message) || e)));
    ctx.redirect('/parliament?filter=proposals');
  })
  .post('/parliament/proposals/close/:id', koaBody(), async (ctx) => {
    await parliamentModel.closeProposal(ctx.params.id).catch(e => ctx.throw(400, String((e && e.message) || e)));
    ctx.redirect('/parliament?filter=proposals');
  })
  .post('/parliament/resolve', koaBody(), async (ctx) => {
    await ensureTerm();
    ctx.redirect('/parliament?filter=government');
  })
  .post('/parliament/revocations/create', koaBody(), async (ctx) => {
    const body = ctx.request.body || {};
    const rawLawId =
      Array.isArray(body.lawId) ? body.lawId[0] :
      (body.lawId ?? body['lawId[]'] ?? body.law_id ?? '');
    const lawId = String(rawLawId || '').trim();
    if (!lawId) ctx.throw(400, 'Law required');
    const { title, reasons } = body;
    await parliamentModel.createRevocation({ lawId, title, reasons });
    ctx.redirect('/parliament?filter=revocations');
  })
  .post('/courts/cases/create', koaBody(), async (ctx) => {
    const body = ctx.request.body || {};
    const titleSuffix = String(body.titleSuffix || '').trim();
    const titlePreset = String(body.titlePreset || '').trim();
    const respondentRaw = String(body.respondentId || '').trim();
    const methodRaw = String(body.method || '').trim().toUpperCase();
    const ALLOWED = new Set(['JUDGE', 'DICTATOR', 'POPULAR', 'MEDIATION', 'KARMATOCRACY']);
    if (!titleSuffix && !titlePreset) {
      ctx.flash = { message: 'Title is required.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    if (!respondentRaw) {
      ctx.flash = { message: 'Accused / Respondent is required.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    if (!ALLOWED.has(methodRaw)) {
      ctx.flash = { message: 'Invalid resolution method.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    const parts = [];
    if (titlePreset) parts.push(titlePreset);
    if (titleSuffix) parts.push(titleSuffix);
    const titleBase = parts.join(' - ');
    try {
      await courtsModel.openCase({
        titleBase,
        respondentInput: respondentRaw,
        method: methodRaw
      });
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect('/courts?filter=mycases');
  })
  .post('/courts/cases/:id/evidence/add', koaBody({ multipart: true }), async (ctx) => {
    const caseId = ctx.params.id;
    const body = ctx.request.body || {};
    const text = String(body.text || '');
    const link = String(body.link || '');
    if (!caseId) {
      ctx.flash = { message: 'Case not found.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    try {
      const imageMarkdown = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
      await courtsModel.addEvidence({
        caseId,
        text,
        link,
        imageMarkdown
      });
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/answer', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    const body = ctx.request.body || {};
    const answer = String(body.answer || '');
    const stance = String(body.stance || '').toUpperCase();
    const ALLOWED = new Set(['DENY', 'ADMIT', 'PARTIAL']);
    if (!caseId) {
      ctx.flash = { message: 'Case not found.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    if (!answer) {
      ctx.flash = { message: 'Response brief is required.' };
      ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
      return;
    }
    if (!ALLOWED.has(stance)) {
      ctx.flash = { message: 'Invalid stance.' };
      ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
      return;
    }
    try {
      await courtsModel.answerCase({ caseId, stance, text: answer });
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/decide', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    const body = ctx.request.body || {};
    const result = String(body.outcome || '').trim();
    const orders = String(body.orders || '');
    if (!caseId) {
      ctx.flash = { message: 'Case not found.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    if (!result) {
      ctx.flash = { message: 'Result is required.' };
      ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
      return;
    }
    try {
      await courtsModel.issueVerdict({ caseId, result, orders });
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/settlements/propose', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    const body = ctx.request.body || {};
    const terms = String(body.terms || '');
    if (!caseId) {
      ctx.flash = { message: 'Case not found.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    if (!terms) {
      ctx.flash = { message: 'Terms are required.' };
      ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
      return;
    }
    try {
      await courtsModel.proposeSettlement({ caseId, terms });
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/settlements/accept', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    if (!caseId) {
      ctx.flash = { message: 'Case not found.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    try {
      await courtsModel.acceptSettlement({ caseId });
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/mediators/accuser', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    const body = ctx.request.body || {};
    const raw = String(body.mediators || '');
    if (!caseId) {
      ctx.flash = { message: 'Case not found.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    const mediators = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (!mediators.length) {
      ctx.flash = { message: 'At least one mediator is required.' };
      ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
      return;
    }
    const currentUserId = ctx.state && ctx.state.user && ctx.state.user.id;
    if (currentUserId && mediators.includes(currentUserId)) {
      ctx.flash = { message: 'You cannot appoint yourself as mediator.' };
      ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
      return;
    }
    try {
      await courtsModel.setMediators({ caseId, side: 'accuser', mediators });
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/mediators/respondent', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    const body = ctx.request.body || {};
    const raw = String(body.mediators || '');
    if (!caseId) {
      ctx.flash = { message: 'Case not found.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    const mediators = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (!mediators.length) {
      ctx.flash = { message: 'At least one mediator is required.' };
      ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
      return;
    }
    const currentUserId = ctx.state && ctx.state.user && ctx.state.user.id;
    if (currentUserId && mediators.includes(currentUserId)) {
      ctx.flash = { message: 'You cannot appoint yourself as mediator.' };
      ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
      return;
    }
    try {
      await courtsModel.setMediators({ caseId, side: 'respondent', mediators });
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/judge', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    const body = ctx.request.body || {};
    const judgeId = String(body.judgeId || '').trim();
    if (!caseId) {
      ctx.flash = { message: 'Case not found.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    if (!judgeId) {
      ctx.flash = { message: 'Judge is required.' };
      ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
      return;
    }
    const currentUserId = ctx.state && ctx.state.user && ctx.state.user.id;
    if (currentUserId && judgeId === currentUserId) {
      ctx.flash = { message: 'You cannot assign yourself as judge.' };
      ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
      return;
    }
    try {
      await courtsModel.assignJudge({ caseId, judgeId });
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/public', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    const body = ctx.request.body || {};
    const pref = String(body.preference || '').toUpperCase();
    if (!caseId) {
      ctx.flash = { message: 'Case not found.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    if (pref !== 'YES' && pref !== 'NO') {
      ctx.flash = { message: 'Invalid visibility preference.' };
      ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
      return;
    }
    const preference = pref === 'YES';
    try {
      await courtsModel.setPublicPreference({ caseId, preference });
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/openVote', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    if (!caseId) {
      ctx.flash = { message: 'Case not found.' };
      ctx.redirect('/courts?filter=cases');
      return;
    }
    try {
      await courtsModel.openPopularVote({ caseId });
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/judges/nominate', koaBody(), async (ctx) => {
    const body = ctx.request.body || {};
    const judgeId = String(body.judgeId || '').trim();
    if (!judgeId) {
      ctx.flash = { message: 'Judge is required.' };
      ctx.redirect('/courts?filter=judges');
      return;
    }
    try {
      await courtsModel.nominateJudge({ judgeId });
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect('/courts?filter=judges');
  })
  .post('/courts/judges/:id/vote', koaBody(), async (ctx) => {
    const nominationId = ctx.params.id;
    if (!nominationId) {
      ctx.flash = { message: 'Nomination not found.' };
      ctx.redirect('/courts?filter=judges');
      return;
    }
    try {
      await courtsModel.voteNomination(nominationId);
    } catch (e) {
      ctx.flash = { message: String((e && e.message) || e) };
    }
    ctx.redirect('/courts?filter=judges');
  })  
  .post("/market/create", koaBody({ multipart: true }), async (ctx) => {
    const marketMod = ctx.cookies.get("marketMod") || "on"
    if (marketMod !== "on") {
      ctx.redirect("/modules")
      return
    }
    const { item_type, title, description, price, tags, item_status, deadline, includesShipping, stock } = ctx.request.body
    const image = await handleBlobUpload(ctx, "image")
    const parsedStock = parseInt(String(stock || "0"), 10)
    if (!parsedStock || parsedStock <= 0) ctx.throw(400, "Stock must be a positive number.")
    const pickLast = (v) => (Array.isArray(v) ? v[v.length - 1] : v)
    const includesShippingVal = pickLast(includesShipping)
    const includesShippingBool = includesShippingVal === "1" || includesShippingVal === "on" || includesShippingVal === true || includesShippingVal === "true"
    await marketModel.createItem(item_type, title, description, image, price, tags, item_status, deadline, includesShippingBool, parsedStock)
    ctx.redirect(safeReturnTo(ctx, "/market", ["/market"]))
  })
  .post("/market/update/:id", koaBody({ multipart: true }), async (ctx) => {
    const marketMod = ctx.cookies.get("marketMod") || "on"
    if (marketMod !== "on") {
      ctx.redirect("/modules")
      return
    }
    const id = ctx.params.id
    const { item_type, title, description, price, tags = "", item_status, deadline, includesShipping, stock } = ctx.request.body
    const parsedStock = parseInt(String(stock || "0"), 10)
    if (parsedStock < 0) ctx.throw(400, "Stock cannot be negative.")
    const parsedTags = String(tags || "").split(",").map((t) => t.trim()).filter(Boolean)
    const pickLast = (v) => (Array.isArray(v) ? v[v.length - 1] : v)
    const includesShippingVal = pickLast(includesShipping)
    const includesShippingBool = includesShippingVal === "1" || includesShippingVal === "on" || includesShippingVal === true || includesShippingVal === "true"
    const updatedData = {
      item_type,
      title,
      description,
      price,
      item_status,
      deadline,
      includesShipping: includesShippingBool,
      tags: parsedTags,
      stock: parsedStock
    }
    const image = await handleBlobUpload(ctx, "image")
    if (image) updatedData.image = image
    await marketModel.updateItemById(id, updatedData)
    ctx.redirect(safeReturnTo(ctx, "/market?filter=mine", ["/market"]))
  })
  .post("/market/delete/:id", koaBody(), async (ctx) => {
    const marketMod = ctx.cookies.get("marketMod") || "on"
    if (marketMod !== "on") {
      ctx.redirect("/modules")
      return
    }
    const id = ctx.params.id
    await marketModel.deleteItemById(id)
    ctx.redirect(safeReturnTo(ctx, "/market?filter=mine", ["/market"]))
  })
  .post("/market/sold/:id", koaBody(), async (ctx) => {
    const marketMod = ctx.cookies.get("marketMod") || "on"
    if (marketMod !== "on") {
      ctx.redirect("/modules")
      return
    }
    const id = ctx.params.id
    const marketItem = await marketModel.getItemById(id)
    if (!marketItem) ctx.throw(404, "Item not found")
    if (Number(marketItem.stock || 0) <= 0) ctx.throw(400, "No stock left to mark as sold.")
    if (marketItem.status !== "SOLD") {
      await marketModel.setItemAsSold(id)
      await marketModel.decrementStock(id)
    }
    ctx.redirect(safeReturnTo(ctx, "/market?filter=mine", ["/market"]))
  })
  .post("/market/buy/:id", koaBody(), async (ctx) => {
    const marketMod = ctx.cookies.get("marketMod") || "on"
    if (marketMod !== "on") {
      ctx.redirect("/modules")
      return
    }
    const id = ctx.params.id
    const marketItem = await marketModel.getItemById(id)
    if (!marketItem) ctx.throw(404, "Item not found")
    if (marketItem.item_type === "exchange") {
      if (marketItem.status !== "SOLD") {
        const buyerId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id
        const { price, title, seller } = marketItem
        const subject = "MARKET_SOLD"
        const text = `item "${title}" has been sold -> /market/${id}  OASIS ID: ${buyerId}  for: ${price} ECO`
        await pmModel.sendMessage([seller], subject, text)
        await marketModel.setItemAsSold(id)
      }
      ctx.redirect(safeReturnTo(ctx, "/inbox?filter=sent", ["/inbox", "/market"]))
      return
    }
    await marketModel.decrementStock(id)
    ctx.redirect(safeReturnTo(ctx, "/inbox?filter=sent", ["/inbox", "/market"]))
  })
  .post("/market/status/:id", koaBody(), async (ctx) => {
    const marketMod = ctx.cookies.get("marketMod") || "on"
    if (marketMod !== "on") {
      ctx.redirect("/modules")
      return
    }
    const id = ctx.params.id
    const desired = String(ctx.request.body.status || "")
      .toUpperCase()
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (!["FOR SALE", "SOLD", "DISCARDED"].includes(desired)) ctx.throw(400, "Invalid status.")
    const item = await marketModel.getItemById(id)
    if (!item) ctx.throw(404, "Item not found")
    const cur = String(item.status || "").toUpperCase().replace(/\s+/g, " ").trim()
    if (cur === "SOLD" || cur === "DISCARDED") {
      ctx.redirect(safeReturnTo(ctx, "/market?filter=mine", ["/market"]))
      return
    }
    if (desired === cur || desired === "FOR SALE") {
      ctx.redirect(safeReturnTo(ctx, "/market?filter=mine", ["/market"]))
      return
    }
    if (desired === "SOLD") {
      if (Number(item.stock || 0) <= 0) ctx.throw(400, "No stock left to mark as sold.")
      await marketModel.setItemAsSold(id)
      await marketModel.decrementStock(id)
      ctx.redirect(safeReturnTo(ctx, "/market?filter=mine", ["/market"]))
      return
    }
    if (desired === "DISCARDED") {
      await marketModel.updateItemById(id, { status: "DISCARDED", stock: 0 })
      ctx.redirect(safeReturnTo(ctx, "/market?filter=mine", ["/market"]))
      return
    }
    ctx.redirect(safeReturnTo(ctx, "/market?filter=mine", ["/market"]))
  })
  .post("/market/bid/:id", koaBody(), async (ctx) => {
    const marketMod = ctx.cookies.get("marketMod") || "on"  
    if (marketMod !== "on") {
      ctx.redirect("/modules")
      return
    }
    const id = ctx.params.id
    const userId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id
    const { bidAmount } = ctx.request.body
    await marketModel.addBidToAuction(id, userId, bidAmount)
    ctx.redirect(safeReturnTo(ctx, "/market?filter=auctions", ["/market"]))
  })
  .post("/market/:itemId/comments", koaBody(), async (ctx) => {
    const marketMod = ctx.cookies.get("marketMod") || "on"
    if (marketMod !== "on") {
      ctx.redirect("/modules")
      return
    }
    const { itemId } = ctx.params
    const { text } = ctx.request.body
    const trimmed = (text || "").trim()
    if (!trimmed) {
      ctx.redirect(safeReturnTo(ctx, `/market/${encodeURIComponent(itemId)}`, ["/market"]))
      return
    }
    await post.publish({ text: trimmed, root: itemId, dest: itemId })
    ctx.redirect(safeReturnTo(ctx, `/market/${encodeURIComponent(itemId)}`, ["/market"]))
  })
  .post('/jobs/create', koaBody({ multipart: true }), async (ctx) => {
    const jobsMod = ctx.cookies.get("jobsMod") || 'on'
    if (jobsMod !== 'on') { ctx.redirect('/modules'); return }
    const {
      job_type,
      title,
      description,
      requirements,
      languages,
      job_time,
      tasks,
      location,
      vacants,
      salary,
      tags
    } = ctx.request.body
    const imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null
    await jobsModel.createJob({
      job_type,
      title,
      description,
      requirements,
      languages,
      job_time,
      tasks,
      location,
      vacants: vacants ? parseInt(vacants, 10) : 1,
      salary: salary != null && salary !== '' ? parseFloat(String(salary).replace(',', '.')) : 0,
      tags,
      image: imageBlob
    })
    ctx.redirect(safeReturnTo(ctx, '/jobs?filter=MINE', ['/jobs']))
  })
  .post('/jobs/update/:id', koaBody({ multipart: true }), async (ctx) => {
    const jobsMod = ctx.cookies.get("jobsMod") || 'on'
    if (jobsMod !== 'on') { ctx.redirect('/modules'); return }
    const id = ctx.params.id
    const {
      job_type,
      title,
      description,
      requirements,
      languages,
      job_time,
      tasks,
      location,
      vacants,
      salary,
      tags
    } = ctx.request.body
    const imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : undefined
    const patch = {
      job_type,
      title,
      description,
      requirements,
      languages,
      job_time,
      tasks,
      location,
      tags
    }
    if (vacants !== undefined && vacants !== '') patch.vacants = parseInt(vacants, 10)
    if (salary !== undefined && salary !== '') patch.salary = parseFloat(String(salary).replace(',', '.'))
    if (imageBlob !== undefined) patch.image = imageBlob
    await jobsModel.updateJob(id, patch)
    ctx.redirect(safeReturnTo(ctx, '/jobs?filter=MINE', ['/jobs']))
  })
  .post('/jobs/delete/:id', koaBody(), async (ctx) => {
    const jobsMod = ctx.cookies.get("jobsMod") || 'on'
    if (jobsMod !== 'on') { ctx.redirect('/modules'); return }
    const id = ctx.params.id
    await jobsModel.deleteJob(id)
    ctx.redirect(safeReturnTo(ctx, '/jobs?filter=MINE', ['/jobs']))
  })
  .post('/jobs/status/:id', koaBody(), async (ctx) => {
    const jobsMod = ctx.cookies.get("jobsMod") || 'on'
    if (jobsMod !== 'on') { ctx.redirect('/modules'); return }
    const id = ctx.params.id
    const { status } = ctx.request.body
    await jobsModel.updateJobStatus(id, String(status).toUpperCase())
    ctx.redirect(safeReturnTo(ctx, '/jobs?filter=MINE', ['/jobs']))
  })
  .post('/jobs/subscribe/:id', koaBody(), async (ctx) => {
    const jobsMod = ctx.cookies.get("jobsMod") || 'on'
    if (jobsMod !== 'on') { ctx.redirect('/modules'); return }
    const rawId = ctx.params.id
    const userId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id
    const job = await jobsModel.getJobById(rawId, userId)
    await jobsModel.subscribeToJob(rawId, userId)
    const subject = 'JOB_SUBSCRIBED'
    const title = job.title || ''
    const text = `has subscribed to your job offer "${title}" -> /jobs/${encodeURIComponent(job.id)}`
    await pmModel.sendMessage([job.author], subject, text)
    ctx.redirect(safeReturnTo(ctx, '/jobs', ['/jobs']))
  })
  .post('/jobs/unsubscribe/:id', koaBody(), async (ctx) => {
    const jobsMod = ctx.cookies.get("jobsMod") || 'on'
    if (jobsMod !== 'on') { ctx.redirect('/modules'); return }
    const rawId = ctx.params.id
    const userId = SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id
    const job = await jobsModel.getJobById(rawId, userId)
    await jobsModel.unsubscribeFromJob(rawId, userId)
    const subject = 'JOB_UNSUBSCRIBED'
    const title = job.title || ''
    const text = `has unsubscribed from your job offer "${title}" -> /jobs/${encodeURIComponent(job.id)}`
    await pmModel.sendMessage([job.author], subject, text)
    ctx.redirect(safeReturnTo(ctx, '/jobs', ['/jobs']))
  })
  .post('/jobs/:jobId/comments', koaBody(), async (ctx) => {
    const jobsMod = ctx.cookies.get("jobsMod") || 'on'
    if (jobsMod !== 'on') { ctx.redirect('/modules'); return }
    const { jobId } = ctx.params
    const { text } = ctx.request.body
    const trimmed = (text || '').trim()
    if (!trimmed) {
      ctx.redirect(safeReturnTo(ctx, `/jobs/${encodeURIComponent(jobId)}`, ['/jobs']))
      return
    }
    await post.publish({
      text: trimmed,
      root: jobId,
      dest: jobId
    })
    ctx.redirect(safeReturnTo(ctx, `/jobs/${encodeURIComponent(jobId)}`, ['/jobs']))
  })
  .post("/projects/create", koaBody({ multipart: true }), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const b = ctx.request.body || {}
    const hasImage = !!(ctx.request.files && ctx.request.files.image)
    const imageBlob = hasImage ? await handleBlobUpload(ctx, "image") : null

    const bounties =
      b.bountiesInput
        ? String(b.bountiesInput).split("\n").filter(Boolean).map((l) => {
            const parts = String(l).split("|")
            const t = parts[0]
            const a = parts[1]
            const d = parts[2]
            return { title: String(t || "").trim(), amount: parseFloat(a || 0) || 0, description: String(d || "").trim(), milestoneIndex: null }
          })
        : []

    await projectsModel.createProject({
      title: b.title,
      description: b.description,
      goal: b.goal != null && b.goal !== "" ? parseFloat(b.goal) : 0,
      deadline: b.deadline ? new Date(b.deadline).toISOString() : null,
      progress: b.progress != null && b.progress !== "" ? parseInt(b.progress, 10) : 0,
      bounties,
      image: imageBlob,
      milestoneTitle: b.milestoneTitle,
      milestoneDescription: b.milestoneDescription,
      milestoneTargetPercent: b.milestoneTargetPercent,
      milestoneDueDate: b.milestoneDueDate
    })

    ctx.redirect(safeReturnTo(ctx, "/projects?filter=MINE", ["/projects"]))
  })
  .post("/projects/update/:id", koaBody({ multipart: true }), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const rawId = ctx.params.id
    const id = await projectsModel.getProjectTipId(rawId)
    const b = ctx.request.body || {}
    const hasImage = !!(ctx.request.files && ctx.request.files.image)
    const imageBlob = hasImage ? await handleBlobUpload(ctx, "image") : undefined

    await projectsModel.updateProject(id, {
      title: b.title,
      description: b.description,
      goal: b.goal !== "" && b.goal != null ? parseFloat(b.goal) : undefined,
      deadline: b.deadline ? new Date(b.deadline).toISOString() : undefined,
      progress: b.progress !== "" && b.progress != null ? parseInt(b.progress, 10) : undefined,
      bounties: b.bountiesInput !== undefined
        ? String(b.bountiesInput).split("\n").filter(Boolean).map((l) => {
            const parts = String(l).split("|")
            const t = parts[0]
            const a = parts[1]
            const d = parts[2]
            return { title: String(t || "").trim(), amount: parseFloat(a || 0) || 0, description: String(d || "").trim(), milestoneIndex: null }
          })
        : undefined,
      image: imageBlob
    })

    ctx.redirect(safeReturnTo(ctx, "/projects?filter=MINE", ["/projects"]))
  })
  .post("/projects/delete/:id", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const rawId = ctx.params.id
    const id = await projectsModel.getProjectTipId(rawId)
    await projectsModel.deleteProject(id)
    ctx.redirect(safeReturnTo(ctx, "/projects?filter=MINE", ["/projects"]))
  })
  .post("/projects/status/:id", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const rawId = ctx.params.id
    const id = await projectsModel.getProjectTipId(rawId)
    await projectsModel.updateProjectStatus(id, String((ctx.request.body && ctx.request.body.status) || "").toUpperCase())
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]))
  })
  .post("/projects/progress/:id", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const rawId = ctx.params.id
    const id = await projectsModel.getProjectTipId(rawId)
    const progressVal = ctx.request.body && ctx.request.body.progress
    await projectsModel.updateProjectProgress(id, progressVal)
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]))
  })
  .post("/projects/pledge/:id", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const rawId = ctx.params.id
    const latestId = await projectsModel.getProjectTipId(rawId)
    const body = ctx.request.body || {}
    const amount = body.amount
    const milestoneOrBounty = body.milestoneOrBounty || ""

    const pledgeAmount = parseFloat(amount)
    if (isNaN(pledgeAmount) || pledgeAmount <= 0) ctx.throw(400, "Invalid amount")

    const uid = SSBconfig.config.keys.id
    const project = await projectsModel.getProjectById(latestId)
    const status = String(project.status || "ACTIVE").toUpperCase()
    if (status !== "ACTIVE") ctx.throw(400, "Project is not active")
    if (project.deadline && moment(project.deadline).isValid() && moment(project.deadline).isBefore(moment())) ctx.throw(400, "Project deadline passed")
    if (project.author === uid) ctx.throw(403, "Authors cannot pledge to their own project")

    let milestoneIndex = null
    let bountyIndex = null
    if (String(milestoneOrBounty).startsWith("milestone:")) milestoneIndex = parseInt(String(milestoneOrBounty).split(":")[1], 10)
    else if (String(milestoneOrBounty).startsWith("bounty:")) bountyIndex = parseInt(String(milestoneOrBounty).split(":")[1], 10)

    const deadlineISO = moment().add(14, "days").toISOString()
    const tags = ["backer-pledge", `project:${latestId}`]
    const transfer = await transfersModel.createTransfer(project.author, "Project Pledge", pledgeAmount, deadlineISO, tags)
    const transferId = transfer.key || transfer.id

    const backers = Array.isArray(project.backers) ? project.backers.slice() : []
    backers.push({ userId: uid, amount: pledgeAmount, at: new Date().toISOString(), transferId, confirmed: false, milestoneIndex, bountyIndex })

    const pledged = (parseFloat(project.pledged || 0) || 0) + pledgeAmount
    const goalProgress = project.goal ? (pledged / parseFloat(project.goal)) * 100 : 0
    await projectsModel.updateProject(latestId, { backers, pledged, progress: goalProgress })

    const subject = "PROJECT_PLEDGE"
    const title = project.title || ""
    const text = `has pledged ${pledgeAmount} ECO to your project "${title}" -> /projects/${latestId}`
    await pmModel.sendMessage([project.author], subject, text)

    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(latestId)}`, ["/projects"]))
  })
  .post("/projects/confirm-transfer/:id", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const transferId = ctx.params.id
    const uid = SSBconfig.config.keys.id
    const transfer = await transfersModel.getTransferById(transferId)
    if (transfer.to !== uid) ctx.throw(403, "Unauthorized action")

    const tags = Array.isArray(transfer.tags) ? transfer.tags : []
    const tagProject = tags.find((t) => String(t).startsWith("project:"))
    if (!tagProject) ctx.throw(400, "Missing project tag on transfer")

    const projectId = String(tagProject).split(":")[1]
    await transfersModel.confirmTransferById(transferId)

    const project = await projectsModel.getProjectById(projectId)
    const backers = Array.isArray(project.backers) ? project.backers.slice() : []
    const idx = backers.findIndex((b) => b && b.transferId === transferId)
    if (idx !== -1) backers[idx].confirmed = true

    const goalProgress = project.goal ? (parseFloat(project.pledged || 0) / parseFloat(project.goal)) * 100 : 0
    await projectsModel.updateProject(projectId, { backers, progress: goalProgress })

    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(projectId)}`, ["/projects", "/transfers"]))
  })
  .post("/projects/follow/:id", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const uid = SSBconfig.config.keys.id
    const rawId = ctx.params.id
    const latestId = await projectsModel.getProjectTipId(rawId)
    const project = await projectsModel.getProjectById(latestId)

    await projectsModel.followProject(rawId, uid)

    const subject = "PROJECT_FOLLOWED"
    const title = project.title || ""
    const text = `has followed your project "${title}" -> /projects/${latestId}`
    await pmModel.sendMessage([project.author], subject, text)

    ctx.redirect(safeReturnTo(ctx, "/projects", ["/projects"]))
  })
  .post("/projects/unfollow/:id", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const uid = SSBconfig.config.keys.id
    const rawId = ctx.params.id
    const latestId = await projectsModel.getProjectTipId(rawId)
    const project = await projectsModel.getProjectById(latestId)

    await projectsModel.unfollowProject(rawId, uid)

    const subject = "PROJECT_UNFOLLOWED"
    const title = project.title || ""
    const text = `has unfollowed your project "${title}" -> /projects/${latestId}`
    await pmModel.sendMessage([project.author], subject, text)

    ctx.redirect(safeReturnTo(ctx, "/projects", ["/projects"]))
  })
  .post("/projects/milestones/add/:id", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const rawId = ctx.params.id
    const id = await projectsModel.getProjectTipId(rawId)
    const body = ctx.request.body || {}
    const title = body.title
    const description = body.description || ""
    const targetPercent = body.targetPercent != null && body.targetPercent !== "" ? parseInt(body.targetPercent, 10) : 0
    const dueDate = body.dueDate ? new Date(body.dueDate).toISOString() : null

    await projectsModel.addMilestone(id, { title, description, targetPercent, dueDate })
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]))
  })
  .post("/projects/milestones/update/:id/:index", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const rawId = ctx.params.id
    const id = await projectsModel.getProjectTipId(rawId)
    const idx = parseInt(ctx.params.index, 10)
    const body = ctx.request.body || {}

    const patch = {
      title: body.title,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.targetPercent !== undefined && body.targetPercent !== "" ? { targetPercent: parseInt(body.targetPercent, 10) } : {}),
      ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate).toISOString() : null } : {}),
      ...(body.done !== undefined ? { done: !!body.done } : {})
    }

    await projectsModel.updateMilestone(id, idx, patch)
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]))
  })
  .post("/projects/milestones/complete/:id/:index", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const uid = SSBconfig.config.keys.id
    const rawId = ctx.params.id
    const id = await projectsModel.getProjectTipId(rawId)
    await projectsModel.completeMilestone(id, parseInt(ctx.params.index, 10), uid)
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]))
  })
  .post("/projects/bounties/add/:id", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const rawId = ctx.params.id
    const id = await projectsModel.getProjectTipId(rawId)
    const body = ctx.request.body || {}
    const milestoneIndex = body.milestoneIndex === "" || body.milestoneIndex === undefined ? null : parseInt(body.milestoneIndex, 10)

    await projectsModel.addBounty(id, {
      title: body.title,
      amount: body.amount,
      description: body.description,
      milestoneIndex
    })

    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]))
  })
  .post("/projects/bounties/update/:id/:index", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const rawId = ctx.params.id
    const id = await projectsModel.getProjectTipId(rawId)
    const idx = parseInt(ctx.params.index, 10)
    const body = ctx.request.body || {}

    const patch = {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.amount !== undefined && body.amount !== "" ? { amount: parseFloat(body.amount) } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.milestoneIndex !== undefined ? { milestoneIndex: body.milestoneIndex === "" ? null : parseInt(body.milestoneIndex, 10) } : {}),
      ...(body.done !== undefined ? { done: !!body.done } : {})
    }

    await projectsModel.updateBounty(id, idx, patch)
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]))
  })
  .post("/projects/bounties/claim/:id/:index", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const uid = SSBconfig.config.keys.id
    const rawId = ctx.params.id
    const id = await projectsModel.getProjectTipId(rawId)
    await projectsModel.claimBounty(id, parseInt(ctx.params.index, 10), uid)
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]))
  })
  .post("/projects/bounties/complete/:id/:index", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const uid = SSBconfig.config.keys.id
    const rawId = ctx.params.id
    const id = await projectsModel.getProjectTipId(rawId)
    await projectsModel.completeBounty(id, parseInt(ctx.params.index, 10), uid)
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(id)}`, ["/projects"]))
  })
  .post("/projects/:projectId/comments", koaBody(), async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || "on"
    if (projectsMod !== "on") { ctx.redirect("/modules"); return }

    const projectId = ctx.params.projectId
    const text = (ctx.request.body && ctx.request.body.text) || ""
    const trimmed = String(text).trim()

    if (!trimmed) {
      ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(projectId)}`, ["/projects"]))
      return
    }

    await post.publish({ text: trimmed, root: projectId, dest: projectId })
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(projectId)}`, ["/projects"]))
  })
  .post("/banking/claim/:id", koaBody(), async (ctx) => {
    const userId = SSBconfig.config.keys.id;
    const allocationId = ctx.params.id;
    const allocation = await bankingModel.getAllocationById(allocationId);
    if (!allocation) {
      ctx.body = { error: i18n.errorNoAllocation };
      return;
    }
    if (allocation.to !== userId || allocation.status !== "UNCONFIRMED") {
      ctx.body = { error: i18n.errorInvalidClaim };
      return;
    }
    const pubWalletConfig = getConfig().walletPub;
    const { url, user, pass } = pubWalletConfig;
    const { txid } = await bankingModel.claimAllocation({
      transferId: allocationId,
      claimerId: userId,
      pubWalletUrl: url,
      pubWalletUser: user,
      pubWalletPass: pass,
    });
    await bankingModel.updateAllocationStatus(allocationId, "CLOSED", txid);
    await bankingModel.publishBankClaim({
      amount: allocation.amount,
      epochId: allocation.epochId,
      allocationId: allocation.id,
      txid,
    });
    ctx.redirect(`/banking?claimed=${encodeURIComponent(txid)}`);
  })
  .post("/banking/simulate", koaBody(), async (ctx) => {
    const epochId = ctx.request.body?.epochId || undefined;
    const rules = ctx.request.body?.rules || undefined;
    const { epoch, allocations } = await bankingModel.computeEpoch({ epochId: epochId || undefined, rules });
    ctx.body = { epoch, allocations };
  })
  .post("/banking/run", koaBody(), async (ctx) => {
    const epochId = ctx.request.body?.epochId || undefined;
    const rules = ctx.request.body?.rules || undefined;
    const { epoch, allocations } = await bankingModel.executeEpoch({ epochId: epochId || undefined, rules });
    ctx.body = { epoch, allocations };
  })
  .post("/banking/addresses", koaBody(), async (ctx) => {
    const userId = (ctx.request.body?.userId || "").trim();
    const address = (ctx.request.body?.address || "").trim();
    const res = await bankingModel.addAddress({ userId, address });
    ctx.redirect(`/banking?filter=addresses&msg=${encodeURIComponent(res.status)}`);
  })
  .post("/banking/addresses/delete", koaBody(), async (ctx) => {
    const userId = (ctx.request.body?.userId || "").trim();
    const res = await bankingModel.removeAddress({ userId });
    ctx.redirect(`/banking?filter=addresses&msg=${encodeURIComponent(res.status)}`);
  })
  .post("/favorites/remove/:kind/:id", koaBody(), async (ctx) => {
    await favoritesModel.removeFavorite(ctx.params.kind, ctx.params.id);
    const fallback = `/favorites?filter=${encodeURIComponent(ctx.query.filter || "all")}`;
    ctx.redirect(safeReturnTo(ctx, fallback, ["/favorites"]));
  })
  
  // UPDATE OASIS
  .post("/update", koaBody(), async (ctx) => {
    const util = require("node:util");
    const exec = util.promisify(require("node:child_process").exec);
    async function updateTool() {
      const { stdout, stderr } = await exec("git reset --hard && git pull");
      console.log("oasis@version: updating Oasis...");
      console.log(stdout);
      console.log(stderr);
      const { stdout: shOut, stderr: shErr } = await exec("sh install.sh");
      console.log("oasis@version: running install.sh...");
      console.log(shOut);
      console.error(shErr);
    }
    await updateTool();
    const referer = new URL(ctx.request.header.referer);
    ctx.redirect(referer.href);
  })  
  .post("/settings/theme", koaBody(), async (ctx) => {
    const theme = String(ctx.request.body.theme || "").trim();
    const currentConfig = getConfig();
    currentConfig.themes.current = theme || "Dark-SNH";
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2));
    ctx.cookies.set("theme", currentConfig.themes.current);
    ctx.redirect("/settings");
  })
  .post("/language", koaBody(), async (ctx) => {
    const language = String(ctx.request.body.language);
    ctx.cookies.set("language", language);
    const referer = new URL(ctx.request.header.referer);
    ctx.redirect(referer.href);
  })
  .post("/settings/conn/start", koaBody(), async (ctx) => {
    await meta.connStart();
    ctx.redirect("/peers");
  })
  .post("/settings/conn/stop", koaBody(), async (ctx) => {
    await meta.connStop();
    ctx.redirect("/peers");
  })
  .post("/settings/conn/sync", koaBody(), async (ctx) => {
    await meta.sync();
    ctx.redirect("/peers");
  })
  .post("/settings/conn/restart", koaBody(), async (ctx) => {
    await meta.connRestart();
    ctx.redirect("/peers");
  })
  .post("/settings/invite/accept", koaBody(), async (ctx) => {
    const invite = String(ctx.request.body.invite);
    await meta.acceptInvite(invite);
    ctx.redirect("/invites");
  })
  .post("/settings/invite/unfollow", koaBody(), async (ctx) => {
    const { key } = ctx.request.body || {};
    if (!key) { ctx.redirect("/invites"); return; }
    const pubs = readJSON(gossipPath);
    const idx = pubs.findIndex(x => x && canonicalKey(x.key) === canonicalKey(key));
    let removed = null;
    if (idx >= 0) {
      removed = pubs.splice(idx, 1)[0];
      writeJSON(gossipPath, pubs);
    }
    const ssb = await cooler.open();
    let addr = null;
    if (removed && removed.host) addr = msAddrFrom(removed.host, removed.port, removed.key);
    if (addr) {
     try { await new Promise(res => ssb.conn.disconnect(addr, res)); } catch {}
     try { ssb.conn.forget(addr); } catch {}
    } 
    try {
      await new Promise((resolve, reject) => {
        ssb.publish({ type: "contact", contact: canonicalKey(key), following: false, blocking: true }, (err) => err ? reject(err) : resolve());
      });
    } catch {}
    const unf = readJSON(unfollowedPath);
    if (removed && !unf.find(x => x && canonicalKey(x.key) === canonicalKey(removed.key))) {
      unf.push(removed);
      writeJSON(unfollowedPath, unf);
    } else if (!removed && !unf.find(x => x && canonicalKey(x.key) === canonicalKey(key))) {
      unf.push({ key: canonicalKey(key) });
      writeJSON(unfollowedPath, unf);
    }
    ctx.redirect("/invites");
  })
  .post("/settings/invite/follow", koaBody(), async (ctx) => {
    const { key, host, port } = ctx.request.body || {};
    if (!key || !host) { ctx.redirect("/invites"); return; }
    const isInErrorState = (host) => {
      const pubs = readJSON(gossipPath);
      const pub = pubs.find(p => p.host === host);
      return pub && pub.error;
    };
    if (isInErrorState(host)) {
      ctx.redirect("/invites");
      return;
    }
    const ssb = await cooler.open();
    const unf = readJSON(unfollowedPath);
    const kcanon = canonicalKey(key);
    const saved = unf.find(x => x && canonicalKey(x.key) === kcanon);
    const rec = saved || { host, port: Number(port) || 8008, key: kcanon };
    const pubs = readJSON(gossipPath);
    if (!pubs.find(x => x && canonicalKey(x.key) === kcanon)) {
      pubs.push({ host: rec.host, port: Number(rec.port) || 8008, key: kcanon });
      writeJSON(gossipPath, pubs);
    }
    const addr = msAddrFrom(rec.host, rec.port, kcanon);
    try { ssb.conn.remember(addr, { type: "pub", autoconnect: true, key: kcanon }); } catch {}
    try { await new Promise(res => ssb.conn.connect(addr, { type: "pub" }, res)); } catch {}
    try {
      await new Promise((resolve, reject) => {
        ssb.publish({ type: "contact", contact: kcanon, blocking: false }, (err) => err ? reject(err) : resolve());
      });
    } catch {}
    const nextUnf = unf.filter(x => !(x && canonicalKey(x.key) === kcanon));
    writeJSON(unfollowedPath, nextUnf);
    ctx.redirect("/invites");
  })
  .post("/settings/ssb-logstream", koaBody(), async (ctx) => {
    const logLimit = parseInt(ctx.request.body.ssb_log_limit, 10);
    if (!isNaN(logLimit) && logLimit > 0 && logLimit <= 100000) {
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      if (!config.ssbLogStream) config.ssbLogStream = {};
      config.ssbLogStream.limit = logLimit;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    }
    ctx.redirect("/settings");
  })
  .post("/settings/home-page", koaBody(), async (ctx) => {
    const homePage = String(ctx.request.body.homePage || "").trim();
    const currentConfig = getConfig();
    currentConfig.homePage = homePage || "activity";
    saveConfig(currentConfig);
    ctx.redirect("/settings");
  })
  .post("/settings/rebuild", async (ctx) => {
    meta.rebuild();
    ctx.redirect("/settings");
  })
  .post("/save-modules", koaBody(), async (ctx) => {
    const modules = [
    'popular', 'topics', 'summaries', 'latest', 'threads', 'multiverse', 'invites', 'wallet',
    'legacy', 'cipher', 'bookmarks', 'videos', 'docs', 'audios', 'tags', 'images', 'trending',
    'events', 'tasks', 'market', 'tribes', 'votes', 'reports', 'opinions', 'transfers',
    'feed', 'pixelia', 'agenda', 'favorites', 'ai', 'forum', 'jobs', 'projects', 'banking', 'parliament', 'courts'
    ];
    const currentConfig = getConfig();
    modules.forEach(mod => {
      const modKey = `${mod}Mod`;
      const formKey = `${mod}Form`;
      const modValue = ctx.request.body[formKey] === 'on' ? 'on' : 'off';
      currentConfig.modules[modKey] = modValue;
    });
    saveConfig(currentConfig);
    ctx.redirect(`/modules`);
  })
  .post("/settings/ai", koaBody(), async (ctx) => {
    const aiPrompt = String(ctx.request.body.ai_prompt || "").trim();
    if (aiPrompt.length > 128) {
      ctx.status = 400;
      ctx.body = "Prompt too long. Must be 128 characters or fewer.";
      return;
    }
    const currentConfig = getConfig();
    currentConfig.ai = currentConfig.ai || {};
    currentConfig.ai.prompt = aiPrompt;
    saveConfig(currentConfig);
    const referer = new URL(ctx.request.header.referer);
    ctx.redirect("/settings");
  })
  .post("/settings/pub-wallet", koaBody(), async (ctx) => {
    const walletUrl = String(ctx.request.body.wallet_url || "").trim();
    const walletUser = String(ctx.request.body.wallet_user || "").trim();
    const walletPass = String(ctx.request.body.wallet_pass || "").trim();
    const currentConfig = getConfig();
    currentConfig.walletPub = { 
      url: walletUrl, 
      user: walletUser, 
      pass: walletPass 
    };
    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2));
    ctx.redirect("/settings");
  })
  .post('/transfers/create', koaBody(), async ctx => {
    const transfersMod = ctx.cookies.get("transfersMod") || 'on'
    if (transfersMod !== 'on') { ctx.redirect('/modules'); return }
    const { to, concept, amount, deadline, tags } = ctx.request.body
    await transfersModel.createTransfer(to, concept, amount, deadline, tags)
    ctx.redirect(safeReturnTo(ctx, '/transfers?filter=all', ['/transfers']))
  })
  .post('/transfers/update/:id', koaBody(), async ctx => {
    const transfersMod = ctx.cookies.get("transfersMod") || 'on'
    if (transfersMod !== 'on') { ctx.redirect('/modules'); return }
    const { to, concept, amount, deadline, tags } = ctx.request.body
    await transfersModel.updateTransferById(ctx.params.id, to, concept, amount, deadline, tags)
    ctx.redirect(safeReturnTo(ctx, '/transfers?filter=mine', ['/transfers']))
  })
  .post('/transfers/confirm/:id', koaBody(), async ctx => {
    const transfersMod = ctx.cookies.get("transfersMod") || 'on'
    if (transfersMod !== 'on') { ctx.redirect('/modules'); return }
    await transfersModel.confirmTransferById(ctx.params.id)
    ctx.redirect(safeReturnTo(ctx, '/transfers', ['/transfers']))
  })
  .post('/transfers/delete/:id', koaBody(), async ctx => {
    const transfersMod = ctx.cookies.get("transfersMod") || 'on'
    if (transfersMod !== 'on') { ctx.redirect('/modules'); return }
    await transfersModel.deleteTransferById(ctx.params.id)
    ctx.redirect(safeReturnTo(ctx, '/transfers?filter=mine', ['/transfers']))
  })
  .post('/transfers/opinions/:transferId/:category', koaBody(), async ctx => {
    const transfersMod = ctx.cookies.get("transfersMod") || 'on'
    if (transfersMod !== 'on') { ctx.redirect('/modules'); return }
    const { transferId, category } = ctx.params
    await transfersModel.createOpinion(transferId, category)
    ctx.redirect(safeReturnTo(ctx, '/transfers', ['/transfers']))
  })
  .post("/settings/wallet", koaBody(), async (ctx) => {
    const url = String(ctx.request.body.wallet_url);
    const user = String(ctx.request.body.wallet_user);
    const pass = String(ctx.request.body.wallet_pass);
    const fee = String(ctx.request.body.wallet_fee);
    const currentConfig = getConfig();
    if (url) currentConfig.wallet.url = url;
    if (user) currentConfig.wallet.user = user;
    if (pass) currentConfig.wallet.pass = pass;
    if (fee) currentConfig.wallet.fee = fee;
    saveConfig(currentConfig);
    const res = await bankingModel.ensureSelfAddressPublished();
    ctx.redirect(`/banking?filter=addresses&msg=${encodeURIComponent(res.status)}`);
  })
  .post("/wallet/send", koaBody(), async (ctx) => {
    const action = String(ctx.request.body.action);
    const destination = String(ctx.request.body.destination);
    const amount = Number(ctx.request.body.amount);
    const fee = Number(ctx.request.body.fee);
    const { url, user, pass } = getConfig().wallet;
    let balance = null
    try {
      balance = await walletModel.getBalance(url, user, pass);
    } catch (error) {
      ctx.body = await walletErrorView(error);
    }
    switch (action) {
      case 'confirm':
        const validation = await walletModel.validateSend(url, user, pass, destination, amount, fee);
        if (validation.isValid) {
          try {
            ctx.body = await walletSendConfirmView(balance, destination, amount, fee);
          } catch (error) {
            ctx.body = await walletErrorView(error);
          }
        } else {
          try {
            const statusMessages = {
              type: 'error',
              title: 'validation_errors',
              messages: validation.errors,
            }
            ctx.body = await walletSendFormView(balance, destination, amount, fee, statusMessages);
          } catch (error) {
            ctx.body = await walletErrorView(error);
          }
        }
        break;
      case 'send':
        try {
          const txId = await walletModel.sendToAddress(url, user, pass, destination, amount);
          ctx.body = await walletSendResultView(balance, destination, amount, txId);
        } catch (error) {
          ctx.body = await walletErrorView(error);
        }
        break;
    }
  });

const routes = router.routes();

const middleware = [
  async (ctx, next) => {
    if (config.public && ctx.method !== "GET") {
      throw new Error(
        "Sorry, many actions are unavailable when Oasis is running in public mode. Please run Oasis in the default mode and try again."
      );
    }
    await next();
  },
  async (ctx, next) => {
    const selectedLanguage = ctx.cookies.get("language") || "en";
    setLanguage(selectedLanguage);
    await next();
  },
  async (ctx, next) => {
    const ssb = await cooler.open();

    const status = await ssb.status();
    const values = Object.values(status.sync.plugins);
    const totalCurrent = Object.values(status.sync.plugins).reduce(
      (acc, cur) => acc + cur,
      0
    );
    const totalTarget = status.sync.since * values.length;
    const left = totalTarget - totalCurrent;
    const percent = Math.floor((totalCurrent / totalTarget) * 1000) / 10;
    const megabyte = 1024 * 1024;
    if (left > megabyte) {
      ctx.response.body = indexingView({ percent });
    } else {
       try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = { message: err.message || 'Internal Server Error' };
  }
    }
  },
  routes,
];

const { allowHost } = config;
const app = http({ host, port, middleware, allowHost });

app._close = () => {
  nameWarmup.close();
  cooler.close();
};

module.exports = app;

if (config.open === true) {
  open(url);
}
