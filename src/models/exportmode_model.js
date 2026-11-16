const os = require('os');
const fs = require('fs');
const path = require('path');

module.exports = {
  exportSSB: async (outputPath) => {
    try {
      const ssbPath = require('../configs/state-manager').ssbDir();
      const output = fs.createWriteStream(outputPath, { mode: 0o600 });
      const archive = require('../server/node_modules/archiver')('zip', {
        zlib: { level: 9 }
      });
      const closed = new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); });
      archive.pipe(output);

      const PRIVATE_DIRS = [path.join('oasis', 'keys'), path.join('oasis', 'multiverse')];
      const skipped = (rel, file) => file === 'secret' || file.startsWith('secret.') || file === 'oasis-config.json' || PRIVATE_DIRS.some((dir) => rel === dir || rel.startsWith(dir + path.sep));
      const addDirectoryToArchive = (dirPath) => {
        for (const file of fs.readdirSync(dirPath)) {
          const filePath = path.join(dirPath, file);
          const rel = path.relative(ssbPath, filePath);
          if (skipped(rel, file)) continue;
          const stat = fs.lstatSync(filePath);
          if (stat.isDirectory()) addDirectoryToArchive(filePath);
          else if (stat.isFile()) archive.file(filePath, { name: rel });
        }
      };

      addDirectoryToArchive(ssbPath);
      await archive.finalize();
      await closed;

      return outputPath;
    } catch (error) {
      throw new Error("Error exporting data: " + error.message);
    }
  }
};
