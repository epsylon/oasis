const { div, h2, h3, p, section, button, form, a, span, strong, input, label, img, textarea, br, hr, video: videoHyperaxe, audio: audioHyperaxe } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("./main_views");
const { sanitizeHtml } = require('../backend/sanitizeHtml');
const moment = require("../server/node_modules/moment");

const fmtDate = (ts) => {
  if (!ts) return "";
  const m = moment(ts);
  return m.isValid() ? m.format("YYYY-MM-DD HH:mm") : "";
};

const renderMedia = (m) => {
  if (!m || !m.url) return "";
  if (m.type === 'video' || m.type === 'gifv') {
    return videoHyperaxe({ class: "post-video", src: m.url, controls: true, preload: "metadata" });
  }
  if (m.type === 'audio') {
    return audioHyperaxe({ class: "post-audio", src: m.url, controls: true });
  }
  return img({ class: "post-image", src: m.url, alt: m.description || "" });
};

const renderComposeForm = (opts = {}) => {
  const { action, placeholder, replyToId, submitLabel } = opts;
  return div({ class: "publish-form" },
    form(
      { method: "POST", action, enctype: "multipart/form-data" },
      replyToId ? input({ type: "hidden", name: "inReplyToId", value: replyToId }) : "",
      textarea({ name: "text", id: "text", rows: "6", class: "publish-textarea", placeholder: placeholder || i18n.fediverseComposePlaceholder }),
      br(),
      label({ for: "fediverse_media" }, i18n.fediverseAttach),
      br(),
      input({ type: "file", id: "fediverse_media", name: "media", accept: "image/*,video/*", multiple: true }),
      br(), br(),
      button({ type: "submit", class: "filter-btn" }, submitLabel || i18n.fediversePublish)
    )
  );
};

const renderActions = (post, returnTo) => {
  const id = encodeURIComponent(post.id);
  const rt = input({ type: "hidden", name: "returnTo", value: returnTo });
  const favAction = post.favourited ? `/fediverse/mastodon/unfav/${id}` : `/fediverse/mastodon/fav/${id}`;
  const favLabel = post.favourited ? `★ ${post.counts.favourites}` : `☆ ${post.counts.favourites}`;
  const boostAction = post.reblogged ? `/fediverse/mastodon/unboost/${id}` : `/fediverse/mastodon/boost/${id}`;
  const boostLabel = `🔁 ${post.counts.reblogs}`;
  return div(
    { class: "fediverse-actions" },
    form({ method: "POST", action: favAction }, rt, button({ type: "submit", class: post.favourited ? "filter-btn active" : "filter-btn" }, favLabel)),
    form({ method: "POST", action: boostAction }, rt, button({ type: "submit", class: post.reblogged ? "filter-btn active" : "filter-btn" }, boostLabel)),
    form({ method: "GET", action: `/fediverse/mastodon/thread/${id}` }, button({ type: "submit", class: "filter-btn" }, `${i18n.fediverseReply} · ${post.counts.replies}`))
  );
};

const renderPost = (post, returnTo, opts = {}) => {
  const acc = post.account || {};
  return div(
    { class: "feed-card fediverse-card" },
    post.boostedBy ? div({ class: "fediverse-boosted" }, `🔁 ${post.boostedBy} ${i18n.fediverseBoosted}`) : "",
    div(
      { class: "fediverse-head" },
      acc.avatar ? img({ class: "fediverse-avatar", src: acc.avatar, alt: acc.displayName }) : "",
      div(
        { class: "fediverse-author" },
        span({ class: "fediverse-name" }, acc.displayName || acc.acct),
        span({ class: "fediverse-acct" }, acc.acct ? `@${acc.acct}` : "")
      ),
      span({ class: "fediverse-date" }, fmtDate(post.createdAt))
    ),
    div({ class: "feed-text", innerHTML: sanitizeHtml(post.html) }),
    post.media && post.media.length ? div({ class: "fediverse-media" }, post.media.map(renderMedia)) : "",
    opts.noActions ? "" : renderActions(post, returnTo)
  );
};

const mastodonBox = (account, stats, actions, showLabel) => {
  const host = String(account.instance || "").replace(/^https?:\/\//, "");
  const handle = `${account.acct}@${host}`;
  const profileUrl = `${account.instance}/@${account.acct}`;
  const joined = stats && stats.createdAt && moment(stats.createdAt).isValid() ? moment(stats.createdAt).format("DD MMM YYYY") : "";
  const stat = (lbl, val) => div({ class: "fediverse-stat" }, span({ class: "fediverse-stat-label" }, lbl), strong(String(val)));
  return div({ class: "fediverse-network" },
    showLabel ? h3("Mastodon") : "",
    div({ class: "fediverse-profile" },
      div({ class: "fediverse-namerow" },
        account.avatar ? img({ class: "fediverse-avatar", src: account.avatar, alt: account.displayName }) : "",
        div({ class: "fediverse-profile-id" },
          div({ class: "fediverse-name" }, account.displayName || account.acct),
          a({ class: "fediverse-acct", href: profileUrl, target: "_blank", rel: "noopener noreferrer" }, handle)
        ),
        actions && actions.length ? div({ class: "fediverse-compact-actions" }, actions) : ""
      ),
      (stats && stats.bio) ? div({ class: "fediverse-bio", innerHTML: sanitizeHtml(stats.bio) }) : "",
      stats
        ? div({ class: "fediverse-stats" },
            stat(i18n.fediverseFollowers, stats.followers),
            stat(i18n.fediverseFollowing, stats.following),
            stat(i18n.fediversePosts, stats.posts),
            joined ? stat(i18n.fediverseJoined, joined) : ""
          )
        : "",
      (stats && Array.isArray(stats.fields) && stats.fields.length)
        ? div({ class: "fediverse-fields" }, stats.fields.map(f => div({ class: "fediverse-field" },
            span({ class: "fediverse-field-name" }, f.name, f.verified ? span({ class: "fediverse-field-verified", title: "verified" }, " ✓") : ""),
            span({ class: "fediverse-field-value", innerHTML: sanitizeHtml(f.value) })
          )))
        : ""
    )
  );
};

const disconnectedBlock = () => {
  const text = String(i18n.fediverseDisconnected || "");
  const settingsLink = a({ href: "/settings#fediverse" }, i18n.fediverseEmptyLink || "settings");
  const parts = text.split("%LINK%");
  const para = parts.length > 1
    ? p(parts[0], settingsLink, parts.slice(1).join("%LINK%"))
    : p(text, " ", settingsLink);
  return div({ class: "fediverse-disconnected" }, h2(i18n.fediverseStatus), para);
};

exports.fediverseOverviewView = ({ account, stats } = {}) => {
  const box = account
    ? mastodonBox(account, stats, [
        form({ method: "GET", action: "/fediverse/mastodon" }, button({ type: "submit", class: "filter-btn" }, i18n.fediverseManage))
      ], true)
    : null;

  return template(i18n.fediverse, section(
    div({ class: "tags-header" }, h2(i18n.fediverse), p(i18n.fediverseDescription)),
    account ? box : disconnectedBlock()
  ));
};

exports.fediverseView = ({ account, posts, error, stats } = {}) => {
  if (!account) return exports.fediverseOverviewView({ account: null });

  const body = [];
  body.push(div({ class: "tags-header" }, h2(i18n.fediverse), p(i18n.fediverseDescription)));
  body.push(mastodonBox(account, stats, [
    a({ href: "/fediverse", class: "filter-btn" }, `← ${i18n.fediverse}`),
    a({ href: "/fediverse/mastodon?refresh=1", class: "filter-btn" }, i18n.fediverseRefresh),
    a({ href: "/fediverse/mastodon/preview", class: "filter-btn" }, i18n.fediverseWrite)
  ], false));
  if (error) body.push(div({ class: "fediverse-error" }, i18n[error] || i18n.fediverseError));

  const list = Array.isArray(posts) ? posts : [];
  if (!list.length && !error) {
    body.push(p({ class: "muted" }, i18n.fediverseNoPosts));
  } else {
    body.push(section({ class: "feed-container" }, list.map(pst => renderPost(pst, "/fediverse/mastodon"))));
  }

  return template(i18n.fediverse, section(...body));
};

exports.fediverseThreadView = ({ account, stats, thread, error } = {}) => {
  const header = section(
    div({ class: "tags-header" }, h2(i18n.fediverse), p(i18n.fediverseDescription)),
    account ? mastodonBox(account, stats, [
      a({ href: "/fediverse/mastodon", class: "filter-btn" }, `← ${i18n.fediverse}`)
    ], true) : ""
  );

  if (!thread || !thread.status) {
    return template(i18n.fediverse, header, section(div({ class: "fediverse-error" }, i18n[error] || i18n.fediverseError)));
  }

  const body = [];
  if (error) body.push(div({ class: "fediverse-error" }, i18n[error] || i18n.fediverseError));
  const rt = `/fediverse/mastodon/thread/${encodeURIComponent(thread.status.id)}`;
  (thread.ancestors || []).forEach(pst => body.push(renderPost(pst, rt)));
  body.push(section({ class: "feed-container fediverse-focus" }, renderPost(thread.status, rt)));
  (thread.descendants || []).forEach(pst => body.push(renderPost(pst, rt)));
  body.push(br());
  body.push(hr());
  body.push(br());
  body.push(renderComposeForm({ action: `/fediverse/mastodon/reply/${encodeURIComponent(thread.status.id)}/preview`, placeholder: i18n.fediverseReplyPlaceholder, submitLabel: i18n.fediversePreview }));

  return template(i18n.fediverse, header, section(...body));
};

exports.fediversePreviewView = ({ account, stats, text, media, error, replyToId, parent } = {}) => {
  const mediaList = Array.isArray(media) ? media : [];
  const hasContent = (typeof text === "string" && text.trim().length > 0) || mediaList.length > 0;
  const isReply = !!replyToId;
  const sid = isReply ? encodeURIComponent(String(replyToId)) : "";
  const postAction = isReply ? `/fediverse/mastodon/reply/${sid}` : "/fediverse/mastodon/post";
  const previewAction = isReply ? `/fediverse/mastodon/reply/${sid}/preview` : "/fediverse/mastodon/preview";
  const backHref = isReply ? `/fediverse/mastodon/thread/${sid}` : "/fediverse/mastodon";

  const previewCard = section({ class: "feed-container" },
    div({ class: "feed-card fediverse-card fediverse-preview-card" },
      text ? div({ class: "feed-text fediverse-pre" }, text) : "",
      mediaList.length ? div({ class: "fediverse-media" }, mediaList.map(m => renderMedia({ type: m.type, url: `/fediverse/tmp/${encodeURIComponent(m.name)}` }))) : ""
    )
  );

  return template(i18n.fediverse,
    section(
      div({ class: "tags-header" }, h2(i18n.fediverse), p(i18n.fediverseDescription)),
      account ? mastodonBox(account, stats, [
        a({ href: backHref, class: "filter-btn" }, `← ${i18n.fediverse}`)
      ], true) : ""
    ),
    parent ? section({ class: "feed-container fediverse-focus" }, renderPost(parent, backHref, { noActions: true })) : "",
    error ? section(div({ class: "fediverse-error" }, i18n[error] || i18n.fediverseError)) : "",
    section(
      div({ class: "publish-form" },
        form(
          { action: postAction, method: "POST", enctype: "multipart/form-data" },
          textarea({ name: "text", id: "text", rows: "6", class: "publish-textarea", placeholder: isReply ? i18n.fediverseReplyPlaceholder : i18n.fediverseComposePlaceholder }, text || ""),
          ...mediaList.map(m => input({ type: "hidden", name: "tmp", value: m.name })),
          br(),
          label({ for: "fediverse_media" }, i18n.fediverseAttach),
          br(),
          input({ type: "file", id: "fediverse_media", name: "media", accept: "image/*,video/*", multiple: true }),
          br(),
          br(),
          ...(hasContent ? [hr(), br(), previewCard, br(), br()] : []),
          div({ class: "fediverse-actions" },
            button({ type: "submit", class: "filter-btn", formaction: previewAction }, i18n.fediversePreview),
            ...(hasContent ? [button({ type: "submit", class: "filter-btn" }, i18n.fediversePublish)] : [])
          )
        )
      )
    )
  );
};
