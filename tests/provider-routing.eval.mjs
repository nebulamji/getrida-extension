// provider-routing.eval.mjs — verify callLLM dispatches to correct provider function
import * as fs from 'node:fs';
import * as path from 'node:path';

let passed = 0, failed = 0;
const findings = [];
function ok(n) { passed++; console.log(`ok   - ${n}`); }
function fail(n, d) { failed++; findings.push({ n, d }); console.log(`FAIL - ${n}\n      ${d}`); }

const ROOT = path.resolve(import.meta.dirname || '.', import.meta.dirname ? '..' : '..');
const AL_SRC = fs.readFileSync(path.join(ROOT, 'src/tools/agent-loop.js'), 'utf8');

// INVARIANT 1: callOpenAICompatible dispatches gemini to callGemini
(function geminiRouting() {
  const geminiDispatch = /provider\s*===\s*'gemini'/.test(AL_SRC) && /callGemini/.test(AL_SRC);
  if (geminiDispatch) ok('gemini provider routes to callGemini');
  else fail('gemini routing', 'no `provider === \'gemini\'` dispatching to callGemini');
})();

// INVARIANT 2: callOpenAICompatible dispatches anthropic in-line (Anthropic API format)
(function anthropicRouting() {
  const anthropicDispatch = /provider\s*===\s*'anthropic'/.test(AL_SRC) && /messages\.find/.test(AL_SRC);
  if (anthropicDispatch) ok('anthropic provider routes in-line');
  else fail('anthropic routing', 'no in-line anthropic dispatch in callOpenAICompatible');
})();

// INVARIANT 3: callLLM dispatches byok mode to callOpenAICompatible
(function byokModeDispatch() {
  const byokDispatch = /mode\s*===\s*'byok'/.test(AL_SRC) && /callOpenAICompatible/.test(AL_SRC);
  if (byokDispatch) ok('byok mode routes to callOpenAICompatible');
  else fail('byok routing', 'no byok → callOpenAICompatible dispatch');
})();

// INVARIANT 4: callLLM dispatches rida mode to callRidaAPI
(function ridaModeDispatch() {
  const ridaDispatch = /mode\s*===\s*'rida'/.test(AL_SRC) && /callRidaAPI/.test(AL_SRC);
  if (ridaDispatch) ok('rida mode routes to callRidaAPI');
  else fail('rida routing', 'no rida → callRidaAPI dispatch');
})();

// INVARIANT 5: callGemini exists as a defined function
(function geminiExists() {
  const exists = /async\s+function\s+callGemini/.test(AL_SRC);
  if (exists) ok('callGemini function exists');
  else fail('callGemini', 'no callGemini function definition');
})();

// INVARIANT 6: callGemini builds Gemini-format request body
(function geminiBodyFormat() {
  const hasContents = /contents/.test(AL_SRC);
  const hasFunctionDeclarations = /functionDeclarations/.test(AL_SRC);
  const hasSystemInstruction = /systemInstruction/.test(AL_SRC);
  if (hasContents && hasFunctionDeclarations && hasSystemInstruction) ok('callGemini builds Gemini-format body');
  else fail('callGemini format', `missing Gemini body fields: contents=${hasContents} functionDeclarations=${hasFunctionDeclarations} systemInstruction=${hasSystemInstruction}`);
})();

// INVARIANT 7: callGemini parses Gemini response format
(function geminiResponseFormat() {
  const parsesCandidates = /candidates/.test(AL_SRC) && /content\?\.parts/.test(AL_SRC);
  const parsesToolCalls = /functionCall/.test(AL_SRC);
  if (parsesCandidates && parsesToolCalls) ok('callGemini parses Gemini response format');
  else fail('callGemini response', `parses candidates=${parsesCandidates} functionCalls=${parsesToolCalls}`);
})();

// INVARIANT 8: Gemini endpoint uses the correct model path
(function geminiEndpoint() {
  const correctEndpoint = /gemini-2\.0-flash\:generateContent/.test(AL_SRC);
  if (correctEndpoint) ok('callGemini uses gemini-2.0-flash model');
  else fail('callGemini endpoint', 'wrong or missing Gemini model endpoint');
})();

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed) {
  console.error('\nFAILURES:');
  for (const f of findings) console.error(` - ${f.n}: ${f.d}`);
  process.exit(1);
}
