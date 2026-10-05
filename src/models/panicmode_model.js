const fs = require('fs');
const path = require('path');

module.exports = {
  removeSSB: async () => {
    try {
      const ssbPath = require('../server/ssb_config').path;
      await fs.promises.rm(ssbPath, { recursive: true, force: true });
    } catch (error) {
      throw new Error("Error deleting data: " + error.message);
    }
  }
};
