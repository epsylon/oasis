const { ok, eq, notOk } = require('../../helpers/assert');

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


describe('views: the shared text renderer', (t) => {
  const { renderStyledText, renderStyledHtml, renderTextPreview } = require('../../../src/backend/renderStyledText');
  const html = (text, opts) => renderStyledText(text, opts).map(n => (n && n.outerHTML) || String(n)).join('');

  t('each marker becomes its own element', () => {
    ok(html('a **b** c').includes('<strong>b</strong>'), 'bold');
    ok(html('a *b* c').includes('<em>b</em>'), 'italic');
    ok(html('a __b__ c').includes('<u>b</u>'), 'underline');
    ok(html('a ~~b~~ c').includes('<s>b</s>'), 'strikethrough');
    ok(html('a `b` c').includes('rt-code'), 'inline code');
    ok(html('### T ###').includes('rt-header-3'), 'closed header');
    ok(html('# T').includes('rt-header-1'), 'spaced header');
    ok(html('- one').includes('rt-item'), 'bullet list');
    ok(html('1. one').includes('rt-item-number'), 'numbered list');
    ok(html('> said').includes('rt-quote'), 'quote');
    ok(html('---\n').includes('rt-rule'), 'rule');
    ok(html('```\nx\n```').includes('rt-code-block'), 'code block');
  });

  t('markers nest and only the outer one wins', () => {
    const out = html('### a **b** ###');
    ok(out.includes('rt-header-3') && out.includes('<strong>b</strong>'), 'a header keeps its inner formatting');
    ok(!html('**bold**').includes('<em>'), 'bold is not read as two italics');
    ok(html('#tag').includes('tag-link'), 'a hashtag is not read as a header');
  });

  t('references keep working alongside the formatting', () => {
    ok(html('see https://example.org').includes('href="https://example.org"'), 'links');
    ok(html('hi @' + 'a'.repeat(43) + '=.ed25519').includes('/author/'), 'mentions');
    ok(html('read [[A page]]').includes('/wiki/a-page'), 'wikilinks');
    ok(html('![x](&' + 'b'.repeat(43) + '=.sha256)').includes('<img'), 'blobs');
    ok(html('write to a@b.org').includes('mailto:'), 'emails');
  });

  t('labelled links point where they say and refuse anything but http and internal paths', () => {
    ok(html('[a label](https://example.org)').includes('href="https://example.org"'), 'external link');
    ok(html('[my profile](/profile)').includes('href="/profile"'), 'internal path');
    ok(html('[a label](https://example.org)').includes('target="_blank"'), 'an external link opens beside Oasis, not over it');
    ok(html('[a label](https://example.org)').includes('rel="noopener noreferrer"'), 'and the page it opens cannot reach back');
    notOk(html('[my profile](/profile)').includes('target='), 'moving inside Oasis stays in the same tab');
    notOk(html('http://localhost:3000/wiki').includes('target='), 'a link back to this Oasis is not a foreign site');
    notOk(html('[here](http://127.0.0.1:3000/peers)').includes('target='), 'nor is one written with the loopback address');
    ok(html('http://localhost.evil.example/x').includes('target="_blank"'), 'a domain that merely starts with localhost is still foreign');
    eq(html('[x](javascript:alert(1))'), '[x](javascript:alert(1))', 'a script target is left as plain text');
    ok(html('![pic](https://x.org/a.png)').includes('<a href="https://x.org/a.png"'), 'a remote image becomes a link, never a request to a third party');
    ok(html('![x](&' + 'b'.repeat(43) + '=.sha256)').includes('<img'), 'a blob image is still an image');
  });

  t('text written by others is never rendered as markup', () => {
    const attack = '<img src=x onerror=alert(1)>';
    for (const wrapper of ['%s', '**%s**', '### %s ###', '- %s', '> %s', '`%s`', '```%s```']) {
      const out = renderStyledHtml(wrapper.replace('%s', attack));
      ok(!out.includes('<img src=x'), `escaped inside ${wrapper}`);
      ok(out.includes('&lt;img'), `kept as text inside ${wrapper}`);
    }
    ok(!renderStyledHtml('[[a" onmouseover="x]]').includes('onmouseover="x"'), 'attributes are escaped too');
  });

  t('no text a peer can publish crashes or stalls the renderer', () => {
    for (const [name, input] of [
      ['nested quotes', '>'.repeat(2000)],
      ['nested bullets', '- '.repeat(1500)],
      ['a wall of hashes', '#'.repeat(20000)],
      ['numbered runs', '1. '.repeat(3000)],
      ['open brackets', '['.repeat(20000)],
      ['stars', '*'.repeat(20000)]
    ]) {
      const started = Date.now();
      let threw = null;
      try { renderStyledHtml(input); } catch (e) { threw = e.message; }
      eq(threw, null, `${name} crashed the renderer: ${threw}`);
      ok(Date.now() - started < 500, `${name} took too long to render`);
    }
  });

  t('emphasis nests both ways and survives real prose', () => {
    eq(html('*italic with **bold** inside*'), '<em>italic with <strong>bold</strong> inside</em>');
    eq(html('**bold with *italic* inside**'), '<strong>bold with <em>italic</em> inside</strong>');
    eq(html('2 * 3 * 4'), '2 * 3 * 4');
    eq(html('file__name__here'), 'file__name__here');
    eq(html('\\*not italic\\*'), '*not italic*');
  });

  t('text typed in a browser form renders the same as text with plain newlines', () => {
    const withCrlf = html('a\r\n```\r\ncode\r\n```\r\nb');
    const withLf = html('a\n```\ncode\n```\nb');
    ok(withCrlf.includes('rt-code-block'), 'a code block written in a form is still a code block');
    eq(withCrlf.replace(/\r/g, ''), withLf);
    eq(html('- one\r\n'), '<span class="rt-item rt-item-1">one</span>');
  });

  t('links stop where the sentence does and never steal the tab', () => {
    eq(html('Visit https://example.org. Thanks'), 'Visit <a href="https://example.org" target="_blank" rel="noopener noreferrer">https://example.org</a>. Thanks');
    eq(html('(https://example.org)'), '(<a href="https://example.org" target="_blank" rel="noopener noreferrer">https://example.org</a>)');
  });

  t('a hashtag keeps accents and a wikilink cannot swallow the page', () => {
    ok(html('#español').includes('>#español<'), 'the whole word is the tag');
    notOk(html('intro [[page one\nand more]] tail').includes('wiki-link'), 'an unclosed wikilink stops at the line');
  });

  t('an indented list keeps its levels', () => {
    const out = html('- one\n  - two\n    - three\n- back');
    ok(out.includes('rt-item-1">one'), 'the first level');
    ok(out.includes('rt-item-2">two'), 'the second level');
    ok(out.includes('rt-item-3">three'), 'the third level');
    ok(out.includes('rt-item-1">back'), 'and back out again');
  });

  t('the public hub keeps the formatting but never links into the private app', () => {
    const hub = { blobPrefix: '/c/blob/', internalLinks: false };
    const out = renderStyledHtml('**bold** [[Page]] #tag @' + 'a'.repeat(43) + '=.ed25519 https://example.org', hub);
    ok(out.includes('<strong>bold</strong>'), 'formatting still applies');
    notOk(out.includes('/wiki/'), 'no wiki links');
    notOk(out.includes('/author/'), 'no inhabitant links');
    notOk(out.includes('/search?'), 'no search links');
    ok(out.includes('href="https://example.org"'), 'external links stay');
    ok(renderStyledHtml('![i](&' + 'b'.repeat(43) + '=.sha256)', hub).includes('/c/blob/'), 'media is served from the public path');
  });

  t('a link written by someone else can never jump to another site pretending to be internal', () => {
    eq(html('[Click](//evil.example/login)'), '[Click](//evil.example/login)', 'a protocol-relative target is not a link at all');
    eq(html('[Click](/\\evil.example)'), '[Click](/\\evil.example)', 'nor a backslash disguised as one');
    ok(html('[Profile](/profile)').includes('href="/profile"'), 'a real internal path still links');
  });

  t('a code block keeps its first line unless that line names the language', () => {
    eq(html('```\nhello\nworld```'), '<span class="rt-code-block">hello\nworld</span>');
    eq(html('```js\nconst x=1;\n```'), '<span class="rt-code-block">const x=1;</span>');
    eq(html('```code```'), '<span class="rt-code-block">code</span>');
  });

  t('stripping markers stays cheap on hostile text', () => {
    for (const input of ['['.repeat(20000), '[a]('.repeat(5000), '!['.repeat(10000)]) {
      const started = Date.now();
      renderTextPreview(input);
      ok(Date.now() - started < 250, `stripping took too long for ${input.slice(0, 6)}…`);
    }
  });

  t('previews drop the markers instead of showing them', () => {
    const preview = renderTextPreview('### T ###\n- one\n**b** and `c`');
    ok(!/[*`#]/.test(preview), `markers left in the preview: ${preview}`);
    ok(preview.includes('one') && preview.includes('b'), 'the words survive');
  });
});
