const {
  div, a, span, form, button, section, p,
  input, label, br, select, option, h2, textarea
} = require("../server/node_modules/hyperaxe");
const moment = require("../server/node_modules/moment");
const { template, i18n } = require('./main_views');
const { config } = require('../server/SSB_server.js');
const { renderUrl } = require('../backend/renderUrl');

const userId = config.keys.id;
const BASE_FILTERS = ['hot','all','mine','recent','top'];
const CAT_BLOCK1 = ['GENERAL','OASIS','L.A.R.P.','POLITICS','TECH'];
const CAT_BLOCK2 = ['SCIENCE','MUSIC','ART','GAMING','BOOKS','FILMS'];
const CAT_BLOCK3 = ['PHILOSOPHY','SOCIETY','PRIVACY','CYBERWARFARE','SURVIVALISM'];
const ALL_CATS = [...CAT_BLOCK1, ...CAT_BLOCK2, ...CAT_BLOCK3];

const catKey = (c) => 'forumCat' + String(c || '').replace(/\./g,'').replace(/[\s-]/g,'').toUpperCase();
const catLabel = (c) => i18n[catKey(c)] || c;

const Z = 1.96;
function wilsonScore(pos, neg) {
  const n = (pos||0)+(neg||0);
  if (n === 0) return 0;
  const phat = pos / n, z2 = Z * Z;
  return (phat + z2/(2*n) - Z*Math.sqrt((phat*(1-phat)+z2/(4*n))/n)) / (1+z2/n);
}

function getFilteredForums(filter, forums) {
  const now = Date.now();
  if (filter === 'mine')    return forums.filter(f => f.author === userId);
  if (filter === 'recent')  return forums.filter(f => new Date(f.createdAt).getTime() >= now - 86400000);
  if (filter === 'top')     return forums.slice().sort((a,b) => b.score - a.score);
  if (filter === 'hot')     return forums
    .filter(f => new Date(f.createdAt).getTime() >= now - 86400000)
    .sort((a,b) => b.score - a.score);
  if (ALL_CATS.includes(filter))
    return forums.filter(f => f.category === filter);
  return forums;
}

const generateFilterButtons = (filters, currentFilter, action, i18nMap = {}) =>
  div({ class: 'filter-group' },
    filters.map(mode =>
      form({ method: 'GET', action },
        input({ type: 'hidden', name: 'filter', value: mode }),
        button({ type: 'submit', class: currentFilter === mode ? 'filter-btn active' : 'filter-btn' },
          String(i18nMap[mode] || mode).toUpperCase()
        )
      )
    )
  );

const renderCreateForumButton = () =>
  div({ class: 'forum-create-col' },
    form({ method: 'GET', action: '/forum' },
      button({ type: 'submit', name: 'filter', value: 'create', class: 'create-button' },
        i18n.forumCreateButton
      )
    )
  );

const renderVotes = (target, score, forumId) =>
  div({ class: 'forum-score-box' },
    form({ method: 'POST', action: `/forum/${encodeURIComponent(forumId)}/vote`, class: 'forum-score-form' },
      button({ name: 'value', value: 1, class: 'score-btn' }, '▲'),
      div({ class: 'score-total' }, String(score || 0)),
      button({ name: 'value', value: -1, class: 'score-btn' }, '▼'),
      input({ type: 'hidden', name: 'target', value: target }),
      input({ type: 'hidden', name: 'forumId', value: forumId })
    )
  );

const renderForumForm = () =>
  div({ class: 'forum-form' },
    form({ action: '/forum/create', method: 'POST' },
      label(i18n.forumCategoryLabel), br(),
      select({ name: 'category', required: true },
        ALL_CATS.map(cat => option({ value: cat }, catLabel(cat)))
      ), br(), br(),
      label(i18n.forumTitleLabel), br(),
      input({
        type: 'text',
        name: 'title',
        required: true,
        placeholder: i18n.forumTitlePlaceholder
      }), br(), br(),
      label(i18n.forumMessageLabel), br(),
      textarea({
        name: 'text',
        required: true,
        rows: 4,
        placeholder: i18n.forumMessagePlaceholder
      }), br(), br(),
      button({ type: 'submit' }, i18n.forumCreateButton)
    )
  );

const renderThread = (nodes, level = 0, forumId) => {
  if (!Array.isArray(nodes)) return [];
  return [...nodes]
    .sort((a, b) =>
      wilsonScore(b.positiveVotes, b.negativeVotes)
      - wilsonScore(a.positiveVotes, a.negativeVotes)
    )
    .flatMap((m, i) => {
      const isTopLevelWinner = level === 0 && i === 0;
      const classList = [
        'forum-comment',
        `level-${level}`,
        isTopLevelWinner ? 'highlighted-reply' : ''
      ].filter(Boolean).join(' ');

      const commentBox = div(
        { class: classList },
        div({ class: 'comment-header' },
          span({ class: 'date-link' },
            `${moment(m.timestamp).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed}`),
          a({
            href: `/author/${encodeURIComponent(m.author)}`,
            class: 'user-link',
            style: 'margin-left:12px;'
          }, m.author),
          div({ class: 'comment-votes' },
            span({ class: 'votes-count' }, `▲: ${m.positiveVotes || 0}`),
            span({ class: 'votes-count', style: 'margin-left:12px;' },
              `▼: ${m.negativeVotes || 0}`)
          )
        ),
        div({ class: 'comment-body-row' },
          div({ class: 'comment-vote-col' },
            renderVotes(m.key, m.score, forumId)
          ),
          div({ class: 'comment-text-col' },
            div(
              ...(m.text || '').split('\n')
                .map(l => l.trim())
                .filter(l => l)
                .map(l => p(...renderUrl(l)))
            )
          )
        ),
        div({ class: 'new-reply' },
          form({
            method: 'POST',
            action: `/forum/${encodeURIComponent(forumId)}/message`,
            class: 'comment-form'
          },
            input({ type: 'hidden', name: 'parentId', value: m.key }),
            textarea({
              name: 'message',
              rows: 2,
              required: true,
              placeholder: i18n.forumMessagePlaceholder,
              class: 'comment-textarea'
            }),
            button({ type: 'submit', class: 'forum-send-btn' }, 'Reply')
          )
        )
      );

      return [ commentBox, ...renderThread(m.children || [], level + 1, forumId) ];
    });
};

const renderForumList = (forums, currentFilter) =>
  div({ class: 'forum-list' },
    Array.isArray(forums) && forums.length
      ? forums.map(f =>
        div({ class: 'forum-card' },
          div({ class: 'forum-score-col' },
            renderVotes(f.key, f.score, f.key)
          ),
          div({ class: 'forum-main-col' },
            div({ class: 'forum-header-row' },
              a({
                class: 'forum-category',
                href: `/forum?filter=${encodeURIComponent(f.category)}`
              }, `[${catLabel(f.category)}]`),
              a({
                class: 'forum-title',
                href: `/forum/${encodeURIComponent(f.key)}`
              }, f.title)
            ),
            div({ class: 'forum-body' }, ...renderUrl(f.text || '')),
            div({ class: 'forum-meta' },
              span({ class: 'forum-positive-votes' },
                `▲: ${f.positiveVotes || 0}`),
              span({ class: 'forum-negative-votes', style: 'margin-left:12px;' },
                `▼: ${f.negativeVotes || 0}`),
              span({ class: 'forum-participants' },
                `${i18n.forumParticipants.toUpperCase()}: ${f.participants?.length || 1}`),
              span({ class: 'forum-messages' },
                `${i18n.forumMessages.toUpperCase()}: ${(f.messagesCount || 1) - 1}`),
              form({ method: 'GET', action: `/forum/${encodeURIComponent(f.key)}`, class: 'visit-forum-form' },
                button({ type: 'submit', class: 'filter-btn' }, i18n.forumVisitButton)
              )
            ),
            div({ class: 'forum-footer' },
              span({ class: 'date-link' },
                `${moment(f.createdAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed}`),
              a({
                href: `/author/${encodeURIComponent(f.author)}`,
                class: 'user-link',
                style: 'margin-left:12px;'
              }, f.author)
            ),
            currentFilter === 'mine' && f.author === userId
              ? div({ class: 'forum-owner-actions' },
                form({
                  method: 'POST',
                  action: `/forum/delete/${encodeURIComponent(f.key)}`,
                  class: 'forum-delete-form'
                },
                  button({ type: 'submit', class: 'delete-btn' },
                    i18n.forumDeleteButton)
                )
              )
              : null
          )
        )
      )
      : p(i18n.noForums)
  );

exports.forumView = async (forums, currentFilter) => {
  const CAT_I18N_MAP_UP = ALL_CATS.reduce((m,c)=>{ m[c]=(catLabel(c)||c).toUpperCase(); return m; },{});
  return template(i18n.forumTitle,
    section(
      div({ class: 'tags-header' },
        h2(currentFilter === 'create'
          ? i18n.forumCreateSectionTitle
          : i18n.forumTitle),
        p(i18n.forumDescription)
      ),
      div({ class: 'mode-buttons-cols' },
        generateFilterButtons(BASE_FILTERS, currentFilter, '/forum', {
          hot: i18n.forumFilterHot,
          all: i18n.forumFilterAll,
          mine: i18n.forumFilterMine,
          recent: i18n.forumFilterRecent,
          top: i18n.forumFilterTop
        }),
        generateFilterButtons(CAT_BLOCK1, currentFilter, '/forum', CAT_I18N_MAP_UP),
        generateFilterButtons(CAT_BLOCK2, currentFilter, '/forum', CAT_I18N_MAP_UP),
        generateFilterButtons(CAT_BLOCK3, currentFilter, '/forum', CAT_I18N_MAP_UP),
        renderCreateForumButton()
      ),
      currentFilter === 'create'
        ? renderForumForm()
        : renderForumList(
          getFilteredForums(currentFilter || 'all', forums),
          currentFilter
        )
    )
  );
};

exports.singleForumView = async (forum, messagesData, currentFilter) => {
  const CAT_I18N_MAP_UP = ALL_CATS.reduce((m,c)=>{ m[c]=(catLabel(c)||c).toUpperCase(); return m; },{});
  return template(forum.title,
    section(
      div({ class: 'tags-header' },
        h2(i18n.forumTitle),
        p(i18n.forumDescription)
      ),
      div({ class: 'mode-buttons' },
        generateFilterButtons(BASE_FILTERS, currentFilter, '/forum', {
          hot: i18n.forumFilterHot,
          all: i18n.forumFilterAll,
          mine: i18n.forumFilterMine,
          recent: i18n.forumFilterRecent,
          top: i18n.forumFilterTop
        }),
        generateFilterButtons(CAT_BLOCK1, currentFilter, '/forum', CAT_I18N_MAP_UP),
        generateFilterButtons(CAT_BLOCK2, currentFilter, '/forum', CAT_I18N_MAP_UP),
        generateFilterButtons(CAT_BLOCK3, currentFilter, '/forum', CAT_I18N_MAP_UP),
        renderCreateForumButton()
      )
    ),
    div({ class: 'forum-thread-container' },
      div({
        class: 'forum-card forum-thread-header',
        style: 'display:flex;align-items:flex-start;'
      },
        div({
          class: 'root-vote-col',
          style: 'width:60px;text-align:center;'
        }, renderVotes(
          forum.key,
          messagesData.totalScore,
          forum.key
        )),
        div({
          class: 'forum-main-col',
          style: 'flex:1;padding-left:10px;'
        },
          div({ class: 'forum-header-row' },
            a({
              class: 'forum-category',
              href: `/forum?filter=${encodeURIComponent(forum.category)}`
            }, `[${catLabel(forum.category)}]`),
            a({
              class: 'forum-title',
              href: `/forum/${encodeURIComponent(forum.key)}`
            }, forum.title)
          ),
          div({ class: 'forum-footer' },
            span({ class: 'date-link' },
              `${moment(forum.createdAt).format('YYYY/MM/DD HH:mm:ss')} ${i18n.performed}`),
            a({
              href: `/author/${encodeURIComponent(forum.author)}`,
              class: 'user-link',
              style: 'margin-left:12px;'
            }, forum.author)
          ),
          div(
            ...(forum.text || '').split('\n')
              .map(l => l.trim())
              .filter(l => l)
              .map(l => p(...renderUrl(l)))
          ),
          div({ class: 'forum-meta' },
            span({ class: 'votes-count' },
              `▲: ${messagesData.positiveVotes}`),
            span({
              class: 'votes-count',
              style: 'margin-left:12px;'
            }, `▼: ${messagesData.negativeVotes}`),
            span({ class: 'forum-participants' },
              `${i18n.forumParticipants.toUpperCase()}: ${forum.participants?.length || 1}`),
            span({ class: 'forum-messages' },
              `${i18n.forumMessages.toUpperCase()}: ${messagesData.total}`)
          )
        )
      ),
      div({
        class: 'new-message-wrapper',
        style: 'margin-top:12px;'
      },
        form({
          method: 'POST',
          action: `/forum/${encodeURIComponent(forum.key)}/message`,
          class: 'new-message-form'
        },
          textarea({
            name: 'message',
            rows: 4,
            required: true,
            placeholder: i18n.forumMessagePlaceholder,
            style: 'width:100%;'
          }), br(),
          button({
            type: 'submit',
            class: 'forum-send-btn',
            style: 'margin-top:4px;'
          }, i18n.forumSendButton)
        )
      ),
      ...renderThread(messagesData.messages, 0, forum.key)
    )
  );
};

