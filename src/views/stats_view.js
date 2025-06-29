const { div, h2, p, section, button, form, input, ul, li, a, h3, span, strong } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');

exports.statsView = (stats, filter) => {
  const title = i18n.statsTitle;
  const description = i18n.statsDescription;
  const modes = ['ALL', 'MINE', 'TOMBSTONE'];
  const types = [
    'bookmark', 'event', 'task', 'votes', 'report', 'feed',
    'image', 'audio', 'video', 'document', 'transfer', 'post', 'tribe', 'market'
  ];
  const totalContent = types.reduce((sum, t) => sum + (stats.content[t] || 0), 0);
  const totalOpinions = types.reduce((sum, t) => sum + (stats.opinions[t] || 0), 0);
  const blockStyle = 'padding:16px;border:1px solid #ddd;border-radius:8px;margin-bottom:24px;';

  return template(
    title,
    section(
      div({ class: 'tags-header' },
        h2(title),
        p(description)
      ),
      div({ class: 'mode-buttons', style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:16px;margin-bottom:24px;' },
        modes.map(m =>
          form({ method: 'GET', action: '/stats' },
            input({ type: 'hidden', name: 'filter', value: m }),
            button({ type: 'submit', class: filter === m ? 'filter-btn active' : 'filter-btn' }, i18n[m + 'Button'])
          )
        )
      ),
      section(
	div({ style: 'background-color:#f8f9fa; padding:24px; border-radius:8px; border:1px solid #e0e0e0; box-shadow:0 2px 8px rgba(0,0,0,0.1);' },
	    h3({ style: 'font-size:18px; color:#555; margin:8px 0; font-weight:600;' }, `${i18n.statsOasisID}: `, a({ href: `/author/${encodeURIComponent(stats.id)}`, style: 'color:#007bff; text-decoration:none;' }, stats.id)),
	    h3({ style: 'font-size:18px; color:#555; margin:8px 0;' }, `${i18n.statsCreatedAt}: `, span({ style: 'color:#888;' }, stats.createdAt)),
	  div({ style: 'margin-bottom:16px;' },
	  ul({ style: 'list-style-type:none; padding:0; margin:0;' },
	    li({ style: 'font-size:18px; color:#555; margin:8px 0;' },
	      `${i18n.statsBlobsSize}: `,
	      span({ style: 'color:#888;' }, stats.statsBlobsSize)
	    ),
	    li({ style: 'font-size:18px; color:#555; margin:8px 0;' },
	      `${i18n.statsBlockchainSize}: `,
	      span({ style: 'color:#888;' }, stats.statsBlockchainSize)
	    ),
	    li({ style: 'font-size:18px; color:#555; margin:8px 0;' },
	      strong(`${i18n.statsSize}: `,
	      span({ style: 'color:#888;' },
	      span({ style: 'color:#555;' }, stats.folderSize) 
	      )
	      )
	    )
	   )
	  )
	),
        filter === 'ALL'
          ? div({ class: 'stats-container' }, [
            div({ style: blockStyle },
              h2(`${i18n.statsTotalInhabitants}: ${stats.inhabitants}`)
            ),
            div({ style: blockStyle },
              h2(`${i18n.statsDiscoveredTribes}: ${stats.content.tribe}`)
            ),
            div({ style: blockStyle },
              h2(`${i18n.statsDiscoveredMarket}: ${stats.content.market}`)
            ),
            div({ style: blockStyle },
              h2(`${i18n.statsNetworkOpinions}: ${totalOpinions}`),
              ul(types.map(t =>
                stats.opinions[t] > 0
                  ? li(`${i18n[`stats${t.charAt(0).toUpperCase() + t.slice(1)}`]}: ${stats.opinions[t]}`)
                  : null
              ).filter(Boolean))
            ),
            div({ style: blockStyle },
              h2(`${i18n.statsNetworkContent}: ${totalContent}`),
              ul(types.map(t =>
                stats.content[t] > 0
                  ? li(`${i18n[`stats${t.charAt(0).toUpperCase() + t.slice(1)}`]}: ${stats.content[t]}`)
                  : null
              ).filter(Boolean))
            )
          ])
          : filter === 'MINE'
            ? div({ class: 'stats-container' }, [
              div({ style: blockStyle },
                h2(`${i18n.statsDiscoveredTribes}: ${stats.memberTribes.length}`),
                ul(stats.memberTribes.map(name => li(name)))
              ),
              div({ style: blockStyle },
                h2(`${i18n.statsYourMarket}: ${stats.content.market}`)
              ),
              div({ style: blockStyle },
                h2(`${i18n.statsYourOpinions}: ${totalOpinions}`),
                ul(types.map(t =>
                  stats.opinions[t] > 0
                    ? li(`${i18n[`stats${t.charAt(0).toUpperCase() + t.slice(1)}`]}: ${stats.opinions[t]}`)
                    : null
                ).filter(Boolean))
              ),
              div({ style: blockStyle },
                h2(`${i18n.statsYourContent}: ${totalContent}`),
                ul(types.map(t =>
                  stats.content[t] > 0
                    ? li(`${i18n[`stats${t.charAt(0).toUpperCase() + t.slice(1)}`]}: ${stats.content[t]}`)
                    : null
                ).filter(Boolean))
              )
            ])
            : div({ class: 'stats-container' }, [
              div({ style: blockStyle },
                h2(`${i18n.TOMBSTONEButton}: ${stats.userTombstoneCount}`),
                ul(
                  li(`${i18n.statsNetwork}: ${stats.networkTombstoneCount}`),
                  li(`${i18n.statsYou}: ${stats.userTombstoneCount}`)
                )
              )
            ])
      )
    )
  );
};
