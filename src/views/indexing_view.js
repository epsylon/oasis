const { a, br, div, h2, p, progress, section, span, strong, meta, head, html, link, title, body, main } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { getConfig } = require('../configs/config-manager.js');

const doctypeString = '<!DOCTYPE html>';

exports.indexingView = ({ percent }) => {
  let metaRefresh;
  try {
    const cfg = getConfig() || {};
    const theme = cfg.themes?.current || 'Dark-SNH';
    void theme;
  } catch (_) {}

  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const headingText = i18n.indexingTitle || 'Synchronizing';
  const message = i18n.indexingMessage || 'Oasis is trying to syncronize a huge network of inhabitants. Just wait!';
  const refreshNote = i18n.indexingRefreshNote || 'This page refreshes every 10 seconds.';
  const editProfileLabel = i18n.indexingEditProfileLink || 'Set up my avatar';

  return template(
    headingText,
    section(
      div({ class: 'tags-header' },
        h2(`❤  ${headingText}`),
        p(message)
      ),
      div({ class: 'indexing-progress-block' },
        progress({ value: String(pct), max: '100', class: 'indexing-progress' }),
        p({ class: 'indexing-percent' }, strong(`${pct.toFixed(1)} %`)),
        p({ class: 'indexing-note' }, refreshNote)
      ),
      div({ class: 'indexing-actions' },
        a({ href: '/profile/edit', class: 'filter-btn welcome-action-primary' }, editProfileLabel),
        a({ href: '/modules', class: 'filter-btn' }, i18n.modulesTitle || 'Modules')
      )
    )
  ).replace('</head>', '<meta http-equiv="refresh" content="10"></head>');
};
