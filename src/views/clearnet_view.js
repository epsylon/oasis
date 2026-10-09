const { a, br, div, input, option, select, span, strong, form, button, label } = require("../server/node_modules/hyperaxe");
const { renderStyledHtml } = require('../backend/renderStyledText');
const sharedState = require('../configs/shared-state');
const cnPkg = (() => { try { return require('../server/package.json'); } catch (_) { return {}; } })();
const mv = () => require('./main_views');
const cnScope = () => { try { return require('../models/typed_log').requestScope.getStore() || {}; } catch (_) { return {}; } };
const cnWithLang = (href, lang) => {
  if (!lang || !/^\/c(?:[/?#]|$)/.test(href) || /[?&]lang=/.test(href)) return href;
  const [pathAndQuery, hash] = href.split('#');
  const joined = `${pathAndQuery}${pathAndQuery.includes('?') ? '&' : '?'}lang=${lang}`;
  return hash != null ? `${joined}#${hash}` : joined;
};
const propagateLang = (html, lang) => !lang ? html : String(html)
  .replace(/href="(\/c(?:[/?#][^"]*)?)"/g, (m, href) => `href="${cnWithLang(href, lang)}"`)
  .replace(/(<form[^>]*action="\/c(?:\/[^"]*)?"[^>]*>)/g, (m) => `${m}<input type="hidden" name="lang" value="${lang}"/>`);
const renderLangSelector = (current) => {
  const langs = Object.keys(require('../client/assets/translations/i18n'));
  const scope = cnScope();
  const base = String(scope.path || '/c');
  const params = new URLSearchParams(String(scope.query || ''));
  params.delete('lang');
  const others = langs.filter(l => l !== current).map(l => {
    const q = new URLSearchParams(params); q.set('lang', l);
    return `<a href="${escapeHtml(`${base}?${q.toString()}`)}" lang="${l}">${l.toUpperCase()}</a>`;
  }).join('');
  return `<div class="cn-lang" tabindex="0"><span class="cn-lang-current">${escapeHtml(String(current).toUpperCase())}</span><div class="cn-lang-list">${others}</div></div>`;
};
const cnText = (key, fallback) => { const v = mv().i18n[key]; return typeof v === 'string' && v ? v : fallback; };

const STAT_TYPE_KEYS = { post:'statsPost', event:'statsEvent', task:'statsTask', forum:'statsForum', tribe:'statsTribe', market:'statsMarket', job:'statsJob', project:'statsProject', shop:'statsShop', image:'statsImage', video:'statsVideo', audio:'statsAudio', document:'statsDocument', bookmark:'statsBookmark', transfer:'statsTransfer', map:'statsMap' };
const STAT_ORDER = ['post','event','task','forum','tribe','market','job','project','shop','image','video','audio','document','bookmark','transfer','map'];
const renderContentStats = (stats, i18nObj = {}) => {
  if (!stats || typeof stats !== 'object') return null;
  const chips = STAT_ORDER
    .filter(t => (stats[t] || 0) > 0)
    .map(t => span({ class: 'inhabitant-stat', title: `${i18nObj[STAT_TYPE_KEYS[t]] || t}: ${stats[t]}` },
      span({ class: 'inhabitant-stat-label' }, i18nObj[STAT_TYPE_KEYS[t]] || t),
      strong({ class: 'inhabitant-stat-value' }, String(stats[t]))
    ));
  if (!chips.length) return null;
  return div({ class: 'inhabitant-stats-box' },
    div({ class: 'inhabitant-stats-grid' }, ...chips)
  );
};

const escapeHtml = (s) => String(s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const renderTagChips = (tags) => {
  const list = (Array.isArray(tags) ? tags : [])
    .map(t => String(t || '').trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!list.length) return '';
  const chips = list.map(raw => String(raw).replace(/^#+/, '')).filter(Boolean).map(t => `<a class="cn-tag" href="/c?q=%23${encodeURIComponent(t)}">#${escapeHtml(t)}</a>`).join('');
  return `<div class="cn-tags">${chips}</div>`;
};

const KIND_KEYS = { audio: 'cnKindAudio', blog: 'cnKindBlog', bookmark: 'cnKindBookmark', document: 'cnKindDocument', event: 'cnKindEvent', feed: 'cnKindFeed', image: 'cnKindImage', job: 'cnKindJob', market: 'cnKindMarket', podcast: 'cnKindPodcast', project: 'cnKindProject', course: 'cnKindCourse', shop: 'cnKindShop', torrent: 'cnKindTorrent', file: 'cnKindFile', video: 'cnKindVideo', wiki: 'cnKindWiki', emergency: 'emergencyLabel', campaign: 'campaignLabel', housing: 'housingTitle', room: 'cnKindRoom', map: 'cnKindMap', calendar: 'calendarTitle' };
const kindLabel = (kind) => cnText(KIND_KEYS[String(kind || '').toLowerCase()], String(kind || ''));
const renderKindTag = (kind) => `<span class="cn-kind-tag">[${escapeHtml(kindLabel(kind).toUpperCase())}]</span>`;

const renderRichText = (s, { links = true, wikiLinks = null } = {}) => renderStyledHtml(s, {
  blobPrefix: '/c/blob/',
  internalLinks: false,
  links,
  plainUrlClass: 'cn-url',
  hashtagHref: links ? (tag) => `/c?q=%23${encodeURIComponent(tag)}` : null,
  wikiLink: wikiLinks ? (target, slug, label) => wikiLinks.has(slug)
    ? a({ href: wikiLinks.get(slug), class: 'cn-wiki-link' }, label)
    : label : null
}).replace(/\n/g, '<br/>');

const blobIdOf = (v) => {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (s.startsWith('&')) return s;
  const m = s.match(/\((&[^)]+\.sha256)\)/);
  if (m) return m[1];
  return null;
};

const blobUrl = (v) => {
  const id = blobIdOf(v);
  return id ? `/c/blob/${encodeURIComponent(id)}` : null;
};

const renderClearnetSelector = (on = false, i18nObj = {}) =>
  div({ class: 'clearnet-choice' },
    div({ class: 'clearnet-choice-options' },
      label({ class: 'clearnet-choice-option' }, input({ type: 'radio', name: 'clearnet', value: '0', ...(on ? {} : { checked: true }) }), renderReachChip(false, i18nObj)),
      label({ class: 'clearnet-choice-option' }, input({ type: 'radio', name: 'clearnet', value: '1', ...(on ? { checked: true } : {}) }), renderReachChip(true, i18nObj))
    )
  );

const renderClearnetSwitch = (kind, id, on = false) => id
  ? form({ method: 'POST', action: `/clearnet/item/${encodeURIComponent(id)}`, class: 'clearnet-switch' },
      input({ type: 'hidden', name: 'kind', value: kind }),
      button({ type: 'submit', name: 'on', value: '0', class: on ? 'clearnet-switch-btn' : 'clearnet-switch-btn active', ...(on ? {} : { disabled: true }) }, 'OASIS'),
      button({ type: 'submit', name: 'on', value: '1', class: on ? 'clearnet-switch-btn active' : 'clearnet-switch-btn', ...(on ? { disabled: true } : {}) }, 'CLEARNET')
    )
  : null;

const renderReachChip = (isClearnet, i18nObj = {}, href = null) => {
  const icon = isClearnet ? '🌐' : '🏝';
  const label = isClearnet
    ? (i18nObj.shopReachClearnet || 'Clearnet')
    : (i18nObj.shopReachOasis || 'Oasis');
  const chip = span({ class: `pm-exposition-chip pm-exposition-${isClearnet ? 'whole' : 'mutuals'}` },
    span({ class: 'pm-exposition-icon' }, icon),
    span({ class: 'pm-exposition-text' }, label)
  );
  if (href && isClearnet) {
    return a({ href, target: '_blank', rel: 'noopener noreferrer', class: 'pm-exposition-chip-link' }, chip);
  }
  return chip;
};

const renderTribeOriginChip = (origin) => origin && origin.title
  ? a({ href: origin.tribeHref || origin.href, class: 'pm-exposition-chip-link' },
      span({ class: 'pm-exposition-chip pm-exposition-tribe' },
        span({ class: 'pm-exposition-icon' }, 'ꖥ'),
        span({ class: 'pm-exposition-text' }, origin.title)
      )
    )
  : null;

const fediverseProfileUrl = (handle) => {
  const h = String(handle || '').trim().replace(/^@/, '');
  const at = h.indexOf('@');
  if (at <= 0) return '';
  const acct = h.slice(0, at), host = h.slice(at + 1);
  if (!acct || !host || /[\s/]/.test(host)) return '';
  return `https://${host}/@${acct}`;
};

const renderFediverseReach = (prefs, i18nObj = {}) => {
  if (!prefs || prefs.fediverse !== true) return null;
  const handle = String(prefs.fediverseHandle || '').trim();
  const url = fediverseProfileUrl(handle);
  if (!url) return null;
  return div({ class: 'profile-reach fediverse-reach' },
    a({ href: url, target: '_blank', rel: 'noopener noreferrer', class: 'pm-exposition-chip-link' },
      span({ class: 'pm-exposition-chip pm-exposition-fediverse' },
        span({ class: 'pm-exposition-icon' }, '🐘'),
        span({ class: 'pm-exposition-text' }, i18nObj.fediverse || 'Multiverse')
      )
    ),
    a({ href: url, target: '_blank', rel: 'noopener noreferrer', class: 'fediverse-reach-url' }, handle)
  );
};

const LICENSES = [
  { id: 'CC0-1.0', label: 'Public Domain', name: 'Public Domain' },
  { id: 'CC-BY-4.0', label: 'CC BY 4.0', name: 'Creative Commons Attribution 4.0' },
  { id: 'CC-BY-SA-4.0', label: 'CC BY-SA 4.0', name: 'Creative Commons Attribution-ShareAlike 4.0' },
  { id: 'GFDL-1.3-or-later', label: 'GNU FDL 1.3', name: 'GNU Free Documentation License 1.3' },
  { id: 'LAL-1.3', label: 'Free Art License 1.3', name: 'Free Art License 1.3' }
];
const DEFAULT_LICENSE = LICENSES[0].id;
const LICENSED_KINDS = new Set(['wiki', 'audio', 'video', 'image', 'document']);
const licenseInfo = (id) => {
  const v = String(id || '').trim() || DEFAULT_LICENSE;
  return LICENSES.find(l => l.id === v) || null;
};
const normalizeLicense = (id) => (LICENSES.find(l => l.id === String(id || '').trim()) || LICENSES[0]).id;

const renderLicenseChip = (id) => {
  const l = licenseInfo(id);
  if (!l) return null;
  return span({ class: 'pm-exposition-chip pm-exposition-license', title: l.name },
    span({ class: 'pm-exposition-icon' }, '\u2696'),
    span({ class: 'pm-exposition-text' }, l.label)
  );
};

const renderLicenseSelect = (current, i18nObj = {}) => {
  const selectedId = normalizeLicense(current);
  return [
    span(i18nObj.licenseLabel || 'License'),
    br(),
    select({ name: 'license' }, ...LICENSES.map(l => option({ value: l.id, ...(l.id === selectedId ? { selected: true } : {}) }, l.label))),
    br()
  ];
};

const renderClearnetLicense = (id) => {
  const l = licenseInfo(id);
  return l ? `<span class="cn-license" title="${escapeHtml(l.name)}">\u2696 ${escapeHtml(l.label)}</span>` : '';
};

const renderTransportChip = (i18nObj = {}) => {
  return span({ class: 'pm-exposition-chip pm-exposition-transport', title: 'Secret Handshake + boxstream · SHA-256' },
    span({ class: 'pm-exposition-icon' }, '\u21C4'),
    span({ class: 'pm-exposition-text' }, i18nObj.transportChipLabel || 'Encrypted in transit')
  );
};

const renderEncryptedChip = (i18nObj = {}) => {
  return span({ class: 'pm-exposition-chip pm-exposition-encrypted' },
    span({ class: 'pm-exposition-icon' }, '🔒'),
    span({ class: 'pm-exposition-text' }, i18nObj.encryptedChipLabel || 'Encrypted')
  );
};

const renderDoubleEncryptionChip = (i18nObj = {}) => {
  return span({ class: 'pm-exposition-chip pm-exposition-encrypted pm-double-enc-chip' },
    span({ class: 'pm-exposition-icon' }, '🔒'),
    span({ class: 'pm-exposition-text' }, i18nObj.pmCrypterChip || '2xE2E')
  );
};

const { INTERNAL_PATHS: INTERNAL_OASIS_PATHS } = require('../backend/renderStyledText');

const stripInternalAnchors = (html) => {
  if (typeof html !== 'string' || !html) return html;
  const list = INTERNAL_OASIS_PATHS.join('|');
  const hrefedClosed = new RegExp(`<a\\b[^>]*\\bhref=["']\\/(?:${list})\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>`, 'gi');
  const hrefedBare   = new RegExp(`<a\\b[^>]*\\bhref=["']\\/(?:${list})["'][^>]*>([\\s\\S]*?)<\\/a>`, 'gi');
  return html.replace(hrefedClosed, '$1').replace(hrefedBare, '$1');
};

const renderClearnetSearchForm = ({ authorFeedId = '', query = '', placeholder = '' }) => {
  if (!authorFeedId) return '';
  const safeQuery = escapeHtml(query || '');
  const safePh = escapeHtml(placeholder || cnText('cnSearchPlaceholder', 'Search…'));
  return `<form class="cn-search" method="GET" action="/c/inhabitant/${encodeURIComponent(authorFeedId)}"><input type="text" name="q" value="${safeQuery}" placeholder="${safePh}" autocomplete="off"/></form>`;
};

const renderClearnetUrlBlock = ({ baseUrl = '', path, i18nObj = {} }) => {
  return div({ class: 'shop-clearnet-url' },
    a({ href: path, target: '_blank', rel: 'noopener noreferrer', class: 'clearnet-link' }, path)
  );
};

const CLEARNET_TEXT_CSS = `
.cn-tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}
.cn-hub-priceline{margin:10px 0 0 0}
.cn-hub-details{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 0 0}
.cn-detail{display:inline-flex;align-items:center;border:1px solid var(--border);border-radius:5px;padding:3px 8px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--fg-soft);background:var(--bg-sub);white-space:nowrap}
.cn-tag{border:1px solid var(--border);border-radius:5px;padding:3px 8px;font-size:11px;color:var(--fg-soft);background:var(--bg-sub);text-decoration:none;white-space:nowrap}
.cn-tag:hover{color:var(--fg);border-color:var(--fg)}
.cn-license{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);border-radius:5px;padding:3px 8px;font-size:11px;letter-spacing:1px;color:var(--fg-soft);background:var(--bg-sub);text-decoration:none;white-space:nowrap}
a.tag-link{color:var(--accent);text-decoration:none}
a.cn-wiki-link{color:var(--accent);text-decoration:underline;text-underline-offset:2px}
a.cn-wiki-link:hover{color:var(--fg)}
.cn-price{display:inline-flex;align-items:center;color:var(--fg);background:var(--bg-sub);border:1px solid var(--fg);border-radius:4px;padding:4px 10px;font-weight:bold;font-size:14px}
a.tag-link:hover{text-decoration:underline}
.rt-header{display:block;font-weight:bold;margin:10px 0 4px;line-height:1.3}
.rt-header-1{font-size:1.5em}
.rt-header-2{font-size:1.3em}
.rt-header-3{font-size:1.15em}
.rt-item{display:block;padding-left:1.4em;text-indent:-0.7em}
.rt-item::before{content:"\u2022 ";opacity:.7}
.rt-item-2{padding-left:3em}
.rt-item-3{padding-left:4.6em}
.rt-item-4{padding-left:6.2em}
.rt-item-number{text-indent:-1.2em}
.rt-item-number::before{content:none}
.rt-quote{display:block;border-left:3px solid currentColor;padding-left:10px;margin:6px 0;opacity:.85}
.rt-rule{display:block;border-top:1px solid currentColor;opacity:.4;margin:10px 0}
.rt-code{font-family:monospace;background:rgba(128,128,128,.18);padding:1px 4px;border-radius:3px;word-break:break-word}
.rt-code-block{display:block;font-family:monospace;white-space:pre-wrap;background:rgba(128,128,128,.18);padding:10px;border-radius:5px;margin:8px 0;overflow-x:auto;word-break:break-word}
.post-image{display:block;max-width:100%;height:auto;margin:12px 0;border:1px solid var(--border);border-radius:6px}
.post-video,.post-audio{display:block;width:100%;max-width:100%;margin:12px 0;border-radius:6px;background:#000}
.post-pdf{display:inline-block;margin:8px 0;padding:8px 14px;background:var(--bg-sub);border:1px solid var(--border);border-radius:6px;color:var(--fg);text-decoration:none}
.post-pdf:hover{border-color:var(--fg)}
`;

const CLEARNET_SEARCH_CSS = `
.cn-search{margin:0}
.cn-search input[type=text]{width:240px;max-width:100%;background:var(--bg-sub);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:14px;font-family:inherit}
.cn-search input[type=text]:focus{outline:none;border-color:var(--fg)}
`;

const THEME_PALETTES = {
  'Dark-SNH': {
    bg: '#121212', bgElev: '#1C1C1C', bgSub: '#222',
    fg: '#FFD700', fgSoft: '#E6C200', fgDim: '#9a8a2e',
    border: '#333', accent: '#FFDD44',
    font: "system-ui,-apple-system,sans-serif"
  },
  'OasisMobile': {
    bg: '#121212', bgElev: '#1C1C1C', bgSub: '#222',
    fg: '#FFD700', fgSoft: '#E6C200', fgDim: '#9a8a2e',
    border: '#333', accent: '#FFDD44',
    font: "system-ui,-apple-system,sans-serif"
  },
  'Clear-SNH': {
    bg: '#F9F9F9', bgElev: '#FFFFFF', bgSub: '#F0F0F0',
    fg: '#2C2C2C', fgSoft: '#555555', fgDim: '#888888',
    border: '#E0E0E0', accent: '#FF6F00',
    font: "'Roboto',sans-serif"
  },
  'Matrix-SNH': {
    bg: '#000000', bgElev: '#0a0a0a', bgSub: '#050505',
    fg: '#00FF00', fgSoft: '#00CC00', fgDim: '#008800',
    border: '#00FF00', accent: '#66FF66',
    font: "'Courier New',monospace"
  },
  'Purple-SNH': {
    bg: '#4B0A6D', bgElev: '#39006D', bgSub: '#6A0066',
    fg: '#E5E5E5', fgSoft: '#C8C8C8', fgDim: '#9B7CAA',
    border: '#9B1C96', accent: '#9B1C96',
    font: "'Arial',sans-serif"
  }
};

const getCurrentPalette = () => {
  try {
    const { getConfig } = require('../configs/config-manager.js');
    const theme = getConfig()?.themes?.current || 'Dark-SNH';
    return THEME_PALETTES[theme] || THEME_PALETTES['Dark-SNH'];
  } catch (_) {
    return THEME_PALETTES['Dark-SNH'];
  }
};

const buildBaseCss = (p) => `
:root{
  --bg:${p.bg}; --bg-elev:${p.bgElev}; --bg-sub:${p.bgSub};
  --fg:${p.fg}; --fg-soft:${p.fgSoft}; --fg-dim:${p.fgDim};
  --border:${p.border}; --border-strong:${p.border};
  --accent:${p.accent};
}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font-family:${p.font};max-width:960px;margin:0 auto;padding:32px 24px;line-height:1.5}
a{color:var(--fg);text-decoration:none}
a:hover{color:var(--accent);text-decoration:underline}
header.cn-header{display:flex;align-items:center;gap:16px;padding-bottom:16px;margin-bottom:24px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.cn-brand-block{flex:0 0 auto}
.cn-brand{font-size:20px;font-weight:700;color:var(--fg);letter-spacing:1px}
.cn-brand-sub{color:var(--fg-dim);font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-top:2px}
.cn-header-extra{flex:1 1 auto;display:flex;justify-content:flex-end;align-items:center;min-width:0}
.cn-kind-tag{font-weight:700;color:var(--fg);letter-spacing:1px}
.cn-sep{border:0;border-top:1px solid var(--border);margin:24px 0}
h2.cn-section{color:var(--fg);font-size:18px;text-transform:uppercase;letter-spacing:2px;margin:32px 0 16px 0;padding-bottom:8px;border-bottom:1px solid var(--border)}
footer.cn-footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--border);font-size:12px;color:var(--fg-dim);text-align:center;letter-spacing:0.5px}
footer.cn-footer a{color:var(--fg-soft)}
footer.cn-footer .cn-footer-logo{width:56px;height:auto;display:block;margin:0 auto 10px auto;border-radius:6px}
footer.cn-footer .cn-footer-line{margin:3px 0}
`;

const renderClearnetPage = ({ title, ogTitle, ogDescription = '', ogImage = null, extraCss = '', body, headerExtra = '', hubFeedId = null }) => {
  const safeTitle = escapeHtml(title || 'Oasis');
  const safeOgTitle = escapeHtml(ogTitle || title || 'Oasis');
  const safeOgDesc = escapeHtml(ogDescription || '');
  const palette = getCurrentPalette();
  const baseCss = buildBaseCss(palette);
  const brandInner = `<div class="cn-brand">⛱ Oasis HUB</div><div class="cn-brand-sub">${escapeHtml(cnText('cnBrandSub', 'Libre · P2P · Federated'))}</div>`;
  const lang = escapeHtml(mv().getLanguage ? mv().getLanguage() : 'en');
  const langOverride = cnScope().cnLang || '';
  const brandBlock = `<a class="cn-brand-block cn-brand-link" href="${cnWithLang('/c', langOverride)}">${brandInner}</a>`;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${safeTitle}</title>
  <meta property="og:title" content="${safeOgTitle}"/>
  <meta property="og:description" content="${safeOgDesc}"/>
  ${ogImage ? `<meta property="og:image" content="${ogImage}"/>` : ''}
  <meta name="description" content="${safeOgDesc}"/>
  <meta name="robots" content="index, follow"/>
  <link rel="icon" href="/c/assets/images/favicon.svg"/>
  <style>${baseCss}${CLEARNET_SEARCH_CSS}${CLEARNET_TEXT_CSS}${extraCss}
.cn-brand-link{display:block;text-decoration:none}

.cn-brand-link:hover .cn-brand{color:var(--accent)}
.cn-brand-link:hover{text-decoration:none}
.cn-header-extra{gap:10px}
.cn-lang{position:relative;flex:0 0 auto;font-size:13px;outline:none}
.cn-lang-current{display:block;cursor:pointer;background:var(--bg-sub);color:var(--fg);border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-weight:600;letter-spacing:1px;user-select:none}
.cn-lang:focus-within .cn-lang-current,.cn-lang:hover .cn-lang-current{border-color:var(--fg)}
.cn-lang-list{display:none;position:absolute;top:calc(100% + 4px);left:0;z-index:10;flex-direction:column;min-width:100%;max-height:260px;overflow-y:auto;background:var(--bg-elev);border:1px solid var(--border);border-radius:6px}
.cn-lang:focus-within .cn-lang-list{display:flex}
.cn-lang-list a{padding:6px 12px;color:var(--fg-soft);text-decoration:none;letter-spacing:1px}
.cn-lang-list a:hover{background:var(--bg-sub);color:var(--fg);text-decoration:none}
</style>
</head>
<body>
  <header class="cn-header">
    ${brandBlock}
    <div class="cn-header-extra">${renderLangSelector(lang)}${propagateLang(headerExtra || '', langOverride)}</div>
  </header>
  ${propagateLang(stripInternalAnchors(body), langOverride)}
  <footer class="cn-footer">
    <a href="https://wiki.solarnethub.com" target="_blank" rel="noopener"><img class="cn-footer-logo" src="/c/assets/images/snh-oasis.jpg" alt="Oasis"/></a>
    <div class="cn-footer-line">${escapeHtml(cnText('cnSyncedPeers', 'Synced-peers'))}: [ <strong>${Number(sharedState.getSyncedPeerCount ? sharedState.getSyncedPeerCount() : 0) || 0}</strong> ]</div>
    <div class="cn-footer-line"><a href="https://code.03c8.net/krakenslab/oasis" target="_blank" rel="noopener">${escapeHtml(cnPkg.name || '@krakenslab/oasis')}</a> [ ${escapeHtml(cnPkg.version || '?')} ]</div>
    <div class="cn-footer-line">${escapeHtml(cnText('cnLicense', 'License'))}: <a href="https://www.gnu.org/licenses/gpl-3.0.html" target="_blank" rel="noopener">GPLv3</a> - ${new Date().getFullYear()}</div>
  </footer>
</body>
</html>`;
};

const renderClearnetNotFound = () => {
  return renderClearnetPage({
    title: 'Oasis',
    ogTitle: 'Oasis',
    ogDescription: '',
    extraCss: `.cn-notfound{color:var(--fg-soft);font-size:16px;max-width:480px;margin:80px auto 40px auto;text-align:center;line-height:1.5}`,
    body: `<p class="cn-notfound">${escapeHtml(cnText('cnNotAccessible', 'The content is not accessible at this moment.'))}</p>`
  });
};

const CLEARNET_PAGER_CSS = `
.cn-pager{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:8px;margin:24px 0 8px 0}
.cn-pager-info{color:var(--fg-dim);font-size:12px;margin-right:4px}
.cn-pager-sizes{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-right:auto}
.cn-pager-btn{display:inline-block;padding:6px 14px;background:var(--bg-elev);color:var(--fg-soft);border:1px solid var(--border);border-radius:14px;font-size:13px;text-decoration:none;transition:border-color .15s ease,color .15s ease,background .15s ease}
.cn-pager-btn:hover,.cn-pager-btn.active{border-color:var(--fg);color:var(--fg);text-decoration:none}
`;
const paginateClearnet = (list, page) => mv().slicePage(list, page, mv().listPerPage(cnScope().query));
const renderClearnetPager = ({ base, params = {}, page, pages, per, total }) => {
  const query = String(cnScope().query || '');
  const sizes = !!per && mv().showPageSizes(total, query);
  if (!(pages > 1) && !sizes) return '';
  const chosen = new URLSearchParams(query).has('perPage');
  const href = (n, size) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, String(v));
    if (size || chosen) q.set('perPage', size || per);
    if (n > 1) q.set('page', String(n));
    const s = q.toString();
    return escapeHtml(s ? `${base}?${s}` : base);
  };
  const sizeLinks = sizes
    ? `<span class="cn-pager-sizes"><span class="cn-pager-info">${escapeHtml(cnText('searchPerPageLabel', 'Results per page'))}</span>${mv().LIST_PAGE_SIZES.map(s => `<a class="cn-pager-btn${s === per ? ' active' : ''}" href="${href(1, s)}">${escapeHtml(mv().pageSizeLabel(s))}</a>`).join('')}</span>`
    : '';
  const info = pages > 1 ? `<span class="cn-pager-info">${escapeHtml(cnText('cnPageOf', 'Page {page} of {pages}').replace('{page}', String(page)).replace('{pages}', String(pages)))}</span>` : '';
  const prev = page > 1 ? `<a class="cn-pager-btn" href="${href(page - 1)}">${escapeHtml(cnText('cnPrevPage', '← Previous'))}</a>` : '';
  const next = page < pages ? `<a class="cn-pager-btn" href="${href(page + 1)}">${escapeHtml(cnText('cnNextPage', 'Next →'))}</a>` : '';
  return `<div class="cn-pager">${sizeLinks}${info}${prev}${next}</div>`;
};

const renderClearnetMediaView = ({ kind, item }) => {
  const blob = blobUrl(item.url);
  const title = escapeHtml(item.title || cnText('cnUntitled', 'Untitled'));
  const desc = renderRichText(item.description || '', { wikiLinks: item.wikiLinks instanceof Map ? item.wikiLinks : null });
  const dateStr = item.createdAt ? escapeHtml(new Date(item.createdAt).toISOString().slice(0, 10)) : '';
  const extraCss = `
.cn-media-meta{color:var(--fg-dim);font-size:13px;margin-bottom:16px;display:flex;gap:14px;flex-wrap:wrap;align-items:baseline}
.cn-id-meta{font-family:monospace;font-size:11px;word-break:break-all;color:var(--fg-dim)}
.cn-media-title{color:var(--fg);font-size:26px;font-weight:700;margin:0 0 12px 0}
.cn-media-desc{color:var(--fg-soft);white-space:pre-wrap;line-height:1.6;margin:16px 0}
.cn-media-frame{margin:16px 0}
.cn-media-frame img{max-width:100%;height:auto;border-radius:6px;border:1px solid var(--border);display:block}
.cn-media-frame audio,.cn-media-frame video{width:100%;max-width:100%;display:block;border-radius:6px;background:#000}
.cn-media-frame .cn-media-doc{display:inline-block;background:var(--bg-elev);border:1px solid var(--border);border-radius:6px;padding:10px 18px;color:var(--fg);text-decoration:none}
.cn-media-frame .cn-media-doc:hover{border-color:var(--fg)}
.cn-media-frame .cn-media-doc + .cn-media-doc{margin-left:10px}
`;
  const fileKind = kind === 'document' || kind === 'torrent' || kind === 'file';
  let mediaHtml = '';
  if (blob) {
    if (kind === 'image') {
      mediaHtml = `<img src="${blob}" alt="${title}"/>`;
    } else if (kind === 'audio') {
      mediaHtml = `<audio controls preload="metadata" src="${blob}"></audio>`;
    } else if (kind === 'video') {
      mediaHtml = `<video controls preload="metadata" src="${blob}"></video>`;
    } else if (kind === 'file' || kind === 'torrent') {
      const dlName = (v) => String(v || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      const dlLink = (href, name) => `<a class="cn-media-doc" href="${href}?name=${encodeURIComponent(name)}" rel="noopener">⇩ ${escapeHtml(name)}</a>`;
      const original = kind === 'file' ? blob : blobUrl(item.source);
      const originalName = dlName(kind === 'file' ? item.fileName : item.sourceName) || dlName(item.title) || 'file';
      const torrentBlob = kind === 'file' ? blobUrl(item.torrentUrl) : blob;
      const torrentName = `${kind === 'file' ? originalName : (dlName(item.title) || 'download').replace(/\.torrent$/i, '')}.torrent`;
      mediaHtml = [original ? dlLink(original, originalName) : '', torrentBlob ? dlLink(torrentBlob, torrentName) : ''].filter(Boolean).join('');
    } else if (kind === 'document') {
      mediaHtml = `<a class="cn-media-doc" href="${blob}" target="_blank" rel="noopener">⇩ ${title}</a>`;
    } else {
      mediaHtml = `<img src="${blob}" alt="${title}"/>`;
    }
  }
  const body = `
  <div class="cn-media-meta">
    ${renderKindTag(kind)}
    ${dateStr ? `<span>📅 ${dateStr}</span>` : ''}
    ${(Array.isArray(item.details) ? item.details : []).map(d => `<span class="cn-detail">${escapeHtml(String(d))}</span>`).join('')}
    ${item.price ? `<span class="cn-price">${escapeHtml(String(item.price))} ECO</span>` : ''}
    ${LICENSED_KINDS.has(kind) ? renderClearnetLicense(item.license) : ''}
  </div>
  ${item.title ? `<h1 class="cn-media-title">${title}</h1>` : ''}
  <hr class="cn-sep"/>
  ${mediaHtml && !fileKind ? `<div class="cn-media-frame">${mediaHtml}</div>` : ''}
  ${desc ? `<p class="cn-media-desc">${desc}</p>` : ''}
  ${mediaHtml && fileKind ? `<div class="cn-media-frame">${mediaHtml}</div>` : ''}
  ${renderTagChips(item.tags)}
`;
  return renderClearnetPage({
    title: `${item.title || (kind ? kindLabel(kind) : 'Oasis')} | Oasis`,
    ogTitle: item.title || (kind ? kindLabel(kind) : 'Oasis'),
    ogDescription: item.description || '',
    ogImage: (kind === 'image') ? blob : null,
    extraCss,
    body,
    hubFeedId: item.author || null
  });
};

const renderClearnetPodcastView = ({ channel }) => {
  const title = escapeHtml(channel.title || cnText('cnUntitled', 'Untitled'));
  const desc = renderRichText(channel.description || '');
  const cover = channel.cover && channel.cover.blobId ? blobUrl(channel.cover.blobId) : null;
  const coverIsVideo = !!(channel.cover && channel.cover.kind === 'video');
  const dateStr = channel.createdAt ? escapeHtml(new Date(channel.createdAt).toISOString().slice(0, 10)) : '';
  const extraCss = `
.cn-media-meta{color:var(--fg-dim);font-size:13px;margin-bottom:16px;display:flex;gap:14px;flex-wrap:wrap;align-items:baseline}
.cn-media-title{color:var(--fg);font-size:26px;font-weight:700;margin:0 0 12px 0}
.cn-media-desc{color:var(--fg-soft);white-space:pre-wrap;line-height:1.6;margin:16px 0}
.cn-podcast-cover{max-width:240px;width:100%;border-radius:6px;border:1px solid var(--border);display:block;margin:12px 0}
.cn-episode{border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin:12px 0;background:var(--bg-elev)}
.cn-episode h2{margin:0 0 8px 0;font-size:17px;color:var(--fg)}
.cn-episode .cn-episode-meta{color:var(--fg-dim);font-size:12px;margin-bottom:8px}
.cn-episode audio,.cn-episode video{width:100%;max-width:100%;display:block;border-radius:6px;background:#000}
.cn-episode p{color:var(--fg-soft);white-space:pre-wrap;line-height:1.5;margin:8px 0 0 0}
`;
  const episodes = Array.isArray(channel.episodes) ? channel.episodes.slice().reverse() : [];
  const epHtml = episodes.map(ep => {
    const src = ep.media && ep.media.blobId ? blobUrl(ep.media.blobId) : null;
    const player = !src ? '' : (ep.media.kind === 'video'
      ? `<video controls preload="metadata" src="${src}"></video>`
      : `<audio controls preload="metadata" src="${src}"></audio>`);
    const epDate = ep.createdAt ? escapeHtml(new Date(ep.createdAt).toISOString().slice(0, 10)) : '';
    return `<div class="cn-episode"><h2>#${Number(ep.number) || 0} · ${escapeHtml(ep.title || '')}</h2><div class="cn-episode-meta">${epDate}</div>${player}${ep.description ? `<p>${renderRichText(ep.description)}</p>` : ''}</div>`;
  }).join('');
  const body = `
  <div class="cn-media-meta">${renderKindTag('podcast')}${dateStr ? `<span>📅 ${dateStr}</span>` : ''}<span>🎧 ${episodes.length}</span></div>
  <h1 class="cn-media-title">${title}</h1>
  ${cover ? (coverIsVideo ? `<video class="cn-podcast-cover" controls muted preload="metadata" src="${cover}"></video>` : `<img class="cn-podcast-cover" src="${cover}" alt="${title}"/>`) : ''}
  ${desc ? `<p class="cn-media-desc">${desc}</p>` : ''}
  ${epHtml ? `<hr class="cn-sep"/>${epHtml}` : ''}
`;
  return renderClearnetPage({
    title: `${channel.title || cnText('cnUntitled', 'Untitled')} | Oasis`,
    ogTitle: channel.title || 'Oasis',
    ogDescription: channel.description || '',
    ogImage: cover && !coverIsVideo ? cover : null,
    extraCss,
    body,
    hubFeedId: channel.author || null
  });
};

module.exports = {
  kindLabel,
  renderTagChips,
  renderClearnetPodcastView,
  escapeHtml,
  renderRichText,
  renderKindTag,
  blobIdOf,
  blobUrl,
  renderReachChip,
  renderTribeOriginChip,
  renderClearnetSelector,
  renderClearnetSwitch,
  renderFediverseReach,
  renderContentStats,
  renderEncryptedChip,
  renderTransportChip,
  LICENSES,
  licenseInfo,
  normalizeLicense,
  renderLicenseChip,
  renderLicenseSelect,
  renderClearnetLicense,
  renderDoubleEncryptionChip,
  renderClearnetUrlBlock,
  renderClearnetSearchForm,
  renderClearnetPage,
  renderClearnetNotFound,
  CLEARNET_PAGER_CSS,
  paginateClearnet,
  renderClearnetPager,
  renderClearnetMediaView
};
