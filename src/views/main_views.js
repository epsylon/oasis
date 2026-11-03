"use strict";

const path = require("path");
const RAW_HTML = Symbol.for('oasis.rawHtml');
const fs = require("fs");

const envPaths = require("../server/node_modules/env-paths");
const debug = require("../server/node_modules/debug")("oasis");
const highlightJs = require("../server/node_modules/highlight.js/lib/core");
highlightJs.registerLanguage("json", require("../server/node_modules/highlight.js/lib/languages/json"));
const prettyMs = require("../server/node_modules/pretty-ms");
const moment = require('../server/node_modules/moment');
const { renderStyledText, renderStyledHtml, plainText, safeExternalHref } = require('../backend/renderStyledText');
const ssbClientGUI = require("../client/gui");
const config = require("../server/ssb_config");
const cooler = ssbClientGUI({ offline: config.offline });
const sharedState = require('../configs/shared-state');

let ssb, userId;

const getUserId = async () => {
  if (userId) return userId;
  if (config && config.keys && config.keys.id) { userId = config.keys.id; return userId; }
  if (!ssb) ssb = await cooler.open();
  userId = ssb.id;
  return userId;
};
exports.getUserId = getUserId;

const { a, article, br, body, button, details, div, em, form, h1, h2, h3, head, hr, html, img, input, label, li, link, main, meta, nav, option, p, pre, section, select, span, summary, table, td, textarea, title, tr, ul, strong, video: videoHyperaxe, audio: audioHyperaxe, object } = require("../server/node_modules/hyperaxe");

const lodash = require("../server/node_modules/lodash");
const { sanitizeHtml } = require('../backend/sanitizeHtml');
const nameCache = require('../backend/nameCache');
const mediaPlayer = require('../backend/media_player');

const userLinkLabel = (feedId, knownName) => {
  const id = String(feedId || '');
  if (!id) return '';
  let kn = (knownName && String(knownName).trim()) || '';
  if (kn === id || /^@[A-Za-z0-9+/_-]{43}=\.ed25519$/.test(kn)) kn = '';
  const name = kn || nameCache.get(id);
  if (name && name.length) return '@' + name;
  return id;
};

const userLink = (feedId, knownName) => {
  if (!feedId) return null;
  return a({ class: 'user-link', href: `/author/${encodeURIComponent(feedId)}` }, userLinkLabel(feedId, knownName));
};

exports.userLink = userLink;

const renderCreatedRows = (createdAt, author, updatedAt) => {
  const createdTs = createdAt ? new Date(createdAt).getTime() : NaN;
  const updatedTs = updatedAt ? new Date(updatedAt).getTime() : NaN;
  const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);
  return [
    createdAt ? tr(td({ class: 'tribe-info-label' }, i18n.createdAtLabel), td({ class: 'tribe-info-value', colspan: '3' }, moment(createdAt).format('YYYY/MM/DD HH:mm'))) : null,
    showUpdated ? tr(td({ class: 'tribe-info-label' }, i18n.jobsUpdatedAt), td({ class: 'tribe-info-value', colspan: '3' }, moment(updatedAt).format('YYYY/MM/DD HH:mm'))) : null,
    author ? tr(td({ class: 'tribe-info-value', colspan: '4' }, userLink(author))) : null
  ];
};
exports.renderCreatedRows = renderCreatedRows;

const renderEditedChip = (tipId, rootId, updatedAt = null) => {
  if (!(tipId && rootId && String(tipId) !== String(rootId))) return null;
  const when = updatedAt && moment(updatedAt).isValid() ? moment(updatedAt).format('YYYY/MM/DD') : '';
  return a({ href: `/versions/${encodeURIComponent(tipId)}`, class: 'edited-chip', title: i18n.wikiHistory }, `${String(i18n.edited || 'edited').toUpperCase()}${when ? `: ${when}` : ''}`);
};
exports.renderEditedChip = renderEditedChip;

const renderMediaLockNote = (item) => (item && item.mediaLocked === true) || require('../backend/opinion_categories').hasOpinions(item)
  ? p({ class: 'media-lock-note' }, i18n.mediaLockedAfterOpinions)
  : null;
exports.renderMediaLockNote = renderMediaLockNote;

const versionTitle = (c) => String(c.title || c.name || c.question || c.concept || c.url || '').trim();
const versionText = (c) => String(c.description || c.text || '').trim();
const versionsView = ({ versions = [], backHref = '/' } = {}) => template(
  i18n.wikiHistory,
  section(div({ class: 'tags-header module-header-line' }, h2(i18n.wikiHistory), p(versionTitle((versions[0] || {}).content || {})))),
  section(
    div({ class: 'versions-list' },
      ...versions.map((v, i) => div({ class: 'card card-rpg versions-item' },
        div({ class: 'card-chips-row' },
          span({ class: 'edited-chip' }, `${i18n.wikiVersion} ${versions.length - i}`),
          i === 0 ? span({ class: 'edited-chip' }, i18n.wikiCurrentVersion) : null,
          span({ class: 'votations-comment-date' }, moment(v.ts).format('YYYY/MM/DD HH:mm'))
        ),
        versionTitle(v.content) ? h2(versionTitle(v.content)) : null,
        versionText(v.content) ? p({ class: 'post-text-pre' }, ...renderStyledText(versionText(v.content))) : null,
        Array.isArray(v.content.tags) && v.content.tags.length ? div({ class: 'card-tags' }, ...v.content.tags.map(t => span({ class: 'tag-link' }, `#${t}`))) : null
      ))
    ),
    p(a({ href: backHref, class: 'filter-btn' }, `← ${i18n.wikiBackToPage}`))
  )
);
exports.versionsView = versionsView;

const inboxBadges = () => {
  const inboxCount = Number(sharedState.getInboxCount()) || 0;
  return [inboxCount > 0 ? span({ class: 'inbox-badge' }, String(inboxCount)) : ''];
};
const inboxHref = () => (Number(sharedState.getInboxCount()) || 0) > 0 ? '/inbox?filter=unread' : '/inbox';
const phoneOn = () => !config.public && getConfig().modules.phoneMod !== 'off';
const PHONE_PAM_MAX_MS = require('../server/phone_module').VOICEMAIL_MAX_MS;
const renderCallButton = (feedId, { upper = false, cls = null, pam = false } = {}) => {
  if (!phoneOn() || !feedId || String(feedId) === String(config.keys.id) || sharedState.isPubId(feedId)) return null;
  if (pam) return a({ href: `/phone?filter=create&to=${encodeURIComponent(feedId)}`, class: cls || "filter-btn" }, `✆ ${i18n.phoneCallTooltip}`);
  const label = upper ? String(i18n.phoneCallButton).toUpperCase() : i18n.phoneCallButton;
  return form({ method: "POST", action: "/phone/call", class: "phone-action-form" },
    input({ type: "hidden", name: "to", value: feedId }),
    button({ type: "submit", class: cls || "filter-btn", title: i18n.phoneCallButton }, `✆ ${label}`)
  );
};
exports.renderCallButton = renderCallButton;
const pad2 = (n) => String(n).padStart(2, '0');
const liveClock = (fromMs, { max = 0 } = {}) => {
  const from = Number(fromMs) || Date.now();
  const e = Math.max(0, Math.floor((Date.now() - from) / 1000));
  const roll = (cls, labels) => span({ class: 'live-clock-win' }, span({ class: `live-clock-roll ${cls}` }, ...labels.map(l => span(l))));
  if (max > 0) {
    const cap = Math.floor(max / 1000);
    return span({ class: 'live-clock' }, roll('live-clock-once', Array.from({ length: 60 }, (_, i) => { const v = Math.min(cap, e + i); return `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`; })));
  }
  const m = Math.floor(e / 60), sec = e % 60;
  return span({ class: 'live-clock' },
    roll(`live-clock-min lc-d${sec}`, Array.from({ length: 60 }, (_, i) => `${pad2(m + i)}:`)),
    roll('live-clock-sec', Array.from({ length: 60 }, (_, i) => pad2((sec + i) % 60)))
  );
};
exports.liveClock = liveClock;
const renderPhoneTopLink = () => {
  if (!phoneOn()) return null;
  const n = Number(sharedState.getPhoneCount()) || 0;
  return li(a({ href: "/phone" }, span({ class: "emoji" }, "✆"), nbsp, i18n.phoneTitle, n > 0 ? span({ class: 'inbox-badge' }, String(n)) : ''));
};
exports.userLinkLabel = userLinkLabel;

const renderInviteQrCard = ({ qrDataUrl }) =>
  qrDataUrl ? div({ class: 'invite-qr-card' }, img({ src: qrDataUrl, alt: 'QR', class: 'invite-qr-img' })) : null;
exports.renderInviteQrCard = renderInviteQrCard;

const renderLiveFeed = (src, imgClass) => {
  const id = `live-${String(src).replace(/[^a-zA-Z0-9]/g, '').slice(-24)}`;
  return [
    a({ href: `#${id}`, id: `${id}-src`, class: 'zoom-link zoom-inline' }, img({ src, alt: '', class: imgClass })),
    div({ id, class: 'lightbox live-lightbox' },
      a({ href: `#${id}-src`, class: 'lightbox-close' }, '\u00d7'),
      a({ href: `#${id}-full`, class: 'live-fullscreen-btn', title: i18n.liveFullscreen }, renderIcon('fullscreen')),
      a({ href: `#${id}-src`, class: 'lightbox-image-link' }, img({ src, alt: '', class: 'lightbox-image', loading: 'lazy' }))
    ),
    div({ id: `${id}-full`, class: 'lightbox live-lightbox live-fullscreen' },
      a({ href: `#${id}`, class: 'lightbox-close' }, '\u00d7'),
      a({ href: `#${id}`, class: 'lightbox-image-link' }, img({ src, alt: '', class: 'lightbox-image', loading: 'lazy' }))
    )
  ];
};
exports.renderLiveFeed = renderLiveFeed;

const renderVideoGrid = (peers, me, { film = false } = {}) => {
  const list = (Array.isArray(peers) ? peers : []).filter(p => p && p.id);
  const filmName = (...label) => span({ class: 'video-tile-name video-tile-film' }, '▶ ', ...label);
  const tiles = [
    me ? div({ class: 'video-tile video-tile-me' }, ...renderLiveFeed('/phone/video/me', 'video-feed'), span({ class: 'video-tile-name' }, i18n.roomYou)) : null,
    film ? div({ class: 'video-tile' }, ...renderLiveFeed(`/phone/video/${encodeURIComponent('film:me')}`, 'video-feed'), filmName(i18n.roomYou)) : null,
    ...list.filter(p => p.on).map(p => div({ class: 'video-tile' }, ...renderLiveFeed(`/phone/video/${encodeURIComponent(p.id)}`, 'video-feed'), userLink(p.id))),
    ...list.filter(p => p.film).map(p => div({ class: 'video-tile' }, ...renderLiveFeed(`/phone/video/${encodeURIComponent(`film:${p.id}`)}`, 'video-feed'), filmName(userLink(p.id))))
  ].filter(Boolean);
  return tiles.length ? div({ class: tiles.length === 1 ? 'video-grid video-grid-solo' : 'video-grid' }, ...tiles) : null;
};
exports.renderVideoGrid = renderVideoGrid;

const renderSubscriptionBox = ({ target, scope, subscribed, count, isOwner, returnTo, canWrite, inline, compact }) => {
  if (!target) return null;
  if (isOwner && (Number(count) || 0) <= 1) return null;
  const showPm = canWrite !== undefined ? canWrite : (isOwner || subscribed);
  const total = Number(count) || 0;
  const countSuffix = total ? ` (${total})` : '';
  if (inline) {
    const countNode = total ? span({ class: 'subscription-pill-count' }, `(${total})`) : null;
    return [span({ class: 'subscription-actions' },
      isOwner
        ? span({ class: 'subscription-pill subscription-pill-static', title: `${i18n.subscriptionTitle}${countSuffix}` },
            span({ class: 'subscription-pill-icon' }, '🔔'), countNode)
        : form({ method: 'POST', action: '/subscriptions/toggle', class: 'subscription-form' },
            input({ type: 'hidden', name: 'target', value: target }),
            input({ type: 'hidden', name: 'scope', value: String(scope || '') }),
            input({ type: 'hidden', name: 'on', value: subscribed ? '0' : '1' }),
            returnTo ? input({ type: 'hidden', name: 'returnTo', value: returnTo }) : null,
            button({ type: 'submit', class: subscribed ? 'subscription-pill engage-on' : 'subscription-pill', title: subscribed ? i18n.subscriptionUnsubscribe : i18n.subscriptionSubscribe },
              span({ class: 'subscription-pill-icon' }, '🔔'),
              span({ class: 'subscription-pill-label' }, subscribed ? i18n.subscriptionOn : i18n.subscriptionSubscribe),
              countNode)
          )
    )];
  }
  const parts = [
    total && !compact ? span({ class: 'card-label' }, `${i18n.subscriptionTitle} (${total})${isOwner ? '' : ':'}`) : null,
    compact && isOwner && total ? renderStateChip('transport', '🔔', `${i18n.subscriptionTitle}${countSuffix}`, 'mine') : null,
    span({ class: 'subscription-actions' },
      isOwner
        ? null
        : form({ method: 'POST', action: '/subscriptions/toggle', class: 'subscription-form' },
            input({ type: 'hidden', name: 'target', value: target }),
            input({ type: 'hidden', name: 'scope', value: String(scope || '') }),
            input({ type: 'hidden', name: 'on', value: subscribed ? '0' : '1' }),
            returnTo ? input({ type: 'hidden', name: 'returnTo', value: returnTo }) : null,
            compact
              ? button({ type: 'submit', class: subscribed ? 'delete-btn' : 'update-btn' }, `${subscribed ? i18n.subscriptionUnsubscribe : i18n.subscriptionSubscribe}${countSuffix}`)
              : button({ type: 'submit', class: subscribed ? 'tribe-action-btn danger-btn' : 'tribe-action-btn' }, `${subscribed ? '🔕' : '🔔'} ${String(subscribed ? i18n.subscriptionUnsubscribe : i18n.subscriptionSubscribe).toUpperCase()}`)
          ),
      showPm && total
        ? a({ href: `/pm?list=${encodeURIComponent(target)}`, class: 'btn-singleview btn-pm', title: i18n.pmCreateButton || 'Write a PM' }, renderIcon('mail'))
        : null
    )
  ];
  return div({ class: 'tribe-side-actions shop-visibility-row stacked-action-row subscription-box-block' }, ...parts.filter(Boolean));
};
exports.renderSubscriptionBox = renderSubscriptionBox;

const CHIP_ORDER = ['module', 'tribe', 'scope', 'reach', 'kind', 'level', 'status', 'data', 'eco', 'lifespan', 'mine', 'relation'];
const asChip = (role, node) => {
  if (role && node && typeof node === 'object') node.chipRole = role;
  return node;
};
const chipRoleOf = (node, depth = 0) => {
  if (!node || typeof node !== 'object') return null;
  if (node.chipRole) return node.chipRole;
  if (depth > 2 || !node.childNodes) return null;
  for (const child of Array.from(node.childNodes)) {
    const role = chipRoleOf(child, depth + 1);
    if (role) return role;
  }
  return null;
};
const chipRank = (node) => {
  const i = CHIP_ORDER.indexOf(chipRoleOf(node));
  return i < 0 ? CHIP_ORDER.indexOf('status') : i;
};
const sortChips = (nodes) => [].concat(nodes || []).filter(Boolean)
  .map((node, i) => [node, i])
  .sort((x, y) => chipRank(x[0]) - chipRank(y[0]) || x[1] - y[1])
  .map(([node]) => node);
const renderChipsRow = (...nodes) => div({ class: 'card-chips-row' }, ...sortChips(nodes.flat()));
exports.asChip = asChip;
exports.sortChips = sortChips;
exports.chipRoleOf = chipRoleOf;
exports.renderChipsRow = renderChipsRow;

const LIST_LAYOUTS = [['cards', 'listViewCards', 'layoutCards'], ['list', 'listViewList', 'layoutList'], ['grid', 'listViewGrid', 'layoutGrid']];
const listLayout = () => { const st = listScope(); return (st && st.layout) || 'cards'; };
const renderLayoutSwitch = (rowClass = 'mode-buttons-row', chipClass = null) => {
  const scope = listScope() || {};
  const segs = String(scope.path || '').split('/').filter(Boolean);
  const st = segs.length > 1 ? { path: `/${segs[0]}`, query: '' } : scope;
  const params = Array.from(new URLSearchParams(st.query || '').entries()).filter(([k]) => k !== 'layout' && k !== 'page');
  const current = listLayout();
  if (chipClass) return div({ class: `${rowClass} layout-switch` },
    LIST_LAYOUTS.map(([value, key, icon]) => a({
      href: `${st.path || ''}?${new URLSearchParams([...params, ['layout', value]]).toString()}`,
      class: current === value ? `${chipClass} layout-switch-btn active` : `${chipClass} layout-switch-btn`,
      title: String(i18n[key] || value)
    }, renderIcon(icon)))
  );
  return div({ class: `${rowClass} layout-switch` },
    LIST_LAYOUTS.map(([value, key, icon]) => form({ method: 'GET', action: st.path || '' },
      ...params.map(([k, v]) => input({ type: 'hidden', name: k, value: v })),
      input({ type: 'hidden', name: 'layout', value }),
      button({ type: 'submit', class: current === value ? 'filter-btn layout-switch-btn active' : 'filter-btn layout-switch-btn', title: String(i18n[key] || value) }, renderIcon(icon))
    ))
  );
};
const findNode = (n, pred) => {
  for (const k of Array.from((n && n.childNodes) || [])) {
    if (pred(k)) return k;
    const found = findNode(k, pred);
    if (found) return found;
  }
  return null;
};
const hasClass = (name) => (n) => classesOf(n).includes(name);
const blobDownloadOf = (src) => (String(src || '').startsWith('/blob/') ? `${src}${String(src).includes('?') ? '&' : '?'}download=1` : null);
const localHrefOf = (card) => {
  const media = findNode(card, (k) => ['audio', 'video'].includes(tagOf(k)) && blobDownloadOf(k.src));
  if (media) return blobDownloadOf(media.src);
  const picture = findNode(card, (k) => classesOf(k).some((c) => c === 'image-card-body' || c === 'image') && !!findNode(k, hasClass('lightbox-download')));
  const download = picture ? findNode(picture, hasClass('lightbox-download')) : null;
  return download ? String(download.href || '') || null : null;
};
const forEachCard = (root, fn) => {
  const walk = (n) => {
    for (const k of Array.from((n && n.childNodes) || [])) {
      const top = Array.from(k.childNodes || []).find(hasClass('card-top'));
      if (top) fn(k, String((findNode(top, hasClass('btn-content')) || {}).href || '')); else walk(k);
    }
  };
  walk(root);
};
const OPINION_PAGES = ['/trending', '/opinions'];
const keepsOpinions = () => { const p = String((listScope() || {}).path || ''); return OPINION_PAGES.some((b) => p === b || p.startsWith(b + '/')); };
const linkOpinions = (card, href) => {
  for (let box = findNode(card, hasClass('opinions-voting-collapse')); box && box.parentNode; box = findNode(card, hasClass('opinions-voting-collapse'))) {
    const summary = findNode(box, hasClass('opinions-summary'));
    const count = findNode(box, hasClass('opinions-summary-count'));
    const cls = `${classesOf(summary).join(' ')} opinions-summary-link`.trim();
    const kids = [span({ class: 'opinions-summary-icon' }, 'ꔍ'), span({ class: 'opinions-summary-count' }, String((count && count.textContent) || ''))];
    box.parentNode.insertBefore(href ? a({ href, class: cls, title: i18n.opinionsTitle }, ...kids) : span({ class: cls }, ...kids), box);
    box.parentNode.removeChild(box);
  }
};
const dropOpinions = (card) => {
  const isOpinion = (k) => classesOf(k).some((c) => c === 'opinions-voting-collapse' || c === 'feed-votes-summary');
  for (let node = findNode(card, isOpinion); node && node.parentNode; node = findNode(card, isOpinion)) node.parentNode.removeChild(node);
};
const NO_LOCAL_CARDS = ['podcast-card'];
const addListActions = (card) => {
  if (findNode(card, (k) => classesOf(k).some((c) => c === 'torrent-card-actions' || c === 'card-actions'))) return;
  const local = classesOf(card).some((c) => NO_LOCAL_CARDS.includes(c)) ? null : localHrefOf(card);
  if (local) card.appendChild(div({ class: 'torrent-card-actions' }, a({ href: local, class: 'filter-btn', ...blobAttr(blobOfHref(local)) }, `\u2B07 ${i18n.torrentOasisButton || 'LOCAL'}`)));
};
const collectNodes = (n, pred, out = []) => {
  for (const k of Array.from((n && n.childNodes) || [])) { if (pred(k)) out.push(k); else collectNodes(k, pred, out); }
  return out;
};
const EXCERPT_DROP_TAGS = ['img', 'video', 'audio', 'object', 'embed', 'iframe', 'form', 'button', 'input', 'details', 'table', 'hr'];
const EXCERPT_DROP = ['lightbox', 'zoom-link', 'pdf-holder', 'pdf-viewer-container', 'rt-rule', 'filter-btn'];
const pruneExcerpt = (n) => {
  for (const k of Array.from(n.childNodes || [])) {
    if (k.nodeType === 3) continue;
    if (EXCERPT_DROP_TAGS.includes(tagOf(k)) || classesOf(k).some((c) => EXCERPT_DROP.includes(c))) n.removeChild(k);
    else pruneExcerpt(k);
  }
  return n;
};
const trimEdge = (n, side) => {
  const kids = Array.from(n.childNodes || []);
  const k = side === 'first' ? kids[0] : kids[kids.length - 1];
  if (!k) return;
  if (k.nodeType === 3) {
    const v = String(k.value == null ? k.textContent || '' : k.value);
    const t = side === 'first' ? v.replace(/^\s+/, '') : v.replace(/\s+$/, '');
    if (!t) { n.removeChild(k); trimEdge(n, side); } else k.value = t;
  } else trimEdge(k, side);
};
const addExcerpt = (card) => {
  const src = findNode(card, hasClass('card-excerpt'));
  if (!src) return;
  const box = div({ class: [...classesOf(src).filter((c) => c && c !== 'card-excerpt'), 'card-content', 'card-content-excerpt'].join(' ') });
  for (const k of Array.from(src.childNodes || [])) { src.removeChild(k); box.appendChild(k); }
  pruneExcerpt(box);
  trimEdge(box, 'first');
  trimEdge(box, 'last');
  if (String(box.textContent || '').trim()) card.appendChild(box);
};
const isHeading = (k) => ['h1', 'h2', 'h3', 'h4'].includes(tagOf(k));
const titleOf = (card) => {
  for (const k of Array.from(card.childNodes || [])) {
    if (classesOf(k).includes('card-top')) continue;
    const t = isHeading(k) ? k : findNode(k, isHeading);
    if (t) return t;
  }
  return null;
};
const insertAfter = (ref, node) => {
  const parent = ref.parentNode;
  const kids = Array.from(parent.childNodes || []);
  const next = kids[kids.indexOf(ref) + 1];
  if (next) parent.insertBefore(node, next); else parent.appendChild(node);
};
const placeContent = (card, layout) => {
  const title = layout === 'grid' ? titleOf(card) : null;
  let after = title && title.parentNode && classesOf(title.parentNode).includes('shop-title-row') ? title.parentNode : title;
  for (const k of collectNodes(card, hasClass('card-content'))) {
    k.parentNode.removeChild(k);
    const box = tagOf(k) === 'div' ? k : div({ class: 'card-content' }, k);
    if (after && after.parentNode) { insertAfter(after, box); after = box; } else card.appendChild(box);
  }
  for (const k of collectNodes(card, hasClass('card-actions'))) { k.parentNode.removeChild(k); card.appendChild(k); }
};
const ENGAGE_DROP = ['comments-summary', 'comments-summary-link', 'comments-collapse', 'card-share', 'support-form', 'support-pill'];
const dropEngagement = (card) => {
  for (const k of collectNodes(card, hasClass('card-engage'))) k.class = `${classesOf(k).join(' ')} card-meta-row`.trim();
  for (const k of collectNodes(card, (n) => classesOf(n).some((c) => ENGAGE_DROP.includes(c)))) k.parentNode.removeChild(k);
  for (const row of collectNodes(card, hasClass('card-meta-row'))) {
    if (!Array.from(row.childNodes || []).some((k) => k.nodeType !== 3 || String(k.textContent || '').trim())) row.parentNode.removeChild(row);
  }
};
const renderListTitle = (href, title) => compactCards() ? h2({ class: 'tribe-card-title' }, a({ href }, title)) : a({ href, class: 'user-link' }, title);
const listItemClass = (cls) => compactCards() ? `${cls} tribe-card` : cls;
exports.renderListTitle = renderListTitle;
exports.listItemClass = listItemClass;
const renderLayoutItems = (cards, layout = listLayout()) => {
  const st = listScope();
  if (!st || layout === 'cards' || !LIST_LAYOUTS.some(([value]) => value === layout)) return cards();
  st.compactCards = layout;
  try {
    const node = div({ class: `layout-${layout}` }, cards());
    const opinions = keepsOpinions();
    forEachCard(node, (card, href) => {
      if (opinions) linkOpinions(card, href); else dropOpinions(card);
      if (layout === 'list') addExcerpt(card);
      placeContent(card, layout);
      dropEngagement(card);
      if (layout === 'list') addListActions(card);
    });
    return node;
  } finally { st.compactCards = false; }
};
const compactCards = () => !!(listScope() || {}).compactCards;
exports.listLayout = listLayout;
exports.renderLayoutSwitch = renderLayoutSwitch;
exports.renderLayoutItems = renderLayoutItems;

const renderStateChip = (variant, icon, text, role = null) => asChip(role,
  span({ class: `pm-exposition-chip pm-exposition-${variant}${role === 'module' ? ' pm-exposition-module' : ''}` },
    icon ? span({ class: "pm-exposition-icon" }, icon) : null,
    span({ class: "pm-exposition-text" }, String(text || ""))
  ));

const renderCountChip = (icon, label, value, variant = 'whole') => asChip('data',
  span({ class: `pm-exposition-chip pm-exposition-${variant}`, ...(label ? { title: String(label) } : {}) },
    span({ class: "pm-exposition-icon" }, icon),
    span({ class: "pm-exposition-text" }, typeof value === 'string' ? value : String(Number(value) || 0))
  ));
exports.renderCountChip = renderCountChip;

const renderPhoneCallForm = (to, inner, title) => !phoneOn() || !to
  ? inner
  : form({ method: 'POST', action: '/phone/call', class: 'phone-chip-form' },
      input({ type: 'hidden', name: 'to', value: String(to) }),
      button({ type: 'submit', class: 'phone-chip-btn', title: title || i18n.phoneCallButton }, inner));
const renderPhoneChip = (number, title) => number ? renderPhoneCallForm(number, renderStateChip('whole', '✆', number, 'data'), title) : null;
exports.renderPhoneChip = renderPhoneChip;

const renderOpenClosedChip = (status, i18nObj) => {
  const s = String(status || "").toUpperCase();
  const isOpen = s === "OPEN";
  const label = (i18nObj && i18nObj["statusChip" + s]) || s;
  return renderStateChip(isOpen ? "mutuals" : "hidden", isOpen ? "✓" : "✗", label);
};

const renderVisibilityChip = (visibility, i18nObj) => {
  const v = String(visibility || "").toUpperCase();
  if (v === "HIDDEN") {
    return renderStateChip("hidden", "🙈", (i18nObj && i18nObj.visibilityHidden) || "HIDDEN", "status");
  }
  return renderStateChip("mutuals", "👁", (i18nObj && i18nObj.visibilityPublic) || "PUBLIC", "status");
};

const renderModeChip = (mode, i18nObj) => {
  const m = String(mode || "").toLowerCase();
  if (m === "strict") return renderStateChip("closed", "🔑", (i18nObj && i18nObj.tribeStrict) || "STRICT", "level");
  return renderStateChip("mutuals", "✓", (i18nObj && i18nObj.tribeOpen) || "OPEN", "level");
};

const renderLifespanChip = (lifetime, i18nObj) => {
  const lt = lifetime || null;
  if (!lt || !lt.bucket) return null;
  const range = lt.contentRange || lt.range || "";
  const bucket = lt.contentBucket || lt.bucket;
  if (range) {
    return asChip('lifespan', span({ class: `pm-exposition-chip pm-exposition-lifespan-${bucket}` },
      span({ class: "pm-exposition-icon" }, "⧗"),
      span({ class: "pm-exposition-text" }, range)
    ));
  }
  return asChip('lifespan', span({ class: `pm-exposition-chip pm-exposition-lifespan-${lt.bucket}` },
    span({ class: `activity-dot ${lt.bucket}` }, "●"),
    span({ class: "pm-exposition-text" }, (i18nObj && i18nObj.lifespanLabel) || "Lifespan")
  ));
};

const DATE_TIME_FORMAT = "YYYY/MM/DD HH:mm";
const DATE_FORMAT = "YYYY/MM/DD";
const fmtDateTime = (v) => (v ? moment(v).format(DATE_TIME_FORMAT) : "");
const fmtDay = (v) => (v ? moment(v).format(DATE_FORMAT) : "");
exports.DATE_TIME_FORMAT = DATE_TIME_FORMAT;
exports.DATE_FORMAT = DATE_FORMAT;
exports.fmtDateTime = fmtDateTime;
exports.fmtDay = fmtDay;

const clearnetShortId = (id) => String(id || '').replace(/^[%&@]/, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toLowerCase();
const clearnetSlugFor = (title, id) => {
  const base = String(title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  const short = clearnetShortId(id);
  return base ? `${base}-${short}` : short;
};
exports.clearnetShortId = clearnetShortId;
exports.clearnetSlugFor = clearnetSlugFor;
const clearnetItemHref = (modulePath, title, id) => `/c/${modulePath}/${encodeURIComponent(clearnetSlugFor(title, id))}`;
exports.clearnetItemHref = clearnetItemHref;
const CLEARNET_PATHS = { blogs: 'blog', wiki: 'wiki', market: 'market', audios: 'audios', videos: 'videos', images: 'images', documents: 'documents', bookmarks: 'bookmarks', events: 'events', feed: 'feed', jobs: 'jobs', podcasts: 'podcasts', projects: 'projects', torrents: 'torrents', files: 'files', shops: 'shops', emergencies: 'emergencies', campaigns: 'campaigns', housing: 'housing' };
let clearnetBaseCache = null;
const clearnetBase = () => {
  if (clearnetBaseCache !== null) return clearnetBaseCache;
  clearnetBaseCache = String((require('../configs/config-manager.js').defaultInvite() || {}).url || '').replace(/\/+$/, '');
  return clearnetBaseCache;
};
const clearnetHrefFor = (viewHref, blockId, title) => {
  const m = String(viewHref || '').match(/^\/(school\/course|[a-z]+)\/([^/?#]+)/);
  if (!m) return null;
  const seg = m[1] === 'school/course' ? 'school' : CLEARNET_PATHS[m[1]];
  if (!seg) return null;
  const base = clearnetBase();
  const id = blockId ? encodeURIComponent(clearnetSlugFor(title, blockId)) : m[2];
  return base ? `${base}/c/${seg}/${id}` : null;
};
let linkBoxSeq = 0;
const renderLinkBox = (blockId, viewHref, title, trigger = null) => {
  linkBoxSeq = (linkBoxSeq + 1) % 1000000;
  const id = `linkbox-${linkBoxSeq}-${String(blockId).replace(/[^a-zA-Z0-9]/g, '').slice(-10)}`;
  const clearnetHref = clearnetHrefFor(viewHref, blockId, title);
  return [
    trigger
      ? a({ href: `#${id}`, id: `${id}-src`, class: trigger.class, title: i18n.copyLinkTitle }, ...trigger.content)
      : a({ href: `#${id}`, id: `${id}-src`, class: 'btn-singleview btn-link', title: i18n.copyLinkTitle }, renderIcon('link')),
    span({ id, class: 'lightbox link-lightbox' },
      a({ href: `#${id}-src`, class: 'lightbox-close' }, '\u00d7'),
      span({ class: 'link-box' },
        span({ class: 'link-box-row' }, span({ class: 'link-box-label' }, i18n.linkBoxOasis), input({ type: 'text', readonly: true, class: 'link-box-input', value: viewHref })),
        clearnetHref ? span({ class: 'link-box-row' }, span({ class: 'link-box-label' }, i18n.linkBoxClearnet), input({ type: 'text', readonly: true, class: 'link-box-input', value: clearnetHref })) : null
      )
    )
  ];
};

const renderWalletChip = () => {
  try { if (getConfig().modules.walletMod !== 'on') return null; } catch (_) { return null; }
  const ready = sharedState.getWalletReady ? sharedState.getWalletReady() : false;
  const chip = renderStateChip(ready ? 'mutuals' : 'closed', '❄', 'ECOin');
  return ready ? chip : a({ href: '/wallet', class: 'wallet-chip-link', title: i18n.bankWalletNotConfigured }, chip);
};
exports.renderWalletChip = renderWalletChip;

const torrentFileName = (title) => `${String(title || 'download').replace(/\.torrent$/i, '')}.torrent`;
const BLOB_ID_RE = /^&[A-Za-z0-9+/]{43}=\.sha256$/;
const blobOfHref = (href) => {
  const m = /\/blob\/([^?#/]+)/.exec(String(href || ''));
  if (!m) return null;
  try { const id = decodeURIComponent(m[1]); return BLOB_ID_RE.test(id) ? id : null; } catch (_) { return null; }
};
const blobAttr = (id, notice = false) => (typeof id === 'string' && BLOB_ID_RE.test(id) ? { 'data-blob': id, ...(notice ? { 'data-blob-notice': '1' } : {}) } : {});
exports.blobOfHref = blobOfHref;
exports.blobAttr = blobAttr;
const torrentDownloadHref = (blobId, title) => `/blob/${encodeURIComponent(blobId)}?name=${encodeURIComponent(torrentFileName(title))}`;
const renderTorrentDownload = (href, opts = {}) =>
  a({ href, class: opts.class || 'filter-btn', ...blobAttr(opts.blob || blobOfHref(href), opts.notice) }, `\u2B07 ${i18n.torrentExternalButton || 'EXTERNAL'}`);
exports.torrentDownloadHref = torrentDownloadHref;
exports.renderTorrentDownload = renderTorrentDownload;
const renderTorrentSourceDownload = (torrentKey, source, opts = {}) => {
  if (typeof source !== 'string' || !source.startsWith('&') || !torrentKey) return null;
  return a({ href: `/torrents/${encodeURIComponent(torrentKey)}/get`, class: opts.class || 'filter-btn', ...blobAttr(source, opts.notice) }, `\u2B07 ${i18n.torrentOasisButton || 'LOCAL'}`);
};
exports.renderTorrentSourceDownload = renderTorrentSourceDownload;
const renderFileDownloads = (fileKey, torrentUrl, name, opts = {}) => {
  if (!fileKey) return null;
  const btnClass = opts.class || 'filter-btn';
  const torrentName = `${String(name || 'download').replace(/\.torrent$/i, '')}.torrent`;
  return div({ class: 'torrent-card-actions' },
    a({ href: `/files/${encodeURIComponent(fileKey)}/get`, class: btnClass, ...blobAttr(opts.blob, opts.notice) }, `\u2B07 ${i18n.torrentOasisButton || 'LOCAL'}`),
    typeof torrentUrl === 'string' && torrentUrl.startsWith('&')
      ? a({ href: `/blob/${encodeURIComponent(torrentUrl)}?name=${encodeURIComponent(torrentName)}`, class: btnClass, ...blobAttr(torrentUrl) }, `\u2B07 ${i18n.torrentExternalButton || 'EXTERNAL'}`)
      : null
  );
};
exports.renderFileDownloads = renderFileDownloads;

const blobUrlOf = (v) => (String(v || '').startsWith('/blob/sealed/') ? String(v) : `/blob/${encodeURIComponent(v)}`);
exports.blobUrlOf = blobUrlOf;
const PLAIN_BLOB_RE = /^&[A-Za-z0-9+/]{43}=\.sha256$/;
const renderPlayerFollow = (blobId, title, href) => {
  if (config.public || !PLAIN_BLOB_RE.test(String(blobId || '')) || !mediaPlayer.available()) return null;
  return form({ method: 'POST', action: '/player/start', class: 'player-follow-form' },
    input({ type: 'hidden', name: 'blob', value: blobId }),
    input({ type: 'hidden', name: 'title', value: String(title || '').slice(0, 200) }),
    input({ type: 'hidden', name: 'href', value: href }),
    button({ type: 'submit', class: 'filter-btn', title: i18n.playerFollowHint }, renderIcon('headphones')));
};
exports.renderPlayerFollow = renderPlayerFollow;
const ACTION_ICONS = {
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  leave: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  hide:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="3" x2="21" y2="21"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>',
  spread: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/>',
  pin: '<path d="M9 3h6l-1 6 4 4H6l4-4-1-6z"/><line x1="12" y1="13" x2="12" y2="21"/>',
  report: '<line x1="5" y1="21" x2="5" y2="3"/><path d="M5 4h12l-2.5 4.5L17 13H5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><polyline points="3 7 12 13 21 7"/>',
  call: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L11.8 5.8"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4"/>',
  block: '<path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z"/><polyline points="3.5 7.25 12 12 20.5 7.25"/><line x1="12" y1="12" x2="12" y2="21.5"/>',
  datagram: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="3" y1="12" x2="21" y2="12"/>',
  open: '<path d="M7 17L17 7M8 7h9v9"/>',
  donate: '<line x1="12" y1="2" x2="12" y2="22"/><line x1="3.3" y1="7" x2="20.7" y2="17"/><line x1="3.3" y1="17" x2="20.7" y2="7"/><polyline points="9.5 4 12 6 14.5 4"/><polyline points="9.5 20 12 18 14.5 20"/>',
  torrent: '<line x1="7" y1="20" x2="7" y2="4"/><polyline points="3 8 7 4 11 8"/><line x1="17" y1="4" x2="17" y2="20"/><polyline points="13 16 17 20 21 16"/>',
  close: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="4" x2="7" y2="20"/><line x1="17" y1="4" x2="17" y2="20"/><line x1="3" y1="12" x2="21" y2="12"/>',
  fullscreen: '<polyline points="4 9 4 4 9 4"/><polyline points="15 4 20 4 20 9"/><polyline points="20 15 20 20 15 20"/><polyline points="9 20 4 20 4 15"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  support: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  unsupport: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  ban: '<circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/>',
  unblock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1"/>',
  mute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/>',
  unmute: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
  layoutCards: '<rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/>',
  layoutList: '<circle cx="4.5" cy="6" r="1.5"/><circle cx="4.5" cy="12" r="1.5"/><circle cx="4.5" cy="18" r="1.5"/><line x1="9" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/>',
  layoutGrid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
};
const renderIcon = (name) => span({ class: 'btn-icon', [RAW_HTML]: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ACTION_ICONS[name] || ''}</svg>` });
const renderSearchButton = (label) => button({ type: "submit", class: "filter-box__button filter-box__button--icon", title: String(label || "") }, renderIcon("search"));
exports.renderSearchButton = renderSearchButton;
const renderHideIcon = () => renderIcon('hide');
exports.renderIcon = renderIcon;
exports.renderHideIcon = renderHideIcon;
const AVATAR_SIZE = 64;
const CARD_MENU_GLYPH = '\u22EF';
const SHARE_GLYPH = '\u2197';
const COMMENTS_GLYPH = '\u2711';
const renderContentActions = (msgId, viewHref, opts = {}) => {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const blockId = (typeof msgId === 'string' && msgId.startsWith('%')) ? msgId : null;
  const myId = (config.keys && config.keys.id) ? config.keys.id : '';
  const linkBtn = blockId && viewHref && o.share !== false ? renderLinkBox(blockId, viewHref, o.reportTitle) : null;

  const backTo = o.returnTo || hereAt(blockId);
  const pinBtn = o.favKind && blockId
    ? form({ method: 'POST', action: `/${o.favKind}/favorites/${o.isFavorite ? 'remove' : 'add'}/${encodeURIComponent(blockId)}`, class: 'content-action-form' },
        backTo ? input({ type: 'hidden', name: 'returnTo', value: backTo }) : null,
        button({ type: 'submit', class: o.isFavorite ? 'btn-singleview btn-pin-on' : 'btn-singleview', title: o.isFavorite ? i18n.favoriteRemove : i18n.favoriteAdd }, renderIcon('pin'))
      )
    : null;

  const spreadBtn = o.spread !== undefined && blockId && !(o.author && String(o.author) === String(myId)) ? renderSpreadButton(blockId, o.spread, o.spreadTitle || null, true, backTo) : null;

  const torrentBtn = (() => {
    const src = o.torrentFrom && typeof o.torrentFrom === 'object' ? o.torrentFrom : null;
    if (!src || typeof src.blobId !== 'string' || !src.blobId.startsWith('&')) return null;
    try { if (getConfig().modules.torrentsMod !== 'on') return null; } catch (_) { return null; }
    const name = String(src.name || o.reportTitle || '').slice(0, 100);
    return a({ href: `/torrents?filter=create&fromBlob=${encodeURIComponent(src.blobId)}&name=${encodeURIComponent(name)}`, class: 'btn-singleview btn-torrent', title: i18n.torrentFromContent }, renderIcon('torrent'));
  })();

  const chainBtn = blockId
    ? a({ href: `/blockexplorer/block/${encodeURIComponent(blockId)}`, class: 'btn-singleview', title: i18n.blockchainViewBlockexplorer }, renderIcon('block'))
    : null;

  const scope = listScope() || {};
  const herePath = scope.path;
  const onItself = (() => {
    try {
      if (!herePath) return false;
      const [path, query = ''] = String(viewHref || '').split('#')[0].split('?');
      if (decodeURIComponent(path) !== decodeURIComponent(String(herePath))) return false;
      return !query || query === String(scope.query || '');
    } catch (_) { return false; }
  })();
  const contentBtn = viewHref && !onItself && o.arrow !== false
    ? a({ href: viewHref, class: 'btn-singleview btn-content', title: i18n.visitContent }, renderIcon('open'))
    : null;

  const donateBtn = (() => {
    try { if (getConfig().modules.walletMod !== 'on') return null; } catch (_) { return null; }
    if (!o.author || String(o.author) === String(myId)) return null;
    const donatable = sharedState.getDonatableAuthors ? sharedState.getDonatableAuthors() : null;
    if (!donatable || !donatable.has(String(o.author))) return null;
    const ref = viewHref ? `?returnTo=${encodeURIComponent(viewHref)}` : '';
    return a({ href: `/wallet/donate/${encodeURIComponent(o.author)}${ref}`, class: 'btn-singleview btn-donate', title: i18n.donateTooltip }, renderIcon('donate'));
  })();

  const reportHref = blockId
    ? `/reports?filter=create&category=CONTENT&title=${encodeURIComponent(String(o.reportTitle || blockId).slice(0, 120))}&description=${encodeURIComponent(`${viewHref || blockId}`)}`
    : null;
  const reportBtn = o.report !== false && reportHref && !(o.author && String(o.author) === String(myId))
    ? a({ href: reportHref, class: 'btn-singleview btn-report', title: i18n.reportContent }, renderIcon('report'))
    : null;

  const pmBtn = o.contact === true && o.author && String(o.author) !== String(myId)
    ? a({ href: `/pm?recipients=${encodeURIComponent(o.author)}`, class: 'btn-singleview btn-pm', title: i18n.pmContentTooltip }, renderIcon('mail'))
    : null;
  const subscribersPmBtn = (() => {
    const s = o.subscription && typeof o.subscription === 'object' ? o.subscription : null;
    if (!s || !s.target) return null;
    const total = Number(s.count) || 0;
    const showPm = s.canWrite !== undefined ? s.canWrite : (s.isOwner || s.subscribed);
    return showPm && total
      ? a({ href: `/pm?list=${encodeURIComponent(s.target)}`, class: 'btn-singleview btn-pm', title: i18n.pmCreateButton || 'Write a PM' }, renderIcon('mail'))
      : null;
  })();
  const callBtn = o.contact === true && o.author && String(o.author) !== String(myId) && phoneOn() && !sharedState.isPubId(o.author)
    ? a({ href: `/phone?filter=create&to=${encodeURIComponent(o.author)}`, class: 'btn-singleview btn-call', title: i18n.phoneCallTooltip }, renderIcon('call'))
    : null;

  const editBtn = o.editAction
    ? a({ href: o.editAction, class: 'btn-singleview btn-delete btn-edit', title: i18n.editContent }, renderIcon('edit'))
    : null;

  const deleteBtn = o.deleteAction
    ? form({ method: 'POST', action: o.deleteAction, class: 'content-action-form' },
        o.returnTo && o.returnTo !== viewHref ? input({ type: 'hidden', name: 'returnTo', value: o.returnTo }) : null,
        button({ type: 'submit', class: 'btn-singleview btn-delete', title: i18n.chatDelete }, renderIcon('close'))
      )
    : null;

  const leaveBtn = o.leaveAction
    ? form({ method: 'POST', action: o.leaveAction, class: 'content-action-form' },
        o.returnTo ? input({ type: 'hidden', name: 'returnTo', value: o.returnTo }) : null,
        button({ type: 'submit', class: 'btn-singleview btn-delete btn-leave', title: i18n.leaveContent }, renderIcon('leave'))
      )
    : null;

  const hideBtn = blockId && o.hide !== false && !(o.author && String(o.author) === String(myId))
    ? form({ method: 'POST', action: `/hide/${encodeURIComponent(blockId)}`, class: 'content-action-form' },
        input({ type: 'hidden', name: 'returnTo', value: o.returnTo || viewHref || '/' }),
        viewHref ? input({ type: 'hidden', name: 'href', value: viewHref }) : null,
        o.reportTitle ? input({ type: 'hidden', name: 'label', value: String(o.reportTitle).slice(0, 120) }) : null,
        button({ type: 'submit', class: 'btn-singleview btn-hide', title: i18n.hideContent }, renderHideIcon())
      )
    : null;

  if (o.menu !== true) {
    if (!pinBtn && !spreadBtn && !chainBtn && !contentBtn && !reportBtn && !pmBtn && !subscribersPmBtn && !callBtn && !editBtn && !deleteBtn && !leaveBtn && !donateBtn && !torrentBtn && !hideBtn) return null;
    return div({ class: 'content-actions' }, editBtn, deleteBtn, leaveBtn, spreadBtn, pinBtn, reportBtn, hideBtn, donateBtn, pmBtn, subscribersPmBtn, callBtn, torrentBtn, linkBtn, chainBtn, contentBtn);
  }
  const commonItems = [pinBtn, reportBtn, hideBtn, donateBtn, pmBtn, subscribersPmBtn, callBtn, torrentBtn, linkBtn, chainBtn].flat().filter(Boolean);
  const dangerItems = [editBtn, deleteBtn, leaveBtn].filter(Boolean);
  const menuItems = [...commonItems, ...(dangerItems.length ? [commonItems.length ? div({ class: 'card-menu-sep' }) : null, ...dangerItems] : [])].filter(Boolean);
  if (!menuItems.length && !spreadBtn && !contentBtn) return null;
  return div({ class: 'content-actions' },
    spreadBtn,
    menuItems.length
      ? details({ class: 'card-menu' },
          summary({ class: 'btn-singleview card-menu-toggle', title: i18n.cardMenuTitle }, CARD_MENU_GLYPH),
          div({ class: 'card-menu-items' }, ...menuItems)
        )
      : null,
    contentBtn
  );
};
exports.renderContentActions = renderContentActions;

const avatarSrc = (feedId) => {
  const cached = config.public ? null : nameCache.image(feedId);
  return cached ? `/image/${AVATAR_SIZE}/${encodeURIComponent(cached)}?fallback=avatar` : `/avatar/${encodeURIComponent(feedId)}`;
};
const renderBylineAvatar = (author, name) => {
  const title = userLinkLabel(author, name);
  const image = (listScope() || {}).compactCards === 'grid' && !config.public ? nameCache.image(author) : null;
  if (typeof image === 'string' && /^&[A-Za-z0-9+/]{43}=\.sha256$/.test(image) && !/^&0+=\.sha256$/.test(image)) {
    const { renderZoomableImage } = require('./gallery_view');
    const nodes = renderZoomableImage(`/blob/${encodeURIComponent(image)}`, { linkClass: 'card-byline-avatar', thumb: avatarSrc(author) });
    nodes[0].setAttribute('title', title);
    return nodes;
  }
  return a({ href: `/author/${encodeURIComponent(author)}`, class: 'card-byline-avatar', title }, img({ src: avatarSrc(author), alt: '' }));
};
const MODULE_ROOTS = new Set(['activity', 'agenda', 'audios', 'blogs', 'bookmarks', 'calendars', 'campaigns', 'chats', 'courts', 'cv', 'documents', 'emergencies', 'events', 'feed', 'files', 'forum', 'housing', 'images', 'industry', 'inhabitants', 'jobs', 'larp', 'logistics', 'mailing', 'maps', 'market', 'pads', 'parliament', 'podcasts', 'polls', 'projects', 'reports', 'rooms', 'school', 'shops', 'tasks', 'torrents', 'transfers', 'tribes', 'videos', 'votes', 'wiki']);
const MODULE_ROOT_ALIASES = { tribe: 'tribes', author: 'inhabitants' };
const moduleHrefOf = (href) => {
  const seg = String(href || '').split(/[?#]/)[0].split('/')[1] || '';
  const root = MODULE_ROOT_ALIASES[seg] || seg;
  return MODULE_ROOTS.has(root) ? `/${root}` : null;
};
const renderCardByline = (opts = {}) => {
  const author = opts.bylineAuthor || opts.author ? String(opts.bylineAuthor || opts.author) : '';
  const when = opts.date ? moment(opts.date) : null;
  const time = when && when.isValid() ? span({ class: 'card-byline-time', title: when.format('YYYY/MM/DD HH:mm') }, when.fromNow()) : null;
  const linkModule = (n) => opts.moduleHref && n && n.chipRole === 'module' && String(n.nodeName || n.tagName || '').toLowerCase() !== 'a'
    ? asChip('module', a({ href: opts.moduleHref, class: 'pm-exposition-chip-link' }, n))
    : n;
  const chipNodes = [].concat(opts.chips || []).filter(Boolean);
  const extraChips = [].concat(opts.extraChips || []).filter(Boolean).map(linkModule);
  const isChipsRow = (n) => !!n && String(n.class || n.className || '').split(/\s+/).includes('card-chips-row');
  let chipsRow = null;
  if (chipNodes.length === 1 && isChipsRow(chipNodes[0]) && typeof chipNodes[0].appendChild === 'function') {
    chipsRow = chipNodes[0];
    const kids = Array.from(chipsRow.childNodes);
    for (const c of kids) chipsRow.removeChild(c);
    for (const c of sortChips(kids.map(linkModule).concat(extraChips))) chipsRow.appendChild(c);
  } else if (chipNodes.length || extraChips.length) {
    chipsRow = renderChipsRow(...chipNodes.map(linkModule), ...extraChips);
  }
  const lead = chipsRow && compactCards() ? Array.from(chipsRow.childNodes).filter((n) => ['module', 'scope'].includes(chipRoleOf(n))) : [];
  for (const c of lead) chipsRow.removeChild(c);
  const extra = [].concat(opts.bylineExtra || [], lead.length ? div({ class: 'card-chips-lead' }, ...lead) : null, chipsRow).filter(Boolean);
  if (!author && !time && !extra.length) return span();
  return div({ class: 'card-byline' },
    span({ class: 'card-byline-who' },
      author ? renderBylineAvatar(author, opts.authorName) : null,
      author ? userLink(author, opts.authorName) : null,
      time
    ),
    ...extra
  );
};
const relationSets = () => { const st = listScope(); return st && st.relationSets ? st.relationSets : null; };
const LAYOUT_TYPE_KEYS = { tribes: 'typeTribe', chats: 'typeChat', pads: 'typePad', rooms: 'typeRoom', calendars: 'typeCalendar', maps: 'typeMap', wiki: 'typeWiki', blogs: 'typePost', feed: 'typeFeed', audios: 'typeAudio', videos: 'typeVideo', images: 'typeImage', documents: 'typeDocument', bookmarks: 'typeBookmark', torrents: 'typeTorrent', files: 'typeFile', podcasts: 'typePodcast', market: 'typeMarket', shops: 'typeShop', jobs: 'typeJob', projects: 'typeProject', housing: 'typeHousing', transfers: 'typeTransfer', logistics: 'typeLogisticsRoute', industry: 'typeIndustry', campaigns: 'typeCampaign', events: 'typeEvent', tasks: 'typeTask', reports: 'typeReport', votes: 'typeVotes', polls: 'typePoll', emergencies: 'typeEmergency', forum: 'typeForum', mailing: 'typeMailingList', school: 'typeSchool' };
const layoutTypeChip = () => {
  if (!compactCards()) return null;
  const key = LAYOUT_TYPE_KEYS[String((listScope() || {}).path || '').split('/')[1]];
  return key && i18n[key] ? renderStateChip('whole', null, String(i18n[key]).toUpperCase(), 'module') : null;
};
const msgSizeFor = (id) => { const st = listScope(); return id && st && st.msgSizes instanceof Map ? st.msgSizes.get(String(id)) || 0 : 0; };
const renderCardTop = (msgId, viewHref, opts = {}) => {
  const o = (opts && typeof opts === 'object') ? opts : {};
  const rs = relationSets();
  const cardAuthor = typeof o.bylineAuthor === 'string' && o.bylineAuthor.startsWith('@') ? o.bylineAuthor : o.author;
  const supportedChip = renderSupportedChip(cardAuthor, rs && rs.following);
  const replicating = (o.spread && o.spread.alreadySpread === true) || o.replicated === true || !!(rs && rs.replicated && typeof msgId === 'string' && rs.replicated.has(msgId));
  const spreadingChip = replicating ? renderStateChip('transport', '⟳', String(i18n.spreadingChip || '').toUpperCase(), 'relation') : null;
  const givenChips = [].concat(o.chips || []).flatMap((n) => (n && n.childNodes && String(n.class || n.className || '').split(/\s+/).includes('card-chips-row') ? Array.from(n.childNodes) : [n]));
  const ecoChip = givenChips.some((n) => chipRoleOf(n) === 'eco') ? null : renderEcoTax(msgSizeFor(msgId) || o.msgSize, msgId);
  const typeChip = givenChips.concat(o.extraChips || []).some((n) => chipRoleOf(n) === 'module') ? null : layoutTypeChip();
  const anchor = anchorFor(msgId);
  return div({ class: 'card-header activity-card-header card-top', ...(anchor ? { id: anchor } : {}) },
    renderCardByline({ ...o, moduleHref: moduleHrefOf(viewHref), extraChips: [].concat(typeChip, o.extraChips || [], ecoChip, supportedChip, spreadingChip).filter(Boolean) }),
    renderContentActions(msgId, viewHref, { ...o, share: false, menu: true })
  );
};
const COMMENTABLE_HREF_RE = /^\/(?:(?:audios|videos|images|documents|bookmarks|files|torrents|blogs|feed|wiki|events|tasks|votes|polls|projects|reports|emergencies|maps|transfers|jobs|housing|campaigns|logistics|market|podcasts)\/[^/?#]+|(?:shops\/product|industry\/blueprint|school\/course|podcasts\/episode)\/[^/?#]+)(?:[?#]|$)/;
const commentCountFor = (ids) => {
  const counts = (listScope() || {}).commentCounts;
  if (!(counts instanceof Map)) return 0;
  for (const id of [].concat(ids)) { const hit = id ? counts.get(String(id)) : null; if (hit) return hit.count; }
  return 0;
};
const renderCommentsPill = (id, viewHref) => {
  const href = String(viewHref || '');
  if (!id || !COMMENTABLE_HREF_RE.test(href)) return null;
  const scope = listScope() || {};
  try { if (scope.path && decodeURIComponent(href.split(/[?#]/)[0]) === decodeURIComponent(String(scope.path))) return null; } catch (_) {}
  const counts = scope.commentCounts instanceof Map ? scope.commentCounts : null;
  const total = counts ? [...new Set([].concat(id).filter(Boolean).map(String))].reduce((n, k) => n + ((counts.get(k) || {}).count || 0), 0) : 0;
  return a({ href: commentsOpenHref(href.split('#')[0], total), class: total ? 'comments-summary engage-on comments-link' : 'comments-summary comments-link', title: i18n.commentsGoToLast || i18n.voteNewCommentLabel || 'Comments' },
    span({ class: 'comments-summary-icon' }, COMMENTS_GLYPH),
    counts ? span({ class: 'comments-summary-count' }, `(${total})`) : null
  );
};
const OPINION_ROUTE_BASES = [
  [/^\/(?:shops\/product|industry\/blueprint)\/[^/?#]+(?:[?#]|$)/, (m) => `${m[0].replace(/\/[^/?#]+(?:[?#].*)?$/, '')}/opinions`],
  [/^\/(?:school\/course|podcasts\/episode)\/[^/?#]+(?:[?#]|$)/, (m) => (m[0].startsWith('/school') ? '/school/opinions' : '/podcasts/opinions')],
  [/^\/(audios|videos|images|documents|bookmarks|files|torrents|blogs|feed|wiki|events|tasks|votes|polls|projects|reports|transfers|jobs|housing|campaigns|logistics|market|maps|industry|podcasts)\/[^/?#]+(?:[?#]|$)/, (m) => `/${m[1]}/opinions`]
];
const opinionsBaseFor = (href) => {
  for (const [re, base] of OPINION_ROUTE_BASES) { const m = href.match(re); if (m) return base(m); }
  return null;
};
const renderOpinionsPill = (ids, viewHref) => {
  const href = String(viewHref || '').split('#')[0];
  const list = [...new Set([].concat(ids).filter(Boolean).map(String))];
  const base = list.length ? opinionsBaseFor(href) : null;
  if (!base) return null;
  const scope = listScope() || {};
  try { if (scope.path && decodeURIComponent(href.split('?')[0]) === decodeURIComponent(String(scope.path))) return null; } catch (_) {}
  const tallies = scope.opinionTallies instanceof Map ? scope.opinionTallies : null;
  const merged = { opinions: {}, opinions_inhabitants: [] };
  for (const id of list) {
    const t = tallies ? tallies.get(id) : null;
    if (!t) continue;
    for (const [k, v] of Object.entries(t.opinions || {})) merged.opinions[k] = (merged.opinions[k] || 0) + (Number(v) || 0);
    for (const who of t.opinions_inhabitants || []) if (!merged.opinions_inhabitants.includes(who)) merged.opinions_inhabitants.push(who);
  }
  const here = scope.path ? `${scope.path}${scope.query ? `?${scope.query}` : ''}` : null;
  return renderOpinionsVoting(base, list[0], merged.opinions, here, merged.opinions_inhabitants);
};
const renderShareButton = (blockId, viewHref, title) => {
  if (typeof blockId !== 'string' || !blockId.startsWith('%') || !viewHref) return null;
  return span({ class: 'card-share' }, ...renderLinkBox(blockId, viewHref, title, {
    class: 'share-summary-link',
    content: [span({ class: 'share-summary-icon' }, SHARE_GLYPH), span({ class: 'share-summary-label' }, i18n.shareContent)]
  }));
};
exports.renderCardByline = renderCardByline;
exports.renderCardTop = renderCardTop;
exports.renderShareButton = renderShareButton;
const renderDetailShare = (blockId, viewHref, title, subscription = null, lead = null, tail = null, author = null) => {
  const share = renderShareButton(blockId, viewHref, title);
  const subNodes = subscription ? renderSubscriptionBox({ ...subscription, inline: true }) : null;
  const sub = Array.isArray(subNodes) && subNodes.length ? span({ class: 'detail-share-sub' }, ...subNodes) : null;
  const tailNodes = [].concat(tail || []).filter(Boolean);
  const tailNode = tailNodes.length ? span({ class: 'detail-share-tail' }, ...tailNodes) : null;
  const support = author ? renderSupportButton(author, null, hereAt(blockId)) : null;
  return share || sub || lead || tailNode ? div({ class: 'detail-share' }, lead, share, sub, tailNode, support) : null;
};
exports.renderDetailShare = renderDetailShare;
const renderScheduledChip = (publishAt) => publishAt
  ? span({ class: 'pm-exposition-chip pm-exposition-scheduled', title: i18n.scheduledLabel },
      span({ class: 'pm-exposition-icon' }, renderIcon('clock')),
      span({ class: 'pm-exposition-text' }, moment(publishAt).format('YYYY/MM/DD HH:mm')))
  : null;
exports.renderScheduledChip = renderScheduledChip;
exports.renderCommentsPill = renderCommentsPill;
exports.commentCountFor = commentCountFor;
exports.renderOpinionsPill = renderOpinionsPill;
const CONTENT_FAV_KIND = {
  image: 'images', audio: 'audios', video: 'videos', document: 'documents',
  bookmark: 'bookmarks', torrent: 'torrents', file: 'files', event: 'events', task: 'tasks',
  report: 'reports', votes: 'votes', poll: 'polls', market: 'market',
  housing: 'housing', job: 'jobs', project: 'projects', shop: 'shops', shopProduct: 'shopProducts',
  chat: 'chats', chatThread: 'chats', pad: 'pads', room: 'rooms', calendar: 'calendars',
  map: 'maps', forum: 'forum', transfer: 'transfers', post: 'blogs', schoolCourse: 'school',
  wikiPage: 'wiki', emergency: 'emergencies', mailingList: 'mailing', logisticsRoute: 'logistics',
  podcast: 'podcasts', podcastEpisode: 'podcasts', campaign: 'campaigns'
};
const CONTENT_SPREADABLE = new Set([
  'post', 'audio', 'video', 'image', 'document', 'torrent', 'file', 'bookmark',
  'event', 'calendar', 'task', 'votes', 'vote', 'market', 'shop', 'shopProduct',
  'project', 'transfer', 'housing', 'job', 'report', 'industry', 'industryBuild', 'industryBlueprint',
  'chat', 'chatMessage', 'pad', 'padEntry', 'room', 'wikiPage', 'emergency', 'mailingList', 'logisticsRoute', 'podcast', 'podcastEpisode', 'campaign', 'forum', 'map', 'poll', 'blog', 'schoolCourse', 'feed'
]);
const CONTENT_TORRENTABLE = new Set(['audio', 'video', 'image', 'document', 'file']);
const CONTENT_DELETE_ROUTE = {
  audio: 'audios', video: 'videos', image: 'images', document: 'documents', bookmark: 'bookmarks',
  torrent: 'torrents', file: 'files', event: 'events', task: 'tasks', report: 'reports', votes: 'votes',
  poll: 'polls', market: 'market', housing: 'housing', job: 'jobs', project: 'projects', shop: 'shops',
  shopProduct: 'shops/product', chat: 'chats', pad: 'pads', room: 'rooms', calendar: 'calendars', map: 'maps', mapMarker: 'maps/marker',
  forum: 'forum', transfer: 'transfers', emergency: 'emergencies', mailingList: 'mailing',
  logisticsRoute: 'logistics', podcast: 'podcasts', podcastEpisode: 'podcasts/episode', campaign: 'campaigns',
  feed: 'feed', schoolCourse: 'school', tribe: 'tribes', blog: 'blogs'
};
const contentDeleteAction = (type, id) => CONTENT_DELETE_ROUTE[type] && id ? `/${CONTENT_DELETE_ROUTE[type]}/delete/${encodeURIComponent(id)}` : undefined;
exports.CONTENT_FAV_KIND = CONTENT_FAV_KIND;
exports.FAV_KIND_TYPE = Object.entries(CONTENT_FAV_KIND).reduce((acc, [type, kind]) => (acc[kind] ? acc : { ...acc, [kind]: type }), {});
exports.CONTENT_SPREADABLE = CONTENT_SPREADABLE;
exports.CONTENT_TORRENTABLE = CONTENT_TORRENTABLE;
exports.contentDeleteAction = contentDeleteAction;
exports.THEMES = [['Dark-SNH', 'Dark-SNH'], ['Clear-SNH', 'Clear-SNH'], ['Purple-SNH', 'Purple-SNH'], ['Matrix-SNH', 'Matrix-SNH'], ['OasisMobile', 'Oasis-Mobile']];
exports.WIZARD_THEMES = exports.THEMES.filter(([value]) => value !== 'OasisMobile');

const renderDocumentActions = (kind, id, leadingNodes = []) => {
  const base = id ? `/${kind}/${encodeURIComponent(id)}` : `/${kind}`;
  return div({ class: 'doc-export-actions' },
    ...leadingNodes,
    form({ method: 'GET', action: `${base}/pdf` },
      button({ type: 'submit', class: 'filter-btn' }, i18n.generatePdf)
    ),
    form({ method: 'POST', action: `${base}/share` },
      button({ type: 'submit', class: 'filter-btn' }, i18n.sharePm)
    )
  );
};
exports.renderDocumentActions = renderDocumentActions;

const renderAiAgentField = (name, checked = false) =>
  label({ class: 'ai-agent-field' },
    input({ type: 'checkbox', name, value: '1', ...(checked ? { checked: true } : {}) }),
    ` ${i18n.aiAgentFieldLabel}`
  );
exports.renderAiAgentField = renderAiAgentField;
const renderAiBotChip = (prefs) => (prefs && prefs.aiAgent === true ? span({ class: 'status ai-bot' }, i18n.aiBotChip) : null);
exports.renderAiBotChip = renderAiBotChip;

const feedStatusPath = () => require('path').join(require('../server/ssb_config').path, 'oasis', 'content', 'feed-repairs', 'status.json');
const readFeedStatus = () => {
  try {
    const st = JSON.parse(require('fs').readFileSync(feedStatusPath(), 'utf8'));
    return st && typeof st === 'object' && !st.seen ? st : null;
  } catch (_) { return null; }
};
exports.readFeedStatus = readFeedStatus;
const renderFeedBanner = (status) => {
  if (!status || status.seen || status.kind !== 'conflict') return null;
  return div({ class: 'update-banner feed-banner feed-banner-warn' },
    span({ class: 'update-banner-icon' }, '⚠'),
    span({ class: 'update-banner-text' }, i18n.feedConflictBanner),
    form({ method: 'POST', action: '/feed-status/seen', class: 'feed-banner-form' },
      input({ type: 'hidden', name: 'at', value: String(status.at || '') }),
      button({ type: 'submit', class: 'feed-banner-dismiss' }, i18n.feedBannerDismiss)
    )
  );
};
exports.renderFeedBanner = renderFeedBanner;

const renderRelationshipBlock = (relationship, feedId) => {
  const rel = relationship || {};
  if (rel.me) return span({ class: 'status you' }, i18n.relationshipYou);
  const muted = (() => { try { return require('../models/viewer_filters').isMuted(feedId); } catch (_) { return false; } })();
  const actions = [];
  const icons = { follow: 'support', unfollow: 'unsupport', block: 'ban', unblock: 'unblock', mute: 'mute', unmute: 'unmute' };
  const addAction = (action) => actions.push(
    form({ action: `/${action}/${encodeURIComponent(feedId)}`, method: 'post' },
      button({ type: 'submit', class: 'filter-btn relationship-btn' }, renderIcon(icons[action]), i18n[action])
    )
  );
  if (rel.following) addAction('unfollow');
  else if (rel.blocking) addAction('unblock');
  else addAction('follow');
  if (!rel.blocking) addAction(muted ? 'unmute' : 'mute');
  if (!rel.following && !rel.blocking) addAction('block');
  return div({ class: 'relationship-status' },
    muted ? span({ class: 'status blocked' }, i18n.relationshipMuted) : null,
    rel.blocking && rel.blockedBy
      ? span({ class: 'status blocked' }, i18n.relationshipMutualBlock)
      : [
          rel.blocking ? span({ class: 'status blocked' }, i18n.relationshipBlocking) : null,
          rel.blockedBy ? span({ class: 'status blocked-by' }, i18n.relationshipBlockedBy) : null,
          rel.following && rel.followsMe
            ? span({ class: 'status mutual' }, i18n.relationshipMutuals)
            : [
                span({ class: 'status supporting' }, rel.following ? i18n.relationshipFollowing : i18n.relationshipNone),
                span({ class: 'status supported-by' }, rel.followsMe ? i18n.relationshipTheyFollow : i18n.relationshipNotFollowing)
              ]
        ],
    actions.length ? div({ class: 'relationship-actions' }, ...actions) : null
  );
};
exports.renderRelationshipBlock = renderRelationshipBlock;

exports.renderStateChip = renderStateChip;
exports.renderOpenClosedChip = renderOpenClosedChip;
exports.renderVisibilityChip = renderVisibilityChip;
exports.renderModeChip = renderModeChip;
exports.renderLifespanChip = renderLifespanChip;

const carbonGramsOf = (bytes) => ((Number(bytes) || 0) / (1024 * 1024)) * 0.095;

const formatCarbon = (bytes) => {
  const n = Number(bytes) || 0;
  if (!n) return '0 µg CO₂';
  const grams = carbonGramsOf(n);
  if (grams >= 1) return `${grams.toFixed(2)} g CO₂`;
  const mg = grams * 1000;
  if (mg >= 1) return `${mg.toFixed(2)} mg CO₂`;
  const ug = mg * 1000;
  return `${ug.toFixed(2)} µg CO₂`;
};

const renderEcoTax = (sizeBytes, blockId) => {
  const n = Number(sizeBytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  const label = (i18n && i18n.ecoTaxLabel) ? i18n.ecoTaxLabel : 'ECO Tax';
  const href = blockId
    ? `/blockexplorer?inspect=${encodeURIComponent(blockId)}#inspect`
    : '/blockexplorer#inspect';
  const ratio = n / ((config.blobs && Number(config.blobs.max)) || 75 * 1024 * 1024);
  const band = ratio >= 0.66 ? 'high' : ratio >= 0.33 ? 'mid' : 'low';
  const title = `${label} · ${formatCarbon(n)}`;
  return asChip('eco', a({ href, class: `eco-tax-chip eco-tax-chip-${band}`, title },
    span({ class: 'eco-tax-chip-value' }, formatCarbon(sizeBytes))
  ));
};

exports.formatCarbon = formatCarbon;
exports.renderEcoTax = renderEcoTax;

const renderEcoValueChip = () => {
  const v = Number(sharedState.getEcoValue ? sharedState.getEcoValue() : NaN);
  if (!Number.isFinite(v) || v <= 0) return null;
  const title = (i18n && i18n.bankExchangeCurrentValue) ? i18n.bankExchangeCurrentValue : 'ECOin Value (1h)';
  return a({ href: '/banking?filter=exchange', class: 'eco-tax-chip eco-tax-chip-mid eco-value-chip', title },
    span({ class: 'eco-tax-chip-label' }, 'ECO/h: '),
    span({ class: 'eco-tax-chip-value' }, v.toFixed(4))
  );
};
exports.renderEcoValueChip = renderEcoValueChip;

const renderMobileCounters = () => {
  try {
    const theme = (getConfig().themes || {}).current;
    if (theme !== 'OasisMobile' && process.env.OASIS_MOBILE !== '1') return null;
  } catch (_) { return null; }
  const inbox = Number(sharedState.getInboxCount()) || 0;
  const mentions = Number(sharedState.getMentionsCount()) || 0;
  const phone = phoneOn() ? (Number(sharedState.getPhoneCount()) || 0) : 0;
  if (inbox <= 0 && mentions <= 0 && phone <= 0) return null;
  return div({ class: 'mobile-counters' },
    inbox > 0 ? a({ href: '/inbox?filter=unread', class: 'mobile-counter', title: i18n.inbox }, '☂ ', String(inbox)) : null,
    phone > 0 ? a({ href: '/phone', class: 'mobile-counter', title: i18n.phoneTitle }, '✆ ', String(phone)) : null,
    mentions > 0 ? a({ href: '/mentions', class: 'mobile-counter', title: i18n.mentions }, '✺ ', String(mentions)) : null
  );
};

const LIST_PAGE_SIZE = 50;
const LIST_PAGE_SIZES = ['10', '50', '100', 'all'];
const listScope = () => { try { return require('../models/typed_log').requestScope.getStore() || null; } catch (_) { return null; } };
const anchorFor = (id) => (typeof id === 'string' && id) ? `c-${id.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}` : null;
const herePath = () => {
  const st = listScope();
  if (!st || typeof st.path !== 'string' || (st.method && st.method !== 'GET')) return null;
  return `${st.path}${st.query ? `?${st.query}` : ''}`;
};
const hereAt = (id) => {
  const base = herePath();
  if (!base) return null;
  const anchor = anchorFor(id);
  return anchor ? `${base}#${anchor}` : base;
};
exports.anchorFor = anchorFor;
exports.hereAt = hereAt;
exports.herePath = herePath;
const escapeFormAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeFormText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SKIP_INPUT_TYPES = new Set(['checkbox', 'radio', 'file', 'hidden', 'submit', 'button', 'password', 'image', 'reset']);
const restoreFormFields = (html, fields) => {
  let out = String(html || '');
  for (const [name, value] of Object.entries(fields || {})) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.:\-\[\]]{1,64}$/.test(name)) continue;
    const nameRe = escapeRe(name);
    const textarea = new RegExp(`(<textarea\\b[^>]*\\sname="${nameRe}"[^>]*>)([\\s\\S]*?)(</textarea>)`, 'i');
    if (textarea.test(out)) { out = out.replace(textarea, (m, open, inner, close) => `${open}${escapeFormText(value)}${close}`); continue; }
    const input = out.match(new RegExp(`<input\\b[^>]*\\sname="${nameRe}"[^>]*>`, 'i'));
    if (input) {
      const tag = input[0];
      const type = (tag.match(/\stype="([^"]*)"/i) || [null, 'text'])[1].toLowerCase();
      if (SKIP_INPUT_TYPES.has(type)) continue;
      const attr = ` value="${escapeFormAttr(value)}"`;
      const filled = /\svalue="[^"]*"/i.test(tag) ? tag.replace(/\svalue="[^"]*"/i, () => attr) : tag.replace(/\s*\/?>$/, (end) => `${attr}${end.trim()}`);
      out = out.replace(tag, () => filled);
      continue;
    }
    const select = out.match(new RegExp(`(<select\\b[^>]*\\sname="${nameRe}"[^>]*>)([\\s\\S]*?)(</select>)`, 'i'));
    if (select) {
      const option = new RegExp(`(<option\\b[^>]*\\svalue="${escapeRe(escapeFormAttr(value))}"[^>]*)>`, 'i');
      const inner = select[2].replace(/\sselected(="[^"]*")?/gi, '').replace(option, '$1 selected>');
      out = out.replace(select[0], () => `${select[1]}${inner}${select[3]}`);
    }
  }
  return out;
};
exports.restoreFormFields = restoreFormFields;
const listPerPage = (query) => {
  const v = String(new URLSearchParams(String(query || '')).get('perPage') || '').toLowerCase();
  return LIST_PAGE_SIZES.includes(v) ? v : String(LIST_PAGE_SIZE);
};
const slicePage = (list, page, per) => {
  const all = Array.isArray(list) ? list : [];
  const size = per === 'all' ? Math.max(1, all.length) : Number(per) || LIST_PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(all.length / size));
  const current = Math.min(pages, Math.max(1, parseInt(page, 10) || 1));
  return { items: all.slice((current - 1) * size, current * size), page: current, pages, total: all.length, per: String(per) };
};
const showPageSizes = (total, query) => total > Number(LIST_PAGE_SIZES[0]) && (total > LIST_PAGE_SIZE || new URLSearchParams(String(query || '')).has('perPage'));
const pageSizeLabel = (s) => s === 'all' ? String(i18n.all || 'All').toUpperCase() : s;
exports.LIST_PAGE_SIZE = LIST_PAGE_SIZE;
exports.LIST_PAGE_SIZES = LIST_PAGE_SIZES;
exports.listPerPage = listPerPage;
exports.slicePage = slicePage;
exports.showPageSizes = showPageSizes;
exports.pageSizeLabel = pageSizeLabel;
const paged = (list) => {
  const store = listScope();
  const query = store ? store.query : '';
  const { items, ...pager } = slicePage(list, new URLSearchParams(String(query || '')).get('page'), listPerPage(query));
  if (store) { store.pager = pager; store.pageItems = items; }
  return items;
};
exports.paged = paged;
exports.currentPerPage = () => { const store = listScope(); return listPerPage(store ? store.query : ''); };
const renderListPager = () => {
  const store = listScope();
  const pg = store && store.pager;
  if (!pg) return null;
  const sizes = showPageSizes(pg.total, store.query);
  if (!(pg.pages > 1) && !sizes) return null;
  const href = (n, per) => {
    const q = new URLSearchParams(String(store.query || ''));
    for (const k of ['page', 'error', 'errsig']) q.delete(k);
    if (per) q.set('perPage', per);
    if (n > 1) q.set('page', String(n));
    const s = q.toString();
    return s ? `${store.path}?${s}` : store.path;
  };
  return nav({ class: 'oasis-pager' },
    sizes ? span({ class: 'oasis-pager-sizes' },
      span({ class: 'oasis-pager-info' }, i18n.searchPerPageLabel || 'Results per page'),
      ...LIST_PAGE_SIZES.map(s => a({ href: href(1, s), class: s === pg.per ? 'oasis-pager-btn active' : 'oasis-pager-btn' }, pageSizeLabel(s)))
    ) : null,
    pg.pages > 1 ? span({ class: 'oasis-pager-info' }, String(i18n.cnPageOf || 'Page {page} of {pages}').replace('{page}', String(pg.page)).replace('{pages}', String(pg.pages))) : null,
    pg.page > 1 ? a({ href: href(pg.page - 1), class: 'oasis-pager-btn' }, i18n.cnPrevPage || '← Previous') : null,
    pg.page < pg.pages ? a({ href: href(pg.page + 1), class: 'oasis-pager-btn' }, i18n.cnNextPage || 'Next →') : null
  );
};

const renderLogWindowNote = () => {
  let store = null;
  try { store = require('../models/typed_log').requestScope.getStore(); } catch (_) { store = null; }
  if (!store || !store.capped || !(store.limit > 0)) return null;
  return div({ class: 'log-window-note' },
    a({ href: '/settings#logstream', class: 'eco-tax-chip eco-tax-chip-low log-window-chip', title: i18n.ssbLogStreamDescription },
      span({ class: 'eco-tax-chip-value' }, String(i18n.logWindowChip).replace('{n}', String(store.limit)))
    )
  );
};

const errorView = ({ title, message, backHref }) => {
  const heading = title || i18n.errorPageTitle || 'Error';
  return exports.template(
    heading,
    section(
      div({ class: 'tags-header' },
        message ? p({ class: 'error-page-message' }, String(message)) : null,
        div({ class: 'error-page-actions' },
          a({ href: backHref || '/', class: 'filter-btn' }, i18n.goBack || 'Go back')
        )
      )
    )
  );
};
exports.errorView = errorView;

const keepTextView = ({ title, action, fields = [], hidden = [], enctype = null, backHref = null }) => {
  const formAttrs = { method: 'POST', action };
  if (enctype) formAttrs.enctype = enctype;
  return exports.template(
    title || i18n.errorPageTitle || 'Error',
    section(
      div({ class: 'tags-header' },
        h2(title || ''),
        form(formAttrs,
          ...hidden.map(h => input({ type: 'hidden', name: h.name, value: String(h.value == null ? '' : h.value) })),
          ...fields.map(f => {
            const attrs = { name: f.name, id: f.name };
            if (f.maxlength) attrs.maxlength = String(f.maxlength);
            if (f.required) attrs.required = true;
            const value = String(f.value == null ? '' : f.value);
            const control = f.type === 'textarea'
              ? textarea({ ...attrs, rows: f.rows || 10 }, value)
              : input({ ...attrs, type: 'text', value });
            return [label({ for: f.name }, f.label || f.name), br(), control, br(), br()];
          }).flat(),
          button({ type: 'submit', class: 'create-button' }, i18n.keepTextRetry),
          ' ',
          backHref ? a({ href: backHref, class: 'filter-btn' }, i18n.goBack || 'Go back') : null
        )
      )
    )
  );
};
exports.keepTextView = keepTextView;

const confirmView = ({ title, message, action, hidden = [], backHref = null }) => exports.template(
  title || i18n.confirmActionTitle,
  section(
    div({ class: 'tags-header' },
      h2(title || i18n.confirmActionTitle),
      message ? p({ class: 'error-page-message' }, String(message)) : null,
      form({ method: 'POST', action, class: 'confirm-actions' },
        ...hidden.map(h => input({ type: 'hidden', name: h.name, value: String(h.value == null ? '' : h.value) })),
        button({ type: 'submit', class: 'create-button' }, i18n.confirmActionButton),
        ' ',
        a({ href: backHref || '/', class: 'filter-btn' }, i18n.goBack || 'Go back')
      )
    )
  )
);
exports.confirmView = confirmView;

exports.renderInlineError = (message, dismissHref) => section({ class: 'inline-error' },
  div({ class: 'tags-header inline-error-box' },
    p({ class: 'error-page-message' }, String(message || '')),
    dismissHref ? a({ href: dismissHref, class: 'inline-error-dismiss' }, i18n.errorDismiss || 'OK') : null
  )
).outerHTML;

const renderVotesSummary = (opinions = {}) => {
  const entries = Object.entries(opinions).filter(([, v]) => Number(v) > 0);
  if (!entries.length) return null;
  entries.sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0])));
  return div(
    { class: "votes feed-votes-summary" },
    entries.map(([category, count]) => {
      const label = i18n['vote' + category.charAt(0).toUpperCase() + category.slice(1)] || category;
      return span({ class: "vote-category" }, `${label} ${count}`);
    })
  );
};
exports.renderVotesSummary = renderVotesSummary;

const renderSpreadButton = (msgKey, opts, title = null, showCount = true, returnTo = null) => {
  if (!msgKey || typeof msgKey !== 'string' || !msgKey.startsWith('%') || !/\.sha256$/.test(msgKey)) return null;
  const o = (opts && typeof opts === 'object') ? opts : {};
  const voters = Array.isArray(o.voters) ? o.voters : [];
  const count = typeof o.count === 'number' ? o.count : voters.length;
  const alreadySpread = o.alreadySpread === true;
  return form(
    { method: 'POST', action: `/spread/${encodeURIComponent(msgKey)}`, class: 'spread-form' },
    returnTo ? input({ type: 'hidden', name: 'returnTo', value: returnTo }) : null,
    button(
      { type: 'submit', class: alreadySpread ? 'btn-singleview btn-spread-on' : 'btn-singleview', title: title || i18n.spreadContent },
      renderIcon('spread'), showCount ? span({ class: 'btn-count' }, String(count)) : null
    )
  );
};
exports.renderSpreadButton = renderSpreadButton;

const aiNavResultsView = ({ query, results }) => {
  const title = i18n.aiNavResultsTitle || 'AI navigation results';
  const safeQuery = String(query || '').trim();
  const safeResults = Array.isArray(results) ? results : [];
  const fmtScore = (s) => {
    const n = Number(s);
    return Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—';
  };
  const routeLabel = (p) => {
    const [base, qs] = String(p || '').split('?');
    let label = decodeURIComponent(base).replace(/^\//, '').replace(/\//g, ' · ');
    try {
      const filter = new URLSearchParams(qs || '').get('filter');
      if (filter) label += ` · ${filter}`;
    } catch (_) {}
    return label.toUpperCase();
  };
  const splitTerms = (desc) => String(desc || '')
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(Boolean);
  return exports.template(
    title,
    section(
      div({ class: 'tags-header' },
        h2(title),
        safeQuery ? p({ class: 'ai-nav-query' }, `${i18n.aiNavQueryLabel || 'Query'}: "${safeQuery}"`) : null
      ),
      safeResults.length
        ? div({ class: 'ai-nav-results' },
            safeResults.map(r => div({ class: 'ai-nav-result-card card-section' },
              div({ class: 'card-field' },
                span({ class: 'card-label' }, `${(i18n.aiNavResultMatch || 'Match').toUpperCase()}: ${fmtScore(r.score)}`),
                span({ class: 'card-value' }, a({ href: r.path, class: 'filter-btn' }, routeLabel(r.path)))
              )
            ))
          )
        : p(i18n.aiNavResultsEmpty || 'No matching routes. Try /search instead.')
    )
  );
};
exports.aiNavResultsView = aiNavResultsView;

const i18nBase = require("../client/assets/translations/i18n");
let selectedLanguage = "en";
let i18n = {};
Object.assign(i18n, i18nBase[selectedLanguage]);
exports.getLanguage = () => (i18nBase[selectedLanguage] ? selectedLanguage : 'en');
exports.setLanguage = (language) => {
  if (language === selectedLanguage) return;
  selectedLanguage = language;
  const newLang = i18nBase[selectedLanguage] || i18nBase['en'];
  Object.keys(i18n).forEach(k => delete i18n[k]);
  Object.assign(i18n, newLang);
  const momentLocale = moment.locale(selectedLanguage === 'zh' ? 'zh-cn' : (i18nBase[selectedLanguage] ? selectedLanguage : 'en'));
  if (moment.localeData(momentLocale).postformat('1') !== '1') moment.updateLocale(momentLocale, { preparse: (str) => str, postformat: (str) => str });
};
exports.i18n = i18n;
Object.defineProperty(exports, 'selectedLanguage', { get: () => selectedLanguage });

const opinionCategoriesList = require('../backend/opinion_categories');
const renderEngagement = (id, opinionsNode, commentsNode, share = null) => {
  const autoOpinions = !opinionsNode && share && share.opinions !== false ? renderOpinionsPill([id, share.rootId], share.href) : null;
  const autoComments = !commentsNode && share && share.comments !== false ? renderCommentsPill(id, share.href) : null;
  const parts = [opinionsNode || autoOpinions, commentsNode || autoComments, share ? renderShareButton(id, share.href, share.title) : null, share && share.author ? renderSupportButton(share.author, null, hereAt(id)) : null].filter(Boolean);
  if (!parts.length) return null;
  return div({ class: 'card-engage' }, ...parts);
};
exports.renderEngagement = renderEngagement;

const renderModuleStats = (total, segments = [], totalLabel = null, opts = {}) => {
  if (!(Number(total) > 0)) return null;
  const inh = opts.showInhabitants && sharedState.getInhabitantCount ? sharedState.getInhabitantCount() : 0;
  const trb = opts.showTribes && sharedState.getTribesCount ? sharedState.getTribesCount() : 0;
  const network = [
    inh > 0 ? { label: i18n.inhabitants, count: inh } : null,
    trb > 0 ? { label: i18n.tribesTitle, count: trb } : null
  ];
  const toNode = s => {
    const inner = [s.labelClass ? span({ class: s.labelClass }, `${s.label}: `) : `${s.label}: `, strong(String(s.count))];
    return s.href ? a({ href: s.href, class: s.active ? 'module-stat-link active' : 'module-stat-link' }, ...inner) : span(...inner);
  };
  return div({ class: 'module-stats-line' },
    ...network.filter(Boolean).map(toNode),
    toNode({ label: totalLabel || i18n.statsTotalLabel, count: total, href: opts.totalHref || null, active: opts.totalActive === true }),
    ...segments.filter(s => s && Number(s.count) > 0).map(toNode)
  );
};
exports.renderModuleStats = renderModuleStats;

const renderModuleStatsBy = (items, field, specs, totalLabel = null) => {
  const arr = Array.isArray(items) ? items : [];
  const counts = {};
  for (const it of arr) { const v = typeof field === 'function' ? field(it) : (it && it[field]); counts[v] = (counts[v] || 0) + 1; }
  return renderModuleStats(arr.length, specs.map(s => ({ label: s.label, count: counts[s.value] || 0 })), totalLabel);
};
exports.renderModuleStatsBy = renderModuleStatsBy;

const moduleIsEmpty = (items, filter, defaultFilter = 'all', q = '') =>
  (!items || items.length === 0) &&
  String(filter || defaultFilter).toUpperCase() === String(defaultFilter).toUpperCase() &&
  !String(q || '').trim();
exports.moduleIsEmpty = moduleIsEmpty;

const supportableAuthor = (author) => {
  const me = (config.keys && config.keys.id) ? config.keys.id : '';
  if (typeof author !== 'string' || !author.startsWith('@') || author === me) return false;
  return !(sharedState.isPubId && sharedState.isPubId(author));
};
const renderSupportButton = (author, following, returnTo = null) => {
  if (!supportableAuthor(author)) return null;
  const backTo = returnTo || herePath();
  const known = following instanceof Set ? following : (relationSets() && relationSets().following);
  if (known instanceof Set && known.has(author)) return null;
  return form({ method: 'POST', action: `/follow/${encodeURIComponent(author)}`, class: 'support-form' },
    backTo ? input({ type: 'hidden', name: 'returnTo', value: backTo }) : null,
    button({ type: 'submit', class: 'support-pill', title: i18n.follow },
      span({ class: 'support-pill-icon' }, '\u2665\uFE0E'),
      span({ class: 'support-pill-label' }, i18n.follow)
    )
  );
};
const renderSupportedChip = (author, following) =>
  supportableAuthor(author) && following instanceof Set && following.has(author)
    ? renderStateChip('transport', '♥', String(i18n.supportedChip || '').toUpperCase(), 'relation')
    : null;
exports.renderSupportedChip = renderSupportedChip;
const RELATION_FILTERS = ['supported', 'replicated'];
const hasRelation = (mode, list) => Array.isArray(list) && (mode === 'supported' ? list.some(x => x && x.isSupported) : list.length > 0);
const relationFilterLabel = (mode) => String(mode === 'supported' ? i18n.filterSupported : mode === 'favorites' ? i18n.favoritesTitle : i18n.filterReplicated).toUpperCase();
const renderRelationFilters = (current, visible, opts = {}) => (opts.favorites ? [...RELATION_FILTERS, 'favorites'] : RELATION_FILTERS)
  .map(mode => ({ mode, value: opts.upper ? mode.toUpperCase() : mode }))
  .filter(({ value }) => String(current) === value || !visible || visible(value))
  .map(({ mode, value }) => opts.href
    ? a({ href: opts.href(value), class: String(current) === value ? (opts.activeClass || 'filter-btn active') : (opts.linkClass || 'filter-btn') }, relationFilterLabel(mode))
    : button({ type: 'submit', name: opts.name || 'filter', value, class: String(current) === value ? 'filter-btn active' : 'filter-btn' }, relationFilterLabel(mode)));
const isFavoriteItem = (favIndex, item) => favIndex instanceof Map && !!item && [item.key, item.id, item.rootId].some((k) => k && favIndex.has(String(k)));
exports.isFavoriteItem = isFavoriteItem;
exports.RELATION_FILTERS = RELATION_FILTERS;
exports.hasRelation = hasRelation;
exports.relationFilterLabel = relationFilterLabel;
exports.renderRelationFilters = renderRelationFilters;
exports.renderSupportButton = renderSupportButton;
const renderCardMetaRow = (...nodes) => {
  const flat = nodes.flat(Infinity).filter(Boolean);
  if (!flat.length) return null;
  return div({ class: 'card-meta-row' }, ...flat);
};
exports.renderCardMetaRow = renderCardMetaRow;
const commentsOpenHref = (detailHref, total = 0) => `${detailHref}${detailHref.includes('?') ? '&' : '?'}comments=open${total ? '#comments-latest' : ''}`;
const renderCommentsSummary = (href, total = 0) => href
  ? a({ href, class: total ? 'comments-summary-link engage-on' : 'comments-summary-link', title: i18n.commentsGoToLast || i18n.voteNewCommentLabel || 'Comments' },
      span({ class: 'comments-summary-icon' }, '✑'),
      span({ class: 'comments-summary-count' }, `(${total})`)
    )
  : null;
exports.commentsOpenHref = commentsOpenHref;
exports.renderCommentsSummary = renderCommentsSummary;
const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];
const formatSize = (bytes) => {
  let n = Number(bytes) || 0;
  if (n <= 0) return "—";
  let unit = 0;
  while (n >= 1024 && unit < SIZE_UNITS.length - 1) { n /= 1024; unit++; }
  return unit === 0 ? `${n} B` : `${n.toFixed(1)} ${SIZE_UNITS[unit]}`;
};
exports.formatSize = formatSize;
const forumReplyAnchor = (key) => `msg-${String(key || "").replace(/[^a-zA-Z0-9]/g, "")}`;
exports.forumReplyAnchor = forumReplyAnchor;
const pdfView = require("../backend/pdf_view");
const pdfFileName = (t) => { const n = String(t || "document").replace(/[\\/:*?"<>|\r\n]+/g, " ").trim().slice(0, 120) || "document"; return n.toLowerCase().endsWith(".pdf") ? n : `${n}.pdf`; };
const pdfDownloadHref = (src, t) => `${src}${String(src).includes("?") ? "&" : "?"}download=1&name=${encodeURIComponent(pdfFileName(t))}`;
const pdfPageImage = (src, page, width, rotation, prefix = "") => `${prefix}/pdf/page?${new URLSearchParams({ src, p: String(page), w: String(width), ...(rotation ? { r: String(rotation) } : {}) })}`;
const pdfEmbedHref = (src, t, fid) => `/pdf/embed?${new URLSearchParams({ src, ...(t ? { title: String(t).slice(0, 200) } : {}), fid })}`;
const renderPdfDocument = (url, { title: docTitle = "" } = {}) => {
  if (!url) return null;
  if (compactCards()) {
    const viewHref = `/pdf?${new URLSearchParams({ src: url, ...(docTitle ? { title: String(docTitle).slice(0, 200) } : {}) })}`;
    if ((listScope() || {}).compactCards === "list") {
      return div({ class: "torrent-card-actions" }, a({ href: pdfDownloadHref(url, docTitle), class: "filter-btn", ...blobAttr(blobOfHref(url)) }, `\u2B07 ${i18n.torrentOasisButton || "LOCAL"}`));
    }
    return a({ href: viewHref, class: "pdf-thumb" }, img({ src: pdfPageImage(url, 1, pdfView.PDF_THUMB_WIDTH, 0), class: "pdf-thumb-image", alt: String(docTitle || "PDF"), loading: "lazy" }));
  }
  const fid = pdfView.frameIdOf(url);
  return span({ class: "pdf-holder" },
    object({ id: fid, data: pdfEmbedHref(url, docTitle, fid), type: "text/html", class: "pdf-frame", title: String(docTitle || "PDF"), "aria-label": String(docTitle || "PDF") }, ""),
    a({ href: "#", class: "pdf-unmax", title: i18n.pdfClose, "aria-label": i18n.pdfClose }, "✕")
  );
};
exports.renderPdfDocument = renderPdfDocument;

const renderPdfViewer = (state, { title: docTitle = "", base = "/pdf", keep = {}, embed = false, back = "", prefix = "" } = {}) => {
  if (!state) return null;
  if (!state.src && !state.error) state = { ...state, error: "missing" };
  const src = state.src || "";
  const clean = (v) => { for (const k of Object.keys(v)) if (v[k] === null || v[k] === undefined || v[k] === "" || v[k] === 0) delete v[k]; return v; };
  const params = (over = {}) => clean({ ...keep, fid: state.fid || null, p: state.page > 1 ? state.page : null, z: state.zoom !== pdfView.PDF_ZOOM_DEFAULT ? state.zoom : null, r: state.rotation || null, full: state.full ? "1" : null, ...over });
  const href = (over) => { const q = new URLSearchParams(params(over)).toString(); return `${base}${q ? `?${q}` : ""}#pdf-viewer`; };
  const ctl = (url, label, tip, extra = {}) => url ? a({ href: url, title: tip, "aria-label": tip, ...extra }, label) : span({ class: "pdf-off", title: tip }, label);
  const download = a({ href: pdfDownloadHref(src, docTitle), target: "_top", title: i18n.fileShareDownload || "Download", "aria-label": i18n.fileShareDownload || "Download" }, "⬇️");
  const shell = (...children) => div({ id: "pdf-viewer", class: ["pdf-viewer-container", embed ? "pdf-embedded" : "", state.full ? "pdf-maximized" : ""].filter(Boolean).join(" ") }, ...children);
  if (state.error) {
    return shell(
      div({ class: "pdf-canvas-wrap pdf-message-wrap" }, div({ class: "pending-media", role: "note" }, i18n.contentNotAvailableYet)),
      state.error === "unavailable" ? div({ class: "pdf-controls" }, ctl(href({}), "↻", i18n.pdfRetry), download) : null
    );
  }
  const { page, pages, zoom } = state;
  const rotation = state.rotation || 0;
  const zooms = pdfView.PDF_ZOOMS;
  const zi = zooms.indexOf(zoom);
  const fullOn = { ...keep, src, title: docTitle || null, back: back || null, p: page > 1 ? page : null, z: zoom !== pdfView.PDF_ZOOM_DEFAULT ? zoom : null, r: rotation || null, full: "1" };
  const fullscreen = embed
    ? a({ href: state.fid && back ? `${back}#${state.fid}` : `${prefix}/pdf?${new URLSearchParams(clean(fullOn))}`, target: "_top", title: i18n.pdfFullscreen, "aria-label": i18n.pdfFullscreen }, "🔲")
    : state.full
      ? a({ href: back || href({ full: null }), title: i18n.pdfFullscreen, "aria-label": i18n.pdfFullscreen }, "🔲")
      : ctl(href({ full: "1" }), "🔲", i18n.pdfFullscreen);
  return shell(
    div({ class: zoom > pdfView.PDF_ZOOM_DEFAULT ? "pdf-canvas-wrap pdf-wrap-scroll" : "pdf-canvas-wrap" },
      img({ src: pdfPageImage(src, page, pdfView.widthOf(zoom), rotation, prefix), class: `pdf-page-image pdf-z${zoom}`, alt: `${docTitle || "PDF"} — ${i18n.pdfPage} ${page} / ${pages}` })
    ),
    div({ class: "pdf-controls" },
      ctl(page > 1 ? href({ p: page - 1 }) : null, "⬅️", i18n.pdfPrevPage),
      ctl(page < pages ? href({ p: page + 1 }) : null, "➡️", i18n.pdfNextPage),
      ctl(zi < zooms.length - 1 ? href({ z: zooms[zi + 1] }) : null, "🔍+", i18n.pdfZoomIn),
      ctl(zi > 0 ? href({ z: zooms[zi - 1] }) : null, "🔍−", i18n.pdfZoomOut),
      ctl(href({ r: (rotation + 90) % 360 || null }), "↻", i18n.pdfRotate),
      download,
      fullscreen
    )
  );
};
exports.renderPdfViewer = renderPdfViewer;

exports.pdfEmbedView = (state, { title: docTitle = "", back = "" } = {}) => {
  const theme = getConfig().themes.current || "Dark-SNH";
  return doctypeString + html(
    { lang: i18nBase[selectedLanguage] ? selectedLanguage : "en", class: "pdf-embed-root" },
    head(
      title(docTitle || "PDF"),
      link({ rel: "stylesheet", href: `/assets/styles/style.css?v=${assetVersion()}` }),
      link({ rel: "stylesheet", href: `/assets/themes/${theme}.css?v=${assetVersion()}` }),
      meta({ charset: "utf-8" }),
      meta({ name: "viewport", content: "width=device-width, initial-scale=1" })
    ),
    body({ class: "pdf-embed" }, renderPdfViewer(state, { title: docTitle, base: "/pdf/embed", keep: { src: state && state.src, title: docTitle || null, back: back || null }, embed: true, back }))
  ).outerHTML;
};

exports.pdfViewerView = (state, { title: docTitle = "", back = "" } = {}) => {
  const { renderDocumentsHeader } = require('./document_view');
  return template(
    docTitle || "PDF",
    section(
      ...renderDocumentsHeader('all'),
      div({ class: "tags-header module-header-line pdf-page-title" }, h2(docTitle || "PDF")),
      renderPdfViewer(state, { title: docTitle, base: "/pdf", keep: { src: state && state.src, title: docTitle || null, back: back || null } })
    )
  );
};

const renderOpinionsVoting = (basePath, id, opinions, returnTo, voters, pathFor = null) => {
  const ops = opinions || {};
  const total = Object.values(ops).reduce((s, n) => s + (Number(n) || 0), 0);
  const myId = (config.keys && config.keys.id) ? config.keys.id : '';
  const alreadyVoted = Array.isArray(voters) && myId ? voters.includes(myId) : false;
  const actionFor = (category) => typeof pathFor === 'function' ? pathFor(id, category) : `${basePath}/${encodeURIComponent(id)}/${category}`;
  const backTo = returnTo || hereAt(id);
  const votingDetails = details({ class: 'opinions-voting-collapse' },
    summary({ class: total > 0 ? 'opinions-summary engage-on' : 'opinions-summary' },
      span({ class: 'opinions-summary-icon' }, 'ꔍ'),
      span({ class: 'opinions-summary-count' }, `(${total})`)),
    div({ class: 'voting-buttons' },
      opinionCategoriesList.map((category) =>
        form({ method: 'POST', action: actionFor(category) },
          backTo ? input({ type: 'hidden', name: 'returnTo', value: backTo }) : null,
          button({ class: alreadyVoted ? 'vote-btn disabled' : 'vote-btn', type: 'submit', ...(alreadyVoted ? { disabled: true } : {}) },
            `${String(i18n['vote' + category.charAt(0).toUpperCase() + category.slice(1)] || category).toUpperCase()} [${ops[category] || 0}]`)
        )
      )
    ),
    alreadyVoted ? p({ class: 'muted' }, i18n.alreadyVoted) : null
  );
  return [renderVotesSummary(ops), votingDetails].filter(Boolean);
};
exports.renderOpinionsVoting = renderOpinionsVoting;

let spreadsModel = null;
const spreadsFor = async (msgId) => {
  if (!msgId || typeof msgId !== 'string' || !msgId.startsWith('%')) return 0;
  try {
    if (!spreadsModel) spreadsModel = require('../models/main_models')({ cooler, isPublic: config.public }).spreads;
    const info = await spreadsModel.forMessage(msgId);
    return info && Number(info.count) > 0 ? Number(info.count) : 0;
  } catch (_) {
    return 0;
  }
};

const renderSpreadEditWarning = async (msgId) => {
  const count = await spreadsFor(msgId);
  if (!count) return null;
  return div({ class: 'error-box spread-edit-warning' },
    p(`${i18n.spreadEditWarning} (${count})`)
  );
};
exports.renderSpreadEditWarning = renderSpreadEditWarning;


const markdownUrl = "https://commonmark.org/help/";

const doctypeString = "<!DOCTYPE html>";

const THREAD_PREVIEW_LENGTH = 3;
const toAttributes = (obj) =>
  Object.entries(obj)
    .map(([key, val]) => `${key}=${val}`)
    .join(", ");
    
const nbsp = "\xa0";

const { getConfig } = require('../configs/config-manager.js');

const shortCache = (ttl, fn) => {
  let at = 0;
  let value;
  return () => {
    const now = Date.now();
    if (!at || now - at > ttl) { value = fn(); at = now; }
    return value;
  };
};

const computeAssetVersion = () => {
  try {
    const base = path.resolve(__dirname, "..", "client", "assets");
    let latest = 0;
    for (const rel of ["styles", "themes"]) {
      const dir = path.join(base, rel);
      for (const f of fs.readdirSync(dir)) {
        const t = fs.statSync(path.join(dir, f)).mtimeMs;
        if (t > latest) latest = t;
      }
    }
    const v = String(readPkg()?.version || '0');
    return encodeURIComponent(latest ? `${v}-${Math.floor(latest / 1000).toString(36)}` : v);
  } catch (_) {
    try { return encodeURIComponent(String(readPkg()?.version || '0')); } catch (_) { return '0'; }
  }
};

const assetVersion = shortCache(5000, () => computeAssetVersion());

const readPkgFile = () => {
  const file = path.resolve(__dirname, "..", "server", "package.json");
  try {
    const txt = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(txt || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
};
const readPkg = shortCache(30000, readPkgFile);

const renderFooter = () => {
  const pkg = readPkg();
  const year = moment().format("YYYY");
  const pkgName = pkg?.name || "@krakenslab/oasis";
  const pkgVersion = pkg?.version || "?";

  const hcT = sharedState.getCarbonHcT();
  const hcH = sharedState.getCarbonHcH();

  const peersOnline = sharedState.getOnlinePeerCount ? sharedState.getOnlinePeerCount() : null;
  const syncedPeers = sharedState.getSyncedPeerCount ? sharedState.getSyncedPeerCount() : null;
  const inboxUnread = sharedState.getInboxUnreadCount ? sharedState.getInboxUnreadCount() : null;
  const lastSyncTs = sharedState.getLastSyncTs ? sharedState.getLastSyncTs() : null;
  const lastSyncLabel = lastSyncTs ? moment(lastSyncTs).fromNow() : '–';
  const lastActivity = sharedState.getLastActivity ? sharedState.getLastActivity() : null;

  return div(
    { class: "oasis-footer" },
    div(
      { class: "oasis-footer-center" },
      a(
        { href: "/", class: "oasis-footer-logo-link" },
        img({
          class: "oasis-footer-logo",
          src: "/assets/images/snh-oasis.jpg",
          alt: "Oasis"
        })
      ),
      (() => {
        const myId = (config.keys && config.keys.id) ? config.keys.id : '';
        if (!myId) return null;
        return [
          br(),
          a({ href: "/profile" }, span(myId))
        ];
      })(),
      br(),
      span({ class: "oasis-footer-peers" },
        span("Synced-peers: [ "),
        a({ href: "/peers" }, String(syncedPeers || 0)),
        span(" ]")
      ),
      br(),
      span({ class: "oasis-footer-carbon" },
        span("HcT: "),
        a({ href: "/stats?filter=ALL#carbon" }, hcT != null ? String(hcT) : '–'),
        span(" | HcH: "),
        a({ href: "/stats?filter=MINE#carbon" }, hcH != null ? String(hcH) : '–')
      ),
      br(),
      a(
        { href: "https://code.03c8.net/krakenslab/oasis", target: "_blank", rel: "noreferrer noopener" },
      span(pkgName),
      ),
      span("["),
         span({ class: "oasis-footer-version" }, pkgVersion),
      span("]"),
      br(),
      span(`${i18n.footerLicenseLabel || 'License'}: `),
      a(
        { href: "https://www.gnu.org/licenses/gpl-3.0.html", target: "_blank", rel: "noreferrer noopener" },
        i18n.footerLicense
      ),
      span({ class: "oasis-footer-sep" }, " - "),
      span({ class: "oasis-footer-year" }, year)
    )
  );
};

const navLinkIsCurrent = (href) => {
  const base = String(href || '').split(/[?#]/)[0];
  const path = currentNavPath();
  return !!base && base !== '/' && !!path && (path === base || path.startsWith(base + '/'));
};
const navAnchor = ({ href, emoji, text, current, class: extraClass }) =>
  a(
    {
      href,
      class: [current || (current === undefined && navLinkIsCurrent(href)) ? "current" : "", extraClass]
        .filter(Boolean)
        .join(" ")
    },
    span({ class: "emoji" }, emoji),
    span({ class: "nav-text" }, text)
  );
const navLink = (opts) => li(navAnchor(opts));
const PLAYER_END_MARGIN_S = 2;
const playerEndRefresh = () => {
  const st = config.public ? null : mediaPlayer.status();
  if (!st || st.paused || !(st.duration > 0)) return 0;
  const left = Math.ceil(st.duration - st.position);
  return left > 0 ? left + PLAYER_END_MARGIN_S : 0;
};
const inboxTopLink = () => li(a({ href: inboxHref() }, span({ class: "emoji" }, "☂"), nbsp, i18n.inbox, ...inboxBadges()));
const mentionsTopLink = () => {
  const mentionsTotal = sharedState.getMentionsTotal ? sharedState.getMentionsTotal() : 0;
  if (!(mentionsTotal > 0)) return null;
  const mentionsCount = sharedState.getMentionsCount();
  return li(a({ href: "/mentions" }, span({ class: "emoji" }, "✺"), nbsp, i18n.mentions, mentionsCount > 0 ? span({ class: "inbox-badge" }, String(mentionsCount)) : ""));
};
const matchesTopLink = () => navLink({ href: "/data", emoji: "⚯", text: i18n.dataTitle });

const currentNavPath = () => {
  let store = null;
  try { store = require('../models/typed_log').requestScope.getStore(); } catch (_) { store = null; }
  return store && typeof store.path === 'string' ? store.path : '';
};

const firstHref = (node) => {
  if (!node || typeof node !== 'object') return '';
  const own = typeof node.href === 'string' && node.href ? node.href : (typeof node.getAttribute === 'function' ? node.getAttribute('href') : null);
  if (own) return String(own);
  for (const child of node.childNodes || []) {
    const found = firstHref(child);
    if (found) return found;
  }
  return '';
};

const navGroupHasPath = (items, path) => {
  if (!path) return false;
  return items.flat(Infinity).some(item => {
    const href = firstHref(item).split(/[?#]/)[0];
    if (!href || href === '/') return false;
    return path === href || path.startsWith(href + '/');
  });
};

const navGroup = ({ id, emoji, title, defaultOpen = false }, ...items) => {
  const active = items.filter(Boolean);
  if (!active.length) return null;
  const open = defaultOpen || navGroupHasPath(active, currentNavPath());
  return li(
    { class: "oasis-nav-group" },
    input({
      type: "checkbox",
      id: `oasis-nav-group-${id}`,
      class: "oasis-nav-toggle",
      ...(open ? { checked: true } : {})
    }),
    label(
      { for: `oasis-nav-group-${id}`, class: "oasis-nav-header" },
      span({ class: "emoji" }, emoji),
      span({ class: "nav-text" }, title),
      span({ class: "oasis-nav-arrow" }, "▾")
    ),
    ul({ class: "oasis-nav-list" }, ...active)
  );
};






const renderPollsLink = () => {
  const pollsMod = getConfig().modules.pollsMod === "on";
  return pollsMod
    ? navLink({
        href: "/polls",
        emoji: "☑",
        text: i18n.pollsTitle,
        class: "polls-link enabled"
      })
    : "";
};

const renderBlogsLink = () => {
  const blogsMod = getConfig().modules.blogsMod === "on";
  return blogsMod
    ? navLink({
        href: "/blogs",
        emoji: "✦",
        text: i18n.blogTitle,
        class: "blogs-link enabled"
      })
    : "";
};

const renderInvitesLink = () => {
  const invitesMod = getConfig().modules.invitesMod === "on";
  return invitesMod
    ? navLink({
        href: "/invites",
        emoji: "ꔹ",
        text: i18n.invites,
        class: "invites-link enabled"
      })
    : "";
};

const renderWalletLink = () => {
  const walletMod = getConfig().modules.walletMod === "on";
  if (walletMod) {
    return [
      navLink({
        href: "/wallet",
        emoji: "❄",
        text: i18n.wallet,
        class: "wallet-link enabled"
      })
    ];
  }
  return "";
};

const renderDevLink = () => {
  const devMod = getConfig().modules.devMod === "on";
  if (devMod) {
    return [
      navLink({
        href: "/dev",
        emoji: "⌘",
        text: i18n.developer,
        class: "dev-link enabled"
      })
    ];
  }
  return "";
};

const renderBackupLink = () => {
  const backupMod = getConfig().modules.backupMod === "on";
  if (backupMod) {
    return [
      navLink({
        href: "/backup",
        emoji: "ꖤ",
        text: i18n.backupTitle,
        class: "backup-link enabled"
      })
    ];
  }
  return "";
};

const renderCipherLink = () => {
  const cipherMod = getConfig().modules.cipherMod === "on";
  if (cipherMod) {
    return [
      navLink({
        href: "/cipher",
        emoji: "ꗄ",
        text: i18n.cipher,
        class: "cipher-link enabled"
      })
    ];
  }
  return "";
};

const renderGraphosLink = () => {
  const graphosMod = getConfig().modules.graphosMod === "on";
  if (graphosMod) {
    return [
      navLink({
        href: "/graphos",
        emoji: "ꔯ",
        text: i18n.graphos,
        class: "graphos-link enabled"
      })
    ];
  }
  return "";
};

const renderBookmarksLink = () => {
  const bookmarksMod = getConfig().modules.bookmarksMod === "on";
  return bookmarksMod
    ? navLink({
        href: "/bookmarks",
        emoji: "ꔪ",
        text: i18n.bookmarksLabel,
        class: "bookmark-link enabled"
      })
    : "";
};

const renderImagesLink = () => {
  const imagesMod = getConfig().modules.imagesMod === "on";
  if (imagesMod) {
    return [
      navLink({
        href: "/images",
        emoji: "▦",
        text: i18n.imagesLabel,
        class: "images-link enabled"
      })
    ];
  }
  return "";
};

const renderFilesLink = () => {
  const filesMod = getConfig().modules.filesMod === "on";
  if (filesMod) {
    return [
      navLink({
        href: "/files",
        emoji: "▣",
        text: i18n.filesLabel,
        class: "files-link enabled"
      })
    ];
  }
  return "";
};

const renderTorrentsLink = () => {
  const torrentsMod = getConfig().modules.torrentsMod === "on";
  if (torrentsMod) {
    return [
      navLink({
        href: "/torrents",
        emoji: "ꖅ",
        text: i18n.torrentsLabel,
        class: "torrents-link enabled"
      })
    ];
  }
  return "";
};

const renderMapsLink = () => {
  const mapsMod = getConfig().modules.mapsMod === "on";
  if (mapsMod) {
    return [
      navLink({
        href: "/maps",
        emoji: "ꔌ",
        text: i18n.mapsLabel,
        class: "maps-link enabled"
      })
    ];
  }
  return "";
};

const renderChatsLink = () => {
  const chatsMod = getConfig().modules.chatsMod === "on";
  if (chatsMod) {
    return [
      navLink({
        href: "/chats",
        emoji: "ꖒ",
        text: i18n.chatsTitle,
        class: "chats-link enabled"
      })
    ];
  }
  return "";
};

const renderVideosLink = () => {
  const videosMod = getConfig().modules.videosMod === "on";
  if (videosMod) {
    return [
      navLink({
        href: "/videos",
        emoji: "ꗟ",
        text: i18n.videosLabel,
        class: "videos-link enabled"
      })
    ];
  }
  return "";
};

const renderAudiosLink = () => {
  const audiosMod = getConfig().modules.audiosMod === "on";
  if (audiosMod) {
    return [
      navLink({
        href: "/audios",
        emoji: "ꔿ",
        text: i18n.audiosLabel,
        class: "audios-link enabled"
      })
    ];
  }
  return "";
};

const renderDocsLink = () => {
  const docsMod = getConfig().modules.docsMod === "on";
  if (docsMod) {
    return [
      navLink({
        href: "/documents",
        emoji: "ꕨ",
        text: i18n.docsLabel,
        class: "docs-link enabled"
      })
    ];
  }
  return "";
};

const renderTagsLink = () => {
  const tagsMod = getConfig().modules.tagsMod === "on";
  return tagsMod
    ? [
        navLink({ href: "/tags", emoji: "ꖶ", text: i18n.tagsLabel, class: "tags-link enabled" })
      ]
    : "";
};


const hasMultiverseAccount = () => {
  try {
    const store = JSON.parse(fs.readFileSync(require('../configs/state-manager').statePath('fediverse-accounts.json'), 'utf8'));
    return !!(store && ((store.mastodon && store.mastodon.token) || (store.peertube && store.peertube.token) || (store.telegram && store.telegram.session)));
  } catch (_) {
    return false;
  }
};

const renderMastodonLink = () => {
  const fediverseMod = getConfig().modules.fediverseMod === "on";
  return fediverseMod && hasMultiverseAccount()
    ? navLink({
        href: "/fediverse",
        emoji: "ꗵ",
        text: i18n.fediverseTimeline
      })
    : "";
};

const renderMarketLink = () => {
  const marketMod = getConfig().modules.marketMod === "on";
  return marketMod
    ? [
        navLink({
          href: "/market",
          emoji: "ꕻ",
          text: i18n.marketTitle
        })
      ]
    : "";
};

const renderHousingLink = () => {
  const housingMod = getConfig().modules.housingMod === "on";
  return housingMod
    ? [
        navLink({
          href: "/housing",
          emoji: "⌂",
          text: i18n.housingTitle
        })
      ]
    : "";
};

const renderJobsLink = () => {
  const jobsMod = getConfig().modules.jobsMod === "on";
  return jobsMod
    ? [
        navLink({
          href: "/jobs",
          emoji: "ꗒ",
          text: i18n.jobsTitle
        })
      ]
    : "";
};

const renderShopsLink = () => {
  const shopsMod = getConfig().modules.shopsMod === "on";
  return shopsMod
    ? [
        navLink({
          href: "/shops",
          emoji: "ꔜ",
          text: i18n.shopsTitle
        })
      ]
    : "";
};

const renderProjectsLink = () => {
  const projectsMod = getConfig().modules.projectsMod === "on";
  return projectsMod
    ? [
        navLink({
          href: "/projects",
          emoji: "ꕧ",
          text: i18n.projectsTitle
        })
      ]
    : "";
};

const renderIndustryLink = () => {
  const industryMod = getConfig().modules.industryMod === "on";
  return industryMod
    ? [
        navLink({
          href: "/industry",
          emoji: "ꖴ",
          text: i18n.industryTitle
        })
      ]
    : "";
};

const renderBankingLink = () => {
  const bankingMod = getConfig().modules.bankingMod === "on";
  return bankingMod
    ? navLink({
        href: "/banking",
        emoji: "ꗴ",
        text: i18n.bankingTitle
      })
    : "";
};

const renderTribesLink = () => {
  const tribesMod = getConfig().modules.tribesMod === "on";
  return tribesMod
    ? [
        navLink({
          href: "/tribes",
          emoji: "ꖥ",
          text: i18n.tribesTitle,
          class: "tribes-link enabled"
        })
      ]
    : "";
};

const renderLarpLink = () => {
  const larpMod = getConfig().modules.larpMod === "on";
  return larpMod
    ? [
        navLink({
          href: "/larp",
          emoji: "♜",
          text: i18n.larpTitle || "L.A.R.P.",
          class: "larp-link enabled"
        })
      ]
    : "";
};

const renderParliamentLink = () => {
  const parliamentMod = getConfig().modules.parliamentMod === "on";
  return parliamentMod
    ? [
        navLink({
          href: "/parliament",
          emoji: "ꗞ",
          text: i18n.parliamentTitle,
          class: "parliament-link enabled"
        })
      ]
    : "";
};

const renderSchoolLink = () => {
  const schoolMod = getConfig().modules.schoolMod === "on";
  return schoolMod
    ? navLink({
        href: "/school",
        emoji: "ꖂ",
        text: i18n.schoolTitle,
        class: "school-link enabled"
      })
    : "";
};

const renderCourtsLink = () => {
  const courtsMod = getConfig().modules.courtsMod === "on";
  return courtsMod
    ? navLink({
        href: "/courts",
        emoji: "ꖻ",
        text: i18n.courtsTitle,
        class: "courts-link enabled"
      })
    : "";
};

const renderEmergenciesLink = () => {
  const emergenciesMod = getConfig().modules.emergenciesMod === "on";
  return emergenciesMod
    ? navLink({
        href: "/emergencies",
        emoji: "ꕥ",
        text: i18n.emergenciesTitle,
        class: "emergencies-link enabled"
      })
    : "";
};

const renderCampaignsLink = () => {
  const campaignsMod = getConfig().modules.campaignsMod === "on";
  return campaignsMod
    ? navLink({
        href: "/campaigns",
        emoji: "✍",
        text: i18n.campaignsTitle,
        class: "campaigns-link enabled"
      })
    : "";
};

const renderPodcastsLink = () => {
  const podcastsMod = getConfig().modules.podcastsMod === "on";
  return podcastsMod
    ? navLink({
        href: "/podcasts",
        emoji: "ꖜ",
        text: i18n.podcastsTitle,
        class: "podcasts-link enabled"
      })
    : "";
};

const renderLogisticsLink = () => {
  const logisticsMod = getConfig().modules.logisticsMod === "on";
  return logisticsMod
    ? navLink({
        href: "/logistics",
        emoji: "⇄",
        text: i18n.logisticsTitle,
        class: "logistics-link enabled"
      })
    : "";
};

const renderRoomsLink = () => {
  const roomsMod = getConfig().modules.roomsMod === "on";
  return roomsMod
    ? navLink({
        href: "/rooms",
        emoji: "ꘒ",
        text: i18n.roomsTitle,
        class: "rooms-link enabled"
      })
    : "";
};

const renderMailingLink = () => {
  const mailingMod = getConfig().modules.mailingMod === "on";
  return mailingMod
    ? navLink({
        href: "/mailing",
        emoji: "✉",
        text: i18n.mailingTitle,
        class: "mailing-link enabled"
      })
    : "";
};

const renderVotationsLink = () => {
  const votesMod = getConfig().modules.votesMod === "on";
  return votesMod
    ? [
        navLink({
          href: "/votes",
          emoji: "ꔰ",
          text: i18n.votationsTitle,
          class: "votations-link enabled"
        })
      ]
    : "";
};

const renderTrendingLink = () => {
  const trendingMod = getConfig().modules.trendingMod === "on";
  return trendingMod
    ? [
        navLink({
          href: "/trending",
          emoji: "ꗝ",
          text: i18n.trendingLabel,
          class: "trending-link enabled"
        })
      ]
    : "";
};

const renderReportsLink = () => {
  const reportsMod = getConfig().modules.reportsMod === "on";
  return reportsMod
    ? [
        navLink({
          href: "/reports",
          emoji: "⚐",
          text: i18n.reportsTitle,
          class: "reports-link enabled"
        })
      ]
    : "";
};

const renderOpinionsLink = () => {
  const opinionsMod = getConfig().modules.opinionsMod === "on";
  return opinionsMod
    ? [
        navLink({
          href: "/opinions",
          emoji: "ꔍ",
          text: i18n.opinionsTitle,
          class: "opinions-link enabled"
        })
      ]
    : "";
};

const renderPadsLink = () => {
  const padsMod = getConfig().modules.padsMod === "on";
  return padsMod
    ? [
        navLink({
          href: "/pads",
          emoji: "ꔗ",
          text: i18n.padsTitle,
          class: "pads-link enabled"
        })
      ]
    : "";
};

const renderWikiLink = () => {
  const wikiMod = getConfig().modules.wikiMod === "on";
  return wikiMod
    ? [
        navLink({
          href: "/wiki",
          emoji: "¶",
          text: i18n.wikiTitle,
          class: "wiki-link enabled"
        })
      ]
    : "";
};

const renderTransfersLink = () => {
  const transfersMod = getConfig().modules.transfersMod === "on";
  return transfersMod
    ? [
        navLink({
          href: "/transfers",
          emoji: "ꘉ",
          text: i18n.transfersTitle,
          class: "transfers-link enabled"
        })
      ]
    : "";
};

const renderFeedLink = () => {
  const feedMod = getConfig().modules.feedMod === "on";
  return feedMod
    ? navLink({
        href: "/feed",
        emoji: "ꕿ",
        text: i18n.feedTitle,
        class: "feed-link enabled"
      })
    : "";
};

const renderPixeliaLink = () => {
  const pixeliaMod = getConfig().modules.pixeliaMod === "on";
  return pixeliaMod
    ? [
        navLink({
          href: "/pixelia",
          emoji: "ꔘ",
          text: i18n.pixeliaTitle,
          class: "pixelia-link enabled"
        })
      ]
    : "";
};

const renderMelodyLink = () => {
  const melodyMod = getConfig().modules.melodyMod === "on";
  return melodyMod
    ? [
        navLink({
          href: "/melody",
          emoji: "♪",
          text: i18n.melodyTitle,
          class: "melody-link enabled"
        })
      ]
    : "";
};

const renderGamesLink = () => {
  const gamesMod = getConfig().modules.gamesMod === "on";
  return gamesMod
    ? [navLink({ href: "/games", emoji: "ꕇ", text: i18n.gamesTitle, class: "games-link enabled" })]
    : "";
};

const renderForumLink = () => {
  const forumMod = getConfig().modules.forumMod === "on";
  return forumMod
    ? [
        navLink({
          href: "/forum",
          emoji: "ꕒ",
          text: i18n.forumTitle,
          class: "forum-link enabled"
        })
      ]
    : "";
};

const renderAgendaLink = () => {
  const agendaMod = getConfig().modules.agendaMod === "on";
  return agendaMod
    ? [
        navLink({
          href: "/agenda",
          emoji: "ꗤ",
          text: i18n.agendaTitle,
          class: "agenda-link enabled"
        })
      ]
    : "";
};

const renderFavoritesLink = () => {
  const favoritesMod = getConfig().modules.favoritesMod === "on";
  return favoritesMod
    ? [
        navLink({
          href: "/favorites",
          emoji: "ꘝ",
          text: i18n.favoritesTitle,
          class: "favorites-link enabled"
        })
      ]
    : "";
};

const renderLogsLink = () => {
  const logsMod = getConfig().modules.logsMod === "on";
  return logsMod
    ? [
        navLink({
          href: "/logs",
          emoji: "ꗯ",
          text: i18n.logsTitle || "Logs",
          class: "logs-link enabled"
        })
      ]
    : "";
};

const renderAILink = () => {
  const aiMod = getConfig().modules.aiMod === "on";
  return aiMod
    ? [
        navLink({
          href: "/ai",
          emoji: "ꘜ",
          text: i18n.ai,
          class: "ai-link enabled"
        })
      ]
    : "";
};

const renderEventsLink = () => {
  const eventsMod = getConfig().modules.eventsMod === "on";
  return eventsMod
    ? [
        navLink({
          href: "/events",
          emoji: "ꕆ",
          text: i18n.eventsLabel,
          class: "events-link enabled"
        })
      ]
    : "";
};

const renderCalendarsLink = () => {
  const calendarsMod = getConfig().modules.calendarsMod === "on";
  return calendarsMod
    ? [
        navLink({
          href: "/calendars",
          emoji: "\uA5AF",
          text: i18n.calendarsTitle || "Calendars",
          class: "calendars-link enabled"
        })
      ]
    : "";
};

const renderTasksLink = () => {
  const tasksMod = getConfig().modules.tasksMod === "on";
  return tasksMod
    ? [
        navLink({
          href: "/tasks",
          emoji: "ꖧ",
          text: i18n.tasksTitle,
          class: "tasks-link enabled"
        })
      ]
    : "";
};

const renderEmergencyBanner = (featured, opts = {}) => {
  if (!featured || !featured.href) return null;
  const compact = !!opts.compact;
  const cap = compact ? 42 : 80;
  const sev = String(featured.severity || "UNVERIFIED");
  const sevLabel = String(i18n[`emergencySeverity${sev.charAt(0) + sev.slice(1).toLowerCase()}`] || sev).toUpperCase();
  const t = String(featured.title || "").trim();
  const label = `${t.length > cap ? t.slice(0, cap) + "…" : t} (${sevLabel} · ${featured.confirmationCount || 0})`;
  return div(
    { class: (compact ? "ai-suggestion-banner ai-suggestion-inline" : "update-banner ai-suggestion-banner") + ` emergency-banner emergency-banner-${sev.toLowerCase()}` },
    span({ class: "update-banner-icon" }, "🚨"),
    compact ? null : span({ class: "update-banner-text" }, i18n.emergencyBannerLabel),
    a({ href: featured.href, class: "update-banner-link" }, label),
    form({ method: "POST", action: "/emergencies/banner/dismiss", class: "welcome-banner-close" },
      button({ type: "submit", class: "welcome-banner-close-btn" }, "✕"))
  );
};

const DETAIL_SWITCH_ROWS = ['filters', 'mode-buttons-row', 'tribe-mode-buttons', 'mode-buttons'];
const classesOf = (n) => String((n && (n.className || n.class)) || '').split(/\s+/);
const injectDetailLayoutSwitch = (elements) => {
  const segs = String((listScope() || {}).path || '').split('/').filter(Boolean);
  if (segs.length < 2 || !LAYOUT_TYPE_KEYS[segs[0]] || ['edit', 'create', 'new'].includes(segs[1])) return;
  const has = (n) => !!n && !!n.childNodes && (classesOf(n).includes('layout-switch') || Array.from(n.childNodes).some(has));
  if (elements.some(has)) return;
  const walk = (n, depth) => {
    if (!n || !n.childNodes || depth > 3) return false;
    const kids = Array.from(n.childNodes);
    for (let i = 0; i < kids.length; i++) {
      if (classesOf(kids[i]).some((c) => DETAIL_SWITCH_ROWS.includes(c))) {
        const sw = renderLayoutSwitch('filters');
        if (kids[i + 1]) n.insertBefore(sw, kids[i + 1]); else n.appendChild(sw);
        return true;
      }
      if (walk(kids[i], depth + 1)) return true;
    }
    return false;
  };
  elements.some((el) => walk(el, 0));
};
const FOLD_HEAD = ['all', 'recent', 'mine', 'supported', 'replicated', 'favorites', 'top'];
const renderFilterFold = (id, items, current) => {
  const isHead = (it) => FOLD_HEAD.includes(String(it.value).toLowerCase());
  const head = FOLD_HEAD.map((v) => items.find((it) => String(it.value).toLowerCase() === v)).filter(Boolean);
  const rest = items.filter((it) => !isHead(it));
  const active = new Set([].concat(current).map(String));
  const chip = (it, more) => a({ href: it.href, class: ['activity-chip', more ? 'activity-chip-more' : '', active.has(String(it.value)) ? 'active' : ''].filter(Boolean).join(' ') }, it.label);
  if (!rest.length) return div({ class: 'activity-filter-chips' }, ...head.map((it) => chip(it, false)));
  return div({ class: 'activity-filter-chips filters-fold activity-filters-fold' },
    input({ type: 'checkbox', id, class: 'filters-fold-check' }),
    ...head.map((it) => chip(it, false)),
    label({ for: id, class: 'activity-chip filters-fold-toggle', title: i18n.filtersFoldToggle }, span({ class: 'filters-fold-more' }, '▾'), span({ class: 'filters-fold-less' }, '▴')),
    ...rest.map((it) => chip(it, true))
  );
};
exports.renderFilterFold = renderFilterFold;
const FOLD_ROWS = ['filters', 'activity-filter-chips', 'mode-buttons-row', 'tribe-mode-buttons', 'mode-buttons'];
const FOLD_ITEMS = ['filter-btn', 'activity-chip'];
const FOLD_MIN_ITEMS = 4;
const FOLD_CHAR_PX = 8.5;
const FOLD_ITEM_PX = 25;
const FOLD_FIELD_PX = 180;
const FOLD_STEP_PX = 100;
const FOLD_MIN_STEP = 3;
const FOLD_MAX_STEP = 30;
let foldSeq = 0;
const tagOf = (n) => String((n && (n.tagName || n.nodeName)) || '').toLowerCase();
const foldItemsOf = (row) => {
  const out = [];
  const visit = (n) => {
    for (const k of Array.from(n.childNodes || [])) {
      if (classesOf(k).some((c) => FOLD_ITEMS.includes(c))) out.push(k); else visit(k);
    }
  };
  visit(row);
  return out;
};
const foldWidthOf = (row) => {
  let px = String(row.textContent || '').replace(/\s+/g, ' ').trim().length * FOLD_CHAR_PX;
  const visit = (n) => {
    for (const k of Array.from(n.childNodes || [])) {
      const tag = tagOf(k);
      if (tag === 'input') px += ['hidden', 'checkbox', 'radio'].includes(String(k.type || '')) ? 0 : FOLD_FIELD_PX;
      else if (['button', 'a', 'label', 'select'].includes(tag)) px += FOLD_ITEM_PX;
      else visit(k);
    }
  };
  visit(row);
  return px;
};
const foldBoxOf = (items) => {
  const parents = items.map((k) => k.parentNode);
  if (parents.every((p) => p && p === parents[0])) return parents[0];
  if (!parents.every((p) => tagOf(p) === 'form' && foldItemsOf(p).length === 1)) return null;
  const outer = parents.map((p) => p.parentNode);
  return outer.every((p) => p && p === outer[0]) ? outer[0] : null;
};
const foldFilterRow = (row) => {
  const items = foldItemsOf(row);
  const box = items.length >= FOLD_MIN_ITEMS ? foldBoxOf(items) : null;
  if (!box || classesOf(box).includes('column')) return;
  const step = Math.min(FOLD_MAX_STEP, Math.max(FOLD_MIN_STEP, Math.ceil(foldWidthOf(row) / FOLD_STEP_PX)));
  foldSeq = (foldSeq + 1) % 1000000;
  const id = `filters-fold-${foldSeq}`;
  const itemClass = classesOf(items[0]).includes('activity-chip') ? 'activity-chip' : 'filter-btn';
  const check = input({ type: 'checkbox', id, class: 'filters-fold-check' });
  const first = Array.from(box.childNodes || [])[0];
  if (first) box.insertBefore(check, first); else box.appendChild(check);
  box.appendChild(label({ for: id, class: `${itemClass} filters-fold-toggle`, title: i18n.filtersFoldToggle }, span({ class: 'filters-fold-more' }, '▾'), span({ class: 'filters-fold-less' }, '▴')));
  row.class = `${classesOf(row).join(' ')} filters-fold filters-fold-w${step}`.trim();
};
const foldFilterRows = (elements) => {
  const walk = (n, depth) => {
    if (!n || !n.childNodes || depth > 5) return;
    for (const k of Array.from(n.childNodes)) {
      const cls = classesOf(k);
      if (cls.some((c) => FOLD_ROWS.includes(c)) && !cls.includes('activity-toolbar-row') && !cls.includes('filters-fold')) foldFilterRow(k);
      else walk(k, depth + 1);
    }
  };
  elements.forEach((el) => walk(el, 0));
};
const template = (titlePrefix, ...elements) => {
  const scope = listScope();
  if (scope && scope.dryRun) return '';
  injectDetailLayoutSwitch(elements);
  foldFilterRows(elements);
  const currentConfig = getConfig();
  const theme = currentConfig.themes.current || "Dark-SNH";
  const buildAiSuggestion = (compact) => {
    try {
      const { getConfig } = require('../configs/config-manager.js');
      if (getConfig().ai?.suggestions === false) return null;
    } catch (_) {}
    let here = '';
    try { here = (require('../models/typed_log').requestScope.getStore() || {}).path || ''; } catch (_) {}
    const own = sharedState.getSectionMatch ? sharedState.getSectionMatch(here.split('/')[1] || '') : null;
    const suggestion = (own && own.href !== here) ? own : (sharedState.getBestMatch ? sharedState.getBestMatch() : null);
    if (!suggestion || !suggestion.href) return null;
    if (sharedState.isSuggestionDismissed && sharedState.isSuggestionDismissed(suggestion.href)) return null;
    if (sharedState.areSuggestionsQuiet && sharedState.areSuggestionsQuiet()) return null;
    const cap = compact ? 52 : 96;
    const t = String(suggestion.title || '').trim();
    const label = t.length > cap ? t.slice(0, cap) + '…' : t;
    return div(
      { class: compact ? "ai-suggestion-banner ai-suggestion-inline" : "update-banner ai-suggestion-banner" },
      span({ class: "update-banner-icon" }, "🤖"),
      a({ href: suggestion.href, class: "update-banner-link" }, label),
      form(
        { method: "POST", action: "/ai/suggestion/dismiss", class: "welcome-banner-close" },
        input({ type: "hidden", name: "href", value: suggestion.href }),
        button({ type: "submit", class: "welcome-banner-close-btn" }, "✕")
      )
    );
  };
  const bannerAct = (action, label, kls, fields = {}, tip = null) => form({ method: "POST", action, class: "phone-action-form" },
    ...Object.entries(fields).map(([k, v]) => input({ type: "hidden", name: k, value: String(v) })),
    button({ type: "submit", class: kls, ...(tip ? { title: String(tip) } : {}) }, String(label).toUpperCase()));
  const bannerCls = () => "update-banner phone-banner";
  const bannerChip = (icon, value) => span({ class: "pm-exposition-chip pm-exposition-whole phone-banner-chip" },
    span({ class: "pm-exposition-icon" }, icon),
    span({ class: "pm-exposition-text" }, value));
  const buildRoomBanner = (here) => {
    if (config.public || getConfig().modules.roomsMod !== 'on') return null;
    const room = sharedState.getPhoneRoom();
    if (room && room.ref) {
      const href = `/rooms/${encodeURIComponent(room.ref)}`;
      if (here === href) return null;
      return div({ class: bannerCls() },
        span({ class: "phone-banner-dot" }),
        a({ href, class: "update-banner-link" }, room.title),
        bannerChip("👥", `${room.count}/${room.max}`),
        room.joinedAt ? bannerChip("◷", liveClock(room.joinedAt)) : null,
        room.hand ? bannerChip("✋", String((Array.isArray(room.peers) ? room.peers : []).filter(p => p && p.hand && (Number(p.handSince) || 0) < (Number(room.handSince) || 0)).length + 1)) : null,
        bannerAct("/rooms/mute", room.muted ? i18n.phoneUnmute : i18n.phoneMute, "tribe-action-btn", { mute: room.muted ? 0 : 1 }),
        bannerAct("/rooms/hand", `✋ ${room.hand ? i18n.roomLowerHand : i18n.roomRaiseHand}`, room.hand ? "tribe-action-btn room-hand-btn-on" : "tribe-action-btn", { hand: room.hand ? 0 : 1 }),
        bannerAct("/rooms/leave", i18n.roomLeave, "tribe-action-btn danger-btn")
      );
    }
    return null;
  };
  const playerClock = (sec) => {
    const v = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(v / 3600);
    return h ? `${h}:${pad2(Math.floor((v % 3600) / 60))}:${pad2(v % 60)}` : `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`;
  };
  const buildPlayerBanner = () => {
    const st = config.public ? null : mediaPlayer.status();
    if (!st) return null;
    const step = mediaPlayer.SEEK_STEP;
    return div({ class: `${bannerCls()} player-banner` },
      span({ class: "phone-banner-dot" }),
      a({ href: st.href, class: "update-banner-link" }, st.title || i18n.playerFollow),
      bannerChip(st.paused ? "‖" : "◷", span(st.paused ? playerClock(st.position) : liveClock(Date.now() - st.position * 1000), st.duration > 0 ? ` / ${playerClock(st.duration)}` : "")),
      String(st.href || "").startsWith("/audios/") ? bannerAct("/player/previous", "⇤", "tribe-action-btn", {}, i18n.playerPrevious) : null,
      bannerAct("/player/seek", "«", "tribe-action-btn", { delta: -1 }, `−${step} s`),
      st.paused ? bannerAct("/player/resume", "▸", "tribe-action-btn", {}, i18n.playerResume) : bannerAct("/player/pause", "‖", "tribe-action-btn", {}, i18n.playerPause),
      bannerAct("/player/seek", "»", "tribe-action-btn", { delta: 1 }, `+${step} s`),
      String(st.href || "").startsWith("/audios/") ? bannerAct("/player/next", "⇥", "tribe-action-btn", {}, i18n.playerNext) : null,
      bannerAct("/player/stop", "×", "tribe-action-btn danger-btn", {}, i18n.playerStop)
    );
  };
  const buildPhoneBanner = () => {
    let here = '';
    try { here = (require('../models/typed_log').requestScope.getStore() || {}).path || ''; } catch (_) {}
    const st = phoneOn() ? sharedState.getPhoneCall() : null;
    if (!st) return buildRoomBanner(here);
    if (here === '/phone') return null;
    const nameOf = (id) => nameCache.get(id) || String(id).slice(0, 10);
    const name = st.group && Array.isArray(st.peers) ? st.peers.filter(p => p.phase !== 'gone').map(p => nameOf(p.id)).join(', ') : nameOf(st.peer);
    const shell = (text, ...rest) => div({ class: bannerCls() },
      span({ class: "phone-banner-dot" }),
      a({ href: "/phone", class: "update-banner-link" }, text),
      ...rest
    );
    if (st.dir === 'in' && st.phase === 'incoming') {
      return shell(`${name} ${i18n.phoneIsCalling}`,
        bannerAct("/phone/accept", i18n.phoneAnswer, "tribe-action-btn"),
        bannerAct("/phone/reject", i18n.phoneReject, "tribe-action-btn danger-btn"));
    }
    if (st.phase === 'calling') {
      return shell(`${st.reached ? i18n.phoneCalling : i18n.phoneConnecting} ${name}`,
        bannerChip("◷", liveClock(st.startedAt)),
        bannerAct("/phone/hangup", i18n.phoneHangup, "tribe-action-btn danger-btn"));
    }
    if (st.phase === 'recording' || st.phase === 'recorded') {
      return shell(`${i18n.phoneRecording} ${name}`,
        st.phase === 'recorded' ? null : bannerChip("●", liveClock(st.recordingStartedAt, { max: PHONE_PAM_MAX_MS })),
        bannerAct("/phone/pam/send", i18n.phoneSendPam, "tribe-action-btn"),
        bannerAct("/phone/pam/cancel", i18n.phoneCancel, "tribe-action-btn danger-btn"));
    }
    return shell(name,
      bannerChip("◷", liveClock(st.answeredAt || st.startedAt)),
      bannerAct("/phone/mute", st.muted ? i18n.phoneUnmute : i18n.phoneMute, "tribe-action-btn", { mute: st.muted ? 0 : 1 }),
      bannerAct("/phone/hangup", i18n.phoneHangup, "tribe-action-btn danger-btn"));
  };
  const buildEmergencyBanner = (compact) => {
    try {
      if (getConfig().modules.emergenciesMod !== "on") return null;
      const featured = sharedState.getFeaturedEmergency ? sharedState.getFeaturedEmergency() : null;
      if (!featured || !featured.id) return null;
      if (sharedState.getDismissedEmergency && sharedState.getDismissedEmergency() === featured.id) return null;
      return renderEmergencyBanner(featured, { compact });
    } catch (_) { return null; }
  };
  const uxMode = currentConfig.ux?.current === "ainav" ? "ainav" : currentConfig.ux?.current === "chats" ? "chats" : currentConfig.ux?.current === "feed" ? "feed" : currentConfig.ux?.current === "phone" ? "phone" : currentConfig.ux?.current === "rooms" ? "rooms" : "blocks";
  const themeLink = link({
    rel: "stylesheet",
    href: `/assets/themes/${theme}.css?v=${assetVersion()}`
  });
  const nodes = html(
    { lang: i18nBase[selectedLanguage] ? selectedLanguage : "en" },
    head(
      title(titlePrefix, " | Oasis"),
      link({ rel: "stylesheet", href: `/assets/styles/style.css?v=${assetVersion()}` }),
      themeLink,
      link({ rel: "stylesheet", href: `/assets/styles/mobile.css?v=${assetVersion()}`, media: "(max-width: 768px)" }),
      link({ rel: "icon", href: "/assets/images/favicon.svg" }),
      meta({ charset: "utf-8" }),
      meta({ name: "description", content: i18n.oasisDescription }),
      meta({
        name: "viewport",
        content: toAttributes({
          width: "device-width",
          "initial-scale": 1
        })
      })
    ),
    body(
      div(
        { class: uxMode === "ainav" ? "header ainav-only" : "header" },
        div(
          { class: "top-bar-left" },
          a(
            { class: "logo-icon", href: "/" },
            img({
              class: "logo-icon",
              src: "/assets/images/snh-oasis.jpg",
              alt: "Oasis Logo"
            })
          ),
          uxMode === "ainav" ? nav(
            ul(
              renderPhoneTopLink(),
              (() => {
                return inboxTopLink();
              })(),
              navLink({ href: "/settings", emoji: "⚙", text: i18n.settings }),
              navLink({ href: "/invites", emoji: "ꔮ", text: i18n.invites })
            )
          ) : nav(
            ul(
              mentionsTopLink(),
              renderPhoneTopLink(),
              (() => {
                return inboxTopLink();
              })(),
              (uxMode === "chats" || uxMode === "feed" || uxMode === "phone" || uxMode === "rooms")
                ? navLink({ href: "/settings", emoji: "⚙", text: i18n.settings })
                : null
            )
          )
        ),
        (() => {
          const aiNavOn = getConfig().modules.aiNavMod === 'on';
          if (!aiNavOn && uxMode !== 'ainav') return null;
          return div(
            { class: uxMode === 'ainav' ? "top-bar-center top-bar-center-ainav" : "top-bar-center" },
            div({ class: 'ai-ask-row' },
            nav({ class: 'ai-ask-nav' }, ul(...(renderAILink() || []))),
            form(
              { method: 'POST', action: '/ai/ask', class: 'ai-ask-form' },
              input({
                type: 'text',
                name: 'q',
                class: 'ai-ask-input',
                placeholder: i18n.aiNavPlaceholder || 'Where do you want to go?',
                autocomplete: 'off',
                maxlength: '300',
                autofocus: uxMode === 'ainav' ? 'autofocus' : undefined
              }),
              button({ type: 'submit', class: 'ai-ask-btn' }, '➤')
            ),
            buildAiSuggestion(true)
            ),
            buildEmergencyBanner(true)
          );
        })(),
        uxMode === "ainav" ? div(
          { class: "top-bar-right" },
          nav(
            ul(
              navLink({ href: "/activity", emoji: "ꔙ", text: i18n.activityTitle }),
              navLink({ href: "/graphos", emoji: "ꕢ", text: i18n.graphos }),
              navLink({ href: "/peers", emoji: "⧖", text: i18n.peers })
            )
          )
        ) : (uxMode === "chats" || uxMode === "feed" || uxMode === "phone" || uxMode === "rooms") ? div(
          { class: "top-bar-right" },
          nav(
            ul(
              navLink({ href: "/activity", emoji: "ꔙ", text: i18n.activityTitle }),
              renderTrendingLink(),
              navLink({ href: "/search", emoji: "⌕", text: i18n.searchTitle })
            )
          )
        ) : div(
          { class: "top-bar-right" },
          nav(
            ul(
              ...((getConfig().modules.aiNavMod === 'on' || uxMode === 'ainav') ? [] : (renderAILink() || [])),
              matchesTopLink(),
              renderTagsLink(),
              navLink({ href: "/search", emoji: "⌕", text: i18n.searchTitle })
            )
          )
        )
      ),
      (() => {
        const updateInfo = (() => { try { return require('../backend/updater').readUpdateInfo(); } catch (_) { return null; } })();
        if (updateInfo) {
          return div(
            { class: "update-banner" },
            span({ class: "update-banner-icon" }, "🛠️"),
            span({ class: "update-banner-text" }, updateInfo.version ? `${String(i18n.updateBannerText).replace(/[.。।!]\s*$/, '')}: v${updateInfo.version}` : i18n.updateBannerText),
            a({ href: "/settings", class: "update-banner-link" }, i18n.updateBannerAction)
          );
        }
        return null;
      })(),
      (() => {
        try {
          const onboarding = require('../models/onboarding_model');
          if (!onboarding.bannerVisible(config && config.path)) return null;
          let here = '';
          try { here = (require('../models/typed_log').requestScope.getStore() || {}).path || ''; } catch (_) {}
          if (here === '/welcome' || here.startsWith('/welcome/')) return null;
          return div(
            { class: "update-banner welcome-banner" },
            span({ class: "update-banner-icon" }, "🌴"),
            span({ class: "update-banner-text" }, i18n.welcomeBannerText),
            a({ href: "/welcome", class: "create-button welcome-banner-start" }, i18n.welcomeBannerAction),
            form(
              { method: "POST", action: "/welcome/dismiss", class: "welcome-banner-close" },
              button({ type: "submit", class: "welcome-banner-close-btn" }, "✕")
            )
          );
        } catch (_) {
          return null;
        }
      })(),
      (getConfig().modules.aiNavMod === 'on' || uxMode === 'ainav') ? null : buildAiSuggestion(false),
      buildPhoneBanner(),
      buildPlayerBanner(),
      buildEmergencyBanner(false),
      renderFeedBanner(readFeedStatus()),
      div(
        { class: uxMode === "ainav" ? "main-content ainav-only" : uxMode === "chats" ? "main-content chatsux-only" : uxMode === "feed" || uxMode === "phone" || uxMode === "rooms" ? "main-content chatsux-only" : "main-content" },
        uxMode !== "blocks" ? null : div(
          { class: "sidebar-left" },
          nav(
            ul(
              navGroup(
                {
                  id: "personal",
                  emoji: "⚉",
                  title: i18n.menuPersonal
                },
                navLink({
                  href: "/profile",
                  emoji: "⚉",
                  text: i18n.profile
                }),
                navLink({
                  href: "/cv",
                  emoji: "ꕛ",
                  text: i18n.cvTitle
                }),
                renderAgendaLink(),
                renderFavoritesLink(),
                renderLogsLink(),
                renderInvitesLink(),
                navLink({
                  href: "/modules",
                  emoji: "ꗣ",
                  text: i18n.modules
                }),
                navLink({
                  href: "/settings",
                  emoji: "⚙",
                  text: i18n.settings
                })
              ),
              navGroup(
                {
                  id: "governance",
                  emoji: "⚖",
                  title: i18n.menuGovernance
                },
                navLink({
                  href: "/inhabitants",
                  emoji: "ꖘ",
                  text: i18n.inhabitantsLabel
                }),
                renderEmergenciesLink(),
                renderSchoolLink(),
                renderParliamentLink(),
                renderCourtsLink(),
                renderLarpLink(),
                renderTribesLink()
              ),
              navGroup(
                {
                  id: "economy",
                  emoji: "¤",
                  title: i18n.menuEconomy
                },
                renderWalletLink(),
                renderBankingLink(),
                renderMarketLink(),
                renderShopsLink(),
                renderIndustryLink(),
                renderLogisticsLink(),
                renderProjectsLink(),
                renderJobsLink(),
                renderHousingLink(),
                renderTransfersLink()
              ),
              navGroup(
                {
                  id: "office",
                  emoji: "⌂",
                  title: i18n.menuOffice
                },
                renderVotationsLink(),
                renderPollsLink(),
                renderCampaignsLink(),
                renderEventsLink(),
                renderCalendarsLink(),
                renderTasksLink(),
                renderReportsLink(),
                renderMailingLink()
              ),
              navGroup(
                {
                  id: "tools",
                  emoji: "⚒",
                  title: i18n.menuTools
                },
                navLink({ href: "/changelog", emoji: "☷", text: i18n.changelogTitle }),
                navLink({
                  href: "/blockexplorer",
                  emoji: "ꖸ",
                  text: i18n.blockchain
                }),
                renderGraphosLink(),
                navLink({ href: "/peers", emoji: "⧖", text: i18n.peers }),
                renderDevLink(),
                renderCipherLink(),
                navLink({
                  href: "/stats",
                  emoji: "ꕷ",
                  text: i18n.statistics
                }),
                renderBackupLink()
              )
            )
          )
        ),
        uxMode !== "blocks" ? null : div(
          { class: "sidebar-right" },
          nav(
            ul(
              navGroup(
                {
                  id: "network",
                  emoji: "☍",
                  title: i18n.menuNetwork
                },
                navLink({
                  href: "/activity",
                  emoji: "ꔙ",
                  text: i18n.activityTitle
                }),
                renderTrendingLink(),
                renderOpinionsLink(),
                renderFeedLink(),
                renderBlogsLink(),
                renderForumLink(),
                renderPadsLink(),
                renderWikiLink(),
                renderMapsLink(),
                renderRoomsLink(),
                renderChatsLink()
              ),
              navGroup(
                {
                  id: "media",
                  emoji: "▤",
                  title: i18n.menuMedia
                },
                renderAudiosLink(),
                renderBookmarksLink(),
                renderDocsLink(),
                renderImagesLink(),
                renderFilesLink(),
                renderTorrentsLink(),
                renderVideosLink(),
                renderPodcastsLink()
              ),
              navGroup(
                {
                  id: "creative",
                  emoji: "✎",
                  title: i18n.menuCreative
                },
                renderGamesLink(),
                renderPixeliaLink(),
                renderMelodyLink()
              ),
              navGroup(
                {
                  id: "fediverse",
                  emoji: "⌬",
                  title: i18n.fediverse
                },
                renderMastodonLink()
              )
            )
          )
        ),
        main({ id: "content", class: "main-column" }, elements, renderListPager(), renderLogWindowNote(), renderMobileCounters())
      ),
    renderFooter()
    )
  );
  const kept = scope && scope.keepFields && typeof scope.keepFields === 'object' ? scope.keepFields : null;
  const page = kept ? restoreFormFields(nodes.outerHTML, kept) : nodes.outerHTML;
  const refresh = page.includes('<textarea') ? 0 : playerEndRefresh();
  return doctypeString + (refresh ? page.replace('</head>', `<meta http-equiv="refresh" content="${refresh}"></head>`) : page);
};

exports.template = template;

exports.ainavHomeView = ({ recentTags = [] } = {}) => {
  const currentConfig = getConfig();
  const theme = currentConfig.themes.current || "Dark-SNH";
  const placeholder = i18n.aiNavPlaceholder || 'Where do you want to go?';
  const nodes = html(
    { lang: i18nBase[selectedLanguage] ? selectedLanguage : "en" },
    head(
      title(placeholder, " | Oasis"),
      link({ rel: "stylesheet", href: `/assets/styles/style.css?v=${assetVersion()}` }),
      link({ rel: "stylesheet", href: `/assets/themes/${theme}.css?v=${assetVersion()}` }),
      link({ rel: "stylesheet", href: `/assets/styles/mobile.css?v=${assetVersion()}`, media: "(max-width: 768px)" }),
      link({ rel: "icon", href: "/assets/images/favicon.svg" }),
      meta({ charset: "utf-8" }),
      meta({ name: "description", content: i18n.oasisDescription }),
      meta({ name: "viewport", content: toAttributes({ width: "device-width", "initial-scale": 1 }) })
    ),
    body(
      div({ class: "ainav-landing" },
        div({ class: "ainav-landing-topbar" },
          div({ class: "top-bar-left" },
            nav(
              ul(
                renderPhoneTopLink(),
                (() => {
                  return inboxTopLink();
                })(),
                navLink({ href: "/settings", emoji: "⚙", text: i18n.settings }),
                navLink({ href: "/invites", emoji: "ꔮ", text: i18n.invites })
              )
            )
          ),
          div({ class: "top-bar-right" },
            nav(
              ul(
                navLink({ href: "/activity", emoji: "ꔙ", text: i18n.activityTitle }),
                navLink({ href: "/graphos", emoji: "ꕢ", text: i18n.graphos }),
                navLink({ href: "/peers", emoji: "⧖", text: i18n.peers })
              )
            )
          )
        ),
        div({ class: "ainav-landing-center" },
          a({ href: "/", class: "ainav-landing-logo" },
            img({ src: "/assets/images/snh-oasis.jpg", alt: "Oasis Logo" })
          ),
          (() => {
            const myId = (config.keys && config.keys.id) ? config.keys.id : '';
            return myId ? div({ class: 'ainav-landing-myid oasis-footer-center' },
              a({ href: '/profile' }, span(myId))
            ) : null;
          })(),
          form(
            { method: 'POST', action: '/ai/ask', class: 'ai-ask-form ainav-landing-form' },
            input({
              type: 'text',
              name: 'q',
              class: 'ai-ask-input ainav-landing-input',
              placeholder,
              autocomplete: 'off',
              maxlength: '300',
              autofocus: 'autofocus'
            }),
            button({ type: 'submit', class: 'ai-ask-btn ainav-landing-btn' }, '➤')
          ),
          Array.isArray(recentTags) && recentTags.length
            ? div({ class: 'ainav-landing-tags' },
                recentTags.map(t => a({
                  href: `/search?query=%23${encodeURIComponent(t.name || t)}`,
                  class: 'tag-link'
                }, `#${t.name || t}`))
              )
            : null
        )
      )
    )
  );
  return doctypeString + nodes.outerHTML;
};

exports.tribeAccessDeniedView = (tribe) => {
  const tribeName = tribe && !tribe.isAnonymous ? tribe.title : "";
  return template(
    i18n.tribeContentAccessDenied,
    div({ class: "div-center" },
      h2(i18n.tribeContentAccessDenied),
      p(i18n.tribeContentAccessDeniedMsg),
      tribeName ? p({ class: "tribe-access-name" }, tribeName) : null,
      div({ class: "visit-btn-centered" },
        a({ href: "/tribes", class: "filter-btn" }, i18n.tribeViewTribes)
      )
    )
  );
};

const thread = (messages, spreadMap = null) => {
  let lookingForTarget = true;
  let shallowest = Infinity;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const depth = lodash.get(msg, "value.meta.thread.depth", 0);

    if (lookingForTarget) {
      const isThreadTarget = Boolean(
        lodash.get(msg, "value.meta.thread.target", false)
      );
      if (isThreadTarget) {
        lookingForTarget = false;
      }
    } else {
      if (depth < shallowest) {
        lodash.set(msg, "value.meta.thread.ancestorOfTarget", true);
        shallowest = depth;
      }
    }
  }

  const getSpread = (key) => (spreadMap instanceof Map ? spreadMap.get(key) : null) || null;

  const msgList = [];
  for (let i = 0; i < messages.length; i++) {
    const j = i + 1;
    const currentMsg = messages[i];
    const nextMsg = messages[j];

    const depth = (msg) => {
      if (msg === undefined) return 0;
      return lodash.get(msg, "value.meta.thread.depth", 0);
    };

    msgList.push(post({ msg: currentMsg, spreadInfo: getSpread(currentMsg.key) }));

    if (depth(currentMsg) < depth(nextMsg)) {
      const isAncestor = Boolean(
        lodash.get(currentMsg, "value.meta.thread.ancestorOfTarget", false)
      );
      const isBlocked = Boolean(nextMsg.value.meta.blocking);
      const nextAuthor = lodash.get(nextMsg, "value.meta.author.name") || (typeof nextMsg?.value?.author === "string" ? (nextMsg.value.author.startsWith("@") ? nextMsg.value.author.slice(1) : nextMsg.value.author) : "Anonymous");
      const nextSnippet = postSnippet(
        lodash.has(nextMsg, "value.content.contentWarning")
          ? lodash.get(nextMsg, "value.content.contentWarning")
          : lodash.get(nextMsg, "value.content.text")
      );
      msgList.push(
        details(
          isAncestor ? { open: true } : {},
          summary(
            isBlocked
              ? i18n.relationshipBlockingPost
              : `${nextAuthor}: ${nextSnippet}`
          )
        )
      );
    } else if (depth(currentMsg) > depth(nextMsg)) {
      const diffDepth = depth(currentMsg) - depth(nextMsg);
    }
  }

  return div({ class: "thread-container" }, ...msgList);
};

const postSnippet = (text) => {
  const max = 40;

  text = text.trim().split("\n", 3).join("\n");
  text = text.replace(/_|`|\*|#|^\[@.*?]|\[|]|\(\S*?\)/g, "").trim();
  text = text.replace(/:$/, "");
  text = text.trim().split("\n", 1)[0].trim();

  if (text.length > max) {
    text = text.substring(0, max - 1) + "…";
  }

  return text;
};

const continueThreadComponent = (thread, isComment) => {
  const encoded = {
    next: encodeURIComponent(thread[THREAD_PREVIEW_LENGTH + 1].key),
    parent: encodeURIComponent(thread[0].key),
  };
  const left = thread.length - (THREAD_PREVIEW_LENGTH + 1);
  let continueLink;
  if (isComment == false) {
    continueLink = `/thread/${encoded.parent}#${encoded.next}`;
    return a(
      { href: continueLink },
      i18n.continueReading, ` ${left} `, i18n.moreComments+`${left === 1 ? "" : "s"}`
    );
  } else {
    continueLink = `/thread/${encoded.parent}`;
    return a({ href: continueLink }, i18n.readThread);
  }
};

const postAside = ({ key, value }) => {
  const thread = value.meta.thread;
  if (thread == null) return null;

  const isComment = value.meta.postType === "comment";

  let postsToShow;
  if (isComment) {
    const commentPosition = thread.findIndex((msg) => msg.key === key);
    postsToShow = thread.slice(
      commentPosition + 1,
      Math.min(commentPosition + (THREAD_PREVIEW_LENGTH + 1), thread.length)
    );
  } else {
    postsToShow = thread.slice(
      1,
      Math.min(thread.length, THREAD_PREVIEW_LENGTH + 1)
    );
  }

  const fragments = postsToShow.map((p) => post({ msg: p }));

  if (thread.length > THREAD_PREVIEW_LENGTH + 1) {
    fragments.push(section(continueThreadComponent(thread, isComment)));
  }

  return fragments;
};

const post = ({ msg, aside = false, preview = false, spreadInfo = null }) => {
    const encoded = {
        key: encodeURIComponent(msg.key),
        parent: encodeURIComponent(msg.value?.content?.root),
    };

    const url = {
        link: `/thread/${encoded.key}#${encoded.key}`,
        parent: `/thread/${encoded.parent}#${encoded.parent}`,
        json: `/json/${encoded.key}`,
        subtopic: `/subtopic/${encoded.key}`,
        comment: `/comment/${encoded.key}`,
    };

    const isPrivate = Boolean(msg.value?.meta?.private);
    const isBlocked = Boolean(msg.value?.meta?.blocking);
    const isRoot = msg.value?.content?.root == null;
    const isFork = msg.value?.meta?.postType === "subtopic";
    const hasContentWarning = typeof msg.value?.content?.contentWarning === "string";
    const isThreadTarget = Boolean(lodash.get(msg, "value.meta.thread.target", false));

    const authorIdForName = msg.value?.author; 
    const name =
      msg.value?.meta?.author?.name ||
      (typeof authorIdForName === "string"
        ? (authorIdForName.startsWith("@") ? authorIdForName.slice(1) : authorIdForName)
        : "Anonymous");

    const content = msg.value?.content || {};
    const contentType = String(content.type || "");

    const THREAD_ENTITY_TYPES = new Set([
        'bookmark',
        'image',
        'audio',
        'video',
        'document',
        'votes',
        'event',
        'task',
        'report',
        'market',
        'project',
        'job'
    ]);

    const safeUpper = (s) => String(s || '').toUpperCase();
    const safeStr = (v) => (v == null ? '' : String(v));
    const isMsgId = (s) => typeof s === 'string' && (s.startsWith('%') || s.startsWith('&') || s.startsWith('@'));
    const fmtDate = (v) => {
        if (!v) return '';
        const m = moment(v, moment.ISO_8601, true);
        if (m.isValid()) return m.format('YYYY-MM-DD HH:mm:ss');
        const n = typeof v === 'number' ? v : Date.parse(v);
        if (!Number.isFinite(n)) return '';
        return moment(n).format('YYYY-MM-DD HH:mm:ss');
    };

    const renderField = (labelText, valueNode) => {
        if (valueNode == null || valueNode === '') return null;
        return div(
            { class: 'card-field' },
            span({ class: 'card-label' }, labelText),
            span({ class: 'card-value' }, valueNode)
        );
    };

    const entityTitle = (c) => {
        const t = String(c.type || '').toLowerCase();
        if (t === 'votes') return safeStr(c.question || c.title);
        if (t === 'bookmark') return safeStr(c.title || c.name || c.url);
        if (t === 'market') return safeStr(c.title);
        if (t === 'project') return safeStr(c.title);
        if (t === 'job') return safeStr(c.title);
        if (t === 'report') return safeStr(c.title);
        if (t === 'task') return safeStr(c.title);
        if (t === 'event') return safeStr(c.title);
        if (t === 'document') return safeStr(c.title || c.name || c.url);
        if (t === 'image' || t === 'audio' || t === 'video') return safeStr(c.title || c.name || c.url);
        return safeStr(c.title || c.name || c.question || c.url);
    };

    const renderEntityRoot = (c) => {
        const t = String(c.type || '').toLowerCase();
        const header = `[${safeUpper(t)}]`;
        const titleText = entityTitle(c) || '(sin título)';

        const nodes = [];
        nodes.push(
            div(
                { class: 'card-field card-field-mb' },
                span({ class: 'card-label card-label-bold' }, header),
                span({ class: 'card-value card-value-bold' }, titleText)
            )
        );

        if (t === 'votes') {
            const status = safeStr(c.status);
            const deadline = fmtDate(c.deadline);
            const totalVotes = (typeof c.totalVotes !== 'undefined') ? safeStr(c.totalVotes) : '';
            const tags = Array.isArray(c.tags) ? c.tags.filter(Boolean) : [];

            const f1 = renderField((i18n.status || 'Status') + ':', status ? safeUpper(status) : '');
            const f2 = renderField((i18n.deadline || 'Deadline') + ':', deadline);
            const f3 = renderField((i18n.voteTotalVotes || 'Total votes') + ':', totalVotes);
            if (f1) nodes.push(f1);
            if (f2) nodes.push(f2);
            if (f3) nodes.push(f3);

            if (tags.length) {
                nodes.push(
                    div(
                        { class: 'card-tags card-tags-mt' },
                        ...tags.map(tag =>
                            a(
                                { href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' },
                                `#${tag}`
                            )
                        )
                    )
                );
            }
        } else if (t === 'report') {
            const status = safeStr(c.status);
            const severity = safeStr(c.severity);
            const r1 = renderField((i18n.status || 'Status') + ':', status ? safeUpper(status) : '');
            const r2 = renderField((i18n.severity || 'Severity') + ':', severity ? safeUpper(severity) : '');
            if (r1) nodes.push(r1);
            if (r2) nodes.push(r2);
        } else if (t === 'task') {
            const status = safeStr(c.status);
            const priority = safeStr(c.priority);
            const startTime = fmtDate(c.startTime);
            const endTime = fmtDate(c.endTime);

            const r1 = renderField((i18n.status || 'Status') + ':', status ? safeUpper(status) : '');
            const r2 = renderField((i18n.priority || 'Priority') + ':', priority ? safeUpper(priority) : '');
            const r3 = renderField((i18n.taskStartTimeLabel || 'Start') + ':', startTime);
            const r4 = renderField((i18n.taskEndTimeLabel || 'End') + ':', endTime);

            if (r1) nodes.push(r1);
            if (r2) nodes.push(r2);
            if (r3) nodes.push(r3);
            if (r4) nodes.push(r4);
        } else if (t === 'event') {
            const dateStr = fmtDate(c.date);
            const location = safeStr(c.location);
            const price = (typeof c.price !== 'undefined') ? safeStr(c.price) : '';

            const r1 = renderField((i18n.date || 'Date') + ':', dateStr);
            const r2 = renderField((i18n.location || 'Location') + ':', location);
            const r3 = renderField((i18n.price || 'Price') + ':', price ? `${price} ECO` : '');

            if (r1) nodes.push(r1);
            if (r2) nodes.push(r2);
            if (r3) nodes.push(r3);
        } else if (t === 'bookmark') {
            const u = safeStr(c.url);
            if (u) {
                nodes.push(
                    renderField((i18n.url || 'URL') + ':', a({ href: safeExternalHref(u), target: '_blank', rel: 'noopener noreferrer' }, u))
                );
            }
        } else if (t === 'image') {
            const u = safeStr(c.url);
            if (u && isMsgId(u)) {
                nodes.push(
                    div({ class: 'card-field card-field-mt' },
                        img({ loading: 'lazy', src: `/blob/${encodeURIComponent(u)}`, class: 'feed-image img-content' })
                    )
                );
            }
        } else if (t === 'audio') {
            const u = safeStr(c.url);
            if (u && isMsgId(u)) {
                nodes.push(
                    div({ class: 'card-field card-field-mt' },
                        audioHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(u)}` })
                    )
                );
            }
        } else if (t === 'video') {
            const u = safeStr(c.url);
            if (u && isMsgId(u)) {
                nodes.push(
                    div({ class: 'card-field card-field-mt' },
                        videoHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(u)}`, preload: 'metadata' })
                    )
                );
            }
	} else if (t === 'document') {
	  const u = safeStr(c.url);
	  if (u && isMsgId(u)) {
	    const safeId = String(msg.key || u).replace(/[^a-zA-Z0-9_-]/g, '');
	    nodes.push(
	      div({ class: 'card-field card-field-mt' },
		renderPdfDocument(`/blob/${encodeURIComponent(u)}`, { title: c.title || safeId })
	      )
	    );
	  }

        } else if (t === 'market') {
            const status = safeStr(c.status);
            const price = (typeof c.price !== 'undefined') ? safeStr(c.price) : '';
            const r1 = renderField((i18n.status || 'Status') + ':', status ? safeUpper(status) : '');
            const r2 = renderField((i18n.price || 'Price') + ':', price ? `${price} ECO` : '');
            if (r1) nodes.push(r1);
            if (r2) nodes.push(r2);
        } else if (t === 'project') {
            const status = safeStr(c.status);
            const r1 = renderField((i18n.status || 'Status') + ':', status ? safeUpper(status) : '');
            if (r1) nodes.push(r1);
        } else if (t === 'job') {
            const status = safeStr(c.status);
            const location = safeStr(c.location);
            const salary = (typeof c.salary !== 'undefined') ? safeStr(c.salary) : '';

            const r1 = renderField((i18n.status || 'Status') + ':', status ? safeUpper(status) : '');
            const r2 = renderField((i18n.jobLocation || 'Location') + ':', location ? safeUpper(location) : '');
            const r3 = renderField((i18n.jobSalary || 'Salary') + ':', salary ? `${salary} ECO` : '');

            if (r1) nodes.push(r1);
            if (r2) nodes.push(r2);
            if (r3) nodes.push(r3);
        }

        return article({ class: 'content' }, ...nodes.filter(Boolean));
    };

    const rawText = content.text || "";
    const emptyContent = "<p>undefined</p>\n";

    const isProbablyHtml =
        typeof rawText === "string" &&
        /<\/?[a-z][\s\S]*>/i.test(rawText.trim());

    let articleElement;

    if (contentType !== 'post' && contentType !== 'blog' && THREAD_ENTITY_TYPES.has(contentType)) {
        articleElement = renderEntityRoot(content);
    } else if (rawText === emptyContent) {
        articleElement = article(
            { class: "content" },
            div(
                { class: "card-field card-field-mb" },
                span({ class: "card-label" }, (i18n.invalidPost || 'Invalid content') + ':'),
                span({ class: "card-value" }, (i18n.invalidPostHint || 'This message has invalid/empty text.'))
            ),
            details(
                summary(i18n.viewJson || 'View JSON'),
                pre({
                    [RAW_HTML]: highlightJs.highlight(
                        JSON.stringify(msg, null, 2),
                        { language: "json", ignoreIllegals: true }
                    ).value,
                })
            )
        );
    } else if (isProbablyHtml) {
        let html = rawText;
        if (!/<a\b[^>]*>/i.test(html)) {
            html = html.replace(
                /(https?:\/\/[^\s<]+)/g,
                (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`
            );
        }
        articleElement = article({ class: "content", [RAW_HTML]: sanitizeHtml(html) });
    } else {
        articleElement = article(
            { class: "content" },
            p({ class: "post-text" }, ...renderStyledText(rawText))
        );
    }
    const postTags = String(content.type || '') === 'post' && Array.isArray(content.tags) ? content.tags.filter(Boolean) : [];
    if (postTags.length) {
        articleElement = div(
            articleElement,
            div({ class: 'card-tags card-tags-mt' },
                ...postTags.map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link' }, `#${tag}`))
            )
        );
    }

    if (preview) {
        return section(
            { id: msg.key, class: "post-preview" },
            hasContentWarning
                ? details(summary(msg.value?.content?.contentWarning), articleElement)
                : articleElement
        );
    }

    const ts_received = msg.value?.meta?.timestamp?.received;
    const iso =
        (ts_received && ts_received.iso8601) ||
        (typeof msg.value?.timestamp === 'number' ? new Date(msg.value.timestamp).toISOString() : null) ||
        (content.createdAt ? new Date(content.createdAt).toISOString() : null);

    if (!iso || !moment(iso, moment.ISO_8601, true).isValid()) {
        return null;
    }

    const fallbackVoted = !!msg.value?.meta?.voted;
    const fallbackVoteCount = msg.value?.meta?.votes?.length || 0;
    const spreadInfoObj = (spreadInfo && typeof spreadInfo === 'object') ? spreadInfo : null;
    const spreadCount = spreadInfoObj && typeof spreadInfoObj.count === 'number'
        ? spreadInfoObj.count
        : fallbackVoteCount;
    const alreadySpread = spreadInfoObj && typeof spreadInfoObj.alreadySpread === 'boolean'
        ? spreadInfoObj.alreadySpread
        : fallbackVoted;

    const messageClasses = ["post", "trending-card", "post-card"];
    const recps = [];

    const addRecps = (recpsInfo) => {
        recpsInfo.forEach((recp) => {
            recps.push(
                a(
                    { href: `/author/${encodeURIComponent(recp.feedId)}`, class: "card-byline-avatar" },
                    img({ src: recp.avatarUrl, alt: "" })
                )
            );
        });
    };

    if (isPrivate) {
        messageClasses.push("private");
        addRecps(msg.value?.meta?.recpsInfo || []);
    }

    if (isThreadTarget) {
        messageClasses.push("thread-target");
    }

    if (authorIdForName && config.keys && String(authorIdForName) === String(config.keys.id)) {
        messageClasses.push("own-content");
    }

    if (isBlocked) {
        messageClasses.push("blocked");
        return section(
            {
                id: msg.key,
                class: messageClasses.join(" "),
            },
            i18n.relationshipBlockingPost
        );
    }

    const articleContent = article(
        { class: "content" },
        hasContentWarning ? div({ class: "post-subject" }, msg.value?.content?.contentWarning) : null,
        articleElement
    );

    const { renderScopeChip } = require('./clearnet_view');
    const postKind = msg.value?.meta?.postType;
    const kindLabel = postKind === "comment" ? i18n.typeComment : postKind === "subtopic" ? i18n.subtopic : postKind === "post" ? i18n.typePost : null;
    const cardTitle = (hasContentWarning && msg.value.content.contentWarning)
        || (THREAD_ENTITY_TYPES.has(contentType) ? entityTitle(content) : "")
        || (typeof rawText === "string" ? postSnippet(rawText) : "");

    const fragment = div(
        {
            id: msg.key,
            class: messageClasses.join(" "),
        },
        renderCardTop(msg.key, url.link, {
            author: authorIdForName,
            authorName: msg.value?.meta?.author?.name,
            date: iso,
            chips: [div({ class: "card-chips-row" },
                renderScopeChip({ scope: isPrivate ? 'private' : 'oasis' }, i18n),
                kindLabel ? renderStateChip("whole", "◇", String(kindLabel).toUpperCase(), "kind") : null,
                isPrivate ? renderStateChip("encrypted", "🔒", i18n.encryptedChipLabel || "E2E") : null,
                ...(isPrivate ? recps : [])
            )],
            spread: { count: spreadCount, alreadySpread },
            reportTitle: cardTitle
        }),
        articleContent,
        renderCardMetaRow(
            a({ href: url.comment, class: "comments-summary-link" }, span({ class: "comments-summary-icon" }, "✑"), span(i18n.comment)),
            isPrivate || isRoot || isFork
                ? null
                : a({ href: url.subtopic, class: "comments-summary-link" }, span(i18n.subtopic)),
            renderShareButton(msg.key, url.link, cardTitle),
            renderSupportButton(msg.value && msg.value.author, null, hereAt(msg.key))
        )
    );

    const threadSeparator = [br()];

    if (aside) {
        return [fragment, postAside(msg), isRoot ? threadSeparator : null];
    } else {
        return fragment;
    }
};

exports.editProfileView = ({ name, description, visibilityPrefs = {}, feedId = '', baseUrl = '', gpgFingerprint = '' }) => {
  const prefs = {
    activity: visibilityPrefs.activity === true,
    device:   visibilityPrefs.device   === true,
    karma:    visibilityPrefs.karma !== false,
    ubi:      visibilityPrefs.ubi      === true,
    wallet:   visibilityPrefs.wallet   === true,
    clearnetShops:     visibilityPrefs.clearnetShops     === true,
    clearnetSchool:    visibilityPrefs.clearnetSchool    === true,
    clearnetJobs:      visibilityPrefs.clearnetJobs      === true,
    clearnetEvents:    visibilityPrefs.clearnetEvents    === true,
    clearnetProjects:  visibilityPrefs.clearnetProjects  === true,
    clearnetPosts:     visibilityPrefs.clearnetPosts     === true,
    clearnetAudios:    visibilityPrefs.clearnetAudios    === true,
    clearnetVideos:    visibilityPrefs.clearnetVideos    === true,
    clearnetImages:    visibilityPrefs.clearnetImages    === true,
    clearnetDocuments: visibilityPrefs.clearnetDocuments === true,
    clearnetTorrents:  visibilityPrefs.clearnetTorrents  === true,
    clearnetFiles:     visibilityPrefs.clearnetFiles     === true,
    clearnetBookmarks: visibilityPrefs.clearnetBookmarks === true,
    clearnetPodcasts:  visibilityPrefs.clearnetPodcasts  === true,
    clearnetMarket:    visibilityPrefs.clearnetMarket    === true,
    clearnetFeed:      visibilityPrefs.clearnetFeed      === true,
    clearnetWiki:      visibilityPrefs.clearnetWiki      === true,
    profileShops:      visibilityPrefs.profileShops      === true,
    profileJobs:       visibilityPrefs.profileJobs       === true,
    profileEvents:     visibilityPrefs.profileEvents     === true,
    profileProjects:   visibilityPrefs.profileProjects   === true,
    profilePosts:      visibilityPrefs.profilePosts      === true,
    profileAudios:     visibilityPrefs.profileAudios     === true,
    profileVideos:     visibilityPrefs.profileVideos     === true,
    profileImages:     visibilityPrefs.profileImages     === true,
    profileDocuments:  visibilityPrefs.profileDocuments  === true,
    profileTorrents:   visibilityPrefs.profileTorrents   === true,
    profileFiles:      visibilityPrefs.profileFiles      === true,
    profileBookmarks:  visibilityPrefs.profileBookmarks  === true,
    profilePodcasts:   visibilityPrefs.profilePodcasts   === true,
    profileSchool:     visibilityPrefs.profileSchool     === true,
    profileMarket:     visibilityPrefs.profileMarket     === true,
    profileFeed:       visibilityPrefs.profileFeed       === true,
    profileWiki:       visibilityPrefs.profileWiki       === true,
    ecoTax:            visibilityPrefs.ecoTax            !== false,
    larpSign:          visibilityPrefs.larpSign          === true,
    fediverse:         visibilityPrefs.fediverse         === true,
    gpg:               visibilityPrefs.gpg               === true
  };
  const fediverseHandleValue = typeof visibilityPrefs.fediverseHandle === 'string' ? visibilityPrefs.fediverseHandle : '';
  prefs.clearnet = prefs.clearnetShops || prefs.clearnetSchool || prefs.clearnetJobs || prefs.clearnetEvents || prefs.clearnetProjects || prefs.clearnetPosts || prefs.clearnetAudios || prefs.clearnetVideos || prefs.clearnetImages || prefs.clearnetDocuments || prefs.clearnetTorrents || prefs.clearnetFiles || prefs.clearnetBookmarks || prefs.clearnetPodcasts || prefs.clearnetMarket || prefs.clearnetFeed || prefs.clearnetWiki;
  const pillRows = (entries) => div({ class: "pref-pill-row" },
    ...entries.slice().sort((a, b) => String(a[1]).localeCompare(String(b[1]))).map(([key, labelText]) => togglePill(key, labelText))
  );
  const togglePill = (key, labelText, forced = false) => label(
    { class: forced ? "pref-pill pref-pill-forced" : "pref-pill", for: forced ? undefined : `vis_${key}`, title: forced ? (i18n.profileDeviceLockedHint || 'On mobile devices this sensor is mandatory and cannot be disabled.') : undefined },
    forced ? input({ type: "hidden", name: `vis_${key}`, value: "1" }) : null,
    input({ type: "checkbox", name: forced ? undefined : `vis_${key}`, id: forced ? undefined : `vis_${key}`, value: "1", class: "pref-pill-input", checked: (forced || prefs[key]) ? "checked" : undefined, disabled: forced ? "disabled" : undefined }),
    span({ class: "pref-pill-label" }, labelText)
  );
  return template(
    i18n.editProfile,
    section(
      h1(i18n.editProfile),
      p(i18n.editProfileDescription),
      form(
        {
          action: "/profile/edit",
          method: "POST",
          enctype: "multipart/form-data",
        },
        label(
          i18n.profileImage,
          br(),
          input({ type: "file", name: "image", accept: "image/*" })
        ),
        br(),br(),
        label(i18n.profileName,
        br(),
        input({ name: "name", value: name })),
        br(),br(),
        label(
          i18n.profileDescription,
          br(),
          textarea(
            {
              autofocus: true,
              name: "description",
              rows: "6",
            },
            description
          )
        ),
        br(),br(),
        label(
          i18n.profileGpgKey || 'GPG Public Key (.asc)',
          br(),
          div({ class: "gpg-edit-row" },
            input({ type: "file", name: "gpgKey", accept: ".asc,.gpg,.pgp,application/pgp-keys,text/plain" }),
            gpgFingerprint
              ? button({ type: "submit", formaction: "/profile/gpg/remove", attrs: { formenctype: "application/x-www-form-urlencoded", formnovalidate: "formnovalidate" }, class: "gpg-remove-btn" },
                  (i18n.profileGpgRemove || 'Remove') + ' (' + String(gpgFingerprint).slice(-8).toUpperCase() + ')'
                )
              : null
          )
        ),
        br(), br(),
        div({ class: "prefs-card" },
          div({ class: "tags-header module-header-line" },
            h2(i18n.profileContentSectionTitle || 'Avatar Content'),
            p({ class: "prefs-help" }, i18n.profileContentHelp || 'Choose which of your modules will be displayed on your profile.')
          ),
          pillRows([
              ['profileAudios',    i18n.profileClearnetAudiosLabel    || 'Audios'],
              ['profilePosts',     i18n.profileClearnetPostsLabel     || 'Blogs'],
              ['profileBookmarks', i18n.profileClearnetBookmarksLabel || 'Bookmarks'],
              ['profileDocuments', i18n.profileClearnetDocumentsLabel || 'Documents'],
              ['profileEvents',    i18n.profileClearnetEventsLabel    || 'Events'],
              ['profileFeed',      i18n.profileClearnetFeedLabel      || 'Feed'],
              ['profileImages',    i18n.profileClearnetImagesLabel    || 'Images'],
              ['profileJobs',      i18n.profileClearnetJobsLabel      || 'Jobs'],
              ['profileMarket',    i18n.profileClearnetMarketLabel    || 'Market'],
              ['profilePodcasts',  i18n.profileClearnetPodcastsLabel  || 'Podcasts'],
              ['profileProjects',  i18n.profileClearnetProjectsLabel  || 'Projects'],
              ['profileSchool',    i18n.profileClearnetSchoolLabel    || 'School'],
              ['profileShops',     i18n.profileClearnetShopsLabel     || 'Shops'],
              ['profileTorrents',  i18n.profileClearnetTorrentsLabel  || 'Torrents'],
              ['profileFiles',  i18n.profileClearnetFilesLabel  || 'Files'],
              ['profileVideos',    i18n.profileClearnetVideosLabel    || 'Videos'],
              ['profileWiki',      i18n.profileClearnetWikiLabel      || 'Wikis']
          ])
        ),
        br(),
        div({ class: "prefs-card" },
          div({ class: "tags-header module-header-line" },
            h2(i18n.profileSensorsSectionTitle || 'Sensors'),
            p({ class: "prefs-help" }, i18n.profileSensorsHelp || 'Optional metrics shown on your profile.')
          ),
          pillRows([
            ['activity',  i18n.profileVisibilityActivity  || 'Activity Level'],
            ['ecoTax',    i18n.profileVisibilityEcoTax    || 'ECO Tax'],
            ['wallet',    i18n.profileVisibilityWallet    || 'ECOIN Wallet'],
            ['gpg',       i18n.profileVisibilityGpg       || 'GPG Key'],
            ['karma',     i18n.profileVisibilityKarma     || 'KARMA Scoring'],
            ['larpSign',  i18n.profileVisibilityLarpSign  || 'L.A.R.P. Sign'],
            ['fediverse', i18n.profileVisibilityFediverse || 'Multiverse']
          ]),
          input({ type: "hidden", name: "fediverseHandle", value: fediverseHandleValue })
        ),
        renderAiAgentField("vis_aiAgent", visibilityPrefs.aiAgent === true),
        br(),
        button(
          {
            type: "submit",
          },
          i18n.save
        )
      )
    )
  );
};

exports.clearnetBlogView = async ({ msgKey, text, author, contentWarning, sentAt, tags = [] }) => {
  const { escapeHtml: esc, renderKindTag, renderClearnetPage, renderRichText, renderTagChips } = require('./clearnet_view');
  const rawText = String(text || '');
  const renderedHtml = sanitizeHtml(renderRichText(rawText));
  const plainPreview = rawText.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '').slice(0, 200);
  const dateStr = sentAt ? esc(new Date(sentAt).toISOString().slice(0, 10)) : '';
  const cw = esc(contentWarning || '');
  const firstLine = rawText.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<[^>]+>/g, '').split('\n').map(s => s.trim()).find(Boolean) || '';
  const titleText = cw || firstLine.slice(0, 100) || i18n.cnKindBlog;
  const extraCss = `
.cn-blog-meta{color:var(--fg-dim);font-size:13px;margin-bottom:16px;display:flex;gap:14px;flex-wrap:wrap}
.cn-blog-cw{background:#663d00;color:#ffd700;border:1px solid #ff7300;padding:8px 14px;border-radius:6px;margin-bottom:16px;font-weight:600}
.cn-blog-body{color:var(--fg-soft);line-height:1.7;font-size:16px;margin:0;word-wrap:break-word}
.cn-blog-body img{max-width:100%;height:auto;border-radius:6px;border:1px solid var(--border);display:block;margin:10px 0}
.cn-blog-body a{color:var(--fg);text-decoration:underline}
.cn-blog-body a:hover{color:var(--accent)}
.cn-blog-body .rt-code{background:var(--bg-sub);color:var(--fg);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-family:monospace;font-size:13px}
.cn-blog-body .rt-code-block{background:var(--bg-sub);color:var(--fg);border:1px solid var(--border);border-radius:4px;padding:10px 14px;font-family:monospace;font-size:13px}
.cn-blog-body .rt-quote{padding:6px 14px;border-left:3px solid var(--fg);color:var(--fg-soft);background:var(--bg-sub);border-radius:0 4px 4px 0}
.cn-blog-body .rt-header{color:var(--fg);margin:18px 0 10px 0}
.cn-blog-body video,.cn-blog-body audio{max-width:100%;display:block;margin:10px 0}
`;
  const body = `
  <div class="cn-blog-meta">
    ${renderKindTag('blog')}
    ${dateStr ? `<span>📅 ${dateStr}</span>` : ''}
  </div>
  ${cw ? `<div class="cn-blog-cw">${cw}</div>` : ''}
  <hr class="cn-sep"/>
  <article class="cn-blog-body">${renderedHtml}</article>
  ${renderTagChips(tags)}
`;
  return renderClearnetPage({
    title: `${titleText} | Oasis`,
    ogTitle: titleText,
    ogDescription: plainPreview,
    ogType: 'article',
    extraCss,
    body,
    hubFeedId: author || null
  });
};

const cnModuleLabel = (m) => (m && i18n[m.labelKey]) || (m && m.label) || '';
exports.cnModuleLabel = cnModuleLabel;
const CLEARNET_MODULES = [
  { key: 'audios',    label: 'Audios',    kind: 'audio', labelKey: 'audiosLabel',    prefKey: 'clearnetAudios' },
  { key: 'posts',     label: 'Blogs',     kind: 'blog', labelKey: 'blogTitle',     prefKey: 'clearnetPosts',     modulePath: 'blog' },
  { key: 'bookmarks', label: 'Bookmarks', kind: 'bookmark', labelKey: 'bookmarksLabel', prefKey: 'clearnetBookmarks' },
  { key: 'calendars', label: 'Calendars', kind: 'calendar', labelKey: 'calendarsTitle', prefKey: 'clearnetCalendars' },
  { key: 'campaigns', label: 'Campaigns', kind: 'campaign', labelKey: 'campaignsTitle', prefKey: 'clearnetCampaigns' },
  { key: 'documents', label: 'Documents', kind: 'document', labelKey: 'docsLabel', prefKey: 'clearnetDocuments' },
  { key: 'emergencies', label: 'Emergencies', kind: 'emergency', labelKey: 'emergenciesTitle', prefKey: 'clearnetEmergencies' },
  { key: 'events',    label: 'Events',    kind: 'event', labelKey: 'eventsLabel',    prefKey: 'clearnetEvents' },
  { key: 'feed',      label: 'Feeds',     kind: 'feed', labelKey: 'cnFeedsLabel',  prefKey: 'clearnetFeed' },
  { key: 'housing',   label: 'Housing',   kind: 'housing', labelKey: 'housingTitle',  prefKey: 'clearnetHousing' },
  { key: 'images',    label: 'Images',    kind: 'image', labelKey: 'imagesLabel',    prefKey: 'clearnetImages' },
  { key: 'jobs',      label: 'Jobs',      kind: 'job', labelKey: 'modulesJobsLabel',      prefKey: 'clearnetJobs' },
  { key: 'maps',      label: 'Maps',      kind: 'map', labelKey: 'mapTitle',      prefKey: 'clearnetMaps' },
  { key: 'market',    label: 'Market',    kind: 'market', labelKey: 'marketTitle',   prefKey: 'clearnetMarket' },
  { key: 'podcasts',  label: 'Podcasts',  kind: 'podcast', labelKey: 'podcastsTitle',  prefKey: 'clearnetPodcasts' },
  { key: 'projects',  label: 'Projects',  kind: 'project', labelKey: 'projectsTitle',  prefKey: 'clearnetProjects' },
  { key: 'rooms',     label: 'Rooms',     kind: 'room', labelKey: 'roomsTitle',    prefKey: 'clearnetRooms' },
  { key: 'school',    label: 'School',    kind: 'course', labelKey: 'schoolTitle',   prefKey: 'clearnetSchool' },
  { key: 'shops',     label: 'Shops',     kind: 'shop', labelKey: 'shopsTitle',     prefKey: 'clearnetShops' },
  { key: 'torrents',  label: 'Torrents',  kind: 'torrent', labelKey: 'torrentsLabel',  prefKey: 'clearnetTorrents' },
  { key: 'files',  label: 'Files',  kind: 'file', labelKey: 'filesLabel',  prefKey: 'clearnetFiles' },
  { key: 'videos',    label: 'Videos',    kind: 'video', labelKey: 'videosLabel',    prefKey: 'clearnetVideos' },
  { key: 'wiki',      label: 'Wikis',     kind: 'wiki', labelKey: 'wikiTitle',     prefKey: 'clearnetWiki' }
];

exports.CLEARNET_MODULES = CLEARNET_MODULES;

const CLEARNET_HUB_CSS = `
.cn-filter-row{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px 0}
.cn-filter-btn{display:inline-block;padding:3px 8px;background:var(--bg-elev);color:var(--fg-soft);border:1px solid var(--border);border-radius:10px;font-size:10px;letter-spacing:1px;text-transform:uppercase;text-decoration:none;transition:border-color .15s ease,color .15s ease,background .15s ease}
.cn-filter-btn:hover{border-color:var(--fg);color:var(--fg);text-decoration:none}
.cn-filter-btn.active{background:var(--bg-sub);border-color:var(--fg);color:var(--fg);font-weight:600}
.cn-hub-grid{columns:280px;column-gap:14px;margin-top:16px}
.cn-hub-grid > .cn-hub-card{break-inside:avoid;margin:0 0 14px 0;width:100%}
.cn-hub-kind{color:var(--fg-dim);font-size:10px;text-transform:uppercase;letter-spacing:2px;font-weight:600}
.cn-hub-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:12px 14px 0}
.cn-hub-head + .cn-hub-thumb{margin-top:10px;border-top:1px solid var(--border)}
.cn-hub-head + .cn-hub-body{padding-top:6px}
.cn-hub-head .cn-price{font-size:12px;padding:2px 8px}
.cn-hub-card{display:flex;flex-direction:column;background:var(--bg-elev);border:1px solid var(--border);border-radius:8px;overflow:hidden;transition:border-color .15s ease;color:var(--fg);text-decoration:none}
.cn-hub-card:hover{border-color:var(--fg);text-decoration:none}
.cn-hub-card a{color:var(--fg);text-decoration:none}
.cn-hub-card a:hover{text-decoration:underline}
.cn-hub-card a.cn-bookmark-url{color:#ff6600;font-weight:bold;font-size:13px;overflow-wrap:anywhere}
.cn-hub-player{width:100%;display:block;margin:6px 0;border-radius:6px;background:#000}
video.cn-hub-player{max-height:160px;object-fit:cover}
img.cn-hub-player{max-height:200px;object-fit:cover}
audio.cn-hub-player{background:transparent;height:36px}
.cn-hub-thumb{width:100%;height:140px;object-fit:cover;background:#000;border-bottom:1px solid var(--border)}
.cn-pop-thumb{width:100%;height:90px;object-fit:cover;background:#000;border-bottom:1px solid var(--border)}
.cn-pop-card .cn-hub-body{padding:8px 10px;gap:4px}
.cn-pop-card .cn-hub-title{font-size:13px}
.cn-hub-body{padding:12px 14px;display:flex;flex-direction:column;gap:6px;min-width:0}
.cn-hub-title{color:var(--fg);font-weight:600;font-size:15px;word-break:break-word}
.cn-hub-snippet{color:var(--fg-soft);font-size:13px;line-height:1.4;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cn-hub-snippet .cn-url{text-decoration:underline}
.cn-hub-card{position:relative}
.cn-hub-cover{position:absolute;inset:0;z-index:1}
.cn-hub-player,.cn-hub-card a:not(.cn-hub-cover){position:relative;z-index:2}
.cn-hub-meta{color:var(--fg-dim);font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-top:auto}
.cn-empty-content{background:var(--bg-elev);border:1px dashed var(--border);border-radius:8px;padding:24px;text-align:center;color:var(--fg-dim);font-size:14px}
`;

const renderClearnetHubCard = (modulePath, it) => {
  const { blobUrl: cnBlob, escapeHtml: esc, renderRichText, renderTagChips } = require('./clearnet_view');
  const blob = cnBlob(it.image);
  const href = clearnetItemHref(modulePath, it.title, it.id);
  const title = esc(it.title || i18n.cnUntitled);
  const bookmarkHref = it.url ? require('../backend/renderStyledText').safeExternalHref(it.url) : '';
  const raw = (it.url ? String(it.snippet || '').replace(String(it.url), '') : String(it.snippet || '')).replace(/!?\[[^\]]*\]\(\s*&[^)\s]*\s*\)/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const snippet = renderRichText(raw.slice(0, 300));
  const kind = esc(it.kind || '');
  const mediaSrc = it.media && it.media.blobId ? cnBlob(it.media.blobId) : null;
  const player = mediaSrc
    ? (it.media.kind === 'video'
        ? `<video class="cn-hub-player" controls preload="none" src="${mediaSrc}"></video>`
        : it.media.kind === 'image'
          ? `<a href="${href}"><img class="cn-hub-player" src="${mediaSrc}" alt="" loading="lazy"/></a>`
          : `<audio class="cn-hub-player" controls preload="none" src="${mediaSrc}"></audio>`)
    : '';
  const price = it.price ? `<span class="cn-price">${esc(String(it.price))} ECO</span>` : '';
  return `<div class="cn-hub-card">
    <a class="cn-hub-cover" href="${href}" aria-label="${it.title ? title : kind}"></a>
    ${kind || price ? `<div class="cn-hub-head">${kind ? `<span class="cn-hub-kind">${kind}</span>` : ''}${price}</div>` : ''}
    ${blob ? `<img class="cn-hub-thumb" src="${blob}" alt="" loading="lazy"/>` : ''}
    <div class="cn-hub-body">
      ${it.title ? `<div class="cn-hub-title">${title}</div>` : ''}
      ${bookmarkHref ? `<a class="cn-bookmark-url" href="${esc(bookmarkHref)}" target="_blank" rel="noopener noreferrer nofollow">${esc(it.url)}</a>` : ''}
      ${player}
      ${snippet ? `<div class="cn-hub-snippet">${snippet}${raw.length > 300 ? '…' : ''}</div>` : ''}
      ${modulePath === 'feed' ? '' : renderTagChips(it.tags)}
    </div>
  </div>`;
};

const clearnetMatcher = (query) => {
  const q = String(query || '').trim().toLowerCase();
  return (it) => !q || [it.title, it.snippet, it.description, it.meta, ...(Array.isArray(it.tags) ? it.tags.map(t => `#${t}`) : [])].some(v => String(v || '').toLowerCase().includes(q));
};

const buildClearnetHub = ({ items = {}, filterBase, filterType = '', query = '', page = 1 }) => {
  const { blobUrl: cnBlob, escapeHtml: esc, renderRichText, renderTagChips, kindLabel, paginateClearnet, renderClearnetPager } = require('./clearnet_view');
  const q = String(query || '').trim().toLowerCase();
  const matches = clearnetMatcher(query);
  const allItems = [];
  for (const m of CLEARNET_MODULES) {
    for (const it of (items[m.key] || [])) {
      if (!matches(it)) continue;
      allItems.push({ ...it, modulePath: m.modulePath || m.key, kind: kindLabel(m.kind), _moduleKey: m.key });
    }
  }
  allItems.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
  const activeFilter = String(filterType || '').toLowerCase();
  const visibleItems = activeFilter ? allItems.filter(it => it._moduleKey === activeFilter) : allItems;
  const qs = q ? `&q=${encodeURIComponent(query)}` : '';
  const present = new Set(allItems.map(it => it._moduleKey));
  const filterButtons = `<div class="cn-filter-row"><a class="cn-filter-btn${activeFilter ? '' : ' active'}" href="${filterBase}${q ? `?q=${encodeURIComponent(query)}` : ''}">${esc(i18n.all)}</a>${CLEARNET_MODULES.filter(m => present.has(m.key)).map(m => `<a class="cn-filter-btn${activeFilter === m.key ? ' active' : ''}" href="${filterBase}?type=${m.key}${qs}">${esc(cnModuleLabel(m))}</a>`).join('')}</div>`;
  const paged = paginateClearnet(visibleItems, page);
  const pager = renderClearnetPager({ base: filterBase, params: { type: activeFilter, q: query }, page: paged.page, pages: paged.pages, per: paged.per, total: paged.total });
  const sections = visibleItems.length
    ? `<h2 class="cn-section">${esc(i18n.cnNetworkContent)} (${visibleItems.length})</h2><div class="cn-hub-grid">${paged.items.map(it => renderClearnetHubCard(it.modulePath, it)).join('')}</div>${pager}`
    : (allItems.length ? `<div class="cn-empty-content">${esc(i18n.cnCategoryEmpty)}</div>` : '');
  return { sections, filters: allItems.length ? filterButtons : '', total: allItems.length, visible: visibleItems.length, page: paged.page, pages: paged.pages, per: paged.per };
};

exports.CLEARNET_HUB_CSS = CLEARNET_HUB_CSS;

exports.clearnetHubView = async ({ items = {}, tribes = [], trending = [], trendingFeeds = [], filterType = '', query = '', page = 1 }) => {
  const { escapeHtml: esc, renderClearnetPage, renderClearnetHubSearch, blobUrl: cnBlob, CLEARNET_PAGER_CSS, renderClearnetPager, kindLabel } = require('./clearnet_view');
  const active = String(filterType || '').toLowerCase();
  const notFiltered = (key) => key !== active;
  const hub = buildClearnetHub({ items, filterBase: '/c', filterType, query, page });
  const matches = clearnetMatcher(query);
  const shownFeeds = notFiltered('feed') ? (trendingFeeds || []).filter(matches) : [];
  const shownTrending = (trending || []).filter(it => notFiltered(it.moduleKey) && matches(it));
  const extraCss = CLEARNET_HUB_CSS + CLEARNET_PAGER_CSS + `
body{max-width:1440px}
.cn-hub-layout{display:grid;gap:28px;align-items:start;grid-template-columns:270px minmax(0,1fr) 170px;grid-template-areas:"left main right"}
.cn-hub-left{grid-area:left}
.cn-hub-right{grid-area:right}
.cn-hub-main{grid-area:main;min-width:0}
.cn-hub-main > h2.cn-section:first-child,.cn-hub-side > .cn-side-section:first-child > h2.cn-section,.cn-filter-row + h2.cn-section{margin-top:0}
.cn-side-list{display:flex;flex-direction:column;gap:10px}
.cn-slide-arrows{display:flex;justify-content:space-between;gap:10px;margin-top:10px}
.cn-slide-radio{position:absolute;opacity:0;width:1px;height:1px;margin:0;pointer-events:none}
.cn-slide-radio:not(:checked) + .cn-slide{display:none}
.cn-pager-btn.cn-slide-prev,.cn-pager-btn.cn-slide-next{cursor:pointer}
.cn-feed-track{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;align-items:start}
.cn-feed-track .cn-hub-snippet{-webkit-line-clamp:6}
@media (max-width:1180px){.cn-hub-layout{display:flex;flex-direction:column;align-items:stretch}.cn-hub-left{order:1}.cn-hub-right{order:2}.cn-hub-main{order:3}.cn-hub-side:empty{display:none}.cn-side-list{display:block;columns:240px;column-gap:10px}.cn-side-list > .cn-hub-card{break-inside:avoid;margin:0 0 10px 0;width:100%}}
`;
  const shownTribes = (tribes || []).filter(matches);
  const ranked = shownTribes.slice().sort((x, y) => (Number(y.content) || 0) - (Number(x.content) || 0));
  const tribeCard = (t) => {
    const img = cnBlob(t.image) || '/c/assets/images/default-tribe.png';
    const href = `/c/tribe/${encodeURIComponent(clearnetSlugFor(t.title, t.id))}`;
    return `<div class="cn-hub-card cn-pop-card"><a class="cn-hub-cover" href="${href}" aria-label="${esc(t.title)}"></a><img class="cn-pop-thumb" src="${img}" alt="" loading="lazy"/><div class="cn-hub-body"><a class="cn-hub-title" href="${href}">${esc(t.title || i18n.cnUntitled)}</a><div class="cn-hub-meta">${esc(i18n.cnPublicContent)}: ${Number(t.content) || 0}</div></div></div>`;
  };
  const modByKey = Object.fromEntries(CLEARNET_MODULES.map(m => [m.key, m]));
  const mod = (key) => modByKey[key] || { key, modulePath: key, kind: key };
  const card = (it, modulePath, kind) => renderClearnetHubCard(modulePath, { ...it, kind: kindLabel(kind) });
  const sideSection = (title, html) => html ? `<section class="cn-side-section"><h2 class="cn-section">${esc(title)}</h2><div class="cn-side-list">${html}</div></section>` : '';
  const listOf = (key, list) => list.map(it => card(it, mod(key).modulePath || key, mod(key).kind)).join('');
  const latest = (key, n) => (items[key] || []).filter(matches).slice().sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0)).slice(0, n);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (items.events || []).filter(e => String(e.meta || '') >= today && matches(e)).sort((a, b) => String(a.meta).localeCompare(String(b.meta))).slice(0, 5);
  const slider = (name, list, size, wrap) => {
    const groups = [];
    for (let i = 0; i < list.length; i += size) groups.push(list.slice(i, i + size));
    if (groups.length <= 1) return wrap(groups[0] || [], null);
    const arrow = (k, dir) => `<label class="cn-pager-btn cn-slide-${dir}" for="${name}-${k + 1}" aria-label="${esc(dir === 'prev' ? i18n.cnPrevPage : i18n.cnNextPage)}">${dir === 'prev' ? '←' : '→'}</label>`;
    return groups.map((g, k) => `<input class="cn-slide-radio" type="radio" name="${name}" id="${name}-${k + 1}"${k ? '' : ' checked'}/>${wrap(g, [arrow((k - 1 + groups.length) % groups.length, 'prev'), arrow((k + 1) % groups.length, 'next')])}`).join('');
  };
  const cards = (list) => list.map(it => card(it, it.modulePath, it.kind)).join('');
  const sideSlider = (name, title, list, draw) => list.length
    ? `<section class="cn-side-section"><h2 class="cn-section">${esc(title)} (${list.length})</h2>${slider(name, list, 5, (g, nav) => nav
      ? `<div class="cn-slide"><div class="cn-side-list">${draw(g)}</div><div class="cn-slide-arrows">${nav.join('')}</div></div>`
      : `<div class="cn-side-list">${draw(g)}</div>`)}</section>`
    : '';
  const trendingBlock = sideSlider('cn-trending', i18n.trendingTitle, shownTrending, cards);
  const tribesBlock = sideSlider('cn-tribes', i18n.cnTribesContent, ranked, g => g.map(tribeCard).join(''));
  const left = [
    trendingBlock,
    notFiltered('events') ? sideSection(cnModuleLabel(mod('events')), listOf('events', upcoming)) : ''
  ].join('');
  const right = [
    tribesBlock,
    ...['campaigns', 'jobs', 'market'].filter(notFiltered).map(k => sideSection(cnModuleLabel(mod(k)), listOf(k, latest(k, 3))))
  ].join('');
  const feedsBlock = shownFeeds.length
    ? `<h2 class="cn-section">${esc(i18n.cnFeedsLabel)} (${shownFeeds.length})</h2>${slider('cn-feeds', shownFeeds, 3, (g, nav) => nav
      ? `<div class="cn-slide"><div class="cn-feed-track">${cards(g)}</div><div class="cn-slide-arrows">${nav.join('')}</div></div>`
      : `<div class="cn-feed-track">${cards(g)}</div>`)}`
    : '';
  const main = `${feedsBlock}${hub.sections || (feedsBlock || ranked.length ? '' : `<div class="cn-empty-content">${esc(i18n.cnHubEmpty)}</div>`)}`;
  const body = `${hub.filters || ''}<div class="cn-hub-layout"><aside class="cn-hub-side cn-hub-left">${left}</aside><div class="cn-hub-main">${main}</div><aside class="cn-hub-side cn-hub-right">${right}</aside></div>`;
  return renderClearnetPage({
    title: `Oasis HUB | ${i18n.clearnetSectionTitle}`,
    ogTitle: `Oasis HUB | ${i18n.clearnetSectionTitle}`,
    ogDescription: i18n.cnHubDescription,
    extraCss,
    body,
    headerExtra: renderClearnetHubSearch({ type: filterType, query }),
    feed: filterType ? `/c/rss/${encodeURIComponent(filterType)}` : '/c/rss'
  });
};

exports.clearnetInhabitantView = async ({ feedId, name, description, image, prefs, items = {}, query = '', filterType = '', page = 1 }) => {
  const { blobUrl: cnBlob, escapeHtml: esc, renderRichText, renderTagChips, renderClearnetPage, kindLabel, paginateClearnet, renderClearnetPager, CLEARNET_PAGER_CSS } = require('./clearnet_view');
  const blobAvatarUrl = cnBlob(image);
  const avatarSrc = blobAvatarUrl || '/assets/images/default-avatar.png';
  const qrSrc = feedId ? `/c/qr/${encodeURIComponent(feedId)}` : null;
  const displayName = esc(name && name !== 'Redacted' ? name : feedId);
  const desc = renderRichText(description && description !== 'Redacted' ? description : '');
  const renderHubItem = (modulePath, it) => renderClearnetHubCard(modulePath, it);
  const moduleDef = CLEARNET_MODULES;
  const allItems = [];
  for (const m of moduleDef) {
    for (const it of (items[m.key] || [])) {
      allItems.push({ ...it, modulePath: m.modulePath || m.key, kind: kindLabel(m.kind), _moduleKey: m.key });
    }
  }
  allItems.sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
  const activeFilter = (filterType || '').toLowerCase();
  const visibleItems = activeFilter
    ? allItems.filter(it => it._moduleKey === activeFilter)
    : allItems;
  const totalCount = visibleItems.length;
  const filterBase = `/c/inhabitant/${encodeURIComponent(feedId)}`;
  const filterButtons = `<div class="cn-filter-row">
    <a class="cn-filter-btn${activeFilter ? '' : ' active'}" href="${filterBase}">${esc(i18n.all)}</a>
    ${moduleDef.filter(m => (items[m.key] || []).length).map(m => `<a class="cn-filter-btn${activeFilter === m.key ? ' active' : ''}" href="${filterBase}?type=${m.key}">${esc(cnModuleLabel(m))}</a>`).join('')}
  </div>`;
  const paged = paginateClearnet(visibleItems, page);
  const pager = renderClearnetPager({ base: filterBase, params: { type: activeFilter }, page: paged.page, pages: paged.pages, per: paged.per, total: paged.total });
  const sections = totalCount
    ? `<h2 class="cn-section">${esc(i18n.cnPublicContent)} (${totalCount})</h2>${filterButtons}<div class="cn-hub-grid">${paged.items.map(it => renderHubItem(it.modulePath, it)).join('')}</div>${pager}`
    : (allItems.length ? `${filterButtons}<div class="cn-empty-content">${esc(i18n.cnCategoryEmpty)}</div>` : '');
  const noResults = `<div class="cn-empty-content">${esc(i18n.cnInhabitantEmpty)}</div>`;
  const extraCss = CLEARNET_HUB_CSS + CLEARNET_PAGER_CSS + `
.cn-profile{display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;margin-bottom:24px}
.cn-avatar{width:160px;height:160px;border-radius:8px;border:3px solid var(--fg);object-fit:cover;background:#000;flex:0 0 auto}
.cn-profile-body{flex:1 1 280px;min-width:0}
.cn-name{color:var(--fg);margin:0 0 8px 0;font-size:28px;font-weight:700}
.cn-id{color:var(--fg-dim);font-size:12px;word-break:break-all;font-family:monospace;background:var(--bg-sub);border:1px solid var(--border);padding:6px 10px;border-radius:4px;display:inline-block;margin-bottom:14px}
.cn-desc{color:var(--fg-soft);white-space:pre-wrap;margin:0}
.cn-qr-col{flex:0 0 auto;display:flex;align-items:flex-start;justify-content:center}
.cn-qr-img{width:160px;height:160px;background:#fff;padding:8px;border-radius:8px;image-rendering:pixelated}
.cn-empty-content{background:var(--bg-elev);border:1px dashed var(--border);border-radius:8px;padding:24px;text-align:center;color:var(--fg-dim);font-size:14px}
`;
  const body = `
  <div class="cn-profile">
    <a href="/c/inhabitant/${encodeURIComponent(feedId)}"><img class="cn-avatar" src="${avatarSrc}" alt="${displayName}" loading="lazy"/></a>
    <div class="cn-profile-body">
      <h1 class="cn-name">${displayName}</h1>
      <div class="cn-id">${esc(feedId)}</div>
      ${desc ? `<p class="cn-desc">${desc}</p>` : ''}
    </div>
    ${qrSrc ? `<div class="cn-qr-col"><img class="cn-qr-img" src="${qrSrc}" alt="QR" loading="lazy"/></div>` : ''}
  </div>
  ${totalCount > 0 ? sections : noResults}
`;
  return renderClearnetPage({
    title: `${name || 'Inhabitant'} | Oasis`,
    ogTitle: name || 'Oasis',
    ogDescription: description || '',
    ogImage: blobAvatarUrl,
    extraCss,
    body,
    hubFeedId: feedId || null
  });
};

const renderUserSensors = (u, opts = {}) => {
  const { renderReachChip, renderFediverseReach, renderContentStats } = require('./clearnet_view');
  const prefs = u.prefs || {};
  const isMe = !!u.isMe;
  const show = (k) => prefs[k];
  const fmtCarbon = (g) => {
    const n = Number(g) || 0;
    if (!n) return '0 µg CO₂';
    if (n >= 1) return `${n.toFixed(2)} g CO₂`;
    const mg = n * 1000;
    if (mg >= 1) return `${mg.toFixed(2)} mg CO₂`;
    return `${(mg * 1000).toFixed(2)} µg CO₂`;
  };
  const fediverseNode = (isMe && !u.fediverseConfigured) ? null : renderFediverseReach(prefs, i18n);
  const dot = u.activityBucket === 'green' ? 'green' : u.activityBucket === 'orange' ? 'orange' : u.activityBucket === 'red' ? 'red' : null;
  const activityChip = (show('activity') && dot)
    ? span({ class: 'inhabitant-last-activity' }, `${i18n.inhabitantActivityLevel}: `, span({ class: `activity-dot ${dot}` }, '●'))
    : null;
  const deviceSrc = isMe
    ? (getConfig().themes.current === 'OasisKIT' ? 'KIT' : (getConfig().themes.current === 'OasisMobile' || process.env.OASIS_MOBILE === '1') ? 'MOBILE' : 'DESKTOP')
    : (u.deviceSource || null);
  const deviceChip = deviceSrc
    ? (() => {
        const up = String(deviceSrc).toUpperCase();
        const cls = up === 'KIT' ? 'device-kit' : up === 'MOBILE' ? 'device-mobile' : 'device-desktop';
        return span({ class: 'inhabitant-last-activity' }, `${i18n.deviceLabel || 'Device'}: `, span({ class: cls }, deviceSrc));
      })()
    : null;
  const items = [];
  const kr = u.karmaReceived && typeof u.karmaReceived === 'object' ? u.karmaReceived : null;
  const krPos = kr ? Number(kr.positive) || 0 : 0;
  const krNeg = kr ? Number(kr.negative) || 0 : 0;
  const krTone = !kr ? '' : krPos > krNeg ? ' karma-value-positive' : krPos < krNeg ? ' karma-value-negative' : ' karma-value-neutral';
  if (show('karma')) items.push(span({ class: kr ? 'karma-line karma-line-stacked' : 'karma-line' },
    span({ class: 'karma-line-main' }, `${i18n.bankingUserEngagementScore}: `, strong({ class: 'karma-value' + krTone }, String(u.karmaScore !== undefined ? u.karmaScore : 0))),
    kr ? span({ class: 'karma-received-row' },
      span({ class: 'karma-received karma-received-up' }, span({ class: 'karma-arrow' }, '▲'), String(krPos)),
      span({ class: 'karma-received karma-received-down' }, span({ class: 'karma-arrow' }, '▼'), String(krNeg))
    ) : null
  ));
  if (show('ecoTax')) items.push(span({ class: 'karma-line eco-tax-line' }, `${i18n.profileVisibilityEcoTax || 'ECO Tax'}: `, strong(fmtCarbon(u.carbonGrams))));
  if (activityChip) items.push(activityChip);
  if (deviceChip) items.push(deviceChip);
  if (show('gpg') && (u.gpgFingerprint || isMe)) {
    let gpgNode;
    if (u.gpgFingerprint) {
      const sid = String(u.gpgFingerprint).slice(-8).toUpperCase();
      gpgNode = a({ href: `/profile/${encodeURIComponent(u.id)}/gpg.asc`, title: i18n.profileGpgDownload || 'Download' }, strong(sid));
    } else {
      const nc = i18n.statsEcoWalletNotConfigured || 'Not configured!';
      gpgNode = isMe ? a({ href: '/profile/edit' }, strong(nc)) : strong(nc);
    }
    items.push(span({ class: 'gpg-line' }, `${i18n.profileGpgChip || 'GPG'}: `, gpgNode));
  }
  if (show('wallet') && (u.ecoAddress || isMe)) {
    const addressNode = u.ecoAddress
      ? span({ class: 'wallet-address', title: i18n.statsEcoWalletLabel }, u.ecoAddress)
      : (isMe ? a({ href: '/wallet' }, strong(i18n.statsEcoWalletNotConfigured || 'Not configured!')) : strong(i18n.statsEcoWalletNotConfigured || 'Not configured!'));
    items.push(div({ class: 'wallet-line' },
      span({ class: 'wallet-line-head', title: i18n.statsEcoWalletLabel }, span({ class: 'wallet-icon' }, '❄')),
      isMe && u.ecoAddress ? a({ href: '/wallet', class: 'wallet-line-link' }, addressNode) : addressNode
    ));
  }
  const phoneVisible = isMe || prefs.phone === 'whole' || prefs.phone === undefined || (prefs.phone === 'mutuals' && u.mutual === true);
  if (phoneOn() && prefs.phone !== 'off' && phoneVisible && u.id && !sharedState.isPubId(u.id)) {
    const number = require('../models/phone_number').phoneNumberOf(u.id);
    const dnd = isMe ? !!(getConfig().phone || {}).dnd : prefs.phoneDnd === true;
    if (number) items.push(div({ class: 'wallet-line phone-number-line' },
      span({ class: 'wallet-line-head', title: i18n.profileVisibilityPhone }, span({ class: 'phone-number-icon' }, '✆')),
      isMe || dnd
        ? span({ class: 'wallet-address phone-number-value', title: isMe ? i18n.profileVisibilityPhone : i18n.phoneRecipientRefuses }, number)
        : renderPhoneCallForm(u.id, span({ class: 'wallet-address phone-number-value' }, number), i18n.phoneCallButton),
      renderStateChip(dnd ? 'hidden' : 'mutuals', dnd ? '✗' : '✓', String(dnd ? i18n.phoneDnd : i18n.phoneOpen).toUpperCase()),
      isMe && opts.dndToggle !== false ? form({ method: 'POST', action: '/phone/dnd', class: 'phone-dnd-form' },
        input({ type: 'hidden', name: 'dnd', value: dnd ? '0' : '1' }),
        button({ type: 'submit', class: 'tribe-action-btn' }, String(dnd ? i18n.phoneOpen : i18n.phoneDnd).toUpperCase())
      ) : null
    ));
  }
  const sensorsBox = items.length ? div({ class: 'profile-sensors-box' }, ...items) : null;
  if (opts.sensorsOnly) return sensorsBox ? [sensorsBox] : [];
  const larpNode = (show('larpSign') && u.larpHouse && u.larpHouse.key)
    ? a({ href: `/larp/${u.larpHouse.key}`, class: 'larp-sign-block', title: u.larpHouse.name }, img({ src: u.larpHouse.image || '/assets/larp/images/default.jpg', alt: u.larpHouse.name, class: 'larp-sign-large' }))
    : null;
  const reachNode = prefs.clearnet
    ? (() => {
        const path = `/c/inhabitant/${encodeURIComponent(u.id)}`;
        return div({ class: 'profile-reach' },
          renderReachChip(true, i18n, path),
          renderInviteQrCard({ qrDataUrl: `/qr-clearnet/${encodeURIComponent(u.id)}` })
        );
      })()
    : null;
  const contentNode = opts.excludeContent ? null : renderContentStats(u.stats, i18n);
  return [opts.relationshipNode || null, sensorsBox, fediverseNode, larpNode, reachNode, contentNode].filter(Boolean);
};
exports.renderUserSensors = renderUserSensors;

exports.authorView = async ({
  avatarUrl,
  description,
  feedId,
  messages,
  firstPost,
  lastPost,
  name,
  oasisVersion,
  relationship,
  ecoAddress,
  karmaScore = 0,
  karmaReceived = null,
  estimatedUBI = 0,
  lastClaimedDate = null,
  totalClaimed = 0,
  carbonGrams = 0,
  larpHouse = null,
  lastActivityBucket,
  visibilityPrefs = null,
  deviceSource = null,
  stats = {},
  baseUrl = '',
  userActions = [],
  allActions = [],
  profileItems = null,
  profileFilterType = '',
  gpgFingerprint = '',
  spreadMap = null,
  fediverseConfigured = false
}) => {
  const isOwnProfile = !!(relationship && relationship.me);
  const rawPrefs = visibilityPrefs || {};
  const prefs = {
    activity: rawPrefs.activity === true,
    device:   rawPrefs.device   === true,
    karma:    rawPrefs.karma !== false,
    ubi:      rawPrefs.ubi      === true,
    wallet:   rawPrefs.wallet   === true,
    ecoTax:   rawPrefs.ecoTax   !== false,
    larpSign: rawPrefs.larpSign === true,
    aiAgent:  rawPrefs.aiAgent  === true,
    clearnet: rawPrefs.clearnet === true,
    fediverse: rawPrefs.fediverse === true,
    fediverseHandle: typeof rawPrefs.fediverseHandle === 'string' ? rawPrefs.fediverseHandle : '',
    gpg:      rawPrefs.gpg      === true,
    phone:    rawPrefs.phone === 'mutuals' || rawPrefs.phone === 'off' ? rawPrefs.phone : 'whole',
    phoneDnd: rawPrefs.phoneDnd === true
  };
  const clearnetSubKeys = CLEARNET_MODULES.map(m => m.prefKey);
  const anySubClearnet = clearnetSubKeys.some(k => rawPrefs[k] === true);
  prefs.clearnet = prefs.clearnet || anySubClearnet;
  const showField = (key) => prefs[key];
  const qrSrc = feedId ? `/qr/${encodeURIComponent(feedId)}` : null;
  const linkUrl = `/author/${encodeURIComponent(feedId)}`;

  const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const markdownMention = `[@${escHtml(name)}](<strong>${escHtml(feedId)}</strong>)`;

  const relationshipBlock = [renderRelationshipBlock(relationship, feedId), renderAiBotChip(prefs)];

  const userSensors = renderUserSensors({
    isMe: isOwnProfile, fediverseConfigured, prefs, id: feedId,
    karmaScore, karmaReceived, carbonGrams, deviceSource, activityBucket: lastActivityBucket,
    gpgFingerprint, ecoAddress, estimatedUBI, lastClaimedDate, totalClaimed,
    larpHouse, stats,
    mutual: !!(relationship && relationship.following && relationship.followsMe)
  }, { relationshipNode: div({ class: "profile-side-relationship" }, relationshipBlock) });

  const sideColumn = div({ class: "tribe-side profile-side" },
    img({ class: "inhabitant-photo-details", src: avatarUrl, alt: name }),
    h2({ class: "profile-side-name" }, name),
    description !== ""
      ? div({ class: "profile-side-description", [RAW_HTML]: sanitizeHtml(renderStyledHtml(description)) })
      : null,
    div({ class: "profile-side-mention" },
      a({ href: `/author/${encodeURIComponent(feedId)}` }, strong(feedId))
    ),
    feedId ? renderInviteQrCard({ qrDataUrl: `/qr/${encodeURIComponent(feedId)}` }) : null,
    oasisVersion ? div({ class: "profile-side-version" },
      '🌴 ' + (i18n.oasisVersionLabel || 'Oasis Version') + ': ',
      strong(oasisVersion)
    ) : null,
    ...userSensors,
    div({ class: "profile-side-actions" },
      isOwnProfile ? a({ href: `/profile/edit`, class: "filter-btn" }, `✎ ${i18n.editProfile}`) : null,
      isOwnProfile ? a({ href: "/supporters", class: "filter-btn" }, `♥ ${i18n.viewSupporters}`) : null,
      a({ href: `/likes/${encodeURIComponent(feedId)}`, class: "filter-btn" }, `⟳ ${i18n.viewLikes}`),
      !isOwnProfile ? a({ href: `/pm?recipients=${encodeURIComponent(feedId)}`, class: "filter-btn" }, `✉ ${i18n.pmCreateButton}`) : null,
      !isOwnProfile ? renderCallButton(feedId, { pam: true }) : null
    )
  );

  let mainColumnContent = [];

  if (Array.isArray(allActions) && allActions.length) {
    const keyToTypes = {
      shops:     new Set(['shop', 'shopProduct']),
      jobs:      new Set(['job']),
      events:    new Set(['event']),
      projects:  new Set(['project']),
      posts:     new Set(['post']),
      audios:    new Set(['audio']),
      videos:    new Set(['video']),
      images:    new Set(['image']),
      documents: new Set(['document']),
      torrents:  new Set(['torrent']),
      files:     new Set(['file']),
      bookmarks: new Set(['bookmark']),
      podcasts:  new Set(['podcast']),
      school:    new Set(['schoolCourse']),
      market:    new Set(['market']),
      feed:      new Set(['feed']),
      wiki:      new Set(['wikiPage'])
    };
    const moduleDef = [
      { key: 'audios',    label: i18n.profileClearnetAudiosLabel    || 'Audios' },
      { key: 'posts',     label: i18n.profileClearnetPostsLabel     || 'Blogs' },
      { key: 'bookmarks', label: i18n.profileClearnetBookmarksLabel || 'Bookmarks' },
      { key: 'documents', label: i18n.profileClearnetDocumentsLabel || 'Documents' },
      { key: 'events',    label: i18n.profileClearnetEventsLabel    || 'Events' },
      { key: 'feed',      label: i18n.profileClearnetFeedLabel      || 'Feed' },
      { key: 'images',    label: i18n.profileClearnetImagesLabel    || 'Images' },
      { key: 'jobs',      label: i18n.profileClearnetJobsLabel      || 'Jobs' },
      { key: 'market',    label: i18n.profileClearnetMarketLabel    || 'Market' },
      { key: 'podcasts',  label: i18n.profileClearnetPodcastsLabel  || 'Podcasts' },
      { key: 'projects',  label: i18n.profileClearnetProjectsLabel  || 'Projects' },
      { key: 'school',    label: i18n.profileClearnetSchoolLabel    || 'School' },
      { key: 'shops',     label: i18n.profileClearnetShopsLabel     || 'Shops' },
      { key: 'torrents',  label: i18n.profileClearnetTorrentsLabel  || 'Torrents' },
      { key: 'files',  label: i18n.profileClearnetFilesLabel  || 'Files' },
      { key: 'videos',    label: i18n.profileClearnetVideosLabel    || 'Videos' },
      { key: 'wiki',      label: i18n.profileClearnetWikiLabel      || 'Wikis' }
    ];
    const enabledKeys = moduleDef.filter(m => rawPrefs[`profile${m.key.charAt(0).toUpperCase() + m.key.slice(1)}`] === true).map(m => m.key);
    if (enabledKeys.length > 0) {
      const allowedTypes = new Set();
      for (const k of enabledKeys) for (const t of keyToTypes[k]) allowedTypes.add(t);
      const channelsWithEpisodes = new Set(allActions.filter(a => a && a.type === 'podcastEpisode' && a.content && a.content.channel).map(a => String(a.content.channel)));
      const authorActions = allActions.filter(a => a && a.author === feedId && allowedTypes.has(a.type) && !(a.type === 'post' && a.content && a.content.root) && (a.type !== 'podcast' || channelsWithEpisodes.has(String(a.rootId || a.id)) || channelsWithEpisodes.has(String(a.id))));
      const counts = {};
      for (const k of enabledKeys) counts[k] = 0;
      for (const a of authorActions) {
        for (const k of enabledKeys) {
          if (keyToTypes[k].has(a.type)) { counts[k]++; break; }
        }
      }
      const totalCount = authorActions.length;
      if (totalCount > 0) {
        const activeFilter = (profileFilterType || '').toLowerCase();
        const filterBase = isOwnProfile ? `/profile` : `/author/${encodeURIComponent(feedId)}`;
        const filterRow = div({ class: "tribe-section-nav no-border" },
          div({ class: "tribe-section-group no-border" },
            a({ href: filterBase, class: `filter-btn${activeFilter ? '' : ' active'}` }, `${String(i18n.profileHubAll || 'All').toUpperCase()} (${totalCount})`),
            ...moduleDef.filter(m => enabledKeys.includes(m.key) && counts[m.key] > 0).map(m => {
              const isActive = activeFilter === m.key;
              return a({ href: `${filterBase}?type=${encodeURIComponent(m.key)}`, class: `filter-btn${isActive ? ' active' : ''}` }, `${String(m.label).toUpperCase()} (${counts[m.key]})`);
            })
          )
        );
        const visible = activeFilter && keyToTypes[activeFilter]
          ? authorActions.filter(a => keyToTypes[activeFilter].has(a.type))
          : authorActions;
        visible.sort((a, b) => (b.ts || 0) - (a.ts || 0));
        const { renderActionCards } = require('./activity_view');
        mainColumnContent.push(filterRow);
        mainColumnContent.push(div({ class: 'feed-container profile-module-section' },
          renderActionCards(visible, (config.keys && config.keys.id) ? config.keys.id : '', allActions || visible, spreadMap instanceof Map ? spreadMap : new Map(), { paged: true })
        ));
      }
    }
  }

  const hasMainContent = mainColumnContent.length > 0;
  const layout = hasMainContent
    ? section(div({ class: "tribe-details profile-layout" },
        sideColumn,
        div({ class: "tribe-main profile-main" }, ...mainColumnContent)
      ))
    : section(div({ class: "profile-layout profile-layout-single" }, sideColumn));

  let html = template(i18n.profile, layout);
  return html;
};

exports.previewCommentView = async ({
  previewData,
  messages,
  myFeedId,
  parentMessage,
  contentWarning,
}) => {
  if (!parentMessage || !parentMessage.value) {
    throw new Error("Missing parentMessage or value");
  }

  const publishAction = `/comment/${encodeURIComponent(parentMessage.key)}`;
  const preview = generatePreview({
    previewData,
    contentWarning,
    action: publishAction,
  });
  return exports.commentView(
    { messages, myFeedId, parentMessage },
    preview, 
    previewData.text,
    contentWarning
  );
};

exports.commentView = async (
  { messages, myFeedId, parentMessage, spreadMap = null },
  preview,
  text,
  contentWarning
) => {
  if (!parentMessage || !parentMessage.value) {
    throw new Error("Missing parentMessage or value");
  }

  const parentKey = parentMessage.key;
  const threadRoot = parentMessage.value?.content?.root || parentKey;

  const messagesInput = Array.isArray(messages) ? messages : [];
  const merged = [parentMessage, ...messagesInput];

  const filtered = merged.filter((m) => {
    if (!m || !m.value) return false;
    return m.key === threadRoot || m.value?.content?.root === threadRoot;
  });

  const seen = new Set();
  const threadMessages = [];
  for (const m of filtered) {
    if (m && m.key && !seen.has(m.key)) {
      seen.add(m.key);
      threadMessages.push(m);
    }
  }

  const tsNum = (m) => {
    const n1 = Number(m?.value?.timestamp);
    if (Number.isFinite(n1) && n1 > 0) return n1;
    const iso = m?.value?.meta?.timestamp?.received?.iso8601;
    const raw = m?.value?.meta?.timestamp?.received;
    const n2 = iso ? Date.parse(iso) : (raw ? Date.parse(raw) : NaN);
    if (Number.isFinite(n2) && n2 > 0) return n2;
    const createdAt = m?.value?.content?.createdAt;
    const n3 = createdAt ? Date.parse(createdAt) : NaN;
    if (Number.isFinite(n3) && n3 > 0) return n3;
    return 0;
  };

  threadMessages.sort((a, b) => tsNum(a) - tsNum(b));

  const authorName = parentMessage.value?.meta?.author?.name || parentMessage.value?.author || "Anonymous";

  let markdownMention = "";
  const parentAuthorFeedId = parentMessage.value?.author;
  const parentAuthorName =
    parentMessage.value?.meta?.author?.name ||
    (typeof parentAuthorFeedId === "string"
      ? (parentAuthorFeedId.startsWith("@") ? parentAuthorFeedId.slice(1) : parentAuthorFeedId)
      : "Anonymous");

  if (parentAuthorFeedId && parentAuthorFeedId !== myFeedId) {
    markdownMention = `[@${parentAuthorName}](${parentAuthorFeedId})\n\n`;
  }

  const getSpread = (key) => (spreadMap instanceof Map ? spreadMap.get(key) : null) || null;
  const messageElements = threadMessages.map((m) => post({ msg: m, spreadInfo: getSpread(m.key) }));

  const action = `/comment/preview/${encodeURIComponent(parentKey)}`;
  const method = "post";
  const isPrivate = Boolean(parentMessage.value?.meta?.private);

  return template(
    i18n.commentTitle({ authorName }),
    div({ class: "thread-container" }, ...messageElements),
    form(
      { action, method, enctype: "multipart/form-data" },
      i18n.blogSubject,
      br(),
      label(
        i18n.contentWarningLabel,
        input({
          name: "contentWarning",
          type: "text",
          class: "contentWarning",
          value: contentWarning ? contentWarning : "",
          placeholder: i18n.contentWarningPlaceholder
        })
      ),
      br(),
      label({ for: "text" }, i18n.blogMessage),
      br(),
	textarea(
	  {
	    autofocus: true,
	    required: true,
	    name: "text",
	    rows: "6",
	    cols: "50",
	    placeholder: i18n.publishWarningPlaceholder
	  },
	  text ? text : null
	),
      br(),
      label(
        { for: "blob" },
        i18n.blogImage || "Upload media (max-size: 75MB)"
      ),
      input({ type: "file", id: "blob", name: "blob" }),
      br(),
      br(),
      button({ type: "submit" }, i18n.blogPublish)
    ),
    preview ? div({ class: "comment-preview" }, preview) : ""
  );
};



const { botOf: inboxBotOf, INBOX_BOTS } = require('../models/pm_model');
const INBOX_BOT_ORDER = Object.keys(INBOX_BOTS).concat(['reminders']);
const inboxBotLabel = (bot) => ({
  blogs: i18n.pmBotBlogs, jobs: i18n.pmBotJobs, projects: i18n.pmBotProjects, market: i18n.pmBotMarket, shops: i18n.pmBotShops,
  political: i18n.pmBotPolitical, banking: i18n.pmBotBanking, school: i18n.pmBotSchool, industry: i18n.pmBotIndustry,
  housing: i18n.pmBotHousing, wiki: i18n.pmBotWiki, emergencies: i18n.pmBotEmergencies, podcasts: i18n.pmBotPodcasts,
  campaigns: i18n.pmBotCampaigns, logistics: i18n.pmBotLogistics, social: i18n.pmBotSocial, larp: i18n.pmBotLarp, reminders: i18n.privateReminders
})[bot] || bot;
exports.INBOX_BOT_ORDER = INBOX_BOT_ORDER;
exports.inboxBotLabel = inboxBotLabel;

const inboxGroupsOf = (messagesRaw, { userId, readKeys = [], archivedKeys = [], mutedBots = [] } = {}) => {
  const read = new Set(Array.from(readKeys || [], String))
  const archived = new Set(Array.from(archivedKeys || [], String))
  const muted = new Set(Array.from(mutedBots || [], String))
  const isMutedMsg = m => { const b = inboxBotOf(m?.value?.content); return !!(b && muted.has(b)) }
  const messages = (messagesRaw || []).filter(m => m && m.key && m.value && m.value.content && m.value.content.type === 'post' && m.value.content.private === true).filter(m => !isMutedMsg(m))
  const isSent = m => (m?.value?.author === userId) || (m?.value?.content?.from === userId)
  const isList = m => !!(m?.value?.content?.list)
  const isToUser = m => Array.isArray(m?.value?.content?.to) && m.value.content.to.includes(userId)
  const isReminder = m => /^(Task Reminder:|Calendar Reminder:)/i.test(String(m?.value?.content?.subject || ''))
  const isNotification = m => !!inboxBotOf(m?.value?.content)
  const isSelfNotice = m => isSent(m) && isToUser(m) && isNotification(m)
  const isArchived = m => archived.has(String(m?.key))
  const received = messages.filter(m => (!isSent(m) || isSelfNotice(m)) && isToUser(m) && !isArchived(m))
  return {
    messages,
    received,
    archived: messages.filter(isArchived),
    notifications: messages.filter(m => isNotification(m) && !isArchived(m) && (!isSent(m) || isReminder(m) || isSelfNotice(m))),
    mailing: messages.filter(m => isList(m) && !isArchived(m)),
    unread: messages.filter(m => isToUser(m) && !read.has(String(m.key)) && !archived.has(String(m.key))),
    sent: messages.filter(m => isSent(m) && !isReminder(m) && !isSelfNotice(m) && !isArchived(m)),
    inbox: received.filter(m => !isReminder(m)),
    pms: received.filter(m => !isNotification(m) && !isList(m))
  }
}

exports.privateView = async (messagesInput, filter, decrypted = null, notice = '', q = '') => {
  const messagesRaw = Array.isArray(messagesInput) ? messagesInput : messagesInput.messages
  const listTitles = (!Array.isArray(messagesInput) && messagesInput.listTitles && typeof messagesInput.listTitles === 'object') ? messagesInput.listTitles : {}
  const readKeys = new Set((!Array.isArray(messagesInput) && Array.isArray(messagesInput.readKeys)) ? messagesInput.readKeys.map(String) : [])
  const archivedKeys = new Set((!Array.isArray(messagesInput) && Array.isArray(messagesInput.archivedKeys)) ? messagesInput.archivedKeys.map(String) : [])
  const mutedBots = new Set((!Array.isArray(messagesInput) && Array.isArray(messagesInput.mutedBots)) ? messagesInput.mutedBots.map(String) : [])
  const botFilter = (!Array.isArray(messagesInput) && typeof messagesInput.bot === 'string' && INBOX_BOT_ORDER.includes(messagesInput.bot)) ? messagesInput.bot : ''
  const sortMode = (!Array.isArray(messagesInput) && messagesInput.sort === 'recent') ? 'recent' : 'thread'
  const isMutedMsg = m => { const b = inboxBotOf(m?.value?.content); return !!(b && mutedBots.has(b)) }
  const messages = (messagesRaw || []).filter(m => m && m.key && m.value && m.value.content && m.value.content.type === 'post' && m.value.content.private === true).filter(m => !isMutedMsg(m))
  const qNorm = String(q || '').trim().toLowerCase()
  const qMatch = (m) => {
    if (!qNorm) return true
    const c = m.value.content || {}
    const ids = [c.from, m.value.author, ...(Array.isArray(c.to) && !inboxBotOf(c) ? c.to : [])].filter(Boolean)
    return [c.subject, c.text, ...ids, ...ids.map(id => userLinkLabel(id))]
      .some(v => String(v || '').toLowerCase().includes(qNorm))
  }
  const userId = await getUserId()

  const isSent = m => (m?.value?.author === userId) || (m?.value?.content?.from === userId)
  const isList = m => !!(m?.value?.content?.list)
  const isToUser = m => Array.isArray(m?.value?.content?.to) && m.value.content.to.includes(userId)
  const isReminder = m => {
    const s = String(m?.value?.content?.subject || '')
    return /^(Task Reminder:|Calendar Reminder:)/i.test(s)
  }
  const isNotification = m => !!inboxBotOf(m?.value?.content)
  const isSelfNotice = m => isSent(m) && isToUser(m) && isNotification(m)
  const botSenderByKey = new Map(messages.filter(isSelfNotice).map(m => [String(m.key), inboxBotLabel(inboxBotOf(m.value.content))]))
  const isArchived = m => archivedKeys.has(String(m?.key))
  const toUserKeys = new Set(messages.filter(isToUser).map(m => String(m.key)))
  const isUnreadKey = (key) => toUserKeys.has(String(key)) && !readKeys.has(String(key)) && !archivedKeys.has(String(key))
  const msgByKey = new Map(messages.map(m => [String(m.key), m]))
  const kindChipOf = (key) => {
    const m = msgByKey.get(String(key))
    if (!m) return null
    const bot = inboxBotOf(m.value.content)
    const [icon, text] = bot ? ['🔔', `${i18n.inboxKindUpdate} · ${inboxBotLabel(bot)}`] : isList(m) ? ['✉', i18n.inboxKindList] : ['✉', i18n.inboxKindDirect]
    return span({ class: 'pm-exposition-chip pm-exposition-whole' }, span({ class: 'pm-exposition-icon' }, icon), span({ class: 'pm-exposition-text' }, text))
  }
  const firstHref = (str) => { const m = String(str || '').match(/\]\((\/[^)\s]+)\)/); return m ? m[1] : null }

  const linkAuthor = (id) => userLink(id)

  const hrefFor = {
    job: (id) => `/jobs/${encodeURIComponent(id)}`,
    project: (id) => `/projects/${encodeURIComponent(id)}`,
    market: (id) => `/market/${encodeURIComponent(id)}`,
    shopProduct: (id) => `/shops/product/${encodeURIComponent(id)}`
  }

  const titleLink = (href, text) => href ? a({ href, class: 'pm-title-link' }, text) : text

  const chip = (txt) => span({ class: 'chip' }, txt)

  const fmtBytes = (n) => {
    const b = Number(n) || 0
    if (b < 1024) return `${b} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let v = b / 1024, i = 0
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
    return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
  }

  const e2eChip = () => span({ class: 'pm-exposition-chip pm-exposition-encrypted' },
    span({ class: 'pm-exposition-icon' }, '🔒'),
    span({ class: 'pm-exposition-text' }, i18n.encryptedChipLabel || 'E2E')
  );
  const doubleEncChip = () => span({ class: 'pm-exposition-chip pm-exposition-encrypted pm-double-enc-chip' },
    span({ class: 'pm-exposition-icon' }, '🔒'),
    span({ class: 'pm-exposition-text' }, i18n.pmCrypterChip || '2xE2E')
  );

  function headerLine({ sentAt, from, toLinks, subject, msgKey, msgSize, crypter }) {
    const ecoChip = msgSize ? renderEcoTax(msgSize, msgKey) : null;
    return table({ class: 'pm-info-table' },
      tr(
        td({ class: 'card-label' }, i18n.pmFromLabel || 'From:'),
        td({ class: 'card-value' }, botSenderByKey.has(String(msgKey)) ? span({ class: 'pm-bot-sender' }, botSenderByKey.get(String(msgKey))) : linkAuthor(from))
      ),
      tr(
        td({ class: 'card-label' }, i18n.privateDate || 'Date'),
        td({ class: 'card-value' }, moment(sentAt).format('YYYY/MM/DD HH:mm:ss'))
      ),
      tr(
        td({ class: 'card-label' }, i18n.pmToLabel || 'To:'),
        td({ class: 'card-value' }, ...toLinks.reduce((acc, lnk, i) => i > 0 ? [...acc, br(), lnk] : [lnk], []))
      ),
      tr(
        td({ class: 'card-label' }, i18n.pmSubjectLabel || 'Subject:'),
        td({ class: 'card-value pm-subject-cell' },
          span(subject || i18n.pmNoSubject || '(no subject)'),
          isUnreadKey(msgKey) ? span({ class: 'pm-exposition-chip pm-unread-chip' }, span({ class: 'pm-exposition-icon' }, '●'), span({ class: 'pm-exposition-text' }, i18n.inboxUnreadChip)) : null,
          isUnreadKey(msgKey) ? kindChipOf(msgKey) : null
        )
      ),
      ecoChip
        ? tr(
            td({ class: 'card-label' }, i18n.ecoTaxLabel || 'ECO Tax'),
            td({ class: 'card-value' }, ecoChip)
          )
        : null,
      tr(
        td({ class: 'card-label' }, i18n.pmEncryptionLabel || 'Encryption'),
        td({ class: 'card-value pm-encryption-cell' }, crypter ? [e2eChip(), doubleEncChip()] : [e2eChip()])
      )
    )
  }

  function msgSizeBytes(m) {
    try { return Buffer.byteLength(JSON.stringify(m && m.value), 'utf8'); } catch (_) { return 0; }
  }

  function actions({ key, replyId, subjectRaw, text, extra = null }) {
    const subjectReply = /^(\s*RE:\s*)/i.test(subjectRaw || '') ? (subjectRaw || '') : `RE: ${subjectRaw || ''}`
    const isSelf = replyId === userId
    return div({ class: 'pm-actions' },
      isSelf ? null : form({ method: 'GET', action: '/pm', class: 'pm-action-form' },
        input({ type: 'hidden', name: 'recipients', value: replyId }),
        input({ type: 'hidden', name: 'subject', value: subjectReply }),
        input({ type: 'hidden', name: 'quote', value: text || '' }),
        button({ type: 'submit', class: 'pm-btn reply-btn' }, i18n.pmReply.toUpperCase())
      ),
      isSelf ? null : renderCallButton(replyId, { upper: true, cls: 'pm-btn' }),
      extra || null,
      toUserKeys.has(String(key)) && !archivedKeys.has(String(key)) ? form({ method: 'POST', action: `/inbox/${readKeys.has(String(key)) ? 'unread' : 'read'}/${encodeURIComponent(key)}`, class: 'pm-action-form' },
        button({ type: 'submit', class: 'pm-btn read-btn' }, String(readKeys.has(String(key)) ? i18n.inboxMarkUnread : i18n.inboxMarkRead).toUpperCase())
      ) : null,
      toUserKeys.has(String(key)) ? form({ method: 'POST', action: `/inbox/${archivedKeys.has(String(key)) ? 'unarchive' : 'archive'}/${encodeURIComponent(key)}`, class: 'pm-action-form' },
        button({ type: 'submit', class: 'pm-btn archive-btn' }, String(archivedKeys.has(String(key)) ? i18n.inboxUnarchive : i18n.inboxArchive).toUpperCase())
      ) : null,
      form({ method: 'POST', action: `/inbox/delete/${encodeURIComponent(key)}`, class: 'pm-action-form' },
        button({ type: 'submit', class: 'pm-btn delete-btn danger-btn' }, i18n.privateDelete.toUpperCase())
      )
    )
  }

  function canonicalSubject(s) {
    return (s || '').replace(/^\s*(RE:\s*)+/i, '').trim()
  }

  function participantsKey(m) {
    const c = m?.value?.content || {}
    const set = new Set([m?.value?.author, ...(Array.isArray(c.to) ? c.to : [])])
    return Array.from(set).sort().join('|')
  }

  function threadId(m) {
    const c = m?.value?.content || {}
    if (c.list) return canonicalSubject(c.subject || '') + '||list:' + String(c.thread || c.list)
    return canonicalSubject(c.subject || '') + '||' + participantsKey(m)
  }

  function threadLevel(s) {
    const m = (s || '').match(/RE:/gi)
    return m ? Math.min(m.length, 8) : 0
  }

  function quoted(str) {
    const m = str.match(/"([^"]+)"/)
    return m ? m[1] : ''
  }

  function pickLink(str, kind) {
    if (kind === 'job') {
      const m = str.match(/\/jobs\/([%A-Za-z0-9/+._=-]+\.sha256)/)
      return m ? m[1] : ''
    }
    if (kind === 'project') {
      const m = str.match(/\/projects\/([%A-Za-z0-9/+._=-]+\.sha256)/)
      return m ? m[1] : ''
    }
    if (kind === 'market') {
      const m = str.match(/\/market\/([%A-Za-z0-9/+._=-]+\.sha256)/)
      return m ? m[1] : ''
    }
    if (kind === 'shopProduct') {
      const m = str.match(/\/shops\/product\/([%A-Za-z0-9/+._=-]+\.sha256)/)
      return m ? m[1] : ''
    }
    return ''
  }

  function clickableLinks(str) {
    const lines = str.split('\n')
    const parts = []
    let quoteBuffer = []
    const flushQuote = () => {
      if (quoteBuffer.length) {
        parts.push(`<div class="pm-quote">${quoteBuffer.join('<br>')}</div>`)
        quoteBuffer = []
      }
    }
    for (const line of lines) {
      if (/^>\s?/.test(line)) {
        quoteBuffer.push(line.replace(/^>\s?/, ''))
      } else {
        flushQuote()
        parts.push(line)
      }
    }
    flushQuote()
    const mdLinks = []
    const masked = parts.join('<br>')
      .replace(/\[([^\]\n]{1,120})\]\((https?:\/\/[^)\s]+|\/(?![\/\\])[^)\s]*)\)/g, (match, label, href) => {
        const idx = mdLinks.length
        const safeHref = String(href).replace(/"/g, '%22')
        const ext = /^https?:/.test(href) ? ' target="_blank" rel="noopener noreferrer"' : ''
        mdLinks.push(`<a class="oasis-md-link" href="${safeHref}"${ext}>${label}</a>`)
        return `\u0000MD${idx}\u0000`
      })
    return masked
      .replace(/(@[a-zA-Z0-9/+._=-]+\.ed25519)/g, (match, id) => `<a class="user-link" href="/author/${encodeURIComponent(id)}">${escapeHtml(userLinkLabel(id))}</a>`)
      .replace(/\/jobs\/([%A-Za-z0-9/+._=-]+\.sha256)/g, (match, id) => `<a class="job-link" href="${hrefFor.job(id)}">${match}</a>`)
      .replace(/\/projects\/([%A-Za-z0-9/+._=-]+\.sha256)/g, (match, id) => `<a class="project-link" href="${hrefFor.project(id)}">${match}</a>`)
      .replace(/\/market\/([%A-Za-z0-9/+._=-]+\.sha256)/g, (match, id) => `<a class="market-link" href="${hrefFor.market(id)}">${match}</a>`)
      .replace(/\/calendars\/([%A-Za-z0-9/+._=-]+\.sha256)/g, (match, id) => `<a class="calendar-link" href="/calendars/${encodeURIComponent(id)}">${match}</a>`)
      .replace(/\/ai\/ask\?[^\s<"]+/g, (match) => `<a class="ai-ask-link" href="${match}">${match}</a>`)
      .replace(/\/tribe\/([%A-Za-z0-9/+._=-]+\.sha256)(\?section=[a-zA-Z]+)?/g, (match) => `<a class="tribe-link" href="${match}">${match}</a>`)
      .replace(/\/larp\/([a-zA-Z]+)/g, (match) => `<a class="larp-link" href="${match}">${match}</a>`)
      .replace(/(?<![A-Za-z0-9_])\/(profile|inbox|invites|peers|tribes|inhabitants|publish|activity|settings|modules|banking|larp|parliament|courts|melody|audios|videos|images|documents|bookmarks|torrents|files|forum|feed|fediverse|multiverse|events|tasks|votes|reports|market|jobs|projects|industry|shops|pixelia|opinions|trending|agenda|cv|favorites|stats|blockexplorer|wallet|chats|pads|maps|calendars|ai|games|search)(?![A-Za-z0-9_\/])/g, (match) => `<a class="oasis-path-link" href="${match}">${match}</a>`)
      .replace(/(https?:\/\/[^\s<"]+)/g, (match) => `<a href="${match}" target="_blank" rel="noopener noreferrer">${match}</a>`)
      .replace(/\u0000MD(\d+)\u0000/g, (m, i) => mdLinks[Number(i)] !== undefined ? mdLinks[Number(i)] : m)
  }

  const threads = {}
  for (const m of messages) {
    const tid = threadId(m)
    if (!threads[tid]) threads[tid] = []
    threads[tid].push(m)
  }

  const groups = inboxGroupsOf(messagesRaw, { userId, readKeys, archivedKeys, mutedBots })
  const received = groups.received
  const archivedMsgs = groups.archived
  const notifications = groups.notifications
  const mailing = groups.mailing
  const botCounts = {}
  for (const m of notifications) { const b = inboxBotOf(m.value.content); if (b) botCounts[b] = (botCounts[b] || 0) + 1 }
  const botsPresent = INBOX_BOT_ORDER.filter(b => botCounts[b] > 0)

  const unreadMsgs = groups.unread
  if (!filter && unreadMsgs.length) filter = 'unread'

  const data = (
    filter === 'unread' ? unreadMsgs :
    filter === 'sent' ? groups.sent :
    filter === 'reminders' ? messages.filter(m => isReminder(m) && !isArchived(m)) :
    filter === 'pms' ? groups.pms :
    filter === 'notifications' ? (botFilter ? notifications.filter(m => inboxBotOf(m.value.content) === botFilter) : notifications) :
    filter === 'mailing' ? mailing :
    filter === 'archived' ? archivedMsgs :
    filter === 'inbox' ? groups.inbox :
    messages.filter(m => !isArchived(m))
  ).filter(qMatch)

  const inboxCount = groups.inbox.length
  const sentCount = groups.sent.length
  const pmCount = groups.pms.length
  const notifCount = notifications.length
  const mailingCount = mailing.length
  const archivedCount = archivedMsgs.length
  const emptyInbox = messages.length === 0 && !qNorm
  const shownKeys = data.map(m => String(m.key))
  const unreadShown = shownKeys.filter(k => isUnreadKey(k))
  const bulkDeletable = filter === 'notifications' || filter === 'reminders' || filter === 'archived'

  const sorted = [...data].sort((a, b) => {
    const ta = threadId(a)
    const tb = threadId(b)
    if (ta < tb) return -1
    if (ta > tb) return 1
    const sa = new Date(a?.value?.content?.sentAt || a.timestamp || 0).getTime()
    const sb = new Date(b?.value?.content?.sentAt || b.timestamp || 0).getTime()
    return sa - sb
  })

  function JobCard({ type, sentAt, from, toLinks, text, key, msgSize }) {
    const isSub = type === 'JOB_SUBSCRIBED'
    const icon = isSub ? '🟡' : '🟠'
    const titleH = isSub ? (i18n.inboxJobSubscribedTitle || 'New subscription to your job offer') : (i18n.inboxJobUnsubscribedTitle || 'Unsubscription from your job offer')
    const jobTitle = quoted(text) || 'job'
    const jobId = pickLink(text, 'job')
    const href = jobId ? hrefFor.job(jobId) : null
    return div(
      { class: 'pm-card job-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: titleH, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `${icon} ${i18n.pmBotJobs} · `, titleLink(href, titleH)),
      p(
        i18n.pmInhabitantWithId, ' ',
        linkAuthor(from), ' ',
        isSub ? i18n.pmHasSubscribedToYourJobOffer : (i18n.pmHasUnsubscribedFromYourJobOffer || 'has unsubscribed from your job offer'),
        ' ',
        href ? a({ class: 'job-link', href }, `"${jobTitle}"`) : `"${jobTitle}"`
      ),
      actions({ key, replyId: from, subjectRaw: jobTitle, text })
    )
  }

  function ProjectFollowCard({ type, sentAt, from, toLinks, text, key, msgSize }) {
    const isFollow = type === 'PROJECT_FOLLOWED'
    const icon = isFollow ? '🔔' : '🔕'
    const titleH = isFollow
      ? (i18n.inboxProjectFollowedTitle || 'New follower of your project')
      : (i18n.inboxProjectUnfollowedTitle || 'Unfollowed your project')
    const projectTitle = quoted(text) || 'project'
    const projectId = pickLink(text, 'project')
    const href = projectId ? hrefFor.project(projectId) : null
    return div(
      { class: `pm-card project-${isFollow ? 'follow' : 'unfollow'}-notification thread-level-0` },
      headerLine({ sentAt, from, toLinks, subject: titleH, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `${icon} ${i18n.pmBotProjects} · `, titleLink(href, titleH)),
      p(
        i18n.pmInhabitantWithId, ' ',
        userLink(from),
        ' ',
        isFollow ? (i18n.pmHasFollowedYourProject || 'has followed your project') : (i18n.pmHasUnfollowedYourProject || 'has unfollowed your project'),
        ' ',
        href ? a({ class: 'project-link', href }, `"${projectTitle}"`) : `"${projectTitle}"`
      ),
      actions({ key, replyId: from, subjectRaw: projectTitle, text })
    )
  }

  function SocialSupportCard({ sentAt, from, toLinks, text, key, msgSize }) {
    const titleH = i18n.inboxSocialSupportedTitle || 'New supporter'
    const m = String(text || '').match(/\]\(\/author\/([^)\s]+)\)/)
    let supporter = from
    if (m) { try { supporter = decodeURIComponent(m[1]) } catch (_) {} }
    return div(
      { class: 'pm-card social-support-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: titleH, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `\u2665 ${i18n.pmBotSocial || 'SocialBot'} · `, titleLink(`/author/${encodeURIComponent(supporter)}`, titleH)),
      p(
        i18n.pmInhabitantWithId, ' ',
        userLink(supporter),
        ' ',
        i18n.pmHasSupportedYou || 'has started supporting you'
      ),
      actions({ key, replyId: supporter, subjectRaw: titleH, text })
    )
  }

  function MarketSoldCard({ sentAt, from, toLinks, subject, text, key, msgSize, variant = 'market' }) {
    const isShop = variant === 'shop'
    const itemTitle = quoted(subject) || quoted(text) || 'item'
    const buyerId = (text.match(/OASIS ID:\s*([\w=/+.-]+)/) || [])[1] || from
    const price = (text.match(/for:\s*\$?([\d.]+)/) || [])[1] || ''
    const marketId = pickLink(text, 'market')
    const shopProductId = pickLink(text, 'shopProduct')
    const href = isShop ? (shopProductId ? hrefFor.shopProduct(shopProductId) : null) : (marketId ? hrefFor.market(marketId) : null)
    const icon = isShop ? '🛍️' : '💰'
    const botLabel = isShop ? i18n.pmBotShops : i18n.pmBotMarket
    const soldTitle = isShop ? (i18n.inboxShopSoldTitle || 'Product Sold') : i18n.inboxMarketItemSoldTitle
    return div(
      { class: `pm-card ${isShop ? 'shop-sold-notification' : 'market-sold-notification'} thread-level-0` },
      headerLine({ sentAt, from, toLinks, subject: soldTitle, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `${icon} ${botLabel} · `, titleLink(href, soldTitle)),
      p(
        i18n.pmYourItem, ' ',
        href ? a({ class: isShop ? 'shop-link' : 'market-link', href }, `"${itemTitle}"`) : `"${itemTitle}"`,
        ' ',
        i18n.pmHasBeenSoldTo, ' ',
        linkAuthor(buyerId),
        price ? ` ${i18n.pmFor} ${price} ECO.` : '.'
      ),
      actions({ key, replyId: buyerId, subjectRaw: itemTitle, text })
    )
  }

  function ProjectPledgeCard({ sentAt, from, toLinks, content, text, key, msgSize }) {
    const amount = content.meta?.amount ?? (text.match(/pledged\s+([\d.]+)/)?.[1] || '0')
    const projectTitle = content.meta?.projectTitle ?? (text.match(/project\s+"([^"]+)"/)?.[1] || 'project')
    const projectId = content.meta?.projectId ?? pickLink(text, 'project')
    const href = projectId ? hrefFor.project(projectId) : null
    return div(
      { class: 'pm-card project-pledge-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: i18n.inboxProjectPledgedTitle, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `💚 ${i18n.pmBotProjects} · `, titleLink(href, i18n.inboxProjectPledgedTitle)),
      p(
        i18n.pmInhabitantWithId, ' ',
        linkAuthor(from), ' ',
        i18n.pmHasPledged, ' ',
        chip(`${amount} ECO`), ' ',
        i18n.pmToYourProject, ' ',
        href ? a({ class: 'project-link', href }, `"${projectTitle}"`) : `"${projectTitle}"`
      ),
      actions({ key, replyId: from, subjectRaw: projectTitle, text })
    )
  }

  function PoliticalBotCard({ subjectU, sentAt, from, toLinks, text, key, msgSize }) {
    const titleMap = {
      PARLIAMENT_GOV: i18n.politicalBotParliamentTitle || 'A new government cycle has begun in the Parliament.',
      TRIBE_GOV: i18n.politicalBotTribeTitle || 'A new government cycle has begun in one of your Tribes.'
    }
    const title = titleMap[subjectU] || (i18n.pmBotPolitical || 'PoliticalBot')
    const href = firstHref(text)
    return div(
      { class: 'pm-card political-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `🏛️ ${i18n.pmBotPolitical} · `, href ? a({ href, class: 'pm-title-link' }, title) : title),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  function LarpBotCard({ subjectU, sentAt, from, toLinks, text, key, msgSize }) {
    const titleMap = {
      LARP_RULING: i18n.politicalBotLarpTitle,
      LARP_NEXT: i18n.larpBotNextTitle,
      LARP_DECREE: i18n.larpBotDecreeTitle,
      LARP_DECREE_RESULT: i18n.larpBotDecreeResultTitle,
      LARP_WALL: i18n.larpBotWallTitle,
      LARP_TEST: i18n.larpBotTestTitle,
      LARP_SOLSTICE: i18n.larpBotSolsticeTitle
    }
    const title = titleMap[subjectU] || (i18n.pmBotLarp || 'LarpBot')
    const href = firstHref(text)
    return div(
      { class: 'pm-card political-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `🎭 ${i18n.pmBotLarp || 'LarpBot'} · `, href ? a({ href, class: 'pm-title-link' }, title) : title),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  function IndustryBotCard({ subjectU, sentAt, from, toLinks, text, key, msgSize }) {
    const titleMap = {
      INDUSTRY_ADMITTED: i18n.industryBotAdmittedTitle || 'You have been admitted to a facility.',
      INDUSTRY_APPLICATION: i18n.industryBotApplicationTitle || 'New membership application in your facility.',
      INDUSTRY_INVITED: i18n.industryBotInvitedTitle || 'You have been invited to a facility.',
      INDUSTRY_DISSOLVED: i18n.industryBotDissolvedTitle || 'A facility you belong to has been dissolved.',
      INDUSTRY_BUILD_APPROVED: i18n.industryBotBuildApprovedTitle || 'A build has been approved.',
      INDUSTRY_DISTRIBUTED: i18n.industryBotDistributedTitle || 'A build output has been distributed.'
    }
    const title = titleMap[subjectU] || (i18n.pmBotIndustry || 'IndustryBot')
    return div(
      { class: 'pm-card industry-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `🏭 ${i18n.pmBotIndustry || 'IndustryBot'} · ${title}`),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  function BankingBotCard({ subjectU, sentAt, from, toLinks, text, key, msgSize }) {
    const title = subjectU === 'BANKING_UBI_PAID'
      ? (i18n.bankingBotUbiPaidTitle || 'You have received your UBI.')
      : subjectU === 'BANKING_UBI_AVAILABLE'
      ? (i18n.bankingBotUbiAvailableTitle || 'You can claim your UBI.')
      : subjectU === 'BANKING_CONFIRM_PENDING'
      ? (i18n.bankingBotConfirmTitle || 'You have transfers awaiting your confirmation.')
      : (i18n.bankingBotPaymentTitle || 'You have received a payment.')
    const href = firstHref(text)
    return div(
      { class: 'pm-card banking-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `💰 ${i18n.pmBotBanking || 'BankingBot'} · `, href ? a({ href, class: 'pm-title-link' }, title) : title),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  function SchoolBotCard({ subjectU, sentAt, from, toLinks, text, key, msgSize }) {
    const titleMap = {
      SCHOOL_ENROLLED: i18n.schoolBotEnrolledTitle || 'A new student has enrolled in your course.',
      SCHOOL_INVITED: i18n.schoolBotInvitedTitle || 'You have been invited to a course.',
      SCHOOL_ADMITTED: i18n.schoolBotAdmittedTitle || 'You have been admitted to a course.',
      SCHOOL_CERTIFICATE: i18n.schoolBotCertificateTitle || 'You have received a certificate.',
      SCHOOL_PASSED: i18n.schoolBotPassedTitle || 'A student has passed your course.',
      SCHOOL_LESSON_NEW: i18n.schoolBotLessonTitle || 'A new lesson has been published.'
    }
    const title = titleMap[subjectU] || (i18n.pmBotSchool || 'EducaBot')
    return div(
      { class: 'pm-card school-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `🎓 ${i18n.pmBotSchool || 'EducaBot'} · ${title}`),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  function EmergencyBotCard({ subjectU, sentAt, from, toLinks, text, key, msgSize }) {
    const titleMap = {
      EMERGENCY_UPDATED: i18n.emergencyBotUpdatedTitle || 'An emergency you follow has an update.',
      EMERGENCY_RESOLVED: i18n.emergencyBotResolvedTitle || 'An emergency you follow has been resolved.'
    }
    const title = titleMap[subjectU] || (i18n.pmBotEmergencies || 'EmergencyBot')
    return div(
      { class: 'pm-card emergency-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `🚨 ${i18n.pmBotEmergencies || 'EmergencyBot'} · ${title}`),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  function MailingCard({ sentAt, from, toLinks, subject, text, key, msgSize, content }) {
    const listId = String(content.list || '')
    const info = listTitles[listId] || null
    const listHref = `/mailing/${encodeURIComponent(listId)}`
    const listName = info && info.title ? info.title : (i18n.mailingTitle || 'Mailing list')
    const subjectReply = /^(\s*RE:\s*)/i.test(subject || '') ? (subject || '') : `RE: ${subject || ''}`
    const canReply = !!info && info.status === 'ACTIVE'
    const replyForm = canReply
      ? form({ method: 'POST', action: `${listHref}/message`, class: 'pm-action-form mailing-inbox-reply' },
          input({ type: 'hidden', name: 'thread', value: String(content.thread || content.mid || '') }),
          input({ type: 'hidden', name: 'subject', value: subjectReply }),
          input({ type: 'hidden', name: 'returnTo', value: '/inbox?filter=mailing' }),
          textarea({ name: 'text', rows: 2, maxlength: String(require('../backend/long_text').TEXT_CAP), required: true, placeholder: i18n.mailingReplyPlaceholder || 'Reply to the list...', class: 'mailing-inbox-reply-text' }),
          button({ type: 'submit', class: 'pm-btn reply-btn' }, String(i18n.mailingReplyToList || 'Reply to list').toUpperCase())
        )
      : null
    return div(
      { class: 'pm-card mailing-pm' },
      headerLine({ sentAt, from, toLinks, subject, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, '✉ ', a({ href: listHref, class: 'mailing-inbox-list' }, listName)),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: userId, subjectRaw: subject, text, extra: replyForm })
    )
  }

  function CampaignBotCard({ subjectU, sentAt, from, toLinks, text, key, msgSize }) {
    const titleMap = {
      CAMPAIGN_UPDATED: i18n.campaignBotUpdatedTitle || 'A campaign you follow has an update.',
      CAMPAIGN_ACHIEVED: i18n.campaignBotAchievedTitle || 'A campaign you follow has reached its goal.',
      CAMPAIGN_RAISED: i18n.campaignBotRaisedTitle || 'A campaign you signed has been raised to Parliament.'
    }
    const title = titleMap[subjectU] || (i18n.pmBotCampaigns || 'CampaignBot')
    return div(
      { class: 'pm-card campaign-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `✍ ${i18n.pmBotCampaigns || 'CampaignBot'} · ${title}`),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  function LogisticsBotCard({ subjectU, sentAt, from, toLinks, text, key, msgSize }) {
    const titleMap = {
      LOGISTICS_UPDATED: i18n.logisticsBotUpdatedTitle || 'A route you booked has changed.',
      LOGISTICS_CLOSED: i18n.logisticsBotClosedTitle || 'A route you booked has been closed.',
      LOGISTICS_BOOKED: i18n.logisticsBotBookedTitle || 'Someone booked your route.',
      LOGISTICS_CANCELLED: i18n.logisticsBotCancelledTitle || 'A booking on your route was cancelled.',
      LOGISTICS_CONFIRMED: i18n.logisticsBotConfirmedTitle || 'Your booking was confirmed: the package is on its way.',
      LOGISTICS_REJECTED: i18n.logisticsBotRejectedTitle || 'Your booking was rejected.',
      LOGISTICS_DELIVERED: i18n.logisticsBotDeliveredTitle || 'Your package has arrived.'
    }
    const title = titleMap[subjectU] || (i18n.pmBotLogistics || 'LogisticsBot')
    return div(
      { class: 'pm-card logistics-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `${i18n.pmBotLogistics || 'LogisticsBot'} · ${title}`),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  function BlogBotCard({ sentAt, from, toLinks, text, key, msgSize }) {
    const title = i18n.blogBotNewTitle
    return div(
      { class: 'pm-card blog-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `📝 ${i18n.pmBotBlogs} · `, titleLink(firstHref(text), title)),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  function PodcastBotCard({ sentAt, from, toLinks, text, key, msgSize }) {
    const title = i18n.podcastBotEpisodeTitle || 'A podcast you follow has a new episode.'
    return div(
      { class: 'pm-card podcast-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `${i18n.pmBotPodcasts || 'PodcastBot'} · ${title}`),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  function WikiBotCard({ subjectU, sentAt, from, toLinks, text, key, msgSize }) {
    const titleMap = {
      WIKI_EDITED: i18n.wikiBotEditedTitle || 'A wiki page you follow has been edited.',
      WIKI_RESTORED: i18n.wikiBotRestoredTitle || 'An earlier version of a wiki page you follow has been restored.'
    }
    const title = titleMap[subjectU] || (i18n.pmBotWiki || 'WikiBot')
    return div(
      { class: 'pm-card wiki-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `📖 ${i18n.pmBotWiki || 'WikiBot'} · ${title}`),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  function JobsBotCard({ sentAt, from, toLinks, text, key, msgSize }) {
    const title = i18n.jobsBotMatchTitle
    return div(
      { class: 'pm-card jobs-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `💼 ${i18n.pmBotJobs} · ${title}`),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  function HousingBotCard({ subjectU, sentAt, from, toLinks, text, key, msgSize }) {
    const myId = (config.keys && config.keys.id) ? config.keys.id : ''
    const mine = String(from) === String(myId)
    const titleMap = mine
      ? {
          HOUSING_REQUESTED: i18n.housingBotYouRequestedTitle || 'You have requested a place.',
          HOUSING_CANCELLED: i18n.housingBotYouCancelledTitle || 'You have cancelled a request.',
          HOUSING_UNAVAILABLE: i18n.housingBotUnavailableSentTitle || 'You have told the people who requested this place.'
        }
      : {
          HOUSING_REQUESTED: i18n.housingBotRequestedTitle || 'Somebody has requested one of your places.',
          HOUSING_CANCELLED: i18n.housingBotCancelledTitle || 'A request on one of your places was cancelled.',
          HOUSING_UNAVAILABLE: i18n.housingBotUnavailableTitle || 'A place you requested is no longer available.'
        }
    const title = titleMap[subjectU] || (i18n.pmBotHousing || 'HousingBot')
    return div(
      { class: 'pm-card housing-bot-notification thread-level-0' },
      headerLine({ sentAt, from, toLinks, subject: title, msgKey: key, msgSize }),
      h2({ class: 'pm-title' }, `🏠 ${i18n.pmBotHousing || 'HousingBot'} · ${title}`),
      div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text || '')) }),
      actions({ key, replyId: from, subjectRaw: title, text })
    )
  }

  const { renderEncryptedChip } = require('./clearnet_view');
  return template(
    i18n.private,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(i18n.private),
        p(i18n.privateDescription),
        renderEncryptedChip(i18n)
      ),
      div({ class: 'filters' },
        form({ method: 'GET', action: '/inbox' }, [
          ...(emptyInbox ? [] : [
          button({
            type: 'submit',
            name: 'filter',
            value: 'unread',
            class: filter === 'unread' ? 'filter-btn active' : 'filter-btn'
          }, `${String(i18n.inboxFilterUnread).toUpperCase()} (${unreadMsgs.length})`),
          button({
            type: 'submit',
            name: 'filter',
            value: 'inbox',
            class: filter === 'inbox' ? 'filter-btn active' : 'filter-btn'
          }, `${String(i18n.allButton || 'ALL').toUpperCase()} (${inboxCount})`),
          (pmCount > 0 || filter === 'pms') ? button({
            type: 'submit',
            name: 'filter',
            value: 'pms',
            class: filter === 'pms' ? 'filter-btn active' : 'filter-btn'
          }, `${String(i18n.inboxFilterPms || 'PMs').toUpperCase()} (${pmCount})`) : null,
          (mailingCount > 0 || filter === 'mailing') ? button({
            type: 'submit',
            name: 'filter',
            value: 'mailing',
            class: filter === 'mailing' ? 'filter-btn active' : 'filter-btn'
          }, `${String(i18n.inboxFilterMailing || 'Mailing lists').toUpperCase()} (${mailingCount})`) : null,
          (sentCount > 0 || filter === 'sent') ? button({
            type: 'submit',
            name: 'filter',
            value: 'sent',
            class: filter === 'sent' ? 'filter-btn active' : 'filter-btn'
          }, `${String(i18n.privateSent || 'SENT').toUpperCase()} (${sentCount})`) : null,
          (notifCount > 0 || filter === 'notifications' || filter === 'reminders') ? button({
            type: 'submit',
            name: 'filter',
            value: 'notifications',
            class: (filter === 'notifications' || filter === 'reminders') ? 'filter-btn active' : 'filter-btn'
          }, `${String(i18n.inboxFilterNotifications || 'Notifications').toUpperCase()} (${notifCount})`) : null,
          (archivedCount > 0 || filter === 'archived') ? button({
            type: 'submit',
            name: 'filter',
            value: 'archived',
            class: filter === 'archived' ? 'filter-btn active' : 'filter-btn'
          }, `${String(i18n.inboxFilterArchived).toUpperCase()} (${archivedCount})`) : null,
          ]),
          button({
            type: 'submit',
            name: 'filter',
            value: 'create',
            class: 'create-button',
            formaction: '/pm',
            attrs: { formmethod: 'GET' }
          }, i18n.pmCreateButton)
        ])
      ),
      (filter === 'notifications' && botsPresent.length) ? div({ class: 'filters inbox-bot-filters' },
        form({ method: 'GET', action: '/inbox' },
          input({ type: 'hidden', name: 'filter', value: 'notifications' }),
          sortMode === 'recent' ? input({ type: 'hidden', name: 'sort', value: 'recent' }) : null,
          button({ type: 'submit', name: 'bot', value: '', class: botFilter ? 'filter-btn' : 'filter-btn active' }, `${String(i18n.inboxAllBots).toUpperCase()} (${notifCount})`),
          ...botsPresent.map(b => button({ type: 'submit', name: 'bot', value: b, class: botFilter === b ? 'filter-btn active' : 'filter-btn' }, `${String(inboxBotLabel(b)).toUpperCase()} (${botCounts[b]})`))
        )
      ) : null,
      emptyInbox ? null : div({ class: 'filters activity-filter-chips activity-toolbar-row' },
      (() => {
        return div({ class: 'pm-exposition inbox-exposition' },
          span({ class: 'inbox-filters-label' }, i18n.inboxFiltersLabel || 'Filters:'),
          form({ method: 'GET', action: '/inbox', class: 'inbox-vis-toggle' },
            input({ type: 'hidden', name: 'filter', value: filter || 'inbox' }),
            botFilter ? input({ type: 'hidden', name: 'bot', value: botFilter }) : null,
            qNorm ? input({ type: 'hidden', name: 'q', value: String(q || '') }) : null,
            sortMode === 'recent' ? null : input({ type: 'hidden', name: 'sort', value: 'recent' }),
            button({ type: 'submit', class: 'btn' }, sortMode === 'recent' ? i18n.inboxSortThread : i18n.inboxSortRecent)
          ),
          unreadShown.length ? form({ method: 'POST', action: '/inbox/read-all', class: 'inbox-vis-toggle' },
            ...unreadShown.map(k => input({ type: 'hidden', name: 'keys', value: k })),
            button({ type: 'submit', class: 'btn' }, `${i18n.inboxMarkAllRead} (${unreadShown.length})`)
          ) : null,
          (bulkDeletable && shownKeys.length) ? form({ method: 'POST', action: '/inbox/delete-many', class: 'inbox-vis-toggle inbox-bulk-delete' },
            ...shownKeys.map(k => input({ type: 'hidden', name: 'keys', value: k })),
            button({ type: 'submit', class: 'btn delete-btn' }, `${String(i18n.inboxDeleteShown).toUpperCase()} (${shownKeys.length})`)
          ) : null
        )
      })(),
        form({ method: 'GET', action: '/inbox', class: 'filter-box' },
          input({ type: 'hidden', name: 'filter', value: filter || 'inbox' }),
          botFilter ? input({ type: 'hidden', name: 'bot', value: botFilter }) : null,
          sortMode === 'recent' ? input({ type: 'hidden', name: 'sort', value: 'recent' }) : null,
          input({ type: 'text', name: 'q', value: String(q || ''), placeholder: i18n.inboxSearchPlaceholder || 'Search in Inbox...', class: 'filter-box__input' }),
          renderSearchButton(i18n.searchButton)
        )
      ),
      div({ class: 'message-list' },
        (() => {
          function renderMsg(msg) {
            const content = msg.value.content
            const author = msg.value.author
            const subjectRaw = content.subject || ''
            const subjectU = subjectRaw.toUpperCase()
            const text = content.text || ''
            const sentAt = new Date(content.sentAt || msg.timestamp)
            const fromResolved = author
            const toLinks = isNotification(msg) ? [linkAuthor(config.keys.id)] : Array.isArray(content.to) ? content.to.map(addr => linkAuthor(addr)) : []
            const level = threadLevel(subjectRaw)
            const msgSize = msgSizeBytes(msg)

            if (content.fileShare && typeof content.fileShare === 'object') {
              const fsp = content.fileShare
              const dblKey = (decrypted && decrypted.key === msg.key) ? decrypted : null
              return div(
                { class: 'pm-card normal-pm pm-fileshare-card' },
                headerLine({ sentAt, from: fromResolved, toLinks, subject: subjectRaw, msgKey: msg.key, msgSize, crypter: !!fsp.crypter }),
                div({ class: 'pm-fileshare-info' },
                  span({ class: 'pm-fileshare-icon' }, '📎'),
                  span({ class: 'pm-fileshare-name' }, String(fsp.filename || 'file')),
                  span({ class: 'pm-fileshare-meta' }, `${fmtBytes(fsp.size)} · ${String(fsp.mime || 'application/octet-stream')}`)
                ),
                fsp.crypter
                  ? form({ method: 'POST', action: `/inbox/file/${encodeURIComponent(msg.key)}`, class: 'pm-fileshare-download-form' },
                      dblKey && dblKey.error ? div({ class: 'pm-form-error-msg' }, p('✗ ' + (i18n.pmCrypterBadKey || 'Your shared key is incorrect!'))) : null,
                      input({ type: 'text', name: 'key', placeholder: 'd66d7d32f4d30f34812aee3d01347154', minlength: 32, maxlength: 32, size: 34, required: true, class: 'pm-crypter-key-input' }),
                      button({ type: 'submit', class: 'pm-btn pm-fileshare-download' }, (i18n.fileShareDownload || 'Download').toUpperCase())
                    )
                  : null,
                actions({
                  key: msg.key, replyId: fromResolved, subjectRaw, text: '',
                  extra: fsp.crypter
                    ? null
                    : form({ method: 'GET', action: `/inbox/file/${encodeURIComponent(msg.key)}`, class: 'pm-action-form' },
                        button({ type: 'submit', class: 'pm-btn pm-fileshare-download' }, (i18n.fileShareDownload || 'Download').toUpperCase())
                      )
                })
              )
            }

            if (subjectU === 'JOB_MATCH') {
              return JobsBotCard({ sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'JOB_SUBSCRIBED' || subjectU === 'JOB_UNSUBSCRIBED') {
              return JobCard({ type: subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'PROJECT_FOLLOWED' || subjectU === 'PROJECT_UNFOLLOWED') {
              return ProjectFollowCard({ type: subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'SOCIAL_SUPPORTED') {
              return SocialSupportCard({ sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'MARKET_SOLD') {
              return MarketSoldCard({ sentAt, from: fromResolved, toLinks, subject: subjectRaw, text, key: msg.key, msgSize, variant: 'market' })
            }
            if (subjectU === 'SHOP_SOLD') {
              return MarketSoldCard({ sentAt, from: fromResolved, toLinks, subject: subjectRaw, text, key: msg.key, msgSize, variant: 'shop' })
            }
            if (subjectU.startsWith('LARP_')) {
              return LarpBotCard({ subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'PARLIAMENT_GOV' || subjectU === 'TRIBE_GOV') {
              return PoliticalBotCard({ subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'SCHOOL_ENROLLED' || subjectU === 'SCHOOL_INVITED' || subjectU === 'SCHOOL_ADMITTED' || subjectU === 'SCHOOL_CERTIFICATE' || subjectU === 'SCHOOL_PASSED' || subjectU === 'SCHOOL_LESSON_NEW') {
              return SchoolBotCard({ subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'BANKING_UBI_PAID' || subjectU === 'BANKING_UBI_AVAILABLE' || subjectU === 'BANKING_CONFIRM_PENDING' || subjectU === 'WALLET_PAYMENT') {
              return BankingBotCard({ subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'INDUSTRY_ADMITTED' || subjectU === 'INDUSTRY_APPLICATION' || subjectU === 'INDUSTRY_INVITED' || subjectU === 'INDUSTRY_DISSOLVED' || subjectU === 'INDUSTRY_BUILD_APPROVED' || subjectU === 'INDUSTRY_DISTRIBUTED') {
              return IndustryBotCard({ subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'HOUSING_REQUESTED' || subjectU === 'HOUSING_CANCELLED' || subjectU === 'HOUSING_UNAVAILABLE') {
              return HousingBotCard({ subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'WIKI_EDITED' || subjectU === 'WIKI_RESTORED') {
              return WikiBotCard({ subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'EMERGENCY_UPDATED' || subjectU === 'EMERGENCY_RESOLVED') {
              return EmergencyBotCard({ subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'BLOG_NEW') {
              return BlogBotCard({ sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'PODCAST_EPISODE') {
              return PodcastBotCard({ sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'CAMPAIGN_UPDATED' || subjectU === 'CAMPAIGN_ACHIEVED' || subjectU === 'CAMPAIGN_RAISED') {
              return CampaignBotCard({ subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU.startsWith('LOGISTICS_')) {
              return LogisticsBotCard({ subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key, msgSize })
            }
            if (subjectU === 'PROJECT_PLEDGE' || content.meta?.type === 'project-pledge') {
              return ProjectPledgeCard({ sentAt, from: fromResolved, toLinks, content, text, key: msg.key, msgSize })
            }
            if (content.list) {
              return MailingCard({ sentAt, from: fromResolved, toLinks, subject: subjectRaw, text, key: msg.key, msgSize, content })
            }

            if (content.crypter === true) {
              const dec = (decrypted && decrypted.key === msg.key) ? decrypted : null
              const shownText = dec && typeof dec.text === 'string' ? dec.text : ''
              return div(
                { class: 'pm-card normal-pm pm-crypter-card' },
                headerLine({ sentAt, from: fromResolved, toLinks, subject: subjectRaw, msgKey: msg.key, msgSize, crypter: true }),
                dec && typeof dec.text === 'string'
                  ? div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(dec.text)) })
                  : null,
                dec && typeof dec.text === 'string'
                  ? null
                  : form({ method: 'POST', action: '/inbox/decrypt', class: 'pm-crypter-decrypt-form' },
                      input({ type: 'hidden', name: 'id', value: msg.key }),
                      input({ type: 'hidden', name: 'returnFilter', value: filter || 'all' }),
                      input({ type: 'text', name: 'key', placeholder: 'd66d7d32f4d30f34812aee3d01347154', minlength: 32, maxlength: 32, size: 34, required: true, class: 'pm-crypter-key-input' }),
                      button({ type: 'submit', class: 'pm-btn pm-crypter-decrypt-btn' }, (i18n.pmCrypterDecryptButton || 'Decrypt').toUpperCase())
                    ),
                actions({ key: msg.key, replyId: fromResolved, subjectRaw, text: shownText })
              )
            }

            return div(
              { class: 'pm-card normal-pm' },
              headerLine({ sentAt, from: fromResolved, toLinks, subject: subjectRaw, msgKey: msg.key, msgSize }),
              div({ class: 'message-text', [RAW_HTML]: sanitizeHtml(clickableLinks(text)) }),
              actions({ key: msg.key, replyId: fromResolved, subjectRaw, text })
            )
          }

          const msgTs = (m) => new Date(m?.value?.content?.sentAt || m.timestamp || 0).getTime()
          if (sortMode === 'recent') {
            if (!sorted.length) return p({ class: 'empty' }, i18n.noPrivateMessages)
            return paged([...sorted].sort((a, b) => msgTs(b) - msgTs(a))).map(renderMsg)
          }

          const threadGroups = {}
          const threadOrder = []
          for (const msg of sorted) {
            const tid = threadId(msg)
            if (!threadGroups[tid]) {
              threadGroups[tid] = []
              threadOrder.push(tid)
            }
            threadGroups[tid].push(msg)
          }

          if (!threadOrder.length) return p({ class: 'empty' }, i18n.noPrivateMessages)

          const threadTs = (tid) => (threadGroups[tid] || []).reduce((max, m) => {
            const t = new Date(m?.value?.content?.sentAt || m.timestamp || 0).getTime()
            return t > max ? t : max
          }, 0)
          threadOrder.sort((a, b) => threadTs(b) - threadTs(a))

          return paged(threadOrder).map(tid => {
            const msgs = threadGroups[tid]
            const latest = msgs[msgs.length - 1]
            const earlier = msgs.slice(0, -1)

            if (!earlier.length) {
              return renderMsg(latest)
            }

            const earlierLabel = `${earlier.length} ${i18n.inboxEarlierMessages}`

            return div({ class: 'pm-thread' },
              renderMsg(latest),
              details({ class: 'pm-thread-details' },
                summary({ class: 'pm-thread-toggle' },
                  span({ class: 'pm-thread-icon' }, '▶'),
                  span(earlierLabel)
                ),
                div({ class: 'pm-thread-replies' },
                  ...earlier.map(renderMsg)
                )
              )
            )
          })
        })()
      )
    )
  )
}


exports.threadView = ({ messages, spreadMap = null, hiddenRoot = false }) => {
  if (!Array.isArray(messages) || !messages.length) {
    return template(i18n.hiddenByYou, section(p({ class: 'muted hidden-note' }, i18n.hiddenByYou)));
  }
  const rootMessage = messages[0];
  const rootAuthorName = rootMessage.value.meta.author.name;

  const tpl = template(
    [`@${rootAuthorName}`],
    hiddenRoot ? p({ class: 'muted hidden-note' }, i18n.hiddenByYou) : null,
    div(thread(messages, spreadMap))
  );

  return tpl;
};

exports.supportersView = async ({ supporters, feed, name }) => {
  const list = Array.isArray(supporters) ? supporters : [];
  return template(
    i18n.viewSupporters,
    section(
      div({ class: "tags-header module-header-line" },
        h2(`${i18n.viewSupporters} (${list.length})`),
        p(userLink(feed, name))
      )
    ),
    list.length
      ? section(div({ class: "supporters-list" }, ...list.map(id => span({ class: "pad-member-chip" }, userLink(id)))))
      : p({ class: "no-content" }, i18n.no_results)
  );
};

exports.likesView = async ({ messages, feed, name, spreadMap = null }) => {
  const list = Array.isArray(messages) ? messages : [];
  return template(
    i18n.viewLikes,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.viewLikes),
        p(userLink(feed, name))
      )
    ),
    list.length
      ? div(thread(list, spreadMap))
      : p({ class: "no-content" }, i18n.no_results)
  );
};


const ensureAt = (id) => {
  const s = String(id || "").trim()
  if (!s) return ""
  return s.startsWith("@") ? s : `@${s.replace(/^@+/, "")}`
}

const stripAt = (id) => String(id || "").trim().replace(/^@+/, "")

const authorHref = (feed) => `/author/${encodeURIComponent(ensureAt(feed))}`

const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const escapeHtml = (s) => {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

const normalizeMentionLinks = (text) => {
  let t = String(text || "")
  t = t.replace(
    /\[@([^\]]+)\]\s*\(\s*@?([^) \t\r\n]+\.ed25519)\s*\)/g,
    (_m, label, feed) => `[@${String(label || "").replace(/^@+/, "")}](@${String(feed || "").replace(/^@+/, "")})`
  )
  return t
}

const injectResolvedMentions = (text, mentions) => {
  let out = String(text || "")
  const obj = mentions && typeof mentions === "object" ? mentions : {}

  const entries = Object.entries(obj)
    .map(([k, v]) => [String(k || "").trim().replace(/\s+/g, " "), Array.isArray(v) ? v : []])
    .filter(([k, v]) => k && v.length === 1)

  entries.sort((a, b) => b[0].length - a[0].length)

  for (const [token, list] of entries) {
    const m = list[0] || {}
    const feed = ensureAt(m.feed || m.link || m.id || "")
    if (!feed) continue

    const label = String(m.name || token).replace(/^@+/, "")
    const parts = token.split(/\s+/).filter(Boolean).map(escapeRegex)
    if (!parts.length) continue

    const tokenPattern = parts.join("\\s+")
    const re = new RegExp(`(^|\\s)(?!\\[)@${tokenPattern}(?=\\b|$)`, "g")
    out = out.replace(re, (match, prefix) => `${prefix}[@${label}](${feed})`)
  }

  return out
}

const generatePreview = ({ previewData, contentWarning, action }) => {
  const mentions =
    previewData && previewData.mentions && typeof previewData.mentions === "object"
      ? previewData.mentions
      : {}

  const rawText = String((previewData && previewData.text) || "")
  const normalized = normalizeMentionLinks(rawText)
  const injected = injectResolvedMentions(normalized, mentions)
  const publishText = normalizeMentionLinks(injected)

  const previewHtml = renderStyledHtml(publishText)

  const mentionCards = Object.entries(mentions)
    .map(([_token, matches]) => {
      const list = Array.isArray(matches) ? matches : []
      const first = list.find((x) => x && (x.feed || x.link || x.id)) || null
      if (!first) return null

      const feed = ensureAt(first.feed || first.link || first.id || "")
      if (!feed) return null

      const nameRaw = String(first.name || stripAt(feed) || "")
      const nameText = nameRaw.startsWith("@") ? nameRaw : `@${nameRaw}`

      const rel = first.rel || {}

      const relationshipBadge = rel.me
        ? span({ class: "status you" }, i18n.relationshipYou)
        : rel.blocking
          ? span({ class: "status blocked" }, i18n.relationshipBlocking)
          : rel.following && rel.followsMe
            ? span({ class: "status mutual" }, i18n.relationshipMutuals)
            : rel.following
              ? span({ class: "status supporting" }, i18n.relationshipFollowing)
              : rel.followsMe
                ? span({ class: "status supported-by" }, i18n.relationshipTheyFollow)
                : span({ class: "status" }, i18n.relationshipNone)

      const avatar = first.img || first.image || ""
      const avatarUrl =
        typeof avatar === "string" && avatar.startsWith("&")
          ? `/blob/${encodeURIComponent(avatar)}`
          : (typeof avatar === "string" && avatar ? avatar : "/assets/images/default-avatar.png")

      return div(
        { class: "mention-card" },
        a({ href: authorHref(feed) }, img({ src: avatarUrl, class: "avatar-profile" })),
        br(),
        div(
          { class: "mention-name" },
          span({ class: "label" }, `${i18n.mentionsName}: `),
          a({ href: authorHref(feed) }, nameText)
        ),
        div(
          { class: "mention-relationship" },
          span({ class: "label" }, `${i18n.mentionsRelationship}: `),
          relationshipBadge,
          div(
            { class: "mention-relationship-details" },
            span(
              { class: "mentions-listing" },
              userLink(feed)
            )
          )
        )
      )
    })
    .filter(Boolean)

  return div(
    section(
      { class: "post-preview" },
      div(
        { class: "preview-content" },
        h2(i18n.messagePreview),
        contentWarning ? div({ class: "content-warning-preview" }, escapeHtml(contentWarning)) : null,
        div({ class: "preview-rendered", [RAW_HTML]: previewHtml })
      )
    ),
    section(
      { class: "mention-suggestions" },
      mentionCards.length ? h2(i18n.mentionsMatching) : null,
      ...mentionCards
    ),
    section(
      form(
        { action, method: "post" },
        input({ type: "hidden", name: "text", value: publishText }),
        input({ type: "hidden", name: "contentWarning", value: contentWarning || "" }),
        input({ type: "hidden", name: "mentions", value: JSON.stringify(mentions) }),
        button({ type: "submit" }, i18n.publish)
      )
    )
  )
}


exports.previewSubtopicView = async ({
  previewData,
  messages,
  myFeedId,
  contentWarning,
}) => {
  const publishAction = `/subtopic/${encodeURIComponent(messages[0].key)}`;
  const preview = generatePreview({
    previewData,
    contentWarning,
    action: publishAction,
  });
  return exports.subtopicView(
    { messages, myFeedId },
    preview, 
    previewData.text,
    contentWarning
  );
};

exports.subtopicView = async (
  { messages, myFeedId, spreadMap = null },
  preview,
  text,
  contentWarning
) => {
  const subtopicForm = `/subtopic/preview/${encodeURIComponent(
    messages[messages.length - 1].key
  )}`;

  let markdownMention;
  const getSpread = (key) => (spreadMap instanceof Map ? spreadMap.get(key) : null) || null;

  const messageElements = await Promise.all(
    messages.reverse().map((message) => {
      debug("%O", message);
      const authorName = message.value.meta.author.name;
      const authorFeedId = message.value.author;
      if (authorFeedId !== myFeedId) {
        if (message.key === messages[0].key) {
          const x = `[@${authorName}](${authorFeedId})\n\n`;
          markdownMention = x;
        }
      }
      return post({ msg: message, spreadInfo: getSpread(message.key) });
    })
  );

  const authorName = messages[messages.length - 1].value.meta.author.name;

  return template(
    i18n.subtopicTitle({ authorName }),
    div({ class: "thread-container" }, messageElements),
    form(
      { action: subtopicForm, method: "post", enctype: "multipart/form-data" },
      i18n.blogSubject,
      br(),
      label(
        i18n.contentWarningLabel,
        input({
          name: "contentWarning",
          type: "text",
          class: "contentWarning",
          value: contentWarning ? contentWarning : "",
          placeholder: i18n.contentWarningPlaceholder,
        })
      ),
      br(),
      label({ for: "text" }, i18n.blogMessage),
      br(),
      textarea(
        {
          autofocus: true,
          required: true,
          name: "text",
          rows: "6",
          cols: "50",
          placeholder: i18n.publishWarningPlaceholder,
        },
        text ? text : markdownMention
      ),
      br(),
      label(
        { for: "blob" },
        i18n.blogImage || "Upload media (max-size: 75MB)"
      ),
      input({ type: "file", id: "blob", name: "blob" }),
      br(),
      br(),
      button({ type: "submit" }, i18n.blogPublish)
    ),
    preview ? div({ class: "comment-preview" }, preview) : ""
  );
};
