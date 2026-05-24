const pull = require('../server/node_modules/pull-stream');
const { getConfig } = require('../configs/config-manager.js');
const { buildValidatedTombstoneSet } = require('./tombstone_validator');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

const extractBlobId = str => {
  if (!str || typeof str !== 'string') return null;
  const match = str.match(/\(([^)]+\.sha256)\)/);
  return match ? match[1] : str.trim();
};

const parseCSV = str => str
  ? str.split(',').map(s => s.trim()).filter(Boolean)
  : [];

module.exports = ({ cooler }) => {
  let ssb;

  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  return {
    type: 'curriculum',

    async createCV(data, photoBlobId) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const content = {
        type: 'curriculum',
        author: userId,
        name: data.name,
        description: data.description,
        photo: extractBlobId(photoBlobId) || null,
        contact: userId,
        personalSkills: parseCSV(data.personalSkills),
        personalExperiences: data.personalExperiences || '',
        oasisExperiences: data.oasisExperiences || '',
        oasisSkills: parseCSV(data.oasisSkills),
        educationExperiences: data.educationExperiences || '',
        educationalSkills: parseCSV(data.educationalSkills),
        languages: data.languages || '',
        professionalExperiences: data.professionalExperiences || '',
        professionalSkills: parseCSV(data.professionalSkills),
        location: data.location || 'UNKNOWN',
        status: data.status || 'LOOKING FOR WORK',
        preferences: data.preferences || 'REMOTE WORKING',
        visibility: String(data.visibility || 'PUBLIC').toUpperCase() === 'HIDDEN' ? 'HIDDEN' : 'PUBLIC',
        createdAt: new Date().toISOString()
      };
      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg));
      });
    },

    async updateCV(id, data, photoBlobId) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      const old = await new Promise((res, rej) =>
        ssbClient.get(id, (err, msg) =>
          err || !msg?.content
            ? rej(err || new Error('CV not found'))
            : res(msg)
        )
      );

      if (old.content.author !== userId) {
        throw new Error('Not the author');
      }

      const tombstone = {
        type: 'tombstone',
        target: id,
        deletedAt: new Date().toISOString()
      };

      await new Promise((res, rej) =>
        ssbClient.publish(tombstone, err => err ? rej(err) : res())
      );

      const content = {
        type: 'curriculum',
        author: userId,
        name: data.name,
        description: data.description,
        photo: extractBlobId(photoBlobId) || null,
        contact: userId,
        personalSkills: parseCSV(data.personalSkills),
        personalExperiences: data.personalExperiences || '',
        oasisExperiences: data.oasisExperiences || '',
        oasisSkills: parseCSV(data.oasisSkills),
        educationExperiences: data.educationExperiences || '',
        educationalSkills: parseCSV(data.educationalSkills),
        languages: data.languages || '',
        professionalExperiences: data.professionalExperiences || '',
        professionalSkills: parseCSV(data.professionalSkills),
        location: data.location || 'UNKNOWN',
        status: data.status || 'LOOKING FOR WORK',
        preferences: data.preferences || 'REMOTE WORKING',
        visibility: data.visibility !== undefined
          ? (String(data.visibility).toUpperCase() === 'HIDDEN' ? 'HIDDEN' : 'PUBLIC')
          : (old.content.visibility || 'PUBLIC'),
        createdAt: old.content.createdAt,
        updatedAt: new Date().toISOString()
      };

      return new Promise((resolve, reject) => {
        ssbClient.publish(content, (err, msg) => err ? reject(err) : resolve(msg));
      });
    },

    async deleteCVById(id) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;

      const msg = await new Promise((res, rej) =>
        ssbClient.get(id, (err, msg) =>
          err || !msg?.content
            ? rej(new Error('CV not found'))
            : res(msg)
        )
      );

      if (msg.content.author !== userId) {
        throw new Error('Not the author');
      }

      const tombstone = {
        type: 'tombstone',
        target: id,
        deletedAt: new Date().toISOString()
      };

      return new Promise((resolve, reject) => {
        ssbClient.publish(tombstone, (err, result) => err ? reject(err) : resolve(result));
      });
    },

    async getCVByUserId(targetUserId) {
      const ssbClient = await openSsb();
      const userId = ssbClient.id;
      const authorId = targetUserId || userId;

      return new Promise((resolve, reject) => {
        pull(
          ssbClient.createLogStream({ limit: logLimit }),
          pull.collect((err, msgs) => {
            if (err) return reject(err);

            const tombstoned = buildValidatedTombstoneSet(msgs);

            const cvMsgs = msgs
              .filter(m =>
                m.value?.content?.type === 'curriculum' &&
                m.value.content.author === authorId &&
                !tombstoned.has(m.key)
              )
              .sort((a, b) => b.value.timestamp - a.value.timestamp);

            if (!cvMsgs.length) {
              return resolve(null);
            }

            const latest = cvMsgs[0];
            const c = latest.value.content;
            const visibility = String(c.visibility || 'PUBLIC').toUpperCase() === 'HIDDEN' ? 'HIDDEN' : 'PUBLIC';
            if (visibility === 'HIDDEN' && authorId !== userId) return resolve(null);
            resolve({ id: latest.key, ...c, visibility });
          })
        );
      });
    }
  };
};

