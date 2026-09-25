const { div, h2, p, section, button, form, input, span } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderContentActions, renderModuleStats } = require("./main_views");
const { getViewDetailsAction } = require("./activity_view");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderStyledText } = require("../backend/renderStyledText");

const userId = config.keys.id;

const excerpt = (text, max = 320) => {
  const s = String(text == null ? "" : text).trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
};

const typeLabel = (type) => i18n['type' + String(type || '').charAt(0).toUpperCase() + String(type || '').slice(1)] || String(type || '').toUpperCase();

const renderMentionCard = (item, readKeys) => {
  const href = getViewDetailsAction(item.type, { id: item.id, key: item.id, author: item.author, content: item.content });
  const isOwn = String(item.author) === String(userId);
  const read = readKeys.has(String(item.key));
  return div({ class: "trending-card mention-card" + (isOwn ? " own-content" : "") },
    div({ class: "card-header activity-card-header" },
      div({ class: 'card-chips-row' },
        span({ class: 'pm-exposition-chip pm-exposition-whole' },
          span({ class: 'pm-exposition-text' }, typeLabel(item.type))
        ),
        read ? null : span({ class: 'pm-exposition-chip pm-unread-chip' }, span({ class: 'pm-exposition-text' }, i18n.inboxUnreadChip))
      ),
      renderContentActions(item.id, href, { author: item.author, reportTitle: item.title || item.text })
    ),
    div({ class: "card-section mention-card-body" },
      item.title
        ? div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, item.title))
        : null,
      item.text ? p({ class: "mention-text" }, ...renderStyledText(excerpt(item.text))) : null,
      p({ class: "card-footer" },
        span({ class: "date-link" }, `${moment(item.createdAt).format("YYYY/MM/DD HH:mm")}`),
        userLink(item.author)
      ),
      div({ class: "pm-actions mention-actions" },
        form({ method: "POST", action: `/mentions/${read ? 'unread' : 'read'}/${encodeURIComponent(item.key)}`, class: "pm-action-form" },
          button({ type: "submit", class: "pm-btn read-btn" }, String(read ? i18n.inboxMarkUnread : i18n.inboxMarkRead).toUpperCase())
        )
      )
    )
  );
};

exports.mentionsView = async (items = [], filter = 'ALL', params = {}) => {
  const counts = params.counts || {};
  const types = Object.keys(counts).sort((a, b) => (counts[b] - counts[a]) || a.localeCompare(b));
  const q = params.q || '';
  const readKeys = new Set(Array.isArray(params.readKeys) ? params.readKeys.map(String) : []);
  const unreadShown = items.filter(x => x && x.key && !readKeys.has(String(x.key))).map(x => String(x.key));
  const emptyMentions = (!Array.isArray(items) || items.length === 0) && String(filter || 'ALL').toUpperCase() === 'ALL' && !q.trim();

  return template(
    i18n.mentions,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.mentions),
        p(i18n.mentionsDescription)
      ),
      types.length
        ? div({ class: "filters" },
            form({ method: "GET", action: "/mentions", class: "ui-toolbar ui-toolbar--filters" },
              ...types.map(t =>
                button({ type: "submit", name: "filter", value: t, class: filter === t ? "filter-btn active" : "filter-btn" },
                  `${typeLabel(t)} (${counts[t]})`)
              )
            )
          )
        : null,
      emptyMentions ? null : div({ class: "filters activity-filter-chips activity-toolbar-row" },
        renderModuleStats(items.length),
        unreadShown.length ? form({ method: "POST", action: "/mentions/read-all", class: "inbox-vis-toggle" },
          ...unreadShown.map(k => input({ type: "hidden", name: "keys", value: k })),
          button({ type: "submit", class: "btn" }, `${i18n.inboxMarkAllRead} (${unreadShown.length})`)
        ) : null,
        form({ method: "GET", action: "/mentions", class: "filter-box" },
          input({ type: "hidden", name: "filter", value: filter }),
          input({ type: "text", name: "q", value: q, placeholder: i18n.mentionsSearchPlaceholder, class: "filter-box__input" }),
          div({ class: "filter-box__controls" },
            button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
          )
        )
      )
    ),
    section(
      items.length
        ? div({ class: "mentions-list" }, ...items.map(item => renderMentionCard(item, readKeys)))
        : div({ class: "no-content-box" }, p({ class: "empty" }, i18n.noMentions))
    )
  );
};
