const i18nBase = require("../client/assets/translations/i18n");

function getI18n() {
  try {
    const { i18n } = require("../views/main_views");
    return i18n;
  } catch (_) {
    return i18nBase['en'] || {};
  }
}

function renderTextWithStyles(text) {
  if (!text) return ''
  const i18n = getI18n()
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/!\[([^\]]*)\]\(\s*(&amp;[^)\s]+\.sha256)\s*\)/g, (_, alt, blob) =>
      `<img src="/blob/${encodeURIComponent(blob.replace(/&amp;/g, '&'))}" alt="${alt}" class="post-image" />`
    )
    .replace(/\[video:([^\]]*)\]\(\s*(&amp;[^)\s]+\.sha256)\s*\)/g, (_, _name, blob) =>
      `<video controls class="post-video" src="/blob/${encodeURIComponent(blob.replace(/&amp;/g, '&'))}"></video>`
    )
    .replace(/\[audio:([^\]]*)\]\(\s*(&amp;[^)\s]+\.sha256)\s*\)/g, (_, _name, blob) =>
      `<audio controls class="post-audio" src="/blob/${encodeURIComponent(blob.replace(/&amp;/g, '&'))}"></audio>`
    )
    .replace(/\[pdf:([^\]]*)\]\(\s*(&amp;[^)\s]+\.sha256)\s*\)/g, (_, name, blob) =>
      `<a class="post-pdf" href="/blob/${encodeURIComponent(blob.replace(/&amp;/g, '&'))}" target="_blank">${name || i18n.pdfFallbackLabel || 'PDF'}</a>`
    )
    .replace(/\[@([^\]]+)\]\(@?([A-Za-z0-9+/=.\-]+\.ed25519)\)/g, (_, name, id) =>
      `<a href="/author/${encodeURIComponent('@' + id)}" class="mention" target="_blank">@${name}</a>`
    )
    .replace(/@([A-Za-z0-9+/=.\-]+\.ed25519)/g, (_, id) =>
      `<a href="/author/${encodeURIComponent('@' + id)}" class="mention" target="_blank">@${id}</a>`
    )
    .replace(/#(\w+)/g, (_, tag) =>
      `<a href="/hashtag/${encodeURIComponent(tag)}" class="styled-link" target="_blank">#${tag}</a>`
    )
    .replace(/(https?:\/\/[^\s]+)/g, url =>
      `<a href="${url}" target="_blank" class="styled-link">${url}</a>`
    )
    .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, email =>
      `<a href="mailto:${email}" class="styled-link">${email}</a>`
    )
}

module.exports = { renderTextWithStyles }
