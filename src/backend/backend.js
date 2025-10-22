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
async function buildState(filter) {
  const f = (filter || 'government').toLowerCase();
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
const { handleBlobUpload } = require('../backend/blobHandler.js');

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
const bankingModel = require("../models/banking_model")({ services: { cooler }, isPublic: config.public })
const parliamentModel = require('../models/parliament_model')({ cooler, services: { tribes: tribesModel, votes: votesModel, inhabitants: inhabitantsModel, banking: bankingModel }
});

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

let formattedTextCache = null; 
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
    let matches = mentions[key];
    const meaningful = matches.filter((m) => (m.rel?.followsMe || m.rel?.following) && !m.rel?.blocking);
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
  const renderedText = await renderBlobMarkdown(text, mentions, authorMeta.id, authorMeta.name);
  const hasBrTags = /<br\s*\/?>/.test(renderedText);
  const formattedText = formattedTextCache || (!hasBrTags ? renderedText.replace(/\n/g, '<br>') : renderedText);
  if (!formattedTextCache && !hasBrTags) {
    formattedTextCache = formattedText;
  }
  const contentWarning = ctx.request.body.contentWarning || '';
  let finalContent = formattedText;
  if (contentWarning && !finalContent.startsWith(contentWarning)) {
    finalContent = `<br>${finalContent}`;
  }
  return { authorMeta, text: renderedText, formattedText: finalContent, mentions };
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
const { parliamentView } = require("../views/parliament_view");

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
    'feed', 'pixelia', 'agenda', 'ai', 'forum', 'jobs', 'projects', 'banking', 'parliament'
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
  .get('/images', async (ctx) => {
    const imagesMod = ctx.cookies.get("imagesMod") || 'on';
    if (imagesMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const filter = ctx.query.filter || 'all'
    const images = await imagesModel.listAll(filter);
    ctx.body = await imageView(images, filter, null);
   })
  .get('/images/edit/:id', async ctx => {
    const imageId = ctx.params.id;
    const images = await imagesModel.listAll('all');
    ctx.body = await imageView(images, 'edit', imageId);
   })
  .get('/images/:imageId', async ctx => {
    const imageId = ctx.params.imageId;
    const filter = ctx.query.filter || 'all'; 
    const image = await imagesModel.getImageById(imageId);
    ctx.body = await singleImageView(image, filter);
   })
  .get('/audios', async (ctx) => {
      const audiosMod = ctx.cookies.get("audiosMod") || 'on';
      if (audiosMod !== 'on') {
        ctx.redirect('/modules');
        return;
      }
      const filter = ctx.query.filter || 'all';
      const audios = await audiosModel.listAll(filter);
      ctx.body = await audioView(audios, filter, null);
   })
  .get('/audios/edit/:id', async (ctx) => {
      const audiosMod = ctx.cookies.get("audiosMod") || 'on';
      if (audiosMod !== 'on') {
        ctx.redirect('/modules');
        return;
    }
    const audio = await audiosModel.getAudioById(ctx.params.id);
    ctx.body = await audioView([audio], 'edit', ctx.params.id);
  })
  .get('/audios/:audioId', async ctx => {
    const audioId = ctx.params.audioId;
    const filter = ctx.query.filter || 'all'; 
    const audio = await audiosModel.getAudioById(audioId);
    ctx.body = await singleAudioView(audio, filter); 
  })
  .get('/videos', async (ctx) => {
      const filter = ctx.query.filter || 'all';
      const videos = await videosModel.listAll(filter);
      ctx.body = await videoView(videos, filter, null);
  })
  .get('/videos/edit/:id', async (ctx) => {
    const video = await videosModel.getVideoById(ctx.params.id);
    ctx.body = await videoView([video], 'edit', ctx.params.id);
  })
  .get('/videos/:videoId', async ctx => {
    const videoId = ctx.params.videoId;
    const filter = ctx.query.filter || 'all'; 
    const video = await videosModel.getVideoById(videoId);
    ctx.body = await singleVideoView(video, filter); 
  })
  .get('/documents', async (ctx) => {
    const filter = ctx.query.filter || 'all';
    const documents = await documentsModel.listAll(filter);
    ctx.body = await documentView(documents, filter, null);
  })
  .get('/documents/edit/:id', async (ctx) => {
    const document = await documentsModel.getDocumentById(ctx.params.id);
    ctx.body = await documentView([document], 'edit', ctx.params.id);
  })
  .get('/documents/:documentId', async ctx => {
    const documentId = ctx.params.documentId;
    const filter = ctx.query.filter || 'all'; 
    const document = await documentsModel.getDocumentById(documentId);
    ctx.body = await singleDocumentView(document, filter);
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
    const reports = await reportsModel.listAll(filter);
    ctx.body = await reportView(reports, filter, null);
  })
  .get('/reports/edit/:id', async ctx => {
    const report = await reportsModel.getReportById(ctx.params.id);
    ctx.body = await reportView([report], 'edit', ctx.params.id);
  })
  .get('/reports/:reportId', async ctx => {
    const reportId = ctx.params.reportId;
    const filter = ctx.query.filter || 'all'; 
    const report = await reportsModel.getReportById(reportId, filter);
    ctx.body = await singleReportView(report, filter);
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
    const query = {
        search: ctx.query.search || ''
    };
    if (['CVs', 'MATCHSKILLS'].includes(filter)) {
        query.location = ctx.query.location || '';
        query.language = ctx.query.language || '';
        query.skills = ctx.query.skills || '';
    }
    const userId = SSBconfig.config.keys.id;
    const inhabitants = await inhabitantsModel.listInhabitants({
        filter,
        ...query
    });
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
    const about = await inhabitantsModel.getLatestAboutById(id);
    const cv = await inhabitantsModel.getCVByUserId(id);
    const feed = await inhabitantsModel.getFeedByUserId(id);
    const currentUserId = SSBconfig.config.keys.id;
    ctx.body = await inhabitantsProfileView({ about, cv, feed }, currentUserId);
  })
 .get('/parliament', async (ctx) => {
    const mod = ctx.cookies.get('parliamentMod') || 'on';
    if (mod !== 'on') { ctx.redirect('/modules'); return }
    const filter = (ctx.query.filter || 'government').toLowerCase();
    let governmentCard = await parliamentModel.getGovernmentCard();
    if (!governmentCard || !governmentCard.end || moment().isAfter(moment(governmentCard.end))) {
      await parliamentModel.resolveElection();
      governmentCard = await parliamentModel.getGovernmentCard();
    }
    const [
      candidatures, proposals, futureLaws, canPropose, laws,
      historical, leaders, revocations, futureRevocations, revocationsEnactedCount,
      inhabitantsAll
      ] = await Promise.all([
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
    const leaderMeta = leader ? await parliamentModel.getActorMeta({ targetType: leader.targetType || leader.powerType || 'inhabitant', targetId: leader.targetId || leader.powerId }) : null;
    const powerMeta = (governmentCard && (governmentCard.powerType === 'tribe' || governmentCard.powerType === 'inhabitant'))
      ? await parliamentModel.getActorMeta({ targetType: governmentCard.powerType, targetId: governmentCard.powerId })
      : null;
    const historicalMetas = {};
    for (const g of (historical || []).slice(0, 12)) {
      if (g.powerType === 'tribe' || g.powerType === 'inhabitant') {
        const k = `${g.powerType}:${g.powerId}`;
        if (!historicalMetas[k]) {
          historicalMetas[k] = await parliamentModel.getActorMeta({ targetType: g.powerType, targetId: g.powerId });
        }
      }
    }
    const leadersMetas = {};
    for (const r of (leaders || []).slice(0, 20)) {
      if (r.powerType === 'tribe' || r.powerType === 'inhabitant') {
        const k = `${r.powerType}:${r.powerId}`;
        if (!leadersMetas[k]) {
          leadersMetas[k] = await parliamentModel.getActorMeta({ targetType: r.powerType, targetId: r.powerId });
        }
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
  .get("/blob/:blobId", async (ctx) => {
    const { blobId } = ctx.params;
    const id = blobId.startsWith('&') ? blobId : `&${blobId}`;
    const buffer = await blob.getResolved({ blobId });
    let fileType;
    try {
      fileType = await FileType.fromBuffer(buffer);
    } catch {
      fileType = null;
    }
    let mime = fileType?.mime || "application/octet-stream";
    if (mime === "application/octet-stream" && buffer.slice(0, 4).toString() === "%PDF") {
      mime = "application/pdf";
    }
    ctx.set("Content-Type", mime);
    ctx.set("Content-Disposition", `inline; filename="${blobId}"`);
    ctx.set("Cache-Control", "public, max-age=31536000, immutable");
    ctx.body = buffer;
  })
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
  .get('/feed', async ctx => {
    const filter = ctx.query.filter || 'ALL';
    const feeds = await feedModel.listFeeds(filter);
    ctx.body = feedView(feeds, filter);
  })
  .get('/feed/create', async ctx => {
    ctx.body = feedCreateView();
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
    if (bookmarksMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const filter = ctx.query.filter || 'all';
    const bookmarks = await bookmarksModel.listAll(null, filter);
    ctx.body = await bookmarkView(bookmarks, filter, null); 
  })
  .get('/bookmarks/edit/:id', async (ctx) => {
    const bookmarksMod = ctx.cookies.get("bookmarksMod") || 'on';
    if (bookmarksMod !== 'on') {
      ctx.redirect('/modules');
     return;
    } 
    const bookmarkId = ctx.params.id;
    const bookmark = await bookmarksModel.getBookmarkById(bookmarkId);
    if (bookmark.opinions_inhabitants && bookmark.opinions_inhabitants.length > 0) {
        ctx.flash = { message: "This bookmark has received votes and cannot be updated." };
        ctx.redirect(`/bookmarks?filter=mine`);
    }
    ctx.body = await bookmarkView([bookmark], 'edit', bookmarkId);
  })
  .get('/bookmarks/:bookmarkId', async ctx => {
    const bookmarkId = ctx.params.bookmarkId;
    const filter = ctx.query.filter || 'all'; 
    const bookmark = await bookmarksModel.getBookmarkById(bookmarkId);
    ctx.body = await singleBookmarkView(bookmark, filter);
  })
  .get('/tasks', async ctx=>{
    const filter = ctx.query.filter||'all';
    const tasks = await tasksModel.listAll(filter);
    ctx.body = await taskView(tasks,filter,null);
  })
  .get('/tasks/edit/:id', async ctx=>{
    const id = ctx.params.id;
    const task = await tasksModel.getTaskById(id);
    ctx.body = await taskView(task,'edit',id);
  })
  .get('/tasks/:taskId', async ctx => {
    const taskId = ctx.params.taskId;
    const filter = ctx.query.filter || 'all'; 
    const task = await tasksModel.getTaskById(taskId, filter);
    ctx.body = await taskView([task], filter, taskId);
  })
  .get('/events', async (ctx) => {
    const eventsMod = ctx.cookies.get("eventsMod") || 'on';
    if (eventsMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const filter = ctx.query.filter || 'all';
    const events = await eventsModel.listAll(null, filter);
    ctx.body = await eventView(events, filter, null);
  })
  .get('/events/edit/:id', async (ctx) => {
    const eventsMod = ctx.cookies.get("eventsMod") || 'on';
    if (eventsMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const eventId = ctx.params.id;
    const event = await eventsModel.getEventById(eventId);
    ctx.body = await eventView([event], 'edit', eventId);
   })
  .get('/events/:eventId', async ctx => {
    const eventId = ctx.params.eventId;
    const filter = ctx.query.filter || 'all'; 
    const event = await eventsModel.getEventById(eventId);
    ctx.body = await singleEventView(event, filter);
  })
  .get('/votes', async ctx => {
    const filter = ctx.query.filter || 'all';
    const voteList = await votesModel.listAll(filter);
    ctx.body = await voteView(voteList, filter, null);
   })
  .get('/votes/edit/:id', async ctx => {
    const id = ctx.params.id;
    const vote = await votesModel.getVoteById(id);
    ctx.body = await voteView([vote], 'edit', id);
   })
  .get('/votes/:voteId', async ctx => {
    const voteId = ctx.params.voteId;
    const vote = await votesModel.getVoteById(voteId);
    ctx.body = await voteView(vote);
   })
  .get('/market', async ctx => {
    const marketMod = ctx.cookies.get("marketMod") || 'on';
    if (marketMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const filter = ctx.query.filter || 'all';
    const marketItems = await marketModel.listAllItems(filter);
    ctx.body = await marketView(marketItems, filter, null);
   })
  .get('/market/edit/:id', async ctx => {
    const id = ctx.params.id;
    const marketItem = await marketModel.getItemById(id);
    ctx.body = await marketView([marketItem], 'edit', marketItem);
   })
  .get('/market/:itemId', async ctx => {
    const itemId = ctx.params.itemId;
    const filter = ctx.query.filter || 'all'; 
    const item = await marketModel.getItemById(itemId); 
    ctx.body = await singleMarketView(item, filter);
   })
  .get('/jobs', async (ctx) => {
    const jobsMod = ctx.cookies.get("jobsMod") || 'on';
    if (jobsMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const filter = ctx.query.filter || 'ALL';
    const query = {
      search: ctx.query.search || '',
    };
    if (filter === 'CV') {
      query.location = ctx.query.location || '';
      query.language = ctx.query.language || '';
      query.skills = ctx.query.skills || '';
      const inhabitants = await inhabitantsModel.listInhabitants({ 
        filter: 'CVs', 
        ...query 
      });
      ctx.body = await jobsView(inhabitants, filter, query);
      return;
    }
    const jobs = await jobsModel.listJobs(filter, ctx.state.user?.id, query);
    ctx.body = await jobsView(jobs, filter, query);
  })
  .get('/jobs/edit/:id', async (ctx) => {
    const id = ctx.params.id;
    const job = await jobsModel.getJobById(id);
    ctx.body = await jobsView([job], 'EDIT');
  })
  .get('/jobs/:jobId', async (ctx) => {
    const jobId = ctx.params.jobId;
    const filter = ctx.query.filter || 'ALL';
    const job = await jobsModel.getJobById(jobId);
    ctx.body = await singleJobsView(job, filter);
  })
  .get('/projects', async (ctx) => {
    const projectsMod = ctx.cookies.get("projectsMod") || 'on';
    if (projectsMod !== 'on') { ctx.redirect('/modules'); return; }
    const filter = ctx.query.filter || 'ALL';
    if (filter === 'CREATE') {
      ctx.body = await projectsView([], 'CREATE');
      return;
    }
    const modelFilter = (filter === 'BACKERS') ? 'ALL' : filter;
    let projects = await projectsModel.listProjects(modelFilter);
    if (filter === 'MINE') {
      const userId = SSBconfig.config.keys.id;
      projects = projects.filter(project => project.author === userId);
    }
    ctx.body = await projectsView(projects, filter);
  })
  .get('/projects/edit/:id', async (ctx) => {
    const id = ctx.params.id
    const pr = await projectsModel.getProjectById(id)
    ctx.body = await projectsView([pr], 'EDIT')
  })
  .get('/projects/:projectId', async (ctx) => {
    const projectId = ctx.params.projectId
    const filter = ctx.query.filter || 'ALL'
    const project = await projectsModel.getProjectById(projectId)
    ctx.body = await singleProjectView(project, filter)
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
    const filter = ctx.query.filter || 'all'
    const list = await transfersModel.listAll(filter)
    ctx.body = await transferView(list, filter, null)
  })
  .get('/transfers/edit/:id', async ctx => {
    const tr = await transfersModel.getTransferById(ctx.params.id)
    ctx.body = await transferView([tr], 'edit', ctx.params.id)
  })
  .get('/transfers/:transferId', async ctx => {
    const transferId = ctx.params.transferId;
    const filter = ctx.query.filter || 'all'; 
    const transfer = await transfersModel.getTransferById(transferId);
    ctx.body = await singleTransferView(transfer, filter);
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
  .post('/feed/create', koaBody(), async ctx => {
    const { text } = ctx.request.body || {};
    await feedModel.createFeed(text.trim());
    ctx.redirect('/feed');
  })
  .post('/feed/opinions/:feedId/:category', async ctx => {
    const { feedId, category } = ctx.params;
    await opinionsModel.createVote(feedId, category);
    ctx.redirect('/feed');
  })
  .post('/feed/refeed/:id', koaBody(), async ctx => {
    await feedModel.createRefeed(ctx.params.id);
    ctx.redirect('/feed');
  })
  .post('/bookmarks/create', koaBody(), async (ctx) => {
    const { url, tags, description, category, lastVisit } = ctx.request.body;
    const formattedLastVisit = lastVisit ? moment(lastVisit).isBefore(moment()) ? moment(lastVisit).toISOString() : moment().toISOString() : moment().toISOString();
    await bookmarksModel.createBookmark(url, tags, description, category, formattedLastVisit);
    ctx.redirect('/bookmarks');
  })
  .post('/bookmarks/update/:id', koaBody(), async (ctx) => {
    const { url, tags, description, category, lastVisit } = ctx.request.body;
    const bookmarkId = ctx.params.id;
    const formattedLastVisit = lastVisit 
     ? moment(lastVisit).isBefore(moment()) 
        ? moment(lastVisit).toISOString() 
        : moment().toISOString() 
      : moment().toISOString();
    const bookmark = await bookmarksModel.getBookmarkById(bookmarkId);
    if (bookmark.opinions_inhabitants && bookmark.opinions_inhabitants.length > 0) {
        ctx.flash = { message: "This bookmark has received votes and cannot be updated." };
        ctx.redirect(`/bookmarks?filter=mine`);
    }
    await bookmarksModel.updateBookmarkById(bookmarkId, {
      url,
      tags,
      description,
      category,
      lastVisit: formattedLastVisit,
      createdAt: bookmark.createdAt,
      author: bookmark.author,
    });
    ctx.redirect('/bookmarks?filter=mine');
  })
  .post('/bookmarks/delete/:id', koaBody(), async (ctx) => {
    const bookmarkId = ctx.params.id;
    await bookmarksModel.deleteBookmarkById(bookmarkId);
    ctx.redirect('/bookmarks?filter=mine');
  })
  .post('/bookmarks/opinions/:bookmarkId/:category', async (ctx) => {
    const { bookmarkId, category } = ctx.params;
    const voterId = SSBconfig?.keys?.id;
    const bookmark = await bookmarksModel.getBookmarkById(bookmarkId);
    if (bookmark.opinions_inhabitants && bookmark.opinions_inhabitants.includes(voterId)) {
      ctx.flash = { message: "You have already opined." };
      ctx.redirect('/bookmarks');
      return;
    }
    await opinionsModel.createVote(bookmarkId, category, 'bookmark');
    ctx.redirect('/bookmarks');
  })
  .post('/images/create', koaBody({ multipart: true }), async ctx => {
    const blob = await handleBlobUpload(ctx, 'image');
    const { tags, title, description, meme } = ctx.request.body;
    await imagesModel.createImage(blob, tags, title, description, meme);
    ctx.redirect('/images');
  })
  .post('/images/update/:id', koaBody({ multipart: true }), async ctx => {
    const { tags, title, description, meme } = ctx.request.body;
    const blob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    const match = blob?.match(/\(([^)]+)\)/);
    const blobId = match ? match[1] : blob;
    await imagesModel.updateImageById(ctx.params.id, blobId, tags, title, description, meme);
    ctx.redirect('/images?filter=mine');
  })
  .post('/images/delete/:id', koaBody(), async ctx => {
    await imagesModel.deleteImageById(ctx.params.id);
    ctx.redirect('/images?filter=mine');
  })
  .post('/images/opinions/:imageId/:category', async ctx => {
    const { imageId, category } = ctx.params;
    const voterId = SSBconfig?.keys?.id;
    const image = await imagesModel.getImageById(imageId);
    if (image.opinions_inhabitants && image.opinions_inhabitants.includes(voterId)) {
      ctx.flash = { message: "You have already opined." };
      ctx.redirect('/images');
      return;
    }
    await imagesModel.createOpinion(imageId, category, 'image');
    ctx.redirect('/images');
  })
  .post('/audios/create', koaBody({ multipart: true }), async (ctx) => {
    const audioBlob = await handleBlobUpload(ctx, 'audio');
    const { tags, title, description } = ctx.request.body;
    await audiosModel.createAudio(audioBlob, tags, title, description);
    ctx.redirect('/audios');
  })
  .post('/audios/update/:id', koaBody({ multipart: true }), async (ctx) => {
    const { tags, title, description } = ctx.request.body;
    const blob = ctx.request.files?.audio ? await handleBlobUpload(ctx, 'audio') : null;
    await audiosModel.updateAudioById(ctx.params.id, blob, tags, title, description);
    ctx.redirect('/audios?filter=mine');
  })
  .post('/audios/delete/:id', koaBody(), async (ctx) => {
    await audiosModel.deleteAudioById(ctx.params.id);
    ctx.redirect('/audios?filter=mine');
  })
  .post('/audios/opinions/:audioId/:category', async (ctx) => {
    const { audioId, category } = ctx.params;
    const voterId = SSBconfig?.keys?.id;
    const audio = await audiosModel.getAudioById(audioId);
    if (audio.opinions_inhabitants?.includes(voterId)) {
      ctx.flash = { message: "You have already opined." };
      ctx.redirect('/audios');
      return;
    }
    await audiosModel.createOpinion(audioId, category);
    ctx.redirect('/audios');
  })
  .post('/videos/create', koaBody({ multipart: true }), async (ctx) => {
    const videoBlob = await handleBlobUpload(ctx, 'video');
    const { tags, title, description } = ctx.request.body;
    await videosModel.createVideo(videoBlob, tags, title, description);
    ctx.redirect('/videos');
  })
  .post('/videos/update/:id', koaBody({ multipart: true }), async (ctx) => {
    const { tags, title, description } = ctx.request.body;
    const blob = ctx.request.files?.video ? await handleBlobUpload(ctx, 'video') : null;
    await videosModel.updateVideoById(ctx.params.id, blob, tags, title, description);
    ctx.redirect('/videos?filter=mine');
  })
  .post('/videos/delete/:id', koaBody(), async (ctx) => {
    await videosModel.deleteVideoById(ctx.params.id);
    ctx.redirect('/videos?filter=mine');
  })
  .post('/videos/opinions/:videoId/:category', async (ctx) => {
    const { videoId, category } = ctx.params;
    const voterId = SSBconfig?.keys?.id;
    const video = await videosModel.getVideoById(videoId);
    if (video.opinions_inhabitants?.includes(voterId)) {
      ctx.flash = { message: "You have already opined." };
      ctx.redirect('/videos');
      return;
    }
    await videosModel.createOpinion(videoId, category);
    ctx.redirect('/videos');
  })
  .post('/documents/create', koaBody({ multipart: true }), async (ctx) => {
    const docBlob = await handleBlobUpload(ctx, 'document');
    const { tags, title, description } = ctx.request.body;
    await documentsModel.createDocument(docBlob, tags, title, description);
    ctx.redirect('/documents');
  })
  .post('/documents/update/:id', koaBody({ multipart: true }), async (ctx) => {
    const { tags, title, description } = ctx.request.body;
    const blob = ctx.request.files?.document ? await handleBlobUpload(ctx, 'document') : null;
    await documentsModel.updateDocumentById(ctx.params.id, blob, tags, title, description);
    ctx.redirect('/documents?filter=mine');
  })
  .post('/documents/delete/:id', koaBody(), async (ctx) => {
    await documentsModel.deleteDocumentById(ctx.params.id);
    ctx.redirect('/documents?filter=mine');
  })
  .post('/documents/opinions/:documentId/:category', async (ctx) => {
    const { documentId, category } = ctx.params;
    const voterId = SSBconfig?.keys?.id;
    const document = await documentsModel.getDocumentById(documentId);
    if (document.opinions_inhabitants?.includes(voterId)) {
      ctx.flash = { message: "You have already opined." };
      ctx.redirect('/documents');
      return;
    }
    await documentsModel.createOpinion(documentId, category);
     ctx.redirect('/documents');
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
  .post('/tasks/create', koaBody(), async (ctx) => {
    const { title, description, startTime, endTime, priority, location, tags, isPublic } = ctx.request.body;
    await tasksModel.createTask(title, description, startTime, endTime, priority, location, tags, isPublic);
    ctx.redirect('/tasks?filter=mine');
  })
  .post('/tasks/update/:id', koaBody(), async (ctx) => {
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
    ctx.redirect('/tasks?filter=mine');
  })
  .post('/tasks/assign/:id', koaBody(), async (ctx) => {
    const taskId = ctx.params.id;
    await tasksModel.toggleAssignee(taskId);
    ctx.redirect('/tasks');
   })
  .post('/tasks/delete/:id', koaBody(), async (ctx) => {
    const taskId = ctx.params.id;
    await tasksModel.deleteTaskById(taskId);
    ctx.redirect('/tasks?filter=mine');
   })
  .post('/tasks/status/:id', koaBody(), async (ctx) => {
    const taskId = ctx.params.id;
    const { status } = ctx.request.body;
    await tasksModel.updateTaskStatus(taskId, status);
    ctx.redirect('/tasks?filter=mine');
   })
  .post('/reports/create', koaBody({ multipart: true }), async ctx => {
      const { title, description, category, tags, severity } = ctx.request.body;
      const image = await handleBlobUpload(ctx, 'image');
      await reportsModel.createReport(title, description, category, image, tags, severity);
      ctx.redirect('/reports');
   })
  .post('/reports/update/:id', koaBody({ multipart: true }), async ctx => {
      const { title, description, category, tags, severity } = ctx.request.body;
      const image = await handleBlobUpload(ctx, 'image');
      await reportsModel.updateReportById(ctx.params.id, {
        title, description, category, image, tags, severity
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
  .post('/reports/status/:id', koaBody(), async (ctx) => {
    const reportId = ctx.params.id;
    const { status } = ctx.request.body;
    await reportsModel.updateReportById(reportId, { status });
    ctx.redirect('/reports?filter=mine');
  })
  .post('/events/create', koaBody(), async (ctx) => {
    const { title, description, date, location, price, url, attendees, tags, isPublic } = ctx.request.body;
    await eventsModel.createEvent(title, description, date, location, price, url, attendees, tags, isPublic);
    ctx.redirect('/events?filter=mine');
  })
  .post('/events/update/:id', koaBody(), async (ctx) => {
    const { title, description, date, location, price, url, attendees, tags, isPublic } = ctx.request.body;
    const eventId = ctx.params.id;
    const event = await eventsModel.getEventById(eventId);
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
      createdAt: event.createdAt,
      organizer: event.organizer,
    });
    ctx.redirect('/events?filter=mine');
  })
  .post('/events/attend/:id', koaBody(), async (ctx) => {
    const eventId = ctx.params.id;
    await eventsModel.toggleAttendee(eventId);
    ctx.redirect('/events');
  })
  .post('/events/delete/:id', koaBody(), async (ctx) => {
    const eventId = ctx.params.id;
    await eventsModel.deleteEventById(eventId);
    ctx.redirect('/events?filter=mine');
  })
  .post('/votes/create', koaBody(), async ctx => {
    const { question, deadline, options, tags = '' } = ctx.request.body;
    const defaultOptions = ['YES', 'NO', 'ABSTENTION', 'CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'];
    const parsedOptions = options
      ? options.split(',').map(o => o.trim()).filter(Boolean)
      : defaultOptions;
    const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    await votesModel.createVote(question, deadline, parsedOptions, parsedTags);
    ctx.redirect('/votes');
  })
  .post('/votes/update/:id', koaBody(), async ctx => {
    const id = ctx.params.id;
    const { question, deadline, options, tags = '' } = ctx.request.body;
    const parsedOptions = options
      ? options.split(',').map(o => o.trim()).filter(Boolean)
      : undefined;
    const parsedTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    await votesModel.updateVoteById(id, { question, deadline, options: parsedOptions, tags: parsedTags });
    ctx.redirect('/votes?filter=mine');
  })
  .post('/votes/delete/:id', koaBody(), async ctx => {
    const id = ctx.params.id;
    await votesModel.deleteVoteById(id);
    ctx.redirect('/votes?filter=mine');
  })
  .post('/votes/vote/:id', koaBody(), async ctx => {
    const id = ctx.params.id;
    const { choice } = ctx.request.body;
    await votesModel.voteOnVote(id, choice);
    ctx.redirect('/votes?filter=open');
  })
  .post('/votes/opinions/:voteId/:category', async (ctx) => {
    const { voteId, category } = ctx.params;
    const voterId = SSBconfig?.keys?.id;
    const vote = await votesModel.getVoteById(voteId);
    if (vote.opinions_inhabitants && vote.opinions_inhabitants.includes(voterId)) {
      ctx.flash = { message: "You have already opined." };
      ctx.redirect('/votes');
      return;
    }
    await votesModel.createOpinion(voteId, category);
    ctx.redirect('/votes');
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
    await parliamentModel.resolveElection().catch(e => ctx.throw(400, String((e && e.message) || e)));
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
  .post('/market/create', koaBody({ multipart: true }), async ctx => {
    const { item_type, title, description, price, tags, item_status, deadline, includesShipping, stock } = ctx.request.body;
    const image = await handleBlobUpload(ctx, 'image');
    if (!stock || stock <= 0) {
      ctx.throw(400, 'Stock must be a positive number.');
    }
    await marketModel.createItem(item_type, title, description, image, price, tags, item_status, deadline, includesShipping, stock);
   ctx.redirect('/market');
  })
  .post('/market/update/:id', koaBody({ multipart: true }), async ctx => {
    const id = ctx.params.id;
    const { item_type, title, description, price, tags = '', item_status, deadline, includesShipping, stock } = ctx.request.body;
    const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (stock < 0) {
      ctx.throw(400, 'Stock cannot be negative.');
    }
    const updatedData = {
      item_type, 
      title, 
      description, 
      price, 
      item_status, 
      deadline, 
      includesShipping, 
      tags: parsedTags, 
      stock
    };
    const image = await handleBlobUpload(ctx, 'image');
    updatedData.image = image;
    await marketModel.updateItemById(id, updatedData);
    ctx.redirect('/market?filter=mine'); 
  })
  .post('/market/delete/:id', koaBody(), async ctx => {
    const id = ctx.params.id;
    await marketModel.deleteItemById(id);
    ctx.redirect('/market?filter=mine');
  })
  .post('/market/sold/:id', koaBody(), async ctx => {
    const id = ctx.params.id;
    const marketItem = await marketModel.getItemById(id);
    if (marketItem.stock <= 0) {
      ctx.throw(400, 'No stock left to mark as sold.');
    }
    if (marketItem.status !== 'SOLD') {
      await marketModel.setItemAsSold(id);
      await marketModel.decrementStock(id);
    }
    ctx.redirect('/market?filter=mine');
  })
  .post('/market/buy/:id', koaBody(), async ctx => {
    const id = ctx.params.id;
    const marketItem = await marketModel.getItemById(id);
    if (marketItem.item_type === 'exchange') {
      if (marketItem.status !== 'SOLD') {
        const buyerId = SSBconfig.config.keys.id;
        const { price, title, seller } = marketItem;
        const subject = `MARKET_SOLD`;
        const text = `item "${title}" has been sold -> /market/${id}  OASIS ID: ${buyerId}  for: $${price}`;
        await pmModel.sendMessage([seller], subject, text);
        await marketModel.setItemAsSold(id);
      }
    }
    await marketModel.decrementStock(id);
    ctx.redirect('/inbox?filter=sent');
  })
  .post('/market/bid/:id', koaBody(), async ctx => {
    const id = ctx.params.id;
    const userId = SSBconfig.config.keys.id;
    const { bidAmount } = ctx.request.body;
    const marketItem = await marketModel.getItemById(id);
    await marketModel.addBidToAuction(id, userId, bidAmount);
    if (marketItem.stock > 0 && marketItem.status === 'SOLD') {
      await marketModel.decrementStock(id);
    }
    ctx.redirect('/market?filter=auctions');
  })
  .post('/jobs/create', koaBody({ multipart: true }), async (ctx) => {
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
      salary
    } = ctx.request.body;
    const imageBlob = ctx.request.files?.image
      ? await handleBlobUpload(ctx, 'image')
      : null;
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
      salary: salary != null ? parseFloat(salary) : 0,
      image: imageBlob
    });
    ctx.redirect('/jobs?filter=MINE');
  })
  .post('/jobs/update/:id', koaBody({ multipart: true }), async (ctx) => {
    const id = ctx.params.id;
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
      salary
    } = ctx.request.body;
    const imageBlob = ctx.request.files?.image
      ? await handleBlobUpload(ctx, 'image')
      : undefined;
    await jobsModel.updateJob(id, {
      job_type,
      title,
      description,
      requirements,
      languages,
      job_time,
      tasks,
      location,
      vacants: vacants ? parseInt(vacants, 10) : undefined,
      salary: salary != null && salary !== '' ? parseFloat(salary) : undefined,
      image: imageBlob
    });
    ctx.redirect('/jobs?filter=MINE');
  })
  .post('/jobs/delete/:id', koaBody(), async (ctx) => {
    const id = ctx.params.id;
    await jobsModel.deleteJob(id);
    ctx.redirect('/jobs?filter=MINE');
  })
  .post('/jobs/status/:id', koaBody(), async (ctx) => {
    const id = ctx.params.id;
    const { status } = ctx.request.body;
    await jobsModel.updateJobStatus(id, String(status).toUpperCase());
    ctx.redirect('/jobs?filter=MINE');
  })
  .post('/jobs/subscribe/:id', koaBody(), async (ctx) => {
    const rawId = ctx.params.id;
    const userId = SSBconfig.config.keys.id;
    const latestId = await jobsModel.getJobTipId(rawId);
    const job = await jobsModel.getJobById(latestId);
    const subs = Array.isArray(job.subscribers) ? job.subscribers.slice() : [];
    if (!subs.includes(userId)) subs.push(userId);
    await jobsModel.updateJob(latestId, { subscribers: subs });
    const subject = 'JOB_SUBSCRIBED';
    const title = job.title || '';
    const text = `has subscribed to your job offer "${title}" -> /jobs/${latestId}`;
    await pmModel.sendMessage([job.author], subject, text);
    ctx.redirect('/jobs');
  })
  .post('/jobs/unsubscribe/:id', koaBody(), async (ctx) => {
    const rawId = ctx.params.id;
    const userId = SSBconfig.config.keys.id;
    const latestId = await jobsModel.getJobTipId(rawId);
    const job = await jobsModel.getJobById(latestId);
    const subs = Array.isArray(job.subscribers) ? job.subscribers.slice() : [];
    const next = subs.filter(uid => uid !== userId);
    await jobsModel.updateJob(latestId, { subscribers: next });
    const subject = 'JOB_UNSUBSCRIBED';
    const title = job.title || '';
    const text = `has unsubscribed from your job offer "${title}" -> /jobs/${latestId}`;
    await pmModel.sendMessage([job.author], subject, text);
    ctx.redirect('/jobs');
  })
 .post('/projects/create', koaBody({ multipart: true }), async (ctx) => {
    const b = ctx.request.body || {};
    const imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    const bounties =
        b.bountiesInput
            ? b.bountiesInput.split('\n').filter(Boolean).map(l => {
                const [t, a, d] = l.split('|');
                return { title: (t || '').trim(), amount: parseFloat(a || 0) || 0, description: (d || '').trim(), milestoneIndex: null };
            })
            : [];
    await projectsModel.createProject({
        ...b,
        title: b.title,
        description: b.description,
        goal: b.goal != null && b.goal !== '' ? parseFloat(b.goal) : 0,
        deadline: b.deadline ? new Date(b.deadline).toISOString() : null,
        progress: b.progress != null && b.progress !== '' ? parseInt(b.progress, 10) : 0,
        bounties,
        image: imageBlob
    });
    ctx.redirect('/projects?filter=MINE');
  })
  .post('/projects/update/:id', koaBody({ multipart: true }), async (ctx) => {
    const id = ctx.params.id;
    const b = ctx.request.body || {};
    const imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : undefined;
    await projectsModel.updateProject(id, {
        title: b.title,
        description: b.description,
        goal: b.goal !== '' && b.goal != null ? parseFloat(b.goal) : undefined,
        deadline: b.deadline ? new Date(b.deadline).toISOString() : undefined,
        progress: b.progress !== '' && b.progress != null ? parseInt(b.progress, 10) : undefined,
        bounties: b.bountiesInput !== undefined
           ? b.bountiesInput.split('\n').filter(Boolean).map(l => {
                const [t, a, d] = l.split('|');
                return { title: (t || '').trim(), amount: parseFloat(a || 0) || 0, description: (d || '').trim(), milestoneIndex: null };
           })
            : undefined,
        image: imageBlob
    });
    ctx.redirect('/projects?filter=MINE');
  })
  .post('/projects/delete/:id', koaBody(), async (ctx) => {
    await projectsModel.deleteProject(ctx.params.id);
    ctx.redirect('/projects?filter=MINE');
  })
  .post('/projects/status/:id', koaBody(), async (ctx) => {
    await projectsModel.updateProjectStatus(ctx.params.id, String(ctx.request.body.status || '').toUpperCase());
    ctx.redirect('/projects?filter=MINE');
  })
  .post('/projects/progress/:id', koaBody(), async (ctx) => {
    const { progress } = ctx.request.body;
    await projectsModel.updateProjectProgress(ctx.params.id, progress);
    ctx.redirect(`/projects/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/projects/pledge/:id', koaBody(), async (ctx) => {
    const rawId = ctx.params.id;
    const latestId = await projectsModel.getProjectTipId(rawId); 
    const { amount, milestoneOrBounty = '' } = ctx.request.body;
    const pledgeAmount = parseFloat(amount);
    if (isNaN(pledgeAmount) || pledgeAmount <= 0) ctx.throw(400, 'Invalid amount');
    const userId = SSBconfig.config.keys.id;
    const project = await projectsModel.getProjectById(latestId);
    if (project.author === userId) ctx.throw(403, 'Authors cannot pledge to their own project');
    let milestoneIndex = null;
    let bountyIndex = null;
    if (milestoneOrBounty.startsWith('milestone:')) {
     milestoneIndex = parseInt(milestoneOrBounty.split(':')[1], 10);
    } else if (milestoneOrBounty.startsWith('bounty:')) {
      bountyIndex = parseInt(milestoneOrBounty.split(':')[1], 10);
    }
    const deadlineISO = require('../server/node_modules/moment')().add(14, 'days').toISOString();
    const tags = ['backer-pledge', `project:${latestId}`];
    const transfer = await transfersModel.createTransfer(
      project.author,
      'Project Pledge',
      pledgeAmount,
      deadlineISO,
      tags
    );
    const transferId = transfer.key || transfer.id;
    const backers = Array.isArray(project.backers) ? project.backers.slice() : [];
    backers.push({
      userId,
      amount: pledgeAmount,
      at: new Date().toISOString(),
      transferId,
      confirmed: false,
      milestoneIndex,
      bountyIndex
    });
    const pledged = (parseFloat(project.pledged || 0) || 0) + pledgeAmount;
    const goalProgress = project.goal ? (pledged / parseFloat(project.goal)) * 100 : 0;
    await projectsModel.updateProject(latestId, { backers, pledged, progress: goalProgress });
    const subject = 'PROJECT_PLEDGE';
    const title = project.title || '';
    const text = `has pledged ${pledgeAmount} ECO to your project "${title}" -> /projects/${latestId}`;
    await pmModel.sendMessage([project.author], subject, text);
    ctx.redirect(`/projects/${encodeURIComponent(latestId)}`);
  })
  .post('/projects/confirm-transfer/:id', koaBody(), async (ctx) => {
    const transferId = ctx.params.id;
    const userId = SSBconfig.config.keys.id;
    const transfer = await transfersModel.getTransferById(transferId);
    if (transfer.to !== userId) ctx.throw(403, 'Unauthorized action');
    const tagProject = (transfer.tags || []).find(t => String(t).startsWith('project:'));
    if (!tagProject) ctx.throw(400, 'Missing project tag on transfer');
    const projectId = tagProject.split(':')[1];
    await transfersModel.confirmTransferById(transferId);
    const project = await projectsModel.getProjectById(projectId);
    const backers = Array.isArray(project.backers) ? project.backers.slice() : [];
    const idx = backers.findIndex(b => b.transferId === transferId);
    if (idx !== -1) backers[idx].confirmed = true;
    const goalProgress = project.goal ? (parseFloat(project.pledged || 0) / parseFloat(project.goal)) * 100 : 0;
    await projectsModel.updateProject(projectId, { backers, progress: goalProgress });
    ctx.redirect(`/projects/${encodeURIComponent(projectId)}`);
  })
  .post('/projects/follow/:id', koaBody(), async (ctx) => {
    const userId = SSBconfig.config.keys.id;
    const rawId = ctx.params.id;
    const latestId = await projectsModel.getProjectTipId(rawId);
    const project = await projectsModel.getProjectById(latestId);
    await projectsModel.followProject(rawId, userId);
    const subject = 'PROJECT_FOLLOWED';
    const title = project.title || '';
    const text = `has followed your project "${title}" -> /projects/${latestId}`;
    await pmModel.sendMessage([project.author], subject, text);
    ctx.redirect('/projects');
  })
  .post('/projects/unfollow/:id', koaBody(), async (ctx) => {
    const userId = SSBconfig.config.keys.id;
    const rawId = ctx.params.id;
    const latestId = await projectsModel.getProjectTipId(rawId);
    const project = await projectsModel.getProjectById(latestId);
    await projectsModel.unfollowProject(rawId, userId);
    const subject = 'PROJECT_UNFOLLOWED';
    const title = project.title || '';
    const text = `has unfollowed your project "${title}" -> /projects/${latestId}`;
    await pmModel.sendMessage([project.author], subject, text);
    ctx.redirect('/projects');
  })
  .post('/projects/milestones/add/:id', koaBody(), async (ctx) => {
    const { title, description, targetPercent, dueDate } = ctx.request.body;
    await projectsModel.addMilestone(ctx.params.id, {
        title,
        description: description || '',
        targetPercent: targetPercent != null && targetPercent !== '' ? parseInt(targetPercent, 10) : 0,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null
    });
    ctx.redirect(`/projects/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/projects/milestones/update/:id/:index', koaBody(), async (ctx) => {
    const { title, description, targetPercent, dueDate, done } = ctx.request.body;
    await projectsModel.updateMilestone(
        ctx.params.id,
        parseInt(ctx.params.index, 10),
        {
            title,
            ...(description !== undefined ? { description } : {}),
            targetPercent: targetPercent !== undefined && targetPercent !== '' ? parseInt(targetPercent, 10) : undefined,
             dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate).toISOString() : null) : undefined,
             done: done !== undefined ? !!done : undefined
        }
    );
    ctx.redirect(`/projects/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/projects/milestones/complete/:id/:index', koaBody(), async (ctx) => {
    const userId = SSBconfig.config.keys.id;
    await projectsModel.completeMilestone(ctx.params.id, parseInt(ctx.params.index, 10), userId);
    ctx.redirect(`/projects/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/projects/bounties/add/:id', koaBody(), async (ctx) => {
    const { title, amount, description, milestoneIndex } = ctx.request.body;
    await projectsModel.addBounty(ctx.params.id, {
        title,
        amount,
        description,
        milestoneIndex: (milestoneIndex === '' || milestoneIndex === undefined) ? null : parseInt(milestoneIndex, 10)
    });
    ctx.redirect(`/projects/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/projects/bounties/update/:id/:index', koaBody(), async (ctx) => {
     const { title, amount, description, milestoneIndex, done } = ctx.request.body;
     await projectsModel.updateBounty(
       ctx.params.id,
       parseInt(ctx.params.index, 10),
       {
         title: title !== undefined ? title : undefined,
         amount: amount !== undefined && amount !== '' ? parseFloat(amount) : undefined,
         description: description !== undefined ? description : undefined,
         milestoneIndex: milestoneIndex !== undefined ? (milestoneIndex === '' ? null : parseInt(milestoneIndex, 10)) : undefined,
         done: done !== undefined ? !!done : undefined
       }
     );
     ctx.redirect(`/projects/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/projects/bounties/claim/:id/:index', koaBody(), async (ctx) => {
    const userId = SSBconfig.config.keys.id;
    await projectsModel.claimBounty(ctx.params.id, parseInt(ctx.params.index, 10), userId);
    ctx.redirect(`/projects/${encodeURIComponent(ctx.params.id)}`); 
  })
  .post('/projects/bounties/complete/:id/:index', koaBody(), async (ctx) => {
    const userId = SSBconfig.config.keys.id;
    await projectsModel.completeBounty(ctx.params.id, parseInt(ctx.params.index, 10), userId);
    ctx.redirect(`/projects/${encodeURIComponent(ctx.params.id)}`);
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
    'feed', 'pixelia', 'agenda', 'ai', 'forum', 'jobs', 'projects', 'banking', 'parliament'
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
  .post('/transfers/create',
    koaBody(),
    async ctx => {
      const { to, concept, amount, deadline, tags } = ctx.request.body
      await transfersModel.createTransfer(to, concept, amount, deadline, tags)
      ctx.redirect('/transfers')
  })
  .post('/transfers/update/:id',
    koaBody(),
    async ctx => {
      const { to, concept, amount, deadline, tags } = ctx.request.body
      await transfersModel.updateTransferById(
        ctx.params.id, to, concept, amount, deadline, tags
      )
      ctx.redirect('/transfers?filter=mine')
  })
  .post('/transfers/confirm/:id', async ctx => {
    await transfersModel.confirmTransferById(ctx.params.id)
    ctx.redirect('/transfers')
  })
  .post('/transfers/delete/:id', async ctx => {
    await transfersModel.deleteTransferById(ctx.params.id)
    ctx.redirect('/transfers?filter=mine')
  })
  .post('/transfers/opinions/:transferId/:category', async ctx => {
    const { transferId, category } = ctx.params
    const voterId = SSBconfig?.keys?.id;
    const t = await transfersModel.getTransferById(transferId)
    if (t.opinions_inhabitants.includes(voterId)) {
      ctx.flash = { message: 'You have already opined.' }
      ctx.redirect('/transfers')
      return
    }
    await opinionsModel.createVote(transferId, category, 'transfer')
    ctx.redirect('/transfers')
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
