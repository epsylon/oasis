const { a } = require("../server/node_modules/hyperaxe");

function renderUrl(text) {
  if (typeof text !== 'string') return [text];
  const urlRegex = /\b(?:https?:\/\/|www\.)[^\s]+/g;
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi;
  const result = [];
  let cursor = 0;
  const matches = [...(text.matchAll(urlRegex)), ...(text.matchAll(emailRegex))]
    .sort((a, b) => a.index - b.index);
  for (const match of matches) {
    const url = match[0];
    const index = match.index;
    if (cursor < index) {
      result.push(text.slice(cursor, index));
    }
    if (url.startsWith('http') || url.startsWith('www.')) {
      const href = url.startsWith('http') ? url : `https://${url}`;
      result.push(a({ href, target: '_blank', rel: 'noopener noreferrer' }, url));
    } else if (url.includes('@')) {
      result.push(a({ href: `mailto:${url}` }, url));
    }
    cursor = index + url.length;
  }
  if (cursor < text.length) {
    result.push(text.slice(cursor));
  }
  return result;
}

module.exports = { renderUrl };
