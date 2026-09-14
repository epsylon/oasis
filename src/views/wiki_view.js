const { div, h2, h3, p, section, button, form, a, span, br, textarea, input, label, select, option, ul, li, img } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderStateChip, renderContentActions, renderSubscriptionBox, renderModuleStats, moduleIsEmpty, renderCardMetaRow } = require("./main_views");
const { renderEncryptedChip } = require("./clearnet_view");
const { renderStyledText, richTextarea } = require("../backend/renderStyledText");
const { WIKILINK_RE, slugify, linkTarget } = require("../models/wiki_model");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");

const userId = config.keys.id;
const FILTERS = ["all", "mine", "recent", "linked"];

const pageHref = (idOrSlug, tribeId = null) =>
  `/wiki/${encodeURIComponent(idOrSlug)}${tribeId ? `?tribeId=${encodeURIComponent(tribeId)}` : ""}`;

const listHref = (filter, q, tribeId = null) => {
  const parts = [`filter=${encodeURIComponent(filter || "all")}`];
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (tribeId) parts.push(`tribeId=${encodeURIComponent(tribeId)}`);
  return `/wiki?${parts.join("&")}`;
};

const renderWikiBody = (body, opts = {}) => {
  const missing = new Set(opts.missing || []);
  const tribeId = opts.tribeId || null;
  const wikiLink = (target, slug, label) => {
    const isMissing = missing.has(slug);
    return a({
      href: isMissing ? `/wiki?filter=create&title=${encodeURIComponent(target)}${tribeId ? `&tribeId=${encodeURIComponent(tribeId)}` : ""}` : pageHref(slug, tribeId),
      class: isMissing ? "wiki-link wiki-link-missing" : "wiki-link",
      title: isMissing ? (i18n.wikiMissingLink || "Page does not exist yet") : label
    }, label);
  };
  const paragraphs = String(body || "").replace(/\r\n/g, "\n").split(/\n{2,}/);
  return div({ class: "wiki-body" },
    ...paragraphs.filter(par => par.trim()).map(par =>
      p({ class: "wiki-paragraph" }, ...renderStyledText(par, { wikiLink }))
    )
  );
};

const diffLines = (oldText, newText) => {
  const a = String(oldText || "").replace(/\r\n/g, "\n").split("\n");
  const b = String(newText || "").replace(/\r\n/g, "\n").split("\n");
  const n = a.length, m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ type: "ctx", text: a[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ type: "del", text: a[i] }); i++; }
    else { out.push({ type: "add", text: b[j] }); j++; }
  }
  while (i < n) { out.push({ type: "del", text: a[i++] }); }
  while (j < m) { out.push({ type: "add", text: b[j++] }); }
  return out;
};

const renderDiff = (oldText, newText) =>
  div({ class: "wiki-diff" },
    ...diffLines(oldText, newText).map(l =>
      div({ class: `wiki-diff-line wiki-diff-${l.type}` }, span({ class: "wiki-diff-sign" }, l.type === "add" ? "+" : l.type === "del" ? "−" : " "), span({ class: "wiki-diff-text" }, l.text || " "))
    )
  );

const pageChips = (page) => [
  page.encrypted ? renderEncryptedChip(i18n) : null,
  renderStateChip(page.editPolicy === "author" ? "closed" : "open", "", page.editPolicy === "author" ? i18n.wikiStatusClosed : i18n.wikiStatusOpen),
  page.versionCount > 1 ? renderStateChip("neutral", "", `${page.versionCount} ${i18n.wikiVersions || "versions"}`) : null,
  page.isLinked ? renderStateChip("open", "", i18n.wikiLinkedChip || "Linked") : null
].filter(Boolean);

const renderTags = (tags) => (Array.isArray(tags) && tags.length)
  ? div({ class: "card-tags" }, ...tags.map(t => a({ href: `/search?query=%23${encodeURIComponent(t)}`, class: "tag-link" }, `#${t}`)))
  : null;

const renderPageCard = (page, params = {}) => {
  const href = pageHref(page.tribeId ? page.id : page.slug, page.tribeId);
  return div({ class: "tribe-card wiki-card" },
    div({ class: "card-header activity-card-header" },
      span(),
      renderContentActions(page.id, href, { author: page.author, reportTitle: page.title, favKind: 'wiki', isFavorite: page.isFavorite, spread: (params.spreadMap && params.spreadMap.get(page.id)) || null })
    ),
    div({ class: "tribe-card-body" },
      page.image ? a({ href }, img({ class: "wiki-card-cover", src: `/blob/${encodeURIComponent(page.image)}`, alt: page.title || "" })) : null,
      div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, a({ href }, page.title || "—"))),
      div({ class: "card-chips-row" }, ...pageChips(page))
    )
  );
};

const renderFilters = (filter, q, params = {}, census = []) => {
  const tribeId = params.tribeId || null;
  const dayAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const chipVisible = (mode) => {
    if (mode === filter || mode === "all") return true;
    if (mode === "mine") return census.some(p => String(p.author) === String(userId) || (p.versions || []).some(v => String(v.author) === String(userId)));
    if (mode === "recent") return census.some(p => p.ts >= dayAgo);
    if (mode === "linked") return census.some(p => p.isLinked);
    return true;
  };
  const labelOf = (mode) => String(i18n[`wikiFilter${mode.charAt(0).toUpperCase() + mode.slice(1)}`] || mode).toUpperCase();
  return div({ class: "filters" },
    form({ method: "GET", action: "/wiki", class: "ui-toolbar ui-toolbar--filters" },
      input({ type: "hidden", name: "q", value: q || "" }),
      tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
      ...(params.emptyMod ? [] : [
        ...FILTERS.filter(chipVisible).map(mode => button({ type: "submit", name: "filter", value: mode, class: filter === mode ? "filter-btn active" : "filter-btn" }, labelOf(mode))),
        ...((census.length > 0 || filter === "changes") ? [button({ type: "submit", name: "filter", value: "changes", class: filter === "changes" ? "filter-btn active" : "filter-btn" }, String(i18n.wikiChanges || "Recent changes").toUpperCase())] : [])
      ]),
      button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.wikiCreate)
    )
  );
};

const renderForm = (page, params = {}) => {
  const tribeId = (page && page.tribeId) || params.tribeId || "";
  const draft = params.draft || null;
  const status = draft ? (String(draft.status || "OPEN").toUpperCase() === "CLOSED" ? "CLOSED" : "OPEN") : (page && page.editPolicy === "author" ? "CLOSED" : "OPEN");
  const titleValue = draft ? draft.title : (page ? page.title : (params.title || ""));
  const bodyValue = draft ? draft.body : (page ? page.body : "");
  const tagsValue = draft ? draft.tags : (page ? page.tags.join(", ") : "");
  const summaryValue = draft ? draft.summary : "";
  const statusOptions = [
    { value: "OPEN", label: i18n.wikiStatusOpen },
    { value: "CLOSED", label: i18n.wikiStatusClosed }
  ];
  return div({ class: "div-center audio-form" },
    h2(page ? i18n.wikiUpdateSectionTitle : i18n.wikiCreateSectionTitle),
    params.notice
      ? div({ class: "tags-header inline-error-box" }, p({ class: "error-page-message" }, params.notice))
      : null,
    draft
      ? section({ class: "post-preview wiki-preview" },
          div({ class: "preview-content" },
            h2(i18n.messagePreview),
            h3({ class: "wiki-page-title" }, titleValue || "—"),
            renderWikiBody(bodyValue, { missing: [], tribeId: tribeId || null })
          )
        )
      : null,
    form({ method: "POST", action: page ? `/wiki/update/${encodeURIComponent(page.id)}` : "/wiki/create", enctype: "multipart/form-data" },
      tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
      page ? input({ type: "hidden", name: "pageId", value: page.id }) : null,
      params.returnTo ? input({ type: "hidden", name: "returnTo", value: params.returnTo }) : null,
      label(i18n.wikiTitleLabel), br(),
      input({ type: "text", name: "title", maxlength: "100", required: true, placeholder: i18n.wikiTitlePlaceholder, value: titleValue }), br(),
      label(i18n.wikiBodyLabel), br(),
      richTextarea({ name: "body", rows: 14, maxlength: "20000", placeholder: i18n.wikiBodyPlaceholder }, bodyValue), br(),
      label(i18n.uploadMedia), br(),
      input({ type: "file", name: "blob", accept: "image/*,video/*,audio/*,application/pdf,.torrent" }), br(), br(),
      page ? [label(i18n.wikiSummaryLabel), br(), input({ type: "text", name: "summary", maxlength: "200", placeholder: i18n.wikiSummaryPlaceholder, value: summaryValue }), br()] : null,
      page
        ? null
        : [label(i18n.wikiStatusLabel), br(), select({ name: "status" }, ...statusOptions.map(o => option({ value: o.value, ...(o.value === status ? { selected: true } : {}) }, o.label))), br(), br()],
      label(i18n.wikiTagsLabel), br(),
      input({ type: "text", name: "tags", maxlength: "200", placeholder: i18n.wikiTagsPlaceholder, value: tagsValue }), br(),
      br(),
      button({ type: "submit", class: "filter-btn", formaction: "/wiki/preview", formmethod: "POST" }, i18n.wikiPreview),
      " ",
      button({ type: "submit", class: "create-button" }, page ? i18n.wikiUpdate : i18n.wikiCreate)
    )
  );
};

const renderHeader = (tribe = null) =>
  div({ class: "tags-header module-header-line" },
    h2(tribe ? `${i18n.wikiTitle} · ${tribe.title}` : i18n.wikiTitle),
    p(i18n.wikiDescription)
  );

exports.wikiView = async (pages, filter = "all", params = {}) => {
  const list = Array.isArray(pages) ? pages : [];
  const q = String(params.q || "").trim();
  const census = Array.isArray(params.censusList) ? params.censusList : list;
  const isForm = filter === "create" || filter === "edit";
  const emptyMod = !isForm && census.length === 0 && !q;
  return template(
    i18n.wikiTitle,
    section(
      div({ class: "tags-header module-header-line" },
        h2(params.tribe ? `${i18n.wikiTitle} · ${params.tribe.title}` : i18n.wikiTitle),
        p(i18n.wikiDescription)
      ),
      renderFilters(isForm ? "all" : filter, q, { ...params, emptyMod }, census)
    ),
    section(
      isForm
        ? renderForm(filter === "edit" ? params.page : null, params)
        : [
            emptyMod ? null : div({ class: "filters activity-filter-chips activity-toolbar-row" },
              renderModuleStats(list.length),
              form({ method: "GET", action: "/wiki", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter }),
                params.tribeId ? input({ type: "hidden", name: "tribeId", value: params.tribeId }) : null,
                input({ type: "text", name: "q", value: q, placeholder: i18n.wikiSearchPlaceholder, class: "filter-box__input" }),
                div({ class: "filter-box__controls" }, button({ type: "submit", class: "filter-box__button" }, i18n.searchButton))
              )
            ),
            div({ class: "tribe-grid" },
              list.length ? list.map(pg => renderPageCard(pg, params)) : p(i18n.wikiNoPages)
            )
          ]
    )
  );
};

exports.wikiChangesView = async (changes, params = {}) => {
  const list = Array.isArray(changes) ? changes : [];
  const census = Array.isArray(params.censusList) ? params.censusList : [];
  return template(
    i18n.wikiTitle,
    section(renderHeader(params.tribe || null), renderFilters("changes", "", { ...params, emptyMod: census.length === 0 }, census)),
    section(
      div({ class: "tags-header" }, h2(i18n.wikiChanges)),
      list.length
        ? div({ class: "wiki-changes" }, ...list.map(c =>
            div({ class: "card-section wiki-change" },
              div({ class: "card-field" },
                span({ class: "card-label" }, `#${c.index}`),
                span({ class: "card-value" }, a({ href: `${pageHref(c.pageId, c.tribeId)}${c.tribeId ? "&" : "?"}version=${encodeURIComponent(c.versionKey)}` }, c.title || c.slug))
              ),
              c.summary ? p({ class: "wiki-change-summary" }, c.summary.startsWith("restore:") ? i18n.wikiRestoredSummary : c.summary) : null,
              p({ class: "card-footer" }, span({ class: "date-link" }, moment(c.createdAt).format("YYYY/MM/DD HH:mm")), userLink(c.author))
            )
          ))
        : div({ class: "no-content-box" }, p({ class: "no-content" }, i18n.wikiNoChanges))
    )
  );
};

const versionRow = (page, v, idx, current, tribeId) => {
  const isCurrent = v.key === page.tipId;
  const base = pageHref(page.tribeId ? page.id : page.slug, tribeId);
  const sep = tribeId ? "&" : "?";
  return div({ class: "card-section wiki-version" + (isCurrent ? " wiki-version-current" : "") },
    div({ class: "card-field" },
      span({ class: "card-label" }, `${i18n.wikiVersion} ${idx + 1}`),
      isCurrent ? span({ class: "card-value" }, renderStateChip("mutuals", "", i18n.wikiCurrentVersion)) : span({ class: "card-value" })
    ),
    v.summary ? [br(), p({ class: "wiki-change-summary" }, v.summary.startsWith("restore:") ? i18n.wikiRestoredSummary : v.summary), br()] : null,
    div({ class: "tribe-side-actions wiki-version-actions" },
      form({ method: "GET", action: base },
        tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
        input({ type: "hidden", name: "version", value: v.key }),
        button({ type: "submit", class: "update-btn" }, i18n.wikiViewVersion)),
      idx > 0
        ? form({ method: "GET", action: base },
            tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
            input({ type: "hidden", name: "diff", value: v.key }),
            button({ type: "submit", class: "update-btn" }, i18n.wikiDiff))
        : null,
      !isCurrent && page.canEdit
        ? form({ method: "POST", action: `/wiki/restore/${encodeURIComponent(page.id)}` },
            input({ type: "hidden", name: "version", value: v.key }),
            tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
            button({ type: "submit", class: "update-btn" }, i18n.wikiRestore))
        : null
    ),
    p({ class: "card-footer" }, span({ class: "date-link" }, moment(v.createdAt).format("YYYY/MM/DD HH:mm")), userLink(v.author))
  );
};

exports.wikiHistoryView = async (page, params = {}) => {
  const tribeId = page.tribeId || null;
  const versions = page.versions.slice().reverse();
  const census = Array.isArray(params.censusList) ? params.censusList : [];
  return template(
    page.title,
    section(renderHeader(params.tribe || null), renderFilters("all", "", { ...params, emptyMod: census.length === 0 }, census)),
    section(
      div({ class: "tags-header" }, h2(i18n.wikiHistory)),
      div({ class: "wiki-history" }, ...versions.map((v, i) => versionRow(page, v, page.versions.length - 1 - i, page.tipId, tribeId)))
    )
  );
};

exports.wikiPageView = async (page, params = {}) => {
  const tribeId = page.tribeId || null;
  const base = pageHref(tribeId ? page.id : page.slug, tribeId);
  const sep = tribeId ? "&" : "?";
  const version = params.version || null;
  const diffVersion = params.diff || null;
  const shownTitle = version ? version.title : page.title;
  const shownBody = version ? version.body : page.body;
  const census = Array.isArray(params.censusList) ? params.censusList : [];
  const subscriptionNodes = params.subscription
    ? renderSubscriptionBox({ target: page.id, scope: "wiki", subscribed: params.subscription.subscribed, count: params.subscription.count, isOwner: page.isOwner, returnTo: base, inline: true })
    : null;
  const actions = div({ class: "tribe-side-actions wiki-actions-top" },
    subscriptionNodes && subscriptionNodes.length
      ? span({ class: "wiki-actions-subscription" }, ...subscriptionNodes)
      : null,
    page.canEdit && !version
      ? form({ method: "GET", action: "/wiki" },
          input({ type: "hidden", name: "filter", value: "edit" }),
          input({ type: "hidden", name: "id", value: page.id }),
          tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
          button({ type: "submit", class: "update-btn" }, i18n.wikiEdit))
      : null,
    form({ method: "GET", action: `/wiki/${encodeURIComponent(page.id)}/history` },
      tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null,
      button({ type: "submit", class: "update-btn" }, `${i18n.wikiHistory} (${page.versionCount})`)),
    form({ method: "GET", action: `/wiki/${encodeURIComponent(page.id)}/pdf` },
      button({ type: "submit", class: "update-btn" }, i18n.wikiExportPdf)),
    page.isOwner
      ? form({ method: "POST", action: `/wiki/delete/${encodeURIComponent(page.id)}` }, tribeId ? input({ type: "hidden", name: "tribeId", value: tribeId }) : null, button({ type: "submit", class: "delete-btn" }, i18n.wikiDelete))
      : null
  );
  let diffBlock = null;
  if (diffVersion) {
    const idx = page.versions.findIndex(v => v.key === diffVersion.key);
    const prev = idx > 0 ? page.versions[idx - 1] : null;
    diffBlock = div({ class: "card-section" },
      h3(`${i18n.wikiDiff}: ${i18n.wikiVersion} ${idx} → ${idx + 1}`),
      renderDiff(prev ? prev.body : "", diffVersion.body)
    );
  }
  return template(
    page.title,
    section(renderHeader(params.tribe || null), renderFilters("all", "", { ...params, emptyMod: census.length === 0 }, census)),
    section(
      div({ class: "trending-card wiki-page" },
        div({ class: "card-header activity-card-header" },
          span(),
          renderContentActions(page.id, base, { author: page.author, reportTitle: page.title, favKind: 'wiki', isFavorite: page.isFavorite, spread: params.spread || null })
        ),
        div({ class: "card-section" },
          actions,
          h2({ class: "wiki-page-title" }, shownTitle),
          div({ class: "card-chips-row" }, ...pageChips(page)),
          version ? p({ class: "wiki-version-notice" }, `${i18n.wikiViewingVersion} (${moment(version.createdAt).format("YYYY/MM/DD HH:mm")}) — `, a({ href: base }, i18n.wikiBackToPage)) : null,
          diffBlock || renderWikiBody(shownBody, { missing: page.missingLinks, tribeId }),
          renderTags(page.tags),
          renderCardMetaRow(p({ class: "card-footer" },
            span({ class: "date-link" }, `${moment(page.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
            userLink(page.author)
          ))
        ),
      ),
      div({ class: "card-section wiki-backlinks" },
        h3(i18n.wikiLinkedPages),
        page.linkedPages && page.linkedPages.length
          ? ul(...page.linkedPages.map(b => li(a({ href: pageHref(b.tribeId ? b.id : b.slug, b.tribeId) }, b.title))))
          : p(i18n.wikiNoLinkedPages)
      )
    )
  );
};

exports.renderTribeWikiSection = (tribe, pages) => {
  const items = Array.isArray(pages) ? pages : [];
  const createBtn = form({ method: "GET", action: "/wiki" },
    input({ type: "hidden", name: "filter", value: "create" }),
    input({ type: "hidden", name: "tribeId", value: tribe.id }),
    button({ type: "submit", class: "create-button" }, i18n.tribeWikiCreate));
  const header = div({ class: "tribe-content-header" }, h2(i18n.tribeSectionWiki), createBtn);
  if (!items.length) return div({ class: "tribe-content-list" }, header, p(i18n.tribeWikiEmpty));
  return div({ class: "tribe-content-list" },
    header,
    a({ href: `/wiki?filter=changes&tribeId=${encodeURIComponent(tribe.id)}`, class: "filter-btn" }, String(i18n.wikiChanges).toUpperCase()),
    div({ class: "tribe-grid" }, ...items.map(pg => renderPageCard(pg, { tribeId: tribe.id })))
  );
};

exports.renderWikiBody = renderWikiBody;
exports.diffLines = diffLines;
