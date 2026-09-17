const STATE_KEY = 'getrida_state';
const ENDPOINT_KEY = 'getrida_endpoint';
const SESSIONS_KEY = 'getrida_sessions';
const MODE_KEY = 'getrida_mode';
const PROVIDER_KEY = 'getrida_provider_config';

const DEFAULT_ENDPOINT = 'https://getrida.work/api/v1/compile';

const DEFAULT_STATE = {
  status: 'idle',
  message: '',
  session: null,
  noiseUrls: [],
  compiledTabs: [],
  timestamp: null,
};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    [STATE_KEY]: DEFAULT_STATE,
    [ENDPOINT_KEY]: DEFAULT_ENDPOINT,
    [SESSIONS_KEY]: [],
    [MODE_KEY]: 'paid',
    [PROVIDER_KEY]: { mode: 'rida', provider: 'rida', apiKey: '' },
  });
  const { initializeDefaultSkills, DEFAULT_SKILLS, registerUserScript } = await import('./src/tools/skills.js');
  await initializeDefaultSkills();
  await runFirstRunCapabilityScan(DEFAULT_SKILLS);
  for (const skill of DEFAULT_SKILLS) {
    try { await registerUserScript(skill); } catch (e) { /* userScripts may not be available in all contexts */ }
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.getrida_skills) return;
  const { registerUserScript, DEFAULT_SKILLS } = await import('./src/tools/skills.js');
  const newSkills = changes.getrida_skills.newValue || [];
  for (const skill of newSkills) {
    const isDefault = DEFAULT_SKILLS.some(d => d.name === skill.name);
    if (!isDefault) {
      try { await registerUserScript(skill); } catch {}
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getState') {
    chrome.storage.local.get(STATE_KEY).then(data => sendResponse(data[STATE_KEY] || DEFAULT_STATE));
    return true;
  }

  if (msg.action === 'compile') {
    handleCompile(msg.mission, msg.walletAddress, msg.walletChain);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'closeNoise') {
    handleCloseNoise();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'reset') {
    chrome.storage.local.set({ [STATE_KEY]: DEFAULT_STATE });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'getSessions') {
    chrome.storage.local.get(SESSIONS_KEY).then(data => sendResponse(data[SESSIONS_KEY] || []));
    return true;
  }

  if (msg.action === 'agentRun') {
    handleAgentRun(msg.message, sender);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'agentRunCancel') {
    if (agentAbortController) {
      agentAbortController.abort();
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: 'No active agent run to cancel' });
    }
    return false;
  }

  if (msg.action === 'clearConversation') {
    chrome.storage.local.set({ getrida_conversation: [] });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'pickElement') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'start_element_picker' }, sendResponse);
      } else {
        sendResponse({ success: false, error: 'No active tab' });
      }
    });
    return true;
  }

  if (msg.action === 'startNetworkWatch') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs[0]) handleNetworkWatch(tabs[0].id, tabs[0].url);
      sendResponse({ ok: true });
    });
    return false;
  }

  if (msg.action === 'getNetworkLog') {
    getNetworkLog().then(log => sendResponse(log));
    return true;
  }

  if (msg.action === 'clearNetworkLog') {
    chrome.storage.local.set({ getrida_network_log: [] });
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'getCapabilities') {
    chrome.storage.local.get('getrida_capabilities').then(d => sendResponse(d.getrida_capabilities || null));
    return true;
  }

  if (msg.action === 'detectWallet') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async tabs => {
      if (!tabs[0] || !tabs[0].url || !tabs[0].url.startsWith('http')) {
        sendResponse({ detected: false, reason: 'no_injectable_tab' });
        return;
      }
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            const providers = [];
            if (window.ethereum) {
              const chain = window.ethereum.chainId ? parseInt(window.ethereum.chainId, 16) : 0;
              providers.push({ kind: 'evm', label: window.ethereum.isMetaMask ? 'MetaMask' : 'EVM Wallet', chainId: chain });
            }
            if (window.phantom && window.phantom.solana) {
              providers.push({ kind: 'solana', label: 'Phantom' });
            } else if (window.solana && window.solana.isPhantom) {
              providers.push({ kind: 'solana', label: 'Phantom' });
            } else if (window.solana) {
              providers.push({ kind: 'solana', label: 'Solana Wallet' });
            }
            return providers;
          },
          world: 'MAIN',
        });
        const providers = results?.[0]?.result || [];
        sendResponse({ detected: providers.length > 0, providers });
      } catch (e) {
        sendResponse({ detected: false, reason: e.message });
      }
    });
    return true;
  }

  if (msg.action === 'meetingDetected') {
    handleMeetingDetected(msg.meeting);
    sendResponse({ ok: true });
    return false;
  }

  if (msg.action === 'getActiveMeeting') {
    getActiveMeeting().then(m => sendResponse({ meeting: m }));
    return true;
  }

  if (msg.action === 'getMeetingHistory') {
    getMeetingHistory().then(h => sendResponse({ history: h }));
    return true;
  }

  if (msg.action === 'clearActiveMeeting') {
    clearActiveMeeting().then(() => sendResponse({ ok: true }));
    return false;
  }

  if (msg.action === 'ensureMeetingWebhook') {
    ensureWebhookConfigured().then(ok => sendResponse({ ok }));
    return true;
  }

  if (msg.action === 'connectWalletProvider') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(async tabs => {
      if (!tabs[0] || !tabs[0].url || !tabs[0].url.startsWith('http')) {
        sendResponse({ ok: false, error: 'no_injectable_tab' });
        return;
      }
      const kind = msg.kind || 'evm';
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: async (kind) => {
            if (kind === 'solana') {
              const provider = window.solana || (window.phantom && window.phantom.solana);
              if (!provider) throw new Error('No Solana provider');
              const resp = await provider.connect();
              return { address: resp.publicKey.toString(), chain: 'solana' };
            }
            if (!window.ethereum) throw new Error('No EVM provider');
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const chainId = parseInt(window.ethereum.chainId || '0x1', 16);
            const chain = chainId === 8453 ? 'base' : chainId === 1 ? 'ethereum' : 'evm';
            return { address: accounts[0], chain };
          },
          args: [kind],
          world: 'MAIN',
        });
        sendResponse({ ok: true, ...results?.[0]?.result });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    });
    return true;
  }

  if (msg.action === 'setAgentConfig') {
    const cfg = msg.config || {};
    const updates = {};
    if (cfg.mode) updates[MODE_KEY] = cfg.mode;
    if (cfg.providerConfig) updates[PROVIDER_KEY] = cfg.providerConfig;
    if (cfg.endpoint) updates[ENDPOINT_KEY] = cfg.endpoint;
    if (cfg.grkKey) updates['getrida_grk_key'] = cfg.grkKey;
    if (cfg.walletAddress && cfg.walletChain) {
      updates['getrida_wallet'] = { address: cfg.walletAddress, chain: cfg.walletChain, sessionToken: cfg.sessionToken || '' };
    }
    if (Object.keys(updates).length) {
      chrome.storage.local.set(updates).then(() => sendResponse({ ok: true, applied: Object.keys(updates) }));
      return true;
    }
    sendResponse({ ok: true, applied: [] });
    return false;
  }
});

async function setState(partial) {
  const data = await chrome.storage.local.get(STATE_KEY);
  const current = data[STATE_KEY] || DEFAULT_STATE;
  const updated = { ...current, ...partial, timestamp: Date.now() };
  await chrome.storage.local.set({ [STATE_KEY]: updated });
  chrome.runtime.sendMessage({ action: 'stateUpdate', state: updated }).catch(() => {});
}

async function saveSession(session, mission, tabCount) {
  const data = await chrome.storage.local.get(SESSIONS_KEY);
  const sessions = data[SESSIONS_KEY] || [];
  const entry = {
    id: session.session_id || `local-${Date.now()}`,
    mission,
    tabCount,
    timestamp: Date.now(),
    summary: session.monofile_preview ? session.monofile_preview.slice(0, 500) : '',
    viewUrl: session.view_url || null,
    noiseCount: session.noiseUrls || 0,
  };
  sessions.unshift(entry);
  if (sessions.length > 100) sessions.length = 100;
  await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
}

async function handleCompile(mission, walletAddress, walletChain) {
  await setState({ status: 'capturing', message: 'Reading tabs...', session: null, noiseUrls: [] });

  try {
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    const tabData = [];

    for (const tab of allTabs) {
      const entry = { url: tab.url, title: tab.title || '', tabId: tab.id, favIconUrl: tab.favIconUrl || null };

      try {
        if (tab.url && tab.url.startsWith('http') && !tab.url.includes('chrome://') && !tab.url.includes('chrome-extension://')) {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              const desc = document.querySelector('meta[name="description"]');
              const h1 = document.querySelector('h1');
              const body = document.body?.innerText || '';
              const ogTitle = document.querySelector('meta[property="og:title"]');
              const ogType = document.querySelector('meta[property="og:type"]');

              let pageType = 'unknown';
              const url = window.location.href;
              if (ogType?.content) pageType = ogType.content;
              else if (document.querySelector('article')) pageType = 'article';
              else if (url.includes('docs.') || url.includes('/docs/')) pageType = 'documentation';
              else if (url.includes('github.com')) pageType = 'github';
              else if (url.includes('linkedin.com')) pageType = 'linkedin';
              else if (url.includes('youtube.com') || url.includes('youtu.be')) pageType = 'youtube';
              else if (url.includes('google.com')) pageType = 'google';
              else if (url.includes('notion.so') || url.includes('notion.site')) pageType = 'notion';
              else if (url.includes('figma.com')) pageType = 'figma';
              else if (document.querySelector('[data-app], #root, #app')) pageType = 'webapp';

              return {
                description: desc?.content || '',
                h1: h1?.textContent || '',
                body: body.slice(0, 1500),
                pageType,
                ogTitle: ogTitle?.content || '',
              };
            },
          });
          if (results?.[0]?.result) {
            entry.description = results[0].result.description;
            entry.h1 = results[0].result.h1;
            entry.body = results[0].result.body;
            entry.pageType = results[0].result.pageType;
            entry.ogTitle = results[0].result.ogTitle;
          }
        }
      } catch (e) {
        entry.extractionError = e.message;
      }

      tabData.push(entry);
    }

    await setState({ status: 'compiling', message: `Compiling ${tabData.length} tabs...`, compiledTabs: tabData });

    const config = await chrome.storage.local.get([ENDPOINT_KEY]);
    const endpoint = config[ENDPOINT_KEY] || DEFAULT_ENDPOINT;
    const cleanTabs = tabData.map(({ tabId, favIconUrl, extractionError, ...rest }) => rest);

    const body = { mission, tabs: cleanTabs };
    if (walletAddress) body.walletAddress = walletAddress;
    if (walletChain) body.walletChain = walletChain;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    let res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') throw new Error('Compile timed out after 2 minutes');
      throw e;
    }
    clearTimeout(timeout);

    const data = await res.json();

    if (data.ok) {
      const noiseUrls = parseNoiseTabs(data.monofile_preview || '');
      await setState({ status: 'done', message: `${data.tabs || cleanTabs.length} tabs compiled.`, session: data, noiseUrls });
      await saveSession(data, mission, cleanTabs.length);
    } else {
      await setState({ status: 'error', message: data.error || 'Compile failed.', session: data });
    }
  } catch (e) {
    await setState({ status: 'error', message: `Error: ${e.message}` });
  }
}

function parseNoiseTabs(monofile) {
  const noiseUrls = [];
  const closeSection = monofile.match(/CLOSE:?\s*([\s\S]*?)(?:\n\n|\n##|$)/i);
  if (closeSection) {
    const urls = closeSection[1].match(/https?:\/\/[^\s,\])]+/g);
    if (urls) noiseUrls.push(...urls);
  }
  const closeLines = monofile.match(/^.*(?:CLOSE|close|noise|duplicate|idle).*$/gim);
  if (closeLines) {
    for (const line of closeLines) {
      const urls = line.match(/https?:\/\/[^\s,\])]+/g);
      if (urls) noiseUrls.push(...urls);
    }
  }
  return [...new Set(noiseUrls)];
}

async function handleCloseNoise() {
  const data = await chrome.storage.local.get(STATE_KEY);
  const state = data[STATE_KEY] || DEFAULT_STATE;

  if (!state.noiseUrls.length) {
    await setState({ message: 'No noise tabs identified. Compile first.' });
    return;
  }

  const allTabs = await chrome.tabs.query({ currentWindow: true });
  const toClose = [];

  for (const tab of allTabs) {
    const tabBase = tab.url.replace(/\/+$/, '').split('?')[0];
    for (const noiseUrl of state.noiseUrls) {
      const noiseBase = noiseUrl.replace(/\/+$/, '').split('?')[0];
      if (tabBase === noiseBase || tab.url.startsWith(noiseBase)) {
        toClose.push(tab.id);
        break;
      }
    }
  }

  if (toClose.length === 0) {
    await setState({ message: 'Noise URLs not found in current tabs. Already closed?' });
    return;
  }

  try {
    await chrome.tabs.remove(toClose);
    await setState({ message: `Closed ${toClose.length} noise tab(s). ${allTabs.length - toClose.length} remaining.`, noiseUrls: [] });
  } catch (e) {
    await setState({ message: `Close failed: ${e.message}` });
  }
}

let agentAbortController = null;

async function handleAgentRun(userMessage, sender) {
  try {
    agentAbortController = new AbortController();
    const { runAgentTurn } = await import('./src/tools/agent-loop.js');
    chrome.runtime.sendMessage({ action: 'agentStream', type: 'start' }).catch(() => {});

    const result = await runAgentTurn(
      userMessage,
      (text) => chrome.runtime.sendMessage({ action: 'agentStream', type: 'delta', text }).catch(() => {}),
      (toolName, args) => chrome.runtime.sendMessage({ action: 'agentToolCall', tool: toolName, args }).catch(() => {}),
      (toolName, result) => chrome.runtime.sendMessage({ action: 'agentToolResult', tool: toolName, result }).catch(() => {}),
      (plan) => chrome.runtime.sendMessage({ action: 'agentPlanUpdate', plan }).catch(() => {}),
      agentAbortController.signal,
    );

    agentAbortController = null;

    if (result.error) {
      chrome.runtime.sendMessage({ action: 'agentStream', type: 'error', error: result.error }).catch(() => {});
    } else if (result.stopped) {
      chrome.runtime.sendMessage({ action: 'agentStream', type: 'stopped', text: result.text }).catch(() => {});
    } else {
      chrome.runtime.sendMessage({ action: 'agentStream', type: 'stop', text: result.text }).catch(() => {});
    }
  } catch (e) {
    agentAbortController = null;
    chrome.runtime.sendMessage({ action: 'agentStream', type: 'error', error: e.message }).catch(() => {});
  }
}

const networkLogEntries = [];
let networkDebuggerTab = null;

async function handleNetworkWatch(tabId, url) {
  if (networkDebuggerTab && networkDebuggerTab !== tabId) {
    try { await chrome.debugger.detach({ tabId: networkDebuggerTab }); } catch {}
  }
  networkDebuggerTab = tabId;

  try {
    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable', {
      maxTotalBufferSize: 50 * 1024 * 1024,
    });

    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (source.tabId !== tabId) return;
      if (method === 'Network.requestWillBeSent') {
        networkLogEntries.push({
          id: params.requestId,
          type: 'request',
          url: params.request.url,
          method: params.request.method,
          timestamp: Date.now(),
          tabId,
          tabUrl: url,
        });
        if (networkLogEntries.length > 1000) networkLogEntries.shift();
      }
      if (method === 'Network.responseReceived') {
        const entry = networkLogEntries.find(e => e.id === params.requestId);
        if (entry) {
          entry.status = params.response.status;
          entry.mimeType = params.response.mimeType;
          entry.responseHeaders = params.response.headers;
        }
      }
    });

    chrome.storage.local.set({ getrida_network_log: networkLogEntries.slice(-200) });
  } catch (e) {
    console.warn('GetRida: network watch failed', e.message);
  }
}

async function getNetworkLog() {
  return networkLogEntries.slice(-50);
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId === networkDebuggerTab) {
    networkDebuggerTab = null;
  }
});

async function runFirstRunCapabilityScan(DEFAULT_SKILLS) {
  const { getSkills, matchDomain } = await import('./src/tools/skills.js');
  const skills = await getSkills();
  const tabs = await chrome.tabs.query({});

  const serviceHits = new Set();
  let detectedWallet = null;

  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;

    for (const skill of skills) {
      if (matchDomain(tab.url, skill.domainPatterns || [])) {
        serviceHits.add(skill.name);
      }
    }

    if (!detectedWallet && tab.url.startsWith('http')) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            if (window.ethereum) return 'evm';
            if (window.solana && window.solana.isPhantom) return 'phantom';
            if (window.solana) return 'solana';
            return null;
          },
          world: 'MAIN',
        });
        detectedWallet = results?.[0]?.result || null;
      } catch (e) { /* tab may not be injectable (chrome:// etc.) */ }
    }
  }

  const { TOOL_DEFS } = await import('./src/tools/browser-tools.js');
  const { ENVOY_TOOL_DEFS } = await import('./src/tools/envoy-tools.js');
  const { FULFILLMENT_TOOL_DEFS } = await import('./src/tools/envoy-fulfillment-rails.js');
  const allToolDefs = [
    ...TOOL_DEFS,
    ...ENVOY_TOOL_DEFS,
    ...FULFILLMENT_TOOL_DEFS,
    { name: 'set_plan', description: 'Set a checklist of 3-6 action steps', params: { steps: 'array' } },
    { name: 'update_plan', description: 'Mark a plan step as done', params: { step_index: 'number' } },
  ];

  const capabilities = {
    version: '0.3.2',
    ready: true,
    mode: 'free',
    tools: allToolDefs.map(t => ({ name: t.name, description: t.description, params: t.params })),
    skills: DEFAULT_SKILLS.map(s => ({ name: s.name, shortDescription: s.shortDescription, domainPatterns: s.domainPatterns })),
    detectedServices: [...serviceHits],
    detectedWallet,
    endpoint: DEFAULT_ENDPOINT,
    authEndpoint: 'https://getrida.work/api/auth',
    agentConfigKeys: [
      'getrida_mode', 'getrida_provider_config', 'getrida_endpoint',
      'getrida_wallet', 'getrida_conversation', 'getrida_skills',
    ],
  };

  await chrome.storage.local.set({
    getrida_capabilities: capabilities,
    getrida_first_run: true,
  });
}

// ── Meeting-bot integration ───────────────────────────────────────────────────
// Imports the meeting-bot module and exposes handlers for content-script
// detection messages. Lazy-loaded so the service worker stays light.

let meetingBotModule = null;

async function loadMeetingBot() {
  if (!meetingBotModule) {
    meetingBotModule = await import('./src/tools/meeting-bot.js');
  }
  return meetingBotModule;
}

async function handleMeetingDetected(meeting) {
  try {
    const bot = await loadMeetingBot();
    const result = await bot.handleMeetingDetected(meeting);

    // Make sure the Worker webhook is configured (fire-and-forget)
    bot.ensureWebhookConfigured().catch(() => {});

    // Notify any open popup/sidepanel so UI can update
    chrome.runtime.sendMessage({
      action: 'meetingBotDispatched',
      meeting: result,
    }).catch(() => {});

    console.log('GetRida meeting-bot: dispatched', result);
  } catch (e) {
    console.warn('GetRida meeting-bot dispatch failed', e);
    chrome.runtime.sendMessage({
      action: 'meetingBotError',
      error: e.message,
    }).catch(() => {});
  }
}

async function getActiveMeeting() {
  const bot = await loadMeetingBot();
  return bot.getActiveMeeting();
}

async function getMeetingHistory() {
  const bot = await loadMeetingBot();
  return bot.getMeetingHistory();
}

async function clearActiveMeeting() {
  const bot = await loadMeetingBot();
  return bot.clearActiveMeeting();
}

async function ensureWebhookConfigured() {
  const bot = await loadMeetingBot();
  return bot.ensureWebhookConfigured();
}