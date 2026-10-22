"use strict";

const SAFE_SRC = /^\/(?:c\/)?(?:blob|image)\/[^\s"'<>]+$/i;
const SAFE_HREF = /^(?:https?:\/\/|\/(?!\/)|#|mailto:)/i;
const SAFE_CLASS = /^(?:rt-[a-z0-9-]+|styled-link|mention|tag-link|tag-inline|zoom-link|pm-quote|wiki-link(?:-missing)?|internal-link(?:-id|-kind)?|lightbox(?:-[a-z]+)?|post-(?:audio|image|pdf|video)|pdf-(?:holder|frame|unmax))$/;
const SAFE_ID = /^(?:pdf|rtzoom|linkbox)-[A-Za-z0-9-]+$/;
const SAFE_OBJECT_DATA = /^\/pdf\/embed\?[^\s"'<>]*$/;
const OBJECT_TYPE = 'text/html';
let purifier = null;
const getPurify = () => {
  if (purifier) return purifier;
  const { JSDOM } = require('../server/node_modules/jsdom');
  const DOMPurify = require('../server/node_modules/dompurify');
  const purify = DOMPurify(new JSDOM('').window);
  purify.addHook('uponSanitizeAttribute', (node, data) => {
    const name = String(data.attrName || '').toLowerCase();
    const value = String(data.attrValue || '').trim();
    if (name === 'src' && !SAFE_SRC.test(value)) data.keepAttr = false;
    if (name === 'href' && !SAFE_HREF.test(value)) data.keepAttr = false;
    if (name === 'id' && !SAFE_ID.test(value)) data.keepAttr = false;
    if (name === 'data' && !(String(node.nodeName || '').toLowerCase() === 'object' && SAFE_OBJECT_DATA.test(value))) data.keepAttr = false;
    if (name === 'type' && String(node.nodeName || '').toLowerCase() === 'object' && value !== OBJECT_TYPE) data.keepAttr = false;
    if (name === 'class') {
      const kept = value.split(/\s+/).filter(c => SAFE_CLASS.test(c));
      if (kept.length) data.attrValue = kept.join(' '); else data.keepAttr = false;
    }
  });
  purifier = purify;
  return purifier;
};
const dropControlChars = (html) => String(html).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const stripDangerousTags = (input) => {
  if (typeof input !== 'string') return '';
  return dropControlChars(getPurify().sanitize(input, {
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
  }));
};

const sanitizeHtml = (input) => {
  if (typeof input !== 'string') return '';
  return dropControlChars(getPurify().sanitize(input, {
    ALLOWED_TAGS: [
      'p', 'br', 'hr',
      'b', 'strong', 'i', 'em', 'u', 's', 'del',
      'ul', 'ol', 'li',
      'blockquote', 'code', 'pre',
      'a', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'img', 'video', 'audio', 'object',
      'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ],
    ALLOWED_ATTR: ['href', 'class', 'target', 'rel', 'src', 'alt', 'title', 'controls', 'id', 'data', 'type'],
    FORBID_TAGS: ['svg', 'math', 'iframe', 'embed', 'form', 'input', 'textarea', 'select', 'button', 'script', 'style', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onsubmit', 'onchange', 'style']
  }));
};

module.exports = { stripDangerousTags, sanitizeHtml };
