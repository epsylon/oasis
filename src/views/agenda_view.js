const { div, h2, p, section, button, form, img, textarea, a, br, h1 } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require('../server/node_modules/moment');
const { config } = require('../server/SSB_server.js');

userId = config.keys.id;

exports.agendaView = async (data, filter) => {
  const { items, counts } = data;
  const fmt = d => moment(d).format('YYYY/MM/DD HH:mm:ss');

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
          button({ type: 'submit', name: 'filter', value: 'discarded', class: filter === 'discarded' ? 'filter-btn active' : 'filter-btn' },
            `DISCARDED (${counts.discarded})`)
        )
      ),
      div({ class: 'agenda-list' },
        items.length
          ? items.map(item => {
              const author = item.seller || item.organizer || item.from || item.author;
              const commonFields = [
                p(`${i18n.agendaAuthor}: `, a({ href: `/author/${encodeURIComponent(author)}` }, author)),
                p(`${i18n.agendaCreatedAt}: ${fmt(item.createdAt)}`)
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
                commonFields.push(p(`${i18n.marketItemType}: ${item.item_type}`));
                commonFields.push(p(`${i18n.marketItemTitle}: ${item.title}`));
                commonFields.push(p(`${i18n.marketItemDescription}: ${item.description}`));
                commonFields.push(p(`${i18n.marketItemPrice}: ${item.price} ECO`));
                commonFields.push(p(`${i18n.marketItemIncludesShipping}: ${item.includesShipping ? i18n.agendaYes : i18n.agendaNo}`));
                commonFields.push(p(`${i18n.marketItemSeller}: `, a({ href: `/author/${encodeURIComponent(item.seller)}` }, item.seller)));
                commonFields.push(p(`${i18n.marketItemAvailable}: ${moment(item.createdAt).format('YYYY-MM-DD HH:mm')}`));
                commonFields.push(
                  item.image
                    ? img({ src: `/blob/${encodeURIComponent(item.image)}`, class: 'market-image' })
                    : p(i18n.marketNoImage)
                );
                commonFields.push(
                  item.tags && item.tags.length
                    ? div(
                        item.tags.map(tag =>
                          a(
                            {
                              href: `/search?query=%23${encodeURIComponent(tag)}`,
                              class: 'tag-link',
                              style: 'margin-right:0.8em;',
                            },
                            `#${tag}`
                          )
                        )
                      )
                    : null
                );
                if (item.item_type === 'auction') {
                  details.push(p(`${i18n.marketItemAvailable}: ${moment(item.deadline).format('YYYY-MM-DD HH:mm')}`));
                  const bids = item.auctions_poll.map(bid => parseFloat(bid.split(':')[1]));
                  const maxBid = bids.length ? Math.max(...bids) : 0;
                  details.push(p(`${i18n.marketItemHighestBid}: ${maxBid} ECO`));
                }
                details.push(p(`${i18n.marketItemStatus}: ${item.status}`));
              }
              if (item.type === 'tribe') {
                commonFields.push(p(`${i18n.agendaDescriptionLabel}: ${item.description || i18n.noDescription}`));
                details = [
                  p(`${i18n.agendaMembersCount}: ${item.members.length || 0}`),
                  p(`${i18n.agendaLocationLabel}: ${item.location || i18n.noLocation}`),
                  p(`${i18n.agendaLARPLabel}: ${item.isLARP ? i18n.agendaYes : i18n.agendaNo}`),
                  p(`${i18n.agendaAnonymousLabel}: ${item.isAnonymous ? i18n.agendaYes : i18n.agendaNo}`),
                  p(`${i18n.agendaInviteModeLabel}: ${item.inviteMode || i18n.noInviteMode}`)
                ];
                const membersList = item.members.map(member =>
                  p(a({ href: `/author/${encodeURIComponent(member)}` }, member))
                );
                details.push(
                  div({ class: 'members-list' }, `${i18n.agendaMembersLabel}:`, membersList)
                );
              }
              if (item.type === 'report') {
                details = [
                  p(`${i18n.agendareportCategory}: ${item.category || i18n.noCategory}`),
                  p(`${i18n.agendareportSeverity}: ${item.severity || i18n.noSeverity}`),
                  p(`${i18n.agendareportStatus}: ${item.status || i18n.noStatus}`),
                  p(`${i18n.agendareportDescription}: ${item.description || i18n.noDescription}`)
                ];
              }
              if (item.type === 'event') {
                details = [
                  p(`${i18n.eventDescriptionLabel}: ${item.description}`),
                  p(`${i18n.eventLocationLabel}: ${item.location}`),
                  p(`${i18n.eventDateLabel}: ${fmt(item.date)}`),
                  p(`${i18n.eventPriceLabel}: ${item.price} ECO`),
                  p(`${i18n.eventUrlLabel}: ${item.url || i18n.noUrl}`)
                ];
                actionButton = actionButton || form({ method: 'POST', action: `/events/attend/${encodeURIComponent(item.id)}` },
                  button({ type: 'submit', class: 'assign-btn' }, `${i18n.eventAttendButton}`));
              }
              if (item.type === 'task') {
                details = [
                  p(`${i18n.taskDescriptionLabel}: ${item.description}`),
                  p(`${i18n.taskPriorityLabel}: ${item.priority}`),
                  p(`${i18n.taskLocationLabel}: ${item.location}`)
                ];
                const assigned = Array.isArray(item.assignees) && item.assignees.includes(userId);
                actionButton = actionButton || form({ method: 'POST', action: `/tasks/assign/${encodeURIComponent(item.id)}` },
                  button({ type: 'submit', class: 'assign-btn' },
                    assigned ? i18n.taskUnassignButton : i18n.taskAssignButton));
              }
              if (item.type === 'transfer') {
                details = [
                  p(`${i18n.agendaTransferConcept}: ${item.concept}`),
                  p(`${i18n.agendaTransferAmount}: ${item.amount}`),
                  p(`${i18n.agendaTransferDeadline}: ${fmt(item.deadline)}`)
                ];
              }

              return div({ class: 'agenda-item' },
                h2(`[${item.type.toUpperCase()}] ${item.title || item.name || item.concept}`),
                ...commonFields,
                ...details,
                actionButton, br()
              );
            })
          : p(i18n.agendaNoItems)
      )
    )
  );
};

