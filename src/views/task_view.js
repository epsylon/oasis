const { div, h2, p, section, button, form, input, select, option, a, br, textarea, label, span, table, tr, td, img, video } = require("../server/node_modules/hyperaxe");
const { renderCommentsSection: renderSharedCommentsSection } = require("./comments_view");
const moment = require("../server/node_modules/moment");
const { template, i18n, renderOpinionsVoting, renderEngagement, userLink, renderStateChip, renderPrivacyChip, renderLifespanChip, renderEcoTax, renderSpreadButton, renderSpreadEditWarning, renderContentActions, renderDocumentActions } = require("./main_views");
const { renderPhotoGallery, renderGalleryFields, imagesOf } = require("./gallery_view");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");

const renderTaskMediaBlob = (value, attrs = {}) => {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (s.startsWith('&')) return img({ src: `/blob/${encodeURIComponent(s)}`, ...attrs });
  const mImg = s.match(/!\[[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/);
  if (mImg) return img({ src: `/blob/${encodeURIComponent(mImg[1])}`, class: attrs.class || 'post-image' });
  const mVideo = s.match(/\[video:[^\]]*\]\(\s*(&[^)\s]+\.sha256)\s*\)/);
  if (mVideo) return video({ controls: true, class: attrs.class || 'post-video', src: `/blob/${encodeURIComponent(mVideo[1])}` });
  return null;
};

const userId = config.keys.id;

const opt = (value, isSelected, text) =>
  option(Object.assign({ value }, isSelected ? { ...("selected" ? { selected: true } : {})} : {}), text);

const safeArray = (v) => Array.isArray(v) ? v : [];

const normalizeStatus = (v) => {
  const up = String(v || "").toUpperCase();
  if (up === "OPEN" || up === "IN-PROGRESS" || up === "CLOSED") return up;
  return "OPEN";
};

const statusLabel = (s) => {
  const up = normalizeStatus(s);
  if (up === "OPEN") return i18n.taskStatusOpen;
  if (up === "IN-PROGRESS") return i18n.taskStatusInProgress;
  return i18n.taskStatusClosed;
};

const visibilityLabel = (v) => {
  const vv = String(v || "").toUpperCase();
  if (vv === "PRIVATE") return i18n.taskPrivate;
  return i18n.taskPublic;
};

const renderTaskOwnerActions = (task, returnTo) => {
  const st = normalizeStatus(task.status || "OPEN");
  const setStatusLabel = i18n.taskSetStatus;

  return [
    form(
      { method: "GET", action: `/tasks/edit/${encodeURIComponent(task.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ type: "submit", class: "update-btn" }, i18n.taskUpdateButton)
    ),
    form(
      { method: "POST", action: `/tasks/delete/${encodeURIComponent(task.id)}` },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ type: "submit", class: "delete-btn" }, i18n.taskDeleteButton)
    ),
  ];
};

const renderTaskStatusRow = (task, returnTo) => {
  const st = normalizeStatus(task.status || "OPEN");
  return div({ class: "tribe-side-actions housing-status-row" },
    span({ class: "card-label" }, `${i18n.taskStatus}: `),
    renderStateChip(st === "CLOSED" ? "hidden" : "mutuals", st === "CLOSED" ? "🔒" : "👁", statusLabel(task.status)),
    form(
      { method: "POST", action: `/tasks/status/${encodeURIComponent(task.id)}`, class: "project-control-form project-control-form--status" },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      select(
        { name: "status", class: "project-control-select" },
        option({ value: "OPEN", ...(st === "OPEN" ? { selected: true } : {})}, i18n.taskStatusOpen),
        option({ value: "IN-PROGRESS", ...(st === "IN-PROGRESS" ? { selected: true } : {})}, i18n.taskStatusInProgress),
        option({ value: "CLOSED", ...(st === "CLOSED" ? { selected: true } : {})}, i18n.taskStatusClosed)
      ),
      button({ class: "status-btn project-control-btn", type: "submit" }, i18n.taskSetStatus)
    )
  );
};

const renderTaskAssignAction = (task, isAssignedToMe, returnTo) => {
  const st = normalizeStatus(task.status || "OPEN");
  if (st === "CLOSED") return null;
  return [
    span({ class: "card-label" }, `${i18n.taskAssignedTo}: `),
    renderStateChip(isAssignedToMe ? "mutuals" : "whole", isAssignedToMe ? "👤" : "○",
      String(isAssignedToMe ? i18n.taskAssignedChip : i18n.taskUnassignedChip).toUpperCase()),
    form(
      { method: "POST", action: `/tasks/assign/${encodeURIComponent(task.id)}`, class: "project-control-form" },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      button({ type: "submit", class: "status-btn project-control-btn" }, isAssignedToMe ? i18n.taskUnassignButton : i18n.taskAssignButton)
    )
  ];
};

const renderTaskCommentsSection = (taskId, comments = [], currentFilter = "all") => {
  const returnTo = `/tasks/${encodeURIComponent(taskId)}?filter=${encodeURIComponent(currentFilter || "all")}`;
  return renderSharedCommentsSection({
    action: `/tasks/${encodeURIComponent(taskId)}/comments`,
    comments: comments,
    returnTo: returnTo
  });
};

const renderTaskStatusChip = (status) => {
  const s = normalizeStatus(status);
  const variant = s === "OPEN" ? "mutuals" : s === "IN-PROGRESS" ? "whole" : "closed";
  const icon = s === "OPEN" ? "✓" : s === "IN-PROGRESS" ? "↻" : "✗";
  return renderStateChip(variant, icon, statusLabel(s));
};

const renderTaskPriorityChip = (priority) => {
  const p = String(priority || "").toUpperCase();
  if (!p) return null;
  const variant =
    p === "URGENT" ? "closed" :
    p === "HIGH" ? "lifespan-orange" :
    p === "MEDIUM" ? "whole" :
    "mutuals";
  const localized =
    p === "URGENT" ? i18n.taskPriorityUrgent :
    p === "HIGH" ? i18n.taskPriorityHigh :
    p === "MEDIUM" ? i18n.taskPriorityMedium :
    i18n.taskPriorityLow;
  return renderStateChip(variant, "⚑", localized || p);
};

const renderTaskItem = (task, filter, spreadInfo) => {
  const currentFilter = filter || "all";
  const assignees = safeArray(task.assignees);
  const isPrivate = String(task.isPublic || "").toUpperCase() === "PRIVATE";

  const cover = imagesOf(task)[0]
  const heroNode = cover
    ? div({ class: "tribe-card-image-wrapper" },
        a({ href: `/tasks/${encodeURIComponent(task.id)}` },
          renderTaskMediaBlob(cover, { class: "tribe-card-hero-image" })
        ),
        div({ class: "tribe-visit-btn-wrapper" },
          form({ method: "GET", action: `/tasks/${encodeURIComponent(task.id)}` },
            input({ type: "hidden", name: "filter", value: currentFilter }),
            button({ type: "submit", class: "filter-btn" }, i18n.viewTask || "View Task")
          )
        )
      )
    : null;

  const chips = [
    isPrivate ? renderPrivacyChip(true, i18n) : null,
    renderTaskStatusChip(task.status),
    renderTaskPriorityChip(task.priority),
    renderLifespanChip(task.lifetime, i18n)
  ].filter(Boolean);

  const start = task.startTime ? moment(task.startTime).format("YYYY/MM/DD HH:mm") : "";
  const end = task.endTime ? moment(task.endTime).format("YYYY/MM/DD HH:mm") : "";

  return div({ class: "tribe-card task-card" },
    div({ class: "card-header activity-card-header" },
      span(),
      renderContentActions(task.id, `/tasks/${encodeURIComponent(task.id)}`, { spread: spreadInfo || null, author: task.author, favKind: 'tasks', isFavorite: task.isFavorite, reportTitle: task.title })
    ),
    heroNode,
    div({ class: "tribe-card-body" },
      div({ class: "shop-title-row" },
        h2({ class: "tribe-card-title" },
          a({ href: `/tasks/${encodeURIComponent(task.id)}` }, task.title || i18n.tasksTitle)
        )
      ),
      chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
      (start || end) ? p({ class: "card-date-highlight" }, start && end ? `${start} → ${end}` : (start || end)) : null,
      div({ class: "tribe-card-members" },
        span({ class: "tribe-members-count" }, `${i18n.taskAssignedTo}: ${assignees.length}`)
      )
    )
  );
};

exports.taskView = async (tasks, filter, taskId, returnTo, params = {}) => {
  const list = Array.isArray(tasks) ? tasks : [tasks];
  const currentFilter = filter || "all";

  const title = i18n.tasksTitle;

  const canSee = (t) => {
    const vis = String(t.isPublic || "").toUpperCase();
    if (vis === "PUBLIC") return true;
    if (t.author === userId) return true;
    return safeArray(t.assignees).includes(userId);
  };

  const visible = list.filter(canSee);

  let filtered;
  if (currentFilter === "mine") filtered = visible.filter((t) => t.author === userId);
  else if (currentFilter === "assigned") filtered = visible.filter((t) => safeArray(t.assignees).includes(userId));
  else if (currentFilter === "open") filtered = visible.filter((t) => normalizeStatus(t.status) === "OPEN");
  else if (currentFilter === "in-progress") filtered = visible.filter((t) => normalizeStatus(t.status) === "IN-PROGRESS");
  else if (currentFilter === "closed") filtered = visible.filter((t) => normalizeStatus(t.status) === "CLOSED");
  else if (currentFilter === "priority-urgent") filtered = visible.filter((t) => String(t.priority).toUpperCase() === "URGENT");
  else if (currentFilter === "priority-high") filtered = visible.filter((t) => String(t.priority).toUpperCase() === "HIGH");
  else if (currentFilter === "priority-medium") filtered = visible.filter((t) => String(t.priority).toUpperCase() === "MEDIUM");
  else if (currentFilter === "priority-low") filtered = visible.filter((t) => String(t.priority).toUpperCase() === "LOW");
  else filtered = visible;

  filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const editTask = list.find((t) => t.id === taskId) || {};
  const formData = currentFilter === "edit" ? editTask : (params.draft || {});
  const editTags = Array.isArray(formData.tags) ? formData.tags : (typeof formData.tags === "string" ? formData.tags.split(",").map(t => t.trim()).filter(Boolean) : []);
  const minCreate = moment().add(1, "minute").format("YYYY-MM-DDTHH:mm");

  const ret = typeof returnTo === "string" && returnTo.startsWith("/tasks")
    ? returnTo
    : "/tasks?filter=mine";

  return template(
    title,
    section(
      div(
        { class: "tags-header module-header-line" },
        h2(i18n.tasksTitle),
        p(i18n.tasksDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/tasks" },
          button({ type: "submit", name: "filter", value: "all", class: currentFilter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterAll).toUpperCase()),
          button({ type: "submit", name: "filter", value: "mine", class: currentFilter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterMine).toUpperCase()),
          button({ type: "submit", name: "filter", value: "assigned", class: currentFilter === "assigned" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterAssigned).toUpperCase()),
          button({ type: "submit", name: "filter", value: "open", class: currentFilter === "open" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterOpen).toUpperCase()),
          button({ type: "submit", name: "filter", value: "in-progress", class: currentFilter === "in-progress" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterInProgress).toUpperCase()),
          button({ type: "submit", name: "filter", value: "closed", class: currentFilter === "closed" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterClosed).toUpperCase()),
          button({ type: "submit", name: "filter", value: "priority-low", class: currentFilter === "priority-low" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterLow).toUpperCase()),
          button({ type: "submit", name: "filter", value: "priority-medium", class: currentFilter === "priority-medium" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterMedium).toUpperCase()),
          button({ type: "submit", name: "filter", value: "priority-high", class: currentFilter === "priority-high" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterHigh).toUpperCase()),
          button({ type: "submit", name: "filter", value: "priority-urgent", class: currentFilter === "priority-urgent" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterUrgent).toUpperCase()),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.taskCreateButton)
        )
      ),
      currentFilter === "edit" || currentFilter === "create"
        ? null
        : div({ class: "filters activity-filter-chips activity-toolbar-row" },
            form({ method: "GET", action: "/tasks", class: "filter-box" },
              input({ type: "hidden", name: "filter", value: currentFilter }),
              input({ type: "text", name: "q", value: params.q || "", placeholder: i18n.taskSearchPlaceholder, class: "filter-box__input" }),
              div({ class: "filter-box__controls" },
                button({ type: "submit", class: "filter-box__button" }, i18n.searchButton)
              )
            )
          )
    ),
    section(
      currentFilter === "edit" || currentFilter === "create"
        ? div(
            { class: "task-form" },
            currentFilter === "edit" ? await renderSpreadEditWarning(taskId) : null,
            form(
              { action: currentFilter === "edit" ? `/tasks/update/${encodeURIComponent(taskId)}` : "/tasks/create", method: "POST", enctype: "multipart/form-data" },
              input({ type: "hidden", name: "returnTo", value: ret }),
              label(i18n.taskTitleLabel), br(),
              input({ type: "text", name: "title", maxlength: "100", required: true, value: formData.title || params.prefillTitle || "" }), br(),
              label(i18n.taskDescriptionLabel), br(),
              textarea({ maxlength: "5000", name: "description", required: true, placeholder: i18n.taskDescriptionPlaceholder, rows: "4" }, formData.description || params.prefillDescription || ""), br(),
              ...renderGalleryFields(formData, currentFilter === "edit"),
              br(),
              label(i18n.taskStartTimeLabel), br(),
              input({
                type: "datetime-local",
                name: "startTime",
                required: true,
                min: currentFilter === "create" ? minCreate : undefined,
                value: formData.startTime ? moment(formData.startTime).format("YYYY-MM-DDTHH:mm") : ""
              }), br(), br(),
              label(i18n.taskEndTimeLabel), br(),
              input({
                type: "datetime-local",
                name: "endTime",
                required: true,
                min: currentFilter === "create" ? minCreate : undefined,
                value: formData.endTime ? moment(formData.endTime).format("YYYY-MM-DDTHH:mm") : ""
              }), br(), br(),
              label(i18n.taskPriorityLabel), br(),
              select(
                { name: "priority", required: true },
                opt("URGENT", String(formData.priority || "").toUpperCase() === "URGENT", i18n.taskPriorityUrgent),
                opt("HIGH", String(formData.priority || "").toUpperCase() === "HIGH", i18n.taskPriorityHigh),
                opt("MEDIUM", String(formData.priority || "").toUpperCase() === "MEDIUM", i18n.taskPriorityMedium),
                opt("LOW", !formData.priority || String(formData.priority || "").toUpperCase() === "LOW", i18n.taskPriorityLow)
              ), br(), br(),
              label(i18n.taskLocationLabel), br(),
              input({ type: "text", name: "location", value: formData.location || "" }), br(),
              label(i18n.taskTagsLabel), br(),
              input({ type: "text", name: "tags", value: editTags.join(", ") }), br(),
              label(i18n.taskVisibilityLabel), br(),
              select(
                { name: "isPublic", id: "isPublic" },
                opt("PUBLIC", String(formData.isPublic || "PUBLIC").toUpperCase() === "PUBLIC", i18n.taskPublic),
                opt("PRIVATE", String(formData.isPublic || "").toUpperCase() === "PRIVATE", i18n.taskPrivate)
              ), br(), br(),
              button({ type: "submit" }, currentFilter === "edit" ? i18n.taskUpdateButton : i18n.taskCreateButton)
            )
          )
        : filtered.length > 0
          ? div({ class: "jobs-grid" }, filtered.map((t) => renderTaskItem(t, currentFilter, params.spreadMap && params.spreadMap.get(t.id))))
          : p(i18n.notasks)
    )
  );
};

exports.singleTaskView = async (task, filter, comments = [], params = {}) => {
  const currentFilter = filter || "all";
  const assignees = safeArray(task.assignees);
  const commentCount = typeof task.commentCount === "number" ? task.commentCount : 0;

  const isPrivateNoAccess = String(task.isPublic || "").toUpperCase() === "PRIVATE" &&
    String(task.author) !== String(userId) &&
    !assignees.includes(userId);

  const filterBar = div(
    { class: "filters" },
    form(
      { method: "GET", action: "/tasks" },
      button({ type: "submit", name: "filter", value: "all", class: currentFilter === "all" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterAll).toUpperCase()),
      button({ type: "submit", name: "filter", value: "mine", class: currentFilter === "mine" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterMine).toUpperCase()),
      button({ type: "submit", name: "filter", value: "assigned", class: currentFilter === "assigned" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterAssigned).toUpperCase()),
      button({ type: "submit", name: "filter", value: "open", class: currentFilter === "open" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterOpen).toUpperCase()),
      button({ type: "submit", name: "filter", value: "in-progress", class: currentFilter === "in-progress" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterInProgress).toUpperCase()),
      button({ type: "submit", name: "filter", value: "closed", class: currentFilter === "closed" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterClosed).toUpperCase()),
      button({ type: "submit", name: "filter", value: "priority-low", class: currentFilter === "priority-low" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterLow).toUpperCase()),
      button({ type: "submit", name: "filter", value: "priority-medium", class: currentFilter === "priority-medium" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterMedium).toUpperCase()),
      button({ type: "submit", name: "filter", value: "priority-high", class: currentFilter === "priority-high" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterHigh).toUpperCase()),
      button({ type: "submit", name: "filter", value: "priority-urgent", class: currentFilter === "priority-urgent" ? "filter-btn active" : "filter-btn" }, String(i18n.taskFilterUrgent).toUpperCase()),
      button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.taskCreateButton)
    )
  );

  if (isPrivateNoAccess) {
    return template(
      task.title,
      section(filterBar, p({ class: "access-denied-msg" }, i18n.contentAccessDenied))
    );
  }

  const isAuthor = String(task.author) === String(userId);
  const isAssignedToMe = assignees.includes(userId);
  const isPrivate = String(task.isPublic || "").toUpperCase() === "PRIVATE";
  const returnToSelf = `/tasks/${encodeURIComponent(task.id)}?filter=${encodeURIComponent(currentFilter)}`;

  const lifespanChipNode = renderLifespanChip(task.lifetime, i18n);
  const ecoTaxChipNode = renderEcoTax(task.msgSize, task.id);

  const chips = [
    renderPrivacyChip(isPrivate, i18n),
    renderTaskStatusChip(task.status),
    renderTaskPriorityChip(task.priority),
    lifespanChipNode,
    ecoTaxChipNode
  ].filter(Boolean);

  const tagsNode = Array.isArray(task.tags) && task.tags.length
    ? div({ class: "card-tags" },
        task.tags.map((tag) => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
      )
    : null;

  const assigneesListNode = assignees.length
    ? div({ class: "card-assigned-list" },
        ...assignees.filter(Boolean).map((id) => userLink(id))
      )
    : null;

  const sideActions = [];
  const assignNode = renderTaskAssignAction(task, isAssignedToMe, returnToSelf);
  const ownerActions = isAuthor ? renderTaskOwnerActions(task, returnToSelf) : [];

  const infoRows = [];
  const pushRow = (labelText, valueNode) =>
    infoRows.push(tr(
      td({ class: "tribe-info-label" }, labelText),
      td({ class: "tribe-info-value" }, valueNode)
    ));
  if (task.startTime) pushRow(i18n.taskStartTimeLabel, moment(task.startTime).format("YYYY/MM/DD HH:mm"));
  if (task.endTime) pushRow(i18n.taskEndTimeLabel, moment(task.endTime).format("YYYY/MM/DD HH:mm"));
  pushRow(i18n.taskPriorityLabel, String(task.priority || "").toUpperCase() || "—");
  pushRow(i18n.taskStatus, statusLabel(task.status));
  if (task.location && String(task.location).trim()) pushRow(i18n.taskLocationLabel, task.location);

  const taskSide = div({ class: "tribe-side" },
    div({ class: "card-header activity-card-header" },
      renderContentActions(task.id, null, { spread: params.spreads || null, author: task.author, favKind: 'tasks', isFavorite: task.isFavorite, reportTitle: task.title })
    ),
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, task.title)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    renderPhotoGallery(task, 'task'),
    table({ class: "tribe-info-table jobs-info-table" }, ...infoRows),
    assignNode ? div({ class: "tribe-side-actions housing-status-row task-assign-row" }, ...assignNode) : null,
    isAuthor ? renderTaskStatusRow(task, returnToSelf) : null,
    tagsNode,
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.taskAssignedTo}: ${assignees.length}`)
    ),
    assigneesListNode,
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null,
    ownerActions.length ? div({ class: "tribe-side-actions owner-actions" }, ...ownerActions) : null,
    renderDocumentActions('tasks', task.id)
  );

  const returnToOpinions = `/tasks/${encodeURIComponent(task.id)}?filter=${encodeURIComponent(currentFilter)}`;
  const opinionsBar = renderOpinionsVoting('/tasks/opinions', task.id, task.opinions, returnToOpinions, task.opinions_inhabitants);

  const taskMain = div({ class: "tribe-main" },
    task.description
      ? div({ class: "job-section" },
          h2({ class: "job-section-title" }, i18n.taskDescriptionLabel),
          p({ class: "tribe-side-description" }, ...renderUrl(task.description))
        )
      : null,
    p({ class: "card-footer" },
      span({ class: "date-link" }, `${moment(task.createdAt).format("YYYY/MM/DD HH:mm")} ${i18n.performed} `),
      userLink(task.author)
    ),
    renderEngagement(task.id, opinionsBar, renderTaskCommentsSection(task.id, comments, currentFilter))
  );

  return template(
    task.title,
    section(
      div({ class: "tags-header module-header-line" }, h2(i18n.tasksTitle), p(i18n.tasksDescription)),
      filterBar,
      div({ class: "tribe-details" }, taskSide, taskMain)
    )
  );
};

