const { form, button, div, h2, p, section, input, label, textarea, br, a, ul, li } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require("../server/node_modules/moment");
const { config } = require('../server/SSB_server.js');

const userId = config.keys.id

const renderBookmarkActions = (filter, bookmark) => {
  return filter === 'mine' ? div({ class: "bookmark-actions" },
    form({ method: "GET", action: `/bookmarks/edit/${encodeURIComponent(bookmark.id)}` },
      button({ class: "update-btn", type: "submit" }, i18n.bookmarkUpdateButton)
    ),
    form({ method: "POST", action: `/bookmarks/delete/${encodeURIComponent(bookmark.id)}` },
      button({ class: "delete-btn", type: "submit" }, i18n.bookmarkDeleteButton)
    )
  ) : null;
};

const renderBookmarkList = (filteredBookmarks, filter) => {
  return filteredBookmarks.length > 0
    ? filteredBookmarks.map(bookmark =>
        div({ class: "bookmark-item" },
          renderBookmarkActions(filter, bookmark),
          form({ method: "GET", action: `/bookmarks/${encodeURIComponent(bookmark.id)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
          ),br,
          h2(bookmark.title),
          p(bookmark.description),
          label(bookmark.url ? a({ href: bookmark.url, target: "_blank", class: "bookmark-url" }, bookmark.url) : null), br,
          p(`${i18n.bookmarkCreatedAt}: ${moment(bookmark.createdAt).format('YYYY/MM/DD HH:mm:ss')}`),
          p(`${i18n.bookmarkAuthor}: `, a({ href: `/author/${encodeURIComponent(bookmark.author)}` }, bookmark.author)),
          bookmark.category?.trim() ? p(`${i18n.bookmarkCategory}: ${bookmark.category}`) : null,
          p(`${i18n.bookmarkLastVisit}: ${moment(bookmark.lastVisit).format('YYYY/MM/DD HH:mm:ss') || i18n.noLastVisit}`),
          bookmark.tags?.length
            ? div(bookmark.tags.map(tag =>
                a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
              ))
            : null,
          div({ class: "voting-buttons" },
            ['interesting','necessary','funny','disgusting','sensible','propaganda','adultOnly','boring','confusing','inspiring','spam'].map(category =>
              form({ method: "POST", action: `/bookmarks/opinions/${encodeURIComponent(bookmark.id)}/${category}` },
                button({ class: "vote-btn" }, `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`]} [${bookmark.opinions?.[category] || 0}]`)
              )
            )
          )
        )
      )
    : i18n.nobookmarks;
};

const renderBookmarkForm = (filter, bookmarkId, bookmarkToEdit, tags) => {
  return div({ class: "div-center bookmark-form" },
    form(
      {
        action: filter === 'edit'
          ? `/bookmarks/update/${encodeURIComponent(bookmarkId)}`
          : "/bookmarks/create",
        method: "POST"
      },
      label(i18n.bookmarkUrlLabel), br,
      input({ type: "url", name: "url", id: "url", required: true, placeholder: i18n.bookmarkUrlPlaceholder, value: filter === 'edit' ? bookmarkToEdit.url : '' }), br, br,
      label(i18n.bookmarkDescriptionLabel),
      textarea({ name: "description", id: "description", placeholder: i18n.bookmarkDescriptionPlaceholder, value: filter === 'edit' ? bookmarkToEdit.description : '' }), br, br,
      label(i18n.bookmarkTagsLabel),
      input({ type: "text", name: "tags", id: "tags", placeholder: i18n.bookmarkTagsPlaceholder, value: filter === 'edit' ? tags.join(', ') : '' }), br, br,
      label(i18n.bookmarkCategoryLabel),
      input({ type: "text", name: "category", id: "category", placeholder: i18n.bookmarkCategoryPlaceholder, value: filter === 'edit' ? bookmarkToEdit.category : '' }), br, br,
      label(i18n.bookmarkLastVisitLabel),
      input({ type: "datetime-local", name: "lastVisit", value: filter === 'edit' ? moment(bookmarkToEdit.lastVisit).format('YYYY-MM-DDTHH:mm:ss') : '' }), br, br,
      button({ type: "submit" }, filter === 'edit' ? i18n.bookmarkUpdateButton : i18n.bookmarkCreateButton)
    )
  );
};

exports.bookmarkView = async (bookmarks, filter, bookmarkId) => {
  const title = filter === 'mine' ? i18n.bookmarkMineSectionTitle :
                filter === 'create' ? i18n.bookmarkCreateSectionTitle :
                filter === 'edit' ? i18n.bookmarkUpdateSectionTitle :
                filter === 'internal' ? i18n.bookmarkInternalTitle :
                filter === 'external' ? i18n.bookmarkExternalTitle :
                filter === 'top' ? i18n.bookmarkTopTitle :
                filter === 'recent' ? i18n.bookmarkRecentTitle :
                i18n.bookmarkAllSectionTitle;

  const sectionTitle = title;
  const now = Date.now();

  let filteredBookmarks = (filter === 'mine')
    ? bookmarks.filter(bookmark => String(bookmark.author).trim() === String(userId).trim())
    : (filter === 'internal')
      ? bookmarks.filter(bookmark => bookmark.tags?.includes('internal'))
      : (filter === 'external')
        ? bookmarks.filter(bookmark => bookmark.tags?.includes('external'))
        : (filter === 'recent')
          ? bookmarks.filter(bookmark => new Date(bookmark.createdAt).getTime() >= (now - 24 * 60 * 60 * 1000))
          : bookmarks;

  if (filter === 'top') {
    filteredBookmarks = [...filteredBookmarks].sort((a, b) => {
      const sumA = Object.values(a.opinions || {}).reduce((s, n) => s + n, 0);
      const sumB = Object.values(b.opinions || {}).reduce((s, n) => s + n, 0);
      return sumB - sumA;
    });
  } else {
    filteredBookmarks = [...filteredBookmarks].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const bookmarkToEdit = bookmarks.find(b => b.id === bookmarkId);
  const tags = bookmarkToEdit && Array.isArray(bookmarkToEdit.tags) ? bookmarkToEdit.tags : [];

  return template(
    title,
    section(
      div({ class: "tags-header" },
        h2(sectionTitle),
        p(i18n.bookmarkDescription)
      ),
      div({ class: "filters" },
        form({ method: "GET", action: "/bookmarks" },
          button({ type: "submit", name: "filter", value: "all", class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.bookmarkFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.bookmarkFilterMine),
          button({ type: "submit", name: "filter", value: "internal", class: filter === 'internal' ? 'filter-btn active' : 'filter-btn' }, i18n.bookmarkFilterInternal),
          button({ type: "submit", name: "filter", value: "external", class: filter === 'external' ? 'filter-btn active' : 'filter-btn' }, i18n.bookmarkFilterExternal),
          button({ type: "submit", name: "filter", value: "top", class: filter === 'top' ? 'filter-btn active' : 'filter-btn' }, i18n.bookmarkFilterTop),
          button({ type: "submit", name: "filter", value: "recent", class: filter === 'recent' ? 'filter-btn active' : 'filter-btn' }, i18n.bookmarkFilterRecent),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.bookmarkCreateButton)
        )
      )
    ),
    section(
      (filter === 'edit' || filter === 'create')
        ? renderBookmarkForm(filter, bookmarkId, bookmarkToEdit, tags)
        : div({ class: "bookmark-list" }, renderBookmarkList(filteredBookmarks, filter))
    )
  );
};

exports.singleBookmarkView = async (bookmark, filter) => {
  const isAuthor = bookmark.author === userId; 
  const hasOpinions = Object.keys(bookmark.opinions || {}).length > 0;

  return template(
    i18n.bookmarkTitle,
    section(
      div({ class: "filters" },
        form({ method: "GET", action: "/bookmarks" },
          button({ type: "submit", name: "filter", value: "all", class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.bookmarkFilterAll),
          button({ type: "submit", name: "filter", value: "mine", class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.bookmarkFilterMine),
          button({ type: "submit", name: "filter", value: "internal", class: filter === 'internal' ? 'filter-btn active' : 'filter-btn' }, i18n.bookmarkFilterInternal),
          button({ type: "submit", name: "filter", value: "external", class: filter === 'external' ? 'filter-btn active' : 'filter-btn' }, i18n.bookmarkFilterExternal),
          button({ type: "submit", name: "filter", value: "top", class: filter === 'top' ? 'filter-btn active' : 'filter-btn' }, i18n.bookmarkFilterTop),
          button({ type: "submit", name: "filter", value: "recent", class: filter === 'recent' ? 'filter-btn active' : 'filter-btn' }, i18n.bookmarkFilterRecent),
          button({ type: "submit", name: "filter", value: "create", class: "create-button" }, i18n.bookmarkCreateButton)
        )
      ),
      div({ class: "tags-header" },
        p(bookmark.description),
        label(bookmark.url ? a({ href: bookmark.url, target: "_blank", class: "bookmark-url" }, bookmark.url) : null), br,
        p(`${i18n.bookmarkCreatedAt}: ${moment(bookmark.createdAt).format('YYYY/MM/DD HH:mm:ss')}`),
        p(`${i18n.bookmarkAuthor}: `, a({ href: `/author/${encodeURIComponent(bookmark.author)}` }, bookmark.author)),
        p(`${i18n.bookmarkCategory}: ${bookmark.category || i18n.noCategory}`),
        p(`${i18n.bookmarkLastVisitLabel}: ${moment(bookmark.lastVisit).format('YYYY/MM/DD HH:mm:ss') || i18n.noLastVisit}`),
        bookmark.tags && bookmark.tags.length
          ? div(
              bookmark.tags.map(tag =>
                a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
              )
            )
          : null
      ),
      isAuthor ? div({ class: "bookmark-actions" },
        !hasOpinions
          ? form({ method: "GET", action: `/bookmarks/edit/${encodeURIComponent(bookmark.id)}` },
              button({ class: "update-btn", type: "submit" }, i18n.bookmarkUpdateButton)
            )
          : null,
        form({ method: "POST", action: `/bookmarks/delete/${encodeURIComponent(bookmark.id)}` },
          button({ class: "delete-btn", type: "submit" }, i18n.bookmarkDeleteButton)
        )
      ) : null,
      div({ class: "voting-buttons" },
        ['interesting', 'necessary', 'funny', 'disgusting', 'sensible', 'propaganda', 'adultOnly', 'boring', 'confusing', 'inspiring', 'spam'].map(category =>
          form({ method: "POST", action: `/bookmarks/opinions/${encodeURIComponent(bookmark.id)}/${category}` },
            button({ class: "vote-btn" }, `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`]} [${bookmark.opinions?.[category] || 0}]`)
          )
        )
      )
    )
  );
};
