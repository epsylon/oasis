const { div, h2, p, section, button, form, a, img, video: videoHyperaxe, audio: audioHyperaxe, input, table, tr, th, td, br, span } = require("../server/node_modules/hyperaxe");
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
  case 'bookmark':
  return div({ class: 'opinion-bookmark' },
    div({ class: 'card-section bookmark' },
      form({ method: "GET", action: `/bookmarks/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      content.description ? div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.bookmarkDescriptionLabel + ':'),
        span({ class: 'card-value' }, content.description)
      ) : "",
      h2(content.url ? div({ class: 'card-field' },
        span({ class: 'card-label' }, p(a({ href: content.url, target: '_blank', class: "bookmark-url" }, content.url)))
      ) : ""),
      content.lastVisit ? div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.bookmarkLastVisit + ':'),
        span({ class: 'card-value' }, new Date(content.lastVisit).toLocaleString())
      ) : ""
    )
  );
  case 'image':
  return div({ class: 'opinion-image' },
    div({ class: 'card-section image' },
      form({ method: "GET", action: `/images/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      content.title ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.imageTitleLabel + ':'), span({ class: 'card-value' }, content.title)) : "",
      content.description ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.imageDescriptionLabel + ':'), span({ class: 'card-value' }, content.description)) : "",
      content.meme ? div({ class: 'card-field' }, span({ class: 'card-label' }, i18n.trendingCategory + ':'), span({ class: 'card-value' }, i18n.meme)) : "",
      br,
      div({ class: 'card-field' }, img({ src: `/blob/${encodeURIComponent(content.url)}`, class: 'feed-image' }))
    )
  );
  case 'video':
  return div({ class: 'opinion-video' },
    div({ class: 'card-section video' },
      form({ method: "GET", action: `/videos/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      content.title ? div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.videoTitleLabel + ':'),
        span({ class: 'card-value' }, content.title)
      ) : "",
      content.description ? div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.videoDescriptionLabel + ':'),
        span({ class: 'card-value' }, content.description)
      ) : "",
      br,
      div({ class: 'card-field' },
        videoHyperaxe({
          controls: true,
          src: `/blob/${encodeURIComponent(content.url)}`,
          type: content.mimeType || 'video/mp4',
          width: '640',
          height: '360'
        })
      )
    )
  );
  case 'audio':
  return div({ class: 'opinion-audio' },
    div({ class: 'card-section audio' },
      form({ method: "GET", action: `/audios/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      content.title ? div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.audioTitleLabel + ':'),
        span({ class: 'card-value' }, content.title)
      ) : "",
      content.description ? div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.audioDescriptionLabel + ':'),
        span({ class: 'card-value' }, content.description)
      ) : "",
      br,
      div({ class: 'card-field' },
        audioHyperaxe({
          controls: true,
          src: `/blob/${encodeURIComponent(content.url)}`,
          type: content.mimeType,
          preload: 'metadata'
        })
      )
    )
  );
  case 'document':
  return div({ class: 'opinion-document' },
    div({ class: 'card-section document' },
      form({ method: "GET", action: `/documents/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      content.title ? div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.documentTitleLabel + ':'),
        span({ class: 'card-value' }, content.title)
      ) : "",
      content.description ? div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.documentDescriptionLabel + ':'),
        span({ class: 'card-value' }, content.description)
      ) : "",
      br,
      div({ class: 'card-field' },
        div({ class: 'pdf-viewer-container', 'data-pdf-url': `/blob/${encodeURIComponent(content.url)}` })
      )
    )
  );
  case 'feed':
  return div({ class: 'opinion-feed' },
    div({ class: 'card-section feed' },
      h2(content.text),
      h2({ class: 'card-field' },
        span({ class: 'card-label' }, `${i18n.tribeFeedRefeeds}: `),
        span({ class: 'card-value' }, content.refeeds)
      )
    )
  );
  case 'votes':
  const votesList = content.votes && typeof content.votes === 'object'
    ? Object.entries(content.votes).map(([option, count]) => ({ option, count }))
    : [];
  return div({ class: 'opinion-votes' },
    div({ class: 'card-section votes' },
      form({ method: "GET", action: `/votes/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.voteQuestionLabel + ':'),
        span({ class: 'card-value' }, content.question)
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.voteDeadline + ':'),
        span({ class: 'card-value' }, content.deadline ? new Date(content.deadline).toLocaleString() : '')
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.voteTotalVotes + ':'),
        span({ class: 'card-value' }, content.totalVotes)
      ),
      table(
        tr(...votesList.map(({ option }) => th(i18n[option] || option))),
        tr(...votesList.map(({ count }) => td(count)))
      )
    )
  );
  case 'transfer':
  return div({ class: 'opinion-transfer' },
    div({ class: 'card-section transfer' },
      form({ method: "GET", action: `/transfers/${encodeURIComponent(key)}` },
        button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
      ),
      br,
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.concept + ':'),
        span({ class: 'card-value' }, content.concept)
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.deadline + ':'),
        span({ class: 'card-value' }, content.deadline ? new Date(content.deadline).toLocaleString() : '')
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.status + ':'),
        span({ class: 'card-value' }, content.status)
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.amount + ':'),
        span({ class: 'card-value' }, content.amount)
      ),
      br,
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.from + ':'),
        span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(content.from)}`, target: "_blank" }, content.from))
      ),
      div({ class: 'card-field' },
        span({ class: 'card-label' }, i18n.to + ':'),
        span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(content.to)}`, target: "_blank" }, content.to))
      ),
      br,
      div({ class: 'card-field' },
        h2({ class: 'card-label' }, i18n.transfersConfirmations + ': ' + `${content.confirmedBy.length}/2`)
      )
    )
  );
    default:
	return div({ class: 'styled-text' },
	  div({ class: 'card-section styled-text-content' },
	    div({ class: 'card-field' },
	      span({ class: 'card-label' }, i18n.textContentLabel + ':'),
	      span({ class: 'card-value', innerHTML: content.text || content.description || content.title || '[no content]' })
	    )
	  )
	);
  }
};

exports.opinionsView = (items, filter) => {
  items = items.filter(item => {
    const content = item.value?.content || item.content;
    if (!content || typeof content !== 'object') return false;
    if (content.type === 'tombstone') return false;
    return true;
  });
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

                return div(
                  contentHtml,
                  p({ class: 'card-footer' },
     		    span({ class: 'date-link' }, `${created} ${i18n.performed} `),
     		    a({ href: `/author/${encodeURIComponent(item.value.author)}`, class: 'user-link' }, `${item.value.author}`)
                  ), 
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

