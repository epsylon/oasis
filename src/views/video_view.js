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
  video: videoHyperaxe,
  span,
  textarea,
  label,
  select,
  option
} = require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection, renderCommentsLink } = require("./comments_view");

const moment = require("../server/node_modules/moment");
const { renderLicenseChip, renderLicenseSelect, renderReachChip, renderClearnetSelector, renderClearnetSwitch, renderTribeOriginChip } = require('./clearnet_view');
const { clearnetItemHref, template, i18n, renderOpinionsVoting, renderEngagement, userLink, renderSpreadButton, renderEcoTax, renderLifespanChip, renderContentActions , renderSpreadEditWarning, renderModuleStats, moduleIsEmpty, contentDeleteAction } = require("./main_views");
const { config } = require("../server/SSB_server.js");
const { renderStyledText } = require("../backend/renderStyledText")
const { renderMapLocationVisitLabel, renderMapEmbed } = require("./maps_view");

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
  return `/videos?${parts.join("&")}`;
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

const renderVideoPlayer = (videoObj) =>
  videoObj?.url
    ? div(
        { class: "video-container video-container-row" },
        videoHyperaxe({
          controls: true,
          src: `/blob/${encodeURIComponent(videoObj.url)}`,
          preload: "metadata"
        })
      )
    : p(i18n.videoNoFile);

const renderVideoOwnerActions = (filter, videoObj, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  const isAuthor = String(videoObj.author) === String(userId);
  const hasOpinions = Object.keys(videoObj.opinions || {}).length > 0;

  if (!isAuthor) return [];

  const items = [];
  if (!hasOpinions) {
    items.push(
      form(
        { method: "GET", action: `/videos/edit/${encodeURIComponent(videoObj.key)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ class: "update-btn", type: "submit" }, i18n.videoUpdateButton)
      )
    );
  }

  return items;
};

const renderVideoCommentsSection = (videoId, comments = [], returnTo = null) => {
  return renderSharedCommentsSection({
    action: `/videos/${encodeURIComponent(videoId)}/comments`,
    comments: comments,
    returnTo: returnTo
  });
};

const renderVideoList = exports.renderVideoList = (videos, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);

  return videos.length
    ? videos.map((videoObj) => {
        const commentCount = typeof videoObj.commentCount === "number" ? videoObj.commentCount : 0;
        const title = safeText(videoObj.title);

        const isOwn = videoObj.author && String(videoObj.author) === String(userId);
        const headerActions = typeof params.headerActions === "function"
          ? params.headerActions(videoObj)
          : videoObj.tribeOrigin
            ? renderContentActions(null, videoObj.tribeOrigin.href)
            : renderContentActions(videoObj.key, `/videos/${encodeURIComponent(videoObj.key)}`, { spread: (params.spreadMap && params.spreadMap.get(videoObj.key)) || params.spreads || null, author: videoObj.author, favKind: 'videos', torrentFrom: { blobId: videoObj.url, name: videoObj.title }, isFavorite: videoObj.isFavorite, reportTitle: videoObj.title, returnTo, deleteAction: isOwn ? contentDeleteAction('video', videoObj.key) : undefined });
        const engagement = typeof params.engagement === "function"
          ? params.engagement(videoObj)
          : videoObj.tribeOrigin ? null : renderEngagement(videoObj.key,
            renderOpinionsVoting('/videos/opinions', videoObj.key, videoObj.opinions, returnTo, videoObj.opinions_inhabitants),
            renderCommentsLink({ href: `/videos/${encodeURIComponent(videoObj.key)}`, count: commentCount })
          );
        return div(
          { class: "trending-card video-card" + (isOwn ? " own-content" : "") },
          div(
            { class: "card-header activity-card-header" },
            span(),
            headerActions
          ),
          div(
            { class: "card-section video-card-body" },
            div({ class: "shop-title-row" }, title ? h2(title) : null, videoObj.tribeOrigin ? renderTribeOriginChip(videoObj.tribeOrigin) : videoObj.clearnet === true ? renderReachChip(true, i18n, clearnetItemHref('videos', videoObj.title, videoObj.key)) : null, renderLicenseChip(videoObj.license), ...(typeof params.titleChips === "function" ? params.titleChips(videoObj) : [])),
            videoObj.lifetime ? div({ class: "card-chips-row" }, renderLifespanChip(videoObj.lifetime, i18n)) : null,
            renderVideoPlayer(videoObj),
            ...(typeof params.bodyExtra === "function" ? params.bodyExtra(videoObj) : []),
            engagement,
            renderMapLocationVisitLabel(videoObj.mapUrl),
            br(),
            (() => {
              const createdTs = videoObj.createdAt ? new Date(videoObj.createdAt).getTime() : NaN;
              const updatedTs = videoObj.updatedAt ? new Date(videoObj.updatedAt).getTime() : NaN;
              const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

              return p(
                { class: "card-footer" },
                span({ class: "date-link" }, `${moment(videoObj.createdAt).format("YYYY/MM/DD HH:mm")}`),
                userLink(videoObj.author),
                showUpdated
                  ? span(
                      { class: "votations-comment-date" },
                      ` | ${i18n.videoUpdatedAt}: ${moment(videoObj.updatedAt).format("YYYY/MM/DD HH:mm")}`
                    )
                  : null
              );
            })()
          )
        );
      })
    : p(params.q ? i18n.videoNoMatch : i18n.noVideos);
};

const renderVideoForm = (filter, videoId, videoToEdit, params = {}) => {
  const returnTo = safeText(params.returnTo) || buildReturnTo("all", params);

  return div(
    { class: "div-center video-form" },
    params.spreadWarning || null,
    form(
      {
        action: filter === "edit" ? `/videos/update/${encodeURIComponent(videoId)}` : "/videos/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      span(i18n.videoFileLabel),
      br(),
      input({ type: "file", name: "video", required: filter !== "edit" }),
      br(),
      br(),
      span(i18n.videoTitleLabel),
      br(),
      input({ type: "text", name: "title", maxlength: "100", placeholder: i18n.videoTitlePlaceholder, value: videoToEdit?.title || "" }),
      br(),
      span(i18n.videoDescriptionLabel),
      br(),
      textarea({ maxlength: "5000", name: "description", placeholder: i18n.videoDescriptionPlaceholder, rows: "4" }, videoToEdit?.description || ""),
      br(),
      span(i18n.mapLocationTitle || "Map Location"),
      br(),
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: videoToEdit?.mapUrl || "" }),
      br(),
      span(i18n.videoTagsLabel),
      br(),
      input({
        type: "text",
        name: "tags",
        placeholder: i18n.videoTagsPlaceholder,
        value: safeArr(videoToEdit?.tags).join(", ")
      }),
      br(),
      ...renderLicenseSelect(videoToEdit?.license, i18n),
      br(),
      renderClearnetSelector(filter === "edit" ? !!videoToEdit?.clearnet : false, i18n),
      br(),
      button({ type: "submit" }, filter === "edit" ? i18n.videoUpdateButton : i18n.videoCreateButton)
    )
  );
};

const mediaChipFor = (filter, censusM) => (mode) => {
  if (mode === filter) return true;
  if (!Array.isArray(censusM)) return true;
  if (mode === "top") return censusM.some((x) => !x.tribeOrigin);
  if (mode === "mine") return censusM.some((x) => String(x.author) === String(userId));
  if (mode === "recent") return censusM.length > 0;
  if (mode === "favorites") return censusM.some((x) => x.isFavorite);
  if (mode === "bcs") return censusM.some((x) => String(x.title || "").toUpperCase().startsWith("BCS-"));
  return true;
};

exports.videoView = async (videos, filter = "all", videoId = null, params = {}) => {
  if (filter === "edit") params = { ...params, spreadWarning: await renderSpreadEditWarning(videoId) };
  const title = i18n.videoTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(videos);
  const emptyMod = moduleIsEmpty(list, filter, "all", q);
  const mediaChip = mediaChipFor(filter, Array.isArray(params.censusList) ? params.censusList : list);
  const videoToEdit = videoId ? list.find((v) => v.key === videoId) : null;

  return template(
    title,
    section(
      div({ class: "tags-header module-header-line" },
        h2(title),
        p(i18n.videoDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/videos", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          ...(emptyMod ? [] : [
          ...(mediaChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterRecent).toUpperCase())] : []),
          ...(mediaChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterMine).toUpperCase())] : []),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterAll).toUpperCase()),
          ...(mediaChip("favorites") ? [button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.videoFilterFavorites).toUpperCase()
          )] : []),

          ...(mediaChip("top") ? [button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterTop).toUpperCase())] : []),
          ]),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.videoCreateButton)
        )
      )
    ),
    section(
      filter === "create" || filter === "edit"
        ? renderVideoForm(filter, videoId, videoToEdit, { ...params, filter })
        : section(
            emptyMod ? null : div(
              { class: "videos-search activity-filter-chips activity-toolbar-row" },
                renderModuleStats(list.length),
              form(
                { method: "GET", action: "/videos", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter }),
                input({
                  type: "text",
                  name: "q",
                  value: q,
                  placeholder: i18n.videoSearchPlaceholder,
                  class: "filter-box__input"
                }),
                div(
                  { class: "filter-box__controls" },
                  select(
                    { name: "sort", class: "filter-box__select" },
                    option({ value: "recent", ...(sort === "recent" ? { selected: true } : {})}, i18n.videoSortRecent),
                    option({ value: "oldest", ...(sort === "oldest" ? { selected: true } : {})}, i18n.videoSortOldest),
                    option({ value: "top", ...(sort === "top" ? { selected: true } : {})}, i18n.videoSortTop)
                  ),
                  button({ type: "submit", class: "filter-box__button" }, i18n.videoSearchButton)
                )
              )
            ),
            div({ class: "videos-list" }, renderVideoList(list, filter, { q, sort, spreadMap: params.spreadMap }))
          )
    )
  );
};

exports.singleVideoView = async (videoObj, filter = "all", comments = [], params = {}) => {
  const mediaChip = mediaChipFor(filter, Array.isArray(params.censusList) ? params.censusList : null);
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q, sort });

  const title = safeText(videoObj.title);
  const isAuthor = String(videoObj.author) === String(userId);
  const isClearnet = !!videoObj.clearnet;

  const chips = [
    renderLifespanChip(videoObj.lifetime, i18n),
    videoObj.sizeBytes ? renderEcoTax(videoObj.sizeBytes, videoObj.key) : null
  ].filter(Boolean);

  const ownerActions = renderVideoOwnerActions(filter, videoObj, { q, sort });
  const sideActions = [];
  for (const a of ownerActions) sideActions.push(a);

  const tagsNode = renderTags(videoObj.tags);

  const detailActions = div({ class: "card-header activity-card-header" },
    renderContentActions(videoObj.key, `/videos/${encodeURIComponent(videoObj.key)}`, {
      author: videoObj.author,
      favKind: 'videos', torrentFrom: { blobId: videoObj.url, name: videoObj.title },
      isFavorite: videoObj.isFavorite,
      spread: params.spreads || null,
      returnTo,
      reportTitle: videoObj.title,
      deleteAction: String(videoObj.author) === String(userId) ? contentDeleteAction('video', videoObj.key) : undefined
    })
  );

  const videoSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      title ? h2({ class: "tribe-card-title" }, title) : null,
      renderReachChip(isClearnet, i18n, isClearnet ? clearnetItemHref('videos', videoObj.title, videoObj.key) : null),
      isAuthor ? renderClearnetSwitch('videos', videoObj.rootId || videoObj.key, isClearnet) : null,
      renderLicenseChip(videoObj.license)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    safeText(videoObj.description)
      ? p({ class: "tribe-side-description" }, ...renderStyledText(videoObj.description))
      : null,
    tagsNode,
    renderMapEmbed(params.mapData, videoObj.mapUrl),
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null
  );

  const videoMain = div({ class: "tribe-main" },
    detailActions,
    renderVideoPlayer(videoObj),
    (() => {
      const createdTs = videoObj.createdAt ? new Date(videoObj.createdAt).getTime() : NaN;
      const updatedTs = videoObj.updatedAt ? new Date(videoObj.updatedAt).getTime() : NaN;
      const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

      return p(
        { class: "card-footer" },
        span({ class: "date-link" }, `${moment(videoObj.createdAt).format("YYYY/MM/DD HH:mm")}`),
        userLink(videoObj.author),
        showUpdated
          ? span(
              { class: "votations-comment-date" },
              ` | ${i18n.videoUpdatedAt}: ${moment(videoObj.updatedAt).format("YYYY/MM/DD HH:mm")}`
            )
          : null
      );
    })(),
    renderEngagement(videoObj.key,
      renderOpinionsVoting('/videos/opinions', videoObj.key, videoObj.opinions, returnTo, videoObj.opinions_inhabitants),
      renderVideoCommentsSection(videoObj.key, comments, returnTo)
    )
  );

  return template(
    i18n.videoTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.videoAllSectionTitle || i18n.videoTitle),
        p(i18n.videoDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/videos", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          ...(mediaChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterRecent).toUpperCase())] : []),
          ...(mediaChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterMine).toUpperCase())] : []),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterAll).toUpperCase()),          ...(mediaChip("favorites") ? [button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.videoFilterFavorites).toUpperCase()
          )] : []),

          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterTop).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.videoCreateButton)
        )
      ),
      div({ class: "tribe-details" }, videoSide, videoMain)
    )
  );
};

