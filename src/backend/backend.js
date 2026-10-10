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
try {
  Object.assign(defaultConfig, JSON.parse(fs.readFileSync(defaultConfigFile, "utf8")));
} catch (e) { if (e.code !== "ENOENT") { console.log(`Problem loading ${defaultConfigFile}`); throw e; } }
const config = cli(defaultConfig, defaultConfigFile);
if (config.debug) {
  process.env.DEBUG = "oasis,oasis:*";
}
let fieldsForSnippet, buildContext, clip, publishExchange, publishExchangeVote, getBestTrainedAnswer, rankContext, exportFineTuning, listAiExchanges;
try {
  ({ fieldsForSnippet, buildContext, clip, publishExchange, publishExchangeVote, getBestTrainedAnswer, rankContext, exportFineTuning, listExchanges: listAiExchanges } = require('../AI/buildAIContext.js'));
} catch (e) {
  const noop = () => {};
  fieldsForSnippet = noop;
  buildContext = noop;
  clip = (t) => t;
  publishExchange = noop;
  publishExchangeVote = noop;
  getBestTrainedAnswer = () => null;
  rankContext = async () => [];
  exportFineTuning = async () => '';
  listAiExchanges = async () => ({ exchanges: [], votes: new Map() });
}
let aiLazy = null;
const loadAi = () => {
  if (aiLazy !== null) return aiLazy || null;
  try {
    aiLazy = { client: require('../AI/ai_client'), intents: require('../AI/intents'), embedder: require('../AI/embedder'), semantic: require('../AI/semantic_search') };
  } catch (_) { aiLazy = false; }
  return aiLazy || null;
};
const aiClient = {
  start: () => { const a = loadAi(); if (a) a.client.start(); },
  status: async () => { const a = loadAi(); return a ? a.client.status() : { installed: false, ready: false, loading: false, error: 'model_missing' }; },
  ask: async (opts) => { const a = loadAi(); if (!a) throw new Error('model_missing'); return a.client.ask(opts); }
};
const aiIntents = {
  detect: async (q, opts) => { const a = loadAi(); return a ? a.intents.detect(q, opts) : null; },
  run: async (key, deps) => { const a = loadAi(); return a ? a.intents.run(key, deps) : null; }
};
const aiEmbedder = {
  isInstalled: () => { const a = loadAi(); return !!(a && a.embedder.isInstalled()); },
  embed: (text, opts) => { const a = loadAi(); return a ? a.embedder.embed(text, opts) : Promise.resolve(null); },
  cosine: (x, y) => { const a = loadAi(); return a ? a.embedder.cosine(x, y) : 0; }
};
const semanticSearch = {
  search: (...args) => { const a = loadAi(); return a ? a.semantic.search(...args) : Promise.resolve([]); }
};
const aiModOn = () => (getConfig().modules || {}).aiMod === 'on';
function startAI() { if (aiModOn()) aiClient.start(); }
const AI_HREF_BY_TYPE = {
  event: '/events', task: '/tasks', transfer: '/transfers', job: '/jobs', market: '/market', tribe: '/tribe', emergency: '/emergencies',
  project: '/projects', housing: '/housing', shop: '/shops', schoolCourse: '/school/course', calendar: '/calendars', campaign: '/campaigns',
  logisticsRoute: '/logistics', industry: '/industry', poll: '/polls', vote: '/votes', forum: '/forum', wikiPage: '/wiki', podcast: '/podcasts',
  shopProduct: '/shops/product', chat: '/chats', mailingList: '/mailing', report: '/reports'
};
const aiHrefFor = (type, id) => (type && id && AI_HREF_BY_TYPE[type]) ? `${AI_HREF_BY_TYPE[type]}/${encodeURIComponent(id)}` : null;
const AI_LANG_NAMES = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ru: 'Russian', zh: 'Chinese', ar: 'Arabic', eu: 'Basque', ca: 'Catalan', gl: 'Galician', hi: 'Hindi' };
const aiSystemPrompt = (lang) => {
  const custom = (getConfig().ai?.prompt || '').trim() || 'Provide an informative and precise response.';
  return [
    'You are "42", the collective assistant of Oasis, a distributed, encrypted and federated social network with its own currency (ECO, also called ECOin), a universal basic income (UBI, "RBU" in Spanish) paid monthly by PUB nodes to inhabitants who claim it, tribes, a parliament, courts and many modules (market, shops, school, jobs, projects, transfers, events, chats).',
    custom,
    `Always answer in the same language the question is written in (Spanish question, Spanish answer; English question, English answer), whatever language earlier turns used. If the language is unclear, use ${AI_LANG_NAMES[lang] || 'English'}. Be concise. Do not invent facts about the user or the network: if you do not know, say so.`
  ].join(' ');
};
const aiHistoryTurns = (chatHistory) => chatHistory.filter(e => e && e.question && e.answer && e.source === 'model' && e.trainStatus !== 'rejected' && e.trainStatus !== 'thinking').slice(0, 6).reverse().flatMap(e => [{ type: 'user', text: String(e.question) }, { type: 'model', text: String(e.answer) }]);
const readAiHistory = (historyPath) => { try { const h = JSON.parse(fs.readFileSync(historyPath, 'utf-8')); return Array.isArray(h) ? h : []; } catch (_) { return []; } };
const writeAiHistory = (historyPath, history) => { try { fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8'); } catch (_) {} };
const aiFailureText = (e, translations) => {
  const msg = String((e && e.message) || e || '');
  const data = e && e.response && e.response.data;
  const reason = (data && data.error) || msg;
  if (/model_missing/.test(reason)) return translations.aiStatusMissingModel || 'The AI model is not installed.';
  if (/not_ready|ECONNREFUSED|timeout|ECONNRESET|forbidden/i.test(reason)) return translations.aiStatusLoading || 'The AI is still loading the model. Please try again in a moment.';
  return translations.aiServerError || 'The AI could not answer. Please try again.';
};
const AI_DEBUG = process.env.OASIS_DEBUG === '1' || process.env.OASIS_DEBUG === 'true';
const aiDebug = (msg) => { if (AI_DEBUG) console.error(`[ai] ${msg}`); };
const answerAiEntry = async (entry, input, lang, previous) => {
  const i18nAll = require('../client/assets/translations/i18n');
  const translations = i18nAll[lang] || i18nAll['en'];
  const t0 = Date.now();
  const step = (name) => aiDebug(`${name} (${Date.now() - t0} ms)`);
  const embedOpts = aiEmbedder.isInstalled() ? { embed: (t) => aiEmbedder.embed(t, { timeoutMs: 8000 }), cosine: aiEmbedder.cosine } : {};
  const result = { answer: '', snippets: [], facts: [], intent: null, source: 'model', trainStatus: 'pending' };
  try {
    const me = getViewerId();
    step('detecting intent');
    const intent = await aiIntents.detect(input, embedOpts).catch(() => null);
    step(`intent: ${intent || 'none'}`);
    const facts = intent ? await aiIntents.run(intent, {
      models: {
        banking: bankingModel, agenda: agendaModel, events: eventsModel, tasks: tasksModel, transfers: transfersModel, inhabitants: inhabitantsModel, friend, parliament: parliamentModel, larp: larpModel, emergencies: emergenciesModel, jobs: jobsModel, market: marketModel, tribes: tribesModel,
        shops: shopsModel, school: schoolModel, projects: projectsModel, housing: housingModel, industry: industryModel, campaigns: campaignsModel, logistics: logisticsModel, calendars: calendarsModel, votes: votesModel, polls: pollsModel, wiki: wikiModel, chats: chatsModel, mailing: mailingModel, podcasts: podcastsModel,
        audios: audiosModel, videos: videosModel, images: imagesModel, documents: documentsModel, torrents: torrentsModel, files: filesModel, blog: blogModel, reports: reportsModel, games: gamesModel, tags: tagsModel, favorites: favoritesModel
      },
      config: getConfig(), sharedState, me, hrefFor: aiHrefFor, nameOf: async (id) => { try { return await about.name(id); } catch (_) { return String(id || '').slice(0, 9); } }, version: OASIS_VERSION
    }) : null;
    if (Array.isArray(facts) && facts.length) {
      result.intent = intent;
      result.facts = facts;
      result.source = 'data';
      const factLines = facts.map(f => f.text);
      try {
        result.answer = await aiClient.ask({
          system: aiSystemPrompt(lang) + ` The following facts come from the live data of this node and are true right now. Answer the question using only these facts, in plain sentences, without adding anything that is not in them. Write your whole answer in the language the question is written in (fall back to ${AI_LANG_NAMES[lang] || 'English'} if unclear), even though the facts are written in English.`,
          context: factLines, history: [], input, lang, maxTokens: 300
        });
      } catch (_) {
        result.answer = factLines.join('\n');
      }
      if (!result.answer.trim()) result.answer = factLines.join('\n');
    } else {
      step('looking for an approved answer');
      const trained = await getBestTrainedAnswer(input, embedOpts).catch(() => null);
      step(trained ? 'approved answer found' : 'no approved answer');
      if (trained && trained.answer) {
        result.answer = trained.answer;
        result.snippets = trained.ctx || [];
        result.source = 'network';
        result.trainStatus = 'approved';
      } else {
        const context = await rankContext(input, { ...embedOpts, k: 5 }).catch(() => []);
        result.snippets = context;
        step(`context: ${context.length} snippets, asking the model`);
        result.answer = await aiClient.ask({ system: aiSystemPrompt(lang), history: aiHistoryTurns(previous || []), context, input, lang });
        step('model answered');
      }
    }
  } catch (e) {
    const data = e && e.response && e.response.data;
    aiDebug(`answer failed: ${String((data && data.error) || (e && e.message) || e || '').slice(0, 300)}`);
    result.answer = aiFailureText(e, translations);
    result.trainStatus = 'rejected';
    result.source = 'error';
  }
  return { ...entry, ...result };
};
const { statePath: stateFilePath, keysDir: stateKeysDir } = require('../configs/state-manager');
require('../configs/state-manager').migrateAll();
const ADDR_PATH = stateFilePath('wallet-addresses.json');
const readAddrMap = () => { try { return JSON.parse(fs.readFileSync(ADDR_PATH, 'utf8')); } catch { return {}; } };
const writeAddrMap = (map) => { fs.mkdirSync(path.dirname(ADDR_PATH), { recursive: true }); fs.writeFileSync(ADDR_PATH, JSON.stringify(map, null, 2)); };

let electionInFlight = null;
const ensureTerm = async () => {
  const cur = await parliamentModel.getPublishedTerm().catch(() => null);
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

const safeArr = v => Array.isArray(v) ? v : [];
const safeText = v => String(v || '').trim();
const { safeReturnTo, safeRefererRedirect, pickMsgKeys, isMsgKey, publicModeGuard, isClearnetPath, isLocalPath } = require('./request_guards');

const { stripDangerousTags, sanitizeHtml } = require('./sanitizeHtml');
const longText = require('./long_text');

const sharedState = require('../configs/shared-state');


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
const ERROR_PATTERNS = [
  [/^forbidden\.?$/i, 'errorForbidden'],
  [/not found/i, 'errorNotFound'],
  [/\bis closed\b/i, 'errorClosed'],
  [/invite-only/i, 'errorInviteOnly'],
  [/too long/i, 'errorTooLong'],
  [/\brequired\b/i, 'errorRequired'],
  [/^invalid\b|\binvalid\b/i, 'errorInvalid'],
  [/not the author|only the (author|owner)/i, 'errorNotAuthor']
];
const localizeError = (message) => {
  const t = require('../views/main_views').i18n;
  const m = String(message == null ? '' : message).trim();
  if (!m) return t.actionFailed;
  if (typeof t[m] === 'string') return t[m];
  if (Object.values(t).some(v => v === m)) return m;
  const hit = ERROR_PATTERNS.find(([re]) => re.test(m));
  if (hit && typeof t[hit[1]] === 'string') return t[hit[1]];
  const en = require('../client/assets/translations/oasis_en').en || {};
  return t.actionFailed === en.actionFailed ? m : t.actionFailed;
};
const ERROR_SIGN_KEY = require('crypto').randomBytes(32);
const errorSignature = (message) => require('crypto').createHmac('sha256', ERROR_SIGN_KEY).update(String(message)).digest('hex').slice(0, 32);
const signedErrorOf = (ctx) => {
  const message = String(ctx.query.error || '');
  const sig = String(ctx.query.errsig || '');
  if (!message || sig.length !== 32) return '';
  try { return require('crypto').timingSafeEqual(Buffer.from(sig), Buffer.from(errorSignature(message))) ? message : ''; } catch (_) { return ''; }
};
const sendErrorPage = (ctx, rawMessage, { title, status, keep, to, exact } = {}) => {
  if (isClearnetPath(ctx.request)) {
    ctx.status = status && status !== 400 ? status : 404;
    ctx.type = 'html';
    ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
    return;
  }
  const { errorView } = require('../views/main_views');
  const message = exact ? String(rawMessage || '') : localizeError(rawMessage);
  const ref = to && isLocalPath(to) ? `${ctx.protocol}://${ctx.host}${to}` : ctx.request.header.referer;
  let backHref = '/';
  let backUrl = null;
  try {
    if (ref) {
      const u = new URL(ref);
      if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host === ctx.host) {
        backHref = u.pathname + u.search + u.hash;
        backUrl = u;
      }
    }
  } catch (_) {}
  const backIsPage = !!backUrl && (() => { try { return !!router.match(backUrl.pathname, 'GET').route; } catch (_) { return false; } })();
  if (backUrl && backIsPage && (ctx.method !== 'GET' || to) && (!status || status === 400 || status === 403 || status === 404) && !backUrl.pathname.startsWith('/c/')) {
    backUrl.searchParams.set('error', String(message || ''));
    backUrl.searchParams.set('errsig', errorSignature(String(message || '')));
    for (const [k, v] of Object.entries(keep || {})) {
      if (v === undefined || v === null || v === '') backUrl.searchParams.delete(k);
      else backUrl.searchParams.set(k, String(v).slice(0, 2000));
    }
    ctx.redirect(backUrl.pathname + backUrl.search + backUrl.hash);
    return;
  }
  if (status) ctx.status = status;
  ctx.type = 'html';
  ctx.body = errorView({ title, message, backHref });
};

const exceedsSsbLimit = (content, extraOverhead = 0) => {
  try { return Buffer.byteLength(JSON.stringify(content), 'utf8') + 512 + extraOverhead > 8192; }
  catch (_) { return false; }
};

const isSsbTooLargeError = (e) => e && /8192|must not be larger/i.test(String(e && e.message));

const INLINE_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'video/mp4', 'video/webm', 'video/ogg', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/flac']);
const inlineMediaType = (type) => { const t = String(type || '').split(';')[0].trim().toLowerCase(); return INLINE_MEDIA_TYPES.has(t) ? t : null; };
const seedsOf = (spreadMap, item) => {
  const info = spreadMap instanceof Map && item ? spreadMap.get(item.key) : null;
  return info && typeof info.count === 'number' ? info.count : (info && Array.isArray(info.voters) ? info.voters.length : 0);
};
const sortBySeeds = (list, spreadMap) => list.slice().sort((a, b) => seedsOf(spreadMap, b) - seedsOf(spreadMap, a) || new Date(b.createdAt) - new Date(a.createdAt));
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const ADMIN_TOKEN = config.allowHost ? require('crypto').randomBytes(16).toString('hex') : null;
const sameSecret = (a, b) => { try { return a.length === b.length && require('crypto').timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch (_) { return false; } };
const fromLoopbackSocket = (ctx) => {
  const raw = String((ctx.request && ctx.request.ip) || ctx.ip || (ctx.socket && ctx.socket.remoteAddress) || '');
  const ip = raw.replace(/^::ffff:/, '');
  if (!(ip === '127.0.0.1' || ip === '::1' || ip === 'localhost')) return false;
  if (['x-forwarded-for', 'forwarded', 'via', 'x-real-ip', 'x-forwarded-host'].some(h => ctx.get(h))) return false;
  const host = String(ctx.get('host') || '').trim().toLowerCase().replace(/^\[([^\]]+)\](?::\d+)?$/, '$1').replace(/:\d+$/, '');
  return LOOPBACK_HOSTS.has(host);
};
const isLoopbackRequest = (ctx) => {
  if (!fromLoopbackSocket(ctx)) return false;
  if (!ADMIN_TOKEN) return true;
  return sameSecret(String(ctx.cookies.get('oasis_admin') || ''), ADMIN_TOKEN);
};
const confirmPage = (ctx, { message, action, hidden = [], backHref = null }) => {
  ctx.status = 200;
  ctx.type = 'html';
  ctx.body = require('../views/main_views').confirmView({ message, action, hidden, backHref });
};
const LOOPBACK_ONLY_PATHS = ['/settings', '/wallet', '/banking/simulate', '/fediverse', '/peers/pause', '/peers/resume', '/peers/connect', '/peers/disconnect', '/peers/refresh', '/peers/prune', '/peers/export', '/peers/import', '/logs/export', '/ai/export', '/export', '/backup', '/update', '/panic'];
const validPeerHost = (hostStr) => {
  const isIPv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostStr);
  const isHostname = /^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)*$/.test(hostStr);
  if ((!isIPv4 && !isHostname) || hostStr.length > 253) return false;
  return !(isIPv4 && hostStr.split('.').some(o => Number(o) > 255));
};
const validPeerPort = (prt) => Number.isInteger(prt) && prt >= 1 && prt <= 65535;
const isLoopbackOnlyPath = (raw) => {
  let p = String(raw || '');
  try { p = decodeURIComponent(p); } catch (_) {}
  p = p.toLowerCase().replace(/\/{2,}/g, '/');
  return LOOPBACK_ONLY_PATHS.some(x => p === x || p.startsWith(`${x}/`));
};
const discardUpload = (file) => { if (file && file.filepath) { try { fs.unlinkSync(file.filepath); } catch (_) {} } };
const WALLET_CHIP_PATHS = ['/wallet', '/banking', '/shops', '/school', '/market', '/transfers'];
const WALLET_CHECK_WAIT_MS = 400;
const settleWithin = (promise, ms) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  Promise.resolve(promise).then(() => { clearTimeout(timer); resolve(); }, () => { clearTimeout(timer); resolve(); });
});
const refreshDonatableAuthors = async () => {
  try {
    const wallets = await bankingModel.scanAllWalletsSSB().catch(() => ({}));
    const me = getViewerId();
    const out = new Set(Object.keys(wallets || {}).filter(id => id !== me && ECO_ADDRESS_RE.test(String(wallets[id] || ''))));
    sharedState.setDonatableAuthors(out);
  } catch (_) {}
};
let lastWalletReadyCheck = 0;
const refreshWalletReady = async (force = false) => {
  const ready = sharedState.getWalletReady ? sharedState.getWalletReady() : false;
  if (!force && ready && Date.now() - lastWalletReadyCheck < 60000) return ready;
  if (!force && !ready && Date.now() - lastWalletReadyCheck < 5000) return ready;
  lastWalletReadyCheck = Date.now();
  try {
    const me = getViewerId();
    const walletUrl = bankingModel.hasWalletCredentials();
    if (!walletUrl) { sharedState.setWalletReady(false); return false; }
    let addr = await bankingModel.getUserAddress(me).catch(() => null);
    if (!addr && walletUrl) {
      try { const res = await bankingModel.ensureSelfAddressPublished(); if (res && res.address) addr = res.address; } catch (_) {}
      if (!addr) addr = await bankingModel.getUserAddress(me).catch(() => null);
    }
    let published = addr ? await bankingModel.hasPublishedAddress(me).catch(() => false) : false;
    if (addr && !published && walletUrl) {
      try { await bankingModel.setUserAddress(me, addr, true); published = await bankingModel.hasPublishedAddress(me).catch(() => false); } catch (_) {}
    }
    const next = !!(addr && published && walletUrl);
    sharedState.setWalletReady(next);
    if (next) { try { await bankingModel.sampleUserFunds(); } catch (_) {} }
    return next;
  } catch (_) { return ready; }
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
const actorLink = async (id) => {
  let name = '';
  try { name = await about.name(id); } catch (_) {}
  const clean = String(name || '').trim().replace(/^@/, '');
  const label = clean ? `@${clean}` : `${String(id).slice(0, 12)}…`;
  return `[${label}](/author/${encodeURIComponent(id)})`;
};

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
const tsOf = (...values) => {
  for (const v of values) {
    const t = typeof v === 'number' ? v : Date.parse(v || '');
    if (Number.isFinite(t) && t > 0) return t;
  }
  return 0;
};
const dayOf = (ts) => ts ? new Date(ts).toISOString().slice(0, 10) : '';
const sizeOf = (bytes) => {
  let value = Number(bytes) || 0;
  if (value <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};
const hostOf = (url) => {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.replace(/^www\./, '');
  } catch (_) { return ''; }
};
const blobSizeOf = async (value) => {
  const { blobIdOf } = require('../views/clearnet_view');
  const id = blobIdOf(value);
  if (!id) return '';
  try {
    const ssbSize = await cooler.open();
    return await new Promise((resolve) => {
      try {
        ssbSize.blobs.size(id, (err, bytes) => resolve(err ? '' : sizeOf(bytes)));
      } catch (_) { resolve(''); }
    });
  } catch (_) { return ''; }
};
const detailsOf = (...parts) => parts.map(p => String(p == null ? '' : p).trim()).filter(Boolean).slice(0, 4);
const clearnetDetails = (kind, x) => {
  if (!x) return [];
  const { i18n } = require('../views/main_views');
  if (kind === 'market') {
    const type = String(x.item_type || '').toLowerCase();
    return detailsOf(type === 'auction' ? `🔨 ${i18n.cnAuction}` : type === 'exchange' ? `🔁 ${i18n.cnExchange}` : type.toUpperCase());
  }
  if (kind === 'events') return detailsOf(x.location ? `📍 ${x.location}` : '');
  if (kind === 'jobs') {
    const time = String(x.job_time || '').toLowerCase();
    return detailsOf(
      x.job_type ? `💼 ${String(x.job_type).toUpperCase()}` : '',
      time === 'partial' ? `⏱ ${String(i18n.jobTimePartial).toUpperCase()}` : time === 'complete' ? `⏱ ${String(i18n.jobTimeComplete).toUpperCase()}` : ''
    );
  }
  if (kind === 'podcasts') return detailsOf(Number(x.episodeCount) > 0 ? `🎙 ${Number(x.episodeCount)} ${String(i18n.podcastEpisodesLabel).toUpperCase()}` : '');
  if (kind === 'projects') {
    const progress = Number(x.progress);
    return detailsOf(Number.isFinite(progress) ? `📈 ${Math.max(0, Math.min(100, Math.round(progress)))}%` : '');
  }
  const capOf = (v) => { const s = String(v || ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
  if (kind === 'emergencies') return detailsOf(
    x.severity ? `⚠ ${String(i18n[`emergencySeverity${capOf(x.severity)}`] || x.severity).toUpperCase()}` : '',
    x.category ? String(i18n[`emergencyCategory${capOf(x.category)}`] || x.category).toUpperCase() : ''
  );
  if (kind === 'campaigns') return detailsOf(
    Number(x.goal) > 0 ? `✍ ${Number(x.signatureCount) || 0} / ${Number(x.goal)}` : '',
    x.category ? String(i18n[`campaignCategory${capOf(x.category)}`] || x.category).toUpperCase() : ''
  );
  if (kind === 'housing') return detailsOf(
    x.housing_type ? String(i18n[`housingType${String(x.housing_type).toUpperCase()}`] || x.housing_type).toUpperCase() : '',
    x.place ? `📍 ${x.place}` : ''
  );
  return [];
};
const clearnetMapPoint = async (mapUrl, author) => {
  const m = String(mapUrl || '').trim().match(/^\/maps\/([^/?#\s]+)/);
  if (!m || !author) return null;
  let mapId = m[1];
  try { mapId = decodeURIComponent(mapId); } catch (_) {}
  let map = null;
  try { map = await mapsModel.getMapById(mapId, null); } catch (_) { return null; }
  if (!map || map.author !== author || map.tribeId || map.encrypted || String(map.mapType || '').toUpperCase() === 'CLOSED') return null;
  const lat = parseFloat(map.lat), lng = parseFloat(map.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return { lat: lat.toFixed(5), lng: lng.toFixed(5), title: String(map.title || '') };
};
const attachCommentMeta = async (actions) => {
  const list = Array.isArray(actions) ? actions : [];
  if (!list.length) return list;
  try {
    const ssbComments = await cooler.open();
    const { readTyped } = require('../models/typed_log');
    const { buildValidatedTombstoneSet } = require('../models/tombstone_validator');
    const posts = await readTyped(ssbComments, ['post', 'feed-action', 'tombstone'], { limit: getConfig().ssbLogStream?.limit || 1000 });
    const gone = buildValidatedTombstoneSet(posts || []);
    const byRoot = new Map();
    for (const m of posts || []) {
      const c = m && m.value && m.value.content;
      if (!c || c.type === 'tombstone' || gone.has(m.key)) continue;
      if (c.type === 'feed-action' && c.action !== 'comment') continue;
      const root = c.root || c.fork;
      if (!root || !String(c.text || '').trim()) continue;
      const ts = (m.value && m.value.timestamp) || 0;
      const prev = byRoot.get(root);
      if (!prev) byRoot.set(root, { count: 1, lastKey: m.key, lastTs: ts });
      else {
        prev.count += 1;
        if (ts >= prev.lastTs) { prev.lastKey = m.key; prev.lastTs = ts; }
      }
    }
    for (const a of list) {
      if (!a) continue;
      const hit = byRoot.get(a.id) || byRoot.get(a.rootId) || byRoot.get(a.key);
      a.commentCount = hit ? hit.count : 0;
      a.lastCommentKey = hit ? hit.lastKey : null;
    }
  } catch (_) {}
  return list;
};
const settingsReports = { verification: null, rebuild: null };
const wikiSnippet = (body, cover) => {
  const text = String(body || '');
  if (!cover) return text;
  return text.replace(/!\[image:[^\]]*\]\((&[^)]+)\)/, (m, blob) => (blob === cover ? '' : m)).trim();
};
const CLEARNET_PATH_KIND = { audios: 'audios', videos: 'videos', images: 'images', documents: 'documents', files: 'files', torrents: 'torrents', bookmarks: 'bookmarks', blogs: 'posts', feed: 'feed', wiki: 'wiki', podcasts: 'podcasts', market: 'market', shops: 'shops', school: 'school', jobs: 'jobs', events: 'events', projects: 'projects', emergencies: 'emergencies', campaigns: 'campaigns', housing: 'housing', rooms: 'rooms', maps: 'maps', calendars: 'calendars' };
const CLEARNET_CHAINED_TYPES = ['event', 'project', 'feed'];
const CLEARNET_CHAINED_KINDS = new Set(['events', 'projects', 'feed']);
const clearnetDecisionsFor = (kind, items) => clearnetDecisions([].concat(items || []).map((x) => (x && typeof x === 'object' ? { rootId: x.rootId, id: x.id, key: x.key, __clearnetKind: kind } : x)));
const CLEARNET_KIND_PREF = { shops: 'clearnetShops', jobs: 'clearnetJobs', events: 'clearnetEvents', projects: 'clearnetProjects', posts: 'clearnetPosts', audios: 'clearnetAudios', videos: 'clearnetVideos', images: 'clearnetImages', documents: 'clearnetDocuments', torrents: 'clearnetTorrents', files: 'clearnetFiles', podcasts: 'clearnetPodcasts', school: 'clearnetSchool', market: 'clearnetMarket', feed: 'clearnetFeed', wiki: 'clearnetWiki', bookmarks: 'clearnetBookmarks', emergencies: 'clearnetEmergencies', campaigns: 'clearnetCampaigns', housing: 'clearnetHousing', rooms: 'clearnetRooms', maps: 'clearnetMaps', calendars: 'clearnetCalendars' };
let clearnetDecisionCache = { at: 0, data: null };
const clearnetDecisions = async (items) => {
  const fresh = clearnetDecisionCache.data && Date.now() - clearnetDecisionCache.at < 30000;
  const unknown = fresh && [].concat(items || []).some((x) => x && !x.rootId && typeof (x.id || x.key) === 'string' && String(x.id || x.key).startsWith('%') && CLEARNET_CHAINED_KINDS.has(x.__clearnetKind) && !clearnetDecisionCache.data.known.has(x.id || x.key));
  if (fresh && !unknown) return clearnetDecisionCache.data;
  const byTarget = new Map();
  const kindsByAuthor = new Map();
  const prevOf = new Map();
  const known = new Set();
  try {
    const ssb = await cooler.open();
    const byType = (type) => new Promise((res) => { try { pull(ssb.messagesByType({ type }), pull.collect((e, a) => res(e ? [] : a))); } catch (_) { res([]); } });
    const msgs = await byType('clearnetItem');
    for (const type of CLEARNET_CHAINED_TYPES) {
      for (const m of await byType(type)) {
        const c = m && m.value && m.value.content;
        if (m && m.key) known.add(m.key);
        if (c && typeof c.replaces === 'string' && c.replaces !== m.key) prevOf.set(m.key, c.replaces);
      }
    }
    for (const m of msgs) {
      const c = m && m.value && m.value.content;
      if (!c || typeof c.target !== 'string') continue;
      const author = m.value.author;
      const ts = Number(m.value.timestamp) || 0;
      if (!byTarget.has(c.target)) byTarget.set(c.target, new Map());
      const prev = byTarget.get(c.target).get(author);
      if (!prev || prev.ts < ts || (prev.ts === ts && c.on !== true)) byTarget.get(c.target).set(author, { on: c.on === true, ts, kind: String(c.kind || '') });
    }
    for (const perAuthor of byTarget.values()) {
      for (const [author, d] of perAuthor) {
        if (!d.on || !d.kind) continue;
        if (!kindsByAuthor.has(author)) kindsByAuthor.set(author, new Set());
        kindsByAuthor.get(author).add(d.kind);
      }
    }
  } catch (_) {}
  clearnetDecisionCache = { at: Date.now(), data: { byTarget, kindsByAuthor, prevOf, known } };
  return clearnetDecisionCache.data;
};
const clearnetItemTs = (x) => {
  const v = x && (x.createdAt || x.ts || (x.value && x.value.timestamp) || x.timestamp);
  const n = typeof v === 'number' ? v : Date.parse(v || '');
  return Number.isFinite(n) ? n : 0;
};
const clearnetDecisionFor = (decisions, item, author) => {
  const ids = new Set();
  for (const id of [item && item.rootId, item && item.id, item && item.key]) {
    let cur = id;
    for (let i = 0; typeof cur === 'string' && !ids.has(cur) && i < 1000; i++) {
      ids.add(cur);
      cur = decisions.prevOf ? decisions.prevOf.get(cur) : null;
    }
  }
  let best = null;
  for (const id of ids) {
    const d = decisions.byTarget.get(id);
    const mine = d && d.get(author);
    if (mine && (!best || mine.ts > best.ts || (mine.ts === best.ts && !mine.on))) best = mine;
  }
  return best;
};
const CLEARNET_CLOSED_VISIBILITY = new Set(['HIDDEN', 'CLOSED', 'INVITE', 'PRIVATE']);
const clearnetPublicSync = (kind, item, author, prefs, decisions) => {
  if (!item || !author || item.tribeId || item.encrypted === true) return false;
  if (CLEARNET_CLOSED_VISIBILITY.has(String(item.visibility || '').toUpperCase())) return false;
  const d = decisions ? clearnetDecisionFor(decisions, item, author) : null;
  if (d) return d.on;
  if (!prefs || prefs.clearnet !== true || prefs[CLEARNET_KIND_PREF[kind]] !== true) return false;
  const since = Date.parse(prefs.clearnetSince || '');
  if (!Number.isFinite(since)) return true;
  const ts = clearnetItemTs(item);
  return ts > 0 && ts < since;
};
const clearnetPublic = async (kind, item, author) => {
  const who = author || (item && (item.author || item.seller || item.organizer || (item.value && item.value.author)));
  if (!who) return false;
  const prefs = await about.visibilityPrefs(who).catch(() => null);
  return clearnetPublicSync(kind, item, who, prefs, await clearnetDecisionsFor(kind, item));
};
const annotateClearnet = async (kind, items, authorOf = (x) => x && (x.author || x.seller || x.organizer || (x.value && x.value.author))) => {
  const decisions = await clearnetDecisionsFor(kind, items);
  const prefsCache = new Map();
  const authors = new Set((items || []).map(authorOf).filter(Boolean));
  const profiles = authors.size > 5 ? await about.profiles().catch(() => null) : null;
  for (const x of items || []) {
    if (!x) continue;
    const who = authorOf(x);
    if (!who) { x.clearnet = false; continue; }
    if (!prefsCache.has(who)) prefsCache.set(who, profiles ? about.visibilityFrom((profiles.get(who) || {}).visibilityPrefs) : await about.visibilityPrefs(who).catch(() => null));
    x.clearnet = clearnetPublicSync(kind, x, who, prefsCache.get(who), decisions);
  }
  return items;
};
const setClearnetItem = async (kind, target, on) => {
  if (!CLEARNET_KIND_PREF[kind] || typeof target !== 'string' || !target.startsWith('%')) return false;
  const ssb = await cooler.open();
  await new Promise((res, rej) => ssb.publish({ type: 'clearnetItem', target, kind, on: !!on, createdAt: new Date().toISOString() }, (e) => e ? rej(e) : res()));
  clearnetDecisionCache = { at: 0, data: null };
  clearnetIndexCache = { ts: 0, data: null, building: null };
  return true;
};
const clearnetRootOf = async (id) => {
  if (typeof id !== 'string' || !id.startsWith('%')) return id;
  const ssb = await cooler.open();
  const seen = new Set();
  let cur = id;
  let author = null;
  while (!seen.has(cur) && seen.size < 1000) {
    seen.add(cur);
    const msg = await new Promise((res) => ssb.get(cur, (e, m) => res(e ? null : m)));
    if (!msg) return cur;
    if (author && msg.author !== author) return [...seen][seen.size - 2] || cur;
    author = msg.author;
    const c = msg.content;
    const prev = c && typeof c === 'object' ? (typeof c.replaces === 'string' ? c.replaces : (typeof c.rootId === 'string' && c.rootId.startsWith('%') ? c.rootId : null)) : null;
    if (!prev || prev === cur) return cur;
    cur = prev;
  }
  return cur;
};
const clearnetBlockedContent = (c) => !c || typeof c !== 'object' || !!c.tribeId || c.encrypted === true || !!c.encryptedPayload || c.private === true || Array.isArray(c.recps)
  || tribeCrypto.isTribeMsg(c)
  || CLEARNET_CLOSED_VISIBILITY.has(String(c.visibility || '').toUpperCase())
  || String(c.isPublic || '').toLowerCase() === 'private'
  || ((c.type === 'schoolCourse' || c.courseType !== undefined) && Number(c.price) > 0)
  || ((c.type === 'campaign' || c.type === 'housing') && String(c.status || '').toUpperCase() === 'CLOSED')
  || (c.type === 'emergency' && String(c.status || '').toUpperCase() === 'RESOLVED');
const clearnetWithForm = (c, b) => {
  const out = { ...c };
  if (b.visibility !== undefined) out.visibility = b.visibility;
  if (b.isPublic !== undefined) out.isPublic = b.isPublic;
  if (b.courseType !== undefined) {
    const ct = String(b.courseType || 'OPEN').toUpperCase();
    out.courseType = ct;
    out.visibility = ct === 'INVITE' ? 'INVITE' : 'PUBLIC';
    out.price = ct === 'PAID' ? b.price : '0';
  }
  return out;
};
const clearnetConflict = (b) => !!b && String(b.clearnet || '') === '1' && clearnetBlockedContent(clearnetWithForm({}, b));
const CLEARNET_REACH_FIELD = { rooms: 'status', maps: 'mapType', calendars: 'status' };
const clearnetHasPublicInvite = (x) => Array.isArray(x && x.invites) && x.invites.some(i => i && typeof i === 'object' && i.public === true);
const CLEARNET_REACH_OK = {
  rooms: (r) => !!r && !r.tribeId && !r.encrypted && r.type === 'OPEN' && String(r.status || '').toUpperCase() === 'OPEN' && !r.isClosed,
  maps: (m) => !!m && !m.tribeId && !m.encrypted && !m.contentEncrypted && String(m.mapType || '').toUpperCase() === 'OPEN',
  calendars: (c) => !!c && !c.tribeId && !c.encrypted && String(c.status || '').toUpperCase() === 'OPEN' && !c.isClosed && (!c.contentEncrypted || clearnetHasPublicInvite(c))
};
const clearnetReachConflict = (kind, b) => !!b && String(b.clearnet || '') === '1' && (!!b.tribeId || String(b[CLEARNET_REACH_FIELD[kind]] || 'OPEN').toUpperCase() !== 'OPEN');
const clearnetDraft = (b, base = {}) => ({
  ...base,
  ...clearnetWithForm(b, b),
  tags: Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(',').map(t => t.trim()).filter(Boolean),
  clearnet: true,
  clearnetConflict: true
});
const renderClearnetConflict = async (ctx, render) => {
  ctx.state.inlineError = require('../views/main_views').i18n.clearnetPrivateConflict;
  ctx.status = 400;
  ctx.body = await render();
};
const applyClearnetChoice = async (ctx, kind, created, { recheck = false, allowed } = {}) => {
  const body = (ctx && ctx.request && ctx.request.body) || {};
  if (body.clearnet === undefined && !recheck && !clearnetBlockedContent(clearnetWithForm({}, body))) return;
  const raw = typeof created === 'string' ? created : (created && (created.rootId || created.key || created.id));
  if (typeof raw !== 'string' || !raw.startsWith('%')) return;
  const target = await clearnetRootOf(raw).catch(() => raw);
  const ssb = await cooler.open();
  const get = (id) => new Promise((res) => ssb.get(id, (e, m) => res(e ? null : m)));
  const msg = await get(raw);
  const rootMsg = target === raw ? msg : await get(target);
  const c = msg && msg.content;
  const blocked = allowed !== undefined ? !allowed : (!c || typeof c !== 'object' || clearnetBlockedContent(clearnetWithForm(c, body)));
  const ts = Number((rootMsg && rootMsg.timestamp) || (msg && msg.timestamp)) || Date.now();
  const current = await clearnetPublic(kind, { key: raw, rootId: target, ts }, getViewerId()).catch(() => false);
  const wanted = blocked ? false : (body.clearnet !== undefined ? String(body.clearnet) === '1' : current);
  if (wanted !== current) await setClearnetItem(kind, target, wanted).catch(() => {});
};
const tribeReachAllowed = async (tribeId) => tribesContentModel.chainIsPublic(tribeId).catch(() => false);
const readTribeReach = (body) => {
  const v = String((body && body.reach) || '').toLowerCase();
  return tribesContentModel.reachLevels.includes(v) ? v : 'tribe';
};
const tribeRepliesFor = async (item) => item && item.contentType === 'forum' ? ((await tribesContentModel.getThread(item.id).catch(() => null)) || {}).replies || [] : [];
const publishTribeExposure = async (item, level, replies = []) => {
  const r = await tribesContentModel.publishExposure(item, level, replies);
  clearnetTribesCache = { at: 0, data: null };
  openTribeItemsCache = { at: 0, data: null };
  return r;
};
const tribeExposeCreated = async (ctx, tribe, created) => {
  const level = readTribeReach(ctx && ctx.request && ctx.request.body);
  if (level === 'tribe' || !created || !created.key || !(await tribeReachAllowed(tribe.id))) return;
  const item = await tribesContentModel.getById(created.key).catch(() => null);
  if (item) await publishTribeExposure(item, level).catch(() => {});
};
const tribeRefreshExposure = async (contentId) => {
  const item = await tribesContentModel.getById(contentId).catch(() => null);
  if (!item) return;
  const level = await tribesContentModel.levelOf(item).catch(() => 'tribe');
  if (level === 'tribe') return;
  await publishTribeExposure(item, level, await tribeRepliesFor(item)).catch(() => {});
};
const withdrawTribeExposures = async (tribeId) => {
  const ids = new Set([await tribesModel.getRootId(tribeId).catch(() => tribeId)]);
  for (const st of await tribesModel.listSubTribes(tribeId).catch(() => [])) ids.add(await tribesModel.getRootId(st.id).catch(() => st.id));
  const state = await tribesContentModel.exposureState({ ignorePrivacy: true }).catch(() => new Map());
  for (const e of state.values()) {
    if (!ids.has(e.tribeId) || e.level === 'tribe') continue;
    await publishTribeExposure({ rootId: e.tribeId, originId: e.origin, contentType: e.contentType }, 'tribe').catch(() => {});
  }
};
const syncClearnetSince = async () => {
  const ssb = await cooler.open();
  const current = await about.visibilityPrefs(ssb.id).catch(() => null);
  if (!current || current.clearnetSince) return;
  const marker = stateFilePath('clearnet-since.json');
  try { if (fs.existsSync(marker)) return; } catch (_) {}
  await new Promise((resolve, reject) => ssb.publish({ type: 'about', about: ssb.id, visibilityPrefs: { ...current, clearnetSince: new Date().toISOString() } }, (err) => err ? reject(err) : resolve()));
  try { fs.writeFileSync(marker, JSON.stringify({ at: new Date().toISOString() })); } catch (_) {}
};
let clearnetIndexCache = { ts: 0, data: null, building: null };
const CLEARNET_INDEX_TTL_MS = 60 * 1000;
let clearnetTribesCache = { at: 0, data: null };
const getClearnetTribes = async () => {
  if (clearnetTribesCache.data && Date.now() - clearnetTribesCache.at < CLEARNET_INDEX_TTL_MS) return clearnetTribesCache.data;
  const state = await tribesContentModel.exposureState().catch(() => new Map());
  const counts = new Map();
  for (const e of state.values()) if (e.level === 'clearnet' && e.item) counts.set(e.tribeId, (counts.get(e.tribeId) || 0) + 1);
  const out = [];
  for (const [tribeId, count] of counts) {
    const t = await tribesModel.getTribeById(tribeId).catch(() => null);
    if (!t || !(await tribeReachAllowed(t.id))) continue;
    out.push({ id: tribeId, title: t.title || '', description: t.description || '', image: t.image || null, count });
  }
  clearnetTribesCache = { at: Date.now(), data: out };
  return out;
};
const TRIBE_SECTION_OF = { event: 'events', task: 'tasks', votation: 'votations', forum: 'forum', feed: 'feed', report: 'reports', market: 'market', job: 'jobs', project: 'projects' };
const TRIBE_MEDIA_SECTION = { image: 'images', audio: 'audios', video: 'videos', document: 'documents', bookmark: 'bookmarks', torrent: 'torrents' };
let openTribeItemsCache = { at: 0, data: null };
const getOpenTribeItems = async () => {
  if (openTribeItemsCache.data && Date.now() - openTribeItemsCache.at < 30000) return openTribeItemsCache.data;
  const state = await tribesContentModel.exposureState().catch(() => new Map());
  const titles = new Map();
  const out = [];
  for (const e of state.values()) {
    if (!e.item || e.level === 'tribe') continue;
    if (!titles.has(e.tribeId)) {
      const t = await tribesModel.getTribeById(e.tribeId).catch(() => null);
      titles.set(e.tribeId, t ? String(t.title || '') : null);
    }
    const tribeTitle = titles.get(e.tribeId);
    if (tribeTitle === null) continue;
    const s = e.item;
    const section = s.contentType === 'media' ? (TRIBE_MEDIA_SECTION[s.mediaType] || 'activity') : (TRIBE_SECTION_OF[s.contentType] || 'activity');
    const tribeHref = `/tribe/${encodeURIComponent(e.tribeId)}`;
    const href = `${tribeHref}?section=${section}${s.contentType === 'forum' ? `&thread=${encodeURIComponent(e.origin)}` : ''}`;
    out.push({ ...s, id: e.origin, key: e.origin, rootId: e.origin, _ts: e.ts, tribeOrigin: { tribeId: e.tribeId, title: tribeTitle, href, tribeHref, level: e.level, openedBy: e.by } });
  }
  openTribeItemsCache = { at: Date.now(), data: out };
  return out;
};
const tribeItemsFor = async (contentType, mediaType = null) => (await getOpenTribeItems().catch(() => [])).filter(x => x.contentType === contentType && (!mediaType || x.mediaType === mediaType));
const buildClearnetIndex = async () => {
  const all = await inhabitantsModel.listInhabitants({ filter: 'all', includeInactive: true }).catch(() => []);
  const out = [];
  for (const u of all) {
    const feedId = u && (u.id || u.feedId || u.key);
    if (!feedId || !ssbRef.isFeedId(feedId)) continue;
    const prefs = await about.visibilityPrefs(feedId).catch(() => null);
    const decided = (await clearnetDecisions()).kindsByAuthor.has(feedId);
    if (!decided && (!prefs || prefs.clearnet !== true)) continue;
    const name = await about.name(feedId).catch(() => '');
    const items = await collectClearnetItems(feedId, prefs || {}, { max: 500 });
    if (!(prefs && prefs.clearnet === true) && !Object.values(items).some(list => Array.isArray(list) && list.length)) continue;
    out.push({ feedId, name: name || '', items });
  }
  return out;
};
const getClearnetIndex = async (force = false) => {
  if (!force && clearnetIndexCache.data && Date.now() - clearnetIndexCache.ts < CLEARNET_INDEX_TTL_MS) return clearnetIndexCache.data;
  if (!clearnetIndexCache.building) {
    clearnetIndexCache.building = buildClearnetIndex().then(data => { clearnetIndexCache = { ts: Date.now(), data, building: null }; return data; }).catch(() => { clearnetIndexCache.building = null; return clearnetIndexCache.data || []; });
  }
  return clearnetIndexCache.building;
};
const CLEARNET_BLOB_RE = /&[A-Za-z0-9+/]{43}=\.sha256/g;
let clearnetBlobCache = { ts: 0, set: null, forcedAt: 0 };
const clearnetBlobSet = async (force = false) => {
  if (!force && clearnetBlobCache.set && Date.now() - clearnetBlobCache.ts < CLEARNET_INDEX_TTL_MS) return clearnetBlobCache.set;
  const index = await getClearnetIndex(force);
  const set = new Set();
  const collect = (value) => {
    const text = JSON.stringify(value === undefined ? null : value);
    let decoded = text;
    try { decoded = decodeURIComponent(text); } catch (_) {}
    for (const t of [text, decoded]) for (const m of t.matchAll(CLEARNET_BLOB_RE)) set.add(m[0]);
  };
  for (const entry of index || []) {
    collect(entry.items);
    for (const b of (entry.items && entry.items.blobs) || []) set.add(b);
    try { collect(await about.image(entry.feedId)); } catch (_) {}
  }
  try { collect(await getOpenTribeItems()); } catch (_) {}
  clearnetBlobCache = { ts: Date.now(), set, forcedAt: clearnetBlobCache.forcedAt };
  return set;
};
const clearnetBlobAllowed = async (blobId) => {
  if ((await clearnetBlobSet(false)).has(blobId)) return true;
  if (Date.now() - clearnetBlobCache.forcedAt < 10000) return false;
  clearnetBlobCache.forcedAt = Date.now();
  return (await clearnetBlobSet(true)).has(blobId);
};
let clearnetIdForcedAt = 0;
const clearnetIdFor = async (kind, param) => {
  let raw = String(param || '');
  if (!ssbRef.isMsg(raw)) { try { raw = decodeURIComponent(raw); } catch (_) {} }
  if (!raw || /^[%&@]/.test(raw)) return raw;
  const { clearnetShortId, clearnetSlugFor } = require('../views/main_views');
  const short = raw.split('-').pop().toLowerCase();
  const find = (index) => {
    const all = [];
    for (const entry of index) for (const it of (entry.items[kind] || [])) all.push(it);
    const exact = all.find(it => clearnetSlugFor(it.title, it.id) === raw);
    if (exact) return exact.id;
    const byShort = all.find(it => clearnetShortId(it.id) === short);
    if (byShort) return byShort.id;
    const bySlug = all.find(it => it.slug && it.slug === raw);
    return bySlug ? bySlug.id : null;
  };
  let hit = find(await getClearnetIndex());
  if (!hit && Date.now() - clearnetIdForcedAt >= 10000) {
    clearnetIdForcedAt = Date.now();
    hit = find(await getClearnetIndex(true));
  }
  return hit || raw;
};
const collectClearnetItems = async (feedId, prefs, { max = 5 } = {}) => {
    const MAX_PER_SECTION = max;
  const decisions = await clearnetDecisions();
  const decidedKinds = decisions.kindsByAuthor.get(feedId) || new Set();
  const wants = (kind) => (prefs && prefs[CLEARNET_KIND_PREF[kind]] === true) || decidedKinds.has(kind);
  const publicBlobs = new Set();
  const notePublic = (x) => {
    let text = '';
    try { text = JSON.stringify(x) || ''; } catch (_) {}
    let decoded = text;
    try { decoded = decodeURIComponent(text); } catch (_) {}
    for (const t of [text, decoded]) for (const m of t.matchAll(CLEARNET_BLOB_RE)) publicBlobs.add(m[0]);
  };
  const on = (kind, d = decisions) => (x) => { const ok = clearnetPublicSync(kind, x, feedId, prefs, d); if (ok) notePublic(x); return ok; };
  const items = { shops: [], jobs: [], events: [], projects: [], posts: [], audios: [], videos: [], images: [], documents: [], torrents: [], files: [], podcasts: [], school: [], market: [], feed: [], wiki: [], bookmarks: [], emergencies: [], campaigns: [], housing: [], rooms: [], maps: [], calendars: [] };
  const tagsOf =(x) => (Array.isArray(x && x.tags) ? x.tags : []).map(t => String(t || '').trim()).filter(Boolean).slice(0, 12);
  const dated = (item, ts) => ({ ...item, ts, meta: item.meta || dayOf(ts) });
  const mediaItemMapper = (m, { withImage = false, mediaKind = null } = {}) => dated({
    id: m.key,
    title: m.title || 'Untitled',
    image: withImage ? (m.url || null) : null,
    media: mediaKind && m.url ? { kind: mediaKind, blobId: m.url } : null,
    snippet: m.description || '',
    tags: tagsOf(m)
  }, tsOf(m.createdAt, m.ts));
  if (wants('school')) {
    try {
      const courses = await schoolModel.listCourses('ALL', feedId, {}).catch(() => []);
      items.school = (courses || []).filter(c => c.author === feedId && c.visibility === 'PUBLIC' && !(Number(c.price) > 0)).filter(on('school')).slice(0, MAX_PER_SECTION).map(c => dated({
        id: c.id,
        title: c.title || 'Untitled',
        image: c.image || null,
        snippet: c.description || '',
        tags: tagsOf(c),
        meta: c.startDate ? dayOf(tsOf(c.startDate)) : undefined
      }, tsOf(c.createdAt, c.ts, c.startDate)));
    } catch (_) {}
  }
  if (wants('shops')) {
    try {
      const shops = await shopsModel.listAll({ filter: 'all' }).catch(() => []);
      items.shops = (shops || []).filter(s => s.author === feedId && String(s.visibility || '').toUpperCase() !== 'CLOSED').filter(on('shops')).slice(0, MAX_PER_SECTION).map(s => dated({
        id: s.key,
        title: s.title || 'Untitled',
        image: s.image || null,
        snippet: s.shortDescription || s.description || '',
        tags: tagsOf(s)
      }, tsOf(s.createdAt, s.ts)));
    } catch (_) {}
  }
  if (wants('jobs')) {
    try {
      const jobs = await jobsModel.listJobs('ALL', feedId).catch(() => []);
      items.jobs = (jobs || []).filter(j => j.author === feedId && String(j.status || '').toUpperCase() !== 'CLOSED' && String(j.visibility || 'PUBLIC').toUpperCase() !== 'HIDDEN').filter(on('jobs')).slice(0, MAX_PER_SECTION).map(j => dated({
        id: j.id,
        title: j.title || 'Untitled',
        image: j.image || null,
        snippet: j.description || '',
        details: clearnetDetails('jobs', j),
        tags: tagsOf(j)
      }, tsOf(j.createdAt, j.ts)));
    } catch (_) {}
  }
  if (wants('events')) {
    try {
      const events = await eventsModel.listAll(feedId, 'all').catch(() => []);
      items.events = (events || []).filter(e => e.organizer === feedId && String(e.status || '').toUpperCase() !== 'CLOSED' && e.isPublic !== 'private').filter(on('events', await clearnetDecisionsFor('events', events))).slice(0, MAX_PER_SECTION).map(e => dated({
        id: e.id,
        title: e.title || 'Untitled',
        image: null,
        snippet: e.description || '',
        details: clearnetDetails('events', e),
        tags: tagsOf(e),
        meta: e.date ? dayOf(tsOf(e.date)) : undefined
      }, tsOf(e.createdAt, e.ts, e.date)));
    } catch (_) {}
  }
  if (wants('projects')) {
    try {
      const projects = await projectsModel.listProjects('ALL').catch(() => []);
      items.projects = (projects || []).filter(p => p.author === feedId && String(p.status || '').toUpperCase() !== 'CANCELLED').filter(on('projects', await clearnetDecisionsFor('projects', projects))).slice(0, MAX_PER_SECTION).map(p => dated({
        id: p.id || p.key,
        title: p.title || 'Untitled',
        image: p.image || null,
        snippet: p.description || '',
        details: clearnetDetails('projects', p),
        price: Number(p.goal) > 0 ? `${(Number(p.pledged) || 0).toFixed(2)} / ${Number(p.goal).toFixed(2)}` : null,
        tags: tagsOf(p)
      }, tsOf(p.createdAt, p.ts)));
    } catch (_) {}
  }
  if (wants('posts')) {
    try {
      const ssbX = await cooler.open();
      items.posts = await new Promise((resolve) => {
        try {
          pull(
            ssbX.createUserStream({ id: feedId, reverse: true, limit: 200 }),
            pull.filter(m => m && m.value && m.value.content && m.value.content.type === 'post' && !m.value.content.root),
            pull.collect((err, arr) => {
              if (err || !Array.isArray(arr)) return resolve([]);
              resolve(arr.filter(m => { const ok = on('posts')({ key: m.key, ts: m.value && m.value.timestamp }); if (ok) notePublic(m.value.content); return ok; }).slice(0, MAX_PER_SECTION).map(m => {
                const c = m.value.content;
                const cleanText = String(c.text || '').replace(/<[^>]+>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '');
                const firstLine = cleanText.split('\n').find(l => l.trim()) || '';
                const postTs = tsOf(m.value.timestamp, c.createdAt);
                return dated({
                  id: m.key,
                  title: c.contentWarning || firstLine.slice(0, 80) || 'Blog',
                  image: null,
                  snippet: c.contentWarning ? firstLine.slice(0, 200) : cleanText.slice(0, 200)
                }, postTs);
              }));
            })
          );
        } catch (_) { resolve([]); }
      });
    } catch (_) {}
  }
  if (wants('audios')) {
    try {
      const audios = await audiosModel.listAll('all').catch(() => []);
      items.audios = (audios || []).filter(m => m.author === feedId).filter(on('audios')).slice(0, MAX_PER_SECTION).map(m => mediaItemMapper(m, { mediaKind: 'audio' }));
    } catch (_) {}
  }
  if (wants('videos')) {
    try {
      const videos = await videosModel.listAll('all').catch(() => []);
      items.videos = (videos || []).filter(m => m.author === feedId).filter(on('videos')).slice(0, MAX_PER_SECTION).map(m => mediaItemMapper(m, { mediaKind: 'video' }));
    } catch (_) {}
  }
  if (wants('images')) {
    try {
      const images = await imagesModel.listAll('all').catch(() => []);
      items.images = (images || []).filter(m => m.author === feedId).filter(on('images')).slice(0, MAX_PER_SECTION).map(m => mediaItemMapper(m, { mediaKind: 'image' }));
    } catch (_) {}
  }
  if (wants('documents')) {
    try {
      const documents = await documentsModel.listAll('all').catch(() => []);
      items.documents = await Promise.all((documents || []).filter(m => m.author === feedId).filter(on('documents')).slice(0, MAX_PER_SECTION).map(async (m) => ({ ...mediaItemMapper(m), details: detailsOf(await blobSizeOf(m.url)).map(v => `⇩ ${v}`) })));
    } catch (_) {}
  }
  if (wants('torrents')) {
    try {
      const torrents = await torrentsModel.listAll('all').catch(() => []);
      items.torrents = await Promise.all((torrents || []).filter(m => m.author === feedId && !m.tribeId && !m.encrypted && m.url).filter(on('torrents')).slice(0, MAX_PER_SECTION).map(async (m) => ({ ...mediaItemMapper(m), details: detailsOf(await blobSizeOf(m.url)).map(v => `⇩ ${v}`) })));
    } catch (_) {}
  }
  if (wants('files')) {
    try {
      const files = await filesModel.listAll('all').catch(() => []);
      items.files = await Promise.all((files || []).filter(m => m.author === feedId && !m.tribeId && !m.encrypted && m.url).filter(on('files')).slice(0, MAX_PER_SECTION).map(async (m) => ({ ...mediaItemMapper(m), details: detailsOf(await blobSizeOf(m.url)).map(v => `⇩ ${v}`) })));
    } catch (_) {}
  }
  if (wants('market')) {
    try {
      const marketItems = await marketModel.listAllItems('all').catch(() => []);
      items.market = (marketItems || []).filter(i => (i.seller || i.author) === feedId && String(i.status || '').toUpperCase() === 'FOR SALE' && String(i.visibility || '').toUpperCase() !== 'HIDDEN').filter(on('market')).slice(0, MAX_PER_SECTION).map(i => dated({
        id: i.id || i.key,
        title: i.title || 'Untitled',
        image: i.image || null,
        snippet: i.description || '',
        price: i.price || null,
        details: clearnetDetails('market', i),
        tags: tagsOf(i)
      }, tsOf(i.createdAt, i.ts)));
    } catch (_) {}
  }
  if (wants('feed')) {
    try {
      const feeds = await feedModel.listFeeds('ALL').catch(() => []);
      items.feed = (feeds || []).filter(f => (f.author || (f.value && f.value.author)) === feedId).filter(on('feed', await clearnetDecisionsFor('feed', feeds))).slice(0, MAX_PER_SECTION).map(f => {
        const c = (f.value && f.value.content) || f.content || f;
        const text = String(c.text || '').replace(/<[^>]+>/g, '');
        return dated({
          id: f.key || f.id,
          title: '',
          image: null,
          snippet: text,
          tags: []
        }, tsOf(c.createdAt, f.ts, f.value && f.value.timestamp));
      });
    } catch (_) {}
  }
  if (wants('wiki')) {
    try {
      const pages = await wikiModel.listPages({ filter: 'all' }).catch(() => []);
      items.wiki = (pages || []).filter(w => w.author === feedId && !w.tribeId).filter(on('wiki')).slice(0, MAX_PER_SECTION).map(w => dated({
        id: w.id,
        slug: w.slug || null,
        title: w.title || 'Untitled',
        image: w.image || null,
        snippet: wikiSnippet(w.body, w.image),
        tags: tagsOf(w)
      }, tsOf(w.updatedAt, w.createdAt, w.ts)));
    } catch (_) {}
  }
  if (wants('podcasts')) {
    try {
      const channels = await podcastsModel.listAll({ filter: 'all' }).catch(() => []);
      items.podcasts = (channels || []).filter(c => c.author === feedId && (c.episodeCount || 0) > 0).filter(on('podcasts')).slice(0, MAX_PER_SECTION).map(c => dated({
        id: c.id,
        title: c.title || 'Untitled',
        image: c.cover && c.cover.kind === 'image' ? c.cover.blobId : null,
        media: (() => { const eps = Array.isArray(c.episodes) ? c.episodes : []; const last = eps[eps.length - 1]; return last && last.media && last.media.blobId ? { kind: last.media.kind === 'video' ? 'video' : 'audio', blobId: last.media.blobId } : null; })(),
        snippet: c.description || '',
        details: clearnetDetails('podcasts', c),
        tags: tagsOf(c)
      }, tsOf(c.lastActivityTs, c.createdAt, c.ts)));
    } catch (_) {}
  }
  if (wants('bookmarks')) {
    try {
      const bookmarks = await bookmarksModel.listAll('all').catch(() => []);
      items.bookmarks = (bookmarks || []).filter(b => b.author === feedId && b.url).filter(on('bookmarks')).slice(0, MAX_PER_SECTION).map(b => dated({
        id: b.id,
        title: hostOf(b.url) || 'Bookmark',
        image: null,
        snippet: [b.url, b.description].filter(Boolean).join('\n\n'),
        tags: tagsOf(b)
      }, tsOf(b.createdAt, b.ts)));
    } catch (_) {}
  }
  const withoutBlobLinks = (text) => String(text || '').replace(/!?\[[^\]]*\]\(\s*&[^)\s]+\s*\)/g, '').trim();
  if (wants('emergencies')) {
    try {
      const emergencies = await emergenciesModel.listAll({ filter: 'all' }).catch(() => []);
      items.emergencies = (emergencies || []).filter(e => e.author === feedId && e.status === 'ACTIVE').filter(on('emergencies')).slice(0, MAX_PER_SECTION).map(e => dated({
        id: e.id,
        title: e.title || 'Untitled',
        image: e.media && e.media.kind === 'image' ? e.media.blobId : null,
        snippet: withoutBlobLinks(e.text),
        details: clearnetDetails('emergencies', e),
        tags: tagsOf(e)
      }, tsOf(e.createdAt, e.ts)));
    } catch (_) {}
  }
  if (wants('campaigns')) {
    try {
      const campaigns = await campaignsModel.listAll({ filter: 'all' }).catch(() => []);
      items.campaigns = (campaigns || []).filter(c => c.author === feedId && c.status !== 'CLOSED').filter(on('campaigns')).slice(0, MAX_PER_SECTION).map(c => dated({
        id: c.id,
        title: c.title || 'Untitled',
        image: c.media && c.media.kind === 'image' ? c.media.blobId : null,
        snippet: withoutBlobLinks(c.text),
        details: clearnetDetails('campaigns', c),
        tags: tagsOf(c),
        meta: c.deadline ? dayOf(tsOf(c.deadline)) : undefined
      }, tsOf(c.createdAt, c.ts)));
    } catch (_) {}
  }
  if (wants('housing')) {
    try {
      const listings = await housingModel.listHousing('ALL', feedId, {}).catch(() => []);
      items.housing = (listings || []).filter(h => h.author === feedId && h.status === 'OPEN' && h.visibility === 'PUBLIC').filter(on('housing')).slice(0, MAX_PER_SECTION).map(h => dated({
        id: h.rootId || h.id,
        title: h.title || 'Untitled',
        image: (Array.isArray(h.images) ? h.images : []).find(x => !/\[video:/.test(String(x || ''))) || null,
        snippet: h.description || '',
        price: h.housing_type !== 'couchsurfing' && Number(h.price) > 0 ? Number(h.price).toFixed(2) : null,
        details: clearnetDetails('housing', h),
        tags: tagsOf(h)
      }, tsOf(h.createdAt, h.ts)));
    } catch (_) {}
  }
  if (wants('rooms')) {
    try {
      const rooms = await roomsModel.listAll({ filter: 'all' }).catch(() => []);
      items.rooms = (rooms || []).filter(r => r.author === feedId && CLEARNET_REACH_OK.rooms(r)).filter(on('rooms')).slice(0, MAX_PER_SECTION).map(r => dated({
        id: r.rootId,
        title: r.title || 'Untitled',
        image: null,
        snippet: '',
        details: detailsOf(r.number ? `✆ ${r.number}` : ''),
        tags: []
      }, tsOf(r.createdAt)));
    } catch (_) {}
  }
  if (wants('maps')) {
    try {
      const maps = await mapsModel.listAll({ filter: 'all' }).catch(() => []);
      items.maps = (maps || []).filter(m => m.author === feedId && CLEARNET_REACH_OK.maps(m)).filter(on('maps')).slice(0, MAX_PER_SECTION).map(m => dated({
        id: m.rootId || m.key,
        title: m.title || 'Untitled',
        image: m.image || null,
        snippet: m.description || '',
        details: detailsOf(`📍 ${(Number(m.lat) || 0).toFixed(4)}, ${(Number(m.lng) || 0).toFixed(4)}`),
        tags: tagsOf(m)
      }, tsOf(m.createdAt)));
    } catch (_) {}
  }
  if (wants('calendars')) {
    try {
      const calendars = await calendarsModel.listAll({ filter: 'all' }).catch(() => []);
      items.calendars = (calendars || []).filter(c => c.author === feedId && CLEARNET_REACH_OK.calendars(c)).filter(on('calendars')).slice(0, MAX_PER_SECTION).map(c => dated({
        id: c.rootId,
        title: c.title || 'Untitled',
        image: null,
        snippet: '',
        tags: tagsOf(c),
        meta: c.deadline ? dayOf(tsOf(c.deadline)) : undefined
      }, tsOf(c.createdAt)));
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
  for (const k of Object.keys(items)) for (const it of items[k]) it.author = feedId;
  Object.defineProperty(items, 'blobs', { value: publicBlobs, enumerable: false });
  return items;
};
const QR_ACTION_BASE = 'http://localhost:3000';
const sendFeedQr = async (ctx) => {
  const feedId = decodeURIComponent(ctx.params.feedId || '');
  const reqSize = parseInt(ctx.query.size, 10);
  const width = Number.isFinite(reqSize) ? Math.max(64, Math.min(512, reqSize)) : 240;
  try {
    const QRCode = require('../server/node_modules/qrcode');
    const targetUrl = `${QR_ACTION_BASE}/qr-action/follow/${encodeURIComponent(feedId)}`;
    const buf = await QRCode.toBuffer(targetUrl, { type: 'png', width, margin: 1, errorCorrectionLevel: 'M' });
    ctx.set('Content-Type', 'image/png');
    ctx.set('Cache-Control', 'no-store');
    ctx.body = buf;
  } catch (e) {
    ctx.status = 500;
    ctx.body = '';
  }
  };

const QR_JOIN_MODS = {
  school:    { mod: 'schoolMod',    join: async (code) => { const { courseId } = await schoolModel.joinByInvite(code); return `/school/course/${encodeURIComponent(courseId)}`; } },
  forum:     { mod: 'forumMod',     join: async (code) => { const { forumId } = await forumModel.joinByInvite(code); return `/forum/${encodeURIComponent(forumId)}`; } },
  maps:      { mod: 'mapsMod',      join: async (code) => { const mapId = await mapsModel.joinByInvite(code); return `/maps/${encodeURIComponent(mapId)}`; } },
  events:    { mod: 'eventsMod',    join: async (code) => { const { eventId } = await eventsModel.joinByInvite(code); return `/events/${encodeURIComponent(eventId)}`; } },
  chats:     { mod: 'chatsMod',     join: async (code) => { const chatKey = await chatsModel.joinByInvite(code); return `/chats/${encodeURIComponent(chatKey)}`; } },
  pads:      { mod: 'padsMod',      join: async (code) => { const padId = await padsModel.joinByInvite(code); return `/pads/${encodeURIComponent(padId)}`; } },
  rooms:     { mod: 'roomsMod',     join: async (code) => { const roomId = await roomsModel.joinByInvite(code); return `/rooms/${encodeURIComponent(roomId)}`; } },
  calendars: { mod: 'calendarsMod', join: async (code) => { const calId = await calendarsModel.joinByInvite(code); return `/calendars/${encodeURIComponent(calId)}`; } }
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
  const read = pmModel.readKeys();
  const archived = pmModel.archivedKeys();
  const muted = pmModel.mutedBots(getConfig());
  const unread = filtered.filter(isToUser).filter(m => !read.has(String(m.key)) && !archived.has(String(m.key)));
  const notif = unread.filter(m => { const b = pmModel.botOf(m.value.content); return b && !muted.has(b); });
  const pms = unread.filter(m => !pmModel.botOf(m.value.content));
  sharedState.setInboxPmCount(pms.length);
  sharedState.setInboxNotifCount(notif.length);
  sharedState.setInboxCount(pms.length + notif.length);
};

const refreshMentionsCount = async () => {
  try {
    const all = await mentionsModel.listMentions('ALL');
    sharedState.setMentionsTotal(all.length);
    sharedState.setMentionsCount(mentionsModel.unseenOf(all).length);
  } catch (_) {}
};

const PM_CRYPTER_MAX = longText.TEXT_CAP * 2;

const inboxListTitles = async (messages) => {
  try {
    const ids = Array.from(new Set((messages || []).map(m => m && m.value && m.value.content && m.value.content.list).filter(Boolean).map(String)));
    if (!ids.length) return {};
    const map = await mailingModel.titlesFor(ids);
    return Object.fromEntries(map.entries());
  } catch (_) { return {}; }
};

const buildInboxMessages = async () => {
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
  return messages;
};
const contentFavorites = require("./content_favorites.js");
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
          console.log("");
          console.log(`Another server is already running at ${url}. It might be another copy of Oasis or another program on your computer.`);
          console.log(`You can run Oasis on a different port number: sh oasis.sh --port ${config.port + 1}`);
          console.log(`Or set the default port in ${defaultConfigFile}.`);
          console.log("");
          process.exit(1);
        }
      });
    });
  } else if (err && (err.name === 'OpenError' || (typeof err.message === 'string' && /Resource temporarily unavailable/i.test(err.message) && /\.ssb\/.*LOCK/i.test(err.message)))) {
    console.log("");
    console.log("Another Oasis instance is already running on this machine. Close the other instance (or kill the process) and try again.");
    console.log(`Detail: ${String((err && err.message) || err)}`);
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
const { koaBody: koaBodyLib } = require("../server/node_modules/koa-body");
const normalizeBodyNewlines = (body) => {
  if (!body || typeof body !== 'object') return;
  for (const k of Object.keys(body)) {
    const v = body[k];
    if (typeof v === 'string') { if (v.includes('\r')) body[k] = v.replace(/\r\n?/g, '\n'); }
    else if (Array.isArray(v)) body[k] = v.map(x => typeof x === 'string' ? x.replace(/\r\n?/g, '\n') : x);
  }
};
const koaBody = (opts) => {
  const parse = koaBodyLib(opts);
  return (ctx, next) => parse(ctx, () => { normalizeBodyNewlines(ctx.request.body); return next(); });
};
const longTextBody = koaBody({ formLimit: '2mb', textLimit: '2mb' });
const { nav, ul, li, a, form, button, div, section, h2, p } = require("../server/node_modules/hyperaxe");
const open = require("../server/node_modules/open");
const pull = require("../server/node_modules/pull-stream");
const koaRouter = require("../server/node_modules/@koa/router");
const ssbMentions = require("../server/node_modules/ssb-mentions");
const { isFeed, isMsg, isBlob } = require("../server/node_modules/ssb-ref");
const ssb = require("../client/gui");
const router = new koaRouter();

async function fetchProfileItems(feedId, prefs) {
  const MAX_PER_SECTION = 5;
  const items = { shops: [], jobs: [], events: [], projects: [], posts: [], audios: [], videos: [], images: [], documents: [], torrents: [], files: [], podcasts: [], school: [] };
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
  if (prefs.profileFiles) tasks.push((async () => {
    try {
      const files = await filesModel.listAll('all').catch(() => []);
      items.files = (files || []).filter(m => m.author === feedId && !m.tribeId && !m.encrypted).slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  if (prefs.profileTorrents) tasks.push((async () => {
    try {
      const torrents = await torrentsModel.listAll('all').catch(() => []);
      items.torrents = (torrents || []).filter(m => m.author === feedId && !m.tribeId && !m.encrypted).slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  if (prefs.profilePodcasts) tasks.push((async () => {
    try {
      const channels = await podcastsModel.listAll({ filter: 'all' }).catch(() => []);
      items.podcasts = (channels || []).filter(c => c.author === feedId && (c.episodeCount || 0) > 0).slice(0, MAX_PER_SECTION);
    } catch (_) {}
  })());
  if (prefs.profileSchool) tasks.push((async () => {
    try {
      const courses = await schoolModel.listCourses('ALL', feedId, {}).catch(() => []);
      items.school = (courses || []).filter(c => c.author === feedId && c.visibility === 'PUBLIC').slice(0, MAX_PER_SECTION);
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
const { handleBlobUpload, handleBlobUploads, serveBlob, sendBlobBuffer, contentDisposition, FileTooLargeError } = require('../backend/blobHandler.js');
const { mergeGallery } = require('../models/media_gallery');
const extractBlobId = (md) => md ? (md.match(/\((&[^)]+)\)/)?.[1] ?? null) : null;
const exportmodeModel = require('../models/exportmode_model');
const panicmodeModel = require('../models/panicmode_model');
const cipherModel = require('../models/cipher_model');
const pmPolicy = require('./pm_policy');
const backupModel = require('../models/backup_model')({ cooler });
const blobCacheModel = require('../models/blobcache_model')({ cooler });
const devModel = require('../models/dev_model');
const walletModel = require('../models/wallet_model')
const pmModel = require('../models/pm_model')({ cooler, isPublic: config.public });
const recentBotNotices = new Map();
const BOT_NOTICE_DEDUPE_MS = 60 * 1000;
const notifyBot = async (subject, recipients, text, opts = {}) => {
  const subj = String(subject || '');
  const bot = pmModel.botOf({ subject: subj });
  const me = getViewerId();
  const list = (Array.isArray(recipients) ? recipients : [recipients]).filter(id => typeof id === 'string' && id.startsWith('@'));
  let targets = list.length ? Array.from(new Set(list)) : [me];
  if (bot && pmModel.mutedBots(getConfig()).has(bot)) targets = targets.filter(id => id !== me);
  const now = Date.now();
  for (const [k, ts] of recentBotNotices) if (now - ts > BOT_NOTICE_DEDUPE_MS) recentBotNotices.delete(k);
  targets = targets.filter(id => {
    const k = `${subj}|${id}|${text}`;
    if (recentBotNotices.has(k)) return false;
    recentBotNotices.set(k, now);
    return true;
  });
  if (!targets.length) return null;
  const others = targets.filter(id => id !== me);
  if (!others.length) return pmModel.sendMessage([], subj, text, false, opts.ref || '');
  if (others.length > 6) return pmModel.sendToMany(others, subj, text, false, opts.ref || '');
  return pmModel.sendMessage(others, subj, text, false, opts.ref || '');
};
const subscriptionsModel = require('../models/subscriptions_model')({ cooler });
const mailingModel = require('../models/mailing_model')({ cooler, subscriptionsModel });

const buildMyMailingLists = async () => {
  const me = getViewerId();
  const { i18n } = require('../views/main_views');
  const entries = [{ target: me, scope: 'blogs', label: `${i18n.blogTitle || 'Blogs'}`, owner: me }];
  const seen = new Set([me]);
  try {
    for (const l of await mailingModel.composerEntries()) {
      entries.push({ target: l.target, scope: 'mailing', label: `${i18n.mailingTitle || 'Mailing Lists'}: ${l.title}`, owner: l.owner, count: l.count });
      seen.add(l.target);
    }
  } catch (_) {}
  let courses = [];
  let tribes = [];
  try { courses = await schoolModel.listCourses(); } catch (_) {}
  try { tribes = await tribesModel.listAll(); } catch (_) {}
  for (const c of courses) {
    if (String(c.author) === String(me) && c.title) { entries.push({ target: c.rootId || c.id, scope: 'school', label: `${i18n.schoolTitle || 'School'}: ${c.title}`, owner: c.author }); seen.add(c.rootId || c.id); }
  }
  for (const t of tribes) {
    if (String(t.author) === String(me) && t.title) { entries.push({ target: t.id, scope: 'tribes', label: `${i18n.tribesTitle || 'Tribe'}: ${t.title}`, owner: t.author }); seen.add(t.id); }
  }
  for (const [scopeKey, def] of Object.entries(SPACE_SCOPES)) {
    try {
      const all = await def.list().catch(() => []);
      for (const e of (all || [])) {
        const id = spaceEntityId(e);
        if (!id || seen.has(id) || !e.title) continue;
        if (String(def.owner(e)) === String(me)) { entries.push({ target: id, scope: scopeKey, label: def.label(e, i18n), owner: def.owner(e) }); seen.add(id); }
      }
    } catch (_) {}
  }
  try {
    const subs = await subscriptionsModel.mySubscriptions();
    for (const s of subs) {
      if (seen.has(s.target)) continue;
      seen.add(s.target);
      if (SPACE_SCOPES[s.scope]) {
        if (SPACE_SCOPES[s.scope].broadcast) continue;
        try {
          const e = await findSpaceEntity(s.scope, s.target);
          if (e && e.title) entries.push({ target: s.target, scope: s.scope, label: SPACE_SCOPES[s.scope].label(e, i18n), owner: SPACE_SCOPES[s.scope].owner(e) });
        } catch (_) {}
        continue;
      }
      if (s.scope === 'school') {
        const c = courses.find(x => (x.rootId || x.id) === s.target);
        if (c && c.title) entries.push({ target: s.target, scope: 'school', label: `${i18n.schoolTitle || 'School'}: ${c.title}`, owner: c.author });
      } else if (s.scope === 'tribes') {
        const t = tribes.find(x => x.id === s.target);
        if (t && t.title) entries.push({ target: s.target, scope: 'tribes', label: `${i18n.tribesTitle || 'Tribe'}: ${t.title}`, owner: t.author });
      } else if (s.scope === 'blogs' && ssbRef.isFeedId(s.target)) {
        let name = null;
        try { name = await about.name(s.target); } catch (_) {}
        entries.push({ target: s.target, scope: 'blogs', label: `${i18n.blogTitle || 'Blogs'}: ${name || s.target.slice(0, 10)}`, owner: s.target });
      }
    }
  } catch (_) {}
  try {
    const { counts } = await subscriptionsModel.subscriberCounts(entries.map(e => e.target));
    for (const e of entries) {
      if (e.scope === 'mailing') continue;
      const base = counts.get(e.target) || 0;
      e.count = base + (e.owner ? 1 : 0);
    }
  } catch (_) { for (const e of entries) { if (e.scope !== 'mailing') e.count = e.owner ? 1 : 0; } }
  return entries.filter(e => (e.count || 0) > 1);
};

const subscriptionStateFor = async (target, owner) => {
  try {
    const { counts, mine } = await subscriptionsModel.subscriberCounts([target]);
    return { count: (counts.get(target) || 0) + (owner ? 1 : 0), subscribed: mine.has(target) };
  } catch (_) { return { count: owner ? 1 : 0, subscribed: false }; }
};

const SPACE_SCOPES = {
  forum:    { list: () => forumModel.listAll('all'), owner: (e) => e.author, members: (e) => (Array.isArray(e.participants) ? e.participants : []), label: (e, i18n) => `${i18n.forumTitle || 'Forum'}: ${e.title}` },
  events:   { list: () => eventsModel.listAll(), owner: (e) => e.organizer || e.author, members: (e) => (Array.isArray(e.attendees) ? e.attendees : []), label: (e, i18n) => `${i18n.eventsTitle || 'Event'}: ${e.title}` },
  calendars:{ list: () => calendarsModel.listAll(), owner: (e) => e.author, members: (e) => (Array.isArray(e.participants) ? e.participants : []), label: (e, i18n) => `${i18n.calendarsTitle || 'Calendar'}: ${e.title}` },
  projects: { broadcast: true, list: () => projectsModel.listProjects('ALL'), owner: (e) => e.author, members: () => [], label: (e, i18n) => `${i18n.projectsTitle || 'Project'}: ${e.title}` },
  industry: { list: () => industryModel.listFacilities('ALL'), owner: (e) => e.steward || e.author, members: (e) => (Array.isArray(e.members) ? e.members : []), label: (e, i18n) => `${i18n.industryTitle || 'Industry'}: ${e.title}` },
  pads:     { list: () => padsModel.listAll(), owner: (e) => e.author, members: (e) => (Array.isArray(e.members) ? e.members : []), label: (e, i18n) => `${i18n.padsTitle || 'Pad'}: ${e.title}` },
  shops:    { broadcast: true, list: () => shopsModel.listAll(), owner: (e) => e.author, members: () => [], label: (e, i18n) => `${i18n.shopsTitle || 'Shop'}: ${e.title}` },
  chats:    { list: () => chatsModel.listAll(), owner: (e) => e.author, members: (e) => (Array.isArray(e.members) ? e.members : []), label: (e, i18n) => `${i18n.chatsTitle || 'Chat'}: ${e.title}` },
  wiki:     { broadcast: true, list: () => wikiModel.listPages({ tribeId: 'any' }), owner: (e) => e.author, members: () => [], label: (e, i18n) => `${i18n.wikiTitle || 'Wiki'}: ${e.title}` },
  emergencies:   { broadcast: true, list: () => emergenciesModel.listAll({ filter: 'all' }), owner: (e) => e.author, members: () => [], label: (e, i18n) => `${i18n.emergenciesTitle || 'Emergency'}: ${e.title}` },
  podcasts: { broadcast: true, list: () => podcastsModel.listAll({ filter: 'all' }), owner: (e) => e.author, members: () => [], label: (e, i18n) => `${i18n.podcastsTitle || 'Podcast'}: ${e.title}` },
  campaigns: { broadcast: true, list: () => campaignsModel.listAll({ filter: 'all' }), owner: (e) => e.author, members: () => [], label: (e, i18n) => `${i18n.campaignsTitle || 'Campaign'}: ${e.title}` }
};
const spaceEntityId = (e) => e.rootId || e.id || e.key;

const findSpaceEntity = async (scope, target) => {
  const def = SPACE_SCOPES[scope];
  if (!def) return null;
  const all = await def.list().catch(() => []);
  return (all || []).find(e => spaceEntityId(e) === target) || null;
};

const viewerSharesSpace = (scope, entity, viewer) => {
  const def = SPACE_SCOPES[scope];
  if (!def || !entity) return false;
  return String(def.owner(entity)) === String(viewer) || def.members(entity).includes(viewer);
};

const decorateSubscriptionIn = async (scope, items) => {
  try {
    const def = SPACE_SCOPES[scope];
    if (!def || !Array.isArray(items) || !items.length) return;
    const viewer = getViewerId();
    const { mine } = await subscriptionsModel.subscriberCounts(items.map(spaceEntityId));
    for (const e of items) {
      if (!e) continue;
      const shares = def.broadcast ? true : viewerSharesSpace(scope, e, viewer);
      if (shares) e.subscriptionIn = mine.has(spaceEntityId(e)) || String(def.owner(e)) === String(viewer);
    }
  } catch (_) {}
};

const resolveListSelection = (lists, raw) => {
  const v = String(raw || '').trim();
  if (!v) return null;
  const byTarget = lists.find(l => l.target === v);
  if (byTarget) return byTarget;
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s*\(\d+\)\s*$/, '');
  return lists.find(l => norm(l.label) === norm(v)) || null;
};

const notifyCampaignWatchers = async (rootId, subject) => {
  try {
    const cp = await campaignsModel.getCampaignById(rootId);
    if (!cp) return;
    const actor = getViewerId();
    const base = await listRecipientsFor({ target: cp.id, owner: cp.author });
    const withSigners = subject === 'CAMPAIGN_UPDATED' ? base : Array.from(new Set([...base, ...(cp.signers || [])]));
    const recipients = withSigners.filter(id => String(id) !== String(actor));
    if (!recipients.length) return;
    const link = `[${cp.title || 'a campaign'}](/campaigns/${encodeURIComponent(cp.id)})`;
    const text = subject === 'CAMPAIGN_RAISED'
      ? `${await actorLink(actor)} has raised the campaign ${link} to Parliament: [see the proposal](/parliament?filter=proposals)`
      : `${await actorLink(actor)} has ${subject === 'CAMPAIGN_ACHIEVED' ? 'reached the goal of' : 'posted an update on'} the campaign: ${link}`;
    await notifyBot(subject, recipients, text);
  } catch (_) {}
};

const notifyPodcastWatchers = async (channelId, episode) => {
  try {
    const ch = await podcastsModel.getChannelById(channelId);
    if (!ch || !episode) return;
    const actor = getViewerId();
    const recipients = (await listRecipientsFor({ target: ch.id, owner: ch.author })).filter(id => String(id) !== String(actor));
    if (!recipients.length) return;
    await notifyBot('PODCAST_EPISODE', recipients, `${await actorLink(actor)} has published a new episode of [${ch.title || 'a podcast'}](/podcasts/${encodeURIComponent(ch.id)}): [#${episode.number || ''} ${episode.title || ''}](/podcasts/episode/${encodeURIComponent(episode.id)})`);
  } catch (_) {}
};

const notifyEmergencyWatchers = async (rootId, subject) => {
  try {
    const emergency = await emergenciesModel.getEmergencyById(rootId);
    if (!emergency) return;
    const actor = getViewerId();
    const recipients = (await listRecipientsFor({ target: emergency.id, owner: emergency.author })).filter(id => String(id) !== String(actor));
    if (!recipients.length) return;
    const verb = subject === 'EMERGENCY_RESOLVED' ? 'resolved' : 'posted an update on';
    await notifyBot(subject, recipients, `${await actorLink(actor)} has ${verb} the emergency: [${emergency.title || 'an emergency'}](/emergencies/${encodeURIComponent(emergency.id)})`);
  } catch (_) {}
};

const subscribeOnFirstTouch = async (target, scope) => {
  try {
    if (await subscriptionsModel.myState(target)) return;
    await subscriptionsModel.setSubscription(target, scope, true);
  } catch (_) {}
};

const notifyWikiWatchers = async (rootId, subject, tribeId = null) => {
  try {
    const page = await wikiModel.getPage(rootId, { tribeId });
    if (!page) return;
    const actor = getViewerId();
    const recipients = (await listRecipientsFor({ target: page.id, owner: page.author })).filter(id => String(id) !== String(actor));
    if (!recipients.length) return;
    const href = `/wiki/${encodeURIComponent(page.id)}${page.tribeId ? `?tribeId=${encodeURIComponent(page.tribeId)}` : ''}`;
    const verb = subject === 'WIKI_RESTORED' ? 'restored an earlier version of' : 'edited';
    await notifyBot(subject, recipients, `${await actorLink(actor)} has ${verb} the wiki page: [${page.title || 'a page'}](${href})`);
  } catch (_) {}
};

const notifyRouteBookers = async (rootId, subject) => {
  try {
    const route = await logisticsModel.getRouteById(rootId);
    if (!route) return;
    const actor = getViewerId();
    const active = (route.bookings || []).filter(bk => bk && bk.status !== 'CANCELLED' && bk.status !== 'REJECTED').map(bk => bk.booker);
    const recipients = Array.from(new Set(active)).filter(id => id && String(id) !== String(actor));
    if (!recipients.length) return;
    const verb = subject === 'LOGISTICS_CLOSED' ? 'closed' : 'updated';
    await notifyBot(subject, recipients, `${await actorLink(actor)} has ${verb} the route: [${route.title || 'a route'}](/logistics/${encodeURIComponent(route.id)})`);
  } catch (_) {}
};

const notifyBookingParty = async (info, subject) => {
  try {
    if (!info || !info.routeId) return;
    const route = await logisticsModel.getRouteById(info.routeId);
    if (!route) return;
    const actor = getViewerId();
    const target = subject === 'LOGISTICS_BOOKED' || subject === 'LOGISTICS_CANCELLED' ? info.owner : info.booker;
    if (!target || String(target) === String(actor)) return;
    const verbs = { LOGISTICS_BOOKED: 'booked', LOGISTICS_CANCELLED: 'cancelled a booking on', LOGISTICS_CONFIRMED: 'confirmed your booking on', LOGISTICS_REJECTED: 'rejected your booking on', LOGISTICS_DELIVERED: 'marked as delivered' };
    await notifyBot(subject, [target], `${await actorLink(actor)} has ${verbs[subject] || 'updated'} the route: [${route.title || 'a route'}](/logistics/${encodeURIComponent(route.id)})`);
  } catch (_) {}
};

const listRecipientsFor = async (entry) => {
  const subs = await subscriptionsModel.listSubscribers(entry.target).catch(() => []);
  const all = new Set(subs);
  if (entry.owner) all.add(entry.owner);
  return Array.from(all);
};
const fileshareModel = require('../models/fileshare_model')({ cooler });
const FILESHARE_MAX_SIZE = (getConfig().fileShare && Number(getConfig().fileShare.maxSize)) || (1024 * 1024 * 1024);
const FILESHARE_TTL_MS = (((getConfig().fileShare && Number(getConfig().fileShare.ttlDays)) || 30)) * 24 * 60 * 60 * 1000;
const runFileshareCleanup = async () => {
  try {
    const ssbClient = await cooler.open();
    const me = ssbClient.id;
    const msgs = await pmModel.listAllPrivate();
    const mine = (msgs || [])
      .filter(m => m && m.value && m.value.author === me && m.value.content && m.value.content.fileShare)
      .map(m => ({ pointer: m.value.content.fileShare, sentAt: m.value.content.sentAt }));
    if (mine.length) await fileshareModel.pruneExpired(mine, FILESHARE_TTL_MS, Date.now());
  } catch (_) {}
};
const fsCleanupTimer = setTimeout(() => { runFileshareCleanup(); }, 120000);
if (fsCleanupTimer.unref) fsCleanupTimer.unref();
const fsCleanupInterval = setInterval(() => { runFileshareCleanup(); }, 12 * 60 * 60 * 1000);
if (fsCleanupInterval.unref) fsCleanupInterval.unref();
const runBlobCacheCollect = async () => {
  try {
    const maxBytes = blobCacheModel.maxBytesFor(getConfig(), { isPublic: config.public });
    if (!(maxBytes > 0)) return null;
    const res = await blobCacheModel.collect({ maxBytes });
    if (res.deleted) debug(`[blob-cache] removed ${res.deleted} blobs (${res.freed} bytes)`);
    return res;
  } catch (_) { return null; }
};
const blobCacheTimer = setTimeout(() => { runBlobCacheCollect(); }, 5 * 60 * 1000);
if (blobCacheTimer.unref) blobCacheTimer.unref();
const blobCacheInterval = setInterval(() => { runBlobCacheCollect(); }, 6 * 60 * 60 * 1000);
if (blobCacheInterval.unref) blobCacheInterval.unref();
const SNAPSHOT_RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const buildSnapshotFile = async (name, opts) => {
  const target = stateFilePath(name);
  const tmp = `${target}.tmp`;
  try {
    const res = await backupModel.createSnapshot(tmp, opts);
    fs.renameSync(tmp, target);
    debug(`[snapshot] ${name}: ${res.messages} public messages of ${res.feeds} feeds, ${res.bytes} bytes`);
    return res;
  } catch (e) { try { fs.unlinkSync(tmp); } catch (_) {} debug(`[snapshot] ${name} failed: ${e && e.message ? e.message : e}`); return null; }
};
const runSnapshotBuild = async () => {
  if (!config.public) return null;
  const recent = await buildSnapshotFile('snapshot-recent.oasissn', { sinceMs: SNAPSHOT_RECENT_MS });
  const full = await buildSnapshotFile('snapshot.oasissn', {});
  return { recent, full };
};
const snapshotTimer = setTimeout(() => { runSnapshotBuild(); }, 2 * 60 * 1000);
if (snapshotTimer.unref) snapshotTimer.unref();
const snapshotInterval = setInterval(() => { runSnapshotBuild(); }, 6 * 60 * 60 * 1000);
if (snapshotInterval.unref) snapshotInterval.unref();
const pubAddressFor = (invite) => {
  const m = String(invite || '').trim().match(/^(?:net:)?([^:~\s]+):(\d+)(?::|~shs:)(@?[A-Za-z0-9+/=_-]+(?:\.ed25519)?)~/);
  return m ? msAddrFrom(m[1], m[2], m[3]) : null;
};
const rememberJoinedPub = (invite) => {
  const m = String(invite || '').trim().match(/^(?:net:)?([^:~\s]+):(\d+)(?::|~shs:)(@?[A-Za-z0-9+/=_-]+(?:\.ed25519)?)~/);
  if (!m) return;
  const host = m[1].toLowerCase(), port = Number(m[2]) || 8008, key = canonicalKey(m[3]);
  if (!validPeerHost(host) || !validPeerPort(port) || !ssbRef.isFeed(key)) return;
  const pubs = readJSON(gossipPath);
  if (!pubs.find(x => x && canonicalKey(x.key) === key)) { pubs.push({ host, port, key }); writeJSON(gossipPath, pubs); }
  const unf = readJSON(unfollowedPath);
  if (unf.some(x => x && canonicalKey(x.key) === key)) writeJSON(unfollowedPath, unf.filter(x => !(x && canonicalKey(x.key) === key)));
};
const bootstrapFromPub = (invite) => {
  if (config.public) return null;
  const address = pubAddressFor(invite);
  if (!address) return null;
  const current = backupModel.restoreStatus();
  if (current && current.running) return current;
  const job = backupModel.startBootstrap({ address });
  job.promise.then((res) => { if (res) { try { activityModel.invalidateCache(); } catch (_) {} } });
  return job;
};
const bookmarksModel = require("../models/bookmarking_model")({ cooler, isPublic: config.public });
const opinionsModel = require('../models/opinions_model')({ cooler, isPublic: config.public });
const tasksModel = require('../models/tasks_model')({ cooler, isPublic: config.public, pmModel });
const votesModel = require('../models/votes_model')({ cooler, isPublic: config.public });
const ssbConfig = require('../server/ssb_config');
const tribeCrypto = require('../models/crypto')(ssbConfig.path, 'tribes');
const onboardingModel = require('../models/onboarding_model')({ cooler, ssbPath: ssbConfig.path });
const chatCrypto = require('../models/crypto')(ssbConfig.path, 'chats');
const schoolCrypto = require('../models/crypto')(ssbConfig.path, 'school');
const padCrypto = require('../models/crypto')(ssbConfig.path, 'pads');
const roomCrypto = require('../models/crypto')(ssbConfig.path, 'rooms');
const mapCrypto = require('../models/crypto')(ssbConfig.path, 'maps');
const calendarCrypto = require('../models/crypto')(ssbConfig.path, 'calendars');
const eventCrypto = require('../models/crypto')(ssbConfig.path, 'events');
const forumCrypto = require('../models/crypto')(ssbConfig.path, 'forum');
const tribesModel = require('../models/tribes_model')({ cooler, isPublic: config.public, tribeCrypto });
const eventsModel = require('../models/events_model')({ cooler, isPublic: config.public, tribeCrypto, eventCrypto, tribesModel });
const larpModel = require('../models/larp_model')({ cooler, tribesModel, tribeCrypto });
const blockchainModel = require('../models/blockchain_model')({ cooler, isPublic: config.public, tribeCrypto, tribesModel });
const reportsModel = require('../models/reports_model')({ cooler, isPublic: config.public });
const transfersModel = require('../models/transfers_model')({ cooler, isPublic: config.public });
const calendarsModel = require('../models/calendars_model')({ cooler, pmModel, tribeCrypto, calendarCrypto, tribesModel });
const cvModel = require('../models/cv_model')({ cooler, isPublic: config.public });
const dataModel = require('../models/data_model')({ cooler, favoriteIdsFor: (kind) => contentFavorites.getFavoriteSet(kind) });
const inhabitantsModel = require('../models/inhabitants_model')({ cooler, isPublic: config.public, tribesModel, dataModel });
const feedModel = require('../models/feed_model')({ cooler, isPublic: config.public });
const imagesModel = require("../models/images_model")({ cooler, isPublic: config.public });
const audiosModel = require("../models/audios_model")({ cooler, isPublic: config.public });
const torrentsModel = require("../models/torrents_model")({ cooler, isPublic: config.public, tribeCrypto, tribesModel });
const filesModel = require("../models/files_model")({ cooler, isPublic: config.public, tribeCrypto, tribesModel });
const torrentDownloads = require("../models/torrent_downloads_model")({ cooler });
const seedSpreadContent = (ssb, message) => {
  if (config.public) return;
  try {
    ssb.get(message, (err, v) => {
      const c = !err && v && v.content && typeof v.content === 'object' ? v.content : null;
      if (!c || (c.type !== 'torrent' && c.type !== 'file')) return;
      const original = c.type === 'torrent' ? c.source : c.url;
      const torrentBlob = c.type === 'torrent' ? c.url : c.torrentUrl;
      if (typeof torrentBlob === 'string' && torrentBlob.startsWith('&')) { try { ssb.blobs.want(torrentBlob, () => {}); } catch (_) {} }
      if (typeof original !== 'string' || !original.startsWith('&')) return;
      const name = c.type === 'torrent' ? (c.sourceName || c.title) : (c.fileName || c.title);
      try { torrentDownloads.start({ blobId: original, size: Number(c.size) || 0, name: name || '', torrentKey: c.type === 'torrent' ? message : '' }); } catch (_) {}
    });
  } catch (_) {}
};
const encryptUploadForTribe = async (file, { filename, mime }) => {
  const safeName = String(filename || 'file').replace(/[\[\]\r\n]+/g, ' ').trim().slice(0, 120) || 'file';
  const pointer = await fileshareModel.createShareFromFile({ filepath: file.filepath, filename: safeName, mime: mime || 'application/octet-stream' });
  let ids = [pointer.manifestBlobId];
  try { const manifest = await fileshareModel.openManifest(pointer); ids = ids.concat(manifest.chunks || []); } catch (_) {}
  try { blobCacheModel.pin(ids); } catch (_) {}
  return {
    markdown: `[${safeName}](${pointer.manifestBlobId})`,
    size: Number(pointer.size) || Number(file.size) || 0,
    cipher: { v: 1, key: pointer.key, manifestBlobId: pointer.manifestBlobId, chunkCount: pointer.chunkCount }
  };
};
const sendDecryptedBlob = async (ctx, cipher, filename, mime) => {
  const pointer = { type: 'fileShare', v: Number(cipher.v) || 1, key: cipher.key, manifestBlobId: cipher.manifestBlobId, filename, mime };
  if (!(await fileshareModel.ensureAvailable(pointer))) {
    sendErrorPage(ctx, require('../views/main_views').i18n.torrentFromContentMissing || 'Not available yet', { status: 404 });
    return;
  }
  ctx.type = mime || 'application/octet-stream';
  ctx.set('Content-Disposition', contentDisposition('attachment', filename || 'file'));
  ctx.body = fileshareModel.readShareStream(pointer);
};
const WISH_LEVELS = ['whole', 'mutuals', 'only-lan', 'local'];
const phoneNumbers = require('../models/phone_number');
const PHONE_FILTERS = ['all', 'records', 'missed', 'incoming', 'outgoing', 'create'];
const PHONE_GROUP_MAX = require('../server/phone_module').GROUP_MAX;
const pamPointer = (share) => ({ type: 'fileShare', v: 1, key: share.key, manifestBlobId: share.manifestBlobId, filename: 'pam.wav', mime: 'audio/wav' });
const phoneModel = require('../models/phone_model')({
  cooler, pmModel, nameOf: async (id) => about.name(id), isPublic: config.public,
  encryptFile: (filepath) => encryptUploadForTribe({ filepath, size: fs.statSync(filepath).size }, { filename: 'pam.wav', mime: 'audio/wav' }),
  isAvailable: (share) => fileshareModel.isAvailable(pamPointer(share)),
  prefetch: (share) => fileshareModel.prefetch(pamPointer(share))
});
const { phoneView } = require('../views/phone_view');
const createTorrentForFile = async (ctx, blobMarkdown, { title }) => {
  try {
    const m = String(blobMarkdown || '').match(/\((&[^)\s]+\.sha256)\)/);
    if (!m) return null;
    const generated = await buildTorrentFromBlob(m[1], title, [resolveExternalBaseUrl(ctx), clearnetPublicBase()]);
    return generated ? { torrentUrl: generated.torrentBlobId } : null;
  } catch (_) { return null; }
};
const clearnetPublicBase = () => {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'configs', 'snh-invite-code.json'), 'utf8'));
    const u = String(raw.url || '').replace(/\/+$/, '');
    return /^https?:\/\//i.test(u) ? u : '';
  } catch (_) { return ''; }
};
const buildTorrentFromBlob = async (blobId, name, baseUrls = []) => {
  const bencode = require('../server/node_modules/bencode');
  const nodeCrypto = require('crypto');
  const ssbClient = await cooler.open();
  const has = await new Promise((resolve) => { try { ssbClient.blobs.has(blobId, (err, h) => resolve(!err && !!h)); } catch (_) { resolve(false); } });
  if (!has) { try { ssbClient.blobs.want(blobId, () => {}); } catch (_) {} return null; }
  const buffer = await new Promise((resolve, reject) => pull(ssbClient.blobs.get(blobId), pull.collect((err, chunks) => err ? reject(err) : resolve(Buffer.concat((chunks || []).map(c => Buffer.isBuffer(c) ? c : Buffer.from(c)))))));
  if (!buffer || !buffer.length) return null;
  let ext = '', mime = 'application/octet-stream';
  try { const ft = await FileType.fromBuffer(buffer); if (ft && ft.ext) { ext = ft.ext; mime = ft.mime || mime; } } catch (_) {}
  const base = String(name || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || blobId.slice(1, 12);
  const fileName = ext && !base.toLowerCase().endsWith(`.${ext}`) ? `${base}.${ext}` : base;
  const pieceLength = buffer.length > 512 * 1024 * 1024 ? 2097152 : buffer.length > 64 * 1024 * 1024 ? 1048576 : 262144;
  const pieces = [];
  for (let off = 0; off < buffer.length; off += pieceLength) pieces.push(nodeCrypto.createHash('sha1').update(buffer.subarray(off, off + pieceLength)).digest());
  const metainfo = {
    'created by': `Oasis ${OASIS_VERSION}`,
    'creation date': Math.floor(Date.now() / 1000),
    comment: `Oasis blob ${blobId}`,
    info: { name: fileName, length: buffer.length, 'piece length': pieceLength, pieces: Buffer.concat(pieces) }
  };
  const cnBase = clearnetPublicBase();
  const publicBase = (b) => { try { return !isPrivateHost(new URL(b).hostname); } catch (_) { return false; } };
  const webseeds = Array.from(new Set((baseUrls || []).filter(Boolean).map(b => String(b).replace(/\/+$/, '')).filter(publicBase).map(b => `${b}/${b === cnBase ? 'c/blob' : 'blob'}/${encodeURIComponent(blobId)}`)));
  if (webseeds.length) metainfo['url-list'] = webseeds;
  const torrentBuf = bencode.encode(metainfo);
  const torrentBlobId = await new Promise((resolve, reject) => pull(pull.values([torrentBuf]), ssbClient.blobs.add((err, id) => err ? reject(err) : resolve(id))));
  return { markdown: `[torrent:${fileName}.torrent](${torrentBlobId})`, size: buffer.length, fileName, mime, torrentBlobId };
};
const videosModel = require("../models/videos_model")({ cooler, isPublic: config.public });
const documentsModel = require("../models/documents_model")({ cooler, isPublic: config.public });
const trendingModel = require('../models/trending_model')({ cooler, isPublic: config.public });
const statsModel = require('../models/stats_model')({ cooler, isPublic: config.public, tribeCrypto, tribesModel });
const padsModel = require('../models/pads_model')({ cooler, cipherModel, tribeCrypto, padCrypto, tribesModel });
const roomsModel = require('../models/rooms_model')({ cooler, tribeCrypto, roomCrypto, tribesModel });
const wikiModel = require('../models/wiki_model')({ cooler, tribeCrypto, tribesModel });
const emergenciesModel = require('../models/emergencies_model')({ cooler });
const logisticsModel = require('../models/logistics_model')({ cooler });
const podcastsModel = require('../models/podcasts_model')({ cooler });
const campaignsModel = require('../models/campaigns_model')({ cooler });
const tagsModel = require('../models/tags_model')({ cooler, isPublic: config.public, padsModel, tribesModel });
const tribesContentModel = require('../models/tribes_content_model')({ cooler, isPublic: config.public, tribeCrypto, tribesModel });
const searchModel = require('../models/search_model')({ cooler, isPublic: config.public, padsModel, tribeCrypto, tribesModel });
const industryModel = require("../models/industry_model")({ cooler, isPublic: config.public });
const activityModel = require('../models/activity_model')({ cooler, isPublic: config.public, tribeCrypto, tribesModel, padsModel, industryModel, larpModel });
const pixeliaModel = require('../models/pixelia_model')({ cooler, isPublic: config.public });
const melodyModel = require('../models/melody_model')({ cooler });
const marketModel = require('../models/market_model')({ cooler, isPublic: config.public, tribeCrypto });
const forumModel = require('../models/forum_model')({ cooler, isPublic: config.public, tribeCrypto, forumCrypto });
const blogModel = require('../models/blog_model')({ cooler, isPublic: config.public });
const workflowsModel = require('../models/workflows_model');
const mentionsModel = require('../models/mentions_model')({ cooler });
const jobsModel = require('../models/jobs_model')({ cooler, isPublic: config.public, tribeCrypto });
const housingModel = require('../models/housing_model')({ cooler, tribeCrypto });
const shopsModel = require('../models/shops_model')({ cooler, isPublic: config.public, tribeCrypto });
const chatsModel = require('../models/chats_model')({ cooler, tribeCrypto, chatCrypto, tribesModel });
const pollsModel = require('../models/polls_model')({ cooler, isPublic: config.public, tribeCrypto, chatsModel });
const projectsModel = require("../models/projects_model")({ cooler, isPublic: config.public });
const schoolModel = require('../models/school_model')({ cooler, transfersModel, schoolCrypto, chatsModel });
const agendaModel = require("../models/agenda_model")({ cooler, isPublic: config.public, calendarsModel, eventsModel, tasksModel, marketModel, jobsModel, projectsModel, industryModel, housingModel, schoolModel, campaignsModel, logisticsModel });
const mapsModel = require("../models/maps_model")({ cooler, isPublic: config.public, tribeCrypto, mapCrypto, tribesModel });
const gamesModel = require('../models/games_model')({ cooler });
const notifyUbiPaid = async ({ to, amount, epochId, txid, transferKey }) => {
  const i18nAll = require('../client/assets/translations/i18n');
  const i18nB = { ...i18nAll.en, ...(i18nAll[getConfig().language] || {}) };
  const concept = `UBI - ${epochId}`;
  const links = transferKey
    ? ` → [${concept}](/transfers/${encodeURIComponent(transferKey)}) · [PDF](/transfers/contract/${encodeURIComponent(transferKey)})`
    : ` → ${concept}`;
  await notifyBot('BANKING_UBI_PAID', [to], `${i18nB.bankingBotUbiPaidText}: ${amount} ECO${links}`);
};
const bankingModel = require("../models/banking_model")({ services: { cooler, notifyUbiPaid, transfers: transfersModel }, isPublic: config.public });
const favoritesModel = require("../models/favorites_model")({ services: { cooler }, audiosModel, bookmarksModel, documentsModel, imagesModel, videosModel, mapsModel, padsModel, roomsModel, chatsModel, calendarsModel, torrentsModel, filesModel, marketModel, shopsModel, eventsModel, tasksModel, reportsModel, votesModel, jobsModel, housingModel, projectsModel, transfersModel, forumModel, blogsModel: blogModel, pollsModel, schoolModel, wikiModel, emergenciesModel, mailingModel, logisticsModel, podcastsModel, campaignsModel });
const logsModel = require("../models/logs_model")({ cooler });
const parliamentModel = require('../models/parliament_model')({ cooler, services: { tribes: tribesModel, votes: votesModel, inhabitants: inhabitantsModel, banking: bankingModel } });
const fediverseModel = require('../models/fediverse_model')({ isPublic: config.public });
const { isPrivateHost } = require('../models/fediverse_model');
const viewerFilters = require('../models/viewer_filters');

const scanPendingFollows = async (viewerId) => {
  if (!viewerId) return;
  if (!viewerFilters.isFrictionActive()) return;
  const { readTyped } = require('../models/typed_log');
  const ssbClient = await cooler.open();
  const limit = getConfig().ssbLogStream?.limit || 1000;
  const rows = (await readTyped(ssbClient, ['contact'], { limit })).reverse();
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
  const { div, h2, p, form, button, input, ul, li, span, a, strong } = require('../server/node_modules/hyperaxe');
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
              strong(it.name || it.followerId),
              ' — ',
              span({ class: 'muted' }, it.followerId.slice(0, 14) + '…'),
              ' ',
              form({ method: 'POST', action: '/inhabitants/follow/accept', class: 'inline-form' },
                input({ type: 'hidden', name: 'followerId', value: it.followerId }),
                button({ type: 'submit', class: 'filter-btn' }, i18nLocal.inhabitantsPendingAccept || 'Accept')
              ),
              ' ',
              form({ method: 'POST', action: '/inhabitants/follow/reject', class: 'inline-form' },
                input({ type: 'hidden', name: 'followerId', value: it.followerId }),
                button({ type: 'submit', class: 'filter-btn' }, i18nLocal.inhabitantsPendingReject || 'Reject')
              )
            )
          ))
    )
  );
};

const makeCtxMutualCache = () => {
  const store = require('../models/typed_log').requestScope.getStore();
  const cache = store && store.method === 'GET' ? (store.mutualCache || (store.mutualCache = new Map())) : new Map();
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

const OWN_ITEM_FIELDS = ['author', 'createdBy', 'organizer', 'steward', 'seller', 'from', 'proposer', 'owner', 'feed'];
const isOwnItem = (item, viewer) => {
  if (!item || typeof item !== 'object' || !viewer) return false;
  if (item.value && item.value.author) return item.value.author === viewer;
  const field = OWN_ITEM_FIELDS.find(f => typeof item[f] === 'string' && item[f].startsWith('@'));
  return field ? item[field] === viewer : false;
};
let lanRefreshedAt = 0;
const refreshLanPeers = async (force = false) => {
  if (!force && Date.now() - lanRefreshedAt < 15000) return viewerFilters.lanPeers();
  lanRefreshedAt = Date.now();
  try {
    const ssb = await cooler.open();
    let entries = [];
    try { entries = entries.concat((await ssb.conn.dbPeers()) || []); } catch (_) {}
    try { if (typeof ssb.conn.query === 'function') entries = entries.concat(ssb.conn.query().peersAll() || []); } catch (_) {}
    viewerFilters.rememberLanPeers(viewerFilters.lanKeysFromConn(entries).filter(k => k !== ssb.id));
  } catch (_) {}
  return viewerFilters.lanPeers();
};
const applyWishScope = async (items, opts = {}) => {
  const wish = getConfig().wish;
  return viewerFilters.filterByWish(items, {
    wish,
    viewer: getViewerId(),
    authorOf: extractItemAuthor,
    isOwn: isOwnItem,
    isMutual: wish === 'mutuals' && !opts.skipMutual ? makeCtxMutualCache() : null,
    lan: wish === 'only-lan' ? await refreshLanPeers() : null
  });
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
  const store = require('../models/typed_log').requestScope.getStore();
  const memoKey = `tribeAccess:${userId}`;
  if (store && store[memoKey]) return store[memoKey];
  const pending = (async () => {
    try {
      const all = await tribesModel.listAll();
      const memberOf = new Set();
      const createdBy = new Set();
      const privateNotAccessible = new Set();
      const others = [];
      for (const t of all) {
        const isMember = Array.isArray(t.members) && t.members.includes(userId);
        const isCreator = t.author === userId;
        if (isCreator) { createdBy.add(t.id); memberOf.add(t.id); }
        else if (isMember) memberOf.add(t.id);
        else others.push(t);
      }
      await Promise.all(others.map(async (t) => {
        let ancestryPrivate;
        try { const eff = await tribesModel.getEffectiveStatus(t.id); ancestryPrivate = eff.isPrivate; } catch (e) { ancestryPrivate = !!t.isAnonymous; }
        if (ancestryPrivate) privateNotAccessible.add(t.id);
      }));
      return { memberOf, createdBy, privateNotAccessible };
    } catch (e) {
      return { memberOf: new Set(), createdBy: new Set(), privateNotAccessible: new Set() };
    }
  })();
  if (store) store[memoKey] = pending;
  return pending;
};

const applyListFilters = async (items, ctx, opts = {}) => {
  if (!Array.isArray(items)) return items;
  const viewer = getViewerId();
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
  out = await applyWishScope(out, opts);
  out = await markFavorites(out, ctx);
  const clearnetKind = CLEARNET_PATH_KIND[String((ctx && ctx.path) || '').split('/')[1]];
  if (clearnetKind) await annotateClearnet(clearnetKind, out);
  return out;
};

const applyTextSearch = (items, q, fields) => {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle || !Array.isArray(items)) return items;
  return items.filter(it => fields.some(f => {
    const v = it && it[f];
    if (Array.isArray(v)) return v.some(x => String(x || '').toLowerCase().includes(needle));
    return String(v == null ? '' : v).toLowerCase().includes(needle);
  }));
};

const withFavorite = async (item, kind) => {
  if (!item || typeof item !== 'object') return item;
  try {
    const fav = await contentFavorites.getFavoriteSet(kind);
    return { ...item, isFavorite: fav.has(String(item.rootId || item.id || item.key)) };
  } catch (_) { return item; }
};

const markFavorites = async (items, ctx) => {
  if (!Array.isArray(items) || !items.length || !ctx) return items;
  const kind = String(ctx.path || '').split('/').filter(Boolean)[0];
  if (!kind || !contentModCheck[kind]) return items;
  let fav;
  try { fav = await contentFavorites.getFavoriteSet(kind); } catch (_) { return items; }
  if (!fav || typeof fav.has !== 'function') return items;
  return items.map(it => (it && typeof it === 'object' && it.isFavorite === undefined)
    ? { ...it, isFavorite: fav.has(String(it.rootId || it.id || it.key)) }
    : it);
};

const censusCache = new Map();
const CENSUS_TTL_MS = 30000;
const censusOf = async (key, fn, fresh = false) => {
  const hit = fresh ? null : censusCache.get(key);
  if (hit && Date.now() - hit.at < CENSUS_TTL_MS) return hit.value;
  const value = await fn();
  censusCache.set(key, { at: Date.now(), value });
  return value;
};
const shopModesAvailFor = async (hasPurchases) => {
  const fav = await contentFavorites.getFavoriteSet('shops').catch(() => new Set());
  const me = getViewerId();
  const census = (await censusOf('shops', () => shopsModel.listAll({ filter: 'all', q: '', sort: 'recent', viewerId: me })).catch(() => []))
    .map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
  const hasProducts = (await censusOf('products', () => shopsModel.listAllProducts({ filter: 'all' })).catch(() => [])).length > 0;
  return {
    mine: census.some(x => String(x.author) === String(me)),
    recent: census.length > 0,
    favorites: census.some(x => x.isFavorite),
    top: census.some(x => Object.values(x.opinions || {}).reduce((sum, n) => sum + (Number(n) || 0), 0) > 0),
    products: hasProducts,
    prices: hasProducts,
    purchases: hasPurchases
  };
};

const schoolModesFromCensus = (census, me) => {
  return {
    mine: census.some(c2 => String(c2.author) === String(me)),
    recent: census.length > 0,
    applied: census.some(c2 => Array.isArray(c2.students) && c2.students.includes(me)),
    open: census.some(c2 => String(c2.status || 'ONGOING').toUpperCase() !== 'CLOSED' && c2.visibility !== 'INVITE'),
    favorites: census.some(c2 => c2.isFavorite)
  };
};
const schoolModesAvailFor = async () => {
  const me = getViewerId();
  const fav = await contentFavorites.getFavoriteSet('school').catch(() => new Set());
  const census = (await censusOf('school', () => schoolModel.listCourses('all', me, { q: '', sort: 'recent' })).catch(() => [])).map(c2 => ({ ...c2, isFavorite: fav.has(String(c2.rootId || c2.id)) }));
  return schoolModesFromCensus(census, me);
};
const chatModesFromCensus = (census, me) => {
  return {
    mine: census.some(c => String(c.author) === String(me) || (Array.isArray(c.members) && c.members.includes(me))),
    recent: census.length > 0,
    favorites: census.some(c => c.isFavorite),
    open: census.some(c => String(c.status || 'OPEN').toUpperCase() === 'OPEN'),
    closed: census.some(c => String(c.status || '').toUpperCase() === 'CLOSED')
  };
};
const chatModesAvailFor = async () => {
  const me = getViewerId();
  const fav = await contentFavorites.getFavoriteSet('chats').catch(() => new Set());
  const census = (await censusOf('chats', () => chatsModel.listAll({ filter: 'all', q: '', viewerId: me })).catch(() => [])).filter(x => !x.tribeId).map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
  return chatModesFromCensus(census, me);
};
const padModesFromCensus = (census, me) => {
  return {
    mine: census.some(x => String(x.author) === String(me)),
    recent: census.length > 0,
    open: census.some(x => !x.isClosed && String(x.status || 'OPEN').toUpperCase() === 'OPEN'),
    closed: census.some(x => x.isClosed || String(x.status || '').toUpperCase() === 'CLOSED')
  };
};
const padModesAvailFor = async () => {
  const me = getViewerId();
  const fav = await contentFavorites.getFavoriteSet('pads').catch(() => new Set());
  const census = (await censusOf('pads', () => padsModel.listAll({ filter: 'all', viewerId: me })).catch(() => [])).filter(p2 => !p2.tribeId).map(p2 => ({ ...p2, isFavorite: fav.has(String(p2.rootId)) }));
  return padModesFromCensus(census, me);
};
const ROOM_ERRORS = ['full', 'unreachable', 'busy', 'unavailable', 'refused', 'invalid', 'access', 'closed'];
const roomsCensus = async (fresh = false) => {
  const uid = getViewerId();
  const fav = await contentFavorites.getFavoriteSet('rooms').catch(() => new Set());
  return (await censusOf('rooms', () => roomsModel.listAll({ filter: 'all', viewerId: uid }), fresh).catch(() => [])).filter(r => !r.tribeId).map(r => ({ ...r, isFavorite: fav.has(String(r.rootId)) }));
};
const roomFilterFn = (filter, uid, occupancy) => {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  if (filter === 'mine') return (r) => r.author === uid;
  if (filter === 'recent') return (r) => (Date.parse(r.createdAt || '') || 0) >= dayAgo;
  if (filter === 'live') return (r) => { const o = occupancy.get(r.rootId); return !!(o && o.count > 0); };
  if (filter === 'open') return (r) => r.type === 'OPEN' && !r.isClosed;
  if (filter === 'invite') return (r) => r.type === 'INVITE-ONLY' && !r.isClosed;
  if (filter === 'closed') return (r) => r.isClosed;
  return () => true;
};
const ROOM_RECORDINGS_DIR = path.join(ssbConfig.path, 'oasis', 'rooms');
const roomRecordingFile = (name) => {
  if (!/^[0-9a-f]{16}-\d{10,16}\.wav$/.test(String(name || ''))) return null;
  const file = path.join(ROOM_RECORDINGS_DIR, String(name));
  return fs.existsSync(file) ? file : null;
};
const recordingBelongsToViewer = async (name) => {
  const prefix = String(name || '').slice(0, 16);
  const uid = getViewerId();
  const rooms = await roomsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []);
  const { recordingPrefix } = require('../server/phone_module');
  return rooms.some(r => recordingPrefix(r.rootId) === prefix && (r.author === uid || (Array.isArray(r.members) && r.members.includes(uid)) || !!r.tribeId));
};
const listRoomRecordings = (rootId) => {
  const prefix = require('../server/phone_module').recordingPrefix(rootId) + '-';
  let names = [];
  try { names = fs.readdirSync(ROOM_RECORDINGS_DIR); } catch (_) { return []; }
  return names
    .filter(n => n.startsWith(prefix) && n.endsWith('.wav'))
    .map(n => { let size = 0; try { size = fs.statSync(path.join(ROOM_RECORDINGS_DIR, n)).size; } catch (_) {} return { name: n, size, at: Number(n.slice(prefix.length, -4)) || 0, durationMs: Math.max(0, Math.round((size - 44) / 16)) }; })
    .sort((a, b) => b.at - a.at);
};
const roomAccess = async (room, uid) => {
  if (!room) return 'invalid';
  if (room.tribeId) {
    const t = await tribesModel.getTribeById(room.tribeId).catch(() => null);
    return t && Array.isArray(t.members) && t.members.includes(uid) ? null : 'access';
  }
  if (room.type === 'INVITE-ONLY' && room.author !== uid && !room.members.includes(uid)) return 'access';
  return null;
};
const enterRoom = async (room) => {
  const uid = getViewerId();
  const denied = await roomAccess(room, uid);
  if (denied) return denied;
  if (room.isClosed) return 'closed';
  if (!room.tribeId && room.type === 'OPEN' && room.author !== uid && !room.members.includes(uid)) await roomsModel.addMemberToRoom(room.rootId, uid).catch(() => {});
  await roomsModel.ingestKeys().catch(() => {});
  const current = await roomsModel.liveState().catch(() => null);
  if (current && current.ref === room.rootId) return null;
  if (current && current.ref) await roomsModel.leave().catch(() => {});
  try {
    await roomsModel.join(room);
    return null;
  } catch (err) {
    const code = err && err.message;
    if (code === 'left') return null;
    if ((code === 'unreachable' || code === 'refused') && room.author === uid) {
      try {
        await roomsModel.updateRoomById(room.rootId, { refreshHub: true });
        await roomsModel.join(await roomsModel.getRoomById(room.rootId));
        return null;
      } catch (e2) { return ROOM_ERRORS.includes(e2 && e2.message) ? e2.message : 'unreachable'; }
    }
    return ROOM_ERRORS.includes(code) ? code : 'unreachable';
  }
};
const BANKING_OK = new Set(['added', 'updated', 'deleted', 'claimed_pending', 'refused']);
const bankingResult = (ctx, filter, key) => {
  const k = String(key || '');
  if (BANKING_OK.has(k)) { ctx.redirect(`/banking?filter=${filter}&msg=${encodeURIComponent(k)}`); return; }
  sendErrorPage(ctx, bankingFlashText(k) || k || require('../views/main_views').i18n.actionFailed, { status: 400, to: `/banking?filter=${filter}` });
};
const actionFail = (ctx, to) => sendErrorPage(ctx, require('../views/main_views').i18n.actionFailed, { status: 400, ...(to ? { to } : {}) });
const failWith = (ctx, key, to) => sendErrorPage(ctx, require('../views/main_views').i18n[key] || require('../views/main_views').i18n.actionFailed, { status: 400, ...(to ? { to } : {}) });
const inviteCodeFail = (ctx, err) => {
  const t = require('../views/main_views').i18n;
  sendErrorPage(ctx, /already a member/i.test(String(err && err.message)) ? t.inviteAlreadyMember : t.inviteCodeInvalid, { status: 400 });
};
const roomErrorMessage = (code) => {
  const t = require('../views/main_views').i18n;
  if (code === 'full') return t.roomErrorFull;
  if (code === 'busy') return t.roomErrorBusy;
  if (code === 'unavailable') return t.phoneUnavailable;
  if (code === 'access') return t.roomAccessDenied;
  if (code === 'closed') return t.roomErrorClosed;
  return t.roomErrorUnreachable;
};
const syncRoomBanner = async () => {
  if (config.public) return;
  sharedState.setPhoneRoom(await roomsModel.liveState().catch(() => null));
};
const calModesFromCensus = (census, me) => {
  return {
    mine: census.some(x => String(x.author) === String(me)),
    recent: census.length > 0,
    favorites: census.some(x => x.isFavorite),
    open: census.some(x => !x.isClosed && String(x.status || 'OPEN').toUpperCase() === 'OPEN'),
    closed: census.some(x => x.isClosed || String(x.status || '').toUpperCase() === 'CLOSED')
  };
};
const calModesAvailFor = async () => {
  const me = getViewerId();
  const fav = await contentFavorites.getFavoriteSet('calendars').catch(() => new Set());
  const census = (await censusOf('calendars', () => calendarsModel.listAll({ filter: 'all', viewerId: me })).catch(() => [])).filter(c2 => !c2.tribeId).map(c2 => ({ ...c2, isFavorite: fav.has(String(c2.rootId)) }));
  return calModesFromCensus(census, me);
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
const courtsModel = require('../models/courts_model')({ cooler, services: { votes: votesModel, inhabitants: inhabitantsModel, tribes: tribesModel, banking: bankingModel, parliament: parliamentModel }, tribeCrypto });
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
const commentCountsFor = async (ids) => {
  const want = new Set(ids.filter(Boolean));
  const counts = new Map();
  if (!want.size) return counts;
  try {
    const ssbC = await cooler.open();
    const { readTyped } = require('../models/typed_log');
    const { buildValidatedTombstoneSet } = require('../models/tombstone_validator');
    const msgs = await readTyped(ssbC, ['post', 'tombstone'], { limit: getConfig().ssbLogStream?.limit || 1000 });
    const gone = buildValidatedTombstoneSet(msgs || []);
    for (const m of msgs || []) {
      const c = m && m.value && m.value.content;
      if (!c || c.type !== 'post' || gone.has(m.key) || !want.has(c.root)) continue;
      counts.set(c.root, (counts.get(c.root) || 0) + 1);
    }
  } catch (_) {}
  return counts;
};
const enrichWithComments = async (items, idKey = 'id') => {
  const idOf = (x) => x[idKey] || x.key || x.rootId;
  const counts = await commentCountsFor(items.map(idOf));
  for (const x of items) x.commentCount = counts.get(idOf(x)) || 0;
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
const tribeUpkeepAt = new Map();
const TRIBE_UPKEEP_MS = 20000;
const tribeUpkeep = async (tribeId) => {
  const now = Date.now();
  const global = now - (tribeUpkeepAt.get('*') || 0) >= TRIBE_UPKEEP_MS;
  const local = now - (tribeUpkeepAt.get(tribeId) || 0) >= TRIBE_UPKEEP_MS;
  if (global) {
    tribeUpkeepAt.set('*', now);
    await tribesModel.forceSync().catch(() => {});
    await tribesModel.processIncomingKeys().catch(() => {});
  }
  if (local) {
    tribeUpkeepAt.set(tribeId, now);
    await tribesModel.ensureTribeKeyDistribution(tribeId).catch(() => {});
  }
  if (global) await tribesModel.pruneOrphanKeys().catch(() => {});
};
const resizedImages = new Map();
let resizedImagesBytes = 0;
const RESIZED_IMAGES_MAX_BYTES = 32 * 1024 * 1024;
const pageOf = (ctx, list) => slicePage(Array.isArray(list) ? list : [], new URLSearchParams(ctx.querystring).get('page'), listPerPage(ctx.querystring)).items;
const renderedPage = async (render) => {
  const store = require('../models/typed_log').requestScope.getStore();
  if (!store) { await render(); return []; }
  store.pageItems = null;
  store.dryRun = true;
  try { await render(); } finally { store.dryRun = false; }
  return store.pageItems || [];
};
const withCount = (item, comments) => ({ ...item, commentCount: comments.length });
const resolveMapUrl = async (mapUrl) => {
  if (!mapUrl) return null;
  try {
    const mapKey = decodeURIComponent(String(mapUrl).replace(/^\/maps\//, ''));
    return await mapsModel.getMapById(mapKey, null);
  } catch (_) { return null; }
};

const contentResolvers = {
  images: id => imagesModel.resolveRootId(id),
  audios: id => audiosModel.resolveRootId(id),
  videos: id => videosModel.resolveRootId(id),
  documents: id => documentsModel.resolveRootId(id),
  bookmarks: id => bookmarksModel.resolveRootId(id),
  shops: id => shopsModel.resolveRootId(id),
  shopProducts: id => shopsModel.resolveRootId(id),
  chats: id => chatsModel.resolveRootId(id),
  maps: id => mapsModel.resolveRootId(id),
  pads: id => padsModel.resolveRootId(id),
  rooms: id => roomsModel.resolveRootId(id),
  wiki: id => wikiModel.resolveRootId(id),
  emergencies: id => emergenciesModel.resolveRootId(id),
  mailing: id => mailingModel.resolveRootId(id),
  logistics: id => logisticsModel.resolveRootId(id),
  podcasts: id => podcastsModel.resolveRootId(id),
  campaigns: id => campaignsModel.resolveRootId(id),
  calendars: id => calendarsModel.resolveRootId(id),
  torrents: id => torrentsModel.resolveRootId(id),
  files: id => filesModel.resolveRootId(id),
  events: async id => id,
  blogs: async id => id,
  logs: async id => id,
  polls: async id => pollsModel.resolveRootId(id).catch(() => id),
  forum: async id => id,
  tasks: async id => id,
  reports: async id => id,
  votes: async id => id,
  jobs: async id => jobsModel.resolveRootId(id).catch(() => id),
  housing: async id => housingModel.resolveRootId(id).catch(() => id),
  projects: async id => id,
  transfers: async id => id,
  market: async id => id,
  school: async id => schoolModel.resolveRootId(id).catch(() => id)
};
const contentModCheck = { images: 'imagesMod', audios: 'audiosMod', videos: 'videosMod', documents: 'documentsMod', bookmarks: 'bookmarksMod', market: 'marketMod', jobs: 'jobsMod', projects: 'projectsMod', shops: 'shopsMod', shopProducts: 'shopsMod', chats: 'chatsMod', maps: 'mapsMod', pads: 'padsMod', rooms: 'roomsMod', calendars: 'calendarsMod', wiki: 'wikiMod', emergencies: 'emergenciesMod', mailing: 'mailingMod', logistics: 'logisticsMod', podcasts: 'podcastsMod', campaigns: 'campaignsMod', torrents: 'torrentsMod', files: 'filesMod', events: 'eventsMod', forum: 'forumMod', blogs: 'blogsMod', logs: 'logsMod', polls: 'pollsMod', tasks: 'tasksMod', reports: 'reportsMod', votes: 'votesMod', housing: 'housingMod', transfers: 'transfersMod', school: 'schoolMod' };
const favAction = async (ctx, kind, action) => {
  if (!checkMod(ctx, contentModCheck[kind])) { ctx.redirect('/modules'); return; }
  try {
    const rootId = await contentResolvers[kind](ctx.params.id);
    if (rootId) await contentFavorites[action + 'Favorite'](kind, rootId);
  } catch (_) {}
  const home = kind === 'shopProducts' ? '/shops' : `/${kind}`;
  ctx.redirect(safeReturnTo(ctx, home, [home]));
};
const voteFormError = (ctx, mode, id, err, body = {}) => {
  const t = require('../views/main_views').i18n;
  const message = err && err.code === 'VOTE_LOCKED' ? t.voteLocked : err && err.code === 'VOTE_DEADLINE_MIN'
    ? String(t.voteErrorDeadlineMin || '').replace('{days}', String(votesModel.MIN_VOTE_DAYS))
    : t.voteErrorGeneric;
  sendErrorPage(ctx, message, {
    status: 400,
    exact: true,
    to: mode === 'edit' && id ? `/votes/edit/${encodeURIComponent(id)}` : '/votes?filter=create',
    keep: { question: String(body.question || '').slice(0, 300), deadline: String(body.deadline || '').slice(0, 40), tags: String(body.tags || '').slice(0, 300) }
  });
};

const voteFormState = (ctx) => ({
  minVoteDays: votesModel.MIN_VOTE_DAYS,
  draft: {
    question: typeof ctx.query.question === 'string' ? ctx.query.question : '',
    deadline: typeof ctx.query.deadline === 'string' ? ctx.query.deadline : '',
    tags: typeof ctx.query.tags === 'string' ? ctx.query.tags : ''
  }
});

const notifyHousingRequesters = async (item, reason) => {
  if (!item || String(item.author) !== String(getViewerId())) return;
  const requesters = Array.isArray(item.requests) ? item.requests.filter(id => id && id !== item.author) : [];
  if (!requesters.length) return;
  const label = reason === 'deleted' ? 'has been removed' : 'is no longer available';
  for (const requester of requesters) {
    try {
      await notifyBot('HOUSING_UNAVAILABLE', [requester], `The place [${item.title || 'a place'}](/housing/${encodeURIComponent(item.id)}) you requested ${label}`);
    } catch (_) {}
  }
};

const readInterval = (b) => {
  const single = String((b && b.interval) || '').toLowerCase();
  if (single) {
    return {
      intervalWeekly: single === 'weekly',
      intervalMonthly: single === 'monthly',
      intervalYearly: single === 'yearly'
    };
  }
  return {
    intervalWeekly: [].concat(b.intervalWeekly).includes('1'),
    intervalMonthly: [].concat(b.intervalMonthly).includes('1'),
    intervalYearly: [].concat(b.intervalYearly).includes('1')
  };
};

const readGalleryUpload = async (ctx) => {
  const b = ctx.request.body || {};
  const uploaded = await handleBlobUploads(ctx, 'images');
  const clip = ctx.request.files?.video ? await handleBlobUpload(ctx, 'video') : null;
  const removeIndex = b.removePhoto !== undefined && b.removePhoto !== '' ? parseInt(b.removePhoto, 10) : -1;
  const action = String(b.action || '');
  const keep = [].concat(b.keepImages || []).filter(Boolean);
  return {
    uploaded,
    clip,
    keep,
    removeIndex,
    action,
    isMediaAction: action === 'addPhoto' || action === 'addVideo' || action === 'removeVideo' || removeIndex >= 0
  };
};

const galleryPatch = (media, current) => {
  const patch = {};
  if (media.uploaded.length || media.removeIndex >= 0) patch.images = mergeGallery(current, media.uploaded, media.removeIndex);
  if (media.clip) patch.video = media.clip;
  else if (media.action === 'removeVideo') patch.video = '';
  return patch;
};

const formatFileSize = (n) => {
  const x = Number(n) || 0;
  if (x < 1024) return x + ' B';
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = x / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toFixed(v >= 100 || i === 0 ? 0 : 1) + ' ' + u[i];
};

const pdfImagesFor = async (texts) => {
  const images = {};
  try {
    const ssbClient = await cooler.open();
    const ids = Array.from(new Set(texts.flatMap(t => Array.from(String(t || '').matchAll(/!\[image:[^\]]*\]\((&[^)]+)\)/g)).map(m => m[1]))));
    for (const blobId of ids) {
      const buf = await new Promise((resolve) => {
        ssbClient.blobs.has(blobId, (err, has) => {
          if (err || !has) return resolve(null);
          pull(ssbClient.blobs.get(blobId), pull.collect((e, chunks) => resolve(e ? null : Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c))))));
        });
      });
      if (buf) images[blobId] = buf;
    }
  } catch (_) {}
  return images;
};
const pdfBlob = async (blobId) => {
  try {
    const ssbClient = await cooler.open();
    return await new Promise((resolve) => {
      ssbClient.blobs.has(blobId, (err, has) => {
        if (err || !has) return resolve(null);
        pull(ssbClient.blobs.get(blobId), pull.collect((e, chunks) => resolve(e ? null : Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c))))));
      });
    });
  } catch (_) { return null; }
};

const PDF_KINDS = {
  pads: { mod: 'padsMod', load: async (id, viewerId) => {
    await padsModel.ingestKeys().catch(() => {});
    let pad = await padsModel.getPadById(id);
    if (!pad) return null;
    if (pad.tribeId) {
      const t = await tribesModel.getTribeById(pad.tribeId).catch(() => null);
      if (!t || !t.members.includes(viewerId)) return null;
      await tribesModel.processIncomingKeys().catch(() => {});
      pad = await padsModel.getPadById(id);
      if (!pad) return null;
    } else {
      const members = Array.isArray(pad.members) ? pad.members : [];
      const isOpen = String(pad.status || '').toUpperCase() === 'OPEN';
      if (!isOpen && pad.author !== viewerId && !members.includes(viewerId)) return null;
    }
    const entries = await padsModel.getEntries(pad.rootId);
    const versions = (entries || []).filter(e => e && e.text && String(e.text).trim());
    const last = versions.length ? versions[versions.length - 1] : null;
    return { item: { ...pad, text: last ? last.text : '', versions }, extra: {} };
  } },
  wiki: { mod: 'wikiMod', load: async (id, viewerId) => {
    const page = await wikiModel.getPage(id);
    if (!page) return null;
    if (page.tribeId) { const t = await tribesModel.getTribeById(page.tribeId).catch(() => null); if (!t || !t.members.includes(viewerId)) return null; }
    const images = {};
    try {
      const ssbClient = await cooler.open();
      const ids = Array.from(new Set(Array.from(String(page.body || '').matchAll(/!\[image:[^\]]*\]\((&[^)]+)\)/g)).map(m => m[1])));
      for (const blobId of ids) {
        const buf = await new Promise((resolve) => {
          ssbClient.blobs.has(blobId, (err, has) => {
            if (err || !has) return resolve(null);
            pull(ssbClient.blobs.get(blobId), pull.collect((e, chunks) => resolve(e ? null : Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c))))));
          });
        });
        if (buf) images[blobId] = buf;
      }
    } catch (_) {}
    return { item: page, extra: { images } };
  } },
  emergencies: { mod: 'emergenciesMod', load: async (id) => {
    const item = await emergenciesModel.getEmergencyById(id);
    if (!item) return null;
    const images = {};
    try {
      const ssbClient = await cooler.open();
      const sources = [String(item.text || ''), ...(Array.isArray(item.updates) ? item.updates.map(u => String(u.text || '')) : [])];
      const ids = Array.from(new Set(sources.flatMap(t => Array.from(t.matchAll(/!\[image:[^\]]*\]\((&[^)]+)\)/g)).map(m => m[1]))));
      for (const blobId of ids) {
        const buf = await new Promise((resolve) => {
          ssbClient.blobs.has(blobId, (err, has) => {
            if (err || !has) return resolve(null);
            pull(ssbClient.blobs.get(blobId), pull.collect((e, chunks) => resolve(e ? null : Buffer.concat(chunks.map(c => Buffer.isBuffer(c) ? c : Buffer.from(c))))));
          });
        });
        if (buf) images[blobId] = buf;
      }
    } catch (_) {}
    return { item, extra: { images } };
  } },
  reports: { mod: 'reportsMod', load: async (id) => ({ item: await reportsModel.getReportById(id) }) },
  campaigns: { mod: 'campaignsMod', load: async (id, viewerId) => { const item = await campaignsModel.getCampaignById(id, viewerId); if (!item) return null; return { item, extra: { images: await pdfImagesFor([item.text, ...item.updates.map(u => u.text)]) } }; } },
  logistics: { mod: 'logisticsMod', load: async (id) => { const item = await logisticsModel.getRouteById(id); if (!item) return null; return { item, extra: { images: await pdfImagesFor([item.description]) } }; } },
  mailing: { mod: 'mailingMod', load: async (id) => { const item = await mailingModel.getListById(id); if (!item || !item.isMember) return null; return { item, extra: { images: await pdfImagesFor([item.description]) } }; } },
  votes: { mod: 'votesMod', load: async (id) => ({ item: await votesModel.getVoteById(id) }) },
  events: {
    mod: 'eventsMod',
    load: async (id, viewerId) => {
      const event = await eventsModel.getEventById(id);
      if (!event) return null;
      const attendees = Array.isArray(event.attendees) ? event.attendees : [];
      const isPrivate = String(event.isPublic || '').toUpperCase() === 'PRIVATE';
      if (isPrivate && String(event.organizer) !== String(viewerId) && !attendees.includes(viewerId)) return null;
      return { item: event };
    }
  },
  tasks: {
    mod: 'tasksMod',
    load: async (id, viewerId) => {
      const task = await tasksModel.getTaskById(id);
      if (!task) return null;
      const assignees = Array.isArray(task.assignees) ? task.assignees : [];
      const isPrivate = String(task.isPublic || '').toUpperCase() === 'PRIVATE';
      if (isPrivate && String(task.author) !== String(viewerId) && !assignees.includes(viewerId)) return null;
      return { item: task };
    }
  },
  calendars: {
    mod: 'calendarsMod',
    load: async (id, viewerId) => {
      const cal = await calendarsModel.getCalendarById(id);
      if (!cal) return null;
      if (cal.tribeId) {
        const tribe = await tribesModel.getTribeById(cal.tribeId).catch(() => null);
        if (!tribe || !tribe.members.includes(viewerId)) return null;
      } else {
        const participants = Array.isArray(cal.participants) ? cal.participants : [];
        const isOpen = String(cal.status || '').toUpperCase() === 'OPEN';
        if (!isOpen && cal.author !== viewerId && !participants.includes(viewerId)) return null;
      }
      if (String(cal.status || '').toUpperCase() === 'CLOSED' && cal.author !== viewerId) return null;
      const dates = await calendarsModel.getDatesForCalendar(cal.rootId);
      const notesByDate = {};
      const calNotes = dates.length ? await calendarsModel.getNotesForDate(cal.rootId, null) : [];
      for (const d of dates) notesByDate[d.key] = calNotes.filter(n => n.dateId === d.key);
      return { item: cal, extra: { dates, notesByDate } };
    }
  },
  cv: { mod: null, load: async () => ({ item: await cvModel.getCVByUserId() }) },
  maps: { mod: 'mapsMod', load: async (id, viewerId) => {
    await mapsModel.ingestKeys().catch(() => {});
    const item = await mapsModel.getMapById(id, viewerId);
    if (!item || item.encrypted) return null;
    if (item.tribeId) {
      const t = await tribesModel.getTribeById(item.tribeId).catch(() => null);
      if (!t || !t.members.includes(viewerId)) return null;
    } else {
      const members = Array.isArray(item.members) ? item.members : [];
      const mt = String(item.mapType || '').toUpperCase();
      if (mt !== 'OPEN' && mt !== 'SINGLE' && item.author !== viewerId && !members.includes(viewerId)) return null;
    }
    if (String(item.mapType || '').toUpperCase() === 'CLOSED' && item.author !== viewerId) return null;
    const markers = (Array.isArray(item.markers) ? item.markers : []).filter(mk => mk && !mk.encrypted);
    const names = {};
    for (const fid of new Set([item.author, ...markers.map(mk => mk.author)].filter(Boolean))) {
      try { const nm = await about.name(fid); if (nm && nm !== fid.slice(1, 9)) names[fid] = nm; } catch (_) {}
    }
    const images = {};
    for (const blobId of new Set([item.image, ...markers.map(mk => mk.image)].filter(v => v && String(v).startsWith('&')))) {
      const buf = await pdfBlob(blobId);
      if (buf) images[blobId] = buf;
    }
    return { item: { ...item, markers }, extra: { names, images } };
  } },
  pixelia: { mod: 'pixeliaMod', load: async () => {
    const pixels = await pixeliaModel.listPixels();
    return { item: pixels.length ? { title: 'Pixelia', pixels, width: 50, height: 200 } : null };
  } }
};

const loadPdfDoc = async (ctx, kind, id) => {
  const cfg = PDF_KINDS[kind];
  if (!cfg) return null;
  if (cfg.mod && !checkMod(ctx, cfg.mod)) return null;
  try {
    return await cfg.load(id, getViewerId());
  } catch (_) {
    return null;
  }
};

const sendContentPdf = async (ctx, kind, id) => {
  const doc = await loadPdfDoc(ctx, kind, id);
  if (!doc || !doc.item) { ctx.redirect(`/${kind === 'cv' ? 'cv' : kind}`); return; }
  const pdf = buildContentPdf(kind, doc.item, doc.extra || {}, getViewerId());
  ctx.set('Content-Type', 'application/pdf');
  ctx.set('Content-Disposition', `attachment; filename="${pdfFilename(kind, doc.item)}"`);
  ctx.body = pdf;
};

const fileShareError = (ctx, code) => {
  const t = require('../views/main_views').i18n;
  const message = { recipient: t.pmInvalidRecipients, mutual: t.fileShareMutualError, nofile: t.fileShareNoFile, size: t.fileShareTooLarge, failed: t.fileShareFailed, send: t.fileShareSendError }[code] || t.actionFailed;
  sendErrorPage(ctx, message, { status: 400, to: '/pm' });
};

const sharePdfBuffer = async (ctx, pdf, filename, subject) => {
  let pointer;
  try {
    pointer = await fileshareModel.createShareFromBuffer({ buffer: pdf, filename, mime: 'application/pdf' });
  } catch (_) {
    fileShareError(ctx, 'failed');
    return;
  }
  const subjectText = String(subject || filename).slice(0, 150);
  ctx.body = await pmView('', subjectText, '', false, '', false, null, false, '', {
    recipient: '', subject: subjectText,
    manifestBlobId: pointer.manifestBlobId, keyHex: pointer.key,
    filename: pointer.filename, mime: pointer.mime, size: pointer.size,
    sizeLabel: formatFileSize(pointer.size), crypter: false, sharedKey: ''
  });
};

const sharePdfAsPm = async (ctx, kind, id) => {
  const doc = await loadPdfDoc(ctx, kind, id);
  if (!doc || !doc.item) { ctx.redirect(`/${kind}`); return; }
  const pdf = buildContentPdf(kind, doc.item, doc.extra || {}, null);
  const subject = doc.item.title || doc.item.question || doc.item.name || '';
  await sharePdfBuffer(ctx, pdf, pdfFilename(kind, doc.item), subject);
};

const MODULE_HOME_PATHS = new Set([
  'images', 'audios', 'videos', 'documents', 'bookmarks', 'torrents', 'files', 'maps',
  'events', 'tasks', 'reports', 'votes', 'market', 'jobs', 'housing', 'projects',
  'industry', 'shops', 'transfers', 'pads', 'rooms', 'wiki', 'emergencies', 'mailing', 'logistics', 'podcasts', 'campaigns', 'chats', 'calendars', 'forum',
  'tribes', 'feed', 'logs', 'opinions', 'trending', 'agenda', 'school'
]);

const INDEXING_LAG_BYTES = 1024 * 1024;
const indexingLag = (status) => {
  const since = Number(status && status.sync && status.sync.since) || 0;
  return Object.values((status && status.sync && status.sync.plugins) || {}).reduce((max, offset) => Math.max(max, since - (Number(offset) || 0)), 0);
};
const indexingProgress = (status) => {
  const since = Number(status && status.sync && status.sync.since) || 0;
  const offsets = Object.values((status && status.sync && status.sync.plugins) || {}).map(o => Math.max(0, Number(o) || 0));
  const behind = offsets.filter(o => o < since);
  if (!since || !behind.length) return 1;
  return Math.min(1, Math.max(...behind) / since);
};
const moduleHomeFor = (ctx) => {
  if (!ctx || ctx.method !== 'GET') return null;
  const segment = String(ctx.path || '').split('/').filter(Boolean)[0];
  return segment && MODULE_HOME_PATHS.has(segment) ? `/${segment}` : null;
};

const isMissingContentError = (err) => {
  if (!err) return false;
  if (err.status === 400 || err.status === 404 || err.name === 'BadRequestError') return true;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('failed to decode') ||
    msg.includes('not found') ||
    msg.includes('malformed') ||
    msg.includes('invalid') ||
    msg.includes('cannot be decrypted') ||
    msg.includes('undecodable');
};

const ECO_ADDRESS_RE = /^[A-Za-z0-9]{20,64}$/;
const sharedEcoAddress = async (userId) => {
  try {
    const ubiPubs = await bankingModel.listUbiPubs().catch(() => []);
    const isUbiPub = ubiPubs.some(p => String(p.pubId) === String(userId));
    const prefs = isUbiPub ? null : await about.visibilityPrefs(userId).catch(() => null);
    if (!isUbiPub && (!prefs || prefs.wallet !== true)) return null;
    const address = await bankingModel.getUserAddress(userId).catch(() => null);
    return address && ECO_ADDRESS_RE.test(String(address)) ? String(address) : null;
  } catch (_) { return null; }
};
const redirectToPayment = async (ctx, { sellerId, amount, fallback, transferId = null, concept = '', href = '' }) => {
  try {
    if (!checkMod(ctx, 'walletMod') || !sellerId || !(Number(amount) > 0)) { ctx.redirect(fallback); return; }
    const me = getViewerId();
    if (String(sellerId) === String(me)) { ctx.redirect(fallback); return; }
    const myAddress = await bankingModel.getUserAddress(me).catch(() => null);
    if (!myAddress) { ctx.redirect('/wallet'); return; }
    const sellerAddress = await sharedEcoAddress(sellerId);
    if (!sellerAddress) { ctx.redirect(fallback); return; }
    const q = new URLSearchParams({ to: sellerAddress, amount: Number(amount).toFixed(6) });
    if (transferId) q.set('transfer', transferId);
    else { q.set('payee', sellerId); if (concept) q.set('concept', String(concept).slice(0, 120)); if (href && String(href).startsWith('/')) q.set('ref', href); }
    ctx.redirect(`/wallet/send?${q.toString()}#wallet-send`);
  } catch (_) { ctx.redirect(fallback); }
};
const loadTransferForWallet = async (ctx, transferId) => {
  if (!transferId || !checkMod(ctx, 'transfersMod')) return null;
  try {
    const t = await transfersModel.getTransferById(transferId);
    if (!t || String(t.status || '').toUpperCase() !== 'UNCONFIRMED') return null;
    const me = getViewerId();
    if (String(t.from) !== String(me)) return null;
    const address = await sharedEcoAddress(t.to);
    return { id: t.id || transferId, concept: t.concept || '', amount: t.amount, other: t.to, address };
  } catch (_) { return null; }
};
const loadPaymentRef = async (ctx, { payee, concept, ref, to, tag }) => {
  const payeeId = String(payee || '').trim();
  if (!payeeId || !/^@[A-Za-z0-9+/]+={0,2}\.ed25519$/.test(payeeId) || String(payeeId) === String(getViewerId())) return null;
  const address = await sharedEcoAddress(payeeId);
  if (!address || (to && String(to) !== address)) return null;
  const href = String(ref || '').trim();
  const safeTag = String(tag || '').toUpperCase() === 'UBI' ? 'UBI' : 'WALLET';
  return { payeeId, address, concept: String(concept || '').replace(/[\[\]()]/g, '').trim().slice(0, 120), href: isLocalPath(href) && !/\s/.test(href) ? href : '', tag: safeTag };
};
const isBlankText = (value) => !String(value == null ? '' : value)
  .replace(/<[^>]*>/g, '')
  .replace(/[\u200B-\u200D\uFEFF\u2060\u00A0]/g, '')
  .trim();
const isPastDate = (raw, { dayOnly = false } = {}) => {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return false;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return false;
  if (dayOnly) { const today = new Date(); today.setHours(0, 0, 0, 0); return t < today.getTime(); }
  return t < Date.now() - 60 * 1000;
};
const rejectPastDates = (ctx, fields, fallback) => {
  if (!fields.some(([value, opts]) => isPastDate(value, opts || {}))) return false;
  const { i18n } = require('../views/main_views');
  const message = encodeURIComponent(i18n.dateInPastError || 'The date cannot be in the past');
  let back = fallback;
  try {
    const u = new URL(ctx.request.header.referer || '');
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host === ctx.host) back = u.pathname + u.search;
  } catch (_) {}
  ctx.redirect(`${back}${back.includes('?') ? '&' : '?'}error=${message}`);
  return true;
};
const commentAction = async (ctx, kind, idParam) => {
  const modKey = contentModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  const itemId = ctx.params[idParam];
  let text = stripDangerousTags((ctx.request.body.text || '').trim());
  const rt = safeReturnTo(ctx, `/${kind}/${encodeURIComponent(itemId)}`, [`/${kind}`]);
  const blobMarkdown = await handleBlobUpload(ctx, 'blob');
  if (blobMarkdown) text += blobMarkdown;
  if (isBlankText(text)) { ctx.redirect(rt); return; }
  const keepComment = (e) => keepText(ctx, e, {
    title: require('../views/main_views').i18n.voteNewCommentLabel,
    action: ctx.path,
    enctype: 'multipart/form-data',
    hidden: [{ name: 'returnTo', value: rt }],
    fields: [{ name: 'text', type: 'textarea', label: require('../views/main_views').i18n.voteNewCommentLabel, value: text, maxlength: LONG_TEXT_MAX, required: true }],
    backHref: rt
  });
  if (longText.tooLong(text)) { keepComment(new Error('Text too long')); return; }
  try { await post.publish({ text, root: itemId, dest: itemId }); }
  catch (e) { keepComment(e); return; }
  ctx.redirect(rt);
};
const opinionModels = { images: imagesModel, audios: audiosModel, videos: videosModel, documents: documentsModel, bookmarks: bookmarksModel, torrents: torrentsModel, files: filesModel, podcasts: podcastsModel, campaigns: campaignsModel, logistics: logisticsModel };
const deleteModels = { images: imagesModel, audios: audiosModel, videos: videosModel, documents: documentsModel, bookmarks: bookmarksModel, torrents: torrentsModel, files: filesModel };
const opinionAction = async (ctx, kind, idParam) => {
  const modKey = contentModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  try { await opinionModels[kind].createOpinion(ctx.params[idParam], ctx.params.category); }
  catch (e) { return /already/i.test(String(e && e.message)) ? failWith(ctx, 'opinionAlreadyGiven') : actionFail(ctx); }
  try { activityModel.invalidateCache(); } catch (_) {}
  ctx.redirect(safeReturnTo(ctx, `/${kind}`, [`/${kind}`]));
};
const deleteAction = async (ctx, kind, deleteFn = 'delete' + kind.charAt(0).toUpperCase() + kind.slice(1, -1) + 'ById') => {
  const modKey = contentModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  await deleteModels[kind][deleteFn](ctx.params.id);
  ctx.redirect(safeReturnTo(ctx, `/${kind}?filter=mine`, [`/${kind}`]));
};

const mediaCreateModels = { audios: audiosModel, videos: videosModel };
const formLicense = (b, { keep = false } = {}) => (keep && (!b || b.license === undefined)) ? undefined : require('../views/clearnet_view').normalizeLicense(b && b.license);
const mediaCreateAction = async (ctx, kind) => {
  const modKey = contentModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  const blob = await handleBlobUpload(ctx, kind.slice(0, -1));
  const { tags, title, description, mapUrl } = ctx.request.body;
  const created = await mediaCreateModels[kind][`create${kind.charAt(0).toUpperCase()}${kind.slice(1, -1)}`](blob, stripDangerousTags(tags), stripDangerousTags(title), stripDangerousTags(description), stripDangerousTags(mapUrl || ""), formLicense(ctx.request.body));
  await applyClearnetChoice(ctx, kind, created);
  ctx.redirect(safeReturnTo(ctx, `/${kind}?filter=all`, [`/${kind}`]));
};
const mediaUpdateAction = async (ctx, kind) => {
  const modKey = contentModCheck[kind];
  if (modKey && !checkMod(ctx, modKey)) { ctx.redirect('/modules'); return; }
  const { tags, title, description, mapUrl } = ctx.request.body;
  const singular = kind.slice(0, -1);
  const blob = ctx.request.files?.[singular] ? await handleBlobUpload(ctx, singular) : null;
  await mediaCreateModels[kind][`update${kind.charAt(0).toUpperCase()}${kind.slice(1, -1)}ById`](ctx.params.id, blob, stripDangerousTags(tags), stripDangerousTags(title), stripDangerousTags(description), stripDangerousTags(mapUrl || ""), formLicense(ctx.request.body, { keep: true }));
  await applyClearnetChoice(ctx, kind, ctx.params.id);
  ctx.redirect(safeReturnTo(ctx, `/${kind}?filter=mine`, [`/${kind}`]));
};
const qf = (ctx, def = 'all') => ctx.query.filter || def;
const recentFallback = (ctx, shown, all = 'all') => {
  if (ctx.query.filter || (Array.isArray(shown) ? shown.length : shown)) return false;
  const params = new URLSearchParams(ctx.querystring || '');
  params.set('filter', all);
  ctx.redirect(`${ctx.path}?${params.toString()}`);
  return true;
};
const qp = (ctx, def = 1) => Math.max(1, parseInt(ctx.query.page) || def);
const dedupeLarpHouseTribes = (list) => {
  const arr = Array.isArray(list) ? list : [];
  const earliest = new Map();
  for (const t of arr) {
    const larpTag = (Array.isArray(t.tags) ? t.tags : []).find(x => String(x).startsWith('larp-'));
    if (!larpTag) continue;
    const ts = Number(Date.parse(t.createdAt || '')) || 0;
    const prev = earliest.get(larpTag);
    if (!prev || ts < prev.ts) earliest.set(larpTag, { id: t.id, ts });
  }
  if (!earliest.size) return arr;
  return arr.filter(t => {
    const larpTag = (Array.isArray(t.tags) ? t.tags : []).find(x => String(x).startsWith('larp-'));
    if (!larpTag) return true;
    return earliest.get(larpTag).id === t.id;
  });
};
const nameWarmup = about._startNameWarmup();
const FEED_RE = /^@.+\.ed25519$/;
const AUTHOR_FIELDS = ['author', 'from', 'to', 'organizer', 'proposer', 'seller', 'recipient', 'judgeId', 'accuser', 'respondentId', 'createdBy'];
const warmNames = async (ids) => {
  const uniq = [...new Set((ids || []).filter(v => v && FEED_RE.test(String(v))).map(String))];
  if (!uniq.length) return;
  if (uniq.length > 10 && !config.public && await about.profiles().then(() => true).catch(() => false)) return;
  await Promise.all(uniq.slice(0, 600).map(fid => about.name(fid).catch(() => {})));
};
const collectAuthorIds = (items) => {
  const out = [];
  for (const it of (Array.isArray(items) ? items : [items])) {
    if (!it) continue;
    if (it.author) out.push(it.author);
    const c = it.value?.content || it.content || it;
    if (c && typeof c === 'object') for (const f of AUTHOR_FIELDS) if (c[f]) out.push(c[f]);
  }
  return out;
};
const profileActionsOf = (allActions, feedId) => {
  const own = (allActions || []).filter(a => a && a.author === feedId);
  const roots = new Set();
  for (const a of own) {
    const c = a.content || (a.value && a.value.content) || {};
    for (const k of [c.root, c.fork, ...(Array.isArray(c.branch) ? c.branch : [c.branch])]) if (typeof k === 'string' && k) roots.add(k);
  }
  return roots.size ? own.concat((allActions || []).filter(a => a && a.author !== feedId && roots.has(a.id))) : own;
};
const warmAuthorNames = async (...lists) => {
  try { await warmNames(lists.flatMap(l => collectAuthorIds(l))); } catch (_) {}
};
const OASIS_VERSION = (() => { try { return String(require('../server/package.json').version || ''); } catch (_) { return ''; } })();
const PHONE_ACK_VERSION = '1.2.3';
const versionAtLeast = (v, min) => {
  const parse = (x) => String(x || '').split('.').map(n => parseInt(n, 10) || 0);
  if (!v) return false;
  const a = parse(v), b = parse(min);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
};
const onionPeerKeys = async () => {
  const out = new Set();
  const add = (key) => { const k = peerHealth.canonicalKey(key); if (k) out.add(k); };
  try {
    const ssb = await cooler.open();
    for (const [addr, data] of ((await ssb.conn.dbPeers()) || [])) if (data && /^onion:/.test(String(addr))) add(data.key);
    const pubMsgs = await new Promise((res) => { try { pull(ssb.messagesByType({ type: 'pub' }), pull.collect((e, a) => res(e ? [] : a))); } catch (_) { res([]); } });
    for (const m of pubMsgs) { const ad = m && m.value && m.value.content && m.value.content.address; if (ad && /\.onion$/i.test(String(ad.host || ''))) add(ad.key); }
  } catch (_) {}
  for (const g of readJSON(gossipPath)) if (g && /\.onion$/i.test(String(g.host || ''))) add(g.key);
  return out;
};
const readPeerLastErrors = async () => {
  const ssbErr = await cooler.open().catch(() => null);
  const lastErrors = await new Promise((resolve) => {
    try {
      const fn = ssbErr && ssbErr.networkPause && ssbErr.networkPause.lastErrors;
      if (typeof fn !== 'function') return resolve({});
      const r = fn((err, v) => resolve(err ? {} : (v || {})));
      if (r && typeof r.then === 'function') r.then(v => resolve(v || {}), () => resolve({}));
      else if (r !== undefined) resolve(r || {});
    } catch (_) { resolve({}); }
  });
  if (Object.values(lastErrors).some(e => e && e.reason === 'tor') && await torUsable()) {
    for (const e of Object.values(lastErrors)) if (e && e.reason === 'tor') e.reason = 'timeout';
  }
  return lastErrors;
};
const tombstoneOwnMessage = async (ctx, accepts) => {
  const id = String(ctx.params.id || '');
  if (!/^%[A-Za-z0-9+/]{43}=\.sha256$/.test(id)) { safeRefererRedirect(ctx, '/'); return; }
  const ssb = await cooler.open();
  const msg = await new Promise((res) => ssb.get(id, (e, m) => res(e ? null : m)));
  const c = msg && msg.content;
  if (!msg || msg.author !== ssb.id || !c || typeof c !== 'object' || !accepts(c)) { failWith(ctx, 'actionFailed'); return; }
  try {
    await new Promise((res, rej) => ssb.publish({ type: 'tombstone', target: id, deletedAt: new Date().toISOString(), author: ssb.id }, (e) => e ? rej(e) : res()));
  } catch (_) { actionFail(ctx); return; }
  try { activityModel.invalidateCache(); } catch (_) {}
  safeRefererRedirect(ctx, '/');
};
const suggestionTitle = async (m) => {
  const raw = String((m && m.title) || '').trim();
  if (raw && !/^[%@&][A-Za-z0-9+/]{43}=/.test(raw)) return raw;
  const who = m && m.author ? await about.name(m.author).catch(() => null) : null;
  const name = who && !/^[%@&]?[A-Za-z0-9+/]{20,}/.test(who) ? `@${String(who).replace(/^@/, '')}` : '';
  if (m && m.kind === 'inhabitants') return name || require('../views/main_views').i18n.typeCurriculum || 'CV';
  const t = require('../views/main_views').i18n;
  const ct = String((m && m.ctype) || (m && m.kind) || '');
  const label = t[`type${ct.charAt(0).toUpperCase()}${ct.slice(1)}`] || ct.toUpperCase();
  return name ? `${label} · ${name}` : label;
};
const searchExtras = async (results, ctx = null) => {
  const flat = Object.values(results || {}).flat();
  const keys = (ctx ? pageOf(ctx, flat) : flat).map(m => m && m.key).filter(Boolean);
  return {
    spreadMap: await spreads.forMessages(keys).catch(() => new Map()),
    favIndex: await contentFavorites.getFavoriteIndex().catch(() => new Map())
  };
};
const graphLinks = (graph, keys) => {
  const follows = (a, b) => !!(graph[a] && graph[a][b] >= 0);
  const links = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const ab = follows(keys[i], keys[j]), ba = follows(keys[j], keys[i]);
      if (ab || ba) links.push({ a: keys[i], b: keys[j], mutual: ab && ba });
    }
  }
  return links;
};
const listConnectionPeers = async () => {
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
    const gossipPathLocal = path.join(ssbConfig.path, 'gossip.json');
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
          const m = String(addr).match(/^(?:net|onion):([^:]+):(\d+)/);
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
          const m = String(addr).match(/^(?:net|onion):([^:]+):(\d+)/);
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
            const m = String(addr).match(/^(?:net|onion):([^:]+):(\d+)/);
            if (m) { host = host || m[1]; port = port || Number(m[2]); }
          }
          mergePeer(data.key, { host, port, state: 'staged', source: data.type === 'lan' ? 'lan' : (data.type || 'staged') });
        }
      }
    } catch (_) {}
  } catch (_) {}
  const PEER_IDLE_MAX_MS = 10 * 24 * 60 * 60 * 1000;
  const nowTs = Date.now();
  const deadKeys = await deadPeerKeys();
  const forgottenKeys = forgottenPeerKeys();
  return Array.from(peerMap.values())
    .filter(p => !deadKeys.has(peerHealth.canonicalKey(p.key)) && !forgottenKeys.has(peerHealth.canonicalKey(p.key)))
    .filter(p => {
      const st = String(p.state || '');
      if (st === 'connected' || st === 'connecting' || st === 'staged') return true;
      const sc = Number(p.stateChange) || 0;
      return !sc || (nowTs - sc) < PEER_IDLE_MAX_MS;
    })
    .sort((a, b) => (a.state === 'connected' ? -1 : 1) - (b.state === 'connected' ? -1 : 1));
};
const federationState = async () => {
  const ssb = await cooler.open();
  const myId = ssb.id;
  const listed = new Set((await listConnectionPeers()).map(p => peerHealth.canonicalKey(p.key)));
  const pubIds = [...new Set([...((await phoneModel.refreshPubs(true).catch(() => null)) || [])].map(k => peerHealth.canonicalKey(k)).filter(k => k && k !== myId && listed.has(k)))];
  const pubs = new Set(pubIds);
  const addrs = new Map();
  const addAddr = (key, host, port) => {
    const k = peerHealth.canonicalKey(key);
    if (!k || !pubs.has(k) || !host) return;
    if (!addrs.has(k)) addrs.set(k, new Set());
    addrs.get(k).add(`${host}:${Number(port) || 8008}`);
  };
  const pubMsgs = await new Promise((res) => { try { pull(ssb.messagesByType({ type: 'pub' }), pull.collect((e, a) => res(e ? [] : a))); } catch (_) { res([]); } });
  for (const m of pubMsgs) { const ad = m && m.value && m.value.content && m.value.content.address; if (ad) addAddr(ad.key, ad.host, ad.port); }
  const { dbPeers, failures } = await peerFailures(ssb);
  for (const [addr, data] of dbPeers || []) { const mm = String(addr || '').match(/^(?:net|onion):([^:~]+):(\d+)/); if (data && mm) addAddr(data.key, mm[1], mm[2]); }
  for (const g of readJSON(gossipPath)) if (g) addAddr(g.key, g.host, g.port);
  const live = new Set(Object.keys(ssb.peers || {}).filter(k => Array.isArray(ssb.peers[k]) && ssb.peers[k].length).map(k => peerHealth.canonicalKey(k)));
  const graph = await new Promise((res) => { try { ssb.friends.graph((err, g) => res(err ? {} : (g || {}))); } catch (_) { res({}); } });
  const follows = (a, b) => !!(graph[a] && graph[a][b] >= 0);
  const lastErrors = await readPeerLastErrors();
  const rows = await Promise.all(pubIds.map(async (key) => {
    const where = [...(addrs.get(key) || [])];
    const onion = where.filter(w => /\.onion:/i.test(w)).length;
    const transport = !where.length ? 'unknown' : onion === where.length ? 'tor' : onion ? 'both' : 'clearnet';
    const version = await getOasisVersion(key).catch(() => null);
    const known = version ? true : await feedHasMessages(key);
    const err = lastErrors[key];
    const dead = peerHealth.isDead({ key, failures: failures.get(key) || 0 });
    const state = live.has(key) ? 'connected' : (err || dead) ? 'unreachable' : where.length ? 'available' : 'unknown';
    const inhabitants = Object.entries(graph[key] || {}).filter(([k, v]) => v >= 0 && k !== key && !pubs.has(k)).length;
    const clear = where.find(w => !/\.onion:/i.test(w)) || where[0] || '';
    return { key, name: await about.name(key).catch(() => null), host: clear ? clear.replace(/:\d+$/, '') : '', transport, version, known, state, reason: state === 'unreachable' ? (err ? err.reason : 'silent') : null, inhabitants, following: follows(myId, key) };
  }));
  const links = graphLinks(graph, pubIds);
  for (const r of rows) {
    r.links = links.filter(l => l.a === r.key || l.b === r.key).length;
    r.isolated = r.known && r.links === 0;
  }
  return { myId, myName: await about.name(myId).catch(() => null), rows, links, ownVersion: OASIS_VERSION };
};
const feedHasMessages = async (feedId) => {
  if (!feedId) return false;
  try {
    const ssb = await cooler.open();
    return await new Promise((res) => pull(
      ssb.createUserStream({ id: feedId, reverse: true, limit: 1 }),
      pull.collect((e, a) => res(!e && Array.isArray(a) && a.length > 0))
    ));
  } catch (_) { return false; }
};
let oasisVersionsAt = 0;
let oasisVersionsPending = null;
const OASIS_VERSIONS_TTL_MS = 10000;
const oasisVersions = () => {
  if (oasisVersionsPending && Date.now() - oasisVersionsAt < OASIS_VERSIONS_TTL_MS) return oasisVersionsPending;
  oasisVersionsAt = Date.now();
  oasisVersionsPending = (async () => {
    const ssb = await cooler.open();
    const out = new Map();
    await new Promise((res) => pull(
      ssb.messagesByType({ type: 'oasisVersion', reverse: true }),
      pull.drain((m) => {
        const v = m && m.value;
        if (!v || !v.author || out.has(v.author) || !v.content || typeof v.content !== 'object') return;
        out.set(v.author, v.content.version || null);
      }, () => res())
    ));
    return out;
  })().catch(() => { oasisVersionsAt = 0; return new Map(); });
  return oasisVersionsPending;
};
const getOasisVersion = async (feedId) => {
  if (!feedId) return null;
  try { return (await oasisVersions()).get(feedId) || null; } catch (_) { return null; }
};
let oasisVersionAnnounced = false;
const announceOasisVersion = async () => {
  if (oasisVersionAnnounced || !OASIS_VERSION) return;
  try {
    const ssb = await cooler.open();
    const latestSeq = await new Promise((res) => pull(
      ssb.createUserStream({ id: ssb.id, reverse: true, limit: 1 }),
      pull.collect((e, a) => res(e || !a || !a.length ? 0 : (a[0].value && a[0].value.sequence) || 0))
    ));
    if (!latestSeq) return;
    oasisVersionAnnounced = true;
    const mine = await getOasisVersion(ssb.id);
    if (mine !== OASIS_VERSION) {
      ssb.publish({ type: 'oasisVersion', version: OASIS_VERSION, updatedAt: new Date().toISOString() }, () => {});
    }
  } catch (_) {}
};
announceOasisVersion();
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
      return `<a class="post-pdf" href="/blob/${encodeURIComponent(id)}" target="_blank" rel="noopener noreferrer">${escHtml(label)}</a>`;
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
const maxSize = 75 * megabyte;
const collectFediverseMedia = async (ctx) => {
  const files = ctx.request.files && ctx.request.files.media;
  if (!files) return [];
  const arr = Array.isArray(files) ? files : [files];
  const out = [];
  for (const f of arr.slice(0, 4)) {
    if (!f || !f.filepath || !Number(f.size || 0)) continue;
    const m = await fediverseModel.uploadMedia(f).catch(() => null);
    if (m && m.id) out.push(m);
  }
  return out;
};
const TG_KNOWN_ERRORS = new Set(['telegramErrConnect', 'telegramErrTimeout', 'telegramErrAuth', 'telegramErrFetch', 'telegramErrSend', 'telegramErrMissing', 'telegramErrCode', 'telegramErrCodeExpired', 'telegramErrPassword', 'telegramErrPhone', 'telegramErrApi', 'telegramErrFlood', 'telegramErrNoLogin', 'fediverseErrPublic', 'fediverseErrEmpty']);
const fediverseFail = (ctx, codeOrText, to) => {
  const t = require('../views/main_views').i18n;
  const key = String(codeOrText || '');
  sendErrorPage(ctx, (key && typeof t[key] === 'string' ? t[key] : key) || t.actionFailed, { status: 400, to });
};
const tgErrorCode = (err) => {
  const m = String((err && err.message) || '');
  return TG_KNOWN_ERRORS.has(m) ? m : 'telegramErrConnect';
};
const fediverseReturnTo = (ctx, fallback) => {
  const rt = ctx.request.body && ctx.request.body.returnTo;
  return typeof rt === 'string' && rt.startsWith('/fediverse') ? rt : fallback;
};
const blobsPath = path.join(ssbConfig.path, 'blobs', 'tmp');
const FEDIVERSE_TMP_PREFIX = 'fediverse-';
const FEDIVERSE_MIME_BY_EXT = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', avif:'image/avif', mp4:'video/mp4', m4v:'video/mp4', webm:'video/webm', mov:'video/quicktime', ogg:'audio/ogg', mp3:'audio/mpeg', wav:'audio/wav' };
const fediverseExtFromName = (n) => { const m = String(n || '').match(/\.([a-zA-Z0-9]+)$/); return m ? m[1].toLowerCase() : ''; };
const fediverseMimeFromExt = (ext) => FEDIVERSE_MIME_BY_EXT[ext] || 'application/octet-stream';
const isFediverseTmpName = (n) => typeof n === 'string' && /^fediverse-[0-9]+-[0-9]+\.[a-zA-Z0-9]+$/.test(n);
const fediverseTmpType = (name) => {
  const mime = fediverseMimeFromExt(fediverseExtFromName(name));
  return /^video\//.test(mime) ? 'video' : /^audio\//.test(mime) ? 'audio' : 'image';
};
const sweepFediverseTmp = () => {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(blobsPath)) {
      if (!f.startsWith(FEDIVERSE_TMP_PREFIX)) continue;
      const full = path.join(blobsPath, f);
      try { if (now - fs.statSync(full).mtimeMs > 30 * 60 * 1000) fs.unlinkSync(full); } catch (_) {}
    }
  } catch (_) {}
};
const saveFediverseTempMedia = (ctx) => {
  const files = ctx.request.files && ctx.request.files.media;
  if (!files) return [];
  const arr = Array.isArray(files) ? files : [files];
  try { fs.mkdirSync(blobsPath, { recursive: true }); } catch (_) {}
  const out = [];
  let i = 0;
  for (const f of arr.slice(0, 4)) {
    if (!f || !f.filepath || !Number(f.size || 0)) continue;
    const ext = fediverseExtFromName(f.originalFilename) || fediverseExtFromName(f.filepath) || 'bin';
    const name = `${FEDIVERSE_TMP_PREFIX}${Date.now()}-${i++}.${ext}`;
    try {
      fs.copyFileSync(f.filepath, path.join(blobsPath, name));
      out.push({ name, type: /^video|^audio/.test(fediverseMimeFromExt(ext)) ? fediverseMimeFromExt(ext).split('/')[0] : 'image' });
    } catch (_) {}
  }
  return out;
};
const publishFediverseTempMedia = async (names) => {
  const list = Array.isArray(names) ? names : (names ? [names] : []);
  const ids = [];
  for (const name of list.slice(0, 4)) {
    if (!isFediverseTmpName(name)) continue;
    const full = path.join(blobsPath, name);
    if (!fs.existsSync(full)) continue;
    const ext = fediverseExtFromName(name);
    const m = await fediverseModel.uploadMedia({ filepath: full, mimetype: fediverseMimeFromExt(ext), originalFilename: name, size: 1 }).catch(() => null);
    if (m && m.id) ids.push(m.id);
    try { fs.unlinkSync(full); } catch (_) {}
  }
  return ids;
};
const gossipPath = path.join(ssbConfig.path, 'gossip.json');
const unfollowedPath = stateFilePath('gossip_unfollowed.json');
const ensureJSONFile = (p, init = []) => { fs.mkdirSync(path.dirname(p), { recursive: true }); if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(init, null, 2), 'utf8'); };
const readJSON = p => { ensureJSONFile(p, []); try { return JSON.parse(fs.readFileSync(p, 'utf8') || '[]'); } catch { return []; } };
const writeJSON = (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8'); };
const canonicalKey = k => { let c = String(k).replace(/^@/, '').replace(/\.ed25519$/, '').replace(/-/g, '+').replace(/_/g, '/'); if (!c.endsWith('=')) c += '='; return `@${c}.ed25519`; };
const torAvailable = () => Promise.all([9050, 9150].map(port => new Promise((resolve) => {
  const sock = require('net').connect({ host: '127.0.0.1', port }, () => { sock.destroy(); resolve(true); });
  sock.on('error', () => resolve(false));
  sock.setTimeout(800, () => { sock.destroy(); resolve(false); });
}))).then(r => r.some(Boolean));
const torUsable = async () => {
  const onion = (((ssbConfig.connections || {}).outgoing || {}).onion);
  return Array.isArray(onion) && onion.length > 0 && await torAvailable();
};
const msAddrFrom = (h, p, k) => `${/\.onion$/i.test(String(h)) ? 'onion' : 'net'}:${h}:${Number(p) || 8008}~shs:${canonicalKey(k).slice(1, -8)}`;
const peerHealth = require('../models/peer_health');
const peerFailures = async (ssb) => {
  let dbPeers = [];
  try { dbPeers = (await ssb.conn.dbPeers()) || []; } catch (_) {}
  return { dbPeers, failures: peerHealth.failuresByKey(readJSON(gossipPath), dbPeers) };
};
const deadPeerKeys = async () => {
  try {
    const ssb = await cooler.open();
    const { failures } = await peerFailures(ssb);
    return new Set([...failures].filter(([k, f]) => peerHealth.isDead({ key: k, failures: f })).map(([k]) => k));
  } catch (_) { return new Set(); }
};
const mastodonHandle = () => {
  const acc = fediverseModel.getAccount();
  const host = acc ? String(acc.instance || '').replace(/^https?:\/\//, '') : '';
  return acc && acc.acct && host ? `${acc.acct}@${host}` : '';
};
const desiredPhoneVisibility = () => {
  const cfg = getConfig();
  if (config.public || (cfg.modules || {}).phoneMod === 'off') return 'off';
  return (cfg.phone || {}).visibility === 'whole' ? 'whole' : 'mutuals';
};
const syncPhoneVisibility = async () => {
  const want = desiredPhoneVisibility();
  const wantDnd = !!(getConfig().phone || {}).dnd;
  const ssb = await cooler.open();
  const current = (await about.visibilityPrefs(ssb.id).catch(() => null)) || {};
  if ((current.phone || 'whole') === want && !!current.phoneDnd === wantDnd) return;
  await new Promise((resolve, reject) => ssb.publish({ type: 'about', about: ssb.id, visibilityPrefs: { ...current, phone: want, phoneDnd: wantDnd } }, (err) => err ? reject(err) : resolve()));
};
const phoneRefuses = async (id) => {
  const prefs = (await about.visibilityPrefs(id).catch(() => null)) || {};
  return prefs.phone === 'off' || prefs.phoneDnd === true;
};
const setNetworkPaused = async (paused) => {
  const cfg = getConfig();
  cfg.networkPaused = !!paused;
  saveConfig(cfg);
  try {
    const ssb = await cooler.open();
    if (ssb.networkPause) { if (paused) ssb.networkPause.pause(); else ssb.networkPause.resume(); }
  } catch (_) {}
  if (paused) { try { await fediverseModel.telegram.goOffline(); } catch (_) {} }
};
const refreshPeerHealth = async () => {
  if (getConfig().networkPaused === true || process.env.OASIS_NETWORK_PAUSED === '1') return;
  const ssb = await cooler.open();
  const live = (ssb.peers && typeof ssb.peers === 'object') ? ssb.peers : {};
  const connected = Object.keys(live).filter(k => Array.isArray(live[k]) && live[k].length > 0);
  const { failures } = await peerFailures(ssb);
  peerHealth.observe({ connected, failing: [...failures].filter(([, f]) => f > 0).map(([k]) => k) });
};
const forgottenPeerKeys = () => new Set(readJSON(unfollowedPath).map(u => u && peerHealth.canonicalKey(u.key)).filter(Boolean));
const forgetPeers = async (keys) => {
  const drop = new Set([...(keys || [])].map(k => peerHealth.canonicalKey(k)).filter(Boolean));
  if (!drop.size) return 0;
  const ssb = await cooler.open();
  const { dbPeers } = await peerFailures(ssb);
  const known = new Map();
  for (const p of readJSON(gossipPath)) {
    const id = p && peerHealth.canonicalKey(p.key);
    if (id && drop.has(id)) known.set(id, { host: p.host, port: Number(p.port) || 8008, key: id });
  }
  for (const [addr, data] of dbPeers) {
    const id = data && peerHealth.canonicalKey(data.key);
    if (!id || !drop.has(id)) continue;
    if (!known.has(id)) {
      const m = String(addr).match(/^(?:net|onion):([^:]+):(\d+)/);
      if (m) known.set(id, { host: m[1], port: Number(m[2]), key: id });
    }
    try { ssb.conn.forget(addr); } catch (_) {}
  }
  const unf = readJSON(unfollowedPath);
  for (const entry of known.values()) {
    if (!unf.find(u => u && peerHealth.canonicalKey(u.key) === entry.key)) unf.push(entry);
  }
  writeJSON(unfollowedPath, unf);
  writeJSON(gossipPath, readJSON(gossipPath).filter(p => !(p && drop.has(peerHealth.canonicalKey(p.key)))));
  return drop.size;
};
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
const koaBodyFileshare = koaBody({
  multipart: true,
  formidable: {
    uploadDir: blobsPath,
    keepExtensions: true,
    maxFieldsSize: maxSize,
    maxFileSize: FILESHARE_MAX_SIZE,
    hash: false,
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
const { clearnetHubView, authorView, previewCommentView, commentView, editProfileView, likesView, supportersView, threadView, privateView, previewSubtopicView, subtopicView, imageSearchView, setLanguage, tribeAccessDeniedView, inviteRequiredView, clearnetInhabitantView, clearnetBlogView, listPerPage, slicePage } = require("../views/main_views");
const { activityView } = require("../views/activity_view");
const { cvView, createCVView } = require("../views/cv_view");
const { indexingView } = require("../views/indexing_view");
const { pixeliaView } = require("../views/pixelia_view");
const { melodyView } = require("../views/melody_view");
const { gamesView } = require("../views/games_view");
const { schoolView, singleCourseView } = require("../views/school_view");
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
const { filesView, singleFileView } = require("../views/files_view");
const { eventView, singleEventView, clearnetEventView, renderEventInvitePage } = require("../views/event_view");
const { invitesView } = require("../views/invites_view");
const { modulesView } = require("../views/modules_view");
const { reportView, singleReportView } = require("../views/report_view");
const { taskView, singleTaskView } = require("../views/task_view");
const { voteView } = require("../views/vote_view");
const { bookmarkView, singleBookmarkView } = require("../views/bookmark_view");
const { feedView, feedCreateView, singleFeedView } = require("../views/feed_view");
const { backupView } = require("../views/backup_view");
const { devTreeView, devFileView, devSearchView, devMapView } = require("../views/dev_view");
const { welcomeView } = require("../views/welcome_view");
const { opinionsView } = require("../views/opinions_view");
const { peersView } = require("../views/peers_view");
const { graphosView, graphosFederationView } = require("../views/graphos_view");
const { larpListView, larpHouseView, larpTestView, larpTestResultView } = require("../views/larp_view");
const { searchView } = require("../views/search_view");
const { transferView, singleTransferView } = require("../views/transfer_view");
const { cipherView } = require("../views/cipher_view");
const { imageView, singleImageView } = require("../views/image_view");
const { mapsView, singleMapView , renderMapInvitePage, clearnetMapView } = require("../views/maps_view");
const { settingsView } = require("../views/settings_view");
const { fediverseView, fediverseThreadView, fediverseOverviewView, fediversePreviewView, telegramDialogsView, telegramChatView, peertubeFeedView, peertubeVideoView, peertubeUploadView } = require("../views/fediverse_view");
const { trendingView } = require("../views/trending_view");
const { marketView, singleMarketView } = require("../views/market_view");
const { aiView } = require("../views/AI_view");
const { forumView, singleForumView, renderForumInvitePage } = require("../views/forum_view");
const { blogView, singleBlogView } = require("../views/blog_view");
const { dataView } = require("../views/data_view");
const { pollsView, singlePollView } = require("../views/polls_view");
const { mentionsView } = require("../views/mentions_view");
const { renderBlockchainView, renderSingleBlockView } = require("../views/blockchain_view");
const { jobsView, singleJobsView, renderJobForm, clearnetJobView } = require("../views/jobs_view");
const { housingView, singleHousingView, clearnetHousingView } = require("../views/housing_view");
const { shopsView, singleShopView, singleProductView, editProductView, shopOrdersView, myPurchasesView, clearnetShopView, renderShopInvitePage } = require("../views/shops_view");
const { chatsView, singleChatView, renderChatInvitePage } = require("../views/chats_view");
const { padsView, singlePadView, renderPadInvitePage } = require("../views/pads_view");
const { roomsView, singleRoomView, renderRoomInvitePage, roomModesFromCensus, clearnetRoomView } = require("../views/rooms_view");
const { wikiView, wikiPageView, wikiHistoryView, wikiChangesView } = require('../views/wiki_view');
const { emergenciesView, singleEmergencyView, clearnetEmergencyView } = require('../views/emergencies_view');
const { mailingView, singleMailingView } = require('../views/mailing_view');
const { logisticsView, singleLogisticsView } = require('../views/logistics_view');
const { podcastsView, singleChannelView, singleEpisodeView } = require('../views/podcasts_view');
const { campaignsView, singleCampaignView, clearnetCampaignView } = require('../views/campaigns_view');
const { calendarsView, singleCalendarView, renderCalendarInvitePage, clearnetCalendarView } = require("../views/calendars_view");
const { projectsView, singleProjectView, clearnetProjectView } = require("../views/projects_view")
const { industryView, singleFacilityView, singleBuildView, singleBlueprintView, blueprintEditView, buildEditView } = require("../views/industry_view")
const { renderBankingView, renderSingleAllocationView, renderEpochView, bankingFlashText } = require("../views/banking_views")
const { favoritesView } = require("../views/favorites_view");
const { logsView } = require("../views/logs_view");
const { buildLogsPdf, buildSmartContractPdf, buildCertificatePdf, buildContentPdf, pdfFilename } = require("./pdf");
const { parliamentView } = require("../views/parliament_view");
const { courtsView, courtsCaseView } = require('../views/courts_view');
let sharpLib;
const getSharp = () => {
  if (sharpLib === undefined) {
    try { sharpLib = require('../server/node_modules/sharp'); } catch (_) { sharpLib = null; }
  }
  return sharpLib;
};
const readmePath = path.join(__dirname, "..", ".." ,"README.md");
const packagePath = path.join(__dirname, "..", "server", "package.json");
const readme = fs.readFileSync(readmePath, "utf8");
const version = JSON.parse(fs.readFileSync(packagePath, "utf8")).version;
const nullImageId = '&0000000000000000000000000000000000000000000=.sha256';
const getAvatarUrl = img => !img || img === nullImageId ? '/assets/images/default-avatar.png' : `/image/256/${encodeURIComponent(img)}`;
const MAX_TITLE_LENGTH = 150;
const MAX_TEXT_LENGTH = 8000;
const LONG_TEXT_MAX = longText.TEXT_CAP;
const parseSizeMB = (s) => { if (!s) return 0; const m = String(s).match(/([\d.]+)\s*(GB|MB|KB|B)/i); if (!m) return 0; const v = parseFloat(m[1]), u = m[2].toUpperCase(); return u === 'GB' ? v * 1024 : u === 'MB' ? v : u === 'KB' ? v / 1024 : v / (1024 * 1024); };
const FEED_MEDIA_MD_RE = /^\n?!?\[[^\]\n]{0,200}\]\(&[A-Za-z0-9+/=]{44}\.sha256\)$/;
const tooLong = (ctx, value, max, label) => {
  if (value && value.length > max) {
    sendErrorPage(ctx, `${label} too long (max ${max})`, { status: 400 });
    return true;
  }
  return false;
};
const publishErrorText = (e) => {
  const t = require('../views/main_views').i18n;
  const msg = String((e && e.message) || e || '');
  if (isSsbTooLargeError(e) || /too long|does not fit/i.test(msg)) return t.publishTooLong;
  return msg ? `${t.actionFailed} (${msg.slice(0, 200)})` : t.actionFailed;
};
const keepText = (ctx, error, form) => {
  ctx.status = 400;
  ctx.state.inlineError = publishErrorText(error);
  ctx.body = require('../views/main_views').keepTextView(form);
};
const forumPageBody = async (ctx, forumId, replyId = null, params = {}) => {
  const spreadInfo = await spreads.forMessage(forumId).catch(() => null);
  const forumObj = await forumModel.getForumById(forumId);
  try { const oi = await forumModel.getOpenInvite(forumId).catch(() => null); if (oi && forumObj) forumObj.openInviteCode = oi.code; } catch (_) {}
  const forumMsgs = await forumModel.getMessagesByForumId(forumId);
  await warmAuthorNames(forumObj, forumMsgs);
  try { forumObj.subscription = await subscriptionStateFor(forumObj.rootId || forumObj.key, forumObj.author); } catch (_) {}
  return singleForumView(await withFavorite(forumObj, 'forum'), forumMsgs, ctx.query.filter, replyId, { spreads: spreadInfo, ...params });
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
    if (!config.public && onboardingModel.shouldOpen()) { ctx.redirect('/welcome'); return; }
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
    if (currentConfig.ux?.current === "chats") {
      ctx.redirect("/chats");
      return;
    }
    if (currentConfig.ux?.current === "feed") {
      ctx.redirect("/feed");
      return;
    }
    if (currentConfig.ux?.current === "phone" && !config.public) {
      ctx.redirect("/phone");
      return;
    }
    const homePage = /^[a-z0-9-]+$/i.test(String(currentConfig.homePage || "")) ? currentConfig.homePage : "activity";
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
  .get("/modules", async (ctx) => {
    const modules = ['blogs', 'polls', 'fediverse', 'invites', 'wallet', 'backup', 'dev', 'cipher', 'bookmarks', 'calendars', 'chats', 'videos', 'docs', 'audios', 'tags', 'images', 'maps', 'trending', 'events', 'tasks', 'market', 'tribes', 'larp', 'votes', 'reports', 'opinions', 'pads', 'transfers', 'feed', 'pixelia', 'melody', 'agenda', 'favorites', 'ai', 'forum', 'games', 'housing', 'jobs', 'projects', 'industry', 'shops', 'banking', 'school', 'parliament', 'courts'];
    const cfg = getConfig().modules;
    ctx.body = modulesView(modules.reduce((acc, m) => { acc[`${m}Mod`] = cfg[`${m}Mod`]; return acc; }, {}));
  })
  .get('/ai', async (ctx) => {
    if (!checkMod(ctx, 'aiMod')) return ctx.redirect('/modules');
    if (config.public) { ctx.body = aiView([], '', { status: null }); return; }
    startAI();
    const lang = ctx.cookies.get('language') || getConfig().language || 'en', historyPath = stateFilePath('AI-history.json');
    require('../views/main_views').setLanguage(lang);
    const chatHistory = readAiHistory(historyPath).filter(e => e && e.trainStatus !== 'thinking');
    try { await about.name(getViewerId()); } catch (_) {}
    const status = await aiClient.status().catch(() => ({ installed: false, ready: false }));
    ctx.body = aiView(chatHistory, getConfig().ai?.prompt?.trim() || '', { status });
  })
  .get('/games', async (ctx) => {
    if (!checkMod(ctx, 'gamesMod')) { ctx.redirect('/modules'); return; }
    const filter = qf(ctx, 'all');
    const q = String(ctx.query.q || '').trim();
    const hall = await gamesModel.getHallOfFame();
    ctx.body = gamesView(filter, hall, q);
  })
  .get('/games/:name', async (ctx) => {
    if (!checkMod(ctx, 'gamesMod')) { ctx.redirect('/modules'); return; }
    const { gameShellView } = require('../views/games_view');
    ctx.body = gameShellView(ctx.params.name);
  })
  .post('/games/submit-score', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'gamesMod')) { ctx.redirect('/modules'); return; }
    const { game, score } = ctx.request.body;
    try { await gamesModel.submitScore(game, score); } catch (_) { return actionFail(ctx); }
    ctx.redirect('/games?filter=scoring');
  })
  .get('/school', async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || 'recent').toLowerCase();
    const q = String(ctx.query.q || '').trim();
    const sort = String(ctx.query.sort || 'recent').trim();
    if (filter === 'create') { ctx.body = await schoolView([], 'create', null, { q, sort, reach: String(ctx.query.courseType || '') }); return; }
    if (filter === 'edit') {
      const course = await schoolModel.getCourseById(String(ctx.query.courseId || ''), getViewerId());
      if (course) course.clearnet = await clearnetPublic('school', course).catch(() => false);
      ctx.body = await schoolView([], 'edit', course, { q, sort, reach: String(ctx.query.courseType || '') });
      return;
    }
    const fav = await contentFavorites.getFavoriteSet('school').catch(() => new Set());
    let courses = await schoolModel.listCourses(filter === 'favorites' ? 'all' : filter, getViewerId(), { q, sort });
    courses = courses.map(c => ({ ...c, isFavorite: fav.has(String(c.rootId || c.id)) }));
    if (filter === 'favorites') courses = courses.filter(c => c.isFavorite);
    if (recentFallback(ctx, await applyWishScope(courses))) return;
    let subscriptions = null;
    try {
      const { counts, mine } = await subscriptionsModel.subscriberCounts(courses.map(c => c.rootId || c.id));
      subscriptions = { counts, mine };
    } catch (_) {}
    const schoolCensus = (String(filter) === 'all' && !q)
      ? courses
      : (await censusOf('school', () => schoolModel.listCourses('all', getViewerId(), { q: '', sort })).catch(() => []))
          .map(c2 => ({ ...c2, isFavorite: fav.has(String(c2.rootId || c2.id)) }));
    const schoolModesAvail = schoolModesFromCensus(schoolCensus, getViewerId());
    const scopedCourses = await applyWishScope(courses);
    await annotateClearnet('school', scopedCourses);
    ctx.body = await schoolView(scopedCourses, filter, null, { q, sort, subscriptions, modesAvail: schoolModesAvail, spreadMap: await spreads.forMessages(pageOf(ctx, scopedCourses).map(c => c && c.id)).catch(() => new Map()), viewerPrefs: await about.visibilityPrefs(getViewerId()).catch(() => null), viewerId: getViewerId() });
  })
  .get('/school/course/:id', async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const course = await schoolModel.getCourseById(ctx.params.id, getViewerId());
    const lessons = await schoolModel.listLessons(course.rootId);
    const certificates = await schoolModel.listCertificates(course.rootId);
    const fav = await contentFavorites.getFavoriteSet('school').catch(() => new Set());
    const exams = await schoolModel.listExams(course.rootId).catch(() => []);
    const progress = course.author === getViewerId() ? await schoolModel.progressForCourse(course.rootId).catch(() => ({})) : {};
    const approved = course.students.includes(getViewerId()) ? await schoolModel.hasPassedCourse(course.rootId, getViewerId()).catch(() => false) : false;
    if (course) course.clearnet = await clearnetPublic('school', course).catch(() => false);
    ctx.body = await singleCourseView({ ...course, isFavorite: fav.has(String(course.rootId || course.id)) }, lessons, certificates, { exams, progress, approved, certStudent: String(ctx.query.cert || ''), subscription: await subscriptionStateFor(course.rootId || course.id, course.author), spreads: await spreads.forMessage(course.id).catch(() => null), modesAvail: await schoolModesAvailFor() });
  })
  .post('/school/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    if (clearnetConflict(ctx.request.body)) return renderClearnetConflict(ctx, () => schoolView([], 'create', null, { draft: clearnetDraft(ctx.request.body) }));
    const b = ctx.request.body, imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    const courseType = String(b.courseType || 'OPEN').toUpperCase();
    if (courseType === 'PAID' && !(parseFloat(String(b.price || '').replace(',', '.')) > 0)) throw new Error('Invalid price');
    if (rejectPastDates(ctx, [[b.startDate]], '/school?filter=create')) return;
    const clearnetCreated = await schoolModel.createCourse({ title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), tags: b.tags, price: courseType === 'OPEN' ? '0' : b.price, visibility: courseType === 'INVITE' ? 'INVITE' : 'PUBLIC', startDate: b.startDate, image: imageBlob });
    await applyClearnetChoice(ctx, 'school', clearnetCreated);
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect('/school?filter=mine');
  })
  .post('/school/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    if (clearnetConflict(ctx.request.body)) {
      const existing = await schoolModel.getCourseById(ctx.params.id, getViewerId()).catch(() => null);
      if (!existing) { ctx.redirect('/school'); return; }
      return renderClearnetConflict(ctx, () => schoolView([], 'edit', clearnetDraft(ctx.request.body, existing), {}));
    }
    const b = ctx.request.body, imageBlob = (ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : undefined) || undefined;
    const courseType = String(b.courseType || 'OPEN').toUpperCase();
    if (courseType === 'PAID' && !(parseFloat(String(b.price || '').replace(',', '.')) > 0)) throw new Error('Invalid price');
    const patch = { title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), tags: b.tags, price: courseType === 'OPEN' ? '0' : b.price, visibility: courseType === 'INVITE' ? 'INVITE' : 'PUBLIC', status: b.status, startDate: b.startDate };
    if (imageBlob !== undefined) patch.image = imageBlob;
    await schoolModel.updateCourse(ctx.params.id, patch);
    await applyClearnetChoice(ctx, 'school', ctx.params.id);
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect('/school?filter=mine');
  })
  .post('/school/status/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    await schoolModel.updateCourseStatus(ctx.params.id, String(ctx.request.body.status || '').toUpperCase());
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/school?filter=mine', ['/school']));
  })
  .post('/school/delete/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    await schoolModel.deleteCourse(ctx.params.id);
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect('/school?filter=mine');
  })
  .post('/school/enroll/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    await schoolModel.enroll(ctx.params.id);
    let enrolledCourse = null;
    try {
      const course = await schoolModel.getCourseById(ctx.params.id, getViewerId());
      enrolledCourse = course;
      await notifyBot('SCHOOL_ENROLLED', [course.author], `${await actorLink(getViewerId())} has enrolled in your course: [${course.title || 'a course'}](/school/course/${encodeURIComponent(ctx.params.id)})`);
    } catch (_) {}
    const courseHref = `/school/course/${encodeURIComponent(ctx.params.id)}`;
    if (enrolledCourse && Number(enrolledCourse.price) > 0) {
      const mine = (Array.isArray(enrolledCourse.pending) ? enrolledCourse.pending : []).find(p => String(p.author) === String(getViewerId()));
      await redirectToPayment(ctx, { sellerId: enrolledCourse.author, amount: enrolledCourse.price, fallback: courseHref, transferId: mine && mine.transferId ? mine.transferId : null, concept: enrolledCourse.title, href: courseHref });
      return;
    }
    ctx.redirect(courseHref);
  })
  .post('/school/unenroll/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    await schoolModel.unenroll(ctx.params.id);
    ctx.redirect(`/school/course/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/school/invite/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const m = await schoolModel.inviteStudent(ctx.params.id, stripDangerousTags(ctx.request.body.students));
    try {
      const courseId = m && m.key ? m.key : ctx.params.id;
      const course = await schoolModel.getCourseById(courseId, getViewerId());
      const invited = String(ctx.request.body.students || '').split(/[\s,]+/).filter(x => x.startsWith('@'));
      for (const student of invited) {
        await notifyBot('SCHOOL_INVITED', [student], `You have been invited to the course: [${course.title || 'a course'}](/school/course/${encodeURIComponent(courseId)})`);
      }
    } catch (_) {}
    ctx.redirect(`/school/course/${encodeURIComponent(m && m.key ? m.key : ctx.params.id)}`);
  })
  .post('/school/lesson/add/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    if (rejectPastDates(ctx, [[b.sessionDate]], '/school')) return;
    await schoolModel.addLesson(ctx.params.id, { title: stripDangerousTags(b.title), text: stripDangerousTags(b.text), unit: stripDangerousTags(b.unit || ''), order: b.order, sessionDate: b.sessionDate });
    try {
      const course = await schoolModel.getCourseById(ctx.params.id, getViewerId());
      for (const student of (course.students || [])) {
        await notifyBot('SCHOOL_LESSON_NEW', [student], `New lesson "${stripDangerousTags(b.title)}" in the course: [${course.title || 'a course'}](/school/course/${encodeURIComponent(ctx.params.id)})`);
      }
    } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, `/school/course/${encodeURIComponent(ctx.params.id)}`, ['/school']));
  })
  .post('/school/lesson/delete/:courseId/:lessonId', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    await schoolModel.deleteLesson(ctx.params.lessonId);
    ctx.redirect(safeReturnTo(ctx, `/school/course/${encodeURIComponent(ctx.params.courseId)}`, ['/school']));
  })
  .get('/school/certificate/pdf/:courseId/:certId', async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const course = await schoolModel.getCourseById(ctx.params.courseId, getViewerId()).catch(() => null);
    if (!course) { ctx.redirect('/school'); return; }
    const certs = await schoolModel.listCertificates(course.rootId || course.id).catch(() => []);
    const cert = certs.find(x => String(x.id) === String(ctx.params.certId));
    if (!cert) { ctx.redirect(`/school/course/${encodeURIComponent(ctx.params.courseId)}`); return; }
    let studentName = null, teacherName = null;
    try { studentName = await about.name(cert.student); } catch (_) {}
    try { teacherName = await about.name(cert.author); } catch (_) {}
    const pdf = buildCertificatePdf({ cert, course, studentName, teacherName });
    ctx.set('Content-Type', 'application/pdf');
    ctx.set('Content-Disposition', `attachment; filename="oasis-certificate-${String(cert.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}.pdf"`);
    ctx.body = pdf;
  })
  .post('/school/certificate/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    const studentId = String(b.student || '').trim().split(/\s+/)[0];
    const issued = await schoolModel.issueCertificate(ctx.params.id, stripDangerousTags(studentId), stripDangerousTags(b.text || ''));
    try {
      const course = await schoolModel.getCourseById(ctx.params.id, getViewerId());
      const student = studentId;
      if (student.startsWith('@')) {
        const pdfPart = issued && issued.key ? ` — [Download your diploma (PDF)](/school/certificate/pdf/${encodeURIComponent(ctx.params.id)}/${encodeURIComponent(issued.key)})` : '';
        const notePart = String(b.text || '').trim() ? `\n\n${stripDangerousTags(String(b.text).trim())}` : '';
        await notifyBot('SCHOOL_CERTIFICATE', [student], `You have received a certificate 🎓 for the course: [${course.title || 'a course'}](/school/course/${encodeURIComponent(ctx.params.id)})${pdfPart}${notePart}`);
      }
    } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, `/school/course/${encodeURIComponent(ctx.params.id)}`, ['/school']));
  })
  .post('/school/opinions/:id/:category', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    try { await schoolModel.createOpinion(ctx.params.id, ctx.params.category); } catch (e) { return /already/i.test(String(e && e.message)) ? failWith(ctx, 'opinionAlreadyGiven') : actionFail(ctx); }
    ctx.redirect(safeReturnTo(ctx, `/school/course/${encodeURIComponent(ctx.params.id)}`, ['/school']));
  })
  .post('/school/lesson/complete/:courseId/:lessonId', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const done = String(ctx.request.body.value || 'true') !== 'false';
    const passedBefore = await schoolModel.hasPassedCourse(ctx.params.courseId, getViewerId()).catch(() => false);
    try { await schoolModel.markLesson(ctx.params.courseId, ctx.params.lessonId, done); } catch (_) { return actionFail(ctx); }
    try {
      if (!passedBefore && await schoolModel.hasPassedCourse(ctx.params.courseId, getViewerId())) {
        const course = await schoolModel.getCourseById(ctx.params.courseId, getViewerId());
        await notifyBot('SCHOOL_PASSED', [course.author], `${await actorLink(getViewerId())} has passed your course: [${course.title || 'a course'}](/school/course/${encodeURIComponent(ctx.params.courseId)})`);
      }
    } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, `/school/course/${encodeURIComponent(ctx.params.courseId)}`, ['/school']));
  })
  .post('/school/exam/create/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    await schoolModel.createExam(ctx.params.id, stripDangerousTags(ctx.request.body.title), { lessonId: ctx.request.body.lessonId });
    ctx.redirect(safeReturnTo(ctx, `/school/course/${encodeURIComponent(ctx.params.id)}`, ['/school']));
  })
  .post('/school/exam/question/add/:courseId', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    await schoolModel.addExamQuestion(ctx.params.courseId, b.examId, { q: stripDangerousTags(b.q), o1: stripDangerousTags(b.o1), o2: stripDangerousTags(b.o2), o3: stripDangerousTags(b.o3), o4: stripDangerousTags(b.o4), correct: b.correct, points: b.points });
    ctx.redirect(safeReturnTo(ctx, `/school/course/${encodeURIComponent(ctx.params.courseId)}`, ['/school']));
  })
  .post('/school/exam/question/delete/:courseId/:examId/:questionId', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    await schoolModel.deleteExamQuestion(ctx.params.questionId);
    ctx.redirect(safeReturnTo(ctx, `/school/course/${encodeURIComponent(ctx.params.courseId)}`, ['/school']));
  })
  .post('/school/exam/delete/:courseId/:examId', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    await schoolModel.deleteExam(ctx.params.examId);
    ctx.redirect(safeReturnTo(ctx, `/school/course/${encodeURIComponent(ctx.params.courseId)}`, ['/school']));
  })
  .post('/school/exam/take/:courseId/:examId', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const passedBefore = await schoolModel.hasPassedCourse(ctx.params.courseId, getViewerId()).catch(() => false);
    try { await schoolModel.takeExam(ctx.params.courseId, ctx.params.examId, ctx.request.body); } catch (_) { return actionFail(ctx); }
    try {
      if (!passedBefore && await schoolModel.hasPassedCourse(ctx.params.courseId, getViewerId())) {
        const course = await schoolModel.getCourseById(ctx.params.courseId, getViewerId());
        await notifyBot('SCHOOL_PASSED', [course.author], `${await actorLink(getViewerId())} has passed your course: [${course.title || 'a course'}](/school/course/${encodeURIComponent(ctx.params.courseId)})`);
      }
    } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, `/school/course/${encodeURIComponent(ctx.params.courseId)}`, ['/school']));
  })
  .get('/school/lesson/:courseId/:lessonId', async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const course = await schoolModel.getCourseById(ctx.params.courseId, getViewerId());
    const lessons = await schoolModel.listLessons(course.rootId);
    const lesson = lessons.find(l => l.id === ctx.params.lessonId);
    if (!lesson) { ctx.redirect(`/school/course/${encodeURIComponent(ctx.params.courseId)}`); return; }
    const materials = await schoolModel.listLessonMaterials(course.rootId, lesson.id).catch(() => []);
    ctx.body = await require('../views/school_view').singleLessonView(course, lesson, materials, { edit: String(ctx.query.edit || '') === '1', modesAvail: await schoolModesAvailFor() });
  })
  .post('/school/lesson/update/:courseId/:lessonId', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    const updated = await schoolModel.updateLesson(ctx.params.courseId, ctx.params.lessonId, { title: stripDangerousTags(b.title), text: stripDangerousTags(b.text), unit: stripDangerousTags(b.unit || ''), order: b.order, sessionDate: b.sessionDate });
    ctx.redirect(`/school/lesson/${encodeURIComponent(ctx.params.courseId)}/${encodeURIComponent(updated && updated.key ? updated.key : ctx.params.lessonId)}`);
  })
  .post('/school/lesson/media/:courseId/:lessonId', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const uploads = await handleBlobUploads(ctx, 'files', 8);
    const caption = stripDangerousTags((ctx.request.body.caption || '').trim());
    for (const media of (uploads || []).filter(Boolean)) {
      await schoolModel.addLessonMaterial(ctx.params.courseId, ctx.params.lessonId, media, caption);
    }
    const text = stripDangerousTags((ctx.request.body.text || '').trim());
    if (text) await schoolModel.addLessonMaterial(ctx.params.courseId, ctx.params.lessonId, text, caption);
    ctx.redirect(`/school/lesson/${encodeURIComponent(ctx.params.courseId)}/${encodeURIComponent(ctx.params.lessonId)}`);
  })
  .post('/school/lesson/media/delete/:courseId/:lessonId/:materialId', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    await schoolModel.deleteLessonMaterial(ctx.params.materialId);
    ctx.redirect(`/school/lesson/${encodeURIComponent(ctx.params.courseId)}/${encodeURIComponent(ctx.params.lessonId)}`);
  })
  .post('/school/generate-invite/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    try {
      const { code } = await schoolModel.generateInvite(ctx.params.id);
      ctx.body = await require('../views/school_view').schoolInvitePage(code);
    } catch (_) {
      actionFail(ctx);
    }
  })
  .post('/school/join-code', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    const code = String((ctx.request.body || {}).code || '').trim();
    try {
      const { courseId } = await schoolModel.joinByInvite(code);
      ctx.redirect(`/school/course/${encodeURIComponent(courseId)}`);
    } catch (err) {
      sendErrorPage(ctx, err && err.message ? err.message : 'Invalid or expired invite code', { status: 400 });
    }
  })
  .get('/qr-invite-code/:mod/:code', async (ctx) => {
    try {
      const mod = String(ctx.params.mod || '');
      const code = String(ctx.params.code || '');
      if (!QR_JOIN_MODS[mod] || !/^[A-Za-z0-9]{4,128}$/.test(code)) { ctx.status = 404; ctx.body = ''; return; }
      const QRCode = require('../server/node_modules/qrcode');
      const targetUrl = `${QR_ACTION_BASE}/qr-action/join/${mod}/${encodeURIComponent(code)}`;
      const buf = await QRCode.toBuffer(targetUrl, { type: 'png', width: 240, margin: 1, errorCorrectionLevel: 'M' });
      ctx.set('Content-Type', 'image/png');
      ctx.set('Cache-Control', 'no-store');
      ctx.body = buf;
    } catch (e) { ctx.status = 500; ctx.body = ''; }
  })
  .get('/admin-session/:token', async (ctx) => {
    if (!ADMIN_TOKEN || !fromLoopbackSocket(ctx) || !sameSecret(String(ctx.params.token || ''), ADMIN_TOKEN)) { ctx.status = 404; ctx.body = ''; return; }
    ctx.cookies.set('oasis_admin', ADMIN_TOKEN, { httpOnly: true, sameSite: 'strict', secure: ctx.secure });
    ctx.redirect('/settings');
  })
  .get('/qr-action/join/:mod/:code', async (ctx) => {
    const entry = QR_JOIN_MODS[String(ctx.params.mod || '')];
    if (!entry) { ctx.status = 404; ctx.body = ''; return; }
    if (!checkMod(ctx, entry.mod)) { ctx.redirect('/modules'); return; }
    confirmPage(ctx, { message: require('../views/main_views').i18n.confirmJoinText, action: `/qr-action/join/${encodeURIComponent(ctx.params.mod)}/${encodeURIComponent(String(ctx.params.code || '').trim())}`, backHref: `/${encodeURIComponent(ctx.params.mod)}` });
  })
  .post('/qr-action/join/:mod/:code', koaBody(), async (ctx) => {
    const entry = QR_JOIN_MODS[String(ctx.params.mod || '')];
    if (!entry) { ctx.status = 404; ctx.body = ''; return; }
    if (!checkMod(ctx, entry.mod)) { ctx.redirect('/modules'); return; }
    const code = String(ctx.params.code || '').trim();
    try {
      ctx.redirect(await entry.join(code));
    } catch (err) {
      sendErrorPage(ctx, err && err.message ? err.message : 'Invalid or expired invite code', { status: 400 });
    }
  })
  .get('/qr-action/follow/:feedId', async (ctx) => {
    const feedId = decodeURIComponent(ctx.params.feedId || '');
    if (!ssbRef.isFeedId(feedId)) { ctx.status = 400; ctx.body = 'Invalid feed id'; return; }
    confirmPage(ctx, { message: require('../views/main_views').i18n.confirmFollowText, action: `/qr-action/follow/${encodeURIComponent(feedId)}`, backHref: `/author/${encodeURIComponent(feedId)}` });
  })
  .post('/qr-action/follow/:feedId', koaBody(), async (ctx) => {
    const feedId = decodeURIComponent(ctx.params.feedId || '');
    if (!ssbRef.isFeedId(feedId)) { ctx.status = 400; ctx.body = 'Invalid feed id'; return; }
    try { await friend.follow(feedId); } catch (_) {}
    ctx.redirect(`/author/${encodeURIComponent(feedId)}`);
  })
  .post('/school/grant/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'schoolMod')) { ctx.redirect('/modules'); return; }
    await schoolModel.grantAccess(ctx.params.id, stripDangerousTags(ctx.request.body.student));
    try {
      const course = await schoolModel.getCourseById(ctx.params.id, getViewerId());
      const student = String(ctx.request.body.student || '').trim();
      if (student.startsWith('@')) await notifyBot('SCHOOL_ADMITTED', [student], `You have been admitted to the course: [${course.title || 'a course'}](/school/course/${encodeURIComponent(ctx.params.id)})`);
    } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, `/school/course/${encodeURIComponent(ctx.params.id)}`, ['/school']));
  })
  .post('/school/favorites/add/:id', koaBody(), async ctx => favAction(ctx, 'school', 'add'))
  .post('/school/favorites/remove/:id', koaBody(), async ctx => favAction(ctx, 'school', 'remove'))
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
      const favAudios = await contentFavorites.getFavoriteSet('audios').catch(() => new Set());
      bcsAudios = bcsAudios.map(a => ({ ...a, isFavorite: favAudios.has(String(a.rootId || a.key)) }));
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
    const censusBlocks = String(filter).toLowerCase() === 'all' && !searchActive
      ? blockchainData
      : (await censusOf('blocks', () => blockchainModel.listBlockchain('all', userId, {})).catch(() => [])) || [];
    ctx.body = renderBlockchainView(blockchainData, filter, userId, search, { inspect, censusBlocks });
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
  .get('/author/:feed', async (ctx) => {
    const feedId = decodeURIComponent(ctx.params.feed || ''), gt = Number(ctx.request.query.gt || -1), lt = Number(ctx.request.query.lt || -1);
    if (lt > 0 && gt > 0 && gt >= lt) throw new Error('Given search range is empty');
    const visibilityPrefs = await about.visibilityPrefs(feedId).catch(() => null);
    const deviceSource = await about.deviceSource(feedId).catch(() => null);
    const stats = await inhabitantsModel.getInhabitantStats(feedId, getViewerId()).catch(() => ({}));
    const rawPrefs = visibilityPrefs || {};
    const needsBanking = (rawPrefs.karma !== false);
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
    const profileSpreadable = new Set(['post','audio','video','image','document','torrent','file','bookmark','event','calendar','task','votes','vote','market','shop','shopProduct','project','industry','industryBuild','industryBlueprint','transfer','housing','job','report','chat','chatMessage','pad','padEntry','room','wikiPage','emergency','mailingList','logisticsRoute','podcast','podcastEpisode','campaign','forum','map','schoolCourse','feed','blog','poll']);
    const profileSpreadKeys = profileActionsOf(allActions, feedId).filter(a => a && a.id && typeof a.id === 'string' && a.id.startsWith('%') && /\.sha256$/.test(a.id) && profileSpreadable.has(a.type)).map(a => a.id);
    const profilePage = await renderedPage(async () => authorView({ feedId, oasisVersion: (String(feedId) === String(getViewerId()) ? OASIS_VERSION : null) || await getOasisVersion(feedId), messages: sanitizedMsgs, firstPost, lastPost, name, description, avatarUrl: getAvatarUrl(image), relationship, ecoAddress, karmaScore: bankData.karmaScore, estimatedUBI: bankData.estimatedUBI || 0, lastClaimedDate: bankData.lastClaimedDate || null, totalClaimed: bankData.totalClaimed || 0, carbonGrams, larpHouse, lastActivityBucket, visibilityPrefs, deviceSource, stats, userActions, allActions, profileItems, profileFilterType, gpgFingerprint, spreadMap: new Map(), fediverseConfigured: fediverseModel.hasAccount() }));
    const profilePageKeys = new Set();
    for (const it of profilePage) { const c = (it && it.content) || {}; for (const k of [it && it.id, it && it.rootId, it && it.tipId, c.threadId, c.chatRoot, c.root && c.root.id, ...(Array.isArray(c.replies) ? c.replies.map(r => r && r.id) : [])]) if (k) profilePageKeys.add(k); }
    const spreadMap = await spreads.forMessages(profileSpreadKeys.filter(k => profilePageKeys.has(k))).catch(() => new Map());
    await warmAuthorNames(profileActionsOf(allActions, feedId), sanitizedMsgs, profileItems);
    ctx.body = await authorView({ feedId, oasisVersion: (String(feedId) === String(getViewerId()) ? OASIS_VERSION : null) || await getOasisVersion(feedId), messages: sanitizedMsgs, firstPost, lastPost, name, description, avatarUrl: getAvatarUrl(image), relationship, ecoAddress, karmaScore: bankData.karmaScore, estimatedUBI: bankData.estimatedUBI || 0, lastClaimedDate: bankData.lastClaimedDate || null, totalClaimed: bankData.totalClaimed || 0, carbonGrams, larpHouse, lastActivityBucket, visibilityPrefs, deviceSource, stats, userActions, allActions, profileItems, profileFilterType, gpgFingerprint, spreadMap, fediverseConfigured: fediverseModel.hasAccount() });
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
    const types = [].concat(ctx.query.type || []).map(String).filter(Boolean);
    if (!query) return ctx.body = await searchView({ messages: [], query, types });
    const userId = getViewerId();
    const allTribes = await tribesModel.listAll();
    const anonTribeIds = new Set(allTribes.filter(t => t.isAnonymous === true).map(t => t.id));
    const applySearchPrivacy = (msgs) => msgs.filter(msg => {
      const c = msg.value?.content;
      if (!c) return true;
      if (c.type === 'pub') return false;
      if (Array.isArray(c.recps)) return false;
      if (c.type === 'post' && (c.private === true || c.recps)) return false;
      if (c.tribeId && anonTribeIds.has(c.tribeId)) return false;
      if (c.type === 'event' && c.isPublic === 'private' && c.organizer !== userId && !(Array.isArray(c.attendees) && c.attendees.includes(userId))) return false;
      if (c.type === 'task' && String(c.isPublic).toUpperCase() === 'PRIVATE' && c.author !== userId && !(Array.isArray(c.assignees) && c.assignees.includes(userId))) return false;
      if (c.status === 'PRIVATE') return false;
      if (c.type === 'shop' && (c.visibility === 'CLOSED' || c.encryptedPayload) && c.author !== userId) return false;
      if (c.type === 'schoolCourse' && c.encryptedPayload) return false;
      if (c.type === 'schoolCourse' && String(c.visibility || '').toUpperCase() === 'INVITE' && c.author !== userId && !(Array.isArray(c.invited) && c.invited.includes(userId))) return false;
      return true;
    });
    const results = await searchModel.search({ query, types });
    try {
      if (checkMod(ctx, 'aiMod') && aiEmbedder.isInstalled()) {
        const ssbSem = await cooler.open();
        const sem = await semanticSearch.search(ssbSem, query, { embed: aiEmbedder.embed, cosine: aiEmbedder.cosine, limit: getConfig().ssbLogStream?.limit || 1000 });
        for (const { msg } of sem) {
          const t = msg && msg.value && msg.value.content && msg.value.content.type;
          if (!t) continue;
          if (!Array.isArray(results[t])) results[t] = [];
          if (!results[t].some(m => m && m.key === msg.key)) results[t].push(msg);
        }
      }
    } catch (_) {}
    const cfgNow = getConfig();
    const wishMutuals = cfgNow.wish === 'mutuals';
    const wishOnlyLan = cfgNow.wish === 'only-lan';
    const mutualCache = wishMutuals ? makeCtxMutualCache() : null;
    const lanKeys = wishOnlyLan ? new Set([...(await refreshLanPeers()), userId]) : null;
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
      if (cfgNow.wish === 'local') after = after.filter(m => (m.value?.author || m.value?.content?.author) === userId);
      const mapped = after.map(msg => (!msg.value?.content) ? {} : { ...msg, content: msg.value.content, author: msg.value.content.author || 'Unknown' });
      let scoped = mapped;
      if (Number.isFinite(fromTs)) scoped = scoped.filter(m => (m.value?.timestamp || m.timestamp || 0) >= fromTs);
      if (Number.isFinite(toTs)) scoped = scoped.filter(m => (m.value?.timestamp || m.timestamp || 0) <= toTs);
      if (scoped.length > 0) finalResults[type] = scoped;
    }
    ctx.body = await searchView({ results: finalResults, query, types, ...(await searchExtras(finalResults, ctx)) });
  })
  .get("/images", async (ctx) => {
    if (!checkMod(ctx, 'imagesMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'recent', q = '', sort = 'recent' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const items = await imagesModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const tribeOpen = (await tribeItemsFor('media', 'image')).map(t => ({ ...t, url: (String(t.image || '').match(/&[^)\s]+\.sha256/) || [''])[0] }));
    const tribeShown = ['recent', 'mine', 'all', 'gallery'].includes(filter) ? applyTextSearch(tribeOpen.filter(t => (filter !== 'mine' || t.author === getViewerId()) && (filter !== 'recent' || (Date.parse(t.createdAt) || 0) >= Date.now() - 86400000)), q, ['title', 'description', 'tags', 'author']) : [];
    const fav = await contentFavorites.getFavoriteSet('images');
    let enriched = [...items, ...tribeShown].sort((a, b) => sort === 'top' ? 0 : sort === 'oldest' ? new Date(a.createdAt) - new Date(b.createdAt) : new Date(b.createdAt) - new Date(a.createdAt)).map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    if (recentFallback(ctx, enriched)) return;
    await enrichWithComments(enriched, 'key');
    const spreadMap = await spreads.forMessages(pageOf(ctx, enriched).map(x => x && x.key));
    await warmAuthorNames(pageOf(ctx, enriched));
    const censusMedia = (String(filter) === 'all' && !q) ? enriched : (await censusOf(`images:${sort}`, () => imagesModel.listAll({ filter: 'all', q: '', sort, viewerId: getViewerId() })).catch(() => [])).concat(tribeOpen).map(x2 => ({ ...x2, isFavorite: fav.has(String(x2.rootId || x2.key)) }));
    ctx.body = await imageView(enriched, filter, null, { censusList: censusMedia, q, sort, viewerPrefs, spreadMap });
  })
  .get("/images/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'imagesMod')) { ctx.redirect('/modules'); return; }
    const img = await imagesModel.getImageById(ctx.params.id, getViewerId());
    const fav = await contentFavorites.getFavoriteSet('images');
    if (img) img.clearnet = await clearnetPublic('images', img).catch(() => false);
    ctx.body = await imageView([{ ...img, isFavorite: fav.has(String(img.rootId || img.key)) }], 'edit', img.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/images/:imageId", async (ctx) => {
    if (!checkMod(ctx, 'imagesMod')) { ctx.redirect('/modules'); return; }
    const { imageId } = ctx.params; const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const img = await imagesModel.getImageById(imageId, getViewerId());
    const fav = await contentFavorites.getFavoriteSet('images');
    const comments = await getVoteComments(img.key);
    const imgAuthorPrefs = await about.visibilityPrefs(img.author).catch(() => null);
    await enrichItemLifetime(img, { key: img.key });
    const singleFav = await contentFavorites.getFavoriteSet('images');
    const singleCensus = (await censusOf(`images:${String(ctx.query.sort || 'recent')}`, () => imagesModel.listAll({ filter: 'all', q: '', sort: String(ctx.query.sort || 'recent'), viewerId: getViewerId() })).catch(() => [])).map(x2 => ({ ...x2, isFavorite: (singleFav).has(String(x2.rootId || x2.key)) }));
    if (img) img.clearnet = await clearnetPublic('images', img).catch(() => false);
    ctx.body = await singleImageView({ ...img, isFavorite: fav.has(String(img.rootId || img.key)), commentCount: comments.length }, filter, comments, { censusList: singleCensus, q, sort, returnTo: safeReturnTo(ctx, `/images?filter=${encodeURIComponent(filter)}`, ['/images']), spreads: await spreads.forMessage(img.key), authorPrefs: imgAuthorPrefs, mapData: await resolveMapUrl(img.mapUrl) });
  })
  .get("/maps", async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'recent', q = '', lat, lng, zoom, tribeId, title, description, markerLabel, tags, mapType, clearnet, pick, view, place } = ctx.query;
    const uid = getViewerId();
    const items = await mapsModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, viewerId: uid });
    const fav = await contentFavorites.getFavoriteSet('maps');
    let enriched = items.map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = enriched.filter(x => !x.tribeId);
    enriched = await applyListFilters(enriched, ctx);
    try { enriched = await lifetime.enrichAndFilter(enriched, { getKey: (x) => x.rootId || x.key }); } catch (_) {}
    if (recentFallback(ctx, enriched)) return;
    const spreadMap = await spreads.forMessages(pageOf(ctx, enriched).map(x => x && (x.key || x.id)));
    const censusMaps = (String(filter) === 'all' && !q) ? enriched : (await censusOf('maps', () => mapsModel.listAll({ filter: 'all', q: '', viewerId: uid })).catch(() => [])).filter(x2 => !x2.tribeId).map(x2 => ({ ...x2, isFavorite: fav.has(String(x2.rootId || x2.key)) }));
    try {
      ctx.body = await mapsView(enriched, filter, null, { censusList: censusMaps, q, lat, lng, zoom, pick, view, place, title, description, markerLabel, tags, mapType, clearnet, ...(tribeId ? { tribeId } : {}), spreadMap });
    } catch (e) {
      console.error("maps render:", e.message);
      ctx.body = await mapsView(enriched, filter, null, { censusList: censusMaps, q, spreadMap });
    }
  })
  .get("/maps/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    let mapItem;
    try { mapItem = await mapsModel.getMapById(ctx.params.id, getViewerId()); } catch (_) { ctx.redirect('/maps?filter=all'); return; }
    if (!mapItem) { ctx.redirect('/maps?filter=all'); return; }
    if (mapItem.author !== getViewerId()) { ctx.redirect(`/maps/${encodeURIComponent(mapItem.key)}`); return; }
    const fav = await contentFavorites.getFavoriteSet('maps');
    mapItem.clearnet = await clearnetPublic('maps', mapItem).catch(() => false);
    const { lat, lng, zoom, title, description, markerLabel, tags, mapType, clearnet, pick, view, place } = ctx.query;
    ctx.body = await mapsView([{ ...mapItem, isFavorite: fav.has(String(mapItem.rootId || mapItem.key)) }], 'edit', mapItem.key, { returnTo: ctx.query.returnTo || '', lat, lng, zoom, pick, view, place, title, description, markerLabel, tags, clearnet, reach: String(mapType || '') });
  })
  .get("/maps/:mapId", async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    await mapsModel.ingestKeys().catch(() => {});
    const { mapId } = ctx.params; const { filter = 'all', q = '', zoom = '0', mkLat = '', mkLng = '', label: mkMarkerLabel = '', pick, view, place, focus, clat, clng } = ctx.query;
    const uid = getViewerId();
    let mapItem;
    try {
      mapItem = await mapsModel.getMapById(mapId, uid);
    } catch (e) {
      ctx.redirect('/maps?filter=all');
      return;
    }
    if (!mapItem) { ctx.redirect('/maps?filter=all'); return; }
    const fav = await contentFavorites.getFavoriteSet('maps');
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
    mapItem.clearnet = await clearnetPublic('maps', mapItem).catch(() => false);
    ctx.body = await singleMapView({ ...mapItem, isFavorite: fav.has(String(mapItem.rootId || mapItem.key)) }, filter, { q, zoom, clat, clng, mkLat, mkLng, mkMarkerLabel, pick, view, place, focus, tribeMembers, spreads: await spreads.forMessage(mapItem.key).catch(() => null), returnTo: safeReturnTo(ctx, `/maps?filter=${encodeURIComponent(filter)}`, ['/maps']) });
  })
  .get("/audios", async (ctx) => {
    if (!checkMod(ctx, 'audiosMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'recent', q = '', sort = 'recent' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const items = await audiosModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const tribeOpen = (await tribeItemsFor('media', 'audio')).map(t => ({ ...t, url: (String(t.image || '').match(/&[^)\s]+\.sha256/) || [''])[0] }));
    const tribeShown = ['recent', 'mine', 'all'].includes(filter) ? applyTextSearch(tribeOpen.filter(t => (filter !== 'mine' || t.author === getViewerId()) && (filter !== 'recent' || (Date.parse(t.createdAt) || 0) >= Date.now() - 86400000)), q, ['title', 'description', 'tags', 'author']) : [];
    const fav = await contentFavorites.getFavoriteSet('audios');
    let enriched = [...items, ...tribeShown].sort((a, b) => sort === 'top' ? 0 : sort === 'oldest' ? new Date(a.createdAt) - new Date(b.createdAt) : new Date(b.createdAt) - new Date(a.createdAt)).map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    if (recentFallback(ctx, enriched)) return;
    await enrichWithComments(enriched, 'key');
    const spreadMap = await spreads.forMessages(pageOf(ctx, enriched).map(x => x && x.key));
    await warmAuthorNames(pageOf(ctx, enriched));
    const censusMedia = (String(filter) === 'all' && !q) ? enriched : (await censusOf(`audios:${sort}`, () => audiosModel.listAll({ filter: 'all', q: '', sort, viewerId: getViewerId() })).catch(() => [])).concat(tribeOpen).map(x2 => ({ ...x2, isFavorite: fav.has(String(x2.rootId || x2.key)) }));
    ctx.body = await audioView(enriched, filter, null, { censusList: censusMedia, q, sort, viewerPrefs, spreadMap });
  })
  .get("/audios/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'audiosMod')) { ctx.redirect('/modules'); return; }
    const audio = await audiosModel.getAudioById(ctx.params.id, getViewerId());
    const fav = await contentFavorites.getFavoriteSet('audios');
    if (audio) audio.clearnet = await clearnetPublic('audios', audio).catch(() => false);
    ctx.body = await audioView([{ ...audio, isFavorite: fav.has(String(audio.rootId || audio.key)) }], 'edit', audio.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/audios/:audioId", async (ctx) => {
    if (!checkMod(ctx, 'audiosMod')) { ctx.redirect('/modules'); return; }
    const { audioId } = ctx.params; const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const audio = await audiosModel.getAudioById(audioId, getViewerId());
    const fav = await contentFavorites.getFavoriteSet('audios');
    const comments = await getVoteComments(audio.key);
    const audioAuthorPrefs = await about.visibilityPrefs(audio.author).catch(() => null);
    await enrichItemLifetime(audio, { key: audio.key });
    const singleFav = await contentFavorites.getFavoriteSet('audios');
    const singleCensus = (await censusOf(`audios:${String(ctx.query.sort || 'recent')}`, () => audiosModel.listAll({ filter: 'all', q: '', sort: String(ctx.query.sort || 'recent'), viewerId: getViewerId() })).catch(() => [])).map(x2 => ({ ...x2, isFavorite: (singleFav).has(String(x2.rootId || x2.key)) }));
    if (audio) audio.clearnet = await clearnetPublic('audios', audio).catch(() => false);
    ctx.body = await singleAudioView({ ...audio, isFavorite: fav.has(String(audio.rootId || audio.key)), commentCount: comments.length }, filter, comments, { censusList: singleCensus, q, sort, returnTo: safeReturnTo(ctx, `/audios?filter=${encodeURIComponent(filter)}`, ['/audios']), spreads: await spreads.forMessage(audio.key), authorPrefs: audioAuthorPrefs, mapData: await resolveMapUrl(audio.mapUrl) });
  })
  .get("/torrents", async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'recent', q = '', sort = 'recent', tribeId = '' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const fromBlob = typeof ctx.query.fromBlob === 'string' && ctx.query.fromBlob.startsWith('&') ? ctx.query.fromBlob : '';
    const fromName = typeof ctx.query.name === 'string' ? ctx.query.name.slice(0, 100) : '';
    const fromSize = fromBlob ? await blobSizeOf(fromBlob).catch(() => 0) : 0;
    if (filter === 'downloads') {
      const downloads = config.public ? [] : torrentDownloads.list();
      if (downloads.some(d => d.active)) ctx.set('Refresh', '5');
      ctx.body = await torrentsView([], 'downloads', null, { censusList: [], q, sort, viewerPrefs, downloads, isPublic: !!config.public });
      return;
    }
    const items = await torrentsModel.listAll({ filter: filter === 'favorites' || filter === 'downloads' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const tribeOpen = (await tribeItemsFor('media', 'torrent')).map(t => ({ ...t, url: (String(t.image || '').match(/&[^)\s]+\.sha256/) || [''])[0], size: 0, source: '' }));
    const tribeShown = ['recent', 'mine', 'all'].includes(filter) ? applyTextSearch(tribeOpen.filter(t => (filter !== 'mine' || t.author === getViewerId()) && (filter !== 'recent' || (Date.parse(t.createdAt) || 0) >= Date.now() - 86400000)), q, ['title', 'description', 'tags', 'author']) : [];
    const fav = await contentFavorites.getFavoriteSet('torrents');
    let enriched = [...items.filter(x => !x.tribeId), ...tribeShown].sort((a, b) => sort === 'top' ? 0 : sort === 'oldest' ? new Date(a.createdAt) - new Date(b.createdAt) : new Date(b.createdAt) - new Date(a.createdAt)).map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    if (recentFallback(ctx, enriched)) return;
    const bySeeds = filter === 'top' || sort === 'top';
    const spreadMap = await spreads.forMessages((bySeeds ? enriched : pageOf(ctx, enriched)).map(x => x && x.key));
    if (bySeeds) enriched = sortBySeeds(enriched, spreadMap);
    await warmAuthorNames(pageOf(ctx, enriched));
    const censusMedia = (String(filter) === 'all' && !q) ? enriched : (await censusOf(`torrents:${sort}`, () => torrentsModel.listAll({ filter: 'all', q: '', sort, viewerId: getViewerId() })).catch(() => [])).filter(x2 => !x2.tribeId).concat(tribeOpen).map(x2 => ({ ...x2, isFavorite: fav.has(String(x2.rootId || x2.key)) }));
    ctx.body = await torrentsView(enriched, filter, null, { censusList: censusMedia, q, sort, viewerPrefs, ...(tribeId ? { tribeId } : {}), spreadMap, fromBlob, fromName, fromSize, isPublic: !!config.public });
  })
  .get("/torrents/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    const torrent = await torrentsModel.getTorrentById(ctx.params.id, getViewerId());
    const fav = await contentFavorites.getFavoriteSet('torrents');
    if (torrent) torrent.clearnet = await clearnetPublic('torrents', torrent).catch(() => false);
    ctx.body = await torrentsView([{ ...torrent, isFavorite: fav.has(String(torrent.rootId || torrent.key)) }], 'edit', torrent.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/torrents/:torrentId/file", async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    const torrent = await torrentsModel.getTorrentById(ctx.params.torrentId, getViewerId()).catch(() => null);
    if (!torrent || !torrent.url) { ctx.redirect('/torrents'); return; }
    const torrentFile = `${String(torrent.title || 'download').replace(/\.torrent$/i, '')}.torrent`;
    if (torrent.cipher) { await sendDecryptedBlob(ctx, torrent.cipher, torrentFile, 'application/x-bittorrent'); return; }
    ctx.redirect(`/blob/${encodeURIComponent(torrent.url)}?name=${encodeURIComponent(torrentFile)}`);
  })
  .get("/torrents/:torrentId/get", async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    const torrent = await torrentsModel.getTorrentById(ctx.params.torrentId, getViewerId()).catch(() => null);
    if (!torrent) { ctx.redirect('/torrents'); return; }
    const torrentFile = `${String(torrent.title || 'download').replace(/\.torrent$/i, '')}.torrent`;
    if (!torrent.source || config.public) { ctx.redirect(`/blob/${encodeURIComponent(torrent.url)}?name=${encodeURIComponent(torrentFile)}`); return; }
    if (await torrentDownloads.hasLocal(torrent.source)) {
      ctx.redirect(`/blob/${encodeURIComponent(torrent.source)}?download=1&name=${encodeURIComponent(torrent.sourceName || torrent.title || 'download')}`);
      return;
    }
    confirmPage(ctx, { message: require('../views/main_views').i18n.confirmDownloadText, action: `/torrents/${encodeURIComponent(ctx.params.torrentId)}/fetch`, backHref: `/torrents/${encodeURIComponent(ctx.params.torrentId)}` });
  })
  .post("/torrents/:torrentId/fetch", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    const torrent = await torrentsModel.getTorrentById(ctx.params.torrentId, getViewerId()).catch(() => null);
    if (!torrent || !torrent.source) { ctx.redirect(`/torrents/${encodeURIComponent(ctx.params.torrentId)}`); return; }
    try { torrentDownloads.start({ blobId: torrent.source, size: torrent.size, name: torrent.sourceName || torrent.title, torrentKey: torrent.key }); } catch (_) {}
    ctx.redirect('/torrents?filter=downloads');
  })
  .post("/torrents/downloads/:blobId/cancel", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    try { torrentDownloads.cancel(ctx.params.blobId); } catch (_) {}
    ctx.redirect('/torrents?filter=downloads');
  })
  .post("/torrents/downloads/:blobId/remove", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    try { torrentDownloads.cancel(ctx.params.blobId); torrentDownloads.remove(ctx.params.blobId); } catch (_) {}
    ctx.redirect('/torrents?filter=downloads');
  })
  .get("/files", async (ctx) => {
    if (!checkMod(ctx, 'filesMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'recent', q = '', sort = 'recent', tribeId = '' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const items = await filesModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const fav = await contentFavorites.getFavoriteSet('files');
    let enriched = items.filter(x => !x.tribeId).map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    if (recentFallback(ctx, enriched)) return;
    const bySeeds = filter === 'top' || sort === 'top';
    const spreadMap = await spreads.forMessages((bySeeds ? enriched : pageOf(ctx, enriched)).map(x => x && x.key));
    if (bySeeds) enriched = sortBySeeds(enriched, spreadMap);
    await warmAuthorNames(pageOf(ctx, enriched));
    const censusMedia = (String(filter) === 'all' && !q) ? enriched : (await censusOf(`files:${sort}`, () => filesModel.listAll({ filter: 'all', q: '', sort, viewerId: getViewerId() })).catch(() => [])).filter(x2 => !x2.tribeId).map(x2 => ({ ...x2, isFavorite: fav.has(String(x2.rootId || x2.key)) }));
    ctx.body = await filesView(enriched, filter, null, { censusList: censusMedia, q, sort, viewerPrefs, ...(tribeId ? { tribeId } : {}), spreadMap, isPublic: !!config.public });
  })
  .get("/files/:fileId/get", async (ctx) => {
    if (!checkMod(ctx, 'filesMod')) { ctx.redirect('/modules'); return; }
    const file = await filesModel.getFileById(ctx.params.fileId, getViewerId()).catch(() => null);
    if (!file || !file.url) { ctx.redirect('/files'); return; }
    const name = file.fileName || file.title || 'download';
    if (file.cipher) { await sendDecryptedBlob(ctx, file.cipher, name, file.mime); return; }
    const direct = `/blob/${encodeURIComponent(file.url)}?download=1&name=${encodeURIComponent(name)}`;
    if (config.public || getConfig().modules?.torrentsMod !== 'on' || await torrentDownloads.hasLocal(file.url)) { ctx.redirect(direct); return; }
    confirmPage(ctx, { message: require('../views/main_views').i18n.confirmDownloadText, action: `/files/${encodeURIComponent(ctx.params.fileId)}/fetch`, backHref: `/files/${encodeURIComponent(ctx.params.fileId)}` });
  })
  .post("/files/:fileId/fetch", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'filesMod')) { ctx.redirect('/modules'); return; }
    const file = await filesModel.getFileById(ctx.params.fileId, getViewerId()).catch(() => null);
    if (!file || !file.url || file.cipher || config.public || getConfig().modules?.torrentsMod !== 'on') { ctx.redirect(`/files/${encodeURIComponent(ctx.params.fileId)}`); return; }
    const name = file.fileName || file.title || 'download';
    try { torrentDownloads.start({ blobId: file.url, size: file.size, name, torrentKey: file.torrentKey || '' }); } catch (_) {}
    ctx.redirect('/torrents?filter=downloads');
  })
  .get("/files/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'filesMod')) { ctx.redirect('/modules'); return; }
    const file = await filesModel.getFileById(ctx.params.id, getViewerId());
    const fav = await contentFavorites.getFavoriteSet('files');
    if (file) file.clearnet = await clearnetPublic('files', file).catch(() => false);
    ctx.body = await filesView([{ ...file, isFavorite: fav.has(String(file.rootId || file.key)) }], 'edit', file.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/files/:fileId", async (ctx) => {
    if (!checkMod(ctx, 'filesMod')) { ctx.redirect('/modules'); return; }
    const { fileId } = ctx.params; const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const file = await filesModel.getFileById(fileId, getViewerId());
    const fav = await contentFavorites.getFavoriteSet('files');
    const comments = await getVoteComments(file.key);
    const fileAuthorPrefs = await about.visibilityPrefs(file.author).catch(() => null);
    await enrichItemLifetime(file, { key: file.key });
    const singleCensus = (await censusOf(`files:${String(ctx.query.sort || 'recent')}`, () => filesModel.listAll({ filter: 'all', q: '', sort: String(ctx.query.sort || 'recent'), viewerId: getViewerId() })).catch(() => [])).map(x2 => ({ ...x2, isFavorite: fav.has(String(x2.rootId || x2.key)) }));
    if (file) file.clearnet = await clearnetPublic('files', file).catch(() => false);
    ctx.body = await singleFileView({ ...file, isFavorite: fav.has(String(file.rootId || file.key)), commentCount: comments.length }, filter, comments, { censusList: singleCensus, q, sort, returnTo: safeReturnTo(ctx, `/files?filter=${encodeURIComponent(filter)}`, ['/files']), authorPrefs: fileAuthorPrefs, spreads: await spreads.forMessage(file.key).catch(() => null), isPublic: !!config.public });
  })
  .get("/torrents/:torrentId", async (ctx) => {
    if (!checkMod(ctx, 'torrentsMod')) { ctx.redirect('/modules'); return; }
    const { torrentId } = ctx.params; const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const torrent = await torrentsModel.getTorrentById(torrentId, getViewerId());
    const fav = await contentFavorites.getFavoriteSet('torrents');
    const comments = await getVoteComments(torrent.key);
    const torrentAuthorPrefs = await about.visibilityPrefs(torrent.author).catch(() => null);
    await enrichItemLifetime(torrent, { key: torrent.key });
    const singleFav = await contentFavorites.getFavoriteSet('torrents');
    const singleCensus = (await censusOf(`torrents:${String(ctx.query.sort || 'recent')}`, () => torrentsModel.listAll({ filter: 'all', q: '', sort: String(ctx.query.sort || 'recent'), viewerId: getViewerId() })).catch(() => [])).map(x2 => ({ ...x2, isFavorite: (singleFav).has(String(x2.rootId || x2.key)) }));
    if (torrent) torrent.clearnet = await clearnetPublic('torrents', torrent).catch(() => false);
    ctx.body = await singleTorrentView({ ...torrent, isFavorite: fav.has(String(torrent.rootId || torrent.key)), commentCount: comments.length }, filter, comments, { censusList: singleCensus, q, sort, returnTo: safeReturnTo(ctx, `/torrents?filter=${encodeURIComponent(filter)}`, ['/torrents']), spreads: await spreads.forMessage(torrent.key), authorPrefs: torrentAuthorPrefs , download: torrent.source ? torrentDownloads.get(torrent.source) : null, hasLocal: torrent.source ? await torrentDownloads.hasLocal(torrent.source) : false, isPublic: !!config.public });
  })
  .get("/videos", async (ctx) => {
    if (!checkMod(ctx, 'videosMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'recent', q = '', sort = 'recent' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const items = await videosModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const tribeOpen = (await tribeItemsFor('media', 'video')).map(t => ({ ...t, url: (String(t.image || '').match(/&[^)\s]+\.sha256/) || [''])[0] }));
    const tribeShown = ['recent', 'mine', 'all'].includes(filter) ? applyTextSearch(tribeOpen.filter(t => (filter !== 'mine' || t.author === getViewerId()) && (filter !== 'recent' || (Date.parse(t.createdAt) || 0) >= Date.now() - 86400000)), q, ['title', 'description', 'tags', 'author']) : [];
    const fav = await contentFavorites.getFavoriteSet('videos');
    let enriched = [...items, ...tribeShown].sort((a, b) => sort === 'top' ? 0 : sort === 'oldest' ? new Date(a.createdAt) - new Date(b.createdAt) : new Date(b.createdAt) - new Date(a.createdAt)).map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    if (recentFallback(ctx, enriched)) return;
    await enrichWithComments(enriched, 'key');
    const spreadMap = await spreads.forMessages(pageOf(ctx, enriched).map(x => x && x.key));
    await warmAuthorNames(pageOf(ctx, enriched));
    const censusMedia = (String(filter) === 'all' && !q) ? enriched : (await censusOf(`videos:${sort}`, () => videosModel.listAll({ filter: 'all', q: '', sort, viewerId: getViewerId() })).catch(() => [])).concat(tribeOpen).map(x2 => ({ ...x2, isFavorite: fav.has(String(x2.rootId || x2.key)) }));
    ctx.body = await videoView(enriched, filter, null, { censusList: censusMedia, q, sort, viewerPrefs, spreadMap });
  })
  .get("/videos/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'videosMod')) { ctx.redirect('/modules'); return; }
    const video = await videosModel.getVideoById(ctx.params.id, getViewerId());
    const fav = await contentFavorites.getFavoriteSet('videos');
    if (video) video.clearnet = await clearnetPublic('videos', video).catch(() => false);
    ctx.body = await videoView([{ ...video, isFavorite: fav.has(String(video.rootId || video.key)) }], 'edit', video.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/videos/:videoId", async (ctx) => {
    if (!checkMod(ctx, 'videosMod')) { ctx.redirect('/modules'); return; }
    const { videoId } = ctx.params; const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const video = await videosModel.getVideoById(videoId, getViewerId());
    const fav = await contentFavorites.getFavoriteSet('videos');
    const comments = await getVoteComments(video.key);
    const videoAuthorPrefs = await about.visibilityPrefs(video.author).catch(() => null);
    await enrichItemLifetime(video, { key: video.key });
    const singleFav = await contentFavorites.getFavoriteSet('videos');
    const singleCensus = (await censusOf(`videos:${String(ctx.query.sort || 'recent')}`, () => videosModel.listAll({ filter: 'all', q: '', sort: String(ctx.query.sort || 'recent'), viewerId: getViewerId() })).catch(() => [])).map(x2 => ({ ...x2, isFavorite: (singleFav).has(String(x2.rootId || x2.key)) }));
    if (video) video.clearnet = await clearnetPublic('videos', video).catch(() => false);
    ctx.body = await singleVideoView({ ...video, isFavorite: fav.has(String(video.rootId || video.key)), commentCount: comments.length }, filter, comments, { censusList: singleCensus, q, sort, returnTo: safeReturnTo(ctx, `/videos?filter=${encodeURIComponent(filter)}`, ['/videos']), spreads: await spreads.forMessage(video.key), authorPrefs: videoAuthorPrefs, mapData: await resolveMapUrl(video.mapUrl) });
  })
  .get("/documents", async (ctx) => {
    const { filter = 'recent', q = '', sort = 'recent' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const items = await documentsModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort });
    const tribeOpen = (await tribeItemsFor('media', 'document')).map(t => ({ ...t, url: (String(t.image || '').match(/&[^)\s]+\.sha256/) || [''])[0] }));
    const tribeShown = ['recent', 'mine', 'all'].includes(filter) ? applyTextSearch(tribeOpen.filter(t => (filter !== 'mine' || t.author === getViewerId()) && (filter !== 'recent' || (Date.parse(t.createdAt) || 0) >= Date.now() - 86400000)), q, ['title', 'description', 'url', 'tags', 'author']) : [];
    const fav = await contentFavorites.getFavoriteSet('documents');
    let enriched = [...items, ...tribeShown].sort((a, b) => sort === 'top' ? 0 : sort === 'oldest' ? new Date(a.createdAt) - new Date(b.createdAt) : new Date(b.createdAt) - new Date(a.createdAt)).map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    if (recentFallback(ctx, enriched)) return;
    await enrichWithComments(enriched, 'rootId');
    const spreadMap = await spreads.forMessages(pageOf(ctx, enriched).map(x => x && x.key));
    await warmAuthorNames(pageOf(ctx, enriched));
    const censusMedia = (String(filter) === 'all' && !q) ? enriched : (await censusOf(`documents:${sort}`, () => documentsModel.listAll({ filter: 'all', q: '', sort, viewerId: getViewerId() })).catch(() => [])).concat(tribeOpen).map(x2 => ({ ...x2, isFavorite: fav.has(String(x2.rootId || x2.key)) }));
    ctx.body = await documentView(enriched, filter, null, { censusList: censusMedia, q, sort, viewerPrefs, spreadMap });
  })
  .get("/documents/edit/:id", async (ctx) => {
    const doc = await documentsModel.getDocumentById(ctx.params.id);
    const fav = await contentFavorites.getFavoriteSet('documents');
    if (doc) doc.clearnet = await clearnetPublic('documents', doc).catch(() => false);
    ctx.body = await documentView([{ ...doc, isFavorite: fav.has(String(doc.rootId || doc.key)) }], 'edit', doc.key, { returnTo: ctx.query.returnTo || '' });
  })
  .get("/documents/:documentId", async (ctx) => {
    const { filter = "all", q = "", sort = "recent" } = ctx.query;
    const document = await documentsModel.getDocumentById(ctx.params.documentId);
    const fav = await contentFavorites.getFavoriteSet('documents');
    Object.assign(document, { isFavorite: fav.has(String(document.rootId || document.key)) });
    const comments = await getVoteComments(document.rootId || document.key);
    const docAuthorPrefs = await about.visibilityPrefs(document.author).catch(() => null);
    await enrichItemLifetime(document, { key: document.key });
    const singleFav = fav;
    const singleCensus = (await censusOf(`documents:${sort}`, () => documentsModel.listAll({ filter: 'all', q: '', sort, viewerId: getViewerId() })).catch(() => [])).map(x2 => ({ ...x2, isFavorite: singleFav.has(String(x2.rootId || x2.key)) }));
    if (document) document.clearnet = await clearnetPublic('documents', document).catch(() => false);
    ctx.body = await singleDocumentView(withCount(document, comments), filter, comments, {
      censusList: singleCensus,
      q, sort,
      returnTo: safeReturnTo(ctx, `/documents/${encodeURIComponent(document.key)}?filter=${encodeURIComponent(filter)}${q ? `&q=${encodeURIComponent(q)}` : ""}${sort ? `&sort=${encodeURIComponent(sort)}` : ""}`, ["/documents"]),
      spreads: await spreads.forMessage(document.key),
      authorPrefs: docAuthorPrefs
    });
  })
  .get('/cv', async ctx => {
    const cv = await cvModel.getCVByUserId()
    const certificates = checkMod(ctx, 'schoolMod') ? await schoolModel.listCertificatesForStudent(getViewerId()).catch(() => []) : []
    ctx.body = await cvView(cv, certificates)
  })
  .get('/cv/create', async ctx => {
    ctx.body = await createCVView()
  })
  .get('/cv/edit/:id', async ctx => {
    const cv = await cvModel.getCVByUserId()
    ctx.body = await createCVView(cv, true)
  })
  .get('/pm', async ctx => {
    const { recipients = '', subject = '', quote = '', preview = '', list = '' } = ctx.query;
    const quoted = quote ? quote.split('\n').map(l => '> ' + l).join('\n') + '\n\n' : '';
    const showPreview = preview === '1';
    const lists = await buildMyMailingLists().catch(() => []);
    const listEntry = resolveListSelection(lists, list);
    ctx.body = await pmView(recipients, subject, quoted, showPreview, '', false, null, false, '', null, { lists, selectedList: listEntry ? listEntry.target : '' });
  })
  .post('/subscriptions/toggle', koaBody(), async ctx => {
    const b = ctx.request.body || {};
    const target = String(b.target || '').trim();
    const scope = String(b.scope || '').trim();
    const on = String(b.on || '1') === '1';
    if (on && scope === 'tribes') {
      try {
        const viewer = getViewerId();
        const t = (await tribesModel.listAll()).find(x => x.id === target);
        const isIn = t && ((Array.isArray(t.members) && t.members.includes(viewer)) || String(t.author) === String(viewer));
        if (!isIn) { ctx.throw(403, 'Only members can subscribe'); return; }
      } catch (e) { if (e.status === 403) throw e; }
    }
    if (on && scope === 'school') {
      try {
        const viewer = getViewerId();
        const c = (await schoolModel.listCourses()).find(x => (x.rootId || x.id) === target);
        const isIn = c && (String(c.author) === String(viewer) || (Array.isArray(c.students) && c.students.includes(viewer)));
        if (!isIn) { ctx.throw(403, 'Only students can subscribe'); return; }
      } catch (e) { if (e.status === 403) throw e; }
    }
    if (on && SPACE_SCOPES[scope] && !SPACE_SCOPES[scope].broadcast) {
      try {
        const viewer = getViewerId();
        const entity = await findSpaceEntity(scope, target);
        if (!entity || !viewerSharesSpace(scope, entity, viewer)) { ctx.throw(403, 'Only members of this space can subscribe'); return; }
      } catch (e) { if (e.status === 403) throw e; }
    }
    try { await subscriptionsModel.setSubscription(target, scope, on); } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); return; }
    ctx.redirect(safeReturnTo(ctx, '/', ['/school', '/tribe', '/blogs', '/pm', '/']));
  })
  .get('/phone', async (ctx) => {
    if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; }
    const q = String(ctx.query.q || '').trim();
    const filter = PHONE_FILTERS.includes(String(ctx.query.filter || '')) ? String(ctx.query.filter) : 'all';
    const available = await phoneModel.available().catch(() => false);
    const state = await phoneModel.state().catch(() => null);
    await phoneModel.refreshPubs().catch(() => null);
    const pams = await phoneModel.pams().catch(() => []);
    const history = phoneModel.history();
    phoneModel.markMissedSeen();
    ctx.body = await phoneView({
      available, state, pams, history, q, filter,
      refused: String(ctx.query.refused || '').split(',').filter(id => /^@[A-Za-z0-9+/]{43}=\.ed25519$/.test(id)).slice(0, PHONE_GROUP_MAX),
      latest: await Promise.all(phoneModel.latestCalls(history).map(async c => ({ ...c, dnd: await phoneRefuses(c.id).catch(() => false) }))),
      compose: await (async () => {
        const t = require('../views/main_views').i18n;
        const recipients = String(ctx.query.to || '').slice(0, 511).split(/[,\n]+/).map(x => x.trim()).filter(Boolean).slice(0, PHONE_GROUP_MAX);
        let dial = String(ctx.query.dial || '').trim().slice(0, 64);
        const key = String(ctx.query.key || '');
        if (/^[0-9]$/.test(key)) dial = (dial + key).slice(0, 64);
        else if (key === 'back') dial = dial.slice(0, -1);
        else if (key === 'clear') dial = '';
        else if (/^remove:\d+$/.test(key)) recipients.splice(Number(key.slice(7)), 1);
        else if (key === 'add' && dial) {
          const asNumber = phoneNumbers.normalizeNumber(dial);
          const asId = /^@[A-Za-z0-9+/]{43}=\.ed25519$/.test(dial) ? dial : null;
          const me = getViewerId();
          if (!asNumber && !asId) ctx.state.inlineError = t.pmInvalidRecipients;
          else if (asId === me || (asNumber && asNumber === phoneNumbers.phoneNumberOf(me))) ctx.state.inlineError = t.phoneOwnNumber;
          else if (recipients.length >= PHONE_GROUP_MAX) ctx.state.inlineError = t.phoneLimitsHint;
          else { const v = asNumber || asId; if (!recipients.includes(v)) recipients.push(v); dial = ''; }
        }
        const to = recipients.join(',');
        const choose = String(ctx.query.choose || '') === '1';
        const number = phoneNumbers.normalizeNumber(ctx.query.number) || '';
        const compose = { to, recipients, dial, max: PHONE_GROUP_MAX, choose, number };
        if (choose && number) {
          const token = to.split(/[,\n]+/).map(t => t.trim()).find(t => phoneNumbers.normalizeNumber(t) === number) || number;
          const known = await phoneModel.knownFeeds().catch(() => new Map());
          compose.candidates = await Promise.all(phoneNumbers.resolveNumber(number, known).map(async m => ({ ...m, to: to.includes(token) ? to.replace(token, m.id) : m.id, dnd: await phoneRefuses(m.id).catch(() => false) })));
          if (checkMod(ctx, 'roomsMod')) compose.rooms = (await roomsModel.findByNumber(number).catch(() => [])).filter(r => r.line === 'SWITCHBOARD').map(r => ({ id: r.rootId, title: r.title }));
        }
        return compose;
      })()
    });
  })
  .post('/phone/call', koaBody(), async (ctx) => {
    if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; }
    const raw = [ctx.request.body.to, ctx.request.body.dial].map(v => String(v || '').trim()).filter(Boolean).join(',').slice(0, 511);
    const fromForm = String(ctx.request.body.compose || '') === '1';
    const t = require('../views/main_views').i18n;
    const PHONE_ERRORS = { invalid: t.pmInvalidRecipients, max: t.phoneLimitsHint, pub: t.phoneErrorPub, busy: t.roomErrorBusy, unavailable: t.phoneUnavailable, self: t.phoneOwnNumber, roomDnd: t.roomLineDndError, refuses: t.phoneRecipientRefuses, nobody: t.roomNobodyInside };
    const me = (await cooler.open()).id;
    const tokens = raw.split(/[,\n]+/).map(t => t.trim()).filter(Boolean).flatMap(t => phoneNumbers.normalizeNumber(t) ? [t] : t.split(/\s+/));
    const typed = new Map();
    const back = (err, number = '', bad = []) => {
      if (err === 'chooseNumber') { ctx.redirect(`/phone?filter=create&choose=1&to=${encodeURIComponent(raw)}&number=${encodeURIComponent(number)}`); return; }
      const message = err === 'unknownNumber' ? String(t.phoneNumberUnknown || '').replace('{number}', number) : (PHONE_ERRORS[err] || t.actionFailed);
      const badTokens = bad.map(x => typed.get(x) || x);
      const rest = tokens.filter(x => !badTokens.includes(x)).join(',');
      sendErrorPage(ctx, message, fromForm ? { status: 400, exact: true, to: '/phone?filter=create', keep: { to: rest, dial: badTokens[0] || '' } } : { status: 400, exact: true });
    };
    const picked = [];
    let known = null;
    for (const t of tokens) {
      const number = phoneNumbers.normalizeNumber(t);
      if (!number) { picked.push(t); continue; }
      if (number === phoneNumbers.phoneNumberOf(me)) return back('self', number, [t]);
      known = known || await phoneModel.knownFeeds().catch(() => new Map());
      const matches = phoneNumbers.resolveNumber(number, known);
      const found = checkMod(ctx, 'roomsMod') ? await roomsModel.findByNumber(number).catch(() => []) : [];
      const rooms = found.filter(r => r.line === 'SWITCHBOARD');
      if (!matches.length && !rooms.length && found.length) return back('roomDnd', number, [t]);
      if (!matches.length && rooms.length === 1 && tokens.length === 1) {
        const live = await roomsModel.liveState().catch(() => null);
        if (live && live.ref === rooms[0].rootId) { ctx.redirect(`/rooms/${encodeURIComponent(rooms[0].rootId)}`); return; }
        const occ = await roomsModel.occupancy(rooms[0]).catch(() => null);
        if (occ && Number(occ.count) === 0) { sendErrorPage(ctx, PHONE_ERRORS.nobody, { status: 400 }); return; }
        const error = await enterRoom(rooms[0]);
        await syncRoomBanner();
        if (error) { sendErrorPage(ctx, roomErrorMessage(error), { status: 400 }); return; }
        ctx.redirect(`/rooms/${encodeURIComponent(rooms[0].rootId)}`);
        return;
      }
      if (!matches.length && !rooms.length) return back('unknownNumber', number, [t]);
      if (matches.length === 1 && !rooms.length) { picked.push(matches[0].id); typed.set(matches[0].id, t); continue; }
      return back('chooseNumber', number);
    }
    const ids = [...new Set(picked)];
    if (ids.includes(me)) return back('self', '', [me]);
    const badIds = ids.filter(id => !/^@[A-Za-z0-9+/]{43}=\.ed25519$/.test(id));
    if (!ids.length || badIds.length) return back('invalid', '', badIds);
    if (ids.length > PHONE_GROUP_MAX) return back('max');
    const refusing = [];
    for (const id of ids) if (await phoneRefuses(id)) refusing.push(id);
    const callable = ids.filter(id => !refusing.includes(id));
    if (!callable.length) return back('refuses', '', refusing);
    try {
      const legacy = [];
      for (const id of callable) if (!versionAtLeast(await getOasisVersion(id), PHONE_ACK_VERSION)) legacy.push(id);
      await phoneModel.call(callable.length === 1 ? callable[0] : callable, { legacy });
    } catch (err) {
      const code = String((err && err.message) || '');
      return back(code, '', code === 'pub' ? callable.filter(id => phoneModel.isPub(id)) : []);
    }
    ctx.redirect(refusing.length ? `/phone?refused=${encodeURIComponent(refusing.join(','))}` : '/phone');
  })
  .post('/phone/dnd', koaBody(), async (ctx) => {
    if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; }
    const cfg = getConfig();
    cfg.phone = { ...(cfg.phone || {}), dnd: String((ctx.request.body || {}).dnd) === '1' };
    saveConfig(cfg);
    try { await syncPhoneVisibility(); } catch (_) {}
    safeRefererRedirect(ctx, '/profile');
  })
  .post('/phone/heard-all', koaBody(), async (ctx) => {
    if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; }
    phoneModel.markAllHeard(pickMsgKeys((ctx.request.body || {}).keys));
    safeRefererRedirect(ctx, '/phone');
  })
  .post('/phone/delete-shown', koaBody(), async (ctx) => {
    if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; }
    const body = ctx.request.body || {};
    for (const k of pickMsgKeys(body.keys)) { try { await phoneModel.deletePam(k); } catch (_) {} }
    const calls = (Array.isArray(body.calls) ? body.calls : (body.calls ? [body.calls] : [])).map(String).filter(id => /^[0-9a-f]{32}$/.test(id));
    phoneModel.deleteHistory(calls);
    phoneModel.refreshCount().catch(() => {});
    safeRefererRedirect(ctx, '/phone');
  })
  .post('/phone/accept', koaBody(), async (ctx) => { if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; } await phoneModel.accept().catch(() => null); ctx.redirect('/phone'); })
  .post('/phone/reject', koaBody(), async (ctx) => { if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; } await phoneModel.reject().catch(() => null); safeRefererRedirect(ctx, '/phone'); })
  .post('/phone/hangup', koaBody(), async (ctx) => { if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; } await phoneModel.hangup().catch(() => null); safeRefererRedirect(ctx, '/phone'); })
  .post('/phone/mute', koaBody(), async (ctx) => { if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; } await phoneModel.mute(String(ctx.request.body.mute) === '1').catch(() => null); safeRefererRedirect(ctx, '/phone'); })
  .post('/phone/silence', koaBody(), async (ctx) => { if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; } await phoneModel.silence(String(ctx.request.body.id || ''), String(ctx.request.body.on) === '1').catch(() => null); safeRefererRedirect(ctx, '/phone'); })
  .post('/phone/dismiss', koaBody(), async (ctx) => { if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; } await phoneModel.dismiss().catch(() => null); ctx.redirect('/phone'); })
  .post('/phone/pam/cancel', koaBody(), async (ctx) => { if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; } await phoneModel.recordCancel().catch(() => null); safeRefererRedirect(ctx, '/phone'); })
  .post('/phone/pam/send', koaBody(), async (ctx) => {
    if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; }
    await phoneModel.sendPam().catch(() => null);
    safeRefererRedirect(ctx, '/phone');
  })
  .get('/phone/pam/:key/audio', async (ctx) => {
    if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.status = 404; ctx.body = ''; return; }
    const cipher = await phoneModel.pamCipher(ctx.params.key).catch(() => null);
    if (!cipher) { ctx.status = 404; ctx.body = ''; return; }
    const pointer = pamPointer(cipher);
    if (!(await fileshareModel.isAvailable(pointer).catch(() => false))) { fileshareModel.prefetch(pointer).catch(() => {}); ctx.status = 404; ctx.body = ''; return; }
    const buffer = await fileshareModel.reassembleToBuffer(pointer).catch(() => null);
    if (!buffer || !buffer.length) { ctx.status = 404; ctx.body = ''; return; }
    const size = buffer.length;
    let start = 0, end = size - 1;
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(ctx.get('Range') || ''));
    if (range && (range[1] || range[2])) {
      if (range[1]) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1; }
      else { start = Math.max(0, size - Number(range[2])); }
      if (!(start >= 0 && start <= end && end < size)) { ctx.status = 416; ctx.set('Content-Range', `bytes */${size}`); ctx.body = ''; return; }
      ctx.status = 206;
      ctx.set('Content-Range', `bytes ${start}-${end}/${size}`);
    }
    ctx.type = 'audio/wav';
    ctx.set('Accept-Ranges', 'bytes');
    ctx.set('Cache-Control', 'private, no-store');
    ctx.length = end - start + 1;
    const key = ctx.params.key;
    if (end === size - 1) ctx.res.once('finish', () => { try { phoneModel.markHeard(key); } catch (_) {} });
    ctx.body = buffer.subarray(start, end + 1);
  })
  .post('/phone/pam/:key/delete', koaBody(), async (ctx) => { if (config.public || !checkMod(ctx, 'phoneMod')) { ctx.redirect('/modules'); return; } await phoneModel.deletePam(ctx.params.key).catch(() => null); ctx.redirect('/phone'); })
  .get('/inbox', async ctx => {
    if (!checkMod(ctx, 'inboxMod')) { ctx.redirect('/modules'); return; }
    const messages = await buildInboxMessages();
    await refreshInboxCount(messages);
    const listTitles = await inboxListTitles(messages);
    ctx.body = await privateView({
      messages,
      listTitles,
      readKeys: Array.from(pmModel.readKeys()),
      archivedKeys: Array.from(pmModel.archivedKeys()),
      mutedBots: Array.from(pmModel.mutedBots(getConfig())),
      bot: String(ctx.query.bot || ''),
      sort: String(ctx.query.sort || '')
    }, ctx.query.filter || undefined, null, '', String(ctx.query.q || ''));
  })
  .post('/inbox/read/:key', koaBody(), async ctx => {
    if (!checkMod(ctx, 'inboxMod')) { ctx.redirect('/modules'); return; }
    if (!isMsgKey(ctx.params.key)) { ctx.throw(400, 'Invalid message key'); return; }
    pmModel.markRead(ctx.params.key);
    try { await refreshInboxCount(); } catch (_) {}
    safeRefererRedirect(ctx, '/inbox');
  })
  .post('/inbox/unread/:key', koaBody(), async ctx => {
    if (!checkMod(ctx, 'inboxMod')) { ctx.redirect('/modules'); return; }
    if (!isMsgKey(ctx.params.key)) { ctx.throw(400, 'Invalid message key'); return; }
    pmModel.markUnread(ctx.params.key);
    try { await refreshInboxCount(); } catch (_) {}
    safeRefererRedirect(ctx, '/inbox');
  })
  .post('/inbox/read-all', koaBody(), async ctx => {
    if (!checkMod(ctx, 'inboxMod')) { ctx.redirect('/modules'); return; }
    pmModel.markReadMany(pickMsgKeys((ctx.request.body || {}).keys));
    try { await refreshInboxCount(); } catch (_) {}
    safeRefererRedirect(ctx, '/inbox');
  })
  .post('/inbox/archive/:key', koaBody(), async ctx => {
    if (!checkMod(ctx, 'inboxMod')) { ctx.redirect('/modules'); return; }
    if (!isMsgKey(ctx.params.key)) { ctx.throw(400, 'Invalid message key'); return; }
    pmModel.archive(ctx.params.key);
    try { await refreshInboxCount(); } catch (_) {}
    safeRefererRedirect(ctx, '/inbox');
  })
  .post('/inbox/unarchive/:key', koaBody(), async ctx => {
    if (!checkMod(ctx, 'inboxMod')) { ctx.redirect('/modules'); return; }
    if (!isMsgKey(ctx.params.key)) { ctx.throw(400, 'Invalid message key'); return; }
    pmModel.unarchive(ctx.params.key);
    try { await refreshInboxCount(); } catch (_) {}
    safeRefererRedirect(ctx, '/inbox');
  })
  .post('/inbox/delete-many', koaBody(), async ctx => {
    if (!checkMod(ctx, 'inboxMod')) { ctx.redirect('/modules'); return; }
    const keys = pickMsgKeys((ctx.request.body || {}).keys);
    for (const k of keys) { try { await pmModel.deleteMessageById(k); } catch (_) {} }
    try { await refreshInboxCount(); } catch (_) {}
    safeRefererRedirect(ctx, '/inbox');
  })
  .post('/inbox/decrypt', koaBody(), async ctx => {
    if (!checkMod(ctx, 'inboxMod')) { ctx.redirect('/modules'); return; }
    const { id, key, returnFilter } = ctx.request.body;
    const messages = await buildInboxMessages();
    let decrypted = null;
    const msg = messages.find(m => m && m.key === id);
    if (msg && msg.value?.content?.crypter && typeof key === 'string' && key) {
      try {
        decrypted = { key: id, text: cipherModel.decryptData(msg.value.content.text, key) };
      } catch (_) {
        decrypted = null;
        ctx.state.inlineError = require('../views/main_views').i18n.pmCrypterBadKey;
      }
    }
    ctx.body = await privateView({ messages, listTitles: await inboxListTitles(messages) }, returnFilter || 'all', decrypted);
  })
  .get('/tags', async ctx => {
    const filter = qf(ctx, 'recent'), search = String(ctx.query.search || '').trim();
    const tags = await tagsModel.listTags(filter, search);
    if (recentFallback(ctx, tags)) return;
    ctx.body = await tagsView(tags, filter, search);
  })
  .get('/emergencies', async ctx => {
    if (!checkMod(ctx, 'emergenciesMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || 'RECENT').toUpperCase();
    const q = String(ctx.query.q || '').trim();
    const uid = getViewerId();
    const favEmergencies = await contentFavorites.getFavoriteSet('emergencies');
    const decorate = (list) => list.map(x => ({ ...x, isFavorite: favEmergencies.has(String(x.id)) }));
    const censusList = decorate(await censusOf('emergencies', () => emergenciesModel.listAll({ filter: 'all', q: '', viewerId: uid }), filter === 'ALL' && !q).catch(() => []));
    if (filter === 'CREATE') { ctx.body = await emergenciesView([], 'CREATE', { q, censusList }); return; }
    if (filter === 'EDIT') {
      const emergency = await emergenciesModel.getEmergencyById(String(ctx.query.id || ''));
      if (!emergency || String(emergency.author) !== String(uid) || (emergency.confirmationCount || 0) > 0) { ctx.redirect('/emergencies'); return; }
      emergency.clearnet = await clearnetPublic('emergencies', emergency).catch(() => false);
      ctx.body = await emergenciesView([], 'EDIT', { q, censusList, emergency });
      return;
    }
    const emergencies = (filter === 'ALL' && !q) ? censusList : decorate(await emergenciesModel.listAll({ filter, q, viewerId: uid }));
    if (recentFallback(ctx, await applyWishScope(emergencies), 'ALL')) return;
    const shownList = await applyWishScope(emergencies);
    const spreadMap = await spreads.forMessages(pageOf(ctx, shownList).map(x => x && x.id));
    await warmAuthorNames(pageOf(ctx, shownList));
    await annotateClearnet('emergencies', emergencies);
    ctx.body = await emergenciesView(shownList, filter, { q, censusList, spreadMap });
  })
  .get('/emergencies/:id/pdf', async ctx => sendContentPdf(ctx, 'emergencies', ctx.params.id))
  .post('/emergencies/:id/share', koaBody(), async ctx => sharePdfAsPm(ctx, 'emergencies', ctx.params.id))
  .get('/emergencies/:id', async ctx => {
    if (!checkMod(ctx, 'emergenciesMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const emergency = await emergenciesModel.getEmergencyById(ctx.params.id);
    if (!emergency) { ctx.redirect('/emergencies'); return; }
    emergency.isFavorite = (await contentFavorites.getFavoriteSet('emergencies')).has(String(emergency.id));
    const comments = await getVoteComments(emergency.id);
    const censusList = await censusOf('emergencies', () => emergenciesModel.listAll({ filter: 'all', q: '', viewerId: uid })).catch(() => []);
    const subscription = await subscriptionStateFor(emergency.id, String(emergency.author) === String(uid)).catch(() => null);
    await warmAuthorNames([emergency, ...emergency.updates, ...comments]);
    emergency.clearnet = await clearnetPublic('emergencies', emergency).catch(() => false);
    ctx.body = await singleEmergencyView(emergency, { comments, censusList, subscription, editUpdate: String(ctx.query.editUpdate || ''), spread: await spreads.forMessage(emergency.id).catch(() => null), mapData: await resolveMapUrl(emergency.mapUrl) });
  })
  .get('/mailing', async ctx => {
    if (!checkMod(ctx, 'mailingMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || 'RECENT').toUpperCase();
    const q = String(ctx.query.q || '').trim();
    const uid = getViewerId();
    const favLists = await contentFavorites.getFavoriteSet('mailing');
    const decorate = (list) => list.map(x => ({ ...x, isFavorite: favLists.has(String(x.id)) }));
    const censusList = decorate(await censusOf('mailing', () => mailingModel.listAll({ filter: 'all', q: '' }), filter === 'ALL' && !q).catch(() => []));
    if (filter === 'CREATE') { ctx.body = await mailingView([], 'CREATE', { q, censusList }); return; }
    if (filter === 'EDIT') {
      const list = await mailingModel.getListById(String(ctx.query.id || ''));
      if (!list || String(list.author) !== String(uid)) { ctx.redirect('/mailing'); return; }
      ctx.body = await mailingView([], 'EDIT', { q, censusList, list });
      return;
    }
    const lists = (filter === 'ALL' && !q) ? censusList : decorate(await mailingModel.listAll({ filter, q }));
    if (recentFallback(ctx, await applyWishScope(lists), 'ALL')) return;
    const shownList = await applyWishScope(lists);
    const spreadMap = await spreads.forMessages(pageOf(ctx, shownList.slice().sort((x, y) => (y.lastActivityTs || 0) - (x.lastActivityTs || 0))).map(x => x && x.id).filter(id => typeof id === 'string' && id.startsWith('%')));
    await warmAuthorNames(pageOf(ctx, shownList.slice().sort((x, y) => (y.lastActivityTs || 0) - (x.lastActivityTs || 0))));
    ctx.body = await mailingView(shownList, filter, { q, censusList, spreadMap });
  })
  .get('/mailing/:id', async ctx => {
    if (!checkMod(ctx, 'mailingMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const list = await mailingModel.getListById(ctx.params.id);
    if (!list) { ctx.redirect('/mailing'); return; }
    list.isFavorite = (await contentFavorites.getFavoriteSet('mailing')).has(String(list.id));
    const censusList = await censusOf('mailing', () => mailingModel.listAll({ filter: 'all', q: '' })).catch(() => []);
    const subscription = list.closed ? null : await subscriptionStateFor(list.id, String(list.author) === String(uid)).catch(() => null);
    await warmAuthorNames([list, ...(list.participants || []).map(id => ({ author: id })), ...(list.history || [])]);
    const spread = String(list.id).startsWith('%') ? await spreads.forMessage(list.id).catch(() => null) : null;
    ctx.body = await singleMailingView(list, {
      censusList, subscription, spread,
      write: String(ctx.query.write || '') === '1',
      replyTo: String(ctx.query.reply || ''),
      history: String(ctx.query.history || ''),
      q: String(ctx.query.q || ''),
      returnTo: String(ctx.query.returnTo || '')
    });
  })
  .get('/logistics', async ctx => {
    if (!checkMod(ctx, 'logisticsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || 'RECENT').toUpperCase();
    const q = String(ctx.query.q || '').trim();
    const zone = String(ctx.query.zone || '').trim();
    const uid = getViewerId();
    const favs = await contentFavorites.getFavoriteSet('logistics');
    const decorate = (list) => list.map(x => ({ ...x, isFavorite: favs.has(String(x.id)) }));
    const censusList = decorate(await censusOf('logistics', () => logisticsModel.listAll({ filter: 'all' }), filter === 'ALL' && !q && !zone).catch(() => []));
    const zones = logisticsModel.zonesOf(censusList);
    if (filter === 'CREATE') { ctx.body = await logisticsView([], 'CREATE', { q, censusList, zones, kind: String(ctx.query.kind || '') }); return; }
    if (filter === 'EDIT') {
      const route = await logisticsModel.getRouteById(String(ctx.query.id || ''));
      if (!route || String(route.author) !== String(uid)) { ctx.redirect('/logistics'); return; }
      ctx.body = await logisticsView([], 'EDIT', { q, censusList, zones, route });
      return;
    }
    const routes = (filter === 'ALL' && !q && !zone) ? censusList : decorate(await logisticsModel.listAll({ filter, q, zone }));
    if (recentFallback(ctx, await applyWishScope(routes), 'ALL')) return;
    const shownList = await applyWishScope(routes);
    const spreadMap = await spreads.forMessages(pageOf(ctx, shownList).map(x => x && x.id));
    await warmAuthorNames(pageOf(ctx, shownList));
    ctx.body = await logisticsView(shownList, filter, { q, zone, censusList, zones, spreadMap });
  })
  .get('/logistics/:id', async ctx => {
    if (!checkMod(ctx, 'logisticsMod')) { ctx.redirect('/modules'); return; }
    const route = await logisticsModel.getRouteById(ctx.params.id);
    if (!route) { ctx.redirect('/logistics'); return; }
    route.isFavorite = (await contentFavorites.getFavoriteSet('logistics')).has(String(route.id));
    const comments = await getVoteComments(route.id);
    const censusList = await censusOf('logistics', () => logisticsModel.listAll({ filter: 'all' })).catch(() => []);
    const zones = logisticsModel.zonesOf(censusList);
    await warmAuthorNames([route, ...route.bookings.map(b => ({ author: b.booker })), ...route.ratings, ...comments]);
    ctx.body = await singleLogisticsView(route, { comments, censusList, zones, spread: await spreads.forMessage(route.id).catch(() => null), mapData: await resolveMapUrl(route.mapUrl) });
  })
  .get('/podcasts', async ctx => {
    if (!checkMod(ctx, 'podcastsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || 'RECENT').toUpperCase();
    const q = String(ctx.query.q || '').trim();
    const uid = getViewerId();
    const favs = await contentFavorites.getFavoriteSet('podcasts');
    const all = await censusOf('podcasts', () => podcastsModel.listAll({ filter: 'all' }), true).catch(() => []);
    const needAllSpreads = filter === 'TOP';
    const allSpreads = needAllSpreads ? await spreads.forMessages(all.flatMap(c => [c.id, ...c.episodes.map(e => e.id)])).catch(() => new Map()) : new Map();
    if (!needAllSpreads && !all.some(c => (c.opinionCount || 0) > 0)) {
      for (const c of all) {
        const found = await spreads.forMessages([c.id, ...c.episodes.map(e => e.id)]).catch(() => new Map());
        for (const [k, v] of found) allSpreads.set(k, v);
        if ([...found.values()].some(v => v && Number(v.count) > 0)) break;
      }
    }
    const spreadOf = (id) => { const s = allSpreads.get(id); return s && Number(s.count) > 0 ? Number(s.count) : 0; };
    const decorate = (list) => list.map(c => ({ ...c, isFavorite: favs.has(String(c.id)), spreadCount: spreadOf(c.id) + c.episodes.reduce((sum, e) => sum + spreadOf(e.id), 0) }));
    const censusList = decorate(all);
    if (filter === 'CREATE') { ctx.body = await podcastsView([], 'CREATE', { q, censusList }); return; }
    if (filter === 'EDIT') {
      const channel = await podcastsModel.getChannelById(String(ctx.query.id || ''));
      if (!channel || String(channel.author) !== String(uid)) { ctx.redirect('/podcasts'); return; }
      if (channel) channel.clearnet = await clearnetPublic('podcasts', channel).catch(() => false);
      ctx.body = await podcastsView([], 'EDIT', { q, censusList, channel });
      return;
    }
    let channels;
    if (filter === 'TOP') channels = censusList.filter(c => c.opinionCount > 0 || c.spreadCount > 0).sort((a, b) => b.spreadCount - a.spreadCount || b.opinionCount - a.opinionCount);
    else channels = (filter === 'ALL' && !q) ? censusList : decorate(await podcastsModel.listAll({ filter, q }));
    if (q && filter === 'TOP') channels = channels.filter(c => [c.title, c.description, ...c.tags].some(v => String(v || '').toLowerCase().includes(q.toLowerCase())));
    const shownList = await applyWishScope(channels);
    if (recentFallback(ctx, shownList, 'ALL')) return;
    const spreadMap = needAllSpreads ? allSpreads : await spreads.forMessages(pageOf(ctx, shownList).map(c => c && c.id)).catch(() => new Map());
    await warmAuthorNames(pageOf(ctx, shownList));
    await annotateClearnet('podcasts', channels);
    ctx.body = await podcastsView(shownList, filter, { q, censusList, spreadMap, viewerPrefs: await about.visibilityPrefs(getViewerId()).catch(() => null) });
  })
  .get('/podcasts/episode/:id', async ctx => {
    if (!checkMod(ctx, 'podcastsMod')) { ctx.redirect('/modules'); return; }
    const ep = await podcastsModel.getEpisodeById(ctx.params.id);
    if (!ep) { ctx.redirect('/podcasts'); return; }
    ep.isFavorite = (await contentFavorites.getFavoriteSet('podcasts')).has(String(ep.id));
    const comments = await getVoteComments(ep.id);
    const censusList = await censusOf('podcasts', () => podcastsModel.listAll({ filter: 'all' })).catch(() => []);
    await warmAuthorNames([ep, ...comments]);
    ctx.body = await singleEpisodeView(ep, { comments, censusList, mode: String(ctx.query.mode || ''), spread: await spreads.forMessage(ep.id).catch(() => null), authorPrefs: await about.visibilityPrefs(ep.author).catch(() => null) });
  })
  .get('/podcasts/:id', async ctx => {
    if (!checkMod(ctx, 'podcastsMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const ch = await podcastsModel.getChannelById(ctx.params.id);
    if (!ch) { ctx.redirect('/podcasts'); return; }
    const favPodcasts = await contentFavorites.getFavoriteSet('podcasts');
    ch.isFavorite = favPodcasts.has(String(ch.id));
    ch.episodes = (ch.episodes || []).map(e => ({ ...e, isFavorite: favPodcasts.has(String(e.id)) }));
    const comments = await getVoteComments(ch.id);
    const censusList = await censusOf('podcasts', () => podcastsModel.listAll({ filter: 'all' })).catch(() => []);
    const subscription = await subscriptionStateFor(ch.id, String(ch.author) === String(uid)).catch(() => null);
    const spreadMap = await spreads.forMessages(ch.episodes.map(e => e.id)).catch(() => new Map());
    const spreadCount = Array.from(spreadMap.values()).reduce((s, x) => s + (x && Number(x.count) > 0 ? Number(x.count) : 0), 0);
    await warmAuthorNames([ch, ...comments]);
    if (ch) ch.clearnet = await clearnetPublic('podcasts', ch).catch(() => false);
    ctx.body = await singleChannelView({ ...ch, spreadCount }, { comments, censusList, subscription, spreadMap, mode: String(ctx.query.mode || ''), episodes: String(ctx.query.episodes || ''), spread: await spreads.forMessage(ch.id).catch(() => null), authorPrefs: await about.visibilityPrefs(ch.author).catch(() => null) });
  })
  .get('/campaigns', async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || 'RECENT').toUpperCase();
    const q = String(ctx.query.q || '').trim();
    const uid = getViewerId();
    const favs = await contentFavorites.getFavoriteSet('campaigns');
    const decorate = (list) => list.map(x => ({ ...x, isFavorite: favs.has(String(x.id)) }));
    const censusList = decorate(await censusOf('campaigns', () => campaignsModel.listAll({ filter: 'all', viewerId: uid }), filter === 'ALL' && !q).catch(() => []));
    if (filter === 'CREATE') { ctx.body = await campaignsView([], 'CREATE', { q, censusList }); return; }
    if (filter === 'EDIT') {
      const campaign = await campaignsModel.getCampaignById(String(ctx.query.id || ''), uid);
      if (!campaign || String(campaign.author) !== String(uid)) { ctx.redirect('/campaigns'); return; }
      campaign.clearnet = await clearnetPublic('campaigns', campaign).catch(() => false);
      ctx.body = await campaignsView([], 'EDIT', { q, censusList, campaign });
      return;
    }
    const campaigns = (filter === 'ALL' && !q) ? censusList : decorate(await campaignsModel.listAll({ filter, q, viewerId: uid }));
    if (recentFallback(ctx, await applyWishScope(campaigns), 'ALL')) return;
    const shownList = await applyWishScope(campaigns);
    const spreadMap = await spreads.forMessages(pageOf(ctx, shownList).map(x => x && x.id));
    await warmAuthorNames(pageOf(ctx, shownList));
    await annotateClearnet('campaigns', campaigns);
    ctx.body = await campaignsView(shownList, filter, { q, censusList, spreadMap });
  })
  .get('/campaigns/:id/qr.png', async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.status = 404; ctx.body = ''; return; }
    const cp = await campaignsModel.getCampaignById(ctx.params.id);
    if (!cp) { ctx.status = 404; ctx.body = ''; return; }
    try {
      const QRCode = require('../server/node_modules/qrcode');
      const targetUrl = `${QR_ACTION_BASE}/qr-action/sign/${encodeURIComponent(cp.id)}`;
      const buf = await QRCode.toBuffer(targetUrl, { type: 'png', width: 220, margin: 1, errorCorrectionLevel: 'M' });
      ctx.type = 'image/png';
      ctx.set('Cache-Control', 'no-store');
      ctx.body = buf;
    } catch (_) { ctx.status = 500; ctx.body = ''; }
  })
  .get('/campaigns/:id', async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const cp = await campaignsModel.getCampaignById(ctx.params.id, uid);
    if (!cp) { ctx.redirect('/campaigns'); return; }
    cp.isFavorite = (await contentFavorites.getFavoriteSet('campaigns')).has(String(cp.id));
    const comments = await getVoteComments(cp.id);
    const censusList = await censusOf('campaigns', () => campaignsModel.listAll({ filter: 'all', viewerId: uid })).catch(() => []);
    const subscription = await subscriptionStateFor(cp.id, String(cp.author) === String(uid)).catch(() => null);
    await warmAuthorNames([cp, ...cp.signatures, ...cp.updates, ...comments]);
    cp.clearnet = await clearnetPublic('campaigns', cp).catch(() => false);
    ctx.body = await singleCampaignView(cp, { comments, censusList, subscription, editUpdate: String(ctx.query.editUpdate || ''), spread: await spreads.forMessage(cp.id).catch(() => null), mapData: await resolveMapUrl(cp.mapUrl) });
  })
  .get('/qr-action/sign/:id', async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    const id = decodeURIComponent(ctx.params.id || '');
    confirmPage(ctx, { message: require('../views/main_views').i18n.confirmSignText, action: `/qr-action/sign/${encodeURIComponent(id)}`, backHref: `/campaigns/${encodeURIComponent(id)}` });
  })
  .post('/qr-action/sign/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    const id = decodeURIComponent(ctx.params.id || '');
    try { await campaignsModel.sign(id, ''); } catch (e) { if (!/already/i.test(String(e && e.message))) return actionFail(ctx); }
    ctx.redirect(`/campaigns/${encodeURIComponent(id)}`);
  })
  .get('/reports', async ctx => {
    const filter = qf(ctx, 'recent');
    const q = String(ctx.query.q || '').trim();
    let reports = await enrichWithComments(await reportsModel.listAll());
    const reportIds = new Set(reports.map(r => r.id));
    reports = reports.concat((await tribeItemsFor('report')).filter(t => !reportIds.has(t.id)).map(t => ({ id: t.id, rootId: t.id, title: t.title || '', description: t.description || '', category: String(t.category || '').toUpperCase(), status: String(t.status || 'OPEN').toUpperCase(), severity: String(t.priority || 'low').toLowerCase(), confirmations: [], tags: Array.isArray(t.tags) ? t.tags.filter(Boolean) : [], images: [], author: t.author || '', createdAt: t.createdAt || new Date(Number(t._ts) || 0).toISOString(), opinions: {}, opinions_inhabitants: [], tribeOrigin: t.tribeOrigin })));
    reports = applyTextSearch(reports, q, ['title', 'description', 'category', 'tags']);
    reports = await applyListFilters(reports, ctx);
    try { reports = await lifetime.enrichAndFilter(reports); } catch (_) {}
    if (recentFallback(ctx, reports.filter(r => (new Date(r.createdAt).getTime() || 0) >= Date.now() - 86400000))) return;
    const pageItems = await renderedPage(async () => reportView(reports, filter, null, ctx.query.category || '', { spreadMap: new Map(), q, prefillTitle: ctx.query.title || '', prefillDescription: ctx.query.description || '' }));
    await enrichMsgSize(pageItems);
    const spreadMap = await spreads.forMessages(pageItems.map(x => x && (x.id || x.key)));
    await warmAuthorNames(pageItems);
    ctx.body = await reportView(reports, filter, null, ctx.query.category || '', { spreadMap, q, prefillTitle: ctx.query.title || '', prefillDescription: ctx.query.description || '' });
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
    const singleCensus = await censusOf('reports', () => reportsModel.listAll()).catch(() => []);
    ctx.body = await singleReportView(await withFavorite(withCount(report, comments), 'reports'), filter, comments, { censusList: singleCensus, spreads: await spreads.forMessage(report.id).catch(() => null) });
  })
  .get('/trending', async (ctx) => {
    const filter = qf(ctx, 'RECENT');
    const q = String(ctx.query.q || '').trim();
    let { filtered = [] } = await trendingModel.listTrending(filter);
    filtered = await applyListFilters(filtered, ctx);
    if (q) {
      const needle = q.toLowerCase();
      filtered = filtered.filter(m => {
        const c = (m && m.value && m.value.content) || {};
        return [c.title, c.name, c.question, c.description, c.text, c.concept, ...(Array.isArray(c.tags) ? c.tags : [])]
          .some(v => String(v || '').toLowerCase().includes(needle));
      });
    }
    if (recentFallback(ctx, filtered, 'ALL')) return;
    const allTrending = String(filter).toUpperCase() === 'ALL' && !q
      ? filtered
      : ((await trendingModel.listTrending('ALL').catch(() => ({}))).filtered || []);
    const favIndex = await contentFavorites.getFavoriteIndex().catch(() => new Map());
    const pageItems = await renderedPage(async () => trendingView(filtered, filter, trendingModel.categories, new Map(), q, allTrending, { favIndex }));
    const spreadMap = await spreads.forMessages(pageItems.map(it => it && it.key)).catch(() => new Map());
    await warmAuthorNames(pageItems);
    ctx.body = await trendingView(filtered, filter, trendingModel.categories, spreadMap, q, allTrending, { favIndex });
  })
  .get('/agenda', async (ctx) => {
    const filter = qf(ctx);
    const q = String(ctx.query.q || '').trim();
    let data = await agendaModel.listAgenda(filter);
    if (data && Array.isArray(data.items)) {
      const visible = await applyListFilters(data.items, ctx);
      data = { ...data, items: applyTextSearch(visible, q, ['title', 'description', 'name', 'concept', 'location', 'tags']) };
    }
    const agendaIds = pageOf(ctx, (data && data.items) || []).map(x => x && (x.rootId || x.id)).filter(Boolean);
    ctx.body = await agendaView(data, filter, q, { spreadMap: await spreads.forMessages(agendaIds).catch(() => new Map()), favIndex: await contentFavorites.getFavoriteIndex().catch(() => new Map()) });
  })
  .get("/hashtag/:hashtag", async (ctx) => {
    ctx.redirect(`/search?query=${encodeURIComponent('#' + String(ctx.params.hashtag || ''))}`);
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
    if (filter === 'CVs') {
      Object.assign(query, {
        location: ctx.query.location || '',
        language: ctx.query.language || '',
        skills: ctx.query.skills || ''
      });
    }
    const inhabitants = await inhabitantsModel.listInhabitants({ filter, ...query });
    const bankFor = async (u) => {
      try {
        const bank = await bankingModel.getBankingData(u.id);
        return { karmaScore: bank?.karmaScore || 0, estimatedUBI: bank?.estimatedUBI || 0, lastClaimedDate: bank?.lastClaimedDate || null, totalClaimed: bank?.totalClaimed || 0 };
      } catch {
        return { karmaScore: 0, estimatedUBI: 0, lastClaimedDate: null, totalClaimed: 0 };
      }
    };
    const activityList = await Promise.all(
      inhabitants.map(async (u) => {
        if (u.lastActivityBucket) return { id: u.id, lastActivityBucket: u.lastActivityBucket };
        try {
          const ts = await inhabitantsModel.getLastActivityTimestampByUserId(u.id);
          const { bucket } = inhabitantsModel.bucketLastActivity(ts || null);
          return { id: u.id, lastActivityBucket: bucket };
        } catch {
          return { id: u.id, lastActivityBucket: 'red' };
        }
      })
    );
    const activityMap = new Map(activityList.map(x => [x.id, x.lastActivityBucket]));
    let listed = inhabitants
      .map(u => ({ ...u, lastActivityBucket: activityMap.get(u.id) }))
      .filter(u => u.id === userId || u.lastActivityBucket !== 'red');
    if (filter === 'TOP KARMA') {
      listed = listed.sort((a, b) => (Number(b.karmaScore) || 0) - (Number(a.karmaScore) || 0));
    }
    if (filter === 'TOP ACTIVITY') {
      const order = { green: 0, orange: 1, red: 2 };
      listed = listed.sort(
        (a, b) => (order[a.lastActivityBucket] ?? 3) - (order[b.lastActivityBucket] ?? 3)
      );
    }
    const pageUsers = slicePage(listed, new URLSearchParams(ctx.querystring).get('page'), listPerPage(ctx.querystring)).items;
    const addrMap = new Map((await bankingModel.listAddressesMerged()).map(x => [x.id, x.address]));
    const profiles = config.public ? null : await about.profiles().catch(() => null);
    const details = new Map(await Promise.all(pageUsers.map(async (u) => {
      const pr = profiles ? (profiles.get(u.id) || {}) : null;
      const prefsNow = pr ? about.visibilityFrom(pr.visibilityPrefs) : await about.visibilityPrefs(u.id).catch(() => null);
      const published = Number(u.karmaScore) > 0;
      const [kd, prefs, rel, fp, src, carbon] = await Promise.all([
        (prefsNow && prefsNow.ubi === true) || !published ? bankFor(u) : { karmaScore: Number(u.karmaScore), estimatedUBI: 0, lastClaimedDate: null, totalClaimed: 0 },
        prefsNow,
        friend.getRelationship(u.id).catch(() => null),
        pr ? (typeof pr.gpgFingerprint === 'string' ? pr.gpgFingerprint : '') : about.gpgFingerprint(u.id).catch(() => ''),
        pr ? (typeof pr.deviceSource === 'string' && pr.deviceSource.trim() ? pr.deviceSource : null) : about.deviceSource(u.id).catch(() => null),
        getCarbonGramsForFeed(u.id).catch(() => 0)
      ]);
      return [u.id, {
        ecoAddress: addrMap.get(u.id) || null,
        karmaScore: kd.karmaScore ?? (typeof u.karmaScore === 'number' ? u.karmaScore : 0),
        estimatedUBI: kd.estimatedUBI || 0,
        lastClaimedDate: kd.lastClaimedDate || null,
        totalClaimed: kd.totalClaimed || 0,
        visibilityPrefs: prefs || null,
        relationship: rel || null,
        gpgFingerprint: fp || '',
        deviceSource: src || null,
        carbonGrams: carbon || 0
      }];
    })));
    const enriched = listed.map(u => details.has(u.id) ? { ...u, ...details.get(u.id) } : u);
    const censusBase = filter === 'all' ? enriched : await censusOf('inhabitants:all', () => inhabitantsModel.listInhabitants({ filter: 'all' })).catch(() => []);
    const cvCensus = filter === 'CVs' ? enriched : await censusOf('inhabitants:CVs', () => inhabitantsModel.listInhabitants({ filter: 'CVs' })).catch(() => []);
    const suggestedCensus = filter === 'SUGGESTED' ? enriched : await censusOf('inhabitants:SUGGESTED', () => inhabitantsModel.listInhabitants({ filter: 'SUGGESTED' })).catch(() => []);
    let contactsAvail = false, blockedAvail = false;
    try {
      const ssbX = await cooler.open();
      const graph = await new Promise((resolve) => ssbX.friends.graph((err, g) => resolve(err ? {} : (g || {}))));
      for (const [gid, v] of Object.entries(graph[userId] || {})) {
        if (gid === userId) continue;
        if (v === true || Number(v) > 0) contactsAvail = true;
        if (v === false || Number(v) < 0) blockedAvail = true;
      }
    } catch (_) {}
    const hasRealPhoto = (u) => u && typeof u.photo === 'string' && u.photo.length > 0 && !u.photo.includes('default-avatar');
    const filterCensus = {
      CVs: cvCensus.length > 0,
      SUGGESTED: suggestedCensus.length > 0,
      contacts: contactsAvail,
      blocked: blockedAvail,
      GALLERY: censusBase.some(hasRealPhoto)
    };
    ctx.body = await inhabitantsView(enriched, filter, query, userId, fediverseModel.hasAccount(), filterCensus);
  })
  .get('/inhabitant/:id', async (ctx) => {
    const id = ctx.params.id;
    const aboutModel = about;
    const [aboutMsg, cv, feed, photo, bank, lastTs, visibilityPrefs, carbonGrams, larpHouseKey, deviceSource, relationship] = await Promise.all([
      inhabitantsModel.getLatestAboutById(id),
      inhabitantsModel.getCVByUserId(id),
      inhabitantsModel.getFeedByUserId(id),
      inhabitantsModel.getPhotoUrlByUserId(id, 256),
      bankingModel.getBankingData(id).catch(() => ({ karmaScore: 0 })),
      inhabitantsModel.getLastActivityTimestampByUserId(id).catch(() => null),
      aboutModel.visibilityPrefs(id).catch(() => null),
      getCarbonGramsForFeed(id).catch(() => 0),
      larpModel.getUserHouse(id).catch(() => null),
      aboutModel.deviceSource(id).catch(() => null),
      friend.getRelationship(id).catch(() => null)
    ]);
    const larpHouse = larpHouseKey ? { key: larpHouseKey, ...larpModel.getHouse(larpHouseKey) } : null;
    const bucketInfo = inhabitantsModel.bucketLastActivity(lastTs || null);
    const currentUserId = getViewerId();
    const stats = await inhabitantsModel.getInhabitantStats(id, currentUserId).catch(() => ({}));
    const karmaScore = bank && typeof bank.karmaScore === 'number' ? bank.karmaScore : 0;
    const estimatedUBI = bank?.estimatedUBI || 0;
    const lastClaimedDate = bank?.lastClaimedDate || null;
    const totalClaimed = bank?.totalClaimed || 0;
    const oasisVersion = (String(id) === String(currentUserId) ? OASIS_VERSION : null) || await getOasisVersion(id);
    await warmAuthorNames(feed);
    ctx.body = await inhabitantsProfileView({ about: aboutMsg, cv, feed, photo, relationship, karmaScore, estimatedUBI, lastClaimedDate, totalClaimed, carbonGrams, larpHouse, lastActivityBucket: bucketInfo.bucket, viewedId: id, visibilityPrefs, deviceSource, stats, oasisVersion }, currentUserId, fediverseModel.hasAccount());
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
      inhabitantsModel.countInhabitants().catch(() => 0)
    ]);
    const inhabitantsTotal = Number(inhabitantsAll) || 0;
    const withCampaignCounts = async (items) => Promise.all((items || []).map(async (p) => {
      if (!p || !p.campaignId) return p;
      try {
        const cp = await campaignsModel.getCampaignById(p.campaignId);
        return cp ? { ...p, signatures: cp.signatureCount, goal: cp.goal } : p;
      } catch (_) { return p; }
    }));
    const proposalsLive = await withCampaignCounts(proposals);
    const futureLawsLive = await withCampaignCounts(futureLaws);
    let governmentCard = governmentCardRaw ? { ...governmentCardRaw, inhabitantsTotal, expired: false } : null;
    if (!governmentCard) {
      const latest = await parliamentModel.getLatestGovernmentCard().catch(() => null);
      if (latest) governmentCard = { ...latest, inhabitantsTotal };
    }
    const leader = pickLeader(candidatures || []);
    const getActorMeta = async (type, id) => (type === 'tribe' || type === 'inhabitant') ? parliamentModel.getActorMeta({ targetType: type, targetId: id }) : null;
    const leaderMeta = leader ? await getActorMeta(leader.targetType || leader.powerType || 'inhabitant', leader.targetId || leader.powerId) : null;
    const powerMeta = governmentCard ? await getActorMeta(governmentCard.powerType, governmentCard.powerId) : null;
    const buildMetas = async (items) => {
      const m = {};
      for (const g of (items || [])) {
        if (g.powerType === 'tribe' || g.powerType === 'inhabitant') {
          const k = `${g.powerType}:${g.powerId}`;
          if (!m[k]) m[k] = await getActorMeta(g.powerType, g.powerId);
        }
      }
      return m;
    };
    const [historicalMetas, leadersMetas] = await Promise.all([buildMetas(filter === 'historical' ? pageOf(ctx, historical) : []), buildMetas(filter === 'leaders' ? pageOf(ctx, leaders) : [])]);
    let hemicycle = null;
    if (filter === 'government') {
      try {
        const termForSeats = await parliamentModel.getCurrentTerm().catch(() => null);
        hemicycle = await parliamentModel.getHemicycle(termForSeats);
        if (hemicycle && Array.isArray(hemicycle.seats)) {
          const memberships = await larpModel.listAllMemberships().catch(() => new Map());
          const houseOf = (id) => { const v = memberships && memberships.get ? memberships.get(id) : null; return typeof v === 'string' ? v : (v && v.house) || null; };
          hemicycle.houses = {};
          for (const seat of hemicycle.seats) { seat.house = houseOf(seat.id); if (seat.house) hemicycle.houses[seat.house] = (hemicycle.houses[seat.house] || 0) + 1; }
        }
      } catch (_) { hemicycle = null; }
    }
    const houseNames = Object.fromEntries(Object.entries(larpModel.HOUSES || {}).map(([k, h]) => [k, (h && h.name) || k]));
    ctx.body = await parliamentView({
      filter,
      inhabitantsTotal,
      governmentCard,
      hemicycle,
      seatsMode: String(ctx.query.seats || '') === 'houses' ? 'houses' : 'election',
      houseNames,
      candidatures,
      proposals: proposalsLive,
      futureLaws: futureLawsLive,
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
    try { await courtsModel.sweepCases(); } catch (_) {}
    const filter = String(ctx.query.filter || 'cases').toLowerCase(), search = String(ctx.query.search || '').trim();
    const currentUserId = await courtsModel.getCurrentUserId();
    const state = { filter, search, cases: [], myCases: [], trials: [], history: [], nominations: [], userId: currentUserId, prefill: { titleSuffix: ctx.query.titleSuffix || '', respondentId: ctx.query.respondentId || '', method: (ctx.query.method || '').toUpperCase(), titlePreset: ctx.query.titlePreset || '' } };
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
    const filter = qf(ctx, 'recent'), search = ctx.query.search || '';
    let tribes = await tribesModel.listTribesForViewer(uid);
    tribes = dedupeLarpHouseTribes(tribes);
    try {
      if (tribes.some(t => (Array.isArray(t.tags) ? t.tags : []).some(x => String(x).startsWith('larp-')))) {
        const houses = await larpModel.listHousesWithCounts().catch(() => []);
        const countByTag = new Map(houses.map(h => [`larp-${h.name}`, h.memberCount]));
        for (const t of tribes) {
          const lt = (Array.isArray(t.tags) ? t.tags : []).find(x => String(x).startsWith('larp-'));
          if (lt && countByTag.has(lt)) t.memberCount = countByTag.get(lt);
        }
      }
    } catch (_) {}
    let filteredTribes = search ? tribes.filter(t => t.title.toLowerCase().includes(search.toLowerCase())) : tribes;
    try { filteredTribes = await lifetime.enrichAndFilter(filteredTribes, { getKey: (x) => x.id || x.key }); } catch (_) {}
    if (recentFallback(ctx, (await applyWishScope(filteredTribes)).filter(t => !t.parentTribeId && (!t.isAnonymous || t.author === uid || (Array.isArray(t.members) && t.members.includes(uid))) && ((typeof t.createdAt === 'string' ? Date.parse(t.createdAt) : t.createdAt) || 0) >= Date.now() - 86400000))) return;
    try { await tribesModel.enrichOpenInvites(filteredTribes); } catch (_) {}
    for (const t of filteredTribes) {
      if (t.openInviteCode) t.openInviteQr = `/qr-invite/tribe/${encodeURIComponent(t.id)}`;
    }
    try {
      const viewer = getViewerId();
      const { mine } = await subscriptionsModel.subscriberCounts(filteredTribes.map(t => t.id));
      for (const t of filteredTribes) {
        const isIn = (Array.isArray(t.members) && t.members.includes(viewer)) || String(t.author) === String(viewer);
        if (isIn) t.subscriptionIn = mine.has(t.id) || String(t.author) === String(viewer);
      }
    } catch (_) {}
    ctx.body = await tribesView(await applyWishScope(filteredTribes), filter, null, ctx.query, tribes);
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
    await tribeUpkeep(ctx.params.tribeId);
    let reachState = null;
    const reachStateNow = async () => { if (!reachState) reachState = await tribesContentModel.exposureState().catch(() => new Map()); return reachState; };
    const listByTribeAllChain = async (tribeId, contentType) => {
      const st = await reachStateNow();
      if (!(await tribesModel.isTribeMember(getViewerId(), tribeId))) return tribesContentModel.listExposed(tribeId, contentType, 'oasis', st).catch(() => []);
      const chainIds = await tribesModel.getChainIds(tribeId).catch(() => [tribeId]);
      const results = await Promise.all(chainIds.map(id => tribesContentModel.listByTribe(id, contentType).catch(() => [])));
      const seen = new Set();
      return results.flat().filter(item => { const k = item.id || item.key; if (seen.has(k)) return false; seen.add(k); return true; })
        .map(item => { const e = st.get(item.originId); return { ...item, reach: e ? e.level : 'tribe', exposedBy: e && e.level !== 'tribe' ? e.by : null }; });
    };
    const tribe = await tribesModel.getTribeById(ctx.params.tribeId).catch(() => null);
    if (!tribe) { ctx.redirect('/tribes'); return; }
    tribe.reachAllowed = await tribeReachAllowed(tribe.id);
    tribe.rootId = await tribesModel.getRootId(tribe.id).catch(() => tribe.id);
    const uid = getViewerId();
    const query = { ...ctx.query };
    if (tribe.isAnonymous === true && !tribe.members.includes(uid)) {
      ctx.redirect('/tribes');
      return;
    }
    const section = ctx.query.section || 'activity';
    const contentTypeMap = { events: 'event', tasks: 'task', reports: 'report', votations: 'votation', market: 'market', jobs: 'job', projects: 'project', media: 'media' };
    const mediaSections = { 'media-audio': 'media', 'media-video': 'media', 'media-images': 'media', 'media-documents': 'media', 'media-bookmarks': 'media', 'images': 'media', 'audios': 'media', 'videos': 'media', 'documents': 'media', 'bookmarks': 'media' };
    let sectionData = null;
    if (section === 'inhabitants') {
      const allInhabitants = await inhabitantsModel.listInhabitants({ filter: 'all', includeInactive: true, ids: tribe.members });
      sectionData = allInhabitants.filter(u => tribe.members.includes(u.id));
    } else if (section === 'feed') {
      sectionData = await listByTribeAllChain(tribe.id, 'feed').catch(() => []);
    } else if (section === 'forum') {
      const forums = await listByTribeAllChain(tribe.id, 'forum');
      const replies = await listByTribeAllChain(tribe.id, 'forum-reply');
      sectionData = [...forums, ...replies];
    } else if (section === 'polls') {
      sectionData = checkMod(ctx, 'pollsMod')
        ? await pollsModel.listAll('ALL', { tribeId: tribe.id }).catch(() => [])
        : [];
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
      const allTribePolls = checkMod(ctx, 'pollsMod')
        ? (await Promise.all([...tribeChainSet].map(tid => pollsModel.listAll('ALL', { tribeId: tid }).catch(() => [])))).flat()
        : [];
      const standaloneItems = [
        ...allTribePolls.filter(p => !p.undecryptable).map(p => ({
          contentType: 'poll', id: p.id, title: p.question, author: p.author,
          createdAt: p.createdAt, directUrl: `/tribe/${encodeURIComponent(tribe.id)}?section=polls`
        })),
        ...allPadsRaw.filter(p => tribeChainSet.has(p.tribeId)).map(toStandalone('pad', p => `/pads/${encodeURIComponent(p.rootId)}`)),
        ...allChatsRaw.filter(c => tribeChainSet.has(c.tribeId)).map(toStandalone('chat', c => `/chats/${encodeURIComponent(c.rootId || c.key)}`)),
        ...allCalsRaw.filter(c => tribeChainSet.has(c.tribeId)).map(toStandalone('calendar', c => `/calendars/${encodeURIComponent(c.rootId)}`)),
        ...allMapsRaw.filter(m => tribeChainSet.has(m.tribeId)).map(toStandalone('map', m => `/maps/${encodeURIComponent(m.key || m.id)}`)),
        ...allTorrentsRaw.filter(t => tribeChainSet.has(t.tribeId)).map(toStandalone('torrent', t => `/torrents/${encodeURIComponent(t.rootId || t.key)}`))
      ];
      const subTribeNameById = new Map(subTribes.map(st => [st.id, st.title]));
      const chatThreadItems = [];
      const tribeChats = allChatsRaw.filter(c => (tribeChainSet.has(c.tribeId) || subTribeNameById.has(c.tribeId)) && (c.rootId || c.key));
      const chatMsgs = await Promise.all(tribeChats.map(c => chatsModel.listMessages(c.rootId || c.key).catch(() => [])));
      for (const [ci, c] of tribeChats.entries()) {
        const inSub = subTribeNameById.has(c.tribeId);
        const root = c.rootId || c.key;
        const msgs = chatMsgs[ci];
        const withText = (msgs || []).filter(m => m && typeof m.text === 'string' && m.text.trim());
        if (!withText.length) continue;
        withText.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const last = withText[withText.length - 1];
        chatThreadItems.push({
          contentType: 'chatThread',
          id: root,
          title: c.title || '',
          author: c.author,
          createdAt: last.createdAt,
          _ts: Date.parse(last.createdAt) || 0,
          directUrl: `/chats/${encodeURIComponent(root)}`,
          ...(inSub ? { tribeName: subTribeNameById.get(c.tribeId) } : {}),
          description: c.description || '',
          replies: withText.slice(-6).map(m => ({ author: m.author, text: m.text, createdAt: m.createdAt }))
        });
      }
      const combined = [...allContent, ...subContent, ...standaloneItems, ...chatThreadItems];
      const allMembers = [...new Set([...tribe.members, ...subTribes.flatMap(st => st.members || [])])];
      const allInhabitants = await inhabitantsModel.listInhabitants({ filter: 'all', includeInactive: true, ids: allMembers });
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
      const [allPadsT, allChatsT, allCalsT, allMapsT, allTorrentsT, allFilesT, subTribesT, tribeChainT] = await Promise.all([
        padsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        chatsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        calendarsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        mapsModel.listAll({ filter: 'all', q: '', viewerId: uid }).catch(() => []),
        torrentsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),

        filesModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
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
        ...allFilesT.filter(t => tribeChainSetT.has(t.tribeId)).map(t => ({ ...t, contentType: 'file', id: t.rootId || t.key })),
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
    } else if (section === 'wiki') {
      sectionData = await wikiModel.listPages({ tribeId: tribe.id, viewerId: uid }).catch(() => []);
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
    } else if (section === 'rooms') {
      const [allRooms, tribeChain] = await Promise.all([
        roomsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        tribesModel.getChainIds(tribe.id).catch(() => [tribe.id])
      ]);
      const tribeChainSet = new Set(tribeChain);
      const rooms = allRooms.filter(r => tribeChainSet.has(r.tribeId));
      sectionData = { rooms, occupancy: await roomsModel.occupancies(rooms.filter(r => !r.isClosed)), live: await roomsModel.liveState() };
    } else if (section === 'calendars') {
      const [allCals, tribeChain] = await Promise.all([
        calendarsModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        tribesModel.getChainIds(tribe.id).catch(() => [tribe.id])
      ]);
      const tribeChainSet = new Set(tribeChain);
      sectionData = allCals.filter(c => tribeChainSet.has(c.tribeId));
    } else if (section === 'files') {
      const [allFiles, tribeChain] = await Promise.all([
        filesModel.listAll({ filter: 'all', viewerId: uid }).catch(() => []),
        tribesModel.getChainIds(tribe.id).catch(() => [tribe.id])
      ]);
      const tribeChainSet = new Set(tribeChain);
      sectionData = allFiles.filter(t => tribeChainSet.has(t.tribeId)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
          reach: m.reach,
          exposedBy: m.exposedBy,
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
      let [term, candidatures, rules, globalTermBase] = await Promise.all([
        parliamentModel.tribe.getCurrentTerm(tribe.id).catch(() => null),
        parliamentModel.tribe.listCandidatures(tribe.id).catch(() => []),
        parliamentModel.tribe.listRules(tribe.id).catch(() => []),
        parliamentModel.getCurrentTerm().catch(() => null)
      ]);
      if (term && term.startAt) {
        const tribeTermDays = parliamentModel.tribe.TERM_DAYS || 60;
        let cStart = moment(term.startAt);
        let cEnd = term.endAt ? moment(term.endAt) : cStart.clone().add(tribeTermDays, 'days');
        const now = moment();
        let rolled = false;
        while (cEnd.isValid() && cEnd.isSameOrBefore(now)) { cStart = cEnd.clone(); cEnd = cEnd.clone().add(tribeTermDays, 'days'); rolled = true; }
        if (rolled) term = { ...term, startAt: cStart.toISOString(), endAt: cEnd.toISOString(), method: 'ANARCHY', powerType: 'none', powerId: null, leaders: [], winnerVotes: 0, totalVotes: 0 };
      }
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
      await Promise.all(items.map(async (item) => {
        if (item && item.description) item.description = await resolveMentionText(item.description);
      }));
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
    try {
      const HK = ['academia','solaris','arrakis','terraverde','unsystem','dogma','helix','quark','hermandad'];
      const larpTag = Array.isArray(tribe.tags) ? tribe.tags.find(x => String(x).startsWith('larp-')) : null;
      if (larpTag) {
        const norm = larpTag.slice(5).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (HK.includes(norm)) {
          tribe.larpHouseKey = norm;
          const houses = await larpModel.listHousesWithCounts().catch(() => []);
          const h = (houses || []).find(x => x.key === norm);
          if (h && typeof h.memberCount === 'number') tribe.memberCount = h.memberCount;
        }
      }
    } catch (_) {}
    try {
      const openInvite = await tribesModel.getOpenInvite(tribe.id).catch(() => null);
      if (openInvite) {
        tribe.openInviteCode = openInvite.code;
        tribe.openInviteBy = openInvite.by;
        tribe.openInviteQr = `/qr-invite/tribe/${encodeURIComponent(tribe.id)}`;
      }
    } catch (_) {}
    try { await warmAuthorNames(Array.isArray(sectionData) ? sectionData : (sectionData && sectionData.items) || []); } catch (_) {}
    try { tribe.subscription = await subscriptionStateFor(tribe.id, tribe.author); } catch (_) {}
    try { if (larpModel && typeof larpModel.getUserHouse === 'function') tribe.viewerHouse = await larpModel.getUserHouse(uid); } catch (_) {}
    if (tribe.mapUrl) tribe.mapData = await resolveMapUrl(tribe.mapUrl);
    ctx.body = await tribeView(tribe, uid, query, section, sectionData);
  })
  .get('/activity', async ctx => {
    const filter = qf(ctx, 'recent'), userId = getViewerId();
    const q = String((ctx.query && ctx.query.q) || '');
    let allActions = await activityModel.listFeed('all');
    const settleActions = async (list) => {
      await Promise.all((list || []).map(async (action) => {
        if (action.type === 'pad') {
          const c = action.value?.content || action.content || {};
          const rootId = action.id || action.key || '';
          const decrypted = await padsModel.decryptContent(c, rootId);
          if (decrypted.title) {
            if (action.value?.content) { action.value.content.title = decrypted.title; action.value.content.deadline = decrypted.deadline; }
            else if (action.content) { action.content.title = decrypted.title; action.content.deadline = decrypted.deadline; }
          }
        }
        if (action.type === 'parliamentProposal' || action.type === 'parliamentRevocation') {
          const c = action.value?.content || action.content || {};
          if (c.voteId) {
            const derived = await parliamentModel.deriveProposalStatus(c.method, c.voteId).catch(() => null);
            if (derived) {
              if (action.value?.content) action.value.content.status = derived;
              else if (action.content) action.content.status = derived;
            }
          }
        }
      }));
    };
    if (q.trim()) await settleActions(allActions);
    if (filter === 'larp') {
      try {
        const gk = larpModel.getGoverningHouseKey();
        const myHouse = await larpModel.getUserHouse(userId).catch(() => null);
        const houseKeys = [...new Set([gk, myHouse].filter(Boolean))];
        const seenPosts = new Set(allActions.filter(a => a && a.type === 'larpHousePost').map(a => a.id));
        for (const hk of houseKeys) {
          const posts = await larpModel.listHousePosts(hk, { viewerHouse: myHouse, isGoverning: hk === gk });
          for (const p of posts) {
            if (seenPosts.has(p.id)) continue;
            seenPosts.add(p.id);
            allActions.push({ type: 'larpHousePost', id: p.id, author: p.author, ts: p.ts, content: { type: 'larpHousePost', text: p.text, createdAt: p.createdAt, house: hk } });
          }
        }
      } catch (_) {}
    }
    try {
      const seenOpened = new Set(allActions.filter(a => a && a.type === 'tribeOpened').map(a => a.id));
      for (const t of await getOpenTribeItems()) {
        if (seenOpened.has(t.id)) continue;
        seenOpened.add(t.id);
        allActions.push({ type: 'tribeOpened', id: t.id, author: t.author, ts: Number(t._ts) || Date.parse(t.updatedAt || t.createdAt || '') || 0, content: { ...t, type: 'tribeOpened' } });
      }
    } catch (_) {}
    allActions = await applyListFilters(allActions, ctx);
    const favIndex = await contentFavorites.getFavoriteIndex().catch(() => new Map());
    await attachCommentMeta(allActions);
    const actPage = parseInt(String((ctx.query && ctx.query.page) || ''), 10);
    const actPer = ctx.query && ctx.query.perPage ? listPerPage(ctx.querystring) : '';
    const returnTo = `/activity?filter=${encodeURIComponent(filter)}${q ? `&q=${encodeURIComponent(q)}` : ''}${actPer ? `&perPage=${actPer}` : ''}${actPage > 1 ? `&page=${actPage}` : ''}`;
    const pageKeys = new Set();
    for (const it of await renderedPage(async () => activityView(allActions, filter, userId, q, { spreadMap: new Map(), favIndex, returnTo }))) {
      const c = (it && it.content) || {};
      for (const k of [it && it.id, it && it.rootId, it && it.tipId, c.threadId, c.chatRoot, c.root && c.root.id, ...(Array.isArray(c.replies) ? c.replies.map(r => r && r.id) : [])]) if (k) pageKeys.add(k);
    }
    const pageActions = (allActions || []).filter(a => a && pageKeys.has(a.id));
    if (!q.trim()) await settleActions(pageActions);
    const spreadMap = new Map();
    const SPREADABLE = new Set(['post','audio','video','image','document','torrent','file','bookmark','event','calendar','task','votes','vote','market','shop','shopProduct','project','industry','industryBuild','industryBlueprint','transfer','housing','job','report','chat','chatMessage','pad','padEntry','room','wikiPage','emergency','mailingList','logisticsRoute','podcast','podcastEpisode','campaign','forum','map','schoolCourse']);
    const targets = pageActions.filter(a => a && a.id && typeof a.id === 'string' && a.id.startsWith('%') && /\.sha256$/.test(a.id) && SPREADABLE.has(a.type));
    const spreadKeysOf = (a) => Array.from(new Set([a.id, a.rootId, a.tipId].filter(k => typeof k === 'string' && k.startsWith('%'))));
    const results = await Promise.all(targets.map(a => Promise.all(spreadKeysOf(a).map(k => spreads.forMessage(k).catch(() => null)))));
    targets.forEach((a, i) => {
      const parts = (results[i] || []).filter(Boolean);
      if (!parts.length) return;
      const voters = Array.from(new Set(parts.flatMap(pt => Array.isArray(pt.voters) ? pt.voters : [])));
      spreadMap.set(a.id, { ...parts[0], voters, count: voters.length || Math.max(...parts.map(pt => Number(pt.count) || 0)), alreadySpread: parts.some(pt => pt.alreadySpread) });
    });
    try {
      const uniqAuthors = new Set();
      const collect = (v) => { if (v && /^@.+\.ed25519$/.test(String(v))) uniqAuthors.add(String(v)); };
      for (const a of pageActions) {
        collect(a && a.author);
        const c = a && (a.value?.content || a.content);
        if (c) { collect(c.author); collect(c.proposer); collect(c.organizer); }
        const replies = c && Array.isArray(c.replies) ? c.replies : [];
        for (const r of replies) collect(r && r.author);
      }
      const nameOf = {};
      await Promise.all([...uniqAuthors].slice(0, 400).map(async (fid) => {
        try { const nm = await about.name(fid); if (nm && nm !== fid.slice(1, 9)) nameOf[fid] = nm; } catch (_) {}
      }));
      if (Object.keys(nameOf).length) {
        for (const a of pageActions) {
          const c = a && (a.value?.content || a.content);
          const map = {};
          const push = (id) => { const s = id && String(id); if (s && nameOf[s]) map[s] = nameOf[s]; };
          push(a && a.author); push(c && c.author); push(c && c.proposer); push(c && c.organizer);
          const replies = c && Array.isArray(c.replies) ? c.replies : [];
          for (const r of replies) push(r && r.author);
          if (Object.keys(map).length) a.authorNames = map;
        }
      }
    } catch (_) {}
    ctx.body = activityView(allActions, filter, userId, q, { spreadMap, favIndex, returnTo });
  })
  .get("/profile", async (ctx) => {
    const myFeedId = await meta.myFeedId(), gt = Number(ctx.request.query.gt || -1), lt = Number(ctx.request.query.lt || -1);
    if (lt > 0 && gt > 0 && gt >= lt) throw new Error("Given search range is empty");
    const visibilityPrefs = await about.visibilityPrefs(myFeedId).catch(() => null);
    const rawPrefs = visibilityPrefs || {};
    const needsBanking = (rawPrefs.karma !== false);
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
    const stats = await inhabitantsModel.getInhabitantStats(myFeedId, myFeedId).catch(() => ({}));
    const userActions = (allActions || []).filter(a => a && a.author === myFeedId && a.type !== 'tombstone' && a.type !== 'post');
    const normTs = t => { const n = Number(t || 0); return !isFinite(n) || n <= 0 ? 0 : n < 1e12 ? n * 1000 : n; };
    const pickTs = obj => { if (!obj) return 0; const v = obj.value || obj; return normTs(v.timestamp || v.ts || v.time || v.meta?.timestamp || 0); };
    const postActivityTs = Math.max(Array.isArray(messages) && messages.length ? Math.max(...messages.map(pickTs)) : 0, pickTs(lastPost), pickTs(firstPost));
    const lastActivityTs = Math.max(postActivityTs, Number(lastUserActivityTs) || 0);
    const { bucket: lastActivityBucket } = inhabitantsModel.bucketLastActivity(lastActivityTs || null);
    const baseUrl = resolveExternalBaseUrl(ctx);
    const profileItems = await fetchProfileItems(myFeedId, rawPrefs);
    const profileFilterType = String(ctx.query.type || '').toLowerCase();
    const profileSpreadable = new Set(['post','audio','video','image','document','torrent','file','bookmark','event','calendar','task','votes','vote','market','shop','shopProduct','project','industry','industryBuild','industryBlueprint','transfer','housing','job','report','chat','chatMessage','pad','padEntry','room','wikiPage','emergency','mailingList','logisticsRoute','podcast','podcastEpisode','campaign','forum','map','schoolCourse']);
    const profileSpreadKeys = profileActionsOf(allActions, myFeedId).filter(a => a && a.id && typeof a.id === 'string' && a.id.startsWith('%') && /\.sha256$/.test(a.id) && profileSpreadable.has(a.type)).map(a => a.id);
    const profilePage = await renderedPage(async () => authorView({ feedId: myFeedId, oasisVersion: OASIS_VERSION || await getOasisVersion(myFeedId), messages: sanitizeMessages(messages), firstPost, lastPost, name, description, avatarUrl: getAvatarUrl(image), relationship: { me: true }, ecoAddress, karmaScore: bankData.karmaScore, estimatedUBI: bankData.estimatedUBI || 0, lastClaimedDate: bankData.lastClaimedDate || null, totalClaimed: bankData.totalClaimed || 0, carbonGrams, larpHouse, lastActivityBucket, visibilityPrefs, stats, baseUrl, userActions, allActions, profileItems, profileFilterType, gpgFingerprint, spreadMap: new Map(), fediverseConfigured: fediverseModel.hasAccount() }));
    const profilePageKeys = new Set();
    for (const it of profilePage) { const c = (it && it.content) || {}; for (const k of [it && it.id, it && it.rootId, it && it.tipId, c.threadId, c.chatRoot, c.root && c.root.id, ...(Array.isArray(c.replies) ? c.replies.map(r => r && r.id) : [])]) if (k) profilePageKeys.add(k); }
    const spreadMap = await spreads.forMessages(profileSpreadKeys.filter(k => profilePageKeys.has(k))).catch(() => new Map());
    ctx.body = await authorView({ feedId: myFeedId, oasisVersion: OASIS_VERSION || await getOasisVersion(myFeedId), messages: sanitizeMessages(messages), firstPost, lastPost, name, description, avatarUrl: getAvatarUrl(image), relationship: { me: true }, ecoAddress, karmaScore: bankData.karmaScore, estimatedUBI: bankData.estimatedUBI || 0, lastClaimedDate: bankData.lastClaimedDate || null, totalClaimed: bankData.totalClaimed || 0, carbonGrams, larpHouse, lastActivityBucket, visibilityPrefs, stats, baseUrl, userActions, allActions, profileItems, profileFilterType, gpgFingerprint, spreadMap, fediverseConfigured: fediverseModel.hasAccount() });
  })
  .get("/profile/:feedId/gpg.asc", async (ctx) => {
    const feedId = String(ctx.params.feedId || '').trim();
    const blobId = feedId ? await about.gpgBlobId(feedId).catch(() => '') : '';
    if (!blobId || !String(blobId).startsWith('&')) { sendErrorPage(ctx, 'Not found', { status: 404 }); return; }
    ctx.redirect(`/blob/${encodeURIComponent(blobId)}?name=${encodeURIComponent(`${feedId.slice(1, 9)}-gpg.asc`)}`);
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
        const keysDir = stateKeysDir();
        await promisesFs.mkdir(keysDir, { recursive: true }).catch(() => {});
        const safeName = encodeURIComponent(myFeedId) + '.asc';
        await promisesFs.writeFile(path.join(keysDir, safeName), armored, 'utf8');
      }
    }
    const body = ctx.request.body || {};
    const flag = (v) => v === '1' || v === 'on' || v === true;
    const prevPrefs = (await about.visibilityPrefs(getViewerId()).catch(() => null)) || {};
    const clearnetShops = prevPrefs.clearnetShops === true;
    const clearnetSchool = prevPrefs.clearnetSchool === true;
    const clearnetMarket = prevPrefs.clearnetMarket === true;
    const clearnetFeed = prevPrefs.clearnetFeed === true;
    const clearnetWiki = prevPrefs.clearnetWiki === true;
    const profileMarket     = flag(body.vis_profileMarket);
    const profileFeed       = flag(body.vis_profileFeed);
    const profileWiki       = flag(body.vis_profileWiki);
    const clearnetJobs = prevPrefs.clearnetJobs === true;
    const clearnetEvents = prevPrefs.clearnetEvents === true;
    const clearnetProjects = prevPrefs.clearnetProjects === true;
    const clearnetPosts = prevPrefs.clearnetPosts === true;
    const clearnetAudios = prevPrefs.clearnetAudios === true;
    const clearnetVideos = prevPrefs.clearnetVideos === true;
    const clearnetImages = prevPrefs.clearnetImages === true;
    const clearnetDocuments = prevPrefs.clearnetDocuments === true;
    const clearnetTorrents = prevPrefs.clearnetTorrents === true;
    const clearnetFiles = prevPrefs.clearnetFiles === true;
    const clearnetBookmarks = prevPrefs.clearnetBookmarks === true;
    const clearnetPodcasts = prevPrefs.clearnetPodcasts === true;
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
    const profileFiles      = flag(body.vis_profileFiles);
    const profileBookmarks  = flag(body.vis_profileBookmarks);
    const profilePodcasts   = flag(body.vis_profilePodcasts);
    const profileSchool     = flag(body.vis_profileSchool);
    const visibilityPrefs = {
      activity: flag(body.vis_activity),
      device:   true,
      karma:    flag(body.vis_karma),
      ubi:      flag(body.vis_ubi),
      wallet:   flag(body.vis_wallet),
      ecoTax:   flag(body.vis_ecoTax),
      larpSign: flag(body.vis_larpSign),
      gpg:      flag(body.vis_gpg),
      phone:    desiredPhoneVisibility(),
      fediverse: flag(body.vis_fediverse),
      fediverseHandle: flag(body.vis_fediverse) ? mastodonHandle() : '',
      clearnet: clearnetShops || clearnetSchool || clearnetJobs || clearnetEvents || clearnetProjects || clearnetPosts || clearnetAudios || clearnetVideos || clearnetImages || clearnetDocuments || clearnetTorrents || clearnetFiles || clearnetBookmarks || clearnetPodcasts || clearnetMarket || clearnetFeed || clearnetWiki,
      ...(prevPrefs.clearnetSince ? { clearnetSince: prevPrefs.clearnetSince } : {}),
      clearnetMarket,
      clearnetFeed,
      clearnetWiki,
      profileMarket,
      profileFeed,
      profileWiki,
      clearnetShops,
      clearnetSchool,
      clearnetJobs,
      clearnetEvents,
      clearnetProjects,
      clearnetPosts,
      clearnetAudios,
      clearnetVideos,
      clearnetImages,
      clearnetDocuments,
      clearnetTorrents,
      clearnetFiles,
      clearnetBookmarks,
      clearnetPodcasts,
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
      profileFiles,
      profileBookmarks,
      profilePodcasts,
      profileSchool
    };
    await post.publishProfileEdit({
      name: stripDangerousTags(String(body.name || '')),
      description: stripDangerousTags(String(body.description || '')),
      image: imageData,
      visibilityPrefs,
      gpgFingerprint: gpgKeyFingerprint,
      gpgBlob: gpgKeyBlob
    });
    if (visibilityPrefs.wallet) {
      try {
        const me = getViewerId();
        const local = readAddrMap()[me];
        const localAddress = typeof local === 'string' ? local : (local && local.address) || null;
        if (localAddress && !(await bankingModel.hasPublishedAddress(me))) await bankingModel.addAddress({ userId: me, address: localAddress });
      } catch (_) {}
    }
    ctx.redirect("/profile");
  })
  .post("/profile/gpg/remove", koaBody(), async (ctx) => {
    const myFeedId = await meta.myFeedId();
    const keyPath = path.join(stateKeysDir(), encodeURIComponent(myFeedId) + '.asc');
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
      const keyPath = path.join(stateKeysDir(), encodeURIComponent(feedId) + '.asc');
      armored = await promisesFs.readFile(keyPath, 'utf8').catch(() => '');
    }
    if (!armored) { ctx.status = 404; ctx.body = ''; return; }
    ctx.set('Content-Type', 'application/pgp-keys; charset=utf-8');
    ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(feedId)}.asc"`);
    ctx.body = armored;
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
  .get("/blob/:blobId", async (ctx) => { blobCacheModel.touch(ctx.params.blobId); return serveBlob(ctx); })
  .get("/c/blob/:cnBlobId", async (ctx) => {
    const blobId = ctx.params.cnBlobId;
    if (!isBlob(blobId) || !(await clearnetBlobAllowed(blobId))) { ctx.status = 404; ctx.body = ''; return; }
    let buffer;
    try { buffer = await blob.getLocal({ blobId }); } catch (_) {}
    if (!buffer) {
      ctx.status = 404; ctx.body = ''; return;
    }
    let mime = 'application/octet-stream';
    try {
      const ft = await FileType.fromBuffer(buffer);
      if (ft && ft.mime) mime = ft.mime;
    } catch (_) {}
    if (mime === 'application/octet-stream' && buffer.length > 10 && buffer[0] === 0x64) {
      const head = buffer.slice(0, 512).toString('ascii');
      if (head.includes('announce') || head.includes('8:announce') || head.includes('4:info')) mime = 'application/x-bittorrent';
    }
    const qName = ctx.query.name ? String(ctx.query.name).replace(/["\r\n\\/]/g, '').trim().slice(0, 200) : '';
    if (qName && /\.torrent$/i.test(qName) && mime === 'application/octet-stream') mime = 'application/x-bittorrent';
    ctx.set('Cache-Control', 'public, max-age=31536000, immutable');
    if (mime.startsWith('image/') && getSharp()) {
      try {
        const img = getSharp()(buffer, { failOn: 'none' });
        const meta = await img.metadata().catch(() => ({}));
        const format = (meta.format && ['jpeg','png','webp','avif','gif'].includes(meta.format)) ? meta.format : 'jpeg';
        const out = await img.rotate().toFormat(format).toBuffer();
        ctx.type = `image/${format === 'jpeg' ? 'jpeg' : format}`;
        if (qName) ctx.set('Content-Disposition', contentDisposition('attachment', qName));
        ctx.body = out;
        return;
      } catch (_) {}
    }
    ctx.type = mime;
    if (qName) {
      ctx.set('Content-Disposition', contentDisposition('attachment', qName));
    } else if (mime === 'application/x-bittorrent') {
      ctx.set('Content-Disposition', `attachment; filename="download.torrent"`);
    }
    sendBlobBuffer(ctx, buffer);
  })
  .get("/qr/:feedId", sendFeedQr)
  .get("/c/qr/:feedId", sendFeedQr)
  .get("/qr-invite/tribe/:id", async (ctx) => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.status = 404; ctx.body = ''; return; }
    try {
      const oi = await tribesModel.getOpenInvite(ctx.params.id).catch(() => null);
      if (!oi) { ctx.status = 404; ctx.body = ''; return; }
      const QRCode = require('../server/node_modules/qrcode');
      const joinUrl = `${QR_ACTION_BASE}/tribes/open-invite/join/${encodeURIComponent(ctx.params.id)}`;
      const buf = await QRCode.toBuffer(joinUrl, { type: 'png', width: 240, margin: 1, errorCorrectionLevel: 'M' });
      ctx.set('Content-Type', 'image/png');
      ctx.set('Cache-Control', 'no-store');
      ctx.body = buf;
    } catch (e) { ctx.status = 500; ctx.body = ''; }
  })
  .get("/qr-invite/shop/:id", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.status = 404; ctx.body = ''; return; }
    try {
      const oi = await shopsModel.getOpenInvite(ctx.params.id).catch(() => null);
      if (!oi) { ctx.status = 404; ctx.body = ''; return; }
      const QRCode = require('../server/node_modules/qrcode');
      const joinUrl = `${QR_ACTION_BASE}/shops/open-invite/join/${encodeURIComponent(ctx.params.id)}`;
      const buf = await QRCode.toBuffer(joinUrl, { type: 'png', width: 240, margin: 1, errorCorrectionLevel: 'M' });
      ctx.set('Content-Type', 'image/png');
      ctx.set('Cache-Control', 'no-store');
      ctx.body = buf;
    } catch (e) { ctx.status = 500; ctx.body = ''; }
  })
  .get("/qr-clearnet/:feedId", async (ctx) => {
    const feedId = decodeURIComponent(ctx.params.feedId || '');
    const reqSize = parseInt(ctx.query.size, 10);
    const width = Number.isFinite(reqSize) ? Math.max(64, Math.min(512, reqSize)) : 240;
    try {
      const QRCode = require('../server/node_modules/qrcode');
      const targetUrl = `${resolveExternalBaseUrl(ctx)}/c/inhabitant/${encodeURIComponent(feedId)}`;
      const buf = await QRCode.toBuffer(targetUrl, { type: 'png', width, margin: 1, errorCorrectionLevel: 'M' });
      ctx.set('Content-Type', 'image/png');
      ctx.set('Cache-Control', 'no-store');
      ctx.body = buf;
    } catch (e) {
      ctx.status = 500;
      ctx.body = '';
    }
  })
  .get("/image/:imageSize/:blobId", async (ctx) => {
    const { blobId, imageSize } = ctx.params;
    blobCacheModel.touch(blobId);
    const size = Number(imageSize);
    const cacheKey = `${size}:${blobId}`;
    const hit = resizedImages.get(cacheKey);
    if (hit) {
      resizedImages.delete(cacheKey);
      resizedImages.set(cacheKey, hit);
      ctx.set("Content-Type", hit.type);
      ctx.set("Cache-Control", "public, max-age=31536000, immutable");
      ctx.body = hit.body;
      return;
    }
    const fallbackPixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64"
    );
    const fakeImage = () => {
      if (!getSharp()) {
        return Promise.resolve(fallbackPixel);
      }
      return getSharp()({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0.5 },
        },
      }).png().toBuffer();
    };
    const avatarFallback = ctx.query.fallback === 'avatar';
    const fallbackImage = async () => {
      ctx.set("Content-Type", "image/png");
      ctx.set("Cache-Control", "no-cache");
      if (avatarFallback) {
        try {
          return fs.readFileSync(path.join(__dirname, "../client/assets/images/default-avatar.png"));
        } catch (_) {}
      }
      return fakeImage();
    };
    try {
      const buffer = avatarFallback ? await blob.getCached({ blobId }) : await blob.getResolved({ blobId, timeout: 8000 });
      if (!buffer) {
        ctx.body = await fallbackImage();
        return;
      }
      let type = (await FileType.fromBuffer(buffer))?.mime || "application/octet-stream";
      let body = buffer;
      if (getSharp()) {
        body = await getSharp()(buffer)
          .resize(size, size)
          .png()
          .toBuffer();
        type = "image/png";
      }
      ctx.set("Content-Type", type);
      ctx.set("Cache-Control", "public, max-age=31536000, immutable");
      ctx.body = body;
      if (body.length <= RESIZED_IMAGES_MAX_BYTES / 16) {
        resizedImages.set(cacheKey, { type, body });
        resizedImagesBytes += body.length;
        for (const [k, v] of resizedImages) {
          if (resizedImagesBytes <= RESIZED_IMAGES_MAX_BYTES) break;
          resizedImages.delete(k);
          resizedImagesBytes -= v.body.length;
        }
      }
    } catch (err) {
      ctx.body = await fallbackImage();
    }
  })
  .get("/settings", async (ctx) => {
    const cfg = getConfig(), theme = ctx.cookies.get("theme") || "Dark-SNH";
    const verification = settingsReports.verification;
    const rebuild = settingsReports.rebuild;
    settingsReports.verification = null;
    settingsReports.rebuild = null;
    let aiExportCount = 0;
    if (cfg.modules?.aiMod === 'on') { try { aiExportCount = ((await listAiExchanges()).exchanges || []).length; } catch (_) { aiExportCount = 0; } }
    let blobCacheUsage = null;
    try { blobCacheUsage = await blobCacheModel.usage(); } catch (_) { blobCacheUsage = null; }
    const blobCache = { maxMB: Number(cfg.blobCache && cfg.blobCache.maxMB) || 0, usage: blobCacheUsage, cleaned: ctx.query.cleaned === undefined ? null : Number(ctx.query.cleaned) || 0, freed: Number(ctx.query.freed) || 0 };
    ctx.body = await settingsView({ theme, version: version.toString(), aiPrompt: cfg.ai?.prompt || "", aiExportCount, blobCache, fediverseAccount: fediverseModel.getAccount(), telegramAccount: fediverseModel.telegram.getAccount(), telegramLogin: fediverseModel.telegram.loginState(), peertubeAccount: fediverseModel.peertube.getAccount(), verification, rebuild });
  })
  .get("/peers", async (ctx) => {
    const { discoveredPeers, unknownPeers } = await meta.discovered();
    const lanBroadcastActive = !ssbConfig.pub && getConfig().lanBroadcasting !== false;
    const technicalPeers = await listConnectionPeers();
    const onlinePeersList = await meta.onlinePeers();
    const versionKeys = new Set();
    for (const coll of [onlinePeersList, discoveredPeers, unknownPeers]) {
      for (const entry of (coll || [])) {
        const k = entry && entry[1] && entry[1].key;
        if (k) versionKeys.add(k);
      }
    }
    for (const tp of technicalPeers) if (tp && tp.key) versionKeys.add(tp.key);
    const versions = {};
    const lastErrors = await readPeerLastErrors();
    const onionKeys = await onionPeerKeys();
    const staleKeys = [];
    await Promise.all(Array.from(versionKeys).map(async (k) => {
      versions[k] = String(k) === String(getViewerId()) ? OASIS_VERSION : await getOasisVersion(k).catch(() => null);
      if (!versions[k] && await feedHasMessages(k)) staleKeys.push(k);
    }));
    ctx.body = await peersView({ onlinePeers: onlinePeersList, discoveredPeers, unknownPeers, lanBroadcastActive, technicalPeers, versions, staleKeys, onionKeys: [...onionKeys], ownVersion: OASIS_VERSION, lastErrors, paused: getConfig().networkPaused === true || process.env.OASIS_NETWORK_PAUSED === '1' });
  })
  .get("/graphos", async (ctx) => {
    if (!checkMod(ctx, 'graphosMod')) return ctx.redirect('/modules');
    try {
      const ssbForLan = await cooler.open();
      try { if (ssbForLan.lan && typeof ssbForLan.lan.stop === 'function') ssbForLan.lan.stop(); } catch (_) {}
      try { if (ssbForLan.lan && typeof ssbForLan.lan.start === 'function') ssbForLan.lan.start(); } catch (_) {}
    } catch (_) {}
    const asked = String(ctx.query?.filter || 'ALL').toUpperCase();
    if (asked === 'FEDERATION') {
      ctx.body = await graphosFederationView(await federationState());
      return;
    }
    const filter = asked === 'MINE' ? 'MINE' : 'ALL';
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
    const GRAPHOS_MAX_NODES = 48;
    const FEED_RE = /^@[A-Za-z0-9+/]+=?\.ed25519$/;
    const centerRaw = ctx.query?.center ? decodeURIComponent(String(ctx.query.center)) : null;
    const isFocus = !!(centerRaw && FEED_RE.test(centerRaw) && centerRaw !== myId);

    if (isFocus) {
      const graph = await new Promise((res) => {
        try { ssb.friends.graph((err, g) => res(err ? {} : (g || {}))); } catch (_) { res({}); }
      });
      const rel = graph[centerRaw] || {};
      const followedAll = Object.entries(rel).filter(([, v]) => v >= 0).map(([k]) => k).filter(k => k !== centerRaw && k !== myId);
      const followedIds = followedAll.slice(0, GRAPHOS_MAX_NODES);
      const focusPeers = await Promise.all(followedIds.map(async (k) => ({ key: k, name: await resolveName(k), kind: 'discovered' })));
      focusPeers.push({ key: myId, name: await resolveName(myId), kind: 'me' });
      const focusMe = { key: centerRaw, name: await resolveName(centerRaw), kind: 'online' };
      const kpis = { total: followedAll.length, online: 0, discovered: followedAll.length, unknown: 0 };
      ctx.body = await graphosView({ filter, me: focusMe, peers: focusPeers, links: graphLinks(graph, focusPeers.map(p => p.key)), kpis, focus: String(focusMe.name || centerRaw).replace(/^@/, ''), focusId: centerRaw, shown: followedIds.length, total: followedAll.length });
      return;
    }

    const keysOf = (entries) => {
      const s = new Set();
      for (const [, data] of entries) if (data && data.key) s.add(data.key);
      return s;
    };
    const onlineKeys = keysOf(onlinePeers);
    const unknownKeys = keysOf(unknownPeers);
    const seen = new Set([myId]);
    const nodes = [];
    const addFrom = (entries) => {
      for (const [, data] of entries) {
        if (!data || !data.key || seen.has(data.key)) continue;
        seen.add(data.key);
        const isOnline = onlineKeys.has(data.key);
        const cat = unknownKeys.has(data.key) ? 'unknown' : 'discovered';
        nodes.push({ key: data.key, isOnline, cat, kind: isOnline ? 'online' : cat });
      }
    };
    addFrom(onlinePeers);
    addFrom(discoveredPeers);
    addFrom(unknownPeers);
    const shownNodes = nodes.slice(0, GRAPHOS_MAX_NODES);
    const peers = await Promise.all(shownNodes.map(async (p) => ({
      key: p.key,
      name: await resolveName(p.key),
      kind: p.kind
    })));
    const me = { key: myId, name: await resolveName(myId), kind: 'online' };
    const fullGraph = await new Promise((res) => {
      try { ssb.friends.graph((err, g) => res(err ? {} : (g || {}))); } catch (_) { res({}); }
    });
    const discoveredCount = nodes.filter(n => n.cat === 'discovered').length;
    const unknownCount = nodes.filter(n => n.cat === 'unknown').length;
    const onlineCount = nodes.filter(n => n.isOnline).length;
    const kpis = {
      total: discoveredCount + unknownCount,
      online: onlineCount,
      discovered: discoveredCount,
      unknown: unknownCount
    };
    ctx.body = await graphosView({ filter, me, peers, links: graphLinks(fullGraph, peers.map(p => p.key)), kpis, shown: peers.length, total: nodes.length });
  })
  .get("/larp", async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    larpModel.init().catch(() => {});
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
    try {
      const allTribes = await tribesModel.listAll();
      await tribesModel.enrichOpenInvites(allTribes);
      for (const h of houses) {
        const tr = allTribes.find(t => (t.tags || []).some(x => String(x).startsWith('larp-') && String(x).slice(5).toLowerCase() === h.key));
        if (tr && tr.openInviteCode) h.openInviteCode = tr.openInviteCode;
      }
    } catch (_) {}
    ctx.body = larpListView({ filter, houses, myHouseKey, cycle, governingKey, governingHouse, governingMembers, governingPosts, canPost, q: String(ctx.query.q || '').trim() });
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
    if (!result) return actionFail(ctx, `/larp/${encodeURIComponent(houseKey || '')}`);
    ctx.redirect(`/larp/${encodeURIComponent(houseKey)}?invite=${encodeURIComponent(result.code)}`);
  })
  .post("/larp/invite/redeem", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    const code = String((ctx.request.body && ctx.request.body.code) || '').trim();
    const ret = String((ctx.request.body && ctx.request.body.returnTo) || '').trim();
    let result = null;
    try { result = await larpModel.redeemHouseInvite(code); } catch (_) { result = null; }
    if (result && result.ok) return ctx.redirect(`/larp/${encodeURIComponent(result.house)}`);
    const back = isLocalPath(ret) ? ret : '/larp';
    failWith(ctx, 'inviteCodeInvalid', back);
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
    if (myHouseKey === houseKey) {
      Promise.resolve().then(async () => {
        try { await larpModel.ensureHouseTribe(houseKey); } catch (_) {}
        try { await larpModel.issueAutoInvitesForMyHouse(); } catch (_) {}
        try { await larpModel.redeemPendingAutoInvites(); } catch (_) {}
      });
    }
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
    try { await larpModel.publishJoin('academia'); } catch (_) { return actionFail(ctx); }
    const larpReturnTo = String((ctx.request.body && ctx.request.body.returnTo) || '');
    ctx.redirect(larpReturnTo === '/welcome' ? '/welcome' : '/larp/academia');
  })
  .post("/larp/leave", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    try { await larpModel.publishLeaveLarp(); } catch (_) { return actionFail(ctx); }
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
    if (myHouseKey !== houseKey) { ctx.redirect('/larp'); return; }
    try { await larpModel.publishHousePost({ house: houseKey, text }); }
    catch (e) {
      if (isSsbTooLargeError(e)) { sendErrorPage(ctx, require('../views/main_views').i18n.publishTooLong || 'Your post is too long. Please shorten it.', { status: 400 }); return; }
    }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(`/larp/${encodeURIComponent(houseKey)}`);
  })
  .get("/invites", async (ctx) => {
    if (!checkMod(ctx, 'invitesMod')) return ctx.redirect('/modules');
    ctx.body = await invitesView({ deadKeys: await deadPeerKeys() });
  })
  .get("/supporters", async (ctx) => {
    const feed = getViewerId();
    const supporters = (await inhabitantsModel.listSupporters(feed).catch(() => [])).filter(id => !sharedState.isPubId(id));
    await warmAuthorNames(supporters.map(id => ({ author: id })));
    ctx.body = await supportersView({ supporters, feed, name: await about.name(feed) });
  })
  .get("/likes/:feed", async (ctx) => {
    const { feed } = ctx.params;
    const messages = await post.likes({ feed });
    const spreadMap = await spreads.forMessages((messages || []).map(m => m && m.key)).catch(() => new Map());
    ctx.body = await likesView({ messages, feed, name: await about.name(feed), spreadMap });
  })
  .get("/mentions", async (ctx) => {
    const filter = String(ctx.query.filter || 'ALL');
    const q = String(ctx.query.q || '').trim();
    const all = await mentionsModel.listMentions('ALL', { q });
    const counts = await mentionsModel.countTypes(all);
    const items = filter === 'ALL' ? all : all.filter(x => x.type === filter);
    await warmAuthorNames(pageOf(ctx, items));
    try { sharedState.setMentionsTotal(all.length); sharedState.setMentionsCount(mentionsModel.unseenOf(all).length); } catch (_) {}
    ctx.body = await mentionsView(items, filter, { counts, total: all.length, q, readKeys: Array.from(mentionsModel.readKeys()), spreadMap: await spreads.forMessages(pageOf(ctx, items).map(x => x && (x.id || x.key))).catch(() => new Map()) });
  })
  .post('/mentions/read/:key', koaBody(), async ctx => {
    if (!isMsgKey(ctx.params.key)) { ctx.throw(400, 'Invalid message key'); return; }
    mentionsModel.markRead(ctx.params.key);
    try { await refreshMentionsCount(); } catch (_) {}
    safeRefererRedirect(ctx, '/mentions');
  })
  .post('/mentions/unread/:key', koaBody(), async ctx => {
    if (!isMsgKey(ctx.params.key)) { ctx.throw(400, 'Invalid message key'); return; }
    mentionsModel.markUnread(ctx.params.key);
    try { await refreshMentionsCount(); } catch (_) {}
    safeRefererRedirect(ctx, '/mentions');
  })
  .post('/mentions/read-all', koaBody(), async ctx => {
    mentionsModel.markReadMany(pickMsgKeys((ctx.request.body || {}).keys));
    try { await refreshMentionsCount(); } catch (_) {}
    safeRefererRedirect(ctx, '/mentions');
  })
  .get('/opinions', async (ctx) => {
    const filter = qf(ctx, 'RECENT');
    const q = String(ctx.query.q || '').trim();
    let opinions = await opinionsModel.listOpinions(filter);
    if (Array.isArray(opinions)) opinions = await applyListFilters(opinions, ctx);
    if (q && Array.isArray(opinions)) {
      const needle = q.toLowerCase();
      opinions = opinions.filter(m => {
        const c = (m && m.value && m.value.content) || {};
        return [c.title, c.name, c.question, c.description, c.text, c.concept, ...(Array.isArray(c.tags) ? c.tags : [])]
          .some(v => String(v || '').toLowerCase().includes(needle));
      });
    }
    if (recentFallback(ctx, Array.isArray(opinions) ? opinions : [], 'ALL')) return;
    const allOpinions = String(filter).toUpperCase() === 'ALL' && !q
      ? opinions
      : await opinionsModel.listOpinions('ALL').catch(() => []);
    const favIndex = await contentFavorites.getFavoriteIndex().catch(() => new Map());
    const pageItems = await renderedPage(async () => opinionsView(opinions, filter, new Map(), q, allOpinions, { favIndex }));
    const spreadMap = await spreads.forMessages(pageItems.map(it => it && it.key)).catch(() => new Map());
    await warmAuthorNames(pageItems);
    ctx.body = await opinionsView(opinions, filter, spreadMap, q, allOpinions, { favIndex });
  })
  .get("/feed", async (ctx) => {
    const filter = String(ctx.query.filter || "RECENT").toUpperCase();
    const q = typeof ctx.query.q === "string" ? ctx.query.q : "";
    const tag = typeof ctx.query.tag === "string" ? ctx.query.tag : "";
    const msg = typeof ctx.query.msg === "string" ? ctx.query.msg : "";
    const tribeOpen = (await tribeItemsFor('feed')).map(t => ({ key: t.key, rootId: t.rootId, value: { author: t.author, timestamp: Date.parse(t.createdAt) || t._ts || 0, content: { type: 'feed', text: String(t.description || '').trim(), author: t.author, createdAt: t.createdAt, tags: (String(t.description || '').match(/#[A-Za-z0-9_]{1,32}/g) || []).map(x => x.slice(1).toLowerCase()) } }, tribeOrigin: t.tribeOrigin })).filter(f => f.value.content.text);
    const tribeTerms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const tribeShown = ['RECENT', 'TODAY', 'MINE', 'ALL'].includes(filter) ? tribeOpen.filter(f => (filter !== 'MINE' || f.value.author === getViewerId()) && (!['RECENT', 'TODAY'].includes(filter) || Date.now() - f.value.timestamp < 86400000) && tribeTerms.every(term => f.value.content.text.toLowerCase().includes(term)) && (!tag.trim() || f.value.content.tags.includes(tag.trim().toLowerCase()))) : [];
    let feeds = (await feedModel.listFeeds({ filter, q, tag })).concat(tribeShown).sort((a, b) => filter === 'TOP' ? 0 : (b.value?.timestamp || 0) - (a.value?.timestamp || 0));
    feeds = await applyListFilters(feeds, ctx);
    if (recentFallback(ctx, feeds, 'ALL')) return;
    const uxFeed = getConfig().ux?.current === 'feed';
    let trendingTags = [];
    let activeUsers = [];
    if (uxFeed) {
      try { trendingTags = ((await tagsModel.listTags('top')) || []).slice(0, 10); } catch (_) {}
      try {
        const ids = [];
        const seen = new Set();
        for (const f of feeds) {
          const aid = f?.value?.author;
          if (!aid || seen.has(aid)) continue;
          seen.add(aid);
          ids.push(aid);
          if (ids.length >= 8) break;
        }
        activeUsers = await Promise.all(ids.map(async (id) => ({ id, avatarUrl: getAvatarUrl(await about.image(id).catch(() => null)) })));
      } catch (_) {}
    }
    const censusFeeds = (String(filter || 'ALL').toUpperCase() === 'ALL' && !q && !tag) ? feeds : (await censusOf('feeds', () => feedModel.listFeeds({ filter: 'ALL', q: '', tag: '' })).catch(() => [])).concat(tribeOpen);
    await annotateClearnet('feed', feeds);
    const pageItems = await renderedPage(async () => feedView(feeds, { filter, q, tag, msg, workspace: uxFeed, trendingTags, activeUsers, spreadMap: new Map(), censusList: censusFeeds, viewerPrefs: await about.visibilityPrefs(getViewerId()).catch(() => null), viewerId: getViewerId() }));
    const feedSpreadMap = await spreads.forMessages(pageItems.map(f => f && f.key)).catch(() => new Map());
    await warmAuthorNames(pageItems);
    ctx.body = feedView(feeds, { filter, q, tag, msg, workspace: uxFeed, trendingTags, activeUsers, spreadMap: feedSpreadMap, censusList: censusFeeds, viewerPrefs: await about.visibilityPrefs(getViewerId()).catch(() => null), viewerId: getViewerId() });
  })
  .get("/feed/create", async (ctx) => {
    const q = typeof ctx.query.q === "string" ? ctx.query.q : "";
    const tag = typeof ctx.query.tag === "string" ? ctx.query.tag : "";
    const msg = typeof ctx.query.msg === "string" ? ctx.query.msg : "";
    ctx.body = feedCreateView({ q, tag, msg });
  })
  .get("/feed/:feedId", async (ctx) => {
    const feed = await feedModel.getFeedById(ctx.params.feedId);
    if (!feed) { ctx.redirect('/feed'); return; }
    const comments = await feedModel.getComments(ctx.params.feedId).catch(() => []);
    const singleCensus = await censusOf('feeds', () => feedModel.listFeeds({ filter: 'ALL', q: '', tag: '' })).catch(() => []);
    if (feed) feed.clearnet = await clearnetPublic('feed', feed).catch(() => false);
    ctx.body = singleFeedView(feed, comments, { censusList: singleCensus, spreads: await spreads.forMessage(feed.key).catch(() => null) });
  })
  .get("/multiverse", async (ctx) => { ctx.redirect('/fediverse'); })
  .get("/fediverse", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    const account = fediverseModel.getAccount();
    const stats = account ? await fediverseModel.getAccountStats() : null;
    const telegram = fediverseModel.telegram.getAccount();
    const telegramStats = telegram ? await fediverseModel.telegram.getAccountStats().catch(() => null) : null;
    const peertube = fediverseModel.peertube.getAccount();
    const peertubeStats = peertube ? await fediverseModel.peertube.getAccountStats().catch(() => null) : null;
    ctx.body = fediverseOverviewView({ account, stats, telegram, telegramStats, peertube, peertubeStats });
  })
  .get("/fediverse/telegram", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    if (!fediverseModel.telegram.hasAccount()) { ctx.redirect('/fediverse'); return; }
    const data = await fediverseModel.telegram.getDialogs(!!ctx.query.refresh);
    const stats = data && !data.error ? await fediverseModel.telegram.getAccountStats().catch(() => null) : null;
    ctx.body = telegramDialogsView({ account: fediverseModel.telegram.getAccount(), stats, dialogs: data.dialogs, error: data.error });
  })
  .get("/fediverse/telegram/chat/:id", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    if (!fediverseModel.telegram.hasAccount()) { ctx.redirect('/fediverse'); return; }
    const account = fediverseModel.telegram.getAccount();
    let chat = null, error;
    try { chat = await fediverseModel.telegram.getChat(ctx.params.id); } catch (err) { error = tgErrorCode(err); }
    const stats = await fediverseModel.telegram.getAccountStats().catch(() => null);
    ctx.body = telegramChatView({ account, stats, chat, error });
  })
  .post("/fediverse/telegram/chat/:id/send", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    const back = `/fediverse/telegram/chat/${encodeURIComponent(ctx.params.id)}`;
    try {
      const files = ctx.request.files || {};
      const raw = files.media;
      const file = Array.isArray(raw) ? raw.find(f => f && f.size > 0) : (raw && raw.size > 0 ? raw : null);
      await fediverseModel.telegram.sendMessage(ctx.params.id, { text: ctx.request.body?.text || '', file });
    } catch (err) {
      fediverseFail(ctx, tgErrorCode(err), back);
      return;
    }
    ctx.redirect(back);
  })
  .get("/fediverse/telegram/media/:chat/:msg", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod') || !fediverseModel.telegram.hasAccount()) { ctx.status = 404; ctx.body = ''; return; }
    const media = await fediverseModel.telegram.getMedia(ctx.params.chat, ctx.params.msg).catch(() => null);
    if (!media) { ctx.status = 404; ctx.body = ''; return; }
    ctx.set('Cache-Control', 'private, max-age=3600');
    const safeType = inlineMediaType(media.contentType);
    const tgDisposition = String(ctx.query.download || '') === '1' || !safeType ? 'attachment' : 'inline';
    if (media.name || tgDisposition === 'attachment') ctx.set('Content-Disposition', `${tgDisposition}; filename="${String(media.name || `telegram-${ctx.params.msg}.${String(media.contentType.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'}`).replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
    ctx.set('Content-Security-Policy', 'sandbox');
    ctx.type = safeType || 'application/octet-stream';
    ctx.body = media.buffer;
  })
  .get("/fediverse/telegram/avatar/:peer", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod') || !fediverseModel.telegram.hasAccount()) { ctx.status = 404; ctx.body = ''; return; }
    const media = await fediverseModel.telegram.getAvatar(ctx.params.peer).catch(() => null);
    if (!media) { ctx.redirect('/assets/images/default-avatar.png'); return; }
    ctx.set('Cache-Control', 'private, max-age=3600');
    ctx.type = media.contentType;
    ctx.body = media.buffer;
  })
  .get("/fediverse/peertube", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    if (!fediverseModel.peertube.hasAccount()) { ctx.redirect('/fediverse'); return; }
    const stats = await fediverseModel.peertube.getAccountStats().catch(() => null);
    const asked = ctx.query.filter === 'mine' || ctx.query.filter === 'subscriptions' ? ctx.query.filter : null;
    const kind = asked || (stats && stats.subscriptions === 0 ? 'mine' : 'subscriptions');
    const data = await fediverseModel.peertube.getFeed(kind, !!ctx.query.refresh);
    const error = (data && data.error) || undefined;
    const notice = typeof ctx.query.notice === 'string' && /^[a-zA-Z]+$/.test(ctx.query.notice) ? ctx.query.notice : undefined;
    ctx.body = peertubeFeedView({ account: fediverseModel.peertube.getAccount(), stats, videos: data.videos, kind, error, notice });
  })
  .get("/fediverse/peertube/upload", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    if (!fediverseModel.peertube.hasAccount()) { ctx.redirect('/fediverse'); return; }
    const stats = await fediverseModel.peertube.getAccountStats().catch(() => null);
    ctx.body = peertubeUploadView({ account: fediverseModel.peertube.getAccount(), stats });
  })
  .post("/fediverse/peertube/upload", koaBody({ multipart: true, formidable: { maxFileSize: FILESHARE_MAX_SIZE } }), async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    try {
      const raw = ctx.request.files ? ctx.request.files.video : null;
      const file = Array.isArray(raw) ? raw.find(f => f && f.size > 0) : raw;
      await fediverseModel.peertube.upload({ file, name: ctx.request.body?.name, description: ctx.request.body?.description, privacy: ctx.request.body?.privacy });
    } catch (err) {
      fediverseFail(ctx, err && err.message ? err.message : 'peertubeErrUpload', '/fediverse/peertube/upload');
      return;
    }
    ctx.redirect('/fediverse/peertube?filter=mine&refresh=1&notice=peertubeUploaded');
  })
  .get("/fediverse/peertube/video/:id", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    if (!fediverseModel.peertube.hasAccount()) { ctx.redirect('/fediverse'); return; }
    const account = fediverseModel.peertube.getAccount();
    const stats = await fediverseModel.peertube.getAccountStats().catch(() => null);
    const data = await fediverseModel.peertube.getVideo(ctx.params.id);
    const error = (data && data.error) || undefined;
    ctx.body = peertubeVideoView({ account, stats, video: data && data.video ? data.video : null, comments: data && data.comments ? data.comments : [], myRating: data && data.myRating ? data.myRating : 'none', error });
  })
  .post("/fediverse/peertube/video/:id/comment", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    const back = `/fediverse/peertube/video/${encodeURIComponent(ctx.params.id)}`;
    try { await fediverseModel.peertube.comment(ctx.params.id, ctx.request.body?.text); }
    catch (err) { fediverseFail(ctx, err && err.message ? err.message : 'peertubeErrComment', back); return; }
    ctx.redirect(back);
  })
  .post("/fediverse/peertube/video/:id/rate", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    const back = `/fediverse/peertube/video/${encodeURIComponent(ctx.params.id)}`;
    const rating = ctx.request.body?.rating === 'like' ? 'like' : 'none';
    try { await fediverseModel.peertube.rate(ctx.params.id, rating); } catch (_) {}
    ctx.redirect(back);
  })
  .get("/fediverse/peertube/stream", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod') || !fediverseModel.peertube.hasAccount()) { ctx.status = 404; ctx.body = ''; return; }
    const u = typeof ctx.query.u === 'string' ? ctx.query.u : '';
    const stream = await fediverseModel.peertube.openStream(u, ctx.headers.range).catch(() => null);
    if (!stream || !stream.body) { ctx.status = 404; ctx.body = ''; return; }
    ctx.status = stream.status;
    ctx.set('Accept-Ranges', 'bytes');
    ctx.set('Cache-Control', 'private, max-age=3600');
    if (stream.length) ctx.set('Content-Length', stream.length);
    if (stream.contentRange) ctx.set('Content-Range', stream.contentRange);
    ctx.type = stream.type;
    ctx.body = stream.body;
  })
  .get("/fediverse/mastodon", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    if (!fediverseModel.hasAccount()) { ctx.redirect('/fediverse'); return; }
    if (ctx.query.refresh) { try { fediverseModel.invalidateCache(); } catch (_) {} }
    const data = await fediverseModel.getTimeline();
    if (data && data.connected) { data.stats = await fediverseModel.getAccountStats(); }
    ctx.body = fediverseView(data);
  })
  .get("/fediverse/mastodon/thread/:id", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    if (!fediverseModel.hasAccount()) { ctx.redirect('/fediverse'); return; }
    const account = fediverseModel.getAccount();
    const stats = account ? await fediverseModel.getAccountStats() : null;
    const thread = await fediverseModel.getThread(ctx.params.id);
    const error = (thread && thread.error) || undefined;
    ctx.body = fediverseThreadView({ account, stats, thread, error });
  })
  .get("/fediverse/media", async (ctx) => {
    const u = typeof ctx.query.u === 'string' ? ctx.query.u : '';
    const media = await fediverseModel.proxyMedia(u);
    if (!media) { ctx.status = 404; ctx.body = ''; return; }
    ctx.set('Cache-Control', 'private, max-age=3600');
    const safeType = inlineMediaType(media.contentType);
    if (String(ctx.query.download || '') === '1' || !safeType) ctx.set('Content-Disposition', `attachment; filename="multiverse-${Date.now().toString(36)}.${String(media.contentType.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'}"`);
    ctx.set('Content-Security-Policy', 'sandbox');
    ctx.type = safeType || 'application/octet-stream';
    ctx.body = media.buffer;
  })
  .get("/fediverse/tmp/:name", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.status = 404; ctx.body = ''; return; }
    const name = ctx.params.name;
    if (!isFediverseTmpName(name)) { ctx.status = 404; ctx.body = ''; return; }
    try {
      const buf = fs.readFileSync(path.join(blobsPath, name));
      ctx.type = fediverseMimeFromExt(fediverseExtFromName(name));
      ctx.set('Cache-Control', 'private, max-age=300');
      ctx.body = buf;
    } catch (_) { ctx.status = 404; ctx.body = ''; }
  })
  .get("/fediverse/mastodon/preview", async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    if (!fediverseModel.hasAccount()) { ctx.redirect('/fediverse'); return; }
    sweepFediverseTmp();
    const account = fediverseModel.getAccount();
    const stats = account ? await fediverseModel.getAccountStats() : null;
    ctx.body = fediversePreviewView({ account, stats });
  })
  .post("/fediverse/mastodon/preview", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    sweepFediverseTmp();
    const text = ctx.request.body?.text || '';
    let existing = ctx.request.body?.tmp || [];
    if (!Array.isArray(existing)) existing = existing ? [existing] : [];
    existing = existing.filter(isFediverseTmpName).map(name => ({ name, type: fediverseTmpType(name) }));
    const fresh = saveFediverseTempMedia(ctx);
    const media = [...existing, ...fresh].slice(0, 4);
    const account = fediverseModel.getAccount();
    const stats = account ? await fediverseModel.getAccountStats() : null;
    if (!String(text).trim() && !media.length) ctx.state.inlineError = require('../views/main_views').i18n.fediverseErrEmpty;
    ctx.body = fediversePreviewView({ account, stats, text, media });
  })
  .post("/fediverse/mastodon/post", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    try {
      const text = ctx.request.body?.text || '';
      const tmpIds = await publishFediverseTempMedia(ctx.request.body?.tmp);
      const fileIds = (await collectFediverseMedia(ctx)).map(m => m.id);
      const mediaIds = [...tmpIds, ...fileIds].slice(0, 4);
      await fediverseModel.postStatus({ text, mediaIds });
    } catch (err) {
      fediverseFail(ctx, err && err.message ? err.message : 'fediverseErrPost', '/fediverse/mastodon');
      return;
    }
    ctx.redirect('/fediverse/mastodon');
  })
  .post("/fediverse/mastodon/reply/:id/preview", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    if (!fediverseModel.hasAccount()) { ctx.redirect('/fediverse'); return; }
    sweepFediverseTmp();
    const id = ctx.params.id;
    const text = ctx.request.body?.text || '';
    let existing = ctx.request.body?.tmp || [];
    if (!Array.isArray(existing)) existing = existing ? [existing] : [];
    existing = existing.filter(isFediverseTmpName).map(name => ({ name, type: fediverseTmpType(name) }));
    const fresh = saveFediverseTempMedia(ctx);
    const media = [...existing, ...fresh].slice(0, 4);
    const account = fediverseModel.getAccount();
    const stats = account ? await fediverseModel.getAccountStats() : null;
    const thread = await fediverseModel.getThread(id);
    const parent = thread && thread.status ? thread.status : null;
    if (!String(text).trim() && !media.length) ctx.state.inlineError = require('../views/main_views').i18n.fediverseErrEmpty;
    ctx.body = fediversePreviewView({ account, stats, text, media, replyToId: id, parent });
  })
  .post("/fediverse/mastodon/reply/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    const id = ctx.params.id;
    try {
      const text = ctx.request.body?.text || '';
      const tmpIds = await publishFediverseTempMedia(ctx.request.body?.tmp);
      const fileIds = (await collectFediverseMedia(ctx)).map(m => m.id);
      const mediaIds = [...tmpIds, ...fileIds].slice(0, 4);
      await fediverseModel.postStatus({ text, inReplyToId: id, mediaIds });
    } catch (err) {
      fediverseFail(ctx, err && err.message ? err.message : 'fediverseErrPost', `/fediverse/mastodon/thread/${encodeURIComponent(id)}`);
      return;
    }
    ctx.redirect(`/fediverse/mastodon/thread/${encodeURIComponent(id)}`);
  })
  .post("/fediverse/mastodon/boost/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    try { await fediverseModel.reblog(ctx.params.id); } catch (e) { return fediverseFail(ctx, e && e.message ? e.message : 'fediverseError'); }
    ctx.redirect(fediverseReturnTo(ctx, '/fediverse/mastodon'));
  })
  .post("/fediverse/mastodon/unboost/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    try { await fediverseModel.unreblog(ctx.params.id); } catch (e) { return fediverseFail(ctx, e && e.message ? e.message : 'fediverseError'); }
    ctx.redirect(fediverseReturnTo(ctx, '/fediverse/mastodon'));
  })
  .post("/fediverse/mastodon/fav/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    try { await fediverseModel.favourite(ctx.params.id); } catch (e) { return fediverseFail(ctx, e && e.message ? e.message : 'fediverseError'); }
    ctx.redirect(fediverseReturnTo(ctx, '/fediverse/mastodon'));
  })
  .post("/fediverse/mastodon/unfav/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'fediverseMod')) { ctx.redirect('/modules'); return; }
    try { await fediverseModel.unfavourite(ctx.params.id); } catch (e) { return fediverseFail(ctx, e && e.message ? e.message : 'fediverseError'); }
    ctx.redirect(fediverseReturnTo(ctx, '/fediverse/mastodon'));
  })
  .post("/settings/fediverse", koaBody(), async (ctx) => {
    try {
      const acc = await fediverseModel.connectMastodon({ instance: ctx.request.body?.instance, token: ctx.request.body?.token });
      try {
        const host = String(acc.instance || '').replace(/^https?:\/\//, '');
        if (acc.acct && host) await post.publishFediverseHandle(`${acc.acct}@${host}`);
      } catch (_) {}
      ctx.redirect('/fediverse');
    } catch (err) {
      fediverseFail(ctx, err.message || 'fediverseError', '/settings#multiverse');
    }
  })
  .post("/settings/fediverse/disconnect", koaBody(), async (ctx) => {
    try { fediverseModel.disconnect(); } catch (_) {}
    try { await post.publishFediverseHandle(''); } catch (_) {}
    ctx.redirect("/settings#multiverse");
  })
  .post("/settings/peertube", koaBody(), async (ctx) => {
    try {
      await fediverseModel.peertube.connect({ instance: ctx.request.body?.instance, username: ctx.request.body?.username, password: ctx.request.body?.password });
      ctx.redirect('/fediverse');
    } catch (err) {
      fediverseFail(ctx, err && err.message ? err.message : 'peertubeErrConnect', '/settings#multiverse');
    }
  })
  .post("/settings/peertube/disconnect", koaBody(), async (ctx) => {
    try { await fediverseModel.peertube.disconnect(); } catch (_) {}
    ctx.redirect('/settings#multiverse');
  })
  .post("/settings/telegram/start", koaBody(), async (ctx) => {
    try {
      const state = await fediverseModel.telegram.beginLogin({ apiId: ctx.request.body?.apiId, apiHash: ctx.request.body?.apiHash, phone: ctx.request.body?.phone });
      if (state && state.step === 'error') { fediverseFail(ctx, state.error || 'telegramErrConnect', '/settings#multiverse'); return; }
      ctx.redirect('/settings#multiverse');
    } catch (err) {
      fediverseFail(ctx, tgErrorCode(err), '/settings#multiverse');
    }
  })
  .post("/settings/telegram/code", koaBody(), async (ctx) => {
    try {
      const state = await fediverseModel.telegram.submitCode(ctx.request.body?.code);
      if (state && state.step === 'done') { ctx.redirect('/fediverse'); return; }
      if (state && state.step === 'error') { fediverseFail(ctx, state.error || 'telegramErrConnect', '/settings#multiverse'); return; }
      ctx.redirect('/settings#multiverse');
    } catch (err) {
      fediverseFail(ctx, tgErrorCode(err), '/settings#multiverse');
    }
  })
  .post("/settings/telegram/password", koaBody(), async (ctx) => {
    try {
      const state = await fediverseModel.telegram.submitPassword(ctx.request.body?.password);
      if (state && state.step === 'done') { ctx.redirect('/fediverse'); return; }
      if (state && state.step === 'error') { fediverseFail(ctx, state.error || 'telegramErrConnect', '/settings#multiverse'); return; }
      ctx.redirect('/settings#multiverse');
    } catch (err) {
      fediverseFail(ctx, tgErrorCode(err), '/settings#multiverse');
    }
  })
  .post("/settings/telegram/cancel", koaBody(), async (ctx) => {
    try { await fediverseModel.telegram.cancelLogin(); } catch (_) {}
    ctx.redirect('/settings#multiverse');
  })
  .post("/settings/telegram/disconnect", koaBody(), async (ctx) => {
    try { await fediverseModel.telegram.disconnect(); } catch (_) {}
    ctx.redirect('/settings#multiverse');
  })
  .get('/data', async ctx => {
    const filter = String(ctx.query.filter || 'ALL').toUpperCase();
    const q = String(ctx.query.q || '').trim();
    const reason = String(ctx.query.reason || '').trim();
    const [{ matches, total, hasProfile, kindsAvail, anyMatches, reasonsAvail, reason: activeReason }, cohesion] = await Promise.all([
      dataModel.listMatches(filter, { q, reason }),
      dataModel.cohesion().catch(() => null)
    ]);
    await warmAuthorNames(matches);
    ctx.body = await dataView({ filter, q, matches, total, hasProfile, cohesion, kindsAvail, anyMatches, reasonsAvail, reason: activeReason });
  })
  .get('/polls', async ctx => {
    if (!checkMod(ctx, 'pollsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || 'RECENT').toUpperCase();
    const q = String(ctx.query.q || '').trim();
    if (filter === 'CREATE') { ctx.body = await pollsView([], 'CREATE', { q }); return; }
    if (filter === 'EDIT') {
      const poll = await pollsModel.getPollById(String(ctx.query.id || ''), getViewerId()).catch(() => null);
      if (!poll || poll.author !== getViewerId()) { ctx.redirect('/polls'); return; }
      ctx.body = await pollsView([], 'EDIT', { poll });
      return;
    }
    const fav = await contentFavorites.getFavoriteSet('polls');
    let polls = await pollsModel.listAll(filter, { q, favorites: [...fav] });
    polls = polls.map(p => ({ ...p, isFavorite: fav.has(String(p.id)) }));
    polls = await applyListFilters(polls, ctx);
    try { polls = await lifetime.enrichAndFilter(polls, { getKey: (x) => x.id }); } catch (_) {}
    if (recentFallback(ctx, polls, 'ALL')) return;
    const spreadMap = await spreads.forMessages(pageOf(ctx, polls).map(p => p.id)).catch(() => new Map());
    await warmAuthorNames(pageOf(ctx, polls));
    const pollCensus = (String(filter).toUpperCase() === 'ALL' && !q) ? polls : await censusOf('polls', () => pollsModel.listAll('ALL', { q: '', favorites: [...fav] })).catch(() => []);
    ctx.body = await pollsView(polls, filter, { q, spreadMap, censusList: pollCensus });
  })
  .get('/polls/:pollId', async ctx => {
    if (!checkMod(ctx, 'pollsMod')) { ctx.redirect('/modules'); return; }
    const poll = await pollsModel.getPollById(ctx.params.pollId, getViewerId());
    if (poll.chatId) { ctx.redirect(`/chats/${encodeURIComponent(poll.chatId)}`); return; }
    const comments = await getVoteComments(poll.id);
    const fav = await contentFavorites.getFavoriteSet('polls');
    await enrichItemLifetime(poll, { key: poll.id });
    await warmAuthorNames([poll], comments);
    ctx.body = await singlePollView(
      { ...poll, isFavorite: fav.has(String(poll.id)) },
      comments,
      {
        spreads: await spreads.forMessage(poll.id).catch(() => null),
        filter: String(ctx.query.filter || 'ALL').toUpperCase(),
        q: String(ctx.query.q || '').trim()
      }
    );
  })
  .post('/polls/create', koaBody(), async ctx => {
    if (!checkMod(ctx, 'pollsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      if (rejectPastDates(ctx, [[b.deadline]], '/polls')) return;
      await pollsModel.createPoll({
        question: stripDangerousTags(b.question),
        options: stripDangerousTags(String(b.options || '')).split('\n'),
        anonymous: [].concat(b.anonymous).includes('1'),
        multiple: [].concat(b.multiple).includes('1'),
        deadline: b.deadline,
        tags: b.tags
      });
    } catch (err) { sendErrorPage(ctx, err.message || String(err), { status: 400 }); return; }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect('/polls?filter=MINE');
  })
  .post('/polls/update/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'pollsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      await pollsModel.updatePoll(ctx.params.id, {
        question: stripDangerousTags(b.question),
        options: stripDangerousTags(String(b.options || '')).split('\n'),
        anonymous: [].concat(b.anonymous).includes('1'),
        multiple: [].concat(b.multiple).includes('1'),
        deadline: b.deadline,
        tags: b.tags
      });
    } catch (err) { sendErrorPage(ctx, err.message || String(err), { status: 400 }); return; }
    ctx.redirect(`/polls/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/polls/vote/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'pollsMod')) { ctx.redirect('/modules'); return; }
    const choices = [].concat(ctx.request.body.choices || []).filter(Boolean);
    try { await pollsModel.vote(ctx.params.id, choices); }
    catch (err) { sendErrorPage(ctx, err.message || String(err), { status: 400 }); return; }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, `/polls/${encodeURIComponent(ctx.params.id)}`, ['/polls', '/chats', '/tribe']));
  })
  .post('/polls/close/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'pollsMod')) { ctx.redirect('/modules'); return; }
    try { await pollsModel.closePoll(ctx.params.id); } catch (_) { return actionFail(ctx); }
    ctx.redirect(safeReturnTo(ctx, `/polls/${encodeURIComponent(ctx.params.id)}`, ['/polls', '/chats', '/tribe']));
  })
  .post('/polls/delete/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'pollsMod')) { ctx.redirect('/modules'); return; }
    let poll = null;
    try { poll = await pollsModel.getPollById(ctx.params.id, getViewerId()); } catch (_) {}
    try { await pollsModel.deletePoll(ctx.params.id); } catch (_) { return actionFail(ctx); }
    if (poll && poll.chatId) { ctx.redirect(`/chats/${encodeURIComponent(poll.chatId)}`); return; }
    ctx.redirect('/polls?filter=MINE');
  })
  .post('/polls/opinions/:pollId/:category', koaBody(), async ctx => {
    if (!checkMod(ctx, 'pollsMod')) { ctx.redirect('/modules'); return; }
    try { await pollsModel.createOpinion(ctx.params.pollId, ctx.params.category); } catch (e) { return /already/i.test(String(e && e.message)) ? failWith(ctx, 'opinionAlreadyGiven') : actionFail(ctx); }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, `/polls/${encodeURIComponent(ctx.params.pollId)}`, ['/polls']));
  })
  .post('/polls/:pollId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'polls', 'pollId'))
  .post('/polls/favorites/add/:id', koaBody(), async ctx => favAction(ctx, 'polls', 'add'))
  .post('/polls/favorites/remove/:id', koaBody(), async ctx => favAction(ctx, 'polls', 'remove'))
  .get('/blogs', async ctx => {
    if (!checkMod(ctx, 'blogsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || 'RECENT').toUpperCase();
    const q = String(ctx.query.q || '').trim();
    if (filter === 'CREATE') { ctx.body = await blogView([], 'CREATE', { q }); return; }
    const fav = await contentFavorites.getFavoriteSet('blogs');
    let blogs = await blogModel.listAll(filter, { q, favorites: [...fav] });
    blogs = await applyListFilters(blogs, ctx);
    if (recentFallback(ctx, blogs, 'ALL')) return;
    const spreadMap = await spreads.forMessages(pageOf(ctx, blogs).map(b => b && b.id)).catch(() => new Map());
    await warmAuthorNames(pageOf(ctx, blogs));
    const blogCensus = (String(filter).toUpperCase() === 'ALL' && !q) ? blogs : await censusOf('blogs', () => blogModel.listAll('ALL', { q: '', favorites: [...fav] })).catch(() => []);
    ctx.body = await blogView(blogs, filter, { q, spreadMap, censusList: blogCensus, viewerPrefs: await about.visibilityPrefs(getViewerId()).catch(() => null), viewerId: getViewerId() });
  })
  .get('/blogs/:blogId', async ctx => {
    if (!checkMod(ctx, 'blogsMod')) { ctx.redirect('/modules'); return; }
    let blog = await blogModel.getBlogById(ctx.params.blogId).catch(() => null);
    if (!blog) {
      const target = await blogModel.blogHrefFor(ctx.params.blogId).catch(() => null);
      if (target && !target.startsWith(`/blogs/${encodeURIComponent(ctx.params.blogId)}`)) { ctx.redirect(target); return; }
      ctx.redirect('/blogs');
      return;
    }
    const comments = await getVoteComments(blog.id);
    const fav = await contentFavorites.getFavoriteSet('blogs');
    await warmAuthorNames([blog], comments);
    if (blog) blog.clearnet = await clearnetPublic('posts', blog).catch(() => false);
    ctx.body = await singleBlogView(
      { ...blog, isFavorite: fav.has(String(blog.id)) },
      comments,
      { subscription: await subscriptionStateFor(blog.author, blog.author), spreads: await spreads.forMessage(blog.id).catch(() => null), censusList: await censusOf('blogs', () => blogModel.listAll('ALL', { q: '', favorites: [...fav] })).catch(() => []) }
    );
  })
  .post('/blogs/preview', koaBody({ multipart: true, urlencoded: true, formidable: { multiples: true, maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'blogsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    let text = stripDangerousTags((b.text || '').toString().trim());
    const subject = stripDangerousTags((b.subject || '').toString().trim());
    const blobMarkdown = await handleBlobUploads(ctx, 'blob', 9);
    if (blobMarkdown.length) text += blobMarkdown.join('');
    const allowComments = [].concat(b.allowComments).includes('1');
    ctx.body = await blogView([], 'CREATE', { draft: { text, subject, allowComments, clearnet: String(b.clearnet || '') === '1' } });
  })
  .post('/blogs/create', koaBody({ multipart: true, urlencoded: true, formidable: { multiples: true, maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'blogsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    let text = stripDangerousTags((b.text || '').toString().trim());
    const subject = stripDangerousTags((b.subject || '').toString().trim());
    const blobMarkdown = await handleBlobUploads(ctx, 'blob', 9);
    if (blobMarkdown.length) text += blobMarkdown.join('');
    const allowComments = [].concat(b.allowComments).includes('1');
    const keepBlog = async (err) => {
      ctx.status = 400;
      ctx.state.inlineError = publishErrorText(err);
      ctx.body = await blogView([], 'CREATE', { draft: { text, subject, allowComments, clearnet: String(b.clearnet || '') === '1' } });
    };
    if (longText.tooLong(text)) { await keepBlog(new Error('Text too long')); return; }
    let mentions = [];
    try { mentions = await extractMentions(text); } catch (_) { mentions = []; }
    let createdBlog = null;
    try {
      createdBlog = await blogModel.createBlog({ text, subject, mentions, allowComments });
    } catch (err) { await keepBlog(err); return; }
    try { await applyClearnetChoice(ctx, 'posts', createdBlog); } catch (err) { sendErrorPage(ctx, err.message || String(err), { status: 400 }); return; }
    try { activityModel.invalidateCache(); } catch (_) {}
    try {
      const me = getViewerId();
      const subs = (await subscriptionsModel.listSubscribers(me)).filter(id => id !== me);
      if (subs.length) {
        const blogHref = createdBlog && createdBlog.key ? `/blogs/${encodeURIComponent(createdBlog.key)}` : '/blogs';
        await notifyBot('BLOG_NEW', subs, `[${subject || 'New blog entry'}](${blogHref})`);
      }
    } catch (_) {}
    ctx.redirect('/blogs?filter=MINE');
  })
  .post('/blogs/opinions/:blogId/:category', koaBody(), async ctx => {
    if (!checkMod(ctx, 'blogsMod')) { ctx.redirect('/modules'); return; }
    try { await blogModel.createOpinion(ctx.params.blogId, ctx.params.category); } catch (e) { return /already/i.test(String(e && e.message)) ? failWith(ctx, 'opinionAlreadyGiven') : actionFail(ctx); }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, `/blogs/${encodeURIComponent(ctx.params.blogId)}`, ['/blogs']));
  })
  .post('/blogs/:blogId/comments', koaBodyMiddleware, async ctx => {
    if (!checkMod(ctx, 'blogsMod')) { ctx.redirect('/modules'); return; }
    const blog = await blogModel.getBlogById(ctx.params.blogId).catch(() => null);
    if (!blog || !blog.allowComments) { ctx.redirect(`/blogs/${encodeURIComponent(ctx.params.blogId)}`); return; }
    return commentAction(ctx, 'blogs', 'blogId');
  })
  .post('/blogs/favorites/add/:id', koaBody(), async ctx => favAction(ctx, 'blogs', 'add'))
  .post('/blogs/favorites/remove/:id', koaBody(), async ctx => favAction(ctx, 'blogs', 'remove'))
  .get('/forum', async ctx => {
    if (!checkMod(ctx, 'forumMod')) { ctx.redirect('/modules'); return; }
    const filter = qf(ctx, 'recent');
    const q = String(ctx.query.q || '').trim();
    let forums = await forumModel.listAll(filter);
    const forumViewer = getViewerId();
    const forumKeys = new Set(forums.map(f => f.key));
    const tribeForums = (await tribeItemsFor('forum')).filter(t => !forumKeys.has(t.id)).map(t => {
      const replies = Array.isArray(t.replies) ? t.replies : [];
      return { key: t.id, title: t.title || '', text: t.description || '', category: String(t.category || 'GENERAL').toUpperCase(), author: t.author || '', createdAt: t.createdAt || new Date(Number(t._ts) || 0).toISOString(), positiveVotes: 0, negativeVotes: 0, score: 0, participants: [...new Set([t.author, ...replies.map(r => r.author)].filter(Boolean))], messagesCount: replies.length + 1, lastMessage: null, messages: [], tribeOrigin: t.tribeOrigin };
    });
    forums = forums.concat(tribeForums.filter(f => filter === 'mine' ? f.author === forumViewer : filter === 'recent' ? (Date.parse(f.createdAt) || 0) >= Date.now() - 86400000 : true))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    forums = applyTextSearch(forums, q, ['title', 'text', 'category']);
    forums = await applyListFilters(forums, ctx);
    try { forums = await lifetime.enrichAndFilter(forums); } catch (_) {}
    if (recentFallback(ctx, forums)) return;
    await decorateSubscriptionIn('forum', forums);
    const forumCensus = (String(filter) === 'all' && !q)
      ? forums
      : await censusOf('forums', async () => {
          let all = (await forumModel.listAll('all')).concat(tribeForums);
          all = await applyListFilters(all, ctx);
          try { all = await lifetime.enrichAndFilter(all); } catch (_) {}
          return all;
        }).catch(() => []);
    const pageItems = await renderedPage(async () => forumView(forums, filter, { spreadMap: new Map(), q, censusList: forumCensus }));
    const spreadMap = await spreads.forMessages(pageItems.map(x => x && (x.key || x.id)));
    await warmAuthorNames(pageItems);
    ctx.body = await forumView(forums, filter, { spreadMap, q, censusList: forumCensus });
  })
  .get('/forum/:forumId', async ctx => {
    const msg = await forumModel.getMessageById(ctx.params.forumId), isReply = Boolean(msg.root), forumId = isReply ? msg.root : ctx.params.forumId;
    ctx.body = await forumPageBody(ctx, forumId, isReply ? ctx.params.forumId : null);
  })
  .get('/welcome', async (ctx) => {
    try { onboardingModel.markOpened(); } catch (_) {}
    const lang = ctx.cookies.get('language') || getConfig().language || 'en';
    const available = {
      language: true,
      profile: true,
      federation: checkMod(ctx, 'invitesMod'),
      larp: checkMod(ctx, 'larpMod'),
      ux: true,
      greeting: checkMod(ctx, 'feedMod'),
      wish: true,
      workflow: isLoopbackRequest(ctx)
    };
    try {
      const status = await onboardingModel.status(available);
      status.workflow = workflowsModel.currentWorkflow(getConfig());
      status.wish = getConfig().wish;
      const job = backupModel.restoreStatus();
      status.bootstrap = job && job.source === 'snapshot' ? job : null;
      if (status.bootstrap) ctx.set('Cache-Control', 'no-store');
      ctx.body = await welcomeView(status, lang, status.profile);
    } catch (error) { sendErrorPage(ctx, error.message || String(error), { status: 500 }); }
  })
  .post('/welcome/profile', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const body = ctx.request.body || {};
    const imageFile = ctx.request.files?.image;
    const mime = imageFile?.mimetype || imageFile?.type || '';
    const image = mime.startsWith('image/') && imageFile?.filepath
      ? await promisesFs.readFile(imageFile.filepath).catch(() => undefined)
      : undefined;
    try {
      await post.publishProfileEdit({
        name: stripDangerousTags(String(body.name || '')).trim(),
        description: stripDangerousTags(String(body.description || '')).trim(),
        image
      });
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); return; }
    ctx.redirect('/welcome');
  })
  .post('/welcome/greeting', koaBody(), async (ctx) => {
    const text = stripDangerousTags(String((ctx.request.body || {}).text || ''));
    try {
      const mentions = await extractMentions(text);
      await feedModel.createFeed(text, mentions);
    try { activityModel.invalidateCache(); } catch (_) {}
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); return; }
    ctx.redirect('/welcome');
  })
  .post('/welcome/ux', koaBody(), async (ctx) => {
    const cfg = getConfig();
    const v = String((ctx.request.body || {}).ux || '').trim().toLowerCase();
    const aiNavEnabled = cfg.modules && cfg.modules.aiNavMod === 'on';
    const chatsEnabled = cfg.modules && cfg.modules.chatsMod === 'on';
    const phoneEnabled = !!(cfg.modules && cfg.modules.phoneMod !== 'off');
    const next = (v === 'ainav' && aiNavEnabled) ? 'ainav' : (v === 'chats' && chatsEnabled) ? 'chats' : v === 'feed' ? 'feed' : (v === 'phone' && phoneEnabled) ? 'phone' : 'blocks';
    cfg.ux = { ...(cfg.ux && typeof cfg.ux === 'object' ? cfg.ux : {}), current: next };
    saveConfig(cfg);
    try { onboardingModel.markStep('ux'); } catch (_) {}
    ctx.redirect('/welcome');
  })
  .post('/welcome/wish', koaBody(), async (ctx) => {
    const cfg = getConfig();
    const v = String((ctx.request.body || {}).wish || '').trim();
    cfg.wish = WISH_LEVELS.includes(v) ? v : 'whole';
    saveConfig(cfg);
    try { onboardingModel.markStep('wish'); } catch (_) {}
    ctx.redirect('/welcome#step-workflow');
  })
  .post('/welcome/workflow', koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const workflow = workflowsModel.wizardWorkflow(String((ctx.request.body || {}).workflow || '').trim());
    if (workflow) {
      const cfg = workflowsModel.applyWorkflow(getConfig(), workflow);
      saveConfig(cfg);
      if (workflow.theme) ctx.cookies.set("theme", cfg.themes.current, { httpOnly: true, sameSite: 'strict', secure: ctx.secure });
    }
    try { onboardingModel.markStep('workflow'); } catch (_) {}
    ctx.redirect('/welcome');
  })
  .post('/welcome/dismiss', koaBody(), async (ctx) => {
    try { onboardingModel.dismiss(); } catch (_) {}
    safeRefererRedirect(ctx, '/');
  })
  .post('/ai/suggestion/dismiss', koaBody(), async (ctx) => {
    const shown = String((ctx.request.body || {}).href || '');
    const current = sharedState.getBestMatch ? sharedState.getBestMatch() : null;
    if (shown && sharedState.isKnownSuggestion(shown)) sharedState.dismissSuggestion(shown);
    else if (current && current.href) sharedState.dismissSuggestion(current.href);
    if (current && current.href && sharedState.isSuggestionDismissed(current.href)) sharedState.nextBestMatch();
    safeRefererRedirect(ctx, '/');
  })
  .post('/emergencies/banner/dismiss', koaBody(), async (ctx) => {
    const current = sharedState.getFeaturedEmergency ? sharedState.getFeaturedEmergency() : null;
    if (current && current.id) sharedState.setDismissedEmergency(current.id);
    safeRefererRedirect(ctx, '/');
  })
  .get('/backup', async (ctx) => {
    if (config.public) { ctx.status = 403; ctx.body = ''; return; }
    if (!checkMod(ctx, 'backupMod')) return ctx.redirect('/modules');
    try {
      const q = ctx.query || {};
      const rawMods = q.modules === undefined ? [] : (Array.isArray(q.modules) ? q.modules : [q.modules]);
      const opts = { scope: q.scope || 'all', blobs: q.blobs === undefined ? '1' : q.blobs, modules: rawMods, since: q.since || '' };
      const type = String(q.type || 'RECOVERY').toUpperCase();
      const restoreJob = type === 'RESTORE' ? backupModel.restoreStatus() : null;
      const kit = type === 'RECOVERY' && isLoopbackRequest(ctx) ? backupModel.recoveryKit() : null;
      if (kit || restoreJob) ctx.set('Cache-Control', 'no-store');
      ctx.body = await backupView({ type, options: { scope: opts.scope, sinceTs: opts.since ? Date.parse(opts.since) || null : null }, restoreJob, kit });
    } catch (error) { sendErrorPage(ctx, error.message); }
  })
  .get('/backup/recovery-kit', async (ctx) => {
    if (config.public || !checkMod(ctx, 'backupMod') || !isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    ctx.redirect('/backup?type=RECOVERY');
  })
  .get('/backup/recovery-kit/pdf', async (ctx) => {
    if (config.public || !checkMod(ctx, 'backupMod') || !isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    try {
      const QRCode = require('../server/node_modules/qrcode');
      const { buildRecoveryKitPdf } = require('./pdf');
      const { i18n } = require('../views/main_views');
      const kit = backupModel.recoveryKit();
      let qr = null;
      try { qr = await QRCode.toBuffer(kit.secret, { type: 'png', width: 240, margin: 1, errorCorrectionLevel: 'L' }); } catch (_) { qr = null; }
      const pdf = buildRecoveryKitPdf(kit, { qr, labels: { title: String(i18n.backupTypeRecovery || 'RECOVERY').toUpperCase(), id: i18n.backupKitId, date: i18n.backupKitDate } });
      ctx.set('Cache-Control', 'no-store');
      ctx.set('Content-Type', 'application/pdf');
      ctx.set('Content-Disposition', 'attachment; filename="oasis-recovery-kit.pdf"');
      ctx.body = pdf;
    } catch (error) { sendErrorPage(ctx, error.message); }
  })
  .get('/backup/recovery-kit/qr.png', async (ctx) => {
    if (config.public || !checkMod(ctx, 'backupMod') || !isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    try {
      const QRCode = require('../server/node_modules/qrcode');
      const kit = backupModel.recoveryKit();
      const buf = await QRCode.toBuffer(kit.secret, { type: 'png', width: 260, margin: 1, errorCorrectionLevel: 'L' });
      ctx.type = 'image/png';
      ctx.set('Cache-Control', 'no-store');
      ctx.body = buf;
    } catch (_) { ctx.status = 500; ctx.body = ''; }
  })
  .get('/dev', async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    if (!checkMod(ctx, 'devMod')) { ctx.redirect('/modules'); return; }
    try {
      const group = String(ctx.query.group || '');
      const tree = group ? devModel.listGroup(group) : devModel.listTree(ctx.query.path || '');
      ctx.body = await devTreeView(tree, devModel.projectStats());
    } catch (_) { ctx.redirect('/dev'); }
  })
  .get('/dev/file', async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    if (!checkMod(ctx, 'devMod')) { ctx.redirect('/modules'); return; }
    try {
      ctx.body = await devFileView(devModel.readFile(ctx.query.path || '', { from: ctx.query.from }));
    } catch (_) { ctx.redirect('/dev'); }
  })
  .get('/dev/raw', async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    if (!checkMod(ctx, 'devMod')) { ctx.redirect('/modules'); return; }
    try {
      const file = devModel.rawFile(ctx.query.path || '');
      ctx.set('Content-Type', 'text/plain; charset=utf-8');
      ctx.body = file.content;
    } catch (_) { ctx.redirect('/dev'); }
  })
  .get('/dev/search', async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    if (!checkMod(ctx, 'devMod')) { ctx.redirect('/modules'); return; }
    const ext = String(ctx.query.ext || '');
    try {
      ctx.body = await devSearchView(devModel.searchCode(ctx.query.q || '', { ext }), ext);
    } catch (_) { ctx.redirect('/dev'); }
  })
  .get('/dev/map', async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    if (!checkMod(ctx, 'devMod')) { ctx.redirect('/modules'); return; }
    try {
      ctx.body = await devMapView(devModel.moduleMap());
    } catch (_) { ctx.redirect('/dev'); }
  })
  .get('/bookmarks', async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) return ctx.redirect('/modules');
    const filter = qf(ctx, 'recent'), q = ctx.query.q || '', sort = ctx.query.sort || 'recent', viewerId = getViewerId();
    const favs = await contentFavorites.getFavoriteSet("bookmarks");
    const tribeOpen = (await tribeItemsFor('media', 'bookmark')).map(t => ({ ...t, url: t.url || t.description || '' }));
    const tribeShown = ['recent', 'mine', 'all'].includes(filter) ? applyTextSearch(tribeOpen.filter(t => (filter !== 'mine' || t.author === viewerId) && (filter !== 'recent' || (Date.parse(t.createdAt) || 0) >= Date.now() - 86400000)), q, ['url', 'title', 'description', 'tags', 'author']) : [];
    let bookmarks = [...(await bookmarksModel.listAll({ viewerId, filter: filter === "favorites" ? "all" : filter, q, sort })), ...tribeShown].sort((a, b) => sort === 'top' ? 0 : sort === 'oldest' ? new Date(a.createdAt) - new Date(b.createdAt) : new Date(b.createdAt) - new Date(a.createdAt)).map(b => ({ ...b, isFavorite: favs.has(String(b.rootId || b.id)) }));
    if (filter === "favorites") bookmarks = bookmarks.filter(b => b.isFavorite);
    bookmarks = await applyListFilters(bookmarks, ctx);
    if (recentFallback(ctx, bookmarks)) return;
    await enrichWithComments(bookmarks, 'rootId');
    const spreadMap = await spreads.forMessages(pageOf(ctx, bookmarks).map(x => x && (x.id || x.key)));
    await warmAuthorNames(pageOf(ctx, bookmarks));
    const censusBm = (String(filter) === 'all' && !q) ? bookmarks : (await censusOf(`bookmarks:${sort}`, () => bookmarksModel.listAll({ viewerId, filter: 'all', q: '', sort })).catch(() => [])).concat(tribeOpen).map(b2 => ({ ...b2, isFavorite: favs.has(String(b2.rootId || b2.id)) }));
    ctx.body = await bookmarkView(bookmarks, filter, null, { censusList: censusBm, q, sort, spreadMap });
  })
  .get("/bookmarks/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) return ctx.redirect('/modules');
    const bookmark = await bookmarksModel.getBookmarkById(ctx.params.id, getViewerId()), favs = await contentFavorites.getFavoriteSet("bookmarks");
    if (bookmark) bookmark.clearnet = await clearnetPublic('bookmarks', bookmark).catch(() => false);
    ctx.body = await bookmarkView([{ ...bookmark, isFavorite: favs.has(String(bookmark.rootId || bookmark.id)) }], "edit", bookmark.id, { returnTo: ctx.query.returnTo || "" });
  })
  .get('/bookmarks/:bookmarkId', async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) return ctx.redirect('/modules');
    const filter = qf(ctx), q = ctx.query.q || '', sort = ctx.query.sort || 'recent', favs = await contentFavorites.getFavoriteSet("bookmarks");
    const bookmark = await bookmarksModel.getBookmarkById(ctx.params.bookmarkId), root = bookmark.rootId || bookmark.id, comments = await getVoteComments(root);
    await enrichItemLifetime(bookmark);
    const singleCensus = (await censusOf(`bookmarks:${sort}`, () => bookmarksModel.listAll({ viewerId: getViewerId(), filter: 'all', q: '', sort })).catch(() => [])).map(b2 => ({ ...b2, isFavorite: favs.has(String(b2.rootId || b2.id)) }));
    if (bookmark) bookmark.clearnet = await clearnetPublic('bookmarks', bookmark).catch(() => false);
    ctx.body = await singleBookmarkView({ ...bookmark, commentCount: comments.length, isFavorite: favs.has(String(root)) }, filter, comments, { censusList: singleCensus, q, sort, returnTo: safeReturnTo(ctx, `/bookmarks?filter=${encodeURIComponent(filter)}`, ['/bookmarks']), spreads: await spreads.forMessage(bookmark.id) });
  })
  .get('/tasks', async ctx => {
    const filter = qf(ctx, 'recent');
    const q = String(ctx.query.q || '').trim();
    let tasks = await enrichWithComments(await tasksModel.listAll());
    const taskIds = new Set(tasks.map(t => t.id));
    tasks = tasks.concat((await tribeItemsFor('task')).filter(t => !taskIds.has(t.id)).map(t => {
      const pr = String(t.priority || '').toUpperCase();
      return { id: t.id, rootId: t.id, title: t.title || '', description: t.description || '', startTime: t.createdAt || '', endTime: t.deadline || '', priority: pr === 'CRITICAL' ? 'URGENT' : pr, location: t.location || '', tags: Array.isArray(t.tags) ? t.tags.filter(Boolean) : [], isPublic: 'PUBLIC', images: [], assignees: [], createdAt: t.createdAt || new Date(Number(t._ts) || 0).toISOString(), status: String(t.status || 'OPEN').toUpperCase(), author: t.author || '', opinions: {}, opinions_inhabitants: [], tribeOrigin: t.tribeOrigin };
    }));
    tasks = applyTextSearch(tasks, q, ['title', 'description', 'location', 'tags']);
    tasks = await applyListFilters(tasks, ctx);
    try { tasks = await lifetime.enrichAndFilter(tasks); } catch (_) {}
    const taskViewer = getViewerId();
    if (recentFallback(ctx, tasks.filter(t => (String(t.isPublic || '').toUpperCase() === 'PUBLIC' || t.author === taskViewer || (Array.isArray(t.assignees) && t.assignees.includes(taskViewer))) && (Date.parse(t.createdAt || '') || 0) >= Date.now() - 86400000))) return;
    const pageItems = await renderedPage(async () => taskView(tasks, filter, null, ctx.query.returnTo, { spreadMap: new Map(), q, prefillTitle: ctx.query.title || '', prefillDescription: ctx.query.description || '' }));
    await enrichMsgSize(pageItems);
    const spreadMap = await spreads.forMessages(pageItems.map(x => x && (x.id || x.key)));
    await warmAuthorNames(pageItems);
    ctx.body = await taskView(tasks, filter, null, ctx.query.returnTo, { spreadMap, q, prefillTitle: ctx.query.title || '', prefillDescription: ctx.query.description || '' });
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
    const singleCensus = await censusOf('tasks', () => tasksModel.listAll()).catch(() => []);
    ctx.body = await singleTaskView(await withFavorite(withCount(task, comments), 'tasks'), filter, comments, { censusList: singleCensus, spreads: await spreads.forMessage(task.id).catch(() => null) });
  })
  .get('/events', async (ctx) => {
    if (!checkMod(ctx, 'eventsMod')) { ctx.redirect('/modules'); return; }
    const filter = qf(ctx, 'recent');
    const q = String(ctx.query.q || '').trim();
    let events = await enrichWithComments(await eventsModel.listAll(null, filter));
    const eventIds = new Set(events.map(e => e.id));
    const tribeEvents = (await tribeItemsFor('event')).filter(t => !eventIds.has(t.id)).map(t => ({ id: t.id, rootId: t.id, title: t.title || '', description: t.description || '', date: t.date || '', location: t.location || '', price: 0, url: t.url || '', attendees: [], tags: Array.isArray(t.tags) ? t.tags.filter(Boolean) : [], createdAt: t.createdAt || new Date(Number(t._ts) || 0).toISOString(), organizer: t.author || '', author: t.author || '', status: String(t.status || '').toUpperCase() === 'CLOSED' || (t.date && (Date.parse(t.date) + (String(t.date).length <= 10 ? 86400000 : 0)) < Date.now()) ? 'CLOSED' : 'OPEN', isPublic: 'public', images: [], encrypted: false, opinions: {}, opinions_inhabitants: [], tribeOrigin: t.tribeOrigin }));
    events = events.concat(tribeEvents);
    events = applyTextSearch(events, q, ['title', 'description', 'location', 'tags']);
    events = await applyListFilters(events, ctx);
    try { events = await lifetime.enrichAndFilter(events); } catch (_) {}
    if (recentFallback(ctx, events.filter(e => String(e.isPublic || 'public').toLowerCase() !== 'private' && (Date.parse(e.createdAt || '') || 0) >= Date.now() - 86400000))) return;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    await decorateSubscriptionIn('events', events);
    const eventsCensus = (String(filter) === 'all' && !q)
      ? events
      : await censusOf('events', async () => {
          let all = (await eventsModel.listAll(null, 'all')).concat(tribeEvents);
          all = await applyListFilters(all, ctx);
          try { all = await lifetime.enrichAndFilter(all); } catch (_) {}
          return all;
        }).catch(() => []);
    const pageItems = await renderedPage(async () => eventView(events, filter, null, ctx.query.returnTo, { viewerPrefs, spreadMap: new Map(), q, censusList: eventsCensus, reach: String(ctx.query.isPublic || '') }));
    await enrichMsgSize(pageItems);
    const spreadMap = await spreads.forMessages(pageItems.map(x => x && (x.id || x.key)));
    await warmAuthorNames(pageItems);
    ctx.body = await eventView(events, filter, null, ctx.query.returnTo, { viewerPrefs, spreadMap, q, censusList: eventsCensus, reach: String(ctx.query.isPublic || '') });
  })
  .get('/events/edit/:id', async (ctx) => {
    if (!checkMod(ctx, 'eventsMod')) { ctx.redirect('/modules'); return; }
    const eventId = ctx.params.id;
    const event = await eventsModel.getEventById(eventId);
    if (event) event.clearnet = await clearnetPublic('events', event).catch(() => false);
    ctx.body = await eventView([event], 'edit', eventId, ctx.query.returnTo, { reach: String(ctx.query.isPublic || '') });
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
    try { const oi = await eventsModel.getOpenInvite(eventId).catch(() => null); if (oi) event.openInviteCode = oi.code; } catch (_) {}
    const evAuthorPrefs2 = await about.visibilityPrefs(event.organizer).catch(() => null);
    await warmAuthorNames(event, comments);
    try { event.subscription = await subscriptionStateFor(event.rootId || event.id, event.organizer || event.author); } catch (_) {}
    const singleCensus = await censusOf('events', () => eventsModel.listAll(null, 'all')).catch(() => []);
    if (event) event.clearnet = await clearnetPublic('events', event).catch(() => false);
    ctx.body = await singleEventView(await withFavorite(withCount(event, comments), 'events'), filter, comments, { censusList: singleCensus, mapData, baseUrl: resolveExternalBaseUrl(ctx), authorPrefs: evAuthorPrefs2, linkedCalendarId, spreads: await spreads.forMessage(event.id).catch(() => null) });
  })
  .get('/c/events/:eventId', async (ctx) => {
    ctx.params.eventId = await clearnetIdFor('events', ctx.params.eventId);
    let event;
    try { event = await eventsModel.getEventById(ctx.params.eventId); } catch (_) {}
    if (!event || String(event.status || '').toUpperCase() === 'CLOSED' || event.isPublic === 'private') {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const evAuthorPrefs = await about.visibilityPrefs(event.organizer).catch(() => null);
    if (!clearnetPublicSync('events', event, event.organizer, evAuthorPrefs, await clearnetDecisionsFor('events', event))) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = await clearnetEventView(event);
  })
  .get('/votes', async ctx => {
    const filter = qf(ctx, 'recent');
    const q = String(ctx.query.q || '').trim();
    let voteList = await enrichWithComments(await votesModel.listAll(filter));
    const voteViewer = getViewerId();
    const voteIds = new Set(voteList.map(v => v.id));
    const tribeVotes = (await tribeItemsFor('votation')).filter(t => !voteIds.has(t.id)).map(t => ({ id: t.id, latestId: t.id, question: t.title || '', description: t.description || '', createdBy: t.author || '', author: t.author || '', deadline: t.deadline || '', status: String(t.status || 'OPEN').toUpperCase(), votes: {}, voters: [], totalVotes: 0, tags: Array.isArray(t.tags) ? t.tags.filter(Boolean) : [], createdAt: t.createdAt || new Date(Number(t._ts) || 0).toISOString(), opinions: {}, opinions_inhabitants: [], tribeOrigin: t.tribeOrigin }));
    voteList = voteList.concat(tribeVotes.filter(v => filter === 'mine' ? v.createdBy === voteViewer : filter === 'recent' ? (Date.parse(v.createdAt) || 0) >= Date.now() - 86400000 : (filter === 'open' || filter === 'closed') ? v.status === filter.toUpperCase() : true));
    voteList = await applyListFilters(voteList, ctx);
    voteList = applyTextSearch(voteList, q, ['question', 'tags']);
    try { voteList = await lifetime.enrichAndFilter(voteList, { getAuthor: (x) => x.createdBy }); } catch (_) {}
    if (recentFallback(ctx, voteList)) return;
    const voteCensus = String(filter) === 'all' ? voteList : (await censusOf('votes', () => votesModel.listAll('all')).catch(() => [])).concat(tribeVotes);
    const pageItems = await renderedPage(async () => voteView(voteList, filter, null, [], filter, { spreadMap: new Map(), q, censusList: voteCensus, ...voteFormState(ctx) }));
    await enrichMsgSize(pageItems);
    const spreadMap = await spreads.forMessages(pageItems.map(x => x && (x.id || x.key)));
    await warmAuthorNames(pageItems);
    ctx.body = await voteView(voteList, filter, null, [], filter, { spreadMap, q, censusList: voteCensus, ...voteFormState(ctx) });
  })
  .get('/votes/edit/:id', async ctx => {
    const id = ctx.params.id;
    const activeFilter = (ctx.query.filter || 'mine');
    const voteData = await votesModel.getVoteById(id);
    if (require('../models/votes_model').isVoteLocked(voteData)) { failWith(ctx, 'voteLocked', `/votes/${encodeURIComponent(id)}`); return; }
    ctx.body = await voteView([voteData], 'edit', id, [], activeFilter, voteFormState(ctx));
  })
  .get('/votes/:voteId', async ctx => {
    const { voteId } = ctx.params, filter = qf(ctx), voteData = await votesModel.getVoteById(voteId);
    const comments = await getVoteComments(voteId);
    await enrichMsgSize([voteData]);
    await enrichItemLifetime(voteData, { author: voteData.createdBy });
    ctx.body = await voteView([await withFavorite(withCount(voteData, comments), 'votes')], 'detail', voteId, comments, filter, { spreads: await spreads.forMessage(voteId).catch(() => null) });
  })
  .get("/market", async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const filter = qf(ctx, 'recent'), q = ctx.query.q || "", minPrice = ctx.query.minPrice ?? "", maxPrice = ctx.query.maxPrice ?? "", sort = ctx.query.sort || "recent";
    let marketItems = await marketModel.listAllItems("all");
    if (await marketModel.checkAuctionItemsStatus(marketItems)) marketItems = await marketModel.listAllItems("all");
    await enrichWithComments(marketItems);
    marketItems = await applyListFilters(marketItems, ctx);
    if (String(filter || '').toUpperCase() !== 'MINE') {
      try { marketItems = await lifetime.enrichAndFilter(marketItems, { getCreatedAt: (x) => x.updatedAt || x.createdAt }); } catch (_) {}
    }
    if (recentFallback(ctx, marketItems.filter(e => e.status === "FOR SALE" && String(e.createdAt || "") >= new Date(Date.now() - 86400000).toISOString()))) return;
    const pageItems = await renderedPage(async () => marketView(marketItems, filter, null, { reach: String(ctx.query.visibility || ''), q, minPrice, maxPrice, sort, spreadMap: new Map(), viewerPrefs: await about.visibilityPrefs(getViewerId()).catch(() => null), viewerId: getViewerId(), industry: ctx.query.industry || "", title: ctx.query.title || "", description: ctx.query.description || "", price: ctx.query.price || "", tags: ctx.query.tags || "", stock: ctx.query.stock || "" }));
    const spreadMap = await spreads.forMessages(pageItems.map(x => x && (x.id || x.key)));
    await warmAuthorNames(pageItems);
    ctx.body = await marketView(marketItems, filter, null, { reach: String(ctx.query.visibility || ''), q, minPrice, maxPrice, sort, spreadMap, viewerPrefs: await about.visibilityPrefs(getViewerId()).catch(() => null), viewerId: getViewerId(), industry: ctx.query.industry || "", title: ctx.query.title || "", description: ctx.query.description || "", price: ctx.query.price || "", tags: ctx.query.tags || "", stock: ctx.query.stock || "" });
  })
  .get("/market/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    const id = ctx.params.id
    let marketItem = await marketModel.getItemById(id)
    if (!marketItem) ctx.throw(404, "Item not found")
    await marketModel.checkAuctionItemsStatus([marketItem])
    marketItem = await marketModel.getItemById(id)
    if (!marketItem) ctx.throw(404, "Item not found")
    if (marketItem) marketItem.clearnet = await clearnetPublic('market', marketItem).catch(() => false);
    ctx.body = await marketView([marketItem], "edit", marketItem, { q: "", minPrice: "", maxPrice: "", sort: "recent", reach: String(ctx.query.visibility || "") })
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
    const singleCensus = await censusOf('market', () => marketModel.listAllItems('all')).catch(() => []);
    if (item) item.clearnet = await clearnetPublic('market', item).catch(() => false);
    ctx.body = await singleMarketView(await withFavorite(withCount(item, comments), 'market'), filter, comments, { censusList: singleCensus, q, minPrice, maxPrice, sort, returnTo, mapData, zoom, spreads: await spreads.forMessage(item.id).catch(() => null) })
  })
  .get('/jobs', async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    let filter = String(ctx.query.filter || 'RECENT').toUpperCase()
    if (filter === 'FAVS' || filter === 'NEEDS') filter = 'ALL'
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const query = {
      search: ctx.query.search || '',
      minSalary: ctx.query.minSalary ?? '',
      maxSalary: ctx.query.maxSalary ?? '',
      sort: ctx.query.sort || 'recent',
      industry: ctx.query.industry || '',
      title: ctx.query.title || '',
      description: ctx.query.description || '',
      tasks: ctx.query.tasks || '',
      salary: ctx.query.salary || '',
      reach: String(ctx.query.visibility || ''),
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
      const cvJobsCensus = await censusOf('jobs', () => jobsModel.listJobs('ALL', getViewerId(), {})).catch(() => [])
      ctx.body = await jobsView(inhabitants, filter, { ...query, censusList: cvJobsCensus, anyCVs: inhabitants.length > 0 })
      return
    }
    const viewerId = getViewerId()
    let jobs = await jobsModel.listJobs(filter, viewerId, query)
    await enrichWithComments(jobs)
    jobs = await applyListFilters(jobs, ctx)
    if (filter !== 'MINE') {
      try { jobs = await lifetime.enrichAndFilter(jobs); } catch (_) {}
    }
    await enrichMsgSize(pageOf(ctx, jobs))
    if (recentFallback(ctx, jobs, 'ALL')) return
    const spreadMap = await spreads.forMessages(pageOf(ctx, jobs).map(x => x && (x.id || x.key)));
    await warmAuthorNames(pageOf(ctx, jobs));
    const jobsCensus = (String(filter).toUpperCase() === 'ALL') ? jobs : await censusOf('jobs', () => jobsModel.listJobs('ALL', viewerId, {})).catch(() => [])
    const anyCVs = ((await inhabitantsModel.listInhabitants({ filter: 'CVs' }).catch(() => [])) || []).length > 0
    await annotateClearnet('jobs', jobs);
    ctx.body = await jobsView(jobs, filter, { ...(query || {}), spreadMap, censusList: jobsCensus, anyCVs })
  })
  .get('/jobs/edit/:id', async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    const id = ctx.params.id
    const viewerId = getViewerId()
    const job = await jobsModel.getJobById(id, viewerId)
    if (job) job.clearnet = await clearnetPublic('jobs', job).catch(() => false);
    ctx.body = await jobsView([job], 'EDIT', { reach: String(ctx.query.visibility || '') })
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
    if (job) job.clearnet = await clearnetPublic('jobs', job).catch(() => false);
    ctx.body = await singleJobsView(await withFavorite(withCount(job, comments), 'jobs'), filter, comments, { ...params, mapData, candidates, baseUrl: resolveExternalBaseUrl(ctx), authorPrefs: jobAuthorPrefs2, spreads: await spreads.forMessage(job.id).catch(() => null) })
  })
  .get('/housing', async (ctx) => {
    if (!checkMod(ctx, 'housingMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || 'RECENT').toUpperCase()
    const query = {
      search: ctx.query.search || '',
      minPrice: ctx.query.minPrice ?? '',
      maxPrice: ctx.query.maxPrice ?? '',
      place: ctx.query.place || '',
      sort: ctx.query.sort || 'recent'
    }
    query.maxImages = housingModel.MAX_IMAGES
    if (filter === 'CREATE') { ctx.body = await housingView([], 'CREATE', { ...query, reach: String(ctx.query.visibility || '') }); return }
    const viewerId = getViewerId()
    let items = await housingModel.listHousing(filter, viewerId, query)
    await enrichWithComments(items)
    items = await applyListFilters(items, ctx)
    if (filter !== 'MINE') {
      try { items = await lifetime.enrichAndFilter(items); } catch (_) {}
    }
    await enrichMsgSize(pageOf(ctx, items))
    if (recentFallback(ctx, items, 'ALL')) return
    const spreadMap = await spreads.forMessages(pageOf(ctx, items).map(x => x && (x.id || x.key)));
    await warmAuthorNames(pageOf(ctx, items));
    const housingCensus = (String(filter).toUpperCase() === 'ALL') ? items : await censusOf('housing', () => housingModel.listHousing('ALL', viewerId, {})).catch(() => [])
    ctx.body = await housingView(items, filter, { ...query, spreadMap, censusList: housingCensus })
  })
  .get('/housing/edit/:id', async (ctx) => {
    if (!checkMod(ctx, 'housingMod')) { ctx.redirect('/modules'); return; }
    let item;
    try { item = await housingModel.getHousingById(ctx.params.id, getViewerId()); } catch (_) { ctx.redirect('/housing?filter=MINE'); return; }
    if (!item || String(item.author) !== String(getViewerId())) { ctx.redirect('/housing?filter=MINE'); return; }
    item.clearnet = await clearnetPublic('housing', item).catch(() => false);
    ctx.body = await housingView([item], 'EDIT', { maxImages: housingModel.MAX_IMAGES, reach: String(ctx.query.visibility || '') })
  })
  .get('/housing/:housingId', async (ctx) => {
    if (!checkMod(ctx, 'housingMod')) { ctx.redirect('/modules'); return; }
    let housingId = ctx.params.housingId
    if (housingId && housingId.startsWith('%25')) {
      try { housingId = decodeURIComponent(housingId); } catch (_) {}
    }
    const filter = String(ctx.query.filter || 'ALL').toUpperCase()
    const params = {
      search: ctx.query.search || '',
      minPrice: ctx.query.minPrice ?? '',
      maxPrice: ctx.query.maxPrice ?? '',
      place: ctx.query.place || '',
      sort: ctx.query.sort || 'recent',
      returnTo: safeReturnTo(ctx, `/housing?filter=${encodeURIComponent(filter)}`, ['/housing'])
    }
    let item;
    try { item = await housingModel.getHousingById(housingId, getViewerId()); } catch (e) {
      sendErrorPage(ctx, `Housing not found or invalid id: ${housingId}`, { status: 404 }); return;
    }
    if (!item) { sendErrorPage(ctx, `Housing not found: ${housingId}`, { status: 404 }); return; }
    const [comments, mapData] = await Promise.all([getVoteComments(housingId), resolveMapUrl(item.mapUrl)])
    await enrichMsgSize([item])
    await enrichItemLifetime(item)
    item.clearnet = await clearnetPublic('housing', item).catch(() => false);
    ctx.body = await singleHousingView(await withFavorite(withCount(item, comments), 'housing'), filter, comments, { ...params, mapData, spreads: await spreads.forMessage(item.id).catch(() => null) })
  })
  .get('/c/jobs/:jobId', async (ctx) => {
    ctx.params.jobId = await clearnetIdFor('jobs', ctx.params.jobId);
    let job;
    try { job = await jobsModel.getJobById(ctx.params.jobId); } catch (_) {}
    if (!job || String(job.status || '').toUpperCase() === 'CLOSED' || String(job.visibility || 'PUBLIC').toUpperCase() === 'HIDDEN') {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const jobAuthorPrefs = await about.visibilityPrefs(job.author).catch(() => null);
    if (!clearnetPublicSync('jobs', job, job.author, jobAuthorPrefs, await clearnetDecisions())) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = await clearnetJobView(job);
  })
  .get('/c/rooms/:id', async (ctx) => {
    const room = await roomsModel.getRoomById(await clearnetIdFor('rooms', ctx.params.id)).catch(() => null);
    const roomAuthorPrefs = room ? await about.visibilityPrefs(room.author).catch(() => null) : null;
    ctx.type = 'text/html';
    if (!CLEARNET_REACH_OK.rooms(room) || !clearnetPublicSync('rooms', room, room.author, roomAuthorPrefs, await clearnetDecisions())) {
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.body = await clearnetRoomView(room);
  })
  .get('/c/maps/:id', async (ctx) => {
    const mapItem = await mapsModel.getMapById(await clearnetIdFor('maps', ctx.params.id)).catch(() => null);
    const mapAuthorPrefs = mapItem ? await about.visibilityPrefs(mapItem.author).catch(() => null) : null;
    ctx.type = 'text/html';
    if (!CLEARNET_REACH_OK.maps(mapItem) || !clearnetPublicSync('maps', mapItem, mapItem.author, mapAuthorPrefs, await clearnetDecisions())) {
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const publicMarkers = (Array.isArray(mapItem.markers) ? mapItem.markers : []).filter(mk => mk && !mk.encrypted);
    ctx.body = await clearnetMapView({ ...mapItem, markers: publicMarkers }, { zoom: ctx.query.zoom, clat: ctx.query.clat, clng: ctx.query.clng, view: ctx.query.view, focus: ctx.query.focus });
  })
  .get('/c/calendars/:id', async (ctx) => {
    const cal = await calendarsModel.getCalendarById(await clearnetIdFor('calendars', ctx.params.id)).catch(() => null);
    const calAuthorPrefs = cal ? await about.visibilityPrefs(cal.author).catch(() => null) : null;
    ctx.type = 'text/html';
    if (!CLEARNET_REACH_OK.calendars(cal) || !clearnetPublicSync('calendars', cal, cal.author, calAuthorPrefs, await clearnetDecisions())) {
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const ownDates = (await calendarsModel.getDatesForCalendar(cal.rootId).catch(() => [])).filter(d => d && d.author === cal.author && d.date);
    const allNotes = (await calendarsModel.getNotesForDate(cal.rootId, null).catch(() => [])).filter(n => n && n.author === cal.author);
    const ownNotes = {};
    for (const key of new Set(ownDates.map(d => d.key))) ownNotes[key] = allNotes.filter(n => n.dateId === key);
    ctx.body = await clearnetCalendarView(cal, ownDates, ownNotes);
  })
  .get('/c/emergencies/:id', async (ctx) => {
    const id = await clearnetIdFor('emergencies', ctx.params.id);
    let item = null;
    try { item = await emergenciesModel.getEmergencyById(id); } catch (_) {}
    const prefs = item ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    ctx.type = 'text/html';
    if (!item || item.status !== 'ACTIVE' || !clearnetPublicSync('emergencies', item, item.author, prefs, await clearnetDecisions())) {
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.body = await clearnetEmergencyView(item, { mapPoint: await clearnetMapPoint(item.mapUrl, item.author) });
  })
  .get('/c/campaigns/:id', async (ctx) => {
    const id = await clearnetIdFor('campaigns', ctx.params.id);
    let item = null;
    try { item = await campaignsModel.getCampaignById(id); } catch (_) {}
    const prefs = item ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    ctx.type = 'text/html';
    if (!item || item.status === 'CLOSED' || !clearnetPublicSync('campaigns', item, item.author, prefs, await clearnetDecisions())) {
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.body = await clearnetCampaignView(item, { mapPoint: await clearnetMapPoint(item.mapUrl, item.author) });
  })
  .get('/c/housing/:id', async (ctx) => {
    const id = await clearnetIdFor('housing', ctx.params.id);
    let item = null;
    try { item = await housingModel.getHousingById(id); } catch (_) {}
    const prefs = item ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    ctx.type = 'text/html';
    if (!item || item.status !== 'OPEN' || item.visibility !== 'PUBLIC' || !clearnetPublicSync('housing', item, item.author, prefs, await clearnetDecisions())) {
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.body = await clearnetHousingView(item, { mapPoint: await clearnetMapPoint(item.mapUrl, item.author) });
  })
  .get("/shops", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'recent', q = '', sort = 'recent' } = ctx.query;
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    const hasPurchases = (await shopsModel.listMyPurchases().catch(() => [])).length > 0;
    if (filter === 'products' || filter === 'prices') {
      const products = await shopsModel.listAllProducts({ filter: 'top', sort, viewerId: getViewerId() });
      const favProducts = await contentFavorites.getFavoriteSet('shopProducts').catch(() => new Set());
      const enriched = products.map((prod) => ({ ...prod, isFavorite: favProducts.has(String(prod.rootId || prod.key)) }));
      const pageProducts = pageOf(ctx, enriched);
      await Promise.all(pageProducts.map(async (prod) => {
        try {
          const shop = await shopsModel.getShopById(prod.shopId);
          prod.shopTitle = shop ? shop.title : '';
        } catch (_) {}
      }));
      const productSpreads = await spreads.forMessages(pageProducts.map(p => p && p.key)).catch(() => new Map());
      ctx.body = await shopsView(enriched, filter, null, { q, sort, viewerPrefs, hasPurchases, spreadMap: productSpreads, modesAvail: await shopModesAvailFor(hasPurchases) });
      return;
    }
    const items = await shopsModel.listAll({ filter: filter === 'favorites' ? 'all' : filter, q, sort, viewerId: getViewerId() });
    const fav = await contentFavorites.getFavoriteSet('shops');
    let enriched = items.map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    if (filter === 'favorites') enriched = enriched.filter(x => x.isFavorite);
    enriched = await applyListFilters(enriched, ctx);
    let withFeatured = enriched;
    try { withFeatured = await lifetime.enrichAndFilter(withFeatured, { getKey: (x) => x.rootId || x.key }); } catch (_) {}
    if (recentFallback(ctx, withFeatured)) return;
    const pageShops = pageOf(ctx, withFeatured);
    await Promise.all(pageShops.map(async (shop) => {
      shop.featuredProducts = await shopsModel.listFeaturedProducts(shop.rootId || shop.key);
    }));
    const spreadMap = await spreads.forMessages(pageShops.map(x => x && (x.key || x.id)));
    await warmAuthorNames(pageShops);
    await decorateSubscriptionIn('shops', withFeatured);
    ctx.body = await shopsView(withFeatured, filter, null, { q, sort, viewerPrefs, spreadMap, hasPurchases, modesAvail: await shopModesAvailFor(hasPurchases), reach: String(ctx.query.visibility || '') });
  })
  .get("/shops/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const shop = await shopsModel.getShopById(ctx.params.id);
    if (!shop) { ctx.redirect('/shops'); return; }
    const fav = await contentFavorites.getFavoriteSet('shops');
    if (shop) shop.clearnet = await clearnetPublic('shops', shop).catch(() => false);
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
    const myPurchases = await shopsModel.listMyPurchases().catch(() => []);
    const productRootId = product.rootId || product.key;
    const canRate = myPurchases.some(o => o.productId === productRootId && String(o.status || '').toUpperCase() === 'RECEIVED');
    const productFav = await contentFavorites.getFavoriteSet('shopProducts');
    ctx.body = await singleProductView({ ...withCount(product, comments), isFavorite: productFav.has(String(product.rootId || product.key)) }, shop, comments, { shopId: product.shopId, canRate, returnTo: safeReturnTo(ctx, `/shops/${encodeURIComponent(product.shopId)}`, ['/shops']), spreads: await spreads.forMessage(product.key).catch(() => null), modesAvail: await shopModesAvailFor((await shopsModel.listMyPurchases().catch(() => [])).length > 0) });
  })
  .get("/c/audios/:id", async (ctx) => {
    ctx.params.id = await clearnetIdFor('audios', ctx.params.id);
    let item; try { item = await audiosModel.getAudioById(ctx.params.id); } catch (_) {}
    const p = item && item.author ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    if (!item || !clearnetPublicSync('audios', item, item.author, p, await clearnetDecisions())) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({ kind: 'audio', item });
  })
  .get("/c/market/:id", async (ctx) => {
    ctx.params.id = await clearnetIdFor('market', ctx.params.id);
    let item; try { item = await marketModel.getItemById(ctx.params.id); } catch (_) {}
    const seller = item && (item.seller || item.author);
    const p = seller ? await about.visibilityPrefs(seller).catch(() => null) : null;
    if (!item || !clearnetPublicSync('market', item, seller, p, await clearnetDecisions()) || String(item.visibility || '').toUpperCase() === 'HIDDEN') {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({ kind: 'market', item: { ...item, author: seller, url: item.image || null, details: clearnetDetails('market', item) } });
  })
  .get("/c/feed/:id", async (ctx) => {
    ctx.params.id = await clearnetIdFor('feed', ctx.params.id);
    let entry; try { entry = await feedModel.getFeedById(ctx.params.id); } catch (_) {}
    const author = entry && (entry.author || (entry.value && entry.value.author));
    const p = author ? await about.visibilityPrefs(author).catch(() => null) : null;
    if (!entry || !clearnetPublicSync('feed', entry, author, p, await clearnetDecisionsFor('feed', entry))) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const c = (entry.value && entry.value.content) || entry.content || entry;
    const text = String(c.text || '');
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({
      kind: 'feed',
      item: { title: '', description: text, createdAt: c.createdAt || (entry.value && entry.value.timestamp) || null, author, tags: [] }
    });
  })
  .get("/c/wiki/:id", async (ctx) => {
    ctx.params.id = await clearnetIdFor('wiki', ctx.params.id);
    let page; try { page = await wikiModel.getPage(ctx.params.id); } catch (_) {}
    const p = page && page.author ? await about.visibilityPrefs(page.author).catch(() => null) : null;
    if (!page || page.tribeId || !clearnetPublicSync('wiki', page, page.author, p, await clearnetDecisions())) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const wikiLinks = new Map();
    try {
      const { extractWikiLinks } = require('../models/wiki_model');
      const { clearnetItemHref } = require('../views/main_views');
      const slugs = extractWikiLinks(page.body || '');
      if (slugs.length) {
        const all = await wikiModel.listPages({ filter: 'all' }).catch(() => []);
        const bySlug = new Map();
        for (const w of all || []) { if (!w || w.tribeId) continue; for (const alias of [w.slug, ...(Array.isArray(w.aliases) ? w.aliases : [])]) if (alias && !bySlug.has(alias)) bySlug.set(alias, w); }
        const prefsByAuthor = new Map();
        for (const slug of slugs) {
          const target = bySlug.get(slug);
          if (!target) continue;
          if (!prefsByAuthor.has(target.author)) {
            prefsByAuthor.set(target.author, await about.visibilityPrefs(target.author).catch(() => null));
          }
          const targetPrefs = prefsByAuthor.get(target.author);
          if (targetPrefs && targetPrefs.clearnetWiki === true) wikiLinks.set(slug, clearnetItemHref('wiki', target.title, target.id));
        }
      }
    } catch (_) {}
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({
      kind: 'wiki',
      item: { title: page.title, description: page.body || '', createdAt: page.updatedAt || page.createdAt, author: page.author, tags: page.tags || [], license: page.license || '', wikiLinks }
    });
  })
  .get("/c/bookmarks/:id", async (ctx) => {
    ctx.params.id = await clearnetIdFor('bookmarks', ctx.params.id);
    let item; try { item = await bookmarksModel.getBookmarkById(ctx.params.id); } catch (_) {}
    const p = item && item.author ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    if (!item || !item.url || !clearnetPublicSync('bookmarks', item, item.author, p, await clearnetDecisions())) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({
      kind: 'bookmark',
      item: { title: hostOf(item.url) || 'Bookmark', description: [item.url, item.description].filter(Boolean).join('\n\n'), createdAt: item.createdAt || null, author: item.author, tags: item.tags || [] }
    });
  })
  .get("/c/podcasts/:id", async (ctx) => {
    ctx.params.id = await clearnetIdFor('podcasts', ctx.params.id);
    let channel; try { channel = await podcastsModel.getChannelById(ctx.params.id); } catch (_) {}
    const p = channel && channel.author ? await about.visibilityPrefs(channel.author).catch(() => null) : null;
    if (!channel || !(channel.episodeCount > 0) || !clearnetPublicSync('podcasts', channel, channel.author, p, await clearnetDecisions())) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetPodcastView({ channel });
  })
  .get("/c/videos/:id", async (ctx) => {
    ctx.params.id = await clearnetIdFor('videos', ctx.params.id);
    let item; try { item = await videosModel.getVideoById(ctx.params.id); } catch (_) {}
    const p = item && item.author ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    if (!item || !clearnetPublicSync('videos', item, item.author, p, await clearnetDecisions())) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({ kind: 'video', item });
  })
  .get("/c/images/:id", async (ctx) => {
    ctx.params.id = await clearnetIdFor('images', ctx.params.id);
    let item; try { item = await imagesModel.getImageById(ctx.params.id); } catch (_) {}
    const p = item && item.author ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    if (!item || !clearnetPublicSync('images', item, item.author, p, await clearnetDecisions())) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({ kind: 'image', item });
  })
  .get("/c/documents/:id", async (ctx) => {
    ctx.params.id = await clearnetIdFor('documents', ctx.params.id);
    let item; try { item = await documentsModel.getDocumentById(ctx.params.id); } catch (_) {}
    const p = item && item.author ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    if (!item || !clearnetPublicSync('documents', item, item.author, p, await clearnetDecisions())) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({ kind: 'document', item: { ...item, details: detailsOf(await blobSizeOf(item.url)).map(v => `⇩ ${v}`) } });
  })
  .get("/c/files/:id", async (ctx) => {
    ctx.params.id = await clearnetIdFor('files', ctx.params.id);
    let item; try { item = await filesModel.getFileById(ctx.params.id); } catch (_) {}
    const p = item && item.author ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    if (!item || item.tribeId || item.encrypted || !item.url || !clearnetPublicSync('files', item, item.author, p, await clearnetDecisions())) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({ kind: 'file', item: { ...item, details: detailsOf(await blobSizeOf(item.url)).map(v => `⇩ ${v}`) } });
  })
  .get("/c/torrents/:id", async (ctx) => {
    ctx.params.id = await clearnetIdFor('torrents', ctx.params.id);
    let item; try { item = await torrentsModel.getTorrentById(ctx.params.id); } catch (_) {}
    const p = item && item.author ? await about.visibilityPrefs(item.author).catch(() => null) : null;
    if (!item || item.tribeId || item.encrypted || !item.url || !clearnetPublicSync('torrents', item, item.author, p, await clearnetDecisions())) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = require('../views/clearnet_view').renderClearnetMediaView({ kind: 'torrent', item: { ...item, details: detailsOf(await blobSizeOf(item.url)).map(v => `⇩ ${v}`) } });
  })
  .get("/c/blog/:msgKey", async (ctx) => {
    ctx.params.msgKey = await clearnetIdFor('posts', ctx.params.msgKey);
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
    if (!clearnetPublicSync('posts', { key: msgKey, ts: msg.timestamp }, authorId, postAuthorPrefs, await clearnetDecisions())) {
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
  .get("/clearnet", async (ctx) => { ctx.redirect("/c"); })
  .get("/c", async (ctx) => {
    const index = await getClearnetIndex();
    const authors = [];
    const items = {};
    for (const entry of index) {
      let count = 0;
      for (const k of Object.keys(entry.items)) {
        if (!items[k]) items[k] = [];
        for (const it of entry.items[k]) { items[k].push({ ...it, authorName: entry.name || '', feedId: entry.feedId }); count++; }
      }
      authors.push({ feedId: entry.feedId, name: entry.name || '', count });
    }
    ctx.type = 'text/html';
    ctx.body = await clearnetHubView({ authors, items, tribes: await getClearnetTribes().catch(() => []), filterType: String(ctx.query.type || '').toLowerCase(), query: String(ctx.query.q || '').trim(), page: ctx.query.page });
  })
  .get("/c/tribe/:id", async (ctx) => {
    const { clearnetSlugFor, clearnetShortId } = require('../views/main_views');
    let raw = String(ctx.params.id || '');
    if (!ssbRef.isMsg(raw)) { try { raw = decodeURIComponent(raw); } catch (_) {} }
    const tribes = await getClearnetTribes().catch(() => []);
    const root = raw.startsWith('%') ? await tribesModel.getRootId(raw).catch(() => raw) : null;
    const short = raw.split('-').pop().toLowerCase();
    const hit = tribes.find(t => t.id === root || clearnetSlugFor(t.title, t.id) === raw) || tribes.find(t => clearnetShortId(t.id) === short);
    const tribe = hit ? await tribesModel.getTribeById(hit.id).catch(() => null) : null;
    if (!tribe) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    tribe.rootId = hit.id;
    const items = await tribesContentModel.listExposed(hit.id, null, 'clearnet').catch(() => []);
    const names = {};
    for (const it of items) {
      for (const id of [it.author, ...((it.replies || []).map(r => r.author))]) {
        if (id && !names[id]) names[id] = await about.name(id).catch(() => '');
      }
    }
    ctx.type = 'text/html';
    ctx.body = await require('../views/tribes_view').clearnetTribeView({ tribe, items, names, slug: clearnetSlugFor(tribe.title, hit.id), page: ctx.query.page });
  })
  .get("/c/sitemap.xml", async (ctx) => {
    const { escapeHtml: esc } = require('../views/clearnet_view');
    const { CLEARNET_MODULES, clearnetSlugFor } = require('../views/main_views');
    const base = resolveExternalBaseUrl(ctx);
    const index = await getClearnetIndex();
    const urls = [`${base}/c`];
    for (const t of await getClearnetTribes().catch(() => [])) urls.push(`${base}/c/tribe/${encodeURIComponent(clearnetSlugFor(t.title, t.id))}`);
    for (const entry of index) {
      urls.push(`${base}/c/inhabitant/${encodeURIComponent(entry.feedId)}`);
      for (const m of CLEARNET_MODULES) {
        for (const it of (entry.items[m.key] || [])) {
          urls.push(`${base}/c/${m.modulePath || m.key}/${encodeURIComponent(clearnetSlugFor(it.title, it.id))}`);
        }
      }
    }
    ctx.type = 'application/xml';
    ctx.body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Array.from(new Set(urls)).map(u => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
  })
  .get("/c/rss/:module", async (ctx) => {
    const { escapeHtml: esc } = require('../views/clearnet_view');
    const { CLEARNET_MODULES, clearnetSlugFor, cnModuleLabel, i18n } = require('../views/main_views');
    const wanted = String(ctx.params.module || '').replace(/\.xml$/i, '').toLowerCase();
    const mod = CLEARNET_MODULES.find(m => m.key === wanted || (m.modulePath || m.key) === wanted);
    if (!mod) { ctx.status = 404; ctx.body = require('../views/clearnet_view').renderClearnetNotFound(); return; }
    const base = resolveExternalBaseUrl(ctx);
    const index = await getClearnetIndex();
    const items = [];
    for (const entry of index) {
      for (const it of (entry.items[mod.key] || [])) items.push({ ...it, authorName: entry.name || '', feedId: entry.feedId });
    }
    items.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
    const rssItems = items.slice(0, 50).map(it => {
      const link = `${base}/c/${mod.modulePath || mod.key}/${encodeURIComponent(clearnetSlugFor(it.title, it.id))}`;
      const date = new Date(Number(it.ts) || Date.now()).toUTCString();
      return `    <item>\n      <title>${esc(it.title || i18n.cnUntitled)}</title>\n      <link>${esc(link)}</link>\n      <guid isPermaLink="false">${esc(String(it.id || link))}</guid>\n      <pubDate>${date}</pubDate>\n      <author>${esc(it.authorName || it.feedId || '')}</author>\n      <description>${esc(String(it.snippet || '').slice(0, 500))}</description>\n    </item>`;
    }).join('\n');
    ctx.type = 'application/rss+xml';
    ctx.body = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>Oasis HUB · ${esc(cnModuleLabel(mod))}</title>\n    <link>${esc(`${base}/c?type=${mod.key}`)}</link>\n    <description>${esc(`${cnModuleLabel(mod)} ${i18n.cnRssDescription}`)}</description>\n${rssItems}\n  </channel>\n</rss>\n`;
  })
  .get("/c/inhabitant/:feedId", async (ctx) => {
    const feedId = decodeURIComponent(ctx.params.feedId || '');
    if (!ssbRef.isFeedId(feedId)) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const prefs = await about.visibilityPrefs(feedId).catch(() => null);
    if (!(prefs && prefs.clearnet === true) && !(await clearnetDecisions()).kindsByAuthor.has(feedId)) {
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
    const items = await collectClearnetItems(feedId, prefs);
    if (!(prefs && prefs.clearnet === true) && !Object.values(items).some(list => Array.isArray(list) && list.length)) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const filterType = String(ctx.query.type || '').toLowerCase();
    ctx.type = 'text/html';
    ctx.body = await clearnetInhabitantView({ feedId, name, description, image: safeImage, prefs, items, filterType, page: ctx.query.page });
  })
  .get("/c/school/:courseId", async (ctx) => {
    ctx.params.courseId = await clearnetIdFor('school', ctx.params.courseId);
    let course;
    try { course = await schoolModel.getCourseById(ctx.params.courseId, null); } catch (_) {}
    if (!course || course.visibility !== 'PUBLIC' || Number(course.price) > 0) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const courseAuthorPrefs = await about.visibilityPrefs(course.author).catch(() => null);
    if (!clearnetPublicSync('school', course, course.author, courseAuthorPrefs, await clearnetDecisions())) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const lessons = await schoolModel.listLessons(course.rootId).catch(() => []);
    ctx.type = 'text/html';
    ctx.body = await require('../views/school_view').clearnetCourseView(course, lessons);
  })
  .get("/c/shops/:shopId", async (ctx) => {
    ctx.params.shopId = await clearnetIdFor('shops', ctx.params.shopId);
    const shop = await shopsModel.getShopById(ctx.params.shopId).catch(() => null);
    if (!shop || String(shop.visibility || '').toUpperCase() === 'CLOSED') {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const shopAuthorPrefs = await about.visibilityPrefs(shop.author).catch(() => null);
    if (!clearnetPublicSync('shops', shop, shop.author, shopAuthorPrefs, await clearnetDecisions())) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const products = await shopsModel.listProducts(shop.rootId || shop.key).catch(() => []);
    ctx.type = 'text/html';
    ctx.body = await clearnetShopView(shop, products || []);
  })
  .get("/shops/purchases", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const purchases = await shopsModel.listMyPurchases().catch(() => []);
    ctx.body = await myPurchasesView(purchases, { modesAvail: await shopModesAvailFor(purchases.length > 0) });
  })
  .get("/shops/:shopId", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const { filter = 'all', q = '', sort = 'recent' } = ctx.query;
    const shop = await shopsModel.getShopById(ctx.params.shopId);
    if (!shop) { ctx.redirect('/shops'); return; }
    if (shop.encrypted && shop.undecryptable && shop.author !== getViewerId()) { ctx.redirect('/invites#invites-shops'); return; }
    const fav = await contentFavorites.getFavoriteSet('shops');
    const [rawProducts, comments, mapData] = await Promise.all([shopsModel.listProducts(shop.rootId || shop.key), getVoteComments(shop.key), resolveMapUrl(shop.mapUrl)]);
    const favShopProducts = await contentFavorites.getFavoriteSet('shopProducts').catch(() => new Set());
    const products = (rawProducts || []).map(p => ({ ...p, isFavorite: favShopProducts.has(String(p.rootId || p.key)) }));
    const productSpreadMap = await spreads.forMessages(pageOf(ctx, products).map(p => p && p.key)).catch(() => new Map());
    const baseUrl = resolveExternalBaseUrl(ctx);
    const authorPrefs = await about.visibilityPrefs(shop.author).catch(() => null);
    await enrichItemLifetime(shop, { key: shop.rootId || shop.key });
    const pendingOrders = shop.author === getViewerId() ? await shopsModel.countPendingOrders(shop.rootId || shop.key).catch(() => 0) : 0;
    let shopOpenInviteCode = null, shopOpenInviteQr = null;
    try {
      const oi = await shopsModel.getOpenInvite(shop.key).catch(() => null);
      if (oi) {
        shopOpenInviteCode = oi.code;
        shopOpenInviteQr = `/qr-invite/shop/${encodeURIComponent(shop.key)}`;
      }
    } catch (_) {}
    await warmAuthorNames(shop, products, comments);
    let shopSubscription = null;
    try { shopSubscription = await subscriptionStateFor(shop.rootId || shop.key, shop.author); } catch (_) {}
    if (shop) shop.clearnet = await clearnetPublic('shops', shop).catch(() => false);
    ctx.body = await singleShopView({ ...shop, subscription: shopSubscription, isFavorite: fav.has(String(shop.rootId || shop.key)), commentCount: comments.length, pendingOrders, openInviteCode: shopOpenInviteCode, openInviteQr: shopOpenInviteQr }, filter, products, comments, { q, sort, returnTo: safeReturnTo(ctx, `/shops?filter=${encodeURIComponent(filter)}`, ['/shops']), mapData, baseUrl, authorPrefs, spreadMap: productSpreadMap, spreads: await spreads.forMessage(shop.key).catch(() => null), modesAvail: await shopModesAvailFor((await shopsModel.listMyPurchases().catch(() => [])).length > 0) });
  })
  .get("/shops/:shopId/orders", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const shop = await shopsModel.getShopById(ctx.params.shopId);
    if (!shop) { sendErrorPage(ctx, "Shop not found", { status: 404 }); return; }
    const rootId = shop.rootId || shop.key;
    const orders = await shopsModel.listShopOrders(rootId).catch(e => { throw e; });
    ctx.body = await shopOrdersView(shop, orders);
  })
  .post("/shops/orders/:orderId/status", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    const shopId = String(b.shopId || '');
    try {
      await shopsModel.setOrderStatus(ctx.params.orderId, b.status);
    } catch (_) {}
    const dest = (typeof b.returnTo === 'string' && b.returnTo.startsWith('/shops')) ? b.returnTo : `/shops/${encodeURIComponent(shopId)}/orders`;
    ctx.redirect(dest);
  })
  .get("/chats", async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const { q = '', tribeId = '' } = ctx.query;
    const uxChatsMode = getConfig().ux?.current === 'chats';
    const filter = ctx.query.filter || (uxChatsMode ? 'all' : 'recent');
    const viewerId = getViewerId();
    if (filter === 'create') {
      ctx.body = await chatsView([], 'create', null, { q, ...(tribeId ? { tribeId } : {}) });
      return;
    }
    const modelFilter = filter === "favorites" ? "all" : filter;
    const items = await chatsModel.listAll({ filter: modelFilter, q, viewerId });
    const fav = await contentFavorites.getFavoriteSet('chats');
    const enriched = items.filter(x => !x.tribeId).map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    let finalList = filter === "favorites" ? enriched.filter(x => x.isFavorite) : enriched;
    finalList = await applyListFilters(finalList, ctx);
    try { finalList = await lifetime.enrichAndFilter(finalList, { getKey: (x) => x.rootId || x.key }); } catch (_) {}
    if (recentFallback(ctx, finalList)) return;
    const spreadMap = await spreads.forMessages(pageOf(ctx, finalList).map(x => x && (x.key || x.id)));
    await warmAuthorNames(pageOf(ctx, finalList));
    if (uxChatsMode && filter === 'all' && !q && finalList.length) {
      const actTs = (c) => Math.max(Number(c.lastMsgAt || 0), Date.parse(c.updatedAt || '') || 0, Date.parse(c.createdAt || '') || 0);
      const first = finalList.slice().sort((a, b) => actTs(b) - actTs(a))[0];
      ctx.redirect(`/chats/${encodeURIComponent(first.rootId || first.key)}`);
      return;
    }
    await decorateSubscriptionIn('chats', finalList.filter(c => c && c.status === 'INVITE-ONLY'));
    const chatCensus = (filter === 'all' && !q)
      ? enriched
      : (await censusOf('chats', () => chatsModel.listAll({ filter: 'all', q: '', viewerId })).catch(() => []))
          .filter(x => !x.tribeId).map(x => ({ ...x, isFavorite: fav.has(String(x.rootId || x.key)) }));
    const chatModesAvail = chatModesFromCensus(chatCensus, viewerId);
    ctx.body = await chatsView(finalList, filter, null, { q, spreadMap, workspace: uxChatsMode, modesAvail: chatModesAvail });
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
    const fav = await contentFavorites.getFavoriteSet('chats');
    const messages = await chatsModel.listMessages(chat.rootId || chat.key);
    const isTribeMember = !!parentTribe;
    const pollsEnabled = checkMod(ctx, 'pollsMod');
    const chatPolls = pollsEnabled
      ? await pollsModel.listAll('ALL', { chatId: chat.rootId || chat.key }).catch(() => [])
      : [];
    const uxChats = getConfig().ux?.current === 'chats';
    let allChats = [];
    if (uxChats) {
      try {
        allChats = (await chatsModel.listAll({ filter: 'all', q: '', viewerId: uid })).filter(x => !x.tribeId);
      } catch (_) { allChats = []; }
    }
    let chatSubscription = null;
    if (chat.status === 'INVITE-ONLY') { try { chatSubscription = await subscriptionStateFor(chat.rootId || chat.key, chat.author); } catch (_) {} }
    ctx.body = await singleChatView({ ...chat, subscription: chatSubscription, isFavorite: fav.has(String(chat.rootId || chat.key)), isTribeMember }, filter, messages, { q, polls: chatPolls, pollsEnabled, reply: String(ctx.query.reply || '').trim() || null, returnTo: safeReturnTo(ctx, `/chats?filter=${encodeURIComponent(filter)}`, ['/chats']), spreads: await spreads.forMessage(chat.key).catch(() => null), workspace: uxChats, allChats, modesAvail: await chatModesAvailFor() });
  })
  .get("/wiki", async (ctx) => {
    if (!checkMod(ctx, 'wikiMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || "recent").toLowerCase();
    const q = String(ctx.query.q || "").trim();
    const tribeId = String(ctx.query.tribeId || "").trim() || null;
    const uid = getViewerId();
    let tribe = null;
    if (tribeId) {
      tribe = await tribesModel.getTribeById(tribeId).catch(() => null);
      if (!tribe) { ctx.redirect('/tribes'); return; }
      if (!tribe.members.includes(uid)) { ctx.body = tribeAccessDeniedView(tribe); return; }
      await tribesModel.processIncomingKeys().catch(() => {});
    }
    const wikiCensus = await censusOf(`wiki:${tribeId || ""}`, () => wikiModel.listPages({ tribeId, filter: "all", q: "", viewerId: uid })).catch(() => []);
    if (filter === "create") {
      ctx.body = await wikiView([], "create", { tribeId, tribe, censusList: wikiCensus, title: stripDangerousTags(String(ctx.query.title || "")) });
      return;
    }
    if (filter === "edit") {
      const page = await wikiModel.getPage(String(ctx.query.id || ""), { tribeId });
      if (!page || !page.canEdit) { ctx.redirect(tribeId ? `/wiki?tribeId=${encodeURIComponent(tribeId)}` : '/wiki'); return; }
      if (page) page.clearnet = await clearnetPublic('wiki', page).catch(() => false);
      ctx.body = await wikiView([], "edit", { tribeId: page.tribeId || null, tribe, page, censusList: wikiCensus });
      return;
    }
    if (filter === "changes") {
      const changes = await wikiModel.recentChanges({ tribeId });
      await warmAuthorNames(changes);
      ctx.body = await wikiChangesView(changes, { tribeId, tribe, censusList: wikiCensus });
      return;
    }
    const favWiki = await contentFavorites.getFavoriteSet('wiki');
    const pages = (await wikiModel.listPages({ tribeId, filter, q, viewerId: uid })).map(x => ({ ...x, isFavorite: favWiki.has(String(x.id)) }));
    if (recentFallback(ctx, await applyWishScope(pages))) return;
    const censusList = (filter === "all" && !q) ? pages : wikiCensus.map(x => ({ ...x, isFavorite: favWiki.has(String(x.id)) }));
    const shownList = await applyWishScope(pages);
    const spreadMap = await spreads.forMessages(pageOf(ctx, shownList).map(x => x && x.id));
    await warmAuthorNames(pageOf(ctx, shownList));
    await annotateClearnet('wiki', pages);
    ctx.body = await wikiView(shownList, filter, { q, tribeId, tribe, censusList, spreadMap, viewerPrefs: await about.visibilityPrefs(uid).catch(() => null), viewerId: uid });
  })
  .get("/wiki/:id/history", async (ctx) => {
    if (!checkMod(ctx, 'wikiMod')) { ctx.redirect('/modules'); return; }
    const tribeId = String(ctx.query.tribeId || "").trim() || null;
    const page = await wikiModel.getPage(ctx.params.id, { tribeId });
    if (!page) { ctx.redirect('/wiki'); return; }
    let tribe = null;
    if (page.tribeId) {
      tribe = await tribesModel.getTribeById(page.tribeId).catch(() => null);
      if (!tribe || !tribe.members.includes(getViewerId())) { ctx.redirect('/tribes'); return; }
    }
    const censusList = await censusOf(`wiki-pages:${page.tribeId || ''}`, () => wikiModel.listPages({ tribeId: page.tribeId || null, filter: 'all' })).catch(() => []);
    await warmAuthorNames(page.versions);
    ctx.body = await wikiHistoryView(page, { tribe, censusList });
  })
  .get("/wiki/:id/pdf", async (ctx) => sendContentPdf(ctx, 'wiki', ctx.params.id))
  .get("/wiki/:id", async (ctx) => {
    if (!checkMod(ctx, 'wikiMod')) { ctx.redirect('/modules'); return; }
    const tribeId = String(ctx.query.tribeId || "").trim() || null;
    const uid = getViewerId();
    if (tribeId) await tribesModel.processIncomingKeys().catch(() => {});
    const page = await wikiModel.getPage(ctx.params.id, { tribeId });
    if (!page) {
      if (!String(ctx.params.id).startsWith('%')) { ctx.redirect(`/wiki?filter=create&title=${encodeURIComponent(ctx.params.id)}${tribeId ? `&tribeId=${encodeURIComponent(tribeId)}` : ""}`); return; }
      ctx.redirect('/wiki'); return;
    }
    let tribe = null;
    if (page.tribeId) {
      tribe = await tribesModel.getTribeById(page.tribeId).catch(() => null);
      if (!tribe) { ctx.redirect('/tribes'); return; }
      if (!tribe.members.includes(uid)) { ctx.body = tribeAccessDeniedView(tribe); return; }
    }
    const version = ctx.query.version ? page.versions.find(v => v.key === ctx.query.version) || null : null;
    const diff = ctx.query.diff ? page.versions.find(v => v.key === ctx.query.diff) || null : null;
    page.isFavorite = (await contentFavorites.getFavoriteSet('wiki')).has(String(page.id));
    const subscription = await subscriptionStateFor(page.id, String(page.author) === String(uid)).catch(() => null);
    const censusList = await censusOf(`wiki-pages:${page.tribeId || ''}`, () => wikiModel.listPages({ tribeId: page.tribeId || null, filter: 'all' })).catch(() => []);
    await warmAuthorNames([page, ...page.versions]);
    if (page) page.clearnet = await clearnetPublic('wiki', page).catch(() => false);
    ctx.body = await wikiPageView(page, { version, diff, tribe, subscription, censusList, spread: await spreads.forMessage(page.id).catch(() => null), authorPrefs: await about.visibilityPrefs(page.author).catch(() => null) });
  })
  .get("/pads", async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || "recent").toLowerCase();
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
    const fav = await contentFavorites.getFavoriteSet('pads');
    let enriched = pads.filter(p => !p.tribeId).map(p => ({ ...p, isFavorite: fav.has(String(p.rootId)) }));
    enriched = await applyListFilters(enriched, ctx);
    try { enriched = await lifetime.enrichAndFilter(enriched, { getKey: (x) => x.rootId || x.key }); } catch (_) {}
    if (recentFallback(ctx, enriched)) return;
    await decorateSubscriptionIn('pads', enriched);
    const padCensus = filter === 'all'
      ? enriched
      : (await censusOf('pads', () => padsModel.listAll({ filter: 'all', viewerId: uid })).catch(() => []))
          .filter(p2 => !p2.tribeId).map(p2 => ({ ...p2, isFavorite: fav.has(String(p2.rootId)) }));
    const padModesAvail = padModesFromCensus(padCensus, uid);
    const pageItems = await renderedPage(async () => padsView(enriched, filter, null, { q, ...(tribeId ? { tribeId } : {}), spreadMap: new Map(), modesAvail: padModesAvail }));
    const spreadMap = await spreads.forMessages(pageItems.map(x => x && (x.rootId || x.key || x.id)));
    await warmAuthorNames(pageItems);
    ctx.body = await padsView(enriched, filter, null, { q, ...(tribeId ? { tribeId } : {}), spreadMap, modesAvail: padModesAvail });
  })
  .get("/pads/:padId/pdf", async (ctx) => sendContentPdf(ctx, 'pads', ctx.params.padId))
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
    const fav = await contentFavorites.getFavoriteSet('pads');
    const entries = await padsModel.getEntries(pad.rootId);
    const versionKey = ctx.query.version || null;
    const selectedVersion = versionKey
      ? (entries.find(e => e.key === versionKey) || entries[parseInt(versionKey)] || null)
      : null;
    const baseUrl = `${ctx.protocol}://${ctx.host}`;
    const isTribeMember = !!parentTribe;
    let padSubscription = null;
    try { padSubscription = await subscriptionStateFor(pad.rootId || pad.key, pad.author); } catch (_) {}
    ctx.body = await singlePadView({ ...pad, subscription: padSubscription, isFavorite: fav.has(String(pad.rootId)), isTribeMember }, entries, { baseUrl, selectedVersion, spreads: await spreads.forMessage(pad.rootId).catch(() => null), modesAvail: await padModesAvailFor() });
  })
  .get("/rooms", async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || "recent").toLowerCase();
    const uid = getViewerId();
    await roomsModel.ingestKeys().catch(() => {});
    if (filter === "edit") {
      const room = await roomsModel.getRoomById(String(ctx.query.id || '')).catch(() => null);
      if (!room || room.author !== uid) { ctx.redirect('/rooms'); return; }
      room.clearnet = await clearnetPublic('rooms', room).catch(() => false);
      ctx.body = await roomsView([], "edit", room, {});
      return;
    }
    if (filter === "create") {
      ctx.body = await roomsView([], "create", null, { tribeId: String(ctx.query.tribeId || ''), reach: String(ctx.query.status || '') });
      return;
    }
    const q = String(ctx.query.q || "").trim();
    const census = await roomsCensus(true);
    const occupancy = await roomsModel.occupancies(census.filter(r => !r.isClosed));
    let list = census.filter(roomFilterFn(filter, uid, occupancy));
    list = await applyListFilters(list, ctx);
    try { list = await lifetime.enrichAndFilter(list, { getKey: (x) => x.rootId }); } catch (_) {}
    if (recentFallback(ctx, list)) return;
    const pageItems = await renderedPage(async () => roomsView(list, filter, null, { q, spreadMap: new Map(), occupancy, live: await roomsModel.liveState(), modesAvail: roomModesFromCensus(census, uid, occupancy) }));
    const spreadMap = await spreads.forMessages(pageItems.map(x => x.rootId));
    await warmAuthorNames(pageItems);
    ctx.body = await roomsView(list, filter, null, { q, spreadMap, occupancy, live: await roomsModel.liveState(), modesAvail: roomModesFromCensus(census, uid, occupancy) });
  })
  .get("/rooms/:roomId", async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    await roomsModel.ingestKeys().catch(() => {});
    const uid = getViewerId();
    const room = await roomsModel.getRoomById(ctx.params.roomId).catch(() => null);
    if (!room) { ctx.redirect('/rooms'); return; }
    let isTribeMember = false;
    if (room.tribeId) {
      const t = await tribesModel.getTribeById(room.tribeId).catch(() => null);
      if (!t) { ctx.redirect('/tribes'); return; }
      if (!t.members.includes(uid)) { ctx.body = tribeAccessDeniedView(t); return; }
      isTribeMember = true;
    }
    const fav = await contentFavorites.getFavoriteSet('rooms').catch(() => new Set());
    const live = await roomsModel.liveState();
    const inside = !!(live && live.ref === room.rootId);
    const occ = inside ? null : await roomsModel.occupancy(room);
    const census = await roomsCensus();
    await warmAuthorNames([room, ...room.members.map(m => ({ author: m }))]);
    room.clearnet = await clearnetPublic('rooms', room).catch(() => false);
    const roomMember = room.author === uid || room.members.includes(uid) || isTribeMember;
    ctx.body = await singleRoomView({ ...room, isFavorite: fav.has(String(room.rootId)), isTribeMember }, {
      live, occ, available: await phoneModel.available().catch(() => false),
      recordings: roomMember ? listRoomRecordings(room.rootId) : [],
      spreads: await spreads.forMessage(room.rootId).catch(() => null),
      modesAvail: roomModesFromCensus(census, uid, await roomsModel.occupancies(census.filter(r => !r.isClosed)))
    });
  })
  .get("/calendars", async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || "recent").toLowerCase();
    const uid = getViewerId();
    if (filter === "edit") {
      const id = ctx.query.id;
      if (!id) { ctx.redirect('/calendars'); return; }
      const cal = await calendarsModel.getCalendarById(id);
      if (!cal || cal.author !== uid) { ctx.redirect('/calendars'); return; }
      cal.clearnet = await clearnetPublic('calendars', cal).catch(() => false);
      ctx.body = await calendarsView([], "edit", cal, { reach: String(ctx.query.status || '') });
      return;
    }
    const q = String(ctx.query.q || "").trim();
    const tribeId = ctx.query.tribeId || "";
    const modelFilter = filter === "favorites" ? "all" : filter;
    const calendars = await calendarsModel.listAll({ filter: modelFilter, viewerId: uid });
    const fav = await contentFavorites.getFavoriteSet('calendars');
    const enriched = calendars.filter(c => !c.tribeId).map(c => ({ ...c, isFavorite: fav.has(String(c.rootId)) }));
    let finalList = filter === "favorites" ? enriched.filter(c => c.isFavorite) : enriched;
    finalList = await applyListFilters(finalList, ctx);
    try { finalList = await lifetime.enrichAndFilter(finalList, { getKey: (x) => x.rootId || x.key }); } catch (_) {}
    if (recentFallback(ctx, finalList)) return;
    const spreadMap = await spreads.forMessages(pageOf(ctx, finalList).map(x => x && (x.rootId || x.key || x.id)));
    await warmAuthorNames(pageOf(ctx, finalList));
    await decorateSubscriptionIn('calendars', finalList);
    const calCensus = filter === 'all'
      ? enriched
      : (await censusOf('calendars', () => calendarsModel.listAll({ filter: 'all', viewerId: uid })).catch(() => []))
          .filter(c2 => !c2.tribeId).map(c2 => ({ ...c2, isFavorite: fav.has(String(c2.rootId)) }));
    const calModesAvail = calModesFromCensus(calCensus, uid);
    ctx.body = await calendarsView(finalList, filter, null, { q, modesAvail: calModesAvail, ...(tribeId ? { tribeId } : {}), spreadMap, reach: String(ctx.query.status || '') });
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
      const participants = Array.isArray(cal.participants) ? cal.participants : [];
      const isOpen = String(cal.status || '').toUpperCase() === 'OPEN';
      if (!isOpen && cal.author !== uid && !participants.includes(uid)) { ctx.redirect('/calendars?filter=all'); return; }
    }
    if (String(cal.status || '').toUpperCase() === 'CLOSED' && cal.author !== uid) {
      ctx.body = tribeAccessDeniedView(parentTribe); return;
    }
    const dates = await calendarsModel.getDatesForCalendar(cal.rootId);
    const notesByDate = {};
    const calNotes = dates.length ? await calendarsModel.getNotesForDate(cal.rootId, null) : [];
    for (const d of dates) notesByDate[d.key] = calNotes.filter(n => n.dateId === d.key);
    const fav = await contentFavorites.getFavoriteSet('calendars');
    const month = String(ctx.query.month || "").trim() || null;
    const day = String(ctx.query.day || "").trim() || null;
    await enrichItemLifetime(cal, { key: cal.rootId });
    let calSubscription = null;
    try { calSubscription = await subscriptionStateFor(cal.rootId || cal.key, cal.author); } catch (_) {}
    cal.clearnet = await clearnetPublic('calendars', cal).catch(() => false);
    ctx.body = await singleCalendarView({ ...cal, subscription: calSubscription, isFavorite: fav.has(String(cal.rootId)) }, dates, notesByDate, { month, day, spreads: await spreads.forMessage(cal.rootId).catch(() => null), modesAvail: await calModesAvailFor(), mapData: await resolveMapUrl(cal.mapUrl) });
  })
  .get("/projects", async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || "RECENT").toUpperCase()
    const viewerPrefs = await about.visibilityPrefs(getViewerId()).catch(() => null);
    if (filter === "CREATE") {
      const prefill = {
        title: String(ctx.query.title || ""),
        description: String(ctx.query.description || ""),
        goal: String(ctx.query.goal || "")
      }
      ctx.body = await projectsView([], "CREATE", null, { viewerPrefs, prefill })
      return
    }
    const q = String(ctx.query.q || '').trim()
    const modelFilter = filter === "BACKERS" ? "ALL" : filter
    let projects = await projectsModel.listProjects(modelFilter, { q })
    await enrichWithComments(projects)
    projects = await applyListFilters(projects, ctx)
    try { projects = await lifetime.enrichAndFilter(projects); } catch (_) {}
    await enrichMsgSize(pageOf(ctx, projects))
    if (recentFallback(ctx, projects, 'ALL')) return
    const spreadMap = await spreads.forMessages(pageOf(ctx, projects).map(x => x && (x.id || x.key)));
    await warmAuthorNames(pageOf(ctx, projects));
    await decorateSubscriptionIn('projects', projects)
    const projectsCensus = (String(filter).toUpperCase() === 'ALL' && !q) ? projects : await censusOf('projects', () => projectsModel.listProjects('ALL', { q: '' })).catch(() => [])
    ctx.body = await projectsView(projects, filter, null, { viewerPrefs, spreadMap, q, censusList: projectsCensus })
  })
  .get("/projects/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = ctx.params.id
    const pr = await projectsModel.getProjectById(id)
    if (pr) pr.clearnet = await clearnetPublic('projects', pr).catch(() => false);
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
    try { project.subscription = await subscriptionStateFor(project.rootId || project.id, project.author); } catch (_) {}
    if (project) project.clearnet = await clearnetPublic('projects', project).catch(() => false);
    ctx.body = await singleProjectView(await withFavorite(withCount(project, comments), 'projects'), filter, comments, { mapData, zoom, baseUrl: resolveExternalBaseUrl(ctx), spreads: await spreads.forMessage(project.id).catch(() => null) })
  })
  .get("/c/projects/:projectId", async (ctx) => {
    ctx.params.projectId = await clearnetIdFor('projects', ctx.params.projectId);
    let project;
    try { project = await projectsModel.getProjectById(ctx.params.projectId); } catch (_) {}
    if (!project || String(project.status || '').toUpperCase() === 'CANCELLED') {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    const projAuthorPrefs = await about.visibilityPrefs(project.author).catch(() => null);
    if (!clearnetPublicSync('projects', project, project.author, projAuthorPrefs, await clearnetDecisionsFor('projects', project))) {
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    ctx.type = 'text/html';
    ctx.body = await clearnetProjectView(project);
  })
  .get("/industry", async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || "RECENT").toUpperCase()
    if (filter === "CREATE" || filter === "RULES") { ctx.body = await industryView([], filter); return }
    if (filter === "BLUEPRINTS" || filter === "BUILDS") {
      const q = String(ctx.query.search || "").trim().toLowerCase()
      let items = filter === "BLUEPRINTS"
        ? await industryModel.listAllBlueprints().catch(() => [])
        : await industryModel.listAllBuilds().catch(() => [])
      if (q) items = items.filter(x => [x.name, x.title, x.description, x.notes, x.facilityName].some(v => String(v || "").toLowerCase().includes(q)))
      const shownList = await applyWishScope(items)
      const spreadMap = await spreads.forMessages(pageOf(ctx, shownList).map(x => x && (x.id || x.key))).catch(() => new Map())
      const facilityCensus = await censusOf('industry', () => industryModel.listFacilities('ALL')).catch(() => [])
      ctx.body = await industryView(shownList, filter, { spreadMap, censusList: facilityCensus })
      return
    }
    const search = String(ctx.query.search || "").trim()
    const sector = String(ctx.query.sector || "").trim().toLowerCase()
    let facilities = await industryModel.listFacilities(filter)
    if (sector) facilities = facilities.filter(x => x.sector === sector)
    if (search) {
      const q = search.toLowerCase()
      facilities = facilities.filter(x => [x.name, x.description, x.sector].some(v => String(v || "").toLowerCase().includes(q)))
    }
    try { facilities = await lifetime.enrichAndFilter(facilities); } catch (_) {}
    const shownList = await applyWishScope(facilities)
    if (recentFallback(ctx, shownList, 'ALL')) return
    await enrichMsgSize(pageOf(ctx, shownList))
    const spreadMap = await spreads.forMessages(pageOf(ctx, shownList).map(x => x && (x.id || x.key)));
    await warmAuthorNames(pageOf(ctx, shownList));
    await decorateSubscriptionIn('industry', facilities)
    const industryCensus = (String(filter).toUpperCase() === 'ALL' && !search) ? facilities : await censusOf('industry', () => industryModel.listFacilities('ALL')).catch(() => [])
    ctx.body = await industryView(shownList, filter, { spreadMap, search, sector, censusList: industryCensus })
  })
  .get("/industry/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    const fc = await industryModel.getFacilityById(ctx.params.id)
    ctx.body = await industryView([fc], "EDIT")
  })
  .get("/industry/build/:id", async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try {
      const build = await industryModel.getBuild(ctx.params.id)
      ctx.body = await singleBuildView(build, { kind: ctx.query.kind, spreads: await spreads.forMessage(build.id).catch(() => null) })
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 404 }) }
  })
  .get("/industry/builds/:id/edit", async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try {
      const build = await industryModel.getBuild(ctx.params.id)
      const fc = await industryModel.getFacilityById(build.facilityId)
      ctx.body = await buildEditView(build, fc)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 404 }) }
  })
  .get("/industry/blueprint/:id", async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try {
      const bp = await industryModel.getBlueprint(ctx.params.id)
      ctx.body = await singleBlueprintView(bp, { spreads: await spreads.forMessage(bp.id).catch(() => null) })
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 404 }) }
  })
  .get("/industry/blueprints/:id/edit", async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try {
      const bp = await industryModel.getBlueprint(ctx.params.id)
      const fc = await industryModel.getFacilityById(bp.facility)
      ctx.body = await blueprintEditView(bp, fc)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 404 }) }
  })
  .get("/industry/:id", async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    const filter = String(ctx.query.filter || "ALL").toUpperCase()
    const facility = await industryModel.getFacilityById(ctx.params.id)
    const zoom = parseInt(ctx.query.zoom) || 2;
    const [mapData, blueprints, builds, allJobs] = await Promise.all([
      resolveMapUrl(facility.mapUrl),
      industryModel.listBlueprints(ctx.params.id).catch(() => []),
      industryModel.listBuilds(ctx.params.id, 'ALL').catch(() => []),
      checkMod(ctx, 'jobsMod') ? jobsModel.listJobs('ALL', getViewerId()).catch(() => []) : Promise.resolve([])
    ])
    const facilityRef = facility.root || facility.id
    const facilityJobs = (allJobs || []).filter(j => j && j.industry === facilityRef)
    await enrichMsgSize([facility])
    await enrichItemLifetime(facility, { key: facility.id || facility.key })
    const childSpreadMap = await spreads.forMessages([...(blueprints || []), ...(builds || [])].map(x => x && (x.id || x.key))).catch(() => new Map())
    try { facility.subscription = await subscriptionStateFor(facility.rootId || facility.id, facility.steward || facility.author); } catch (_) {}
    ctx.body = await singleFacilityView(facility, filter, { mapData, zoom, blueprints, builds, facilityJobs, childSpreadMap, spreads: await spreads.forMessage(facility.id).catch(() => null) })
  })
  .post("/industry/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try {
      const image = ctx.request.files?.image ? await handleBlobUpload(ctx, "image") : null
      const facilityBody = { ...(ctx.request.body || {}), image }
      const facilityAttachment = await handleBlobUpload(ctx, 'blob')
      if (facilityAttachment) facilityBody.description = String(facilityBody.description || '') + facilityAttachment
      const res = await industryModel.createFacility(facilityBody)
      ctx.redirect(`/industry/${encodeURIComponent(res.key)}`)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try {
      const image = (ctx.request.files?.image ? await handleBlobUpload(ctx, "image") : undefined) || undefined
      await industryModel.updateFacility(ctx.params.id, { ...(ctx.request.body || {}), ...(image !== undefined ? { image } : {}) })
      ctx.redirect(`/industry/${encodeURIComponent(ctx.params.id)}`)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try { await industryModel.deleteFacility(ctx.params.id); ctx.redirect('/industry?filter=MINE') }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/join/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try { await industryModel.joinFacility(ctx.params.id); safeRefererRedirect(ctx, `/industry/${encodeURIComponent(ctx.params.id)}`) }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/apply/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try {
      const before = await industryModel.getFacilityById(ctx.params.id).catch(() => null)
      await industryModel.joinFacility(ctx.params.id)
      if (before && before.membershipPolicy === 'vote') {
        const me = getViewerId()
        for (const m of (before.members || [])) { if (m !== me) { try { await notifyBot("INDUSTRY_APPLICATION", [m], `A new habitant requested to join [${before.name || 'a facility'}](/industry/${encodeURIComponent(ctx.params.id)})`); } catch (_) {} } }
      }
      safeRefererRedirect(ctx, `/industry/${encodeURIComponent(ctx.params.id)}`)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/leave/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try { await industryModel.leaveFacility(ctx.params.id); safeRefererRedirect(ctx, `/industry/${encodeURIComponent(ctx.params.id)}`) }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/invite/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    const invitee = ctx.request.body.invitee
    try {
      await industryModel.inviteToFacility(ctx.params.id, invitee)
      try { const fc = await industryModel.getFacilityById(ctx.params.id); await notifyBot("INDUSTRY_INVITED", [invitee], `You have been invited to join [${fc.name || 'a facility'}](/industry/${encodeURIComponent(ctx.params.id)})`); } catch (_) {}
      safeRefererRedirect(ctx, `/industry/${encodeURIComponent(ctx.params.id)}`)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/govern/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    const subject = ctx.request.body.subject, ref = ctx.request.body.ref
    try {
      const before = await industryModel.getFacilityById(ctx.params.id).catch(() => null)
      await industryModel.voteGovernance(ctx.params.id, subject, ref, ctx.request.body.choice)
      const after = await industryModel.getFacilityById(ctx.params.id).catch(() => null)
      const me = getViewerId()
      if (subject === 'admit' && ref && before && after && !before.members.includes(ref) && after.members.includes(ref)) {
        try { await notifyBot("INDUSTRY_ADMITTED", [ref], `You have been admitted to [${after.name || 'a facility'}](/industry/${encodeURIComponent(ctx.params.id)})`); } catch (_) {}
      }
      if (subject === 'dissolve' && before && after && before.status !== 'DISSOLVED' && after.status === 'DISSOLVED') {
        for (const m of (after.members || [])) { if (m !== me) { try { await notifyBot("INDUSTRY_DISSOLVED", [m], `The facility [${after.name || 'a facility'}](/industry/${encodeURIComponent(ctx.params.id)}) has been dissolved by collective vote`); } catch (_) {} } }
      }
      safeRefererRedirect(ctx, `/industry/${encodeURIComponent(ctx.params.id)}`)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post('/industry/opinions/:id/:category', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try { await industryModel.createOpinion(ctx.params.id, ctx.params.category); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); return; }
    safeRefererRedirect(ctx, `/industry/${encodeURIComponent(ctx.params.id)}`)
  })
  .post("/industry/:fid/blueprints", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try {
      const image = ctx.request.files?.image ? await handleBlobUpload(ctx, "image") : null
      await industryModel.createBlueprint(ctx.params.fid, { ...(ctx.request.body || {}), image })
      safeRefererRedirect(ctx, `/industry/${encodeURIComponent(ctx.params.fid)}`)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/blueprints/:id/update", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try {
      const image = (ctx.request.files?.image ? await handleBlobUpload(ctx, "image") : undefined) || undefined
      await industryModel.updateBlueprint(ctx.params.id, { ...(ctx.request.body || {}), ...(image !== undefined ? { image } : {}) })
      const bp = await industryModel.getBlueprint(ctx.params.id).catch(() => null)
      ctx.redirect(bp ? `/industry/${encodeURIComponent(bp.facility)}` : '/industry')
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/blueprints/:id/delete", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    const bp = await industryModel.getBlueprint(ctx.params.id).catch(() => null)
    try { await industryModel.deleteBlueprint(ctx.params.id) } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); return }
    ctx.redirect(bp && bp.facilityId ? `/industry/${encodeURIComponent(bp.facilityId)}` : '/industry?filter=BLUEPRINTS')
  })
  .post("/industry/:fid/builds", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try {
      const image = ctx.request.files?.image ? await handleBlobUpload(ctx, "image") : null
      if (rejectPastDates(ctx, [[ctx.request.body && ctx.request.body.startDate, { dayOnly: true }], [ctx.request.body && ctx.request.body.endDate, { dayOnly: true }]], '/industry')) return;
      const res = await industryModel.createBuild(ctx.params.fid, { ...(ctx.request.body || {}), image })
      ctx.redirect(`/industry/build/${encodeURIComponent(res.key)}`)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/builds/:id/update", koaBody(), async (ctx) => {
    if (!checkMod(ctx, "industryMod")) { ctx.redirect("/modules"); return; }
    try {
      await industryModel.updateBuild(ctx.params.id, ctx.request.body || {})
      safeRefererRedirect(ctx, `/industry/build/${encodeURIComponent(ctx.params.id)}`)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/builds/:id/delete", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try { await industryModel.deleteBuild(ctx.params.id); ctx.redirect('/industry?filter=BUILDS') }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/builds/:id/vote", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try {
      const before = await industryModel.getBuild(ctx.params.id).catch(() => null)
      await industryModel.voteBuild(ctx.params.id, ctx.request.body.choice)
      const after = await industryModel.getBuild(ctx.params.id).catch(() => null)
      if (before && after && before.status !== 'APPROVED' && after.status === 'APPROVED' && after.proposer !== getViewerId()) {
        try { await notifyBot("INDUSTRY_BUILD_APPROVED", [after.proposer], `Your build [${after.title || 'a build'}](/industry/build/${encodeURIComponent(ctx.params.id)}) has been approved`); } catch (_) {}
      }
      safeRefererRedirect(ctx, `/industry/build/${encodeURIComponent(ctx.params.id)}`)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/builds/:id/status", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try { await industryModel.setBuildStatus(ctx.params.id, ctx.request.body.status); safeRefererRedirect(ctx, `/industry/build/${encodeURIComponent(ctx.params.id)}`) }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/builds/:id/contribute", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {}
    try {
      await industryModel.contribute(ctx.params.id, b)
      safeRefererRedirect(ctx, `/industry/build/${encodeURIComponent(ctx.params.id)}`)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .post("/industry/builds/:id/distribute", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'industryMod')) { ctx.redirect('/modules'); return; }
    try {
      const viewer = getViewerId()
      const res = await industryModel.distributeBuild(ctx.params.id, { outputValue: ctx.request.body.outputValue })
      for (const alloc of res.plan.allocations) {
        if (!alloc || !alloc.to || alloc.to === viewer || !(alloc.amount > 0)) continue
        try { await notifyBot("INDUSTRY_DISTRIBUTED", [alloc.to], `Build [${res.build.title || 'a build'}](/industry/build/${encodeURIComponent(ctx.params.id)}) allocated you ${alloc.amount.toFixed(2)} ECO`) } catch (_) {}
      }
      safeRefererRedirect(ctx, `/industry/build/${encodeURIComponent(ctx.params.id)}`)
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }) }
  })
  .get("/banking", async (ctx) => {
    if (!checkMod(ctx, 'bankingMod')) { ctx.redirect('/modules'); return; }
    const userId = getViewerId();
    const query = ctx.query;
    const filter = (query.filter || 'overview').toLowerCase();
    const q = (query.q || '').trim();
    const msg = (query.msg || '').trim();
    await bankingModel.ensureSelfAddressPublished();
    const data = await bankingModel.listBanking(filter, userId, { range: query.range ? String(query.range) : null });
    data.isPub = bankingModel.isPubNode();
    data.alreadyClaimed = data.summary?.alreadyClaimed || false;
    if (filter === 'overview' || filter === 'ubi' || filter === 'exchange') {
      const pending = (data.allocations || []).find(a => a.to === userId && (a.status === "UNCLAIMED" || a.status === "UNCONFIRMED"));
      data.pendingUBI = pending || null;
    }
    if (filter === 'addresses') {
      data.addresses = [...bankingModel.listAddressBook(), ...(data.addresses || [])];
      if (q) {
        data.addresses = data.addresses.filter(x =>
          String(x.id || '').toLowerCase().includes(q.toLowerCase()) ||
          String(x.label || '').toLowerCase().includes(q.toLowerCase()) ||
          String(x.address || '').toLowerCase().includes(q.toLowerCase())
        );
        data.search = q;
      }
    }
    data.flash = msg || '';
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
    ctx.body = renderEpochView(epoch, allocations, getViewerId());
  })
  .get("/favorites", async (ctx) => {
    const filter = qf(ctx, 'recent'), q = String(ctx.query.q || '').trim();
    const data = await favoritesModel.listAll({ filter });
    const items = applyTextSearch(data.items, q, ['title', 'name', 'description', 'category', 'url', 'tags']);
    if (recentFallback(ctx, items)) return;
    ctx.body = await favoritesView(items, filter, data.counts, q, { spreadMap: await spreads.forMessages(pageOf(ctx, items).map(x => x && x.favId)).catch(() => new Map()) });
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
    const allLogs = await logsModel.listLogs('always').catch(() => []);
    const logsTotal = allLogs.length;
    const nowLogs = Date.now();
    const logsAvail = Object.fromEntries(Object.entries(logsModel.FILTER_WINDOWS).map(([f, win]) => [f, win == null ? allLogs.length > 0 : allLogs.some(i => i.ts >= nowLogs - win)]));
    ctx.body = logsView(items, filter, null, { view: 'list', aiModOn, total: logsTotal, avail: logsAvail, search: { q: ctx.query.q || '', type: typeQ, date: dateQ } });
  })
  .get("/logs/view/:id", async (ctx) => {
    if (!checkMod(ctx, 'logsMod')) { ctx.redirect('/modules'); return; }
    const entries = await logsModel.listLogs('always');
    const entry = entries.find(e => e.key === ctx.params.id);
    if (!entry) { ctx.redirect('/logs'); return; }
    const aiModOn = logsModel.isAImodOn();
    ctx.body = logsView([], 'today', entry.mode, { view: 'detail', aiModOn, entry });
  })
  .post("/logs/create", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'logsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    const mode = b.mode === 'ai' ? 'ai' : 'manual';
    try {
      if (mode === 'ai') {
        startAI();
        const res = await logsModel.createAI();
        if (res && res.status !== 'ok') { failWith(ctx, res.status === 'ai_disabled' ? 'actionFailed' : 'logsNothingNew', '/logs'); return; }
      }
      else await logsModel.createManual(b.label || '', b.text || '');
    } catch (_) { actionFail(ctx, '/logs'); return; }
    ctx.redirect('/logs');
  })
  .get("/logs/edit/:id", async (ctx) => {
    if (!checkMod(ctx, 'logsMod')) { ctx.redirect('/modules'); return; }
    const entry = await logsModel.getLogById(ctx.params.id);
    if (!entry) { ctx.redirect('/logs'); return; }
    ctx.body = logsView([], 'today', entry.mode, { view: 'edit', aiModOn: logsModel.isAImodOn(), entry });
  })
  .post("/logs/update/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'logsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try { await logsModel.updateLog(ctx.params.id, { label: b.label || '', text: b.text || '' }); } catch (_) { return actionFail(ctx); }
    ctx.redirect(`/logs/view/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/logs/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'logsMod')) { ctx.redirect('/modules'); return; }
    try { await logsModel.deleteLog(ctx.params.id); } catch (_) { return actionFail(ctx); }
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
    if (checkMod(ctx, 'blogsMod')) {
      const target = await blogModel.blogHrefFor(message).catch(() => null);
      if (target) { ctx.redirect(target); return; }
    }
    const thread = async (message) => {
      const messages = await post.fromThread(message);
      const spreadMap = await spreads.forMessages((messages || []).map(m => m && m.key)).catch(() => new Map());
      return threadView({ messages, spreadMap });
    };
    ctx.body = await thread(message);
  })
  .get("/subtopic/:message", async (ctx) => {
    const { message } = ctx.params;
    const rootMessage = await post.get(message);
    const myFeedId = await meta.myFeedId();
    debug("%O", rootMessage);
    const messages = [rootMessage];
    const spreadMap = await spreads.forMessages(messages.map(m => m && m.key)).catch(() => new Map());
    ctx.body = await subtopicView({ messages, myFeedId, spreadMap });
  })
  .get("/publish", async (ctx) => {
    ctx.redirect('/blogs?filter=CREATE');
  })
  .get("/comment/:message", async (ctx) => {
    const { messages, myFeedId, parentMessage } =
      await resolveCommentComponents(ctx);
    const allKeys = [parentMessage && parentMessage.key, ...(messages || []).map(m => m && m.key)].filter(Boolean);
    const spreadMap = await spreads.forMessages(allKeys).catch(() => new Map());
    ctx.body = await commentView({ messages, myFeedId, parentMessage, spreadMap });
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
        const published = await bankingModel.hasPublishedAddress(userId).catch(() => false);
        if (was !== address || !published) {
          try { await bankingModel.addAddress({ userId, address }); } catch (_) {}
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
        const published = await bankingModel.hasPublishedAddress(userId).catch(() => false);
        if (was !== address || !published) {
          try { await bankingModel.addAddress({ userId, address }); } catch (_) {}
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
        const published = await bankingModel.hasPublishedAddress(userId).catch(() => false);
        if (was !== address || !published) {
          try { await bankingModel.addAddress({ userId, address }); } catch (_) {}
        }
      }
      ctx.body = await walletReceiveView(balance, address);
    } catch (error) {
      ctx.body = await walletErrorView(error);
    }
  })
  .get("/wallet/qr/:address", async (ctx) => {
    if (!checkMod(ctx, 'walletMod')) { ctx.status = 404; ctx.body = ''; return; }
    const address = decodeURIComponent(ctx.params.address || '');
    if (!ECO_ADDRESS_RE.test(address)) { ctx.status = 404; ctx.body = ''; return; }
    try {
      const QRCode = require('../server/node_modules/qrcode');
      const buf = await QRCode.toBuffer(address, { type: 'png', width: 320, margin: 1, errorCorrectionLevel: 'M' });
      ctx.set('Content-Type', 'image/png');
      ctx.set('Cache-Control', 'no-store');
      ctx.body = buf;
    } catch (_) { ctx.status = 500; ctx.body = ''; }
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
        const published = await bankingModel.hasPublishedAddress(userId).catch(() => false);
        if (was !== address || !published) {
          try { await bankingModel.addAddress({ userId, address }); } catch (_) {}
        }
      }
      let prefillTo = ECO_ADDRESS_RE.test(String(ctx.query.to || '')) ? String(ctx.query.to) : null;
      let prefillAmount = Number(ctx.query.amount) > 0 ? String(Number(ctx.query.amount)) : null;
      const transferCtx = await loadTransferForWallet(ctx, String(ctx.query.transfer || '').trim());
      if (transferCtx) {
        if (transferCtx.address) prefillTo = transferCtx.address;
        if (Number(transferCtx.amount) > 0) prefillAmount = String(Number(transferCtx.amount));
      }
      const paymentRef = transferCtx ? null : await loadPaymentRef(ctx, { payee: ctx.query.payee, concept: ctx.query.concept, ref: ctx.query.ref, to: prefillTo, tag: ctx.query.tag });
      ctx.body = await walletSendFormView(balance, prefillTo, prefillAmount, fee, null, address, { transfer: transferCtx ? { id: transferCtx.id, concept: transferCtx.concept } : null, payment: paymentRef, createTransfer: !!paymentRef && checkMod(ctx, 'transfersMod') });
    } catch (error) {
      ctx.body = await walletErrorView(error);
    }
  })
  .get('/transfers', async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    let filter = ctx.query.filter || 'recent'; if (filter === 'favs') filter = 'all';
    let list = await transfersModel.listAll(filter, getViewerId());
    try { list = await lifetime.enrichAndFilter(list, { getAuthor: (x) => x.from }); } catch (_) {}
    const shownList = await applyWishScope(list);
    if (recentFallback(ctx, shownList.filter(t => (Date.parse(t.createdAt || '') || 0) >= Date.now() - 86400000))) return;
    const favTransfers = await contentFavorites.getFavoriteSet('transfers').catch(() => new Set());
    for (const t of list || []) if (t) t.isFavorite = favTransfers.has(String(t.rootId || t.id || t.key));
    const prefill = filter === 'create' ? { to: ctx.query.to || '', amount: ctx.query.amount || '', concept: ctx.query.concept || '', category: ctx.query.category || '' } : undefined;
    const transferCensus = String(filter) === 'all' ? list : await censusOf('transfers', () => transfersModel.listAll('all', getViewerId())).catch(() => []);
    const pageItems = await renderedPage(async () => transferView(shownList, filter, null, { censusList: transferCensus, q: ctx.query.q || '', minAmount: ctx.query.minAmount ?? '', maxAmount: ctx.query.maxAmount ?? '', sort: ctx.query.sort || 'recent', category: ctx.query.category || '', spreadMap: new Map(), prefill }));
    await enrichMsgSize(pageItems);
    const spreadMap = await spreads.forMessages(pageItems.map(x => x && (x.id || x.key)));
    await warmAuthorNames(pageItems);
    ctx.body = await transferView(shownList, filter, null, { censusList: transferCensus, q: ctx.query.q || '', minAmount: ctx.query.minAmount ?? '', maxAmount: ctx.query.maxAmount ?? '', sort: ctx.query.sort || 'recent', category: ctx.query.category || '', spreadMap, prefill });
  })
  .get('/transfers/edit/:id', async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    const tr = await transfersModel.getTransferById(ctx.params.id, getViewerId());
    ctx.body = await transferView([tr], 'edit', ctx.params.id, {});
  })
  .post('/transfers/:id/share', koaBody(), async ctx => {
    if (!checkMod(ctx, 'transfersMod')) { ctx.redirect('/modules'); return; }
    const transfer = await transfersModel.getTransferById(ctx.params.id, getViewerId()).catch(() => null);
    if (!transfer) { ctx.redirect('/transfers'); return; }
    const pdf = buildSmartContractPdf({ transfer, block: null, viewerId: null });
    const slug = String(transfer.concept || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    await sharePdfBuffer(ctx, pdf, `oasis-smart-contract-${slug || 'transfer'}.pdf`, transfer.concept || '');
  })
  .get('/reports/:id/pdf', async ctx => sendContentPdf(ctx, 'reports', ctx.params.id))
  .post('/reports/:id/share', koaBody(), async ctx => sharePdfAsPm(ctx, 'reports', ctx.params.id))
  .get('/votes/:id/pdf', async ctx => sendContentPdf(ctx, 'votes', ctx.params.id))
  .post('/votes/:id/share', koaBody(), async ctx => sharePdfAsPm(ctx, 'votes', ctx.params.id))
  .get('/events/:id/pdf', async ctx => sendContentPdf(ctx, 'events', ctx.params.id))
  .post('/events/:id/share', koaBody(), async ctx => sharePdfAsPm(ctx, 'events', ctx.params.id))
  .get('/tasks/:id/pdf', async ctx => sendContentPdf(ctx, 'tasks', ctx.params.id))
  .post('/tasks/:id/share', koaBody(), async ctx => sharePdfAsPm(ctx, 'tasks', ctx.params.id))
  .get('/calendars/:id/pdf', async ctx => sendContentPdf(ctx, 'calendars', ctx.params.id))
  .post('/calendars/:id/share', koaBody(), async ctx => sharePdfAsPm(ctx, 'calendars', ctx.params.id))
  .get('/cv/pdf', async ctx => sendContentPdf(ctx, 'cv', null))
  .get('/cv/pdf/:id', async ctx => {
    const targetId = ctx.params.id;
    const viewerId = getViewerId();
    const cv = await cvModel.getCVByUserId(targetId).catch(() => null);
    const hidden = cv && String(cv.visibility || '').toUpperCase() === 'HIDDEN';
    if (!cv || (hidden && String(targetId) !== String(viewerId))) { ctx.redirect('/inhabitants?filter=CVs'); return; }
    const pdf = buildContentPdf('cv', cv, {}, String(targetId) === String(viewerId) ? viewerId : null);
    ctx.set('Content-Type', 'application/pdf');
    ctx.set('Content-Disposition', `attachment; filename="${pdfFilename('cv', cv)}"`);
    ctx.body = pdf;
  })
  .post('/cv/share', koaBody(), async ctx => sharePdfAsPm(ctx, 'cv', null))
  .post('/cv/share/:id', koaBody(), async ctx => {
    const targetId = ctx.params.id;
    const viewerId = getViewerId();
    const cv = await cvModel.getCVByUserId(targetId).catch(() => null);
    const hidden = cv && String(cv.visibility || '').toUpperCase() === 'HIDDEN';
    if (!cv || (hidden && String(targetId) !== String(viewerId))) { ctx.redirect('/inhabitants?filter=CVs'); return; }
    const pdf = buildContentPdf('cv', cv, {}, null);
    await sharePdfBuffer(ctx, pdf, pdfFilename('cv', cv), cv.name || targetId);
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
    const comments = await getVoteComments(transfer.id);
    const fav = await contentFavorites.getFavoriteSet('transfers');
    await warmAuthorNames([transfer, { author: transfer.from }, { author: transfer.to }], comments);
    const singleCensus = await censusOf('transfers', () => transfersModel.listAll('all', getViewerId())).catch(() => []);
    ctx.body = await singleTransferView({ ...transfer, isFavorite: fav.has(String(transfer.id)) }, filter, { censusList: singleCensus, q: ctx.query.q || '', minAmount: ctx.query.minAmount ?? '', maxAmount: ctx.query.maxAmount ?? '', sort: ctx.query.sort || 'recent', returnTo: safeReturnTo(ctx, `/transfers?filter=${encodeURIComponent(filter)}`, ['/transfers']), block, comments, spreads: await spreads.forMessage(transfer.id).catch(() => null) });
  })
  .post('/ai', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'aiMod')) return ctx.redirect('/modules');
    const input = String((ctx.request.body || {}).input || '').trim().slice(0, 5000);
    if (!input) {
      sendErrorPage(ctx, 'No input provided', { status: 400 });
      return;
    }
    startAI();
    const lang = ctx.cookies.get('language') || getConfig().language || 'en';
    require('../views/main_views').setLanguage(lang);
    const { SPLIT_MARKER } = require('../views/AI_view');
    try { await about.name(getViewerId()); } catch (_) {}
    const historyPath = stateFilePath('AI-history.json');
    const previous = readAiHistory(historyPath);
    const userPrompt = getConfig().ai?.prompt?.trim() || 'Provide an informative and precise response.';
    const entry = { prompt: userPrompt, question: input, answer: '', timestamp: Date.now(), trainStatus: 'thinking', snippets: [], facts: [], intent: null, source: 'model' };
    const status = await aiClient.status().catch(() => null);
    const thinkingPage = String(aiView([entry, ...previous].slice(0, 20), userPrompt, { status, split: true }));
    const cut = thinkingPage.indexOf(SPLIT_MARKER);
    const { PassThrough } = require('stream');
    const stream = new PassThrough();
    ctx.status = 200;
    ctx.type = 'html';
    ctx.set('Cache-Control', 'no-store');
    ctx.set('X-Accel-Buffering', 'no');
    ctx.body = stream;
    if (cut >= 0) stream.write(thinkingPage.slice(0, cut));
    answerAiEntry(entry, input, lang, previous).then((done) => {
      const finalHistory = [done, ...previous].slice(0, 20);
      if (done.source !== 'error') writeAiHistory(historyPath, finalHistory);
      const finalPage = String(aiView(finalHistory, userPrompt, { status, split: true }));
      const cut2 = finalPage.indexOf(SPLIT_MARKER);
      if (cut < 0 || cut2 < 0) { stream.end(finalPage); return; }
      stream.end(finalPage.slice(cut2 + SPLIT_MARKER.length));
    }).catch(() => { try { stream.end(); } catch (_) {} });
  })
  .get('/ai/export', async (ctx) => {
    if (!checkMod(ctx, 'aiMod') || config.public) return ctx.redirect('/modules');
    const lang = ctx.cookies.get('language') || getConfig().language || 'en';
    const jsonl = await exportFineTuning({ system: aiSystemPrompt(lang) }).catch(() => '');
    if (!jsonl.trim()) { ctx.redirect('/settings#ai'); return; }
    ctx.set('Content-Type', 'application/jsonl; charset=utf-8');
    ctx.set('Content-Disposition', `attachment; filename="oasis-42-finetuning-${new Date().toISOString().slice(0, 10)}.jsonl"`);
    ctx.body = jsonl;
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
    const historyPath = stateFilePath('AI-history.json');
    let chatHistory = [];
    try {
      const fileData = fs.readFileSync(historyPath, 'utf-8');
      chatHistory = JSON.parse(fileData);
    } catch {
      chatHistory = [];
    }
    const item = chatHistory.find(e => String(e.timestamp) === ts && e.source === 'model' && e.trainStatus === 'pending');
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
    ctx.body = aiView(chatHistory, userPrompt, { status: await aiClient.status().catch(() => null) });
  })
  .post('/ai/exchange/vote', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'aiMod')) return ctx.redirect('/modules');
    const targetId = String((ctx.request.body && ctx.request.body.target) || '').trim();
    const helpful = !((ctx.request.body && ctx.request.body.helpful) === 'no');
    if (targetId) {
      try { await publishExchangeVote({ targetId, helpful }); } catch (_) {}
    }
    const back = String((ctx.request.body && ctx.request.body.returnTo) || '/activity').trim();
    ctx.redirect(isLocalPath(back) ? back : '/activity');
  })
  .post('/ai/reject', koaBody(), async (ctx) => {
    const i18nAll = require('../client/assets/translations/i18n');
    const lang = ctx.cookies.get('language') || getConfig().language || 'en';
    const { setLanguage } = require('../views/main_views');
    setLanguage(lang);
    const ts = String(ctx.request.body.ts || '');
    const historyPath = stateFilePath('AI-history.json');
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
    ctx.body = aiView(chatHistory, userPrompt, { status: await aiClient.status().catch(() => null) });
  })
  .post('/ai/clear', async (ctx) => {
    const i18nAll = require('../client/assets/translations/i18n');
    const lang = ctx.cookies.get('language') || getConfig().language || 'en';
    const { setLanguage } = require('../views/main_views');
    setLanguage(lang);
    const historyPath = stateFilePath('AI-history.json');
    fs.writeFileSync(historyPath, '[]', 'utf-8');
    const config = getConfig();
    const userPrompt = config.ai?.prompt?.trim() || '';
    ctx.body = aiView([], userPrompt, { status: await aiClient.status().catch(() => null) });
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
      const isModuleEnabled = (modName) => checkMod(ctx, modName);
      if (embedder.isInstalled()) {
        const vec = await embedder.embed(raw);
        if (vec) {
          const best = await routesIndex.resolveBest(vec, { isModuleEnabled, embed: embedder.embed });
          if (best && best.path) { ctx.redirect(best.path); return; }
        }
      }
      const { aiNavResultsView } = require('../views/main_views');
      const results = routesIndex.resolveKeywordTopK({ isModuleEnabled }, raw, 8);
      if (Array.isArray(results) && results.length) { ctx.body = await aiNavResultsView({ query: raw, results }); return; }
    } catch (_) {}
    ctx.redirect('/search?query=' + encodeURIComponent(raw));
  })
  .get('/pixelia/pdf', async ctx => sendContentPdf(ctx, 'pixelia', null))
  .post('/pixelia/share', koaBody(), async ctx => sharePdfAsPm(ctx, 'pixelia', null))
  .post('/pixelia/paint', koaBody(), async (ctx) => {
    const x = Number(ctx.request.body.x), y = Number(ctx.request.body.y), color = ctx.request.body.color;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 1 || x > 50 || y < 1 || y > 200) {
      sendErrorPage(ctx, require('../views/main_views').i18n.pixeliaCoordsError, { status: 400, to: '/pixelia' });
      return;
    }
    await pixeliaModel.paintPixel(x, y, color);
    ctx.redirect('/pixelia');
  })
  .post('/pm', longTextBody, async ctx => {
    const { recipients, subject, text, crypter, precomputed, crypterKey, list = '' } = ctx.request.body;
    let recipientsArr = (recipients || '').split(',').map(s => s.trim()).filter(Boolean).filter(id => ssbRef.isFeedId(id));
    let fromList = false;
    const selectedList = String(list || '').trim();
    if (selectedList) {
      const myLists = await buildMyMailingLists().catch(() => []);
      const entry = resolveListSelection(myLists, selectedList);
      if (!entry) { ctx.throw(403, 'Not your mailing list'); return; }
      if (entry.scope === 'mailing') {
        try {
          if (longText.tooLong(text)) throw new Error('Text too long');
          await mailingModel.sendMessage(entry.target, { subject: stripDangerousTags(String(subject || '')), text: stripDangerousTags(String(text || '')) });
        } catch (e) {
          ctx.status = 400;
          ctx.state.inlineError = publishErrorText(e);
          ctx.body = await pmView(recipients, subject, text, false, '', false, null, false, '', null, { lists: myLists, selectedList });
          return;
        }
        await refreshInboxCount();
        ctx.redirect(`/mailing/${encodeURIComponent(entry.target)}`);
        return;
      }
      const subs = await listRecipientsFor(entry);
      const me = getViewerId();
      recipientsArr = Array.from(new Set([...recipientsArr, ...subs.filter(id => id !== me && ssbRef.isFeedId(id))]));
      fromList = true;
      if (recipientsArr.length === 0) {
        sendErrorPage(ctx, require('../views/main_views').i18n.pmListNoSubscribers || 'This mailing list has no subscribers yet.', { status: 400 });
        return;
      }
    }
    if (recipientsArr.length === 0) { ctx.throw(400, 'No valid recipients'); return; }
    const cfgNow = getConfig();
    if (cfgNow.pmVisibility === 'mutuals') {
      const viewer = getViewerId();
      for (const rid of recipientsArr) {
        if (rid === viewer) continue;
        let rel = null;
        try { rel = await friend.getRelationship(rid); } catch (e) { rel = null; }
        if (!pmPolicy.isRecipientAllowed({ pmVisibility: cfgNow.pmVisibility, viewerId: viewer, recipientId: rid, relationship: rel })) {
          ctx.throw(403, 'You can only send private messages to habitants with mutual support.');
        }
      }
    }
    const cleanSubject = stripDangerousTags(subject);
    const cleanText = stripDangerousTags(text);
    if (crypter) {
      let key = (typeof crypterKey === 'string' && crypterKey.length >= 32) ? crypterKey : cipherModel.generateKey();
      let encryptedText;
      if (typeof precomputed === 'string' && precomputed) {
        encryptedText = precomputed;
      } else {
        ({ encryptedText } = cipherModel.encryptData(cleanText, key));
      }
      if (encryptedText.length > PM_CRYPTER_MAX) {
        ctx.state.inlineError = require('../views/main_views').i18n.pmCrypterTooLong;
        ctx.body = await pmView(recipients, subject, text);
        return;
      }
      try {
        if (fromList || recipientsArr.length > 6) await pmModel.sendToMany(recipientsArr, cleanSubject, encryptedText, true);
        else await pmModel.sendMessage(recipientsArr, cleanSubject, encryptedText, true);
      } catch (_) {
        ctx.state.inlineError = require('../views/main_views').i18n.actionFailed;
        ctx.body = await pmView(recipients, subject, text);
        return;
      }
      await refreshInboxCount();
      ctx.body = await pmView('', '', '', false, key);
      return;
    }
    try {
      if (longText.tooLong(cleanText)) throw new Error('Text too long');
      if (fromList || recipientsArr.length > 6) {
        const sent = await pmModel.sendToMany(recipientsArr, cleanSubject, cleanText);
        if (!sent.length) throw new Error('Message not sent');
      } else await pmModel.sendMessage(recipientsArr, cleanSubject, cleanText);
    } catch (e) {
      ctx.status = 400;
      ctx.state.inlineError = publishErrorText(e);
      ctx.body = await pmView(recipients, subject, text, false, '', false, null, false, '', null, { lists: await buildMyMailingLists().catch(() => []), selectedList });
      return;
    }
    await refreshInboxCount();
    ctx.redirect('/inbox?filter=sent');
  })
  .post('/pm/preview', longTextBody, async ctx => {
    const { recipients = '', subject = '', text = '', crypter, list = '' } = ctx.request.body;
    const selectedList = String(list || '').trim();
    const lists = await buildMyMailingLists().catch(() => []);
    const listEntry = resolveListSelection(lists, selectedList);
    const listOk = !!listEntry;
    const validRecipients = (recipients || '').split(',').map(s => s.trim()).filter(Boolean).filter(id => ssbRef.isFeedId(id));
    if (validRecipients.length === 0 && !listOk) {
      ctx.state.inlineError = require('../views/main_views').i18n.pmInvalidRecipients;
      ctx.body = await pmView(recipients, subject, text, false, '', false, null, false, '', null, { lists, selectedList });
      return;
    }
    if (crypter) {
      const key = cipherModel.generateKey();
      const { encryptedText } = cipherModel.encryptData(stripDangerousTags(text), key);
      if (encryptedText.length > PM_CRYPTER_MAX) {
        ctx.state.inlineError = require('../views/main_views').i18n.pmCrypterTooLong;
        ctx.body = await pmView(recipients, subject, text, false, '', false, null, false, '', null, { lists, selectedList });
        return;
      }
      ctx.body = await pmView(recipients, subject, text, true, '', false, { key, cipher: encryptedText }, false, '', null, { lists, selectedList });
      return;
    }
    ctx.body = await pmView(recipients, subject, text, true, '', false, null, false, '', null, { lists, selectedList });
  })
  .post('/pm/file/preview', koaBodyFileshare, async ctx => {
    const b = ctx.request.body || {};
    const file = ctx.request.files && (ctx.request.files.file || ctx.request.files.blob);
    const cleanup = () => { try { if (file && file.filepath) fs.unlinkSync(file.filepath); } catch (_) {} };
    const recipient = String(b.recipient || '').trim();
    if (!ssbRef.isFeedId(recipient)) { cleanup(); fileShareError(ctx, 'recipient'); return; }
    const cfgNow = getConfig();
    if (cfgNow.pmVisibility === 'mutuals' && recipient !== getViewerId()) {
      let rel = null;
      try { rel = await friend.getRelationship(recipient); } catch (_) { rel = null; }
      if (!pmPolicy.isRecipientAllowed({ pmVisibility: cfgNow.pmVisibility, viewerId: getViewerId(), recipientId: recipient, relationship: rel })) {
        cleanup(); fileShareError(ctx, 'mutual'); return;
      }
    }
    if (!file || !file.filepath || !file.size) { cleanup(); fileShareError(ctx, 'nofile'); return; }
    if (file.size > FILESHARE_MAX_SIZE) { cleanup(); fileShareError(ctx, 'size'); return; }
    let pointer;
    try {
      pointer = await fileshareModel.createShareFromFile({
        filepath: file.filepath,
        filename: file.originalFilename || file.name || 'file',
        mime: file.mimetype || null
      });
    } catch (_) { cleanup(); fileShareError(ctx, 'failed'); return; }
    cleanup();
    const useCrypter = !!b.crypter;
    const sharedKey = useCrypter ? cipherModel.generateKey() : '';
    ctx.body = await pmView(recipient, stripDangerousTags(b.subject || ''), '', false, '', false, null, false, '', {
      recipient, subject: stripDangerousTags(b.subject || ''),
      manifestBlobId: pointer.manifestBlobId, keyHex: pointer.key,
      filename: pointer.filename, mime: pointer.mime, size: pointer.size,
      sizeLabel: formatFileSize(pointer.size), crypter: useCrypter, sharedKey
    });
  })
  .post('/pm/file', koaBodyFileshare, async ctx => {
    const b = ctx.request.body || {};
    const file = ctx.request.files && (ctx.request.files.file || ctx.request.files.blob);
    const cleanup = () => { try { if (file && file.filepath) fs.unlinkSync(file.filepath); } catch (_) {} };
    const recipient = String(b.recipient || '').trim();
    if (!ssbRef.isFeedId(recipient)) { cleanup(); fileShareError(ctx, 'recipient'); return; }
    const cfgNow = getConfig();
    if (cfgNow.pmVisibility === 'mutuals' && recipient !== getViewerId()) {
      let rel = null;
      try { rel = await friend.getRelationship(recipient); } catch (_) { rel = null; }
      if (!pmPolicy.isRecipientAllowed({ pmVisibility: cfgNow.pmVisibility, viewerId: getViewerId(), recipientId: recipient, relationship: rel })) {
        cleanup(); fileShareError(ctx, 'mutual'); return;
      }
    }
    if (!file && b.manifestBlobId) {
      let pointer = {
        type: 'fileShare', v: 1, key: String(b.keyHex || ''),
        manifestBlobId: String(b.manifestBlobId), filename: String(b.filename || 'file'),
        mime: String(b.mime || 'application/octet-stream'), size: Number(b.size) || 0
      };
      const useCrypter = !!b.crypter;
      if (useCrypter) {
        const sk = String(b.sharedKey || '');
        if (sk.length >= 32) { const { encryptedText } = cipherModel.encryptData(pointer.key, sk); pointer = { ...pointer, key: encryptedText, crypter: true }; }
      }
      try { await pmModel.sendFileShare([recipient], stripDangerousTags(b.subject || ''), pointer, useCrypter); }
      catch (_) { fileShareError(ctx, 'send'); return; }
      await refreshInboxCount();
      ctx.redirect('/inbox?filter=sent'); return;
    }
    if (!file || !file.filepath || !file.size) { cleanup(); fileShareError(ctx, 'nofile'); return; }
    if (file.size > FILESHARE_MAX_SIZE) { cleanup(); fileShareError(ctx, 'size'); return; }
    let pointer;
    try {
      pointer = await fileshareModel.createShareFromFile({
        filepath: file.filepath,
        filename: file.originalFilename || file.name || 'file',
        mime: file.mimetype || null
      });
    } catch (_) { cleanup(); fileShareError(ctx, 'failed'); return; }
    cleanup();
    const useCrypter = !!b.crypter;
    let sharedKey = '';
    if (useCrypter) {
      sharedKey = (typeof b.crypterKey === 'string' && b.crypterKey.length >= 32) ? b.crypterKey : cipherModel.generateKey();
      const { encryptedText } = cipherModel.encryptData(pointer.key, sharedKey);
      pointer = { ...pointer, key: encryptedText, crypter: true };
    }
    try {
      await pmModel.sendFileShare([recipient], stripDangerousTags(b.subject || ''), pointer, useCrypter);
    } catch (_) { fileShareError(ctx, 'send'); return; }
    await refreshInboxCount();
    if (useCrypter) { ctx.body = await pmView('', '', '', false, sharedKey); return; }
    ctx.redirect('/inbox?filter=sent');
  })
  .get('/inbox/file/:id', async ctx => {
    if (!checkMod(ctx, 'inboxMod')) { ctx.redirect('/modules'); return; }
    const messages = await buildInboxMessages();
    const msg = messages.find(m => m && m.key === ctx.params.id);
    const fileShare = msg && msg.value && msg.value.content && msg.value.content.fileShare;
    if (!fileShare || fileShare.crypter) { ctx.redirect('/inbox'); return; }
    if (!(await fileshareModel.ensureAvailable(fileShare))) { sendErrorPage(ctx, require('../views/main_views').i18n.fileShareUnavailable, { status: 400, to: '/inbox' }); return; }
    ctx.type = fileShare.mime || 'application/octet-stream';
    ctx.set('Content-Disposition', contentDisposition('attachment', fileShare.filename || 'file'));
    const stream = fileshareModel.readShareStream(fileShare);
    if (msg.value.author && msg.value.author !== getViewerId()) {
      stream.on('end', () => { fileshareModel.removeLocalBlobs(fileShare).catch(() => {}); });
    }
    ctx.body = stream;
  })
  .post('/inbox/file/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'inboxMod')) { ctx.redirect('/modules'); return; }
    const { key } = ctx.request.body || {};
    const messages = await buildInboxMessages();
    const msg = messages.find(m => m && m.key === ctx.params.id);
    const fileShare = msg && msg.value && msg.value.content && msg.value.content.fileShare;
    if (!fileShare) { ctx.redirect('/inbox'); return; }
    let pointer = fileShare;
    if (fileShare.crypter) {
      if (typeof key !== 'string' || !key) { ctx.redirect('/inbox'); return; }
      try {
        pointer = { ...fileShare, key: cipherModel.decryptData(fileShare.key, key) };
      } catch (_) { sendErrorPage(ctx, require('../views/main_views').i18n.pmCrypterBadKey, { status: 400, to: '/inbox' }); return; }
    }
    if (!(await fileshareModel.ensureAvailable(pointer))) { sendErrorPage(ctx, require('../views/main_views').i18n.fileShareUnavailable, { status: 400, to: '/inbox' }); return; }
    ctx.type = fileShare.mime || 'application/octet-stream';
    ctx.set('Content-Disposition', contentDisposition('attachment', fileShare.filename || 'file'));
    const stream = fileshareModel.readShareStream(pointer);
    if (msg.value.author && msg.value.author !== getViewerId()) {
      stream.on('end', () => { fileshareModel.removeLocalBlobs(pointer).catch(() => {}); });
    }
    ctx.body = stream;
  })
  .post('/inbox/delete/:id', koaBody(), async ctx => {
    await pmModel.deleteMessageById(ctx.params.id);
    await refreshInboxCount();
    ctx.redirect('/inbox');
  })
  .post("/search", koaBody(), async (ctx) => {
    const b = ctx.request.body || {};
    const q = new URLSearchParams();
    for (const k of ['query', 'from', 'to', 'inhabitant', 'perPage']) if (typeof b[k] === 'string' && b[k]) q.set(k, b[k]);
    for (const t of [].concat(b.type || [])) if (typeof t === 'string' && t) q.append('type', t);
    const s = q.toString();
    ctx.redirect(s ? `/search?${s}` : '/search');
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
    let target = '/blogs';
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
      seedSpreadContent(ssb, message);
    } catch (e) {
      sendErrorPage(ctx, `Spread failed: ${e.message || e}`, { status: 500 });
      return;
    }
    ctx.redirect(target);
  })
  .post("/like/:message", koaBody(), async (ctx) => {
    const { message } = ctx.params, voteValue = Number(ctx.request.body.voteValue);
    const ref = ctx.request.header.referer;
    let target = '/blogs';
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
  .post('/forum/create', koaBody({ multipart: true }), async ctx => {
    const { category, title, text, isPublic } = ctx.request.body;
    const isPrivate = String(isPublic || 'public').toLowerCase() === 'private';
    let cleanText = stripDangerousTags(text);
    const blobMarkdown = await handleBlobUpload(ctx, 'blob');
    if (blobMarkdown) cleanText += blobMarkdown;
    const keepForum = async (err) => {
      ctx.status = 400;
      ctx.state.inlineError = publishErrorText(err);
      ctx.body = await forumView([], 'create', { draft: { category, title: stripDangerousTags(title), text: cleanText, isPrivate } });
    };
    if (longText.tooLong(cleanText)) { await keepForum(new Error('Text too long')); return; }
    try { await forumModel.createForum(category, stripDangerousTags(title), cleanText, isPrivate); }
    catch (err) { await keepForum(err); return; }
    ctx.redirect('/forum');
  })
  .post('/forum/:id/message', koaBody({ multipart: true }), async ctx => {
    const { message, parentId } = ctx.request.body;
    let cleanedMsg = stripDangerousTags(message);
    const blobMarkdown = await handleBlobUpload(ctx, 'blob');
    if (blobMarkdown) cleanedMsg += blobMarkdown;
    const keepReply = async (err) => {
      ctx.status = 400;
      ctx.state.inlineError = publishErrorText(err);
      ctx.body = await forumPageBody(ctx, ctx.params.id, null, { draft: { message: cleanedMsg, parentId: parentId || null } });
    };
    if (longText.tooLong(cleanedMsg)) { await keepReply(new Error('Text too long')); return; }
    const mentions = await extractMentions(cleanedMsg);
    try { await forumModel.addMessageToForum(ctx.params.id, { text: cleanedMsg, author: getViewerId(), timestamp: new Date().toISOString(), mentions: mentions.length > 0 ? mentions : undefined }, parentId); }
    catch (err) { await keepReply(err); return; }
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
  .post('/forum/generate-invite/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'forumMod')) { ctx.redirect('/modules'); return; }
    try {
      const { code } = await forumModel.generateInvite(ctx.params.id);
      ctx.body = renderForumInvitePage(code);
    } catch (_) {
      actionFail(ctx);
    }
  })
  .post('/forum/open-invite/create/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'forumMod')) { ctx.redirect('/modules'); return; }
    try { await forumModel.generateOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(safeReturnTo(ctx, `/forum/${encodeURIComponent(ctx.params.id)}`, ['/forum']));
  })
  .post('/forum/open-invite/remove/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'forumMod')) { ctx.redirect('/modules'); return; }
    try { await forumModel.removeOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(safeReturnTo(ctx, `/forum/${encodeURIComponent(ctx.params.id)}`, ['/forum']));
  })
  .post('/forum/join-code', koaBody(), async ctx => {
    if (!checkMod(ctx, 'forumMod')) { ctx.redirect('/modules'); return; }
    const code = String((ctx.request.body || {}).code || '').trim();
    try {
      const { forumId } = await forumModel.joinByInvite(code);
      ctx.redirect(safeReturnTo(ctx, `/forum/${encodeURIComponent(forumId)}`, ['/forum']));
    } catch (e) {
      inviteCodeFail(ctx, e);
    }
  })
  .post('/backup/keys/export', koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const pw = ctx.request.body.password;
    if (!pw || pw.length < 32) return ctx.redirect('/backup');
    try {
      const { filename, data } = await backupModel.exportKeys({ password: pw });
      ctx.set('Content-Type', 'application/octet-stream');
      ctx.set('Content-Disposition', `attachment; filename="${filename}"`);
      ctx.set('Content-Length', String(data.length));
      ctx.body = data;
    } catch (error) { sendErrorPage(ctx, error.message); }
  })
  .post('/backup/keys/import', koaBody({ multipart: true, formidable: { keepExtensions: true, uploadDir: os.tmpdir(), maxFileSize: 1024 * 1024 } }), async (ctx) => {
    const uploadedFile = ctx.request.files?.uploadedFile, pw = ctx.request.body.importPassword;
    if (config.public || !isLoopbackRequest(ctx)) { discardUpload(uploadedFile); ctx.status = 403; ctx.body = ''; return; }
    if (!uploadedFile) return ctx.redirect('/backup');
    if (!pw || pw.length < 32) { discardUpload(uploadedFile); return ctx.redirect('/backup'); }
    try {
      const imported = await backupModel.importKeys({ filePath: uploadedFile.filepath, password: pw });
      try { onboardingModel.adopt(imported.id); } catch (_) {}
      ctx.redirect('/backup');
    } catch (error) { discardUpload(uploadedFile); sendErrorPage(ctx, error.message, { status: 400 }); }
  })
  .post('/backup/export', koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    if (!checkMod(ctx, 'backupMod')) return ctx.redirect('/modules');
    const b = ctx.request.body || {};
    const pw = String(b.password || '');
    if (pw.length < 32) return ctx.redirect('/backup');
    const rawMods = b.modules === undefined ? [] : (Array.isArray(b.modules) ? b.modules : [b.modules]);
    const outPath = path.join(os.tmpdir(), `oasis-backup-${process.pid}-${Date.now()}.oasisbk`);
    try {
      const res = await backupModel.createBackup({ scope: b.scope, blobs: b.blobs, modules: rawMods, since: b.since }, pw, outPath);
      ctx.set('Content-Type', 'application/octet-stream');
      ctx.set('Content-Disposition', `attachment; filename="${res.filename}"`);
      ctx.set('Content-Length', String(res.bytes));
      const stream = fs.createReadStream(outPath);
      stream.on('close', () => { try { fs.unlinkSync(outPath); } catch (_) {} });
      ctx.body = stream;
    } catch (error) { try { fs.unlinkSync(outPath); } catch (_) {} sendErrorPage(ctx, error.message); }
  })
  .post('/backup/import', koaBody({ multipart: true, formidable: { keepExtensions: true, uploadDir: os.tmpdir(), maxFileSize: 4 * 1024 * 1024 * 1024 } }), async (ctx) => {
    const uploadedFile = ctx.request.files?.uploadedFile, pw = ctx.request.body.importPassword;
    if (config.public || !isLoopbackRequest(ctx)) { discardUpload(uploadedFile); ctx.status = 403; ctx.body = ''; return; }
    if (!checkMod(ctx, 'backupMod')) { discardUpload(uploadedFile); return ctx.redirect('/modules'); }
    if (!uploadedFile || !pw || String(pw).length < 32) { discardUpload(uploadedFile); return ctx.redirect('/backup?type=RESTORE'); }
    const current = backupModel.restoreStatus();
    if (current && current.running) { try { fs.unlinkSync(uploadedFile.filepath); } catch (_) {} return ctx.redirect('/backup?type=RESTORE'); }
    const job = backupModel.startRestore({ filePath: uploadedFile.filepath, password: String(pw) });
    job.promise.then(() => { try { activityModel.invalidateCache(); } catch (_) {} });
    ctx.redirect('/backup?type=RESTORE');
  })

  .post('/trending/:contentId/:category', async (ctx) => {
    const { contentId, category } = ctx.params, voterId = SSBconfig?.keys?.id;
    if ((await trendingModel.getMessageById(contentId))?.content?.opinions_inhabitants?.includes(voterId)) {
      return failWith(ctx, 'opinionAlreadyGiven', '/trending');
    }
    await trendingModel.createVote(contentId, category); ctx.redirect('/trending');
  })
  .post('/opinions/:contentId/:category', async (ctx) => {
    const { contentId, category } = ctx.params, voterId = SSBconfig?.keys?.id;
    if ((await opinionsModel.getMessageById(contentId))?.content?.opinions_inhabitants?.includes(voterId)) {
      return failWith(ctx, 'opinionAlreadyGiven', '/opinions');
    }
    await opinionsModel.createVote(contentId, category); ctx.redirect('/opinions');
  })
  .post('/agenda/discard/:itemId', async (ctx) => {
    await agendaModel.discardItem(ctx.params.itemId); ctx.redirect('/agenda');
  })
  .post('/agenda/restore/:itemId', async (ctx) => {
    await agendaModel.restoreItem(ctx.params.itemId); ctx.redirect('/agenda?filter=discarded');
  })
  .post('/agenda/remove/:itemId', async (ctx) => {
    await agendaModel.removeItem(ctx.params.itemId); ctx.redirect('/agenda?filter=discarded');
  })
  .post("/feed/preview", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const text = ctx.request.body?.text != null ? String(ctx.request.body.text) : "";
    const kept = typeof ctx.request.body?.media === "string" && FEED_MEDIA_MD_RE.test(ctx.request.body.media) ? ctx.request.body.media.trim() : "";
    const fresh = await handleBlobUpload(ctx, 'blob').catch(() => null);
    ctx.body = feedCreateView({ text, media: fresh ? String(fresh).trim() : kept, clearnet: String(ctx.request.body?.clearnet || '') === '1' });
  })
  .post("/feed/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const text = ctx.request.body?.text != null ? stripDangerousTags(String(ctx.request.body.text)) : "";
    const mentions = await extractMentions(text);
    const kept = typeof ctx.request.body?.media === "string" && FEED_MEDIA_MD_RE.test(ctx.request.body.media) ? ctx.request.body.media.trim() : "";
    const media = (await handleBlobUpload(ctx, 'blob')) || kept || null;
    try { await applyClearnetChoice(ctx, 'feed', await feedModel.createFeed(text, mentions, media)); }
    catch (err) {
      if (/too long|too short|required/i.test(String(err && err.message))) {
        const t = require('../views/main_views').i18n;
        ctx.state.inlineError = /too long/i.test(String(err.message)) ? t.publishTooLong : t.publishTooShort;
        ctx.status = 400;
        ctx.body = feedCreateView({ text, media: media || '', clearnet: String(ctx.request.body?.clearnet || '') === '1' });
        return;
      }
      throw err;
    }
    ctx.redirect("/feed?filter=ALL&msg=feedPublished");
  })
  .post("/feed/opinions/:feedId/:category", async (ctx) => {
    const { feedId, category } = ctx.params;
    try {
      await feedModel.addOpinion(feedId, category);
    } catch {}
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(ctx.get("Referer") || "/feed");
  })
  .post("/clearnet/item/:id", koaBody(), async (ctx) => {
    const id = String(ctx.params.id || '');
    const kind = String((ctx.request.body || {}).kind || '');
    const on = String((ctx.request.body || {}).on || '') === '1';
    if (!/^%[A-Za-z0-9+/]{43}=\.sha256$/.test(id) || !CLEARNET_KIND_PREF[kind]) { safeRefererRedirect(ctx, '/'); return; }
    const ssb = await cooler.open();
    const msg = await new Promise((res) => ssb.get(id, (e, m) => res(e ? null : m)));
    const c = msg && msg.content;
    const owner = c && typeof c === 'object' ? (c.author || c.seller || c.organizer || msg.author) : null;
    if (!msg || typeof c !== 'object' || c.tribeId || c.encrypted === true || tribeCrypto.isTribeMsg(c) || (msg.author !== ssb.id && owner !== ssb.id)) { failWith(ctx, 'actionFailed'); return; }
    if (on && CLEARNET_REACH_OK[kind]) {
      const getters = { rooms: () => roomsModel.getRoomById(id), maps: () => mapsModel.getMapById(id, getViewerId()), calendars: () => calendarsModel.getCalendarById(id) };
      const current = getters[kind] ? await getters[kind]().catch(() => null) : null;
      if (!CLEARNET_REACH_OK[kind](current)) { failWith(ctx, 'clearnetPrivateConflict'); return; }
    } else if (on) {
      const versions = await new Promise((res) => { try { pull(ssb.messagesByType({ type: c.type }), pull.collect((e, a) => res(e ? [] : a))); } catch (_) { res([]); } });
      const nextOf = new Map();
      for (const m of versions) { const vc = m && m.value && m.value.content; if (vc && typeof vc.replaces === 'string' && m.value.author === msg.author) nextOf.set(vc.replaces, m); }
      let tip = { key: id, value: { content: c } };
      const seen = new Set([id]);
      while (nextOf.has(tip.key) && !seen.has(nextOf.get(tip.key).key)) { tip = nextOf.get(tip.key); seen.add(tip.key); }
      const tc = tip.value && tip.value.content;
      if (clearnetBlockedContent(c) || !tc || typeof tc !== 'object' || clearnetBlockedContent(tc)) { failWith(ctx, 'clearnetPrivateConflict'); return; }
    }
    try { await setClearnetItem(kind, await clearnetRootOf(id).catch(() => id), on); } catch (_) { actionFail(ctx); return; }
    safeRefererRedirect(ctx, '/');
  })
  .post("/comments/delete/:id", koaBody(), async (ctx) => {
    await tombstoneOwnMessage(ctx, (c) => (c.type === 'post' && c.root) || (c.type === 'feed-action' && c.action === 'comment'));
  })
  .post("/larp/post/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'larpMod')) return ctx.redirect('/modules');
    await tombstoneOwnMessage(ctx, (c) => c.type === 'larpHousePost');
  })
  .post("/feed/delete/:id", koaBody(), async (ctx) => {
    try { await feedModel.deleteFeedById(ctx.params.id); } catch (_) { return actionFail(ctx); }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/feed?filter=MINE', ['/feed']));
  })
  .post("/blogs/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'blogsMod')) { ctx.redirect('/modules'); return; }
    try { await blogModel.deleteBlogById(ctx.params.id); } catch (_) { return actionFail(ctx); }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/blogs?filter=MINE', ['/blogs']));
  })
  .post("/feed/refeed/:id", koaBody(), async (ctx) => {
    try {
      await feedModel.createRefeed(ctx.params.id);
    try { activityModel.invalidateCache(); } catch (_) {}
    } catch (e) {
      if (e.message !== "Already refeeded") throw e;
    }
    ctx.redirect(ctx.get("Referer") || "/feed");
  })
  .post("/feed/:feedId/comments", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const text = ctx.request.body?.text != null ? stripDangerousTags(String(ctx.request.body.text)) : "";
    const imageMarkdown = ctx.request.files?.blob ? await handleBlobUpload(ctx, 'blob') : null;
    const fullText = imageMarkdown ? (text ? text + '\n' : '') + imageMarkdown : text;
    if (isBlankText(fullText)) { ctx.redirect(`/feed/${encodeURIComponent(ctx.params.feedId)}`); return; }
    await feedModel.addComment(ctx.params.feedId, fullText);
    ctx.redirect(`/feed/${encodeURIComponent(ctx.params.feedId)}`);
  })
  .post("/bookmarks/create", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    const clearnetCreated = await bookmarksModel.createBookmark(stripDangerousTags(b.url), b.tags, stripDangerousTags(b.description), b.lastVisit);
    await applyClearnetChoice(ctx, 'bookmarks', clearnetCreated);
    ctx.redirect(safeReturnTo(ctx, '/bookmarks?filter=all', ['/bookmarks']));
  })
  .post("/bookmarks/update/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'bookmarksMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body;
    await bookmarksModel.updateBookmarkById(ctx.params.id, { url: stripDangerousTags(b.url), tags: b.tags, description: stripDangerousTags(b.description), lastVisit: b.lastVisit });
    await applyClearnetChoice(ctx, 'bookmarks', ctx.params.id);
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
    const clearnetCreated = await imagesModel.createImage(blob, b.tags, stripDangerousTags(b.title), stripDangerousTags(b.description), stripDangerousTags(b.mapUrl || ""), formLicense(b));
    await applyClearnetChoice(ctx, 'images', clearnetCreated);
    ctx.redirect(safeReturnTo(ctx, '/images?filter=all', ['/images']));
  })
  .post("/images/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'imagesMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, blob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    await imagesModel.updateImageById(ctx.params.id, blob, b.tags, stripDangerousTags(b.title), stripDangerousTags(b.description), stripDangerousTags(b.mapUrl || ""), formLicense(b, { keep: true }));
    await applyClearnetChoice(ctx, 'images', ctx.params.id);
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
    if (clearnetReachConflict('maps', b)) return renderClearnetConflict(ctx, () => mapsView([], 'create', null, { lat: b.lat, lng: b.lng, zoom: b.zoom, title: b.title, description: b.description, markerLabel: b.markerLabel, tags: b.tags, mapType: b.mapType, clearnet: '1', ...(b.tribeId ? { tribeId: b.tribeId } : {}) }));
    if (b.tribeId) {
      const t = await tribesModel.getTribeById(b.tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    const imageId = extractBlobId(await handleBlobUpload(ctx, 'image')) || "";
    const newMap = await mapsModel.createMap(b.lat, b.lng, stripDangerousTags(b.description), b.mapType, b.tags, stripDangerousTags(b.title), b.tribeId || null, stripDangerousTags(b.markerLabel), imageId);
    const createdMap = await mapsModel.getMapById(newMap.key, getViewerId()).catch(() => null);
    await applyClearnetChoice(ctx, 'maps', createdMap || newMap, { allowed: CLEARNET_REACH_OK.maps(createdMap) });
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
    if (target && target.author === getViewerId() && (clearnetReachConflict('maps', b) || (String(b.clearnet || '') === '1' && !CLEARNET_REACH_OK.maps({ ...target, mapType: b.mapType || target.mapType })))) {
      return renderClearnetConflict(ctx, () => mapsView([target], 'edit', target.key, { lat: b.lat, lng: b.lng, zoom: b.zoom, title: b.title, description: b.description, tags: b.tags, clearnet: '1', reach: String(b.mapType || ''), returnTo: String(b.returnTo || '') }));
    }
    const imageId = ctx.request.files?.image ? extractBlobId(await handleBlobUpload(ctx, 'image')) || "" : "";
    await mapsModel.updateMapById(ctx.params.id, b.lat, b.lng, stripDangerousTags(b.description), b.mapType, b.tags, stripDangerousTags(b.title), imageId || undefined);
    await applyClearnetChoice(ctx, 'maps', target ? (target.rootId || target.key) : ctx.params.id, { recheck: true, allowed: CLEARNET_REACH_OK.maps(await mapsModel.getMapById(ctx.params.id, getViewerId()).catch(() => null)) });
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
  .post("/maps/marker/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    try { await mapsModel.deleteMarker(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(safeReturnTo(ctx, '/maps?filter=all', ['/maps']));
  })
  .post("/maps/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'maps', 'add'))
  .post("/maps/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'maps', 'remove'))
  .post("/maps/generate-invite/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    try {
      const code = await mapsModel.generateInvite(ctx.params.id);
      ctx.body = renderMapInvitePage(code);
    } catch (_) {
      actionFail(ctx);
    }
  })
  .post("/maps/open-invite/create/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    try { await mapsModel.generateOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(`/maps/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/maps/open-invite/remove/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    try { await mapsModel.removeOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(`/maps/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/maps/join-code", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    const code = String((ctx.request.body || {}).code || "").trim();
    try {
      const mapId = await mapsModel.joinByInvite(code);
      ctx.redirect(`/maps/${encodeURIComponent(mapId)}`);
    } catch (e) {
      inviteCodeFail(ctx, e);
    }
  })
  .post("/maps/join/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'mapsMod')) { ctx.redirect('/modules'); return; }
    try { await mapsModel.joinMap(ctx.params.id); } catch (_) { actionFail(ctx); return; }
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
  .get('/maps/:id/pdf', async ctx => sendContentPdf(ctx, 'maps', ctx.params.id))
  .post('/maps/:id/share', koaBody(), async ctx => sharePdfAsPm(ctx, 'maps', ctx.params.id))
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
    const fromBlob = typeof ctx.request.body?.fromBlob === 'string' && ctx.request.body.fromBlob.startsWith('&') ? ctx.request.body.fromBlob.trim() : '';
    const uploaded = ctx.request.files?.torrent;
    const uploadedSize = Number((Array.isArray(uploaded) ? uploaded[0] : uploaded)?.size || 0);
    if (fromBlob && !uploadedSize) {
      const generated = await buildTorrentFromBlob(fromBlob, title || ctx.request.body?.fromName, [resolveExternalBaseUrl(ctx), clearnetPublicBase()]).catch(() => null);
      if (!generated) { sendErrorPage(ctx, require('../views/main_views').i18n.torrentFromContentMissing, { status: 400, to: '/torrents?filter=create', keep: { fromBlob, name: String(title || '') } }); return; }
      await torrentsModel.createTorrent(generated.markdown, stripDangerousTags(tags), stripDangerousTags(title || generated.fileName), stripDangerousTags(description), generated.size, cleanTribeId, { source: fromBlob, sourceName: generated.fileName, sourceMime: generated.mime });
      ctx.redirect(cleanTribeId ? `/tribe/${encodeURIComponent(cleanTribeId)}?section=torrents` : '/torrents?filter=mine');
      return;
    }
    if (cleanTribeId && uploadedSize > 0) {
      const torrentFile = Array.isArray(uploaded) ? uploaded[0] : uploaded;
      const enc = await encryptUploadForTribe(torrentFile, { filename: `${String(title || torrentFile.originalFilename || 'download').replace(/\.torrent$/i, '')}.torrent`, mime: 'application/x-bittorrent' });
      await torrentsModel.createTorrent(enc.markdown, stripDangerousTags(tags), stripDangerousTags(title), stripDangerousTags(description), enc.size, cleanTribeId, { cipher: enc.cipher });
      ctx.redirect(`/tribe/${encodeURIComponent(cleanTribeId)}?section=torrents`);
      return;
    }
    const blob = await handleBlobUpload(ctx, 'torrent');
    const fileSize = uploadedSize;
    const clearnetCreated = await torrentsModel.createTorrent(blob, stripDangerousTags(tags), stripDangerousTags(title), stripDangerousTags(description), fileSize, cleanTribeId);
    if (!cleanTribeId) await applyClearnetChoice(ctx, 'torrents', clearnetCreated);
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
    const rawT = ctx.request.files?.torrent;
    const newT = Array.isArray(rawT) ? rawT[0] : rawT;
    let blob = null, extra = null;
    if (newT && Number(newT.size) > 0 && target && target.tribeId) {
      const enc = await encryptUploadForTribe(newT, { filename: `${String(title || target.title || 'download').replace(/\.torrent$/i, '')}.torrent`, mime: 'application/x-bittorrent' });
      blob = enc.markdown;
      extra = { cipher: enc.cipher };
    } else if (newT && Number(newT.size) > 0) {
      blob = await handleBlobUpload(ctx, 'torrent');
    }
    await torrentsModel.updateTorrentById(ctx.params.id, blob, stripDangerousTags(tags), stripDangerousTags(title), stripDangerousTags(description), extra);
    await applyClearnetChoice(ctx, 'torrents', ctx.params.id);
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
  .post("/files/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'filesMod')) { ctx.redirect('/modules'); return; }
    const { tags, title, description, tribeId } = ctx.request.body;
    const cleanTribeId = tribeId ? String(tribeId).trim() : null;
    if (cleanTribeId) {
      const t = await tribesModel.getTribeById(cleanTribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    const rawFile = ctx.request.files?.file;
    const uploaded = Array.isArray(rawFile) ? rawFile[0] : rawFile;
    if (!uploaded || !(Number(uploaded.size) > 0)) { sendErrorPage(ctx, require('../views/main_views').i18n.fileEmptyError, { status: 400 }); return; }
    let mime = String(uploaded.mimetype || '');
    try { const ft = await FileType.fromFile(uploaded.filepath); if (ft && ft.mime) mime = ft.mime; } catch (_) {}
    const fileName = String(uploaded.originalFilename || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120);
    if (cleanTribeId) {
      const enc = await encryptUploadForTribe(uploaded, { filename: fileName, mime });
      await filesModel.createFile(enc.markdown, stripDangerousTags(tags), stripDangerousTags(title || fileName), stripDangerousTags(description), enc.size, cleanTribeId, { mime, fileName, cipher: enc.cipher });
      ctx.redirect(`/tribe/${encodeURIComponent(cleanTribeId)}?section=files`);
      return;
    }
    const blob = await handleBlobUpload(ctx, 'file');
    const modOn = (key) => { try { return getConfig().modules[key] === 'on'; } catch (_) { return false; } };
    const handOver = !cleanTribeId && (
      (mime.startsWith('image/') && modOn('imagesMod') && 'images') ||
      (mime.startsWith('audio/') && modOn('audiosMod') && 'audios') ||
      (mime.startsWith('video/') && modOn('videosMod') && 'videos') ||
      (mime === 'application/pdf' && modOn('documentsMod') && 'documents') || null);
    if (handOver) {
      const cleanTitle = stripDangerousTags(title || fileName), cleanTags = stripDangerousTags(tags), cleanDesc = stripDangerousTags(description);
      const handed = handOver === 'images' ? await imagesModel.createImage(blob, cleanTags, cleanTitle, cleanDesc, '')
        : handOver === 'audios' ? await audiosModel.createAudio(blob, cleanTags, cleanTitle, cleanDesc, '')
        : handOver === 'videos' ? await videosModel.createVideo(blob, cleanTags, cleanTitle, cleanDesc, '')
        : await documentsModel.createDocument(blob, cleanTags, cleanTitle, cleanDesc);
      await applyClearnetChoice(ctx, handOver, handed);
      ctx.redirect(`/${handOver}?filter=mine`);
      return;
    }
    const fileTitle = stripDangerousTags(title || fileName), fileTags = stripDangerousTags(tags), fileDesc = stripDangerousTags(description);
    const linked = await createTorrentForFile(ctx, blob, { title: fileName || fileTitle, tags: fileTags, description: fileDesc, tribeId: cleanTribeId });
    const clearnetCreated = await filesModel.createFile(blob, fileTags, fileTitle, fileDesc, Number(uploaded.size) || 0, cleanTribeId, { mime, fileName, ...(linked || {}) });
    if (!cleanTribeId) await applyClearnetChoice(ctx, 'files', clearnetCreated);
    ctx.redirect(cleanTribeId ? `/tribe/${encodeURIComponent(cleanTribeId)}?section=files` : safeReturnTo(ctx, '/files?filter=all', ['/files']));
  })
  .post("/files/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'filesMod')) { ctx.redirect('/modules'); return; }
    const target = await filesModel.getFileById(ctx.params.id, getViewerId()).catch(() => null);
    if (target && target.tribeId) {
      const t = await tribesModel.getTribeById(target.tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    const { tags, title, description } = ctx.request.body;
    const rawNew = ctx.request.files?.file;
    const newFile = Array.isArray(rawNew) ? rawNew[0] : rawNew;
    let blob = null;
    let extra = null;
    if (newFile && Number(newFile.size) > 0 && target && target.tribeId) {
      let mime = String(newFile.mimetype || '');
      try { const ft = await FileType.fromFile(newFile.filepath); if (ft && ft.mime) mime = ft.mime; } catch (_) {}
      const fileName = String(newFile.originalFilename || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120);
      const enc = await encryptUploadForTribe(newFile, { filename: fileName, mime });
      blob = enc.markdown;
      extra = { mime, fileName, size: enc.size, cipher: enc.cipher };
    } else if (newFile && Number(newFile.size) > 0) {
      blob = await handleBlobUpload(ctx, 'file');
    }
    if (blob && !extra) {
      let mime = String(newFile.mimetype || '');
      try { const ft = await FileType.fromFile(newFile.filepath); if (ft && ft.mime) mime = ft.mime; } catch (_) {}
      const fileName = String(newFile.originalFilename || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120);
      const linked = await createTorrentForFile(ctx, blob, { title: fileName || stripDangerousTags(title), tags: stripDangerousTags(tags), description: stripDangerousTags(description), tribeId: target && target.tribeId });
      extra = { mime, fileName, size: Number(newFile.size) || 0, ...(linked || {}) };
    }
    await filesModel.updateFileById(ctx.params.id, blob, stripDangerousTags(tags), stripDangerousTags(title), stripDangerousTags(description), extra);
    await applyClearnetChoice(ctx, 'files', ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/files?filter=mine', ['/files']));
  })
  .post("/files/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'filesMod')) { ctx.redirect('/modules'); return; }
    return deleteAction(ctx, 'files');
  })
  .post("/files/opinions/:fileId/:category", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'filesMod')) { ctx.redirect('/modules'); return; }
    return opinionAction(ctx, 'files', 'fileId');
  })
  .post("/files/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'files', 'add'))
  .post("/files/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'files', 'remove'))
  .post("/files/:fileId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'files', 'fileId'))
  .post("/videos/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => mediaCreateAction(ctx, 'videos'))
  .post("/videos/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => mediaUpdateAction(ctx, 'videos'))
  .post("/videos/delete/:id", koaBody(), async ctx => deleteAction(ctx, 'videos'))
  .post("/videos/opinions/:videoId/:category", koaBody(), async ctx => opinionAction(ctx, 'videos', 'videoId'))
  .post("/videos/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'videos', 'add'))
  .post("/videos/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'videos', 'remove'))
  .post("/videos/:videoId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'videos', 'videoId'))
  .post("/documents/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const docBlob = await handleBlobUpload(ctx, "document"), b = ctx.request.body;
    const clearnetCreated = await documentsModel.createDocument(docBlob, b.tags, stripDangerousTags(b.title), stripDangerousTags(b.description), formLicense(b));
    await applyClearnetChoice(ctx, 'documents', clearnetCreated);
    ctx.redirect(safeReturnTo(ctx, "/documents?filter=all", ["/documents"]));
  })
  .post("/documents/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const b = ctx.request.body, blob = ctx.request.files?.document ? await handleBlobUpload(ctx, "document") : null;
    await documentsModel.updateDocumentById(ctx.params.id, blob, b.tags, stripDangerousTags(b.title), stripDangerousTags(b.description), formLicense(b, { keep: true }));
    await applyClearnetChoice(ctx, 'documents', ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, "/documents?filter=mine", ["/documents"]));
  })
  .post("/documents/delete/:id", koaBody(), async ctx => deleteAction(ctx, 'documents'))
  .post("/documents/opinions/:documentId/:category", koaBody(), async ctx => opinionAction(ctx, 'documents', 'documentId'))
  .post("/documents/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'documents', 'add'))
  .post("/documents/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'documents', 'remove'))
  .post("/documents/:documentId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'documents', 'documentId'))
  .post('/cv/upload', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    const photoUrl = await handleBlobUpload(ctx, 'image')
    const pdfUrl = await handleBlobUpload(ctx, 'cvPdf')
    await cvModel.createCV(ctx.request.body, photoUrl, pdfUrl)
    ctx.redirect('/cv')
  })
  .post('/cv/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    const photoUrl = await handleBlobUpload(ctx, 'image')
    const pdfUrl = await handleBlobUpload(ctx, 'cvPdf')
    await cvModel.updateCV(ctx.params.id, ctx.request.body, photoUrl, pdfUrl)
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
    if (String(password || '').length < 32) return failWith(ctx, 'cipherPasswordShort', '/cipher');
    const { encryptedText, iv } = cipherModel.encryptData(text, password);
    ctx.body = await cipherView(encryptedText, "", iv, password);
  })
  .post('/cipher/decrypt', koaBody(), async (ctx) => {
    const { encryptedText, password } = ctx.request.body;
    if (String(password || '').length < 32) return failWith(ctx, 'cipherPasswordShort', '/cipher');
    let decrypted;
    try { decrypted = cipherModel.decryptData(encryptedText, password); } catch (_) { return failWith(ctx, 'pmCrypterBadKey', '/cipher'); }
    ctx.body = await cipherView("", decrypted, "", password);
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
    if (updateFields.isAnonymous && !tribe.isAnonymous) await withdrawTribeExposures(ctx.params.id);
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
    try { await tribesModel.joinByInvite(ctx.request.body.inviteCode); }
    catch (e) { inviteCodeFail(ctx, e); return; }
    ctx.redirect('/tribes?filter=membership')
  })
  .post('/tribes/leave/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    await tribesModel.leaveTribe(ctx.params.id)
    ctx.redirect('/tribes?filter=membership')
  })
  .post('/tribes/open-invite/create', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribeId = ctx.request.body.tribeId;
    try { await tribesModel.generateOpenInvite(tribeId); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(`/tribe/${encodeURIComponent(tribeId)}`);
  })
  .post('/tribes/open-invite/remove', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribeId = ctx.request.body.tribeId;
    try { await tribesModel.removeOpenInvite(tribeId); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(`/tribe/${encodeURIComponent(tribeId)}`);
  })
  .post('/tribes/open-invite/join', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribeId = ctx.request.body.tribeId;
    try {
      const oi = await tribesModel.getOpenInvite(tribeId);
      if (oi && oi.code) await tribesModel.joinByInvite(oi.code);
    } catch (e) { if (!/already a member/i.test(String(e && e.message))) { actionFail(ctx, `/tribe/${encodeURIComponent(tribeId)}`); return; } }
    ctx.redirect(`/tribe/${encodeURIComponent(tribeId)}`);
  })
  .get('/tribes/open-invite/join/:id', async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribeId = ctx.params.id;
    confirmPage(ctx, { message: require('../views/main_views').i18n.confirmJoinText, action: '/tribes/open-invite/join', hidden: [{ name: 'tribeId', value: tribeId }], backHref: `/tribe/${encodeURIComponent(tribeId)}` });
  })
  .post('/tribe/:id/message', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    const uid = getViewerId();
    if (!tribe.members.includes(uid)) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    if (tooLong(ctx, ctx.request.body.message, MAX_TEXT_LENGTH, 'Text')) return;
    const message = stripDangerousTags((ctx.request.body.message || '').trim());
    if (!message || message.length === 0 || message.length > 280) { ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=feed`); return; }
    await tribeExposeCreated(ctx, tribe, await tribesContentModel.create(tribe.id, 'feed', { description: await resolveMentionText(message) }));
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
  .post('/tribe/:id/events/create', longTextBody, async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const b = ctx.request.body;
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title') || tooLong(ctx, b.description, LONG_TEXT_MAX, 'Description')) return;
    if (b.date && b.date < new Date().toISOString().split('T')[0]) { ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=events&action=create`); return; }
    await tribeExposeCreated(ctx, tribe, await tribesContentModel.create(tribe.id, 'event', { title: stripDangerousTags(b.title), description: await resolveMentionText(stripDangerousTags(b.description)), date: b.date, location: stripDangerousTags(b.location), attendees: [getViewerId()] }));
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=events`);
  })
  .post('/tribe/:id/events/attend/:eventId', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    await tribesContentModel.toggleAttendee(ctx.params.eventId);
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=events`);
  })
  .post('/tribe/:id/tasks/create', longTextBody, async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const b = ctx.request.body;
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title') || tooLong(ctx, b.description, LONG_TEXT_MAX, 'Description')) return;
    if (b.deadline && b.deadline < new Date().toISOString().split('T')[0]) { ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=tasks&action=create`); return; }
    await tribeExposeCreated(ctx, tribe, await tribesContentModel.create(tribe.id, 'task', { title: stripDangerousTags(b.title), description: await resolveMentionText(stripDangerousTags(b.description)), priority: b.priority, deadline: b.deadline, assignees: [] }));
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
    await tribeRefreshExposure(ctx.params.taskId);
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=tasks`);
  })
  .post('/tribe/:id/polls/create', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod') || !checkMod(ctx, 'pollsMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe || !tribe.members.includes(getViewerId())) { sendErrorPage(ctx, 'Forbidden', { status: 403 }); return; }
    const b = ctx.request.body || {};
    try {
      await pollsModel.createPoll({
        question: stripDangerousTags(b.question),
        options: stripDangerousTags(String(b.options || '')).split('\n'),
        anonymous: [].concat(b.anonymous).includes('1'),
        multiple: [].concat(b.multiple).includes('1'),
        tribeId: tribe.id
      });
    } catch (err) { sendErrorPage(ctx, err.message || String(err), { status: 400 }); return; }
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=polls`);
  })
  .post('/tribe/:id/votations/create', longTextBody, async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const b = ctx.request.body;
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title') || tooLong(ctx, b.description, LONG_TEXT_MAX, 'Description')) return;
    if (b.deadline && b.deadline < new Date().toISOString().split('T')[0]) { ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=votations&action=create`); return; }
    const options = [b.option1, b.option2, b.option3, b.option4].filter(Boolean).map(o => stripDangerousTags(o));
    await tribeExposeCreated(ctx, tribe, await tribesContentModel.create(tribe.id, 'votation', { title: stripDangerousTags(b.title), description: await resolveMentionText(stripDangerousTags(b.description)), deadline: b.deadline, options, votes: {} }));
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
    await tribeRefreshExposure(ctx.params.voteId);
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=votations`);
  })
  .post('/tribe/:id/forum/create', longTextBody, async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const b = ctx.request.body;
    const t = require('../views/main_views').i18n;
    const keepThread = (err) => keepText(ctx, err, {
      title: t.tribeForumTitle,
      action: ctx.path,
      hidden: [{ name: 'category', value: b.category || 'GENERAL' }, { name: 'reach', value: readTribeReach(b) }],
      fields: [
        { name: 'title', label: t.tribeForumTitle, value: b.title, maxlength: MAX_TITLE_LENGTH, required: true },
        { name: 'description', type: 'textarea', label: t.tribeForumText, value: b.description, maxlength: LONG_TEXT_MAX, required: true }
      ],
      backHref: `/tribe/${encodeURIComponent(ctx.params.id)}?section=forum`
    });
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title')) return;
    if (longText.tooLong(b.description)) { keepThread(new Error('Text too long')); return; }
    try {
      await tribeExposeCreated(ctx, tribe, await tribesContentModel.create(tribe.id, 'forum', { title: stripDangerousTags(b.title), description: await resolveMentionText(stripDangerousTags(b.description)), category: b.category }));
    } catch (err) { keepThread(err); return; }
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=forum`);
  })
  .post('/tribe/:id/forum/:forumId/reply', longTextBody, async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const b = ctx.request.body;
    const t = require('../views/main_views').i18n;
    const threadHref = `/tribe/${encodeURIComponent(ctx.params.id)}?section=forum&thread=${encodeURIComponent(ctx.params.forumId)}`;
    const keepTribeReply = (err) => keepText(ctx, err, {
      title: t.tribeForumReply,
      action: ctx.path,
      fields: [{ name: 'description', type: 'textarea', label: t.tribeForumReply, value: b.description, maxlength: LONG_TEXT_MAX, required: true }],
      backHref: threadHref
    });
    if (longText.tooLong(b.description)) { keepTribeReply(new Error('Text too long')); return; }
    try { await tribesContentModel.create(tribe.id, 'forum-reply', { description: await resolveMentionText(stripDangerousTags(b.description)), parentId: ctx.params.forumId }); }
    catch (err) { keepTribeReply(err); return; }
    await tribeRefreshExposure(ctx.params.forumId);
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
    if (tooLong(ctx, b.title, MAX_TITLE_LENGTH, 'Title') || tooLong(ctx, b.description, LONG_TEXT_MAX, 'Description')) return;
    const returnSection = b.returnSection || 'media';
    const mediaType = b.mediaType || 'image';
    let blobRef = null;
    if (mediaType === 'bookmark') {
      const url = stripDangerousTags(b.url || '');
      await tribeExposeCreated(ctx, tribe, await tribesContentModel.create(tribe.id, 'media', { title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), mediaType: 'bookmark', url }));
    } else {
      const blobMarkdownMedia = await handleBlobUpload(ctx, 'media');
      blobRef = blobMarkdownMedia ? ((blobMarkdownMedia.match(/\((&[^)]+)\)/) || [])[1] || blobMarkdownMedia) : null;
      await tribeExposeCreated(ctx, tribe, await tribesContentModel.create(tribe.id, 'media', { title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), mediaType, image: blobRef, license: formLicense(b) }));
    }
    ctx.redirect(`/tribe/${encodeURIComponent(ctx.params.id)}?section=${returnSection}`);
  })
  .post('/tribe/:id/content/delete/:contentId', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribeRedirect = `/tribe/${encodeURIComponent(ctx.params.id)}`;
    const item = await tribesContentModel.getById(ctx.params.contentId);
    const tribeRoot = await tribesModel.getRootId(ctx.params.id).catch(() => ctx.params.id);
    if (!item || item.author !== getViewerId() || item.rootId !== tribeRoot) { ctx.status = 403; ctx.redirect(tribeRedirect); return; }
    const levelBefore = await tribesContentModel.levelOf(item).catch(() => 'tribe');
    await tribesContentModel.deleteById(ctx.params.contentId);
    if (levelBefore !== 'tribe') await publishTribeExposure(item, 'tribe').catch(() => {});
    ctx.redirect(tribeRedirect);
  })
  .post('/tribe/:id/content/:contentId/reach', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribeRedirect = safeReturnTo(ctx, `/tribe/${encodeURIComponent(ctx.params.id)}`, ['/tribe/']);
    const tribe = await tribesModel.getTribeById(ctx.params.id).catch(() => null);
    if (!tribe || !(await tribesModel.isTribeMember(getViewerId(), tribe.id))) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const level = readTribeReach(ctx.request.body);
    if (!(await tribeReachAllowed(tribe.id)) && level !== 'tribe') { failWith(ctx, 'tribeReachPrivate', tribeRedirect); return; }
    const item = await tribesContentModel.getById(ctx.params.contentId).catch(() => null);
    const tribeRoot = await tribesModel.getRootId(tribe.id).catch(() => tribe.id);
    if (!item || item.rootId !== tribeRoot || item.contentType === 'forum-reply') { ctx.redirect(tribeRedirect); return; }
    try { await publishTribeExposure(item, level, level === 'tribe' ? [] : await tribeRepliesFor(item)); } catch (_) { actionFail(ctx, tribeRedirect); return; }
    ctx.redirect(tribeRedirect);
  })
  .post('/tribe/:id/content/:contentId/opinion/:category', koaBody(), async ctx => {
    if (!checkMod(ctx, 'tribesMod')) { ctx.redirect('/modules'); return; }
    const tribe = await tribesModel.getTribeById(ctx.params.id);
    if (!tribe.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    const back = safeReturnTo(ctx, `/tribe/${encodeURIComponent(ctx.params.id)}?section=opinions`, ['/tribe/']);
    const item = await tribesContentModel.getById(ctx.params.contentId);
    if (!item || item.tribeId !== ctx.params.id) { ctx.status = 404; ctx.redirect(back); return; }
    try {
      await tribesContentModel.castOpinion(ctx.params.contentId, ctx.params.category);
    } catch (_) {}
    ctx.redirect(back);
  })
  .post('/panic/remove', koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    try {
      await panicmodeModel.removeSSB();
      sendErrorPage(ctx, require('../views/main_views').i18n.panicRemoved);
      setTimeout(() => process.exit(0), 1000);
    } catch (error) { sendErrorPage(ctx, 'Error deleting your blockchain: ' + error.message); }
  })
  .post('/export/create', async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
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
    const media = await readGalleryUpload(ctx);
    const draftImages = mergeGallery(media.keep, media.uploaded, media.removeIndex);
    if (media.isMediaAction) {
      ctx.body = await taskView([], 'create', null, b.returnTo, { draft: { ...b, images: draftImages } });
      return;
    }
    if (rejectPastDates(ctx, [[b.startTime], [b.endTime]], '/tasks?filter=create')) return;
    await tasksModel.createTask(stripDangerousTags(b.title), stripDangerousTags(b.description), b.startTime, b.endTime, b.priority, stripDangerousTags(b.location), b.tags, b.isPublic, { images: draftImages, video: media.clip || '' });
    ctx.redirect(safeReturnTo(ctx, '/tasks?filter=mine', ['/tasks']));
  })
  .post('/tasks/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    const b = ctx.request.body, tags = Array.isArray(b.tags) ? b.tags.filter(Boolean) : (typeof b.tags === 'string' ? b.tags.split(',').map(t => t.trim()).filter(Boolean) : []);
    const media = await readGalleryUpload(ctx);
    let current = [];
    try { current = (await tasksModel.getTaskById(ctx.params.id)).images || []; } catch (_) { current = []; }
    await tasksModel.updateTaskById(ctx.params.id, { title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), startTime: b.startTime, endTime: b.endTime, priority: b.priority, location: stripDangerousTags(b.location), tags, isPublic: b.isPublic, ...galleryPatch(media, current) });
    if (media.isMediaAction) { ctx.redirect(`/tasks/edit/${encodeURIComponent(ctx.params.id)}`); return; }
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
  .post('/emergencies/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'emergenciesMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    let text = stripDangerousTags(String(b.text || ''));
    const blobMarkdown = await handleBlobUpload(ctx, 'blob');
    if (blobMarkdown) text += blobMarkdown;
    const res = await emergenciesModel.createEmergency({ title: stripDangerousTags(String(b.title || '')), text, category: b.category, mapUrl: stripDangerousTags(String(b.mapUrl || '')), tags: b.tags || '', expiresIn: b.expiresIn });
    await applyClearnetChoice(ctx, 'emergencies', res);
    try { sharedState.setFeaturedEmergency(await emergenciesModel.featured()); } catch (_) {}
    ctx.redirect(`/emergencies/${encodeURIComponent(res.key)}`);
  })
  .post('/emergencies/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'emergenciesMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    let text = stripDangerousTags(String(b.text || ''));
    const blobMarkdown = await handleBlobUpload(ctx, 'blob');
    if (blobMarkdown) text += blobMarkdown;
    try {
      const wasClosed = String(((await emergenciesModel.getEmergencyById(ctx.params.id).catch(() => null)) || {}).status || 'ACTIVE') !== 'ACTIVE';
      const res = await emergenciesModel.updateEmergency(ctx.params.id, { title: stripDangerousTags(String(b.title || '')), text, category: b.category, mapUrl: stripDangerousTags(String(b.mapUrl || '')), tags: b.tags || '', expiresIn: b.expiresIn });
      await applyClearnetChoice(wasClosed ? { request: { body: { clearnet: '0' } } } : ctx, 'emergencies', res.key);
      ctx.redirect(`/emergencies/${encodeURIComponent(res.rootId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/emergencies/confirm/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'emergenciesMod')) { ctx.redirect('/modules'); return; }
    try { await emergenciesModel.confirmEmergency(ctx.params.id); } catch (e) { if (!/already/i.test(String(e && e.message))) return actionFail(ctx); }
    try { sharedState.setFeaturedEmergency(await emergenciesModel.featured()); } catch (_) {}
    ctx.redirect(`/emergencies/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/emergencies/status/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'emergenciesMod')) { ctx.redirect('/modules'); return; }
    const status = String((ctx.request.body || {}).status || '').toUpperCase() === 'RESOLVED' ? 'RESOLVED' : 'ACTIVE';
    try {
      const res = await emergenciesModel.updateEmergency(ctx.params.id, { status });
      await applyClearnetChoice(ctx, 'emergencies', res.key, { recheck: true });
      if (status === 'RESOLVED') await notifyEmergencyWatchers(res.rootId, 'EMERGENCY_RESOLVED');
      try { sharedState.setFeaturedEmergency(await emergenciesModel.featured()); } catch (_) {}
      ctx.redirect(`/emergencies/${encodeURIComponent(res.rootId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/emergencies/resolve/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'emergenciesMod')) { ctx.redirect('/modules'); return; }
    try {
      const res = await emergenciesModel.resolveEmergency(ctx.params.id);
      await applyClearnetChoice(ctx, 'emergencies', res.key, { recheck: true });
      await notifyEmergencyWatchers(res.rootId, 'EMERGENCY_RESOLVED');
      try { sharedState.setFeaturedEmergency(await emergenciesModel.featured()); } catch (_) {}
      ctx.redirect(`/emergencies/${encodeURIComponent(res.rootId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/emergencies/updates/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'emergenciesMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    let text = stripDangerousTags(String(b.text || ''));
    const blobMarkdown = await handleBlobUpload(ctx, 'blob');
    if (blobMarkdown) text += blobMarkdown;
    try {
      await emergenciesModel.addUpdate(ctx.params.id, text);
      const rootId = await emergenciesModel.resolveRootId(ctx.params.id);
      await notifyEmergencyWatchers(rootId, 'EMERGENCY_UPDATED');
      ctx.redirect(`/emergencies/${encodeURIComponent(rootId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/emergencies/updates/:updateId/confirm', koaBody(), async ctx => {
    if (!checkMod(ctx, 'emergenciesMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try { await emergenciesModel.confirmUpdate(ctx.params.updateId); } catch (e) { if (!/already/i.test(String(e && e.message))) return actionFail(ctx); }
    ctx.redirect(`/emergencies/${encodeURIComponent(String(b.emergency || ''))}`);
  })
  .post('/emergencies/updates/:updateId/edit', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'emergenciesMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      let text = stripDangerousTags(String(b.text || ''));
      const blobMarkdown = await handleBlobUpload(ctx, 'blob');
      if (blobMarkdown) text += blobMarkdown;
      const res = await emergenciesModel.editUpdate(ctx.params.updateId, text);
      ctx.redirect(`/emergencies/${encodeURIComponent(res.emergencyId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/emergencies/updates/:updateId/delete', koaBody(), async ctx => {
    if (!checkMod(ctx, 'emergenciesMod')) { ctx.redirect('/modules'); return; }
    try { const res = await emergenciesModel.deleteUpdate(ctx.params.updateId); ctx.redirect(`/emergencies/${encodeURIComponent(res.emergencyId)}`); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/emergencies/delete/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'emergenciesMod')) { ctx.redirect('/modules'); return; }
    try { await emergenciesModel.deleteEmergency(ctx.params.id); } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); return; }
    try { sharedState.setFeaturedEmergency(await emergenciesModel.featured()); } catch (_) {}
    ctx.redirect('/emergencies');
  })
  .post('/emergencies/:emergencyId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'emergencies', 'emergencyId'))
  .post('/mailing/create', koaBody(), async ctx => {
    if (!checkMod(ctx, 'mailingMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      const res = await mailingModel.createList({ title: stripDangerousTags(String(b.title || '')), description: stripDangerousTags(String(b.description || '')), listType: b.listType, members: b.members || '', tags: b.tags || '' });
      ctx.redirect(`/mailing/${encodeURIComponent(res.key)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); }
  })
  .post('/mailing/update/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'mailingMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      const res = await mailingModel.updateList(ctx.params.id, { title: stripDangerousTags(String(b.title || '')), description: stripDangerousTags(String(b.description || '')), status: b.status, tags: b.tags || '', ...(b.members !== undefined ? { members: b.members } : {}) });
      ctx.redirect(`/mailing/${encodeURIComponent(res.rootId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .get('/mailing/:id/pdf', async ctx => sendContentPdf(ctx, 'mailing', ctx.params.id))
  .post('/mailing/:id/share', koaBody(), async ctx => sharePdfAsPm(ctx, 'mailing', ctx.params.id))
  .post('/mailing/status/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'mailingMod')) { ctx.redirect('/modules'); return; }
    try {
      const res = await mailingModel.setStatus(ctx.params.id, String((ctx.request.body || {}).status || ''));
      ctx.redirect(`/mailing/${encodeURIComponent(res.rootId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/mailing/delete/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'mailingMod')) { ctx.redirect('/modules'); return; }
    try { await mailingModel.deleteList(ctx.params.id); } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); return; }
    ctx.redirect('/mailing');
  })
  .post('/mailing/leave/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'mailingMod')) { ctx.redirect('/modules'); return; }
    try { await mailingModel.leaveList(ctx.params.id); } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); return; }
    ctx.redirect('/mailing');
  })
  .post('/mailing/:id/message', longTextBody, async ctx => {
    if (!checkMod(ctx, 'mailingMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      if (longText.tooLong(b.text)) throw new Error('Text too long');
      await mailingModel.sendMessage(ctx.params.id, { subject: stripDangerousTags(String(b.subject || '')), text: stripDangerousTags(String(b.text || '')), thread: String(b.thread || ''), replyTo: String(b.replyTo || '') });
    } catch (e) {
      const list = await mailingModel.getListById(ctx.params.id).catch(() => null);
      if (!list) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); return; }
      await warmAuthorNames([list, ...(list.history || [])]);
      ctx.status = 400;
      ctx.state.inlineError = publishErrorText(e);
      ctx.body = await singleMailingView(list, {
        censusList: await censusOf('mailing', () => mailingModel.listAll({ filter: 'all', q: '' })).catch(() => []),
        write: true,
        replyTo: String(b.replyTo || ''),
        returnTo: String(b.returnTo || ''),
        draft: { subject: stripDangerousTags(String(b.subject || '')), text: stripDangerousTags(String(b.text || '')), thread: String(b.thread || '') }
      });
      return;
    }
    await refreshInboxCount();
    const returnTo = String(b.returnTo || '');
    ctx.redirect(isLocalPath(returnTo) ? returnTo : `/mailing/${encodeURIComponent(ctx.params.id)}?history=THREADS`);
  })
  .post('/mailing/favorites/add/:id', koaBody(), async ctx => favAction(ctx, 'mailing', 'add'))
  .post('/mailing/favorites/remove/:id', koaBody(), async ctx => favAction(ctx, 'mailing', 'remove'))
  .post('/logistics/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'logisticsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      const blobMarkdown = await handleBlobUpload(ctx, 'blob');
      if (rejectPastDates(ctx, [[b.date]], '/logistics?filter=create')) return;
      const res = await logisticsModel.createRoute({ kind: b.kind, mode: b.mode, title: stripDangerousTags(String(b.title || '')), description: stripDangerousTags(String(b.description || '')) + (blobMarkdown || ''), origin: stripDangerousTags(String(b.origin || '')), destination: stripDangerousTags(String(b.destination || '')), mapUrl: stripDangerousTags(String(b.mapUrl || '')), date: b.date, recurrence: b.recurrence, seats: b.seats, size: stripDangerousTags(String(b.size || '')), weight: stripDangerousTags(String(b.weight || '')), priceType: b.priceType, price: b.price, orderRef: stripDangerousTags(String(b.orderRef || '')), tags: b.tags || '' });
      ctx.redirect(`/logistics/${encodeURIComponent(res.key)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); }
  })
  .post('/logistics/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'logisticsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      const blobMarkdown = await handleBlobUpload(ctx, 'blob');
      const res = await logisticsModel.updateRoute(ctx.params.id, { kind: b.kind, mode: b.mode, title: stripDangerousTags(String(b.title || '')), description: stripDangerousTags(String(b.description || '')) + (blobMarkdown || ''), origin: stripDangerousTags(String(b.origin || '')), destination: stripDangerousTags(String(b.destination || '')), mapUrl: stripDangerousTags(String(b.mapUrl || '')), date: b.date, recurrence: b.recurrence, seats: b.seats, size: stripDangerousTags(String(b.size || '')), weight: stripDangerousTags(String(b.weight || '')), priceType: b.priceType, price: b.price, orderRef: stripDangerousTags(String(b.orderRef || '')), tags: b.tags || '' });
      await notifyRouteBookers(res.rootId, 'LOGISTICS_UPDATED');
      ctx.redirect(`/logistics/${encodeURIComponent(res.rootId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/logistics/opinions/:id/:category', koaBody(), async ctx => opinionAction(ctx, 'logistics', 'id'))
  .get('/logistics/:id/pdf', async ctx => sendContentPdf(ctx, 'logistics', ctx.params.id))
  .post('/logistics/:id/share', koaBody(), async ctx => sharePdfAsPm(ctx, 'logistics', ctx.params.id))
  .post('/logistics/status/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'logisticsMod')) { ctx.redirect('/modules'); return; }
    const closed = String((ctx.request.body || {}).status || '').toUpperCase() === 'CLOSED';
    try { const res = await (closed ? logisticsModel.closeRoute(ctx.params.id) : logisticsModel.reopenRoute(ctx.params.id)); await notifyRouteBookers(res.rootId, closed ? 'LOGISTICS_CLOSED' : 'LOGISTICS_UPDATED'); ctx.redirect(`/logistics/${encodeURIComponent(res.rootId)}`); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/logistics/close/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'logisticsMod')) { ctx.redirect('/modules'); return; }
    try { const res = await logisticsModel.closeRoute(ctx.params.id); await notifyRouteBookers(res.rootId, 'LOGISTICS_CLOSED'); ctx.redirect(`/logistics/${encodeURIComponent(res.rootId)}`); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/logistics/reopen/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'logisticsMod')) { ctx.redirect('/modules'); return; }
    try { const res = await logisticsModel.reopenRoute(ctx.params.id); ctx.redirect(`/logistics/${encodeURIComponent(res.rootId)}`); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/logistics/delete/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'logisticsMod')) { ctx.redirect('/modules'); return; }
    try { await logisticsModel.deleteRoute(ctx.params.id); } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); return; }
    ctx.redirect('/logistics');
  })
  .post('/logistics/:id/book', koaBody(), async ctx => {
    if (!checkMod(ctx, 'logisticsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try { const booked = await logisticsModel.book(ctx.params.id, { seats: b.seats, notes: stripDangerousTags(String(b.notes || '')), orderRef: stripDangerousTags(String(b.orderRef || '')) });  await notifyBookingParty(booked, 'LOGISTICS_BOOKED'); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); return; }
    ctx.redirect(`/logistics/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/logistics/booking/:bookingId/status', koaBody(), async ctx => {
    if (!checkMod(ctx, 'logisticsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try { const changed = await logisticsModel.setBookingStatus(ctx.params.bookingId, String(b.status || ''), { receipt: stripDangerousTags(String(b.receipt || '')) }); await notifyBookingParty(changed, `LOGISTICS_${changed.status}`); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); return; }
    const route = String(b.route || '');
    ctx.redirect(route ? `/logistics/${encodeURIComponent(route)}` : '/logistics');
  })
  .post('/logistics/:id/rate', koaBody(), async ctx => {
    if (!checkMod(ctx, 'logisticsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try { await logisticsModel.rate(ctx.params.id, { score: b.score, text: stripDangerousTags(String(b.text || '')) }); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); return; }
    ctx.redirect(`/logistics/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/logistics/:routeId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'logistics', 'routeId'))
  .post('/logistics/favorites/add/:id', koaBody(), async ctx => favAction(ctx, 'logistics', 'add'))
  .post('/logistics/favorites/remove/:id', koaBody(), async ctx => favAction(ctx, 'logistics', 'remove'))
  .post('/podcasts/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'podcastsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      const cover = await handleBlobUpload(ctx, 'cover');
      const res = await podcastsModel.createChannel({ title: stripDangerousTags(String(b.title || '')), description: stripDangerousTags(String(b.description || '')), category: b.category, cover, tags: b.tags || '' });
      await applyClearnetChoice(ctx, 'podcasts', res);
      ctx.redirect(`/podcasts/${encodeURIComponent(res.key)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); }
  })
  .post('/podcasts/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'podcastsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      const cover = await handleBlobUpload(ctx, 'cover');
      const res = await podcastsModel.updateChannel(ctx.params.id, { title: stripDangerousTags(String(b.title || '')), description: stripDangerousTags(String(b.description || '')), category: b.category, cover, tags: b.tags || '' });
      await applyClearnetChoice(ctx, 'podcasts', res);
      ctx.redirect(`/podcasts/${encodeURIComponent(res.rootId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/podcasts/delete/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'podcastsMod')) { ctx.redirect('/modules'); return; }
    try { await podcastsModel.deleteChannel(ctx.params.id); } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); return; }
    ctx.redirect('/podcasts');
  })
  .post('/podcasts/:id/episodes', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'podcastsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      const media = await handleBlobUpload(ctx, 'media');
      const res = await podcastsModel.addEpisode(ctx.params.id, { title: stripDangerousTags(String(b.title || '')), description: stripDangerousTags(String(b.description || '')), media, number: b.number, tags: b.tags || '' });
      const ep = await podcastsModel.getEpisodeById(res.key).catch(() => null);
      await notifyPodcastWatchers(res.channelId, ep || { id: res.key, title: String(b.title || ''), number: b.number });
      ctx.redirect(`/podcasts/episode/${encodeURIComponent(res.key)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); }
  })
  .post('/podcasts/episode/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'podcastsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      const media = await handleBlobUpload(ctx, 'media');
      const res = await podcastsModel.updateEpisode(ctx.params.id, { title: stripDangerousTags(String(b.title || '')), description: stripDangerousTags(String(b.description || '')), media, number: b.number, tags: b.tags || '' });
      ctx.redirect(`/podcasts/episode/${encodeURIComponent(res.rootId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/podcasts/episode/delete/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'podcastsMod')) { ctx.redirect('/modules'); return; }
    try { const res = await podcastsModel.deleteEpisode(ctx.params.id); ctx.redirect(`/podcasts/${encodeURIComponent(res.channelId)}`); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/podcasts/episode/:id/play', koaBody(), async ctx => {
    if (!checkMod(ctx, 'podcastsMod')) { ctx.redirect('/modules'); return; }
    try { await podcastsModel.markPlayed(ctx.params.id); } catch (_) {}
    ctx.redirect(`/podcasts/episode/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/podcasts/opinions/:episodeId/:category', koaBody(), async ctx => opinionAction(ctx, 'podcasts', 'episodeId'))
  .post('/podcasts/episode/:episodeId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'podcasts', 'episodeId'))
  .post('/podcasts/:channelId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'podcasts', 'channelId'))
  .post('/podcasts/favorites/add/:id', koaBody(), async ctx => favAction(ctx, 'podcasts', 'add'))
  .post('/podcasts/favorites/remove/:id', koaBody(), async ctx => favAction(ctx, 'podcasts', 'remove'))
  .post('/campaigns/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      let text = stripDangerousTags(String(b.text || ''));
      const blobMarkdown = await handleBlobUpload(ctx, 'blob');
      if (blobMarkdown) text += blobMarkdown;
      if (rejectPastDates(ctx, [[b.deadline]], '/campaigns?filter=create')) return;
      const res = await campaignsModel.createCampaign({ title: stripDangerousTags(String(b.title || '')), text, category: b.category, goal: b.goal, deadline: b.deadline, tags: b.tags || '', mapUrl: stripDangerousTags(String(b.mapUrl || '')) });
      await applyClearnetChoice(ctx, 'campaigns', res);
      ctx.redirect(`/campaigns/${encodeURIComponent(res.key)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); }
  })
  .post('/campaigns/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      let text = stripDangerousTags(String(b.text || ''));
      const blobMarkdown = await handleBlobUpload(ctx, 'blob');
      if (blobMarkdown) text += blobMarkdown;
      const wasClosed = String(((await campaignsModel.getCampaignById(ctx.params.id).catch(() => null)) || {}).status || '') === 'CLOSED';
      const res = await campaignsModel.updateCampaign(ctx.params.id, { title: stripDangerousTags(String(b.title || '')), text, category: b.category, goal: b.goal, deadline: b.deadline, tags: b.tags || '', mapUrl: stripDangerousTags(String(b.mapUrl || '')) });
      await applyClearnetChoice(wasClosed ? { request: { body: { clearnet: '0' } } } : ctx, 'campaigns', res.key);
      ctx.redirect(`/campaigns/${encodeURIComponent(res.rootId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/campaigns/opinions/:id/:category', koaBody(), async ctx => opinionAction(ctx, 'campaigns', 'id'))
  .get('/campaigns/:id/pdf', async ctx => sendContentPdf(ctx, 'campaigns', ctx.params.id))
  .post('/campaigns/:id/share', koaBody(), async ctx => sharePdfAsPm(ctx, 'campaigns', ctx.params.id))
  .post('/campaigns/status/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    const closed = String((ctx.request.body || {}).status || '').toUpperCase() === 'CLOSED';
    try { const res = await campaignsModel.updateCampaign(ctx.params.id, { status: closed ? 'CLOSED' : 'OPEN' }); await applyClearnetChoice(ctx, 'campaigns', res.key, { recheck: true }); ctx.redirect(`/campaigns/${encodeURIComponent(res.rootId)}`); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/campaigns/updates/:updateId/edit', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      let text = stripDangerousTags(String(b.text || ''));
      const blobMarkdown = await handleBlobUpload(ctx, 'blob');
      if (blobMarkdown) text += blobMarkdown;
      const res = await campaignsModel.editUpdate(ctx.params.updateId, text);
      ctx.redirect(`/campaigns/${encodeURIComponent(res.campaignId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/campaigns/updates/:updateId/delete', koaBody(), async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    try { const res = await campaignsModel.deleteUpdate(ctx.params.updateId); ctx.redirect(`/campaigns/${encodeURIComponent(res.campaignId)}`); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/campaigns/close/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    try { const res = await campaignsModel.closeCampaign(ctx.params.id); await applyClearnetChoice(ctx, 'campaigns', res.key, { recheck: true }); ctx.redirect(`/campaigns/${encodeURIComponent(res.rootId)}`); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/campaigns/reopen/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    try { const res = await campaignsModel.reopenCampaign(ctx.params.id); ctx.redirect(`/campaigns/${encodeURIComponent(res.rootId)}`); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/campaigns/delete/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    try { await campaignsModel.deleteCampaign(ctx.params.id); } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); return; }
    ctx.redirect('/campaigns');
  })
  .post('/campaigns/sign/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    const before = await campaignsModel.getCampaignById(ctx.params.id).catch(() => null);
    try { await campaignsModel.sign(ctx.params.id, stripDangerousTags(String((ctx.request.body || {}).text || ''))); }
    catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); return; }
    try {
      const after = await campaignsModel.getCampaignById(ctx.params.id);
      if (before && after && !before.achieved && after.achieved) await notifyCampaignWatchers(after.id, 'CAMPAIGN_ACHIEVED');
    } catch (_) {}
    ctx.redirect(`/campaigns/${encodeURIComponent(ctx.params.id)}`);
  })
  .post('/campaigns/updates/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      let text = stripDangerousTags(String(b.text || ''));
      const blobMarkdown = await handleBlobUpload(ctx, 'blob');
      if (blobMarkdown) text += blobMarkdown;
      await campaignsModel.addUpdate(ctx.params.id, text);
      const rootId = await campaignsModel.resolveRootId(ctx.params.id);
      await notifyCampaignWatchers(rootId, 'CAMPAIGN_UPDATED');
      ctx.redirect(`/campaigns/${encodeURIComponent(rootId)}`);
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post('/campaigns/elevate/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'campaignsMod')) { ctx.redirect('/modules'); return; }
    if (!checkMod(ctx, 'parliamentMod')) { sendErrorPage(ctx, 'Parliament module is off', { status: 400 }); return; }
    try {
      const cp = await campaignsModel.getCampaignById(ctx.params.id);
      if (!cp) { ctx.redirect('/campaigns'); return; }
      if (!cp.canElevate) throw new Error('Only the promoter of an achieved campaign can raise it to Parliament');
      await parliamentModel.createProposal({ title: cp.title, description: String(cp.text || '').slice(0, 1000), campaignId: cp.id, signatures: cp.signatureCount, goal: cp.goal });
      await notifyCampaignWatchers(cp.id, 'CAMPAIGN_RAISED');
      ctx.redirect('/parliament?filter=proposals');
    } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 400 }); }
  })
  .post('/campaigns/:campaignId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'campaigns', 'campaignId'))
  .post('/campaigns/favorites/add/:id', koaBody(), async ctx => favAction(ctx, 'campaigns', 'add'))
  .post('/campaigns/favorites/remove/:id', koaBody(), async ctx => favAction(ctx, 'campaigns', 'remove'))
  .post('/emergencies/favorites/add/:id', koaBody(), async ctx => favAction(ctx, 'emergencies', 'add'))
  .post('/emergencies/favorites/remove/:id', koaBody(), async ctx => favAction(ctx, 'emergencies', 'remove'))
  .post('/reports/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    const b = ctx.request.body;
    const media = await readGalleryUpload(ctx);
    const draftImages = mergeGallery(media.keep, media.uploaded, media.removeIndex);
    if (media.isMediaAction) {
      ctx.body = await reportView([], 'create', null, b.category || '', { draft: { ...b, images: draftImages } });
      return;
    }
    const reportAttachment = await handleBlobUpload(ctx, 'blob');
    await reportsModel.createReport(stripDangerousTags(b.title), stripDangerousTags(b.description) + (reportAttachment || ''), b.category, null, b.tags, b.severity, {
      stepsToReproduce: stripDangerousTags(b.stepsToReproduce), expectedBehavior: stripDangerousTags(b.expectedBehavior), actualBehavior: stripDangerousTags(b.actualBehavior), environment: stripDangerousTags(b.environment), reproduceRate: b.reproduceRate,
      problemStatement: stripDangerousTags(b.problemStatement), userStory: stripDangerousTags(b.userStory), acceptanceCriteria: stripDangerousTags(b.acceptanceCriteria),
      whatHappened: stripDangerousTags(b.whatHappened), reportedUser: b.reportedUser, evidenceLinks: stripDangerousTags(b.evidenceLinks),
      contentLocation: stripDangerousTags(b.contentLocation), whyInappropriate: stripDangerousTags(b.whyInappropriate)
    }, { images: draftImages, video: media.clip || '' });
    ctx.redirect('/reports');
  })
  .post('/reports/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async ctx => {
    const b = ctx.request.body;
    const media = await readGalleryUpload(ctx);
    let current = [];
    try { current = (await reportsModel.getReportById(ctx.params.id)).images || []; } catch (_) { current = []; }
    await reportsModel.updateReportById(ctx.params.id, {
      title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), category: b.category, tags: b.tags, severity: b.severity,
      ...galleryPatch(media, current),
      template: {
        stepsToReproduce: stripDangerousTags(b.stepsToReproduce), expectedBehavior: stripDangerousTags(b.expectedBehavior), actualBehavior: stripDangerousTags(b.actualBehavior), environment: stripDangerousTags(b.environment), reproduceRate: b.reproduceRate,
        problemStatement: stripDangerousTags(b.problemStatement), userStory: stripDangerousTags(b.userStory), acceptanceCriteria: stripDangerousTags(b.acceptanceCriteria),
        whatHappened: stripDangerousTags(b.whatHappened), reportedUser: stripDangerousTags(b.reportedUser), evidenceLinks: stripDangerousTags(b.evidenceLinks),
        contentLocation: stripDangerousTags(b.contentLocation), whyInappropriate: stripDangerousTags(b.whyInappropriate)
      }
    });
    if (media.isMediaAction) { ctx.redirect(`/reports/edit/${encodeURIComponent(ctx.params.id)}`); return; }
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
    const media = await readGalleryUpload(ctx);
    const draftImages = mergeGallery(media.keep, media.uploaded, media.removeIndex);
    if (media.isMediaAction) {
      const viewerPrefsDraft = await about.visibilityPrefs(getViewerId()).catch(() => null);
      ctx.body = await eventView([], 'create', null, b.returnTo, { viewerPrefs: viewerPrefsDraft, draft: { ...b, images: draftImages } });
      return;
    }
    if (clearnetConflict(b)) return renderClearnetConflict(ctx, () => eventView([], 'create', null, b.returnTo, { draft: { ...clearnetDraft(b), images: draftImages } }));
    const { intervalWeekly, intervalMonthly, intervalYearly } = readInterval(b);
    const recurrence = {
      weekly: intervalWeekly,
      monthly: intervalMonthly,
      yearly: intervalYearly,
      until: b.intervalDeadline || b.recurrenceUntil || ''
    };
    const eventAttachment = await handleBlobUpload(ctx, 'blob');
    if (rejectPastDates(ctx, [[b.date]], '/events?filter=create')) return;
    const evResult = await eventsModel.createEvent(stripDangerousTags(b.title), stripDangerousTags(b.description) + (eventAttachment || ''), b.date, stripDangerousTags(b.location), b.price, b.url, b.attendees || [], b.tags, b.isPublic, stripDangerousTags(b.mapUrl), b.clearnetPublic, { images: draftImages, video: media.clip || '' }, recurrence);
    await applyClearnetChoice(ctx, 'events', evResult);
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
    const media = await readGalleryUpload(ctx);
    if (clearnetConflict(b) && !media.isMediaAction) return renderClearnetConflict(ctx, () => eventView([{ ...clearnetDraft(b, existing), id: existing.id, images: existing.images || [] }], 'edit', existing.id, b.returnTo));
    await eventsModel.updateEventById(ctx.params.id, { title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), date: b.date, location: stripDangerousTags(b.location), price: b.price, url: b.url, attendees: b.attendees, tags: b.tags, isPublic: b.isPublic, createdAt: existing.createdAt, organizer: existing.organizer, mapUrl: stripDangerousTags(b.mapUrl), clearnetPublic: b.clearnetPublic, ...readInterval(b), recurrenceUntil: b.intervalDeadline || b.recurrenceUntil || '', ...galleryPatch(media, existing.images || []) });
    await applyClearnetChoice(ctx, 'events', ctx.params.id);
    if (media.isMediaAction) { ctx.redirect(`/events/edit/${encodeURIComponent(ctx.params.id)}`); return; }
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
  .post('/events/generate-invite/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'eventsMod')) { ctx.redirect('/modules'); return; }
    try {
      const { code } = await eventsModel.generateInvite(ctx.params.id);
      ctx.body = renderEventInvitePage(code);
    } catch (_) {
      actionFail(ctx);
    }
  })
  .post('/events/open-invite/create/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'eventsMod')) { ctx.redirect('/modules'); return; }
    try { await eventsModel.generateOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(safeReturnTo(ctx, `/events/${encodeURIComponent(ctx.params.id)}`, ['/events']));
  })
  .post('/events/open-invite/remove/:id', koaBody(), async ctx => {
    if (!checkMod(ctx, 'eventsMod')) { ctx.redirect('/modules'); return; }
    try { await eventsModel.removeOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(safeReturnTo(ctx, `/events/${encodeURIComponent(ctx.params.id)}`, ['/events']));
  })
  .post('/events/join-code', koaBody(), async ctx => {
    if (!checkMod(ctx, 'eventsMod')) { ctx.redirect('/modules'); return; }
    const code = String((ctx.request.body || {}).code || '').trim();
    try {
      const { eventId } = await eventsModel.joinByInvite(code);
      ctx.redirect(safeReturnTo(ctx, `/events/${encodeURIComponent(eventId)}`, ['/events']));
    } catch (e) {
      inviteCodeFail(ctx, e);
    }
  })
  .post('/events/:eventId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'events', 'eventId'))
  .post('/votes/create', koaBody(), async ctx => {
    const b = ctx.request.body, defaultOptions = ['YES', 'NO', 'ABSTENTION', 'CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'];
    const parsedOptions = b.options ? b.options.split(',').map(o => o.trim()).filter(Boolean) : defaultOptions;
    try {
      if (rejectPastDates(ctx, [[b.deadline]], '/votes?filter=create')) return;
      await votesModel.createVote(stripDangerousTags(b.question), b.deadline, parsedOptions, String(b.tags || '').split(',').map(t => t.trim()).filter(Boolean));
    } catch (err) {
      voteFormError(ctx, 'create', null, err, b);
      return;
    }
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=mine', ['/votes']));
  })
  .post('/votes/update/:id', koaBody(), async ctx => {
    const b = ctx.request.body, parsedOptions = b.options ? b.options.split(',').map(o => o.trim()).filter(Boolean) : undefined;
    try {
      await votesModel.updateVoteById(ctx.params.id, { question: stripDangerousTags(b.question), deadline: b.deadline, options: parsedOptions, tags: b.tags ? b.tags.split(',').map(t => t.trim()).filter(Boolean) : [] });
    } catch (err) {
      voteFormError(ctx, 'edit', ctx.params.id, err, b);
      return;
    }
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=mine', ['/votes']));
  })
  .post('/votes/delete/:id', koaBody(), async ctx => {
    try { await votesModel.deleteVoteById(ctx.params.id); }
    catch (err) { failWith(ctx, err && err.code === 'VOTE_LOCKED' ? 'voteLocked' : 'actionFailed', '/votes?filter=mine'); return; }
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=mine', ['/votes']));
  })
  .post('/votes/vote/:id', koaBody(), async ctx => {
    await votesModel.voteOnVote(ctx.params.id, ctx.request.body.choice);
    ctx.redirect(safeReturnTo(ctx, '/votes?filter=open', ['/votes']));
  })
  .post('/votes/opinions/:voteId/:category', koaBody(), async ctx => {
    try { await votesModel.createOpinion(ctx.params.voteId, ctx.params.category); }
    catch (e) { if (!/already/i.test(String(e?.message || ''))) throw e; return failWith(ctx, 'opinionAlreadyGiven'); }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/votes', ['/votes']));
  })
  .post('/events/opinions/:eventId/:category', koaBody(), async ctx => {
    try { await eventsModel.createOpinion(ctx.params.eventId, ctx.params.category); }
    catch (e) { if (!/already/i.test(String(e?.message || ''))) throw e; return failWith(ctx, 'opinionAlreadyGiven'); }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/events', ['/events']));
  })
  .post('/tasks/opinions/:taskId/:category', koaBody(), async ctx => {
    try { await tasksModel.createOpinion(ctx.params.taskId, ctx.params.category); }
    catch (e) { if (!/already/i.test(String(e?.message || ''))) throw e; return failWith(ctx, 'opinionAlreadyGiven'); }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/tasks', ['/tasks']));
  })
  .post('/reports/opinions/:reportId/:category', koaBody(), async ctx => {
    try { await reportsModel.createOpinion(ctx.params.reportId, ctx.params.category); }
    catch (e) { if (!/already/i.test(String(e?.message || ''))) throw e; return failWith(ctx, 'opinionAlreadyGiven'); }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/reports', ['/reports']));
  })
  .post('/projects/opinions/:projectId/:category', koaBody(), async ctx => {
    try { await projectsModel.createOpinion(ctx.params.projectId, ctx.params.category); }
    catch (e) { if (!/already/i.test(String(e?.message || ''))) throw e; return failWith(ctx, 'opinionAlreadyGiven'); }
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
    if (!titleSuffix && !titlePreset) { return failWith(ctx, 'courtsErrTitle', '/courts?filter=cases'); }
    if (!respondent) { return failWith(ctx, 'courtsErrRespondent', '/courts?filter=cases'); }
    if (!/^@[A-Za-z0-9+/]+=*\.ed25519$/.test(respondent)) { return failWith(ctx, 'courtsErrRespondentId', '/courts?filter=cases'); }
    if (!new Set(['JUDGE','DICTATOR','POPULAR','MEDIATION','KARMATOCRACY']).has(method)) { return failWith(ctx, 'courtsErrMethod', '/courts?filter=cases'); }
    try { await courtsModel.openCase({ titleBase: [titlePreset, titleSuffix].filter(Boolean).join(' - '), respondentInput: respondent, method }); }
    catch (e) { return actionFail(ctx); }
    ctx.redirect('/courts?filter=mycases');
  })
  .post('/courts/cases/:id/evidence/add', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    const caseId = ctx.params.id, b = ctx.request.body || {};
    if (!caseId) { return failWith(ctx, 'courtsErrCaseNotFound', '/courts?filter=cases'); }
    try { await courtsModel.addEvidence({ caseId, text: stripDangerousTags(String(b.text || '')), link: String(b.link || ''), imageMarkdown: ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null }); }
    catch (e) { return actionFail(ctx); }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/answer', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, b = ctx.request.body || {}, answer = String(b.answer || ''), stance = String(b.stance || '').toUpperCase();
    if (!caseId) { return failWith(ctx, 'courtsErrCaseNotFound', '/courts?filter=cases'); }
    if (!answer) { return failWith(ctx, 'courtsErrBrief', `/courts/cases/${encodeURIComponent(caseId)}`); }
    if (!new Set(['DENY','ADMIT','PARTIAL']).has(stance)) { return failWith(ctx, 'courtsErrStance', `/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.answerCase({ caseId, stance, text: stripDangerousTags(answer) }); } catch (e) { return actionFail(ctx); }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/decide', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, b = ctx.request.body || {}, result = String(b.outcome || '').trim(), orders = String(b.orders || '');
    if (!caseId) { return failWith(ctx, 'courtsErrCaseNotFound', '/courts?filter=cases'); }
    if (!result) { return failWith(ctx, 'courtsErrResult', `/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.issueVerdict({ caseId, result, orders }); } catch (e) { return actionFail(ctx); }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/settlements/propose', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, terms = String(ctx.request.body?.terms || '');
    if (!caseId) { return failWith(ctx, 'courtsErrCaseNotFound', '/courts?filter=cases'); }
    if (!terms) { return failWith(ctx, 'courtsErrTerms', `/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.proposeSettlement({ caseId, terms }); } catch (e) { return actionFail(ctx); }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/settlements/accept', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    if (!caseId) { return failWith(ctx, 'courtsErrCaseNotFound', '/courts?filter=cases'); }
    try { await courtsModel.acceptSettlement({ caseId }); } catch (e) { return actionFail(ctx); }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/support', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    if (!caseId) { return failWith(ctx, 'courtsErrCaseNotFound', '/courts?filter=cases'); }
    try { await courtsModel.supportCase({ caseId }); } catch (e) { return actionFail(ctx); }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/mediators/accuser', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, mediators = String(ctx.request.body?.mediators || '').split(',').map(s => s.trim()).filter(Boolean);
    const uid = getViewerId();
    if (!caseId) { return failWith(ctx, 'courtsErrCaseNotFound', '/courts?filter=cases'); }
    if (!mediators.length) { return failWith(ctx, 'courtsErrMediator', `/courts/cases/${encodeURIComponent(caseId)}`); }
    if (uid && mediators.includes(uid)) { return failWith(ctx, 'courtsErrSelfMediator', `/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.setMediators({ caseId, side: 'accuser', mediators }); } catch (e) { return actionFail(ctx); }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/mediators/respondent', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, mediators = String(ctx.request.body?.mediators || '').split(',').map(s => s.trim()).filter(Boolean);
    const uid = getViewerId();
    if (!caseId) { return failWith(ctx, 'courtsErrCaseNotFound', '/courts?filter=cases'); }
    if (!mediators.length) { return failWith(ctx, 'courtsErrMediator', `/courts/cases/${encodeURIComponent(caseId)}`); }
    if (uid && mediators.includes(uid)) { return failWith(ctx, 'courtsErrSelfMediator', `/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.setMediators({ caseId, side: 'respondent', mediators }); } catch (e) { return actionFail(ctx); }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/judge', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, judgeId = String(ctx.request.body?.judgeId || '').trim(), uid = getViewerId();
    if (!caseId) { return failWith(ctx, 'courtsErrCaseNotFound', '/courts?filter=cases'); }
    if (!judgeId) { return failWith(ctx, 'courtsErrJudge', `/courts/cases/${encodeURIComponent(caseId)}`); }
    if (uid && judgeId === uid) { return failWith(ctx, 'courtsErrSelfJudge', `/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.assignJudge({ caseId, judgeId }); } catch (e) { return actionFail(ctx); }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/public', koaBody(), async (ctx) => {
    const caseId = ctx.params.id, pref = String(ctx.request.body?.preference || '').toUpperCase();
    if (!caseId) { return failWith(ctx, 'courtsErrCaseNotFound', '/courts?filter=cases'); }
    if (pref !== 'YES' && pref !== 'NO') { return failWith(ctx, 'courtsErrVisibility', `/courts/cases/${encodeURIComponent(caseId)}`); }
    try { await courtsModel.setPublicPreference({ caseId, preference: pref === 'YES' }); } catch (e) { return actionFail(ctx); }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/cases/:id/openVote', koaBody(), async (ctx) => {
    const caseId = ctx.params.id;
    if (!caseId) { return failWith(ctx, 'courtsErrCaseNotFound', '/courts?filter=cases'); }
    try { await courtsModel.openPopularVote({ caseId }); } catch (e) { return actionFail(ctx); }
    ctx.redirect(`/courts/cases/${encodeURIComponent(caseId)}`);
  })
  .post('/courts/judges/nominate', koaBody(), async (ctx) => {
    const judgeId = String(ctx.request.body?.judgeId || '').trim();
    if (!judgeId) { return failWith(ctx, 'courtsErrJudge', '/courts?filter=judges'); }
    try { await courtsModel.nominateJudge({ judgeId }); } catch (e) { return actionFail(ctx); }
    ctx.redirect('/courts?filter=judges');
  })
  .post('/courts/judges/:id/vote', koaBody(), async (ctx) => {
    if (!ctx.params.id) { return failWith(ctx, 'courtsErrNomination', '/courts?filter=judges'); }
    try { await courtsModel.voteNomination(ctx.params.id); } catch (e) { return actionFail(ctx); }
    ctx.redirect('/courts?filter=judges');
  })  
  .post("/market/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    if (clearnetConflict(ctx.request.body)) return renderClearnetConflict(ctx, () => marketView([], 'create', clearnetDraft(ctx.request.body), { q: '', minPrice: '', maxPrice: '', sort: 'recent', industry: String(ctx.request.body.industry || '') }));
    const b = ctx.request.body, image = await handleBlobUpload(ctx, "image"), parsedStock = parseInt(String(b.stock || "0"), 10);
    if (!parsedStock || parsedStock <= 0) ctx.throw(400, "Stock must be a positive number.");
    const pickLast = v => Array.isArray(v) ? v[v.length - 1] : v, shpVal = pickLast(b.includesShipping);
    if (rejectPastDates(ctx, [[b.deadline]], '/market?filter=create')) return;
    const clearnetCreated = await marketModel.createItem(b.item_type, stripDangerousTags(b.title), stripDangerousTags(b.description), image, b.price, b.tags, b.item_status, b.deadline, shpVal === "1" || shpVal === "on" || shpVal === true || shpVal === "true", parsedStock, stripDangerousTags(b.mapUrl), { industry: stripDangerousTags(b.industry || "") }, b.visibility);
    await applyClearnetChoice(ctx, 'market', clearnetCreated);
    ctx.redirect(safeReturnTo(ctx, "/market", ["/market"]));
  })
  .post("/market/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    if (clearnetConflict(ctx.request.body)) {
      const existing = await marketModel.getItemById(ctx.params.id).catch(() => null);
      if (!existing) { ctx.redirect('/market'); return; }
      const draft = clearnetDraft(ctx.request.body, existing);
      return renderClearnetConflict(ctx, () => marketView([draft], 'edit', draft, { q: '', minPrice: '', maxPrice: '', sort: 'recent' }));
    }
    const b = ctx.request.body, parsedStock = parseInt(String(b.stock || "0"), 10);
    if (parsedStock < 0) ctx.throw(400, "Stock cannot be negative.");
    const pickLast = v => Array.isArray(v) ? v[v.length - 1] : v, shpVal = pickLast(b.includesShipping);
    const updatedData = { item_type: b.item_type, title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), price: b.price, item_status: b.item_status, deadline: b.deadline, includesShipping: shpVal === "1" || shpVal === "on" || shpVal === true || shpVal === "true", tags: String(b.tags || "").split(",").map(t => t.trim()).filter(Boolean), stock: parsedStock, mapUrl: stripDangerousTags(b.mapUrl), visibility: b.visibility };
    const image = await handleBlobUpload(ctx, "image");
    if (image) updatedData.image = image;
    await marketModel.updateItemById(ctx.params.id, updatedData);
    await applyClearnetChoice(ctx, 'market', ctx.params.id);
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
    await applyClearnetChoice(ctx, 'market', ctx.params.id, { recheck: true });
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
    if (String(item.seller) === String(getViewerId())) ctx.throw(403, "You cannot buy your own item");
    if (item.item_type === "auction") ctx.throw(400, "Auction items are acquired via bids");
    if (String(item.status || "").toUpperCase() === "SOLD") ctx.throw(400, "Item already sold");
    if (Number(item.stock || 0) <= 0) ctx.throw(400, "Out of stock");
    try {
      await notifyBot("MARKET_SOLD", [item.seller], `${await actorLink(getViewerId())} has bought your item: [${item.title}](/market/${encodeURIComponent(ctx.params.id)}) for: ${item.price} ECO`);
    } catch (_) {}
    if (item.item_type === "exchange") await marketModel.setItemAsSold(ctx.params.id);
    else await marketModel.decrementStock(ctx.params.id);
    try { await contentFavorites.addFavorite('market', item.id || ctx.params.id); } catch (_) {}
    if (item.shopProductId && checkMod(ctx, 'shopsMod')) {
      try { await shopsModel.buyProduct(item.shopProductId); } catch (_) {}
    }
    await redirectToPayment(ctx, { sellerId: item.seller, amount: item.price, fallback: safeReturnTo(ctx, "/inbox?filter=sent", ["/inbox", "/market"]), concept: item.title, href: `/market/${encodeURIComponent(ctx.params.id)}` });
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
  .post("/market/opinions/:itemId/:category", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'marketMod')) { ctx.redirect('/modules'); return; }
    try { await marketModel.createOpinion(ctx.params.itemId, ctx.params.category) } catch (e) { return /already/i.test(String(e && e.message)) ? failWith(ctx, 'opinionAlreadyGiven') : actionFail(ctx); }
    ctx.redirect(safeReturnTo(ctx, `/market/${encodeURIComponent(ctx.params.itemId)}`, ['/market']))
  })
  .post("/market/:itemId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'market', 'itemId'))
  .post('/housing/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'housingMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body
    const media = await readGalleryUpload(ctx)
    const images = mergeGallery(media.keep, media.uploaded, media.removeIndex)
    const clip = media.clip
    if (media.isMediaAction) {
      ctx.body = await housingView([], 'CREATE', { maxImages: housingModel.MAX_IMAGES, draft: { ...b, images } })
      return
    }
    if (clearnetConflict(b)) return renderClearnetConflict(ctx, () => housingView([], 'CREATE', { maxImages: housingModel.MAX_IMAGES, draft: { ...clearnetDraft(b), images } }))
    let created = null
    try {
      if (rejectPastDates(ctx, [[b.availableFrom, { dayOnly: true }], [b.availableTo, { dayOnly: true }]], '/housing?filter=create')) return;
      created = await housingModel.createHousing({
        housing_type: stripDangerousTags(b.housing_type),
        property_type: stripDangerousTags(b.property_type),
        title: stripDangerousTags(b.title),
        description: stripDangerousTags(b.description),
        rules: stripDangerousTags(b.rules),
        place: stripDangerousTags(b.place),
        mapUrl: stripDangerousTags(b.mapUrl),
        price: b.price,
        rooms: b.rooms,
        size: b.size,
        capacity: b.capacity,
        availableFrom: b.availableFrom,
        availableTo: b.availableTo,
        images,
        video: clip || '',
        tags: b.tags,
        visibility: b.visibility
      })
    } catch (err) { sendErrorPage(ctx, err.message || String(err), { status: 400 }); return }
    await applyClearnetChoice(ctx, 'housing', created)
    ctx.redirect(safeReturnTo(ctx, '/housing?filter=MINE', ['/housing']))
  })
  .post('/housing/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'housingMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body
    if (clearnetConflict(b)) {
      let existing = null
      try { existing = await housingModel.getHousingById(ctx.params.id, getViewerId()) } catch (_) {}
      if (!existing) { ctx.redirect('/housing?filter=MINE'); return }
      return renderClearnetConflict(ctx, () => housingView([clearnetDraft(b, existing)], 'EDIT', { maxImages: housingModel.MAX_IMAGES }))
    }
    const uploaded = await handleBlobUploads(ctx, 'images')
    const newClip = ctx.request.files?.video ? await handleBlobUpload(ctx, 'video') : null
    const patch = {
      housing_type: stripDangerousTags(b.housing_type),
      property_type: stripDangerousTags(b.property_type),
      title: stripDangerousTags(b.title),
      description: stripDangerousTags(b.description),
      rules: stripDangerousTags(b.rules),
      place: stripDangerousTags(b.place),
      mapUrl: stripDangerousTags(b.mapUrl),
      price: b.price,
      rooms: b.rooms,
      size: b.size,
      capacity: b.capacity,
      availableFrom: b.availableFrom,
      availableTo: b.availableTo,
      tags: b.tags,
      visibility: b.visibility
    }
    const removeIndex = b.removePhoto !== undefined && b.removePhoto !== '' ? parseInt(b.removePhoto, 10) : -1
    if (uploaded.length || removeIndex >= 0) {
      let current = []
      try { current = (await housingModel.getHousingById(ctx.params.id, getViewerId())).images || [] } catch (_) { current = [] }
      if (removeIndex >= 0) current = current.filter((_, i) => i !== removeIndex)
      patch.images = [...current, ...uploaded]
    }
    if (newClip) patch.video = newClip
    else if (b.action === 'removeVideo') patch.video = ''
    let updated = null
    try { updated = await housingModel.updateHousing(ctx.params.id, patch) }
    catch (err) { sendErrorPage(ctx, err.message || String(err), { status: 400 }); return }
    await applyClearnetChoice(ctx, 'housing', updated || ctx.params.id)
    if (b.action === 'addPhoto' || b.action === 'addVideo' || b.action === 'removeVideo' || removeIndex >= 0) { ctx.redirect(`/housing/edit/${encodeURIComponent(ctx.params.id)}`); return }
    ctx.redirect(safeReturnTo(ctx, '/housing?filter=MINE', ['/housing']))
  })
  .post('/housing/delete/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'housingMod')) { ctx.redirect('/modules'); return; }
    let item = null
    try { item = await housingModel.getHousingById(ctx.params.id, getViewerId()) } catch (_) {}
    try { await housingModel.deleteHousing(ctx.params.id) } catch (_) { return actionFail(ctx); }
    await notifyHousingRequesters(item, 'deleted')
    ctx.redirect(safeReturnTo(ctx, '/housing?filter=MINE', ['/housing']))
  })
  .post('/housing/status/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'housingMod')) { ctx.redirect('/modules'); return; }
    const nextStatus = String(ctx.request.body.status || '').toUpperCase()
    let item = null
    try { item = await housingModel.getHousingById(ctx.params.id, getViewerId()) } catch (_) {}
    let updated = null
    try { updated = await housingModel.updateHousingStatus(ctx.params.id, nextStatus) } catch (_) { return actionFail(ctx); }
    await applyClearnetChoice(ctx, 'housing', updated || ctx.params.id, { recheck: true })
    if (nextStatus === 'CLOSED') await notifyHousingRequesters(item, 'closed')
    ctx.redirect(safeReturnTo(ctx, '/housing?filter=MINE', ['/housing']))
  })
  .post('/housing/visibility/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'housingMod')) { ctx.redirect('/modules'); return; }
    const next = String(ctx.request.body?.visibility || '').toUpperCase() === 'HIDDEN' ? 'HIDDEN' : 'PUBLIC'
    try { await housingModel.updateHousing(ctx.params.id, { visibility: next }) } catch (_) { return actionFail(ctx); }
    await applyClearnetChoice(ctx, 'housing', ctx.params.id, { recheck: true })
    ctx.redirect(safeReturnTo(ctx, `/housing/${encodeURIComponent(ctx.params.id)}`, ['/housing']))
  })
  .post('/housing/request/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'housingMod')) { ctx.redirect('/modules'); return; }
    let item = null
    try { item = await housingModel.getHousingById(ctx.params.id, getViewerId()) } catch (_) {}
    if (!item) { ctx.redirect(safeReturnTo(ctx, '/housing', ['/housing'])); return }
    try {
      const res = await housingModel.requestHousing(ctx.params.id)
      if (!res || !res.alreadyRequested) {
        try { await notifyBot('HOUSING_REQUESTED', [item.author], `A new habitant has requested your place [${item.title || 'a place'}](/housing/${encodeURIComponent(item.id)})`) } catch (_) {}
      }
    } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/housing', ['/housing']))
  })
  .post('/housing/cancel/:id', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'housingMod')) { ctx.redirect('/modules'); return; }
    let item = null
    try { item = await housingModel.getHousingById(ctx.params.id, getViewerId()) } catch (_) {}
    if (!item) { ctx.redirect(safeReturnTo(ctx, '/housing', ['/housing'])); return }
    try {
      const res = await housingModel.cancelRequest(ctx.params.id)
      if (!res || !res.notRequested) {
        try { await notifyBot('HOUSING_CANCELLED', [item.author], `A habitant has cancelled the request on your place [${item.title || 'a place'}](/housing/${encodeURIComponent(item.id)})`) } catch (_) {}
      }
    } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/housing', ['/housing']))
  })
  .post('/housing/opinions/:housingId/:category', koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'housingMod')) { ctx.redirect('/modules'); return; }
    try { await housingModel.createOpinion(ctx.params.housingId, ctx.params.category) } catch (e) { return /already/i.test(String(e && e.message)) ? failWith(ctx, 'opinionAlreadyGiven') : actionFail(ctx); }
    ctx.redirect(safeReturnTo(ctx, `/housing/${encodeURIComponent(ctx.params.housingId)}`, ['/housing']))
  })
  .post('/housing/:housingId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'housing', 'housingId'))
  .post('/jobs/create', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    if (clearnetConflict(ctx.request.body)) return renderClearnetConflict(ctx, () => jobsView([], 'CREATE', { draft: clearnetDraft(ctx.request.body) }));
    const b = ctx.request.body, imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    const clearnetCreated = await jobsModel.createJob({ job_type: stripDangerousTags(b.job_type), title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), requirements: stripDangerousTags(b.requirements), languages: stripDangerousTags(b.languages), job_time: b.job_time, tasks: stripDangerousTags(b.tasks), location: stripDangerousTags(b.location), vacants: b.vacants ? parseInt(b.vacants, 10) : 1, salary: b.salary != null && b.salary !== '' ? parseFloat(String(b.salary).replace(',', '.')) : 0, hoursOffered: b.hoursOffered != null && b.hoursOffered !== '' ? parseFloat(String(b.hoursOffered).replace(',', '.')) : 0, hoursRequested: b.hoursRequested != null && b.hoursRequested !== '' ? parseFloat(String(b.hoursRequested).replace(',', '.')) : 0, exchangeSkill: stripDangerousTags(b.exchangeSkill || ''), tags: b.tags, image: imageBlob, mapUrl: stripDangerousTags(b.mapUrl), industry: stripDangerousTags(b.industry || ''), visibility: b.visibility, clearnetPublic: b.clearnetPublic });
    await applyClearnetChoice(ctx, 'jobs', clearnetCreated);
    ctx.redirect(safeReturnTo(ctx, '/jobs?filter=MINE', ['/jobs']));
  })
  .post('/jobs/update/:id', koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'jobsMod')) { ctx.redirect('/modules'); return; }
    if (clearnetConflict(ctx.request.body)) {
      const existing = await jobsModel.getJobById(ctx.params.id, getViewerId()).catch(() => null);
      if (!existing) { ctx.redirect('/jobs'); return; }
      return renderClearnetConflict(ctx, () => jobsView([clearnetDraft(ctx.request.body, existing)], 'EDIT', {}));
    }
    const b = ctx.request.body, imageBlob = (ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : undefined) || undefined;
    const patch = { job_type: stripDangerousTags(b.job_type), title: stripDangerousTags(b.title), description: stripDangerousTags(b.description), requirements: stripDangerousTags(b.requirements), languages: stripDangerousTags(b.languages), job_time: b.job_time, tasks: stripDangerousTags(b.tasks), location: stripDangerousTags(b.location), tags: b.tags, mapUrl: stripDangerousTags(b.mapUrl), visibility: b.visibility, exchangeSkill: stripDangerousTags(b.exchangeSkill || ''), clearnetPublic: b.clearnetPublic };
    if (b.vacants !== undefined && b.vacants !== '') patch.vacants = parseInt(b.vacants, 10);
    if (b.salary !== undefined && b.salary !== '') patch.salary = parseFloat(String(b.salary).replace(',', '.'));
    if (b.hoursOffered !== undefined && b.hoursOffered !== '') patch.hoursOffered = parseFloat(String(b.hoursOffered).replace(',', '.'));
    if (b.hoursRequested !== undefined && b.hoursRequested !== '') patch.hoursRequested = parseFloat(String(b.hoursRequested).replace(',', '.'));
    if (imageBlob !== undefined) patch.image = imageBlob;
    await jobsModel.updateJob(ctx.params.id, patch);
    await applyClearnetChoice(ctx, 'jobs', ctx.params.id);
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
    await applyClearnetChoice(ctx, 'jobs', ctx.params.id, { recheck: true });
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
    try { await jobsModel.subscribeToJob(ctx.params.id, userId); } catch (_) { return actionFail(ctx); }
    try { await notifyBot('JOB_SUBSCRIBED', [job.author], `${await actorLink(getViewerId())} has subscribed to your job offer: [${job.title || 'a job'}](/jobs/${encodeURIComponent(job.id)})`); } catch (_) {}
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
    try { await jobsModel.unsubscribeFromJob(ctx.params.id, userId); } catch (_) { return actionFail(ctx); }
    try { await notifyBot('JOB_UNSUBSCRIBED', [job.author], `${await actorLink(getViewerId())} has unsubscribed from your job offer: [${job.title || 'a job'}](/jobs/${encodeURIComponent(job.id)})`); } catch (_) {}
    ctx.redirect(safeReturnTo(ctx, '/jobs', ['/jobs']));
  })
  .post('/jobs/:jobId/comments', koaBodyMiddleware, async ctx => commentAction(ctx, 'jobs', 'jobId'))
  .post("/shops/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    if (clearnetConflict(ctx.request.body)) return renderClearnetConflict(ctx, () => shopsView([], 'create', null, { draft: clearnetDraft(ctx.request.body), returnTo: String(ctx.request.body.returnTo || '') }));
    const b = ctx.request.body, imageBlob = ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : null;
    const clearnetCreated = await shopsModel.createShop(stripDangerousTags(b.title), stripDangerousTags(b.shortDescription), stripDangerousTags(b.description), imageBlob, stripDangerousTags(b.url), stripDangerousTags(b.location), b.tags, b.visibility, stripDangerousTags(b.mapUrl), b.clearnetPublic);
    await applyClearnetChoice(ctx, 'shops', clearnetCreated);
    ctx.redirect(safeReturnTo(ctx, '/shops?filter=mine', ['/shops']));
  })
  .post("/shops/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, imageBlob = (ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : undefined) || undefined;
    const patch = { title: stripDangerousTags(b.title), shortDescription: stripDangerousTags(b.shortDescription), description: stripDangerousTags(b.description), url: stripDangerousTags(b.url), location: stripDangerousTags(b.location), tags: b.tags, visibility: b.visibility, mapUrl: stripDangerousTags(b.mapUrl), clearnetPublic: b.clearnetPublic };
    if (imageBlob !== undefined) patch.image = imageBlob;
    await shopsModel.updateShopById(ctx.params.id, patch);
    await applyClearnetChoice(ctx, 'shops', ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/shops?filter=mine', ['/shops']));
  })
  .post("/shops/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    await shopsModel.deleteShopById(ctx.params.id);
    ctx.redirect(safeReturnTo(ctx, '/shops?filter=mine', ['/shops']));
  })
  .post("/shops/visibility/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    await shopsModel.setShopVisibility(ctx.params.id, ctx.request.body.visibility);
    await applyClearnetChoice(ctx, 'shops', ctx.params.id, { recheck: true });
    ctx.redirect(safeReturnTo(ctx, `/shops/${encodeURIComponent(ctx.params.id)}`, ['/shops']));
  })
  .post("/shops/generate-invite/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    try {
      const { code } = await shopsModel.generateInvite(ctx.params.id);
      ctx.body = renderShopInvitePage(code);
    } catch (_) {
      actionFail(ctx);
    }
  })
  .post("/shops/open-invite/create/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    try { await shopsModel.generateOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(safeReturnTo(ctx, `/shops/${encodeURIComponent(ctx.params.id)}`, ['/shops']));
  })
  .post("/shops/open-invite/remove/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    try { await shopsModel.removeOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(safeReturnTo(ctx, `/shops/${encodeURIComponent(ctx.params.id)}`, ['/shops']));
  })
  .get("/shops/open-invite/join/:id", async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    confirmPage(ctx, { message: require('../views/main_views').i18n.confirmJoinText, action: `/shops/open-invite/join/${encodeURIComponent(ctx.params.id)}`, backHref: `/shops/${encodeURIComponent(ctx.params.id)}` });
  })
  .post("/shops/open-invite/join/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    let dest = ctx.params.id;
    try {
      const oi = await shopsModel.getOpenInvite(ctx.params.id);
      if (oi && oi.code) { const r = await shopsModel.joinByCode(oi.code); if (r && r.shopId) dest = r.shopId; }
    } catch (e) { if (!/already a member/i.test(String(e && e.message))) { actionFail(ctx, `/shops/${encodeURIComponent(dest)}`); return; } }
    ctx.redirect(`/shops/${encodeURIComponent(dest)}`);
  })
  .post("/shops/join-code", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    const code = String((ctx.request.body || {}).code || '').trim();
    try {
      const { shopId } = await shopsModel.joinByCode(code);
      ctx.redirect(safeReturnTo(ctx, `/shops/${encodeURIComponent(shopId)}`, ['/shops']));
    } catch (e) {
      inviteCodeFail(ctx, e);
    }
  })
  .post("/shops/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'shops', 'add'))
  .post("/shopProducts/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'shopProducts', 'add'))
  .post("/shopProducts/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'shopProducts', 'remove'))
  .post("/shops/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'shops', 'remove'))
  .post("/shops/opinions/:shopId/:category", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    try { await shopsModel.createOpinion(ctx.params.shopId, ctx.params.category); }
    catch (e) { return /already/i.test(String(e && e.message)) ? failWith(ctx, 'opinionAlreadyGiven') : actionFail(ctx); }
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
    const b = ctx.request.body, imageBlob = (ctx.request.files?.image ? await handleBlobUpload(ctx, 'image') : undefined) || undefined;
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
    try {
      const pr = await shopsModel.getProductById(ctx.params.id).catch(() => null);
      if (pr && pr.author && String(pr.author) !== String(getViewerId())) {
        try {
          await notifyBot("SHOP_SOLD", [pr.author], `${await actorLink(getViewerId())} has bought your product: [${pr.title}](/shops/product/${encodeURIComponent(ctx.params.id)}) for: ${pr.price} ECO`);
        } catch (_) {}
      }
      await contentFavorites.addFavorite('shopProducts', (pr && pr.rootId) || ctx.params.id);
    } catch (_) {}
    if (checkMod(ctx, 'marketMod')) {
      try { const mi = await marketModel.getItemByShopProductId(ctx.params.id); if (mi) await marketModel.decrementStock(mi.id); } catch (_) {}
    }
    const boughtProduct = await shopsModel.getProductById(ctx.params.id).catch(() => null);
    await redirectToPayment(ctx, { sellerId: boughtProduct && boughtProduct.author, amount: boughtProduct && boughtProduct.price, fallback: safeReturnTo(ctx, `/shops/product/${encodeURIComponent(ctx.params.id)}`, ['/shops']), concept: boughtProduct && boughtProduct.title, href: `/shops/product/${encodeURIComponent(ctx.params.id)}` });
  })
  .post("/shops/product/opinions/:productId/:category", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'shopsMod')) { ctx.redirect('/modules'); return; }
    try { await shopsModel.createOpinion(ctx.params.productId, ctx.params.category); }
    catch (e) { return /already/i.test(String(e && e.message)) ? failWith(ctx, 'opinionAlreadyGiven') : actionFail(ctx); }
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
  .post("/chats/open-invite/create", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const chatId = ctx.request.body.chatId;
    try { await chatsModel.generateOpenInvite(chatId); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(`/chats/${encodeURIComponent(chatId)}`);
  })
  .post("/chats/open-invite/remove", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const chatId = ctx.request.body.chatId;
    try { await chatsModel.removeOpenInvite(chatId); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(`/chats/${encodeURIComponent(chatId)}`);
  })
  .post("/chats/join-code", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const code = String(ctx.request.body.code || '').trim();
    try {
      const chatKey = await chatsModel.joinByInvite(code);
      ctx.redirect(safeReturnTo(ctx, `/chats/${encodeURIComponent(chatKey)}`, ['/chats']));
    } catch (e) {
      inviteCodeFail(ctx, e);
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
  .post("/chats/:chatId/polls/create", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod') || !checkMod(ctx, 'pollsMod')) { ctx.redirect('/modules'); return; }
    const uid = getViewerId();
    const chat = await chatsModel.getChatById(ctx.params.chatId).catch(() => null);
    if (!chat) { ctx.redirect('/chats'); return; }
    const members = Array.isArray(chat.members) ? chat.members : [];
    const isOpen = String(chat.status || '').toUpperCase() === 'OPEN';
    if (String(chat.status || '').toUpperCase() === 'CLOSED') { ctx.redirect(`/chats/${encodeURIComponent(ctx.params.chatId)}`); return; }
    if (chat.tribeId) {
      try {
        const t = await tribesModel.getTribeById(chat.tribeId);
        if (!t.members.includes(uid)) { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
      } catch { sendErrorPage(ctx, "Forbidden", { status: 403 }); return; }
    } else if (!isOpen && chat.author !== uid && !members.includes(uid)) {
      sendErrorPage(ctx, "Forbidden", { status: 403 }); return;
    }
    const b = ctx.request.body || {};
    try {
      await pollsModel.createPoll({
        question: stripDangerousTags(b.question),
        options: stripDangerousTags(String(b.options || '')).split('\n'),
        anonymous: [].concat(b.anonymous).includes('1'),
        multiple: [].concat(b.multiple).includes('1'),
        chatId: chat.rootId || chat.key,
        tribeId: chat.tribeId || null
      });
    } catch (err) { sendErrorPage(ctx, err.message || String(err), { status: 400 }); return; }
    try { activityModel.invalidateCache(); } catch (_) {}
    ctx.redirect(`/chats/${encodeURIComponent(ctx.params.chatId)}`);
  })
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
    const uploadEntry = ctx.request.files?.image;
    const uploadFile = Array.isArray(uploadEntry) ? uploadEntry[0] : uploadEntry;
    let uploadMime = imageBlob && uploadFile ? String(uploadFile.mimetype || '') : null;
    if (uploadMime === 'application/octet-stream' && /\.torrent$/i.test(String(uploadFile?.originalFilename || ''))) uploadMime = 'application/x-bittorrent';
    const replyTo = String(ctx.request.body.replyTo || '').trim() || null;
    if (isBlankText(text) && !imageBlob) { ctx.redirect(`/chats/${encodeURIComponent(ctx.params.chatId)}`); return; }
    try {
      await chatsModel.sendMessage(ctx.params.chatId, text, imageBlob, replyTo, uploadMime);
    } catch (err) {
      if (err && err.code === 'CHAT_RATE_LIMIT') {
        const { i18n } = require('../views/main_views');
        sendErrorPage(ctx, i18n.chatRateLimitMessage, { title: i18n.chatRateLimitTitle, status: 429 });
        return;
      }
      throw err;
    }
    ctx.redirect(safeReturnTo(ctx, `/chats/${encodeURIComponent(ctx.params.chatId)}#chat-latest`, ['/chats']));
  })
  .post("/chats/:chatId/react", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const target = String(ctx.request.body.target || '').trim();
    const emoji = String(ctx.request.body.emoji || '').trim();
    if (!target || !emoji) { ctx.redirect(`/chats/${encodeURIComponent(ctx.params.chatId)}`); return; }
    try { await chatsModel.toggleReaction(ctx.params.chatId, target, emoji); } catch (_) { return actionFail(ctx); }
    const anchor = 'msg-' + target.replace(/[^a-zA-Z0-9]/g, '');
    ctx.redirect(`/chats/${encodeURIComponent(ctx.params.chatId)}#${anchor}`);
  })
  .post("/chats/:chatId/pin", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'chatsMod')) { ctx.redirect('/modules'); return; }
    const target = String(ctx.request.body.target || '').trim();
    if (!target) { ctx.redirect(`/chats/${encodeURIComponent(ctx.params.chatId)}`); return; }
    try { await chatsModel.togglePin(ctx.params.chatId, target); } catch (_) { return actionFail(ctx); }
    const anchor = 'msg-' + target.replace(/[^a-zA-Z0-9]/g, '');
    ctx.redirect(`/chats/${encodeURIComponent(ctx.params.chatId)}#${anchor}`);
  })
  .post("/wiki/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'wikiMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    const tribeId = b.tribeId || null;
    if (tribeId) {
      const t = await tribesModel.getTribeById(tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
      await tribesModel.ensureTribeKeyDistribution(tribeId).catch(() => {});
    }
    let body = stripDangerousTags(String(b.body || ""));
    const blobMarkdown = await handleBlobUpload(ctx, 'blob');
    if (blobMarkdown) body += blobMarkdown;
    try {
      const title = stripDangerousTags(String(b.title || ""));
      const res = await wikiModel.createPage({ title, body, tags: b.tags || "", editPolicy: String(b.status || b.editPolicy || "OPEN"), license: formLicense(b), tribeId });
      if (!res.existing && !tribeId) await applyClearnetChoice(ctx, 'wiki', res);
      if (res.existing) {
        const censusList = await wikiModel.listPages({ tribeId, filter: 'all' }).catch(() => []);
        const tribe = tribeId ? await tribesModel.getTribeById(tribeId).catch(() => null) : null;
        const draft = { title: title.slice(0, 100), body, tags: stripDangerousTags(String(b.tags || "")), status: String(b.status || "OPEN"), license: formLicense(b), summary: "", clearnet: String(b.clearnet || "") === "1" };
        ctx.status = 409;
        ctx.state.inlineError = require('../views/main_views').i18n.wikiDuplicateTitle;
        ctx.body = await wikiView([], 'create', { draft, tribe, tribeId, censusList, returnTo: String(b.returnTo || "") });
        return;
      }
      ctx.redirect(`/wiki/${encodeURIComponent(res.key)}${tribeId ? `?tribeId=${encodeURIComponent(tribeId)}` : ""}`);
    } catch (e) {
      if (isSsbTooLargeError(e)) { sendErrorPage(ctx, require('../views/main_views').i18n.publishTooLong || 'Your post is too long. Please shorten it.', { status: 400 }); return; }
      sendErrorPage(ctx, e.message || String(e), { status: 400 });
    }
  })
  .post("/wiki/preview", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'wikiMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    const tribeId = String(b.tribeId || "").trim() || null;
    let tribe = null;
    if (tribeId) {
      tribe = await tribesModel.getTribeById(tribeId).catch(() => null);
      if (!tribe || !tribe.members.includes(getViewerId())) { ctx.redirect('/tribes'); return; }
    }
    let body = stripDangerousTags(String(b.body || ""));
    const blobMarkdown = await handleBlobUpload(ctx, 'blob');
    if (blobMarkdown) body += blobMarkdown;
    const draft = { title: stripDangerousTags(String(b.title || "")).slice(0, 100), body, tags: stripDangerousTags(String(b.tags || "")), status: String(b.status || "OPEN"), license: formLicense(b), summary: stripDangerousTags(String(b.summary || "")), clearnet: String(b.clearnet || "") === "1" };
    const censusList = await wikiModel.listPages({ tribeId, filter: 'all' }).catch(() => []);
    const pageId = String(b.pageId || "").trim();
    const page = pageId ? await wikiModel.getPage(pageId, { tribeId }).catch(() => null) : null;
    ctx.body = await wikiView([], page ? 'edit' : 'create', { page, draft, tribe, tribeId, censusList, returnTo: String(b.returnTo || "") });
  })
  .post("/wiki/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'wikiMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    let body = stripDangerousTags(String(b.body || ""));
    const blobMarkdown = await handleBlobUpload(ctx, 'blob');
    if (blobMarkdown) body += blobMarkdown;
    try {
      const res = await wikiModel.updatePage(ctx.params.id, { title: stripDangerousTags(String(b.title || "")), body, tags: b.tags || "", editPolicy: b.status || b.editPolicy, license: formLicense(b, { keep: true }), summary: stripDangerousTags(String(b.summary || "")) });
      if (!b.tribeId) await applyClearnetChoice(ctx, 'wiki', res.rootId || res.key);
      if (String(res.author || '') !== String(getViewerId())) await subscribeOnFirstTouch(res.rootId, 'wiki');
      await notifyWikiWatchers(res.rootId, 'WIKI_EDITED', b.tribeId || null);
      ctx.redirect(`/wiki/${encodeURIComponent(res.rootId)}${b.tribeId ? `?tribeId=${encodeURIComponent(b.tribeId)}` : ""}`);
    } catch (e) {
      if (isSsbTooLargeError(e)) { sendErrorPage(ctx, require('../views/main_views').i18n.publishTooLong || 'Your post is too long. Please shorten it.', { status: 400 }); return; }
      sendErrorPage(ctx, e.message || String(e), { status: 403 });
    }
  })
  .post("/wiki/restore/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'wikiMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try {
      const res = await wikiModel.restoreVersion(ctx.params.id, String(b.version || ""));
      if (String(res.author || '') !== String(getViewerId())) await subscribeOnFirstTouch(res.rootId, 'wiki');
      await notifyWikiWatchers(res.rootId, 'WIKI_RESTORED', b.tribeId || null);
      ctx.redirect(`/wiki/${encodeURIComponent(res.rootId)}${b.tribeId ? `?tribeId=${encodeURIComponent(b.tribeId)}` : ""}`);
    } catch (e) {
      if (isSsbTooLargeError(e)) { sendErrorPage(ctx, require('../views/main_views').i18n.publishTooLong || 'Your post is too long. Please shorten it.', { status: 400 }); return; }
      sendErrorPage(ctx, e.message || String(e), { status: 403 });
    }
  })
  .post("/wiki/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'wikiMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    try { await wikiModel.deletePage(ctx.params.id); } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); return; }
    ctx.redirect(b.tribeId ? `/tribe/${encodeURIComponent(b.tribeId)}?section=wiki` : '/wiki');
  })
  .post("/wiki/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'wiki', 'add'))
  .post("/wiki/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'wiki', 'remove'))
  .post("/pads/create", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    const tribeId = b.tribeId || null;
    if (tribeId) {
      const t = await tribesModel.getTribeById(tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
      await tribesModel.ensureTribeKeyDistribution(tribeId).catch(() => {});
    }
    if (rejectPastDates(ctx, [[b.deadline]], '/pads?filter=create')) return;
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
    try { await padsModel.closePadById(ctx.params.id); } catch (_) { return actionFail(ctx); }
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
  .post("/pads/open-invite/create/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    try { await padsModel.generateOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(`/pads/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/pads/open-invite/remove/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    try { await padsModel.removeOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(`/pads/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/pads/join-code", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'padsMod')) { ctx.redirect('/modules'); return; }
    const code = String((ctx.request.body || {}).code || "").trim();
    try {
      const padId = await padsModel.joinByInvite(code);
      ctx.redirect(`/pads/${encodeURIComponent(padId)}`);
    } catch (e) {
      inviteCodeFail(ctx, e);
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
  .post("/rooms/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    const tribeId = b.tribeId || null;
    if (clearnetReachConflict('rooms', b)) return renderClearnetConflict(ctx, () => roomsView([], 'create', null, { tribeId: String(tribeId || ''), reach: String(b.status || ''), draft: clearnetDraft(b) }));
    if (tribeId) {
      const t = await tribesModel.getTribeById(tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
      await tribesModel.ensureTribeKeyDistribution(tribeId).catch(() => {});
    }
    const image = ctx.request.files?.image ? extractBlobId(await handleBlobUpload(ctx, 'image')) : '';
    const msg = await roomsModel.createRoom({ title: stripDangerousTags(String(b.title || '')), description: stripDangerousTags(String(b.description || '')), image: image || '', status: b.status, tags: b.tags || '', tribeId });
    const createdRoom = await roomsModel.getRoomById(msg.key).catch(() => null);
    await applyClearnetChoice(ctx, 'rooms', createdRoom || msg, { allowed: CLEARNET_REACH_OK.rooms(createdRoom) });
    ctx.redirect(tribeId ? `/tribe/${encodeURIComponent(tribeId)}?section=rooms` : `/rooms/${encodeURIComponent(msg.key)}`);
  })
  .post("/rooms/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    const room = await roomsModel.getRoomById(ctx.params.id).catch(() => null);
    if (!room || room.author !== getViewerId()) { ctx.redirect('/rooms'); return; }
    if (clearnetReachConflict('rooms', b) || (String(b.clearnet || '') === '1' && !CLEARNET_REACH_OK.rooms(room))) return renderClearnetConflict(ctx, () => roomsView([], 'edit', clearnetDraft(b, room), {}));
    const image = ctx.request.files?.image ? extractBlobId(await handleBlobUpload(ctx, 'image')) : null;
    const patch = { title: stripDangerousTags(String(b.title || '')), description: stripDangerousTags(String(b.description || '')), tags: b.tags || '' };
    if (image) patch.image = image;
    if (room.hub !== getViewerId() && !(await roomsModel.occupancy(room))) patch.refreshHub = true;
    try { await roomsModel.updateRoomById(room.rootId, patch); } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); return; }
    await applyClearnetChoice(ctx, 'rooms', room.rootId, { recheck: true, allowed: CLEARNET_REACH_OK.rooms(await roomsModel.getRoomById(room.rootId).catch(() => null)) });
    ctx.redirect(`/rooms/${encodeURIComponent(room.rootId)}`);
  })
  .post("/rooms/close/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    try { await roomsModel.closeRoomById(ctx.params.id); } catch (_) { return actionFail(ctx); }
    await applyClearnetChoice(ctx, 'rooms', ctx.params.id, { recheck: true, allowed: false });
    ctx.redirect(`/rooms/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/rooms/line/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    try { await roomsModel.setRoomLine(ctx.params.id, String((ctx.request.body || {}).line || '')); } catch (_) { return actionFail(ctx); }
    ctx.redirect(`/rooms/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/rooms/delete/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    const live = await roomsModel.liveState();
    if (live && live.ref === ctx.params.id) { await roomsModel.leave(); await syncRoomBanner(); }
    try { await roomsModel.deleteRoomById(ctx.params.id); } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); return; }
    ctx.redirect('/rooms');
  })
  .post("/rooms/generate-invite/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    try { ctx.body = renderRoomInvitePage(await roomsModel.generateInvite(ctx.params.id)); } catch (e) { sendErrorPage(ctx, e.message || String(e), { status: 403 }); }
  })
  .post("/rooms/open-invite/create/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    try { await roomsModel.generateOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(`/rooms/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/rooms/open-invite/remove/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    try { await roomsModel.removeOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(`/rooms/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/rooms/join-code", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    const code = String((ctx.request.body || {}).code || "").trim();
    try { ctx.redirect(`/rooms/${encodeURIComponent(await roomsModel.joinByInvite(code))}`); }
    catch (e) { inviteCodeFail(ctx, e); }
  })
  .post("/rooms/join/:id", koaBody(), async (ctx) => {
    if (config.public || !checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    const room = await roomsModel.getRoomById(ctx.params.id).catch(() => null);
    if (!room) { ctx.redirect('/rooms'); return; }
    const error = await enterRoom(room);
    await syncRoomBanner();
    if (error) { sendErrorPage(ctx, roomErrorMessage(error), { status: 400 }); return; }
    ctx.redirect(`/rooms/${encodeURIComponent(room.rootId)}`);
  })
  .post("/rooms/leave", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    await roomsModel.leave();
    await syncRoomBanner();
    if ((ctx.request.body || {}).returnTo) ctx.redirect(safeReturnTo(ctx, '/rooms', ['/rooms', '/tribe']));
    else safeRefererRedirect(ctx, '/rooms');
  })
  .post("/rooms/mute", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    await roomsModel.mute(String((ctx.request.body || {}).mute) === '1').catch(() => null);
    if ((ctx.request.body || {}).returnTo) ctx.redirect(safeReturnTo(ctx, '/rooms', ['/rooms', '/tribe']));
    else safeRefererRedirect(ctx, '/rooms');
  })
  .post("/rooms/hand", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    await roomsModel.hand(String((ctx.request.body || {}).hand) === '1').catch(() => null);
    if ((ctx.request.body || {}).returnTo) ctx.redirect(safeReturnTo(ctx, '/rooms', ['/rooms', '/tribe']));
    else safeRefererRedirect(ctx, '/rooms');
  })
  .post("/rooms/silence", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    await roomsModel.silence(String(b.id || ''), String(b.on) === '1').catch(() => null);
    if (b.returnTo) ctx.redirect(safeReturnTo(ctx, '/rooms', ['/rooms', '/tribe']));
    else safeRefererRedirect(ctx, '/rooms');
  })
  .post("/rooms/rec/start", koaBody(), async (ctx) => {
    if (config.public || !checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    await roomsModel.recStart().catch(() => null);
    safeRefererRedirect(ctx, '/rooms');
  })
  .post("/rooms/rec/stop", koaBody(), async (ctx) => {
    if (config.public || !checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    await roomsModel.recStop().catch(() => null);
    safeRefererRedirect(ctx, '/rooms');
  })
  .post("/rooms/notify", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    await roomsModel.notify(String((ctx.request.body || {}).on) === '1').catch(() => null);
    safeRefererRedirect(ctx, '/rooms');
  })
  .post("/rooms/notify/clear", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    await roomsModel.clearEvents().catch(() => null);
    safeRefererRedirect(ctx, '/rooms');
  })
  .get("/rooms/recordings/:name", async (ctx) => {
    if (config.public || !checkMod(ctx, 'roomsMod') || !isLoopbackRequest(ctx)) { ctx.status = 404; ctx.body = ''; return; }
    const file = roomRecordingFile(ctx.params.name);
    if (!file || !(await recordingBelongsToViewer(ctx.params.name))) { ctx.status = 404; ctx.body = ''; return; }
    ctx.type = 'audio/wav';
    ctx.set('Cache-Control', 'private, no-store');
    ctx.set('Content-Disposition', contentDisposition('attachment', ctx.params.name));
    ctx.body = fs.createReadStream(file);
  })
  .post("/rooms/recordings/:name/delete", koaBody(), async (ctx) => {
    if (config.public || !checkMod(ctx, 'roomsMod')) { ctx.redirect('/modules'); return; }
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const file = roomRecordingFile(ctx.params.name);
    if (file && (await recordingBelongsToViewer(ctx.params.name))) { try { fs.unlinkSync(file); } catch (_) {} }
    safeRefererRedirect(ctx, '/rooms');
  })
  .post("/rooms/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'rooms', 'add'))
  .post("/rooms/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'rooms', 'remove'))
  .post("/forum/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'forum', 'add'))
  .post("/forum/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'forum', 'remove'))
  .post("/events/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'events', 'add'))
  .post("/events/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'events', 'remove'))
  .post("/tasks/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'tasks', 'add'))
  .post("/tasks/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'tasks', 'remove'))
  .post("/reports/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'reports', 'add'))
  .post("/reports/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'reports', 'remove'))
  .post("/votes/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'votes', 'add'))
  .post("/votes/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'votes', 'remove'))
  .post("/jobs/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'jobs', 'add'))
  .post("/jobs/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'jobs', 'remove'))
  .post("/housing/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'housing', 'add'))
  .post("/housing/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'housing', 'remove'))
  .post("/projects/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'projects', 'add'))
  .post("/projects/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'projects', 'remove'))
  .post("/transfers/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'transfers', 'add'))
  .post("/transfers/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'transfers', 'remove'))
  .post("/transfers/:transferId/comments", koaBodyMiddleware, async ctx => commentAction(ctx, 'transfers', 'transferId'))
  .post("/market/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'market', 'add'))
  .post("/market/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'market', 'remove'))
  .post("/calendars/create", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {};
    const tribeId = b.tribeId || null;
    if (clearnetReachConflict('calendars', b)) return renderClearnetConflict(ctx, () => calendarsView([], 'create', null, { tribeId: String(tribeId || ''), reach: String(b.status || ''), draft: clearnetDraft(b) }));
    if (tribeId) {
      const t = await tribesModel.getTribeById(tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    const { intervalWeekly, intervalMonthly, intervalYearly } = readInterval(b);
    try {
      if (rejectPastDates(ctx, [[b.deadline], [b.firstDate], [b.intervalDeadline]], '/calendars?filter=create')) return;
      const msg = await calendarsModel.createCalendar({
        title: stripDangerousTags(b.title || ""),
        status: b.status || "OPEN",
        deadline: b.deadline || "",
        tags: b.tags || "",
        firstDate: b.firstDate || "",
        firstDateLabel: stripDangerousTags(b.firstDateLabel || ""),
        firstNote: stripDangerousTags(b.firstNote || ""),
        intervalWeekly, intervalMonthly, intervalYearly,
        intervalDeadline: b.intervalDeadline || "",
        mapUrl: stripDangerousTags(b.mapUrl || ""),
        tribeId
      });
      const createdCal = await calendarsModel.getCalendarById(msg.key).catch(() => null);
      await applyClearnetChoice(ctx, 'calendars', createdCal || msg, { allowed: CLEARNET_REACH_OK.calendars(createdCal) });
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
    if (target && target.author === getViewerId() && (clearnetReachConflict('calendars', b) || (String(b.clearnet || '') === '1' && !CLEARNET_REACH_OK.calendars({ ...target, status: 'OPEN', isClosed: false })))) {
      return renderClearnetConflict(ctx, () => calendarsView([], 'edit', clearnetDraft(b, target), { reach: String(b.status || '') }));
    }
    try {
      await calendarsModel.updateCalendarById(ctx.params.id, {
        title: stripDangerousTags(b.title || ""),
        status: b.status || "OPEN",
        deadline: b.deadline || "",
        tags: b.tags || "",
        mapUrl: stripDangerousTags(b.mapUrl || "")
      });
    } catch (_) {}
    if (target && target.author === getViewerId()) await applyClearnetChoice(ctx, 'calendars', target.rootId, { recheck: true, allowed: CLEARNET_REACH_OK.calendars(await calendarsModel.getCalendarById(target.rootId).catch(() => null)) });
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
    try { await calendarsModel.joinCalendar(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(`/calendars/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/calendars/generate-invite/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    try {
      const code = await calendarsModel.generateInvite(ctx.params.id);
      ctx.body = renderCalendarInvitePage(code);
    } catch (_) {
      actionFail(ctx);
    }
  })
  .post("/calendars/open-invite/create/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    try { await calendarsModel.generateOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    ctx.redirect(`/calendars/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/calendars/open-invite/remove/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    try { await calendarsModel.removeOpenInvite(ctx.params.id); } catch (_) { actionFail(ctx); return; }
    await applyClearnetChoice(ctx, 'calendars', ctx.params.id, { recheck: true, allowed: CLEARNET_REACH_OK.calendars(await calendarsModel.getCalendarById(ctx.params.id).catch(() => null)) });
    ctx.redirect(`/calendars/${encodeURIComponent(ctx.params.id)}`);
  })
  .post("/calendars/join-code", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const code = String((ctx.request.body || {}).code || "").trim();
    try {
      const calId = await calendarsModel.joinByInvite(code);
      ctx.redirect(`/calendars/${encodeURIComponent(calId)}`);
    } catch (e) {
      inviteCodeFail(ctx, e);
    }
  })
  .post("/calendars/leave/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'calendarsMod')) { ctx.redirect('/modules'); return; }
    const target = await calendarsModel.getCalendarById(ctx.params.id).catch(() => null);
    if (target && target.tribeId) {
      const t = await tribesModel.getTribeById(target.tribeId).catch(() => null);
      if (!t || !t.members.includes(getViewerId())) { ctx.status = 403; ctx.redirect('/tribes'); return; }
    }
    try { await calendarsModel.leaveCalendar(ctx.params.id); } catch (_) { return actionFail(ctx); }
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
    const { intervalWeekly, intervalMonthly, intervalYearly } = readInterval(b);
    try {
      if (rejectPastDates(ctx, [[b.date], [b.intervalDeadline]], '/calendars')) return;
      const dateMsgs = await calendarsModel.addDate(ctx.params.id, b.date || "", stripDangerousTags(b.label || ""), intervalWeekly, intervalMonthly, intervalYearly, b.intervalDeadline || "");
      const noteText = stripDangerousTags(String(b.text || "").trim());
      if (noteText && Array.isArray(dateMsgs)) {
        for (const msg of dateMsgs) {
          if (msg && msg.key) {
            try { await calendarsModel.addNote(ctx.params.id, msg.key, noteText); } catch (_) { return actionFail(ctx); }
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
      try { await calendarsModel.addNote(ctx.params.id, b.dateId || "", text); } catch (_) { return actionFail(ctx); }
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
    try { await calendarsModel.deleteNote(ctx.params.noteId); } catch (_) { return actionFail(ctx); }
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
    try { await calendarsModel.deleteDate(ctx.params.id, calendarId); } catch (_) { return actionFail(ctx); }
    ctx.redirect(calendarId ? `/calendars/${encodeURIComponent(calendarId)}` : '/calendars');
  })
  .post("/calendars/favorites/add/:id", koaBody(), async ctx => favAction(ctx, 'calendars', 'add'))
  .post("/calendars/favorites/remove/:id", koaBody(), async ctx => favAction(ctx, 'calendars', 'remove'))
  .post("/projects/create", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body || {}, image = ctx.request.files?.image ? await handleBlobUpload(ctx, "image") : null;
    const projectAttachment = await handleBlobUpload(ctx, 'blob');
    if (projectAttachment) b.description = String(b.description || '') + projectAttachment;
    const bounties = b.bountiesInput ? String(b.bountiesInput).split("\n").filter(Boolean).map(l => { const [t,a,d] = String(l).split("|"); return { title: String(t||"").trim(), amount: parseFloat(a||0)||0, description: String(d||"").trim(), milestoneIndex: null }; }) : [];
    if (rejectPastDates(ctx, [[b.deadline], [b.milestoneDueDate]], '/projects?filter=create')) return;
    const clearnetCreated = await projectsModel.createProject({ title: b.title, description: b.description, goal: b.goal != null && b.goal !== "" ? parseFloat(b.goal) : 0, deadline: b.deadline ? new Date(b.deadline).toISOString() : null, progress: b.progress != null && b.progress !== "" ? parseInt(b.progress,10) : 0, bounties, image, milestoneTitle: b.milestoneTitle, milestoneDescription: b.milestoneDescription, milestoneTargetPercent: b.milestoneTargetPercent, milestoneDueDate: b.milestoneDueDate, mapUrl: stripDangerousTags(b.mapUrl), clearnetPublic: b.clearnetPublic });
    await applyClearnetChoice(ctx, 'projects', clearnetCreated);
    ctx.redirect(safeReturnTo(ctx, "/projects?filter=MINE", ["/projects"]));
  })
  .post("/projects/update/:id", koaBody({ multipart: true, formidable: { maxFileSize: maxSize } }), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const id = await projectsModel.getProjectTipId(ctx.params.id), b = ctx.request.body || {};
    const image = (ctx.request.files?.image ? await handleBlobUpload(ctx, "image") : undefined) || undefined;
    const bounties = b.bountiesInput !== undefined ? String(b.bountiesInput).split("\n").filter(Boolean).map(l => { const [t,a,d] = String(l).split("|"); return { title: String(t||"").trim(), amount: parseFloat(a||0)||0, description: String(d||"").trim(), milestoneIndex: null }; }) : undefined;
    await projectsModel.updateProject(id, { title: b.title, description: b.description, goal: b.goal !== "" && b.goal != null ? parseFloat(b.goal) : undefined, deadline: b.deadline ? new Date(b.deadline).toISOString() : undefined, progress: b.progress !== "" && b.progress != null ? parseInt(b.progress,10) : undefined, bounties, image, mapUrl: stripDangerousTags(b.mapUrl), clearnetPublic: b.clearnetPublic });
    await applyClearnetChoice(ctx, 'projects', id);
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
    if (rejectPastDates(ctx, [[b.deadline]], '/transfers?filter=create')) return;
    const transfer = await transfersModel.createTransfer(project.author, "Project Pledge", pledgeAmount, moment().add(14, "days").toISOString(), ["backer-pledge", `project:${latestId}`]);
    await projectsModel.pledgeToProject(latestId, uid, pledgeAmount, { transferId: transfer.key || transfer.id, milestoneIndex, bountyIndex });
    await notifyBot("PROJECT_PLEDGE", [project.author], `${await actorLink(getViewerId())} has pledged ${pledgeAmount} ECO to your project: [${project.title || 'a project'}](/projects/${encodeURIComponent(latestId)})`);
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
    try { await projectsModel.confirmPledge(projectId, ctx.params.id); } catch (_) { return actionFail(ctx); }
    ctx.redirect(safeReturnTo(ctx, `/projects/${encodeURIComponent(projectId)}`, ["/projects", "/transfers"]));
  })
  .post("/projects/follow/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const latestId = await projectsModel.getProjectTipId(ctx.params.id), project = await projectsModel.getProjectById(latestId);
    await projectsModel.followProject(ctx.params.id, getViewerId());
    await notifyBot("PROJECT_FOLLOWED", [project.author], `${await actorLink(getViewerId())} has followed your project: [${project.title || 'a project'}](/projects/${encodeURIComponent(latestId)})`);
    ctx.redirect(safeReturnTo(ctx, "/projects", ["/projects"]));
  })
  .post("/projects/unfollow/:id", koaBody(), async (ctx) => {
    if (!checkMod(ctx, 'projectsMod')) { ctx.redirect('/modules'); return; }
    const latestId = await projectsModel.getProjectTipId(ctx.params.id), project = await projectsModel.getProjectById(latestId);
    await projectsModel.unfollowProject(ctx.params.id, getViewerId());
    await notifyBot("PROJECT_UNFOLLOWED", [project.author], `${await actorLink(getViewerId())} has unfollowed your project: [${project.title || 'a project'}](/projects/${encodeURIComponent(latestId)})`);
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
  .get("/wallet/donate/:feedId", async (ctx) => {
    const backTo = safeReturnTo(ctx, '/activity', ['/']);
    if (!checkMod(ctx, 'walletMod')) { ctx.redirect(backTo); return; }
    try {
      const feedId = decodeURIComponent(ctx.params.feedId || '');
      if (!ssbRef.isFeedId(feedId) || String(feedId) === String(getViewerId())) { ctx.redirect(backTo); return; }
      const { i18n: i18nD } = require('../views/main_views');
      const mine = await bankingModel.getUserAddress(getViewerId()).catch(() => null);
      if (!mine) { ctx.redirect('/wallet'); return; }
      const address = await bankingModel.getUserAddress(feedId).catch(() => null);
      if (!address || !ECO_ADDRESS_RE.test(String(address))) { ctx.redirect(`${backTo}${backTo.includes('?') ? '&' : '?'}error=${encodeURIComponent(i18nD.bankNoUserAddress)}`); return; }
      const q = new URLSearchParams({ to: address, payee: feedId, ref: backTo });
      ctx.redirect(`/wallet/send?${q.toString()}#wallet-send`);
    } catch (_) { ctx.redirect(backTo); }
  })
  .get("/banking/fund", async (ctx) => {
    if (!checkMod(ctx, 'walletMod')) { ctx.redirect('/banking?filter=overview'); return; }
    try {
      const wanted = String(ctx.query.pub || '').trim();
      const pubs = await bankingModel.listUbiPubs();
      const connectedId = String((await bankingModel.discoverUbiPub()).pubId || '');
      const pub = wanted ? pubs.find(p => String(p.pubId) === wanted) : (pubs.find(p => String(p.pubId) === connectedId) || null);
      const address = pub ? (pub.address || await bankingModel.getUserAddress(pub.pubId).catch(() => null)) : null;
      if (!address || !ECO_ADDRESS_RE.test(String(address))) { bankingResult(ctx, 'ubi', 'no_pub_address'); return; }
      const q = new URLSearchParams({ to: address, payee: pub.pubId, concept: 'OASIS UBI Fund', ref: '/banking?filter=ubi', tag: 'UBI' });
      ctx.redirect(`/wallet/send?${q.toString()}#wallet-send`);
    } catch (_) { ctx.redirect('/banking?filter=overview'); }
  })
  .post("/banking/claim-ubi", koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const userId = getViewerId();
    try {
      await bankingModel.claimUBI(userId);
      ctx.redirect("/banking?filter=overview&msg=claimed_pending");
    } catch (e) {
      bankingResult(ctx, 'overview', e.message || "error");
    }
  })
  .post("/banking/refuse-ubi", koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    try {
      await bankingModel.refuseUBI(getViewerId());
      ctx.redirect("/banking?filter=overview&msg=refused");
    } catch (e) {
      bankingResult(ctx, 'overview', e.message || "error");
    }
  })
  .post("/banking/claim/:id", koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    if (!bankingModel.isPubNode()) {
      try {
        await bankingModel.claimUBI(getViewerId());
        ctx.redirect("/banking?filter=overview&msg=claimed_pending");
      } catch (e) {
        bankingResult(ctx, 'overview', e.message || "error");
      }
      return;
    }
    const { i18n: _i18n } = require("../views/main_views");
    const userId = getViewerId(), allocation = await bankingModel.getAllocationById(ctx.params.id);
    if (!allocation) { sendErrorPage(ctx, _i18n.errorNoAllocation); return; }
    if (allocation.to !== userId || (allocation.status !== "UNCLAIMED" && allocation.status !== "UNCONFIRMED")) { sendErrorPage(ctx, _i18n.errorInvalidClaim); return; }
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
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    if (!bankingModel.isPubNode()) { sendErrorPage(ctx, require("../views/main_views").i18n.bankPubOnly, { status: 403 }); return; }
    const { epochId, rules } = ctx.request.body || {};
    ctx.body = await bankingModel.executeEpoch({ epochId, rules });
  })
  .post("/banking/addresses", koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const b = ctx.request.body || {};
    const viewerId = getViewerId();
    const submittedId = (b.userId || "").trim();
    const address = (b.address || "").trim();
    const label = (b.label || "").trim();
    const res = submittedId === viewerId && !label
      ? await bankingModel.addAddress({ userId: viewerId, address })
      : bankingModel.addAddressBookEntry({ label, address, userId: submittedId });
    bankingResult(ctx, 'addresses', res.status);
  })
  .post("/banking/addresses/delete", koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const b = ctx.request.body || {};
    const res = String(b.source || '') === 'book'
      ? bankingModel.removeAddressBookEntry(String(b.entryId || ''))
      : await bankingModel.removeAddress({ userId: getViewerId() });
    bankingResult(ctx, 'addresses', res.status);
  })
  .post("/favorites/remove/:kind/:id", koaBody(), async (ctx) => {
    await favoritesModel.removeFavorite(ctx.params.kind, ctx.params.id);
    const fallback = `/favorites?filter=${encodeURIComponent(ctx.query.filter || "all")}`;
    ctx.redirect(safeReturnTo(ctx, fallback, ["/favorites"]));
  })
  .post("/update", koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const exec = require("node:util").promisify(require("node:child_process").exec);
    const repoRoot = path.resolve(__dirname, '..', '..');
    const { stdout, stderr } = await exec("git reset --hard && git pull", { cwd: repoRoot });
    console.log("oasis@version: updating Oasis...", stdout, stderr);
    const { stdout: shOut, stderr: shErr } = await exec("sh install.sh", { cwd: repoRoot });
    console.log("oasis@version: running install.sh...", shOut, shErr);
    safeRefererRedirect(ctx, '/settings');
  })
  .post("/settings/workflow", koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const workflow = workflowsModel.getWorkflow(String(ctx.request.body.workflow || '').trim());
    if (!workflow) { ctx.redirect("/settings#workflows"); return; }
    const cfg = workflowsModel.applyWorkflow(getConfig(), workflow);
    if (cfg.modules.aiNavMod !== 'on' && cfg.ux) cfg.ux.current = 'blocks';
    saveConfig(cfg);
    ctx.cookies.set("theme", cfg.themes.current, { httpOnly: true, sameSite: 'strict', secure: ctx.secure });
    ctx.redirect("/settings#workflows");
  })
  .post("/settings/theme", koaBody(), async (ctx) => {
    const theme = String(ctx.request.body.theme || "").trim(), cfg = getConfig();
    cfg.themes.current = theme || "Dark-SNH";
    saveConfig(cfg);
    ctx.cookies.set("theme", cfg.themes.current, { httpOnly: true, sameSite: 'strict', secure: ctx.secure });
    ctx.redirect("/settings#theme");
  })
  .post("/language", koaBody(), async (ctx) => {
    const lang = String(ctx.request.body.language || "en");
    if (!supportedLanguages().includes(lang)) return safeRefererRedirect(ctx, '/settings');
    const cfg = getConfig();
    cfg.language = lang;
    saveConfig(cfg);
    ctx.cookies.set("language", lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'strict', secure: ctx.secure });
    try { onboardingModel.markStep('language'); } catch (_) {}
    safeRefererRedirect(ctx, '/settings');
  })
  .post("/peers/pause", koaBody(), async ctx => { await setNetworkPaused(true); ctx.redirect("/peers"); })
  .post("/peers/resume", koaBody(), async ctx => { await setNetworkPaused(false); ctx.redirect("/peers"); })
  .post("/settings/invite/accept", koaBody(), async ctx => {
    const invite = String(ctx.request.body.invite || '');
    const pubKey = (invite.match(/@[A-Za-z0-9+/=_-]{43,}\.ed25519/) || [])[0] || null;
    if (pubKey) {
      try {
        const fsx = require('fs'), px = require('path');
        const gossip = JSON.parse(fsx.readFileSync(px.join(ssbConfig.path, 'gossip.json'), 'utf8') || '[]');
        let unfollowed = [];
        try { unfollowed = JSON.parse(fsx.readFileSync(stateFilePath('gossip_unfollowed.json'), 'utf8') || '[]'); } catch (_) {}
        const activePub = Array.isArray(gossip) && gossip.some(p => p && p.key === pubKey) && !unfollowed.some(u => u && u.key === pubKey);
        if (activePub) { sendErrorPage(ctx, require('../views/main_views').i18n.invitesAlreadyFederated, { status: 400, to: '/invites' }); return; }
      } catch (_) {}
    }
    if (/\.onion\b/i.test(invite) && !(await torUsable())) return failWith(ctx, 'peersTorMissing', '/invites');
    let joined = false;
    try { await meta.acceptInvite(invite); joined = true; } catch (_) {}
    if (!joined) return failWith(ctx, 'inviteCodeInvalid');
    rememberJoinedPub(invite);
    bootstrapFromPub(invite);
    safeRefererRedirect(ctx, "/invites");
  })
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
    const removed = idx >= 0 ? pubs.splice(idx, 1)[0] : null;
    if (removed) writeJSON(gossipPath, pubs);
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
    if (!ssbRef.isFeed(kcanon)) return ctx.redirect("/invites");
    const ssb = await cooler.open(), unf = readJSON(unfollowedPath);
    const rec = unf.find(x => x && canonicalKey(x.key) === kcanon) || { host: String(host).trim().toLowerCase(), port: Number(port) || 8008, key: kcanon };
    if (!validPeerHost(String(rec.host || '')) || !validPeerPort(Number(rec.port) || 8008)) { failWith(ctx, 'peerHostValidation', '/invites'); return; }
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
    if (!key || !host) { failWith(ctx, !host ? 'peerHostValidation' : 'peerKeyValidation', '/peers'); return; }
    const hostStr = String(host).trim().toLowerCase();
    if (!validPeerHost(hostStr)) { failWith(ctx, 'peerHostValidation', '/peers'); return; }
    const prt = Number(port) || 8008;
    if (!validPeerPort(prt)) { failWith(ctx, 'peerPortValidation', '/peers'); return; }
    const keyStr = String(key).trim();
    if (!/^@[A-Za-z0-9+/_\-]{43}=\.ed25519$/.test(keyStr)) { failWith(ctx, 'peerKeyValidation', '/peers'); return; }
    const kcanon = canonicalKey(keyStr);
    if (!ssbRef.isFeed(kcanon)) { failWith(ctx, 'peerKeyValidation', '/peers'); return; }
    const viaTor = /\.onion$/.test(hostStr);
    if (viaTor && !(await torUsable())) { failWith(ctx, 'peersTorMissing', '/peers'); return; }
    const pubs = readJSON(gossipPath);
    if (!pubs.find(x => x && canonicalKey(x.key) === kcanon)) {
      pubs.push({ host: hostStr, port: prt, key: kcanon });
      writeJSON(gossipPath, pubs);
    }
    const ssb = await cooler.open();
    const addr = msAddrFrom(hostStr, prt, kcanon);
    try { ssb.conn.remember(addr, { type: "peer", autoconnect: true, key: kcanon }); } catch (e) { console.error('[peers/connect] remember failed:', e.message || e); }
    let connectError = null;
    try { await new Promise((res, rej) => ssb.conn.connect(addr, { type: "peer" }, (err) => err ? rej(err) : res())); } catch (e) { connectError = e || new Error('connect failed'); }
    try { await new Promise((res, rej) => ssb.publish({ type: "contact", contact: kcanon, following: true }, e => e ? rej(e) : res())); } catch (_) {}
    const unf = readJSON(unfollowedPath);
    writeJSON(unfollowedPath, unf.filter(x => !(x && canonicalKey(x.key) === kcanon)));
    if (connectError) {
      const t = require('../views/main_views').i18n;
      let reason = peerHealth.classifyNetError(connectError, addr);
      if (reason === 'tor' && viaTor) reason = 'timeout';
      sendErrorPage(ctx, String(t.peersConnectFailed || '').replace('{reason}', t[peerHealth.NET_REASON_KEYS[reason]] || t.peerErrOther), { status: 400, exact: true, to: '/peers' });
      return;
    }
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
      const netAddr = new Map();
      try {
        for (const [addr, data] of ((await ssb.conn.dbPeers()) || [])) {
          const k = data && peerHealth.canonicalKey(data.key);
          if (k && /^net:/.test(String(addr)) && !netAddr.has(k)) netAddr.set(k, addr);
        }
      } catch (_) {}
      if (Array.isArray(pubs)) {
        for (const p of pubs) {
          if (!p || !p.key || !p.host) continue;
          let addr;
          try { addr = /\.onion$/i.test(String(p.host)) && netAddr.get(peerHealth.canonicalKey(p.key)) || msAddrFrom(p.host, p.port, p.key); } catch (_) { continue; }
          try { ssb.conn.connect(addr, { type: "pub" }, () => {}); } catch (_) {}
        }
      }
    } catch (_) {}
    ctx.redirect("/invites");
  })
  .post("/invites/clear-unreachable", koaBody(), async (ctx) => {
    try {
      const dead = await deadPeerKeys();
      const pubKeys = new Set(readJSON(gossipPath).map(p => p && peerHealth.canonicalKey(p.key)).filter(Boolean));
      await forgetPeers([...dead].filter(k => pubKeys.has(k)));
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
          if (!p || !p.key || !p.host || isPrivateHost(p.host)) continue;
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
      const msMatch = trimmed.match(/^(?:net|onion):([^:]+):(\d+)~shs:([A-Za-z0-9+/_\-]{43}=?)(?:\.ed25519)?$/);
      if (msMatch) {
        const host = msMatch[1];
        const port = Number(msMatch[2]);
        const keyCore = msMatch[3].endsWith('=') ? msMatch[3] : (msMatch[3] + '=');
        const kcanon = canonicalKey('@' + keyCore + '.ed25519');
        if (!ssbRef.isFeed(kcanon) || !validPeerHost(String(host).toLowerCase()) || !validPeerPort(port)) continue;
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
        try { await meta.acceptInvite(trimmed); rememberJoinedPub(trimmed); bootstrapFromPub(trimmed); } catch (_) {}
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
    try { await forgetPeers(await deadPeerKeys()); } catch (_) {}
    const returnTo = String((ctx.query && ctx.query.returnTo) || (ctx.request.body && ctx.request.body.returnTo) || '');
    ctx.redirect(['/peers', '/graphos'].includes(returnTo) ? returnTo : '/peers');
  })
  .get("/peers/export", async (ctx) => {
    const lines = [];
    lines.push('# Oasis peers — multiserver addresses, one per line');
    lines.push('# Generated ' + new Date().toISOString());
    const seen = new Set();
    const writePeer = (host, port, key) => {
      if (!host || !key || isPrivateHost(host)) return;
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
            const m = String(addr).match(/^(?:net|onion):([^:]+):(\d+)/);
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
              const m = String(addr).match(/^(?:net|onion):([^:]+):(\d+)/);
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
      const m = trimmed.match(/^(?:net|onion):([^:]+):(\d+)~shs:([A-Za-z0-9+/_\-]{43}=?)(?:\.ed25519)?$/);
      if (!m) continue;
      const host = m[1];
      const port = Number(m[2]);
      const keyCore = m[3].endsWith('=') ? m[3] : (m[3] + '=');
      const kcanon = canonicalKey('@' + keyCore + '.ed25519');
      if (!ssbRef.isFeed(kcanon) || !validPeerHost(String(host).toLowerCase()) || !validPeerPort(port)) continue;
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
      const cfg = getConfig();
      cfg.ssbLogStream = { ...(cfg.ssbLogStream || {}), limit: logLimit };
      saveConfig(cfg);
    }
    ctx.redirect("/settings#logstream");
  })
  .post("/settings/blob-cache", koaBody(), async (ctx) => {
    const maxMB = parseInt(ctx.request.body.blob_cache_mb, 10);
    if ([0, 512, 1024, 2048, 5120, 10240].includes(maxMB)) {
      const cfg = getConfig();
      cfg.blobCache = { ...(cfg.blobCache || {}), maxMB };
      saveConfig(cfg);
    }
    ctx.redirect("/settings#blobcache");
  })
  .post("/settings/blob-cache/collect", koaBody(), async (ctx) => {
    let res = null;
    try { res = await blobCacheModel.collect({ maxBytes: blobCacheModel.maxBytesFor(getConfig()) }); } catch (_) { res = null; }
    ctx.redirect(`/settings?cleaned=${res ? res.deleted : 0}&freed=${res ? res.freed : 0}#blobcache`);
  })
  .post("/settings/replication", koaBody(), async (ctx) => {
    const hops = parseInt(ctx.request.body.hops, 10);
    if (Number.isFinite(hops) && hops >= 0 && hops <= 6) {
      try { require('../configs/config-manager').saveServerConfig({ friends: { hops } }); } catch (_) {}
    }
    ctx.redirect("/settings#replication");
  })
  .post("/settings/home-page", koaBody(), async (ctx) => {
    const cfg = getConfig();
    const wanted = String(ctx.request.body.homePage || "").trim();
    cfg.homePage = /^[a-z0-9-]+$/i.test(wanted) ? wanted : "activity";
    saveConfig(cfg);
    ctx.redirect("/settings#home-page");
  })
  .post("/settings/ux", koaBody(), async (ctx) => {
    const cfg = getConfig();
    const v = String(ctx.request.body.ux || "").trim().toLowerCase();
    const aiNavEnabled = cfg.modules && cfg.modules.aiNavMod === 'on';
    const chatsEnabled = cfg.modules && cfg.modules.chatsMod === 'on';
    const phoneEnabled = !!(cfg.modules && cfg.modules.phoneMod !== 'off');
    const next = (v === "ainav" && aiNavEnabled) ? "ainav" : (v === "chats" && chatsEnabled) ? "chats" : v === "feed" ? "feed" : (v === "phone" && phoneEnabled) ? "phone" : "blocks";
    cfg.ux = { ...(cfg.ux && typeof cfg.ux === 'object' ? cfg.ux : {}), current: next };
    saveConfig(cfg);
    ctx.redirect(next === "ainav" ? "/" : next === "chats" ? "/chats" : next === "feed" ? "/feed" : next === "phone" ? "/phone" : "/settings");
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
    ctx.redirect("/settings#lan");
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
    cfg.wish = WISH_LEVELS.includes(v) ? v : 'whole';
    saveConfig(cfg);
    ctx.redirect("/settings#wish");
  })
  .post("/settings/phone", koaBody(), async (ctx) => {
    const cfg = getConfig();
    const choice = String(ctx.request.body.visibility || '');
    const prev = cfg.phone || {};
    cfg.phone = choice === 'dnd'
      ? { ...prev, visibility: prev.visibility === 'whole' ? 'whole' : 'mutuals', dnd: true }
      : { ...prev, visibility: choice === 'whole' ? 'whole' : 'mutuals', dnd: false };
    saveConfig(cfg);
    try { await syncPhoneVisibility(); } catch (_) {}
    ctx.redirect("/settings#phone");
  })
  .post("/settings/inbox-bots", koaBody(), async (ctx) => {
    const cfg = getConfig();
    const b = ctx.request.body || {};
    const on = new Set((Array.isArray(b.bots) ? b.bots : (b.bots ? [b.bots] : [])).map(String));
    const known = Object.keys(pmModel.INBOX_BOTS).concat(['reminders']);
    cfg.inboxMutedBots = known.filter(k => !on.has(k));
    saveConfig(cfg);
    try { await refreshInboxCount(); } catch (_) {}
    ctx.redirect("/settings#inbox-bots");
  })
  .post("/settings/pm-visibility", koaBody(), async (ctx) => {
    const cfg = getConfig();
    const v = String(ctx.request.body.pmVisibility || '').trim();
    cfg.pmVisibility = v === 'mutuals' ? 'mutuals' : 'whole';
    saveConfig(cfg);
    const returnTo = String((ctx.query && ctx.query.returnTo) || (ctx.request.body && ctx.request.body.returnTo) || '');
    ctx.redirect(['/settings', '/inbox'].includes(returnTo) ? returnTo : '/settings');
  })
  .post("/settings/rebuild", async ctx => {
    try { settingsReports.rebuild = await backupModel.rebuildIndexes(); }
    catch (e) { settingsReports.rebuild = { checkedAt: new Date().toISOString(), tookMs: 0, ok: false, error: e.message || String(e), totalMessages: 0, indexes: {} }; }
    ctx.redirect("/settings#indexes");
  })
  .post("/settings/verify", koaBody(), async (ctx) => {
    try { settingsReports.verification = await backupModel.verify(); }
    catch (e) { settingsReports.verification = { error: e.message || String(e) }; }
    ctx.redirect("/settings#verification");
  })
  .post("/modules/preset", koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const ALL_MODULES = workflowsModel.ALL_MODULES;
    const PRESETS = workflowsModel.PRESETS;
    const preset = String(ctx.request.body.preset || '');
    const enabledMods = PRESETS[preset];
    if (!enabledMods) { ctx.redirect('/modules'); return; }
    const cfg = getConfig();
    ALL_MODULES.forEach(mod => cfg.modules[`${mod}Mod`] = enabledMods.includes(mod) ? 'on' : 'off');
    saveConfig(cfg);
    ctx.redirect('/modules');
  })
  .post("/save-modules", koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const modules = workflowsModel.ALL_MODULES;
    const cfg = getConfig();
    modules.forEach(mod => cfg.modules[`${mod}Mod`] = ctx.request.body[`${mod}Form`] === 'on' ? 'on' : 'off');
    saveConfig(cfg);
    ctx.redirect(`/modules`);
  })
  .post("/settings/ai", koaBody(), async (ctx) => {
    const aiPrompt = String(ctx.request.body.ai_prompt || "").trim();
    if (aiPrompt.length > 128) { sendErrorPage(ctx, "Prompt too long. Must be 128 characters or fewer.", { status: 400 }); return; }
    const cfg = getConfig();
    cfg.ai = { ...(cfg.ai || {}), prompt: aiPrompt, suggestions: ctx.request.body.ai_suggestions === 'on' };
    saveConfig(cfg);
    ctx.redirect("/settings#ai");
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
    try { await transfersModel.createOpinion(ctx.params.transferId, ctx.params.category); }
    catch (e) { return /already/i.test(String(e && e.message)) ? failWith(ctx, 'opinionAlreadyGiven') : actionFail(ctx); }
    ctx.redirect(safeReturnTo(ctx, '/transfers', ['/transfers']));
  })
  .post("/settings/wallet", koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const b = ctx.request.body, cfg = getConfig();
    if (b.wallet_url) cfg.wallet.url = String(b.wallet_url).trim();
    if (b.wallet_user) cfg.wallet.user = String(b.wallet_user).trim();
    if (b.wallet_pass) cfg.wallet.pass = String(b.wallet_pass);
    if (b.wallet_fee) cfg.wallet.fee = String(b.wallet_fee);
    saveConfig(cfg);
    if (bankingModel.hasWalletCredentials()) { try { await bankingModel.ensureSelfAddressPublished(); } catch (_) {} }
    try { await refreshWalletReady(true); } catch (_) {}
    ctx.redirect('/banking?filter=overview');
  })
  .post("/settings/wallet/disconnect", koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    const cfg = getConfig();
    cfg.wallet.url = '';
    cfg.wallet.user = '';
    cfg.wallet.pass = '';
    saveConfig(cfg);
    try { await bankingModel.removeAddress({ userId: getViewerId() }); } catch (_) {}
    try { await refreshWalletReady(true); } catch (_) {}
    ctx.redirect('/banking?filter=overview');
  })
  .post("/wallet/send", koaBody(), async (ctx) => {
    if (!isLoopbackRequest(ctx)) { ctx.status = 403; ctx.body = ''; return; }
    if (!checkMod(ctx, 'walletMod')) { ctx.redirect('/modules'); return; }
    const b = ctx.request.body, action = String(b.action), dest = String(b.destination), amt = Number(b.amount), fee = Number(b.fee);
    const transferId = String(b.transferId || '').trim();
    const wantsTransfer = [].concat(b.createTransfer || []).includes('1');
    const transferCtx = await loadTransferForWallet(ctx, transferId);
    const paymentRef = transferCtx ? null : await loadPaymentRef(ctx, { payee: b.payeeId, concept: b.concept, ref: b.refHref, to: dest, tag: b.refTag });
    const walletOptions = { transfer: transferCtx ? { id: transferCtx.id, concept: transferCtx.concept } : null, payment: paymentRef, createTransfer: wantsTransfer && !transferCtx };
    const { url, user, pass } = getConfig().wallet;
    let balance = null;
    try { balance = await walletModel.getBalance(url, user, pass); } catch (error) { ctx.body = await walletErrorView(error); return; }
    if (action !== 'confirm' && action !== 'send') return;
    let v;
    try { v = await walletModel.validateSend(url, user, pass, dest, amt, fee); } catch (error) { ctx.body = await walletErrorView(error); return; }
    if (!v.isValid) {
      const ws = require('../views/main_views').i18n.walletStatusMessages || {};
      ctx.state.inlineError = [ws.validation_errors, ...(v.errors || []).map(e => ws[e] || e)].filter(Boolean).join(': ');
    }
    if (action === 'confirm' || !v.isValid) {
      try { ctx.body = v.isValid ? await walletSendConfirmView(balance, dest, amt, fee, walletOptions) : await walletSendFormView(balance, dest, amt, fee, null, null, walletOptions); }
      catch (error) { ctx.body = await walletErrorView(error); }
    } else {
      try {
        const txId = await walletModel.sendToAddress(url, user, pass, dest, amt);
        const { i18n: i18nW } = require('../views/main_views');
        const me = getViewerId();
        let note = null;
        const paidLine = `${await actorLink(me)} ${i18nW.walletPaymentPmText}: ${Number(amt).toFixed(6)} ECO`;
        if (transferCtx) {
          try { await notifyBot('WALLET_PAYMENT', [transferCtx.other], `${paidLine} → [${transferCtx.concept || transferCtx.id}](/transfers/${encodeURIComponent(transferCtx.id)}) · tx ${txId}`); } catch (_) {}
          note = i18nW.walletTransferNotifiedNote;
        } else {
          let payeeId = paymentRef ? paymentRef.payeeId : null;
          if (!payeeId) {
            try {
              const rows = await bankingModel.listAddressesMerged();
              const payee = (rows || []).find(r => String(r.address) === String(dest));
              if (payee && String(payee.id) !== String(me)) payeeId = payee.id;
            } catch (_) {}
          }
          const refLink = paymentRef && paymentRef.concept ? (paymentRef.href ? `[${paymentRef.concept}](${paymentRef.href})` : paymentRef.concept) : '';
          let receiptLink = '';
          if (payeeId && wantsTransfer && checkMod(ctx, 'transfersMod')) {
            try {
              const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
              const concept = `${paymentRef && paymentRef.concept ? paymentRef.concept : i18nW.walletTransferReceiptConcept} · tx ${txId}`;
              const created = await transfersModel.createTransfer(payeeId, concept, amt, deadline, [paymentRef && paymentRef.tag ? paymentRef.tag : 'WALLET'], 'ECONOMIC');
              if (created && created.key) receiptLink = ` → [${i18nW.walletTransferReceiptConcept}](/transfers/${encodeURIComponent(created.key)})`;
              note = i18nW.walletTransferCreatedNote;
            } catch (_) {}
          }
          if (payeeId) {
            try { await notifyBot('WALLET_PAYMENT', [payeeId], `${paidLine}${refLink ? ` → ${refLink}` : ''} · tx ${txId}${receiptLink}`); } catch (_) {}
            if (!note) note = i18nW.walletTransferNotifiedNote;
          } else if (wantsTransfer) {
            note = i18nW.walletTransferNoPayeeNote;
          }
        }
        ctx.body = await walletSendResultView(balance, dest, amt, txId, note);
      }
      catch (error) {
        ctx.state.inlineError = String(require('../views/main_views').i18n.walletSendFailed || '').replace('{reason}', String((error && error.message) || error || '').slice(0, 200));
        ctx.body = await walletSendFormView(balance, dest, amt, fee, null, null, walletOptions);
      }
    }
  });
const routes = router.routes();
const folderSizes = new Map();
const FOLDER_SIZE_TTL_MS = 10 * 60 * 1000;
const walkBytes = async (dir) => {
  let entries;
  try { entries = await promisesFs.readdir(dir, { withFileTypes: true }); } catch (_) { return 0; }
  let total = 0;
  for (const e of entries) {
    const p = path.join(dir, e.name);
    try { total += e.isDirectory() ? await walkBytes(p) : (await promisesFs.stat(p)).size; } catch (_) {}
  }
  return total;
};
const folderBytes = async (dir) => {
  const hit = folderSizes.get(dir);
  if (hit && Date.now() - hit.at < FOLDER_SIZE_TTL_MS) return hit.bytes;
  const bytes = await walkBytes(dir);
  folderSizes.set(dir, { at: Date.now(), bytes });
  return bytes;
};
const refreshAll = async (now) => {
  try { await bankingModel.ensureSelfAddressPublished(); } catch (_) {}
  try { await bankingModel.getUserEngagementScore(getViewerId()); } catch (_) {}
  try {
    const [blobBytes, logBytes, counted] = await Promise.all([folderBytes(path.join(ssbConfig.path, 'blobs')), folderBytes(path.join(ssbConfig.path, 'db2')), inhabitantsModel.countInhabitants().catch(() => 0)]);
    const totalMB = (blobBytes + logBytes) / (1024 * 1024);
    const hcT = parseFloat((totalMB * 0.0002 * 475).toFixed(2));
    const inhabitants = counted || 1;
    const hcH = inhabitants > 0 ? parseFloat((hcT / inhabitants).toFixed(2)) : 0;
    sharedState.setCarbonHcT(hcT);
    sharedState.setCarbonHcH(hcH);
    sharedState.setInhabitantCount(inhabitants);
  } catch (_) {}
  try {
    sharedState.setTribesCount((await tribesModel.listAll()).length);
  } catch (_) {}
  try {
    const dataRes = await dataModel.listMatches('ALL');
    const shown = new Set((dataRes.matches || []).slice(0, 10));
    const perSection = new Map();
    for (const m of dataRes.matches || []) {
      if (!m || !m.href || !(Number(m.score) > 0)) continue;
      for (const key of new Set([m.kind, String(m.href).split('/')[1]])) {
        if (!key || key === 'author') continue;
        const n = perSection.get(key) || 0;
        if (n < 5) { perSection.set(key, n + 1); shown.add(m); }
      }
    }
    await Promise.all([...shown].map(async (m) => { if (m) m.title = await suggestionTitle(m); }));
    sharedState.setMatchPool((dataRes.matches || []).slice(0, 10).map(top => ({ href: top.href, title: top.title, kind: top.kind, score: top.score })));
    const sections = new Map();
    for (const m of dataRes.matches || []) {
      if (!m || !m.href || !(Number(m.score) > 0)) continue;
      const entry = { href: m.href, title: m.title, kind: m.kind, score: m.score };
      for (const key of new Set([m.kind, String(m.href).split('/')[1]])) {
        if (!key || key === 'author') continue;
        const list = sections.get(key) || [];
        if (list.length < 5) { list.push(entry); sections.set(key, list); }
      }
    }
    sharedState.setSectionMatches(sections);
    sharedState.nextBestMatch();
  } catch (_) {}
  try { await refreshDonatableAuthors(); } catch (_) {}
  try { await refreshLanPeers(true); } catch (_) {}
  try { await refreshPeerHealth(); } catch (_) {}
  try { await syncPhoneVisibility(); } catch (_) {}
  try { await announceOasisVersion(); } catch (_) {}
  try { await syncRoomBanner(); } catch (_) {}
  try { sharedState.setFeaturedEmergency(await emergenciesModel.featured()); } catch (_) {}
  try { await refreshInboxCount(); } catch (_) {}
  try { if (!config.public) await phoneModel.refreshCount(); } catch (_) {}
  try { await refreshMentionsCount(); } catch (_) {}
  try { await calendarsModel.checkDueReminders(); } catch (_) {}
  try { await tasksModel.checkDueReminders(); } catch (_) {}
  try { await checkPoliticalChanges(); } catch (_) {}
  try { await checkJobMatches(); } catch (_) {}
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
};
let refreshRunning = false;
const kickRefresh = () => {
  if (refreshRunning) return;
  const now = Date.now();
  sharedState.setLastRefresh(now);
  refreshRunning = true;
  require('../models/typed_log').requestScope.run({ capped: false, limit: 0, path: '/', query: '' }, () => refreshAll(now))
    .catch(() => {})
    .finally(() => { refreshRunning = false; });
};
setTimeout(() => { if (!sharedState.getLastRefresh()) kickRefresh(); }, 5000);
const middleware = [
  async (ctx, next) => { await require('../models/typed_log').requestScope.run({ capped: false, limit: 0, path: ctx.path, query: ctx.querystring, method: ctx.method }, next); },
  async (ctx, next) => {
    if (ctx.method !== 'POST') return next();
    const forget = () => { censusCache.clear(); lifetime.forget(); };
    forget();
    try { await next(); } finally { forget(); }
  },
  publicModeGuard({
    isPublic: !!config.public,
    onBlocked: (ctx) => sendErrorPage(ctx, "Sorry, many actions are unavailable when Oasis is running in public mode. Please run Oasis in the default mode and try again.", { status: 403 })
  }),
  async (ctx, next) => {
    if (isLoopbackOnlyPath(ctx.path) && !isLoopbackRequest(ctx)) { sendErrorPage(ctx, 'Forbidden', { status: 403 }); return; }
    await next();
  },
  async (ctx, next) => { applyFirstRunLanguage(ctx); setLanguage(isClearnetPath(ctx.request) ? clearnetLanguage(ctx) : (ctx.cookies.get("language") || getConfig().language || "en")); await next(); },
  async (ctx, next) => {
    try { require('../views/comments_view').setCommentsOpen(ctx.method === 'GET' && String(ctx.query.comments || '') === 'open'); } catch (_) {}
    await next();
  },
  async (ctx, next) => {
    if (ctx.method === 'GET' && WALLET_CHIP_PATHS.some(p => ctx.path === p || ctx.path.startsWith(`${p}/`))) {
      await settleWithin(refreshWalletReady(), WALLET_CHECK_WAIT_MS);
      const kind = (ctx.path === '/transfers' || ctx.path.startsWith('/transfers/')) ? 'transfers'
        : (ctx.path === '/banking' || ctx.path.startsWith('/banking/')) ? 'banking' : null;
      if (kind) require('../models/typed_log').requestScope.run({ capped: false, limit: 0, path: '/', query: '' }, () => runWalletWork(kind)).catch(() => {});
    }
    await next();
  },
  async (ctx, next) => {
    await next();
    const flash = String((ctx.state && ctx.state.inlineError) || (ctx.method === 'GET' ? signedErrorOf(ctx) : '')).trim();
    if (!flash || typeof ctx.body !== 'string' || !/html/.test(String(ctx.type || ''))) return;
    const { renderInlineError } = require('../views/main_views');
    const marker = '</section>';
    const at = ctx.body.indexOf(marker);
    if (at < 0) return;
    const cleanUrl = ctx.method === 'GET' ? ctx.path + (() => { const q = new URLSearchParams(ctx.querystring); q.delete('error'); q.delete('errsig'); const s = q.toString(); return s ? `?${s}` : ''; })() : null;
    ctx.body = ctx.body.slice(0, at + marker.length) + renderInlineError(flash, cleanUrl) + ctx.body.slice(at + marker.length);
  },
  async (ctx, next) => {
    const isBinary = ctx.path.startsWith('/qr') || ctx.path.startsWith('/wallet/qr/') || ctx.path.startsWith('/image/') || ctx.path.startsWith('/blob/') || ctx.path.startsWith('/assets/');
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
    const migration = typeof SSBconfig.migrationStatus === 'function' ? SSBconfig.migrationStatus() : null;
    if (migration && migration.running) { ctx.response.body = indexingView({ percent: migration.percent }); return; }
    const ssb = await cooler.open(), status = await ssb.status();
    if (indexingLag(status) > INDEXING_LAG_BYTES) ctx.response.body = indexingView({ percent: Math.floor(indexingProgress(status) * 1000) / 10 });
    else { try { await next(); } catch (err) {
      const { i18n } = require('../views/main_views');
      if (err.name === 'FileTooLargeError' || (err.message && err.message.includes('maxFileSize'))) {
        sendErrorPage(ctx, i18n.fileTooLargeMessage, { title: i18n.fileTooLargeTitle, status: 413 });
        return;
      }
      const moduleHome = moduleHomeFor(ctx);
      if (moduleHome && isMissingContentError(err)) { ctx.redirect(moduleHome); return; }
      sendErrorPage(ctx, err.message || 'Internal Server Error', { status: err.status || 500 });
    } }
  },
  async (ctx, next) => {
    if (!ctx.path.startsWith('/assets/') && !ctx.path.startsWith('/image/') && !ctx.path.startsWith('/blob/') && !ctx.path.startsWith('/qr') && !ctx.path.startsWith('/c/')) {
      if (Date.now() - sharedState.getLastRefresh() > 60000) kickRefresh();
    }
    await next();
  },
  routes,
  async (ctx) => {
    if (ctx.body != null || (ctx.method !== 'GET' && ctx.method !== 'HEAD')) return;
    if (isClearnetPath(ctx.request) || ctx.path === '/clearnet' || ctx.path.startsWith('/clearnet/')) {
      ctx.status = 404;
      ctx.type = 'text/html';
      ctx.body = require('../views/clearnet_view').renderClearnetNotFound();
      return;
    }
    if (/^\/(blob|image|assets|qr|qr-invite)(\/|$)/.test(ctx.path)) return;
    ctx.redirect('/');
  },
];
const app = http({ host, port, middleware, allowHost: config.allowHost });
if (ADMIN_TOKEN) console.log(`- Admin access (open it on this device): http://localhost:${port}/admin-session/${ADMIN_TOKEN}`);
const startDesktopNotices = async () => {
  const { notify: desktopNotify, i18nNow, displayName } = require('./desktopNotify');
  const ssb = await cooler.open();
  if (!ssb || !ssb.db || typeof ssb.db.onMsgAdded !== 'function') return;
  const me = ssb.id;
  let lastEmergency = null;
  try { const f = await emergenciesModel.featured(); lastEmergency = f && f.id; } catch (_) {}
  const nameFor = async (id) => { try { return displayName(id, await about.name(id)); } catch (_) { return String(id); } };
  const isMutual = async (id) => { try { const rel = await friend.getRelationship(id); return !!(rel && rel.following && rel.followsMe); } catch (_) { return false; } };
  ssb.db.onMsgAdded((ev) => {
    const kvt = ev && ev.kvt;
    const v = kvt && kvt.value;
    if (!v || v.author === me || Date.now() - (Number(v.timestamp) || 0) > 15 * 60 * 1000) return;
    (async () => {
      const i18n = i18nNow();
      const cfg = getConfig();
      if (typeof v.content === 'string') {
        let c = null;
        try { const dec = ssb.private.unbox({ key: kvt.key, value: v, timestamp: kvt.timestamp }); c = dec && dec.value && dec.value.content; } catch (_) {}
        if (!c || c.private !== true || !Array.isArray(c.to) || !c.to.includes(me)) return;
        if (cfg.pmVisibility === 'mutuals' && !(await isMutual(v.author))) return;
        if (c.type === 'pam') {
          if (cfg.modules.phoneMod !== 'off') desktopNotify(i18n.phoneTitle, `${i18n.notifyNewPamFrom} ${await nameFor(v.author)}`);
          return;
        }
        if (c.type !== 'post') return;
        const bot = pmModel.botOf({ subject: String(c.subject || '') });
        if (bot && pmModel.mutedBots(cfg).has(bot)) return;
        desktopNotify(i18n.inbox, `${i18n.notifyNewPmFrom} ${bot || await nameFor(v.author)}`);
        return;
      }
      const t = v.content && v.content.type;
      if (typeof t === 'string' && t.startsWith('emergency') && cfg.modules.emergenciesMod === 'on') {
        const f = await emergenciesModel.featured().catch(() => null);
        if (!f || !f.id || f.id === lastEmergency) return;
        lastEmergency = f.id;
        if (sharedState.getDismissedEmergency && sharedState.getDismissedEmergency() === f.id) return;
        desktopNotify(i18n.emergenciesTitle, f.title);
      }
    })().catch(() => {});
  }, false);
};
if (!config.public) setTimeout(() => { phoneModel.start().catch(() => {}); startDesktopNotices().catch(() => {}); syncClearnetSince().catch(() => {}); }, 3000);

let pubEngineTimer = null;
let pubAddressEnsured = false;
let pubEngineRunning = false;
async function runPubEngineTick() {
  if (!bankingModel.isPubNode() || pubEngineRunning) return;
  pubEngineRunning = true;
  try {
    if (!pubAddressEnsured) { try { const r = await bankingModel.ensureSelfAddressPublished(); pubAddressEnsured = r && r.status !== 'skipped'; } catch (_) {} }
    try { await bankingModel.executeEpoch({}); } catch (_) {}
    try { await bankingModel.processPendingClaims(); } catch (_) {}
    try { await bankingModel.confirmIncomingTransfers(); } catch (_) {}
    try { await bankingModel.rebalanceUbiPools(); } catch (_) {}
    try { await bankingModel.publishPubAvailability(); } catch (_) {}
  } finally {
    pubEngineRunning = false;
  }
}
const ubiNoticePath = process.env.OASIS_BANKING_DIR ? path.join(process.env.OASIS_BANKING_DIR, 'banking-ubi-notice.json') : stateFilePath('banking-ubi-notice.json');
const confirmNoticePath = process.env.OASIS_BANKING_DIR ? path.join(process.env.OASIS_BANKING_DIR, 'banking-confirm-notice.json') : stateFilePath('banking-confirm-notice.json');
async function notifyPendingConfirmations() {
  if (getConfig().modules?.transfersMod === 'off') return;
  try {
    const me = getViewerId();
    const list = await transfersModel.listAll('all', me).catch(() => []);
    const pending = (list || []).filter(t => {
      const tags = Array.isArray(t.tags) ? t.tags.map(x => String(x).toUpperCase()) : [];
      const settledUbi = tags.includes('UBI') && /^[0-9a-f]{64}$/i.test(String(t.txid || ''));
      return String(t.status || '').toUpperCase() === 'UNCONFIRMED'
        && String(t.to) === String(me)
        && !(Array.isArray(t.confirmedBy) ? t.confirmedBy : []).includes(me)
        && !tags.includes('PENDING')
        && !settledUbi;
    });
    if (!pending.length) return;
    let notified = [];
    try { notified = JSON.parse(fs.readFileSync(confirmNoticePath, 'utf8')) || []; } catch (_) {}
    const fresh = pending.filter(t => !notified.includes(t.id));
    if (!fresh.length) return;
    const { i18n: i18nB } = require('../views/main_views');
    const lines = fresh.slice(0, 5).map(t => `· [${t.concept || t.id}](/transfers/${encodeURIComponent(t.id)}) — ${Number(t.amount || 0).toFixed(6)} ECO`).join('\n');
    await notifyBot('BANKING_CONFIRM_PENDING', [me], `${i18nB.bankingBotConfirmText} (${fresh.length}):\n${lines}\n\n[${i18nB.transfersFilterPending}](/transfers?filter=pending)`);
    fs.writeFileSync(confirmNoticePath, JSON.stringify([...notified, ...fresh.map(t => t.id)].slice(-500)));
  } catch (_) {}
}

const lastWalletWork = { transfers: 0, banking: 0 };
async function runWalletWork(kind) {
  if (bankingModel.isPubNode()) return;
  if (Date.now() - (lastWalletWork[kind] || 0) < 60000) return;
  lastWalletWork[kind] = Date.now();
  try { await bankingModel.confirmIncomingTransfers(); } catch (_) {}
  if (kind === 'transfers') { try { await notifyPendingConfirmations(); } catch (_) {} return; }
  try {
    const avail = await bankingModel.claimAvailability(getViewerId());
    if (!avail.available) return;
    let notified = {};
    try { notified = JSON.parse(fs.readFileSync(ubiNoticePath, 'utf8')) || {}; } catch (_) {}
    if (notified.epochId === avail.epochId) return;
    const { i18n: i18nB } = require('../views/main_views');
    await notifyBot('BANKING_UBI_AVAILABLE', [getViewerId()], `${i18nB.bankingBotUbiAvailableText}: [${i18nB.bankClaimUBI}](/banking?filter=exchange) · ${avail.epochId}`);
    fs.writeFileSync(ubiNoticePath, JSON.stringify({ epochId: avail.epochId, at: new Date().toISOString() }));
  } catch (_) {}
}
if (bankingModel.isPubNode()) {
  console.log(`[UBI] PUB engine on: paying UBI through ecoind at ${getConfig().wallet.url}`);
  setTimeout(() => { runPubEngineTick(); }, 15000);
  pubEngineTimer = setInterval(runPubEngineTick, 30 * 60 * 1000);
}

setTimeout(() => { if (getConfig().modules?.larpMod === 'on') larpModel.init().catch(() => {}); }, 10000);

let welcomePmAttempted = false;
async function sendWelcomePmIfFirstLaunch() {
  if (welcomePmAttempted) return;
  welcomePmAttempted = true;
  const flagPath = stateFilePath('oasis-first-contact');
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
    try {
      if (!onboardingModel.begin(ownId)) console.error('[welcome-pm] flag write failed');
    } catch (e) {
      console.error('[welcome-pm] flag write failed:', e && e.message ? e.message : e);
    }
  } catch (err) {
    console.error('[welcome-pm] unexpected error:', err && err.message ? err.message : err);
    welcomePmAttempted = false;
  }
}
let firstRunLanguageSettled = false;
const supportedLanguages = () => Object.keys(require('../client/assets/translations/i18n'));
function clearnetLanguage(ctx) {
  const supported = supportedLanguages();
  const wanted = String(ctx.query.lang || '').trim().toLowerCase();
  if (supported.includes(wanted)) {
    const store = require('../models/typed_log').requestScope.getStore();
    if (store) store.cnLang = wanted;
    return wanted;
  }
  const detected = require('../models/onboarding_model').browserLanguage(ctx.get('accept-language'), supported);
  return detected || getConfig().language || 'en';
}
function applyFirstRunLanguage(ctx) {
  if (firstRunLanguageSettled || isClearnetPath(ctx.request)) return;
  const cfg = getConfig();
  const decision = require('../models/onboarding_model').firstRunLanguage({
    fresh: !onboardingModel.firstContactSeen(),
    isPublic: !!config.public,
    configured: cfg.language,
    cookie: ctx.cookies.get('language'),
    header: ctx.get('accept-language'),
    supported: supportedLanguages()
  });
  if (!decision.settled) return;
  firstRunLanguageSettled = true;
  if (decision.language && decision.language !== cfg.language) {
    cfg.language = decision.language;
    saveConfig(cfg);
  }
  setTimeout(welcomePmTick, 0);
}
let welcomePmRetries = 0;
const welcomePmTick = async () => {
  if (onboardingModel.firstContactSeen()) return;
  if (!firstRunLanguageSettled) {
    const cfg = getConfig();
    const decision = require('../models/onboarding_model').firstRunLanguage({ fresh: true, isPublic: !!config.public, configured: cfg.language, supported: supportedLanguages() });
    if (!decision.settled) return;
    firstRunLanguageSettled = true;
  }
  await sendWelcomePmIfFirstLaunch();
  if (onboardingModel.firstContactSeen()) return;
  if (welcomePmRetries++ >= 30) return;
  setTimeout(welcomePmTick, 4000);
};
setTimeout(welcomePmTick, 3000);

const pbFmtDate = (iso) => iso ? moment(iso).format('YYYY-MM-DD HH:mm:ss') : '';
const pbFmtRemaining = (endIso) => {
  if (!endIso) return '';
  const ms = moment(endIso).diff(moment());
  if (ms <= 0) return '0d 00:00:00';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const mi = Math.floor((ms % 3600000) / 60000);
  const se = Math.floor((ms % 60000) / 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${d}d ${pad(h)}:${pad(mi)}:${pad(se)}`;
};
const pbFill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
const pbTitleCase = (s) => { const t = String(s || ''); return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ''; };
const pbAtId = (id) => id ? '@' + String(id).replace(/^@/, '') : '';
function buildLarpRulingMsg(data = {}, t = {}) {
  const house = data.house || {};
  const name = house.name || data.houseKey || '';
  const intro = pbFill(t.politicalBotLarpIntro || 'Now {house} rules during this cycle: {cycle}', {
    house: `[${name}](/larp/${encodeURIComponent(data.houseKey || '')})`,
    cycle: `[${data.cycleFormatted || ''}](/larp)`
  });
  const blocks = [
    [intro],
    [name, house.description || ''],
    [
      `${t.larpRolesLabel || 'Roles'}: ${house.roles || ''}`,
      `${t.larpFunctionLabel || 'Function'}: ${house.function || ''}`,
      `${t.larpMonthLabel || 'Governance cycle'}: ${house.month != null ? house.month : ''}`,
      `${t.larpMembersCount || 'Members'}: ${data.memberCount || 0}`
    ],
    [house.motto ? `“${house.motto}”` : '']
  ];
  const body = blocks
    .map(block => block.filter(l => l != null && String(l).trim() !== '').join('\n'))
    .filter(Boolean)
    .join('\n\n');
  return { subject: 'LARP_RULING', body };
}
function pbGovBlock(gov = {}, t = {}) {
  const lines = [`${t.parliamentGovernmentCard || 'Current Government'}: ${String(gov.method || '').toUpperCase()}`];
  if (gov.leaderId) lines.push(`${t.politicalBotLeaderLabel || 'Leader'}: ${pbAtId(gov.leaderId)}`);
  lines.push(`${t.parliamentLegSince || 'CYCLE SINCE'}: ${pbFmtDate(gov.since)}`);
  lines.push(`${t.parliamentLegEnd || 'CYCLE END'}: ${pbFmtDate(gov.end)}`);
  lines.push(`${t.parliamentTimeRemaining || 'Time remaining'}: ${pbFmtRemaining(gov.end)}`);
  lines.push(`${t.parliamentPopulation || 'Population'}: ${gov.population || 0}`);
  return lines;
}
function buildParliamentGovMsg(gov = {}, t = {}) {
  const govLink = `[${pbTitleCase(gov.method)}](/parliament)`;
  const intro = gov.leaderId
    ? pbFill(t.politicalBotParliamentIntroLeader || 'The current government is {gov}, led by {leader}', { gov: govLink, leader: pbAtId(gov.leaderId) })
    : pbFill(t.politicalBotParliamentIntro || 'The current government is {gov}', { gov: govLink });
  return { subject: 'PARLIAMENT_GOV', body: [intro, ''].concat(pbGovBlock(gov, t)).join('\n') };
}
function buildTribeGovMsg(gov = {}, t = {}) {
  const govLink = `[${pbTitleCase(gov.method)}](/tribe/${encodeURIComponent(gov.tribeId || '')}?section=governance)`;
  const vars = { tribe: gov.tribeName || '', gov: govLink, leader: pbAtId(gov.leaderId) };
  const intro = gov.leaderId
    ? pbFill(t.politicalBotTribeIntroLeader || 'The current government in the Tribe {tribe} is {gov}, led by {leader}', vars)
    : pbFill(t.politicalBotTribeIntro || 'The current government in the Tribe {tribe} is {gov}', vars);
  return { subject: 'TRIBE_GOV', body: [intro, ''].concat(pbGovBlock(gov, t)).join('\n') };
}
let jobsBotRunning = false;
async function checkJobMatches() {
  if (jobsBotRunning) return;
  jobsBotRunning = true;
  try {
    const viewerId = getViewerId();
    if (!viewerId) return;
    const cv = await cvModel.getCVByUserId().catch(() => null);
    if (!cv || cv.aiManaged === false) return;
    const threshold = Math.min(100, Math.max(0, Number(cv.matchThreshold) || 80)) / 100;
    const matches = await dataModel.jobMatchesFor(viewerId, { minScore: threshold }).catch(() => []);
    if (!matches.length) return;
    const announced = await pmModel.sentRefs().catch(() => new Set());
    const i18nAll = require('../client/assets/translations/i18n');
    const lang = (getConfig() && getConfig().language) || 'en';
    const t = i18nAll[lang] || i18nAll.en;
    for (const m of matches.slice(0, 5)) {
      const ref = `${m.id}|${Math.round(m.score * 100)}`;
      if (announced.has(`JOB_MATCH|${ref}`)) continue;
      const pctText = `${Math.round(m.score * 100)}%`;
      const body = [
        (t.jobsBotMatchIntro || 'A job matches your curriculum.'),
        '',
        `${t.jobsBotMatchJob || 'Job'}: [${m.title || m.id}](${m.href})`,
        `${t.matchScore || 'Match'}: ${pctText}`,
        m.common.length ? `${t.commonSkills || 'Common skills'}: ${m.common.slice(0, 10).join(', ')}` : '',
        '',
        (t.jobsBotMatchHint || 'You receive this because your curriculum is AI managed. You can turn it off in your CV.')
      ].filter(Boolean).join('\n');
      try {
        await notifyBot('JOB_MATCH', [], body, false, ref);
        announced.add(`JOB_MATCH|${ref}`);
      } catch (e) {
        if (config.debug) console.error('[jobs-bot] send failed:', e && e.message);
      }
    }
  } catch (e) {
    if (config.debug) console.error('[jobs-bot] failed:', e && e.message);
  } finally {
    jobsBotRunning = false;
  }
}

let politicalCheckRunning = false;
async function checkPoliticalChanges() {
  if (politicalCheckRunning) return;
  politicalCheckRunning = true;
  try {
    const ssbClient = await cooler.open().catch(() => null);
    if (!ssbClient || !ssbClient.id) return;
    const ownId = ssbClient.id;
    const i18nAll = require('../client/assets/translations/i18n');
    const lang = (getConfig() && getConfig().language) || 'en';
    const t = i18nAll[lang] || i18nAll.en;
    const announced = await pmModel.sentRefs().catch(() => new Set());
    const alreadyAnnounced = (subject, ref) => announced.has(`${subject}|${ref}`);
    const seen = pmPolicy.readAnnounceSeen();
    const send = async (subject, body, ref) => {
      const { send: shouldSend, remember } = pmPolicy.decideAnnouncement({ subject, ref, announced, seen });
      if (!shouldSend) {
        if (remember) { seen[subject] = String(ref); pmPolicy.writeAnnounceSeen(seen); }
        return;
      }
      try {
        await notifyBot(subject, [], body, { ref });
        announced.add(`${subject}|${ref}`);
        seen[subject] = String(ref);
        pmPolicy.writeAnnounceSeen(seen);
      } catch (e) { console.error('[political-bot] send failed:', e && e.message); }
    };

    try {
      const houseKey = larpModel.getGoverningHouseKey();
      if (houseKey) {
        let cycleFormatted = '';
        try { cycleFormatted = larpModel.computeCycle().formatted; } catch (_) {}
        const ref = larpModel.getGoverningPeriodId();
        if (!alreadyAnnounced('LARP_RULING', ref)) {
          const house = (larpModel.getHouse && larpModel.getHouse(houseKey)) || {};
          let memberCount = 0;
          try { const hc = await larpModel.listHousesWithCounts(); const h = (hc || []).find(x => x.key === houseKey); memberCount = h ? (h.memberCount || 0) : 0; } catch (_) {}
          const { subject, body } = buildLarpRulingMsg({ houseKey, house, memberCount, cycleFormatted }, t);
          await send(subject, body, ref);
        }
      }
    } catch (e) { console.error('[political-bot] larp:', e && e.message); }

    try {
      const card = await parliamentModel.getLatestGovernmentCard().catch(() => null);
      if (card) {
        const ref = [String(card.id || card.method || ''), String(card.since || '')].filter(Boolean).join(':');
        if (ref && !alreadyAnnounced('PARLIAMENT_GOV', ref)) {
          let population = 0;
          try { population = Number(await inhabitantsModel.countInhabitants()) || 0; } catch (_) {}
          const leaderId = (card.powerType === 'inhabitant' && card.powerId) ? card.powerId : null;
          const { subject, body } = buildParliamentGovMsg({ method: card.method, since: card.since, end: card.end, population, leaderId }, t);
          await send(subject, body, ref);
        }
      }
    } catch (e) { console.error('[political-bot] parliament:', e && e.message); }

    try {
      let tribes = [];
      try { tribes = await tribesModel.listAll(); } catch (_) { tribes = []; }
      for (const tribe of (tribes || [])) {
        if (!tribe || !tribe.id) continue;
        if (!Array.isArray(tribe.members) || !tribe.members.includes(ownId)) continue;
        if (tribe.parentTribeId) continue;
        let term = null;
        try { term = await parliamentModel.tribe.getCurrentTerm(tribe.id); } catch (_) { term = null; }
        if (!term) continue;
        const ref = `${tribe.id}:${String(term.id || term.startAt || term.method || '')}`;
        if (!alreadyAnnounced('TRIBE_GOV', ref)) {
          const lead = Array.isArray(term.leaders) && term.leaders.length ? term.leaders[0] : null;
          const leaderId = lead && typeof lead === 'object' ? (lead.id || lead.powerId || null) : lead;
          const population = Array.isArray(tribe.members) ? tribe.members.length : 0;
          const { subject, body } = buildTribeGovMsg({ method: term.method, since: term.startAt, end: term.endAt, population, leaderId, tribeId: tribe.id, tribeName: tribe.title || tribe.name || tribe.id }, t);
          await send(subject, body, ref);
        }
      }
    } catch (e) { console.error('[political-bot] tribe:', e && e.message); }

  } catch (err) {
    console.error('[political-bot] unexpected:', err && err.message);
  } finally {
    politicalCheckRunning = false;
  }
}
async function logClearnetStatus() {
  try {
    const ssbClient = await cooler.open();
    if (!ssbClient || !ssbClient.id) return;
    const prefs = await about.visibilityPrefs(ssbClient.id).catch(() => null);
    const { CLEARNET_MODULES } = require('../views/main_views');
    const active = prefs ? CLEARNET_MODULES.filter(m => prefs[m.prefKey] === true).map(m => m.label) : [];
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
