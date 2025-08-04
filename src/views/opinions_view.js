const { div, h2, p, section, button, form, a, img, video: videoHyperaxe, audio: audioHyperaxe, input, table, tr, th, td, br, span } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const { config } = require('../server/SSB_server.js');
const { renderTextWithStyles } = require('../backend/renderTextWithStyles');
const { renderUrl } = require('../backend/renderUrl');

const seenDocumentTitles = new Set();

const renderContentHtml = (content, key) => {
  switch (content.type) {
    case 'bookmark':
      return div({ class: 'opinion-bookmark' },
        div({ class: 'card-section bookmark' },
          form({ method: "GET", action: `/bookmarks/${encodeURIComponent(key)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
          ),
          br,
          h2(content.url ? div({ class: 'card-field' },
            span({ class: 'card-label' }, p(a({ href: content.url, target: '_blank', class: "bookmark-url" }, content.url)))
          ) : ""),
          content.lastVisit ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.bookmarkLastVisit + ':'),
            span({ class: 'card-value' }, new Date(content.lastVisit).toLocaleString())
          ) : "",
          content.description
            ? [
                span({ class: 'card-label' }, i18n.bookmarkDescriptionLabel + ":"),
                p(...renderUrl(content.description))
              ]
            : null
        )
      );
    case 'image':
      return div({ class: 'opinion-image' },
        div({ class: 'card-section image' },
          form({ method: "GET", action: `/images/${encodeURIComponent(key)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
          ),
          br,
          content.title ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.imageTitleLabel + ':'),
            span({ class: 'card-value' }, content.title)
          ) : "",
          content.description
            ? [
                span({ class: 'card-label' }, i18n.imageDescriptionLabel + ":"),
                p(...renderUrl(content.description))
              ]
            : null,
          content.meme ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.trendingCategory + ':'),
            span({ class: 'card-value' }, i18n.meme)
          ) : "",
          br,
          div({ class: 'card-field' },
            img({ src: `/blob/${encodeURIComponent(content.url)}`, class: 'feed-image' })
          )
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
          content.description
            ? [
                span({ class: 'card-label' }, i18n.videoDescriptionLabel + ":"),
                p(...renderUrl(content.description))
              ]
            : null,
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
          content.description
            ? [
                span({ class: 'card-label' }, i18n.audioDescriptionLabel + ":"),
                p(...renderUrl(content.description))
              ]
            : null,
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
    case 'document': {
      const t = content.title?.trim();
      if (t && seenDocumentTitles.has(t)) return null;
      if (t) seenDocumentTitles.add(t);
      return div({ class: 'opinion-document' },
        div({ class: 'card-section document' },
          form({ method: "GET", action: `/documents/${encodeURIComponent(key)}` },
            button({ type: "submit", class: "filter-btn" }, i18n.viewDetails)
          ),
          br,
          t ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.documentTitleLabel + ':'),
            span({ class: 'card-value' }, t)
          ) : "",
          content.description
            ? [
                span({ class: 'card-label' }, i18n.documentDescriptionLabel + ":"),
                p(...renderUrl(content.description))
              ]
            : null,
          div({ class: 'card-field' },
            div({ class: 'pdf-viewer-container', 'data-pdf-url': `/blob/${encodeURIComponent(content.url)}` })
          )
        )
      );
    }
    case 'feed':
      return div({ class: 'opinion-feed' },
        div({ class: 'card-section feed' },
          div({ class: 'feed-text', innerHTML: renderTextWithStyles(content.text) }),
          h2({ class: 'card-field' },
            span({ class: 'card-label' }, `${i18n.tribeFeedRefeeds}: `),
            span({ class: 'card-value' }, content.refeeds)
          )
        )
      );
    case 'votes': {
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
    }
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
          div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.from + ':'),
            span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(content.from)}`, target: "_blank" }, content.from))
          ),
          div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.to + ':'),
            span({ class: 'card-value' }, a({ class: 'user-link', href: `/author/${encodeURIComponent(content.to)}`, target: "_blank" }, content.to))
          ),
          h2({ class: 'card-field' },
            span({ class: 'card-label' }, `${i18n.transfersConfirmations}: `),
            span({ class: 'card-value' }, `${content.confirmedBy.length}/2`)
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
  seenDocumentTitles.clear();
  items = items
    .filter(item => {
      const c = item.value?.content || item.content;
      return c && typeof c === 'object' && c.type !== 'tombstone';
    })
    .sort((a, b) => (filter !== 'TOP' ? b.value.timestamp - a.value.timestamp : 0));

  const title = i18n.opinionsTitle;
  const baseFilters = ['RECENT', 'ALL', 'MINE', 'TOP'];
  const categoryFilters = [
    ['interesting', 'necessary', 'funny', 'disgusting'],
    ['sensible', 'propaganda', 'adultOnly', 'boring'],
    ['confusing', 'inspiring', 'spam']
  ];


const cards = items
  .map(item => {
    const c = item.value.content;
    const key = item.key;
    const contentHtml = renderContentHtml(c, key);
    if (!contentHtml) return null;
    const voteEntries = Object.entries(c.opinions || {});
    const total = voteEntries.reduce((sum, [, v]) => sum + v, 0);
    const voted = c.opinions_inhabitants?.includes(config.keys.id);
    const created = new Date(item.value.timestamp).toLocaleString();
    const allCats = categoryFilters.flat();
    return div(
      contentHtml,
      p({ class: 'card-footer' },
        span({ class: 'date-link' }, `${created} ${i18n.performed} `),
        a({ href: `/author/${encodeURIComponent(item.value.author)}`, class: 'user-link' }, item.value.author)
      ),
      h2(`${i18n.totalOpinions || i18n.opinionsTotalCount}: ${total}`),
      div({ class: 'voting-buttons' },
        allCats.map(cat => {
          const label = `${i18n['vote' + cat.charAt(0).toUpperCase() + cat.slice(1)]} [${c.opinions?.[cat] || 0}]`;
          if (voted) {
            return button({ class: 'vote-btn', type: 'button' }, label);
          }
          return form({ method: 'POST', action: `/opinions/${encodeURIComponent(key)}/${cat}` },
            button({ class: 'vote-btn' }, label)
          );
        })
      )
    );
  })
  .filter(Boolean);

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
        cards.length
          ? div({ class: 'opinions-container' }, ...cards)
          : div({ class: 'no-results' }, p(i18n.noOpinionsFound))
      )
    )
  );

  return `${html}${hasDocuments
    ? `<script type="module" src="/js/pdf.min.mjs"></script>
       <script src="/js/pdf-viewer.js"></script>`
    : ''}`;
};

