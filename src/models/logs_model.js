const pull = require('../server/node_modules/pull-stream');
const util = require('../server/node_modules/util');
const axios = require('../server/node_modules/axios');
const fs = require('fs');
const path = require('path');
const { getConfig } = require('../configs/config-manager.js');

const logLimit = getConfig().ssbLogStream?.limit || 1000;
const CYCLE_PATH = path.join(__dirname, '..', 'configs', 'blockchain-cycle.json');

const readCycle = () => {
  try { return JSON.parse(fs.readFileSync(CYCLE_PATH, 'utf8')).cycle || 0; }
  catch { return 0; }
};

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
  'document', 'torrent', 'event', 'task', 'taskAssignment',
  'votes', 'vote', 'report', 'tribe', 'chat', 'chatMessage', 'pad', 'padEntry',
  'forum', 'market', 'job', 'project', 'pixelia', 'map', 'mapMarker',
  'shop', 'shopProduct', 'curriculum', 'gameScore',
  'calendar', 'calendarDate', 'calendarNote',
  'transfer', 'bankClaim', 'ubiClaim',
  'parliamentCandidature', 'parliamentProposal', 'parliamentLaw',
  'parliamentTerm', 'parliamentRevocation',
  'courtsCase', 'courtsEvidence', 'courtsAnswer', 'courtsVerdict',
  'courtsNomination', 'courtsNominationVote',
  'courtsSettlementProposal', 'courtsSettlementAccepted',
  'tribeParliamentCandidature', 'tribeParliamentRule'
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
  event: 'created an event',
  task: 'created a task',
  taskAssignment: 'updated a task assignment',
  votes: 'participated in a vote',
  vote: 'cast a vote',
  report: 'submitted a report',
  tribe: 'interacted with a tribe',
  chat: 'opened a chat room',
  chatMessage: 'sent a chat message',
  pad: 'worked on a collaborative pad',
  padEntry: 'edited a pad entry',
  market: 'posted in the market',
  forum: 'posted in the forum',
  job: 'posted a job opportunity',
  project: 'advanced a project',
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
  tribeParliamentRule: 'contributed a tribe parliament rule'
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
        ssbClient.createLogStream({ reverse: true, limit: logLimit }),
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
    const tryOnce = async () => {
      try {
        const res = await axios.post('http://localhost:4001/ai', { input: prompt, raw: true }, { timeout: 90000 });
        return String(res?.data?.answer || '').trim();
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
      cycle: readCycle(),
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
      private: true
    };
    if (ref) content.ref = String(ref);
    const publishAsync = util.promisify(ssbClient.private.publish);
    return publishAsync(content, [userId]);
  }

  async function republishLog({ replaces, text, label, mode, cycle, createdAt }) {
    const ssbClient = await openSsb();
    const content = {
      type: 'log',
      replaces,
      text: String(text || '').slice(0, 8000),
      label: String(label || '').slice(0, 200),
      mode: mode === 'ai' ? 'ai' : 'manual',
      cycle: cycle || readCycle(),
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
    const raw = await new Promise((resolve, reject) =>
      pull(
        ssbClient.createLogStream({ reverse: false, limit: logLimit }),
        pull.collect((err, arr) => err ? reject(err) : resolve(arr))
      )
    );
    const items = [];
    const tombstoned = new Set();
    const replaced = new Map();
    for (const m of raw) {
      if (!m || !m.value) continue;
      const keyIn = m.key;
      const valueIn = m.value;
      const tsIn = m.timestamp || valueIn?.timestamp || Date.now();
      let dec;
      try {
        dec = ssbClient.private.unbox({ key: keyIn, value: valueIn, timestamp: tsIn });
      } catch { continue; }
      const v = dec?.value;
      const c = v?.content;
      if (!c) continue;
      if (v.author !== userId) continue;
      if (c.type === 'tombstone' && c.target) { tombstoned.add(c.target); continue; }
      if (c.type !== 'log') continue;
      if (c.replaces) replaced.set(c.replaces, dec.key || keyIn);
      items.push({
        key: dec.key || keyIn,
        author: v.author,
        ts: v.timestamp || tsIn,
        cycle: c.cycle || 0,
        createdAt: c.createdAt || new Date(v.timestamp || tsIn).toISOString(),
        text: String(c.text || ''),
        label: String(c.label || ''),
        mode: c.mode === 'ai' ? 'ai' : 'manual',
        replaces: c.replaces || null,
        ref: c.ref || null
      });
    }
    const survivors = items.filter(i => !tombstoned.has(i.key) && !replaced.has(i.key));
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
    await republishLog({
      replaces: current.key,
      text: text !== undefined ? text : current.text,
      label: label !== undefined ? label : current.label,
      mode: mode || current.mode,
      cycle: current.cycle,
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
    isAImodOn
  };
};
