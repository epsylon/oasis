const os = require('os');
const fs = require('fs');
const path = require('path');

module.exports = {
  removeSSB: async () => {
    try {
      const homeDir = os.homedir();
      const ssbPath = path.join(homeDir, '.ssb');
      await fs.promises.rm(ssbPath, { recursive: true, force: true });
    } catch (error) {
      throw new Error("Error deleting data: " + error.message);
    }
  }
};
