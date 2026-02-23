"use strict";

const { JSDOM } = require('../server/node_modules/jsdom');
const DOMPurify = require('../server/node_modules/dompurify');
const window = new JSDOM('').window;
const purify = DOMPurify(window);

const stripDangerousTags = (input) => {
  if (typeof input !== 'string') return '';
  return purify.sanitize(input, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: [
      'p', 'br',
      'b', 'strong', 'i', 'em', 'u',
      'ul', 'ol', 'li',
      'blockquote',
      'code', 'pre'
    ],
    ALLOWED_ATTR: [],
    FORBID_TAGS: ['svg', 'math', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button', 'script'],
    FORBID_ATTR: ['style']
  });
};

const sanitizeHtml = (input) => {
  if (typeof input !== 'string') return '';
  return purify.sanitize(input, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: [
      'p', 'br', 'hr',
      'b', 'strong', 'i', 'em', 'u', 's', 'del',
      'ul', 'ol', 'li',
      'blockquote', 'code', 'pre',
      'a', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'img', 'video', 'audio',
      'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ],
    ALLOWED_ATTR: ['href', 'class', 'target', 'rel', 'src', 'alt', 'title', 'controls'],
    FORBID_TAGS: ['svg', 'math', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button', 'script', 'style', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onsubmit', 'onchange', 'style']
  });
};

module.exports = { stripDangerousTags, sanitizeHtml };
