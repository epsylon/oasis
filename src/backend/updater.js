const { existsSync, readFileSync, writeFileSync, unlinkSync } = require('fs');
const { join } = require('path');

const localpackage = join(__dirname, '../server/package.json');
const remoteUrl = 'https://code.03c8.net/KrakensLab/oasis/raw/master/src/server/package.json'; // Official SNH-Oasis
const remoteUrl2 = 'https://raw.githubusercontent.com/epsylon/oasis/refs/heads/main/src/server/package.json'; // Mirror SNH-Oasis

let printed = false;
const repoRoot = join(__dirname, '..', '..');
const updateFlagFile = join(__dirname, '../server/.update_required');

const git = (args, cwd = repoRoot) => new Promise((resolve) => {
  require('child_process').execFile('git', args, { cwd, timeout: 60000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (err, out) => resolve(err ? '' : String(out || '').trim()));
});
const commitOf = (line) => {
  const [hash, date, ...rest] = String(line || '').split('\t');
  return hash ? { hash, date: date || '', subject: rest.join('\t') } : null;
};
const cleanOrigin = (url) => String(url || '').replace(/\/\/[^@\/]*@/, '//').replace(/\.git$/, '');

async function collectDetails(root = repoRoot) {
  if (!existsSync(join(root, '.git'))) return null;
  const installed = commitOf(await git(['log', '-1', '--format=%h%x09%cI%x09%s'], root));
  await git(['fetch', '--quiet'], root);
  const upstream = (await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], root)) || 'origin/master';
  const available = commitOf(await git(['log', '-1', '--format=%h%x09%cI%x09%s', upstream], root));
  const commits = (await git(['log', '--format=%h%x09%cI%x09%s', '-n', '10', `HEAD..${upstream}`], root)).split('\n').map(commitOf).filter(Boolean);
  const count = Number(await git(['rev-list', '--count', `HEAD..${upstream}`], root)) || commits.length;
  const stat = await git(['diff', '--shortstat', 'HEAD', upstream], root);
  const num = (re) => { const m = stat.match(re); return m ? Number(m[1]) : 0; };
  return {
    installed, available, commits, count,
    files: num(/(\d+) files? changed/), insertions: num(/(\d+) insertions?/), deletions: num(/(\d+) deletions?/),
    origin: cleanOrigin(await git(['remote', 'get-url', 'origin'], root))
  };
}
exports.collectDetails = collectDetails;

exports.readUpdateInfo = () => {
  if (!existsSync(updateFlagFile)) return null;
  try {
    const info = JSON.parse(readFileSync(updateFlagFile, 'utf8'));
    return info && info.required ? info : { required: true };
  } catch (_) {
    return { required: true };
  }
};

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

    const updateFlagPath = join(__dirname, "../server/.update_required");

    if (remoteVersion !== localVersion) {
      const alreadyKnown = existsSync(updateFlagPath);
      writeFileSync(updateFlagPath, JSON.stringify({ required: true, version: remoteVersion, installedVersion: localVersion }));
      collectDetails().then((details) => {
        if (details && existsSync(updateFlagPath)) writeFileSync(updateFlagPath, JSON.stringify({ required: true, version: remoteVersion, installedVersion: localVersion, details }));
      }).catch(() => {});
      if (!alreadyKnown) {
        try {
          const { notify, i18nNow } = require('./desktopNotify');
          const i18n = i18nNow();
          notify(i18n.notifyUpdateLabel, `${i18n.updateBannerText} (${remoteVersion})`);
        } catch (_) {}
      }
      callback("required");
    } else {
      if (existsSync(updateFlagPath)) unlinkSync(updateFlagPath);
      callback("");  // no updates required
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
      headers: { 'Accept': 'application/json, text/plain, */*' },
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.text();
    callback(null, data);
  } catch (error) {
    console.error("\noasis@version: no updates requested.\n");
    callback(error);
  }
}

const networkAllowed = () => {
  if (process.argv.includes('--offline') || process.env.OASIS_NETWORK_PAUSED === '1') return false;
  try { if (require('../server/ssb_config').offline === true) return false; } catch (_) {}
  try { if (require('../configs/config-manager.js').getConfig().networkPaused === true) return false; } catch (_) {}
  return true;
};

exports.getRemoteVersion = async () => {
  if (!networkAllowed()) return;
  if (existsSync(join(__dirname, '..', '..', '.git'))) {
    try {
      const response = await fetch(remoteUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json, text/plain, */*' },
        signal: AbortSignal.timeout(20000)
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const data = await response.text();
      diffVersion(data, (status) => {
        if (status === "required" && !printed) {
          printed = true; 
          console.log("\noasis@version: new code updates are available!\n\n1) Run Oasis and go to 'Settings' tab\n2) Click at 'Get updates' button to download latest code\n3) Restart Oasis when finished\n");
        } else if (status === "") {
          console.log("\noasis@version: no updates requested.\n");
        }
      });
    } catch (error) {
      checkMirror((err, data) => {
        if (err) {
          console.error("\noasis@version: no updates requested.\n");
        } else {
          diffVersion(data, (status) => {
            if (status === "required" && !printed) {
              printed = true; 
              console.log("\noasis@version: new code updates are available!\n\n1) Run Oasis and go to 'Settings' tab\n2) Click at 'Get updates' button to download latest code\n3) Restart Oasis when finished\n");
            } else {
              console.log("oasis@version: no updates requested.\n");
            }
          });
        }
      });
    }
  }
};

