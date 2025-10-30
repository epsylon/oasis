const pull = require('../server/node_modules/pull-stream');
const ssbClientGUI = require("../client/gui");
const coolerInstance = ssbClientGUI({ offline: require('../server/ssb_config').offline });
const models = require("../models/main_models");
const { about, friend } = models({
  cooler: coolerInstance,
  isPublic: require('../server/ssb_config').public,
});
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

function toImageUrl(imgId, size=256){
  if (!imgId) return '/assets/images/default-avatar.png';
  if (typeof imgId === 'string' && imgId.startsWith('/image/')) return imgId.replace('/image/256/','/image/'+size+'/').replace('/image/512/','/image/'+size+'/');
  return `/image/${size}/${encodeURIComponent(imgId)}`;
}

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  async function getLastKarmaScore(feedId) {
    const ssbClient = await openSsb();
    return new Promise(resolve => {
      const src = ssbClient.messagesByType
        ? ssbClient.messagesByType({ type: "karmaScore", reverse: true })
        : ssbClient.createLogStream && ssbClient.createLogStream({ reverse: true });
      if (!src) return resolve(0);
      pull(
        src,
        pull.filter(msg => {
          const v = msg.value || msg;
          const c = v.content || {};
          return v.author === feedId && c.type === "karmaScore" && typeof c.karmaScore !== "undefined";
        }),
        pull.take(1),
        pull.collect((err, arr) => {
          if (err || !arr || !arr.length) return resolve(0);
          const v = arr[0].value || arr[0];
          resolve(v.content.karmaScore || 0);
        })
      );
    });
  }

  async function getLastActivityTimestamp(feedId) {
    const ssbClient = await openSsb();
    const norm = (t) => (t && t < 1e12 ? t * 1000 : t || 0);
    return new Promise((resolve) => {
      pull(
        ssbClient.createUserStream({ id: feedId, reverse: true }),
        pull.filter(m => m && m.value && m.value.content && m.value.content.type !== 'tombstone'),
        pull.take(1),
        pull.collect((err, arr) => {
          if (err || !arr || !arr.length) return resolve(null);
          const m = arr[0];
          const ts = norm((m.value && m.value.timestamp) || m.timestamp);
          resolve(ts || null);
        })
      );
    });
  }

  function bucketLastActivity(ts) {
    if (!ts) return { bucket: 'red', range: '≥6m' };
    const now = Date.now();
    const delta = Math.max(0, now - ts);
    const days = delta / 86400000;
    if (days < 14) return { bucket: 'green', range: '<2w' };
    if (days < 182.5) return { bucket: 'orange', range: '2w–6m' };
    return { bucket: 'red', range: '≥6m' };
  }

  const timeoutPromise = (timeout) => new Promise((_, reject) => setTimeout(() => reject('Timeout'), timeout));
  const fetchUserImageUrl = async (feedId, size=256) => {
    try{
      const img = await Promise.race([about.image(feedId), timeoutPromise(5000)]);
      const id = typeof img === 'string' ? img : (img && (img.link || img.url));
      return toImageUrl(id, size);
    }catch{
      return '/assets/images/default-avatar.png';
    }
  };

  async function listAllBase(ssbClient) {
    const authorsMsgs = await new Promise((res, rej) => {
      pull(
        ssbClient.createLogStream({ limit: logLimit, reverse: true }),
        pull.filter(msg => !!msg.value?.author && msg.value?.content?.type !== 'tombstone'),
        pull.collect((err, msgs) => err ? rej(err) : res(msgs))
      );
    });
    const uniqueFeedIds = Array.from(new Set(authorsMsgs.map(r => r.value.author).filter(Boolean)));
    const users = await Promise.all(
      uniqueFeedIds.map(async (feedId) => {
        const rawName = await about.name(feedId);
        const name = rawName || feedId.slice(0, 10);
        const description = await about.description(feedId);
        const photo = await fetchUserImageUrl(feedId, 256);
        const lastActivityTs = await getLastActivityTimestamp(feedId);
        const { bucket, range } = bucketLastActivity(lastActivityTs);
        return { id: feedId, name, description, photo, lastActivityTs, lastActivityBucket: bucket, lastActivityRange: range };
      })
    );
    return Array.from(new Map(users.filter(u => u && u.id).map(u => [u.id, u])).values());
  }

  function normalizeRel(rel) {
    const r = rel || {};
    const iFollow = !!(r.following || r.iFollow || r.youFollow || r.i_follow || r.isFollowing);
    const followsMe = !!(r.followsMe || r.followingMe || r.follows_me || r.theyFollow || r.isFollowedBy);
    const blocking = !!(r.blocking || r.iBlock || r.isBlocking);
    const blockedBy = !!(r.blocked || r.blocksMe || r.isBlockedBy);
    return { iFollow, followsMe, blocking, blockedBy };
  }

  return {
    async listInhabitants(options = {}) {
      const { filter = 'all', search = '', location = '', language = '', skills = '' } = options;
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      if (filter === 'GALLERY') {
        const users = await listAllBase(ssbClient);
        return users;
      }

      if (filter === 'all' || filter === 'TOP KARMA' || filter === 'TOP ACTIVITY') {
        let users = await listAllBase(ssbClient);
        if (search) {
          const q = search.toLowerCase();
          users = users.filter(u =>
            (u.name || '').toLowerCase().includes(q) ||
            (u.description || '').toLowerCase().includes(q) ||
            (u.id || '').toLowerCase().includes(q)
          );
        }
        const withMetrics = await Promise.all(users.map(async u => {
          const karmaScore = await getLastKarmaScore(u.id);
          return { ...u, karmaScore };
        }));
        if (filter === 'TOP KARMA') return withMetrics.sort((a, b) => (b.karmaScore || 0) - (a.karmaScore || 0));
        if (filter === 'TOP ACTIVITY') return withMetrics.sort((a, b) => (b.lastActivityTs || 0) - (a.lastActivityTs || 0));
        return withMetrics;
      }

      if (filter === 'contacts') {
        const all = await this.listInhabitants({ filter: 'all' });
        const result = [];
        for (const user of all) {
          const rel = await friend.getRelationship(user.id).catch(() => ({}));
          if (rel && (rel.following || rel.iFollow)) result.push(user);
        }
        return Array.from(new Map(result.map(u => [u.id, u])).values());
      }

      if (filter === 'blocked') {
        const all = await this.listInhabitants({ filter: 'all' });
        const result = [];
        for (const user of all) {
          const rel = await friend.getRelationship(user.id).catch(() => ({}));
          const n = normalizeRel(rel);
          if (n.blocking) result.push({ ...user, isBlocked: true });
        }
        return Array.from(new Map(result.map(u => [u.id, u])).values());
      }

      if (filter === 'SUGGESTED') {
        const base = await listAllBase(ssbClient);
        const rels = await Promise.all(
          base.map(async u => {
            if (u.id === userId) return null;
            const rel = await friend.getRelationship(u.id).catch(() => ({}));
            const n = normalizeRel(rel);
            const karmaScore = await getLastKarmaScore(u.id);
            return { user: u, rel: n, karmaScore };
          })
        );
        const candidates = rels.filter(Boolean).filter(x => !x.rel.iFollow && !x.rel.blocking && !x.rel.blockedBy);
        const enriched = candidates.map(x => ({
          ...x.user,
          karmaScore: x.karmaScore,
          mutualCount: x.rel.followsMe ? 1 : 0
        }));
        const unique = Array.from(new Map(enriched.map(u => [u.id, u])).values());
        return unique.sort((a, b) => (b.karmaScore || 0) - (a.karmaScore || 0) || (b.lastActivityTs || 0) - (a.lastActivityTs || 0));
      }

      if (filter === 'CVs' || filter === 'MATCHSKILLS') {
        const records = await new Promise((res, rej) => {
          pull(
            ssbClient.createLogStream({ limit: logLimit, reverse: true}),
            pull.filter(msg =>
              msg.value.content?.type === 'curriculum' &&
              msg.value.content?.type !== 'tombstone'
            ),
            pull.collect((err, msgs) => err ? rej(err) : res(msgs))
          );
        });

        let cvs = records.map(r => r.value.content);
        cvs = Array.from(new Map(cvs.map(u => [u.author, u])).values());

        if (filter === 'CVs') {
          let out = await Promise.all(cvs.map(async c => {
            const photo = await fetchUserImageUrl(c.author, 256);
            const lastActivityTs = await getLastActivityTimestamp(c.author);
            const { bucket, range } = bucketLastActivity(lastActivityTs);
            const base = this._normalizeCurriculum(c, photo);
            return { ...base, lastActivityTs, lastActivityBucket: bucket, lastActivityRange: range };
          }));
          if (search) {
            const q = search.toLowerCase();
            out = out.filter(u =>
              (u.name || '').toLowerCase().includes(q) ||
              (u.description || '').toLowerCase().includes(q) ||
              u.skills.some(s => (s || '').toLowerCase().includes(q))
            );
          }
          if (location) out = out.filter(u => (u.location || '').toLowerCase() === location.toLowerCase());
          if (language) out = out.filter(u => u.languages.map(l => l.toLowerCase()).includes(language.toLowerCase()));
          if (skills) {
            const skillList = skills.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            out = out.filter(u => skillList.every(s => u.skills.map(k => (k || '').toLowerCase()).includes(s)));
          }
          return out;
        }

        if (filter === 'MATCHSKILLS') {
          const base = await Promise.all(cvs.map(async c => {
            const photo = await fetchUserImageUrl(c.author, 256);
            const lastActivityTs = await getLastActivityTimestamp(c.author);
            const { bucket, range } = bucketLastActivity(lastActivityTs);
            const norm = this._normalizeCurriculum(c, photo);
            return { ...norm, lastActivityTs, lastActivityBucket: bucket, lastActivityRange: range };
          }));
          const mecv = await this.getCVByUserId();
          const userSkills = mecv
            ? [
                ...(mecv.personalSkills || []),
                ...(mecv.oasisSkills || []),
                ...(mecv.educationalSkills || []),
                ...(mecv.professionalSkills || [])
              ].map(s => (s || '').toLowerCase())
            : [];
          if (!userSkills.length) return [];
          const matches = base.map(c => {
            if (c.id === userId) return null;
            const common = c.skills.map(s => (s || '').toLowerCase()).filter(s => userSkills.includes(s));
            if (!common.length) return null;
            const matchScore = common.length / userSkills.length;
            return { ...c, commonSkills: common, matchScore };
          }).filter(Boolean);
          return matches.sort((a, b) => b.matchScore - a.matchScore);
        }
      }

      return [];
    },

    _normalizeCurriculum(c, photoUrl) {
      const photo = photoUrl || toImageUrl(c.photo, 256);
      return {
        id: c.author,
        name: c.name,
        description: c.description,
        photo,
        skills: [
          ...(c.personalSkills || []),
          ...(c.oasisSkills || []),
          ...(c.educationalSkills || []),
          ...(c.professionalSkills || [])
        ],
        location: c.location,
        languages: typeof c.languages === 'string'
          ? c.languages.split(',').map(x => x.trim())
          : Array.isArray(c.languages) ? c.languages : [],
        createdAt: c.createdAt
      };
    },

    async getLatestAboutById(id) {
      const ssbClient = await openSsb();
      const records = await new Promise((res, rej) => {
        pull(
          ssbClient.createUserStream({ id }),
          pull.filter(msg =>
            msg.value.content?.type === 'about' &&
            msg.value.content?.type !== 'tombstone'
          ),
          pull.collect((err, msgs) => err ? rej(err) : res(msgs))
        );
      });
      if (!records.length) return null;
      const latest = records.sort((a, b) => b.value.timestamp - a.value.timestamp)[0];
      return latest.value.content;
    },

    async getFeedByUserId(id) {
      const ssbClient = await openSsb();
      const targetId = id || ssbClient.id;
      const records = await new Promise((res, rej) => {
        pull(
          ssbClient.createUserStream({ id: targetId }),
          pull.filter(msg =>
            msg.value &&
            msg.value.content &&
            typeof msg.value.content.text === 'string' &&
            msg.value.content?.type !== 'tombstone'
          ),
          pull.collect((err, msgs) => err ? rej(err) : res(msgs))
        );
      });
      return records
        .filter(m => typeof m.value.content.text === 'string')
        .sort((a, b) => b.value.timestamp - a.value.timestamp)
        .slice(0, 10);
    },

    async getCVByUserId(id) {
      const ssbClient = await openSsb();
      const targetId = id || ssbClient.id;
      const records = await new Promise((res, rej) => {
        pull(
          ssbClient.createUserStream({ id: targetId }),
          pull.filter(msg =>
            msg.value.content?.type === 'curriculum' &&
            msg.value.content?.type !== 'tombstone'
          ),
          pull.collect((err, msgs) => err ? rej(err) : res(msgs))
        );
      });
      return records.length ? records[records.length - 1].value.content : null;
    },

    async getPhotoUrlByUserId(id, size = 256) {
      return await fetchUserImageUrl(id, size);
    },

    async getLastActivityTimestampByUserId(id) {
      return await getLastActivityTimestamp(id);
    },

    bucketLastActivity(ts) {
      return bucketLastActivity(ts);
    }
  };
};

