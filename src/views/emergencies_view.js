const { div, h2, h3, p, section, button, form, a, span, br, textarea, input, label, select, option, img, video: videoHyperaxe, table, tr, td } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderStateChip, renderContentActions, renderSubscriptionBox, renderModuleStats, moduleIsEmpty } = require("./main_views");
const { renderCommentsSection } = require("./comments_view");
const { renderMapLocationVisitLabel } = require("./maps_view");
const { renderStyledText } = require("../backend/renderStyledText");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");

const userId = config.keys.id;
const CATEGORIES = ["WEATHER", "INFRASTRUCTURE", "HEALTH", "SECURITY", "LOST", "NEIGHBORHOOD"];
const SEVERITIES = ["UNVERIFIED", "LOW", "MEDIUM", "HIGH"];
const STATUSES = ["ACTIVE", "RESOLVED", "EXPIRED"];
const BASE_FILTERS = ["ALL", "MINE", "RECENT"];
const EXPIRES = ["1d", "3d", "7d", "30d"];

const catLabel = (c) => String(i18n[`emergencyCategory${c.charAt(0) + c.slice(1).toLowerCase()}`] || c).toUpperCase();
const sevLabel = (s) => String(i18n[`emergencySeverity${s.charAt(0) + s.slice(1).toLowerCase()}`] || s).toUpperCase();
const statusLabel = (s) => String(i18n[`emergencyStatus${s.charAt(0) + s.slice(1).toLowerCase()}`] || s).toUpperCase();
const baseLabel = (f) => String(i18n[`emergencyFilter${f.charAt(0) + f.slice(1).toLowerCase()}`] || f).toUpperCase();

const severityChip = (emergency) => span({ class: `emergency-severity emergency-severity-${String(emergency.severity || "UNVERIFIED").toLowerCase()}` }, `${sevLabel(emergency.severity)} · ${emergency.confirmationCount || 0}`);
const statusChip = (emergency) => renderStateChip(emergency.status === "ACTIVE" ? "mutuals" : "closed", "", statusLabel(emergency.status));
const categoryChip = (emergency) => renderStateChip("neutral", "", catLabel(emergency.category));

const renderTags = (tags) => (Array.isArray(tags) && tags.length)
  ? div({ class: "card-tags" }, ...tags.map(t => a({ href: `/search?query=%23${encodeURIComponent(t)}`, class: "tag-link" }, `#${t}`)))
  : null;

const emergencyHref = (emergency) => `/emergencies/${encodeURIComponent(emergency.id)}`;

const renderEmergencyCard = (emergency, params = {}) =>
  div({ class: `tribe-card emergency-card emergency-card-${String(emergency.severity || "UNVERIFIED").toLowerCase()}` },
    div({ class: "card-header activity-card-header" },
      span(),
      renderContentActions(emergency.id, emergencyHref(emergency), { author: emergency.author, favKind: "emergencies", isFavorite: emergency.isFavorite, reportTitle: emergency.title, spread: (params.spreadMap && params.spreadMap.get(emergency.id)) || null })
    ),
    div({ class: "tribe-card-body" },
      emergency.media && emergency.media.kind === "image" ? a({ href: emergencyHref(emergency) }, img({ class: "emergency-card-cover", src: `/blob/${encodeURIComponent(emergency.media.blobId)}`, alt: emergency.title || "" })) : null,
      emergency.media && emergency.media.kind === "video" ? videoHyperaxe({ class: "emergency-card-cover", src: `/blob/${encodeURIComponent(emergency.media.blobId)}`, controls: true, preload: "metadata" }) : null,
      div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, a({ href: emergencyHref(emergency) }, emergency.title || "—"))),
      div({ class: "card-chips-row" }, severityChip(emergency), statusChip(emergency), categoryChip(emergency)),
      emergency.expiresAt ? p({ class: "job-meta-line" }, `${i18n.emergencyExpiresAt}: ${moment(emergency.expiresAt).format("YYYY/MM/DD HH:mm")}`) : null
    )
  );

const chipVisible = (mode, filter, census) => {
  if (mode === filter || mode === "ALL") return true;
  if (mode === "MINE") return census.some(al => String(al.author) === String(userId));
  if (mode === "RECENT") return census.some(al => al.lastActivityTs >= Date.now() - 86400000);
  if (STATUSES.includes(mode)) return census.some(al => al.status === mode);
  if (SEVERITIES.includes(mode)) return census.some(al => al.severity === mode);
  if (CATEGORIES.includes(mode)) return census.some(al => al.category === mode);
  return census.length > 0;
};

const chipButtons = (modes, filter, census, labelOf) =>
  modes.filter(m => chipVisible(m, filter, census)).map(m => button({ type: "submit", name: "filter", value: m, class: filter === m ? "filter-btn active" : "filter-btn" }, labelOf(m)));

const renderFilters = (filter, q, census, emptyMod) =>
  section(
    div({ class: "filters" },
      form({ method: "GET", action: "/emergencies", class: "ui-toolbar ui-toolbar--filters" },
        input({ type: "hidden", name: "q", value: q || "" }),
        ...(emptyMod ? [] : [
          ...chipButtons(BASE_FILTERS, filter, census, baseLabel),
          ...chipButtons(SEVERITIES, filter, census, sevLabel),
          ...chipButtons(STATUSES, filter, census, statusLabel),
          ...chipButtons(CATEGORIES, filter, census, catLabel)
        ]),
        button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.emergencyCreate)
      )
    )
  );

const renderForm = (emergency, params = {}) =>
  div({ class: "div-center audio-form" },
    h2(emergency ? i18n.emergencyUpdateSectionTitle : i18n.emergencyCreateSectionTitle),
    form({ method: "POST", action: emergency ? `/emergencies/update/${encodeURIComponent(emergency.id)}` : "/emergencies/create", enctype: "multipart/form-data" },
      label(i18n.emergencyTitleLabel), br(),
      input({ type: "text", name: "title", maxlength: "100", required: true, placeholder: i18n.emergencyTitlePlaceholder, value: emergency ? emergency.title : "" }), br(), br(),
      label(i18n.emergencyCategoryLabel), br(),
      select({ name: "category" }, ...CATEGORIES.map(c => option({ value: c, ...((emergency ? emergency.category : "NEIGHBORHOOD") === c ? { selected: true } : {}) }, catLabel(c)))), br(), br(),
      label(i18n.emergencyTextLabel), br(),
      textarea({ name: "text", rows: 8, maxlength: "5000", placeholder: i18n.emergencyTextPlaceholder }, emergency ? emergency.text : ""), br(),
      label(i18n.uploadMedia), br(),
      input({ type: "file", name: "blob", accept: "image/*,video/*,audio/*,application/pdf,.torrent" }), br(), br(),
      label(i18n.mapLocationTitle || "Map Location"), br(),
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: emergency ? emergency.mapUrl : "" }), br(),
      label(i18n.emergencyExpiresLabel), br(),
      select({ name: "expiresIn" },
        emergency && emergency.expiresAt ? option({ value: "keep", selected: true }, i18n.emergencyExpiresKeep) : null,
        option({ value: "", ...(!(emergency && emergency.expiresAt) ? { selected: true } : {}) }, i18n.emergencyExpiresNone),
        ...EXPIRES.map(e => option({ value: e }, i18n[`emergencyExpires${e}`] || e))
      ), br(), br(),
      label(i18n.emergencyTagsLabel), br(),
      input({ type: "text", name: "tags", maxlength: "200", placeholder: i18n.emergencyTagsPlaceholder, value: emergency ? emergency.tags.join(", ") : "" }), br(), br(),
      button({ type: "submit", class: "create-button" }, emergency ? i18n.emergencyUpdate : i18n.emergencyCreate)
    )
  );

const renderHeader = () => div({ class: "tags-header module-header-line" }, h2(i18n.emergenciesTitle), p(i18n.emergenciesDescription));

exports.emergenciesView = async (emergencies, filter = "ALL", params = {}) => {
  const list = Array.isArray(emergencies) ? emergencies : [];
  const q = String(params.q || "").trim();
  const census = Array.isArray(params.censusList) ? params.censusList : list;
  const f = String(filter || "ALL").toUpperCase();
  const isForm = f === "CREATE" || f === "EDIT";
  const emptyMod = !isForm && moduleIsEmpty(census, "ALL", "ALL", q);
  return template(
    i18n.emergenciesTitle,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.emergenciesTitle), p(i18n.emergenciesDescription)),
      renderFilters(isForm ? "ALL" : f, q, isForm ? [] : census, emptyMod)
    ),
    section(
      isForm
        ? renderForm(f === "EDIT" ? params.emergency : null, params)
        : [
            emptyMod ? null : div({ class: "filters activity-filter-chips activity-toolbar-row" },
              renderModuleStats(list.length, SEVERITIES.map(s => ({ label: sevLabel(s), count: list.filter(al => al.severity === s).length }))),
              form({ method: "GET", action: "/emergencies", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: f }),
                input({ type: "text", name: "q", value: q, placeholder: i18n.emergencySearchPlaceholder, class: "filter-box__input" }),
                div({ class: "filter-box__controls" }, button({ type: "submit", class: "filter-box__button" }, i18n.searchButton))
              )
            ),
            div({ class: "tribe-grid" }, list.length ? list.map(al => renderEmergencyCard(al, params)) : p(i18n.emergencyNoItems))
          ]
    )
  );
};

exports.singleEmergencyView = async (emergency, params = {}) => {
  const isAuthor = String(emergency.author) === String(userId);
  const confirmed = Array.isArray(emergency.confirmations) && emergency.confirmations.includes(userId);
  const href = emergencyHref(emergency);
  const census = Array.isArray(params.censusList) ? params.censusList : [];
  const sideActions = [
    !isAuthor && !confirmed && emergency.status === "ACTIVE"
      ? form({ method: "POST", action: `/emergencies/confirm/${encodeURIComponent(emergency.id)}` }, button({ type: "submit", class: "tribe-action-btn" }, `✓ ${String(i18n.emergencyConfirmButton).toUpperCase()}`))
      : null,
    confirmed ? span({ class: "status supporting" }, i18n.emergencyConfirmed) : null
  ].filter(Boolean);
  const ownerActions = isAuthor
    ? [
        (emergency.confirmationCount || 0) > 0
          ? null
          : form({ method: "GET", action: "/emergencies" }, input({ type: "hidden", name: "filter", value: "edit" }), input({ type: "hidden", name: "id", value: emergency.id }), button({ type: "submit", class: "update-btn" }, i18n.emergencyUpdate)),
        form({ method: "POST", action: `/emergencies/delete/${encodeURIComponent(emergency.id)}` }, button({ type: "submit", class: "delete-btn" }, i18n.emergencyDelete))
      ].filter(Boolean)
    : [];
  const updates = Array.isArray(emergency.updates) ? emergency.updates : [];
  const side = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(emergency.id, null, { author: emergency.author, favKind: "emergencies", isFavorite: emergency.isFavorite, reportTitle: emergency.title, spread: params.spread || null })
    ),
    div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, emergency.title)),
    div({ class: "card-chips-row" }, severityChip(emergency), statusChip(emergency), categoryChip(emergency)),
    table({ class: "tribe-info-table jobs-info-table" },
      tr(
        td({ class: "tribe-info-label" }, i18n.createdAtLabel || "Created at"),
        td({ class: "tribe-info-value", colspan: "3" }, moment(emergency.createdAt).format("YYYY/MM/DD HH:mm"))
      ),
      emergency.expiresAt
        ? tr(
            td({ class: "tribe-info-label" }, i18n.emergencyExpiresAt),
            td({ class: "tribe-info-value", colspan: "3" }, moment(emergency.expiresAt).format("YYYY/MM/DD HH:mm"))
          )
        : null,
      tr(
        td({ class: "tribe-info-value", colspan: "4" }, userLink(emergency.author))
      )
    ),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.emergencyConfirmations}: ${emergency.confirmationCount || 0}`)
    ),
    renderMapLocationVisitLabel(emergency.mapUrl),
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null,
    isAuthor && emergency.status !== "EXPIRED"
      ? div({ class: "tribe-side-actions housing-status-row" },
          span({ class: "card-label" }, `${i18n.statusLabel || "Status"}: `),
          statusChip(emergency),
          form({ method: "POST", action: `/emergencies/status/${encodeURIComponent(emergency.id)}`, class: "inline-form" },
            button({ class: "tribe-action-btn", type: "submit", name: "status", value: emergency.status === "ACTIVE" ? "RESOLVED" : "ACTIVE" },
              String(emergency.status === "ACTIVE" ? i18n.emergencyResolveButton : i18n.emergencyReopenButton).toUpperCase())
          )
        )
      : null,
    div({ class: "doc-export-actions" },
      form({ method: "GET", action: `/emergencies/${encodeURIComponent(emergency.id)}/pdf` }, button({ type: "submit", class: "filter-btn" }, i18n.emergencyGenerateReport)),
      form({ method: "POST", action: `/emergencies/${encodeURIComponent(emergency.id)}/share` }, button({ type: "submit", class: "filter-btn" }, i18n.sharePm))
    ),
    renderTags(emergency.tags),
    ownerActions.length ? div({ class: "tribe-side-actions owner-actions" }, ...ownerActions) : null,
    params.subscription
      ? renderSubscriptionBox({ target: emergency.id, scope: "emergencies", subscribed: params.subscription.subscribed, count: params.subscription.count, isOwner: isAuthor, returnTo: href })
      : null
  );
  const main = div({ class: "tribe-main" },
    emergency.text ? div({ class: "emergency-body" }, ...renderStyledText(emergency.text)) : null,
    div({ class: "card-section emergency-updates" },
      h3(i18n.emergencyUpdatesTitle),
      updates.length
        ? div({ class: "emergency-updates-list" }, ...updates.map(u => {
            const mineUpdate = String(u.author) === String(userId);
            const confirmedUpdate = Array.isArray(u.confirmations) && u.confirmations.includes(userId);
            const editing = params.editUpdate && params.editUpdate === u.id;
            return div({ class: "emergency-update", id: `update-${encodeURIComponent(u.id)}` },
              div({ class: "emergency-update-head" },
              div({ class: "card-chips-row" },
                renderStateChip(u.confirmationCount > 0 ? "mutuals" : "neutral", "✓", `${i18n.emergencyConfirmations} · ${u.confirmationCount || 0}`),
                u.edited ? renderStateChip("neutral", "", i18n.emergencyUpdateEdited) : null
              ),
              div({ class: "tribe-side-actions emergency-update-actions" },
                !mineUpdate && !confirmedUpdate && emergency.status === "ACTIVE"
                  ? form({ method: "POST", action: `/emergencies/updates/${encodeURIComponent(u.id)}/confirm` }, input({ type: "hidden", name: "emergency", value: emergency.id }), button({ type: "submit", class: "tribe-action-btn" }, `✓ ${String(i18n.emergencyConfirmButton).toUpperCase()}`))
                  : null,
                confirmedUpdate ? span({ class: "status supporting" }, i18n.emergencyConfirmed) : null,
                mineUpdate && !editing && u.confirmationCount === 0
                  ? form({ method: "GET", action: `${href}#update-${encodeURIComponent(u.id)}` }, input({ type: "hidden", name: "editUpdate", value: u.id }), button({ type: "submit", class: "update-btn" }, i18n.emergencyUpdate))
                  : null,
                mineUpdate
                  ? form({ method: "POST", action: `/emergencies/updates/${encodeURIComponent(u.id)}/delete` }, button({ type: "submit", class: "delete-btn" }, i18n.emergencyDelete))
                  : null
              ),
              ),
              editing
                ? form({ method: "POST", action: `/emergencies/updates/${encodeURIComponent(u.id)}/edit`, enctype: "multipart/form-data", class: "emergency-update-form" },
                    textarea({ name: "text", rows: 3, maxlength: "2000", required: true, autofocus: true }, u.text), br(),
                    input({ type: "file", name: "blob", accept: "image/*,video/*,audio/*,application/pdf,.torrent" }), br(), br(),
                    button({ type: "submit", class: "create-button" }, i18n.emergencyUpdate)
                  )
                : div({ class: "emergency-update-text" }, ...renderStyledText(u.text)),
              p({ class: "card-footer" }, span({ class: "date-link" }, moment(u.createdAt).format("YYYY/MM/DD HH:mm")), userLink(u.author))
            );
          }))
        : p(i18n.emergencyNoUpdates),
      isAuthor && emergency.status === "ACTIVE"
        ? form({ method: "POST", action: `/emergencies/updates/${encodeURIComponent(emergency.id)}`, enctype: "multipart/form-data", class: "emergency-update-form" },
            textarea({ name: "text", rows: 3, maxlength: "2000", required: true, placeholder: i18n.emergencyUpdatePlaceholder }), br(),
            input({ type: "file", name: "blob", accept: "image/*,video/*,audio/*,application/pdf,.torrent" }), br(), br(),
            button({ type: "submit", class: "create-button" }, i18n.emergencyAddUpdate)
          )
        : null
    ),
    renderCommentsSection({ action: `/emergencies/${encodeURIComponent(emergency.id)}/comments`, comments: params.comments || [], returnTo: href })
  );
  return template(
    emergency.title,
    section(renderHeader(), renderFilters("ALL", "", census, census.length === 0)),
    section(div({ class: "tribe-details" }, side, main))
  );
};
