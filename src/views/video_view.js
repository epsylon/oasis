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
  select,
  option
} = require("../server/node_modules/hyperaxe");

const moment = require("../server/node_modules/moment");
const { template, i18n } = require("./main_views");
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
  return `/videos?${parts.join("&")}`;
};

const renderPMButton = (recipient, className = "filter-btn") => {
  const r = safeText(recipient);
  if (!r) return null;
  if (String(r) === String(userId)) return null;

  return form(
    { method: "GET", action: "/pm" },
    input({ type: "hidden", name: "recipients", value: r }),
    button({ type: "submit", class: className }, i18n.privateMessage)
  );
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

const renderVideoFavoriteToggle = (videoObj, returnTo = "") =>
  form(
    {
      method: "POST",
      action: videoObj.isFavorite
        ? `/videos/favorites/remove/${encodeURIComponent(videoObj.key)}`
        : `/videos/favorites/add/${encodeURIComponent(videoObj.key)}`
    },
    returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
    button(
      { type: "submit", class: "filter-btn" },
      videoObj.isFavorite ? i18n.videoRemoveFavoriteButton : i18n.videoAddFavoriteButton
    )
  );

const renderVideoPlayer = (videoObj) =>
  videoObj?.url
    ? div(
        { class: "video-container", style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" },
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
        { method: "POST", action: `/videos/${encodeURIComponent(videoId)}/comments`, class: "comment-form" },
        returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
        textarea({
          id: "comment-text",
          name: "text",
          required: true,
          rows: 4,
          class: "comment-textarea",
          placeholder: i18n.voteNewCommentPlaceholder
        }),
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

const renderVideoList = (videos, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);

  return videos.length
    ? videos.map((videoObj) => {
        const commentCount = typeof videoObj.commentCount === "number" ? videoObj.commentCount : 0;
        const title = safeText(videoObj.title);
        const ownerActions = renderVideoOwnerActions(filter, videoObj, params);

        return div(
          { class: "tags-header video-card" },
          div(
            { class: "bookmark-topbar" },
            div(
              { class: "bookmark-topbar-left" },
              form(
                { method: "GET", action: `/videos/${encodeURIComponent(videoObj.key)}` },
                input({ type: "hidden", name: "returnTo", value: returnTo }),
                input({ type: "hidden", name: "filter", value: filter || "all" }),
                params.q ? input({ type: "hidden", name: "q", value: params.q }) : null,
                params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
                button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
              ),
              renderVideoFavoriteToggle(videoObj, returnTo),
              renderPMButton(videoObj.author)
            ),
            ownerActions.length ? div({ class: "bookmark-actions" }, ...ownerActions) : null
          ),
          title ? h2(title) : null,
          renderVideoPlayer(videoObj),
          safeText(videoObj.description) ? p(...renderUrl(videoObj.description)) : null,
          renderTags(videoObj.tags),
          div(
            { class: "card-comments-summary" },
            span({ class: "card-label" }, i18n.voteCommentsLabel + ":"),
            span({ class: "card-value" }, String(commentCount)),
            br(),
            br(),
            form(
              { method: "GET", action: `/videos/${encodeURIComponent(videoObj.key)}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              input({ type: "hidden", name: "filter", value: filter || "all" }),
              params.q ? input({ type: "hidden", name: "q", value: params.q }) : null,
              params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
              button({ type: "submit", class: "filter-btn" }, i18n.voteCommentsForumButton)
            )
          ),
          br(),
          (() => {
            const createdTs = videoObj.createdAt ? new Date(videoObj.createdAt).getTime() : NaN;
            const updatedTs = videoObj.updatedAt ? new Date(videoObj.updatedAt).getTime() : NaN;
            const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

            return p(
              { class: "card-footer" },
              span({ class: "date-link" }, `${moment(videoObj.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
              a({ href: `/author/${encodeURIComponent(videoObj.author)}`, class: "user-link" }, `${videoObj.author}`),
              showUpdated
                ? span(
                    { class: "votations-comment-date" },
                    ` | ${i18n.videoUpdatedAt}: ${moment(videoObj.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
                  )
                : null
            );
          })(),
          div(
            { class: "voting-buttons" },
            opinionCategories.map((category) =>
              form(
                { method: "POST", action: `/videos/opinions/${encodeURIComponent(videoObj.key)}/${category}` },
                input({ type: "hidden", name: "returnTo", value: returnTo }),
                button(
                  { class: "vote-btn" },
                  `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${
                    videoObj.opinions?.[category] || 0
                  }]`
                )
              )
            )
          )
        );
      })
    : p(params.q ? i18n.videoNoMatch : i18n.noVideos);
};

const renderVideoForm = (filter, videoId, videoToEdit, params = {}) => {
  const returnTo = safeText(params.returnTo) || buildReturnTo("all", params);

  return div(
    { class: "div-center video-form" },
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
      span(i18n.videoTitleLabel),
      br(),
      input({ type: "text", name: "title", placeholder: i18n.videoTitlePlaceholder, value: videoToEdit?.title || "" }),
      br(),
      br(),
      span(i18n.videoDescriptionLabel),
      br(),
      textarea({ name: "description", placeholder: i18n.videoDescriptionPlaceholder, rows: "4" }, videoToEdit?.description || ""),
      br(),
      br(),
      button({ type: "submit" }, filter === "edit" ? i18n.videoUpdateButton : i18n.videoCreateButton)
    )
  );
};

exports.videoView = async (videos, filter = "all", videoId = null, params = {}) => {
  const title =
    filter === "mine"
      ? i18n.videoMineSectionTitle
      : filter === "create"
        ? i18n.videoCreateSectionTitle
        : filter === "edit"
          ? i18n.videoUpdateSectionTitle
          : filter === "recent"
            ? i18n.videoRecentSectionTitle
            : filter === "top"
              ? i18n.videoTopSectionTitle
              : filter === "favorites"
                ? i18n.videoFavoritesSectionTitle
                : i18n.videoAllSectionTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(videos);
  const videoToEdit = videoId ? list.find((v) => v.key === videoId) : null;

  return template(
    title,
    section(
      div({ class: "tags-header" }, h2(title), p(i18n.videoDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/videos", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.videoFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.videoFilterMine),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.videoFilterRecent),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, i18n.videoFilterTop),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            i18n.videoFilterFavorites
          ),
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
                    option({ value: "recent", selected: sort === "recent" }, i18n.videoSortRecent),
                    option({ value: "oldest", selected: sort === "oldest" }, i18n.videoSortOldest),
                    option({ value: "top", selected: sort === "top" }, i18n.videoSortTop)
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
  const ownerActions = renderVideoOwnerActions(filter, videoObj, { q, sort });

  const topbar = div(
    { class: "bookmark-topbar" },
    div(
      { class: "bookmark-topbar-left" },
      renderVideoFavoriteToggle(videoObj, returnTo),
      renderPMButton(videoObj.author)
    ),
    ownerActions.length ? div({ class: "bookmark-actions" }, ...ownerActions) : null
  );

  return template(
    i18n.videoTitle,
    section(
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/videos", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.videoFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.videoFilterMine),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.videoFilterRecent),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, i18n.videoFilterTop),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            i18n.videoFilterFavorites
          ),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.videoCreateButton)
        )
      ),
      div(
        { class: "bookmark-item card" },
        topbar,
        title ? h2(title) : null,
        renderVideoPlayer(videoObj),
        safeText(videoObj.description) ? p(...renderUrl(videoObj.description)) : null,
        renderTags(videoObj.tags),
        br(),
        (() => {
          const createdTs = videoObj.createdAt ? new Date(videoObj.createdAt).getTime() : NaN;
          const updatedTs = videoObj.updatedAt ? new Date(videoObj.updatedAt).getTime() : NaN;
          const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

          return p(
            { class: "card-footer" },
            span({ class: "date-link" }, `${moment(videoObj.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
            a({ href: `/author/${encodeURIComponent(videoObj.author)}`, class: "user-link" }, `${videoObj.author}`),
            showUpdated
              ? span(
                  { class: "votations-comment-date" },
                  ` | ${i18n.videoUpdatedAt}: ${moment(videoObj.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
                )
              : null
          );
        })(),
        div(
          { class: "voting-buttons" },
          opinionCategories.map((category) =>
            form(
              { method: "POST", action: `/videos/opinions/${encodeURIComponent(videoObj.key)}/${category}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              button(
                { class: "vote-btn" },
                `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${
                  videoObj.opinions?.[category] || 0
                }]`
              )
            )
          )
        )
      ),
      div({ id: "comments" }, renderVideoCommentsSection(videoObj.key, comments, returnTo))
    )
  );
};

