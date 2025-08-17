const { div, h2, p, section, button, form, input, ul, li, a, h3, span, strong, table, tr, td, th } = require("../server/node_modules/hyperaxe");
const { template, i18n } = require('./main_views');

const C = (stats, t) => Number((stats && stats.content && stats.content[t]) || 0);
const O = (stats, t) => Number((stats && stats.opinions && stats.opinions[t]) || 0);

exports.statsView = (stats, filter) => {
  const title = i18n.statsTitle;
  const description = i18n.statsDescription;
  const modes = ['ALL', 'MINE', 'TOMBSTONE'];
  const types = [
    'bookmark', 'event', 'task', 'votes', 'report', 'feed', 'project',
    'image', 'audio', 'video', 'document', 'transfer', 'post', 'tribe',
    'market', 'forum', 'job', 'aiExchange'
  ];
  const totalContent = types.reduce((sum, t) => sum + C(stats, t), 0);
  const totalOpinions = types.reduce((sum, t) => sum + O(stats, t), 0);
  const blockStyle = 'padding:16px;border:1px solid #ddd;border-radius:8px;margin-bottom:24px;';
  const headerStyle = 'background-color:#f8f9fa; padding:24px; border-radius:8px; border:1px solid #e0e0e0; box-shadow:0 2px 8px rgba(0,0,0,0.1);';

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
        div({ style: headerStyle },
          h3({ style: 'font-size:18px; color:#555; margin:8px 0;' }, `${i18n.statsCreatedAt}: `, span({ style: 'color:#888;' }, stats.createdAt)),
          h3({ style: 'font-size:18px; color:#555; margin:8px 0; font-weight:600;' },
            a({ class: "user-link", href: `/author/${encodeURIComponent(stats.id)}`, style: 'color:#007bff; text-decoration:none;' }, stats.id)
          ),
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
                strong(`${i18n.statsSize}: `, span({ style: 'color:#888;' }, span({ style: 'color:#555;' }, stats.folderSize)))
              )
            )
          )
        ),

        div({ style: headerStyle },
          h3({ style: 'font-size:18px; color:#555; margin:8px 0; font-weight:600;' }, i18n.statsBankingTitle),
          ul({ style: 'list-style-type:none; padding:0; margin:0;' },
		li({ style: 'font-size:18px; color:#555; margin:8px 0;' },
		  `${i18n.statsEcoWalletLabel}: `,
		  a(
		    { 
		      href: '/wallet',
		      style: 'color:#007bff; text-decoration:none; word-break:break-all;' 
		    },
		    stats?.banking?.myAddress || i18n.statsEcoWalletNotConfigured
		  )
		),
            li({ style: 'font-size:18px; color:#555; margin:8px 0;' },
              `${i18n.statsTotalEcoAddresses}: `,
              span({ style: 'color:#888;' }, String(stats?.banking?.totalAddresses || 0))
            )
          )
        ),

        div({ style: headerStyle },
          h3({ style: 'font-size:18px; color:#555; margin:8px 0; font-weight:600;' }, i18n.statsAITraining),
          ul({ style: 'list-style-type:none; padding:0; margin:0;' },
            li({ style: 'font-size:18px; color:#555; margin:8px 0;' },
              `${i18n.statsAIExchanges}: `,
              span({ style: 'color:#888;' }, String(C(stats, 'aiExchange') || 0))
            )
          )
        ),

        filter === 'ALL'
          ? div({ class: 'stats-container' }, [
              div({ style: blockStyle },
                h2(i18n.statsActivity7d),
                table({ style: 'width:100%; border-collapse: collapse;' },
                  tr(th(i18n.day), th(i18n.messages)),
                  ...(Array.isArray(stats.activity?.daily7) ? stats.activity.daily7 : []).map(row =>
                    tr(td(row.day), td(String(row.count)))
                  )
                ),
                p(`${i18n.statsActivity7dTotal}: ${stats.activity?.daily7Total || 0}`),
                p(`${i18n.statsActivity30dTotal}: ${stats.activity?.daily30Total || 0}`)
              ),
              div({ style: blockStyle },
                h2(`${i18n.statsDiscoveredTribes}: ${stats.memberTribes.length}`),
                table({ style: 'width:100%; border-collapse: collapse; margin-top: 8px;' },
                  tr(th(i18n.typeTribe || 'Tribe')),
                  ...stats.memberTribes.map(name => tr(td(name)))
                )
              ),
              div({ style: blockStyle }, h2(`${i18n.statsUsersTitle}: ${stats.usersKPIs?.totalInhabitants || stats.inhabitants || 0}`)),
              div({ style: blockStyle }, h2(`${i18n.statsDiscoveredForum}: ${C(stats, 'forum')}`)),
              div({ style: blockStyle }, h2(`${i18n.statsDiscoveredTransfer}: ${C(stats, 'transfer')}`)),
              div({ style: blockStyle },
                h2(i18n.statsMarketTitle),
                ul([
                  li(`${i18n.statsMarketTotal}: ${stats.marketKPIs?.total || 0}`),
                  li(`${i18n.statsMarketForSale}: ${stats.marketKPIs?.forSale || 0}`),
                  li(`${i18n.statsMarketReserved}: ${stats.marketKPIs?.reserved || 0}`),
                  li(`${i18n.statsMarketClosed}: ${stats.marketKPIs?.closed || 0}`),
                  li(`${i18n.statsMarketSold}: ${stats.marketKPIs?.sold || 0}`),
                  li(`${i18n.statsMarketRevenue}: ${((stats.marketKPIs?.revenueECO || 0)).toFixed(6)} ECO`),
                  li(`${i18n.statsMarketAvgSoldPrice}: ${((stats.marketKPIs?.avgSoldPrice || 0)).toFixed(6)} ECO`)
                ])
              ),
              div({ style: blockStyle },
                h2(i18n.statsProjectsTitle),
                ul([
                  li(`${i18n.statsProjectsTotal}: ${stats.projectsKPIs?.total || 0}`),
                  li(`${i18n.statsProjectsActive}: ${stats.projectsKPIs?.active || 0}`),
                  li(`${i18n.statsProjectsCompleted}: ${stats.projectsKPIs?.completed || 0}`),
                  li(`${i18n.statsProjectsPaused}: ${stats.projectsKPIs?.paused || 0}`),
                  li(`${i18n.statsProjectsCancelled}: ${stats.projectsKPIs?.cancelled || 0}`),
                  li(`${i18n.statsProjectsGoalTotal}: ${(stats.projectsKPIs?.ecoGoalTotal || 0)} ECO`),
                  li(`${i18n.statsProjectsPledgedTotal}: ${(stats.projectsKPIs?.ecoPledgedTotal || 0)} ECO`),
                  li(`${i18n.statsProjectsSuccessRate}: ${((stats.projectsKPIs?.successRate || 0)).toFixed(1)}%`),
                  li(`${i18n.statsProjectsAvgProgress}: ${((stats.projectsKPIs?.avgProgress || 0)).toFixed(1)}%`),
                  li(`${i18n.statsProjectsMedianProgress}: ${((stats.projectsKPIs?.medianProgress || 0)).toFixed(1)}%`),
                  li(`${i18n.statsProjectsActiveFundingAvg}: ${((stats.projectsKPIs?.activeFundingAvg || 0)).toFixed(1)}%`)
                ])
              ),
              div({ style: blockStyle },
                h2(i18n.statsJobsTitle),
                ul([
                  li(`${i18n.statsJobsTotal}: ${stats.jobsKPIs?.total || 0}`),
                  li(`${i18n.statsJobsOpen}: ${stats.jobsKPIs?.open || 0}`),
                  li(`${i18n.statsJobsClosed}: ${stats.jobsKPIs?.closed || 0}`),
                  li(`${i18n.statsJobsOpenVacants}: ${stats.jobsKPIs?.openVacants || 0}`),
                  li(`${i18n.statsJobsSubscribersTotal}: ${stats.jobsKPIs?.subscribersTotal || 0}`),
                  li(`${i18n.statsJobsAvgSalary}: ${((stats.jobsKPIs?.avgSalary || 0)).toFixed(2)} ECO`),
                  li(`${i18n.statsJobsMedianSalary}: ${((stats.jobsKPIs?.medianSalary || 0)).toFixed(2)} ECO`)
                ])
              ),
              div({ style: blockStyle },
                h2(`${i18n.statsNetworkOpinions}: ${totalOpinions}`),
                ul(types.map(t => O(stats, t) > 0 ? li(`${i18n[`stats${t.charAt(0).toUpperCase() + t.slice(1)}`]}: ${O(stats, t)}`) : null).filter(Boolean))
              ),
              div({ style: blockStyle },
                h2(`${i18n.statsNetworkContent}: ${totalContent}`),
                ul(types.map(t => C(stats, t) > 0 ? li(`${i18n[`stats${t.charAt(0).toUpperCase() + t.slice(1)}`]}: ${C(stats, t)}`) : null).filter(Boolean))
              )
            ])
          : filter === 'MINE'
            ? div({ class: 'stats-container' }, [
                div({ style: blockStyle },
                  h2(i18n.statsActivity7d),
                  table({ style: 'width:100%; border-collapse: collapse;' },
                    tr(th(i18n.day), th(i18n.messages)),
                    ...(Array.isArray(stats.activity?.daily7) ? stats.activity.daily7 : []).map(row =>
                      tr(td(row.day), td(String(row.count)))
                    )
                  ),
                  p(`${i18n.statsActivity7dTotal}: ${stats.activity?.daily7Total || 0}`),
                  p(`${i18n.statsActivity30dTotal}: ${stats.activity?.daily30Total || 0}`)
                ),
                div({ style: blockStyle },
                  h2(`${i18n.statsDiscoveredTribes}: ${stats.memberTribes.length}`),
                  table({ style: 'width:100%; border-collapse: collapse; margin-top: 8px;' },
                    tr(th(i18n.typeTribe || 'Tribe')),
                    ...stats.memberTribes.map(name => tr(td(name)))
                  )
                ),
                div({ style: blockStyle }, h2(`${i18n.statsYourForum}: ${C(stats, 'forum')}`)),
                div({ style: blockStyle }, h2(`${i18n.statsYourTransfer}: ${C(stats, 'transfer')}`)),
                div({ style: blockStyle },
                  h2(i18n.statsMarketTitle),
                  ul([
                    li(`${i18n.statsMarketTotal}: ${stats.marketKPIs?.total || 0}`),
                    li(`${i18n.statsMarketForSale}: ${stats.marketKPIs?.forSale || 0}`),
                    li(`${i18n.statsMarketReserved}: ${stats.marketKPIs?.reserved || 0}`),
                    li(`${i18n.statsMarketClosed}: ${stats.marketKPIs?.closed || 0}`),
                    li(`${i18n.statsMarketSold}: ${stats.marketKPIs?.sold || 0}`),
                    li(`${i18n.statsMarketRevenue}: ${((stats.marketKPIs?.revenueECO || 0)).toFixed(6)} ECO`),
                    li(`${i18n.statsMarketAvgSoldPrice}: ${((stats.marketKPIs?.avgSoldPrice || 0)).toFixed(6)} ECO`)
                  ])
                ),
                div({ style: blockStyle },
                  h2(i18n.statsProjectsTitle),
                  ul([
                    li(`${i18n.statsProjectsTotal}: ${stats.projectsKPIs?.total || 0}`),
                    li(`${i18n.statsProjectsActive}: ${stats.projectsKPIs?.active || 0}`),
                    li(`${i18n.statsProjectsCompleted}: ${stats.projectsKPIs?.completed || 0}`),
                    li(`${i18n.statsProjectsPaused}: ${stats.projectsKPIs?.paused || 0}`),
                    li(`${i18n.statsProjectsCancelled}: ${stats.projectsKPIs?.cancelled || 0}`),
                    li(`${i18n.statsProjectsGoalTotal}: ${(stats.projectsKPIs?.ecoGoalTotal || 0)} ECO`),
                    li(`${i18n.statsProjectsPledgedTotal}: ${(stats.projectsKPIs?.ecoPledgedTotal || 0)} ECO`),
                    li(`${i18n.statsProjectsSuccessRate}: ${((stats.projectsKPIs?.successRate || 0)).toFixed(1)}%`),
                    li(`${i18n.statsProjectsAvgProgress}: ${((stats.projectsKPIs?.avgProgress || 0)).toFixed(1)}%`),
                    li(`${i18n.statsProjectsMedianProgress}: ${((stats.projectsKPIs?.medianProgress || 0)).toFixed(1)}%`),
                    li(`${i18n.statsProjectsActiveFundingAvg}: ${((stats.projectsKPIs?.activeFundingAvg || 0)).toFixed(1)}%`)
                  ])
                ),
                div({ style: blockStyle },
                  h2(`${i18n.statsYourOpinions}: ${totalOpinions}`),
                  ul(types.map(t => O(stats, t) > 0 ? li(`${i18n[`stats${t.charAt(0).toUpperCase() + t.slice(1)}`]}: ${O(stats, t)}`) : null).filter(Boolean))
                ),
                div({ style: blockStyle },
                  h2(`${i18n.statsYourContent}: ${totalContent}`),
                  ul(types.map(t => C(stats, t) > 0 ? li(`${i18n[`stats${t.charAt(0).toUpperCase() + t.slice(1)}`]}: ${C(stats, t)}`) : null).filter(Boolean))
                )
              ])
            : div({ class: 'stats-container' }, [
                div({ style: blockStyle },
                  h2(`${i18n.TOMBSTONEButton}: ${stats.userTombstoneCount}`),
                  h2(`${i18n.statsTombstoneRatio.toUpperCase()}: ${((stats.tombstoneKPIs?.ratio || 0)).toFixed(2)}%`)
                )
              ])
      )
    )
  );
};

