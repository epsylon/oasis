const { form, button, div, h2, h3, p, section, input, label, br, a, span, textarea, select, option, img, strong } =
  require("../server/node_modules/hyperaxe");

const moment = require("../server/node_modules/moment");
const { template, i18n } = require("./main_views");
const { config } = require("../server/SSB_server.js");
const { renderMapWithPins, renderZoomedMapWithPins, getViewportBounds, latLngToPx, pxToLatLng, MAP_W, MAP_H, getMaxTileZoom } = require("../maps/map_renderer");

const userId = config.keys.id;
const safeArr = (v) => (Array.isArray(v) ? v : []);
const safeText = (v) => String(v || "").trim();

const buildReturnTo = (filter, params = {}) => {
  const f = safeText(filter || "all");
  const q = safeText(params.q || "");
  const parts = [`filter=${encodeURIComponent(f)}`];
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  return `/maps?${parts.join("&")}`;
};

const renderPMButton = (recipient) => {
  const r = safeText(recipient);
  if (!r || String(r) === String(userId)) return null;
  return form({ method: "GET", action: "/pm" },
    input({ type: "hidden", name: "recipients", value: r }),
    button({ type: "submit", class: "filter-btn" }, i18n.privateMessage));
};

const renderTags = (tags) => {
  const list = safeArr(tags).map((t) => String(t || "").trim()).filter(Boolean);
  return list.length
    ? div({ class: "card-tags" }, list.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)))
    : null;
};

const renderMapFavoriteToggle = (mapObj, returnTo = "") =>
  form({
    method: "POST",
    action: mapObj.isFavorite ? `/maps/favorites/remove/${encodeURIComponent(mapObj.key)}` : `/maps/favorites/add/${encodeURIComponent(mapObj.key)}`
  },
    returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
    button({ type: "submit", class: "filter-btn" }, mapObj.isFavorite ? i18n.mapRemoveFavoriteButton : i18n.mapAddFavoriteButton));

let areaCounter = 0;

const buildAreas = (clickUrl, latParam = "lat", lngParam = "lng", viewport = null) => {
  const GRID = 16;
  const cellW = MAP_W / GRID;
  const cellH = MAP_H / GRID;
  const areas = [];
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let c;
      if (viewport) {
        const lat = viewport.latMax - (gy + 0.5) / GRID * (viewport.latMax - viewport.latMin);
        const lng = viewport.lngMin + (gx + 0.5) / GRID * (viewport.lngMax - viewport.lngMin);
        c = { lat: Math.round(lat * 10000) / 10000, lng: Math.round(lng * 10000) / 10000 };
      } else {
        const cx = Math.round(gx * cellW + cellW / 2);
        const cy = Math.round(gy * cellH + cellH / 2);
        c = pxToLatLng(cx, cy);
      }
      const x1 = Math.round(gx * cellW);
      const y1 = Math.round(gy * cellH);
      const x2 = Math.round((gx + 1) * cellW);
      const y2 = Math.round((gy + 1) * cellH);
      areas.push(`<area shape="rect" coords="${x1},${y1},${x2},${y2}" href="${clickUrl}${latParam}=${c.lat}&amp;${lngParam}=${c.lng}" alt="${c.lat},${c.lng}">`);
    }
  }
  return areas;
};

const renderMap = (markers, clickUrl, mainIdx, opts = {}) => {
  areaCounter++;
  const mapName = `m${areaCounter}`;
  const latParam = opts.latParam || "lat";
  const lngParam = opts.lngParam || "lng";
  const pinLabels = opts.pinLabels || [];
  const pinImages = opts.pinImages || [];
  const pfx = opts.pinPrefix || `pin${areaCounter}`;
  const zoom = parseInt(opts.zoom) || 2;
  const centerLat = typeof opts.centerLat === "number" ? opts.centerLat : 0;
  const centerLng = typeof opts.centerLng === "number" ? opts.centerLng : 0;

  const pinList = safeArr(markers).filter((m) => m && typeof m.lat === "number" && typeof m.lng === "number");
  const useZoom = zoom > 2;
  const mapFile = useZoom
    ? renderZoomedMapWithPins(centerLat, centerLng, zoom, pinList, mainIdx)
    : (pinList.length > 0 ? renderMapWithPins(pinList, mainIdx) : null);
  const imgSrc = mapFile ? `/mapcache/${mapFile}` : "/assets/images/worldmap-z2.png";
  const viewport = useZoom && clickUrl ? getViewportBounds(centerLat, centerLng, zoom) : null;

  const useMap = clickUrl || pinLabels.length > 0;
  const mapTag = useMap ? mapName : "";

  let gridAreasHtml = "";
  if (clickUrl) {
    const clickUrlWithZoom = zoom > 2 ? `${clickUrl}zoom=${zoom}&` : clickUrl;
    gridAreasHtml = buildAreas(clickUrlWithZoom, latParam, lngParam, viewport).join("");
  }
  let popupAreasHtml = "";
  let popupsHtml = "";
  if (pinLabels.length > 0) {
    const vp = useZoom ? getViewportBounds(centerLat, centerLng, zoom) : null;
    pinList.forEach((m, i) => {
      const lbl = pinLabels[i] || "";
      let px;
      if (vp) {
        px = {
          x: ((m.lng - vp.lngMin) / (vp.lngMax - vp.lngMin)) * MAP_W,
          y: ((vp.latMax - m.lat) / (vp.latMax - vp.latMin)) * MAP_H
        };
      } else {
        px = latLngToPx(m.lat, m.lng);
      }
      const escaped = lbl.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const withLinks = escaped.replace(/https?:\/\/[^\s&"<>]+/g, (url) => {
        const clean = url.replace(/&amp;/g, "&");
        return `<a href="${clean}" class="map-popup-link" target="_blank" rel="noopener">${url}</a>`;
      }).replace(/\n/g, "<br>");
      const sz = 20 * Math.pow(2, Math.max(0, zoom - getMaxTileZoom()));
      const x1 = Math.max(0, px.x - sz);
      const y1 = Math.max(0, px.y - sz);
      const x2 = Math.min(MAP_W, px.x + sz);
      const y2 = Math.min(MAP_H, px.y + sz);
      const popupId = `${pfx}_${i}`;
      const latStr = typeof m.lat === "number" ? m.lat.toFixed(4) : "";
      const lngStr = typeof m.lng === "number" ? m.lng.toFixed(4) : "";
      const imgBlobId = pinImages[i] && String(pinImages[i]).startsWith("&") ? pinImages[i] : "";
      const imgHtml = imgBlobId ? `<img src="/blob/${encodeURIComponent(imgBlobId)}" class="map-popup-img" alt="">` : "";
      popupAreasHtml += `<area shape="rect" coords="${x1},${y1},${x2},${y2}" title="${escaped}" alt="${escaped}" href="#${popupId}">`;
      popupsHtml += `<div id="${popupId}" class="map-popup"><div class="map-popup-box"><a href="#" class="map-popup-close">&#x2715;</a>${imgHtml}<div class="map-popup-label">${withLinks}</div><div class="map-popup-coords">${latStr}, ${lngStr}</div></div></div>`;
    });
  }
  const mapHtml = useMap ? `<map name="${mapTag}">${popupAreasHtml}${gridAreasHtml}</map>` : "";
  const useAttr = useMap ? ` usemap="#${mapTag}"` : "";

  const mapWrapHtml = `<div class="map-wrap"><img src="${imgSrc}" class="map-img" alt="map"${useAttr}>${mapHtml}</div>`;
  const viewerEl = div({ class: "map-viewer" }, { innerHTML: mapWrapHtml });
  if (!popupsHtml) return viewerEl;
  return div({ class: "map-zone" }, viewerEl, div({ class: "map-popup-container", innerHTML: popupsHtml }));
};

const renderCoordPreview = (lat, lng) => {
  if (!lat && !lng) return null;
  return span({ class: "map-coord-inline" },
    span({ class: "map-coord-pin" }, "📍"),
    strong(`${lat}, ${lng}`));
};

const renderLocalEmbed = (lat, lng) => {
  const la = parseFloat(lat) || 0;
  const lo = parseFloat(lng) || 0;
  if (!la && !lo) return null;
  return renderMap([{ lat: la, lng: lo }], null, 0);
};

const renderMapUrl = (mapObj) =>
  div({ class: "map-url-container" },
    span({ class: "card-label" }, i18n.mapUrlLabel + ": "),
    a({ href: `/maps/${encodeURIComponent(mapObj.key)}`, class: "map-url-link" },
      `/maps/${encodeURIComponent(mapObj.key)}`));

const renderMapOwnerActions = (filter, mapObj, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  if (String(mapObj.author) !== String(userId)) return [];
  return [
    form({ method: "GET", action: `/maps/edit/${encodeURIComponent(mapObj.key)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "update-btn", type: "submit" }, i18n.mapUpdateButton)),
    form({ method: "POST", action: `/maps/delete/${encodeURIComponent(mapObj.key)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ class: "delete-btn", type: "submit" }, i18n.mapDeleteButton))
  ];
};

const renderFilters = (filter, q) =>
  div({ class: "filters" },
    form({ method: "GET", action: "/maps", class: "ui-toolbar ui-toolbar--filters" },
      input({ type: "hidden", name: "q", value: q || "" }),
      button({ type: "submit", name: "filter", value: "all", class: filter === "all" ? "filter-btn active" : "filter-btn" }, i18n.mapFilterAll),
      button({ type: "submit", name: "filter", value: "mine", class: filter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.mapFilterMine),
      button({ type: "submit", name: "filter", value: "recent", class: filter === "recent" ? "filter-btn active" : "filter-btn" }, i18n.mapFilterRecent),
      button({ type: "submit", name: "filter", value: "favorites", class: filter === "favorites" ? "filter-btn active" : "filter-btn" }, i18n.mapFilterFavorites),
      button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.mapUploadButton)));

const renderMapForm = (filter, mapId, mapToEdit, params = {}) => {
  const returnFilter = filter === "create" ? "all" : params.filter || "all";
  const returnTo = safeText(params.returnTo) || buildReturnTo(returnFilter, params);
  const latVal = params.lat !== undefined ? String(params.lat) : String(mapToEdit?.lat || "");
  const lngVal = params.lng !== undefined ? String(params.lng) : String(mapToEdit?.lng || "");
  const titleVal = params.title || mapToEdit?.title || "";
  const descVal = params.description || mapToEdit?.description || "";
  const markerLabelVal = params.markerLabel !== undefined ? params.markerLabel : (mapToEdit?.markerLabel || "");
  const tagsValue = params.tags !== undefined ? params.tags : safeArr(mapToEdit?.tags).join(", ");
  const mapTypeVal = params.mapType || mapToEdit?.mapType || "SINGLE";
  const maxTileZoom = getMaxTileZoom();
  const zoomVal = parseInt(params.zoom) || 2;
  const cleanUrl = `/maps?filter=create${params.tribeId ? '&tribeId=' + encodeURIComponent(params.tribeId) : ''}`;
  const pickerMarkers = latVal && lngVal ? [{ lat: parseFloat(latVal), lng: parseFloat(lngVal) }] : [];

  return div({ class: "map-create-layout" },
    div({ class: "map-form map-form-full" },
      form({
        action: filter === "edit" ? `/maps/update/${encodeURIComponent(mapId)}` : "/maps/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        input({ type: "hidden", name: "filter", value: "create" }),
        params.tribeId ? input({ type: "hidden", name: "tribeId", value: params.tribeId }) : null,
        label(i18n.title || "Title"),
        input({ type: "text", name: "title", placeholder: i18n.mapTitlePlaceholder || "Map title", value: titleVal }),
        label(i18n.mapDescriptionLabel),
        textarea({ name: "description", placeholder: i18n.mapDescriptionPlaceholder, rows: "3" }, descVal),
        label(i18n.mapTagsLabel),
        input({ type: "text", name: "tags", placeholder: i18n.mapTagsPlaceholder, value: tagsValue }),
        label(i18n.mapTypeLabel),
        select({ name: "mapType" },
          option({ value: "SINGLE", ...(mapTypeVal === "SINGLE" ? { selected: true } : {}) }, "SINGLE"),
          option({ value: "OPEN", ...(mapTypeVal === "OPEN" ? { selected: true } : {}) }, "OPEN"),
          option({ value: "CLOSED", ...(mapTypeVal === "CLOSED" ? { selected: true } : {}) }, "CLOSED")),
        br(),br(),
        label(i18n.mapMarkerLabelField),
        textarea({ name: "markerLabel", placeholder: i18n.mapMarkerLabelPlaceholder, rows: "3" }, markerLabelVal),
        label(i18n.markerImageLabel || "Marker Image"),
        input({ type: "file", name: "image", accept: "image/*" }),
        br(), br(),
        label(i18n.mapLatLabel),
        input({ type: "text", name: "lat", placeholder: i18n.mapLatPlaceholder, value: latVal }),
        label(i18n.mapLngLabel),
        input({ type: "text", name: "lng", placeholder: i18n.mapLngPlaceholder, value: lngVal }),
        div({ class: "map-form-row" },
          button({ type: "submit", attrs: { formmethod: "GET" }, formaction: "/maps", class: "filter-btn" }, i18n.mapAddMarkerButton || "Add Marker"),
          a({ href: cleanUrl, class: "filter-btn" }, i18n.mapCleanMarkerButton || "Clean Marker")),
        renderCoordPreview(latVal, lngVal),
        label(i18n.mapZoomLabel || "Zoom"),
        select({ name: "zoom" },
          [2, 3, 4, 5, 6, 7, 8].map(z =>
            option({ value: String(z), ...(zoomVal === z ? { selected: true } : {}) }, String(z)))),
        br(),br(),
        button({ type: "submit", attrs: { formmethod: "GET" }, formaction: "/maps", class: "filter-btn" }, i18n.mapApplyZoom || "Apply Zoom"),
        div({ class: "map-form-map-slot" },
          renderMap(pickerMarkers, null, 0, { zoom: zoomVal, centerLat: parseFloat(latVal) || 0, centerLng: parseFloat(lngVal) || 0 })),
        button({ type: "submit", class: "create-button" }, filter === "edit" ? i18n.mapUpdateButton : i18n.mapCreateButton))));
};

const renderMarkerForm = (mapObj, returnTo, params = {}, tribeMembers = []) => {
  if (mapObj.mapType === "SINGLE") return null;
  if (mapObj.mapType === "CLOSED" && String(mapObj.author) !== String(userId)) return null;
  if (mapObj.mapType === "OPEN" && mapObj.tribeId && !tribeMembers.includes(userId)) return null;
  const mkLat = params.mkLat || "";
  const mkLng = params.mkLng || "";
  const zoomVal = parseInt(params.zoom) || 2;

  const existingMarkers = [{ lat: mapObj.lat, lng: mapObj.lng }].concat(
    safeArr(mapObj.markers).map((m) => ({ lat: m.lat, lng: m.lng })));
  if (mkLat && mkLng) existingMarkers.push({ lat: parseFloat(mkLat), lng: parseFloat(mkLng) });

  const pinLabels = [mapObj.markerLabel || mapObj.description || mapObj.title || ""].concat(
    safeArr(mapObj.markers).map((m) => m.label || ""));

  const mkCleanUrl = `/maps/${encodeURIComponent(mapObj.key)}?filter=${encodeURIComponent(params.filter || "all")}`;
  const clickUrl = `/maps/${encodeURIComponent(mapObj.key)}?filter=${encodeURIComponent(params.filter || "all")}&zoom=${zoomVal}&`;
  return div({ class: "map-marker-form", id: "add-marker" },
    h3(i18n.mapAddMarkerTitle),
    form({ method: "POST", action: `/maps/${encodeURIComponent(mapObj.key)}/marker`, class: "map-form", enctype: "multipart/form-data" },
      returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,    
      label(i18n.mapMarkerLabelField),
      textarea({ name: "label", placeholder: i18n.mapMarkerLabelPlaceholder, rows: "3" }, params.mkMarkerLabel || ""),
      label(i18n.markerImageLabel || "Marker Image"),
      input({ type: "file", name: "image", accept: "image/*" }),
      br(),br(),
      label(i18n.mapMarkerLatLabel),
      input({ type: "text", name: "mkLat", placeholder: i18n.mapLatPlaceholder, value: String(mkLat) }),
      label(i18n.mapMarkerLngLabel),
      input({ type: "text", name: "mkLng", placeholder: i18n.mapLngPlaceholder, value: String(mkLng) }),
      div({ class: "map-form-row" },
        button({ type: "submit", attrs: { formmethod: "GET" }, formaction: `/maps/${encodeURIComponent(mapObj.key)}`, class: "filter-btn" }, i18n.mapAddMarkerButton || "Add Marker"),
        a({ href: mkCleanUrl, class: "filter-btn" }, i18n.mapCleanMarkerButton || "Clean Marker")),
      renderCoordPreview(mkLat, mkLng),
      label(i18n.mapZoomLabel || "Zoom"),
      select({ name: "zoom" },
        [2, 3, 4, 5, 6, 7, 8].map(z =>
          option({ value: String(z), ...(zoomVal === z ? { selected: true } : {}) }, String(z)))),
      br(),br(),
      button({ type: "submit", attrs: { formmethod: "GET" }, formaction: `/maps/${encodeURIComponent(mapObj.key)}`, class: "filter-btn" }, i18n.mapApplyZoom || "Apply Zoom"),
      div({ class: "map-form-map-slot" },
        renderMap(existingMarkers, clickUrl, 0, { latParam: "mkLat", lngParam: "mkLng", pinLabels, pinPrefix: `mk${areaCounter}`, zoom: zoomVal, centerLat: parseFloat(mkLat) || parseFloat(mapObj.lat) || 0, centerLng: parseFloat(mkLng) || parseFloat(mapObj.lng) || 0 })),
      button({ type: "submit", class: "create-button" }, i18n.mapAddMarkerButton)));
};

const renderMarkersList = (markers, mapObj) => {
  const allMarkers = [];
  if (mapObj) {
    allMarkers.push({
      lat: mapObj.lat,
      lng: mapObj.lng,
      label: mapObj.markerLabel || mapObj.description || mapObj.title || i18n.mapMarkerDefault,
      author: mapObj.author,
      createdAt: mapObj.createdAt
    });
  }
  allMarkers.push(...safeArr(markers));
  if (!allMarkers.length) return null;
  return div({ class: "map-markers-list" },
    h3(i18n.mapMarkersTitle),
    br(),
    div(allMarkers.flatMap((mk, i) => [
      ...(i > 0 ? [br()] : []),
        div({ class: "map-marker-info" },
          span({ class: "map-marker-dot" }, "ꔌ"),
          span({ class: "map-marker-coords" }, `${(typeof mk.lat === 'number' ? mk.lat : 0).toFixed(4)}, ${(typeof mk.lng === 'number' ? mk.lng : 0).toFixed(4)}`),
          span({ class: "map-marker-meta" },
            a({ href: `/author/${encodeURIComponent(mk.author)}`, class: "user-link" }, mk.author),
            ` · ${moment(mk.createdAt).fromNow()}`))
    ])));
};

const renderMapCard = (mapObj, filter, params = {}) => {
  const returnTo = buildReturnTo(filter, params);
  const ownerActions = renderMapOwnerActions(filter, mapObj, params);
  const markerCount = safeArr(mapObj.markers).length;

  const thumbMarkers = [{ lat: mapObj.lat, lng: mapObj.lng }].concat(
    safeArr(mapObj.markers).map((m) => ({ lat: m.lat, lng: m.lng })));
  const thumbFile = renderMapWithPins(thumbMarkers, 0);
  const thumbSrc = thumbFile ? `/mapcache/${thumbFile}` : "/assets/images/worldmap-z2.png";

  return div({ class: "map-card" },
    a({ href: `/maps/${encodeURIComponent(mapObj.key)}?filter=${encodeURIComponent(filter)}`, class: "map-card-thumb-link" },
      { innerHTML: `<img src="${thumbSrc}" class="map-card-thumb" alt="map">` }),
    div({ class: "map-card-body" },
      mapObj.title ? h2(a({ href: `/maps/${encodeURIComponent(mapObj.key)}?filter=${encodeURIComponent(filter)}` }, mapObj.title)) : null,
      div({ class: "map-card-header" },
        div({ class: "map-card-info" },
          span({ class: "map-type-badge" }, mapObj.mapType),
          span({ class: "map-coords" }, `📍 ${mapObj.lat.toFixed(4)}, ${mapObj.lng.toFixed(4)}`),
          markerCount > 0 ? span({ class: "map-marker-count" }, `▾ ${markerCount}`) : null,
          mapObj.key ? renderMapUrl(mapObj) : null),
        div({ class: "map-card-actions" },
          form({ method: "GET", action: `/maps/${encodeURIComponent(mapObj.key)}` },
            input({ type: "hidden", name: "returnTo", value: returnTo }),
            input({ type: "hidden", name: "filter", value: filter || "all" }),
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)),
          renderMapFavoriteToggle(mapObj, returnTo),
          renderPMButton(mapObj.author),
          ...ownerActions)),
      safeText(mapObj.description) ? p({ class: "map-description" }, mapObj.description) : null,
      p({ class: "card-footer" },
        span({ class: "date-link" }, moment(mapObj.createdAt).fromNow()),
        span(" · "),
        a({ href: `/author/${encodeURIComponent(mapObj.author)}`, class: "user-link" }, mapObj.author))));
};

const renderMapList = (maps, filter, params = {}) =>
  maps.length
    ? maps.map((mapObj) => renderMapCard(mapObj, filter, params))
    : p(params.q ? i18n.mapNoMatch : i18n.noMaps);

exports.mapsView = async (maps, filter = "all", mapId = null, params = {}) => {
  const title = filter === "mine" ? i18n.mapMineSectionTitle
    : filter === "create" ? i18n.mapCreateSectionTitle
      : filter === "edit" ? i18n.mapUpdateSectionTitle
        : filter === "recent" ? i18n.mapRecentSectionTitle
          : filter === "favorites" ? i18n.mapFavoritesSectionTitle
            : i18n.mapAllSectionTitle;

  const q = safeText(params.q || "");
  const list = safeArr(maps);
  const mapToEdit = mapId ? list.find((m) => m.key === mapId) : null;
  const allMarkers = list.map((m) => ({ lat: m.lat, lng: m.lng, href: `/maps/${encodeURIComponent(m.key)}` }));

  return template(title,
    section(
      div({ class: "tags-header" }, h2(title), p(i18n.mapDescription)),
      renderFilters(filter, q)),
    section(
      filter === "create" || filter === "edit"
        ? renderMapForm(filter, mapId, mapToEdit, { ...params, filter })
        : section(
            div({ class: "maps-search" },
              form({ method: "GET", action: "/maps", class: "filter-box" },
                input({ type: "hidden", name: "filter", value: filter }),
                input({ type: "text", name: "q", value: q, placeholder: i18n.mapSearchPlaceholder, class: "filter-box__input" }),
                div({ class: "filter-box__controls" }, button({ type: "submit", class: "filter-box__button" }, i18n.mapSearchButton)))),
            div({ class: "maps-list" }, renderMapList(list, filter, { q })))));
};

exports.singleMapView = async (mapObj, filter = "all", params = {}) => {
  const q = safeText(params.q || "");
  const returnTo = safeText(params.returnTo) || buildReturnTo(filter, { q });
  const ownerActions = renderMapOwnerActions(filter, mapObj, { q });
  const tribeMembers = safeArr(params.tribeMembers);
  const zoomVal = parseInt(params.zoom) || 2;

  const allMarkers = [{ lat: mapObj.lat, lng: mapObj.lng }].concat(
    safeArr(mapObj.markers).map((m) => ({ lat: m.lat, lng: m.lng })));

  const pinLabels = [mapObj.markerLabel || mapObj.description || mapObj.title || ""].concat(
    safeArr(mapObj.markers).map((m) => m.label || ""));
  const pinImages = [mapObj.image || ""].concat(safeArr(mapObj.markers).map((m) => m.image || ""));

  return template(mapObj.title || i18n.mapTitle,
    section(renderFilters(filter, q)),
    section(
      div({ class: "map-detail" },
        mapObj.title ? h2(mapObj.title) : null,
        safeText(mapObj.description) ? p({ class: "map-description" }, mapObj.description) : null,
        div({ class: "map-detail-header" },
          div({ class: "map-detail-info" },
            span({ class: "map-type-badge" }, mapObj.mapType),
            span({ class: "map-coords-detail" }, `📍 ${mapObj.lat.toFixed(6)}, ${mapObj.lng.toFixed(6)}`)),
          div({ class: "map-detail-actions" },
            renderMapFavoriteToggle(mapObj, returnTo),
            renderPMButton(mapObj.author),
            ...ownerActions)),
        renderMapUrl(mapObj),
        br(),
        form({ method: "GET", action: `/maps/${encodeURIComponent(mapObj.key)}` },
          label(i18n.mapZoomLabel || "Zoom"),
          br(),
          select({ name: "zoom" },
            [2, 3, 4, 5, 6, 7, 8].map(z =>
              option({ value: String(z), ...(zoomVal === z ? { selected: true } : {}) }, String(z)))),
          br(), br(),
          button({ type: "submit", class: "filter-btn" }, i18n.mapApplyZoom || "Apply Zoom")),
        br(),
        renderMap(allMarkers, null, 0, { pinLabels, pinImages, pinPrefix: `detail${areaCounter}`, zoom: zoomVal, centerLat: parseFloat(mapObj.lat) || 0, centerLng: parseFloat(mapObj.lng) || 0 }),
        renderMarkersList(mapObj.markers, mapObj),
        renderTags(mapObj.tags),
        br(),
        p({ class: "card-footer" },
          span({ class: "date-link" }, `${moment(mapObj.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
          a({ href: `/author/${encodeURIComponent(mapObj.author)}`, class: "user-link" }, mapObj.author),
          mapObj.updatedAt && mapObj.updatedAt !== mapObj.createdAt
            ? span({ class: "votations-comment-date" }, ` · ${i18n.mapUpdatedAt}: ${moment(mapObj.updatedAt).format("YYYY/MM/DD HH:mm:ss")}`)
            : null),
        renderMarkerForm(mapObj, returnTo, params, tribeMembers))));
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
    form({ method: "GET", action: detailUrl },
      label(i18n.mapZoomLabel || "Zoom"),
      br(),
      select({ name: "zoom" },
        [2, 3, 4, 5, 6, 7, 8].map(z =>
          option({ value: String(z), ...(zoomVal === z ? { selected: true } : {}) }, String(z)))),
      br(), br(),
      button({ type: "submit", class: "filter-btn" }, i18n.mapApplyZoom || "Apply Zoom")),
    br(),
    renderMap([{ lat: la, lng: lo }], null, 0, { zoom: zoomVal, centerLat: la, centerLng: lo }),
    mapUrl ? div({ class: "map-embed-url" },
      a({ href: mapUrl, class: "map-location-link" }, mapUrl)) : null);
};

exports.renderMapLocationGrid = (lat, lng) => {
  if (lat === undefined || lng === undefined) return null;
  return div({ class: "map-location-embed" },
    renderMap([{ lat: parseFloat(lat) || 0, lng: parseFloat(lng) || 0 }], null, 0));
};
