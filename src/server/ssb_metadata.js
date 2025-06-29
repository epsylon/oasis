const fs = require('fs');
const path = require('path');
const pkg = require('./package.json');
const config = require('./ssb_config');
const updater = require('../backend/updater.js');

let printed = false;
let checkedForUpdate = false; 

function getModules() {
  const nodeModulesPath = path.resolve(__dirname, 'node_modules');
  try {
    return fs.readdirSync(nodeModulesPath)
      .filter(m => fs.existsSync(path.join(nodeModulesPath, m, 'package.json')));
  } catch {
    return [];
  }
}

const colors = {
  blue: '\x1b[38;5;33m',
  yellow: '\x1b[38;5;226m',
  orange: '\x1b[38;5;214m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

async function checkForUpdate() {
  if (checkedForUpdate) return; 
  checkedForUpdate = true; 

  const updateFlagPath = path.join(__dirname, '../server/.update_required');
  if (fs.existsSync(updateFlagPath)) {
    fs.unlinkSync(updateFlagPath);
  }
  await updater.getRemoteVersion();
}

async function printMetadata(mode, modeColor = colors.cyan) {
  if (printed) return;
  printed = true;

  const modules = getModules();
  const version = pkg.version;
  const name = pkg.name;
  const logLevel = config.logging?.level || 'info';
  const publicKey = config.keys?.public || '';

  console.log("=========================");
  console.log(`Mode: ${modeColor}${mode}${colors.reset}`);
  console.log("=========================");
  console.log(`Package: ${colors.blue}${name} ${colors.yellow}[Version: ${version}]${colors.reset}`);
  console.log("Logging Level:", logLevel);
  console.log(`Oasis ID: [ ${colors.orange}@${publicKey}${colors.reset} ]`);
  console.log("=========================");
  console.log("Modules loaded: [", modules.length, "]");
  console.log("=========================");

  // Check for updates
  await checkForUpdate();
}

module.exports = {
  printMetadata,
  colors
};
