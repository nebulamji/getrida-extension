// The client launcher (toolbar button). With a GetRida key: research your tabs (opens the side
// panel), send this page to Rida, what's waiting for approval, and the workspace. Without a key:
// connect it in the side panel. The older tab-compiler popup shows only in developer mode.
const PORTAL = 'https://portal-beta.getrida.work';
document.addEventListener('DOMContentLoaded', async () => {
  const st = await chrome.storage.local.get(['getrida_grk_key', 'getrida_dev_mode', 'getrida_provider_config', 'getrida_endpoint']);
  if (st.getrida_dev_mode) return;
  const key = st.getrida_grk_key || (st.getrida_provider_config?.apiKey?.startsWith('grk_') ? st.getrida_provider_config.apiKey : '');
  document.body.classList.add('client');
  const $ = (id) => document.getElementById(id);
  const openPanel = async () => { try { const w = await chrome.windows.getCurrent(); await chrome.sidePanel.open({ windowId: w.id }); window.close(); } catch (e) { $('clStatus').textContent = 'Open the GetRida side panel from the extensions menu.'; } };
  const tabs = (await chrome.tabs.query({ currentWindow: true })).filter((t) => /^https?:/.test(t.url || ''));
  $('clTabs').textContent = `${tabs.length} tab${tabs.length === 1 ? '' : 's'} open in this window`;
  if (!key) {
    $('clNoKey').style.display = 'block';
    $('clConnect').addEventListener('click', openPanel);
    return;
  }
  $('clMain').style.display = 'block';
  $('clResearch').addEventListener('click', openPanel);
  $('clWorkspace').addEventListener('click', () => chrome.tabs.create({ url: PORTAL }));
  $('clCapture').addEventListener('click', () => {
    $('clCapture').disabled = true; $('clStatus').textContent = 'Reading and sorting…';
    chrome.runtime.sendMessage({ action: 'capture_tab', note: '' }, (r) => {
      $('clCapture').disabled = false;
      $('clStatus').textContent = r?.ok ? `Saved to Intake${r.capture?.kind ? ` as ${r.capture.kind}` : ''}.${r.capture?.suggested_action ? ` Next: ${r.capture.suggested_action}` : ''}` : (r?.error || "Couldn't send it.");
    });
  });
  try {
    const base = (st.getrida_endpoint || '').replace(/\/api\/v1\/compile$/, '').replace(/\/+$/, '');
    const r = await fetch(`${base && !/^https:\/\/getrida\.work$/.test(base) ? base : 'https://app.getrida.work'}/api/envoy/gate/pending`, { headers: { authorization: `Bearer ${key}` } });
    const n = r.ok ? ((await r.json()).decisions || []).length : 0;
    if (n) { const b = $('clApprovals'); b.style.display = 'block'; b.textContent = `${n} message${n === 1 ? '' : 's'} waiting for your approval →`; b.addEventListener('click', () => chrome.tabs.create({ url: `${PORTAL}/#approvals` })); }
  } catch (e) { /* offline: the rest still works */ }
});
