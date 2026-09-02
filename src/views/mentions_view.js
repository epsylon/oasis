const { div, h2, p, section, button, form, input, span } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderContentActions } = require("./main_views");
const { getViewDetailsAction } = require("./activity_view");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");

const userId = config.keys.id;

const excerpt = (text, max = 320) => {
  const s = String(text == null ? "" : text).trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
};

const typeLabel = (type) => i18n['type' + String(type || '').charAt(0).toUpperCase() + String(type || '').slice(1)] || String(type || '').toUpperCase();

const renderMentionCard = (item) => {
  const href = getViewDetailsAction(item.type, { id: item.id, key: item.id, author: item.author, content: item.content });
  const isOwn = String(item.author) === String(userId);
  return div({ class: "trending-card mention-card" + (isOwn ? " own-content" : "") },
    div({ class: "card-header activity-card-header" },
      div({ class: 'card-chips-row' },
        span({ class: 'pm-exposition-chip pm-exposition-whole' },
          span({ class: 'pm-exposition-text' }, typeLabel(item.type))
        )
      ),
      renderContentActions(item.id, href, { author: item.author, reportTitle: item.title || item.text })
    ),
    div({ class: "card-section mention-card-body" },
      item.title
        ? div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, item.title))
        : null,
      item.text ? p({ class: "mention-text" }, ...renderUrl(excerpt(item.text))) : null,
      p({ class: "card-footer" },
        span({ class: "date-link" }, moment(item.createdAt).format("YYYY/MM/DD HH:mm")),
        span(" · "),
        userLink(item.author)
      )
    )
  );
};

exports.mentionsView = async (items = [], filter = 'ALL', params = {}) => {
  const counts = params.counts || {};
  const types = Object.keys(counts).sort((a, b) => (counts[b] - counts[a]) || a.localeCompare(b));
  const q = params.q || '';

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
      div({ class: "filters activity-filter-chips activity-toolbar-row" },
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
        ? div({ class: "mentions-list" }, ...items.map(renderMentionCard))
        : p({ class: "empty" }, i18n.noMentions)
    )
  );
};
