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
const { renderCommentsSection: renderSharedCommentsSection, renderCommentsLink } = require("./comments_view");

const { renderLicenseChip, renderLicenseSelect, renderClearnetSelector, renderClearnetSwitch, renderTribeOriginChip, renderScopeChip } = require('./clearnet_view');
const { renderCardMetaRow, renderOpinionsPill, renderCommentsPill, renderShareButton, clearnetItemHref, template, i18n, renderLayoutSwitch, renderLayoutItems, renderOpinionsVoting, renderEngagement, userLink, renderEcoTax, renderLifespanChip, renderCardTop, renderCardByline, renderSpreadEditWarning, renderModuleStats, moduleIsEmpty, contentDeleteAction, paged, blobUrlOf, renderMediaLockNote, renderEditedChip, renderDetailShare, hasRelation, renderRelationFilters, renderPlayerFollow, renderSearchButton } = require("./main_views");
const { renderDownloadButton } = require("./gallery_view");
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

const renderTranscodeButton = (audioObj) =>
  audioObj.isBcs
    ? form(
        { method: "GET", action: `/melody/transcode/${encodeURIComponent(audioObj.key)}`, class: "audio-transcode-form" },
        button({ type: "submit", class: "filter-btn" }, i18n.audioTranscodeButton || "TRANSCODE")
      )
    : null;

const audioFollow = (audioObj) => audioObj?.url ? renderPlayerFollow(audioObj.url, audioObj.title, `/audios/${encodeURIComponent(audioObj.key)}`) : null;

const renderAudioPlayer = (audioObj, opts = {}) =>
  audioObj?.url
    ? div(
        { class: "audio-container card-content" },
        audioHyperaxe({ controls: true, preload: "metadata", src: blobUrlOf(audioObj.url) }),
        opts.skipTranscode ? null : renderTranscodeButton(audioObj),
        audioFollow(audioObj)
      )
    : p(i18n.audioNoFile);

const renderAudioCommentsSection = (audioId, comments = [], returnTo = null) => {
  return renderSharedCommentsSection({
    action: `/audios/${encodeURIComponent(audioId)}/comments`,
    comments: comments,
    returnTo: returnTo
  });
};

const renderAudioList = exports.renderAudioList = (audios, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);

  return audios.length
    ? audios.map((audioObj) => {
        const commentCount = typeof audioObj.commentCount === "number" ? audioObj.commentCount : 0;
        const title = safeText(audioObj.title);
        const href = `/audios/${encodeURIComponent(audioObj.key)}`;

        const isOwn = audioObj.author && String(audioObj.author) === String(userId);
        const byline = {
          author: audioObj.author,
          date: audioObj.createdAt,
          chips: [
            audioObj.tribeOrigin ? renderTribeOriginChip(audioObj.tribeOrigin) : null, renderScopeChip(audioObj, i18n, audioObj.clearnet === true, clearnetItemHref('audios', audioObj.title, audioObj.key)),
            renderLicenseChip(audioObj.license),
            ...(typeof params.titleChips === "function" ? params.titleChips(audioObj) : []),
            renderLifespanChip(audioObj.lifetime, i18n)
          ],
          bylineExtra: [renderEditedChip(audioObj.key, audioObj.rootId, audioObj.updatedAt)]
        };
        const header = typeof params.headerActions === "function"
          ? div({ class: "card-header activity-card-header card-top" }, renderCardByline(byline), params.headerActions(audioObj))
          : audioObj.tribeOrigin
            ? renderCardTop(audioObj.key, audioObj.tribeOrigin.href, { ...byline, spread: (params.spreadMap && params.spreadMap.get(audioObj.key)) || null, reportTitle: audioObj.title })
            : renderCardTop(audioObj.key, href, { ...byline, spread: (params.spreadMap && params.spreadMap.get(audioObj.key)) || params.spreads || null, favKind: 'audios', torrentFrom: { blobId: audioObj.url, name: audioObj.title }, isFavorite: audioObj.isFavorite, reportTitle: audioObj.title, deleteAction: isOwn ? contentDeleteAction('audio', audioObj.key) : undefined, returnTo });
        const titleHref = typeof params.headerActions === "function" ? null : audioObj.tribeOrigin ? audioObj.tribeOrigin.href : href;
        const engagement = typeof params.engagement === "function" ? params.engagement(audioObj) : titleHref && !audioObj.tribeOrigin ? renderCardMetaRow(renderOpinionsPill([audioObj.key, audioObj.rootId], titleHref), renderCommentsPill([audioObj.key, audioObj.rootId], titleHref), renderShareButton(audioObj.key, titleHref, audioObj.title || "")) : null;
        return div(
          { class: "trending-card audio-card" + (isOwn ? " own-content" : "") },
          header,
          div(
            { class: "card-section audio-card-body" },
            title ? div({ class: "shop-title-row" }, h2(titleHref ? a({ href: titleHref, class: "card-title-link" }, title) : title)) : null,
            renderAudioPlayer(audioObj),
            ...(typeof params.bodyExtra === "function" ? params.bodyExtra(audioObj) : []),
            renderMapLocationVisitLabel(audioObj.mapUrl),
            engagement
          )
        );
      })
    : p(params.q ? i18n.audioNoMatch : i18n.noAudios);
};

const renderAudioForm = (filter, audioId, audioToEdit, params = {}) => {
  const returnTo = safeText(params.returnTo) || buildReturnTo("all", params);
  return div(
    { class: "div-center audio-form" },
    params.spreadWarning || null,
    form(
      {
        action: filter === "edit" ? `/audios/update/${encodeURIComponent(audioId)}` : "/audios/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      span(i18n.audioFileLabel),
      br(),
      (filter === "edit" && renderMediaLockNote(audioToEdit)) || input({ type: "file", name: "audio", accept: "audio/*", required: filter !== "edit" }),
      br(),
      br(),
      span(i18n.audioTitleLabel),
      br(),
      input({ type: "text", name: "title", maxlength: "100", placeholder: i18n.audioTitlePlaceholder, value: audioToEdit?.title || "" }),
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
      ...renderLicenseSelect(audioToEdit?.license, i18n),
      br(),
      renderClearnetSelector(filter === "edit" ? !!audioToEdit?.clearnet : false, i18n),
      br(),
      button({ type: "submit" }, filter === "edit" ? i18n.save : i18n.audioCreateButton)
    )
  );
};

const mediaChipFor = (filter, censusM) => (mode) => {
  if (mode === filter) return true;
  if (!Array.isArray(censusM)) return true;
  if (mode === "top") return censusM.some((x) => !x.tribeOrigin);
  if (mode === "mine") return censusM.some((x) => String(x.author) === String(userId));
  if (mode === "supported" || mode === "replicated") return hasRelation(mode, censusM);
  if (mode === "recent") return censusM.length > 0;
  if (mode === "favorites") return censusM.length > 0;
  if (mode === "bcs") return censusM.some((x) => !x.tribeOrigin && String(x.title || "").toUpperCase().startsWith("BCS-"));
  return true;
};

exports.audioView = async (audios, filter = "all", audioId = null, params = {}) => {
  if (filter === "edit") params = { ...params, spreadWarning: await renderSpreadEditWarning(audioId) };
  const title = i18n.audioTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(audios);
  const emptyMod = moduleIsEmpty(list, filter, "all", q);
  const mediaChip = mediaChipFor(filter, Array.isArray(params.censusList) ? params.censusList : list);
  const audioToEdit = audioId ? list.find((a) => a.key === audioId) : null;
  const isForm = filter === "create" || filter === "edit";
  const pageAudios = isForm ? [] : paged(list);
  const audioCards = () => div({ class: "audios-list" }, renderAudioList(pageAudios, filter, { q, sort, spreadMap: params.spreadMap }));

  return template(
    title,
    section(
      div({ class: "tags-header module-header-line" },
        h2(title),
        p(i18n.audioDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/audios", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "sort", value: sort }),
          ...(emptyMod ? [] : [
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.audioFilterAll).toUpperCase()),
          ...(mediaChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.audioFilterRecent).toUpperCase())] : []),
          ...(mediaChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.audioFilterMine).toUpperCase())] : []),
          ...renderRelationFilters(filter, mediaChip),
          ...(mediaChip("favorites") ? [button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.audioFilterFavorites).toUpperCase()
          )] : []),
          ...(mediaChip("top") ? [button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.audioFilterTop).toUpperCase())] : []),
          ...(mediaChip("bcs") ? [button({ type: "submit", name: "filter", value: "bcs", class: filter === "bcs" ? "filter-btn active" : "filter-btn" }, i18n.audioFilterBcs || "BCS")] : []),
          ]),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.audioCreateButton)
        )
      )
    ),
    section(
      isForm
        ? renderAudioForm(filter, audioId, audioToEdit, { ...params, filter })
        : section(
            emptyMod ? null : div(
              { class: "audios-search activity-filter-chips activity-toolbar-row" },
                isForm || emptyMod ? null : renderLayoutSwitch("filters"),
                renderModuleStats(list.length),
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
                    option({ value: "recent", ...(sort === "recent" ? { selected: true } : {})}, i18n.audioSortRecent),
                    option({ value: "oldest", ...(sort === "oldest" ? { selected: true } : {})}, i18n.audioSortOldest),
                    option({ value: "top", ...(sort === "top" ? { selected: true } : {})}, i18n.audioSortTop)
                  ),
                  renderSearchButton(i18n.audioSearchButton)
                )
              )
            ),
            pageAudios.length ? renderLayoutItems(audioCards) : audioCards()
          )
    )
  );
};

exports.singleAudioView = async (audioObj, filter = "all", comments = [], params = {}) => {
  const mediaChip = mediaChipFor(filter, Array.isArray(params.censusList) ? params.censusList : null);
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q, sort });

  const title = safeText(audioObj.title);
  const href = `/audios/${encodeURIComponent(audioObj.key)}`;
  const isAuthor = String(audioObj.author) === String(userId);
  const isClearnet = !!audioObj.clearnet;

  const chips = [
    renderLifespanChip(audioObj.lifetime, i18n),
    audioObj.sizeBytes ? renderEcoTax(audioObj.sizeBytes, audioObj.key) : null
  ].filter(Boolean);

  const sideActions = [];
  if (audioObj.isBcs) {
    sideActions.push(form(
      { method: "GET", action: `/melody/transcode/${encodeURIComponent(audioObj.key)}`, class: "audio-transcode-form" },
      button({ type: "submit", class: "filter-btn" }, i18n.audioTranscodeButton || "TRANSCODE")
    ));
  }

  const tagsNode = renderTags(audioObj.tags);

  const audioSide = div({ class: "tribe-side" },
    renderCardTop(audioObj.key, href, { arrow: false,
      author: audioObj.author,
      date: audioObj.createdAt,
      chips: [
        renderScopeChip(audioObj, i18n, isClearnet, clearnetItemHref('audios', audioObj.title, audioObj.key)),
        renderLicenseChip(audioObj.license),
        ...chips
      ],
      bylineExtra: [renderEditedChip(audioObj.key, audioObj.rootId, audioObj.updatedAt)],
      favKind: 'audios', torrentFrom: { blobId: audioObj.url, name: audioObj.title },
      isFavorite: audioObj.isFavorite,
      spread: params.spreads || null,
      returnTo,
      reportTitle: audioObj.title,
      editAction: isAuthor ? `/audios/edit/${encodeURIComponent(audioObj.key)}?returnTo=${encodeURIComponent(buildReturnTo(filter, { q, sort }))}` : undefined,
      deleteAction: isAuthor ? contentDeleteAction('audio', audioObj.key) : undefined
    }),
    div({ class: "shop-title-row" },
      title ? h2({ class: "tribe-card-title" }, title) : null,
      isAuthor ? renderClearnetSwitch('audios', audioObj.rootId || audioObj.key, isClearnet) : null
    ),
    renderDetailShare(audioObj.key, href, audioObj.title, null, null, null, audioObj.author),
    tagsNode,
    renderMapEmbed(params.mapData, audioObj.mapUrl),
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null
  );

  const audioMain = div({ class: "tribe-main" },
    safeText(audioObj.description)
      ? div({ class: "job-section" }, h2({ class: "job-section-title" }, i18n.description), p({ class: "tribe-side-description" }, ...renderStyledText(audioObj.description)))
      : null,
    renderAudioPlayer(audioObj),
    audioObj?.url ? div({ class: "media-actions" }, renderDownloadButton(blobUrlOf(audioObj.url), audioObj.title || "")) : null,
    renderEngagement(audioObj.key,
      renderOpinionsVoting('/audios/opinions', audioObj.key, audioObj.opinions, returnTo, audioObj.opinions_inhabitants),
      renderAudioCommentsSection(audioObj.key, comments, returnTo))
  );

  return template(
    i18n.audioTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.audioAllSectionTitle || i18n.audioTitle),
        p(i18n.audioDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/audios", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.audioFilterAll).toUpperCase()),
          ...(mediaChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.audioFilterRecent).toUpperCase())] : []),
          ...(mediaChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.audioFilterMine).toUpperCase())] : []),
          ...renderRelationFilters(filter, mediaChip),
          ...(mediaChip("favorites") ? [button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.audioFilterFavorites).toUpperCase()
          )] : []),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.audioFilterTop).toUpperCase()),
          ...(mediaChip("bcs") ? [button({ type: "submit", name: "filter", value: "bcs", class: filter === "bcs" ? "filter-btn active" : "filter-btn" }, i18n.audioFilterBcs || "BCS")] : []),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.audioCreateButton)
        )
      ),
      div({ class: "tribe-details" }, audioSide, audioMain)
    )
  );
};

const { renderTranscodeResult } = require("./melody_view");

exports.audioTranscodeDetailView = async ({ audio, decoded = false, stegoPayload = null, availableIds = null, itemSize = null }) => {
  const title = i18n.audioTranscodeDetailTitle || "Transcode";
  const composition = Array.isArray(audio.bcsComposition) ? audio.bcsComposition : [];

  return template(
    title,
    section(
      div({ class: "tags-header module-header-line" },
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
        renderCardTop(audio.key, `/audios/${encodeURIComponent(audio.key)}`, { author: audio.author, date: audio.createdAt, chips: [renderScopeChip(audio, i18n, audio.clearnet === true, clearnetItemHref('audios', audio.title, audio.key)), itemSize ? renderEcoTax(itemSize, audio.key) : null], reportTitle: audio.title }),
        audio.title ? h2(audio.title) : null,
        renderAudioPlayer(audio, { skipTranscode: true }),
        renderDetailShare(audio.key, `/audios/${encodeURIComponent(audio.key)}`, audio.title, null, null, null, audio.author),
        safeText(audio.description) ? p({ class: "melody-bcs-desc" }, audio.description) : null,
        renderTags(audio.tags),
        form({ method: "POST", action: `/melody/transcode/${encodeURIComponent(audio.key)}`, class: "audio-transcode-run-form audio-transcode-form" },
          button({ type: "submit", class: "create-button" }, i18n.audioTranscodeButton || "TRANSCODE")
        ),
        br(),
        decoded
          ? renderTranscodeResult({ stegoPayload, composition, availableIds, notFound: i18n.audioTranscodeStegoNotFound || "No steganographic payload could be decoded from this audio.", empty: i18n.audioTranscodeCompositionEmpty || "This audio does not include a stored blockchain composition." })
          : null
      )
    )
  );
};


