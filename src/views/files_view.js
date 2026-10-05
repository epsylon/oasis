const { form, button, div, h2, h3, p, section, input, br, a, span, textarea, select, label, option, table, tr, th, td, progress, strong } = require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view");

const { clearnetItemHref, template, i18n, renderOpinionsVoting, renderEngagement, userLink, renderSpreadButton, renderEcoTax, renderLifespanChip , renderSpreadEditWarning, renderContentActions, renderModuleStats, moduleIsEmpty, renderFileDownloads } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderStyledText } = require("../backend/renderStyledText");

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
  return `/files?${parts.join("&")}`;
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

const renderFileOwnerActions = (filter, fileObj, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  const isAuthor = String(fileObj.author) === String(userId);
  const hasOpinions = Object.keys(fileObj.opinions || {}).length > 0;

  if (!isAuthor) return [];

  const items = [];
  if (!hasOpinions) {
    items.push(
      form(
        { method: "GET", action: `/files/edit/${encodeURIComponent(fileObj.key)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ class: "update-btn", type: "submit" }, i18n.fileUpdateButton)
      )
    );
  }
  items.push(
    form(
      { method: "POST", action: `/files/delete/${encodeURIComponent(fileObj.key)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.fileDeleteButton)
    )
  );

  return items;
};

const renderFileCommentsSection = (fileId, comments = [], returnTo = null) => {
  return renderSharedCommentsSection({
    action: `/files/${encodeURIComponent(fileId)}/comments`,
    comments: comments,
    returnTo: returnTo
  });
};

const blobSha256Hex = (blobId) => {
  const m = /^&([A-Za-z0-9+/=]+)\.sha256$/.exec(String(blobId || ""));
  if (!m) return "";
  try { return Buffer.from(m[1], "base64").toString("hex"); } catch (_) { return ""; }
};

const formatSize = (bytes) => {
  const n = Number(bytes) || 0;
  if (n === 0) return "—";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
};

const spreadInfoOf = (t, spreadMap) => (spreadMap instanceof Map && spreadMap.get(t.key)) || null;
const renderFileSeeds = (t, spreadMap) => {
  const info = spreadInfoOf(t, spreadMap);
  return String(info && typeof info.count === "number" ? info.count : (info && Array.isArray(info.voters) ? info.voters.length : 0));
};
const renderFileSpread = (t, spreadMap) => String(t.author) === String(userId) ? "" : renderSpreadButton(t.key, spreadInfoOf(t, spreadMap), i18n.seedAction, false);

const renderFileTable = exports.renderFileTable = (files, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);

  if (!files.length) return p(params.q ? i18n.fileNoMatch : i18n.noFiles);

  return table(
    { border: "1", class: "file-table" },
    tr(
      th(i18n.createdAt || "DATE"),
      th(i18n.authorLabel || "AUTHOR"),
      th(i18n.fileTitleLabel || "TITLE"),
      th(i18n.fileSizeLabel || "SIZE"),
      th(i18n.seedsLabel),
      th(i18n.seedAction),
      th(""),
      th("")
    ),
    files.map((t) =>
      tr(
        td(moment(t.createdAt).format("YYYY/MM/DD HH:mm")),
        td(userLink(t.author)),
        td(t.title || ""),
        td(formatSize(t.size)),
        td({ class: "torrent-spread-cell" }, renderFileSeeds(t, params.spreadMap)),
        td({ class: "torrent-spread-cell" }, renderFileSpread(t, params.spreadMap)),
        td(
          form(
            { method: "GET", action: `/files/${encodeURIComponent(t.key)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            input({ type: "hidden", name: "filter", value: filter || "all" }),
            params.q ? input({ type: "hidden", name: "q", value: params.q }) : null,
            params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
            button({ type: "submit", class: "filter-btn" }, i18n.fileDetailsButton)
          )
        ),
        td(
          t.url && t.url.startsWith("&")
            ? renderFileDownloads(t.key, t.torrentUrl, t.fileName || t.title)
            : ""
        )
      )
    )
  );
};

const renderFileForm = (filter, fileId, fileToEdit, params = {}) => {
  const returnTo = safeText(params.returnTo) || buildReturnTo("all", params);
  const tribeId = safeText(params.tribeId || "");
  return div(
    { class: "div-center audio-form" },
    params.spreadWarning || null,
    form(
      {
        action: filter === "edit" ? `/files/update/${encodeURIComponent(fileId)}` : "/files/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
      span(i18n.fileFileLabel),
      br(),
      input({ type: "file", name: "file", required: filter !== "edit" }),
      br(),
      br(),
      span(i18n.fileTitleLabel),
      br(),
      input({ type: "text", name: "title", maxlength: "100", placeholder: i18n.fileTitlePlaceholder, value: fileToEdit?.title || "", required: true }),
      br(),
      span(i18n.fileDescriptionLabel),
      br(),
      textarea({ maxlength: "5000", name: "description", placeholder: i18n.fileDescriptionPlaceholder, rows: "4" }, fileToEdit?.description || ""),
      br(),
      span(i18n.fileTagsLabel),
      br(),
      input({
        type: "text",
        name: "tags",
        placeholder: i18n.fileTagsPlaceholder,
        value: safeArr(fileToEdit?.tags).join(", ")
      }),
      br(),
      br(),
      button({ type: "submit" }, filter === "edit" ? i18n.fileUpdateButton : i18n.fileCreateButton)
    )
  );
};

const mediaChipFor = (filter, censusM) => (mode) => {
  if (mode === filter) return true;
  if (!Array.isArray(censusM)) return true;
  if (mode === "top") return censusM.length > 0;
  if (mode === "mine") return censusM.some((x) => String(x.author) === String(userId));
  if (mode === "recent") return censusM.length > 0;
  if (mode === "favorites") return censusM.some((x) => x.isFavorite);
  if (mode === "bcs") return censusM.some((x) => String(x.title || "").toUpperCase().startsWith("BCS-"));
  return true;
};

exports.filesView = async (files, filter = "all", fileId = null, params = {}) => {
  if (filter === "edit") params = { ...params, spreadWarning: await renderSpreadEditWarning(fileId) };
  const title = i18n.filesTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(files);
  const emptyMod = moduleIsEmpty(list, filter, "all", q);
  const mediaChip = mediaChipFor(filter, Array.isArray(params.censusList) ? params.censusList : list);
  const fileToEdit = fileId ? list.find((t) => t.key === fileId) : null;

  return template(
    title,
    section(
      div({ class: "tags-header module-header-line" },
        h2(title),
        p(i18n.filesDescription)
      ,
        (() => {
          const { renderReachChip } = require('./clearnet_view');
          const isClearnet = !!(params.viewerPrefs && params.viewerPrefs.clearnetFiles);
          return renderReachChip(isClearnet, i18n, `/c/inhabitant/${encodeURIComponent(userId)}`);
        })()
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/files", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          ...(emptyMod ? [] : [
          ...(mediaChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.fileFilterRecent).toUpperCase())] : []),
          ...(mediaChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.fileFilterMine).toUpperCase())] : []),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.fileFilterAll).toUpperCase()),
          ...(mediaChip("favorites") ? [button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.fileFilterFavorites).toUpperCase()
          )] : []),

          ...(mediaChip("top") ? [button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.fileFilterTop).toUpperCase())] : []),
          ]),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.fileCreateButton)
        )
      )
    ),
    section(
      filter === "create" || filter === "edit"
        ? renderFileForm(filter, fileId, fileToEdit, { ...params, filter })
        : section(
            emptyMod ? null : div(
              { class: "audios-search activity-filter-chips activity-toolbar-row" },
                renderModuleStats(list.length),
              form(
                { method: "GET", action: "/files", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter }),
                input({
                  type: "text",
                  name: "q",
                  value: q,
                  placeholder: i18n.fileSearchPlaceholder,
                  class: "filter-box__input"
                }),
                div(
                  { class: "filter-box__controls" },
                  select(
                    { name: "sort", class: "filter-box__select" },
                    option({ value: "recent", ...(sort === "recent" ? { selected: true } : {})}, i18n.fileSortRecent),
                    option({ value: "oldest", ...(sort === "oldest" ? { selected: true } : {})}, i18n.fileSortOldest),
                    option({ value: "top", ...(sort === "top" ? { selected: true } : {})}, i18n.fileSortTop)
                  ),
                  button({ type: "submit", class: "filter-box__button" }, i18n.fileSearchButton)
                )
              )
            ),
            div({ class: "audios-list" }, renderFileTable(list, filter, { q, sort, spreadMap: params.spreadMap }))
          )
    )
  );
};

exports.singleFileView = async (fileObj, filter = "all", comments = [], params = {}) => {
  const mediaChip = mediaChipFor(filter, Array.isArray(params.censusList) ? params.censusList : null);
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q, sort });

  const title = safeText(fileObj.title);
  const { renderReachChip, renderEncryptedChip, renderTransportChip } = require('./clearnet_view');
  const isClearnet = !!(params.authorPrefs && params.authorPrefs.clearnetFiles);

  const chips = [
    renderLifespanChip(fileObj.lifetime, i18n),
    fileObj.sizeBytes ? renderEcoTax(fileObj.sizeBytes, fileObj.key) : null
  ].filter(Boolean);

  const ownerActions = renderFileOwnerActions(filter, fileObj, { q, sort });
  const sideActions = [];
  for (const a of ownerActions) sideActions.push(a);

  const tagsNode = renderTags(fileObj.tags);

  const detailActions = div({ class: "card-header activity-card-header" },
    renderContentActions(fileObj.key, null, {
      spreadTitle: i18n.seedAction,
      author: fileObj.author,
      favKind: 'files',
      torrentFrom: { blobId: fileObj.url, name: fileObj.fileName || fileObj.title },
      isFavorite: fileObj.isFavorite,
      spread: params.spreads || null,
      returnTo,
      reportTitle: fileObj.title
    })
  );

  const fileSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      title ? h2({ class: "tribe-card-title" }, title) : null,
      fileObj.tribeId && fileObj.cipher ? renderEncryptedChip(i18n) : renderTransportChip(i18n),
      fileObj.tribeId ? null : renderReachChip(isClearnet, i18n, clearnetItemHref('files', fileObj.title, fileObj.key))
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    safeText(fileObj.description)
      ? p({ class: "tribe-side-description" }, ...renderStyledText(fileObj.description))
      : null,
    tagsNode,
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null
  );

  const fileMain = div({ class: "tribe-main" },
    detailActions,
    fileObj.url && fileObj.url.startsWith("&")
      ? div({ class: "torrent-download" },
          div({ class: "torrent-oasis torrent-detail-section" },
            h3({ class: "torrent-section-title" }, i18n.torrentOriginalSection || "Original"),
            table({ class: "tribe-info-table torrent-file-info" },
              tr(td({ class: "tribe-info-label" }, i18n.fileShareFileLabel), td({ class: "tribe-info-value" }, fileObj.fileName || fileObj.title || "download")),
              tr(td({ class: "tribe-info-label" }, i18n.fileSizeLabel), td({ class: "tribe-info-value" }, formatSize(fileObj.size))),
              fileObj.mime ? tr(td({ class: "tribe-info-label" }, i18n.fileTypeLabel), td({ class: "tribe-info-value" }, fileObj.mime)) : null,
              fileObj.cipher
                ? tr(td({ class: "tribe-info-label" }, i18n.encryptedChipLabel || "E2E"), td({ class: "tribe-info-value" }, "AES-256-GCM"))
                : tr(td({ class: "tribe-info-label" }, "SHA-256"), td({ class: "tribe-info-value" }, span({ class: "bank-address-code" }, blobSha256Hex(fileObj.url))))
            ),
            a({ href: `/files/${encodeURIComponent(fileObj.key)}/get`, class: "filter-btn" }, `\u2B07 ${i18n.torrentOasisButton || "OASIS"}`)
          ),
          fileObj.torrentUrl
            ? div({ class: "torrent-detail-section" },
                h3({ class: "torrent-section-title" }, "Torrent"),
                table({ class: "tribe-info-table torrent-file-info" },
                  tr(td({ class: "tribe-info-label" }, i18n.fileShareFileLabel), td({ class: "tribe-info-value" }, `${String(fileObj.fileName || fileObj.title || "download").replace(/\.torrent$/i, "")}.torrent`)),
                  tr(td({ class: "tribe-info-label" }, "SHA-256"), td({ class: "tribe-info-value" }, span({ class: "bank-address-code" }, blobSha256Hex(fileObj.torrentUrl))))
                ),
                a({ href: `/blob/${encodeURIComponent(fileObj.torrentUrl)}?name=${encodeURIComponent(`${String(fileObj.fileName || fileObj.title || "download").replace(/\.torrent$/i, "")}.torrent`)}`, class: "filter-btn" }, `\u2B07 ${i18n.torrentExternalButton || "EXTERNAL"}`)
              )
            : null
        )
      : p(i18n.fileNoFile),
    (() => {
      const createdTs = fileObj.createdAt ? new Date(fileObj.createdAt).getTime() : NaN;
      const updatedTs = fileObj.updatedAt ? new Date(fileObj.updatedAt).getTime() : NaN;
      const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

      return p(
        { class: "card-footer" },
        span({ class: "date-link" }, `${moment(fileObj.createdAt).format("YYYY/MM/DD HH:mm")}`),
        userLink(fileObj.author),
        showUpdated
          ? span(
              { class: "votations-comment-date" },
              ` | ${i18n.fileUpdatedAt}: ${moment(fileObj.updatedAt).format("YYYY/MM/DD HH:mm")}`
            )
          : null
      );
    })(),
    renderEngagement(fileObj.key,
      renderOpinionsVoting('/files/opinions', fileObj.key, fileObj.opinions, returnTo, fileObj.opinions_inhabitants),
      renderFileCommentsSection(fileObj.key, comments, returnTo)
    )
  );

  return template(
    i18n.filesTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.fileAllSectionTitle || i18n.filesTitle),
        p(i18n.fileDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/files", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          ...(mediaChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.fileFilterRecent).toUpperCase())] : []),
          ...(mediaChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.fileFilterMine).toUpperCase())] : []),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.fileFilterAll).toUpperCase()),
          ...(mediaChip("favorites") ? [button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.fileFilterFavorites).toUpperCase()
          )] : []),

          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.fileFilterTop).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.fileCreateButton)
        )
      ),
      div({ class: "tribe-details" }, fileSide, fileMain)
    )
  );
};
