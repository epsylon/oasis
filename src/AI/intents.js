const INTENTS = [
  { key: 'funds', description: 'my balance, how much ECO do I have, my wallet funds, my ECOin address', keywords: ['balance', 'saldo', 'funds', 'fondos', 'wallet', 'cartera', 'address', 'dirección', 'my ecoin', 'mi ecoin'] },
  { key: 'exchange', description: 'the value of one ECO, ECO price, ECOin exchange rate, how much is an ECO worth, ECO per hour, supply and inflation of ECOin', keywords: ['value of', 'valor de', 'eco value', 'ecoin value', 'valor del eco', 'price', 'precio', 'worth', 'vale un eco', 'cuánto vale', 'exchange', 'cotización', 'cambio', 'supply', 'suministro', 'inflation', 'inflación', 'eco/h', '1 eco', 'un eco'] },
  { key: 'ubi', description: 'my UBI, universal basic income, can I claim the UBI, when did I claim, how much UBI did I receive', keywords: ['ubi', 'rbu', 'basic income', 'renta básica', 'claim', 'reclamar', 'cobrar'] },
  { key: 'karma', description: 'my karma score, my taxes, eco tax, arch tax, engagement score', keywords: ['karma', 'tax', 'impuesto', 'engagement'] },
  { key: 'agenda', description: 'my agenda, what do I have coming up, upcoming dates, next days, schedule', keywords: ['agenda', 'schedule', 'próximo', 'upcoming', 'coming', 'esta semana', 'this week', 'calendar', 'calendario'] },
  { key: 'events', description: 'upcoming events, next event, events near me, what events are there', keywords: ['event', 'evento'] },
  { key: 'tasks', description: 'my open tasks, pending tasks, to-do, what do I have to do', keywords: ['task', 'tarea', 'to-do', 'todo', 'pendiente'] },
  { key: 'transfers', description: 'pending transfers, contracts waiting for my confirmation, payments to confirm', keywords: ['transfer', 'transferencia', 'contract', 'contrato', 'confirm', 'confirmar', 'payment', 'pago'] },
  { key: 'relationships', description: 'who follows me, who do I follow, my followers, my mutual contacts, friends', keywords: ['follow', 'sigue', 'seguidor', 'follower', 'mutual', 'friend', 'amigo', 'contacto'] },
  { key: 'inbox', description: 'my inbox, unread messages, private messages, notifications, mentions', keywords: ['inbox', 'unread', 'no leído', 'mensaje', 'message', 'pm', 'notification', 'notificación', 'mention', 'mención'] },
  { key: 'government', description: 'current government, parliament, who rules, governance cycle, LARP house', keywords: ['government', 'gobierno', 'parliament', 'parlamento', 'rules', 'gobierna', 'larp', 'house', 'casa'] },
  { key: 'emergencies', description: 'active emergencies, alerts, is there any emergency', keywords: ['emergency', 'emergencia', 'alert', 'alerta'] },
  { key: 'jobs', description: 'open job offers, jobs for me, work, salary', keywords: ['job', 'trabajo', 'empleo', 'offer', 'oferta', 'salary', 'salario', 'vacante'] },
  { key: 'market', description: 'items for sale in the market, second hand, auctions, what can I buy', keywords: ['market', 'mercado', 'buy', 'comprar', 'vender', 'item', 'auction', 'subasta'] },
  { key: 'tribes', description: 'my tribes, which tribes am I in, tribe members', keywords: ['tribe', 'tribu'] },
  { key: 'network', description: 'network status, inhabitants count, peers online, last sync, population', keywords: ['network', 'red', 'peer', 'inhabitant', 'habitante', 'population', 'población', 'online', 'sync', 'sincron'] },
  { key: 'me', description: 'who am I, my identity, my id, my name, my profile, oasis version', keywords: ['who am i', 'quién soy', 'my id', 'mi id', 'identity', 'identidad', 'profile', 'perfil', 'version', 'versión'] },
  { key: 'shops', description: 'products in the shops, what do the shops sell, shop catalogue, buy a product', keywords: ['shop', 'tienda', 'product', 'producto', 'catálogo', 'catalog'] },
  { key: 'school', description: 'courses in the school, lessons, my courses, enrol, learn, certificates', keywords: ['school', 'escuela', 'course', 'curso', 'lesson', 'lección', 'learn', 'aprender', 'certificate', 'certificado', 'student', 'estudiante'] },
  { key: 'projects', description: 'crowdfunding projects, projects looking for funding, pledges, project goals', keywords: ['project', 'proyecto', 'crowdfunding', 'pledge', 'aportación', 'financiar', 'funding'] },
  { key: 'housing', description: 'housing, places offered, rooms, homes, rent a place, accommodation', keywords: ['housing', 'vivienda', 'room', 'habitación', 'rent', 'alquil', 'accommodation', 'alojamiento'] },
  { key: 'industry', description: 'industry facilities, factories, builds, production, what is being built', keywords: ['industry', 'industria', 'facility', 'fábrica', 'factory', 'build', 'construir', 'production', 'producción'] },
  { key: 'campaigns', description: 'campaigns, petitions, signatures, collective demands', keywords: ['campaign', 'campaña', 'petition', 'petición', 'signature', 'firma', 'demand'] },
  { key: 'logistics', description: 'logistics routes, deliveries, transport, shipping, packages, bookings', keywords: ['logistic', 'logística', 'route', 'ruta', 'delivery', 'entrega', 'transport', 'envío', 'shipping', 'package', 'paquete'] },
  { key: 'calendars', description: 'calendars, dates, upcoming dates in my calendars, deadlines, reminders', keywords: ['calendar', 'calendario', 'date', 'fecha', 'deadline', 'recordatorio', 'reminder'] },
  { key: 'votes', description: 'votations, polls, open votes, voting, ballots, what can I vote on', keywords: ['vote', 'votación', 'votar', 'poll', 'encuesta', 'ballot', 'referendum'] },
  { key: 'wiki', description: 'wiki pages, knowledge base, documentation written by inhabitants', keywords: ['wiki'] },
  { key: 'chats', description: 'my chats, group chats, conversations, chat rooms', keywords: ['chat', 'conversación', 'sala'] },
  { key: 'mailing', description: 'mailing lists, subscriptions, newsletters, discussion lists', keywords: ['mailing', 'lista de correo', 'newsletter', 'subscri'] },
  { key: 'podcasts', description: 'podcasts, audio shows, episodes, radio', keywords: ['podcast', 'episode', 'episodio', 'radio'] },
  { key: 'media', description: 'audios, videos, images, documents, files, media library, how many files', keywords: ['audio', 'video', 'vídeo', 'image', 'imagen', 'photo', 'foto', 'document', 'documento', 'file', 'archivo', 'media', 'gallery', 'galería', 'torrent'] },
  { key: 'blogs', description: 'blogs, blog entries, articles, latest posts written by inhabitants', keywords: ['blog', 'entrada', 'article', 'artículo'] },
  { key: 'reports', description: 'reports, complaints, flagged content, incidents', keywords: ['report', 'reporte', 'denuncia', 'complaint', 'queja', 'flag', 'incident'] },
  { key: 'games', description: 'games, hall of fame, scores, best players, play', keywords: ['game', 'juego', 'play', 'jugar', 'score', 'puntuación', 'hall of fame', 'ranking'] },
  { key: 'tags', description: 'tags, hashtags, topics, most used tags, what is the network talking about', keywords: ['tag', 'etiqueta', 'hashtag', 'topic', 'tema', 'trending', 'tendencia'] },
  { key: 'favorites', description: 'my favorites, things I starred, saved items, bookmarks', keywords: ['favorite', 'favorito', 'starred', 'saved', 'guardado', 'bookmark', 'marcador'] },
  { key: 'modules', description: 'which modules are enabled, what features does this node have, oasis modules', keywords: ['module', 'módulo', 'feature', 'funcionalidad', 'enabled', 'activado', 'disabled', 'desactivado', 'plugin'] },
  { key: 'help', description: 'what can you do, help, how can you help me, what do you know, commands', keywords: ['what can you', 'qué puedes', 'help', 'ayuda', 'how can you', 'cómo puedes', 'what do you know', 'qué sabes', 'capabilities'] }
];

const KEYWORD_MIN = 1;
const EMBED_MIN = 0.55;
const EMBED_MARGIN = 0.05;

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const detectByKeywords = (question) => {
  const q = ' ' + norm(question) + ' ';
  let best = null;
  for (const it of INTENTS) {
    const hits = it.keywords.filter(k => q.includes(norm(k))).length;
    if (hits >= KEYWORD_MIN && (!best || hits > best.hits)) best = { key: it.key, hits };
  }
  return best ? best.key : null;
};

let intentVectors = null;
const detect = async (question, { embed, cosine } = {}) => {
  const byKeywords = detectByKeywords(question);
  if (byKeywords) return byKeywords;
  if (typeof embed !== 'function' || typeof cosine !== 'function') return null;
  const qv = await embed(question).catch(() => null);
  if (!qv) return null;
  if (!intentVectors) {
    const out = [];
    for (const it of INTENTS) { const v = await embed(it.description).catch(() => null); if (v) out.push({ key: it.key, v }); }
    intentVectors = out;
  }
  const scored = intentVectors.map(it => ({ key: it.key, s: cosine(qv, it.v) })).sort((a, b) => b.s - a.s);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.s < EMBED_MIN) return null;
  if (second && best.s - second.s < EMBED_MARGIN) return null;
  return best.key;
};

const fmtEco = (n) => `${Number(n || 0).toFixed(6)} ECO`;
const fmtDate = (d) => { const t = new Date(d || 0); return Number.isFinite(t.getTime()) && t.getTime() > 0 ? t.toISOString().replace('T', ' ').slice(0, 16) : ''; };
const titleOf = (c) => String(c.title || c.name || c.question || c.concept || c.subject || '').trim();
const dateOf = (c) => c.date || c.startTime || c.startDate || c.deadline || c.endTime || c.createdAt || null;
const line = (text, href) => ({ text, href: href || null });

const RUNNERS = {
  async funds({ models, me }) {
    const out = [];
    const data = await models.banking.listBanking('overview', me).catch(() => null);
    const summary = (data && data.summary) || {};
    const addr = await models.banking.getUserAddress(me).catch(() => null);
    if (summary.hasValidWallet) out.push(line(`Wallet balance: ${fmtEco(summary.userBalance)}`, '/wallet'));
    else out.push(line('Wallet: not connected (Settings › Wallet)', '/settings#wallet'));
    out.push(line(addr ? `ECOin address: ${addr}` : 'ECOin address: none published', '/banking?filter=addresses'));
    if (data && data.exchange && data.exchange.isSynced) out.push(line(`ECO value (1h): ${Number(data.exchange.ecoValue || 0).toFixed(4)} ECO`, '/banking?filter=exchange'));
    if (Number.isFinite(Number(summary.industryBalance)) && Number(summary.industryBalance) !== 0) out.push(line(`Industry balance: ${fmtEco(summary.industryBalance)}`, '/industry'));
    return out;
  },
  async exchange({ models, me }) {
    const data = await models.banking.listBanking('exchange', me).catch(() => null);
    const ex = (data && data.exchange) || {};
    if (!ex.isSynced) return [line('ECO value: unknown right now, the wallet is not synced with the ECOin network', '/banking?filter=exchange')];
    const hours = Number(ex.ecoTimeMs || 0) / 3600000;
    const out = [
      line(`Value of 1 ECO right now: ${Number(ex.ecoValue || 0).toFixed(4)} ECO per hour of UBI (1 ECO ≈ ${hours > 0 ? hours.toFixed(2) + ' hours' : 'n/a'})`, '/banking?filter=exchange'),
      line(`ECOin total supply: ${fmtEco(ex.totalSupply)} · current supply: ${fmtEco(ex.currentSupply)}`, '/banking?filter=exchange'),
      line(`Inflation: ${Number(ex.inflationFactor || 0).toFixed(2)}% annual · ${Number(ex.inflationMonthly || 0).toFixed(2)}% monthly`, '/banking?filter=exchange')
    ];
    if (ex.pubsSupply != null) out.push(line(`PUBs pool supply: ${fmtEco(ex.pubsSupply)}${ex.holdingSupply != null ? ` · holding supply: ${fmtEco(ex.holdingSupply)}` : ''}`, '/banking?filter=exchange'));
    return out;
  },
  async ubi({ models, me }) {
    const out = [];
    const data = await models.banking.listBanking('ubi', me).catch(() => null);
    const summary = (data && data.summary) || {};
    const bank = await models.banking.getBankingData(me).catch(() => ({}));
    if (summary.epochId) out.push(line(`Current epoch: ${summary.epochId}`, '/banking?filter=ubi'));
    if (summary.alreadyClaimed) out.push(line('This month: already claimed', '/banking?filter=ubi'));
    else if (summary.alreadyRefused) out.push(line('This month: refused', '/banking?filter=ubi'));
    else if (data && data.pendingUBI) out.push(line(`This month: ${fmtEco(data.pendingUBI.amount)} available to claim`, '/banking?filter=ubi'));
    else out.push(line(`This month: nothing to claim yet (${summary.ubiAvailability === 'NO_FUNDS' ? 'PUB without funds' : 'no allocation'})`, '/banking?filter=ubi'));
    if (bank.estimatedUBI != null) out.push(line(`Estimated UBI: ${fmtEco(bank.estimatedUBI)}`, '/banking?filter=ubi'));
    out.push(line(`Total received: ${fmtEco(bank.totalClaimed)}${bank.lastClaimedDate ? ` (last: ${fmtDate(bank.lastClaimedDate)})` : ''}`, '/banking?filter=ubi'));
    const pubs = Array.isArray(data && data.ubiPubs) ? data.ubiPubs : [];
    if (pubs.length) out.push(line(`PUBs announcing UBI: ${pubs.length}`, '/banking?filter=ubi'));
    return out;
  },
  async karma({ models, me }) {
    const bank = await models.banking.getBankingData(me).catch(() => ({}));
    return [
      line(`Karma score: ${Number(bank.karmaScore || 0).toFixed(2)}`, '/banking?filter=overview'),
      line(`ECOin tax: ${fmtEco(bank.userEcoinTax)} · ARCH tax: ${fmtEco(bank.userArchTax)} · total: ${fmtEco(bank.userTotalTax)}`, '/banking?filter=taxes'),
      line(`Estimated UBI after taxes: ${fmtEco(bank.estimatedUBI)}`, '/banking?filter=ubi')
    ];
  },
  async agenda({ models, hrefFor }) {
    const items = await models.agenda.listAgenda('all').catch(() => []);
    const now = Date.now();
    const soon = (Array.isArray(items) ? items : [])
      .map(it => ({ it, t: new Date(dateOf(it) || 0).getTime() }))
      .filter(x => Number.isFinite(x.t) && x.t >= now - 3600000)
      .sort((a, b) => a.t - b.t)
      .slice(0, 8);
    if (!soon.length) return [line('Agenda: nothing upcoming', '/agenda')];
    return soon.map(({ it, t }) => line(`${fmtDate(t)} · ${titleOf(it) || it.type || 'item'}${it.type ? ` (${it.type})` : ''}`, hrefFor(it.type, it.id || it.tipId)));
  },
  async events({ models, hrefFor }) {
    const events = await models.events.listAll(null, 'all').catch(() => []);
    const now = Date.now();
    const upcoming = (Array.isArray(events) ? events : [])
      .map(e => ({ e, t: new Date(e.date || 0).getTime() }))
      .filter(x => Number.isFinite(x.t) && x.t >= now - 3600000 && String(x.e.status || '').toUpperCase() !== 'CLOSED')
      .sort((a, b) => a.t - b.t).slice(0, 8);
    if (!upcoming.length) return [line('Events: none upcoming', '/events')];
    return upcoming.map(({ e, t }) => line(`${fmtDate(t)} · ${titleOf(e)}${e.location ? ` · ${e.location}` : ''}${Number(e.price) > 0 ? ` · ${fmtEco(e.price)}` : ''}`, hrefFor('event', e.id)));
  },
  async tasks({ models, me, hrefFor }) {
    const tasks = await models.tasks.listAll().catch(() => []);
    const mine = (Array.isArray(tasks) ? tasks : []).filter(t => String(t.status || '').toUpperCase() === 'OPEN' && (t.author === me || (Array.isArray(t.assignees) && t.assignees.includes(me))));
    if (!mine.length) return [line('Tasks: nothing open assigned to you', '/tasks')];
    return mine.slice(0, 10).map(t => line(`${titleOf(t)}${t.endTime ? ` · due ${fmtDate(t.endTime)}` : ''}`, hrefFor('task', t.id)));
  },
  async transfers({ models, me, hrefFor }) {
    const all = await models.transfers.listAll('all').catch(() => []);
    const pending = (Array.isArray(all) ? all : []).filter(t => String(t.status || '').toUpperCase() === 'UNCONFIRMED' && (t.to === me || t.from === me) && !(Array.isArray(t.confirmedBy) && t.confirmedBy.includes(me)));
    if (!pending.length) return [line('Transfers: nothing waiting for your confirmation', '/transfers?filter=pending')];
    return pending.slice(0, 10).map(t => line(`${fmtEco(t.amount)} · ${t.concept || t.id} · ${t.from === me ? 'to' : 'from'} ${t.from === me ? t.to : t.from}`, hrefFor('transfer', t.id)));
  },
  async relationships({ models, me }) {
    const users = await models.inhabitants.listInhabitants({ filter: 'all', includeInactive: true }).catch(() => []);
    const followers = [], following = [], mutuals = [];
    for (const u of (Array.isArray(users) ? users : []).slice(0, 400)) {
      if (!u || !u.id || u.id === me) continue;
      const rel = await models.friend.getRelationship(u.id).catch(() => null);
      if (!rel) continue;
      const name = u.name || u.id.slice(0, 9);
      if (rel.following && rel.followsMe) mutuals.push(name);
      else if (rel.following) following.push(name);
      else if (rel.followsMe) followers.push(name);
    }
    const list = (arr) => arr.slice(0, 12).join(', ') + (arr.length > 12 ? '…' : '');
    return [
      line(`Mutual contacts: ${mutuals.length}${mutuals.length ? ` · ${list(mutuals)}` : ''}`, '/inhabitants?filter=mutuals'),
      line(`You follow: ${following.length + mutuals.length}${following.length ? ` · also ${list(following)}` : ''}`, '/inhabitants?filter=following'),
      line(`Follow you: ${followers.length + mutuals.length}${followers.length ? ` · also ${list(followers)}` : ''}`, '/inhabitants?filter=followers')
    ];
  },
  async inbox({ sharedState }) {
    return [
      line(`Unread private messages: ${Number(sharedState.getInboxPmCount ? sharedState.getInboxPmCount() : 0) || 0}`, '/inbox?filter=pms'),
      line(`Unread bot notifications: ${Number(sharedState.getInboxNotifCount ? sharedState.getInboxNotifCount() : 0) || 0}`, '/inbox?filter=notifications'),
      line(`Unread mentions: ${Number(sharedState.getMentionsCount ? sharedState.getMentionsCount() : 0) || 0}`, '/mentions')
    ];
  },
  async government({ models, me, nameOf }) {
    const out = [];
    const card = await models.parliament.getLatestGovernmentCard().catch(() => null);
    if (card) {
      const leader = card.leaderId ? await nameOf(card.leaderId) : '';
      out.push(line(`Government: ${String(card.method || '').toUpperCase()}${leader ? ` · leader ${leader}` : ''}${card.end ? ` · cycle ends ${fmtDate(card.end)}` : ''}`, '/parliament'));
    } else out.push(line('Government: no cycle published yet', '/parliament'));
    if (models.larp && typeof models.larp.getUserHouse === 'function') {
      const house = await models.larp.getUserHouse(me).catch(() => null);
      if (house) out.push(line(`Your LARP house: ${house}`, '/larp'));
    }
    return out;
  },
  async emergencies({ models, me, hrefFor }) {
    const all = await models.emergencies.listAll({ filter: 'all', viewerId: me }).catch(() => []);
    const active = (Array.isArray(all) ? all : []).filter(e => String(e.status || '').toUpperCase() !== 'RESOLVED').slice(0, 8);
    if (!active.length) return [line('Emergencies: none active', '/emergencies')];
    return active.map(e => line(`${titleOf(e)}${e.status ? ` · ${e.status}` : ''}`, hrefFor('emergency', e.id)));
  },
  async jobs({ models, me, hrefFor }) {
    const jobs = await models.jobs.listJobs('ALL', me).catch(() => []);
    const open = (Array.isArray(jobs) ? jobs : []).filter(j => String(j.status || 'OPEN').toUpperCase() !== 'CLOSED').slice(0, 8);
    if (!open.length) return [line('Jobs: no open offers', '/jobs')];
    return open.map(j => line(`${titleOf(j)}${Number(j.salary) > 0 ? ` · ${fmtEco(j.salary)}` : ''}`, hrefFor('job', j.id)));
  },
  async market({ models, hrefFor }) {
    const items = await models.market.listAllItems('all').catch(() => []);
    const forSale = (Array.isArray(items) ? items : []).filter(i => String(i.status || '').toUpperCase() === 'FOR SALE' || String(i.status || '').toUpperCase() === 'OPEN' || !i.status).slice(0, 8);
    if (!forSale.length) return [line('Market: nothing for sale right now', '/market')];
    return forSale.map(i => line(`${titleOf(i)}${i.price != null ? ` · ${fmtEco(i.price)}` : ''}`, hrefFor('market', i.id)));
  },
  async tribes({ models, me, hrefFor }) {
    const all = await models.tribes.listAll().catch(() => []);
    const mine = (Array.isArray(all) ? all : []).filter(t => Array.isArray(t.members) && t.members.includes(me));
    if (!mine.length) return [line('Tribes: you are not in any tribe', '/tribes')];
    return mine.slice(0, 10).map(t => line(`${titleOf(t)} · ${t.members.length} members`, hrefFor('tribe', t.id)));
  },
  async network({ sharedState }) {
    const ts = sharedState.getLastSyncTs ? sharedState.getLastSyncTs() : null;
    return [
      line(`Inhabitants: ${Number(sharedState.getInhabitantCount ? sharedState.getInhabitantCount() : 0) || 0}`, '/inhabitants'),
      line(`Tribes: ${Number(sharedState.getTribesCount ? sharedState.getTribesCount() : 0) || 0}`, '/tribes'),
      line(`Peers online: ${Number(sharedState.getOnlinePeerCount ? sharedState.getOnlinePeerCount() : 0) || 0}`, '/peers'),
      line(`Last sync: ${ts ? fmtDate(ts) : 'never'}`, '/peers'),
      line(`ECO value (1h): ${sharedState.getEcoValue && sharedState.getEcoValue() ? sharedState.getEcoValue() + ' ECO' : 'unknown (wallet not synced)'}`, '/banking?filter=exchange')
    ];
  },
  async me({ me, nameOf, version }) {
    const name = await nameOf(me);
    return [
      line(`You are ${name} (${me})`, '/profile'),
      line(`Oasis version: ${version || 'unknown'}`, '/settings')
    ];
  }
};

const listOf = (x) => Array.isArray(x) ? x : (x && Array.isArray(x.items) ? x.items : []);
const isOpen = (x) => { const s = String(x && x.status || 'OPEN').toUpperCase(); return !['CLOSED', 'RESOLVED', 'EXPIRED', 'DISSOLVED', 'CANCELLED', 'DELETED'].includes(s); };
const few = (arr, n = 8) => arr.slice(0, n);

Object.assign(RUNNERS, {
  async shops({ models, hrefFor }) {
    const items = listOf(await models.shops.listAllProducts({ filter: 'all' }).catch(() => []));
    const open = few(items.filter(isOpen));
    if (!open.length) return [line('Shops: no products on sale right now', '/shops')];
    return open.map(p => line(`${titleOf(p)}${p.price != null ? ` · ${fmtEco(p.price)}` : ''}${Number(p.stock) > 0 ? ` · stock ${p.stock}` : ''}`, hrefFor('shopProduct', p.id || p.key)));
  },
  async school({ models, me, hrefFor }) {
    const courses = listOf(await models.school.listCourses('ALL', me, {}).catch(() => []));
    const mine = courses.filter(c => c.author === me || (Array.isArray(c.students) && c.students.includes(me)));
    const open = few(courses.filter(isOpen));
    const out = [line(`School: ${courses.length} courses, ${mine.length} of them yours (teaching or enrolled)`, '/school')];
    return out.concat(open.map(c => line(`${titleOf(c)}${Number(c.price) > 0 ? ` · ${fmtEco(c.price)}` : ' · free'}${Array.isArray(c.students) ? ` · ${c.students.length} students` : ''}`, hrefFor('schoolCourse', c.id))));
  },
  async projects({ models, hrefFor }) {
    const projects = listOf(await models.projects.listProjects('all', {}).catch(() => []));
    const open = few(projects.filter(isOpen));
    if (!open.length) return [line('Projects: none looking for funding right now', '/projects')];
    return open.map(p => line(`${titleOf(p)}${p.goal != null ? ` · goal ${fmtEco(p.goal)}` : ''}${p.pledged != null ? ` · pledged ${fmtEco(p.pledged)}` : ''}${p.deadline ? ` · until ${fmtDate(p.deadline)}` : ''}`, hrefFor('project', p.id)));
  },
  async housing({ models, me, hrefFor }) {
    const items = listOf(await models.housing.listHousing('ALL', me, {}).catch(() => []));
    const open = few(items.filter(isOpen));
    if (!open.length) return [line('Housing: no places offered right now', '/housing')];
    return open.map(h => line(`${titleOf(h)}${h.price != null ? ` · ${fmtEco(h.price)}` : ''}${h.location ? ` · ${h.location}` : ''}`, hrefFor('housing', h.id)));
  },
  async industry({ models, me, hrefFor }) {
    const facilities = listOf(await models.industry.listFacilities('ALL').catch(() => []));
    const mine = facilities.filter(f => Array.isArray(f.members) && f.members.includes(me));
    const out = [line(`Industry: ${facilities.length} facilities, you belong to ${mine.length}`, '/industry')];
    return out.concat(few(facilities.filter(isOpen)).map(f => line(`${titleOf(f)}${Array.isArray(f.members) ? ` · ${f.members.length} members` : ''}`, hrefFor('industry', f.id))));
  },
  async campaigns({ models, me, hrefFor }) {
    const items = listOf(await models.campaigns.listAll({ filter: 'all', viewerId: me }).catch(() => []));
    const open = few(items.filter(isOpen));
    if (!open.length) return [line('Campaigns: none open right now', '/campaigns')];
    return open.map(c => line(`${titleOf(c)}${Array.isArray(c.signers) ? ` · ${c.signers.length} signatures` : ''}${c.goal ? ` of ${c.goal}` : ''}`, hrefFor('campaign', c.id)));
  },
  async logistics({ models, hrefFor }) {
    const routes = listOf(await models.logistics.listAll({ filter: 'all' }).catch(() => []));
    const open = few(routes.filter(isOpen));
    if (!open.length) return [line('Logistics: no open routes right now', '/logistics')];
    return open.map(r => line(`${titleOf(r)}${r.price != null && Number(r.price) > 0 ? ` · ${Number(r.price)} ${r.priceType === 'TIME' ? 'h' : 'ECO'}` : ''}${r.status ? ` · ${r.status}` : ''}`, hrefFor('logisticsRoute', r.id)));
  },
  async calendars({ models, me, hrefFor }) {
    const cals = listOf(await models.calendars.listAll({ filter: 'all', viewerId: me }).catch(() => []));
    if (!cals.length) return [line('Calendars: you are not in any calendar', '/calendars')];
    const now = Date.now();
    const soon = cals.map(c => ({ c, t: new Date(dateOf(c) || 0).getTime() })).filter(x => Number.isFinite(x.t) && x.t >= now - 3600000).sort((a, b) => a.t - b.t);
    const out = [line(`Calendars: ${cals.length}`, '/calendars')];
    return out.concat(few(soon).map(({ c, t }) => line(`${fmtDate(t)} · ${titleOf(c)}`, hrefFor('calendar', c.id))));
  },
  async votes({ models, hrefFor }) {
    const votes = listOf(await models.votes.listAll('all').catch(() => []));
    const polls = listOf(await models.polls.listAll('ALL', {}).catch(() => []));
    const openV = few(votes.filter(isOpen), 5);
    const openP = few(polls.filter(isOpen), 5);
    if (!openV.length && !openP.length) return [line('Votes: nothing open to vote on right now', '/votes')];
    return openV.map(v => line(`Votation: ${titleOf(v)}${v.deadline ? ` · until ${fmtDate(v.deadline)}` : ''}`, hrefFor('vote', v.id)))
      .concat(openP.map(p => line(`Poll: ${titleOf(p)}`, hrefFor('poll', p.id))));
  },
  async wiki({ models, me, hrefFor }) {
    const pages = listOf(await models.wiki.listPages({ viewerId: me }).catch(() => []));
    if (!pages.length) return [line('Wiki: no pages yet', '/wiki')];
    const out = [line(`Wiki: ${pages.length} pages`, '/wiki')];
    return out.concat(few(pages, 6).map(p => line(titleOf(p), hrefFor('wikiPage', p.id || p.slug))));
  },
  async chats({ models, me, hrefFor }) {
    const chats = listOf(await models.chats.listAll({ filter: 'all', viewerId: me }).catch(() => []));
    const mine = chats.filter(c => c.author === me || (Array.isArray(c.members) && c.members.includes(me)) || (Array.isArray(c.participants) && c.participants.includes(me)));
    if (!mine.length) return [line('Chats: you are not in any chat', '/chats')];
    return few(mine).map(c => line(`${titleOf(c)}${Array.isArray(c.members) ? ` · ${c.members.length} members` : ''}`, hrefFor('chat', c.key || c.id)));
  },
  async mailing({ models, hrefFor }) {
    const lists = listOf(await models.mailing.listAll({ filter: 'all' }).catch(() => []));
    const active = few(lists.filter(l => String(l.status || 'ACTIVE').toUpperCase() === 'ACTIVE'));
    if (!active.length) return [line('Mailing lists: none active', '/mailing')];
    return active.map(l => line(`${titleOf(l)}${Array.isArray(l.subscribers) ? ` · ${l.subscribers.length} subscribers` : ''}`, hrefFor('mailingList', l.id)));
  },
  async podcasts({ models, me, hrefFor }) {
    const channels = listOf(await models.podcasts.listAll({ filter: 'all', viewerId: me }).catch(() => []));
    if (!channels.length) return [line('Podcasts: none yet', '/podcasts')];
    return few(channels).map(c => line(`${titleOf(c)}${Array.isArray(c.episodes) ? ` · ${c.episodes.length} episodes` : ''}`, hrefFor('podcast', c.id)));
  },
  async media({ models }) {
    const count = async (m) => m && typeof m.listAll === 'function' ? listOf(await m.listAll('all').catch(() => [])).length : 0;
    const [audios, videos, images, documents, torrents] = await Promise.all([count(models.audios), count(models.videos), count(models.images), count(models.documents), count(models.torrents)]);
    return [
      line(`Audios: ${audios}`, '/audios'), line(`Videos: ${videos}`, '/videos'), line(`Images: ${images}`, '/images'),
      line(`Documents: ${documents}`, '/documents'), line(`Torrents: ${torrents}`, '/torrents')
    ];
  },
  async blogs({ models }) {
    const blogs = listOf(await models.blog.listAll('all').catch(() => []));
    if (!blogs.length) return [line('Blogs: no entries yet', '/blogs')];
    const latest = blogs.slice().sort((a, b) => new Date(dateOf(b) || 0) - new Date(dateOf(a) || 0));
    return [line(`Blogs: ${blogs.length} entries`, '/blogs')].concat(few(latest, 6).map(b => line(`${titleOf(b) || 'Untitled'}${dateOf(b) ? ` · ${fmtDate(dateOf(b))}` : ''}`, b.key || b.id ? `/blogs/${encodeURIComponent(b.key || b.id)}` : '/blogs')));
  },
  async reports({ models, hrefFor }) {
    const reports = listOf(await models.reports.listAll().catch(() => []));
    const open = few(reports.filter(isOpen));
    if (!open.length) return [line('Reports: none open', '/reports')];
    return open.map(r => line(`${titleOf(r)}${r.status ? ` · ${r.status}` : ''}`, hrefFor('report', r.id)));
  },
  async games({ models, nameOf }) {
    const hall = listOf(await models.games.getHallOfFame().catch(() => []));
    if (!hall.length) return [line('Games: no scores yet', '/games')];
    const out = [];
    for (const h of few(hall, 6)) out.push(line(`${h.game || 'game'} · ${await nameOf(h.author)} · ${h.score != null ? h.score : ''}`, '/games'));
    return out;
  },
  async tags({ models }) {
    const tags = listOf(await models.tags.listTags('all', '').catch(() => []));
    if (!tags.length) return [line('Tags: none yet', '/tags')];
    const top = tags.slice().sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
    return [line(`Tags in use: ${tags.length}`, '/tags')].concat(few(top, 10).map(t => line(`#${t.name || t.tag || t.id || t}${t.count != null ? ` · ${t.count}` : ''}`, `/tags/${encodeURIComponent(String(t.name || t.tag || t.id || t))}`)));
  },
  async favorites({ models }) {
    const res = await models.favorites.listAll({}).catch(() => null);
    const counts = res && res.counts && typeof res.counts === 'object' ? res.counts : {};
    const keys = Object.keys(counts).filter(k => Number(counts[k]) > 0);
    if (!keys.length) return [line('Favorites: nothing starred yet', '/favorites')];
    return keys.map(k => line(`${k}: ${counts[k]}`, `/favorites?filter=${encodeURIComponent(k)}`));
  },
  async modules({ config }) {
    const mods = (config && config.modules) || {};
    const on = Object.keys(mods).filter(k => k.endsWith('Mod') && mods[k] === 'on').map(k => k.slice(0, -3));
    const off = Object.keys(mods).filter(k => k.endsWith('Mod') && mods[k] !== 'on').map(k => k.slice(0, -3));
    return [line(`Enabled modules (${on.length}): ${on.join(', ')}`, '/modules'), line(`Disabled modules (${off.length}): ${off.join(', ') || 'none'}`, '/modules')];
  },
  async help() {
    return [
      line('I answer from the live data of this node: your funds and ECO value, your UBI and karma, your agenda, events, tasks, transfers, who follows you, your inbox and mentions, the government, emergencies, jobs, market, shops, school, projects, housing, industry, campaigns, logistics, calendars, votes, wiki, chats, mailing lists, podcasts, media, blogs, reports, games, tags, favorites, the modules and the network status.', '/ai'),
      line('Anything else I answer with the model, helped by the answers the network approved. Rate my answers with the stars so they are shared and I learn.', '/ai')
    ];
  }
});

const run = async (key, deps) => {
  const runner = RUNNERS[key];
  if (!runner) return null;
  try { return await runner(deps); } catch (_) { return null; }
};

module.exports = { INTENTS, detect, detectByKeywords, run, RUNNERS };
