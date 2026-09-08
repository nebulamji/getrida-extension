// envoy-tools.js — agent tools for the Envoy / EmailOS / Sequencer / Portal surface.
// Doctrine (from gavel handoff 20260726T230000Z):
//   D1 — identity is a platform guarantee, not a sender assertion
//   D2 — the alert is Lamport proof of coordinate movement
//   D3 — the pipe IS the ontology made executable
//
// Live endpoints today: /api/v1/x402/*, /api/v1/a2a/*, /api/v1/world
// Future endpoints (gated to G1/G2/G3 + treasury ATA): /api/v1/envoy/*
//
// Every tool here is forward-compatible: when envoy.getrida.work deploys,
// these tools start returning real data without an extension rebuild.
// Until then they degrade to a structured "not yet deployed" result so the
// agent can explain the gap to the user (D2 — the gap IS the signal).

const ENVOY_BASE = 'https://getrida.work';
const ENVOY_GREENFIELD = 'https://envoy.getrida.work';
const GATE_DEGRADATION = 'envoy_backend_not_deployed';
const GATE_DEGRADATION_DETAIL =
  'Envoy backend not yet deployed at envoy.getrida.work. ' +
  'Gates G1 (LinkedIn observed-only posture), G2 (sender-of-record), ' +
  'G3 (first client identity) and the treasury ATA (SPL-USDC for steward wallet) ' +
  'must clear before Phase 1.0 deploy.';

function notYetDeployed(tool, extra) {
  return {
    ok: false,
    deployed: false,
    gate: GATE_DEGRADATION,
    tool,
    detail: GATE_DEGRADATION_DETAIL + (extra ? ' ' + extra : ''),
  };
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function getWallet() {
  const d = await chrome.storage.local.get('getrida_wallet');
  return d.getrida_wallet || { address: '', chain: '', sessionToken: '' };
}

async function fetchJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, ok: res.ok, body };
}

// ---------- Tool: envoy_gate_status ----------
// Reads the GateDecision ledger state for the current workspace.
// Future: GET /api/v1/envoy/gate returns { default_no, review_required, approved_yes, revoked_no, expired_no, superseded } counts + per-variant status.
// Today: envoy greenfield is not deployed; degrade with the doctrine explanation.
async function envoyGateStatus(args) {
  const wallet = await getWallet();
  if (!wallet.address) {
    return { ok: false, deployed: false, gate: 'no_wallet_identity', detail: 'Connect a wallet first — D1 identity guarantee requires a verified wallet pubkey before any gate state is readable.' };
  }
  try {
    const r = await fetchJson(`${ENVOY_BASE}/api/v1/envoy/gate?wallet=${encodeURIComponent(wallet.address)}`);
    if (!r.ok || !r.body || typeof r.body !== 'object') return notYetDeployed('envoy_gate_status', `(status=${r.status})`);
    return { ok: true, deployed: true, gate: r.body };
  } catch (e) {
    return notYetDeployed('envoy_gate_status', `(${e.message})`);
  }
}

// ---------- Tool: envoy_draft ----------
// Drafts a governed outbound message. The agent recommends; it does NOT send.
// Future: POST /api/v1/envoy/draft → returns { draft_id, variant, tristate_score, gate_status: 'review_required' }
// Today: degrade.
async function envoyDraft(args) {
  const wallet = await getWallet();
  if (!wallet.address) {
    return { ok: false, deployed: false, gate: 'no_wallet_identity', detail: 'D1: draft requires a verified wallet actor. Connect your wallet first.' };
  }
  if (!args || !args.recipient || !args.offer) {
    return { ok: false, deployed: false, gate: 'missing_input', detail: 'recipient and offer are required. Every draft binds a recipient identity (D1) and references an offer slug.' };
  }
  try {
    const r = await fetchJson(`${ENVOY_BASE}/api/v1/envoy/draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: wallet.address, chain: wallet.chain, recipient: args.recipient, offer: args.offer, context: args.context || null }),
    });
    if (!r.ok || !r.body) return notYetDeployed('envoy_draft', `(status=${r.status})`);
    return { ok: true, deployed: true, draft: r.body };
  } catch (e) {
    return notYetDeployed('envoy_draft', `(${e.message})`);
  }
}

// ---------- Tool: envoy_classify_reply ----------
// Classifies an inbound reply via the supervised classifier (Frontier).
// Future: POST /api/v1/envoy/classify → returns { class: positive_reply|objection|confusion|opt_out|meeting_requested|bounce|complaint, confidence, recommended_next }
// Today: degrade.
async function envoyClassifyReply(args) {
  if (!args || !args.replyText) {
    return { ok: false, deployed: false, gate: 'missing_input', detail: 'replyText is required. The classifier needs the inbound body to label the reply class.' };
  }
  try {
    const r = await fetchJson(`${ENVOY_BASE}/api/v1/envoy/classify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reply_text: args.replyText, thread_id: args.threadId || null }),
    });
    if (!r.ok || !r.body) return notYetDeployed('envoy_classify_reply', `(status=${r.status})`);
    return { ok: true, deployed: true, classification: r.body };
  } catch (e) {
    return notYetDeployed('envoy_classify_reply', `(${e.message})`);
  }
}

// ---------- Tool: envoy_receipt_chain ----------
// Reads the Revenue Book receipt chain for the current workspace.
// Today: the live Worker has a2a/inbox (which IS a receipt-bearing surface) —
// route through it when the wallet is connected. Envoy-specific receipts degrade.
async function envoyReceiptChain(args) {
  const wallet = await getWallet();
  if (!wallet.address) {
    return { ok: false, deployed: false, gate: 'no_wallet_identity', detail: 'D1: receipt chain is scoped to a verified wallet actor. Connect your wallet to read the chain.' };
  }
  // Use the live a2a/inbox as the available receipt-bearing surface today.
  try {
    const r = await fetchJson(`${ENVOY_BASE}/api/v1/a2a/inbox`);
    if (r.ok && r.body && r.body.ok) {
      return {
        ok: true,
        deployed: true,
        source: 'a2a_inbox_live',
        inbox: r.body.inbox,
        message_count: r.body.count,
        note: 'Live a2a/inbox receipt surface. Envoy Revenue Book receipts (envoy.getrida.work/api/v1/envoy/receipts) are gated to Phase 1.0 deploy.',
      };
    }
    // Fall through to degradation if a2a/inbox shape doesn't match.
  } catch { /* fall through to degradation */ }
  return notYetDeployed('envoy_receipt_chain');
}

// ---------- Tool: envoy_tristate ----------
// Local scorer — no API. Scores a draft +1 / 0 / -1 against the authority statement.
// +1 = authority (assertion backed by evidence; no hedging; no over-claim)
//  0 = null (informational; no authority claim)
// -1 = hedge (weasel words, uncited superlatives, or claims the evidence doesn't support)
// Standing quality gate on all client-facing copy. (V5.1 + V6 tristate doctrine.)
function envoyTristate(args) {
  if (!args || !args.draft) {
    return { ok: false, deployed: false, gate: 'missing_input', detail: 'draft is required. Pass the copy you want scored.' };
  }
  const text = String(args.draft).toLowerCase();
  const flags = [];

  // Hedge detectors — these surface -1 signals.
  const hedgePhrases = [
    'may be', 'might be', 'could possibly', 'arguably', 'in some ways',
    'i think', 'i believe', 'perhaps', 'possibly', 'seemingly',
    'arguably the best', 'one of the best', 'among the best',
  ];
  for (const h of hedgePhrases) if (text.includes(h)) flags.push({ kind: 'hedge_phrase', phrase: h });

  // Uncited superlative detectors — -1 if a "best/only/first" claim has no evidence marker.
  const superlatives = ['the best', 'the only', 'the first', 'the fastest', 'the cheapest', 'the most'];
  for (const s of superlatives) {
    if (text.includes(s) && !/\(.*\)|\[.*\]|—|src:/.test(text.slice(text.indexOf(s), text.indexOf(s) + 80))) {
      flags.push({ kind: 'uncited_superlative', phrase: s });
    }
  }

  // Authority markers — +1 signals.
  const authorityMarkers = ['per ', 'receipt:', 'evidence:', 'source:', 'verified ', 'data:', 'measured '];
  const authorityHits = authorityMarkers.filter(m => text.includes(m));
  if (authorityHits.length) flags.push({ kind: 'authority_marker', markers: authorityHits });

  // Decision rule.
  let score;
  if (flags.some(f => f.kind === 'hedge_phrase' || f.kind === 'uncited_superlative')) score = -1;
  else if (authorityHits.length >= 1) score = 1;
  else score = 0;

  const rationale = score === 1
    ? 'Authority statement — backed by evidence markers. Approved for client-facing use.'
    : score === -1
      ? 'Hedge or uncited superlative detected. Strip the weasel words or cite the evidence. Not approved for client-facing use.'
      : 'Null — informational, no authority claim. Suitable for internal copy, not for client-facing authority moves.';

  return { ok: true, deployed: true, score, rationale, flags };
}

// ---------- Tool: envoy_identity_resolve ----------
// Resolves a message sender to a verified identity in the Revenue Book.
// Uses the live x402/status endpoint to verify wallet authority for the active wallet.
// Today: proves the active wallet's identity guarantee via the x402 path.
// Future: POST /api/v1/envoy/identity/resolve → resolves ANY sender to a Revenue Book identity.
async function envoyIdentityResolve(args) {
  const wallet = await getWallet();
  if (!wallet.address) {
    return { ok: false, deployed: false, gate: 'no_wallet_identity', detail: 'D1: identity resolution requires a verified wallet actor on the calling session. Connect your wallet first.' };
  }
  // Live path: x402/status returns the steward wallets + activation cost — proves the
  // x402 identity fabric is reachable. The active wallet's authority on this session is
  // the resolution we can demonstrate today.
  try {
    const r = await fetchJson(`${ENVOY_BASE}/api/v1/x402/status`);
    if (!r.ok || !r.body || !r.body.ok) return notYetDeployed('envoy_identity_resolve', '(x402/status not reachable — live identity fabric offline.)');
    const x402 = r.body;
    // Does the active wallet match an activated steward? If yes, the identity is resolved
    // to a steward authority. If no, the wallet is connected but not activated.
    const evmMatch = x402.steward_evm && wallet.address && wallet.address.toLowerCase() === String(x402.steward_evm).toLowerCase();
    const solMatch = x402.steward_sol && wallet.address === x402.steward_sol;
    const resolved = evmMatch || solMatch;
    return {
      ok: true,
      deployed: true,
      source: 'x402_status_live',
      identity: {
        address: wallet.address,
        chain: wallet.chain,
        activated_steward: resolved,
        steward_evm: x402.steward_evm,
        steward_sol: x402.steward_sol,
        activation_cost_usdc: x402.activation_cost_usdc,
      },
      note: resolved
        ? 'Active wallet IS an activated steward. D1 identity guarantee proven via the live x402 path.'
        : 'Active wallet is connected but not an activated steward. x402 fabric is live; full Revenue Book identity resolution (any sender) is gated to Envoy Phase 1.0 deploy.',
    };
  } catch (e) {
    return notYetDeployed('envoy_identity_resolve', `(${e.message})`);
  }
}

// ---------- Dispatcher (parallel to browser-tools.js executeTool) ----------
async function executeEnvoyTool(name, args) {
  switch (name) {
    case 'envoy_gate_status': return await envoyGateStatus(args);
    case 'envoy_draft': return await envoyDraft(args);
    case 'envoy_classify_reply': return await envoyClassifyReply(args);
    case 'envoy_receipt_chain': return await envoyReceiptChain(args);
    case 'envoy_tristate': return envoyTristate(args);
    case 'envoy_identity_resolve': return await envoyIdentityResolve(args);
    default: return { ok: false, error: 'Unknown envoy tool: ' + name };
  }
}

const ENVOY_TOOL_DEFS = [
  { name: 'envoy_gate_status', description: 'Read the GateDecision ledger state for the current wallet workspace. Returns gate counts (default_no, review_required, approved_yes, etc.).', params: {} },
  { name: 'envoy_draft', description: 'Draft a governed outbound message — the agent recommends, never sends. Recipient identity (D1) and offer slug required.', params: { recipient: 'string', offer: 'string', context: 'string?' } },
  { name: 'envoy_classify_reply', description: 'Classify an inbound reply via the supervised classifier (positive_reply / objection / meeting_requested / opt_out / bounce / complaint).', params: { replyText: 'string', threadId: 'string?' } },
  { name: 'envoy_receipt_chain', description: 'Read the Revenue Book receipt chain for the current workspace. Today: live a2a/inbox surface; future: full Revenue Book.', params: {} },
  { name: 'envoy_tristate', description: 'Local tristate scorer (+1 / 0 / -1) for a draft. Standing quality gate on all client-facing copy.', params: { draft: 'string' } },
  { name: 'envoy_identity_resolve', description: 'Resolve the active wallet to a verified identity via the live x402 path. Proves D1 (identity is a platform guarantee).', params: {} },
];

export { executeEnvoyTool, ENVOY_TOOL_DEFS, envoyTristate };