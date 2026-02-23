const { a, img, video, audio } = require("../server/node_modules/hyperaxe");
const i18nBase = require("../client/assets/translations/i18n");

function getI18n() {
  try {
    const { i18n } = require("../views/main_views");
    return i18n;
  } catch (_) {
    return i18nBase['en'] || {};
  }
}

function renderUrl(text) {
  if (typeof text !== 'string') return [text];
  const blobImageRegex = /!\[([^\]]*)\]\(\s*(&[^)\s]+\.sha256)\s*\)/g;
  const blobVideoRegex = /\[video:([^\]]*)\]\(\s*(&[^)\s]+\.sha256)\s*\)/g;
  const blobAudioRegex = /\[audio:([^\]]*)\]\(\s*(&[^)\s]+\.sha256)\s*\)/g;
  const blobPdfRegex = /\[pdf:([^\]]*)\]\(\s*(&[^)\s]+\.sha256)\s*\)/g;
  const mdMentionRegex = /\[@([^\]]+)\]\(@?([A-Za-z0-9+/=.\-]+\.ed25519)\)/g;
  const rawMentionRegex = /@([A-Za-z0-9+/=.\-]+\.ed25519)/g;
  const urlRegex = /\b(?:https?:\/\/|www\.)[^\s]+/g;
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi;
  const allMatches = [];
  for (const m of text.matchAll(blobImageRegex)) {
    allMatches.push({ index: m.index, length: m[0].length, type: 'blob-image', name: m[1], blob: m[2] });
  }
  for (const m of text.matchAll(blobVideoRegex)) {
    allMatches.push({ index: m.index, length: m[0].length, type: 'blob-video', name: m[1], blob: m[2] });
  }
  for (const m of text.matchAll(blobAudioRegex)) {
    allMatches.push({ index: m.index, length: m[0].length, type: 'blob-audio', name: m[1], blob: m[2] });
  }
  for (const m of text.matchAll(blobPdfRegex)) {
    allMatches.push({ index: m.index, length: m[0].length, type: 'blob-pdf', name: m[1], blob: m[2] });
  }
  for (const m of text.matchAll(mdMentionRegex)) {
    allMatches.push({ index: m.index, length: m[0].length, type: 'md-mention', name: m[1], feedId: m[2] });
  }
  for (const m of text.matchAll(rawMentionRegex)) {
    allMatches.push({ index: m.index, length: m[0].length, type: 'raw-mention', feedId: m[1] });
  }
  for (const m of text.matchAll(urlRegex)) {
    allMatches.push({ index: m.index, length: m[0].length, type: 'url', text: m[0] });
  }
  for (const m of text.matchAll(emailRegex)) {
    allMatches.push({ index: m.index, length: m[0].length, type: 'email', text: m[0] });
  }
  allMatches.sort((a, b) => a.index - b.index);
  const filtered = [];
  let lastEnd = 0;
  for (const m of allMatches) {
    if (m.index < lastEnd) continue;
    filtered.push(m);
    lastEnd = m.index + m.length;
  }
  const result = [];
  let cursor = 0;
  for (const m of filtered) {
    if (cursor < m.index) {
      result.push(text.slice(cursor, m.index));
    }
    if (m.type === 'blob-image') {
      result.push(img({ src: `/blob/${encodeURIComponent(m.blob)}`, alt: m.name || '', class: 'post-image' }));
    } else if (m.type === 'blob-video') {
      result.push(video({ controls: true, class: 'post-video', src: `/blob/${encodeURIComponent(m.blob)}` }));
    } else if (m.type === 'blob-audio') {
      result.push(audio({ controls: true, class: 'post-audio', src: `/blob/${encodeURIComponent(m.blob)}` }));
    } else if (m.type === 'blob-pdf') {
      const i18n = getI18n();
      const label = m.name || i18n.pdfFallbackLabel || 'PDF';
      result.push(a({ href: `/blob/${encodeURIComponent(m.blob)}`, class: 'post-pdf', target: '_blank' }, label));
    } else if (m.type === 'md-mention') {
      const feedWithAt = '@' + m.feedId;
      result.push(a({ href: `/author/${encodeURIComponent(feedWithAt)}`, class: 'mention' }, '@' + m.name));
    } else if (m.type === 'raw-mention') {
      const feedWithAt = '@' + m.feedId;
      result.push(a({ href: `/author/${encodeURIComponent(feedWithAt)}`, class: 'mention' }, '@' + m.feedId.slice(0, 8) + '...'));
    } else if (m.type === 'url') {
      const href = m.text.startsWith('http') ? m.text : `https://${m.text}`;
      result.push(a({ href, target: '_blank', rel: 'noopener noreferrer' }, m.text));
    } else if (m.type === 'email') {
      result.push(a({ href: `mailto:${m.text}` }, m.text));
    }
    cursor = m.index + m.length;
  }
  if (cursor < text.length) {
    result.push(text.slice(cursor));
  }
  return result;
}

module.exports = { renderUrl };
