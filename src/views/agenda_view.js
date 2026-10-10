const { div, h2, p, section, button, form, img, input, textarea, a, br, h1, span } = require("../server/node_modules/hyperaxe");
const { safeExternalHref } = require("../backend/renderStyledText");
const { template, i18n, userLink, renderContentActions, renderModuleStats, renderStateChip, CONTENT_FAV_KIND, CONTENT_SPREADABLE, contentDeleteAction, paged } = require('./main_views');
const moment = require('../server/node_modules/moment');
const { config } = require('../server/SSB_server.js');

const userId = config.keys.id;

function getViewDetailsAction(item) {
  switch (item.type) {
    case 'transfer': return `/transfers/${encodeURIComponent(item.id)}`;
    case 'tribe': return `/tribe/${encodeURIComponent(item.id)}`;
    case 'event': return `/events/${encodeURIComponent(item.id)}`;
    case 'task': return `/tasks/${encodeURIComponent(item.id)}`;
    case 'market': return `/market/${encodeURIComponent(item.id)}`;
    case 'report': return `/reports/${encodeURIComponent(item.id)}`;
    case 'job': return `/jobs/${encodeURIComponent(item.id)}`;
    case 'project': return `/projects/${encodeURIComponent(item.id)}`;
    case 'industry': return `/industry/build/${encodeURIComponent(item.id)}`;
    case 'housing': return `/housing/${encodeURIComponent(item.id)}`;
    case 'schoolCourse': return `/school/course/${encodeURIComponent(item.id)}`;
    case 'campaign': return `/campaigns/${encodeURIComponent(item.id)}`;
    case 'logisticsRoute': return `/logistics/${encodeURIComponent(item.id)}`;
    case 'calendar': return `/calendars/${encodeURIComponent(item.id)}`;
    case 'calendarDate': return `/calendars/${encodeURIComponent(item.calendarId)}`;
    default: return `/messages/${encodeURIComponent(item.id)}`;
  }
}

const agendaDeleteAction = (item) => {
  if (item.type === 'transfer') {
    const required = item.from === item.to ? 1 : 2;
    const confirmed = Array.isArray(item.confirmedBy) ? item.confirmedBy.length : 0;
    const dl = item.deadline ? moment(item.deadline) : null;
    const expired = dl && dl.isValid() ? dl.isBefore(moment()) : false;
    return String(item.status || '').toUpperCase() === 'UNCONFIRMED' && !expired && confirmed < required ? contentDeleteAction('transfer', item.id) : undefined;
  }
  return contentDeleteAction(item.type, item.id);
};

const chip = (text, kind = "whole", icon = null) => (text === null || text === undefined || text === "") ? null : renderStateChip(kind, icon, String(text).toUpperCase());
const timeChip = (value, fmt = "YYYY/MM/DD HH:mm") => value ? p({ class: "time-chip" }, moment(value).format(fmt)) : null;
const metaLine = (text) => text && String(text).trim() ? p({ class: "job-meta-line" }, String(text)) : null;
const priceChip = (text) => text ? div({ class: "price-chip" }, text) : null;
const countLine = (labelText, value) => div({ class: "tribe-card-members" }, span({ class: "tribe-members-count" }, `${labelText}: ${value}`));
const statusKind = (status) => String(status || "").toUpperCase() === "CLOSED" ? "closed" : "mutuals";

const renderAgendaItem = (item, userId, filter, extras = {}) => {
  const author = item.seller || item.organizer || item.from || item.author || '';
  const chips = [];
  const body = [];
  let actionButton = null;

  if (filter === 'discarded') {
    actionButton = form({ method: 'POST', action: `/agenda/restore/${encodeURIComponent(item.id)}`, class: 'phone-action-form' },
      button({ type: 'submit', class: 'tribe-action-btn' }, String(i18n.agendaRestoreButton).toUpperCase())
    );
  } else {
    actionButton = form({ method: 'POST', action: `/agenda/discard/${encodeURIComponent(item.id)}`, class: 'phone-action-form' },
      button({ type: 'submit', class: 'tribe-action-btn' }, String(i18n.agendaDiscardButton).toUpperCase())
    );
  }
  const extraActions = [];
  if (filter === 'discarded') extraActions.push(form({ method: 'POST', action: `/agenda/remove/${encodeURIComponent(item.id)}`, class: 'phone-action-form' },
    button({ type: 'submit', class: 'tribe-action-btn danger-btn' }, String(i18n.agendaRemoveButton).toUpperCase())
  ));

  if (item.type === 'market') {
    chips.push(chip(item.item_type), chip(item.status, statusKind(item.status)), chip(`${i18n.marketItemStock}: ${item.stock}`), item.includesShipping ? chip(i18n.marketItemIncludesShipping, 'mutuals', '✓') : null);
    if (String(item.item_type || '').toLowerCase() === 'auction') {
      const bids = Array.isArray(item.auctions_poll) ? item.auctions_poll.map(bid => parseFloat(String(bid).split(':')[1])).filter(n => !isNaN(n)) : [];
      const maxBid = bids.length ? Math.max(...bids) : 0;
      chips.push(chip(`${i18n.marketItemHighestBid}: ${maxBid} ECO`, 'whole', '▲'));
    }
    body.push(priceChip(`${item.price} ECO`), timeChip(item.deadline));
  }

  if (item.type === 'tribe') {
    chips.push(item.isAnonymous ? chip(i18n.agendaAnonymousLabel, 'hidden') : null, chip(item.inviteMode ? item.inviteMode : i18n.noInviteMode));
    body.push(metaLine(item.location || i18n.noLocation), countLine(i18n.agendaMembersLabel, Array.isArray(item.members) ? item.members.length : 0));
  }

  if (item.type === 'report') {
    chips.push(chip(item.status || i18n.noStatus, statusKind(item.status)), chip(item.category || i18n.noCategory), chip(item.severity || i18n.noSeverity, 'closed'));
  }

  if (item.type === 'event') {
    body.push(timeChip(item.date), metaLine(item.location), parseFloat(item.price || 0) > 0 ? priceChip(`${item.price} ECO`) : null,
      item.url ? p({ class: 'job-meta-line' }, a({ href: safeExternalHref(item.url), target: "_blank", rel: "noopener noreferrer" }, item.url)) : null);
    if (filter !== 'discarded') extraActions.push(form({ method: 'POST', action: `/events/attend/${encodeURIComponent(item.id)}`, class: 'phone-action-form' },
      button({ type: 'submit', class: 'tribe-action-btn' }, String(i18n.eventAttendButton).toUpperCase())));
  }

  if (item.type === 'task') {
    chips.push(chip(item.status, statusKind(item.status)), chip(item.priority, 'closed'));
    body.push(timeChip(item.startTime), timeChip(item.endTime), metaLine(item.location));
    const assigned = Array.isArray(item.assignees) && item.assignees.includes(userId);
    if (filter !== 'discarded') extraActions.push(form({ method: 'POST', action: `/tasks/assign/${encodeURIComponent(item.id)}`, class: 'phone-action-form' },
      button({ type: 'submit', class: 'tribe-action-btn' }, String(assigned ? i18n.taskUnassignButton : i18n.taskAssignButton).toUpperCase())));
  }

  if (item.type === 'transfer') {
    body.push(metaLine(item.concept), priceChip(`${item.amount} ECO`), timeChip(item.deadline),
      item.to ? p({ class: 'job-meta-line' }, `${i18n.to}: `, userLink(item.to)) : null);
  }

  if (item.type === 'project') {
    chips.push(chip(item.status || i18n.noStatus, statusKind(item.status)), chip(`${item.progress || 0}%`, 'mutuals'));
    body.push(priceChip(`${item.pledged || 0} / ${item.goal} ECO`), item.deadline ? timeChip(item.deadline) : metaLine(i18n.noDeadline));
  }

  if (item.type === 'calendar') {
    chips.push(chip(item.isClosed ? (i18n.calendarStatusClosed || 'CLOSED') : (i18n.calendarStatusOpen || 'OPEN'), item.isClosed ? 'closed' : 'mutuals'));
    body.push(timeChip(item.deadline), countLine(i18n.calendarParticipantsLabel || 'Participants', Array.isArray(item.participants) ? item.participants.length : 0));
  }

  if (item.type === 'campaign') {
    chips.push(chip(`${i18n.campaignSignaturesLabel}: ${item.signatureCount || 0} / ${item.goal || 0}`, 'mutuals', '✍'));
    body.push(timeChip(item.deadline));
  }

  if (item.type === 'logisticsRoute') {
    chips.push(chip(item.kind), chip(item.mode));
    body.push(metaLine(`${item.origin || ''} → ${item.destination || ''}`), timeChip(item.date));
  }

  if (item.type === 'housing') {
    const isOwner = String(item.author) === String(userId);
    const requestCount = Number(item.requestCount) || 0;
    chips.push(chip(i18n["housingType" + String(item.housing_type || '').toUpperCase()] || item.housing_type),
      chip(String(item.status || '').toUpperCase() === 'CLOSED' ? i18n.housingStatusCLOSED : i18n.housingStatusOPEN, statusKind(item.status)),
      isOwner ? chip(`${i18n.housingRequests}: ${requestCount}`) : chip(i18n.housingRequestedBadge || 'REQUESTED', 'mutuals', '✓'));
    body.push(metaLine(item.place), priceChip(String(item.housing_type) === 'couchsurfing' ? (i18n.housingFree || 'FREE') : `${item.price} ECO`), timeChip(item.availableFrom, 'YYYY/MM/DD'));
  }

  if (item.type === 'job') {
    const subs = Array.isArray(item.subscribers)
      ? item.subscribers
      : (typeof item.subscribers === 'string'
          ? item.subscribers.split(',').map(s => s.trim()).filter(Boolean)
          : (item.subscribers && typeof item.subscribers.length === 'number' ? Array.from(item.subscribers) : []));
    chips.push(chip(item.status, statusKind(item.status)), chip(item.job_type), chip(item.languages), chip(`${i18n.jobVacants}: ${item.vacants}`));
    body.push(metaLine(item.location), priceChip(`${item.salary} ECO`), countLine(i18n.jobSubscribers, subs.length));
    const subscribed = subs.includes(userId);
    if (filter !== 'discarded' && !subscribed && String(item.status).toUpperCase() !== 'CLOSED' && item.author !== userId) {
      extraActions.push(form({ method: 'POST', action: `/jobs/subscribe/${encodeURIComponent(item.id)}`, class: 'phone-action-form' },
        button({ type: 'submit', class: 'tribe-action-btn' }, String(i18n.jobSubscribeButton).toUpperCase())));
    }
  }

  if (item.type === 'industry') {
    const st = String(item.status || 'PROPOSED').toUpperCase();
    chips.push(chip(i18n['industryBuildStatus_' + st] || st, statusKind(st)));
    body.push(metaLine(item.facilityName));
  }

  const isOwn = author && String(author) === String(userId);
  const favKind = CONTENT_FAV_KIND[item.type];
  const favIndex = extras.favIndex instanceof Map ? extras.favIndex : null;
  const spreadMap = extras.spreadMap instanceof Map ? extras.spreadMap : null;
  const href = getViewDetailsAction(item);
  const title = item.title || item.name || item.concept || '';
  return div({ class: 'trending-card agenda-card' + (isOwn ? ' own-content' : '') },
    div({ class: 'card-header activity-card-header' },
      span({ class: 'pm-exposition-chip pm-exposition-whole' },
        span({ class: 'pm-exposition-text' }, String(item.type || '').toUpperCase())
      ),
      renderContentActions(item.id, href, {
        author,
        reportTitle: title,
        spread: CONTENT_SPREADABLE.has(item.type) ? ((spreadMap && spreadMap.get(item.id)) || null) : undefined,
        ...(favKind ? { favKind, isFavorite: item.isFavorite === true || (!!favIndex && [item.rootId, item.id].some(id => id && favIndex.get(String(id)) === favKind)) } : {}),
        returnTo: `/agenda?filter=${encodeURIComponent(filter || 'all')}`,
        deleteAction: isOwn ? agendaDeleteAction(item) : undefined
      })
    ),
    div({ class: 'card-section agenda-card-body' },
      div({ class: 'shop-title-row' }, h2({ class: 'tribe-card-title' }, a({ href }, title))),
      chips.filter(Boolean).length ? div({ class: 'card-chips-row' }, ...chips.filter(Boolean)) : null,
      ...body.filter(Boolean),
      p({ class: 'card-footer' },
        span({ class: 'date-link' }, `${item.createdAt ? moment(item.createdAt).format('YYYY/MM/DD HH:mm') : ''}`),
        author ? userLink(author) : ''
      ),
      div({ class: 'agenda-card-actions' }, actionButton, ...extraActions)
    )
  );
};

exports.agendaView = async (data, filter, q = '', extras = {}) => {
  const { items = [], counts: _c = {} } = data || {};
  const counts = { all: 0, open: 0, closed: 0, events: 0, tasks: 0, reports: 0, tribes: 0, jobs: 0, market: 0, projects: 0, transfers: 0, calendars: 0, housing: 0, discarded: 0, ..._c };
  const emptyAgenda = Number(counts.all || 0) === 0 && !String(q || '').trim();
  return template(
    i18n.agendaTitle,
    section(
      div({ class: 'tags-header module-header-line' },
        h2(i18n.agendaTitle),
        p(i18n.agendaDescription)
      ),
      emptyAgenda ? null : div({ class: 'mode-buttons-row' },
        ...[
            ['all', i18n.agendaFilterAll],
            ['today', i18n.agendaFilterToday || 'TODAY'],
            ['upcoming', i18n.agendaFilterUpcoming || 'UPCOMING'],
            ['overdue', i18n.agendaFilterOverdue || 'OVERDUE'],
            ['open', i18n.agendaFilterOpen],
            ['closed', i18n.agendaFilterClosed],
            ['events', i18n.agendaFilterEvents],
            ['tasks', i18n.agendaFilterTasks],
            ['reports', i18n.agendaFilterReports],
            ['tribes', i18n.agendaFilterTribes],
            ['jobs', i18n.agendaFilterJobs],
            ['market', i18n.agendaFilterMarket],
            ['projects', i18n.agendaFilterProjects],
            ['industry', i18n.agendaFilterIndustry || 'INDUSTRY'],
            ['housing', i18n.agendaFilterHousing || 'HOUSING'],
            ['school', i18n.agendaFilterSchool || 'SCHOOL'],
            ['campaigns', i18n.agendaFilterCampaigns || 'CAMPAIGNS'],
            ['logistics', i18n.agendaFilterLogistics || 'LOGISTICS'],
            ['calendars', i18n.agendaFilterCalendars || 'CALENDARS'],
            ['transfers', i18n.agendaFilterTransfers],
            ['discarded', 'DISCARDED']
          ].filter(([value]) => value === 'all' || filter === value || Number(counts[value] || 0) > 0)
            .map(([value, labelText]) =>
              form({ method: 'GET', action: '/agenda' },
                input({ type: 'hidden', name: 'filter', value }),
                button({ type: 'submit', class: filter === value ? 'filter-btn active' : 'filter-btn' }, String(labelText).toUpperCase())))
      ),
      emptyAgenda ? null : div({ class: 'filters activity-filter-chips activity-toolbar-row' },
        renderModuleStats(items.length, [
          ['today', i18n.agendaFilterToday || 'TODAY'], ['upcoming', i18n.agendaFilterUpcoming || 'UPCOMING'], ['overdue', i18n.agendaFilterOverdue || 'OVERDUE'],
          ['open', i18n.agendaFilterOpen], ['closed', i18n.agendaFilterClosed], ['discarded', 'DISCARDED']
        ].map(([value, label]) => ({ label: String(label).toUpperCase(), count: Number(counts[value] || 0) }))),
        form({ method: 'GET', action: '/agenda', class: 'filter-box' },
          input({ type: 'hidden', name: 'filter', value: filter }),
          input({ type: 'text', name: 'q', value: q, placeholder: i18n.agendaSearchPlaceholder, class: 'filter-box__input' }),
          div({ class: 'filter-box__controls' },
            button({ type: 'submit', class: 'filter-box__button' }, i18n.searchButton)
          )
        )
      ),
      items.length
        ? div({ class: 'jobs-grid agenda-list' }, ...paged(items).map(item => renderAgendaItem(item, userId, filter, extras || {})))
        : div({ class: 'no-content-box' }, p({ class: 'no-content' }, i18n.agendaNoItems))
    )
  );
};

