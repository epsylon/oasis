const crypto = require("crypto")
const { buildValidatedTombstoneSet } = require('./tombstone_validator')
const { collabContent, openInviteOf } = require('../backend/collab_content')
const { readTyped, memoIndex } = require('./typed_log')
const { roomNumberOf, normalizeNumber } = require('./phone_number')
const { getConfig } = require("../configs/config-manager.js")
const roomCollab = collabContent({ membersField: 'members', undecField: 'undecryptable', contentFields: ['title', 'description', 'image', 'status'], listFields: ['tags', 'invites'] })
const logLimit = getConfig().ssbLogStream?.limit || 1000

const ROOM_MAX = 50
const ROOM_TYPES = ["room", "roomMember", "tribe-keys", "tombstone"]
const STATUSES = ["OPEN", "INVITE-ONLY"]
const INVITE_SALT = "SolarNET.HuB-rooms"
const INVITE_BYTES = 16
const RECENT_MS = 86400000
const RID = /^[0-9a-f]{32}$/
const FEED_ID = /^@[A-Za-z0-9+/]{43}=\.ed25519$/
const BLOB_ID = /^&[A-Za-z0-9+/]{43}=\.sha256$/

const safeText = (v) => String(v || "").trim()
const normalizeTags = (raw) => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(t => String(t || "").trim()).filter(Boolean)
  return String(raw).split(",").map(t => t.trim()).filter(Boolean)
}
const normalizeStatus = (v) => (STATUSES.includes(String(v || "").toUpperCase()) ? String(v).toUpperCase() : "OPEN")
const blobRef = (v) => (BLOB_ID.test(safeText(v)) ? safeText(v) : "")
const asP = (fn, ...args) => new Promise((resolve, reject) => fn(...args, (err, v) => err ? reject(err) : resolve(v)))
const rpcValue = (fn, ...args) => new Promise((resolve) => {
  try {
    const r = fn(...args, (err, v) => resolve(err ? null : v))
    if (r && typeof r.then === "function") r.then(resolve, () => resolve(null))
    else if (r !== undefined) resolve(r)
  } catch (_) { resolve(null) }
})

module.exports = ({ cooler, tribeCrypto, roomCrypto, tribesModel }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }
  const phone = async () => { const s = await openSsb(); return s && s.phone ? s.phone : null }

  const ownCrypto = roomCrypto || tribeCrypto
  const lookupKey = (rid) => (ownCrypto && ownCrypto.getKey(rid)) || (tribeCrypto && tribeCrypto.getKey(rid)) || null
  const lookupKeys = (rid) => {
    const a = (ownCrypto && ownCrypto.getKeys(rid)) || []
    if (a.length) return a
    return (tribeCrypto && tribeCrypto.getKeys(rid)) || []
  }
  const lookupGen = (rid) => ((ownCrypto && ownCrypto.getGen(rid)) || (tribeCrypto && tribeCrypto.getGen(rid)) || 0)
  const setRoomKey = (rootId, keyHex) => { if (ownCrypto) ownCrypto.setKey(rootId, keyHex, 1) }
  const hashCode = (code, salt) => (ownCrypto && typeof ownCrypto.hashInviteCode === "function") ? ownCrypto.hashInviteCode(code, salt) : (tribeCrypto ? tribeCrypto.hashInviteCode(code, salt) : null)
  const inviteMatches = (inv, token) => {
    if (!token) return false
    if (typeof inv === "string") return inv === token
    if (!inv || typeof inv !== "object") return false
    if (typeof inv.code === "string" && inv.code === token) return true
    if (typeof inv.ch === "string" && (inv.ch === token || hashCode(token, inv.salt) === inv.ch)) return true
    return false
  }
  const inviteToken = (inv) => (inv && typeof inv === "object" && typeof inv.ch === "string") ? inv.ch : (typeof inv === "string" ? inv : (inv && inv.code) || "")
  const keyProofFor = (keyHex, id) => { try { return crypto.createHmac("sha256", Buffer.from(keyHex, "hex")).update(String(id), "utf8").digest("hex") } catch (_) { return null } }
  const deriveRid = (keyHex, roomId) => crypto.createHmac("sha256", Buffer.from(String(keyHex), "hex")).update("oasis-room-rid|" + roomId).digest("hex").slice(0, 32)
  const currentKeyFor = (rootId, tribeId, tribeKeys) => (tribeId && Array.isArray(tribeKeys) && tribeKeys.length ? tribeKeys[0] : lookupKeys(rootId)[0]) || null

  const encryptField = (text, keyHex) => {
    const key = Buffer.from(keyHex, "hex")
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
    const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
    const authTag = cipher.getAuthTag()
    return iv.toString("hex") + authTag.toString("hex") + enc.toString("hex")
  }

  const tryDecryptField = (encrypted, keyHex) => {
    const key = Buffer.from(keyHex, "hex")
    const iv = Buffer.from(encrypted.slice(0, 24), "hex")
    const authTag = Buffer.from(encrypted.slice(24, 56), "hex")
    const ciphertext = Buffer.from(encrypted.slice(56), "hex")
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")
  }

  const decryptField = (encrypted, keyHex) => {
    try { return tryDecryptField(encrypted, keyHex) } catch (_) { return "" }
  }

  const getTribeKeysFor = async (tribeId) => {
    if (!tribeCrypto || !tribesModel || !tribeId) return []
    try {
      const rootId = await tribesModel.getRootId(tribeId)
      return tribeCrypto.getKeys(rootId) || []
    } catch (_) { return [] }
  }

  const fieldsWith = (c, keyHex, strict) => {
    const dec = strict ? tryDecryptField : decryptField
    const title = c.title ? dec(c.title, keyHex) : ""
    const opt = (v) => { try { return v ? dec(v, keyHex) : "" } catch (_) { return "" } }
    return {
      title: safeText(title),
      description: safeText(opt(c.description)),
      image: blobRef(opt(c.image)),
      tags: normalizeTags(opt(c.tags)),
      rid: RID.test(opt(c.rid)) ? opt(c.rid) : ""
    }
  }

  const decryptWithKeys = (c, keys) => {
    if (!c.title || !keys.length) return null
    for (const k of keys) {
      try { return fieldsWith(c, k, true) } catch (_) {}
    }
    return null
  }

  const encryptForInvite = (roomKeyHex, code, saltHex) => {
    const salt = saltHex ? Buffer.from(saltHex, "hex") : Buffer.from(INVITE_SALT)
    const derived = crypto.scryptSync(code, salt, 32)
    return encryptField(roomKeyHex, derived.toString("hex"))
  }

  const decryptFromInvite = (encryptedKey, code, saltHex) => {
    const salt = saltHex ? Buffer.from(saltHex, "hex") : Buffer.from(INVITE_SALT)
    const derived = crypto.scryptSync(code, salt, 32)
    return decryptField(encryptedKey, derived.toString("hex"))
  }

  const tryDecryptPublicInviteKey = (invites) => {
    if (!Array.isArray(invites)) return null
    for (const inv of invites) {
      if (!inv || typeof inv !== "object" || inv.public !== true) continue
      if (typeof inv.code !== "string" || typeof inv.ek !== "string") continue
      try {
        const key = decryptFromInvite(inv.ek, inv.code, inv.salt)
        if (key) return key
      } catch (_) {}
    }
    return null
  }

  const generateInviteSalt = () => crypto.randomBytes(16).toString("hex")

  const rotateRoomKey = async (rootId, remainingMembers) => {
    if (!ownCrypto || !tribeCrypto || !rootId) return
    if (!lookupKey(rootId)) return
    const newKey = crypto.randomBytes(32).toString("hex")
    const newGen = ownCrypto.addNewKey(rootId, newKey)
    const ssbClient = await openSsb()
    const ssbKeys = require("../server/node_modules/ssb-keys")
    const memberKeys = {}
    for (const m of new Set([ssbClient.id, ...(Array.isArray(remainingMembers) ? remainingMembers : [])])) {
      try { memberKeys[m] = tribeCrypto.boxKeyForMember(newKey, m, ssbKeys) } catch (_) {}
    }
    if (Object.keys(memberKeys).length) {
      await new Promise((resolve) => {
        ssbClient.publish({ type: "tribe-keys", tribeId: rootId, generation: newGen, memberKeys }, () => resolve())
      })
    }
  }

  const readAll = async (ssbClient) => readTyped(ssbClient, ROOM_TYPES, { limit: logLimit })

  const ensureMemberKeys = async (ssbClient, messages, rooms) => {
    if (!tribeCrypto || !ownCrypto) return
    const leavesByRoot = new Map()
    for (const m of messages) {
      const c = m.value && m.value.content
      if (!c || c.type !== "roomMember" || c.on !== false || !c.target || !c.member) continue
      if (!leavesByRoot.has(c.target)) leavesByRoot.set(c.target, [])
      leavesByRoot.get(c.target).push({ member: c.member, author: m.value.author, ts: Number(m.timestamp || m.value.timestamp || 0) })
    }
    const ssbKeys = require("../server/node_modules/ssb-keys")
    for (const room of (Array.isArray(rooms) ? rooms : [])) {
      if (!room || room.tribeId || room.author !== ssbClient.id) continue
      const rootId = room.rootId
      if (!rootId || !lookupKey(rootId)) continue
      const members = Array.isArray(room.members) ? room.members : []
      const leaves = (leavesByRoot.get(rootId) || []).filter(l => l.author === l.member || l.author === room.author)
      const plan = ownCrypto.keyPlan({ rootId, ownerId: room.author, gen: lookupGen(rootId), members, messages, leaves })
      if (plan.rotate) {
        await rotateRoomKey(rootId, members)
        continue
      }
      if (!plan.missing.length) continue
      const key = lookupKey(rootId)
      const memberKeys = {}
      for (const m of plan.missing) {
        try { memberKeys[m] = tribeCrypto.boxKeyForMember(key, m, ssbKeys) } catch (_) {}
      }
      if (!Object.keys(memberKeys).length) continue
      await asP(ssbClient.publish, { type: "tribe-keys", tribeId: rootId, generation: lookupGen(rootId) || 1, memberKeys })
    }
  }


  const ingestOwnTribeKeys = async () => {
    if (!ownCrypto) return
    try {
      const ssbClient = await openSsb()
      const ssbKeys = require("../server/node_modules/ssb-keys")
      const config = require("../server/ssb_config")
      const rooms = new Set()
      const msgs = await readAll(ssbClient)
      for (const m of msgs) {
        const c = m.value && m.value.content
        if (c && c.type === "room") rooms.add(m.key)
      }
      const idx = buildIndex(msgs)
      const trusted = (root, author) => { const owner = idx.nodes.get(root) && idx.nodes.get(root).author; return !!author && !!owner && (author === owner || author === ssbClient.id) }
      for (const m of msgs) {
        const c = m.value && m.value.content
        if (!c || c.type !== "tribe-keys" || !rooms.has(c.tribeId)) continue
        if (!trusted(c.tribeId, m.value.author)) continue
        const boxed = c.memberKeys && typeof c.memberKeys === "object" ? c.memberKeys[ssbClient.id] : null
        if (!boxed) continue
        try {
          const unboxed = ssbKeys.unbox(boxed, config.keys)
          const key = typeof unboxed === "string" ? unboxed : (unboxed && unboxed.toString ? unboxed.toString() : null)
          if (key) ownCrypto.addNewKey(c.tribeId, key)
        } catch (_) {}
      }
    } catch (_) {}
  }

  const buildIndex = (messages) => {
    const tomb = new Set()
    const nodes = new Map()
    const parent = new Map()
    const child = new Map()
    const strictParent = new Map()
    const strictChild = new Map()
    const authorByKey = new Map()
    const tombRequests = []
    const memberMsgs = []

    for (const m of messages) {
      const k = m.key
      const v = m.value || {}
      const c = v.content
      if (!c) continue
      if (c.type === "tombstone" && c.target) { tombRequests.push({ target: c.target, author: v.author }); continue }
      if (c.type === "roomMember" && c.target) { memberMsgs.push({ target: c.target, member: c.member, on: c.on !== false, author: v.author, ts: v.timestamp || m.timestamp || 0, code: typeof c.code === "string" ? c.code : "", keyProof: typeof c.keyProof === "string" ? c.keyProof : "" }); continue }
      if (c.type === "room") {
        nodes.set(k, { key: k, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        authorByKey.set(k, v.author)
        if (c.replaces) { parent.set(k, c.replaces); child.set(c.replaces, k) }
      }
    }

    for (const [k, node] of nodes) {
      const t = node.c.replaces
      if (t) { const orig = nodes.get(t); if (orig && orig.author === node.author) { strictParent.set(k, t); strictChild.set(t, k) } }
    }

    for (const t of tombRequests) {
      const targetAuthor = authorByKey.get(t.target)
      if (targetAuthor && t.author === targetAuthor) tomb.add(t.target)
    }

    const rootOf = (id) => { let cur = id, g = 0; while (parent.has(cur) && g++ < 100000) cur = parent.get(cur); return cur }
    const strictRootOf = (id) => { let cur = id, g = 0; while (strictParent.has(cur) && g++ < 100000) cur = strictParent.get(cur); return cur }
    const contentTipOf = (root) => {
      const rn = nodes.get(root)
      if (!rn) return root
      let cur = root, best = root, g = 0
      const seen = new Set()
      while (child.has(cur) && !seen.has(cur) && g++ < 100000) {
        seen.add(cur)
        const next = child.get(cur)
        const n = nodes.get(next)
        if (!n) break
        if (n.author === rn.author && !tomb.has(next)) best = next
        cur = next
      }
      return best
    }

    const roots = new Set()
    for (const id of nodes.keys()) roots.add(strictRootOf(id))

    const invitesOf = (root) => {
      const out = []
      for (const id of [root, contentTipOf(root)]) { const n = nodes.get(id); if (n && Array.isArray(n.c.invites)) out.push(...n.c.invites) }
      return out
    }
    const selfJoinAllowed = (root, mm) => {
      const oc = (nodes.get(root) || {}).c || {}
      if (oc.encrypted !== true || oc.tribeId) return true
      const invites = invitesOf(root)
      if (invites.some(inv => inv && typeof inv === "object" && inv.public === true)) return true
      if (mm.keyProof && lookupKeys(root).some(k => keyProofFor(k, mm.member) === mm.keyProof)) return true
      return !!mm.code && invites.some(inv => inviteMatches(inv, mm.code))
    }

    const memberByRoot = new Map()
    const consumedByRoot = new Map()
    for (const mm of memberMsgs) {
      if (!nodes.has(mm.target)) continue
      const r = strictRootOf(mm.target)
      const ownerAuthor = nodes.get(r) && nodes.get(r).author
      if (!ownerAuthor || !mm.member) continue
      const self = mm.member === mm.author
      if (!self && mm.author !== ownerAuthor) continue
      if (self && mm.author !== ownerAuthor && mm.on && !selfJoinAllowed(r, mm)) continue
      if (!memberByRoot.has(r)) memberByRoot.set(r, new Map())
      const m2 = memberByRoot.get(r)
      const p = m2.get(mm.member)
      if (!p || mm.ts >= p.ts) m2.set(mm.member, { on: mm.on, ts: mm.ts })
      if (mm.on && mm.code) {
        if (!consumedByRoot.has(r)) consumedByRoot.set(r, new Set())
        consumedByRoot.get(r).add(mm.code)
      }
    }

    const isCodeConsumed = (root, code) => {
      if (!code) return false
      const set = consumedByRoot.get(root)
      return !!(set && set.has(code))
    }

    const resolveMembers = (root) => {
      const ownerNode = nodes.get(root)
      const oc = ownerNode ? ownerNode.c : {}
      const set = new Set(Array.isArray(oc.members) ? oc.members.filter(x => typeof x === "string" && x) : [])
      for (const [mem, st] of (memberByRoot.get(root) || new Map())) { if (st.on) set.add(mem); else set.delete(mem) }
      return [...set]
    }

    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, contentTipOf(r))

    return { tomb, nodes, parent, child, rootOf, strictRootOf, contentTipOf, tipByRoot, resolveMembers, isCodeConsumed }
  }

  const decryptRoomFields = (c, rootId, tribeKeys) => {
    if (c.encrypted !== true) {
      return { title: safeText(c.title), description: safeText(c.description), image: blobRef(c.image), tags: normalizeTags(c.tags), rid: RID.test(String(c.rid || "")) ? String(c.rid) : "", _undec: false }
    }
    if (c.tribeId && Array.isArray(tribeKeys) && tribeKeys.length) {
      const viaTribe = decryptWithKeys(c, tribeKeys)
      if (viaTribe) return { ...viaTribe, _undec: false }
    }
    for (const k of [...lookupKeys(rootId), tryDecryptPublicInviteKey(c.invites)].filter(Boolean)) {
      const out = decryptWithKeys(c, [k])
      if (out) return { ...out, _undec: false }
    }
    return { title: "", description: "", image: "", tags: [], rid: "", _undec: true }
  }

  const buildRoom = (node, rootId, tribeKeys, members) => {
    const c = node.c || {}
    if (c.type !== "room") return null
    const f = decryptRoomFields(c, rootId, tribeKeys)
    const author = c.author || node.author
    const roomId = RID.test(String(c.roomId || "")) ? String(c.roomId) : ""
    const liveKey = roomId && c.encrypted === true && !f._undec ? currentKeyFor(rootId, c.tribeId, tribeKeys) : null
    return {
      key: node.key,
      rootId,
      roomId,
      title: f.title,
      description: f.description,
      image: f.image,
      tags: f.tags,
      status: ["OPEN", "INVITE-ONLY", "CLOSED"].includes(c.status) ? c.status : "OPEN",
      type: c.status === "INVITE-ONLY" || (c.status === "CLOSED" && c.encrypted === true && !c.tribeId) ? "INVITE-ONLY" : "OPEN",
      author,
      members: Array.isArray(members) ? members : (Array.isArray(c.members) ? c.members : []),
      invites: Array.isArray(c.invites) ? c.invites : [],
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      tribeId: c.tribeId || null,
      encrypted: c.encrypted === true,
      undecryptable: !!f._undec,
      rid: roomId ? (liveKey ? deriveRid(liveKey, roomId) : "") : f.rid,
      token: typeof c.token === "string" ? c.token : "",
      hub: FEED_ID.test(String(c.hub || "")) ? c.hub : author,
      hubAddress: typeof c.hubAddress === "string" ? c.hubAddress : "",
      media: c.media === "video" ? "video" : "audio",
      maxParticipants: ROOM_MAX,
      number: roomNumberOf(rootId),
      line: c.line === "SWITCHBOARD" ? "SWITCHBOARD" : "DND"
    }
  }

  const collectRooms = async (idx) => {
    const tribeKeyCache = new Map()
    const items = []
    for (const [rootId, tipId] of idx.tipByRoot.entries()) {
      if (idx.tomb.has(tipId)) continue
      const node = idx.nodes.get(tipId)
      if (!node || node.c.type !== "room") continue
      let tKeys = []
      if (node.c.tribeId) {
        if (!tribeKeyCache.has(node.c.tribeId)) tribeKeyCache.set(node.c.tribeId, await getTribeKeysFor(node.c.tribeId))
        tKeys = tribeKeyCache.get(node.c.tribeId)
      }
      const room = buildRoom(node, rootId, tKeys, idx.resolveMembers(rootId))
      if (!room) continue
      room.isClosed = room.status === "CLOSED"
      items.push(room)
    }
    return items
  }

  const pickHub = async () => {
    const ph = await phone()
    const me = (await openSsb()).id
    const h = ph && typeof ph.roomHubFor === "function" ? await rpcValue(ph.roomHubFor) : null
    if (h && FEED_ID.test(String(h.key || ""))) return { hub: h.key, hubAddress: String(h.address || "") }
    return { hub: me, hubAddress: "" }
  }

  const tokenFor = async (rid) => {
    const ph = await phone()
    const t = ph && typeof ph.roomToken === "function" ? await rpcValue(ph.roomToken, rid) : null
    return typeof t === "string" ? t : ""
  }

  const republish = async (id, mutate) => {
    const self = api
    const tipId = await self.resolveCurrentId(id)
    const ssbClient = await openSsb()
    const userId = ssbClient.id
    const rootId = await self.resolveRootId(id)
    const item = await asP(ssbClient.get, tipId).catch(() => null)
    if (!item || !item.content) throw new Error("Room not found")
    if (item.content.author !== userId) throw new Error("Not the author")
    const c = item.content
    let keyHex = null
    let usesTribeKey = false
    if (c.encrypted === true) {
      if (c.tribeId) {
        const tKeys = await getTribeKeysFor(c.tribeId)
        if (tKeys.length) { keyHex = tKeys[0]; usesTribeKey = true }
      }
      if (!keyHex) keyHex = lookupKey(rootId)
      if (!keyHex) throw new Error("Missing room key — cannot update room")
    }
    const enc = (text) => (c.encrypted === true ? encryptField(String(text), keyHex) : String(text))
    const updated = { ...mutate(c, enc), updatedAt: new Date().toISOString(), replaces: tipId }
    await asP(ssbClient.publish, { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId })
    const res = await asP(ssbClient.publish, updated)
    if (keyHex && !usesTribeKey) setRoomKey(res.key, keyHex)
    return res
  }

  const api = {
    type: "room",
    ROOM_MAX,

    async decryptContent(content, rootId) {
      const tKeys = content && content.tribeId ? await getTribeKeysFor(content.tribeId) : []
      return decryptRoomFields(content, rootId, tKeys)
    },

    decryptContentPublicSync(content) {
      if (!content) return null
      if (content.encrypted !== true) return { title: safeText(content.title), description: safeText(content.description), tags: normalizeTags(content.tags) }
      if (content.tribeId) return null
      const keyHex = tryDecryptPublicInviteKey(content.invites)
      if (!keyHex) return null
      const f = decryptWithKeys(content, [keyHex])
      return f ? { title: f.title, description: f.description, tags: f.tags } : null
    },

    async resolveRootId(id) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await readAll(ssbClient))
      const root = idx.strictRootOf(id)
      if (idx.tomb.has(idx.contentTipOf(root))) throw new Error("Not found")
      return root
    },

    async resolveCurrentId(id) {
      const ssbClient = await openSsb()
      const idx = buildIndex(await readAll(ssbClient))
      const tip = idx.contentTipOf(idx.strictRootOf(id))
      if (idx.tomb.has(tip)) throw new Error("Not found")
      return tip
    },

    async createRoom({ title, description, image, status, tags, tribeId } = {}) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const now = new Date().toISOString()
      const type = tribeId ? "INVITE-ONLY" : normalizeStatus(status)
      const tagsArr = normalizeTags(tags)
      const rid = crypto.randomBytes(16).toString("hex")
      const roomId = crypto.randomBytes(16).toString("hex")
      const sealed = !!tribeId || type !== "OPEN"
      const live = { token: await tokenFor(sealed ? roomId : rid), ...(await pickHub()), media: "audio" }
      const base = { type: "room", status: tribeId ? "OPEN" : type, author: userId, members: [userId], invites: [], createdAt: now, updatedAt: now, ...live }

      if (type === "OPEN" && !tribeId) {
        return asP(ssbClient.publish, { ...base, title: safeText(title), description: safeText(description), image: blobRef(image), tags: tagsArr, rid, encrypted: false })
      }

      let keyHex = null
      let usesTribeKey = false
      if (tribeId) {
        const tKeys = await getTribeKeysFor(tribeId)
        if (tKeys.length) { keyHex = tKeys[0]; usesTribeKey = true }
      }
      if (!keyHex) keyHex = crypto.randomBytes(32).toString("hex")
      const enc = (text) => encryptField(String(text), keyHex)
      const msg = await asP(ssbClient.publish, {
        ...base,
        title: enc(safeText(title)),
        description: enc(safeText(description)),
        image: enc(blobRef(image)),
        tags: enc(tagsArr.join(",")),
        roomId,
        encrypted: true,
        ...(tribeId ? { tribeId } : {})
      })
      if (!usesTribeKey) {
        setRoomKey(msg.key, keyHex)
        if (tribeCrypto) {
          try {
            const ssbKeys = require("../server/node_modules/ssb-keys")
            await asP(ssbClient.publish, { type: "tribe-keys", tribeId: msg.key, generation: 1, memberKeys: { [userId]: tribeCrypto.boxKeyForMember(keyHex, userId, ssbKeys) } })
          } catch (_) {}
        }
      }
      return msg
    },

    async updateRoomById(id, data = {}) {
      const hub = data.refreshHub ? await pickHub() : null
      return republish(id, (c, enc) => ({
        ...c,
        title: data.title !== undefined ? enc(safeText(data.title)) : c.title,
        description: data.description !== undefined ? enc(safeText(data.description)) : c.description,
        image: data.image !== undefined ? enc(blobRef(data.image)) : c.image,
        tags: data.tags !== undefined ? (c.encrypted === true ? enc(normalizeTags(data.tags).join(",")) : normalizeTags(data.tags)) : c.tags,
        invites: data.invites !== undefined ? data.invites : c.invites,
        ...(hub || {})
      }))
    },

    async closeRoomById(id) {
      return republish(id, (c) => ({ ...c, status: "CLOSED" }))
    },

    async setRoomLine(id, line) {
      return republish(id, (c) => ({ ...c, line: line === "SWITCHBOARD" ? "SWITCHBOARD" : "DND" }))
    },

    async deleteRoomById(id) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const item = await asP(ssbClient.get, tipId).catch(() => null)
      if (!item || !item.content) throw new Error("Room not found")
      if (item.content.author !== ssbClient.id) throw new Error("Not the author")
      await asP(ssbClient.publish, { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: ssbClient.id })
    },

    async addMemberToRoom(roomId, feedId, consumedCode) {
      const tipId = await this.resolveCurrentId(roomId)
      const ssbClient = await openSsb()
      const rootId = await this.resolveRootId(roomId)
      const item = await asP(ssbClient.get, tipId).catch(() => null)
      if (!item || !item.content) throw new Error("Room not found")
      const c = item.content
      if (c.encrypted === true && !c.tribeId && !lookupKey(rootId)) {
        const key = tryDecryptPublicInviteKey(c.invites)
        if (key) setRoomKey(rootId, key)
      }
      const proofKey = feedId === ssbClient.id && c.encrypted === true && !c.tribeId ? lookupKey(rootId) : null
      return asP(ssbClient.publish, { type: "roomMember", target: rootId, member: feedId, on: true, createdAt: new Date().toISOString(), ...(typeof consumedCode === "string" && consumedCode ? { code: consumedCode } : {}), ...(proofKey ? { keyProof: keyProofFor(proofKey, feedId) } : {}) })
    },

    async leaveRoomMembership(roomId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const room = await this.getRoomById(roomId)
      if (!room) throw new Error("Room not found")
      if (room.author === userId) throw new Error("Author cannot leave their own room")
      if (!room.members.includes(userId)) return
      await asP(ssbClient.publish, { type: "roomMember", target: room.rootId, member: userId, on: false, createdAt: new Date().toISOString() })
    },

    async ingestKeys() { await ingestOwnTribeKeys() },

    async pruneOrphanKeys() {
      if (!ownCrypto || typeof ownCrypto.getAllRootIds !== "function") return 0
      try {
        const ssbClient = await openSsb()
        const tomb = buildValidatedTombstoneSet(await readAll(ssbClient))
        let removed = 0
        for (const rid of ownCrypto.getAllRootIds()) {
          if (tomb.has(rid)) { try { ownCrypto.dropKey(rid); removed += 1 } catch (_) {} }
        }
        return removed
      } catch (_) { return 0 }
    },

    async getRoomById(id) {
      const ssbClient = await openSsb()
      const idx = memoIndex('rooms', await readAll(ssbClient), buildIndex)
      const root = idx.strictRootOf(id)
      const tip = idx.contentTipOf(root)
      if (idx.tomb.has(tip)) return null
      const node = idx.nodes.get(tip)
      if (!node || node.c.type !== "room") return null
      const tKeys = node.c.tribeId ? await getTribeKeysFor(node.c.tribeId) : []
      const room = buildRoom(node, root, tKeys, idx.resolveMembers(root))
      if (!room) return null
      room.isClosed = room.status === "CLOSED"
      return roomCollab.fold(room, await collectRooms(idx))
    },

    async listAll({ filter = "all", viewerId } = {}) {
      const ssbClient = await openSsb()
      const uid = viewerId || ssbClient.id
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      let list = roomCollab.visibleThenCollapsed(await collectRooms(idx), uid)
      try { await ensureMemberKeys(ssbClient, messages, list) } catch (_) {}
      if (filter === "mine") list = list.filter(r => r.author === uid)
      else if (filter === "recent") list = list.filter(r => new Date(r.createdAt).getTime() >= Date.now() - RECENT_MS)
      else if (filter === "open") list = list.filter(r => r.type === "OPEN" && !r.isClosed)
      else if (filter === "invite") list = list.filter(r => r.type === "INVITE-ONLY" && !r.isClosed)
      else if (filter === "closed") list = list.filter(r => r.isClosed)
      return list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    },

    async generateInvite(roomId, opts = {}) {
      const ssbClient = await openSsb()
      const room = await this.getRoomById(roomId)
      if (!room) throw new Error("Room not found")
      if (room.author !== ssbClient.id) throw new Error("Only the author can generate invites")
      const rootId = await this.resolveRootId(roomId)
      const keyHex = lookupKey(rootId)
      const code = crypto.randomBytes(INVITE_BYTES).toString("hex")
      let invite = code
      const pubFlag = opts.public ? { public: true } : {}
      const inviteSalt = generateInviteSalt()
      if (keyHex) {
        invite = opts.public
          ? { code, ek: encryptForInvite(keyHex, code, inviteSalt), salt: inviteSalt, ...pubFlag }
          : { ch: hashCode(code, inviteSalt), ek: encryptForInvite(keyHex, code, inviteSalt), salt: inviteSalt }
      } else {
        invite = opts.public ? { code, public: true } : { ch: hashCode(code, inviteSalt), salt: inviteSalt }
      }
      await this.updateRoomById(roomId, { invites: [...room.invites, invite] })
      return code
    },

    async getOpenInvite(roomId) {
      return openInviteOf(await this.getRoomById(roomId).catch(() => null))
    },

    async generateOpenInvite(roomId) {
      const room = await this.getRoomById(roomId)
      if (!room) throw new Error("Room not found")
      if ((Array.isArray(room.invites) ? room.invites : []).find(inv => typeof inv === "object" && inv.public === true)) throw new Error("An open invitation already exists")
      return this.generateInvite(roomId, { public: true })
    },

    async removeOpenInvite(roomId) {
      const ssbClient = await openSsb()
      const room = await this.getRoomById(roomId)
      if (!room) throw new Error("Room not found")
      if (room.author !== ssbClient.id) throw new Error("Only the author can remove invites")
      await this.updateRoomById(roomId, { invites: (Array.isArray(room.invites) ? room.invites : []).filter(inv => !(typeof inv === "object" && inv.public === true)) })
      await rotateRoomKey(await this.resolveRootId(roomId), [...new Set([room.author, ...(Array.isArray(room.members) ? room.members : [])])])
    },

    async joinByInvite(code) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const rooms = await collectRooms(buildIndex(await readAll(ssbClient)))
      let matchedRoom = null
      let matchedInvite = null
      for (const r of rooms) {
        for (const inv of r.invites) {
          if (inviteMatches(inv, code)) { matchedRoom = r; matchedInvite = inv; break }
        }
        if (matchedRoom) break
      }
      if (!matchedRoom) throw new Error("Invalid or expired invite code")
      if (matchedRoom.members.includes(userId)) throw new Error("Already a member")
      const isPublic = typeof matchedInvite === "object" && matchedInvite.public === true
      const resolvedRootId = await this.resolveRootId(matchedRoom.rootId)
      const token = inviteToken(matchedInvite) || code
      if (!isPublic) {
        const idx = buildIndex(await readAll(ssbClient))
        if (idx.isCodeConsumed(resolvedRootId, token) || idx.isCodeConsumed(resolvedRootId, code)) throw new Error("Invite already used")
      }
      let roomKey = null
      if (typeof matchedInvite === "object" && matchedInvite.ek) {
        roomKey = decryptFromInvite(matchedInvite.ek, code, matchedInvite.salt)
        if (roomKey) setRoomKey(resolvedRootId, roomKey)
      }
      await this.addMemberToRoom(matchedRoom.rootId, userId, isPublic ? "" : token)
      if (tribeCrypto && roomKey) {
        try {
          const ssbKeys = require("../server/node_modules/ssb-keys")
          const memberKeys = {}
          try { memberKeys[userId] = tribeCrypto.boxKeyForMember(roomKey, userId, ssbKeys) } catch (_) {}
          if (matchedRoom.author && matchedRoom.author !== userId) {
            try { memberKeys[matchedRoom.author] = tribeCrypto.boxKeyForMember(roomKey, matchedRoom.author, ssbKeys) } catch (_) {}
          }
          if (Object.keys(memberKeys).length) await asP(ssbClient.publish, { type: "tribe-keys", tribeId: resolvedRootId, generation: 1, memberKeys })
        } catch (_) {}
      }
      return matchedRoom.rootId
    },

    async liveParams(room) {
      if (!room || !RID.test(String(room.rid || "")) || !room.token) return null
      let secrets = null
      if (room.tribeId) secrets = (await getTribeKeysFor(room.tribeId)).slice(0, 1)
      else if (room.type === "INVITE-ONLY") secrets = lookupKeys(room.rootId).slice(0, 1)
      return {
        rid: room.rid, owner: room.author, token: room.token, hub: room.hub, address: room.hubAddress,
        ref: room.rootId, title: room.title, secrets: Array.isArray(secrets) && secrets.length ? secrets : null,
        ...(room.roomId ? { roomId: room.roomId } : {})
      }
    },

    async occupancy(room) {
      const ph = await phone()
      if (!ph || typeof ph.roomCount !== "function" || !room || !RID.test(String(room.rid || ""))) return null
      try { return await asP(ph.roomCount, { rid: room.rid, hub: room.hub }) } catch (_) { return null }
    },

    async occupancies(rooms) {
      const out = new Map()
      await Promise.all((rooms || []).map(async (r) => { const o = await this.occupancy(r); if (o) out.set(r.rootId, o) }))
      return out
    },

    async join(room) {
      const ph = await phone()
      if (!ph || typeof ph.roomJoin !== "function") throw new Error("unavailable")
      const params = await this.liveParams(room)
      if (!params) throw new Error("invalid")
      return asP(ph.roomJoin, params)
    },

    async leave() {
      const ph = await phone()
      if (ph && typeof ph.roomLeave === "function") await asP(ph.roomLeave).catch(() => null)
    },

    async mute(flag) {
      const ph = await phone()
      if (!ph || typeof ph.roomMute !== "function") return null
      return asP(ph.roomMute, !!flag)
    },

    async hand(flag) {
      const ph = await phone()
      if (!ph || typeof ph.roomHand !== "function") return null
      return asP(ph.roomHand, !!flag)
    },

    async silence(id, flag) {
      const ph = await phone()
      if (!ph || typeof ph.silence !== "function") return null
      return asP(ph.silence, { id, on: !!flag })
    },

    async recStart() {
      const ph = await phone()
      if (!ph || typeof ph.roomRecStart !== "function") return null
      return asP(ph.roomRecStart)
    },

    async recStop() {
      const ph = await phone()
      if (!ph || typeof ph.roomRecStop !== "function") return null
      return asP(ph.roomRecStop)
    },

    async notify(flag) {
      const ph = await phone()
      if (!ph || typeof ph.roomNotify !== "function") return null
      return asP(ph.roomNotify, !!flag)
    },

    async clearEvents() {
      const ph = await phone()
      if (!ph || typeof ph.roomClearEvents !== "function") return null
      return asP(ph.roomClearEvents)
    },

    async liveState() {
      const ph = await phone()
      return ph && typeof ph.roomState === "function" ? rpcValue(ph.roomState) : null
    },

    async findByNumber(value, viewerId) {
      const number = normalizeNumber(value)
      if (!number) return []
      return (await this.listAll({ filter: "all", viewerId })).filter(r => r.number === number && !r.isClosed)
    }
  }
  return api
}
