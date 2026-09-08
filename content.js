class ContentScriptHandler {
  constructor() {
    this.highlightedElements = new Set();
    this.init();
  }

  init() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });

    // Detect meeting on initial page load
    this.detectAndReportMeeting();

    // Detect meeting on SPA navigation (Meet, Teams are SPAs that change URL
    // without a full reload). We use a MutationObserver on history.pushState
    // by monkey-patching the pushState/replaceState methods.
    this.watchSpaNavigation();
  }

  watchSpaNavigation() {
    const wrap = (original) => {
      return function (...args) {
        const result = original.apply(this, args);
        // Defer to allow URL to fully update
        setTimeout(() => {
          try {
            window.dispatchEvent(new CustomEvent('getrida-url-changed'));
          } catch {}
        }, 0);
        return result;
      };
    };
    if (!history.__getrida_patched) {
      history.pushState = wrap(history.pushState);
      history.replaceState = wrap(history.replaceState);
      history.__getrida_patched = true;
    }
    window.addEventListener('getrida-url-changed', () => {
      this.detectAndReportMeeting();
    });
    window.addEventListener('popstate', () => {
      setTimeout(() => this.detectAndReportMeeting(), 100);
    });
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'highlight_element':
          this.highlightElement(message.selector || '');
          sendResponse({ success: true });
          break;

        case 'unhighlight_all':
          this.unhighlightAll();
          sendResponse({ success: true });
          break;

        case 'action_overlay':
          this.showActionOverlay(message.label || message.action || 'Working', message.status || 'running');
          sendResponse({ success: true });
          break;

        case 'clear_action_overlay':
          this.clearActionOverlay();
          sendResponse({ success: true });
          break;

        case 'get_element_info':
          sendResponse({ success: true, info: this.getElementInfo(message.selector || '') });
          break;

        case 'start_element_picker':
          this.startElementPicker(sendResponse);
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  }

  highlightElement(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    const original = { outline: el.style.outline, offset: el.style.outlineOffset };
    this.highlightedElements.add({ el, original });
    el.style.outline = '3px solid #4a9';
    el.style.outlineOffset = '2px';
    setTimeout(() => {
      el.style.outline = original.outline;
      el.style.outlineOffset = original.offset;
    }, 3000);
  }

  unhighlightAll() {
    for (const { el, original } of this.highlightedElements) {
      el.style.outline = original.outline;
      el.style.outlineOffset = original.offset;
    }
    this.highlightedElements.clear();
  }

  showActionOverlay(label, status) {
    this.clearActionOverlay();
    const overlay = document.createElement('div');
    overlay.id = 'getrida-overlay';
    overlay.style.cssText = `position:fixed;top:12px;right:12px;z-index:999999;background:#0a0a0a;color:#e0e0e0;padding:8px 14px;border-radius:6px;font-family:-apple-system,sans-serif;font-size:12px;border:1px solid ${status === 'error' ? '#c44' : status === 'done' ? '#4a9' : '#4a9'};box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
    overlay.textContent = label;
    document.body.appendChild(overlay);
    setTimeout(() => this.clearActionOverlay(), 3000);
  }

  clearActionOverlay() {
    const existing = document.getElementById('getrida-overlay');
    if (existing) existing.remove();
  }

  getElementInfo(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const styles = window.getComputedStyle(el);
    return {
      tagName: el.tagName,
      id: el.id,
      className: el.className,
      textContent: el.textContent?.slice(0, 200),
      value: el.value,
      type: el.type,
      position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      visibility: styles.visibility,
      display: styles.display,
      attributes: Array.from(el.attributes).reduce((acc, attr) => { acc[attr.name] = attr.value; return acc; }, {}),
      xpath: this.getXPath(el),
    };
  }

  getXPath(el) {
    if (el.id) return `//*[@id="${el.id}"]`;
    const parts = [];
    while (el && el.nodeType === 1) {
      let idx = 1;
      let sibling = el.previousElementSibling;
      while (sibling) { if (sibling.tagName === el.tagName) idx++; sibling = sibling.previousElementSibling; }
      parts.unshift(`${el.tagName.toLowerCase()}[${idx}]`);
      el = el.parentElement;
    }
    return '/' + parts.join('/');
  }

  // ── Meeting detection ────────────────────────────────────────────────
  // When user is on a meeting page (Meet/Zoom-web/Teams-web), notify the
  // background service worker so it can dispatch a Vexa bot to join.

  detectAndReportMeeting() {
    const meetingUrl = window.location.href;
    const pageTitle = document.title || '';

    // Inline detector (mirrors src/tools/meeting-bot.js:detectMeetingUrl).
    // Keeps content script standalone so it works even if the module
    // import path changes.
    let parsed;
    try { parsed = new URL(meetingUrl); } catch { return; }
    const host = parsed.hostname || '';
    const path = parsed.pathname || '';

    let detection = null;

    if (host === 'meet.google.com' && path.length > 1) {
      const code = path.replace(/^\/+/, '').split('/')[0].split('?')[0];
      if (/^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(code)) {
        detection = {
          platform: 'google_meet',
          native_id: code,
          url: `https://meet.google.com/${code}`,
          title: pageTitle,
        };
      }
    } else if (host.endsWith('zoom.us') && (path.startsWith('/wc/') || path.startsWith('/j/'))) {
      const parts = path.split('/').filter(Boolean);
      const meetingId = parts[parts.length - 1]?.split('?')[0];
      if (meetingId && /^\d{8,}$/.test(meetingId)) {
        detection = {
          platform: 'zoom',
          native_id: meetingId,
          url: `https://zoom.us/j/${meetingId}`,
          title: pageTitle,
        };
      }
    } else if (host === 'teams.microsoft.com' || host === 'teams.live.com') {
      const m = meetingUrl.match(/meetup-join\/([^/?#]+)/);
      if (m) {
        detection = {
          platform: 'ms_teams',
          native_id: m[1],
          url: meetingUrl,
          title: pageTitle,
        };
      }
    }

    if (detection) {
      chrome.runtime.sendMessage({
        action: 'meetingDetected',
        meeting: detection,
      }).catch(() => {});
    }
  }

  startElementPicker(sendResponse) {
    const existing = document.getElementById('getrida-picker');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'getrida-picker';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:999998;cursor:crosshair;background:rgba(0,0,0,0.1);';

    const highlight = document.createElement('div');
    highlight.style.cssText = 'position:absolute;border:2px solid #4a9;background:rgba(74,169,153,0.1);pointer-events:none;z-index:999999;transition:all 0.05s;';

    overlay.appendChild(highlight);
    document.body.appendChild(overlay);

    const onMove = (e) => {
      highlight.style.left = e.clientX + 'px';
      highlight.style.top = e.clientY + 'px';
      highlight.style.width = '0';
      highlight.style.height = '0';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el !== overlay && el !== highlight) {
        const rect = el.getBoundingClientRect();
        highlight.style.left = rect.left + 'px';
        highlight.style.top = rect.top + 'px';
        highlight.style.width = rect.width + 'px';
        highlight.style.height = rect.height + 'px';
      }
    };

    const onClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      overlay.remove();
      if (el) {
        const info = this.getElementInfoFromElement(el);
        sendResponse({ success: true, info });
      } else {
        sendResponse({ success: false, error: 'No element selected' });
      }
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { overlay.remove(); sendResponse({ success: false, error: 'Cancelled' }); }
    };

    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey, { once: true });
  }

  getElementInfoFromElement(el) {
    const rect = el.getBoundingClientRect();
    const selector = el.id ? `#${el.id}` : el.className ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}` : el.tagName.toLowerCase();
    return {
      tagName: el.tagName,
      id: el.id,
      className: el.className,
      selector,
      textContent: el.textContent?.slice(0, 200),
      position: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      xpath: this.getXPath(el),
      attributes: Array.from(el.attributes).reduce((acc, attr) => { acc[attr.name] = attr.value; return acc; }, {}),
    };
  }
}

new ContentScriptHandler();