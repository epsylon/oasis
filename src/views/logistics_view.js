const { hr, div, h2, h3, p, section, button, form, a, span, br, textarea, input, label, select, option, img, table, tr, td, video: videoHyperaxe } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderStateChip, renderContentActions, renderModuleStats, renderOpinionsVoting, renderEngagement, moduleIsEmpty } = require("./main_views");
const { renderCommentsSection } = require("./comments_view");
const { renderMapLocationVisitLabel } = require("./maps_view");
const { renderStyledText } = require("../backend/renderStyledText");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");

const userId = config.keys.id;
const BASE_FILTERS = ["ALL", "MINE", "BOOKED", "RECENT", "HISTORY", "TOP"];
const KIND_FILTERS = ["TRIPS", "SHIPMENTS"];
const MODE_FILTERS = ["OFFERS", "REQUESTS"];
const DATE_FILTERS = ["UPCOMING", "PAST", "CLOSED"];
const PRICE_FILTERS = ["FREE", "ECO", "TIME"];
const KINDS = ["TRIP", "SHIPMENT"];
const MODES = ["OFFER", "REQUEST"];
const RECURRENCES = ["NONE", "DAILY", "WEEKLY", "MONTHLY"];
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

const cap = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const lbl = (prefix, v) => String(i18n[`logistics${prefix}${cap(v)}`] || v).toUpperCase();
const filterLabel = (f) => lbl("Filter", f);
const kindLabel = (k) => lbl("Kind", k);
const modeLabel = (m) => lbl("Mode", m);
const statusLabel = (s) => lbl("Status", s);
const priceLabel = (t) => lbl("Price", t);
const recurrenceLabel = (r) => lbl("Recurrence", r);
const bookingLabel = (s) => lbl("Booking", s);

const routeHref = (route) => `/logistics/${encodeURIComponent(route.id)}`;
const fmt = (d) => moment(d).format("YYYY/MM/DD HH:mm");
const stars = (n) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

const priceText = (route) => {
  if (route.priceType === "ECO") return `${route.price} ECO`;
  if (route.priceType === "TIME") return `${route.price} ${i18n.logisticsHours}`;
  return priceLabel("FREE");
};

const kindChip = (route) => renderStateChip("neutral", route.kind === "TRIP" ? "🚗" : "📦", kindLabel(route.kind));
const modeChip = (route) => renderStateChip(route.mode === "OFFER" ? "mutuals" : "whole", "", modeLabel(route.mode));
const statusChip = (route) => renderStateChip(route.status === "OPEN" ? "mutuals" : (route.status === "PAST" ? "whole" : "closed"), route.status === "OPEN" ? "✓" : (route.status === "CLOSED" ? "✗" : ""), statusLabel(route.status));
const priceChip = (route) => renderStateChip("neutral", "", priceText(route));

const renderTags = (tags) => (Array.isArray(tags) && tags.length)
  ? div({ class: "card-tags" }, ...tags.map(t => a({ href: `/search?query=%23${encodeURIComponent(t)}`, class: "tag-link" }, `#${t}`)))
  : null;

const routeLine = (route) => p({ class: "logistics-route-line" }, span({ class: "logistics-zone" }, route.origin), " → ", span({ class: "logistics-zone" }, route.destination));
const whenLine = (route) => p({ class: "job-meta-line" }, `📅 ${fmt(route.date)}${route.recurrence !== "NONE" ? ` · ${recurrenceLabel(route.recurrence)}` : ""}`);
const capacityLine = (route) => {
  if (route.kind === "TRIP") return route.seats ? p({ class: "job-meta-line" }, `💺 ${route.seatsLeft} / ${route.seats}`) : null;
  const parts = [route.size ? `${i18n.logisticsSizeLabel}: ${route.size}` : null, route.weight ? `${i18n.logisticsWeightLabel}: ${route.weight}` : null].filter(Boolean);
  return parts.length ? p({ class: "job-meta-line" }, `📦 ${parts.join(" · ")}`) : null;
};
const countersBlock = (route) =>
  div({ class: "tribe-card-members" },
    span({ class: "tribe-members-count" }, `${i18n.logisticsRatingsTitle}: ${route.ratingCount || 0}${route.ratingCount ? ` · ${stars(route.ratingAvg)} ${route.ratingAvg}` : ""}`)
  );
const bookingsBlock = (route) => route.isOwner
  ? div({ class: "tribe-card-members" }, span({ class: "tribe-members-count" }, `${i18n.logisticsBookingsLabel}: ${route.bookingCount || 0}`))
  : null;
const renderCover = (route) => {
  if (!route.media || !route.media.blobId) return null;
  if (route.media.kind === "video") return videoHyperaxe({ class: "logistics-card-cover", src: `/blob/${encodeURIComponent(route.media.blobId)}`, controls: true, preload: "metadata" });
  return a({ href: routeHref(route) }, img({ class: "logistics-card-cover", src: `/blob/${encodeURIComponent(route.media.blobId)}`, alt: route.title || "" }));
};

const logisticsChipFor = (mode, census) => {
  if (mode === "ALL") return true;
  if (!Array.isArray(census)) return true;
  if (mode === "MINE") return census.some(r => String(r.author) === String(userId));
  if (mode === "BOOKED") return census.some(r => !!r.myBooking);
  if (mode === "RECENT") return census.some(r => r.lastActivityTs >= Date.now() - RECENT_MS);
  if (mode === "HISTORY") return census.some(r => r.closed && r.participated);
  if (mode === "TOP") return census.some(r => r.ratingCount > 0);
  if (mode === "TRIPS") return census.some(r => r.kind === "TRIP");
  if (mode === "SHIPMENTS") return census.some(r => r.kind === "SHIPMENT");
  if (mode === "OFFERS") return census.some(r => r.mode === "OFFER");
  if (mode === "REQUESTS") return census.some(r => r.mode === "REQUEST");
  if (mode === "UPCOMING") return census.some(r => r.status === "OPEN");
  if (mode === "PAST") return census.some(r => r.status === "PAST");
  if (mode === "CLOSED") return census.some(r => r.status === "CLOSED");
  if (PRICE_FILTERS.includes(mode)) return census.some(r => r.priceType === mode);
  return census.length > 0;
};
exports.logisticsChipFor = logisticsChipFor;

const renderRouteCard = (route, params = {}) =>
  div({ class: `tribe-card logistics-card logistics-${route.kind.toLowerCase()}` },
    div({ class: "card-header activity-card-header" },
      span(),
      renderContentActions(route.id, routeHref(route), { author: route.author, favKind: "logistics", isFavorite: route.isFavorite, reportTitle: route.title, spread: (params.spreadMap && params.spreadMap.get(route.id)) || null })
    ),
    div({ class: "tribe-card-body" },
      renderCover(route),
      div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, a({ href: routeHref(route) }, route.title || "—"))),
      div({ class: "card-chips-row" }, kindChip(route), modeChip(route), statusChip(route), priceChip(route)),
      routeLine(route),
      whenLine(route),
      capacityLine(route),
      countersBlock(route)
    )
  );

const chipForm = (mode, filter, q, zone, labelText, extra = {}) =>
  form({ class: "sub-filter-form", method: "GET", action: "/logistics" },
    input({ type: "hidden", name: "q", value: q || "" }),
    input({ type: "hidden", name: "filter", value: extra.filter !== undefined ? extra.filter : mode }),
    input({ type: "hidden", name: "zone", value: extra.zone !== undefined ? extra.zone : (zone || "") }),
    button({ type: "submit", class: extra.active ? "filter-btn active" : "filter-btn" }, labelText)
  );

const chipButtons = (modes, filter, census, labelOf) =>
  modes.filter(m => m === filter || logisticsChipFor(m, census)).map(m => button({ type: "submit", name: "filter", value: m, class: filter === m ? "filter-btn active" : "filter-btn" }, labelOf(m)));

const zoneRow = (zones, filter, q, zone) => {
  if (!Array.isArray(zones) || !zones.length) return null;
  const current = String(zone || "").toLowerCase();
  return div({ class: "activity-sub-filter logistics-zones" },
    span({ class: "inbox-filters-label" }, `${i18n.logisticsZoneLabel}:`),
    ...zones.map(z => chipForm(filter, filter, q, zone, z.label, { filter, zone: current === z.label.toLowerCase() ? "" : z.label, active: current === z.label.toLowerCase() }))
  );
};

const renderFilters = (filter, q, zone, census, zones, emptyMod) =>
  section(
    div({ class: "filters" },
      form({ method: "GET", action: "/logistics", class: "ui-toolbar ui-toolbar--filters" },
        input({ type: "hidden", name: "q", value: q || "" }),
        input({ type: "hidden", name: "zone", value: zone || "" }),
        ...(emptyMod ? [] : [
          ...chipButtons(BASE_FILTERS, filter, census, filterLabel),
          ...chipButtons(KIND_FILTERS, filter, census, kindLabel),
          ...chipButtons(MODE_FILTERS, filter, census, modeLabel),
          ...chipButtons(DATE_FILTERS, filter, census, statusLabel),
          ...chipButtons(PRICE_FILTERS, filter, census, priceLabel)
        ]),
        button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.logisticsCreate)
      )
    ),
    emptyMod ? null : zoneRow(zones, filter, q, zone)
  );

const renderForm = (route, params = {}) => {
  const kind = route ? route.kind : (KINDS.includes(String(params.kind || "").toUpperCase()) ? String(params.kind).toUpperCase() : "TRIP");
  const isTrip = kind === "TRIP";
  const formId = route ? "logistics-edit-form" : "logistics-create-form";
  return div({ class: "report-form" },
    route
      ? null
      : form({ id: "logistics-kind-form", method: "GET", action: "/logistics" },
          input({ type: "hidden", name: "filter", value: "CREATE" }),
          label(i18n.logisticsKindLabel), br(),
          div({ class: "apply-row" },
            select({ name: "kind", class: "report-category-select" }, ...KINDS.map(k => option({ value: k, ...(k === kind ? { selected: true } : {}) }, kindLabel(k)))),
            button({ type: "submit", class: "create-button" }, i18n.apply || "Apply")
          )
        ),
    route ? null : hr({ class: "form-sep" }),
    route ? null : h2({ class: "report-category-fixed" }, kindLabel(kind)),
    form({ id: formId, method: "POST", action: route ? `/logistics/update/${encodeURIComponent(route.id)}` : "/logistics/create", enctype: "multipart/form-data" },
      input({ type: "hidden", name: "kind", value: kind }),
      label(i18n.logisticsTitleLabel), br(),
      input({ type: "text", name: "title", maxlength: "100", required: true, placeholder: i18n.logisticsTitlePlaceholder, value: route ? route.title : "" }), br(),
      label(i18n.logisticsModeLabel), br(),
      select({ name: "mode" }, ...MODES.map(m => option({ value: m, ...((route ? route.mode : "OFFER") === m ? { selected: true } : {}) }, modeLabel(m)))), br(), br(),
      label(i18n.logisticsDescriptionLabel), br(),
      textarea({ name: "description", rows: 5, maxlength: "3000", placeholder: i18n.logisticsDescriptionPlaceholder }, route ? route.description : ""), br(),
      label(i18n.uploadMedia), br(),
      input({ type: "file", name: "blob", accept: "image/*,video/*,audio/*,application/pdf,.torrent" }), br(), br(),
      label(i18n.logisticsOriginLabel), br(),
      input({ type: "text", name: "origin", maxlength: "100", required: true, placeholder: i18n.logisticsOriginPlaceholder, value: route ? route.origin : "" }), br(),
      label(i18n.logisticsDestinationLabel), br(),
      input({ type: "text", name: "destination", maxlength: "100", required: true, placeholder: i18n.logisticsDestinationPlaceholder, value: route ? route.destination : "" }), br(),
      label(i18n.mapLocationTitle || "Map Location"), br(),
      input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: route ? route.mapUrl : "" }), br(),
      label(i18n.logisticsDateLabel), br(),
      input({ type: "datetime-local", name: "date", required: true, min: moment().format("YYYY-MM-DDTHH:mm"), value: route && route.date ? moment(route.date).format("YYYY-MM-DDTHH:mm") : "" }), br(), br(),
      label(i18n.logisticsRecurrenceLabel), br(),
      select({ name: "recurrence" }, ...RECURRENCES.map(r => option({ value: r, ...((route ? route.recurrence : "NONE") === r ? { selected: true } : {}) }, recurrenceLabel(r)))), br(), br(),
      isTrip
        ? [
            label(i18n.logisticsSeatsLabel), br(),
            input({ type: "number", name: "seats", min: "1", max: "99", step: "1", required: true, class: "logistics-short", value: route ? String(route.seats || 1) : "1" }), br(), br()
          ]
        : [
            label(i18n.logisticsSizeLabel), br(),
            input({ type: "text", name: "size", maxlength: "60", placeholder: i18n.logisticsSizePlaceholder, value: route ? route.size : "" }), br(),
            label(i18n.logisticsWeightLabel), br(),
            input({ type: "text", name: "weight", maxlength: "60", placeholder: i18n.logisticsWeightPlaceholder, value: route ? route.weight : "" }), br()
          ],
      label(i18n.logisticsPriceLabel), br(),
      input({ type: "number", name: "price", min: "0", step: "0.01", placeholder: "0", class: "logistics-short", value: route && route.price ? String(route.price) : "" }),
      select({ name: "priceType", class: "logistics-price-unit" }, ...["ECO", "TIME"].map(t => option({ value: t, ...((route && route.priceType === "TIME" ? "TIME" : "ECO") === t ? { selected: true } : {}) }, priceLabel(t)))), br(), br(),
      label(i18n.logisticsOrderRefLabel), br(),
      input({ type: "text", name: "orderRef", maxlength: "200", placeholder: i18n.logisticsOrderRefPlaceholder, value: route ? route.orderRef : "" }), br(),
      label(i18n.logisticsTagsLabel), br(),
      input({ type: "text", name: "tags", maxlength: "200", placeholder: i18n.logisticsTagsPlaceholder, value: route ? route.tags.join(", ") : "" }), br(), br(),
      button({ type: "submit", class: "create-button" }, route ? i18n.logisticsUpdate : i18n.logisticsCreate)
    )
  );
};

const renderHeader = () => div({ class: "tags-header module-header-line" }, h2(i18n.logisticsTitle), p(i18n.logisticsDescription));

exports.logisticsView = async (routes, filter = "ALL", params = {}) => {
  const list = Array.isArray(routes) ? routes : [];
  const q = String(params.q || "").trim();
  const zone = String(params.zone || "").trim();
  const census = Array.isArray(params.censusList) ? params.censusList : list;
  const zones = Array.isArray(params.zones) ? params.zones : [];
  const f = String(filter || "ALL").toUpperCase();
  const isForm = f === "CREATE" || f === "EDIT";
  const emptyMod = !isForm && moduleIsEmpty(census, "ALL", "ALL", q) && !zone;
  return template(
    i18n.logisticsTitle,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.logisticsTitle), p(i18n.logisticsDescription)),
      renderFilters(isForm ? "ALL" : f, q, isForm ? "" : zone, isForm ? [] : census, isForm ? [] : zones, emptyMod)
    ),
    section(
      isForm
        ? renderForm(f === "EDIT" ? params.route : null, params)
        : [
            emptyMod ? null : div({ class: "filters activity-filter-chips activity-toolbar-row" },
              renderModuleStats(list.length, [
                { label: kindLabel("TRIP"), count: list.filter(r => r.kind === "TRIP").length },
                { label: kindLabel("SHIPMENT"), count: list.filter(r => r.kind === "SHIPMENT").length },
                { label: statusLabel("OPEN"), count: list.filter(r => r.status === "OPEN").length }
              ]),
              form({ method: "GET", action: "/logistics", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: f }),
                input({ type: "hidden", name: "zone", value: zone }),
                input({ type: "text", name: "q", value: q, placeholder: i18n.logisticsSearchPlaceholder, class: "filter-box__input" }),
                div({ class: "filter-box__controls" }, button({ type: "submit", class: "filter-box__button" }, i18n.searchButton))
              )
            ),
            div({ class: "tribe-grid" }, list.length ? list.map(r => renderRouteCard(r, params)) : p(i18n.logisticsNoItems))
          ]
    )
  );
};

const bookingStatusChip = (b) => renderStateChip(b.status === "CONFIRMED" || b.status === "DELIVERED" ? "mutuals" : (b.status === "PENDING" ? "whole" : "closed"), "", bookingLabel(b.status));

const bookingStatusForm = (route, b, status, cls, text) =>
  form({ method: "POST", action: `/logistics/booking/${encodeURIComponent(b.id)}/status` },
    input({ type: "hidden", name: "status", value: status }),
    input({ type: "hidden", name: "route", value: route.id }),
    button({ type: "submit", class: cls }, String(text).toUpperCase())
  );

const renderBooking = (route, b) =>
  div({ class: "logistics-booking" },
    div({ class: "emergency-update-head logistics-booking-head" },
      div({ class: "card-chips-row" }, bookingStatusChip(b), route.kind === "TRIP" ? renderStateChip("neutral", "💺", String(b.seats)) : null),
      div({ class: "tribe-side-actions emergency-update-actions" },
        route.isOwner && b.status === "PENDING" ? bookingStatusForm(route, b, "CONFIRMED", "tribe-action-btn", i18n.logisticsConfirm) : null,
        route.isOwner && b.status === "PENDING" ? bookingStatusForm(route, b, "REJECTED", "delete-btn", i18n.logisticsReject) : null,
        b.mine && (b.status === "PENDING" || b.status === "CONFIRMED") ? bookingStatusForm(route, b, "CANCELLED", "delete-btn", i18n.logisticsCancelBooking) : null
      )
    ),
    b.notes ? p({ class: "logistics-booking-notes" }, b.notes) : null,
    b.orderRef ? p({ class: "job-meta-line" }, a({ href: b.orderRef, class: "user-link" }, `🛍 ${i18n.logisticsOrderLink}`)) : null,
    b.receipt ? p({ class: "logistics-receipt" }, `🧾 ${i18n.logisticsReceiptLabel}: ${b.receipt}`) : null,
    route.isOwner && b.status === "CONFIRMED"
      ? form({ method: "POST", action: `/logistics/booking/${encodeURIComponent(b.id)}/status`, class: "logistics-receipt-form" },
          input({ type: "hidden", name: "status", value: "DELIVERED" }),
          input({ type: "hidden", name: "route", value: route.id }),
          input({ type: "text", name: "receipt", maxlength: "200", placeholder: i18n.logisticsReceiptPlaceholder }),
          button({ type: "submit", class: "tribe-action-btn" }, String(i18n.logisticsDeliver).toUpperCase())
        )
      : null,
    p({ class: "card-footer" }, span({ class: "date-link" }, `${fmt(b.createdAt)}`), userLink(b.booker))
  );

const renderBookForm = (route) =>
  form({ method: "POST", action: `/logistics/${encodeURIComponent(route.id)}/book`, class: "logistics-book-form" },
    h3(i18n.logisticsBookTitle),
    route.kind === "TRIP" ? [label(i18n.logisticsSeatsLabel), br(), input({ type: "number", name: "seats", min: "1", max: String(route.seatsLeft || 99), step: "1", value: "1" }), br(), br()] : null,
    label(i18n.logisticsNotesLabel), br(),
    textarea({ name: "notes", rows: 3, maxlength: "1000", placeholder: i18n.logisticsNotesPlaceholder }), br(), br(),
    label(i18n.logisticsOrderRefLabel), br(),
    input({ type: "text", name: "orderRef", maxlength: "200", placeholder: i18n.logisticsOrderRefPlaceholder }), br(), br(),
    button({ type: "submit", class: "create-button" }, i18n.logisticsBook)
  );

const renderRatings = (route) =>
  div({ class: "card-section logistics-ratings" },
    h3(i18n.logisticsRatingsTitle),
    route.ratings.length
      ? div({ class: "logistics-ratings-list" }, ...route.ratings.map(r => div({ class: "logistics-rating" },
          div({ class: "emergency-update-head logistics-rating-head" }, div({ class: "card-chips-row" }, renderStateChip("neutral", "", stars(r.score)))),
          r.text ? p(r.text) : null,
          p({ class: "card-footer" }, span({ class: "date-link" }, `${fmt(r.createdAt)}`), userLink(r.author))
        )))
      : p(route.closed ? i18n.logisticsNoRatings : i18n.logisticsRatingsWhenClosed),
    route.canRate
      ? form({ method: "POST", action: `/logistics/${encodeURIComponent(route.id)}/rate`, class: "logistics-rate-form" },
          label(i18n.logisticsScoreLabel), br(),
          select({ name: "score" }, ...[5, 4, 3, 2, 1].map(n => option({ value: String(n) }, stars(n)))), br(), br(),
          textarea({ name: "text", rows: 3, maxlength: "1000", placeholder: i18n.logisticsRatingPlaceholder }), br(), br(),
          button({ type: "submit", class: "create-button" }, i18n.logisticsRate)
        )
      : null
  );

exports.singleLogisticsView = async (route, params = {}) => {
  const href = routeHref(route);
  const census = Array.isArray(params.censusList) ? params.censusList : [];
  const zones = Array.isArray(params.zones) ? params.zones : [];
  const ownerActions = route.isOwner
    ? [
        form({ method: "GET", action: "/logistics" }, input({ type: "hidden", name: "filter", value: "edit" }), input({ type: "hidden", name: "id", value: route.id }), button({ type: "submit", class: "update-btn" }, i18n.logisticsUpdate)),
        form({ method: "POST", action: `/logistics/delete/${encodeURIComponent(route.id)}` }, button({ type: "submit", class: "delete-btn" }, i18n.logisticsDelete))
      ]
    : [];
  const capacity = route.kind === "TRIP"
    ? (route.seats ? [{ label: i18n.logisticsSeatsLabel, value: `${route.seatsLeft} / ${route.seats}` }] : [])
    : [route.size ? { label: i18n.logisticsSizeLabel, value: route.size } : null, route.weight ? { label: i18n.logisticsWeightLabel, value: route.weight } : null].filter(Boolean);
  const side = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(route.id, null, { author: route.author, favKind: "logistics", isFavorite: route.isFavorite, reportTitle: route.title, spread: params.spread || null })
    ),
    div({ class: "shop-title-row" }, h2({ class: "tribe-card-title" }, route.title)),
    div({ class: "card-chips-row" }, kindChip(route), modeChip(route), statusChip(route), priceChip(route)),
    table({ class: "tribe-info-table jobs-info-table" },
      tr(
        td({ class: "tribe-info-label" }, i18n.createdAtLabel || "Created at"),
        td({ class: "tribe-info-value", colspan: "3" }, fmt(route.createdAt))
      ),
      tr(
        td({ class: "tribe-info-label" }, i18n.logisticsDateLabel),
        td({ class: "tribe-info-value", colspan: "3" }, fmt(route.date))
      ),
      route.recurrence !== "NONE"
        ? tr(
            td({ class: "tribe-info-label" }, i18n.logisticsFrequencyLabel),
            td({ class: "tribe-info-value", colspan: "3" }, recurrenceLabel(route.recurrence))
          )
        : null,
      tr(
        td({ class: "tribe-info-label" }, i18n.logisticsOriginLabel),
        td({ class: "tribe-info-value", colspan: "3" }, route.origin)
      ),
      tr(
        td({ class: "tribe-info-label" }, i18n.logisticsDestinationLabel),
        td({ class: "tribe-info-value", colspan: "3" }, route.destination)
      ),
      ...capacity.map(c => tr(
        td({ class: "tribe-info-label" }, c.label),
        td({ class: "tribe-info-value", colspan: "3" }, c.value)
      )),
      tr(
        td({ class: "tribe-info-value", colspan: "4" }, userLink(route.author))
      )
    ),
    countersBlock(route),
    renderMapLocationVisitLabel(route.mapUrl),
    route.orderRef
      ? div({ class: "tribe-side-actions" }, form({ method: "GET", action: route.orderRef }, button({ type: "submit", class: "tribe-action-btn" }, `🛍 ${String(i18n.logisticsOrderLink).toUpperCase()}`)))
      : null,
    route.isOwner
      ? div({ class: "tribe-side-actions housing-status-row" },
          span({ class: "card-label" }, `${i18n.statusLabel || "Status"}: `),
          statusChip(route),
          form({ method: "POST", action: `/logistics/status/${encodeURIComponent(route.id)}`, class: "inline-form" },
            button({ class: "tribe-action-btn", type: "submit", name: "status", value: route.status === "CLOSED" ? "OPEN" : "CLOSED" },
              String(route.status === "CLOSED" ? i18n.logisticsReopen : i18n.logisticsClose).toUpperCase())
          )
        )
      : null,
    bookingsBlock(route),
    div({ class: "doc-export-actions" },
      form({ method: "GET", action: `${href}/pdf` }, button({ type: "submit", class: "filter-btn" }, i18n.logisticsGenerateReport)),
      form({ method: "POST", action: `${href}/share` }, button({ type: "submit", class: "filter-btn" }, i18n.sharePm))
    ),
    renderTags(route.tags),
    ownerActions.length ? div({ class: "tribe-side-actions owner-actions" }, ...ownerActions) : null
  );
  const main = div({ class: "tribe-main" },
    route.description ? div({ class: "logistics-body" }, ...renderStyledText(route.description)) : null,
    route.canBook ? div({ class: "card-section" }, renderBookForm(route)) : null,
    route.bookings.length
      ? div({ class: "card-section logistics-bookings" },
          h3(route.isOwner ? `${i18n.logisticsBookingsTitle} (${route.bookings.length})` : i18n.logisticsMyBookingTitle),
          ...route.bookings.map(b => renderBooking(route, b))
        )
      : null,
    renderRatings(route),
    renderEngagement(route.id,
      renderOpinionsVoting("/logistics/opinions", route.id, route.opinions, href, route.opinions_inhabitants),
      renderCommentsSection({ action: `/logistics/${encodeURIComponent(route.id)}/comments`, comments: params.comments || [], returnTo: href })
    )
  );
  return template(
    route.title,
    section(renderHeader(), renderFilters("ALL", "", "", census, zones, census.length === 0)),
    section(div({ class: "tribe-details" }, side, main))
  );
};
