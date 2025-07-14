const { div, h2, p, section, button, form, a, textarea, br, input, table, tr, th, td, img, video: videoHyperaxe, audio: audioHyperaxe, span } = require("../server/node_modules/hyperaxe");
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
  
  if (c.type === 'bookmark') {
    const { author, url, tags, description, category, lastVisit } = c;
    contentHtml = div({ class: 'trending-bookmark' },
    div({ class: 'card-section bookmark' }, 
      form({ method: "GET", action: `/bookmarks/${encodeURIComponent(item.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.bookmarkDescriptionLabel + ':'), span({ class: 'card-value' }, description)) : "",
      h2(url ? p(a({ href: url, target: '_blank', class: "bookmark-url" }, url)) : ""),
      lastVisit ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.bookmarkLastVisit + ':'), span({ class: 'card-value' }, new Date(lastVisit).toLocaleString())) : ""
    )
  );
  } else if (c.type === 'image') {
    const { url, title, description, tags, meme } = c;
    contentHtml = div({ class: 'trending-image' },
    div({ class: 'card-section image' },
      form({ method: "GET", action: `/images/${encodeURIComponent(item.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.imageTitleLabel + ':'), span({ class: 'card-value' }, title)) : "",
      description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.imageDescriptionLabel + ':'), span({ class: 'card-value' }, description)) : "",
      meme ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.trendingCategory + ':'), span({ class: 'card-value' }, i18n.meme)) : "",
      br,
      div({ class: 'card-field' }, img({ src: `/blob/${encodeURIComponent(url)}`, class: 'feed-image' }))
    )
  );
  } else if (c.type === 'audio') {
    const { url, mimeType, title, description } = c;
    contentHtml = div({ class: 'trending-audio' },
    div({ class: 'card-section audio' },
      form({ method: "GET", action: `/audios/${encodeURIComponent(item.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      title?.trim() ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.audioTitleLabel + ':'), span({ class: 'card-value' }, title)) : "",
      description?.trim() ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.audioDescriptionLabel + ':'), span({ class: 'card-value' }, description)) : "",
      br,
      url
        ? div({ class: 'card-field audio-container' },
            audioHyperaxe({
              controls: true,
              src: `/blob/${encodeURIComponent(url)}`,
              type: mimeType
            })
          )
        : div({ class: 'card-field' }, p(i18n.audioNoFile))
    )
  );
  } else if (c.type === 'video') {
    const { url, mimeType, title, description } = c;
    contentHtml = div({ class: 'trending-video' },
    div({ class: 'card-section video' },
      form({ method: "GET", action: `/videos/${encodeURIComponent(item.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      title?.trim() ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.videoTitleLabel + ':'), span({ class: 'card-value' }, title)) : "",
      description?.trim() ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.videoDescriptionLabel + ':'), span({ class: 'card-value' }, description)) : "",
      br,
      url
        ? div({ class: 'card-field video-container' },
            videoHyperaxe({
              controls: true,
              src: `/blob/${encodeURIComponent(url)}`,
              type: mimeType,
              preload: 'metadata',
              width: '640',
              height: '360'
            })
          )
        : div({ class: 'card-field' }, p(i18n.videoNoFile))
    )
  );
  } else if (c.type === 'document') {
    const { url, title, description, tags = [], key } = c;
    contentHtml = div({ class: 'trending-document' },
    div({ class: 'card-section document' },
      form({ method: "GET", action: `/documents/${encodeURIComponent(item.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      title?.trim() ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.documentTitleLabel + ':'), span({ class: 'card-value' }, title)) : "",
      description?.trim() ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.documentDescriptionLabel + ':'), span({ class: 'card-value' }, description)) : "",
      br,
      div({
        id: `pdf-container-${key || url}`,
        class: 'card-field pdf-viewer-container',
        'data-pdf-url': `/blob/${encodeURIComponent(url)}`
      })
    )
  );
  } else if (c.type === 'feed') {
    const { text, refeeds } = c;
    contentHtml = div({ class: 'trending-feed' },
    div({ class: 'card-section feed' },
      h2(text),
      h2({ class: 'card-field' }, span({ class: 'card-label' }, i18n.tribeFeedRefeeds + ': '), span({ class: 'card-label' }, refeeds))
    )
  );
  } else if (c.type === 'votes') {
    const { question, deadline, status, votes, totalVotes } = c;
    const votesList = votes && typeof votes === 'object'
    ? Object.entries(votes).map(([option, count]) => ({ option, count }))
    : [];
    contentHtml = div({ class: 'trending-votes' },
    div({ class: 'card-section votes' },
      form({ method: "GET", action: `/votes/${encodeURIComponent(item.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.voteQuestionLabel + ':'), span({ class: 'card-value' }, question)),
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.voteDeadline + ':'), span({ class: 'card-value' }, deadline ? new Date(deadline).toLocaleString() : '')),
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.voteTotalVotes + ':'), span({ class: 'card-value' }, totalVotes)),
      table(
        tr(...votesList.map(({ option }) => th(i18n[option] || option))),
        tr(...votesList.map(({ count }) => td(count)))
      )
    )
  );
  } else if (c.type === 'transfer') {
    const { from, to, concept, amount, deadline, status, tags, confirmedBy } = c;
    contentHtml = div({ class: 'trending-transfer' },
    div({ class: 'card-section transfer' },
      form({ method: "GET", action: `/transfers/${encodeURIComponent(item.key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.concept + ':'), span({ class: 'card-value' }, concept)),
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.deadline + ':'), span({ class: 'card-value' }, deadline ? new Date(deadline).toLocaleString() : '')),
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.status + ':'), span({ class: 'card-value' }, status)),
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.amount + ':'), span({ class: 'card-value' }, amount)),
      br,
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.from + ':'), span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(from)}`, target: "_blank" }, from))),
      div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.to + ':'), span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(to)}`, target: "_blank" }, to))),
      br,
      div({ class: 'card-field' }, h2({ class: 'card-label' }, i18n.transfersConfirmations + ': ' + `${confirmedBy.length}/2`))
    )
  );
  } else {
    contentHtml = div({ class: 'styled-text' },
    div({ class: 'card-section styled-text-content' },
    div({ class: 'card-field' }, 
      span({ class: 'card-label' }, i18n.textContentLabel + ':'), 
      span({ class: 'card-value', innerHTML: renderTextWithStyles(c.text || c.description || c.title || '[no content]') })
     )
    )
   );
  }

  return div({ class: 'trending-card', style: 'background-color:#2c2f33;border-radius:8px;padding:16px;border:1px solid #444;' },
    contentHtml,
    p({ class: 'card-footer' },
      span({ class: 'date-link' }, `${created} ${i18n.performed} `),
      a({ href: `/author/${encodeURIComponent(item.value.author)}`, class: 'user-link' }, `${item.value.author}`)
    ),  
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
    ['votes', 'feed', 'transfer'],
    ['bookmark', 'image', 'video', 'audio', 'document']
  ];
  let filteredItems = items.filter(item => {
    const content = item.value?.content || item.content;
    if (!content || typeof content !== 'object') return false;
    if (content.type === 'tombstone') return false;
    return true;
  });
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
