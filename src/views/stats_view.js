const { div, h2, p, section, button, form, input, ul, li, a, h3, span, strong, table, thead, tbody, tr, td, th } = require("../server/node_modules/hyperaxe");
const { template, i18n, userLink } = require('./main_views');

Object.assign(i18n, {
  statsChat: "Chats",
  statsChatMessage: "Chat messages",
  statsPad: "Pads",
  statsPadEntry: "Pad entries",
  statsGameScore: "Game scores",
  statsParliamentCandidature: "Parliament candidatures",
  statsParliamentTerm: "Parliament terms",
  statsParliamentProposal: "Parliament proposals",
  statsParliamentRevocation: "Parliament revocations",
  statsParliamentLaw: "Parliament laws",
  statsCourtsCase: "Court cases",
  statsCourtsEvidence: "Court evidence",
  statsCourtsAnswer: "Court answers",
  statsCourtsVerdict: "Court verdicts",
  statsCourtsSettlement: "Court settlements",
  statsCourtsSettlementProposal: "Settlement proposals",
  statsCourtsSettlementAccepted: "Settlements accepted",
  statsCourtsNomination: "Judge nominations",
  statsCourtsNominationVote: "Nomination votes"
});

const C = (stats, t) => Number((stats && stats.content && stats.content[t]) || 0);
const O = (stats, t) => Number((stats && stats.opinions && stats.opinions[t]) || 0);

const wClass = (pct) => {
  const n = Math.max(0, Math.min(100, Math.round((pct || 0) / 5) * 5));
  return `stats-w-${n}`;
};

exports.statsView = (stats, filter) => {
  const title = i18n.statsTitle;
  const description = i18n.statsDescription;
  const modes = ['ALL', 'MINE', 'TOMBSTONE'];
  const types = [
    'bookmark', 'event', 'task', 'votes', 'report', 'feed', 'project',
    'image', 'torrent', 'audio', 'video', 'document', 'transfer', 'post', 'tribe',
    'market', 'forum', 'job', 'aiExchange', 'map', 'shop', 'shopProduct',
    'chat', 'chatMessage', 'pad', 'padEntry', 'gameScore', 'calendar', 'calendarDate', 'calendarNote',
    'parliamentCandidature','parliamentTerm','parliamentProposal','parliamentRevocation','parliamentLaw',
    'courtsCase','courtsEvidence','courtsAnswer','courtsVerdict','courtsSettlement','courtsSettlementProposal','courtsSettlementAccepted','courtsNomination','courtsNominationVote'
  ];
  const labels = {
    bookmark: i18n.statsBookmark,
    event: i18n.statsEvent,
    task: i18n.statsTask,
    votes: i18n.statsVotes,
    report: i18n.statsReport,
    feed: i18n.statsFeed,
    project: i18n.statsProject,
    image: i18n.statsImage,
    torrent: i18n.statsTorrent,
    audio: i18n.statsAudio,
    video: i18n.statsVideo,
    document: i18n.statsDocument,
    transfer: i18n.statsTransfer,
    post: i18n.statsPost,
    tribe: i18n.statsTribe,
    market: i18n.statsMarket,
    forum: i18n.statsForum,
    job: i18n.statsJob,
    aiExchange: i18n.statsAiExchange,
    map: i18n.statsMap,
    shop: i18n.statsShop,
    shopProduct: i18n.statsShopProduct,
    chat: i18n.statsChat,
    chatMessage: i18n.statsChatMessage,
    pad: i18n.statsPad,
    padEntry: i18n.statsPadEntry,
    gameScore: i18n.statsGameScore,
    calendar: i18n.statsCalendar,
    calendarDate: i18n.statsCalendarDate,
    calendarNote: i18n.statsCalendarNote,
    parliamentCandidature: i18n.statsParliamentCandidature,
    parliamentTerm: i18n.statsParliamentTerm,
    parliamentProposal: i18n.statsParliamentProposal,
    parliamentRevocation: i18n.statsParliamentRevocation,
    parliamentLaw: i18n.statsParliamentLaw,
    courtsCase: i18n.statsCourtsCase,
    courtsEvidence: i18n.statsCourtsEvidence,
    courtsAnswer: i18n.statsCourtsAnswer,
    courtsVerdict: i18n.statsCourtsVerdict,
    courtsSettlement: i18n.statsCourtsSettlement,
    courtsSettlementProposal: i18n.statsCourtsSettlementProposal,
    courtsSettlementAccepted: i18n.statsCourtsSettlementAccepted,
    courtsNomination: i18n.statsCourtsNomination,
    courtsNominationVote: i18n.statsCourtsNominationVote
  };
  const totalContent = types.filter(t => t !== 'karmaScore').reduce((sum, t) => sum + C(stats, t), 0);
  const totalOpinions = types.reduce((sum, t) => sum + O(stats, t), 0);

  const fmtNum = (n) => {
    if (typeof n !== 'number' || !isFinite(n)) return '0';
    if (Math.abs(n) >= 100) return n.toFixed(0);
    if (Math.abs(n) >= 10) return n.toFixed(1);
    return n.toFixed(2);
  };

  const isZero = (value) => {
    if (value === 0 || value === '0') return true;
    const s = String(value == null ? '' : value).trim();
    if (!s) return true;
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return false;
    return n === 0;
  };

  const kpi = (label, value) => {
    if (isZero(value)) return null;
    return div({ class: 'stats-kpi' },
      div({ class: 'stats-kpi-label' }, label),
      div({ class: 'stats-kpi-value' }, String(value))
    );
  };

  const kpiBar = (label, value, pct) => {
    const n = Math.max(0, Math.min(100, Number(pct) || 0));
    return div({ class: 'stats-kpi' },
      div({ class: 'stats-kpi-label' }, label),
      div({ class: 'stats-kpi-value' }, String(value)),
      n > 0
        ? div({ class: 'stats-bar-track stats-kpi-bar' },
            div({ class: `stats-bar-fill ${wClass(n)}` })
          )
        : null
    );
  };

  const kpiGrid = (...tiles) => div({ class: 'stats-grid' }, tiles.filter(Boolean));

  const renderTopList = (items, getName, getCount, max) => {
    if (!items || !items.length) return p({ class: 'no-content' }, i18n.no_results || 'No data');
    const m = Math.max(1, max || items[0] && getCount(items[0]) || 1);
    return ul({ class: 'stats-toplist' },
      ...items.map(it => {
        const cnt = getCount(it);
        const pct = (cnt / m) * 100;
        return li(
          span({ class: 'stats-toplist-name' }, getName(it)),
          div({ class: 'stats-bar-track' },
            div({ class: `stats-bar-fill ${wClass(pct)}` })
          ),
          span({ class: 'stats-toplist-num' }, String(cnt))
        );
      })
    );
  };

  const carbonChart = (() => {
    const parseSize = (s) => {
      if (!s) return 0;
      const m = String(s).match(/([\d.]+)\s*(GB|MB|KB|B)/i);
      if (!m) return 0;
      const v = parseFloat(m[1]);
      const u = m[2].toUpperCase();
      if (u === 'GB') return v * 1024;
      if (u === 'MB') return v;
      if (u === 'KB') return v / 1024;
      return v / (1024 * 1024);
    };
    const blobsMB = parseSize(stats.statsBlobsSize);
    const chainMB = parseSize(stats.statsBlockchainSize);
    const totalMB = blobsMB + chainMB;
    const kWhPerMB = 0.0002;
    const gCO2PerKWh = 475;
    const networkCO2 = parseFloat((totalMB * kWhPerMB * gCO2PerKWh).toFixed(2));
    const inhabitants = stats.usersKPIs?.totalInhabitants || stats.inhabitants || 1;
    const userCO2 = parseFloat((networkCO2 / Math.max(1, inhabitants)).toFixed(2));
    const maxAnnualCO2 = 500;

    if (filter === 'MINE') {
      const pct = networkCO2 > 0 ? Math.min(100, (userCO2 / networkCO2) * 100) : 0;
      return div({ class: 'carbon-chart' },
        div({ class: 'carbon-bar-label' },
          span(i18n.statsCarbonUser || 'Your footprint'),
          span(`${userCO2} g CO₂`)
        ),
        div({ class: 'carbon-bar-track' },
          div({ class: `carbon-bar-fill carbon-bar-mine ${wClass(pct)}` })
        ),
        div({ class: 'carbon-bar-label' },
          span(i18n.statsCarbonNetwork || 'Network total'),
          span(`${networkCO2} g CO₂`)
        ),
        div({ class: 'carbon-bar-track' },
          div({ class: 'carbon-bar-fill carbon-bar-network stats-w-100' })
        ),
        p({ class: 'carbon-bar-note' }, strong(`${pct.toFixed(1)}%`), ` ${i18n.statsCarbonOfNetwork || 'of network total'}`),
        p({ class: 'carbon-bar-formula' }, 'Based on local data storage weight ', strong('(0.0002 kWh/MB × 475 g CO₂/kWh)'))
      );
    }
    if (filter === 'TOMBSTONE') {
      const tombCount = stats.tombstoneKPIs?.networkTombstoneCount || 0;
      const avgTombBytes = 500;
      const tombMB = (tombCount * avgTombBytes) / (1024 * 1024);
      const tombCO2 = parseFloat((tombMB * kWhPerMB * gCO2PerKWh).toFixed(4));
      const tombPct = networkCO2 > 0 ? Math.min(100, (tombCO2 / networkCO2) * 100) : 0;
      return div({ class: 'carbon-chart' },
        div({ class: 'carbon-bar-label' },
          span(i18n.statsCarbonTombstone || 'Tombstoning footprint'),
          span(`${tombCO2} g CO₂`)
        ),
        div({ class: 'carbon-bar-track' },
          div({ class: `carbon-bar-fill carbon-bar-mine ${wClass(tombPct)}` })
        ),
        div({ class: 'carbon-bar-label' },
          span(i18n.statsCarbonNetwork || 'Network total'),
          span(`${networkCO2} g CO₂`)
        ),
        div({ class: 'carbon-bar-track' },
          div({ class: 'carbon-bar-fill carbon-bar-network stats-w-100' })
        ),
        p({ class: 'carbon-bar-note' }, strong(`${tombPct.toFixed(1)}%`), ` ${i18n.statsCarbonOfNetwork || 'of network total'} (${tombCount} tombstones × ~${avgTombBytes} bytes)`),
        p({ class: 'carbon-bar-formula' }, 'Based on estimated tombstone message size ', strong('(0.0002 kWh/MB × 475 g CO₂/kWh)'))
      );
    }
    const pct = Math.min(100, (networkCO2 / maxAnnualCO2) * 100);
    return div({ class: 'carbon-chart' },
      div({ class: 'carbon-bar-label' },
        span(i18n.statsCarbonNetwork || 'Network footprint'),
        span(`${networkCO2} g CO₂`)
      ),
      div({ class: 'carbon-bar-track' },
        div({ class: `carbon-bar-fill carbon-bar-network ${wClass(pct)}` })
      ),
      div({ class: 'carbon-bar-label' },
        span(i18n.statsCarbonMaxAnnual || 'Annual max estimate'),
        span(`${maxAnnualCO2} g CO₂`)
      ),
      div({ class: 'carbon-bar-track' },
        div({ class: 'carbon-bar-fill carbon-bar-max stats-w-100' })
      ),
      p({ class: 'carbon-bar-note' }, strong(`${pct.toFixed(1)}%`), ` ${i18n.statsCarbonOfEstMax || 'of estimated max capacity'}`),
      p({ class: 'carbon-bar-formula' }, 'Based on local data storage weight ', strong('(0.0002 kWh/MB × 475 g CO₂/kWh)'))
    );
  })();

  const headerCard = div({ class: 'stats-card' },
    table({ class: 'block-info-table' },
      tr(td({ class: 'card-label' }, i18n.statsCreatedAt), td({ class: 'card-value' }, stats.createdAt)),
      tr(td({ class: 'card-label' }, 'ID'), td({ class: 'card-value' }, userLink(stats.id))),
      tr(td({ class: 'card-label' }, i18n.statsBlobsSize), td({ class: 'card-value' }, stats.statsBlobsSize)),
      tr(td({ class: 'card-label' }, i18n.statsBlockchainSize), td({ class: 'card-value' }, stats.statsBlockchainSize)),
      tr(td({ class: 'card-label' }, i18n.statsSize), td({ class: 'card-value' }, stats.folderSize))
    )
  );

  const totalInhabitants = stats.usersKPIs?.totalInhabitants || stats.inhabitants || 0;
  const networkKPIs = stats.networkKPIs || {};

  const topStrip = div({ class: 'stats-block' },
    kpiGrid(
      kpi(i18n.bankingUserEngagementScore, C(stats, 'karmaScore')),
      kpi(i18n.statsUsersTitle, totalInhabitants),
      kpi(i18n.statsTotalMsgs || 'Total messages', networkKPIs.totalMsgs || 0),
      kpi(i18n.statsLogsTitle || 'Logs', stats?.logsCount || 0),
      kpi(i18n.statsAITraining, C(stats, 'aiExchange') || 0),
      kpi(i18n.statsPUBs, stats.pubsCount || 0)
    )
  );

  const carbonCard = div({ class: 'stats-card' },
    h3({ class: 'stats-section-h' }, i18n.statsCarbonFootprintTitle || 'Carbon Footprint'),
    carbonChart
  );

  const bankingCard = div({ class: 'stats-card' },
    table({ class: 'block-info-table' },
      tr(td({ class: 'card-label' }, i18n.statsEcoWalletLabel), td({ class: 'card-value' }, a({ href: '/wallet', class: 'stats-link-break' }, stats?.banking?.myAddress || i18n.statsEcoWalletNotConfigured)))
    )
  );

  const networkBlock = div({ class: 'stats-block' },
    kpiGrid(
      filter === 'MINE'
        ? kpi(i18n.statsMyShare || 'Your share of the network', `${fmtNum(networkKPIs.myShare || 0)}%`)
        : null,
      kpi(i18n.statsAvgPerInhabitant || 'Avg per inhabitant', fmtNum(networkKPIs.avgMsgsPerInhabitant || 0)),
      kpi(i18n.statsMsgsPerDay || 'Messages/day (lifetime)', fmtNum(networkKPIs.networkMsgsPerDay || 0)),
      kpi(i18n.statsNetworkSpan || 'Network span', `${fmtNum(networkKPIs.networkSpanDays || 0)} d`),
      kpi(i18n.statsTombstoneRatioLabel || 'Tombstone ratio', `${fmtNum(stats.tombstoneKPIs?.ratio || 0)}%`)
    )
  );

  const activityBlock = (() => {
    const rows = Array.isArray(stats.activity?.daily7) ? stats.activity.daily7 : [];
    const max = Math.max(1, ...rows.map(r => Number(r.count) || 0));
    return div({ class: 'stats-block' },
      h2(i18n.statsActivity7d),
      rows.length
        ? ul({ class: 'stats-toplist' },
            ...rows.map(row => {
              const cnt = Number(row.count) || 0;
              const pct = (cnt / max) * 100;
              return li(
                span({ class: 'stats-toplist-name' }, row.day),
                div({ class: 'stats-bar-track' },
                  div({ class: `stats-bar-fill ${wClass(pct)}` })
                ),
                span({ class: 'stats-toplist-num' }, String(cnt))
              );
            })
          )
        : p({ class: 'no-content' }, i18n.no_results || 'No data'),
      div({ class: 'stats-activity-totals' },
        span(`${i18n.statsActivity7dTotal}: `, strong(String(stats.activity?.daily7Total || 0))),
        span(`${i18n.statsActivity30dTotal}: `, strong(String(stats.activity?.daily30Total || 0)))
      )
    );
  })();

  const topTypes = Array.isArray(stats.topTypes) ? stats.topTypes : [];
  const topTypesBlock = topTypes.length ? div({ class: 'stats-block' },
    h2(i18n.statsTopTypesTitle || 'Top Content Types'),
    renderTopList(
      topTypes,
      it => labels[it.type] || it.type,
      it => it.count,
      topTypes[0] ? topTypes[0].count : 1
    )
  ) : null;

  const topTags = Array.isArray(stats.topTags) ? stats.topTags : [];
  const topTagsBlock = topTags.length ? div({ class: 'stats-block' },
    h2(i18n.statsTopTagsTitle || 'Top Tags'),
    div({ class: 'stats-mb-16' },
      topTags.map(t => a({ class: 'stats-pill', href: `/search?query=%23${encodeURIComponent(t.tag)}` }, `#${t.tag} (${t.count})`))
    )
  ) : null;

  const marketTiles = [
    kpi(i18n.statsMarketTotal, stats.marketKPIs?.total || 0),
    kpi(i18n.statsMarketForSale, stats.marketKPIs?.forSale || 0),
    kpi(i18n.statsMarketReserved, stats.marketKPIs?.reserved || 0),
    kpi(i18n.statsMarketClosed, stats.marketKPIs?.closed || 0),
    kpi(i18n.statsMarketSold, stats.marketKPIs?.sold || 0)
  ].filter(Boolean);
  const marketBlock = marketTiles.length
    ? div({ class: 'stats-block' }, h2(i18n.statsMarketTitle), kpiGrid(...marketTiles))
    : null;

  const projectsTiles = [
    kpi(i18n.statsProjectsTotal, stats.projectsKPIs?.total || 0),
    kpi(i18n.statsProjectsActive, stats.projectsKPIs?.active || 0),
    kpi(i18n.statsProjectsCompleted, stats.projectsKPIs?.completed || 0),
    kpi(i18n.statsProjectsPaused, stats.projectsKPIs?.paused || 0),
    kpi(i18n.statsProjectsCancelled, stats.projectsKPIs?.cancelled || 0),
    kpi(i18n.statsProjectsGoalTotal, `${stats.projectsKPIs?.ecoGoalTotal || 0} ECO`),
    kpi(i18n.statsProjectsPledgedTotal, `${stats.projectsKPIs?.ecoPledgedTotal || 0} ECO`)
  ].filter(Boolean);
  const projectsBlock = projectsTiles.length
    ? div({ class: 'stats-block' }, h2(i18n.statsProjectsTitle), kpiGrid(...projectsTiles))
    : null;

  const allTribesPublic = Array.isArray(stats.allTribesPublic) ? stats.allTribesPublic : [];
  const memberTribesDetailed = Array.isArray(stats.memberTribesDetailed) ? stats.memberTribesDetailed : [];
  const myPrivateTribesDetailed = Array.isArray(stats.myPrivateTribesDetailed) ? stats.myPrivateTribesDetailed : [];

  const buildContentRows = () => {
    const rows = [];
    types.filter(t => t !== 'karmaScore' && t !== 'shopProduct' && t !== 'padEntry' && t !== 'chatMessage' && t !== 'calendarDate' && t !== 'calendarNote').forEach(t => {
      const cnt = C(stats, t);
      if (cnt <= 0) return;
      rows.push([labels[t], cnt]);
      if (t === 'shop') rows.push([labels.shopProduct, C(stats, 'shopProduct')]);
      else if (t === 'pad') rows.push([labels.padEntry, C(stats, 'padEntry')]);
      else if (t === 'chat') rows.push([labels.chatMessage, C(stats, 'chatMessage')]);
      else if (t === 'calendar') {
        rows.push([labels.calendarDate, C(stats, 'calendarDate')]);
        rows.push([labels.calendarNote, C(stats, 'calendarNote')]);
      } else if (t === 'tribe') {
        rows.push([i18n.statsPublic, stats.tribePublicCount || 0]);
        rows.push([i18n.statsPrivate, stats.tribePrivateCount || 0]);
      }
    });
    return rows;
  };
  const buildContentTable = () => {
    const rows = buildContentRows().slice().sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
    if (!rows.length) return p({ class: 'no-content' }, i18n.no_results || 'No data');
    return table({ class: 'tag-table' },
      thead(tr(
        th(i18n.statsContentTypeColumn || 'Type'),
        th(i18n.statsContentCountColumn || 'Count')
      )),
      tbody(...rows.map(([label, count]) => tr(td(label), td(String(count)))))
    );
  };

  const buildOpinionTiles = () =>
    types.map(t => O(stats, t) > 0 ? kpi(labels[t], O(stats, t)) : null).filter(Boolean);

  const tribeListBlock = (label, list) => div({ class: 'stats-block' },
    h2(`${label}: ${list.length}`),
    list.length
      ? table({ class: 'stats-table-mt8' },
          ...list.map(t => tr(td(a({ href: `/tribe/${encodeURIComponent(t.id)}`, class: 'tribe-link' }, t.name))))
        )
      : p({ class: 'no-content' }, i18n.no_results || 'No data')
  );

  const allMode = filter === 'ALL'
    ? div({ class: 'stats-container' }, [
        networkBlock,
        activityBlock,
        totalOpinions > 0
          ? div({ class: 'stats-block' },
              h2(`${i18n.statsNetworkOpinions}: ${totalOpinions}`),
              kpiGrid(...buildOpinionTiles())
            )
          : null,
        totalContent > 0
          ? div({ class: 'stats-block' },
              h2(`${i18n.statsNetworkContent}: ${totalContent}`),
              buildContentTable()
            )
          : null
      ])
    : null;

  const mineMode = filter === 'MINE'
    ? div({ class: 'stats-container' }, [
        networkBlock,
        activityBlock,
        totalOpinions > 0
          ? div({ class: 'stats-block' },
              h2(`${i18n.statsYourOpinions}: ${totalOpinions}`),
              kpiGrid(...buildOpinionTiles())
            )
          : null,
        totalContent > 0
          ? div({ class: 'stats-block' },
              h2(`${i18n.statsYourContent}: ${totalContent}`),
              buildContentTable()
            )
          : null
      ])
    : null;

  const tombMode = filter === 'TOMBSTONE'
    ? div({ class: 'stats-container' }, [
        div({ class: 'stats-block' },
          kpiGrid(
            kpi(i18n.TOMBSTONEButton, stats.userTombstoneCount || 0),
            kpi(i18n.statsTombstoneRatio, `${(stats.tombstoneKPIs?.ratio || 0).toFixed(2)}%`)
          )
        )
      ])
    : null;

  return template(
    title,
    section(
      div({ class: 'tags-header' },
        h2(title),
        p(description)
      ),
      div({ class: 'mode-buttons stats-mode-row' },
        modes.map(m =>
          form({ method: 'GET', action: '/stats' },
            input({ type: 'hidden', name: 'filter', value: m }),
            button({ type: 'submit', class: filter === m ? 'filter-btn active' : 'filter-btn' }, i18n[m + 'Button'])
          )
        )
      ),
      section(
        topStrip,
        headerCard,
        bankingCard,
        allMode,
        mineMode,
        tombMode
      )
    )
  );
};
