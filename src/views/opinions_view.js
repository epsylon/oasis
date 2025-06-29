const { div, h2, p, section, button, form, a, img, video: videoHyperaxe, audio: audioHyperaxe, input, table, tr, th, td, br } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { config } = require('../server/SSB_server.js');

const generateFilterButtons = (filters, currentFilter) => {
  return filters.map(mode =>
    form({ method: 'GET', action: '/opinions' },
      input({ type: 'hidden', name: 'filter', value: mode }),
      button({ type: 'submit', class: currentFilter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
    )
  );
};

const renderContentHtml = (content, key) => {
  switch (content.type) {
    case 'event':
      return div({ class: 'opinion-event' },
        form({ method: "GET", action: `/events/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        h2(content.title),
        content.description ? p(`${i18n.description}: ${content.description}`) : "",
        content.date ? p(`${i18n.date}: ${new Date(content.date).toLocaleString()}`) : "",
        content.location ? p(`${i18n.location}: ${content.location}`) : "",
        typeof content.isPublic === 'boolean' ? p(`${i18n.isPublic || 'Public'}: ${content.isPublic ? 'Yes' : 'No'}`) : "",
        content.status ? p(`${i18n.status}: ${content.status}`) : "",
        content.price ? p(`${i18n.trendingPrice}: ${content.price} ECO`) : "",
        content.url ? p(`${i18n.trendingUrl}: `, a({ href: content.url, target: '_blank' }, content.url)) : "",
        content.organizer ? p(`${i18n.organizer || 'Organizer'}: `, a({ href: `/author/${encodeURIComponent(content.organizer)}` }, content.organizer)) : "",
        Array.isArray(content.attendees) ? p(`${i18n.attendees}: ${content.attendees.length}`) : "",
        br,
        content.tags?.length
          ? div(content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
            ))
          : null
      );
    case 'bookmark':
      return div({ class: 'opinion-bookmark' },
        form({ method: "GET", action: `/bookmarks/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),br,
        content.description ? p(content.description) : "",
        h2(content.url ? p(a({ href: content.url, target: '_blank', class: "bookmark-url" }, content.url)) : ""),
        content.category ? p(`${i18n.category}: ${content.category}`) : "",
        content.lastVisit ? p(`${i18n.bookmarkLastVisit}: ${new Date(content.lastVisit).toLocaleString()}`) : "",
        br,
        content.tags?.length
          ? div(content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
            ))
          : null
      );
    case 'task':
      return div({ class: 'opinion-task' },
        form({ method: "GET", action: `/tasks/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        h2(content.title),
        content.description ? p(`${i18n.description}: ${content.description}`) : "",
        content.startTime ? p(`${i18n.trendingStart}: ${new Date(content.startTime).toLocaleString()}`) : "",
        content.endTime ? p(`${i18n.trendingEnd}: ${new Date(content.endTime).toLocaleString()}`) : "",
        content.priority ? p(`${i18n.trendingPriority}: ${content.priority}`) : "",
        content.location ? p(`${i18n.trendingLocation}: ${content.location}`) : "",
        br,
        content.tags?.length
          ? div(content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
            ))
          : null,
        typeof content.isPublic === 'boolean' ? p(`${i18n.trendingIsPublic || 'Public'}: ${content.isPublic ? 'Yes' : 'No'}`) : "",
        Array.isArray(content.assignees) ? p(`${i18n.trendingAssignees || 'Assignees'}: ${content.assignees.length}`) : "",
        content.status ? p(`${i18n.trendingStatus}: ${content.status}`) : "",
        content.author ? p(`${i18n.trendingAuthor || 'Author'}: `, a({ href: `/author/${encodeURIComponent(content.author)}` }, content.author)) : ""
      );
    case 'image':
      return div({ class: 'opinion-image' },
        form({ method: "GET", action: `/images/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        content.title ? h2(content.title) : "",
        content.description ? p(content.description) : "",
        content.meme ? h2(`${i18n.category}: ${i18n.meme}`) : "",
        img({ src: `/blob/${encodeURIComponent(content.url)}`, class: 'feed-image' }),
        br,
        content.tags?.length
          ? div(content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
            ))
          : null
      );
    case 'video':
      return div({ class: 'opinion-video' },
        form({ method: "GET", action: `/videos/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        content.title ? h2(content.title) : "",
        content.description ? p(content.description) : "",
        videoHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(content.url)}`, type: content.mimeType || 'video/mp4', width: '640', height: '360' }),
        br,
        content.tags?.length
          ? div(content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
            ))
          : null
      );
    case 'audio':
      return div({ class: 'opinion-audio' },
        form({ method: "GET", action: `/audios/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        content.title ? h2(content.title) : "",
        content.description ? p(content.description) : "",
        audioHyperaxe({ controls: true, src: `/blob/${encodeURIComponent(content.url)}`, type: content.mimeType, preload: 'metadata' }),
        br,
        content.tags?.length
          ? div(content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
            ))
          : null
      );
    case 'document':
      return div({ class: 'opinion-document' },
        form({ method: "GET", action: `/documents/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        br,
        content.title ? h2(content.title) : "",
        content.description ? p(content.description) : "",
        div({ class: 'pdf-viewer-container', 'data-pdf-url': `/blob/${encodeURIComponent(content.url)}` }),
        br,
        content.tags?.length
          ? div(content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
            ))
          : null
      );
    case 'feed':
      return div({ class: 'opinion-feed' },
        h2(content.text),
        p(`${i18n.author}: `, a({ href: `/author/${encodeURIComponent(content.author)}`, target: "_blank" }, content.author)),
        p(`${i18n.createdAt}: ${new Date(content.createdAt).toLocaleString()}`),
        h2(`${i18n.tribeFeedRefeeds}: ${content.refeeds}`)
      );
    case 'votes':
      const votesList = content.votes && typeof content.votes === 'object'
        ? Object.entries(content.votes).map(([option, count]) => ({ option, count }))
        : [];
      return div({ class: 'opinion-votes' },
        form({ method: "GET", action: `/votes/${encodeURIComponent(key)}` },
          button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        h2(content.question),
        p(`${i18n.deadline}: ${content.deadline ? new Date(content.deadline).toLocaleString() : ''}`),
        h2(`${i18n.voteTotalVotes}: ${content.totalVotes}`),
        table(
          tr(...votesList.map(({ option }) => th(i18n[option] || option))),
          tr(...votesList.map(({ count }) => td(count)))
        )
      );
  case 'report':
    return div({ class: 'opinion-report' },
      form({ method: "GET", action: `/reports/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      p(`${i18n.title}: ${content.title}`),
      content.description ? p(`${i18n.description}: ${content.description}`) : "",
      content.category ? p(`${i18n.category}: ${content.category}`) : "",
      content.severity ? p(`${i18n.severity || 'Severity'}: ${content.severity}`) : "",
      content.status ? p(`${i18n.status}: ${content.status}`) : "",
      content.image ? img({ src: `/blob/${encodeURIComponent(content.image)}`, class: 'feed-image' }) : "",
      content.createdAt ? p(`${i18n.date}: ${new Date(content.createdAt).toLocaleString()}`) : "",
      typeof content.isAnonymous === 'boolean' 
        ? p(`${i18n.author || 'Author'}: `, content.isAnonymous 
        ? i18n.reportsAnonymousAuthor || 'Anonymous' 
        : a({ href: `/author/${encodeURIComponent(content.author)}`, target: '_blank' }, content.author))
        : content.author ? p(`${i18n.author || 'Author'}: `, a({ href: `/author/${encodeURIComponent(content.author)}`, target: '_blank' }, content.author)) : "",
      Array.isArray(content.confirmations) ? p(`${i18n.confirmations || 'Confirmations'}: ${content.confirmations.length}`) : "",
      br,
      content.tags?.length
        ? div(content.tags.map(tag =>
           a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
          ))
        : null
    );
    case 'transfer':
      return div({ class: 'opinion-transfer' },
        form({ method: "GET", action: `/transfers/${encodeURIComponent(key)}` },
          button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
        ),
        h2(`${i18n.concept}: ${content.concept}`),
        p(`${i18n.from}: `, a({ href: `/author/${encodeURIComponent(content.from)}`, target: "_blank" }, content.from)),
        p(`${i18n.to}: `, a({ href: `/author/${encodeURIComponent(content.to)}`, target: "_blank" }, content.to)),
        h2(`${i18n.amount}: ${content.amount}`),
        p(`${i18n.deadline}: ${content.deadline ? new Date(content.deadline).toLocaleString() : ""}`),
        p(`${i18n.status}: ${content.status}`),
        p(`${i18n.transfersConfirmations}: ${content.confirmedBy.length}/2`),
        br,
        content.tags?.length
          ? div(content.tags.map(tag =>
              a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: "tag-link", style: "margin-right: 0.8em; margin-bottom: 0.5em;" }, `#${tag}`)
            ))
          : null
      );
    default:
      return div({ class: 'styled-text', innerHTML: content.text || content.description || content.title || '[no content]' });
  }
};

exports.opinionsView = (items, filter) => {
  const title = i18n.opinionsTitle;
  const baseFilters = ['RECENT', 'ALL', 'MINE', 'TOP'];
  const categoryFilters = [
    ['interesting', 'necessary', 'funny', 'disgusting'],
    ['sensible', 'propaganda', 'adultOnly', 'boring'],
    ['confusing', 'inspiring', 'spam']
  ];

  if (filter !== 'TOP') {
    items = [...items].sort((a, b) => b.value.timestamp - a.value.timestamp);
  }

  const hasDocuments = items.some(item => item.value.content?.type === 'document');

  const header = div({ class: 'tags-header' },
    h2(title),
    p(i18n.shareYourOpinions)
  );

  const html = template(
    title,
    section(
      header,
      div({ class: 'mode-buttons', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;margin-bottom:24px;' },
        div({ style: 'display:flex;flex-direction:column;gap:8px;' },
          baseFilters.map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
            )
          )
        ),
        ...categoryFilters.map(row =>
          div({ style: 'display:flex;flex-direction:column;gap:8px;' },
            row.map(mode =>
              form({ method: 'GET', action: '/opinions' },
                input({ type: 'hidden', name: 'filter', value: mode }),
                button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
              )
            )
          )
        )
      ),
      section(
        items.length > 0
          ? div({ class: 'opinions-container' },
              items.map(item => {
                const c = item.value.content;
                const voteEntries = Object.entries(c.opinions || {});
                const total = voteEntries.reduce((sum, [, v]) => sum + v, 0);
                const voted = c.opinions_inhabitants?.includes(config.keys.id);
                const created = new Date(item.value.timestamp).toLocaleString();
                const key = item.key;
                const contentHtml = renderContentHtml(c, key);

                return div({ class: 'opinion-card' },
                  contentHtml,
                  p(`${i18n.author}: `, a({ href: `/author/${encodeURIComponent(item.value.author)}` }, item.value.author)),
                  p(`${i18n.createdAtLabel || i18n.opinionsCreatedAt}: ${created}`),
                  h2(`${i18n.totalOpinions || i18n.opinionsTotalCount}: ${total}`),
		!voted
		  ? div({ class: 'voting-buttons' },
		      ['interesting','necessary','funny','disgusting','sensible','propaganda','adultOnly','boring','confusing','inspiring','spam'].map(cat => 
			form({
			  method: 'POST', 
			  action: `/opinions/${encodeURIComponent(item.key)}/${cat}`
			},
			  button({ class: 'vote-btn' }, 
			    `${i18n['vote' + cat.charAt(0).toUpperCase() + cat.slice(1)]} [${c.opinions?.[cat] || 0}]`
			  )
			)
		      )
		    )
		  : p(i18n.alreadyVoted)
                );
              })
            )
          : div({ class: 'no-results' }, p(i18n.noOpinionsFound))
      )
    )
  );

  return `${html}${hasDocuments
    ? `<script type="module" src="/js/pdf.min.mjs"></script>
       <script src="/js/pdf-viewer.js"></script>`
    : ''}`;
};

