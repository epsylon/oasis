const pull = require('../server/node_modules/pull-stream');
const os = require('os');
const fs = require('fs');
const { getConfig } = require('../configs/config-manager.js');
const logLimit = getConfig().ssbLogStream?.limit || 1000;

module.exports = ({ cooler }) => {
  let ssb;
  const openSsb = async () => { if (!ssb) ssb = await cooler.open(); return ssb; };

  const types = [
    'bookmark','event','task','votes','report','feed',
    'image','audio','video','document','transfer','post','tribe','market','forum','job'
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
        ssbClient.createLogStream({ limit: logLimit }),
        pull.collect((err, msgs) => err ? rej(err) : res(msgs))
      );
    });

    const allMsgs = messages.filter(m => m.value?.content);
    const tombTargets = new Set(
      allMsgs
        .filter(m => m.value.content.type === 'tombstone' && m.value.content.target)
        .map(m => m.value.content.target)
    );

    const scopedMsgs = filter === 'MINE' ? allMsgs.filter(m => m.value.author === userId) : allMsgs;

    const byType = {};
    const parentOf = {};
    for (const t of types) {
      byType[t] = new Map();
      parentOf[t] = new Map();
    }

    for (const m of scopedMsgs) {
      const k = m.key;
      const c = m.value.content;
      const t = c.type;
      if (!types.includes(t)) continue;
      byType[t].set(k, { key: k, ts: m.value.timestamp, content: c });
      if (c.replaces) parentOf[t].set(k, c.replaces);
    }

    const findRoot = (t, id) => {
      let cur = id;
      const pMap = parentOf[t];
      while (pMap.has(cur)) cur = pMap.get(cur);
      return cur;
    };

    const tipOf = {};
    for (const t of types) {
      tipOf[t] = new Map();
      const pMap = parentOf[t];
      const fwd = new Map();
      for (const [child, parent] of pMap.entries()) {
        fwd.set(parent, child);
      }
      const allMap = byType[t];
      const roots = new Set(Array.from(allMap.keys()).map(id => findRoot(t, id)));
      for (const root of roots) {
        let tip = root;
        while (fwd.has(tip)) tip = fwd.get(tip);
        if (tombTargets.has(tip)) continue;
        const node = allMap.get(tip) || allMap.get(root);
        if (node) tipOf[t].set(root, node);
      }
    }

    const content = {};
    const opinions = {};
    for (const t of types) {
      let vals = Array.from(tipOf[t].values()).map(v => v.content);
      if (t === 'forum') {
        vals = vals.filter(c => !(c.root && tombTargets.has(c.root)));
      }
      content[t] = vals.length;
      opinions[t] = vals.filter(e => Array.isArray(e.opinions_inhabitants) && e.opinions_inhabitants.length > 0).length;
    }

    const tribeVals = Array.from(tipOf['tribe'].values()).map(v => v.content);
    const memberTribes = tribeVals
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
      userTombstoneCount: scopedMsgs.filter(m => m.value.content.type === 'tombstone').length,
      networkTombstoneCount: allMsgs.filter(m => m.value.content.type === 'tombstone').length,
      folderSize: formatSize(folderSize),
      statsBlockchainSize: formatSize(flumeSize),
      statsBlobsSize: formatSize(blobsSize)
    };
  };

  return { getStats };
};

