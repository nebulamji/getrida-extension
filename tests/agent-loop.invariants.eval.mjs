#!/usr/bin/env node
// Logic-level invariants for src/tools/agent-loop.js
// Catches bugs the syntax check cannot — sourced from text/AST inspection of the file.
// Run: node tests/agent-loop.invariants.eval.mjs

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/tools/agent-loop.js'), 'utf8');

let failed = 0, passed = 0;
const findings = [];
function ok(n) { passed++; console.log(`ok   - ${n}`); }
function fail(n, d) { failed++; findings.push({n,d}); console.error(`FAIL - ${n}\n      ${d}`); }

// ---- INVARIANT 1: no `cond ? X : X` ternaries (both branches identical) ----
// Catches the gemini-vs-openai model-name bug fixed 2026-07-26 where line 199 was
// `provider === 'openai' ? 'gpt-4o' : 'gpt-4o'` — both arms identical, gemini
// routing was a silent no-op sending gpt-4o-shaped body to a gemini endpoint.
(function noIdenticalBranchTernaries() {
  const re = /([A-Za-z_$][\w$.\[\]?]*)\s*\?\s*('[^']*'|"[^"]*"|[\w.$]+)\s*:\s*\2\b/g;
  let m, hits = [];
  while ((m = re.exec(SRC)) !== null) {
    hits.push({ cond: m[1].trim(), arm: m[2], idx: m.index });
  }
  if (hits.length === 0) ok('no identical-branch ternaries');
  else for (const h of hits) fail('no identical-branch ternaries', `condition \`${h.cond}\` has both arms = ${h.arm} at offset ${h.idx}`);
})();

// ---- INVARIANT 2: tool schemas for `create` actions expose the payload field ----
// Catches the skill-tool schema bug fixed 2026-07-26: `handleSkillTool`'s `create`
// branch calls `saveSkill(args.skill)` but the `skill` tool schema only declared
// `action` (enum includes 'create') and `name` — so `args.skill` was always
// undefined when the LLM tried to create a skill via the agent.
(function createActionsExposePayload() {
  const start = SRC.indexOf("name: 'skill'");
  if (start === -1) { fail('skill tool schema found', 'no `skill` tool in getToolSchemas'); return; }
  const slice = SRC.slice(start, start + 800);
  const hasCreateInEnum = /enum:\s*\[[^\]]*'create'[^\]]*\]/.test(slice);
  if (!hasCreateInEnum) { ok('skill tool schema has no create action (informational)'); return; }
  // Find the handler for `create` and check whether it reads `args.skill`.
  const handler = SRC.match(/case\s+'create':\s*return\s+await\s+saveSkill\(([^)]*)\)/);
  if (!handler) { ok('skill create handler not calling saveSkill (informational)'); return; }
  const readsArgsSkill = handler[1].includes('args.skill');
  if (!readsArgsSkill) { ok('skill create handler does not read args.skill'); return; }
  // Schema must expose a `skill` field if the handler reads `args.skill`.
  if (/skill:\s*\{/.test(slice)) ok('skill tool schema covers create payload (skill field present)');
  else fail('skill tool schema covers create payload', "`create` action enum + handler reads `args.skill`, but schema has no `skill` field — LLM cannot pass the skill to save");
})();

// ---- INVARIANT 3: callLLM doesn't silently fall through for unsupported provider ----
(function callLLMExhaustive() {
  // callLLM should throw for any mode/provider it doesn't explicitly handle.
  // Without that, unsupported providers silently do nothing or return undefined.
  const callLLM = SRC.match(/async function callLLM\(config, messages, tools\)\s*\{([\s\S]*?)\n\}/);
  if (!callLLM) { fail('callLLM body found', 'cannot locate callLLM function'); return; }
  const body = callLLM[1];
  if (/throw new Error\(['"]No LLM provider/.test(body)) ok('callLLM throws on unsupported provider');
  else fail('callLLM throws on unsupported provider', 'no fallback throw at end of callLLM');
})();

// ---- INVARIANT 4: gemini provider, if reached, is not sent an OpenAI-shaped body ----
(function geminiRoutingNotBroken() {
  // If the endpoints map lists gemini AND the openai-compatible code path is used
  // for gemini, that's the bug (gemini API uses `contents`, not `messages`).
  const hasGemini = /gemini:/.test(SRC) && /generativelanguage\.googleapis\.com/.test(SRC);
  if (!hasGemini) { ok('no gemini provider declared (cannot misroute)'); return; }
  // After the fix, either gemini throws "not yet implemented" OR has a dedicated
  // callGemini() with the contents-array body. Detect either.
  const geminiThrows = /gemini[^]*throw new Error\(['"]Gemini/i.test(SRC);
  const hasGeminiDedicated = /callGemini|gemini-2.*contents/.test(SRC);
  if (geminiThrows || hasGeminiDedicated) ok('gemini routing is not broken (throws or dedicated call)');
  else fail('gemini routing is not broken', 'gemini endpoint declared but neither throws nor has a dedicated Gemini-shaped call — likely reuses the OpenAI body path (broken)');
})();

// ---- INVARIANT 5: conversation persistence caps (memory bound) ----
(function conversationCapped() {
  if (/saveConversation\(.*\.slice\(-\d+\)\)/.test(SRC) || /\.slice\(-50\)/.test(SRC)) {
    ok('saveConversation caps (slice)');
  } else fail('saveConversation caps', 'no visible slice cap — conversation may grow unbounded');
})();

// ---- INVARIANT 6: every tool in getToolSchemas is dispatched somewhere ----
(function allToolsDispatched() {
  const names = [...SRC.matchAll(/name:\s*'([a-zA-Z_]+)'/g)].map(m => m[1]);
  const unique = [...new Set(names)];
  // Dispatch paths: (a) handled inline (set_plan/update_plan/skill), OR
  // (b) routed via `executeTool(name, args)` import from browser-tools.js —
  // which itself contains a switch over the same tool names.
  const inline = ['set_plan', 'update_plan', 'skill', 'evaluatePage'];
  const dispatchedViaExecuteTool = /executeTool\(tc\.function\.name,\s*args\)/.test(SRC);
  if (!dispatchedViaExecuteTool) { fail('executeTool dispatch present', 'no `executeTool(name, args)` call in runAgentTurn'); return; }
  const sourceFiles = ['src/tools/browser-tools.js', 'src/tools/envoy-tools.js', 'src/tools/envoy-fulfillment-rails.js']
    .map(f => fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : '')
    .join('\n');
  const missing = unique.filter(n => {
    if (inline.includes(n)) return false;
    return !sourceFiles.includes(`case '${n}':`) && !sourceFiles.includes(`case "${n}":`);
  });
  if (missing.length === 0) ok(`all ${unique.length} named tools dispatched (inline or via browser-tools.js + envoy-tools.js)`);
  else fail('all named tools dispatched', `no dispatch path for: ${missing.join(', ')}`);
})();

// ---- REPORT ----
console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed) {
  console.error('\nFAILURES:');
  for (const f of findings) console.error(` - ${f.n}: ${f.d}`);
  process.exit(1);
}