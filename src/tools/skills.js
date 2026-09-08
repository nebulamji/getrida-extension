const SKILLS_KEY = 'getrida_skills';

const DEFAULT_SKILLS = [
  {
    name: 'google',
    domainPatterns: ['google.com', 'google.*/search*'],
    shortDescription: 'Extract Google search results with titles, URLs, snippets',
    description: 'Extracts structured data from Google search result pages. Returns array of results with title, URL, snippet, and position.',
    examples: "const results = await browserjs(() => window.google.getSearchResults());",
    library: `window.google = {
  getSearchResults() {
    const results = { items: [], resultCount: null, relatedSearches: [] };
    const stats = document.querySelector('#result-stats');
    if (stats) { const m = stats.textContent.match(/([\\d,]+)\\s+results/); if (m) results.resultCount = m[1]; }
    document.querySelectorAll('#search .g, #rso > div > div').forEach((r, i) => {
      const t = r.querySelector('h3'); const l = r.querySelector('a'); const s = r.querySelector('.VwiC3b, [data-sncf]');
      if (t && l) results.items.push({ position: i+1, title: t.textContent, url: l.href, snippet: s?.textContent || '' });
    });
    return results;
  }
};`,
    createdAt: '2026-07-11T00:00:00.000Z',
    lastUpdated: '2026-07-11T00:00:00.000Z',
  },
  {
    name: 'youtube',
    domainPatterns: ['youtube.com', 'youtu.be'],
    shortDescription: 'YouTube automation - video controls, info, transcripts, comments',
    description: 'Complete YouTube automation: play/pause, seek, extract video info, transcripts, comments, channel info.',
    examples: "const info = await browserjs(() => window.yt.getVideoInfo());",
    library: `window.yt = {
  playVideo() { document.querySelector('video')?.play(); return 'Playing'; },
  pauseVideo() { document.querySelector('video')?.pause(); return 'Paused'; },
  seekTo(s) { const v = document.querySelector('video'); if (v) v.currentTime = s; return 'Seeked to ' + s; },
  getCurrentTime() { return document.querySelector('video')?.currentTime; },
  getDuration() { return document.querySelector('video')?.duration; },
  getVideoInfo() {
    return {
      title: document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim(),
      channel: document.querySelector('ytd-channel-name yt-formatted-string a')?.textContent?.trim(),
      views: document.querySelector('ytd-video-view-count-renderer span.view-count')?.textContent?.trim(),
    };
  },
  getVideoId() { return new URLSearchParams(window.location.search).get('v'); },
};`,
    createdAt: '2026-07-11T00:00:00.000Z',
    lastUpdated: '2026-07-11T00:00:00.000Z',
  },
  {
    name: 'linkedin',
    domainPatterns: ['linkedin.com/**'],
    shortDescription: 'LinkedIn engagement - collect posts, get comments, post replies',
    description: 'Automate LinkedIn: collect posts with pagination, get comment trees, find unanswered comments, post replies.',
    examples: "const posts = await browserjs(() => window.linkedin.collectPosts(5));",
    library: `window.linkedin = {
  getUsername() { const m = document.querySelector('a[href*="/in/"]')?.href.match(/\\/in\\/([^\\/]+)/); return m ? m[1] : null; },
  collectPosts(count) {
    const posts = document.querySelectorAll('[data-urn*="activity"]');
    return Array.from(posts).slice(0, count).map(p => ({
      urn: p.getAttribute('data-urn'),
      text: p.querySelector('[data-field="active_update_text"]')?.textContent?.slice(0, 200),
      url: p.querySelector('a[href*="/feed/update/"]')?.href,
    }));
  },
};`,
    createdAt: '2026-07-11T00:00:00.000Z',
    lastUpdated: '2026-07-11T00:00:00.000Z',
  },
  {
    name: 'whatsapp',
    domainPatterns: ['web.whatsapp.com'],
    shortDescription: 'WhatsApp Web - list chats, open chats, read messages',
    description: 'Automate WhatsApp Web: list all chats, open by name, get messages with filtering.',
    examples: "const chats = await browserjs(() => window.whatsapp.listChats());",
    library: `window.whatsapp = {
  listChats() {
    const items = document.querySelectorAll('div[role="grid"] > div');
    return Array.from(items).map(item => {
      const name = item.querySelector('span[title]')?.getAttribute('title');
      const unread = !!item.querySelector('span[aria-label*="unread"]');
      return { name, unread };
    }).filter(c => c.name);
  },
  getCurrentChat() {
    const name = document.querySelector('header span[title]')?.getAttribute('title');
    return { name };
  },
};`,
    createdAt: '2026-07-11T00:00:00.000Z',
    lastUpdated: '2026-07-11T00:00:00.000Z',
  },
  {
    name: 'github',
    domainPatterns: ['github.com/**'],
    shortDescription: 'GitHub - read repos, issues, PRs, create issues',
    description: 'GitHub automation: extract repo info, list issues, read PRs, create issues via API.',
    examples: "const info = await browserjs(() => window.gh.getRepoInfo());",
    library: `window.gh = {
  getRepoInfo() {
    const [owner, repo] = window.location.pathname.split('/').filter(Boolean);
    return { owner, repo, url: window.location.href };
  },
  getIssues() {
    return Array.from(document.querySelectorAll('[data-testid="issue-pr-card-link"]')).map(el => ({
      title: el.textContent.trim(),
      href: el.href,
    }));
  },
};`,
    createdAt: '2026-07-11T00:00:00.000Z',
    lastUpdated: '2026-07-11T00:00:00.000Z',
  },
  {
    name: 'notion',
    domainPatterns: ['notion.so', 'notion.site'],
    shortDescription: 'Notion - read databases, pages, write content',
    description: 'Notion automation: extract page content, database entries, create pages via the Notion API.',
    examples: "const content = await browserjs(() => window.notion.getPageContent());",
    library: `window.notion = {
  getPageContent() {
    const blocks = document.querySelectorAll('.notion-text-block, .notion-heading-block, .notion-bulleted_list-block');
    return Array.from(blocks).map(b => ({
      type: b.className.replace('notion-', '').replace('-block', ''),
      text: b.textContent.trim(),
    }));
  },
  getTitle() { return document.querySelector('.notion-page-title')?.textContent?.trim(); },
};`,
    createdAt: '2026-07-11T00:00:00.000Z',
    lastUpdated: '2026-07-11T00:00:00.000Z',
  },
  {
    name: 'obsidian',
    domainPatterns: ['obsidian.md', 'forum.obsidian.md'],
    shortDescription: 'Obsidian - read vault info, forum posts',
    description: 'Obsidian automation: extract forum posts, read vault documentation, search patterns.',
    examples: "const posts = await browserjs(() => window.obsidian.getForumPosts());",
    library: `window.obsidian = {
  getForumPosts() {
    const rows = document.querySelectorAll('tr.topic-list-item, .topic-list-item');
    return Array.from(rows).map(r => ({
      title: r.querySelector('.title, .topic-title')?.textContent?.trim(),
      link: r.querySelector('a')?.href,
    }));
  },
};`,
    createdAt: '2026-07-11T00:00:00.000Z',
    lastUpdated: '2026-07-11T00:00:00.000Z',
  },
  {
    name: 'google-sheets',
    domainPatterns: ['docs.google.com/spreadsheets/**'],
    shortDescription: 'Google Sheets - read/write cells, format data',
    description: 'Complete Google Sheets automation: read/write cells, ranges, formatting.',
    examples: "await browserjs(() => window.sheets.setCellValue('A1', 'Hello'));",
    library: `window.sheets = {
  getCurrentCell() { return document.querySelector('#t-name-box')?.value || null; },
  navigateToCell(addr) {
    const box = document.querySelector('#t-name-box');
    if (box) { box.value = addr; box.dispatchEvent(new Event('input', { bubbles: true })); box.focus(); }
  },
  setCellValue(addr, val) {
    this.navigateToCell(addr);
    const bar = document.querySelector('#t-formula-bar-input');
    if (bar) { bar.textContent = val; bar.dispatchEvent(new Event('input', { bubbles: true })); }
  },
  getCellValue(addr) {
    this.navigateToCell(addr);
    return document.querySelector('#t-formula-bar-input')?.textContent || '';
  },
};`,
    createdAt: '2026-07-11T00:00:00.000Z',
    lastUpdated: '2026-07-11T00:00:00.000Z',
  },
  {
    name: 'gmail',
    domainPatterns: ['mail.google.com'],
    shortDescription: 'Gmail - read, search, send, reply, archive',
    description: 'Gmail automation: list emails, search, read content, send and reply.',
    examples: "const emails = await browserjs(() => window.gmail.getInbox(10));",
    library: `window.gmail = {
  getInbox(count) {
    const rows = document.querySelectorAll('tr.zA');
    return Array.from(rows).slice(0, count || 20).map(r => ({
      sender: r.querySelector('.yW .zF')?.textContent?.trim(),
      subject: r.querySelector('.bog .bqe')?.textContent?.trim() || r.querySelector('.bog')?.textContent?.trim(),
      unread: r.classList.contains('zE'),
      link: r.querySelector('a')?.href,
    }));
  },
  search(query) {
    const input = document.querySelector('input[name="q"]');
    if (input) { input.value = query; input.form?.submit(); }
  },
};`,
    createdAt: '2026-07-11T00:00:00.000Z',
    lastUpdated: '2026-07-11T00:00:00.000Z',
  },
  {
    name: 'getrida-portal',
    domainPatterns: ['portal.getrida.work', 'portalv2.getrida.work', 'getrida.work/portal'],
    shortDescription: 'GetRida Portal — extract pipeline, offers, billing, receipts',
    description: 'GetRida Portal automation: read the pipeline buckets, list offers, read billing/receipts views. The Portal is the operator console — extract outcomes only; never expose CF/D1/Workers internals.',
    examples: "const pipe = await browserjs(() => window.getridaPortal.getPipeline());",
    library: `window.getridaPortal = {
  getPipeline() {
    const cards = document.querySelectorAll('[data-bucket], .pipeline-card, .bucket-card');
    return Array.from(cards).map(c => ({
      bucket: c.dataset?.bucket || c.querySelector('h3, h2')?.textContent?.trim(),
      count: parseInt(c.dataset?.count || c.querySelector('[data-count]')?.dataset?.count || '0', 10),
    }));
  },
  getOffers() {
    return Array.from(document.querySelectorAll('[data-offer-id], .offer-card')).map(o => ({
      id: o.dataset?.offerId,
      title: o.querySelector('[data-offer-title]')?.textContent?.trim(),
      status: o.dataset?.status || o.querySelector('.badge')?.textContent?.trim(),
    }));
  },
  getActiveView() {
    return document.querySelector('.view.active, [data-view].active')?.dataset?.view || null;
  },
};`,
    createdAt: '2026-07-11T00:00:00.000Z',
    lastUpdated: '2026-07-11T00:00:00.000Z',
  },
  {
    name: 'getrida-envoy',
    domainPatterns: ['envoy.getrida.work'],
    shortDescription: 'Envoy greenfield — GateDecision ledger, draft board, receipt chain',
    description: 'Envoy (governed outbound rail) surface automation. When envoy.getrida.work is live: read the GateDecision ledger, list draft variants pending review, inspect the receipt chain. Today: the greenfield is gated to G1/G2/G3 + treasury ATA, so the skill reads the holding page and explains the gate state. Never sends — Envoy is observer/governance until G2 clears.',
    examples: "const gate = await browserjs(() => window.getridaEnvoy.getGateState());",
    library: `window.getridaEnvoy = {
  getGateState() {
    const body = document.body?.innerText || '';
    const hasGattled = body.includes('DEFAULT_NO') || body.includes('approved_yes');
    return {
      live: !body.toLowerCase().includes('not yet deployed') && !body.toLowerCase().includes('404'),
      hasGateDecision: hasGattled,
      hint: 'When the greenfield is live, this skill extracts the per-variant gate ledger. Until G1/G2/G3 + treasury ATA clear, the surface is a placeholder and the agent should explain D1/D2/D3 instead of pretending to read the ledger.',
    };
  },
  getDrafts() {
    return Array.from(document.querySelectorAll('[data-draft-id]')).map(d => ({
      id: d.dataset?.draftId,
      recipient: d.querySelector('[data-recipient]')?.textContent?.trim(),
      tristate: d.dataset?.tristate,
      gate: d.dataset?.gate || 'review_required',
    }));
  },
};`,
    createdAt: '2026-07-11T00:00:00.000Z',
    lastUpdated: '2026-07-11T00:00:00.000Z',
  },
  {
    name: 'getrida-market',
    domainPatterns: ['market.getrida.work', 'getrida.work/market'],
    shortDescription: 'GetRida Market — listings, GRK metering',
    description: 'GetRida Market surface reader. Extracts listings and the GRK-metered access state. GRK masks COGS — the client never sees cost internals.',
    examples: "const listings = await browserjs(() => window.getridaMarket.getListings());",
    library: `window.getridaMarket = {
  getListings() {
    return Array.from(document.querySelectorAll('[data-listing-id], .listing-card')).map(l => ({
      id: l.dataset?.listingId,
      title: l.querySelector('h3, [data-title]')?.textContent?.trim(),
      price: l.querySelector('[data-price]')?.textContent?.trim(),
    }));
  },
  getMeteringState() {
    const el = document.querySelector('[data-grk-metering]');
    return {
      present: !!el,
      remaining: el?.dataset?.remaining || null,
      used: el?.dataset?.used || null,
    };
  },
};`,
    createdAt: '2026-07-11T00:00:00.000Z',
    lastUpdated: '2026-07-11T00:00:00.000Z',
  },
];

async function initializeDefaultSkills() {
  const data = await chrome.storage.local.get(SKILLS_KEY);
  const existing = data[SKILLS_KEY] || [];
  const skills = [...existing];
  let changed = false;
  for (const skill of DEFAULT_SKILLS) {
    if (!skills.find(s => s.name === skill.name)) {
      skills.push(skill);
      changed = true;
    }
  }
  if (changed) await chrome.storage.local.set({ [SKILLS_KEY]: skills });
}

async function getSkills() {
  const data = await chrome.storage.local.get(SKILLS_KEY);
  return data[SKILLS_KEY] || [];
}

async function getSkill(name) {
  const skills = await getSkills();
  return skills.find(s => s.name === name) || null;
}

async function saveSkill(skill) {
  const skills = await getSkills();
  const idx = skills.findIndex(s => s.name === skill.name);
  if (idx >= 0) skills[idx] = skill;
  else skills.push(skill);
  await chrome.storage.local.set({ [SKILLS_KEY]: skills });
  return { ok: true };
}

async function deleteSkill(name) {
  const skills = await getSkills();
  const filtered = skills.filter(s => s.name !== name);
  await chrome.storage.local.set({ [SKILLS_KEY]: filtered });
  return { ok: true };
}

function matchDomain(url, patterns) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return patterns.some(pattern => {
      const p = pattern.replace(/^www\./, '').replace(/\*/g, '.*');
      return new RegExp(p).test(hostname) || new RegExp(p).test(url);
    });
  } catch { return false; }
}

function getMatchingSkills(url) {
  return getSkills().then(skills => skills.filter(s => matchDomain(url, s.domainPatterns || [])));
}

function buildSkillsInjection(skills) {
  return skills.map(s => s.library).join('\n\n');
}

async function registerUserScript(skill) {
  const id = `getrida-skill-${skill.name.replace(/[^a-z0-9-]/g, '-')}`;
  const matches = (skill.domainPatterns || []).map(p => {
    p = p.replace(/^www\./, '').replace(/\*\*/g, '*');
    if (!p.includes('://')) p = `*://*.${p}/*`;
    if (!p.endsWith('/*') && !p.endsWith('*')) p = p.endsWith('/') ? `${p}*` : `${p}/*`;
    return p;
  });
  try {
    await chrome.userScripts.unregister({ ids: [id] });
  } catch {}
  await chrome.userScripts.register([{
    id,
    matches,
    js: [{ code: skill.library }],
    world: 'USER_SCRIPT',
    runAt: 'document_idle',
  }]);
  return id;
}

async function unregisterUserScript(skill) {
  const id = `getrida-skill-${skill.name.replace(/[^a-z0-9-]/g, '-')}`;
  try { await chrome.userScripts.unregister({ ids: [id] }); } catch {}
}

export {
  initializeDefaultSkills, getSkills, getSkill, saveSkill, deleteSkill,
  getMatchingSkills, matchDomain, buildSkillsInjection, DEFAULT_SKILLS, SKILLS_KEY,
  registerUserScript, unregisterUserScript,
};