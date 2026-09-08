const TOOL_DEFS = [
  { name: 'navigate', description: 'Navigate the current tab to a URL.', params: { url: 'string', newTab: 'boolean?' } },
  { name: 'click', description: 'Click an element by CSS selector or text= prefix.', params: { selector: 'string', timeoutMs: 'number?' } },
  { name: 'clickAt', description: 'Click at exact viewport coordinates.', params: { x: 'number', y: 'number', button: 'string?', doubleClick: 'boolean?' } },
  { name: 'type', description: 'Type text into an input element.', params: { selector: 'string', text: 'string', timeoutMs: 'number?' } },
  { name: 'pressKey', description: 'Press a keyboard key (e.g. Enter, Tab, Escape).', params: { key: 'string', selector: 'string?' } },
  { name: 'scroll', description: 'Scroll the page. direction: up/down/top/bottom.', params: { direction: 'string', amount: 'number?', selector: 'string?' } },
  { name: 'screenshot', description: 'Capture a screenshot of the current tab.', params: {} },
  { name: 'getContent', description: 'Extract page content. type: text/html/title/url/links.', params: { type: 'string?', selector: 'string?' } },
  { name: 'evaluate', description: 'Execute JavaScript in ISOLATED page context. Has DOM access. Safe — no shared state with page scripts.', params: { script: 'string' } },
  { name: 'evaluatePage', description: 'Execute JavaScript in page MAIN context (full variable access). REQUIRES user confirmation — code is shown before execution. Only use when you need page-script variables.', params: { script: 'string' } },
  { name: 'waitFor', description: 'Wait for a selector, text, or JS condition.', params: { selector: 'string?', text: 'string?', script: 'string?', timeoutMs: 'number?' } },
  { name: 'getTabs', description: 'List all tabs in the current window.', params: {} },
  { name: 'closeTab', description: 'Close a tab by ID.', params: { tabId: 'number' } },
  { name: 'switchTab', description: 'Switch to a tab by ID.', params: { tabId: 'number' } },
  { name: 'findHtml', description: 'Check if an HTML snippet exists in the page DOM.', params: { htmlSnippet: 'string' } },
  { name: 'skill', description: 'Manage domain skills: get, list, create, update, rewrite, delete.', params: { action: 'string', name: 'string?' } },
];

function getToolDefinitions() {
  return TOOL_DEFS;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function executeTool(name, args) {
  const tab = await getActiveTab();
  if (!tab) throw new Error('No active tab');

  switch (name) {
    case 'navigate': {
      if (args.newTab) {
        await chrome.tabs.create({ url: args.url });
      } else {
        await chrome.tabs.update(tab.id, { url: args.url });
      }
      await new Promise(r => setTimeout(r, 2000));
      return { ok: true, url: args.url };
    }

    case 'click': {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selector, timeoutMs) => {
          const findEl = () => {
            if (selector.startsWith('text=')) {
              const text = selector.slice(5);
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
              while (walker.nextNode()) {
                if (walker.currentNode.textContent.includes(text)) {
                  return walker.currentNode.parentElement;
                }
              }
              return null;
            }
            return document.querySelector(selector);
          };
          const el = findEl();
          if (el) {
            el.click();
            return { ok: true, selector };
          }
          return { ok: false, error: 'Element not found: ' + selector };
        },
        args: [args.selector, args.timeoutMs || 5000],
      });
      return results?.[0]?.result || { ok: false, error: 'No result' };
    }

    case 'clickAt': {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (x, y, button, doubleClick) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return { ok: false, error: 'No element at coordinates' };
          const evt = new MouseEvent('click', {
            bubbles: true, cancelable: true, clientX: x, clientY: y,
            button: button === 'right' ? 2 : button === 'middle' ? 1 : 0,
          });
          el.dispatchEvent(evt);
          if (doubleClick) {
            el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: x, clientY: y }));
          }
          return { ok: true, x, y };
        },
        args: [args.x, args.y, args.button || 'left', args.doubleClick || false],
      });
      return results?.[0]?.result || { ok: false, error: 'No result' };
    }

    case 'type': {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (selector, text) => {
          const el = document.querySelector(selector);
          if (!el) return { ok: false, error: 'Element not found: ' + selector };
          el.focus();
          el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, selector, text };
        },
        args: [args.selector, args.text],
      });
      return results?.[0]?.result || { ok: false, error: 'No result' };
    }

    case 'pressKey': {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (key, selector) => {
          if (selector) {
            const el = document.querySelector(selector);
            if (el) el.focus();
          }
          const keyMap = { Enter: 'Enter', Tab: 'Tab', Escape: 'Escape', Backspace: 'Backspace', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
          const ev = new KeyboardEvent('keydown', { key: keyMap[key] || key, bubbles: true });
          document.activeElement?.dispatchEvent(ev);
          const evUp = new KeyboardEvent('keyup', { key: keyMap[key] || key, bubbles: true });
          document.activeElement?.dispatchEvent(evUp);
          return { ok: true, key };
        },
        args: [args.key, args.selector],
      });
      return results?.[0]?.result || { ok: false, error: 'No result' };
    }

    case 'scroll': {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (direction, amount, selector) => {
          const target = selector ? document.querySelector(selector) : window;
          const scrollAmt = amount || 500;
          if (direction === 'top') target.scrollTo(0, 0);
          else if (direction === 'bottom') target.scrollTo(0, target.scrollHeight);
          else if (direction === 'up') target.scrollBy(0, -scrollAmt);
          else target.scrollBy(0, scrollAmt);
          return { ok: true, direction, amount: scrollAmt };
        },
        args: [args.direction || 'down', args.amount, args.selector],
      });
      return results?.[0]?.result || { ok: false, error: 'No result' };
    }

    case 'screenshot': {
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 70 });
      return { ok: true, screenshot: dataUrl.slice(0, 100) + '...(truncated)', tabId: tab.id };
    }

    case 'getContent': {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (type, selector) => {
          if (type === 'title') return document.title;
          if (type === 'url') return window.location.href;
          if (type === 'html') return selector ? document.querySelector(selector)?.innerHTML : document.documentElement.outerHTML.slice(0, 5000);
          if (type === 'links') return Array.from(document.querySelectorAll('a')).map(a => ({ text: a.textContent.trim().slice(0, 100), href: a.href })).slice(0, 50);
          return selector ? document.querySelector(selector)?.textContent : document.body.innerText.slice(0, 5000);
        },
        args: [args.type || 'text', args.selector],
      });
      return { ok: true, content: results?.[0]?.result };
    }

    case 'evaluate': {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (code) => {
          try {
            const result = eval(code);
            return { ok: true, result: typeof result === 'object' ? JSON.parse(JSON.stringify(result)) : result };
          } catch (e) {
            return { ok: false, error: e.message };
          }
        },
        args: [args.script],
        world: 'ISOLATED',
      });
      return results?.[0]?.result || { ok: false, error: 'No result' };
    }

    case 'evaluatePage_exec': {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (code) => {
          try {
            const result = eval(code);
            return { ok: true, result: typeof result === 'object' ? JSON.parse(JSON.stringify(result)) : result };
          } catch (e) {
            return { ok: false, error: e.message };
          }
        },
        args: [args.script],
        world: 'MAIN',
      });
      return results?.[0]?.result || { ok: false, error: 'No result' };
    }

    case 'waitFor': {
      const timeout = args.timeoutMs || 10000;
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (selector, text, script) => {
            if (selector && document.querySelector(selector)) return true;
            if (text && document.body.innerText.includes(text)) return true;
            if (script) { try { return eval(script); } catch { return false; } }
            return false;
          },
          args: [args.selector, args.text, args.script],
        });
        if (results?.[0]?.result) return { ok: true, waited: Date.now() - start };
        await new Promise(r => setTimeout(r, 500));
      }
      return { ok: false, error: 'Timeout waiting for condition' };
    }

    case 'getTabs': {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      return { ok: true, tabs: tabs.map(t => ({ id: t.id, url: t.url, title: t.title, active: t.active })) };
    }

    case 'closeTab': {
      await chrome.tabs.remove(args.tabId);
      return { ok: true, tabId: args.tabId };
    }

    case 'switchTab': {
      await chrome.tabs.update(args.tabId, { active: true });
      return { ok: true, tabId: args.tabId };
    }

    case 'findHtml': {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (snippet) => document.body.innerHTML.includes(snippet),
        args: [args.htmlSnippet],
      });
      return { ok: true, found: results?.[0]?.result || false };
    }

    default:
      return { ok: false, error: 'Unknown tool: ' + name };
  }
}

export { getToolDefinitions, executeTool, TOOL_DEFS };