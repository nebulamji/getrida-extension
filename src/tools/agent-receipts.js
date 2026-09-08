// agent-receipts.js — Lamport receipt emitter for the agent loop.
// Doctrine (gavel 20260726T230000Z):
//   D2 — the alert is Lamport proof of coordinate movement
//   D3 — the pipe IS the ontology made executable
//
// Every state-changing agent tool call emits an immutable receipt appended to
// chrome.storage.local[RECEIPT_KEY]. Receipts are the chronological (Lamport)
// timestamps of the agent's causal sequence. The conversation IS the chain.
//
// 9-field Revenue Book receipt schema (aligned with gavel handoff):
//   actor, authority, source, action, target,
//   input_hash, output_hash, timestamp, evidence_refs

const RECEIPT_KEY = 'getrida_agent_receipts';
const MAX_RECEIPTS = 500;

// Tiny, deterministic hash. NOT cryptographic — this is a Lamport scalar for
// causal ordering, not a security primitive. Real verification happens on the
// Envoy backend (future), which signs receipts with the steward wallet.
// For now we hash to a short stable string so two receipts with identical
// payloads share an identifier (de-duplication + eyeball-diffable).
function shortHash(s) {
  const str = String(s ?? '');
  let h1 = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  // base36, trimmed
  return (h1 >>> 0).toString(36).padStart(7, '0').slice(-7);
}

// State-changing tools. Tools NOT in this set are reads (navigate, screenshot,
// getContent, getTabs, etc.) and don't emit receipts — only mutations do.
// Mirrors browser-tools.js tool names + the 3 inline agent tools that mutate
// the agent's own state (set_plan, update_plan, skill create/delete).
const STATE_CHANGING_TOOLS = new Set([
  'click', 'clickAt', 'type', 'pressKey', 'navigate',
  'set_plan', 'update_plan',
  'skill', // skill create/delete mutate the skills array
  // envoy tools — D1 says every outbound-shape action is receipted, even drafts
  // (a draft is a state transition in the Revenue Book: nothing → review_required).
  'envoy_draft', 'envoy_classify_reply',
]);

function isStateChanging(toolName) {
  return STATE_CHANGING_TOOLS.has(toolName);
}

// Build a 9-field receipt object.
function buildReceipt({ actor, authority, source, action, target, inputPayload, outputPayload, evidenceRefs }) {
  return {
    actor: actor || 'unknown',
    authority: authority || 'unverified',
    source: source || 'getrida-extension/agent-loop',
    action: action || 'unknown',
    target: target || null,
    input_hash: shortHash(inputPayload),
    output_hash: shortHash(outputPayload),
    timestamp: new Date().toISOString(),
    evidence_refs: Array.isArray(evidenceRefs) ? evidenceRefs : [],
  };
}

// Append a receipt. Lamport order = append order. Caller passes actor/authority
// (the wallet address + chain when available).
async function emitReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return;
  try {
    const d = await chrome.storage.local.get(RECEIPT_KEY);
    const arr = Array.isArray(d[RECEIPT_KEY]) ? d[RECEIPT_KEY] : [];
    arr.push(receipt);
    if (arr.length > MAX_RECEIPTS) arr.shift();
    await chrome.storage.local.set({ [RECEIPT_KEY]: arr });
  } catch { /* never break the agent loop over a receipt write */ }
}

async function getReceipts() {
  const d = await chrome.storage.local.get(RECEIPT_KEY);
  return Array.isArray(d[RECEIPT_KEY]) ? d[RECEIPT_KEY] : [];
}

async function clearReceipts() {
  await chrome.storage.local.set({ [RECEIPT_KEY]: [] });
}

export {
  RECEIPT_KEY, MAX_RECEIPTS,
  shortHash, buildReceipt, emitReceipt, getReceipts, clearReceipts,
  isStateChanging, STATE_CHANGING_TOOLS,
};