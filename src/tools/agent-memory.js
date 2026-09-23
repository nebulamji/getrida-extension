// agent-memory.js — Extension-side client for the durable cross-surface
// agent memory (Feature 3 of the Agent Employee Build Spec).
//
// Source of truth lives server-side in envoy_agent_memories (see
// ~/envoy/worker/migrations/0072_envoy_agent_memories.sql), tenant-scoped,
// reachable from any surface that has a grk_ bearer key. This module is the
// extension's thin HTTP client over the existing grk_-authenticated
// callRidaAPI path — no new auth path, no new endpoint contract to learn.
//
// Two tools surfaced to the agent:
//   memory_recall({entities?, limit?, since?})  →
//     POST /api/envoy/agent-memory/recall
//   memory_remember({summary, surface?, kind?, source_ref?, entities?, metadata?})  →
//     POST /api/envoy/agent-memory/remember
//
// Errors are returned as {ok: false, error: ...} — never thrown — so the
// agent-loop's tool-result handling stays simple and the lamport receipt
// always lands even on failure (the receipt itself is the proof that a
// recall attempt happened).

const DEFAULT_TIMEOUT_MS = 8000;

async function getEndpointAndKey() {
  // Pulled fresh per call — settings (endpoint / grk key) may have
  // changed since the last call (e.g. user switched workspaces).
  const data = await chrome.storage.local.get(['getrida_endpoint', 'getrida_grk_key']);
  const endpoint = (data.getrida_endpoint || 'https://app.getrida.work').replace(/\/+$/, '');
  const grk = data.getrida_grk_key || '';
  return { endpoint, grk };
}

async function postJson(endpoint, grk, pathname, body) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(`${endpoint}${pathname}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${grk}`,
      },
      body: JSON.stringify(body || {}),
      signal: controller.signal,
    });
    let parsed = null;
    try { parsed = await res.json(); } catch { parsed = null; }
    return { http_status: res.status, body: parsed };
  } catch (e) {
    return { http_status: 0, body: null, error: e?.message || String(e) };
  } finally {
    clearTimeout(t);
  }
}

export async function executeAgentMemoryTool(toolName, args) {
  const { endpoint, grk } = await getEndpointAndKey();
  if (!grk) {
    return { ok: false, error: 'no_grk_key', message: 'memory_* tools require an authenticated Rida identity (grk_ key). Sign in to the extension first.' };
  }
  if (!endpoint) {
    return { ok: false, error: 'no_endpoint', message: 'Rida endpoint not configured.' };
  }

  if (toolName === 'memory_recall') {
    const body = {
      entities: Array.isArray(args?.entities) ? args.entities.filter((e) => typeof e === 'string') : undefined,
      limit: typeof args?.limit === 'number' ? Math.max(1, Math.min(100, Math.floor(args.limit))) : undefined,
      since: typeof args?.since === 'string' ? args.since : undefined,
    };
    const r = await postJson(endpoint, grk, '/api/envoy/agent-memory/recall', body);
    if (r.http_status === 0) {
      return { ok: false, error: 'network_error', message: r.error || 'unable to reach envoy' };
    }
    if (r.http_status === 401) {
      return { ok: false, error: 'unauthorized', message: 'grk_ key rejected by envoy', http_status: 401 };
    }
    if (r.http_status !== 200) {
      return { ok: false, error: 'recall_failed', message: r.body?.message || `recall failed (HTTP ${r.http_status})`, http_status: r.http_status };
    }
    return { ok: true, ...r.body };
  }

  if (toolName === 'memory_remember') {
    if (!args?.summary || typeof args.summary !== 'string') {
      return { ok: false, error: 'invalid_request', message: 'summary is required' };
    }
    const body = {
      summary: args.summary,
      surface: typeof args.surface === 'string' ? args.surface : 'extension',
      kind: typeof args.kind === 'string' ? args.kind : 'conversation',
      source_ref: typeof args.source_ref === 'string' ? args.source_ref : '',
      entities: Array.isArray(args?.entities) ? args.entities.filter((e) => typeof e === 'string') : [],
      metadata: args?.metadata && typeof args.metadata === 'object' ? args.metadata : undefined,
    };
    const r = await postJson(endpoint, grk, '/api/envoy/agent-memory/remember', body);
    if (r.http_status === 0) {
      return { ok: false, error: 'network_error', message: r.error || 'unable to reach envoy' };
    }
    if (r.http_status === 401) {
      return { ok: false, error: 'unauthorized', message: 'grk_ key rejected by envoy', http_status: 401 };
    }
    if (r.http_status !== 200) {
      return { ok: false, error: 'remember_failed', message: r.body?.message || `remember failed (HTTP ${r.http_status})`, http_status: r.http_status };
    }
    return { ok: true, ...r.body };
  }

  return { ok: false, error: 'unknown_tool', message: `agent-memory: unknown tool ${toolName}` };
}
