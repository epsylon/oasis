const { div, h2, p, section, button, form, img, a, textarea, input, br, span, strong } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { renderUrl } = require('../backend/renderUrl');

function resolvePhoto(photoField, size = 256) {
  if (photoField == "/image/256/%260000000000000000000000000000000000000000000%3D.sha256"){
    return '/assets/images/default-avatar.png';
  } else {
    return photoField;
  }
};

const generateFilterButtons = (filters, currentFilter) =>
  filters.map(mode =>
    form({ method: 'GET', action: '/inhabitants' },
      input({ type: 'hidden', name: 'filter', value: mode }),
      button({
        type: 'submit',
        class: currentFilter === mode ? 'filter-btn active' : 'filter-btn'
      }, i18n[mode + 'Button'] || i18n[mode + 'SectionTitle'] || mode)
    )
  );

function formatRange(bucket, i18n) {
  const ws = i18n.weeksShort || 'w';
  const ms = i18n.monthsShort || 'm';
  if (bucket === 'green') return `<2 ${ws}`;
  if (bucket === 'orange') return `2 ${ws}–6 ${ms}`;
  return `≥6 ${ms}`;
}

function lastActivityBadge(user) {
  const label = i18n.inhabitantActivityLevel;
  const bucket = user.lastActivityBucket || 'red';
  const dotClass = bucket === 'green' ? 'green' : bucket === 'orange' ? 'orange' : 'red';
  return div(
    { class: 'inhabitant-last-activity' },
    span({ class: 'label' }, `${label}: `),
    span({ class: `activity-dot ${dotClass}` }, '')
  );
}

const renderInhabitantCard = (user, filter, currentUserId) => {
  const isMe = user.id === currentUserId;
  return div({ class: 'inhabitant-card' },
    div({ class: 'inhabitant-left' },
      a(
         { href: `/author/${encodeURIComponent(user.id)}` },
         img({ class: 'inhabitant-photo-details', src: resolvePhoto(user.photo), alt: user.name })
      ),
      br(),
      span(`${i18n.bankingUserEngagementScore}: `),
     h2(strong(typeof user.karmaScore === 'number' ? user.karmaScore : 0)),
     lastActivityBadge(user)
    ),
    div({ class: 'inhabitant-details' },
      h2(user.name),
      user.description ? p(...renderUrl(user.description)) : null,
      filter === 'MATCHSKILLS' && user.commonSkills?.length
        ? div({ class: 'matchskills' },
            p(`${i18n.commonSkills}: ${user.commonSkills.join(', ')}`),
            p(`${i18n.matchScore}: ${Math.round(user.matchScore * 100)}%`)
          )
        : null,
      filter === 'SUGGESTED' && user.mutualCount
        ? p(`${i18n.mutualFollowers}: ${user.mutualCount}`) : null,
      filter === 'blocked' && user.isBlocked
        ? p(i18n.blockedLabel) : null,
      p(a({ class: 'user-link', href: `/author/${encodeURIComponent(user.id)}` }, user.id)),
      user.ecoAddress
        ? div({ class: "eco-wallet" },
            p(`${i18n.bankWalletConnected}: `, strong(user.ecoAddress))
          )
        : div({ class: "eco-wallet" },
            p(i18n.ecoWalletNotConfigured || "ECOin Wallet not configured")
          ),
      div(
        { class: 'cv-actions', style: 'display:flex; flex-direction:column; gap:8px; margin-top:12px;' },
        isMe
          ? p(i18n.relationshipYou)
          : (filter === 'CVs' || filter === 'MATCHSKILLS' || filter === 'SUGGESTED' || filter === 'TOP KARMA')
            ? form(
                { method: 'GET', action: `/inhabitant/${encodeURIComponent(user.id)}` },
                button({ type: 'submit', class: 'btn' }, i18n.inhabitantviewDetails)
              )
            : null,
        !isMe
          ? form(
              { method: 'GET', action: '/pm' },
              input({ type: 'hidden', name: 'recipients', value: user.id }),
              button({ type: 'submit', class: 'btn' }, i18n.pmCreateButton)
            )
          : null
      )
    )
  );
};

const renderGalleryInhabitants = inhabitants =>
  div(
    { class: "gallery", style: 'display:grid; grid-template-columns: repeat(3, 1fr); gap:16px;' },
    inhabitants.length
      ? inhabitants.map(u =>
          a({ href: `#inhabitant-${encodeURIComponent(u.id)}`, class: "gallery-item" },
            img({ src: resolvePhoto(u.photo), alt: u.name || "Anonymous", class: "gallery-image" })
          )
        )
      : p(i18n.noInhabitantsFound)
  );

const renderLightbox = inhabitants =>
  inhabitants.map(u =>
    div(
      { id: `inhabitant-${encodeURIComponent(u.id)}`, class: "lightbox" },
      a({ href: "#", class: "lightbox-close" }, "×"),
      img({ src: resolvePhoto(u.photo), class: "lightbox-image", alt: u.name || "Anonymous" })
    )
  );

exports.inhabitantsView = (inhabitants, filter, query, currentUserId) => {
  const title = filter === 'contacts'    ? i18n.yourContacts
               : filter === 'CVs'         ? i18n.allCVs
               : filter === 'MATCHSKILLS' ? i18n.matchSkills
               : filter === 'SUGGESTED'   ? i18n.suggestedSectionTitle
               : filter === 'blocked'     ? i18n.blockedSectionTitle
               : filter === 'GALLERY'     ? i18n.gallerySectionTitle
               : filter === 'TOP KARMA'    ? i18n.topkarmaSectionTitle
               : filter === 'TOP ACTIVITY' ? (i18n.topactivitySectionTitle)
                                          : i18n.allInhabitants;

  const showCVFilters = filter === 'CVs' || filter === 'MATCHSKILLS';
  const filters = ['all', 'TOP ACTIVITY', 'TOP KARMA', 'contacts', 'SUGGESTED', 'blocked', 'CVs', 'MATCHSKILLS', 'GALLERY'];

  return template(
    title,
    section(
      div({ class: 'tags-header' },
        h2(title),
        p(i18n.discoverPeople)
      ),
      div({ class: 'filters' },
        form({ method: 'GET', action: '/inhabitants' },
          input({ type: 'hidden', name: 'filter', value: filter }),
          input({
            type: 'text',
            name: 'search',
            placeholder: i18n.searchInhabitantsPlaceholder,
            value: query.search || ''
          }),
          showCVFilters
            ? [
                input({ type: 'text', name: 'location', placeholder: i18n.filterLocation, value: query.location || '' }),
                input({ type: 'text', name: 'language', placeholder: i18n.filterLanguage, value: query.language || '' }),
                input({ type: 'text', name: 'skills', placeholder: i18n.filterSkills, value: query.skills || '' })
              ]
            : null,
          br(),
          button({ type: 'submit' }, i18n.applyFilters)
        )
      ),
      div({ class: 'inhabitant-action', style: 'margin-top:1em;' },
        ...generateFilterButtons(filters, filter)
      ),
      filter === 'GALLERY'
        ? renderGalleryInhabitants(inhabitants)
        : div({ class: 'inhabitants-list' },
            inhabitants.length
              ? inhabitants.map(user => renderInhabitantCard(user, filter, currentUserId))
              : p({ class: 'no-results' }, i18n.noInhabitantsFound)
          ),
      ...renderLightbox(inhabitants)
    )
  );
};

exports.inhabitantsProfileView = ({ about = {}, cv = {}, feed = [] }, currentUserId) => {
  const profile = Object.keys(cv).length ? cv : about;
  const id = cv.author || about.about || 'unknown';
  const name = cv.name || about.name || 'Unnamed';
  const description = cv.description || about.description || '';
  const image = resolvePhoto(cv.photo) || '/assets/images/default-oasis.jpg';
  const location = cv.location || '';
  const languages = typeof cv.languages === 'string'
    ? cv.languages.split(',').map(x => x.trim()).filter(Boolean)
    : Array.isArray(cv.languages) ? cv.languages : [];
  const skills = [
    ...(cv.personalSkills || []),
    ...(cv.oasisSkills || []),
    ...(cv.educationalSkills || []),
    ...(cv.professionalSkills || [])
  ];
  const status = cv.status || '';
  const preferences = cv.preferences || '';
  const createdAt = cv.createdAt ? new Date(cv.createdAt).toLocaleString() : '';
  const isMe = id === currentUserId;
  const title = i18n.inhabitantProfileTitle || i18n.inhabitantviewDetails;

  const lastFromFeed = Array.isArray(feed) && feed.length ? feed.reduce((mx, m) => Math.max(mx, m.value?.timestamp || 0), 0) : null;
  const now = Date.now();
  const delta = lastFromFeed ? Math.max(0, now - lastFromFeed) : Number.POSITIVE_INFINITY;
  const days = delta / 86400000;
  const bucket = days < 14 ? 'green' : days < 182.5 ? 'orange' : 'red';
  const ws = i18n.weeksShort || 'w';
  const ms = i18n.monthsShort || 'm';
  const range = bucket === 'green' ? `<2 ${ws}` : bucket === 'orange' ? `2 ${ws}–6 ${ms}` : `≥6 ${ms}`;
  const dotClass = bucket === 'green' ? 'green' : bucket === 'orange' ? 'orange' : 'red';

  return template(
    name,
    section(
      div({ class: 'tags-header' },
        h2(title),
        p(i18n.discoverPeople)
      ),
      div({ class: 'mode-buttons', style: 'display:flex; gap:8px; margin-top:16px;' },
        ...generateFilterButtons(['all', 'TOP KARMA', 'contacts', 'SUGGESTED', 'blocked', 'CVs', 'MATCHSKILLS', 'GALLERY'], 'all')
      ),
      div({ class: 'inhabitant-card', style: 'margin-top:32px;' },
        div({ class: 'inhabitant-details' },
          img({ class: 'inhabitant-photo-details', src: image, alt: name }),
          h2(name),
          p(a({ class: 'user-link', href: `/author/${encodeURIComponent(id)}` }, id)),
          description ? p(...renderUrl(description)) : null,
          location ? p(`${i18n.locationLabel}: ${location}`) : null,
          languages.length ? p(`${i18n.languagesLabel}: ${languages.join(', ').toUpperCase()}`) : null,
          skills.length ? p(`${i18n.skillsLabel}: ${skills.join(', ')}`) : null,
          div(
            { class: 'inhabitant-last-activity' },
            span({ class: 'label' }, `${i18n.inhabitantActivityLevel}:`),
            span({ class: `activity-dot ${dotClass}` }, ''),
            span({ class: 'range' }, range)
          ),
          status ? p(`${i18n.statusLabel || 'Status'}: ${status}`) : null,
          preferences ? p(`${i18n.preferencesLabel || 'Preferences'}: ${preferences}`) : null,
          createdAt ? p(`${i18n.createdAtLabel || 'Created at'}: ${createdAt}`) : null,
          !isMe
            ? form(
                { method: 'GET', action: '/pm' },
                input({ type: 'hidden', name: 'recipients', value: id }),
                button({ type: 'submit', class: 'btn', style: 'margin-top:1em;' }, i18n.pmCreateButton)
              )
            : null
        )
      ),
      feed.length
        ? section({ class: 'profile-feed' },
            h2(i18n.latestInteractions),
            ...feed.map(m => {
              const text = (m.value.content.text || '').replace(/<br\s*\/?>/g, '');
              return div({ class: 'post' }, p(...renderUrl(text)));
            })
          )
        : null
    )
  );
};
