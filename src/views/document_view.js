const { form, button, div, h2, p, section, input, label, br, a, span, textarea } = require("../server/node_modules/hyperaxe");
const moment = require("../server/node_modules/moment");
const { template, i18n } = require('./main_views');
const { config } = require('../server/SSB_server.js');
const { renderUrl } = require('../backend/renderUrl');

const userId = config.keys.id;

const getFilteredDocuments = (filter, documents, userId) => {
  const now = Date.now();
  let filtered =
    filter === 'mine' ? documents.filter(d => d.author === userId) :
    filter === 'recent' ? documents.filter(d => new Date(d.createdAt).getTime() >= now - 86400000) :
    filter === 'top' ? [...documents].sort((a, b) => {
      const sumA = Object.values(a.opinions || {}).reduce((s, n) => s + (n || 0), 0);
      const sumB = Object.values(b.opinions || {}).reduce((s, n) => s + (n || 0), 0);
      return sumB - sumA;
    }) :
    documents;
  if (filter !== 'top') {
    filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  return filtered;
};

const renderDocumentCommentsSection = (documentId, comments = []) => {
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
        action: `/documents/${encodeURIComponent(documentId)}/comments`,
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

            return div({ class: 'votations-comment-card' },
              span({ class: 'created-at' },
                span(i18n.createdBy),
                author
                  ? a(
                      { href: `/author/${encodeURIComponent(author)}` },
                      `@${userName}`
                    )
                  : span('(unknown)'),
                absDate ? span(' | ') : '',
                absDate ? span({ class: 'votations-comment-date' }, absDate) : '',
                relDate ? span({ class: 'votations-comment-date' }, ' | ', i18n.sendTime) : '',
                relDate
                  ? a(
                      {
                        href: `/thread/${encodeURIComponent(c.value.content.fork || c.value.content.root)}#${encodeURIComponent(c.key)}`
                      },
                      relDate
                    )
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

const renderDocumentActions = (filter, doc) => {
  return filter === 'mine' ? div({ class: "document-actions" },
    form({ method: "GET", action: `/documents/edit/${encodeURIComponent(doc.key)}` },
      button({ class: "update-btn", type: "submit" }, i18n.documentUpdateButton)
    ),
    form({ method: "POST", action: `/documents/delete/${encodeURIComponent(doc.key)}` },
      button({ class: "delete-btn", type: "submit" }, i18n.documentDeleteButton)
    )
  ) : null;
};

const renderDocumentList = (filteredDocs, filter) => {
  const seen = new Set();
  const unique = [];
  for (const doc of filteredDocs) {
    if (seen.has(doc.title)) continue;
    seen.add(doc.title);
    unique.push(doc);
  }

  return unique.length > 0
    ? unique.map(doc => {
        const commentCount = typeof doc.commentCount === 'number' ? doc.commentCount : 0;

        return div({ class: "tags-header" },
          renderDocumentActions(filter, doc),
          form({ method: "GET", action: `/documents/${encodeURIComponent(doc.key)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
          ),
          doc.title?.trim() ? h2(doc.title) : null,
          div({
            id: `pdf-container-${doc.key}`,
            class: 'pdf-viewer-container',
            'data-pdf-url': `/blob/${encodeURIComponent(doc.url)}`
          }),
          doc.description?.trim() ? p(...renderUrl(doc.description)) : null,
          doc.tags.length
            ? div({ class: "card-tags" }, doc.tags.map(tag =>
                a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
              ))
            : null,
          div({ class: 'card-comments-summary' },
            span({ class: 'card-label' }, i18n.voteCommentsLabel + ':'),
            span({ class: 'card-value' }, String(commentCount)),
            br(),
            br(),
            form({ method: 'GET', action: `/documents/${encodeURIComponent(doc.key)}` },
              button({ type: 'submit', class: 'filter-btn' }, i18n.voteCommentsForumButton)
            )
          ),
          br(),
          p({ class: 'card-footer' },
            span({ class: 'date-link' }, `${moment(doc.createdAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed} `),
            a({ href: `/author/${encodeURIComponent(doc.author)}`, class: 'user-link' }, doc.author)
          ),
          div({ class: "voting-buttons" },
            ['interesting','necessary','funny','disgusting','sensible','propaganda','adultOnly','boring','confusing','inspiring','spam']
              .map(category =>
                form({ method: "POST", action: `/documents/opinions/${encodeURIComponent(doc.key)}/${category}` },
                  button({ class: "vote-btn" },
                    `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`]} [${doc.opinions?.[category] || 0}]`
                  )
                )
              )
          )
        );
      })
    : div(i18n.noDocuments);
};

const renderDocumentForm = (filter, documentId, docToEdit) => {
  return div({ class: "div-center document-form" },
    form({
      action: filter === 'edit' ? `/documents/update/${encodeURIComponent(documentId)}` : "/documents/create",
      method: "POST", enctype: "multipart/form-data"
    },
      label(i18n.documentFileLabel), br(),
      input({ type: "file", name: "document", accept: "application/pdf", required: filter !== "edit" }), br(), br(),
      label(i18n.documentTagsLabel), br(),
      input({ type: "text", name: "tags", placeholder: i18n.documentTagsPlaceholder, value: docToEdit?.tags?.join(', ') || '' }), br(), br(),
      label(i18n.documentTitleLabel), br(),
      input({ type: "text", name: "title", placeholder: i18n.documentTitlePlaceholder, value: docToEdit?.title || '' }), br(), br(),
      label(i18n.documentDescriptionLabel), br(),
      textarea({name: "description", placeholder: i18n.documentDescriptionPlaceholder, rows:"4", value: docToEdit?.description || '' }), br(), br(),
      button({ type: "submit" }, filter === 'edit' ? i18n.documentUpdateButton : i18n.documentCreateButton)
    )
  );
};

exports.documentView = async (documents, filter, documentId) => {
  const title = filter === 'mine' ? i18n.documentMineSectionTitle :
                filter === 'create' ? i18n.documentCreateSectionTitle :
                filter === 'edit' ? i18n.documentUpdateSectionTitle :
                filter === 'recent' ? i18n.documentRecentSectionTitle :
                filter === 'top' ? i18n.documentTopSectionTitle :
                i18n.documentAllSectionTitle;

  const filteredDocs = getFilteredDocuments(filter, documents, userId);

  const docToEdit = documents.find(d => d.key === documentId);
  const isDocView = ['mine', 'create', 'edit', 'all', 'recent', 'top'].includes(filter);

  const tpl = template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(i18n.documentDescription)
      ),
      div({ class: "filters" },
        form({ method: "GET", action: "/documents" },
          button({ type: "submit", name: "filter", value: "all", class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.documentFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.documentFilterMine),
          button({ type: "submit", name: "filter", value: "recent", class: filter === 'recent' ? 'filter-btn active' : 'filter-btn' }, i18n.documentFilterRecent),
          button({ type: "submit", name: "filter", value: "top", class: filter === 'top' ? 'filter-btn active' : 'filter-btn' }, i18n.documentFilterTop),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.documentCreateButton)
        )
      )
    ),
    section(
      (filter === 'create' || filter === 'edit')
        ? renderDocumentForm(filter, documentId, docToEdit)
        : renderDocumentList(filteredDocs, filter)
    )
  );

  return `${tpl}
    ${isDocView
      ? `<script type="module" src="/js/pdf.min.mjs"></script>
         <script src="/js/pdf-viewer.js"></script>`
      : ''}`;
};

exports.singleDocumentView = async (doc, filter, comments = []) => {
  const isAuthor = doc.author === userId;
  const hasOpinions = Object.keys(doc.opinions || {}).length > 0;

  const tpl = template(
    i18n.documentTitle,
    section(
      div({ class: "filters" },
        form({ method: "GET", action: "/documents" },
          button({ type: "submit", name: "filter", value: "all", class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.documentFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.documentFilterMine),
          button({ type: "submit", name: "filter", value: "recent", class: filter === 'recent' ? 'filter-btn active' : 'filter-btn' }, i18n.documentFilterRecent),
          button({ type: "submit", name: "filter", value: "top", class: filter === 'top' ? 'filter-btn active' : 'filter-btn' }, i18n.documentFilterTop),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.documentCreateButton)
        )
      ),
      div({ class: "tags-header" },
        isAuthor ? div({ class: "document-actions" },
          !hasOpinions
            ? form({ method: "GET", action: `/documents/edit/${encodeURIComponent(doc.key)}` },
                button({ class: "update-btn", type: "submit" }, i18n.documentUpdateButton)
              )
            : null,
          form({ method: "POST", action: `/documents/delete/${encodeURIComponent(doc.key)}` },
            button({ class: "delete-btn", type: "submit" }, i18n.documentDeleteButton)
          )
        ) : null,
        h2(doc.title),
        div({
          id: `pdf-container-${doc.key}`,
          class: 'pdf-viewer-container',
          'data-pdf-url': `/blob/${encodeURIComponent(doc.url)}`
        }),
        p(...renderUrl(doc.description)),
        doc.tags.length
          ? div({ class: "card-tags" }, doc.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
            ))
          : null,
        br(),
        p({ class: 'card-footer' },
          span({ class: 'date-link' }, `${moment(doc.createdAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed} `),
          a({ href: `/author/${encodeURIComponent(doc.author)}`, class: 'user-link' }, `${doc.author}`)
        )
      ),
      div({ class: "voting-buttons" },
        ['interesting', 'necessary', 'funny', 'disgusting', 'sensible', 'propaganda', 'adultOnly', 'boring', 'confusing', 'inspiring', 'spam'].map(category =>
          form({ method: "POST", action: `/documents/opinions/${encodeURIComponent(doc.key)}/${category}` },
            button({ class: "vote-btn" }, `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`]} [${doc.opinions?.[category] || 0}]`)
          )
        )
      ),
      renderDocumentCommentsSection(doc.key, comments)
    )
  );

  return `${tpl}
    ${filter === 'mine' || filter === 'edit' || filter === 'top' || filter === 'recent' || filter === 'all'
      ? `<script type="module" src="/js/pdf.min.mjs"></script>
         <script src="/js/pdf-viewer.js"></script>`
      : ''}`;
};
