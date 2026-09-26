const STATE_KEY = 'getrida_state';
const ENDPOINT_KEY = 'getrida_endpoint';
const MODE_KEY = 'getrida_mode';
const PROVIDER_KEY = 'getrida_provider_config';
const WALLET_KEY = 'getrida_wallet';
const BASE_URL = 'https://getrida.work';

document.addEventListener('DOMContentLoaded', async () => {
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));
      item.classList.add('active');
      document.getElementById('view-' + item.dataset.view)?.classList.add('active');
      if (item.dataset.view === 'wallet') { loadWalletView(); renderWidgetState(); }
      if (item.dataset.view === 'agent') renderAgentContext();
      if (item.dataset.view === 'profile') renderProfile();
      if (item.dataset.view === 'integrations') loadIntegrationsView();
    });
  });

  const saved = await chrome.storage.local.get([ENDPOINT_KEY, MODE_KEY, PROVIDER_KEY, WALLET_KEY, 'getrida_first_run', 'getrida_capabilities']);
  const settingsEndpoint = document.getElementById('settingsEndpoint');
  const settingsMode = document.getElementById('settingsMode');
  const settingsProvider = document.getElementById('settingsProvider');
  const settingsApiKey = document.getElementById('settingsApiKey');
  const paidSettings = document.getElementById('paidSettings');

  if (saved[ENDPOINT_KEY]) settingsEndpoint.value = saved[ENDPOINT_KEY];
  const mode = saved[MODE_KEY] || 'free';
  const providerConfig = saved[PROVIDER_KEY] || { mode: 'byok', provider: 'openai', apiKey: '' };
  const walletState = saved[WALLET_KEY] || { address: '', chain: '', sessionToken: '' };
  settingsMode.value = mode;
  settingsProvider.value = providerConfig.provider || 'openai';
  settingsApiKey.value = providerConfig.apiKey || '';
  updateModeUI(mode);
  updateSettingsWalletStatus();

  settingsEndpoint.addEventListener('change', () => chrome.storage.local.set({ [ENDPOINT_KEY]: settingsEndpoint.value }));
  settingsMode.addEventListener('change', () => { chrome.storage.local.set({ [MODE_KEY]: settingsMode.value }); updateModeUI(settingsMode.value); });
  settingsProvider.addEventListener('change', () => { saveProviderConfig(); updateProviderUI(); });
  settingsApiKey.addEventListener('change', () => saveProviderConfig());

  function saveProviderConfig() {
    chrome.storage.local.set({ [PROVIDER_KEY]: { mode: 'byok', provider: settingsProvider.value, apiKey: settingsApiKey.value } });
    checkAgentReady();
  }

  function updateProviderUI() {
    document.getElementById('apiKeySetting').style.display = settingsProvider.value === 'rida' ? 'none' : 'block';
  }
  updateProviderUI();

  function updateModeUI(m) {
    paidSettings.style.display = m === 'paid' ? 'block' : 'none';
    if (m === 'paid') checkAgentReady();
  }

  function checkAgentReady() {
    const hasKey = settingsApiKey.value.length > 0 || settingsProvider.value === 'rida';
    const setupEl = document.getElementById('agentSetup');
    const workspaceEl = document.getElementById('agentWorkspace');
    if (hasKey) {
      setupEl.style.display = 'none';
      workspaceEl.style.display = '';
      document.getElementById('agentQuickProvider').value = settingsProvider.value;
      document.getElementById('agentQuickApiKey').value = settingsApiKey.value;
    } else {
      setupEl.style.display = '';
      workspaceEl.style.display = 'none';
      document.getElementById('agentQuickApiKey').focus();
    }
  }

  function updateSettingsWalletStatus() {
    const status = document.getElementById('settingsWalletStatus');
    if (walletState.address) {
      status.textContent = `Connected: ${walletState.address.slice(0, 16)}... on ${walletState.chain}`;
      status.style.color = '#4a9';
    } else {
      status.textContent = 'Not connected';
      status.style.color = '#555';
    }
  }

  document.getElementById('walletDisconnectBtn').addEventListener('click', async () => {
    walletState.address = '';
    walletState.chain = '';
    walletState.sessionToken = '';
    await chrome.storage.local.set({ [WALLET_KEY]: walletState });
    updateWalletUI();
    updateSettingsWalletStatus();
    document.getElementById('walletConnectStatus').textContent = 'Disconnected.';
    document.getElementById('walletConnectStatus').style.color = '#555';
  });

  document.getElementById('agentQuickSetupBtn').addEventListener('click', () => {
    const provider = document.getElementById('agentQuickProvider').value;
    const apiKey = document.getElementById('agentQuickApiKey').value.trim();
    const config = { mode: 'byok', provider, apiKey };
    if (provider === 'rida') config.apiKey = '';
    chrome.storage.local.set({ [PROVIDER_KEY]: config, [MODE_KEY]: 'paid' });
    settingsProvider.value = provider;
    settingsApiKey.value = apiKey;
    settingsMode.value = 'paid';
    updateModeUI('paid');
    updateProviderUI();
    checkAgentReady();
  });

  document.getElementById('agentQuickProvider').addEventListener('change', () => {
    const row = document.getElementById('agentQuickApiKeyRow');
    row.style.display = document.getElementById('agentQuickProvider').value === 'rida' ? 'none' : '';
  });

  setupCompile();
  setupAgent();
  setupWallet();
  setupCalendar();
  setupBookings();
  setupMeetingsLiveCard();
  loadClient0Context();

  if (saved['getrida_first_run']) {
    renderWelcome(saved['getrida_capabilities'] || {});
  } else {
    document.getElementById('mainNav').style.display = 'flex';
  }
});

function renderWelcome(caps) {
  document.getElementById('welcomeView').style.display = 'flex';

  const servicesEl = document.getElementById('welcomeServicesList');
  const svcs = caps.detectedServices || [];
  if (svcs.length) {
    servicesEl.innerHTML = svcs.map(s => `<span class="badge green" style="margin:2px;font-size:10px;">${s}</span>`).join(' ');
  } else {
    servicesEl.textContent = 'No services detected yet. Open Gmail, GitHub, or YouTube tabs to activate skills.';
  }

  const walletEl = document.getElementById('welcomeWalletStatus');
  const w = caps.detectedWallet;
  if (w === 'evm') walletEl.innerHTML = '<span class="badge green">MetaMask / EVM wallet detected</span>';
  else if (w === 'phantom' || w === 'solana') walletEl.innerHTML = '<span class="badge green">Phantom / Solana wallet detected</span>';
  else walletEl.textContent = 'No browser wallet detected. Connect from the Wallet tab after setup.';

  document.getElementById('welcomeConnectAllBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('welcomeWalletStatus');
    statusEl.textContent = 'Connecting...';
    statusEl.style.color = '#aa7';
    try {
      const detResp = await chrome.runtime.sendMessage({ action: 'detectWallet' });
      if (detResp.detected && detResp.providers.length) {
        const provider = detResp.providers[0];
        const connResp = await chrome.runtime.sendMessage({ action: 'connectWalletProvider', kind: provider.kind });
        if (connResp.ok && connResp.address) {
          await chrome.storage.local.set({
            [WALLET_KEY]: {
              address: connResp.address,
              chain: connResp.chain || 'evm',
              sessionToken: '',
            },
          });
          statusEl.innerHTML = `<span class="badge green">Connected ${connResp.address.slice(0, 12)}... on ${connResp.chain || 'evm'}</span>`;
        }
      } else {
        statusEl.textContent = 'No browser wallet found. Open the Wallet tab to paste an address manually.';
        statusEl.style.color = '#555';
      }
    } catch (e) {
      statusEl.textContent = `Connection failed: ${e.message}`;
      statusEl.style.color = '#c44';
    }
    hideWelcome();
  });

  document.getElementById('welcomeSkipBtn').addEventListener('click', () => hideWelcome());
}

function hideWelcome() {
  chrome.storage.local.set({ getrida_first_run: false });
  document.getElementById('welcomeView').style.display = 'none';
  document.getElementById('mainNav').style.display = 'flex';
}

function setupCompile() {
  const sideMission = document.getElementById('sideMission');
  const sideCompileBtn = document.getElementById('sideCompileBtn');
  const sideStatus = document.getElementById('sideStatus');
  const sideResult = document.getElementById('sideResult');

  sideCompileBtn.addEventListener('click', async () => {
    const mission = sideMission.value.trim();
    if (!mission) { sideStatus.textContent = 'Enter a mission first.'; sideStatus.style.color = '#c44'; return; }
    sideCompileBtn.disabled = true;
    sideStatus.textContent = 'Compiling...';
    sideStatus.style.color = '#aa7';
    const w = await chrome.storage.local.get(WALLET_KEY);
    const wv = w[WALLET_KEY] || {};
    chrome.runtime.sendMessage({
      action: 'compile',
      mission,
      walletAddress: wv.address || null,
      walletChain: wv.chain || null,
    });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'stateUpdate') {
      const s = msg.state;
      if (s.status === 'done') {
        sideStatus.textContent = s.message || 'Done.';
        sideStatus.style.color = '#4a9';
        sideCompileBtn.disabled = false;
        if (s.session?.monofile_preview) sideResult.textContent = s.session.monofile_preview.slice(0, 2000);
      } else if (s.status === 'error') {
        sideStatus.textContent = s.message || 'Error.';
        sideStatus.style.color = '#c44';
        sideCompileBtn.disabled = false;
      } else if (s.status === 'capturing' || s.status === 'compiling') {
        sideStatus.textContent = s.message || 'Working...';
        sideStatus.style.color = '#aa7';
      }
    }
    if (msg.action === 'agentStream') handleAgentStream(msg);
    if (msg.action === 'agentToolCall') addToolCallMessage(msg.tool, msg.args);
    if (msg.action === 'agentToolResult') addToolResultMessage(msg.tool, msg.result);
    if (msg.action === 'agentPlanUpdate') renderPlan(msg.plan);
    if (msg.action === 'agentStream' && msg.type === 'evalConfirmRequest') showEvalConfirmation(msg.code);
  });
}

async function loadChatHistory() {
  try {
    const { callRidaHistory } = await import('./src/tools/agent-loop.js');
    const messages = await callRidaHistory();
    if (messages && messages.length > 0) {
      const chatLog = document.getElementById('chatLog');
      chatLog.innerHTML = '';
      messages.reverse().forEach(m => {
        addMessage(m.role === 'assistant' ? 'assistant' : 'user', m.content);
      });
    }
  } catch (e) {
    // History load failed — silent, not critical
  }
}

function setupAgent() {
  const chatLog = document.getElementById('chatLog');
  const agentInput = document.getElementById('agentInput');
  const agentSendBtn = document.getElementById('agentSendBtn');
  const agentClearBtn = document.querySelector('#agentWorkspace .btn.secondary');
  window._currentAssistantEl = null;

  loadChatHistory();

  agentSendBtn.addEventListener('click', () => {
    const text = agentInput.value.trim();
    if (!text) return;
    addMessage('user', text);
    agentInput.value = '';
    window._currentAssistantEl = null;
    chrome.runtime.sendMessage({ action: 'agentRun', message: text });
  });

  const agentMicBtn = document.getElementById('agentMicBtn');
  if (agentMicBtn) {
    let recognizing = false;
    let recognition = null;
    agentMicBtn.addEventListener('click', () => {
      if (recognizing) {
        if (recognition) recognition.stop();
        return;
      }
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        addMessage('tool', 'Voice input not supported in this browser. Use Chromium-based browser.');
        return;
      }
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.onstart = () => {
        recognizing = true;
        agentMicBtn.style.background = '#4a9';
        agentMicBtn.style.color = '#fff';
        agentMicBtn.textContent = '⏹';
      };
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        agentInput.value = transcript;
        agentInput.focus();
      };
      recognition.onerror = (event) => {
        addMessage('tool', `Voice error: ${event.error}`);
      };
      recognition.onend = () => {
        recognizing = false;
        agentMicBtn.style.background = '#333';
        agentMicBtn.style.color = '#aaa';
        agentMicBtn.textContent = '🎤';
      };
      recognition.start();
    });
  }

  const agentStopBtn = document.getElementById('agentStopBtn');
  agentStopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'agentRunCancel' });
  });

  agentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); agentSendBtn.click(); }
  });

  if (agentClearBtn) agentClearBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clearConversation' });
    chatLog.innerHTML = '';
    document.getElementById('planContainer').innerHTML = '';
  });

  document.getElementById('agentPickBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'pickElement' }, (resp) => {
      if (resp?.success && resp?.info) {
        const info = resp.info;
        const text = `Selected: ${info.tagName}${info.id ? '#' + info.id : ''}${info.className ? '.' + info.className.split(' ')[0] : ''}\nSelector: ${info.selector}\nXPath: ${info.xpath}\nText: ${(info.textContent || '').slice(0, 100)}`;
        addMessage('tool', text);
        chatLog.scrollTop = chatLog.scrollHeight;
      } else {
        addMessage('tool', 'Element picker cancelled or no element selected.');
        chatLog.scrollTop = chatLog.scrollHeight;
      }
    });
  });

  let networkPollInterval = null;
  document.getElementById('agentNetworkBtn').addEventListener('click', () => {
    const logDiv = document.getElementById('networkLog');
    if (networkPollInterval) {
      clearInterval(networkPollInterval);
      networkPollInterval = null;
      chrome.runtime.sendMessage({ action: 'clearNetworkLog' });
      logDiv.style.display = 'none';
      document.getElementById('agentNetworkBtn').textContent = 'Watch Network';
      document.getElementById('agentNetworkBtn').style.borderColor = '#555';
    } else {
      chrome.runtime.sendMessage({ action: 'startNetworkWatch' });
      logDiv.style.display = 'block';
      document.getElementById('agentNetworkBtn').textContent = 'Stop Watching';
      document.getElementById('agentNetworkBtn').style.borderColor = '#4a9';
      networkPollInterval = setInterval(async () => {
        const log = await chrome.runtime.sendMessage({ action: 'getNetworkLog' });
        logDiv.innerHTML = (log || []).slice(-10).map(e =>
          `<div style="padding:2px 0;border-bottom:1px solid #111;"><span style="color:${e.status && e.status >= 400 ? '#c44' : '#4a9'}">${e.status || '...'}</span> ${e.method || ''} ${(e.url || '').slice(0, 80)}</div>`
        ).join('') || 'No requests captured.';
      }, 2000);
    }
  });
}

function addMessage(role, text) {
  const chatLog = document.getElementById('chatLog');
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function handleAgentStream(msg) {
  const chatLog = document.getElementById('chatLog');
  const sendBtn = document.getElementById('agentSendBtn');
  const stopBtn = document.getElementById('agentStopBtn');
  const input = document.getElementById('agentInput');

  if (msg.type === 'start') {
    sendBtn.style.display = 'none';
    stopBtn.style.display = '';
    input.disabled = true;
    window._currentAssistantEl = document.createElement('div');
    window._currentAssistantEl.className = 'msg assistant';
    chatLog.appendChild(window._currentAssistantEl);
  } else if (msg.type === 'delta' && window._currentAssistantEl) {
    window._currentAssistantEl.textContent += msg.text;
    chatLog.scrollTop = chatLog.scrollHeight;
  } else if (msg.type === 'stop' || msg.type === 'error' || msg.type === 'stopped') {
    sendBtn.style.display = '';
    stopBtn.style.display = 'none';
    input.disabled = false;
    if (msg.type === 'stopped') {
      const el = document.createElement('div');
      el.className = 'msg tool';
      el.textContent = '[Stopped by user.]';
      chatLog.appendChild(el);
    }
    if (msg.text && window._currentAssistantEl) window._currentAssistantEl.textContent = msg.text;
    window._currentAssistantEl = null;
    if (msg.type === 'error') {
      const el = document.createElement('div');
      el.className = 'msg error';
      el.textContent = msg.error || msg.text;
      chatLog.appendChild(el);
    }
    chatLog.scrollTop = chatLog.scrollHeight;
  }
}

function showEvalConfirmation(code) {
  const overlay = document.getElementById('evalConfirmOverlay');
  const codeEl = document.getElementById('evalConfirmCode');
  codeEl.textContent = code;
  overlay.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
  const approveBtn = document.getElementById('evalConfirmApproveBtn');
  const denyBtn = document.getElementById('evalConfirmDenyBtn');
  if (approveBtn) {
    approveBtn.addEventListener('click', () => {
      document.getElementById('evalConfirmOverlay').style.display = 'none';
      chrome.runtime.sendMessage({ action: 'confirmEvalResponse', approved: true });
    });
  }
  if (denyBtn) {
    denyBtn.addEventListener('click', () => {
      document.getElementById('evalConfirmOverlay').style.display = 'none';
      chrome.runtime.sendMessage({ action: 'confirmEvalResponse', approved: false });
    });
  }
});

function toolLabel(tool, args) {
  switch (tool) {
    case 'navigate': { try { return `navigate to ${new URL(args.url).hostname}`; } catch { return `navigate to ${(args.url||'').slice(0,30)}`; } }
    case 'click': return `click ${(args.selector||'').slice(0,30)}`;
    case 'type': return `type "${(args.text||'').slice(0,25)}"`;
    case 'screenshot': return 'capture screenshot';
    case 'getContent': return `read ${args.type||'text'} from page`;
    case 'evaluate': return `run script (${(args.script||'').slice(0,30)}...)`;
    case 'evaluatePage': return 'run script in page context';
    case 'getTabs': return 'list tabs';
    case 'closeTab': return 'close tab';
    case 'switchTab': return 'switch tab';
    case 'scroll': return `scroll ${args.direction||'down'}`;
    case 'pressKey': return `press ${args.key||'key'}`;
    case 'clickAt': return `click (${args.x},${args.y})`;
    case 'waitFor': return 'wait for element';
    case 'findHtml': return 'find in page';
    case 'set_plan': return 'create plan';
    case 'update_plan': return 'update plan';
    case 'skill': return `skills: ${args.action||'get'}`;
    default: return tool;
  }
}

function addToolCallMessage(tool, args) {
  const chatLog = document.getElementById('chatLog');
  const el = document.createElement('div');
  el.className = 'msg tool';
  el.textContent = `→ ${toolLabel(tool, args)}`;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function addToolResultMessage(tool, result) {
  const chatLog = document.getElementById('chatLog');
  const el = document.createElement('div');
  el.className = 'msg tool';
  const ok = result && result.ok;
  el.textContent = ok ? '  ok' : `  failed: ${(result?.error||'').slice(0, 40)}`;
  el.style.color = ok ? '#4a9' : '#c44';
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function renderPlan(plan) {
  const container = document.getElementById('planContainer');
  if (!plan || !plan.length) { container.innerHTML = ''; return; }
  container.innerHTML = '<div class="plan">' + plan.map((step, i) =>
    `<div class="plan-step ${step.status || 'pending'}">${step.status === 'done' ? 'x' : 'o'} ${step.title}</div>`
  ).join('') + '</div>';
}

function setupWallet() {
  const walletState = () => chrome.storage.local.get('getrida_wallet').then(d => d.getrida_wallet || { address: '', chain: '', sessionToken: '' });

  const statusEl = document.getElementById('walletConnectStatus');
  const addrInput = document.getElementById('walletAddressInput');
  const manualEntry = document.getElementById('walletManualEntry');
  const challengeDisplay = document.getElementById('walletChallengeDisplay');
  const sigEntry = document.getElementById('walletSignatureEntry');
  const sigInput = document.getElementById('walletSignatureInput');
  const verifyBtn = document.getElementById('walletVerifyBtn');
  const connectBtn = document.getElementById('walletConnectBtn');

  document.getElementById('walletConnectBtn').addEventListener('click', async () => {
    const manualAddr = addrInput.value.trim();
    let addr = null;
    let isSolana = false;
    let chain = 'base';

    if (manualAddr) {
      addr = manualAddr;
      isSolana = addr.length > 42 && !addr.startsWith('0x');
      chain = isSolana ? 'solana' : 'base';
    } else {
      statusEl.textContent = 'Detecting wallet provider...';
      statusEl.style.color = '#aa7';
      try {
        const detResp = await chrome.runtime.sendMessage({ action: 'detectWallet' });
        if (detResp.detected && detResp.providers.length) {
          const provider = detResp.providers[0];
          statusEl.textContent = `Connecting to ${provider.label}...`;
          const connResp = await chrome.runtime.sendMessage({ action: 'connectWalletProvider', kind: provider.kind });
          if (connResp.ok && connResp.address) {
            addr = connResp.address;
            chain = connResp.chain || (provider.kind === 'solana' ? 'solana' : 'base');
            isSolana = provider.kind === 'solana';
          }
        }
      } catch (e) { /* fall to manual */ }
    }

    if (!addr) {
      manualEntry.style.display = 'block';
      statusEl.textContent = 'No wallet detected. Enter your address above and click Connect again.';
      statusEl.style.color = '#aa7';
      return;
    }

    manualEntry.style.display = 'none';
    const chainId = isSolana ? 0 : 8453;
    statusEl.textContent = 'Requesting challenge...';
    try {
      const chRes = await fetch(`${BASE_URL}/api/auth/challenge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, chain, chainId }),
      });
      const chData = await chRes.json();
      if (!chData.challengeId) throw new Error(chData.error || 'Challenge failed');

      challengeDisplay.textContent = chData.challenge;
      challengeDisplay.style.display = 'block';
      sigEntry.style.display = 'block';
      verifyBtn.style.display = '';
      connectBtn.style.display = 'none';
      statusEl.textContent = 'Sign the message above, then paste your signature and click Verify.';

      window._walletChallengeData = { challengeId: chData.challengeId, address: addr, chain };
    } catch (e) {
      statusEl.textContent = `Error: ${e.message}`;
      statusEl.style.color = '#c44';
      connectBtn.style.display = '';
    }
  });

  document.getElementById('walletVerifyBtn').addEventListener('click', async () => {
    const ch = window._walletChallengeData;
    if (!ch) return;
    const signature = sigInput.value.trim();
    if (!signature) { statusEl.textContent = 'Paste your signature first.'; statusEl.style.color = '#c44'; return; }

    statusEl.textContent = 'Verifying...';
    statusEl.style.color = '#aa7';
    try {
      const vRes = await fetch(`${BASE_URL}/api/auth/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: ch.challengeId, signature, address: ch.address, chain: ch.chain }),
      });
      const vData = await vRes.json();
      if (!vData.ok) throw new Error(vData.error || 'Verification failed');

      const ws = { address: ch.address, chain: ch.chain, sessionToken: vData.sessionToken, expires: vData.expires };
      await chrome.storage.local.set({ getrida_wallet: ws });
      updateWalletUI(ws);
      updateSettingsWalletStatus();
      statusEl.textContent = 'Connected.';
      statusEl.style.color = '#4a9';
      await fetchWalletAuthority();

      challengeDisplay.style.display = 'none'; challengeDisplay.textContent = '';
      sigEntry.style.display = 'none'; sigInput.value = '';
      verifyBtn.style.display = 'none';
      connectBtn.style.display = '';
      manualEntry.style.display = 'none'; addrInput.value = '';
      window._walletChallengeData = null;
    } catch (e) {
      statusEl.textContent = `Error: ${e.message}`;
      statusEl.style.color = '#c44';
      connectBtn.style.display = '';
      verifyBtn.style.display = 'none';
    }
  });

  const ws = async () => chrome.storage.local.get('getrida_wallet').then(d => d.getrida_wallet || {});
  ws().then(w => updateWalletUI(w));
}

async function updateWalletUI(w) {
  const wv = w || (await chrome.storage.local.get('getrida_wallet')).getrida_wallet || {};
  const gate = document.getElementById('walletGate');
  const state = document.getElementById('walletState');

  if (wv.address) {
    gate.style.display = 'none';
    state.style.display = 'block';
    document.getElementById('walletAddress').textContent = wv.address;
    document.getElementById('walletChain').textContent = wv.chain;
    await fetchWalletAuthority();
  } else {
    gate.style.display = 'block';
    state.style.display = 'none';
  }
}

async function fetchWalletAuthority() {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/x402/status`);
    const data = await res.json();
    if (data.ok) {
      document.getElementById('walletAuthority').innerHTML = '<span class="badge green">Active</span>';
      document.getElementById('walletSpendCap').textContent = `$0.10/activation (${data.activation_cost_usdc} USDC)`;
      document.getElementById('walletConfidence').textContent = '—';
    }
  } catch (e) { /* offline */ }
}

async function updateSettingsWalletStatus() {
  const wv = await chrome.storage.local.get('getrida_wallet');
  const ws = wv.getrida_wallet || {};
  const status = document.getElementById('settingsWalletStatus');
  if (ws.address) {
    status.textContent = `Connected: ${ws.address.slice(0, 16)}... on ${ws.chain}`;
    status.style.color = '#4a9';
  } else {
    status.textContent = 'Not connected';
    status.style.color = '#555';
  }
}

async function renderWidgetState() {
  const wv = await chrome.storage.local.get('getrida_wallet');
  const addr = wv.getrida_wallet?.address || '';
  const slug = addr ? 'kb' : null;
  const el = document.getElementById('walletWorldState');
  if (!slug) { el.innerHTML = '<div style="color:#444;font-size:11px;padding:8px 0;">Connect your wallet to view workspace state.</div>'; return; }
  try {
    const res = await fetch(`${BASE_URL}/api/v1/world?slug=${slug}`);
    const data = await res.json();
    if (data.ok) {
      const ws = data.workspace || {};
      const items = data.items || [];
      const quests = data.quests || [];
      let html = `<div class="card"><div class="card-title">Workspace</div><div class="card-meta">Tier: ${ws.tier || 'founding'} · ${ws.population || 1} members</div></div>`;
      if (items.length) html += `<div style="margin-top:8px;"><label>Items (${items.length})</label>` + items.slice(0, 4).map(i => `<div class="world-item"><span class="world-item-type">${i.item_type}</span><span class="world-item-label">${i.item_label || i.id}</span></div>`).join('') + '</div>';
      if (quests.length) html += `<div style="margin-top:8px;"><label>Quests (${quests.length})</label>` + quests.slice(0, 3).map(q => `<div class="quest"><div class="quest-name">${q.quest_name}</div><div class="quest-progress"><div class="quest-bar"><div class="quest-bar-fill" style="width:${(q.steps_completed/q.quest_steps*100)||0}%"></div></div><span class="quest-status">${q.quest_status}</span></div></div>`).join('') + '</div>';
      el.innerHTML = html;
    }
  } catch (e) { /* offline */ }
}

async function loadWalletView() {
  const wv = await chrome.storage.local.get('getrida_wallet');
  await updateWalletUI(wv.getrida_wallet || {});
  renderReceipts();
}

async function renderReceipts() {
  const data = await chrome.storage.local.get('getrida_agent_receipts');
  const receipts = data.getrida_agent_receipts || [];
  const log = document.getElementById('receiptLog');
  const toggle = document.getElementById('receiptToggle');

  toggle.textContent = `Agent Receipts (${receipts.length})`;

  if (receipts.length === 0) {
    log.innerHTML = '<div style="color:#444;padding:4px 0;">No receipts yet. Agent actions will appear here.</div>';
  } else {
    const recent = receipts.slice(-20).reverse();
    log.innerHTML = recent.map(r => {
      const ts = r.timestamp ? new Date(r.timestamp).toLocaleTimeString('en-US', { hour12: false }) : '—';
      const shortAction = (r.action || '—').replace('envoy_', '').replace('getrida', '');
      const shortTarget = (r.target || '').slice(0, 30);
      return `<div style="padding:3px 0;border-bottom:1px solid #111;display:flex;gap:6px;font-size:10px;">`
        + `<span style="color:#444;width:50px;flex-shrink:0;">${ts}</span>`
        + `<span style="color:#667;width:70px;flex-shrink:0;">${shortAction}</span>`
        + `<span style="color:#555;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${shortTarget}</span>`
        + `</div>`;
    }).join('');
  }

  if (!document.getElementById('receiptToggle')._wired) {
    document.getElementById('receiptToggle')._wired = true;
    toggle.addEventListener('click', () => {
      log.style.display = log.style.display === 'none' ? 'block' : 'none';
    });
  }
}

async function renderAgentContext() {
  const ctx = document.getElementById('agentContext');
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url || '';
    const skills = await chrome.runtime.sendMessage({ action: 'getCapabilities' }) || {};
    const allSkills = skills.skills || [];

    const matching = allSkills.filter(s => {
      if (!s.domainPatterns || !url) return false;
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        return s.domainPatterns.some(p => {
          const pat = p.replace(/^www\./, '').replace(/\*\*/g, '.*').replace(/\*/g, '.*');
          try { return new RegExp(pat).test(host) || new RegExp(pat).test(url); } catch { return false; }
        });
      } catch { return false; }
    });

    let html = '<div class="context-row">';
    if (matching.length) {
      html += `<span class="context-label">Active site:</span>`;
      for (const s of matching) {
        html += `<span class="context-chip" onclick="document.getElementById('agentInput').value='Use skill: ${s.name}';document.getElementById('agentInput').focus();">${s.name}</span>`;
      }
    } else if (url) {
      html += `<span class="context-hint">No domain skills detected. Try: "navigate to github", "list my tabs", "search for X"</span>`;
    } else {
      html += `<span class="context-hint">Open a tab to see available skills. Try: "compile my tabs", "navigate to getrida.work"</span>`;
    }
    html += '</div>';
    ctx.innerHTML = html;
    ctx.style.display = '';
  } catch (e) {
    ctx.style.display = 'none';
  }
}
/* ---------------- profile ---------------- */
async function renderProfile() {
  const gate = document.getElementById('profileGate');
  const body = document.getElementById('profileBody');
  const st = await chrome.storage.local.get(['getrida_grk_key', 'getrida_endpoint']);
  const key = st['getrida_grk_key'];
  if (!key) { gate.style.display = 'block'; body.style.display = 'none'; return; }
  gate.style.display = 'none'; body.style.display = 'block';

  const agentBase = (st['getrida_endpoint'] || '').replace(/\/api\/v1\/compile$/, '') || 'https://app.getrida.work';
  const H = { 'Authorization': 'Bearer ' + key };
  let world = null, x402 = null, hist = 0;
  try { const r = await fetch(BASE_URL + '/api/v1/world', { headers: H }); if (r.ok) world = await r.json(); } catch (e) {}
  try { const r = await fetch(BASE_URL + '/api/v1/x402/status', { headers: H }); if (r.ok) x402 = await r.json(); } catch (e) {}
  try { const r = await fetch(agentHost(agentEndpointBase(st)) + '/api/agent/chat/history', { headers: H }); if (r.ok) { const d = await r.json(); hist = (d.messages || []).length; } } catch (e) {}

  const ws = (world && world.workspace) || {};
  const name = ws.name || 'workspace';
  document.getElementById('pfAvatar').textContent = name.slice(0, 2).toUpperCase();
  document.getElementById('pfName').textContent = name;
  document.getElementById('pfHandle').textContent = '@' + name;
  const tierEl = document.getElementById('pfTier');
  if (ws.tier) { tierEl.style.display = 'inline-flex'; document.getElementById('pfTierText').textContent = ws.tier.toUpperCase(); }

  const te = (x402 && x402.treasury_events) || [];
  const usdc = te.reduce((a, e) => a + parseFloat(e.amount_usdc || 0), 0);
  const stats = [
    { n: hist, l: 'agent messages' },
    { n: (ws.population || 1), l: 'population' },
    { n: te.length, l: 'treasury events' },
    { n: '$' + usdc.toFixed(2), l: 'on rail' }
  ];
  document.getElementById('pfStats').innerHTML = stats.map(s =>
    `<div class="pf-stat"><div class="n">${s.n}</div><div class="l">${s.l}</div></div>`).join('');

  const feed = document.getElementById('pfFeed');
  if (!te.length) {
    feed.innerHTML = '<div class="pf-empty">No receipts yet — the first one lands when the workspace activates.</div>';
    return;
  }
  feed.innerHTML = te.map(e => {
    const when = e.recorded_at || e.created_at || (e.event_id || '').slice(-20);
    const hash = e.transaction_hash ? e.transaction_hash.slice(0, 10) + '…' : '';
    return `<div class="pf-receipt">
      <div class="pf-receipt-top"><span class="pf-receipt-type">${(e.event_type || 'event').replace(/_/g, ' ')}</span><span class="pf-receipt-amt">$${e.amount_usdc || '0.00'} ${e.rail || ''}</span></div>
      <div class="pf-receipt-meta"><span>${(e.product_id || '').toUpperCase()}</span><span class="pf-receipt-hash" title="${e.transaction_hash || ''}">${hash}</span></div>
    </div>`;
  }).join('');
}
function agentEndpointBase(st) { return st['getrida_endpoint'] || ''; }
function agentHost(base) {
  try { return new URL(base).origin; } catch (e) { return 'https://app.getrida.work'; }
}
document.getElementById('pfAgentBtn')?.addEventListener('click', () => {
  document.querySelector('.nav-item[data-view="agent"]')?.click();
});
document.getElementById('pfCompileBtn')?.addEventListener('click', () => {
  document.querySelector('.nav-item[data-view="compile"]')?.click();
});

// ============================================================================
// v0.5.0 — Calendar tab, Bookings tab, Meetings live card, Client0 context rail
// ============================================================================

const WORKER_BASE = "https://hooks.getrida.work";
const MEETING_STATE_KEY = "getrida_meeting_state";
const CLIENT0_KEY = "getrida_client0_context";
const CLIENT0_LOADED_KEY = "getrida_client0_loaded_at";
const GRK_KEY_NAME = "getrida_grk_key";

async function loadGrkKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get([GRK_KEY_NAME, 'getrida_wallet', 'getrida_provider_config'], (s) => {
      if (s[GRK_KEY_NAME]) return resolve(s[GRK_KEY_NAME]);
      const pc = s['getrida_provider_config'];
      if (pc?.apiKey && pc.apiKey.startsWith('grk_')) return resolve(pc.apiKey);
      const w = s['getrida_wallet'];
      if (w?.sessionToken && w.sessionToken.startsWith('grk_')) return resolve(w.sessionToken);
      resolve(null);
    });
  });
}

async function workerFetch(path, opts = {}) {
  const grk = await loadGrkKey();
  if (!grk) throw new Error("no_grk_key");
  const headers = { "X-Api-Key": grk, "X-Worker-Client": "extension-v0.5.0", ...opts.headers };
  const res = await fetch(WORKER_BASE + path, {
    ...opts,
    headers: { ...headers, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 429) throw new Error("rate_limited");
  if (res.status === 401 || res.status === 403) throw new Error("auth_required");
  if (!res.ok) throw new Error("worker_" + res.status);
  return await res.json();
}

// ===== S1 — Meetings live card =====

function setupMeetingsLiveCard() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[MEETING_STATE_KEY]) {
      renderMeetingsLiveCard(changes[MEETING_STATE_KEY].newValue);
    }
  });
  chrome.storage.local.get([MEETING_STATE_KEY], (s) => {
    renderMeetingsLiveCard(s[MEETING_STATE_KEY] || null);
  });
  setInterval(() => {
    chrome.storage.local.get([MEETING_STATE_KEY], (s) => {
      renderMeetingsLiveCard(s[MEETING_STATE_KEY] || null);
    });
  }, 30000);
}

function renderMeetingsLiveCard(state) {
  const card = document.getElementById('meetingsLiveCard');
  const dot = document.getElementById('mlcDot');
  const label = document.getElementById('mlcLabel');
  const body = document.getElementById('mlcBody');
  if (!card || !dot || !label || !body) return;
  const active = state?.active;
  if (!active) {
    card.style.display = (state?.history || []).length ? 'block' : 'none';
    if ((state?.history || []).length) {
      dot.className = 'mlc-dot';
      label.textContent = 'No active meeting';
      body.innerHTML = `<div>Last: ${escapeHtml((state.history[0].title || state.history[0].platform || 'meeting').slice(0,40))} — <span style="color:#555">${escapeHtml(state.history[0].when || '')}</span></div>`;
    }
    return;
  }
  card.style.display = 'block';
  dot.className = 'mlc-dot active';
  label.textContent = 'Vexa bot dispatched';
  const link = active.meeting_url ? `<a href="${escapeHtml(active.meeting_url)}" target="_blank" rel="noopener">Join meeting →</a>` : '';
  body.innerHTML = `<div>${escapeHtml(active.platform || '')} · bot ${escapeHtml(String(active.vexa_bot_id || '?').slice(0,12))}</div>${link}`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ===== S2 — Calendar tab =====

let calState = { meetings: [], lastFetch: 0 };

function setupCalendar() {
  document.getElementById('calRefreshBtn')?.addEventListener('click', () => loadCalendar(true));
  document.getElementById('calWorkspaceSelect')?.addEventListener('change', () => loadCalendar(true));
  chrome.storage.local.get(['getrida_active_workspace'], (s) => {
    const sel = document.getElementById('calWorkspaceSelect');
    if (sel && !sel.options.length) {
      ['kb','byron','faraji'].forEach(w => {
        const opt = document.createElement('option');
        opt.value = w;
        opt.textContent = w;
        if (w === (s['getrida_active_workspace'] || 'kb')) opt.selected = true;
        sel.appendChild(opt);
      });
    }
  });
  setInterval(() => {
    if (document.getElementById('view-calendar')?.classList.contains('active')) loadCalendar(false);
  }, 300000);
}

async function loadCalendar(force) {
  const status = document.getElementById('calStatus');
  const ws = document.getElementById('calWorkspaceSelect')?.value || 'kb';
  if (!force && Date.now() - calState.lastFetch < 60000) { renderCalendar(); return; }
  status.textContent = 'Loading meetings…';
  try {
    const data = await workerFetch(`/api/companyos/meetings?client_slug=${encodeURIComponent(ws)}&status=scheduled`);
    calState.meetings = (data.meetings || []).sort((a,b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || ''));
    calState.lastFetch = Date.now();
    status.textContent = `Loaded ${calState.meetings.length} meetings.`;
    renderCalendar();
    if (data.error) status.textContent = 'Worker error: ' + data.error;
  } catch (e) {
    status.textContent = e.message === 'no_grk_key'
      ? 'Connect your API key in Settings → Wallet.'
      : (e.message === 'auth_required' ? 'API key rejected. Reconnect.' : 'Error: ' + e.message);
  }
}

function renderCalendar() {
  const today = document.getElementById('calToday');
  const week = document.getElementById('calWeek');
  const upcoming = document.getElementById('calUpcoming');
  const empty = document.getElementById('calEmpty');
  today.innerHTML = week.innerHTML = upcoming.innerHTML = '';
  if (!calState.meetings.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const endOfDay = new Date(); endOfDay.setHours(23,59,59,999);
  const endOfWeek = new Date(); endOfWeek.setDate(endOfWeek.getDate() + 7 - endOfWeek.getDay());
  const todayMs = [], weekMs = [], upcomingMs = [];
  for (const m of calState.meetings) {
    const t = new Date(m.scheduled_at || m.scheduledAt || 0).getTime();
    if (!t) continue;
    if (t >= startOfDay.getTime() && t <= endOfDay.getTime()) todayMs.push({ m, t });
    else if (t > endOfDay.getTime() && t <= endOfWeek.getTime()) weekMs.push({ m, t });
    else if (t > Date.now()) upcomingMs.push({ m, t });
  }
  renderCalList(today, todayMs.slice(0, 5));
  renderCalList(week, weekMs.slice(0, 10));
  renderCalList(upcoming, upcomingMs.slice(0, 50));
  if (!todayMs.length && !weekMs.length && !upcomingMs.length) empty.style.display = 'block';
}

function renderCalList(el, items) {
  if (!items.length) { el.innerHTML = '<div style="font-size:11px;color:#444;padding:4px;">—</div>'; return; }
  el.innerHTML = items.map(({ m, t }) => {
    const time = new Date(t).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const badge = m.transcript_summary ? '<span class="cal-row-badge transcript">transcript</span>' : '<span class="cal-row-badge scheduled">scheduled</span>';
    const email = m.prospect_email || (m.attendee_emails ? m.attendee_emails.split(',')[0] : '');
    return `<div class="cal-row" data-meeting-id="${escapeHtml(m.id || '')}"><div class="cal-row-time">${escapeHtml(time)}${badge}</div><div class="cal-row-title">${escapeHtml(m.prospect_name || m.meeting_title || 'Meeting')}</div><div class="cal-row-attendees">${escapeHtml(email)}</div></div>`;
  }).join('');
  el.querySelectorAll('.cal-row').forEach(row => {
    row.addEventListener('click', () => openMeetingBriefing(row.dataset.meetingId));
  });
}

async function openMeetingBriefing(id) {
  if (!id) return;
  try {
    const data = await workerFetch(`/api/meetings/${encodeURIComponent(id)}/briefing`).catch(() => null);
    const modal = document.createElement('div');
    modal.className = 'cal-modal';
    modal.innerHTML = `<div class="cal-modal-content"><div class="cal-modal-title">Meeting brief</div><pre style="font-size:11px;color:#aaa;white-space:pre-wrap;max-height:60vh;overflow-y:auto;">${escapeHtml(JSON.stringify(data, null, 2))}</pre><div style="text-align:right;margin-top:12px;"><button class="btn secondary" id="calModalClose">Close</button></div></div>`;
    document.body.appendChild(modal);
    document.getElementById('calModalClose').addEventListener('click', () => modal.remove());
  } catch (e) {
    console.error('briefing error', e);
  }
}

// ===== S3 — Bookings tab =====

let bkState = { meetings: [], lastFetch: 0 };

function setupBookings() {
  document.getElementById('bkNewBtn')?.addEventListener('click', () => {
    const f = document.getElementById('bkForm');
    if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('bkRefreshBtn')?.addEventListener('click', () => loadBookings(true));
  document.getElementById('bkCancelBtn')?.addEventListener('click', () => {
    const f = document.getElementById('bkForm');
    if (f) f.style.display = 'none';
  });
  document.getElementById('bkSubmitBtn')?.addEventListener('click', submitNewBooking);
  setInterval(() => {
    if (document.getElementById('view-bookings')?.classList.contains('active')) loadBookings(false);
  }, 300000);
}

async function loadBookings(force) {
  const status = document.getElementById('bkStatus');
  const ws = document.getElementById('calWorkspaceSelect')?.value || 'kb';
  if (!force && Date.now() - bkState.lastFetch < 60000) { renderBookings(); return; }
  status.textContent = 'Loading bookings…';
  try {
    const data = await workerFetch(`/api/companyos/meetings?client_slug=${encodeURIComponent(ws)}`);
    bkState.meetings = data.meetings || [];
    bkState.lastFetch = Date.now();
    status.textContent = `Loaded ${bkState.meetings.length} bookings.`;
    renderBookings();
  } catch (e) {
    status.textContent = e.message === 'no_grk_key'
      ? 'Connect your API key in Settings → Wallet.'
      : (e.message === 'auth_required' ? 'API key rejected.' : 'Error: ' + e.message);
  }
}

function renderBookings() {
  const up = document.getElementById('bkUpcoming');
  const done = document.getElementById('bkCompleted');
  const empty = document.getElementById('bkEmpty');
  up.innerHTML = done.innerHTML = '';
  if (!bkState.meetings.length) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  let upcoming = [], completed = [];
  const now = Date.now();
  for (const m of bkState.meetings) {
    const t = new Date(m.scheduled_at || 0).getTime();
    if (m.status === 'completed' || m.followup_sent || t < now) completed.push(m);
    else upcoming.push(m);
  }
  renderBkList(up, upcoming, true);
  renderBkList(done, completed, false);
  if (!upcoming.length && !completed.length) empty.style.display = 'block';
}

function renderBkList(el, items, isUpcoming) {
  if (!items.length) { el.innerHTML = '<div style="font-size:11px;color:#444;padding:4px;">—</div>'; return; }
  el.innerHTML = items.slice(0, 30).map(m => {
    const t = new Date(m.scheduled_at || 0);
    const time = isUpcoming
      ? t.toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })
      : t.toLocaleString('en-US', { month:'short', day:'numeric' });
    const badgeCls = isUpcoming ? 'scheduled' : 'completed';
    const actions = isUpcoming ? '' :
      `<div class="bk-row-actions">
         <button class="btn secondary" data-action="transcript" data-id="${escapeHtml(m.id || '')}">Transcript</button>
         <button class="btn" data-action="followup" data-id="${escapeHtml(m.id || '')}">Send follow-up</button>
       </div>`;
    const transcriptBadge = m.transcript_summary ? '<span class="cal-row-badge transcript">transcript</span>' : '';
    return `<div class="bk-row"><div class="bk-row-time">${escapeHtml(time)}<span class="bk-row-badge ${badgeCls}">${escapeHtml(m.status || (isUpcoming ? 'scheduled' : 'completed'))}</span>${transcriptBadge}</div><div class="bk-row-name">${escapeHtml(m.prospect_name || m.meeting_title || 'Meeting')}</div><div class="bk-row-email">${escapeHtml(m.prospect_email || m.zoom_join_url || '')}</div>${actions}</div>`;
  }).join('');
  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleBkAction(btn.dataset.action, btn.dataset.id));
  });
}

async function handleBkAction(action, id) {
  try {
    if (action === 'transcript') {
      const data = await workerFetch(`/api/companyos/meetings/${encodeURIComponent(id)}/transcript`);
      const modal = document.createElement('div');
      modal.className = 'cal-modal';
      modal.innerHTML = `<div class="cal-modal-content"><div class="cal-modal-title">Transcript</div><pre style="font-size:11px;color:#aaa;white-space:pre-wrap;max-height:60vh;overflow-y:auto;">${escapeHtml(JSON.stringify(data, null, 2))}</pre><div style="text-align:right;margin-top:12px;"><button class="btn secondary" id="calModalClose">Close</button></div></div>`;
      document.body.appendChild(modal);
      document.getElementById('calModalClose').addEventListener('click', () => modal.remove());
    } else if (action === 'followup') {
      const summary = prompt('Summary text for follow-up email:') || 'Thanks for the meeting. We will follow up shortly.';
      const data = await workerFetch(`/api/companyos/meetings/${encodeURIComponent(id)}/followup`, {
        method: 'POST',
        body: { summary, action_items: [], next_steps: 'I will follow up shortly with next steps.' },
      });
      const toast = document.createElement('div');
      toast.className = 'bk-toast show';
      toast.textContent = data.ok ? `Follow-up sent.` : `Error: ${data.error || 'unknown'}`;
      document.getElementById('bkContent')?.prepend(toast);
      setTimeout(() => toast.remove(), 4000);
    }
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function submitNewBooking() {
  const status = document.getElementById('bkStatus');
  const prospectName = document.getElementById('bkProspectName').value.trim();
  const prospectEmail = document.getElementById('bkProspectEmail').value.trim();
  const scheduledAt = document.getElementById('bkScheduledAt').value.trim();
  const durationMin = parseInt(document.getElementById('bkDuration').value) || 30;
  const offerKey = document.getElementById('bkOfferKey').value.trim() || 'default';
  if (!prospectEmail || !scheduledAt) { status.textContent = 'Email + scheduled_at required.'; return; }
  status.textContent = 'Creating booking…';
  try {
    const data = await workerFetch(`/api/companyos/booking/create`, {
      method: 'POST',
      body: { offer_id: offerKey, prospect_name: prospectName, prospect_email: prospectEmail, scheduled_at: scheduledAt, duration_min: durationMin },
    });
    if (data.ok) {
      status.textContent = `Booked — meeting ${data.zoom_meeting_id || data.booking_id || ''}.`;
      document.getElementById('bkForm').style.display = 'none';
      loadBookings(true);
    } else {
      status.textContent = 'Worker error: ' + (data.error || 'unknown');
    }
  } catch (e) {
    status.textContent = e.message === 'auth_required' ? 'API key rejected.' : 'Error: ' + e.message;
  }
}

// ===== S4 — Client0 context rail =====

let client0RefreshTimer = null;

async function loadClient0Context() {
  const grk = await loadGrkKey();
  if (!grk) return;
  const ws = document.getElementById('calWorkspaceSelect')?.value || 'kb';
  try {
    const data = await workerFetch(`/api/me/client0?workspace=${encodeURIComponent(ws)}`);
    chrome.storage.local.set({
      [CLIENT0_KEY]: {
        workspace: data.workspace,
        monofile_summary: data.monofile_summary,
        sequence_log_tail: data.sequence_log_tail,
        active_offers: data.active_offers,
      },
      [CLIENT0_LOADED_KEY]: Date.now(),
    });
    if (client0RefreshTimer) clearInterval(client0RefreshTimer);
    client0RefreshTimer = setInterval(loadClient0Context, 5 * 60 * 1000);
  } catch (e) {
    console.log('client0 load failed', e.message);
  }
}

// ===== Bootstrap calendar/bookings on tab click =====

document.addEventListener('click', (e) => {
  const navItem = e.target.closest('.nav-item');
  if (!navItem) return;
  const view = navItem.dataset.view;
  if (view === 'calendar') setTimeout(() => loadCalendar(true), 100);
  if (view === 'bookings') setTimeout(() => loadBookings(true), 100);
});

// ===== Feature 5 (Build Spec): Integrations tab =====
//
// Per-tenant integration connection state, sourced from the same
// /integrations endpoint the portal reads. Configured in the portal
// (where the OAuth redirect lands); rendered read-only here so the
// extension and portal stay in sync without two separate auth flows.
//
// The agent's awareness of these integrations (via
// getrida_integrations_context injected into system prompt) is a
// separate, follow-up feature — not built here. This commit ships
// the human-visible half (UI tab + nav badge) only.

let integrationsViewCache = null;
let integrationsViewLoadedAt = 0;

async function loadIntegrationsView(force = false) {
  const loadingEl = document.getElementById('integrationsLoading');
  const listEl = document.getElementById('integrationsList');
  const emptyEl = document.getElementById('integrationsEmpty');
  const badgeEl = document.getElementById('integrationsNavBadge');

  // 30s in-memory cache — clicking away and back shouldn't re-fetch.
  if (!force && integrationsViewCache && (Date.now() - integrationsViewLoadedAt) < 30_000) {
    renderIntegrationsView(integrationsViewCache);
    return;
  }

  if (loadingEl) loadingEl.style.display = '';
  if (listEl) listEl.style.display = 'none';
  if (emptyEl) emptyEl.style.display = 'none';

  try {
    const data = await chrome.storage.local.get(['getrida_endpoint', 'getrida_grk_key']);
    const endpoint = (data.getrida_endpoint || 'https://app.getrida.work').replace(/\/+$/, '');
    const grk = data.getrida_grk_key || '';
    if (!grk) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) {
        emptyEl.style.display = '';
        emptyEl.innerHTML = 'Sign in first to see your tenant\'s integrations.';
      }
      if (badgeEl) badgeEl.style.display = 'none';
      return;
    }
    const res = await fetch(`${endpoint}/api/envoy/integrations`, {
      method: 'GET',
      headers: { 'authorization': `Bearer ${grk}` },
    });
    if (!res.ok) {
      throw new Error(`integrations list failed: HTTP ${res.status}`);
    }
    const body = await res.json();
    const integrations = body?.result?.integrations || [];
    integrationsViewCache = integrations;
    integrationsViewLoadedAt = Date.now();
    renderIntegrationsView(integrations);
  } catch (e) {
    if (loadingEl) {
      loadingEl.style.display = 'none';
      loadingEl.textContent = `Failed to load integrations: ${e.message}`;
    }
  }
}

function renderIntegrationsView(integrations) {
  const loadingEl = document.getElementById('integrationsLoading');
  const listEl = document.getElementById('integrationsList');
  const emptyEl = document.getElementById('integrationsEmpty');
  const badgeEl = document.getElementById('integrationsNavBadge');

  if (loadingEl) loadingEl.style.display = 'none';

  if (!integrations || integrations.length === 0) {
    if (listEl) listEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = '';
    if (badgeEl) badgeEl.style.display = 'none';
    return;
  }

  // Aggregate status counts for the nav badge.
  const connected = integrations.filter(i => i.status === 'connected').length;
  const errored = integrations.filter(i => i.status === 'error').length;
  if (badgeEl) {
    if (connected + errored > 0) {
      badgeEl.textContent = `${connected}` + (errored > 0 ? `/${errored}!` : '');
      badgeEl.style.display = '';
      badgeEl.title = `${connected} connected` + (errored > 0 ? `, ${errored} error` : '');
    } else {
      badgeEl.style.display = 'none';
    }
  }

  // Render rows. Read-only here — the user configures in the portal.
  const rows = integrations.map(i => {
    const status = i.status || 'not_configured';
    const dot = status === 'connected' ? '#4a9'
              : status === 'error' ? '#f44'
              : status === 'disconnected' ? '#888'
              : '#555';
    const displayStatus = status === 'not_configured' ? 'not configured' : status;
    const verify = i.last_verified_at ? ` · last verified ${i.last_verified_at.slice(0,10)}` : '';
    const error = i.last_error ? ` · ${i.last_error}` : '';
    return `
      <div style="display:flex;align-items:center;padding:10px 0;border-bottom:1px solid #1a1f26;">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dot};margin-right:10px;flex-shrink:0;"></span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:#ddd;">${i.display_name || i.integration_key}</div>
          <div style="font-size:11px;color:#888;margin-top:2px;">
            ${displayStatus}${verify}${error}
          </div>
        </div>
      </div>
    `;
  }).join('');
  if (listEl) {
    listEl.style.display = '';
    listEl.innerHTML = `
      <div style="padding:0 4px 12px 4px;font-size:11px;color:#888;">
        Configure integrations in the <a href="#" id="integrationsOpenPortalLink" style="color:#4a9;text-decoration:underline;">portal</a>. Connection state shown here mirrors the same grk_-authed source of truth.
      </div>
      ${rows}
    `;
    // Wire the portal link to the portal's integrations view (best-effort,
    // based on the existing PORTAL_URL convention if set; otherwise opens the apex).
    const portalLink = document.getElementById('integrationsOpenPortalLink');
    if (portalLink) {
      portalLink.addEventListener('click', (ev) => {
        ev.preventDefault();
        const portalBase = 'https://envoy.getrida.work';
        chrome.tabs.create({ url: `${portalBase}/integrations` }).catch(() => {});
      });
    }
  }
  if (emptyEl) emptyEl.style.display = 'none';
}


// ===== GetRida key: connect / change =====
// The key authenticates every GetRida call (agent, memory, integrations, calendar).
// It is verified against the account before it is saved, and never leaves this browser
// except as the Authorization header to GetRida.
const GRK_FORMAT = /^grk_[a-f0-9]{16,64}$/;

async function grkAgentBase() {
  const st = await chrome.storage.local.get(['getrida_endpoint']);
  const raw = (st['getrida_endpoint'] || '').replace(/\/api\/v1\/compile$/, '').replace(/\/+$/, '');
  return raw && !/^https:\/\/getrida\.work$/.test(raw) ? raw : 'https://app.getrida.work';
}

async function verifyAndSaveGrk(raw, statusEl) {
  const key = String(raw || '').trim();
  if (!GRK_FORMAT.test(key)) {
    statusEl.style.color = '#e88'; statusEl.textContent = 'That does not look like a GetRida key (it starts with grk_).';
    return false;
  }
  statusEl.style.color = '#9aa'; statusEl.textContent = 'Checking…';
  try {
    const res = await fetch(`${await grkAgentBase()}/api/agent/status`, { headers: { authorization: `Bearer ${key}` } });
    if (res.status === 401 || res.status === 403) {
      statusEl.style.color = '#e88'; statusEl.textContent = 'This key was not accepted. Check it, or get a new one at getrida.work/start.';
      return false;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json().catch(() => ({}));
    await chrome.storage.local.set({ [GRK_KEY_NAME]: key });
    statusEl.style.color = '#4a9'; statusEl.textContent = `Connected${body.tenant_id ? ' — ' + body.tenant_id.replace(/^(edge|stripe)_/, '') : ''}.`;
    return true;
  } catch (e) {
    statusEl.style.color = '#e88'; statusEl.textContent = `Could not reach GetRida (${e.message}). Try again in a moment.`;
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const card = document.getElementById('grkConnectCard');
  const input = document.getElementById('grkKeyInput');
  const save = document.getElementById('grkKeySave');
  const status = document.getElementById('grkKeyStatus');
  const sInput = document.getElementById('settingsGrkKey');
  const sSave = document.getElementById('settingsGrkSave');
  const sStatus = document.getElementById('settingsGrkStatus');

  const existing = await loadGrkKey();
  if (card) card.style.display = existing ? 'none' : 'block';
  if (existing) {
    // Until onboarding is complete the agent is generic — point the user at it.
    fetch(`${await grkAgentBase()}/api/agent/status`, { headers: { authorization: `Bearer ${existing}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        const banner = document.getElementById('onboardingBanner');
        if (banner && b && b.onboarding_status !== 'complete') banner.style.display = 'block';
      })
      .catch(() => {});
  }
  if (sStatus) sStatus.textContent = existing ? `Connected (…${existing.slice(-4)})` : 'Not connected';

  save?.addEventListener('click', async () => {
    save.disabled = true;
    if (await verifyAndSaveGrk(input.value, status)) {
      input.value = '';
      setTimeout(() => location.reload(), 800);
    }
    save.disabled = false;
  });
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') save.click(); });
  sSave?.addEventListener('click', async () => {
    sSave.disabled = true;
    if (await verifyAndSaveGrk(sInput.value, sStatus)) { sInput.value = ''; setTimeout(() => location.reload(), 800); }
    sSave.disabled = false;
  });
});

// ── Approvals: the employee's drafts wait here too (same gate as the workspace) ──
async function loadApprovals() {
  const card = document.getElementById('approvalsCard');
  const list = document.getElementById('approvalsList');
  const title = document.getElementById('approvalsTitle');
  const status = document.getElementById('approvalsStatus');
  if (!card || !list) return;
  const key = await loadGrkKey();
  if (!key) { card.style.display = 'none'; return; }
  const base = await grkAgentBase();
  const auth = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  let drafts = [];
  try {
    const r = await fetch(`${base}/api/envoy/gate/pending`, { headers: auth });
    if (!r.ok) { card.style.display = 'none'; return; }
    drafts = ((await r.json()).decisions || []).filter((d) => d.context);
  } catch (e) { card.style.display = 'none'; return; }
  card.style.display = drafts.length ? 'block' : 'none';
  title.textContent = drafts.length === 1 ? '1 message waiting for your approval' : `${drafts.length} messages waiting for your approval`;
  list.replaceChildren();
  for (const d of drafts.slice(0, 5)) {
    const c = d.context;
    const row = document.createElement('div');
    row.style.cssText = 'border-top:1px solid #1e2a36;padding:8px 0;';
    const head = document.createElement('div');
    head.style.cssText = 'font-weight:600;';
    head.textContent = c.subject || '(no subject)';
    const meta = document.createElement('div');
    meta.style.cssText = 'color:#9aa;font-size:11px;';
    meta.textContent = `To ${c.contact_name ? c.contact_name + ' · ' : ''}${c.to_addr} · from ${c.from_addr}`;
    const body = document.createElement('div');
    body.style.cssText = 'color:#cdd;margin:4px 0;white-space:pre-wrap;max-height:90px;overflow:hidden;';
    body.textContent = (c.body || '').slice(0, 400);
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:6px;margin-top:4px;';
    const ok = document.createElement('button'); ok.className = 'btn'; ok.textContent = 'Approve and send';
    const no = document.createElement('button'); no.className = 'btn'; no.textContent = "Don't send";
    no.style.opacity = '0.75';
    const act = async (fn, done) => {
      ok.disabled = no.disabled = true; status.textContent = 'Working…';
      try {
        const res = await fn();
        if (res.status === 402) { status.textContent = "You're out of credits. Top up in Wallet, then approve again."; ok.disabled = no.disabled = false; return; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        status.textContent = done;
        loadApprovals();
      } catch (e) { status.textContent = `Couldn't do that (${e.message}).`; ok.disabled = no.disabled = false; }
    };
    ok.addEventListener('click', () => act(() => fetch(`${base}/api/envoy/gate/${d.id}/approve`, { method: 'POST', headers: auth, body: '{}' }), `Sent to ${c.to_addr}.`));
    no.addEventListener('click', () => act(() => fetch(`${base}/api/envoy/gate/${d.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ state: 'REVOKED_NO', reason: 'Client chose not to send' }) }), 'Not sent.'));
    actions.append(ok, no);
    row.append(head, meta, body, actions);
    list.append(row);
  }
  if (drafts.length > 5) {
    const more = document.createElement('div');
    more.style.cssText = 'color:#9aa;font-size:11px;padding-top:6px;';
    more.textContent = `+${drafts.length - 5} more in your workspace.`;
    list.append(more);
  }
}
document.addEventListener('DOMContentLoaded', () => {
  loadApprovals();
  setInterval(loadApprovals, 60000);
});

// ── Send to Rida (the capture into your Intake feed) ──
const KIND_LABEL = { competitor: 'Competitor', suitor: 'Possible buyer or backer', prospect: 'Prospect', partner: 'Partner', investor: 'Investor', idea: 'Idea', news: 'News', other: 'Saved' };
function renderCapture(el, r) {
  el.replaceChildren();
  if (!r) return;
  if (!r.ok) { const e = document.createElement('div'); e.style.color = '#e99'; e.textContent = r.error || "Couldn't send it."; el.append(e); return; }
  const c = r.capture || {};
  const pill = document.createElement('div'); pill.style.cssText = 'font-weight:600;';
  pill.textContent = `${KIND_LABEL[c.kind] || 'Saved'}${c.contact_name ? ' · ' + c.contact_name : ''}${c.deal_name ? ' · ' + c.deal_name : ''}`;
  const why = document.createElement('div'); why.style.cssText = 'color:#cdd;margin-top:2px;'; why.textContent = c.why || c.summary || '';
  const next = document.createElement('div'); next.style.cssText = 'color:#9aa;margin-top:2px;'; next.textContent = c.suggested_action ? `Next: ${c.suggested_action}` : '';
  el.append(pill, why, next);
}
document.addEventListener('DOMContentLoaded', async () => {
  const card = document.getElementById('captureCard');
  const btn = document.getElementById('captureBtn');
  const note = document.getElementById('captureNote');
  const out = document.getElementById('captureResult');
  if (!card || !btn) return;
  if (!(await loadGrkKey())) return;
  card.style.display = 'block';
  const { getrida_last_capture: last } = await chrome.storage.local.get('getrida_last_capture');
  if (last && Date.now() - last.at < 10 * 60 * 1000) renderCapture(out, last);
  btn.addEventListener('click', () => {
    btn.disabled = true; btn.textContent = 'Reading and sorting…'; out.replaceChildren();
    chrome.runtime.sendMessage({ action: 'capture_tab', note: note.value.trim() }, (r) => {
      btn.disabled = false; btn.textContent = 'Send to Rida';
      if (r?.ok) note.value = '';
      renderCapture(out, r || { ok: false, error: "Couldn't send it." });
    });
  });
});
