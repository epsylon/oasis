const { div, h2, p, section, button, form, a, input, label, span, textarea, br } = require("../server/node_modules/hyperaxe");
const RAW_HTML = Symbol.for('oasis.rawHtml');
const { TEXT_CAP } = require('../backend/long_text');
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view");
const { clearnetItemHref, template, i18n, renderOpinionsVoting, renderEngagement, renderCardTop, contentDeleteAction, renderSubscriptionBox, renderModuleStats, moduleIsEmpty, paged, renderDetailShare } = require("./main_views");
const { renderReachChip, renderClearnetSelector, renderClearnetSwitch } = require("./clearnet_view");
const { config } = require("../server/SSB_server.js");
const { renderStyledHtml } = require("../backend/renderStyledText");
const { sanitizeHtml } = require("../backend/sanitizeHtml");

const userId = config.keys.id;

const FILTERS = [
  { key: "ALL", i18n: "blogFilterAll" },
  { key: "RECENT", i18n: "blogFilterRecent" },
  { key: "MINE", i18n: "blogFilterMine" },
  { key: "FAVORITES", i18n: "blogFilterFavorites" },
  { key: "TOP", i18n: "blogFilterTop" }
];

const safeText = (v) => String(v == null ? "" : v).trim();

const renderBlogTags = (tags) => {
  const list = (Array.isArray(tags) ? tags : []).map(t => String(t || "").trim().replace(/^#+/, "")).filter(Boolean);
  return list.length
    ? div({ class: "card-tags" }, list.map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)))
    : null;
};

const excerpt = (text, max = 420) => {
  const s = safeText(text);
  return s.length > max ? s.slice(0, max).replace(/\s+$/, "") + "…" : s;
};

const renderFilterBar = (filter, q, showSearch = true, total = null, censusList = null) => {
  const emptyMod = total !== null && moduleIsEmpty({ length: Number(total) || 0 }, filter, "ALL", q);
  const censusB = Array.isArray(censusList) ? censusList : [];
  const blogChip = (x) => {
    const m = x.key;
    if (m === filter || m === "ALL") return true;
    if (m === "TOP") return censusB.length > 0;
    if (m === "MINE") return censusB.some(b => String(b.author) === String(userId));
    if (m === "RECENT") return censusB.length > 0;
    if (m === "FAVORITES") return censusB.some(b => b.isFavorite);
    return true;
  };
  return section(
    div({ class: "filters" },
      form({ method: "GET", action: "/blogs", class: "ui-toolbar ui-toolbar--filters" },
        ...(emptyMod ? [] : FILTERS.filter(blogChip).map(f =>
          button({ type: "submit", name: "filter", value: f.key, class: filter === f.key ? "filter-btn active" : "filter-btn" }, String(i18n[f.i18n]).toUpperCase())
        )),
        button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.blogCreateButton)
      )
    ),
    showSearch && !emptyMod
      ? div({ class: "filters activity-filter-chips activity-toolbar-row" },
          total != null ? renderModuleStats(total) : null,
          form({ method: "GET", action: "/blogs", class: "filter-box" },
            input({ type: "hidden", name: "filter", value: filter }),
            input({ type: "text", name: "q", value: q || "", placeholder: i18n.blogSearchPlaceholder, class: "filter-box__input" }),
            div({ class: "filter-box__controls" },
              button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
            )
          )
        )
      : null
  );
};

const renderBlogCard = (blog, filter, spreadInfo) => {
  const href = `/blogs/${encodeURIComponent(blog.id)}`;
  const isOwn = String(blog.author) === String(userId);
  return div({ class: "trending-card blog-card" + (isOwn ? " own-content" : "") },
    renderCardTop(blog.id, href, { date: blog.createdAt, chips: blog.clearnet === true ? [renderReachChip(true, i18n, clearnetItemHref("blog", blog.subject || blog.text, blog.id))] : [], spread: spreadInfo || null, author: blog.author, favKind: 'blogs', isFavorite: blog.isFavorite, reportTitle: blog.subject || blog.text, deleteAction: isOwn ? contentDeleteAction('blog', blog.id) : undefined }),
    div({ class: "card-section blog-card-body" },
      blog.subject
        ? div({ class: "shop-title-row" },
            h2({ class: "tribe-card-title" }, a({ href }, blog.subject))
          )
        : null,
      div({ class: "blog-card-text", [RAW_HTML]: sanitizeHtml(renderStyledHtml(excerpt(blog.text))) }),
      renderBlogTags(blog.tags),
      null
    )
  );
};

const renderCreateForm = (draft = null) => {
  const subjectValue = draft ? safeText(draft.subject) : "";
  const textValue = draft ? String(draft.text || "") : "";
  const allowComments = draft ? draft.allowComments !== false : true;
  const tagsValue = draft ? (Array.isArray(draft.tags) ? draft.tags.join(", ") : safeText(draft.tags)) : "";
  return section(
    draft
      ? section({ class: "post-preview blog-preview" },
          div({ class: "preview-content" },
            h2(i18n.messagePreview),
            subjectValue ? h2({ class: "tribe-card-title" }, subjectValue) : null,
            div({ class: "blog-detail-text", [RAW_HTML]: sanitizeHtml(renderStyledHtml(textValue)) }),
            renderBlogTags(draft.tags)
          )
        )
      : null,
    div({ class: "publish-form" },
      form({ action: "/blogs/create", method: "POST", enctype: "multipart/form-data" },
        label({ for: "subject" }, i18n.blogSubject),
        br(),
        input({ type: "text", name: "subject", id: "subject", maxlength: "150", placeholder: i18n.contentWarningPlaceholder, value: subjectValue }),
        br(),
        label({ for: "text" }, i18n.blogMessage),
        br(),
        textarea({ required: true, name: "text", id: "text", rows: "8", class: "publish-textarea", maxlength: String(TEXT_CAP), placeholder: i18n.publishWarningPlaceholder }, textValue),
        br(),
        label({ for: "blob" }, i18n.blogMedia),
        br(),
        input({ type: "file", id: "blob", name: "blob", multiple: true, accept: "image/*,video/*,audio/*,application/pdf" }),
        br(),
        br(),
        label({ for: "tags" }, i18n.tagsLabel || "Tags"),
        br(),
        input({ type: "text", name: "tags", id: "tags", placeholder: i18n.tagsPlaceholder || "", value: tagsValue }),
        br(),
        div({ class: "blog-allow-comments" },
          input({ type: "hidden", name: "allowComments", value: "0" }),
          label(
            input({ type: "checkbox", name: "allowComments", value: "1", ...(allowComments ? { checked: true } : {}) }),
            " ",
            i18n.blogAllowComments
          )
        ),
        renderClearnetSelector(!!(draft && draft.clearnet === true), i18n),
        br(),
        button({ type: "submit", class: "filter-btn", formaction: "/blogs/preview", attrs: { formmethod: "POST" } }, i18n.preview),
        " ",
        button({ type: "submit", class: "create-button" }, i18n.blogPublish)
      )
    )
  );
};

const renderCommentsSection = (blog, comments = []) => {
  const href = `/blogs/${encodeURIComponent(blog.id)}`;
  return renderSharedCommentsSection({
    action: `${href}/comments`,
    comments: comments,
    returnTo: href,
    closedNote: blog.allowComments ? null : i18n.blogCommentsClosed
  });
};

exports.blogView = async (blogs = [], filter = "ALL", params = {}) => {
  const showForm = String(filter).toUpperCase() === "CREATE";
  const spreadMap = params.spreadMap instanceof Map ? params.spreadMap : new Map();
  return template(
    i18n.blogTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.blogTitle),
        p(i18n.blogDescription)
      )
    ),
    renderFilterBar(showForm ? "CREATE" : filter, params.q, !showForm, Array.isArray(blogs) ? blogs.length : 0, params.censusList),
    showForm
      ? renderCreateForm(params.draft || null)
      : section(
          blogs.length
            ? div({ class: "blogs-grid" }, ...paged(blogs).map(b => renderBlogCard(b, filter, spreadMap.get(b.id))))
            : div({ class: "no-content-box" }, p({ class: "no-content" }, i18n.blogNoItems))
        )
  );
};

exports.singleBlogView = async (blog, comments = [], params = {}) => {
  const href = `/blogs/${encodeURIComponent(blog.id)}`;
  const isAuthor = String(blog.author) === String(userId);
  const isClearnet = !!blog.clearnet;

  const blogSide = div({ class: "tribe-side" },
    renderCardTop(blog.id, href, { arrow: false, date: blog.createdAt, chips: [renderReachChip(isClearnet, i18n, isClearnet ? clearnetItemHref("blog", blog.subject || blog.text, blog.id) : null)], spread: params.spreads || null, author: blog.author, favKind: 'blogs', isFavorite: blog.isFavorite, reportTitle: blog.subject || blog.text, returnTo: href, deleteAction: isAuthor ? contentDeleteAction('blog', blog.id) : undefined }),
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, blog.subject || i18n.blogTitle)
    ),
    renderDetailShare(blog.id, href, blog.subject || blog.text),
    isAuthor ? renderClearnetSwitch("posts", blog.rootId || blog.id, isClearnet) : null,
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.blogComments}: ${blog.commentCount || 0}`)
    ),
    params.subscription
      ? renderSubscriptionBox({
          target: blog.author,
          scope: "blogs",
          subscribed: params.subscription.subscribed === true,
          count: params.subscription.count,
          isOwner: isAuthor,
          returnTo: href
        })
      : null,
  );

  const blogMain = div({ class: "tribe-main" },
    div({ class: "job-section" },
      div({ class: "blog-detail-text", [RAW_HTML]: sanitizeHtml(renderStyledHtml(blog.text || "")) }),
      renderBlogTags(blog.tags)
    ),
    renderEngagement(blog.id,
      renderOpinionsVoting('/blogs/opinions', blog.id, blog.opinions, href, blog.opinions_inhabitants),
      renderCommentsSection(blog, comments))
  );

  return template(
    blog.subject || i18n.blogTitle,
    section(div({ class: "tags-header module-header-line" }, h2(i18n.blogTitle), p(i18n.blogDescription))),
    renderFilterBar("ALL", params.q, false, null, params.censusList),
    section(div({ class: "tribe-details" }, blogSide, blogMain))
  );
};
