const { div, h2, p, section, button, form, a, textarea, br, input, table, tr, th, td, label, span } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderOpenClosedChip, renderLifespanChip, renderEcoTax, renderSpreadButton } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const opinionCategories = require("../backend/opinion_categories");
const { renderUrl } = require("../backend/renderUrl");

const userId = config.keys.id;

const safeArray = (v) => Array.isArray(v) ? v : [];

const voteLabel = (opt) =>
  i18n["vote" + opt.split("_").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join("")] || opt;

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

const renderVoteButtons = (v, voteOptions, firstRow, secondRow, returnTo) => {
  if (normalizeStatus(v.status) !== "OPEN") return null;

  const allOptions = [...firstRow, ...secondRow];
  return div(
    { class: "vote-buttons-block" },
    div(
      { class: "vote-buttons-row-single" },
      ...allOptions.map((opt) =>
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

const renderVoteStatusChip = (status) => {
  const localized = statusLabel(status);
  return renderOpenClosedChip(status, { statusChipOPEN: localized, statusChipCLOSED: localized });
};

const renderVoteListItem = (v, voteOptions, activeFilter, spreadInfo) => {
  const baseCounts = voteOptions.reduce((acc, opt) => {
    acc[opt] = (v.votes && v.votes[opt]) ? v.votes[opt] : 0;
    return acc;
  }, {});
  const maxOpt = voteOptions
    .filter((opt) => opt !== "FOLLOW_MAJORITY")
    .reduce((top, opt) => baseCounts[opt] > baseCounts[top] ? opt : top, "NOT_INTERESTED");
  const totalVotesNum = typeof v.totalVotes === "number" ? v.totalVotes : parseInt(String(v.totalVotes || "0"), 10) || 0;
  const result = totalVotesNum === 0 ? "NOT_INTERESTED" : maxOpt;
  const chips = [
    renderVoteStatusChip(v.status),
    renderLifespanChip(v.lifetime, i18n)
  ].filter(Boolean);

  return div({ class: "tribe-card vote-card" },
    div({ class: "tribe-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" },
          a({ href: `/votes/${encodeURIComponent(v.id)}` }, v.question || i18n.votationsTitle)
        )
      ),
      chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
      v.deadline ? p({ class: "card-date-highlight" }, moment(v.deadline).format("YYYY/MM/DD HH:mm")) : null,
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.eventAttendees}: ${totalVotesNum}`)
      ),
      totalVotesNum > 0
        ? div({ class: "job-meta-line" }, voteLabel(result))
        : null,
      div({ class: "card-spread-centered" }, renderSpreadButton(v.id, spreadInfo)),
      div({ class: "card-visit-btn-centered" },
        form({ method: "GET", action: `/votes/${encodeURIComponent(v.id)}` },
          input({ type: "hidden", name: "filter", value: activeFilter || "all" }),
          button({ type: "submit", class: "filter-btn" }, i18n.viewVotation || "View Votation")
        )
      )
    )
  );
};

const renderVoteDetail = (v, voteOptions, firstRow, secondRow, mode, activeFilter, params = {}) => {
  const baseCounts = voteOptions.reduce((acc, opt) => {
    acc[opt] = (v.votes && v.votes[opt]) ? v.votes[opt] : 0;
    return acc;
  }, {});

  const maxOpt = voteOptions
    .filter((opt) => opt !== "FOLLOW_MAJORITY")
    .reduce((top, opt) => baseCounts[opt] > baseCounts[top] ? opt : top, "NOT_INTERESTED");

  const totalVotesNum = typeof v.totalVotes === "number" ? v.totalVotes : parseInt(String(v.totalVotes || "0"), 10) || 0;
  const result = totalVotesNum === 0 ? "NOT_INTERESTED" : maxOpt;

  const returnTo = `/votes/${encodeURIComponent(v.id)}?filter=${encodeURIComponent(activeFilter || "all")}`;
  const chips = [
    renderVoteStatusChip(v.status),
    renderLifespanChip(v.lifetime, i18n),
    renderEcoTax(v.msgSize, v.id)
  ].filter(Boolean);

  const sideActions = [];
  if (v.createdBy && v.createdBy !== userId) {
    sideActions.push(form({ method: "GET", action: "/pm" },
      input({ type: "hidden", name: "recipients", value: v.createdBy }),
      button({ type: "submit", class: "filter-btn" }, i18n.privateMessage)
    ));
  }
  for (const a of renderVoteOwnerActions(v, returnTo, mode || "")) sideActions.push(a);

  const tagsNode = v.tags && v.tags.filter(Boolean).length
    ? div({ class: "card-tags" },
        v.tags.filter(Boolean).map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
      )
    : null;

  const infoRows = [];
  const pushRow = (labelText, valueNode) =>
    infoRows.push(tr(
      td({ class: "tribe-info-label" }, labelText),
      td({ class: "tribe-info-value" }, valueNode)
    ));
  if (v.deadline) pushRow(i18n.voteDeadline, moment(v.deadline).format("YYYY/MM/DD HH:mm"));
  pushRow(i18n.voteStatus, statusLabel(v.status));

  const voteSide = div({ class: "tribe-side" },
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, v.question)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    div({ class: "card-spread-centered" }, renderSpreadButton(v.id, params.spreads)),
    table({ class: "tribe-info-table jobs-info-table" }, ...infoRows),
    tagsNode,
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.eventAttendees}: ${totalVotesNum}`)
    )
  );

  const voteButtonsNode = renderVoteButtons(v, voteOptions, firstRow, secondRow, returnTo);

  const voteMain = div({ class: "tribe-main" },
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null,
    voteButtonsNode
      ? div({ class: "job-section" },
          h2({ class: "job-section-title" }, i18n.voteCastTitle || "Cast Vote"),
          voteButtonsNode
        )
      : null,
    div({ class: "job-section" },
      h2({ class: "job-section-title" }, i18n.voteResults || "Results"),
      div({ class: "vote-table" },
        table(
          tr(...voteOptions.map((opt) => th(voteLabel(opt)))),
          tr(...voteOptions.map((opt) => td(baseCounts[opt])))
        )
      ),
      totalVotesNum > 0
        ? p({ class: "job-price-line card-salary" }, voteLabel(result))
        : null
    ),
    renderOpinionsBar(v, returnTo),
    p({ class: "card-footer" },
      span({ class: "date-link" }, `${moment(v.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
      userLink(v.createdBy)
    )
  );

  return div({ class: "tribe-details" }, voteSide, voteMain);
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
        { method: "POST", action: `/votes/${encodeURIComponent(voteId)}/comments`, class: "comment-form", enctype: "multipart/form-data" },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
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

exports.voteView = async (votes, mode, voteId, comments = [], activeFilterParam, params = {}) => {
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
        : mode === "detail" && voteId
          ? renderVoteDetail(filtered[0] || list.find(v => v.id === voteId) || {}, voteOptions, firstRow, secondRow, mode, activeFilter, params)
          : filtered.length > 0
            ? div({ class: "jobs-grid" }, filtered.map((v) => renderVoteListItem(v, voteOptions, activeFilter, params.spreadMap && params.spreadMap.get(v.id))))
            : p(i18n.novotes),
      (mode === "detail" && voteId) ? renderCommentsSection(voteId, comments, activeFilter) : null
    )
  );
};

