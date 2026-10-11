const { a, br, div, h2, p, progress, section, span, strong, meta, head, html, link, title, body, main } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { getConfig } = require('../configs/config-manager.js');

const doctypeString = '<!DOCTYPE html>';

exports.indexingView = ({ percent, refresh = 10 }) => {
  let metaRefresh;
  try {
    const cfg = getConfig() || {};
    const theme = cfg.themes?.current || 'Dark-SNH';
    void theme;
  } catch (_) {}

  const known = percent !== null && percent !== undefined && Number.isFinite(Number(percent));
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const headingText = i18n.indexingTitle || 'Synchronizing';
  const refreshNote = i18n.indexingRefreshNote || 'This page refreshes every 10 seconds.';

  return template(
    headingText,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(`❤  ${headingText}`)
      ),
      div({ class: 'indexing-progress-block' },
        p({ class: 'indexing-message' }, `\ud83c\udf34 ${i18n.indexingMessage || 'Oasis is synchronizing the distributed network of nodes. Please wait.'}`),
        known ? progress({ value: String(pct), max: '100', class: 'indexing-progress' }) : progress({ max: '100', class: 'indexing-progress' }),
        known ? p({ class: 'indexing-percent' }, strong(`${pct.toFixed(1)} %`)) : null,
        p({ class: 'indexing-note' }, String(refreshNote).replace('10', String(Number(refresh) || 10)))
      )
    )
  ).replace('</head>', `<meta http-equiv="refresh" content="${Number(refresh) || 10}"></head>`);
};
