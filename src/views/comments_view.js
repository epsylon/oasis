const { div, p, h2, span, a, form, input, textarea, button, label, br, details, summary } = require("../server/node_modules/hyperaxe");
const moment = require("../server/node_modules/moment");
const { i18n, userLink } = require("./main_views");
const { renderUrl } = require("../backend/renderUrl");

const COMMENT_ICON = "✑";

const visibleComments = (comments) => (Array.isArray(comments) ? comments : []).filter(c => {
  const t = c && c.value && c.value.content && c.value.content.text;
  return t && String(t).trim();
});

const renderCommentCard = (c) => {
  const author = (c && c.value && c.value.author) || "";
  const ts = (c && c.value && c.value.timestamp) || (c && c.timestamp);
  const absDate = ts ? moment(ts).format("YYYY/MM/DD HH:mm") : "";
  const relDate = ts ? moment(ts).fromNow() : "";
  const content = (c && c.value && c.value.content) || {};
  const rootId = content.fork || content.root || null;
  const text = content.text || "";

  return div({ class: "votations-comment-card", id: c && c.key ? c.key : undefined },
    span({ class: "created-at" },
      span(i18n.createdBy),
      author ? userLink(author) : span("(unknown)"),
      absDate ? span(" | ") : "",
      absDate ? span({ class: "votations-comment-date" }, absDate) : "",
      relDate ? span({ class: "votations-comment-date" }, " | ", i18n.sendTime) : "",
      relDate && rootId ? a({ href: `/thread/${encodeURIComponent(rootId)}#${encodeURIComponent(c.key)}` }, relDate) : ""
    ),
    p({ class: "votations-comment-text" }, ...renderUrl(String(text)))
  );
};

const renderCommentsSection = ({ action, comments = [], returnTo = null, closedNote = null, extraClass = "" } = {}) => {
  const list = visibleComments(comments);
  return details({ class: "comments-collapse" + (extraClass ? ` ${extraClass}` : "") },
    summary({ class: list.length > 0 ? "comments-summary engage-on" : "comments-summary" },
      span({ class: "comments-summary-icon" }, COMMENT_ICON),
      span({ class: "comments-summary-count" }, `(${list.length})`)
    ),
    div({ class: "vote-comments-section" },
      closedNote
        ? p({ class: "muted" }, closedNote)
        : div({ class: "comment-form-wrapper" },
            h2({ class: "comment-form-title" }, i18n.voteNewCommentLabel),
            form({ method: "POST", action, class: "comment-form", enctype: "multipart/form-data" },
              returnTo ? input({ type: "hidden", name: "returnTo", value: returnTo }) : null,
              textarea({ name: "text", rows: 4, class: "comment-textarea", placeholder: i18n.voteNewCommentPlaceholder }),
              div({ class: "comment-file-upload" }, label(i18n.uploadMedia), input({ type: "file", name: "blob" })),
              br(),
              button({ type: "submit", class: "comment-submit-btn" }, i18n.voteNewCommentButton)
            )
          ),
      list.length
        ? div({ class: "comments-list" }, ...list.map(renderCommentCard))
        : p({ class: "votations-no-comments" }, i18n.voteNoCommentsYet)
    )
  );
};

const renderCommentsLink = ({ href, count = 0 } = {}) => {
  if (!href) return null;
  const total = Number(count) || 0;
  return a({ href, class: total > 0 ? "comments-summary engage-on comments-link" : "comments-summary comments-link" },
    span({ class: "comments-summary-icon" }, COMMENT_ICON),
    span({ class: "comments-summary-count" }, `(${total})`)
  );
};

module.exports = {
  COMMENT_ICON,
  renderCommentsLink,
  visibleComments,
  renderCommentCard,
  renderCommentsSection
};
