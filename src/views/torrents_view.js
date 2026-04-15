const {
  form,
  button,
  div,
  h2,
  p,
  section,
  input,
  br,
  a,
  span,
  textarea,
  select,
  label,
  option,
  table,
  tr,
  th,
  td
} = require("../server/node_modules/hyperaxe");

const { template, i18n } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");
const opinionCategories = require("../backend/opinion_categories");

const userId = config.keys.id;

const safeArr = (v) => (Array.isArray(v) ? v : []);
const safeText = (v) => String(v || "").trim();

const buildReturnTo = (filter, params = {}) => {
  const f = safeText(filter || "all");
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const parts = [`filter=${encodeURIComponent(f)}`];
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (sort) parts.push(`sort=${encodeURIComponent(sort)}`);
  return `/torrents?${parts.join("&")}`;
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

const renderTorrentFavoriteToggle = (torrentObj, returnTo = "") =>
  form(
    {
      method: "POST",
      action: torrentObj.isFavorite
        ? `/torrents/favorites/remove/${encodeURIComponent(torrentObj.key)}`
        : `/torrents/favorites/add/${encodeURIComponent(torrentObj.key)}`
    },
    returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
    button(
      { type: "submit", class: "filter-btn" },
      torrentObj.isFavorite ? i18n.torrentRemoveFavoriteButton : i18n.torrentAddFavoriteButton
    )
  );

const renderTorrentOwnerActions = (filter, torrentObj, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  const isAuthor = String(torrentObj.author) === String(userId);
  const hasOpinions = Object.keys(torrentObj.opinions || {}).length > 0;

  if (!isAuthor) return [];

  const items = [];
  if (!hasOpinions) {
    items.push(
      form(
        { method: "GET", action: `/torrents/edit/${encodeURIComponent(torrentObj.key)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ class: "update-btn", type: "submit" }, i18n.torrentUpdateButton)
      )
    );
  }
  items.push(
    form(
      { method: "POST", action: `/torrents/delete/${encodeURIComponent(torrentObj.key)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.torrentDeleteButton)
    )
  );

  return items;
};

const renderTorrentCommentsSection = (torrentId, comments = [], returnTo = null) => {
  const list = safeArr(comments);
  const commentsCount = list.length;

  return div(
    { class: "vote-comments-section" },
    div(
      { class: "comments-count" },
      span({ class: "card-label" }, i18n.voteCommentsLabel + ": "),
      span({ class: "card-value" }, String(commentsCount))
    ),
    div(
      { class: "comment-form-wrapper" },
      h2({ class: "comment-form-title" }, i18n.voteNewCommentLabel),
      form(
        { method: "POST", action: `/torrents/${encodeURIComponent(torrentId)}/comments`, class: "comment-form", enctype: "multipart/form-data" },
        returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
        textarea({
          id: "comment-text",
          name: "text",
          rows: 4,
          class: "comment-textarea",
          placeholder: i18n.voteNewCommentPlaceholder
        }),
        div({ class: "comment-file-upload" }, label(i18n.uploadMedia), input({ type: "file", name: "blob" })),
        br(),
        button({ type: "submit", class: "comment-submit-btn" }, i18n.voteNewCommentButton)
      )
    ),
    list.length
      ? div(
          { class: "comments-list" },
          list.map((c) => {
            const author = c?.value?.author || "";
            const ts = c?.value?.timestamp || c?.timestamp;
            const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm:ss") : "";
            const relDate = ts ? moment(ts).fromNow() : "";
            const userName = author && author.includes("@") ? author.split("@")[1] : author;
            const content = c?.value?.content || {};
            const rootId = content.fork || content.root || null;
            const text = content.text || "";

            return div(
              { class: "votations-comment-card" },
              span(
                { class: "created-at" },
                span(i18n.createdBy),
                author ? a({ href: `/author/${encodeURIComponent(author)}` }, `@${userName}`) : span("(unknown)"),
                absDate ? span(" | ") : "",
                absDate ? span({ class: "votations-comment-date" }, absDate) : "",
                relDate ? span({ class: "votations-comment-date" }, " | ", i18n.sendTime) : "",
                relDate && rootId ? a({ href: `/thread/${encodeURIComponent(rootId)}#${encodeURIComponent(c.key)}` }, relDate) : ""
              ),
              p({ class: "votations-comment-text" }, ...renderUrl(text))
            );
          })
        )
      : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet)
  );
};

const formatSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n === 0) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
};

const renderTorrentTable = (torrents, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);

  if (!torrents.length) return p(params.q ? i18n.torrentNoMatch : i18n.noTorrents);

  return table(
    { border: "1", class: "torrent-table" },
    tr(
      th(i18n.createdAt || "DATE"),
      th(i18n.authorLabel || "AUTHOR"),
      th(i18n.torrentTitleLabel || "TITLE"),
      th(i18n.torrentSizeLabel || "SIZE"),
      th(""),
      th("")
    ),
    torrents.map((t) =>
      tr(
        td(moment(t.createdAt).format("YYYY/MM/DD HH:mm")),
        td(a({ href: `/author/${encodeURIComponent(t.author)}`, class: "user-link" }, t.author)),
        td(t.title || ""),
        td(formatSize(t.size)),
        td(
          form(
            { method: "GET", action: `/torrents/${encodeURIComponent(t.key)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            input({ type: "hidden", name: "filter", value: filter || "all" }),
            params.q ? input({ type: "hidden", name: "q", value: params.q }) : null,
            params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
          )
        ),
        td(
          t.url && t.url.startsWith("&")
            ? a({ href: `/blob/${encodeURIComponent(t.url)}`, class: "filter-btn" }, i18n.torrentDownloadButton || "DOWNLOAD IT!")
            : ""
        )
      )
    )
  );
};

const renderTorrentForm = (filter, torrentId, torrentToEdit, params = {}) => {
  const returnTo = safeText(params.returnTo) || buildReturnTo("all", params);
  return div(
    { class: "div-center audio-form" },
    form(
      {
        action: filter === "edit" ? `/torrents/update/${encodeURIComponent(torrentId)}` : "/torrents/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      span(i18n.torrentFileLabel),
      br(),
      input({ type: "file", name: "torrent", accept: ".torrent", required: filter !== "edit" }),
      br(),
      br(),
      span(i18n.torrentTitleLabel),
      br(),
      input({ type: "text", name: "title", placeholder: i18n.torrentTitlePlaceholder, value: torrentToEdit?.title || "", required: true }),
      br(),
      span(i18n.torrentDescriptionLabel),
      br(),
      textarea({ name: "description", placeholder: i18n.torrentDescriptionPlaceholder, rows: "4" }, torrentToEdit?.description || ""),
      br(),
      span(i18n.torrentTagsLabel),
      br(),
      input({
        type: "text",
        name: "tags",
        placeholder: i18n.torrentTagsPlaceholder,
        value: safeArr(torrentToEdit?.tags).join(", ")
      }),
      br(),
      br(),
      button({ type: "submit" }, filter === "edit" ? i18n.torrentUpdateButton : i18n.torrentCreateButton)
    )
  );
};

exports.torrentsView = async (torrents, filter = "all", torrentId = null, params = {}) => {
  const title =
    filter === "mine"
      ? i18n.torrentMineSectionTitle
      : filter === "create"
        ? i18n.torrentCreateSectionTitle
        : filter === "edit"
          ? i18n.torrentUpdateSectionTitle
          : filter === "recent"
            ? i18n.torrentRecentSectionTitle
            : filter === "top"
              ? i18n.torrentTopSectionTitle
              : filter === "favorites"
                ? i18n.torrentFavoritesSectionTitle
                : i18n.torrentAllSectionTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(torrents);
  const torrentToEdit = torrentId ? list.find((t) => t.key === torrentId) : null;

  return template(
    title,
    section(
      div({ class: "tags-header" }, h2(title), p(i18n.torrentsDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/torrents", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.torrentFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.torrentFilterMine),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.torrentFilterRecent),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, i18n.torrentFilterTop),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            i18n.torrentFilterFavorites
          ),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.torrentCreateButton)
        )
      )
    ),
    section(
      filter === "create" || filter === "edit"
        ? renderTorrentForm(filter, torrentId, torrentToEdit, { ...params, filter })
        : section(
            div(
              { class: "audios-search" },
              form(
                { method: "GET", action: "/torrents", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter }),
                input({
                  type: "text",
                  name: "q",
                  value: q,
                  placeholder: i18n.torrentSearchPlaceholder,
                  class: "filter-box__input"
                }),
                div(
                  { class: "filter-box__controls" },
                  select(
                    { name: "sort", class: "filter-box__select" },
                    option({ value: "recent", selected: sort === "recent" }, i18n.torrentSortRecent),
                    option({ value: "oldest", selected: sort === "oldest" }, i18n.torrentSortOldest),
                    option({ value: "top", selected: sort === "top" }, i18n.torrentSortTop)
                  ),
                  button({ type: "submit", class: "filter-box__button" }, i18n.torrentSearchButton)
                )
              )
            ),
            div({ class: "audios-list" }, renderTorrentTable(list, filter, { q, sort }))
          )
    )
  );
};

exports.singleTorrentView = async (torrentObj, filter = "all", comments = [], params = {}) => {
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q, sort });

  const title = safeText(torrentObj.title);
  const ownerActions = renderTorrentOwnerActions(filter, torrentObj, { q, sort });

  const topbar = div(
    { class: "bookmark-topbar" },
    div({ class: "bookmark-actions" }, renderTorrentFavoriteToggle(torrentObj, returnTo), ...ownerActions)
  );

  return template(
    i18n.torrentsTitle,
    section(
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/torrents", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.torrentFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.torrentFilterMine),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.torrentFilterRecent),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, i18n.torrentFilterTop),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            i18n.torrentFilterFavorites
          ),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.torrentCreateButton)
        )
      ),
      div(
        { class: "bookmark-item card" },
        topbar,
        title ? h2(title) : null,
        safeText(torrentObj.description) ? p(...renderUrl(torrentObj.description)) : null,
        torrentObj.url && torrentObj.url.startsWith("&")
          ? div({ class: "torrent-download" },
              a({ href: `/blob/${encodeURIComponent(torrentObj.url)}?name=${encodeURIComponent((torrentObj.title || 'download').replace(/\.torrent$/i, '') + '.torrent')}` , class: "filter-btn" }, i18n.torrentDownloadButton || "DOWNLOAD IT!")
            )
          : p(i18n.torrentNoFile),
        renderTags(torrentObj.tags),
        br(),
        (() => {
          const createdTs = torrentObj.createdAt ? new Date(torrentObj.createdAt).getTime() : NaN;
          const updatedTs = torrentObj.updatedAt ? new Date(torrentObj.updatedAt).getTime() : NaN;
          const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

          return p(
            { class: "card-footer" },
            span({ class: "date-link" }, `${moment(torrentObj.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
            a({ href: `/author/${encodeURIComponent(torrentObj.author)}`, class: "user-link" }, `${torrentObj.author}`),
            showUpdated
              ? span(
                  { class: "votations-comment-date" },
                  ` | ${i18n.torrentUpdatedAt}: ${moment(torrentObj.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
                )
              : null
          );
        })(),
        div(
          { class: "voting-buttons" },
          opinionCategories.map((category) =>
            form(
              { method: "POST", action: `/torrents/opinions/${encodeURIComponent(torrentObj.key)}/${category}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              button(
                { class: "vote-btn" },
                `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${
                  torrentObj.opinions?.[category] || 0
                }]`
              )
            )
          )
        )
      ),
      div({ id: "comments" }, renderTorrentCommentsSection(torrentObj.key, comments, returnTo))
    )
  );
};
