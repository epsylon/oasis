"use strict";

const path = require("path");
const fs = require("fs");

const envPaths = require("../server/node_modules/env-paths");
const debug = require("../server/node_modules/debug")("oasis");
const highlightJs = require("../server/node_modules/highlight.js");
const prettyMs = require("../server/node_modules/pretty-ms");
const moment = require('../server/node_modules/moment');
const QRCode = require('../server/node_modules/qrcode');
const { renderUrl } = require('../backend/renderUrl');
const ssbClientGUI = require("../client/gui");
const config = require("../server/ssb_config");
const cooler = ssbClientGUI({ offline: config.offline });
const sharedState = require('../configs/shared-state');

let ssb, userId;

const getUserId = async () => {
  if (!ssb) ssb = await cooler.open();
  if (!userId) userId = ssb.id;
  return userId;
};

const { a, article, br, body, button, details, div, em, footer, form, h1, h2, h3, head, header, hr, html, img, input, label, li, link, main, meta, nav, option, p, pre, section, select, span, summary, table, td, textarea, title, tr, ul, strong, video: videoHyperaxe, audio: audioHyperaxe } = require("../server/node_modules/hyperaxe");

const lodash = require("../server/node_modules/lodash");
const markdown = require("./markdown");
const { sanitizeHtml } = require('../backend/sanitizeHtml');
const nameCache = require('../backend/nameCache');

const userLinkLabel = (feedId, knownName) => {
  const id = String(feedId || '');
  if (!id) return '';
  let kn = (knownName && String(knownName).trim()) || '';
  if (kn === id || /^@[A-Za-z0-9+/_-]{43}=\.ed25519$/.test(kn)) kn = '';
  const name = kn || nameCache.get(id);
  if (name && name.length) return '@' + name;
  return id;
};

const userLink = (feedId, knownName) => {
  if (!feedId) return null;
  return a({ class: 'user-link', href: `/author/${encodeURIComponent(feedId)}` }, userLinkLabel(feedId, knownName));
};

exports.userLink = userLink;
exports.userLinkLabel = userLinkLabel;

const renderStateChip = (variant, icon, text) =>
  span({ class: `pm-exposition-chip pm-exposition-${variant}` },
    icon ? span({ class: "pm-exposition-icon" }, icon) : null,
    span({ class: "pm-exposition-text" }, String(text || ""))
  );

const renderOpenClosedChip = (status, i18nObj) => {
  const s = String(status || "").toUpperCase();
  const isOpen = s === "OPEN";
  const label = (i18nObj && i18nObj["statusChip" + s]) || s;
  return renderStateChip(isOpen ? "mutuals" : "closed", isOpen ? "✓" : "✗", label);
};

const renderVisibilityChip = (visibility, i18nObj) => {
  const v = String(visibility || "").toUpperCase();
  if (v === "HIDDEN") {
    return renderStateChip("hidden", "🙈", (i18nObj && i18nObj.visibilityHidden) || "HIDDEN");
  }
  return renderStateChip("mutuals", "👁", (i18nObj && i18nObj.visibilityPublic) || "PUBLIC");
};

const renderPrivacyChip = (isPrivate, i18nObj) =>
  isPrivate
    ? renderStateChip("closed", "🔒", (i18nObj && i18nObj.privacyPrivate) || "PRIVATE")
    : renderStateChip("mutuals", "🌐", (i18nObj && i18nObj.privacyPublic) || "PUBLIC");

const renderModeChip = (mode, i18nObj) => {
  const m = String(mode || "").toLowerCase();
  if (m === "strict") return renderStateChip("closed", null, (i18nObj && i18nObj.tribeStrict) || "STRICT");
  return renderStateChip("mutuals", null, (i18nObj && i18nObj.tribeOpen) || "OPEN");
};

const renderLifespanChip = (lifetime, i18nObj) => {
  const lt = lifetime || null;
  if (!lt || !lt.bucket) return null;
  const range = lt.range || "";
  if (range) {
    return span({ class: `pm-exposition-chip pm-exposition-lifespan-${lt.bucket}` },
      span({ class: "pm-exposition-text" }, range)
    );
  }
  return span({ class: `pm-exposition-chip pm-exposition-lifespan-${lt.bucket}` },
    span({ class: `activity-dot ${lt.bucket}` }, "●"),
    span({ class: "pm-exposition-text" }, (i18nObj && i18nObj.lifespanLabel) || "Lifespan")
  );
};

exports.renderStateChip = renderStateChip;
exports.renderOpenClosedChip = renderOpenClosedChip;
exports.renderVisibilityChip = renderVisibilityChip;
exports.renderPrivacyChip = renderPrivacyChip;
exports.renderModeChip = renderModeChip;
exports.renderLifespanChip = renderLifespanChip;

const formatCarbon = (bytes) => {
  const n = Number(bytes) || 0;
  if (!n) return '0 µg CO₂';
  const grams = (n / (1024 * 1024)) * 0.095;
  if (grams >= 1) return `${grams.toFixed(2)} g CO₂`;
  const mg = grams * 1000;
  if (mg >= 1) return `${mg.toFixed(2)} mg CO₂`;
  const ug = mg * 1000;
  return `${ug.toFixed(2)} µg CO₂`;
};

const renderEcoTax = (sizeBytes, blockId) => {
  const n = Number(sizeBytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  const label = (i18n && i18n.ecoTaxLabel) ? i18n.ecoTaxLabel : 'ECO Tax';
  const href = blockId
    ? `/blockexplorer?inspect=${encodeURIComponent(blockId)}#inspect`
    : '/blockexplorer#inspect';
  let band = 'low';
  let reducer = 1;
  let rawRatio = 0;
  let inhabitants = 1;
  try {
    const maxObserved = sharedState.getMaxBlockBytes ? Number(sharedState.getMaxBlockBytes()) : 0;
    const max = maxObserved > 0 ? maxObserved : n;
    rawRatio = max > 0 ? Math.min(1, n / max) : 0;
    inhabitants = Math.max(1, (sharedState.getInhabitantCount && sharedState.getInhabitantCount()) || 1);
    reducer = 1 + Math.log10(inhabitants);
    const adjusted = rawRatio / reducer;
    if (adjusted >= 0.66) band = 'high';
    else if (adjusted >= 0.33) band = 'mid';
    else band = 'low';
  } catch (_) {}
  const reducerNote = inhabitants > 1
    ? ` · reducer ×${reducer.toFixed(2)} (${inhabitants} inhabitants)`
    : '';
  const title = `${label} · ${formatCarbon(sizeBytes)}${reducerNote}`;
  return a({ href, class: `eco-tax-chip eco-tax-chip-${band}`, title },
    span({ class: 'eco-tax-chip-label' }, label + ': '),
    span({ class: 'eco-tax-chip-value' }, formatCarbon(sizeBytes))
  );
};

exports.formatCarbon = formatCarbon;
exports.renderEcoTax = renderEcoTax;

const errorView = ({ title, message, backHref }) => {
  const heading = title || i18n.errorPageTitle || 'Error';
  return exports.template(
    heading,
    section(
      div({ class: 'tags-header' },
        message ? p({ class: 'error-page-message' }, String(message)) : null,
        div({ class: 'error-page-actions' },
          a({ href: backHref || '/', class: 'filter-btn' }, i18n.goBack || 'Go back')
        )
      )
    )
  );
};
exports.errorView = errorView;

const renderSpreadButton = (msgKey, opts) => {
  if (!msgKey || typeof msgKey !== 'string' || !msgKey.startsWith('%') || !/\.sha256$/.test(msgKey)) return null;
  const o = (opts && typeof opts === 'object') ? opts : {};
  const voters = Array.isArray(o.voters) ? o.voters : [];
  const count = typeof o.count === 'number' ? o.count : voters.length;
  const alreadySpread = o.alreadySpread === true;
  const maxNames = 5;
  const maxLen = 16;
  const lastVoters = voters.slice(-maxNames);
  const tooltipNames = lastVoters
    .map(v => (v && typeof v === 'object' ? (v.name || v.key || '') : String(v || '')))
    .filter(Boolean)
    .map(n => n.slice(0, maxLen))
    .join(', ');
  const extra = count > maxNames ? ` +${count - maxNames} ${i18n.spreadMore || 'more'}` : '';
  const tooltip = count > 0 ? `${tooltipNames}${extra}` : (i18n.spreadHint || 'Spread this to your supporters (replicates via your feed).');
  return form(
    { method: 'POST', action: `/spread/${encodeURIComponent(msgKey)}`, class: 'spread-form' },
    button(
      { type: 'submit', class: alreadySpread ? 'spread-btn spread-btn-on' : 'spread-btn', title: tooltip },
      `🔁 ${count}`
    )
  );
};
exports.renderSpreadButton = renderSpreadButton;

const aiNavResultsView = ({ query, results }) => {
  const title = i18n.aiNavResultsTitle || 'AI navigation results';
  const safeQuery = String(query || '').trim();
  const safeResults = Array.isArray(results) ? results : [];
  const fmtScore = (s) => {
    const n = Number(s);
    return Number.isFinite(n) ? n.toFixed(2) : '—';
  };
  const splitTerms = (desc) => String(desc || '')
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(Boolean);
  return exports.template(
    title,
    section(
      div({ class: 'tags-header' },
        h2(title),
        safeQuery ? p({ class: 'ai-nav-query' }, `${i18n.aiNavQueryLabel || 'Query'}: "${safeQuery}"`) : null
      ),
      safeResults.length
        ? div({ class: 'ai-nav-results' },
            safeResults.map(r => div({ class: 'ai-nav-result-card card-section' },
              div({ class: 'card-field' },
                span({ class: 'card-label' }, `${(i18n.aiNavResultMatch || 'Match').toUpperCase()}: ${fmtScore(r.score)}`),
                span({ class: 'card-value' }, a({ href: r.path, class: 'filter-btn' }, r.path))
              )
            ))
          )
        : p(i18n.aiNavResultsEmpty || 'No matching routes. Try /search instead.')
    )
  );
};
exports.aiNavResultsView = aiNavResultsView;

const i18nBase = require("../client/assets/translations/i18n");
let selectedLanguage = "en";
let i18n = {};
Object.assign(i18n, i18nBase[selectedLanguage]);
exports.setLanguage = (language) => {
  selectedLanguage = language;
  const newLang = i18nBase[selectedLanguage] || i18nBase['en'];
  Object.keys(i18n).forEach(k => delete i18n[k]);
  Object.assign(i18n, newLang);
};
exports.i18n = i18n;
Object.defineProperty(exports, 'selectedLanguage', { get: () => selectedLanguage });

const opinionCategoriesList = require('../backend/opinion_categories');
const renderOpinionsVoting = (basePath, id, opinions, returnTo, voters) => {
  const ops = opinions || {};
  const total = Object.values(ops).reduce((s, n) => s + (Number(n) || 0), 0);
  const myId = (config.keys && config.keys.id) ? config.keys.id : '';
  const alreadyVoted = Array.isArray(voters) && myId ? voters.includes(myId) : false;
  return details({ class: 'opinions-voting-collapse' },
    summary({ class: 'opinions-summary' },
      `${i18n.opinionsTitle || 'Opinions'} (${total})`),
    div({ class: 'voting-buttons' },
      opinionCategoriesList.map((category) =>
        form({ method: 'POST', action: `${basePath}/${encodeURIComponent(id)}/${category}` },
          returnTo ? input({ type: 'hidden', name: 'returnTo', value: returnTo }) : null,
          button({ class: alreadyVoted ? 'vote-btn disabled' : 'vote-btn', type: 'submit', ...(alreadyVoted ? { disabled: true } : {}) },
            `${i18n['vote' + category.charAt(0).toUpperCase() + category.slice(1)] || category} [${ops[category] || 0}]`)
        )
      )
    ),
    alreadyVoted ? p({ class: 'muted' }, i18n.alreadyVoted) : null
  );
};
exports.renderOpinionsVoting = renderOpinionsVoting;

// markdown
const markdownUrl = "https://commonmark.org/help/";

const doctypeString = "<!DOCTYPE html>";

const THREAD_PREVIEW_LENGTH = 3;
const toAttributes = (obj) =>
  Object.entries(obj)
    .map(([key, val]) => `${key}=${val}`)
    .join(", ");
    
const nbsp = "\xa0";

const { getConfig } = require('../configs/config-manager.js');

// menu INIT
const readPkg = () => {
  const file = path.resolve(__dirname, "..", "server", "package.json");
  try {
    const txt = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(txt || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
};

const renderFooter = () => {
  const pkg = readPkg();
  const year = moment().format("YYYY");
  const pkgName = pkg?.name || "@krakenslab/oasis";
  const pkgVersion = pkg?.version || "?";

  const hcT = sharedState.getCarbonHcT();
  const hcH = sharedState.getCarbonHcH();

  const peersOnline = sharedState.getOnlinePeerCount ? sharedState.getOnlinePeerCount() : null;
  const inboxUnread = sharedState.getInboxUnreadCount ? sharedState.getInboxUnreadCount() : null;
  const lastSyncTs = sharedState.getLastSyncTs ? sharedState.getLastSyncTs() : null;
  const lastSyncLabel = lastSyncTs ? moment(lastSyncTs).fromNow() : '–';
  const lastActivity = sharedState.getLastActivity ? sharedState.getLastActivity() : null;

  return div(
    { class: "oasis-footer" },
    div(
      { class: "oasis-footer-center" },
      a(
        { href: "/", class: "oasis-footer-logo-link" },
        img({
          class: "oasis-footer-logo",
          src: "/assets/images/snh-oasis.jpg",
          alt: "Oasis"
        })
      ),
      (() => {
        const myId = (config.keys && config.keys.id) ? config.keys.id : '';
        if (!myId) return null;
        return [
          br(),
          a({ href: "/profile" }, span(myId))
        ];
      })(),
      br(),
      span({ class: "oasis-footer-carbon" },
        span("HcT: "),
        a({ href: "/stats?filter=ALL" }, hcT != null ? String(hcT) : '–'),
        span(" | HcH: "),
        a({ href: "/stats?filter=MINE" }, hcH != null ? String(hcH) : '–')
      ),
      br(),
      a(
        { href: "https://code.03c8.net/krakenslab/oasis", target: "_blank", rel: "noreferrer noopener" },
      span(pkgName),
      ),
      span("["),
         span({ class: "oasis-footer-version" }, pkgVersion),
      span("]"),
      br(),
      span(`${i18n.footerLicenseLabel || 'License'}: `),
      a(
        { href: "https://www.gnu.org/licenses/gpl-3.0.html", target: "_blank", rel: "noreferrer noopener" },
        i18n.footerLicense
      ),
      span({ class: "oasis-footer-sep" }, " - "),
      span({ class: "oasis-footer-year" }, year)
    )
  );
};

const navLink = ({ href, emoji, text, current, class: extraClass }) =>
  li(
    a(
      {
        href,
        class: [current ? "current" : "", extraClass]
          .filter(Boolean)
          .join(" ")
      },
      span({ class: "emoji" }, emoji),
      span({ class: "nav-text" }, text)
    )
  );

const customCSS = (filename) => {
  const customStyleFile = path.join(
    envPaths("oasis", { suffix: "" }).config,
    filename
  );
  try {
    if (fs.existsSync(customStyleFile)) {
      return link({ rel: "stylesheet", href: filename });
    }
  } catch (error) {
    return "";
  }
};

const navGroup = ({ id, emoji, title, defaultOpen = false }, ...items) => {
  const active = items.filter(Boolean);
  if (!active.length) return null;
  return li(
    { class: "oasis-nav-group" },
    input({
      type: "checkbox",
      id: `oasis-nav-group-${id}`,
      class: "oasis-nav-toggle",
      ...(defaultOpen ? { checked: true } : {})
    }),
    label(
      { for: `oasis-nav-group-${id}`, class: "oasis-nav-header" },
      span({ class: "emoji" }, emoji),
      span({ class: "nav-text" }, title),
      span({ class: "oasis-nav-arrow" }, "▾")
    ),
    ul({ class: "oasis-nav-list" }, ...active)
  );
};

const renderPopularLink = () => {
  const popularMod = getConfig().modules.popularMod === "on";
  return popularMod
    ? navLink({
        href: "/public/popular/day",
        emoji: "⌘",
        text: i18n.popular,
        class: "popular-link enabled"
      })
    : "";
};

const renderTopicsLink = () => {
  const topicsMod = getConfig().modules.topicsMod === "on";
  return topicsMod
    ? navLink({
        href: "/public/latest/topics",
        emoji: "ϟ",
        text: i18n.topics,
        class: "topics-link enabled"
      })
    : "";
};

const renderSummariesLink = () => {
  const summariesMod = getConfig().modules.summariesMod === "on";
  if (summariesMod) {
    return [
      navLink({
        href: "/public/latest/summaries",
        emoji: "※",
        text: i18n.summaries,
        class: "summaries-link enabled"
      })
    ];
  }
  return "";
};

const renderLatestLink = () => {
  const latestMod = getConfig().modules.latestMod === "on";
  return latestMod
    ? navLink({
        href: "/public/latest",
        emoji: "☄",
        text: i18n.latest,
        class: "latest-link enabled"
      })
    : "";
};

const renderThreadsLink = () => {
  const threadsMod = getConfig().modules.threadsMod === "on";
  if (threadsMod) {
    return [
      navLink({
        href: "/public/latest/threads",
        emoji: "♺",
        text: i18n.threads,
        class: "threads-link enabled"
      })
    ];
  }
  return "";
};

const renderInvitesLink = () => {
  const invitesMod = getConfig().modules.invitesMod === "on";
  return invitesMod
    ? navLink({
        href: "/invites",
        emoji: "ꔹ",
        text: i18n.invites,
        class: "invites-link enabled"
      })
    : "";
};

const renderWalletLink = () => {
  const walletMod = getConfig().modules.walletMod === "on";
  if (walletMod) {
    return [
      navLink({
        href: "/wallet",
        emoji: "❄",
        text: i18n.wallet,
        class: "wallet-link enabled"
      })
    ];
  }
  return "";
};

const renderLegacyLink = () => {
  const legacyMod = getConfig().modules.legacyMod === "on";
  if (legacyMod) {
    return [
      navLink({
        href: "/legacy",
        emoji: "ꖤ",
        text: i18n.legacy,
        class: "legacy-link enabled"
      })
    ];
  }
  return "";
};

const renderCipherLink = () => {
  const cipherMod = getConfig().modules.cipherMod === "on";
  if (cipherMod) {
    return [
      navLink({
        href: "/cipher",
        emoji: "ꗄ",
        text: i18n.cipher,
        class: "cipher-link enabled"
      })
    ];
  }
  return "";
};

const renderGraphosLink = () => {
  const graphosMod = getConfig().modules.graphosMod === "on";
  if (graphosMod) {
    return [
      navLink({
        href: "/graphos",
        emoji: "ꔯ",
        text: i18n.graphos,
        class: "graphos-link enabled"
      })
    ];
  }
  return "";
};

const renderBookmarksLink = () => {
  const bookmarksMod = getConfig().modules.bookmarksMod === "on";
  return bookmarksMod
    ? navLink({
        href: "/bookmarks",
        emoji: "ꔪ",
        text: i18n.bookmarksLabel,
        class: "bookmark-link enabled"
      })
    : "";
};

const renderImagesLink = () => {
  const imagesMod = getConfig().modules.imagesMod === "on";
  if (imagesMod) {
    return [
      navLink({
        href: "/images",
        emoji: "ꕥ",
        text: i18n.imagesLabel,
        class: "images-link enabled"
      })
    ];
  }
  return "";
};

const renderTorrentsLink = () => {
  const torrentsMod = getConfig().modules.torrentsMod === "on";
  if (torrentsMod) {
    return [
      navLink({
        href: "/torrents",
        emoji: "ꖅ",
        text: i18n.torrentsLabel,
        class: "torrents-link enabled"
      })
    ];
  }
  return "";
};

const renderMapsLink = () => {
  const mapsMod = getConfig().modules.mapsMod === "on";
  if (mapsMod) {
    return [
      navLink({
        href: "/maps",
        emoji: "ꔌ",
        text: i18n.mapsLabel,
        class: "maps-link enabled"
      })
    ];
  }
  return "";
};

const renderChatsLink = () => {
  const chatsMod = getConfig().modules.chatsMod === "on";
  if (chatsMod) {
    return [
      navLink({
        href: "/chats",
        emoji: "ꖒ",
        text: i18n.chatsTitle,
        class: "chats-link enabled"
      })
    ];
  }
  return "";
};

const renderVideosLink = () => {
  const videosMod = getConfig().modules.videosMod === "on";
  if (videosMod) {
    return [
      navLink({
        href: "/videos",
        emoji: "ꗟ",
        text: i18n.videosLabel,
        class: "videos-link enabled"
      })
    ];
  }
  return "";
};

const renderAudiosLink = () => {
  const audiosMod = getConfig().modules.audiosMod === "on";
  if (audiosMod) {
    return [
      navLink({
        href: "/audios",
        emoji: "ꔿ",
        text: i18n.audiosLabel,
        class: "audios-link enabled"
      })
    ];
  }
  return "";
};

const renderDocsLink = () => {
  const docsMod = getConfig().modules.docsMod === "on";
  if (docsMod) {
    return [
      navLink({
        href: "/documents",
        emoji: "ꕨ",
        text: i18n.docsLabel,
        class: "docs-link enabled"
      })
    ];
  }
  return "";
};

const renderTagsLink = () => {
  const tagsMod = getConfig().modules.tagsMod === "on";
  return tagsMod
    ? [
        navLink({
          href: "/tags",
          emoji: "ꖶ",
          text: i18n.tagsLabel,
          class: "tags-link enabled"
        })
      ]
    : "";
};

const renderMultiverseLink = () => {
  const multiverseMod = getConfig().modules.multiverseMod === "on";
  return multiverseMod
    ? navLink({
        href: "/public/latest/extended",
        emoji: "∞",
        text: i18n.multiverse,
        class: "multiverse-link enabled"
      })
    : "";
};

const renderMastodonLink = () => {
  const fediverseMod = getConfig().modules.fediverseMod === "on";
  return fediverseMod
    ? navLink({
        href: "/fediverse",
        emoji: "ꗵ",
        text: i18n.fediverseTimeline
      })
    : "";
};

const renderMarketLink = () => {
  const marketMod = getConfig().modules.marketMod === "on";
  return marketMod
    ? [
        navLink({
          href: "/market",
          emoji: "ꕻ",
          text: i18n.marketTitle
        })
      ]
    : "";
};

const renderJobsLink = () => {
  const jobsMod = getConfig().modules.jobsMod === "on";
  return jobsMod
    ? [
        navLink({
          href: "/jobs",
          emoji: "ꗒ",
          text: i18n.jobsTitle
        })
      ]
    : "";
};

const renderShopsLink = () => {
  const shopsMod = getConfig().modules.shopsMod === "on";
  return shopsMod
    ? [
        navLink({
          href: "/shops",
          emoji: "ꔜ",
          text: i18n.shopsTitle
        })
      ]
    : "";
};

const renderProjectsLink = () => {
  const projectsMod = getConfig().modules.projectsMod === "on";
  return projectsMod
    ? [
        navLink({
          href: "/projects",
          emoji: "ꕧ",
          text: i18n.projectsTitle
        })
      ]
    : "";
};

const renderBankingLink = () => {
  const bankingMod = getConfig().modules.bankingMod === "on";
  return bankingMod
    ? navLink({
        href: "/banking",
        emoji: "ꗴ",
        text: i18n.bankingTitle
      })
    : "";
};

const renderTribesLink = () => {
  const tribesMod = getConfig().modules.tribesMod === "on";
  return tribesMod
    ? [
        navLink({
          href: "/tribes",
          emoji: "ꖥ",
          text: i18n.tribesTitle,
          class: "tribes-link enabled"
        })
      ]
    : "";
};

const renderLarpLink = () => {
  const larpMod = getConfig().modules.larpMod === "on";
  return larpMod
    ? [
        navLink({
          href: "/larp",
          emoji: "✦",
          text: i18n.larpTitle || "L.A.R.P.",
          class: "larp-link enabled"
        })
      ]
    : "";
};

const renderParliamentLink = () => {
  const parliamentMod = getConfig().modules.parliamentMod === "on";
  return parliamentMod
    ? [
        navLink({
          href: "/parliament",
          emoji: "ꗞ",
          text: i18n.parliamentTitle,
          class: "parliament-link enabled"
        })
      ]
    : "";
};

const renderCourtsLink = () => {
  const courtsMod = getConfig().modules.courtsMod === "on";
  return courtsMod
    ? navLink({
        href: "/courts",
        emoji: "ꖻ",
        text: i18n.courtsTitle,
        class: "courts-link enabled"
      })
    : "";
};

const renderVotationsLink = () => {
  const votesMod = getConfig().modules.votesMod === "on";
  return votesMod
    ? [
        navLink({
          href: "/votes",
          emoji: "ꔰ",
          text: i18n.votationsTitle,
          class: "votations-link enabled"
        })
      ]
    : "";
};

const renderTrendingLink = () => {
  const trendingMod = getConfig().modules.trendingMod === "on";
  return trendingMod
    ? [
        navLink({
          href: "/trending",
          emoji: "ꗝ",
          text: i18n.trendingLabel,
          class: "trending-link enabled"
        })
      ]
    : "";
};

const renderReportsLink = () => {
  const reportsMod = getConfig().modules.reportsMod === "on";
  return reportsMod
    ? [
        navLink({
          href: "/reports",
          emoji: "ꕥ",
          text: i18n.reportsTitle,
          class: "reports-link enabled"
        })
      ]
    : "";
};

const renderOpinionsLink = () => {
  const opinionsMod = getConfig().modules.opinionsMod === "on";
  return opinionsMod
    ? [
        navLink({
          href: "/opinions",
          emoji: "ꔍ",
          text: i18n.opinionsTitle,
          class: "opinions-link enabled"
        })
      ]
    : "";
};

const renderPadsLink = () => {
  const padsMod = getConfig().modules.padsMod === "on";
  return padsMod
    ? [
        navLink({
          href: "/pads",
          emoji: "ꔗ",
          text: i18n.padsTitle,
          class: "pads-link enabled"
        })
      ]
    : "";
};

const renderTransfersLink = () => {
  const transfersMod = getConfig().modules.transfersMod === "on";
  return transfersMod
    ? [
        navLink({
          href: "/transfers",
          emoji: "ꘉ",
          text: i18n.transfersTitle,
          class: "transfers-link enabled"
        })
      ]
    : "";
};

const renderFeedLink = () => {
  const feedMod = getConfig().modules.feedMod === "on";
  return feedMod
    ? navLink({
        href: "/feed",
        emoji: "ꕿ",
        text: i18n.feedTitle,
        class: "feed-link enabled"
      })
    : "";
};

const renderPixeliaLink = () => {
  const pixeliaMod = getConfig().modules.pixeliaMod === "on";
  return pixeliaMod
    ? [
        navLink({
          href: "/pixelia",
          emoji: "ꔘ",
          text: i18n.pixeliaTitle,
          class: "pixelia-link enabled"
        })
      ]
    : "";
};

const renderMelodyLink = () => {
  const melodyMod = getConfig().modules.melodyMod === "on";
  return melodyMod
    ? [
        navLink({
          href: "/melody",
          emoji: "♪",
          text: i18n.melodyTitle,
          class: "melody-link enabled"
        })
      ]
    : "";
};

const renderGamesLink = () => {
  const gamesMod = getConfig().modules.gamesMod === "on";
  return gamesMod
    ? [navLink({ href: "/games", emoji: "ꕇ", text: i18n.gamesTitle, class: "games-link enabled" })]
    : "";
};

const renderForumLink = () => {
  const forumMod = getConfig().modules.forumMod === "on";
  return forumMod
    ? [
        navLink({
          href: "/forum",
          emoji: "ꕒ",
          text: i18n.forumTitle,
          class: "forum-link enabled"
        })
      ]
    : "";
};

const renderAgendaLink = () => {
  const agendaMod = getConfig().modules.agendaMod === "on";
  return agendaMod
    ? [
        navLink({
          href: "/agenda",
          emoji: "ꗤ",
          text: i18n.agendaTitle,
          class: "agenda-link enabled"
        })
      ]
    : "";
};

const renderFavoritesLink = () => {
  const favoritesMod = getConfig().modules.favoritesMod === "on";
  return favoritesMod
    ? [
        navLink({
          href: "/favorites",
          emoji: "ꘝ",
          text: i18n.favoritesTitle,
          class: "favorites-link enabled"
        })
      ]
    : "";
};

const renderLogsLink = () => {
  const logsMod = getConfig().modules.logsMod === "on";
  return logsMod
    ? [
        navLink({
          href: "/logs",
          emoji: "ꗯ",
          text: i18n.logsTitle || "Logs",
          class: "logs-link enabled"
        })
      ]
    : "";
};

const renderAILink = () => {
  const aiMod = getConfig().modules.aiMod === "on";
  return aiMod
    ? [
        navLink({
          href: "/ai",
          emoji: "ꘜ",
          text: i18n.ai,
          class: "ai-link enabled"
        })
      ]
    : "";
};

const renderEventsLink = () => {
  const eventsMod = getConfig().modules.eventsMod === "on";
  return eventsMod
    ? [
        navLink({
          href: "/events",
          emoji: "ꕆ",
          text: i18n.eventsLabel,
          class: "events-link enabled"
        })
      ]
    : "";
};

const renderCalendarsLink = () => {
  const calendarsMod = getConfig().modules.calendarsMod === "on";
  return calendarsMod
    ? [
        navLink({
          href: "/calendars",
          emoji: "\uA5AF",
          text: i18n.calendarsTitle || "Calendars",
          class: "calendars-link enabled"
        })
      ]
    : "";
};

const renderTasksLink = () => {
  const tasksMod = getConfig().modules.tasksMod === "on";
  return tasksMod
    ? [
        navLink({
          href: "/tasks",
          emoji: "ꖧ",
          text: i18n.tasksTitle,
          class: "tasks-link enabled"
        })
      ]
    : "";
};

const template = (titlePrefix, ...elements) => {
  const currentConfig = getConfig();
  const theme = currentConfig.themes.current || "Dark-SNH";
  const uxMode = currentConfig.ux?.current === "ainav" ? "ainav" : "blocks";
  const themeLink = link({
    rel: "stylesheet",
    href: `/assets/themes/${theme}.css`
  });
  const nodes = html(
    { lang: "en" },
    head(
      title(titlePrefix, " | Oasis"),
      link({ rel: "stylesheet", href: "/assets/styles/style.css" }),
      themeLink,
      link({ rel: "stylesheet", href: "/assets/styles/mobile.css", media: "(max-width: 768px)" }),
      link({ rel: "icon", href: "/assets/images/favicon.svg" }),
      meta({ charset: "utf-8" }),
      meta({ name: "description", content: i18n.oasisDescription }),
      meta({
        name: "viewport",
        content: toAttributes({
          width: "device-width",
          "initial-scale": 1
        })
      })
    ),
    body(
      div(
        { class: uxMode === "ainav" ? "header ainav-only" : "header" },
        div(
          { class: "top-bar-left" },
          a(
            { class: "logo-icon", href: "/" },
            img({
              class: "logo-icon",
              src: "/assets/images/snh-oasis.jpg",
              alt: "Oasis Logo"
            })
          ),
          uxMode === "ainav" ? nav(
            ul(
              (() => {
                const inboxCount = sharedState.getInboxCount();
                const badge = inboxCount > 0 ? span({ class: 'inbox-badge' }, String(inboxCount)) : '';
                return li(
                  a({ href: "/inbox" },
                    span({ class: "emoji" }, "☂"), nbsp, i18n.inbox, badge
                  )
                );
              })(),
              navLink({ href: "/settings", emoji: "⚙", text: i18n.settings }),
              navLink({ href: "/invites", emoji: "ꔮ", text: i18n.invites })
            )
          ) : nav(
            ul(
              (() => {
                const inboxCount = sharedState.getInboxCount();
                const badge = inboxCount > 0 ? span({ class: 'inbox-badge' }, String(inboxCount)) : '';
                return li(
                  a({ href: "/inbox" },
                    span({ class: "emoji" }, "☂"), nbsp, i18n.inbox, badge
                  )
                );
              })(),
              navLink({
                href: "/pm",
                emoji: "ꕕ",
                text: i18n.privateMessage
              }),
              navLink({ href: "/publish", emoji: "❂", text: i18n.publish })
            )
          )
        ),
        (() => {
          const aiNavOn = getConfig().modules.aiNavMod === 'on';
          if (!aiNavOn && uxMode !== 'ainav') return null;
          return div(
            { class: uxMode === 'ainav' ? "top-bar-center top-bar-center-ainav" : "top-bar-center" },
            form(
              { method: 'POST', action: '/ai/ask', class: 'ai-ask-form' },
              input({
                type: 'text',
                name: 'q',
                class: 'ai-ask-input',
                placeholder: i18n.aiNavPlaceholder || 'Where do you want to go?',
                autocomplete: 'off',
                maxlength: '300',
                autofocus: uxMode === 'ainav' ? 'autofocus' : undefined
              }),
              button({ type: 'submit', class: 'ai-ask-btn' }, '➤')
            )
          );
        })(),
        uxMode === "ainav" ? div(
          { class: "top-bar-right" },
          nav(
            ul(
              navLink({ href: "/activity", emoji: "ꔙ", text: i18n.activityTitle }),
              navLink({ href: "/graphos", emoji: "ꕢ", text: i18n.graphos }),
              navLink({ href: "/peers", emoji: "⧖", text: i18n.peers })
            )
          )
        ) : div(
          { class: "top-bar-right" },
          nav(
            ul(
              navLink({ href: "/search", emoji: "ꔅ", text: i18n.searchTitle }),
              renderGraphosLink(),
              navLink({ href: "/peers", emoji: "⧖", text: i18n.peers })
            )
          )
        )
      ),
      (() => {
        const updateFlagPath = path.join(__dirname, '../server/.update_required');
        if (fs.existsSync(updateFlagPath)) {
          return div(
            { class: "update-banner" },
            span({ class: "update-banner-icon" }, "⟳"),
            span({ class: "update-banner-text" }, i18n.updateBannerText),
            a({ href: "/settings", class: "update-banner-link" }, i18n.updateBannerAction)
          );
        }
        return null;
      })(),
      div(
        { class: uxMode === "ainav" ? "main-content ainav-only" : "main-content" },
        uxMode === "ainav" ? null : div(
          { class: "sidebar-left" },
          nav(
            ul(
              navGroup(
                {
                  id: "personal",
                  emoji: "⚉",
                  title: i18n.menuPersonal
                },
                navLink({
                  href: "/profile",
                  emoji: "⚉",
                  text: i18n.profile
                }),
                navLink({
                  href: "/cv",
                  emoji: "ꕛ",
                  text: i18n.cvTitle
                }),
                renderAgendaLink(),
                renderFavoritesLink(),
                renderLogsLink(),
                renderWalletLink(),
                navLink({
                  href: "/modules",
                  emoji: "ꗣ",
                  text: i18n.modules
                }),
                navLink({
                  href: "/settings",
                  emoji: "⚙",
                  text: i18n.settings
                })
              ),
              navGroup(
                {
                  id: "governance",
                  emoji: "⚖",
                  title: i18n.menuGovernance
                },
                navLink({
                  href: "/inhabitants",
                  emoji: "ꖘ",
                  text: i18n.inhabitantsLabel
                }),
                renderTribesLink(),
                renderLarpLink(),
                renderParliamentLink(),
                renderCourtsLink()
              ),
              navGroup(
                {
                  id: "office",
                  emoji: "⌂",
                  title: i18n.menuOffice
                },
                renderVotationsLink(),
                renderEventsLink(),
                renderCalendarsLink(),
                renderTasksLink(),
                renderReportsLink()
              ),
              navGroup(
                {
                  id: "economy",
                  emoji: "¤",
                  title: i18n.menuEconomy
                },
                renderBankingLink(),
                renderMarketLink(),
                renderProjectsLink(),
                renderJobsLink(),
                renderShopsLink(),
                renderTransfersLink()
              ),
              navGroup(
                {
                  id: "tools",
                  emoji: "⚒",
                  title: i18n.menuTools
                },
                renderAILink(),
                navLink({
                  href: "/blockexplorer",
                  emoji: "ꖸ",
                  text: i18n.blockchain
                }),
                renderCipherLink(),
                renderInvitesLink(),
                renderLegacyLink(),
                navLink({
                  href: "/stats",
                  emoji: "ꕷ",
                  text: i18n.statistics
                })
              )
            )
          )
        ),
        main({ id: "content", class: "main-column" }, elements),
        uxMode === "ainav" ? null : div(
          { class: "sidebar-right" },
          nav(
            ul(
              navGroup(
                {
                  id: "network",
                  emoji: "☍",
                  title: i18n.menuNetwork
                },
                navLink({
                  href: "/activity",
                  emoji: "ꔙ",
                  text: i18n.activityTitle
                }),
                renderTagsLink(),
                renderTrendingLink(),
                renderOpinionsLink(),
                renderPadsLink(),
                renderForumLink(),
                renderMapsLink(),
                renderChatsLink()
              ),
              navGroup(
                {
                  id: "blogs",
                  emoji: "✦",
                  title: i18n.menuBlogs
                },
                navLink({
                  href: "/mentions",
                  emoji: "✺",
                  text: i18n.mentions
                }),
                renderLatestLink(),
                renderThreadsLink(),
                renderTopicsLink(),
                renderSummariesLink(),
                renderPopularLink(),
                renderMultiverseLink()
              ),
              navGroup(
                {
                  id: "creative",
                  emoji: "✎",
                  title: i18n.menuCreative
                },
                renderFeedLink(),
                renderGamesLink(),
                renderPixeliaLink(),
                renderMelodyLink()
              ),
              navGroup(
                {
                  id: "media",
                  emoji: "▤",
                  title: i18n.menuMedia
                },
                renderAudiosLink(),
                renderBookmarksLink(),
                renderDocsLink(),
                renderImagesLink(),
                renderTorrentsLink(),
                renderVideosLink()
              ),
              navGroup(
                {
                  id: "fediverse",
                  emoji: "⌬",
                  title: i18n.fediverse
                },
                renderMastodonLink()
              )
            )
          )
        )
      ),
    renderFooter()
    )
  );
  return doctypeString + nodes.outerHTML;
};
// menu END

exports.template = template;

exports.ainavHomeView = ({ recentTags = [] } = {}) => {
  const currentConfig = getConfig();
  const theme = currentConfig.themes.current || "Dark-SNH";
  const placeholder = i18n.aiNavPlaceholder || 'Where do you want to go?';
  const nodes = html(
    { lang: "en" },
    head(
      title(placeholder, " | Oasis"),
      link({ rel: "stylesheet", href: "/assets/styles/style.css" }),
      link({ rel: "stylesheet", href: `/assets/themes/${theme}.css` }),
      link({ rel: "stylesheet", href: "/assets/styles/mobile.css", media: "(max-width: 768px)" }),
      link({ rel: "icon", href: "/assets/images/favicon.svg" }),
      meta({ charset: "utf-8" }),
      meta({ name: "description", content: i18n.oasisDescription }),
      meta({ name: "viewport", content: toAttributes({ width: "device-width", "initial-scale": 1 }) })
    ),
    body(
      div({ class: "ainav-landing" },
        div({ class: "ainav-landing-topbar" },
          div({ class: "top-bar-left" },
            nav(
              ul(
                (() => {
                  const inboxCount = sharedState.getInboxCount();
                  const badge = inboxCount > 0 ? span({ class: 'inbox-badge' }, String(inboxCount)) : '';
                  return li(
                    a({ href: "/inbox" },
                      span({ class: "emoji" }, "☂"), nbsp, i18n.inbox, badge
                    )
                  );
                })(),
                navLink({ href: "/settings", emoji: "⚙", text: i18n.settings }),
                navLink({ href: "/invites", emoji: "ꔮ", text: i18n.invites })
              )
            )
          ),
          div({ class: "top-bar-right" },
            nav(
              ul(
                navLink({ href: "/activity", emoji: "ꔙ", text: i18n.activityTitle }),
                navLink({ href: "/graphos", emoji: "ꕢ", text: i18n.graphos }),
                navLink({ href: "/peers", emoji: "⧖", text: i18n.peers })
              )
            )
          )
        ),
        div({ class: "ainav-landing-center" },
          a({ href: "/", class: "ainav-landing-logo" },
            img({ src: "/assets/images/snh-oasis.jpg", alt: "Oasis Logo" })
          ),
          (() => {
            const myId = (config.keys && config.keys.id) ? config.keys.id : '';
            return myId ? div({ class: 'ainav-landing-myid oasis-footer-center' },
              a({ href: '/profile' }, span(myId))
            ) : null;
          })(),
          form(
            { method: 'POST', action: '/ai/ask', class: 'ai-ask-form ainav-landing-form' },
            input({
              type: 'text',
              name: 'q',
              class: 'ai-ask-input ainav-landing-input',
              placeholder,
              autocomplete: 'off',
              maxlength: '300',
              autofocus: 'autofocus'
            }),
            button({ type: 'submit', class: 'ai-ask-btn ainav-landing-btn' }, '➤')
          ),
          Array.isArray(recentTags) && recentTags.length
            ? div({ class: 'ainav-landing-tags' },
                recentTags.map(t => a({
                  href: `/search?query=%23${encodeURIComponent(t.name || t)}`,
                  class: 'tag-link'
                }, `#${t.name || t}`))
              )
            : null
        )
      )
    )
  );
  return doctypeString + nodes.outerHTML;
};

exports.tribeAccessDeniedView = (tribe) => {
  const tribeName = tribe && !tribe.isAnonymous ? tribe.title : "";
  return template(
    i18n.tribeContentAccessDenied,
    div({ class: "div-center" },
      h2(i18n.tribeContentAccessDenied),
      p(i18n.tribeContentAccessDeniedMsg),
      tribeName ? p({ class: "tribe-access-name" }, tribeName) : null,
      div({ class: "visit-btn-centered" },
        a({ href: "/tribes", class: "filter-btn" }, i18n.tribeViewTribes)
      )
    )
  );
};

exports.inviteRequiredView = (kind, tribe) => {
  const msg = kind === 'pad' ? (i18n.tribePadInviteRequired || 'You do not have access to the pad. Ask for an invitation to access the content.')
            : kind === 'chat' ? (i18n.tribeChatInviteRequired || 'You do not have access to the chat. Ask for an invitation to access the content.')
            : (i18n.tribeContentAccessDeniedMsg);
  const backHref = tribe ? `/tribe/${encodeURIComponent(tribe.id)}?section=${kind === 'chat' ? 'chats' : 'pads'}` : (kind === 'chat' ? '/chats' : '/pads');
  return template(
    i18n.tribeContentAccessDenied,
    div({ class: "div-center" },
      h2(i18n.tribeContentAccessDenied),
      p(msg),
      div({ class: "visit-btn-centered" },
        a({ href: backHref, class: "filter-btn" }, i18n.walletBack || "Back")
      )
    )
  );
};

const thread = (messages, spreadMap = null) => {
  let lookingForTarget = true;
  let shallowest = Infinity;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const depth = lodash.get(msg, "value.meta.thread.depth", 0);

    if (lookingForTarget) {
      const isThreadTarget = Boolean(
        lodash.get(msg, "value.meta.thread.target", false)
      );
      if (isThreadTarget) {
        lookingForTarget = false;
      }
    } else {
      if (depth < shallowest) {
        lodash.set(msg, "value.meta.thread.ancestorOfTarget", true);
        shallowest = depth;
      }
    }
  }

  const getSpread = (key) => (spreadMap instanceof Map ? spreadMap.get(key) : null) || null;

  const msgList = [];
  for (let i = 0; i < messages.length; i++) {
    const j = i + 1;
    const currentMsg = messages[i];
    const nextMsg = messages[j];

    const depth = (msg) => {
      if (msg === undefined) return 0;
      return lodash.get(msg, "value.meta.thread.depth", 0);
    };

    msgList.push(post({ msg: currentMsg, spreadInfo: getSpread(currentMsg.key) }));

    if (depth(currentMsg) < depth(nextMsg)) {
      const isAncestor = Boolean(
        lodash.get(currentMsg, "value.meta.thread.ancestorOfTarget", false)
      );
      const isBlocked = Boolean(nextMsg.value.meta.blocking);
      const nextAuthor = lodash.get(nextMsg, "value.meta.author.name") || (typeof nextMsg?.value?.author === "string" ? (nextMsg.value.author.startsWith("@") ? nextMsg.value.author.slice(1) : nextMsg.value.author) : "Anonymous");
      const nextSnippet = postSnippet(
        lodash.has(nextMsg, "value.content.contentWarning")
          ? lodash.get(nextMsg, "value.content.contentWarning")
          : lodash.get(nextMsg, "value.content.text")
      );
      msgList.push(
        details(
          isAncestor ? { open: true } : {},
          summary(
            isBlocked
              ? i18n.relationshipBlockingPost
              : `${nextAuthor}: ${nextSnippet}`
          )
        )
      );
    } else if (depth(currentMsg) > depth(nextMsg)) {
      const diffDepth = depth(currentMsg) - depth(nextMsg);
    }
  }

  return div({ class: "thread-container" }, ...msgList);
};

const postSnippet = (text) => {
  const max = 40;

  text = text.trim().split("\n", 3).join("\n");
  text = text.replace(/_|`|\*|#|^\[@.*?]|\[|]|\(\S*?\)/g, "").trim();
  text = text.replace(/:$/, "");
  text = text.trim().split("\n", 1)[0].trim();

  if (text.length > max) {
    text = text.substring(0, max - 1) + "…";
  }

  return text;
};

const continueThreadComponent = (thread, isComment) => {
  const encoded = {
    next: encodeURIComponent(thread[THREAD_PREVIEW_LENGTH + 1].key),
    parent: encodeURIComponent(thread[0].key),
  };
  const left = thread.length - (THREAD_PREVIEW_LENGTH + 1);
  let continueLink;
  if (isComment == false) {
    continueLink = `/thread/${encoded.parent}#${encoded.next}`;
    return a(
      { href: continueLink },
      i18n.continueReading, ` ${left} `, i18n.moreComments+`${left === 1 ? "" : "s"}`
    );
  } else {
    continueLink = `/thread/${encoded.parent}`;
    return a({ href: continueLink }, i18n.readThread);
  }
};

const postAside = ({ key, value }) => {
  const thread = value.meta.thread;
  if (thread == null) return null;

  const isComment = value.meta.postType === "comment";

  let postsToShow;
  if (isComment) {
    const commentPosition = thread.findIndex((msg) => msg.key === key);
    postsToShow = thread.slice(
      commentPosition + 1,
      Math.min(commentPosition + (THREAD_PREVIEW_LENGTH + 1), thread.length)
    );
  } else {
    postsToShow = thread.slice(
      1,
      Math.min(thread.length, THREAD_PREVIEW_LENGTH + 1)
    );
  }

  const fragments = postsToShow.map((p) => post({ msg: p }));

  if (thread.length > THREAD_PREVIEW_LENGTH + 1) {
    fragments.push(section(continueThreadComponent(thread, isComment)));
  }

  return fragments;
};

const post = ({ msg, aside = false, preview = false, spreadInfo = null }) => {
    const encoded = {
        key: encodeURIComponent(msg.key),
        author: encodeURIComponent(msg.value?.author),
        parent: encodeURIComponent(msg.value?.content?.root),
    };

    const url = {
        author: `/author/${encoded.author}`,
        spreadForm: `/spread/${encoded.key}`,
        link: `/thread/${encoded.key}#${encoded.key}`,
        parent: `/thread/${encoded.parent}#${encoded.parent}`,
        avatar: msg.value?.meta?.author?.avatar?.url || '/assets/images/default-avatar.png',
        json: `/json/${encoded.key}`,
        subtopic: `/subtopic/${encoded.key}`,
        comment: `/comment/${encoded.key}`,
    };

    const isPrivate = Boolean(msg.value?.meta?.private);
    const isBlocked = Boolean(msg.value?.meta?.blocking);
    const isRoot = msg.value?.content?.root == null;
    const isFork = msg.value?.meta?.postType === "subtopic";
    const hasContentWarning = typeof msg.value?.content?.contentWarning === "string";
    const isThreadTarget = Boolean(lodash.get(msg, "value.meta.thread.target", false));

    const authorIdForName = msg.value?.author; 
    const name =
      msg.value?.meta?.author?.name ||
      (typeof authorIdForName === "string"
        ? (authorIdForName.startsWith("@") ? authorIdForName.slice(1) : authorIdForName)
        : "Anonymous");

    const content = msg.value?.content || {};
    const contentType = String(content.type || "");

    const THREAD_ENTITY_TYPES = new Set([
        'bookmark',
        'image',
        'audio',
        'video',
        'document',
        'votes',
        'event',
        'task',
        'report',
        'market',
        'project',
        'job'
    ]);

    const safeUpper = (s) => String(s || '').toUpperCase();
    const safeStr = (v) => (v == null ? '' : String(v));
    const isMsgId = (s) => typeof s === 'string' && (s.startsWith('%') || s.startsWith('&') || s.startsWith('@'));
    const fmtDate = (v) => {
        if (!v) return '';
        const m = moment(v, moment.ISO_8601, true);
        if (m.isValid()) return m.format('YYYY-MM-DD HH:mm:ss');
        const n = typeof v === 'number' ? v : Date.parse(v);
        if (!Number.isFinite(n)) return '';
        return moment(n).format('YYYY-MM-DD HH:mm:ss');
    };

    const renderField = (labelText, valueNode) => {
        if (valueNode == null || valueNode === '') return null;
        return div(
            { class: 'card-field' },
            span({ class: 'card-label' }, labelText),
            span({ class: 'card-value' }, valueNode)
        );
    };

    const entityTitle = (c) => {
        const t = String(c.type || '').toLowerCase();
        if (t === 'votes') return safeStr(c.question || c.title);
        if (t === 'bookmark') return safeStr(c.title || c.name || c.url);
        if (t === 'market') return safeStr(c.title);
        if (t === 'project') return safeStr(c.title);
        if (t === 'job') return safeStr(c.title);
        if (t === 'report') return safeStr(c.title);
        if (t === 'task') return safeStr(c.title);
        if (t === 'event') return safeStr(c.title);
        if (t === 'document') return safeStr(c.title || c.name || c.url);
        if (t === 'image' || t === 'audio' || t === 'video') return safeStr(c.title || c.name || c.url);
        return safeStr(c.title || c.name || c.question || c.url);
    };

    const renderEntityRoot = (c) => {
        const t = String(c.type || '').toLowerCase();
        const header = `[${safeUpper(t)}]`;
        const titleText = entityTitle(c) || '(sin título)';

        const nodes = [];
        nodes.push(
            div(
                { class: 'card-field card-field-mb' },
                span({ class: 'card-label card-label-bold' }, header),
                span({ class: 'card-value card-value-bold' }, titleText)
            )
        );

        if (t === 'votes') {
            const status = safeStr(c.status);
            const deadline = fmtDate(c.deadline);
            const totalVotes = (typeof c.totalVotes !== 'undefined') ? safeStr(c.totalVotes) : '';
            const tags = Array.isArray(c.tags) ? c.tags.filter(Boolean) : [];

            const f1 = renderField((i18n.status || 'Status') + ':', status ? safeUpper(status) : '');
            const f2 = renderField((i18n.deadline || 'Deadline') + ':', deadline);
            const f3 = renderField((i18n.voteTotalVotes || 'Total votes') + ':', totalVotes);
            if (f1) nodes.push(f1);
            if (f2) nodes.push(f2);
            if (f3) nodes.push(f3);

            if (tags.length) {
                nodes.push(
                    div(
                        { class: 'card-tags card-tags-mt' },
                        ...tags.map(tag =>
                            a(
                                { href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' },
                                `#${tag}`
                            )
                        )
                    )
                );
            }
        } else if (t === 'report') {
            const status = safeStr(c.status);
            const severity = safeStr(c.severity);
            const r1 = renderField((i18n.status || 'Status') + ':', status ? safeUpper(status) : '');
            const r2 = renderField((i18n.severity || 'Severity') + ':', severity ? safeUpper(severity) : '');
            if (r1) nodes.push(r1);
            if (r2) nodes.push(r2);
        } else if (t === 'task') {
            const status = safeStr(c.status);
            const priority = safeStr(c.priority);
            const startTime = fmtDate(c.startTime);
            const endTime = fmtDate(c.endTime);

            const r1 = renderField((i18n.status || 'Status') + ':', status ? safeUpper(status) : '');
            const r2 = renderField((i18n.priority || 'Priority') + ':', priority ? safeUpper(priority) : '');
            const r3 = renderField((i18n.taskStartTimeLabel || 'Start') + ':', startTime);
            const r4 = renderField((i18n.taskEndTimeLabel || 'End') + ':', endTime);

            if (r1) nodes.push(r1);
            if (r2) nodes.push(r2);
            if (r3) nodes.push(r3);
            if (r4) nodes.push(r4);
        } else if (t === 'event') {
            const dateStr = fmtDate(c.date);
            const location = safeStr(c.location);
            const price = (typeof c.price !== 'undefined') ? safeStr(c.price) : '';

            const r1 = renderField((i18n.date || 'Date') + ':', dateStr);
            const r2 = renderField((i18n.location || 'Location') + ':', location);
            const r3 = renderField((i18n.price || 'Price') + ':', price ? `${price} ECO` : '');

            if (r1) nodes.push(r1);
            if (r2) nodes.push(r2);
            if (r3) nodes.push(r3);
        } else if (t === 'bookmark') {
            const u = safeStr(c.url);
            if (u) {
                nodes.push(
                    renderField((i18n.url || 'URL') + ':', a({ href: u, target: '_blank', rel: 'noopener noreferrer' }, u))
                );
            }
        } else if (t === 'image') {
            const u = safeStr(c.url);
            if (u && isMsgId(u)) {
                nodes.push(
                    div({ class: 'card-field card-field-mt' },
                        img({ src: `/blob/${encodeURIComponent(u)}`, class: 'feed-image img-content' })
                    )
                );
            }
        } else if (t === 'audio') {
            const u = safeStr(c.url);
            if (u && isMsgId(u)) {
                nodes.push(
                    div({ class: 'card-field card-field-mt' },
                        audioHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(u)}` })
                    )
                );
            }
        } else if (t === 'video') {
            const u = safeStr(c.url);
            if (u && isMsgId(u)) {
                nodes.push(
                    div({ class: 'card-field card-field-mt' },
                        videoHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(u)}` })
                    )
                );
            }
	} else if (t === 'document') {
	  const u = safeStr(c.url);
	  if (u && isMsgId(u)) {
	    const safeId = String(msg.key || u).replace(/[^a-zA-Z0-9_-]/g, '');
	    nodes.push(
	      div({ class: 'card-field card-field-mt' },
		div({
		  id: `pdf-container-${safeId}`,
		  class: 'pdf-viewer-container',
		  'data-pdf-url': `/blob/${encodeURIComponent(u)}`
		})
	      )
	    );
	  }

        } else if (t === 'market') {
            const status = safeStr(c.status);
            const price = (typeof c.price !== 'undefined') ? safeStr(c.price) : '';
            const r1 = renderField((i18n.status || 'Status') + ':', status ? safeUpper(status) : '');
            const r2 = renderField((i18n.price || 'Price') + ':', price ? `${price} ECO` : '');
            if (r1) nodes.push(r1);
            if (r2) nodes.push(r2);
        } else if (t === 'project') {
            const status = safeStr(c.status);
            const r1 = renderField((i18n.status || 'Status') + ':', status ? safeUpper(status) : '');
            if (r1) nodes.push(r1);
        } else if (t === 'job') {
            const status = safeStr(c.status);
            const location = safeStr(c.location);
            const salary = (typeof c.salary !== 'undefined') ? safeStr(c.salary) : '';

            const r1 = renderField((i18n.status || 'Status') + ':', status ? safeUpper(status) : '');
            const r2 = renderField((i18n.jobLocation || 'Location') + ':', location ? safeUpper(location) : '');
            const r3 = renderField((i18n.jobSalary || 'Salary') + ':', salary ? `${salary} ECO` : '');

            if (r1) nodes.push(r1);
            if (r2) nodes.push(r2);
            if (r3) nodes.push(r3);
        }

        return article({ class: 'content' }, ...nodes.filter(Boolean));
    };

    const rawText = content.text || "";
    const emptyContent = "<p>undefined</p>\n";

    const isProbablyHtml =
        typeof rawText === "string" &&
        /<\/?[a-z][\s\S]*>/i.test(rawText.trim());

    let articleElement;

    if (contentType !== 'post' && contentType !== 'blog' && THREAD_ENTITY_TYPES.has(contentType)) {
        articleElement = renderEntityRoot(content);
    } else if (rawText === emptyContent) {
        articleElement = article(
            { class: "content" },
            div(
                { class: "card-field card-field-mb" },
                span({ class: "card-label" }, (i18n.invalidPost || 'Invalid content') + ':'),
                span({ class: "card-value" }, (i18n.invalidPostHint || 'This message has invalid/empty text.'))
            ),
            details(
                summary(i18n.viewJson || 'View JSON'),
                pre({
                    innerHTML: highlightJs.highlight(
                        JSON.stringify(msg, null, 2),
                        { language: "json", ignoreIllegals: true }
                    ).value,
                })
            )
        );
    } else if (isProbablyHtml) {
        let html = rawText;
        if (!/<a\b[^>]*>/i.test(html)) {
            html = html.replace(
                /(https?:\/\/[^\s<]+)/g,
                (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`
            );
        }
        articleElement = article({ class: "content", innerHTML: sanitizeHtml(html) });
    } else {
        articleElement = article(
            { class: "content" },
            p({ class: "post-text" }, ...renderUrl(rawText))
        );
    }

    if (preview) {
        return section(
            { id: msg.key, class: "post-preview" },
            hasContentWarning
                ? details(summary(msg.value?.content?.contentWarning), articleElement)
                : articleElement
        );
    }

    const ts_received = msg.value?.meta?.timestamp?.received;
    const iso =
        (ts_received && ts_received.iso8601) ||
        (typeof msg.value?.timestamp === 'number' ? new Date(msg.value.timestamp).toISOString() : null) ||
        (content.createdAt ? new Date(content.createdAt).toISOString() : null);

    if (!iso || !moment(iso, moment.ISO_8601, true).isValid()) {
        return null;
    }

    const validTimestamp = moment(iso, moment.ISO_8601);
    const timeAgo = validTimestamp.fromNow();
    const timeAbsolute = validTimestamp.toISOString().split(".")[0].replace("T", " ");

    const fallbackVoted = !!msg.value?.meta?.voted;
    const fallbackVoteCount = msg.value?.meta?.votes?.length || 0;
    const fallbackVoteNames = (msg.value?.meta?.votes || [])
        .map((person) => person.name)
        .filter(Boolean);

    const spreadInfoObj = (spreadInfo && typeof spreadInfo === 'object') ? spreadInfo : null;
    const spreadCount = spreadInfoObj && typeof spreadInfoObj.count === 'number'
        ? spreadInfoObj.count
        : fallbackVoteCount;
    const alreadySpread = spreadInfoObj && typeof spreadInfoObj.alreadySpread === 'boolean'
        ? spreadInfoObj.alreadySpread
        : fallbackVoted;
    const spreadVoters = (spreadInfoObj && Array.isArray(spreadInfoObj.voters))
        ? spreadInfoObj.voters
              .map(v => (v && typeof v === 'object') ? (v.name || v.key || '') : String(v || ''))
              .filter(Boolean)
        : fallbackVoteNames;

    const maxSpreadNameLength = 16;
    const maxSpreadNames = 16;
    const spreadByNames = spreadVoters
        .slice(0, maxSpreadNames)
        .map((n) => String(n).slice(0, maxSpreadNameLength))
        .join(", ");
    const additionalSpreadsMessage =
        spreadCount > maxSpreadNames ? `+${spreadCount - maxSpreadNames} more` : ``;
    const spreadByMessage =
        spreadCount > 0 ? `${spreadByNames} ${additionalSpreadsMessage}`.trim() : (i18n.spreadHint || 'Spread this to your supporters (replicates via your feed).');
    const spreadButtonClass = alreadySpread ? 'liked' : null;

    const messageClasses = ["post"];
    const recps = [];

    const addRecps = (recpsInfo) => {
        recpsInfo.forEach((recp) => {
            recps.push(
                a(
                    { href: `/author/${encodeURIComponent(recp.feedId)}` },
                    img({ class: "avatar", src: recp.avatarUrl, alt: "" })
                )
            );
        });
    };

    if (isPrivate) {
        messageClasses.push("private");
        addRecps(msg.value?.meta?.recpsInfo || []);
    }

    if (isThreadTarget) {
        messageClasses.push("thread-target");
    }

    if (isBlocked) {
        messageClasses.push("blocked");
        return section(
            {
                id: msg.key,
                class: messageClasses.join(" "),
            },
            i18n.relationshipBlockingPost
        );
    }

    const articleContent = article(
        { class: "content" },
        hasContentWarning ? div({ class: "post-subject" }, msg.value?.content?.contentWarning) : null,
        articleElement
    );

    const fragment = section(
        {
            id: msg.key,
            class: messageClasses.join(" "),
        },
        header(
            div(
                { class: "header-content" },
                a(
                    { href: url.author },
                    img({ class: "avatar-profile", src: url.avatar, alt: "" })
                ),
                span(
                    { class: "created-at" },
                    `${i18n.createdBy} `,
                    userLink(authorIdForName, msg.value?.meta?.author?.name),
                    ` | ${timeAbsolute} | ${i18n.sendTime} `,
                    a({ href: url.link }, timeAgo)
                ),
                isPrivate ? "🔒" : null,
                isPrivate ? recps : null
            )
        ),
        articleContent,
        footer(
            div(
                form(
                    { action: url.spreadForm, method: "post" },
                    button(
                        {
                            type: "submit",
                            class: spreadButtonClass,
                            title: spreadByMessage,
                        },
                        `☉ ${spreadCount}`
                    )
                ),
                a({ href: url.comment }, i18n.comment),
                isPrivate || isRoot || isFork
                    ? null
                    : a({ href: url.subtopic }, nbsp, i18n.subtopic)
            ),
            br()
        )
    );

    const threadSeparator = [br()];

    if (aside) {
        return [fragment, postAside(msg), isRoot ? threadSeparator : null];
    } else {
        return fragment;
    }
};

exports.editProfileView = ({ name, description, visibilityPrefs = {}, feedId = '', baseUrl = '', gpgFingerprint = '' }) => {
  const prefs = {
    activity: visibilityPrefs.activity === true,
    device:   visibilityPrefs.device   === true,
    karma:    visibilityPrefs.karma !== false,
    ubi:      visibilityPrefs.ubi      === true,
    wallet:   visibilityPrefs.wallet   === true,
    clearnetShops:     visibilityPrefs.clearnetShops     === true,
    clearnetJobs:      visibilityPrefs.clearnetJobs      === true,
    clearnetEvents:    visibilityPrefs.clearnetEvents    === true,
    clearnetProjects:  visibilityPrefs.clearnetProjects  === true,
    clearnetPosts:     visibilityPrefs.clearnetPosts     === true,
    clearnetAudios:    visibilityPrefs.clearnetAudios    === true,
    clearnetVideos:    visibilityPrefs.clearnetVideos    === true,
    clearnetImages:    visibilityPrefs.clearnetImages    === true,
    clearnetDocuments: visibilityPrefs.clearnetDocuments === true,
    clearnetTorrents:  visibilityPrefs.clearnetTorrents  === true,
    clearnetBookmarks: visibilityPrefs.clearnetBookmarks === true,
    profileShops:      visibilityPrefs.profileShops      === true,
    profileJobs:       visibilityPrefs.profileJobs       === true,
    profileEvents:     visibilityPrefs.profileEvents     === true,
    profileProjects:   visibilityPrefs.profileProjects   === true,
    profilePosts:      visibilityPrefs.profilePosts      === true,
    profileAudios:     visibilityPrefs.profileAudios     === true,
    profileVideos:     visibilityPrefs.profileVideos     === true,
    profileImages:     visibilityPrefs.profileImages     === true,
    profileDocuments:  visibilityPrefs.profileDocuments  === true,
    profileTorrents:   visibilityPrefs.profileTorrents   === true,
    profileBookmarks:  visibilityPrefs.profileBookmarks  === true,
    ecoTax:            visibilityPrefs.ecoTax            !== false,
    larpSign:          visibilityPrefs.larpSign          === true,
    fediverse:         visibilityPrefs.fediverse         === true,
    gpg:               visibilityPrefs.gpg               !== false
  };
  const fediverseHandleValue = typeof visibilityPrefs.fediverseHandle === 'string' ? visibilityPrefs.fediverseHandle : '';
  prefs.clearnet = prefs.clearnetShops || prefs.clearnetJobs || prefs.clearnetEvents || prefs.clearnetProjects || prefs.clearnetPosts || prefs.clearnetAudios || prefs.clearnetVideos || prefs.clearnetImages || prefs.clearnetDocuments || prefs.clearnetTorrents || prefs.clearnetBookmarks;
  const togglePill = (key, labelText, forced = false) => label(
    { class: forced ? "pref-pill pref-pill-forced" : "pref-pill", for: forced ? undefined : `vis_${key}`, title: forced ? (i18n.profileDeviceLockedHint || 'On mobile devices this sensor is mandatory and cannot be disabled.') : undefined },
    forced ? input({ type: "hidden", name: `vis_${key}`, value: "1" }) : null,
    input({ type: "checkbox", name: forced ? undefined : `vis_${key}`, id: forced ? undefined : `vis_${key}`, value: "1", class: "pref-pill-input", checked: (forced || prefs[key]) ? "checked" : undefined, disabled: forced ? "disabled" : undefined }),
    span({ class: "pref-pill-label" }, labelText)
  );
  return template(
    i18n.editProfile,
    section(
      h1(i18n.editProfile),
      p(i18n.editProfileDescription),
      form(
        {
          action: "/profile/edit",
          method: "POST",
          enctype: "multipart/form-data",
        },
        label(
          i18n.profileImage,
          br(),
          input({ type: "file", name: "image", accept: "image/*" })
        ),
        br(),br(),
        label(i18n.profileName,
        br(),
        input({ name: "name", value: name })),
        br(),br(),
        label(
          i18n.profileDescription,
          br(),
          textarea(
            {
              autofocus: true,
              name: "description",
              rows: "6",
            },
            description
          )
        ),
        br(),br(),
        label(
          i18n.profileGpgKey || 'GPG Public Key (.asc)',
          br(),
          div({ class: "gpg-edit-row" },
            input({ type: "file", name: "gpgKey", accept: ".asc,.gpg,.pgp,application/pgp-keys,text/plain" }),
            gpgFingerprint
              ? button({ type: "submit", formaction: "/profile/gpg/remove", formenctype: "application/x-www-form-urlencoded", formnovalidate: true, class: "gpg-remove-btn" },
                  (i18n.profileGpgRemove || 'Remove') + ' (' + String(gpgFingerprint).slice(-8).toUpperCase() + ')'
                )
              : null
          )
        ),
        br(), br(),
        div({ class: "prefs-card" },
          div({ class: "tags-header" },
            h2(i18n.profileContentSectionTitle || 'Avatar Content'),
            p({ class: "prefs-help" }, i18n.profileContentHelp || 'Choose which of your modules will be displayed on your profile.')
          ),
          div({ class: "pref-pill-row" },
            togglePill('profileShops',     i18n.profileClearnetShopsLabel     || 'Shops'),
            togglePill('profileJobs',      i18n.profileClearnetJobsLabel      || 'Jobs'),
            togglePill('profileEvents',    i18n.profileClearnetEventsLabel    || 'Events'),
            togglePill('profileProjects',  i18n.profileClearnetProjectsLabel  || 'Projects'),
            togglePill('profilePosts',     i18n.profileClearnetPostsLabel     || 'Blogs'),
            togglePill('profileAudios',    i18n.profileClearnetAudiosLabel    || 'Audios'),
            togglePill('profileVideos',    i18n.profileClearnetVideosLabel    || 'Videos'),
            togglePill('profileImages',    i18n.profileClearnetImagesLabel    || 'Images'),
            togglePill('profileDocuments', i18n.profileClearnetDocumentsLabel || 'Documents'),
            togglePill('profileTorrents',  i18n.profileClearnetTorrentsLabel  || 'Torrents'),
            togglePill('profileBookmarks', i18n.profileClearnetBookmarksLabel || 'Bookmarks')
          )
        ),
        br(),
        div({ class: "prefs-card" },
          div({ class: "tags-header" },
            h2(i18n.profileSensorsSectionTitle || 'Sensors'),
            p({ class: "prefs-help" }, i18n.profileSensorsHelp || 'Optional metrics shown on your profile.')
          ),
          div({ class: "pref-pill-row" },
            togglePill('karma',    i18n.profileVisibilityKarma    || 'KARMA Scoring'),
            togglePill('activity', i18n.profileVisibilityActivity || 'Activity Level'),
            togglePill('fediverse', i18n.profileVisibilityFediverse || 'Fediverse'),
            togglePill('larpSign', i18n.profileVisibilityLarpSign || 'L.A.R.P. Sign'),
            togglePill('gpg',      i18n.profileVisibilityGpg      || 'GPG Key'),
            togglePill('wallet',   i18n.profileVisibilityWallet   || 'ECOIN Wallet'),
            togglePill('ubi',      i18n.profileVisibilityUbi      || 'UBI'),
            togglePill('ecoTax',   i18n.profileVisibilityEcoTax   || 'ECO Tax')
          ),
          input({ type: "hidden", name: "fediverseHandle", value: fediverseHandleValue })
        ),
        br(),
        div({ class: "prefs-card" },
          div({ class: "tags-header" },
            h2(i18n.clearnetSectionTitle || 'Clearnet'),
            p({ class: "prefs-help" }, i18n.profileClearnetHelp || 'Modules that can be accessed from outside Oasis.')
          ),
          div({ class: "pref-pill-row" },
            togglePill('clearnetShops',     i18n.profileClearnetShopsLabel     || 'Shops'),
            togglePill('clearnetJobs',      i18n.profileClearnetJobsLabel      || 'Jobs'),
            togglePill('clearnetEvents',    i18n.profileClearnetEventsLabel    || 'Events'),
            togglePill('clearnetProjects',  i18n.profileClearnetProjectsLabel  || 'Projects'),
            togglePill('clearnetPosts',     i18n.profileClearnetPostsLabel     || 'Blogs'),
            togglePill('clearnetAudios',    i18n.profileClearnetAudiosLabel    || 'Audios'),
            togglePill('clearnetVideos',    i18n.profileClearnetVideosLabel    || 'Videos'),
            togglePill('clearnetImages',    i18n.profileClearnetImagesLabel    || 'Images'),
            togglePill('clearnetDocuments', i18n.profileClearnetDocumentsLabel || 'Documents'),
            togglePill('clearnetTorrents',  i18n.profileClearnetTorrentsLabel  || 'Torrents'),
            togglePill('clearnetBookmarks', i18n.profileClearnetBookmarksLabel || 'Bookmarks')
          )
        ),
        br(),
        button(
          {
            type: "submit",
          },
          i18n.submit
        )
      )
    )
  );
};

exports.clearnetBlogView = async ({ msgKey, text, author, authorName, contentWarning, sentAt }) => {
  const { escapeHtml: esc, renderClearnetPage } = require('./clearnet_view');
  const rawText = String(text || '');
  const renderedHtml = sanitizeHtml(markdown(rawText))
    .replace(/(["'])\/blob\//g, '$1/c/blob/');
  const plainPreview = rawText.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '').slice(0, 200);
  const authorEsc = esc(authorName || (author || '').slice(1, 9));
  const dateStr = sentAt ? esc(new Date(sentAt).toISOString().slice(0, 10)) : '';
  const cw = esc(contentWarning || '');
  const firstLine = rawText.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '').split('\n').map(s => s.trim()).find(Boolean) || '';
  const titleText = cw || firstLine.slice(0, 100) || 'Post';
  const extraCss = `
.cn-blog-meta{color:var(--fg-dim);font-size:13px;margin-bottom:16px;display:flex;gap:14px;flex-wrap:wrap}
.cn-blog-cw{background:#663d00;color:#ffd700;border:1px solid #ff7300;padding:8px 14px;border-radius:6px;margin-bottom:16px;font-weight:600}
.cn-blog-body{color:var(--fg-soft);line-height:1.7;font-size:16px;margin:0;word-wrap:break-word}
.cn-blog-body p{margin:0 0 14px 0}
.cn-blog-body img{max-width:100%;height:auto;border-radius:6px;border:1px solid var(--border);display:block;margin:10px 0}
.cn-blog-body a{color:var(--fg);text-decoration:underline}
.cn-blog-body a:hover{color:var(--accent)}
.cn-blog-body pre,.cn-blog-body code{background:var(--bg-sub);color:var(--fg);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-family:monospace;font-size:13px}
.cn-blog-body pre{padding:10px 14px;overflow-x:auto;white-space:pre-wrap;word-break:break-word}
.cn-blog-body blockquote{margin:10px 0;padding:6px 14px;border-left:3px solid var(--fg);color:var(--fg-soft);background:var(--bg-sub);border-radius:0 4px 4px 0}
.cn-blog-body h1,.cn-blog-body h2,.cn-blog-body h3{color:var(--fg);margin:18px 0 10px 0}
.cn-blog-body ul,.cn-blog-body ol{padding-left:24px;margin:8px 0}
.cn-blog-body video,.cn-blog-body audio{max-width:100%;display:block;margin:10px 0}
`;
  const body = `
  <div class="cn-blog-meta">
    ${dateStr ? `<span>📅 ${dateStr}</span>` : ''}
  </div>
  ${cw ? `<div class="cn-blog-cw">${cw}</div>` : ''}
  <article class="cn-blog-body">${renderedHtml}</article>
`;
  return renderClearnetPage({
    title: `${esc(titleText)} — Oasis`,
    ogTitle: titleText,
    ogDescription: plainPreview,
    extraCss,
    body,
    hubFeedId: author || null
  });
};

exports.clearnetInhabitantView = async ({ feedId, name, description, image, prefs, items = {}, query = '', filterType = '' }) => {
  const { blobUrl: cnBlob, escapeHtml: esc, renderClearnetPage } = require('./clearnet_view');
  const blobAvatarUrl = cnBlob(image);
  const avatarSrc = blobAvatarUrl || '/assets/images/default-avatar.png';
  const qrSrc = feedId ? `/qr/${encodeURIComponent(feedId)}` : null;
  const displayName = esc(name || 'Anonymous');
  const desc = esc(description || '');
  const renderHubItem = (modulePath, it) => {
    const blob = cnBlob(it.image);
    const title = esc(it.title || 'Untitled');
    const snippet = esc((it.snippet || '').slice(0, 160));
    const meta = esc(it.meta || '');
    const kind = esc(it.kind || '');
    return `<a class="cn-hub-card" href="/c/${modulePath}/${encodeURIComponent(it.id)}">
      ${blob ? `<img class="cn-hub-thumb" src="${blob}" alt="" loading="lazy"/>` : ''}
      <div class="cn-hub-body">
        ${kind ? `<div class="cn-hub-kind">${kind}</div>` : ''}
        <div class="cn-hub-title">${title}</div>
        ${snippet ? `<div class="cn-hub-snippet">${snippet}${(it.snippet || '').length > 160 ? '…' : ''}</div>` : ''}
        ${meta ? `<div class="cn-hub-meta">${meta}</div>` : ''}
      </div>
    </a>`;
  };
  const moduleDef = [
    { key: 'shops',     label: 'Shops',     kind: 'Shop',     prefKey: 'clearnetShops' },
    { key: 'jobs',      label: 'Jobs',      kind: 'Job',      prefKey: 'clearnetJobs' },
    { key: 'events',    label: 'Events',    kind: 'Event',    prefKey: 'clearnetEvents' },
    { key: 'projects',  label: 'Projects',  kind: 'Project',  prefKey: 'clearnetProjects' },
    { key: 'posts',     label: 'Blogs',     kind: 'Blog',     prefKey: 'clearnetPosts',     modulePath: 'blog' },
    { key: 'audios',    label: 'Audios',    kind: 'Audio',    prefKey: 'clearnetAudios' },
    { key: 'videos',    label: 'Videos',    kind: 'Video',    prefKey: 'clearnetVideos' },
    { key: 'images',    label: 'Images',    kind: 'Image',    prefKey: 'clearnetImages' },
    { key: 'documents', label: 'Documents', kind: 'Document', prefKey: 'clearnetDocuments' },
    { key: 'torrents',  label: 'Torrents',  kind: 'Torrent',  prefKey: 'clearnetTorrents' },
    { key: 'bookmarks', label: 'Bookmarks', kind: 'Bookmark', prefKey: 'clearnetBookmarks' }
  ];
  const allItems = [];
  for (const m of moduleDef) {
    for (const it of (items[m.key] || [])) {
      allItems.push({ ...it, modulePath: m.modulePath || m.key, kind: m.kind, _moduleKey: m.key });
    }
  }
  const activeFilter = (filterType || '').toLowerCase();
  const visibleItems = activeFilter
    ? allItems.filter(it => it._moduleKey === activeFilter)
    : allItems;
  const totalCount = visibleItems.length;
  const filterBase = `/c/inhabitant/${encodeURIComponent(feedId)}`;
  const filterButtons = `<div class="cn-filter-row">
    <a class="cn-filter-btn${activeFilter ? '' : ' active'}" href="${filterBase}">All (${allItems.length})</a>
    ${moduleDef.filter(m => prefs && prefs[m.prefKey] && (items[m.key] || []).length).map(m => {
      const isActive = activeFilter === m.key;
      const count = (items[m.key] || []).length;
      return `<a class="cn-filter-btn${isActive ? ' active' : ''}" href="${filterBase}?type=${m.key}">${esc(m.label)} (${count})</a>`;
    }).join('')}
  </div>`;
  const sections = totalCount
    ? `${filterButtons}<h2 class="cn-section">Public Content (${totalCount})</h2><div class="cn-hub-grid">${visibleItems.map(it => renderHubItem(it.modulePath, it)).join('')}</div>`
    : (allItems.length ? `${filterButtons}<div class="cn-empty-content">No content in this category.</div>` : '');
  const noResults = '<div class="cn-empty-content">This inhabitant has not published content to Clearnet yet.</div>';
  const extraCss = `
.cn-profile{display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;margin-bottom:24px}
.cn-avatar{width:160px;height:160px;border-radius:8px;border:3px solid var(--fg);object-fit:cover;background:#000;flex:0 0 auto}
.cn-profile-body{flex:1 1 280px;min-width:0}
.cn-name{color:var(--fg);margin:0 0 8px 0;font-size:28px;font-weight:700}
.cn-id{color:var(--fg-dim);font-size:12px;word-break:break-all;font-family:monospace;background:var(--bg-sub);border:1px solid var(--border);padding:6px 10px;border-radius:4px;display:inline-block;margin-bottom:14px}
.cn-desc{color:var(--fg-soft);white-space:pre-wrap;margin:0}
.cn-qr-col{flex:0 0 auto;display:flex;align-items:flex-start;justify-content:center}
.cn-qr-img{width:160px;height:160px;background:#fff;padding:8px;border-radius:8px;image-rendering:pixelated}
.cn-filter-row{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 12px 0}
.cn-filter-btn{display:inline-block;padding:6px 14px;background:var(--bg-elev);color:var(--fg-soft);border:1px solid var(--border);border-radius:14px;font-size:13px;text-decoration:none;transition:border-color .15s ease,color .15s ease,background .15s ease}
.cn-filter-btn:hover{border-color:var(--fg);color:var(--fg);text-decoration:none}
.cn-filter-btn.active{background:var(--bg-sub);border-color:var(--fg);color:var(--fg);font-weight:600}
.cn-hub-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-top:16px}
.cn-hub-kind{color:var(--fg-dim);font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:600}
.cn-hub-card{display:flex;flex-direction:column;background:var(--bg-elev);border:1px solid var(--border);border-radius:8px;overflow:hidden;transition:border-color .15s ease;color:var(--fg);text-decoration:none}
.cn-hub-card:hover{border-color:var(--fg);text-decoration:none}
.cn-hub-thumb{width:100%;height:140px;object-fit:cover;background:#000;border-bottom:1px solid var(--border)}
.cn-hub-body{padding:12px 14px;display:flex;flex-direction:column;gap:6px;min-width:0}
.cn-hub-title{color:var(--fg);font-weight:600;font-size:15px;word-break:break-word}
.cn-hub-snippet{color:var(--fg-soft);font-size:13px;line-height:1.4;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cn-hub-meta{color:var(--fg-dim);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-top:auto}
.cn-empty-content{background:var(--bg-elev);border:1px dashed var(--border);border-radius:8px;padding:24px;text-align:center;color:var(--fg-dim);font-size:14px}
`;
  const body = `
  <div class="cn-profile">
    <img class="cn-avatar" src="${avatarSrc}" alt="${displayName}"/>
    <div class="cn-profile-body">
      <h1 class="cn-name">${displayName}</h1>
      <div class="cn-id">${esc(feedId)}</div>
      ${desc ? `<p class="cn-desc">${desc}</p>` : ''}
    </div>
    ${qrSrc ? `<div class="cn-qr-col"><img class="cn-qr-img" src="${qrSrc}" alt="QR"/></div>` : ''}
  </div>
  ${totalCount > 0 ? sections : noResults}
`;
  return renderClearnetPage({
    title: `${name || 'Inhabitant'} — Oasis`,
    ogTitle: name || 'Oasis',
    ogDescription: description || '',
    ogImage: blobAvatarUrl,
    extraCss,
    body,
    hubFeedId: feedId || null
  });
};

const renderUserSensors = (u, opts = {}) => {
  const { renderReachChip, renderClearnetUrlBlock, renderFediverseReach, renderContentStats } = require('./clearnet_view');
  const prefs = u.prefs || {};
  const isMe = !!u.isMe;
  const show = (k) => prefs[k];
  const fmtCarbon = (g) => {
    const n = Number(g) || 0;
    if (!n) return '0 µg CO₂';
    if (n >= 1) return `${n.toFixed(2)} g CO₂`;
    const mg = n * 1000;
    if (mg >= 1) return `${mg.toFixed(2)} mg CO₂`;
    return `${(mg * 1000).toFixed(2)} µg CO₂`;
  };
  const fediverseNode = (isMe && !u.fediverseConfigured) ? null : renderFediverseReach(prefs, i18n);
  const dot = u.activityBucket === 'green' ? 'green' : u.activityBucket === 'orange' ? 'orange' : u.activityBucket === 'red' ? 'red' : null;
  const activityChip = (show('activity') && dot)
    ? span({ class: 'inhabitant-last-activity' }, `${i18n.inhabitantActivityLevel}: `, span({ class: `activity-dot ${dot}` }, '●'))
    : null;
  const deviceSrc = isMe
    ? (getConfig().themes.current === 'OasisKIT' ? 'KIT' : (getConfig().themes.current === 'OasisMobile' || process.env.OASIS_MOBILE === '1') ? 'MOBILE' : 'DESKTOP')
    : (u.deviceSource || null);
  const deviceChip = deviceSrc
    ? (() => {
        const up = String(deviceSrc).toUpperCase();
        const cls = up === 'KIT' ? 'device-kit' : up === 'MOBILE' ? 'device-mobile' : 'device-desktop';
        return span({ class: 'inhabitant-last-activity' }, `${i18n.deviceLabel || 'Device'}: `, span({ class: cls }, deviceSrc));
      })()
    : null;
  const items = [];
  if (show('karma')) items.push(span({ class: 'karma-line' }, `${i18n.bankingUserEngagementScore}: `, strong(String(u.karmaScore !== undefined ? u.karmaScore : 0))));
  if (show('ecoTax')) items.push(span({ class: 'karma-line eco-tax-line' }, `${i18n.profileVisibilityEcoTax || 'ECO Tax'}: `, strong(fmtCarbon(u.carbonGrams))));
  if (activityChip) items.push(activityChip);
  if (deviceChip) items.push(deviceChip);
  if (show('gpg') && (u.gpgFingerprint || isMe)) {
    let gpgNode;
    if (u.gpgFingerprint) {
      const sid = String(u.gpgFingerprint).slice(-8).toUpperCase();
      gpgNode = a({ href: `/profile/${encodeURIComponent(u.id)}/gpg.asc`, title: i18n.profileGpgDownload || 'Download' }, strong(sid));
    } else {
      const nc = i18n.statsEcoWalletNotConfigured || 'Not configured!';
      gpgNode = isMe ? a({ href: '/profile/edit' }, strong(nc)) : strong(nc);
    }
    items.push(span({ class: 'gpg-line' }, `${i18n.profileGpgChip || 'GPG'}: `, gpgNode));
  }
  if (show('wallet') && (u.ecoAddress || isMe)) {
    const wt = u.ecoAddress || (i18n.statsEcoWalletNotConfigured || 'Not configured!');
    const wn = isMe ? a({ href: '/wallet' }, strong(wt)) : strong(wt);
    items.push(span({ class: 'ubi-line' }, `${i18n.statsEcoWalletLabel || 'ECOin Wallet'}: `, wn));
  }
  if (show('ubi')) {
    items.push(span({ class: 'ubi-line' }, `${i18n.bankUbiThisMonth || 'UBI'}: `, strong(`${Number(u.estimatedUBI || 0).toFixed(6)} ECO`)));
    items.push(span({ class: 'ubi-line' }, `${i18n.bankUbiLastClaimed || 'Last claimed'}: `, u.lastClaimedDate ? a({ href: '/transfers?filter=ubi', class: 'user-link' }, new Date(u.lastClaimedDate).toLocaleDateString()) : strong(i18n.bankUbiNeverClaimed || 'Never claimed')));
    items.push(span({ class: 'ubi-line' }, `${i18n.bankUbiTotalClaimed || 'Total claimed'}: `, strong(`${Number(u.totalClaimed || 0).toFixed(6)} ECO`)));
  }
  const sensorsBox = items.length ? div({ class: 'profile-sensors-box' }, ...items) : null;
  const larpNode = (show('larpSign') && u.larpHouse && u.larpHouse.key)
    ? a({ href: `/larp/${u.larpHouse.key}`, class: 'larp-sign-block', title: u.larpHouse.name }, img({ src: u.larpHouse.image || '/assets/larp/images/default.jpg', alt: u.larpHouse.name, class: 'larp-sign-large' }))
    : null;
  const reachNode = prefs.clearnet
    ? (() => {
        const path = `/c/inhabitant/${encodeURIComponent(u.id)}`;
        return div({ class: 'profile-reach' },
          renderReachChip(true, i18n, path),
          renderClearnetUrlBlock({ path, i18nObj: i18n }),
          isMe ? form({ method: 'POST', action: '/profile/clearnet-toggle', class: 'profile-reach-toggle' }, button({ type: 'submit', class: 'btn' }, i18n.profileSwitchToOasis || 'Return to Oasis')) : null
        );
      })()
    : null;
  const contentNode = opts.excludeContent ? null : renderContentStats(u.stats, i18n);
  return [fediverseNode, opts.relationshipNode || null, sensorsBox, larpNode, reachNode, contentNode].filter(Boolean);
};
exports.renderUserSensors = renderUserSensors;

exports.authorView = async ({
  avatarUrl,
  description,
  feedId,
  messages,
  firstPost,
  lastPost,
  name,
  relationship,
  ecoAddress,
  karmaScore = 0,
  estimatedUBI = 0,
  lastClaimedDate = null,
  totalClaimed = 0,
  carbonGrams = 0,
  larpHouse = null,
  lastActivityBucket,
  visibilityPrefs = null,
  deviceSource = null,
  stats = {},
  baseUrl = '',
  userActions = [],
  allActions = [],
  profileItems = null,
  profileFilterType = '',
  gpgFingerprint = '',
  spreadMap = null,
  fediverseConfigured = false
}) => {
  const isOwnProfile = !!(relationship && relationship.me);
  const rawPrefs = visibilityPrefs || {};
  const prefs = {
    activity: rawPrefs.activity === true,
    device:   rawPrefs.device   === true,
    karma:    rawPrefs.karma !== false,
    ubi:      rawPrefs.ubi      === true,
    wallet:   rawPrefs.wallet   === true,
    ecoTax:   rawPrefs.ecoTax   !== false,
    larpSign: rawPrefs.larpSign === true,
    clearnet: rawPrefs.clearnet === true,
    fediverse: rawPrefs.fediverse === true,
    fediverseHandle: typeof rawPrefs.fediverseHandle === 'string' ? rawPrefs.fediverseHandle : '',
    gpg:      rawPrefs.gpg      !== false
  };
  const clearnetSubKeys = ['clearnetShops','clearnetJobs','clearnetEvents','clearnetProjects','clearnetPosts','clearnetAudios','clearnetVideos','clearnetImages','clearnetDocuments','clearnetTorrents','clearnetBookmarks'];
  const anySubClearnet = clearnetSubKeys.some(k => rawPrefs[k] === true);
  prefs.clearnet = prefs.clearnet || anySubClearnet;
  const showField = (key) => prefs[key];
  const qrSrc = feedId ? `/qr/${encodeURIComponent(feedId)}` : null;
  const linkUrl = `/author/${encodeURIComponent(feedId)}`;

  const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const markdownMention = `[@${escHtml(name)}](<strong>${escHtml(feedId)}</strong>)`;

  const contactForms = [];
  const addForm = ({ action }) =>
    contactForms.push(
      form(
        { action: `/${action}/${encodeURIComponent(feedId)}`, method: "post" },
        button({ type: "submit", class: "btn" }, i18n[action])
      )
    );

  if (relationship.me === false) {
    if (relationship.following) addForm({ action: "unfollow" });
    else if (relationship.blocking) addForm({ action: "unblock" });
    else { addForm({ action: "follow" }); addForm({ action: "block" }) }
  }

  const relationshipMessage = (() => {
    if (relationship.me) return i18n.relationshipYou;
    const following = relationship.following === true;
    const followsMe = relationship.followsMe === true;
    if (following && followsMe) return i18n.relationshipMutuals;
    const messagesArr = [];
    messagesArr.push(following ? i18n.relationshipFollowing : i18n.relationshipNone);
    messagesArr.push(followsMe ? i18n.relationshipTheyFollow : i18n.relationshipNotFollowing);
    return messagesArr.join(". ") + ".";
  })();

  const relationshipBlock = relationship.me
    ? span({ class: "status you" }, i18n.relationshipYou)
    : div({ class: "relationship-status" },
        relationship.blocking && relationship.blockedBy
          ? span({ class: "status blocked" }, i18n.relationshipMutualBlock)
          : [
              relationship.blocking ? span({ class: "status blocked" }, i18n.relationshipBlocking) : null,
              relationship.blockedBy ? span({ class: "status blocked-by" }, i18n.relationshipBlockedBy) : null,
              relationship.following && relationship.followsMe
                ? span({ class: "status mutual" }, i18n.relationshipMutuals)
                : [
                    span({ class: "status supporting" }, relationship.following ? i18n.relationshipFollowing : i18n.relationshipNone),
                    span({ class: "status supported-by" }, relationship.followsMe ? i18n.relationshipTheyFollow : i18n.relationshipNotFollowing)
                  ]
            ],
        contactForms.length
          ? div({ class: "relationship-actions" }, ...contactForms)
          : null
      );

  const userSensors = renderUserSensors({
    isMe: isOwnProfile, fediverseConfigured, prefs, id: feedId,
    karmaScore, carbonGrams, deviceSource, activityBucket: lastActivityBucket,
    gpgFingerprint, ecoAddress, estimatedUBI, lastClaimedDate, totalClaimed,
    larpHouse, stats
  }, { relationshipNode: div({ class: "profile-side-relationship" }, relationshipBlock) });

  const sideColumn = div({ class: "tribe-side profile-side" },
    img({ class: "inhabitant-photo-details", src: avatarUrl, alt: name }),
    h2({ class: "profile-side-name" }, name),
    div({ class: "profile-side-mention" },
      a({ href: `/author/${encodeURIComponent(feedId)}` }, strong(feedId))
    ),
    qrSrc ? img({ src: qrSrc, alt: feedId, class: "profile-side-qr", width: "180", height: "180" }) : null,
    description !== ""
      ? div({ class: "profile-side-description", innerHTML: sanitizeHtml(markdown(description)) })
      : null,
    ...userSensors,
    div({ class: "profile-side-actions" },
      isOwnProfile ? a({ href: `/profile/edit`, class: "btn" }, i18n.editProfile) : null,
      a({ href: `/likes/${encodeURIComponent(feedId)}`, class: "btn" }, i18n.viewLikes),
      !isOwnProfile ? a({ href: `/pm?recipients=${encodeURIComponent(feedId)}`, class: "btn" }, i18n.pmCreateButton) : null
    )
  );

  let mainColumnContent = [];

  if (Array.isArray(allActions) && allActions.length) {
    const keyToTypes = {
      shops:     new Set(['shop', 'shopProduct']),
      jobs:      new Set(['job']),
      events:    new Set(['event']),
      projects:  new Set(['project']),
      posts:     new Set(['post']),
      audios:    new Set(['audio']),
      videos:    new Set(['video']),
      images:    new Set(['image']),
      documents: new Set(['document']),
      torrents:  new Set(['torrent'])
    };
    const moduleDef = [
      { key: 'shops',     label: i18n.profileClearnetShopsLabel     || 'Shops' },
      { key: 'jobs',      label: i18n.profileClearnetJobsLabel      || 'Jobs' },
      { key: 'events',    label: i18n.profileClearnetEventsLabel    || 'Events' },
      { key: 'projects',  label: i18n.profileClearnetProjectsLabel  || 'Projects' },
      { key: 'posts',     label: i18n.profileClearnetPostsLabel     || 'Blogs' },
      { key: 'audios',    label: i18n.profileClearnetAudiosLabel    || 'Audios' },
      { key: 'videos',    label: i18n.profileClearnetVideosLabel    || 'Videos' },
      { key: 'images',    label: i18n.profileClearnetImagesLabel    || 'Images' },
      { key: 'documents', label: i18n.profileClearnetDocumentsLabel || 'Documents' },
      { key: 'torrents',  label: i18n.profileClearnetTorrentsLabel  || 'Torrents' }
    ];
    const enabledKeys = moduleDef.filter(m => rawPrefs[`profile${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`] === true).map(m => m.key);
    if (enabledKeys.length > 0) {
      const allowedTypes = new Set();
      for (const k of enabledKeys) for (const t of keyToTypes[k]) allowedTypes.add(t);
      const authorActions = allActions.filter(a => a && a.author === feedId && allowedTypes.has(a.type));
      const counts = {};
      for (const k of enabledKeys) counts[k] = 0;
      for (const a of authorActions) {
        for (const k of enabledKeys) {
          if (keyToTypes[k].has(a.type)) { counts[k]++; break; }
        }
      }
      const totalCount = authorActions.length;
      if (totalCount > 0) {
        const activeFilter = (profileFilterType || '').toLowerCase();
        const filterBase = isOwnProfile ? `/profile` : `/author/${encodeURIComponent(feedId)}`;
        const filterRow = div({ class: "tribe-section-nav no-border" },
          div({ class: "tribe-section-group no-border" },
            a({ href: filterBase, class: `filter-btn${activeFilter ? '' : ' active'}` }, `${String(i18n.profileHubAll || 'All').toUpperCase()} (${totalCount})`),
            ...moduleDef.filter(m => enabledKeys.includes(m.key) && counts[m.key] > 0).map(m => {
              const isActive = activeFilter === m.key;
              return a({ href: `${filterBase}?type=${encodeURIComponent(m.key)}`, class: `filter-btn${isActive ? ' active' : ''}` }, `${String(m.label).toUpperCase()} (${counts[m.key]})`);
            })
          )
        );
        const visible = activeFilter && keyToTypes[activeFilter]
          ? authorActions.filter(a => keyToTypes[activeFilter].has(a.type))
          : authorActions;
        visible.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        const limited = visible.slice(0, 50);
        const { renderActionCards } = require('./activity_view');
        mainColumnContent.push(filterRow);
        mainColumnContent.push(div({ class: 'feed-container profile-module-section' },
          renderActionCards(limited, feedId, allActions || limited, spreadMap instanceof Map ? spreadMap : new Map())
        ));
      }
    }
  }

  const hasMainContent = mainColumnContent.length > 0;
  const layout = hasMainContent
    ? section(div({ class: "tribe-details profile-layout" },
        sideColumn,
        div({ class: "tribe-main profile-main" }, ...mainColumnContent)
      ))
    : section(div({ class: "profile-layout profile-layout-single" }, sideColumn));

  let html = template(i18n.profile, layout);
  const hasDocument = Array.isArray(allActions) && allActions.some(a => a && a.author === feedId && a.type === 'document');
  if (hasDocument) {
    html += `
      <script type="module" src="/js/pdf.min.mjs"></script>
      <script src="/js/pdf-viewer.js"></script>
    `;
  }
  return html;
};

exports.previewCommentView = async ({
  previewData,
  messages,
  myFeedId,
  parentMessage,
  contentWarning,
}) => {
  if (!parentMessage || !parentMessage.value) {
    throw new Error("Missing parentMessage or value");
  }

  const publishAction = `/comment/${encodeURIComponent(parentMessage.key)}`;
  const preview = generatePreview({
    previewData,
    contentWarning,
    action: publishAction,
  });
  return exports.commentView(
    { messages, myFeedId, parentMessage },
    preview, 
    previewData.text,
    contentWarning
  );
};

exports.commentView = async (
  { messages, myFeedId, parentMessage, spreadMap = null },
  preview,
  text,
  contentWarning
) => {
  if (!parentMessage || !parentMessage.value) {
    throw new Error("Missing parentMessage or value");
  }

  const parentKey = parentMessage.key;
  const threadRoot = parentMessage.value?.content?.root || parentKey;

  const messagesInput = Array.isArray(messages) ? messages : [];
  const merged = [parentMessage, ...messagesInput];

  const filtered = merged.filter((m) => {
    if (!m || !m.value) return false;
    return m.key === threadRoot || m.value?.content?.root === threadRoot;
  });

  const seen = new Set();
  const threadMessages = [];
  for (const m of filtered) {
    if (m && m.key && !seen.has(m.key)) {
      seen.add(m.key);
      threadMessages.push(m);
    }
  }

  const tsNum = (m) => {
    const n1 = Number(m?.value?.timestamp);
    if (Number.isFinite(n1) && n1 > 0) return n1;
    const iso = m?.value?.meta?.timestamp?.received?.iso8601;
    const raw = m?.value?.meta?.timestamp?.received;
    const n2 = iso ? Date.parse(iso) : (raw ? Date.parse(raw) : NaN);
    if (Number.isFinite(n2) && n2 > 0) return n2;
    const createdAt = m?.value?.content?.createdAt;
    const n3 = createdAt ? Date.parse(createdAt) : NaN;
    if (Number.isFinite(n3) && n3 > 0) return n3;
    return 0;
  };

  threadMessages.sort((a, b) => tsNum(a) - tsNum(b));

  const authorName = parentMessage.value?.meta?.author?.name || parentMessage.value?.author || "Anonymous";

  let markdownMention = "";
  const parentAuthorFeedId = parentMessage.value?.author;
  const parentAuthorName =
    parentMessage.value?.meta?.author?.name ||
    (typeof parentAuthorFeedId === "string"
      ? (parentAuthorFeedId.startsWith("@") ? parentAuthorFeedId.slice(1) : parentAuthorFeedId)
      : "Anonymous");

  if (parentAuthorFeedId && parentAuthorFeedId !== myFeedId) {
    markdownMention = `[@${parentAuthorName}](${parentAuthorFeedId})\n\n`;
  }

  const getSpread = (key) => (spreadMap instanceof Map ? spreadMap.get(key) : null) || null;
  const messageElements = threadMessages.map((m) => post({ msg: m, spreadInfo: getSpread(m.key) }));

  const action = `/comment/preview/${encodeURIComponent(parentKey)}`;
  const method = "post";
  const isPrivate = Boolean(parentMessage.value?.meta?.private);

  return template(
    i18n.commentTitle({ authorName }),
    div({ class: "thread-container" }, ...messageElements),
    form(
      { action, method, enctype: "multipart/form-data" },
      i18n.blogSubject,
      br(),
      label(
        i18n.contentWarningLabel,
        input({
          name: "contentWarning",
          type: "text",
          class: "contentWarning",
          value: contentWarning ? contentWarning : "",
          placeholder: i18n.contentWarningPlaceholder
        })
      ),
      br(),
      label({ for: "text" }, i18n.blogMessage),
      br(),
	textarea(
	  {
	    autofocus: true,
	    required: true,
	    name: "text",
	    rows: "6",
	    cols: "50",
	    placeholder: i18n.publishWarningPlaceholder
	  },
	  text ? text : null
	),
      br(),
      label(
        { for: "blob" },
        i18n.blogImage || "Upload media (max-size: 50MB)"
      ),
      input({ type: "file", id: "blob", name: "blob" }),
      br(),
      br(),
      button({ type: "submit" }, i18n.blogPublish)
    ),
    preview ? div({ class: "comment-preview" }, preview) : ""
  );
};

const renderMessage = (msg) => {
  const content = lodash.get(msg, "value.content", {});
  const authorId = msg.value.author || "Anonymous";
  const createdAt = new Date(msg.value.timestamp).toLocaleString();
  const mentionsText = content.text || '';
  const isTribe = content.type === 'tribe-content';
  const visitUrl = isTribe
    ? `/tribe/${encodeURIComponent(content.tribeId)}`
    : content.root
      ? `/thread/${encodeURIComponent(content.root)}#${encodeURIComponent(msg.key)}`
      : msg.key
        ? `/thread/${encodeURIComponent(msg.key)}#${encodeURIComponent(msg.key)}`
        : null;
  const badge = isTribe && content.tribeName
    ? span({ class: 'tribe-badge' }, content.tribeName)
    : null;
  const typeLabel = isTribe ? 'TRIBE' : 'POST';

  return div({ class: 'card card-rpg mention-card' },
    div({ class: 'card-header' },
      h2({ class: 'card-label' }, `[${typeLabel}]`),
      visitUrl
        ? form({ method: 'GET', action: visitUrl, class: 'inline-form' },
            button({ type: 'submit', class: 'filter-btn' }, i18n.viewDetails || 'View details')
          )
        : null
    ),
    div({ class: 'card-body' },
      div({ class: 'card-section' },
        badge,
        p({ class: 'post-text' }, ...renderUrl(mentionsText || '[No content]'))
      )
    ),
    p({ class: 'card-footer' },
      span({ class: 'date-link' }, `${createdAt} ${i18n.performed || ''} `),
      userLink(authorId)
    )
  );
};

const hasMention = (msg, feedId) => {
  const content = lodash.get(msg, "value.content", {});
  const mentions = content.mentions;
  if (mentions) {
    if (Array.isArray(mentions)) {
      if (mentions.some(m => m.link === feedId || m.feed === feedId)) return true;
    } else if (typeof mentions === 'object') {
      for (const arr of Object.values(mentions)) {
        if (Array.isArray(arr) && arr.some(m => m.link === feedId || m.feed === feedId)) return true;
        if (arr && (arr.link === feedId || arr.feed === feedId)) return true;
      }
    }
  }
  const text = content.text || '';
  if (text.includes(feedId) || text.includes(feedId.slice(1))) return true;
  return false;
};

exports.mentionsView = ({ messages, myFeedId }) => {
  const title = i18n.mentions;
  const description = i18n.mentionsDescription;
  if (!Array.isArray(messages) || messages.length === 0) {
    return template(
      title,
      section(
        div({ class: "tags-header" },
          h2(title),
          p(description)
        )
      ),
      section(
        div({ class: "mentions-list" },
          p({ class: "empty" }, i18n.noMentions)
        )
      )
    );
  }
  const filteredMessages = messages
    .filter(msg => hasMention(msg, myFeedId))
    .sort((a, b) => (b.value.timestamp || 0) - (a.value.timestamp || 0));
  if (filteredMessages.length === 0) {
    return template(
      title,
      section(
        div({ class: "tags-header" },
          h2(title),
          p(description)
        )
      ),
      section(
        div({ class: "mentions-list" },
          p({ class: "empty" }, i18n.noMentions)
        )
      )
    );
  }
  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(description)
      )
    ),
    section(
      div({ class: "mentions-list" },
        filteredMessages.map(renderMessage) 
      )
    )
  );
};

exports.privateView = async (messagesInput, filter) => {
  const messagesRaw = Array.isArray(messagesInput) ? messagesInput : messagesInput.messages
  const messages = (messagesRaw || []).filter(m => m && m.key && m.value && m.value.content && m.value.content.type === 'post' && m.value.content.private === true)
  const userId = await getUserId()

  const isSent = m => (m?.value?.author === userId) || (m?.value?.content?.from === userId)
  const isToUser = m => Array.isArray(m?.value?.content?.to) && m.value.content.to.includes(userId)

  const linkAuthor = (id) => userLink(id)

  const hrefFor = {
    job: (id) => `/jobs/${encodeURIComponent(id)}`,
    project: (id) => `/projects/${encodeURIComponent(id)}`,
    market: (id) => `/market/${encodeURIComponent(id)}`
  }

  const clickableCardProps = (href, extraClass = '') => {
    const props = { class: `pm-card ${extraClass}` }
    if (href) {
      props.onclick = `window.location='${href}'`
      props.tabindex = 0
      props.onkeypress = `if(event.key==='Enter') window.location='${href}'`
    }
    return props
  }

  const chip = (txt) => span({ class: 'chip' }, txt)

  function headerLine({ sentAt, from, toLinks, subject, msgKey, msgSize }) {
    const ecoChip = msgSize ? renderEcoTax(msgSize, msgKey) : null;
    return table({ class: 'pm-info-table' },
      tr(
        td({ class: 'card-label' }, i18n.pmFromLabel || 'From:'),
        td({ class: 'card-value' }, linkAuthor(from))
      ),
      tr(
        td({ class: 'card-label' }, i18n.privateDate || 'Date'),
        td({ class: 'card-value' }, moment(sentAt).format('YYYY/MM/DD HH:mm:ss'))
      ),
      tr(
        td({ class: 'card-label' }, i18n.pmToLabel || 'To:'),
        td({ class: 'card-value' }, ...toLinks.reduce((acc, lnk, i) => i > 0 ? [...acc, br(), lnk] : [lnk], []))
      ),
      tr(
        td({ class: 'card-label' }, i18n.pmSubjectLabel || 'Subject:'),
        td({ class: 'card-value' }, subject || i18n.pmNoSubject || '(no subject)')
      ),
      ecoChip
        ? tr(
            td({ class: 'card-label' }, i18n.ecoTaxLabel || 'ECO Tax'),
            td({ class: 'card-value' }, ecoChip)
          )
        : null
    )
  }

  function msgSizeBytes(m) {
    try { return Buffer.byteLength(JSON.stringify(m && m.value), 'utf8'); } catch (_) { return 0; }
  }

  function actions({ key, replyId, subjectRaw, text }) {
    const stop = { onclick: 'event.stopPropagation()' }
    const subjectReply = /^(\s*RE:\s*)/i.test(subjectRaw || '') ? (subjectRaw || '') : `RE: ${subjectRaw || ''}`
    const isSelf = replyId === userId
    return div({ class: 'pm-actions' },
      isSelf ? null : form({ method: 'GET', action: '/pm', class: 'pm-action-form', ...stop },
        input({ type: 'hidden', name: 'recipients', value: replyId }),
        input({ type: 'hidden', name: 'subject', value: subjectReply }),
        input({ type: 'hidden', name: 'quote', value: text || '' }),
        button({ type: 'submit', class: 'pm-btn reply-btn' }, i18n.pmReply.toUpperCase())
      ),
      form({ method: 'POST', action: `/inbox/delete/${encodeURIComponent(key)}`, class: 'pm-action-form', ...stop },
        button({ type: 'submit', class: 'pm-btn delete-btn' }, i18n.privateDelete.toUpperCase())
      )
    )
  }

  function canonicalSubject(s) {
    return (s || '').replace(/^\s*(RE:\s*)+/i, '').trim()
  }

  function participantsKey(m) {
    const c = m?.value?.content || {}
    const set = new Set([m?.value?.author, ...(Array.isArray(c.to) ? c.to : [])])
    return Array.from(set).sort().join('|')
  }

  function threadId(m) {
    return canonicalSubject(m?.value?.content?.subject || '') + '||' + participantsKey(m)
  }

  function threadLevel(s) {
    const m = (s || '').match(/RE:/gi)
    return m ? Math.min(m.length, 8) : 0
  }

  function quoted(str) {
    const m = str.match(/"([^"]+)"/)
    return m ? m[1] : ''
  }

  function pickLink(str, kind) {
    if (kind === 'job') {
      const m = str.match(/\/jobs\/([%A-Za-z0-9/+._=-]+\.sha256)/)
      return m ? m[1] : ''
    }
    if (kind === 'project') {
      const m = str.match(/\/projects\/([%A-Za-z0-9/+._=-]+\.sha256)/)
      return m ? m[1] : ''
    }
    if (kind === 'market') {
      const m = str.match(/\/market\/([%A-Za-z0-9/+._=-]+\.sha256)/)
      return m ? m[1] : ''
    }
    return ''
  }

  function clickableLinks(str) {
    const lines = str.split('\n')
    const parts = []
    let quoteBuffer = []
    const flushQuote = () => {
      if (quoteBuffer.length) {
        parts.push(`<div class="pm-quote">${quoteBuffer.join('<br>')}</div>`)
        quoteBuffer = []
      }
    }
    for (const line of lines) {
      if (/^>\s?/.test(line)) {
        quoteBuffer.push(line.replace(/^>\s?/, ''))
      } else {
        flushQuote()
        parts.push(line)
      }
    }
    flushQuote()
    return parts.join('<br>')
      .replace(/(@[a-zA-Z0-9/+._=-]+\.ed25519)/g, (match, id) => `<a class="user-link" href="/author/${encodeURIComponent(id)}">${userLinkLabel(id)}</a>`)
      .replace(/\/jobs\/([%A-Za-z0-9/+._=-]+\.sha256)/g, (match, id) => `<a class="job-link" href="${hrefFor.job(id)}">${match}</a>`)
      .replace(/\/projects\/([%A-Za-z0-9/+._=-]+\.sha256)/g, (match, id) => `<a class="project-link" href="${hrefFor.project(id)}">${match}</a>`)
      .replace(/\/market\/([%A-Za-z0-9/+._=-]+\.sha256)/g, (match, id) => `<a class="market-link" href="${hrefFor.market(id)}">${match}</a>`)
      .replace(/\/calendars\/([%A-Za-z0-9/+._=-]+\.sha256)/g, (match, id) => `<a class="calendar-link" href="/calendars/${encodeURIComponent(id)}">${match}</a>`)
      .replace(/\/ai\/ask\?[^\s<"]+/g, (match) => `<a class="ai-ask-link" href="${match}">${match}</a>`)
      .replace(/(?<![A-Za-z0-9_])\/(profile|inbox|invites|peers|tribes|inhabitants|publish|activity|settings|modules|banking|larp|melody|audios|videos|images|documents|bookmarks|torrents|forum|feed|fediverse|events|tasks|votes|reports|market|jobs|projects|shops|pixelia|opinions|trending|agenda|cv|favorites|stats|blockexplorer|wallet|chats|pads|maps|calendars|ai|games)(?![A-Za-z0-9_\/])/g, (match) => `<a class="oasis-path-link" href="${match}">${match}</a>`)
      .replace(/(https?:\/\/[^\s<"]+)/g, (match) => `<a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a>`)
  }

  const threads = {}
  for (const m of messages) {
    const tid = threadId(m)
    if (!threads[tid]) threads[tid] = []
    threads[tid].push(m)
  }

  const inboxSet = new Set()
  for (const arr of Object.values(threads)) {
    for (const m of arr) {
      if (!isSent(m) && isToUser(m)) inboxSet.add(m)
    }
  }

  const isReminder = m => {
    const s = String(m?.value?.content?.subject || '')
    return /^(Task Reminder:|Calendar Reminder:)/i.test(s)
  }

  const data =
    filter === 'sent' ? messages.filter(m => isSent(m) && !isReminder(m)) :
    filter === 'reminders' ? messages.filter(isReminder) :
    filter === 'inbox' ? Array.from(inboxSet).filter(m => !isReminder(m)) :
    messages

  const inboxCount = Array.from(inboxSet).filter(m => !isReminder(m)).length
  const sentCount = messages.filter(m => isSent(m) && !isReminder(m)).length
  const reminderCount = messages.filter(isReminder).length

  const sorted = [...data].sort((a, b) => {
    const ta = threadId(a)
    const tb = threadId(b)
    if (ta < tb) return -1
    if (ta > tb) return 1
    const sa = new Date(a?.value?.content?.sentAt || a.timestamp || 0).getTime()
    const sb = new Date(b?.value?.content?.sentAt || b.timestamp || 0).getTime()
    return sa - sb
  })

  function JobCard({ type, sentAt, from, toLinks, text, key, msgSize }) {
    const isSub = type === 'JOB_SUBSCRIBED'
    const icon = isSub ? '🟡' : '🟠'
    const titleH = isSub ? (i18n.inboxJobSubscribedTitle || 'New subscription to your job offer') : (i18n.inboxJobUnsubscribedTitle || 'Unsubscription from your job offer')
    const jobTitle = quoted(text) || 'job'
    const jobId = pickLink(text, 'job')
    const href = jobId ? hrefFor.job(jobId) : null
    return div(
      clickableCardProps(href, `job-notification thread-level-0`),
      headerLine({ sentAt, from, toLinks, subject: type, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `${icon} ${i18n.pmBotJobs} · ${titleH}`),
      p(
        i18n.pmInhabitantWithId, ' ',
        linkAuthor(from), ' ',
        isSub ? i18n.pmHasSubscribedToYourJobOffer : (i18n.pmHasUnsubscribedFromYourJobOffer || 'has unsubscribed from your job offer'),
        ' ',
        href ? a({ class: 'job-link', href }, `"${jobTitle}"`) : `"${jobTitle}"`
      ),
      actions({ key, replyId: from, subjectRaw: jobTitle, text })
    )
  }

  function ProjectFollowCard({ type, sentAt, from, toLinks, text, key, msgSize }) {
    const isFollow = type === 'PROJECT_FOLLOWED'
    const icon = isFollow ? '🔔' : '🔕'
    const titleH = isFollow
      ? (i18n.inboxProjectFollowedTitle || 'New follower of your project')
      : (i18n.inboxProjectUnfollowedTitle || 'Unfollowed your project')
    const projectTitle = quoted(text) || 'project'
    const projectId = pickLink(text, 'project')
    const href = projectId ? hrefFor.project(projectId) : null
    return div(
      clickableCardProps(href, `project-${isFollow ? 'follow' : 'unfollow'}-notification thread-level-0`),
      headerLine({ sentAt, from, toLinks, subject: type, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `${icon} ${i18n.pmBotProjects} · ${titleH}`),
      p(
        i18n.pmInhabitantWithId, ' ',
        userLink(from),
        ' ',
        isFollow ? (i18n.pmHasFollowedYourProject || 'has followed your project') : (i18n.pmHasUnfollowedYourProject || 'has unfollowed your project'),
        ' ',
        href ? a({ class: 'project-link', href }, `"${projectTitle}"`) : `"${projectTitle}"`
      ),
      actions({ key, replyId: from, subjectRaw: projectTitle, text })
    )
  }

  function MarketSoldCard({ sentAt, from, toLinks, subject, text, key, msgSize }) {
    const itemTitle = quoted(subject) || quoted(text) || 'item'
    const buyerId = (text.match(/OASIS ID:\s*([\w=/+.-]+)/) || [])[1] || from
    const price = (text.match(/for:\s*\$([\d.]+)/) || [])[1] || ''
    const marketId = pickLink(text, 'market')
    const href = marketId ? hrefFor.market(marketId) : null
    return div(
      clickableCardProps(href, 'market-sold-notification thread-level-0'),
      headerLine({ sentAt, from, toLinks, subject, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `💰 ${i18n.pmBotMarket} · ${i18n.inboxMarketItemSoldTitle}`),
      p(
        i18n.pmYourItem, ' ',
        href ? a({ class: 'market-link', href }, `"${itemTitle}"`) : `"${itemTitle}"`,
        ' ',
        i18n.pmHasBeenSoldTo, ' ',
        linkAuthor(buyerId),
        price ? ` ${i18n.pmFor} $${price}.` : '.'
      ),
      actions({ key, replyId: buyerId, subjectRaw: itemTitle, text })
    )
  }

  function ProjectPledgeCard({ sentAt, from, toLinks, content, text, key, msgSize }) {
    const amount = content.meta?.amount ?? (text.match(/pledged\s+([\d.]+)/)?.[1] || '0')
    const projectTitle = content.meta?.projectTitle ?? (text.match(/project\s+"([^"]+)"/)?.[1] || 'project')
    const projectId = content.meta?.projectId ?? pickLink(text, 'project')
    const href = projectId ? hrefFor.project(projectId) : null
    return div(
      clickableCardProps(href, 'project-pledge-notification thread-level-0'),
      headerLine({ sentAt, from, toLinks, subject: 'PROJECT_PLEDGE', msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `💚 ${i18n.pmBotProjects} · ${i18n.inboxProjectPledgedTitle}`),
      p(
        i18n.pmInhabitantWithId, ' ',
        linkAuthor(from), ' ',
        i18n.pmHasPledged, ' ',
        chip(`${amount} ECO`), ' ',
        i18n.pmToYourProject, ' ',
        href ? a({ class: 'project-link', href }, `"${projectTitle}"`) : `"${projectTitle}"`
      ),
      actions({ key, replyId: from, subjectRaw: projectTitle, text })
    )
  }

  const { renderEncryptedChip } = require('./clearnet_view');
  return template(
    i18n.private,
    section(
      div({ class: 'tags-header' },
        div({ class: 'title-with-chip' }, h2(i18n.private), renderEncryptedChip(i18n)),
        p(i18n.privateDescription)
      ),
      (() => {
        const pmVis = getConfig().pmVisibility === 'mutuals' ? 'mutuals' : 'whole'
        const pmVisLabel = pmVis === 'mutuals' ? i18n.settingsPmVisibilityMutuals : i18n.settingsPmVisibilityWhole
        const pmVisIcon = pmVis === 'mutuals' ? '🤝' : '🌐'
        const nextVis = pmVis === 'mutuals' ? 'whole' : 'mutuals'
        const nextLabel = nextVis === 'mutuals'
          ? (i18n.inboxToggleToMutuals || 'Switch to mutuals')
          : (i18n.inboxToggleToWhole || 'Switch to whole')
        return div({ class: 'pm-exposition inbox-exposition' },
          span({ class: 'inbox-filters-label' }, i18n.inboxFiltersLabel || 'Filters:'),
          span({ class: `pm-exposition-chip pm-exposition-${pmVis}` },
            span({ class: 'pm-exposition-icon' }, pmVisIcon),
            span({ class: 'pm-exposition-text' }, pmVisLabel)
          ),
          form({ method: 'POST', action: '/settings/pm-visibility?returnTo=/inbox', class: 'inbox-vis-toggle' },
            input({ type: 'hidden', name: 'pmVisibility', value: nextVis }),
            button({ type: 'submit', class: 'btn' }, nextLabel)
          )
        )
      })(),
      div({ class: 'filters' },
        form({ method: 'GET', action: '/inbox' }, [
          button({
            type: 'submit',
            name: 'filter',
            value: 'inbox',
            class: filter === 'inbox' ? 'filter-btn active' : 'filter-btn'
          }, `${i18n.privateInbox} (${inboxCount})`),
          button({
            type: 'submit',
            name: 'filter',
            value: 'reminders',
            class: filter === 'reminders' ? 'filter-btn active' : 'filter-btn'
          }, `${i18n.privateReminders || 'Reminders'} (${reminderCount})`),
          button({
            type: 'submit',
            name: 'filter',
            value: 'sent',
            class: filter === 'sent' ? 'filter-btn active' : 'filter-btn'
          }, `${i18n.privateSent} (${sentCount})`),
          button({
            type: 'submit',
            name: 'filter',
            value: 'create',
            class: 'create-button',
            formaction: '/pm',
            formmethod: 'GET'
          }, i18n.pmCreateButton)
        ])
      ),
      div({ class: 'message-list' },
        (() => {
          function renderMsg(msg) {
            const content = msg.value.content
            const author = msg.value.author
            const subjectRaw = content.subject || ''
            const subjectU = subjectRaw.toUpperCase()
            const text = content.text || ''
            const sentAt = new Date(content.sentAt || msg.timestamp)
            const fromResolved = content.from || author
            const toLinks = Array.isArray(content.to) ? content.to.map(addr => linkAuthor(addr)) : []
            const level = threadLevel(subjectRaw)
            const msgSize = msgSizeBytes(msg)

            if (subjectU === 'JOB_SUBSCRIBED' || subjectU === 'JOB_UNSUBSCRIBED') {
              return JobCard({ type: subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'PROJECT_FOLLOWED' || subjectU === 'PROJECT_UNFOLLOWED') {
              return ProjectFollowCard({ type: subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'MARKET_SOLD') {
              return MarketSoldCard({ sentAt, from: fromResolved, toLinks, subject: subjectRaw, text, key: msg.key, msgSize })
            }
            if (subjectU === 'PROJECT_PLEDGE' || content.meta?.type === 'project-pledge') {
              return ProjectPledgeCard({ sentAt, from: fromResolved, toLinks, content, text, key: msg.key, msgSize })
            }

            return div(
              { class: 'pm-card normal-pm' },
              headerLine({ sentAt, from: fromResolved, toLinks, subject: subjectRaw, msgKey: msg.key, msgSize }),
              div({ class: 'message-text', innerHTML: sanitizeHtml(clickableLinks(text)) }),
              actions({ key: msg.key, replyId: fromResolved, subjectRaw, text })
            )
          }

          const threadGroups = {}
          const threadOrder = []
          for (const msg of sorted) {
            const tid = threadId(msg)
            if (!threadGroups[tid]) {
              threadGroups[tid] = []
              threadOrder.push(tid)
            }
            threadGroups[tid].push(msg)
          }

          if (!threadOrder.length) return p({ class: 'empty' }, i18n.noPrivateMessages)

          return threadOrder.map(tid => {
            const msgs = threadGroups[tid]
            const original = msgs[0]
            const replies = msgs.slice(1)

            if (!replies.length) {
              return renderMsg(original)
            }

            const replyLabel = `${replies.length} ${replies.length === 1 ? (i18n.pmReply || 'reply') : (i18n.pmReplies || 'replies')}`

            return div({ class: 'pm-thread' },
              renderMsg(original),
              details({ class: 'pm-thread-details' },
                summary({ class: 'pm-thread-toggle' },
                  span({ class: 'pm-thread-icon' }, '▶'),
                  span(replyLabel)
                ),
                div({ class: 'pm-thread-replies' },
                  ...replies.map(renderMsg)
                )
              )
            )
          })
        })()
      )
    )
  )
}

exports.publishCustomView = async () => {
  const action = "/publish/custom";
  const method = "post";

  return template(
    i18n.publishCustom,
    section(
      div({ class: "tags-header" },
        h2(i18n.publishCustom),
        p(i18n.publishCustomDescription)
      ),
      form(
        { action, method },
        textarea(
          {
            autofocus: true,
            required: true,
            name: "text",
            rows: 10,
            class: "textarea-full"
          },
          "{\n",
          '  "type": "feed",\n',
          '  "hello": "world"\n',
          "}"
        ),
        br(),
        br(),
        button({ type: "submit" }, i18n.submit)
      )
    ),
    section(
      div({ class: "tags-header" },
        p(i18n.publishBasicInfo({ href: "/publish" }))
      )
    )
  );
};

exports.threadView = ({ messages, spreadMap = null }) => {
  const rootMessage = messages[0];
  const rootAuthorName = rootMessage.value.meta.author.name;

  const needsPdfViewer = Array.isArray(messages) && messages.some((m) => {
    const t = String(m?.value?.content?.type || "").toLowerCase();
    return t === "document";
  });

  const tpl = template(
    [`@${rootAuthorName}`],
    div(thread(messages, spreadMap))
  );

  return `${tpl}${
    needsPdfViewer
      ? `<script type="module" src="/js/pdf.min.mjs"></script>
         <script src="/js/pdf-viewer.js"></script>`
      : ""
  }`;
};

exports.publishView = (preview, text, contentWarning) => {
  return template(
    i18n.publish,
    section(
      div({ class: "tags-header" },
        h2(i18n.publishBlog),
        p(i18n.publishLabel({ markdownUrl, linkTarget: "_blank" }))
      )
    ),
    section(
      div({ class: "publish-form" },
        form(
          {
            action: "/publish/preview",
            method: "post",
            enctype: "multipart/form-data",
          },
          [
            label({ for: "contentWarning" }, i18n.blogSubject),
            br(),
            input({
              name: "contentWarning",
              id: "contentWarning",
              type: "text",
              class: "contentWarning",
              value: contentWarning || "",
              placeholder: i18n.contentWarningPlaceholder
            }),
            br(),
            label({ for: "text" }, i18n.blogMessage),
            br(),
            textarea(
              {
                required: true,
                name: "text",
                id: "text",
                rows: "6",
                cols: "50",
                placeholder: i18n.publishWarningPlaceholder,
                class: "publish-textarea",
                maxlength: "8096"
              },
              text || ""
            ),
            br(),
            label({ for: "blob" }, i18n.blogImage || "Upload media (max-size: 50MB)"),
            br(),
            input({ type: "file", id: "blob", name: "blob" }),
            br(), br(),
            button({ type: "submit" }, i18n.blogPublish)
          ]
        )
      )
    ),
    preview || "",
    section(
      div({ class: "tags-header" },
        p(i18n.publishCustomInfo({ href: "/publish/custom" }))
      )
    )
  );
};

//generate preview
const ensureAt = (id) => {
  const s = String(id || "").trim()
  if (!s) return ""
  return s.startsWith("@") ? s : `@${s.replace(/^@+/, "")}`
}

const stripAt = (id) => String(id || "").trim().replace(/^@+/, "")

const authorHref = (feed) => `/author/${encodeURIComponent(ensureAt(feed))}`

const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const escapeHtml = (s) => {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const normalizeMentionLinks = (text) => {
  let t = String(text || "")
  t = t.replace(
    /\[@([^\]]+)\]\s*\(\s*@?([^) \t\r\n]+\.ed25519)\s*\)/g,
    (_m, label, feed) => `[@${String(label || "").replace(/^@+/, "")}](@${String(feed || "").replace(/^@+/, "")})`
  )
  return t
}

const injectResolvedMentions = (text, mentions) => {
  let out = String(text || "")
  const obj = mentions && typeof mentions === "object" ? mentions : {}

  const entries = Object.entries(obj)
    .map(([k, v]) => [String(k || "").trim().replace(/\s+/g, " "), Array.isArray(v) ? v : []])
    .filter(([k, v]) => k && v.length === 1)

  entries.sort((a, b) => b[0].length - a[0].length)

  for (const [token, list] of entries) {
    const m = list[0] || {}
    const feed = ensureAt(m.feed || m.link || m.id || "")
    if (!feed) continue

    const label = String(m.name || token).replace(/^@+/, "")
    const parts = token.split(/\s+/).filter(Boolean).map(escapeRegex)
    if (!parts.length) continue

    const tokenPattern = parts.join("\\s+")
    const re = new RegExp(`(^|\\s)(?!\\[)@${tokenPattern}(?=\\b|$)`, "g")
    out = out.replace(re, (match, prefix) => `${prefix}[@${label}](${feed})`)
  }

  return out
}

const markdownMentionsToHtml = (markdownText) => {
  const escaped = escapeHtml(String(markdownText || ""))
  const withBr = escaped.replace(/\r\n|\r|\n/g, "<br>")

  const unescapeBlob = (b) => b.replace(/&amp;/g, '&')

  const escAttr = (s) => String(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;')

  const withImages = withBr.replace(
    /!\[([^\]]*)\]\(\s*(&amp;[^)\s]+\.sha256)\s*\)/g,
    (_m, alt, blob) => `<img src="/blob/${encodeURIComponent(unescapeBlob(blob))}" alt="${escAttr(alt)}" class="post-image">`
  )

  const withVideos = withImages.replace(
    /\[video:([^\]]*)\]\(\s*(&amp;[^)\s]+\.sha256)\s*\)/g,
    (_m, _name, blob) => `<video controls class="post-video" src="/blob/${encodeURIComponent(unescapeBlob(blob))}"></video>`
  )

  const withAudios = withVideos.replace(
    /\[audio:([^\]]*)\]\(\s*(&amp;[^)\s]+\.sha256)\s*\)/g,
    (_m, _name, blob) => `<audio controls class="post-audio" src="/blob/${encodeURIComponent(unescapeBlob(blob))}"></audio>`
  )

  const withPdfs = withAudios.replace(
    /\[pdf:([^\]]*)\]\(\s*(&amp;[^)\s]+\.sha256)\s*\)/g,
    (_m, name, blob) => `<a class="post-pdf" href="/blob/${encodeURIComponent(unescapeBlob(blob))}" target="_blank">${escapeHtml(name || i18n.pdfFallbackLabel || 'PDF')}</a>`
  )

  const withMentions = withPdfs.replace(
    /\[@([^\]]+)\]\(\s*@?([^) \t\r\n]+\.ed25519)\s*\)/g,
    (_m, label, feed) => {
      const href = authorHref(feed)
      const shown = `@${String(label || "").replace(/^@+/, "")}`
      return `<a class="mention" href="${escAttr(href)}">${escapeHtml(shown)}</a>`
    }
  )

  const withLinks = withMentions.replace(
    /(https?:\/\/[^\s"'<>]+)/g,
    (u) => `<a href="${escAttr(u)}" target="_blank" rel="noopener noreferrer">${escAttr(u)}</a>`
  )

  return withLinks
}

const generatePreview = ({ previewData, contentWarning, action }) => {
  const mentions =
    previewData && previewData.mentions && typeof previewData.mentions === "object"
      ? previewData.mentions
      : {}

  const rawText = String((previewData && previewData.text) || "")
  const normalized = normalizeMentionLinks(rawText)
  const injected = injectResolvedMentions(normalized, mentions)
  const publishText = normalizeMentionLinks(injected)

  const previewHtml = markdownMentionsToHtml(publishText)

  const mentionCards = Object.entries(mentions)
    .map(([_token, matches]) => {
      const list = Array.isArray(matches) ? matches : []
      const first = list.find((x) => x && (x.feed || x.link || x.id)) || null
      if (!first) return null

      const feed = ensureAt(first.feed || first.link || first.id || "")
      if (!feed) return null

      const nameRaw = String(first.name || stripAt(feed) || "")
      const nameText = nameRaw.startsWith("@") ? nameRaw : `@${nameRaw}`

      const rel = first.rel || {}

      const relationshipBadge = rel.me
        ? span({ class: "status you" }, i18n.relationshipYou)
        : rel.blocking
          ? span({ class: "status blocked" }, i18n.relationshipBlocking)
          : rel.following && rel.followsMe
            ? span({ class: "status mutual" }, i18n.relationshipMutuals)
            : rel.following
              ? span({ class: "status supporting" }, i18n.relationshipFollowing)
              : rel.followsMe
                ? span({ class: "status supported-by" }, i18n.relationshipTheyFollow)
                : span({ class: "status" }, i18n.relationshipNone)

      const avatar = first.img || first.image || ""
      const avatarUrl =
        typeof avatar === "string" && avatar.startsWith("&")
          ? `/blob/${encodeURIComponent(avatar)}`
          : (typeof avatar === "string" && avatar ? avatar : "/assets/images/default-avatar.png")

      return div(
        { class: "mention-card" },
        a({ href: authorHref(feed) }, img({ src: avatarUrl, class: "avatar-profile" })),
        br(),
        div(
          { class: "mention-name" },
          span({ class: "label" }, `${i18n.mentionsName}: `),
          a({ href: authorHref(feed) }, nameText)
        ),
        div(
          { class: "mention-relationship" },
          span({ class: "label" }, `${i18n.mentionsRelationship}: `),
          relationshipBadge,
          div(
            { class: "mention-relationship-details" },
            span(
              { class: "mentions-listing" },
              userLink(feed)
            )
          )
        )
      )
    })
    .filter(Boolean)

  return div(
    section(
      { class: "post-preview" },
      div(
        { class: "preview-content" },
        h2(i18n.messagePreview),
        contentWarning ? div({ class: "content-warning-preview" }, escapeHtml(contentWarning)) : null,
        div({ class: "preview-rendered", innerHTML: previewHtml })
      )
    ),
    section(
      { class: "mention-suggestions" },
      mentionCards.length ? h2(i18n.mentionsMatching) : null,
      ...mentionCards
    ),
    section(
      form(
        { action, method: "post" },
        input({ type: "hidden", name: "text", value: publishText }),
        input({ type: "hidden", name: "contentWarning", value: contentWarning || "" }),
        input({ type: "hidden", name: "mentions", value: JSON.stringify(mentions) }),
        button({ type: "submit" }, i18n.publish)
      )
    )
  )
}

exports.previewView = ({ previewData, contentWarning }) => {
  const publishAction = "/publish"
  const preview = generatePreview({
    previewData,
    contentWarning,
    action: publishAction,
  })
  return exports.publishView(preview, (previewData && previewData.text) || "", contentWarning)
}

const viewInfoBox = ({ viewTitle = null, viewDescription = null }) => {
  if (!viewTitle && !viewDescription) {
    return null
  }
  return section(
    { class: "viewInfo" },
    viewTitle ? h1(viewTitle) : null,
    viewDescription ? em(viewDescription) : null
  )
}
//generate preview

exports.likesView = async ({ messages, feed, name, spreadMap = null }) => {
  const authorLink = a(
    { href: `/author/${encodeURIComponent(feed)}` },
    "@" + name
  );
  const getSpread = (key) => (spreadMap instanceof Map ? spreadMap.get(key) : null) || null;

  return template(
    ["@", name],
    viewInfoBox({
      viewTitle: span(authorLink),
      viewDescription: span(i18n.spreadedDescription)
    }),
    messages.map((msg) => post({ msg, spreadInfo: getSpread(msg.key) }))
  );
};

const messageListView = ({
  messages,
  viewTitle = null,
  viewDescription = null,
  viewElements = null,
  aside = null,
  spreadMap = null,
}) => {
  const hasHeader = !!viewElements;
  const titleBlock = hasHeader
    ? viewElements
    : div({ class: "tags-header" },
        h2(viewTitle),
        p(viewDescription)
      );
  const getSpread = (key) => (spreadMap instanceof Map ? spreadMap.get(key) : null) || null;
  return template(
    viewTitle,
    section(titleBlock),
    messages.map((msg) => post({ msg, aside, spreadInfo: getSpread(msg.key) }))
  );
};

exports.popularView = ({ messages, prefix, spreadMap = null }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.popular),
    p(i18n.popularDescription)
  );
  return messageListView({
    messages,
    viewTitle: i18n.popular,
    viewElements: [header, prefix],
    spreadMap
  });
};

exports.extendedView = ({ messages, spreadMap = null }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.extended),
    p(i18n.extendedDescription)
  );
  return messageListView({
    messages,
    viewTitle: i18n.extended,
    viewElements: header,
    spreadMap
  });
};

exports.latestView = ({ messages, spreadMap = null }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.latest),
    p(i18n.latestDescription)
  );
  return messageListView({
    messages,
    viewTitle: i18n.latest,
    viewElements: header,
    spreadMap
  });
};

exports.topicsView = ({ messages, prefix, spreadMap = null }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.topics),
    p(i18n.topicsDescription)
  );
  return messageListView({
    messages,
    viewTitle: i18n.topics,
    viewElements: [header, prefix],
    spreadMap
  });
};

exports.summaryView = ({ messages, spreadMap = null }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.summaries),
    p(i18n.summariesDescription)
  );
  return messageListView({
    messages,
    viewTitle: i18n.summaries,
    viewElements: header,
    aside: true,
    spreadMap
  });
};

exports.spreadedView = ({ messages }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.spreaded),
    p(i18n.spreadedDescription)
  );
  return spreadedListView({
    messages,
    viewTitle: i18n.spreaded,
    viewElements: header
  });
};

exports.threadsView = ({ messages, spreadMap = null }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.threads),
    p(i18n.threadsDescription)
  );
  return messageListView({
    messages,
    viewTitle: i18n.threads,
    viewElements: header,
    aside: true,
    spreadMap
  });
};

exports.previewSubtopicView = async ({
  previewData,
  messages,
  myFeedId,
  contentWarning,
}) => {
  const publishAction = `/subtopic/${encodeURIComponent(messages[0].key)}`;
  const preview = generatePreview({
    previewData,
    contentWarning,
    action: publishAction,
  });
  return exports.subtopicView(
    { messages, myFeedId },
    preview, 
    previewData.text,
    contentWarning
  );
};

exports.subtopicView = async (
  { messages, myFeedId, spreadMap = null },
  preview,
  text,
  contentWarning
) => {
  const subtopicForm = `/subtopic/preview/${encodeURIComponent(
    messages[messages.length - 1].key
  )}`;

  let markdownMention;
  const getSpread = (key) => (spreadMap instanceof Map ? spreadMap.get(key) : null) || null;

  const messageElements = await Promise.all(
    messages.reverse().map((message) => {
      debug("%O", message);
      const authorName = message.value.meta.author.name;
      const authorFeedId = message.value.author;
      if (authorFeedId !== myFeedId) {
        if (message.key === messages[0].key) {
          const x = `[@${authorName}](${authorFeedId})\n\n`;
          markdownMention = x;
        }
      }
      return post({ msg: message, spreadInfo: getSpread(message.key) });
    })
  );

  const authorName = messages[messages.length - 1].value.meta.author.name;

  return template(
    i18n.subtopicTitle({ authorName }),
    div({ class: "thread-container" }, messageElements),
    form(
      { action: subtopicForm, method: "post", enctype: "multipart/form-data" },
      i18n.blogSubject,
      br(),
      label(
        i18n.contentWarningLabel,
        input({
          name: "contentWarning",
          type: "text",
          class: "contentWarning",
          value: contentWarning ? contentWarning : "",
          placeholder: i18n.contentWarningPlaceholder,
        })
      ),
      br(),
      label({ for: "text" }, i18n.blogMessage),
      br(),
      textarea(
        {
          autofocus: true,
          required: true,
          name: "text",
          rows: "6",
          cols: "50",
          placeholder: i18n.publishWarningPlaceholder,
        },
        text ? text : markdownMention
      ),
      br(),
      label(
        { for: "blob" },
        i18n.blogImage || "Upload media (max-size: 50MB)"
      ),
      input({ type: "file", id: "blob", name: "blob" }),
      br(),
      br(),
      button({ type: "submit" }, i18n.blogPublish)
    ),
    preview ? div({ class: "comment-preview" }, preview) : ""
  );
};
