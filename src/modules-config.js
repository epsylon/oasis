const fs = require('fs');
const path = require('path');

const configFilePath = path.join(__dirname, 'modules.json');

if (!fs.existsSync(configFilePath)) {
  const defaultConfig = {
    invitesMod: 'on',
    walletMod: 'on',
  };
  fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig, null, 2));
}

const getConfig = () => {
  const configData = fs.readFileSync(configFilePath);
  return JSON.parse(configData);
};

const saveConfig = (newConfig) => {
  fs.writeFileSync(configFilePath, JSON.stringify(newConfig, null, 2));
};

module.exports = {
  getConfig,
  saveConfig,
};

