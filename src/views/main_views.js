"use strict";

const path = require("path");
const fs = require("fs");

const envPaths = require("../server/node_modules/env-paths");
const debug = require("../server/node_modules/debug")("oasis");
const highlightJs = require("../server/node_modules/highlight.js");
const prettyMs = require("../server/node_modules/pretty-ms");
const moment = require('../server/node_modules/moment');
const { renderUrl } = require('../backend/renderUrl');
const ssbClientGUI = require("../client/gui");
const config = require("../server/ssb_config");
const cooler = ssbClientGUI({ offline: config.offline });

let ssb, userId;

const getUserId = async () => {
  if (!ssb) ssb = await cooler.open();
  if (!userId) userId = ssb.id;
  return userId;
};

const { a, article, br, body, button, details, div, em, footer, form, h1, h2, h3, head, header, hr, html, img, input, label, li, link, main, meta, nav, option, p, pre, section, select, span, summary, textarea, title, tr, ul, strong } = require("../server/node_modules/hyperaxe");

const lodash = require("../server/node_modules/lodash");
const markdown = require("./markdown");

// set language
const i18nBase = require("../client/assets/translations/i18n");
let selectedLanguage = "en";
let i18n = {};
Object.assign(i18n, i18nBase[selectedLanguage]);
exports.setLanguage = (language) => {
  selectedLanguage = language;
  const newLang = i18nBase[selectedLanguage] || i18nBase['en'];
  Object.keys(i18n).forEach(k => delete i18n[k]);
  Object.assign(i18n, newLang);
};
exports.i18n = i18n;
exports.selectedLanguage = selectedLanguage;

// markdown
const markdownUrl = "https://commonmark.org/help/";

const doctypeString = "<!DOCTYPE html>";

const THREAD_PREVIEW_LENGTH = 3;
const toAttributes = (obj) =>
  Object.entries(obj)
    .map(([key, val]) => `${key}=${val}`)
    .join(", ");
    
const nbsp = "\xa0";

const { getConfig } = require('../configs/config-manager.js');

// menu INIT
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
  const popularMod = getConfig().modules.popularMod === 'on';
  if (popularMod) {
    return [
      navLink({ href: "/public/popular/day", emoji: "⌘", text: i18n.popular, class: "popular-link enabled" }),
      hr,
    ];
  }
  return ''; 
};

const renderTopicsLink = () => {
  const topicsMod = getConfig().modules.topicsMod === 'on';
  return topicsMod 
    ? navLink({ href: "/public/latest/topics", emoji: "ϟ", text: i18n.topics, class: "topics-link enabled" }) 
    : ''; 
};

const renderSummariesLink = () => {
  const summariesMod = getConfig().modules.summariesMod === 'on';
  if (summariesMod) {
    return [
     navLink({ href: "/public/latest/summaries", emoji: "※", text: i18n.summaries, class: "summaries-link enabled" }),
    ];
  }
  return ''; 
};

const renderLatestLink = () => {
  const latestMod = getConfig().modules.latestMod === 'on';
  return latestMod 
    ? navLink({ href: "/public/latest", emoji: "☄", text: i18n.latest, class: "latest-link enabled" }) 
    : ''; 
};

const renderThreadsLink = () => {
  const threadsMod = getConfig().modules.threadsMod === 'on';
  if (threadsMod) {
    return [
      navLink({ href: "/public/latest/threads", emoji: "♺", text: i18n.threads, class: "threads-link enabled" }),
    ];
  }
  return ''; 
};

const renderInvitesLink = () => {
  const invitesMod = getConfig().modules.invitesMod === 'on';
  return invitesMod 
    ? navLink({ href: "/invites", emoji: "ꔹ", text: i18n.invites, class: "invites-link enabled" }) 
    : ''; 
};

const renderWalletLink = () => {
  const walletMod = getConfig().modules.walletMod === 'on';
  if (walletMod) {
    return [
      navLink({ href: "/wallet", emoji: "❄", text: i18n.wallet, class: "wallet-link enabled" }),
    ];
  }
  return ''; 
};

const renderLegacyLink = () => {
  const legacyMod = getConfig().modules.legacyMod === 'on';
  if (legacyMod) {
    return [
      navLink({ href: "/legacy", emoji: "ꖤ", text: i18n.legacy, class: "legacy-link enabled" }),
    ];
  }
  return ''; 
};

const renderCipherLink = () => {
  const cipherMod = getConfig().modules.cipherMod === 'on';
  if (cipherMod) {
    return [
      navLink({ href: "/cipher", emoji: "ꗄ", text: i18n.cipher, class: "cipher-link enabled" }),
    ];
  }
  return ''; 
};

const renderBookmarksLink = () => {
  const bookmarksMod = getConfig().modules.bookmarksMod === 'on';
  if (bookmarksMod) {
    return [
      hr(),
      navLink({ href: "/bookmarks", emoji: "ꔪ", text: i18n.bookmarksLabel, class: "bookmark-link enabled" }),
    ];
  }
  return ''; 
};

const renderImagesLink = () => {
  const imagesMod = getConfig().modules.imagesMod === 'on';
  if (imagesMod) {
    return [
      navLink({ href: "/images", emoji: "ꕥ", text: i18n.imagesLabel, class: "images-link enabled" }),
    ];
  }
  return ''; 
};

const renderVideosLink = () => {
  const videosMod = getConfig().modules.videosMod === 'on';
  if (videosMod) {
    return [
      navLink({ href: "/videos", emoji: "ꗟ", text: i18n.videosLabel, class: "videos-link enabled" }),
    ];
  }
  return ''; 
};

const renderAudiosLink = () => {
  const audiosMod = getConfig().modules.audiosMod === 'on';
  if (audiosMod) {
    return [
      navLink({ href: "/audios", emoji: "ꔿ", text: i18n.audiosLabel, class: "audios-link enabled" }),
    ];
  }
  return ''; 
};

const renderDocsLink = () => {
  const docsMod = getConfig().modules.docsMod === 'on';
  if (docsMod) {
    return [
      navLink({ href: "/documents", emoji: "ꕨ", text: i18n.docsLabel, class: "docs-link enabled" }),
    ];
  }
  return ''; 
};

const renderTagsLink = () => {
  const tagsMod = getConfig().modules.tagsMod === 'on';
  return tagsMod 
    ? [
        navLink({ href: "/tags", emoji: "ꖶ", text: i18n.tagsLabel, class: "tags-link enabled" }) 
      ]
    : '';
};

const renderMultiverseLink = () => {
  const multiverseMod = getConfig().modules.multiverseMod === 'on';
  return multiverseMod 
    ? [
        hr,
        navLink({ href: "/public/latest/extended", emoji: "∞", text: i18n.multiverse, class: "multiverse-link enabled" }) 
      ]
    : '';
};

const renderMarketLink = () => {
  const marketMod = getConfig().modules.marketMod === 'on';
  return marketMod 
    ? [
      navLink({ href: "/market", emoji: "ꕻ", text: i18n.marketTitle }),
      ]
    : '';
};

const renderJobsLink = () => {
  const jobsMod = getConfig().modules.jobsMod === 'on';
  return jobsMod 
    ? [
      navLink({ href: "/jobs", emoji: "ꗒ", text: i18n.jobsTitle }),
      ]
    : '';
};

const renderProjectsLink = () => {
  const projectsMod = getConfig().modules.projectsMod === 'on';
  return projectsMod 
    ? [
      navLink({ href: "/projects", emoji: "ꕧ", text: i18n.projectsTitle }),
      ]
    : '';
};

const renderBankingLink = () => {
  const bankingMod = getConfig().modules.bankingMod === 'on';
  return bankingMod 
    ? [
      hr(),
      navLink({ href: "/banking", emoji: "ꗴ", text: i18n.bankingTitle }),
      ]
    : '';
};

const renderTribesLink = () => {
  const tribesMod = getConfig().modules.tribesMod === 'on';
  return tribesMod 
    ? [
        navLink({ href: "/tribes", emoji: "ꖥ", text: i18n.tribesTitle, class: "tribes-link enabled" }),
      ]
    : '';
};

const renderParliamentLink = () => {
  const parliamentMod = getConfig().modules.parliamentMod === 'on';
  return parliamentMod 
    ? [
        navLink({ href: "/parliament", emoji: "ꗞ", text: i18n.parliamentTitle, class: "parliament-link enabled" }),
      ]
    : '';
};

const renderCourtsLink = () => {
  const courtsMod = getConfig().modules.courtsMod === 'on';
  return courtsMod 
    ? [
        navLink({ href: "/courts", emoji: "ꖻ", text: i18n.courtsTitle, class: "courts-link enabled" }),
        hr(),
      ]
    : '';
};

const renderVotationsLink = () => {
  const votesMod = getConfig().modules.votesMod === 'on';
  return votesMod 
    ? [
       navLink({ href: "/votes", emoji: "ꔰ", text: i18n.votationsTitle, class: "votations-link enabled" }),
      ]
    : '';
};

const renderTrendingLink = () => {
  const trendingMod = getConfig().modules.trendingMod === 'on';
  return trendingMod 
    ? [
        navLink({ href: "/trending", emoji: "ꗝ", text: i18n.trendingLabel, class: "trending-link enabled" }),
      ]
    : '';
};

const renderReportsLink = () => {
  const reportsMod = getConfig().modules.reportsMod === 'on';
  return reportsMod 
    ? [
       navLink({ href: "/reports", emoji: "ꕥ", text: i18n.reportsTitle, class: "reports-link enabled" }),
      ]
    : '';
};

const renderOpinionsLink = () => {
  const opinionsMod = getConfig().modules.opinionsMod === 'on';
  return opinionsMod 
    ? [
      navLink({ href: "/opinions", emoji: "ꔍ", text: i18n.opinionsTitle, class: "opinions-link enabled" }),
      ]
    : '';
};

const renderTransfersLink = () => {
  const transfersMod = getConfig().modules.transfersMod === 'on';
  return transfersMod 
    ? [
      navLink({ href: "/transfers", emoji: "ꘉ", text: i18n.transfersTitle, class: "transfers-link enabled" }),
      ]
    : '';
};

const renderFeedLink = () => {
  const feedMod = getConfig().modules.feedMod === 'on';
  return feedMod 
    ? [
      hr(),
      navLink({ href: "/feed", emoji: "ꕿ", text: i18n.feedTitle, class: "feed-link enabled" }),
      ]
    : '';
};

const renderPixeliaLink = () => {
  const pixeliaMod = getConfig().modules.pixeliaMod === 'on';
  return pixeliaMod 
    ? [
     navLink({ href: "/pixelia", emoji: "ꔘ", text: i18n.pixeliaTitle, class: "pixelia-link enabled" }),
      ]
    : '';
};

const renderForumLink = () => {
  const forumMod = getConfig().modules.forumMod === 'on';
  return forumMod 
    ? [
     navLink({ href: "/forum", emoji: "ꕒ", text: i18n.forumTitle, class: "forum-link enabled" }),
      ]
    : '';
};

const renderAgendaLink = () => {
  const agendaMod = getConfig().modules.agendaMod === 'on';
  return agendaMod 
    ? [
      navLink({ href: "/agenda", emoji: "ꗤ", text: i18n.agendaTitle, class: "agenda-link enabled" }),
      ]
    : '';
};

const renderAILink = () => {
  const aiMod = getConfig().modules.aiMod === 'on';
  return aiMod 
    ? [
      navLink({ href: "/ai", emoji: "ꘜ", text: i18n.ai, class: "ai-link enabled" }),
      ]
    : '';
};

const renderEventsLink = () => {
  const eventsMod = getConfig().modules.eventsMod === 'on';
  return eventsMod 
    ? [
        navLink({ href: "/events", emoji: "ꕆ", text: i18n.eventsLabel, class: "events-link enabled" }),
      ]
    : '';
};

const renderTasksLink = () => {
  const tasksMod = getConfig().modules.tasksMod === 'on';
  return tasksMod 
    ? [
        navLink({ href: "/tasks", emoji: "ꖧ", text: i18n.tasksTitle, class: "tasks-link enabled" }),     
      ]
    : '';
};

const template = (titlePrefix, ...elements) => {
  const currentConfig = getConfig();
  const theme = currentConfig.themes.current || "Dark-SNH";
  const themeLink = link({
    rel: "stylesheet",
    href: `/assets/themes/${theme}.css`
  });
  const nodes = html(
    { lang: "en" },
    head(
      title(titlePrefix, " | Oasis"),
      link({ rel: "stylesheet", href: "/assets/styles/style.css" }),
      themeLink,
      link({ rel: "icon", href: "/assets/images/favicon.svg" }),
      meta({ charset: "utf-8" }),
      meta({ name: "description", content: i18n.oasisDescription }),
      meta({ name: "viewport", content: toAttributes({ width: "device-width", "initial-scale": 1 }) })
    ),
    body(
      div(
        { class: "header" },
        div(
          { class: "top-bar-left" },
          a({ class: "logo-icon", href: "/" },
            img({ class: "logo-icon", src: "/assets/images/snh-oasis.jpg", alt: "Oasis Logo" })
          ),
          nav(
            ul(
              navLink({ href: "/profile", emoji: "⚉", text: i18n.profile }),
              navLink({ href: "/cv", emoji: "ꕛ", text: i18n.cvTitle }),
              renderLegacyLink(),            
              renderWalletLink(),
              navLink({ href: "/peers", emoji: "⧖", text: i18n.peers }),
              renderInvitesLink(),
              navLink({ href: "/modules", emoji: "ꗣ", text: i18n.modules }),
              navLink({ href: "/settings", emoji: "⚙", text: i18n.settings })
            )
          ),
        ),
        div(
          { class: "top-bar-right" },
          nav(
            ul(
             renderCipherLink(),
             navLink({ href: "/pm", emoji: "ꕕ", text: i18n.privateMessage }),
             navLink({ href: "/publish", emoji: "❂", text: i18n.publish }),
             renderAILink(),
             renderTagsLink(),
             navLink({ href: "/search", emoji: "ꔅ", text: i18n.searchTitle })
             )
          ),
        )
      ),
      div(
        { class: "main-content" },
        div(
          { class: "sidebar-left" },
          nav(
            ul(
              navLink({ href: "/mentions", emoji: "✺", text: i18n.mentions }),
              navLink({ href: "/inbox", emoji: "☂", text: i18n.inbox }),
              renderAgendaLink(),
              navLink({ href: "/stats", emoji: "ꕷ", text: i18n.statistics }),
              navLink({ href: "/blockexplorer", emoji: "ꖸ", text: i18n.blockchain }),
              hr,
              renderLatestLink(),
              renderThreadsLink(),
              renderTopicsLink(),
              renderSummariesLink(),
              renderPopularLink(),
              navLink({ href: "/inhabitants", emoji: "ꖘ", text: i18n.inhabitantsLabel }),
              renderTribesLink(),
              renderParliamentLink(),
              renderCourtsLink(),
              renderVotationsLink(),
              renderEventsLink(),
              renderTasksLink(),
              renderReportsLink(),
              renderMultiverseLink()
            )
          )
        ),
        main({ id: "content", class: "main-column" }, elements),
        div(
          { class: "sidebar-right" },
          nav(
            ul(
              navLink({ href: "/activity", emoji: "ꔙ", text: i18n.activityTitle }),
              renderTrendingLink(),
              renderOpinionsLink(),
              renderForumLink(),
              renderFeedLink(),
              renderPixeliaLink(),
              renderBankingLink(),
              renderMarketLink(),
              renderProjectsLink(),
              renderJobsLink(),
              renderTransfersLink(),
              renderBookmarksLink(),
              renderImagesLink(),
              renderVideosLink(),
              renderAudiosLink(),
              renderDocsLink(),
            )
          )
        ),
      )
    )
  );
  return doctypeString + nodes.outerHTML;
};
// menu END

exports.template = template;

const thread = (messages) => {
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
      if (msg === undefined) return 0;
      return lodash.get(msg, "value.meta.thread.depth", 0);
    };

    msgList.push(post({ msg: currentMsg }));

    if (depth(currentMsg) < depth(nextMsg)) {
      const isAncestor = Boolean(
        lodash.get(currentMsg, "value.meta.thread.ancestorOfTarget", false)
      );
      const isBlocked = Boolean(nextMsg.value.meta.blocking);
      const nextAuthor = lodash.get(nextMsg, "value.meta.author.name");
      const nextSnippet = postSnippet(
        lodash.has(nextMsg, "value.content.contentWarning")
          ? lodash.get(nextMsg, "value.content.contentWarning")
          : lodash.get(nextMsg, "value.content.text")
      );
      msgList.push(
        details(
          isAncestor ? { open: true } : {},
          summary(
            isBlocked
              ? i18n.relationshipBlockingPost
              : `${nextAuthor}: ${nextSnippet}`
          )
        )
      );
    } else if (depth(currentMsg) > depth(nextMsg)) {
      const diffDepth = depth(currentMsg) - depth(nextMsg);
    }
  }

  return div({ class: "thread-container" }, ...msgList);
};

const postSnippet = (text) => {
  const max = 40;

  text = text.trim().split("\n", 3).join("\n");
  text = text.replace(/_|`|\*|#|^\[@.*?]|\[|]|\(\S*?\)/g, "").trim();
  text = text.replace(/:$/, "");
  text = text.trim().split("\n", 1)[0].trim();

  if (text.length > max) {
    text = text.substring(0, max - 1) + "…";
  }

  return text;
};

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

  return fragments;
};

const post = ({ msg, aside = false, preview = false }) => {
  const encoded = {
    key: encodeURIComponent(msg.key),
    author: encodeURIComponent(msg.value?.author),
    parent: encodeURIComponent(msg.value?.content?.root),
  };

  const url = {
    author: `/author/${encoded.author}`,
    likeForm: `/like/${encoded.key}`,
    link: `/thread/${encoded.key}#${encoded.key}`,
    parent: `/thread/${encoded.parent}#${encoded.parent}`,
    avatar: msg.value?.meta?.author?.avatar?.url || '/assets/images/default-avatar.png',
    json: `/json/${encoded.key}`,
    subtopic: `/subtopic/${encoded.key}`,
    comment: `/comment/${encoded.key}`,
  };

  const isPrivate = Boolean(msg.value?.meta?.private); 
  const isBlocked = Boolean(msg.value?.meta?.blocking);
  const isRoot = msg.value?.content?.root == null;
  const isFork = msg.value?.meta?.postType === "subtopic";
  const hasContentWarning = typeof msg.value?.content?.contentWarning === "string";
  const isThreadTarget = Boolean(lodash.get(msg, "value.meta.thread.target", false));

  const { name } = msg.value?.meta?.author || { name: "Anonymous" };

  const markdownContent = msg.value?.content?.text;
  const emptyContent = "<p>undefined</p>\n";
  const articleElement =
    markdownContent === emptyContent
      ? article(
          { class: "content" },
          pre({
            innerHTML: highlightJs.highlight(
              JSON.stringify(msg, null, 2),
              { language: "json", ignoreIllegals: true }
            ).value,
          })
        )
      : article({ class: "content", innerHTML: markdownContent });

  if (preview) {
    return section(
      { id: msg.key, class: "post-preview" },
      hasContentWarning
        ? details(summary(msg.value?.content?.contentWarning), articleElement)
        : articleElement
    );
  }

  const ts_received = msg.value?.meta?.timestamp?.received;

  if (!ts_received || !ts_received.iso8601 || !moment(ts_received.iso8601, moment.ISO_8601, true).isValid()) {
    return null;
  }

  const validTimestamp = moment(ts_received.iso8601, moment.ISO_8601);
  const timeAgo = validTimestamp.fromNow();
  const timeAbsolute = validTimestamp.toISOString().split(".")[0].replace("T", " ");

  const likeButton = msg.value?.meta?.voted
    ? { value: 0, class: "liked" }
    : { value: 1, class: null };

  const likeCount = msg.value?.meta?.votes?.length || 0;
  const maxLikedNameLength = 16;
  const maxLikedNames = 16;

  const likedByNames = msg.value?.meta?.votes
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
    recpsInfo.forEach((recp) => {
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
    addRecps(msg.value?.meta?.recpsInfo || []);
  }

  if (isThreadTarget) {
    messageClasses.push("thread-target");
  }

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

  const postOptions = {
    post: null,
    comment: i18n.commentDescription({ parentUrl: url.parent }),
    subtopic: i18n.subtopicDescription({ parentUrl: url.parent }),
    mystery: i18n.mysteryDescription,
  };

  const articleContent = article(
    { class: "content" },
    hasContentWarning ? div({ class: "post-subject" }, msg.value?.content?.contentWarning) : null,
    articleElement
  );

  const fragment = section(
    {
      id: msg.key,
      class: messageClasses.join(" "),
    },
    header(
      div(
        { class: "header-content" },
        a(
          { href: url.author },
          img({ class: "avatar-profile", src: url.avatar, alt: "" })
        ),
        span({ class: "created-at" }, `${i18n.createdBy} `, a({ href: url.author }, "@", name), ` | ${timeAbsolute} | ${i18n.sendTime} `, a({ href: url.link }, timeAgo), ` ${i18n.timeAgo}`),
        isPrivate ? "🔒" : null,
        isPrivate ? recps : null
      )
    ),
    articleContent,
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
          : a({ href: url.subtopic }, nbsp, i18n.subtopic)
      ),
      br()
    )
  );

  const threadSeparator = [br()];

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
          br,
          input({ type: "file", name: "image", accept: "image/*" })
        ),
        br,br,
        label(i18n.profileName, 
        br,
        input({ name: "name", value: name })),
        br,br,
        label(
          i18n.profileDescription,
          br,
          textarea(
            {
              autofocus: true,
              name: "description",
              rows: "6",
            },
            description
          )
        ),
        br,
        button(
          {
            type: "submit",
          },
          i18n.submit
        )
      )
    )
  );

exports.authorView = ({
  avatarUrl,
  description,
  feedId,
  messages,
  firstPost,
  lastPost,
  name,
  relationship,
  ecoAddress,
  karmaScore = 0,
  lastActivityBucket
}) => {
  const mention = `[@${name}](${feedId})`;
  const markdownMention = highlightJs.highlight(mention, { language: "markdown", ignoreIllegals: true }).value;

  const contactForms = [];
  const addForm = ({ action }) =>
    contactForms.push(
      form(
        { action: `/${action}/${encodeURIComponent(feedId)}`, method: "post" },
        button({ type: "submit" }, i18n[action])
      )
    );

  if (relationship.me === false) {
    if (relationship.following) addForm({ action: "unfollow" });
    else if (relationship.blocking) addForm({ action: "unblock" });
    else { addForm({ action: "follow" }); addForm({ action: "block" }) }
  }

  const relationshipMessage = (() => {
    if (relationship.me) return i18n.relationshipYou;
    const following = relationship.following === true;
    const followsMe = relationship.followsMe === true;
    if (following && followsMe) return i18n.relationshipMutuals;
    const messagesArr = [];
    messagesArr.push(following ? i18n.relationshipFollowing : i18n.relationshipNone);
    messagesArr.push(followsMe ? i18n.relationshipTheyFollow : i18n.relationshipNotFollowing);
    return messagesArr.join(". ") + ".";
  })();

  const bucket = lastActivityBucket || 'red';
  const dotClass = bucket === "green" ? "green" : bucket === "orange" ? "orange" : "red";

  const prefix = section(
    { class: "message" },
    div(
      { class: "profile" },
      div({ class: "avatar-container" },
        img({ class: "inhabitant-photo-details", src: avatarUrl }),
        h1({ class: "name" }, name),
      ),
      pre({ class: "md-mention", innerHTML: markdownMention }),
      p(a({ class: "user-link", href: `/author/${encodeURIComponent(feedId)}` }, feedId)),
      div({ class: "profile-metrics" },
        p(`${i18n.bankingUserEngagementScore}: `, strong(karmaScore !== undefined ? karmaScore : 0)),
        div({ class: "inhabitant-last-activity" },
          span({ class: "label" }, `${i18n.inhabitantActivityLevel}:`),
          span({ class: `activity-dot ${dotClass}` }, "")
        ),
        ecoAddress
          ? div({ class: "eco-wallet" }, p(`${i18n.bankWalletConnected}: `, strong(ecoAddress)))
          : div({ class: "eco-wallet" }, p(i18n.ecoWalletNotConfigured || "ECOin Wallet not configured"))
      )
    ),
    description !== "" ? article({ innerHTML: markdown(description) }) : null,
    footer(
      div(
        { class: "profile" },
        ...contactForms.map(form => span({ style: "font-weight: bold;" }, form)),
        relationship.me
          ? span({ class: "status you" }, i18n.relationshipYou)
          : div({ class: "relationship-status" },
              relationship.blocking && relationship.blockedBy
                ? span({ class: "status blocked" }, i18n.relationshipMutualBlock)
                : [
                    relationship.blocking ? span({ class: "status blocked" }, i18n.relationshipBlocking) : null,
                    relationship.blockedBy ? span({ class: "status blocked-by" }, i18n.relationshipBlockedBy) : null,
                    relationship.following && relationship.followsMe
                      ? span({ class: "status mutual" }, i18n.relationshipMutuals)
                      : [
                          span({ class: "status supporting" }, relationship.following ? i18n.relationshipFollowing : i18n.relationshipNone),
                          span({ class: "status supported-by" }, relationship.followsMe ? i18n.relationshipTheyFollow : i18n.relationshipNotFollowing)
                        ]
                  ]
            ),
        relationship.me ? a({ href: `/profile/edit`, class: "btn" }, nbsp, i18n.editProfile) : null,
        a({ href: `/likes/${encodeURIComponent(feedId)}`, class: "btn" }, i18n.viewLikes),
        !relationship.me ? a({ href: `/pm?recipients=${encodeURIComponent(feedId)}`, class: "btn" }, i18n.pmCreateButton) : null
      )
    )
  );

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

    const newerPostsLink = a(
      {
        href:
          lastPost !== undefined && highestSeqNum < lastPost.value.sequence
            ? `${linkUrl}?gt=${highestSeqNum}`
            : "#",
        class:
          lastPost !== undefined && highestSeqNum < lastPost.value.sequence
            ? "btn"
            : "btn disabled",
        "aria-disabled":
          lastPost === undefined || highestSeqNum >= lastPost.value.sequence
      },
      i18n.newerPosts
    );

    const olderPostsLink = a(
      {
        href:
          lowestSeqNum > firstPost.value.sequence
            ? `${linkUrl}?lt=${lowestSeqNum}`
            : "#",
        class:
          lowestSeqNum > firstPost.value.sequence
            ? "btn"
            : "btn disabled",
        "aria-disabled": !(lowestSeqNum > firstPost.value.sequence)
      },
      i18n.olderPosts
    );

    const pagination = section(
      { class: "message" },
      footer(div(newerPostsLink, olderPostsLink), br())
    );

    items.unshift(pagination);
    items.push(pagination);
  }

  return template(i18n.profile, prefix, items);
}

exports.previewCommentView = async ({
  previewData,
  messages,
  myFeedId,
  parentMessage,
  contentWarning,
}) => {
  if (!parentMessage || !parentMessage.value) {
    throw new Error("Missing parentMessage or value");
  }

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
  const authorName = parentMessage?.value?.meta?.author?.name || "Anonymous";
  
  const messageElements = await Promise.all(
    messages.reverse().map(async (message) => {  
      const isRootMessage = message.key === parentMessage.key;
      const messageAuthorName = message.value?.meta?.author?.name || "Anonymous";
      const authorFeedId = myFeedId;
      
      if (authorFeedId !== myFeedId) {
        if (message.key === parentMessage.key) {
          const x = `[@${messageAuthorName}](${authorFeedId})\n\n`;
          markdownMention = x;
        }
      }
      const timestamp = message?.value?.meta?.timestamp?.received;
      const validTimestamp = moment(timestamp, moment.ISO_8601, true); 
      const timeAgo = validTimestamp.isValid() 
        ? validTimestamp.fromNow() 
        : "Invalid time"; 
      const messageId = message.key.endsWith('.sha256') ? message.key.slice(0, -7) : message.key;
      const result = await post({ msg: { ...message, key: messageId } });
      return result; 
    })
  );

  const action = `/comment/preview/${encodeURIComponent(messages[0].key)}`;
  const method = "post";
  const isPrivate = parentMessage?.value?.meta?.private;
  const publicOrPrivate = isPrivate ? i18n.commentPrivate : i18n.commentPublic;
  const maybeSubtopicText = isPrivate ? [null] : i18n.commentWarning;

  return template(
    i18n.commentTitle({ authorName }),
    div({ class: "thread-container" }, messageElements),
    form(
      { action, method, enctype: "multipart/form-data" },
      i18n.blogSubject,
      br,
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
      br,
      label({ for: "text" }, i18n.blogMessage),
      br,
      textarea(
        {
          autofocus: true,
          required: true,
          name: "text",
          rows: "6",
          cols: "50",
          placeholder: i18n.publishWarningPlaceholder,
        },
        text ? text : isPrivate ? null : markdownMention
      ),
      br,
      label(
        { for: "blob" },
        i18n.blogImage || "Upload Image (jpeg, jpg, png, gif) (max-size: 500px x 400px)"
      ),
      input({ type: "file", id: "blob", name: "blob" }),
      br,
      br,
      button({ type: "submit" }, i18n.blogPublish)
    ),
    preview ? div({ class: "comment-preview" }, preview) : ""
  );
};

const renderMessage = (msg) => {
  const content = lodash.get(msg, "value.content", {});
  const author = msg.value.author || "Anonymous";
  const createdAt = new Date(msg.value.timestamp).toLocaleString();
  const mentionsText = content.text || '';

  return div({ class: "mention-item" }, [
    div({ class: "mention-content", innerHTML: mentionsText || '[No content]' }),
    p(a({ class: 'user-link', href: `/author/${encodeURIComponent(author)}` }, author)),
    p(`${i18n.createdAtLabel || i18n.mentionsCreatedAt}: ${createdAt}`)
  ]);
};

exports.mentionsView = ({ messages, myFeedId }) => {
  const title = i18n.mentions;
  const description = i18n.mentionsDescription;
  if (!Array.isArray(messages) || messages.length === 0) {
    return template(
      title,
      section(
        div({ class: "tags-header" },
          h2(title),
          p(description)
        )
      ),
      section(
        div({ class: "mentions-list" },
          p({ class: "empty" }, i18n.noMentions)
        )
      )
    );
  }
  const filteredMessages = messages.filter(msg => {
    const mentions = lodash.get(msg, "value.content.mentions", {});
    return Object.keys(mentions).some(key => mentions[key].link === myFeedId);
  });
  if (filteredMessages.length === 0) {
    return template(
      title,
      section(
        div({ class: "tags-header" },
          h2(title),
          p(description)
        )
      ),
      section(
        div({ class: "mentions-list" },
          p({ class: "empty" }, i18n.noMentions)
        )
      )
    );
  }
  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(title),
        p(description)
      )
    ),
    section(
      div({ class: "mentions-list" },
        filteredMessages.map(renderMessage) 
      )
    )
  );
};

exports.privateView = async (messagesInput, filter) => {
  const messagesRaw = Array.isArray(messagesInput) ? messagesInput : messagesInput.messages
  const messages = (messagesRaw || []).filter(m => m && m.key && m.value && m.value.content && m.value.content.type === 'post' && m.value.content.private === true)
  const userId = await getUserId()

  const isSent = m => (m?.value?.author === userId) || (m?.value?.content?.from === userId)
  const isToUser = m => Array.isArray(m?.value?.content?.to) && m.value.content.to.includes(userId)

  const linkAuthor = (id) =>
    a({ class: 'user-link', href: `/author/${encodeURIComponent(id)}` }, id)

  const hrefFor = {
    job: (id) => `/jobs/${encodeURIComponent(id)}`,
    project: (id) => `/projects/${encodeURIComponent(id)}`,
    market: (id) => `/market/${encodeURIComponent(id)}`
  }

  const clickableCardProps = (href, extraClass = '') => {
    const props = { class: `pm-card ${extraClass}` }
    if (href) {
      props.onclick = `window.location='${href}'`
      props.tabindex = 0
      props.onkeypress = `if(event.key==='Enter') window.location='${href}'`
    }
    return props
  }

  const chip = (txt) => span({ class: 'chip' }, txt)

  function headerLine({ sentAt, from, toLinks, textLen }) {
    return div({ class: 'pm-header' },
      span({ class: 'date-link' }, `${moment(sentAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed}`),
      span({ class: 'pm-from' }, ' ', i18n.pmFromLabel, ' ', linkAuthor(from)),
      span({ class: 'pm-to' }, ' ', '→', ' ', i18n.pmToLabel, ' ', toLinks)
    )
  }

  function actions({ key, replyId, subjectRaw, text }) {
    const stop = { onclick: 'event.stopPropagation()' }
    const subjectReply = /^(\s*RE:\s*)/i.test(subjectRaw || '') ? (subjectRaw || '') : `RE: ${subjectRaw || ''}`
    return div({ class: 'pm-actions' },
      form({ method: 'GET', action: '/pm', class: 'pm-action-form', ...stop },
        input({ type: 'hidden', name: 'recipients', value: replyId }),
        input({ type: 'hidden', name: 'subject', value: subjectReply }),
        input({ type: 'hidden', name: 'quote', value: text || '' }),
        button({ type: 'submit', class: 'pm-btn reply-btn' }, i18n.pmReply.toUpperCase())
      ),
      form({ method: 'POST', action: `/inbox/delete/${encodeURIComponent(key)}`, class: 'pm-action-form', ...stop },
        button({ type: 'submit', class: 'pm-btn delete-btn' }, i18n.privateDelete.toUpperCase())
      )
    )
  }

  function canonicalSubject(s) {
    return (s || '').replace(/^\s*(RE:\s*)+/i, '').trim()
  }

  function participantsKey(m) {
    const c = m?.value?.content || {}
    const set = new Set([m?.value?.author, ...(Array.isArray(c.to) ? c.to : [])])
    return Array.from(set).sort().join('|')
  }

  function threadId(m) {
    return canonicalSubject(m?.value?.content?.subject || '') + '||' + participantsKey(m)
  }

  function threadLevel(s) {
    const m = (s || '').match(/RE:/gi)
    return m ? Math.min(m.length, 8) : 0
  }

  function quoted(str) {
    const m = str.match(/"([^"]+)"/)
    return m ? m[1] : ''
  }

  function pickLink(str, kind) {
    if (kind === 'job') {
      const m = str.match(/\/jobs\/([%A-Za-z0-9/+._=-]+\.sha256)/)
      return m ? m[1] : ''
    }
    if (kind === 'project') {
      const m = str.match(/\/projects\/([%A-Za-z0-9/+._=-]+\.sha256)/)
      return m ? m[1] : ''
    }
    if (kind === 'market') {
      const m = str.match(/\/market\/([%A-Za-z0-9/+._=-]+\.sha256)/)
      return m ? m[1] : ''
    }
    return ''
  }

  function clickableLinks(str) {
    return str
      .replace(/(@[a-zA-Z0-9/+._=-]+\.ed25519)/g, (match, id) => `<a class="user-link" href="/author/${encodeURIComponent(id)}">${match}</a>`)
      .replace(/\/jobs\/([%A-Za-z0-9/+._=-]+\.sha256)/g, (match, id) => `<a class="job-link" href="${hrefFor.job(id)}">${match}</a>`)
      .replace(/\/projects\/([%A-Za-z0-9/+._=-]+\.sha256)/g, (match, id) => `<a class="project-link" href="${hrefFor.project(id)}">${match}</a>`)
      .replace(/\/market\/([%A-Za-z0-9/+._=-]+\.sha256)/g, (match, id) => `<a class="market-link" href="${hrefFor.market(id)}">${match}</a>`)
  }

  const threads = {}
  for (const m of messages) {
    const tid = threadId(m)
    if (!threads[tid]) threads[tid] = []
    threads[tid].push(m)
  }

  const inboxSet = new Set()
  for (const arr of Object.values(threads)) {
    const hasInbound = arr.some(isToUser)
    if (hasInbound) for (const m of arr) inboxSet.add(m)
  }

  const data =
    filter === 'sent' ? messages.filter(isSent) :
    filter === 'inbox' ? Array.from(inboxSet) :
    messages

  const inboxCount = Array.from(inboxSet).length
  const sentCount = messages.filter(isSent).length

  const sorted = [...data].sort((a, b) => {
    const ta = threadId(a)
    const tb = threadId(b)
    if (ta < tb) return -1
    if (ta > tb) return 1
    const sa = new Date(a?.value?.content?.sentAt || a.timestamp || 0).getTime()
    const sb = new Date(b?.value?.content?.sentAt || b.timestamp || 0).getTime()
    return sa - sb
  })

  function JobCard({ type, sentAt, from, toLinks, text, key }) {
    const isSub = type === 'JOB_SUBSCRIBED'
    const icon = isSub ? '🟡' : '🟠'
    const titleH = isSub ? (i18n.inboxJobSubscribedTitle || 'New subscription to your job offer') : (i18n.inboxJobUnsubscribedTitle || 'Unsubscription from your job offer')
    const jobTitle = quoted(text) || 'job'
    const jobId = pickLink(text, 'job')
    const href = jobId ? hrefFor.job(jobId) : null
    return div(
      clickableCardProps(href, `job-notification thread-level-0`),
      headerLine({ sentAt, from, toLinks, textLen: text.length }),
      h2({ class: 'pm-title' }, `${icon} ${i18n.pmBotJobs} · ${titleH}`),
      p(
        i18n.pmInhabitantWithId, ' ',
        linkAuthor(from), ' ',
        isSub ? i18n.pmHasSubscribedToYourJobOffer : (i18n.pmHasUnsubscribedFromYourJobOffer || 'has unsubscribed from your job offer'),
        ' ',
        href ? a({ class: 'job-link', href }, `"${jobTitle}"`) : `"${jobTitle}"`
      ),
      actions({ key, replyId: from, subjectRaw: jobTitle, text })
    )
  }

  function ProjectFollowCard({ type, sentAt, from, toLinks, text, key }) {
    const isFollow = type === 'PROJECT_FOLLOWED'
    const icon = isFollow ? '🔔' : '🔕'
    const titleH = isFollow
      ? (i18n.inboxProjectFollowedTitle || 'New follower of your project')
      : (i18n.inboxProjectUnfollowedTitle || 'Unfollowed your project')
    const projectTitle = quoted(text) || 'project'
    const projectId = pickLink(text, 'project')
    const href = projectId ? hrefFor.project(projectId) : null
    return div(
      clickableCardProps(href, `project-${isFollow ? 'follow' : 'unfollow'}-notification thread-level-0`),
      headerLine({ sentAt, from, toLinks, textLen: text.length }),
      h2({ class: 'pm-title' }, `${icon} ${i18n.pmBotProjects} · ${titleH}`),
      p(
        i18n.pmInhabitantWithId, ' ',
        a({ class: 'user-link', href: `/author/${encodeURIComponent(from)}` }, from),
        ' ',
        isFollow ? (i18n.pmHasFollowedYourProject || 'has followed your project') : (i18n.pmHasUnfollowedYourProject || 'has unfollowed your project'),
        ' ',
        href ? a({ class: 'project-link', href }, `"${projectTitle}"`) : `"${projectTitle}"`
      ),
      actions({ key, replyId: from, subjectRaw: projectTitle, text })
    )
  }

  function MarketSoldCard({ sentAt, from, toLinks, subject, text, key }) {
    const itemTitle = quoted(subject) || quoted(text) || 'item'
    const buyerId = (text.match(/OASIS ID:\s*([\w=/+.-]+)/) || [])[1] || from
    const price = (text.match(/for:\s*\$([\d.]+)/) || [])[1] || ''
    const marketId = pickLink(text, 'market')
    const href = marketId ? hrefFor.market(marketId) : null
    return div(
      clickableCardProps(href, 'market-sold-notification thread-level-0'),
      headerLine({ sentAt, from, toLinks, textLen: text.length }),
      h2({ class: 'pm-title' }, `💰 ${i18n.pmBotMarket} · ${i18n.inboxMarketItemSoldTitle}`),
      p(
        i18n.pmYourItem, ' ',
        href ? a({ class: 'market-link', href }, `"${itemTitle}"`) : `"${itemTitle}"`,
        ' ',
        i18n.pmHasBeenSoldTo, ' ',
        linkAuthor(buyerId),
        price ? ` ${i18n.pmFor} $${price}.` : '.'
      ),
      actions({ key, replyId: buyerId, subjectRaw: itemTitle, text })
    )
  }

  function ProjectPledgeCard({ sentAt, from, toLinks, content, text, key }) {
    const amount = content.meta?.amount ?? (text.match(/pledged\s+([\d.]+)/)?.[1] || '0')
    const projectTitle = content.meta?.projectTitle ?? (text.match(/project\s+"([^"]+)"/)?.[1] || 'project')
    const projectId = content.meta?.projectId ?? pickLink(text, 'project')
    const href = projectId ? hrefFor.project(projectId) : null
    return div(
      clickableCardProps(href, 'project-pledge-notification thread-level-0'),
      headerLine({ sentAt, from, toLinks, textLen: text.length }),
      h2({ class: 'pm-title' }, `💚 ${i18n.pmBotProjects} · ${i18n.inboxProjectPledgedTitle}`),
      p(
        i18n.pmInhabitantWithId, ' ',
        linkAuthor(from), ' ',
        i18n.pmHasPledged, ' ',
        chip(`${amount} ECO`), ' ',
        i18n.pmToYourProject, ' ',
        href ? a({ class: 'project-link', href }, `"${projectTitle}"`) : `"${projectTitle}"`
      ),
      actions({ key, replyId: from, subjectRaw: projectTitle, text })
    )
  }

  return template(
    i18n.private,
    section(
      div({ class: 'tags-header' },
        h2(i18n.private),
        p(i18n.privateDescription)
      ),
      div({ class: 'filters' },
        form({ method: 'GET', action: '/inbox' }, [
          button({
            type: 'submit',
            name: 'filter',
            value: 'inbox',
            class: filter === 'inbox' ? 'filter-btn active' : 'filter-btn'
          }, `${i18n.privateInbox} (${inboxCount})`),
          button({
            type: 'submit',
            name: 'filter',
            value: 'sent',
            class: filter === 'sent' ? 'filter-btn active' : 'filter-btn'
          }, `${i18n.privateSent} (${sentCount})`),
          button({
            type: 'submit',
            name: 'filter',
            value: 'create',
            class: 'create-button',
            formaction: '/pm',
            formmethod: 'GET'
          }, i18n.pmCreateButton)
        ])
      ),
      div({ class: 'message-list' },
        sorted.length
          ? sorted.map(msg => {
              const content = msg.value.content
              const author = msg.value.author
              const subjectRaw = content.subject || ''
              const subjectU = subjectRaw.toUpperCase()
              const text = content.text || ''
              const sentAt = new Date(content.sentAt || msg.timestamp)
              const fromResolved = content.from || author
              const toLinks = Array.isArray(content.to) ? content.to.map(addr => linkAuthor(addr)) : []
              const level = threadLevel(subjectRaw)

              if (subjectU === 'JOB_SUBSCRIBED' || subjectU === 'JOB_UNSUBSCRIBED') {
                return JobCard({ type: subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key })
              }
              if (subjectU === 'PROJECT_FOLLOWED' || subjectU === 'PROJECT_UNFOLLOWED') {
                return ProjectFollowCard({ type: subjectU, sentAt, from: fromResolved, toLinks, text, key: msg.key })
              }
              if (subjectU === 'MARKET_SOLD') {
                return MarketSoldCard({ sentAt, from: fromResolved, toLinks, subject: subjectRaw, text, key: msg.key })
              }
              if (subjectU === 'PROJECT_PLEDGE' || content.meta?.type === 'project-pledge') {
                return ProjectPledgeCard({ sentAt, from: fromResolved, toLinks, content, text, key: msg.key })
              }

              return div(
                { class: `pm-card normal-pm thread-level-${level}` },
                headerLine({ sentAt, from: fromResolved, toLinks, textLen: text.length }),
                h2(subjectRaw || i18n.pmNoSubject),
                p({ class: 'message-text' }, ...renderUrl(clickableLinks(text))),
                actions({ key: msg.key, replyId: fromResolved, subjectRaw, text })
              )
            })
          : p({ class: 'empty' }, i18n.noPrivateMessages)
      )
    )
  )
}

exports.publishCustomView = async () => {
  const action = "/publish/custom";
  const method = "post";

  return template(
    i18n.publishCustom,
    section(
      div({ class: "tags-header" },
        h2(i18n.publishCustom),
        p(i18n.publishCustomDescription)
      ),
      form(
        { action, method },
        textarea(
          {
            autofocus: true,
            required: true,
            name: "text",
            rows: 10,
            style: "width: 100%;"
          },
          "{\n",
          '  "type": "feed",\n',
          '  "hello": "world"\n',
          "}"
        ),
        br,
        br,
        button({ type: "submit" }, i18n.submit)
      )
    ),
    section(
      div({ class: "tags-header" },
        p(i18n.publishBasicInfo({ href: "/publish" }))
      )
    )
  );
};

exports.threadView = ({ messages }) => {
  const rootMessage = messages[0];
  const rootAuthorName = rootMessage.value.meta.author.name;
  const rootSnippet = postSnippet(
    lodash.get(rootMessage, "value.content.text", i18n.mysteryDescription)
  );
  return template([`@${rootAuthorName}`], 
    div(
    thread(messages)
    )
  );
};

exports.publishView = (preview, text, contentWarning) => {
  return template(
    i18n.publish,
    section(
      div({ class: "tags-header" },
        h2(i18n.publishBlog),
        p(i18n.publishLabel({ markdownUrl, linkTarget: "_blank" }))
      )
    ),
    section(
      div({ class: "publish-form" },
        form(
          {
            action: "/publish/preview",
            method: "post",
            enctype: "multipart/form-data",
          },
          [
            label({ for: "contentWarning" }, i18n.blogSubject),
            br(),
            input({
              name: "contentWarning",
              id: "contentWarning",
              type: "text",
              class: "contentWarning",
              value: contentWarning || "",
              placeholder: i18n.contentWarningPlaceholder
            }),
            br(),
            label({ for: "text" }, i18n.blogMessage),
            br(),
            textarea(
              {
                required: true,
                name: "text",
                id: "text",
                rows: "6",
                cols: "50",
                placeholder: i18n.publishWarningPlaceholder,
                class: "publish-textarea"
              },
              text || ""
            ),
            br(),
            label({ for: "blob" }, i18n.blogImage || "Upload Image (jpeg, jpg, png, gif) (max-size: 500px x 400px)"),
            br(),
            input({ type: "file", id: "blob", name: "blob" }),
            br(), br(),
            button({ type: "submit" }, i18n.blogPublish)
          ]
        )
      )
    ),
    preview || "",
    section(
      div({ class: "tags-header" },
        p(i18n.publishCustomInfo({ href: "/publish/custom" }))
      )
    )
  );
};

const generatePreview = ({ previewData, contentWarning, action }) => {
  const { authorMeta, formattedText, mentions } = previewData;
  const renderedText = formattedText;
  const msg = {
    key: "%non-existent.preview",
    value: {
      author: authorMeta.id,
      content: {
        type: "post",
        text: renderedText,
        mentions: mentions,
      },
      timestamp: Date.now(),
      meta: {
        isPrivate: false,
        votes: [],
        author: {
          name: authorMeta.name,
          avatar: {
            url: `http://localhost:3000/blob/${encodeURIComponent(authorMeta.image)}`,
          },
        },
      },
    },
  };
  if (contentWarning) {
    msg.value.content.contentWarning = contentWarning;
  }
  if (msg.value.meta.author.avatar.url === 'http://localhost:3000/blob/%260000000000000000000000000000000000000000000%3D.sha256') {
    msg.value.meta.author.avatar.url = '/assets/images/default-avatar.png';
  }
  const ts = new Date(msg.value.timestamp);
  lodash.set(msg, "value.meta.timestamp.received.iso8601", ts.toISOString());
  const ago = Date.now() - Number(ts);
  const prettyAgo = prettyMs(ago, { compact: true });
  lodash.set(msg, "value.meta.timestamp.received.since", prettyAgo);

  return div(
    section(
      { class: "post-preview" },
      div(
        { class: "preview-content" },
        h2(i18n.messagePreview),
        post({ msg, preview: true })
      ),
    ),
    section(
      { class: "mention-suggestions" },
      Object.keys(mentions).map((name) => {
        const matches = mentions[name];
        return div(
          h2(i18n.mentionsMatching),
          { class: "mention-card" },
          a(
            {
              href: `/author/@${encodeURIComponent(matches[0].feed)}`,
            },
            img({ src: msg.value.meta.author.avatar.url, class: "avatar-profile" })
          ),
          br,
          div(
            { class: "mention-name" },
            span({ class: "label" }, `${i18n.mentionsName}: `),
            a(
              {
                href: `/author/@${encodeURIComponent(matches[0].feed)}`,
              },
              `@${authorMeta.name}`
            )
          ),
          div(
            { class: "mention-relationship" },
            span({ class: "label" }, `${i18n.mentionsRelationship}:`),
            span({ class: "relationship" }, matches[0].rel.followsMe ? i18n.relationshipMutuals : i18n.relationshipNotMutuals),
            { class: "mention-relationship-details" },
            span({ class: "emoji" }, matches[0].rel.followsMe ? "☍" : "⚼"),
            span({ class: "mentions-listing" },
              a({ class: 'user-link', href: `/author/@${encodeURIComponent(matches[0].feed)}` }, `@${matches[0].feed}`)
            )
          )
        );
      })
    ),
    section(
      form(
        { action, method: "post" },
        [
          input({ type: "hidden", name: "text", value: renderedText }),
          input({ type: "hidden", name: "contentWarning", value: contentWarning || "" }),
          input({ type: "hidden", name: "mentions", value: JSON.stringify(mentions) }),
          button({ type: "submit" }, i18n.publish)
        ]
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
  return exports.publishView(preview, previewData.formattedText, contentWarning);
};

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
    ["@", name],
    viewInfoBox({
      viewTitle: span(authorLink),
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
  aside = null,
}) => {
  const hasHeader = !!viewElements;
  const titleBlock = hasHeader
    ? viewElements
    : div({ class: "tags-header" },
        h2(viewTitle),
        p(viewDescription)
      );
  return template(
    viewTitle,
    section(titleBlock),
    messages.map((msg) => post({ msg, aside }))
  );
};

exports.popularView = ({ messages, prefix }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.popular),
    p(i18n.popularDescription)
  );
  return messageListView({
    messages,
    viewTitle: i18n.popular,
    viewElements: [header, prefix]
  });
};

exports.extendedView = ({ messages }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.extended),
    p(i18n.extendedDescription)
  );
  return messageListView({
    messages,
    viewTitle: i18n.extended,
    viewElements: header
  });
};

exports.latestView = ({ messages }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.latest),
    p(i18n.latestDescription)
  );
  return messageListView({
    messages,
    viewTitle: i18n.latest,
    viewElements: header
  });
};

exports.topicsView = ({ messages, prefix }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.topics),
    p(i18n.topicsDescription)
  );
  return messageListView({
    messages,
    viewTitle: i18n.topics,
    viewElements: [header, prefix]
  });
};

exports.summaryView = ({ messages }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.summaries),
    p(i18n.summariesDescription)
  );
  return messageListView({
    messages,
    viewTitle: i18n.summaries,
    viewElements: header,
    aside: true
  });
};

exports.spreadedView = ({ messages }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.spreaded),
    p(i18n.spreadedDescription)
  );
  return spreadedListView({
    messages,
    viewTitle: i18n.spreaded,
    viewElements: header
  });
};

exports.threadsView = ({ messages }) => {
  const header = div({ class: "tags-header" },
    h2(i18n.threads),
    p(i18n.threadsDescription)
  );
  return messageListView({
    messages,
    viewTitle: i18n.threads,
    viewElements: header,
    aside: true
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
    form(
      { action: subtopicForm, method: "post", enctype: "multipart/form-data" },
      i18n.blogSubject,
      br, 
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
      br,
      label({ for: "text" }, i18n.blogMessage),
      br,
      textarea(
        {
          autofocus: true,
          required: true,
          name: "text",
          rows: "6",
          cols: "50",
          placeholder: i18n.publishWarningPlaceholder,
        },
        text ? text : markdownMention
      ),
      br,
      label(
        { for: "blob" },
        i18n.blogImage || "Upload Image (jpeg, jpg, png, gif) (max-size: 500px x 400px)"
      ),
      input({ type: "file", id: "blob", name: "blob" }),
      br,
      br,
      button({ type: "submit" }, i18n.blogPublish)
    ),
    preview ? div({ class: "comment-preview" }, preview) : ""
  );
};
