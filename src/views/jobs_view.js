const { form, button, div, h2, p, section, input, label, textarea, br, a, span, select, option, img } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require("../server/node_modules/moment");
const { config } = require('../server/SSB_server.js');
const { renderUrl } = require('../backend/renderUrl');

const userId = config.keys.id;

const FILTERS = [
  { key: 'ALL',        i18n: 'jobsFilterAll',        title: 'jobsAllTitle' },
  { key: 'MINE',       i18n: 'jobsFilterMine',       title: 'jobsMineTitle' },
  { key: 'REMOTE',     i18n: 'jobsFilterRemote',     title: 'jobsRemoteTitle' },
  { key: 'PRESENCIAL', i18n: 'jobsFilterPresencial', title: 'jobsPresencialTitle' },
  { key: 'FREELANCER', i18n: 'jobsFilterFreelancer', title: 'jobsFreelancerTitle' },
  { key: 'EMPLOYEE',   i18n: 'jobsFilterEmployee',   title: 'jobsEmployeeTitle' },
  { key: 'OPEN',       i18n: 'jobsFilterOpen',       title: 'jobsOpenTitle' },
  { key: 'CLOSED',     i18n: 'jobsFilterClosed',     title: 'jobsClosedTitle' },
  { key: 'RECENT',     i18n: 'jobsFilterRecent',     title: 'jobsRecentTitle' },
  { key: 'CV',         i18n: 'jobsCV',               title: 'jobsCVTitle' },
  { key: 'TOP',        i18n: 'jobsFilterTop',        title: 'jobsTopTitle' }
];

function resolvePhoto(photoField, size = 256) {
  if (typeof photoField === 'string' && photoField.startsWith('/image/')) return photoField;
  if (/^&[A-Za-z0-9+/=]+\.sha256$/.test(photoField)) return `/image/${size}/${encodeURIComponent(photoField)}`;
  return '/assets/images/default-avatar.png';
}

const renderCardField = (labelText, value) =>
  div({ class: 'card-field' },
    span({ class: 'card-label' }, labelText),
    span({ class: 'card-value' }, value)
  );

const renderSubscribers = (subs = []) =>
  div({ class: 'card-field' },
    span({ class: 'card-label' }, i18n.jobSubscribers + ':'),
    span({ class: 'card-value' }, subs && subs.length > 0 ? `${subs.length}` : i18n.noSubscribers.toUpperCase())
  );

const renderJobList = (jobs, filter) =>
  jobs.length > 0
    ? jobs.map(job => {
        const isMineFilter = String(filter).toUpperCase() === 'MINE';
        const isAuthor = job.author === userId;
        const isOpen = String(job.status).toUpperCase() === 'OPEN';

        return div({ class: "job-card" },
          isMineFilter && isAuthor
            ? (
                isOpen
                  ? div({ class: "job-actions" },
                      form({ method: "GET", action: `/jobs/edit/${encodeURIComponent(job.id)}` },
                        button({ class: "update-btn", type: "submit" }, i18n.jobsUpdateButton)
                      ),
                      form({ method: "POST", action: `/jobs/delete/${encodeURIComponent(job.id)}` },
                        button({ class: "delete-btn", type: "submit" }, i18n.jobsDeleteButton)
                      ),
                      form({ method: "POST", action: `/jobs/status/${encodeURIComponent(job.id)}` },
                        button({
                          class: "status-btn", type: "submit",
                          name: "status", value: "CLOSED"
                        }, i18n.jobSetClosed)
                      )
                    )
                  : div({ class: "job-actions" },
                      form({ method: "POST", action: `/jobs/delete/${encodeURIComponent(job.id)}` },
                        button({ class: "delete-btn", type: "submit" }, i18n.jobsDeleteButton)
                      )
                    )
              )
            : null,

          !isMineFilter && !isAuthor && isOpen
            ? (
                Array.isArray(job.subscribers) && job.subscribers.includes(userId)
                  ? form({ method: "POST", action: `/jobs/unsubscribe/${encodeURIComponent(job.id)}` },
                      button({ type: "submit", class: "unsubscribe-btn" }, i18n.jobUnsubscribeButton)
                    )
                  : form({ method: "POST", action: `/jobs/subscribe/${encodeURIComponent(job.id)}` },
                      button({ type: "submit", class: "subscribe-btn" }, i18n.jobSubscribeButton)
                    )
              )
            : null,

          form({ method: "GET", action: `/jobs/${encodeURIComponent(job.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetailsButton)
          ),
          br(),
          h2(job.title),
          job.image
            ? div({ class: 'activity-image-preview' }, img({ src: `/blob/${encodeURIComponent(job.image)}` }))
            : null,
          renderCardField(i18n.jobDescription + ':', ''),
          p(...renderUrl(job.description)),
          renderSubscribers(job.subscribers),
          renderCardField(
            i18n.jobStatus + ':',
            i18n['jobStatus' + (String(job.status || '').toUpperCase())] || (String(job.status || '').toUpperCase())
          ),
          renderCardField(i18n.jobLanguages + ':', (job.languages || '').toUpperCase()),
          renderCardField(
            i18n.jobType + ':',
            i18n['jobType' + (String(job.job_type || '').toUpperCase())] || (String(job.job_type || '').toUpperCase())
          ),
          renderCardField(i18n.jobLocation + ':', (job.location || '').toUpperCase()),
          renderCardField(
            i18n.jobTime + ':',
            i18n['jobTime' + (String(job.job_time || '').toUpperCase())] || (String(job.job_time || '').toUpperCase())
          ),
          renderCardField(i18n.jobVacants + ':', job.vacants),
          renderCardField(i18n.jobRequirements + ':', ''),
          p(...renderUrl(job.requirements)),
          renderCardField(i18n.jobTasks + ':', ''),
          p(...renderUrl(job.tasks)),
          renderCardField(i18n.jobSalary + ':', ''),
          br(),
          div({ class: 'card-label' }, h2(`${job.salary} ECO`)),
          br(),
          div({ class: 'card-comments-summary' },
            span({ class: 'card-label' }, i18n.voteCommentsLabel + ':'),
            span({ class: 'card-value' }, String(job.commentCount || 0)),
            br(), br(),
            form({ method: 'GET', action: `/jobs/${encodeURIComponent(job.id)}` },
              button({ type: 'submit', class: 'filter-btn' }, i18n.voteCommentsForumButton)
            )
          ),
          div({ class: 'card-footer' },
            span({ class: 'date-link' }, `${moment(job.createdAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed} `),
            a({ href: `/author/${encodeURIComponent(job.author)}`, class: 'user-link' }, job.author)
          )
        );
      })
    : p(i18n.noJobsFound);

const renderJobForm = (job = {}, mode = 'create') => {
  const isEdit = mode === 'edit';
  return div({ class: "div-center job-form" },
    form({
        action: isEdit ? `/jobs/update/${encodeURIComponent(job.id)}` : "/jobs/create",
        method: "POST",
        enctype: "multipart/form-data"
      },
      label(i18n.jobType), br(),
      select({ name: "job_type", required: true },
        option({ value: "freelancer", selected: job.job_type === 'freelancer' }, i18n.jobTypeFreelance),
        option({ value: "employee",  selected: job.job_type === 'employee'  }, i18n.jobTypeSalary)
      ), br(), br(),
      label(i18n.jobTitle), br(),
      input({ type: "text", name: "title", required: true, placeholder: i18n.jobTitlePlaceholder, value: job.title || "" }), br(), br(),
      label(i18n.jobImage), br(),
      input({ type: "file", name: "image", accept: "image/*" }), br(),
      job.image ? img({ src: `/blob/${encodeURIComponent(job.image)}`, class: 'existing-image' }) : null,
      br(),
      label(i18n.jobDescription), br(),
      textarea({ name: "description", rows: "6", required: true, placeholder: i18n.jobDescriptionPlaceholder }, job.description || ""), br(), br(),
      label(i18n.jobRequirements), br(),
      textarea({ name: "requirements", rows: "6", placeholder: i18n.jobRequirementsPlaceholder }, job.requirements || ""), br(), br(),
      label(i18n.jobLanguages), br(),
      input({ type: "text", name: "languages", placeholder: i18n.jobLanguagesPlaceholder, value: job.languages || "" }), br(), br(),
      label(i18n.jobTime), br(),
      select({ name: "job_time", required: true },
        option({ value: "partial",  selected: job.job_time === 'partial'  }, i18n.jobTimePartial),
        option({ value: "complete", selected: job.job_time === 'complete' }, i18n.jobTimeComplete)
      ), br(), br(),
      label(i18n.jobTasks), br(),
      textarea({ name: "tasks", rows: "6", placeholder: i18n.jobTasksPlaceholder }, job.tasks || ""), br(), br(),
      label(i18n.jobLocation), br(),
      select({ name: "location", required: true },
        option({ value: "remote",     selected: job.location === 'remote'     }, i18n.jobLocationRemote),
        option({ value: "presencial", selected: job.location === 'presencial' }, i18n.jobLocationPresencial)
      ), br(), br(),
      label(i18n.jobVacants), br(),
      input({ type: "number", name: "vacants", min: "1", placeholder: i18n.jobVacantsPlaceholder, value: job.vacants || 1, required: true }), br(), br(),
      label(i18n.jobSalary), br(),
      input({ type: "number", name: "salary", step: "0.01", placeholder: i18n.jobSalaryPlaceholder, value: job.salary || "" }), br(), br(),
      button({ type: "submit" }, isEdit ? i18n.jobsUpdateButton : i18n.createJobButton)
    )
  );
};

const renderCVList = (inhabitants) =>
  div({ class: "cv-list" },
    inhabitants && inhabitants.length > 0
      ? inhabitants.map(user => {
          const isMe = user.id === userId;
          return div({ class: 'inhabitant-card' },
            img({ class: 'inhabitant-photo', src: resolvePhoto(user.photo) }),
            div({ class: 'inhabitant-details' },
              h2(user.name),
              user.description ? p(...renderUrl(user.description)) : null,
              p(a({ class: 'user-link', href: `/author/${encodeURIComponent(user.id)}` }, user.id)),
              div(
                { class: 'cv-actions', style: 'display:flex; flex-direction:column; gap:8px; margin-top:12px;' },
                form(
                  { method: 'GET', action: `/inhabitant/${encodeURIComponent(user.id)}` },
                  button({ type: 'submit', class: 'btn' }, i18n.inhabitantviewDetails)
                ),
                !isMe
                  ? form(
                      { method: 'GET', action: '/pm' },
                      input({ type: 'hidden', name: 'recipients', value: user.id }),
                      button({ type: 'submit', class: 'btn' }, i18n.pmCreateButton)
                    )
                  : null
              )
            )
          )
        })
      : p({ class: 'no-results' }, i18n.noInhabitantsFound)
  );

const renderJobCommentsSection = (jobId, comments = []) => {
  const commentsCount = Array.isArray(comments) ? comments.length : 0;

  return div({ class: 'vote-comments-section' },
    div({ class: 'comments-count' },
      span({ class: 'card-label' }, i18n.voteCommentsLabel + ': '),
      span({ class: 'card-value' }, String(commentsCount))
    ),
    div({ class: 'comment-form-wrapper' },
      h2({ class: 'comment-form-title' }, i18n.voteNewCommentLabel),
      form({
        method: 'POST',
        action: `/jobs/${encodeURIComponent(jobId)}/comments`,
        class: 'comment-form'
      },
        textarea({
          id: 'comment-text',
          name: 'text',
          required: true,
          rows: 4,
          class: 'comment-textarea',
          placeholder: i18n.voteNewCommentPlaceholder
        }),
        br(),
        button({ type: 'submit', class: 'comment-submit-btn' }, i18n.voteNewCommentButton)
      )
    ),
    comments && comments.length
      ? div({ class: 'comments-list' },
          comments.map(c => {
            const author = c.value && c.value.author ? c.value.author : '';
            const ts = c.value && c.value.timestamp ? c.value.timestamp : c.timestamp;
            const absDate = ts ? moment(ts).format('YYYY/MM/DD HH:mm:ss') : '';
            const relDate = ts ? moment(ts).fromNow() : '';
            const userName = author && author.includes('@') ? author.split('@')[1] : author;
            const rootId = c.value && c.value.content ? (c.value.content.fork || c.value.content.root) : null;

            return div({ class: 'votations-comment-card' },
              span({ class: 'created-at' },
                span(i18n.createdBy),
                author
                  ? a({ href: `/author/${encodeURIComponent(author)}` }, `@${userName}`)
                  : span('(unknown)'),
                absDate ? span(' | ') : '',
                absDate ? span({ class: 'votations-comment-date' }, absDate) : '',
                relDate ? span({ class: 'votations-comment-date' }, ' | ', i18n.sendTime) : '',
                relDate && rootId
                  ? a({
                      href: `/thread/${encodeURIComponent(rootId)}#${encodeURIComponent(c.key)}`
                    }, relDate)
                  : ''
              ),
              p({
                class: 'votations-comment-text',
                innerHTML: (c.value && c.value.content && c.value.content.text) || ''
              })
            );
          })
        )
      : p({ class: 'votations-no-comments' }, i18n.voteNoCommentsYet)
  );
};

exports.jobsView = async (jobsOrCVs, filter = "ALL", cvQuery = {}) => {
  const filterObj = FILTERS.find(f => f.key === filter) || FILTERS[0];
  const sectionTitle = i18n[filterObj.title] || i18n.jobsTitle;

  return template(
    i18n.jobsTitle,
    section(
      div({ class: "tags-header" }, h2(sectionTitle), p(i18n.jobsDescription)),
      div({ class: "filters" },
        form({ method: "GET", action: "/jobs", style: "display:flex;gap:12px;" },
          FILTERS.map(f =>
            button({ type: "submit", name: "filter", value: f.key, class: filter === f.key ? "filter-btn active" : "filter-btn" }, i18n[f.i18n])
          ).concat(button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.jobsCreateJob))
        )
      ),
      filter === 'CV'
        ? section(
            form({ method: "GET", action: "/jobs" },
              input({ type: "hidden", name: "filter", value: "CV" }),
              input({ type: "text", name: "location", placeholder: i18n.filterLocation, value: cvQuery.location || "" }),
              input({ type: "text", name: "language", placeholder: i18n.filterLanguage, value: cvQuery.language || "" }),
              input({ type: "text", name: "skills", placeholder: i18n.filterSkills, value: cvQuery.skills || "" }),
              br(), button({ type: "submit" }, i18n.applyFilters)
            ),
            br(),
            renderCVList(jobsOrCVs)
          )
        : filter === 'CREATE' || filter === 'EDIT'
          ? (() => {
              const jobToEdit = filter === 'EDIT' ? jobsOrCVs[0] : {};
              return renderJobForm(jobToEdit, filter === 'EDIT' ? 'edit' : 'create');
            })()
          : div({ class: "jobs-list" }, renderJobList(jobsOrCVs, filter))
    )
  );
};

exports.singleJobsView = async (job, filter = "ALL", comments = []) => {
  const isAuthor = job.author === userId;
  const isOpen = String(job.status).toUpperCase() === 'OPEN';
  return template(
    i18n.jobsTitle,
    section(
      div({ class: "tags-header" }, h2(i18n.jobsTitle), p(i18n.jobsDescription)),
      div({ class: "filters" },
        form({ method: "GET", action: "/jobs", style: "display:flex;gap:12px;" },
          FILTERS.map(f =>
            button({ type: "submit", name: "filter", value: f.key, class: filter === f.key ? "filter-btn active" : "filter-btn" }, i18n[f.i18n])
          ).concat(button({ type: "submit", name: "filter", value: "CREATE", class: "create-button" }, i18n.jobsCreateJob))
        )
      ),
      div({ class: "job-card" },
        isAuthor
          ? (
              isOpen
                ? div({ class: "job-actions" },
                    form({ method: "GET", action: `/jobs/edit/${encodeURIComponent(job.id)}` },
                      button({ class: "update-btn", type: "submit" }, i18n.jobsUpdateButton)
                    ),
                    form({ method: "POST", action: `/jobs/delete/${encodeURIComponent(job.id)}` },
                      button({ class: "delete-btn", type: "submit" }, i18n.jobsDeleteButton)
                    ),
                    form({ method: "POST", action: `/jobs/status/${encodeURIComponent(job.id)}` },
                      button({ class: "status-btn", type: "submit", name: "status", value: "CLOSED" }, i18n.jobSetClosed)
                    )
                  )
                : div({ class: "job-actions" },
                    form({ method: "POST", action: `/jobs/delete/${encodeURIComponent(job.id)}` },
                      button({ class: "delete-btn", type: "submit" }, i18n.jobsDeleteButton)
                    )
                  )
            )
          : null,
        h2(job.title),
        job.image ? div({ class: 'activity-image-preview' }, img({ src: `/blob/${encodeURIComponent(job.image)}` })) : null,
        renderCardField(i18n.jobDescription + ':', ''), p(...renderUrl(job.description)),
        renderSubscribers(job.subscribers),
        renderCardField(i18n.jobStatus + ':', i18n['jobStatus' + (String(job.status || '').toUpperCase())] || (String(job.status || '').toUpperCase())),
        renderCardField(i18n.jobLanguages + ':', (job.languages || '').toUpperCase()),
        renderCardField(i18n.jobType + ':', i18n['jobType' + (String(job.job_type || '').toUpperCase())] || (String(job.job_type || '').toUpperCase())),
        renderCardField(i18n.jobLocation + ':', (job.location || '').toUpperCase()),
        renderCardField(i18n.jobTime + ':', i18n['jobTime' + (String(job.job_time || '').toUpperCase())] || (String(job.job_time || '').toUpperCase())),
        renderCardField(i18n.jobVacants + ':', job.vacants),
        renderCardField(i18n.jobRequirements + ':', ''), p(...renderUrl(job.requirements)),
        renderCardField(i18n.jobTasks + ':', ''), p(...renderUrl(job.tasks)),
        renderCardField(i18n.jobSalary + ':', ''), br(),
        div({ class: 'card-label' }, h2(`${job.salary} ECO`)), br(),
        (isOpen && !isAuthor)
          ? (
              Array.isArray(job.subscribers) && job.subscribers.includes(userId)
                ? div({ class: "subscribe-actions" },
                    form({ method: "POST", action: `/jobs/unsubscribe/${encodeURIComponent(job.id)}` },
                      button({ class: "filter-btn", type: "submit" }, i18n.jobUnsubscribeButton.toUpperCase())
                    )
                  )
                : div({ class: "subscribe-actions" },
                    form({ method: "POST", action: `/jobs/subscribe/${encodeURIComponent(job.id)}` },
                      button({ class: "filter-btn", type: "submit" }, i18n.jobSubscribeButton.toUpperCase())
                    )
                  )
            )
          : null,
        div({ class: 'card-footer' },
          span({ class: 'date-link' }, `${moment(job.createdAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed} `),
          a({ href: `/author/${encodeURIComponent(job.author)}`, class: 'user-link' }, job.author)
        )
      ),
      renderJobCommentsSection(job.id, comments)
    )
  );
};
