const { div, h2, p, section, button, form, a, input, span, table, tr, td, ul, li } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderModuleStats } = require("./main_views");

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
  forum: () => i18n.forumTitle,
  school: () => i18n.schoolTitle,
  wiki: () => i18n.wikiTitle,
  emergencies: () => i18n.emergenciesTitle,
  mailing: () => i18n.mailingTitle,
  logistics: () => i18n.logisticsTitle,
  podcasts: () => i18n.podcastsTitle,
  campaigns: () => i18n.campaignsTitle
};

const REASON_LABEL = {
  mutual: () => i18n.dataReasonMutual,
  following: () => i18n.dataReasonFollowing,
  supportsYou: () => i18n.dataReasonSupportsYou,
  tribe: () => i18n.dataReasonTribe,
  alike: () => i18n.dataReasonAlike,
  cv: () => i18n.dataReasonCv,
  content: () => i18n.dataReasonContent,
  pinned: () => i18n.dataReasonPinned,
  related: () => i18n.dataReasonRelated,
  rated: () => i18n.dataReasonRated,
  near: () => i18n.dataReasonNear
};

const FILTER_COLUMNS = [
  ["ALL", "RECENT", "TOP"],
  ["INHABITANTS", "TRIBES"],
  ["VOTES", "EVENTS", "CALENDARS", "TASKS", "REPORTS", "EMERGENCIES", "MAILING", "CAMPAIGNS"],
  ["MARKET", "HOUSING", "JOBS", "PROJECTS", "INDUSTRY", "LOGISTICS"],
  ["FORUM", "CHATS", "PADS", "WIKI", "MAPS", "SCHOOL"],
  ["AUDIOS", "BOOKMARKS", "DOCUMENTS", "IMAGES", "TORRENTS", "VIDEOS", "PODCASTS"]
];

const kindLabel = (kind) => (KIND_LABEL[kind] ? KIND_LABEL[kind]() : String(kind || '').toUpperCase());

const reasonButton = (value, label, current, q) =>
  form({ method: "GET", action: "/data" },
    input({ type: "hidden", name: "q", value: q || "" }),
    value ? input({ type: "hidden", name: "reason", value }) : null,
    button({ type: "submit", class: current === value ? "filter-btn active" : "filter-btn" }, String(label).toUpperCase())
  );

const sectionId = (kind) => `data-${String(kind || '').toLowerCase()}`;

const renderFilters = (q, payload = {}, kindsPresent = []) => {
  const matches = Array.isArray(payload.matches) ? payload.matches : [];
  const reason = String(payload.reason || "");
  if (!matches.length && !String(q || "").trim() && !reason) return null;
  const avail = (Array.isArray(payload.reasonsAvail) ? payload.reasonsAvail : []).filter(r => REASON_LABEL[r]);
  const present = new Set(kindsPresent);
  const columns = FILTER_COLUMNS.slice(1)
    .map(col => col.filter(k => present.has(k.toLowerCase())))
    .filter(col => col.length);
  return section(
    div({ class: "activity-sub-filter" },
      reasonButton("", i18n.dataFilterAll, reason, q),
      ...avail.map(r => reasonButton(r, REASON_LABEL[r](), reason, q))
    ),
    reason || !columns.length ? null : div({ class: "activity-filter-grid" },
      ...columns.map(col =>
        div({ class: "activity-filter-col" },
          ...col.map(k => a({ href: `#${sectionId(k)}`, class: "filter-btn" }, String(kindLabel(k.toLowerCase())).toUpperCase()))
        )
      )
    ),
    div({ class: "data-search activity-filter-chips activity-toolbar-row" },
      renderModuleStats(matches.length),
      form({ method: "GET", action: "/data", class: "filter-box" },
        reason ? input({ type: "hidden", name: "reason", value: reason }) : null,
        input({ type: "text", name: "q", value: q || "", placeholder: i18n.dataSearchPlaceholder, class: "filter-box__input" }),
        div({ class: "filter-box__controls" },
          button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
        )
      )
    )
  );
};

const scorePct = (score) => ((Number(score) || 0) * 100).toFixed(2).replace(/\.?0+$/, '');
const scaleOf = (pct) => Math.min(4, Math.floor((Number(pct) || 0) / 20));

const renderCohesion = (c) => {
  const measurable = c.entities >= 2;
  const pct = measurable ? Number(c.percent) || 0 : 0;
  return section(
    div({ class: "tags-header module-header-line" },
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

const TITLE_MAX = 120;
const shortTitle = (title) => {
  const t = String(title || "").replace(/\s+/g, " ").trim();
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1)}…` : t;
};

const shortId = (id) => {
  const value = String(id || "");
  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
};

const renderMatchRow = (m, isBest) => {
  const common = Array.isArray(m.common) ? m.common : [];
  const reasons = (Array.isArray(m.reasons) ? m.reasons : []).filter(r => REASON_LABEL[r]);
  return div({ class: isBest ? "data-card data-best-card" : "data-card" },
    div({ class: "data-side-top" },
      span({ class: "data-kind-chip" }, String(kindLabel(m.kind)).toUpperCase()),
      span({ class: "card-label data-score-label" }, `${isBest ? i18n.dataBestMatch : (i18n.dataCcShort || "CC")}: `),
      span({ class: isBest ? "data-score-value data-best-score" : "data-score-value" }, `${scorePct(m.score)}%`),
      a({ href: m.href, class: "btn-singleview btn-content data-side-visit", title: i18n.visitContent }, "↗")
    ),
    a({ href: m.href, class: "data-card-title" }, shortTitle(m.title) || shortId(m.id)),
    span({ class: "data-card-author" }, userLink(m.author)),
    common.length
      ? div({ class: "data-common-row" },
          span({ class: "card-label" }, `${i18n.dataCommonTerms}: `),
          ...common.slice(0, 8).map(t =>
            a({ href: `/search?query=%23${encodeURIComponent(t)}`, class: "tag-link" }, `#${t}`))
        )
      : null,
    reasons.length
      ? div({ class: "data-reasons-row" },
          ...reasons.map(r => span({ class: "data-kind-chip data-reason-chip" }, REASON_LABEL[r]()))
        )
      : null
  );
};

const groupByKind = (matches) => {
  const groups = new Map();
  for (const m of matches) {
    if (!groups.has(m.kind)) groups.set(m.kind, []);
    groups.get(m.kind).push(m);
  }
  const ordered = [...groups.entries()].map(([kind, items]) => {
    items.sort((x, y) => (y.score || 0) - (x.score || 0) || (y.ts || 0) - (x.ts || 0));
    return { kind, items };
  });
  ordered.sort((x, y) => (y.items[0].score || 0) - (x.items[0].score || 0));
  return ordered;
};

exports.dataView = async (payload = {}) => {
  const q = payload.q || '';
  const reason = String(payload.reason || '');

  const matches = Array.isArray(payload.matches) ? payload.matches : [];
  const emptyData = matches.length === 0 && payload.hasProfile === false && !String(q || '').trim() && !reason;
  const groups = groupByKind(matches);
  const best = groups.length ? groups[0].items[0] : null;

  return template(
    i18n.dataTitle,
    section(div({ class: "tags-header module-header-line" }, h2(i18n.dataTitle), p(i18n.dataDescription))),
    renderFilters(q, { ...payload, matches }, groups.map(g => g.kind)),
    emptyData ? null : (payload.cohesion ? renderCohesion(payload.cohesion) : null),
    section(
      emptyData ? null : div({ class: "tags-header" },
        h2(q ? `${i18n.dataTopicTitle} #${q}` : i18n.dataMatchesTitle),
        p(q ? i18n.dataTopicHint : i18n.dataMatchesHint)
      ),
      best
        ? div({ class: "data-section data-top-best" },
            h2({ class: "data-section-title" }, String(i18n.dataBestMatch).toUpperCase()),
            div({ class: "data-list" }, renderMatchRow(best, true))
          )
        : null,
      ...groups.map(g =>
        div({ id: sectionId(g.kind), class: "data-section" },
          h2({ class: "data-section-title" }, `${String(kindLabel(g.kind)).toUpperCase()} (${g.items.length})`),
          div({ class: "data-list" }, ...g.items.map((m, idx) => renderMatchRow(m, idx === 0)))
        )
      ),
      matches.length
        ? null
        : div({ class: "no-content-box" }, p({ class: "no-content" }, payload.hasProfile === false
            ? i18n.dataNoProfile
            : i18n.dataNoMatches))
    )
  );
};
