const { div, h2, p, section, button, form, a, textarea, br, input, table, tr, th, td, label, span } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const opinionCategories = require("../backend/opinion_categories");
const { renderUrl } = require("../backend/renderUrl");

const userId = config.keys.id;

const safeArray = (v) => Array.isArray(v) ? v : [];

const voteLabel = (opt) =>
  i18n["vote" + opt.split("_").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join("")] || opt;

const toValueChildren = (v) => {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return renderUrl(v);
  if (typeof v === "number" || typeof v === "boolean") return renderUrl(String(v));
  return [v];
};

const renderCardField = (labelText, valueNode) =>
  div(
    { class: "card-field" },
    span({ class: "card-label" }, labelText),
    span({ class: "card-value" }, ...toValueChildren(valueNode))
  );

const normalizeStatus = (v) => {
  const up = String(v || "").toUpperCase();
  if (up === "OPEN" || up === "CLOSED") return up;
  return up || "OPEN";
};

const statusLabel = (s) => {
  const up = normalizeStatus(s);
  if (up === "OPEN") return i18n.voteStatusOpen || i18n.voteFilterOpen || "OPEN";
  if (up === "CLOSED") return i18n.voteStatusClosed || i18n.voteFilterClosed || "CLOSED";
  return up;
};

const renderVoteOwnerActions = (v, returnTo, mode) => {
  const showUpdateButton = mode === "mine" && !Object.keys(v.opinions || {}).length;
  const showDeleteButton = mode === "mine";

  const actions = [];
  if (showUpdateButton) {
    actions.push(
      form(
        { method: "GET", action: `/votes/edit/${encodeURIComponent(v.id)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ class: "update-btn", type: "submit" }, i18n.voteUpdateButton)
      )
    );
  }
  if (showDeleteButton) {
    actions.push(
      form(
        { method: "POST", action: `/votes/delete/${encodeURIComponent(v.id)}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button({ class: "delete-btn", type: "submit" }, i18n.voteDeleteButton)
      )
    );
  }
  return actions;
};

const renderVotePMActions = (v) => {
  if (!v.createdBy || v.createdBy === userId) return [];
  return [
    form(
      { method: "GET", action: "/pm" },
      input({ type: "hidden", name: "recipients", value: v.createdBy }),
      button({ type: "submit", class: "filter-btn" }, i18n.privateMessage)
    )
  ];
};

const renderVoteTopbar = (v, activeFilter, opts = {}) => {
  const isSingle = !!opts.single;
  const currentFilter = activeFilter || "all";

  const returnToList = `/votes?filter=${encodeURIComponent(currentFilter)}`;
  const returnToSelf = `/votes/${encodeURIComponent(v.id)}?filter=${encodeURIComponent(currentFilter)}`;
  const rt = isSingle ? returnToSelf : returnToList;

  const leftActions = [];

  if (!isSingle) {
    leftActions.push(
      form(
        { method: "GET", action: `/votes/${encodeURIComponent(v.id)}` },
        input({ type: "hidden", name: "filter", value: currentFilter }),
        button({ class: "filter-btn", type: "submit" }, i18n.viewDetails)
      )
    );
  }

  leftActions.push(...renderVotePMActions(v));

  const ownerActions = renderVoteOwnerActions(v, rt, opts.mode || "");
  const rightActions = [];
  if (ownerActions.length) rightActions.push(...ownerActions);

  const leftNode = leftActions.length ? div({ class: "bookmark-topbar-left" }, ...leftActions) : null;
  const rightNode = rightActions.length ? div({ class: "bookmark-actions vote-actions" }, ...rightActions) : null;

  const nodes = [];
  if (leftNode) nodes.push(leftNode);
  if (rightNode) nodes.push(rightNode);

  return nodes.length ? div({ class: isSingle ? "bookmark-topbar vote-topbar-single" : "bookmark-topbar" }, ...nodes) : null;
};

const renderVoteButtons = (v, voteOptions, firstRow, secondRow, returnTo) => {
  if (normalizeStatus(v.status) !== "OPEN") return null;

  return div(
    { class: "vote-buttons-block" },
    div(
      { class: "vote-buttons-row" },
      ...firstRow.map((opt) =>
        form(
          { method: "POST", action: `/votes/vote/${encodeURIComponent(v.id)}` },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          button({ type: "submit", name: "choice", value: opt }, voteLabel(opt))
        )
      )
    ),
    div(
      { class: "vote-buttons-row" },
      ...secondRow.map((opt) =>
        form(
          { method: "POST", action: `/votes/vote/${encodeURIComponent(v.id)}` },
          input({ type: "hidden", name: "returnTo", value: returnTo }),
          button({ type: "submit", name: "choice", value: opt }, voteLabel(opt))
        )
      )
    )
  );
};

const renderOpinionsBar = (v, returnTo) =>
  div(
    { class: "voting-buttons" },
    opinionCategories.map((category) =>
      form(
        { method: "POST", action: `/votes/opinions/${encodeURIComponent(v.id)}/${category}` },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        button(
          { class: "vote-btn", type: "submit" },
          `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${(v.opinions && v.opinions[category]) ? v.opinions[category] : 0}]`
        )
      )
    )
  );

const renderVoteCard = (v, voteOptions, firstRow, secondRow, mode, activeFilter) => {
  const baseCounts = voteOptions.reduce((acc, opt) => {
    acc[opt] = (v.votes && v.votes[opt]) ? v.votes[opt] : 0;
    return acc;
  }, {});

  const maxOpt = voteOptions
    .filter((opt) => opt !== "FOLLOW_MAJORITY")
    .reduce((top, opt) => baseCounts[opt] > baseCounts[top] ? opt : top, "NOT_INTERESTED");

  const totalVotesNum = typeof v.totalVotes === "number" ? v.totalVotes : parseInt(String(v.totalVotes || "0"), 10) || 0;
  const result = totalVotesNum === 0 ? "NOT_INTERESTED" : maxOpt;

  const commentCount = typeof v.commentCount === "number" ? v.commentCount : 0;
  const showCommentsSummaryInCard = mode !== "detail";

  const listReturnTo = `/votes?filter=${encodeURIComponent(activeFilter || "all")}`;
  const detailReturnTo = `/votes/${encodeURIComponent(v.id)}?filter=${encodeURIComponent(activeFilter || "all")}`;
  const returnTo = mode === "detail" ? detailReturnTo : listReturnTo;

  const topbar = renderVoteTopbar(v, activeFilter, { single: mode === "detail", mode });

  return div(
    { class: "card card-section vote" },
    topbar ? topbar : null,
    renderCardField(i18n.voteQuestionLabel + ":", v.question),
    renderCardField(i18n.voteDeadline + ":", v.deadline ? moment(v.deadline).format("YYYY/MM/DD HH:mm:ss") : ""),
    renderCardField(i18n.voteStatus + ":", statusLabel(v.status)),
    br(),
    renderVoteButtons(v, voteOptions, firstRow, secondRow, returnTo),
    renderCardField(i18n.voteTotalVotes + ":", totalVotesNum),
    br(),
    div(
      { class: "vote-table" },
      table(
        tr(...voteOptions.map((opt) => th(voteLabel(opt)))),
        tr(...voteOptions.map((opt) => td(baseCounts[opt])))
      )
    ),
    renderCardField(
      i18n.voteBreakdown + ":",
      span(
        voteLabel(result), " = ", String(baseCounts[result] || 0),
        " + ", voteLabel("FOLLOW_MAJORITY"), ": ", String(baseCounts.FOLLOW_MAJORITY || 0)
      )
    ),
    br(),
    div({ class: "vote-buttons-row" }, h2(voteLabel(result))),
    v.tags && v.tags.filter(Boolean).length
      ? div(
          { class: "card-tags" },
          v.tags.filter(Boolean).map((tag) =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
          )
        )
      : null,
    showCommentsSummaryInCard
      ? div(
          { class: "card-comments-summary" },
          span({ class: "card-label" }, i18n.voteCommentsLabel + ":"),
          span({ class: "card-value" }, String(commentCount)),
          br(),
          br(),
          form(
            { method: "GET", action: `/votes/${encodeURIComponent(v.id)}` },
            input({ type: "hidden", name: "filter", value: activeFilter || "all" }),
            button({ type: "submit", class: "filter-btn" }, i18n.voteCommentsForumButton)
          )
        )
      : null,
    br(),
    p(
      { class: "card-footer" },
      span({ class: "date-link" }, `${moment(v.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
      a({ href: `/author/${encodeURIComponent(v.createdBy)}`, class: "user-link" }, `${v.createdBy}`)
    ),
    renderOpinionsBar(v, returnTo)
  );
};

const renderCommentsSection = (voteId, comments, activeFilter) => {
  const commentsCount = Array.isArray(comments) ? comments.length : 0;
  const returnTo = `/votes/${encodeURIComponent(voteId)}?filter=${encodeURIComponent(activeFilter || "all")}`;

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
        { method: "POST", action: `/votes/${encodeURIComponent(voteId)}/comments`, class: "comment-form" },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
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
    comments && comments.length
      ? div(
          { class: "comments-list" },
          comments.map((c) => {
            const author = c.value && c.value.author ? c.value.author : "";
            const ts = c.value && c.value.timestamp ? c.value.timestamp : c.timestamp;
            const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm:ss") : "";
            const relDate = ts ? moment(ts).fromNow() : "";
            const userName = author && author.includes("@") ? author.split("@")[1] : author;

            const content = c.value && c.value.content ? c.value.content : {};
            const root = content.fork || content.root || "";
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
                relDate && root ? a({ href: `/thread/${encodeURIComponent(root)}#${encodeURIComponent(c.key)}` }, relDate) : ""
              ),
              p({ class: "votations-comment-text" }, ...renderUrl(String(text)))
            );
          })
        )
      : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet)
  );
};

exports.voteView = async (votes, mode, voteId, comments = [], activeFilterParam) => {
  const list = Array.isArray(votes) ? votes : [votes];

  const standardFilters = ["all", "mine", "open", "closed"];
  const activeFilter = standardFilters.includes(activeFilterParam)
    ? activeFilterParam
    : (standardFilters.includes(mode) ? mode : "all");

  const title =
    mode === "mine" ? i18n.voteMineSectionTitle :
    mode === "create" ? i18n.voteCreateSectionTitle :
    mode === "edit" ? i18n.voteUpdateSectionTitle :
    mode === "open" ? i18n.voteOpenTitle :
    mode === "closed" ? i18n.voteClosedTitle :
    mode === "detail" ? (i18n.voteDetailSectionTitle || i18n.voteAllSectionTitle) :
    i18n.voteAllSectionTitle;

  const voteToEdit = list.find((v) => v.id === voteId) || {};
  const editTags = Array.isArray(voteToEdit.tags) ? voteToEdit.tags.filter(Boolean) : [];

  let filtered =
    mode === "mine" ? list.filter((v) => v.createdBy === userId) :
    mode === "open" ? list.filter((v) => normalizeStatus(v.status) === "OPEN") :
    mode === "closed" ? list.filter((v) => normalizeStatus(v.status) === "CLOSED") :
    list;

  filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const voteOptions = ["ABSTENTION", "YES", "NO", "CONFUSED", "FOLLOW_MAJORITY", "NOT_INTERESTED"];
  const firstRow = ["ABSTENTION", "YES", "NO"];
  const secondRow = ["CONFUSED", "FOLLOW_MAJORITY", "NOT_INTERESTED"];

  const header = div(
    { class: "tags-header" },
    h2(i18n.votationsTitle),
    p(i18n.votationsDescription)
  );

  const listReturnTo = standardFilters.includes(activeFilter) ? `/votes?filter=${encodeURIComponent(activeFilter)}` : "/votes";

  const deadlineMin = moment().add(1, "minute").format("YYYY-MM-DDTHH:mm");
  const deadlineValue = voteToEdit.deadline ? moment(voteToEdit.deadline).format("YYYY-MM-DDTHH:mm") : "";

  return template(
    title,
    section(
      header,
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/votes" },
          button({ type: "submit", name: "filter", value: "all", class: mode === "all" ? "filter-btn active" : "filter-btn" }, i18n.voteFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: mode === "mine" ? "filter-btn active" : "filter-btn" }, i18n.voteFilterMine),
          button({ type: "submit", name: "filter", value: "open", class: mode === "open" ? "filter-btn active" : "filter-btn" }, i18n.voteFilterOpen),
          button({ type: "submit", name: "filter", value: "closed", class: mode === "closed" ? "filter-btn active" : "filter-btn" }, i18n.voteFilterClosed),
          button({ type: "submit", name: "filter", value: "create", class: mode === "create" ? "create-button active" : "create-button" }, i18n.voteCreateButton)
        )
      )
    ),
    section(
      (mode === "edit" || mode === "create")
        ? div(
            { class: "vote-form" },
            form(
              { action: mode === "edit" ? `/votes/update/${encodeURIComponent(voteId)}` : "/votes/create", method: "POST" },
              input({ type: "hidden", name: "returnTo", value: listReturnTo }),
              h2(i18n.voteQuestionLabel),
              input({ type: "text", name: "question", id: "question", required: true, value: voteToEdit.question || "" }), br(), br(),
              label(i18n.voteDeadlineLabel), br(),
              input({
                type: "datetime-local",
                name: "deadline",
                id: "deadline",
                required: true,
                min: mode === "create" ? deadlineMin : undefined,
                value: deadlineValue
              }), br(), br(),
              label(i18n.voteTagsLabel), br(),
              input({ type: "text", name: "tags", id: "tags", value: editTags.join(", ") }), br(), br(),
              button({ type: "submit" }, mode === "edit" ? i18n.voteUpdateButton : i18n.voteCreateButton)
            )
          )
        : div(
            { class: "vote-list" },
            filtered.length > 0
              ? filtered.map((v) => renderVoteCard(v, voteOptions, firstRow, secondRow, mode, activeFilter))
              : p(i18n.novotes)
          ),
      (mode === "detail" && voteId) ? renderCommentsSection(voteId, comments, activeFilter) : null
    )
  );
};

