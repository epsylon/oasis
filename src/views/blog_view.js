const { div, h2, p, section, button, form, a, input, label, span, textarea, br, table, tr, td } = require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view");
const { template, i18n, userLink, renderOpinionsVoting, renderEngagement, renderSpreadButton, renderContentActions, renderSubscriptionBox, renderModuleStats, moduleIsEmpty } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderStyledHtml } = require("../backend/renderStyledText");
const { sanitizeHtml } = require("../backend/sanitizeHtml");

const userId = config.keys.id;

const FILTERS = [
  { key: "ALL", i18n: "blogFilterAll" },
  { key: "MINE", i18n: "blogFilterMine" },
  { key: "RECENT", i18n: "blogFilterRecent" },
  { key: "FAVORITES", i18n: "blogFilterFavorites" },
  { key: "TOP", i18n: "blogFilterTop" }
];

const safeText = (v) => String(v == null ? "" : v).trim();

const excerpt = (text, max = 420) => {
  const s = safeText(text);
  return s.length > max ? s.slice(0, max) + "…" : s;
};

const renderFilterBar = (filter, q, showSearch = true, total = null, censusList = null) => {
  const emptyMod = total !== null && moduleIsEmpty({ length: Number(total) || 0 }, filter, "ALL", q);
  const censusB = Array.isArray(censusList) ? censusList : [];
  const blogChip = (x) => {
    const m = x.key;
    if (m === filter || m === "ALL") return true;
    if (m === "TOP") return censusB.length > 0;
    if (m === "MINE") return censusB.some(b => String(b.author) === String(userId));
    if (m === "RECENT") return censusB.some(b => (Date.parse(b.createdAt || "") || 0) >= Date.now() - 86400000);
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
    div({ class: "card-header activity-card-header" },
      renderContentActions(blog.id, href, { spread: spreadInfo || null, author: blog.author, favKind: 'blogs', isFavorite: blog.isFavorite, reportTitle: blog.subject || blog.text })
    ),
    div({ class: "card-section blog-card-body" },
      blog.subject
        ? div({ class: "shop-title-row" },
            h2({ class: "tribe-card-title" }, a({ href }, blog.subject))
          )
        : null,
      div({ class: "blog-card-text", innerHTML: sanitizeHtml(renderStyledHtml(excerpt(blog.text))) }),
      p({ class: "card-footer" },
        span({ class: "date-link" }, `${moment(blog.createdAt).format("YYYY/MM/DD HH:mm")}`),
        userLink(blog.author)
      )
    )
  );
};

const renderCreateForm = () =>
  section(
    div({ class: "publish-form" },
      form({ action: "/blogs/create", method: "POST", enctype: "multipart/form-data" },
        label({ for: "subject" }, i18n.blogSubject),
        br(),
        input({ type: "text", name: "subject", id: "subject", maxlength: "150", placeholder: i18n.contentWarningPlaceholder }),
        br(),
        br(),
        label({ for: "text" }, i18n.blogMessage),
        br(),
        textarea({ required: true, name: "text", id: "text", rows: "8", class: "publish-textarea", maxlength: "7000", placeholder: i18n.publishWarningPlaceholder }),
        br(),
        br(),
        label({ for: "blob" }, i18n.blogMedia),
        br(),
        input({ type: "file", id: "blob", name: "blob", multiple: true, accept: "image/*,video/*,audio/*,application/pdf" }),
        br(),
        br(),
        div({ class: "blog-allow-comments" },
          input({ type: "hidden", name: "allowComments", value: "0" }),
          label(
            input({ type: "checkbox", name: "allowComments", value: "1", checked: true }),
            " ",
            i18n.blogAllowComments
          )
        ),
        br(),
        button({ type: "submit" }, i18n.blogPublish)
      )
    )
  );

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
        p(i18n.blogDescription),
        (() => { const { renderReachChip } = require('./clearnet_view'); return params && params.viewerPrefs ? renderReachChip(params.viewerPrefs.clearnetPosts === true, i18n, `/c/inhabitant/${encodeURIComponent((params && params.viewerId) || '')}`) : null; })()
      )
    ),
    renderFilterBar(showForm ? "CREATE" : filter, params.q, !showForm, Array.isArray(blogs) ? blogs.length : 0, params.censusList),
    showForm
      ? renderCreateForm()
      : section(
          blogs.length
            ? div({ class: "blogs-grid" }, ...blogs.map(b => renderBlogCard(b, filter, spreadMap.get(b.id))))
            : div({ class: "no-content-box" }, p({ class: "no-content" }, i18n.blogNoItems))
        )
  );
};

exports.singleBlogView = async (blog, comments = [], params = {}) => {
  const href = `/blogs/${encodeURIComponent(blog.id)}`;
  const isAuthor = String(blog.author) === String(userId);

  const blogSide = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(blog.id, null, { spread: params.spreads || null, author: blog.author, favKind: 'blogs', isFavorite: blog.isFavorite, reportTitle: blog.subject || blog.text })
    ),
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, blog.subject || i18n.blogTitle)
    ),
    table({ class: "tribe-info-table jobs-info-table" },
      tr(
        td({ class: "tribe-info-label" }, i18n.createdAtLabel || "Created at"),
        td({ class: "tribe-info-value", colspan: "3" }, moment(blog.createdAt).format("YYYY/MM/DD HH:mm"))
      ),
      tr(
        td({ class: "tribe-info-value", colspan: "4" }, userLink(blog.author))
      )
    ),
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
      div({ class: "blog-detail-text", innerHTML: sanitizeHtml(renderStyledHtml(blog.text || "")) })
    ),
    renderEngagement(blog.id,
      renderOpinionsVoting('/blogs/opinions', blog.id, blog.opinions, href, blog.opinions_inhabitants),
      renderCommentsSection(blog, comments)
    )
  );

  return template(
    blog.subject || i18n.blogTitle,
    section(div({ class: "tags-header module-header-line" }, h2(i18n.blogTitle), p(i18n.blogDescription))),
    renderFilterBar("ALL", params.q, false, null, params.censusList),
    section(div({ class: "tribe-details" }, blogSide, blogMain))
  );
};
