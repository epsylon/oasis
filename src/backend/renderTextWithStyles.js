const i18nBase = require("../client/assets/translations/i18n");

function getI18n() {
  try {
    const { i18n } = require("../views/main_views");
    return i18n;
  } catch (_) {
    return i18nBase['en'] || {};
  }
}

function renderTextPreview(text, maxLength = 220) {
  if (!text) return ''

  let preview = String(text)

  preview = preview
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^>.*$/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^- /gm, '')
    .replace(/^\d+\. /gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/\n+/g, ' ')
    .trim()

  if (preview.length > maxLength) {
    preview = preview.slice(0, maxLength) + '...'
  }

  return preview
}

function renderTextWithStyles(text) {
  if (!text) return ''
  const i18n = getI18n()

  let html = String(text)

  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  html = html
    .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
    .replace(/^> (.*)$/gim, '<blockquote>$1</blockquote>')
    .replace(/^---$/gim, '<hr/>')
    .replace(/^### (.*)$/gim, '<h3>$1</h3>')
    .replace(/^## (.*)$/gim, '<h2>$1</h2>')
    .replace(/^# (.*)$/gim, '<h1>$1</h1>')

  html = html
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/`([^`]+)`/gim, '<code>$1</code>')

  html = html
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

  html = html
    .replace(/\[@([^\]]+)\]\(@?([A-Za-z0-9+/=.\-]+\.ed25519)\)/g, (_, name, id) =>
      `<a href="/author/${encodeURIComponent('@' + id)}" class="mention" target="_blank">@${name}</a>`
    )
    .replace(/@([A-Za-z0-9+/=.\-]+\.ed25519)/g, (_, id) =>
      `<a href="/author/${encodeURIComponent('@' + id)}" class="mention" target="_blank">@${id}</a>`
    )

  html = html
    .replace(/#(\w+)/g, (_, tag) =>
      `<a href="/hashtag/${encodeURIComponent(tag)}" class="styled-link" target="_blank">#${tag}</a>`
    )
    .replace(/(https?:\/\/[^\s]+)/g, url =>
      `<a href="${url}" target="_blank" class="styled-link">${url}</a>`
    )
    .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, email =>
      `<a href="mailto:${email}" class="styled-link">${email}</a>`
    )

  const lines = html.split('\n')
  let result = ''
  let inUL = false
  let inOL = false

  for (let line of lines) {
    if (/^- /.test(line)) {
      if (!inUL) {
        result += '<ul>'
        inUL = true
      }
      result += `<li>${line.replace(/^- /, '')}</li>`
      continue
    }

    if (/^\d+\. /.test(line)) {
      if (!inOL) {
        result += '<ol>'
        inOL = true
      }
      result += `<li>${line.replace(/^\d+\. /, '')}</li>`
      continue
    }

    if (inUL) {
      result += '</ul>'
      inUL = false
    }

    if (inOL) {
      result += '</ol>'
      inOL = false
    }

    result += line + '<br>'
  }

  if (inUL) result += '</ul>'
  if (inOL) result += '</ol>'

  return result
}

module.exports = { renderTextWithStyles, renderTextPreview }
