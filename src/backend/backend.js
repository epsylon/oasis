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
let fieldsForSnippet, buildContext, clip, publishExchange, publishExchangeVote, getBestTrainedAnswer;
try {
  ({ fieldsForSnippet, buildContext, clip, publishExchange, publishExchangeVote, getBestTrainedAnswer } = require('../AI/buildAIContext.js'));
} catch (e) {
  const noop = () => {};
  fieldsForSnippet = noop;
  buildContext = noop;
  clip = (t) => t;
  publishExchange = noop;
  publishExchangeVote = noop;
  getBestTrainedAnswer = () => null;
}
let aiStarted = false;
function startAI() {
  if (aiStarted) return;
  aiStarted = true;
  try {
    const aiProcess = spawn('node', [path.resolve(__dirname, '../AI/ai_service.mjs')], { detached: true, stdio: 'ignore' });
    aiProcess.unref();
  } catch (e) {}
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
  sweepInFlight = parliamentModel.sweepProposals().catch(e => console.error('sweepProposals failed:', e)).finally(() => { sweepInFlight = null; });
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

// anti-injections
const { stripDangerousTags, sanitizeHtml } = require('./sanitizeHtml');

const sharedState = require('../configs/shared-state');

module.exports = stripDangerousTags;

const sanitizeMsgText = (msg) => {
  if (!msg?.value?.content) return msg;
  const c = msg.value.content;
  if (typeof c.text === 'string') c.text = stripDangerousTags(c.text);
  if (typeof c.description === 'string') c.description = stripDangerousTags(c.description);
  if (typeof c.title === 'string') c.title = stripDangerousTags(c.title);
  if (typeof c.contentWarning === 'string') c.contentWarning = stripDangerousTags(c.contentWarning);
  return msg;
};
const sanitizeMessages = (msgs) => Array.isArray(msgs) ? msgs.map(sanitizeMsgText) : msgs;

const parseBool01 = v => String(Array.isArray(v) ? v[v.length - 1] : v || '') === '1';
const sendErrorPage = (ctx, message, { title, status } = {}) => {
  const { errorView } = require('../views/main_views');
  const ref = ctx.request.header.referer;
  let backHref = '/';
  try {
    if (ref) {
      const u = new URL(ref);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host === ctx.host) {
        backHref = u.pathname + u.search + u.hash;
      }
    }
  } catch (_) {}
  if (status) ctx.status = status;
  ctx.type = 'html';
  ctx.body = errorView({ title, message, backHref });
};

const safeRefererRedirect = (ctx, fallback = '/') => {
  const ref = ctx.request.header.referer;
  if (!ref) { ctx.redirect(fallback); return; }
  try {
    const u = new URL(ref);
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.host !== ctx.host) {
      ctx.redirect(fallback);
      return;
    }
    ctx.redirect(u.pathname + u.search + u.hash);
  } catch (_) {
    ctx.redirect(fallback);
  }
};
const isLoopbackRequest = (ctx) => {
  const raw = String((ctx.request && ctx.request.ip) || ctx.ip || (ctx.socket && ctx.socket.remoteAddress) || '');
  const ip = raw.replace(/^::ffff:/, '');
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
};
const checkMod = (ctx, mod) => {
  const cfg = getConfig();
  const serverValue = cfg.modules?.[mod];
  if (serverValue === 'off') return false;
  const cookieValue = ctx.cookies.get(mod);
  if (cookieValue) return cookieValue === 'on';
  return serverValue === 'on' || serverValue === undefined;
};
const getViewerId = () => SSBconfig?.config?.keys?.id || SSBconfig?.keys?.id;

const _carbonCache = new Map();
const CARBON_TTL_MS = 5 * 60 * 1000;
async function getCarbonGramsForFeed(feedId) {
  if (!feedId) return 0;
  const now = Date.now();
  const cached = _carbonCache.get(feedId);
  if (cached && (now - cached.ts) < CARBON_TTL_MS) return cached.grams;
  try {
    const pullMod = require("../server/node_modules/pull-stream");
    const ssbX = await cooler.open();
    const bytes = await new Promise((resolve) => {
      let total = 0;
      pullMod(
        ssbX.createUserStream({ id: feedId }),
        pullMod.drain(
          (m) => { try { total += Buffer.byteLength(JSON.stringify(m && m.value), 'utf8'); } catch (_) {} },
          () => resolve(total)
        )
      );
    });
    const grams = (bytes / (1024 * 1024)) * 0.095;
    _carbonCache.set(feedId, { ts: now, grams });
    return grams;
  } catch (_) {
    return 0;
  }
}

function synthesizeMelodyWav(sequence) {
  const sampleRate = 8000;
  const fadeMs = 1;
  const gapMs = 3;
  const speed = 3;
  const pilotMs = 80;
  const pilotFreq = 807;
  const pilotSamples = Math.floor(pilotMs * sampleRate / 1000);
  const fadeSamplesShort = Math.floor(fadeMs * sampleRate / 1000);

  let totalSamples = pilotSamples;
  for (const n of sequence) {
    totalSamples += Math.floor((((n.durMs || 250) / speed) + gapMs) * sampleRate / 1000);
  }
  const stegoMaxBytes = 2 + 2 + 4096;
  const minSamples = stegoMaxBytes * 8;
  if (totalSamples < minSamples) totalSamples = minSamples;
  const dataLen = totalSamples * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);

  let off = 44;
  const writeSquare = (freq, samples, fadeSamples) => {
    if (samples <= 0) return;
    const period = sampleRate / Math.max(1, freq);
    for (let i = 0; i < samples; i++) {
      let env = 0.45;
      if (fadeSamples > 0) {
        if (i < fadeSamples) env *= i / fadeSamples;
        else if (i > samples - fadeSamples) env *= (samples - i) / fadeSamples;
      }
      const phase = (i % period) / period;
      const s = (phase < 0.5 ? 1 : -1) * env;
      buf.writeInt16LE((s * 32767) | 0, off);
      off += 2;
    }
  };

  writeSquare(pilotFreq, pilotSamples, fadeSamplesShort);

  for (const n of sequence) {
    const freq = Number(n.freq) || 440;
    const noteSamples = Math.floor(((n.durMs || 250) / speed) * sampleRate / 1000);
    const gapSamples = Math.floor(gapMs * sampleRate / 1000);
    const fadeSamples = Math.min(noteSamples >> 3, fadeSamplesShort);
    writeSquare(freq, noteSamples, fadeSamples);
    for (let i = 0; i < gapSamples; i++) {
      buf.writeInt16LE(0, off);
      off += 2;
    }
  }
  return buf;
}

async function listAvailableBlockIds(ids) {
  const list = Array.isArray(ids) ? ids.filter(id => typeof id === 'string' && id.length > 0) : [];
  const out = new Set();
  if (list.length === 0) return out;
  try {
    const ssbClient2 = await cooler.open();
    await Promise.all(list.map(id => new Promise((resolve) => {
      try {
        ssbClient2.get(id, (err, msg) => {
          if (!err && msg) out.add(id);
          resolve();
        });
      } catch (_) { resolve(); }
    })));
  } catch (_) {}
  return out;
}

async function runTranscode(audio) {
  if (!audio || !audio.url) return null;
  try {
    const ssbClient2 = await cooler.open();
    const buf = await new Promise((resolve, reject) => {
      pull(
        ssbClient2.blobs.get(audio.url),
        pull.collect((err, chunks) => err ? reject(err) : resolve(Buffer.concat(chunks)))
      );
    });
    const raw = melodyModel.extractTextFromWav(buf);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          id: typeof parsed.id === 'string' ? parsed.id : null,
          ts: Number.isFinite(parsed.ts) ? Number(parsed.ts) : null,
          msg: typeof parsed.msg === 'string' ? parsed.msg : ''
        };
      }
      return { id: null, ts: null, msg: String(raw) };
    } catch (_) {
      return { id: null, ts: null, msg: String(raw) };
    }
  } catch (_) {
    return null;
  }
}

let _localLanIPv4 = null;
const getLocalLanIPv4 = () => {
  if (_localLanIPv4) return _localLanIPv4;
  try {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
      for (const info of (ifaces[name] || [])) {
        if (info && info.family === 'IPv4' && !info.internal) {
          _localLanIPv4 = info.address;
          return _localLanIPv4;
        }
      }
    }
  } catch (_) {}
  return null;
};
const resolveExternalBaseUrl = (ctx) => {
  const protocol = ctx.protocol || 'http';
  const rawHost = String(ctx.host || '').trim();
  const [hostname, port] = rawHost.split(':');
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (loopback) {
    const lan = getLocalLanIPv4();
    if (lan) return `${protocol}://${lan}${port ? ':' + port : ''}`;
  }
  return `${protocol}://${rawHost}`;
};
const getUserTribeIds = async (uid) => {
  const allTribes = await tribesModel.listAll().catch(() => []);
  const memberTribes = allTribes.filter(t => t.members.includes(uid));
  const idSets = await Promise.all(memberTribes.map(t => tribesModel.getChainIds(t.id).catch(() => [t.id])));
  return new Set(idSets.flat());
};
const refreshInboxCount = async (messagesOpt) => {
  const messages = messagesOpt || await pmModel.listAllPrivate();
  const userId = getViewerId();
  const isToUser = m => Array.isArray(m?.value?.content?.to) && m.value.content.to.includes(userId);
  const filtered = messages.filter(m => m && m.key && m.value && m.value.content && m.value.content.type === 'post' && m.value.content.private === true);
  sharedState.setInboxCount(filtered.filter(isToUser).length);
};
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
  } else if (err && (err.name === 'OpenError' || (typeof err.message === 'string' && /Resource temporarily unavailable/i.test(err.message) && /\.ssb\/.*LOCK/i.test(err.message)))) {
    console.log("");
    console.log("Another Oasis instance is already running on this machine. Close the other instance (or kill the process) and try again.");
    console.log("");
    process.exit(1);
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
const { nav, ul, li, a, form, button, div, section, h2, p } = require("../server/node_modules/hyperaxe");
const open = require("../server/node_modules/open");
const pull = require("../server/node_modules/pull-stream");
const koaRouter = require("../server/node_modules/@koa/router");
const ssbMentions = require("../server/node_modules/ssb-mentions");
const isSvg = require('../server/node_modules/is-svg');
const { isFeed, isMsg, isBlob } = require("../server/node_modules/ssb-ref");
const ssb = require("../client/gui");
const router = new koaRouter();

async function fetchProfileItems(feedId, prefs) {
  const MAX_PER_SECTION = 5;
  const items = { shops: [], jobs: [], events: [], projects: [], posts: [], audios: [], videos: [], images: [], documents: [], torrents: [] };
  const tasks = [];
  if (prefs.profileShops) tasks.push((async () => {
    try {
      const shops = await shopsModel.listAll({ filter: 'all' }).catch(() => []);
      items.shops = (shops || []).filter(s => s.author === feedId && String(s.visibility || '').toUpperCase() !== 'CLOSED').slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  if (prefs.profileJobs) tasks.push((async () => {
    try {
      const jobs = await jobsModel.listJobs('ALL', feedId).catch(() => []);
      items.jobs = (jobs || []).filter(j => j.author === feedId && String(j.status || '').toUpperCase() !== 'CLOSED').slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  if (prefs.profileEvents) tasks.push((async () => {
    try {
      const events = await eventsModel.listAll(feedId, 'all').catch(() => []);
      items.events = (events || []).filter(e => e.organizer === feedId && String(e.status || '').toUpperCase() !== 'CLOSED').slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  if (prefs.profileProjects) tasks.push((async () => {
    try {
      const projects = await projectsModel.listProjects('ALL').catch(() => []);
      items.projects = (projects || []).filter(p => p.author === feedId && String(p.status || '').toUpperCase() !== 'CANCELLED').slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  if (prefs.profilePosts) tasks.push((async () => {
    try {
      const ssbX = await cooler.open();
      items.posts = await new Promise((resolve) => {
        try {
          pull(
            ssbX.createUserStream({ id: feedId, reverse: true, limit: 200 }),
            pull.filter(m => m && m.value && m.value.content && m.value.content.type === 'post' && !m.value.content.root),
            pull.collect((err, arr) => {
              if (err || !Array.isArray(arr)) return resolve([]);
              resolve(arr.slice(0, MAX_PER_SECTION));
            })
          );
        } catch (_) { resolve([]); }
      });
    } catch (_) {}
  })());
  if (prefs.profileAudios) tasks.push((async () => {
    try {
      const audios = await audiosModel.listAll('all').catch(() => []);
      items.audios = (audios || []).filter(m => m.author === feedId).slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  if (prefs.profileVideos) tasks.push((async () => {
    try {
      const videos = await videosModel.listAll('all').catch(() => []);
      items.videos = (videos || []).filter(m => m.author === feedId).slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  if (prefs.profileImages) tasks.push((async () => {
    try {
      const images = await imagesModel.listAll('all').catch(() => []);
      items.images = (images || []).filter(m => m.author === feedId).slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  if (prefs.profileDocuments) tasks.push((async () => {
    try {
      const documents = await documentsModel.listAll('all').catch(() => []);
      items.documents = (documents || []).filter(m => m.author === feedId).slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  if (prefs.profileTorrents) tasks.push((async () => {
    try {
      const torrents = await torrentsModel.listAll('all').catch(() => []);
      items.torrents = (torrents || []).filter(m => m.author === feedId).slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  if (prefs.profileBookmarks) tasks.push((async () => {
    try {
      const bookmarks = await bookmarksModel.listAll('all').catch(() => []);
      items.bookmarks = (bookmarks || []).filter(m => m.author === feedId).slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  await Promise.all(tasks);
  return items;
}

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
const cooler = ssb({ offline: config.offline, port: config.port, host: config.host, isPublic: config.public });
const models = require("../models/main_models");
const { about, blob, friend, meta, post, vote, spreads, lifetime } = models({
  cooler,
  isPublic: config.public,
});
const { handleBlobUpload, serveBlob, FileTooLargeError } = require('../backend/blobHandler.js');
const extractBlobId = (md) => md ? (md.match(/\((&[^)]+)\)/)?.[1] ?? null) : null;
const exportmodeModel = require('../models/exportmode_model');
const panicmodeModel = require('../models/panicmode_model');
const cipherModel = require('../models/cipher_model');
const legacyModel = require('../models/legacy_model');
const walletModel = require('../models/wallet_model')
const pmModel = require('../models/pm_model')({ cooler, isPublic: config.public });
const bookmarksModel = require("../models/bookmarking_model")({ cooler, isPublic: config.public });
const opinionsModel = require('../models/opinions_model')({ cooler, isPublic: config.public });
const tasksModel = require('../models/tasks_model')({ cooler, isPublic: config.public, pmModel });
const votesModel = require('../models/votes_model')({ cooler, isPublic: config.public });
const ssbConfig = require('../server/ssb_config');
const tribeCrypto = require('../models/crypto')(ssbConfig.path, 'tribes');
const chatCrypto = require('../models/crypto')(ssbConfig.path, 'chats');
const padCrypto = require('../models/crypto')(ssbConfig.path, 'pads');
const mapCrypto = require('../models/crypto')(ssbConfig.path, 'maps');
const calendarCrypto = require('../models/crypto')(ssbConfig.path, 'calendars');
const eventCrypto = require('../models/crypto')(ssbConfig.path, 'events');
const forumCrypto = require('../models/crypto')(ssbConfig.path, 'forum');
const tribesModel = require('../models/tribes_model')({ cooler, isPublic: config.public, tribeCrypto });
const eventsModel = require('../models/events_model')({ cooler, isPublic: config.public, tribeCrypto, eventCrypto, tribesModel });
const larpModel = require('../models/larp_model')({ cooler, tribesModel });
const blockchainModel = require('../models/blockchain_model')({ cooler, isPublic: config.public, tribeCrypto, tribesModel });
const reportsModel = require('../models/reports_model')({ cooler, isPublic: config.public });
const transfersModel = require('../models/transfers_model')({ cooler, isPublic: config.public });
const calendarsModel = require('../models/calendars_model')({ cooler, pmModel, tribeCrypto, calendarCrypto, tribesModel });
const cvModel = require('../models/cv_model')({ cooler, isPublic: config.public });
const inhabitantsModel = require('../models/inhabitants_model')({ cooler, isPublic: config.public });
const feedModel = require('../models/feed_model')({ cooler, isPublic: config.public });
const imagesModel = require("../models/images_model")({ cooler, isPublic: config.public });
const audiosModel = require("../models/audios_model")({ cooler, isPublic: config.public });
const torrentsModel = require("../models/torrents_model")({ cooler, isPublic: config.public, tribeCrypto, tribesModel });
const videosModel = require("../models/videos_model")({ cooler, isPublic: config.public });
const documentsModel = require("../models/documents_model")({ cooler, isPublic: config.public });
const trendingModel = require('../models/trending_model')({ cooler, isPublic: config.public });
const statsModel = require('../models/stats_model')({ cooler, isPublic: config.public, tribeCrypto, tribesModel });
const padsModel = require('../models/pads_model')({ cooler, cipherModel, tribeCrypto, padCrypto, tribesModel });
const tagsModel = require('../models/tags_model')({ cooler, isPublic: config.public, padsModel, tribesModel });
const tribesContentModel = require('../models/tribes_content_model')({ cooler, isPublic: config.public, tribeCrypto, tribesModel });
const searchModel = require('../models/search_model')({ cooler, isPublic: config.public, padsModel, tribeCrypto, tribesModel });
const activityModel = require('../models/activity_model')({ cooler, isPublic: config.public, tribeCrypto, tribesModel });
const pixeliaModel = require('../models/pixelia_model')({ cooler, isPublic: config.public });
const melodyModel = require('../models/melody_model')({ cooler });
const marketModel = require('../models/market_model')({ cooler, isPublic: config.public, tribeCrypto });
const forumModel = require('../models/forum_model')({ cooler, isPublic: config.public, tribeCrypto, forumCrypto });
const jobsModel = require('../models/jobs_model')({ cooler, isPublic: config.public, tribeCrypto });
const shopsModel = require('../models/shops_model')({ cooler, isPublic: config.public, tribeCrypto });
const chatsModel = require('../models/chats_model')({ cooler, tribeCrypto, chatCrypto, tribesModel });
const projectsModel = require("../models/projects_model")({ cooler, isPublic: config.public });
const agendaModel = require("../models/agenda_model")({ cooler, isPublic: config.public, calendarsModel, eventsModel, tasksModel, marketModel, jobsModel, projectsModel });
const mapsModel = require("../models/maps_model")({ cooler, isPublic: config.public, tribeCrypto, mapCrypto, tribesModel });
const gamesModel = require('../models/games_model')({ cooler });
const bankingModel = require("../models/banking_model")({ services: { cooler }, isPublic: config.public });
const favoritesModel = require("../models/favorites_model")({ services: { cooler }, audiosModel, bookmarksModel, documentsModel, imagesModel, videosModel, mapsModel, padsModel, chatsModel, calendarsModel, torrentsModel });
const logsModel = require("../models/logs_model")({ cooler });
const parliamentModel = require('../models/parliament_model')({ cooler, services: { tribes: tribesModel, votes: votesModel, inhabitants: inhabitantsModel, banking: bankingModel } });
const { renderGovernance: renderTribeGovernance } = require('../views/tribes_view');
const viewerFilters = require('../models/viewer_filters');

const scanPendingFollows = async (viewerId) => {
  if (!viewerId) return;
  if (!viewerFilters.isFrictionActive()) return;
  const pullStream = require('../server/node_modules/pull-stream');
  const ssbClient = await cooler.open();
  const limit = getConfig().ssbLogStream?.limit || 1000;
  const rows = await new Promise((res, rej) => {
    pullStream(
      ssbClient.createLogStream({ reverse: true, limit }),
      pullStream.collect((err, arr) => err ? rej(err) : res(arr || []))
    );
  });
  const accepted = new Set(viewerFilters.loadAccepted());
  const pendingIds = new Set(viewerFilters.listPending().map(x => x.followerId));
  for (const msg of rows) {
    const c = msg.value?.content;
    if (!c || c.type !== 'contact') continue;
    if (c.contact !== viewerId) continue;
    if (c.following !== true) continue;
    const author = msg.value?.author;
    if (!author || author === viewerId) continue;
    if (accepted.has(author)) continue;
    if (pendingIds.has(author)) continue;
    viewerFilters.enqueuePending(author);
    pendingIds.add(author);
  }
};

const { section: hSection } = require('../server/node_modules/hyperaxe');

const renderPendingFollows = (items) => {
  const { template: tpl, i18n: i18nLocal } = require('../views/main_views');
  const { div, h2, p, form, button, input, ul, li, span, a } = require('../server/node_modules/hyperaxe');
  return tpl(
    i18nLocal.inhabitantsPendingFollowsTitle || 'Pending follow requests',
    hSection(
      div({ class: 'tags-header' },
        h2(i18nLocal.inhabitantsPendingFollowsTitle || 'Pending follow requests'),
        p(i18nLocal.pmMutualNotice || '')
      ),
      (!Array.isArray(items) || items.length === 0)
        ? p('—')
        : ul({}, items.map(it =>
            li({},
              span({ style: 'font-weight:bold' }, it.name || it.followerId),
              ' — ',
              span({ class: 'muted' }, it.followerId.slice(0, 14) + '…'),
              ' ',
              form({ method: 'POST', action: '/inhabitants/follow/accept', style: 'display:inline' },
                input({ type: 'hidden', name: 'followerId', value: it.followerId }),
                button({ type: 'submit', class: 'filter-btn' }, i18nLocal.inhabitantsPendingAccept || 'Accept')
              ),
              ' ',
              form({ method: 'POST', action: '/inhabitants/follow/reject', style: 'display:inline' },
                input({ type: 'hidden', name: 'followerId', value: it.followerId }),
                button({ type: 'submit', class: 'filter-btn' }, i18nLocal.inhabitantsPendingReject || 'Reject')
              )
            )
          ))
    )
  );
};

const makeCtxMutualCache = () => {
  const cache = new Map();
  const frictionActive = viewerFilters.isFrictionActive();
  return async (otherId) => {
    if (!otherId) return false;
    if (cache.has(otherId)) return cache.get(otherId);
    let rel;
    try { rel = await friend.getRelationship(otherId); } catch (e) { rel = null; }
    const basic = !!(rel && rel.following && rel.followsMe);
    const mutual = frictionActive ? (basic && viewerFilters.isAccepted(otherId)) : basic;
    cache.set(otherId, mutual);
    return mutual;
  };
};

const extractItemAuthor = (item) => {
  if (!item) return null;
  if (typeof item === 'string') return null;
  if (item.value && item.value.author) return item.value.author;
  if (item.author) return item.author;
  if (item.feed) return item.feed;
  if (item.organizer) return item.organizer;
  if (item.proposer) return item.proposer;
  if (item.owner) return item.owner;
  if (item.id && typeof item.id === 'string' && item.id.startsWith('@')) return item.id;
  return null;
};

const extractItemTribeId = (item) => {
  if (!item || typeof item !== 'object') return null;
  if (item.tribeId) return item.tribeId;
  if (item.value && item.value.content && item.value.content.tribeId) return item.value.content.tribeId;
  if (item.content && item.content.tribeId) return item.content.tribeId;
  return null;
};

const getViewerTribeAccessSets = async (userId) => {
  if (!userId) return { memberOf: new Set(), createdBy: new Set(), privateNotAccessible: new Set() };
  try {
    const all = await tribesModel.listAll();
    const memberOf = new Set();
    const createdBy = new Set();
    const privateNotAccessible = new Set();
    for (const t of all) {
      const isMember = Array.isArray(t.members) && t.members.includes(userId);
      const isCreator = t.author === userId;
      if (isCreator) { createdBy.add(t.id); memberOf.add(t.id); }
      else if (isMember) memberOf.add(t.id);
      const ancestryPrivate = await (async () => {
        try { const eff = await tribesModel.getEffectiveStatus(t.id); return eff.isPrivate; } catch (e) { return !!t.isAnonymous; }
      })();
      if (ancestryPrivate && !isMember && !isCreator) privateNotAccessible.add(t.id);
    }
    return { memberOf, createdBy, privateNotAccessible };
  } catch (e) {
    return { memberOf: new Set(), createdBy: new Set(), privateNotAccessible: new Set() };
  }
};

const applyListFilters = async (items, ctx, opts = {}) => {
  if (!Array.isArray(items)) return items;
  const cfg = getConfig();
  const viewer = getViewerId();
  const wishMutuals = cfg.wish === 'mutuals';
  let out = items;
  if (!opts.skipTribeAccess) {
    const { memberOf, createdBy, privateNotAccessible } = await getViewerTribeAccessSets(viewer);
    out = out.filter(it => {
      const tid = extractItemTribeId(it);
      if (!tid) return true;
      if (memberOf.has(tid) || createdBy.has(tid)) return true;
      if (privateNotAccessible.has(tid)) return false;
      return true;
    });
  }
  if (wishMutuals && !opts.skipMutual) {
    const isMutual = makeCtxMutualCache();
    const filtered = [];
    for (const it of out) {
      const a = extractItemAuthor(it);
      if (!a || a === viewer) { filtered.push(it); continue; }
      if (await isMutual(a)) filtered.push(it);
    }
    out = filtered;
  }
  return out;
};
const enrichItemLifetime = async (item, opts = {}) => {
  if (!item) return item;
  try {
    const key = opts.key ?? (item.id || item.key || item.rootId);
    const author = opts.author ?? (item.author || item.organizer || item.createdBy || item.seller || item.from);
    const createdAt = opts.createdAt ?? item.createdAt;
    item.lifetime = await lifetime.forContent({ key, author, createdAt });
  } catch (_) {}
  return item;
};
const courtsModel = require('../models/courts_model')({ cooler, services: { votes: votesModel, inhabitants: inhabitantsModel, tribes: tribesModel, banking: bankingModel }, tribeCrypto });
tribesModel.processIncomingKeys().then(async () => {
  try {
    const viewerId = getViewerId();
    const mine = (await tribesModel.listAll()).filter(t => t.author === viewerId);
    for (const t of mine) {
      await tribesModel.ensureTribeKeyDistribution(t.id).catch(() => {});
      await tribesModel.ensureFollowTribeMembers(t.id).catch(() => {});
    }
    await tribesModel.pruneOrphanKeys().catch(() => {});
  } catch (_) {}
}).catch(err => {
  if (config.debug) console.error('tribe-keys scan error:', err.message);
});
courtsModel.processIncomingCourtsKeys().catch(err => {
  if (config.debug) console.error('courts-keys scan error:', err.message);
});
const getVoteComments = async (voteId) => {
  const raw = await post.topicComments(voteId);
  return (raw || []).filter(c => c?.value?.content?.type === 'post' && c.value.content.root === voteId)
    .sort((a, b) => (a?.value?.timestamp || 0) - (b?.value?.timestamp || 0));
};
const enrichWithComments = async (items, idKey = 'id') => {
  await Promise.all(items.map(async x => { x.commentCount = (await getVoteComments(x[idKey] || x.key || x.rootId)).length; }));
  return items;
};
const enrichMsgSize = async (items, idKey = 'id') => {
  try {
    const ssbX = await cooler.open();
    await Promise.all((items || []).map(async (x) => {
      const id = x && (x[idKey] || x.key || x.rootId);
      if (!id) return;
      try {
        const raw = await new Promise((resolve) => ssbX.get(id, (err, v) => resolve(err ? null : v)));
        if (raw) x.msgSize = Buffer.byteLength(JSON.stringify(raw), 'utf8');
      } catch (_) {}
    }));
  } catch (_) {}
  return items;
};
const withCount = (item, comments) => ({ ...item, commentCount: comments.length });
const resolveMapUrl = async (mapUrl) => {
  if (!mapUrl) return null;
  try {
    const mapKey = decodeURIComponent(String(mapUrl).replace(/^\/maps\//, ''));
    return await mapsModel.getMapById(mapKey, null);
  } catch (_) { return null; }
};

const mediaResolvers = {
  images: id => imagesModel.resolveRootId(id),
  audios: id => audiosModel.resolveRootId(id),
  videos: id => videosModel.resolveRootId(id),
  documents: id => documentsModel.resolveRootId(id),
  bookmarks: id => bookmarksModel.resolveRootId(id),
  shops: id => shopsModel.resolveRootId(id),
  chats: id => chatsModel.resolveRootId(id),
  maps: id => mapsModel.resolveRootId(id),
  pads: id => padsModel.resolveRootId(id),
  calendars: id => calendarsModel.resolveRootId(id),
  torrents: id => torrentsModel.resolveRootId(id)
};
const mediaModCheck = { images: 'imagesMod', audios: 'audiosMod', videos: 'videosMod', documents: 'documentsMod', bookmarks: 'bookmarksMod', market: 'marketMod', jobs: 'jobsMod', projects: 'projectsMod', shops: 'shopsMod', chats: 'chatsMod', maps: 'mapsMod', pads: 'padsMod', calendars: 'calendarsMod', torrents: 'torrentsMod' };
const favAction = async (ctx, kind, action) => {
  if (!checkMod(ctx, mediaModCheck[kind])) { ctx.redirect('/modules'); return; }
  try {
    const rootId = await mediaResolvers[kind](ctx.params.id);
    if (rootId) await mediaFavorites[action + 'Favorite'](kind, rootId);
  } catch (_) {}
  ctx.redirect(safeReturnTo(ctx, `/${kind}`, [`/${kind}`]));
};
const commentAction = async (ctx, kind, idParam) => {
  const modKey = mediaModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  const itemId = ctx.params[idParam];
  let text = stripDangerousTags((ctx.request.body.text || '').trim());
  const rt = safeReturnTo(ctx, `/${kind}/${encodeURIComponent(itemId)}`, [`/${kind}`]);
  const blobMarkdown = await handleBlobUpload(ctx, 'blob');
  if (blobMarkdown) text += blobMarkdown;
  if (!text) { ctx.redirect(rt); return; }
  await post.publish({ text, root: itemId, dest: itemId });
  ctx.redirect(rt);
};
const opinionModels = { images: imagesModel, audios: audiosModel, videos: videosModel, documents: documentsModel, bookmarks: bookmarksModel, torrents: torrentsModel };
const deleteModels = { images: imagesModel, audios: audiosModel, videos: videosModel, documents: documentsModel, bookmarks: bookmarksModel, torrents: torrentsModel };
const opinionAction = async (ctx, kind, idParam) => {
  const modKey = mediaModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  await opinionModels[kind].createOpinion(ctx.params[idParam], ctx.params.category);
  try { activityModel.invalidateCache(); } catch (_) {}
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
  const { tags, title, description, mapUrl } = ctx.request.body;
  await mediaCreateModels[kind][`create${kind.charAt(0).toUpperCase()}${kind.slice(1, -1)}`](blob, stripDangerousTags(tags), stripDangerousTags(title), stripDangerousTags(description), stripDangerousTags(mapUrl || ""));
  ctx.redirect(safeReturnTo(ctx, `/${kind}?filter=all`, [`/${kind}`]));
};
const mediaUpdateAction = async (ctx, kind) => {
  const modKey = mediaModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  const { tags, title, description, mapUrl } = ctx.request.body;
  const singular = kind.slice(0, -1);
  const blob = ctx.request.files?.[singular] ? await handleBlobUpload(ctx, singular) : null;
  await mediaCreateModels[kind][`update${kind.charAt(0).toUpperCase()}${kind.slice(1, -1)}ById`](ctx.params.id, blob, stripDangerousTags(tags), stripDangerousTags(title), stripDangerousTags(description), stripDangerousTags(mapUrl || ""));
  ctx.redirect(safeReturnTo(ctx, `/${kind}?filter=mine`, [`/${kind}`]));
};
const qf = (ctx, def = 'all') => ctx.query.filter || def;
const qp = (ctx, def = 1) => Math.max(1, parseInt(ctx.query.page) || def);
about._startNameWarmup();
async function renderBlobMarkdown(text, mentions = {}, myFeedId, myUsername) {
  if (!text) return '';
  const escHtml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  const mentionByFeed = {};
  Object.values(mentions).forEach(arr => {
    arr.forEach(m => {
      mentionByFeed[m.feed] = m;
    });
  });
  text = text.replace(/\[@([^\]]+)\]\(([^)]+)\)/g, (_, name, id) => {
    return `<a class="mention" href="/author/${encodeURIComponent(id)}">@${escHtml(name)}</a>`;
  });
  const words = text.split(' ');
  text = (await Promise.all(
    words.map(async (word) => {
      const match = /@([A-Za-z0-9_\-\.+=\/]+\.ed25519)/.exec(word);
      if (match && match[1]) {
        const feedId = match[1];
        const feedWithAt = feedId.startsWith('@') ? feedId : `@${feedId}`;
        let resolvedName;
        if (feedId === myFeedId || feedWithAt === myFeedId) {
          resolvedName = myUsername;
        } else {
          try { resolvedName = await about.name(feedWithAt); } catch { resolvedName = feedId.slice(0, 8); }
        }
        return word.replace(match[0], `<a class="mention" href="/author/${encodeURIComponent(feedWithAt)}">@${escHtml(resolvedName)}</a>`);
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
    .replace(/\[pdf:([^\]]*)\]\(([^)]+)\)/g, (_, name, id) => {
      const { i18n } = require("../views/main_views");
      const label = name || (i18n && i18n.pdfFallbackLabel) || 'PDF';
      return `<a class="post-pdf" href="/blob/${encodeURIComponent(id)}" target="_blank">${escHtml(label)}</a>`;
    });
  return text;
}

async function resolveMentionText(text) {
  if (!text || typeof text !== 'string') return text;
  const mentionRe = /@([A-Za-z0-9_\-\.+=\/]+\.ed25519)/g;
  const matches = [...text.matchAll(mentionRe)];
  if (!matches.length) return text;
  const seen = new Map();
  for (const m of matches) {
    const raw = m[1];
    const feed = raw.startsWith('@') ? raw : `@${raw}`;
    if (seen.has(feed)) continue;
    let name;
    try { name = await about.name(feed); } catch { name = feed.slice(1, 9); }
    seen.set(feed, name);
  }
  return text.replace(mentionRe, (full, id) => {
    const feed = id.startsWith('@') ? id : `@${id}`;
    const name = seen.get(feed) || feed.slice(1, 9);
    return `[@${name}](${feed})`;
  });
}

const preparePreview = async function (ctx) {
  let text = String(ctx.request.body.text || "")
  if (text.length > 8000) text = text.slice(0, 8000)
  const contentWarning = stripDangerousTags(String(ctx.request.body.contentWarning || ""))
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
      const [name, img, rel] = await Promise.all([
        about.name(feed),
        about.image(feed),
        friend.getRelationship(feed).catch(() => ({ followsMe: false, following: false, blocking: false, me: false }))
      ])
      pushUnique(w1, [{ feed, name, img, rel }])
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
    maxFileSize: maxSize,
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
    const rawContentWarning = stripDangerousTags(String(ctx.request.body.contentWarning || "").trim());
    contentWarning = rawContentWarning.length > 0 ? rawContentWarning : undefined;
  }
  return { messages, myFeedId, parentMessage, contentWarning };
};
const { authorView, previewCommentView, commentView, editProfileView, extendedView, latestView, likesView, threadView, hashtagView, mentionsView, popularView, previewView, privateView, publishCustomView, publishView, previewSubtopicView, subtopicView, imageSearchView, setLanguage, topicsView, summaryView, threadsView, tribeAccessDeniedView, inviteRequiredView, clearnetInhabitantView, clearnetBlogView } = require("../views/main_views");
const { activityView } = require("../views/activity_view");
const { cvView, createCVView } = require("../views/cv_view");
const { indexingView } = require("../views/indexing_view");
const { pixeliaView } = require("../views/pixelia_view");
const { melodyView } = require("../views/melody_view");
const { gamesView } = require("../views/games_view");
const { statsView } = require("../views/stats_view");
const { tribesView, tribeView, renderInvitePage } = require("../views/tribes_view");
const { agendaView } = require("../views/agenda_view");
const { documentView, singleDocumentView } = require("../views/document_view");
const { inhabitantsView, inhabitantsProfileView } = require("../views/inhabitants_view");
const { walletViewRender, walletView, walletHistoryView, walletReceiveView, walletSendFormView, walletSendConfirmView, walletSendResultView, walletErrorView } = require("../views/wallet_view");
const { pmView } = require("../views/pm_view");
const { tagsView } = require("../views/tags_view");
const { videoView, singleVideoView } = require("../views/video_view");
const { audioView, singleAudioView, audiosTranscodeView, audioTranscodeDetailView } = require("../views/audio_view");
const { torrentsView, singleTorrentView } = require("../views/torrents_view");
const { eventView, singleEventView, clearnetEventView } = require("../views/event_view");
const { invitesView } = require("../views/invites_view");
const { modulesView } = require("../views/modules_view");
const { reportView, singleReportView } = require("../views/report_view");
const { taskView, singleTaskView } = require("../views/task_view");
const { voteView } = require("../views/vote_view");
const { bookmarkView, singleBookmarkView } = require("../views/bookmark_view");
const { feedView, feedCreateView, singleFeedView } = require("../views/feed_view");
const { legacyView } = require("../views/legacy_view");
const { opinionsView } = require("../views/opinions_view");
const { peersView } = require("../views/peers_view");
const { graphosView } = require("../views/graphos_view");
const { larpListView, larpHouseView, larpTestView, larpTestResultView } = require("../views/larp_view");
const { searchView } = require("../views/search_view");
const { transferView, singleTransferView } = require("../views/transfer_view");
const { cipherView } = require("../views/cipher_view");
const { imageView, singleImageView } = require("../views/image_view");
const { mapsView, singleMapView } = require("../views/maps_view");
const { settingsView } = require("../views/settings_view");
const { trendingView } = require("../views/trending_view");
const { marketView, singleMarketView } = require("../views/market_view");
const { aiView } = require("../views/AI_view");
const { forumView, singleForumView } = require("../views/forum_view");
const { renderBlockchainView, renderSingleBlockView } = require("../views/blockchain_view");
const { jobsView, singleJobsView, renderJobForm, clearnetJobView } = require("../views/jobs_view");
const { shopsView, singleShopView, singleProductView, editProductView, shopOrdersView, clearnetShopView } = require("../views/shops_view");
const { chatsView, singleChatView, renderChatInvitePage } = require("../views/chats_view");
const { padsView, singlePadView, renderPadInvitePage } = require("../views/pads_view");
const { calendarsView, singleCalendarView, renderCalendarInvitePage } = require("../views/calendars_view");
const { projectsView, singleProjectView, clearnetProjectView } = require("../views/projects_view")
const { renderBankingView, renderSingleAllocationView, renderEpochView } = require("../views/banking_views")
const { favoritesView } = require("../views/favorites_view");
const { logsView } = require("../views/logs_view");
const { buildLogsPdf } = require("./logsPdf");
const { buildSmartContractPdf } = require("./smartContractPdf");
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
const MAX_TITLE_LENGTH = 150;
const MAX_TEXT_LENGTH = 8000;
const parseSizeMB = (s) => { if (!s) return 0; const m = String(s).match(/([\d.]+)\s*(GB|MB|KB|B)/i); if (!m) return 0; const v = parseFloat(m[1]), u = m[2].toUpperCase(); return u === 'GB' ? v * 1024 : u === 'MB' ? v : u === 'KB' ? v / 1024 : v / (1024 * 1024); };
const tooLong = (ctx, value, max, label) => {
  if (value && value.length > max) {
    sendErrorPage(ctx, `${label} too long (max ${max})`, { status: 400 });
    return true;
  }
  return false;
};

const buildEffectivePrivateChainIds = async () => {
  const ids = new Set();
  const all = await tribesModel.listAll().catch(() => []);
  for (const tr of all) {
    try {
      const eff = await tribesModel.getEffectiveStatus(tr.id);
      if (!eff || !eff.isPrivate) continue;
      const chain = await tribesModel.getChainIds(tr.id).catch(() => [tr.id]);
      for (const cid of chain) ids.add(cid);
    } catch (_) {}
  }
  return ids;
};

const isBlockRestricted = (block, effPrivateChainIds) => {
  if (!block) return false;
  const c = block.content || {};
  const t = c.type || block.type || '';
  const isPrivate = String(c.isPublic || '').toLowerCase() === 'private';
  const tribeMsgInPrivate = t === 'tribe' && (effPrivateChainIds.has(block.id) || (c.replaces && effPrivateChainIds.has(c.replaces)));
  const tribeKeysInPrivate = t === 'tribe-keys' && c.tribeId && effPrivateChainIds.has(c.tribeId);
  const tribeContentInPrivate = !!c.tribeId && effPrivateChainIds.has(c.tribeId);
  return tribeMsgInPrivate ||
    tribeKeysInPrivate ||
    tribeContentInPrivate ||
    t.startsWith('courts') ||
    t === 'job' || t === 'job_sub' ||
    c.status === 'INVITE-ONLY' || c.status === 'PRIVATE' ||
    isPrivate;
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
  .get("/", async (ctx) => {
    const currentConfig = getConfig();
    if (currentConfig.ux?.current === "ainav") {
      const { ainavHomeView } = require("../views/main_views");
      let recentTags = [];
      try {
        const all = await tagsModel.listTags('top');
        recentTags = (all || []).slice(0, 10);
      } catch (_) {}
      ctx.body = ainavHomeView({ recentTags });
      return;
    }
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
    stats.gpgFingerprint = await about.gpgFingerprint(myId).catch(() => '');
    try { stats.logsCount = await logsModel.countLogs(); } catch { stats.logsCount = 0; }
    const totalMB = parseSizeMB(stats.statsBlobsSize) + parseSizeMB(stats.statsBlockchainSize);
    const hcT = parseFloat((totalMB * 0.0002 * 475).toFixed(2));
    const inhabitants = stats.usersKPIs?.totalInhabitants || stats.inhabitants || 1;
    const hcH = inhabitants > 0 ? parseFloat((hcT / inhabitants).toFixed(2)) : 0;
    sharedState.setCarbonHcT(hcT);
    sharedState.setCarbonHcH(hcH);
    sharedState.setInhabitantCount(inhabitants);
    try { stats.ecoTaxStats = await bankingModel.calculateEcoTaxStats(); } catch (_) { stats.ecoTaxStats = null; }
    try { stats.userEcoinTax = await bankingModel.getUserEcoinTax(getViewerId()); } catch (_) { stats.userEcoinTax = 0; }
    ctx.body = statsView(stats, filter);
  })
  .get("/public/popular/:period", async (ctx) => {
    if (!checkMod(ctx, 'popularMod')) return ctx.redirect('/modules');
    const i18n = require("../client/assets/translations/i18n"), lang = ctx.cookies.get('language') || getConfig().language || 'en', t = i18n[lang] || i18n['en'];
    const messages = sanitizeMessages(await post.popular({ period: ctx.params.period }));
    ctx.body = await popularView({ messages, prefix: nav(div({ class: "filters" }, ul(['day','week','month','year'].map(p => li(form({ method: "GET", action: `/public/popular/${p}` }, button({ type: "submit", class: "filter-btn" }, t[p]))))))) });
  }) 
  .get("/modules", async (ctx) => {
    const modules = ['popular', 'topics', 'summaries', 'latest', 'threads', 'multiverse', 'invites', 'wallet', 'legacy', 'cipher', 'bookmarks', 'calendars', 'chats', 'videos', 'docs', 'audios', 'tags', 'images', 'maps', 'trending', 'events', 'tasks', 'market', 'tribes', 'larp', 'votes', 'reports', 'opinions', 'pads', 'transfers', 'feed', 'pixelia', 'melody', 'agenda', 'favorites', 'ai', 'forum', 'games', 'jobs', 'projects', 'shops', 'banking', 'parliament', 'courts'];
    const cfg = getConfig().modules;
    ctx.body = modulesView(modules.reduce((acc, m) => { acc[`${m}Mod`] = cfg[`${m}Mod`]; return acc; }, {}));
  })
  .get('/ai', async (ctx) => {
    if (!checkMod(ctx, 'aiMod')) return ctx.redirect('/modules');
    startAI();
    const lang = ctx.cookies.get('language') || getConfig().language || 'en', historyPath = path.join(__dirname, '..', '..', 'src', 'configs', 'AI-history.json');
    require('../views/main_views').setLanguage(lang);
    let chatHistory = []; try { chatHistory = JSON.parse(fs.readFileSync(historyPath, 'utf-8')); } catch {}
    ctx.body = aiView(chatHistory, getConfig().ai?.prompt?.trim() || '');
  })
  .get('/games', async (ctx) => {
    if (!checkMod(ctx, 'gamesMod')) { ctx.redirect('/modules'); return; }
    const filter = qf(ctx, 'all');
    const hall = await gamesModel.getHallOfFame();
    ctx.body = gamesView(filter, hall);
  })
  .get('/games/:name', async (ctx) => {
    if (!checkMod(ctx, 'gamesMod')) { ctx.redirect('/modules'); return; }
    const { gameShellView } = require('../views/games_view');
    ctx.body = gameShellView(ctx.params.name);
  })
  .post('/games/submit-score', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'gamesMod')) { ctx.redirect('/modules'); return; }
    const { game, score } = ctx.request.body;
    try { await gamesModel.submitScore(game, score); } catch (_) {}
    ctx.redirect('/games?filter=scoring');
  })
  .get('/pixelia', async (ctx) => {
    if (!checkMod(ctx, 'pixeliaMod')) { ctx.redirect('/modules'); return; }
    const pixelArt = await pixeliaModel.listPixels();
    ctx.body = pixeliaView(pixelArt);
  })
  .get('/melody', async (ctx) => {
    if (!checkMod(ctx, 'melodyMod')) { ctx.redirect('/modules'); return; }
    const rawFilter = String(ctx.query?.filter || 'mine').toLowerCase();
    const filter = rawFilter === 'all' ? 'all' : 'mine';
    const viewerId = getViewerId();
    const data = await melodyModel.getUserMelody(viewerId);
    let bcsAudios = [];
    if (filter === 'all' && checkMod(ctx, 'audiosMod')) {
      bcsAudios = await audiosModel.listAll({ filter: 'bcs', viewerId }).catch(() => []);
      bcsAudios = bcsAudios.filter(a => String(a.author) !== String(viewerId));
    }
    ctx.body = melodyView({ ...data, filter, bcsAudios });
  })
  .get('/melody/audio.wav', async (ctx) => {
    if (!checkMod(ctx, 'melodyMod')) { ctx.status = 404; return; }
    const viewerId = getViewerId();
    const data = await melodyModel.getUserMelody(viewerId);
    if (!data.sequence || data.sequence.length === 0) { ctx.status = 404; return; }
    ctx.type = 'audio/wav';
    ctx.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (ctx.query.download === '1') {
      const safeName = String(viewerId || 'oasis').replace(/["\r\n\\]/g, '');
      ctx.set('Content-Disposition', `attachment; filename="${safeName}.wav"`);
    }
    ctx.body = synthesizeMelodyWav(data.sequence);
  })
  .post('/melody/upload', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'melodyMod')) { ctx.redirect('/modules'); return; }
    if (!checkMod(ctx, 'audiosMod')) { ctx.redirect('/modules'); return; }
    const body = ctx.request.body || {};
    const stegoMessage = String(body.stegoMessage || '').slice(0, 280);
    const viewerId = getViewerId();
    const data = await melodyModel.getUserMelody(viewerId);
    if (!data.sequence || data.sequence.length === 0) { ctx.redirect('/melody'); return; }
    let wav = synthesizeMelodyWav(data.sequence);
    const ssbClient = await cooler.open();
    const stegoPayload = JSON.stringify({
      id: ssbClient.id,
      ts: Date.now(),
      msg: stegoMessage
    });
    try { wav = melodyModel.embedTextInWav(wav, stegoPayload); } catch (_) {}
    const blobId = await new Promise((resolve, reject) => {
      pull(
        pull.values([wav]),
        ssbClient.blobs.add((err, ref) => (err ? reject(err) : resolve(ref)))
      );
    });
    const title = `BCS-${viewerId || ssbClient.id}`;
    try {
      await audiosModel.createBcsAudio(blobId, title, '', data.sequence);
    } catch (_) {
      ctx.redirect('/melody');
      return;
    }
    ctx.redirect('/audios?filter=bcs');
  })
  .get('/melody/transcode/:id', async (ctx) => {
    if (!checkMod(ctx, 'melodyMod')) { ctx.redirect('/modules'); return; }
    if (!checkMod(ctx, 'audiosMod')) { ctx.redirect('/modules'); return; }
    const viewerId = getViewerId();
    let audio;
    try { audio = await audiosModel.getAudioById(ctx.params.id, viewerId); } catch (_) { audio = null; }
    if (!audio) { ctx.redirect('/melody?filter=all'); return; }
    let itemSize = null;
    try { const blk = await blockchainModel.getBlockById(audio.key, viewerId); if (blk && Number.isFinite(blk.size)) itemSize = blk.size; } catch (_) {}
    ctx.body = await audioTranscodeDetailView({ audio, itemSize });
  })
  .post('/melody/transcode/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'melodyMod')) { ctx.redirect('/modules'); return; }
    if (!checkMod(ctx, 'audiosMod')) { ctx.redirect('/modules'); return; }
    const viewerId = getViewerId();
    let audio;
    try { audio = await audiosModel.getAudioById(ctx.params.id, viewerId); } catch (_) { audio = null; }
    if (!audio) { ctx.redirect('/melody?filter=all'); return; }
    const stegoPayload = await runTranscode(audio);
    const compositionIds = (audio.bcsComposition || []).map(n => n && n.id).filter(Boolean);
    const availableIds = await listAvailableBlockIds(compositionIds);
    let itemSize = null;
    try { const blk = await blockchainModel.getBlockById(audio.key, viewerId); if (blk && Number.isFinite(blk.size)) itemSize = blk.size; } catch (_) {}
    ctx.body = await audioTranscodeDetailView({ audio, decoded: true, stegoPayload, availableIds, itemSize });
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
    const effPrivateChainIds = await buildEffectivePrivateChainIds();
    for (const block of blockchainData) {
      block.restricted = isBlockRestricted(block, effPrivateChainIds);
    }
    const inspectId = String(query.inspect || '').trim();
    let inspect = null;
    if (inspectId) {
      try {
        const blk = await blockchainModel.getBlockById(inspectId, userId);
        if (blk && blk.id) {
          const sizeBytes = Number(blk.size || 0);
          const grams = (sizeBytes / (1024 * 1024)) * 0.095;
          const ecoinTax = grams * (bankingModel.ECOIN_PER_GRAM_CO2 || 0.1);
          inspect = { block: inspectId, found: true, size: sizeBytes, author: blk.author, blockType: blk.type, ecoinTax };
        }
      } catch (_) {}
      if (!inspect) {
        try {
          const ssbClient = await cooler.open();
          const raw = await new Promise((resolve, reject) => ssbClient.get(inspectId, (err, v) => err ? reject(err) : resolve(v)));
          if (raw) {
            const sizeBytes = Buffer.byteLength(JSON.stringify(raw), 'utf8');
            let bType = (raw.content && typeof raw.content === 'object' && raw.content.type) || null;
            if (!bType && typeof raw.content === 'string' && raw.content.endsWith('.box')) bType = 'encrypted';
            const grams = (sizeBytes / (1024 * 1024)) * 0.095;
            const ecoinTax = grams * (bankingModel.ECOIN_PER_GRAM_CO2 || 0.1);
            inspect = { block: inspectId, found: true, size: sizeBytes, author: raw.author, blockType: bType || 'unknown', ecoinTax };
          }
        } catch (_) {}
      }
      if (!inspect) inspect = { block: inspectId, found: false };
    }
    ctx.body = renderBlockchainView(blockchainData, filter, userId, search, { inspect });
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
    let block = await blockchainModel.getBlockById(blockId, userId);
    if (!block) block = { id: blockId, notAvailable: true };
    const viewMode = query.view || 'block';
    let restricted = false;
    if (block) {
      const effPrivateChainIds = await buildEffectivePrivateChainIds();
      restricted = isBlockRestricted(block, effPrivateChainIds);
      const c = block.content || {};
      if (!restricted && tribeCrypto && (c.encryptedPayload || tribeCrypto.isTribeMsg(c))) {
        try {
          const decrypted = await tribeCrypto.decryptFromTribe(c, tribesModel);
          if (decrypted && !decrypted._undecryptable) {
            block = { ...block, content: decrypted };
          }
        } catch (_) {}
      }
    }
    ctx.body = renderSingleBlockView(block, filter, userId, search, viewMode, restricted);
  })
  .get("/public/latest", async (ctx) => {
    if (!checkMod(ctx, 'latestMod')) { ctx.redirect('/modules'); return; }
    const messages = sanitizeMessages(await post.latest());
    ctx.body = await latestView({ messages });
  })
  .get("/public/latest/extended", async (ctx) => {
    if (!checkMod(ctx, 'extendedMod')) { ctx.redirect('/modules'); return; }
    const messages = sanitizeMessages(await post.latestExtended());
    ctx.body = await extendedView({ messages });
  })
  .get("/public/latest/topics", async (ctx) => {
    if (!checkMod(ctx, 'topicsMod')) { ctx.redirect('/modules'); return; }
    const messages = sanitizeMessages(await post.latestTopics());
    const channels = await post.channels();
    const list = channels.map((c) => {
      return li(a({ href: `/hashtag/${c}` }, `#${c}`));
    });
    const prefix = nav(ul(list));
    ctx.body = await topicsView({ messages, prefix });
  })
  .get("/public/latest/summaries", async (ctx) => {
    if (!checkMod(ctx, 'summariesMod')) { ctx.redirect('/modules'); return; }
    const messages = sanitizeMessages(await post.latestSummaries());
    ctx.body = await summaryView({ messages });
  })
  .get("/public/latest/threads", async (ctx) => {
    if (!checkMod(ctx, 'threadsMod')) { ctx.redirect('/modules'); return; }
    const messages = sanitizeMessages(await post.latestThreads());
    ctx.body = await threadsView({ messages });
  })
  .get('/author/:feed', async (ctx) => {
    const feedId = decodeURIComponent(ctx.params.feed || ''), gt = Number(ctx.request.query.gt || -1), lt = Number(ctx.request.query.lt || -1);
    if (lt > 0 && gt > 0 && gt >= lt) throw new Error('Given search range is empty');
    const visibilityPrefs = await about.visibilityPrefs(feedId).catch(() => null);
    const rawPrefs = visibilityPrefs || {};
    const needsBanking = (rawPrefs.karma !== false) || rawPrefs.ubi === true;
    const needsWallet  = rawPrefs.wallet === true;
    const needsCarbon = rawPrefs.ecoTax !== false;
    const needsLarp = rawPrefs.larpSign === true;
    const [description, name, image, messages, firstPost, lastPost, relationship, ecoAddress, bankData, allActions, carbonGrams, larpHouseKey, gpgFingerprint, lastUserActivityTs] = await Promise.all([
      about.description(feedId),
      about.name(feedId),
      about.image(feedId),
      post.fromPublicFeed(feedId, gt, lt),
      post.firstBy(feedId),
      post.latestBy(feedId),
      friend.getRelationship(feedId),
      needsWallet  ? bankingModel.getUserAddress(feedId).catch(() => null) : Promise.resolve(null),
      needsBanking ? bankingModel.getBankingData(feedId).catch(() => ({ karmaScore: 0, estimatedUBI: 0, lastClaimedDate: null, totalClaimed: 0 })) : Promise.resolve({ karmaScore: 0, estimatedUBI: 0, lastClaimedDate: null, totalClaimed: 0 }),
      activityModel.listFeed('all').catch(() => []),
      needsCarbon ? getCarbonGramsForFeed(feedId).catch(() => 0) : Promise.resolve(0),
      needsLarp ? larpModel.getUserHouse(feedId).catch(() => null) : Promise.resolve(null),
      about.gpgFingerprint(feedId).catch(() => ''),
      inhabitantsModel.getLastActivityTimestampByUserId(feedId).catch(() => null)
    ]);
    const larpHouse = larpHouseKey ? { key: larpHouseKey, ...larpModel.getHouse(larpHouseKey) } : null;
    const sanitizedMsgs = sanitizeMessages(messages);
    const userActions = (allActions || []).filter(a => a && a.author === feedId && a.type !== 'tombstone' && a.type !== 'post');
    const normTs = t => { const n = Number(t || 0); return !isFinite(n) || n <= 0 ? 0 : n < 1e12 ? n * 1000 : n; };
    const pickTs = obj => { if (!obj) return 0; const v = obj.value || obj; return normTs(v.timestamp || v.ts || v.time || v.meta?.timestamp || 0); };
    const latestFromStream = Math.max(pickTs(lastPost), pickTs(firstPost), Array.isArray(messages) && messages.length ? Math.max(...messages.map(pickTs)) : 0);
    const fullLastTs = Math.max(latestFromStream, Number(lastUserActivityTs) || 0);
    const { bucket: lastActivityBucket } = inhabitantsModel.bucketLastActivity(fullLastTs || null);
    const profileItems = await fetchProfileItems(feedId, rawPrefs);
    const profileFilterType = String(ctx.query.type || '').toLowerCase();
    ctx.body = await authorView({ feedId, messages: sanitizedMsgs, firstPost, lastPost, name, description, avatarUrl: getAvatarUrl(image), relationship, ecoAddress, karmaScore: bankData.karmaScore, estimatedUBI: bankData.estimatedUBI || 0, lastClaimedDate: bankData.lastClaimedDate || null, totalClaimed: bankData.totalClaimed || 0, carbonGrams, larpHouse, lastActivityBucket, visibilityPrefs, userActions, allActions, profileItems, profileFilterType, gpgFingerprint });
  })
  .get("/search", async (ctx) => {
    const inhabitantQ = String(ctx.query.inhabitant || '').trim();
    if (inhabitantQ && /^@[A-Za-z0-9+/_\-]{43}=\.ed25519$/.test(inhabitantQ)) {
      ctx.redirect(`/author/${encodeURIComponent(inhabitantQ)}`);
      return;
    }
    const fromTs = ctx.query.from ? new Date(ctx.query.from).getTime() : null;
    const toTs = ctx.query.to ? new Date(ctx.query.to).getTime() : null;
    const query = ctx.query.query || '';
    if (!query) return ctx.body = await searchView({ messages: [], query, types: [] });
    const userId = getViewerId();
    const allTribes = await tribesModel.listAll();
    const anonTribeIds = new Set(allTribes.filter(t => t.isAnonymous === true).map(t => t.id));
    const applySearchPrivacy = (msgs) => msgs.filter(msg => {
      const c = msg.value?.content;
      if (!c) return true;
      if (c.tribeId && anonTribeIds.has(c.tribeId)) return false;
      if (c.type === 'event' && c.isPublic === 'private' && c.organizer !== userId && !(Array.isArray(c.attendees) && c.attendees.includes(userId))) return false;
      if (c.type === 'task' && String(c.isPublic).toUpperCase() === 'PRIVATE' && c.author !== userId && !(Array.isArray(c.assignees) && c.assignees.includes(userId))) return false;
      if (c.status === 'PRIVATE') return false;
      if (c.type === 'shop' && c.visibility === 'CLOSED' && c.author !== userId) return false;
      return true;
    });
    const results = await searchModel.search({ query, types: [] });
    const cfgNow = getConfig();
    const wishMutuals = cfgNow.wish === 'mutuals';
    const wishOnlyLan = cfgNow.wish === 'only-lan';
    const mutualCache = wishMutuals ? makeCtxMutualCache() : null;
    let lanKeys = null;
    if (wishOnlyLan) {
      try {
        const ssbX = await cooler.open();
        const snapshot = await ssbX.conn.dbPeers();
        lanKeys = new Set();
        for (const entry of (snapshot || [])) {
          const data = Array.isArray(entry) ? entry[1] : entry;
          if (!data) continue;
          if (data.type === 'lan' && data.key) lanKeys.add(data.key);
        }
        lanKeys.add(userId);
      } catch (_) { lanKeys = new Set([userId]); }
    }
    const accessSets = await getViewerTribeAccessSets(userId);
    const finalResults = {};
    for (const [type, msgs] of Object.entries(results)) {
      const privacyFiltered = applySearchPrivacy(msgs).filter(msg => {
        const c = msg.value?.content;
        if (c && c.tribeId && accessSets.privateNotAccessible.has(c.tribeId)) return false;
        return true;
      });
      let after = privacyFiltered;
      if (wishMutuals) {
        const out = [];
        for (const m of privacyFiltered) {
          const a = m.value?.author || m.value?.content?.author;
          if (!a || a === userId) { out.push(m); continue; }
          if (await mutualCache(a)) out.push(m);
        }
        after = out;
      }
      if (wishOnlyLan && lanKeys) {
        after = after.filter(m => {
          const a = m.value?.author || m.value?.content?.author;
          return a && lanKeys.has(a);
        });
      }
      const mapped = after.map(msg => (!msg.value?.content) ? {} : { ...msg, content: msg.value.content, author: msg.value.content.author || 'Unknown' });
      let scoped = mapped;
      if (Number.isFinite(fromTs)) scoped = scoped.filter(m => (m.value?.timestamp || m.timestamp || 0) >= fromTs);
      if (Number.isFinite(toTs)) scoped = scoped.filter(m => (m.value?.timestamp || m.timestamp || 0) <= toTs);
      if (scoped.length > 0) finalResults[type] = scoped;
    }
    ctx.body = await searchView({ results: finalResults, query, types: [] });
  })
  .get("/images", async (ctx) => {
    if (!checkMod(ctx, 'imagesMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const items = await imagesModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const fav = await mediaFavorites.getFavoriteSet('images');
    let enriched = items.map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    await Promise.all(enriched.map(async x => { x.commentCount = (await getVoteComments(x.key)).length; }));
    const spreadMap = await spreads.forMessages(enriched.map(x => x && x.key));
    ctx.body = await imageView(enriched, filter, null, { q, sort, viewerPrefs, spreadMap });
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
    const imgAuthorPrefs = await about.visibilityPrefs(img.author).catch(() => null);
    await enrichItemLifetime(img, { key: img.key });
    ctx.body = await singleImageView({ ...img, isFavorite: fav.has(String(img.rootId || img.key)), commentCount: comments.length }, filter, comments, { q, sort, returnTo: safeReturnTo(ctx, `/images?filter=${encodeURIComponent(filter)}`, ['/images']), spreads: await spreads.forMessage(img.key), authorPrefs: imgAuthorPrefs });
  })
  .get("/maps", async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'all', q = '', lat, lng, zoom, tribeId, title, description, markerLabel, tags, mapType } = ctx.query;
    const uid = getViewerId();
    const items = await mapsModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, viewerId: uid });
    const fav = await mediaFavorites.getFavoriteSet('maps');
    let enriched = items.map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    const myTribeIds = await getUserTribeIds(uid);
    enriched = enriched.filter(x => !x.tribeId);
    enriched = await applyListFilters(enriched, ctx);
    try { enriched = await lifetime.enrichAndFilter(enriched, { getKey: (x) => x.rootId || x.key }); } catch (_) {}
    const spreadMap = await spreads.forMessages((enriched || []).map(x => x && (x.key || x.id)));
    try {
      ctx.body = await mapsView(enriched, filter, null, { q, lat, lng, zoom, title, description, markerLabel, tags, mapType, ...(tribeId ? { tribeId } : {}), spreadMap });
    } catch (e) {
      console.error("maps render:", e.message);
      ctx.body = await mapsView(enriched, filter, null, { q, spreadMap });
    }
  })
  .get("/maps/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    let mapItem;
    try { mapItem = await mapsModel.getMapById(ctx.params.id, getViewerId()); } catch (_) { ctx.redirect('/maps?filter=all'); return; }
    if (!mapItem) { ctx.redirect('/maps?filter=all'); return; }
    if (mapItem.author !== getViewerId()) { ctx.redirect(`/maps/${encodeURIComponent(mapItem.key)}`); return; }
    const fav = await mediaFavorites.getFavoriteSet('maps');
    ctx.body = await mapsView([{ ...mapItem, isFavorite: fav.has(String(mapItem.rootId || mapItem.key)) }], 'edit', mapItem.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/maps/:mapId", async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    await mapsModel.ingestKeys().catch(() => {});
    const { mapId } = ctx.params; const { filter = 'all', q = '', zoom = '0', mkLat = '', mkLng = '', label: mkMarkerLabel = '' } = ctx.query;
    const uid = getViewerId();
    let mapItem;
    try {
      mapItem = await mapsModel.getMapById(mapId, uid);
    } catch (e) {
      ctx.redirect('/maps?filter=all');
      return;
    }
    if (!mapItem) { ctx.redirect('/maps?filter=all'); return; }
    const fav = await mediaFavorites.getFavoriteSet('maps');
    let tribeMembers = [];
    let parentTribe = null;
    if (mapItem.tribeId) {
      try {
        parentTribe = await tribesModel.getTribeById(mapItem.tribeId);
        if (!parentTribe.members.includes(uid)) { ctx.body = tribeAccessDeniedView(parentTribe); return; }
        tribeMembers = parentTribe.members;
      } catch { ctx.redirect('/tribes'); return; }
    } else {
      const members = Array.isArray(mapItem.members) ? mapItem.members : [];
      const mt = String(mapItem.mapType || '').toUpperCase();
      const isOpenAccess = mt === 'OPEN' || mt === 'SINGLE';
      if (!isOpenAccess && mapItem.author !== uid && !members.includes(uid)) { ctx.redirect('/maps?filter=all'); return; }
    }
    if (String(mapItem.mapType || '').toUpperCase() === 'CLOSED' && mapItem.author !== uid) {
      ctx.body = tribeAccessDeniedView(parentTribe); return;
    }
    ctx.body = await singleMapView({ ...mapItem, isFavorite: fav.has(String(mapItem.rootId || mapItem.key)) }, filter, { q, zoom, mkLat, mkLng, mkMarkerLabel, tribeMembers, returnTo: safeReturnTo(ctx, `/maps?filter=${encodeURIComponent(filter)}`, ['/maps']) });
  })
  .get("/audios", async (ctx) => {
    if (!checkMod(ctx, 'audiosMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const items = await audiosModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const fav = await mediaFavorites.getFavoriteSet('audios');
    let enriched = items.map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    await Promise.all(enriched.map(async x => { x.commentCount = (await getVoteComments(x.key)).length; }));
    const spreadMap = await spreads.forMessages(enriched.map(x => x && x.key));
    ctx.body = await audioView(enriched, filter, null, { q, sort, viewerPrefs, spreadMap });
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
    const audioAuthorPrefs = await about.visibilityPrefs(audio.author).catch(() => null);
    await enrichItemLifetime(audio, { key: audio.key });
    ctx.body = await singleAudioView({ ...audio, isFavorite: fav.has(String(audio.rootId || audio.key)), commentCount: comments.length }, filter, comments, { q, sort, returnTo: safeReturnTo(ctx, `/audios?filter=${encodeURIComponent(filter)}`, ['/audios']), spreads: await spreads.forMessage(audio.key), authorPrefs: audioAuthorPrefs });
  })
  .get("/torrents", async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'all', q = '', sort = 'recent', tribeId = '' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const items = await torrentsModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const fav = await mediaFavorites.getFavoriteSet('torrents');
    let enriched = items.filter(x => !x.tribeId).map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    const spreadMap = await spreads.forMessages((enriched || []).map(x => x && x.key));
    ctx.body = await torrentsView(enriched, filter, null, { q, sort, viewerPrefs, ...(tribeId ? { tribeId } : {}), spreadMap });
  })
  .get("/torrents/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    const torrent = await torrentsModel.getTorrentById(ctx.params.id, getViewerId());
    const fav = await mediaFavorites.getFavoriteSet('torrents');
    ctx.body = await torrentsView([{ ...torrent, isFavorite: fav.has(String(torrent.rootId || torrent.key)) }], 'edit', torrent.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/torrents/:torrentId", async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    const { torrentId } = ctx.params; const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const torrent = await torrentsModel.getTorrentById(torrentId, getViewerId());
    const fav = await mediaFavorites.getFavoriteSet('torrents');
    const comments = await getVoteComments(torrent.key);
    const torrentAuthorPrefs = await about.visibilityPrefs(torrent.author).catch(() => null);
    await enrichItemLifetime(torrent, { key: torrent.key });
    ctx.body = await singleTorrentView({ ...torrent, isFavorite: fav.has(String(torrent.rootId || torrent.key)), commentCount: comments.length }, filter, comments, { q, sort, returnTo: safeReturnTo(ctx, `/torrents?filter=${encodeURIComponent(filter)}`, ['/torrents']), spreads: await spreads.forMessage(torrent.key), authorPrefs: torrentAuthorPrefs });
  })
  .get("/videos", async (ctx) => {
    if (!checkMod(ctx, 'videosMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const items = await videosModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const fav = await mediaFavorites.getFavoriteSet('videos');
    let enriched = items.map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    await Promise.all(enriched.map(async x => { x.commentCount = (await getVoteComments(x.key)).length; }));
    const spreadMap = await spreads.forMessages(enriched.map(x => x && x.key));
    ctx.body = await videoView(enriched, filter, null, { q, sort, viewerPrefs, spreadMap });
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
    const videoAuthorPrefs = await about.visibilityPrefs(video.author).catch(() => null);
    await enrichItemLifetime(video, { key: video.key });
    ctx.body = await singleVideoView({ ...video, isFavorite: fav.has(String(video.rootId || video.key)), commentCount: comments.length }, filter, comments, { q, sort, returnTo: safeReturnTo(ctx, `/videos?filter=${encodeURIComponent(filter)}`, ['/videos']), spreads: await spreads.forMessage(video.key), authorPrefs: videoAuthorPrefs });
  })
  .get("/documents", async (ctx) => {
    const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const items = await documentsModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort });
    const fav = await mediaFavorites.getFavoriteSet('documents');
    let enriched = items.map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    await Promise.all(enriched.map(async x => { x.commentCount = (await getVoteComments(x.rootId || x.key)).length; }));
    const spreadMap = await spreads.forMessages(enriched.map(x => x && x.key));
    ctx.body = await documentView(enriched, filter, null, { q, sort, viewerPrefs, spreadMap });
  })
  .get("/documents/edit/:id", async (ctx) => {
    const doc = await documentsModel.getDocumentById(ctx.params.id);
    const fav = await mediaFavorites.getFavoriteSet('documents');
    ctx.body = await documentView([{ ...doc, isFavorite: fav.has(String(doc.rootId || doc.key)) }], 'edit', doc.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/documents/:documentId", async (ctx) => {
    const { filter = "all", q = "", sort = "recent" } = ctx.query;
    const document = await documentsModel.getDocumentById(ctx.params.documentId);
    const fav = await mediaFavorites.getFavoriteSet('documents');
    Object.assign(document, { isFavorite: fav.has(String(document.rootId || document.key)) });
    const comments = await getVoteComments(document.rootId || document.key);
    const docAuthorPrefs = await about.visibilityPrefs(document.author).catch(() => null);
    await enrichItemLifetime(document, { key: document.key });
    ctx.body = await singleDocumentView(withCount(document, comments), filter, comments, {
      q, sort,
      returnTo: safeReturnTo(ctx, `/documents/${encodeURIComponent(document.key)}?filter=${encodeURIComponent(filter)}${q ? `&q=${encodeURIComponent(q)}` : ""}${sort ? `&sort=${encodeURIComponent(sort)}` : ""}`, ["/documents"]),
      spreads: await spreads.forMessage(document.key),
      authorPrefs: docAuthorPrefs
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
    let messages = sanitizeMessages(await pmModel.listAllPrivate());
    const cfgNow = getConfig();
    if (cfgNow.pmVisibility === 'mutuals') {
      const viewer = getViewerId();
      const mutualCache = new Map();
      const isMutual = async (id) => {
        if (id === viewer) return true;
        if (mutualCache.has(id)) return mutualCache.get(id);
        let rel;
        try { rel = await friend.getRelationship(id); } catch (e) { rel = null; }
        const m = !!(rel && rel.following && rel.followsMe);
        mutualCache.set(id, m);
        return m;
      };
      const filtered = [];
      for (const msg of messages) {
        const author = msg?.value?.author || msg?.author;
        if (author === viewer) { filtered.push(msg); continue; }
        if (await isMutual(author)) filtered.push(msg);
      }
      messages = filtered;
    }
    await refreshInboxCount(messages);
    ctx.body = await privateView({ messages }, ctx.query.filter || undefined);
  })
  .get('/tags', async ctx => {
    const filter = qf(ctx), tags = await tagsModel.listTags(filter);
    ctx.body = await tagsView(tags, filter);
  })
  .get('/reports', async ctx => {
    const filter = qf(ctx);
    let reports = await enrichWithComments(await reportsModel.listAll());
    reports = await applyListFilters(reports, ctx);
    try { reports = await lifetime.enrichAndFilter(reports); } catch (_) {}
    await enrichMsgSize(reports);
    const spreadMap = await spreads.forMessages((reports || []).map(x => x && (x.id || x.key)));
    ctx.body = await reportView(reports, filter, null, ctx.query.category || '', { spreadMap });
  })
  .get('/reports/edit/:id', async ctx => {
    const report = await reportsModel.getReportById(ctx.params.id);
    ctx.body = await reportView([report], 'edit', ctx.params.id);
  })
  .get('/reports/:reportId', async ctx => {
    const { reportId } = ctx.params, filter = qf(ctx), report = await reportsModel.getReportById(reportId);
    const comments = await getVoteComments(reportId);
    await enrichMsgSize([report]);
    await enrichItemLifetime(report);
    ctx.body = await singleReportView(withCount(report, comments), filter, comments, { spreads: await spreads.forMessage(report.id).catch(() => null) });
  })
  .get('/trending', async (ctx) => {
    const filter = qf(ctx, 'RECENT');
    let { filtered = [] } = await trendingModel.listTrending(filter);
    filtered = await applyListFilters(filtered, ctx);
    const spreadMap = new Map();
    const results = await Promise.all(filtered.map(it => it && it.key ? spreads.forMessage(it.key).catch(() => null) : Promise.resolve(null)));
    filtered.forEach((it, i) => { if (it && it.key && results[i]) spreadMap.set(it.key, results[i]); });
    ctx.body = await trendingView(filtered, filter, trendingModel.categories, spreadMap);
  })
  .get('/agenda', async (ctx) => {
    const filter = qf(ctx);
    let data = await agendaModel.listAgenda(filter);
    if (Array.isArray(data)) data = await applyListFilters(data, ctx);
    ctx.body = await agendaView(data, filter);
  })
  .get("/hashtag/:hashtag", async (ctx) => {
    const { hashtag } = ctx.params;
    const messages = sanitizeMessages(await post.fromHashtag(hashtag));
    ctx.body = await hashtagView({ hashtag, messages });
   })
  .get('/inhabitants', async (ctx) => {
    const filter = qf(ctx);
    const query = { search: ctx.query.search || '' };
    const userId = getViewerId();
    if (filter === 'pending') {
      try { await scanPendingFollows(userId); } catch (e) {}
      const pending = viewerFilters.listPending();
      const enriched = await Promise.all(pending.map(async (p) => {
        let name = p.followerId;
        try { name = await about.name(p.followerId); } catch (_) {}
        return { ...p, name };
      }));
      ctx.body = renderPendingFollows(enriched);
      return;
    }
    if (['CVs', 'MATCHSKILLS'].includes(filter)) {
      Object.assign(query, {
        location: ctx.query.location || '',
        language: ctx.query.language || '',
        skills: ctx.query.skills || ''
      });
    }
    const inhabitants = await inhabitantsModel.listInhabitants({ filter, ...query });
    const [addresses, karmaList] = await Promise.all([
      bankingModel.listAddressesMerged(),
      Promise.all(
        inhabitants.map(async (u) => {
        try {
          const bank = await bankingModel.getBankingData(u.id);
          return { id: u.id, karmaScore: bank?.karmaScore || 0, estimatedUBI: bank?.estimatedUBI || 0, lastClaimedDate: bank?.lastClaimedDate || null, totalClaimed: bank?.totalClaimed || 0 };
        } catch {
          return { id: u.id, karmaScore: 0, estimatedUBI: 0, lastClaimedDate: null, totalClaimed: 0 };
        }
        })
      )
    ]);
    const activityList = await Promise.all(
      inhabitants.map(async (u) => {
        try {
          const ts = await inhabitantsModel.getLastActivityTimestampByUserId(u.id);
          const { bucket } = inhabitantsModel.bucketLastActivity(ts || null);
          return { id: u.id, lastActivityBucket: bucket };
        } catch {
          return { id: u.id, lastActivityBucket: 'red' };
        }
      })
    );
    const prefsList = await Promise.all(
      inhabitants.map(async (u) => {
        try { return { id: u.id, prefs: await about.visibilityPrefs(u.id) }; }
        catch { return { id: u.id, prefs: null }; }
      })
    );
    const relList = await Promise.all(
      inhabitants.map(async (u) => {
        try { return { id: u.id, rel: await friend.getRelationship(u.id) }; }
        catch { return { id: u.id, rel: null }; }
      })
    );
    const gpgList = await Promise.all(
      inhabitants.map(async (u) => {
        try { return { id: u.id, fp: await about.gpgFingerprint(u.id) }; }
        catch { return { id: u.id, fp: '' }; }
      })
    );
    const carbonList = await Promise.all(
      inhabitants.map(async (u) => {
        try { return { id: u.id, carbon: await getCarbonGramsForFeed(u.id) }; }
        catch { return { id: u.id, carbon: 0 }; }
      })
    );
    const larpHouseByUser = await (async () => {
      const ssbX = await cooler.open();
      return new Promise((resolve) => {
        const byAuthor = new Map();
        pull(
          ssbX.createLogStream({ reverse: true }),
          pull.drain((m) => {
            const c = m && m.value && m.value.content;
            if (!c || c.type !== 'larpJoinHouse') return;
            const a = m.value.author;
            const ts = m.value.timestamp || 0;
            const prev = byAuthor.get(a);
            if (!prev || ts > prev.ts) byAuthor.set(a, { house: c.house, ts });
          }, () => {
            const out = new Map();
            for (const [a, v] of byAuthor.entries()) out.set(a, v.house);
            resolve(out);
          })
        );
      });
    })();
    const addrMap = new Map(addresses.map(x => [x.id, x.address]));
    const karmaMap = new Map(karmaList.map(x => [x.id, { karmaScore: x.karmaScore, estimatedUBI: x.estimatedUBI, lastClaimedDate: x.lastClaimedDate, totalClaimed: x.totalClaimed }]));
    const activityMap = new Map(activityList.map(x => [x.id, x.lastActivityBucket]));
    const prefsMap = new Map(prefsList.map(x => [x.id, x.prefs]));
    const relMap = new Map(relList.map(x => [x.id, x.rel]));
    const gpgMap = new Map(gpgList.map(x => [x.id, x.fp]));
    const carbonMap = new Map(carbonList.map(x => [x.id, x.carbon]));
    let enriched = inhabitants.map(u => {
      const kd = karmaMap.get(u.id) || {};
      const lhKey = larpHouseByUser.get(u.id) || 'academia';
      const lh = larpModel.getHouse(lhKey);
      return {
        ...u,
        ecoAddress: addrMap.get(u.id) || null,
        karmaScore: kd.karmaScore ?? (typeof u.karmaScore === 'number' ? u.karmaScore : 0),
        estimatedUBI: kd.estimatedUBI || 0,
        lastClaimedDate: kd.lastClaimedDate || null,
        totalClaimed: kd.totalClaimed || 0,
        lastActivityBucket: activityMap.get(u.id),
        visibilityPrefs: prefsMap.get(u.id) || null,
        relationship: relMap.get(u.id) || null,
        larpHouse: lh ? { key: lhKey, ...lh } : null,
        gpgFingerprint: gpgMap.get(u.id) || '',
        carbonGrams: carbonMap.get(u.id) || 0
      };
    });
    enriched = enriched.filter(u => u.id === userId || u.lastActivityBucket !== 'red');
    if (filter === 'TOP KARMA') {
      enriched = enriched.sort((a, b) => (b.karmaScore || 0) - (a.karmaScore || 0));
    }
    if (filter === 'TOP ACTIVITY') {
      const order = { green: 0, orange: 1, red: 2 };
      enriched = enriched.sort(
        (a, b) => (order[a.lastActivityBucket] ?? 3) - (order[b.lastActivityBucket] ?? 3)
      );
    }
    ctx.body = await inhabitantsView(enriched, filter, query, userId);
  })
  .get('/inhabitant/:id', async (ctx) => {
    const id = ctx.params.id;
    const aboutModel = about;
    const [aboutMsg, cv, feed, photo, bank, lastTs, visibilityPrefs, carbonGrams, larpHouseKey] = await Promise.all([
      inhabitantsModel.getLatestAboutById(id),
      inhabitantsModel.getCVByUserId(id),
      inhabitantsModel.getFeedByUserId(id),
      inhabitantsModel.getPhotoUrlByUserId(id, 256),
      bankingModel.getBankingData(id).catch(() => ({ karmaScore: 0 })),
      inhabitantsModel.getLastActivityTimestampByUserId(id).catch(() => null),
      aboutModel.visibilityPrefs(id).catch(() => null),
      getCarbonGramsForFeed(id).catch(() => 0),
      larpModel.getUserHouse(id).catch(() => null)
    ]);
    const larpHouse = larpHouseKey ? { key: larpHouseKey, ...larpModel.getHouse(larpHouseKey) } : null;
    const bucketInfo = inhabitantsModel.bucketLastActivity(lastTs || null);
    const currentUserId = getViewerId();
    const karmaScore = bank && typeof bank.karmaScore === 'number' ? bank.karmaScore : 0;
    const estimatedUBI = bank?.estimatedUBI || 0;
    const lastClaimedDate = bank?.lastClaimedDate || null;
    const totalClaimed = bank?.totalClaimed || 0;
    ctx.body = await inhabitantsProfileView({ about: aboutMsg, cv, feed, photo, karmaScore, estimatedUBI, lastClaimedDate, totalClaimed, carbonGrams, larpHouse, lastActivityBucket: bucketInfo.bucket, viewedId: id, visibilityPrefs }, currentUserId);
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
      inhabitantsModel.listInhabitants({ filter: 'all', includeInactive: true })
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
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const filter = qf(ctx), search = ctx.query.search || '';
    let tribes = await tribesModel.listTribesForViewer(uid);
    let filteredTribes = search ? tribes.filter(t => t.title.toLowerCase().includes(search.toLowerCase())) : tribes;
    try { filteredTribes = await lifetime.enrichAndFilter(filteredTribes, { getKey: (x) => x.id || x.key }); } catch (_) {}
    ctx.body = await tribesView(filteredTribes, filter, null, ctx.query, tribes);
  })
  .get('/tribes/create', async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    ctx.body = await tribesView([], 'create', null)
  })
  .get('/tribes/edit/:id', async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id)
    ctx.body = await tribesView([tribe], 'edit', ctx.params.id)
  })
  .get('/tribe/:tribeId', async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    await tribesModel.forceSync().catch(() => {});
    await tribesModel.processIncomingKeys().catch(() => {});
    await tribesModel.ensureTribeKeyDistribution(ctx.params.tribeId).catch(() => {});
    await tribesModel.ensureFollowTribeMembers(ctx.params.tribeId).catch(() => {});
    await tribesModel.pruneOrphanKeys().catch(() => {});
    const listByTribeAllChain = async (tribeId, contentType) => {
      const chainIds = await tribesModel.getChainIds(tribeId).catch(() => [tribeId]);
      const results = await Promise.all(chainIds.map(id => tribesContentModel.listByTribe(id, contentType).catch(() => [])));
      const seen = new Set();
      return results.flat().filter(item => { const k = item.id || item.key; if (seen.has(k)) return false; seen.add(k); return true; });
    };
    const tribe = await tribesModel.getTribeById(ctx.params.tribeId).catch(() => null);
    if (!tribe) { ctx.redirect('/tribes'); return; }
    const uid = getViewerId();
    const query = { feedFilter: 'TOP', ...ctx.query };
    if (tribe.isAnonymous === true && !tribe.members.includes(uid)) {
      ctx.redirect('/tribes');
      return;
    }
    const section = ctx.query.section || 'activity';
    const contentTypeMap = { events: 'event', tasks: 'task', reports: 'report', votations: 'votation', market: 'market', jobs: 'job', projects: 'project', media: 'media' };
    const mediaSections = { 'media-audio': 'media', 'media-video': 'media', 'media-images': 'media', 'media-documents': 'media', 'media-bookmarks': 'media', 'images': 'media', 'audios': 'media', 'videos': 'media', 'documents': 'media', 'bookmarks': 'media' };
    let sectionData = null;
    if (section === 'inhabitants') {
      const allInhabitants = await inhabitantsModel.listInhabitants({ filter: 'all', includeInactive: true });
      sectionData = allInhabitants.filter(u => tribe.members.includes(u.id));
    } else if (section === 'feed') {
      sectionData = await listByTribeAllChain(tribe.id, 'feed').catch(() => []);
    } else if (section === 'forum') {
      const forums = await listByTribeAllChain(tribe.id, 'forum');
      const replies = await listByTribeAllChain(tribe.id, 'forum-reply');
      sectionData = [...forums, ...replies];
    } else if (section === 'subtribes') {
      sectionData = await tribesModel.listSubTribes(tribe.id, uid);
    } else if (mediaSections[section]) {
      sectionData = await listByTribeAllChain(tribe.id, 'media');
    } else if (contentTypeMap[section]) {
      sectionData = await listByTribeAllChain(tribe.id, contentTypeMap[section]);
    } else if (section === 'activity') {
      const allContent = await listByTribeAllChain(tribe.id, null);
      const subTribes = await tribesModel.listSubTribes(tribe.id, uid);
      const subContent = [];
      for (const st of subTribes) {
        const stItems = await listByTribeAllChain(st.id, null).catch(() => []);
        subContent.push(...stItems.map(item => ({ ...item, tribeName: st.title })));
      }
      const [allPadsRaw, allChatsRaw, allCalsRaw, allMapsRaw, allTorrentsRaw, tribeChain] = await Promise.all([
        padsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        chatsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        calendarsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        mapsModel.listAll({ filter: 'all', q: '', viewerId: uid }).catch(() => []),
        torrentsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        tribesModel.getChainIds(tribe.id).catch(() => [tribe.id])
      ]);
      const tribeChainSet = new Set(tribeChain);
      const toStandalone = (type, url) => (item) => ({ contentType: type, id: item.rootId || item.key, title: item.title || '', author: item.author, createdAt: item.createdAt, directUrl: url(item) });
      const standaloneItems = [
        ...allPadsRaw.filter(p => tribeChainSet.has(p.tribeId)).map(toStandalone('pad', p => `/pads/${encodeURIComponent(p.rootId)}`)),
        ...allChatsRaw.filter(c => tribeChainSet.has(c.tribeId)).map(toStandalone('chat', c => `/chats/${encodeURIComponent(c.rootId || c.key)}`)),
        ...allCalsRaw.filter(c => tribeChainSet.has(c.tribeId)).map(toStandalone('calendar', c => `/calendars/${encodeURIComponent(c.rootId)}`)),
        ...allMapsRaw.filter(m => tribeChainSet.has(m.tribeId)).map(toStandalone('map', m => `/maps/${encodeURIComponent(m.key || m.id)}`)),
        ...allTorrentsRaw.filter(t => tribeChainSet.has(t.tribeId)).map(toStandalone('torrent', t => `/torrents/${encodeURIComponent(t.rootId || t.key)}`))
      ];
      const combined = [...allContent, ...subContent, ...standaloneItems];
      const allInhabitants = await inhabitantsModel.listInhabitants({ filter: 'all', includeInactive: true });
      const allMembers = [...new Set([...tribe.members, ...subTribes.flatMap(st => st.members || [])])];
      const memberMap = new Map(allInhabitants.filter(u => allMembers.includes(u.id)).map(u => [u.id, u]));
      const activities = combined.map(item => ({ ...item, authorName: memberMap.get(item.author)?.name || item.author, timestamp: Date.parse(item.createdAt) || item._ts || 0 })).sort((a, b) => b.timestamp - a.timestamp);
      sectionData = { activities, memberMap };
    } else if (section === 'trending') {
      const allContent = await listByTribeAllChain(tribe.id, null);
      const period = ctx.query.period || 'all';
      let items = allContent.filter(i => i.contentType !== 'forum-reply' && i.contentType !== 'pixelia');
      if (period === 'day') items = items.filter(i => (Date.parse(i.createdAt) || i._ts || 0) >= Date.now() - 86400000);
      else if (period === 'week') items = items.filter(i => (Date.parse(i.createdAt) || i._ts || 0) >= Date.now() - 7 * 86400000);
      items.sort((a, b) => {
        const score = i => (i.refeeds || 0) + (Array.isArray(i.attendees) ? i.attendees.length : 0) + Object.values(i.votes || {}).reduce((s, arr) => s + (Array.isArray(arr) ? arr.length : 0), 0) + (Array.isArray(i.assignees) ? i.assignees.length : 0) + (Array.isArray(i.opinions_inhabitants) ? i.opinions_inhabitants.length : 0);
        return score(b) - score(a);
      });
      sectionData = { items, period };
    } else if (section === 'tags') {
      const allContent = await listByTribeAllChain(tribe.id, null);
      const [allPadsT, allChatsT, allCalsT, allMapsT, allTorrentsT, subTribesT, tribeChainT] = await Promise.all([
        padsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        chatsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        calendarsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        mapsModel.listAll({ filter: 'all', q: '', viewerId: uid }).catch(() => []),
        torrentsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        tribesModel.listSubTribes(tribe.id, uid).catch(() => []),
        tribesModel.getChainIds(tribe.id).catch(() => [tribe.id])
      ]);
      const tribeChainSetT = new Set(tribeChainT);
      const standaloneTagged = [
        ...allPadsT.filter(p => tribeChainSetT.has(p.tribeId)).map(p => ({ ...p, contentType: 'pad', id: p.rootId || p.key })),
        ...allChatsT.filter(c => tribeChainSetT.has(c.tribeId)).map(c => ({ ...c, contentType: 'chat', id: c.rootId || c.key })),
        ...allCalsT.filter(c => tribeChainSetT.has(c.tribeId)).map(c => ({ ...c, contentType: 'calendar', id: c.rootId || c.key })),
        ...allMapsT.filter(m => tribeChainSetT.has(m.tribeId)).map(m => ({ ...m, contentType: 'map', id: m.rootId || m.key })),
        ...allTorrentsT.filter(t => tribeChainSetT.has(t.tribeId)).map(t => ({ ...t, contentType: 'torrent', id: t.rootId || t.key })),
        ...subTribesT.map(st => ({ ...st, contentType: 'tribe', tags: Array.isArray(st.tags) ? st.tags : [], title: st.title, description: st.description, author: st.author, createdAt: st.createdAt }))
      ];
      const allTaggable = [...allContent, ...standaloneTagged];
      const tagMap = new Map();
      for (const item of allTaggable) {
        for (const tag of (item.tags || []).filter(Boolean)) {
          const lower = String(tag).toLowerCase().trim();
          if (!lower) continue;
          if (!tagMap.has(lower)) tagMap.set(lower, { tag: lower, count: 0, items: [] });
          const entry = tagMap.get(lower);
          entry.count++;
          entry.items.push(item);
        }
      }
      const selectedTag = (ctx.query.tag || '').toLowerCase().trim();
      sectionData = { tags: [...tagMap.values()].sort((a, b) => b.count - a.count), selectedTag, filteredItems: selectedTag && tagMap.has(selectedTag) ? tagMap.get(selectedTag).items : [] };
    } else if (section === 'maps') {
      const [allMaps, tribeChain] = await Promise.all([
        mapsModel.listAll({ filter: 'all', q: '', viewerId: uid }).catch(() => []),
        tribesModel.getChainIds(tribe.id).catch(() => [tribe.id])
      ]);
      const tribeChainSet = new Set(tribeChain);
      sectionData = allMaps.filter(m => tribeChainSet.has(m.tribeId));
    } else if (section === 'pads') {
      const [allPads, tribeChain] = await Promise.all([
        padsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        tribesModel.getChainIds(tribe.id).catch(() => [tribe.id])
      ]);
      const tribeChainSet = new Set(tribeChain);
      sectionData = allPads.filter(p => tribeChainSet.has(p.tribeId));
    } else if (section === 'chats') {
      const [allChats, tribeChain] = await Promise.all([
        chatsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        tribesModel.getChainIds(tribe.id).catch(() => [tribe.id])
      ]);
      const tribeChainSet = new Set(tribeChain);
      sectionData = allChats.filter(c => tribeChainSet.has(c.tribeId));
    } else if (section === 'calendars') {
      const [allCals, tribeChain] = await Promise.all([
        calendarsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        tribesModel.getChainIds(tribe.id).catch(() => [tribe.id])
      ]);
      const tribeChainSet = new Set(tribeChain);
      sectionData = allCals.filter(c => tribeChainSet.has(c.tribeId));
    } else if (section === 'torrents') {
      const [allTorrents, tribeChain] = await Promise.all([
        torrentsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        tribesModel.getChainIds(tribe.id).catch(() => [tribe.id])
      ]);
      const tribeChainSet = new Set(tribeChain);
      const standaloneTorrents = allTorrents.filter(t => tribeChainSet.has(t.tribeId));
      const mediaTorrents = (await listByTribeAllChain(tribe.id, 'media').catch(() => []))
        .filter(m => m.mediaType === 'torrent')
        .map(m => ({
          key: m.id,
          rootId: m.id,
          title: m.title || '',
          description: m.description || '',
          url: m.image || '',
          tags: Array.isArray(m.tags) ? m.tags : [],
          author: m.author,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          tribeId: m.tribeId,
          _isMedia: true
        }));
      sectionData = [...standaloneTorrents, ...mediaTorrents].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (section === 'search') {
      const sq = (ctx.query.q || '').trim().toLowerCase();
      let results = [];
      if (sq.length >= 2) {
        const allContent = await listByTribeAllChain(tribe.id, null);
        results = allContent.filter(item => (item.title || '').toLowerCase().includes(sq) || (item.description || '').toLowerCase().includes(sq) || (item.tags || []).join(' ').toLowerCase().includes(sq));
      }
      sectionData = { query: ctx.query.q || '', results };
    } else if (section === 'opinions') {
      const allContent = await listByTribeAllChain(tribe.id, null);
      const opinionated = allContent.filter(i => i.opinions && Object.keys(i.opinions).length > 0).sort((a, b) => {
        const sum = o => Object.values(o.opinions || {}).reduce((s, n) => s + n, 0);
        return sum(b) - sum(a);
      });
      sectionData = { items: allContent.filter(i => i.contentType !== 'forum-reply' && i.contentType !== 'pixelia'), opinionated };
    } else if (section === 'pixelia') {
      const pixels = await listByTribeAllChain(tribe.id, 'pixelia');
      const coordMap = new Map();
      for (const px of pixels) { const existing = coordMap.get(px.title); if (!existing || (Date.parse(px.createdAt) || 0) > (Date.parse(existing.createdAt) || 0)) coordMap.set(px.title, px); }
      sectionData = { pixels: [...coordMap.values()] };
    } else if (section === 'overview') {
      const events = await listByTribeAllChain(tribe.id, 'event').catch(() => []);
      const tasks = await listByTribeAllChain(tribe.id, 'task').catch(() => []);
      const feed = await listByTribeAllChain(tribe.id, 'feed').catch(() => []);
      sectionData = { events, tasks, feed };
    } else if (section === 'governance') {
      if (tribe.parentTribeId) { ctx.redirect(`/tribe/${encodeURIComponent(tribe.id)}?section=activity`); return; }
      const gf = String(ctx.query.filter || 'government');
      const isCreator = tribe.author === uid;
      const isMember = Array.isArray(tribe.members) && tribe.members.includes(uid);
      if (isCreator) { try { await parliamentModel.tribe.ensureTerm(tribe.id); } catch (_) {} }
      const [term, candidatures, rules, globalTermBase] = await Promise.all([
        parliamentModel.tribe.getCurrentTerm(tribe.id).catch(() => null),
        parliamentModel.tribe.listCandidatures(tribe.id).catch(() => []),
        parliamentModel.tribe.listRules(tribe.id).catch(() => []),
        parliamentModel.getCurrentTerm().catch(() => null)
      ]);
      const globalStart = globalTermBase?.startAt || null;
      const alreadyPublishedThisGlobalCycle = await parliamentModel.tribe.hasCandidatureInGlobalCycle(tribe.id, globalStart).catch(() => false);
      const leaders = Array.isArray(term?.leaders) ? term.leaders : [];
      const hasElectedCandidate = Array.isArray(candidatures) && candidatures.some(c => (c.status || 'OPEN') === 'OPEN' && Number(c.votes || 0) > 0);
      sectionData = { filter: gf, term, candidatures, rules, leaders, isCreator, isMember, canPublishToGlobal: isMember || isCreator, alreadyPublishedThisGlobalCycle, hasElectedCandidate };
    }
    const subTribes = await tribesModel.listSubTribes(tribe.id, uid);
    tribe.subTribes = subTribes;
    if (tribe.parentTribeId) {
      try { tribe.parentTribe = await tribesModel.getTribeById(tribe.parentTribeId); } catch (_) {}
    }
    const resolveItemMentions = async (items) => {
      if (!Array.isArray(items)) return items;
      for (const item of items) {
        if (item.description) item.description = await resolveMentionText(item.description);
      }
      return items;
    };
    if (Array.isArray(sectionData)) {
      await resolveItemMentions(sectionData);
    } else if (sectionData && typeof sectionData === 'object') {
      if (sectionData.activities) await resolveItemMentions(sectionData.activities);
      if (sectionData.items) await resolveItemMentions(sectionData.items);
      if (sectionData.results) await resolveItemMentions(sectionData.results);
      if (sectionData.events) await resolveItemMentions(sectionData.events);
      if (sectionData.tasks) await resolveItemMentions(sectionData.tasks);
      if (sectionData.feed) await resolveItemMentions(sectionData.feed);
    }
    ctx.body = await tribeView(tribe, uid, query, section, sectionData);
  })
  .get('/activity', async ctx => {
    const filter = qf(ctx, 'recent'), userId = getViewerId();
    const q = String((ctx.query && ctx.query.q) || '');
    try { await bankingModel.ensureSelfAddressPublished(); } catch (_) {}
    try { await bankingModel.getUserEngagementScore(userId); } catch (_) {}
    let allActions = await activityModel.listFeed('all');
    for (const action of allActions) {
      if (action.type === 'pad') {
        const c = action.value?.content || action.content || {};
        const rootId = action.id || action.key || '';
        const decrypted = await padsModel.decryptContent(c, rootId);
        if (decrypted.title) {
          if (action.value?.content) { action.value.content.title = decrypted.title; action.value.content.deadline = decrypted.deadline; }
          else if (action.content) { action.content.title = decrypted.title; action.content.deadline = decrypted.deadline; }
        }
      }
    }
    allActions = await applyListFilters(allActions, ctx);
    const spreadMap = new Map();
    const SPREADABLE = new Set(['post','audio','video','image','document','torrent','bookmark','event','calendar','task','votes','vote','market','shop','shopProduct','project','transfer','job','report','chat','chatMessage','pad','padEntry','forum','map']);
    const targets = (allActions || []).filter(a => a && a.id && typeof a.id === 'string' && a.id.startsWith('%') && /\.sha256$/.test(a.id) && SPREADABLE.has(a.type));
    const results = await Promise.all(targets.map(a => spreads.forMessage(a.id).catch(() => null)));
    targets.forEach((a, i) => { if (results[i]) spreadMap.set(a.id, results[i]); });
    ctx.body = activityView(allActions, filter, userId, q, { spreadMap });
  })
  .get("/profile", async (ctx) => {
    const myFeedId = await meta.myFeedId(), gt = Number(ctx.request.query.gt || -1), lt = Number(ctx.request.query.lt || -1);
    if (lt > 0 && gt > 0 && gt >= lt) throw new Error("Given search range is empty");
    const visibilityPrefs = await about.visibilityPrefs(myFeedId).catch(() => null);
    const rawPrefs = visibilityPrefs || {};
    const needsBanking = (rawPrefs.karma !== false) || rawPrefs.ubi === true;
    const needsWallet  = rawPrefs.wallet === true;
    const needsCarbon  = rawPrefs.ecoTax !== false;
    const needsLarp    = rawPrefs.larpSign === true;
    const [description, name, image, messages, firstPost, lastPost, ecoAddress, bankData, allActions, carbonGrams, larpHouseKey, gpgFingerprint, lastUserActivityTs] = await Promise.all([
      about.description(myFeedId),
      about.name(myFeedId),
      about.image(myFeedId),
      post.fromPublicFeed(myFeedId, gt, lt),
      post.firstBy(myFeedId),
      post.latestBy(myFeedId),
      needsWallet  ? bankingModel.getUserAddress(myFeedId).catch(() => null) : Promise.resolve(null),
      needsBanking ? bankingModel.getBankingData(myFeedId).catch(() => ({ karmaScore: 0, estimatedUBI: 0, lastClaimedDate: null, totalClaimed: 0 })) : Promise.resolve({ karmaScore: 0, estimatedUBI: 0, lastClaimedDate: null, totalClaimed: 0 }),
      activityModel.listFeed('all').catch(() => []),
      needsCarbon ? getCarbonGramsForFeed(myFeedId).catch(() => 0) : Promise.resolve(0),
      needsLarp ? larpModel.getUserHouse(myFeedId).catch(() => null) : Promise.resolve(null),
      about.gpgFingerprint(myFeedId).catch(() => ''),
      inhabitantsModel.getLastActivityTimestampByUserId(myFeedId).catch(() => null)
    ]);
    const larpHouse = larpHouseKey ? { key: larpHouseKey, ...larpModel.getHouse(larpHouseKey) } : null;
    const userActions = (allActions || []).filter(a => a && a.author === myFeedId && a.type !== 'tombstone' && a.type !== 'post');
    const normTs = t => { const n = Number(t || 0); return !isFinite(n) || n <= 0 ? 0 : n < 1e12 ? n * 1000 : n; };
    const pickTs = obj => { if (!obj) return 0; const v = obj.value || obj; return normTs(v.timestamp || v.ts || v.time || v.meta?.timestamp || 0); };
    const postActivityTs = Math.max(Array.isArray(messages) && messages.length ? Math.max(...messages.map(pickTs)) : 0, pickTs(lastPost), pickTs(firstPost));
    const lastActivityTs = Math.max(postActivityTs, Number(lastUserActivityTs) || 0);
    const { bucket: lastActivityBucket } = inhabitantsModel.bucketLastActivity(lastActivityTs || null);
    const baseUrl = resolveExternalBaseUrl(ctx);
    const profileItems = await fetchProfileItems(myFeedId, rawPrefs);
    const profileFilterType = String(ctx.query.type || '').toLowerCase();
    ctx.body = await authorView({ feedId: myFeedId, messages: sanitizeMessages(messages), firstPost, lastPost, name, description, avatarUrl: getAvatarUrl(image), relationship: { me: true }, ecoAddress, karmaScore: bankData.karmaScore, estimatedUBI: bankData.estimatedUBI || 0, lastClaimedDate: bankData.lastClaimedDate || null, totalClaimed: bankData.totalClaimed || 0, carbonGrams, larpHouse, lastActivityBucket, visibilityPrefs, baseUrl, userActions, allActions, profileItems, profileFilterType, gpgFingerprint });
  })
  .get("/profile/edit", async (ctx) => {
    const myFeedId = await meta.myFeedId();
    const [visibilityPrefs, name, description, gpgFingerprint] = await Promise.all([
      about.visibilityPrefs(myFeedId).catch(() => null),
      about.name(myFeedId).catch(() => ''),
      about.description(myFeedId).catch(() => ''),
      about.gpgFingerprint(myFeedId).catch(() => '')
    ]);
    ctx.body = await editProfileView({
      name,
      description,
      visibilityPrefs: visibilityPrefs || {},
      feedId: myFeedId,
      baseUrl: resolveExternalBaseUrl(ctx),
      gpgFingerprint
    });
  })
  .post("/profile/edit", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const imageFile = ctx.request.files?.image;
    const mime = imageFile?.mimetype || imageFile?.type || '';
    const isImage = mime.startsWith('image/');
    const imageData = isImage && imageFile?.filepath ? await promisesFs.readFile(imageFile.filepath).catch(() => undefined) : undefined;
    const gpgFile = ctx.request.files?.gpgKey;
    let gpgKeyFingerprint;
    let gpgKeyBlob;
    if (gpgFile?.filepath && Number(gpgFile.size || 0) > 0) {
      if (Number(gpgFile.size) > 51200) throw new Error("GPG key file too large (max 50KB)");
      const raw = await promisesFs.readFile(gpgFile.filepath, 'utf8').catch(() => '');
      const armored = String(raw || '').trim();
      if (armored) {
        if (!armored.includes('-----BEGIN PGP PUBLIC KEY BLOCK-----')) {
          throw new Error("Invalid GPG key: only armored public keys are accepted");
        }
        if (armored.includes('-----BEGIN PGP PRIVATE KEY BLOCK-----')) {
          throw new Error("Refusing to publish a private GPG key");
        }
        const openpgp = require('../server/node_modules/openpgp');
        const parsed = await openpgp.readKey({ armoredKey: armored }).catch(() => null);
        if (!parsed) throw new Error("Could not parse GPG key");
        if (parsed.isPrivate && parsed.isPrivate()) throw new Error("Refusing to publish a private GPG key");
        gpgKeyFingerprint = String(parsed.getFingerprint() || '').toUpperCase();
        gpgKeyBlob = Buffer.from(armored, 'utf8');
        const myFeedId = await meta.myFeedId();
        const keysDir = path.join(ssbConfig.path, 'keys');
        await promisesFs.mkdir(keysDir, { recursive: true }).catch(() => {});
        const safeName = encodeURIComponent(myFeedId) + '.asc';
        await promisesFs.writeFile(path.join(keysDir, safeName), armored, 'utf8');
      }
    }
    const body = ctx.request.body || {};
    const flag = (v) => v === '1' || v === 'on' || v === true;
    const clearnetShops     = flag(body.vis_clearnetShops);
    const clearnetJobs      = flag(body.vis_clearnetJobs);
    const clearnetEvents    = flag(body.vis_clearnetEvents);
    const clearnetProjects  = flag(body.vis_clearnetProjects);
    const clearnetPosts     = flag(body.vis_clearnetPosts);
    const clearnetAudios    = flag(body.vis_clearnetAudios);
    const clearnetVideos    = flag(body.vis_clearnetVideos);
    const clearnetImages    = flag(body.vis_clearnetImages);
    const clearnetDocuments = flag(body.vis_clearnetDocuments);
    const clearnetTorrents  = flag(body.vis_clearnetTorrents);
    const clearnetBookmarks = flag(body.vis_clearnetBookmarks);
    const profileShops      = flag(body.vis_profileShops);
    const profileJobs       = flag(body.vis_profileJobs);
    const profileEvents     = flag(body.vis_profileEvents);
    const profileProjects   = flag(body.vis_profileProjects);
    const profilePosts      = flag(body.vis_profilePosts);
    const profileAudios     = flag(body.vis_profileAudios);
    const profileVideos     = flag(body.vis_profileVideos);
    const profileImages     = flag(body.vis_profileImages);
    const profileDocuments  = flag(body.vis_profileDocuments);
    const profileTorrents   = flag(body.vis_profileTorrents);
    const profileBookmarks  = flag(body.vis_profileBookmarks);
    const visibilityPrefs = {
      activity: flag(body.vis_activity),
      device:   flag(body.vis_device),
      karma:    flag(body.vis_karma),
      ubi:      flag(body.vis_ubi),
      wallet:   flag(body.vis_wallet),
      ecoTax:   flag(body.vis_ecoTax),
      larpSign: flag(body.vis_larpSign),
      gpg:      flag(body.vis_gpg),
      clearnet: clearnetShops || clearnetJobs || clearnetEvents || clearnetProjects || clearnetPosts || clearnetAudios || clearnetVideos || clearnetImages || clearnetDocuments || clearnetTorrents || clearnetBookmarks,
      clearnetShops,
      clearnetJobs,
      clearnetEvents,
      clearnetProjects,
      clearnetPosts,
      clearnetAudios,
      clearnetVideos,
      clearnetImages,
      clearnetDocuments,
      clearnetTorrents,
      clearnetBookmarks,
      profileShops,
      profileJobs,
      profileEvents,
      profileProjects,
      profilePosts,
      profileAudios,
      profileVideos,
      profileImages,
      profileDocuments,
      profileTorrents,
      profileBookmarks
    };
    await post.publishProfileEdit({
      name: stripDangerousTags(String(body.name || '')),
      description: stripDangerousTags(String(body.description || '')),
      image: imageData,
      visibilityPrefs,
      gpgFingerprint: gpgKeyFingerprint,
      gpgBlob: gpgKeyBlob
    });
    ctx.redirect("/profile");
  })
  .post("/profile/gpg/remove", koaBody(), async (ctx) => {
    const myFeedId = await meta.myFeedId();
    const keyPath = path.join(ssbConfig.path, 'keys', encodeURIComponent(myFeedId) + '.asc');
    await promisesFs.unlink(keyPath).catch(() => {});
    await post.publishProfileEdit({ gpgFingerprint: '', gpgBlobId: '' });
    ctx.redirect("/profile");
  })
  .get("/profile/:feed/gpg.asc", async (ctx) => {
    const feedId = ctx.params.feed;
    const blobId = await about.gpgBlobId(feedId).catch(() => '');
    let armored = '';
    if (blobId) {
      const ssbX = await cooler.open();
      armored = await new Promise((resolve) => {
        const chunks = [];
        pull(
          ssbX.blobs.get(blobId),
          pull.collect((err, arr) => {
            if (err || !arr) return resolve('');
            for (const ch of arr) chunks.push(Buffer.isBuffer(ch) ? ch : Buffer.from(ch));
            resolve(Buffer.concat(chunks).toString('utf8'));
          })
        );
      });
    }
    if (!armored) {
      const keyPath = path.join(ssbConfig.path, 'keys', encodeURIComponent(feedId) + '.asc');
      armored = await promisesFs.readFile(keyPath, 'utf8').catch(() => '');
    }
    if (!armored) { ctx.status = 404; ctx.body = ''; return; }
    ctx.set('Content-Type', 'application/pgp-keys; charset=utf-8');
    ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(feedId)}.asc"`);
    ctx.body = armored;
  })
  .post("/profile/clearnet-toggle", koaBody(), async (ctx) => {
    const myFeedId = await meta.myFeedId();
    const current = await about.visibilityPrefs(myFeedId).catch(() => null) || {};
    const subKeys = [
      'clearnetShops', 'clearnetJobs', 'clearnetEvents', 'clearnetProjects',
      'clearnetPosts', 'clearnetAudios', 'clearnetVideos', 'clearnetImages',
      'clearnetDocuments', 'clearnetTorrents'
    ];
    const anyEnabled = subKeys.some(k => current[k] === true) || current.clearnet === true;
    const nextOn = !anyEnabled;
    const nextPrefs = { ...current, clearnet: nextOn };
    for (const k of subKeys) nextPrefs[k] = nextOn;
    try {
      await post.publishProfileEdit({ visibilityPrefs: nextPrefs });
    } catch (e) { console.error('profile/clearnet-toggle:', e.message); }
    ctx.redirect('/profile');
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
  .get("/c/blob/:cnBlobId", async (ctx) => {
    const blobId = ctx.params.cnBlobId;
    if (!isBlob(blobId)) { ctx.status = 404; ctx.body = ''; return; }
    let buffer;
    try { buffer = await blob.getResolved({ blobId }); } catch (_) {}
    if (!buffer) {
      ctx.status = 404; ctx.body = ''; return;
    }
    let mime = 'application/octet-stream';
    try {
      const ft = await FileType.fromBuffer(buffer);
      if (ft && ft.mime) mime = ft.mime;
    } catch (_) {}
    if (mime === 'application/octet-stream' && buffer.length > 10 && buffer[0] === 0x64) {
      const head = buffer.slice(0, 128).toString('ascii');
      if (head.includes('announce') || head.includes('8:announce') || head.includes('4:info')) mime = 'application/x-bittorrent';
    }
    ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
    if (mime.startsWith('image/') && typeof sharp === 'function') {
      try {
        const img = sharp(buffer, { failOn: 'none' });
        const meta = await img.metadata().catch(() => ({}));
        const format = (meta.format && ['jpeg','png','webp','avif','gif'].includes(meta.format)) ? meta.format : 'jpeg';
        const out = await img.rotate().toFormat(format).toBuffer();
        ctx.type = `image/${format === 'jpeg' ? 'jpeg' : format}`;
        ctx.body = out;
        return;
      } catch (_) {}
    }
    ctx.type = mime;
    if (mime === 'application/x-bittorrent') {
      ctx.set('Content-Disposition', `attachment; filename="download.torrent"`);
    }
    ctx.body = buffer;
  })
  .get("/qr/:feedId", async (ctx) => {
    const feedId = decodeURIComponent(ctx.params.feedId || '');
    const reqSize = parseInt(ctx.query.size, 10);
    const width = Number.isFinite(reqSize) ? Math.max(64, Math.min(512, reqSize)) : 240;
    try {
      const QRCode = require('../server/node_modules/qrcode');
      const targetUrl = `oasis://author/${encodeURIComponent(feedId)}`;
      const buf = await QRCode.toBuffer(targetUrl, { type: 'png', width, margin: 1, errorCorrectionLevel: 'M' });
      ctx.set('Content-Type', 'image/png');
      ctx.set('Cache-Control', 'public, max-age=86400');
      ctx.body = buf;
    } catch (e) {
      ctx.status = 500;
      ctx.body = '';
    }
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
    const cfg = getConfig(), theme = ctx.cookies.get("theme") || "Dark-SNH";
    ctx.body = await settingsView({ theme, version: version.toString(), aiPrompt: cfg.ai?.prompt || "" });
  })
  .get("/peers", async (ctx) => {
    const { discoveredPeers, unknownPeers } = await meta.discovered();
    const lanBroadcastActive = !ssbConfig.pub;
    const peerMap = new Map();
    const mergePeer = (key, info) => {
      if (!key) return;
      const prev = peerMap.get(key) || {};
      peerMap.set(key, {
        key,
        host: info.host || prev.host || null,
        port: info.port || prev.port || null,
        state: info.state || prev.state || 'idle',
        stateChange: info.stateChange || prev.stateChange || null,
        source: info.source || prev.source || null
      });
    };
    try {
      const gossipPathLocal = path.join(os.homedir(), '.ssb', 'gossip.json');
      let gossip = [];
      try { gossip = JSON.parse(await promisesFs.readFile(gossipPathLocal, 'utf8')); } catch (_) {}
      if (Array.isArray(gossip)) {
        for (const g of gossip) {
          if (!g || !g.key) continue;
          mergePeer(g.key, { host: g.host, port: g.port, state: g.state, stateChange: g.stateChange, source: 'gossip.json' });
        }
      }
    } catch (_) {}
    try {
      const ssbX = await cooler.open();
      try {
        const gp = (ssbX.gossip && typeof ssbX.gossip.peers === 'function') ? ssbX.gossip.peers() : [];
        for (const p of (gp || [])) {
          if (!p || !p.key) continue;
          mergePeer(p.key, { host: p.host, port: p.port, state: p.state, stateChange: p.stateChange, source: 'gossip' });
        }
      } catch (_) {}
      try {
        const snapshot = (ssbX.conn && typeof ssbX.conn.dbPeers === 'function') ? await ssbX.conn.dbPeers() : [];
        for (const entry of (snapshot || [])) {
          const data = Array.isArray(entry) ? entry[1] : entry;
          const addr = Array.isArray(entry) ? entry[0] : null;
          if (!data || !data.key) continue;
          let host = data.host, port = data.port;
          if ((!host || !port) && addr) {
            const m = String(addr).match(/^net:([^:]+):(\d+)/);
            if (m) { host = host || m[1]; port = port || Number(m[2]); }
          }
          mergePeer(data.key, { host, port, state: data.state, stateChange: data.stateChange, source: 'conn.dbPeers' });
        }
      } catch (_) {}
      try {
        const livePeers = (ssbX.peers && typeof ssbX.peers === 'object') ? ssbX.peers : {};
        for (const rawKey of Object.keys(livePeers)) {
          if (!rawKey || rawKey === ssbX.id) continue;
          const rpcs = livePeers[rawKey];
          if (!Array.isArray(rpcs) || rpcs.length === 0) continue;
          const addr = rpcs[0]?.stream?.address || null;
          let host = null, port = null;
          if (addr) {
            const m = String(addr).match(/^net:([^:]+):(\d+)/);
            if (m) { host = m[1]; port = Number(m[2]); }
          }
          mergePeer(rawKey, { host, port, state: 'connected', source: 'rpc' });
        }
      } catch (_) {}
      try {
        if (ssbX.conn && typeof ssbX.conn.stagedPeers === 'function') {
          const staged = await new Promise((resolve) => {
            try {
              pull(
                ssbX.conn.stagedPeers(),
                pull.take(1),
                pull.collect((err, results) => {
                  if (err || !results || !results[0]) return resolve([]);
                  resolve(Array.isArray(results[0]) ? results[0] : []);
                })
              );
            } catch (_) { resolve([]); }
          });
          for (const entry of staged) {
            const data = Array.isArray(entry) ? entry[1] : entry;
            const addr = Array.isArray(entry) ? entry[0] : null;
            if (!data || !data.key) continue;
            let host = data.host, port = data.port;
            if ((!host || !port) && addr) {
              const m = String(addr).match(/^net:([^:]+):(\d+)/);
              if (m) { host = host || m[1]; port = port || Number(m[2]); }
            }
            mergePeer(data.key, { host, port, state: 'staged', source: data.type === 'lan' ? 'lan' : (data.type || 'staged') });
          }
        }
      } catch (_) {}
    } catch (_) {}
    const technicalPeers = Array.from(peerMap.values()).sort((a, b) => (a.state === 'connected' ? -1 : 1) - (b.state === 'connected' ? -1 : 1));
    ctx.body = await peersView({ onlinePeers: await meta.onlinePeers(), discoveredPeers, unknownPeers, lanBroadcastActive, technicalPeers });
  })
  .get("/graphos", async (ctx) => {
    if (!checkMod(ctx, 'graphosMod')) return ctx.redirect('/modules');
    try {
      const ssbForLan = await cooler.open();
      try { if (ssbForLan.lan && typeof ssbForLan.lan.stop === 'function') ssbForLan.lan.stop(); } catch (_) {}
      try { if (ssbForLan.lan && typeof ssbForLan.lan.start === 'function') ssbForLan.lan.start(); } catch (_) {}
    } catch (_) {}
    const filter = String(ctx.query?.filter || 'ALL').toUpperCase() === 'MINE' ? 'MINE' : 'ALL';
    const onlinePeers = await meta.onlinePeers();
    const { discoveredPeers, unknownPeers } = filter === 'MINE'
      ? { discoveredPeers: [], unknownPeers: [] }
      : await meta.discovered();
    const ssb = await require('../client/gui')({ offline: require('../server/ssb_config').offline }).open();
    const myId = ssb.id;
    const shortId = (key) => {
      const core = String(key).replace(/^@/, '').replace(/\.ed25519$/, '');
      return '@' + core.slice(0, 8) + '…';
    };
    const resolveName = async (key) => {
      try {
        const n = await about.name(key);
        if (!n) return shortId(key);
        if (n === 'Redacted') return shortId(key);
        if (n === String(key).replace(/^@/, '').slice(0, 8)) return shortId(key);
        return n;
      } catch {
        return shortId(key);
      }
    };
    const seen = new Set([myId]);
    const collected = [];
    const collect = (entries, kind) => {
      for (const [, data] of entries) {
        if (!data || !data.key || seen.has(data.key)) continue;
        seen.add(data.key);
        collected.push({ key: data.key, kind });
      }
    };
    collect(onlinePeers, 'online');
    collect(discoveredPeers, 'discovered');
    collect(unknownPeers, 'unknown');
    const peers = await Promise.all(collected.map(async (p) => ({
      key: p.key,
      name: await resolveName(p.key),
      kind: p.kind
    })));
    const me = { key: myId, name: await resolveName(myId), kind: 'online' };
    const kpis = {
      total: peers.length + 1,
      online: onlinePeers.length + 1,
      discovered: discoveredPeers.length,
      unknown: unknownPeers.length
    };
    ctx.body = await graphosView({ filter, me, peers, kpis });
  })
  .get("/larp", async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    const rawFilter = String(ctx.query?.filter || 'ruling').toLowerCase();
    const filter = rawFilter === 'houses' ? 'houses' : rawFilter === 'rules' ? 'rules' : 'ruling';
    const myFeedId = await meta.myFeedId();
    const [houses, myHouseKey] = await Promise.all([
      larpModel.listHousesWithCounts(),
      larpModel.getUserHouse(myFeedId).catch(() => null)
    ]);
    const cycle = larpModel.computeCycle();
    const governingKey = larpModel.getGoverningHouseKey();
    const governingHouseRaw = larpModel.getHouse(governingKey);
    const governingHouse = { key: governingKey, ...governingHouseRaw, memberCount: (houses.find(h => h.key === governingKey) || {}).memberCount || 0 };
    let governingMembers = [];
    let governingPosts = [];
    if (filter === 'ruling') {
      [governingMembers, governingPosts] = await Promise.all([
        larpModel.getMembersOfHouse(governingKey),
        larpModel.listHousePosts(governingKey, { viewerHouse: myHouseKey, isGoverning: true })
      ]);
    }
    const canPost = myHouseKey === governingKey;
    ctx.body = larpListView({ filter, houses, myHouseKey, cycle, governingKey, governingHouse, governingMembers, governingPosts, canPost });
  })
  .get("/larp/test", async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    const myFeedId = await meta.myFeedId();
    const [myHouseKey, houses, testStatus] = await Promise.all([
      larpModel.getUserHouse(myFeedId).catch(() => null),
      larpModel.listHousesWithCounts(),
      larpModel.canTakeTest(myFeedId)
    ]);
    if (myHouseKey !== 'academia') return ctx.redirect(myHouseKey ? `/larp/${encodeURIComponent(myHouseKey)}` : '/larp');
    const cycle = larpModel.computeCycle();
    const governingKey = larpModel.getGoverningHouseKey();
    const questions = testStatus.allowed ? larpModel.getProfileTest() : [];
    ctx.body = larpTestView({ questions, cycle, houses, myHouseKey, governingKey, testStatus });
  })
  .post("/larp/test", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    const myFeedId = await meta.myFeedId();
    const myHouseKey = await larpModel.getUserHouse(myFeedId).catch(() => null);
    if (myHouseKey !== 'academia') return ctx.redirect(myHouseKey ? `/larp/${encodeURIComponent(myHouseKey)}` : '/larp');
    const body = ctx.request.body || {};
    const answers = [];
    for (let i = 0; i < larpModel.TEST_QUESTIONS_COUNT; i += 1) {
      const raw = body[`q${i}`];
      const n = parseInt(raw, 10);
      answers.push(Number.isFinite(n) ? n : -1);
    }
    let result = null;
    try { result = await larpModel.submitProfileTest({ answers }); } catch (_) { result = null; }
    if (!result || result.ok === false) return ctx.redirect('/larp/test');
    const [houses, cycle] = [await larpModel.listHousesWithCounts(), larpModel.computeCycle()];
    const governingKey = larpModel.getGoverningHouseKey();
    const houseKey = result.house || 'academia';
    const houseRaw = larpModel.getHouse(houseKey) || {};
    const house = { key: houseKey, ...houseRaw };
    ctx.body = larpTestResultView({ house, result, cycle, houses, myHouseKey: houseKey, governingKey });
  })
  .get("/larp/test/:house", async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    return ctx.redirect('/larp/test');
  })
  .post("/larp/invite/create", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    const houseKey = String((ctx.request.body && ctx.request.body.house) || '').toLowerCase();
    let result = null;
    try { result = await larpModel.createHouseInvite(houseKey); } catch (_) { result = null; }
    if (!result) return ctx.redirect(`/larp/${encodeURIComponent(houseKey || '')}`);
    ctx.redirect(`/larp/${encodeURIComponent(houseKey)}?invite=${encodeURIComponent(result.code)}`);
  })
  .post("/larp/invite/redeem", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    const code = String((ctx.request.body && ctx.request.body.code) || '').trim();
    const ret = String((ctx.request.body && ctx.request.body.returnTo) || '').trim();
    let result = null;
    try { result = await larpModel.redeemHouseInvite(code); } catch (_) { result = null; }
    if (result && result.ok) return ctx.redirect(`/larp/${encodeURIComponent(result.house)}`);
    const back = ret && ret.startsWith('/') ? ret : '/larp';
    ctx.redirect(back);
  })
  .get("/larp/:house", async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    const houseKey = String(ctx.params.house || '').toLowerCase();
    const houseRaw = larpModel.getHouse(houseKey);
    if (!houseRaw) return ctx.redirect('/larp');
    const myFeedId = await meta.myFeedId();
    const [members, myHouseKey, houses] = await Promise.all([
      larpModel.getMembersOfHouse(houseKey),
      larpModel.getUserHouse(myFeedId).catch(() => null),
      larpModel.listHousesWithCounts()
    ]);
    const cycle = larpModel.computeCycle();
    const governingKey = larpModel.getGoverningHouseKey();
    const canPost = myHouseKey === houseKey;
    const posts = await larpModel.listHousePosts(houseKey, { viewerHouse: myHouseKey, isGoverning: houseKey === governingKey });
    const testStatus = houseKey === 'academia' ? await larpModel.canTakeTest(myFeedId) : null;
    const questions = (houseKey === 'academia' && myHouseKey === 'academia' && testStatus && testStatus.allowed)
      ? larpModel.getProfileTest() : [];
    const house = { key: houseKey, ...houseRaw };
    const rawInvite = String(ctx.query?.invite || '').trim();
    const inviteCode = /^[0-9a-f]{32}$/i.test(rawInvite) && myHouseKey === houseKey ? rawInvite : null;
    ctx.body = larpHouseView({ house, members, myHouseKey, cycle, governingKey, houses, posts, canPost, testStatus, inviteCode, questions });
  })
  .post("/larp/join", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    const houseKey = String((ctx.request.body && ctx.request.body.house) || '').toLowerCase();
    if (houseKey !== 'academia') { ctx.redirect('/larp'); return; }
    try { await larpModel.publishJoin('academia'); } catch (_) {}
    ctx.redirect('/larp/academia');
  })
  .post("/larp/leave", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    try { await larpModel.publishLeaveLarp(); } catch (_) {}
    ctx.redirect('/larp');
  })
  .get("/larp/tribe/:house", async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    const houseKey = String(ctx.params.house || '').toLowerCase();
    const myFeedId = await meta.myFeedId();
    const myHouseKey = await larpModel.getUserHouse(myFeedId).catch(() => null);
    if (myHouseKey !== houseKey) return ctx.redirect(`/larp/${encodeURIComponent(houseKey)}`);
    let tribe = null;
    try { tribe = await larpModel.ensureHouseTribe(houseKey); } catch (_) {}
    if (!tribe || !tribe.id) return ctx.redirect(`/larp/${encodeURIComponent(houseKey)}`);
    ctx.redirect(`/tribe/${encodeURIComponent(tribe.id)}`);
  })
  .post("/larp/post", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    const b = ctx.request.body || {};
    const houseKey = String(b.house || '').toLowerCase();
    const text = stripDangerousTags(String(b.text || ''));
    const myFeedId = await meta.myFeedId();
    const myHouseKey = await larpModel.getUserHouse(myFeedId).catch(() => null);
    if (myHouseKey !== houseKey || houseKey === 'academia') { ctx.redirect('/larp'); return; }
    try { await larpModel.publishHousePost({ house: houseKey, text }); } catch (_) {}
    ctx.redirect(`/larp/${encodeURIComponent(houseKey)}`);
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
    const tribeMentions = [];
    try {
      const allTribes = await tribesModel.listAll();
      const myTribes = allTribes.filter(t => t.members.includes(myFeedId));
      for (const t of myTribes) {
        const items = await tribesContentModel.listByTribe(t.id, null).catch(() => []);
        for (const item of items) {
          const text = (item.description || '') + ' ' + (item.title || '');
          if (text.includes(myFeedId) || text.includes(myFeedId.slice(1))) {
            tribeMentions.push({
              key: item.id,
              value: {
                author: item.author,
                timestamp: Date.parse(item.createdAt) || item._ts || Date.now(),
                content: {
                  type: 'tribe-content',
                  text: item.description || item.title || '',
                  tribeId: t.id,
                  tribeName: t.title,
                  contentType: item.contentType,
                  mentions: { _self: [{ link: myFeedId }] }
                }
              }
            });
          }
        }
      }
    } catch (_) {}
    const combined = [...(Array.isArray(messages) ? messages : []), ...tribeMentions];
    for (const msg of combined) {
      if (!msg.value) continue;
      const authorId = msg.value.author;
      if (authorId) {
        if (!msg.value.meta) msg.value.meta = {};
        if (!msg.value.meta.author) msg.value.meta.author = {};
        if (!msg.value.meta.author.name) {
          try { msg.value.meta.author.name = await about.name(authorId); } catch (_) {}
        }
      }
    }
    ctx.body = await mentionsView({ messages: combined, myFeedId });
  })
  .get('/opinions', async (ctx) => {
    const filter = qf(ctx, 'RECENT');
    let opinions = await opinionsModel.listOpinions(filter);
    if (Array.isArray(opinions)) opinions = await applyListFilters(opinions, ctx);
    const spreadMap = new Map();
    const list = Array.isArray(opinions) ? opinions : [];
    const results = await Promise.all(list.map(it => it && it.key ? spreads.forMessage(it.key).catch(() => null) : Promise.resolve(null)));
    list.forEach((it, i) => { if (it && it.key && results[i]) spreadMap.set(it.key, results[i]); });
    ctx.body = await opinionsView(opinions, filter, spreadMap);
  })
  .get("/feed", async (ctx) => {
    const filter = String(ctx.query.filter || "ALL").toUpperCase();
    const q = typeof ctx.query.q === "string" ? ctx.query.q : "";
    const tag = typeof ctx.query.tag === "string" ? ctx.query.tag : "";
    const msg = typeof ctx.query.msg === "string" ? ctx.query.msg : "";
    let feeds = await feedModel.listFeeds({ filter, q, tag });
    feeds = await applyListFilters(feeds, ctx);
    ctx.body = feedView(feeds, { filter, q, tag, msg });
  })
  .get("/feed/create", async (ctx) => {
    const q = typeof ctx.query.q === "string" ? ctx.query.q : "";
    const tag = typeof ctx.query.tag === "string" ? ctx.query.tag : "";
    ctx.body = feedCreateView({ q, tag });
  })
  .get("/feed/:feedId", async (ctx) => {
    const feed = await feedModel.getFeedById(ctx.params.feedId);
    if (!feed) { ctx.redirect('/feed'); return; }
    const comments = await feedModel.getComments(ctx.params.feedId).catch(() => []);
    ctx.body = singleFeedView(feed, comments);
  })
  .get('/forum', async ctx => {
    if (!checkMod(ctx, 'forumMod')) { ctx.redirect('/modules'); return; }
    const filter = qf(ctx, 'hot');
    let forums = await forumModel.listAll(filter);
    forums = await applyListFilters(forums, ctx);
    try { forums = await lifetime.enrichAndFilter(forums); } catch (_) {}
    const spreadMap = await spreads.forMessages((forums || []).map(x => x && (x.key || x.id)));
    ctx.body = await forumView(forums, filter, { spreadMap });
  })
  .get('/forum/:forumId', async ctx => {
    const msg = await forumModel.getMessageById(ctx.params.forumId), isReply = Boolean(msg.root), forumId = isReply ? msg.root : ctx.params.forumId;
    const spreadInfo = await spreads.forMessage(forumId).catch(() => null);
    ctx.body = await singleForumView(await forumModel.getForumById(forumId), await forumModel.getMessagesByForumId(forumId), ctx.query.filter, isReply ? ctx.params.forumId : null, { spreads: spreadInfo });
  })
  .get('/legacy', async (ctx) => {
    if (!checkMod(ctx, 'legacyMod')) return ctx.redirect('/modules');
    try { ctx.body = await legacyView(); } catch (error) { sendErrorPage(ctx, error.message); }
  })
  .get('/bookmarks', async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) return ctx.redirect('/modules');
    const filter = qf(ctx), q = ctx.query.q || '', sort = ctx.query.sort || 'recent', viewerId = getViewerId();
    const favs = await mediaFavorites.getFavoriteSet("bookmarks");
    let bookmarks = (await bookmarksModel.listAll({ viewerId, filter: filter === "favorites" ? "all" : filter, q, sort })).map(b => ({ ...b, isFavorite: favs.has(String(b.rootId || b.id)) }));
    if (filter === "favorites") bookmarks = bookmarks.filter(b => b.isFavorite);
    bookmarks = await applyListFilters(bookmarks, ctx);
    await enrichWithComments(bookmarks, 'rootId');
    const spreadMap = await spreads.forMessages((bookmarks || []).map(x => x && (x.id || x.key)));
    ctx.body = await bookmarkView(bookmarks, filter, null, { q, sort, spreadMap });
  })
  .get("/bookmarks/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) return ctx.redirect('/modules');
    const bookmark = await bookmarksModel.getBookmarkById(ctx.params.id, getViewerId()), favs = await mediaFavorites.getFavoriteSet("bookmarks");
    ctx.body = await bookmarkView([{ ...bookmark, isFavorite: favs.has(String(bookmark.rootId || bookmark.id)) }], "edit", bookmark.id, { returnTo: ctx.query.returnTo || "" });
  })
  .get('/bookmarks/:bookmarkId', async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) return ctx.redirect('/modules');
    const filter = qf(ctx), q = ctx.query.q || '', sort = ctx.query.sort || 'recent', favs = await mediaFavorites.getFavoriteSet("bookmarks");
    const bookmark = await bookmarksModel.getBookmarkById(ctx.params.bookmarkId), root = bookmark.rootId || bookmark.id, comments = await getVoteComments(root);
    await enrichItemLifetime(bookmark);
    ctx.body = await singleBookmarkView({ ...bookmark, commentCount: comments.length, isFavorite: favs.has(String(root)) }, filter, comments, { q, sort, returnTo: safeReturnTo(ctx, `/bookmarks?filter=${encodeURIComponent(filter)}`, ['/bookmarks']), spreads: await spreads.forMessage(bookmark.id) });
  })
  .get('/tasks', async ctx => {
    const filter = qf(ctx);
    let tasks = await enrichWithComments(await tasksModel.listAll());
    tasks = await applyListFilters(tasks, ctx);
    try { tasks = await lifetime.enrichAndFilter(tasks); } catch (_) {}
    await enrichMsgSize(tasks);
    const spreadMap = await spreads.forMessages((tasks || []).map(x => x && (x.id || x.key)));
    ctx.body = await taskView(tasks, filter, null, ctx.query.returnTo, { spreadMap });
  })
  .get('/tasks/edit/:id', async ctx => {
    const id = ctx.params.id;
    const task = await tasksModel.getTaskById(id);
    ctx.body = await taskView(task, 'edit', id, ctx.query.returnTo);
  })
  .get('/tasks/:taskId', async ctx => {
    const { taskId } = ctx.params, filter = qf(ctx), task = await tasksModel.getTaskById(taskId);
    const comments = await getVoteComments(taskId);
    await enrichMsgSize([task]);
    await enrichItemLifetime(task);
    ctx.body = await singleTaskView(withCount(task, comments), filter, comments, { spreads: await spreads.forMessage(task.id).catch(() => null) });
  })
  .get('/events', async (ctx) => {
    if (!checkMod(ctx, 'eventsMod')) { ctx.redirect('/modules'); return; }
    const filter = qf(ctx);
    let events = await enrichWithComments(await eventsModel.listAll(null, filter));
    events = await applyListFilters(events, ctx);
    try { events = await lifetime.enrichAndFilter(events); } catch (_) {}
    await enrichMsgSize(events);
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const spreadMap = await spreads.forMessages((events || []).map(x => x && (x.id || x.key)));
    ctx.body = await eventView(events, filter, null, ctx.query.returnTo, { viewerPrefs, spreadMap });
  })
  .get('/events/edit/:id', async (ctx) => {
    if (!checkMod(ctx, 'eventsMod')) { ctx.redirect('/modules'); return; }
    const eventId = ctx.params.id;
    const event = await eventsModel.getEventById(eventId);
    ctx.body = await eventView([event], 'edit', eventId, ctx.query.returnTo);
  })
  .get('/events/:eventId', async ctx => {
    await eventsModel.ingestKeys().catch(() => {});
    const { eventId } = ctx.params, filter = qf(ctx), event = await eventsModel.getEventById(eventId);
    const [comments, mapData, linkedCalendarId] = await Promise.all([
      getVoteComments(eventId),
      resolveMapUrl(event.mapUrl),
      calendarsModel.findCalendarByLinkText(`/events/${eventId}`).catch(() => null)
    ]);
    await enrichMsgSize([event]);
    await enrichItemLifetime(event, { author: event.organizer });
    const evAuthorPrefs2 = await about.visibilityPrefs(event.organizer).catch(() => null);
    ctx.body = await singleEventView(withCount(event, comments), filter, comments, { mapData, baseUrl: resolveExternalBaseUrl(ctx), authorPrefs: evAuthorPrefs2, linkedCalendarId, spreads: await spreads.forMessage(event.id).catch(() => null) });
  })
  .get('/c/events/:eventId', async (ctx) => {
    let event;
    try { event = await eventsModel.getEventById(ctx.params.eventId); } catch (_) {}
    if (!event || String(event.status || '').toUpperCase() === 'CLOSED' || event.isPublic === 'private') {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const evAuthorPrefs = await about.visibilityPrefs(event.organizer).catch(() => null);
    if (!evAuthorPrefs || evAuthorPrefs.clearnetEvents !== true) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = await clearnetEventView(event);
  })
  .get('/votes', async ctx => {
    const filter = qf(ctx);
    let voteList = await enrichWithComments(await votesModel.listAll(filter));
    voteList = await applyListFilters(voteList, ctx);
    try { voteList = await lifetime.enrichAndFilter(voteList, { getAuthor: (x) => x.createdBy }); } catch (_) {}
    await enrichMsgSize(voteList);
    const spreadMap = await spreads.forMessages((voteList || []).map(x => x && (x.id || x.key)));
    ctx.body = await voteView(voteList, filter, null, [], filter, { spreadMap });
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
    await enrichMsgSize([voteData]);
    await enrichItemLifetime(voteData, { author: voteData.createdBy });
    ctx.body = await voteView([withCount(voteData, comments)], 'detail', voteId, comments, filter, { spreads: await spreads.forMessage(voteId).catch(() => null) });
  })
  .get("/market", async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const filter = qf(ctx), q = ctx.query.q || "", minPrice = ctx.query.minPrice ?? "", maxPrice = ctx.query.maxPrice ?? "", sort = ctx.query.sort || "recent";
    let marketItems = await marketModel.listAllItems("all");
    await marketModel.checkAuctionItemsStatus(marketItems);
    marketItems = await marketModel.listAllItems("all");
    await enrichWithComments(marketItems);
    marketItems = await applyListFilters(marketItems, ctx);
    if (String(filter || '').toUpperCase() !== 'MINE') {
      try { marketItems = await lifetime.enrichAndFilter(marketItems, { getCreatedAt: (x) => x.updatedAt || x.createdAt }); } catch (_) {}
    }
    const spreadMap = await spreads.forMessages((marketItems || []).map(x => x && (x.id || x.key)));
    ctx.body = await marketView(marketItems, filter, null, { q, minPrice, maxPrice, sort, spreadMap });
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
    const zoom = parseInt(ctx.query.zoom) || 2;
    const [comments, mapData] = await Promise.all([getVoteComments(itemId), resolveMapUrl(item.mapUrl)])
    const returnTo = (() => {
    const params = []
      if (filter) params.push(`filter=${encodeURIComponent(filter)}`)
      if (q) params.push(`q=${encodeURIComponent(q)}`)
      if (minPrice !== "" && minPrice != null) params.push(`minPrice=${encodeURIComponent(String(minPrice))}`)
      if (maxPrice !== "" && maxPrice != null) params.push(`maxPrice=${encodeURIComponent(String(maxPrice))}`)
      if (sort) params.push(`sort=${encodeURIComponent(sort)}`)
      return `/market${params.length ? `?${params.join("&")}` : ""}`
    })()
    await enrichItemLifetime(item, { author: item.seller, createdAt: item.updatedAt || item.createdAt })
    ctx.body = await singleMarketView(withCount(item, comments), filter, comments, { q, minPrice, maxPrice, sort, returnTo, mapData, zoom, spreads: await spreads.forMessage(item.id).catch(() => null) })
  })
  .get('/jobs', async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    let filter = String(ctx.query.filter || 'ALL').toUpperCase()
    if (filter === 'FAVS' || filter === 'NEEDS') filter = 'ALL'
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const query = {
      search: ctx.query.search || '',
      minSalary: ctx.query.minSalary ?? '',
      maxSalary: ctx.query.maxSalary ?? '',
      sort: ctx.query.sort || 'recent',
      viewerPrefs
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
    let jobs = await jobsModel.listJobs(filter, viewerId, query)
    await enrichWithComments(jobs)
    jobs = await applyListFilters(jobs, ctx)
    if (filter !== 'MINE') {
      try { jobs = await lifetime.enrichAndFilter(jobs); } catch (_) {}
    }
    await enrichMsgSize(jobs)
    const spreadMap = await spreads.forMessages((jobs || []).map(x => x && (x.id || x.key)));
    ctx.body = await jobsView(jobs, filter, { ...(query || {}), spreadMap })
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
    let jobId = ctx.params.jobId
    if (jobId && jobId.startsWith('%25')) {
      try { jobId = decodeURIComponent(jobId); } catch (_) {}
    }
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
    let job;
    try {
      job = await jobsModel.getJobById(jobId, viewerId)
    } catch (e) {
      sendErrorPage(ctx, `Job not found or invalid id: ${jobId}`, { status: 404 });
      return;
    }
    if (!job) {
      sendErrorPage(ctx, `Job not found: ${jobId}`, { status: 404 });
      return;
    }
    const [comments, mapData] = await Promise.all([getVoteComments(jobId), resolveMapUrl(job.mapUrl)])
    await enrichMsgSize([job])
    let candidates = [];
    if (job && String(job.author) === String(viewerId)) {
      try { candidates = await inhabitantsModel.getCandidatesForJob(job, viewerId); } catch (_) { candidates = []; }
    }
    const jobAuthorPrefs2 = await about.visibilityPrefs(job.author).catch(() => null);
    await enrichItemLifetime(job)
    ctx.body = await singleJobsView(withCount(job, comments), filter, comments, { ...params, mapData, candidates, baseUrl: resolveExternalBaseUrl(ctx), authorPrefs: jobAuthorPrefs2, spreads: await spreads.forMessage(job.id).catch(() => null) })
  })
  .get('/c/jobs/:jobId', async (ctx) => {
    let job;
    try { job = await jobsModel.getJobById(ctx.params.jobId); } catch (_) {}
    if (!job || String(job.status || '').toUpperCase() === 'CLOSED' || String(job.visibility || 'PUBLIC').toUpperCase() === 'HIDDEN') {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const jobAuthorPrefs = await about.visibilityPrefs(job.author).catch(() => null);
    if (!jobAuthorPrefs || jobAuthorPrefs.clearnetJobs !== true) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = await clearnetJobView(job);
  })
  .get("/shops", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    if (filter === 'products' || filter === 'prices') {
      const products = await shopsModel.listAllProducts({ filter: 'top', sort, viewerId: getViewerId() });
      const enriched = await Promise.all(products.map(async (prod) => {
        try {
          const shop = await shopsModel.getShopById(prod.shopId);
          return { ...prod, shopTitle: shop ? shop.title : '' };
        } catch (_) { return prod; }
      }));
      ctx.body = await shopsView(enriched, filter, null, { q, sort, viewerPrefs });
      return;
    }
    const items = await shopsModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const fav = await mediaFavorites.getFavoriteSet('shops');
    let enriched = items.map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    let withFeatured = await Promise.all(enriched.map(async (shop) => {
      shop.featuredProducts = await shopsModel.listFeaturedProducts(shop.rootId || shop.key);
      return shop;
    }));
    try { withFeatured = await lifetime.enrichAndFilter(withFeatured, { getKey: (x) => x.rootId || x.key }); } catch (_) {}
    const spreadMap = await spreads.forMessages((withFeatured || []).map(x => x && (x.key || x.id)));
    ctx.body = await shopsView(withFeatured, filter, null, { q, sort, viewerPrefs, spreadMap });
  })
  .get("/shops/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const shop = await shopsModel.getShopById(ctx.params.id);
    if (!shop) { ctx.redirect('/shops'); return; }
    const fav = await mediaFavorites.getFavoriteSet('shops');
    ctx.body = await shopsView([{ ...shop, isFavorite: fav.has(String(shop.rootId || shop.key)) }], 'edit', shop, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/shops/product/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const product = await shopsModel.getProductById(ctx.params.id);
    if (!product) { ctx.redirect('/shops'); return; }
    ctx.body = await editProductView(product, ctx.query.shopId || product.shopId, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/shops/product/:productId", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const product = await shopsModel.getProductById(ctx.params.productId);
    if (!product) { ctx.redirect('/shops'); return; }
    const shop = await shopsModel.getShopById(product.shopId);
    const comments = await getVoteComments(product.key);
    ctx.body = await singleProductView(withCount(product, comments), shop, comments, { shopId: product.shopId, returnTo: safeReturnTo(ctx, `/shops/${encodeURIComponent(product.shopId)}`, ['/shops']) });
  })
  .get("/c/audios/:id", async (ctx) => {
    let item; try { item = await audiosModel.getAudioById(ctx.params.id); } catch (_) {}
    const p = item && item.author ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    if (!item || !p || p.clearnetAudios !== true) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({ kind: 'audio', item });
  })
  .get("/c/videos/:id", async (ctx) => {
    let item; try { item = await videosModel.getVideoById(ctx.params.id); } catch (_) {}
    const p = item && item.author ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    if (!item || !p || p.clearnetVideos !== true) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({ kind: 'video', item });
  })
  .get("/c/images/:id", async (ctx) => {
    let item; try { item = await imagesModel.getImageById(ctx.params.id); } catch (_) {}
    const p = item && item.author ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    if (!item || !p || p.clearnetImages !== true) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({ kind: 'image', item });
  })
  .get("/c/documents/:id", async (ctx) => {
    let item; try { item = await documentsModel.getDocumentById(ctx.params.id); } catch (_) {}
    const p = item && item.author ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    if (!item || !p || p.clearnetDocuments !== true) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({ kind: 'document', item });
  })
  .get("/c/torrents/:id", async (ctx) => {
    let item; try { item = await torrentsModel.getTorrentById(ctx.params.id); } catch (_) {}
    const p = item && item.author ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    if (!item || !p || p.clearnetTorrents !== true) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({ kind: 'torrent', item });
  })
  .get("/c/blog/:msgKey", async (ctx) => {
    const msgKey = String(ctx.params.msgKey || '');
    let msg;
    try {
      const ssbX = await cooler.open();
      msg = await new Promise((res, rej) => ssbX.get(msgKey, (err, m) => err || !m ? rej(err || new Error('not found')) : res(m)));
    } catch (_) {}
    const content = msg && msg.content;
    if (!content || content.type !== 'post' || content.root) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const authorId = msg.author;
    const postAuthorPrefs = await about.visibilityPrefs(authorId).catch(() => null);
    if (!postAuthorPrefs || postAuthorPrefs.clearnetPosts !== true) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const authorName = authorId ? await about.name(authorId).catch(() => '') : '';
    ctx.type = 'text/html';
    ctx.body = await clearnetBlogView({
      msgKey,
      text: content.text || '',
      author: authorId,
      authorName,
      contentWarning: content.contentWarning || '',
      sentAt: msg.timestamp || content.sentAt
    });
  })
  .get("/c/inhabitant/:feedId", async (ctx) => {
    const feedId = decodeURIComponent(ctx.params.feedId || '');
    if (!ssbRef.isFeedId(feedId)) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const prefs = await about.visibilityPrefs(feedId).catch(() => null);
    if (!prefs || prefs.clearnet !== true) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const [name, description, imageBlobId] = await Promise.all([
      about.name(feedId).catch(() => ''),
      about.description(feedId).catch(() => ''),
      about.image(feedId).catch(() => null)
    ]);
    let safeImage = imageBlobId;
    if (imageBlobId) {
      const { blobIdOf } = require('../views/clearnet_view');
      const bid = blobIdOf(imageBlobId);
      if (bid) {
        try {
          const ssbX = await cooler.open();
          const has = await new Promise(resolve => ssbX.blobs.has(bid, (err, h) => resolve(!err && !!h)));
          if (!has) safeImage = null;
        } catch (_) { safeImage = null; }
      } else {
        safeImage = null;
      }
    }
    const MAX_PER_SECTION = 5;
    const items = { shops: [], jobs: [], events: [], projects: [], posts: [], audios: [], videos: [], images: [], documents: [], torrents: [] };
    const mediaItemMapper = (m, { withImage = false } = {}) => ({
      id: m.key,
      title: m.title || 'Untitled',
      image: withImage ? (m.url || null) : null,
      snippet: m.description || '',
      meta: m.createdAt ? new Date(m.createdAt).toISOString().slice(0, 10) : ''
    });
    if (prefs.clearnetShops) {
      try {
        const shops = await shopsModel.listAll({ filter: 'all' }).catch(() => []);
        items.shops = (shops || []).filter(s => s.author === feedId && String(s.visibility || '').toUpperCase() !== 'CLOSED').slice(0, MAX_PER_SECTION).map(s => ({
          id: s.key,
          title: s.title || 'Untitled',
          image: s.image || null,
          snippet: s.shortDescription || s.description || '',
          meta: s.location || ''
        }));
      } catch (_) {}
    }
    if (prefs.clearnetJobs) {
      try {
        const jobs = await jobsModel.listJobs('ALL', feedId).catch(() => []);
        items.jobs = (jobs || []).filter(j => j.author === feedId && String(j.status || '').toUpperCase() !== 'CLOSED' && String(j.visibility || 'PUBLIC').toUpperCase() !== 'HIDDEN').slice(0, MAX_PER_SECTION).map(j => ({
          id: j.id,
          title: j.title || 'Untitled',
          image: j.image || null,
          snippet: j.description || '',
          meta: j.location ? String(j.location).toUpperCase() : ''
        }));
      } catch (_) {}
    }
    if (prefs.clearnetEvents) {
      try {
        const events = await eventsModel.listAll(feedId, 'all').catch(() => []);
        items.events = (events || []).filter(e => e.organizer === feedId && String(e.status || '').toUpperCase() !== 'CLOSED' && e.isPublic !== 'private').slice(0, MAX_PER_SECTION).map(e => ({
          id: e.id,
          title: e.title || 'Untitled',
          image: null,
          snippet: e.description || '',
          meta: e.date ? new Date(e.date).toISOString().slice(0, 10) : (e.location || '')
        }));
      } catch (_) {}
    }
    if (prefs.clearnetProjects) {
      try {
        const projects = await projectsModel.listProjects('ALL').catch(() => []);
        items.projects = (projects || []).filter(p => p.author === feedId && String(p.status || '').toUpperCase() !== 'CANCELLED').slice(0, MAX_PER_SECTION).map(p => ({
          id: p.id || p.key,
          title: p.title || 'Untitled',
          image: p.image || null,
          snippet: p.description || '',
          meta: p.status ? String(p.status).toUpperCase() : ''
        }));
      } catch (_) {}
    }
    if (prefs.clearnetPosts) {
      try {
        const ssbX = await cooler.open();
        items.posts = await new Promise((resolve) => {
          try {
            pull(
              ssbX.createUserStream({ id: feedId, reverse: true, limit: 200 }),
              pull.filter(m => m && m.value && m.value.content && m.value.content.type === 'post' && !m.value.content.root),
              pull.collect((err, arr) => {
                if (err || !Array.isArray(arr)) return resolve([]);
                resolve(arr.slice(0, MAX_PER_SECTION).map(m => {
                  const c = m.value.content;
                  const cleanText = String(c.text || '').replace(/<[^>]+>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '');
                  const firstLine = cleanText.split('\n').find(l => l.trim()) || '';
                  const dateIso = m.value.timestamp ? new Date(m.value.timestamp).toISOString().slice(0, 10) : '';
                  return {
                    id: m.key,
                    title: c.contentWarning || firstLine.slice(0, 80) || 'Blog',
                    image: null,
                    snippet: c.contentWarning ? firstLine.slice(0, 200) : cleanText.slice(0, 200),
                    meta: dateIso
                  };
                }));
              })
            );
          } catch (_) { resolve([]); }
        });
      } catch (_) {}
    }
    if (prefs.clearnetAudios) {
      try {
        const audios = await audiosModel.listAll('all').catch(() => []);
        items.audios = (audios || []).filter(m => m.author === feedId).slice(0, MAX_PER_SECTION).map(m => mediaItemMapper(m));
      } catch (_) {}
    }
    if (prefs.clearnetVideos) {
      try {
        const videos = await videosModel.listAll('all').catch(() => []);
        items.videos = (videos || []).filter(m => m.author === feedId).slice(0, MAX_PER_SECTION).map(m => mediaItemMapper(m));
      } catch (_) {}
    }
    if (prefs.clearnetImages) {
      try {
        const images = await imagesModel.listAll('all').catch(() => []);
        items.images = (images || []).filter(m => m.author === feedId).slice(0, MAX_PER_SECTION).map(m => mediaItemMapper(m, { withImage: true }));
      } catch (_) {}
    }
    if (prefs.clearnetDocuments) {
      try {
        const documents = await documentsModel.listAll('all').catch(() => []);
        items.documents = (documents || []).filter(m => m.author === feedId).slice(0, MAX_PER_SECTION).map(m => mediaItemMapper(m));
      } catch (_) {}
    }
    if (prefs.clearnetTorrents) {
      try {
        const torrents = await torrentsModel.listAll('all').catch(() => []);
        items.torrents = (torrents || []).filter(m => m.author === feedId).slice(0, MAX_PER_SECTION).map(m => mediaItemMapper(m));
      } catch (_) {}
    }
    try {
      const ssbBlob = await cooler.open();
      const { blobIdOf } = require('../views/clearnet_view');
      const blobCache = new Map();
      const checkBlob = (bid) => new Promise(resolve => {
        if (!bid) return resolve(false);
        if (blobCache.has(bid)) return resolve(blobCache.get(bid));
        try {
          ssbBlob.blobs.has(bid, (err, has) => {
            const ok = !err && !!has;
            blobCache.set(bid, ok);
            resolve(ok);
          });
        } catch (_) { resolve(false); }
      });
      for (const k of Object.keys(items)) {
        for (const it of items[k]) {
          const bid = blobIdOf(it.image);
          if (bid) {
            const ok = await checkBlob(bid);
            if (!ok) it.image = null;
          }
        }
      }
    } catch (_) {}
    const filterType = String(ctx.query.type || '').toLowerCase();
    ctx.type = 'text/html';
    ctx.body = await clearnetInhabitantView({ feedId, name, description, image: safeImage, prefs, items, filterType });
  })
  .get("/c/shops/:shopId", async (ctx) => {
    const shop = await shopsModel.getShopById(ctx.params.shopId).catch(() => null);
    if (!shop || String(shop.visibility || '').toUpperCase() === 'CLOSED') {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const shopAuthorPrefs = await about.visibilityPrefs(shop.author).catch(() => null);
    if (!shopAuthorPrefs || shopAuthorPrefs.clearnetShops !== true) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const products = await shopsModel.listProducts(shop.rootId || shop.key).catch(() => []);
    ctx.type = 'text/html';
    ctx.body = await clearnetShopView(shop, products || []);
  })
  .get("/shops/:shopId", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const shop = await shopsModel.getShopById(ctx.params.shopId);
    if (!shop) { ctx.redirect('/shops'); return; }
    const fav = await mediaFavorites.getFavoriteSet('shops');
    const [products, comments, mapData] = await Promise.all([shopsModel.listProducts(shop.rootId || shop.key), getVoteComments(shop.key), resolveMapUrl(shop.mapUrl)]);
    const baseUrl = resolveExternalBaseUrl(ctx);
    const authorPrefs = await about.visibilityPrefs(shop.author).catch(() => null);
    await enrichItemLifetime(shop, { key: shop.rootId || shop.key });
    ctx.body = await singleShopView({ ...shop, isFavorite: fav.has(String(shop.rootId || shop.key)), commentCount: comments.length }, filter, products, comments, { q, sort, returnTo: safeReturnTo(ctx, `/shops?filter=${encodeURIComponent(filter)}`, ['/shops']), mapData, baseUrl, authorPrefs, spreads: await spreads.forMessage(shop.key).catch(() => null) });
  })
  .get("/shops/:shopId/orders", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const shop = await shopsModel.getShopById(ctx.params.shopId);
    if (!shop) { sendErrorPage(ctx, "Shop not found", { status: 404 }); return; }
    const rootId = shop.rootId || shop.key;
    const orders = await shopsModel.listShopOrders(rootId).catch(e => { throw e; });
    ctx.body = await shopOrdersView(shop, orders);
  })
  .get("/chats", async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'all', q = '', tribeId = '' } = ctx.query;
    const viewerId = getViewerId();
    if (filter === 'create') {
      ctx.body = await chatsView([], 'create', null, { q, ...(tribeId ? { tribeId } : {}) });
      return;
    }
    const modelFilter = filter === "favorites" ? "all" : filter;
    const items = await chatsModel.listAll({ filter: modelFilter, q, viewerId });
    const fav = await mediaFavorites.getFavoriteSet('chats');
    const myTribeIds = await getUserTribeIds(viewerId);
    const enriched = items.filter(x => !x.tribeId).map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    let finalList = filter === "favorites" ? enriched.filter(x => x.isFavorite) : enriched;
    finalList = await applyListFilters(finalList, ctx);
    try { finalList = await lifetime.enrichAndFilter(finalList, { getKey: (x) => x.rootId || x.key }); } catch (_) {}
    const spreadMap = await spreads.forMessages((finalList || []).map(x => x && (x.key || x.id)));
    ctx.body = await chatsView(finalList, filter, null, { q, spreadMap });
  })
  .get("/chats/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const chat = await chatsModel.getChatById(ctx.params.id);
    if (!chat) { ctx.redirect('/chats'); return; }
    ctx.body = await chatsView([], 'edit', chat, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/chats/:chatId", async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    await chatsModel.ingestKeys().catch(() => {});
    const { filter = 'all', q = '' } = ctx.query;
    const uid = getViewerId();
    let chat = await chatsModel.getChatById(ctx.params.chatId);
    if (!chat) { ctx.redirect('/chats'); return; }
    let parentTribe = null;
    if (chat.tribeId) {
      try {
        parentTribe = await tribesModel.getTribeById(chat.tribeId);
        if (!parentTribe.members.includes(uid)) { ctx.body = tribeAccessDeniedView(parentTribe); return; }
        await tribesModel.processIncomingKeys().catch(() => {});
        chat = await chatsModel.getChatById(ctx.params.chatId);
      } catch { ctx.redirect('/tribes'); return; }
    } else {
      const members = Array.isArray(chat.members) ? chat.members : [];
      const isOpen = String(chat.status || '').toUpperCase() === 'OPEN';
      if (!isOpen && chat.author !== uid && !members.includes(uid)) { ctx.redirect('/chats?filter=all'); return; }
    }
    const fav = await mediaFavorites.getFavoriteSet('chats');
    const messages = await chatsModel.listMessages(chat.rootId || chat.key);
    const isTribeMember = !!parentTribe;
    ctx.body = await singleChatView({ ...chat, isFavorite: fav.has(String(chat.rootId || chat.key)), isTribeMember }, filter, messages, { q, returnTo: safeReturnTo(ctx, `/chats?filter=${encodeURIComponent(filter)}`, ['/chats']) });
  })
  .get("/pads", async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || "all").toLowerCase();
    const uid = getViewerId();
    if (filter === "edit") {
      const id = ctx.query.id;
      if (!id) { ctx.redirect('/pads'); return; }
      const pad = await padsModel.getPadById(id);
      if (!pad || pad.author !== uid) { ctx.redirect('/pads'); return; }
      ctx.body = await padsView([], "edit", pad, {});
      return;
    }
    const q = String(ctx.query.q || "").trim();
    const tribeId = ctx.query.tribeId || "";
    const pads = await padsModel.listAll({ filter, viewerId: uid });
    const fav = await mediaFavorites.getFavoriteSet('pads');
    let enriched = pads.filter(p => !p.tribeId).map(p => ({ ...p, isFavorite: fav.has(String(p.rootId)) }));
    enriched = await applyListFilters(enriched, ctx);
    try { enriched = await lifetime.enrichAndFilter(enriched, { getKey: (x) => x.rootId || x.key }); } catch (_) {}
    const spreadMap = await spreads.forMessages((enriched || []).map(x => x && (x.rootId || x.key || x.id)));
    ctx.body = await padsView(enriched, filter, null, { q, ...(tribeId ? { tribeId } : {}), spreadMap });
  })
  .get("/pads/:padId", async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    await padsModel.ingestKeys().catch(() => {});
    const uid = getViewerId();
    let pad = await padsModel.getPadById(ctx.params.padId);
    if (!pad) { ctx.redirect('/pads'); return; }
    let parentTribe = null;
    if (pad.tribeId) {
      try {
        parentTribe = await tribesModel.getTribeById(pad.tribeId);
        if (!parentTribe.members.includes(uid)) { ctx.body = tribeAccessDeniedView(parentTribe); return; }
        await tribesModel.processIncomingKeys().catch(() => {});
        pad = await padsModel.getPadById(ctx.params.padId);
      } catch { ctx.redirect('/tribes'); return; }
    } else {
      const members = Array.isArray(pad.members) ? pad.members : [];
      const isOpen = String(pad.status || '').toUpperCase() === 'OPEN';
      if (!isOpen && pad.author !== uid && !members.includes(uid)) { ctx.redirect('/pads?filter=all'); return; }
    }
    const fav = await mediaFavorites.getFavoriteSet('pads');
    const entries = await padsModel.getEntries(pad.rootId);
    const versionKey = ctx.query.version || null;
    const selectedVersion = versionKey
      ? (entries.find(e => e.key === versionKey) || entries[parseInt(versionKey)] || null)
      : null;
    const baseUrl = `${ctx.protocol}://${ctx.host}`;
    const isTribeMember = !!parentTribe;
    ctx.body = await singlePadView({ ...pad, isFavorite: fav.has(String(pad.rootId)), isTribeMember }, entries, { baseUrl, selectedVersion });
  })
  .get("/calendars", async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || "all").toLowerCase();
    const uid = getViewerId();
    if (filter === "edit") {
      const id = ctx.query.id;
      if (!id) { ctx.redirect('/calendars'); return; }
      const cal = await calendarsModel.getCalendarById(id);
      if (!cal || cal.author !== uid) { ctx.redirect('/calendars'); return; }
      ctx.body = await calendarsView([], "edit", cal, {});
      return;
    }
    const q = String(ctx.query.q || "").trim();
    const tribeId = ctx.query.tribeId || "";
    const modelFilter = filter === "favorites" ? "all" : filter;
    const calendars = await calendarsModel.listAll({ filter: modelFilter, viewerId: uid });
    const fav = await mediaFavorites.getFavoriteSet('calendars');
    const myTribeIds = await getUserTribeIds(uid);
    const enriched = calendars.filter(c => !c.tribeId).map(c => ({ ...c, isFavorite: fav.has(String(c.rootId)) }));
    let finalList = filter === "favorites" ? enriched.filter(c => c.isFavorite) : enriched;
    finalList = await applyListFilters(finalList, ctx);
    try { finalList = await lifetime.enrichAndFilter(finalList, { getKey: (x) => x.rootId || x.key }); } catch (_) {}
    const spreadMap = await spreads.forMessages((finalList || []).map(x => x && (x.rootId || x.key || x.id)));
    ctx.body = await calendarsView(finalList, filter, null, { q, ...(tribeId ? { tribeId } : {}), spreadMap });
  })
  .get("/calendars/:calId", async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    await calendarsModel.ingestKeys().catch(() => {});
    const uid = getViewerId();
    const cal = await calendarsModel.getCalendarById(ctx.params.calId);
    if (!cal) { ctx.redirect('/calendars'); return; }
    let parentTribe = null;
    if (cal.tribeId) {
      try {
        parentTribe = await tribesModel.getTribeById(cal.tribeId);
        if (!parentTribe.members.includes(uid)) { ctx.body = tribeAccessDeniedView(parentTribe); return; }
      } catch { ctx.redirect('/tribes'); return; }
    } else {
      const participants = Array.isArray(cal.participants) ? cal.participants : (Array.isArray(cal.members) ? cal.members : []);
      const isOpen = String(cal.status || '').toUpperCase() === 'OPEN';
      if (!isOpen && cal.author !== uid && !participants.includes(uid)) { ctx.redirect('/calendars?filter=all'); return; }
    }
    if (String(cal.status || '').toUpperCase() === 'CLOSED' && cal.author !== uid) {
      ctx.body = tribeAccessDeniedView(parentTribe); return;
    }
    const dates = await calendarsModel.getDatesForCalendar(cal.rootId);
    const notesByDate = {};
    for (const d of dates) {
      notesByDate[d.key] = await calendarsModel.getNotesForDate(cal.rootId, d.key);
    }
    const fav = await mediaFavorites.getFavoriteSet('calendars');
    const month = String(ctx.query.month || "").trim() || null;
    const day = String(ctx.query.day || "").trim() || null;
    await enrichItemLifetime(cal, { key: cal.rootId });
    ctx.body = await singleCalendarView({ ...cal, isFavorite: fav.has(String(cal.rootId)) }, dates, notesByDate, { month, day, spreads: await spreads.forMessage(cal.rootId).catch(() => null) });
  })
  .get("/projects", async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || "ALL").toUpperCase()
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    if (filter === "CREATE") {
      ctx.body = await projectsView([], "CREATE", null, { viewerPrefs })
      return
    }
    const modelFilter = filter === "BACKERS" ? "ALL" : filter
    let projects = await projectsModel.listProjects(modelFilter)
    await enrichWithComments(projects)
    projects = await applyListFilters(projects, ctx)
    try { projects = await lifetime.enrichAndFilter(projects); } catch (_) {}
    await enrichMsgSize(projects)
    const spreadMap = await spreads.forMessages((projects || []).map(x => x && (x.id || x.key)));
    ctx.body = await projectsView(projects, filter, null, { viewerPrefs, spreadMap })
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
    const zoom = parseInt(ctx.query.zoom) || 2;
    const [comments, mapData] = await Promise.all([getVoteComments(projectId), resolveMapUrl(project.mapUrl)])
    await enrichMsgSize([project])
    await enrichItemLifetime(project, { key: project.id || project.key })
    ctx.body = await singleProjectView(withCount(project, comments), filter, comments, { mapData, zoom, baseUrl: resolveExternalBaseUrl(ctx), spreads: await spreads.forMessage(project.id).catch(() => null) })
  })
  .get("/c/projects/:projectId", async (ctx) => {
    let project;
    try { project = await projectsModel.getProjectById(ctx.params.projectId); } catch (_) {}
    if (!project || String(project.status || '').toUpperCase() === 'CANCELLED') {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const projAuthorPrefs = await about.visibilityPrefs(project.author).catch(() => null);
    if (!projAuthorPrefs || projAuthorPrefs.clearnetProjects !== true) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = await clearnetProjectView(project);
  })
  .get("/banking", async (ctx) => {
    if (!checkMod(ctx, 'bankingMod')) { ctx.redirect('/modules'); return; }
    const userId = getViewerId();
    const query = ctx.query;
    const filter = (query.filter || 'overview').toLowerCase();
    const q = (query.q || '').trim();
    const msg = (query.msg || '').trim();
    await bankingModel.ensureSelfAddressPublished();
    if (bankingModel.isPubNode() && filter === 'overview') {
      try { await bankingModel.executeEpoch({}); } catch (_) {}
      try { await bankingModel.processPendingClaims(); } catch (_) {}
    }
    const data = await bankingModel.listBanking(filter, userId);
    data.isPub = bankingModel.isPubNode();
    data.alreadyClaimed = data.summary?.alreadyClaimed || false;
    if (filter === 'overview') {
      const pending = (data.allocations || []).find(a => a.to === userId && (a.status === "UNCLAIMED" || a.status === "UNCONFIRMED"));
      data.pendingUBI = pending || null;
    }
    if (filter === 'addresses' && q) {
      data.addresses = (data.addresses || []).filter(x =>
        String(x.id).toLowerCase().includes(q.toLowerCase()) ||
        String(x.address).toLowerCase().includes(q.toLowerCase())
      );
      data.search = q;
    }
    data.flash = msg || '';
    const { ecoValue, inflationFactor, inflationMonthly, ecoTimeMs, currentSupply, isSynced } = await bankingModel.calculateEcoinValue();
    data.exchange = {
      ecoValue,
      inflationFactor,
      inflationMonthly,
      ecoTimeMs,
      currentSupply,
      totalSupply: 25500000,
      isSynced
    };
    if (filter === 'taxes') {
      const inspectBlock = async (blockId) => {
        if (!blockId) return null;
        try {
          const blk = await blockchainModel.getBlockById(blockId, userId);
          if (blk && blk.id) {
            const sizeBytes = Number(blk.size || 0);
            const grams = (sizeBytes / (1024 * 1024)) * 0.095;
            const ecoinTax = grams * (bankingModel.ECOIN_PER_GRAM_CO2 || 0.1);
            return { block: blockId, found: true, size: sizeBytes, author: blk.author, blockType: blk.type, ecoinTax };
          }
        } catch (_) {}
        try {
          const ssbClient = await cooler.open();
          const raw = await new Promise((resolve, reject) => ssbClient.get(blockId, (err, v) => err ? reject(err) : resolve(v)));
          if (raw) {
            const sizeBytes = Buffer.byteLength(JSON.stringify(raw), 'utf8');
            let bType = (raw.content && typeof raw.content === 'object' && raw.content.type) || null;
            if (!bType && typeof raw.content === 'string' && raw.content.endsWith('.box')) {
              try {
                const dec = ssbClient.private.unbox({ key: blockId, value: raw, timestamp: raw.timestamp || 0 });
                if (dec && dec.value && dec.value.content && dec.value.content.type) bType = dec.value.content.type;
              } catch (_) {}
              if (!bType) bType = 'encrypted';
            }
            const grams = (sizeBytes / (1024 * 1024)) * 0.095;
            const ecoinTax = grams * (bankingModel.ECOIN_PER_GRAM_CO2 || 0.1);
            return { block: blockId, found: true, size: sizeBytes, author: raw.author, blockType: bType || 'unknown', ecoinTax };
          }
        } catch (_) {}
        return { block: blockId, found: false };
      };
      let firstKey = null;
      try {
        const ssbClient = await cooler.open();
        firstKey = await new Promise((resolve) => {
          let first = null;
          pull(
            ssbClient.createUserStream({ id: userId, limit: 1 }),
            pull.drain(
              (m) => { if (!first && m && m.key) first = m.key; },
              () => resolve(first)
            )
          );
        });
      } catch (_) {}
      let firstBlockSize = 0;
      if (firstKey) {
        const firstLookup = await inspectBlock(firstKey);
        if (firstLookup && firstLookup.found) firstBlockSize = Number(firstLookup.size || 0);
      }
      data.firstBlock = firstKey || null;
      data.firstBlockSize = firstBlockSize;
      const blockId = String(query.block || '').trim();
      let lookup = null;
      if (blockId) lookup = await inspectBlock(blockId);
      data.lookup = lookup;
      const VALID_TAX_TYPES = ['eco', 'arch'];
      const MANDATORY_TAX_TYPES = ['eco'];
      const rawTypes = query.types;
      let parsedTypes;
      if (rawTypes === undefined) parsedTypes = null;
      else if (Array.isArray(rawTypes)) parsedTypes = rawTypes;
      else parsedTypes = String(rawTypes).split(',');
      const selected = (parsedTypes === null
        ? VALID_TAX_TYPES.slice()
        : parsedTypes
            .map(s => String(s || '').trim().toLowerCase())
            .filter(s => VALID_TAX_TYPES.includes(s))
      );
      const set = new Set(selected);
      for (const t of MANDATORY_TAX_TYPES) set.add(t);
      data.selectedTaxTypes = Array.from(set);
    }
    ctx.body = renderBankingView(data, filter, userId, data.isPub);
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
  .get("/logs", async (ctx) => {
    if (!checkMod(ctx, 'logsMod')) { ctx.redirect('/modules'); return; }
    const view = String(ctx.query.view || 'list');
    const aiModOn = logsModel.isAImodOn();
    if (view === 'create') {
      const mode = ctx.query.mode === 'ai' ? 'ai' : 'manual';
      ctx.body = logsView([], 'today', mode, { view: 'create', aiModOn });
      return;
    }
    if (view === 'edit') {
      const id = String(ctx.query.id || '');
      const entry = id ? await logsModel.getLogById(id) : null;
      if (!entry) { ctx.redirect('/logs'); return; }
      ctx.body = logsView([], 'today', entry.mode, { view: 'edit', aiModOn, entry });
      return;
    }
    const filter = qf(ctx, 'today');
    const q = String(ctx.query.q || '').trim().toLowerCase();
    const typeQ = String(ctx.query.type || '').trim().toLowerCase();
    const dateQ = String(ctx.query.date || '').trim();
    let items = await logsModel.listLogs(filter);
    if (q) items = items.filter(i => String(i.text || '').toLowerCase().includes(q) || String(i.label || '').toLowerCase().includes(q));
    if (typeQ === 'ai' || typeQ === 'manual') items = items.filter(i => (i.mode === 'ai' ? 'ai' : 'manual') === typeQ);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateQ)) {
      const start = new Date(dateQ + 'T00:00:00').getTime();
      const end = start + 24 * 60 * 60 * 1000;
      items = items.filter(i => i.ts >= start && i.ts < end);
    }
    ctx.body = logsView(items, filter, null, { view: 'list', aiModOn, search: { q: ctx.query.q || '', type: typeQ, date: dateQ } });
  })
  .get("/logs/view/:id", async (ctx) => {
    if (!checkMod(ctx, 'logsMod')) { ctx.redirect('/modules'); return; }
    const entry = await logsModel.getLogById(ctx.params.id);
    if (!entry) { ctx.redirect('/logs'); return; }
    const aiModOn = logsModel.isAImodOn();
    ctx.body = logsView([], 'today', entry.mode, { view: 'detail', aiModOn, entry });
  })
  .post("/logs/create", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'logsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    const mode = b.mode === 'ai' ? 'ai' : 'manual';
    try {
      if (mode === 'ai') { startAI(); await logsModel.createAI(); }
      else await logsModel.createManual(b.label || '', b.text || '');
    } catch (_) {}
    ctx.redirect('/logs');
  })
  .post("/logs/edit/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'logsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try { await logsModel.updateLog(ctx.params.id, { label: b.label || '', text: b.text || '' }); } catch (_) {}
    ctx.redirect('/logs');
  })
  .post("/logs/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'logsMod')) { ctx.redirect('/modules'); return; }
    try { await logsModel.deleteLog(ctx.params.id); } catch (_) {}
    ctx.redirect('/logs');
  })
  .get("/logs/export", async (ctx) => {
    if (!checkMod(ctx, 'logsMod')) { ctx.redirect('/modules'); return; }
    const items = await logsModel.listLogs('always');
    const pdf = await buildLogsPdf(items, getViewerId());
    ctx.set('Content-Type', 'application/pdf');
    ctx.set('Content-Disposition', `attachment; filename="oasis-logs-${Date.now()}.pdf"`);
    ctx.body = pdf;
  })
  .get("/logs/export/:id", async (ctx) => {
    if (!checkMod(ctx, 'logsMod')) { ctx.redirect('/modules'); return; }
    const entry = await logsModel.getLogById(ctx.params.id);
    if (!entry) { ctx.redirect('/logs'); return; }
    const pdf = await buildLogsPdf([entry], getViewerId());
    ctx.set('Content-Type', 'application/pdf');
    ctx.set('Content-Disposition', `attachment; filename="oasis-log-${Date.now()}.pdf"`);
    ctx.body = pdf;
  })
  .get('/cipher', async (ctx) => {
    if (!checkMod(ctx, 'cipherMod')) { ctx.redirect('/modules'); return; }
    try {
      ctx.body = await cipherView();
    } catch (error) {
      sendErrorPage(ctx, error.message);
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
    let list = await transfersModel.listAll(filter, getViewerId());
    try { list = await lifetime.enrichAndFilter(list, { getAuthor: (x) => x.from }); } catch (_) {}
    await enrichMsgSize(list);
    const spreadMap = await spreads.forMessages((list || []).map(x => x && (x.id || x.key)));
    ctx.body = await transferView(list, filter, null, { q: ctx.query.q || '', minAmount: ctx.query.minAmount ?? '', maxAmount: ctx.query.maxAmount ?? '', sort: ctx.query.sort || 'recent', category: ctx.query.category || '', spreadMap });
  })
  .get('/transfers/edit/:id', async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    const tr = await transfersModel.getTransferById(ctx.params.id, getViewerId());
    ctx.body = await transferView([tr], 'edit', ctx.params.id, {});
  })
  .get('/transfers/contract/:transferId', async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    const transfer = await transfersModel.getTransferById(ctx.params.transferId, getViewerId());
    if (!transfer) { ctx.redirect('/transfers'); return; }
    let block = null;
    try {
      const ssbX = await cooler.open();
      const msg = await new Promise((resolve) => {
        ssbX.get(transfer.id, (err, m) => resolve(err ? null : m));
      });
      if (msg && msg.content) {
        block = {
          id: transfer.id,
          author: msg.author,
          ts: msg.timestamp || (msg.value && msg.value.timestamp) || transfer.createdAt,
          type: msg.content.type,
          size: Buffer.byteLength(JSON.stringify(msg), 'utf8')
        };
      }
    } catch (_) {}
    const pdf = buildSmartContractPdf({ transfer, block, viewerId: getViewerId() });
    ctx.set('Content-Type', 'application/pdf');
    ctx.set('Content-Disposition', `attachment; filename="oasis-smart-contract-${transfer.id.replace(/[^A-Za-z0-9]/g, '_').slice(0, 16)}.pdf"`);
    ctx.body = pdf;
  })
  .get('/transfers/:transferId', async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    let filter = ctx.query.filter || 'all'; if (filter === 'favs') filter = 'all';
    const transfer = await transfersModel.getTransferById(ctx.params.transferId, getViewerId());
    let block = null;
    if (transfer && transfer.id) {
      try {
        const ssbX = await cooler.open();
        const msg = await new Promise((resolve) => {
          ssbX.get(transfer.id, (err, m) => resolve(err ? null : m));
        });
        if (msg && msg.content) {
          const size = Buffer.byteLength(JSON.stringify(msg), 'utf8');
          block = {
            id: transfer.id,
            author: msg.author,
            ts: msg.timestamp || (msg.value && msg.value.timestamp) || transfer.createdAt,
            type: msg.content.type,
            size
          };
          if (transfer) transfer.msgSize = size;
        }
      } catch (_) { block = null; }
    }
    await enrichItemLifetime(transfer, { author: transfer.from });
    ctx.body = await singleTransferView(transfer, filter, { q: ctx.query.q || '', minAmount: ctx.query.minAmount ?? '', maxAmount: ctx.query.maxAmount ?? '', sort: ctx.query.sort || 'recent', returnTo: safeReturnTo(ctx, `/transfers?filter=${encodeURIComponent(filter)}`, ['/transfers']), block, spreads: await spreads.forMessage(transfer.id).catch(() => null) });
  })
  .post('/ai', koaBody(), async (ctx) => {
    const { input } = ctx.request.body;
    if (!input) {
      sendErrorPage(ctx, 'No input provided', { status: 400 });
      return;
    }
    startAI();
    const i18nAll = require('../client/assets/translations/i18n');
    const lang = ctx.cookies.get('language') || getConfig().language || 'en';
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
    const rawTags = String(ctx.request.body.tags || '').trim();
    const tagsList = rawTags
      ? rawTags.split(/[,\n]/).map(t => t.replace(/^#+/, '').trim()).filter(Boolean)
      : [];
    const ratingRaw = parseInt(ctx.request.body.rating, 10);
    const rating = Number.isFinite(ratingRaw) ? Math.max(0, Math.min(5, ratingRaw)) : 0;
    const cfg = getConfig();
    const lang = ctx.cookies.get('language') || cfg.language || '';
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
        if (custom) item.answer = stripDangerousTags(custom);
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
          tokens: {},
          lang,
          tags: tagsList,
          rating
        });
        item.trainStatus = 'approved';
        if (tagsList.length) item.tags = tagsList;
        if (rating > 0) item.rating = rating;
        if (lang) item.lang = lang;
      } catch {
        item.trainStatus = 'failed';
      }
      fs.writeFileSync(historyPath, JSON.stringify(chatHistory, null, 2), 'utf-8');
    }
    const config = getConfig();
    const userPrompt = config.ai?.prompt?.trim() || '';
    ctx.body = aiView(chatHistory, userPrompt);
  })
  .post('/ai/exchange/vote', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'aiMod')) return ctx.redirect('/modules');
    const targetId = String((ctx.request.body && ctx.request.body.target) || '').trim();
    const helpful = !((ctx.request.body && ctx.request.body.helpful) === 'no');
    if (targetId) {
      try { await publishExchangeVote({ targetId, helpful }); } catch (_) {}
    }
    const back = String((ctx.request.body && ctx.request.body.returnTo) || '/activity').trim();
    ctx.redirect(back && back.startsWith('/') ? back : '/activity');
  })
  .post('/ai/reject', koaBody(), async (ctx) => {
    const i18nAll = require('../client/assets/translations/i18n');
    const lang = ctx.cookies.get('language') || getConfig().language || 'en';
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
    const lang = ctx.cookies.get('language') || getConfig().language || 'en';
    const { setLanguage } = require('../views/main_views');
    setLanguage(lang);
    const historyPath = path.join(__dirname, '..', '..', 'src', 'configs', 'AI-history.json');
    fs.writeFileSync(historyPath, '[]', 'utf-8');
    const config = getConfig();
    const userPrompt = config.ai?.prompt?.trim() || '';
    ctx.body = aiView([], userPrompt);
  })
  .get('/ai/ask', async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const raw = String(ctx.query?.q || ctx.query?.prompt || '').trim();
    if (!raw) { ctx.redirect('/'); return; }
    const routesIndex = require('../AI/routes_index');
    const { aiNavResultsView } = require('../views/main_views');
    const isModuleEnabled = (modName) => checkMod(ctx, modName);
    let results = [];
    if (checkMod(ctx, 'aiNavMod')) {
      try {
        const embedder = require('../AI/embedder');
        if (embedder.isInstalled()) {
          const vec = await embedder.embed(raw);
          if (vec) {
            results = await routesIndex.resolveTopK(vec, { isModuleEnabled, embed: embedder.embed }, 8);
          }
        }
      } catch (_) {}
    }
    if (!Array.isArray(results) || results.length === 0) {
      results = routesIndex.resolveKeywordTopK({ isModuleEnabled }, raw, 8);
    }
    ctx.body = await aiNavResultsView({ query: raw, results: results || [] });
  })
  .post('/ai/ask', koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    if (!checkMod(ctx, 'aiNavMod')) {
      sendErrorPage(ctx, require('../views/main_views').i18n.aiNavDisabled || 'AI navigation is disabled.', { status: 403 });
      return;
    }
    const raw = String(ctx.request.body?.q || ctx.request.body?.prompt || '').trim();
    if (!raw) { ctx.redirect('/'); return; }
    const ssbRefLib = require('../server/node_modules/ssb-ref');
    const hashtagMatch = raw.match(/^#([\p{L}\p{N}_-]+)/u);
    if (hashtagMatch) {
      ctx.redirect('/search?query=' + encodeURIComponent('#' + hashtagMatch[1]));
      return;
    }
    const feedMatch = raw.match(/^@?([A-Za-z0-9+/=._-]+\.ed25519)\b/);
    if (feedMatch) {
      const id = (feedMatch[0].startsWith('@') ? feedMatch[0] : '@' + feedMatch[1]);
      if (ssbRefLib.isFeed(id)) { ctx.redirect('/author/' + encodeURIComponent(id)); return; }
    }
    if (/^https?:\/\//i.test(raw)) {
      try {
        const u = new URL(raw);
        if (u.host === ctx.host) { ctx.redirect(u.pathname + u.search + u.hash); return; }
      } catch (_) {}
    }
    try {
      const embedder = require('../AI/embedder');
      const routesIndex = require('../AI/routes_index');
      if (!embedder.isInstalled()) {
        ctx.redirect('/search?query=' + encodeURIComponent(raw));
        return;
      }
      const vec = await embedder.embed(raw);
      if (!vec) {
        ctx.redirect('/search?query=' + encodeURIComponent(raw));
        return;
      }
      const isModuleEnabled = (modName) => checkMod(ctx, modName);
      const best = await routesIndex.resolveBest(vec, { isModuleEnabled, embed: embedder.embed });
      if (best && best.path) { ctx.redirect(best.path); return; }
    } catch (_) {}
    ctx.redirect('/search?query=' + encodeURIComponent(raw));
  })
  .post('/pixelia/paint', koaBody(), async (ctx) => {
    const x = Number(ctx.request.body.x), y = Number(ctx.request.body.y), color = ctx.request.body.color;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 1 || x > 50 || y < 1 || y > 200) {
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
    const recipientsArr = (recipients || '').split(',').map(s => s.trim()).filter(Boolean).filter(id => ssbRef.isFeedId(id));
    if (recipientsArr.length === 0) { ctx.throw(400, 'No valid recipients'); return; }
    const cfgNow = getConfig();
    if (cfgNow.pmVisibility === 'mutuals') {
      const viewer = getViewerId();
      for (const rid of recipientsArr) {
        if (rid === viewer) continue;
        let rel;
        try { rel = await friend.getRelationship(rid); } catch (e) { rel = null; }
        const mutual = !!(rel && rel.following && rel.followsMe);
        if (!mutual) ctx.throw(403, 'You can only send private messages to habitants with mutual support.');
      }
    }
    await pmModel.sendMessage(recipientsArr, stripDangerousTags(subject), stripDangerousTags(text));
    await refreshInboxCount();
    ctx.redirect('/inbox?filter=sent');
  })
  .post('/pm/preview', koaBody(), async ctx => {
    const { recipients = '', subject = '', text = '' } = ctx.request.body;
    ctx.body = await pmView(recipients, subject, text, true);
  })
  .post('/inbox/delete/:id', koaBody(), async ctx => {
    await pmModel.deleteMessageById(ctx.params.id);
    await refreshInboxCount();
    ctx.redirect('/inbox');
  })
  .post("/search", koaBody(), async (ctx) => {
    const b = ctx.request.body, query = b.query || "";
    let types = b.type || [];
    if (typeof types === "string") types = [types];
    if (!Array.isArray(types)) types = [];
    if (!query) return ctx.body = await searchView({ messages: [], query, types });
    const userId = getViewerId();
    const allTribes = await tribesModel.listAll();
    const anonTribeIds = new Set(allTribes.filter(t => t.isAnonymous === true).map(t => t.id));
    const applySearchPrivacy = (msgs) => msgs.filter(msg => {
      const c = msg.value?.content;
      if (!c) return true;
      if (c.tribeId && anonTribeIds.has(c.tribeId)) return false;
      if (c.type === 'event' && c.isPublic === 'private' && c.organizer !== userId && !(Array.isArray(c.attendees) && c.attendees.includes(userId))) return false;
      if (c.type === 'task' && String(c.isPublic).toUpperCase() === 'PRIVATE' && c.author !== userId && !(Array.isArray(c.assignees) && c.assignees.includes(userId))) return false;
      if (c.status === 'PRIVATE') return false;
      if (c.type === 'shop' && c.visibility === 'CLOSED' && c.author !== userId) return false;
      return true;
    });
    const results = await searchModel.search({ query, types });
    ctx.body = await searchView({ results: Object.entries(results).reduce((acc, [type, msgs]) => {
      const filtered = applySearchPrivacy(msgs).map(msg => (!msg.value?.content) ? {} : { ...msg, content: msg.value.content, author: msg.value.content.author || 'Unknown' });
      if (filtered.length > 0) acc[type] = filtered;
      return acc;
    }, {}), query, types });
  })
  .post("/subtopic/preview/:message",
    koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }),
    async (ctx) => {
      const { message } = ctx.params;
      const rootMessage = await post.get(message);
      const myFeedId = await meta.myFeedId();
      const rawContentWarning = stripDangerousTags(String(ctx.request.body.contentWarning).trim());
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
    const text = stripDangerousTags(String(ctx.request.body.text));
    const rawContentWarning = stripDangerousTags(String(ctx.request.body.contentWarning).trim());
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
  .post("/comment/preview/:message", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
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
    const text = stripDangerousTags(String(ctx.request.body.text));
    const rawContentWarning = stripDangerousTags(String(ctx.request.body.contentWarning));
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
  .post("/publish/preview", koaBody({multipart: true, formidable: { multiples: false, maxFileSize: maxSize }, urlencoded: true }), async (ctx) => {
    const cw = stripDangerousTags(ctx.request.body.contentWarning?.toString().trim() || "");
    ctx.body = await previewView({ previewData: await preparePreview(ctx), contentWarning: cw.length > 0 ? cw : undefined });
  })
  .post("/publish", koaBody({ multipart: true, urlencoded: true, formidable: { multiples: false, maxFileSize: maxSize } }), async (ctx) => {
    const b = ctx.request.body, text = stripDangerousTags(b.text?.toString().trim() || ""), cw = stripDangerousTags(b.contentWarning?.toString().trim() || "");
    let mentions = [];
    try { mentions = JSON.parse(b.mentions || "[]"); } catch { mentions = await extractMentions(text); }
    await post.root({ text, mentions, contentWarning: cw.length > 0 ? cw : undefined });
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect("/public/latest");
  })
  .post("/publish/custom", koaBody(), async (ctx) => {
    const text = String(ctx.request.body.text);
    const obj = JSON.parse(text);
    const ALLOWED_TYPES = ['post','about','contact','vote','pub','channel'];
    if (!obj.type || !ALLOWED_TYPES.includes(obj.type)) { ctx.throw(400, 'Invalid message type'); return; }
    const sanitizeObj = (o) => { for (const k of Object.keys(o)) { if (typeof o[k] === 'string') o[k] = stripDangerousTags(o[k]); else if (o[k] && typeof o[k] === 'object') sanitizeObj(o[k]); } };
    sanitizeObj(obj);
    ctx.body = await post.publishCustom(obj);
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(`/public/latest`);
  })
  .post("/follow/:feed", koaBody(), async (ctx) => {
    ctx.body = await friend.follow(ctx.params.feed);
    safeRefererRedirect(ctx, '/inhabitants');
  })
  .post("/unfollow/:feed", koaBody(), async (ctx) => {
    ctx.body = await friend.unfollow(ctx.params.feed);
    safeRefererRedirect(ctx, '/inhabitants');
  })
  .post("/block/:feed", koaBody(), async (ctx) => {
    ctx.body = await friend.block(ctx.params.feed);
    safeRefererRedirect(ctx, '/inhabitants');
  })
  .post("/unblock/:feed", koaBody(), async (ctx) => {
    ctx.body = await friend.unblock(ctx.params.feed);
    safeRefererRedirect(ctx, '/inhabitants');
  })
  .post("/spread/:message", koaBody(), async (ctx) => {
    const { message } = ctx.params;
    const ref = ctx.request.header.referer;
    let target = '/public/latest';
    try {
      if (ref) {
        const u = new URL(ref);
        if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host === ctx.host) {
          target = u.pathname + u.search + u.hash;
        }
      }
    } catch (_) {}
    if (!message || typeof message !== 'string' || !message.startsWith('%') || !/\.sha256$/.test(message)) {
      sendErrorPage(ctx, `Spread failed: invalid message id`, { status: 400 });
      return;
    }
    try {
      const ssb = await cooler.open();
      const myId = ssb.id;
      const existing = await new Promise((resolve) => {
        const out = [];
        pull(
          ssb.backlinks.read({ query: [{ $filter: { dest: message } }], reverse: true }),
          pull.filter(ref => {
            if (!ref || !ref.value || !ref.value.content) return false;
            const c = ref.value.content;
            if (ref.value.author !== myId) return false;
            if (c.type === 'spread' && c.link === message) return true;
            if (c.type === 'vote' && c.vote && c.vote.link === message && Number(c.vote.value) === 1) {
              const br = Array.isArray(c.branch) ? c.branch : (typeof c.branch === 'string' ? [c.branch] : []);
              return br.includes(message);
            }
            return false;
          }),
          pull.collect((err, refs) => resolve(!err && refs ? refs : []))
        );
      });
      const tombstoneTargets = new Set();
      await new Promise((resolve) => {
        pull(
          ssb.createUserStream({ id: myId, reverse: true }),
          pull.filter(m => m && m.value && m.value.content && m.value.content.type === 'tombstone'),
          pull.drain(m => { tombstoneTargets.add(m.value.content.target); }, () => resolve())
        );
      });
      const activeExisting = existing.filter(r => !tombstoneTargets.has(r.key));
      let tombstoneTargetId = activeExisting.length > 0 ? activeExisting[0].key : spreads.getCachedActiveOwnSpreadKey(message);
      if (tombstoneTargetId) {
        const tombstone = { type: 'tombstone', target: tombstoneTargetId, deletedAt: new Date().toISOString(), author: myId };
        await new Promise((res, rej) => ssb.publish(tombstone, (e, m) => e ? rej(e) : res(m)));
        spreads.noteOwnTombstone(tombstoneTargetId);
        ctx.redirect(target);
        return;
      }
      let recps = [];
      try {
        const raw = await new Promise((res) => {
          let done = false;
          const timer = setTimeout(() => { if (!done) { done = true; res(null); } }, 1500);
          ssb.get({ id: message, private: true, meta: true }, (err, v) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            res(err ? null : v);
          });
        });
        const value = raw && raw.value ? raw.value : raw;
        const isPrivate = !!(raw && raw.meta && raw.meta.private === true);
        if (isPrivate && value && value.content && Array.isArray(value.content.recps)) {
          recps = value.content.recps.map(r => typeof r === 'string' ? r : (r && r.link)).filter(Boolean);
        }
      } catch (_) {}
      const content = { type: 'spread', link: message, expression: '🔁' };
      if (recps.length) content.recps = recps;
      const publishedMsg = await new Promise((res, rej) => ssb.publish(content, (e, msg) => {
        if (e) rej(e);
        else res(msg);
      }));
      if (publishedMsg && publishedMsg.key) spreads.noteOwnSpread(message, publishedMsg.key);
    } catch (e) {
      sendErrorPage(ctx, `Spread failed: ${e.message || e}`, { status: 500 });
      return;
    }
    ctx.redirect(target);
  })
  .post("/like/:message", koaBody(), async (ctx) => {
    const { message } = ctx.params, voteValue = Number(ctx.request.body.voteValue);
    const ref = ctx.request.header.referer;
    let target = '/public/latest';
    try {
      if (ref) {
        const u = new URL(ref);
        if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host === ctx.host) {
          u.hash = `centered-footer-${encodeURIComponent(message)}`;
          target = u.pathname + u.search + u.hash;
        }
      }
    } catch (_) {}
    const msgData = await post.get(message);
    const isPrivate = msgData.value.meta.private === true;
    const normalized = (isPrivate ? msgData.value.content.recps : []).map(r => typeof r === 'string' ? r : r?.link).filter(Boolean);
    ctx.body = await vote.publish({ messageKey: message, value: voteValue, recps: normalized.length ? normalized : undefined });
    ctx.redirect(target);
  }) 
  .post('/forum/create', koaBody(), async ctx => {
    const { category, title, text } = ctx.request.body;
    await forumModel.createForum(category, stripDangerousTags(title), stripDangerousTags(text));
    ctx.redirect('/forum');
  })
  .post('/forum/:id/message', koaBody(), async ctx => {
    const { message, parentId } = ctx.request.body;
    const cleanedMsg = stripDangerousTags(message);
    const mentions = await extractMentions(cleanedMsg);
    await forumModel.addMessageToForum(ctx.params.id, { text: cleanedMsg, author: getViewerId(), timestamp: new Date().toISOString(), mentions: mentions.length > 0 ? mentions : undefined }, parentId);
    ctx.redirect(`/forum/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/forum/:forumId/vote', koaBody(), async ctx => {
    await forumModel.voteContent(ctx.request.body.target, parseInt(ctx.request.body.value, 10));
    ctx.redirect(ctx.get('referer') || `/forum/${encodeURIComponent(ctx.params.forumId)}`);
  })
  .post('/forum/delete/:id', koaBody(), async ctx => {
    const forum = await forumModel.getForumById(ctx.params.id).catch(() => null);
    if (!forum || forum.author !== getViewerId()) { sendErrorPage(ctx, 'Forbidden', { status: 403 }); return; }
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
    const text = ctx.request.body?.text != null ? stripDangerousTags(String(ctx.request.body.text)) : "";
    const mentions = await extractMentions(text);
    await feedModel.createFeed(text, mentions);
    ctx.redirect("/feed?filter=ALL&msg=feedPublished");
  })
  .post("/feed/opinions/:feedId/:category", async (ctx) => {
    const { feedId, category } = ctx.params;
    try {
      await feedModel.addOpinion(feedId, category);
    } catch { /* already voted or invalid — ignore */ }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(ctx.get("Referer") || "/feed");
  })
  .post("/feed/refeed/:id", koaBody(), async (ctx) => {
    try {
      await feedModel.createRefeed(ctx.params.id);
    } catch (e) {
      if (e.message !== "Already refeeded") throw e;
    }
    ctx.redirect(ctx.get("Referer") || "/feed");
  })
  .post("/feed/:feedId/comments", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const text = ctx.request.body?.text != null ? stripDangerousTags(String(ctx.request.body.text)) : "";
    const imageMarkdown = ctx.request.files?.blob ? await handleBlobUpload(ctx, 'blob') : null;
    const fullText = imageMarkdown ? (text ? text + '\n' : '') + imageMarkdown : text;
    await feedModel.addComment(ctx.params.feedId, fullText);
    ctx.redirect(`/feed/${encodeURIComponent(ctx.params.feedId)}`);
  })
  .post("/bookmarks/create", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    await bookmarksModel.createBookmark(stripDangerousTags(b.url), b.tags, stripDangerousTags(b.description), b.category, b.lastVisit);
    ctx.redirect(safeReturnTo(ctx, '/bookmarks?filter=all', ['/bookmarks']));
  })
  .post("/bookmarks/update/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    await bookmarksModel.updateBookmarkById(ctx.params.id, { url: stripDangerousTags(b.url), tags: b.tags, description: stripDangerousTags(b.description), category: b.category, lastVisit: b.lastVisit });
    ctx.redirect(safeReturnTo(ctx, '/bookmarks?filter=mine', ['/bookmarks']));
  })
  .post("/bookmarks/delete/:id", koaBody(), async ctx => deleteAction(ctx, 'bookmarks'))
  .post("/bookmarks/opinions/:bookmarkId/:category", koaBody(), async ctx => opinionAction(ctx, 'bookmarks', 'bookmarkId'))
  .post("/bookmarks/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'bookmarks', 'add'))
  .post("/bookmarks/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'bookmarks', 'remove'))
  .post("/bookmarks/:bookmarkId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'bookmarks', 'bookmarkId'))
  .post("/images/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'imagesMod')) { ctx.redirect('/modules'); return; }
    const blob = await handleBlobUpload(ctx, 'image'), b = ctx.request.body;
    await imagesModel.createImage(blob, b.tags, stripDangerousTags(b.title), stripDangerousTags(b.description), parseBool01(b.meme), stripDangerousTags(b.mapUrl || ""));
    ctx.redirect(safeReturnTo(ctx, '/images?filter=all', ['/images']));
  })
  .post("/images/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'imagesMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, blob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    await imagesModel.updateImageById(ctx.params.id, blob, b.tags, stripDangerousTags(b.title), stripDangerousTags(b.description), parseBool01(b.meme), stripDangerousTags(b.mapUrl || ""));
    ctx.redirect(safeReturnTo(ctx, '/images?filter=mine', ['/images']));
  })
  .post("/images/delete/:id", koaBody(), async ctx => deleteAction(ctx, 'images'))
  .post("/images/opinions/:imageId/:category", koaBody(), async ctx => opinionAction(ctx, 'images', 'imageId'))
  .post("/images/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'images', 'add'))
  .post("/images/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'images', 'remove'))
  .post("/images/:imageId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'images', 'imageId'))
  .post("/maps/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    if (b.tribeId) {
      const t = await tribesModel.getTribeById(b.tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    const imageId = extractBlobId(await handleBlobUpload(ctx, 'image')) || "";
    const newMap = await mapsModel.createMap(b.lat, b.lng, stripDangerousTags(b.description), b.mapType, b.tags, stripDangerousTags(b.title), b.tribeId || null, stripDangerousTags(b.markerLabel), imageId);
    const redir = b.tribeId ? `/tribe/${encodeURIComponent(b.tribeId)}?section=maps` : safeReturnTo(ctx, '/maps?filter=all', ['/maps']);
    ctx.redirect(redir);
  })
  .post("/maps/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    const target = await mapsModel.getMapById(ctx.params.id, getViewerId()).catch(() => null);
    if (target && target.tribeId) {
      const t = await tribesModel.getTribeById(target.tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    const b = ctx.request.body;
    const imageId = ctx.request.files?.image ? extractBlobId(await handleBlobUpload(ctx, 'image')) || "" : "";
    await mapsModel.updateMapById(ctx.params.id, b.lat, b.lng, stripDangerousTags(b.description), b.mapType, b.tags, stripDangerousTags(b.title), imageId || undefined);
    ctx.redirect(safeReturnTo(ctx, '/maps?filter=mine', ['/maps']));
  })
  .post("/maps/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    const target = await mapsModel.getMapById(ctx.params.id, getViewerId()).catch(() => null);
    if (target && target.tribeId) {
      const t = await tribesModel.getTribeById(target.tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    await mapsModel.deleteMapById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/maps?filter=mine', ['/maps']));
  })
  .post("/maps/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'maps', 'add'))
  .post("/maps/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'maps', 'remove'))
  .post("/maps/generate-invite/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    try {
      const code = await mapsModel.generateInvite(ctx.params.id);
      ctx.body = `<html><body><p>Map invite code: <code>${code}</code></p><p><a href="/maps/${encodeURIComponent(ctx.params.id)}">Back</a></p></body></html>`;
    } catch (e) {
      ctx.redirect(`/maps/${encodeURIComponent(ctx.params.id)}`);
    }
  })
  .post("/maps/join-code", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    const code = String((ctx.request.body || {}).code || "").trim();
    try {
      const mapId = await mapsModel.joinByInvite(code);
      ctx.redirect(`/maps/${encodeURIComponent(mapId)}`);
    } catch (_) {
      ctx.redirect('/maps');
    }
  })
  .post("/maps/join/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    try { await mapsModel.joinMap(ctx.params.id); } catch (_) {}
    ctx.redirect(`/maps/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/maps/:mapId/marker", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const mapItem = await mapsModel.getMapById(ctx.params.mapId, uid);
    if (mapItem.tribeId) {
      try {
        const t = await tribesModel.getTribeById(mapItem.tribeId);
        if (!t.members.includes(uid)) { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
      } catch { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
    }
    const b = ctx.request.body;
    const imageBlobId = extractBlobId(await handleBlobUpload(ctx, 'image')) || "";
    await mapsModel.addMarker(ctx.params.mapId, b.mkLat, b.mkLng, stripDangerousTags(b.label), imageBlobId);
    ctx.redirect(safeReturnTo(ctx, `/maps/${encodeURIComponent(ctx.params.mapId)}`, ['/maps']));
  })
  .post("/audios/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => mediaCreateAction(ctx, 'audios'))
  .post("/audios/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => mediaUpdateAction(ctx, 'audios'))
  .post("/audios/delete/:id", koaBody(), async ctx => deleteAction(ctx, 'audios'))
  .post("/audios/opinions/:audioId/:category", koaBody(), async ctx => opinionAction(ctx, 'audios', 'audioId'))
  .post("/audios/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'audios', 'add'))
  .post("/audios/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'audios', 'remove'))
  .post("/audios/:audioId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'audios', 'audioId'))
  .post("/torrents/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    const { tags, title, description, tribeId } = ctx.request.body;
    const cleanTribeId = tribeId ? String(tribeId).trim() : null;
    if (cleanTribeId) {
      const t = await tribesModel.getTribeById(cleanTribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    const blob = await handleBlobUpload(ctx, 'torrent');
    const fileSize = ctx.request.files?.torrent?.size || 0;
    await torrentsModel.createTorrent(blob, stripDangerousTags(tags), stripDangerousTags(title), stripDangerousTags(description), fileSize, cleanTribeId);
    ctx.redirect(cleanTribeId ? `/tribe/${encodeURIComponent(cleanTribeId)}?section=torrents` : safeReturnTo(ctx, '/torrents?filter=all', ['/torrents']));
  })
  .post("/torrents/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    const target = await torrentsModel.getTorrentById(ctx.params.id, getViewerId()).catch(() => null);
    if (target && target.tribeId) {
      const t = await tribesModel.getTribeById(target.tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    const { tags, title, description } = ctx.request.body;
    const blob = ctx.request.files?.torrent ? await handleBlobUpload(ctx, 'torrent') : null;
    await torrentsModel.updateTorrentById(ctx.params.id, blob, stripDangerousTags(tags), stripDangerousTags(title), stripDangerousTags(description));
    ctx.redirect(safeReturnTo(ctx, '/torrents?filter=mine', ['/torrents']));
  })
  .post("/torrents/delete/:id", koaBody(), async ctx => {
    const target = await torrentsModel.getTorrentById(ctx.params.id, getViewerId()).catch(() => null);
    if (target && target.tribeId) {
      const t = await tribesModel.getTribeById(target.tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    return deleteAction(ctx, 'torrents');
  })
  .post("/torrents/opinions/:torrentId/:category", koaBody(), async ctx => {
    const target = await torrentsModel.getTorrentById(ctx.params.torrentId, getViewerId()).catch(() => null);
    if (target && target.tribeId) {
      const t = await tribesModel.getTribeById(target.tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    return opinionAction(ctx, 'torrents', 'torrentId');
  })
  .post("/torrents/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'torrents', 'add'))
  .post("/torrents/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'torrents', 'remove'))
  .post("/torrents/:torrentId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'torrents', 'torrentId'))
  .post("/videos/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => mediaCreateAction(ctx, 'videos'))
  .post("/videos/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => mediaUpdateAction(ctx, 'videos'))
  .post("/videos/delete/:id", koaBody(), async ctx => deleteAction(ctx, 'videos'))
  .post("/videos/opinions/:videoId/:category", koaBody(), async ctx => opinionAction(ctx, 'videos', 'videoId'))
  .post("/videos/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'videos', 'add'))
  .post("/videos/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'videos', 'remove'))
  .post("/videos/:videoId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'videos', 'videoId'))
  .post("/documents/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const docBlob = await handleBlobUpload(ctx, "document"), b = ctx.request.body;
    await documentsModel.createDocument(docBlob, b.tags, stripDangerousTags(b.title), stripDangerousTags(b.description));
    ctx.redirect(safeReturnTo(ctx, "/documents?filter=all", ["/documents"]));
  })
  .post("/documents/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const b = ctx.request.body, blob = ctx.request.files?.document ? await handleBlobUpload(ctx, "document") : null;
    await documentsModel.updateDocumentById(ctx.params.id, blob, b.tags, stripDangerousTags(b.title), stripDangerousTags(b.description));
    ctx.redirect(safeReturnTo(ctx, "/documents?filter=mine", ["/documents"]));
  })
  .post("/documents/delete/:id", koaBody(), async ctx => deleteAction(ctx, 'documents'))
  .post("/documents/opinions/:documentId/:category", koaBody(), async ctx => opinionAction(ctx, 'documents', 'documentId'))
  .post("/documents/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'documents', 'add'))
  .post("/documents/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'documents', 'remove'))
  .post("/documents/:documentId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'documents', 'documentId'))
  .post('/cv/upload', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    const photoUrl = await handleBlobUpload(ctx, 'image')
    await cvModel.createCV(ctx.request.body, photoUrl)
    ctx.redirect('/cv')
  })
  .post('/cv/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    const photoUrl = await handleBlobUpload(ctx, 'image')
    await cvModel.updateCV(ctx.params.id, ctx.request.body, photoUrl)
    ctx.redirect('/cv')
  })
  .post('/cv/delete/:id', async ctx => {
    await cvModel.deleteCVById(ctx.params.id)
    ctx.redirect('/cv')
  })
  .post('/cv/visibility/:id', koaBody(), async ctx => {
    const cv = await cvModel.getCVByUserId().catch(() => null);
    if (!cv || cv.id !== ctx.params.id) { sendErrorPage(ctx, 'CV not found', { status: 404 }); return; }
    const next = String(ctx.request.body?.visibility || '').toUpperCase() === 'HIDDEN' ? 'HIDDEN' : 'PUBLIC';
    await cvModel.updateCV(ctx.params.id, { ...cv, visibility: next }, cv.photo || null);
    ctx.redirect('/cv');
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
  .post('/tribes/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title') || tooLong(ctx, b.description, MAX_TEXT_LENGTH, 'Description')) return;
    if (!['strict', 'open'].includes(b.inviteMode)) { ctx.redirect('/tribes'); return; }
    const image = await handleBlobUpload(ctx, 'image');
    const tribeRes = await tribesModel.createTribe(stripDangerousTags(b.title), stripDangerousTags(b.description), image, stripDangerousTags(b.location), b.tags, b.isAnonymous === 'true', b.inviteMode, null, 'OPEN', stripDangerousTags(b.mapUrl));
    try { if (tribeRes?.key) await parliamentModel.tribe.publishInitialTerm(tribeRes.key); } catch (e) { console.error('publishInitialTerm failed:', e); }
    ctx.redirect('/tribes');
  })
  .post('/tribe/:id/subtribes/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const parentTribe = await tribesModel.getTribeById(ctx.params.id);
    const viewerId = getViewerId();
    const canCreate = parentTribe.inviteMode === 'open'
      ? parentTribe.members.includes(viewerId)
      : parentTribe.author === viewerId;
    if (!canCreate) { ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=subtribes`); return; }
    const b = ctx.request.body;
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title') || tooLong(ctx, b.description, MAX_TEXT_LENGTH, 'Description')) return;
    const image = await handleBlobUpload(ctx, 'image');
    const parentEffective = await tribesModel.getEffectiveStatus(ctx.params.id).catch(() => ({ isPrivate: false }));
    const effectiveAnonymous = !!(parentEffective.isPrivate || parentTribe.isAnonymous);
    await tribesModel.createTribe(stripDangerousTags(b.title), stripDangerousTags(b.description), image, stripDangerousTags(b.location), b.tags, effectiveAnonymous, b.inviteMode || 'open', ctx.params.id, 'OPEN', stripDangerousTags(b.mapUrl));
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=subtribes`);
  })
  .post('/tribes/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (tribe.author !== getViewerId()) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const b = ctx.request.body;
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title') || tooLong(ctx, b.description, MAX_TEXT_LENGTH, 'Description')) return;
    if (b.inviteMode && !['strict', 'open'].includes(b.inviteMode)) { ctx.redirect('/tribes'); return; }
    const tags = b.tags ? b.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const isSub = !!tribe.parentTribeId;
    const updateFields = { title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), image: await handleBlobUpload(ctx, 'image'), location: stripDangerousTags(b.location), tags, inviteMode: b.inviteMode || tribe.inviteMode, status: b.status || tribe.status || 'OPEN' };
    if (isSub) {
      updateFields.isAnonymous = !!tribe.isAnonymous;
    } else {
      updateFields.isAnonymous = b.isAnonymous === 'true';
    }
    await tribesModel.updateTribeById(ctx.params.id, updateFields);
    ctx.redirect('/tribes?filter=mine');
  })
  .post('/tribes/delete/:id', async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (tribe.author !== getViewerId()) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    await tribesModel.deleteTribeById(ctx.params.id)
    ctx.redirect('/tribes?filter=mine')
  })
  .post('/tribes/generate-invite', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    ctx.body = await renderInvitePage(await tribesModel.generateInvite(ctx.request.body.tribeId));
  })
  .post('/tribes/join-code', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    await tribesModel.joinByInvite(ctx.request.body.inviteCode)
    ctx.redirect('/tribes?filter=membership')
  })
  .post('/tribes/leave/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    await tribesModel.leaveTribe(ctx.params.id)
    ctx.redirect('/tribes?filter=membership')
  })
  .post('/tribe/:id/message', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    const uid = getViewerId();
    if (!tribe.members.includes(uid)) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    if (tooLong(ctx, ctx.request.body.message, MAX_TEXT_LENGTH, 'Text')) return;
    const message = stripDangerousTags((ctx.request.body.message || '').trim());
    if (!message || message.length === 0 || message.length > 280) { ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=feed`); return; }
    await tribesContentModel.create(tribe.id, 'feed', { description: await resolveMentionText(message) });
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=feed&sent=1`);
  })
  .post('/tribe/:id/refeed/:msgId', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    const uid = getViewerId();
    if (!tribe.members.includes(uid)) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    await tribesContentModel.toggleRefeed(ctx.params.msgId);
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=feed`);
  })
  .post('/tribe/:id/events/create', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const b = ctx.request.body;
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title') || tooLong(ctx, b.description, MAX_TEXT_LENGTH, 'Description')) return;
    if (b.date && b.date < new Date().toISOString().split('T')[0]) { ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=events&action=create`); return; }
    await tribesContentModel.create(tribe.id, 'event', { title: stripDangerousTags(b.title), description: await resolveMentionText(stripDangerousTags(b.description)), date: b.date, location: stripDangerousTags(b.location), attendees: [getViewerId()] });
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=events`);
  })
  .post('/tribe/:id/events/attend/:eventId', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    await tribesContentModel.toggleAttendee(ctx.params.eventId);
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=events`);
  })
  .post('/tribe/:id/tasks/create', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const b = ctx.request.body;
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title') || tooLong(ctx, b.description, MAX_TEXT_LENGTH, 'Description')) return;
    if (b.deadline && b.deadline < new Date().toISOString().split('T')[0]) { ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=tasks&action=create`); return; }
    await tribesContentModel.create(tribe.id, 'task', { title: stripDangerousTags(b.title), description: await resolveMentionText(stripDangerousTags(b.description)), priority: b.priority, deadline: b.deadline, assignees: [] });
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=tasks`);
  })
  .post('/tribe/:id/tasks/assign/:taskId', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    await tribesContentModel.toggleAssignee(ctx.params.taskId);
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=tasks`);
  })
  .post('/tribe/:id/tasks/status/:taskId', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const item = await tribesContentModel.getById(ctx.params.taskId);
    if (!item || item.author !== getViewerId()) { ctx.status = 403; ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=tasks`); return; }
    await tribesContentModel.updateStatus(ctx.params.taskId, ctx.request.body.status);
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=tasks`);
  })
  .post('/tribe/:id/votations/create', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const b = ctx.request.body;
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title') || tooLong(ctx, b.description, MAX_TEXT_LENGTH, 'Description')) return;
    if (b.deadline && b.deadline < new Date().toISOString().split('T')[0]) { ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=votations&action=create`); return; }
    const options = [b.option1, b.option2, b.option3, b.option4].filter(Boolean).map(o => stripDangerousTags(o));
    await tribesContentModel.create(tribe.id, 'votation', { title: stripDangerousTags(b.title), description: await resolveMentionText(stripDangerousTags(b.description)), deadline: b.deadline, options, votes: {} });
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=votations`);
  })
  .post('/tribe/:id/votations/:voteId/vote', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    await tribesContentModel.castVote(ctx.params.voteId, parseInt(ctx.request.body.optionIndex, 10));
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=votations`);
  })
  .post('/tribe/:id/votations/close/:voteId', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const votation = await tribesContentModel.getById(ctx.params.voteId);
    if (!votation || votation.author !== getViewerId()) { ctx.status = 403; ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=votations`); return; }
    await tribesContentModel.updateStatus(ctx.params.voteId, 'CLOSED');
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=votations`);
  })
  .post('/tribe/:id/forum/create', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const b = ctx.request.body;
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title') || tooLong(ctx, b.description, MAX_TEXT_LENGTH, 'Description')) return;
    await tribesContentModel.create(tribe.id, 'forum', { title: stripDangerousTags(b.title), description: await resolveMentionText(stripDangerousTags(b.description)), category: b.category });
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=forum`);
  })
  .post('/tribe/:id/forum/:forumId/reply', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const b = ctx.request.body;
    if (tooLong(ctx, b.description, MAX_TEXT_LENGTH, 'Description')) return;
    await tribesContentModel.create(tribe.id, 'forum-reply', { description: await resolveMentionText(stripDangerousTags(b.description)), parentId: ctx.params.forumId });
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=forum&thread=${encodeURIComponent(ctx.params.forumId)}`);
  })
  .post('/tribe/:id/forum/:forumId/refeed', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    const uid = getViewerId();
    if (!tribe.members.includes(uid)) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    await tribesContentModel.toggleRefeed(ctx.params.forumId);
    const thread = ctx.query.thread || '';
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=forum${thread ? '&thread=' + encodeURIComponent(thread) : ''}`);
  })
  .post('/tribe/:id/media/upload', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const b = ctx.request.body;
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title') || tooLong(ctx, b.description, MAX_TEXT_LENGTH, 'Description')) return;
    const returnSection = b.returnSection || 'media';
    const mediaType = b.mediaType || 'image';
    let blobRef = null;
    if (mediaType === 'bookmark') {
      const url = stripDangerousTags(b.url || '');
      await tribesContentModel.create(tribe.id, 'media', { title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), mediaType: 'bookmark', url });
    } else {
      const blobMarkdownMedia = await handleBlobUpload(ctx, 'media');
      blobRef = blobMarkdownMedia ? ((blobMarkdownMedia.match(/\((&[^)]+)\)/) || [])[1] || blobMarkdownMedia) : null;
      await tribesContentModel.create(tribe.id, 'media', { title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), mediaType, image: blobRef });
    }
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=${returnSection}`);
  })
  .post('/tribe/:id/content/delete/:contentId', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribeRedirect = `/tribe/${encodeURIComponent(ctx.params.id)}`;
    const item = await tribesContentModel.getById(ctx.params.contentId);
    if (!item || item.author !== getViewerId() || item.tribeId !== ctx.params.id) { ctx.status = 403; ctx.redirect(tribeRedirect); return; }
    await tribesContentModel.deleteById(ctx.params.contentId);
    ctx.redirect(tribeRedirect);
  })
  .post('/tribe/:id/content/:contentId/opinion/:category', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const item = await tribesContentModel.getById(ctx.params.contentId);
    if (!item || item.tribeId !== ctx.params.id) { ctx.status = 404; ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=opinions`); return; }
    try {
      await tribesContentModel.castOpinion(ctx.params.contentId, ctx.params.category);
    } catch (_) {}
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=opinions`);
  })
  .post('/panic/remove', koaBody(), async (ctx) => {
    const { exec } = require('child_process');
    try {
      await panicmodeModel.removeSSB();
      sendErrorPage(ctx, 'Your blockchain has been successfully deleted!');
      exec('pkill -f "node SSB_server.js start"');
      setTimeout(() => process.exit(0), 1000);
    } catch (error) { sendErrorPage(ctx, 'Error deleting your blockchain: ' + error.message); }
  })
  .post('/export/create', async (ctx) => {
    try {
      const outputPath = path.join(os.homedir(), 'ssb_exported.zip');
      await exportmodeModel.exportSSB(outputPath);
      ctx.set('Content-Type', 'application/zip');
      ctx.set('Content-Disposition', `attachment; filename=ssb_exported.zip`);
      ctx.body = fs.createReadStream(outputPath);
      ctx.res.on('finish', () => fs.unlinkSync(outputPath));
    } catch (error) { sendErrorPage(ctx, 'Error exporting your blockchain: ' + error.message); }
  })
  .post('/tasks/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    const b = ctx.request.body;
    const imageMarkdown = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    let desc = stripDangerousTags(b.description);
    if (imageMarkdown) desc = (desc ? desc + '\n' : '') + imageMarkdown;
    await tasksModel.createTask(stripDangerousTags(b.title), desc, b.startTime, b.endTime, b.priority, stripDangerousTags(b.location), b.tags, b.isPublic);
    ctx.redirect(safeReturnTo(ctx, '/tasks?filter=mine', ['/tasks']));
  })
  .post('/tasks/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    const b = ctx.request.body, tags = Array.isArray(b.tags) ? b.tags.filter(Boolean) : (typeof b.tags === 'string' ? b.tags.split(',').map(t => t.trim()).filter(Boolean) : []);
    const imageMarkdown = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    let desc = stripDangerousTags(b.description);
    if (imageMarkdown) desc = (desc ? desc + '\n' : '') + imageMarkdown;
    await tasksModel.updateTaskById(ctx.params.id, { title: stripDangerousTags(b.title), description: desc, startTime: b.startTime, endTime: b.endTime, priority: b.priority, location: stripDangerousTags(b.location), tags, isPublic: b.isPublic });
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
  .post('/tasks/:taskId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'tasks', 'taskId'))
  .post('/reports/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    const b = ctx.request.body, image = await handleBlobUpload(ctx, 'image');
    await reportsModel.createReport(stripDangerousTags(b.title), stripDangerousTags(b.description), b.category, image, b.tags, b.severity, {
      stepsToReproduce: stripDangerousTags(b.stepsToReproduce), expectedBehavior: stripDangerousTags(b.expectedBehavior), actualBehavior: stripDangerousTags(b.actualBehavior), environment: stripDangerousTags(b.environment), reproduceRate: b.reproduceRate,
      problemStatement: stripDangerousTags(b.problemStatement), userStory: stripDangerousTags(b.userStory), acceptanceCriteria: stripDangerousTags(b.acceptanceCriteria),
      whatHappened: stripDangerousTags(b.whatHappened), reportedUser: b.reportedUser, evidenceLinks: stripDangerousTags(b.evidenceLinks),
      contentLocation: stripDangerousTags(b.contentLocation), whyInappropriate: stripDangerousTags(b.whyInappropriate), requestedAction: stripDangerousTags(b.requestedAction)
    });
    ctx.redirect('/reports');
  })
  .post('/reports/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    const b = ctx.request.body, image = await handleBlobUpload(ctx, 'image');
    await reportsModel.updateReportById(ctx.params.id, {
      title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), category: b.category, image, tags: b.tags, severity: b.severity,
      template: {
        stepsToReproduce: stripDangerousTags(b.stepsToReproduce), expectedBehavior: stripDangerousTags(b.expectedBehavior), actualBehavior: stripDangerousTags(b.actualBehavior), environment: stripDangerousTags(b.environment), reproduceRate: b.reproduceRate,
        problemStatement: stripDangerousTags(b.problemStatement), userStory: stripDangerousTags(b.userStory), acceptanceCriteria: stripDangerousTags(b.acceptanceCriteria),
        whatHappened: stripDangerousTags(b.whatHappened), reportedUser: stripDangerousTags(b.reportedUser), evidenceLinks: stripDangerousTags(b.evidenceLinks),
        contentLocation: stripDangerousTags(b.contentLocation), whyInappropriate: stripDangerousTags(b.whyInappropriate), requestedAction: stripDangerousTags(b.requestedAction)
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
  .post('/reports/:reportId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'reports', 'reportId'))
  .post('/events/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const b = ctx.request.body;
    const imageMarkdown = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    let desc = stripDangerousTags(b.description);
    if (imageMarkdown) desc = (desc ? desc + '\n' : '') + imageMarkdown;
    const evResult = await eventsModel.createEvent(stripDangerousTags(b.title), desc, b.date, stripDangerousTags(b.location), b.price, b.url, b.attendees || [], b.tags, b.isPublic, stripDangerousTags(b.mapUrl), b.clearnetPublic);
    if ([].concat(b.addToCalendar).includes("1") && evResult && evResult.key) {
      try {
        await calendarsModel.createCalendar({
          title: stripDangerousTags(b.title),
          status: 'OPEN',
          deadline: '',
          tags: b.tags,
          firstDate: b.date,
          firstDateLabel: stripDangerousTags(b.title),
          firstNote: `/events/${evResult.key}`,
          intervalWeekly: 0,
          intervalMonthly: 0,
          intervalYearly: 0
        });
      } catch (_) {}
    }
    ctx.redirect(safeReturnTo(ctx, '/events?filter=mine', ['/events']));
  })
  .post('/events/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const b = ctx.request.body, existing = await eventsModel.getEventById(ctx.params.id);
    const imageMarkdown = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    let desc = stripDangerousTags(b.description);
    if (imageMarkdown) desc = (desc ? desc + '\n' : '') + imageMarkdown;
    await eventsModel.updateEventById(ctx.params.id, { title: stripDangerousTags(b.title), description: desc, date: b.date, location: stripDangerousTags(b.location), price: b.price, url: b.url, attendees: b.attendees, tags: b.tags, isPublic: b.isPublic, createdAt: existing.createdAt, organizer: existing.organizer, mapUrl: stripDangerousTags(b.mapUrl), clearnetPublic: b.clearnetPublic });
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
  .post('/events/:eventId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'events', 'eventId'))
  .post('/votes/create', koaBody(), async ctx => {
    const b = ctx.request.body, defaultOptions = ['YES', 'NO', 'ABSTENTION', 'CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'];
    const parsedOptions = b.options ? b.options.split(',').map(o => o.trim()).filter(Boolean) : defaultOptions;
    await votesModel.createVote(stripDangerousTags(b.question), b.deadline, parsedOptions, String(b.tags || '').split(',').map(t => t.trim()).filter(Boolean));
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=mine', ['/votes']));
  })
  .post('/votes/update/:id', koaBody(), async ctx => {
    const b = ctx.request.body, parsedOptions = b.options ? b.options.split(',').map(o => o.trim()).filter(Boolean) : undefined;
    await votesModel.updateVoteById(ctx.params.id, { question: stripDangerousTags(b.question), deadline: b.deadline, options: parsedOptions, tags: b.tags ? b.tags.split(',').map(t => t.trim()).filter(Boolean) : [] });
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
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/votes', ['/votes']));
  })
  .post('/events/opinions/:eventId/:category', koaBody(), async ctx => {
    try { await eventsModel.createOpinion(ctx.params.eventId, ctx.params.category); }
    catch (e) { if (!/already/i.test(String(e?.message || ''))) throw e; ctx.flash = { message: "You have already opined." }; }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/events', ['/events']));
  })
  .post('/tasks/opinions/:taskId/:category', koaBody(), async ctx => {
    try { await tasksModel.createOpinion(ctx.params.taskId, ctx.params.category); }
    catch (e) { if (!/already/i.test(String(e?.message || ''))) throw e; ctx.flash = { message: "You have already opined." }; }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/tasks', ['/tasks']));
  })
  .post('/reports/opinions/:reportId/:category', koaBody(), async ctx => {
    try { await reportsModel.createOpinion(ctx.params.reportId, ctx.params.category); }
    catch (e) { if (!/already/i.test(String(e?.message || ''))) throw e; ctx.flash = { message: "You have already opined." }; }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/reports', ['/reports']));
  })
  .post('/projects/opinions/:projectId/:category', koaBody(), async ctx => {
    try { await projectsModel.createOpinion(ctx.params.projectId, ctx.params.category); }
    catch (e) { if (!/already/i.test(String(e?.message || ''))) throw e; ctx.flash = { message: "You have already opined." }; }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/projects', ['/projects']));
  })
  .post('/votes/:voteId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'votes', 'voteId'))
  .post('/parliament/candidatures/propose', koaBody(), async (ctx) => {
    const b = ctx.request.body || {}, id = String(b.candidateId || '').trim(), m = String(b.method || '').trim().toUpperCase();
    if (!id) ctx.throw(400, 'Candidate is required.');
    if (!new Set(['DEMOCRACY','MAJORITY','MINORITY','DICTATORSHIP','KARMATOCRACY']).has(m)) ctx.throw(400, 'Invalid method.');
    await parliamentModel.proposeCandidature({ candidateId: id, method: m }).catch(e => ctx.throw(400, String(e?.message || e)));
    ctx.redirect('/parliament?filter=candidatures');
  })
  .post('/tribe/:id/governance/publish-candidature', koaBody(), async (ctx) => {
    const tribeId = ctx.params.id;
    const uid = getViewerId();
    const tribe = await tribesModel.getTribeById(tribeId).catch(() => null);
    if (!tribe) ctx.throw(404, 'Tribe not found');
    if (tribe.parentTribeId) ctx.throw(400, 'Sub-tribes have no governance');
    const isCreator = tribe.author === uid;
    const isMember = Array.isArray(tribe.members) && tribe.members.includes(uid);
    if (!isCreator && !isMember) ctx.throw(403, 'Not a tribe member');
    const globalTerm = await parliamentModel.getCurrentTerm().catch(() => null);
    const already = await parliamentModel.tribe.hasCandidatureInGlobalCycle(tribeId, globalTerm?.startAt).catch(() => false);
    if (already) ctx.throw(400, 'This tribe already has an open candidature in the current global parliament cycle.');
    const term = await parliamentModel.tribe.getCurrentTerm(tribeId).catch(() => null);
    const rawMethod = (term?.method && String(term.method).toUpperCase()) || 'DEMOCRACY';
    const method = rawMethod === 'ANARCHY' ? 'DEMOCRACY' : rawMethod;
    await parliamentModel.proposeCandidature({ candidateId: tribeId, method }).catch(e => ctx.throw(400, String(e?.message || e)));
    ctx.redirect('/parliament?filter=candidatures');
  })
  .post('/tribe/:id/governance/candidature/propose', koaBody(), async (ctx) => {
    const tribeId = ctx.params.id;
    const uid = getViewerId();
    const tribe = await tribesModel.getTribeById(tribeId).catch(() => null);
    if (!tribe) ctx.throw(404, 'Tribe not found');
    if (tribe.parentTribeId) ctx.throw(400, 'Sub-tribes have no governance');
    const isCreator = tribe.author === uid;
    const isMember = Array.isArray(tribe.members) && tribe.members.includes(uid);
    if (!isCreator && !isMember) ctx.throw(403, 'Not a tribe member');
    const b = ctx.request.body || {};
    const candidateId = String(b.candidateId || '').trim();
    const method = String(b.method || '').trim().toUpperCase();
    if (!candidateId) ctx.throw(400, 'Candidate required');
    await parliamentModel.tribe.publishTribeCandidature({ tribeId, candidateId, method }).catch(e => ctx.throw(400, String(e?.message || e)));
    ctx.redirect(`/tribe/${encodeURIComponent(tribeId)}?section=governance&filter=candidatures`);
  })
  .post('/tribe/:id/governance/candidature/vote', koaBody(), async (ctx) => {
    const tribeId = ctx.params.id;
    const uid = getViewerId();
    const tribe = await tribesModel.getTribeById(tribeId).catch(() => null);
    if (!tribe) ctx.throw(404, 'Tribe not found');
    if (tribe.parentTribeId) ctx.throw(400, 'Sub-tribes have no governance');
    const isCreator = tribe.author === uid;
    const isMember = Array.isArray(tribe.members) && tribe.members.includes(uid);
    if (!isCreator && !isMember) ctx.throw(403, 'Not a tribe member');
    const candidatureId = String(ctx.request.body?.candidatureId || '').trim();
    if (!candidatureId) ctx.throw(400, 'Missing candidatureId');
    await parliamentModel.tribe.voteTribeCandidature({ tribeId, candidatureId }).catch(e => ctx.throw(400, String(e?.message || e)));
    ctx.redirect(`/tribe/${encodeURIComponent(tribeId)}?section=governance&filter=candidatures`);
  })
  .post('/tribe/:id/governance/rule/add', koaBody(), async (ctx) => {
    const tribeId = ctx.params.id;
    const uid = getViewerId();
    const tribe = await tribesModel.getTribeById(tribeId).catch(() => null);
    if (!tribe) ctx.throw(404, 'Tribe not found');
    if (tribe.parentTribeId) ctx.throw(400, 'Sub-tribes have no governance');
    if (tribe.author !== uid) ctx.throw(403, 'Only tribe creator can add rules');
    const b = ctx.request.body || {};
    await parliamentModel.tribe.publishTribeRule({ tribeId, title: stripDangerousTags(String(b.title || '')), body: stripDangerousTags(String(b.body || '')) }).catch(e => ctx.throw(400, String(e?.message || e)));
    ctx.redirect(`/tribe/${encodeURIComponent(tribeId)}?section=governance&filter=rules`);
  })
  .post('/tribe/:id/governance/rule/delete', koaBody(), async (ctx) => {
    const tribeId = ctx.params.id;
    const uid = getViewerId();
    const tribe = await tribesModel.getTribeById(tribeId).catch(() => null);
    if (!tribe) ctx.throw(404, 'Tribe not found');
    if (tribe.parentTribeId) ctx.throw(400, 'Sub-tribes have no governance');
    if (tribe.author !== uid) ctx.throw(403, 'Only tribe creator can delete rules');
    const ruleId = String(ctx.request.body?.ruleId || '').trim();
    if (!ruleId) ctx.throw(400, 'Missing ruleId');
    await parliamentModel.tribe.deleteTribeRule(ruleId).catch(e => ctx.throw(400, String(e?.message || e)));
    ctx.redirect(`/tribe/${encodeURIComponent(tribeId)}?section=governance&filter=rules`);
  })
  .post('/parliament/candidatures/:id/vote', koaBody(), async (ctx) => {
    await parliamentModel.voteCandidature(ctx.params.id).catch(e => ctx.throw(400, String(e?.message || e)));
    ctx.redirect('/parliament?filter=candidatures');
  })
  .post('/parliament/proposals/create', koaBody(), async (ctx) => {
    const b = ctx.request.body || {}, t = String(b.title || '').trim(), d = String(b.description || '').trim();
    if (!t) ctx.throw(400, 'Title is required.');
    if (d.length > 1000) ctx.throw(400, 'Description must be ≤ 1000 chars.');
    await parliamentModel.createProposal({ title: stripDangerousTags(t), description: stripDangerousTags(d) }).catch(e => ctx.throw(400, String(e?.message || e)));
    ctx.redirect('/parliament?filter=proposals');
  })
  .post('/parliament/proposals/close/:id', koaBody(), async (ctx) => {
    const canClose = await parliamentModel.canPropose();
    if (!canClose) { sendErrorPage(ctx, 'Forbidden', { status: 403 }); return; }
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
    if (!/^@[A-Za-z0-9+/]+=*\.ed25519$/.test(respondent)) { ctx.flash = { message: 'Invalid respondent ID. Must be a valid SSB ID (@...ed25519).' }; return ctx.redirect('/courts?filter=cases'); }
    if (!new Set(['JUDGE','DICTATOR','POPULAR','MEDIATION','KARMATOCRACY']).has(method)) { ctx.flash = { message: 'Invalid resolution method.' }; return ctx.redirect('/courts?filter=cases'); }
    try { await courtsModel.openCase({ titleBase: [titlePreset, titleSuffix].filter(Boolean).join(' - '), respondentInput: respondent, method }); }
    catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect('/courts?filter=mycases');
  })
  .post('/courts/cases/:id/evidence/add', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const caseId = ctx.params.id, b = ctx.request.body || {};
    if (!caseId) { ctx.flash = { message: 'Case not found.' }; return ctx.redirect('/courts?filter=cases'); }
    try { await courtsModel.addEvidence({ caseId, text: stripDangerousTags(String(b.text || '')), link: String(b.link || ''), imageMarkdown: ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null }); }
    catch (e) { ctx.flash = { message: String(e?.message || e) }; }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/answer', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, b = ctx.request.body || {}, answer = String(b.answer || ''), stance = String(b.stance || '').toUpperCase();
    if (!caseId) { ctx.flash = { message: 'Case not found.' }; return ctx.redirect('/courts?filter=cases'); }
    if (!answer) { ctx.flash = { message: 'Response brief is required.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    if (!new Set(['DENY','ADMIT','PARTIAL']).has(stance)) { ctx.flash = { message: 'Invalid stance.' }; return ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.answerCase({ caseId, stance, text: stripDangerousTags(answer) }); } catch (e) { ctx.flash = { message: String(e?.message || e) }; }
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
  .post("/market/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, image = await handleBlobUpload(ctx, "image"), parsedStock = parseInt(String(b.stock || "0"), 10);
    if (!parsedStock || parsedStock <= 0) ctx.throw(400, "Stock must be a positive number.");
    const pickLast = v => Array.isArray(v) ? v[v.length - 1] : v, shpVal = pickLast(b.includesShipping);
    await marketModel.createItem(b.item_type, stripDangerousTags(b.title), stripDangerousTags(b.description), image, b.price, b.tags, b.item_status, b.deadline, shpVal === "1" || shpVal === "on" || shpVal === true || shpVal === "true", parsedStock, stripDangerousTags(b.mapUrl), {}, b.visibility);
    ctx.redirect(safeReturnTo(ctx, "/market", ["/market"]));
  })
  .post("/market/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, parsedStock = parseInt(String(b.stock || "0"), 10);
    if (parsedStock < 0) ctx.throw(400, "Stock cannot be negative.");
    const pickLast = v => Array.isArray(v) ? v[v.length - 1] : v, shpVal = pickLast(b.includesShipping);
    const updatedData = { item_type: b.item_type, title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), price: b.price, item_status: b.item_status, deadline: b.deadline, includesShipping: shpVal === "1" || shpVal === "on" || shpVal === true || shpVal === "true", tags: String(b.tags || "").split(",").map(t => t.trim()).filter(Boolean), stock: parsedStock, mapUrl: stripDangerousTags(b.mapUrl), visibility: b.visibility };
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
  .post("/market/visibility/:id", koaBody(), async ctx => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const next = String(ctx.request.body?.visibility || '').toUpperCase() === 'HIDDEN' ? 'HIDDEN' : 'PUBLIC';
    await marketModel.updateItemById(ctx.params.id, { visibility: next });
    ctx.redirect(safeReturnTo(ctx, `/market/${encodeURIComponent(ctx.params.id)}`, ["/market"]));
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
    if (item.shopProductId && checkMod(ctx, 'shopsMod')) {
      try { await shopsModel.buyProduct(item.shopProductId); } catch (_) {}
    }
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
  .post("/market/:itemId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'market', 'itemId'))
  .post('/jobs/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    await jobsModel.createJob({ job_type: stripDangerousTags(b.job_type), title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), requirements: stripDangerousTags(b.requirements), languages: stripDangerousTags(b.languages), job_time: b.job_time, tasks: stripDangerousTags(b.tasks), location: stripDangerousTags(b.location), vacants: b.vacants ? parseInt(b.vacants, 10) : 1, salary: b.salary != null && b.salary !== '' ? parseFloat(String(b.salary).replace(',', '.')) : 0, hoursOffered: b.hoursOffered != null && b.hoursOffered !== '' ? parseFloat(String(b.hoursOffered).replace(',', '.')) : 0, hoursRequested: b.hoursRequested != null && b.hoursRequested !== '' ? parseFloat(String(b.hoursRequested).replace(',', '.')) : 0, exchangeSkill: stripDangerousTags(b.exchangeSkill || ''), tags: b.tags, image: imageBlob, mapUrl: stripDangerousTags(b.mapUrl), visibility: b.visibility, clearnetPublic: b.clearnetPublic });
    ctx.redirect(safeReturnTo(ctx, '/jobs?filter=MINE', ['/jobs']));
  })
  .post('/jobs/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : undefined;
    const patch = { job_type: stripDangerousTags(b.job_type), title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), requirements: stripDangerousTags(b.requirements), languages: stripDangerousTags(b.languages), job_time: b.job_time, tasks: stripDangerousTags(b.tasks), location: stripDangerousTags(b.location), tags: b.tags, mapUrl: stripDangerousTags(b.mapUrl), visibility: b.visibility, exchangeSkill: stripDangerousTags(b.exchangeSkill || ''), clearnetPublic: b.clearnetPublic };
    if (b.vacants !== undefined && b.vacants !== '') patch.vacants = parseInt(b.vacants, 10);
    if (b.salary !== undefined && b.salary !== '') patch.salary = parseFloat(String(b.salary).replace(',', '.'));
    if (b.hoursOffered !== undefined && b.hoursOffered !== '') patch.hoursOffered = parseFloat(String(b.hoursOffered).replace(',', '.'));
    if (b.hoursRequested !== undefined && b.hoursRequested !== '') patch.hoursRequested = parseFloat(String(b.hoursRequested).replace(',', '.'));
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
  .post('/jobs/visibility/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    const next = String(ctx.request.body?.visibility || '').toUpperCase() === 'HIDDEN' ? 'HIDDEN' : 'PUBLIC';
    await jobsModel.updateJob(ctx.params.id, { visibility: next });
    ctx.redirect(safeReturnTo(ctx, `/jobs/${encodeURIComponent(ctx.params.id)}`, ['/jobs']));
  })
  .post('/jobs/subscribe/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    const userId = getViewerId();
    let job;
    try { job = await jobsModel.getJobById(ctx.params.id, userId); } catch (_) {}
    if (!job) { ctx.redirect(safeReturnTo(ctx, '/jobs', ['/jobs'])); return; }
    const alreadySubscribed = Array.isArray(job.subscribers) && job.subscribers.includes(userId);
    if (alreadySubscribed || job.author === userId) {
      ctx.redirect(safeReturnTo(ctx, '/jobs', ['/jobs']));
      return;
    }
    try { await jobsModel.subscribeToJob(ctx.params.id, userId); } catch (_) {}
    try { await pmModel.sendMessage([job.author], 'JOB_SUBSCRIBED', `has subscribed to your job offer "${job.title || ''}" -> /jobs/${encodeURIComponent(job.id)}`); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/jobs', ['/jobs']));
  })
  .post('/jobs/unsubscribe/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    const userId = getViewerId();
    let job;
    try { job = await jobsModel.getJobById(ctx.params.id, userId); } catch (_) {}
    if (!job) { ctx.redirect(safeReturnTo(ctx, '/jobs', ['/jobs'])); return; }
    const wasSubscribed = Array.isArray(job.subscribers) && job.subscribers.includes(userId);
    if (!wasSubscribed) {
      ctx.redirect(safeReturnTo(ctx, '/jobs', ['/jobs']));
      return;
    }
    try { await jobsModel.unsubscribeFromJob(ctx.params.id, userId); } catch (_) {}
    try { await pmModel.sendMessage([job.author], 'JOB_UNSUBSCRIBED', `has unsubscribed from your job offer "${job.title || ''}" -> /jobs/${encodeURIComponent(job.id)}`); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/jobs', ['/jobs']));
  })
  .post('/jobs/:jobId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'jobs', 'jobId'))
  .post("/shops/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    await shopsModel.createShop(stripDangerousTags(b.title), stripDangerousTags(b.shortDescription), stripDangerousTags(b.description), imageBlob, stripDangerousTags(b.url), stripDangerousTags(b.location), b.tags, b.visibility, stripDangerousTags(b.mapUrl), b.clearnetPublic);
    ctx.redirect(safeReturnTo(ctx, '/shops?filter=mine', ['/shops']));
  })
  .post("/shops/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : undefined;
    const patch = { title: stripDangerousTags(b.title), shortDescription: stripDangerousTags(b.shortDescription), description: stripDangerousTags(b.description), url: stripDangerousTags(b.url), location: stripDangerousTags(b.location), tags: b.tags, visibility: b.visibility, mapUrl: stripDangerousTags(b.mapUrl), clearnetPublic: b.clearnetPublic };
    if (imageBlob !== undefined) patch.image = imageBlob;
    await shopsModel.updateShopById(ctx.params.id, patch);
    ctx.redirect(safeReturnTo(ctx, '/shops?filter=mine', ['/shops']));
  })
  .post("/shops/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    await shopsModel.deleteShopById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/shops?filter=mine', ['/shops']));
  })
  .post("/shops/visibility/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    await shopsModel.updateShopById(ctx.params.id, { visibility: ctx.request.body.visibility });
    ctx.redirect(safeReturnTo(ctx, `/shops/${encodeURIComponent(ctx.params.id)}`, ['/shops']));
  })
  .post("/shops/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'shops', 'add'))
  .post("/shops/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'shops', 'remove'))
  .post("/shops/opinions/:shopId/:category", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    await shopsModel.createOpinion(ctx.params.shopId, ctx.params.category);
    ctx.redirect(safeReturnTo(ctx, `/shops/${encodeURIComponent(ctx.params.shopId)}`, ['/shops']));
  })
  .post("/shops/product/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    const productMsg = await shopsModel.createProduct(b.shopId, stripDangerousTags(b.title), stripDangerousTags(b.description), imageBlob, b.price, b.stock, [].concat(b.featured).includes("1"));
    if ([].concat(b.sendToMarket).includes("1") && checkMod(ctx, 'marketMod')) {
      const shop = await shopsModel.getShopById(b.shopId);
      const deadline = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const stock = parseInt(String(b.stock || '0'), 10) || 1;
      try {
        await marketModel.createItem('exchange', stripDangerousTags(b.title), stripDangerousTags(b.description), imageBlob, b.price, [], 'NEW', deadline, false, stock, '', { shopProductId: productMsg.key, shopId: b.shopId, shopTitle: shop ? shop.title : '' });
      } catch (e) { console.error("market-from-shop:", e.message) }
    }
    ctx.redirect(safeReturnTo(ctx, `/shops/${encodeURIComponent(b.shopId)}`, ['/shops']));
  })
  .post("/shops/product/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : undefined;
    const patch = { title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), price: b.price, stock: b.stock, featured: [].concat(b.featured).includes("1") };
    if (imageBlob !== undefined) patch.image = imageBlob;
    await shopsModel.updateProductById(ctx.params.id, patch);
    ctx.redirect(safeReturnTo(ctx, `/shops/${encodeURIComponent(b.shopId || '')}`, ['/shops']));
  })
  .post("/shops/product/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const product = await shopsModel.getProductById(ctx.params.id);
    await shopsModel.deleteProductById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, `/shops/${encodeURIComponent(product?.shopId || '')}`, ['/shops']));
  })
  .post("/shops/product/buy/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    const deliveryAddress = stripDangerousTags(String(b.deliveryAddress || "")).trim();
    if (!deliveryAddress) {
      const { i18n: i18nMod } = require('../views/main_views');
      sendErrorPage(ctx, i18nMod.shopBuyDeliveryRequired || "Delivery address is required.", { status: 400 });
      return;
    }
    await shopsModel.createPurchaseOrder(ctx.params.id, {
      deliveryAddress,
      contact: stripDangerousTags(String(b.contact || "")).trim(),
      notes: stripDangerousTags(String(b.notes || "")).trim()
    });
    await shopsModel.buyProduct(ctx.params.id);
    if (checkMod(ctx, 'marketMod')) {
      try { const mi = await marketModel.getItemByShopProductId(ctx.params.id); if (mi) await marketModel.decrementStock(mi.id); } catch (_) {}
    }
    ctx.redirect(safeReturnTo(ctx, `/shops/product/${encodeURIComponent(ctx.params.id)}`, ['/shops']));
  })
  .post("/shops/product/opinions/:productId/:category", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    await shopsModel.createOpinion(ctx.params.productId, ctx.params.category);
    ctx.redirect(safeReturnTo(ctx, `/shops/product/${encodeURIComponent(ctx.params.productId)}`, ['/shops']));
  })
  .post("/shops/:shopId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'shops', 'shopId'))
  .post("/chats/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    const tribeId = b.tribeId || null;
    if (tribeId) {
      const t = await tribesModel.getTribeById(tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
      await tribesModel.ensureTribeKeyDistribution(tribeId).catch(() => {});
    }
    const imageBlob = ctx.request.files?.image ? extractBlobId(await handleBlobUpload(ctx, 'image')) : null;
    await chatsModel.createChat(stripDangerousTags(b.title), stripDangerousTags(b.description), imageBlob, b.category, b.status, b.tags, tribeId);
    ctx.redirect(tribeId ? `/tribe/${encodeURIComponent(tribeId)}?section=chats` : safeReturnTo(ctx, '/chats?filter=mine', ['/chats']));
  })
  .post("/chats/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    const imageBlob = ctx.request.files?.image ? extractBlobId(await handleBlobUpload(ctx, 'image')) : undefined;
    const patch = { title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), category: b.category, status: b.status, tags: b.tags };
    if (imageBlob !== undefined) patch.image = imageBlob;
    await chatsModel.updateChatById(ctx.params.id, patch);
    ctx.redirect(safeReturnTo(ctx, '/chats?filter=mine', ['/chats']));
  })
  .post("/chats/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    await chatsModel.deleteChatById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/chats?filter=mine', ['/chats']));
  })
  .post("/chats/close/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    await chatsModel.closeChatById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, `/chats/${encodeURIComponent(ctx.params.id)}`, ['/chats']));
  })
  .post("/chats/generate-invite", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const chatId = ctx.request.body.chatId;
    const code = await chatsModel.generateInvite(chatId);
    ctx.body = renderChatInvitePage(code);
  })
  .post("/chats/join-code", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const code = String(ctx.request.body.code || '').trim();
    try {
      const chatKey = await chatsModel.joinByInvite(code);
      ctx.redirect(safeReturnTo(ctx, `/chats/${encodeURIComponent(chatKey)}`, ['/chats']));
    } catch (_) {
      ctx.redirect(safeReturnTo(ctx, '/chats', ['/chats']));
    }
  })
  .post("/chats/join/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const chat = await chatsModel.getChatById(ctx.params.id);
    if (!chat) { sendErrorPage(ctx, "Chat not found", { status: 404 }); return; }
    if (chat.status === "CLOSED") { sendErrorPage(ctx, "Chat is closed", { status: 403 }); return; }
    if (chat.status === "INVITE-ONLY" && !chat.members.includes(uid) && chat.author !== uid) { sendErrorPage(ctx, "Invite-only chat", { status: 403 }); return; }
    if (chat.tribeId) {
      try {
        const t = await tribesModel.getTribeById(chat.tribeId);
        if (!t.members.includes(uid)) { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
      } catch { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
      ctx.redirect(safeReturnTo(ctx, `/chats/${encodeURIComponent(ctx.params.id)}`, ['/chats']));
      return;
    }
    try {
      await chatsModel.joinChat(ctx.params.id);
    } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, `/chats/${encodeURIComponent(ctx.params.id)}`, ['/chats']));
  })
  .post("/chats/leave/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    try {
      await chatsModel.leaveChat(ctx.params.id);
    } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/chats?filter=all', ['/chats']));
  })
  .post("/chats/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'chats', 'add'))
  .post("/chats/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'chats', 'remove'))
  .post("/chats/:chatId/message", koaBody({ multipart: true }), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const chat = await chatsModel.getChatById(ctx.params.chatId);
    if (chat && chat.tribeId) {
      try {
        const t = await tribesModel.getTribeById(chat.tribeId);
        if (!t.members.includes(uid)) { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
      } catch { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
    }
    const text = stripDangerousTags(String(ctx.request.body.text || '').trim());
    const imageBlob = ctx.request.files?.image ? extractBlobId(await handleBlobUpload(ctx, 'image')) : null;
    if (!text && !imageBlob) { ctx.redirect(`/chats/${encodeURIComponent(ctx.params.chatId)}`); return; }
    await chatsModel.sendMessage(ctx.params.chatId, text, imageBlob);
    ctx.redirect(safeReturnTo(ctx, `/chats/${encodeURIComponent(ctx.params.chatId)}`, ['/chats']));
  })
  .post("/pads/create", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    const tribeId = b.tribeId || null;
    if (tribeId) {
      const t = await tribesModel.getTribeById(tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
      await tribesModel.ensureTribeKeyDistribution(tribeId).catch(() => {});
    }
    const msg = await padsModel.createPad(
      stripDangerousTags(b.title || ""),
      b.status || "OPEN",
      b.deadline || "",
      b.tags || "",
      tribeId
    );
    ctx.redirect(tribeId ? `/tribe/${encodeURIComponent(tribeId)}?section=pads` : `/pads/${encodeURIComponent(msg.key)}`);
  })
  .post("/pads/update/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    await padsModel.updatePadById(ctx.params.id, {
      title: stripDangerousTags(b.title || ""),
      status: b.status || "OPEN",
      deadline: b.deadline || "",
      tags: b.tags || ""
    });
    ctx.redirect(`/pads/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/pads/close/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    try { await padsModel.closePadById(ctx.params.id); } catch (_) {}
    ctx.redirect(`/pads/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/pads/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    await padsModel.deletePadById(ctx.params.id);
    ctx.redirect('/pads');
  })
  .post("/pads/generate-invite/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    const code = await padsModel.generateInvite(ctx.params.id);
    ctx.body = renderPadInvitePage(code);
  })
  .post("/pads/join-code", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    const code = String((ctx.request.body || {}).code || "").trim();
    try {
      const padId = await padsModel.joinByInvite(code);
      ctx.redirect(`/pads/${encodeURIComponent(padId)}`);
    } catch (_) {
      ctx.redirect('/pads');
    }
  })
  .post("/pads/join/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const pad = await padsModel.getPadById(ctx.params.id);
    if (!pad) { sendErrorPage(ctx, "Pad not found", { status: 404 }); return; }
    if (pad.isClosed || pad.status === "CLOSED") { sendErrorPage(ctx, "Pad is closed", { status: 403 }); return; }
    if (pad.status === "INVITE-ONLY" && !pad.members.includes(uid) && pad.author !== uid) { sendErrorPage(ctx, "Invite-only pad", { status: 403 }); return; }
    if (pad.tribeId) {
      try {
        const t = await tribesModel.getTribeById(pad.tribeId);
        if (!t.members.includes(uid)) { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
      } catch { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
      ctx.redirect(`/pads/${encodeURIComponent(ctx.params.id)}`);
      return;
    }
    await padsModel.addMemberToPad(ctx.params.id, uid);
    ctx.redirect(`/pads/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/pads/entry/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const pad = await padsModel.getPadById(ctx.params.id);
    if (pad && pad.tribeId) {
      try {
        const t = await tribesModel.getTribeById(pad.tribeId);
        if (!t.members.includes(uid)) { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
      } catch { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
    }
    const b = ctx.request.body || {};
    const text = stripDangerousTags(String(b.text || "").trim());
    if (text) await padsModel.addEntry(ctx.params.id, text);
    ctx.redirect(`/pads/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/pads/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'pads', 'add'))
  .post("/pads/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'pads', 'remove'))
  .post("/calendars/create", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    const tribeId = b.tribeId || null;
    if (tribeId) {
      const t = await tribesModel.getTribeById(tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    const intervalWeekly  = [].concat(b.intervalWeekly).includes("1");
    const intervalMonthly = [].concat(b.intervalMonthly).includes("1");
    const intervalYearly  = [].concat(b.intervalYearly).includes("1");
    try {
      const msg = await calendarsModel.createCalendar({
        title: stripDangerousTags(b.title || ""),
        status: b.status || "OPEN",
        deadline: b.deadline || "",
        tags: b.tags || "",
        firstDate: b.firstDate || "",
        firstDateLabel: stripDangerousTags(b.firstDateLabel || ""),
        firstNote: stripDangerousTags(b.firstNote || ""),
        intervalWeekly, intervalMonthly, intervalYearly,
        tribeId
      });
      ctx.redirect(tribeId ? `/tribe/${encodeURIComponent(tribeId)}?section=calendars` : `/calendars/${encodeURIComponent(msg.key)}`);
    } catch (e) {
      console.error("[calendars/create]", e && e.message ? e.message : e)
      ctx.redirect(tribeId ? `/tribe/${encodeURIComponent(tribeId)}?section=calendars` : '/calendars');
    }
  })
  .post("/calendars/update/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const target = await calendarsModel.getCalendarById(ctx.params.id).catch(() => null);
    if (target && target.tribeId) {
      const t = await tribesModel.getTribeById(target.tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    const b = ctx.request.body || {};
    try {
      await calendarsModel.updateCalendarById(ctx.params.id, {
        title: stripDangerousTags(b.title || ""),
        status: b.status || "OPEN",
        deadline: b.deadline || "",
        tags: b.tags || ""
      });
    } catch (_) {}
    ctx.redirect(`/calendars/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/calendars/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const target = await calendarsModel.getCalendarById(ctx.params.id).catch(() => null);
    const tribeId = target && target.tribeId;
    if (tribeId) {
      const t = await tribesModel.getTribeById(tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    await calendarsModel.deleteCalendarById(ctx.params.id);
    ctx.redirect(tribeId ? `/tribe/${encodeURIComponent(tribeId)}?section=calendars` : '/calendars');
  })
  .post("/calendars/join/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const target = await calendarsModel.getCalendarById(ctx.params.id).catch(() => null);
    if (target && target.tribeId) {
      const t = await tribesModel.getTribeById(target.tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    try { await calendarsModel.joinCalendar(ctx.params.id); } catch (_) {}
    ctx.redirect(`/calendars/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/calendars/generate-invite/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    try {
      const code = await calendarsModel.generateInvite(ctx.params.id);
      ctx.body = renderCalendarInvitePage(code);
    } catch (e) {
      ctx.redirect(`/calendars/${encodeURIComponent(ctx.params.id)}`);
    }
  })
  .post("/calendars/join-code", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const code = String((ctx.request.body || {}).code || "").trim();
    try {
      const calId = await calendarsModel.joinByInvite(code);
      ctx.redirect(`/calendars/${encodeURIComponent(calId)}`);
    } catch (_) {
      ctx.redirect('/calendars');
    }
  })
  .post("/calendars/leave/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const target = await calendarsModel.getCalendarById(ctx.params.id).catch(() => null);
    if (target && target.tribeId) {
      const t = await tribesModel.getTribeById(target.tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    try { await calendarsModel.leaveCalendar(ctx.params.id); } catch (_) {}
    ctx.redirect(`/calendars/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/calendars/add-date/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const calForGate = await calendarsModel.getCalendarById(ctx.params.id).catch(() => null);
    if (calForGate && calForGate.tribeId) {
      try {
        const t = await tribesModel.getTribeById(calForGate.tribeId);
        if (!t.members.includes(uid)) { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
      } catch { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
    }
    const b = ctx.request.body || {};
    const intervalWeekly  = [].concat(b.intervalWeekly).includes("1");
    const intervalMonthly = [].concat(b.intervalMonthly).includes("1");
    const intervalYearly  = [].concat(b.intervalYearly).includes("1");
    try {
      const dateMsgs = await calendarsModel.addDate(ctx.params.id, b.date || "", stripDangerousTags(b.label || ""), intervalWeekly, intervalMonthly, intervalYearly, b.intervalDeadline || "");
      const noteText = stripDangerousTags(String(b.text || "").trim());
      if (noteText && Array.isArray(dateMsgs)) {
        for (const msg of dateMsgs) {
          if (msg && msg.key) {
            try { await calendarsModel.addNote(ctx.params.id, msg.key, noteText); } catch (_) {}
          }
        }
      }
    } catch (e) {
      console.error("[calendars/add-date]", e && e.message ? e.message : e)
    }
    ctx.redirect(`/calendars/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/calendars/add-note/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const calForGate = await calendarsModel.getCalendarById(ctx.params.id).catch(() => null);
    if (calForGate && calForGate.tribeId) {
      try {
        const t = await tribesModel.getTribeById(calForGate.tribeId);
        if (!t.members.includes(uid)) { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
      } catch { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
    }
    const b = ctx.request.body || {};
    const text = stripDangerousTags(String(b.text || "").trim());
    if (text) {
      try { await calendarsModel.addNote(ctx.params.id, b.dateId || "", text); } catch (_) {}
    }
    ctx.redirect(`/calendars/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/calendars/delete-note/:noteId", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const calendarId = (ctx.request.body || {}).calendarId || "";
    if (calendarId) {
      const target = await calendarsModel.getCalendarById(calendarId).catch(() => null);
      if (target && target.tribeId) {
        const t = await tribesModel.getTribeById(target.tribeId).catch(() => null);
        if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
      }
    }
    try { await calendarsModel.deleteNote(ctx.params.noteId); } catch (_) {}
    ctx.redirect(calendarId ? `/calendars/${encodeURIComponent(calendarId)}` : '/calendars');
  })
  .post("/calendars/delete-date/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const calendarId = (ctx.request.body || {}).calendarId || "";
    if (calendarId) {
      const target = await calendarsModel.getCalendarById(calendarId).catch(() => null);
      if (target && target.tribeId) {
        const t = await tribesModel.getTribeById(target.tribeId).catch(() => null);
        if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
      }
    }
    try { await calendarsModel.deleteDate(ctx.params.id, calendarId); } catch (_) {}
    ctx.redirect(calendarId ? `/calendars/${encodeURIComponent(calendarId)}` : '/calendars');
  })
  .post("/calendars/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'calendars', 'add'))
  .post("/calendars/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'calendars', 'remove'))
  .post("/projects/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {}, image = ctx.request.files?.image ? await handleBlobUpload(ctx, "image") : null;
    const bounties = b.bountiesInput ? String(b.bountiesInput).split("\n").filter(Boolean).map(l => { const [t,a,d] = String(l).split("|"); return { title: String(t||"").trim(), amount: parseFloat(a||0)||0, description: String(d||"").trim(), milestoneIndex: null }; }) : [];
    await projectsModel.createProject({ title: b.title, description: b.description, goal: b.goal != null && b.goal !== "" ? parseFloat(b.goal) : 0, deadline: b.deadline ? new Date(b.deadline).toISOString() : null, progress: b.progress != null && b.progress !== "" ? parseInt(b.progress,10) : 0, bounties, image, milestoneTitle: b.milestoneTitle, milestoneDescription: b.milestoneDescription, milestoneTargetPercent: b.milestoneTargetPercent, milestoneDueDate: b.milestoneDueDate, mapUrl: stripDangerousTags(b.mapUrl), clearnetPublic: b.clearnetPublic });
    ctx.redirect(safeReturnTo(ctx, "/projects?filter=MINE", ["/projects"]));
  })
  .post("/projects/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = await projectsModel.getProjectTipId(ctx.params.id), b = ctx.request.body || {};
    const image = ctx.request.files?.image ? await handleBlobUpload(ctx, "image") : undefined;
    const bounties = b.bountiesInput !== undefined ? String(b.bountiesInput).split("\n").filter(Boolean).map(l => { const [t,a,d] = String(l).split("|"); return { title: String(t||"").trim(), amount: parseFloat(a||0)||0, description: String(d||"").trim(), milestoneIndex: null }; }) : undefined;
    await projectsModel.updateProject(id, { title: b.title, description: b.description, goal: b.goal !== "" && b.goal != null ? parseFloat(b.goal) : undefined, deadline: b.deadline ? new Date(b.deadline).toISOString() : undefined, progress: b.progress !== "" && b.progress != null ? parseInt(b.progress,10) : undefined, bounties, image, mapUrl: stripDangerousTags(b.mapUrl), clearnetPublic: b.clearnetPublic });
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
  .post("/projects/:projectId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'projects', 'projectId'))
  .post("/banking/claim-ubi", koaBody(), async (ctx) => {
    const userId = getViewerId();
    try {
      await bankingModel.claimUBI(userId);
      ctx.redirect("/banking?filter=overview&msg=claimed_pending");
    } catch (e) {
      ctx.redirect(`/banking?filter=overview&msg=${encodeURIComponent(e.message || "error")}`);
    }
  })
  .post("/banking/claim/:id", koaBody(), async (ctx) => {
    const { i18n: _i18n } = require("../views/main_views");
    const userId = getViewerId(), allocation = await bankingModel.getAllocationById(ctx.params.id);
    if (!allocation) { sendErrorPage(ctx, _i18n.errorNoAllocation); return; }
    if (allocation.to !== userId || (allocation.status !== "UNCLAIMED" && allocation.status !== "UNCONFIRMED")) { sendErrorPage(ctx, _i18n.errorInvalidClaim); return; }
    if (!bankingModel.isPubNode()) {
      ctx.redirect("/banking?filter=overview&msg=claimed_pending");
      return;
    }
    const { txid } = await bankingModel.claimAllocation({ transferId: ctx.params.id, claimerId: userId });
    await bankingModel.publishBankClaim({ amount: allocation.amount, epochId: allocation.concept, allocationId: allocation.id, txid });
    ctx.redirect(`/banking?claimed=${encodeURIComponent(txid)}`);
  })
  .post("/banking/simulate", koaBody(), async (ctx) => {
    if (!bankingModel.isPubNode()) { sendErrorPage(ctx, require("../views/main_views").i18n.bankPubOnly, { status: 403 }); return; }
    const { epochId, rules } = ctx.request.body || {};
    ctx.body = await bankingModel.computeEpoch({ epochId, rules });
  })
  .post("/banking/run", koaBody(), async (ctx) => {
    if (!bankingModel.isPubNode()) { sendErrorPage(ctx, require("../views/main_views").i18n.bankPubOnly, { status: 403 }); return; }
    const { epochId, rules } = ctx.request.body || {};
    ctx.body = await bankingModel.executeEpoch({ epochId, rules });
  })
  .post("/banking/addresses", koaBody(), async (ctx) => {
    const b = ctx.request.body || {};
    const viewerId = getViewerId();
    const submittedId = (b.userId || "").trim();
    if (submittedId && submittedId !== viewerId) {
      ctx.redirect(`/banking?filter=addresses&msg=forbidden`);
      return;
    }
    const res = await bankingModel.addAddress({ userId: viewerId, address: (b.address || "").trim() });
    ctx.redirect(`/banking?filter=addresses&msg=${encodeURIComponent(res.status)}`);
  })
  .post("/banking/addresses/delete", koaBody(), async (ctx) => {
    const res = await bankingModel.removeAddress({ userId: getViewerId() });
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
    safeRefererRedirect(ctx, '/settings');
  })  
  .post("/settings/theme", koaBody(), async (ctx) => {
    const theme = String(ctx.request.body.theme || "").trim(), cfg = getConfig();
    cfg.themes.current = theme || "Dark-SNH";
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    ctx.cookies.set("theme", cfg.themes.current, { httpOnly: true, sameSite: 'strict', secure: ctx.secure });
    ctx.redirect("/settings");
  })
  .post("/language", koaBody(), async (ctx) => {
    const lang = String(ctx.request.body.language || "en");
    const cfg = getConfig();
    cfg.language = lang;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
    ctx.cookies.set("language", lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'strict', secure: ctx.secure });
    safeRefererRedirect(ctx, '/settings');
  })
  .post("/settings/conn/start", koaBody(), async ctx => { await meta.connStart(); ctx.redirect("/peers"); })
  .post("/settings/conn/stop", koaBody(), async ctx => { await meta.connStop(); ctx.redirect("/peers"); })
  .post("/settings/conn/sync", koaBody(), async ctx => { await meta.sync(); ctx.redirect("/peers"); })
  .post("/settings/conn/restart", koaBody(), async ctx => { await meta.connRestart(); ctx.redirect("/peers"); })
  .post("/settings/invite/accept", koaBody(), async ctx => { await meta.acceptInvite(String(ctx.request.body.invite)); ctx.redirect("/invites"); })
  .post("/invites/inhabitant/follow", koaBody(), async (ctx) => {
    const feedId = String(ctx.request.body?.feedId || '').trim();
    if (!/^@[A-Za-z0-9+/_\-]{43}=\.ed25519$/.test(feedId)) {
      ctx.redirect(`/search?query=${encodeURIComponent(feedId)}`);
      return;
    }
    try {
      const name = await about.name(feedId);
      if (!name || name === feedId.slice(1, 9)) {
        ctx.redirect(`/search?query=${encodeURIComponent(feedId)}`);
        return;
      }
      const ssb = await cooler.open();
      await new Promise((res, rej) => ssb.publish({ type: 'contact', contact: feedId, following: true }, (e) => e ? rej(e) : res()));
      ctx.redirect(`/author/${encodeURIComponent(feedId)}`);
    } catch (_) {
      ctx.redirect(`/search?query=${encodeURIComponent(feedId)}`);
    }
  })
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
  .post("/peers/connect", koaBody(), async (ctx) => {
    const { key, host, port } = ctx.request.body || {};
    if (!key || !host) { sendErrorPage(ctx, "Missing IP or public key.", { status: 400 }); return; }
    const hostStr = String(host).trim().toLowerCase();
    const isIPv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostStr);
    const isHostname = /^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)*$/.test(hostStr);
    if ((!isIPv4 && !isHostname) || hostStr.length > 253) { sendErrorPage(ctx, `Invalid IP/hostname: ${hostStr}`, { status: 400 }); return; }
    if (isIPv4 && hostStr.split('.').some(o => Number(o) > 255)) { sendErrorPage(ctx, `Invalid IPv4: ${hostStr}`, { status: 400 }); return; }
    const prt = Number(port) || 8008;
    if (!Number.isInteger(prt) || prt < 1 || prt > 65535) { sendErrorPage(ctx, `Invalid port: ${port}`, { status: 400 }); return; }
    const keyStr = String(key).trim();
    if (!/^@[A-Za-z0-9+/_\-]{43}=\.ed25519$/.test(keyStr)) { sendErrorPage(ctx, `Invalid public key. Expected @<44 chars>=.ed25519`, { status: 400 }); return; }
    const kcanon = canonicalKey(keyStr);
    const pubs = readJSON(gossipPath);
    if (!pubs.find(x => x && canonicalKey(x.key) === kcanon)) {
      pubs.push({ host: hostStr, port: prt, key: kcanon });
      writeJSON(gossipPath, pubs);
    }
    const ssb = await cooler.open();
    const addr = msAddrFrom(hostStr, prt, kcanon);
    try { ssb.conn.remember(addr, { type: "peer", autoconnect: true, key: kcanon }); } catch (e) { console.error('[peers/connect] remember failed:', e.message || e); }
    try { await new Promise((res, rej) => ssb.conn.connect(addr, { type: "peer" }, (err) => err ? rej(err) : res())); } catch (e) { console.error('[peers/connect] live connect failed:', e.message || e); }
    try { await new Promise((res, rej) => ssb.publish({ type: "contact", contact: kcanon, following: true }, e => e ? rej(e) : res())); } catch (_) {}
    const unf = readJSON(unfollowedPath);
    writeJSON(unfollowedPath, unf.filter(x => !(x && canonicalKey(x.key) === kcanon)));
    ctx.redirect("/peers");
  })
  .post("/peers/disconnect", koaBody(), async (ctx) => {
    const { key, host, port } = ctx.request.body || {};
    if (!key) return ctx.redirect("/peers");
    const keyStr = String(key).trim();
    if (!/^@[A-Za-z0-9+/_\-]{43}=\.ed25519$/.test(keyStr)) return ctx.redirect("/peers");
    const kcanon = canonicalKey(keyStr);
    const ssb = await cooler.open();
    const candidates = new Set();
    if (host && Number(port)) candidates.add(msAddrFrom(String(host), Number(port), kcanon));
    try {
      const snapshot = (ssb.conn && typeof ssb.conn.dbPeers === 'function') ? await ssb.conn.dbPeers() : [];
      for (const entry of (snapshot || [])) {
        const addr = Array.isArray(entry) ? entry[0] : null;
        const data = Array.isArray(entry) ? entry[1] : entry;
        if (data && canonicalKey(data.key || '') === kcanon && addr) candidates.add(addr);
      }
    } catch (_) {}
    try {
      const staged = (ssb.conn && typeof ssb.conn.stagedPeers === 'function') ? ssb.conn.stagedPeers() : [];
      for (const entry of (staged || [])) {
        const addr = Array.isArray(entry) ? entry[0] : null;
        const data = Array.isArray(entry) ? entry[1] : entry;
        if (data && canonicalKey(data.key || '') === kcanon && addr) candidates.add(addr);
      }
    } catch (_) {}
    try {
      const livePeers = (ssb.peers && typeof ssb.peers === 'object') ? ssb.peers : {};
      const rpcs = livePeers[kcanon];
      if (Array.isArray(rpcs)) {
        for (const r of rpcs) {
          const addrLive = r?.stream?.address || null;
          if (addrLive) candidates.add(addrLive);
        }
      }
    } catch (_) {}
    for (const addr of candidates) {
      try { await new Promise(res => ssb.conn.disconnect(addr, res)); } catch {}
      try { ssb.conn.forget(addr); } catch {}
    }
    ctx.redirect("/peers");
  })
  .post("/invites/refresh-pubs", koaBody(), async (ctx) => {
    try {
      const ssb = await cooler.open();
      const pubs = readJSON(gossipPath);
      if (Array.isArray(pubs)) {
        for (const p of pubs) {
          if (!p || !p.key || !p.host) continue;
          let addr;
          try { addr = msAddrFrom(p.host, p.port, p.key); } catch (_) { continue; }
          try { ssb.conn.connect(addr, { type: "pub" }, () => {}); } catch (_) {}
        }
      }
    } catch (_) {}
    ctx.redirect("/invites");
  })
  .post("/invites/clear-unreachable", koaBody(), async (ctx) => {
    try {
      const pubs = readJSON(gossipPath);
      if (Array.isArray(pubs)) {
        const kept = pubs.filter(p => p && !p.error && !(typeof p.failure === 'number' && p.failure > 0));
        if (kept.length !== pubs.length) writeJSON(gossipPath, kept);
      }
    } catch (_) {}
    ctx.redirect("/invites");
  })
  .get("/invites/export-pubs", async (ctx) => {
    const lines = [];
    lines.push('# Oasis pubs — multiserver addresses, one per line');
    lines.push('# Generated ' + new Date().toISOString());
    try {
      const pubs = readJSON(gossipPath);
      if (Array.isArray(pubs)) {
        const seen = new Set();
        for (const p of pubs) {
          if (!p || !p.key || !p.host) continue;
          try {
            const addr = msAddrFrom(p.host, p.port, p.key);
            if (seen.has(addr)) continue;
            seen.add(addr);
            lines.push(addr);
          } catch (_) {}
        }
      }
    } catch (_) {}
    ctx.type = 'text/plain';
    ctx.set('Content-Disposition', 'attachment; filename="oasis-pubs.txt"');
    ctx.body = lines.join('\n') + '\n';
  })
  .post("/invites/import-pubs", koaBody({ multipart: true, formidable: { maxFileSize: 1 * 1024 * 1024 } }), async (ctx) => {
    let raw = String((ctx.request.body && ctx.request.body.peerList) || '');
    try {
      const f = ctx.request.files && (ctx.request.files.peerFile || ctx.request.files.file);
      const file = Array.isArray(f) ? f[0] : f;
      if (file && file.filepath) {
        const buf = await promisesFs.readFile(file.filepath, 'utf8');
        raw = raw ? (raw + '\n' + buf) : buf;
      }
    } catch (_) {}
    if (!raw.trim()) return ctx.redirect("/invites");
    let ssb = null;
    try { ssb = await cooler.open(); } catch (_) {}
    const pubs = readJSON(gossipPath);
    let writeBack = false;
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const msMatch = trimmed.match(/^net:([^:]+):(\d+)~shs:([A-Za-z0-9+/_\-]{43}=?)(?:\.ed25519)?$/);
      if (msMatch) {
        const host = msMatch[1];
        const port = Number(msMatch[2]);
        const keyCore = msMatch[3].endsWith('=') ? msMatch[3] : (msMatch[3] + '=');
        const kcanon = canonicalKey('@' + keyCore + '.ed25519');
        const addr = msAddrFrom(host, port, kcanon);
        if (!pubs.find(x => x && canonicalKey(x.key) === kcanon)) {
          pubs.push({ host, port, key: kcanon });
          writeBack = true;
        }
        if (ssb && ssb.conn && typeof ssb.conn.remember === 'function') {
          try { ssb.conn.remember(addr, { type: 'pub', autoconnect: true, key: kcanon }); } catch (_) {}
        }
        continue;
      }
      const inviteMatch = trimmed.match(/^[^:]+:\d+:@[A-Za-z0-9+/_\-]{43}=?\.ed25519~/);
      if (inviteMatch) {
        try { await meta.acceptInvite(trimmed); } catch (_) {}
        continue;
      }
    }
    if (writeBack) writeJSON(gossipPath, pubs);
    ctx.redirect("/invites");
  })
  .post("/peers/refresh", koaBody(), async (ctx) => {
    try {
      const ssb = await cooler.open();
      try { if (ssb.lan && typeof ssb.lan.stop === 'function') ssb.lan.stop(); } catch (_) {}
      try { if (ssb.lan && typeof ssb.lan.start === 'function') ssb.lan.start(); } catch (_) {}
    } catch (_) {}
    const returnTo = String((ctx.query && ctx.query.returnTo) || (ctx.request.body && ctx.request.body.returnTo) || '');
    ctx.redirect(['/peers', '/graphos'].includes(returnTo) ? returnTo : '/peers');
  })
  .post("/peers/prune", koaBody(), async (ctx) => {
    try {
      const ssb = await cooler.open();
      const connectedKeys = new Set();
      try {
        const livePeers = (ssb.peers && typeof ssb.peers === 'object') ? ssb.peers : {};
        for (const k of Object.keys(livePeers)) {
          const rpcs = livePeers[k];
          if (Array.isArray(rpcs) && rpcs.length > 0) connectedKeys.add(canonicalKey(k));
        }
      } catch (_) {}
      try {
        const snapshot = (ssb.conn && typeof ssb.conn.dbPeers === 'function') ? await ssb.conn.dbPeers() : [];
        for (const entry of (snapshot || [])) {
          const data = Array.isArray(entry) ? entry[1] : entry;
          const addr = Array.isArray(entry) ? entry[0] : null;
          if (!data || !addr) continue;
          const kc = data.key ? canonicalKey(data.key) : null;
          if (kc && connectedKeys.has(kc)) continue;
          try { ssb.conn.forget(addr); } catch (_) {}
        }
      } catch (_) {}
      try {
        const pubs = readJSON(gossipPath);
        if (Array.isArray(pubs)) {
          const kept = pubs.filter(g => g && g.key && connectedKeys.has(canonicalKey(g.key)));
          if (kept.length !== pubs.length) writeJSON(gossipPath, kept);
        }
      } catch (_) {}
    } catch (_) {}
    const returnTo = String((ctx.query && ctx.query.returnTo) || (ctx.request.body && ctx.request.body.returnTo) || '');
    ctx.redirect(['/peers', '/graphos'].includes(returnTo) ? returnTo : '/peers');
  })
  .get("/peers/export", async (ctx) => {
    const lines = [];
    lines.push('# Oasis peers — multiserver addresses, one per line');
    lines.push('# Generated ' + new Date().toISOString());
    const seen = new Set();
    const writePeer = (host, port, key) => {
      if (!host || !key) return;
      let addr;
      try { addr = msAddrFrom(host, port || 8008, key); } catch (_) { return; }
      if (seen.has(addr)) return;
      seen.add(addr);
      lines.push(addr);
    };
    try {
      const pubs = readJSON(gossipPath);
      if (Array.isArray(pubs)) for (const g of pubs) if (g && g.key && g.host) writePeer(g.host, g.port, g.key);
    } catch (_) {}
    try {
      const ssb = await cooler.open();
      try {
        const snapshot = (ssb.conn && typeof ssb.conn.dbPeers === 'function') ? await ssb.conn.dbPeers() : [];
        for (const entry of (snapshot || [])) {
          const data = Array.isArray(entry) ? entry[1] : entry;
          const addr = Array.isArray(entry) ? entry[0] : null;
          if (!data || !data.key) continue;
          let host = data.host, port = data.port;
          if ((!host || !port) && addr) {
            const m = String(addr).match(/^net:([^:]+):(\d+)/);
            if (m) { host = host || m[1]; port = port || Number(m[2]); }
          }
          writePeer(host, port, data.key);
        }
      } catch (_) {}
      try {
        if (ssb.conn && typeof ssb.conn.stagedPeers === 'function') {
          const staged = await new Promise((resolve) => {
            try {
              pull(
                ssb.conn.stagedPeers(),
                pull.take(1),
                pull.collect((err, results) => {
                  if (err || !results || !results[0]) return resolve([]);
                  resolve(Array.isArray(results[0]) ? results[0] : []);
                })
              );
            } catch (_) { resolve([]); }
          });
          for (const entry of staged) {
            const data = Array.isArray(entry) ? entry[1] : entry;
            const addr = Array.isArray(entry) ? entry[0] : null;
            if (!data || !data.key) continue;
            let host = data.host, port = data.port;
            if ((!host || !port) && addr) {
              const m = String(addr).match(/^net:([^:]+):(\d+)/);
              if (m) { host = host || m[1]; port = port || Number(m[2]); }
            }
            writePeer(host, port, data.key);
          }
        }
      } catch (_) {}
    } catch (_) {}
    ctx.type = 'text/plain';
    ctx.set('Content-Disposition', 'attachment; filename="oasis-peers.txt"');
    ctx.body = lines.join('\n') + '\n';
  })
  .post("/peers/import", koaBody({ multipart: true, formidable: { maxFileSize: 1 * 1024 * 1024 } }), async (ctx) => {
    let raw = String((ctx.request.body && ctx.request.body.peerList) || '');
    try {
      const f = ctx.request.files && (ctx.request.files.peerFile || ctx.request.files.file);
      const file = Array.isArray(f) ? f[0] : f;
      if (file && file.filepath) {
        const buf = await promisesFs.readFile(file.filepath, 'utf8');
        raw = raw ? (raw + '\n' + buf) : buf;
      }
    } catch (_) {}
    if (!raw.trim()) return ctx.redirect("/peers");
    let ssb = null;
    try { ssb = await cooler.open(); } catch (_) {}
    const pubs = readJSON(gossipPath);
    let added = 0;
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = trimmed.match(/^net:([^:]+):(\d+)~shs:([A-Za-z0-9+/_\-]{43}=?)(?:\.ed25519)?$/);
      if (!m) continue;
      const host = m[1];
      const port = Number(m[2]);
      const keyCore = m[3].endsWith('=') ? m[3] : (m[3] + '=');
      const kcanon = canonicalKey('@' + keyCore + '.ed25519');
      const addr = msAddrFrom(host, port, kcanon);
      if (!pubs.find(x => x && canonicalKey(x.key) === kcanon)) {
        pubs.push({ host, port, key: kcanon });
      }
      if (ssb && ssb.conn && typeof ssb.conn.remember === 'function') {
        try { ssb.conn.remember(addr, { type: 'peer', autoconnect: true, key: kcanon }); added++; } catch (_) {}
      } else {
        added++;
      }
    }
    writeJSON(gossipPath, pubs);
    ctx.redirect("/peers");
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
  .post("/settings/replication", koaBody(), async (ctx) => {
    const hops = parseInt(ctx.request.body.hops, 10);
    if (Number.isFinite(hops) && hops >= 0 && hops <= 6) {
      const serverConfigPath = path.join(__dirname, '..', 'configs', 'server-config.json');
      try {
        const cfg = JSON.parse(fs.readFileSync(serverConfigPath, 'utf8'));
        cfg.friends = { ...(cfg.friends || {}), hops };
        fs.writeFileSync(serverConfigPath, JSON.stringify(cfg, null, 2));
      } catch (_) {}
    }
    ctx.redirect("/settings");
  })
  .post("/settings/home-page", koaBody(), async (ctx) => {
    const cfg = getConfig();
    cfg.homePage = String(ctx.request.body.homePage || "").trim() || "activity";
    saveConfig(cfg);
    ctx.redirect("/settings");
  })
  .post("/settings/ux", koaBody(), async (ctx) => {
    const cfg = getConfig();
    const v = String(ctx.request.body.ux || "").trim().toLowerCase();
    const aiNavEnabled = cfg.modules && cfg.modules.aiNavMod === 'on';
    const next = (v === "ainav" && aiNavEnabled) ? "ainav" : "blocks";
    cfg.ux = { ...(cfg.ux && typeof cfg.ux === 'object' ? cfg.ux : {}), current: next };
    saveConfig(cfg);
    ctx.redirect(next === "ainav" ? "/" : "/settings");
  })
  .post("/settings/lan-broadcasting", koaBody(), async (ctx) => {
    const enabled = !!(ctx.request.body && (ctx.request.body.lanBroadcasting === 'on' || ctx.request.body.lanBroadcasting === '1' || ctx.request.body.lanBroadcasting === 'true'));
    const cfg = getConfig();
    cfg.lanBroadcasting = enabled;
    saveConfig(cfg);
    try {
      const ssb = await cooler.open();
      if (ssb && ssb.lan) {
        if (enabled && typeof ssb.lan.start === 'function') { try { ssb.lan.start(); } catch (_) {} }
        if (!enabled && typeof ssb.lan.stop === 'function') { try { ssb.lan.stop(); } catch (_) {} }
      }
    } catch (_) {}
    ctx.redirect("/settings");
  })
  .post("/inhabitants/follow/accept", koaBody(), async (ctx) => {
    const b = ctx.request.body || {};
    const followerId = String(b.followerId || '').trim();
    if (!followerId) { ctx.redirect('/inhabitants?filter=pending'); return; }
    if (viewerFilters.canAutoAcceptNow()) viewerFilters.markAutoAccept();
    viewerFilters.addAccepted(followerId);
    viewerFilters.removePending(followerId);
    ctx.redirect('/inhabitants?filter=pending');
  })
  .post("/inhabitants/follow/reject", koaBody(), async (ctx) => {
    const b = ctx.request.body || {};
    const followerId = String(b.followerId || '').trim();
    if (!followerId) { ctx.redirect('/inhabitants?filter=pending'); return; }
    viewerFilters.removeAccepted(followerId);
    viewerFilters.removePending(followerId);
    ctx.redirect('/inhabitants?filter=pending');
  })
  .post("/settings/wish", koaBody(), async (ctx) => {
    const cfg = getConfig();
    const v = String(ctx.request.body.wish || '').trim();
    cfg.wish = ['mutuals', 'only-lan'].includes(v) ? v : 'whole';
    saveConfig(cfg);
    ctx.redirect("/settings");
  })
  .post("/settings/pm-visibility", koaBody(), async (ctx) => {
    const cfg = getConfig();
    const v = String(ctx.request.body.pmVisibility || '').trim();
    cfg.pmVisibility = v === 'mutuals' ? 'mutuals' : 'whole';
    saveConfig(cfg);
    const returnTo = String((ctx.query && ctx.query.returnTo) || (ctx.request.body && ctx.request.body.returnTo) || '');
    ctx.redirect(['/settings', '/inbox'].includes(returnTo) ? returnTo : '/settings');
  })
  .post("/settings/rebuild", async ctx => { meta.rebuild(); ctx.redirect("/settings"); })
  .post("/modules/preset", koaBody(), async (ctx) => {
    const ALL_MODULES = ['popular', 'topics', 'summaries', 'latest', 'threads', 'multiverse', 'invites', 'wallet', 'legacy', 'cipher', 'bookmarks', 'calendars', 'chats', 'videos', 'docs', 'audios', 'tags', 'images', 'maps', 'trending', 'events', 'tasks', 'market', 'tribes', 'larp', 'votes', 'reports', 'opinions', 'pads', 'transfers', 'feed', 'pixelia', 'melody', 'agenda', 'favorites', 'ai', 'forum', 'games', 'jobs', 'projects', 'shops', 'banking', 'parliament', 'courts', 'logs', 'torrents'];
    const PRESETS = {
      minimal: ['feed', 'forum', 'games', 'images', 'videos', 'audios', 'bookmarks', 'tags', 'trending', 'popular', 'latest', 'threads', 'opinions', 'cipher', 'legacy'],
      social: ['agenda', 'audios', 'bookmarks', 'calendars', 'chats', 'cipher', 'courts', 'docs', 'events', 'favorites', 'feed', 'forum', 'games', 'images', 'invites', 'legacy', 'logs', 'maps', 'multiverse', 'opinions', 'pads', 'parliament', 'pixelia', 'melody', 'projects', 'reports', 'tags', 'tasks', 'threads', 'trending', 'tribes', 'videos', 'votes'],
      economy: ['agenda', 'audios', 'bookmarks', 'calendars', 'chats', 'cipher', 'courts', 'docs', 'events', 'favorites', 'feed', 'forum', 'games', 'images', 'invites', 'legacy', 'logs', 'maps', 'multiverse', 'opinions', 'pads', 'parliament', 'pixelia', 'melody', 'projects', 'reports', 'tags', 'tasks', 'threads', 'trending', 'tribes', 'videos', 'votes', 'banking', 'wallet', 'transfers', 'market', 'jobs', 'shops'],
      full: ALL_MODULES
    };
    const preset = String(ctx.request.body.preset || '');
    const enabledMods = PRESETS[preset];
    if (!enabledMods) { ctx.redirect('/modules'); return; }
    const cfg = getConfig();
    ALL_MODULES.forEach(mod => cfg.modules[`${mod}Mod`] = enabledMods.includes(mod) ? 'on' : 'off');
    saveConfig(cfg);
    ctx.redirect('/modules');
  })
  .post("/save-modules", koaBody(), async (ctx) => {
    const modules = ['popular', 'topics', 'summaries', 'latest', 'threads', 'multiverse', 'invites', 'wallet', 'legacy', 'cipher', 'bookmarks', 'calendars', 'chats', 'videos', 'docs', 'audios', 'tags', 'images', 'maps', 'trending', 'events', 'tasks', 'market', 'tribes', 'larp', 'votes', 'reports', 'opinions', 'pads', 'transfers', 'feed', 'pixelia', 'melody', 'agenda', 'favorites', 'ai', 'forum', 'games', 'graphos', 'jobs', 'projects', 'shops', 'banking', 'parliament', 'courts', 'logs', 'torrents'];
    const cfg = getConfig();
    modules.forEach(mod => cfg.modules[`${mod}Mod`] = ctx.request.body[`${mod}Form`] === 'on' ? 'on' : 'off');
    saveConfig(cfg);
    ctx.redirect(`/modules`);
  })
  .post("/settings/ai", koaBody(), async (ctx) => {
    const aiPrompt = String(ctx.request.body.ai_prompt || "").trim();
    if (aiPrompt.length > 128) { sendErrorPage(ctx, "Prompt too long. Must be 128 characters or fewer.", { status: 400 }); return; }
    const cfg = getConfig();
    cfg.ai = { ...(cfg.ai || {}), prompt: aiPrompt };
    saveConfig(cfg);
    ctx.redirect("/settings");
  })
  .post("/settings/pub-id", koaBody(), async (ctx) => {
    const b = ctx.request.body, cfg = getConfig();
    cfg.walletPub = { pubId: String(b.pub_id || "").trim() };
    saveConfig(cfg);
    ctx.redirect("/settings");
  })
  .post('/transfers/create', koaBody(), async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    await transfersModel.createTransfer(b.to, b.concept, b.amount, b.deadline, b.tags, b.category);
    ctx.redirect(safeReturnTo(ctx, '/transfers?filter=all', ['/transfers']));
  })
  .post('/transfers/update/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    await transfersModel.updateTransferById(ctx.params.id, b.to, b.concept, b.amount, b.deadline, b.tags, b.category);
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
    if (config.public && ctx.method !== "GET") { sendErrorPage(ctx, "Sorry, many actions are unavailable when Oasis is running in public mode. Please run Oasis in the default mode and try again.", { status: 403 }); return; }
    await next();
  },
  async (ctx, next) => { setLanguage(ctx.cookies.get("language") || getConfig().language || "en"); await next(); },
  async (ctx, next) => {
    const isBinary = ctx.path.startsWith('/qr/') || ctx.path.startsWith('/image/') || ctx.path.startsWith('/blob/') || ctx.path.startsWith('/assets/');
    if (isBinary) {
      try { await next(); } catch (err) {
        ctx.status = err.status || 500;
        ctx.body = '';
      }
      return;
    }
    const allowDuringSync =
      ctx.path === '/profile/edit' ||
      ctx.path === '/profile' ||
      ctx.path === '/modules' ||
      ctx.path.startsWith('/c/') ||
      ctx.path.startsWith('/settings');
    if (allowDuringSync) {
      try { await next(); } catch (err) {
        const { i18n } = require('../views/main_views');
        sendErrorPage(ctx, err.message || 'Internal Server Error', { status: err.status || 500 });
      }
      return;
    }
    const ssb = await cooler.open(), status = await ssb.status(), values = Object.values(status.sync.plugins);
    const totalCurrent = values.reduce((acc, cur) => acc + cur, 0), totalTarget = status.sync.since * values.length;
    if (totalTarget - totalCurrent > 1024 * 1024) ctx.response.body = indexingView({ percent: Math.floor((totalCurrent / totalTarget) * 1000) / 10 });
    else { try { await next(); } catch (err) {
      const { i18n } = require('../views/main_views');
      if (err.name === 'FileTooLargeError' || (err.message && err.message.includes('maxFileSize'))) {
        sendErrorPage(ctx, i18n.fileTooLargeMessage, { title: i18n.fileTooLargeTitle, status: 413 });
      } else {
        sendErrorPage(ctx, err.message || 'Internal Server Error', { status: err.status || 500 });
      }
    } }
  },
  async (ctx, next) => {
    if (!ctx.path.startsWith('/assets/') && !ctx.path.startsWith('/image/') && !ctx.path.startsWith('/blob/') && !ctx.path.startsWith('/qr/') && !ctx.path.startsWith('/c/')) {
      const now = Date.now();
      if (now - sharedState.getLastRefresh() > 60000) {
        sharedState.setLastRefresh(now);
        try {
          const stats = await statsModel.getStats('ALL');
          const totalMB = parseSizeMB(stats.statsBlobsSize) + parseSizeMB(stats.statsBlockchainSize);
          const hcT = parseFloat((totalMB * 0.0002 * 475).toFixed(2));
          const inhabitants = stats.usersKPIs?.totalInhabitants || stats.inhabitants || 1;
          const hcH = inhabitants > 0 ? parseFloat((hcT / inhabitants).toFixed(2)) : 0;
          sharedState.setCarbonHcT(hcT);
          sharedState.setCarbonHcH(hcH);
        } catch (_) {}
        try { await refreshInboxCount(); } catch (_) {}
        try { await calendarsModel.checkDueReminders(); } catch (_) {}
        try { await tasksModel.checkDueReminders(); } catch (_) {}
        try {
          const peers = await meta.connectedPeers();
          sharedState.setOnlinePeerCount(Array.isArray(peers) ? peers.length : 0);
        } catch (_) {}
        try {
          sharedState.setInboxUnreadCount(sharedState.getInboxCount());
          sharedState.setLastSyncTs(now);
        } catch (_) {}
        try {
          const ex = await bankingModel.calculateEcoinValue();
          if (ex && ex.isSynced) sharedState.setEcoValue(Number(ex.ecoValue).toFixed(4));
        } catch (_) {}
        try {
          const me = getViewerId();
          const actions = await activityModel.listFeed('all').catch(() => []);
          const mine = (actions || []).filter(a => a && a.author === me && a.type !== 'tombstone' && a.type !== 'post');
          mine.sort((a, b) => (b.ts || 0) - (a.ts || 0));
          const prev = mine[1] || mine[0];
          if (prev) {
            const hrefByType = {
              vote: prev.content?.vote?.link ? `/thread/${encodeURIComponent(prev.content.vote.link)}#${encodeURIComponent(prev.content.vote.link)}` : null,
              transfer: `/transfers/${encodeURIComponent(prev.id)}`,
              tribe: `/tribe/${encodeURIComponent(prev.id)}`,
              shop: `/shops/${encodeURIComponent(prev.id)}`,
              job: `/jobs/${encodeURIComponent(prev.id)}`,
              event: `/events/${encodeURIComponent(prev.id)}`,
              project: `/projects/${encodeURIComponent(prev.id)}`,
              image: `/images/${encodeURIComponent(prev.id)}`,
              audio: `/audios/${encodeURIComponent(prev.id)}`,
              video: `/videos/${encodeURIComponent(prev.id)}`,
              document: `/documents/${encodeURIComponent(prev.id)}`,
              torrent: `/torrents/${encodeURIComponent(prev.id)}`,
              forum: `/forum/${encodeURIComponent(prev.content?.key || prev.id)}`,
              bookmark: `/bookmarks/${encodeURIComponent(prev.id)}`,
              task: `/tasks/${encodeURIComponent(prev.id)}`,
              event_: `/events/${encodeURIComponent(prev.id)}`,
              about: `/author/${encodeURIComponent(prev.author)}`,
              map: `/maps/${encodeURIComponent(prev.id)}`,
              chat: `/chats/${encodeURIComponent(prev.id)}`,
              pad: `/pads/${encodeURIComponent(prev.id)}`,
              pixelia: `/pixelia`
            };
            sharedState.setLastActivity({
              id: prev.id,
              type: prev.type,
              ts: prev.ts,
              href: hrefByType[prev.type] || `/activity?filter=mine`
            });
          }
        } catch (_) {}
      }
    }
    await next();
  },
  routes,
];
const app = http({ host, port, middleware, allowHost: config.allowHost });

let pubEngineTimer = null;
async function runPubEngineTick() {
  if (!bankingModel.isPubNode()) return;
  try { await bankingModel.executeEpoch({}); } catch (_) {}
  try { await bankingModel.processPendingClaims(); } catch (_) {}
  try { await bankingModel.publishPubAvailability(); } catch (_) {}
}
if (bankingModel.isPubNode()) {
  setTimeout(() => { runPubEngineTick(); }, 15000);
  pubEngineTimer = setInterval(runPubEngineTick, 30 * 60 * 1000);
}

let welcomePmAttempted = false;
async function sendWelcomePmIfFirstLaunch() {
  if (welcomePmAttempted) return;
  welcomePmAttempted = true;
  const flagPath = path.join(ssbConfig.path, 'oasis-first-contact');
  try {
    const ssbClient = await cooler.open();
    if (!ssbClient || !ssbClient.id) { welcomePmAttempted = false; return; }
    const ownId = ssbClient.id;

    if (fs.existsSync(flagPath)) {
      let prev = '';
      try { prev = fs.readFileSync(flagPath, 'utf8'); } catch (_) {}
      if (prev.includes(ownId)) return;
      try { fs.unlinkSync(flagPath); } catch (_) {}
    }

    const i18nAll = require('../client/assets/translations/i18n');
    const lang = (getConfig() && getConfig().language) || 'en';
    const t = i18nAll[lang] || i18nAll.en;
    const subject = t.welcomePmSubject || 'Hello.';
    const text = t.welcomePmBody || 'Hello.';
    try {
      await pmModel.sendMessage([], subject, text);
    } catch (err) {
      console.error('[welcome-pm] publish failed:', err && err.message ? err.message : err);
      welcomePmAttempted = false;
      return;
    }
    try { fs.writeFileSync(flagPath, ownId + '\n' + new Date().toISOString() + '\n'); } catch (e) {
      console.error('[welcome-pm] flag write failed:', e && e.message ? e.message : e);
    }
  } catch (err) {
    console.error('[welcome-pm] unexpected error:', err && err.message ? err.message : err);
    welcomePmAttempted = false;
  }
}
setTimeout(() => { sendWelcomePmIfFirstLaunch(); }, 20000);

async function logClearnetStatus() {
  try {
    const ssbClient = await cooler.open();
    if (!ssbClient || !ssbClient.id) return;
    const prefs = await about.visibilityPrefs(ssbClient.id).catch(() => null);
    const modules = [
      ['Shops',     'clearnetShops'],
      ['Jobs',      'clearnetJobs'],
      ['Events',    'clearnetEvents'],
      ['Projects',  'clearnetProjects'],
      ['Blogs',     'clearnetPosts'],
      ['Audios',    'clearnetAudios'],
      ['Videos',    'clearnetVideos'],
      ['Images',    'clearnetImages'],
      ['Documents', 'clearnetDocuments'],
      ['Torrents',  'clearnetTorrents']
    ];
    const active = prefs ? modules.filter(([_, k]) => prefs[k] === true).map(([label]) => label) : [];
    try {
      const { setClearnetModules } = require('../server/ssb_metadata');
      setClearnetModules(active);
    } catch (_) {}
  } catch (_) {
    try {
      const { setClearnetModules } = require('../server/ssb_metadata');
      setClearnetModules([]);
    } catch (_) {}
  }
}
setTimeout(() => { logClearnetStatus(); }, 8000);

app._close = () => {
  if (pubEngineTimer) clearInterval(pubEngineTimer);
  nameWarmup.close();
  cooler.close();
};
module.exports = app;
if (config.open === true) open(url);
