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
const { template, i18n, renderOpinionsVoting, renderEngagement, userLink, renderSpreadButton, renderEcoTax, renderLifespanChip, renderContentActions , renderSpreadEditWarning } = require("./main_views");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl")
const { renderMapLocationVisitLabel } = require("./maps_view");

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
  items.push(
    form(
      { method: "POST", action: `/videos/delete/${encodeURIComponent(videoObj.key)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.videoDeleteButton)
    )
  );

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
        return div(
          { class: "trending-card video-card" + (isOwn ? " own-content" : "") },
          div(
            { class: "card-header activity-card-header" },
            span(),
            renderContentActions(videoObj.key, `/videos/${encodeURIComponent(videoObj.key)}`, { spread: (params.spreadMap && params.spreadMap.get(videoObj.key)) || params.spreads || null, author: videoObj.author, favKind: 'videos', isFavorite: videoObj.isFavorite, reportTitle: videoObj.title })
          ),
          div(
            { class: "card-section video-card-body" },
            title ? h2(title) : null,
            videoObj.lifetime ? div({ class: "card-chips-row" }, renderLifespanChip(videoObj.lifetime, i18n)) : null,
            renderVideoPlayer(videoObj),
            renderEngagement(videoObj.key,
              renderOpinionsVoting('/videos/opinions', videoObj.key, videoObj.opinions, returnTo, videoObj.opinions_inhabitants),
              renderCommentsLink({ href: `/videos/${encodeURIComponent(videoObj.key)}`, count: commentCount })
            ),
            renderMapLocationVisitLabel(videoObj.mapUrl),
            br(),
            (() => {
              const createdTs = videoObj.createdAt ? new Date(videoObj.createdAt).getTime() : NaN;
              const updatedTs = videoObj.updatedAt ? new Date(videoObj.updatedAt).getTime() : NaN;
              const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

              return p(
                { class: "card-footer" },
                span({ class: "date-link" }, `${moment(videoObj.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
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
      textarea({ name: "description", placeholder: i18n.videoDescriptionPlaceholder, rows: "4" }, videoToEdit?.description || ""),
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
      br(),
      button({ type: "submit" }, filter === "edit" ? i18n.videoUpdateButton : i18n.videoCreateButton)
    )
  );
};

exports.videoView = async (videos, filter = "all", videoId = null, params = {}) => {
  if (filter === "edit") params = { ...params, spreadWarning: await renderSpreadEditWarning(videoId) };
  const title = i18n.videoTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(videos);
  const videoToEdit = videoId ? list.find((v) => v.key === videoId) : null;

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(i18n.videoDescription)
      ),
      (() => {
        const { renderReachChip } = require('./clearnet_view');
        const isClearnet = !!(params.viewerPrefs && params.viewerPrefs.clearnetVideos);
        return div({ class: "shop-title-row" }, renderReachChip(isClearnet, i18n));
      })(),
      br(),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/videos", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterAll).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterMine).toUpperCase()),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterRecent).toUpperCase()),          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.videoFilterFavorites).toUpperCase()
          ),

          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterTop).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.videoCreateButton)
        )
      )
    ),
    section(
      filter === "create" || filter === "edit"
        ? renderVideoForm(filter, videoId, videoToEdit, { ...params, filter })
        : section(
            div(
              { class: "videos-search" },
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
            div({ class: "videos-list" }, renderVideoList(list, filter, { q, sort }))
          )
    )
  );
};

exports.singleVideoView = async (videoObj, filter = "all", comments = [], params = {}) => {
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q, sort });

  const title = safeText(videoObj.title);
  const { renderReachChip } = require('./clearnet_view');
  const isClearnet = !!(params.authorPrefs && params.authorPrefs.clearnetVideos);

  const chips = [
    renderLifespanChip(videoObj.lifetime, i18n),
    videoObj.sizeBytes ? renderEcoTax(videoObj.sizeBytes, videoObj.key) : null
  ].filter(Boolean);

  const ownerActions = renderVideoOwnerActions(filter, videoObj, { q, sort });
  const sideActions = [];
  for (const a of ownerActions) sideActions.push(a);

  const tagsNode = renderTags(videoObj.tags);

  const detailActions = div({ class: "card-header activity-card-header" },
    renderContentActions(videoObj.key, null, {
      author: videoObj.author,
      favKind: 'videos',
      isFavorite: videoObj.isFavorite,
      spread: params.spreads || null,
      returnTo,
      reportTitle: videoObj.title
    })
  );

  const videoSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      title ? h2({ class: "tribe-card-title" }, title) : null,
      renderReachChip(isClearnet, i18n)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    safeText(videoObj.description)
      ? p({ class: "tribe-side-description" }, ...renderUrl(videoObj.description))
      : null,
    tagsNode,
    renderMapLocationVisitLabel(videoObj.mapUrl),
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
        span({ class: "date-link" }, `${moment(videoObj.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
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
      div({ class: "tags-header" },
        h2(i18n.videoAllSectionTitle || i18n.videoTitle),
        p(i18n.videoDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/videos", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterAll).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterMine).toUpperCase()),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterRecent).toUpperCase()),          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.videoFilterFavorites).toUpperCase()
          ),

          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.videoFilterTop).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.videoCreateButton)
        )
      ),
      div({ class: "tribe-details" }, videoSide, videoMain)
    )
  );
};

