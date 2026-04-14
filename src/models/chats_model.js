const pull = require("../server/node_modules/pull-stream")
const crypto = require("crypto")
const { getConfig } = require("../configs/config-manager.js")
const logLimit = getConfig().ssbLogStream?.limit || 1000

const safeArr = (v) => (Array.isArray(v) ? v : [])
const safeText = (v) => String(v || "").trim()
const normalizeTags = (raw) => {
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) return raw.map(t => String(t || "").trim()).filter(Boolean)
  return String(raw).split(",").map(t => t.trim()).filter(Boolean)
}

const INVITE_CODE_BYTES = 16
const VALID_STATUS = ["OPEN", "INVITE-ONLY", "CLOSED"]

module.exports = ({ cooler, tribeCrypto }) => {
  let ssb
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb }

  const readAll = async (ssbClient) =>
    new Promise((resolve, reject) =>
      pull(ssbClient.createLogStream({ limit: logLimit }), pull.collect((err, msgs) => err ? reject(err) : resolve(msgs)))
    )

  const buildIndex = (messages) => {
    const tomb = new Set()
    const nodes = new Map()
    const parent = new Map()
    const child = new Map()
    const msgNodes = new Map()

    for (const m of messages) {
      const k = m.key
      const v = m.value || {}
      const c = v.content
      if (!c) continue
      if (c.type === "tombstone" && c.target) { tomb.add(c.target); continue }
      if (c.type === "chat") {
        nodes.set(k, { key: k, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
        if (c.replaces) { parent.set(k, c.replaces); child.set(c.replaces, k) }
      } else if (c.type === "chatMessage") {
        msgNodes.set(k, { key: k, ts: v.timestamp || m.timestamp || 0, c, author: v.author })
      }
    }

    const rootOf = (id) => { let cur = id; while (parent.has(cur)) cur = parent.get(cur); return cur }
    const tipOf = (id) => { let cur = id; while (child.has(cur)) cur = child.get(cur); return cur }

    const roots = new Set()
    for (const id of nodes.keys()) roots.add(rootOf(id))
    const tipByRoot = new Map()
    for (const r of roots) tipByRoot.set(r, tipOf(r))

    return { tomb, nodes, parent, child, rootOf, tipOf, tipByRoot, msgNodes }
  }

  const resolveKeyChainSets = (chatRootId) => {
    if (!tribeCrypto) return []
    const keys = tribeCrypto.getKeys(chatRootId)
    return keys.map(k => [k])
  }

  const buildChat = (node, rootId) => {
    const rawC = node.c || {}
    if (rawC.type !== "chat") return null

    let c = rawC
    if (tribeCrypto && c.encryptedPayload) {
      const keyChainSets = resolveKeyChainSets(rootId)
      c = tribeCrypto.decryptContent(c, keyChainSets)
    }

    return {
      key: node.key,
      rootId,
      title: c.title || "",
      description: c.description || "",
      image: c.image || null,
      category: c.category || "",
      status: c.status || "OPEN",
      tags: safeArr(c.tags),
      members: safeArr(c.members),
      invites: safeArr(c.invites),
      author: c.author || node.author,
      createdAt: c.createdAt || new Date(node.ts).toISOString(),
      updatedAt: c.updatedAt || null,
      encrypted: !!c.encrypted,
      tribeId: c.tribeId || null
    }
  }

  const buildMessage = (node, chatRootId) => {
    const c = node.c || {}
    if (c.type !== "chatMessage") return null

    let text = c.text || ""
    if (tribeCrypto && c.encryptedText) {
      const keys = tribeCrypto.getKeys(chatRootId)
      for (const keyHex of keys) {
        try {
          text = tribeCrypto.decryptWithKey(c.encryptedText, keyHex)
          break
        } catch (_) {}
      }
    }

    return {
      key: node.key,
      chatId: c.chatId || "",
      text,
      image: c.image || null,
      author: c.author || node.author,
      createdAt: c.createdAt || new Date(node.ts).toISOString()
    }
  }

  const publishTombstone = async (ssbClient, tipId) =>
    new Promise((resolve, reject) => {
      const tombstone = { type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: ssbClient.id }
      ssbClient.publish(tombstone, (e) => e ? reject(e) : resolve())
    })

  return {
    type: "chat",

    async resolveRootId(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) throw new Error("Not found")
      let root = tip
      while (idx.parent.has(root)) root = idx.parent.get(root)
      return root
    },

    async resolveCurrentId(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) throw new Error("Not found")
      return tip
    },

    async createChat(title, description, image, category, status, tagsRaw, tribeId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const blobId = image ? String(image).trim() || null : null
      const tags = normalizeTags(tagsRaw)
      const st = VALID_STATUS.includes(String(status).toUpperCase()) ? String(status).toUpperCase() : "OPEN"
      const now = new Date().toISOString()

      let content = {
        type: "chat",
        title: safeText(title),
        description: safeText(description),
        image: blobId,
        category: safeText(category),
        status: st,
        tags,
        members: [userId],
        invites: [],
        author: userId,
        createdAt: now,
        updatedAt: now,
        ...(tribeId ? { tribeId } : {})
      }

      if (tribeCrypto) {
        const chatKey = tribeCrypto.generateTribeKey()
        const result = await new Promise((resolve, reject) => {
          const plainContent = Object.assign({}, content)
          ssbClient.publish(plainContent, (err, msg) => err ? reject(err) : resolve(msg))
        })
        tribeCrypto.setKey(result.key, chatKey, 1)
        return result
      }

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
      })
    },

    async updateChatById(id, data) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Chat not found"))
          const c = item.content

          const rawAuthor = c.author || (c.encryptedPayload ? null : undefined)
          if (rawAuthor && rawAuthor !== userId) return reject(new Error("Not the author"))

          const rootId = tipId
          const messages = []
          const node = { key: tipId, c, author: item.author, ts: item.timestamp || 0 }
          const chat = buildChat(node, rootId)
          if (!chat) return reject(new Error("Invalid chat"))

          const updated = {
            type: "chat",
            replaces: tipId,
            title: data.title !== undefined ? safeText(data.title) : chat.title,
            description: data.description !== undefined ? safeText(data.description) : chat.description,
            image: data.image !== undefined ? (data.image ? String(data.image).trim() || null : chat.image) : chat.image,
            category: data.category !== undefined ? safeText(data.category) : chat.category,
            status: data.status !== undefined ? (VALID_STATUS.includes(String(data.status).toUpperCase()) ? String(data.status).toUpperCase() : chat.status) : chat.status,
            tags: data.tags !== undefined ? normalizeTags(data.tags) : chat.tags,
            members: chat.members,
            invites: chat.invites,
            author: chat.author,
            createdAt: chat.createdAt,
            updatedAt: new Date().toISOString()
          }

          ssbClient.publish({ type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }, (e1) => {
            if (e1) return reject(e1)
            ssbClient.publish(updated, (e2, res) => e2 ? reject(e2) : resolve(res))
          })
        })
      })
    },

    async deleteChatById(id) {
      const tipId = await this.resolveCurrentId(id)
      const ssbClient = await openSsb()
      const userId = ssbClient.id

      return new Promise((resolve, reject) => {
        ssbClient.get(tipId, (err, item) => {
          if (err || !item?.content) return reject(new Error("Chat not found"))
          if (item.content.author && item.content.author !== userId) return reject(new Error("Not the author"))
          ssbClient.publish({ type: "tombstone", target: tipId, deletedAt: new Date().toISOString(), author: userId }, (e) => e ? reject(e) : resolve())
        })
      })
    },

    async closeChatById(id) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) throw new Error("Not found")
      let root = tip
      while (idx.parent.has(root)) root = idx.parent.get(root)

      const node = idx.nodes.get(tip)
      if (!node) throw new Error("Not found")
      const chat = buildChat(node, root)
      if (!chat) throw new Error("Invalid chat")
      if (chat.author !== userId) throw new Error("Not the author")

      const updated = {
        type: "chat",
        replaces: tip,
        title: chat.title,
        description: chat.description,
        image: chat.image,
        category: chat.category,
        status: "CLOSED",
        tags: chat.tags,
        members: chat.members,
        invites: chat.invites,
        author: chat.author,
        createdAt: chat.createdAt,
        updatedAt: new Date().toISOString()
      }

      await publishTombstone(ssbClient, tip)
      return new Promise((resolve, reject) => {
        ssbClient.publish(updated, (e, res) => e ? reject(e) : resolve(res))
      })
    },

    async getChatById(id) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      let tip = id
      while (idx.child.has(tip)) tip = idx.child.get(tip)
      if (idx.tomb.has(tip)) return null

      const node = idx.nodes.get(tip)
      if (!node || node.c.type !== "chat") return null

      let root = tip
      while (idx.parent.has(root)) root = idx.parent.get(root)

      const chat = buildChat(node, root)
      if (!chat) return null
      return chat
    },

    async listAll({ filter = "all", q = "", sort = "recent", viewerId } = {}) {
      const ssbClient = await openSsb()
      const uid = viewerId || ssbClient.id
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)
      const now = Date.now()

      const items = []
      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.nodes.get(tipId)
        if (!node || node.c.type !== "chat") continue
        const chat = buildChat(node, rootId)
        if (!chat) continue
        items.push(chat)
      }

      let list = items

      if (filter === "mine") list = list.filter(c => c.author === uid)
      else if (filter === "recent") list = list.filter(c => new Date(c.createdAt).getTime() >= now - 86400000)
      else if (filter === "open") list = list.filter(c => c.status === "OPEN" || c.status === "INVITE-ONLY")
      else if (filter === "closed") list = list.filter(c => c.status === "CLOSED")

      if (q) {
        const qq = q.toLowerCase()
        list = list.filter(c => {
          const t = String(c.title || "").toLowerCase()
          const d = String(c.description || "").toLowerCase()
          const cat = String(c.category || "").toLowerCase()
          const tags = safeArr(c.tags).join(" ").toLowerCase()
          return t.includes(qq) || d.includes(qq) || cat.includes(qq) || tags.includes(qq)
        })
      }

      list = list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return list
    },

    async generateInvite(chatId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const chat = await this.getChatById(chatId)
      if (!chat) throw new Error("Chat not found")
      if (chat.author !== userId) throw new Error("Only the author can generate invites")

      const code = crypto.randomBytes(INVITE_CODE_BYTES).toString("hex")
      let invite = code

      if (tribeCrypto) {
        const chatKey = tribeCrypto.getKey(chat.rootId)
        if (chatKey) {
          const ek = tribeCrypto.encryptForInvite(chatKey, code)
          invite = { code, ek, gen: tribeCrypto.getGen(chat.rootId) }
        }
      }

      const invites = [...chat.invites, invite]
      await this.updateChatById(chatId, { invites, members: chat.members, status: chat.status, title: chat.title, description: chat.description, image: chat.image, category: chat.category, tags: chat.tags })
      return code
    },

    async joinByInvite(code) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      let matchedChat = null
      let matchedInvite = null

      for (const [rootId, tipId] of idx.tipByRoot.entries()) {
        if (idx.tomb.has(tipId)) continue
        const node = idx.nodes.get(tipId)
        if (!node || node.c.type !== "chat") continue
        const chat = buildChat(node, rootId)
        if (!chat || !chat.invites.length) continue

        for (const inv of chat.invites) {
          if (typeof inv === "string" && inv === code) {
            matchedChat = chat; matchedInvite = inv; break
          }
          if (typeof inv === "object" && inv.code === code) {
            matchedChat = chat; matchedInvite = inv; break
          }
        }
        if (matchedChat) break
      }

      if (!matchedChat) throw new Error("Invalid or expired invite code")
      if (matchedChat.members.includes(userId)) throw new Error("Already a participant")

      if (tribeCrypto && typeof matchedInvite === "object" && matchedInvite.ek) {
        const chatKey = tribeCrypto.decryptFromInvite(matchedInvite.ek, code)
        tribeCrypto.setKey(matchedChat.rootId, chatKey, matchedInvite.gen || 1)
      }

      const members = [...matchedChat.members, userId]
      const invites = matchedChat.invites.filter(inv => {
        if (typeof inv === "string") return inv !== code
        return inv.code !== code
      })

      await this.updateChatById(matchedChat.key, { members, invites, status: matchedChat.status, title: matchedChat.title, description: matchedChat.description, image: matchedChat.image, category: matchedChat.category, tags: matchedChat.tags })
      return matchedChat.key
    },

    async joinChat(chatId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const chat = await this.getChatById(chatId)
      if (!chat) throw new Error("Chat not found")
      if (chat.status === "CLOSED") throw new Error("Chat is closed")
      if (chat.members.includes(userId)) return chat.key

      const members = [...chat.members, userId]

      if (tribeCrypto) {
        const chatKey = tribeCrypto.getKey(chat.rootId)
        if (chatKey && ssbClient.keys) {
          try {
            tribeCrypto.boxKeyForMember(chatKey, userId, ssbClient.keys)
          } catch (_) {}
        }
      }

      await this.updateChatById(chatId, { members, invites: chat.invites, status: chat.status, title: chat.title, description: chat.description, image: chat.image, category: chat.category, tags: chat.tags })
      return chat.key
    },

    async leaveChat(chatId) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const chat = await this.getChatById(chatId)
      if (!chat) throw new Error("Chat not found")
      if (chat.author === userId) throw new Error("Author cannot leave their own chat")
      const members = chat.members.filter(m => m !== userId)
      await this.updateChatById(chatId, { members, invites: chat.invites, status: chat.status, title: chat.title, description: chat.description, image: chat.image, category: chat.category, tags: chat.tags })
    },

    async sendMessage(chatId, text, image = null) {
      const ssbClient = await openSsb()
      const userId = ssbClient.id
      const chat = await this.getChatById(chatId)
      if (!chat) throw new Error("Chat not found")
      if (chat.status === "CLOSED") throw new Error("Chat is closed")
      if (!chat.members.includes(userId)) {
        if (chat.status === "OPEN") await this.joinChat(chatId)
        else throw new Error("Not a participant")
      }

      const messages = await readAll(ssbClient)
      const oneHourAgo = Date.now() - 60 * 60 * 1000
      const recentCount = messages.filter(m => {
        const c = m.value?.content
        return c?.type === "chatMessage" && c?.chatId === chat.rootId && m.value?.author === userId && (m.value?.timestamp || 0) >= oneHourAgo
      }).length
      if (recentCount >= 3) throw new Error("Rate limit: max 3 messages per hour")

      const now = new Date().toISOString()
      let content = {
        type: "chatMessage",
        chatId: chat.rootId,
        author: userId,
        createdAt: now
      }
      if (image) content.image = image

      if (tribeCrypto) {
        const chatKey = tribeCrypto.getKey(chat.rootId)
        if (chatKey) {
          content.encryptedText = tribeCrypto.encryptWithKey(safeText(text), chatKey)
        } else {
          content.text = safeText(text)
        }
      } else {
        content.text = safeText(text)
      }

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg))
      })
    },

    async listMessages(chatRootId) {
      const ssbClient = await openSsb()
      const messages = await readAll(ssbClient)
      const idx = buildIndex(messages)

      const result = []
      for (const [k, node] of idx.msgNodes.entries()) {
        if (node.c.chatId !== chatRootId) continue
        const msg = buildMessage(node, chatRootId)
        if (msg) result.push(msg)
      }

      result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      return result
    },

    async getParticipants(chatRootId) {
      const chat = await this.getChatById(chatRootId)
      if (!chat) return []
      return chat.members
    }
  }
}
