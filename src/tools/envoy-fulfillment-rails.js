// envoy-fulfillment-rails.js — Fulfillment rail tools for the GetRida Chrome Extension.
// These call REAL Envoy API endpoints at envoy.getrida.work/api/envoy/*
// Auth: Supabase JWT from portal login (stored in chrome.storage.local)
// Session isolation: each tool is scoped to the authenticated user's workspace
// WebSocket: agent events via wss://envoy.getrida.work/api/v1/envoy/events
//
// Phase 1: CRM Pipeline (stages, leads, opportunities)
// Phase 2: Unified Inbox (threads, messages)
// Phase 3: SMS Rails (send/receive via envoy_sms_rails)
// Phase 4: Voice Calls (log, transcript via envoy_voice_calls)
// Phase 5: Data Room (VDR documents with RBAC)

const ENVOY_API = 'https://envoy.getrida.work/api/envoy';

async function getAuth() {
  const d = await chrome.storage.local.get(['supabase_token', 'getrida_wallet']);
  const token = d.supabase_token || null;
  const wallet = d.getrida_wallet || { address: '', chain: '', sessionToken: '' };
  return { token, wallet };
}

async function envoyFetch(method, path, body) {
  const { token, wallet } = await getAuth();
  const headers = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = `Bearer ${token}`;
  if (wallet.address) headers['x-402-wallet'] = wallet.address;

  const init = { method, headers };
  if (body) init.body = JSON.stringify(body);

  try {
    const res = await fetch(`${ENVOY_API}${path}`, { ...init, signal: AbortSignal.timeout(15000) });
    let data;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1: CRM PIPELINE
// ════════════════════════════════════════════════════════════════════════════

async function pipelineListStages(args) {
  return await envoyFetch('GET', '/pipeline/stages');
}

async function pipelineCreateStage(args) {
  if (!args.name || !args.slug) return { ok: false, error: 'name and slug required' };
  return await envoyFetch('POST', '/pipeline/stages', { name: args.name, slug: args.slug, position: args.position || 0, color: args.color || '#4a9' });
}

async function pipelineListLeads(args) {
  const params = new URLSearchParams();
  if (args.stage_id) params.set('stage_id', args.stage_id);
  if (args.status) params.set('status', args.status);
  if (args.limit) params.set('limit', String(args.limit));
  if (args.offset) params.set('offset', String(args.offset));
  const qs = params.toString();
  return await envoyFetch('GET', `/pipeline/leads${qs ? '?' + qs : ''}`);
}

async function pipelineCreateLead(args) {
  if (!args.email) return { ok: false, error: 'email required' };
  return await envoyFetch('POST', '/pipeline/leads', {
    email: args.email,
    first_name: args.first_name || '',
    last_name: args.last_name || '',
    company: args.company || '',
    title: args.title || '',
    phone: args.phone || '',
    source: args.source || 'chrome-extension',
    source_detail: args.source_detail || '',
    stage_id: args.stage_id || null,
    icp_score: args.icp_score || null,
  });
}

async function pipelineGetLead(args) {
  if (!args.lead_id) return { ok: false, error: 'lead_id required' };
  return await envoyFetch('GET', `/pipeline/leads/${args.lead_id}`);
}

async function pipelineUpdateLead(args) {
  if (!args.lead_id) return { ok: false, error: 'lead_id required' };
  const updates = {};
  for (const k of ['first_name', 'last_name', 'company', 'title', 'phone', 'source', 'stage_id', 'icp_score', 'status']) {
    if (args[k] !== undefined) updates[k] = args[k];
  }
  return await envoyFetch('PATCH', `/pipeline/leads/${args.lead_id}`, updates);
}

async function pipelineListOpportunities(args) {
  const params = new URLSearchParams();
  if (args.lead_id) params.set('lead_id', args.lead_id);
  if (args.limit) params.set('limit', String(args.limit));
  const qs = params.toString();
  return await envoyFetch('GET', `/pipeline/opportunities${qs ? '?' + qs : ''}`);
}

async function pipelineCreateOpportunity(args) {
  if (!args.lead_id) return { ok: false, error: 'lead_id required' };
  return await envoyFetch('POST', '/pipeline/opportunities', {
    lead_id: args.lead_id,
    pipeline_name: args.pipeline_name || 'advisory',
    stage: args.stage || 'new',
    value: args.value || 0,
    currency: args.currency || 'usd',
    probability: args.probability || 0,
    attribution_source: args.attribution_source || 'chrome-extension',
    notes: args.notes || '',
  });
}

async function pipelineUpdateOpportunity(args) {
  if (!args.opportunity_id) return { ok: false, error: 'opportunity_id required' };
  const updates = {};
  for (const k of ['stage', 'value', 'currency', 'probability', 'notes']) {
    if (args[k] !== undefined) updates[k] = args[k];
  }
  return await envoyFetch('PATCH', `/pipeline/opportunities/${args.opportunity_id}`, updates);
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2: SMS RAILS
// ════════════════════════════════════════════════════════════════════════════

async function smsListRails(args) {
  return await envoyFetch('GET', '/sms/rails');
}

async function smsCreateRail(args) {
  if (!args.phone_number_e164) return { ok: false, error: 'phone_number_e164 required (E.164 format, e.g. +19177408443)' };
  return await envoyFetch('POST', '/sms/rails', {
    provider: args.provider || 'telnyx',
    phone_number_e164: args.phone_number_e164,
    label: args.label || '',
    sms_enabled: args.sms_enabled !== false,
    inbound_enabled: args.inbound_enabled !== false,
  });
}

async function smsListEvents(args) {
  const params = new URLSearchParams();
  if (args.rail_id) params.set('rail_id', args.rail_id);
  if (args.lead_id) params.set('lead_id', args.lead_id);
  if (args.direction) params.set('direction', args.direction);
  if (args.limit) params.set('limit', String(args.limit));
  const qs = params.toString();
  return await envoyFetch('GET', `/sms/events${qs ? '?' + qs : ''}`);
}

async function smsSend(args) {
  if (!args.rail_id || !args.to_e164 || !args.body) return { ok: false, error: 'rail_id, to_e164, and body required' };
  return await envoyFetch('POST', '/sms/events', {
    rail_id: args.rail_id,
    event_type: 'message.sent',
    direction: 'outbound',
    to_e164: args.to_e164,
    body: args.body,
    lead_id: args.lead_id || null,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 3: VOICE CALLS
// ════════════════════════════════════════════════════════════════════════════

async function voiceListRails(args) {
  return await envoyFetch('GET', '/voice/rails');
}

async function voiceCreateRail(args) {
  if (!args.phone_number_e164) return { ok: false, error: 'phone_number_e164 required' };
  return await envoyFetch('POST', '/voice/rails', {
    provider: args.provider || 'telnyx',
    phone_number_e164: args.phone_number_e164,
    call_handling: args.call_handling || 'agent_voicemail',
  });
}

async function voiceListCalls(args) {
  const params = new URLSearchParams();
  if (args.rail_id) params.set('rail_id', args.rail_id);
  if (args.lead_id) params.set('lead_id', args.lead_id);
  if (args.limit) params.set('limit', String(args.limit));
  const qs = params.toString();
  return await envoyFetch('GET', `/voice/calls${qs ? '?' + qs : ''}`);
}

async function voiceLogCall(args) {
  if (!args.rail_id) return { ok: false, error: 'rail_id required' };
  return await envoyFetch('POST', '/voice/calls', {
    rail_id: args.rail_id,
    direction: args.direction || 'inbound',
    from_e164: args.from_e164 || '',
    to_e164: args.to_e164 || '',
    duration_seconds: args.duration_seconds || 0,
    status: args.status || 'completed',
    transcript_text: args.transcript_text || '',
    lead_id: args.lead_id || null,
  });
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 4: DATA ROOM
// ════════════════════════════════════════════════════════════════════════════

async function dataRoomListDocuments(args) {
  // Uses existing envoy_vdr_documents via the onboarding API
  const params = new URLSearchParams();
  if (args.limit) params.set('limit', String(args.limit));
  const qs = params.toString();
  return await envoyFetch('GET', `/onboarding/vdr-documents${qs ? '?' + qs : ''}`);
}

async function dataRoomUploadDocument(args) {
  if (!args.filename || !args.doc_type) return { ok: false, error: 'filename and doc_type required' };
  return await envoyFetch('POST', '/onboarding/vdr-upload', {
    filename: args.filename,
    doc_type: args.doc_type,
    content_b64: args.content_b64 || '',
  });
}

async function dataRoomGetDocument(args) {
  if (!args.document_id) return { ok: false, error: 'document_id required' };
  return await envoyFetch('GET', `/onboarding/vdr-documents/${args.document_id}`);
}

// ════════════════════════════════════════════════════════════════════════════
// DISPATCHER
// ════════════════════════════════════════════════════════════════════════════

async function executeFulfillmentTool(name, args) {
  switch (name) {
    // CRM Pipeline
    case 'pipeline_list_stages': return await pipelineListStages(args);
    case 'pipeline_create_stage': return await pipelineCreateStage(args);
    case 'pipeline_list_leads': return await pipelineListLeads(args);
    case 'pipeline_create_lead': return await pipelineCreateLead(args);
    case 'pipeline_get_lead': return await pipelineGetLead(args);
    case 'pipeline_update_lead': return await pipelineUpdateLead(args);
    case 'pipeline_list_opportunities': return await pipelineListOpportunities(args);
    case 'pipeline_create_opportunity': return await pipelineCreateOpportunity(args);
    case 'pipeline_update_opportunity': return await pipelineUpdateOpportunity(args);
    // SMS Rails
    case 'sms_list_rails': return await smsListRails(args);
    case 'sms_create_rail': return await smsCreateRail(args);
    case 'sms_list_events': return await smsListEvents(args);
    case 'sms_send': return await smsSend(args);
    // Voice Calls
    case 'voice_list_rails': return await voiceListRails(args);
    case 'voice_create_rail': return await voiceCreateRail(args);
    case 'voice_list_calls': return await voiceListCalls(args);
    case 'voice_log_call': return await voiceLogCall(args);
    // Data Room
    case 'data_room_list_documents': return await dataRoomListDocuments(args);
    case 'data_room_upload_document': return await dataRoomUploadDocument(args);
    case 'data_room_get_document': return await dataRoomGetDocument(args);
    default: return { ok: false, error: 'Unknown fulfillment tool: ' + name };
  }
}

const FULFILLMENT_TOOL_DEFS = [
  // CRM Pipeline
  { name: 'pipeline_list_stages', description: 'List pipeline stages for the current workspace. Returns all stages in order.', params: {} },
  { name: 'pipeline_create_stage', description: 'Create a new pipeline stage. Requires name and slug.', params: { name: 'string', slug: 'string', position: 'number?', color: 'string?' } },
  { name: 'pipeline_list_leads', description: 'List leads in the CRM pipeline. Filter by stage_id or status.', params: { stage_id: 'string?', status: 'string?', limit: 'number?', offset: 'number?' } },
  { name: 'pipeline_create_lead', description: 'Create a new lead in the CRM. Email is required. Identity enrichment starts at opt-in — any surface (website, calendar, email reply, SMS, LinkedIn).', params: { email: 'string', first_name: 'string?', last_name: 'string?', company: 'string?', title: 'string?', phone: 'string?', source: 'string?', stage_id: 'string?' } },
  { name: 'pipeline_get_lead', description: 'Get a specific lead by ID. Returns full lead details including ICP score and tags.', params: { lead_id: 'string' } },
  { name: 'pipeline_update_lead', description: 'Update a lead. Move between stages, update ICP score, archive.', params: { lead_id: 'string', first_name: 'string?', last_name: 'string?', company: 'string?', stage_id: 'string?', icp_score: 'number?', status: 'string?' } },
  { name: 'pipeline_list_opportunities', description: 'List opportunities in the deal pipeline. Filter by lead_id.', params: { lead_id: 'string?', limit: 'number?' } },
  { name: 'pipeline_create_opportunity', description: 'Create a new opportunity (deal) linked to a lead. Advisory pipeline by default.', params: { lead_id: 'string', pipeline_name: 'string?', stage: 'string?', value: 'number?', probability: 'number?' } },
  { name: 'pipeline_update_opportunity', description: 'Update an opportunity. Move through deal stages, update value.', params: { opportunity_id: 'string', stage: 'string?', value: 'number?', probability: 'number?' } },
  // SMS Rails
  { name: 'sms_list_rails', description: 'List active SMS rails (phone numbers) for the workspace.', params: {} },
  { name: 'sms_create_rail', description: 'Provision a new SMS rail. Phone number in E.164 format (e.g. +19177408443).', params: { phone_number_e164: 'string', label: 'string?', provider: 'string?' } },
  { name: 'sms_list_events', description: 'List SMS events (messages). Filter by rail_id, lead_id, or direction (inbound/outbound).', params: { rail_id: 'string?', lead_id: 'string?', direction: 'string?', limit: 'number?' } },
  { name: 'sms_send', description: 'Send an SMS message via an active rail. Records as outbound event.', params: { rail_id: 'string', to_e164: 'string', body: 'string', lead_id: 'string?' } },
  // Voice Calls
  { name: 'voice_list_rails', description: 'List active voice rails (phone numbers) for the workspace.', params: {} },
  { name: 'voice_create_rail', description: 'Provision a new voice rail. Phone number in E.164 format.', params: { phone_number_e164: 'string', call_handling: 'string?' } },
  { name: 'voice_list_calls', description: 'List voice call records. Filter by rail_id or lead_id.', params: { rail_id: 'string?', lead_id: 'string?', limit: 'number?' } },
  { name: 'voice_log_call', description: 'Log a voice call record. Include transcript text for intelligence extraction.', params: { rail_id: 'string', direction: 'string?', from_e164: 'string?', to_e164: 'string?', duration_seconds: 'number?', transcript_text: 'string?', lead_id: 'string?' } },
  // Data Room
  { name: 'data_room_list_documents', description: 'List VDR documents in the Data Room. Scoped to workspace tenant. RBAC: owner=full, member=read-write, viewer=read-only.', params: { limit: 'number?' } },
  { name: 'data_room_upload_document', description: 'Upload a document to the Data Room. Requires filename and doc_type.', params: { filename: 'string', doc_type: 'string', content_b64: 'string?' } },
  { name: 'data_room_get_document', description: 'Get a specific VDR document by ID. Field-level permissions apply based on user role.', params: { document_id: 'string' } },
];

export { executeFulfillmentTool, FULFILLMENT_TOOL_DEFS };
