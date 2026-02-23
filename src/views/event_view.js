const { div, h2, p, section, button, form, a, span, textarea, br, input, label, select, option } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("./main_views");
const moment = require("../server/node_modules/moment");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");

const userId = config.keys.id;

const opt = (value, isSelected, text) =>
  option(Object.assign({ value }, isSelected ? { selected: "selected" } : {}), text);

const safeArray = (v) => (Array.isArray(v) ? v : []);

const toValueChildren = (v) => {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return renderUrl(v);
  if (typeof v === "number" || typeof v === "boolean") return renderUrl(String(v));
  return [v];
};

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

const renderCardField = (labelText, valueNode) =>
  div(
    { class: "card-field" },
    span({ class: "card-label" }, labelText),
    span({ class: "card-value" }, ...toValueChildren(valueNode))
  );

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
  return [
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
};

const renderEventAttendAction = (e, isAttending, returnTo) => {
  const st = normalizeEventStatus(e.status);
  if (st !== "OPEN") return null;
  return form(
    { method: "POST", action: `/events/attend/${encodeURIComponent(e.id)}` },
    input({ type: "hidden", name: "returnTo", value: returnTo }),
    button({ type: "submit", class: "filter-btn" }, attendanceLabel(isAttending))
  );
};

const renderEventTopbar = (e, filter, opts = {}) => {
  const currentFilter = filter || "all";
  const isSingle = !!opts.single;

  const returnToList = `/events?filter=${encodeURIComponent(currentFilter)}`;
  const returnToSelf = `/events/${encodeURIComponent(e.id)}?filter=${encodeURIComponent(currentFilter)}`;
  const rt = isSingle ? returnToSelf : returnToList;

  const attendees = safeArray(e.attendees);
  const isAttending = attendees.includes(userId);

  const leftActions = [];

  if (!isSingle) {
    leftActions.push(
      form(
        { method: "GET", action: `/events/${encodeURIComponent(e.id)}` },
        input({ type: "hidden", name: "filter", value: currentFilter }),
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      )
    );
  }

  if (e.organizer && e.organizer !== userId) {
    leftActions.push(
      form(
        { method: "GET", action: "/pm" },
        input({ type: "hidden", name: "recipients", value: e.organizer }),
        button({ type: "submit", class: "filter-btn" }, i18n.privateMessage)
      )
    );
  }

  const rightActions = [];
  const attendNode = renderEventAttendAction(e, isAttending, rt);
  if (attendNode) rightActions.push(attendNode);

  const ownerActions = renderEventOwnerActions(e, rt);
  if (ownerActions.length) rightActions.push(...ownerActions);

  const leftNode = leftActions.length ? div({ class: "bookmark-topbar-left event-topbar-left" }, ...leftActions) : null;
  const rightNode = rightActions.length ? div({ class: "bookmark-actions event-actions" }, ...rightActions) : null;

  const nodes = [];
  if (leftNode) nodes.push(leftNode);
  if (rightNode) nodes.push(rightNode);

  return nodes.length ? div({ class: isSingle ? "bookmark-topbar event-topbar-single" : "bookmark-topbar" }, ...nodes) : null;
};

const renderEventCommentsSection = (eventId, comments = [], currentFilter = "all") => {
  const commentsCount = Array.isArray(comments) ? comments.length : 0;
  const returnTo = `/events/${encodeURIComponent(eventId)}?filter=${encodeURIComponent(currentFilter || "all")}`;

  return div(
    { class: "vote-comments-section" },
    div(
      { class: "comments-count" },
      span({ class: "card-label" }, i18n.voteCommentsLabel + ": "),
      span({ class: "card-value" }, String(commentsCount))
    ),
    div(
      { class: "comment-form-wrapper" },
      h2({ class: "comment-form-title" }, i18n.voteNewCommentLabel),
      form(
        { method: "POST", action: `/events/${encodeURIComponent(eventId)}/comments`, class: "comment-form", enctype: "multipart/form-data" },
        input({ type: "hidden", name: "returnTo", value: returnTo }),
        textarea({
          id: "comment-text",
          name: "text",
          rows: 4,
          class: "comment-textarea",
          placeholder: i18n.voteNewCommentPlaceholder
        }),
        div({ class: "comment-file-upload" }, label(i18n.uploadMedia), input({ type: "file", name: "blob" })),
        br(),
        button({ type: "submit", class: "comment-submit-btn" }, i18n.voteNewCommentButton)
      )
    ),
    comments && comments.length
      ? div(
          { class: "comments-list" },
          comments.map((c) => {
            const author = c.value && c.value.author ? c.value.author : "";
            const ts = c.value && c.value.timestamp ? c.value.timestamp : c.timestamp;
            const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm:ss") : "";
            const relDate = ts ? moment(ts).fromNow() : "";
            const userName = author && author.includes("@") ? author.split("@")[1] : author;

            const content = c.value && c.value.content ? c.value.content : {};
            const root = content.fork || content.root || "";
            const text = content.text || "";

            return div(
              { class: "votations-comment-card" },
              span(
                { class: "created-at" },
                span(i18n.createdBy),
                author ? a({ href: `/author/${encodeURIComponent(author)}` }, `@${userName}`) : span("(unknown)"),
                absDate ? span(" | ") : "",
                absDate ? span({ class: "votations-comment-date" }, absDate) : "",
                relDate ? span({ class: "votations-comment-date" }, " | ", i18n.sendTime) : "",
                relDate && root ? a({ href: `/thread/${encodeURIComponent(root)}#${encodeURIComponent(c.key)}` }, relDate) : ""
              ),
              p({ class: "votations-comment-text" }, ...renderUrl(String(text)))
            );
          })
        )
      : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet)
  );
};

const renderEventItem = (e, filter) => {
  const currentFilter = filter || "all";
  const attendees = safeArray(e.attendees);
  const commentCount = typeof e.commentCount === "number" ? e.commentCount : 0;
  const urlHref = safeExternalHref(e.url);

  const topbar = renderEventTopbar(e, currentFilter, { single: false });

  return div(
    { class: "card card-section event" },
    topbar ? topbar : null,
    renderCardField(i18n.eventTitleLabel + ":", e.title),
    renderCardField(i18n.eventDescriptionLabel + ":", ""),
    p(...renderUrl(e.description)),
    renderCardField(i18n.eventDateLabel + ":", e.date ? moment(e.date).format("YYYY/MM/DD HH:mm:ss") : ""),
    e.location && String(e.location).trim() ? renderCardField(i18n.eventLocationLabel + ":", e.location) : null,
    renderCardField(i18n.eventPrivacyLabel + ":", privacyLabel(e.isPublic)),
    renderCardField(i18n.eventStatus + ":", eventStatusLabel(e.status)),
    urlHref ? renderCardField(i18n.eventUrlLabel + ":", a({ href: urlHref, target: "_blank", rel: "noopener noreferrer" }, urlHref)) : null,
    renderCardField(i18n.eventPriceLabel + ":", parseFloat(e.price || 0).toFixed(6) + " ECO"),
    br(),
    div(
      { class: "card-field" },
      span({ class: "card-label" }, i18n.eventAttendees + ":"),
      span(
        { class: "card-value" },
        attendees.length
          ? attendees
              .filter(Boolean)
              .map((id, i) => [i > 0 ? ", " : "", a({ class: "user-link", href: `/author/${encodeURIComponent(id)}` }, id)])
              .flat()
          : i18n.noAttendees
      )
    ),
    br(),
    e.tags && e.tags.filter(Boolean).length
      ? div(
          { class: "card-tags" },
          e.tags.filter(Boolean).map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
        )
      : null,
    div(
      { class: "card-comments-summary" },
      span({ class: "card-label" }, i18n.voteCommentsLabel + ":"),
      span({ class: "card-value" }, String(commentCount)),
      br(),
      br(),
      form(
        { method: "GET", action: `/events/${encodeURIComponent(e.id)}` },
        input({ type: "hidden", name: "filter", value: currentFilter }),
        button({ type: "submit", class: "filter-btn" }, i18n.voteCommentsForumButton)
      )
    ),
    br(),
    p(
      { class: "card-footer" },
      span({ class: "date-link" }, `${moment(e.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
      a({ href: `/author/${encodeURIComponent(e.organizer)}`, class: "user-link" }, `${e.organizer}`)
    )
  );
};

exports.eventView = async (events, filter, eventId, returnTo) => {
  const list = Array.isArray(events) ? events : [events];
  const currentFilter = filter || "all";

  const title =
    currentFilter === "mine" ? i18n.eventMineSectionTitle :
    currentFilter === "create" ? i18n.eventCreateSectionTitle :
    currentFilter === "edit" ? i18n.eventUpdateSectionTitle :
    i18n.eventAllSectionTitle;

  const eventToEdit = list.find((e) => e.id === eventId) || {};
  const editTags = Array.isArray(eventToEdit.tags) ? eventToEdit.tags.filter(Boolean) : [];

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
  const editPrivacy = normalizePrivacy(eventToEdit.isPublic);

  return template(
    title,
    section(
      div({ class: "tags-header" }, h2(i18n.eventsTitle), p(i18n.eventsDescription)),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/events" },
          button({ type: "submit", name: "filter", value: "all", class: currentFilter === "all" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: currentFilter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterMine),
          button({ type: "submit", name: "filter", value: "today", class: currentFilter === "today" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterToday),
          button({ type: "submit", name: "filter", value: "week", class: currentFilter === "week" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterWeek),
          button({ type: "submit", name: "filter", value: "month", class: currentFilter === "month" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterMonth),
          button({ type: "submit", name: "filter", value: "year", class: currentFilter === "year" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterYear),
          button({ type: "submit", name: "filter", value: "archived", class: currentFilter === "archived" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterArchived),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.eventCreateButton)
        )
      )
    ),
    section(
      currentFilter === "edit" || currentFilter === "create"
        ? div(
            { class: "event-form" },
            form(
              {
                action: currentFilter === "edit" ? `/events/update/${encodeURIComponent(eventId)}` : "/events/create",
                method: "POST"
              },
              input({ type: "hidden", name: "returnTo", value: ret }),
              label(i18n.eventTitleLabel),
              br(),
              input({
                type: "text",
                name: "title",
                id: "title",
                required: true,
                value: currentFilter === "edit" ? eventToEdit.title || "" : ""
              }),
              br(),
              br(),
              label(i18n.eventDescriptionLabel),
              br(),
              textarea(
                { name: "description", id: "description", placeholder: i18n.eventDescriptionPlaceholder, rows: "4" },
                currentFilter === "edit" ? eventToEdit.description || "" : ""
              ),
              br(),
              br(),
              label(i18n.eventDateLabel),
              br(),
              input({
                type: "datetime-local",
                name: "date",
                id: "date",
                required: true,
                min: currentFilter === "create" ? minCreate : undefined,
                value: currentFilter === "edit" && eventToEdit.date ? moment(eventToEdit.date).format("YYYY-MM-DDTHH:mm") : ""
              }),
              br(),
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
              label(i18n.eventLocationLabel),
              br(),
              input({
                type: "text",
                name: "location",
                id: "location",
                required: true,
                value: currentFilter === "edit" ? eventToEdit.location || "" : ""
              }),
              br(),
              br(),
              label(i18n.eventUrlLabel),
              br(),
              input({ type: "url", name: "url", id: "url", value: currentFilter === "edit" ? eventToEdit.url || "" : "" }),
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
                value: currentFilter === "edit" ? parseFloat(eventToEdit.price || 0).toFixed(6) : (0).toFixed(6)
              }),
              br(),
              br(),
              label(i18n.eventTagsLabel),
              br(),
              input({ type: "text", name: "tags", id: "tags", value: currentFilter === "edit" ? editTags.join(", ") : "" }),
              br(),
              br(),
              button({ type: "submit" }, currentFilter === "edit" ? i18n.eventUpdateButton : i18n.eventCreateButton)
            )
          )
        : div({ class: "event-list" }, filtered.length > 0 ? filtered.map((e) => renderEventItem(e, currentFilter)) : p(i18n.noevents))
    )
  );
};

exports.singleEventView = async (event, filter, comments = []) => {
  const currentFilter = filter || "all";
  const commentCount = typeof event.commentCount === "number" ? event.commentCount : 0;
  const attendees = safeArray(event.attendees);
  const urlHref = safeExternalHref(event.url);

  const topbar = renderEventTopbar(event, currentFilter, { single: true });

  return template(
    event.title,
    section(
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/events" },
          button({ type: "submit", name: "filter", value: "all", class: currentFilter === "all" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: currentFilter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterMine),
          button({ type: "submit", name: "filter", value: "today", class: currentFilter === "today" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterToday),
          button({ type: "submit", name: "filter", value: "week", class: currentFilter === "week" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterWeek),
          button({ type: "submit", name: "filter", value: "month", class: currentFilter === "month" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterMonth),
          button({ type: "submit", name: "filter", value: "year", class: currentFilter === "year" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterYear),
          button({ type: "submit", name: "filter", value: "archived", class: currentFilter === "archived" ? "filter-btn active" : "filter-btn" }, i18n.eventFilterArchived),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.eventCreateButton)
        )
      ),
      div(
        { class: "card card-section event" },
        topbar ? topbar : null,
        renderCardField(i18n.eventTitleLabel + ":", event.title),
        renderCardField(i18n.eventDescriptionLabel + ":", ""),
        p(...renderUrl(event.description)),
        renderCardField(i18n.eventDateLabel + ":", event.date ? moment(event.date).format("YYYY/MM/DD HH:mm:ss") : ""),
        event.location && String(event.location).trim() ? renderCardField(i18n.eventLocationLabel + ":", event.location) : null,
        renderCardField(i18n.eventPrivacyLabel + ":", privacyLabel(event.isPublic)),
        renderCardField(i18n.eventStatus + ":", eventStatusLabel(event.status)),
        urlHref ? renderCardField(i18n.eventUrlLabel + ":", a({ href: urlHref, target: "_blank", rel: "noopener noreferrer" }, urlHref)) : null,
        renderCardField(i18n.eventPriceLabel + ":", parseFloat(event.price || 0).toFixed(6) + " ECO"),
        br(),
        div(
          { class: "card-field" },
          span({ class: "card-label" }, i18n.eventAttendees + ":"),
          span(
            { class: "card-value" },
            attendees.length
              ? attendees
                  .filter(Boolean)
                  .map((id, i) => [i > 0 ? ", " : "", a({ class: "user-link", href: `/author/${encodeURIComponent(id)}` }, id)])
                  .flat()
              : i18n.noAttendees
          )
        ),
        br(),
        event.tags && event.tags.filter(Boolean).length
          ? div(
              { class: "card-tags" },
              event.tags.filter(Boolean).map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
            )
          : null,
        div(
          { class: "card-comments-summary" },
          span({ class: "card-label" }, i18n.voteCommentsLabel + ":"),
          span({ class: "card-value" }, String(commentCount))
        ),
        br(),
        p(
          { class: "card-footer" },
          span({ class: "date-link" }, `${moment(event.createdAt).format("YYYY/MM/DD HH:mm:ss")} ${i18n.performed} `),
          a({ href: `/author/${encodeURIComponent(event.organizer)}`, class: "user-link" }, `${event.organizer}`)
        )
      ),
      renderEventCommentsSection(event.id, comments, currentFilter)
    )
  );
};

