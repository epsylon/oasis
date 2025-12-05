const { form, button, div, h2, p, section, input, label, br, a, img, span, textarea, select, option } =
  require("../server/node_modules/hyperaxe");

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
  return `/images?${parts.join("&")}`;
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

const renderImageFavoriteToggle = (imgObj, returnTo = "") =>
  form(
    {
      method: "POST",
      action: imgObj.isFavorite
        ? `/images/favorites/remove/${encodeURIComponent(imgObj.key)}`
        : `/images/favorites/add/${encodeURIComponent(imgObj.key)}`
    },
    returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
    button(
      { type: "submit", class: "filter-btn" },
      imgObj.isFavorite ? i18n.imageRemoveFavoriteButton : i18n.imageAddFavoriteButton
    )
  );

const renderImageMedia = (imgObj, filter, params = {}) => {
  const src = imgObj?.url ? `/blob/${encodeURIComponent(imgObj.url)}` : "";

  return imgObj?.url
    ? div(
        { class: "image-container", style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" },
        a(
          {
            href: `/images/${encodeURIComponent(imgObj.key)}?filter=${encodeURIComponent(filter || "all")}${
              params.q ? `&q=${encodeURIComponent(params.q)}` : ""
            }${params.sort ? `&sort=${encodeURIComponent(params.sort)}` : ""}`
          },
          img({ src, alt: imgObj.title || "", class: "media-preview", loading: "lazy" })
        )
      )
    : p(i18n.imageNoFile);
};

const renderImageOwnerActions = (filter, imgObj, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  const isAuthor = String(imgObj.author) === String(userId);
  const hasOpinions = Object.keys(imgObj.opinions || {}).length > 0;

  if (!isAuthor) return [];

  const items = [];
  if (!hasOpinions) {
    items.push(
      form(
        { method: "GET", action: `/images/edit/${encodeURIComponent(imgObj.key)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ class: "update-btn", type: "submit" }, i18n.imageUpdateButton)
      )
    );
  }
  items.push(
    form(
      { method: "POST", action: `/images/delete/${encodeURIComponent(imgObj.key)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.imageDeleteButton)
    )
  );

  return items;
};

const renderImageList = (images, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  return images.length
    ? images.map((imgObj) => {
        const commentCount = typeof imgObj.commentCount === "number" ? imgObj.commentCount : 0;
        const title = safeText(imgObj.title);
        const ownerActions = renderImageOwnerActions(filter, imgObj, params);

        return div(
          { class: "tags-header image-card" },
          div(
            { class: "bookmark-topbar" },
            div(
              { class: "bookmark-topbar-left" },
              form(
                { method: "GET", action: `/images/${encodeURIComponent(imgObj.key)}` },
                input({ type: "hidden", name: "returnTo", value: returnTo }),
                input({ type: "hidden", name: "filter", value: filter || "all" }),
                params.q ? input({ type: "hidden", name: "q", value: params.q }) : null,
                params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
                button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
              ),
              renderImageFavoriteToggle(imgObj, returnTo),
              renderPMButton(imgObj.author)
            ),
            ownerActions.length ? div({ class: "bookmark-actions" }, ...ownerActions) : null
          ),
          title ? h2(title) : null,
          renderImageMedia(imgObj, filter, params),
          safeText(imgObj.description) ? p(...renderUrl(imgObj.description)) : null,
          renderTags(imgObj.tags),
          div(
            { class: "card-comments-summary" },
            span({ class: "card-label" }, i18n.voteCommentsLabel + ":"),
            span({ class: "card-value" }, String(commentCount)),
            br(),
            br(),
            form(
              { method: "GET", action: `/images/${encodeURIComponent(imgObj.key)}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              input({ type: "hidden", name: "filter", value: filter || "all" }),
              params.q ? input({ type: "hidden", name: "q", value: params.q }) : null,
              params.sort ? input({ type: "hidden", name: "sort", value: params.sort }) : null,
              button({ type: "submit", class: "filter-btn" }, i18n.voteCommentsForumButton)
            )
          ),
          br(),
          (() => {
            const createdTs = imgObj.createdAt ? new Date(imgObj.createdAt).getTime() : NaN;
            const updatedTs = imgObj.updatedAt ? new Date(imgObj.updatedAt).getTime() : NaN;
            const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

            return p(
              { class: "card-footer" },
              span({ class: "date-link" }, `${moment(imgObj.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
              a({ href: `/author/${encodeURIComponent(imgObj.author)}`, class: "user-link" }, `${imgObj.author}`),
              showUpdated
                ? span(
                    { class: "votations-comment-date" },
                    ` | ${i18n.imageUpdatedAt}: ${moment(imgObj.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
                  )
                : null
            );
          })(),
          div(
            { class: "voting-buttons" },
            opinionCategories.map((category) =>
              form(
                { method: "POST", action: `/images/opinions/${encodeURIComponent(imgObj.key)}/${category}` },
                input({ type: "hidden", name: "returnTo", value: returnTo }),
                button(
                  { class: "vote-btn" },
                  `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${
                    imgObj.opinions?.[category] || 0
                  }]`
                )
              )
            )
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
    form(
      {
        action: filter === "edit" ? `/images/update/${encodeURIComponent(imageId)}` : "/images/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      label(i18n.imageFileLabel),
      br(),
      input({ type: "file", name: "image", required: filter !== "edit" }),
      br(),
      br(),
      imageToEdit?.url
        ? img({ src: `/blob/${encodeURIComponent(imageToEdit.url)}`, class: "media-preview", alt: imageToEdit?.title || "" })
        : null,
      br(),
      label(i18n.imageTagsLabel),
      br(),
      input({ type: "text", name: "tags", placeholder: i18n.imageTagsPlaceholder, value: tagsValue }),
      br(),
      br(),
      label(i18n.imageTitleLabel),
      br(),
      input({ type: "text", name: "title", placeholder: i18n.imageTitlePlaceholder, value: imageToEdit?.title || "" }),
      br(),
      br(),
      label(i18n.imageDescriptionLabel),
      br(),
      textarea({ name: "description", placeholder: i18n.imageDescriptionPlaceholder, rows: "4" }, imageToEdit?.description || ""),
      br(),
      br(),
      input({ type: "hidden", name: "meme", value: "0" }),
      label(i18n.imageMemeLabel),
      br(),
      input({
        id: "meme-checkbox",
        type: "checkbox",
        name: "meme",
        value: "1",
        class: "meme-checkbox",
        ...(imageToEdit?.meme ? { checked: true } : {})
      }),
      br(),
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
        { href: `#img-${encodeURIComponent(imgObj.key)}`, class: "gallery-item" },
        img({ src, alt: imgObj.title || "", class: "gallery-image", loading: "lazy" })
      );
    })
  );
};

const renderLightbox = (images) =>
  images.map((imgObj) => {
    const src = imgObj.url ? `/blob/${encodeURIComponent(imgObj.url)}` : "";
    return div(
      { id: `img-${encodeURIComponent(imgObj.key)}`, class: "lightbox" },
      a({ href: "#", class: "lightbox-close" }, "×"),
      img({ src, class: "lightbox-image", alt: imgObj.title || "" })
    );
  });

const renderImageCommentsSection = (imageKey, comments = [], returnTo = null) => {
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
        { method: "POST", action: `/images/${encodeURIComponent(imageKey)}/comments`, class: "comment-form" },
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
            const text = content.text || "";
            const threadRoot = content.fork || content.root || null;

            return div(
              { class: "votations-comment-card" },
              span(
                { class: "created-at" },
                span(i18n.createdBy),
                author ? a({ href: `/author/${encodeURIComponent(author)}` }, `@${userName}`) : span("(unknown)"),
                absDate ? span(" | ") : "",
                absDate ? span({ class: "votations-comment-date" }, absDate) : "",
                relDate ? span({ class: "votations-comment-date" }, " | ", i18n.sendTime) : "",
                relDate && threadRoot ? a({ href: `/thread/${encodeURIComponent(threadRoot)}#${encodeURIComponent(c.key)}` }, relDate) : ""
              ),
              p({ class: "votations-comment-text" }, ...renderUrl(text))
            );
          })
        )
      : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet)
  );
};

exports.imageView = async (images, filter = "all", imageId = null, params = {}) => {
  const title =
    filter === "mine"
      ? i18n.imageMineSectionTitle
      : filter === "create"
        ? i18n.imageCreateSectionTitle
        : filter === "edit"
          ? i18n.imageUpdateSectionTitle
          : filter === "gallery"
            ? i18n.imageGallerySectionTitle
            : filter === "meme"
              ? i18n.imageMemeSectionTitle
              : filter === "recent"
                ? i18n.imageRecentSectionTitle
                : filter === "top"
                  ? i18n.imageTopSectionTitle
                  : filter === "favorites"
                    ? i18n.imageFavoritesSectionTitle
                    : i18n.imageAllSectionTitle;

  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");

  const list = safeArr(images);
  const imageToEdit = imageId ? list.find((im) => im.key === imageId) : null;

  return template(
    title,
    section(
      div({ class: "tags-header" }, h2(title), p(i18n.imageDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/images", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.imageFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.imageFilterMine),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.imageFilterRecent),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, i18n.imageFilterTop),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            i18n.imageFilterFavorites
          ),
          button(
            { type: "submit", name: "filter", value: "gallery", class: filter === "gallery" ? "filter-btn active" : "filter-btn" },
            i18n.imageFilterGallery
          ),
          button({ type: "submit", name: "filter", value: "meme", class: filter === "meme" ? "filter-btn active" : "filter-btn" }, i18n.imageFilterMeme),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.imageCreateButton)
        )
      )
    ),
    section(
      filter === "create" || filter === "edit"
        ? renderImageForm(filter, imageId, imageToEdit, { ...params, filter })
        : section(
            div(
              { class: "images-search" },
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
                    option({ value: "recent", selected: sort === "recent" }, i18n.imageSortRecent),
                    option({ value: "oldest", selected: sort === "oldest" }, i18n.imageSortOldest),
                    option({ value: "top", selected: sort === "top" }, i18n.imageSortTop)
                  ),
                  button({ type: "submit", class: "filter-box__button" }, i18n.imageSearchButton)
                )
              )
            ),
            filter === "gallery" ? renderGallery(list) : div({ class: "images-list" }, renderImageList(list, filter, { q, sort }))
          )
    ),
    ...(filter === "gallery" ? renderLightbox(list) : [])
  );
};

exports.singleImageView = async (imageObj, filter = "all", comments = [], params = {}) => {
  const q = safeText(params.q || "");
  const sort = safeText(params.sort || "recent");
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q, sort });

  const title = safeText(imageObj.title);
  const ownerActions = renderImageOwnerActions(filter, imageObj, { q, sort });

  const topbar = div(
    { class: "bookmark-topbar" },
    div(
      { class: "bookmark-topbar-left" },
      renderImageFavoriteToggle(imageObj, returnTo),
      renderPMButton(imageObj.author)
    ),
    ownerActions.length ? div({ class: "bookmark-actions" }, ...ownerActions) : null
  );

  return template(
    i18n.imageTitle,
    section(
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/images", class: "ui-toolbar ui-toolbar--filters" },
          input({ type: "hidden", name: "q", value: q }),
          input({ type: "hidden", name: "sort", value: sort }),
          button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.imageFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.imageFilterMine),
          button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.imageFilterRecent),
          button({ type: "submit", name: "filter", value: "top", class: filter === "top" ? "filter-btn active" : "filter-btn" }, i18n.imageFilterTop),
          button(
            { type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" },
            i18n.imageFilterFavorites
          ),
          button(
            { type: "submit", name: "filter", value: "gallery", class: filter === "gallery" ? "filter-btn active" : "filter-btn" },
            i18n.imageFilterGallery
          ),
          button({ type: "submit", name: "filter", value: "meme", class: filter === "meme" ? "filter-btn active" : "filter-btn" }, i18n.imageFilterMeme),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.imageCreateButton)
        )
      ),
      div(
        { class: "bookmark-item card" },
        topbar,
        title ? h2(title) : null,
        imageObj?.url
          ? div(
              { class: "image-container", style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;" },
              img({
                src: `/blob/${encodeURIComponent(imageObj.url)}`,
                alt: imageObj.title || "",
                class: "media-preview",
                loading: "lazy"
              })
            )
          : p(i18n.imageNoFile),
        safeText(imageObj.description) ? p(...renderUrl(imageObj.description)) : null,
        renderTags(imageObj.tags),
        br(),
        (() => {
          const createdTs = imageObj.createdAt ? new Date(imageObj.createdAt).getTime() : NaN;
          const updatedTs = imageObj.updatedAt ? new Date(imageObj.updatedAt).getTime() : NaN;
          const showUpdated = Number.isFinite(updatedTs) && (!Number.isFinite(createdTs) || updatedTs !== createdTs);

          return p(
            { class: "card-footer" },
            span({ class: "date-link" }, `${moment(imageObj.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
            a({ href: `/author/${encodeURIComponent(imageObj.author)}`, class: "user-link" }, `${imageObj.author}`),
            showUpdated
              ? span(
                  { class: "votations-comment-date" },
                  ` | ${i18n.imageUpdatedAt}: ${moment(imageObj.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`
                )
              : null
          );
        })(),
        div(
          { class: "voting-buttons" },
          opinionCategories.map((category) =>
            form(
              { method: "POST", action: `/images/opinions/${encodeURIComponent(imageObj.key)}/${category}` },
              input({ type: "hidden", name: "returnTo", value: returnTo }),
              button(
                { class: "vote-btn" },
                `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${
                  imageObj.opinions?.[category] || 0
                }]`
              )
            )
          )
        )
      ),
      div({ id: "comments" }, renderImageCommentsSection(imageObj.key, comments, returnTo))
    )
  );
};

