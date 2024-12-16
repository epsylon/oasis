const axios = require("axios");
const {existsSync, readFileSync} = require("fs");
const {join} = require("path");
  
const localpackage = join("package.json");
const remoteUrl = "https://code.03c8.net/KrakensLab/oasis/src/master/package.json" // Official SNH-Oasis
const remoteUrl2 = "https://github.com/epsylon/oasis/blob/main/package.json" // Mirror SNH-Oasis

// Splitted function
async function checkMirror(callback) {
  try {
    // Try fetching from the mirror URL
    const { data } = await axios.get(remoteUrl2, { responseType: "text" });
    diffVersion(data);
  } catch (error) {
    console.error("Error fetching from mirror URL:", error.message);
    callback("error");
  }
}

function diffVersion(body, callback) {
  let remoteVersion = body
    .split('<li class="L3" rel="L3">')
    .pop()
    .split("</li>")[0];
  remoteVersion = remoteVersion
    .split("&#34;version&#34;: &#34;")
    .pop()
    .split("&#34;,")[0];
  let localVersion = readFileSync(localpackage, "utf8");
  localVersion = localVersion
    .split('"name":')
    .pop()
    .split('"description":')[0];
  localVersion = localVersion.split('"version"').pop().split('"')[1];
  
  let checkversion = ""

  if (remoteVersion != localVersion) {
    checkversion = "required";
  } else {
    checkversion = "";
  }
  callback(checkversion);
}

exports.getRemoteVersion = (callback) => {
  (async () => {
    if (existsSync(".git")) {
      try {

        // Now uses axios to get the package
        const { data } = await axios.get(remoteUrl, { responseType: "text" });
        diffVersion(data, callback);
      } catch (error) {
        checkMirror(callback);
      }
    }  
  })();
}
