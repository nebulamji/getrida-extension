// meeting-bot.js — Detect meetings and dispatch Vexa bots
//
// Detects when user is on a meeting page (Google Meet, Zoom web, Teams web)
// and dispatches a Vexa bot to join them automatically.
//
// Communication flow:
//   content.js detects meeting URL on the page
//     -> sends MEETING_DETECTED to background.js
//        -> background.js calls Vexa /bots API
//           -> Vexa bot joins the meeting
//              -> Vexa fires webhook to Worker on bot_joined / bot_left
//                 -> Worker stores transcript, fires Hermes for fulfillment

const MEETING_STATE_KEY = 'getrida_meeting_state';

const DEFAULT_MEETING_STATE = {
  active: null,        // { platform, native_id, url, title, dispatched_at, bot_id, container_id }
  history: [],         // last 20 meetings
  webhook_set: false,  // whether the Worker webhook is configured
};

const VEXA_BASE_URL = 'https://vexa.artofficial.computer';
const VEXA_API_KEY = '';  // Loaded from chrome.storage.local[getrida_vexa_key]

const WORKER_BASE_URL = 'https://hooks.getrida.work';

// ── Meeting detection ─────────────────────────────────────────────────────────

// Returns { platform, native_id, url, title } if this URL is a meeting, else null.
function detectMeetingUrl(url, pageTitle = '') {
  if (!url) return null;

  let parsed;
  try { parsed = new URL(url); } catch { return null; }

  const host = parsed.hostname || '';
  const path = parsed.pathname || '';

  // Google Meet: https://meet.google.com/abc-defg-hij
  if (host === 'meet.google.com' && path.length > 1) {
    const code = path.replace(/^\/+/, '').split('/')[0].split('?')[0];
    if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(code)) {
      return {
        platform: 'google_meet',
        native_id: code,
        url: `https://meet.google.com/${code}`,
        title: pageTitle,
      };
    }
  }

  // Zoom web client: https://app.zoom.us/wc/join/MEETING_ID
  // Zoom meeting join page: https://zoom.us/j/MEETING_ID
  if (host.endsWith('zoom.us') && (path.startsWith('/wc/') || path.startsWith('/j/'))) {
    const parts = path.split('/').filter(Boolean);
    const meetingId = parts[parts.length - 1]?.split('?')[0];
    if (meetingId && /^\d{8,}$/.test(meetingId)) {
      return {
        platform: 'zoom',
        native_id: meetingId,
        url: `https://zoom.us/j/${meetingId}`,
        title: pageTitle,
      };
    }
  }

  // Microsoft Teams: https://teams.microsoft.com/l/meetup-join/...
  if (host === 'teams.microsoft.com' || host === 'teams.live.com') {
    const m = url.match(/meetup-join\/([^/?#]+)/);
    if (m) {
      return {
        platform: 'ms_teams',
        native_id: m[1],
        url,
        title: pageTitle,
      };
    }
  }

  return null;
}

// ── Vexa API calls ────────────────────────────────────────────────────────────

async function dispatchVexaBot(platform, nativeId, meetingUrl, meetingTopic) {
  const stored = await chrome.storage.local.get(['getrida_vexa_key']);
  const apiKey = stored.getrida_vexa_key || VEXA_API_KEY;
  if (!apiKey) {
    throw new Error('Vexa API key not configured. Add it in Settings.');
  }

  const payload = {
    platform,
    native_meeting_id: nativeId,
    transcribe_enabled: false,
  };

  if (meetingTopic) payload.meeting_topic = meetingTopic;

  const res = await fetch(`${VEXA_BASE_URL}/bots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 409) {
    // Bot already dispatched for this meeting
    const data = await res.json();
    return { duplicate: true, ...data };
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Vexa API error ${res.status}: ${errBody}`);
  }

  return await res.json();
}

async function setVexaWebhook(webhookUrl) {
  const stored = await chrome.storage.local.get(['getrida_vexa_key']);
  const apiKey = stored.getrida_vexa_key;
  if (!apiKey) throw new Error('Vexa API key not configured');

  const res = await fetch(`${VEXA_BASE_URL}/user/webhook`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      webhook_url: webhookUrl,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to set webhook: ${res.status} ${err}`);
  }

  return await res.json();
}

// ── Worker session registration ──────────────────────────────────────────────
//
// Registers a meeting with the Worker BEFORE dispatching the Vexa bot. This
// ensures the transcript webhook (POST /api/meetings/transcript) has a session
// row to attach to when it fires. Without this, transcripts return 404.

async function registerWorkerSession(meeting) {
  const stored = await chrome.storage.local.get(['getrida_worker_key']);
  const workerKey = stored.getrida_worker_key;
  const headers = { "Content-Type": "application/json" };
  if (workerKey) headers["Authorization"] = `Bearer ${workerKey}`;

  const res = await fetch(`${WORKER_BASE_URL}/api/meetings/register`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      gcal_event_id: meeting.gcal_event_id || `extension-${Date.now()}`,
      meeting_title: meeting.title || meeting.url,
      meeting_url: meeting.url,
      scheduled_at: meeting.scheduled_at || new Date().toISOString(),
      attendee_emails: meeting.attendee_emails || [],
      client_slug: meeting.client_slug || "kb",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Worker register failed: ${res.status} ${err}`);
  }

  const body = await res.json();
  return body.session_id || body.id;
}

// ── State management ──────────────────────────────────────────────────────────

async function getMeetingState() {
  const data = await chrome.storage.local.get(MEETING_STATE_KEY);
  return data[MEETING_STATE_KEY] || DEFAULT_MEETING_STATE;
}

async function setMeetingState(state) {
  await chrome.storage.local.set({ [MEETING_STATE_KEY]: state });
}

async function recordActiveMeeting(meeting) {
  const state = await getMeetingState();
  state.active = meeting;
  state.history = [meeting, ...state.history].slice(0, 20);
  await setMeetingState(state);
}

async function clearActiveMeeting() {
  const state = await getMeetingState();
  state.active = null;
  await setMeetingState(state);
}

// ── Main entry: handle a detected meeting ────────────────────────────────────

async function handleMeetingDetected(meeting) {
  if (!meeting || !meeting.platform || !meeting.native_id) {
    throw new Error('Invalid meeting payload');
  }

  const state = await getMeetingState();

  // Idempotency: if we already dispatched for this meeting, don't dispatch again
  if (state.active &&
      state.active.platform === meeting.platform &&
      state.active.native_id === meeting.native_id) {
    return { duplicate: true, bot_id: state.active.bot_id };
  }

  // Register session with Worker first so the transcript webhook has somewhere to land.
  // Failure here is non-fatal — we still dispatch the bot, transcript just won't fulfill.
  let workerSessionId = null;
  try {
    workerSessionId = await registerWorkerSession(meeting);
  } catch (e) {
    console.warn('GetRida meeting-bot: worker register failed (continuing)', e);
  }

  const result = await dispatchVexaBot(
    meeting.platform,
    meeting.native_id,
    meeting.url,
    meeting.title,
  );

  const now = new Date().toISOString();
  const activeMeeting = {
    platform: meeting.platform,
    native_id: meeting.native_id,
    url: meeting.url,
    title: meeting.title,
    bot_id: result.id || 'duplicate',
    container_id: result.bot_container_id || null,
    status: result.status || 'requested',
    worker_session_id: workerSessionId,
    dispatched_at: now,
    duplicate: !!result.duplicate,
  };

  await recordActiveMeeting(activeMeeting);
  return activeMeeting;
}

async function getActiveMeeting() {
  const state = await getMeetingState();
  return state.active;
}

async function getMeetingHistory() {
  const state = await getMeetingState();
  return state.history;
}

async function ensureWebhookConfigured() {
  const state = await getMeetingState();
  if (state.webhook_set) return true;

  const webhookUrl = `${WORKER_BASE_URL}/api/meetings/transcript`;
  try {
    await setVexaWebhook(webhookUrl);
    state.webhook_set = true;
    await setMeetingState(state);
    return true;
  } catch (e) {
    console.warn('GetRida meeting-bot: webhook setup failed', e);
    return false;
  }
}

export {
  detectMeetingUrl,
  dispatchVexaBot,
  setVexaWebhook,
  registerWorkerSession,
  handleMeetingDetected,
  getActiveMeeting,
  getMeetingHistory,
  clearActiveMeeting,
  ensureWebhookConfigured,
  VEXA_BASE_URL,
  WORKER_BASE_URL,
};