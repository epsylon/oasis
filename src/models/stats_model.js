const pull = require('../server/node_modules/pull-stream');
const os = require('os');
const fs = require('fs');

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => {
    if (!ssb) ssb = await cooler.open();
    return ssb;
  };

  const types = [
    'bookmark', 'event', 'task', 'votes', 'report', 'feed',
    'image', 'audio', 'video', 'document', 'transfer', 'post', 'tribe', 'market'
  ];

  const getFolderSize = (folderPath) => {
    const files = fs.readdirSync(folderPath);
    let totalSize = 0;
    for (const file of files) {
      const filePath = `${folderPath}/${file}`;
      const stats = fs.statSync(filePath);
      totalSize += stats.isDirectory() ? getFolderSize(filePath) : stats.size;
    }
    return totalSize;
  };

  const formatSize = (sizeInBytes) => {
    if (sizeInBytes < 1024) return `${sizeInBytes} B`;
    const kb = 1024, mb = kb * 1024, gb = mb * 1024, tb = gb * 1024;
    if (sizeInBytes < mb) return `${(sizeInBytes / kb).toFixed(2)} KB`;
    if (sizeInBytes < gb) return `${(sizeInBytes / mb).toFixed(2)} MB`;
    if (sizeInBytes < tb) return `${(sizeInBytes / gb).toFixed(2)} GB`;
    return `${(sizeInBytes / tb).toFixed(2)} TB`;
  };

  const getStats = async (filter = 'ALL') => {
    const ssbClient = await openSsb();
    const userId = ssbClient.id;

    const messages = await new Promise((res, rej) => {
      pull(
        ssbClient.createLogStream(),
        pull.collect((err, msgs) => err ? rej(err) : res(msgs))
      );
    });

    const allMsgs = messages.filter(m => m.value?.content);
    const tombstoned = new Set(allMsgs.filter(m => m.value.content.type === 'tombstone' && m.value.content.target).map(m => m.value.content.target));
    const replacesMap = new Map();
    const userMsgs = filter === 'MINE' ? allMsgs.filter(m => m.value.author === userId) : allMsgs;

    const latestByType = {};
    const opinions = {};
    const content = {};

    for (const t of types) {
      latestByType[t] = new Map();
      opinions[t] = 0;
      content[t] = 0;
    }

    for (const m of userMsgs) {
      const k = m.key;
      const c = m.value.content;
      const t = c.type;
      if (!types.includes(t)) continue;
      if (tombstoned.has(k)) continue;
      if (c.replaces) replacesMap.set(c.replaces, k);
      latestByType[t].set(k, { msg: m, content: c });
    }

    for (const replacedId of replacesMap.keys()) {
      for (const t of types) {
        latestByType[t].delete(replacedId);
      }
    }

    for (const t of types) {
      const values = Array.from(latestByType[t].values());
      content[t] = values.length;
      opinions[t] = values.filter(e => (e.content.opinions_inhabitants || []).length > 0).length;
    }

    const tribeContents = Array.from(latestByType['tribe'].values()).map(e => e.content);
    const memberTribes = tribeContents
      .filter(c => Array.isArray(c.members) && c.members.includes(userId))
      .map(c => c.name || c.title || c.id);

    const inhabitants = new Set(allMsgs.map(m => m.value.author)).size;

    const secretStat = fs.statSync(`${os.homedir()}/.ssb/secret`);
    const createdAt = secretStat.birthtime.toLocaleString();

    const folderSize = getFolderSize(`${os.homedir()}/.ssb`);
    const flumeSize = getFolderSize(`${os.homedir()}/.ssb/flume`);
    const blobsSize = getFolderSize(`${os.homedir()}/.ssb/blobs`);

    return {
      id: userId,
      createdAt,
      inhabitants,
      content,
      opinions,
      memberTribes,
      userTombstoneCount: userMsgs.filter(m => m.value.content.type === 'tombstone').length,
      networkTombstoneCount: allMsgs.filter(m => m.value.content.type === 'tombstone').length,
      folderSize: formatSize(folderSize),
      statsBlockchainSize: formatSize(flumeSize),
      statsBlobsSize: formatSize(blobsSize)
    };
  };

  return { getStats };
};

