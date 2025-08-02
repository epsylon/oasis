const { div, h2, p, section, button, form, img, a, textarea, input, br } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { renderUrl } = require('../backend/renderUrl');

function resolvePhoto(photoField, size = 256) {
  if (typeof photoField === 'string' && photoField.startsWith('/image/')) {
    return photoField;
  }
  if (/^&[A-Za-z0-9+/=]+\.sha256$/.test(photoField)) {
    return `/image/${size}/${encodeURIComponent(photoField)}`;
  }
  return '/assets/images/default-avatar.png';
}

const generateFilterButtons = (filters, currentFilter) => {
  return filters.map(mode => 
    form({ method: 'GET', action: '/inhabitants' },
      input({ type: 'hidden', name: 'filter', value: mode }),
      button({
        type: 'submit',
        class: currentFilter === mode ? 'filter-btn active' : 'filter-btn'
      }, i18n[mode + 'Button'] || i18n[mode + 'SectionTitle'] || mode)
    )
  );
};

const renderInhabitantCard = (user, filter) => {
  return div({ class: 'inhabitant-card' },
  img({
    class: 'inhabitant-photo',
    src: resolvePhoto(user.photo),
  }),
    div({ class: 'inhabitant-details' },
      h2(user.name),
        user.description ? p(...renderUrl(user.description)) : null,
      filter === 'MATCHSKILLS' && user.commonSkills?.length
        ? p(`${i18n.commonSkills}: ${user.commonSkills.join(', ')}`) : null,
      filter === 'SUGGESTED' && user.mutualCount
        ? p(`${i18n.mutualFollowers}: ${user.mutualCount}`) : null,
      filter === 'blocked' && user.isBlocked
        ? p(i18n.blockedLabel) : null,
      p(a({ class: 'user-link', href: `/author/${encodeURIComponent(user.id)}` }, user.id)),
      ['CVs', 'MATCHSKILLS', 'SUGGESTED'].includes(filter)
        ? a({ href: `/inhabitant/${encodeURIComponent(user.id)}`, class: 'view-profile-btn' }, i18n.inhabitantviewDetails)
        : null
    )
  );
};

const renderGalleryInhabitants = (inhabitants) => {
  return div({ class: "gallery", style: 'display:grid; grid-template-columns: repeat(3, 1fr); gap:16px;' },
    inhabitants.length
      ? inhabitants.map(u => {
          const photo = resolvePhoto(u.photo);
          return a({ href: `#inhabitant-${encodeURIComponent(u.id)}`, class: "gallery-item" },
            img({
              src: photo,
              alt: u.name || "Anonymous",
              class: "gallery-image"
            })
          );
        })
      : p(i18n.noInhabitantsFound)
  );
};

const renderLightbox = (inhabitants) => {
  return inhabitants.map(u => {
  const photoUrl = resolvePhoto(u.photo);
    return div(
      { id: `inhabitant-${encodeURIComponent(u.id)}`, class: "lightbox" },
      a({ href: "#", class: "lightbox-close" }, "×"),
      img({ 
        src: photoUrl, 
        class: "lightbox-image", 
        alt: u.name || "Anonymous" 
      })
    );
  });
};

exports.inhabitantsView = (inhabitants, filter, query) => {
  const title = filter === 'contacts'    ? i18n.yourContacts              :
                filter === 'CVs'         ? i18n.allCVs                    :
                filter === 'MATCHSKILLS' ? i18n.matchSkills               :
                filter === 'SUGGESTED'   ? i18n.suggestedSectionTitle     :
                filter === 'blocked'     ? i18n.blockedSectionTitle       :
                filter === 'GALLERY'     ? i18n.gallerySectionTitle       :
                                            i18n.allInhabitants;

  const showCVFilters = filter === 'CVs' || filter === 'MATCHSKILLS';
  const filters = ['all', 'contacts', 'SUGGESTED', 'blocked', 'CVs', 'MATCHSKILLS', 'GALLERY'];

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
                input({
                  type: 'text',
                  name: 'location',
                  placeholder: i18n.filterLocation,
                  value: query.location || ''
                }),
                input({
                  type: 'text',
                  name: 'language',
                  placeholder: i18n.filterLanguage,
                  value: query.language || ''
                }),
                input({
                  type: 'text',
                  name: 'skills',
                  placeholder: i18n.filterSkills,
                  value: query.skills || ''
                })
              ]
            : null,
          br(),
          button({ type: 'submit' }, i18n.applyFilters)
        )
      ),
      div({ class: 'inhabitant-action', style: 'margin-top: 1em;' },
        generateFilterButtons(filters, filter)
      ),
      
      filter === 'GALLERY' 
        ? renderGalleryInhabitants(inhabitants)
        : div({ class: 'inhabitants-list' },
            inhabitants && inhabitants.length > 0
              ? inhabitants.map(user => renderInhabitantCard(user, filter))
              : p({ class: 'no-results' }, i18n.noInhabitantsFound)
          ),
      ...renderLightbox(inhabitants)
    )
  );
};

exports.inhabitantsProfileView = ({ about = {}, cv = {}, feed = [] }) => {
  const profile = cv || about || {};
  const id = cv?.author || about?.about || 'unknown';
  const name = cv?.name || about?.name || 'Unnamed';
  const description = cv?.description || about?.description || '';
  const image = resolvePhoto(cv?.photo) || '/assets/images/default-oasis.jpg';
  const location = cv?.location || '';
  const languages = typeof cv?.languages === 'string'
    ? cv.languages.split(',').map(x => x.trim()).filter(Boolean)
    : Array.isArray(cv?.languages) ? cv.languages : [];
  const skills = [
    ...(cv?.personalSkills || []),
    ...(cv?.oasisSkills || []),
    ...(cv?.educationalSkills || []),
    ...(cv?.professionalSkills || [])
  ];
  const status = cv?.status || '';
  const preferences = cv?.preferences || '';
  const createdAt = cv?.createdAt ? new Date(cv.createdAt).toLocaleString() : '';
  const title = i18n.inhabitantProfileTitle || i18n.inhabitantviewDetails;

  const header = div({ class: 'tags-header' },
    h2(title),
    p(i18n.discoverPeople)
  );

  return template(
    name,
    section(
      header,
      div({ class: 'mode-buttons', style: 'display:flex; gap:8px; margin-top:16px;' },
        generateFilterButtons(['all', 'contacts', 'SUGGESTED', 'blocked', 'CVs', 'MATCHSKILLS', 'GALLERY'], 'all')
      ),
      div({ class: 'inhabitant-card', style: 'margin-top:32px;' },
        img({ class: 'inhabitant-photo', src: image, alt: name }),
        div({ class: 'inhabitant-details' },
          h2(name),
          p(a({ class: 'user-link', href: `/author/${encodeURIComponent(id)}` }, id)),
          description ? p(...renderUrl(description)) : null,
          location ? p(`${i18n.locationLabel}: ${location}`) : null,
          languages.length ? p(`${i18n.languagesLabel}: ${languages.join(', ').toUpperCase()}`) : null,
          skills.length ? p(`${i18n.skillsLabel}: ${skills.join(', ')}`) : null,
          status ? p(`${i18n.statusLabel || 'Status'}: ${status}`) : null,
          preferences ? p(`${i18n.preferencesLabel || 'Preferences'}: ${preferences}`) : null,
          createdAt ? p(`${i18n.createdAtLabel || 'Created at'}: ${createdAt}`) : null
        )
      ),
      feed && feed.length
        ? section({ class: 'profile-feed' },
            h2(i18n.latestInteractions),
            feed.map(m => div({ class: 'post' }, p(...renderUrl(m.value.content.text || ''))))
          )
        : null
    )
  );
};
