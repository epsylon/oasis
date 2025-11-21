const { form, button, div, h2, p, section, input, label, br, a, audio: audioHyperaxe, span, textarea } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require("../server/node_modules/moment");
const { config } = require('../server/SSB_server.js');
const { renderUrl } = require('../backend/renderUrl');

const userId = config.keys.id

const getFilteredAudios = (filter, audios, userId) => {
  const now = Date.now();
  let filtered =
    filter === 'mine' ? audios.filter(a => a.author === userId) :
    filter === 'recent' ? audios.filter(a => new Date(a.createdAt).getTime() >= now - 86400000) :
    filter === 'top' ? [...audios].sort((a, b) => {
      const sumA = Object.values(a.opinions || {}).reduce((s, n) => s + (n || 0), 0);
      const sumB = Object.values(b.opinions || {}).reduce((s, n) => s + (n || 0), 0);
      return sumB - sumA;
    }) :
    audios;

  return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const renderAudioCommentsSection = (audioId, comments = []) => {
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
        action: `/audios/${encodeURIComponent(audioId)}/comments`,
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

const renderCardField = (label, value) =>
  div({ class: "card-field" }, 
    span({ class: "card-label" }, label), 
    span({ class: "card-value" }, value)
  );

const renderAudioActions = (filter, audio) => {
  return filter === 'mine' ? div({ class: "audio-actions" },
    form({ method: "GET", action: `/audios/edit/${encodeURIComponent(audio.key)}` },
      button({ class: "update-btn", type: "submit" }, i18n.audioUpdateButton)
    ),
    form({ method: "POST", action: `/audios/delete/${encodeURIComponent(audio.key)}` },
      button({ class: "delete-btn", type: "submit" }, i18n.audioDeleteButton)
    )
  ) : null;
};

const renderAudioList = (filteredAudios, filter) => {
  return filteredAudios.length > 0
    ? filteredAudios.map(audio => {
        const commentCount = typeof audio.commentCount === 'number' ? audio.commentCount : 0;

        return div({ class: "audio-item card" },
          br,
          renderAudioActions(filter, audio),
          form({ method: "GET", action: `/audios/${encodeURIComponent(audio.key)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
          ),
          audio.title?.trim() ? h2(audio.title) : null,
          audio.url
            ? div({ class: "audio-container" },
                audioHyperaxe({
                  controls: true,
                  src: `/blob/${encodeURIComponent(audio.url)}`,
                  type: audio.mimeType,
                  preload: 'metadata'
                })
              )
            : p(i18n.audioNoFile),
          p(...renderUrl(audio.description)),
          audio.tags?.length
            ? div({ class: "card-tags" }, 
                audio.tags.map(tag =>
                  a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
                )
              )
            : null,
          div({ class: 'card-comments-summary' },
            span({ class: 'card-label' }, i18n.voteCommentsLabel + ':'),
            span({ class: 'card-value' }, String(commentCount)),
            br, br,
            form({ method: 'GET', action: `/audios/${encodeURIComponent(audio.key)}` },
              button({ type: 'submit', class: 'filter-btn' }, i18n.voteCommentsForumButton)
            )
          ),
          br,
          p({ class: 'card-footer' },
            span({ class: 'date-link' }, `${moment(audio.createdAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed} `),
            a({ href: `/author/${encodeURIComponent(audio.author)}`, class: 'user-link' }, `${audio.author}`)
          ),
          div({ class: "voting-buttons" },
            ['interesting','necessary','funny','disgusting','sensible',
             'propaganda','adultOnly','boring','confusing','inspiring','spam']
              .map(category =>
                form({ method: "POST", action: `/audios/opinions/${encodeURIComponent(audio.key)}/${category}` },
                  button({ class: "vote-btn" },
                    `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`]} [${audio.opinions?.[category] || 0}]`
                  )
                )
              )
          )
        );
      })
    : div(i18n.noAudios);
};

const renderAudioForm = (filter, audioId, audioToEdit) => {
  return div({ class: "div-center audio-form" },
    form({
      action: filter === 'edit' ? `/audios/update/${encodeURIComponent(audioId)}` : "/audios/create",
      method: "POST", enctype: "multipart/form-data"
    },
      label(i18n.audioFileLabel), br(),
      input({ type: "file", name: "audio", required: filter !== "edit" }), br(), br(),
      label(i18n.audioTagsLabel), br(),
      input({ type: "text", name: "tags", placeholder: i18n.audioTagsPlaceholder, value: audioToEdit?.tags?.join(', ') || '' }), br(), br(),
      label(i18n.audioTitleLabel), br(),
      input({ type: "text", name: "title", placeholder: i18n.audioTitlePlaceholder, value: audioToEdit?.title || '' }), br(), br(),
      label(i18n.audioDescriptionLabel), br(),
      textarea({name: "description", placeholder: i18n.audioDescriptionPlaceholder, rows:"4", value: audioToEdit?.description || '' }), br(), br(),
      button({ type: "submit" }, filter === 'edit' ? i18n.audioUpdateButton : i18n.audioCreateButton)
    )
  );
};

exports.audioView = async (audios, filter, audioId) => {
  const title = filter === 'mine' ? i18n.audioMineSectionTitle :
                filter === 'create' ? i18n.audioCreateSectionTitle :
                filter === 'edit' ? i18n.audioUpdateSectionTitle :
                filter === 'recent' ? i18n.audioRecentSectionTitle :
                filter === 'top' ? i18n.audioTopSectionTitle :
                i18n.audioAllSectionTitle;

  const filteredAudios = getFilteredAudios(filter, audios, userId);

  const audioToEdit = audios.find(a => a.key === audioId);

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(i18n.audioDescription)
      ),
      div({ class: "filters" },
        form({ method: "GET", action: "/audios" },
          ["all", "mine", "recent", "top"].map(f =>
            button({
              type: "submit", name: "filter", value: f,
              class: filter === f ? "filter-btn active" : "filter-btn"
            },
              i18n[`audioFilter${f.charAt(0).toUpperCase() + f.slice(1)}`]
            )
          ),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" },
            i18n.audioCreateButton)
        )
      )
    ),
    section(
      (filter === 'create' || filter === 'edit')
        ? renderAudioForm(filter, audioId, audioToEdit)
        : renderAudioList(filteredAudios, filter)
    )
  );
};

exports.singleAudioView = async (audio, filter, comments = []) => {
  const isAuthor = audio.author === userId; 
  const hasOpinions = Object.keys(audio.opinions || {}).length > 0; 

  return template(
    i18n.audioTitle,
    section(
      div({ class: "filters" },
        form({ method: "GET", action: "/audios" },
          button({ type: "submit", name: "filter", value: "all", class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.audioFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.audioFilterMine),
          button({ type: "submit", name: "filter", value: "recent", class: filter === 'recent' ? 'filter-btn active' : 'filter-btn' }, i18n.audioFilterRecent),
          button({ type: "submit", name: "filter", value: "top", class: filter === 'top' ? 'filter-btn active' : 'filter-btn' }, i18n.audioFilterTop),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.audioCreateButton)
        )
      ),
      div({ class: "tags-header" },
        isAuthor ? div({ class: "audio-actions" },
          !hasOpinions
            ? form({ method: "GET", action: `/audios/edit/${encodeURIComponent(audio.key)}` },
                button({ class: "update-btn", type: "submit" }, i18n.audioUpdateButton)
              )
            : null,
          form({ method: "POST", action: `/audios/delete/${encodeURIComponent(audio.key)}` },
            button({ class: "delete-btn", type: "submit" }, i18n.audioDeleteButton)
          )
        ) : null,
        form({ method: "GET", action: `/audios/${encodeURIComponent(audio.key)}` },
          button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        h2(audio.title),
        audio.url
          ? div({ class: "audio-container" },
              audioHyperaxe({
                controls: true,
                src: `/blob/${encodeURIComponent(audio.url)}`,
                type: audio.mimeType,
                preload: 'metadata'
              })
            )
          : p(i18n.audioNoFile),
        p(...renderUrl(audio.description)),
        audio.tags?.length
          ? div({ class: "card-tags" },
              audio.tags.map(tag =>
                a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
              )
            )
          : null,
        br,
        p({ class: 'card-footer' },
          span({ class: 'date-link' }, `${moment(audio.createdAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed} `),
          a({ href: `/author/${encodeURIComponent(audio.author)}`, class: 'user-link' }, `${audio.author}`)
        )
      ),
      div({ class: "voting-buttons" },
        ['interesting', 'necessary', 'funny', 'disgusting', 'sensible', 'propaganda', 'adultOnly', 'boring', 'confusing', 'inspiring', 'spam'].map(category =>
          form({ method: "POST", action: `/audios/opinions/${encodeURIComponent(audio.key)}/${category}` },
            button({ class: "vote-btn" }, `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`]} [${audio.opinions?.[category] || 0}]`)
          )
        )
      ),
      renderAudioCommentsSection(audio.key, comments)
    )
  );
};
