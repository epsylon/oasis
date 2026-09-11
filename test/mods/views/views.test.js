const { ok, eq } = require('../../helpers/assert');

const REGISTRY = [
  ['activity_view', 'activityView', () => [[], 'all', '@viewer.ed25519', '', {}]],
  ['agenda_view', 'agendaView', () => [{ items: [], counts: {} }, 'all', '']],
  ['audio_view', 'audioView', () => [[], 'all', null, {}]],
  ['blog_view', 'blogView', () => [[], 'ALL', {}]],
  ['bookmark_view', 'bookmarkView', () => [[], 'all', null, {}]],
  ['calendars_view', 'calendarsView', () => [[], 'all', null, {}]],
  ['chats_view', 'chatsView', () => [[], 'all', null, {}]],
  ['data_view', 'dataView', () => [{ filter: 'ALL', matches: [], hasProfile: true }]],
  ['document_view', 'documentView', () => [[], 'all', null, {}]],
  ['event_view', 'eventView', () => [[], 'all', null, '/events', {}]],
  ['favorites_view', 'favoritesView', () => [[], 'all', {}, '']],
  ['fediverse_view', 'fediverseOverviewView', () => [{}]],
  ['fediverse_view', 'telegramDialogsView', () => [{ account: { network: 'telegram', username: 'u', displayName: 'U', phone: '', avatar: '' }, stats: null, dialogs: [] }]],
  ['feed_view', 'feedView', () => [[], 'ALL']],
  ['forum_view', 'forumView', () => [[], 'all', {}]],
  ['games_view', 'gamesView', () => ['all', null, '']],
  ['housing_view', 'housingView', () => [[], 'ALL', {}]],
  ['image_view', 'imageView', () => [[], 'all', null, {}]],
  ['industry_view', 'industryView', () => [[], 'ALL', {}]],
  ['inhabitants_view', 'inhabitantsView', () => [[], 'ALL', '', '@viewer.ed25519', false]],
  ['jobs_view', 'jobsView', () => [[], 'ALL', {}]],
  ['logs_view', 'logsView', () => [[], 'today', 'list', {}]],
  ['maps_view', 'mapsView', () => [[], 'all', null, {}]],
  ['market_view', 'marketView', () => [[], 'all', null, {}]],
  ['mentions_view', 'mentionsView', () => [[], 'ALL', {}]],
  ['pads_view', 'padsView', () => [[], 'all', null, {}]],
  ['polls_view', 'pollsView', () => [[], 'ALL', {}]],
  ['projects_view', 'projectsView', () => [[], 'ALL', null, {}]],
  ['report_view', 'reportView', () => [[], 'all', null, null, {}]],
  ['school_view', 'schoolView', () => [[], 'all', null, {}]],
  ['shops_view', 'shopsView', () => [[], 'all', null, {}]],
  ['tags_view', 'tagsView', () => [[], 'all', '']],
  ['task_view', 'taskView', () => [[], 'all', null, '/tasks', {}]],
  ['torrents_view', 'torrentsView', () => [[], 'all', null, {}]],
  ['transfer_view', 'transferView', () => [[], 'all', null, {}]],
  ['tribes_view', 'tribesView', () => [[], 'all', null, {}, []]],
  ['video_view', 'videoView', () => [[], 'all', null, {}]],
  ['vote_view', 'voteView', () => [[], 'all', null, [], 'all', {}]],
  ['wiki_view', 'wikiView', () => [[], 'all', {}]],
  ['emergencies_view', 'emergenciesView', () => [[], 'ALL', {}]],
  ['mailing_view', 'mailingView', () => [[], 'ALL', {}]],
  ['logistics_view', 'logisticsView', () => [[], 'ALL', {}]],
  ['podcasts_view', 'podcastsView', () => [[], 'ALL', {}]],
  ['campaigns_view', 'campaignsView', () => [[], 'ALL', {}]],
  ['backup_view', 'backupView', () => [{ reminder: { lastAt: null, reminderDays: 30, overdue: true, daysSince: null }, estimate: { messages: 0, blobs: 0, blobsReferenced: 0, bytes: 0, messageBytes: 0, blobBytes: 0 }, options: { scope: 'all', withBlobs: true, modules: [], sinceTs: 0 }, modules: ['feed', 'media'], restored: null }]],
  ['backup_view', 'recoveryKitView', () => [{ secret: '{"id":"@x.ed25519"}', id: '@x.ed25519', createdAt: new Date().toISOString() }]],
];

describe('views: every module view boots from a cold start', (t) => {
  for (const [file, exportName, argsOf] of REGISTRY) {
    t(`${file}.${exportName} renders with an empty network`, async () => {
      const mod = require(`../../../src/views/${file}`);
      ok(typeof mod[exportName] === 'function', `${exportName} is exported`);
      const html = String(await mod[exportName](...argsOf()));
      ok(html.length > 200, `${exportName} returns a page`);
      ok(html.includes('</html>') || html.includes('<main') || html.includes('main-column'),
        `${exportName} returns the full layout`);
    });
  }
});


const filterChips = (html) => {
  const out = [];
  for (const m of html.matchAll(/<button[^>]*name="filter" value="([^"]+)"[^>]*class="filter-btn[^"]*"/g)) out.push(m[1].toLowerCase());
  for (const m of html.matchAll(/<input[^>]*name="filter"[^>]*value="([^"]+)"[^>]*>\s*<button[^>]*class="filter-btn[^"]*"/g)) out.push(m[1].toLowerCase());
  return out;
};


describe('views: an empty module offers no content filters, not even on its create screen', (t) => {
  const CREATE_SCREENS = [
    ['audio_view', 'audioView', () => [[], 'create', null, {}]],
    ['bookmark_view', 'bookmarkView', () => [[], 'create', null, {}]],
    ['calendars_view', 'calendarsView', () => [[], 'create', null, {}]],
    ['chats_view', 'chatsView', () => [[], 'create', null, {}]],
    ['document_view', 'documentView', () => [[], 'create', null, {}]],
    ['event_view', 'eventView', () => [[], 'create', null, '/events', {}]],
    ['forum_view', 'forumView', () => [[], 'create', {}]],
    ['housing_view', 'housingView', () => [[], 'CREATE', {}]],
    ['image_view', 'imageView', () => [[], 'create', null, {}]],
    ['industry_view', 'industryView', () => [[], 'CREATE', {}]],
    ['jobs_view', 'jobsView', () => [[], 'CREATE', {}]],
    ['maps_view', 'mapsView', () => [[], 'create', null, {}]],
    ['market_view', 'marketView', () => [[], 'create', null, {}]],
    ['pads_view', 'padsView', () => [[], 'create', null, {}]],
    ['polls_view', 'pollsView', () => [[], 'CREATE', {}]],
    ['projects_view', 'projectsView', () => [[], 'CREATE', null, {}]],
    ['report_view', 'reportView', () => [[], 'create', null, null, {}]],
    ['school_view', 'schoolView', () => [[], 'create', null, {}]],
    ['shops_view', 'shopsView', () => [[], 'create', null, {}]],
    ['task_view', 'taskView', () => [[], 'create', null, '/tasks', {}]],
    ['torrents_view', 'torrentsView', () => [[], 'create', null, {}]],
    ['transfer_view', 'transferView', () => [[], 'create', null, {}]],
    ['tribes_view', 'tribesView', () => [[], 'create', null, {}, []]],
    ['video_view', 'videoView', () => [[], 'create', null, {}]],
    ['vote_view', 'voteView', () => [[], 'create', null, [], 'create', {}]],
    ['wiki_view', 'wikiView', () => [[], 'create', {}]],
    ['emergencies_view', 'emergenciesView', () => [[], 'CREATE', {}]],
    ['mailing_view', 'mailingView', () => [[], 'CREATE', {}]],
    ['logistics_view', 'logisticsView', () => [[], 'CREATE', {}]],
    ['podcasts_view', 'podcastsView', () => [[], 'CREATE', {}]],
    ['campaigns_view', 'campaignsView', () => [[], 'CREATE', {}]],
    ['blog_view', 'blogView', () => [[], 'CREATE', {}]],
    ['feed_view', 'feedCreateView', () => [{}]]
  ];
  for (const [file, exportName, argsOf] of CREATE_SCREENS) {
    t(`${file}: no filter chips on the create screen of an empty module`, async () => {
      const mod = require(`../../../src/views/${file}`);
      if (typeof mod[exportName] !== 'function') return;
      const html = String(await mod[exportName](...argsOf()));
      const chips = filterChips(html).filter(v => !['create', 'edit', 'rules', 'all'].includes(v));
      eq(chips.length, 0, `content chips offered with nothing to filter: ${chips.join(', ')}`);
      ok(filterChips(html).includes('all'), 'the ALL chip stays so you can go back');
    });
  }
});

describe('views: a detail screen offers no content filters when the module has nothing to filter', (t) => {
  const iso = new Date().toISOString();
  const me = '@a.ed25519';
  const none = { mine: false, recent: false, favorites: false, open: false, closed: false, applied: false, products: false, prices: false, purchases: false };
  const media = (extra = {}) => ({ key: '%m.sha256', rootId: '%m.sha256', id: '%m.sha256', title: 'One item', description: '', author: me, url: '&b.sha256', mimeType: 'audio/mpeg', opinions: {}, opinions_inhabitants: [], tags: [], createdAt: iso, ...extra });
  const DETAIL_SCREENS = [
    ['audio_view', 'singleAudioView', () => [media(), 'all', [], { censusList: [] }]],
    ['video_view', 'singleVideoView', () => [media({ mimeType: 'video/mp4' }), 'all', [], { censusList: [] }]],
    ['image_view', 'singleImageView', () => [media({ mimeType: 'image/png' }), 'all', [], { censusList: [] }]],
    ['document_view', 'singleDocumentView', () => [media({ mimeType: 'application/pdf' }), 'all', [], { censusList: [] }]],
    ['torrents_view', 'singleTorrentView', () => [media({ url: '&t.sha256', size: 10 }), 'all', [], { censusList: [] }]],
    ['bookmark_view', 'singleBookmarkView', () => [media({ url: 'https://example.org', id: '%bk.sha256' }), 'all', [], { censusList: [] }]],
    ['event_view', 'singleEventView', () => [{ id: '%e.sha256', title: 'Party', organizer: me, author: me, date: iso, isPublic: 'public', attendees: [], tags: [], createdAt: iso, opinions: {} }, 'all', [], { censusList: [] }]],
    ['task_view', 'singleTaskView', () => [{ id: '%t.sha256', title: 'Task', author: me, status: 'OPEN', priority: 'LOW', assignees: [], startTime: iso, endTime: iso, isPublic: 'PUBLIC', tags: [], createdAt: iso, opinions: {} }, 'all', [], { censusList: [] }]],
    ['market_view', 'singleMarketView', () => [{ id: '%mk.sha256', title: 'Chair', seller: me, author: me, status: 'FOR SALE', item_type: 'exchange', item_status: 'NEW', price: '1', createdAt: iso, tags: [], opinions: {} }, 'all', [], { censusList: [] }]],
    ['report_view', 'singleReportView', () => [{ id: '%r.sha256', title: 'Bug', author: me, category: 'BUGS', status: 'OPEN', severity: 'LOW', createdAt: iso, confirmations: [], tags: [], opinions: {} }, 'all', [], { censusList: [] }]],
    ['transfer_view', 'singleTransferView', () => [{ id: '%x.sha256', from: me, to: '@b.ed25519', amount: '1', status: 'UNCONFIRMED', createdAt: iso, tags: [], confirmedBy: [], concept: 'x' }, 'all', { censusList: [] }]],
    ['feed_view', 'singleFeedView', () => [{ key: '%f.sha256', value: { author: me, timestamp: Date.now(), content: { type: 'feed', text: 'hi', createdAt: iso } } }, [], { censusList: [] }]],
    ['school_view', 'singleCourseView', () => [{ id: '%c.sha256', rootId: '%c.sha256', title: 'Course', author: me, students: [], status: 'ONGOING', visibility: 'PUBLIC', createdAt: iso, tags: [] }, [], [], { modesAvail: none }]],
    ['pads_view', 'singlePadView', () => [{ key: '%p.sha256', rootId: '%p.sha256', title: 'Pad', author: me, status: 'OPEN', members: [me], invites: [], tags: [], createdAt: iso }, [], { modesAvail: none }]],
    ['calendars_view', 'singleCalendarView', () => [{ key: '%cal.sha256', rootId: '%cal.sha256', title: 'Cal', author: me, status: 'OPEN', members: [me], participants: [me], invites: [], tags: [], dates: [], createdAt: iso }, [], {}, { modesAvail: none }]],
    ['chats_view', 'singleChatView', () => [{ key: '%ch.sha256', rootId: '%ch.sha256', title: 'Chat', author: me, status: 'OPEN', members: [me], invites: [], tags: [], createdAt: iso, category: 'general' }, 'all', [], { modesAvail: none }]],
    ['shops_view', 'singleShopView', () => [{ key: '%sh.sha256', rootId: '%sh.sha256', title: 'Shop', author: me, visibility: 'OPEN', createdAt: iso, tags: [] }, 'all', [], [], { modesAvail: none }]],
    ['campaigns_view', 'singleCampaignView', () => [{ id: '%cp.sha256', rootId: '%cp.sha256', tipId: '%cp.sha256', title: 'Save the park', text: '', category: 'ENVIRONMENT', goal: 10, deadline: '', deadlineTs: 0, expired: false, tags: [], mapUrl: '', status: 'OPEN', achieved: false, closed: false, proposalId: '', author: me, createdAt: iso, updatedAt: iso, ts: Date.now(), signatures: [], signatureCount: 0, signers: [], progress: 0, updates: [], milestones: [], lastActivityTs: Date.now(), isOwner: true, signed: false, canSign: false, canElevate: false }, { comments: [], censusList: [] }]],
    ['podcasts_view', 'singleChannelView', () => [{ id: '%pc.sha256', rootId: '%pc.sha256', tipId: '%pc.sha256', title: 'Night talks', description: '', category: 'TALK', cover: null, tags: [], author: me, createdAt: iso, updatedAt: iso, ts: Date.now(), episodes: [], episodeCount: 0, playCount: 0, opinionCount: 0, lastEpisodeTs: 0, lastActivityTs: Date.now() }, { comments: [], censusList: [] }]],
    ['podcasts_view', 'singleEpisodeView', () => [{ id: '%pe.sha256', rootId: '%pe.sha256', tipId: '%pe.sha256', channelId: '%pc.sha256', number: 1, title: 'Pilot', description: '', media: { kind: 'audio', name: 'a.mp3', blobId: '&a.sha256' }, tags: [], author: me, createdAt: iso, updatedAt: iso, ts: Date.now(), publishedTs: Date.now(), opinions: {}, opinions_inhabitants: [], opinionCount: 0, listeners: [], playCount: 0, channel: { id: '%pc.sha256', title: 'Night talks', author: me, episodes: [] } }, { comments: [], censusList: [] }]],
    ['logistics_view', 'singleLogisticsView', () => [{ id: '%lg.sha256', rootId: '%lg.sha256', tipId: '%lg.sha256', kind: 'TRIP', mode: 'OFFER', title: 'Ride', description: '', origin: 'A', destination: 'B', mapUrl: '', date: iso, dateTs: Date.now(), recurrence: 'NONE', seats: 2, seatsTaken: 0, size: '', weight: '', priceType: 'FREE', price: 0, orderRef: '', tags: [], status: 'OPEN', closed: false, author: me, createdAt: iso, updatedAt: iso, ts: Date.now(), ratings: [], ratingCount: 0, ratingAvg: 0, bookings: [], bookingCount: 0, confirmedCount: 0, seatsTaken: 0, seatsLeft: 2, myBooking: null, isOwner: true, participated: true, canBook: false, canRate: false, myRating: null, lastActivityTs: Date.now() }, { comments: [], censusList: [], zones: [] }]],
    ['mailing_view', 'singleMailingView', () => [{ id: '%ml.sha256', rootId: '%ml.sha256', tipId: '%ml.sha256', title: 'Neighbours', description: 'Street news', listType: 'OPEN', closed: false, status: 'ACTIVE', tags: [], members: [], author: me, createdAt: iso, updatedAt: iso, ts: Date.now(), subscribers: [], participants: [me], participantCount: 1, isMember: true, isOwner: true, canWrite: true, messageCount: 0, threadCount: 0, lastActivityTs: Date.now(), history: [] }, { censusList: [] }]],
    ['emergencies_view', 'singleEmergencyView', () => [{ id: '%al.sha256', rootId: '%al.sha256', tipId: '%al.sha256', title: 'Water cut', text: 'north', category: 'INFRASTRUCTURE', mapUrl: '', tags: [], author: me, createdAt: iso, updatedAt: iso, ts: Date.now(), lastActivityTs: Date.now(), expiresAt: iso, expired: false, status: 'ACTIVE', resolved: false, confirmations: [], confirmationCount: 0, severity: 'UNVERIFIED', updates: [] }, { comments: [], censusList: [] }]],
    ['wiki_view', 'wikiPageView', () => [{ id: '%w.sha256', rootId: '%w.sha256', tipId: '%w.sha256', slug: 'w', title: 'W', body: 'b', tags: [], aliases: [], editPolicy: 'open', tribeId: null, author: me, lastAuthor: me, createdAt: iso, updatedAt: iso, ts: Date.now(), versionCount: 1, versions: [], links: [], backlinks: [], missingLinks: [], canEdit: true, isOwner: true }, { comments: [] }]]
  ];
  for (const [file, exportName, argsOf] of DETAIL_SCREENS) {
    t(`${file}.${exportName}: empty census → no content chips`, async () => {
      const mod = require(`../../../src/views/${file}`);
      if (typeof mod[exportName] !== 'function') return;
      const html = String(await mod[exportName](...argsOf()));
      const chips = filterChips(html).filter(v => !['create', 'edit', 'rules', 'all', 'top'].includes(v));
      eq(chips.length, 0, `content chips offered with an empty census: ${chips.join(', ')}`);
    });
  }
});
