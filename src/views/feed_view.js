const { div, h2, p, section, button, form, a, span, textarea, br, input, h1 } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("./main_views");
const { config } = require("../server/SSB_server.js");
const { renderTextWithStyles } = require("../backend/renderTextWithStyles");
const opinionCategories = require("../backend/opinion_categories");

const normalizeOptions = (opts) => {
  if (typeof opts === "string") return { filter: String(opts || "ALL").toUpperCase(), q: "", tag: "" };
  if (!opts || typeof opts !== "object") return { filter: "ALL", q: "", tag: "" };
  return {
    filter: String(opts.filter || "ALL").toUpperCase(),
    q: typeof opts.q === "string" ? opts.q : "",
    tag: typeof opts.tag === "string" ? opts.tag : ""
  };
};

const formatDate = (feed) => {
  const ts = feed?.value?.timestamp || Date.parse(feed?.value?.content?.createdAt || "") || 0;
  return ts ? new Date(ts).toLocaleString() : "";
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
      button({ type: "submit", class: cur === mode ? "filter-btn active" : "filter-btn" }, i18n[mode + "Button"] || mode)
    )
  );
};

const renderVotesSummary = (opinions = {}) => {
  const entries = Object.entries(opinions).filter(([, v]) => Number(v) > 0);
  if (!entries.length) return null;
  entries.sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0])));
  return div(
    { class: "votes" },
    entries.map(([category, count]) => span({ class: "vote-category" }, `${category}: ${count}`))
  );
};

const renderTagChips = (tags = []) => {
  const list = Array.isArray(tags) ? tags : [];
  if (!list.length) return null;
  return div(
    { class: "tag-chips" },
    list.map((t) => a({ class: "tag-chip", href: `/feed?tag=${encodeURIComponent(t)}` }, `#${t}`))
  );
};

const renderFeedCard = (feed) => {
  const content = feed.value.content || {};
  const voteEntries = Object.entries(content.opinions || {});
  const totalCount = voteEntries.reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
  const createdAt = formatDate(feed);
  const me = config?.keys?.id;

  const alreadyRefeeded = Array.isArray(content.refeeds_inhabitants) && me ? content.refeeds_inhabitants.includes(me) : false;
  const alreadyVoted = Array.isArray(content.opinions_inhabitants) && me ? content.opinions_inhabitants.includes(me) : false;

  const tags = Array.isArray(content.tags) && content.tags.length ? content.tags : extractTags(content.text);

  const authorId = content.author || feed.value.author || "";

  return div(
    { class: "feed-card" },
    div(
      { class: "feed-row" },
      div(
        { class: "refeed-column" },
        h1(`${content.refeeds || 0}`),
        form(
          { method: "POST", action: `/feed/refeed/${encodeURIComponent(feed.key)}` },
          button({ class: alreadyRefeeded ? "refeed-btn active" : "refeed-btn", type: "submit", disabled: !!alreadyRefeeded }, i18n.refeedButton)
        ),
        alreadyRefeeded ? p({ class: "muted" }, i18n.alreadyRefeeded) : null
      ),
      div(
        { class: "feed-main" },
        div({ class: "feed-text", innerHTML: renderTextWithStyles(content.text || "") }),
        renderTagChips(tags),
        h2(`${i18n.totalOpinions}: ${totalCount}`),
        p(
          { class: "card-footer" },
          span({ class: "date-link" }, `${createdAt} ${i18n.performed} `),
          a({ href: `/author/${encodeURIComponent(authorId)}`, class: "user-link" }, `${authorId}`),
          content._textEdited ? span({ class: "edited-badge" }, ` · ${i18n.edited || "edited"}`) : null
        )
      )
    ),
    div(
      { class: "votes-wrapper" },
      renderVotesSummary(content.opinions || {}),
      div(
        { class: "voting-buttons" },
        opinionCategories.map((cat) =>
          form(
            { method: "POST", action: `/feed/opinions/${encodeURIComponent(feed.key)}/${cat}` },
            button(
              { class: alreadyVoted ? "vote-btn disabled" : "vote-btn", type: "submit", disabled: !!alreadyVoted },
              `${i18n["vote" + cat.charAt(0).toUpperCase() + cat.slice(1)] || cat} [${content.opinions?.[cat] || 0}]`
            )
          )
        )
      ),
      alreadyVoted ? p({ class: "muted" }, i18n.alreadyVoted) : null
    )
  );
};

exports.feedView = (feeds, opts = "ALL") => {
  const { filter, q, tag } = normalizeOptions(opts);

  const title =
    filter === "MINE"
      ? i18n.MINEButton
      : filter === "TODAY"
        ? i18n.TODAYButton
        : filter === "TOP"
          ? i18n.TOPButton
          : filter === "CREATE"
            ? i18n.createFeedTitle
            : tag
              ? `${i18n.filteredByTag || i18n.filteredByTagTitle || "Filtered by tag"}: #${tag}`
              : q
                ? `${i18n.searchTitle || "Search"}: “${q}”`
                : i18n.feedTitle;

  const header = div({ class: "tags-header" }, h2(title), p(i18n.FeedshareYourOpinions));

  const extra = { q, tag };

  return template(
    title,
    section(
      header,
      div(
        { class: "mode-buttons-row" },
        ...generateFilterButtons(["ALL", "MINE", "TODAY", "TOP"], filter, "/feed", extra),
        form({ method: "GET", action: "/feed/create" }, button({ type: "submit", class: "create-button filter-btn" }, i18n.createFeedTitle || "Create Feed"))
      ),
	div(
	  { class: "feed-tools-row" },
	  form(
	    { method: "GET", action: "/feed", class: "feed-search-form" },
	    input({ type: "hidden", name: "filter", value: filter }),
	    tag ? input({ type: "hidden", name: "tag", value: tag }) : null,
	    input({ type: "text", name: "q", value: q, placeholder: i18n.searchPlaceholder || "Search", class: "feed-search-input" }),
	    button({ type: "submit", class: "filter-btn feed-search-btn" }, i18n.searchButton || "Search")
	  )
	),
      section(
        filter === "CREATE"
          ? form(
              { method: "POST", action: "/feed/create" },
              textarea({ name: "text", placeholder: i18n.feedPlaceholder, maxlength: 280, rows: 4, cols: 50 }),
              br(),
              button({ type: "submit", class: "create-button" }, i18n.createFeedButton)
            )
          : feeds && feeds.length > 0
            ? div({ class: "feed-container" }, feeds.map((feed) => renderFeedCard(feed)))
            : div({ class: "no-results" }, p(i18n.noFeedsFound))
      )
    )
  );
};

exports.feedCreateView = (opts = {}) => {
  const { q, tag } = normalizeOptions(opts);

  return template(
    i18n.createFeedTitle,
    section(
      div({ class: "tags-header" }, h2(i18n.createFeedTitle), p(i18n.FeedshareYourOpinions)),
      div({ class: "mode-buttons-row" }, ...generateFilterButtons(["ALL", "MINE", "TODAY", "TOP"], "CREATE", "/feed", { q, tag })),
      form(
        { method: "POST", action: "/feed/create" },
        textarea({ name: "text", maxlength: "280", rows: 5, cols: 50, placeholder: i18n.feedPlaceholder }),
        br(),
        button({ type: "submit", class: "create-button" }, i18n.createFeedButton || "Send Feed!")
      )
    )
  );
};

