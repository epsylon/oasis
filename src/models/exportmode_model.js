const os = require('os');
const fs = require('fs');
const path = require('path');
const archiver = require('../server/node_modules/archiver');

module.exports = {
  exportSSB: async (outputPath) => {
    try {
      const homeDir = os.homedir();
      const ssbPath = path.join(homeDir, '.ssb');
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });
      archive.pipe(output);

      const addDirectoryToArchive = (dirPath, archive) => {
        const files = fs.readdirSync(dirPath);
        let hasFiles = false;

        files.forEach((file) => {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);

          if (file === 'secret') {
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
