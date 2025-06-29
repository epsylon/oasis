const pull = require('../server/node_modules/pull-stream');
const FileType = require("../server/node_modules/file-type");
const promisesFs = require('fs').promises;
const ssb = require("../client/gui");
const config = require("../server/SSB_server").config; 
const cooler = ssb({ offline: config.offline });

const handleBlobUpload = async function (ctx, fileFieldName) {
  if (!ctx.request.files || !ctx.request.files[fileFieldName]) {
    return null;
  }

  const blobUpload = ctx.request.files[fileFieldName];
  if (!blobUpload) return null;

  const data = await promisesFs.readFile(blobUpload.filepath);
  if (data.length === 0) return null;

  const ssbClient = await cooler.open();

  const blob = { name: blobUpload.name };
  blob.id = await new Promise((resolve, reject) => {
    pull(pull.values([data]), ssbClient.blobs.add((err, ref) => err ? reject(err) : resolve(ref)));
  });

  try {
    const fileType = await FileType.fromBuffer(data);
    blob.mime = fileType.mime;
  } catch {
    blob.mime = "application/octet-stream";
  }

  if (blob.mime.startsWith("image/")) return `\n![image:${blob.name}](${blob.id})`;
  if (blob.mime.startsWith("audio/")) return `\n[audio:${blob.name}](${blob.id})`;
  if (blob.mime.startsWith("video/")) return `\n[video:${blob.name}](${blob.id})`;
  if (blob.mime === "application/pdf") return `[pdf:${blob.name}](${blob.id})`;

  return `\n[${blob.name}](${blob.id})`;
};

module.exports = { handleBlobUpload };
