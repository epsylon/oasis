const { div, h2, p, section, button, form, a, textarea, br, input, table, tr, th, td, img, video: videoHyperaxe, audio: audioHyperaxe } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { renderTextWithStyles } = require('../backend/renderTextWithStyles');
const { config } = require('../server/SSB_server.js');

const userId = config.keys.id

const generateFilterButtons = (filters, currentFilter, action) => {
  return div({ class: 'filter-buttons-container', style: 'display: flex; gap: 16px; flex-wrap: wrap;' },
    filters.map(mode =>
      form({ method: 'GET', action },
        input({ type: 'hidden', name: 'filter', value: mode }),
        button({ type: 'submit', class: currentFilter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
      )
    )
  );
};

const renderTrendingCard = (item, votes, categories) => {
  const c = item.value.content;
  const created = new Date(item.value.timestamp).toLocaleString();

  let contentHtml;
  
  if (c.type === 'event') {
    const { title, description, date, location, price, url: eventUrl, attendees, tags, organizer, status, isPublic, id } = c;
    contentHtml = div({ class: 'trending-event' },
    form({ method: "GET", action: `/events/${encodeURIComponent(item.key)}` },
      button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
    ),
    h2(title),
    description ? p(`${i18n.trendingDescription}: ${description}`) : "",
    date ? p(`${i18n.trendingDate}: ${new Date(date).toLocaleString()}`) : "",
    location ? p(`${i18n.trendingLocation}: ${location}`) : "",
    status ? p(`${i18n.trendingStatus}: ${status}`) : "",
    typeof isPublic === 'boolean' ? p(`${i18n.trendingIsPublic || 'Public'}: ${isPublic ? 'Yes' : 'No'}`) : "",
    price ? p(`${i18n.trendingPrice}: ${price} ECO`) : "",
    eventUrl ? p(`${i18n.trendingUrl}: `, a({ href: eventUrl, target: '_blank' }, eventUrl)) : "",
    organizer ? p(`${i18n.trendingOrganizer || 'Organizer'}: `, a({ href: `/author/${encodeURIComponent(organizer)}` }, organizer)) : "",
    Array.isArray(attendees) ? p(`${i18n.attendees}: ${attendees.length}`) : "",
    tags?.length
      ? div(tags.map(tag =>
          a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
        ))
      : null
    );
  } else if (c.type === 'bookmark') {
    const { author, url, tags, description, category, lastVisit } = c;
    contentHtml = div({ class: 'trending-bookmark' },
    form({ method: "GET", action: `/bookmarks/${encodeURIComponent(item.key)}` },
      button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
    ),
    description ? p(`${description}`) : "",
    h2(url ? p(a({ href: url, target: '_blank', class: "bookmark-url" }, url)) : ""),
    category ? p(`${i18n.bookmarkCategory}: ${category}`) : "",
    lastVisit ? p(`${i18n.bookmarkLastVisit}: ${new Date(lastVisit).toLocaleString()}`) : "",
    tags?.length
      ? div(tags.map(tag =>
          a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
        ))
      : ""
  );
  } else if (c.type === 'task') {
    const { title, description, startTime, endTime, priority, location, tags, isPublic, assignees, status, author } = c;
    contentHtml = div({ class: 'trending-task' },
      form({ method: "GET", action: `/tasks/${encodeURIComponent(item.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      h2(title),
      description ? p(`${i18n.trendingDescription}: ${description}`) : "",
      startTime ? p(`${i18n.trendingStart}: ${new Date(startTime).toLocaleString()}`) : "",
      endTime ? p(`${i18n.trendingEnd}: ${new Date(endTime).toLocaleString()}`) : "",
      priority ? p(`${i18n.trendingPriority}: ${priority}`) : "",
      location ? p(`${i18n.trendingLocation}: ${location}`) : "",
      tags?.length
        ? div(tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
          ))
        : "",
      typeof isPublic === 'boolean' ? p(`${i18n.trendingIsPublic || 'Public'}: ${isPublic ? 'Yes' : 'No'}`) : "",
      Array.isArray(assignees) ? p(`${i18n.trendingAssignees || 'Assignees'}: ${assignees.length}`) : "",
      status ? p(`${i18n.trendingStatus}: ${status}`) : "",
      author ? p(`${i18n.trendingAuthor || 'Author'}: `, a({ href: `/author/${encodeURIComponent(author)}` }, author)) : ""
    );
  } else if (c.type === 'image') {
    const { url, title, description, tags, meme } = c;
    contentHtml = div({ class: 'trending-image' },
      form({ method: "GET", action: `/images/${encodeURIComponent(item.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      title ? h2(title) : "",
      description ? p(description) : "",
      meme ? h2(`${i18n.trendingCategory}: ${i18n.meme}`) : "",
      img({ src: `/blob/${encodeURIComponent(url)}`, class: 'feed-image' }),
      br,
      tags?.length
        ? div(tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
          ))
        : ""
    );
  } else if (c.type === 'audio') {
    const { url, mimeType, title, description } = c;
    contentHtml = div({ class: 'trending-audio' },
      form({ method: "GET", action: `/audios/${encodeURIComponent(item.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
    ),
      title?.trim() ? h2(title) : "",
      description?.trim() ? p(description) : "",
      url
        ? div({ class: "audio-container" },
            audioHyperaxe({
              controls: true,
              src: `/blob/${encodeURIComponent(url)}`,
              type: mimeType
            })
          )
        : p(i18n.audioNoFile)
    );
  } else if (c.type === 'video') {
    const { url, mimeType, title, description } = c;
    contentHtml = div({ class: 'trending-video' },
      form({ method: "GET", action: `/videos/${encodeURIComponent(item.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      title?.trim() ? h2(title) : "",
      description?.trim() ? p(description) : "",
      url
      ? div({ class: "video-container" },
          videoHyperaxe({
            controls: true,
            src: `/blob/${encodeURIComponent(url)}`,
            type: mimeType,
            preload: 'metadata',
            width: '640',
            height: '360'
          })
        )
      : p(i18n.videoNoFile)
  );
  } else if (c.type === 'document') {
    const { url, title, description, tags = [], key } = c;
    contentHtml = div({ class: 'trending-document' },
    form({ method: "GET", action: `/documents/${encodeURIComponent(item.key)}` },
      button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
    ),
    br,
    title?.trim() ? h2(title) : "",
    description?.trim() ? p(description) : "",
    div({
      id: `pdf-container-${key || url}`,
      class: 'pdf-viewer-container',
      'data-pdf-url': `/blob/${encodeURIComponent(url)}`
    }),
    tags.length
      ? div(tags.map(tag =>
          a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
        ))
      : null
     );
    } else if (c.type === 'feed') {
      const { text, author, createdAt, opinions, opinions_inhabitants, refeeds, refeeds_inhabitants } = c;
      contentHtml = div({ class: 'trending-feed' },
        h2(text),
        p(i18n.author + ": ", a({ href: `/author/${encodeURIComponent(author)}`, target: "_blank" }, author)),
        p(i18n.createdAt + ": " + new Date(createdAt).toLocaleString()),
        h2(i18n.tribeFeedRefeeds + ": " + refeeds)
     );
     } else if (c.type === 'votes') {
      const { question, deadline, status, votes, totalVotes } = c;
      const votesList = votes && typeof votes === 'object'
        ? Object.entries(votes).map(([option, count]) => ({ option, count }))
        : [];
      contentHtml = div({ class: 'trending-votes' },
        form({ method: "GET", action: `/votes/${encodeURIComponent(item.key)}` },
          button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        h2(question),
        p(`${i18n.deadline}: ${deadline ? new Date(deadline).toLocaleString() : ''}`),
        h2(`${i18n.voteTotalVotes}: ${totalVotes}`),
        table(
          tr(...votesList.map(({ option }) => th(i18n[option] || option))),
          tr(...votesList.map(({ count }) => td(count)))
        )
      );
    } else if (c.type === 'report') {
      const { title, description, category, createdAt, author, image, tags, confirmations, severity, status, isAnonymous } = c;
      contentHtml = div({ class: 'trending-report' },
        form({ method: "GET", action: `/reports/${encodeURIComponent(item.id)}` },
          button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        p(`${i18n.title}: ${title}`),
        description ? p(`${i18n.description}: ${description}`) : "",
        category ? p(`${i18n.category}: ${category}`) : "",
        severity ? p(`${i18n.severity || 'Severity'}: ${severity}`) : "",
        status ? p(`${i18n.status}: ${status}`) : "",
        image ? img({ src: `/blob/${encodeURIComponent(image)}`, class: 'feed-image' }) : "",
        createdAt ? p(`${i18n.date}: ${new Date(createdAt).toLocaleString()}`) : "",
        typeof isAnonymous === 'boolean'
          ? p(`${i18n.author || 'Author'}: `, isAnonymous
          ? i18n.reportsAnonymousAuthor || 'Anonymous'
          : a({ href: `/author/${encodeURIComponent(author)}`, target: '_blank' }, author))
          : author ? p(`${i18n.author || 'Author'}: `, a({ href: `/author/${encodeURIComponent(author)}`, target: '_blank' }, author)) : "",
        Array.isArray(confirmations) ? h2(`${i18n.confirmations || 'Confirmations'}: ${confirmations.length}`) : "",
        tags?.length
          ? div(tags.map(tag =>
          a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link" }, `#${tag}`)
            ))
          : ""
      );
    } else if (c.type === 'transfer') {
      const { from, to, concept, amount, deadline, status, tags, confirmedBy } = c;
      contentHtml = div({ class: 'trending-transfer' },
      form({ method: "GET", action: `/transfers/${encodeURIComponent(item.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      h2(i18n.concept + ": " + concept),
      p(i18n.from + ": ", a({ href: `/author/${encodeURIComponent(from)}`, target: "_blank" }, from)),
      p(i18n.to + ": ", a({ href: `/author/${encodeURIComponent(to)}`, target: "_blank" }, to)),
      h2(i18n.amount + ": " + amount),
      p(i18n.deadline + ": " + (deadline ? new Date(deadline).toLocaleString() : "")),
      p(i18n.status + ": " + status),
      p(`${i18n.transfersConfirmations}: ${confirmedBy.length}/2`),
      tags?.length
        ? div(tags.map(tag =>
            a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
          ))
        : ""
    );
  } else {
    contentHtml = div({ class: 'styled-text', innerHTML: renderTextWithStyles(c.text || c.description || c.title || '[no content]') });
  }

  return div({ class: 'trending-card', style: 'background-color:#2c2f33;border-radius:8px;padding:16px;border:1px solid #444;' },
    contentHtml,
    p(`${i18n.trendingAuthor}: `, a({ href: `/author/${encodeURIComponent(item.value.author)}` }, item.value.author)),
    p(`${i18n.trendingCreatedAtLabel || i18n.trendingCreatedAt}: ${created}`),
    h2(`${i18n.trendingTotalOpinions || i18n.trendingTotalCount}: ${votes}`),
    div({ class: "voting-buttons" },
      categories.map(cat =>
        form({ method: "POST", action: `/trending/${encodeURIComponent(item.key)}/${cat}` },
          button({ class: "vote-btn" }, `${i18n['vote' + cat.charAt(0).toUpperCase() + cat.slice(1)]} [${c.opinions?.[cat] || 0}]`)
        )
      )
    )
  );
};

exports.trendingView = (items, filter, categories) => {
  const title = i18n.trendingTitle;
  const baseFilters = ['RECENT', 'ALL', 'MINE', 'TOP'];
  const contentFilters = [
    ['bookmark', 'event', 'task'],
    ['votes', 'report', 'feed'],
    ['image', 'video', 'audio', 'document'],
    ['transfer']
  ];
  let filteredItems = items.filter(item => item.value.content.type !== 'tombstone');
  if (filter === 'ALL') {
  } else if (filter === 'MINE') {
    filteredItems = filteredItems.filter(item => item.value.author === userId);
  } else if (filter === 'RECENT') {
    const now = Date.now();
    filteredItems = filteredItems.filter(item => now - item.value.timestamp < 24 * 60 * 60 * 1000); 
  } else if (filter === 'TOP') {
    filteredItems = filteredItems.sort((a, b) => {
      const aVotes = (a.value.content.opinions_inhabitants || []).length;
      const bVotes = (b.value.content.opinions_inhabitants || []).length;
      if (bVotes !== aVotes) return bVotes - aVotes;
      return b.value.timestamp - a.value.timestamp;
    });
  } else if (contentFilters.some(row => row.includes(filter))) {
    filteredItems = filteredItems.filter(item => item.value.content.type === filter);
  }
  filteredItems.sort((a, b) => b.value.timestamp - a.value.timestamp);
  const header = div({ class: 'tags-header' },
    h2(title),
    p(i18n.exploreTrending)
  );

  let html = template(
    title,
    section(
      header,
      div({ class: 'mode-buttons', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;margin-bottom:24px;' },
        generateFilterButtons(baseFilters, filter, '/trending'),
        ...contentFilters.map(row =>
          div({ style: 'display:flex;flex-direction:column;gap:8px;' },
            row.map(mode =>
              form({ method: 'GET', action: '/trending' },
                input({ type: 'hidden', name: 'filter', value: mode }),
                button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
              )
            )
          )
        )
      ),
      section(
        filteredItems.length
          ? div({ class: 'trending-container', style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;' },
              filteredItems.map(item => {
                const c = item.value.content;
                const votes = Object.values(c.opinions || {}).reduce((s, n) => s + n, 0);
                return renderTrendingCard(item, votes, categories);
              })
            )
          : div({ class: 'no-results' }, p(i18n.trendingNoContentMessage))
      )
    )
  );
  const hasDocument = filteredItems.some(item => item.value.content.type === 'document');
  if (hasDocument) {
    html += `
      <script type="module" src="/js/pdf.min.mjs"></script>
      <script src="/js/pdf-viewer.js"></script>
    `;
  }

  return html;
};
