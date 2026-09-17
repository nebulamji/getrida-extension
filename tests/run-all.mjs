#!/usr/bin/env node
// Single-point test runner for getrida-extension.
// Runs every test/eval in this folder in one shot and exits non-zero if any fail.
// Run: node tests/run-all.mjs   (or: npm test  if a package.json test script wires to this)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const targets = fs.readdirSync(HERE)
  .filter(f => f.endsWith('.test.mjs') || f.endsWith('.eval.mjs'))
  .sort();

let failed = 0, passed = 0;
for (const t of targets) {
  const r = spawnSync('node', [path.join(HERE, t)], { stdio: 'inherit', encoding: 'utf8' });
  if (r.status !== 0) { failed++; console.error(`\n!! ${t} exited ${r.status}\n`); }
  else { passed++; console.log(`\n>> ${t} OK\n`); }
}
console.log(`=== RUNNER: ${passed}/${targets.length} suites passed, ${failed} failed ===`);
if (failed) process.exit(1);
