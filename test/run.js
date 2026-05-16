#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

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

(async () => {
  let total = 0, passed = 0, failed = 0;
  const failures = [];
  const startTime = Date.now();
  for (const suite of tests) {
    console.log(`\n${YELLOW}■ ${suite.name}${RESET}`);
    for (const t of suite.tests) {
      total++;
      try {
        await Promise.resolve(t.fn());
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
  const ms = Date.now() - startTime;
  console.log(`\n${total === passed ? GREEN : RED}${passed}/${total} passed${failed ? ` (${failed} failed)` : ''} in ${ms}ms${RESET}\n`);
  if (failed && !process.env.STACK) console.log(`Run with STACK=1 to see stack traces`);
  process.exit(failed ? 1 : 0);
})();
