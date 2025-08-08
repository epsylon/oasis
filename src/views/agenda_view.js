const { div, h2, p, section, button, form, img, textarea, a, br, h1, span } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require('../server/node_modules/moment');
const { config } = require('../server/SSB_server.js');

const userId = config.keys.id;

const renderCardField = (labelText, value) =>
  div({ class: 'card-field' },
    span({ class: 'card-label' }, labelText),
    span(
      { class: 'card-value' },
      ...(Array.isArray(value) ? value : [value ?? ''])
    )
  );

function getViewDetailsAction(item) {
  switch (item.type) {
    case 'transfer': return `/transfers/${encodeURIComponent(item.id)}`;
    case 'tribe': return `/tribe/${encodeURIComponent(item.id)}`;
    case 'event': return `/events/${encodeURIComponent(item.id)}`;
    case 'task': return `/tasks/${encodeURIComponent(item.id)}`;
    case 'market': return `/market/${encodeURIComponent(item.id)}`;
    case 'report': return `/reports/${encodeURIComponent(item.id)}`;
    case 'job': return `/jobs/${encodeURIComponent(item.id)}`;
    default: return `/messages/${encodeURIComponent(item.id)}`;
  }
}

const renderAgendaItem = (item, userId, filter) => {
  const fmt = d => moment(d).format('YYYY/MM/DD HH:mm:ss');
  const author = item.seller || item.organizer || item.from || item.author || '';

  const commonFields = [
    p({ class: 'card-footer' },
      span({ class: 'date-link' }, `${item.createdAt ? moment(item.createdAt).format('YYYY/MM/DD HH:mm:ss') : ''} ${i18n.performed} `),
      author ? a({ href: `/author/${encodeURIComponent(author)}`, class: 'user-link' }, `${author}`) : ''
    )
  ];

  let details = [];
  let actionButton = null;

  if (filter === 'discarded') {
    actionButton = form({ method: 'POST', action: `/agenda/restore/${encodeURIComponent(item.id)}` },
      button({ type: 'submit', class: 'restore-btn' }, i18n.agendaRestoreButton)
    );
  } else {
    actionButton = form({ method: 'POST', action: `/agenda/discard/${encodeURIComponent(item.id)}` },
      button({ type: 'submit', class: 'discard-btn' }, i18n.agendaDiscardButton)
    );
  }

  if (item.type === 'market') {
    details = [
      renderCardField(i18n.marketItemType + ":", String(item.item_type || '').toUpperCase()),
      renderCardField(i18n.marketItemStatus + ":", item.status),
      renderCardField(i18n.marketItemStock + ":", item.stock),
      renderCardField(i18n.marketItemPrice + ":", `${item.price} ECO`),
      renderCardField(i18n.marketItemIncludesShipping + ":", item.includesShipping ? i18n.agendaYes : i18n.agendaNo),
      renderCardField(i18n.deadline + ":", item.deadline ? new Date(item.deadline).toLocaleString() : '')
    ];
    if (String(item.item_type || '').toLowerCase() === 'auction') {
      const bids = Array.isArray(item.auctions_poll) ? item.auctions_poll.map(bid => parseFloat(String(bid).split(':')[1])).filter(n => !isNaN(n)) : [];
      const maxBid = bids.length ? Math.max(...bids) : 0;
      details.push(renderCardField(i18n.marketItemHighestBid + ":", `${maxBid} ECO`));
    }
    const seller = author ? p(a({ class: "user-link", href: `/author/${encodeURIComponent(author)}` }, author)) : '';
    details.push(br(), div({ class: 'members-list' }, i18n.marketItemSeller + ': ', seller));
  }

  if (item.type === 'tribe') {
    details = [
      renderCardField(i18n.agendaAnonymousLabel + ":", item.isAnonymous ? i18n.agendaYes : i18n.agendaNo),
      renderCardField(i18n.agendaInviteModeLabel + ":", (item.inviteMode ? String(item.inviteMode).toUpperCase() : i18n.noInviteMode)),
      renderCardField(i18n.agendaLARPLabel + ":", item.isLARP ? i18n.agendaYes : i18n.agendaNo),
      renderCardField(i18n.agendaLocationLabel + ":", item.location || i18n.noLocation),
      renderCardField(i18n.agendaMembersCount + ":", Array.isArray(item.members) ? item.members.length : 0),
      br()
    ];
    const membersList = Array.isArray(item.members) ? item.members.map(member => p(a({ class: "user-link", href: `/author/${encodeURIComponent(member)}` }, member))) : [];
    details.push(div({ class: 'members-list' }, `${i18n.agendaMembersLabel}:`, membersList));
  }

  if (item.type === 'report') {
    details = [
      renderCardField(i18n.agendareportStatus + ":", item.status || i18n.noStatus),
      renderCardField(i18n.agendareportCategory + ":", item.category || i18n.noCategory),
      renderCardField(i18n.agendareportSeverity + ":", (item.severity ? String(item.severity).toUpperCase() : i18n.noSeverity))
    ];
  }

  if (item.type === 'event') {
    details = [
      renderCardField(i18n.eventDateLabel + ":", item.date ? fmt(item.date) : ''),
      renderCardField(i18n.eventLocationLabel + ":", item.location || ''),
      renderCardField(i18n.eventPriceLabel + ":", `${item.price} ECO`),
      renderCardField(
        i18n.eventUrlLabel + ":",
        item.url ? p(a({ href: item.url, target: "_blank" }, item.url)) : p(i18n.noUrl)
      )
    ];
    actionButton = actionButton || form({ method: 'POST', action: `/events/attend/${encodeURIComponent(item.id)}` },
      button({ type: 'submit', class: 'assign-btn' }, `${i18n.eventAttendButton}`)
    );
  }

  if (item.type === 'task') {
    details = [
      renderCardField(i18n.taskStatus + ":", item.status),
      renderCardField(i18n.taskPriorityLabel + ":", item.priority),
      renderCardField(i18n.taskStartTimeLabel + ":", item.startTime ? new Date(item.startTime).toLocaleString() : ''),
      renderCardField(i18n.taskEndTimeLabel + ":", item.endTime ? new Date(item.endTime).toLocaleString() : ''),
      renderCardField(i18n.taskLocationLabel + ":", item.location || '')
    ];
    const assigned = Array.isArray(item.assignees) && item.assignees.includes(userId);
    actionButton = actionButton || form({ method: 'POST', action: `/tasks/assign/${encodeURIComponent(item.id)}` },
      button({ type: 'submit', class: 'assign-btn' }, assigned ? i18n.taskUnassignButton : i18n.taskAssignButton)
    );
  }

  if (item.type === 'transfer') {
    details = [
      renderCardField(i18n.agendaTransferConcept + ":", item.concept),
      renderCardField(i18n.agendaTransferAmount + ":", item.amount),
      renderCardField(i18n.agendaTransferDeadline + ":", item.deadline ? fmt(item.deadline) : ''),
      br()
    ];
    const membersList = item.to ? p(a({ class: "user-link", href: `/author/${encodeURIComponent(item.to)}` }, item.to)) : '';
    details.push(div({ class: 'members-list' }, i18n.to + ': ', membersList));
  }

  if (item.type === 'job') {
    const subs = Array.isArray(item.subscribers)
      ? item.subscribers
      : (typeof item.subscribers === 'string'
          ? item.subscribers.split(',').map(s => s.trim()).filter(Boolean)
          : (item.subscribers && typeof item.subscribers.length === 'number'
              ? Array.from(item.subscribers)
              : []));

    const subsInterleaved = subs
      .map((id, i) => [i > 0 ? ', ' : '', a({ class: 'user-link', href: `/author/${encodeURIComponent(id)}` }, id)])
      .flat();

    details = [
      renderCardField(i18n.jobStatus + ":", item.status),
      renderCardField(i18n.jobLocation + ":", (item.location || '').toUpperCase()),
      renderCardField(i18n.jobType + ":", (item.job_type || '').toUpperCase()),
      renderCardField(i18n.jobSalary + ":", `${item.salary} ECO`),
      renderCardField(i18n.jobVacants + ":", item.vacants),
      renderCardField(i18n.jobLanguages + ":", (item.languages || '').toUpperCase()),
      br(),
      div(
        { class: 'members-list' },
        i18n.jobSubscribers + ': ',br(),br(),
        ...(subs.length ? subsInterleaved : [i18n.noSubscribers.toUpperCase()])
      ),
    ];

    const subscribed = subs.includes(userId);
    if (!subscribed && String(item.status).toUpperCase() !== 'CLOSED' && item.author !== userId) {
      actionButton = form({ method: 'GET', action: `/jobs/subscribe/${encodeURIComponent(item.id)}` },
        button({ type: 'submit', class: 'subscribe-btn' }, i18n.jobSubscribeButton)
      );
    }
  }

  return div({ class: 'agenda-item card' },
    h2(`[${String(item.type || '').toUpperCase()}] ${item.title || item.name || item.concept || ''}`),
    form({ method: "GET", action: getViewDetailsAction(item) },
      button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
    ),
    actionButton,
    br(),
    ...details,
    br(),
    ...commonFields
  );
};

exports.agendaView = async (data, filter) => {
  const { items, counts } = data;
  return template(
    i18n.agendaTitle,
    section(
      div({ class: 'tags-header' },
        h2(i18n.agendaTitle),
        p(i18n.agendaDescription)
      ),
      div({ class: 'filters' },
        form({ method: 'GET', action: '/agenda' },
          button({ type: 'submit', name: 'filter', value: 'all', class: filter === 'all' ? 'filter-btn active' : 'filter-btn' },
            `${i18n.agendaFilterAll} (${counts.all})`),
          button({ type: 'submit', name: 'filter', value: 'open', class: filter === 'open' ? 'filter-btn active' : 'filter-btn' },
            `${i18n.agendaFilterOpen} (${counts.open})`),
          button({ type: 'submit', name: 'filter', value: 'closed', class: filter === 'closed' ? 'filter-btn active' : 'filter-btn' },
            `${i18n.agendaFilterClosed} (${counts.closed})`),
          button({ type: 'submit', name: 'filter', value: 'events', class: filter === 'events' ? 'filter-btn active' : 'filter-btn' },
            `${i18n.agendaFilterEvents} (${counts.events})`),
          button({ type: 'submit', name: 'filter', value: 'tasks', class: filter === 'tasks' ? 'filter-btn active' : 'filter-btn' },
            `${i18n.agendaFilterTasks} (${counts.tasks})`),
          button({ type: 'submit', name: 'filter', value: 'reports', class: filter === 'reports' ? 'filter-btn active' : 'filter-btn' },
            `${i18n.agendaFilterReports} (${counts.reports})`),
          button({ type: 'submit', name: 'filter', value: 'tribes', class: filter === 'tribes' ? 'filter-btn active' : 'filter-btn' },
            `${i18n.agendaFilterTribes} (${counts.tribes})`),
          button({ type: 'submit', name: 'filter', value: 'market', class: filter === 'market' ? 'filter-btn active' : 'filter-btn' },
            `${i18n.agendaFilterMarket} (${counts.market})`),
          button({ type: 'submit', name: 'filter', value: 'transfers', class: filter === 'transfers' ? 'filter-btn active' : 'filter-btn' },
            `${i18n.agendaFilterTransfers} (${counts.transfers})`),
          button({ type: 'submit', name: 'filter', value: 'jobs', class: filter === 'jobs' ? 'filter-btn active' : 'filter-btn' },
            `${i18n.agendaFilterJobs} (${counts.jobs})`),
          button({ type: 'submit', name: 'filter', value: 'discarded', class: filter === 'discarded' ? 'filter-btn active' : 'filter-btn' },
            `DISCARDED (${counts.discarded})`)
        )
      ),
      div({ class: 'agenda-list' },
        items.length
          ? items.map(item => renderAgendaItem(item, userId, filter))
          : p(i18n.agendaNoItems)
      )
    )
  );
};

