const { form, button, div, h2, p, section, input, a, img } = require("../server/node_modules/hyperaxe");
const moment = require("../server/node_modules/moment");

const { template, i18n, renderLayoutSwitch, renderLayoutItems, renderCardTop, renderModuleStats, CONTENT_FAV_KIND, FAV_KIND_TYPE, CONTENT_TORRENTABLE, paged, renderEditedChip, renderStateChip, renderCountChip, renderSearchButton } = require("./main_views");
const { contentChipsOf, rootTypeLabel, transferAmountText } = require("./activity_view");
const { config } = require("../server/SSB_server.js");
const { renderStyledText, safeExternalHref } = require("../backend/renderStyledText");

const userId = config.keys.id;

const safeArr = (v) => (Array.isArray(v) ? v : []);
const safeText = (v) => String(v || "").trim();

const TORRENTABLE_KINDS = new Set(Object.keys(CONTENT_FAV_KIND).filter((t) => CONTENT_TORRENTABLE.has(t)).map((t) => CONTENT_FAV_KIND[t]));

const FILTER_KINDS = [
  { value: "audios", label: () => i18n.favoritesFilterAudios },
  { value: "bookmarks", label: () => i18n.favoritesFilterBookmarks },
  { value: "calendars", label: () => i18n.favoritesFilterCalendars },
  { value: "chats", label: () => i18n.favoritesFilterChats },
  { value: "documents", label: () => i18n.favoritesFilterDocuments },
  { value: "events", label: () => i18n.favoritesFilterEvents },
  { value: "files", label: () => i18n.favoritesFilterFiles },
  { value: "forum", label: () => i18n.favoritesFilterForum },
  { value: "housing", label: () => i18n.favoritesFilterHousing },
  { value: "images", label: () => i18n.favoritesFilterImages },
  { value: "jobs", label: () => i18n.favoritesFilterJobs },
  { value: "maps", label: () => i18n.favoritesFilterMaps },
  { value: "market", label: () => i18n.favoritesFilterMarket },
  { value: "pads", label: () => i18n.favoritesFilterPads },
  { value: "projects", label: () => i18n.favoritesFilterProjects },
  { value: "reports", label: () => i18n.favoritesFilterReports },
  { value: "rooms", label: () => i18n.favoritesFilterRooms },
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


const typeOfItem = (item) => {
  const type = FAV_KIND_TYPE[item.kind] || item.kind;
  return type === "podcast" && item.content && item.content.channelId ? "podcastEpisode" : type;
};

const moduleLabelOf = (item, type) => String(i18n["type" + type.charAt(0).toUpperCase() + type.slice(1)] || rootTypeLabel(type) || item.kind || "").toUpperCase();

const DATE_FIELDS = [
  ["date", () => i18n.eventDateLabel],
  ["deadline", () => i18n.voteDeadlineLabel],
  ["startTime", () => i18n.taskStartTimeLabel],
  ["endTime", () => i18n.taskEndTimeLabel]
];
const DEADLINE_IN_CHIPS = new Set(["poll", "pad"]);

const renderDateChips = (type, content) =>
  DATE_FIELDS
    .filter(([key]) => !(key === "deadline" && DEADLINE_IN_CHIPS.has(type)))
    .map(([key, label]) => content[key] && moment(content[key]).isValid() ? renderCountChip("◷", label(), moment(content[key]).format("YYYY/MM/DD HH:mm")) : null);

const priceTextOf = (type, c) => {
  if (type === "transfer") return transferAmountText(c);
  if (type === "housing") return String(c.housing_type || "").toLowerCase() === "couchsurfing" ? i18n.housingFree : (Number(c.price) > 0 ? `${Number(c.price).toFixed(2)} ECO` : null);
  if (type === "job") return c.salary ? `${c.salary} ECO` : null;
  if (["market", "shopProduct", "event"].includes(type)) return Number(c.price) > 0 ? `${c.price} ECO` : null;
  return null;
};

const renderPriceAndPlace = (type, c) => {
  const price = priceTextOf(type, c);
  const place = safeText(c.location || c.place);
  return [
    price ? div({ class: "price-chip" }, price) : null,
    place ? p({ class: "job-meta-line" }, `📍 ${place}`) : null
  ];
};

const renderItemChips = (item, type, c) => [
  ...contentChipsOf(type, c, { action: { id: item.favId, key: item.favId, rootId: c.rootId || item.favId, vote: c, poll: c, scope: item.scope } }),
  ...renderDateChips(type, c)
];

const renderBookmarkUrl = (item) => {
  if (item.kind !== "bookmarks") return null;
  if (!item.url) return null;
  return p(
    a(
      { href: safeExternalHref(item.url), target: "_blank", rel: "noreferrer noopener", class: "bookmark-url" },
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

const renderFavoriteCard = (item, filter, spreadMap = null) => {
  const returnTo = buildReturnTo(filter);

  const type = typeOfItem(item);
  const c = item.content && typeof item.content === "object" ? item.content : {};
  const title = safeText(c.title) || safeText(c.name) || safeText(c.question) || safeText(c.concept) || safeText(item.title) || safeText(item.url) || "";
  const isOwn = item.author && String(item.author) === String(userId);
  return div(
    { class: "trending-card favorites-card" + (isOwn ? " own-content" : "") },
    renderCardTop(item.favId, item.viewHref, {
      date: item.createdAt || item.updatedAt,
      bylineExtra: [renderEditedChip(item.content && (item.content.key || item.content.id), item.content && item.content.rootId, item.updatedAt)],
      chips: [renderStateChip('whole', null, moduleLabelOf(item, type), 'module'), ...renderItemChips(item, type, c)],
      author: item.author,
      spread: (spreadMap && spreadMap.get(item.favId)) || null,
      reportTitle: title,
      ...(TORRENTABLE_KINDS.has(item.kind) && typeof item.url === "string" && item.url.startsWith("&") ? { torrentFrom: { blobId: item.url, name: item.title } } : {})
    }),
    div(
      { class: "card-section favorites-card-body" },
      title ? div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, item.viewHref ? a({ href: item.viewHref }, title) : title)) : null,
      renderImagePreview(item),
      renderBookmarkUrl(item),
      safeText(item.description) ? p(...renderStyledText(item.description)) : null,
      ...renderPriceAndPlace(type, c),
      renderTags(item.tags),
      div(
        { class: "agenda-card-actions card-actions" },
        form(
          { method: "POST", action: `/favorites/remove/${encodeURIComponent(item.kind)}/${encodeURIComponent(item.favId)}`, class: "phone-action-form" },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          button({ type: "submit", class: "tribe-action-btn danger-btn" }, String(i18n.agendaDiscardButton).toUpperCase())
        )
      )
    )
  );
};

const favFilterButton = (params, active, text) =>
  form({ method: "GET", action: "/favorites" },
    ...Object.entries(params).filter(([, v]) => v).map(([name, value]) => input({ type: "hidden", name, value })),
    button({ type: "submit", class: active ? "filter-btn active" : "filter-btn" }, text));

exports.favoritesView = async (items, filter = "all", counts = {}, q = "", params = {}) => {
  const kindValues = FILTER_KINDS.map((k) => k.value);
  const scope = kindValues.includes(filter) ? "all" : filter;
  const kind = kindValues.includes(filter) ? filter : (kindValues.includes(params.type) ? params.type : "");
  const c = counts || {};
  const total = typeof c.all === "number" ? c.all : safeArr(items).length;
  const emptyFav = total === 0 && !String(q || "").trim();

  return template(
    i18n.favoritesTitle,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.favoritesTitle), p(i18n.favoritesDescription)),
      emptyFav ? null : div(
        { class: "mode-buttons-row" },
        favFilterButton({ filter: "all", type: kind }, scope === "all", `${i18n.favoritesFilterAll} (${total})`),
        (c.recent || 0) > 0 || scope === "recent"
          ? favFilterButton({ filter: "recent", type: kind }, scope === "recent", `${i18n.favoritesFilterRecent} (${c.recent || 0})`)
          : null,
        ...FILTER_KINDS.filter((k) => (c[k.value] || 0) > 0 || kind === k.value).map((k) =>
          favFilterButton({ filter: scope, type: kind === k.value ? "" : k.value }, kind === k.value, `${k.label()} (${c[k.value] || 0})`)
        )
      ),
      emptyFav ? null : div(
        { class: "filters activity-filter-chips activity-toolbar-row" },
          emptyFav ? null : renderLayoutSwitch("filters"),
          renderModuleStats(items.length),
        form(
          { method: "GET", action: "/favorites", class: "filter-box" },
          input({ type: "hidden", name: "filter", value: scope }),
          kind ? input({ type: "hidden", name: "type", value: kind }) : null,
          input({ type: "text", name: "q", value: q, placeholder: i18n.favoritesSearchPlaceholder, class: "filter-box__input" }),
          div({ class: "filter-box__controls" },
            renderSearchButton(i18n.searchButton)
          )
        )
      ),
      (() => {
        const pageItems = paged(safeArr(items));
        if (!pageItems.length) return div({ class: "bookmark-list" }, p(i18n.favoritesNoItems));
        return renderLayoutItems(() => div({ class: "bookmark-list" }, pageItems.map((it) => renderFavoriteCard(it, filter, params.spreadMap))));
      })()
    )
  );
};

