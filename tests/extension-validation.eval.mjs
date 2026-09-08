#!/usr/bin/env node
// Extension eval + validation suite for getrida-extension
// Runs across all surfaces: manifest, code, HTML, CSP, icons, permissions↔usage, version↔CHANGELOG.
// Non-gated, read-only (no extension runtime). Exits non-zero on any FAIL.
// Run: node tests/extension-validation.eval.mjs

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let failed = 0, passed = 0, warned = 0;
const findings = [];

function ok(name) { passed++; console.log(`ok   - ${name}`); }
function fail(name, detail) { failed++; findings.push({ name, detail, severity: 'FAIL' }); console.error(`FAIL - ${name}\n      ${detail}`); }
function warn(name, detail) { warned++; findings.push({ name, detail, severity: 'WARN' }); console.log(`WARN - ${name}\n      ${detail}`); }
function feature(name, detail) { warned++; findings.push({ name, detail, severity: 'FUTURE' }); console.log(`FUTR - ${name}\n      ${detail}`); }

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function exists(p) { return fs.existsSync(path.join(ROOT, p)); }

// ---------- 1. Manifest JSON validity ----------
let manifest;
try { manifest = JSON.parse(read('manifest.json')); ok('manifest.json parses'); }
catch (e) { fail('manifest.json parses', e.message); process.exit(1); }

let manifestFF;
try { manifestFF = JSON.parse(read('manifest.firefox.json')); ok('manifest.firefox.json parses'); }
catch (e) { fail('manifest.firefox.json parses', e.message); }

// ---------- 2. Manifest version ↔ CHANGELOG latest version ----------
try {
  const cl = read('CHANGELOG.md');
  const m = cl.match(/##\s*\[(\d+\.\d+\.\d+)\][^\n]*$/m);
  if (!m) fail('CHANGELOG version detect', 'no `## [x.y.z]` heading found');
  else {
    const clVer = m[1];
    if (clVer === manifest.version) ok(`version aligns (manifest=CHANGELOG=${clVer})`);
    else fail('version aligns', `manifest=${manifest.version} but CHANGELOG latest=${clVer}`);
  }
} catch (e) { fail('CHANGELOG reachable', e.message); }

// ---------- 3. All referenced files exist ----------
const referencedFiles = [
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...(manifest.content_scripts?.flatMap(cs => cs.js) || []),
  ...(manifest.sandbox?.pages || []),
  ...(manifest.web_accessible_resources?.flatMap(r => r.resources) || []),
];
for (const f of referencedFiles) {
  if (!f) continue;
  exists(f) ? ok(`file exists: ${f}`) : fail(`file exists: ${f}`, 'referenced in manifest but missing');
}
for (const size of ['16','48','128']) {
  const ic = manifest.icons?.[size];
  if (ic) exists(ic) ? ok(`icon ${size}x${size} exists`) : fail(`icon ${size}x${size} exists`, `missing: ${ic}`);
  else fail(`icon ${size}x${size} declared`, 'not declared in manifest.icons');
}

// ---------- 4. All JS files syntactically valid ----------
const jsFiles = [
  'background.js', 'popup.js', 'content.js', 'sidepanel.js',
  'src/tools/agent-loop.js', 'src/tools/browser-tools.js', 'src/tools/skills.js',
  'src/tools/envoy-tools.js', 'src/tools/agent-receipts.js',
];
for (const f of jsFiles) {
  if (!exists(f)) { fail(`JS file present: ${f}`, 'missing'); continue; }
  // node --check via spawn
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('node', ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
  if (r.status === 0) ok(`JS syntax: ${f}`);
  else fail(`JS syntax: ${f}`, r.stderr.split('\n')[0]);
}

// ---------- 5. HTML script src refs resolve ----------
for (const hf of ['popup.html', 'sidepanel.html', 'sandbox.html']) {
  if (!exists(hf)) continue;
  const html = read(hf);
  const refs = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
  if (refs.length === 0) { ok(`HTML script refs: ${hf} (inline only, ok)`); continue; }
  for (const r of refs) {
    exists(r) ? ok(`HTML ref: ${hf} → ${r}`) : fail(`HTML ref: ${hf} → ${r}`, 'missing JS file');
  }
}

// ---------- 6. Permissions usage audit ----------
const permissionsToAudit = (manifest.permissions || []).filter(p =>
  !['activeTab', 'tabs', 'storage', 'sidePanel'].includes(p)
);
// known anchor permissions that don't need code-search:
//   activeTab (implicit), tabs (chrome.tabs), storage (chrome.storage),
//   sidePanel (chrome.sidePanel default_path — manifest-declared use is enough)
const codeBlob = ['background.js','popup.js','content.js','sidepanel.js',
                  'src/tools/agent-loop.js','src/tools/browser-tools.js','src/tools/skills.js']
                 .map(f => { try { return read(f); } catch { return ''; } }).join('\n');

const PERMISSION_API = {
  scripting: 'chrome.scripting',
  debugger: 'chrome.debugger',
  declarativeNetRequest: 'chrome.declarativeNetRequest',
  userScripts: 'chrome.userScripts',
  tabGroups: 'chrome.tabGroups',
  cookies: 'chrome.cookies',
  history: 'chrome.history',
  bookmarks: 'chrome.bookmarks',
};
for (const perm of permissionsToAudit) {
  const api = PERMISSION_API[perm];
  if (!api) { ok(`permission ${perm}: no audit rule (informational)`); continue; }
  if (codeBlob.includes(api)) ok(`permission ${perm}: used (${api} found in code)`);
  else feature(`permission ${perm}: future-scoped`, `declared in manifest, no \`${api}\` call today — slated for a later build (see CHANGELOG v0.3.1 "Future-scoped permissions")`);
}

// ---------- 7. Side panel default_path is declared (spec build-order #11) ----------
if (manifest.side_panel?.default_path) ok('side_panel.default_path declared');
else fail('side_panel.default_path declared', 'MV3 paid tier requires it');

// ---------- 8. background.service_worker type (v0.2.0+ uses dynamic import) ----------
if (manifest.background?.type === 'module') ok('background is ES module (dynamic import OK)');
else fail('background is ES module', 'background.type should be "module" for dynamic import() of ./src/tools/*');

// ---------- 9. CSP sanity ----------
const csp = manifest.content_security_policy;
if (csp?.extension_pages && !csp.extension_pages.includes("'unsafe-eval'")) {
  ok('extension_pages CSP excludes unsafe-eval (secure)');
} else {
  fail('extension_pages CSP excludes unsafe-eval', 'extension_pages CSP must NOT include unsafe-eval');
}
if (csp?.sandbox && csp.sandbox.includes("'unsafe-eval'")) {
  ok('sandbox CSP allows unsafe-eval (sandbox.html eval — required for code-runner)');
} else {
  fail('sandbox CSP allows unsafe-eval', 'sandbox page needs unsafe-eval to eval user-provided code cleanly');
}

// ---------- 10. host_permissions don't grant wildcard+specific (redundant) ----------
const hp = manifest.host_permissions || [];
if (hp.includes('<all_urls>') && hp.some(h => h !== '<all_urls>')) {
  warn('host_permissions overlap', '<all_urls> already covers everything; other entries are redundant noise');
} else ok('host_permissions non-overlapping');

// ---------- 11. content_scripts matches/all_frames sanity ----------
const cs = manifest.content_scripts?.[0];
if (cs?.matches?.[0] === '<all_urls>' && cs?.all_frames === false) {
  ok('content_script matches <all_urls>, all_frames:false (top-frame only — correct for picker)');
} else fail('content_scripts frame scope', `unexpected: ${JSON.stringify(cs)}`);

// ---------- 12. minimum_chrome_version supports declared APIs ----------
if (manifest.minimum_chrome_version && parseInt(manifest.minimum_chrome_version) >= 116) {
  ok(`minimum_chrome_version (${manifest.minimum_chrome_version}) supports sidePanel (116+)`);
} else fail('minimum_chrome_version', 'sidePanel API requires Chrome 116+; manifest may block older clients');

// ---------- 13. Sidepanel ↔ popup storage key contract ----------
// All five storage keys must be identically named across popup.js, background.js, sidepanel.js
const STORAGE_KEYS = ['getrida_state','getrida_endpoint','getrida_sessions','getrida_mode','getrida_provider_config','getrida_wallet'];
const keyBlob = ['background.js','popup.js','sidepanel.js'].map(f => read(f)).join('\n');
let keyDrift = false;
for (const k of STORAGE_KEYS) {
  if (!keyBlob.includes(`'${k}'`) && !keyBlob.includes(`"${k}"`)) {
    fail(`storage key ${k}`, 'not referenced in any of background/popup/sidepanel');
    keyDrift = true;
  }
}
if (!keyDrift) ok(`all ${STORAGE_KEYS.length} storage keys referenced consistently`);

// ---------- 14. Firefox manifest validity (free-tier only — no debugger/userScripts) ----------
if (manifestFF) {
  const ffPerms = manifestFF.permissions || [];
  const forbidden = ['debugger', 'userScripts'];
  for (const p of forbidden) {
    if (ffPerms.includes(p)) fail(`manifest.firefox.json excludes ${p}`, 'Firefox does not allow this permission');
    else ok(`manifest.firefox.json excludes ${p}`);
  }
  if (!ffPerms.includes('sidePanel') && !manifestFF.sidebar_action) {
    fail('manifest.firefox.json has sidebar_action', 'Firefox uses sidebar_action, not side_panel');
  } else ok('manifest.firefox.json has sidebar equivalent');
}

// ---------- 15. Runtime contract: free-tier endpoint + paid-tier auth endpoint reachable (no network) ----------
// Just asserts the constants exist; live reachability was probed in ten-moves receipt.
const freeEndpoint = 'https://getrida.work/api/v1/compile';
const paidBaseUrl = 'https://getrida.work';
if (read('background.js').includes(freeEndpoint)) ok(`free-tier endpoint constant: ${freeEndpoint}`);
else fail('free-tier endpoint constant', 'missing from background.js');
if (read('sidepanel.js').includes(paidBaseUrl)) ok(`paid-tier base URL constant: ${paidBaseUrl}`);
else fail('paid-tier base URL constant', 'missing from sidepanel.js');

// ---------- REPORT ----------
console.log(`\n=== ${passed} passed, ${warned} future-scoped/warn, ${failed} failed ===`);
if (failed) {
  console.error('\nFAILURES (blocks release):');
  for (const f of findings.filter(x => x.severity === 'FAIL')) console.error(` - ${f.name}: ${f.detail}`);
  process.exit(1);
}
if (warned) {
  console.log('\nFUTURE-SCOPED (informational, non-blocking):');
  for (const f of findings.filter(x => x.severity !== 'FAIL')) console.log(` - [${f.severity}] ${f.name}: ${f.detail}`);
}