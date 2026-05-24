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
  label,
  option
} = require("../server/node_modules/hyperaxe");

const { template, i18n, userLink, renderSpreadButton, renderEcoTax, renderLifespanChip } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl")
const { renderMapLocationVisitLabel } = require("./maps_view");
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

const renderTranscodeButton = (audioObj) =>
  audioObj.isBcs
    ? form(
        { method: "GET", action: `/melody/transcode/${encodeURIComponent(audioObj.key)}`, class: "audio-transcode-form" },
        button({ type: "submit", class: "filter-btn" }, i18n.audioTranscodeButton || "TRANSCODE")
      )
    : null;

const renderAudioPlayer = (audioObj, opts = {}) =>
  audioObj?.url
    ? div(
        { class: "audio-container" },
        audioHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(audioObj.url)}`, preload: "metadata" }),
        opts.skipTranscode ? null : renderTranscodeButton(audioObj)
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
  const list = safeArr(comments).filter(c => {
    const t = c && c.value && c.value.content && c.value.content.text;
    return t && String(t).trim();
  });
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
        { method: "POST", action: `/audios/${encodeURIComponent(audioId)}/comments`, class: "comment-form", enctype: "multipart/form-data" },
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

const renderAudioList = exports.renderAudioList = (audios, filter, params = {}) => {
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
          audioObj.lifetime ? div({ class: "card-chips-row" }, renderLifespanChip(audioObj.lifetime, i18n)) : null,
          renderAudioPlayer(audioObj),
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
          div({ class: "card-spread-left" }, renderSpreadButton(audioObj.key, (params.spreadMap && params.spreadMap.get(audioObj.key)) || params.spreads)),
          renderMapLocationVisitLabel(audioObj.mapUrl),
          br(),
          (() => {
            const createdTs = audioObj.createdAt ? new Date(audioObj.createdAt).getTime() : NaN;
            const updatedTs = audioObj.updatedAt ? new Date(audioObj.updatedAt).getTime() : NaN;
            const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

            return p(
              { class: "card-footer" },
              span({ class: "date-link" }, `${moment(audioObj.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
              userLink(audioObj.author),
              showUpdated
                ? span(
                    { class: "votations-comment-date" },
                    ` | ${i18n.audioUpdatedAt}: ${moment(audioObj.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
                  )
                : null
            );
          })()
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
      span(i18n.audioTitleLabel),
      br(),
      input({ type: "text", name: "title", placeholder: i18n.audioTitlePlaceholder, value: audioToEdit?.title || "" }),
      br(),
      span(i18n.audioDescriptionLabel),
      br(),
      textarea({ name: "description", placeholder: i18n.audioDescriptionPlaceholder, rows: "4" }, audioToEdit?.description || ""),
      br(),
      span(i18n.mapLocationTitle || "Map Location"),
      br(),
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: audioToEdit?.mapUrl || "" }),
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
      div({ class: "tags-header" },
        h2(title),
        p(i18n.audioDescription)
      ),
      (() => {
        const { renderReachChip } = require('./clearnet_view');
        const isClearnet = !!(params.viewerPrefs && params.viewerPrefs.clearnetAudios);
        return div({ class: "shop-title-row" }, renderReachChip(isClearnet, i18n));
      })(),
      br(),
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
          button({ type: "submit", name: "filter", value: "bcs", class: filter === "bcs" ? "filter-btn active" : "filter-btn" }, i18n.audioFilterBcs || "BCS"),
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
  const isAuthor = String(audioObj.author) === String(userId);
  const { renderReachChip } = require('./clearnet_view');
  const isClearnet = !!(params.authorPrefs && params.authorPrefs.clearnetAudios);

  const chips = [
    renderLifespanChip(audioObj.lifetime, i18n),
    audioObj.sizeBytes ? renderEcoTax(audioObj.sizeBytes, audioObj.key) : null
  ].filter(Boolean);

  const ownerActions = renderAudioOwnerActions(filter, audioObj, { q, sort });
  const sideActions = [];
  sideActions.push(renderAudioFavoriteToggle(audioObj, returnTo));
  if (audioObj.author && String(audioObj.author) !== String(userId)) {
    sideActions.push(form(
      { method: "GET", action: "/pm" },
      input({ type: "hidden", name: "recipients", value: audioObj.author }),
      button({ type: "submit", class: "filter-btn" }, i18n.audioMessageAuthorButton)
    ));
  }
  if (audioObj.isBcs) {
    sideActions.push(form(
      { method: "GET", action: `/melody/transcode/${encodeURIComponent(audioObj.key)}` },
      button({ type: "submit", class: "filter-btn" }, i18n.audioTranscodeButton || "TRANSCODE")
    ));
  }
  for (const a of ownerActions) sideActions.push(a);

  const tagsNode = renderTags(audioObj.tags);

  const audioSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      title ? h2({ class: "tribe-card-title" }, title) : null,
      renderReachChip(isClearnet, i18n)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    safeText(audioObj.description)
      ? p({ class: "tribe-side-description" }, ...renderUrl(audioObj.description))
      : null,
    tagsNode,
    div({ class: "card-spread-centered" }, renderSpreadButton(audioObj.key, params.spreads)),
    renderMapLocationVisitLabel(audioObj.mapUrl)
  );

  const audioMain = div({ class: "tribe-main" },
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null,
    renderAudioPlayer(audioObj),
    div({ class: "voting-buttons" },
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
    ),
    (() => {
      const createdTs = audioObj.createdAt ? new Date(audioObj.createdAt).getTime() : NaN;
      const updatedTs = audioObj.updatedAt ? new Date(audioObj.updatedAt).getTime() : NaN;
      const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

      return p(
        { class: "card-footer" },
        span({ class: "date-link" }, `${moment(audioObj.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
        userLink(audioObj.author),
        showUpdated
          ? span(
              { class: "votations-comment-date" },
              ` | ${i18n.audioUpdatedAt}: ${moment(audioObj.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
            )
          : null
      );
    })(),
    renderAudioCommentsSection(audioObj.key, comments, returnTo)
  );

  return template(
    i18n.audioTitle,
    section(
      div({ class: "tags-header" },
        h2(i18n.audioAllSectionTitle || i18n.audioTitle),
        p(i18n.audioDescription)
      ),
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
          button({ type: "submit", name: "filter", value: "bcs", class: filter === "bcs" ? "filter-btn active" : "filter-btn" }, i18n.audioFilterBcs || "BCS"),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            i18n.audioFilterFavorites
          ),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.audioCreateButton)
        )
      ),
      div({ class: "tribe-details" }, audioSide, audioMain)
    )
  );
};

const { renderCompositionSequence } = require("./melody_view");

exports.audioTranscodeDetailView = async ({ audio, decoded = false, stegoPayload = null, availableIds = null, itemSize = null }) => {
  const title = i18n.audioTranscodeDetailTitle || "Transcode";
  const composition = Array.isArray(audio.bcsComposition) ? audio.bcsComposition : [];
  const hasStego = decoded && stegoPayload && (stegoPayload.id || stegoPayload.ts || stegoPayload.msg);
  const stegoDate = hasStego && Number.isFinite(stegoPayload.ts) ? moment(stegoPayload.ts).format("YYYY/MM/DD HH:mm:ss") : null;

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(i18n.audioTranscodeDetailDescription || "Decode the embedded payload and the original blockchain composition map.")
      ),
      div({ class: "filters" },
        form({ method: "GET", action: "/melody", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "filter", value: "all" }),
          button({ type: "submit", class: "filter-btn" }, i18n.audioBackToBcs || "Back to BCS")
        )
      ),
      div({ class: "bookmark-item card" },
        audio.title ? h2(audio.title) : null,
        renderAudioPlayer(audio, { skipTranscode: true }),
        p({ class: "transcode-meta card-footer" },
          userLink(audio.author),
          span({ class: "melody-meta-sep" }, " · "),
          span({ class: "card-value" }, moment(audio.createdAt).format("YYYY/MM/DD HH:mm:ss")),
          itemSize ? span({ class: "melody-meta-sep" }, " · ") : null,
          itemSize ? renderEcoTax(itemSize, audio.key) : null
        ),
        safeText(audio.description) ? p({ class: "melody-bcs-desc" }, audio.description) : null,
        renderTags(audio.tags),
        br(),
        form({ method: "POST", action: `/melody/transcode/${encodeURIComponent(audio.key)}`, class: "audio-transcode-run-form" },
          button({ type: "submit", class: "filter-btn" }, i18n.audioTranscodeButton || "TRANSCODE")
        ),
        br(),
        decoded
          ? div({ class: "transcode-result" },
              hasStego
                ? [
                    div({ class: "transcode-stego-field" },
                      span({ class: "card-label" }, (i18n.audioTranscodeStegoTimestamp || "Generated at") + ": "),
                      span({ class: "card-value" }, stegoDate || (i18n.audioTranscodeStegoUnknown || "—"))
                    ),
                    div({ class: "transcode-stego-field" },
                      span({ class: "card-label" }, (i18n.audioTranscodeStegoOasisId || "By") + ": "),
                      stegoPayload.id ? userLink(stegoPayload.id) : span({ class: "card-value" }, i18n.audioTranscodeStegoUnknown || "—")
                    ),
                    div({ class: "transcode-stego-field transcode-stego-msg" },
                      span({ class: "card-label" }, (i18n.audioTranscodeStegoMessage || "TEXT") + ":"),
                      br(),
                      stegoPayload.msg
                        ? p({ class: "transcode-stego-text" }, stegoPayload.msg)
                        : span({ class: "card-value" }, i18n.audioTranscodeStegoEmpty || "(none)")
                    )
                  ]
                : p({ class: "empty" }, i18n.audioTranscodeStegoNotFound || "No steganographic payload could be decoded from this audio."),
              composition.length
                ? renderCompositionSequence(composition, availableIds)
                : p({ class: "empty" }, i18n.audioTranscodeCompositionEmpty || "This audio does not include a stored blockchain composition.")
            )
          : null
      )
    )
  );
};

exports.audiosTranscodeView = exports.audioTranscodeDetailView;

