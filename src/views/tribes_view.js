const { div, h2, p, section, button, form, a, input, img, label, select, option, br, textarea, h1 } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { config } = require('../server/SSB_server.js');
const { renderUrl } = require('../backend/renderUrl');

const userId = config.keys.id;

const paginateFeedTribesView = (feed, page = 1, itemsPerPage = 5) => {
  const startIndex = (page - 1) * itemsPerPage;
  return feed.slice(startIndex, startIndex + itemsPerPage);
};

const renderPaginationTribesView = (page, totalPages, filter) => {
  if (totalPages <= 1) return '';

  return div({ class: 'pagination' },
    page > 1 ? form({ method: 'GET', action: '/tribes' },
      input({ type: 'hidden', name: 'filter', value: filter }),
      input({ type: 'hidden', name: 'page', value: page - 1 }),
      button({ type: 'submit' }, i18n.previousPage)
    ) : null,
    page < totalPages ? form({ method: 'GET', action: '/tribes' },
      input({ type: 'hidden', name: 'filter', value: filter }),
      input({ type: 'hidden', name: 'page', value: page + 1 }),
      button({ type: 'submit' }, i18n.nextPage)
    ) : null
  );
};

const renderFeedTribesView = (tribe, page, query, filter) => {
  const feed = Array.isArray(tribe.feed) ? tribe.feed : [];
  const feedFilter = (query.feedFilter || 'TOP').toUpperCase();
  let filteredFeed = feed;

  if (feedFilter === 'MINE') filteredFeed = feed.filter(m => m.author === userId);
  if (feedFilter === 'RECENT') {
    const last24h = Date.now() - 86400000;
    filteredFeed = [...feed]
      .filter(m => {
        const msgDate = typeof m.date === "string" ? Date.parse(m.date) : m.date;
        return msgDate >= last24h;
      })
      .sort((a, b) => {
        const dateA = typeof a.date === "string" ? Date.parse(a.date) : a.date;
        const dateB = typeof b.date === "string" ? Date.parse(b.date) : b.date;
        return dateB - dateA;
      });
  }
  if (feedFilter === 'ALL') filteredFeed = [...feed].sort((a, b) => b.date - a.date);
  if (feedFilter === 'TOP') filteredFeed = [...feed].sort((a, b) => (b.refeeds || 0) - (a.refeeds || 0));

  const totalPages = Math.ceil(filteredFeed.length / 5);
  const paginatedFeed = paginateFeedTribesView(filteredFeed, page);

  return div({ class: 'tribe-feed' },
    div({ class: 'feed-actions', style: 'margin-bottom:8px;' },
      ['TOP', 'MINE', 'ALL', 'RECENT'].map(f =>
        form({ method: 'GET', action: '/tribes' },
          input({ type: 'hidden', name: 'filter', value: filter }),
          input({ type: 'hidden', name: 'feedFilter', value: f }),
          button({ type: 'submit', class: feedFilter === f ? 'active' : '' }, i18n[`tribeFeedFilter${f}`])
        )
      )
    ),
    paginatedFeed.length === 0
      ? p(i18n.tribeFeedEmpty)
      : div({ class: 'feed-list' },
          paginatedFeed.map(m => div({ class: 'feed-item' },
            div({ class: 'feed-row' },
              div({ class: 'refeed-column' },
                h1(`${m.refeeds || 0}`),
                !m.refeeds_inhabitants.includes(userId)
                  ? form({ method: 'POST', action: `/tribes/${encodeURIComponent(tribe.id)}/refeed/${encodeURIComponent(m.id)}` }, button({ class: 'refeed-btn' }, i18n.tribeFeedRefeed))
                  : p(i18n.alreadyRefeeded)
              ),
              div({ class: 'feed-main' },
                p(`${new Date(m.date).toLocaleString()} — `, a({ class: 'user-link', href: `/author/${encodeURIComponent(m.author)}` }, m.author)),
                p(m.message)
              )
            )
          ))
        ),
    tribe.members.includes(userId)
      ? form({ method: 'POST', action: `/tribes/${encodeURIComponent(tribe.id)}/message` },
          textarea({ name: 'message', rows: 3, cols: 50, maxlength: 280, placeholder: i18n.tribeFeedMessagePlaceholder }),
          button({ type: 'submit' }, i18n.tribeFeedSend)
        )
      : null,
    renderPaginationTribesView(page, totalPages, filter)
  );
};

const renderGallery = (sortedTribes) => {
  return div({ class: "gallery", style: 'display:grid; grid-template-columns: repeat(3, 1fr); gap:16px;' },
    sortedTribes.length
      ? sortedTribes.map(t =>
          a({ href: `#tribe-${encodeURIComponent(t.id)}`, class: "gallery-item" },
           img({ src: t.image ? `/blob/${encodeURIComponent(t.image)}` : '/assets/images/default-tribe.png', alt: t.title || "", class: "gallery-image" })
          )
        )
      : p(i18n.noTribes)
  );
};

const renderLightbox = (sortedTribes) => {
  return sortedTribes.map(t =>
    div(
      { id: `tribe-${encodeURIComponent(t.id)}`, class: "lightbox" },
      a({ href: "#", class: "lightbox-close" }, "×"),
      img({ 
        src: t.image ? `/blob/${encodeURIComponent(t.image)}` : '/assets/images/default-tribe.png', 
        class: "lightbox-image", 
       alt: t.title || "" 
      })
    )
  );
};

exports.renderInvitePage = (inviteCode) => {
  const pageContent = div({ class: 'invite-page' },
    h2(i18n.tribeInviteCodeText, inviteCode),
    form({ method: "GET", action: `/tribes` },
      button({ type: "submit", class: "filter-btn" }, i18n.walletBack)
    ),
  );
  return template('Invite Page', section(pageContent));
};

exports.tribesView = async (tribes, filter, tribeId, query = {}) => {
  const now = Date.now();
  const search = (query.search || '').toLowerCase(); 

  const filtered = tribes.filter(t => {
  return (
    filter === 'all' ? t.isAnonymous === false : 
    filter === 'mine' ? t.author === userId :
    filter === 'membership' ? t.members.includes(userId) :
    filter === 'recent' ? t.isAnonymous === false && ((typeof t.createdAt === 'string' ? Date.parse(t.createdAt) : t.createdAt) >= now - 86400000 ) :
    filter === 'top' ? t.isAnonymous === false :
    filter === 'gallery' ? t.isAnonymous === false :
    filter === 'larp' ? t.isAnonymous === false && t.isLARP === true : 
    filter === 'create' ? true : 
    filter === 'edit' ? true : 
    false 
    );
  });

  const searched = filter === 'create' || filter === 'edit' || !search
    ? filtered
    : filtered.filter(t =>
        (t.title && t.title.toLowerCase().includes(search)) ||
        (t.description && t.description.toLowerCase().includes(search))
      );

  const sorted = filter === 'top'
    ? [...searched].sort((a, b) => b.members.length - a.members.length)
    : [...searched].sort((a, b) => b.createdAt - a.createdAt);

  const title =
    filter === 'mine' ? i18n.tribeMineSectionTitle :
    filter === 'create' ? i18n.tribeCreateSectionTitle :
    filter === 'edit' ? i18n.tribeUpdateSectionTitle :
    filter === 'gallery' ? i18n.tribeGallerySectionTitle :
    filter === 'recent' ? i18n.tribeRecentSectionTitle :
    filter === 'top' ? i18n.tribeTopSectionTitle :
    filter === 'larp' ? i18n.tribeLarpSectionTitle :
    i18n.tribeAllSectionTitle;

  const header = div({ class: 'tags-header' }, h2(title), p(i18n.tribeDescription));

  const filters = div({ class: 'filters' },
    form({ method: 'GET', action: '/tribes' },
      input({ type: 'hidden', name: 'filter', value: filter }),
      input({ type: 'text', name: 'search', placeholder: i18n.searchTribesPlaceholder, value: query.search || '' }),
      br(),
      button({ type: 'submit' }, i18n.applyFilters),
      br()
    )
  );

  const modeButtons = div({ class: 'mode-buttons', style: 'display:flex; gap:8px; margin-top:16px;' },
    ['all','mine','membership','larp','recent','top','gallery'].map(f =>
    form({ method: 'GET', action: '/tribes' },
      input({ type: 'hidden', name: 'filter', value: f }),
      button({ type: 'submit', class: filter === f ? 'filter-btn active' : 'filter-btn' },
        i18n[`tribeFilter${f.charAt(0).toUpperCase()+f.slice(1)}`]
        )
      )
    ),
    form({ method: 'GET', action: '/tribes/create' },
      button({ type: 'submit', class: 'create-button' }, i18n.tribeCreateButton)
    )
  );

  const isEdit = filter === 'edit' && tribeId;
  const tribeToEdit = isEdit ? tribes.find(t => t.id === tribeId) : {};
  const createForm = (filter === 'create' || isEdit) ? div({ class: 'create-tribe-form' },
    h2(isEdit ? i18n.updateTribeTitle : i18n.createTribeTitle),
    form({
    method: 'POST',
    action: isEdit ? `/tribes/update/${encodeURIComponent(tribeToEdit.id)}` : '/tribes/create',
    enctype: 'multipart/form-data'
    },
    label({ for: 'title' }, i18n.tribeTitleLabel),
    br,
    input({ type: 'text', name: 'title', id: 'title', required: true, placeholder: i18n.tribeTitlePlaceholder, value: tribeToEdit.title || '' }),
    br(),
    label({ for: 'description' }, i18n.tribeDescriptionLabel),
    br,
    textarea({ name: 'description', id: 'description', required: true, rows: 4, cols: 50, placeholder: i18n.tribeDescriptionPlaceholder }, tribeToEdit.description || ''),
    br(),
    label({ for: 'location' }, i18n.tribeLocationLabel),
    br,
    input({ type: 'text', name: 'location', id: 'location', required: true, placeholder: i18n.tribeLocationPlaceholder, value: tribeToEdit.location || '' }),
    br(),
    label({ for: 'image' }, i18n.tribeImageLabel),
    br,
    input({ type: 'file', name: 'image', id: 'image', accept: 'image/*' }),
    br(), br(),
    label({ for: 'tags' }, i18n.tribeTagsLabel),
    br,
    input({ type: 'text', name: 'tags', id: 'tags', placeholder: i18n.tribeTagsPlaceholder, value: (tribeToEdit.tags || []).join(', ') }),
    br(),
    label({ for: 'isAnonymous' }, i18n.tribeIsAnonymousLabel),
    br,  
    select({ name: 'isAnonymous', id: 'isAnonymous' },
      option({ value: 'true', selected: tribeToEdit.isAnonymous === true ? 'selected' : undefined }, i18n.tribePrivate),
      option({ value: 'false', selected: tribeToEdit.isAnonymous === false ? 'selected' : undefined }, i18n.tribePublic)
    ),
    br(), br(),
    label({ for: 'inviteMode' }, i18n.tribeModeLabel),
    br,
    select({ name: 'inviteMode', id: 'inviteMode' },
      option({ value: 'strict', selected: tribeToEdit.inviteMode === 'strict' ? 'selected' : undefined }, i18n.tribeStrict),
      option({ value: 'open', selected: tribeToEdit.inviteMode === 'open' ? 'selected' : undefined }, i18n.tribeOpen)
    ),
    br(), br(),   
    
   // label({ for: 'isLARP' }, i18n.tribeIsLARPLabel),
   // br,
   // select({ name: 'isLARP', id: 'isLARP' },
   //   option({ value: 'true', selected: tribeToEdit.isLARP === true ? 'selected' : undefined }, i18n.tribeYes),
   //   option({ value: 'false', selected: tribeToEdit.isLARP === false ? 'selected' : undefined }, i18n.tribeNo)
   // ),
   // br(), br(),
    
    button({ type: 'submit' }, isEdit ? i18n.tribeUpdateButton : i18n.tribeCreateButton)
    )
  ) : null;

  const tribeCards = sorted.map(t => {
    const imageSrc = t.image
      ? `/blob/${encodeURIComponent(t.image)}`
      : '/assets/images/default-tribe.png';

    const infoCol = div({ class: 'tribe-card', style: 'width:50%' },
      filter === 'mine' ? div({ class: 'tribe-actions' },
        form({ method: 'GET', action: `/tribes/edit/${encodeURIComponent(t.id)}` }, button({ type: 'submit' }, i18n.tribeUpdateButton)),
        form({ method: 'POST', action: `/tribes/delete/${encodeURIComponent(t.id)}` }, button({ type: 'submit' }, i18n.tribeDeleteButton))
      ) : null,
      div({ style: 'display: flex; justify-content: space-between;' },
        form({ method: 'GET', action: `/tribe/${encodeURIComponent(t.id)}` },
          button({ type: 'submit', class: 'filter-btn' }, i18n.tribeviewTribeButton)
        ),
        h2(t.title)
      ),
      p(`${i18n.tribeIsAnonymousLabel}: ${t.isAnonymous ? i18n.tribePrivate : i18n.tribePublic}`),
      p(`${i18n.tribeModeLabel}: ${t.inviteMode.toUpperCase()}`),
      p(`${i18n.tribeLARPLabel}: ${t.isLARP ? i18n.tribeYes : i18n.tribeNo}`),
      img({ src: imageSrc }),
      t.description ? p(...renderUrl(t.description)) : null,
      p(`${i18n.tribeLocationLabel}: ${t.location}`),
      h2(`${i18n.tribeMembersCount}: ${t.members.length}`),
      t.tags && t.tags.filter(Boolean).length ? div(t.tags.filter(Boolean).map(tag =>
        a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link', style: 'margin-right:0.8em;margin-bottom:0.5em;' }, `#${tag}`)
      )) : null,    
      p(`${i18n.tribeCreatedAt}: ${new Date(t.createdAt).toLocaleString()}`),
      p(a({ class: 'user-link', href: `/author/${encodeURIComponent(t.author)}` }, t.author)),
      t.members.includes(userId) ? div(
      form({ method: 'POST', action: '/tribes/generate-invite' }, 
        input({ type: 'hidden', name: 'tribeId', value: t.id }),
        button({ type: 'submit' }, i18n.tribeGenerateInvite)
      ),
      form({ method: 'POST', action: `/tribes/leave/${encodeURIComponent(t.id)}` }, button({ type: 'submit' }, i18n.tribeLeaveButton))
      ) : null
    );

    const feedCol = renderFeedTribesView(t, query.page || 1, query, filter);

    return div({ class: 'tribe-row', style: 'display:flex; gap:24px; margin-bottom:32px;' }, infoCol, feedCol);
  });

  return template(
    title,
    section(header),
    section(filters),
    section(modeButtons),
    section(
    (filter === 'create' || filter === 'edit')
      ? createForm 
      : filter === 'gallery'
        ? renderGallery(sorted.filter(t => t.isAnonymous === false)) 
        : div({ class: 'tribe-grid', style: 'display:grid; grid-template-columns: repeat(3, 1fr); gap:16px;' },
            tribeCards.length > 0 ? tribeCards : p(i18n.noTribes)
        )
     ),
  ...renderLightbox(sorted.filter(t => t.isAnonymous === false))
  ); 
};

const renderFeedTribeView = async (tribe, query = {}, filter) => {
  const feed = Array.isArray(tribe.feed) ? tribe.feed : [];
  const feedFilter = (query.feedFilter || 'RECENT').toUpperCase();
  let filteredFeed = feed;
  if (feedFilter === 'MINE') {
    filteredFeed = feed.filter(m => m.author === userId);
  }
  if (feedFilter === 'RECENT') {
    const last24h = Date.now() - 86400000;
    filteredFeed = feed
      .filter(m => {
        const msgDate = typeof m.date === 'string' ? Date.parse(m.date) : m.date;
        return msgDate >= last24h;
      })
      .sort((a, b) => {
        const dateA = typeof a.date === 'string' ? Date.parse(a.date) : a.date;
        const dateB = typeof b.date === 'string' ? Date.parse(b.date) : b.date;
        return dateB - dateA;
      });
  }
  if (feedFilter === 'ALL') {
    filteredFeed = [...feed].sort((a, b) => b.date - a.date);
  }
  if (feedFilter === 'TOP') {
    filteredFeed = [...feed].sort((a, b) => (b.refeeds || 0) - (a.refeeds || 0));
  }
  return div({ class: 'tribe-feed-full' },
    div({ class: 'feed-actions', style: 'margin-bottom:8px;' },
      ['TOP', 'MINE', 'ALL', 'RECENT'].map(f =>
	form({ method: 'GET', action: `/tribe/${encodeURIComponent(tribe.id)}` },
	  input({ type: 'hidden', name: 'filter', value: filter }),
	  input({ type: 'hidden', name: 'feedFilter', value: f }), 
	  button({ type: 'submit', class: feedFilter === f ? 'active' : '' }, i18n[`tribeFeedFilter${f}`])
	)
      )
    ),
    filteredFeed.length === 0
      ? p(i18n.tribeFeedEmpty)
      : div({ class: 'feed-list' },
          filteredFeed.map(m => div({ class: 'feed-item' },
            div({ class: 'feed-row' },
              div({ class: 'refeed-column' },
                h1(`${m.refeeds || 0}`),
                !m.refeeds_inhabitants.includes(userId)
                  ? form({ method: 'POST', action: `/tribe/${encodeURIComponent(tribe.id)}/refeed/${encodeURIComponent(m.id)}` }, button({ class: 'refeed-btn' }, i18n.tribeFeedRefeed))
                  : p(i18n.alreadyRefeeded)
              ),
              div({ class: 'feed-main' },
                p(`${new Date(m.date).toLocaleString()} — `, a({ class: 'user-link', href: `/author/${encodeURIComponent(m.author)}` }, m.author)),
                p(m.message)
              )
            )
          ))
        )
  );
};

exports.tribeView = async (tribe, userId, query) => {
  if (!tribe) {
    return div({ class: 'error' }, 'Tribe not found!');
  }
  const feedFilter = (query.feedFilter || 'TOP').toUpperCase();
  const imageSrc = tribe.image
    ? `/blob/${encodeURIComponent(tribe.image)}`
    : '/assets/images/default-tribe.png';
  const pageTitle = tribe.title;
  const tribeDetails = div({ class: 'tribe-details' },
    h2(tribe.title),
    p(`${i18n.tribeIsAnonymousLabel}: ${tribe.isAnonymous ? i18n.tribePrivate : i18n.tribePublic}`),
    p(`${i18n.tribeModeLabel}: ${tribe.inviteMode.toUpperCase()}`),
    p(`${i18n.tribeLARPLabel}: ${tribe.isLARP ? i18n.tribeYes : i18n.tribeNo}`),
    img({ src: imageSrc, alt: tribe.title }),
    tribe.description ? p(...renderUrl(tribe.description)) : null,
    p(`${i18n.tribeLocationLabel}: ${tribe.location}`),
    h2(`${i18n.tribeMembersCount}: ${tribe.members.length}`),
    tribe.tags && tribe.tags.filter(Boolean).length ? div(tribe.tags.filter(Boolean).map(tag =>
      a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link', style: 'margin-right:0.8em;margin-bottom:0.5em;' }, `#${tag}`)
    )) : null,  
    p(`${i18n.tribeCreatedAt}: ${new Date(tribe.createdAt).toLocaleString()}`),
    p(a({ class: 'user-link', href: `/author/${encodeURIComponent(tribe.author)}` }, tribe.author)),
    div({ class: 'tribe-feed-form' }, tribe.members.includes(config.keys.id)
      ? form({ method: 'POST', action: `/tribe/${encodeURIComponent(tribe.id)}/message` },
          textarea({ name: 'message', rows: 3, cols: 50, maxlength: 280, placeholder: i18n.tribeFeedMessagePlaceholder }),
          br,
          button({ type: 'submit' }, i18n.tribeFeedSend)
        )
      : null
      ),
    div({ class: 'tribe-feed-full' }, await renderFeedTribeView(tribe, query, query.filter)),
  );
  return template(
    pageTitle,
    tribeDetails
  );
};
