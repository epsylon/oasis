const { form, button, div, h2, p, section, input, label, br, a, video: videoHyperaxe, span, textarea } = require("../server/node_modules/hyperaxe");
const moment = require("../server/node_modules/moment");
const { template, i18n } = require('./main_views');
const { config } = require('../server/SSB_server.js');
const { renderUrl } = require('../backend/renderUrl');
const opinionCategories = require('../backend/opinion_categories');

const userId = config.keys.id;

const getFilteredVideos = (filter, videos, userId) => {
  const now = Date.now();
  let filtered =
    filter === 'mine' ? videos.filter(v => v.author === userId) :
    filter === 'recent' ? videos.filter(v => new Date(v.createdAt).getTime() >= now - 86400000) :
    filter === 'top' ? [...videos].sort((a, b) => {
      const sumA = Object.values(a.opinions || {}).reduce((s, n) => s + (n || 0), 0);
      const sumB = Object.values(b.opinions || {}).reduce((s, n) => s + (n || 0), 0);
      return sumB - sumA;
    }) :
    videos;

  return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const renderVideoCommentsSection = (videoId, comments = []) => {
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
        action: `/videos/${encodeURIComponent(videoId)}/comments`,
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

const renderVideoActions = (filter, video) => {
  return filter === 'mine' ? div({ class: "video-actions" },
    form({ method: "GET", action: `/videos/edit/${encodeURIComponent(video.key)}` },
      button({ class: "update-btn", type: "submit" }, i18n.videoUpdateButton)
    ),
    form({ method: "POST", action: `/videos/delete/${encodeURIComponent(video.key)}` },
      button({ class: "delete-btn", type: "submit" }, i18n.videoDeleteButton)
    )
  ) : null;
};

const renderVideoList = (filteredVideos, filter) => {
  return filteredVideos.length > 0
    ? filteredVideos.map(video => {
        const commentCount = typeof video.commentCount === 'number' ? video.commentCount : 0;

        return div({ class: "tags-header" },
          renderVideoActions(filter, video),
          form({ method: "GET", action: `/videos/${encodeURIComponent(video.key)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
          ),
          video.title?.trim() ? h2(video.title) : null,
          video.url
            ? div({ class: "video-container" },
                videoHyperaxe({
                  controls: true,
                  src: `/blob/${encodeURIComponent(video.url)}`,
                  type: video.mimeType,
                  preload: 'metadata',
                  width: '640',
                  height: '360'
                })
              )
            : p(i18n.videoNoFile),
          video.description?.trim() ? p(...renderUrl(video.description)) : null,
          video.tags?.length
            ? div({ class: "card-tags" },
                video.tags.map(tag =>
                  a(
                    {
                      href: `/search?query=%23${encodeURIComponent(tag)}`,
                      class: "tag-link"
                    },
                    `#${tag}`
                  )
                )
              )
            : null,
          div({ class: 'card-comments-summary' },
            span({ class: 'card-label' }, i18n.voteCommentsLabel + ':'),
            span({ class: 'card-value' }, String(commentCount)),
            br, br,
            form({ method: 'GET', action: `/videos/${encodeURIComponent(video.key)}` },
              button({ type: 'submit', class: 'filter-btn' }, i18n.voteCommentsForumButton)
            )
          ),
          br,
          p({ class: 'card-footer' },
            span({ class: 'date-link' }, `${moment(video.createdAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed} `),
            a({ href: `/author/${encodeURIComponent(video.author)}`, class: 'user-link' }, `${video.author}`)
          ),
          div({ class: "voting-buttons" },
            opinionCategories.map(category =>
              form({ method: "POST", action: `/videos/opinions/${encodeURIComponent(video.key)}/${category}` },
                button(
                  { class: "vote-btn" },
                  `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${video.opinions?.[category] || 0}]`
                )
              )
            )
          )
        );
      })
    : div(i18n.noVideos);
};

const renderVideoForm = (filter, videoId, videoToEdit) => {
  return div({ class: "div-center video-form" },
    form({
      action: filter === 'edit' ? `/videos/update/${encodeURIComponent(videoId)}` : "/videos/create",
      method: "POST", enctype: "multipart/form-data"
    },
      label(i18n.videoFileLabel), br(),
      input({ type: "file", name: "video", required: filter !== "edit" }), br(), br(),
      label(i18n.videoTagsLabel), br(),
      input({ type: "text", name: "tags", placeholder: i18n.videoTagsPlaceholder, value: videoToEdit?.tags?.join(', ') || '' }), br(), br(),
      label(i18n.videoTitleLabel), br(),
      input({ type: "text", name: "title", placeholder: i18n.videoTitlePlaceholder, value: videoToEdit?.title || '' }), br(), br(),
      label(i18n.videoDescriptionLabel), br(),
      textarea({ name: "description", placeholder: i18n.videoDescriptionPlaceholder, rows: "4", value: videoToEdit?.description || '' }), br(), br(),
      button({ type: "submit" }, filter === 'edit' ? i18n.videoUpdateButton : i18n.videoCreateButton)
    )
  );
};

exports.videoView = async (videos, filter, videoId) => {
  const title = filter === 'mine' ? i18n.videoMineSectionTitle :
                filter === 'create' ? i18n.videoCreateSectionTitle :
                filter === 'edit' ? i18n.videoUpdateSectionTitle :
                filter === 'recent' ? i18n.videoRecentSectionTitle :
                filter === 'top' ? i18n.videoTopSectionTitle :
                i18n.videoAllSectionTitle;

  const filteredVideos = getFilteredVideos(filter, videos, userId);
  const videoToEdit = videos.find(v => v.key === videoId);

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(i18n.videoDescription)
      ),
      div({ class: "filters" },
        form({ method: "GET", action: "/videos" },
          ["all", "mine", "recent", "top"].map(f =>
            button({
              type: "submit", name: "filter", value: f,
              class: filter === f ? "filter-btn active" : "filter-btn"
            },
              i18n[`videoFilter${f.charAt(0).toUpperCase() + f.slice(1)}`]
            )
          ),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" },
            i18n.videoCreateButton)
        )
      )
    ),
    section(
      (filter === 'create' || filter === 'edit')
        ? renderVideoForm(filter, videoId, videoToEdit)
        : renderVideoList(filteredVideos, filter)
    )
  );
};

exports.singleVideoView = async (video, filter, comments = []) => {
  const isAuthor = video.author === userId;
  const hasOpinions = Object.keys(video.opinions || {}).length > 0;

  return template(
    i18n.videoTitle,
    section(
      div({ class: "filters" },
        form({ method: "GET", action: "/videos" },
          button({ type: "submit", name: "filter", value: "all", class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.videoFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.videoFilterMine),
          button({ type: "submit", name: "filter", value: "recent", class: filter === 'recent' ? 'filter-btn active' : 'filter-btn' }, i18n.videoFilterRecent),
          button({ type: "submit", name: "filter", value: "top", class: filter === 'top' ? 'filter-btn active' : 'filter-btn' }, i18n.videoFilterTop),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.videoCreateButton)
        )
      ),
      div({ class: "tags-header" },
        isAuthor ? div({ class: "video-actions" },
          !hasOpinions
            ? form({ method: "GET", action: `/videos/edit/${encodeURIComponent(video.key)}` },
                button({ class: "update-btn", type: "submit" }, i18n.videoUpdateButton)
              )
            : null,
          form({ method: "POST", action: `/videos/delete/${encodeURIComponent(video.key)}` },
            button({ class: "delete-btn", type: "submit" }, i18n.videoDeleteButton)
          )
        ) : null,
        h2(video.title),
        video.url
          ? div({ class: "video-container" },
              videoHyperaxe({
                controls: true,
                src: `/blob/${encodeURIComponent(video.url)}`,
                type: video.mimeType,
                preload: 'metadata',
                width: '640',
                height: '360'
              })
            )
          : p(i18n.videoNoFile),
        p(...renderUrl(video.description)),
        video.tags?.length
          ? div({ class: "card-tags" },
              video.tags.map(tag =>
                a(
                  {
                    href: `/search?query=%23${encodeURIComponent(tag)}`,
                    class: "tag-link"
                  },
                  `#${tag}`
                )
              )
            )
          : null,
        br,
        p({ class: 'card-footer' },
          span({ class: 'date-link' }, `${moment(video.createdAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed} `),
          a({ href: `/author/${encodeURIComponent(video.author)}`, class: 'user-link' }, `${video.author}`)
        )
      ),
      div({ class: "voting-buttons" },
        opinionCategories.map(category =>
          form({ method: "POST", action: `/videos/opinions/${encodeURIComponent(video.key)}/${category}` },
            button(
              { class: "vote-btn" },
              `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`] || category} [${video.opinions?.[category] || 0}]`
            )
          )
        )
      ),
      renderVideoCommentsSection(video.key, comments)
    )
  );
};

