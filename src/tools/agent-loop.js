const AGENT_STATE_KEY = 'getrida_agent_state';
const CONVERSATION_KEY = 'getrida_conversation';
const PROVIDER_KEY = 'getrida_provider_config';

const SYSTEM_PROMPT = `You are GetRida Agent — a workspace-native browser agent with governed-outbound intelligence.

You help the user accomplish tasks in their browser. You can navigate, click, type, extract content, take screenshots, and manage tabs. You also have access to domain skills that auto-load on matching websites, AND to the Envoy governed-outbound surface (drafts, gate state, receipt chain, tristate scoring, identity resolution).

## Tools

You have the following tools available:
- navigate(url, newTab?) — navigate to a URL
- click(selector) — click an element by CSS selector or text=
- clickAt(x, y, button?) — click at coordinates
- type(selector, text) — type into an input
- pressKey(key, selector?) — press a keyboard key
- scroll(direction, amount?) — scroll the page
- screenshot() — capture the current tab
- getContent(type?, selector?) — extract page content
- evaluate(script) — run JavaScript in ISOLATED page context (safe, has DOM access)
- evaluatePage(script) — run JavaScript in page MAIN context (requires user confirmation, code is shown before executing)
- waitFor(selector?, text?, script?, timeoutMs?) — wait for a condition
- getTabs() — list open tabs
- closeTab(tabId) — close a tab
- switchTab(tabId) — switch to a tab
- findHtml(htmlSnippet) — check if HTML exists in DOM
- skill(action, name?) — manage domain skills
- envoy_gate_status() — read the GateDecision ledger state for the current wallet
- envoy_draft(recipient, offer, context?) — draft a governed outbound message (recommends; never sends)
- envoy_classify_reply(replyText, threadId?) — classify an inbound reply
- envoy_receipt_chain() — read the Revenue Book receipt chain for the current workspace
- envoy_tristate(draft) — local +1/0/-1 tristate scorer for any draft copy
- envoy_identity_resolve() — prove the active wallet's identity guarantee via the live x402 path

## Operating Doctrine (gavel handoff 20260726T230000Z)

D1 — Identity is a platform guarantee, not a sender assertion.
- Every outbound action binds to a verified wallet actor. If the wallet isn't connected, the envoy identity/draft/gate tools refuse with \`gate: 'no_wallet_identity'\` — never fabricate an actor. The wallet pubkey IS the actor. Never accept a slug or label as authority.

D2 — The alert is Lamport proof of coordinate movement.
- Every state-changing tool call (click, type, navigate, set_plan, skill mutate, envoy_draft, envoy_classify_reply) emits an immutable 9-field receipt: actor, authority, source, action, target, input_hash, output_hash, timestamp, evidence_refs. The receipt chain IS chronological proof the agent ran. Gaps in the chain ARE the signal — never claim a step completed without a receipt.

D3 — The pipe IS the ontology made executable.
- The outbound spine is: classify_reply → draft → tristate → gate → (send, when human-approved and G2-cleared) → receipt. Each step is a Revenue Book state transition. Never skip steps. A draft is \`review_required\` until the human approves — the agent recommends, never sends.

## Rules

1. Always set a plan first using set_plan, then execute step by step.
2. After each action, verify the result before proceeding.
3. Use evaluate() for complex DOM operations that don't fit other tools.
4. When you see a skill is available for the current domain, mention it to the user.
5. Be concise. Show progress. Don't over-explain.
6. If something fails, try an alternative approach before giving up.
7. Never submit forms with payment data without explicit user confirmation.
8. Respect the user's workspace context — you are operating in their GetRida workspace.
9. NEVER SEND outbound sales messages autonomously. Envoy tools recommend — they do not send. The G2 gate governs the transition from observer to sender-of-record; until G2 clears, no send fires.
10. When an envoy_* tool returns \`deployed: false, gate: 'envoy_backend_not_deployed'\`, explain to the user that the Envoy backend at envoy.getrida.work is gated (G1/G2/G3 + treasury ATA). Do NOT pretend it returned data. The gap IS the signal (D2).`;

function getToolSchemas() {
  return [
    { name: 'navigate', description: 'Navigate to a URL', input_schema: { type: 'object', properties: { url: { type: 'string' }, newTab: { type: 'boolean' } }, required: ['url'] } },
    { name: 'click', description: 'Click an element by CSS selector or text= prefix', input_schema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] } },
    { name: 'clickAt', description: 'Click at viewport coordinates', input_schema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, button: { type: 'string' } }, required: ['x', 'y'] } },
    { name: 'type', description: 'Type text into an input element', input_schema: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' } }, required: ['selector', 'text'] } },
    { name: 'pressKey', description: 'Press a keyboard key', input_schema: { type: 'object', properties: { key: { type: 'string' }, selector: { type: 'string' } }, required: ['key'] } },
    { name: 'scroll', description: 'Scroll the page', input_schema: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'] }, amount: { type: 'number' } } } },
    { name: 'screenshot', description: 'Capture a screenshot', input_schema: { type: 'object', properties: {} } },
    { name: 'getContent', description: 'Extract page content', input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['text', 'html', 'title', 'url', 'links'] }, selector: { type: 'string' } } } },
    { name: 'evaluate', description: 'Execute JavaScript in ISOLATED page context. Has DOM access. Safe — no shared state with page scripts.', input_schema: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] } },
    { name: 'evaluatePage', description: 'Execute JavaScript in page MAIN context. Full variable access. REQUIRES user confirmation before execution.', input_schema: { type: 'object', properties: { script: { type: 'string' } }, required: ['script'] } },
    { name: 'waitFor', description: 'Wait for a condition', input_schema: { type: 'object', properties: { selector: { type: 'string' }, text: { type: 'string' }, script: { type: 'string' }, timeoutMs: { type: 'number' } } } },
    { name: 'getTabs', description: 'List all tabs', input_schema: { type: 'object', properties: {} } },
    { name: 'closeTab', description: 'Close a tab', input_schema: { type: 'object', properties: { tabId: { type: 'number' } }, required: ['tabId'] } },
    { name: 'switchTab', description: 'Switch to a tab', input_schema: { type: 'object', properties: { tabId: { type: 'number' } }, required: ['tabId'] } },
    { name: 'set_plan', description: 'Set a checklist of 3-6 action steps', input_schema: { type: 'object', properties: { steps: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, status: { type: 'string', enum: ['pending', 'done'] } }, required: ['title'] } } }, required: ['steps'] } },
    { name: 'update_plan', description: 'Mark a plan step as done', input_schema: { type: 'object', properties: { step_index: { type: 'number' } }, required: ['step_index'] } },
    { name: 'skill', description: 'Manage domain skills: get, list, create, delete', input_schema: { type: 'object', properties: { action: { type: 'string', enum: ['get', 'list', 'create', 'delete'] }, name: { type: 'string' }, skill: { type: 'object', description: 'Skill object — required when action=create. Fields: name, domainPatterns[], library, description.', properties: { name: { type: 'string' }, domainPatterns: { type: 'array', items: { type: 'string' } }, library: { type: 'string' }, description: { type: 'string' } } } }, required: ['action'] } },
    { name: 'envoy_gate_status', description: 'Envoy gate state — read the GateDecision ledger for the current wallet workspace (default_no/review_required/approved_yes counts).', input_schema: { type: 'object', properties: {} } },
    { name: 'envoy_draft', description: 'Draft a governed outbound message — the agent recommends; NEVER sends. Recipient identity (D1) + offer slug required.', input_schema: { type: 'object', properties: { recipient: { type: 'string' }, offer: { type: 'string' }, context: { type: 'string' } }, required: ['recipient', 'offer'] } },
    { name: 'envoy_classify_reply', description: 'Classify an inbound reply via the supervised classifier (positive_reply / objection / meeting_requested / opt_out / bounce / complaint).', input_schema: { type: 'object', properties: { replyText: { type: 'string' }, threadId: { type: 'string' } }, required: ['replyText'] } },
    { name: 'envoy_receipt_chain', description: 'Read the Revenue Book receipt chain for the current workspace. Today: live a2a/inbox surface; future: full Revenue Book at envoy.getrida.work.', input_schema: { type: 'object', properties: {} } },
    { name: 'envoy_tristate', description: 'Local tristate scorer (+1 authority / 0 null / -1 hedge) for a draft. Standing quality gate on all client-facing copy.', input_schema: { type: 'object', properties: { draft: { type: 'string' } }, required: ['draft'] } },
    { name: 'envoy_identity_resolve', description: 'Resolve the active wallet to a verified identity via the live x402 path. Proves D1 (identity is a platform guarantee).', input_schema: { type: 'object', properties: {} } },
    { name: 'memory_recall', description: 'Recall durable agent memories from the server-side envoy_agent_memories store, tenant-scoped. Call with entities[] to match (e.g. ["bloomberg", "energy"]); or omit entities + use since/limit for a recent-N view. Memories written by any surface (extension, email, SMS, portal) are visible from any other — that is the whole point of this layer.', input_schema: { type: 'object', properties: { entities: { type: 'array', items: { type: 'string' }, description: 'Lowercase entity strings to match (company names, topics, tools).' }, limit: { type: 'number', description: 'Max results (default 25, max 100).' }, since: { type: 'string', description: 'ISO timestamp — only memories after this time.' } } } },
    { name: 'memory_remember', description: 'Persist a durable agent memory to envoy_agent_memories, tenant-scoped. Use for: a conversation the user wants to keep, a research thread worth returning to, an inbox reply worth connecting to a future task, a page visit worth indexing. Entities let the recall tool find this memory later. surface defaults to "extension"; the parameter is real for cross-surface callers (e.g. an email-reply handler would write surface="email").', input_schema: { type: 'object', properties: { summary: { type: 'string', description: 'Human-readable summary — what is worth remembering.' }, surface: { type: 'string', enum: ['extension', 'email', 'sms', 'portal', 'system'] }, kind: { type: 'string', enum: ['conversation', 'receipt', 'page_visit', 'inbound_reply', 'outbound_send', 'system_event'] }, source_ref: { type: 'string', description: 'Opaque source identifier — URL, thread id, message id, etc.' }, entities: { type: 'array', items: { type: 'string' }, description: 'Lowercase entity strings to index this memory under.' }, metadata: { type: 'object', description: 'Arbitrary JSON metadata (optional).' } }, required: ['summary'] } },
    // ═══════════════════════════════════════════════════════════════
    // FULFILLMENT RAILS — Real Envoy API endpoints (not degradation stubs)
    // ═══════════════════════════════════════════════════════════════
    { name: 'pipeline_list_stages', description: 'List CRM pipeline stages.', input_schema: { type: 'object', properties: {} } },
    { name: 'pipeline_create_stage', description: 'Create a new pipeline stage.', input_schema: { type: 'object', properties: { name: { type: 'string' }, slug: { type: 'string' }, position: { type: 'number' }, color: { type: 'string' } }, required: ['name', 'slug'] } },
    { name: 'pipeline_list_leads', description: 'List leads. Identity enrichment starts at opt-in (website, calendar, email, SMS, LinkedIn).', input_schema: { type: 'object', properties: { stage_id: { type: 'string' }, status: { type: 'string' }, limit: { type: 'number' }, offset: { type: 'number' } } } },
    { name: 'pipeline_create_lead', description: 'Create a lead. Omniplatform opt-in.', input_schema: { type: 'object', properties: { email: { type: 'string' }, first_name: { type: 'string' }, last_name: { type: 'string' }, company: { type: 'string' }, title: { type: 'string' }, phone: { type: 'string' }, source: { type: 'string' }, stage_id: { type: 'string' } }, required: ['email'] } },
    { name: 'pipeline_get_lead', description: 'Get a lead by ID.', input_schema: { type: 'object', properties: { lead_id: { type: 'string' } }, required: ['lead_id'] } },
    { name: 'pipeline_update_lead', description: 'Update a lead.', input_schema: { type: 'object', properties: { lead_id: { type: 'string' }, stage_id: { type: 'string' }, icp_score: { type: 'number' }, status: { type: 'string' } }, required: ['lead_id'] } },
    { name: 'pipeline_list_opportunities', description: 'List deal opportunities.', input_schema: { type: 'object', properties: { lead_id: { type: 'string' }, limit: { type: 'number' } } } },
    { name: 'pipeline_create_opportunity', description: 'Create a deal opportunity.', input_schema: { type: 'object', properties: { lead_id: { type: 'string' }, stage: { type: 'string' }, value: { type: 'number' } }, required: ['lead_id'] } },
    { name: 'pipeline_update_opportunity', description: 'Update a deal opportunity.', input_schema: { type: 'object', properties: { opportunity_id: { type: 'string' }, stage: { type: 'string' }, value: { type: 'number' } }, required: ['opportunity_id'] } },
    { name: 'sms_list_rails', description: 'List SMS phone numbers.', input_schema: { type: 'object', properties: {} } },
    { name: 'sms_create_rail', description: 'Provision SMS rail. E.164 format (e.g. +19177408443).', input_schema: { type: 'object', properties: { phone_number_e164: { type: 'string' }, label: { type: 'string' } }, required: ['phone_number_e164'] } },
    { name: 'sms_list_events', description: 'List SMS messages.', input_schema: { type: 'object', properties: { rail_id: { type: 'string' }, lead_id: { type: 'string' }, direction: { type: 'string' } } } },
    { name: 'sms_send', description: 'Send SMS via rail.', input_schema: { type: 'object', properties: { rail_id: { type: 'string' }, to_e164: { type: 'string' }, body: { type: 'string' }, lead_id: { type: 'string' } }, required: ['rail_id', 'to_e164', 'body'] } },
    { name: 'voice_list_rails', description: 'List voice phone numbers.', input_schema: { type: 'object', properties: {} } },
    { name: 'voice_create_rail', description: 'Provision voice rail.', input_schema: { type: 'object', properties: { phone_number_e164: { type: 'string' }, call_handling: { type: 'string' } }, required: ['phone_number_e164'] } },
    { name: 'voice_list_calls', description: 'List voice call records.', input_schema: { type: 'object', properties: { rail_id: { type: 'string' }, lead_id: { type: 'string' } } } },
    { name: 'voice_log_call', description: 'Log a voice call with transcript.', input_schema: { type: 'object', properties: { rail_id: { type: 'string' }, direction: { type: 'string' }, from_e164: { type: 'string' }, to_e164: { type: 'string' }, duration_seconds: { type: 'number' }, transcript_text: { type: 'string' }, lead_id: { type: 'string' } }, required: ['rail_id'] } },
    { name: 'data_room_list_documents', description: 'List Data Room documents. RBAC: owner/member/viewer.', input_schema: { type: 'object', properties: { limit: { type: 'number' } } } },
    { name: 'data_room_upload_document', description: 'Upload document to Data Room.', input_schema: { type: 'object', properties: { filename: { type: 'string' }, doc_type: { type: 'string' } }, required: ['filename', 'doc_type'] } },
    { name: 'data_room_get_document', description: 'Get Data Room document by ID.', input_schema: { type: 'object', properties: { document_id: { type: 'string' } }, required: ['document_id'] } },
  ];
}

async function getProviderConfig() {
  const data = await chrome.storage.local.get(PROVIDER_KEY);
  return data[PROVIDER_KEY] || { mode: 'byok', provider: 'openai', apiKey: '' };
}

async function getConversation() {
  const data = await chrome.storage.local.get(CONVERSATION_KEY);
  return data[CONVERSATION_KEY] || [];
}

// D2/D3 in code — Lamport receipt emission for state-changing tool calls.
// The conversation IS the chronological (Lamport) receipt chain. Every
// mutation appends an immutable 9-field receipt to chrome.storage.local.
async function getWalletActor() {
  const d = await chrome.storage.local.get('getrida_wallet');
  return d.getrida_wallet || { address: '', chain: '' };
}

async function emitLamportReceiptForToolCall(toolName, args, result, userMessage) {
  try {
    const { isStateChanging, buildReceipt, emitReceipt } = await import('./agent-receipts.js');
    if (!isStateChanging(toolName)) return;
    const wallet = await getWalletActor();
    const receipt = buildReceipt({
      actor: wallet.address || 'unknown',
      authority: wallet.chain || 'unverified',
      source: 'getrida-extension/agent-loop',
      action: toolName,
      target: args && (args.selector || args.url || args.recipient || null),
      inputPayload: JSON.stringify({ args, userMessage: (userMessage || '').slice(0, 200) }),
      outputPayload: JSON.stringify(result).slice(0, 800),
      evidenceRefs: result && result.receipt ? [result.receipt] : [],
    });
    await emitReceipt(receipt);
  } catch { /* never break the agent loop over a receipt write */ }
}

async function saveConversation(messages) {
  await chrome.storage.local.set({ [CONVERSATION_KEY]: messages.slice(-50) });
}

async function clearConversation() {
  await chrome.storage.local.set({ [CONVERSATION_KEY]: [] });
}

function waitForEvalConfirmation() {
  return new Promise((resolve) => {
    const handler = (msg) => {
      if (msg.action === 'confirmEvalResponse') {
        chrome.runtime.onMessage.removeListener(handler);
        resolve(msg.approved === true);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      resolve(false);
    }, 60000);
  });
}

async function runAgentTurn(userMessage, onStream, onToolCall, onToolResult, onPlanUpdate, abortSignal) {
  const config = await getProviderConfig();
  const conversation = await getConversation();

  conversation.push({ role: 'user', content: userMessage });

  // v0.5.0 — Inject client0 context rail into system prompt (per-build employee)
  let systemPrompt = SYSTEM_PROMPT;
  try {
    const ctx = await new Promise((resolve) => {
      chrome.storage.local.get(['getrida_client0_context'], (s) => resolve(s['getrida_client0_context'] || null));
    });
    if (ctx && (ctx.monofile_summary || ctx.sequence_log_tail || (ctx.active_offers && ctx.active_offers.length))) {
      const ws = ctx.workspace || {};
      const offers = (ctx.active_offers || []).map(o => `- ${o.offer_name || o.offer_key || ''} [${o.status || ''}]`).join('\n');
      systemPrompt += `\n\n## Workspace context (v0.5.0 rail)\n`;
      if (ws.label || ws.slug) systemPrompt += `**Workspace:** ${ws.label || ws.slug}${ws.agent_identity ? ` · agent: ${ws.agent_identity}` : ''}${ws.agent_inbox ? ` · inbox: ${ws.agent_inbox}` : ''}\n`;
      if (ctx.monofile_summary) systemPrompt += `\n### Monofile summary\n${ctx.monofile_summary.slice(0, 1500)}\n`;
      if (ctx.sequence_log_tail) systemPrompt += `\n### Recent activity (sequence log)\n${ctx.sequence_log_tail.slice(-2000)}\n`;
      if (offers) systemPrompt += `\n### Active offers\n${offers}\n`;
    }
  } catch {}

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversation,
  ];

  const tools = getToolSchemas();
  let maxIterations = 10;
  let assistantText = '';
  let plan = null;
  let stopped = false;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (abortSignal && abortSignal.aborted) {
      stopped = true;
      break;
    }
    let response;
    try {
      response = await callLLM(config, messages, tools);
    } catch (e) {
      return { error: e.message, text: assistantText };
    }

    if (response.tool_calls && response.tool_calls.length > 0) {
      messages.push({ role: 'assistant', content: response.content || '', tool_calls: response.tool_calls });

      for (const tc of response.tool_calls) {
        const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        onToolCall?.(tc.function.name, args);

        let result;
        if (tc.function.name === 'set_plan') {
          plan = args.steps;
          result = { ok: true, plan };
          onPlanUpdate?.(plan);
        } else if (tc.function.name === 'update_plan') {
          if (plan) { plan[args.step_index].status = args.status || 'done'; onPlanUpdate?.(plan); }
          result = { ok: true };
        } else if (tc.function.name === 'skill') {
          result = await handleSkillTool(args);
        } else if (tc.function.name === 'evaluatePage') {
          onToolCall?.(tc.function.name, args);
          onToolResult?.('evaluatePage', { ok: true, status: 'awaiting_confirmation', script: args.script.slice(0, 200) + (args.script.length > 200 ? '...' : '') });
          chrome.runtime.sendMessage({ action: 'agentStream', type: 'evalConfirmRequest', code: args.script }).catch(() => {});
          const approved = await waitForEvalConfirmation();
          if (!approved) {
            result = { ok: false, error: 'User denied evaluatePage execution.' };
          } else {
            const { executeTool } = await import('./browser-tools.js');
            result = await executeTool('evaluatePage_exec', args);
          }
        } else if (tc.function.name.startsWith('envoy_')) {
          const { executeEnvoyTool } = await import('./envoy-tools.js');
          result = await executeEnvoyTool(tc.function.name, args);
        } else if (tc.function.name === 'memory_recall' || tc.function.name === 'memory_remember') {
          // Feature 3 of the Build Spec: durable cross-surface agent memory.
          // Calls the envoy endpoints added in this same commit
          // (POST /api/envoy/agent-memory/{remember,recall}). Same grk_
          // auth chain as every other envoy_ tool.
          const { executeAgentMemoryTool } = await import('./agent-memory.js');
          result = await executeAgentMemoryTool(tc.function.name, args);
        } else if (tc.function.name.startsWith('pipeline_') || tc.function.name.startsWith('sms_') || tc.function.name.startsWith('voice_') || tc.function.name.startsWith('data_room_')) {
          const { executeFulfillmentTool } = await import('./envoy-fulfillment-rails.js');
          result = await executeFulfillmentTool(tc.function.name, args);
        } else {
          const { executeTool } = await import('./browser-tools.js');
          result = await executeTool(tc.function.name, args);
        }

        onToolResult?.(tc.function.name, result);
        await emitLamportReceiptForToolCall(tc.function.name, args, result, userMessage);
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 4000) });
      }
      continue;
    }

    assistantText = response.content || '';
    messages.push({ role: 'assistant', content: assistantText });
    conversation.push({ role: 'assistant', content: assistantText });
    await saveConversation(conversation);
    onStream?.(assistantText);
    break;
  }

  return { text: assistantText, plan, stopped };
}

async function callLLM(config, messages, tools) {
  const { mode, provider, apiKey } = config;

  if (mode === 'byok' && apiKey) {
    return callOpenAICompatible(provider, apiKey, messages, tools);
  }

  if (mode === 'rida') {
    return callRidaAPI(messages, tools);
  }

  throw new Error('No LLM provider configured. Set an API key in Settings.');
}

async function callOpenAICompatible(provider, apiKey, messages, tools) {
  const endpoints = {
    openai: 'https://api.openai.com/v1/chat/completions',
    anthropic: 'https://api.anthropic.com/v1/messages',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
  };

  const url = endpoints[provider] || endpoints.openai;

  if (provider === 'gemini') {
    return callGemini(apiKey, messages, tools);
  }

  if (provider === 'anthropic') {
    const sysMsg = messages.find(m => m.role === 'system');
    const convMsgs = messages.filter(m => m.role !== 'system').map(m => {
      if (m.role === 'tool') return { role: 'user', content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }] };
      if (m.tool_calls) return { role: 'assistant', content: m.content, tool_use: m.tool_calls.map(tc => ({ id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) })) };
      return { role: m.role, content: m.content };
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: sysMsg?.content || '',
        messages: convMsgs,
        tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
      }),
      signal: AbortSignal.timeout(90000),
    });

    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text().catch(() => '')}`);
    const data = await res.json();
    const contentBlocks = data.content || [];
    const text = contentBlocks.filter(b => b.type === 'text').map(b => b.text).join('');
    const toolUses = contentBlocks.filter(b => b.type === 'tool_use').map(b => ({
      id: b.id, function: { name: b.name, arguments: JSON.stringify(b.input) }
    }));
    return { content: text, tool_calls: toolUses.length ? toolUses : undefined };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: messages.map(m => {
        if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
        if (m.tool_calls) return { role: 'assistant', content: m.content, tool_calls: m.tool_calls };
        return { role: m.role, content: m.content };
      }),
      tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })),
      max_tokens: 4096,
    }),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  const choice = data.choices?.[0]?.message;
  return { content: choice?.content || '', tool_calls: choice?.tool_calls };
}

async function callGemini(apiKey, messages, tools) {
  const systemMsg = messages.find(m => m.role === 'system');
  const contents = messages.filter(m => m.role !== 'system').map(m => {
    if (m.role === 'user') return { role: 'user', parts: [{ text: m.content }] };
    if (m.role === 'assistant') {
      const parts = [{ text: m.content || '' }];
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          let args = tc.function.arguments;
          if (typeof args === 'string') { try { args = JSON.parse(args); } catch {} }
          parts.push({ functionCall: { name: tc.function.name, args } });
        }
      }
      return { role: 'model', parts };
    }
    if (m.role === 'tool') {
      let content = m.content;
      try { content = JSON.parse(content); } catch {}
      return { role: 'function', parts: [{ functionResponse: { name: m.tool_call_id, response: content } }] };
    }
    return { role: 'user', parts: [{ text: m.content || '' }] };
  });

  const body = { contents };
  if (tools.length) {
    body.tools = [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      })),
    }];
  }
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    },
  );

  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts.filter(p => p.text).map(p => p.text).join('');
  const toolCalls = parts.filter(p => p.functionCall).map((p, i) => ({
    id: `gc_${i}`,
    function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args) },
  }));
  return { content: text, tool_calls: toolCalls.length ? toolCalls : undefined };
}

async function callRidaAPI(messages, tools) {
  const stored = await chrome.storage.local.get(['getrida_grk_key', 'getrida_endpoint']);
  const grkKey = stored.getrida_grk_key || '';
  const endpoint = stored.getrida_endpoint || 'https://app.getrida.work';

  const userMessage = messages.filter(m => m.role === 'user').pop();
  const message = userMessage?.content || '';

  const res = await fetch(`${endpoint}/api/agent/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(grkKey ? { 'Authorization': `Bearer ${grkKey}` } : {}),
    },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(90000),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Rida API error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();

  return {
    content: data.reply || data.response?.content || '',
    tool_calls: null,
  };
}

async function callRidaHistory() {
  const stored = await chrome.storage.local.get(['getrida_grk_key', 'getrida_endpoint']);
  const grkKey = stored.getrida_grk_key || '';
  const endpoint = stored.getrida_endpoint || 'https://app.getrida.work';

  const res = await fetch(`${endpoint}/api/agent/chat/history?limit=50`, {
    headers: { ...(grkKey ? { 'Authorization': `Bearer ${grkKey}` } : {}) },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.messages || [];
}

async function handleSkillTool(args) {
  const { getSkills, getSkill, saveSkill, deleteSkill } = await import('./skills.js');
  switch (args.action) {
    case 'list': return { ok: true, skills: await getSkills() };
    case 'get': return { ok: true, skill: await getSkill(args.name) };
    case 'create': return await saveSkill(args.skill);
    case 'delete': return await deleteSkill(args.name);
    default: return { ok: false, error: 'Unknown skill action' };
  }
}

export { runAgentTurn, getConversation, clearConversation, saveConversation, getProviderConfig, callRidaHistory };