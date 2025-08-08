const { div, h2, p, section, button, form, a, input, span, pre, table, tr, td } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require("../views/main_views");
const moment = require("../server/node_modules/moment");

const FILTER_LABELS = {
    votes: i18n.typeVotes, vote: i18n.typeVote, recent: i18n.recent, all: i18n.all,
    mine: i18n.mine, tombstone: i18n.typeTombstone, pixelia: i18n.typePixelia,
    curriculum: i18n.typeCurriculum, document: i18n.typeDocument, bookmark: i18n.typeBookmark,
    feed: i18n.typeFeed, event: i18n.typeEvent, task: i18n.typeTask, report: i18n.typeReport,
    image: i18n.typeImage, audio: i18n.typeAudio, video: i18n.typeVideo, post: i18n.typePost,
    forum: i18n.typeForum, about: i18n.typeAbout, contact: i18n.typeContact, pub: i18n.typePub,
    transfer: i18n.typeTransfer, market: i18n.typeMarket, job: i18n.typeJob, tribe: i18n.typeTribe
};

const BASE_FILTERS = ['recent', 'all', 'mine', 'tombstone'];
const CAT_BLOCK1  = ['votes', 'event', 'task', 'report'];
const CAT_BLOCK2  = ['pub', 'tribe', 'about', 'contact', 'curriculum', 'vote'];
const CAT_BLOCK3  = ['market', 'job', 'transfer', 'feed', 'post', 'pixelia'];
const CAT_BLOCK4  = ['forum', 'bookmark', 'image', 'video', 'audio', 'document'];

const filterBlocks = (blocks, filter, userId) => {
    if (filter === 'recent') return blocks.filter(b => Date.now() - b.ts < 24*60*60*1000);
    if (filter === 'mine')   return blocks.filter(b => b.author === userId);
    if (filter === 'all')    return blocks;
    return blocks.filter(b => b.type === filter);
};

const generateFilterButtons = (filters, currentFilter, action) =>
    div({ class: 'mode-buttons-cols' },
        filters.map(mode =>
            form({ method: 'GET', action },
                input({ type: 'hidden', name: 'filter', value: mode }),
                button({
                    type: 'submit',
                    class: currentFilter === mode ? 'filter-btn active' : 'filter-btn'
                }, (FILTER_LABELS[mode]||mode).toUpperCase())
            )
        )
    );

const getViewDetailsAction = (type, block) => {
    switch (type) {
        case 'votes':      return `/votes/${encodeURIComponent(block.id)}`;
        case 'transfer':   return `/transfers/${encodeURIComponent(block.id)}`;
        case 'pixelia':    return `/pixelia`;
        case 'tribe':      return `/tribe/${encodeURIComponent(block.id)}`;
        case 'curriculum': return `/inhabitant/${encodeURIComponent(block.author)}`;
        case 'image':      return `/images/${encodeURIComponent(block.id)}`;
        case 'audio':      return `/audios/${encodeURIComponent(block.id)}`;
        case 'video':      return `/videos/${encodeURIComponent(block.id)}`;
        case 'forum':      return `/forum/${encodeURIComponent(block.content?.key||block.id)}`;
        case 'document':   return `/documents/${encodeURIComponent(block.id)}`;
        case 'bookmark':   return `/bookmarks/${encodeURIComponent(block.id)}`;
        case 'event':      return `/events/${encodeURIComponent(block.id)}`;
        case 'task':       return `/tasks/${encodeURIComponent(block.id)}`;
        case 'about':      return `/author/${encodeURIComponent(block.author)}`;
        case 'post':       return `/thread/${encodeURIComponent(block.id)}#${encodeURIComponent(block.id)}`;
        case 'vote':       return `/thread/${encodeURIComponent(block.content.vote.link)}#${encodeURIComponent(block.content.vote.link)}`;
        case 'contact':    return `/inhabitants`;
        case 'pub':        return `/invites`;
        case 'market':     return `/market/${encodeURIComponent(block.id)}`;
        case 'job':        return `/jobs/${encodeURIComponent(block.id)}`;
        case 'report':     return `/reports/${encodeURIComponent(block.id)}`;
        default:           return null;
    }
};

const renderSingleBlockView = (block, filter) =>
    template(
        i18n.blockchain,
        section(
            div({ class: 'tags-header' },
                h2(i18n.blockchain),
                p(i18n.blockchainDescription)
            ),
            div({ class: 'mode-buttons-row' },
                div({ style: 'display:flex;flex-direction:column;gap:8px;' },
                    generateFilterButtons(BASE_FILTERS, filter, '/blockexplorer')
                ),
                div({ style: 'display:flex;flex-direction:column;gap:8px;' },
                    generateFilterButtons(CAT_BLOCK1, filter, '/blockexplorer'),
                    generateFilterButtons(CAT_BLOCK2, filter, '/blockexplorer')
                ),
                div({ style: 'display:flex;flex-direction:column;gap:8px;' },
                    generateFilterButtons(CAT_BLOCK3, filter, '/blockexplorer'),
                    generateFilterButtons(CAT_BLOCK4, filter, '/blockexplorer')
                )
            ),
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
                div({ class: 'block-row block-row--meta', style:'margin-top:8px;' },
                    a({ href:`/author/${encodeURIComponent(block.author)}`, class:'block-author user-link' }, block.author)
                )
            ),
            div({ class:'block-row block-row--content' },
                div({ class:'block-content-preview' },
                    pre({ class:'json-content' }, JSON.stringify(block.content,null,2))
                )
            ),
	   div({ class:'block-row block-row--back' },
	    form({ method:'GET', action:'/blockexplorer' },
		button({ type:'submit', class:'filter-btn' }, `← ${i18n.blockchainBack}`)
	    ),
	    !block.isTombstoned && !block.isReplaced && getViewDetailsAction(block.type, block) ?
		form({ method:'GET', action:getViewDetailsAction(block.type, block) },
		    button({ type:'submit', class:'filter-btn' }, i18n.visitContent)
		)
	    : (block.isTombstoned || block.isReplaced) ?
		div({ class: 'deleted-label', style: 'color:#b00;font-weight:bold;margin-top:8px;' },
		    i18n.blockchainContentDeleted || "This content has been deleted."
		)
	    : null
	    )
        )
    );

const renderBlockchainView = (blocks, filter, userId) =>
    template(
        i18n.blockchain,
        section(
            div({ class:'tags-header' },
                h2(i18n.blockchain),
                p(i18n.blockchainDescription)
            ),
            div({ class:'mode-buttons-row' },
                div({ style:'display:flex;flex-direction:column;gap:8px;' },
                    generateFilterButtons(BASE_FILTERS,filter,'/blockexplorer')
                ),
                div({ style:'display:flex;flex-direction:column;gap:8px;' },
                    generateFilterButtons(CAT_BLOCK1,filter,'/blockexplorer'),
                    generateFilterButtons(CAT_BLOCK2,filter,'/blockexplorer')
                ),
                div({ style:'display:flex;flex-direction:column;gap:8px;' },
                    generateFilterButtons(CAT_BLOCK3,filter,'/blockexplorer'),
                    generateFilterButtons(CAT_BLOCK4,filter,'/blockexplorer')
                )
            ),
            filterBlocks(blocks,filter,userId).length===0
                ? div(p(i18n.blockchainNoBlocks))
                : filterBlocks(blocks,filter,userId)
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
			    a({ href:`/blockexplorer/block/${encodeURIComponent(block.id)}`, class:'btn-singleview', title:i18n.blockchainDetails },'⦿'),
			    !block.isTombstoned && !block.isReplaced && getViewDetailsAction(block.type, block) ?
			    form({ method:'GET', action:getViewDetailsAction(block.type, block) },
				button({ type:'submit', class:'filter-btn' }, i18n.visitContent)
			    )
			    : (block.isTombstoned || block.isReplaced) ?
			    div({ class: 'deleted-label', style: 'color:#b00;font-weight:bold;margin-top:8px;' },
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

module.exports = { renderBlockchainView, renderSingleBlockView };

