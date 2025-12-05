const { form, button, div, h2, p, section, input, a, span, img } = require("../server/node_modules/hyperaxe");

const { template, i18n } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { renderUrl } = require("../backend/renderUrl");

const safeArr = (v) => (Array.isArray(v) ? v : []);
const safeText = (v) => String(v || "").trim();

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

  const titlePrefix = `[${String(item.kind || "").toUpperCase()}]`;
  const title = safeText(item.title) || safeText(item.name) || safeText(item.category) || safeText(item.url) || "";

  const ts = item.updatedAt || item.createdAt;
  const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm:ss") : "";

  return div(
    { class: "tags-header bookmark-card" },
    div(
      { class: "bookmark-topbar" },
      div(
        { class: "bookmark-topbar-left" },
        form(
          { method: "GET", action: item.viewHref },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
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
    title ? h2(`${titlePrefix} ${title}`) : h2(titlePrefix),
    renderImagePreview(item),
    renderBookmarkUrl(item),
    safeText(item.description) ? p(...renderUrl(item.description)) : null,
    renderTags(item.tags),
    p(
      { class: "card-footer" },
      absDate ? span({ class: "date-link" }, `${absDate} ${i18n.performed} `) : "",
      item.author ? a({ href: `/author/${encodeURIComponent(item.author)}`, class: "user-link" }, `${item.author}`) : ""
    )
  );
};

exports.favoritesView = async (items, filter = "all", counts = {}) => {
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
          button(
            { type: "submit", name: "filter", value: "audios", class: filter === "audios" ? "filter-btn active" : "filter-btn" },
            `${i18n.favoritesFilterAudios} (${c.audios || 0})`
          ),
          button(
            { type: "submit", name: "filter", value: "bookmarks", class: filter === "bookmarks" ? "filter-btn active" : "filter-btn" },
            `${i18n.favoritesFilterBookmarks} (${c.bookmarks || 0})`
          ),
          button(
            { type: "submit", name: "filter", value: "documents", class: filter === "documents" ? "filter-btn active" : "filter-btn" },
            `${i18n.favoritesFilterDocuments} (${c.documents || 0})`
          ),
          button(
            { type: "submit", name: "filter", value: "images", class: filter === "images" ? "filter-btn active" : "filter-btn" },
            `${i18n.favoritesFilterImages} (${c.images || 0})`
          ),
          button(
            { type: "submit", name: "filter", value: "videos", class: filter === "videos" ? "filter-btn active" : "filter-btn" },
            `${i18n.favoritesFilterVideos} (${c.videos || 0})`
          )
        )
      ),
      div({ class: "bookmark-list" }, safeArr(items).length ? safeArr(items).map((it) => renderFavoriteCard(it, filter)) : p(i18n.favoritesNoItems))
    )
  );
};

