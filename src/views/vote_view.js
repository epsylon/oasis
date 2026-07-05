const { div, h2, p, section, button, form, a, textarea, br, input, table, tr, th, td, label, span } = require("../server/node_modules/hyperaxe");
const { template, i18n, renderOpinionsVoting, userLink, renderOpenClosedChip, renderLifespanChip, renderEcoTax, renderSpreadButton, renderContentActions } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");

const userId = config.keys.id;
const VOTE_QUORUM = 2;

const safeArray = (v) => Array.isArray(v) ? v : [];

const voteLabel = (opt) =>
  i18n["vote" + opt.split("_").map(w => w.charAt(0) + w.slice(1).toLowerCase()).join("")] || opt;

const computeVoteOutcome = (baseCounts, voteOptions, totalVotesNum) => {
  const noResult = { text: i18n.voteNoQuorum || "NO QUORUM", color: "#ffcc00" };
  if (totalVotesNum < VOTE_QUORUM) return noResult;
  const opts = voteOptions.filter((o) => o !== "FOLLOW_MAJORITY");
  const maxCount = opts.reduce((m, o) => Math.max(m, baseCounts[o] || 0), 0);
  const topOpts = opts.filter((o) => (baseCounts[o] || 0) === maxCount);
  if (maxCount === 0 || topOpts.length > 1) return noResult;
  const winner = topOpts[0];
  const color = winner === "YES" ? "#4caf50" : winner === "NO" ? "#e53935" : "#ffcc00";
  return { text: voteLabel(winner), color };
};

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
  if (v.createdBy && String(v.createdBy) === String(userId)) return null;

  const allOptions = Array.isArray(v.options) && v.options.length ? v.options : [...firstRow, ...secondRow];
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
  renderOpinionsVoting('/votes/opinions', v.id, v.opinions, returnTo, v.opinions_inhabitants);

const renderVoteStatusChip = (status) => {
  const localized = statusLabel(status);
  return renderOpenClosedChip(status, { statusChipOPEN: localized, statusChipCLOSED: localized });
};

const renderVoteListItem = (v, voteOptionsDefault, activeFilter, spreadInfo) => {
  const voteOptions = Array.isArray(v.options) && v.options.length ? v.options : voteOptionsDefault;
  const baseCounts = voteOptions.reduce((acc, opt) => {
    acc[opt] = (v.votes && v.votes[opt]) ? v.votes[opt] : 0;
    return acc;
  }, {});
  const totalVotesNum = typeof v.totalVotes === "number" ? v.totalVotes : parseInt(String(v.totalVotes || "0"), 10) || 0;
  const outcome = computeVoteOutcome(baseCounts, voteOptions, totalVotesNum);
  const chips = [
    renderVoteStatusChip(v.status),
    renderLifespanChip(v.lifetime, i18n)
  ].filter(Boolean);
  const returnTo = `/votes?filter=${encodeURIComponent(activeFilter || "all")}`;
  const totalOpinions = Object.values(v.opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0);
  const isOwn = v.createdBy && String(v.createdBy) === String(userId);

  return div({ class: "trending-card vote-card" + (isOwn ? " own-content" : "") },
    div({ class: "card-header activity-card-header" },
      span(),
      renderContentActions(v.id, `/votes/${encodeURIComponent(v.id)}`)
    ),
    div({ class: "card-section vote-card-body" },
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
      div({ class: "job-meta-line", style: `color:${outcome.color};font-weight:bold;` }, `${i18n.voteResults || "Results"}: ${outcome.text}`),
      div({ class: "card-spread-centered" }, renderSpreadButton(v.id, spreadInfo))
    )
  );
};

const renderVoteDetail = (v, voteOptionsDefault, firstRow, secondRow, mode, activeFilter, params = {}) => {
  const voteOptions = Array.isArray(v.options) && v.options.length ? v.options : voteOptionsDefault;
  const baseCounts = voteOptions.reduce((acc, opt) => {
    acc[opt] = (v.votes && v.votes[opt]) ? v.votes[opt] : 0;
    return acc;
  }, {});

  const totalVotesNum = typeof v.totalVotes === "number" ? v.totalVotes : parseInt(String(v.totalVotes || "0"), 10) || 0;
  const outcome = computeVoteOutcome(baseCounts, voteOptions, totalVotesNum);

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

  const cleanTags = (Array.isArray(v.tags) ? v.tags : []).filter((t) => t && !String(t).includes(":"));
  const tagsNode = cleanTags.length
    ? div({ class: "card-tags" },
        cleanTags.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
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
    ),
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null
  );

  const voteButtonsNode = renderVoteButtons(v, voteOptions, firstRow, secondRow, returnTo);

  const voteMain = div({ class: "tribe-main" },
    voteButtonsNode
      ? div({ class: "job-section" },
          h2({ class: "job-section-title" }, i18n.voteCastTitle || "Cast Vote"),
          voteButtonsNode
        )
      : null,
    div({ class: "job-section" },
      h2({ class: "job-section-title" },
        `${i18n.voteResults || "Results"}: `,
        span({ style: `color:${outcome.color} !important;font-weight:bold;` }, outcome.text)
      ),
      div({ class: "vote-table" },
        table(
          tr(...voteOptions.map((opt) => th(voteLabel(opt)))),
          tr(...voteOptions.map((opt) => td(baseCounts[opt])))
        )
      )
    ),
    p({ class: "card-footer" },
      span({ class: "date-link" }, `${moment(v.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
      userLink(v.createdBy)
    ),
    renderOpinionsBar(v, returnTo)
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

            const content = c.value && c.value.content ? c.value.content : {};
            const root = content.fork || content.root || "";
            const text = content.text || "";

            return div(
              { class: "votations-comment-card" },
              span(
                { class: "created-at" },
                span(i18n.createdBy),
                author ? userLink(author) : span("(unknown)"),
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

