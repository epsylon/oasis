const { div, h2, p, section, button, form, a, textarea, br, input, table, tr, th, td, label } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');
const moment = require('../server/node_modules/moment');
const { config } = require('../server/SSB_server.js');

const userId = config.keys.id;

const generateFilterButtons = (filters, currentFilter, action) => {
  return filters.map(mode =>
    form({ method: 'GET', action },
      input({ type: 'hidden', name: 'filter', value: mode }),
      button({ type: 'submit', class: currentFilter === mode.toLowerCase() ? 'filter-btn active' : 'filter-btn' }, i18n[mode + 'Button'] || mode)
    )
  );
};

const voteLabel = opt =>
  i18n['vote' + opt.split('_').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join('')] || opt;

const renderVoteCard = (v, voteOptions, firstRow, secondRow, userId, filter) => {
  const baseCounts = voteOptions.reduce((acc, opt) => { acc[opt] = v.votes?.[opt] || 0; return acc }, {});
  const maxOpt = voteOptions.filter(opt => opt !== 'FOLLOW_MAJORITY')
    .reduce((top, opt) => baseCounts[opt] > baseCounts[top] ? opt : top, 'NOT_INTERESTED');
  const result = v.totalVotes === 0 ? 'NOT_INTERESTED' : maxOpt;
  const finalCounts = { ...baseCounts };
  if (baseCounts.FOLLOW_MAJORITY > 0 && result !== 'FOLLOW_MAJORITY') {
    finalCounts[result] += baseCounts.FOLLOW_MAJORITY;
  }

  const showUpdateButton = filter === 'mine' && !Object.values(v.opinions || {}).length;
  const showDeleteButton = filter === 'mine';

  return div({ class: 'vote-item' },
    filter === 'mine' ? div({ class: 'vote-actions' },
      showUpdateButton
        ? form({ method: 'GET', action: `/votes/edit/${encodeURIComponent(v.id)}` },
            button({ class: "update-btn", type: "submit" }, i18n.voteUpdateButton)
          )
        : null,
      showDeleteButton
        ? form({ method: 'POST', action: `/votes/delete/${encodeURIComponent(v.id)}` },
            button({ class: "delete-btn", type: "submit" }, i18n.voteDeleteButton)
          )
        : null
    ) : null,
    form({ method: 'GET', action: `/votes/${encodeURIComponent(v.id)}` },
      button({ class: 'filter-btn', type: 'submit' }, i18n.viewDetails)
    ),
    h2(v.question),
    p(`${i18n.voteDeadline}: ${moment(v.deadline).format('YYYY/MM/DD HH:mm:ss')}`),
    p(`${i18n.voteStatus}: ${v.status}`),

    v.status === 'OPEN'
      ? div({ class: 'vote-buttons-block' },
          div({ class: 'vote-buttons-row' },
            ...firstRow.map(opt => form({ method: 'POST', action: `/votes/vote/${encodeURIComponent(v.id)}` },
              button({ type: 'submit', name: 'choice', value: opt }, voteLabel(opt))
            ))
          ),
          div({ class: 'vote-buttons-row' },
            ...secondRow.map(opt => form({ method: 'POST', action: `/votes/vote/${encodeURIComponent(v.id)}` },
              button({ type: 'submit', name: 'choice', value: opt }, voteLabel(opt))
            ))
          )
        )
      : null,

    h2(`${i18n.voteTotalVotes}: ${v.totalVotes}`),
    table(
      tr(...voteOptions.map(opt => th(voteLabel(opt)))),
      tr(...voteOptions.map(opt => td(baseCounts[opt])))
    ),
    p(`${i18n.voteBreakdown}: ${voteLabel(result)} = ${baseCounts[result]} + ${voteLabel('FOLLOW_MAJORITY')}: ${baseCounts.FOLLOW_MAJORITY}`),
    div({ class: 'vote-buttons-row' }, h2(voteLabel(result))),

    v.tags && v.tags.filter(Boolean).length
      ? div(
          v.tags.filter(Boolean).map(tag => a({ href: `/search?query=%23${encodeURIComponent(tag)}`, class: 'tag-link', style: 'margin-right:0.8em;margin-bottom:0.5em;' }, `#${tag}`))
        )
      : null,

    div({ class: 'voting-buttons' },
      ['interesting', 'necessary', 'funny', 'disgusting', 'sensible', 'propaganda', 'adultOnly', 'boring', 'confusing', 'inspiring', 'spam'].map(category =>
        form({ method: 'POST', action: `/votes/opinions/${encodeURIComponent(v.id)}/${category}` },
          button({ class: 'vote-btn' }, `${i18n[`vote${category.charAt(0).toUpperCase() + category.slice(1)}`]} [${v.opinions?.[category] || 0}]`)
        )
      )
    )
  );
};

exports.voteView = async (votes, filter, voteId) => {
  const list = Array.isArray(votes) ? votes : [votes];
  const title =
    filter === 'mine'   ? i18n.voteMineSectionTitle :
    filter === 'create' ? i18n.voteCreateSectionTitle :
    filter === 'edit'   ? i18n.voteUpdateSectionTitle :
    filter === 'open'   ? i18n.voteOpenTitle :
    filter === 'closed' ? i18n.voteClosedTitle :
                           i18n.voteAllSectionTitle;

  const voteToEdit = list.find(v => v.id === voteId) || {};
  const editTags = Array.isArray(voteToEdit.tags) ? voteToEdit.tags.filter(Boolean) : [];

  let filtered =
    filter === 'mine'   ? list.filter(v => v.createdBy === userId && v.status !== 'tombstone') : 
    filter === 'open'   ? list.filter(v => v.status === 'OPEN' && v.status !== 'tombstone') :
    filter === 'closed' ? list.filter(v => v.status === 'CLOSED' && v.status !== 'tombstone') :
                         list.filter(v => v.status !== 'tombstone');
  filtered = filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const voteOptions = ['ABSTENTION', 'YES', 'NO', 'CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'];
  const firstRow = ['ABSTENTION', 'YES', 'NO'];
  const secondRow = ['CONFUSED', 'FOLLOW_MAJORITY', 'NOT_INTERESTED'];

  const header = div({ class: 'tags-header' },
    h2(i18n.governanceTitle),
    p(i18n.governanceDescription)
  );

  return template(
    title,
    section(
      header,
      div({ class: 'filters' },
        form({ method: 'GET', action: '/votes' },
          button({ type: 'submit', name: 'filter', value: 'all', class: filter === 'all' ? 'filter-btn active' : 'filter-btn' }, i18n.voteFilterAll),
          button({ type: 'submit', name: 'filter', value: 'mine', class: filter === 'mine' ? 'filter-btn active' : 'filter-btn' }, i18n.voteFilterMine),
          button({ type: 'submit', name: 'filter', value: 'open', class: filter === 'open' ? 'filter-btn active' : 'filter-btn' }, i18n.voteFilterOpen),
          button({ type: 'submit', name: 'filter', value: 'closed', class: filter === 'closed' ? 'filter-btn active' : 'filter-btn' }, i18n.voteFilterClosed),
          button({ type: 'submit', name: 'filter', value: 'create', class: "create-button" }, i18n.voteCreateButton)
        )
      )
    ),
    section(
      (filter === 'edit' || filter === 'create')
        ? div({ class: 'vote-form' },
            form({ action: filter === 'edit' ? `/votes/update/${encodeURIComponent(voteId)}` : '/votes/create', method: 'POST' },
              label(i18n.voteQuestionLabel), br(),
              input({ type: 'text', name: 'question', id: 'question', required: true, value: voteToEdit.question || '' }), br(), br(),
              label(i18n.voteDeadlineLabel), br(),
              input({ type: 'datetime-local', name: 'deadline', id: 'deadline', required: true,
                min: moment().format('YYYY-MM-DDTHH:mm'),
                value: voteToEdit.deadline ? moment(voteToEdit.deadline).format('YYYY-MM-DDTHH:mm') : ''
              }), br(), br(),
              label(i18n.voteTagsLabel), br(),
              input({ type: 'text', name: 'tags', id: 'tags', value: editTags.join(', ') }), br(), br(),
              button({ type: 'submit' }, filter === 'edit' ? i18n.voteUpdateButton : i18n.voteCreateButton)
            )
          )
        : div({ class: 'vote-list' },
            filtered.length > 0
              ? filtered.map(v => renderVoteCard(v, voteOptions, firstRow, secondRow, userId, filter))
              : p(i18n.novotes)
          )
    )
  );
};

