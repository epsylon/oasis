const fs = require('fs');
const path = require('path');

const ssbRefPath = path.resolve(__dirname, '../src/server/node_modules/ssb-ref/index.js');

if (fs.existsSync(ssbRefPath)) {
  const data = fs.readFileSync(ssbRefPath, 'utf8');
  const patchedData = data.replace('exports.parseAddress = deprecate(\'ssb-ref.parseAddress\', parseAddress)', 'exports.parseAddress = parseAddress');

  fs.writeFileSync(ssbRefPath, patchedData);
  console.log('[OASIS] [PATCH] Patched ssb-ref to remove deprecated usage of parseAddress');
}
