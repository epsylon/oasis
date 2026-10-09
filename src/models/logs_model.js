const pull = require('../server/node_modules/pull-stream');
const util = require('util');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');

const logLimit = getConfig().ssbLogStream?.limit || 1000;


const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

const FILTER_WINDOWS = {
  today: DAY_MS,
  week: WEEK_MS,
  month: MONTH_MS,
  year: YEAR_MS,
  always: null
};

const ACTION_TYPES = new Set([
  'post', 'about', 'contact', 'feed', 'bookmark', 'image', 'audio', 'video',
  'document', 'torrent', 'file', 'event', 'task', 'taskAssign',
  'votes', 'vote', 'report', 'tribe', 'chat', 'chatMessage', 'pad', 'padEntry', 'room', 'roomMember',
  'forum', 'market', 'job', 'project', 'industry', 'industryBuild', 'pixelia', 'map', 'mapMarker',
  'shop', 'shopProduct', 'curriculum', 'gameScore',
  'calendar', 'calendarDate', 'calendarNote',
  'transfer', 'bankClaim', 'ubiClaim',
  'parliamentCandidature', 'parliamentProposal', 'parliamentLaw',
  'parliamentTerm', 'parliamentRevocation',
  'courtsCase', 'courtsEvidence', 'courtsAnswer', 'courtsVerdict',
  'courtsNomination', 'courtsNominationVote',
  'courtsSettlementProposal', 'courtsSettlementAccepted',
  'tribeParliamentCandidature', 'tribeParliamentRule',
  'wikiPage', 'emergency', 'emergencyConfirm', 'emergencyUpdate', 'mailingList',
  'logisticsRoute', 'logisticsRating', 'logisticsOpinion',
  'podcast', 'podcastEpisode', 'podcastOpinion', 'podcastPlay',
  'campaign', 'campaignSignature', 'campaignUpdate', 'campaignOpinion',
  'audioOpinion', 'blogOpinion', 'bookmarkOpinion', 'documentOpinion', 'eventOpinion', 'feedOpinion',
  'fileOpinion', 'imageOpinion', 'videoOpinion', 'torrentOpinion', 'housingOpinion', 'industryOpinion',
  'marketOpinion', 'projectOpinion', 'reportOpinion', 'schoolOpinion', 'shopOpinion', 'taskOpinion',
  'transferOpinion', 'votesOpinion', 'pollOpinion',
  'calendarParticipant', 'chatMember', 'chatPin', 'chatReaction', 'padMember', 'mapMember',
  'courtsJudge', 'courtsMediators', 'courtsSupport', 'courtsVisibility', 'courtsVoteLink',
  'eventAttend', 'feed-action', 'spread', 'subscription', 'job_sub',
  'housing', 'housingRequest',
  'industryAllocation', 'industryApply', 'industryBlueprint', 'industryBuildStatus', 'industryBuildUpdate',
  'industryContribution', 'industryMember', 'industryVote',
  'larpHousePost', 'larpJoinHouse', 'larpLeaveLarp', 'larpTestAttempt',
  'marketBid', 'marketPurchase', 'shopPurchase',
  'parliamentCandidatureVote', 'tribeParliamentTerm',
  'poll', 'pollVote', 'pollClose', 'votesVote',
  'projectClaim', 'projectFollow', 'projectPledge', 'projectPledgeConfirm',
  'reportConfirm', 'transferConfirm', 'ubiRefuse',
  'schoolCourse', 'schoolEnroll', 'schoolLesson', 'schoolLessonMedia', 'schoolExam', 'schoolExamQuestion',
  'schoolExamResult', 'schoolProgress', 'schoolCertificate', 'schoolCommentHide'
]);

const ACTION_PHRASES = {
  post: 'published a post',
  about: 'updated profile information',
  contact: 'followed or unfollowed someone',
  feed: 'shared content in the feed',
  bookmark: 'bookmarked a resource',
  image: 'uploaded an image',
  audio: 'uploaded an audio track',
  video: 'uploaded a video',
  document: 'uploaded a document',
  torrent: 'shared a torrent',
  file: 'shared a file',
  event: 'created an event',
  task: 'created a task',
  taskAssign: 'updated a task assignment',
  votes: 'participated in a vote',
  vote: 'cast a vote',
  report: 'submitted a report',
  tribe: 'interacted with a tribe',
  chat: 'opened a chat room',
  chatMessage: 'sent a chat message',
  pad: 'worked on a collaborative pad',
  padEntry: 'edited a pad entry',
  room: 'opened a room',
  roomMember: 'joined a room',
  market: 'posted in the market',
  forum: 'posted in the forum',
  job: 'posted a job opportunity',
  project: 'advanced a project',
  industry: 'founded a network-owned facility',
  industryBuild: 'proposed a production build',
  pixelia: 'placed a pixel in pixelia',
  map: 'contributed to a map',
  mapMarker: 'placed a marker on a map',
  shop: 'updated a shop',
  shopProduct: 'managed a shop product',
  curriculum: 'edited the curriculum',
  gameScore: 'logged a game score',
  calendar: 'managed a calendar',
  calendarDate: 'added a calendar date',
  calendarNote: 'added a calendar note',
  transfer: 'sent or confirmed a transfer',
  bankClaim: 'completed a banking claim',
  ubiClaim: 'claimed the UBI',
  parliamentCandidature: 'published a parliamentary candidature',
  parliamentProposal: 'published a parliamentary proposal',
  parliamentLaw: 'participated in a parliamentary law',
  parliamentTerm: 'participated in a parliamentary term',
  parliamentRevocation: 'submitted a parliamentary revocation',
  courtsCase: 'opened a courts case',
  courtsEvidence: 'submitted courts evidence',
  courtsAnswer: 'replied in a courts case',
  courtsVerdict: 'reached a courts verdict',
  courtsNomination: 'nominated a judge',
  courtsNominationVote: 'voted on a judge nomination',
  courtsSettlementProposal: 'proposed a courts settlement',
  courtsSettlementAccepted: 'accepted a courts settlement',
  tribeParliamentCandidature: 'stood for a tribe parliament',
  tribeParliamentRule: 'contributed a tribe parliament rule',
  wikiPage: 'edited a wiki page',
  emergency: 'reported an emergency',
  emergencyConfirm: 'confirmed an emergency',
  emergencyUpdate: 'posted an emergency update',
  mailingList: 'created a mailing list',
  logisticsRoute: 'published a logistics route',
  logisticsRating: 'rated a logistics route',
  logisticsOpinion: 'gave an opinion on a route',
  podcast: 'created a podcast',
  podcastEpisode: 'published a podcast episode',
  podcastOpinion: 'gave an opinion on a podcast',
  podcastPlay: 'listened to a podcast episode',
  campaign: 'started a campaign',
  campaignSignature: 'signed a campaign',
  campaignUpdate: 'posted a campaign update',
  campaignOpinion: 'gave an opinion on a campaign',
  audioOpinion: 'gave an opinion on an audio',
  blogOpinion: 'gave an opinion on a blog post',
  bookmarkOpinion: 'gave an opinion on a bookmark',
  documentOpinion: 'gave an opinion on a document',
  eventOpinion: 'gave an opinion on an event',
  feedOpinion: 'gave an opinion on a feed',
  fileOpinion: 'gave an opinion on a file',
  imageOpinion: 'gave an opinion on an image',
  videoOpinion: 'gave an opinion on a video',
  torrentOpinion: 'gave an opinion on a torrent',
  housingOpinion: 'gave an opinion on a housing listing',
  industryOpinion: 'gave an opinion on a facility',
  marketOpinion: 'gave an opinion on a market item',
  projectOpinion: 'gave an opinion on a project',
  reportOpinion: 'gave an opinion on a report',
  schoolOpinion: 'gave an opinion on a course',
  shopOpinion: 'gave an opinion on a shop',
  taskOpinion: 'gave an opinion on a task',
  transferOpinion: 'gave an opinion on a transfer',
  votesOpinion: 'gave an opinion on a votation',
  pollOpinion: 'gave an opinion on a poll',
  calendarParticipant: 'joined a calendar',
  chatMember: 'joined a chat',
  chatPin: 'pinned a chat message',
  chatReaction: 'reacted to a chat message',
  padMember: 'joined a pad',
  mapMember: 'joined a map',
  courtsJudge: 'chose a judge for a courts case',
  courtsMediators: 'proposed mediators for a courts case',
  courtsSupport: 'supported a courts case',
  courtsVisibility: 'changed the visibility of a courts case',
  courtsVoteLink: 'linked a vote to a courts case',
  eventAttend: 'joined an event',
  'feed-action': 'refeeded a feed',
  spread: 'spread some content',
  subscription: 'subscribed to some content',
  job_sub: 'subscribed to a job',
  housing: 'published a housing listing',
  housingRequest: 'requested a housing',
  industryAllocation: 'shared out the output of a production build',
  industryApply: 'applied to join a facility',
  industryBlueprint: 'published a blueprint',
  industryBuildStatus: 'updated the status of a production build',
  industryBuildUpdate: 'posted a production build update',
  industryContribution: 'contributed to a production build',
  industryMember: 'joined a facility',
  industryVote: 'voted in a facility',
  larpHousePost: 'posted in a L.A.R.P. house',
  larpJoinHouse: 'joined a L.A.R.P. house',
  larpLeaveLarp: 'left L.A.R.P.',
  larpTestAttempt: 'took a L.A.R.P. test',
  marketBid: 'placed a bid in the market',
  marketPurchase: 'bought in the market',
  shopPurchase: 'bought in a shop',
  parliamentCandidatureVote: 'voted for a parliamentary candidature',
  tribeParliamentTerm: 'took part in a tribe parliament term',
  poll: 'created a poll',
  pollVote: 'voted in a poll',
  pollClose: 'closed a poll',
  votesVote: 'voted in a votation',
  projectClaim: 'claimed a project bounty',
  projectFollow: 'followed a project',
  projectPledge: 'pledged to a project',
  projectPledgeConfirm: 'confirmed a project pledge',
  reportConfirm: 'confirmed a report',
  transferConfirm: 'confirmed a transfer',
  ubiRefuse: 'declined the UBI',
  schoolCourse: 'created a course',
  schoolEnroll: 'enrolled in a course',
  schoolLesson: 'published a lesson',
  schoolLessonMedia: 'added media to a lesson',
  schoolExam: 'created an exam',
  schoolExamQuestion: 'added an exam question',
  schoolExamResult: 'completed an exam',
  schoolProgress: 'progressed in a course',
  schoolCertificate: 'issued a course certificate',
  schoolCommentHide: 'hid a comment in a course'
};

const compact = (s, n = 200) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

module.exports = ({ cooler }) => {
  let ssb;
  let userId;
  const openSsb = async () => {
    if (!ssb) {
      ssb = await cooler.open();
      userId = ssb.id;
    }
    return ssb;
  };

  async function listAllUserActions() {
    const ssbClient = await openSsb();
    const msgs = await new Promise((resolve, reject) =>
      pull(
        ssbClient.createUserStream({ id: ssbClient.id, reverse: true, limit: logLimit }),
        pull.collect((err, arr) => err ? reject(err) : resolve(arr))
      )
    );
    const out = [];
    for (const m of msgs) {
      const v = m?.value || {};
      const c = v?.content;
      if (!c || typeof c !== 'object' || !c.type) continue;
      if (v.author !== userId) continue;
      if (c.type === 'log') continue;
      if (!ACTION_TYPES.has(c.type)) continue;
      const ts = v.timestamp || 0;
      const summary = c.title || c.text || c.question || c.subject || c.name || c.concept || c.description || '';
      out.push({ key: m.key, ts, type: c.type, summary: compact(summary) });
    }
    return out;
  }

  async function callAI(prompt) {
    if (!prompt) return '';
    try { if ((require('../configs/config-manager.js').getConfig().modules || {}).aiMod !== 'on') return ''; } catch (_) { return ''; }
    const tryOnce = async () => {
      try {
        const answer = await require('../AI/ai_client').ask({ system: 'You write one short first-person diary sentence. No IDs, hashes, quotes, lists or markdown.', input: prompt, maxTokens: 80 });
        return String(answer || '').trim();
      } catch { return ''; }
    };
    let out = await tryOnce();
    if (!out) {
      await new Promise(r => setTimeout(r, 2000));
      out = await tryOnce();
    }
    return out;
  }

  function buildActionPrompt(a) {
    const d = new Date(a.ts).toISOString().slice(0, 16).replace('T', ' ');
    const ctx = a.summary ? ` Subject: "${compact(a.summary, 120)}".` : '';
    return `One first-person diary sentence about a "${a.type}" action at ${d}.${ctx} Vary phrasing. No IDs, hashes, quotes, lists or markdown.`;
  }

  function buildFallbackSentence(a) {
    const phrase = ACTION_PHRASES[a.type] || `performed a ${a.type} action`;
    const d = new Date(a.ts).toISOString().slice(0, 16).replace('T', ' ');
    const ctx = a.summary ? ` — ${compact(a.summary, 120)}` : '';
    return `At ${d} I ${phrase}${ctx}.`;
  }

  function isAImodOn() {
    try { return getConfig().modules?.aiMod === 'on'; } catch { return false; }
  }

  async function publishLog({ text, label, mode, ref }) {
    const ssbClient = await openSsb();
    const content = {
      type: 'log',
      text: String(text || '').slice(0, 8000),
      label: String(label || '').slice(0, 200),
      mode: mode === 'ai' ? 'ai' : 'manual',
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
      private: true
    };
    if (ref) content.ref = String(ref);
    const publishAsync = util.promisify(ssbClient.private.publish);
    return publishAsync(content, [userId]);
  }

  async function republishLog({ replaces, text, label, mode, createdAt }) {
    const ssbClient = await openSsb();
    const content = {
      type: 'log',
      replaces,
      text: String(text || '').slice(0, 8000),
      label: String(label || '').slice(0, 200),
      mode: mode === 'ai' ? 'ai' : 'manual',
      createdAt: createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      timestamp: Date.now(),
      private: true
    };
    const publishAsync = util.promisify(ssbClient.private.publish);
    return publishAsync(content, [userId]);
  }

  async function publishTombstone(target) {
    const ssbClient = await openSsb();
    const content = {
      type: 'tombstone',
      target,
      deletedAt: new Date().toISOString(),
      author: userId,
      private: true
    };
    const publishAsync = util.promisify(ssbClient.private.publish);
    return publishAsync(content, [userId]);
  }

  async function createManual(label, text) {
    await openSsb();
    const t = String(text || '').trim();
    if (!t) return { status: 'empty' };
    await publishLog({ text: t, label: String(label || '').trim(), mode: 'manual' });
    return { status: 'ok' };
  }

  function sigOf(label, text) {
    return `${String(label || '').trim()}||${String(text || '').trim().slice(0, 120)}`;
  }

  async function getProcessedState() {
    const items = await readAllLogMessages();
    const refs = new Set();
    const sigs = new Set();
    for (const it of items) {
      if (it.ref) refs.add(it.ref);
      sigs.add(sigOf(it.label, it.text));
    }
    return { refs, sigs };
  }

  async function createAI() {
    await openSsb();
    if (!isAImodOn()) return { status: 'ai_disabled' };
    const actions = await listAllUserActions();
    if (!actions.length) return { status: 'no_actions' };
    const state = await getProcessedState();
    const pending = actions.filter(a => a.key && !state.refs.has(a.key));
    if (!pending.length) return { status: 'no_new_actions' };
    const MAX_ACTIONS = 40;
    const slice = pending.slice(0, MAX_ACTIONS);
    let published = 0;
    let aiFails = 0;
    let aiDown = false;
    for (const a of slice) {
      let sentence = '';
      if (!aiDown) {
        sentence = await callAI(buildActionPrompt(a));
        if (!sentence) {
          aiFails++;
          if (aiFails >= 3) aiDown = true;
        } else {
          aiFails = 0;
        }
      }
      if (!sentence) sentence = buildFallbackSentence(a);
      if (!sentence) continue;
      const sig = sigOf(a.type, sentence);
      if (state.sigs.has(sig)) { state.refs.add(a.key); continue; }
      await publishLog({ text: sentence, label: a.type, mode: 'ai', ref: a.key });
      state.refs.add(a.key);
      state.sigs.add(sig);
      published++;
      await new Promise(r => setTimeout(r, 300));
    }
    if (!published) return { status: 'no_narrative' };
    return { status: 'ok', count: published };
  }

  async function readAllLogMessages() {
    const ssbClient = await openSsb();
    const sealedOnly = ssbClient.private && typeof ssbClient.private.read === 'function';
    const raw = await new Promise((resolve, reject) =>
      pull(
        sealedOnly ? ssbClient.private.read({ reverse: true, limit: logLimit }) : ssbClient.createLogStream({ reverse: true, limit: logLimit }),
        pull.collect((err, arr) => err ? reject(err) : resolve(arr))
      )
    );
    const items = [];
    const tombstoned = buildValidatedTombstoneSet(raw);
    const replaced = new Map();
    for (const m of raw) {
      if (!m || !m.value) continue;
      const keyIn = m.key;
      const valueIn = m.value;
      const tsIn = m.timestamp || valueIn?.timestamp || Date.now();
      let dec;
      try {
        dec = typeof valueIn.content === 'string' ? ssbClient.private.unbox({ key: keyIn, value: valueIn, timestamp: tsIn }) : (valueIn.private === true ? m : null);
      } catch { continue; }
      const v = dec?.value;
      const c = v?.content;
      if (!c) continue;
      if (v.author !== userId) continue;
      if (c.type === 'tombstone') {
        if (typeof c.target === 'string' && c.target) tombstoned.add(c.target);
        continue;
      }
      if (c.type !== 'log') continue;
      if (c.replaces) replaced.set(c.replaces, dec.key || keyIn);
      items.push({
        key: dec.key || keyIn,
        author: v.author,
        ts: v.timestamp || tsIn,
        createdAt: c.createdAt || new Date(v.timestamp || tsIn).toISOString(),
        text: String(c.text || ''),
        label: String(c.label || ''),
        mode: c.mode === 'ai' ? 'ai' : 'manual',
        replaces: c.replaces || null,
        ref: c.ref || null
      });
    }
    const parentOf = new Map();
    for (const i of items) if (i.replaces) parentOf.set(i.key, i.replaces);
    const rootOf = (key) => {
      let cur = key;
      const seen = new Set();
      while (parentOf.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parentOf.get(cur); }
      return cur;
    };
    const survivors = items.filter(i => !tombstoned.has(i.key) && !replaced.has(i.key));
    for (const i of survivors) i.rootId = rootOf(i.key);
    survivors.sort((a, b) => b.ts - a.ts);
    return survivors;
  }

  async function listLogs(filter = 'today') {
    const items = await readAllLogMessages();
    const win = FILTER_WINDOWS[filter];
    if (win === null || win === undefined) return items;
    const cutoff = Date.now() - win;
    return items.filter(i => i.ts >= cutoff);
  }

  async function getLogById(id) {
    const items = await readAllLogMessages();
    return items.find(i => i.key === id) || null;
  }

  async function updateLog(id, { text, label, mode }) {
    const current = await getLogById(id);
    if (!current) return { status: 'not_found' };
    const next = {
      text: text !== undefined ? text : current.text,
      label: label !== undefined ? label : current.label,
      mode: mode || current.mode
    };
    await republishLog({
      replaces: current.key,
      ...next,
      createdAt: current.createdAt
    });
    return { status: 'ok' };
  }

  async function deleteLog(id) {
    const current = await getLogById(id);
    if (!current) return { status: 'not_found' };
    await publishTombstone(current.key);
    return { status: 'ok' };
  }

  async function countLogs() {
    const items = await readAllLogMessages();
    return items.length;
  }

  return {
    createManual,
    createAI,
    updateLog,
    deleteLog,
    getLogById,
    listLogs,
    countLogs,
    isAImodOn,
    FILTER_WINDOWS
  };
};
