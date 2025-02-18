const fetch = require('../server/node_modules/node-fetch');
const { existsSync, readFileSync } = require('fs');
const { join } = require('path');

const localpackage = join(__dirname, '../server/package.json');
const remoteUrl = 'https://code.03c8.net/KrakensLab/oasis/raw/master/package.json'; // Official SNH-Oasis
const remoteUrl2 = 'https://raw.githubusercontent.com/epsylon/oasis/main/package.json'; // Mirror SNH-Oasis

async function extractVersionFromText(text) {
  try {
    const versionMatch = text.match(/"version":\s*"([^"]+)"/); 
    if (versionMatch) {
      return versionMatch[1];
    } else {
      throw new Error('Version not found in the response.');
    }
  } catch (error) {
    console.error("Error extracting version:", error.message);
    return null;
  }
}

async function diffVersion(body, callback) {
  try {
    const remoteData = JSON.parse(body);
    const remoteVersion = remoteData.version;

    const localData = JSON.parse(readFileSync(localpackage, 'utf8'));
    const localVersion = localData.version; 

    if (remoteVersion !== localVersion) {
      callback("required"); 
    } else {
      callback("");  // No update required
    }
  } catch (error) {
    console.error("Error comparing versions:", error.message);
    callback("error");
  }
}

async function checkMirror(callback) {
  try {
    const response = await fetch(remoteUrl2, {
      method: 'GET',
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', 
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Referer': 'https://raw.githubusercontent.com',
        'Origin': 'https://raw.githubusercontent.com'
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.text();
    callback(null, data);
  } catch (error) {
    console.error("Error fetching from mirror URL:", error.message);
    callback(error);
  }
}

exports.getRemoteVersion = async () => {
  if (existsSync('../../.git')) { 
    try {
      const response = await fetch(remoteUrl, {
        method: 'GET',
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', 
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Referer': 'https://code.03c8.net',
          'Origin': 'https://code.03c8.net'
        }
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = await response.text();
      diffVersion(data, (status) => {
        if (status === "required") {
          global.ck = "required";
          console.log("\noasis@version: new code updates are available:\n\n1) Run Oasis and go to 'Settings' tab\n2) Click at 'Get updates' button to download latest code\n3) Restart Oasis when finished\n");
        } else {
          console.log("\noasis@version: no updates required.\n");
        }
      });
    } catch (error) {
      console.error("Error fetching from official URL:", error.message);
      checkMirror((err, data) => {
        if (err) {
          console.error("Error fetching from mirror URL:", err.message);
        } else {
          diffVersion(data, (status) => {
            if (status === "required") {
              global.ck = "required";
              console.log("\noasis@version: new code updates are available:\n\n1) Run Oasis and go to 'Settings' tab\n2) Click at 'Get updates' button to download latest code\n3) Restart Oasis when finished\n");
            } else {
              console.log("\noasis@version: no updates required.\n");
            }
          });
        }
      });
    }
  }
};

