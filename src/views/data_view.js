const { div, h2, p, section, button, form, a, input, span, table, tr, td, ul, li } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink } = require("./main_views");
const { config } = require("../server/SSB_server.js");

const userId = config.keys.id;

const KIND_LABEL = {
  inhabitants: () => i18n.dataKindInhabitants,
  jobs: () => i18n.dataKindJobs,
  projects: () => i18n.dataKindProjects,
  events: () => i18n.dataKindEvents,
  tribes: () => i18n.dataKindTribes,
  market: () => i18n.dataKindMarket,
  housing: () => i18n.dataKindHousing,
  industry: () => i18n.dataKindIndustry,
  tasks: () => i18n.dataKindTasks,
  reports: () => i18n.dataKindReports,
  votes: () => i18n.dataKindVotes,
  audios: () => i18n.audioTitle,
  videos: () => i18n.videoTitle,
  images: () => i18n.imageTitle,
  documents: () => i18n.documentTitle,
  bookmarks: () => i18n.bookmarkTitle,
  torrents: () => i18n.typeTorrent,
  chats: () => i18n.chatsTitle,
  pads: () => i18n.padsTitle,
  maps: () => i18n.mapTitle,
  calendars: () => i18n.calendarsTitle,
  forum: () => i18n.forumTitle
};

const FILTER_COLUMNS = [
  ["ALL", "MINE", "RECENT", "TOP"],
  ["INHABITANTS", "TRIBES"],
  ["VOTES", "EVENTS", "CALENDARS", "TASKS", "REPORTS"],
  ["MARKET", "HOUSING", "JOBS", "PROJECTS", "INDUSTRY"],
  ["FORUM", "CHATS", "PADS", "MAPS"],
  ["AUDIOS", "BOOKMARKS", "DOCUMENTS", "IMAGES", "TORRENTS", "VIDEOS"]
];

const kindLabel = (kind) => (KIND_LABEL[kind] ? KIND_LABEL[kind]() : String(kind || '').toUpperCase());

const filterLabel = (key) => {
  const map = {
    ALL: i18n.dataFilterAll, MINE: i18n.dataFilterMine,
    RECENT: i18n.dataFilterRecent, TOP: i18n.dataFilterTop
  };
  return map[key] || kindLabel(key.toLowerCase());
};

const filterButton = (mode, current, q) =>
  form({ method: "GET", action: "/data" },
    input({ type: "hidden", name: "q", value: q || "" }),
    button({
      type: "submit", name: "filter", value: mode,
      class: current === mode ? "filter-btn active" : "filter-btn"
    }, String(filterLabel(mode)).toUpperCase())
  );

const renderFilters = (current, q) =>
  section(
    div({ class: "activity-filter-grid" },
      ...FILTER_COLUMNS.map(col =>
        div({ class: "activity-filter-col" },
          ...col.map(mode => filterButton(mode, current, q))
        )
      )
    ),
    div({ class: "data-search" },
      form({ method: "GET", action: "/data", class: "filter-box" },
        input({ type: "hidden", name: "filter", value: current }),
        input({ type: "text", name: "q", value: q || "", placeholder: i18n.dataSearchPlaceholder, class: "filter-box__input" }),
        div({ class: "filter-box__controls" },
          button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
        )
      )
    )
  );

const scorePct = (score) => Math.round((Number(score) || 0) * 100);
const scaleOf = (pct) => Math.min(4, Math.floor((Number(pct) || 0) / 20));

const renderCohesion = (c) => {
  const measurable = c.entities >= 2;
  const pct = measurable ? Number(c.percent) || 0 : 0;
  return section(
    div({ class: "tags-header" },
      h2(i18n.dataCohesionTitle),
      p(i18n.dataCohesionHint)
    ),
    div({ class: "data-cohesion" },
      p({ class: "data-cohesion-value" },
        span({ class: "card-label data-cohesion-label" }, `${i18n.dataCcShort}: `),
        measurable ? `${c.percent}%` : "—"),
      div({ class: "poll-bar data-cohesion-bar" },
        div({ class: `poll-bar-fill poll-bar-fill-${Math.round(pct / 5) * 5} data-scale-${scaleOf(pct)}` })),
      div({ class: "data-cohesion-figures" },
        div({ class: "data-figure" },
          span({ class: "data-figure-value" }, String(c.entities)),
          span({ class: "data-figure-label" }, i18n.dataStatEntities)
        ),
        div({ class: "data-figure" },
          span({ class: "data-figure-value" }, String(c.distinctTerms)),
          span({ class: "data-figure-label" }, i18n.dataStatTerms)
        ),
        div({ class: "data-figure" },
          span({ class: "data-figure-value" }, String(c.pairs)),
          span({ class: "data-figure-label" }, i18n.dataStatPairs)
        ),
        div({ class: "data-figure" },
          span({ class: "data-figure-value" }, String(c.isolated || 0)),
          span({ class: "data-figure-label" }, i18n.dataStatIsolated)
        ),
        div({ class: "data-figure" },
          span({ class: "data-figure-value" }, String(c.connected || 0)),
          span({ class: "data-figure-label" }, i18n.dataStatConnected)
        )
      )
    )
  );
};

const renderTopTerms = (c) =>
  c.topTerms.length
    ? section(
        div({ class: "tags-header" },
          h2(i18n.dataTermsTitle),
          p(i18n.dataTermsHint)
        ),
        div({ class: "data-top-terms" },
          ...c.topTerms.map(t =>
            a({ href: `/search?query=%23${encodeURIComponent(t.term)}`, class: "tag-link" }, `#${t.term} (${t.count})`))
        )
      )
    : null;

const shortId = (id) => {
  const value = String(id || "");
  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
};

const renderSide = (side) =>
  div({ class: "data-pair-side" + (String(side.author) === String(userId) ? " data-side-mine" : "") },
    div({ class: "data-side-top" },
      span({ class: "data-kind-chip" }, String(kindLabel(side.kind)).toUpperCase()),
      a({ href: side.href, class: "btn-singleview btn-content data-side-visit", title: i18n.visitContent }, "↗")
    ),
    a({ href: side.href, class: "data-card-title" }, side.title || shortId(side.id)),
    span({ class: "data-card-author" }, userLink(side.author))
  );

const renderMatchRow = (m, isBest) => {
  const common = Array.isArray(m.common) ? m.common : [];
  return div({ class: isBest ? "data-card data-best-card" : "data-card" },
    isBest
      ? div({ class: "data-best-head" },
          span({ class: "data-best-label" }, i18n.dataBestMatch),
          span({ class: "data-score-value data-best-score" }, `${scorePct(m.score)}%`)
        )
      : div({ class: "data-score-head" },
          span({ class: "card-label" }, `${i18n.dataAffinity}: `),
          span({ class: "data-score-value" }, `${scorePct(m.score)}%`)
        ),
    div({ class: "data-pair" },
      renderSide(m.a),
      span({ class: "data-pair-link" }, "↔"),
      renderSide(m.b)
    ),
    common.length
      ? div({ class: "data-common-row" },
          span({ class: "card-label" }, `${i18n.dataCommonTerms}: `),
          ...common.slice(0, 8).map(t =>
            a({ href: `/search?query=%23${encodeURIComponent(t)}`, class: "tag-link" }, `#${t}`))
        )
      : null
  );
};

exports.dataView = async (payload = {}) => {
  const filter = String(payload.filter || 'ALL').toUpperCase();
  const q = payload.q || '';

  const matches = Array.isArray(payload.matches) ? payload.matches : [];

  return template(
    i18n.dataTitle,
    section(div({ class: "tags-header" }, h2(i18n.dataTitle), p(i18n.dataDescription))),
    renderFilters(filter, q),
    payload.cohesion ? renderCohesion(payload.cohesion) : null,
    payload.cohesion ? renderTopTerms(payload.cohesion) : null,
    section(
      div({ class: "tags-header" },
        h2(q ? `${i18n.dataTopicTitle} #${q}` : i18n.dataMatchesTitle),
        p(q ? i18n.dataTopicHint : i18n.dataMatchesHint),
        typeof payload.total === "number" && payload.total > matches.length
          ? p({ class: "data-cohesion-hint" }, `${matches.length} / ${payload.total}`)
          : null
      ),
      matches.length
        ? div({ class: "data-list" }, ...matches.map((m, idx) => renderMatchRow(m, idx === 0)))
        : p({ class: "no-content" }, payload.hasProfile === false && filter === 'MINE'
            ? i18n.dataNoProfile
            : i18n.dataNoMatches)
    )
  );
};
