import { normalizePreferences, buildHandoffPrompt, describeOpportunity } from './lib/matching.mjs';
import { createGitHubClient } from './lib/github.mjs';
const client = createGitHubClient();
const form = document.querySelector('#search-form');
const resultRoot = document.querySelector('#results');
const status = document.querySelector('#status');
const btn = document.querySelector('#find');
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function loadPreferences() {
  // No credentials, private agent history or hidden persistence are stored in this demo.
  try { const saved = JSON.parse(localStorage.getItem('contributor:preferences:v1') || 'null');
    if (!saved) return;
    form.elements.remember.checked = true;
    ['languages', 'interests', 'hours', 'level'].forEach(key => { if (form.elements[key] && saved[key] !== undefined) form.elements[key].value = key === 'languages' ? saved[key].join(', ') : saved[key]; });
  } catch {}
}
loadPreferences();
function preferences() {
  const data = new FormData(form);
  return normalizePreferences({ languages: String(data.get('languages') || '').split(','), interests: data.get('interests'), hours: data.get('hours'), level: data.get('level'), mode: data.get('mode') });
}
const SAVED_KEY = 'contributor:saved:v1';
// Saved opportunities live only in this browser's localStorage; nothing is sent to a server or an AI provider.
function readSaved() {
  try { const list = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); return Array.isArray(list) ? list.filter(x => x && typeof x.html_url === 'string') : []; }
  catch { return []; }
}
function writeSaved(list) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); return true; } catch { return false; } }
const isSaved = item => readSaved().some(x => x.html_url === item.html_url);
function snapshot(item) {
  const out = { html_url: item.html_url, title: item.title, full_name: item.full_name, _repoName: item._repoName, description: (item.description || item.body || '').replace(/\s+/g, ' ').slice(0, 235), _match: { score: item._match.score, reasons: item._match.reasons.slice(0, 3) }, savedAt: new Date().toISOString() };
  if (item.pull_request) out.pull_request = {};
  else if (item.repository_url) out.repository_url = item.repository_url;
  return out;
}
function toggleSaved(item) {
  const list = readSaved();
  const next = list.some(x => x.html_url === item.html_url) ? list.filter(x => x.html_url !== item.html_url) : [snapshot(item), ...list];
  return writeSaved(next) ? next.some(x => x.html_url === item.html_url) : null;
}
function card(item, p, i) {
  const kind = describeOpportunity(item);
  const match = item._match;
  const repo = item._repoName || item.full_name || 'GitHub';
  const href = /^https:\/\/github\.com\//.test(item.html_url) ? item.html_url : '#';
  const reasons = match.reasons.slice(0, 3).map(r => `<li>${escape(r)}</li>`).join('') || '<li>Matches the selected GitHub search criteria</li>';
  const summary = (item.description || item.body || '').replace(/\s+/g, ' ').slice(0, 235);
  return `<article class="result-card"><div class="result-top"><span class="result-kind">${escape(kind)}</span><span class="match"><b>${match.score}</b><small> / 100 relevance</small></span></div><h3>${escape(item.title || item.full_name || 'Untitled')}</h3><p class="repo-name">${escape(repo)}</p><p class="result-desc">${escape(summary || 'Open on GitHub to inspect details and contribution requirements.')}</p><ul class="reasons">${reasons}</ul><div class="result-bottom"><a href="${escape(href)}" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a><button type="button" class="save-toggle" data-index="${i}" aria-pressed="${isSaved(item)}">${isSaved(item) ? 'Saved ✓' : 'Save'}</button><button type="button" class="copy-prompt" data-index="${i}">Copy AI prompt <span>↗</span></button></div></article>`;
}
form.addEventListener('submit', async event => {
  event.preventDefault(); const p = preferences(); btn.disabled = true; btn.textContent = 'Searching GitHub…';
  status.textContent = 'Searching live GitHub repositories, issues and pull requests…'; resultRoot.replaceChildren();
  try {
    const result = await client.discover(p, { limit: 10 });
    const items = result.items.slice(0, 24);
    status.textContent = `${items.length} relevant public opportunities · Updated ${new Date(result.at).toLocaleTimeString()} · Scores indicate relevance, not success probability.${result.warnings.length ? ` Partial results: ${result.warnings.join('; ')}` : ''}`;
    if (!items.length) { resultRoot.innerHTML = '<div class="empty">No current matches. Try a different language, topic or discovery mode.</div>'; return; }
    resultRoot.innerHTML = items.map((x, i) => card(x, p, i)).join('');
    resultRoot.querySelectorAll('.copy-prompt').forEach(el => el.addEventListener('click', async () => {
      const index = Number(el.dataset.index);
      try { await navigator.clipboard.writeText(buildHandoffPrompt(items[index], p)); el.textContent = 'Copied ✓'; }
      catch { status.textContent = 'Clipboard unavailable; use an HTTPS origin or copy the GitHub link directly.'; }
    }));
    resultRoot.querySelectorAll('.save-toggle').forEach(el => el.addEventListener('click', () => {
      const saved = toggleSaved(items[Number(el.dataset.index)]);
      if (saved === null) { status.textContent = 'Saving unavailable: this browser blocked local storage.'; return; }
      el.textContent = saved ? 'Saved ✓' : 'Save'; el.setAttribute('aria-pressed', String(saved));
    }));
    try { if (form.elements.remember.checked) localStorage.setItem('contributor:preferences:v1', JSON.stringify(p)); else localStorage.removeItem('contributor:preferences:v1'); } catch {}
  } catch (err) {
    status.textContent = `Search unavailable: ${err instanceof Error ? err.message : 'Unknown error'}. Try again later or use GitHub Search directly.`;
    resultRoot.innerHTML = `<div class="empty"><a href="https://github.com/search?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22&type=issues" target="_blank" rel="noopener noreferrer">Continue searching on GitHub ↗</a></div>`;
  } finally { btn.disabled = false; btn.innerHTML = 'Discover opportunities <span>→</span>'; }
});
