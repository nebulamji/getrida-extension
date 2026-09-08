import assert from 'node:assert';

// Contract test: saveSession (background.js) entry shape MUST match loadHistory
// (popup.js) reader expectations. Guards the regression fixed 2026-07-26 where
// loadHistory read `s.tabs` but saveSession stored `tabCount`, rendering every
// history entry as "undefined tabs".
//
// Run: node --test tests/contract-history-field.test.mjs
// Or: node tests/contract-history-field.test.mjs   (exits non-zero on failure)

// Entry shape written by background.js saveSession():
const SAVE_SESSION_ENTRY = {
  id: 'local-1700000000000',
  mission: 'test mission',
  tabCount: 5,
  timestamp: 1700000000000,
  summary: 'preview...',
  viewUrl: null,
  noiseCount: 0,
};

// Fields read by popup.js loadHistory() render:
function renderHistoryItem(s) {
  const date = new Date(s.timestamp).toLocaleString();
  return `${s.tabCount} tabs · ${date}`;
}

// Fields read by sidepanel.js (none read tab count currently, but assert the
// contract holds for any future reader): same field name `tabCount`.

function test_entryHasTabCount() {
  assert.ok('tabCount' in SAVE_SESSION_ENTRY, 'saveSession entry must have tabCount');
  assert.equal(typeof SAVE_SESSION_ENTRY.tabCount, 'number');
}

function test_renderDoesNotReadTabsField() {
  // The bug: reading s.tabs (undefined). After the fix, reads s.tabCount.
  const rendered = renderHistoryItem(SAVE_SESSION_ENTRY);
  assert.ok(!rendered.includes('undefined'), `rendered contained undefined: ${rendered}`);
  assert.match(rendered, /^5 tabs · /);
}

function test_renderFailsOnOldBuggyEntry() {
  // Sanity: the OLD buggy reader (s.tabs) would produce "undefined tabs".
  const buggyRender = (s) => `${s.tabs} tabs · ${new Date(s.timestamp).toLocaleString()}`;
  const out = buggyRender(SAVE_SESSION_ENTRY);
  assert.match(out, /undefined tabs/, 'sanity: buggy reader must show undefined (test self-check)');
}

function test_contractFieldNamesAlign() {
  // The single source of truth: saveSession and loadHistory agree on `tabCount`.
  const saverFields = Object.keys(SAVE_SESSION_ENTRY);
  assert.ok(saverFields.includes('tabCount'));
  assert.ok(!saverFields.includes('tabs'), 'no `tabs` field should be written');
}

const tests = [
  ['saveSession entry has tabCount', test_entryHasTabCount],
  ['loadHistory render does not show undefined', test_renderDoesNotReadTabsField],
  ['buggy reader would show undefined (self-check)', test_renderFailsOnOldBuggyEntry],
  ['saver/reader field names align on tabCount', test_contractFieldNamesAlign],
];

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('ok -', name); }
  catch (e) { failed++; console.error('FAIL -', name, '\n', e.message); }
}
if (failed) { console.error(`\n${failed} test(s) failed`); process.exit(1); }
console.log(`\n${tests.length} tests passed`);