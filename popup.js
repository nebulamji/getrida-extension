const STATE_KEY = 'getrida_state';
const ENDPOINT_KEY = 'getrida_endpoint';
const SESSIONS_KEY = 'getrida_sessions';
const WALLET_KEY = 'getrida_wallet';

document.addEventListener('DOMContentLoaded', async () => {
  const cfgToggle = document.getElementById('cfgToggle');
  const cfgBody = document.getElementById('cfgBody');
  const endpointInput = document.getElementById('endpoint');
  const missionInput = document.getElementById('mission');
  const statsDiv = document.getElementById('stats');
  const compileBtn = document.getElementById('compileBtn');
  const closeBtn = document.getElementById('closeBtn');
  const historyBtn = document.getElementById('historyBtn');
  const statusDiv = document.getElementById('status');
  const resultDiv = document.getElementById('result');
  const viewLink = document.getElementById('viewLink');
  const sessionId = document.getElementById('sessionId');
  const noiseInfo = document.getElementById('noiseInfo');
  const previewDiv = document.getElementById('preview');
  const historyPanel = document.getElementById('historyPanel');
  const historyList = document.getElementById('historyList');
  const modeBadge = document.getElementById('modeBadge');

  cfgToggle.addEventListener('click', () => {
    cfgBody.classList.toggle('open');
  });

  const saved = await chrome.storage.local.get([ENDPOINT_KEY, WALLET_KEY]);
  if (saved[ENDPOINT_KEY]) endpointInput.value = saved[ENDPOINT_KEY];

  const wallet = saved[WALLET_KEY];
  if (wallet && wallet.address) {
    modeBadge.textContent = 'CONNECTED';
    modeBadge.classList.add('connected');
  }

  endpointInput.addEventListener('change', () => {
    chrome.storage.local.set({ [ENDPOINT_KEY]: endpointInput.value });
  });

  const tabs = await chrome.tabs.query({ currentWindow: true });
  statsDiv.innerHTML = '<span class="num">' + tabs.length + '</span> tabs open';

  function render(state) {
    const staleDeadline = Date.now() - 120000;
    if ((state.status === 'capturing' || state.status === 'compiling') && state.timestamp && state.timestamp < staleDeadline) {
      state.status = 'error';
      state.message = 'Compile timed out. The LLM may be overloaded. Try again with fewer tabs or a more specific mission.';
    }

    compileBtn.disabled = (state.status === 'capturing' || state.status === 'compiling');
    closeBtn.disabled = !(state.status === 'done' && state.noiseUrls && state.noiseUrls.length > 0);

    if (state.status === 'idle') {
      statusDiv.textContent = '';
      statusDiv.className = 'status';
    } else if (state.status === 'capturing') {
      statusDiv.textContent = state.message || 'Reading tabs...';
      statusDiv.className = 'status compiling spinning';
    } else if (state.status === 'compiling') {
      statusDiv.textContent = state.message || 'Compiling...';
      statusDiv.className = 'status compiling spinning';
    } else if (state.status === 'done') {
      statusDiv.textContent = state.message;
      statusDiv.className = 'status ok';
    } else if (state.status === 'error') {
      statusDiv.textContent = state.message;
      statusDiv.className = 'status err';
    }

    if (state.session && state.session.ok) {
      const base = (endpointInput.value || '').replace('/api/v1/compile', '');
      if (state.session.view_url) {
        viewLink.href = base + state.session.view_url;
        viewLink.style.display = 'inline';
      } else {
        viewLink.style.display = 'none';
      }
      sessionId.textContent = state.session.session_id || '';
      resultDiv.classList.add('visible');
      if (state.noiseUrls && state.noiseUrls.length > 0) {
        noiseInfo.textContent = state.noiseUrls.length + ' noise tab(s) identified';
      } else {
        noiseInfo.textContent = 'No noise tabs.';
      }
      if (state.session.monofile_preview) {
        previewDiv.textContent = state.session.monofile_preview.slice(0, 2000);
      }
    } else {
      resultDiv.classList.remove('visible');
    }
  }

  const stateData = await chrome.storage.local.get(STATE_KEY);
  const state = stateData[STATE_KEY] || {};
  render(state);

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'stateUpdate') {
      render(msg.state);
    }
    if (msg.action === 'meetingBotDispatched') {
      renderMeeting(msg.meeting, []);
      refreshMeetingHistory();
    }
    if (msg.action === 'meetingBotError') {
      renderMeetingError(msg.error);
    }
  });

  // ── Meeting-bot UI ────────────────────────────────────────────────────
  const meetingDot = document.getElementById('meetingDot');
  const meetingLabel = document.getElementById('meetingLabel');
  const meetingHistory = document.getElementById('meetingHistory');

  function renderMeeting(active, history) {
    if (active) {
      meetingDot.className = 'meeting-dot active';
      const platformLabel = {
        google_meet: 'Google Meet',
        zoom: 'Zoom',
        ms_teams: 'Microsoft Teams',
      }[active.platform] || active.platform;
      meetingLabel.textContent = `Bot joining: ${platformLabel} (${active.bot_id || 'pending'})`;
      meetingLabel.style.color = '#4a9';
    } else {
      meetingDot.className = 'meeting-dot';
      meetingLabel.textContent = 'Idle — open Meet/Zoom/Teams to dispatch';
      meetingLabel.style.color = '#888';
    }
  }

  function renderMeetingError(error) {
    meetingDot.className = 'meeting-dot error';
    meetingLabel.textContent = `Error: ${error}`;
    meetingLabel.style.color = '#c44';
  }

  function renderHistoryList(history) {
    if (!history || history.length === 0) {
      meetingHistory.innerHTML = '';
      return;
    }
    meetingHistory.innerHTML = history.slice(0, 5).map(m => {
      const platformLabel = {
        google_meet: 'Meet',
        zoom: 'Zoom',
        ms_teams: 'Teams',
      }[m.platform] || m.platform;
      const time = m.dispatched_at ? new Date(m.dispatched_at).toLocaleTimeString() : '';
      return `<div class="meeting-item">
        <span class="m-platform">${platformLabel}</span>
        <span class="m-time">${time}</span>
      </div>`;
    }).join('');
  }

  async function refreshMeetingState() {
    try {
      const activeResp = await chrome.runtime.sendMessage({ action: 'getActiveMeeting' });
      const historyResp = await chrome.runtime.sendMessage({ action: 'getMeetingHistory' });
      renderMeeting(activeResp?.meeting, historyResp?.history || []);
      renderHistoryList(historyResp?.history || []);
    } catch (e) {
      // Service worker may be inactive, ignore
    }
  }

  async function refreshMeetingHistory() {
    try {
      const historyResp = await chrome.runtime.sendMessage({ action: 'getMeetingHistory' });
      renderHistoryList(historyResp?.history || []);
    } catch {}
  }

  refreshMeetingState();
  setInterval(refreshMeetingState, 3000);

  let pollInterval = null;
  function startPoll() {
    if (pollInterval) return;
    pollInterval = setInterval(async () => {
      const d = await chrome.storage.local.get(STATE_KEY);
      const s = d[STATE_KEY] || {};
      render(s);
      if (s.status !== 'capturing' && s.status !== 'compiling') {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    }, 2000);
  }

  if (['capturing', 'compiling'].includes(state.status)) {
    startPoll();
  }

  compileBtn.addEventListener('click', async () => {
    const mission = missionInput.value.trim();
    if (!mission) {
      statusDiv.textContent = 'Enter a mission first.';
      statusDiv.className = 'status err';
      return;
    }
    const wallet = await chrome.storage.local.get(WALLET_KEY);
    chrome.runtime.sendMessage({
      action: 'compile',
      mission,
      walletAddress: wallet[WALLET_KEY]?.address || null,
      walletChain: wallet[WALLET_KEY]?.chain || null,
    });
    statusDiv.textContent = 'Starting...';
    statusDiv.className = 'status compiling spinning';
    compileBtn.disabled = true;
    startPoll();
  });

  closeBtn.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ action: 'closeNoise' });
    closeBtn.disabled = true;
    setTimeout(async () => {
      const d = await chrome.storage.local.get(STATE_KEY);
      render(d[STATE_KEY] || {});
    }, 500);
  });

  historyBtn.addEventListener('click', async () => {
    historyPanel.classList.toggle('open');
    if (historyPanel.classList.contains('open')) {
      await loadHistory();
    }
  });

  async function loadHistory() {
    const sessions = await chrome.runtime.sendMessage({ action: 'getSessions' });
    if (!sessions || sessions.length === 0) {
      historyList.innerHTML = '<div class="history-empty">No sessions yet.</div>';
      return;
    }
    historyList.innerHTML = sessions.map(s => {
      const date = new Date(s.timestamp).toLocaleString();
      return `<div class="history-item"><div class="h-mission">${escapeHtml(s.mission)}</div><div class="h-meta">${s.tabCount} tabs · ${date}</div></div>`;
    }).join('');
  }
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}