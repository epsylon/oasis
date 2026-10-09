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
      archive.pipe(output);

      const addDirectoryToArchive = (dirPath, archive) => {
        const files = fs.readdirSync(dirPath);
        let hasFiles = false;

        files.forEach((file) => {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);

          const rel = path.relative(ssbPath, filePath);
          if (file === 'secret' || file.startsWith('secret.') || file === 'oasis-config.json' || rel === path.join('oasis', 'keys') || rel.startsWith(path.join('oasis', 'keys') + path.sep)) {
            return;
          }

          if (stat.isDirectory()) {
            addDirectoryToArchive(filePath, archive);
            archive.directory(filePath, path.relative(ssbPath, filePath));
            hasFiles = true;
          } else {
            archive.file(filePath, { name: path.relative(ssbPath, filePath) });
            hasFiles = true;
          }
        });

        if (!hasFiles) {
          archive.directory(dirPath, path.relative(ssbPath, dirPath));
        }
      };

      addDirectoryToArchive(ssbPath, archive);
      await archive.finalize();

      return outputPath;
    } catch (error) {
      throw new Error("Error exporting data: " + error.message);
    }
  }
};
