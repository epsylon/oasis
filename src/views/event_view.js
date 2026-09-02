const { div, h2, p, section, button, form, a, span, textarea, br, input, label, select, option, table, tr, td, details, summary, ul, li } = require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view");
const { template, i18n, renderOpinionsVoting, renderEngagement, userLink, renderStateChip, renderOpenClosedChip, renderPrivacyChip, renderLifespanChip, renderEcoTax, renderSpreadButton, renderContentActions, renderSpreadEditWarning, renderDocumentActions, renderInviteQrCard, renderSubscriptionBox } = require("./main_views");
const { renderPhotoGallery, renderGalleryFields } = require("./gallery_view");
const { renderIntervalBlock } = require("./calendars_view");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");
const { renderMapLocationUrl, renderMapEmbed, renderMapLocationVisitLabel } = require("./maps_view");

const userId = config.keys.id;

exports.renderEventInvitePage = (code) => {
  const pageContent = div({ class: "invite-page" },
    h2(i18n.tribeInviteCodeText, code),
    form({ method: "GET", action: "/events" },
      button({ type: "submit", class: "filter-btn" }, i18n.walletBack)
    )
  );
  return template(i18n.invitesEventsTitle || "Events", section(pageContent));
};

const opt = (value, isSelected, text) =>
  option(Object.assign({ value }, isSelected ? { ...("selected" ? { selected: true } : {})} : {}), text);

const safeArray = (v) => (Array.isArray(v) ? v : []);

const normalizePrivacy = (v) => {
  const s = String(v || "public").toLowerCase();
  return s === "private" ? "private" : "public";
};

const privacyLabel = (v) => (normalizePrivacy(v) === "private" ? i18n.eventPrivate : i18n.eventPublic);

const safeExternalHref = (url) => {
  const s = String(url || "").trim();
  const lower = s.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:")) return s;
  return "";
};

const normalizeEventStatus = (v) => {
  const up = String(v || "").toUpperCase();
  if (up === "OPEN" || up === "CLOSED") return up;
  return up || "OPEN";
};

const eventStatusLabel = (v) => {
  const st = normalizeEventStatus(v);
  if (st === "OPEN") return i18n.eventStatusOpen;
  if (st === "CLOSED") return i18n.eventStatusClosed;
  return st;
};

const attendanceLabel = (isAttending) => (isAttending ? i18n.eventAttended : i18n.eventUnattended);

const renderEventOwnerActions = (e, returnTo) => {
  const st = normalizeEventStatus(e.status);
  if (e.organizer !== userId || st !== "OPEN") return [];
  const actions = [
    form(
      { method: "GET", action: `/events/edit/${encodeURIComponent(e.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ type: "submit", class: "update-btn" }, i18n.eventUpdateButton)
    ),
    form(
      { method: "POST", action: `/events/delete/${encodeURIComponent(e.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ type: "submit", class: "delete-btn" }, i18n.eventDeleteButton)
    )
  ];
  if (normalizePrivacy(e.isPublic) === "private") {
    actions.push(form(
      { method: "POST", action: `/events/generate-invite/${encodeURIComponent(e.id)}` },
      button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeGenerateInvite)
    ));
    if (e.openInviteCode) {
      actions.push(div({ class: "tribe-open-invite" },
        span({ class: "card-label" }, i18n.tribeInviteCodeText),
        span({ class: "tribe-open-invite-code" }, e.openInviteCode),
        renderInviteQrCard({ qrDataUrl: `/qr-invite-code/${encodeURIComponent(e.openInviteCode)}` })
      ));
      actions.push(form(
        { method: "POST", action: `/events/open-invite/remove/${encodeURIComponent(e.id)}` },
        button({ type: "submit", class: "tribe-action-btn danger-btn" }, i18n.tribeRemoveInvitation)
      ));
    } else {
      actions.push(form(
        { method: "POST", action: `/events/open-invite/create/${encodeURIComponent(e.id)}` },
        button({ type: "submit", class: "tribe-action-btn" }, i18n.tribeOpenInvitation)
      ));
    }
  }
  return actions;
};

const renderEventAttendAction = (e, isAttending, returnTo) => {
  const st = normalizeEventStatus(e.status);
  if (st !== "OPEN") return null;
  if (e.organizer === userId) return null;
  if (normalizePrivacy(e.isPublic) === "private" && !isAttending) {
    return a({ class: "tribe-action-btn", href: "/invites#invites-events" }, i18n.tribeEnterInvite);
  }
  return form(
    { method: "POST", action: `/events/attend/${encodeURIComponent(e.id)}` },
    input({ type: "hidden", name: "returnTo", value: returnTo }),
    button({ type: "submit", class: "filter-btn" }, attendanceLabel(isAttending))
  );
};

const renderEventCommentsSection = (eventId, comments = [], currentFilter = "all") => {
  const returnTo = `/events/${encodeURIComponent(eventId)}?filter=${encodeURIComponent(currentFilter || "all")}`;
  return renderSharedCommentsSection({
    action: `/events/${encodeURIComponent(eventId)}/comments`,
    comments: comments,
    returnTo: returnTo
  });
};

const renderEventStatusChip = (status) => {
  const localized = eventStatusLabel(status);
  return renderOpenClosedChip(status, { statusChipOPEN: localized, statusChipCLOSED: localized });
};

const renderEventItem = exports.renderEventItem = (e, filter, spreadInfo) => {
  const currentFilter = filter || "all";
  const attendees = safeArray(e.attendees);
  const isPrivate = normalizePrivacy(e.isPublic) === "private";
  const isAttending = attendees.includes(userId);
  const price = parseFloat(e.price || 0);

  const chips = [
    renderPrivacyChip(isPrivate, i18n),
    renderEventStatusChip(e.status),
    e.encrypted ? renderStateChip("encrypted", "🔒", i18n.encryptedChipLabel || "E2E") : null,
    isAttending ? renderStateChip("whole", "★", i18n.eventAttended) : null,
    renderLifespanChip(e.lifetime, i18n),
    e.subscriptionIn === true
      ? renderStateChip("mutuals", "✉", i18n.subscriptionOn)
      : (e.subscriptionIn === false ? renderStateChip("closed", "✉", i18n.subscriptionOff) : null)
  ].filter(Boolean);

  const dateText = e.date ? moment(e.date).format("YYYY/MM/DD HH:mm") : "";

  const isOwn = e.organizer && String(e.organizer) === String(userId);
  return div({ class: "trending-card event-card" + (isOwn ? " own-content" : "") },
    div(
      { class: "card-header activity-card-header" },
      span(),
      renderContentActions(e.id, `/events/${encodeURIComponent(e.id)}?filter=${encodeURIComponent(currentFilter)}`, { spread: spreadInfo || null, author: e.organizer || e.author, favKind: 'events', isFavorite: e.isFavorite, reportTitle: e.title })
    ),
    div({ class: "card-section event-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" },
          a({ href: `/events/${encodeURIComponent(e.id)}` }, e.title || i18n.eventsTitle)
        )
      ),
      chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
      dateText ? p({ class: "card-date-highlight" }, dateText) : null,
      e.location && String(e.location).trim()
        ? p({ class: "job-meta-line" }, String(e.location))
        : null,
      price > 0
        ? div({ class: "job-price-line card-salary" }, `${price.toFixed(6)} ECO`)
        : null,
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.eventAttendees}: ${attendees.length}`)
      )
    )
  );
};

exports.eventView = async (events, filter, eventId, returnTo, params = {}) => {
  const list = Array.isArray(events) ? events : [events];
  const currentFilter = filter || "all";
  const { renderReachChip: renderReachChipEvents } = require('./clearnet_view');
  const viewerClearnetEvents = !!(params.viewerPrefs && params.viewerPrefs.clearnetEvents);

  const title = i18n.eventsTitle;

  const eventToEdit = list.find((e) => e.id === eventId) || {};
  const formData = currentFilter === "edit" ? eventToEdit : (params.draft || {});
  const spreadWarning = currentFilter === "edit" ? await renderSpreadEditWarning(eventToEdit && eventToEdit.id) : null;
  const editTags = Array.isArray(formData.tags) ? formData.tags.filter(Boolean) : (typeof formData.tags === "string" ? formData.tags.split(",").map(t => t.trim()).filter(Boolean) : []);

  const canSee = (e) => {
    const isPub = normalizePrivacy(e.isPublic) === "public";
    if (isPub) return true;
    if (e.organizer === userId) return true;
    return safeArray(e.attendees).includes(userId);
  };

  const visible = list.filter(canSee);

  let filtered;
  if (currentFilter === "all") {
    filtered = visible.filter((e) => normalizePrivacy(e.isPublic) === "public");
  } else if (currentFilter === "mine") {
    filtered = visible.filter((e) => e.organizer === userId);
  } else if (currentFilter === "today") {
    filtered = visible.filter((e) => normalizePrivacy(e.isPublic) === "public" && moment(e.date).isSame(moment(), "day"));
  } else if (currentFilter === "week") {
    filtered = visible.filter((e) => normalizePrivacy(e.isPublic) === "public" && moment(e.date).isBetween(moment(), moment().add(7, "days"), null, "[]"));
  } else if (currentFilter === "month") {
    filtered = visible.filter((e) => normalizePrivacy(e.isPublic) === "public" && moment(e.date).isBetween(moment(), moment().add(1, "month"), null, "[]"));
  } else if (currentFilter === "year") {
    filtered = visible.filter((e) => normalizePrivacy(e.isPublic) === "public" && moment(e.date).isBetween(moment(), moment().add(1, "year"), null, "[]"));
  } else if (currentFilter === "archived") {
    filtered = visible.filter((e) => normalizePrivacy(e.isPublic) === "public" && normalizeEventStatus(e.status) === "CLOSED");
  } else {
    filtered = [];
  }

  filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const minCreate = moment().add(1, "minute").format("YYYY-MM-DDTHH:mm");

  const ret = typeof returnTo === "string" && returnTo.startsWith("/events") ? returnTo : "/events?filter=mine";
  const editPrivacy = normalizePrivacy(formData.isPublic);
  const editInterval = formData.interval
    || (formData.intervalWeekly ? "weekly" : formData.intervalMonthly ? "monthly" : formData.intervalYearly ? "yearly" : "");
  const editIntervalUntil = (formData.recurrenceUntil || formData.intervalDeadline)
    ? moment(formData.recurrenceUntil || formData.intervalDeadline).format("YYYY-MM-DDTHH:mm")
    : "";

  return template(
    title,
    section(
      div({ class: "tags-header module-header-line" },
        h2(i18n.eventsTitle),
        p(i18n.eventsDescription)
      ),
      div({ class: "shop-title-row" }, renderReachChipEvents(viewerClearnetEvents, i18n)),
      br(),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/events" },
          button({ type: "submit", name: "filter", value: "all", class: currentFilter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterAll).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mine", class: currentFilter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterMine).toUpperCase()),
          button({ type: "submit", name: "filter", value: "today", class: currentFilter === "today" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterToday).toUpperCase()),
          button({ type: "submit", name: "filter", value: "week", class: currentFilter === "week" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterWeek).toUpperCase()),
          button({ type: "submit", name: "filter", value: "month", class: currentFilter === "month" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterMonth).toUpperCase()),
          button({ type: "submit", name: "filter", value: "year", class: currentFilter === "year" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterYear).toUpperCase()),
          button({ type: "submit", name: "filter", value: "archived", class: currentFilter === "archived" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterArchived).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.eventCreateButton)
        )
      ),
      currentFilter === "edit" || currentFilter === "create"
        ? null
        : div({ class: "filters activity-filter-chips activity-toolbar-row" },
            form({ method: "GET", action: "/events", class: "filter-box" },
              input({ type: "hidden", name: "filter", value: currentFilter }),
              input({ type: "text", name: "q", value: params.q || "", placeholder: i18n.eventSearchPlaceholder, class: "filter-box__input" }),
              div({ class: "filter-box__controls" },
                button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
              )
            )
          )
    ),
    section(
      currentFilter === "edit" || currentFilter === "create"
        ? div(
            { class: "event-form" },
            spreadWarning,
            form(
              {
                action: currentFilter === "edit" ? `/events/update/${encodeURIComponent(eventId)}` : "/events/create",
                method: "POST",
                enctype: "multipart/form-data"
              },
              input({ type: "hidden", name: "returnTo", value: ret }),
              label(i18n.eventTitleLabel),
              br(),
              input({
                type: "text",
                name: "title", maxlength: "100",
                id: "title",
                required: true,
                value: formData.title || ""
              }),
              br(),
              label(i18n.eventDescriptionLabel),
              br(),
              textarea(
                { name: "description", id: "description", placeholder: i18n.eventDescriptionPlaceholder, rows: "4" },
                formData.description || ""
              ),
              br(),
              ...renderGalleryFields(formData, currentFilter === "edit"),
              br(),
              label(i18n.eventDateLabel),
              br(),
              input({
                type: "datetime-local",
                name: "date",
                id: "date",
                required: true,
                min: currentFilter === "create" ? minCreate : undefined,
                value: formData.date ? moment(formData.date).format("YYYY-MM-DDTHH:mm") : ""
              }),
              br(),
              br(),
              label(i18n.eventLocationLabel),
              br(),
              input({
                type: "text",
                name: "location",
                id: "location",
                required: true,
                value: formData.location || ""
              }),
              br(),
              label(i18n.mapLocationTitle || "Map Location"),
              br(),
              input({ type: "text", name: "mapUrl", placeholder: i18n.mapUrlPlaceholder || "/maps/MAP_ID", value: formData.mapUrl || "" }),
              br(),
              br(),
              label(i18n.eventUrlLabel),
              br(),
              input({ type: "url", name: "url", id: "url", value: formData.url || "" }),
              br(),
              br(),
              label(i18n.eventPriceLabel),
              br(),
              input({
                type: "number",
                name: "price",
                id: "price",
                min: "0.000000",
                step: "0.000001",
                value: parseFloat(formData.price || 0).toFixed(6)
              }),
              br(),
              br(),
              label(i18n.eventTagsLabel),
              br(),
              input({ type: "text", name: "tags", id: "tags", value: editTags.join(", ") }),
              br(),
              br(),
              div({ class: "event-recurrence-block" },
                label(i18n.eventRecurrenceLabel),
                br(),
                renderIntervalBlock({ min: minCreate }, editInterval, editIntervalUntil)
              ),
              br(),
              label(i18n.eventPrivacyLabel),
              br(),
              select(
                { name: "isPublic", id: "isPublic" },
                opt("public", editPrivacy !== "private", i18n.eventPublic),
                opt("private", editPrivacy === "private", i18n.eventPrivate)
              ),
              br(),
              br(),
              ...(currentFilter === "create" ? [
                input({ type: "hidden", name: "addToCalendar", value: "0" }),
                label(i18n.eventAddToCalendar || "Add to Calendar"),
                br(),
                input({ id: "addToCalendar", type: "checkbox", name: "addToCalendar", value: "1", class: "meme-checkbox" }),
                br(),
                br()
              ] : []),
              button({ type: "submit" }, currentFilter === "edit" ? i18n.eventUpdateButton : i18n.eventCreateButton)
            )
          )
        : filtered.length > 0
          ? div({ class: "jobs-grid" }, filtered.map((e) => renderEventItem(e, currentFilter, params.spreadMap && params.spreadMap.get(e.id))))
          : p(i18n.noevents)
    )
  );
};

exports.singleEventView = async (event, filter, comments = [], params = {}) => {
  const currentFilter = filter || "all";
  const commentCount = typeof event.commentCount === "number" ? event.commentCount : 0;
  const attendees = safeArray(event.attendees);
  const urlHref = safeExternalHref(event.url);

  const isPrivateNoAccess = normalizePrivacy(event.isPublic) === "private" &&
    String(event.organizer) !== String(userId) &&
    !attendees.includes(userId);

  const filterBar = div(
    { class: "filters" },
    form(
      { method: "GET", action: "/events" },
      button({ type: "submit", name: "filter", value: "all", class: currentFilter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterAll).toUpperCase()),
      button({ type: "submit", name: "filter", value: "mine", class: currentFilter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterMine).toUpperCase()),
      button({ type: "submit", name: "filter", value: "today", class: currentFilter === "today" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterToday).toUpperCase()),
      button({ type: "submit", name: "filter", value: "week", class: currentFilter === "week" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterWeek).toUpperCase()),
      button({ type: "submit", name: "filter", value: "month", class: currentFilter === "month" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterMonth).toUpperCase()),
      button({ type: "submit", name: "filter", value: "year", class: currentFilter === "year" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterYear).toUpperCase()),
      button({ type: "submit", name: "filter", value: "archived", class: currentFilter === "archived" ? "filter-btn active" : "filter-btn" }, String(i18n.eventFilterArchived).toUpperCase()),
      button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.eventCreateButton)
    )
  );

  if (isPrivateNoAccess) {
    return template(
      event.title,
      section(filterBar, p({ class: "access-denied-msg" }, i18n.contentAccessDenied))
    );
  }

  const { renderReachChip, renderEncryptedChip } = require('./clearnet_view');
  const isClearnet = !!(params.authorPrefs && params.authorPrefs.clearnetEvents && normalizeEventStatus(event.status) !== 'CLOSED' && normalizePrivacy(event.isPublic) === 'public');
  const isPrivate = normalizePrivacy(event.isPublic) === 'private';
  const isEncrypted = !!event.encrypted || isPrivate;
  const isAttending = attendees.includes(userId);
  const isOrganizer = String(event.organizer) === String(userId);
  const isEventOwner = String(event.organizer || event.author) === String(userId);
  const sharesEvent = isEventOwner || attendees.includes(userId);
  const eventSubIn = isEventOwner || (event.subscription && event.subscription.subscribed === true);
  const returnToSelf = `/events/${encodeURIComponent(event.id)}?filter=${encodeURIComponent(currentFilter)}`;

  const chips = [
    renderPrivacyChip(isPrivate, i18n),
    renderEventStatusChip(event.status),
    isEncrypted ? renderEncryptedChip(i18n) : renderReachChip(isClearnet, i18n),
    isAttending ? renderStateChip("whole", "★", i18n.eventAttended) : null,
    renderLifespanChip(event.lifetime, i18n),
    renderEcoTax(event.msgSize, event.id),
    (event.subscription && sharesEvent)
      ? renderStateChip(eventSubIn ? "mutuals" : "closed", "✉", eventSubIn ? i18n.subscriptionOn : i18n.subscriptionOff)
      : null
  ].filter(Boolean);

  const sideActions = [];
  const attendNode = renderEventAttendAction(event, isAttending, returnToSelf);
  if (attendNode) sideActions.push(attendNode);
  if (params.linkedCalendarId) {
    sideActions.push(form({ method: "GET", action: `/calendars/${encodeURIComponent(params.linkedCalendarId)}` },
      button({ type: "submit", class: "tribe-action-btn" }, i18n.eventVisitCalendar || "Visit calendar")
    ));
  }
  const ownerActions = isOrganizer ? renderEventOwnerActions(event, returnToSelf) : [];

  const tagsNode = event.tags && event.tags.filter(Boolean).length
    ? div({ class: "card-tags" },
        event.tags.filter(Boolean).map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
      )
    : null;

  const infoRows = [];
  const pushRow = (labelText, valueNode) =>
    infoRows.push(tr(
      td({ class: "tribe-info-label" }, labelText),
      td({ class: "tribe-info-value" }, valueNode)
    ));
  if (event.date) pushRow(i18n.eventDateLabel, moment(event.recurring && event.nextDate ? event.nextDate : event.date).format("YYYY/MM/DD HH:mm"));
  if (event.recurring) {
    const parts = [
      event.intervalWeekly ? (i18n.calendarIntervalWeekly || "Weekly") : null,
      event.intervalMonthly ? (i18n.calendarIntervalMonthly || "Monthly") : null,
      event.intervalYearly ? (i18n.calendarIntervalYearly || "Yearly") : null
    ].filter(Boolean);
    pushRow(i18n.eventRecurrenceLabel, parts.join(" · "));
    if (event.recurrenceUntil) pushRow(i18n.eventRecurrenceUntil, moment(event.recurrenceUntil).format("YYYY/MM/DD HH:mm"));
  }
  pushRow(i18n.eventStatus, eventStatusLabel(event.status));
  pushRow(i18n.eventPrivacyLabel, privacyLabel(event.isPublic));
  if (event.location && String(event.location).trim()) pushRow(i18n.eventLocationLabel, event.location);
  if (urlHref) pushRow(i18n.eventUrlLabel, a({ href: urlHref, target: "_blank", rel: "noopener noreferrer" }, urlHref));
  const price = parseFloat(event.price || 0);
  if (price > 0) pushRow(i18n.eventPriceLabel, `${price.toFixed(6)} ECO`);

  const attendeesListNode = attendees.length
    ? div({ class: "card-assigned-list" },
        ...attendees.filter(Boolean).map((id) => userLink(id))
      )
    : null;

  const eventSide = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(event.id, null, { spread: params.spreads || null, author: event.organizer || event.author, favKind: 'events', isFavorite: event.isFavorite, reportTitle: event.title })
    ),
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, event.title)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    renderPhotoGallery(event, 'event'),
    table({ class: "tribe-info-table jobs-info-table" }, ...infoRows),
    event.recurring && Array.isArray(event.occurrences) && event.occurrences.length > 1
      ? details({ class: "event-occurrences" },
          summary({ class: "chat-thread-summary" }, `${i18n.eventUpcomingDates} (${event.occurrences.length})`),
          ul({ class: "event-occurrence-list" },
            ...event.occurrences.map(d => li(moment(d).format("YYYY/MM/DD HH:mm")))
          )
        )
      : null,
    tagsNode,
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.eventAttendees}: ${attendees.length}`)
    ),
    attendeesListNode,
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null,
    ownerActions.length ? div({ class: "tribe-side-actions owner-actions" }, ...ownerActions) : null,
    (event.subscription && sharesEvent)
      ? renderSubscriptionBox({
          target: event.id,
          scope: "events",
          subscribed: event.subscription.subscribed === true,
          count: event.subscription.count,
          isOwner: isEventOwner,
          returnTo: returnToSelf
        })
      : null,
    renderDocumentActions('events', event.id)
  );

  const returnToOpinions = `/events/${encodeURIComponent(event.id)}?filter=${encodeURIComponent(currentFilter)}`;
  const opinionsBar = renderOpinionsVoting('/events/opinions', event.id, event.opinions, returnToOpinions, event.opinions_inhabitants);

  const eventMain = div({ class: "tribe-main" },
    event.description
      ? div({ class: "job-section" },
          h2({ class: "job-section-title" }, i18n.eventDescriptionLabel),
          p({ class: "tribe-side-description" }, ...renderUrl(event.description))
        )
      : null,
    event.mapUrl ? div({ class: "job-section" }, renderMapEmbed(params.mapData, event.mapUrl)) : null,
    p({ class: "card-footer" },
      span({ class: "date-link" }, `${moment(event.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
      userLink(event.organizer)
    ),
    renderEngagement(event.id, opinionsBar, renderEventCommentsSection(event.id, comments, currentFilter))
  );

  return template(
    event.title,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.eventsTitle), p(i18n.eventsDescription)),
      filterBar,
      div({ class: "tribe-details" }, eventSide, eventMain)
    )
  );
};

exports.clearnetEventView = async (event) => {
  const { escapeHtml: esc, renderClearnetPage } = require('./clearnet_view');
  const title = esc(event.title || 'Event');
  const desc = esc(event.description || '');
  const dateStr = event.date ? esc(moment(event.date).format("YYYY/MM/DD HH:mm")) : '';
  const loc = esc(event.location || '');
  const price = parseFloat(event.price || 0);
  const priceStr = price > 0 ? `${price.toFixed(2)} ECO` : '';
  const urlHref = safeExternalHref(event.url);
  const extraCss = `
.cn-event-title{color:var(--fg);margin:0 0 16px 0;font-size:32px;font-weight:700}
.cn-event-meta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.cn-event-meta-item{background:var(--bg-sub);border:1px solid var(--border);border-radius:6px;padding:8px 14px;font-size:14px;color:var(--fg-soft);display:inline-flex;align-items:center;gap:6px}
.cn-event-meta-id{font-family:monospace;font-size:11px;word-break:break-all;max-width:100%}
.cn-event-desc{color:var(--fg-soft);white-space:pre-wrap;line-height:1.6;font-size:15px;margin:0 0 20px 0}
.cn-event-link{display:inline-block;margin-top:12px;background:var(--bg-sub);border:1px solid var(--fg);color:var(--fg);padding:8px 16px;border-radius:6px;font-weight:600}
`;
  const body = `
  <h1 class="cn-event-title">${title}</h1>
  <div class="cn-event-meta">
    ${dateStr ? `<span class="cn-event-meta-item">📅 ${dateStr}</span>` : ''}
    ${loc ? `<span class="cn-event-meta-item">📍 ${loc}</span>` : ''}
    ${priceStr ? `<span class="cn-event-meta-item">💰 ${priceStr}</span>` : ''}
  </div>
  ${desc ? `<p class="cn-event-desc">${desc}</p>` : ''}
  ${urlHref ? `<a class="cn-event-link" href="${esc(urlHref)}" target="_blank" rel="noopener noreferrer">More info →</a>` : ''}
`;
  return renderClearnetPage({
    title: `${event.title || 'Event'} — Oasis`,
    ogTitle: event.title || 'Event',
    ogDescription: event.description || '',
    extraCss,
    body,
    hubFeedId: event.organizer || null
  });
};

