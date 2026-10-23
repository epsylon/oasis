#!/usr/bin/env node
process.env.OASIS_TEST = '1';
const fs = require('fs');
const path = require('path');
const os = require('os');
if (!process.env.ssb_path) process.env.ssb_path = process.env.OASIS_TEST_SSB || path.join(os.homedir(), '.ssb-oasis-test');
fs.mkdirSync(process.env.ssb_path, { recursive: true });
if (fs.realpathSync(process.env.ssb_path) === path.join(fs.realpathSync(os.homedir()), '.ssb')) {
  console.error('refusing to run the tests on your ~/.ssb');
  process.exit(3);
}

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

const tests = [];

function describe(name, fn) {
  const suite = { name, tests: [] };
  const t = (testName, testFn) => {
    suite.tests.push({ name: testName, fn: testFn });
  };
  fn(t);
  tests.push(suite);
}

global.describe = describe;

const ROOT = __dirname;

function loadAll(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f === 'helpers' || f.startsWith('.')) continue;
    const p = path.join(dir, f);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) loadAll(p);
    else if (f.endsWith('.test.js')) require(p);
  }
}

const args = process.argv.slice(2);
const target = args[0];

if (target) {
  const targetDir = path.join(ROOT, target);
  if (!fs.existsSync(targetDir)) {
    console.error(`${RED}Test directory not found: ${target}${RESET}`);
    process.exit(2);
  }
  loadAll(targetDir);
} else {
  loadAll(ROOT);
}

const TEST_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS) || 300000;
let running = null;
let stray = 0;
process.removeAllListeners('uncaughtException');
process.on('uncaughtException', (err) => { stray++; console.log(`${RED}uncaught error${running ? ` while "${running}" was running` : ''}: ${(err && err.stack) || err}${RESET}`); });
const keepAlive = setInterval(() => {}, 1000);
process.on('exit', (code) => { if (running) console.log(`${RED}the process ended with code ${code} while "${running}" was still running: something let the event loop drain${RESET}`); });
const withTimeout = (fn, name) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`test timed out after ${TEST_TIMEOUT_MS} ms`)), TEST_TIMEOUT_MS);
  Promise.resolve().then(fn).then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
});
(async () => {
  let total = 0, passed = 0, failed = 0;
  const failures = [];
  const startTime = Date.now();
  for (const suite of tests) {
    console.log(`\n${YELLOW}■ ${suite.name}${RESET}`);
    for (const t of suite.tests) {
      total++;
      running = `${suite.name} / ${t.name}`;
      try {
        await withTimeout(t.fn, t.name);
        passed++;
        console.log(`  ${GREEN}✓${RESET} ${t.name}`);
      } catch (e) {
        failed++;
        console.log(`  ${RED}✗ ${t.name}${RESET}`);
        console.log(`    ${RED}${e.message}${RESET}`);
        if (process.env.STACK) console.log(e.stack);
        failures.push({ suite: suite.name, test: t.name, err: e });
      }
    }
  }
  running = null;
  clearInterval(keepAlive);
  if (stray) { failed += stray; console.log(`${RED}${stray} uncaught error(s) during the run${RESET}`); }
  const ms = Date.now() - startTime;
  console.log(`\n${total === passed ? GREEN : RED}${passed}/${total} passed${failed ? ` (${failed} failed)` : ''} in ${ms}ms${RESET}\n`);
  if (failed && !process.env.STACK) console.log(`Run with STACK=1 to see stack traces`);
  process.exit(failed ? 1 : 0);
})();
