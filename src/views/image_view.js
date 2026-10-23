const { form, button, div, h2, p, section, input, label, br, a, img, span, textarea, select, option } =
  require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection, renderCommentsLink } = require("./comments_view");

const moment = require("../server/node_modules/moment");
const { renderLicenseChip, renderLicenseSelect, renderReachChip, renderClearnetSelector, renderClearnetSwitch, renderTribeOriginChip } = require('./clearnet_view');
const { clearnetItemHref, template, i18n, renderOpinionsVoting, renderEngagement, renderEcoTax, renderLifespanChip, renderCardTop, renderCardByline, renderSpreadEditWarning, renderModuleStats, moduleIsEmpty, contentDeleteAction, paged, blobUrlOf, renderMediaLockNote, renderEditedChip, renderDetailShare } = require("./main_views");
const { config } = require("../server/SSB_server.js");
const { renderStyledText } = require("../backend/renderStyledText")
const { renderMapLocationVisitLabel, renderMapEmbed } = require("./maps_view");
const { renderZoomableImage, renderDownloadButton, downloadHref } = require("./gallery_view");
const LIST_THUMB = 640;
const thumbOf = (url) => String(url || "").startsWith("&") ? `/image/${LIST_THUMB}/${encodeURIComponent(url)}?fit=inside` : null;

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
  return `/images?${parts.join("&")}`;
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

const renderImageMedia = (imgObj, filter, params = {}) => {
  const src = imgObj?.url ? blobUrlOf(imgObj.url) : "";

  return imgObj?.url
    ? div(
        { class: "image-container image-container-row" },
        renderZoomableImage(src, { alt: imgObj.title || "", imgClass: "post-image", thumb: thumbOf(imgObj.url) })
      )
    : p(i18n.imageNoFile);
};

const renderImageUpdated = (imgObj) => {
  const createdTs = imgObj.createdAt ? new Date(imgObj.createdAt).getTime() : NaN;
  const updatedTs = imgObj.updatedAt ? new Date(imgObj.updatedAt).getTime() : NaN;
  const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);
  return showUpdated
    ? span({ class: "votations-comment-date" }, `${i18n.imageUpdatedAt}: ${moment(imgObj.updatedAt).format("YYYY/MM/DD HH:mm")}`)
    : null;
};

const renderImageList = exports.renderImageList = (images, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  return images.length
    ? images.map((imgObj) => {
        const commentCount = typeof imgObj.commentCount === "number" ? imgObj.commentCount : 0;
        const title = safeText(imgObj.title);
        const href = `/images/${encodeURIComponent(imgObj.key)}`;

        const isOwn = imgObj.author && String(imgObj.author) === String(userId);
        const byline = {
          author: imgObj.author,
          date: imgObj.createdAt,
          chips: [
            imgObj.tribeOrigin ? renderTribeOriginChip(imgObj.tribeOrigin) : imgObj.clearnet === true ? renderReachChip(true, i18n, clearnetItemHref('images', imgObj.title, imgObj.key)) : null,
            renderLicenseChip(imgObj.license),
            ...(typeof params.titleChips === "function" ? params.titleChips(imgObj) : []),
            renderLifespanChip(imgObj.lifetime, i18n)
          ],
          bylineExtra: [renderImageUpdated(imgObj)]
        };
        const header = typeof params.headerActions === "function"
          ? div({ class: "card-header activity-card-header card-top" }, renderCardByline(byline), params.headerActions(imgObj))
          : imgObj.tribeOrigin
            ? renderCardTop(imgObj.key, imgObj.tribeOrigin.href, { ...byline, spread: (params.spreadMap && params.spreadMap.get(imgObj.key)) || null, reportTitle: imgObj.title })
            : renderCardTop(imgObj.key, href, { ...byline, spread: (params.spreadMap && params.spreadMap.get(imgObj.key)) || params.spreads || null, favKind: 'images', torrentFrom: { blobId: imgObj.url, name: imgObj.title }, isFavorite: imgObj.isFavorite, reportTitle: imgObj.title, returnTo, deleteAction: isOwn ? contentDeleteAction("image", imgObj.key) : null });
        const titleHref = typeof params.headerActions === "function" ? null : imgObj.tribeOrigin ? imgObj.tribeOrigin.href : href;
        const engagement = typeof params.engagement === "function" ? params.engagement(imgObj) : null;
        return div(
          { class: "trending-card image-card" + (isOwn ? " own-content" : "") },
          header,
          div(
            { class: "card-section image-card-body" },
            title ? div({ class: "shop-title-row" }, h2(titleHref ? a({ href: titleHref, class: "card-title-link" }, title) : title)) : null,
            renderImageMedia(imgObj, filter, params),
            ...(typeof params.bodyExtra === "function" ? params.bodyExtra(imgObj) : []),
            renderMapLocationVisitLabel(imgObj.mapUrl),
            engagement
          )
        );
      })
    : p(params.q ? i18n.imageNoMatch : i18n.noImages);
};

const renderImageForm = (filter, imageId, imageToEdit, params = {}) => {
  const returnFilter = filter === "create" ? "all" : params.filter || "all";
  const returnTo = safeText(params.returnTo) || buildReturnTo(returnFilter, params);
  const tagsValue = safeArr(imageToEdit?.tags).join(", ");

  return div(
    { class: "div-center image-form" },
    params.spreadWarning || null,
    form(
      {
        action: filter === "edit" ? `/images/update/${encodeURIComponent(imageId)}` : "/images/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      label(i18n.imageFileLabel),
      br(),
      (filter === "edit" && renderMediaLockNote(imageToEdit)) || input({ type: "file", name: "image", accept: "image/*", required: filter !== "edit" }),
      br(),
      br(),
      imageToEdit?.url
        ? img({ loading: 'lazy', src: blobUrlOf(imageToEdit.url), class: "media-preview", alt: imageToEdit?.title || "" })
        : null,
      label(i18n.imageTitleLabel),
      br(),
      input({ type: "text", name: "title", maxlength: "100", placeholder: i18n.imageTitlePlaceholder, value: imageToEdit?.title || "" }),
      br(),
      label(i18n.imageDescriptionLabel),
      br(),
      textarea({ name: "description", placeholder: i18n.imageDescriptionPlaceholder, rows: "4" }, imageToEdit?.description || ""),
      br(),
      label(i18n.mapLocationTitle || "Map Location"),
      br(),
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: imageToEdit?.mapUrl || "" }),
      br(),
      label(i18n.imageTagsLabel),
      br(),
      input({ type: "text", name: "tags", placeholder: i18n.imageTagsPlaceholder, value: tagsValue }),
      br(),
      ...renderLicenseSelect(imageToEdit?.license, i18n),
      br(),
      renderClearnetSelector(filter === "edit" ? !!imageToEdit?.clearnet : false, i18n),
      br(),
      button({ type: "submit" }, filter === "edit" ? i18n.imageUpdateButton : i18n.imageCreateButton)
    )
  );
};

const renderGallery = (images) => {
  if (!images.length) return div(i18n.noImages);

  return div(
    { class: "gallery" },
    images.map((imgObj) => {
      const src = imgObj.url ? `/image/256/${encodeURIComponent(imgObj.url)}` : "";
      return a(
        { href: `#img-${encodeURIComponent(imgObj.key)}`, id: `img-${encodeURIComponent(imgObj.key)}-src`, class: "gallery-item" },
        img({ src, alt: imgObj.title || "", class: "gallery-image", loading: "lazy" })
      );
    })
  );
};

const renderLightbox = (images) =>
  images.map((imgObj, i) => {
    const src = imgObj.url ? blobUrlOf(imgObj.url) : "";
    const idOf = (o) => `img-${encodeURIComponent(o.key)}`;
    const prev = images[i - 1];
    const next = images[i + 1];
    return div(
      { id: idOf(imgObj), class: "lightbox" },
      src ? a({ href: downloadHref(src), class: "lightbox-download", title: i18n.fileShareDownload || "Download" }, "⤓") : null,
      a({ href: `#${idOf(imgObj)}-src`, class: "lightbox-close" }, "×"),
      prev ? a({ href: `#${idOf(prev)}`, class: "lightbox-prev", title: "←" }, "‹") : null,
      next ? a({ href: `#${idOf(next)}`, class: "lightbox-next", title: "→" }, "›") : null,
      img({ src, class: "lightbox-image", alt: imgObj.title || "", loading: "lazy" })
    );
  });

const renderImageCommentsSection = (imageKey, comments = [], returnTo = null) => {
  return renderSharedCommentsSection({
    action: `/images/${encodeURIComponent(imageKey)}/comments`,
    comments: comments,
    returnTo: returnTo
  });
};

const mediaChipFor = (filter, censusM) => (mode) => {
  if (mode === filter) return true;
  if (!Array.isArray(censusM)) return true;
  if (mode === "top") return censusM.some((x) => !x.tribeOrigin);
  if (mode === "gallery") return censusM.length > 0;
  if (mode === "mine") return censusM.some((x) => String(x.author) === String(userId));
  if (mode === "recent") return censusM.length > 0;
  if (mode === "favorites") return censusM.some((x) => x.isFavorite);
  if (mode === "bcs") return censusM.some((x) => String(x.title || "").toUpperCase().startsWith("BCS-"));
  return true;
};

exports.imageView = async (images, filter = "all", imageId = null, params = {}) => {
  if (filter === "edit") params = { ...params, spreadWarning: await renderSpreadEditWarning(imageId) };
  const title = i18n.imageTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(images);
  const emptyMod = moduleIsEmpty(list, filter, "all", q);
  const mediaChip = mediaChipFor(filter, Array.isArray(params.censusList) ? params.censusList : list);
  const imageToEdit = imageId ? list.find((im) => im.key === imageId) : null;

  return template(
    title,
    section(
      div({ class: "tags-header module-header-line" },
        h2(title),
        p(i18n.imageDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/images", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "sort", value: sort }),
          ...(emptyMod ? [] : [
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.imageFilterAll).toUpperCase()),
          ...(mediaChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.imageFilterRecent).toUpperCase())] : []),
          ...(mediaChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.imageFilterMine).toUpperCase())] : []),
          ...(mediaChip("favorites") ? [button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.imageFilterFavorites).toUpperCase()
          )] : []),

          ...(mediaChip("top") ? [button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.imageFilterTop).toUpperCase())] : []),
          ...(mediaChip("gallery") ? [button(
            { type: "submit", name: "filter", value: "gallery", class: filter === "gallery" ? "filter-btn active" : "filter-btn" },
            String(i18n.imageFilterGallery).toUpperCase()
          )] : []),
          ]),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.imageCreateButton)
        )
      )
    ),
    section(
      filter === "create" || filter === "edit"
        ? renderImageForm(filter, imageId, imageToEdit, { ...params, filter })
        : section(
            emptyMod ? null : div(
              { class: "images-search activity-filter-chips activity-toolbar-row" },
                renderModuleStats(list.length),
              form(
                { method: "GET", action: "/images", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter }),
                input({
                  type: "text",
                  name: "q",
                  value: q,
                  placeholder: i18n.imageSearchPlaceholder,
                  class: "filter-box__input"
                }),
                div(
                  { class: "filter-box__controls" },
                  select(
                    { name: "sort", class: "filter-box__select" },
                    option({ value: "recent", ...(sort === "recent" ? { selected: true } : {})}, i18n.imageSortRecent),
                    option({ value: "oldest", ...(sort === "oldest" ? { selected: true } : {})}, i18n.imageSortOldest),
                    option({ value: "top", ...(sort === "top" ? { selected: true } : {})}, i18n.imageSortTop)
                  ),
                  button({ type: "submit", class: "filter-box__button" }, i18n.imageSearchButton)
                )
              )
            ),
            filter === "gallery" ? renderGallery(paged(list)) : div({ class: "images-list" }, renderImageList(paged(list), filter, { q, sort, spreadMap: params.spreadMap }))
          )
    ),
    ...(filter === "gallery" ? renderLightbox(paged(list)) : [])
  );
};

exports.singleImageView = async (imageObj, filter = "all", comments = [], params = {}) => {
  const mediaChip = mediaChipFor(filter, Array.isArray(params.censusList) ? params.censusList : null);
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q, sort });

  const title = safeText(imageObj.title);
  const isAuthor = String(imageObj.author) === String(userId);
  const isClearnet = !!imageObj.clearnet;

  const chips = [
    renderLifespanChip(imageObj.lifetime, i18n),
    imageObj.sizeBytes ? renderEcoTax(imageObj.sizeBytes, imageObj.key) : null
  ].filter(Boolean);


  const tagsNode = renderTags(imageObj.tags);
  const href = `/images/${encodeURIComponent(imageObj.key)}`;

  const imageSide = div({ class: "tribe-side" },
    renderCardTop(imageObj.key, href, { arrow: false,
      author: imageObj.author,
      date: imageObj.createdAt,
      chips: [
        renderReachChip(isClearnet, i18n, isClearnet ? clearnetItemHref('images', imageObj.title, imageObj.key) : null),
        renderLicenseChip(imageObj.license),
        ...chips
      ],
      bylineExtra: [renderEditedChip(imageObj.key, imageObj.rootId), renderImageUpdated(imageObj)],
      editAction: String(imageObj.author) === String(userId) ? `/images/edit/${encodeURIComponent(imageObj.key)}?returnTo=${encodeURIComponent(buildReturnTo(filter, { q, sort }))}` : undefined,
      deleteAction: String(imageObj.author) === String(userId) ? contentDeleteAction("image", imageObj.key) : null,
      favKind: 'images', torrentFrom: { blobId: imageObj.url, name: imageObj.title },
      isFavorite: imageObj.isFavorite,
      spread: params.spreads || null,
      returnTo,
      reportTitle: imageObj.title
    }),
    div({ class: "shop-title-row" },
      title ? h2({ class: "tribe-card-title" }, title) : null,
      isAuthor ? renderClearnetSwitch('images', imageObj.rootId || imageObj.key, isClearnet) : null
    ),
    renderDetailShare(imageObj.key, href, imageObj.title),
    tagsNode,
    renderMapEmbed(params.mapData, imageObj.mapUrl),
  );

  const imageMain = div({ class: "tribe-main" },
    safeText(imageObj.description)
      ? div({ class: "job-section" }, h2({ class: "job-section-title" }, i18n.description), p({ class: "tribe-side-description" }, ...renderStyledText(imageObj.description)))
      : null,
    imageObj?.url
      ? div(
          { class: "image-container" },
          renderZoomableImage(blobUrlOf(imageObj.url), { alt: imageObj.title || "", imgClass: "media-preview", full: true }),
          renderDownloadButton(blobUrlOf(imageObj.url), imageObj.title || "")
        )
      : p(i18n.imageNoFile),
    renderEngagement(imageObj.key,
      renderOpinionsVoting('/images/opinions', imageObj.key, imageObj.opinions, returnTo, imageObj.opinions_inhabitants),
      renderImageCommentsSection(imageObj.key, comments, returnTo))
  );

  return template(
    i18n.imageTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.imageAllSectionTitle || i18n.imageTitle),
        p(i18n.imageDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/images", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.imageFilterAll).toUpperCase()),
          ...(mediaChip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.imageFilterRecent).toUpperCase())] : []),
          ...(mediaChip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.imageFilterMine).toUpperCase())] : []),
          ...(mediaChip("favorites") ? [button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            String(i18n.imageFilterFavorites).toUpperCase()
          )] : []),

          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, String(i18n.imageFilterTop).toUpperCase()),
          ...(mediaChip("gallery") ? [button(
            { type: "submit", name: "filter", value: "gallery", class: filter === "gallery" ? "filter-btn active" : "filter-btn" },
            String(i18n.imageFilterGallery).toUpperCase()
          )] : []),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.imageCreateButton)
        )
      ),
      div({ class: "tribe-details" }, imageSide, imageMain)
    )
  );
};

