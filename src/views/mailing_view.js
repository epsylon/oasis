const { div, h2, h3, p, section, button, form, a, span, br, textarea, input, label, select, option, details, summary, ul, li, table, tr, td } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderStateChip, renderOpenClosedChip, renderContentActions, renderModuleStats, moduleIsEmpty } = require("./main_views");
const { renderUrl } = require("../backend/renderUrl");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");

const userId = config.keys.id;
const BASE_FILTERS = ["ALL", "MINE", "SUBSCRIBED", "RECENT"];
const TYPE_FILTERS = ["OPEN", "CLOSED"];
const STATUS_FILTERS = ["ACTIVE", "ARCHIVED"];
const HISTORY_MODES = ["DATE", "THREADS", "INHABITANTS"];
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const baseLabel = (f) => String(i18n[`mailingFilter${cap(f)}`] || f).toUpperCase();
const typeLabel = (t) => String(i18n[`mailingType${cap(t)}`] || t).toUpperCase();
const statusLabel = (s) => String(i18n[`mailingStatus${cap(s)}`] || s).toUpperCase();
const historyLabel = (m) => String(i18n[`mailingHistory${cap(m)}`] || m).toUpperCase();

const listHref = (list) => `/mailing/${encodeURIComponent(list.id)}`;
const fmt = (d) => moment(d).format("YYYY/MM/DD HH:mm");

const statusChip = (list) => renderStateChip(list.status === "ACTIVE" ? "mutuals" : "closed", list.status === "ACTIVE" ? "✓" : "✗", statusLabel(list.status));
const countsLine = (list) => span({ class: "card-label activity-update-counts mailing-counts" }, `👥: ${list.participantCount || 0} · 💬 ${list.messageCount || 0}`);

const subscribeForm = (list, returnTo) => {
  if (list.isOwner) return null;
  if (list.closed) {
    return list.isMember
      ? form({ method: "POST", action: `/mailing/leave/${encodeURIComponent(list.id)}` }, button({ type: "submit", class: "tribe-action-btn danger-btn" }, String(i18n.subscriptionUnsubscribe).toUpperCase()))
      : null;
  }
  return form({ method: "POST", action: "/subscriptions/toggle" },
    input({ type: "hidden", name: "target", value: list.id }),
    input({ type: "hidden", name: "scope", value: "mailing" }),
    input({ type: "hidden", name: "on", value: list.isMember ? "0" : "1" }),
    input({ type: "hidden", name: "returnTo", value: returnTo }),
    button({ type: "submit", class: list.isMember ? "tribe-action-btn danger-btn" : "tribe-action-btn" }, String(list.isMember ? i18n.subscriptionUnsubscribe : i18n.subscriptionSubscribe).toUpperCase())
  );
};

const writeForm = (list) => (list.status === "ACTIVE" && (!list.closed || list.isMember))
  ? form({ method: "GET", action: `${listHref(list)}#compose` }, input({ type: "hidden", name: "write", value: "1" }), button({ type: "submit", class: "tribe-action-btn" }, String(i18n.mailingWriteButton).toUpperCase()))
  : null;

const renderTags = (tags) => (Array.isArray(tags) && tags.length)
  ? div({ class: "card-tags" }, ...tags.map(t => a({ href: `/search?query=%23${encodeURIComponent(t)}`, class: "tag-link" }, `#${t}`)))
  : null;

const mailingChipFor = (mode, census) => {
  if (mode === "ALL") return true;
  if (!Array.isArray(census)) return true;
  if (mode === "MINE") return census.some(l => String(l.author) === String(userId));
  if (mode === "SUBSCRIBED") return census.some(l => l.isMember && String(l.author) !== String(userId));
  if (mode === "RECENT") return census.some(l => l.lastActivityTs >= Date.now() - RECENT_MS);
  if (mode === "OPEN") return census.some(l => !l.closed);
  if (mode === "CLOSED") return census.some(l => l.closed);
  if (STATUS_FILTERS.includes(mode)) return census.some(l => l.status === mode);
  return census.length > 0;
};
exports.mailingChipFor = mailingChipFor;

const renderArchiveItem = (list, params = {}) =>
  li({ class: "mailing-archive-item" },
    div({ class: "emergency-update-head mailing-archive-head" },
      div({ class: "mailing-archive-meta" },
        span({ class: "date-link" }, fmt(list.lastActivityTs || list.createdAt)),
        userLink(list.author),
        countsLine(list),
        renderOpenClosedChip(list.listType, i18n),
        statusChip(list)
      ),
      renderContentActions(list.id, listHref(list), { author: list.author, favKind: "mailing", isFavorite: list.isFavorite, reportTitle: list.title, spread: (params.spreadMap && params.spreadMap.get(list.id)) || null })
    ),
    div({ class: "emergency-update-head mailing-archive-row" },
      h2({ class: "mailing-archive-title" }, a({ href: listHref(list) }, list.title || "—")),
      subscribeForm(list, "/mailing") ? div({ class: "tribe-side-actions emergency-update-actions" }, subscribeForm(list, "/mailing")) : null
    )
  );

const chipButtons = (modes, filter, census, labelOf) =>
  modes.filter(m => m === filter || mailingChipFor(m, census)).map(m => button({ type: "submit", name: "filter", value: m, class: filter === m ? "filter-btn active" : "filter-btn" }, labelOf(m)));

const renderFilters = (filter, q, census, emptyMod) =>
  section(
    div({ class: "filters" },
      form({ method: "GET", action: "/mailing", class: "ui-toolbar ui-toolbar--filters" },
        input({ type: "hidden", name: "q", value: q || "" }),
        ...(emptyMod ? [] : [
          ...chipButtons(BASE_FILTERS, filter, census, baseLabel),
          ...chipButtons(TYPE_FILTERS, filter, census, typeLabel),
          ...chipButtons(STATUS_FILTERS, filter, census, statusLabel)
        ]),
        button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.mailingCreate)
      )
    )
  );

const renderForm = (list) =>
  div({ class: "report-form" },
    h2(list ? i18n.mailingUpdateSectionTitle : i18n.mailingCreateSectionTitle),
    form({ method: "POST", action: list ? `/mailing/update/${encodeURIComponent(list.id)}` : "/mailing/create" },
      label(i18n.mailingTitleLabel), br(),
      input({ type: "text", name: "title", maxlength: "100", required: true, placeholder: i18n.mailingTitlePlaceholder, value: list ? list.title : "" }), br(),
      label(i18n.mailingDescriptionLabel), br(),
      textarea({ name: "description", rows: 4, maxlength: "1000", placeholder: i18n.mailingDescriptionPlaceholder }, list ? list.description : ""), br(),
      list
        ? [
            label(i18n.mailingStatusLabel), br(),
            select({ name: "status" }, ...STATUS_FILTERS.map(st => option({ value: st, ...(st === list.status ? { selected: true } : {}) }, statusLabel(st)))), br(), br()
          ]
        : [
            label(i18n.mailingTypeLabel), br(),
            select({ name: "listType" }, ...TYPE_FILTERS.map(t => option({ value: t }, typeLabel(t)))), br(), br()
          ],
      (!list || list.closed)
        ? [
            label(i18n.mailingMembersLabel), br(),
            textarea({ name: "members", rows: 3, maxlength: "4000", placeholder: i18n.mailingMembersPlaceholder }, list ? list.members.filter(m => m !== list.author).join(", ") : ""), br()
          ]
        : null,
      label(i18n.mailingTagsLabel), br(),
      input({ type: "text", name: "tags", maxlength: "200", placeholder: i18n.mailingTagsPlaceholder, value: list ? list.tags.join(", ") : "" }), br(), br(),
      button({ type: "submit", class: "create-button" }, list ? i18n.mailingUpdate : i18n.mailingCreate)
    )
  );

const renderHeader = () => div({ class: "tags-header module-header-line" }, h2(i18n.mailingTitle), p(i18n.mailingDescription));

exports.mailingView = async (lists, filter = "ALL", params = {}) => {
  const list = Array.isArray(lists) ? lists : [];
  const q = String(params.q || "").trim();
  const census = Array.isArray(params.censusList) ? params.censusList : list;
  const f = String(filter || "ALL").toUpperCase();
  const isForm = f === "CREATE" || f === "EDIT";
  const emptyMod = !isForm && moduleIsEmpty(census, "ALL", "ALL", q);
  return template(
    i18n.mailingTitle,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.mailingTitle), p(i18n.mailingDescription)),
      renderFilters(isForm ? "ALL" : f, q, isForm ? [] : census, emptyMod)
    ),
    section(
      isForm
        ? renderForm(f === "EDIT" ? params.list : null)
        : [
            emptyMod ? null : div({ class: "filters activity-filter-chips activity-toolbar-row" },
              renderModuleStats(list.length, [
                { label: typeLabel("OPEN"), count: list.filter(l => !l.closed).length },
                { label: typeLabel("CLOSED"), count: list.filter(l => l.closed).length },
                { label: statusLabel("ARCHIVED"), count: list.filter(l => l.status === "ARCHIVED").length }
              ]),
              form({ method: "GET", action: "/mailing", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: f }),
                input({ type: "text", name: "q", value: q, placeholder: i18n.mailingSearchPlaceholder, class: "filter-box__input" }),
                div({ class: "filter-box__controls" }, button({ type: "submit", class: "filter-box__button" }, i18n.searchButton))
              )
            ),
            list.length ? ul({ class: "mailing-archive" }, ...list.slice().sort((x, y) => (y.lastActivityTs || 0) - (x.lastActivityTs || 0)).map(l => renderArchiveItem(l, params))) : p(i18n.mailingNoItems)
          ]
    )
  );
};

const renderMessage = (list, m, opts = {}) =>
  div({ class: "mailing-message" },
    div({ class: "emergency-update-head mailing-message-head" },
      span({ class: "mailing-message-subject" }, m.subject || i18n.pmNoSubject),
      list.canWrite && !opts.noReply
        ? div({ class: "tribe-side-actions emergency-update-actions" },
            form({ method: "GET", action: `${listHref(list)}#compose`, class: "mailing-reply-form" },
              input({ type: "hidden", name: "write", value: "1" }),
              input({ type: "hidden", name: "reply", value: m.mid }),
              input({ type: "hidden", name: "history", value: opts.mode || "DATE" }),
              button({ type: "submit", class: "tribe-action-btn" }, String(i18n.pmReply || "Reply").toUpperCase())
            )
          )
        : null
    ),
    div({ class: "mailing-message-text" }, ...renderUrl(m.text || "")),
    p({ class: "card-footer" }, span({ class: "date-link" }, fmt(m.sentAt)), userLink(m.author))
  );

const renderHistory = (list, history, mode) => {
  if (!history.length) return p(i18n.mailingNoMessages);
  if (mode === "THREADS") {
    const groups = new Map();
    for (const m of history) {
      if (!groups.has(m.thread)) groups.set(m.thread, []);
      groups.get(m.thread).push(m);
    }
    const ordered = Array.from(groups.values()).sort((x, y) => y[y.length - 1].ts - x[x.length - 1].ts);
    return div({ class: "mailing-threads" }, ...ordered.map(msgs => {
      const root = msgs[0];
      const replies = msgs.slice(1);
      return div({ class: "mailing-thread" },
        renderMessage(list, root, { mode }),
        replies.length
          ? details({ class: "mailing-thread-details" },
              summary(`${replies.length} ${replies.length === 1 ? (i18n.pmReply || "reply") : (i18n.pmReplies || "replies")}`),
              ...replies.map(r => renderMessage(list, r, { mode }))
            )
          : null
      );
    }));
  }
  if (mode === "INHABITANTS") {
    const groups = new Map();
    for (const m of history) {
      if (!groups.has(m.author)) groups.set(m.author, []);
      groups.get(m.author).push(m);
    }
    const ordered = Array.from(groups.entries()).sort((x, y) => y[1].length - x[1].length);
    return div({ class: "mailing-by-author" }, ...ordered.map(([author, msgs]) =>
      div({ class: "mailing-author-group" },
        h3({ class: "mailing-author-title" }, userLink(author), span({ class: "mailing-author-count" }, ` · ${msgs.length}`)),
        ...msgs.slice().sort((x, y) => y.ts - x.ts).map(m => renderMessage(list, m, { mode }))
      )
    ));
  }
  return div({ class: "mailing-by-date" }, ...history.slice().sort((x, y) => y.ts - x.ts).map(m => renderMessage(list, m, { mode })));
};

const renderCompose = (list, params) => {
  const parent = params.replyTo ? (list.history || []).find(m => m.mid === params.replyTo || m.key === params.replyTo) : null;
  const subject = parent ? (/^\s*RE:/i.test(parent.subject) ? parent.subject : `RE: ${parent.subject}`) : "";
  return div({ class: "div-center audio-form mailing-compose", id: "compose" },
    h2(parent ? i18n.mailingReplyTitle : i18n.mailingWriteTitle),
    form({ method: "POST", action: `/mailing/${encodeURIComponent(list.id)}/message` },
      parent ? input({ type: "hidden", name: "thread", value: parent.thread }) : null,
      params.returnTo ? input({ type: "hidden", name: "returnTo", value: params.returnTo }) : null,
      label(i18n.pmSubject), br(),
      input({ type: "text", name: "subject", maxlength: "150", placeholder: i18n.pmSubjectHint, value: subject }), br(), br(),
      label(i18n.pmText), br(),
      textarea({ name: "text", rows: 8, maxlength: "7000", required: true, autofocus: true, placeholder: parent ? parent.text.split("\n").map(l => `> ${l}`).join("\n") : i18n.mailingTextPlaceholder }), br(), br(),
      button({ type: "submit", class: "create-button" }, i18n.mailingSend)
    )
  );
};

exports.singleMailingView = async (list, params = {}) => {
  const isAuthor = String(list.author) === String(userId);
  const href = listHref(list);
  const census = Array.isArray(params.censusList) ? params.censusList : [];
  const history = Array.isArray(list.history) ? list.history : [];
  const mode = HISTORY_MODES.includes(String(params.history || "").toUpperCase()) ? String(params.history).toUpperCase() : "THREADS";
  const q = String(params.q || "").trim();
  const shown = q ? history.filter(m => [m.subject, m.text, m.author].some(v => String(v || "").toLowerCase().includes(q.toLowerCase()))) : history;
  const historyChips = history.length
    ? div({ class: "activity-sub-filter" },
        ...HISTORY_MODES.map(m => form({ class: "sub-filter-form", method: "GET", action: `${href}#history` },
          input({ type: "hidden", name: "history", value: m }),
          input({ type: "hidden", name: "q", value: q }),
          button({ type: "submit", class: mode === m ? "filter-btn active" : "filter-btn" }, historyLabel(m))
        ))
      )
    : null;
  const sideActions = [subscribeForm(list, href)].filter(Boolean);
  const ownerActions = isAuthor
    ? [
        form({ method: "GET", action: "/mailing" }, input({ type: "hidden", name: "filter", value: "edit" }), input({ type: "hidden", name: "id", value: list.id }), button({ type: "submit", class: "update-btn" }, i18n.mailingUpdate)),
        form({ method: "POST", action: `/mailing/delete/${encodeURIComponent(list.id)}` }, button({ type: "submit", class: "delete-btn" }, i18n.mailingDelete))
      ]
    : [];
  const side = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(list.id, null, { author: list.author, favKind: "mailing", isFavorite: list.isFavorite, reportTitle: list.title, spread: params.spread || null })
    ),
    div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, list.title)),
    div({ class: "card-chips-row" }, renderOpenClosedChip(list.listType, i18n), statusChip(list)),
    list.description ? p({ class: "tribe-side-description" }, ...renderUrl(list.description)) : null,
    table({ class: "tribe-info-table jobs-info-table" },
      tr(
        td({ class: "tribe-info-label" }, i18n.createdAtLabel || "Created at"),
        td({ class: "tribe-info-value", colspan: "3" }, fmt(list.createdAt))
      ),
      tr(
        td({ class: "tribe-info-value", colspan: "4" }, userLink(list.author))
      )
    ),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.mailingSubscribers}: ${list.participantCount || 0}`)
    ),
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null,
    isAuthor
      ? div({ class: "tribe-side-actions housing-status-row" },
          span({ class: "card-label" }, `${i18n.statusLabel || "Status"}: `),
          statusChip(list),
          form({ method: "POST", action: `/mailing/status/${encodeURIComponent(list.id)}`, class: "inline-form" },
            button({ class: "tribe-action-btn", type: "submit", name: "status", value: list.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" },
              String(list.status === "ACTIVE" ? i18n.mailingArchive : i18n.mailingActivate).toUpperCase())
          )
        )
      : null,
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.mailingMessagesLabel}: ${list.messageCount || 0}`)
    ),
    writeForm(list) ? div({ class: "tribe-side-actions" }, writeForm(list)) : null,
    div({ class: "doc-export-actions" },
      form({ method: "GET", action: `${href}/pdf` }, button({ type: "submit", class: "filter-btn" }, i18n.mailingGenerateReport)),
      form({ method: "POST", action: `${href}/share` }, button({ type: "submit", class: "filter-btn" }, i18n.sharePm))
    ),
    renderTags(list.tags),
    ownerActions.length ? div({ class: "tribe-side-actions owner-actions" }, ...ownerActions) : null
  );
  const main = div({ class: "tribe-main" },
    params.write && list.status === "ACTIVE" && (!list.closed || list.isMember) ? renderCompose(list, params) : null,
    div({ class: "card-section mailing-history", id: "history" },
      historyChips,
      history.length
        ? form({ method: "GET", action: `${href}#history`, class: "filter-box" },
            input({ type: "hidden", name: "history", value: mode }),
            input({ type: "text", name: "q", value: q, placeholder: i18n.mailingHistorySearchPlaceholder, class: "filter-box__input" }),
            div({ class: "filter-box__controls" }, button({ type: "submit", class: "filter-box__button" }, i18n.searchButton))
          )
        : null,
      renderHistory(list, shown, mode)
    )
  );
  return template(
    list.title,
    section(renderHeader(), renderFilters("ALL", "", census, census.length === 0)),
    section(div({ class: "tribe-details" }, side, main))
  );
};
