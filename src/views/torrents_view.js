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
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view");

const { template, i18n, renderOpinionsVoting, renderEngagement, userLink, renderSpreadButton, renderEcoTax, renderLifespanChip , renderSpreadEditWarning, renderContentActions } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");

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
  return renderSharedCommentsSection({
    action: `/torrents/${encodeURIComponent(torrentId)}/comments`,
    comments: comments,
    returnTo: returnTo
  });
};

const formatSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n === 0) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
};

const renderTorrentTable = exports.renderTorrentTable = (torrents, filter, params = {}) => {
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
        td(userLink(t.author)),
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
  const tribeId = safeText(params.tribeId || "");
  return div(
    { class: "div-center audio-form" },
    params.spreadWarning || null,
    form(
      {
        action: filter === "edit" ? `/torrents/update/${encodeURIComponent(torrentId)}` : "/torrents/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
      span(i18n.torrentFileLabel),
      br(),
      input({ type: "file", name: "torrent", accept: ".torrent", required: filter !== "edit" }),
      br(),
      br(),
      span(i18n.torrentTitleLabel),
      br(),
      input({ type: "text", name: "title", maxlength: "100", placeholder: i18n.torrentTitlePlaceholder, value: torrentToEdit?.title || "", required: true }),
      br(),
      span(i18n.torrentDescriptionLabel),
      br(),
      textarea({ maxlength: "5000", name: "description", placeholder: i18n.torrentDescriptionPlaceholder, rows: "4" }, torrentToEdit?.description || ""),
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
  if (filter === "edit") params = { ...params, spreadWarning: await renderSpreadEditWarning(torrentId) };
  const title = i18n.torrentsTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(torrents);
  const torrentToEdit = torrentId ? list.find((t) => t.key === torrentId) : null;

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(i18n.torrentsDescription)
      ),
      (() => {
        const { renderReachChip } = require('./clearnet_view');
        const isClearnet = !!(params.viewerPrefs && params.viewerPrefs.clearnetTorrents);
        return div({ class: "shop-title-row" }, renderReachChip(isClearnet, i18n));
      })(),
      br(),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/torrents", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.torrentFilterAll).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.torrentFilterMine).toUpperCase()),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.torrentFilterRecent).toUpperCase()),          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.torrentFilterFavorites).toUpperCase()
          ),

          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.torrentFilterTop).toUpperCase()),
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
                    option({ value: "recent", ...(sort === "recent" ? { selected: true } : {})}, i18n.torrentSortRecent),
                    option({ value: "oldest", ...(sort === "oldest" ? { selected: true } : {})}, i18n.torrentSortOldest),
                    option({ value: "top", ...(sort === "top" ? { selected: true } : {})}, i18n.torrentSortTop)
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
  const { renderReachChip } = require('./clearnet_view');
  const isClearnet = !!(params.authorPrefs && params.authorPrefs.clearnetTorrents);

  const chips = [
    renderLifespanChip(torrentObj.lifetime, i18n),
    torrentObj.sizeBytes ? renderEcoTax(torrentObj.sizeBytes, torrentObj.key) : null
  ].filter(Boolean);

  const ownerActions = renderTorrentOwnerActions(filter, torrentObj, { q, sort });
  const sideActions = [];
  for (const a of ownerActions) sideActions.push(a);

  const tagsNode = renderTags(torrentObj.tags);

  const detailActions = div({ class: "card-header activity-card-header" },
    renderContentActions(torrentObj.key, null, {
      author: torrentObj.author,
      favKind: 'torrents',
      isFavorite: torrentObj.isFavorite,
      spread: params.spreads || null,
      returnTo,
      reportTitle: torrentObj.title
    })
  );

  const torrentSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      title ? h2({ class: "tribe-card-title" }, title) : null,
      renderReachChip(isClearnet, i18n)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    safeText(torrentObj.description)
      ? p({ class: "tribe-side-description" }, ...renderUrl(torrentObj.description))
      : null,
    tagsNode,
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null
  );

  const torrentMain = div({ class: "tribe-main" },
    detailActions,
    torrentObj.url && torrentObj.url.startsWith("&")
      ? div({ class: "torrent-download" },
          a({ href: `/blob/${encodeURIComponent(torrentObj.url)}?name=${encodeURIComponent((torrentObj.title || 'download').replace(/\.torrent$/i, '') + '.torrent')}` , class: "filter-btn" }, i18n.torrentDownloadButton || "DOWNLOAD IT!")
        )
      : p(i18n.torrentNoFile),
    (() => {
      const createdTs = torrentObj.createdAt ? new Date(torrentObj.createdAt).getTime() : NaN;
      const updatedTs = torrentObj.updatedAt ? new Date(torrentObj.updatedAt).getTime() : NaN;
      const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

      return p(
        { class: "card-footer" },
        span({ class: "date-link" }, `${moment(torrentObj.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
        userLink(torrentObj.author),
        showUpdated
          ? span(
              { class: "votations-comment-date" },
              ` | ${i18n.torrentUpdatedAt}: ${moment(torrentObj.updatedAt).format("YYYY/MM/DD HH:mm")}`
            )
          : null
      );
    })(),
    renderEngagement(torrentObj.key,
      renderOpinionsVoting('/torrents/opinions', torrentObj.key, torrentObj.opinions, returnTo, torrentObj.opinions_inhabitants),
      renderTorrentCommentsSection(torrentObj.key, comments, returnTo)
    )
  );

  return template(
    i18n.torrentsTitle,
    section(
      div({ class: "tags-header" },
        h2(i18n.torrentAllSectionTitle || i18n.torrentsTitle),
        p(i18n.torrentDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/torrents", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.torrentFilterAll).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.torrentFilterMine).toUpperCase()),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.torrentFilterRecent).toUpperCase()),          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.torrentFilterFavorites).toUpperCase()
          ),

          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.torrentFilterTop).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.torrentCreateButton)
        )
      ),
      div({ class: "tribe-details" }, torrentSide, torrentMain)
    )
  );
};
