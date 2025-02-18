#!/usr/bin/env node

"use strict";

const path = require("path");
const envPaths = require("../server/node_modules/env-paths");
const {cli} = require("../client/oasis_client");
const fs = require("fs");
const os = require('os');
const promisesFs = require("fs").promises;

const supports = require("./supports.js").supporting;
const blocks = require("./supports.js").blocking;
const recommends = require("./supports.js").recommending;

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
const { nav, ul, li, a } = require("../server/node_modules/hyperaxe");
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

const models = require("../models/main_models");
const cooler = ssb({ offline: config.offline });

const { about, blob, friend, meta, post, vote, wallet, legacy, cipher} = models({
  cooler,
  isPublic: config.public,
});

const nameWarmup = about._startNameWarmup();
const preparePreview = async function (ctx) {
  let text = String(ctx.request.body.text);
  const mentions = {};
  const rex = /(^|\s)(?!\[)@([a-zA-Z0-9-]+)([\s.,!?)~]{1}|$)/g;
  let m;
  while ((m = rex.exec(text)) !== null) {
    const name = m[2];
    let matches = about.named(name);
    for (const feed of matches) {
      let found = mentions[name] || [];
      found.push(feed);
      mentions[name] = found;
    }
  }
  Object.keys(mentions).forEach((name) => {
    let matches = mentions[name];
    const meaningfulMatches = matches.filter((m) => {
      return (m.rel.followsMe || m.rel.following) && m.rel.blocking === false;
    });
    if (meaningfulMatches.length > 0) {
      matches = meaningfulMatches;
    }
    mentions[name] = matches;
  });
  const replacer = (match, name, sign) => {
    let matches = mentions[name];
    if (matches && matches.length === 1) {
      return `[@${matches[0].name}](${matches[0].feed})${sign || ""}`;
    }
    return match;
  };
  text = text.replace(rex, replacer);
  text += await handleBlobUpload(ctx);

  const ssb = await cooler.open();
  const authorMeta = {
    id: ssb.id,
    name: await about.name(ssb.id),
    image: await about.image(ssb.id),
  };

  return { authorMeta, text, mentions };
};

const handleBlobUpload = async function (ctx) {
  if (!ctx.request.files) return "";

  const ssb = await cooler.open();
  const blobUpload = ctx.request.files.blob;
  if (typeof blobUpload === "undefined") {
    return "";
  }

  let data = await promisesFs.readFile(blobUpload.filepath);
  if (data.length == 0) {
    return "";
  }

  // 25 MiB check
  const megabyte = Math.pow(2, 20);
  const maxSize = 25 * megabyte;
  if (data.length > maxSize) {
    throw new Error("File is too big, maximum size is 25 megabytes");
  }

  try {
    const removeExif = (fileData) => {
      const exifOrientation = load(fileData);
      const orientation = exifOrientation["0th"][ImageIFD.Orientation];
      const clean = remove(fileData);
      if (orientation !== undefined) {
        // preserve img orientation
        const exifData = { "0th": {} };
        exifData["0th"][ImageIFD.Orientation] = orientation;
        const exifStr = dump(exifData);
        return insert(exifStr, clean);
      } else {
        return clean;
      }
    };
    const dataString = data.toString("binary");
    data = Buffer.from(removeExif(dataString), "binary");
  } catch (e) {
  }

  const addBlob = new Promise((resolve, reject) => {
    pull(
      pull.values([data]),
      ssb.blobs.add((err, hashedBlobRef) => {
        if (err) return reject(err);
        resolve(hashedBlobRef);
      })
    );
  });
  let blob = {
    id: await addBlob,
    name: blobUpload.name,
  };

  const FileType = require("../server/node_modules/file-type");
  try {
    let fileType = await FileType.fromBuffer(data);
    blob.mime = fileType.mime;
  } catch (error) {
    console.warn(error);
    blob.mime = "application/octet-stream";
  }

  if (blob.mime.startsWith("image/")) {
    return `\n![${blob.name}](${blob.id})`;
  } else if (blob.mime.startsWith("audio/")) {
    return `\n![audio:${blob.name}](${blob.id})`;
  } else if (blob.mime.startsWith("video/")) {
    return `\n![video:${blob.name}](${blob.id})`;
  } else {
    return `\n[${blob.name}](${blob.id})`;
  }
};

const resolveCommentComponents = async function (ctx) {
  const { message } = ctx.params;
  const parentId = message;
  const parentMessage = await post.get(parentId);
  const myFeedId = await meta.myFeedId();

  const hasRoot =
    typeof parentMessage.value.content.root === "string" &&
    ssbRef.isMsg(parentMessage.value.content.root);
  const hasFork =
    typeof parentMessage.value.content.fork === "string" &&
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
    const rawContentWarning = String(ctx.request.body.contentWarning).trim();
    contentWarning =
      rawContentWarning.length > 0 ? rawContentWarning : undefined;
  }
  return { messages, myFeedId, parentMessage, contentWarning };
};

const {
  authorView,
  previewCommentView,
  commentView,
  editProfileView,
  indexingView,
  extendedView,
  latestView,
  likesView,
  threadView,
  hashtagView,
  mentionsView,
  popularView,
  previewView,
  privateView,
  publishCustomView,
  publishView,
  previewSubtopicView,
  subtopicView,
  searchView,
  imageSearchView,
  setLanguage,
  settingsView,
  modulesView,
  peersView,
  invitesView,
  topicsView,
  summaryView,
  threadsView,
  walletView,
  walletErrorView,
  walletHistoryView,
  walletReceiveView,
  walletSendFormView,
  walletSendConfirmView,
  walletSendResultView,
  legacyView,
  cipherView
} = require("../views/main_views");

const ssbRef = require("../server/node_modules/ssb-ref");
const markdownView = require("../views/markdown");

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
    ctx.redirect("/mentions");
  })
  .get("/robots.txt", (ctx) => {
    ctx.body = "User-agent: *\nDisallow: /";
  })
  .get(oasisCheckPath, (ctx) => {
    ctx.body = "oasis";
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
      ul(
        a({ href: "./day" }, translations.day),
        a({ href: "./week" }, translations.week),
        a({ href: "./month" }, translations.month),
        a({ href: "./year" }, translations.year)
      )
    );
    return popularView({
      messages,
      prefix,
    });
  }
  ctx.body = await publicPopular({ period });
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

      const avatarUrl = `/image/256/${encodeURIComponent(image)}`;

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
    let { query } = ctx.query;

    if (isMsg(query)) {
      return ctx.redirect(`/thread/${encodeURIComponent(query)}`);
    }
    if (isFeed(query)) {
      return ctx.redirect(`/author/${encodeURIComponent(query)}`);
    }
    if (isBlob(query)) {
      return ctx.redirect(`/blob/${encodeURIComponent(query)}`);
    }
    if (typeof query === "string") {
      query = query.toLowerCase();
      if (query.length > 1 && query.startsWith("#")) {
        const hashtag = query.slice(1);
        return ctx.redirect(`/hashtag/${encodeURIComponent(hashtag)}`);
      }
    }
    const messages = await post.search({ query });
    ctx.body = await searchView({ messages, query });
  })
  .get("/imageSearch", async (ctx) => {
    const { query } = ctx.query;
    const blobs = query ? await blob.search({ query }) : {};

    ctx.body = await imageSearchView({ blobs, query });
  })
  .get("/inbox", async (ctx) => {
    const theme = ctx.cookies.get("theme") || config.theme;
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
  .get("/hashtag/:hashtag", async (ctx) => {
    const { hashtag } = ctx.params;
    const messages = await post.fromHashtag(hashtag);
    ctx.body = await hashtagView({ hashtag, messages });
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

    const avatarUrl = `/image/256/${encodeURIComponent(image)}`;

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
    const buffer = await blob.getResolved({ blobId });
    ctx.body = buffer;

    if (ctx.body.length === 0) {
      ctx.response.status = 404;
    } else {
      ctx.set("Cache-Control", "public,max-age=31536000,immutable");
    }

    // This prevents an auto-download when visiting the URL.
    ctx.attachment(blobId, { type: "inline" });

    if (isSvg(buffer)) {
      ctx.type = "image/svg+xml";
    }
  })
  .get("/image/:imageSize/:blobId", async (ctx) => {
    const { blobId, imageSize } = ctx.params;
    if (sharp) {
      ctx.type = "image/png";
    }

    const fakePixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );

    const fakeImage = (imageSize) =>
      sharp
        ? sharp({
            create: {
              width: imageSize,
              height: imageSize,
              channels: 4,
              background: {
                r: 0,
                g: 0,
                b: 0,
                alpha: 0.5,
              },
            },
          })
            .png()
            .toBuffer()
        : new Promise((resolve) => resolve(fakePixel));

    const image = async ({ blobId, imageSize }) => {
      const bufferSource = await blob.get({ blobId });
      const fakeId = "&0000000000000000000000000000000000000000000=.sha256";

      debug("got buffer source");
      return new Promise((resolve) => {
        if (blobId === fakeId) {
          debug("fake image");
          fakeImage(imageSize).then((result) => resolve(result));
        } else {
          debug("not fake image");
          pull(
            bufferSource,
            pull.collect(async (err, bufferArray) => {
              if (err) {
                await blob.want({ blobId });
                const result = fakeImage(imageSize);
                debug({ result });
                resolve(result);
              } else {
                const buffer = Buffer.concat(bufferArray);

                if (sharp) {
                  sharp(buffer)
                    .resize(imageSize, imageSize)
                    .png()
                    .toBuffer()
                    .then((data) => {
                      resolve(data);
                    });
                } else {
                  resolve(buffer);
                }
              }
            })
          );
        }
      });
    };
    ctx.body = await image({ blobId, imageSize: Number(imageSize) });
  })
  .get("/modules", async (ctx) => {
    const configMods = getConfig().modules;
    const popularMod = ctx.cookies.get('popularMod', { signed: false }) || configMods.popularMod;
    const topicsMod = ctx.cookies.get('topicsMod', { signed: false }) || configMods.topicsMod;
    const summariesMod = ctx.cookies.get('summariesMod', { signed: false }) || configMods.summariesMod;
    const latestMod = ctx.cookies.get('latestMod', { signed: false }) || configMods.latestMod;
    const threadsMod = ctx.cookies.get('threadsMod', { signed: false }) || configMods.threadsMod;
    const multiverseMod = ctx.cookies.get('multiverseMod', { signed: false }) || configMods.multiverseMod;
    const inboxMod = ctx.cookies.get('inboxMod', { signed: false }) || configMods.inboxMod;
    const invitesMod = ctx.cookies.get('invitesMod', { signed: false }) || configMods.invitesMod;
    const walletMod = ctx.cookies.get('walletMod', { signed: false }) || configMods.walletMod;
    const legacyMod = ctx.cookies.get('legacyMod', { signed: false }) || configMods.legacyMod;
    const cipherMod = ctx.cookies.get('cipherMod', { signed: false }) || configMods.cipherMod;
    ctx.body = modulesView({ popularMod, topicsMod, summariesMod, latestMod, threadsMod, multiverseMod, inboxMod, invitesMod, walletMod, legacyMod, cipherMod });
  })
  .get("/settings", async (ctx) => {
    const theme = ctx.cookies.get("theme") || "Dark-SNH";
    const getMeta = async ({ theme }) => {
      return settingsView({
        theme,
        version: version.toString(),
      });
    };
    ctx.body = await getMeta({ theme });
  })
  .get("/peers", async (ctx) => {
    const theme = ctx.cookies.get("theme") || config.theme;
    const getMeta = async ({ theme }) => {
      const peers = await meta.connectedPeers();
      const peersWithNames = await Promise.all(
        peers.map(async ([key, value]) => {
          value.name = await about.name(value.key);
          return [key, value];
        })
      );
      return peersView({
        peers: peersWithNames,
        supports: supports,
        blocks: blocks,
        recommends: recommends,
      });
    };
    ctx.body = await getMeta({ theme });
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
    const mentions = async () => {
      const messages = await post.mentionsMe();
      return mentionsView({ messages }); 
    };
    ctx.body = await mentions();
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
      const balance = await wallet.getBalance(url, user, pass);
      ctx.body = await walletView(balance);
    } catch (error) {
      ctx.body = await walletErrorView(error);
    }
  })
  .get("/wallet/history", async (ctx) => {
    const { url, user, pass } = getConfig().wallet;
    try {
      const balance = await wallet.getBalance(url, user, pass);
      const transactions = await wallet.listTransactions(url, user, pass);
      ctx.body = await walletHistoryView(balance, transactions);
    } catch (error) {
      ctx.body = await walletErrorView(error);
    }
  })
  .get("/wallet/receive", async (ctx) => {
    const { url, user, pass } = getConfig().wallet;
    try {
      const balance = await wallet.getBalance(url, user, pass);
      const address = await wallet.getAddress(url, user, pass);
      ctx.body = await walletReceiveView(balance, address);
    } catch (error) {
      ctx.body = await walletErrorView(error);
    }
  })
  .get("/wallet/send", async (ctx) => {
    const { url, user, pass, fee } = getConfig().wallet;
    try {
      const balance = await wallet.getBalance(url, user, pass);
      ctx.body = await walletSendFormView(balance, null, null, fee, null);
    } catch (error) {
      ctx.body = await walletErrorView(error);
    }
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
      // TODO: rename `message` to `parent` or `ancestor` or similar
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
  .post("/comment/preview/:message",
    koaBody({ multipart: true }),
    async (ctx) => {
      const { messages, contentWarning, myFeedId, parentMessage } =
        await resolveCommentComponents(ctx);

      const previewData = await preparePreview(ctx);

      ctx.body = await previewCommentView({
        messages,
        myFeedId,
        contentWarning,
        parentMessage,
        previewData,
      });
    }
  )
  .post("/comment/:message", koaBody(), async (ctx) => {
    const { message } = ctx.params;
    const text = String(ctx.request.body.text);

    const rawContentWarning = String(ctx.request.body.contentWarning);
    const contentWarning =
      rawContentWarning.length > 0 ? rawContentWarning : undefined;

    const publishComment = async ({ message, text }) => {
      const mentions = extractMentions(text);
      const parent = await meta.get(message);

      return post.comment({
        parent,
        message: { text, mentions, contentWarning },
      });
    };
    ctx.body = await publishComment({ message, text });
    ctx.redirect(`/thread/${encodeURIComponent(message)}`);
  })
  .post("/publish/preview", koaBody({ multipart: true }), async (ctx) => {
    const rawContentWarning = String(ctx.request.body.contentWarning).trim();
    const contentWarning =
      rawContentWarning.length > 0 ? rawContentWarning : undefined;

    const previewData = await preparePreview(ctx);
    ctx.body = await previewView({ previewData, contentWarning });
  })
  .post("/publish", koaBody(), async (ctx) => {
    const text = String(ctx.request.body.text);
    const rawContentWarning = String(ctx.request.body.contentWarning);
    const contentWarning =
    rawContentWarning.length > 0 ? rawContentWarning : undefined;

    const publish = async ({ text, contentWarning }) => {
      const mentions = await extractMentions(text); 
      return post.root({
        text,
        mentions,
        contentWarning,
      });
    };
    ctx.body = await publish({ text, contentWarning });
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
    // TODO: convert all so `message` is full message and `messageKey` is key
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
      const encryptedFilePath = await legacy.exportData({ password });
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
      await legacy.importData({ filePath: uploadedFile.filepath, password });
      ctx.body = { message: 'Data imported successfully!' };
      ctx.redirect('/legacy');
    } catch (error) {
      ctx.body = { error: error.message };
      ctx.redirect('/legacy');
    }
  })
  .post('/cipher/encrypt', koaBody(), async (ctx) => {
    const { text, password } = ctx.request.body;
    if (!text || !password) {
      ctx.body = { error: 'Text or password not provided.' };
      ctx.redirect('/cipher');
      return;
    }
    if (password.length < 32) {
      ctx.body = { error: 'Password is too short or missing.' };
      ctx.redirect('/cipher');
      return;
    }
    try {
      const { encryptedText, iv } = cipher.encryptData(text, password);
      const view = await cipherView(encryptedText, "", iv, password); 
      ctx.body = view;
    } catch (error) {
      ctx.body = { error: error.message };
      ctx.redirect('/cipher');
    }
  })
  .post('/cipher/decrypt', koaBody(), async (ctx) => {
    const { encryptedText, password, iv } = ctx.request.body;
    if (!encryptedText || !password || !iv) {
      ctx.body = { error: 'Text, password, or iv not provided.' };
      ctx.redirect('/cipher');
      return;
    }
    if (password.length < 32) {
      ctx.body = { error: 'Password is too short or missing.' };
      ctx.redirect('/cipher');
      return;
    }
    try {
      const decryptedText = cipher.decryptData(encryptedText, password, iv);
      const view = await cipherView("", decryptedText, iv, password);
      ctx.body = view;
    } catch (error) {
      ctx.body = { error: error.message };
      ctx.redirect('/cipher');
    }
  })
  .post("/update", koaBody(), async (ctx) => {
    const util = require("node:util");
    const exec = util.promisify(require("node:child_process").exec);
    async function updateTool() {
      const { stdout, stderr } = await exec("git reset --hard && git pull && npm install .");
      console.log("oasis@version: updating Oasis...");
      console.log(stdout);
      console.log(stderr);
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
    const popularMod = ctx.request.body.popularForm === 'on' ? 'on' : 'off';
    const topicsMod = ctx.request.body.topicsForm === 'on' ? 'on' : 'off';
    const summariesMod = ctx.request.body.summariesForm === 'on' ? 'on' : 'off';
    const latestMod = ctx.request.body.latestForm === 'on' ? 'on' : 'off';
    const threadsMod = ctx.request.body.threadsForm === 'on' ? 'on' : 'off';
    const multiverseMod = ctx.request.body.multiverseForm === 'on' ? 'on' : 'off';
    const inboxMod = ctx.request.body.inboxForm === 'on' ? 'on' : 'off';
    const invitesMod = ctx.request.body.invitesForm === 'on' ? 'on' : 'off';
    const walletMod = ctx.request.body.walletForm === 'on' ? 'on' : 'off';
    const legacyMod = ctx.request.body.legacyForm === 'on' ? 'on' : 'off';
    const cipherMod = ctx.request.body.cipherForm === 'on' ? 'on' : 'off';
    ctx.cookies.set("popularMod", popularMod, { httpOnly: true, maxAge: 86400000, path: '/' });
    ctx.cookies.set("topicsMod", topicsMod, { httpOnly: true, maxAge: 86400000, path: '/' });
    ctx.cookies.set("summariesMod", summariesMod, { httpOnly: true, maxAge: 86400000, path: '/' });
    ctx.cookies.set("latestMod", latestMod, { httpOnly: true, maxAge: 86400000, path: '/' });
    ctx.cookies.set("threadsMod", threadsMod, { httpOnly: true, maxAge: 86400000, path: '/' });
    ctx.cookies.set("multiverseMod", multiverseMod, { httpOnly: true, maxAge: 86400000, path: '/' });
    ctx.cookies.set("inboxMod", inboxMod, { httpOnly: true, maxAge: 86400000, path: '/' });
    ctx.cookies.set("invitesMod", invitesMod, { httpOnly: true, maxAge: 86400000, path: '/' });
    ctx.cookies.set("walletMod", walletMod, { httpOnly: true, maxAge: 86400000, path: '/' });
    ctx.cookies.set("legacyMod", legacyMod, { httpOnly: true, maxAge: 86400000, path: '/' });
    ctx.cookies.set("cipherMod", cipherMod, { httpOnly: true, maxAge: 86400000, path: '/' });
    const currentConfig = getConfig();
    currentConfig.modules.popularMod = popularMod;
    currentConfig.modules.topicsMod = topicsMod;
    currentConfig.modules.summariesMod = summariesMod;
    currentConfig.modules.latestMod = latestMod;
    currentConfig.modules.threadsMod = threadsMod;
    currentConfig.modules.multiverseMod = multiverseMod;
    currentConfig.modules.inboxMod = inboxMod;
    currentConfig.modules.invitesMod = invitesMod;
    currentConfig.modules.walletMod = walletMod;
    currentConfig.modules.legacyMod = legacyMod;
    currentConfig.modules.cipherMod = cipherMod;
    saveConfig(currentConfig);
    ctx.redirect(`/modules`);
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
      balance = await wallet.getBalance(url, user, pass);
    } catch (error) {
      ctx.body = await walletErrorView(error);
    }

    switch (action) {
      case 'confirm':
        const validation = await wallet.validateSend(url, user, pass, destination, amount, fee);
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
          const txId = await wallet.sendToAddress(url, user, pass, destination, amount);
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
    // Optionally log the error for debugging
    console.error(err);
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
