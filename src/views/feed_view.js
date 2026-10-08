const { div, h2, p, section, button, form, a, span, textarea, br, input, h1, label, img } = require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection, renderCommentsLink } = require("./comments_view");
const { clearnetItemHref, template, i18n, renderOpinionsVoting, userLink, renderContentActions, renderEngagement, renderModuleStats, moduleIsEmpty } = require("./main_views");
const { renderReachChip, renderClearnetSelector, renderClearnetSwitch, renderTribeOriginChip } = require("./clearnet_view");
const { config } = require("../server/SSB_server.js");
const { renderStyledHtml, renderStyledText } = require("../backend/renderStyledText");
const moment = require("../server/node_modules/moment");
const { sanitizeHtml } = require('../backend/sanitizeHtml');

const FEED_TEXT_MIN = Number(config?.feed?.minLength ?? 1);
const FEED_TEXT_MAX = Number(config?.feed?.maxLength ?? 280);

const normalizeOptions = (opts) => {
  if (typeof opts === "string") return { filter: String(opts || "ALL").toUpperCase(), q: "", tag: "", msg: "" };
  if (!opts || typeof opts !== "object") return { filter: "ALL", q: "", tag: "", msg: "" };
  return {
    filter: String(opts.filter || "ALL").toUpperCase(),
    q: typeof opts.q === "string" ? opts.q : "",
    tag: typeof opts.tag === "string" ? opts.tag : "",
    msg: typeof opts.msg === "string" ? opts.msg : ""
  };
};

const formatDate = (feed) => {
  const ts = feed?.value?.timestamp || Date.parse(feed?.value?.content?.createdAt || "") || 0;
  return ts ? moment(ts).format("YYYY/MM/DD HH:mm") : "";
};

const extractTags = (text) => {
  const list = (String(text || "").match(/#[A-Za-z0-9_]{1,32}/g) || []).map((t) => t.slice(1).toLowerCase());
  return Array.from(new Set(list));
};


const generateFilterButtons = (filters, currentFilter, action, extra = {}) => {
  const cur = String(currentFilter || "").toUpperCase();
  const hiddenInputs = (obj) =>
    Object.entries(obj)
      .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
      .map(([k, v]) => input({ type: "hidden", name: k, value: String(v) }));

  return filters.map((mode) =>
    form(
      { method: "GET", action },
      input({ type: "hidden", name: "filter", value: mode }),
      ...hiddenInputs(extra),
      button({ type: "submit", class: cur === mode ? "filter-btn active" : "filter-btn" }, String(i18n[mode + "Button"] || mode).toUpperCase())
    )
  );
};

const renderCardField = (labelText, value) =>
  div(
    { class: "card-field" },
    span({ class: "card-label" }, labelText),
    span({ class: "card-value" }, value)
  );

const renderFeedCommentsSection = (feedKey, comments = []) => {
  return renderSharedCommentsSection({
    action: `/feed/${encodeURIComponent(feedKey)}/comments`,
    comments: comments,
    returnTo: null,
    open: true
  });
};


const FEED_MEDIA_RE = /^\n?!?\[[^\]\n]{0,200}\]\(&[A-Za-z0-9+/=]{44}\.sha256\)$/;
const renderFeedComposer = ({ text = "", media = "", rows = 5, clearnet = false } = {}) => {
  const cleanMedia = FEED_MEDIA_RE.test(String(media || "")) ? String(media).trim() : "";
  const draft = String(text || "");
  const hasPreview = !!(draft.trim() || cleanMedia);
  const previewNodes = hasPreview ? renderStyledText(cleanMedia ? `${draft.trim()}\n${cleanMedia}` : draft.trim(), { zoomImages: true }) : [];
  return form(
    { method: "POST", action: "/feed/create", enctype: "multipart/form-data" },
    textarea({
      name: "text",
      required: true,
      minlength: String(FEED_TEXT_MIN),
      maxlength: String(FEED_TEXT_MAX),
      rows: String(rows),
      cols: 50,
      placeholder: i18n.feedPlaceholder
    }, draft),
    cleanMedia ? input({ type: "hidden", name: "media", value: cleanMedia }) : null,
    div({ class: "comment-file-upload" }, label(i18n.uploadMedia), input({ type: "file", name: "blob" })),
    hasPreview
      ? div({ class: "feed-preview" },
          h2({ class: "feed-preview-title" }, i18n.messagePreview || "Preview"),
          div({ class: "trending-card feed-card" }, div({ class: "feed-text" }, ...previewNodes))
        )
      : null,
    renderClearnetSelector(clearnet, i18n),
    div({ class: "feed-compose-actions" },
      button({ type: "submit", class: "filter-btn", formaction: "/feed/preview" }, i18n.preview || "Preview"),
      button({ type: "submit", class: "create-button" }, i18n.createFeedButton || "Send Feed!")
    )
  );
};

const renderFeedCard = exports.renderFeedCard = (feed, spreadMap = null, opts = {}) => {
    const content = feed.value.content || {};
    const rawText = typeof content.text === "string" ? content.text : "";
    const safeText = rawText.trim();
    if (!safeText) return null;

    const voteEntries = Object.entries(content.opinions || {});
    const totalCount = voteEntries.reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
    const createdAt = formatDate(feed);
    const me = config?.keys?.id;

    const alreadyRefeeded = Array.isArray(content.refeeds_inhabitants) && me ? content.refeeds_inhabitants.includes(me) : false;

    const authorId = content.author || feed.value.author || "";
    const signerId = feed.value.author || "";
    const refeedsNum = Number(content.refeeds || 0) || 0;
    const commentCount = Number(content.commentCount || 0);
    const styledNodes = renderStyledText(safeText, { zoomImages: true });
    const refeedAction = opts.refeedAction || `/feed/refeed/${encodeURIComponent(feed.key)}`;
    const canRefeed = opts.canRefeed !== false && !(authorId && String(authorId) === String(me));
    const headerActions = opts.headerActions !== undefined
        ? opts.headerActions
        : feed.tribeOrigin
            ? renderContentActions(null, feed.tribeOrigin.href)
            : renderContentActions(feed.key, `/feed/${encodeURIComponent(feed.key)}`, {
                author: authorId,
                spread: (spreadMap && spreadMap.get(feed.key)) || null,
                reportTitle: safeText,
                ...(((signerId && String(signerId) === String(me)) || (authorId && String(authorId) === String(me))) ? { deleteAction: `/feed/delete/${encodeURIComponent(feed.key)}` } : {})
            });
    const chipsRow = opts.chips !== undefined
        ? opts.chips
        : feed.tribeOrigin ? div({ class: "card-chips-row" }, renderTribeOriginChip(feed.tribeOrigin)) : feed.clearnet === true ? div({ class: "card-chips-row" }, renderReachChip(true, i18n, clearnetItemHref("feed", "", feed.key))) : null;
    const engagement = opts.engagement !== undefined
        ? opts.engagement
        : feed.tribeOrigin ? null : renderEngagement(feed.key,
            renderOpinionsVoting('/feed/opinions', feed.key, content.opinions, null, content.opinions_inhabitants),
            renderCommentsLink({ href: `/feed/${encodeURIComponent(feed.key)}`, count: commentCount })
        );

    return div(
        { class: "trending-card feed-card" + (authorId && String(authorId) === String(me) ? " own-content" : "") },
        div(
            { class: "card-header activity-card-header" },
            span(),
            headerActions
        ),
        div(
            { class: "card-section feed-card-body" },
        div(
            { class: "feed-row" },
            feed.tribeOrigin ? null : div(
                { class: "refeed-column" },
                h1(String(refeedsNum)),
                canRefeed
                    ? form(
                        { method: "POST", action: refeedAction },
                        button({ class: alreadyRefeeded ? "refeed-btn active" : "refeed-btn", type: "submit", title: i18n.refeedButton, "aria-label": i18n.refeedButton, ...(alreadyRefeeded ? { disabled: true } : {}) }, "ꕿ")
                    )
                    : null,
            ),
            div(
                { class: "feed-main" },
                div({ class: "feed-text" }, ...styledNodes),
                chipsRow,
                p(
                    { class: "card-footer" },
                    span({ class: "date-link" }, `${createdAt}`),
                    userLink(authorId),
                    content._textEdited ? span({ class: "edited-badge" }, ` · ${i18n.edited || "edited"}`) : null
                )
            )
        ),
        engagement
        )
    );
};

const renderFeedSideTags = (trendingTags) =>
  div({ class: "feed-side feed-side-right" },
    div({ class: "feed-side-box" },
      h2({ class: "feed-side-title" }, i18n.feedTrendingTitle || "Trending Tags"),
      trendingTags.length
        ? div({ class: "feed-side-tags" },
            trendingTags.map(t => a({ href: `/feed?tag=${encodeURIComponent(t.name || t)}`, class: "tag-link" }, `#${t.name || t}`)))
        : p({ class: "muted" }, "—")
    )
  );

const renderFeedSideUsers = (activeUsers) =>
  div({ class: "feed-side feed-side-left" },
    div({ class: "feed-side-box" },
      h2({ class: "feed-side-title" }, i18n.feedActiveTitle || "Active Inhabitants"),
      activeUsers.length
        ? div({ class: "feed-side-users" },
            activeUsers.map(u => div({ class: "feed-side-user" },
              img({ src: u.avatarUrl || "/assets/images/default-avatar.png", class: "feed-side-avatar" }),
              userLink(u.id)
            )))
        : p({ class: "muted" }, "—")
    )
  );

const feedChipFor = (filter, censusF) => (mode) => {
  if (mode === filter) return true;
  if (!Array.isArray(censusF)) return true;
  if (mode === "MINE") return censusF.some((f) => String(f && f.value && f.value.author) === String(config.keys.id));
  if (mode === "RECENT") return censusF.length > 0;
  return true;
};

exports.feedView = (feeds, opts = "ALL") => {
  const { filter, q, tag, msg } = normalizeOptions(opts);
  const workspace = !!(opts && typeof opts === "object" && opts.workspace) && require("../configs/config-manager.js").getConfig().ux?.current === "feed";
  const spreadMap = (opts && typeof opts === "object" && opts.spreadMap instanceof Map) ? opts.spreadMap : null;
  const trendingTags = (opts && typeof opts === "object" && Array.isArray(opts.trendingTags)) ? opts.trendingTags : [];
  const activeUsers = (opts && typeof opts === "object" && Array.isArray(opts.activeUsers)) ? opts.activeUsers : [];

  const title =
    filter === "MINE"
      ? i18n.MINEButton
      : filter === "RECENT"
        ? i18n.RECENTButton
        : filter === "TOP"
          ? i18n.TOPButton
          : filter === "CREATE"
            ? i18n.createFeedTitle
            : tag
              ? `${i18n.filteredByTag || i18n.filteredByTagTitle || "Filtered by tag"}: #${tag}`
              : q
                ? `${i18n.searchTitle || "Search"}: “${q}”`
                : i18n.feedTitle;

  const header = div({ class: "tags-header module-header-line" }, h2(title), p(i18n.FeedshareYourOpinions));
  const successBanner = msg === 'feedPublished'
    ? div({ class: 'feed-success-msg' }, p('✓ ' + (i18n.feedPublishedSuccess || 'Feed published successfully!')))
    : null;

  const extra = { q, tag };
  const emptyMod = moduleIsEmpty(feeds, filter, "ALL", q || tag);
  const censusF = Array.isArray(opts.censusList) ? opts.censusList : feeds;
  const feedChip = feedChipFor(filter, censusF);

  const centerContent = section(
    header,
    successBanner,
    div(
      { class: "mode-buttons-row" },
      ...(emptyMod ? [] : generateFilterButtons(["RECENT", "MINE", "ALL", "TOP"].filter(feedChip), filter, "/feed", extra)),
      form({ method: "GET", action: "/feed/create" }, button({ type: "submit", class: "create-button filter-btn" }, i18n.createFeedTitle || "Create Feed"))
    ),
    emptyMod ? null : div(
      { class: "feed-tools-row activity-filter-chips activity-toolbar-row" },
        renderModuleStats(feeds.length),
      form(
        { method: "GET", action: "/feed", class: "filter-box" },
        input({ type: "hidden", name: "filter", value: filter }),
        tag ? input({ type: "hidden", name: "tag", value: tag }) : null,
        input({ type: "text", name: "q", value: q, placeholder: i18n.feedSearchPlaceholder || i18n.searchPlaceholder || "Search", class: "filter-box__input" }),
        div({ class: "filter-box__controls" },
          button({ type: "submit", class: "filter-box__button" }, i18n.searchButton || "Search")
        )
      )
    ),
    section(
      filter === "CREATE"
        ? renderFeedComposer({ rows: 4 })
        : feeds && feeds.length > 0
          ? div({ class: "feed-container" }, feeds.map((feed) => renderFeedCard(feed, spreadMap)).filter(Boolean))
          : div({ class: "no-results" }, p(i18n.noFeedsFound))
    )
  );

  if (workspace) {
    return template(
      title,
      div({ class: "feed-workspace" },
        renderFeedSideUsers(activeUsers),
        div({ class: "feed-workspace-center" }, centerContent),
        renderFeedSideTags(trendingTags)
      )
    );
  }

  return template(title, centerContent);
};

exports.feedCreateView = (opts = {}) => {
  const { q, tag } = normalizeOptions(opts);

  return template(
    i18n.createFeedTitle,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.createFeedTitle), p(i18n.FeedshareYourOpinions)),
      div({ class: "mode-buttons-row" }, ...generateFilterButtons(["ALL"], "CREATE", "/feed", { q, tag })),
      renderFeedComposer({ text: opts.text, media: opts.media, clearnet: opts.clearnet === true })
    )
  );
};

exports.singleFeedView = (feed, comments = [], params = {}) => {
  const feedChip = feedChipFor("ALL", Array.isArray(params.censusList) ? params.censusList : null);
  const content = feed.value?.content || {};
  const rawText = typeof content.text === "string" ? content.text : "";
  const safeText = rawText.trim();
  const authorId = content.author || feed.value?.author || "";
  const signerId = feed.value?.author || "";
  const createdAt = formatDate(feed);
  const styledNodes = renderStyledText(safeText, { zoomImages: true });
  const me = config?.keys?.id;
  const alreadyRefeeded = Array.isArray(content.refeeds_inhabitants) && me ? content.refeeds_inhabitants.includes(me) : false;
  const refeedsNum = Number(content.refeeds || 0) || 0;
  const tags = extractTags(safeText);
  const isClearnet = !!feed.clearnet;

  return template(
    i18n.feedDetailTitle || "Feed",
    section(div({ class: "tags-header module-header-line" }, h2(i18n.feedTitle), p(i18n.FeedshareYourOpinions))),
    section(
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/feed", class: "ui-toolbar ui-toolbar--filters" },
          ...(feedChip("RECENT") ? [button({ type: "submit", name: "filter", value: "RECENT", class: "filter-btn" }, i18n.RECENTButton || "RECENT")] : []),
          ...(feedChip("MINE") ? [button({ type: "submit", name: "filter", value: "MINE", class: "filter-btn" }, i18n.MINEButton || "MINE")] : []),
          button({ type: "submit", name: "filter", value: "ALL", class: "filter-btn" }, i18n.ALLButton || "ALL"),
          button({ type: "submit", name: "filter", value: "TOP", class: "filter-btn" }, i18n.TOPButton || "TOP"),
          form({ method: "GET", action: "/feed/create" }, button({ type: "submit", class: "create-button" }, i18n.createFeedTitle || "Create Feed"))
        )
      ),
      div(
        { class: "bookmark-item card feed-detail-card" },
        div({ class: "card-header activity-card-header" },
          span(),
          renderContentActions(feed.key, `/feed/${encodeURIComponent(feed.key)}`, {
            spread: params.spreads || null,
            author: authorId,
            reportTitle: safeText,
            ...(((signerId && String(signerId) === String(me)) || (authorId && String(authorId) === String(me))) ? { deleteAction: `/feed/delete/${encodeURIComponent(feed.key)}` } : {})
          })
        ),
        br,
        div(
          { class: "feed-row" },
          div(
            { class: "refeed-column" },
            h1(String(refeedsNum)),
            (authorId && String(authorId) === String(me))
              ? null
              : form(
                  { method: "POST", action: `/feed/refeed/${encodeURIComponent(feed.key)}` },
                  button({ class: alreadyRefeeded ? "refeed-btn active" : "refeed-btn", type: "submit", title: i18n.refeedButton, "aria-label": i18n.refeedButton, ...(alreadyRefeeded ? { disabled: true } : {}) }, "ꕿ")
              ),
          ),
          div(
            { class: "feed-main" },
            div({ class: "feed-text" }, ...styledNodes),
            tags.length
              ? div(
                  { class: "card-tags" },
                  tags.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
                )
              : null,
            div({ class: "card-chips-row" }, renderReachChip(isClearnet, i18n, isClearnet ? clearnetItemHref("feed", "", feed.key) : null)),
            authorId && String(authorId) === String(me) ? renderClearnetSwitch("feed", feed.rootId || feed.key, isClearnet) : null,
            br,
            p(
              { class: "card-footer" },
              span({ class: "date-link" }, `${createdAt}`),
              userLink(authorId),
              content._textEdited ? span({ class: "edited-badge" }, ` · ${i18n.edited || "edited"}`) : null
            )
          )
        )
      ),
      renderEngagement(feed.key,
        renderOpinionsVoting('/feed/opinions', feed.key, content.opinions, null, content.opinions_inhabitants),
        renderFeedCommentsSection(feed.key, comments)
      )
    )
  );
};

