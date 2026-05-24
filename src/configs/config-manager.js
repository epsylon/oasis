const fs = require('fs');
const path = require('path');

const configFilePath = path.join(__dirname, 'oasis-config.json');

if (!fs.existsSync(configFilePath)) {
  const defaultConfig = {
    "themes": {
      "current": "Dark-SNH"
    },
    "ux": {
      "current": "blocks"
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
      "votesMod": "on",
      "tribesMod": "on",
      "reportsMod": "on",
      "opinionsMod": "on",
      "padsMod": "on",
      "calendarsMod": "on",
      "transfersMod": "on",
      "feedMod": "on",
      "pixeliaMod": "on",
      "melodyMod": "on",
      "agendaMod": "on",
      "aiMod": "on",
      "aiNavMod": "on",
      "forumMod": "on",
      "gamesMod": "on",
      "jobsMod": "on",
      "shopsMod": "on",
      "projectsMod": "on",
      "bankingMod": "on",
      "parliamentMod": "on",
      "courtsMod": "on",
      "favoritesMod": "on",
      "logsMod": "on",
      "mapsMod": "on",
      "chatsMod": "on",
      "torrentsMod": "on",
      "graphosMod": "on",
      "larpMod": "on"
    },
    "wallet": {
      "url": "http://localhost:7474",
      "user": "",
      "pass": "",
      "fee": "5"
    },
    "walletPub": {
      "pubId": ""
    },
    "ai": {
      "prompt": "Provide an informative and precise response."
    },
    "ssbLogStream": {
      "limit": 2000
    },
    "homePage": "activity",
    "language": "en",
    "wish": "whole",
    "pmVisibility": "whole",
    "lanBroadcasting": true
  };
  fs.writeFileSync(configFilePath, JSON.stringify(defaultConfig, null, 2));
}

const getConfig = () => {
  const configData = fs.readFileSync(configFilePath);
  const cfg = JSON.parse(configData);
  if (!['whole', 'mutuals', 'only-lan'].includes(cfg.wish)) cfg.wish = 'whole';
  if (cfg.pmVisibility !== 'whole' && cfg.pmVisibility !== 'mutuals') cfg.pmVisibility = 'whole';
  if (typeof cfg.ux === 'string') cfg.ux = { current: cfg.ux };
  if (!cfg.ux || typeof cfg.ux !== 'object') cfg.ux = { current: 'blocks' };
  if (cfg.ux.current === 'menus') cfg.ux.current = 'blocks';
  if (cfg.ux.current !== 'blocks' && cfg.ux.current !== 'ainav') cfg.ux.current = 'blocks';
  if (cfg.ux.current === 'ainav' && cfg.modules && cfg.modules.aiNavMod !== 'on') cfg.ux.current = 'blocks';
  return cfg;
};

const saveConfig = (newConfig) => {
  fs.writeFileSync(configFilePath, JSON.stringify(newConfig, null, 2));
};

module.exports = {
  getConfig,
  saveConfig,
};
