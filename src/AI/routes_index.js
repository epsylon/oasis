const path = require('path')
const fs = require('fs')

const ROUTES = [
  { path: '/public/latest', mod: null,         description: 'home, latest posts, public timeline, news, recent activity' },
  { path: '/feed',          mod: 'feedMod',    description: 'feed, microblog, opinions, share thoughts, vote on posts, refeeds' },
  { path: '/forum',         mod: 'forumMod',   description: 'forum, discussions, threads, debates, conversation by category' },
  { path: '/inhabitants',   mod: 'inhabitantsMod', description: 'inhabitants, users, people, profiles, contacts, follow, block' },
  { path: '/tribes',        mod: 'tribeMod',   description: 'tribes, groups, communities, private rooms, sub-tribes, governance' },
  { path: '/chats',         mod: 'chatMod',    description: 'chats, messaging, encrypted rooms, group conversations' },
  { path: '/pads',          mod: 'padMod',     description: 'pads, collaborative editor, shared notes, encrypted documents' },
  { path: '/calendars',     mod: 'calendarMod', description: 'calendar, events by date, schedule, reminders, recurring dates' },
  { path: '/maps',          mod: 'mapMod',     description: 'maps, locations, markers, geography, places' },
  { path: '/events',        mod: 'eventMod',   description: 'events, agenda, meetups, gatherings, RSVP' },
  { path: '/agenda',        mod: 'agendaMod',  description: 'agenda, scheduled items, upcoming, my dates' },
  { path: '/tasks',         mod: 'taskMod',    description: 'tasks, todo, assignments, work items, priorities' },
  { path: '/projects',      mod: 'projectMod', description: 'projects, milestones, backers, crowdfunding, bounties' },
  { path: '/jobs',          mod: 'jobMod',     description: 'jobs, work, hiring, salaries, vacancies, applications' },
  { path: '/market',        mod: 'marketMod',  description: 'market, marketplace, buy, sell, items, auctions, ECO' },
  { path: '/shops',         mod: 'shopMod',    description: 'shops, stores, products, ecommerce, vendors' },
  { path: '/banking',       mod: 'bankingMod', description: 'banking, wallet, ECO balance, send money, transfers, payments, UBI claim' },
  { path: '/transfers',     mod: 'transferMod', description: 'transfers, payments, money movements, ECO transactions, history' },
  { path: '/wallet',        mod: 'walletMod',  description: 'wallet, ECOin address, send and receive, QR code, balance' },
  { path: '/parliament',    mod: 'parliamentMod', description: 'parliament, governance, government, proposals, laws, leaders, voting' },
  { path: '/courts',        mod: 'courtsMod',  description: 'courts, judges, accusations, mediators, justice, disputes' },
  { path: '/votations',     mod: 'votationsMod', description: 'votations, polls, surveys, multi-option votes' },
  { path: '/votes',         mod: 'votesMod',   description: 'votes, ballots, decisions, polling, voting' },
  { path: '/opinions',      mod: 'opinionsMod', description: 'opinions, reactions, ratings, sentiment, expressing views' },
  { path: '/trending',      mod: 'trendingMod', description: 'trending, popular, hot, top voted, what is being discussed' },
  { path: '/reports',       mod: 'reportsMod', description: 'reports, bug reports, abuse, incidents, severity, confirmations' },
  { path: '/audios',        mod: 'audioMod',   description: 'audios, music, podcasts, voice recordings, sound files' },
  { path: '/videos',        mod: 'videoMod',   description: 'videos, films, clips, recordings, watch' },
  { path: '/images',        mod: 'imageMod',   description: 'images, photos, pictures, gallery, memes' },
  { path: '/documents',     mod: 'documentMod', description: 'documents, PDFs, files, papers, references' },
  { path: '/bookmarks',     mod: 'bookmarkMod', description: 'bookmarks, links, saved websites, favorites' },
  { path: '/torrents',      mod: 'torrentMod', description: 'torrents, magnet links, file sharing, downloads' },
  { path: '/tags',          mod: 'tagsMod',    description: 'tags, hashtags, topics, categories, labels' },
  { path: '/search',        mod: null,         description: 'search, find, query, lookup' },
  { path: '/inbox',         mod: null,         description: 'inbox, notifications, mentions, alerts, messages addressed to me' },
  { path: '/pm',            mod: 'privateMessageMod', description: 'private messages, direct messages, DMs, encrypted PM' },
  { path: '/publish',       mod: null,         description: 'publish, write, create post, new entry, compose' },
  { path: '/games',         mod: 'gameMod',    description: 'games, play, mini-games, scoring, fun' },
  { path: '/pixelia',       mod: 'pixeliaMod', description: 'pixelia, pixel canvas, draw, collaborative pixel art' },
  { path: '/cv',            mod: 'cvMod',      description: 'cv, curriculum, resume, my profile, skills, experiences' },
  { path: '/legacy',        mod: 'legacyMod',  description: 'legacy, export data, import, backup, restore identity' },
  { path: '/cipher',        mod: 'cipherMod',  description: 'cipher, encrypt, decrypt, password, vault' },
  { path: '/stats',         mod: 'statsMod',   description: 'stats, statistics, KPIs, metrics, dashboard, carbon footprint' },
  { path: '/blockchain',    mod: 'blockchainMod', description: 'blockchain, blocks, explorer, ledger, chain' },
  { path: '/peers',         mod: 'peersMod',   description: 'peers, connections, network, nodes, who am I connected to' },
  { path: '/invites',       mod: 'invitesMod', description: 'invites, pub invitations, join code, follow PUB' },
  { path: '/graphos',       mod: 'graphosMod', description: 'graphos, network map, visualization, relationship graph' },
  { path: '/modules',       mod: null,         description: 'modules, features, enable disable plugins, settings' },
  { path: '/settings',      mod: null,         description: 'settings, preferences, language, theme, configuration' },
  { path: '/favorites',     mod: 'favoritesMod', description: 'favorites, starred items, saved content' },
  { path: '/logs',          mod: 'logsMod',    description: 'logs, life log, personal records, journal, experiences' }
]

const CACHE_FILE = path.join(__dirname, 'embeddings', 'routes_cache.json')

let cache = null

const buildCacheKey = () => ROUTES.map(r => r.path + '|' + r.description).join('\n')

const loadCache = () => {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
    if (data.key === buildCacheKey() && Array.isArray(data.entries)) return data.entries
    return null
  } catch (_) {
    return null
  }
}

const saveCache = (entries) => {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true })
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ key: buildCacheKey(), entries }, null, 2), 'utf8')
  } catch (_) {}
}

const ensureIndex = async ({ embed }) => {
  if (cache) return cache
  const cached = loadCache()
  if (cached) { cache = cached; return cache }
  const entries = []
  for (const r of ROUTES) {
    const vec = await embed(r.description)
    if (!vec) return null
    entries.push({ path: r.path, mod: r.mod, vector: vec })
  }
  cache = entries
  saveCache(entries)
  return cache
}

const resolveBest = async (queryVector, { isModuleEnabled, threshold = 0.4, embed } = {}) => {
  const idx = await ensureIndex({ embed })
  if (!idx) return null
  let best = null
  for (const entry of idx) {
    if (entry.mod && typeof isModuleEnabled === 'function' && !isModuleEnabled(entry.mod)) continue
    const score = (() => {
      let s = 0
      for (let i = 0; i < queryVector.length; i++) s += queryVector[i] * entry.vector[i]
      return s
    })()
    if (!best || score > best.score) best = { path: entry.path, score }
  }
  if (!best || best.score < threshold) return null
  return best
}

module.exports = { ROUTES, ensureIndex, resolveBest }
