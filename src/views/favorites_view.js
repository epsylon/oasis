const { form, button, div, h2, p, section, input, a, span, img } = require("../server/node_modules/hyperaxe");

const { template, i18n, userLink, renderContentActions } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");

const userId = config.keys.id;

const safeArr = (v) => (Array.isArray(v) ? v : []);
const safeText = (v) => String(v || "").trim();

const FILTER_KINDS = [
  { value: "audios", label: () => i18n.favoritesFilterAudios },
  { value: "bookmarks", label: () => i18n.favoritesFilterBookmarks },
  { value: "calendars", label: () => i18n.favoritesFilterCalendars },
  { value: "chats", label: () => i18n.favoritesFilterChats },
  { value: "documents", label: () => i18n.favoritesFilterDocuments },
  { value: "events", label: () => i18n.favoritesFilterEvents },
  { value: "forum", label: () => i18n.favoritesFilterForum },
  { value: "housing", label: () => i18n.favoritesFilterHousing },
  { value: "images", label: () => i18n.favoritesFilterImages },
  { value: "jobs", label: () => i18n.favoritesFilterJobs },
  { value: "maps", label: () => i18n.favoritesFilterMaps },
  { value: "market", label: () => i18n.favoritesFilterMarket },
  { value: "pads", label: () => i18n.favoritesFilterPads },
  { value: "projects", label: () => i18n.favoritesFilterProjects },
  { value: "reports", label: () => i18n.favoritesFilterReports },
  { value: "shopProducts", label: () => i18n.favoritesFilterShopProducts },
  { value: "tasks", label: () => i18n.favoritesFilterTasks },
  { value: "torrents", label: () => i18n.favoritesFilterTorrents },
  { value: "transfers", label: () => i18n.favoritesFilterTransfers },
  { value: "videos", label: () => i18n.favoritesFilterVideos },
  { value: "votes", label: () => i18n.favoritesFilterVotes }
];

const buildReturnTo = (filter) => {
  const f = safeText(filter || "all");
  return `/favorites?filter=${encodeURIComponent(f)}`;
};

const renderTags = (tags) => {
  const list = safeArr(tags).map((t) => String(t || "").trim()).filter(Boolean);
  return list.length
    ? div(
        { class: "card-tags" },
        list.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
      )
    : null;
};

const DETAIL_KEYS = [
  "status", "category", "severity", "priority", "location", "place",
  "date", "deadline", "startTime", "endTime", "price", "salary", "amount",
  "concept", "question", "housing_type", "property_type", "item_type", "sector"
];

const fieldLabel = (key) => {
  const camel = key.replace(/_(.)/g, (_, c) => c.toUpperCase());
  return i18n[camel + "Label"] || i18n["search" + camel.charAt(0).toUpperCase() + camel.slice(1)] || camel.toUpperCase();
};

const fieldValue = (v) => {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.filter(Boolean).join(", ");
  if (typeof v === "object") return "";
  return String(v).trim();
};

const renderDetailFields = (item) => {
  const content = item && item.content;
  if (!content || typeof content !== "object") return null;
  const rows = DETAIL_KEYS
    .map((k) => [k, fieldValue(content[k])])
    .filter(([, v]) => v)
    .map(([k, v]) =>
      div({ class: "card-field" },
        span({ class: "card-label" }, `${fieldLabel(k)}: `),
        span({ class: "card-value" }, v)
      )
    );
  const members = ["members", "participants", "attendees", "assignees", "confirmedBy"]
    .map((k) => [k, Array.isArray(content[k]) ? content[k].length : null])
    .find(([, n]) => typeof n === "number" && n > 0);
  if (members) {
    rows.push(div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${fieldLabel(members[0])}: ${members[1]}`)
    ));
  }
  return rows.length ? div({ class: "cv-card-fields" }, ...rows) : null;
};

const renderBookmarkUrl = (item) => {
  if (item.kind !== "bookmarks") return null;
  if (!item.url) return null;
  return p(
    a(
      { href: item.url, target: "_blank", rel: "noreferrer noopener", class: "bookmark-url" },
      item.url
    )
  );
};

const renderImagePreview = (item) => {
  if (item.kind !== "images") return null;
  if (!item.url) return null;

  return div(
    { class: "image-container" },
    a(
      { href: item.viewHref },
      img({
        src: `/image/256/${encodeURIComponent(item.url)}`,
        alt: item.title || "",
        class: "media-preview",
        loading: "lazy"
      })
    )
  );
};

const renderFavoriteCard = (item, filter) => {
  const returnTo = buildReturnTo(filter);

  const title = safeText(item.title) || safeText(item.name) || safeText(item.category) || safeText(item.url) || "";

  const ts = item.updatedAt || item.createdAt;
  const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm") : "";

  const isOwn = item.author && String(item.author) === String(userId);
  return div(
    { class: "trending-card favorites-card" + (isOwn ? " own-content" : "") },
    div(
      { class: "card-header activity-card-header" },
      div({ class: 'card-chips-row' },
        span({ class: 'pm-exposition-chip pm-exposition-whole' },
          span({ class: 'pm-exposition-text' }, String(item.kind || '').toUpperCase())
        )
      ),
      renderContentActions(item.favId, item.viewHref)
    ),
    div(
      { class: "card-section favorites-card-body" },
      div(
        { class: "bookmark-topbar" },
        div(
          { class: "bookmark-topbar-left" },
          form(
            {
              method: "POST",
              action: `/favorites/remove/${encodeURIComponent(item.kind)}/${encodeURIComponent(item.favId)}`,
              class: "bookmark-favorite-form"
            },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            button({ type: "submit", class: "filter-btn" }, i18n.favoritesRemoveButton)
          )
        )
      ),
      title ? h2(title) : null,
      renderImagePreview(item),
      renderBookmarkUrl(item),
      safeText(item.description) ? p(...renderUrl(item.description)) : null,
      renderDetailFields(item),
      renderTags(item.tags),
      p(
        { class: "card-footer" },
        absDate ? span({ class: "date-link" }, `${absDate} ${i18n.performed} `) : "",
        item.author ? userLink(item.author) : ""
      )
    )
  );
};

exports.favoritesView = async (items, filter = "all", counts = {}, q = "") => {
  const c = counts || {};
  const total = typeof c.all === "number" ? c.all : safeArr(items).length;

  return template(
    i18n.favoritesTitle,
    section(
      div({ class: "tags-header" }, h2(i18n.favoritesTitle), p(i18n.favoritesDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/favorites", class: "ui-toolbar ui-toolbar--filters" },
          button(
            { type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" },
            `${i18n.favoritesFilterAll} (${total})`
          ),
          button(
            { type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" },
            `${i18n.favoritesFilterRecent} (${total})`
          ),
          ...FILTER_KINDS.map((k) =>
            button(
              { type: "submit", name: "filter", value: k.value, class: filter === k.value ? "filter-btn active" : "filter-btn" },
              `${k.label()} (${c[k.value] || 0})`
            )
          )
        )
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/favorites", class: "filter-box" },
          input({ type: "hidden", name: "filter", value: filter }),
          input({ type: "text", name: "q", value: q, placeholder: i18n.favoritesSearchPlaceholder, class: "filter-box__input" }),
          div({ class: "filter-box__controls" },
            button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
          )
        )
      ),
      div({ class: "bookmark-list" }, safeArr(items).length ? safeArr(items).map((it) => renderFavoriteCard(it, filter)) : p(i18n.favoritesNoItems))
    )
  );
};

