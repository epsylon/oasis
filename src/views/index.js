"use strict";

const path = require("path");
const envPaths = require("env-paths");
const fs = require("fs");
const homedir = require('os').homedir();
const gossipPath = path.join(homedir, ".ssb/gossip.json");
const debug = require("debug")("oasis");
const highlightJs = require("highlight.js");
const prettyMs = require("pretty-ms");

const updater = require("../updater.js");
async function checkForUpdate() {
  try {
    await updater.getRemoteVersion();
    if (global.ck === "required") {
      global.updaterequired = form(
        { action: "/update", method: "post" },
        button({ type: "submit" }, i18n.updateit)
      );
    }
  } catch (error) {
    console.error("\noasis@version: error fetching package.json:", error.message, "\n");
  }
}
checkForUpdate();

const {
  a,
  article,
  br,
  body,
  button,
  details,
  div,
  em,
  footer,
  form,
  h1,
  h2,
  head,
  header,
  hr,
  html,
  img,
  input,
  label,
  li,
  link,
  main,
  meta,
  nav,
  option,
  p,
  pre,
  progress,
  section,
  select,
  span,
  summary,
  table,
  tbody,
  td,
  textarea,
  th,
  thead,
  title,
  tr,
  ul,
} = require("hyperaxe");

const lodash = require("lodash");
const markdown = require("./markdown");

const i18nBase = require("./i18n");

let selectedLanguage = "en";
let i18n = i18nBase[selectedLanguage];

exports.setLanguage = (language) => {
  selectedLanguage = language;
  i18n = Object.assign({}, i18nBase.en, i18nBase[language]);
};

const markdownUrl = "https://commonmark.org/help/";
const snhUrl = "https://solarnethub.com/";

const doctypeString = "<!DOCTYPE html>";

const THREAD_PREVIEW_LENGTH = 3;

const toAttributes = (obj) =>
  Object.entries(obj)
    .map(([key, val]) => `${key}=${val}`)
    .join(", ");

// non-breaking space
const nbsp = "\xa0";

const { saveConfig, getConfig } = require('../modules-config');
const configMods = getConfig();
const navLink = ({ href, emoji, text, current }) =>
  li(
    a(
      { href, class: current ? "current" : "" },
      span({ class: "emoji" }, emoji),
      nbsp,
      text
    )
  );

const customCSS = (filename) => {
  const customStyleFile = path.join(
    envPaths("oasis", { suffix: "" }).config,
    filename
  );
  try {
    if (fs.existsSync(customStyleFile)) {
      return link({ rel: "stylesheet", href: filename });
    }
  } catch (error) {
    return "";
  }
};

const renderPopularLink = () => {
  const popularMod = getConfig().popularMod === 'on';
  return popularMod 
    ? navLink({ href: "/public/popular/day", emoji: "⌘", text: i18n.popular, class: "popular-link enabled" }) 
    : ''; 
};
const renderTopicsLink = () => {
  const topicsMod = getConfig().topicsMod === 'on';
  return topicsMod 
    ? navLink({ href: "/public/latest/topics", emoji: "ϟ", text: i18n.topics, class: "topics-link enabled" }) 
    : ''; 
};
const renderSummariesLink = () => {
  const summariesMod = getConfig().summariesMod === 'on';
  return summariesMod 
    ? navLink({ href: "/public/latest/summaries", emoji: "※", text: i18n.summaries, class: "summaries-link enabled" }) 
    : ''; 
};
const renderLatestLink = () => {
  const latestMod = getConfig().latestMod === 'on';
  return latestMod 
    ? navLink({ href: "/public/latest", emoji: "☄", text: i18n.latest, class: "latest-link enabled" }) 
    : ''; 
};
const renderThreadsLink = () => {
  const threadsMod = getConfig().threadsMod === 'on';
  return threadsMod 
    ? navLink({ href: "/public/latest/threads", emoji: "♺", text: i18n.threads, class: "threads-link enabled" }) 
    : ''; 
};
const renderMultiverseLink = () => {
  const multiverseMod = getConfig().multiverseMod === 'on';
  return multiverseMod 
    ? navLink({ href: "/public/latest/extended", emoji: "∞", text: i18n.multiverse, class: "multiverse-link enabled" }) 
    : ''; 
};
const renderInboxLink = () => {
  const inboxMod = getConfig().inboxMod === 'on';
  return inboxMod 
    ? navLink({ href: "/inbox", emoji: "☂", text: i18n.inbox, class: "inbox-link enabled" }) 
    : ''; 
};
const renderInvitesLink = () => {
  const invitesMod = getConfig().invitesMod === 'on';
  return invitesMod 
    ? navLink({ href: "/invites", emoji: "ꔹ", text: i18n.invites, class: "invites-link enabled" }) 
    : ''; 
};
const renderWalletLink = () => {
  const walletMod = getConfig().walletMod === 'on';
  if (walletMod) {
    return [
      navLink({ href: "/wallet", emoji: "❄", text: i18n.wallet, class: "wallet-link enabled" }),
      hr()
    ];
  }
  return ''; 
};

const template = (titlePrefix, ...elements) => {
  const nodes = html(
    { lang: "en" },
    head(
      title(titlePrefix, " | Oasis"),
      link({ rel: "stylesheet", href: "/theme.css" }),
      link({ rel: "stylesheet", href: "/assets/style.css" }),
      link({ rel: "stylesheet", href: "/assets/highlight.css" }),
      customCSS("/custom-style.css"),
      link({ rel: "icon", type: "image/svg+xml", href: "/assets/favicon.svg" }),
      meta({ charset: "utf-8" }),
      meta({ name: "description", content: i18n.oasisDescription }),
      meta({ name: "viewport", content: toAttributes({ width: "device-width", "initial-scale": 1 }) })
    ),
    body(
      nav(
        ul(
          navLink({ href: "/mentions", emoji: "✺", text: i18n.mentions }),
          renderPopularLink(),
          hr,
          renderTopicsLink(),
          renderSummariesLink(),
          renderLatestLink(),
          renderThreadsLink(),
          hr,
          renderMultiverseLink()
        )
      ),
      main({ id: "content" }, elements),
      nav(
        ul(
          navLink({ href: "/publish", emoji: "❂", text: i18n.publish }),
          renderInboxLink(),
          navLink({ href: "/search", emoji: "✦", text: i18n.search }),
          hr,
          renderWalletLink(),
          navLink({ href: "/profile", emoji: "⚉", text: i18n.profile }),
          navLink({ href: "/peers", emoji: "⧖", text: i18n.peers }),
          hr,
          navLink({ href: "/settings", emoji: "⚙", text: i18n.settings }),
          navLink({ href: "/modules", emoji: "ꗣ", text: i18n.modules }),
          renderInvitesLink(),
        )
      ),
    )
  );
  return doctypeString + nodes.outerHTML;
};

const thread = (messages) => {
  // this first loop is preprocessing to enable auto-expansion of forks when a
  // message in the fork is linked to

  let lookingForTarget = true;
  let shallowest = Infinity;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const depth = lodash.get(msg, "value.meta.thread.depth", 0);

    if (lookingForTarget) {
      const isThreadTarget = Boolean(
        lodash.get(msg, "value.meta.thread.target", false)
      );

      if (isThreadTarget) {
        lookingForTarget = false;
      }
    } else {
      if (depth < shallowest) {
        lodash.set(msg, "value.meta.thread.ancestorOfTarget", true);
        shallowest = depth;
      }
    }
  }

  const msgList = [];
  for (let i = 0; i < messages.length; i++) {
    const j = i + 1;

    const currentMsg = messages[i];
    const nextMsg = messages[j];

    const depth = (msg) => {
      // will be undefined when checking depth(nextMsg) when currentMsg is the
      // last message in the thread
      if (msg === undefined) return 0;
      return lodash.get(msg, "value.meta.thread.depth", 0);
    };

    msgList.push(post({ msg: currentMsg }).outerHTML);

    if (depth(currentMsg) < depth(nextMsg)) {
      const isAncestor = Boolean(
        lodash.get(currentMsg, "value.meta.thread.ancestorOfTarget", false)
      );
      const isBlocked = Boolean(nextMsg.value.meta.blocking);
      msgList.push(`<div class="indent"><details ${isAncestor ? "open" : ""}>`);

      const nextAuthor = lodash.get(nextMsg, "value.meta.author.name");
      const nextSnippet = postSnippet(
        lodash.has(nextMsg, "value.content.contentWarning")
          ? lodash.get(nextMsg, "value.content.contentWarning")
          : lodash.get(nextMsg, "value.content.text")
      );
      msgList.push(
        summary(
          isBlocked
            ? i18n.relationshipBlockingPost
            : `${nextAuthor}: ${nextSnippet}`
        ).outerHTML
      );
    } else if (depth(currentMsg) > depth(nextMsg)) {
      // getting more shallow
      const diffDepth = depth(currentMsg) - depth(nextMsg);

      const shallowList = [];
      for (let d = 0; d < diffDepth; d++) {
        // on the way up it might go several depths at once
        shallowList.push("</details></div>");
      }

      msgList.push(shallowList);
    }
  }

  const htmlStrings = lodash.flatten(msgList);
  return div(
    {},
    { class: "thread-container", innerHTML: htmlStrings.join("") }
  );
};

const postSnippet = (text) => {
  const max = 40;

  text = text.trim().split("\n", 3).join("\n");
  // this is taken directly from patchwork. i'm not entirely sure what this
  // regex is doing
  text = text.replace(/_|`|\*|#|^\[@.*?]|\[|]|\(\S*?\)/g, "").trim();
  text = text.replace(/:$/, "");
  text = text.trim().split("\n", 1)[0].trim();

  if (text.length > max) {
    text = text.substring(0, max - 1) + "…";
  }

  return text;
};

/**
 * Render a section containing a link that takes users to the context for a
 * thread preview.
 *
 * @param {Array} thread with SSB message objects
 * @param {Boolean} isComment true if this is shown in the context of a comment
 *  instead of a post
 */
const continueThreadComponent = (thread, isComment) => {
  const encoded = {
    next: encodeURIComponent(thread[THREAD_PREVIEW_LENGTH + 1].key),
    parent: encodeURIComponent(thread[0].key),
  };
  const left = thread.length - (THREAD_PREVIEW_LENGTH + 1);
  let continueLink;
  if (isComment == false) {
    continueLink = `/thread/${encoded.parent}#${encoded.next}`;
    return a(
      { href: continueLink },
      i18n.continueReading, ` ${left} `, i18n.moreComments+`${left === 1 ? "" : "s"}`
    );
  } else {
    continueLink = `/thread/${encoded.parent}`;
    return a({ href: continueLink }, i18n.readThread);
  }
};

/**
 * Render an aside with a preview of comments on a message
 *
 * For posts, up to three comments are shown, for comments, up to 3 messages
 * directly following this one in the thread are displayed. If there are more
 * messages in the thread, a link is rendered that links to the rest of the
 * context.
 *
 * @param {Object} post for which to display the aside
 */
const postAside = ({ key, value }) => {
  const thread = value.meta.thread;
  if (thread == null) return null;

  const isComment = value.meta.postType === "comment";

  let postsToShow;
  if (isComment) {
    const commentPosition = thread.findIndex((msg) => msg.key === key);
    postsToShow = thread.slice(
      commentPosition + 1,
      Math.min(commentPosition + (THREAD_PREVIEW_LENGTH + 1), thread.length)
    );
  } else {
    postsToShow = thread.slice(
      1,
      Math.min(thread.length, THREAD_PREVIEW_LENGTH + 1)
    );
  }

  const fragments = postsToShow.map((p) => post({ msg: p }));

  if (thread.length > THREAD_PREVIEW_LENGTH + 1) {
    fragments.push(section(continueThreadComponent(thread, isComment)));
  }

  return div({ class: "indent" }, fragments);
};

const post = ({ msg, aside = false }) => {
  const encoded = {
    key: encodeURIComponent(msg.key),
    author: encodeURIComponent(msg.value.author),
    parent: encodeURIComponent(msg.value.content.root),
  };

  const url = {
    author: `/author/${encoded.author}`,
    likeForm: `/like/${encoded.key}`,
    link: `/thread/${encoded.key}#${encoded.key}`,
    parent: `/thread/${encoded.parent}#${encoded.parent}`,
    avatar: msg.value.meta.author.avatar.url,
    json: `/json/${encoded.key}`,
    subtopic: `/subtopic/${encoded.key}`,
    comment: `/comment/${encoded.key}`,
  };

  const isPrivate = Boolean(msg.value.meta.private);
  const isBlocked = Boolean(msg.value.meta.blocking);
  const isRoot = msg.value.content.root == null;
  const isFork = msg.value.meta.postType === "subtopic";
  const hasContentWarning =
    typeof msg.value.content.contentWarning === "string";
  const isThreadTarget = Boolean(
    lodash.get(msg, "value.meta.thread.target", false)
  );

  const { name } = msg.value.meta.author;

  const ts_received = msg.value.meta.timestamp.received;
  const timeAgo = ts_received.since.replace("~", "");
  const timeAbsolute = ts_received.iso8601.split(".")[0].replace("T", " ");

  const markdownContent = markdown(
    msg.value.content.text,
    msg.value.content.mentions
  );

  const likeButton = msg.value.meta.voted
    ? { value: 0, class: "liked" }
    : { value: 1, class: null };

  const likeCount = msg.value.meta.votes.length;
  const maxLikedNameLength = 16;
  const maxLikedNames = 16;

  const likedByNames = msg.value.meta.votes
    .slice(0, maxLikedNames)
    .map((person) => person.name)
    .map((name) => name.slice(0, maxLikedNameLength))
    .join(", ");

  const additionalLikesMessage =
    likeCount > maxLikedNames ? `+${likeCount - maxLikedNames} more` : ``;

  const likedByMessage =
    likeCount > 0 ? `${likedByNames} ${additionalLikesMessage}` : null;

  const messageClasses = ["post"];

  const recps = [];

  const addRecps = (recpsInfo) => {
    recpsInfo.forEach(function (recp) {
      recps.push(
        a(
          { href: `/author/${encodeURIComponent(recp.feedId)}` },
          img({ class: "avatar", src: recp.avatarUrl, alt: "" })
        )
      );
    });
  };

  if (isPrivate) {
    messageClasses.push("private");
    addRecps(msg.value.meta.recpsInfo);
  }

  if (isThreadTarget) {
    messageClasses.push("thread-target");
  }

  const postOptions = {
    post: null,
    comment: i18n.commentDescription({ parentUrl: url.parent }),
    subtopic: i18n.subtopicDescription({ parentUrl: url.parent }),
    mystery: i18n.mysteryDescription,
  };

  const emptyContent = "<p>undefined</p>\n";
  const articleElement =
    markdownContent === emptyContent
      ? article(
          { class: "content" },
          pre({
            innerHTML: highlightJs.highlight(
              JSON.stringify(msg, null, 2),
              {language: "json", ignoreIllegals: true}
            ).value,
          })
        )
      : article({ class: "content", innerHTML: markdownContent });

  if (isBlocked) {
    messageClasses.push("blocked");
    return section(
      {
        id: msg.key,
        class: messageClasses.join(" "),
      },
      i18n.relationshipBlockingPost
    );
  }

  const articleContent = hasContentWarning
    ? details(summary(msg.value.content.contentWarning), articleElement)
    : articleElement;

  const fragment = section(
    {
      id: msg.key,
      class: messageClasses.join(" "),
    },
    header(
      div(
        span(
          { class: "author" },
          a(
            { href: url.author },
            img({ class: "avatar", src: url.avatar, alt: "" }),
            name
          )
        ),
        span({ class: "author-action" }, postOptions[msg.value.meta.postType]),
        span(
          {
            class: "time",
            title: timeAbsolute,
          },
          isPrivate ? "🔒" : null,
          isPrivate ? recps : null,
          a({ href: url.link }, nbsp, timeAgo)
        )
      )
    ),
    articleContent,

    // HACK: centered-footer
    //
    // Here we create an empty div with an anchor tag that can be linked to.
    // In our CSS we ensure that this gets centered on the screen when we
    // link to this anchor tag.
    //
    // This is used for redirecting users after they like a post, when we
    // want the like button that they just clicked to remain close-ish to
    // where it was before they clicked the button.
    div({ id: `centered-footer-${encoded.key}`, class: "centered-footer" }),

    footer(
      div(
        form(
          { action: url.likeForm, method: "post" },
          button(
            {
              name: "voteValue",
              type: "submit",
              value: likeButton.value,
              class: likeButton.class,
              title: likedByMessage,
            },
            `☉ ${likeCount}`
          )
        ),
        a({ href: url.comment }, i18n.comment),
        isPrivate || isRoot || isFork
          ? null
          : a({ href: url.subtopic }, nbsp, i18n.subtopic),
        a({ href: url.json }, nbsp, i18n.json)
      ),
      br()
    )
  );

  const threadSeparator = [div({ class: "text-browser" }, hr(), br())];

  if (aside) {
    return [fragment, postAside(msg), isRoot ? threadSeparator : null];
  } else {
    return fragment;
  }
};

exports.editProfileView = ({ name, description }) =>
  template(
    i18n.editProfile,
    section(
      h1(i18n.editProfile),
      p(i18n.editProfileDescription),
      form(
        {
          action: "/profile/edit",
          method: "POST",
          enctype: "multipart/form-data",
        },
        label(
          i18n.profileImage,
          input({ type: "file", name: "image", accept: "image/*" })
        ),
        label(i18n.profileName, input({ name: "name", value: name })),
        label(
          i18n.profileDescription,
          textarea(
            {
              autofocus: true,
              name: "description",
            },
            description
          )
        ),
        button(
          {
            type: "submit",
          },
          i18n.submit
        )
      )
    )
  );

/**
 * @param {{avatarUrl: string, description: string, feedId: string, messages: any[], name: string, relationship: object, firstPost: object, lastPost: object}} input
 */
exports.authorView = ({
  avatarUrl,
  description,
  feedId,
  messages,
  firstPost,
  lastPost,
  name,
  relationship,
}) => {
  const mention = `[@${name}](${feedId})`;
  const markdownMention = highlightJs.highlight(mention, {language: "markdown", ignoreIllegals: true}).value;

  const contactForms = [];

  const addForm = ({ action }) =>
    contactForms.push(
      form(
        {
          action: `/${action}/${encodeURIComponent(feedId)}`,
          method: "post",
        },
        button(
          {
            type: "submit",
          },
          i18n[action]
        )
      )
    );

  if (relationship.me === false) {
    if (relationship.following) {
      addForm({ action: "unfollow" });
    } else if (relationship.blocking) {
      addForm({ action: "unblock" });
    } else {
      addForm({ action: "follow" });
      addForm({ action: "block" });
    }
  }

  const relationshipText = (() => {
    if (relationship.me === true) {
      return i18n.relationshipYou;
    } else if (
      relationship.following === true &&
      relationship.blocking === false
    ) {
      return i18n.relationshipFollowing;
    } else if (
      relationship.following === false &&
      relationship.blocking === true
    ) {
      return i18n.relationshipBlocking;
    } else if (
      relationship.following === false &&
      relationship.blocking === false
    ) {
      return i18n.relationshipNone;
    } else if (
      relationship.following === true &&
      relationship.blocking === true
    ) {
      return i18n.relationshipConflict;
    } else {
      throw new Error(`Unknown relationship ${JSON.stringify(relationship)}`);
    }
  })();

  const prefix = section(
    { class: "message" },
    div(
      { class: "profile" },
      img({ class: "avatar", src: avatarUrl }),
      h1(name)
    ),
    pre({
      class: "md-mention",
      innerHTML: markdownMention,
    }),
    description !== "" ? article({ innerHTML: markdown(description) }) : null,
    footer(
      div(
        a({ href: `/likes/${encodeURIComponent(feedId)}` }, i18n.viewLikes),
        span(nbsp, relationshipText),
        ...contactForms,
        relationship.me
          ? a({ href: `/profile/edit` }, nbsp, i18n.editProfile)
          : null
      ),
      br()
    )
  );

  const linkUrl = relationship.me
    ? "/profile/"
    : `/author/${encodeURIComponent(feedId)}/`;

  let items = messages.map((msg) => post({ msg }));
  if (items.length === 0) {
    if (lastPost === undefined) {
      items.push(section(div(span(i18n.feedEmpty))));
    } else {
      items.push(
        section(
          div(
            span(i18n.feedRangeEmpty),
            a({ href: `${linkUrl}` }, i18n.seeFullFeed)
          )
        )
      );
    }
  } else {
    const highestSeqNum = messages[0].value.sequence;
    const lowestSeqNum = messages[messages.length - 1].value.sequence;
    let newerPostsLink;
    if (lastPost !== undefined && highestSeqNum < lastPost.value.sequence)
      newerPostsLink = a(
        { href: `${linkUrl}?gt=${highestSeqNum}` },
        i18n.newerPosts
      );
    else newerPostsLink = span(i18n.newerPosts, { title: i18n.noNewerPosts });
    let olderPostsLink;
    if (lowestSeqNum > firstPost.value.sequence)
      olderPostsLink = a(
        { href: `${linkUrl}?lt=${lowestSeqNum}` },
        i18n.olderPosts
      );
    else
      olderPostsLink = span(i18n.olderPosts, { title: i18n.beginningOfFeed });
    const pagination = section(
      { class: "message" },
      footer(div(newerPostsLink, olderPostsLink), br())
    );
    items.unshift(pagination);
    items.push(pagination);
  }

  return template(i18n.profile, prefix, items);
};

exports.previewCommentView = async ({
  previewData,
  messages,
  myFeedId,
  parentMessage,
  contentWarning,
}) => {
  const publishAction = `/comment/${encodeURIComponent(messages[0].key)}`;

  const preview = generatePreview({
    previewData,
    contentWarning,
    action: publishAction,
  });
  return exports.commentView(
    { messages, myFeedId, parentMessage },
    preview,
    previewData.text,
    contentWarning
  );
};

exports.commentView = async (
  { messages, myFeedId, parentMessage },
  preview,
  text,
  contentWarning
) => {
  let markdownMention;

  const messageElements = await Promise.all(
    messages.reverse().map((message) => {
      debug("%O", message);
      const authorName = message.value.meta.author.name;
      const authorFeedId = message.value.author;
      if (authorFeedId !== myFeedId) {
        if (message.key === parentMessage.key) {
          const x = `[@${authorName}](${authorFeedId})\n\n`;
          markdownMention = x;
        }
      }
      return post({ msg: message });
    })
  );

  const action = `/comment/preview/${encodeURIComponent(messages[0].key)}`;
  const method = "post";

  const isPrivate = parentMessage.value.meta.private;
  const authorName = parentMessage.value.meta.author.name;

  const publicOrPrivate = isPrivate ? i18n.commentPrivate : i18n.commentPublic;
  const maybeSubtopicText = isPrivate ? [null] : i18n.commentWarning;

  return template(
    i18n.commentTitle({ authorName }),
    div({ class: "thread-container" }, messageElements),
    preview !== undefined ? preview : "",
    p(
      ...i18n.commentLabel({ publicOrPrivate, markdownUrl }),
      ...maybeSubtopicText
    ),
    form(
      { action, method, enctype: "multipart/form-data" },
      label(
        i18n.contentWarningLabel,
        input({
          name: "contentWarning",
          type: "text",
          class: "contentWarning",
          value: contentWarning ? contentWarning : "",
          placeholder: i18n.contentWarningPlaceholder,
        })
      ),
      textarea(
        {
          autofocus: true,
          required: true,
          name: "text",
        },
        text ? text : isPrivate ? null : markdownMention
      ),
      button({ type: "submit" }, i18n.preview),
      label({ class: "file-button", for: "blob" }, i18n.attachFiles),
      input({ type: "file", id: "blob", name: "blob" })
    )
  );
};

exports.mentionsView = ({ messages }) => {
  return messageListView({
    messages,
    viewTitle: i18n.mentions,
    viewDescription: i18n.mentionsDescription,
  });
};

exports.privateView = ({ messages }) => {
  return messageListView({
    messages,
    viewTitle: i18n.private,
    viewDescription: i18n.privateDescription,
  });
};

exports.publishCustomView = async () => {
  const action = "/publish/custom";
  const method = "post";

  return template(
    i18n.publishCustom,
    section(
      h1(i18n.publishCustom),
      p(i18n.publishCustomDescription),
      form(
        { action, method },
        textarea(
          {
            autofocus: true,
            required: true,
            name: "text",
          },
          "{\n",
          '  "type": "test",\n',
          '  "hello": "world"\n',
          "}"
        ),
        button(
          {
            type: "submit",
          },
          i18n.submit
        )
      )
    ),
    p(i18n.publishBasicInfo({ href: "/publish" }))
  );
};

exports.threadView = ({ messages }) => {
  const rootMessage = messages[0];
  const rootAuthorName = rootMessage.value.meta.author.name;
  const rootSnippet = postSnippet(
    lodash.get(rootMessage, "value.content.text", i18n.mysteryDescription)
  );
  return template([`@${rootAuthorName}: `, rootSnippet], thread(messages));
};

exports.publishView = (preview, text, contentWarning) => {
  return template(
    i18n.publish,
    section(
      h1(i18n.publish),
      form(
        {
          action: "/publish/preview",
          method: "post",
          enctype: "multipart/form-data",
        },
        label(
          i18n.publishLabel({ markdownUrl, linkTarget: "_blank" }),
        label(
          i18n.contentWarningLabel,
          input({
            name: "contentWarning",
            type: "text",
            class: "contentWarning",
            value: contentWarning ? contentWarning : "",
            placeholder: i18n.contentWarningPlaceholder,
          })
        ),
          textarea({ required: true, name: "text", placeholder: i18n.publishWarningPlaceholder }, text ? text : "")
        ),
        button({ type: "submit" }, i18n.preview),
        label({ class: "file-button", for: "blob" }, i18n.attachFiles),
        input({ type: "file", id: "blob", name: "blob" })
      )
    ),
    preview ? preview : "",
    p(i18n.publishCustomInfo({ href: "/publish/custom" }))
  );
};

const generatePreview = ({ previewData, contentWarning, action }) => {
  const { authorMeta, text, mentions } = previewData;
  const msg = {
    key: "%non-existent.preview",
    value: {
      author: authorMeta.id,
      // sequence: -1,
      content: {
        type: "post",
        text: text,
      },
      timestamp: Date.now(),
      meta: {
        isPrivate: true,
        votes: [],
        author: {
          name: authorMeta.name,
          avatar: {
            url: `/image/64/${encodeURIComponent(authorMeta.image)}`,
          },
        },
      },
    },
  };
  if (contentWarning) msg.value.content.contentWarning = contentWarning;
  const ts = new Date(msg.value.timestamp);
  lodash.set(msg, "value.meta.timestamp.received.iso8601", ts.toISOString());
  const ago = Date.now() - Number(ts);
  const prettyAgo = prettyMs(ago, { compact: true });
  lodash.set(msg, "value.meta.timestamp.received.since", prettyAgo);
  return div(
    Object.keys(mentions).length === 0
      ? ""
      : section(
          { class: "mention-suggestions" },
          h2(i18n.mentionsMatching),
          Object.keys(mentions).map((name) => {
            let matches = mentions[name];

            return div(
              matches.map((m) => {
                let relationship = { emoji: "", desc: "" };
                if (m.rel.followsMe && m.rel.following) {
                  relationship.emoji = "☍";
                  relationship.desc = i18n.relationshipMutuals;
                } else if (m.rel.following) {
                  relationship.emoji = "☌";
                  relationship.desc = i18n.relationshipFollowing;
                } else if (m.rel.followsMe) {
                  relationship.emoji = "⚼";
                  relationship.desc = i18n.relationshipTheyFollow;
                } else {
                  if (m.rel.me = true){
                    relationship.emoji = "#";
                    relationship.desc = i18n.relationshipYou;
                  } else {
                    relationship.emoji = "❓";
                    relationship.desc = i18n.relationshipNotFollowing;
                  }
                }
                return div(
                  { class: "mentions-container" },
                  a(
                    {
                      class: "mentions-image",
                      href: `/author/${encodeURIComponent(m.feed)}`,
                    },
                    img({ src: `/image/64/${encodeURIComponent(m.img)}` })
                  ),
                  a(
                    {
                      class: "mentions-name",
                      href: `/author/${encodeURIComponent(m.feed)}`,
                    },
                    m.name
                  ),
                  div(
                    { class: "emo-rel" },
                    span(
                      { class: "emoji", title: relationship.desc },
                      relationship.emoji
                    ),
                    span(
                      { class: "mentions-listing" },
                      `[@${m.name}](${m.feed})`
                    )
                  )
                );
              })
            );
          })
        ),
    section(
      { class: "post-preview" },
      post({ msg }),

      // doesn't need blobs, preview adds them to the text
      form(
        { action, method: "post" },
        input({
          name: "contentWarning",
          type: "hidden",
          value: contentWarning,
        }),
        input({
          name: "text",
          type: "hidden",
          value: text,
        }),
        button({ type: "submit" }, i18n.publish)
      )
    )
  );
};

exports.previewView = ({ previewData, contentWarning }) => {
  const publishAction = "/publish";

  const preview = generatePreview({
    previewData,
    contentWarning,
    action: publishAction,
  });
  return exports.publishView(preview, previewData.text, contentWarning);
};

exports.peersView = async ({ peers, supports, blocks, recommends }) => {

 const startButton = form(
    { action: "/settings/conn/start", method: "post" },
    button({ type: "submit" }, i18n.startNetworking)
  );

  const restartButton = form(
    { action: "/settings/conn/restart", method: "post" },
    button({ type: "submit" }, i18n.restartNetworking)
  );

  const stopButton = form(
    { action: "/settings/conn/stop", method: "post" },
    button({ type: "submit" }, i18n.stopNetworking)
  );

  const syncButton = form(
    { action: "/settings/conn/sync", method: "post" },
    button({ type: "submit" }, i18n.sync)
  );

  const connButtons = div({ class: "form-button-group" }, [
    startButton,
    restartButton,
    stopButton,
    syncButton,
  ]);

  const peerList = (peers || [])
    .filter(([, data]) => data.state === "connected")
    .map(([, data]) => {
      return li(
          data.name, br,
        a(
          { href: `/author/${encodeURIComponent(data.key)}` },
          data.key, br, br
        )
      );
   });

 return template(
  i18n.peers,
    section(
      { class: "message" },
      h1(i18n.peerConnections),
      connButtons,
      h1(i18n.online, " (", peerList.length, ")"),
      peerList.length > 0 ? ul(peerList) : i18n.noConnections,
      p(i18n.connectionActionIntro),
      h1(i18n.supported, " (", supports.length/2, ")"),
      supports.length > 0 ? ul(supports): i18n.noSupportedConnections,
      p(i18n.connectionActionIntro),
      h1(i18n.recommended, " (", recommends.length/2, ")"),
      recommends.length > 0 ? ul(recommends): i18n.noRecommendedConnections,
      p(i18n.connectionActionIntro),
      h1(i18n.blocked, " (", blocks.length/2, ")"),
      blocks.length > 0 ? ul(blocks): i18n.noBlockedConnections,
      p(i18n.connectionActionIntro),
      )
    );
};

exports.invitesView = ({ invitesEnabled }) => {
  let pubs = [];
  let pubsValue = "false";

  try {
    pubs = fs.readFileSync(gossipPath, "utf8");
  } catch (error) {
    pubs = undefined;
  }

  if (pubs) {
    try {
      pubs = JSON.parse(pubs);
      if (pubs && pubs.length > 0) {
        pubsValue = "true";
      } else {
        pubsValue = "false";
      }
    } catch (error) {
      pubsValue = "false";
    }
  }

  let pub = [];
  if (pubsValue === "true") {
    const arr2 = pubs.map(pubItem => {
      return li(
        `PUB: ${pubItem.host}`,
        br,
        `${i18n.inhabitants}: ${pubItem.announcers}`,
        br,
        a(
          { href: `/author/${encodeURIComponent(pubItem.key)}` },
          pubItem.key
        ),
        br,
        br
      );
    });
    pub = arr2;
  }

  return template(
    i18n.invites,
    section(
      { class: "message" },
      h1(i18n.invites),
      p(i18n.invitesDescription),
      form(
        { action: "/settings/invite/accept", method: "post" },
        input({ name: "invite", type: "text", autofocus: true, required: true }),
        button({ type: "submit" }, i18n.acceptInvite),
        h1(i18n.acceptedInvites, " (", pub.length, ")"),
        pub.length > 0 ? ul(pub) : i18n.noInvites
      )
    )
  );
};
 
exports.modulesView = () => {
  const config = getConfig();
  const popularMod = config.popularMod === 'on' ? 'on' : 'off';
  const topicsMod = config.topicsMod === 'on' ? 'on' : 'off';
  const summariesMod = config.summariesMod === 'on' ? 'on' : 'off';
  const latestMod = config.latestMod === 'on' ? 'on' : 'off';
  const threadsMod = config.threadsMod === 'on' ? 'on' : 'off';
  const multiverseMod = config.multiverseMod === 'on' ? 'on' : 'off';
  const inboxMod = config.inboxMod === 'on' ? 'on' : 'off';
  const invitesMod = config.invitesMod === 'on' ? 'on' : 'off';
  const walletMod = config.walletMod === 'on' ? 'on' : 'off';
  
  return template(
    i18n.modulesView,
    section(
      { class: "modules-view" },
      h1(i18n.modulesViewTitle),
      p(i18n.modulesViewDescription)
    ),
    section(
      form(
        { action: "/save-modules", method: "post" },
        table(
          { class: "module-table" },
          tr(
            td(i18n.popularLabel),
            td(
              input({
                type: "checkbox",
                id: "popularMod",
                name: "popularForm",
                class: "input-checkbox",
                checked: popularMod === 'on' ? true : undefined
              })
            ),
            td(i18n.latestLabel),
            td(
              input({
                type: "checkbox",
                id: "latestMod",
                name: "latestForm",
                class: "input-checkbox",
                checked: latestMod === 'on' ? true : undefined
              })
            ),
            td(i18n.walletLabel),
            td(
              input({
                type: "checkbox",
                id: "walletMod",
                name: "walletForm",
                class: "input-checkbox",
                checked: walletMod === 'on' ? true : undefined
              })
            )
          ),
          tr(
            td(i18n.topicsLabel),
            td(
              input({
                type: "checkbox",
                id: "topicsMod",
                name: "topicsForm",
                class: "input-checkbox",
                checked: topicsMod === 'on' ? true : undefined
              })
            ),
            td(i18n.threadsLabel),
            td(
              input({
                type: "checkbox",
                id: "threadsMod",
                name: "threadsForm",
                class: "input-checkbox",
                checked: threadsMod === 'on' ? true : undefined
              })
            ),
            td(i18n.inboxLabel),
            td(
              input({
                type: "checkbox",
                id: "inboxMod",
                name: "inboxForm",
                class: "input-checkbox",
                checked: inboxMod === 'on' ? true : undefined
              })
            )
          ),
          tr(
            td(i18n.summariesLabel),
            td(
              input({
                type: "checkbox",
                id: "summariesMod",
                name: "summariesForm",
                class: "input-checkbox",
                checked: summariesMod === 'on' ? true : undefined
              })
            ),
            td(i18n.multiverseLabel),
            td(
              input({
                type: "checkbox",
                id: "multiverseMod",
                name: "multiverseForm",
                class: "input-checkbox",
                checked: multiverseMod === 'on' ? true : undefined
              })
            ),
            td(i18n.invitesLabel),
            td(
              input({
                type: "checkbox",
                id: "invitesMod",
                name: "invitesForm",
                class: "input-checkbox",
                checked: invitesMod === 'on' ? true : undefined
              })
            )
          )
        ),
        div(
          { class: "save-button-container" },
          button({ type: "submit", class: "submit-button" }, i18n.saveSettings)
        )
      )
    )
  );
};

exports.settingsView = ({ theme, themeNames, version, walletUrl, walletUser, walletFee }) => {
 const themeElements = themeNames.map((cur) => {
    const isCurrentTheme = cur === theme;
    if (isCurrentTheme) {
      return option({ value: cur, selected: true }, cur);
    } else {
      return option({ value: cur }, cur);
    }
  });

  const base16 = [
    // '00', removed because this is the background
    "01",
    "02",
    "03",
    "04",
    "05",
    "06",
    "07",
    "08",
    "09",
    "0A",
    "0B",
    "0C",
    "0D",
    "0E",
    "0F",
  ];

  const base16Elements = base16.map((base) =>
    div({
      class: `theme-preview theme-preview-${base}`,
    })
  );

  const languageOption = (longName, shortName) =>
    shortName === selectedLanguage
      ? option({ value: shortName, selected: true }, longName)
      : option({ value: shortName }, longName);

  const rebuildButton = form(
    { action: "/settings/rebuild", method: "post" },
    button({ type: "submit" }, i18n.rebuildName)
  );

  return template(
    i18n.settings,
    section(
      { class: "message" },
      h1(i18n.settings),
      p(a({ href:snhUrl, target: "_blank" }, i18n.settingsIntro({ version }))),
      p(global.updaterequired),
      hr,
      h2(i18n.theme),
      p(i18n.themeIntro),
      form(
         { action: "/theme.css", method: "post" },
         select({ name: "theme" }, ...themeElements),
         button({ type: "submit" }, i18n.setTheme)
       ),
      hr,
      h2(i18n.language),
      p(i18n.languageDescription),
      form(
        { action: "/language", method: "post" },
        select({ name: "language" }, [
          // Languages are sorted alphabetically by their 'long name'.
          /* spell-checker:disable */
          languageOption("English", "en"),
          languageOption("Español", "es"),
          /* spell-checker:enable */
        ]),
        button({ type: "submit" }, i18n.setLanguage)
      ),
      hr,
      h2(i18n.wallet),
      p(i18n.walletSettingsDescription),
      form(
        { action: "/settings/wallet", method: "POST" },
        label({ for: "wallet_url" }, i18n.walletAddress),
        input({ type: "text", id: "wallet_url", name: "wallet_url", placeholder: walletUrl, value: walletUrl }),
        label({ for: "wallet_user" }, i18n.walletUser),
        input({ type: "text", id: "wallet_user", name: "wallet_user", placeholder: walletUser, value: walletUser }),

        label({ for: "wallet_pass" }, i18n.walletPass),
        input({ type: "password", id: "wallet_pass", name: "wallet_pass" }),

        label({ for: "wallet_fee" }, i18n.walletFee),
        input({ type: "text", id: "wallet_fee", name: "wallet_fee", placeholder: walletFee, value: walletFee }),

        button({ type: "submit" }, i18n.walletConfiguration)
      ),
      hr,
      h2(i18n.indexes),
      p(i18n.indexesDescription),
      rebuildButton,
    )
  );
};

/** @param {{ viewTitle: string, viewDescription: string }} input */
const viewInfoBox = ({ viewTitle = null, viewDescription = null }) => {
  if (!viewTitle && !viewDescription) {
    return null;
  }
  return section(
    { class: "viewInfo" },
    viewTitle ? h1(viewTitle) : null,
    viewDescription ? em(viewDescription) : null
  );
};

exports.likesView = async ({ messages, feed, name }) => {
  const authorLink = a(
    { href: `/author/${encodeURIComponent(feed)}` },
    "@" + name
  );

  return template(
    ["@", name, i18n.likedBy],
    viewInfoBox({
      viewTitle: span(authorLink, i18n.likedBy),
      viewDescription: span(i18n.spreadedDescription)
    }),
    messages.map((msg) => post({ msg }))
  );
};

const messageListView = ({
  messages,
  viewTitle = null,
  viewDescription = null,
  viewElements = null,
  // If `aside = true`, it will show a few comments in the thread.
  aside = null,
}) => {
  return template(
    viewTitle,
    section(h1(viewTitle), p(viewDescription), viewElements),
    messages.map((msg) => post({ msg, aside }))
  );
};

exports.popularView = ({ messages, prefix }) => {
  return messageListView({
    messages,
    viewElements: prefix,
    viewTitle: i18n.popular,
    viewDescription: i18n.popularDescription,
  });
};

exports.extendedView = ({ messages }) => {
  return messageListView({
    messages,
    viewTitle: i18n.extended,
    viewDescription: i18n.extendedDescription,
  });
};

exports.latestView = ({ messages }) => {
  return messageListView({
    messages,
    viewTitle: i18n.latest,
    viewDescription: i18n.latestDescription,
  });
};

exports.topicsView = ({ messages, prefix }) => {
  return messageListView({
    messages,
    viewTitle: i18n.topics,
    viewDescription: i18n.topicsDescription,
    viewElements: prefix,
  });
};

exports.summaryView = ({ messages }) => {
  return messageListView({
    messages,
    viewTitle: i18n.summaries,
    viewDescription: i18n.summariesDescription,
    aside: true,
  });
};

exports.spreadedView = ({ messages }) => {
  return spreadedListView({
    messages,
    viewTitle: i18n.spreaded,
    viewDescription: i18n.spreadedDescription,
  });
};

exports.threadsView = ({ messages }) => {
  return messageListView({
    messages,
    viewTitle: i18n.threads,
    viewDescription: i18n.threadsDescription,
    aside: true,
  });
};

exports.previewSubtopicView = async ({
  previewData,
  messages,
  myFeedId,
  contentWarning,
}) => {
  const publishAction = `/subtopic/${encodeURIComponent(messages[0].key)}`;

  const preview = generatePreview({
    previewData,
    contentWarning,
    action: publishAction,
  });
  return exports.subtopicView(
    { messages, myFeedId },
    preview,
    previewData.text,
    contentWarning
  );
};

exports.subtopicView = async (
  { messages, myFeedId },
  preview,
  text,
  contentWarning
) => {
  const subtopicForm = `/subtopic/preview/${encodeURIComponent(
    messages[messages.length - 1].key
  )}`;

  let markdownMention;

  const messageElements = await Promise.all(
    messages.reverse().map((message) => {
      debug("%O", message);
      const authorName = message.value.meta.author.name;
      const authorFeedId = message.value.author;
      if (authorFeedId !== myFeedId) {
        if (message.key === messages[0].key) {
          const x = `[@${authorName}](${authorFeedId})\n\n`;
          markdownMention = x;
        }
      }
      return post({ msg: message });
    })
  );

  const authorName = messages[messages.length - 1].value.meta.author.name;

  return template(
    i18n.subtopicTitle({ authorName }),
    div({ class: "thread-container" }, messageElements),
    preview !== undefined ? preview : "",
    p(i18n.subtopicLabel({ markdownUrl })),
    form(
      { action: subtopicForm, method: "post", enctype: "multipart/form-data" },
      textarea(
        {
          autofocus: true,
          required: true,
          name: "text",
        },
        text ? text : markdownMention
      ),
      label(
        i18n.contentWarningLabel,
        input({
          name: "contentWarning",
          type: "text",
          class: "contentWarning",
          value: contentWarning ? contentWarning : "",
          placeholder: i18n.contentWarningPlaceholder,
        })
      ),
      button({ type: "submit" }, i18n.preview),
      label({ class: "file-button", for: "blob" }, i18n.attachFiles),
      input({ type: "file", id: "blob", name: "blob" })
    )
  );
};

exports.searchView = ({ messages, query }) => {
  const searchInput = input({
    name: "query",
    required: false,
    type: "search",
    value: query,
  });

  // - Minimum length of 3 because otherwise SSB-Search hangs forever. :)
  //   https://github.com/ssbc/ssb-search/issues/8
  // - Using `setAttribute()` because HyperScript (the HyperAxe dependency has
  //   a bug where the `minlength` property is being ignored. No idea why.
  //   https://github.com/hyperhype/hyperscript/issues/91
  searchInput.setAttribute("minlength", 3);

  return template(
    i18n.search,
    section(
      h1(i18n.search),
      form(
        { action: "/search", method: "get" },
        label(i18n.searchLabel, searchInput),
        button(
          {
            type: "submit",
          },
          i18n.submit
        )
      )
    ),
    messages.map((msg) => post({ msg }))
  );
};

const imageResult = ({ id, infos }) => {
  const encodedBlobId = encodeURIComponent(id);
  // only rendering the first message result so far
  // todo: render links to the others as well
  const info = infos[0];
  const encodedMsgId = encodeURIComponent(info.msg);

  return div(
    {
      class: "image-result",
    },
    [
      a(
        {
          href: `/blob/${encodedBlobId}`,
        },
        img({ src: `/image/256/${encodedBlobId}` })
      ),
      a(
        {
          href: `/thread/${encodedMsgId}#${encodedMsgId}`,
          class: "result-text",
        },
        info.name
      ),
    ]
  );
};

exports.imageSearchView = ({ blobs, query }) => {
  const searchInput = input({
    name: "query",
    required: false,
    type: "search",
    value: query,
  });

  // - Minimum length of 3 because otherwise SSB-Search hangs forever. :)
  //   https://github.com/ssbc/ssb-search/issues/8
  // - Using `setAttribute()` because HyperScript (the HyperAxe dependency has
  //   a bug where the `minlength` property is being ignored. No idea why.
  //   https://github.com/hyperhype/hyperscript/issues/91
  searchInput.setAttribute("minlength", 3);

  return template(
    i18n.imageSearch,
    section(
      h1(i18n.imageSearch),
      form(
        { action: "/imageSearch", method: "get" },
        label(i18n.imageSearchLabel, searchInput),
        button(
          {
            type: "submit",
          },
          i18n.submit
        )
      )
    ),
    div(
      {
        class: "image-search-grid",
      },
      Object.keys(blobs)
        // todo: add pagination
        .slice(0, 30)
        .map((blobId) => imageResult({ id: blobId, infos: blobs[blobId] }))
    )
  );
};

exports.hashtagView = ({ messages, hashtag }) => {
  return template(
    `#${hashtag}`,
    section(h1(`#${hashtag}`), p(i18n.hashtagDescription)),
    messages.map((msg) => post({ msg }))
  );
};

/** @param {{percent: number}} input */
exports.indexingView = ({ percent }) => {
  // TODO: i18n
  const message = `Oasis has only processed ${percent}% of the messages and needs to catch up. This page will refresh every 10 seconds. Thanks for your patience! ❤`;

  const nodes = html(
    { lang: "en" },
    head(
      title("Oasis"),
      link({ rel: "icon", type: "image/svg+xml", href: "/assets/favicon.svg" }),
      meta({ charset: "utf-8" }),
      meta({
        name: "description",
        content: i18n.oasisDescription,
      }),
      meta({
        name: "viewport",
        content: toAttributes({ width: "device-width", "initial-scale": 1 }),
      }),
      meta({ "http-equiv": "refresh", content: 10 })
    ),
    body(
      main(
        { id: "content" },
        p(message),
        progress({ value: percent, max: 100 })
      )
    )
  );

  const result = doctypeString + nodes.outerHTML;

  return result;
};

const walletViewRender = (balance, ...elements) => {
  return template(
    i18n.walletTitle,
    section(
      h1(i18n.walletTitle),
      p(i18n.walletDescription),
    ),
    section(
      div(
        {class: "div-center"},
        span(
          {class: "wallet-balance"},
          i18n.walletBalanceLine({ balance })
        ),
        span(
          { class: "form-button-group-center" },
          a({ href: "/wallet/send", class: "button-like-link" }, i18n.walletSend),
          a({ href: "/wallet/receive", class: "button-like-link" }, i18n.walletReceive),
          a({ href: "/wallet/history", class: "button-like-link" }, i18n.walletHistory),
        )
      ),
    ),
    elements.length > 0 ? section(...elements) : null
  )
};

exports.walletView = async (balance) => {
  return walletViewRender(balance)
}

exports.walletHistoryView = async (balance, transactions) => {
  return walletViewRender(
    balance,
    table(
      { class: "wallet-history" },
      thead(
        tr(
          { class: "full-center" },
          th({ class: "col-10" }, i18n.walletCnfrs),
          th(i18n.walletDate),
          th(i18n.walletType),
          th(i18n.walletAmount),
          th({ class: "col-30" }, i18n.walletTxId)
        )
      ),
      tbody(
        ...transactions.map((tx) => {
          const date = new Date(tx.time * 1000);
          const amount = Number(tx.amount);
          const fee = Number(tx.fee) || 0;
          const totalAmount = Number(amount + fee);

          return tr(
            td({ class: "full-center" }, tx.confirmations),
            td(date.toLocaleDateString(), br(), date.toLocaleTimeString()),
            td(tx.category),
            td(totalAmount.toFixed(2)),
            td({ width: "30%", class: "tcell-ellipsis" },
              a({
                href: `https://ecoin.03c8.net/blockexplorer/search?q=${tx.txid}`,
                target: "_blank",
              }, tx.txid)
            )
          )
        })
      )
    )
  )
}

exports.walletReceiveView = async (balance, address) => {
  const QRCode = require('qrcode');
  const qrImage = await QRCode.toString(address, { type: 'svg' });
  const qrContainer = address + qrImage

  return walletViewRender(
    balance,
    div(
      {class: 'div-center qr-code', innerHTML: qrContainer},
    ),
  )
}

exports.walletSendFormView = async (balance, destination, amount, fee, statusMessages) => {
  const { type, title, messages } = statusMessages || {};
  const statusBlock = div({ class: `wallet-status-${type}` },);

  if (messages?.length > 0) {
    statusBlock.appendChild(
      span(
        i18n.walletStatusMessages[title]
      )
    )
    statusBlock.appendChild(
      ul(
        ...messages.map(error => li(i18n.walletStatusMessages[error]))
      )
    )
  }

  return walletViewRender(
    balance,
    div(
      {class: "div-center"},
      messages?.length > 0 ? statusBlock : null,
      form(
        { action: '/wallet/send', method: 'POST' },
        label({ for: 'destination' }, i18n.walletAddress),
        input({ type: 'text', id: 'destination', name: 'destination', placeholder: 'ETQ17sBv8QFoiCPGKDQzNcDJeXmB2317HX', value: destination }),
        label({ for: 'amount' }, i18n.walletAmount),
        input({ type: 'text', id: 'amount', name: 'amount', placeholder: '0.25', value: amount }),
        label({ for: 'fee' }, i18n.walletFee),
        input({ type: 'text', id: 'fee', name: 'fee', placeholder: '0.01', value: fee }),
        input({ type: 'hidden', name: 'action', value: 'confirm' }),
        div({ class: 'form-button-group-center' },
          button({ type: 'submit' }, i18n.walletSend),
          button({ type: 'reset' }, i18n.walletReset)
        )
      )
    )
  )
}

exports.walletSendConfirmView = async (balance, destination, amount, fee) => {
  const totalCost = amount + fee;

  return walletViewRender(
    balance,
    p(
      i18n.walletAddressLine({ address: destination }), br(),
      i18n.walletAmountLine({ amount }), br(),
      i18n.walletFeeLine({ fee }), br(),
      i18n.walletTotalCostLine({ totalCost }),
    ),
    form(
      { action: '/wallet/send', method: 'POST' },
      input({ type: 'hidden', name: 'action', value: 'send' }),
      input({ type: 'hidden', name: 'destination', value: destination }),
      input({ type: 'hidden', name: 'amount', value: amount }),
      input({ type: 'hidden', name: 'fee', value: fee }),
      div({ class: 'form-button-group-center' },
        button({ type: 'submit' }, i18n.walletConfirm),
        a ({ href: `/wallet/send`, class: "button-like-link" }, i18n.walletBack),
      )
    ),
  )
}

exports.walletErrorView = async (error) => {
  return template(
    i18n.walletTitle,
    section(
      h1(i18n.walletTitle),
      p(i18n.walletDescription),
    ),
    section(
      h2(i18n.walletStatus),
      p(i18n.walletDisconnected),
    )
  )
}

exports.walletSendResultView = async (balance, destination, amount, txId) => {
  return walletViewRender(
    balance,
    p(
      i18n.walletSentToLine({ destination, amount }), br(),
      `${i18n.walletTransactionId}: `,
      a(
        {
          href: `https://ecoin.03c8.net/blockexplorer/search?q=${txId}`,
          target: "_blank",
        },
        txId
      ),
    ),
  )
}
