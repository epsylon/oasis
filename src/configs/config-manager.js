const fs = require('fs');
const path = require('path');

const configFilePath = path.join(__dirname, 'oasis-config.json');

if (!fs.existsSync(configFilePath)) {
  const defaultConfig = {
    modules: {
      invitesMod: 'on',
      walletMod: 'on',
    },
    wallet: {
      url: 'http://localhost:7474',
      user: 'ecoinrpc',
      pass: 'ecoinrpc',
      fee: 0.01,
    }
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

