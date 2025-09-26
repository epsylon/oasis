const fs = require('fs');
const path = require('path');

const configFilePath = path.join(__dirname, 'oasis-config.json');

if (!fs.existsSync(configFilePath)) {
  const defaultConfig = {
    "themes": {
      "current": "Dark-SNH"
    },
    "modules": {
      "popularMod": "on",
      "topicsMod": "on",
      "summariesMod": "on",
      "latestMod": "on",
      "threadsMod": "on",
      "multiverseMod": "on",
      "invitesMod": "on",
      "walletMod": "on",
      "legacyMod": "on",
      "cipherMod": "on",
      "bookmarksMod": "on",
      "videosMod": "on",
      "docsMod": "on",
      "audiosMod": "on",
      "tagsMod": "on",
      "imagesMod": "on",
      "trendingMod": "on",
      "eventsMod": "on",
      "tasksMod": "on",
      "marketMod": "on",
      "tribesMod": "on",
      "governanceMod": "on",
      "reportsMod": "on",
      "opinionsMod": "on",
      "transfersMod": "on",
      "feedMod": "on",
      "pixeliaMod": "on",
      "agendaMod": "on",
      "aiMod": "on",
      "forumMod": "on",
      "jobsMod": "on",
      "projectsMod": "on",
      "bankingMod": "on"
    },
    "wallet": {
      "url": "http://localhost:7474",
      "user": "",
      "pass": "",
      "fee": "5"
    },
    "walletPub": {
      "url": "",
      "user": "",
      "pass": ""
    },
    "ai": {
      "prompt": "Provide an informative and precise response."
    },
    "ssbLogStream": {
      "limit": 2000
    },
    "homePage": "activity"
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
