const { div, h2, p, section, button, form, a, input, img, textarea, br, span, video: videoHyperaxe, audio: audioHyperaxe, table, tr, td, th, details, summary } = require("../server/node_modules/hyperaxe");
const RAW_HTML = Symbol.for('oasis.rawHtml');
const { template, herePath, i18n, paged, userLink, userLinkLabel, renderSupportButton, renderStateChip, renderCountChip, renderPhoneChip, renderModeChip, renderVisibilityChip, asChip, renderSpreadButton, renderContentActions, renderCardTop, renderShareButton, renderOpinionsPill, renderEngagement, commentCountFor, renderVotesSummary, renderModuleStats, renderCardMetaRow, renderTorrentDownload, renderTorrentSourceDownload, renderFileDownloads, torrentDownloadHref, CONTENT_FAV_KIND, CONTENT_SPREADABLE, CONTENT_TORRENTABLE, contentDeleteAction, renderPdfDocument, forumReplyAnchor, renderCommentsSummary, commentsOpenHref, RELATION_FILTERS, relationFilterLabel, clearnetItemHref } = require('./main_views');
const { renderReportStatusChip, renderReportSeverityChip, renderReportCategoryChip } = require('./report_view');
const { renderEventSummary, renderEventChips } = require('./event_view');
const { renderTaskStatusChip, renderTaskPriorityChip } = require('./task_view');
const { renderTransferStatusChip } = require('./transfer_view');
const { renderProjectStatusChip } = require('./projects_view');
const { renderChatStatusChip } = require('./chats_view');
const { renderVoteStatusChip } = require('./vote_view');
const { renderWikiStatusChip } = require('./wiki_view');
const { renderCalendarStatusChip } = require('./calendars_view');
const { renderPadStatusChip } = require('./pads_view');
const { renderRoomStatusChip } = require('./rooms_view');
const { renderMailingStatusChip, renderMailingTypeChip } = require('./mailing_view');
const { renderEmergencySeverityChip, renderEmergencyStatusChip, renderEmergencyCategoryChip } = require('./emergencies_view');
const { renderRouteKindChip, renderRouteModeChip, renderRouteStatusChip, renderRoutePriceChip } = require('./logistics_view');
const { renderCoursePriceChip } = require('./school_view');
const { renderFacilityStatusChip, renderBuildStatusChip } = require('./industry_view');
const { renderCampaignStatusChip, renderCampaignOutcomeChip, renderCampaignCategoryChip, renderCampaignSignaturesChip } = require('./campaigns_view');
const opinionCategories = require('../backend/opinion_categories');
const { roomNumberOf } = require('../models/phone_number');

const cardTitleRow = (title, href) => title ? div({ class: 'shop-title-row' }, h2({ class: 'tribe-card-title' }, href ? a({ href }, title) : title)) : null;
const cardTitleLink = (title, href) => title ? div({ class: 'card-field' }, href ? a({ href, class: 'card-value user-link' }, title) : span({ class: 'card-value' }, title)) : null;
const cardMeta = (icon, ...nodes) => p({ class: 'job-meta-line' }, `${icon} `, ...nodes);
const cardDate = (value) => value && moment(value).isValid() ? p({ class: 'time-chip' }, moment(value).format('YYYY/MM/DD HH:mm')) : null;
const cardPrice = (text) => text ? div({ class: 'price-chip' }, text) : null;
const statusIconOf = (s) => /CLOSED|DISCARDED|REJECTED|INVALID|CANCELLED|EXPIRED|FAILED|DISSOLVED|ARCHIVED/.test(s) ? '✗' : /PENDING|REVIEW|PROGRESS|PAUSED|PROPOSED|UNCONFIRMED|RESERVED/.test(s) ? '⧖' : '✓';
const plainStatusChip = (raw, label = null) => {
  const s = String(raw || '').toUpperCase();
  if (!s) return null;
  const icon = statusIconOf(s);
  return renderStateChip(icon === '✗' ? 'closed' : icon === '⧖' ? 'pending' : 'mutuals', icon, String(label || s).toUpperCase(), 'status');
};
const upperOf = (v) => String(v || '').toUpperCase();
const capWord = (v) => { const s = String(v || ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
const countOf = (v) => Array.isArray(v) ? v.length : 0;
const isPast = (value) => { const t = Date.parse(value || ''); return Number.isFinite(t) && t <= Date.now(); };
const dateChip = (label, value) => value && moment(value).isValid() ? renderCountChip('◷', label, moment(value).format('YYYY/MM/DD HH:mm')) : null;
const pickOf = (list, v, fallback) => list.includes(upperOf(v)) ? upperOf(v) : fallback;
const contentOf = (x) => (x && (x.value?.content || x.content)) || {};
const LICENSED_TYPES = new Set(['audio', 'video', 'image', 'document', 'file', 'torrent']);
const isUbiTransfer = (c) => (Array.isArray(c.tags) ? c.tags : []).some(t => upperOf(t) === 'UBI');
const transferAmountText = (c) => {
  const cat = pickOf(['ECONOMIC', 'TIME', 'TRUST'], c.category || 'ECONOMIC', 'ECONOMIC');
  if (cat === 'TRUST') return null;
  const n = Number(c.amount);
  return `${Number.isFinite(n) ? n.toFixed(6) : String(c.amount ?? '')} ${cat === 'TIME' ? i18n.transfersUnitHours : i18n.transfersUnitEco}`;
};
const jobTypeLabelOf = (jobType) => {
  const t = String(jobType || '').toLowerCase();
  return t === 'exchange' ? i18n.jobTypeExchange : t === 'employee' ? i18n.jobTypeSalary : t === 'freelancer' ? i18n.jobTypeFreelance : jobType;
};
const forumCategoryChip = (category) => {
  if (!category) return null;
  const label = i18n['forumCat' + String(category).replace(/\./g, '').replace(/[\s-]/g, '').toUpperCase()];
  const chip = renderStateChip('whole', '◇', upperOf(label || category), 'kind');
  return label ? asChip('kind', a({ href: `/forum?filter=${encodeURIComponent(category)}`, class: 'pm-exposition-chip-link' }, chip)) : chip;
};
const roomPhoneChip = (number, c) => {
  if (!number) return null;
  if (upperOf(c.status) !== 'CLOSED' && c.line === 'SWITCHBOARD') return renderPhoneChip(number, i18n.roomNumberHint);
  return span({ title: upperOf(c.status) === 'CLOSED' ? i18n.roomStatusClosed : i18n.roomLineDndError }, renderStateChip('whole', '✆', number, 'data'));
};
const forumVotesOf = (all, ids) => {
  const votes = (all || []).filter(x => x && x.type === 'vote');
  if (!votes.length) return null;
  const latest = new Map();
  for (const v of votes) {
    const vote = contentOf(v).vote;
    if (!vote || !ids.includes(vote.link)) continue;
    const prev = latest.get(v.author);
    if (!prev || (v.ts || 0) >= prev.ts) latest.set(v.author, { value: Number(vote.value) || 0, ts: v.ts || 0 });
  }
  const values = [...latest.values()];
  return { positives: values.filter(v => v.value > 0).length, negatives: values.filter(v => v.value < 0).length };
};
const campaignStateOf = (c, signatures) => {
  const goal = Math.max(0, Math.floor(Number(c.goal)) || 0);
  const achieved = goal > 0 && signatures >= goal;
  const status = upperOf(c.status) === 'CLOSED' ? 'CLOSED' : achieved ? 'ACHIEVED' : isPast(c.deadline) ? 'CLOSED' : 'OPEN';
  return { closed: status === 'CLOSED', achieved, category: upperOf(c.category), goal, signatureCount: signatures, progress: goal > 0 ? Math.min(100, Math.round((signatures / goal) * 100)) : 0 };
};

const CLEARNET_CARD_PATHS = { audio: 'audios', video: 'videos', image: 'images', document: 'documents', file: 'files', torrent: 'torrents', bookmark: 'bookmarks', post: 'blog', feed: 'feed', wikiPage: 'wiki', podcast: 'podcasts', market: 'market', shop: 'shops', schoolCourse: 'school', job: 'jobs', event: 'events', project: 'projects', emergency: 'emergencies', campaign: 'campaigns' };
const scopeChipOf = (type, content, action) => {
  const c = content || {};
  const scope = (action && action.scope) || c.scope;
  if (!scope) return null;
  const path = type === 'post' && c.root ? null : CLEARNET_CARD_PATHS[type];
  return renderScopeChip({ scope, tribeId: c.tribeId, tribeOrigin: c.tribeOrigin }, i18n, scope === 'clearnet', path ? clearnetItemHref(path, c.title || c.subject || c.name || c.question || '', (action && (action.rootId || action.id || action.key)) || '') : null);
};
const contentChipsOf = (type, content, ctx = {}) => [scopeChipOf(type, content, ctx.action), ...moduleChipsOf(type, content, ctx)];
const moduleChipsOf = (type, content, ctx = {}) => {
  const c = content || {};
  const action = ctx.action || {};
  const all = Array.isArray(ctx.all) ? ctx.all : null;
  if (LICENSED_TYPES.has(type)) return [(type === 'file' || type === 'torrent') && c.tribeId ? null : renderLicenseChip(c.license)];
  switch (type) {
    case 'tribe':
      return [renderModeChip(c.inviteMode, i18n), renderCountChip('👥', i18n.tribeMembersCount, countOf(c.members))];
    case 'votes': {
      const status = (action.vote && action.vote.status) || (upperOf(c.status || 'OPEN') === 'OPEN' && isPast(c.deadline) ? 'CLOSED' : upperOf(c.status || 'OPEN'));
      return [renderVoteStatusChip(status)];
    }
    case 'poll': {
      const poll = action.poll && typeof action.poll === 'object' ? action.poll : { status: isPast(c.deadline) ? 'CLOSED' : 'OPEN', anonymous: c.anonymous === true, multiple: c.multiple === true, deadline: c.deadline };
      return [
        renderPollStatusChip(poll),
        poll.anonymous ? renderStateChip('whole', '◈', i18n.pollAnonymous, 'level') : null,
        poll.multiple ? renderStateChip('whole', '☰', i18n.pollMultiple, 'level') : null,
        dateChip(i18n.pollDeadline, poll.deadline)
      ];
    }
    case 'wikiPage':
      return [renderWikiStatusChip(c), renderLicenseChip(c.license)];
    case 'podcast':
      return [c.category ? renderStateChip('whole', '◇', upperOf(i18n['podcastCategory' + capWord(c.category)] || c.category), 'kind') : null, renderLicenseChip(c.license)];
    case 'podcastEpisode': {
      const channel = all && c.channel ? all.find(x => x && x.type === 'podcast' && [x.id, x.key, x.rootId].includes(c.channel)) : null;
      return channel ? [renderLicenseChip(contentOf(channel).license)] : [];
    }
    case 'calendar':
      return [renderCalendarStatusChip({ isClosed: upperOf(c.status) === 'CLOSED' || isPast(c.deadline) }), renderEncryptedChip(i18n), renderCountChip('👥', i18n.calendarParticipantsLabel, countOf(c.participants))];
    case 'pad':
      return [renderPadStatusChip(c.status, upperOf(c.status) === 'CLOSED' || isPast(c.deadline)), renderEncryptedChip(i18n), renderCountChip('👥', i18n.padMembersLabel, countOf(c.members)), dateChip(i18n.padDeadlineLabel, c.deadline)];
    case 'chat':
      return [renderChatStatusChip(c.status), renderEncryptedChip(i18n), c.category ? renderStateChip('whole', '◇', upperOf(c.category), 'kind') : null, renderCountChip('👥', i18n.chatParticipants, countOf(c.members))];
    case 'room': {
      const closed = upperOf(c.status) === 'CLOSED';
      const roomType = upperOf(c.status) === 'INVITE-ONLY' || (closed && c.encrypted === true && !c.tribeId) ? 'INVITE-ONLY' : 'OPEN';
      return [renderRoomStatusChip({ isClosed: closed, type: roomType }), renderEncryptedChip(i18n), roomPhoneChip(roomNumberOf(action.rootId || action.id || action.key || ''), c), renderCountChip('👥', i18n.roomParticipants, countOf(c.members))];
    }
    case 'map': {
      const mapType = upperOf(c.mapType || 'SINGLE');
      return [renderStateChip('whole', '🗺', upperOf(i18n[`mapType${capWord(mapType)}`] || mapType), 'kind')];
    }
    case 'mailingList':
      return [renderMailingTypeChip({ listType: pickOf(['OPEN', 'CLOSED'], c.listType, 'OPEN') }), renderMailingStatusChip({ status: pickOf(['ACTIVE', 'ARCHIVED'], c.status, 'ACTIVE') })];
    case 'shop':
      return [upperOf(c.visibility) === 'CLOSED' ? renderStateChip('hidden', '✗', i18n.shopClosed) : renderStateChip('mutuals', '✓', i18n.shopOpen)];
    case 'emergency': {
      const status = upperOf(c.status) === 'RESOLVED' ? 'RESOLVED' : isPast(c.expiresAt) ? 'EXPIRED' : 'ACTIVE';
      return [renderEmergencySeverityChip(c), renderEmergencyStatusChip({ status }), c.category ? renderEmergencyCategoryChip({ category: upperOf(c.category) }) : null, dateChip(i18n.emergencyExpiresAt, c.expiresAt)];
    }
    case 'logisticsRoute': {
      const route = {
        kind: pickOf(['TRIP', 'SHIPMENT'], c.kind, 'TRIP'),
        mode: pickOf(['OFFER', 'REQUEST'], c.mode, 'OFFER'),
        status: upperOf(c.status) === 'CLOSED' ? 'CLOSED' : isPast(c.date) && pickOf(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'], c.recurrence, 'NONE') === 'NONE' ? 'PAST' : 'OPEN',
        priceType: pickOf(['FREE', 'ECO', 'TIME'], c.priceType, 'FREE'),
        price: Number(c.price) || 0
      };
      return [renderRouteKindChip(route), renderRouteModeChip(route), renderRouteStatusChip(route), renderRoutePriceChip(route)];
    }
    case 'market':
      return [
        upperOf(c.visibility) === 'HIDDEN' ? renderVisibilityChip('HIDDEN', i18n) : null,
        c.item_type ? renderStateChip('whole', '◇', upperOf(c.item_type), 'kind') : null,
        c.item_status ? renderStateChip('whole', '✧', upperOf(i18n[`marketFilter${capWord(c.item_status)}`] || c.item_status), 'level') : null,
        plainStatusChip(c.status),
        renderCountChip('▦', i18n.marketItemStock, c.stock || 0)
      ];
    case 'task':
      return [renderTaskStatusChip(c.status), renderTaskPriorityChip(c.priority), renderCountChip('👤', i18n.taskAssignedTo, countOf(c.assignees))];
    case 'report':
      return [renderReportStatusChip(c.status), renderReportSeverityChip(c.severity), c.category ? renderReportCategoryChip(c.category) : null, Array.isArray(c.confirmations) ? renderCountChip('✓', i18n.reportsConfirmations, c.confirmations.length) : null];
    case 'event':
      return renderEventChips(c);
    case 'schoolCourse':
      return [
        upperOf(c.visibility) === 'INVITE' ? renderStateChip('whole', '🔑', i18n.chatStatusInviteOnly) : null,
        upperOf(c.status) === 'CLOSED' ? renderStateChip('hidden', '✗', i18n.schoolClosed) : renderStateChip('pending', '✓', i18n.schoolOngoing),
        renderCoursePriceChip(c),
        dateChip(i18n.schoolStartDate, c.startDate)
      ];
    case 'forum': {
      const votes = typeof c.positiveVotes === 'number' ? { positives: c.positiveVotes, negatives: c.negativeVotes } : forumVotesOf(all, [action.id, action.key, action.tipId, action.rootId, c.key].filter(Boolean));
      return [
        forumCategoryChip(c.category),
        votes ? renderCountChip('▲', null, Number(votes.positives) || 0, 'vote-up') : null,
        votes ? renderCountChip('▼', null, Number(votes.negatives) || 0, 'vote-down') : null
      ];
    }
    case 'housing': {
      const ht = String(c.housing_type || '').toLowerCase();
      return [
        c.housing_type ? renderStateChip('whole', ht === 'sale' ? '🏷' : ht === 'rent' ? '🔑' : '🛋', i18n['housingType' + upperOf(c.housing_type)] || upperOf(c.housing_type), 'kind') : null,
        c.property_type ? renderStateChip('whole', '◈', upperOf(c.property_type), 'level') : null,
        plainStatusChip(c.status, c.status ? i18n['housingStatus' + upperOf(c.status)] : null),
        Number(c.rooms) > 0 ? renderCountChip('🚪', i18n.housingRooms, c.rooms) : null,
        Number(c.size) > 0 ? renderCountChip('⬚', i18n.housingSize, `${c.size} m²`) : null,
        Number(c.capacity) > 0 ? renderCountChip('👥', i18n.housingCapacity, c.capacity) : null
      ];
    }
    case 'job':
      return [
        c.job_type ? renderStateChip('whole', '◇', upperOf(jobTypeLabelOf(c.job_type)), 'kind') : null,
        plainStatusChip(c.status, c.status ? i18n['jobStatus' + upperOf(c.status)] : null),
        Number(c.vacants) > 0 ? renderCountChip('✚', i18n.jobVacants, c.vacants) : null,
        renderCountChip('👥', i18n.jobSubscribers, countOf(c.subscribers))
      ];
    case 'shopProduct':
      return [renderCountChip('▦', i18n.shopProductStock, c.stock || 0)];
    case 'project': {
      const ratio = c.goal ? Math.min(100, Math.round((parseFloat(c.pledged || 0) / parseFloat(c.goal)) * 100)) : 0;
      const milestones = Array.isArray(c.milestones) ? c.milestones : [];
      const lastMs = milestones.length ? milestones[milestones.length - 1] : null;
      const bountyVal = typeof c.bountyAmount !== 'undefined' ? c.bountyAmount : (typeof c.bounty === 'number' ? c.bounty : null);
      return [
        renderProjectStatusChip(upperOf(c.status || 'ACTIVE')),
        typeof c.progress !== 'undefined' ? renderCountChip('▰', i18n.projectProgress, `${c.progress || 0}%`) : null,
        renderCountChip('¤', i18n.projectFunding, `${ratio}%${typeof c.pledged !== 'undefined' ? ` · ${c.pledged || 0} ECO` : ''}`),
        renderCountChip('👥', i18n.projectFollowers, countOf(c.followers)),
        renderCountChip('♦', i18n.projectBackers, `${countOf(c.backers)} · ${sumAmounts(c.backers || [])} ECO`),
        milestones.length ? renderCountChip('⚑', i18n.projectMilestones, `${milestones.length}${lastMs && lastMs.title ? ' · ' + lastMs.title : ''}`) : null,
        bountyVal != null ? renderStateChip('whole', '🏆', `${bountyVal} ${upperOf(c.bounty_currency || 'ECO')}`, 'level') : null
      ];
    }
    case 'industry':
      return [
        renderFacilityStatusChip(c.status),
        c.sector ? renderStateChip('whole', '🏭', upperOf(i18n[`industrySector_${c.sector}`] || c.sector), 'kind') : null,
        c.membershipPolicy ? renderStateChip('whole', c.membershipPolicy === 'open' ? '✓' : '🔑', upperOf(i18n[`industryPolicy_${c.membershipPolicy}`] || c.membershipPolicy), 'level') : null,
        c.memberCount != null || Array.isArray(c.members) ? renderCountChip('👥', i18n.industryMembers, c.memberCount != null ? c.memberCount : countOf(c.members)) : null
      ];
    case 'transfer':
      return [
        renderTransferStatusChip(c.status),
        isUbiTransfer(c) ? renderStateChip('whole', '❄', upperOf(i18n.transfersFilterUBI), 'kind') : null,
        isPast(c.deadline) ? renderStateChip('closed', '⏰', i18n.transfersExpiredBadge, 'status') : null
      ];
    case 'campaign': {
      const signatures = typeof c.signatureCount === 'number' ? null : (all || []).filter(x => x && x.type === 'campaignSignature');
      if (signatures && !signatures.length) {
        const cp = campaignStateOf(c, 0);
        return [renderCampaignStatusChip(cp), cp.category ? renderCampaignCategoryChip(cp) : null];
      }
      const cpKey = action.id || action.key || '';
      const cp = signatures ? campaignStateOf(c, new Set(signatures.filter(x => x.content && (x.content.target === cpKey || x.content.target === (action.rootId || cpKey))).map(x => x.author)).size) : c;
      return [renderCampaignStatusChip(cp), renderCampaignOutcomeChip(cp), cp.category ? renderCampaignCategoryChip(cp) : null, renderCampaignSignaturesChip(cp)];
    }
    default:
      return [];
  }
};
exports.contentChipsOf = contentChipsOf;
exports.scopeChipOf = scopeChipOf;
exports.transferAmountText = transferAmountText;
exports.isUbiTransfer = isUbiTransfer;
exports.jobTypeLabelOf = jobTypeLabelOf;

const OPINION_TYPES = new Set(['bookmark','votes','feed','image','audio','video','document','torrent','file']);
const TORRENTABLE_TYPES = CONTENT_TORRENTABLE;
const OPINION_ROUTES = {
  feed:        (id) => `/feed/opinions/${encodeURIComponent(id)}`,
  bookmark:    (id) => `/bookmarks/opinions/${encodeURIComponent(id)}`,
  image:       (id) => `/images/opinions/${encodeURIComponent(id)}`,
  audio:       (id) => `/audios/opinions/${encodeURIComponent(id)}`,
  torrent:     (id) => `/torrents/opinions/${encodeURIComponent(id)}`,
  file:        (id) => `/files/opinions/${encodeURIComponent(id)}`,
  video:       (id) => `/videos/opinions/${encodeURIComponent(id)}`,
  document:    (id) => `/documents/opinions/${encodeURIComponent(id)}`,
  votes:       (id) => `/votes/opinions/${encodeURIComponent(id)}`
};
const moment = require("../server/node_modules/moment");
const { renderStyledText, escapeHtml, safeExternalHref } = require('../backend/renderStyledText');
const { renderPollInline, renderVotedChip, renderPollResultsField, renderPollStatusChip } = require('./polls_view');
const { renderVoteInline, renderVoteVotedChip, renderVoteResultsField } = require('./vote_view');
const { getConfig } = require("../configs/config-manager.js");
const { sanitizeHtml } = require('../backend/sanitizeHtml');
const { renderZoomableImage } = require('./gallery_view');
const { renderTribeOriginChip, renderLicenseChip, renderEncryptedChip, renderScopeChip } = require('./clearnet_view');

const MEDIA_MD_RE = /!?\[(?:image|video|audio|pdf|torrent)[^\]]*\]\(\s*&[^)\s]+\s*\)/g
const stripMediaMarkdown = (text) => String(text || '').replace(MEDIA_MD_RE, '').replace(/\n{3,}/g, '\n\n').trim()
const renderMediaObject = (m, href = null) => {
  if (!m || typeof m !== 'object' || !m.blobId) return null
  const src = `/blob/${encodeURIComponent(String(m.blobId))}`
  if (href && m.kind !== 'video' && m.kind !== 'audio') return div({ class: 'card-field image-container media-left' }, a({ href, class: 'podcast-cover-link' }, img({ src, class: 'post-image', alt: '' })))
  if (m.kind === 'video') return div({ class: 'card-field video-container' }, videoHyperaxe({ controls: true, class: 'post-video', src, preload: 'metadata' }))
  if (m.kind === 'audio') return div({ class: 'card-field audio-container' }, audioHyperaxe({ controls: true, class: 'post-audio', src, preload: 'metadata' }))
  return div({ class: 'card-field image-container media-left' }, renderZoomableImage(src, { imgClass: 'post-image' }))
}

const renderMediaBlob = (value, fallbackSrc = null) => {
  if (!value) return fallbackSrc ? img({ src: fallbackSrc, class: 'post-image' }) : null
  const s = String(value).trim()
  if (!s) return fallbackSrc ? img({ src: fallbackSrc, class: 'post-image' }) : null
  if (s.startsWith('&')) return renderZoomableImage(`/blob/${encodeURIComponent(s)}`, { imgClass: 'post-image' })
  const mVideo = s.match(/\[video:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mVideo) return videoHyperaxe({ controls: true, class: 'post-video', src: `/blob/${encodeURIComponent(mVideo[1])}`, preload: 'metadata' })
  const mAudio = s.match(/\[audio:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mAudio) return audioHyperaxe({ controls: true, class: 'post-audio', src: `/blob/${encodeURIComponent(mAudio[1])}` })
  const mImg = s.match(/!\[[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/)
  if (mImg) return renderZoomableImage(`/blob/${encodeURIComponent(mImg[1])}`, { imgClass: 'post-image' })
  return fallbackSrc ? img({ src: fallbackSrc, class: 'post-image' }) : null
}

const FEED_TEXT_MIN = Number(getConfig().feed?.minLength ?? 1);
const FEED_TEXT_MAX = Number(getConfig().feed?.maxLength ?? 280);

function cleanFeedText(t) {
  return typeof t === 'string' ? t.trim() : '';
}

function isValidFeedText(t) {
  const s = cleanFeedText(t).replace(/!?\[[^\]\n]*\]\(\s*&[^)\s]+\.sha256\s*\)/g, '').trim();
  return s.length >= FEED_TEXT_MIN && s.length <= FEED_TEXT_MAX;
}

function capitalize(str) {
  return typeof str === 'string' && str.length ? str[0].toUpperCase() + str.slice(1) : '';
}
function sumAmounts(list = []) {
  return list.reduce((s, x) => s + (parseFloat(x.amount || 0) || 0), 0);
}

function pickActiveParliamentTerm(terms) {
  if (!terms.length) return null;
  const now = Date.now();
  const getC = t => t.value?.content || t.content || {};
  const isActive = t => {
    const c = getC(t);
    const s = new Date(c.startAt || 0).getTime();
    const e = new Date(c.endAt || 0).getTime();
    return s && e && s <= now && now < e;
  };
  const cmp = (a, b) => {
    const ca = getC(a);
    const cb = getC(b);
    const aAn = String(ca.method || '').toUpperCase() === 'ANARCHY' ? 1 : 0;
    const bAn = String(cb.method || '').toUpperCase() === 'ANARCHY' ? 1 : 0;
    if (aAn !== bAn) return aAn - bAn;
    const aC = new Date(ca.createdAt || ca.startAt || 0).getTime();
    const bC = new Date(cb.createdAt || cb.startAt || 0).getTime();
    if (aC !== bC) return aC - bC;
    const aS = new Date(ca.startAt || 0).getTime();
    const bS = new Date(cb.startAt || 0).getTime();
    if (aS !== bS) return aS - bS;
    return String(a.id || '').localeCompare(String(b.id || ''));
  };
  const active = terms.filter(isActive);
  if (active.length) return active.sort(cmp)[0];
  return terms.sort(cmp)[0];
}

function safeMsgId(x) {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') return x.key || x.id || x.link || '';
  return '';
}

function normalizeSpreadLink(x) {
  const s = safeMsgId(x);
  return typeof s === 'string' && s.startsWith('thread:') ? s.slice(7) : s;
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerptPostText(content, max = 220) {
  const raw = stripHtml(content?.text || content?.description || content?.title || '');
  if (!raw) return '';
  return raw.length > max ? raw.slice(0, max - 1) + '…' : raw;
}

const decodeMaybe = (s) => {
    try { return decodeURIComponent(String(s || '')); } catch { return String(s || ''); }
};



function getThreadIdFromPost(action) {
  const c = action.value?.content || action.content || {};
  const fork = safeMsgId(c.fork);
  const root = safeMsgId(c.root);
  return fork || root || safeMsgId(action);
}

function getReplyToIdFromPost(action, byId) {
  const c = action.value?.content || action.content || {};
  const root = safeMsgId(c.root);
  const branch = Array.isArray(c.branch) ? c.branch.filter(x => typeof x === 'string') : [];
  let best = '';
  let bestTs = -1;
  for (const id of branch) {
    const a = byId.get(id);
    if (a && (a.ts || 0) > bestTs) { best = id; bestTs = a.ts || 0; }
  }
  return best || root || '';
}

function buildActivityItemsWithPostThreads(deduped, allActions) {
  const byId = new Map();
  for (const a of allActions) {
    const id = safeMsgId(a);
    if (id) byId.set(id, a);
  }
  for (const a of deduped) {
    const id = safeMsgId(a);
    if (id) byId.set(id, a);
  }

  const groups = new Map();
  const out = [];

  for (const a of deduped) {
    if (a.type !== 'post') {
      out.push(a);
      continue;
    }
    const threadId = getThreadIdFromPost(a);
    if (!groups.has(threadId)) groups.set(threadId, []);
    groups.get(threadId).push(a);
  }

  for (const [threadId, posts] of groups.entries()) {
    const sortedDesc = posts.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const hasReplies = sortedDesc.some(p => getThreadIdFromPost(p) !== safeMsgId(p)) || sortedDesc.length > 1;

    if (!hasReplies || sortedDesc.length === 1) {
      out.push(sortedDesc[0]);
      continue;
    }

    const latest = sortedDesc[0];
    let rootAction = byId.get(threadId);
    let rootId = threadId;

    if (!rootAction) {
      const asc = posts.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
      rootAction = asc[0] || null;
      rootId = safeMsgId(rootAction) || threadId;
    } else {
      rootId = safeMsgId(rootAction) || threadId;
    }

    const replies = sortedDesc
      .filter(p => safeMsgId(p) !== rootId)
      .slice()
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));

    if (!rootAction) continue;
    const rootUnknown = !byId.has(threadId) && getThreadIdFromPost(rootAction) !== safeMsgId(rootAction);
    const located = rootUnknown ? commentOf(rootAction) : null;
    const rootType = rootUnknown ? ((located && located.rootType) || 'comment') : (rootAction.type || 'post');
    out.push({
      id: `thread:${threadId}`,
      type: 'postThread',
      author: latest.author,
      ts: latest.ts,
      scope: latest.scope || rootAction.scope || null,
      content: {
        threadId,
        rootType,
        rootHref: rootType === 'post' ? `/blogs/${encodeURIComponent(threadId)}` : rootUnknown ? commentHref({ rootId: threadId, rootType: located && located.rootType }) : getViewDetailsAction(rootType, rootAction),
        root: rootAction
          ? {
              id: safeMsgId(rootAction),
              author: rootAction.author,
              subject: String((rootAction.value?.content || rootAction.content || {}).contentWarning || '').trim(),
              text: excerptPostText(rootAction.value?.content || rootAction.content || {}, 600)
            }
          : null,
        replies: replies.map(p => ({
          id: safeMsgId(p),
          author: p.author,
          ts: p.ts,
          text: excerptPostText(p.value?.content || p.content || {}, 600)
        }))
      }
    });
  }

  out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return out;
}

exports.renderActionCards = renderActionCards;
const SPREADABLE_TYPES = CONTENT_SPREADABLE;

const TRIBE_OPENED_TYPE = { event: 'typeEvent', task: 'typeTask', votation: 'typeVotes', forum: 'typeForum', feed: 'typeFeed', report: 'typeReport', image: 'typeImage', audio: 'typeAudio', video: 'typeVideo', document: 'typeDocument', bookmark: 'typeBookmark', torrent: 'typeTorrent' };
const TRIBE_OPENED_FILTER = { event: 'event', task: 'task', votation: 'votes', forum: 'forum', feed: 'feed', report: 'report', image: 'image', audio: 'audio', video: 'video', document: 'document', bookmark: 'bookmark', torrent: 'torrent' };
const tribeOpenedKey = (action) => {
  const c = (action && action.content) || {};
  return c.contentType === 'media' ? String(c.mediaType || '') : String(c.contentType || '');
};
const openedIn = (action, filter) => !!action && action.type === 'tribeOpened' && TRIBE_OPENED_FILTER[tribeOpenedKey(action)] === filter;

const renderTribeOpenedCard = (action, date, authorName, following = null, returnTo = null) => {
  const c = action.content || {};
  const origin = c.tribeOrigin || {};
  const key = tribeOpenedKey(action);
  const label = String(i18n[TRIBE_OPENED_TYPE[key]] || key || '').toUpperCase();
  const blob = typeof c.image === 'string' && c.image.startsWith('&') ? `/blob/${encodeURIComponent(c.image)}` : null;
  const media = !blob ? null
    : c.mediaType === 'video' ? videoHyperaxe({ controls: true, class: 'post-video', src: blob, preload: 'metadata' })
    : c.mediaType === 'audio' ? audioHyperaxe({ controls: true, class: 'post-audio', src: blob })
    : c.mediaType === 'image' ? renderZoomableImage(blob, { imgClass: 'post-image' })
    : null;
  const bookmarkHref = c.mediaType === 'bookmark' ? safeExternalHref(c.url) : '';
  return div({ class: 'trending-card' },
    renderCardTop(null, origin.href, {
      author: action.author,
      authorName,
      date: action.ts,
      chips: [div({ class: 'card-chips-row' },
        renderStateChip('whole', '▣', label, 'module'),
        renderTribeOriginChip(origin),
        scopeChipOf('tribeOpened', c, action)
      )]
    }),
    div({ class: 'card-section' },
      c.title ? h2(origin.href ? a({ href: origin.href }, c.title) : c.title) : null,
      c.description ? p({ class: 'post-text post-text-pre' }, ...renderStyledText(String(c.description).slice(0, 600))) : null,
      c.date || c.location ? p({ class: 'post-text' }, [c.date, c.location].filter(Boolean).join(' · ')) : null,
      media,
      bookmarkHref ? a({ href: bookmarkHref, target: '_blank', rel: 'noopener noreferrer' }, c.url) : null
    ),
    origin.href ? renderCardMetaRow(renderShareButton(safeMsgId(action.id || action.key), origin.href, c.title || ''), renderSupportButton(action.author, following, returnTo)) : null
  );
};

const cardAnchorOf = (action) => `act-${String((action && (action.id || action.key)) || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}`;

function renderActionCards(actions, userId, allActions, spreadMap = new Map(), extras = {}) {
  const all = Array.isArray(allActions) ? allActions : actions;
  const byIdAll = new Map();
  for (const a0 of all) {
    const id0 = safeMsgId(a0);
    if (id0) byIdAll.set(id0, a0);
  }
  const profileById = new Map();
  for (const a0 of all) {
    if (!a0 || a0.type !== 'about') continue;
    const c0 = a0.value?.content || a0.content || {};
    const id0 = c0.about || a0.author || '';
    if (!id0) continue;
    if (a0.author && String(a0.author) !== String(id0)) continue;
    const name0 = (typeof c0.name === 'string' && c0.name.trim()) ? c0.name.trim() : id0;
    const image0 = (typeof c0.image === 'string' && c0.image.trim()) ? c0.image.trim() : '';
    const ts0 = a0.ts || 0;
    const prev = profileById.get(id0);
    if (!prev) {
      profileById.set(id0, { id: id0, name: name0, image: image0, ts: ts0 });
      continue;
    }
    const prevHasImg = !!prev.image;
    const newHasImg = !!image0;
    if (!prevHasImg && newHasImg) profileById.set(id0, { id: id0, name: name0, image: image0, ts: ts0 });
    else if (prevHasImg === newHasImg && ts0 > (prev.ts || 0)) profileById.set(id0, { id: id0, name: name0, image: image0, ts: ts0 });
  }
  const getProfile = (id) => {
    const p0 = profileById.get(id);
    return p0 ? { id: p0.id, name: p0.name, image: p0.image } : { id, name: id, image: '' };
  };
  const validActions = actions
    .filter(action => {
      const content = action.value?.content || action.content;
      if (!content || typeof content !== 'object') return false;
      if (content.type === 'tombstone') return false;
      if (content.type === 'post' && content.private === true) return false;
      if (content.type === 'task' && content.isPublic === "PRIVATE") return false;
      if (content.type === 'event' && content.isPublic === "private") return false;
      if ((content.type === 'feed' || action.type === 'feed') && !isValidFeedText(content.text)) return false;
      if (content.type === 'market') {
        if (content.stock === 0 && content.status !== 'SOLD') {
          return false;
        }
      }
      return true;
    });
  if (!(extras && extras.ordered)) validActions.sort((a, b) => b.ts - a.ts);

  const terms = validActions.filter(a => a.type === 'parliamentTerm');
  let chosenTerm = null;
  if (terms.length) chosenTerm = pickActiveParliamentTerm(terms);
  const deduped = chosenTerm
    ? validActions.filter(a => a.type !== 'parliamentTerm' || a === chosenTerm)
    : validActions;

  if (!deduped.length) {
    return div({ class: "no-actions" }, p(i18n.noActions));
  }

  const seenDocumentTitles = new Set();
  const grouped = extras && extras.ordered ? deduped : buildActivityItemsWithPostThreads(deduped, all);
  const items = extras && extras.paged ? paged(grouped) : grouped;

  const spreadOrdinalById = new Map();
  const spreadsByLink = new Map();

  for (const a of all) {
    if (!a || a.type !== 'spread') continue;
    const c = a.value?.content || a.content || {};
    const link = normalizeSpreadLink(c.spreadTargetId || c.vote?.link || '');
    const aId = safeMsgId(a);
    if (!link || !aId) continue;
    if (!spreadsByLink.has(link)) spreadsByLink.set(link, []);
    spreadsByLink.get(link).push(a);
  }

  for (const list of spreadsByLink.values()) {
    list.sort((a, b) => (a.ts || 0) - (b.ts || 0) || String(safeMsgId(a) || '').localeCompare(String(safeMsgId(b) || '')));
    for (let i = 0; i < list.length; i++) {
      spreadOrdinalById.set(safeMsgId(list[i]), i + 1);
    }
  }

  const shopTitleById = new Map();
  for (const a of all) {
    if (!a || a.type !== 'shop') continue;
    const c = a.value?.content || a.content || {};
    const id = a.id || a.key || '';
    if (id && c.title) {
      shopTitleById.set(id, c.title);
      if (a.rootId) shopTitleById.set(a.rootId, c.title);
    }
  }

  const baseExtras = extras;
  const renderCardFor = (action, anchor) => {
    const extras = { ...baseExtras, returnTo: `${String(baseExtras.returnTo || herePath() || '/activity').split('#')[0]}#${anchor}` };
    const date = action.ts ? moment(action.ts).format("YYYY/MM/DD HH:mm") : "";
    const type = action.type || 'unknown';
    if (type === 'tribeOpened') return renderTribeOpenedCard(action, date, (action.authorNames && action.authorNames[action.author]) || getProfile(action.author).name, extras.following, extras.returnTo);
    let skip = false;
    const moduleLabel = type === 'pad' ? `${i18n.typePad} · ${i18n.padNew}`
      : type === 'wikiPage' ? i18n.typeWiki
      : type === 'emergencyUpdate' ? `${i18n.typeEmergency} · ${i18n.emergencyLastUpdate}`
      : type === 'campaignUpdate' ? `${i18n.typeCampaign} · ${i18n.emergencyLastUpdate}`
      : type === 'podcastEpisode' ? `${i18n.typePodcast} · ${i18n.typePodcastEpisode}`
      : type === 'larpHousePost' ? i18n.typeLarp
      : type === 'post' && commentOf(action) ? commentLabel(commentOf(action))
      : i18n[`type${capitalize(type)}`] || (type.startsWith('parliament') ? i18n.typeParliament : type.startsWith('courts') ? i18n.typeCourts : type);

    const content = action.value?.content || action.content || {};
    const cardBody = [];
    const cardChips = [...contentChipsOf(type, content, { action, all })];
    const titleHref = getViewDetailsAction(type, action);

    if (type === 'votes') {
      const { question, deadline, votes, totalVotes } = content;
      const voteState = action.vote && typeof action.vote === 'object'
        ? action.vote
        : { id: action.id, options: Object.keys(votes || {}), votes: votes || {}, totalVotes: Number(totalVotes) || 0, status: content.status, readOnly: true };

      cardBody.push(
        div({ class: 'card-section votes' },
          cardTitleRow(voteState.question || question || '', titleHref),
          cardDate(voteState.deadline || deadline),
          renderVoteInline(voteState, extras.returnTo || '/activity', 'va', { voteBeforeVoters: true, afterVoters: [renderVoteResultsField(voteState)] })
        )
      );
    }

    if (type === 'transfer') {
      const { concept, deadline } = content;
      cardBody.push(
        div({ class: 'card-section transfer' },
          cardTitleRow(concept, titleHref),
          cardPrice(transferAmountText(content)),
          isUbiTransfer(content) ? null : cardDate(deadline)
        )
      );
    }

    if (type === 'bankWallet') {
      const { address } = content;
      cardChips.push(renderStateChip('mutuals', '❄', i18n.bankWalletConnected, 'status'));
      cardBody.push(
        div({ class: 'card-section banking-wallet' },
          cardMeta('❄', span({ class: 'wallet-address' }, address))
        )
      );
    }




    if (type === 'pixelia') {
      const { author } = content;
      cardBody.push(
        div({ class: 'card-section pixelia' },
          div({ class: 'card-field' },
            a({ href: `/author/${encodeURIComponent(author)}`, class: 'activityVotePost' }, author)
          )
        )
      );
    }

    if (type === 'larpHousePost') {
      const { text } = content;
      cardBody.push(
        div({ class: 'card-section post' },
          text ? div({ class: 'feed-text activity-update-msg' }, p({ class: 'post-text' }, ...renderStyledText(String(text), { zoomImages: true }))) : null
        )
      );
    }

    if (type === 'tribe') {
      const { title, image, description, isAnonymous } = content;
      if (isAnonymous === true) { skip = true; }
      cardBody.push(
        div({ class: 'card-section tribe' },
          h2({ class: 'tribe-title' },
            a({ href: `/tribe/${encodeURIComponent(action.id)}`, class: "user-link" }, title)
          ),
          image
            ? (/^(\/|https?:)/.test(String(image))
                ? renderZoomableImage(image, { imgClass: 'feed-image tribe-image' })
                : renderMediaBlob(image, null))
            : null,
          p({ class: 'tribe-description' }, ...renderStyledText(description || ''))
        )
      );
    }
    if (type === 'curriculum') {
      const { author, name, description, photo, personalSkills, oasisSkills, educationalSkills, languages, professionalSkills, status, preferences } = content;
      const skillTags = (list) => list && list.length
        ? div({ class: 'card-tags' }, list.map(skill => a({ href: `/search?query=%23${encodeURIComponent(skill)}`, class: "tag-link" }, `#${skill}`)))
        : null;
      cardChips.push(
        status ? renderStateChip('whole', '◈', String(status).toUpperCase(), 'status') : null,
        preferences ? renderStateChip('whole', '◇', String(preferences).toUpperCase(), 'kind') : null,
        languages ? renderStateChip('whole', '◈', String(languages).toUpperCase(), 'level') : null
      );
      cardBody.push(
        div({ class: 'card-section curriculum' },
          h2({ class: 'tribe-card-title' }, userLink(author, name)),
          photo ? renderZoomableImage(`/blob/${encodeURIComponent(photo)}`, { imgClass: 'cv-photo', linkClass: 'zoom-inline' }) : null,
          description ? p(...renderStyledText(description)) : null,
          skillTags(personalSkills),
          skillTags(oasisSkills),
          skillTags(educationalSkills),
          skillTags(professionalSkills)
        )
      );
    }

    if (type === 'image') {
      const { url, title } = content;
      cardBody.push(
        div({ class: 'card-section image' },
          cardTitleRow(String(title || '').trim(), titleHref),
          renderZoomableImage(`/blob/${encodeURIComponent(url)}`, { imgClass: 'post-image' })
        )
      );
    }

    if (type === 'map') {
      const { lat, lng, title } = content;
      const mapKey = action.id || action.key || '';
      cardBody.push(
        div({ class: 'card-section map' },
          title ? div({ class: 'card-field' }, span({ class: 'card-value' }, mapKey ? a({ href: `/maps/${encodeURIComponent(mapKey)}`, class: 'user-link' }, title) : title)) : "",
          div({ class: 'map-card-info' },
            span({ class: 'map-coords' }, `${(parseFloat(lat) || 0).toFixed(4)}, ${(parseFloat(lng) || 0).toFixed(4)}`)
          ),
          content.description ? p({ class: 'map-description' }, content.description) : ""
        )
      );
    }

    if (type === 'mapMarker') {
      const { lat, lng, label, mapId } = content;
      cardBody.push(
        div({ class: 'card-section map' },
          span({ class: 'map-marker-dot' }, "●"),
          span(label || i18n.mapMarkerDefault || 'Marker'),
          span({ class: 'map-marker-coords' }, ` (${(parseFloat(lat) || 0).toFixed(2)}, ${(parseFloat(lng) || 0).toFixed(2)})`)
        )
      );
    }

    if (type === 'audio') {
      const { url, mimeType, title } = content;
      cardBody.push(
        div({ class: 'card-section audio' },
          title?.trim() ? h2({ class: 'audio-title' }, title) : "",
          url
            ? div({ class: "audio-container" },
                audioHyperaxe({
                  controls: true,
                  src: `/blob/${encodeURIComponent(url)}`,
                  type: mimeType
                })
              )
            : p(i18n.audioNoFile)
        )
      );
    }

    if (type === 'video') {
      const { url, mimeType, title } = content;
      cardBody.push(
        div({ class: 'card-section video' },
          title?.trim() ? h2({ class: 'video-title' }, title) : "",
          url
            ? div({ class: "video-container" },
                videoHyperaxe({
                  controls: true,
                  src: `/blob/${encodeURIComponent(url)}`,
                  type: mimeType,
                  preload: 'metadata',
                  width: '640',
                  height: '360'
                })
              )
            : p(i18n.videoNoFile)
        )
      );
    }

    if (type === 'torrent') {
      const { title, url, source, sourceName } = content;
      cardBody.push(
        div({ class: 'card-section' },
          title?.trim() ? h2({ class: 'torrent-title' }, title) : "",
          url ? div({ class: 'torrent-card-actions' },
            renderTorrentSourceDownload(action.tipId || action.id || action.key, source),
            renderTorrentDownload(torrentDownloadHref(url, title))
          ) : null
        )
      );
    }

    if (type === 'file') {
      const { title, url, fileName, torrentUrl } = content;
      cardBody.push(
        div({ class: 'card-section' },
          title?.trim() ? h2({ class: 'torrent-title' }, title) : "",
          url ? renderFileDownloads(action.tipId || action.id || action.key, torrentUrl, fileName || title) : null
        )
      );
    }

    if (type === 'document') {
      const { url, title, key } = content;
      const docKey = title ? `${action.author || ''}::${title.trim()}` : null;
      if (docKey && seenDocumentTitles.has(docKey)) {
        return null;
      }
      if (docKey) seenDocumentTitles.add(docKey);
      cardBody.push(
        div({ class: 'card-section document' },
          title?.trim() ? h2({ class: 'document-title' }, title) : "",
          renderPdfDocument(`/blob/${encodeURIComponent(url)}`, { title })
        )
      );
    }

    if (type === 'bookmark') {
      const { url } = content;
      cardBody.push(
        div({ class: 'card-section bookmark' },
          url ? div({ class: 'card-field' }, a({ href: safeExternalHref(url), target: '_blank', rel: 'noreferrer noopener', class: 'bookmark-url' }, url)) : ''
        )
      );
    }

    if (type === 'event') {
      const eventKey = action.id || action.key || '';
      cardBody.push(div({ class: 'card-section event' }, ...renderEventSummary(content, eventKey ? `/events/${encodeURIComponent(eventKey)}` : null)));
    }

    if (type === 'task') {
      const { title, startTime, endTime } = content;
      const taskKey = action.id || action.key || '';
      cardBody.push(
        div({ class: 'card-section task' },
          cardTitleLink(title || taskKey, taskKey ? `/tasks/${encodeURIComponent(taskKey)}` : null),
          startTime || endTime ? p({ class: 'post-text' }, [startTime ? moment(startTime).format("YYYY/MM/DD HH:mm") : '', endTime ? moment(endTime).format("YYYY/MM/DD HH:mm") : ''].filter(Boolean).join(' → ')) : ''
        )
      );
    }
    
    if (type === 'taskAssignment') {
        const { title, added, removed } = content || {};
        const addList = Array.isArray(added) ? added : [];
        const remList = Array.isArray(removed) ? removed : [];
        const renderUserList = (ids) =>
            ids.map((id, i) => [i > 0 ? ', ' : '', userLink(id)]).flat();
        cardBody.push(
            div({ class: 'card-section task' },
                cardTitleLink(title || '', titleHref),
                addList.length ? cardMeta('👤＋', ...renderUserList(addList)) : null,
                remList.length ? cardMeta('👤－', ...renderUserList(remList)) : null
            )
        );
    }

    if (type === 'feed') {
      const { renderStyledHtml } = require('../backend/renderStyledText');
      const { text, refeeds } = content;
      if (!isValidFeedText(text)) return null;
      const safeText = cleanFeedText(text);
      const textNodes = safeText ? renderStyledText(safeText, { zoomImages: true }) : [];
      const refeedsNum = Number(refeeds || 0) || 0;
      if (refeedsNum > 0) cardChips.push(renderCountChip('⟳', i18n.tribeFeedRefeeds, refeedsNum));
      cardBody.push(
        div({ class: 'card-section feed' },
          div({ class: 'feed-text' }, ...textNodes)
        )
      );
    }

  if (type === 'post') {
      const { contentWarning, text } = content || {};
      const rawText = text || '';
      const POST_TRUNCATE_LEN = 1000;
      const isTruncated = rawText.length > POST_TRUNCATE_LEN;
      const displayText = isTruncated ? rawText.slice(0, POST_TRUNCATE_LEN) + '…' : rawText;
      const isHtml = typeof displayText === 'string' && /<\/?[a-z][\s\S]*>/i.test(displayText);
      let bodyNode;
      if (isHtml) {
        const hasAnchor = /<a\b[^>]*>/i.test(displayText);
        const linkified = hasAnchor
          ? displayText
          : displayText.replace(
              /(https?:\/\/[^\s<]+)/g,
              (url) =>
                `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
            );
       bodyNode = div({ class: 'feed-text post-text post-text-clamped', [RAW_HTML]: sanitizeHtml(linkified) });
      } else {
        bodyNode = div({ class: 'feed-text' },
          p({ class: 'post-text post-text-pre post-text-clamped' }, ...renderStyledText(displayText, { zoomImages: true }))
        );
      }
      const threadId = getThreadIdFromPost(action);
      const replyToId = getReplyToIdFromPost(action, byIdAll);
      const isReply = !!(threadId && threadId !== action.id);
      const onContent = commentOf(action) && commentOf(action).rootType && commentOf(action).rootType !== 'post' ? commentOf(action) : null;
      const ctxHref = !isReply ? '' : onContent ? commentHref({ rootId: threadId, rootType: onContent.rootType }) : `/thread/${encodeURIComponent(threadId)}#${encodeURIComponent(replyToId || threadId)}`;
      const parent = isReply ? (byIdAll.get(replyToId) || byIdAll.get(threadId)) : null;
      const parentContent = parent ? (parent.value?.content || parent.content || {}) : {};
      const parentAuthor = parent?.author || '';
      const parentName = parent?.authorName || '';
      const parentText = parent ? excerptPostText(parentContent, 220) : '';
      cardBody.push(
        div({ class: 'card-section post' },
          isReply
            ? div(
                { class: 'reply-context' },
                span({ class: 'reply-context-label' },
                  a({ href: ctxHref, class: 'tag-link' }, i18n.inReplyTo || 'IN REPLY TO'),
                  parentAuthor ? span(' ', userLink(parentAuthor, parentName)) : ''
                ),
                parentText ? p({ class: 'post-text reply-context-text post-text-pre' }, ...renderStyledText(parentText)) : ''
              )
            : '',
          contentWarning ? h2({ class: 'content-warning' }, contentWarning) : '',
          bodyNode,
          Array.isArray(content?.tags) && content.tags.filter(Boolean).length
            ? div({ class: 'card-tags' }, content.tags.filter(Boolean).map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)))
            : ''
        )
      );
    }

    if (type === 'postThread') {
        const c = action.content || {};
        const threadId = c.threadId;
        const rootType = c.rootType || 'post';
        const isBlogThread = rootType === 'post';
        const baseHref = c.rootHref || `/blogs/${encodeURIComponent(threadId)}`;
        const href = isBlogThread || baseHref.includes('comments=open') ? baseHref : `${baseHref}${baseHref.includes('?') ? '&' : '?'}comments=open#comments-latest`;
        const threadLabel = rootType === 'comment' ? i18n.typeComment : `${rootTypeLabel(rootType)} · ${i18n.typeComment}`;
        const root = c.root;
        const replies = Array.isArray(c.replies) ? c.replies : [];
        const repliesAsc = replies.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
        const latest = repliesAsc.length ? repliesAsc[repliesAsc.length - 1] : null;
        const titleSource = root ? (root.subject || root.text || '') : '';
        const titleText = titleSource
          ? (titleSource.length > 90 ? `${titleSource.slice(0, 90)}…` : titleSource)
          : threadId;
        return div({ class: 'trending-card post-thread' + (String(action.author) === String(userId) ? ' own-content' : '') },
            renderCardTop(threadId, baseHref, {
                bylineAuthor: action.author,
                authorName: action.authorNames && action.authorNames[action.author],
                date: action.ts,
                chips: [
                    renderStateChip('whole', '▣', String(threadLabel).toUpperCase(), 'module'),
                    scopeChipOf('post', { root: true }, action),
                    renderCountChip('💬', i18n.blogComments, replies.length)
                ],
                author: c.rootAuthor || (root && root.author) || action.author,
                reportTitle: titleText,
                spread: spreadMap.get(threadId) || null,
                ...favOptsFor(rootType, threadId, extras)
            }),
            div({ class: 'card-body' },
                div({ class: 'card-section' },
                    div({ class: 'card-field activity-update-title' },
                        a({ href, class: 'card-value user-link' }, titleText)
                    ),
                    latest && latest.text
                        ? div({ class: 'feed-text activity-update-msg' },
                            p({ class: 'post-text post-text-pre' }, ...renderStyledText(latest.text, { zoomImages: true }))
                          )
                        : ''
                )
            ),
            renderCardMetaRow(renderShareButton(threadId, baseHref, titleText), renderSupportButton(action.author, extras.following, extras.returnTo))
        );
    }

    if (type === 'chatThread') {
        const c = action.content || {};
        const chatRoot = c.chatRoot;
        const href = `/chats/${encodeURIComponent(chatRoot)}`;
        const latestHref = `${href}#chat-latest`;
        const chatTitle = c.title || chatRoot;
        const replies = Array.isArray(c.replies) ? c.replies : [];
        const repliesAsc = replies.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
        const limit = 2;
        const show = repliesAsc.slice(Math.max(0, repliesAsc.length - limit));
        return div({ class: 'trending-card post-thread chat-thread' + (String(action.author) === String(userId) ? ' own-content' : '') },
            renderCardTop(chatRoot, href, {
                bylineAuthor: action.author,
                authorName: action.authorNames && action.authorNames[action.author],
                date: action.ts,
                chips: [
                    renderStateChip('whole', '▣', `${String(i18n.typeChat || 'CHAT').toUpperCase()} \u00b7 ${String(i18n.activityUpdateLabel || 'UPDATE').toUpperCase()}`, 'module'),
                    scopeChipOf('chatThread', c, action),
                    renderCountChip('👥', i18n.chatParticipants, c.members || 0),
                    renderCountChip('💬', i18n.messages, c.messageCount || show.length)
                ],
                author: c.chatAuthor || action.author,
                reportTitle: chatTitle,
                spread: spreadMap.get(chatRoot) || null,
                ...favOptsFor('chat', chatRoot, extras)
            }),
            div({ class: 'card-body' },
                div({ class: 'card-section chat' },
                    div({ class: 'card-field activity-update-title' },
                        a({ href: latestHref, class: 'card-value user-link' }, chatTitle)
                    ),
                    (() => {
                        const latest = show.length ? show[show.length - 1] : null;
                        if (!latest) return '';
                        const rawBlob = String(latest.image || '').trim();
                        const attSrc = rawBlob.startsWith('&') ? `/blob/${encodeURIComponent(rawBlob)}` : null;
                        const mime = String(latest.mimeType || '');
                        const attNode = attSrc
                            ? (mime.startsWith('video/')
                                ? videoHyperaxe({ controls: true, class: 'post-video', src: attSrc, type: mime, preload: 'metadata' })
                                : mime.startsWith('audio/')
                                  ? audioHyperaxe({ controls: true, class: 'post-audio', src: attSrc, type: mime, preload: 'metadata' })
                                  : mime === 'application/pdf'
                                    ? a({ href: attSrc, target: '_blank', rel: 'noopener', class: 'filter-btn' }, '📄 PDF')
                                    : mime.includes('bittorrent') || mime === 'application/x-torrent'
                                      ? renderTorrentDownload(attSrc)
                                      : renderZoomableImage(attSrc, { imgClass: 'post-image' }))
                            : renderMediaBlob(latest.image);
                        const textNode = latest.text
                            ? p({ class: 'post-text post-text-pre' }, ...(latest.poll ? [span({ class: 'card-label' }, `${String(i18n.pollInChat || 'Poll').toUpperCase()}: `)] : []), ...renderStyledText(latest.text, { zoomImages: true }))
                            : null;
                        const quoted = latest.reply || null;
                        const replyNode = quoted
                            ? div({ class: 'reply-context' },
                                span({ class: 'reply-context-meta' },
                                  a({ href: `${href}#${forumReplyAnchor(quoted.id)}`, class: 'tag-link' }, i18n.inReplyTo || 'IN REPLY TO'),
                                  quoted.author ? span(' ', userLink(quoted.author, action.authorNames && action.authorNames[quoted.author])) : ''
                                ),
                                quoted.text ? p({ class: 'post-text reply-context-text' }, quoted.text) : ''
                              )
                            : null;
                        return (textNode || attNode || replyNode)
                            ? div({ class: 'feed-text activity-update-msg' }, ...[replyNode, textNode, attNode].filter(Boolean))
                            : '';
                    })()
                )
            ),
            renderCardMetaRow(renderShareButton(chatRoot, href, chatTitle), renderSupportButton(action.author, extras.following, extras.returnTo))
        );
    }

    if (type === 'forum') {
      const { root, category, title, text, key, rootTitle, rootKey } = content;
      if (!root) {
        const linkKey = key || action.id;
        const linkText = (title && String(title).trim()) ? title : '';
        cardBody.push(
          div({ class: 'card-section forum' },
            div({ class: 'card-field' },
              linkKey
                ? a({ href: `/forum/${encodeURIComponent(linkKey)}`, class: 'card-value user-link' }, linkText || linkKey)
                : span({ class: 'card-value' }, linkText)
            )
          )
        );
      } else {
        const rootId = typeof root === 'string' ? root : (root?.key || root?.id || '');
        const parentForum = byIdAll.get(rootId) || actions.find(a => a.type === 'forum' && !a.content?.root && (a.id === rootId || a.content?.key === rootId));
        const parentContent = parentForum ? (parentForum.value?.content || parentForum.content || {}) : {};
        const parentTitle = (parentContent?.title && String(parentContent.title).trim()) ? parentContent.title : ((rootTitle && String(rootTitle).trim()) ? rootTitle : '');
        if (!category) cardChips.push(forumCategoryChip(parentContent.category));
        const branchId = typeof content.branch === 'string' && content.branch !== rootId && content.branch !== rootKey ? content.branch : '';
        const branchMsg = branchId ? (byIdAll.get(branchId) || actions.find(a => a.type === 'forum' && (a.id === branchId || a.content?.key === branchId))) : null;
        const repliedAuthor = branchMsg ? (branchMsg.author || '') : '';
        const repliedName = branchMsg ? (branchMsg.authorName || '') : '';
        const hrefKey = rootKey || rootId;
        cardBody.push(
          div({ class: 'card-section forum' },
            div(
              { class: 'reply-context' },
              span({ class: 'reply-context-meta' },
                a({ href: `/forum/${encodeURIComponent(hrefKey)}#${forumReplyAnchor(action.tipId || action.id)}`, class: 'tag-link' }, repliedAuthor ? i18n.inReplyTo : i18n.forumInThread),
                repliedAuthor ? span(' ', userLink(repliedAuthor, repliedName)) : ''
              ),
              parentTitle ? p({ class: 'post-text reply-context-text' }, parentTitle) : ''
            ),
            div({ class: 'card-field forum-reply-body' },
              p({ class: 'forum-reply-text' }, ...renderStyledText(text, { zoomImages: true }))
            )
          )
        );
      }
    }

 if (type === 'spread') {
  const link = normalizeSpreadLink(content?.spreadTargetId || content?.vote?.link || '');
  const target = link ? (byIdAll.get(link) || byIdAll.get(decodeMaybe(link)) || byIdAll.get(encodeURIComponent(link))) : null;
  const tContent = target ? (target.value?.content || target.content || {}) : {};
  const spreadTitle =
    (typeof content?.spreadTitle === 'string' && content.spreadTitle.trim())
      ? content.spreadTitle.trim()
      : (typeof tContent?.title === 'string' && tContent.title.trim())
        ? tContent.title.trim()
        : (typeof tContent?.name === 'string' && tContent.name.trim())
          ? tContent.name.trim()
          : '';
  const spreadContentWarning =
    (typeof content?.spreadContentWarning === 'string' && content.spreadContentWarning.trim())
      ? content.spreadContentWarning.trim()
      : (typeof tContent?.contentWarning === 'string' && tContent.contentWarning.trim())
        ? tContent.contentWarning.trim()
        : '';
  const spreadText =
    (typeof content?.spreadText === 'string' && content.spreadText.trim())
      ? content.spreadText.trim()
      : excerptPostText(tContent, 700);
  const spreadOriginalAuthor =
    (typeof content?.spreadOriginalAuthor === 'string' && content.spreadOriginalAuthor.trim())
      ? content.spreadOriginalAuthor.trim()
      : (target?.author || '');
  const ord = spreadOrdinalById.get(safeMsgId(action)) || 0;
  const totalChron = link && spreadsByLink.has(link) ? spreadsByLink.get(link).length : 0;
  const value = ord && totalChron ? `${ord}/${totalChron}` : (ord ? String(ord) : '');
  if (value) cardChips.push(renderCountChip('⟳', i18n.spreadChron || 'Spread', value));
  const spreadExcerpt = spreadText || excerptPostText(content, 300);
  cardBody.push(
    div({ class: 'card-section vote' },
      spreadTitle ? h2({ class: 'post-title activity-spread-title' }, spreadTitle) : '',
      spreadContentWarning ? h2({ class: 'content-warning' }, spreadContentWarning) : '',
      spreadExcerpt
        ? div({ class: 'post-text activity-spread-text post-text-pre activity-spread-clamped' }, ...renderStyledText(spreadExcerpt, { zoomImages: true }))
        : div({ class: 'post-text activity-spread-text activity-spread-missing' }, i18n.spreadContentUnavailable || 'Content not yet available (pending replication)'),
      spreadOriginalAuthor
        ? div({ class: 'card-field' },
            span({ class: 'card-value' }, userLink(spreadOriginalAuthor))
          )
        : '',
      link
        ? div({ class: 'card-section-action' },
            a({ href: `/thread/${encodeURIComponent(link)}#${encodeURIComponent(link)}`, class: 'filter-btn' }, i18n.viewDetails || 'View details')
          )
        : ''
    )
  );
}

    if (type === 'vote') {
      const { vote } = content;
      cardBody.push(
        div({ class: 'card-section vote' },
          p(
            a({ href: `/thread/${encodeURIComponent(vote.link)}#${encodeURIComponent(vote.link)}`, class: 'activityVotePost' }, vote.link)
          )
        )
      );
    }

    if (type === 'about') {
      const { about, name, image, description } = content;
      const imgId = image ? (typeof image === 'string' ? image : (image.link || '')) : '';
      cardBody.push(
        div({ class: 'card-section about' },
          div({ class: 'about-card-cols' },
            div({ class: 'about-card-col-img' },
              imgId
                ? renderZoomableImage(`/blob/${encodeURIComponent(imgId)}`, { thumb: `/image/256/${encodeURIComponent(imgId)}?fallback=avatar`, imgClass: 'activity-avatar', alt: name, linkClass: 'zoom-inline' })
                : img({ src: '/assets/images/default-avatar.png', alt: name, class: 'activity-avatar' })
            ),
            div({ class: 'about-card-col-desc' },
              h2({ class: 'about-card-header' }, userLink(about, name)),
              description
                ? p({ class: 'tribe-side-description' }, ...renderStyledText(String(description)))
                : null
            )
          )
        )
      );
    }

    if (type === 'market') {
      const { item_type, title, price, status, deadline, image, auctions_poll, seller } = content;
      const isSeller = seller && userId && seller === userId;
      cardBody.push(
        div({ class: 'card-section market' },
          cardTitleRow(title, titleHref),
          cardPrice(`${price} ECO`),
          cardDate(deadline),
          image ? renderMediaBlob(image, '/assets/images/default-market.png') : null,
          item_type === 'auction' && status !== 'SOLD' && status !== 'DISCARDED' && !isSeller
            ? div({ class: "auction-info" },
                auctions_poll && auctions_poll.length > 0
                  ?
                      table({ class: 'auction-bid-table' },
                        tr(
                          th(i18n.marketAuctionBidTime),
                          th(i18n.marketAuctionUser),
                          th(i18n.marketAuctionBidAmount)
                        ),
                        ...(auctions_poll || []).map(bid => {
                          const [bidderId, bidAmount, bidTime] = bid.split(':');
                          return tr(
                            td(moment(bidTime).format('YYYY-MM-DD HH:mm:ss')),
                            td(userLink(bidderId)),
                            td(`${parseFloat(bidAmount).toFixed(6)} ECO`)
                          );
                        })
                      )
                  : p(i18n.marketNoBids)
              ) : ""
        )
      );
    }

    if (type === 'shop') {
      const { title, shortDescription, description, location } = content;
      const shopKey = action.id || action.key || '';
      const displayDesc = shortDescription || (description ? (description.length > 140 ? description.slice(0, 140) + "\u2026" : description) : "");
      cardBody.push(
        div({ class: 'card-section shop' },
          cardTitleRow(title || shopKey, shopKey ? `/shops/${encodeURIComponent(shopKey)}` : null),
          displayDesc ? p({ class: 'tribe-card-description' }, displayDesc) : null,
          location ? cardMeta('📍', location) : null
        )
      );
    }

    if (type === 'shopProduct') {
      const { title, price, shopId, image: prodImage } = content;
      const resolvedShopTitle = shopId ? (shopTitleById.get(shopId) || null) : null;
      const shopLabel = resolvedShopTitle || (shopId ? shopId.slice(0, 10) + '...' : '');
      const prodImageNode = renderMediaBlob(prodImage);
      cardBody.push(
        div({ class: 'card-section shop' },
          cardTitleRow(title || '', titleHref),
          shopId ? cardMeta('🏪', a({ href: `/shops/${encodeURIComponent(shopId)}`, class: 'user-link' }, shopLabel)) : null,
          cardPrice(`${Number(price || 0).toFixed(6)} ECO`),
          prodImageNode ? div({ class: 'card-field' }, prodImageNode) : null
        )
      );
    }

    if (type === 'industry') {
      const { name, description, image, tags } = content;
      const facKey = action.id || action.key || '';
      const validTags = Array.isArray(tags) ? tags : [];
      cardBody.push(
        div({ class: 'card-section tribe industry' },
          cardTitleRow(name || (i18n.industryTitle || 'Industry'), `/industry/${encodeURIComponent(facKey)}`),
          image
            ? (/^(\/|https?:)/.test(String(image))
                ? renderZoomableImage(image, { imgClass: 'feed-image tribe-image' })
                : renderMediaBlob(image, null))
            : null,
          description ? p({ class: 'tribe-description' }, ...renderStyledText(description)) : null,
          validTags.length
            ? div({ class: 'card-tags' }, validTags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)))
            : null
        )
      );
    }

    if (type === 'industryBuild') {
      const { title, notes, image, startDate, endDate, buildStatus } = content;
      const buildKey = action.id || action.key || '';
      const daysLeft = endDate ? Math.max(0, Math.ceil((new Date(endDate) - Date.now()) / 86400000)) : null;
      cardChips.push(
        buildStatus ? renderBuildStatusChip(buildStatus) : null,
        daysLeft != null ? renderCountChip('⧗', i18n.industryTimeLeft || 'Time left', `${daysLeft}d`) : null
      );
      cardBody.push(
        div({ class: 'card-section tribe industry' },
          cardTitleRow(title || (i18n.industryBuild || 'Build'), `/industry/build/${encodeURIComponent(buildKey)}`),
          startDate || endDate ? p({ class: 'time-chip' }, [startDate ? moment(startDate).format('YYYY/MM/DD') : '', endDate ? moment(endDate).format('YYYY/MM/DD') : ''].filter(Boolean).join(' → ')) : null,
          image
            ? (/^(\/|https?:)/.test(String(image))
                ? renderZoomableImage(image, { imgClass: 'feed-image tribe-image' })
                : renderMediaBlob(image, null))
            : null,
          notes ? p({ class: 'tribe-description' }, ...renderStyledText(notes)) : null
        )
      );
    }

    if (type === 'industryBlueprint') {
      const { name, facility, description, outKind, laborHours, image, estTotal } = content;
      cardChips.push(
        outKind ? renderStateChip('whole', outKind === 'digital' ? '💾' : '📦', String(i18n['industryKind_' + outKind] || outKind).toUpperCase(), 'kind') : null,
        laborHours ? renderCountChip('◷', i18n.industryLaborHours || 'Labor hours', `${laborHours} h`) : null
      );
      cardBody.push(
        div({ class: 'card-section tribe industry' },
          cardTitleRow(name || (i18n.industryBlueprint || 'Blueprint'), facility ? `/industry/${encodeURIComponent(facility)}` : null),
          estTotal != null ? cardPrice(`${Number(estTotal).toFixed(2)} ECO`) : null,
          image
            ? (/^(\/|https?:)/.test(String(image))
                ? renderZoomableImage(image, { imgClass: 'feed-image tribe-image' })
                : renderMediaBlob(image, null))
            : null,
          description ? p({ class: 'tribe-description' }, ...renderStyledText(description)) : null
        )
      );
    }

    if (type === 'industryAllocation') {
      const { target, pot } = content;
      cardBody.push(
        div({ class: 'card-section industry' },
          cardTitleRow(i18n.industryBuild || 'Build', target ? `/industry/build/${encodeURIComponent(target)}` : null),
          cardPrice(`${Number(pot || 0).toFixed(6)} ECO`)
        )
      );
    }

    if (type === 'chat') {
      const { title, description } = content;
      const chatKey = action.id || action.key || '';
      const displayDesc = description ? (description.length > 140 ? description.slice(0, 140) + "\u2026" : description) : "";
      cardBody.push(
        div({ class: 'card-section chat' },
          cardTitleRow(title || chatKey, chatKey ? `/chats/${encodeURIComponent(chatKey)}#chat-latest` : null),
          displayDesc ? p({ class: 'tribe-card-description' }, displayDesc) : null
        )
      );
    }

    if (type === 'pad') {
      const padKey = action.id || action.key || '';
      const padTitle = content.title || action.title || '';
      cardBody.push(
        div({ class: 'card-section' },
          cardTitleRow(padTitle || padKey, padKey ? `/pads/${encodeURIComponent(padKey)}` : null)
        )
      );
    }

    if (type === 'room') {
      const roomKey = action.id || action.key || '';
      const roomTitle = content.title || action.title || '';
      cardBody.push(
        div({ class: 'card-section' },
          cardTitleRow(roomTitle || roomKey, roomKey ? `/rooms/${encodeURIComponent(roomKey)}` : null),
          content.description ? p({ class: 'tribe-card-description' }, String(content.description).slice(0, 200)) : null
        )
      );
    }

    if (type === 'emergency') {
      const emergencyKey = action.id || action.key || '';
      const emergencyTitle = content.title || action.title || '';
      cardBody.push(
        div({ class: 'card-section' },
          cardTitleRow(emergencyTitle || emergencyKey, emergencyKey ? `/emergencies/${encodeURIComponent(emergencyKey)}` : null),
          renderMediaBlob(content.text, null),
          stripMediaMarkdown(content.text) ? p({ class: 'tribe-description' }, ...renderStyledText(stripMediaMarkdown(content.text))) : null
        )
      );
    }

    if (type === 'mailingList') {
      const listKey = action.id || action.key || '';
      const listTitle = content.title || action.title || '';
      cardBody.push(
        div({ class: 'card-section' },
          cardTitleRow(listTitle || listKey, listKey ? `/mailing/${encodeURIComponent(listKey)}` : null)
        )
      );
    }

    if (type === 'logisticsRoute') {
      const routeKey = action.id || action.key || '';
      const routeTitle = content.title || action.title || '';
      cardBody.push(
        div({ class: 'card-section' },
          cardTitleRow(routeTitle || routeKey, routeKey ? `/logistics/${encodeURIComponent(routeKey)}` : null),
          content.origin || content.destination ? p({ class: 'logistics-route-line' }, span({ class: 'logistics-zone' }, content.origin || ''), ' → ', span({ class: 'logistics-zone' }, content.destination || '')) : null,
          cardDate(content.date),
          renderMediaBlob(content.description, null),
          stripMediaMarkdown(content.description) ? p({ class: 'tribe-description' }, ...renderStyledText(stripMediaMarkdown(content.description))) : null
        )
      );
    }

    if (type === 'podcast' || type === 'podcastEpisode') {
      const pKey = action.id || action.key || '';
      const pTitle = content.title || action.title || '';
      const pHref = type === 'podcast' ? `/podcasts/${encodeURIComponent(pKey)}` : `/podcasts/episode/${encodeURIComponent(pKey)}`;
      const pDesc = stripMediaMarkdown(content.description);
      const pShortDesc = pDesc ? (pDesc.length > 140 ? pDesc.slice(0, 140) + "\u2026" : pDesc) : '';
      cardBody.push(
        div({ class: 'card-section' },
          type === 'podcastEpisode' ? null : cardTitleRow(pTitle || pKey, pKey ? pHref : null),
          pShortDesc ? p({ class: 'tribe-card-description' }, pShortDesc) : null,
          renderMediaObject(type === 'podcast' ? content.cover : content.media, type === 'podcast' ? pHref : null)
        )
      );
    }

    if (type === 'campaign') {
      const cpKey = action.id || action.key || '';
      const cpTitle = content.title || action.title || '';
      cardBody.push(
        div({ class: 'card-section' },
          cardTitleRow(cpTitle || cpKey, cpKey ? `/campaigns/${encodeURIComponent(cpKey)}` : null),
          renderMediaBlob(content.text, null),
          stripMediaMarkdown(content.text) ? p({ class: 'tribe-description' }, ...renderStyledText(stripMediaMarkdown(content.text))) : null
        )
      );
    }

    if (type === 'campaignUpdate') {
      const targetId = String(content.target || '');
      const parent = all.find(x => x && (x.id === targetId || x.key === targetId || x.rootId === targetId || x.tipId === targetId)) || null;
      const parentContent = parent ? (parent.value?.content || parent.content || {}) : {};
      const parentTitle = parentContent.title || '';
      cardBody.push(
        div({ class: 'card-section' },
          div({ class: 'reply-context' },
            span({ class: 'reply-context-meta' },
              a({ href: `/campaigns/${encodeURIComponent(targetId)}`, class: 'tag-link' }, i18n.emergencyLastUpdate || 'LAST UPDATE'),
              parentTitle ? span(' ', a({ href: `/campaigns/${encodeURIComponent(targetId)}`, class: 'user-link' }, parentTitle)) : ''
            )
          ),
          renderMediaBlob(content.text, null),
          stripMediaMarkdown(content.text) ? div({ class: 'card-field' }, p({ class: 'forum-reply-text' }, ...renderStyledText(stripMediaMarkdown(content.text)))) : ''
        )
      );
    }

    if (type === 'emergencyUpdate') {
      const targetId = String(content.target || '');
      const parent = all.find(x => x && (x.id === targetId || x.key === targetId || x.rootId === targetId || x.tipId === targetId)) || null;
      const parentContent = parent ? (parent.value?.content || parent.content || {}) : {};
      const parentTitle = parentContent.title || '';
      cardBody.push(
        div({ class: 'card-section' },
          div({ class: 'reply-context' },
            span({ class: 'reply-context-meta' },
              a({ href: `/emergencies/${encodeURIComponent(targetId)}`, class: 'tag-link' }, i18n.emergencyLastUpdate || 'LAST UPDATE'),
              parentTitle ? span(' ', a({ href: `/emergencies/${encodeURIComponent(targetId)}`, class: 'user-link' }, parentTitle)) : ''
            )
          ),
          renderMediaBlob(content.text, null),
          stripMediaMarkdown(content.text) ? div({ class: 'card-field' }, p({ class: 'forum-reply-text' }, ...renderStyledText(stripMediaMarkdown(content.text)))) : ''
        )
      );
    }

    if (type === 'wikiPage') {
      const wikiKey = action.id || action.key || '';
      const wikiTitle = content.title || action.title || '';
      cardBody.push(
        div({ class: 'card-section' },
          div({ class: 'card-field' }, wikiKey ? a({ href: `/wiki/${encodeURIComponent(wikiKey)}`, class: 'card-value user-link' }, wikiTitle || wikiKey) : span({ class: 'card-value' }, wikiTitle || ''))
        )
      );
    }

    if (type === 'calendar') {
      const calKey = action.id || action.key || '';
      const calTitle = content.title || action.title || '';
      cardBody.push(
        div({ class: 'card-section' },
          div({ class: 'card-field' }, calKey ? a({ href: `/calendars/${encodeURIComponent(calKey)}`, class: 'card-value user-link' }, calTitle || calKey) : span({ class: 'card-value' }, calTitle || ''))
        )
      );
    }

    if (type === 'poll') {
      const poll = action.poll && typeof action.poll === 'object'
        ? action.poll
        : {
            id: action.id,
            question: content.question || '',
            options: Array.isArray(content.options) ? content.options : [],
            counts: (action.pollCounts && typeof action.pollCounts === 'object') ? action.pollCounts : {},
            totalVoters: Number(action.pollVoters) || 0,
            myChoices: [],
            readOnly: true,
            multiple: content.multiple === true
          };
      cardBody.push(
        div({ class: 'card-section poll' },
          div({ class: 'card-field' },
            span({ class: 'card-value' }, poll.question || content.question || '')
          ),
          renderPollInline(poll, extras.returnTo || '/activity', 'pa', { voteBeforeVoters: true, afterVoters: poll.undecryptable ? null : [renderPollResultsField(poll)] })
        )
      );
    }

    if (type === 'report') {
      const { title } = content;
      const reportKey = action.id || action.key || '';
      cardBody.push(
        div({ class: 'card-section report' },
          cardTitleLink(title || reportKey, reportKey ? `/reports/${encodeURIComponent(reportKey)}` : null)
        )
      );
    }

    if (type === 'project') {
      const { title, goal, deadline, activity } = content;

      if (activity && activity.kind) {
        const tmpl =
          activity.kind === 'follow'
            ? (i18n.activityProjectFollow || '%OASIS% is now %ACTION% this project: %PROJECT%')
            : activity.kind === 'unfollow'
              ? (i18n.activityProjectUnfollow || '%OASIS% is now %ACTION% this project: %PROJECT%')
              : '%OASIS% performed an unknown action on %PROJECT%';

        const actionWord =
          activity.kind === 'follow'
            ? (i18n.following || 'FOLLOWING')
            : activity.kind === 'unfollow'
              ? (i18n.unfollowing || 'UNFOLLOWING')
              : 'ACTION';

        const actorId = activity.activityActor || '';
        const actorLink = `<a class="user-link" href="/author/${encodeURIComponent(actorId)}">${escapeHtml(userLinkLabel(actorId))}</a>`;
        const projectLink = `<a class="user-link" href="/projects/${encodeURIComponent(action.tipId || action.id)}">${escapeHtml(title || '')}</a>`;
        const msgHtml = tmpl
          .replace('%OASIS%', () => actorLink)
          .replace('%PROJECT%', () => projectLink)
          .replace('%ACTION%', () => `<strong>${escapeHtml(actionWord)}</strong>`);

        return div({ class: 'card card-rpg' },
          renderCardTop(null, `/projects/${encodeURIComponent(action.tipId || action.id)}`, {
            author: action.author,
            authorName: action.authorNames && action.authorNames[action.author],
            date: action.ts,
            chips: [div({ class: 'card-chips-row' },
              renderStateChip('whole', '▣', upperOf(i18n.typeProject), 'module'),
              scopeChipOf('project', content, action)
            )]
          }),
          div(
            p({ [RAW_HTML]: sanitizeHtml(msgHtml) })
          ),
          renderEngagement(safeMsgId(action.tipId || action.id), null, null, { href: `/projects/${encodeURIComponent(action.tipId || action.id)}`, title: title || '', author: action.author })
        );
      }

      cardBody.push(
        div({ class: 'card-section project' },
          cardTitleRow(title, titleHref),
          typeof goal !== 'undefined' ? cardPrice(`${goal} ECO`) : null,
          cardDate(deadline)
        )
      );
    }
      
    if (type === 'karmaScore') {
      const { karmaScore } = content;
      cardChips.push(renderCountChip('★', i18n.bankingUserEngagementScore, karmaScore || 0));
    }

    if (type === 'housing') {
      const { title, housing_type, price, place } = content;
      const isFree = String(housing_type || '').toLowerCase() === 'couchsurfing';
      cardBody.push(
        div({ class: 'card-section housing' },
          cardTitleRow(title, titleHref),
          cardPrice(isFree ? (i18n.housingFree || 'FREE') : `${Number(price || 0).toFixed(2)} ECO`),
          place ? cardMeta('📍', place) : null
        )
      );
    }

    if (type === 'schoolCourse') {
      const { title, description } = content;
      cardBody.push(
        div({ class: 'card-section school' },
          cardTitleRow(title, titleHref),
          description ? p({ class: 'tribe-card-description' }, String(description).length > 220 ? String(description).slice(0, 220) + '…' : description) : null
        )
      );
    }

    if (type === 'job') {
      const { title, location, salary } = content;
      cardBody.push(
        div({ class: 'card-section job' },
          cardTitleRow(title, titleHref),
          salary ? cardPrice(`${salary} ECO`) : null,
          location ? cardMeta('📍', String(location)) : null
        )
      );
    }

    if (type === 'parliamentCandidature') {
      const { targetType, targetId, targetTitle, method } = content;
      const link = targetType === 'tribe'
        ? a({ href: `/tribe/${encodeURIComponent(targetId)}`, class: 'user-link' }, targetTitle || targetId)
        : userLink(targetId);

      const methodUpper = String(
        i18n['parliamentMethod' + String(method || '').toUpperCase()] || method
      ).toUpperCase();

      cardChips.push(renderStateChip('whole', '◈', methodUpper, 'level'));
      cardBody.push(
        div({ class: 'card-section parliament' },
          h2({ class: 'tribe-card-title' }, link)
        )
      );
    }

    if (type === 'parliamentTerm') {
      const { method, powerType, powerId, powerTitle, startAt, endAt } = content;
      const powerTypeNorm = String(powerType || '').toLowerCase();
      const winnerLink =
        powerTypeNorm === 'tribe'
          ? a({ href: `/tribe/${encodeURIComponent(powerId)}`, class: 'user-link' }, powerTitle || powerId)
          : powerTypeNorm === 'none' || !powerTypeNorm
            ? a({ href: `/parliament?filter=government`, class: 'user-link' }, (i18n.parliamentAnarchy || 'ANARCHY'))
            : userLink(powerId, powerTitle);

      cardBody.push(
        div({ class: 'card-section parliament' },
          h2({ class: 'tribe-card-title' }, winnerLink),
          startAt || endAt ? p({ class: 'time-chip' }, [startAt ? moment(startAt).format("YYYY/MM/DD HH:mm") : '', endAt ? moment(endAt).format("YYYY/MM/DD HH:mm") : ''].filter(Boolean).join(' → ')) : null
        )
      );
    }

    if (type === 'parliamentProposal') {
      const { title, method, status, voteId } = content;
      const legacy = !content.campaignId ? String(content.description || '').match(/\n*\s*(\d+) signatures: \/campaigns\/(%[^\s]+\.sha256)\s*$/) : null;
      const description = legacy ? String(content.description || '').slice(0, legacy.index).trim() : content.description;
      const campaignId = content.campaignId || (legacy ? legacy[2] : '');
      const liveSignatures = campaignId ? new Set(all.filter(x => x && x.type === 'campaignSignature' && x.content && x.content.target === campaignId).map(x => x.author)).size : 0;
      const signatures = Math.max(liveSignatures, content.campaignId ? (Number(content.signatures) || 0) : (legacy ? Number(legacy[1]) || 0 : 0));
      const goal = Number(content.goal) || 0;

      const methodUpper = String(
        i18n['parliamentMethod' + String(method || '').toUpperCase()] || method
      ).toUpperCase();

      cardChips.push(
        renderStateChip('whole', '◈', methodUpper, 'level'),
        plainStatusChip(status),
        campaignId ? renderCountChip('✍', i18n.campaignSignaturesLabel, `${signatures}${goal > 0 ? ` / ${goal}` : ''}`) : null
      );
      cardBody.push(
        div({ class: 'card-section parliament' },
          cardTitleRow(title || campaignId, campaignId ? `/campaigns/${encodeURIComponent(campaignId)}` : null),
          renderMediaBlob(description, null),
          stripMediaMarkdown(description) ? p({ class: 'card-section-text' }, ...renderStyledText(stripMediaMarkdown(description))) : null,
          voteId ? cardMeta('☑', a({ href: `/votes/${encodeURIComponent(voteId)}`, class: 'tag-link' }, i18n.parliamentOpenVote)) : null
        )
      );
    }
    
    if (type === 'parliamentRevocation') {
      const { title, reasons, method, status, voteId } = content;
      const methodUpper = String(
        i18n['parliamentMethod' + String(method || '').toUpperCase()] || method
      ).toUpperCase();

      cardChips.push(renderStateChip('whole', '◈', methodUpper, 'level'), plainStatusChip(status));
      cardBody.push(
        div({ class: 'card-section parliament' },
          cardTitleRow(title, null),
          reasons ? p({ class: 'card-section-text' }, reasons) : null,
          voteId ? cardMeta('☑', a({ href: `/votes/${encodeURIComponent(voteId)}`, class: 'tag-link' }, i18n.parliamentOpenVote)) : null
        )
      );
    }

    if (type === 'parliamentLaw') {
      const { question, description, method, proposer, enactedAt, votes } = content;
      const yes = Number(votes?.YES || 0);
      const total = Number(votes?.total || votes?.TOTAL || 0);

      const methodUpper = String(
        i18n['parliamentMethod' + String(method || '').toUpperCase()] || method
      ).toUpperCase();

      cardChips.push(
        renderStateChip('whole', '◈', methodUpper, 'level'),
        (total || yes) ? renderCountChip('☑', i18n.parliamentLawVotes || 'Votes', `${yes}/${total}`) : null
      );
      cardBody.push(
        div({ class: 'card-section parliament' },
          cardTitleRow(question, null),
          description ? p({ class: 'card-section-text' }, description) : null,
          proposer ? cardMeta('👤', userLink(proposer)) : null,
          cardDate(enactedAt)
        )
      );
    }

    if (type.startsWith('courts')) {
      if (type === 'courtsCase') {
        const { title, method, accuser, status, answerBy, evidenceBy, decisionBy, needed, yes, total, voteId } = content;
        cardChips.push(
          method ? renderStateChip('whole', '◈', String(i18n['courtsMethod' + String(method).toUpperCase()] || method).toUpperCase(), 'level') : null,
          plainStatusChip(status),
          typeof needed !== 'undefined' ? renderCountChip('◎', i18n.courtsVotesNeeded, needed) : null,
          (typeof yes !== 'undefined' || typeof total !== 'undefined') ? renderCountChip('☑', i18n.courtsVotesSlashTotal, `${Number(yes || 0)}/${Number(total || 0)}`) : null,
          answerBy ? renderCountChip('✉', i18n.courtsThAnswerBy, moment(answerBy).format("YYYY/MM/DD HH:mm")) : null,
          evidenceBy ? renderCountChip('📎', i18n.courtsThEvidenceBy, moment(evidenceBy).format("YYYY/MM/DD HH:mm")) : null,
          decisionBy ? renderCountChip('⚖', i18n.courtsThDecisionBy, moment(decisionBy).format("YYYY/MM/DD HH:mm")) : null
        );
        cardBody.push(
          div({ class: 'card-section courts' },
            cardTitleRow(title, null),
            accuser ? cardMeta('👤', userLink(accuser)) : null,
            voteId ? cardMeta('☑', a({ href: `/votes/${encodeURIComponent(voteId)}`, class: 'tag-link' }, i18n.courtsOpenVote)) : null
          )
        );
      } else if (type === 'courtsNomination') {
        const { judgeId } = content;
        cardBody.push(
          div({ class: 'card-section courts' },
            judgeId ? cardMeta('⚖', userLink(judgeId)) : null
          )
        );
      } else {
        skip = true;
      }
    }

    const viewHref = getViewDetailsAction(type, action);
    const isParliamentTarget =
      viewHref === '/parliament?filter=candidatures' ||
      viewHref === '/parliament?filter=government'   ||
      viewHref === '/parliament?filter=proposals'    ||
      viewHref === '/parliament?filter=revocations'  ||
      viewHref === '/parliament?filter=laws';

    const isCourtsTarget =
      viewHref === '/courts?filter=cases'    ||
      viewHref === '/courts?filter=mycases'  ||
      viewHref === '/courts?filter=actions'  ||
      viewHref === '/courts?filter=judges'   ||
      viewHref === '/courts?filter=history'  ||
      viewHref === '/courts?filter=rules'    ||
      viewHref === '/courts?filter=open';

    const parliamentFilter = isParliamentTarget ? (viewHref.split('filter=')[1] || '') : '';
    const courtsFilter     = isCourtsTarget     ? (viewHref.split('filter=')[1] || '') : '';

    if (skip) {
      return null;
    }

    const detailHref = (type !== 'bankWallet')
      ? (isParliamentTarget
          ? `/parliament?filter=${encodeURIComponent(parliamentFilter)}`
          : isCourtsTarget
            ? `/courts?filter=${encodeURIComponent(courtsFilter)}`
            : viewHref)
      : null;
    const msgId = safeMsgId(action.tipId || action.id || action.key);
    const isOwn = action.author && String(action.author) === String(userId);
    const bylineAuthorId = action.author || (content && content.proposer) || '';
    return div({ class: 'trending-card' + (isOwn ? ' own-content' : '') },
      renderCardTop(msgId, detailHref, {
        date: action.ts,
        authorName: (action.authorNames && action.authorNames[bylineAuthorId]) || getProfile(bylineAuthorId).name,
        msgSize: action.msgSize,
        chips: [div({ class: 'card-chips-row' },
          renderStateChip('whole', '▣', upperOf(moduleLabel), 'module'),
          ...cardChips,
          type === 'poll' ? renderVotedChip(action.poll) : null,
          type === 'votes' && action.vote ? renderVoteVotedChip(action.vote) : null,
          type === 'larpHousePost' && content && content.house ? a({ href: `/larp/${encodeURIComponent(content.house)}` }, renderStateChip('tribe', '⌂', String(content.house).toUpperCase(), 'tribe')) : null
        )],
        author: bylineAuthorId,
        contact: type === 'about',
        reportTitle: (content && (content.title || content.question || content.concept || content.name)) || '',
        spread: SPREADABLE_TYPES.has(type) ? (spreadMap.get(action.id) || null) : undefined,
        ...(type === 'torrent' || type === 'file' ? { spreadTitle: i18n.seedAction } : {}),
        ...(TORRENTABLE_TYPES.has(type) && content && typeof content.url === 'string' && content.url.startsWith('&')
          ? { torrentFrom: { blobId: content.url, name: content.title || content.fileName || '' } }
          : {}),
        ...(commentOf(action) ? {} : favOptsFor(type, msgId, extras)),
        deleteAction: isOwn ? (commentOf(action) ? `/comments/delete/${encodeURIComponent(msgId)}` : activityDeleteAction(type, action, content, msgId, userId)) : undefined
      }),
      ...cardBody,
      (() => {
        const shareNode = detailHref ? renderShareButton(msgId, detailHref, (content && (content.title || content.question || content.concept || content.name)) || '') : null;
        const supportNode = renderSupportButton(bylineAuthorId, extras.following, extras.returnTo);
        const commentTotal = typeof action.commentCount === 'number' ? action.commentCount : commentCountFor([commentOf(action) && commentOf(action).rootId, action.id, action.rootId, action.key, msgId]);
        const commentsHref = !detailHref ? '' : commentOf(action) ? detailHref : commentsOpenHref(detailHref, commentTotal);
        const commentsNode = type !== 'about' ? renderCommentsSummary(commentsHref, commentTotal) : null;
        const routeFn = extras.opinionRoute || (OPINION_TYPES.has(type) ? OPINION_ROUTES[type] : null);
        if (!routeFn) return renderCardMetaRow(type !== 'about' && detailHref ? renderOpinionsPill(msgId, detailHref) : null, commentsNode, shareNode, supportNode);
        const ops = (action.value?.content?.opinions) || (action.content?.opinions) || {};
        const opsTotal = Object.values(ops).reduce((s, n) => s + (Number(n) || 0), 0);
        const opinionsBy = (action.value?.content?.opinions_inhabitants) || (action.content?.opinions_inhabitants) || [];
        const voted = Array.isArray(opinionsBy) && opinionsBy.includes(userId);
        const votingNode = details({ class: 'opinions-voting-collapse' },
          summary({ class: opsTotal > 0 ? 'opinions-summary engage-on' : 'opinions-summary' },
            span({ class: 'opinions-summary-icon' }, 'ꔍ'),
            span({ class: 'opinions-summary-count' }, `(${opsTotal})`)),
          div({ class: 'voting-buttons' },
            opinionCategories.map(cat => {
              const label = `${String(i18n['vote' + cat.charAt(0).toUpperCase() + cat.slice(1)] || cat).toUpperCase()} [${ops[cat] || 0}]`;
              return voted
                ? button({ class: 'vote-btn', type: 'button' }, label)
                : form({ method: 'POST', action: `${routeFn(action.id)}/${cat}` },
                    input({ type: 'hidden', name: 'returnTo', value: extras.returnTo || '/activity' }),
                    button({ class: 'vote-btn' }, label)
                  );
            })
          )
        );
        return [renderVotesSummary(ops), renderCardMetaRow(votingNode, commentsNode, shareNode, supportNode)];
      })()
    );
  };
  const cards = items.map(action => {
    const anchor = cardAnchorOf(action);
    const node = renderCardFor(action, anchor);
    if (node && typeof node.setAttribute === 'function') node.setAttribute('id', anchor);
    return node;
  });

  const filteredCards = cards.filter(Boolean);
  if (!filteredCards.length) {
    return div({ class: "no-actions" }, p(i18n.noActions));
  }
  return filteredCards;
}

const FAV_KIND_BY_TYPE = CONTENT_FAV_KIND;

const activityDeleteAction = (type, action, content, msgId, userId) => {
  const c = content || {};
  if (c.author && String(c.author) !== String(userId)) return undefined;
  if (type === 'transfer') {
    const required = c.from === c.to ? 1 : 2;
    const confirmed = Array.isArray(c.confirmedBy) ? c.confirmedBy.length : 0;
    const dl = c.deadline ? moment(c.deadline) : null;
    const expired = dl && dl.isValid() ? dl.isBefore(moment()) : false;
    if (String(c.status || '').toUpperCase() !== 'UNCONFIRMED' || expired || confirmed >= required) return undefined;
  }
  return contentDeleteAction(type, type === 'forum' ? safeMsgId(c.key || action.tipId || action.id) : msgId);
};

const favOptsFor = (type, id, extras = {}) => {
  const favKind = FAV_KIND_BY_TYPE[type];
  if (!favKind) return {};
  const index = extras.favIndex instanceof Map ? extras.favIndex : null;
  return {
    favKind,
    isFavorite: index ? index.get(String(id)) === favKind : false,
    returnTo: extras.returnTo || '/activity'
  };
};

const commentOf = (action) => action && action.comment && action.comment.rootId ? action.comment : null;

function commentHref(comment, commentId) {
  const rootId = comment && comment.rootId;
  if (!rootId) return commentId ? `/thread/${encodeURIComponent(commentId)}` : '/activity';
  if (comment.rootType === 'forum') return `/forum/${encodeURIComponent(rootId)}${commentId ? `#${forumReplyAnchor(commentId)}` : ''}`;
  const tail = commentId ? `#${encodeURIComponent(commentId)}` : '';
  const base = comment.rootType === 'post' ? `/blogs/${encodeURIComponent(rootId)}` : comment.rootType ? getViewDetailsAction(comment.rootType, { id: rootId }) : null;
  if (!base || base === '/activity') return `/thread/${encodeURIComponent(commentId || rootId)}`;
  if (base.includes('#')) return base;
  return `${base}${base.includes('?') ? '&' : '?'}comments=open${tail || '#comments-latest'}`;
}

const GROUP_SUBTYPES = {
  parliament: ['parliamentCandidature', 'parliamentTerm', 'parliamentProposal', 'parliamentRevocation', 'parliamentLaw'],
  courts:     ['courtsCase', 'courtsNomination', 'courtsNominationVote'],
  task:       ['task', 'taskAssignment'],
  votes:      ['votes', 'poll'],
  shop:       ['shop', 'shopProduct'],
  larp:       ['larpHousePost'],
  inhabitants:['about'],
  chat:       ['chat', 'chatThread'],
  wiki:       ['wikiPage'],
  mailing:    ['mailingList'],
  emergency:  ['emergency', 'emergencyUpdate'],
  logistics:  ['logisticsRoute'],
  podcast:    ['podcast', 'podcastEpisode'],
  campaign:   ['campaign', 'campaignUpdate'],
  industry:   ['industry', 'industryBuild', 'industryBlueprint', 'industryAllocation']
};
const MODULE_OF_TYPE = Object.entries(GROUP_SUBTYPES).reduce((acc, [mod, types]) => {
  for (const t of types) if (t !== mod && t !== 'poll') acc[t] = mod;
  return acc;
}, { schoolCourse: 'school', mapMarker: 'map' });

function rootTypeLabel(rt) {
  return rt === 'post' ? (i18n.typePost || 'BLOG') : rt === 'poll' ? (i18n.pollsTitle || 'POLLS') : rt ? (i18n[`type${capitalize(MODULE_OF_TYPE[rt] || rt)}`] || i18n[`type${capitalize(rt)}`] || rt) : null;
}

function commentLabel(comment) {
  const base = rootTypeLabel(comment && comment.rootType);
  const word = i18n.typeComment;
  return base ? `${base} · ${word}` : word;
}

function getViewDetailsAction(type, action) {
  const id = encodeURIComponent(safeMsgId(action.tipId || action.id || action.key || action));
  switch (type) {
    case 'parliamentCandidature':   return `/parliament?filter=candidatures`;
    case 'parliamentTerm':          return `/parliament?filter=government`;
    case 'parliamentProposal':      return `/parliament?filter=proposals`;
    case 'parliamentRevocation':    return `/parliament?filter=revocations`;
    case 'parliamentLaw':           return `/parliament?filter=laws`;
    case 'courtsCase':              return `/courts/cases/${encodeURIComponent(action.id)}`;
    case 'courtsEvidence':          return `/courts?filter=actions`;
    case 'courtsAnswer':            return `/courts?filter=actions`;
    case 'courtsVerdict':           return `/courts?filter=actions`;
    case 'courtsSettlement':        return `/courts?filter=actions`;
    case 'courtsSettlementProposal':return `/courts?filter=actions`;
    case 'courtsSettlementAccepted':return `/courts?filter=actions`;
    case 'courtsNomination':        return `/courts?filter=judges`;
    case 'courtsNominationVote':    return `/courts?filter=judges`;
    case 'spread': {
      const link = normalizeSpreadLink(action.content?.spreadTargetId || action.content?.vote?.link || '');
      return link ? `/thread/${encodeURIComponent(link)}#${encodeURIComponent(link)}` : `/activity`;
    }
    case 'post': {
      const root = action.content && action.content.root;
      if (commentOf(action) || root) return commentHref(commentOf(action) || { rootId: root }, safeMsgId(action.tipId || action.id || action.key || action));
      return `/blogs/${id}`;
    }
    case 'feed':       return `/feed/${id}`;
    case 'vote':       return `/thread/${encodeURIComponent(action.content.vote.link)}#${encodeURIComponent(action.content.vote.link)}`;
    case 'votes':      return `/votes/${id}`;
    case 'transfer':   return `/transfers/${id}`;
    case 'pixelia':    return `/pixelia`;
    case 'poll':       return `/polls/${id}`;
    case 'larpHousePost': return action.content?.house ? `/larp/${encodeURIComponent(action.content.house)}` : `/activity`;
    case 'tribe':      return `/tribe/${id}`;
    case 'curriculum': return `/inhabitant/${encodeURIComponent(action.author)}`;
    case 'karmaScore': return `/author/${encodeURIComponent(action.author)}`;
    case 'map':        return `/maps/${id}`;
    case 'mapMarker':  return `/maps/${encodeURIComponent(action.content?.mapId || id)}`;
    case 'image':      return `/images/${id}`;
    case 'audio':      return `/audios/${id}`;
    case 'video':      return `/videos/${id}`;
    case 'torrent':    return `/torrents/${id}`;
    case 'file':       return `/files/${id}`;
    case 'forum': {
      const root = action.content?.root;
      const rootId = typeof root === 'string' ? root : (root && (root.key || root.id)) || '';
      if (rootId) return `/forum/${encodeURIComponent(action.content?.rootKey || rootId)}#${forumReplyAnchor(action.tipId || action.id)}`;
      return `/forum/${encodeURIComponent(action.content?.key || action.tipId || action.id)}`;
    }
    case 'document':   return `/documents/${id}`;
    case 'bookmark':   return `/bookmarks/${id}`;
    case 'event':      return `/events/${id}`;
    case 'task':       return `/tasks/${id}`;
    case 'taskAssignment': return `/tasks/${encodeURIComponent(action.content?.taskId || action.tipId || action.id)}`;
    case 'about':      return `/author/${encodeURIComponent(action.author)}`;
    case 'market':     return `/market/${id}`;
    case 'shop':       return `/shops/${id}`;
    case 'shopProduct': return `/shops/product/${id}`;
    case 'chat':       return `/chats/${id}`;
    case 'pad':        return `/pads/${id}`;
    case 'room':       return `/rooms/${id}`;
    case 'wikiPage':   return `/wiki/${id}`;
    case 'emergency':      return `/emergencies/${id}`;
    case 'emergencyUpdate': return action.content && action.content.target ? `/emergencies/${encodeURIComponent(action.content.target)}` : '/emergencies';
    case 'campaignUpdate': return action.content && action.content.target ? `/campaigns/${encodeURIComponent(action.content.target)}` : '/campaigns';
    case 'mailingList': return `/mailing/${id}`;
    case 'logisticsRoute': return `/logistics/${id}`;
    case 'podcast': return `/podcasts/${id}`;
    case 'podcastEpisode': return `/podcasts/episode/${id}`;
    case 'campaign': return `/campaigns/${id}`;
    case 'calendar':   return `/calendars/${id}`;
    case 'housing':    return `/housing/${id}`;
    case 'job':        return `/jobs/${id}`;
    case 'project':    return `/projects/${id}`;
    case 'schoolCourse': return `/school/course/${id}`;
    case 'industry':   return `/industry/${id}`;
    case 'industryBuild': return `/industry/build/${id}`;
    case 'industryBlueprint': return `/industry/blueprint/${id}`;
    case 'industryAllocation': return action.content?.target ? `/industry/build/${encodeURIComponent(action.content.target)}` : '/industry?filter=BUILDS';
    case 'report':     return `/reports/${id}`;
    case 'bankWallet': return `/wallet`;
    default:           return `/activity`;
  }
}

exports.getViewDetailsAction = getViewDetailsAction;
exports.commentHref = commentHref;
exports.commentLabel = commentLabel;
exports.rootTypeLabel = rootTypeLabel;

exports.activityView = (actions, filter, userId, q = '', extras = {}) => {
  const spreadMap = (extras && extras.spreadMap) || new Map();
  const title = filter === 'mine' ? i18n.yourActivity : i18n.globalActivity;
  const desc = i18n.activityDesc;

  const activityTypes = [
    { type: 'all',       label: i18n.allButton },
    { type: 'recent',    label: i18n.typeRecent },
    { type: 'mine',      label: i18n.mineButton },
    { type: 'supported', label: i18n.filterSupported },
    { type: 'replicated', label: i18n.filterReplicated },
    { type: 'top',       label: i18n.typeTop },
    { type: 'inhabitants', label: i18n.typeInhabitants },
    { type: 'tribe',     label: i18n.typeTribe },
    { type: 'larp',      label: i18n.typeLarp },
    { type: 'parliament',label: i18n.typeParliament },
    { type: 'courts',    label: i18n.typeCourts },
    { type: 'votes',     label: i18n.typeVotes },
    { type: 'event',     label: i18n.typeEvent },
    { type: 'calendar',  label: i18n.typeCalendar },
    { type: 'task',      label: i18n.typeTask },
    { type: 'report',    label: i18n.typeReport },
    { type: 'post',      label: i18n.typePost },
    { type: 'feed',      label: i18n.typeFeed },
    { type: 'chat',      label: i18n.typeChat },
    { type: 'pad',       label: i18n.typePad },
    { type: 'room',      label: i18n.typeRoom },
    { type: 'wiki',      label: i18n.typeWiki },
    { type: 'emergency',     label: i18n.typeEmergency },
    { type: 'mailing',   label: i18n.typeMailingList },
    { type: 'logistics', label: i18n.typeLogisticsRoute },
    { type: 'podcast',   label: i18n.typePodcast },
    { type: 'campaign',  label: i18n.typeCampaign },
    { type: 'forum',     label: i18n.typeForum },
    { type: 'map',       label: i18n.typeMap },
    { type: 'market',    label: i18n.typeMarket },
    { type: 'schoolCourse', label: i18n.typeSchool },
    { type: 'project',   label: i18n.typeProject },
    { type: 'industry',  label: i18n.typeIndustry },
    { type: 'housing',   label: i18n.typeHousing },
    { type: 'job',       label: i18n.typeJob },
    { type: 'shop',      label: i18n.typeShop },
    { type: 'audio',     label: i18n.typeAudio },
    { type: 'bookmark',  label: i18n.typeBookmark },
    { type: 'document',  label: i18n.typeDocument },
    { type: 'image',     label: i18n.typeImage },
    { type: 'torrent',   label: i18n.typeTorrent },
    { type: 'file',      label: i18n.typeFile },
    { type: 'video',     label: i18n.typeVideo }
  ];

  const FILTER_META = new Set(['all', 'mine', 'supported', 'replicated', 'recent']);
  const ALLOWED_TYPES = new Set(['tribeOpened']);
  for (const { type } of activityTypes) {
    if (FILTER_META.has(type)) continue;
    if (GROUP_SUBTYPES[type]) GROUP_SUBTYPES[type].forEach(t => ALLOWED_TYPES.add(t));
    else ALLOWED_TYPES.add(type);
  }
  const rawActions = actions;
  actions = actions.filter(action => ALLOWED_TYPES.has(action.type));

  let filteredActions;
  if (filter === 'mine') {
    filteredActions = actions.filter(action => action.author === userId && action.type !== 'tombstone');
  } else if (filter === 'supported' || filter === 'replicated') {
    const flag = filter === 'supported' ? 'isSupported' : 'isReplicated';
    filteredActions = actions.filter(action => action[flag] && action.type !== 'tombstone');
  } else if (filter === 'recent') {
    const now = Date.now();
    filteredActions = actions.filter(action => action.type !== 'tombstone' && action.ts && now - action.ts < 24 * 60 * 60 * 1000);
  } else if (filter === 'banking') {
    filteredActions = [];
  } else if (filter === 'tribe') {
    filteredActions = actions.filter(action => action.type === 'tribe' || action.type === 'tribeOpened');
  } else if (filter === 'larp') {
    filteredActions = actions.filter(action => action.type === 'larpHousePost');
  } else if (filter === 'inhabitants') {
    filteredActions = actions.filter(action => action.type === 'about');
  } else if (filter === 'parliament') {
    filteredActions = actions.filter(action => ['parliamentCandidature','parliamentTerm','parliamentProposal','parliamentRevocation','parliamentLaw'].includes(action.type));
  } else if (filter === 'courts') {
    filteredActions = actions.filter(action => {
      const t = String(action.type || '').toLowerCase();
      return t === 'courtscase' || t === 'courtsnomination' || t === 'courtsnominationvote';
    });
  } else if (filter === 'task') {
    filteredActions = actions.filter(action => action.type !== 'tombstone' && (action.type === 'task' || action.type === 'taskAssignment' || openedIn(action, 'task')));
  } else if (filter === 'torrent') {
    filteredActions = actions.filter(action => action.type === 'torrent' || openedIn(action, 'torrent'));
  } else if (filter === 'file') {
    filteredActions = actions.filter(action => action.type === 'file');
  } else if (filter === 'chat') {
    filteredActions = actions.filter(action => (action.type === 'chat' || action.type === 'chatThread') && action.type !== 'tombstone');
  } else if (filter === 'wiki') {
    filteredActions = actions.filter(action => action.type === 'wikiPage');
  } else if (filter === 'emergency') {
    filteredActions = actions.filter(action => action.type === 'emergency' || action.type === 'emergencyUpdate');
  } else if (filter === 'mailing') {
    filteredActions = actions.filter(action => action.type === 'mailingList');
  } else if (filter === 'room') {
    filteredActions = actions.filter(action => action.type === 'room');
  } else if (filter === 'logistics') {
    filteredActions = actions.filter(action => action.type === 'logisticsRoute');
  } else if (filter === 'podcast') {
    filteredActions = actions.filter(action => action.type === 'podcast' || action.type === 'podcastEpisode');
  } else if (filter === 'campaign') {
    filteredActions = actions.filter(action => action.type === 'campaign' || action.type === 'campaignUpdate');
  } else if (filter === 'industry') {
    filteredActions = actions.filter(action => ['industry', 'industryBuild', 'industryBlueprint', 'industryAllocation'].includes(action.type) && action.type !== 'tombstone');
  } else {
    filteredActions = actions.filter(action =>
      ((action.type === filter && !(filter === 'post' && commentOf(action) && commentOf(action).rootType !== 'post'))
        || filter === 'all'
        || openedIn(action, filter)
        || (filter === 'shop' && action.type === 'shopProduct')
        || (filter === 'votes' && action.type === 'poll'))
      && action.type !== 'tombstone');
  }
  if (!FILTER_META.has(filter) && filter !== 'post') {
    const kinds = new Set(GROUP_SUBTYPES[filter] || [filter]);
    const listed = new Set(filteredActions);
    filteredActions = filteredActions.concat(actions.filter(a => !listed.has(a) && commentOf(a) && kinds.has(commentOf(a).rootType)));
  }

  const larpEarliest = new Map();
  for (const action of filteredActions) {
    if (action.type !== 'tribe') continue;
    const c = action.value?.content || action.content || {};
    const larpTag = (Array.isArray(c.tags) ? c.tags : []).find(x => String(x).startsWith('larp-'));
    if (!larpTag) continue;
    const ts = action.ts || 0;
    const prev = larpEarliest.get(larpTag);
    if (!prev || ts < prev.ts) larpEarliest.set(larpTag, { id: action.id, ts });
  }
  if (larpEarliest.size) {
    filteredActions = filteredActions.filter(action => {
      if (action.type !== 'tribe') return true;
      const c = action.value?.content || action.content || {};
      const larpTag = (Array.isArray(c.tags) ? c.tags : []).find(x => String(x).startsWith('larp-'));
      if (!larpTag) return true;
      return larpEarliest.get(larpTag).id === action.id;
    });
  }

  const aboutLatest = new Map();
  for (const action of filteredActions) {
    if (action.type !== 'about') continue;
    const c = action.value?.content || action.content || {};
    const subject = c.about || action.author;
    if (!subject) continue;
    const ts = action.ts || 0;
    const prev = aboutLatest.get(subject);
    if (!prev || ts > prev.ts) aboutLatest.set(subject, { id: action.id, ts });
  }
  if (aboutLatest.size) {
    filteredActions = filteredActions.filter(action => {
      if (action.type !== 'about') return true;
      const c = action.value?.content || action.content || {};
      const subject = c.about || action.author;
      if (!subject) return true;
      return aboutLatest.get(subject).id === action.id;
    });
  }

  const qs = String(q || '').trim();
  if (qs) {
    const qn = qs.toLowerCase();
    filteredActions = filteredActions.filter(a0 => {
      const t = String(a0.type || '').toLowerCase();
      const author = String(a0.author || '').toLowerCase();
      const id0 = String(a0.id || '').toLowerCase();
      const c0 = a0.value?.content || a0.content || {};
      const blob = [
        t, author, id0,
        c0.text, c0.title, c0.name, c0.description, c0.contentWarning,
        c0.about, c0.contact,
        c0.spreadTitle, c0.spreadText, c0.spreadOriginalAuthor,
        c0.vote?.link,
        c0.address?.host, c0.address?.key
      ].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(qn);
    });
  }

  const MODULE_SUB_FILTERS = {
    audio:   { url: '/audios',     filters: ['all', 'recent', 'mine', 'supported', 'replicated', 'top', 'favorites'] },
    video:   { url: '/videos',     filters: ['all', 'recent', 'mine', 'supported', 'replicated', 'top', 'favorites'] },
    image:   { url: '/images',     filters: ['all', 'recent', 'mine', 'supported', 'replicated', 'top', 'favorites'] },
    document:{ url: '/documents',  filters: ['all', 'recent', 'mine', 'supported', 'replicated', 'top', 'favorites'] },
    bookmark:{ url: '/bookmarks',  filters: ['all', 'recent', 'mine', 'supported', 'replicated', 'top', 'favorites'] },
    torrent: { url: '/torrents',   filters: ['all', 'recent', 'mine', 'supported', 'replicated', 'top', 'favorites'] },
    file: { url: '/files',   filters: ['all', 'recent', 'mine', 'supported', 'replicated', 'top', 'favorites'] },
    map:     { url: '/maps',       filters: ['all', 'recent', 'mine', 'supported', 'replicated'] },
    forum:   { url: '/forum',      filters: ['all', 'recent', 'mine', 'supported', 'replicated', 'top'] },
    event:   { url: '/events',     filters: ['all', 'recent', 'mine', 'supported', 'replicated'] },
    task:    { url: '/tasks',      filters: ['all', 'mine', 'supported', 'replicated', 'assigned', 'open', 'closed'] },
    votes:   { url: '/votes',      filters: ['all', 'recent', 'mine', 'supported', 'replicated', 'open', 'closed'] },
    transfer:{ url: '/transfers',  filters: ['all', 'mine', 'supported', 'replicated', 'pending', 'unconfirmed', 'closed'] },
    market:  { url: '/market',     filters: ['all', 'mine', 'supported', 'replicated', 'exchange', 'auctions', 'for sale', 'sold'] },
    shop:    { url: '/shops',      filters: ['all', 'recent', 'mine', 'supported', 'replicated'] },
    job:     { url: '/jobs',       filters: ['ALL', 'MINE', 'SUPPORTED', 'REPLICATED', 'REMOTE', 'PRESENCIAL', 'OPEN', 'CLOSED'] },
    project: { url: '/projects',   filters: ['all', 'mine', 'supported', 'replicated', 'active', 'completed'] },
    industry:{ url: '/industry',   filters: ['ALL', 'MINE', 'SUPPORTED', 'REPLICATED', 'ACTIVE', 'PAUSED', 'DISSOLVED', 'BLUEPRINTS', 'BUILDS', 'MEMBER', 'RULES'] },
    chat:    { url: '/chats',      filters: ['all', 'mine', 'supported', 'replicated'] },
    pad:     { url: '/pads',       filters: ['all', 'mine', 'supported', 'replicated'] },
    calendar:{ url: '/calendars',  filters: ['all', 'mine', 'supported', 'replicated'] },
    report:  { url: '/reports',    filters: ['all', 'recent', 'mine', 'supported', 'replicated'] },
    curriculum:{ url: '/cv',       filters: ['view', 'edit'] }
  };

  const SUB_LABEL_PREFIX = { audio: 'audioFilter', video: 'videoFilter', image: 'imageFilter', document: 'documentFilter', bookmark: 'bookmarkFilter', torrent: 'torrentFilter', file: 'fileFilter', map: 'mapFilter', forum: 'forumFilter', event: 'eventFilter', task: 'taskFilter', votes: 'voteFilter', transfer: 'transfersFilter', market: 'marketFilter', shop: 'shopFilter', job: 'jobsFilter', project: 'projectFilter', industry: 'industryFilter', chat: 'chatFilter', pad: 'padFilter', calendar: 'calendarFilter', report: 'reportsFilter' };
  const SUB_LABEL_KEY = { 'market:exchange': 'marketFilterItems' };
  const subLabel = (f) => {
    const m = String(f).toLowerCase();
    if (RELATION_FILTERS.includes(m)) return relationFilterLabel(m);
    const key = SUB_LABEL_KEY[`${filter}:${m}`] || `${SUB_LABEL_PREFIX[filter] || ''}${m.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
    return String(i18n[key] || f).toUpperCase();
  };
  const subItems = (() => {
    const kinds = new Set(filter === 'votes' ? ['votes'] : (GROUP_SUBTYPES[filter] || [filter]));
    return actions.filter(a2 => kinds.has(a2.type) && !commentOf(a2));
  })();
  const subHas = (f) => {
    const m = String(f).toLowerCase();
    const cOf = (a2) => a2.value?.content || a2.content || {};
    const st = (a2) => String(cOf(a2).status || '').toUpperCase();
    const favIndex = extras.favIndex instanceof Map ? extras.favIndex : null;
    switch (m) {
      case 'all': case 'view': case 'edit': case 'rules': return true;
      case 'recent': return subItems.some(a2 => a2.ts && Date.now() - a2.ts < 86400000);
      case 'mine': return subItems.some(a2 => a2.author === userId);
      case 'supported': return subItems.some(a2 => a2.isSupported);
      case 'replicated': return subItems.some(a2 => a2.isReplicated);
      case 'top': return subItems.length > 0;
      case 'favorites': return !!favIndex && subItems.some(a2 => [a2.id, a2.rootId, a2.key].some(k => k && favIndex.has(String(k))));
      case 'assigned': return subItems.some(a2 => (Array.isArray(cOf(a2).assignees) ? cOf(a2).assignees : []).includes(userId));
      case 'pending': return subItems.some(a2 => st(a2) === 'UNCONFIRMED' && cOf(a2).to === userId);
      case 'unconfirmed': return subItems.some(a2 => st(a2) === 'UNCONFIRMED');
      case 'exchange': return subItems.some(a2 => cOf(a2).item_type === 'exchange' && st(a2) === 'FOR SALE');
      case 'auctions': return subItems.some(a2 => cOf(a2).item_type === 'auction' && st(a2) === 'FOR SALE');
      case 'remote': case 'presencial': return subItems.some(a2 => String(cOf(a2).location || '').toUpperCase() === m.toUpperCase());
      case 'blueprints': return subItems.some(a2 => a2.type === 'industryBlueprint');
      case 'builds': return subItems.some(a2 => a2.type === 'industryBuild');
      case 'member': return subItems.some(a2 => (Array.isArray(cOf(a2).members) ? cOf(a2).members : []).includes(userId) || cOf(a2).steward === userId);
      default: return subItems.some(a2 => st(a2) === m.toUpperCase());
    }
  };
  const sub = MODULE_SUB_FILTERS[filter];
  const subFilters = sub ? sub.filters.filter(subHas) : [];
  const emptyAct = actions.length === 0 && !qs;

  let html = template(
    title,
    section(
      div({ class: 'tags-header activity-header-line' },
        h2(i18n.activityList),
        p(desc)
      ),
      emptyAct ? null : div({ class: 'activity-filter-chips' },
        (() => {
          const ORDER = [
            'all', 'recent', 'mine', 'supported', 'replicated', 'top',
            'inhabitants', 'tribe', 'larp', 'schoolCourse', 'parliament', 'courts', 'emergency',
            'votes', 'event', 'calendar', 'task', 'report', 'campaign',
            'banking', 'market', 'housing', 'project', 'industry', 'job', 'shop', 'logistics',
            'post', 'feed', 'chat', 'room', 'pad', 'wiki', 'mailing', 'forum', 'map',
            'audio', 'bookmark', 'document', 'file', 'image', 'torrent', 'video', 'podcast'
          ];
          const byType = new Map(activityTypes.map(t => [t.type, t]));
          const placed = new Set(ORDER);
          const presentActionTypes = new Set(actions.map(a2 => a2.type));
          const metaKeep = new Set(['all', 'mine', 'recent', 'top']);
          const hasContentFor = (type) =>
            metaKeep.has(type)
            || (type === 'supported' ? (filter === type || actions.some(a2 => a2.isSupported))
              : type === 'replicated' ? (filter === type || actions.some(a2 => a2.isReplicated))
              : (GROUP_SUBTYPES[type] || [type]).some(t2 => presentActionTypes.has(t2)));
          const ordered = ORDER.map(type => byType.get(type)).filter(Boolean)
            .concat(activityTypes.filter(t => !placed.has(t.type)))
            .filter(({ type }) => hasContentFor(type));
          return ordered.map(({ type, label }) =>
            a({
              href: `/activity?filter=${encodeURIComponent(type)}`,
              class: filter === type ? 'activity-chip active' : 'activity-chip'
            }, label)
          );
        })()
      ),
      emptyAct ? null : div({ class: 'activity-filter-chips activity-toolbar-row' },
        renderModuleStats(filteredActions.length, [], null, { showInhabitants: true, showTribes: true }),
        subFilters.length ? span({ class: 'activity-subchip-label' }, '\u21b3') : '',
        subFilters.map(f => a({ href: `${sub.url}?filter=${encodeURIComponent(f)}`, class: 'activity-chip' }, subLabel(f))),
        form({ method: 'GET', action: '/activity', class: 'filter-box' },
          input({ type: 'hidden', name: 'filter', value: filter }),
          input({ type: 'text', name: 'q', value: qs, placeholder: i18n.activitySearchPlaceholder, class: 'filter-box__input' }),
          div({ class: 'filter-box__controls' },
            button({ type: 'submit', class: 'filter-box__button' }, i18n.searchButton)
          )
        )
      ),
    section({ class: 'feed-container' }, renderActionCards(filteredActions, userId, rawActions, spreadMap, { ...extras, paged: true }))
    )
  );

  return html;
};

