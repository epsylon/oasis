const MEDIA_RE = /<(video|audio)\b[^>]*?\ssrc="\/(?:c\/)?blob\/(%26[^"?#]+)[^"]*"[^>]*>[\s\S]*?<\/\1>/g;
const PICTURE_RE = /<img\b[^>]*?\ssrc="\/(?:c\/)?(?:blob|image\/\d+)\/(%26[^"?#]+)([^"]*)"[^>]*>/g;
const DOWNLOAD_RE = /<a\b(?=[^>]*\sdata-blob=")([^>]*)>[\s\S]*?<\/a>/g;
const HAS_PENDING_RE = /<(?:video|audio|img)\b|\sdata-blob="/;

const idOf = (enc) => { try { return decodeURIComponent(enc); } catch (_) { return ''; } };
const downloadBlobOf = (attrs) => { const m = /\sdata-blob="([^"]+)"/.exec(attrs); return m ? m[1].replace(/&amp;/g, '&') : ''; };
const isAvatar = (rest) => String(rest || '').includes('fallback=avatar');

const pendingIds = (html) => [...new Set([
  ...[...html.matchAll(MEDIA_RE)].map((m) => idOf(m[2])),
  ...[...html.matchAll(PICTURE_RE)].filter((m) => !isAvatar(m[2])).map((m) => idOf(m[1])),
  ...[...html.matchAll(DOWNLOAD_RE)].map((m) => downloadBlobOf(m[1]))
].filter(Boolean))];

const markMissing = (html, missing, text) => {
  const notice = `<div class="pending-media" role="note">${text}</div>`;
  const pictureNotice = `<span class="pending-media pending-media-picture" role="note">${text}</span>`;
  return html
    .replace(MEDIA_RE, (whole, tag, enc) => missing.has(idOf(enc)) ? notice : whole)
    .replace(PICTURE_RE, (whole, enc, rest) => !isAvatar(rest) && missing.has(idOf(enc)) ? pictureNotice : whole)
    .replace(DOWNLOAD_RE, (whole, attrs) => missing.has(downloadBlobOf(attrs)) ? (/\sdata-blob-notice="1"/.test(attrs) ? notice : '') : whole);
};

module.exports = { HAS_PENDING_RE, pendingIds, markMissing };
