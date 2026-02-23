const { div, h2, h3, p, section, button, form, a, input, span, pre, table, tr, td, strong } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("../views/main_views");
const moment = require("../server/node_modules/moment");

const FILTER_LABELS = {
  votes: i18n.typeVotes, vote: i18n.typeVote, recent: i18n.recent, all: i18n.all,
  mine: i18n.mine, tombstone: i18n.typeTombstone, pixelia: i18n.typePixelia,
  curriculum: i18n.typeCurriculum, document: i18n.typeDocument, bookmark: i18n.typeBookmark,
  feed: i18n.typeFeed, event: i18n.typeEvent, task: i18n.typeTask, report: i18n.typeReport,
  image: i18n.typeImage, audio: i18n.typeAudio, video: i18n.typeVideo, post: i18n.typePost,
  forum: i18n.typeForum, about: i18n.typeAbout, contact: i18n.typeContact, pub: i18n.typePub,
  transfer: i18n.typeTransfer, market: i18n.typeMarket, job: i18n.typeJob, tribe: i18n.typeTribe,
  project: i18n.typeProject, banking: i18n.typeBanking, bankWallet: i18n.typeBankWallet, bankClaim: i18n.typeBankClaim,
  aiExchange: i18n.typeAiExchange, parliament: i18n.typeParliament, courts: i18n.typeCourts
};

const BASE_FILTERS = ['recent', 'all', 'mine', 'tombstone'];
const CAT_BLOCK1  = ['votes', 'event', 'task', 'report', 'parliament', 'courts'];
const CAT_BLOCK2  = ['pub', 'tribe', 'about', 'contact', 'curriculum', 'vote', 'aiExchange'];
const CAT_BLOCK3  = ['banking', 'job', 'market', 'project', 'transfer', 'feed', 'post', 'pixelia'];
const CAT_BLOCK4  = ['forum', 'bookmark', 'image', 'video', 'audio', 'document'];

const SEARCH_FIELDS = ['author','id','from','to'];

const hiddenSearchInputs = (search) =>
  SEARCH_FIELDS.map(k => {
    const v = String(search?.[k] ?? '').trim();
    return v ? input({ type: 'hidden', name: k, value: v }) : null;
  }).filter(Boolean);

const toDatetimeLocal = (s) => {
  const raw = String(s || '').trim();
  if (!raw) return '';
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return '';
  return moment(ts).format('YYYY-MM-DDTHH:mm');
};

const toQueryString = (filter, search = {}) => {
  const parts = [];
  const f = String(filter || '').trim();
  if (f) parts.push(`filter=${encodeURIComponent(f)}`);
  for (const k of SEARCH_FIELDS) {
    const v = String(search?.[k] ?? '').trim();
    if (v) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
};

const filterBlocks = (blocks, filter, userId) => {
  if (filter === 'recent') return blocks.filter(b => Date.now() - b.ts < 24*60*60*1000);
  if (filter === 'mine') return blocks.filter(b => b.author === userId);
  if (filter === 'all') return blocks;
  if (filter === 'banking') return blocks.filter(b => b.type === 'bankWallet' || b.type === 'bankClaim');
  if (filter === 'parliament') {
    const pset = new Set(['parliamentTerm','parliamentProposal','parliamentLaw','parliamentCandidature','parliamentRevocation']);
    return blocks.filter(b => pset.has(b.type));
  }
  if (filter === 'courts') {
    const cset = new Set(['courtsCase','courtsEvidence','courtsAnswer','courtsVerdict','courtsSettlement','courtsSettlementProposal','courtsSettlementAccepted','courtsNomination','courtsNominationVote']);
    return blocks.filter(b => cset.has(b.type));
  }
  return blocks.filter(b => b.type === filter);
};

const generateFilterButtons = (filters, currentFilter, action, search = {}) =>
  div({ class: 'mode-buttons-cols' },
    filters.map(mode =>
      form({ method: 'GET', action },
        input({ type: 'hidden', name: 'filter', value: mode }),
        ...hiddenSearchInputs(search),
        button({
          type: 'submit',
          class: currentFilter === mode ? 'filter-btn active' : 'filter-btn'
        }, (FILTER_LABELS[mode]||mode).toUpperCase())
      )
    )
  );

const getViewDetailsAction = (type, block) => {
  switch (type) {
    case 'votes': return `/votes/${encodeURIComponent(block.id)}`;
    case 'transfer': return `/transfers/${encodeURIComponent(block.id)}`;
    case 'pixelia': return `/pixelia`;
    case 'tribe': return `/tribe/${encodeURIComponent(block.id)}`;
    case 'curriculum': return `/inhabitant/${encodeURIComponent(block.author)}`;
    case 'image': return `/images/${encodeURIComponent(block.id)}`;
    case 'audio': return `/audios/${encodeURIComponent(block.id)}`;
    case 'video': return `/videos/${encodeURIComponent(block.id)}`;
    case 'forum': return `/forum/${encodeURIComponent(block.content?.key||block.id)}`;
    case 'document': return `/documents/${encodeURIComponent(block.id)}`;
    case 'bookmark': return `/bookmarks/${encodeURIComponent(block.id)}`;
    case 'event': return `/events/${encodeURIComponent(block.id)}`;
    case 'task': return `/tasks/${encodeURIComponent(block.id)}`;
    case 'about': return `/author/${encodeURIComponent(block.author)}`;
    case 'post': return `/thread/${encodeURIComponent(block.id)}#${encodeURIComponent(block.id)}`;
    case 'vote': return `/thread/${encodeURIComponent(block.content.vote.link)}#${encodeURIComponent(block.content.vote.link)}`;
    case 'contact': return `/inhabitants`;
    case 'pub': return `/invites`;
    case 'market': return `/market/${encodeURIComponent(block.id)}`;
    case 'job': return `/jobs/${encodeURIComponent(block.id)}`;
    case 'project': return `/projects/${encodeURIComponent(block.id)}`;
    case 'report': return `/reports/${encodeURIComponent(block.id)}`;
    case 'bankWallet': return `/wallet`;
    case 'bankClaim': return `/banking${block.content?.epochId ? `/epoch/${encodeURIComponent(block.content.epochId)}` : ''}`;
    case 'parliamentTerm': return `/parliament`;
    case 'parliamentProposal': return `/parliament`;
    case 'parliamentLaw': return `/parliament`;
    case 'parliamentCandidature': return `/parliament`;
    case 'parliamentRevocation': return `/parliament`;
    case 'courtsCase': return `/courts`;
    case 'courtsEvidence': return `/courts`;
    case 'courtsAnswer': return `/courts`;
    case 'courtsVerdict': return `/courts`;
    case 'courtsSettlement': return `/courts`;
    case 'courtsSettlementProposal': return `/courts`;
    case 'courtsSettlementAccepted': return `/courts`;
    case 'courtsNomination': return `/courts`;
    case 'courtsNominationVote': return `/courts`;
    default: return null;
  }
};

const TYPE_COLORS = {
  post:'#3498db', vote:'#9b59b6', votes:'#9b59b6', about:'#1abc9c', contact:'#16a085',
  pub:'#2ecc71', tribe:'#e67e22', event:'#e74c3c', task:'#f39c12', report:'#c0392b',
  image:'#2980b9', audio:'#8e44ad', video:'#d35400', document:'#27ae60', bookmark:'#f1c40f',
  forum:'#1abc9c', feed:'#95a5a6', transfer:'#e74c3c', market:'#e67e22', job:'#3498db',
  project:'#2ecc71', banking:'#f39c12', bankWallet:'#f39c12', bankClaim:'#f39c12',
  pixelia:'#9b59b6', curriculum:'#1abc9c', aiExchange:'#3498db', tombstone:'#7f8c8d',
  parliamentTerm:'#8e44ad', parliamentProposal:'#8e44ad', parliamentLaw:'#8e44ad',
  parliamentCandidature:'#8e44ad', parliamentRevocation:'#8e44ad',
  courtsCase:'#c0392b', courtsEvidence:'#c0392b', courtsAnswer:'#c0392b',
  courtsVerdict:'#c0392b', courtsSettlement:'#c0392b', courtsNomination:'#c0392b'
};

const renderBlockDiagram = (blocks, qs) => {
  const last2 = blocks.slice(0, 2);
  if (!last2.length) return null;

  return div({ class: 'block-diagram-section' },
    h3({ class: 'block-diagram-title' }, i18n.blockchainLatestDatagram || 'Latest Datagram'),
    ...last2.map(block => {
      const ts = moment(block.ts).format('YYYY-MM-DD HH:mm:ss');
      const typeLabel = (FILTER_LABELS[block.type] || block.type).toUpperCase();
      const color = TYPE_COLORS[block.type] || '#95a5a6';
      const shortId = block.id.length > 20 ? block.id.slice(0, 10) + '…' + block.id.slice(-8) : block.id;
      const shortAuthor = block.author.length > 20 ? block.author.slice(0, 10) + '…' + block.author.slice(-8) : block.author;
      const contentKeys = Object.keys(block.content || {}).filter(k => k !== 'type').join(', ');
      const flags = [
        block.isTombstoned ? 'TOMBSTONED' : null,
        block.isReplaced ? 'REPLACED' : null,
        block.content?.replaces ? 'EDIT' : null
      ].filter(Boolean).join(' | ') || '—';

      const datagramQs = qs ? `${qs}&view=datagram` : '?view=datagram';
      return a({ href: `/blockexplorer/block/${encodeURIComponent(block.id)}${datagramQs}`, class: 'block-diagram-link' },
        div({ class: 'block-diagram', style: `border-color:${color};` },
          div({ class: 'block-diagram-ruler', style: `border-bottom-color:${color};` },
            span('0'), span('4'), span('8'), span('16'), span('24'), span('31')
          ),
          div({ class: 'block-diagram-grid' },
            div({ class: 'block-diagram-cell bd-seq' },
              span({ class: 'bd-label' }, 'SEQ:'),
              span({ class: 'bd-value' }, String(block.content?.sequence || '—'))
            ),
            div({ class: 'block-diagram-cell bd-type' },
              span({ class: 'bd-label' }, 'TYPE:'),
              span({ class: 'bd-value' }, typeLabel)
            ),
            div({ class: 'block-diagram-cell bd-ts' },
              span({ class: 'bd-label' }, 'TIMESTAMP:'),
              span({ class: 'bd-value' }, ts)
            ),
            div({ class: 'block-diagram-cell bd-id' },
              span({ class: 'bd-label' }, 'BLOCK ID:'),
              span({ class: 'bd-value' }, shortId)
            ),
            div({ class: 'block-diagram-cell bd-author' },
              span({ class: 'bd-label' }, 'AUTHOR:'),
              span({ class: 'bd-value' }, shortAuthor)
            ),
            div({ class: 'block-diagram-cell bd-flags' },
              span({ class: 'bd-label' }, 'FLAGS:'),
              span({ class: 'bd-value' }, flags)
            ),
            div({ class: 'block-diagram-cell bd-ctype' },
              span({ class: 'bd-label' }, 'CONTENT.TYPE:'),
              span({ class: 'bd-value' }, block.content?.type || '—')
            ),
            div({ class: 'block-diagram-cell bd-data' },
              span({ class: 'bd-label' }, 'CONTENT:'),
              span({ class: 'bd-value' }, contentKeys || '—')
            )
          )
        )
      );
    })
  );
};

const renderSingleBlockView = (block, filter = 'recent', userId, search = {}, viewMode = 'block') => {
  if (!block) {
    return template(
      i18n.blockchain,
      section(
        div({ class: 'tags-header' },
          h2(i18n.blockchain),
          p(i18n.blockchainDescription)
        ),
        p(i18n.blockchainNoBlocks || 'No blocks')
      )
    );
  }

  const qs = toQueryString(filter, search);
  const isDatagram = viewMode === 'datagram';

  const blockContent = isDatagram
    ? renderBlockDiagram([block], qs)
    : div(
        div({ class: 'block-single' },
          div({ class: 'block-row block-row--meta' },
            span({ class: 'blockchain-card-label' }, `${i18n.blockchainBlockID}:`),
            span({ class: 'blockchain-card-value' }, block.id)
          ),
          div({ class: 'block-row block-row--meta' },
            span({ class: 'blockchain-card-label' }, `${i18n.blockchainBlockTimestamp}:`),
            span({ class: 'blockchain-card-value' }, moment(block.ts).format('YYYY-MM-DDTHH:mm:ss.SSSZ')),
            span({ class: 'blockchain-card-label' }, `${i18n.blockchainBlockType}:`),
            span({ class: 'blockchain-card-value' }, (FILTER_LABELS[block.type]||block.type).toUpperCase())
          ),
          div({ class: 'block-row block-row--meta block-row--meta-spaced' },
            a({ href:`/author/${encodeURIComponent(block.author)}`, class:'block-author user-link' }, block.author)
          )
        ),
        div({ class:'block-row block-row--content' },
          div({ class:'block-content-preview' },
            pre({ class:'json-content' }, JSON.stringify(block.content,null,2))
          )
        )
      );

  return template(
    i18n.blockchain,
    section(
      div({ class: 'tags-header' },
        h2(i18n.blockchain),
        p(i18n.blockchainDescription)
      ),
      div({ class: 'mode-buttons-row' },
        div({ class: 'filter-column' },
          generateFilterButtons(BASE_FILTERS, filter, '/blockexplorer', search)
        ),
        div({ class: 'filter-column' },
          generateFilterButtons(CAT_BLOCK1, filter, '/blockexplorer', search),
          generateFilterButtons(CAT_BLOCK2, filter, '/blockexplorer', search)
        ),
        div({ class: 'filter-column' },
          generateFilterButtons(CAT_BLOCK3, filter, '/blockexplorer', search),
          generateFilterButtons(CAT_BLOCK4, filter, '/blockexplorer', search)
        )
      ),
      blockContent,
      div({ class:'block-row block-row--back' },
        form({ method:'GET', action:'/blockexplorer' },
          input({ type: 'hidden', name: 'filter', value: filter }),
          ...hiddenSearchInputs(search),
          button({ type:'submit', class:'filter-btn' }, `← ${i18n.blockchainBack}`)
        ),
        !block.isTombstoned && !block.isReplaced && getViewDetailsAction(block.type, block) ?
          form({ method:'GET', action:getViewDetailsAction(block.type, block) },
            button({ type:'submit', class:'filter-btn' }, i18n.visitContent)
          )
        : (block.isTombstoned || block.isReplaced) ?
          div({ class: 'deleted-label' },
            i18n.blockchainContentDeleted || "This content has been deleted."
          )
        : null
      )
    )
  );
};

const renderBlockchainView = (blocks, filter, userId, search = {}) => {
  const s = search || {};
  const authorVal = String(s.author || '');
  const idVal = String(s.id || '');
  const fromVal = toDatetimeLocal(s.from);
  const toVal = toDatetimeLocal(s.to);

  const shown = filterBlocks(blocks, filter, userId);
  const qs = toQueryString(filter, s);

  return template(
    i18n.blockchain,
    section(
      div({ class:'tags-header' },
        h2(i18n.blockchain),
        p(i18n.blockchainDescription)
      ),
      div({ class:'mode-buttons-row' },
        div({ class: 'filter-column' },
          generateFilterButtons(BASE_FILTERS, filter, '/blockexplorer', s)
        ),
        div({ class: 'filter-column' },
          generateFilterButtons(CAT_BLOCK1, filter, '/blockexplorer', s),
          generateFilterButtons(CAT_BLOCK2, filter, '/blockexplorer', s)
        ),
        div({ class: 'filter-column' },
          generateFilterButtons(CAT_BLOCK3, filter, '/blockexplorer', s),
          generateFilterButtons(CAT_BLOCK4, filter, '/blockexplorer', s)
        )
      ),
	div({ class: 'blockexplorer-search' },
	  form({ method: 'GET', action: '/blockexplorer', class: 'blockexplorer-search-form' },
	    input({ type: 'hidden', name: 'filter', value: filter }),
	    div({ class: 'blockexplorer-search-row' },
	      div({ class: 'blockexplorer-search-pair' },
		input({ type: 'text', name: 'id', value: idVal, placeholder: i18n.blockchainBlockID, class: 'blockexplorer-search-input' }),
		input({ type: 'text', name: 'author', value: authorVal, placeholder: i18n.courtsJudgeIdPh, class: 'blockexplorer-search-input' })
	      ),
	      div({ class: 'blockexplorer-search-dates' },
		input({ type: 'datetime-local', name: 'from', value: fromVal, class: 'blockexplorer-search-input' }),
		input({ type: 'datetime-local', name: 'to', value: toVal, class: 'blockexplorer-search-input' })
	      ),
	      div({ class: 'blockexplorer-search-actions' },
		button({ type: 'submit', class: 'filter-box__button' }, i18n.searchSubmit)
	      )
	    )
	  )
	),
      renderBlockDiagram(shown, qs),
      h2({ class: 'block-diagram-title' }, 'Blockchain Blocks'),
      shown.length === 0
        ? div(p(i18n.blockchainNoBlocks))
        : shown
            .sort((a,b)=>{
              const ta = a.type==='market'&&a.content.updatedAt
                ? new Date(a.content.updatedAt).getTime()
                : a.ts;
              const tb = b.type==='market'&&b.content.updatedAt
                ? new Date(b.content.updatedAt).getTime()
                : b.ts;
              return tb - ta;
            })
            .map(block=>
              div({ class:'block' },
                div({ class:'block-buttons' },
                  a({ href:`/blockexplorer/block/${encodeURIComponent(block.id)}${qs}`, class:'btn-singleview', title:i18n.blockchainDetails }, '⦿'),
                  a({ href:`/blockexplorer/block/${encodeURIComponent(block.id)}${qs}&view=datagram`, class:'btn-singleview btn-datagram', title:i18n.blockchainDatagram || 'Datagram' }, '⊞'),
                  !block.isTombstoned && !block.isReplaced && getViewDetailsAction(block.type, block) ?
                    form({ method:'GET', action:getViewDetailsAction(block.type, block) },
                      button({ type:'submit', class:'filter-btn' }, i18n.visitContent)
                    )
                  : (block.isTombstoned || block.isReplaced) ?
                    div({ class: 'deleted-label' },
                      i18n.blockchainContentDeleted || "This content has been deleted."
                    )
                  : null
                ),
                div({ class:'block-row block-row--meta' },
                  table({ class:'block-info-table' },
                    tr(td({ class:'card-label' }, i18n.blockchainBlockTimestamp), td({ class:'card-value' }, moment(block.ts).format('YYYY-MM-DDTHH:mm:ss.SSSZ'))),
                    tr(td({ class:'card-label' }, i18n.blockchainBlockID),        td({ class:'card-value' }, block.id)),
                    tr(td({ class:'card-label' }, i18n.blockchainBlockType),      td({ class:'card-value' }, (FILTER_LABELS[block.type]||block.type).toUpperCase())),
                    tr(td({ class:'card-label' }, i18n.blockchainBlockAuthor),    td({ class:'card-value' }, a({ href:`/author/${encodeURIComponent(block.author)}`, class:'block-author user-link' }, block.author)))
                  )
                )
              )
            )
    )
  );
};

module.exports = { renderBlockchainView, renderSingleBlockView };

