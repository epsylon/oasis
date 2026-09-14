const { a, img, video, audio, span, strong, em, u, s: strike, code, div, textarea } = require("../server/node_modules/hyperaxe");
const i18nBase = require("../client/assets/translations/i18n");
const { WIKILINK_RE, slugify, linkTarget } = require("../models/wiki_model");

function getI18n() {
  try {
    const { i18n } = require("../views/main_views");
    return i18n;
  } catch (_) {
    return i18nBase['en'] || {};
  }
}

const ESCAPE_RE = /\\([\\*_~`#>\-\[\]!])/g;
const CODE_BLOCK_RE = /```([\s\S]*?)```[ \t]*(?:\n(?:[ \t]*\n)*|$)/g;
const RULE_RE = /^[ \t]*---[ \t]*(?:\n(?:[ \t]*\n)*|$)/gm;
const HEADER_CLOSED_RE = /^[ \t]*(#{1,6})[ \t]*([^\n]{1,200}?)[ \t]*\1[ \t]*(?:\n(?:[ \t]*\n)*|$)/gm;
const HEADER_SPACED_RE = /^[ \t]*(#{1,6})[ \t]+([^\n]{1,200}?)[ \t]*#*[ \t]*(?:\n(?:[ \t]*\n)*|$)/gm;
const QUOTE_RE = /^[ \t]*>[ \t]?([^\n]*)(?:\n(?:[ \t]*\n)*|$)/gm;
const BULLET_RE = /^([ \t]*)-[ \t]+([^\n]+)(?:\n(?:[ \t]*\n)*|$)/gm;
const NUMBER_RE = /^([ \t]*)(\d{1,3})([.)])[ \t]+([^\n]+)(?:\n(?:[ \t]*\n)*|$)/gm;
const BOLD_RE = /\*\*(?!\s)((?:[^*\n]|\*(?!\*))+?)(?<!\s)\*\*/g;
const UNDERLINE_RE = /(?<![A-Za-z0-9])__(?!\s)((?:[^_\n]|_(?!_))+?)(?<!\s)__(?![A-Za-z0-9])/g;
const STRIKE_RE = /~~(?!\s)([^~\n]+?)(?<!\s)~~/g;
const ITALIC_RE = /\*(?!\s)((?:[^*\n]|\*\*)+?)(?<!\s)\*(?!\*)/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;
const BLOB_IMAGE_RE = /!\[([^\]]*)\]\(\s*(&[^)\s]+\.sha256)\s*\)/g;
const BLOB_VIDEO_RE = /\[video:([^\]]*)\]\(\s*(&[^)\s]+\.sha256)\s*\)/g;
const BLOB_AUDIO_RE = /\[audio:([^\]]*)\]\(\s*(&[^)\s]+\.sha256)\s*\)/g;
const BLOB_PDF_RE = /\[pdf:([^\]]*)\]\(\s*(&[^)\s]+\.sha256)\s*\)/g;
const MD_MENTION_RE = /\[@([^\]]+)\]\(@?([A-Za-z0-9+/=.\-]+\.ed25519)\)/g;
const RAW_MENTION_RE = /@([A-Za-z0-9+/=.\-]+\.ed25519)/g;
const MSG_REF_RE = /%[A-Za-z0-9+/=]{44}\.sha256/g;
const MD_LINK_RE = /!?\[([^\]\n]{1,160})\]\((https?:\/\/[^)\s]+|\/(?![\/\\])[^)\s]*)\)/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi;
const HASHTAG_RE = /#[\p{L}\p{N}_]{1,32}(?![\p{L}\p{N}_])/gu;
const URL_TAIL_RE = /[.,;:!?»"')\]}>]+$/;
const SELF_HOST_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i;
const MAX_DEPTH = 8;

const headerLevel = (hashes) => Math.min(3, String(hashes || '#').length);

const indentLevel = (indent) => {
  const width = String(indent || '').replace(/\t/g, '    ').length;
  return Math.min(4, Math.floor(width / 2) + 1);
};

const codeBlockBody = (raw) => {
  const s = String(raw);
  const nl = s.indexOf('\n');
  if (nl === -1) return s;
  return s.slice(nl + 1).replace(/\n[ \t]*$/, '');
};

function renderStyledText(value, opts = {}) {
  if (typeof value !== 'string') return value === null || value === undefined ? [] : [String(value)];
  const text = value.indexOf('\r') === -1 ? value : value.replace(/\r\n?/g, '\n');
  const depth = Number(opts.depth) || 0;
  if (depth > MAX_DEPTH) return [text];
  const allMatches = [];
  const push = (m, extra) => allMatches.push({ index: m.index, length: m[0].length, ...extra });
  for (const m of text.matchAll(ESCAPE_RE)) push(m, { type: 'escaped', body: m[1] });
  for (const m of text.matchAll(WIKILINK_RE)) push(m, { type: 'wikilink', target: linkTarget(m[1]), label: (m[2] || linkTarget(m[1])).trim() });
  for (const m of text.matchAll(CODE_BLOCK_RE)) push(m, { type: 'code-block', body: codeBlockBody(m[1]) });
  for (const m of text.matchAll(RULE_RE)) push(m, { type: 'rule' });
  for (const m of text.matchAll(HEADER_CLOSED_RE)) push(m, { type: 'header', level: headerLevel(m[1]), body: m[2] });
  for (const m of text.matchAll(HEADER_SPACED_RE)) push(m, { type: 'header', level: headerLevel(m[1]), body: m[2] });
  for (const m of text.matchAll(QUOTE_RE)) push(m, { type: 'quote', body: m[1] });
  for (const m of text.matchAll(BULLET_RE)) push(m, { type: 'bullet', level: indentLevel(m[1]), body: m[2] });
  for (const m of text.matchAll(NUMBER_RE)) push(m, { type: 'number', level: indentLevel(m[1]), marker: `${m[2]}${m[3]}`, body: m[4] });
  for (const m of text.matchAll(BLOB_IMAGE_RE)) push(m, { type: 'blob-image', name: m[1], blob: m[2] });
  for (const m of text.matchAll(BLOB_VIDEO_RE)) push(m, { type: 'blob-video', name: m[1], blob: m[2] });
  for (const m of text.matchAll(BLOB_AUDIO_RE)) push(m, { type: 'blob-audio', name: m[1], blob: m[2] });
  for (const m of text.matchAll(BLOB_PDF_RE)) push(m, { type: 'blob-pdf', name: m[1], blob: m[2] });
  for (const m of text.matchAll(MD_MENTION_RE)) push(m, { type: 'md-mention', name: m[1], feedId: m[2] });
  for (const m of text.matchAll(RAW_MENTION_RE)) push(m, { type: 'raw-mention', feedId: m[1] });
  for (const m of text.matchAll(MSG_REF_RE)) push(m, { type: 'msg-ref', id: m[0] });
  for (const m of text.matchAll(MD_LINK_RE)) push(m, { type: 'md-link', label: m[1], href: m[2] });
  for (const m of text.matchAll(BOLD_RE)) push(m, { type: 'bold', body: m[1] });
  for (const m of text.matchAll(UNDERLINE_RE)) push(m, { type: 'underline', body: m[1] });
  for (const m of text.matchAll(STRIKE_RE)) push(m, { type: 'strike', body: m[1] });
  for (const m of text.matchAll(ITALIC_RE)) push(m, { type: 'italic', body: m[1] });
  for (const m of text.matchAll(INLINE_CODE_RE)) push(m, { type: 'inline-code', body: m[1] });
  for (const m of text.matchAll(URL_RE)) {
    const trimmed = m[0].replace(URL_TAIL_RE, '');
    if (trimmed) allMatches.push({ index: m.index, length: trimmed.length, type: 'url', text: trimmed });
  }
  for (const m of text.matchAll(EMAIL_RE)) push(m, { type: 'email', text: m[0] });
  for (const m of text.matchAll(HASHTAG_RE)) push(m, { type: 'hashtag', tag: m[0].slice(1) });
  allMatches.sort((x, y) => x.index - y.index);
  const filtered = [];
  let lastEnd = 0;
  for (const m of allMatches) {
    if (m.index < lastEnd) continue;
    filtered.push(m);
    lastEnd = m.index + m.length;
  }
  const blobHref = (id) => `${opts.blobPrefix || '/blob/'}${encodeURIComponent(id)}`;
  const linksOn = opts.links !== false;
  const internalOn = opts.internalLinks !== false;
  const plain = (value) => opts.plainUrlClass ? span({ class: opts.plainUrlClass }, value) : value;
  const inner = (body) => renderStyledText(body, { ...opts, depth: depth + 1 });
  const result = [];
  let cursor = 0;
  for (const m of filtered) {
    if (cursor < m.index) result.push(text.slice(cursor, m.index));
    if (m.type === 'escaped') {
      result.push(m.body);
    } else if (m.type === 'msg-ref') {
      result.push(internalOn ? a({ href: `/thread/${encodeURIComponent(m.id)}`, class: 'styled-link' }, m.id.slice(0, 10) + '...') : m.id);
    } else if (m.type === 'wikilink') {
      result.push(typeof opts.wikiLink === 'function'
        ? opts.wikiLink(m.target, slugify(m.target), m.label)
        : internalOn
          ? a({ href: `/wiki/${encodeURIComponent(slugify(m.target))}`, class: 'wiki-link' }, m.label)
          : m.label);
    } else if (m.type === 'code-block') {
      result.push(span({ class: 'rt-code-block' }, m.body));
    } else if (m.type === 'rule') {
      result.push(span({ class: 'rt-rule' }));
    } else if (m.type === 'header') {
      result.push(span({ class: `rt-header rt-header-${m.level}` }, ...inner(m.body)));
    } else if (m.type === 'quote') {
      result.push(span({ class: 'rt-quote' }, ...inner(m.body)));
    } else if (m.type === 'bullet') {
      result.push(span({ class: `rt-item rt-item-${m.level}` }, ...inner(m.body)));
    } else if (m.type === 'number') {
      result.push(span({ class: `rt-item rt-item-number rt-item-${m.level}` }, `${m.marker} `, ...inner(m.body)));
    } else if (m.type === 'bold') {
      result.push(strong(...inner(m.body)));
    } else if (m.type === 'underline') {
      result.push(u(...inner(m.body)));
    } else if (m.type === 'strike') {
      result.push(strike(...inner(m.body)));
    } else if (m.type === 'italic') {
      result.push(em(...inner(m.body)));
    } else if (m.type === 'inline-code') {
      result.push(code({ class: 'rt-code' }, m.body));
    } else if (m.type === 'blob-image') {
      result.push(img({ src: blobHref(m.blob), alt: m.name || '', class: 'post-image' }));
    } else if (m.type === 'blob-video') {
      result.push(video({ controls: true, class: 'post-video', src: blobHref(m.blob) }));
    } else if (m.type === 'blob-audio') {
      result.push(audio({ controls: true, class: 'post-audio', src: blobHref(m.blob) }));
    } else if (m.type === 'blob-pdf') {
      const i18n = getI18n();
      result.push(a({ href: blobHref(m.blob), class: 'post-pdf', target: '_blank', rel: 'noopener noreferrer' }, m.name || i18n.pdfFallbackLabel || 'PDF'));
    } else if (m.type === 'md-mention') {
      result.push(internalOn ? a({ href: `/author/${encodeURIComponent('@' + m.feedId)}`, class: 'mention' }, '@' + m.name) : '@' + m.name);
    } else if (m.type === 'raw-mention') {
      result.push(internalOn ? a({ href: `/author/${encodeURIComponent('@' + m.feedId)}`, class: 'mention' }, '@' + m.feedId.slice(0, 8) + '...') : '@' + m.feedId.slice(0, 8) + '...');
    } else if (m.type === 'md-link') {
      const external = /^https?:\/\//.test(m.href) && !SELF_HOST_RE.test(m.href);
      result.push(external
        ? (linksOn ? a({ href: m.href, class: 'styled-link', target: '_blank', rel: 'noopener noreferrer' }, ...inner(m.label)) : plain(m.label))
        : (internalOn ? a({ href: m.href, class: 'styled-link' }, ...inner(m.label)) : m.label));
    } else if (m.type === 'url') {
      const href = m.text.startsWith('http') ? m.text : `https://${m.text}`;
      if (!linksOn) result.push(plain(m.text));
      else if (SELF_HOST_RE.test(href)) result.push(a({ href }, m.text));
      else result.push(a({ href, target: '_blank', rel: 'noopener noreferrer' }, m.text));
    } else if (m.type === 'email') {
      result.push(linksOn ? a({ href: `mailto:${m.text}` }, m.text) : plain(m.text));
    } else if (m.type === 'hashtag') {
      const tagHref = typeof opts.hashtagHref === 'function' ? opts.hashtagHref(m.tag) : (internalOn ? `/search?query=%23${encodeURIComponent(m.tag)}` : null);
      result.push(tagHref ? a({ href: tagHref, class: 'tag-link' }, `#${m.tag}`) : `#${m.tag}`);
    }
    cursor = m.index + m.length;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

const safeExternalHref = (url) => {
  const value = String(url || '').trim();
  const lower = value.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) return value;
  return '';
};

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function renderStyledHtml(text, opts = {}) {
  if (text === null || text === undefined || text === '') return '';
  return renderStyledText(String(text), opts)
    .map(node => (node && typeof node === 'object' && node.outerHTML) ? node.outerHTML : escapeHtml(node))
    .join('');
}

function plainText(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*---[ \t]*$/gm, '')
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, '')
    .replace(/[ \t]*#{1,6}[ \t]*$/gm, '')
    .replace(/^[ \t]*- /gm, '')
    .replace(/^[ \t]*\d{1,3}[.)] /gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[[^\]\n]{0,160}\]\(\s*&[^)\s\n]{1,120}\.sha256\s*\)/g, '')
    .replace(/\[(?:video|audio|pdf):[^\]\n]{0,160}\]\([^)\n]{0,200}\)/g, '')
    .replace(/\[\[([^\]|\n]{1,120})(?:\|([^\]\n]{1,120}))?\]\]/g, (m, target, label) => label || target)
    .replace(/!?\[([^\]\n]{1,160})\]\(([^)\s\n]{0,200})\)/g, (m, label, href) => href ? `${label} (${href})` : label)
    .replace(/\\([\\*_~`#>\-\[\]!])/g, '$1')
    .trim();
}

function renderTextPreview(text, maxLength = 220) {
  const preview = plainText(text).replace(/\n+/g, ' ').trim();
  return preview.length > maxLength ? preview.slice(0, maxLength) + '...' : preview;
}

const FORMAT_MARKS = [
  { mark: '**bold**', style: 'bold' },
  { mark: '*italic*', style: 'italic' },
  { mark: '__underline__', style: 'underline' },
  { mark: '~~strike~~', style: 'strike' },
  { mark: '`code`', style: 'code' },
  { mark: '### title ###', style: 'header' },
  { mark: '- list', style: 'item' },
  { mark: '> quote', style: 'quote' },
  { mark: '[[wiki]]', style: 'wiki' }
];

function renderFormatBar() {
  const i18n = getI18n();
  const marks = [];
  FORMAT_MARKS.forEach((m, i) => {
    if (i) marks.push(span({ class: 'rt-sep' }, '|'));
    marks.push(span({ class: `rt-mark rt-mark-${m.style}` }, m.mark));
  });
  return div({ class: 'rt-toolbar' },
    span({ class: 'rt-toolbar-label' }, `${i18n.formatBarLabel || 'Format'}:`),
    ...marks
  );
}

function richTextarea(attrs, ...children) {
  return [renderFormatBar(), textarea(attrs, ...children)];
}

module.exports = { renderStyledText, renderStyledHtml, renderTextPreview, plainText, escapeHtml, safeExternalHref, renderFormatBar, richTextarea };
