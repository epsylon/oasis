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
const { spawn } = require('child_process');
function startAI() {
  const aiPath = path.resolve(__dirname, '../AI/ai_service.mjs');
  const aiProcess = spawn('node', [aiPath], {
    detached: false,
    stdio: 'ignore', //inherit for debug
  });
  aiProcess.unref();
}

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
const pmModel = require('../models/privatemessages_model')({ cooler, isPublic: config.public });
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
    ctx.redirect("/activity"); // default view when starting Oasis
  })
  .get("/robots.txt", (ctx) => {
    ctx.body = "User-agent: *\nDisallow: /";
  })
  .get(oasisCheckPath, (ctx) => {
    ctx.body = "oasis";
  })
  .get('/stats', async ctx => {
    const filter = ctx.query.filter || 'ALL';
    const stats = await statsModel.getStats(filter);
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
    'events', 'tasks', 'market', 'tribes', 'governance', 'reports', 'opinions', 'transfers', 
    'feed', 'pixelia', 'agenda', 'ai'
    ];
    const moduleStates = modules.reduce((acc, mod) => {
      acc[`${mod}Mod`] = configMods[`${mod}Mod`];
      return acc;
    }, {});
    ctx.body = modulesView(moduleStates);
  })
   // AI
  .get('/ai', async (ctx) => {
    const aiMod = ctx.cookies.get("aiMod") || 'on';
    if (aiMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    startAI();
    const historyPath = path.join(__dirname, '..', '..', 'src', 'configs', 'AI-history.json');
    let chatHistory = [];
    try {
      const fileData = fs.readFileSync(historyPath, 'utf-8');
      chatHistory = JSON.parse(fileData);
    } catch (e) {
      chatHistory = [];
    }
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
  .get("/author/:feed", async (ctx) => {
    const { feed } = ctx.params;
    const gt = Number(ctx.request.query["gt"] || -1);
    const lt = Number(ctx.request.query["lt"] || -1);
    if (lt > 0 && gt > 0 && gt >= lt)
      throw new Error("Given search range is empty");
    const author = async (feedId) => {
      const description = await about.description(feedId);
      const name = await about.name(feedId);
      const image = await about.image(feedId);
      const messages = await post.fromPublicFeed(feedId, gt, lt);
      const firstPost = await post.firstBy(feedId);
      const lastPost = await post.latestBy(feedId);
      const relationship = await friend.getRelationship(feedId);
      const avatarUrl = getAvatarUrl(image);
      return authorView({
        feedId,
        messages,
        firstPost,
        lastPost,
        name,
        description,
        avatarUrl,
        relationship,
      });
    };
    ctx.body = await author(feed);
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
  .get('/images/edit/:id', async (ctx) => {
    const imagesMod = ctx.cookies.get("imagesMod") || 'on';
    if (imagesMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const filter = 'edit';
    const img = await imagesModel.getImageById(ctx.params.id, false);
    ctx.body = await imageView([img], filter, ctx.params.id);
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
    ctx.body = await pmView();
  })
  .get("/inbox", async (ctx) => {
    const inboxMod = ctx.cookies.get("inboxMod") || 'on';
    if (inboxMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    const inboxMessages = async () => {
      const messages = await post.inbox();
      return privateView({ messages });
    };
    ctx.body = await inboxMessages();
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
    const inhabitants = await inhabitantsModel.listInhabitants({
      filter,
      ...query
    });

    ctx.body = await inhabitantsView(inhabitants, filter, query);
  })
  .get('/inhabitant/:id', async (ctx) => {
    const id = ctx.params.id;
    const about = await inhabitantsModel._getLatestAboutById(id);
    const cv = await inhabitantsModel.getCVByUserId(id);
    const feed = await inhabitantsModel.getFeedByUserId(id);
    ctx.body = await inhabitantsProfileView({ about, cv, feed });
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
    const actions = await activityModel.listFeed(filter);
    ctx.body = activityView(actions, filter);
  })
  .get("/profile", async (ctx) => {
    const myFeedId = await meta.myFeedId();
    const gt = Number(ctx.request.query["gt"] || -1);
    const lt = Number(ctx.request.query["lt"] || -1);
    if (lt > 0 && gt > 0 && gt >= lt)
      throw new Error("Given search range is empty");
    const description = await about.description(myFeedId);
    const name = await about.name(myFeedId);
    const image = await about.image(myFeedId);
    const messages = await post.fromPublicFeed(myFeedId, gt, lt);
    const firstPost = await post.firstBy(myFeedId);
    const lastPost = await post.latestBy(myFeedId);
    const avatarUrl = getAvatarUrl(image);
    ctx.body = await authorView({
      feedId: myFeedId,
      messages,
      firstPost,
      lastPost,
      name,
      description,
      avatarUrl,
      relationship: { me: true },
    });
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
    const getMeta = async ({ theme, aiPrompt }) => {
      return settingsView({
        theme,
        version: version.toString(),
        aiPrompt
      });
    };
    ctx.body = await getMeta({ theme, aiPrompt });
  })
  .get("/peers", async (ctx) => {
    const theme = ctx.cookies.get("theme") || config.theme;
    const getMeta = async () => {
      const allPeers = await meta.peers();
      const connected = allPeers.filter(([, data]) => data.state === "connected");
      const offline = allPeers.filter(([, data]) => data.state !== "connected");
      const enrich = async (peers) => {
        return await Promise.all(
          peers.map(async ([address, data]) => {
            const feedId = data.key || data.id;
            const name = await about.name(feedId);
            return [
              address,
              {
                ...data,
                key: feedId,
                name: name || feedId,
              },
            ];
          })
        );
      };
      const connectedPeers = await enrich(connected);
      const offlinePeers = await enrich(offline);
      return peersView({
        connectedPeers,
        peers: offlinePeers,
      });
    };
    ctx.body = await getMeta();
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
   .get('/votes/:voteId', async ctx => {
     const voteId = ctx.params.voteId;
     const vote = await votesModel.getVoteById(voteId);
     ctx.body = await voteView(vote);
   })
  .get('/votes/edit/:id', async ctx => {
      const id = ctx.params.id;
      const vote = await votesModel.getVoteById(id);
      ctx.body = await voteView([vote], 'edit', id);
   })
  .get('/market', async ctx => {
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
    if (walletMod !== 'on') {
      ctx.redirect('/modules');
      return;
    }
    try {
      const balance = await walletModel.getBalance(url, user, pass);
      const address = await walletModel.getAddress(url, user, pass);
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
    const axios = require('../server/node_modules/axios').default;
    const { input } = ctx.request.body;
    if (!input) {
      ctx.status = 400;
      ctx.body = { error: 'No input provided' };
      return;
    }
    const config = getConfig();
    const userPrompt = config.ai?.prompt?.trim() || "Provide an informative and precise response.";
    const response = await axios.post('http://localhost:4001/ai', { input });
    const aiResponse = response.data.answer;
    const historyPath = path.join(__dirname, '..', '..', 'src', 'configs', 'AI-history.json');
    let chatHistory = [];
    try {
      const fileData = fs.readFileSync(historyPath, 'utf-8');
      chatHistory = JSON.parse(fileData);
    } catch (e) {
      chatHistory = [];
    }
    chatHistory.unshift({
      prompt: userPrompt,
      question: input,
      answer: aiResponse,
      timestamp: Date.now()
    });
    chatHistory = chatHistory.slice(0, 20);
    fs.writeFileSync(historyPath, JSON.stringify(chatHistory, null, 2), 'utf-8');
    ctx.body = aiView(chatHistory, userPrompt);
  })
  .post('/ai/clear', async (ctx) => {
    const fs = require('fs');
    const path = require('path');
    const { getConfig } = require('../configs/config-manager.js');
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
    const recipientsArr = recipients.split(',').map(s => s.trim()).filter(Boolean);
    await pmModel.sendMessage(recipientsArr, subject, text);
    ctx.redirect('/pm');
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
    const task = await tasksModel.getTaskById(taskId);
    await tasksModel.updateTaskById(taskId, {
      title,
      description,
      startTime,
      endTime,
      priority,
      location,
      tags,
      isPublic,
      createdAt: task.createdAt,
      author: task.author
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
    const { question, deadline, options = 'YES,NO,ABSTENTION', tags = '' } = ctx.request.body;
    const parsedOptions = options.split(',').map(o => o.trim()).filter(Boolean);
    const parsedTags = tags.split(',').map(t => t.trim()).filter(Boolean);
    await votesModel.createVote(question, deadline, parsedOptions, parsedTags);
    ctx.redirect('/votes');
    })
  .post('/votes/update/:id', koaBody(), async ctx => {
    const id = ctx.params.id;
    const { question, deadline, options = 'YES,NO,ABSTENTION', tags = '' } = ctx.request.body;
    const parsedOptions = options.split(',').map(o => o.trim()).filter(Boolean);
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
    await opinionsModel.createVote(voteId, category, 'votes');
    ctx.redirect('/votes');
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
        const buyerId = ctx.request.body.buyerId;
        const { price, title, seller } = marketItem;
        const subject = `Your item "${title}" has been sold`;
        const text = `The item with title: "${title}" has been sold. The buyer with OASIS ID: ${buyerId} purchased it for: $${price}.`;
        await pmModel.sendMessage([seller], subject, text);
        await marketModel.setItemAsSold(id);
      }
    }
    await marketModel.decrementStock(id);
    ctx.redirect('/inbox?filter=sent');
  })
  .post('/market/bid/:id', koaBody(), async ctx => {
    const id = ctx.params.id;
    const { bidAmount } = ctx.request.body;
    const marketItem = await marketModel.getItemById(id);
    await marketModel.addBidToAuction(id, userId, bidAmount);
    if (marketItem.stock > 0 && marketItem.status === 'SOLD') {
      await marketModel.decrementStock(id);
    }
    ctx.redirect('/market?filter=auctions');
  })

  // UPDATE OASIS
  .post("/update", koaBody(), async (ctx) => {
    const util = require("node:util");
    const exec = util.promisify(require("node:child_process").exec);
    async function updateTool() {
      const { stdout, stderr } = await exec("git reset --hard && git pull && npm install .");
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
    const theme = String(ctx.request.body.theme);
    const currentConfig = getConfig();
    if (theme) {
        currentConfig.themes.current = theme;
        const configPath = path.join(__dirname, '../configs', 'oasis-config.json');
        fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2));
        ctx.cookies.set("theme", theme);
        ctx.redirect("/settings");
    } else {
        currentConfig.themes.current = "Dark-SNH";
        fs.writeFileSync(path.join(__dirname, 'configs', 'oasis-config.json'), JSON.stringify(currentConfig, null, 2));
        ctx.cookies.set("theme", "Dark-SNH");
        ctx.redirect("/settings");
     }
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
    try {
      const invite = String(ctx.request.body.invite);
      await meta.acceptInvite(invite);
    } catch (e) {
    }
    ctx.redirect("/invites");
  })
  .post("/settings/rebuild", async (ctx) => {
    meta.rebuild();
    ctx.redirect("/settings");
  })
  .post("/save-modules", koaBody(), async (ctx) => {
    const modules = [
    'popular', 'topics', 'summaries', 'latest', 'threads', 'multiverse', 'invites', 'wallet',
    'legacy', 'cipher', 'bookmarks', 'videos', 'docs', 'audios', 'tags', 'images', 'trending',
    'events', 'tasks', 'market', 'tribes', 'governance', 'reports', 'opinions', 'transfers',
    'feed', 'pixelia', 'agenda', 'ai'
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
    const referer = new URL(ctx.request.header.referer);
    ctx.redirect(referer.href);
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
