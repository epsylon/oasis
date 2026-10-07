const { form, button, div, h2, h3, p, section, input, label, br, hr, a, span, textarea, select, option, img, strong, table, tr, td } =
  require("../server/node_modules/hyperaxe");
const { renderStyledText, renderStyledHtml, escapeHtml } = require("../backend/renderStyledText");

const moment = require("../server/node_modules/moment");
const { clearnetItemHref, template, i18n, userLink, renderStateChip, renderLifespanChip, renderSpreadButton, renderContentActions, renderSpreadEditWarning, renderDocumentActions, renderInviteQrCard, renderModuleStats, moduleIsEmpty, contentDeleteAction } = require("./main_views");
const { renderEncryptedChip, renderReachChip, renderClearnetSelector, renderClearnetSwitch } = require("./clearnet_view");
const { config } = require("../server/SSB_server.js");
const { renderMapHtml, resolveView, makeView, fitView, parseView, viewParam, parsePick, MIN_ZOOM, MAX_ZOOM } = require("../maps/map_renderer");
const { searchPlaces, nearestPlace } = require("../maps/map_data");

const userId = config.keys.id;
const safeArr = (v) => (Array.isArray(v) ? v : []);
const safeText = (v) => String(v || "").trim();
const MAP_REACH = ["SINGLE", "OPEN", "CLOSED"];
const mapReachLabel = (t) => t === "OPEN" ? i18n.mapTypeOpen : t === "CLOSED" ? i18n.mapTypeClosed : i18n.mapTypeSingle;
const clearnetEligible = (m) => !!m && !m.tribeId && !m.encrypted && !m.contentEncrypted && String(m.mapType || "").toUpperCase() === "OPEN";
const mapClearnetHref = (m) => clearnetItemHref("maps", m.title, m.rootId || m.key);

const buildReturnTo = (filter, params = {}) => {
  const f = safeText(filter || "all");
  const q = safeText(params.q || "");
  const parts = [`filter=${encodeURIComponent(f)}`];
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  return `/maps?${parts.join("&")}`;
};

const renderTags = (tags) => {
  const list = safeArr(tags).map((t) => String(t || "").trim()).filter(Boolean);
  return list.length
    ? div({ class: "card-tags" }, list.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)))
    : null;
};

let areaCounter = 0;
const lastOf = (v) => (Array.isArray(v) ? v[v.length - 1] : v);
const numOrNull = (v) => { const n = parseFloat(lastOf(v)); return isFinite(n) ? n : null; };
const isBlob = (v) => !!v && String(v).startsWith("&");
const blobSrc = (image, base) => (isBlob(image) ? `${base}/blob/${encodeURIComponent(image)}` : "");

const buildQuery = (params) => Object.entries(params || {})
  .filter(([, v]) => v !== undefined && v !== null && String(v) !== "")
  .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  .join("&");

const viewHrefFor = (basePath, baseParams, anchor = "#map") => (target, extra = {}) => {
  const q = buildQuery({ ...baseParams, ...extra, view: target ? viewParam(target) : undefined });
  return `${basePath}${q ? "?" + q : ""}${anchor}`;
};

const navText = () => ({ zoomIn: i18n.mapZoomIn, zoomOut: i18n.mapZoomOut, fit: i18n.mapFitMarkers, pan: i18n.mapPanLabel });

const viewForPlace = (hit) => {
  if (!hit) return null;
  if (hit.kind === "country" && Array.isArray(hit.bbox)) {
    const b = hit.bbox;
    const f = fitView([{ lat: b[1], lng: b[0] }, { lat: b[3], lng: b[2] }], { maxZoom: 7, pad: 40 });
    return makeView(f.lat, f.lng, f.zoom);
  }
  return makeView(hit.lat, hit.lng, MAX_ZOOM);
};

const placeLabel = (hit) => hit.country ? `${hit.name}, ${hit.country}` : hit.name;

const nearText = (lat, lng) => {
  const near = nearestPlace(lat, lng);
  return near ? `${i18n.mapNear} ${near.name}, ${near.country}` : "";
};

const pickedSpot = (lat, lng) => {
  const la = numOrNull(lat), lo = numOrNull(lng);
  if (la === null || lo === null) return p({ class: "map-pick-hint" }, i18n.mapPickHint);
  const near = nearText(la, lo);
  return div({ class: "map-picked" },
    span({ class: "map-coord-pin" }, "📍"),
    strong(`${la.toFixed(4)}, ${lo.toFixed(4)}`),
    near ? span({ class: "map-picked-near" }, near) : null);
};

const renderMap = (markers, clickUrl, mainIdx, opts = {}) => {
  areaCounter++;
  const pinLabels = opts.pinLabels || [];
  const pinImages = opts.pinImages || [];
  const pinHrefs = opts.pinHrefs || [];
  const base = opts.publicBase || "";
  const focus = Number.isInteger(opts.focus) ? opts.focus : -1;
  const main = mainIdx || 0;
  const pins = safeArr(markers)
    .filter((m) => m && numOrNull(m.lat) !== null && numOrNull(m.lng) !== null)
    .map((m, i) => ({
      lat: numOrNull(m.lat),
      lng: numOrNull(m.lng),
      label: pinLabels[i] !== undefined ? pinLabels[i] : (m.label || ""),
      image: blobSrc(pinImages[i] !== undefined ? pinImages[i] : m.image, base),
      href: pinHrefs[i] || m.href || null,
      title: m.title || "",
      main: i === main,
      focus: i === focus
    }));
  if (opts.pick && numOrNull(opts.pick.lat) !== null && numOrNull(opts.pick.lng) !== null) {
    pins.push({ lat: numOrNull(opts.pick.lat), lng: numOrNull(opts.pick.lng), pick: true });
  }
  const view = opts.view || resolveView({ zoom: opts.zoom, clat: opts.centerLat, clng: opts.centerLng }, pins.filter((x) => !x.pick), { singleZoom: opts.singleZoom || 8 });
  const html = renderMapHtml(view, pins, {
    id: opts.id || `map${areaCounter}`,
    thumb: !!opts.thumb,
    publicBase: base,
    nav: opts.nav || null,
    pick: opts.pickForm ? { form: opts.pickForm, action: opts.pickAction, name: opts.pickName || "pick" } : null,
    clickUrl: clickUrl || null,
    latParam: opts.latParam,
    lngParam: opts.lngParam,
    anchor: typeof opts.anchor === "string" ? opts.anchor : "",
    viewHref: opts.viewHref || null,
    popup: opts.popup || null,
    clusterTitle: i18n.mapClusterTitle,
    text: navText()
  });
  return div({ class: opts.thumb ? "map-viewer map-viewer-thumb" : "map-viewer", innerHTML: html });
};

const renderPlaceResults = (hits, toEl) => {
  if (!hits) return null;
  if (!hits.length) return span({ class: "map-place-none" }, i18n.mapNoPlaces);
  return div({ class: "map-place-results" }, hits.map((h) => toEl(h)));
};

const renderLocalEmbed = (lat, lng) => {
  const la = parseFloat(lat) || 0;
  const lo = parseFloat(lng) || 0;
  if (!la && !lo) return null;
  return renderMap([{ lat: la, lng: lo }], null, 0, { zoom: MIN_ZOOM, centerLat: la, centerLng: lo });
};

const renderMapUrl = (mapObj) =>
  div({ class: "map-url-container" },
    span({ class: "card-label" }, i18n.mapUrlLabel + ": "),
    a({ href: `/maps/${encodeURIComponent(mapObj.key)}`, class: "map-url-link" },
      `/maps/${encodeURIComponent(mapObj.key)}`));

const renderMapOwnerActions = (filter, mapObj, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  if (String(mapObj.author) !== String(userId)) return [];
  const actions = [
    form({ method: "GET", action: `/maps/edit/${encodeURIComponent(mapObj.key)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "update-btn", type: "submit" }, i18n.mapUpdateButton))
  ];
  const invitable = !mapObj.tribeId && mapObj.mapType === "CLOSED";
  if (invitable) {
    actions.push(form({ method: "POST", action: `/maps/generate-invite/${encodeURIComponent(mapObj.key)}` },
      button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeGenerateInvite)));
  }
  const openInvite = Array.isArray(mapObj.invites) ? mapObj.invites.find(inv => typeof inv === "object" && inv.public === true && inv.code) : null;
  if (invitable) {
    if (openInvite) {
      actions.push(div({ class: 'tribe-open-invite' },
        span({ class: 'card-label' }, i18n.tribeInviteCodeText),
        span({ class: 'tribe-open-invite-code' }, openInvite.code),
        renderInviteQrCard({ qrDataUrl: `/qr-invite-code/maps/${encodeURIComponent(openInvite.code)}` })
      ));
      actions.push(form({ method: "POST", action: `/maps/open-invite/remove/${encodeURIComponent(mapObj.key)}` },
        button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.tribeRemoveInvitation)));
    } else {
      actions.push(form({ method: "POST", action: `/maps/open-invite/create/${encodeURIComponent(mapObj.key)}` },
        button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeOpenInvitation)));
    }
  }
  return actions;
};

const renderFilters = (filter, q, emptyMod = false, chip = null, search = null) =>
  div({ class: search ? "filters activity-filter-chips activity-toolbar-row" : "filters" },
    form({ method: "GET", action: "/maps", class: "ui-toolbar ui-toolbar--filters" },
      input({ type: "hidden", name: "q", value: q || "" }),
      ...(emptyMod ? [] : [
      ...(!chip || chip("recent") ? [button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, String(i18n.mapFilterRecent).toUpperCase())] : []),
      ...(!chip || chip("mine") ? [button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.mapFilterMine).toUpperCase())] : []),
      button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.mapFilterAll).toUpperCase()),
      ...(!chip || chip("favorites") ? [button({ type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" }, String(i18n.mapFilterFavorites).toUpperCase())] : []),
      ]),
      button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.mapCreateButton)),
    search);

const renderMapForm = (filter, mapId, mapToEdit, params = {}) => {
  const returnFilter = filter === "create" ? "all" : params.filter || "all";
  const returnTo = safeText(params.returnTo) || buildReturnTo(returnFilter, params);
  const picked = parsePick(params.pick);
  const latVal = picked ? String(picked.lat) : (params.lat !== undefined ? String(lastOf(params.lat)) : String(mapToEdit?.lat || ""));
  const lngVal = picked ? String(picked.lng) : (params.lng !== undefined ? String(lastOf(params.lng)) : String(mapToEdit?.lng || ""));
  const titleVal = params.title || mapToEdit?.title || "";
  const descVal = params.description || mapToEdit?.description || "";
  const markerLabelVal = params.markerLabel !== undefined ? params.markerLabel : (mapToEdit?.markerLabel || "");
  const tagsValue = params.tags !== undefined ? params.tags : safeArr(mapToEdit?.tags).join(", ");
  const isEdit = filter === "edit";
  const reachRaw = String(params.reach || params.mapType || "").toUpperCase();
  const mapTypeVal = MAP_REACH.includes(reachRaw) ? reachRaw : (mapToEdit?.mapType || "SINGLE");
  const showClearnet = mapTypeVal === "OPEN" && !params.tribeId && clearnetEligible({ ...(mapToEdit || {}), mapType: mapTypeVal });
  const clearnetOn = params.clearnet !== undefined ? String(params.clearnet) === "1" : mapToEdit?.clearnet === true;
  const stepAction = isEdit ? `/maps/edit/${encodeURIComponent(mapId)}` : "/maps";
  const cleanUrl = isEdit
    ? `${stepAction}?mapType=${encodeURIComponent(mapTypeVal)}`
    : `/maps?filter=create&mapType=${encodeURIComponent(mapTypeVal)}${params.tribeId ? '&tribeId=' + encodeURIComponent(params.tribeId) : ''}`;
  const pickerMarkers = latVal && lngVal ? [{ lat: parseFloat(latVal), lng: parseFloat(lngVal) }] : [];
  const placeQ = safeText(lastOf(params.place));
  const placeHits = placeQ ? searchPlaces(placeQ, 5) : null;
  const explicitView = parseView(params.view);
  const prevView = Array.isArray(params.view) ? parseView(params.view[0]) : null;
  const view = explicitView
    ? makeView(explicitView.lat, explicitView.lng, explicitView.zoom)
    : (placeHits && placeHits.length ? viewForPlace(placeHits[0]) : resolveView({ zoom: params.zoom, clat: prevView ? prevView.lat : undefined, clng: prevView ? prevView.lng : undefined }, pickerMarkers, { singleZoom: 8 }));
  const zoomVal = view.zoom;
  const formId = "map-main-form";
  const nav = { form: formId, action: stepAction };
  const keptKeys = ["lat", "lng", "zoom", "view", "title", "description", "markerLabel", "tags"];

  return div({ class: "div-center audio-form" },
    params.spreadWarning || null,
    h2(isEdit ? i18n.mapUpdateButton : i18n.mapCreateButton),
    form({ method: "GET", action: stepAction },
      isEdit ? null : input({ type: "hidden", name: "filter", value: "create" }),
      params.tribeId ? input({ type: "hidden", name: "tribeId", value: params.tribeId }) : null,
      isEdit && safeText(params.returnTo) ? input({ type: "hidden", name: "returnTo", value: safeText(params.returnTo) }) : null,
      ...keptKeys.filter((k) => params[k] !== undefined && String(lastOf(params[k])) !== "").map((k) => input({ type: "hidden", name: k, value: String(lastOf(params[k])) })),
      label(i18n.mapTypeLabel), br(),
      div({ class: "apply-row" },
        select({ name: "mapType", class: "report-category-select" },
          ...MAP_REACH.map((t) => option({ value: t, ...(mapTypeVal === t ? { selected: true } : {}) }, mapReachLabel(t)))),
        button({ type: "submit", class: "create-button" }, i18n.apply || "Apply"))),
    hr({ class: "form-sep" }),
    h2({ class: "report-category-fixed" }, mapReachLabel(mapTypeVal)),
    form({
        id: formId,
        action: isEdit ? `/maps/update/${encodeURIComponent(mapId)}` : "/maps/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        isEdit ? null : input({ type: "hidden", name: "filter", value: "create" }),
        input({ type: "hidden", name: "mapType", value: mapTypeVal }),
        input({ type: "hidden", name: "view", value: viewParam(view) }),
        params.tribeId ? input({ type: "hidden", name: "tribeId", value: params.tribeId }) : null,
        label(i18n.title || "Title"), br(),
        input({ type: "text", name: "title", maxlength: "100", placeholder: i18n.mapTitlePlaceholder || "Map title", value: titleVal }),
        br(), br(),
        label(i18n.mapDescriptionLabel), br(),
        textarea({ maxlength: "5000", name: "description", placeholder: i18n.mapDescriptionPlaceholder, rows: "3" }, descVal),
        br(), br(),
        label(i18n.mapTagsLabel), br(),
        input({ type: "text", name: "tags", placeholder: i18n.mapTagsPlaceholder, value: tagsValue }),
        br(), br(),
        showClearnet ? renderClearnetSelector(clearnetOn, i18n) : null,
        label(i18n.mapMarkerLabelField), br(),
        textarea({ maxlength: "5000", name: "markerLabel", placeholder: i18n.mapMarkerLabelPlaceholder, rows: "3" }, markerLabelVal),
        br(), br(),
        label(i18n.markerImageLabel || "Marker Image"), br(),
        input({ type: "file", name: "image", accept: "image/*" }),
        br(), br(),
        label(i18n.mapLatLabel), br(),
        input({ type: "text", name: "lat", placeholder: i18n.mapLatPlaceholder, value: latVal }),
        br(), br(),
        label(i18n.mapLngLabel), br(),
        input({ type: "text", name: "lng", placeholder: i18n.mapLngPlaceholder, value: lngVal }),
        br(), br(),
        div({ class: "map-form-row" },
          button({ type: "submit", attrs: { formmethod: "GET" }, formaction: stepAction, class: "filter-btn" }, i18n.mapAddMarkerButton || "Add Marker"),
          a({ href: cleanUrl, class: "filter-btn" }, i18n.mapCleanMarkerButton || "Clean Marker")),
        pickedSpot(latVal, lngVal),
        div({ class: "map-toolbar" },
          div({ class: "map-place-search" },
            input({ type: "text", name: "place", value: placeQ, placeholder: i18n.mapPlaceSearchPlaceholder, class: "filter-box__input" }),
            button({ type: "submit", attrs: { formmethod: "GET" }, formaction: stepAction, name: "view", value: "", class: "filter-btn" }, i18n.mapSearchButton))),
        renderPlaceResults(placeHits, (h) => {
          const v = viewForPlace(h);
          return button({ type: "submit", attrs: { formmethod: "GET" }, formaction: stepAction, name: "view", value: viewParam(v), class: "map-place-result" },
            span(h.name), h.country ? span({ class: "map-place-result-country" }, h.country) : null);
        }),
        div({ class: "map-form-map-slot" },
          renderMap(pickerMarkers, null, 0, { view, id: "map", nav, pickForm: formId, pickAction: stepAction })),
        button({ type: "submit", class: "create-button" }, isEdit ? i18n.mapUpdateButton : i18n.mapCreateButton)));
};

const MARKER_FORM_ID = "add-marker-form";

const canAddMarkers = (mapObj, tribeMembers = []) => {
  if (mapObj.mapType === "SINGLE") return false;
  if (mapObj.mapType === "CLOSED" && String(mapObj.author) !== String(userId)) return false;
  if (mapObj.mapType === "OPEN" && mapObj.tribeId && !safeArr(tribeMembers).includes(userId)) return false;
  return true;
};

const allMarkersOf = (mapObj) => [{
  key: mapObj.key,
  lat: mapObj.lat,
  lng: mapObj.lng,
  label: mapObj.markerLabel || mapObj.description || mapObj.title || i18n.mapMarkerDefault,
  image: mapObj.image || "",
  author: mapObj.author,
  createdAt: mapObj.createdAt,
  root: true
}].concat(safeArr(mapObj.markers).map((m) => ({ ...m, root: false })));

const firstLine = (s, n = 140) => {
  const line = String(s || "").split(/\r?\n/)[0].trim();
  return line.length > n ? line.slice(0, n - 1) + "…" : line;
};

const renderMarkerForm = (mapObj, returnTo, params = {}, tribeMembers = [], ctx = {}) => {
  if (!canAddMarkers(mapObj, tribeMembers)) return null;
  const mkLat = ctx.mkLat || "";
  const mkLng = ctx.mkLng || "";
  const base = `/maps/${encodeURIComponent(mapObj.key)}`;
  const filter = params.filter || "all";
  const viewVal = ctx.view ? viewParam(ctx.view) : "";
  const mkCleanUrl = `${base}?${buildQuery({ filter, view: viewVal, focus: ctx.focus >= 0 ? ctx.focus : undefined })}#add-marker`;
  return div({ class: "map-marker-form", id: "add-marker" },
    h3(i18n.mapAddMarkerTitle),
    form({ id: MARKER_FORM_ID, method: "POST", action: `${base}/marker`, class: "map-form", enctype: "multipart/form-data" },
      returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
      input({ type: "hidden", name: "filter", value: filter }),
      viewVal ? input({ type: "hidden", name: "view", value: viewVal }) : null,
      ctx.focus >= 0 ? input({ type: "hidden", name: "focus", value: String(ctx.focus) }) : null,
      pickedSpot(mkLat, mkLng),
      label(i18n.mapMarkerLabelField),
      textarea({ maxlength: "5000", name: "label", placeholder: i18n.mapMarkerLabelPlaceholder, rows: "3" }, params.mkMarkerLabel || ""),
      label(i18n.markerImageLabel || "Marker Image"),
      input({ type: "file", name: "image", accept: "image/*" }),
      br(), br(),
      label(i18n.mapMarkerLatLabel),
      input({ type: "text", name: "mkLat", placeholder: i18n.mapLatPlaceholder, value: String(mkLat) }),
      label(i18n.mapMarkerLngLabel),
      input({ type: "text", name: "mkLng", placeholder: i18n.mapLngPlaceholder, value: String(mkLng) }),
      div({ class: "map-form-row map-form-actions" },
        button({ type: "submit", class: "create-button" }, i18n.mapAddMarkerButton),
        a({ href: mkCleanUrl, class: "filter-btn" }, i18n.mapClearPick))));
};

const popupNotes = (s, n = 600) => {
  const text = String(s || "").trim();
  if (text.length <= n) return text;
  const cut = text.slice(0, n);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), n - 40)) + "…";
};

const renderPinPopup = (mk, i, ctx = {}) => {
  const lat = numOrNull(mk.lat) === null ? 0 : numOrNull(mk.lat);
  const lng = numOrNull(mk.lng) === null ? 0 : numOrNull(mk.lng);
  const base = ctx.publicBase || "";
  const notes = ctx.notesHtml ? ctx.notesHtml(popupNotes(mk.label)) : renderStyledHtml(popupNotes(mk.label));
  const own = !ctx.readOnly && !mk.root && mk.key && String(mk.author) === String(userId);
  const parts = [
    `<div class="map-popup-head"><span class="map-marker-idx${mk.root ? " map-marker-idx--main" : ""}">${mk.root ? "★" : i}</span>` +
      (ctx.closeHref ? `<a class="map-popup-close" href="${escapeHtml(ctx.closeHref)}">×</a>` : "") + `</div>`,
    isBlob(mk.image) ? `<img class="map-popup-img" src="${escapeHtml(blobSrc(mk.image, base))}" alt=""/>` : "",
    notes ? `<div class="map-popup-text">${notes}</div>` : "",
    `<span class="map-popup-coords">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>`,
    `<div class="map-popup-meta">` + (ctx.readOnly ? "" : userLink(mk.author).outerHTML) +
      (mk.createdAt ? `<span class="map-popup-date">${escapeHtml(moment(mk.createdAt).fromNow())}</span>` : "") + `</div>`,
    `<div class="map-popup-actions">` +
      (ctx.centerHref ? `<a class="map-center-link" href="${escapeHtml(ctx.centerHref)}">${escapeHtml(i18n.mapCenterHere)}</a>` : "") +
      (own ? form({ method: "POST", action: contentDeleteAction('mapMarker', mk.key) },
        ctx.returnTo ? input({ type: "hidden", name: "returnTo", value: ctx.returnTo }) : null,
        button({ type: "submit", class: "btn-singleview btn-delete", title: i18n.mapDeleteMarker }, "✕")).outerHTML : "") + `</div>`
  ];
  return parts.join("");
};

const renderMarkersList = (markers, mapObj, ctx = {}) => {
  const allMarkers = mapObj ? allMarkersOf({ ...mapObj, markers }) : safeArr(markers);
  if (!allMarkers.length) return null;
  const focus = Number.isInteger(ctx.focus) ? ctx.focus : -1;
  const base = ctx.publicBase || "";
  return div({ class: "map-markers-list" },
    h3(`${i18n.mapMarkersTitle} (${allMarkers.length})`),
    div(allMarkers.map((mk, i) => {
      const lat = numOrNull(mk.lat) === null ? 0 : numOrNull(mk.lat);
      const lng = numOrNull(mk.lng) === null ? 0 : numOrNull(mk.lng);
      const centerHref = ctx.viewHref ? ctx.viewHref({ zoom: MAX_ZOOM, lat, lng }, { focus: i }) : null;
      const own = !ctx.readOnly && !mk.root && mk.key && String(mk.author) === String(userId);
      return div({ class: "map-marker-row" + (i === focus ? " map-marker-row--focus" : ""), id: `marker-${i}` },
        span({ class: "map-marker-idx" + (mk.root ? " map-marker-idx--main" : "") }, mk.root ? "★" : String(i)),
        div({ class: "map-marker-body" },
          div({ class: "map-marker-text" },
            firstLine(mk.label) ? span({ class: "map-marker-label" }, firstLine(mk.label)) : null,
            span({ class: "map-marker-coords" }, `${lat.toFixed(4)}, ${lng.toFixed(4)}`),
            span({ class: "map-marker-meta" },
              ctx.readOnly ? null : userLink(mk.author),
              mk.createdAt ? span({ class: "map-marker-date" }, moment(mk.createdAt).fromNow()) : null)),
          isBlob(mk.image) ? img({ src: blobSrc(mk.image, base), class: "map-marker-thumb", alt: "" }) : null),
        div({ class: "map-marker-actions" },
          centerHref ? a({ href: centerHref, class: "map-center-link" }, i18n.mapCenterHere) : null,
          own ? form({ method: "POST", action: contentDeleteAction('mapMarker', mk.key) },
            ctx.returnTo ? input({ type: "hidden", name: "returnTo", value: ctx.returnTo }) : null,
            button({ type: "submit", class: "btn-singleview btn-delete", title: i18n.mapDeleteMarker }, "✕")) : null));
    })));
};

const renderMapCard = (mapObj, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  const markerCount = safeArr(mapObj.markers).length + 1;

  const thumbMarkers = [{ lat: mapObj.lat, lng: mapObj.lng }].concat(
    safeArr(mapObj.markers).map((m) => ({ lat: m.lat, lng: m.lng })));

  const chips = [
    renderStateChip("whole", "🗺", String(mapObj.mapType || "").toUpperCase()),
    renderEncryptedChip(i18n),
    renderLifespanChip(mapObj.lifetime, i18n),
    mapObj.clearnet === true && clearnetEligible(mapObj) ? renderReachChip(true, i18n, mapClearnetHref(mapObj)) : null
  ].filter(Boolean);

  const isOwn = mapObj.author && String(mapObj.author) === String(userId);
  const href = `/maps/${encodeURIComponent(mapObj.key)}?filter=${encodeURIComponent(filter)}`;
  return div({ class: "tribe-card" + (isOwn ? " own-content" : "") },
    div({ class: "card-header activity-card-header" },
      span(),
      renderContentActions(mapObj.key, href, { spread: params.spreadMap && params.spreadMap.get(mapObj.key) || null, author: mapObj.author, favKind: 'maps', isFavorite: mapObj.isFavorite, reportTitle: mapObj.title, returnTo, deleteAction: isOwn ? contentDeleteAction('map', mapObj.key) : undefined })
    ),
    div({ class: "tribe-card-image-wrapper map-card-thumb" },
      a({ href }, renderMap(thumbMarkers, null, 0, { thumb: true, singleZoom: 5 }))
    ),
    div({ class: "tribe-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" }, a({ href }, mapObj.title || i18n.mapAllSectionTitle))
      ),
      chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
      p({ class: "job-meta-line" }, `📍 ${mapObj.lat.toFixed(4)}, ${mapObj.lng.toFixed(4)}`),
      safeText(mapObj.description) ? p({ class: "tribe-card-description" }, ...renderStyledText(safeText(mapObj.description))) : null,
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.mapMarkersTitle || "Markers"}: ${markerCount}`)
      )
    )
  );
};

const renderMapList = (maps, filter, params = {}) =>
  maps.length
    ? maps.map((mapObj) => renderMapCard(mapObj, filter, params))
    : p(params.q ? i18n.mapNoMatch : i18n.noMaps);

exports.renderMapInvitePage = (code) => {
  const pageContent = div({ class: "invite-page" },
    h2(i18n.tribeInviteCodeText, code),
    form({ method: "GET", action: "/maps" },
      input({ type: "hidden", name: "filter", value: "all" }),
      button({ type: "submit", class: "filter-btn" }, i18n.walletBack)
    )
  );
  return template(i18n.mapInviteMode || i18n.tribeInviteCodeText || "Invite", section(pageContent));
};

exports.mapsView = async (maps, filter = "all", mapId = null, params = {}) => {
  if (filter === "edit") params = { ...params, spreadWarning: await renderSpreadEditWarning(mapId) };
  const title = i18n.mapTitle;

  const q = safeText(params.q || "");
  const list = safeArr(maps);
  const mapToEdit = mapId ? list.find((m) => m.key === mapId) : null;
  const allMarkers = list.map((m) => ({ lat: m.lat, lng: m.lng, href: `/maps/${encodeURIComponent(m.key)}` }));
  const emptyMod = moduleIsEmpty(list, filter, "all", q);
  const censusMp = Array.isArray(params.censusList) ? params.censusList : list;
  const mapsChip = (mode) => {
    if (mode === filter) return true;
    if (mode === "mine") return censusMp.some((x) => String(x.author) === String(userId));
    if (mode === "recent") return censusMp.length > 0;
    if (mode === "favorites") return censusMp.some((x) => x.isFavorite);
    return true;
  };

  return template(title,
    section(
      div({ class: "tags-header module-header-line" }, h2(title), p(i18n.mapDescription)),
      renderFilters(filter, q, emptyMod, mapsChip)),
    section(
      filter === "create" || filter === "edit"
        ? renderMapForm(filter, mapId, mapToEdit, { ...params, filter })
        : section(
            emptyMod ? null : div({ class: "maps-search activity-filter-chips activity-toolbar-row" },
              renderModuleStats(list.length),
              form({ method: "GET", action: "/maps", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter }),
                input({ type: "text", name: "q", value: q, placeholder: i18n.mapSearchPlaceholder, class: "filter-box__input" }),
                div({ class: "filter-box__controls" }, button({ type: "submit", class: "filter-box__button" }, i18n.mapSearchButton)))),
            div({ class: "jobs-grid" }, renderMapList(list, filter, { q, spreadMap: params.spreadMap })))));
};

exports.singleMapView = async (mapObj, filter = "all", params = {}) => {
  const q = safeText(params.q || "");
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q });
  const ownerActions = renderMapOwnerActions(filter, mapObj, { q });
  const tribeMembers = safeArr(params.tribeMembers);
  const canClearnet = clearnetEligible(mapObj);
  const isClearnet = canClearnet && mapObj.clearnet === true;

  const base = `/maps/${encodeURIComponent(mapObj.key)}`;
  const allMarkers = allMarkersOf(mapObj);
  const focusRaw = parseInt(lastOf(params.focus));
  const focus = Number.isInteger(focusRaw) && focusRaw >= 0 && focusRaw < allMarkers.length ? focusRaw : -1;
  const picked = parsePick(params.pick);
  const mkLat = picked ? String(picked.lat) : safeText(lastOf(params.mkLat));
  const mkLng = picked ? String(picked.lng) : safeText(lastOf(params.mkLng));
  const placeQ = safeText(lastOf(params.place));
  const placeHits = placeQ ? searchPlaces(placeQ, 5) : null;
  const explicitView = parseView(params.view);
  const view = explicitView
    ? makeView(explicitView.lat, explicitView.lng, explicitView.zoom)
    : (placeHits && placeHits.length ? viewForPlace(placeHits[0]) : resolveView({ zoom: params.zoom, clat: params.clat, clng: params.clng }, allMarkers, { singleZoom: 8 }));
  const baseParams = { filter, q, mkLat: mkLat || undefined, mkLng: mkLng || undefined, focus: focus >= 0 ? focus : undefined };
  const viewHref = viewHrefFor(base, baseParams, "#map");
  const pinHrefs = allMarkers.map((m, i) => viewHref({ zoom: view.zoom, lat: m.lat, lng: m.lng }, { focus: i }));
  const canAdd = canAddMarkers(mapObj, tribeMembers);
  const pageReturnTo = viewHref(view);
  const popup = focus >= 0 ? renderPinPopup(allMarkers[focus], focus, {
    closeHref: viewHrefFor(base, { ...baseParams, focus: undefined }, "#map")(view),
    centerHref: viewHref({ zoom: MAX_ZOOM, lat: allMarkers[focus].lat, lng: allMarkers[focus].lng }, { focus }),
    returnTo: pageReturnTo
  }) : null;

  const mapSide = div({ class: "tribe-side map-detail-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(mapObj.key, `/maps/${encodeURIComponent(mapObj.key)}`, {
        author: mapObj.author,
        favKind: 'maps',
        isFavorite: mapObj.isFavorite,
        spread: params.spreads || null,
        returnTo,
        reportTitle: mapObj.title,
        deleteAction: String(mapObj.author) === String(userId) ? contentDeleteAction('map', mapObj.key) : undefined
      })
    ),
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, mapObj.title || i18n.mapAllSectionTitle)
    ),
    div({ class: "card-chips-row" },
      renderStateChip("whole", "🗺", String(mapObj.mapType || "").toUpperCase()),
      renderEncryptedChip(i18n),
      renderLifespanChip(mapObj.lifetime, i18n),
      canClearnet ? renderReachChip(isClearnet, i18n, isClearnet ? mapClearnetHref(mapObj) : null) : null,
      canClearnet && String(mapObj.author) === String(userId) ? renderClearnetSwitch("maps", mapObj.rootId || mapObj.key, isClearnet) : null
    ),
    safeText(mapObj.description) ? p({ class: "tribe-side-description" }, ...renderStyledText(safeText(mapObj.description))) : null,
    table({ class: "tribe-info-table jobs-info-table" },
      tr(
        td({ class: "tribe-info-label" }, i18n.mapLatLabel),
        td({ class: "tribe-info-value", colspan: "3" }, mapObj.lat.toFixed(6))
      ),
      tr(
        td({ class: "tribe-info-label" }, i18n.mapLngLabel),
        td({ class: "tribe-info-value", colspan: "3" }, mapObj.lng.toFixed(6))
      ),
      tr(
        td({ class: "tribe-info-label" }, i18n.createdAtLabel || "Created at"),
        td({ class: "tribe-info-value", colspan: "3" }, moment(mapObj.createdAt).format("YYYY/MM/DD HH:mm"))
      ),
      tr(
        td({ class: "tribe-info-value", colspan: "4" }, userLink(mapObj.author))
      )
    ),
    renderTags(mapObj.tags),
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.mapMarkersTitle || "Markers"}: ${safeArr(mapObj.markers).length + 1}`)
    ),
    (String(mapObj.author) !== String(userId) && !mapObj.tribeId && mapObj.mapType !== "OPEN")
      ? div({ class: "tribe-side-actions" },
          a({ class: "tribe-action-btn", href: "/invites#invites-maps" }, i18n.tribeEnterInvite)
        )
      : null,
    renderDocumentActions('maps', mapObj.key),
    ownerActions.length ? div({ class: "tribe-side-actions owner-actions" }, ...ownerActions) : null
  );

  const hiddenState = (withView) => [
    input({ type: "hidden", name: "filter", value: filter }),
    q ? input({ type: "hidden", name: "q", value: q }) : null,
    mkLat && mkLng ? input({ type: "hidden", name: "mkLat", value: mkLat }) : null,
    mkLat && mkLng ? input({ type: "hidden", name: "mkLng", value: mkLng }) : null,
    focus >= 0 ? input({ type: "hidden", name: "focus", value: String(focus) }) : null,
    withView ? input({ type: "hidden", name: "clat", value: String(view.lat) }) : null,
    withView ? input({ type: "hidden", name: "clng", value: String(view.lng) }) : null
  ];

  const placeSearch = form({ method: "GET", action: base, class: "filter-box" },
    ...hiddenState(false),
    input({ type: "text", name: "place", value: placeQ, placeholder: i18n.mapPlaceSearchPlaceholder, class: "filter-box__input" }),
    div({ class: "filter-box__controls" }, button({ type: "submit", class: "filter-box__button" }, i18n.mapSearchButton)));

  const mapHero = div({ class: "map-hero" },
    renderPlaceResults(placeHits, (h) => a({ href: viewHref(viewForPlace(h)), class: "map-place-result" },
      span(h.name), h.country ? span({ class: "map-place-result-country" }, h.country) : null)),
    renderMapUrl(mapObj),
    renderMap(allMarkers, null, 0, {
      id: "map",
      view,
      focus,
      pinHrefs,
      popup,
      nav: { href: viewHref },
      viewHref,
      pick: mkLat && mkLng ? { lat: mkLat, lng: mkLng } : null,
      pickForm: canAdd ? MARKER_FORM_ID : null,
      pickAction: base
    }));

  const mapMain = div({ class: "tribe-main map-detail-main" },
    renderMarkersList(mapObj.markers, mapObj, { focus, view, viewHref, returnTo: pageReturnTo }),
    p({ class: "card-footer" },
      span({ class: "date-link" }, `${moment(mapObj.createdAt).format("YYYY/MM/DD HH:mm")}`),
      userLink(mapObj.author),
      mapObj.updatedAt && mapObj.updatedAt !== mapObj.createdAt
        ? span({ class: "votations-comment-date" }, ` · ${i18n.mapUpdatedAt}: ${moment(mapObj.updatedAt).format("YYYY/MM/DD HH:mm")}`)
        : null),
    renderMarkerForm(mapObj, returnTo, { ...params, filter }, tribeMembers, { mkLat, mkLng, view, focus })
  );

  return template(mapObj.title || i18n.mapTitle,
    section(div({ class: "tags-header module-header-line" }, h2(i18n.mapTitle), p(i18n.mapDescription))),
    section(renderFilters(filter, q, false, null, placeSearch)),
    section(mapHero, div({ class: "tribe-details map-detail-grid" }, mapSide, mapMain)));
};

exports.clearnetMapView = async (mapObj, params = {}) => {
  const { escapeHtml: esc, renderRichText, renderKindTag, renderTagChips, renderClearnetPage } = require("./clearnet_view");
  const base = clearnetItemHref("maps", mapObj.title, mapObj.rootId || mapObj.key);
  const allMarkers = allMarkersOf(mapObj);
  const focusRaw = parseInt(lastOf(params.focus));
  const focus = Number.isInteger(focusRaw) && focusRaw >= 0 && focusRaw < allMarkers.length ? focusRaw : -1;
  const explicitView = parseView(params.view);
  const view = explicitView
    ? makeView(explicitView.lat, explicitView.lng, explicitView.zoom)
    : resolveView({ zoom: params.zoom, clat: params.clat, clng: params.clng }, allMarkers, { singleZoom: 8 });
  const viewHref = viewHrefFor(base, { focus: focus >= 0 ? focus : undefined }, "#map");
  const pinHrefs = allMarkers.map((m, i) => viewHref({ zoom: view.zoom, lat: m.lat, lng: m.lng }, { focus: i }));
  const popup = focus >= 0 ? renderPinPopup(allMarkers[focus], focus, {
    readOnly: true,
    publicBase: "/c",
    notesHtml: renderRichText,
    closeHref: viewHrefFor(base, {}, "#map")(view),
    centerHref: viewHref({ zoom: MAX_ZOOM, lat: allMarkers[focus].lat, lng: allMarkers[focus].lng }, { focus })
  }) : null;
  const mapHtml = renderMap(allMarkers, null, 0, { id: "map", view, focus, pinHrefs, popup, nav: { href: viewHref }, viewHref, publicBase: "/c" }).outerHTML;
  const name = mapObj.title || i18n.cnKindMap;
  const desc = renderRichText(mapObj.description || "");
  const coord = (v) => (typeof v === "number" ? v : parseFloat(v) || 0).toFixed(4);
  const extraCss = `
.cn-map-title{color:var(--fg);margin:0 0 16px 0;font-size:32px;font-weight:700;word-break:break-word}
.cn-map-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
.cn-map-desc{color:var(--fg-soft);line-height:1.6;margin:16px 0}
.map-viewer{width:100%}
.map-stage{position:relative;width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;overflow:hidden;line-height:0}
.map-svg{display:block;width:100%;height:auto;font-family:inherit}
.map-pins-layer{position:absolute;top:0;left:0;width:100%;height:100%;z-index:4;pointer-events:none}
.map-pins-layer a{pointer-events:auto}
.map-ocean{fill:#a7c6de}
.map-tile{image-rendering:auto}
.map-grat{fill:none;stroke:rgba(255,255,255,.4);stroke-width:.6}
.map-border{fill:none;stroke:rgba(72,52,32,.65);stroke-width:.8;stroke-linejoin:round}
.map-lake{fill:none;stroke:rgba(36,86,128,.7);stroke-width:.7;stroke-linejoin:round}
.map-state{fill:none;stroke:rgba(72,52,32,.5);stroke-width:.6;stroke-dasharray:3 2}
.map-coast{fill:none;stroke:rgba(36,86,128,.75);stroke-width:.8;stroke-linejoin:round}
.map-label-country{fill:#262c31;font-size:14px;font-weight:600;letter-spacing:.6px;text-anchor:middle;paint-order:stroke;stroke:rgba(255,255,255,.85);stroke-width:3px;stroke-linejoin:round}
.map-place-dot{fill:#1f252a;stroke:#fff;stroke-width:1}
.map-place-capital{fill:#d35400}
.map-place-label{fill:#1f252a;font-size:12px;paint-order:stroke;stroke:rgba(255,255,255,.85);stroke-width:3px;stroke-linejoin:round}
.map-place-label-capital{font-weight:700}
.map-pin-body{fill:#3498db;stroke:#fff;stroke-width:1.5}
.map-pin-main .map-pin-body{fill:#e74c3c}
.map-pin-focus .map-pin-body{fill:var(--accent);stroke-width:2.2}
.map-pin-eye{fill:#fff}
.map-pin-label-bg{fill:var(--bg-elev);stroke:var(--border);stroke-width:.8}
.map-pin-focus .map-pin-label-bg{stroke:var(--accent);stroke-width:1.2}
.map-pin-label{fill:var(--fg);font-size:12px;font-weight:700;text-anchor:middle}
.map-pin-img-frame{fill:#fff}
.map-pins-layer a:hover .map-pin-body,.map-pins a:hover .map-pin-body{fill:var(--accent)}
.map-cluster-ring{fill:var(--bg-elev);opacity:.7}
.map-cluster-dot{fill:var(--accent);stroke:#fff;stroke-width:1.6}
.map-cluster-count{fill:#000;font-size:13px;font-weight:700;text-anchor:middle}
.map-scale-line{fill:none;stroke:#1f252a;stroke-width:1.6}
.map-scale-text{fill:#1f252a;font-size:11px;font-weight:600;paint-order:stroke;stroke:rgba(255,255,255,.85);stroke-width:3px}
.map-attrib{fill:#3b434a;font-size:9px;text-anchor:end;paint-order:stroke;stroke:rgba(255,255,255,.75);stroke-width:2px}
.map-controls{position:absolute;z-index:3;display:flex;flex-direction:column;gap:4px;line-height:1}
.map-controls-zoom{top:10px;left:10px}
.map-controls-pan{top:10px;right:10px;display:grid;grid-template-columns:repeat(3,30px);grid-template-rows:repeat(3,30px);gap:2px}
.map-ctrl{width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;background:var(--bg-elev);color:var(--accent);border:1px solid var(--border);border-radius:6px;text-decoration:none;font-size:17px;font-weight:700;font-family:inherit;box-sizing:border-box}
.map-ctrl:hover{background:var(--accent);color:var(--bg);border-color:var(--accent);text-decoration:none}
.map-ctrl-off{opacity:.35}
.map-ctrl-off:hover{background:var(--bg-elev);color:var(--accent);border-color:var(--border)}
.cn-map-marker{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:8px 6px;border-bottom:1px solid var(--border);color:var(--fg-soft)}
.cn-map-marker--focus{background:var(--bg-sub);box-shadow:inset 3px 0 0 var(--accent)}
.cn-map-marker-idx{min-width:24px;height:24px;border-radius:50%;background:#3498db;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.cn-map-marker-idx--main{background:#e74c3c}
.cn-map-marker--focus .cn-map-marker-idx{background:var(--accent);color:#000}
.cn-map-marker-thumb{width:48px;height:48px;object-fit:cover;border-radius:4px}
.cn-map-marker-text{flex:1;min-width:160px;display:flex;flex-direction:column;gap:2px}
.cn-map-marker-coords{font-family:monospace;color:var(--fg);font-size:13px}
.cn-map-marker-label{word-break:break-word;color:var(--fg)}
.cn-map-marker-date{font-size:12px;color:var(--fg-dim)}
.cn-map-center{color:var(--accent);text-decoration:none;font-size:13px;border:1px solid var(--border);border-radius:6px;padding:4px 8px;white-space:nowrap;margin-left:auto}
.cn-map-center:hover{background:var(--accent);color:var(--bg);text-decoration:none}
.map-popup{pointer-events:auto}
.map-popup-pointer{fill:var(--bg-elev);stroke:var(--border);stroke-width:1}
.map-popup-wrap{height:100%;display:flex;flex-direction:column;justify-content:flex-end;line-height:1.35}
.map-popup--below .map-popup-wrap{justify-content:flex-start}
.map-popup-card{background:var(--bg-elev);border:1px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--fg);font-size:13px;box-sizing:border-box;max-height:100%;overflow:hidden;display:flex;flex-direction:column;gap:6px;text-align:left}
.map-popup-card>*{flex-shrink:0}
.map-popup-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.map-popup-head .map-marker-idx{min-width:24px;height:24px;border-radius:50%;background:#3498db;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.map-popup-head .map-marker-idx--main{background:#e74c3c}
.map-popup-close{color:var(--fg-dim);text-decoration:none;font-size:20px;line-height:1}
.map-popup-close:hover{color:var(--accent);text-decoration:none}
.map-popup-img{width:100%;max-height:120px;object-fit:cover;border-radius:4px;display:block}
.map-popup-text{color:var(--fg);word-break:break-word;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.map-popup-text img{max-width:100%;max-height:100px}
.map-popup-coords{font-family:monospace;font-size:12px;color:var(--fg-soft)}
.map-popup-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:var(--fg-dim)}
.map-popup-actions{display:flex;gap:6px;align-items:center}
.map-popup-actions .cn-map-center,.map-popup-actions .map-center-link{margin-left:0;color:var(--accent);text-decoration:none;font-size:13px;border:1px solid var(--border);border-radius:6px;padding:4px 8px}
`;
  const markerRow = (mk, i) => {
    const centerHref = viewHref({ zoom: MAX_ZOOM, lat: numOrNull(mk.lat) || 0, lng: numOrNull(mk.lng) || 0 }, { focus: i });
    const label = firstLine(mk.label);
    return `<div class="cn-map-marker${i === focus ? " cn-map-marker--focus" : ""}" id="marker-${i}">` +
      `<span class="cn-map-marker-idx${mk.root ? " cn-map-marker-idx--main" : ""}">${mk.root ? "★" : i}</span>` +
      (isBlob(mk.image) ? `<img class="cn-map-marker-thumb" src="${esc(blobSrc(mk.image, "/c"))}" alt=""/>` : "") +
      `<span class="cn-map-marker-text">${label ? `<span class="cn-map-marker-label">${esc(label)}</span>` : ""}` +
      `<span class="cn-map-marker-coords">${coord(mk.lat)}, ${coord(mk.lng)}</span>` +
      (mk.createdAt ? `<span class="cn-map-marker-date">${esc(moment(mk.createdAt).format("YYYY/MM/DD"))}</span>` : "") +
      `</span><a class="cn-map-center" href="${esc(centerHref)}">${esc(i18n.mapCenterHere)}</a></div>`;
  };
  const body = `
  <h1 class="cn-map-title">${esc(name)}</h1>
  <div class="cn-map-meta">
    ${renderKindTag("map")}
    ${mapObj.createdAt ? `<span class="cn-detail">📅 ${esc(moment(mapObj.createdAt).format("YYYY/MM/DD"))}</span>` : ""}
    <span class="cn-detail">📍 ${coord(mapObj.lat)}, ${coord(mapObj.lng)}</span>
  </div>
  ${desc ? `<p class="cn-map-desc">${desc}</p>` : ""}
  ${renderTagChips(mapObj.tags)}
  <hr class="cn-sep"/>
  ${mapHtml}
  <h2 class="cn-section">${esc(i18n.mapMarkersTitle || "Markers")} (${allMarkers.length})</h2>
  ${allMarkers.map(markerRow).join("")}
`;
  return renderClearnetPage({
    title: `${name} | Oasis`,
    ogTitle: name,
    ogDescription: mapObj.description || "",
    extraCss,
    body,
    hubFeedId: mapObj.author || null
  });
};

exports.renderMapLocationUrl = (mapUrl) => {
  if (!mapUrl) return null;
  return span({ class: "map-location-inline" },
    span({ class: "map-location-icon" }, "ꔌ"),
    a({ href: mapUrl, class: "map-location-link" }, mapUrl));
};

exports.renderMapLocationVisitLabel = (mapUrl) => {
  if (!mapUrl) return null;
  return div({ class: "card-field" },
    span({ class: "card-label" }, (i18n.mapLocationTitle || "Map Location") + ":"),
    span({ class: "card-value" },
      a({ href: mapUrl, class: "map-location-link" }, i18n.mapVisitLabel || "Visit map")));
};

exports.renderMapEmbed = (mapData, mapUrl) => {
  if (!mapData || (parseFloat(mapData.lat) === 0 && parseFloat(mapData.lng) === 0))
    return exports.renderMapLocationVisitLabel(mapUrl);
  return div({ class: "map-embed-section" },
    span({ class: "card-label" }, (i18n.mapLocationTitle || "Map Location") + ":"),
    span({ class: "card-value map-zoom-info" }, "Zoom: 2"),
    renderLocalEmbed(mapData.lat, mapData.lng),
    mapUrl ? div({ class: "map-embed-url" },
      a({ href: mapUrl, class: "map-location-link" }, mapUrl)) : null);
};

exports.renderMapEmbedWithZoom = (mapData, mapUrl, detailUrl, zoom) => {
  if (!mapData || (parseFloat(mapData.lat) === 0 && parseFloat(mapData.lng) === 0))
    return exports.renderMapLocationVisitLabel(mapUrl);
  const zoomVal = parseInt(zoom) || 2;
  const la = parseFloat(mapData.lat) || 0;
  const lo = parseFloat(mapData.lng) || 0;
  return div({ class: "map-embed-section" },
    span({ class: "card-label" }, (i18n.mapLocationTitle || "Map Location") + ":"),
    renderMap([{ lat: la, lng: lo }], null, 0, { zoom: zoomVal, centerLat: la, centerLng: lo }),
    mapUrl ? div({ class: "map-embed-url" },
      a({ href: mapUrl, class: "map-location-link" }, mapUrl)) : null);
};

exports.renderMapLocationGrid = (lat, lng) => {
  if (lat === undefined || lng === undefined) return null;
  return div({ class: "map-location-embed" },
    renderMap([{ lat: parseFloat(lat) || 0, lng: parseFloat(lng) || 0 }], null, 0, { zoom: MIN_ZOOM, centerLat: parseFloat(lat) || 0, centerLng: parseFloat(lng) || 0 }));
};
