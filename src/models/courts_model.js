const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { getConfig } = require('../configs/config-manager.js');

const logLimit = getConfig().ssbLogStream?.limit || 1000;
const CASE_ANSWER_DAYS = 7;
const CASE_EVIDENCE_DAYS = 14;
const CASE_DECISION_DAYS = 21;
const POPULAR_DAYS = 14;
const FEED_ID_RE = /^@.+\.ed25519$/;

module.exports = ({ cooler, services = {} }) => {
  let ssb;
  let userId;

  const openSsb = async () => {
    if (!ssb) {
      ssb = await cooler.open();
      userId = ssb.id;
    }
    return ssb;
  };

  const nowISO = () => new Date().toISOString();
  const ensureArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

  async function readLog() {
    const ssbClient = await openSsb();
    return new Promise((resolve, reject) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, arr) => (err ? reject(err) : resolve(arr)))
      );
    });
  }

  async function listByType(type) {
    const msgs = await readLog();
    const tomb = new Set();
    const rep = new Map();
    const map = new Map();
    for (const m of msgs) {
      const k = m.key || m.id;
      const c = m.value?.content || m.content;
      if (!c) continue;
      if (c.type === 'tombstone' && c.target) tomb.add(c.target);
      if (c.type === type) {
        if (c.replaces) rep.set(c.replaces, k);
        map.set(k, { id: k, ...c });
      }
    }
    for (const oldId of rep.keys()) map.delete(oldId);
    for (const tId of tomb) map.delete(tId);
    return [...map.values()];
  }

  async function getCurrentUserId() {
    await openSsb();
    return userId;
  }

  async function resolveRespondent(candidateInput) {
    const s = String(candidateInput || '').trim();
    if (!s) return null;
    if (FEED_ID_RE.test(s)) {
      return { type: 'inhabitant', id: s };
    }
    if (services.tribes && services.tribes.getTribeById) {
      try {
        const t = await services.tribes.getTribeById(s);
        if (t && t.id) return { type: 'tribe', id: t.id };
      } catch {}
    }
    return null;
  }

  function computeDeadlines(openedAt) {
    const answerBy = moment(openedAt).add(CASE_ANSWER_DAYS, 'days').toISOString();
    const evidenceBy = moment(openedAt).add(CASE_EVIDENCE_DAYS, 'days').toISOString();
    const decisionBy = moment(openedAt).add(CASE_DECISION_DAYS, 'days').toISOString();
    return { answerBy, evidenceBy, decisionBy };
  }

  async function openCase({ titleBase, respondentInput, method }) {
    const ssbClient = await openSsb();
    const rawTitle = String(titleBase || '').trim();
    if (!rawTitle) throw new Error('Title is required.');
    const resp = await resolveRespondent(respondentInput);
    if (!resp) throw new Error('Accused / Respondent not found.');
    const m = String(method || '').trim().toUpperCase();
    const ALLOWED = new Set(['JUDGE', 'DICTATOR', 'POPULAR', 'MEDIATION', 'KARMATOCRACY']);
    if (!ALLOWED.has(m)) throw new Error('Invalid resolution method.');
    if (m === 'DICTATOR' && services.parliament && services.parliament.getGovernmentCard) {
      try {
        const gov = await services.parliament.getGovernmentCard();
        const gm = String(gov && gov.method ? gov.method : '').toUpperCase();
        if (gm !== 'DICTATORSHIP') throw new Error('DICTATOR method requires DICTATORSHIP government.');
      } catch (e) {
        throw new Error('Unable to verify government method for DICTATOR.');
      }
    }
    const openedAt = nowISO();
    const prefix = moment(openedAt).format('MM/YYYY') + '_';
    const title = prefix + rawTitle;
    const { answerBy, evidenceBy, decisionBy } = computeDeadlines(openedAt);
    const content = {
      type: 'courtsCase',
      title,
      accuser: userId,
      respondentType: resp.type,
      respondentId: resp.id,
      method: m,
      status: 'OPEN',
      openedAt,
      answerBy,
      evidenceBy,
      decisionBy,
      mediatorsAccuser: [],
      mediatorsRespondent: [],
      createdAt: openedAt
    };
    return await new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
  }

  async function listCases(filter = 'open') {
    const all = await listByType('courtsCase');
    const sorted = all.sort((a, b) => {
      const ta = new Date(a.openedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.openedAt || b.createdAt || 0).getTime();
      return tb - ta;
    });
    if (filter === 'open') {
      return sorted.filter((c) => {
        const s = String(c.status || '').toUpperCase();
        return s !== 'DECIDED' && s !== 'CLOSED' && s !== 'SOLVED' && s !== 'UNSOLVED' && s !== 'DISCARDED';
      });
    }
    if (filter === 'history') {
      return sorted.filter((c) => {
        const s = String(c.status || '').toUpperCase();
        return s === 'DECIDED' || s === 'CLOSED' || s === 'SOLVED' || s === 'UNSOLVED' || s === 'DISCARDED';
      });
    }
    return sorted;
  }

  async function listCasesForUser(uid) {
    const all = await listByType('courtsCase');
    const id = String(uid || userId || '');
    const rows = [];
    for (const c of all) {
      const isAccuser = String(c.accuser || '') === id;
      const isRespondent = String(c.respondentId || '') === id;
      const ma = ensureArray(c.mediatorsAccuser || []);
      const mr = ensureArray(c.mediatorsRespondent || []);
      const isMediator = ma.includes(id) || mr.includes(id);
      const isJudge = String(c.judgeId || '') === id;
      const isDictator = false;
      const mine = isAccuser || isRespondent || isMediator || isJudge || isDictator;
      if (!mine) continue;
      let myPublicPreference = null;
      if (isAccuser && typeof c.publicPrefAccuser === 'boolean') {
        myPublicPreference = c.publicPrefAccuser;
      } else if (isRespondent && typeof c.publicPrefRespondent === 'boolean') {
        myPublicPreference = c.publicPrefRespondent;
      }
      rows.push({
        ...c,
        respondent: c.respondentId || c.respondent,
        isAccuser,
        isRespondent,
        isMediator,
        isJudge,
        isDictator,
        mine,
        myPublicPreference
      });
    }
    rows.sort((a, b) => {
      const ta = new Date(a.openedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.openedAt || b.createdAt || 0).getTime();
      return tb - ta;
    });
    return rows;
  }

  async function getCaseById(caseId) {
    const id = String(caseId || '').trim();
    if (!id) return null;
    const all = await listByType('courtsCase');
    return all.find((c) => c.id === id) || null;
  }

  async function upsertCase(obj) {
    const ssbClient = await openSsb();
    const { id, ...rest } = obj;
    const updated = {
      ...rest,
      type: 'courtsCase',
      replaces: id,
      updatedAt: nowISO()
    };
    return await new Promise((resolve, reject) =>
      ssbClient.publish(updated, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
  }

  function getCaseRole(caseObj, uid) {
    const id = String(uid || '');
    if (!id) return 'OTHER';
    if (String(caseObj.accuser || '') === id) return 'ACCUSER';
    if (String(caseObj.respondentId || '') === id) return 'DEFENCE';
    const ma = ensureArray(caseObj.mediatorsAccuser || []);
    const mr = ensureArray(caseObj.mediatorsRespondent || []);
    if (ma.includes(id) || mr.includes(id)) return 'MEDIATOR';
    if (String(caseObj.judgeId || '') === id) return 'JUDGE';
    return 'OTHER';
  }

  async function setMediators({ caseId, side, mediators }) {
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    const role = side === 'accuser' ? 'ACCUSER' : side === 'respondent' ? 'DEFENCE' : null;
    if (!role) throw new Error('Invalid side.');
    const myRole = getCaseRole(c, userId);
    if (role === 'ACCUSER' && myRole !== 'ACCUSER') throw new Error('Only accuser can set these mediators.');
    if (role === 'DEFENCE' && myRole !== 'DEFENCE') throw new Error('Only defence can set these mediators.');
    const list = Array.from(
      new Set(
        ensureArray(mediators || [])
          .map((x) => String(x || '').trim())
          .filter(Boolean)
      )
    );
    const clean = list.filter((id) => id !== c.accuser && id !== c.respondentId);
    if (side === 'accuser') c.mediatorsAccuser = clean;
    else c.mediatorsRespondent = clean;
    await upsertCase(c);
    return c;
  }

  async function assignJudge({ caseId, judgeId }) {
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    const m = String(c.method || '').toUpperCase();
    if (m !== 'JUDGE') throw new Error('This case does not use a judge.');
    const myRole = getCaseRole(c, userId);
    if (myRole !== 'ACCUSER' && myRole !== 'DEFENCE') throw new Error('Only parties can assign a judge.');
    const id = String(judgeId || '').trim();
    if (!id) throw new Error('Judge ID is required.');
    if (!FEED_ID_RE.test(id)) throw new Error('Invalid judge ID.');
    if (id === String(c.accuser || '') || id === String(c.respondentId || '')) {
      throw new Error('Judge cannot be a party of the case.');
    }
    c.judgeId = id;
    await upsertCase(c);
    return c;
  }

  async function addEvidence({ caseId, text, link, imageMarkdown }) {
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    const role = getCaseRole(c, userId);
    if (role === 'OTHER') throw new Error('You are not involved in this case.');
    const t = String(text || '').trim();
    const l = String(link || '').trim();
    let imageUrl = null;
    if (imageMarkdown) {
      const match = imageMarkdown.match(/\(([^)]+)\)/);
      imageUrl = match ? match[1] : imageMarkdown;
    }
    if (!t && !l && !imageUrl) throw new Error('Text, link or image is required.');
    const ssbClient = await openSsb();
    const content = {
      type: 'courtsEvidence',
      caseId: c.id,
      author: userId,
      role,
      text: t,
      link: l,
      imageUrl,
      createdAt: nowISO()
    };
    return await new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
  }

  async function answerCase({ caseId, stance, text }) {
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    if (String(c.respondentId || '') !== String(userId || '')) throw new Error('Only the respondent can answer.');
    const s = String(stance || '').trim().toUpperCase();
    const ALLOWED = new Set(['DENY', 'ADMIT', 'PARTIAL']);
    if (!ALLOWED.has(s)) throw new Error('Invalid stance.');
    const t = String(text || '').trim();
    if (!t) throw new Error('Response text is required.');
    const ssbClient = await openSsb();
    const content = {
      type: 'courtsAnswer',
      caseId: c.id,
      respondent: userId,
      stance: s,
      text: t,
      createdAt: nowISO()
    };
    await new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
    c.status = 'IN_PROGRESS';
    c.answeredAt = nowISO();
    await upsertCase(c);
    return c;
  }

  async function issueVerdict({ caseId, result, orders }) {
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    const involved =
      String(c.accuser || '') === String(userId || '') ||
      String(c.respondentId || '') === String(userId || '') ||
      ensureArray(c.mediatorsAccuser || []).includes(userId) ||
      ensureArray(c.mediatorsRespondent || []).includes(userId);
    if (involved) throw new Error('You cannot be judge and party in the same case.');
    const r = String(result || '').trim();
    if (!r) throw new Error('Result is required.');
    const o = String(orders || '').trim();
    const ssbClient = await openSsb();
    const content = {
      type: 'courtsVerdict',
      caseId: c.id,
      judgeId: userId,
      result: r,
      orders: o,
      createdAt: nowISO()
    };
    await new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
    c.status = 'DECIDED';
    c.verdictAt = nowISO();
    c.judgeId = userId;
    await upsertCase(c);
    return c;
  }

  async function proposeSettlement({ caseId, terms }) {
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    const role = getCaseRole(c, userId);
    if (role === 'OTHER') throw new Error('You are not involved in this case.');
    const t = String(terms || '').trim();
    if (!t) throw new Error('Terms are required.');
    const ssbClient = await openSsb();
    const content = {
      type: 'courtsSettlementProposal',
      caseId: c.id,
      proposer: userId,
      terms: t,
      createdAt: nowISO()
    };
    return await new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
  }

  async function acceptSettlement({ caseId }) {
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    const role = getCaseRole(c, userId);
    if (role !== 'ACCUSER' && role !== 'DEFENCE') throw new Error('Only parties can accept a settlement.');
    const ssbClient = await openSsb();
    const content = {
      type: 'courtsSettlementAccepted',
      caseId: c.id,
      by: userId,
      createdAt: nowISO()
    };
    await new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
    c.status = 'CLOSED';
    c.closedAt = nowISO();
    await upsertCase(c);
    return c;
  }

  async function setPublicPreference({ caseId, preference }) {
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    const id = String(userId || '');
    const pref = !!preference;
    if (String(c.accuser || '') === id) {
      c.publicPrefAccuser = pref;
    } else if (String(c.respondentId || '') === id) {
      c.publicPrefRespondent = pref;
    } else {
      throw new Error('Only parties can set visibility preference.');
    }
    await upsertCase(c);
    return c;
  }

  async function openPopularVote({ caseId }) {
    if (!services.votes || !services.votes.createVote) throw new Error('Votes service not available.');
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    const m = String(c.method || '').toUpperCase();
    if (m !== 'POPULAR' && m !== 'KARMATOCRACY') throw new Error('This case does not use public voting.');
    if (c.voteId) throw new Error('Vote already opened.');
    const question = c.title || `Case ${caseId}`;
    const deadline = moment().add(POPULAR_DAYS, 'days').toISOString();
    const voteMsg = await services.votes.createVote(
      question,
      deadline,
      ['YES', 'NO', 'ABSTENTION'],
      [`courtsCase:${caseId}`, `courtsMethod:${m}`]
    );
    c.voteId = voteMsg.key || voteMsg.id;
    await upsertCase(c);
    return c;
  }

  async function getInhabitantKarma(feedId) {
    if (services.banking && services.banking.getUserEngagementScore) {
      try {
        const v = await services.banking.getUserEngagementScore(feedId);
        return Number(v || 0) || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  async function getFirstUserTimestamp(feedId) {
    const ssbClient = await openSsb();
    return new Promise((resolve) => {
      pull(
        ssbClient.createUserStream({ id: feedId, reverse: false }),
        pull.filter((m) => m && m.value && m.value.content && m.value.content.type !== 'tombstone'),
        pull.take(1),
        pull.collect((err, arr) => {
          if (err || !arr || !arr.length) return resolve(Date.now());
          const m = arr[0];
          const ts = (m.value && m.value.timestamp) || m.timestamp || Date.now();
          resolve(ts < 1e12 ? ts * 1000 : ts);
        })
      );
    });
  }

  async function nominateJudge({ judgeId }) {
    const id = String(judgeId || '').trim();
    if (!id) throw new Error('Judge ID is required.');
    if (!FEED_ID_RE.test(id)) throw new Error('Invalid judge ID.');
    const ssbClient = await openSsb();
    const content = {
      type: 'courtsNomination',
      judgeId: id,
      createdAt: nowISO()
    };
    return await new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
  }

  async function voteNomination(nominationId) {
    const id = String(nominationId || '').trim();
    if (!id) throw new Error('Nomination not found.');
    const nominations = await listByType('courtsNomination');
    const nomination = nominations.find((n) => n.id === id);
    if (!nomination) throw new Error('Nomination not found.');
    if (String(nomination.judgeId || '') === String(userId || '')) {
      throw new Error('You cannot vote for yourself.');
    }
    const votes = await listByType('courtsNominationVote');
    const already = votes.find(
      (v) =>
        String(v.nominationId || '') === id &&
        String(v.voter || '') === String(userId || '')
    );
    if (already) throw new Error('You have already voted.');
    const ssbClient = await openSsb();
    const content = {
      type: 'courtsNominationVote',
      nominationId: id,
      voter: userId,
      createdAt: nowISO()
    };
    return await new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
  }

  async function listNominations() {
    const nominations = await listByType('courtsNomination');
    const votes = await listByType('courtsNominationVote');
    const byId = new Map();
    for (const n of nominations) {
      byId.set(n.id, { ...n, supports: 0, karma: 0, profileSince: 0 });
    }
    for (const v of votes) {
      const rec = byId.get(v.nominationId);
      if (rec) rec.supports = (rec.supports || 0) + 1;
    }
    const rows = [];
    for (const rec of byId.values()) {
      const karma = await getInhabitantKarma(rec.judgeId);
      const since = await getFirstUserTimestamp(rec.judgeId);
      rows.push({ ...rec, karma, profileSince: since });
    }
    rows.sort((a, b) => {
      if ((b.supports || 0) !== (a.supports || 0)) return (b.supports || 0) - (a.supports || 0);
      if ((b.karma || 0) !== (a.karma || 0)) return (b.karma || 0) - (a.karma || 0);
      if ((a.profileSince || 0) !== (b.profileSince || 0)) return (a.profileSince || 0) - (b.profileSince || 0);
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.judgeId || '').localeCompare(String(b.judgeId || ''));
    });
    return rows;
  }

  async function getCaseDetails({ caseId }) {
    const id = String(caseId || '').trim();
    if (!id) return null;
    const base = await getCaseById(id);
    if (!base) return null;
    const currentUser = await getCurrentUserId();
    const me = String(currentUser || '');
    const accuserId = String(base.accuser || '');
    const respondentId = String(base.respondentId || '');
    const ma = ensureArray(base.mediatorsAccuser || []);
    const mr = ensureArray(base.mediatorsRespondent || []);
    const judgeId = String(base.judgeId || '');
    const dictatorId = String(base.dictatorId || '');
    const isAccuser = accuserId === me;
    const isRespondent = respondentId === me;
    const isMediator = ma.includes(me) || mr.includes(me);
    const isJudge = judgeId === me;
    const isDictator = dictatorId === me;
    const mine = isAccuser || isRespondent || isMediator || isJudge || isDictator;
    let myPublicPreference = null;
    if (isAccuser && typeof base.publicPrefAccuser === 'boolean') {
      myPublicPreference = base.publicPrefAccuser;
    } else if (isRespondent && typeof base.publicPrefRespondent === 'boolean') {
      myPublicPreference = base.publicPrefRespondent;
    }
    const publicDetails = base.publicPrefAccuser === true && base.publicPrefRespondent === true;
    const evidencesAll = await listByType('courtsEvidence');
    const answersAll = await listByType('courtsAnswer');
    const settlementsAll = await listByType('courtsSettlementProposal');
    const verdictsAll = await listByType('courtsVerdict');
    const acceptedAll = await listByType('courtsSettlementAccepted');
    const evidences = evidencesAll
      .filter((e) => String(e.caseId || '') === id)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const answers = answersAll
      .filter((a) => String(a.caseId || '') === id)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const settlements = settlementsAll
      .filter((s) => String(s.caseId || '') === id)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const verdicts = verdictsAll
      .filter((v) => String(v.caseId || '') === id)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const verdict = verdicts.length ? verdicts[verdicts.length - 1] : null;
    const acceptedSettlements = acceptedAll
      .filter((s) => String(s.caseId || '') === id)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const decidedAt =
      base.verdictAt ||
      base.closedAt ||
      (verdict && verdict.createdAt) ||
      base.decidedAt;
    const hasVerdict = !!verdict;
    const supportCount = typeof base.supportCount !== 'undefined' ? base.supportCount : 0;
    return {
      ...base,
      id,
      respondent: base.respondentId || base.respondent,
      evidences,
      answers,
      settlements,
      acceptedSettlements,
      verdict,
      decidedAt,
      isAccuser,
      isRespondent,
      isMediator,
      isJudge,
      isDictator,
      mine,
      publicDetails,
      myPublicPreference,
      supportCount,
      hasVerdict
    };
  }

  return {
    getCurrentUserId,
    openCase,
    listCases,
    listCasesForUser,
    getCaseById,
    setMediators,
    assignJudge,
    addEvidence,
    answerCase,
    issueVerdict,
    proposeSettlement,
    acceptSettlement,
    setPublicPreference,
    openPopularVote,
    nominateJudge,
    voteNomination,
    listNominations,
    getCaseDetails
  };
};

