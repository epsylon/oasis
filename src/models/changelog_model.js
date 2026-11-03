const fs = require('fs');
const path = require('path');

const CHANGELOG_PATH = path.join(__dirname, '..', '..', 'docs', 'devs', 'CHANGELOG.txt');
const HEADER_RE = /^(\d{4}-\d{2}-\d{2})\s+·\s+OASIS\s+(\S+)$/;

const parseChangelog = (text) => {
  const entries = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    const head = HEADER_RE.exec(line);
    if (head) { entries.push({ date: head[1], version: head[2], changes: [] }); continue; }
    if (line.startsWith('- ') && entries.length) entries[entries.length - 1].changes.push(line.slice(2).trim());
  }
  return entries.filter((e) => e.changes.length);
};

module.exports = ({ file = CHANGELOG_PATH } = {}) => ({
  async list() {
    try { return parseChangelog(await fs.promises.readFile(file, 'utf8')); } catch (_) { return []; }
  }
});
module.exports.parseChangelog = parseChangelog;
