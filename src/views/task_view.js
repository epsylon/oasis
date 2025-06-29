const { div, h2, p, section, button, form, input, select, option, a, br, textarea, label } = require("../server/node_modules/hyperaxe");
const moment = require('../server/node_modules/moment');
const { template, i18n } = require('./main_views');
const { config } = require('../server/SSB_server.js');

const userId = config.keys.id;

const generateFilterButtons = (filters, currentFilter, action) => {
  return filters.map(mode =>
    form({ method: 'GET', action },
      input({ type: 'hidden', name: 'filter', value: mode }),
      button({ type: 'submit', class: currentFilter === mode.toLowerCase() ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
    )
  );
};

const renderTaskItem = (task, filter, userId) => {
  const actions = [];
  if (filter === 'mine' && task.author === userId) {
    actions.push(
      form({ method: 'GET', action: `/tasks/edit/${encodeURIComponent(task.id)}` }, button({ type: 'submit', class: 'update-btn' }, i18n.taskUpdateButton)),
      form({ method: 'POST', action: `/tasks/delete/${encodeURIComponent(task.id)}` }, button({ type: 'submit', class: 'delete-btn' }, i18n.taskDeleteButton)),
      form({ method: 'POST', action: `/tasks/status/${encodeURIComponent(task.id)}` },
        button({ type: 'submit', name: 'status', value: 'OPEN' }, i18n.taskStatusOpen), br(),
        button({ type: 'submit', name: 'status', value: 'IN-PROGRESS' }, i18n.taskStatusInProgress), br(),
        button({ type: 'submit', name: 'status', value: 'CLOSED' }, i18n.taskStatusClosed)
      )
    );
  }
  if (task.status !== 'CLOSED') {
    actions.push(
      form({ method: 'POST', action: `/tasks/assign/${encodeURIComponent(task.id)}` }, button({ type: 'submit' }, task.assignees.includes(userId) ? i18n.taskUnassignButton : i18n.taskAssignButton))
    );
  }
  return div({ class: 'task-item' },
    actions.length > 0 ? div({ class: 'task-actions' }, ...actions) : null,
    h2(task.title),
    p(`${i18n.taskDescriptionLabel}: ${task.description}`),
    p(`${i18n.taskStartTimeLabel}: ${moment(task.startTime).format(i18n.dateFormat)}`),
    p(`${i18n.taskEndTimeLabel}: ${moment(task.endTime).format(i18n.dateFormat)}`),
    p(`${i18n.taskPriorityLabel}: ${task.priority}`),
    task.location?.trim() ? p(`${i18n.taskLocationLabel}: ${task.location}`) : null,
    p(`${i18n.taskCreatedAt}: ${moment(task.createdAt).format(i18n.dateFormat)}`),
    p(`${i18n.taskBy}: `, a({ href: `/author/${encodeURIComponent(task.author)}` }, task.author)),
    p(`${i18n.taskStatus}: ${task.status}`),
    p(`${i18n.taskVisibilityLabel}: ${task.isPublic}`),
    p(`${i18n.taskAssignedTo}: `,
      Array.isArray(task.assignees) && task.assignees.length
        ? task.assignees.map((id, i) => [i > 0 ? ', ' : '', a({ href: `/author/${encodeURIComponent(id)}` }, id)]).flat()
        : i18n.noAssignees
    ),
    task.tags && task.tags.filter(Boolean).length
      ? div(
        task.tags.filter(Boolean).map(tag =>
          a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link', style: 'margin-right:0.8em;margin-bottom:0.5em;' }, `#${tag}`)
        )
      )
      : null,
    div({ class: 'voting-buttons' },
      ['interesting', 'necessary', 'funny', 'disgusting', 'sensible', 'propaganda', 'adultOnly', 'boring', 'confusing', 'inspiring', 'spam'].map(cat =>
        form({ method: 'POST', action: `/tasks/opinions/${encodeURIComponent(task.id)}/${cat}` }, button({ class: 'vote-btn' }, `${i18n['vote' + cat.charAt(0).toUpperCase() + cat.slice(1)]} [${task.opinions?.[cat] || 0}]`))
      )
    )
  );
};

exports.taskView = async (tasks, filter, taskId) => {
  const list = Array.isArray(tasks) ? tasks : [tasks];
  const title =
    filter === 'mine'        ? i18n.taskMineSectionTitle :
    filter === 'create'      ? i18n.taskCreateSectionTitle :
    filter === 'edit'        ? i18n.taskUpdateSectionTitle :
    filter === 'open'        ? i18n.taskOpenTitle :
    filter === 'in-progress' ? i18n.taskInProgressTitle :
    filter === 'closed'      ? i18n.taskClosedTitle :
    filter === 'assigned'    ? i18n.taskAssignedTitle :
    filter === 'priority-urgent' ? i18n.taskFilterUrgent :
    filter === 'priority-high'   ? i18n.taskFilterHigh :
    filter === 'priority-medium' ? i18n.taskFilterMedium :
    filter === 'priority-low'    ? i18n.taskFilterLow :
                                  i18n.taskAllSectionTitle;

  let filtered;
  if (filter === 'mine') filtered = list.filter(t => t.author === userId);
  else if (filter === 'assigned') filtered = list.filter(t => Array.isArray(t.assignees) && t.assignees.includes(userId) && t.isPublic === 'PUBLIC');
  else if (filter === 'open') filtered = list.filter(t => t.status === 'OPEN' && t.isPublic === 'PUBLIC');
  else if (filter === 'in-progress') filtered = list.filter(t => t.status === 'IN-PROGRESS' && t.isPublic === 'PUBLIC');
  else if (filter === 'closed') filtered = list.filter(t => t.status === 'CLOSED' && t.isPublic === 'PUBLIC');
  else if (filter === 'priority-urgent') filtered = list.filter(t => t.priority === 'URGENT' && t.isPublic === 'PUBLIC');
  else if (filter === 'priority-high') filtered = list.filter(t => t.priority === 'HIGH' && t.isPublic === 'PUBLIC');
  else if (filter === 'priority-medium') filtered = list.filter(t => t.priority === 'MEDIUM' && t.isPublic === 'PUBLIC');
  else if (filter === 'priority-low') filtered = list.filter(t => t.priority === 'LOW' && t.isPublic === 'PUBLIC');
  else filtered = list.filter(t => t.isPublic === 'PUBLIC');

  filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const editTask = list.find(t => t.id === taskId) || {};
  const editTags = Array.isArray(editTask.tags) ? editTask.tags : [];

  return template(
    title,
    section(
      div({ class: 'tags-header' },
        h2(i18n.tasksTitle),
        p(i18n.tasksDescription)
      ),
      div({ class: 'filters' },
        form({ method: 'GET', action: '/tasks' },
          button({ type: 'submit', name: 'filter', value: 'all', class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterAll),
          button({ type: 'submit', name: 'filter', value: 'mine', class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterMine),
          button({ type: 'submit', name: 'filter', value: 'assigned', class: filter === 'assigned' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterAssigned),
          button({ type: 'submit', name: 'filter', value: 'open', class: filter === 'open' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterOpen),
          button({ type: 'submit', name: 'filter', value: 'in-progress', class: filter === 'in-progress' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterInProgress),
          button({ type: 'submit', name: 'filter', value: 'closed', class: filter === 'closed' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterClosed),
          button({ type: 'submit', name: 'filter', value: 'priority-low', class: filter === 'priority-low' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterLow),
          button({ type: 'submit', name: 'filter', value: 'priority-medium', class: filter === 'priority-medium' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterMedium),
          button({ type: 'submit', name: 'filter', value: 'priority-high', class: filter === 'priority-high' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterHigh),
          button({ type: 'submit', name: 'filter', value: 'priority-urgent', class: filter === 'priority-urgent' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterUrgent),
          button({ type: 'submit', name: 'filter', value: 'create', class: "create-button" }, i18n.taskCreateButton)
        )
      )
    ),
    section(
      filter === 'edit' || filter === 'create'
        ? div({ class: 'task-form' },
            form({ action: filter === 'edit' ? `/tasks/update/${encodeURIComponent(taskId)}` : '/tasks/create', method: 'POST' },
              label(i18n.taskTitleLabel), br(),
              input({ type: 'text', name: 'title', required: true, value: filter === 'edit' ? editTask.title : '' }), br(), br(),
              label(i18n.taskDescriptionLabel), br(),
              textarea({ name: 'description', required: true, placeholder: i18n.taskDescriptionPlaceholder }, filter === 'edit' ? editTask.description : ''), br(), br(),
              label(i18n.taskStartTimeLabel), br(),
              input({ type: 'datetime-local', name: 'startTime', required: true, min: moment().format('YYYY-MM-DDTHH:mm'), value: filter === 'edit' ? moment(editTask.startTime).format('YYYY-MM-DDTHH:mm') : '' }), br(), br(),
              label(i18n.taskEndTimeLabel), br(),
              input({ type: 'datetime-local', name: 'endTime', required: true, min: moment().format('YYYY-MM-DDTHH:mm'), value: filter === 'edit' ? moment(editTask.endTime).format('YYYY-MM-DDTHH:mm') : '' }), br(), br(),
              label(i18n.taskPriorityLabel), br(),
              select({ name: 'priority', required: true },
                option({ value: 'URGENT', selected: editTask.priority === 'URGENT' }, i18n.taskPriorityUrgent),
                option({ value: 'HIGH', selected: editTask.priority === 'HIGH' }, i18n.taskPriorityHigh),   
                option({ value: 'MEDIUM', selected: editTask.priority === 'MEDIUM' }, i18n.taskPriorityMedium),
                option({ value: 'LOW', selected: editTask.priority === 'LOW' }, i18n.taskPriorityLow)
              ), br(), br(),
              label(i18n.taskLocationLabel), br(),
              input({ type: 'text', name: 'location', value: editTask.location || '' }), br(), br(),
              label(i18n.taskTagsLabel), br(),
              input({ type: 'text', name: 'tags', value: editTags.join(', ') }), br(), br(),
              label(i18n.taskVisibilityLabel), br(),
              select({ name: 'isPublic', id: 'isPublic' },
                option({ value: 'PUBLIC', selected: editTask.isPublic === 'PUBLIC' ? 'selected' : undefined }, i18n.taskPublic),
                option({ value: 'PRIVATE', selected: editTask.isPublic === 'PRIVATE' ? 'selected' : undefined }, i18n.taskPrivate)
              ), br(), br(),  
              button({ type: 'submit' }, filter === 'edit' ? i18n.taskUpdateButton : i18n.taskCreateButton)
            )
          )
        : div({ class: 'task-list' },
            filtered.length > 0
              ? filtered.map(t => {
                  const actions = [];
                  if (filter === 'mine' && t.author === userId) {
                    actions.push(
                      form({ method: 'GET', action: `/tasks/edit/${encodeURIComponent(t.id)}` }, button({ type: 'submit', class: 'update-btn' }, i18n.taskUpdateButton)),
                      form({ method: 'POST', action: `/tasks/delete/${encodeURIComponent(t.id)}` }, button({ type: 'submit', class: 'delete-btn' }, i18n.taskDeleteButton)),
                      form({ method: 'POST', action: `/tasks/status/${encodeURIComponent(t.id)}` },
                        button({ type: 'submit', name: 'status', value: 'OPEN' }, i18n.taskStatusOpen), br(),
                        button({ type: 'submit', name: 'status', value: 'IN-PROGRESS' }, i18n.taskStatusInProgress), br(),
                        button({ type: 'submit', name: 'status', value: 'CLOSED' }, i18n.taskStatusClosed)
                      )
                    );
                  }
                  if (t.status !== 'CLOSED') {
                    actions.push(
                      form({ method: 'POST', action: `/tasks/assign/${encodeURIComponent(t.id)}` }, button({ type: 'submit' }, t.assignees.includes(userId) ? i18n.taskUnassignButton : i18n.taskAssignButton))
                    );
                  }
                  return div({ class: 'task-item' },
                    actions.length > 0 ? div({ class: 'task-actions' }, ...actions) : null,
                    form({ method: 'GET', action: `/tasks/${encodeURIComponent(t.id)}` }, button({ type: 'submit', class: 'filter-btn' }, i18n.viewDetails)),
                    h2(t.title),
                    p(`${i18n.taskDescriptionLabel}: ${t.description}`),
                    p(`${i18n.taskStartTimeLabel}: ${moment(t.startTime).format(i18n.dateFormat)}`),
                    p(`${i18n.taskEndTimeLabel}: ${moment(t.endTime).format(i18n.dateFormat)}`),
                    p(`${i18n.taskPriorityLabel}: ${t.priority}`),
                    t.location?.trim() ? p(`${i18n.taskLocationLabel}: ${t.location}`) : null,
                    p(`${i18n.taskCreatedAt}: ${moment(t.createdAt).format(i18n.dateFormat)}`),
                    p(`${i18n.taskBy}: `, a({ href: `/author/${encodeURIComponent(t.author)}` }, t.author)),
                    p(`${i18n.taskStatus}: ${t.status}`),
                    p(`${i18n.taskVisibilityLabel}: ${t.isPublic}`),
                    p(`${i18n.taskAssignedTo}: `,
                      Array.isArray(t.assignees) && t.assignees.length
                        ? t.assignees.map((id, i) => [i > 0 ? ', ' : '', a({ href: `/author/${encodeURIComponent(id)}` }, id)]).flat()
                        : i18n.noAssignees
                    ),
                    t.tags && t.tags.filter(Boolean).length
                      ? div(
                          t.tags.filter(Boolean).map(tag =>
                            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link', style: 'margin-right:0.8em;margin-bottom:0.5em;' }, `#${tag}`)
                          )
                        )
                      : null,
                    div({ class: 'voting-buttons' },
                      ['interesting','necessary','funny','disgusting','sensible','propaganda','adultOnly','boring','confusing','inspiring','spam'].map(cat =>
                        form({ method: 'POST', action: `/tasks/opinions/${encodeURIComponent(t.id)}/${cat}` }, button({ class: 'vote-btn' }, `${i18n['vote'+cat.charAt(0).toUpperCase()+cat.slice(1)]} [${t.opinions?.[cat]||0}]`))
                      )
                    ),
                  );
                })
              : p(i18n.notasks)
          )
    )
  );
};

exports.singleTaskView = async (task, filter) => {
  return template(
    task.title,
    section(
      div({ class: "filters" },
        form({ method: 'GET', action: '/tasks' },
          button({ type: 'submit', name: 'filter', value: 'all', class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterAll),
          button({ type: 'submit', name: 'filter', value: 'mine', class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterMine),
          button({ type: 'submit', name: 'filter', value: 'assigned', class: filter === 'assigned' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterAssigned),
          button({ type: 'submit', name: 'filter', value: 'open', class: filter === 'open' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterOpen),
          button({ type: 'submit', name: 'filter', value: 'in-progress', class: filter === 'in-progress' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterInProgress),
          button({ type: 'submit', name: 'filter', value: 'closed', class: filter === 'closed' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterClosed),
          button({ type: 'submit', name: 'filter', value: 'priority-low', class: filter === 'priority-low' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterLow),
          button({ type: 'submit', name: 'filter', value: 'priority-medium', class: filter === 'priority-medium' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterMedium),
          button({ type: 'submit', name: 'filter', value: 'priority-high', class: filter === 'priority-high' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterHigh),
          button({ type: 'submit', name: 'filter', value: 'priority-urgent', class: filter === 'priority-urgent' ? 'filter-btn active' : 'filter-btn' }, i18n.taskFilterUrgent),
          button({ type: 'submit', name: 'filter', value: 'create', class: "create-button" }, i18n.taskCreateButton)
        )
      ),
      div({ class: "tags-header" },
        h2(task.title),
        p(task.description),
        p(`${i18n.taskStartTimeLabel}: ${moment(task.startTime).format(i18n.dateFormat)}`),
        p(`${i18n.taskEndTimeLabel}: ${moment(task.endTime).format(i18n.dateFormat)}`),
        p(`${i18n.taskPriorityLabel}: ${task.priority}`),
        task.location?.trim() ? p(`${i18n.taskLocationLabel}: ${task.location}`) : null,
        p(`${i18n.taskCreatedAt}: ${moment(task.createdAt).format(i18n.dateFormat)}`),
        p(`${i18n.taskBy}: `, a({ href: `/author/${encodeURIComponent(task.author)}` }, task.author)),
        p(`${i18n.taskStatus}: ${task.status}`),
        p(`${i18n.taskVisibilityLabel}: ${task.isPublic}`),
        p(`${i18n.taskAssignedTo}: `,
          Array.isArray(task.assignees) && task.assignees.length
            ? task.assignees.map((id, i) => [i > 0 ? ', ' : '', a({ href: `/author/${encodeURIComponent(id)}` }, id)]).flat()
            : i18n.noAssignees
        ),
        task.tags && task.tags.length
          ? div(
              task.tags.map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`))
            )
          : null
      ),
      div({ class: "task-actions" },
        form({ method: "POST", action: `/tasks/attend/${encodeURIComponent(task.id)}` },
          button({ type: "submit" },
            task.assignees.includes(userId)
              ? i18n.taskUnassignButton
              : i18n.taskAssignButton
          )
        )
      )
    )
  );
};

