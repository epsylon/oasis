const { a, br, div, input, span } = require("../server/node_modules/hyperaxe");

const escapeHtml = (s) => String(s || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

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

const renderEncryptedChip = (i18nObj = {}) => {
  return span({ class: 'pm-exposition-chip pm-exposition-encrypted' },
    span({ class: 'pm-exposition-icon' }, '🔒'),
    span({ class: 'pm-exposition-text' }, i18nObj.encryptedChipLabel || 'Encrypted')
  );
};

const INTERNAL_OASIS_PATHS = [
  'author','thread','hashtag','inbox','pm','profile','settings','banking','wallet',
  'jobs','events','projects','shops','audios','videos','images','documents','torrents',
  'tribes','tribe','forum','votes','votations','reports','tasks','maps','chats','pads',
  'calendars','trending','opinions','feed','pixelia','cv','invites','peers','stats',
  'blockexplorer','modules','publish','search','tags','mentions','popular','threads',
  'topics','latest','summaries','multiverse','legacy','cipher','graphos','agenda',
  'favorites','logs','games','parliament','courts','market','ai','public','spread',
  'follow','unfollow','block','like','unlike'
];

const stripInternalAnchors = (html) => {
  if (typeof html !== 'string' || !html) return html;
  const list = INTERNAL_OASIS_PATHS.join('|');
  const hrefedClosed = new RegExp(`<a\\b[^>]*\\bhref=["']\\/(?:${list})\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>`, 'gi');
  const hrefedBare   = new RegExp(`<a\\b[^>]*\\bhref=["']\\/(?:${list})["'][^>]*>([\\s\\S]*?)<\\/a>`, 'gi');
  return html.replace(hrefedClosed, '$1').replace(hrefedBare, '$1');
};

const renderClearnetSearchForm = ({ authorFeedId = '', query = '', placeholder = 'Search…' }) => {
  if (!authorFeedId) return '';
  const safeQuery = escapeHtml(query || '');
  const safePh = escapeHtml(placeholder);
  return `<form class="cn-search" method="GET" action="/c/inhabitant/${encodeURIComponent(authorFeedId)}"><input type="text" name="q" value="${safeQuery}" placeholder="${safePh}" autocomplete="off"/></form>`;
};

const renderClearnetUrlBlock = ({ baseUrl = '', path, i18nObj = {} }) => {
  return div({ class: 'shop-clearnet-url' },
    a({ href: path, target: '_blank', rel: 'noopener noreferrer', class: 'clearnet-link' }, path)
  );
};

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
h2.cn-section{color:var(--fg);font-size:18px;text-transform:uppercase;letter-spacing:2px;margin:32px 0 16px 0;padding-bottom:8px;border-bottom:1px solid var(--border)}
footer.cn-footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--border);font-size:12px;color:var(--fg-dim);text-align:center;letter-spacing:0.5px}
footer.cn-footer a{color:var(--fg-soft)}
footer.cn-footer .cn-footer-logo{width:56px;height:auto;display:block;margin:0 auto 10px auto;border-radius:6px}
`;

const renderClearnetPage = ({ title, ogTitle, ogDescription = '', ogImage = null, extraCss = '', body, headerExtra = '', hubFeedId = null }) => {
  const safeTitle = escapeHtml(title || 'Oasis');
  const safeOgTitle = escapeHtml(ogTitle || title || 'Oasis');
  const safeOgDesc = escapeHtml(ogDescription || '');
  const palette = getCurrentPalette();
  const baseCss = buildBaseCss(palette);
  const brandInner = `<div class="cn-brand">⛱ Oasis HUB</div><div class="cn-brand-sub">Libre · P2P · Federated</div>`;
  const brandBlock = hubFeedId
    ? `<a class="cn-brand-block cn-brand-link" href="/c/inhabitant/${encodeURIComponent(hubFeedId)}">${brandInner}</a>`
    : `<div class="cn-brand-block">${brandInner}</div>`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${safeTitle}</title>
  <meta property="og:title" content="${safeOgTitle}"/>
  <meta property="og:description" content="${safeOgDesc}"/>
  ${ogImage ? `<meta property="og:image" content="${ogImage}"/>` : ''}
  <meta name="description" content="${safeOgDesc}"/>
  <meta name="robots" content="index, follow"/>
  <style>${baseCss}${CLEARNET_SEARCH_CSS}${extraCss}
.cn-brand-link{display:block;text-decoration:none}
.cn-brand-link:hover .cn-brand{color:var(--accent)}
.cn-brand-link:hover{text-decoration:none}
</style>
</head>
<body>
  <header class="cn-header">
    ${brandBlock}
    ${headerExtra ? `<div class="cn-header-extra">${headerExtra}</div>` : ''}
  </header>
  ${stripInternalAnchors(body)}
  <footer class="cn-footer">
    <a href="https://code.03c8.net/krakenslab/oasis" target="_blank" rel="noopener"><img class="cn-footer-logo" src="/assets/images/snh-oasis.jpg" alt="Oasis"/></a>
    Powered by <a href="https://code.03c8.net/krakenslab/oasis" target="_blank" rel="noopener">Oasis</a>
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
    body: `<p class="cn-notfound">The content is not accessible at this moment.</p>`
  });
};

const renderClearnetMediaView = ({ kind, item }) => {
  const blob = blobUrl(item.url);
  const title = escapeHtml(item.title || 'Untitled');
  const desc = escapeHtml(item.description || '');
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
`;
  let mediaHtml = '';
  if (blob) {
    if (kind === 'image') {
      mediaHtml = `<img src="${blob}" alt="${title}"/>`;
    } else if (kind === 'audio') {
      mediaHtml = `<audio controls preload="metadata" src="${blob}"></audio>`;
    } else if (kind === 'video') {
      mediaHtml = `<video controls preload="metadata" src="${blob}"></video>`;
    } else if (kind === 'document' || kind === 'torrent') {
      mediaHtml = `<a class="cn-media-doc" href="${blob}" target="_blank" rel="noopener">⇩ ${title}</a>`;
    }
  }
  const body = `
  <div class="cn-media-meta">
    ${dateStr ? `<span>📅 ${dateStr}</span>` : ''}
  </div>
  <h1 class="cn-media-title">${title}</h1>
  ${mediaHtml ? `<div class="cn-media-frame">${mediaHtml}</div>` : ''}
  ${desc ? `<p class="cn-media-desc">${desc}</p>` : ''}
`;
  return renderClearnetPage({
    title: `${title} — Oasis`,
    ogTitle: item.title || 'Oasis',
    ogDescription: item.description || '',
    ogImage: (kind === 'image') ? blob : null,
    extraCss,
    body,
    hubFeedId: item.author || null
  });
};

module.exports = {
  escapeHtml,
  blobIdOf,
  blobUrl,
  renderReachChip,
  renderEncryptedChip,
  renderClearnetUrlBlock,
  renderClearnetSearchForm,
  renderClearnetPage,
  renderClearnetNotFound,
  renderClearnetMediaView
};
