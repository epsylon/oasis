const { div, h2, p, section, button, form, a, img, video: videoHyperaxe, audio: audioHyperaxe, input, table, tr, th, td, br, span, details, summary } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink, renderSpreadButton, renderContentActions } = require('./main_views');
const { config } = require('../server/SSB_server.js');
const { renderTextWithStyles } = require('../backend/renderTextWithStyles');
const { renderUrl } = require('../backend/renderUrl');
const opinionCategories = require('../backend/opinion_categories');
const { sanitizeHtml } = require('../backend/sanitizeHtml');

const seenDocumentTitles = new Set();

const detailHref = (type, key) => {
  switch (type) {
    case 'bookmark': return `/bookmarks/${encodeURIComponent(key)}`;
    case 'image': return `/images/${encodeURIComponent(key)}`;
    case 'video': return `/videos/${encodeURIComponent(key)}`;
    case 'audio': return `/audios/${encodeURIComponent(key)}`;
    case 'torrent': return `/torrents/${encodeURIComponent(key)}`;
    case 'document': return `/documents/${encodeURIComponent(key)}`;
    case 'feed': return `/feed/${encodeURIComponent(key)}`;
    case 'votes': return `/votes/${encodeURIComponent(key)}`;
    case 'transfer': return `/transfers/${encodeURIComponent(key)}`;
    default: return null;
  }
};

const renderContentHtml = (content, key) => {
  switch (content.type) {
    case 'bookmark':
      return div({ class: 'opinion-bookmark' },
        div({ class: 'card-section bookmark' },
          h2(content.url ? div({ class: 'card-field' },
            span({ class: 'card-label' }, p(a({ href: content.url, target: '_blank', class: "bookmark-url" }, content.url)))
          ) : ""),
          content.lastVisit ? div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.bookmarkLastVisitLabel + ':'),
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
          br(),
          div({ class: 'card-field' },
            img({ src: `/blob/${encodeURIComponent(content.url)}`, class: 'feed-image' })
          )
        )
      );
    case 'video':
      return div({ class: 'opinion-video' },
        div({ class: 'card-section video' },
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
    case 'torrent':
      return div({ class: 'opinion-torrent' },
        div({ class: 'card-section' },
          content.title ? div({ class: 'card-field' }, span({ class: 'card-label' }, (i18n.torrentTitleLabel || 'Title') + ':'), span({ class: 'card-value' }, content.title)) : ""
        )
      );
    case 'document': {
      const t = content.title?.trim();
      if (t && seenDocumentTitles.has(t)) return null;
      if (t) seenDocumentTitles.add(t);
      return div({ class: 'opinion-document' },
        div({ class: 'card-section document' },
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
          div({ class: 'feed-text', innerHTML: sanitizeHtml(renderTextWithStyles(content.text)) }),
          content.refeeds
            ? h2({ class: 'card-field' }, span({ class: 'card-label' }, `${i18n.tribeFeedRefeeds}: `), span({ class: 'card-value' }, content.refeeds))
            : ""
        )
      );
    case 'votes': {
      const votesList = content.votes && typeof content.votes === 'object'
        ? Object.entries(content.votes).map(([option, count]) => ({ option, count }))
        : [];
      return div({ class: 'opinion-votes' },
        div({ class: 'card-section votes' },
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
            span({ class: 'card-value' }, userLink(content.from))
          ),
          div({ class: 'card-field' },
            span({ class: 'card-label' }, i18n.to + ':'),
            span({ class: 'card-value' }, userLink(content.to))
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
            span({ class: 'card-value', innerHTML: sanitizeHtml(content.text || content.description || content.title || '[no content]') })
          )
        )
      );
  }
};

exports.opinionsView = (items, filter, spreadMap = new Map()) => {
  seenDocumentTitles.clear();
  items = items
    .filter(item => {
      const c = item.value?.content || item.content;
      return c && typeof c === 'object' && c.type !== 'tombstone';
    })
    .sort((a, b) => {
      if (filter === 'TOP') {
        const aVotes = (a.value.content.opinions_inhabitants || []).length;
        const bVotes = (b.value.content.opinions_inhabitants || []).length;
        return bVotes !== aVotes ? bVotes - aVotes : b.value.timestamp - a.value.timestamp;
      }
      return b.value.timestamp - a.value.timestamp;
    });

  const title = i18n.opinionsTitle;
  const baseFilters = ['TOP', 'ALL', 'MINE', 'RECENT'];

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
      const allCats = opinionCategories;

      const isOwn = item.value.author && String(item.value.author) === String(config.keys.id);
      return div(
        { class: 'trending-card opinions-card' + (isOwn ? ' own-content' : '') },
        div({ class: 'card-header activity-card-header' },
          span({ class: 'pm-exposition-chip pm-exposition-whole' },
            span({ class: 'pm-exposition-text' }, String(c.type || '').toUpperCase())
          ),
          renderContentActions(key, detailHref(c.type, key))
        ),
        div(
          { class: 'card-section opinions-card-body' },
          contentHtml,
          div({ class: 'card-spread-left' }, renderSpreadButton(key, spreadMap.get(key))),
          p({ class: 'card-footer' },
            span({ class: 'date-link' }, `${created} ${i18n.performed} `),
            userLink(item.value.author)
          ),
          (() => {
            const entries = voteEntries.filter(([, v]) => v > 0);
            const dominantPart = (() => {
              if (!entries.length) return null;
              const maxVal = Math.max(...entries.map(([, v]) => v));
              const dominant = entries.filter(([, v]) => v === maxVal).map(([k]) => i18n['vote' + k.charAt(0).toUpperCase() + k.slice(1)] || k);
              return [
                span({ class: 'trending-dominant-sep' }, '|'),
                span({ class: 'trending-dominant-text' }, `${i18n.moreVoted || 'More Voted'}: ${dominant.join(' + ')}`)
              ];
            })();
            return h2(
              `${i18n.totalOpinions || i18n.opinionsTotalCount}: `,
              span({ class: 'trending-total-count' }, String(total)),
              ...(dominantPart || [])
            );
          })(),
          details({ class: 'opinions-voting-collapse' },
            summary({ class: 'opinions-summary' }, `${i18n.opinionsTitle || 'Opinions'} (${Object.values(c.opinions || {}).reduce((s, n) => s + (Number(n) || 0), 0)})`),
            div({ class: 'voting-buttons' },
              allCats.map(cat => {
                const label = `${i18n['vote' + cat.charAt(0).toUpperCase() + cat.slice(1)] || cat} [${c.opinions?.[cat] || 0}]`;
                if (voted) {
                  return button({ class: 'vote-btn', type: 'button' }, label);
                }
                return form({ method: 'POST', action: `/opinions/${encodeURIComponent(key)}/${cat}` },
                  button({ class: 'vote-btn' }, label)
                );
              })
            )
          )
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
      div({ class: 'mode-buttons' },
        div({ class: 'column' },
          baseFilters.map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
            )
          )
        ),
        div({ class: 'column' },
          opinionCategories.positive.slice(0, 5).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
            )
          )
        ),
        div({ class: 'column' },
          opinionCategories.positive.slice(5, 10).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
            )
          )
        ),
        div({ class: 'column' },
          opinionCategories.positive.slice(10, 15).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
            )
          )
        )
      ),
      div({ class: 'mode-buttons' },
        div({ class: 'column' },
          opinionCategories.constructive.slice(0, 5).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
            )
          )
        ),
        div({ class: 'column' },
          opinionCategories.constructive.slice(5, 11).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
            )
          )
        ),
        div({ class: 'column' },
          opinionCategories.moderation.slice(0, 5).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
            )
          )
        ),
        div({ class: 'column' },
          opinionCategories.moderation.slice(5, 10).map(mode =>
            form({ method: 'GET', action: '/opinions' },
              input({ type: 'hidden', name: 'filter', value: mode }),
              button({ type: 'submit', class: filter === mode ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
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

