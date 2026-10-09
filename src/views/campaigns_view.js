const { div, h2, h3, p, section, button, form, a, span, br, textarea, input, label, select, option, img, progress, table, tr, td, video: videoHyperaxe } = require("../server/node_modules/hyperaxe");
const { clearnetItemHref, template, i18n, userLink, renderStateChip, renderContentActions, renderSubscriptionBox, renderModuleStats, renderOpinionsVoting, renderEngagement, moduleIsEmpty, contentDeleteAction, paged } = require("./main_views");
const { renderReachChip, renderClearnetSelector, renderClearnetSwitch } = require("./clearnet_view");
const { renderCommentsSection } = require("./comments_view");
const { renderMapEmbed } = require("./maps_view");
const { renderStyledText } = require("../backend/renderStyledText");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const sharedState = require("../configs/shared-state");

const userId = config.keys.id;
const BASE_FILTERS = ["RECENT", "MINE", "ALL", "SIGNED", "TOP"];
const STATUSES = ["OPEN", "ACHIEVED", "CLOSED"];
const CATEGORIES = ["ENVIRONMENT", "RIGHTS", "HEALTH", "EDUCATION", "INFRASTRUCTURE", "CULTURE", "ECONOMY", "OTHER"];

const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const filterLabel = (f) => String(i18n[`campaignFilter${cap(f)}`] || f).toUpperCase();
const statusLabel = (s) => String(i18n[`campaignStatus${cap(s)}`] || s).toUpperCase();
const catLabel = (c) => String(i18n[`campaignCategory${cap(c)}`] || c).toUpperCase();
const campaignHref = (cp) => `/campaigns/${encodeURIComponent(cp.id)}`;
const fmt = (d) => moment(d).format("YYYY/MM/DD HH:mm");

const statusChip = (cp) => renderStateChip(cp.closed ? "closed" : "mutuals", cp.closed ? "✗" : "✓", statusLabel(cp.closed ? "CLOSED" : "OPEN"));
const outcomeChip = (cp) => cp.closed ? renderStateChip(cp.achieved ? "mutuals" : "closed", cp.achieved ? "✓" : "✗", cp.achieved ? statusLabel("ACHIEVED") : String(i18n.campaignStatusUnachieved || "UNACHIEVED").toUpperCase()) : null;
const categoryChip = (cp) => renderStateChip("neutral", "", catLabel(cp.category));
const clearnetEligible = (cp) => String(cp.status || "OPEN").toUpperCase() !== "CLOSED" && !cp.tribeId && !cp.encrypted;

const renderTags = (tags) => (Array.isArray(tags) && tags.length)
  ? div({ class: "card-tags" }, ...tags.map(t => a({ href: `/search?query=%23${encodeURIComponent(t)}`, class: "tag-link" }, `#${t}`)))
  : null;

const renderProgress = (cp) =>
  div({ class: "tribe-card-members campaign-progress" },
    span({ class: "tribe-members-count" }, `${i18n.campaignSignaturesLabel}: ${cp.signatureCount} / ${cp.goal} (${cp.progress}%)`),
    progress({ class: "confirmations-progress", value: String(cp.signatureCount), max: String(cp.goal || 1) })
  );

const renderCover = (cp) => {
  if (!cp.media || !cp.media.blobId) return null;
  if (cp.media.kind === "video") return videoHyperaxe({ class: "campaign-card-cover", src: `/blob/${encodeURIComponent(cp.media.blobId)}`, controls: true, preload: "metadata" });
  return a({ href: campaignHref(cp) }, img({ loading: 'lazy', class: "campaign-card-cover", src: `/blob/${encodeURIComponent(cp.media.blobId)}`, alt: cp.title || "" }));
};

const campaignChipFor = (mode, census) => {
  if (mode === "ALL") return true;
  if (!Array.isArray(census)) return true;
  if (mode === "MINE") return census.some(c => String(c.author) === String(userId));
  if (mode === "SIGNED") return census.some(c => Array.isArray(c.signers) && c.signers.includes(userId));
  if (mode === "RECENT") return census.length > 0;
  if (mode === "TOP") return census.some(c => c.signatureCount > 0);
  if (STATUSES.includes(mode)) return census.some(c => c.status === mode);
  if (CATEGORIES.includes(mode)) return census.some(c => c.category === mode);
  return census.length > 0;
};
exports.campaignChipFor = campaignChipFor;

const renderCampaignCard = (cp, params = {}) =>
  div({ class: `tribe-card campaign-card campaign-${cp.status.toLowerCase()}` },
    div({ class: "card-header activity-card-header" },
      span(),
      renderContentActions(cp.id, campaignHref(cp), { author: cp.author, favKind: "campaigns", isFavorite: cp.isFavorite, reportTitle: cp.title, spread: (params.spreadMap && params.spreadMap.get(cp.id)) || null, deleteAction: cp.isOwner ? contentDeleteAction("campaign", cp.id) : undefined })
    ),
    div({ class: "tribe-card-body" },
      renderCover(cp),
      div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, a({ href: campaignHref(cp) }, cp.title || "—"))),
      div({ class: "card-chips-row" }, statusChip(cp), outcomeChip(cp), categoryChip(cp), cp.clearnet === true && clearnetEligible(cp) ? renderReachChip(true, i18n, clearnetItemHref("campaigns", cp.title, cp.id)) : null),
      renderProgress(cp),
      cp.deadline ? p({ class: "job-meta-line" }, `${i18n.campaignDeadlineLabel}: ${fmt(cp.deadline)}`) : null
    )
  );

const chipButtons = (modes, filter, census, labelOf) =>
  modes.filter(m => m === filter || campaignChipFor(m, census)).map(m => button({ type: "submit", name: "filter", value: m, class: filter === m ? "filter-btn active" : "filter-btn" }, labelOf(m)));

const renderFilters = (filter, q, census, emptyMod) =>
  section(
    div({ class: "filters" },
      form({ method: "GET", action: "/campaigns", class: "ui-toolbar ui-toolbar--filters" },
        input({ type: "hidden", name: "q", value: q || "" }),
        ...(emptyMod ? [] : [
          ...chipButtons(BASE_FILTERS, filter, census, filterLabel),
          ...chipButtons(STATUSES, filter, census, statusLabel),
          ...chipButtons(CATEGORIES, filter, census, catLabel)
        ]),
        button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.campaignCreate)
      )
    )
  );

const renderForm = (cp) =>
  div({ class: "report-form" },
    h2(cp ? i18n.campaignUpdateSectionTitle : i18n.campaignCreateSectionTitle),
    form({ method: "POST", action: cp ? `/campaigns/update/${encodeURIComponent(cp.id)}` : "/campaigns/create", enctype: "multipart/form-data" },
      label(i18n.campaignTitleLabel), br(),
      input({ type: "text", name: "title", maxlength: "120", required: true, placeholder: i18n.campaignTitlePlaceholder, value: cp ? cp.title : "" }), br(),
      label(i18n.campaignTextLabel), br(),
      textarea({ name: "text", rows: 10, maxlength: "8000", placeholder: i18n.campaignTextPlaceholder }, cp ? cp.text : ""), br(),
      label(i18n.uploadMedia), br(),
      input({ type: "file", name: "blob", accept: "image/*,video/*,audio/*,application/pdf,.torrent" }), br(), br(),
      label(i18n.campaignCategoryLabel), br(),
      select({ name: "category" }, ...CATEGORIES.map(c => option({ value: c, ...((cp ? cp.category : "OTHER") === c ? { selected: true } : {}) }, catLabel(c)))), br(), br(),
      label(i18n.campaignGoalLabel), br(),
      input({ type: "number", name: "goal", min: "1", step: "1", required: true, placeholder: String((sharedState.getInhabitantCount && sharedState.getInhabitantCount()) || 100), value: cp ? String(cp.goal) : "" }), br(), br(),
      label(i18n.campaignDeadlineLabel), br(),
      input({ type: "datetime-local", name: "deadline", min: moment().format("YYYY-MM-DDTHH:mm"), value: cp && cp.deadline ? moment(cp.deadline).format("YYYY-MM-DDTHH:mm") : "" }), br(), br(),
      label(i18n.mapLocationTitle || "Map Location"), br(),
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: cp ? cp.mapUrl : "" }), br(),
      label(i18n.campaignTagsLabel), br(),
      input({ type: "text", name: "tags", maxlength: "200", placeholder: i18n.campaignTagsPlaceholder, value: cp ? cp.tags.join(", ") : "" }), br(), br(),
      ...(!cp || clearnetEligible(cp) ? [renderClearnetSelector(!!cp && cp.clearnet === true, i18n), br()] : []),
      button({ type: "submit", class: "create-button" }, cp ? i18n.campaignUpdate : i18n.campaignCreate)
    )
  );

exports.campaignsView = async (campaigns, filter = "ALL", params = {}) => {
  const list = Array.isArray(campaigns) ? campaigns : [];
  const q = String(params.q || "").trim();
  const census = Array.isArray(params.censusList) ? params.censusList : list;
  const f = String(filter || "ALL").toUpperCase();
  const isForm = f === "CREATE" || f === "EDIT";
  const emptyMod = !isForm && moduleIsEmpty(census, "ALL", "ALL", q);
  return template(
    i18n.campaignsTitle,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.campaignsTitle), p(i18n.campaignsDescription)),
      renderFilters(isForm ? "ALL" : f, q, isForm ? [] : census, emptyMod)
    ),
    section(
      isForm
        ? renderForm(f === "EDIT" ? params.campaign : null)
        : [
            emptyMod ? null : div({ class: "filters activity-filter-chips activity-toolbar-row" },
              renderModuleStats(list.length, STATUSES.map(s => ({ label: statusLabel(s), count: list.filter(c => c.status === s).length }))),
              form({ method: "GET", action: "/campaigns", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: f }),
                input({ type: "text", name: "q", value: q, placeholder: i18n.campaignSearchPlaceholder, class: "filter-box__input" }),
                div({ class: "filter-box__controls" }, button({ type: "submit", class: "filter-box__button" }, i18n.searchButton))
              )
            ),
            div({ class: "tribe-grid" }, list.length ? paged(list).map(c => renderCampaignCard(c, params)) : p(i18n.campaignNoItems))
          ]
    )
  );
};

const renderSignatures = (cp) =>
  div({ class: "card-section campaign-signatures" },
    h3(`${i18n.campaignSignaturesTitle} (${cp.signatureCount})`),
    cp.signatureCount
      ? div({ class: "campaign-signature-list" }, ...cp.signatures.slice().reverse().map(s => div({ class: "campaign-signature" },
          div({ class: "campaign-signature-head" }, userLink(s.author), span({ class: "date-link" }, fmt(s.createdAt))),
          s.text ? p({ class: "campaign-signature-text" }, s.text) : null
        )))
      : p(i18n.campaignNoSignatures)
  );

const renderUpdate = (cp, u, href, editing) =>
  div({ class: "campaign-update", id: `update-${encodeURIComponent(u.id)}` },
    div({ class: "emergency-update-head campaign-update-head" },
      div({ class: "card-chips-row" },
        u.edited ? renderStateChip("neutral", "", i18n.campaignUpdateEdited) : null
      ),
      cp.isOwner
        ? div({ class: "tribe-side-actions emergency-update-actions" },
            editing ? null : form({ method: "GET", action: `${href}#update-${encodeURIComponent(u.id)}` }, input({ type: "hidden", name: "editUpdate", value: u.id }), button({ type: "submit", class: "update-btn" }, i18n.campaignUpdate)),
            form({ method: "POST", action: `/campaigns/updates/${encodeURIComponent(u.id)}/delete` }, button({ type: "submit", class: "delete-btn" }, i18n.campaignDelete))
          )
        : null
    ),
    editing
      ? form({ method: "POST", action: `/campaigns/updates/${encodeURIComponent(u.id)}/edit`, enctype: "multipart/form-data", class: "campaign-update-form" },
          textarea({ name: "text", rows: 3, maxlength: "3000", required: true, autofocus: true }, u.text), br(),
          input({ type: "file", name: "blob", accept: "image/*,video/*,audio/*,application/pdf,.torrent" }), br(), br(),
          button({ type: "submit", class: "create-button" }, i18n.campaignUpdate)
        )
      : div({ class: "campaign-update-text" }, ...renderStyledText(u.text)),
    p({ class: "card-footer" }, span({ class: "date-link" }, `${fmt(u.createdAt)}`), userLink(u.author))
  );

const renderUpdates = (cp, href, editUpdate) =>
  div({ class: "card-section campaign-updates" },
    h3(i18n.campaignUpdatesTitle),
    cp.updates.length
      ? div({ class: "campaign-updates-list" }, ...cp.updates.slice().reverse().map(u => renderUpdate(cp, u, href, editUpdate === u.id)))
      : p(i18n.campaignNoUpdates),
    cp.isOwner
      ? form({ method: "POST", action: `/campaigns/updates/${encodeURIComponent(cp.id)}`, enctype: "multipart/form-data", class: "campaign-update-form" },
          textarea({ name: "text", rows: 3, maxlength: "3000", required: true, placeholder: i18n.campaignUpdatePlaceholder }), br(),
          input({ type: "file", name: "blob", accept: "image/*,video/*,audio/*,application/pdf,.torrent" }), br(), br(),
          button({ type: "submit", class: "create-button" }, i18n.campaignAddUpdate)
        )
      : null
  );

exports.singleCampaignView = async (cp, params = {}) => {
  const href = campaignHref(cp);
  const canClearnet = clearnetEligible(cp);
  const isClearnet = canClearnet && !!cp.clearnet;
  const census = Array.isArray(params.censusList) ? params.censusList : [];
  const sideActions = [];
  const ownerActions = cp.isOwner
    ? [
        form({ method: "GET", action: "/campaigns" }, input({ type: "hidden", name: "filter", value: "edit" }), input({ type: "hidden", name: "id", value: cp.id }), button({ type: "submit", class: "update-btn" }, i18n.campaignUpdate))
      ].filter(Boolean)
    : [];
  const side = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(cp.id, href, { author: cp.author, favKind: "campaigns", isFavorite: cp.isFavorite, reportTitle: cp.title, spread: params.spread || null, returnTo: href, deleteAction: cp.isOwner ? contentDeleteAction("campaign", cp.id) : undefined })
    ),
    div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, cp.title)),
    div({ class: "card-chips-row" },
      statusChip(cp), outcomeChip(cp), categoryChip(cp), cp.proposalId ? renderStateChip("neutral", "⚖", String(i18n.campaignElevated).toUpperCase()) : null,
      renderReachChip(isClearnet, i18n, isClearnet ? clearnetItemHref("campaigns", cp.title, cp.id) : null),
      cp.isOwner && canClearnet ? renderClearnetSwitch("campaigns", cp.rootId || cp.id, isClearnet) : null
    ),
    table({ class: "tribe-info-table jobs-info-table" },
      tr(
        td({ class: "tribe-info-label" }, i18n.createdAtLabel || "Created at"),
        td({ class: "tribe-info-value", colspan: "3" }, fmt(cp.createdAt))
      ),
      cp.deadline
        ? tr(
            td({ class: "tribe-info-label" }, i18n.campaignDeadlineLabel),
            td({ class: "tribe-info-value", colspan: "3" }, fmt(cp.deadline))
          )
        : null,
      tr(
        td({ class: "tribe-info-value", colspan: "4" }, userLink(cp.author))
      )
    ),
    div({ class: "campaign-qr" },
      img({ src: `${href}/qr.png`, alt: i18n.campaignQrAlt, class: "campaign-qr-img" }),
      p({ class: "campaign-qr-caption" }, i18n.campaignQrCaption)
    ),
    renderProgress(cp),
    renderMapEmbed(params.mapData, cp.mapUrl),
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null,
    div({ class: "campaign-signed" },
      cp.signed ? renderStateChip("mutuals", "✓", i18n.campaignSigned) : renderStateChip("closed", "✗", i18n.campaignNotSigned)
    ),
    cp.canElevate
      ? div({ class: "tribe-side-actions campaign-elevate" }, form({ method: "POST", action: `/campaigns/elevate/${encodeURIComponent(cp.id)}` }, button({ type: "submit", class: "tribe-action-btn" }, String(i18n.campaignElevate).toUpperCase())))
      : null,
    cp.isOwner && !cp.expired
      ? div({ class: "tribe-side-actions housing-status-row" },
          span({ class: "card-label" }, `${i18n.statusLabel || "Status"}: `),
          statusChip(cp),
          form({ method: "POST", action: `/campaigns/status/${encodeURIComponent(cp.id)}`, class: "inline-form" },
            button({ class: "tribe-action-btn", type: "submit", name: "status", value: cp.status === "CLOSED" ? "OPEN" : "CLOSED" },
              String(cp.status === "CLOSED" ? i18n.campaignReopen : i18n.campaignClose).toUpperCase())
          )
        )
      : null,
    div({ class: "doc-export-actions" },
      form({ method: "GET", action: `${href}/pdf` }, button({ type: "submit", class: "filter-btn" }, i18n.campaignGenerateReport)),
      form({ method: "POST", action: `${href}/share` }, button({ type: "submit", class: "filter-btn" }, i18n.sharePm))
    ),
    renderTags(cp.tags),
    ownerActions.length ? div({ class: "tribe-side-actions owner-actions" }, ...ownerActions) : null,
    params.subscription
      ? renderSubscriptionBox({ target: cp.id, scope: "campaigns", subscribed: params.subscription.subscribed, count: params.subscription.count, isOwner: cp.isOwner, returnTo: href, canWrite: cp.isOwner })
      : null
  );
  const main = div({ class: "tribe-main" },
    cp.text ? div({ class: "campaign-body" }, ...renderStyledText(cp.text)) : null,
    cp.canSign
      ? div({ class: "card-section campaign-sign" },
          h3(i18n.campaignSignTitle),
          form({ method: "POST", action: `/campaigns/sign/${encodeURIComponent(cp.id)}`, class: "campaign-sign-form" },
            textarea({ name: "text", rows: 3, maxlength: "500", placeholder: i18n.campaignSignPlaceholder }), br(), br(),
            button({ type: "submit", class: "create-button" }, i18n.campaignSign)
          )
        )
      : null,
    renderUpdates(cp, href, String(params.editUpdate || "")),
    renderSignatures(cp),
    renderEngagement(cp.id,
      renderOpinionsVoting("/campaigns/opinions", cp.id, cp.opinions, href, cp.opinions_inhabitants),
      renderCommentsSection({ action: `/campaigns/${encodeURIComponent(cp.id)}/comments`, comments: params.comments || [], returnTo: href })
    )
  );
  return template(
    cp.title,
    section(div({ class: "tags-header module-header-line" }, h2(i18n.campaignsTitle), p(i18n.campaignsDescription)), renderFilters("ALL", "", census, census.length === 0)),
    section(div({ class: "tribe-details" }, side, main))
  );
};

exports.clearnetCampaignView = async (cp, params = {}) => {
  const { escapeHtml: esc, renderRichText, renderKindTag, renderTagChips, blobUrl: cnBlob, renderClearnetPage } = require("./clearnet_view");
  const title = esc(cp.title || i18n.campaignLabel);
  const desc = renderRichText(cp.text || "");
  const point = params.mapPoint || null;
  const cover = cp.media && cp.media.kind === "image" ? cnBlob(cp.media.blobId) : null;
  const goal = Number(cp.goal) || 0;
  const signed = Number(cp.signatureCount) || 0;
  const pct = Math.max(0, Math.min(100, Number(cp.progress) || 0));
  const updates = (Array.isArray(cp.updates) ? cp.updates : []).filter(u => String(u.author) === String(cp.author));
  const extraCss = `
.cn-campaign-title{color:var(--fg);margin:0 0 16px 0;font-size:32px;font-weight:700}
.cn-campaign-meta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.cn-campaign-meta-item{background:var(--bg-sub);border:1px solid var(--border);border-radius:6px;padding:8px 14px;font-size:14px;color:var(--fg-soft);display:inline-flex;align-items:center;gap:6px}
.cn-campaign-progress{margin:0 0 20px 0}
.cn-campaign-progress-label{color:var(--fg);font-weight:700;font-size:15px;margin-bottom:8px}
.cn-campaign-progress progress{width:100%;height:14px;accent-color:var(--fg)}
.cn-campaign-desc{color:var(--fg-soft);line-height:1.6;font-size:15px;margin:0 0 20px 0;word-break:break-word}
.cn-campaign-update{border:1px solid var(--border);border-radius:8px;padding:12px 16px;margin:12px 0;background:var(--bg-elev)}
.cn-campaign-update-date{color:var(--fg-dim);font-size:12px;margin-bottom:6px}
.cn-campaign-update-text{color:var(--fg-soft);line-height:1.5;word-break:break-word}
`;
  const body = `
  <h1 class="cn-campaign-title">${title}</h1>
  <div class="cn-campaign-meta">
    <span class="cn-campaign-meta-item">${renderKindTag("campaign")}</span>
    <span class="cn-campaign-meta-item">${esc(statusLabel(cp.achieved ? "ACHIEVED" : "OPEN"))}</span>
    <span class="cn-campaign-meta-item">${esc(catLabel(String(cp.category || "OTHER")))}</span>
    ${cp.createdAt ? `<span class="cn-campaign-meta-item">📅 ${esc(fmt(cp.createdAt))}</span>` : ""}
    ${cp.deadline ? `<span class="cn-campaign-meta-item">⏳ ${esc(i18n.campaignDeadlineLabel)}: ${esc(fmt(cp.deadline))}</span>` : ""}
    ${point ? `<a class="cn-campaign-meta-item" href="geo:${point.lat},${point.lng}">📍 ${point.title ? `${esc(point.title)} · ` : ""}${point.lat}, ${point.lng}</a>` : ""}
  </div>
  ${goal > 0 ? `<div class="cn-campaign-progress"><div class="cn-campaign-progress-label">${esc(i18n.campaignSignaturesLabel)}: ${signed} / ${goal} (${pct}%)</div><progress value="${signed}" max="${goal}"></progress></div>` : ""}
  <hr class="cn-sep"/>
  ${desc ? `<div class="cn-campaign-desc">${desc}</div>` : ""}
  ${updates.length ? `<h2 class="cn-section">${esc(i18n.campaignUpdatesTitle)}</h2>${updates.slice().reverse().map(u => `<div class="cn-campaign-update"><div class="cn-campaign-update-date">${esc(fmt(u.updatedAt || u.createdAt))}</div><div class="cn-campaign-update-text">${renderRichText(u.text || "")}</div></div>`).join("")}` : ""}
  ${renderTagChips(cp.tags)}
`;
  return renderClearnetPage({
    title: `${cp.title || i18n.campaignLabel} | Oasis`,
    ogTitle: cp.title || i18n.campaignLabel,
    ogDescription: String(cp.text || "").replace(/!?\[[^\]]*\]\(\s*&[^)\s]+\s*\)/g, "").trim(),
    ogImage: cover,
    extraCss,
    body,
    hubFeedId: cp.author || null
  });
};
