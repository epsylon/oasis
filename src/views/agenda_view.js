const { div, h2, p, section, button, form, input, a } = require("../server/node_modules/hyperaxe");
const { safeExternalHref } = require("../backend/renderStyledText");
const { template, i18n, renderLayoutSwitch, renderLayoutItems, userLink, renderCardTop, renderModuleStats, renderStateChip, chipRoleOf, CONTENT_FAV_KIND, CONTENT_SPREADABLE, contentDeleteAction, paged, renderCountChip, renderSearchButton } = require('./main_views');
const { contentChipsOf, scopeChipOf, transferAmountText, isUbiTransfer, jobTypeLabelOf } = require('./activity_view');
const { renderProjectStatusChip } = require('./projects_view');
const { renderBuildStatusChip } = require('./industry_view');
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

const chip = (text, kind = "whole", icon = null, role = null) => (text === null || text === undefined || text === "") ? null : renderStateChip(kind, icon || (role === 'status' ? (kind === 'hidden' ? '✗' : '✓') : null), String(text).toUpperCase(), role);
const timeChip = (value, fmt = "YYYY/MM/DD HH:mm") => value ? p({ class: "time-chip" }, moment(value).format(fmt)) : null;
const metaLine = (text) => text && String(text).trim() ? p({ class: "job-meta-line" }, String(text)) : null;
const priceChip = (text) => text ? div({ class: "price-chip" }, text) : null;
const statusKind = (status) => String(status || "").toUpperCase() === "CLOSED" ? "hidden" : "mutuals";
const AGENDA_TYPE_KEYS = { calendarDate: 'typeCalendar' };
const moduleLabelOf = (type) => String(i18n[AGENDA_TYPE_KEYS[type] || 'type' + String(type || '').charAt(0).toUpperCase() + String(type || '').slice(1)] || type || '').toUpperCase();

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
      button({ type: 'submit', class: 'tribe-action-btn danger-btn' }, String(i18n.agendaDiscardButton).toUpperCase())
    );
  }
  const extraActions = [];
  if (filter === 'discarded') extraActions.push(form({ method: 'POST', action: `/agenda/remove/${encodeURIComponent(item.id)}`, class: 'phone-action-form' },
    button({ type: 'submit', class: 'tribe-action-btn danger-btn' }, String(i18n.agendaRemoveButton).toUpperCase())
  ));

  if (item.type === 'market') {
    chips.push(...contentChipsOf('market', item), item.includesShipping ? chip(String(i18n.marketItemIncludesShipping).replace(/\?$/, ''), 'whole', '📦', 'level') : null);
    if (String(item.item_type || '').toLowerCase() === 'auction') {
      const bids = Array.isArray(item.auctions_poll) ? item.auctions_poll.map(bid => parseFloat(String(bid).split(':')[1])).filter(n => !isNaN(n)) : [];
      const maxBid = bids.length ? Math.max(...bids) : 0;
      chips.push(renderCountChip('▲', i18n.marketItemHighestBid, `${maxBid} ECO`));
    }
    body.push(priceChip(`${item.price} ECO`), timeChip(item.deadline));
  }

  if (item.type === 'tribe') {
    chips.push(...contentChipsOf('tribe', item));
    body.push(metaLine(item.location || i18n.noLocation));
  }

  if (item.type === 'report') {
    chips.push(...contentChipsOf('report', item));
  }

  if (item.type === 'event') {
    chips.push(...contentChipsOf('event', item));
    body.push(timeChip(item.date), metaLine(item.location), parseFloat(item.price || 0) > 0 ? priceChip(`${item.price} ECO`) : null,
      item.url ? p({ class: 'job-meta-line' }, a({ href: safeExternalHref(item.url), target: "_blank", rel: "noopener noreferrer" }, item.url)) : null);
  }

  if (item.type === 'task') {
    chips.push(...contentChipsOf('task', item));
    body.push(timeChip(item.startTime), timeChip(item.endTime), metaLine(item.location));
  }

  if (item.type === 'transfer') {
    const sent = String(item.from) === String(userId);
    const other = sent ? item.to : item.from;
    chips.push(...contentChipsOf('transfer', item));
    body.push(priceChip(transferAmountText(item)), isUbiTransfer(item) ? null : timeChip(item.deadline),
      other ? p({ class: 'job-meta-line' }, `${sent ? '→' : '←'} `, userLink(other)) : null);
  }

  if (item.type === 'project') {
    chips.push(renderProjectStatusChip(String(item.status || 'ACTIVE').toUpperCase()), renderCountChip('▰', i18n.projectProgress, `${item.progress || 0}%`));
    body.push(priceChip(`${item.pledged || 0} / ${item.goal} ECO`), item.deadline ? timeChip(item.deadline) : metaLine(i18n.noDeadline));
  }

  if (item.type === 'calendar') {
    chips.push(...contentChipsOf('calendar', item));
    body.push(timeChip(item.deadline));
  }

  if (item.type === 'calendarDate') {
    body.push(timeChip(item.date));
  }

  if (item.type === 'campaign') {
    chips.push(...contentChipsOf('campaign', item));
    body.push(timeChip(item.deadline));
  }

  if (item.type === 'logisticsRoute') {
    chips.push(...contentChipsOf('logisticsRoute', item));
    body.push(metaLine(`${item.origin || ''} → ${item.destination || ''}`), timeChip(item.date));
  }

  if (item.type === 'schoolCourse') {
    chips.push(...contentChipsOf('schoolCourse', item), renderCountChip('👥', i18n.schoolStudents, Array.isArray(item.students) ? item.students.length : 0));
  }

  if (item.type === 'housing') {
    const isOwner = String(item.author) === String(userId);
    const requestCount = Number(item.requestCount) || 0;
    chips.push(chip(i18n["housingType" + String(item.housing_type || '').toUpperCase()] || item.housing_type, 'whole', item.housing_type === "sale" ? "🏷" : item.housing_type === "rent" ? "🔑" : "🛋", 'kind'),
      chip(String(item.status || '').toUpperCase() === 'CLOSED' ? i18n.housingStatusCLOSED : i18n.housingStatusOPEN, statusKind(item.status), null, 'status'),
      isOwner ? renderCountChip('✉', i18n.housingRequests, requestCount) : chip(i18n.housingRequestedBadge || 'REQUESTED', 'transport', '★', 'mine'));
    body.push(metaLine(item.place), priceChip(String(item.housing_type) === 'couchsurfing' ? (i18n.housingFree || 'FREE') : `${item.price} ECO`), timeChip(item.availableFrom, 'YYYY/MM/DD'));
  }

  if (item.type === 'job') {
    const subs = Array.isArray(item.subscribers)
      ? item.subscribers
      : (typeof item.subscribers === 'string'
          ? item.subscribers.split(',').map(s => s.trim()).filter(Boolean)
          : (item.subscribers && typeof item.subscribers.length === 'number' ? Array.from(item.subscribers) : []));
    const jobStatus = String(item.status || '').toUpperCase();
    chips.push(chip(jobStatus ? (i18n['jobStatus' + jobStatus] || jobStatus) : null, statusKind(jobStatus), null, 'status'), chip(item.job_type ? jobTypeLabelOf(item.job_type) : null, 'whole', '◇', 'kind'), chip(item.languages, 'whole', '◈', 'level'),
      renderCountChip('✚', i18n.jobVacants, item.vacants || 0), renderCountChip('👥', i18n.jobSubscribers, subs.length));
    body.push(metaLine(item.location), priceChip(`${item.salary} ECO`));
  }

  if (item.type === 'industry') {
    chips.push(renderBuildStatusChip(item.status));
    body.push(metaLine(item.facilityName));
  }

  const isOwn = author && String(author) === String(userId);
  const favKind = CONTENT_FAV_KIND[item.type];
  const favIndex = extras.favIndex instanceof Map ? extras.favIndex : null;
  const spreadMap = extras.spreadMap instanceof Map ? extras.spreadMap : null;
  const href = getViewDetailsAction(item);
  const title = item.title || item.name || item.concept || '';
  return div({ class: 'trending-card agenda-card' + (isOwn ? ' own-content' : '') },
    renderCardTop(item.id, href, {
      date: item.createdAt,
      chips: [
        renderStateChip('whole', null, moduleLabelOf(item.type), 'module'),
        chips.some(ch => chipRoleOf(ch) === 'scope') ? null : scopeChipOf(item.type, item),
        ...chips.filter(Boolean)
      ],
      author,
      reportTitle: title,
      spread: CONTENT_SPREADABLE.has(item.type) ? ((spreadMap && spreadMap.get(item.id)) || null) : undefined,
      ...(favKind ? { favKind, isFavorite: item.isFavorite === true || (!!favIndex && [item.rootId, item.id].some(id => id && favIndex.get(String(id)) === favKind)) } : {}),
      returnTo: `/agenda?filter=${encodeURIComponent(filter || 'all')}`,
      deleteAction: isOwn ? agendaDeleteAction(item) : undefined
    }),
    div({ class: 'card-section agenda-card-body' },
      div({ class: 'shop-title-row' }, h2({ class: 'tribe-card-title' }, a({ href }, title))),
      ...body.filter(Boolean),
      div({ class: 'agenda-card-actions card-actions' }, actionButton, ...extraActions)
    )
  );
};

const AGENDA_KIND_FILTERS = ['events', 'tasks', 'reports', 'tribes', 'jobs', 'market', 'projects', 'industry', 'housing', 'school', 'campaigns', 'logistics', 'calendars', 'transfers'];
const agendaFilterButton = (params, active, labelText) =>
  form({ method: 'GET', action: '/agenda' },
    ...Object.entries(params).filter(([, v]) => v).map(([name, value]) => input({ type: 'hidden', name, value })),
    button({ type: 'submit', class: active ? 'filter-btn active' : 'filter-btn' }, String(labelText).toUpperCase()));

exports.agendaView = async (data, filter, q = '', extras = {}) => {
  const scope = AGENDA_KIND_FILTERS.includes(filter) ? 'all' : filter;
  const kind = AGENDA_KIND_FILTERS.includes(filter) ? filter : (AGENDA_KIND_FILTERS.includes(extras.type) ? extras.type : '');
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
          ].filter(([value]) => value === 'all' || scope === value || kind === value || Number(counts[value] || 0) > 0)
            .map(([value, labelText]) => AGENDA_KIND_FILTERS.includes(value)
              ? agendaFilterButton({ filter: scope, type: kind === value ? '' : value }, kind === value, labelText)
              : agendaFilterButton({ filter: value, type: kind }, scope === value, labelText))
      ),
      emptyAgenda ? null : div({ class: 'filters activity-filter-chips activity-toolbar-row' },
        emptyAgenda ? null : renderLayoutSwitch('mode-buttons-row'),
        renderModuleStats(items.length, [
          ['today', i18n.agendaFilterToday || 'TODAY'], ['upcoming', i18n.agendaFilterUpcoming || 'UPCOMING'], ['overdue', i18n.agendaFilterOverdue || 'OVERDUE'],
          ['open', i18n.agendaFilterOpen], ['closed', i18n.agendaFilterClosed], ['discarded', 'DISCARDED']
        ].map(([value, label]) => ({ label: String(label).toUpperCase(), count: Number(counts[value] || 0) }))),
        form({ method: 'GET', action: '/agenda', class: 'filter-box' },
          input({ type: 'hidden', name: 'filter', value: scope }),
          kind ? input({ type: 'hidden', name: 'type', value: kind }) : null,
          input({ type: 'text', name: 'q', value: q, placeholder: i18n.agendaSearchPlaceholder, class: 'filter-box__input' }),
          div({ class: 'filter-box__controls' },
            renderSearchButton(i18n.searchButton)
          )
        )
      ),
      items.length
        ? (() => {
            const pageItems = paged(items);
            return renderLayoutItems(() => div({ class: 'jobs-grid agenda-list' }, ...pageItems.map(item => renderAgendaItem(item, userId, scope, extras || {}))));
          })()
        : div({ class: 'no-content-box' }, p({ class: 'no-content' }, i18n.agendaNoItems))
    )
  );
};

