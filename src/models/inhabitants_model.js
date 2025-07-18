const pull = require('../server/node_modules/pull-stream');
const ssbClientGUI = require("../client/gui");
const coolerInstance = ssbClientGUI({ offline: require('../server/ssb_config').offline });
const models = require("../models/main_models");
const { about, friend } = models({
  cooler: coolerInstance,
  isPublic: require('../server/ssb_config').public,
});

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  return {
    async listInhabitants(options = {}) {
      const { filter = 'all', search = '', location = '', language = '', skills = '' } = options;
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const timeoutPromise = (timeout) => new Promise((_, reject) => setTimeout(() => reject('Timeout'), timeout));
      const fetchUserImage = (feedId) => {
        return Promise.race([
          about.image(feedId),
          timeoutPromise(5000) 
        ]).catch(() => '/assets/images/default-avatar.png'); 
      };

      if (filter === 'GALLERY') {
        const feedIds = await new Promise((res, rej) => {
          pull(
            ssbClient.createLogStream(),
            pull.filter(msg => {
              const c = msg.value?.content;
              const a = msg.value?.author;
              return c &&
                c.type === 'about' &&
                c.type !== 'tombstone' &&
                typeof c.name === 'string' &&
                typeof c.about === 'string' &&
                c.about === a;
            }),
            pull.collect((err, msgs) => err ? rej(err) : res(msgs))
          );
        });

        const uniqueFeedIds = Array.from(new Set(feedIds.map(r => r.value.author).filter(Boolean)));

        const users = await Promise.all(
          uniqueFeedIds.map(async (feedId) => {
            const name = await about.name(feedId);
            const description = await about.description(feedId);
            const image = await fetchUserImage(feedId); 
            const photo =
              typeof image === 'string'
                ? `/image/256/${encodeURIComponent(image)}`
                : '/assets/images/default-avatar.png';
            return { id: feedId, name, description, photo };
          })
        );

        return users;
      }

      if (filter === 'all') {
        const feedIds = await new Promise((res, rej) => {
          pull(
            ssbClient.createLogStream(),
            pull.filter(msg => {
              const c = msg.value?.content;
              const a = msg.value?.author;
              return c &&
                c.type === 'about' &&
                c.type !== 'tombstone' &&
                typeof c.name === 'string' &&
                typeof c.about === 'string' &&
                c.about === a;
            }),
            pull.collect((err, msgs) => err ? rej(err) : res(msgs))
          );
        });

        const uniqueFeedIds = Array.from(new Set(feedIds.map(r => r.value.author).filter(Boolean)));

        const users = await Promise.all(
          uniqueFeedIds.map(async (feedId) => {
            const name = await about.name(feedId);
            const description = await about.description(feedId);
            const image = await fetchUserImage(feedId);
            const photo =
              typeof image === 'string'
                ? `/image/256/${encodeURIComponent(image)}`
                : '/assets/images/default-avatar.png';

            return { id: feedId, name, description, photo };
          })
        );

        const deduplicated = Array.from(new Map(users.filter(u => u && u.id).map(u => [u.id, u])).values());
        let filtered = deduplicated;

        if (search) {
          const q = search.toLowerCase();
          filtered = filtered.filter(u =>
            u.name?.toLowerCase().includes(q) ||
            u.description?.toLowerCase().includes(q) ||
            u.id?.toLowerCase().includes(q)
          );
        }

        return filtered;
      }

      if (filter === 'contacts') {
        const all = await this.listInhabitants({ filter: 'all' });
        const result = [];
        for (const user of all) {
          const rel = await friend.getRelationship(user.id);
          if (rel.following) result.push(user);
        }
        return Array.from(new Map(result.map(u => [u.id, u])).values());
      }

      if (filter === 'blocked') {
        const all = await this.listInhabitants({ filter: 'all' });
        const result = [];
        for (const user of all) {
          const rel = await friend.getRelationship(user.id);
          if (rel.blocking) result.push({ ...user, isBlocked: true });
        }
        return Array.from(new Map(result.map(u => [u.id, u])).values());
      }

      if (filter === 'SUGGESTED') {
        const all = await this.listInhabitants({ filter: 'all' });
        const result = [];
        for (const user of all) {
          if (user.id === userId) continue;
          const rel = await friend.getRelationship(user.id);
          if (!rel.following && !rel.blocking && rel.followsMe) {
            const cv = await this.getCVByUserId(user.id);
            if (cv) result.push({ ...this._normalizeCurriculum(cv), mutualCount: 1 });
          }
        }
        return Array.from(new Map(result.map(u => [u.id, u])).values())
          .sort((a, b) => (b.mutualCount || 0) - (a.mutualCount || 0));
      }

      if (filter === 'CVs' || filter === 'MATCHSKILLS') {
        const records = await new Promise((res, rej) => {
          pull(
            ssbClient.createLogStream(),
            pull.filter(msg =>
              msg.value.content?.type === 'curriculum' &&
              msg.value.content?.type !== 'tombstone'
            ),
            pull.collect((err, msgs) => err ? rej(err) : res(msgs))
          );
        });

        let cvs = records.map(r => this._normalizeCurriculum(r.value.content));
        cvs = Array.from(new Map(cvs.map(u => [u.id, u])).values());

        if (filter === 'CVs') {
          if (search) {
            const q = search.toLowerCase();
            cvs = cvs.filter(u =>
              u.name.toLowerCase().includes(q) ||
              u.description.toLowerCase().includes(q) ||
              u.skills.some(s => s.toLowerCase().includes(q))
            );
          }
          if (location) {
            cvs = cvs.filter(u => u.location?.toLowerCase() === location.toLowerCase());
          }
          if (language) {
            cvs = cvs.filter(u => u.languages.map(l => l.toLowerCase()).includes(language.toLowerCase()));
          }
          if (skills) {
            const skillList = skills.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
            cvs = cvs.filter(u => skillList.every(s => u.skills.map(k => k.toLowerCase()).includes(s)));
          }
          return cvs;
        }

        if (filter === 'MATCHSKILLS') {
          const cv = await this.getCVByUserId();
          const userSkills = cv
            ? [
                ...cv.personalSkills,
                ...cv.oasisSkills,
                ...cv.educationalSkills,
                ...cv.professionalSkills
              ].map(s => s.toLowerCase())
            : [];
          if (!userSkills.length) return [];
          const matches = cvs.map(c => {
            if (c.id === userId) return null;
            const common = c.skills.map(s => s.toLowerCase()).filter(s => userSkills.includes(s));
            if (!common.length) return null;
            return { ...c, commonSkills: common };
          }).filter(Boolean);
          return matches.sort((a, b) => b.commonSkills.length - a.commonSkills.length);
        }
      }

      return [];
    },

    _normalizeCurriculum(c) {
      const photo =
        typeof c.photo === 'string'
          ? `/image/256/${encodeURIComponent(c.photo)}`
          : '/assets/images/default-avatar.png';

      return {
        id: c.author,
        name: c.name,
        description: c.description,
        photo,
        skills: [
          ...c.personalSkills,
          ...c.oasisSkills,
          ...c.educationalSkills,
          ...c.professionalSkills
        ],
        location: c.location,
        languages: typeof c.languages === 'string'
          ? c.languages.split(',').map(x => x.trim())
          : Array.isArray(c.languages) ? c.languages : [],
        createdAt: c.createdAt
      };
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

    async _getLatestAboutById(id) {
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
    }
  };
};

