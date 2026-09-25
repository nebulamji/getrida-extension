// meet-notes.js — your GetRida employee takes notes on Google Meet calls.
//
// Asks once (Always / Not now). When allowed, it switches on Meet's captions,
// records who said what, and when the call ends hands the transcript to the
// employee, which writes the recap, drafts the follow-up and any documents the
// call asked for, and holds them for your approval. Nothing is sent without you.

(() => {
  if (window.__getridaMeetNotes) return;
  window.__getridaMeetNotes = true;

  const CALL_PATH = /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\/|$)/;
  const lines = [];                       // [{speaker, text}]
  const blockIndex = new WeakMap();       // caption block element → index in lines
  const speakers = new Set();
  let observer = null;
  let active = false;
  let startedAt = null;
  let badge = null;

  const inCall = () => CALL_PATH.test(location.pathname) && !!document.querySelector('[aria-label*="Leave call" i], [aria-label*="leave call" i]');

  function showBadge(text, actions) {
    if (!badge) {
      badge = document.createElement('div');
      badge.style.cssText = 'position:fixed;z-index:2147483647;bottom:88px;left:16px;background:#111;color:#fff;font:13px/1.4 -apple-system,Segoe UI,sans-serif;padding:10px 12px;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.35);display:flex;gap:8px;align-items:center;max-width:360px';
      document.body.appendChild(badge);
    }
    badge.textContent = '';
    const span = document.createElement('span'); span.textContent = text; badge.appendChild(span);
    for (const [label, fn] of actions || []) {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'background:#fff;color:#000;border:0;border-radius:6px;padding:4px 8px;font-weight:600;cursor:pointer';
      b.onclick = fn;
      badge.appendChild(b);
    }
  }

  function captionsRegion() {
    return document.querySelector('[role="region"][aria-label*="aption" i]') ||
      document.querySelector('[aria-label="Captions"]') ||
      document.querySelector('div[jsname="dsyhDe"]');
  }

  function turnOnCaptions() {
    if (captionsRegion()) return;
    const btn = document.querySelector('button[aria-label*="Turn on captions" i]');
    if (btn) btn.click();
  }

  // A caption block is a speaker name followed by what they are saying; Meet
  // rewrites the text in place as speech continues, so keep the latest text.
  function readBlocks(region) {
    const blocks = region.querySelectorAll(':scope > div > div, :scope > div');
    for (const block of blocks) {
      const parts = (block.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const speaker = parts[0].slice(0, 80);
      const text = parts.slice(1).join(' ').slice(0, 2000);
      if (!text || /^(arrow_downward|jump to bottom)$/i.test(text)) continue;
      speakers.add(speaker);
      if (blockIndex.has(block)) {
        lines[blockIndex.get(block)] = { speaker, text };
      } else {
        blockIndex.set(block, lines.length);
        lines.push({ speaker, text });
      }
    }
  }

  function start() {
    if (active) return;
    active = true;
    startedAt = new Date().toISOString();
    showBadge('GetRida is taking notes on this call.', []);
    turnOnCaptions();
    const tick = setInterval(() => {
      if (!inCall()) { clearInterval(tick); finish(); return; }
      const region = captionsRegion();
      if (!region) { turnOnCaptions(); return; }
      if (!observer) {
        observer = new MutationObserver(() => readBlocks(region));
        observer.observe(region, { childList: true, subtree: true, characterData: true });
      }
      readBlocks(region);
      chrome.storage.local.set({ getrida_meet_draft: { url: location.href, title: document.title, startedAt, lines } });
    }, 3000);
    window.addEventListener('pagehide', finish, { once: true });
  }

  let finished = false;
  function finish() {
    if (!active || finished) return;
    finished = true;
    observer?.disconnect();
    const transcript = lines.map((l) => `${l.speaker}: ${l.text}`).join('\n');
    if (transcript.length < 40) { chrome.storage.local.remove('getrida_meet_draft'); return; }
    chrome.runtime.sendMessage({
      action: 'meet_transcript',
      payload: {
        title: (document.title || 'Google Meet call').replace(/^Meet\s*[-–]\s*/i, '').slice(0, 200),
        transcript,
        attendees: [...speakers].map((name) => ({ name })),
        meeting_at: startedAt,
        source: 'google_meet_extension',
      },
    });
    showBadge('Call notes sent to your employee. Review the recap and drafts in GetRida.', []);
  }

  async function maybeStart() {
    if (!inCall()) return;
    const st = await chrome.storage.local.get(['getrida_grk_key', 'getrida_meet_notes']);
    if (!st.getrida_grk_key) return;
    if (st.getrida_meet_notes === 'always') return start();
    if (st.getrida_meet_notes === 'never') return;
    showBadge('Let your GetRida employee take notes on this call?', [
      ['Always', () => { chrome.storage.local.set({ getrida_meet_notes: 'always' }); start(); }],
      ['Not now', () => { badge?.remove(); badge = null; }],
    ]);
  }

  const wait = setInterval(() => { if (inCall()) { clearInterval(wait); maybeStart(); } }, 2000);
})();
