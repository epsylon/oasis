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
  audio: audioHyperaxe,
  span,
  textarea,
  select,
  option
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
  return `/audios?${parts.join("&")}`;
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

const renderAudioFavoriteToggle = (audioObj, returnTo = "") =>
  form(
    {
      method: "POST",
      action: audioObj.isFavorite
        ? `/audios/favorites/remove/${encodeURIComponent(audioObj.key)}`
        : `/audios/favorites/add/${encodeURIComponent(audioObj.key)}`
    },
    returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
    button(
      { type: "submit", class: "filter-btn" },
      audioObj.isFavorite ? i18n.audioRemoveFavoriteButton : i18n.audioAddFavoriteButton
    )
  );

const renderAudioPlayer = (audioObj) =>
  audioObj?.url
    ? div(
        { class: "audio-container", style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" },
        audioHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(audioObj.url)}`, preload: "metadata" })
      )
    : p(i18n.audioNoFile);

const renderAudioOwnerActions = (filter, audioObj, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  const isAuthor = String(audioObj.author) === String(userId);
  const hasOpinions = Object.keys(audioObj.opinions || {}).length > 0;

  if (!isAuthor) return [];

  const items = [];
  if (!hasOpinions) {
    items.push(
      form(
        { method: "GET", action: `/audios/edit/${encodeURIComponent(audioObj.key)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ class: "update-btn", type: "submit" }, i18n.audioUpdateButton)
      )
    );
  }
  items.push(
    form(
      { method: "POST", action: `/audios/delete/${encodeURIComponent(audioObj.key)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.audioDeleteButton)
    )
  );

  return items;
};

const renderAudioCommentsSection = (audioId, comments = [], returnTo = null) => {
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
        { method: "POST", action: `/audios/${encodeURIComponent(audioId)}/comments`, class: "comment-form" },
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

const renderAudioList = (audios, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);

  return audios.length
    ? audios.map((audioObj) => {
        const commentCount = typeof audioObj.commentCount === "number" ? audioObj.commentCount : 0;
        const title = safeText(audioObj.title);
        const ownerActions = renderAudioOwnerActions(filter, audioObj, params);

        return div(
          { class: "tags-header audio-card" },
          div(
            { class: "bookmark-topbar" },
            div(
              { class: "bookmark-topbar-left" },
              form(
                { method: "GET", action: `/audios/${encodeURIComponent(audioObj.key)}` },
                input({ type: "hidden", name: "returnTo", value: returnTo }),
                input({ type: "hidden", name: "filter", value: filter || "all" }),
                params.q ? input({ type: "hidden", name: "q", value: params.q }) : null,
                params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
                button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
              ),
              renderAudioFavoriteToggle(audioObj, returnTo),
              audioObj.author && String(audioObj.author) !== String(userId)
                ? form(
                    { method: "GET", action: "/pm" },
                    input({ type: "hidden", name: "recipients", value: audioObj.author }),
                    button({ type: "submit", class: "filter-btn" }, i18n.audioMessageAuthorButton)
                  )
                : null
            ),
            ownerActions.length ? div({ class: "bookmark-actions" }, ...ownerActions) : null
          ),
          title ? h2(title) : null,
          renderAudioPlayer(audioObj),
          safeText(audioObj.description) ? p(...renderUrl(audioObj.description)) : null,
          renderTags(audioObj.tags),
          div(
            { class: "card-comments-summary" },
            span({ class: "card-label" }, i18n.voteCommentsLabel + ":"),
            span({ class: "card-value" }, String(commentCount)),
            br(),
            br(),
            form(
              { method: "GET", action: `/audios/${encodeURIComponent(audioObj.key)}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              input({ type: "hidden", name: "filter", value: filter || "all" }),
              params.q ? input({ type: "hidden", name: "q", value: params.q }) : null,
              params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
              button({ type: "submit", class: "filter-btn" }, i18n.voteCommentsForumButton)
            )
          ),
          br(),
          (() => {
            const createdTs = audioObj.createdAt ? new Date(audioObj.createdAt).getTime() : NaN;
            const updatedTs = audioObj.updatedAt ? new Date(audioObj.updatedAt).getTime() : NaN;
            const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

            return p(
              { class: "card-footer" },
              span({ class: "date-link" }, `${moment(audioObj.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
              a({ href: `/author/${encodeURIComponent(audioObj.author)}`, class: "user-link" }, `${audioObj.author}`),
              showUpdated
                ? span(
                    { class: "votations-comment-date" },
                    ` | ${i18n.audioUpdatedAt}: ${moment(audioObj.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
                  )
                : null
            );
          })(),
          div(
            { class: "voting-buttons" },
            opinionCategories.map((category) =>
              form(
                { method: "POST", action: `/audios/opinions/${encodeURIComponent(audioObj.key)}/${category}` },
                input({ type: "hidden", name: "returnTo", value: returnTo }),
                button(
                  { class: "vote-btn" },
                  `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${
                    audioObj.opinions?.[category] || 0
                  }]`
                )
              )
            )
          )
        );
      })
    : p(params.q ? i18n.audioNoMatch : i18n.noAudios);
};

const renderAudioForm = (filter, audioId, audioToEdit, params = {}) => {
  const returnTo = safeText(params.returnTo) || buildReturnTo("all", params);
  return div(
    { class: "div-center audio-form" },
    form(
      {
        action: filter === "edit" ? `/audios/update/${encodeURIComponent(audioId)}` : "/audios/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      span(i18n.audioFileLabel),
      br(),
      input({ type: "file", name: "audio", required: filter !== "edit" }),
      br(),
      br(),
      span(i18n.audioTagsLabel),
      br(),
      input({
        type: "text",
        name: "tags",
        placeholder: i18n.audioTagsPlaceholder,
        value: safeArr(audioToEdit?.tags).join(", ")
      }),
      br(),
      br(),
      span(i18n.audioTitleLabel),
      br(),
      input({ type: "text", name: "title", placeholder: i18n.audioTitlePlaceholder, value: audioToEdit?.title || "" }),
      br(),
      br(),
      span(i18n.audioDescriptionLabel),
      br(),
      textarea({ name: "description", placeholder: i18n.audioDescriptionPlaceholder, rows: "4" }, audioToEdit?.description || ""),
      br(),
      br(),
      button({ type: "submit" }, filter === "edit" ? i18n.audioUpdateButton : i18n.audioCreateButton)
    )
  );
};

exports.audioView = async (audios, filter = "all", audioId = null, params = {}) => {
  const title =
    filter === "mine"
      ? i18n.audioMineSectionTitle
      : filter === "create"
        ? i18n.audioCreateSectionTitle
        : filter === "edit"
          ? i18n.audioUpdateSectionTitle
          : filter === "recent"
            ? i18n.audioRecentSectionTitle
            : filter === "top"
              ? i18n.audioTopSectionTitle
              : filter === "favorites"
                ? i18n.audioFavoritesSectionTitle
                : i18n.audioAllSectionTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(audios);
  const audioToEdit = audioId ? list.find((a) => a.key === audioId) : null;

  return template(
    title,
    section(
      div({ class: "tags-header" }, h2(title), p(i18n.audioDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/audios", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.audioFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.audioFilterMine),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.audioFilterRecent),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, i18n.audioFilterTop),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            i18n.audioFilterFavorites
          ),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.audioCreateButton)
        )
      )
    ),
    section(
      filter === "create" || filter === "edit"
        ? renderAudioForm(filter, audioId, audioToEdit, { ...params, filter })
        : section(
            div(
              { class: "audios-search" },
              form(
                { method: "GET", action: "/audios", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter }),
                input({
                  type: "text",
                  name: "q",
                  value: q,
                  placeholder: i18n.audioSearchPlaceholder,
                  class: "filter-box__input"
                }),
                div(
                  { class: "filter-box__controls" },
                  select(
                    { name: "sort", class: "filter-box__select" },
                    option({ value: "recent", selected: sort === "recent" }, i18n.audioSortRecent),
                    option({ value: "oldest", selected: sort === "oldest" }, i18n.audioSortOldest),
                    option({ value: "top", selected: sort === "top" }, i18n.audioSortTop)
                  ),
                  button({ type: "submit", class: "filter-box__button" }, i18n.audioSearchButton)
                )
              )
            ),
            div({ class: "audios-list" }, renderAudioList(list, filter, { q, sort }))
          )
    )
  );
};

exports.singleAudioView = async (audioObj, filter = "all", comments = [], params = {}) => {
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q, sort });

  const title = safeText(audioObj.title);
  const ownerActions = renderAudioOwnerActions(filter, audioObj, { q, sort });

  const topbarLeft =
    audioObj.author && String(audioObj.author) !== String(userId)
      ? form(
          { method: "GET", action: "/pm" },
          input({ type: "hidden", name: "recipients", value: audioObj.author }),
          button({ type: "submit", class: "filter-btn" }, i18n.audioMessageAuthorButton)
        )
      : null;

  const topbar = div(
    { class: "bookmark-topbar" },
    div({ class: "bookmark-actions" }, renderAudioFavoriteToggle(audioObj, returnTo), ...ownerActions)
  );

  return template(
    i18n.audioTitle,
    section(
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/audios", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.audioFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.audioFilterMine),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.audioFilterRecent),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, i18n.audioFilterTop),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            i18n.audioFilterFavorites
          ),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.audioCreateButton)
        )
      ),
      div(
        { class: "bookmark-item card" },
        topbar,
        title ? h2(title) : null,
        renderAudioPlayer(audioObj),
        safeText(audioObj.description) ? p(...renderUrl(audioObj.description)) : null,
        renderTags(audioObj.tags),
        br(),
        (() => {
          const createdTs = audioObj.createdAt ? new Date(audioObj.createdAt).getTime() : NaN;
          const updatedTs = audioObj.updatedAt ? new Date(audioObj.updatedAt).getTime() : NaN;
          const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

          return p(
            { class: "card-footer" },
            span({ class: "date-link" }, `${moment(audioObj.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
            a({ href: `/author/${encodeURIComponent(audioObj.author)}`, class: "user-link" }, `${audioObj.author}`),
            showUpdated
              ? span(
                  { class: "votations-comment-date" },
                  ` | ${i18n.audioUpdatedAt}: ${moment(audioObj.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
                )
              : null
          );
        })(),
        div(
          { class: "voting-buttons" },
          opinionCategories.map((category) =>
            form(
              { method: "POST", action: `/audios/opinions/${encodeURIComponent(audioObj.key)}/${category}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              button(
                { class: "vote-btn" },
                `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${
                  audioObj.opinions?.[category] || 0
                }]`
              )
            )
          )
        )
      ),
      div({ id: "comments" }, renderAudioCommentsSection(audioObj.key, comments, returnTo))
    )
  );
};

