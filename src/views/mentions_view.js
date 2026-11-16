const { div, h2, p, section, button, form, input, span } = require("../server/node_modules/hyperaxe");
const { template, i18n, renderCardTop, renderShareButton, renderCardMetaRow, CONTENT_SPREADABLE, CONTENT_TORRENTABLE, paged, renderSupportButton, hereAt, renderStateChip, asChip, renderSearchButton } = require("./main_views");
const { getViewDetailsAction, commentHref, commentLabel, rootTypeLabel, contentChipsOf, scopeChipOf } = require("./activity_view");
const { config } = require("../server/SSB_server.js");
const { renderStyledText } = require("../backend/renderStyledText");

const userId = config.keys.id;

const excerpt = (text, max = 320) => {
  const s = String(text == null ? "" : text).trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
};

const typeLabel = (type) => String((type === 'comment' ? i18n.typeComment : i18n['type' + String(type || '').charAt(0).toUpperCase() + String(type || '').slice(1)] || rootTypeLabel(type)) || type || '').toUpperCase();

const mentionActionForm = (action, key, label, cls = "") =>
  form({ method: "POST", action: `/mentions/${action}/${encodeURIComponent(key)}`, class: "pm-action-form" },
    button({ type: "submit", class: `pm-btn ${action}-btn${cls}` }, String(label).toUpperCase())
  );

const renderMentionCard = (item, readKeys, archivedKeys, params = {}) => {
  const href = item.type === 'comment'
    ? commentHref(item.comment || { rootId: item.content && item.content.root }, item.id)
    : getViewDetailsAction(item.type, { id: item.id, key: item.id, author: item.author, content: item.content });
  const isOwn = String(item.author) === String(userId);
  const read = readKeys.has(String(item.key));
  const archived = archivedKeys.has(String(item.key));
  return div({ class: "trending-card mention-card" + (isOwn ? " own-content" : "") },
    renderCardTop(item.id, href, {
      date: item.createdAt,
      chips: [div({ class: 'card-chips-row' },
        renderStateChip('whole', null, item.comment ? String(commentLabel(item.comment)).toUpperCase() : typeLabel(item.type), 'module'),
        ...(item.comment ? [scopeChipOf('comment', item.content, item)] : contentChipsOf(item.type, item.content, { action: { id: item.id, key: item.key, scope: item.scope } })),
        read || archived ? null : asChip('mine', span({ class: 'pm-exposition-chip pm-unread-chip' }, span({ class: 'pm-exposition-icon' }, '●'), span({ class: 'pm-exposition-text' }, i18n.inboxUnreadChip)))
      )],
      author: item.author,
      reportTitle: item.title || item.text,
      leadActions: [
        archived ? null : mentionActionForm(read ? 'unread' : 'read', item.key, read ? i18n.inboxMarkUnread : i18n.inboxMarkRead),
        mentionActionForm(archived ? 'unarchive' : 'archive', item.key, archived ? i18n.inboxUnarchive : i18n.inboxArchive),
        mentionActionForm('delete', item.key, i18n.privateDelete, ' danger-btn')
      ],
      spread: CONTENT_SPREADABLE.has(item.type) ? ((params.spreadMap && params.spreadMap.get(item.id)) || null) : undefined,
      ...(item.type === 'torrent' || item.type === 'file' ? { spreadTitle: i18n.seedAction } : {}),
      ...(CONTENT_TORRENTABLE.has(item.type) && item.content && typeof item.content.url === 'string' && item.content.url.startsWith('&')
        ? { torrentFrom: { blobId: item.content.url, name: item.content.title || item.content.fileName || '' } }
        : {})
    }),
    div({ class: "card-section mention-card-body" },
      item.title
        ? div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, item.title))
        : null,
      item.text ? p({ class: "mention-text" }, ...renderStyledText(excerpt(item.text))) : null
    ),
    renderCardMetaRow(
      renderShareButton(item.id, href, item.title || item.text),
      renderSupportButton(item.author, null, hereAt(item.id))
    )
  );
};

exports.mentionsView = async (items = [], filter = 'ALL', params = {}) => {
  const counts = params.counts || {};
  const types = Object.keys(counts).sort((a, b) => (counts[b] - counts[a]) || a.localeCompare(b));
  const q = params.q || '';
  const readKeys = new Set(Array.isArray(params.readKeys) ? params.readKeys.map(String) : []);
  const archivedKeys = new Set(Array.isArray(params.archivedKeys) ? params.archivedKeys.map(String) : []);
  const total = Number(params.total) || 0;
  const unreadCount = Number(params.unreadCount) || 0;
  const archivedCount = Number(params.archivedCount) || 0;
  const unreadShown = items.filter(x => x && x.key && !readKeys.has(String(x.key)) && !archivedKeys.has(String(x.key))).map(x => String(x.key));
  const shownKeys = filter === 'ARCHIVED' ? items.filter(x => x && x.key).map(x => String(x.key)) : [];
  const emptyMentions = !total && !archivedCount && !q.trim();
  const filterBtn = (value, label, count) =>
    button({ type: "submit", name: "filter", value, class: filter === value ? "filter-btn active" : "filter-btn" }, `${String(label).toUpperCase()} (${count})`);

  return template(
    i18n.mentions,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.mentions),
        p(i18n.mentionsDescription)
      ),
      emptyMentions
        ? null
        : div({ class: "filters" },
            form({ method: "GET", action: "/mentions", class: "ui-toolbar ui-toolbar--filters" },
              q ? input({ type: "hidden", name: "q", value: q }) : null,
              filterBtn('UNREAD', i18n.inboxFilterUnread, unreadCount),
              filterBtn('ALL', i18n.allButton, total),
              ...types.map(t => filterBtn(t, typeLabel(t), counts[t])),
              archivedCount || filter === 'ARCHIVED' ? filterBtn('ARCHIVED', i18n.inboxFilterArchived, archivedCount) : null
            )
          ),
      emptyMentions ? null : div({ class: "filters activity-filter-chips activity-toolbar-row" },
        unreadShown.length || shownKeys.length ? div({ class: "pm-exposition inbox-exposition" },
          span({ class: "inbox-filters-label" }, i18n.inboxFiltersLabel),
          unreadShown.length ? form({ method: "POST", action: "/mentions/read-all", class: "inbox-vis-toggle" },
            ...unreadShown.map(k => input({ type: "hidden", name: "keys", value: k })),
            button({ type: "submit", class: "btn" }, `${i18n.inboxMarkAllRead} (${unreadShown.length})`)
          ) : null,
          shownKeys.length ? form({ method: "POST", action: "/mentions/delete-many", class: "inbox-vis-toggle inbox-bulk-delete" },
            ...shownKeys.map(k => input({ type: "hidden", name: "keys", value: k })),
            button({ type: "submit", class: "btn delete-btn" }, `${String(i18n.inboxDeleteShown).toUpperCase()} (${shownKeys.length})`)
          ) : null
        ) : null,
        form({ method: "GET", action: "/mentions", class: "filter-box" },
          input({ type: "hidden", name: "filter", value: filter }),
          input({ type: "text", name: "q", value: q, placeholder: i18n.mentionsSearchPlaceholder, class: "filter-box__input" }),
          div({ class: "filter-box__controls" },
            renderSearchButton(i18n.searchButton)
          )
        )
      ),
    ),
    section(
      items.length
        ? div({ class: "mentions-list" }, ...paged(items).map(item => renderMentionCard(item, readKeys, archivedKeys, params)))
        : div({ class: "no-content-box" }, p({ class: "empty" }, i18n.noMentions))
    )
  );
};
