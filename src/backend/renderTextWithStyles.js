function renderTextWithStyles(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@([A-Za-z0-9+/=.\-]+\.ed25519)/g, (_, id) =>
      `<a href="/author/${encodeURIComponent('@' + id)}" class="styled-link" target="_blank">@${id}</a>`
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
