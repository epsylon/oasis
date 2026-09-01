const path = require('path')
const fs = require('fs')

const ROUTES = [
  { path: '/blogs',         mod: 'blogsMod',   description: 'blogs, blog posts, articles, written entries, long posts, public writing' },
  { path: '/polls',         mod: 'pollsMod',   description: 'polls, survey, ask a question with options, multiple choice, anonymous poll, count answers' },
  { path: '/polls?filter=CREATE', mod: 'pollsMod', description: 'create a poll, new survey, ask the network with options' },
  { path: '/blogs?filter=CREATE', mod: 'blogsMod', description: 'write a blog, publish a blog, compose an article, new blog entry' },
  { path: '/blogs?filter=TOP', mod: 'blogsMod', description: 'best blogs, most commented blogs, most valued blog entries' },
  { path: '/feed',          mod: 'feedMod',    description: 'feed, microblog, opinions, share thoughts, vote on posts, refeeds' },
  { path: '/forum',         mod: 'forumMod',   description: 'forum, discussions, threads, debates, conversation by category' },
  { path: '/inhabitants',   mod: null, description: 'inhabitants, users, people, profiles, contacts, follow, block' },
  { path: '/inhabitants?filter=SUGGESTED', mod: null, description: 'suggested inhabitants, recommendations, who to follow, similar people, people you might know, friend suggestions' },
  { path: '/data',          mod: null,         description: 'matches, match skills, cross-data, big data of the network, affinities, cohesion coefficient, who shares my expertise, skill overlap, algorithmic suggestions' },
  { path: '/data?filter=INHABITANTS', mod: null, description: 'people with the same skills, professional matches, find collaborators' },
  { path: '/data?filter=JOBS', mod: null, description: 'jobs that match my skills, work suited to my profile' },
    { path: '/inhabitants?filter=CVs', mod: null, description: 'curriculums, CVs, resumes, professional profiles, people with experience, find expertise' },
  { path: '/inhabitants?filter=TOP%20KARMA', mod: null, description: 'top karma, most active inhabitants, highest reputation, leaderboard' },
  { path: '/inhabitants?filter=TOP%20ECO', mod: null, description: 'top eco, most ecological, least carbon footprint, sustainable users, efficient inhabitants' },
  { path: '/inhabitants?filter=TOP%20ACTIVITY', mod: null, description: 'top activity, most recently active inhabitants, fresh users, recently online' },
  { path: '/inhabitants?filter=contacts', mod: null, description: 'my contacts, who I follow, my network, friends list, mutuals' },
  { path: '/inhabitants?filter=GALLERY', mod: null, description: 'gallery of inhabitants, all avatars, visual list, photos' },
  { path: '/tribes',        mod: 'tribesMod',   description: 'tribes, groups, communities, private rooms, sub-tribes, governance, public tribes, browse all visible tribes' },
  { path: '/tribes?filter=mine', mod: 'tribesMod', description: 'my tribes, tribes I created, tribes I authored, my groups' },
  { path: '/tribes?filter=membership', mod: 'tribesMod', description: 'tribes I am a member of, my memberships, joined tribes, where I belong' },
  { path: '/larp',          mod: 'larpMod',    description: 'larp, role playing, nine houses, academia, solaris, arrakis, terraverde, unsystem, dogma, helix, quark, hermandad, governance cycle, ruling house, will test' },
  { path: '/larp?filter=houses', mod: 'larpMod', description: 'list of houses, all houses, browse houses, every house, choose a house, house directory, house grid' },
  { path: '/larp?filter=rules',  mod: 'larpMod', description: 'larp faq, rules, governance wall, starting house, will test, invitation code, larp emblem' },
  { path: '/larp/academia',    mod: 'larpMod', description: 'ACADEMIA house, aca, education, teachers, coordinators, newcomers, talent discovery, selection process, nosce te ipsum, take will test, leave house, return to academia' },
  { path: '/larp/solaris',     mod: 'larpMod', description: 'SolarIS house, sol, governance, law, diplomacy, politics, rulers, lawyers, diplomats, communication, mediation' },
  { path: '/larp/arrakis',     mod: 'larpMod', description: 'ARRakis house, arr, engineers, scientists, technicians, technology, invention, problem solving, building, prototypes, repairs, automation' },
  { path: '/larp/terraverde',  mod: 'larpMod', description: 'TERRA.VErDE house, ter, farmers, ecologists, doctors, nutritionists, healthcare, food, nature, climate, biosphere, regeneration' },
  { path: '/larp/unsystem',    mod: 'larpMod', description: 'UNSYSTem house, uns, chaos agents, trolls, punks, sabotage, tactical chaos, provocation, anti-system' },
  { path: '/larp/dogma',       mod: 'larpMod', description: 'DogmA house, dog, thinkers, journalists, philosophers, information control, knowledge, archive, narratives, ai, memory' },
  { path: '/larp/helix',       mod: 'larpMod', description: 'HeliX house, hlx, clowns, influencers, musicians, priests, entertainment, culture, humor, celebration, ritual, joy, festival' },
  { path: '/larp/quark',       mod: 'larpMod', description: 'QuarK house, quk, athletes, soldiers, street people, protection, security, defense, survival, family, mutual aid' },
  { path: '/larp/hermandad',   mod: 'larpMod', description: 'HERmanDAD house, hrm, architects, builders, investors, industrialists, construction, development, sustainability, logistics, production, supply chain' },
  { path: '/larp/test',        mod: 'larpMod', description: 'will test, psychological test, take house test, assigned to house, find my house, profile questions' },
  { path: '/chats',         mod: 'chatsMod',    description: 'chats, messaging, encrypted rooms, group conversations' },
  { path: '/pads',          mod: 'padsMod',     description: 'pads, collaborative editor, shared notes, encrypted documents' },
  { path: '/calendars',     mod: 'calendarsMod', description: 'calendar, events by date, schedule, reminders, recurring dates' },
  { path: '/maps',          mod: 'mapsMod',     description: 'maps, locations, markers, geography, places' },
  { path: '/events',        mod: 'eventsMod',   description: 'events, agenda, meetups, gatherings, RSVP' },
  { path: '/agenda',        mod: 'agendaMod',  description: 'agenda, scheduled items, upcoming, my dates, my tasks events transfers projects jobs market reports tribes' },
  { path: '/agenda?filter=discarded', mod: 'agendaMod', description: 'discarded agenda items, archived agenda, removed from agenda, hidden tasks' },
  { path: '/tasks',         mod: 'tasksMod',    description: 'tasks, todo, assignments, work items, priorities' },
  { path: '/projects',      mod: 'projectsMod', description: 'projects, milestones, backers, crowdfunding, bounties' },
  { path: '/school',        mod: 'schoolMod',   description: 'school, courses, classes, lessons, learning, teach, study, education, enroll, students, certificates, diploma pdf, exams, course invite code, join course with code' },
  { path: '/industry',      mod: 'industryMod', description: 'industry, facilities, factories, workshops, means of manufacturing, commons, cooperatives, blueprints, builds' },
  { path: '/industry?filter=BLUEPRINTS', mod: 'industryMod', description: 'blueprints, designs, recipes, open hardware designs, copyleft designs, bill of materials, materials list' },
  { path: '/industry?filter=BUILDS', mod: 'industryMod', description: 'builds, manufacturing runs, fabrication orders, batches, build status, contributions to a build' },
  { path: '/industry?filter=MEMBER', mod: 'industryMod', description: 'facilities I belong to, my industry memberships, where I am a worker' },
  { path: '/industry?filter=MINE', mod: 'industryMod', description: 'facilities I steward, industries I created' },
  { path: '/industry?filter=ACTIVE', mod: 'industryMod', description: 'working facilities, active factories, industries manufacturing right now' },
  { path: '/industry?filter=PAUSED', mod: 'industryMod', description: 'paused facilities, halted manufacturing, stopped industries' },
  { path: '/industry?filter=DISSOLVED', mod: 'industryMod', description: 'dissolved facilities, closed factories, ended cooperatives' },
  { path: '/industry?filter=RULES', mod: 'industryMod', description: 'industry rules, how facilities work, stewardship, quorum, majority, karma shares, distribution' },
  { path: '/housing',       mod: 'housingMod',  description: 'housing, homes, flats, apartments, rooms, lodging, accommodation, real estate, places to live' },
  { path: '/housing?filter=SALE', mod: 'housingMod', description: 'homes for sale, property for sale, real estate on sale, houses being sold' },
  { path: '/housing?filter=RENT', mod: 'housingMod', description: 'places to rent, rentals, monthly rent, flat to let, room to rent' },
  { path: '/housing?filter=COUCHSURFING', mod: 'housingMod', description: 'couchsurfing, free stay, hospitality, host me, sofa to sleep, guest room offered for free' },
  { path: '/housing?filter=REQUESTED', mod: 'housingMod', description: 'places I requested, my housing requests, stays I asked for' },
  { path: '/housing?filter=MINE', mod: 'housingMod', description: 'my places, housing listings I published, my properties' },
  { path: '/jobs',          mod: 'jobsMod',     description: 'jobs, work, hiring, salaries, vacancies, applications' },
  { path: '/market',        mod: 'marketMod',  description: 'market, marketplace, buy, sell, items, auctions, ECO' },
  { path: '/shops',         mod: 'shopsMod',    description: 'shops, stores, products, ecommerce, vendors' },
  { path: '/banking',       mod: 'bankingMod', description: 'banking, wallet, ECO balance, send money, transfers, payments, UBI claim, karma score, eco tax penalty, ECOin value' },
  { path: '/transfers',     mod: 'transfersMod', description: 'transfers, payments, money movements, ECO transactions, history, smart contracts, contract PDF, export contract' },
  { path: '/wallet',        mod: 'walletMod',  description: 'wallet, ECOin address, send and receive, QR code, balance' },
  { path: '/parliament',    mod: 'parliamentMod', description: 'parliament, governance, government, proposals, laws, leaders, voting' },
  { path: '/courts',        mod: 'courtsMod',  description: 'courts, judges, accusations, mediators, justice, disputes' },
  { path: '/votes',         mod: 'votesMod',   description: 'votes, votations, ballots, decisions, polling, voting, polls, surveys, multi-option votes' },
  { path: '/opinions',      mod: 'opinionsMod', description: 'opinions, reactions, ratings, sentiment, expressing views, interesting useful funny boring sad joyful angry confused inspiring frustrating curious sympathetic challenged surprised exited categories' },
  { path: '/trending',      mod: 'trendingMod', description: 'trending, popular, hot, top voted, what is being discussed, most opinions, top spread, viral content' },
  { path: '/activity',      mod: null,         description: 'activity, recent actions, what is happening, my history, others actions, feed votes, opinions activity, spread activity' },
  { path: '/activity?filter=mine', mod: null, description: 'my activity, my actions, what I did, my history, what I published' },
  { path: '/activity?filter=today', mod: null, description: 'today activity, last 24h, recent today' },
  { path: '/reports',       mod: 'reportsMod', description: 'reports, bug reports, abuse, incidents, severity, confirmations' },
  { path: '/audios',        mod: 'audiosMod',   description: 'audios, music, podcasts, voice recordings, sound files' },
  { path: '/audios?filter=bcs', mod: 'audiosMod', description: 'BCS audios, blockchain sonification audios, melody compositions published by inhabitants, transcode source audio, embedded steganography' },
  { path: '/audios?filter=favorites', mod: 'audiosMod', description: 'favorite audios, starred audios, saved music' },
  { path: '/videos',        mod: 'videosMod',   description: 'videos, films, clips, recordings, watch' },
  { path: '/images',        mod: 'imagesMod',   description: 'images, photos, pictures, gallery, memes' },
  { path: '/documents',     mod: 'docsMod', description: 'documents, PDFs, files, papers, references' },
  { path: '/bookmarks',     mod: 'bookmarksMod', description: 'bookmarks, links, saved websites, favorites' },
  { path: '/torrents',      mod: 'torrentsMod', description: 'torrents, magnet links, file sharing, downloads' },
  { path: '/tags',          mod: 'tagsMod',    description: 'tags, hashtags, topics, categories, labels' },
  { path: '/search',        mod: null,         description: 'search, find, query, lookup' },
  { path: '/inbox',         mod: null,         description: 'inbox, notifications, mentions, alerts, messages addressed to me, received PM' },
  { path: '/inbox?filter=sent', mod: null,     description: 'sent messages, outgoing PM, my sent private messages, what I wrote' },
  { path: '/inbox?filter=reminders', mod: null, description: 'reminders, task reminders, calendar reminders, automatic notifications' },
  { path: '/pm',            mod: null, description: 'private messages, direct messages, DMs, encrypted PM, compose new PM' },
  { path: '/mentions',      mod: null,         description: 'mentions, who mentioned me, tagged me, my mentions, posts mentioning me, tribe mentions' },
  { path: '/games',         mod: 'gamesMod',    description: 'games, play, mini-games, scoring, fun' },
  { path: '/ai',            mod: 'aiMod',       description: '42, AI assistant, ask the AI, chat with AI, oasis assistant, artificial intelligence, ai help, ai answers' },
  { path: '/pixelia',       mod: 'pixeliaMod', description: 'pixelia, pixel canvas, draw, collaborative pixel art' },
  { path: '/cv',            mod: null,      description: 'cv, curriculum, resume, my profile, skills, experiences' },
  { path: '/legacy',        mod: 'legacyMod',  description: 'legacy, export data, import, backup, restore identity' },
  { path: '/cipher',        mod: 'cipherMod',  description: 'cipher, encrypt, decrypt, password, vault' },
  { path: '/dev',           mod: 'devMod',     description: 'source code, oasis codebase, file tree, browse files, read the code' },
  { path: '/dev/search',    mod: 'devMod',     description: 'grep the codebase, find a function, find a string in source files' },
  { path: '/dev/map',       mod: 'devMod',     description: 'module map, which file implements a module, models views routes tests' },
  { path: '/stats',         mod: null,   description: 'stats, statistics, KPIs, metrics, dashboard, carbon footprint' },
  { path: '/peers',         mod: null,   description: 'peers, connections, network, nodes, who am I connected to, LAN, refresh discovery, export peer list, import peer list, remove idle' },
  { path: '/invites',       mod: 'invitesMod', description: 'invites, pub invitations, join code, follow PUB, federations, federated networks, import pubs, export pubs, unreachable pubs, redeem tribe invite code, join tribe by code, redeem course code, join school course by code, accept invitation' },
  { path: '/graphos',       mod: 'graphosMod', description: 'graphos, network map, visualization, relationship graph' },
  { path: '/modules',       mod: null,         description: 'modules, features, enable disable plugins, settings' },
  { path: '/settings',      mod: null,         description: 'settings, preferences, language, theme, configuration' },
  { path: '/favorites',     mod: 'favoritesMod', description: 'favorites, starred items, saved content, my bookmarks audios videos images documents pads chats calendars maps torrents' },
  { path: '/favorites?filter=recent', mod: 'favoritesMod', description: 'recent favorites, latest starred items' },
  { path: '/logs',          mod: 'logsMod',    description: 'logs, life log, personal records, journal, experiences' },
  { path: '/melody',        mod: 'melodyMod',  description: 'melody, sound of my blockchain, music, generate sound, audio of blocks, sonification, publish BCS, hidden message, steganography, embed text in waveform' },
  { path: '/melody?filter=all', mod: 'melodyMod', description: 'BCS from other inhabitants, all blockchain compositions, listen to peers melodies, transcode audio of others' },
  { path: '/profile',       mod: null,         description: 'my profile, my avatar, my page, my identity, my data, my clearnet link' },
  { path: '/profile/edit',  mod: null,         description: 'edit profile, edit avatar, change name, change description, visibility prefs, sensors, eco tax toggle, clearnet toggle, GPG fingerprint' },
  { path: '/blockexplorer', mod: null, description: 'blockexplorer, blockchain, blockchain explorer, blocks, ledger, chain, carbon footprint per block, chain history' },
  { path: '/fediverse',     mod: 'fediverseMod', description: 'multiverse, fediverse, mastodon, telegram, activitypub, external social networks, federated timeline, telegram chats and channels, cross-post, fediverse handle, follow external accounts' },
  { path: '/stats?filter=ALL',  mod: null, description: 'global stats, network kpis, total carbon footprint, total inhabitants, network size' },
  { path: '/stats?filter=MINE', mod: null, description: 'my stats, my carbon footprint, my activity numbers, personal kpis' },
  { path: '/tribes/create', mod: 'tribesMod',   description: 'create tribe, new tribe, new group, start community, create private room' },
  { path: '/chats',         mod: 'chatsMod',    description: 'create chat, new chat, start conversation, new encrypted room' },
  { path: '/pads',          mod: 'padsMod',     description: 'create pad, new pad, new collaborative document, start shared note' },
  { path: '/calendars',     mod: 'calendarsMod', description: 'create calendar, new calendar, start schedule' },
  { path: '/maps',          mod: 'mapsMod',     description: 'create map, new map, new offline map' },
  { path: '/events',        mod: 'eventsMod',   description: 'create event, new event, schedule meetup' },
  { path: '/projects',      mod: 'projectsMod', description: 'create project, new project, start crowdfunding' },
  { path: '/school?filter=create', mod: 'schoolMod', description: 'create course, new course, teach a class, offer lessons' },
  { path: '/industry?filter=CREATE', mod: 'industryMod', description: 'create facility, new factory, new workshop, found a cooperative, means of manufacturing' },
  { path: '/housing?filter=CREATE', mod: 'housingMod', description: 'publish a place, offer accommodation, list a home, new housing listing, host someone' },
  { path: '/jobs',          mod: 'jobsMod',     description: 'create job, post job offer, new vacancy, hire' },
  { path: '/market',        mod: 'marketMod',  description: 'create market item, sell something, new auction, list for sale' },
  { path: '/shops',         mod: 'shopsMod',    description: 'create shop, open store, new vendor, list products' },
  { path: '/tasks',         mod: 'tasksMod',    description: 'create task, new todo, new assignment' },
  { path: '/reports',       mod: 'reportsMod', description: 'create report, file bug, report issue, report abuse' }
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

const dedupeByPath = (list) => {
  const seen = new Set()
  const out = []
  for (const item of list) {
    if (seen.has(item.path)) continue
    seen.add(item.path)
    out.push(item)
  }
  return out
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
  return dedupeByPath(all).slice(0, Math.max(1, k|0))
}

const KEYWORD_STOPWORDS = new Set([
  'the', 'this', 'that', 'these', 'those', 'and', 'for', 'with', 'from', 'into', 'about', 'want', 'show', 'see', 'find', 'give', 'get', 'go', 'my', 'me', 'to', 'of', 'in', 'on', 'at', 'an', 'is', 'are', 'do', 'does',
  'week', 'year', 'month', 'today', 'tomorrow', 'now', 'next', 'last',
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'este', 'esta', 'esto', 'estos', 'estas', 'ese', 'esa', 'eso', 'que', 'quiero', 'ver', 'buscar', 'dame', 'ir', 'mi', 'mis', 'lo', 'se', 'al', 'en', 'con', 'para', 'por',
  'semana', 'mes', 'hoy', 'ahora', 'proximo', 'próximo', 'proxima', 'próxima', 'ultimo', 'último', 'ultima', 'última'
])

const resolveKeywordTopK = ({ isModuleEnabled } = {}, query, k = 8) => {
  let tokens = String(query || '').toLowerCase().split(/[^a-z0-9À-ſ]+/).filter(t => t && t.length >= 2)
  const meaningful = tokens.filter(t => !KEYWORD_STOPWORDS.has(t))
  if (meaningful.length) tokens = meaningful
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
  return dedupeByPath(all).slice(0, Math.max(1, k|0))
}

module.exports = { ROUTES, ensureIndex, resolveBest, resolveTopK, resolveKeywordTopK }
