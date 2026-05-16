const path = require('path')
const fs = require('fs')

const ROUTES = [
  { path: '/public/latest', mod: null,         description: 'home, latest posts, public timeline, news, recent activity' },
  { path: '/feed',          mod: 'feedMod',    description: 'feed, microblog, opinions, share thoughts, vote on posts, refeeds' },
  { path: '/forum',         mod: 'forumMod',   description: 'forum, discussions, threads, debates, conversation by category' },
  { path: '/inhabitants',   mod: 'inhabitantsMod', description: 'inhabitants, users, people, profiles, contacts, follow, block' },
  { path: '/inhabitants?filter=SUGGESTED', mod: 'inhabitantsMod', description: 'suggested inhabitants, recommendations, who to follow, similar people, people you might know, friend suggestions' },
  { path: '/inhabitants?filter=MATCHSKILLS', mod: 'inhabitantsMod', description: 'match skills, people with same skills, common skills, professional matches, find collaborators, who shares my expertise, skill overlap' },
  { path: '/inhabitants?filter=CVs', mod: 'inhabitantsMod', description: 'curriculums, CVs, resumes, professional profiles, people with experience, find expertise' },
  { path: '/inhabitants?filter=TOP%20KARMA', mod: 'inhabitantsMod', description: 'top karma, most active inhabitants, highest reputation, leaderboard' },
  { path: '/inhabitants?filter=TOP%20ECO', mod: 'inhabitantsMod', description: 'top eco, most ecological, least carbon footprint, sustainable users, efficient inhabitants' },
  { path: '/inhabitants?filter=TOP%20ACTIVITY', mod: 'inhabitantsMod', description: 'top activity, most recently active inhabitants, fresh users, recently online' },
  { path: '/inhabitants?filter=contacts', mod: 'inhabitantsMod', description: 'my contacts, who I follow, my network, friends list, mutuals' },
  { path: '/inhabitants?filter=GALLERY', mod: 'inhabitantsMod', description: 'gallery of inhabitants, all avatars, visual list, photos' },
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
  { path: '/banking',       mod: 'bankingMod', description: 'banking, wallet, ECO balance, send money, transfers, payments, UBI claim, karma score, eco tax penalty, ECOin value' },
  { path: '/transfers',     mod: 'transferMod', description: 'transfers, payments, money movements, ECO transactions, history, smart contracts, contract PDF, export contract' },
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
  { path: '/peers',         mod: 'peersMod',   description: 'peers, connections, network, nodes, who am I connected to, LAN, refresh discovery, export peer list, import peer list, remove idle' },
  { path: '/invites',       mod: 'invitesMod', description: 'invites, pub invitations, join code, follow PUB, federations, federated networks, import pubs, export pubs, unreachable pubs' },
  { path: '/graphos',       mod: 'graphosMod', description: 'graphos, network map, visualization, relationship graph' },
  { path: '/modules',       mod: null,         description: 'modules, features, enable disable plugins, settings' },
  { path: '/settings',      mod: null,         description: 'settings, preferences, language, theme, configuration' },
  { path: '/favorites',     mod: 'favoritesMod', description: 'favorites, starred items, saved content' },
  { path: '/logs',          mod: 'logsMod',    description: 'logs, life log, personal records, journal, experiences' },
  { path: '/melody',        mod: 'melodyMod',  description: 'melody, sound of my blockchain, music, generate sound, audio of blocks, sonification' },
  { path: '/profile',       mod: null,         description: 'my profile, my avatar, my page, my identity, my data' },
  { path: '/profile/edit',  mod: null,         description: 'edit profile, edit avatar, change name, change description, visibility prefs, sensors, eco tax toggle' },
  { path: '/blockexplorer', mod: 'blockchainMod', description: 'blockexplorer, blockchain explorer, blocks, ledger, carbon footprint per block, chain history' },
  { path: '/stats?filter=ALL',  mod: 'statsMod', description: 'global stats, network kpis, total carbon footprint, total inhabitants, network size' },
  { path: '/stats?filter=MINE', mod: 'statsMod', description: 'my stats, my carbon footprint, my activity numbers, personal kpis' },
  { path: '/tribes/new',    mod: 'tribeMod',   description: 'create tribe, new tribe, new group, start community, create private room' },
  { path: '/chats/new',     mod: 'chatMod',    description: 'create chat, new chat, start conversation, new encrypted room' },
  { path: '/pads/new',      mod: 'padMod',     description: 'create pad, new pad, new collaborative document, start shared note' },
  { path: '/calendars/new', mod: 'calendarMod', description: 'create calendar, new calendar, start schedule' },
  { path: '/maps/new',      mod: 'mapMod',     description: 'create map, new map, new offline map' },
  { path: '/events/new',    mod: 'eventMod',   description: 'create event, new event, schedule meetup' },
  { path: '/projects/new',  mod: 'projectMod', description: 'create project, new project, start crowdfunding' },
  { path: '/jobs/new',      mod: 'jobMod',     description: 'create job, post job offer, new vacancy, hire' },
  { path: '/market/new',    mod: 'marketMod',  description: 'create market item, sell something, new auction, list for sale' },
  { path: '/shops/new',     mod: 'shopMod',    description: 'create shop, open store, new vendor, list products' },
  { path: '/tasks/new',     mod: 'taskMod',    description: 'create task, new todo, new assignment' },
  { path: '/reports/new',   mod: 'reportsMod', description: 'create report, file bug, report issue, report abuse' }
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

const dot = (a, b) => {
  let s = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) s += a[i] * b[i]
  return s
}

const descriptionByPath = (p) => {
  const r = ROUTES.find(x => x.path === p)
  return r ? r.description : ''
}

const resolveBest = async (queryVector, { isModuleEnabled, threshold = 0.4, embed } = {}) => {
  const idx = await ensureIndex({ embed })
  if (!idx) return null
  let best = null
  for (const entry of idx) {
    if (entry.mod && typeof isModuleEnabled === 'function' && !isModuleEnabled(entry.mod)) continue
    const score = dot(queryVector, entry.vector)
    if (!best || score > best.score) best = { path: entry.path, score }
  }
  if (!best || best.score < threshold) return null
  return best
}

const resolveTopK = async (queryVector, { isModuleEnabled, threshold = 0.35, embed } = {}, k = 5) => {
  const idx = await ensureIndex({ embed })
  if (!idx) return []
  const all = []
  for (const entry of idx) {
    if (entry.mod && typeof isModuleEnabled === 'function' && !isModuleEnabled(entry.mod)) continue
    const score = dot(queryVector, entry.vector)
    if (score < threshold) continue
    all.push({ path: entry.path, mod: entry.mod, score, description: descriptionByPath(entry.path) })
  }
  all.sort((a, b) => b.score - a.score)
  return all.slice(0, Math.max(1, k|0))
}

const resolveKeywordTopK = ({ isModuleEnabled } = {}, query, k = 8) => {
  const tokens = String(query || '').toLowerCase().split(/[^a-z0-9À-ſ]+/).filter(t => t && t.length >= 2)
  if (!tokens.length) return []
  const all = []
  for (const entry of ROUTES) {
    if (entry.mod && typeof isModuleEnabled === 'function' && !isModuleEnabled(entry.mod)) continue
    const haystack = (entry.description || '').toLowerCase() + ' ' + entry.path.toLowerCase()
    let hits = 0
    for (const t of tokens) {
      if (haystack.includes(t)) hits += 1
    }
    if (hits === 0) continue
    all.push({ path: entry.path, mod: entry.mod, score: hits / tokens.length, description: entry.description })
  }
  all.sort((a, b) => b.score - a.score)
  return all.slice(0, Math.max(1, k|0))
}

module.exports = { ROUTES, ensureIndex, resolveBest, resolveTopK, resolveKeywordTopK }
