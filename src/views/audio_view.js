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

const { renderLicenseChip, renderLicenseSelect, renderReachChip, renderClearnetSelector, renderClearnetSwitch, renderTribeOriginChip } = require('./clearnet_view');
const { clearnetItemHref, template, i18n, renderOpinionsVoting, renderEngagement, userLink, renderEcoTax, renderLifespanChip, renderCardTop, renderCardByline, renderSpreadEditWarning, renderModuleStats, moduleIsEmpty, contentDeleteAction, paged, blobUrlOf, renderMediaLockNote, renderEditedChip, renderDetailShare } = require("./main_views");
const { renderDownloadButton } = require("./gallery_view");
const moment = require("../server/node_modules/moment");
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

const renderAudioPlayer = (audioObj, opts = {}) =>
  audioObj?.url
    ? div(
        { class: "audio-container" },
        audioHyperaxe({ controls: true, src: blobUrlOf(audioObj.url), preload: "metadata" }),
        opts.skipTranscode ? null : renderTranscodeButton(audioObj)
      )
    : p(i18n.audioNoFile);

const renderAudioOwnerActions = (filter, audioObj, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  const isAuthor = String(audioObj.author) === String(userId);

  if (!isAuthor) return [];

  const items = [];
  items.push(
    form(
      { method: "GET", action: `/audios/edit/${encodeURIComponent(audioObj.key)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "update-btn", type: "submit" }, i18n.audioUpdateButton)
    )
  );

  return items;
};

const renderAudioCommentsSection = (audioId, comments = [], returnTo = null) => {
  return renderSharedCommentsSection({
    action: `/audios/${encodeURIComponent(audioId)}/comments`,
    comments: comments,
    returnTo: returnTo
  });
};

const renderAudioUpdated = (audioObj) => {
  const createdTs = audioObj.createdAt ? new Date(audioObj.createdAt).getTime() : NaN;
  const updatedTs = audioObj.updatedAt ? new Date(audioObj.updatedAt).getTime() : NaN;
  const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);
  return showUpdated
    ? span({ class: "votations-comment-date" }, `${i18n.audioUpdatedAt}: ${moment(audioObj.updatedAt).format("YYYY/MM/DD HH:mm")}`)
    : null;
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
            audioObj.tribeOrigin ? renderTribeOriginChip(audioObj.tribeOrigin) : audioObj.clearnet === true ? renderReachChip(true, i18n, clearnetItemHref('audios', audioObj.title, audioObj.key)) : null,
            renderLicenseChip(audioObj.license),
            ...(typeof params.titleChips === "function" ? params.titleChips(audioObj) : []),
            renderLifespanChip(audioObj.lifetime, i18n)
          ],
          bylineExtra: [renderAudioUpdated(audioObj)]
        };
        const header = typeof params.headerActions === "function"
          ? div({ class: "card-header activity-card-header card-top" }, renderCardByline(byline), params.headerActions(audioObj))
          : audioObj.tribeOrigin
            ? renderCardTop(audioObj.key, audioObj.tribeOrigin.href, { ...byline, spread: (params.spreadMap && params.spreadMap.get(audioObj.key)) || null, reportTitle: audioObj.title })
            : renderCardTop(audioObj.key, href, { ...byline, spread: (params.spreadMap && params.spreadMap.get(audioObj.key)) || params.spreads || null, favKind: 'audios', torrentFrom: { blobId: audioObj.url, name: audioObj.title }, isFavorite: audioObj.isFavorite, reportTitle: audioObj.title, deleteAction: isOwn ? contentDeleteAction('audio', audioObj.key) : undefined, returnTo });
        const titleHref = typeof params.headerActions === "function" ? null : audioObj.tribeOrigin ? audioObj.tribeOrigin.href : href;
        const engagement = typeof params.engagement === "function" ? params.engagement(audioObj) : null;
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
      textarea({ maxlength: "5000", name: "description", placeholder: i18n.audioDescriptionPlaceholder, rows: "4" }, audioToEdit?.description || ""),
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
      button({ type: "submit" }, filter === "edit" ? i18n.audioUpdateButton : i18n.audioCreateButton)
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
      filter === "create" || filter === "edit"
        ? renderAudioForm(filter, audioId, audioToEdit, { ...params, filter })
        : section(
            emptyMod ? null : div(
              { class: "audios-search activity-filter-chips activity-toolbar-row" },
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
                  button({ type: "submit", class: "filter-box__button" }, i18n.audioSearchButton)
                )
              )
            ),
            div({ class: "audios-list" }, renderAudioList(paged(list), filter, { q, sort, spreadMap: params.spreadMap }))
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

  const ownerActions = renderAudioOwnerActions(filter, audioObj, { q, sort });
  const sideActions = [];
  if (audioObj.isBcs) {
    sideActions.push(form(
      { method: "GET", action: `/melody/transcode/${encodeURIComponent(audioObj.key)}`, class: "audio-transcode-form" },
      button({ type: "submit", class: "filter-btn" }, i18n.audioTranscodeButton || "TRANSCODE")
    ));
  }
  for (const a of ownerActions) sideActions.push(a);

  const tagsNode = renderTags(audioObj.tags);

  const audioSide = div({ class: "tribe-side" },
    renderCardTop(audioObj.key, href, { arrow: false,
      author: audioObj.author,
      date: audioObj.createdAt,
      chips: [
        renderReachChip(isClearnet, i18n, isClearnet ? clearnetItemHref('audios', audioObj.title, audioObj.key) : null),
        renderLicenseChip(audioObj.license),
        ...chips
      ],
      bylineExtra: [renderEditedChip(audioObj.key, audioObj.rootId), renderAudioUpdated(audioObj)],
      favKind: 'audios', torrentFrom: { blobId: audioObj.url, name: audioObj.title },
      isFavorite: audioObj.isFavorite,
      spread: params.spreads || null,
      returnTo,
      reportTitle: audioObj.title,
      deleteAction: isAuthor ? contentDeleteAction('audio', audioObj.key) : undefined
    }),
    div({ class: "shop-title-row" },
      title ? h2({ class: "tribe-card-title" }, title) : null,
      isAuthor ? renderClearnetSwitch('audios', audioObj.rootId || audioObj.key, isClearnet) : null
    ),
    renderDetailShare(audioObj.key, href, audioObj.title),
    safeText(audioObj.description)
      ? p({ class: "tribe-side-description" }, ...renderStyledText(audioObj.description))
      : null,
    tagsNode,
    renderMapEmbed(params.mapData, audioObj.mapUrl),
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null
  );

  const audioMain = div({ class: "tribe-main" },
    renderAudioPlayer(audioObj),
    audioObj?.url ? renderDownloadButton(blobUrlOf(audioObj.url), audioObj.title || "") : null,
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

const { renderCompositionSequence } = require("./melody_view");

exports.audioTranscodeDetailView = async ({ audio, decoded = false, stegoPayload = null, availableIds = null, itemSize = null }) => {
  const title = i18n.audioTranscodeDetailTitle || "Transcode";
  const composition = Array.isArray(audio.bcsComposition) ? audio.bcsComposition : [];
  const hasStego = decoded && stegoPayload && (stegoPayload.id || stegoPayload.ts || stegoPayload.msg);
  const stegoDate = hasStego && Number.isFinite(stegoPayload.ts) ? moment(stegoPayload.ts).format("YYYY/MM/DD HH:mm") : null;

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
        renderCardTop(audio.key, `/audios/${encodeURIComponent(audio.key)}`, { author: audio.author, date: audio.createdAt, chips: [itemSize ? renderEcoTax(itemSize, audio.key) : null], reportTitle: audio.title }),
        audio.title ? h2(audio.title) : null,
        renderAudioPlayer(audio, { skipTranscode: true }),
        renderDetailShare(audio.key, `/audios/${encodeURIComponent(audio.key)}`, audio.title),
        safeText(audio.description) ? p({ class: "melody-bcs-desc" }, audio.description) : null,
        renderTags(audio.tags),
        form({ method: "POST", action: `/melody/transcode/${encodeURIComponent(audio.key)}`, class: "audio-transcode-run-form audio-transcode-form" },
          button({ type: "submit", class: "create-button" }, i18n.audioTranscodeButton || "TRANSCODE")
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


