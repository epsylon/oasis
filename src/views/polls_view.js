const { div, h2, p, section, button, form, a, input, label, span, textarea, br, table, tr, td } = require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view");
const { template, i18n, userLink, renderOpinionsVoting, renderEngagement, renderSpreadButton, renderContentActions, renderStateChip, renderLifespanChip, renderSpreadEditWarning } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");
const { MAX_OPTIONS, MIN_OPTIONS, MAX_OPTION_LENGTH } = require("../models/polls_model_limits");

const userId = config.keys.id;

const FILTERS = [
  { key: "ALL", i18n: "pollFilterAll" },
  { key: "MINE", i18n: "pollFilterMine" },
  { key: "RECENT", i18n: "pollFilterRecent" },
  { key: "TOP", i18n: "pollFilterTop" },
  { key: "VOTED", i18n: "pollFilterVoted" },
  { key: "OPEN", i18n: "pollFilterOpen" },
  { key: "CLOSED", i18n: "pollFilterClosed" }
];

const safeArr = (v) => (Array.isArray(v) ? v : []);

const pct = (n, total) => (total > 0 ? Math.round((Number(n) || 0) / total * 100) : 0);
const letterOf = (i) => {
  let n = Number(i) || 0;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};
const pctStep = (n, total) => Math.round(pct(n, total) / 5) * 5;

const outcomeOf = (poll) => {
  if (!poll.totalVoters) return i18n.pollNoVotesYet;
  const max = Math.max(...poll.options.map(o => poll.counts[o] || 0));
  if (!max) return i18n.pollNoVotesYet;
  const winners = poll.options
    .map((o, i) => ({ o, letter: letterOf(i) }))
    .filter(({ o }) => (poll.counts[o] || 0) === max);
  if (winners.length > 1) return `${i18n.pollTie}: ${winners.map(w => `${w.letter})`).join(", ")}`;
  return `${winners[0].letter}) ${pct(max, poll.totalVoters)}%`;
};

const renderStatusChip = (poll) =>
  renderStateChip(poll.status === "OPEN" ? "whole" : "mutuals", "◆",
    poll.status === "OPEN" ? i18n.pollStatusOpen : i18n.pollStatusClosed);

const renderModeChips = (poll) => [
  poll.anonymous ? renderStateChip("mutuals", "◈", i18n.pollAnonymous) : null,
  poll.multiple ? renderStateChip("whole", "☰", i18n.pollMultiple) : null
].filter(Boolean);

const renderResults = (poll) =>
  table({ class: "poll-results" },
    ...poll.options.map((opt, i) =>
      tr({ class: poll.myChoices.includes(opt) ? "poll-result-row poll-result-mine" : "poll-result-row" },
        td({ class: "poll-result-option" }, `${letterOf(i)})`),
        td({ class: "poll-result-bar" },
          div({ class: "poll-bar" },
            div({ class: `poll-bar-fill poll-bar-fill-${pctStep(poll.counts[opt], poll.totalVoters)} poll-hue-${i % 8}` })
          )
        ),
        td({ class: "poll-result-count" },
          `${poll.counts[opt] || 0} (${pct(poll.counts[opt], poll.totalVoters)}%)`)
      )
    )
  );

const renderBallot = (poll, returnTo, basePath) => {
  if (poll.status === "CLOSED" || poll.hasVoted) return null;
  const inputType = poll.multiple ? "checkbox" : "radio";
  return form({ method: "POST", action: `${basePath}/vote/${encodeURIComponent(poll.id)}`, class: "poll-ballot" },
    input({ type: "hidden", name: "returnTo", value: returnTo }),
    ...poll.options.map((opt, i) =>
      div({ class: "poll-option-row" },
        label({ for: `opt-${i}-${poll.id}` },
          input({
            type: inputType, name: "choices", value: opt, id: `opt-${i}-${poll.id}`,
            ...(poll.myChoices.includes(opt) ? { checked: true } : {})
          }),
          " ",
          `${letterOf(i)}) ${opt}`
        )
      )
    ),
    button({ type: "submit", class: "filter-btn" }, i18n.pollVoteButton)
  );
};

const renderPollCard = (poll, filter, spreadInfo, basePath = "/polls") => {
  const href = `${basePath}/${encodeURIComponent(poll.id)}`;
  const isOwn = String(poll.author) === String(userId);
  const chips = [
    renderStatusChip(poll),
    ...renderModeChips(poll),
    poll.deadline
      ? renderStateChip(poll.status === "OPEN" ? "whole" : "mutuals", "◷", `${i18n.pollDeadline}: ${moment(poll.deadline).format("YYYY/MM/DD HH:mm")}`)
      : null,
    renderLifespanChip(poll.lifetime, i18n)
  ].filter(Boolean);
  return div({ class: "tribe-card poll-card" + (isOwn ? " own-content" : "") },
    div({ class: "card-header activity-card-header" },
      span(),
      renderContentActions(poll.id, href, { spread: spreadInfo || null, author: poll.author, favKind: 'polls', isFavorite: poll.isFavorite, reportTitle: poll.question })
    ),
    div({ class: "tribe-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" }, a({ href }, poll.question))
      ),
      chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.pollVoters}: ${poll.totalVoters}`)
      )
    )
  );
};

const renderCreateForm = (poll = null, params = {}) => {
  const isEdit = !!poll;
  const action = isEdit ? `/polls/update/${encodeURIComponent(poll.id)}` : "/polls/create";
  return section(
    params.spreadWarning || null,
    div({ class: "div-center audio-form" },
      h2(isEdit ? i18n.pollEditTitle : i18n.pollCreateTitle),
      form({ method: "POST", action },
        label(i18n.pollQuestion),
        br(),
        input({ type: "text", name: "question", required: true, maxlength: "300", value: isEdit ? poll.question : "", placeholder: i18n.pollQuestionPlaceholder }),
        br(), br(),
        label(i18n.pollOptions),
        br(),
        textarea({
          name: "options",
          rows: String(MAX_OPTIONS),
          required: true,
          maxlength: String(MAX_OPTIONS * (MAX_OPTION_LENGTH + 1))
        }, isEdit ? poll.options.join("\n") : ""),
        br(),
        div({ class: "poll-switch" },
          input({ type: "hidden", name: "anonymous", value: "0" }),
          label(
            input({ type: "checkbox", name: "anonymous", value: "1", ...(isEdit && poll.anonymous ? { checked: true } : {}) }),
            " ", i18n.pollAnonymousLabel
          )
        ),
        div({ class: "poll-switch" },
          input({ type: "hidden", name: "multiple", value: "0" }),
          label(
            input({ type: "checkbox", name: "multiple", value: "1", ...(isEdit && poll.multiple ? { checked: true } : {}) }),
            " ", i18n.pollMultipleLabel
          )
        ),
        br(),
        label(i18n.pollDeadline),
        br(),
        input({
          type: "datetime-local", name: "deadline",
          min: moment().format("YYYY-MM-DDTHH:mm"),
          value: isEdit && poll.deadline ? moment(poll.deadline).format("YYYY-MM-DDTHH:mm") : ""
        }),
        br(), br(),
        label(i18n.pollTags),
        br(),
        input({ type: "text", name: "tags", value: isEdit ? poll.tags.join(", ") : "" }),
        br(), br(),
        button({ type: "submit", class: "create-button" }, isEdit ? i18n.pollUpdateButton : i18n.pollPublishButton)
      )
    )
  );
};

const renderComments = (poll, comments, basePath) => {
  const href = `${basePath}/${encodeURIComponent(poll.id)}`;
  return renderSharedCommentsSection({
    action: `${href}/comments`,
    comments: comments,
    returnTo: href
  });
};

const renderFilterBar = (filter, q, showSearch = true) =>
  section(
    div({ class: "filters" },
      form({ method: "GET", action: "/polls", class: "ui-toolbar ui-toolbar--filters" },
        ...FILTERS.map(f =>
          button({ type: "submit", name: "filter", value: f.key, class: filter === f.key ? "filter-btn active" : "filter-btn" }, String(i18n[f.i18n]).toUpperCase())
        ),
        button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.pollCreateButton)
      )
    ),
    showSearch ? div({ class: "filters activity-filter-chips activity-toolbar-row" },
      form({ method: "GET", action: "/polls", class: "filter-box" },
        input({ type: "hidden", name: "filter", value: filter }),
        input({ type: "text", name: "q", value: q || "", placeholder: i18n.pollSearchPlaceholder, class: "filter-box__input" }),
        div({ class: "filter-box__controls" },
          button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
        )
      )
    ) : null
  );

exports.pollsView = async (polls = [], filter = "ALL", params = {}) => {
  const mode = String(filter).toUpperCase();
  const spreadMap = params.spreadMap instanceof Map ? params.spreadMap : new Map();
  if (mode === "CREATE" || mode === "EDIT") {
    const editing = params.poll || null;
    if (editing) params = { ...params, spreadWarning: await renderSpreadEditWarning(editing.id) };
    return template(
      i18n.pollsTitle,
      section(div({ class: "tags-header module-header-line" }, h2(i18n.pollsTitle), p(i18n.pollsDescription))),
      renderFilterBar(mode, params.q, false),
      renderCreateForm(editing, params)
    );
  }
  return template(
    i18n.pollsTitle,
    section(div({ class: "tags-header module-header-line" }, h2(i18n.pollsTitle), p(i18n.pollsDescription))),
    renderFilterBar(mode, params.q),
    section(
      polls.length
        ? div({ class: "jobs-grid" }, ...polls.map(pl => renderPollCard(pl, mode, spreadMap.get(pl.id))))
        : p({ class: "no-content" }, i18n.pollsNoItems)
    )
  );
};

exports.singlePollView = async (poll, comments = [], params = {}) => {
  const basePath = "/polls";
  const href = `${basePath}/${encodeURIComponent(poll.id)}`;
  const isOwn = String(poll.author) === String(userId);
  const chips = [renderStatusChip(poll), ...renderModeChips(poll), renderLifespanChip(poll.lifetime, i18n)].filter(Boolean);

  const infoRows = [];
  const pushRow = (labelText, valueNode) =>
    infoRows.push(tr(
      td({ class: "tribe-info-label" }, labelText),
      td({ class: "tribe-info-value" }, valueNode)
    ));
  if (poll.deadline) pushRow(i18n.pollDeadline, moment(poll.deadline).format("YYYY/MM/DD HH:mm"));
  pushRow(i18n.pollOutcome, outcomeOf(poll));

  const tagsNode = poll.tags.length
    ? div({ class: "card-tags" }, poll.tags.map(tag =>
        a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)))
    : null;

  const ownerActions = isOwn
    ? div({ class: "tribe-side-actions" },
        poll.totalVoters === 0 && poll.status === "OPEN"
          ? form({ method: "GET", action: "/polls" },
              input({ type: "hidden", name: "filter", value: "EDIT" }),
              input({ type: "hidden", name: "id", value: poll.id }),
              button({ type: "submit", class: "update-btn" }, i18n.pollUpdateButton)
            )
          : null,
        form({ method: "POST", action: `/polls/delete/${encodeURIComponent(poll.id)}` },
          button({ type: "submit", class: "delete-btn" }, i18n.pollDeleteButton)
        )
      )
    : null;

  const pollSide = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(poll.id, null, { spread: params.spreads || null, author: poll.author, favKind: 'polls', isFavorite: poll.isFavorite, returnTo: href, reportTitle: poll.question })
    ),
    div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, poll.question)),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    table({ class: "tribe-info-table jobs-info-table" }, ...infoRows),
    tagsNode,
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.pollVoters}: ${poll.totalVoters}`)
    ),
    isOwn
      ? div({ class: "tribe-side-actions housing-status-row" },
          span({ class: "card-label" }, `${i18n.pollStatusLabel}: `),
          renderStatusChip(poll),
          poll.status === "OPEN"
            ? form({ method: "POST", action: `/polls/close/${encodeURIComponent(poll.id)}` },
                button({ type: "submit", class: "status-btn project-control-btn" }, i18n.pollCloseButton)
              )
            : null
        )
      : null,
    ownerActions
  );

  const pollMain = div({ class: "tribe-main" },
    div({ class: "job-section" },
      h2({ class: "job-section-title" }, i18n.pollOutcome),
      renderBallot(poll, href, basePath),
      renderResults(poll)
    ),
    poll.votersHidden
      ? null
      : (poll.voters.length
          ? div({ class: "card-assigned-list" }, ...poll.voters.map(v => userLink(v)))
          : null),
    p({ class: "card-footer" },
      span({ class: "date-link" }, moment(poll.createdAt).format("YYYY/MM/DD HH:mm")),
      span(" · "),
      userLink(poll.author)
    ),
    renderEngagement(poll.id,
      renderOpinionsVoting('/polls/opinions', poll.id, poll.opinions, href, poll.opinions_inhabitants),
      renderComments(poll, comments, basePath)
    )
  );

  return template(
    poll.question,
    section(div({ class: "tags-header module-header-line" }, h2(i18n.pollsTitle), p(i18n.pollsDescription))),
    renderFilterBar(String(params.filter || "ALL").toUpperCase(), params.q, false),
    section(div({ class: "tribe-details" }, pollSide, pollMain))
  );
};

exports.renderPollCard = renderPollCard;
exports.renderResults = renderResults;
exports.renderBallot = renderBallot;
exports.outcomeOf = outcomeOf;
exports.letterOf = letterOf;
