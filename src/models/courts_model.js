const pull = require('../server/node_modules/pull-stream');
const moment = require('../server/node_modules/moment');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');

const logLimit = getConfig().ssbLogStream?.limit || 1000;
const CASE_ANSWER_DAYS = 7;
const CASE_EVIDENCE_DAYS = 14;
const CASE_DECISION_DAYS = 21;
const POPULAR_DAYS = 14;
const FEED_ID_RE = /^@.+\.ed25519$/;

const CASE_FIELDS = ['title', 'accuser', 'respondentId', 'mediatorsAccuser', 'mediatorsRespondent'];
const MEDIATORS_FIELDS = ['mediators'];
const EVIDENCE_FIELDS = ['text', 'link', 'imageUrl'];
const ANSWER_FIELDS = ['stance', 'text'];
const VERDICT_FIELDS = ['result', 'orders'];
const SETTLEMENT_FIELDS = ['terms'];

module.exports = ({ cooler, services = {}, tribeCrypto }) => {
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

  const encryptFields = (content, keyHex, fields) => {
    const payload = {};
    for (const f of fields) {
      if (content[f] !== undefined) payload[f] = content[f];
    }
    const enc = tribeCrypto.encryptWithKey(JSON.stringify(payload), keyHex);
    const result = { ...content };
    for (const f of fields) delete result[f];
    result.encryptedPayload = enc;
    return result;
  };

  const decryptFields = (content, keyHex) => {
    if (!content || !content.encryptedPayload) return content;
    try {
      const plain = tribeCrypto.decryptWithKey(content.encryptedPayload, keyHex);
      const payload = JSON.parse(plain);
      const result = { ...content };
      delete result.encryptedPayload;
      return { ...result, ...payload };
    } catch (e) {
      return { ...content, encrypted: true };
    }
  };

  const getCaseKey = (obj) => {
    if (!tribeCrypto || !obj) return null;
    return tribeCrypto.getKey(obj.rootCaseId || obj.id);
  };

  const distributeKey = async (caseKey, caseRootId, recipientId) => {
    if (!tribeCrypto || !recipientId) return;
    const ssbClient = await openSsb();
    const ssbKeys = require('../server/node_modules/ssb-keys');
    const boxed = tribeCrypto.boxKeyForMember(caseKey, recipientId, ssbKeys);
    const content = { type: 'courts-key', caseRootId, for: recipientId, memberKey: boxed };
    await new Promise((res, rej) => ssbClient.publish(content, (e) => e ? rej(e) : res()));
  };

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
    const tomb = buildValidatedTombstoneSet(msgs);
    const rep = new Map();
    const map = new Map();
    for (const m of msgs) {
      const k = m.key || m.id;
      const c = m.value?.content || m.content;
      if (!c) continue;
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
    let dictatorId = null;
    if (m === 'DICTATOR') {
      if (!(services.parliament && services.parliament.getGovernmentCard)) throw new Error('DICTATOR method requires DICTATORSHIP government.');
      try {
        var gov = await services.parliament.getGovernmentCard();
      } catch (e) {
        throw new Error('Unable to verify government method for DICTATOR.');
      }
      const gm = String(gov && gov.method ? gov.method : '').toUpperCase();
      if (gm !== 'DICTATORSHIP') throw new Error('DICTATOR method requires DICTATORSHIP government.');
      dictatorId = gov && gov.powerType === 'inhabitant' ? gov.powerId : null;
      if (!dictatorId) throw new Error('No ruling dictator to assign.');
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
      ...(dictatorId ? { dictatorId } : {}),
      createdAt: openedAt
    };

    if (tribeCrypto) {
      const stub = { ...content };
      for (const f of CASE_FIELDS) delete stub[f];
      const initialMsg = await new Promise((res, rej) =>
        ssbClient.publish(stub, (err, msg) => (err ? rej(err) : res(msg)))
      );
      const caseRootId = initialMsg.key;
      const caseKey = tribeCrypto.generateTribeKey();
      tribeCrypto.setKey(caseRootId, caseKey, 1);
      const encrypted = encryptFields({ ...content, rootCaseId: caseRootId }, caseKey, CASE_FIELDS);
      const update = { ...encrypted, replaces: caseRootId, updatedAt: openedAt };
      const finalMsg = await new Promise((res, rej) =>
        ssbClient.publish(update, (err, msg) => (err ? rej(err) : res(msg)))
      );
      await distributeKey(caseKey, caseRootId, resp.id);
      if (dictatorId) await distributeKey(caseKey, caseRootId, dictatorId);
      return finalMsg;
    }

    return new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
  }

  async function loadAllCases() {
    const msgs = await readLog();
    const idx = collectCaseNodes(msgs);
    const out = [];
    for (const [k, n] of idx.nodes) {
      if (n.c.replaces) continue;
      const base = strictCaseBase(msgs, k, idx);
      if (base) out.push(await assembleCase(msgs, base));
    }
    return out;
  }

  async function listCases(filter = 'open') {
    const decrypted = await loadAllCases();
    const sorted = decrypted.sort((a, b) => {
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
    const all = await loadAllCases();
    const id = String(uid || userId || '');
    const supportsMap = await countSupportsByCase();
    const settlementsMap = await countSettlementsByCase();
    const rows = [];
    for (const c of all) {
      const isAccuser = String(c.accuser || '') === id;
      const isRespondent = String(c.respondentId || '') === id;
      const ma = ensureArray(c.mediatorsAccuser || []);
      const mr = ensureArray(c.mediatorsRespondent || []);
      const isMediator = ma.includes(id) || mr.includes(id);
      const isJudge = String(c.judgeId || '') === id;
      const isDictator = String(c.dictatorId || '') === id;
      const mine = isAccuser || isRespondent || isMediator || isJudge || isDictator;
      if (!mine) continue;
      let myPublicPreference = null;
      if (isAccuser && typeof c.publicPrefAccuser === 'boolean') {
        myPublicPreference = c.publicPrefAccuser;
      } else if (isRespondent && typeof c.publicPrefRespondent === 'boolean') {
        myPublicPreference = c.publicPrefRespondent;
      }
      const rootId = c.rootCaseId || c.id;
      const tally = c.voteId ? await voteTally(c.voteId) : null;
      rows.push({
        ...c,
        respondent: c.respondentId || c.respondent,
        isAccuser,
        isRespondent,
        isMediator,
        isJudge,
        isDictator,
        mine,
        myPublicPreference,
        supportCount: supportsMap.get(String(rootId)) || supportsMap.get(String(c.id)) || 0,
        hasSettlement: (settlementsMap.get(String(rootId)) || settlementsMap.get(String(c.id)) || 0) > 0,
        yes: tally ? tally.yes : 0,
        no: tally ? tally.no : 0,
        total: tally ? tally.total : 0,
        needed: tally ? tally.needed : 0
      });
    }
    rows.sort((a, b) => {
      const ta = new Date(a.openedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.openedAt || b.createdAt || 0).getTime();
      return tb - ta;
    });
    return rows;
  }

  function collectCaseNodes(msgs) {
    const nodes = new Map();
    for (const m of msgs) {
      const c = m.value?.content || m.content;
      if (!c || c.type !== 'courtsCase') continue;
      nodes.set(m.key || m.id, { key: m.key || m.id, author: m.value?.author, c });
    }
    const strictNext = new Map(), strictPrev = new Map();
    for (const [k, n] of nodes) {
      const t = n.c.replaces;
      if (t) { const o = nodes.get(t); if (o && o.author === n.author) { strictNext.set(t, k); strictPrev.set(k, t); } }
    }
    return { nodes, strictNext, strictPrev };
  }

  function strictCaseBase(msgs, id, idxIn) {
    const idx = idxIn || collectCaseNodes(msgs);
    const { nodes, strictNext, strictPrev } = idx;
    const tomb = buildValidatedTombstoneSet(msgs);
    let startKey = nodes.has(id) ? id : null;
    if (!startKey) {
      for (const [k, n] of nodes) { if (String(n.c.rootCaseId || '') === id) { startKey = k; break; } }
    }
    if (!startKey) return null;
    let root = startKey, g = 0; while (strictPrev.has(root) && g++ < 100000) root = strictPrev.get(root);
    let tip = root; g = 0; while (strictNext.has(tip) && g++ < 100000) tip = strictNext.get(tip);
    if (tomb.has(tip) || tomb.has(root)) return null;
    const node = nodes.get(tip);
    if (!node) return null;
    let c = { id: tip, ...node.c };
    if (tribeCrypto) { const key = getCaseKey(c); if (key) c = decryptFields(c, key); }
    if (!c.rootCaseId) c.rootCaseId = root;
    return c;
  }

  async function assembleCase(msgs, base) {
    const accuser = String(base.accuser || '');
    const respondentId = String(base.respondentId || '');
    const rootCaseId = String(base.rootCaseId || base.id || '');
    const idStr = String(base.id || '');
    const method = String(base.method || '').toUpperCase();
    const dictatorId = String(base.dictatorId || '');
    const caseKey = getCaseKey(base);
    const isParty = (a) => a === accuser || a === respondentId;
    const matchC = (c) => { const cid = String(c.caseId || ''); return cid === rootCaseId || cid === idStr; };

    let medA = ensureArray(base.mediatorsAccuser || []), medR = ensureArray(base.mediatorsRespondent || []);
    let medATs = 0, medRTs = 0, judgeId = '', judgeTs = 0, voteId = String(base.voteId || ''), voteTs = 0;
    let prefA = base.publicPrefAccuser, prefATs = 0, prefR = base.publicPrefRespondent, prefRTs = 0;
    let answered = false, settled = false, verdict = null, verdictTs = 0, verdictAt = null, settledAt = null;

    for (const m of msgs) {
      const c = m.value?.content || m.content; if (!c) continue;
      const author = String(m.value?.author || '');
      const ts = m.value?.timestamp || m.timestamp || 0;
      if (c.type === 'courtsMediators' && matchC(c)) {
        let dec = c; if (tribeCrypto && caseKey) dec = decryptFields(c, caseKey);
        const list = ensureArray(dec.mediators || []).map(x => String(x || '').trim()).filter(Boolean).filter(x => x !== accuser && x !== respondentId);
        if (c.side === 'accuser' && author === accuser && ts >= medATs) { medA = list; medATs = ts; }
        else if (c.side === 'respondent' && author === respondentId && ts >= medRTs) { medR = list; medRTs = ts; }
      } else if (c.type === 'courtsJudge' && matchC(c) && isParty(author) && ts >= judgeTs) {
        const jid = String(c.judgeId || '').trim();
        if (jid && jid !== accuser && jid !== respondentId) { judgeId = jid; judgeTs = ts; }
      } else if (c.type === 'courtsVoteLink' && matchC(c) && isParty(author) && ts >= voteTs) {
        voteId = String(c.voteId || ''); voteTs = ts;
      } else if (c.type === 'courtsVisibility' && matchC(c)) {
        if (c.side === 'accuser' && author === accuser && ts >= prefATs) { prefA = !!c.pref; prefATs = ts; }
        else if (c.side === 'respondent' && author === respondentId && ts >= prefRTs) { prefR = !!c.pref; prefRTs = ts; }
      } else if (c.type === 'courtsAnswer' && matchC(c) && author === respondentId) {
        answered = true;
      } else if (c.type === 'courtsSettlementAccepted' && matchC(c) && isParty(author)) {
        settled = true; settledAt = c.createdAt || new Date(ts).toISOString();
      } else if (c.type === 'courtsVerdict' && matchC(c) && ts >= verdictTs) {
        verdict = author; verdictTs = ts; verdictAt = c.createdAt || new Date(ts).toISOString();
      }
    }

    let verdictValid = false;
    if (verdict) {
      if (method === 'JUDGE') verdictValid = (verdict === judgeId);
      else if (method === 'MEDIATION') verdictValid = (medA.includes(verdict) || medR.includes(verdict));
      else if (method === 'DICTATOR') verdictValid = (verdict === dictatorId);
    }
    let voteDecided = false;
    if ((method === 'POPULAR' || method === 'KARMATOCRACY') && voteId) {
      try { const t = await voteTally(voteId); if (t && t.closed && t.total > 0) voteDecided = true; } catch (_) {}
    }

    base.mediatorsAccuser = medA;
    base.mediatorsRespondent = medR;
    if (judgeId) base.judgeId = judgeId; else delete base.judgeId;
    if (voteId) base.voteId = voteId;
    if (typeof prefA === 'boolean') base.publicPrefAccuser = prefA;
    if (typeof prefR === 'boolean') base.publicPrefRespondent = prefR;
    base.status = (verdictValid || voteDecided) ? 'DECIDED' : settled ? 'CLOSED' : answered ? 'IN_PROGRESS' : 'OPEN';
    if (verdictValid) { base.verdictAt = verdictAt; base.decidedAt = verdictAt; }
    else if (voteDecided) { base.decidedAt = base.decidedAt || nowISO(); }
    else if (settled) { base.closedAt = settledAt; base.decidedAt = settledAt; }
    return base;
  }

  async function getCaseById(caseId) {
    const id = String(caseId || '').trim();
    if (!id) return null;
    const msgs = await readLog();
    const base = strictCaseBase(msgs, id);
    if (!base) return null;
    return await assembleCase(msgs, base);
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
    const caseRootId = c.rootCaseId || c.id;
    if (tribeCrypto) {
      const caseKey = getCaseKey(c);
      if (caseKey) {
        for (const mediatorId of clean) {
          await distributeKey(caseKey, caseRootId, mediatorId);
        }
      }
    }
    const ssbClient = await openSsb();
    let content = { type: 'courtsMediators', caseId: caseRootId, side, mediators: clean, author: userId, createdAt: nowISO() };
    if (tribeCrypto) {
      const caseKey = getCaseKey(c);
      if (caseKey) content = encryptFields(content, caseKey, MEDIATORS_FIELDS);
    }
    await new Promise((resolve, reject) => ssbClient.publish(content, (err) => (err ? reject(err) : resolve())));
    if (side === 'accuser') c.mediatorsAccuser = clean;
    else c.mediatorsRespondent = clean;
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
    const caseRootId = c.rootCaseId || c.id;
    if (tribeCrypto) {
      const caseKey = getCaseKey(c);
      if (caseKey) {
        await distributeKey(caseKey, caseRootId, id);
      }
    }
    const ssbClient = await openSsb();
    const content = { type: 'courtsJudge', caseId: caseRootId, judgeId: id, author: userId, createdAt: nowISO() };
    await new Promise((resolve, reject) => ssbClient.publish(content, (err) => (err ? reject(err) : resolve())));
    c.judgeId = id;
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
    let content = {
      type: 'courtsEvidence',
      caseId: c.rootCaseId || c.id,
      author: userId,
      role,
      text: t,
      link: l,
      imageUrl,
      createdAt: nowISO()
    };
    if (tribeCrypto) {
      const caseKey = getCaseKey(c);
      if (caseKey) content = encryptFields(content, caseKey, EVIDENCE_FIELDS);
    }
    return new Promise((resolve, reject) =>
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
    let content = {
      type: 'courtsAnswer',
      caseId: c.rootCaseId || c.id,
      respondent: userId,
      stance: s,
      text: t,
      createdAt: nowISO()
    };
    if (tribeCrypto) {
      const caseKey = getCaseKey(c);
      if (caseKey) content = encryptFields(content, caseKey, ANSWER_FIELDS);
    }
    await new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
    c.status = 'IN_PROGRESS';
    return c;
  }

  async function issueVerdict({ caseId, result, orders }) {
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    const me = String(userId || '');
    const isParty = String(c.accuser || '') === me || String(c.respondentId || '') === me;
    if (isParty) throw new Error('A party cannot issue the verdict.');
    const method = String(c.method || '').toUpperCase();
    const isMediator = ensureArray(c.mediatorsAccuser || []).includes(me) || ensureArray(c.mediatorsRespondent || []).includes(me);
    if (method === 'JUDGE') {
      if (String(c.judgeId || '') !== me) throw new Error('Only the assigned judge can issue the verdict.');
    } else if (method === 'MEDIATION') {
      if (!isMediator) throw new Error('Only an appointed mediator can issue the verdict.');
    } else if (method === 'DICTATOR') {
      if (String(c.dictatorId || '') !== me) throw new Error('Only the dictator can issue the verdict.');
    } else {
      throw new Error('This method is resolved by public vote, not by a verdict.');
    }
    const r = String(result || '').trim();
    if (!r) throw new Error('Result is required.');
    const o = String(orders || '').trim();
    const ssbClient = await openSsb();
    let content = {
      type: 'courtsVerdict',
      caseId: c.rootCaseId || c.id,
      judgeId: userId,
      result: r,
      orders: o,
      createdAt: nowISO()
    };
    if (tribeCrypto) {
      const caseKey = getCaseKey(c);
      if (caseKey) content = encryptFields(content, caseKey, VERDICT_FIELDS);
    }
    await new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
    c.status = 'DECIDED';
    c.verdictAt = nowISO();
    c.ruledBy = userId;
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
    let content = {
      type: 'courtsSettlementProposal',
      caseId: c.rootCaseId || c.id,
      proposer: userId,
      terms: t,
      createdAt: nowISO()
    };
    if (tribeCrypto) {
      const caseKey = getCaseKey(c);
      if (caseKey) content = encryptFields(content, caseKey, SETTLEMENT_FIELDS);
    }
    return new Promise((resolve, reject) =>
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
      caseId: c.rootCaseId || c.id,
      by: userId,
      createdAt: nowISO()
    };
    await new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
    c.status = 'CLOSED';
    return c;
  }

  async function supportCase({ caseId }) {
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    if (getCaseRole(c, userId) !== 'OTHER') throw new Error('Parties cannot support their own case.');
    const rootId = c.rootCaseId || c.id;
    const supports = await listByType('courtsSupport');
    const already = supports.find(s => String(s.caseId || '') === String(rootId) && String(s.supporter || '') === String(userId || ''));
    if (already) throw new Error('You already support this case.');
    const ssbClient = await openSsb();
    const content = { type: 'courtsSupport', caseId: rootId, supporter: userId, createdAt: nowISO() };
    return new Promise((resolve, reject) =>
      ssbClient.publish(content, (err, msg) => (err ? reject(err) : resolve(msg)))
    );
  }

  async function countSupportsByCase() {
    const supports = await listByType('courtsSupport');
    const map = new Map();
    for (const s of supports) {
      const k = String(s.caseId || '');
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }

  async function countSettlementsByCase() {
    const items = await listByType('courtsSettlementProposal');
    const map = new Map();
    for (const s of items) {
      const k = String(s.caseId || '');
      if (!k) continue;
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }

  async function voteTally(voteId) {
    if (!voteId || !services.votes || !services.votes.getVoteById) return null;
    try {
      const v = await services.votes.getVoteById(voteId);
      const vm = v && v.votes ? v.votes : {};
      const yes = Number(vm.YES ?? vm.Yes ?? vm.yes ?? 0);
      const no = Number(vm.NO ?? vm.No ?? vm.no ?? 0);
      const sum = Object.values(vm).reduce((s, n) => s + Number(n || 0), 0);
      const total = Number(v.totalVotes ?? v.total ?? sum);
      const deadline = v.deadline || v.endAt || v.expiresAt || null;
      const closed = v.status === 'CLOSED' || (deadline && moment(deadline).isBefore(moment()));
      const needed = Math.floor(total / 2) + 1;
      return { yes, no, total, needed, closed, deadline };
    } catch { return null; }
  }

  async function sweepCases() {
    return;
  }

  async function setPublicPreference({ caseId, preference }) {
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    const id = String(userId || '');
    const pref = !!preference;
    let side = null;
    if (String(c.accuser || '') === id) { side = 'accuser'; c.publicPrefAccuser = pref; }
    else if (String(c.respondentId || '') === id) { side = 'respondent'; c.publicPrefRespondent = pref; }
    else throw new Error('Only parties can set visibility preference.');
    const ssbClient = await openSsb();
    const content = { type: 'courtsVisibility', caseId: c.rootCaseId || c.id, side, pref, author: id, createdAt: nowISO() };
    await new Promise((resolve, reject) => ssbClient.publish(content, (err) => (err ? reject(err) : resolve())));
    return c;
  }

  async function openPopularVote({ caseId }) {
    if (!services.votes || !services.votes.createVote) throw new Error('Votes service not available.');
    const c = await getCaseById(caseId);
    if (!c) throw new Error('Case not found.');
    const m = String(c.method || '').toUpperCase();
    if (m !== 'POPULAR' && m !== 'KARMATOCRACY') throw new Error('This case does not use public voting.');
    if (c.voteId) throw new Error('Vote already opened.');
    const myRole = getCaseRole(c, userId);
    if (myRole !== 'ACCUSER' && myRole !== 'DEFENCE') throw new Error('Only parties can open the vote.');
    const question = c.title || `Case ${caseId}`;
    const deadline = moment().add(POPULAR_DAYS, 'days').toISOString();
    const voteMsg = await services.votes.createVote(
      question,
      deadline,
      ['YES', 'NO', 'ABSTENTION'],
      [`courtsCase:${caseId}`, `courtsMethod:${m}`]
    );
    const voteId = voteMsg.key || voteMsg.id;
    const ssbClient = await openSsb();
    const content = { type: 'courtsVoteLink', caseId: c.rootCaseId || c.id, voteId, author: userId, createdAt: nowISO() };
    await new Promise((resolve, reject) => ssbClient.publish(content, (err) => (err ? reject(err) : resolve())));
    c.voteId = voteId;
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
    return new Promise((resolve, reject) =>
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
    return new Promise((resolve, reject) =>
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

    const caseKey = getCaseKey(base);
    const caseRootId = base.rootCaseId || base.id;

    const matchCase = (e) => {
      const eCaseId = String(e.caseId || '');
      return eCaseId === id || eCaseId === caseRootId;
    };

    const tryDecrypt = (item) => {
      if (!caseKey) return item;
      return decryptFields(item, caseKey);
    };

    const evidencesAll = await listByType('courtsEvidence');
    const answersAll = await listByType('courtsAnswer');
    const settlementsAll = await listByType('courtsSettlementProposal');
    const verdictsAll = await listByType('courtsVerdict');
    const acceptedAll = await listByType('courtsSettlementAccepted');

    const evidences = evidencesAll
      .filter(matchCase)
      .map(tryDecrypt)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const answers = answersAll
      .filter(matchCase)
      .map(tryDecrypt)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const settlements = settlementsAll
      .filter(matchCase)
      .map(tryDecrypt)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const verdicts = verdictsAll
      .filter(matchCase)
      .map(tryDecrypt)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const verdict = verdicts.length ? verdicts[verdicts.length - 1] : null;
    const acceptedSettlements = acceptedAll
      .filter(matchCase)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const decidedAt =
      base.verdictAt ||
      base.closedAt ||
      (verdict && verdict.createdAt) ||
      base.decidedAt;
    const hasVerdict = !!verdict;
    const supportsMap = await countSupportsByCase();
    const supportCount = supportsMap.get(String(caseRootId)) || supportsMap.get(String(id)) || 0;
    const tally = base.voteId ? await voteTally(base.voteId) : null;
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
      hasSettlement: settlements.length > 0,
      yes: tally ? tally.yes : 0,
      no: tally ? tally.no : 0,
      total: tally ? tally.total : 0,
      needed: tally ? tally.needed : 0,
      voteClosed: tally ? tally.closed : false,
      hasVerdict
    };
  }

  async function processIncomingCourtsKeys() {
    if (!tribeCrypto) return;
    const ssbKeys = require('../server/node_modules/ssb-keys');
    const ssbConfig = require('../server/ssb_config');
    const ssbClient = await openSsb();
    const msgs = await new Promise((res, rej) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, arr) => (err ? rej(err) : res(arr)))
      );
    });
    for (const m of msgs) {
      const c = m.value?.content;
      if (!c || c.type !== 'courts-key') continue;
      if (c.for !== ssbClient.id) continue;
      if (!c.memberKey || !c.caseRootId) continue;
      if (tribeCrypto.getKey(c.caseRootId)) continue;
      try {
        const key = tribeCrypto.unboxKeyFromMember(c.memberKey, ssbConfig.keys, ssbKeys);
        if (key) tribeCrypto.setKey(c.caseRootId, key, 1);
      } catch (e) {}
    }
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
    supportCase,
    sweepCases,
    setPublicPreference,
    openPopularVote,
    nominateJudge,
    voteNomination,
    listNominations,
    getCaseDetails,
    processIncomingCourtsKeys
  };
};
