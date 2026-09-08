#!/usr/bin/env node
// Envoy integration invariants — validates the Chrome extension's integration
// with the gavel handoff doctrine (D1/D2/D3) and the Envoy/EmailOS/Sequencer/Portal surface.
// Source of truth: ~/gavel/handoffs/20260726T230000Z-gavel-...-handoff.md
// Run: node tests/envoy-integration.invariants.eval.mjs

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failed = 0, passed = 0, warned = 0;
const findings = [];
function ok(n) { passed++; console.log(`ok   - ${n}`); }
function fail(n, d) { failed++; findings.push({n,d,s:'FAIL'}); console.error(`FAIL - ${n}\n      ${d}`); }
function warn(n, d) { warned++; findings.push({n,d,s:'WARN'}); console.log(`WARN - ${n}\n      ${d}`); }

const AGENT_LOOP = read('src/tools/agent-loop.js');
const ENVOY_TOOLS = read('src/tools/envoy-tools.js');
const SKILLS = read('src/tools/skills.js');
const RECEIPTS = read('src/tools/agent-receipts.js');

// ---- 1. D1/D2/D3 doctrine present in SYSTEM_PROMPT ----
for (const marker of ['D1 — Identity is a platform guarantee', 'D2 — The alert is Lamport proof', 'D3 — The pipe IS the ontology made executable']) {
  if (AGENT_LOOP.includes(marker)) ok(`SYSTEM_PROMPT carries ${marker.split('—')[0].trim()}`);
  else fail(`SYSTEM_PROMPT carries ${marker.split('—')[0].trim()}`, `missing doctrine marker: "${marker}"`);
}

// ---- 2. Governed-send rule present (the G2 "agent recommends, never sends" invariant) ----
if (/NEVER SEND outbound sales messages autonomously/.test(AGENT_LOOP) && /recommends.*never sends/i.test(AGENT_LOOP)) {
  ok('NEVER-SEND rule present in SYSTEM_PROMPT');
} else fail('NEVER-SEND rule present', 'missing the autonomous-send prohibition');

// ---- 3. All 6 envoy tool schemas present in getToolSchemas() ----
const envoyTools = ['envoy_gate_status', 'envoy_draft', 'envoy_classify_reply', 'envoy_receipt_chain', 'envoy_tristate', 'envoy_identity_resolve'];
for (const t of envoyTools) {
  if (AGENT_LOOP.includes(`name: '${t}'`)) ok(`schema for ${t}`);
  else fail(`schema for ${t}`, `missing from getToolSchemas() in agent-loop.js`);
}

// ---- 4. All 6 envoy tools dispatched in envoy-tools.js ----
for (const t of envoyTools) {
  if (ENVOY_TOOLS.includes(`case '${t}':`)) ok(`dispatch case for ${t}`);
  else fail(`dispatch case for ${t}`, `missing from executeEnvoyTool switch in envoy-tools.js`);
}

// ---- 5. envoy_draft requires recipient + offer (D1 binding) ----
// Use a brace-aware window: find the schema block by index, scan a wide slice.
const draftIdx = AGENT_LOOP.indexOf("name: 'envoy_draft'");
if (draftIdx === -1) fail('envoy_draft requires recipient + offer', 'no envoy_draft schema in agent-loop.js');
else {
  const slice = AGENT_LOOP.slice(draftIdx, draftIdx + 600);
  const reqMatch = slice.match(/required:\s*\[([^\]]+)\]/);
  if (reqMatch && reqMatch[1].includes("'recipient'") && reqMatch[1].includes("'offer'")) {
    ok('envoy_draft requires recipient + offer (D1 binding)');
  } else fail('envoy_draft requires recipient + offer', `required fields: ${reqMatch ? reqMatch[1] : 'no required[] found in schema slice'}`);
}

// ---- 6. envoy_tristate is local — no fetch in its body ----
const tristateBlock = ENVOY_TOOLS.match(/function envoyTristate\(args\)\s*\{([\s\S]*?)\n\}/);
if (tristateBlock && !/fetch\s*\(/.test(tristateBlock[1])) ok('envoy_tristate is local (no fetch)');
else fail('envoy_tristate is local', 'envoyTristate body contains a fetch() — tristate must be a local scorer');

// ---- 7. Other envoy tools have the not-deployed degradation path ----
// Each non-tristate envoy tool must reference the notYetDeployed helper.
for (const t of envoyTools.filter(t => t !== 'envoy_tristate')) {
  const fnName = t.replace(/_[a-z]/g, m => m[1].toUpperCase()); // envoy_gate_status → envoyGateStatus
  const block = ENVOY_TOOLS.match(new RegExp(`function ${fnName}\\(args\\)\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!block) { fail(`${t} has notYetDeployed path`, `cannot locate function ${fnName}`); continue; }
  if (block[1].includes('notYetDeployed')) ok(`${t} has notYetDeployed degradation`);
  else fail(`${t} has notYetDeployed degradation`, `function ${fnName} does not call notYetDeployed — silent failure on missing backend`);
}

// ---- 8. Receipt schema in agent-receipts.js is 9 fields ----
const expectedReceiptFields = ['actor', 'authority', 'source', 'action', 'target', 'input_hash', 'output_hash', 'timestamp', 'evidence_refs'];
const receiptBuild = RECEIPTS.match(/function buildReceipt\([\s\S]*?return\s*\{([\s\S]*?)\};/);
if (!receiptBuild) fail('buildReceipt function found', 'cannot locate buildReceipt in agent-receipts.js');
else {
  const body = receiptBuild[1];
  const missing = expectedReceiptFields.filter(f => !body.includes(`${f}:`));
  if (missing.length === 0) ok(`receipt schema has all 9 fields (${expectedReceiptFields.join(', ')})`);
  else fail('receipt schema is 9 fields', `missing: ${missing.join(', ')}`);
}

// ---- 9. STATE_CHANGING_TOOLS set includes the documented tools ----
const scBlock = RECEIPTS.match(/STATE_CHANGING_TOOLS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
if (!scBlock) fail('STATE_CHANGING_TOOLS defined', 'cannot find the set');
else {
  const required = ['click', 'type', 'navigate', 'set_plan', 'skill', 'envoy_draft', 'envoy_classify_reply'];
  const missing = required.filter(t => !scBlock[1].includes(`'${t}'`));
  if (missing.length === 0) ok('STATE_CHANGING_TOOLS includes documented mutations');
  else fail('STATE_CHANGING_TOOLS includes documented mutations', `missing: ${missing.join(', ')}`);
}

// ---- 10. Receipt emission is called from agent-loop after each tool result ----
if (AGENT_LOOP.includes('emitLamportReceiptForToolCall') && /await emitLamportReceiptForToolCall\(tc\.function\.name/.test(AGENT_LOOP)) {
  ok('agent-loop emits Lamport receipts after tool calls');
} else fail('agent-loop emits Lamport receipts', 'emitLamportReceiptForToolCall not called after tool execution');

// ---- 11. The 3 new GetRida subdomain skills are in DEFAULT_SKILLS ----
const requiredSkills = ['getrida-portal', 'getrida-envoy', 'getrida-market'];
for (const s of requiredSkills) {
  if (SKILLS.includes(`name: '${s}'`)) ok(`default skill ${s} present`);
  else fail(`default skill ${s} present`, `missing from DEFAULT_SKILLS in skills.js`);
}

// ---- 12. Skills target the correct domains ----
const skillDomainMap = {
  'getrida-portal': ['portal.getrida.work', 'portalv2.getrida.work'],
  'getrida-envoy': ['envoy.getrida.work'],
  'getrida-market': ['market.getrida.work'],
};
for (const [skill, domains] of Object.entries(skillDomainMap)) {
  const block = SKILLS.match(new RegExp(`name:\\s*'${skill}'[\\s\\S]*?domainPatterns:\\s*\\[([^\\]]+)\\]`));
  if (!block) { fail(`${skill} domain patterns found`, 'cannot locate domainPatterns'); continue; }
  const missing = domains.filter(d => !block[1].includes(`'${d}'`));
  if (missing.length === 0) ok(`${skill} targets: ${domains.join(', ')}`);
  else fail(`${skill} targets correct domains`, `missing: ${missing.join(', ')}`);
}

// ---- 13. envoy_identity_resolve uses the live x402 path (D1 proof) ----
const idBlock = ENVOY_TOOLS.match(/function envoyIdentityResolve[\s\S]*?\n\}/);
if (idBlock && idBlock[0].includes('/api/v1/x402/status')) ok('envoy_identity_resolve calls live /api/v1/x402/status');
else fail('envoy_identity_resolve uses live x402', 'no /api/v1/x402/status call in envoyIdentityResolve');

// ---- 14. Honest degradation: no envoy tool returns deployed:true paired with an error shape ----
// Catches the regression fixed 2026-07-26 where a 401 from the Worker's global
// API-key middleware was being misrouted into `{ok:false, deployed:true, error:'Unexpected shape'}`
// — falsely implying the Envoy backend was live. Any non-200 must hit notYetDeployed,
// never a `deployed:true` + `error` combination.
(function noFakeDeployedOnError() {
  const misleadingShape = /deployed:\s*true[\s\S]{0,400}error:/g;
  const hits = [];
  let m;
  while ((m = misleadingShape.exec(ENVOY_TOOLS)) !== null) {
    // Tolerate `error:` appearing inside a downstream string literal in a NOTE field, but
    // flag any object returning `deployed:true` together with an `error:` key in the same
    // returned object.
    const window = ENVOY_TOOLS.slice(Math.max(0, m.index - 100), m.index + 200);
    if (/return\s*\{[\s\S]*?deployed:\s*true[\s\S]*?error:/.test(window)) {
      hits.push(m.index);
    }
  }
  if (hits.length === 0) ok('no envoy tool returns deployed:true with an error shape');
  else fail('no envoy tool returns deployed:true with an error shape', `${hits.length} occurrence(s) — non-200 responses must hit notYetDeployed, never claim deployed:true`);
})();

// ---- 15. No-identity guard: envoy tools refuse without a wallet ----
const d1Tools = ['envoyGateStatus', 'envoyDraft', 'envoyReceiptChain', 'envoyIdentityResolve'];
for (const fn of d1Tools) {
  const block = ENVOY_TOOLS.match(new RegExp(`function ${fn}\\([\\s\\S]*?\\n\\}`));
  if (!block) { fail(`${fn} guards no-wallet`, 'cannot locate function'); continue; }
  if (block[0].includes("gate: 'no_wallet_identity'") || block[0].includes('no_wallet_identity')) {
    ok(`${fn} refuses without a connected wallet (D1)`);
  } else fail(`${fn} guards no-wallet`, `function does not return the no_wallet_identity gate`);
}

// ---- 16. envoy_receipt_chain uses the live a2a endpoint today (real data path) ----
if (ENVOY_TOOLS.includes('/api/v1/a2a/inbox') && ENVOY_TOOLS.includes('a2a_inbox_live')) {
  ok('envoy_receipt_chain routes through live /api/v1/a2a/inbox');
} else fail('envoy_receipt_chain uses live a2a/inbox', 'no live receipt path declared');

// ---- REPORT ----
console.log(`\n=== ${passed} passed, ${warned} warned, ${failed} failed ===`);
if (failed) {
  console.error('\nFAILURES:');
  for (const f of findings.filter(x => x.s === 'FAIL')) console.error(` - ${f.n}: ${f.d}`);
  process.exit(1);
}
if (warned) {
  console.log('\nWARNINGS (non-blocking):');
  for (const f of findings.filter(x => x.s === 'WARN')) console.log(` - ${f.n}: ${f.d}`);
}