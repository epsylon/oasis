const { ok } = require('../../helpers/assert');

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
