const { div, h2, p, section, button, form, input, select, option, a, br, textarea, label, span, table, tr, td, img, video } = require("../server/node_modules/hyperaxe");
const moment = require("../server/node_modules/moment");
const { template, i18n, userLink, renderStateChip, renderPrivacyChip, renderLifespanChip, renderEcoTax, renderSpreadButton } = require("./main_views");
const { config } = require("../server/SSB_server.js");
const { renderUrl } = require("../backend/renderUrl");
const opinionCategories = require("../backend/opinion_categories");

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
  option(Object.assign({ value }, isSelected ? { selected: "selected" } : {}), text);

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
    form(
      { method: "POST", action: `/tasks/status/${encodeURIComponent(task.id)}`, class: "project-control-form project-control-form--status" },
      input({ type: "hidden", name: "returnTo", value: returnTo }),
      select(
        { name: "status", class: "project-control-select" },
        option({ value: "OPEN", selected: st === "OPEN" }, i18n.taskStatusOpen),
        option({ value: "IN-PROGRESS", selected: st === "IN-PROGRESS" }, i18n.taskStatusInProgress),
        option({ value: "CLOSED", selected: st === "CLOSED" }, i18n.taskStatusClosed)
      ),
      button({ class: "status-btn project-control-btn", type: "submit" }, setStatusLabel)
    )
  ];
};

const renderTaskAssignAction = (task, isAssignedToMe, returnTo) => {
  const st = normalizeStatus(task.status || "OPEN");
  if (st === "CLOSED") return null;
  return form(
    { method: "POST", action: `/tasks/assign/${encodeURIComponent(task.id)}` },
    input({ type: "hidden", name: "returnTo", value: returnTo }),
    button({ type: "submit", class: "filter-btn" }, isAssignedToMe ? i18n.taskUnassignButton : i18n.taskAssignButton)
  );
};

const renderTaskCommentsSection = (taskId, comments = [], currentFilter = "all") => {
  const commentsCount = Array.isArray(comments) ? comments.length : 0;
  const returnTo = `/tasks/${encodeURIComponent(taskId)}?filter=${encodeURIComponent(currentFilter || "all")}`;

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
        { method: "POST", action: `/tasks/${encodeURIComponent(taskId)}/comments`, class: "comment-form", enctype: "multipart/form-data" },
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
    (() => {
      const visibleComments = (comments || []).filter(c => {
        const t = c && c.value && c.value.content && c.value.content.text;
        return t && String(t).trim();
      });
      return visibleComments.length
      ? div(
          { class: "comments-list" },
          visibleComments.map((c) => {
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
      : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet);
    })()
  );
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

  const heroNode = task.image
    ? div({ class: "tribe-card-image-wrapper" },
        a({ href: `/tasks/${encodeURIComponent(task.id)}` },
          renderTaskMediaBlob(task.image, { class: "tribe-card-hero-image" })
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
    renderTaskStatusChip(task.status),
    isPrivate ? renderPrivacyChip(true, i18n) : null,
    renderTaskPriorityChip(task.priority),
    renderLifespanChip(task.lifetime, i18n)
  ].filter(Boolean);

  const start = task.startTime ? moment(task.startTime).format("YYYY/MM/DD HH:mm") : "";
  const end = task.endTime ? moment(task.endTime).format("YYYY/MM/DD HH:mm") : "";

  return div({ class: "tribe-card task-card" },
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
      ),
      div({ class: "card-spread-centered" }, renderSpreadButton(task.id, spreadInfo)),
      !heroNode
        ? div({ class: "card-visit-btn-centered" },
            form({ method: "GET", action: `/tasks/${encodeURIComponent(task.id)}` },
              input({ type: "hidden", name: "filter", value: currentFilter }),
              button({ type: "submit", class: "filter-btn" }, i18n.viewTask || "View Task")
            )
          )
        : null
    )
  );
};

exports.taskView = async (tasks, filter, taskId, returnTo, params = {}) => {
  const list = Array.isArray(tasks) ? tasks : [tasks];
  const currentFilter = filter || "all";

  const title =
    currentFilter === "mine" ? i18n.taskMineSectionTitle :
    currentFilter === "create" ? i18n.taskCreateSectionTitle :
    currentFilter === "edit" ? i18n.taskUpdateSectionTitle :
    currentFilter === "open" ? i18n.taskOpenTitle :
    currentFilter === "in-progress" ? i18n.taskInProgressTitle :
    currentFilter === "closed" ? i18n.taskClosedTitle :
    currentFilter === "assigned" ? i18n.taskAssignedTitle :
    currentFilter === "priority-urgent" ? i18n.taskFilterUrgent :
    currentFilter === "priority-high" ? i18n.taskFilterHigh :
    currentFilter === "priority-medium" ? i18n.taskFilterMedium :
    currentFilter === "priority-low" ? i18n.taskFilterLow :
    i18n.taskAllSectionTitle;

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
  const editTags = Array.isArray(editTask.tags) ? editTask.tags : [];
  const minCreate = moment().add(1, "minute").format("YYYY-MM-DDTHH:mm");

  const ret = typeof returnTo === "string" && returnTo.startsWith("/tasks")
    ? returnTo
    : "/tasks?filter=mine";

  return template(
    title,
    section(
      div(
        { class: "tags-header" },
        h2(i18n.tasksTitle),
        p(i18n.tasksDescription)
      ),
      div(
        { class: "filters" },
        form(
          { method: "GET", action: "/tasks" },
          button({ type: "submit", name: "filter", value: "all", class: currentFilter === "all" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: currentFilter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterMine),
          button({ type: "submit", name: "filter", value: "assigned", class: currentFilter === "assigned" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterAssigned),
          button({ type: "submit", name: "filter", value: "open", class: currentFilter === "open" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterOpen),
          button({ type: "submit", name: "filter", value: "in-progress", class: currentFilter === "in-progress" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterInProgress),
          button({ type: "submit", name: "filter", value: "closed", class: currentFilter === "closed" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterClosed),
          button({ type: "submit", name: "filter", value: "priority-low", class: currentFilter === "priority-low" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterLow),
          button({ type: "submit", name: "filter", value: "priority-medium", class: currentFilter === "priority-medium" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterMedium),
          button({ type: "submit", name: "filter", value: "priority-high", class: currentFilter === "priority-high" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterHigh),
          button({ type: "submit", name: "filter", value: "priority-urgent", class: currentFilter === "priority-urgent" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterUrgent),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.taskCreateButton)
        )
      )
    ),
    section(
      currentFilter === "edit" || currentFilter === "create"
        ? div(
            { class: "task-form" },
            form(
              { action: currentFilter === "edit" ? `/tasks/update/${encodeURIComponent(taskId)}` : "/tasks/create", method: "POST", enctype: "multipart/form-data" },
              input({ type: "hidden", name: "returnTo", value: ret }),
              label(i18n.taskTitleLabel), br(),
              input({ type: "text", name: "title", required: true, value: currentFilter === "edit" ? (editTask.title || "") : "" }), br(),
              label(i18n.taskDescriptionLabel), br(),
              textarea({ name: "description", required: true, placeholder: i18n.taskDescriptionPlaceholder, rows: "4" }, currentFilter === "edit" ? (editTask.description || "") : ""), br(),
              label(i18n.uploadMedia), br(),
              input({ type: "file", name: "image", accept: "image/*" }), br(),br(),
              label(i18n.taskStartTimeLabel), br(),
              input({
                type: "datetime-local",
                name: "startTime",
                required: true,
                min: currentFilter === "create" ? minCreate : undefined,
                value: currentFilter === "edit" && editTask.startTime ? moment(editTask.startTime).format("YYYY-MM-DDTHH:mm") : ""
              }), br(), br(),
              label(i18n.taskEndTimeLabel), br(),
              input({
                type: "datetime-local",
                name: "endTime",
                required: true,
                min: currentFilter === "create" ? minCreate : undefined,
                value: currentFilter === "edit" && editTask.endTime ? moment(editTask.endTime).format("YYYY-MM-DDTHH:mm") : ""
              }), br(), br(),
              label(i18n.taskPriorityLabel), br(),
              select(
                { name: "priority", required: true },
                opt("URGENT", String(editTask.priority || "").toUpperCase() === "URGENT", i18n.taskPriorityUrgent),
                opt("HIGH", String(editTask.priority || "").toUpperCase() === "HIGH", i18n.taskPriorityHigh),
                opt("MEDIUM", String(editTask.priority || "").toUpperCase() === "MEDIUM", i18n.taskPriorityMedium),
                opt("LOW", !editTask.priority || String(editTask.priority || "").toUpperCase() === "LOW", i18n.taskPriorityLow)
              ), br(), br(),
              label(i18n.taskLocationLabel), br(),
              input({ type: "text", name: "location", value: editTask.location || "" }), br(),
              label(i18n.taskTagsLabel), br(),
              input({ type: "text", name: "tags", value: editTags.join(", ") }), br(),
              label(i18n.taskVisibilityLabel), br(),
              select(
                { name: "isPublic", id: "isPublic" },
                opt("PUBLIC", String(editTask.isPublic || "PUBLIC").toUpperCase() === "PUBLIC", i18n.taskPublic),
                opt("PRIVATE", String(editTask.isPublic || "").toUpperCase() === "PRIVATE", i18n.taskPrivate)
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
      button({ type: "submit", name: "filter", value: "all", class: currentFilter === "all" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterAll),
      button({ type: "submit", name: "filter", value: "mine", class: currentFilter === "mine" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterMine),
      button({ type: "submit", name: "filter", value: "assigned", class: currentFilter === "assigned" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterAssigned),
      button({ type: "submit", name: "filter", value: "open", class: currentFilter === "open" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterOpen),
      button({ type: "submit", name: "filter", value: "in-progress", class: currentFilter === "in-progress" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterInProgress),
      button({ type: "submit", name: "filter", value: "closed", class: currentFilter === "closed" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterClosed),
      button({ type: "submit", name: "filter", value: "priority-low", class: currentFilter === "priority-low" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterLow),
      button({ type: "submit", name: "filter", value: "priority-medium", class: currentFilter === "priority-medium" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterMedium),
      button({ type: "submit", name: "filter", value: "priority-high", class: currentFilter === "priority-high" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterHigh),
      button({ type: "submit", name: "filter", value: "priority-urgent", class: currentFilter === "priority-urgent" ? "filter-btn active" : "filter-btn" }, i18n.taskFilterUrgent),
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
    renderTaskStatusChip(task.status),
    renderPrivacyChip(isPrivate, i18n),
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
  if (task.author && task.author !== userId) {
    sideActions.push(form({ method: "GET", action: "/pm" },
      input({ type: "hidden", name: "recipients", value: task.author }),
      button({ type: "submit", class: "filter-btn" }, i18n.privateMessage)
    ));
  }
  const assignNode = renderTaskAssignAction(task, isAssignedToMe, returnToSelf);
  if (assignNode) sideActions.push(assignNode);
  if (isAuthor) sideActions.push(...renderTaskOwnerActions(task, returnToSelf));

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
    div({ class: "shop-title-row" },
      h2({ class: "tribe-card-title" }, task.title)
    ),
    chips.length ? div({ class: "card-chips-row" }, ...chips) : null,
    div({ class: "card-spread-centered" }, renderSpreadButton(task.id, params.spreads)),
    task.image ? renderTaskMediaBlob(task.image, { class: "tribe-detail-image" }) : null,
    table({ class: "tribe-info-table jobs-info-table" }, ...infoRows),
    tagsNode,
    div({ class: "tribe-card-members" },
      span({ class: "tribe-members-count" }, `${i18n.taskAssignedTo}: ${assignees.length}`)
    ),
    assigneesListNode
  );

  const returnToOpinions = `/tasks/${encodeURIComponent(task.id)}?filter=${encodeURIComponent(currentFilter)}`;
  const opinionsBar = div(
    { class: "voting-buttons" },
    opinionCategories.map((category) =>
      form(
        { method: "POST", action: `/tasks/opinions/${encodeURIComponent(task.id)}/${category}` },
        input({ type: "hidden", name: "returnTo", value: returnToOpinions }),
        button(
          { class: "vote-btn", type: "submit" },
          `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${(task.opinions && task.opinions[category]) ? task.opinions[category] : 0}]`
        )
      )
    )
  );

  const taskMain = div({ class: "tribe-main" },
    sideActions.length ? div({ class: "tribe-side-actions" }, ...sideActions) : null,
    task.description
      ? div({ class: "job-section" },
          h2({ class: "job-section-title" }, i18n.taskDescriptionLabel),
          p({ class: "tribe-side-description" }, ...renderUrl(task.description))
        )
      : null,
    opinionsBar,
    renderTaskCommentsSection(task.id, comments, currentFilter)
  );

  return template(
    task.title,
    section(
      filterBar,
      div({ class: "tribe-details" }, taskSide, taskMain)
    )
  );
};

