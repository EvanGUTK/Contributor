import { normalizePreferences, buildHandoffPrompt, describeOpportunity } from './lib/matching.mjs';
import { createGitHubClient } from './lib/github.mjs';
// Direct anonymous calls by default; initAuth() sets proxyClient once a signed-in session is confirmed.
// A failed proxy search clears proxyClient so later searches go direct.
const directClient = createGitHubClient();
let proxyClient = null;
let proxyNote = '';
// Stays true for the page's life once sign-in is confirmed, even if proxyClient is cleared after a proxy failure.
let signedIn = false;
const form = document.querySelector('#search-form');
const resultRoot = document.querySelector('#results');
const status = document.querySelector('#status');
const btn = document.querySelector('#find');
const savedToggle = document.querySelector('#saved-toggle');
const clearSaved = document.querySelector('#clear-saved');
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Issue and PR bodies are raw markdown/HTML. Reduce them to plain text for display; the result is still passed through escape() when rendered.
const DESCRIPTION_LIMIT = 160;
function stripMarkdown(text, limit = DESCRIPTION_LIMIT) {
  const plain = String(text ?? '')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/```[\s\S]*?(?:```|$)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s*/gm, ' ')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/\*(?=\S)([^*\n]*?\S)\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > limit ? `${plain.slice(0, limit - 1).trimEnd()}…` : plain;
}
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
  const out = { html_url: item.html_url, title: item.title, full_name: item.full_name, _repoName: item._repoName, description: stripMarkdown(item.description || item.body || '', 600),
    _match: { score: item._match.score, reasons: item._match.reasons.slice(0, 8), safetyFlags: item._match.safetyFlags, calibration: item._match.calibration }, savedAt: new Date().toISOString() };
  for (const key of ['stargazers_count', 'forks_count', 'open_issues_count', 'language', 'pushed_at', 'updated_at']) if (item[key] != null) out[key] = item[key];
  if (item.license?.spdx_id) out.license = { spdx_id: item.license.spdx_id };
  if (Array.isArray(item.labels)) out.labels = item.labels.slice(0, 8).map(x => ({ name: typeof x === 'string' ? x : x?.name })).filter(x => x.name);
  if (item.pull_request) out.pull_request = {};
  else if (item.repository_url) out.repository_url = item.repository_url;
  return out;
}
function toggleSaved(item) {
  const list = readSaved();
  const next = list.some(x => x.html_url === item.html_url) ? list.filter(x => x.html_url !== item.html_url) : [snapshot(item), ...list];
  return writeSaved(next) ? next.some(x => x.html_url === item.html_url) : null;
}
// Rough hint only: ~4 characters per token. Computed locally; no tokenizer or network call.
function estimateTokens(text) { return Math.ceil(text.length / 4); }
function byokNote(item, p) {
  let tokens;
  try { tokens = estimateTokens(buildHandoffPrompt(item, p)); } catch { return ''; }
  return `<p class="byok-note">Prompt ~${tokens.toLocaleString('en-US')} tokens est. · Your AI provider bills you directly · Contributor charges nothing</p>`;
}
// Read once per call so a mid-session OS setting change is honoured.
const okToAnimate = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CARD_STAGGER_MS = 60;
// Fade cards in one after another. Inline styles are cleared afterwards so the stylesheet's hover transitions apply again.
function staggerCards() {
  if (!okToAnimate()) return;
  const cards = [...resultRoot.querySelectorAll('.result-card')];
  cards.forEach(el => { el.style.opacity = '0'; el.style.transform = 'translateY(12px)'; el.style.transition = 'opacity 0.3s ease, transform 0.3s ease'; });
  void resultRoot.offsetHeight; // commit the start state before transitioning
  cards.forEach((el, i) => {
    setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; }, i * CARD_STAGGER_MS);
    el.addEventListener('transitionend', function done(event) {
      if (event.target !== el) return; // ignore transitions bubbling up from the card's buttons
      el.removeEventListener('transitionend', done);
      el.style.removeProperty('opacity'); el.style.removeProperty('transform'); el.style.removeProperty('transition');
    });
  });
}
const COPY_LABEL = 'Copy AI prompt <span>↗</span>';
const COPIED_RESET_MS = 2000;
function card(item, p, i, saved = false) {
  const kind = describeOpportunity(item).replace(' opportunity', '');
  const match = item._match;
  const repo = item._repoName || item.full_name || 'GitHub';
  const href = /^https:\/\/github\.com\//.test(item.html_url) ? item.html_url : '#';
  const reasons = match.reasons.slice(0, 3).map(r => `<li>${escape(r)}</li>`).join('') || '<li>Matches the selected GitHub search criteria</li>';
  const summary = stripMarkdown(item.description || item.body || '');
  const warning = match.safetyFlags?.disclaimer ? `<p class="card-warning">⚠ ${escape(match.safetyFlags.disclaimer)}</p>` : '';
  const viewLink = `<a class="btn btn-ghost" href="${escape(href)}" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a>`;
  const actions = saved
    ? `${viewLink}<button type="button" class="remove-saved" data-index="${i}" aria-label="Remove ${escape(item.title || item.full_name || 'opportunity')} from saved">Remove</button>`
    : `<button type="button" class="btn btn-primary copy-prompt" data-index="${i}" data-tooltip="Paste into Claude, Codex or Hermes to start contributing">${COPY_LABEL}</button><button type="button" class="save-toggle" data-index="${i}" aria-pressed="${isSaved(item)}">${isSaved(item) ? 'Saved ✓' : 'Save'}</button>${viewLink}`;
  return `<article class="result-card" data-index="${i}" tabindex="0" aria-haspopup="dialog"><div class="result-top"><span class="result-kind">${escape(kind)}</span><span class="match" title="Relevance score out of 100, not a success probability">${match.score} / 100</span></div><h3>${escape(item.title || item.full_name || 'Untitled')}</h3><p class="repo-name">${escape(repo)}</p><p class="result-desc">${escape(summary || 'Open on GitHub to inspect details and contribution requirements.')}</p><ul class="reasons">${reasons}</ul><div class="card-spacer"></div><div class="result-bottom">${actions}</div>${warning}${saved ? '' : byokNote(item, p)}</article>`;
}

// Detail panel. Shows only what the item already carries: issues and reviews have no star data, so those rows are omitted.
const panel = document.querySelector('#detail-panel');
const panelBody = document.querySelector('#panel-body');
const panelBackdrop = document.querySelector('#panel-backdrop');
const panelClose = document.querySelector('#panel-close');
let panelReturnFocus = null;
const fmt = n => Number(n).toLocaleString('en-US');
function relativeTime(value) {
  const then = Date.parse(value || '');
  if (!Number.isFinite(then)) return '';
  const days = Math.max(0, Math.floor((Date.now() - then) / 86400000));
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) { const m = Math.floor(days / 30); return `${m} month${m === 1 ? '' : 's'} ago`; }
  const y = Math.floor(days / 365); return `${y} year${y === 1 ? '' : 's'} ago`;
}
function detailHtml(item) {
  const match = item._match;
  const kind = describeOpportunity(item).replace(' opportunity', '');
  const repo = item._repoName || item.full_name || '';
  const [owner, name] = repo.split('/');
  const validOwner = owner && name && /^[\w.-]+$/.test(owner);
  const href = /^https:\/\/github\.com\//.test(item.html_url) ? item.html_url : '#';
  const header = validOwner
    ? `<div class="panel-head"><img src="https://github.com/${encodeURIComponent(owner)}.png?size=40" width="40" height="40" alt="" referrerpolicy="no-referrer" /><div><p class="panel-owner">${escape(owner)}</p><p class="panel-repo">${escape(name)}</p></div></div>`
    : `<div class="panel-head"><div><p class="panel-repo">${escape(repo || 'GitHub')}</p></div></div>`;
  const stats = [
    item.stargazers_count != null && `⭐ ${fmt(item.stargazers_count)}`,
    item.forks_count != null && `🍴 ${fmt(item.forks_count)}`,
    item.open_issues_count != null && `🐛 ${fmt(item.open_issues_count)}`,
    item.language && escape(item.language),
  ].filter(Boolean).join(' · ');
  const license = item.license?.spdx_id && item.license.spdx_id !== 'NOASSERTION' ? `<span class="badge">${escape(item.license.spdx_id)}</span>` : '';
  const activityAt = item.pushed_at || item.updated_at;
  const activity = relativeTime(activityAt) ? `<span>${item.pushed_at ? 'Last pushed' : 'Last updated'} ${relativeTime(activityAt)}</span>` : '';
  const labels = (item.labels || []).map(x => typeof x === 'string' ? x : x?.name).filter(Boolean).slice(0, 8);
  const description = stripMarkdown(item.description || item.body || '', 1200);
  const reasons = (match.reasons || []).map(r => `<li>${escape(r)}</li>`).join('');
  const notes = [];
  if (match.calibration?.interestOnly) notes.push('Interest-led match: your level is set to beginner, so this ranks topic fit over difficulty.');
  if (match.calibration?.quickTask) notes.push('Quick-task match: your level is advanced with a short time budget, so large tasks rank lower.');
  const warning = match.safetyFlags?.outsideReviewWelcome === false
    ? `<div class="panel-warning" role="note"><strong>⚠ Outside reviews may not be welcome</strong>${escape(match.safetyFlags.disclaimer || 'Check CONTRIBUTING.md before commenting.')}</div>` : '';
  return `${header}
    <div class="panel-kind"><span class="result-kind">${escape(kind)}</span><span class="match"><span class="panel-score">${match.score}</span> / 100</span></div>
    <h3 class="panel-title" id="panel-title">${escape(item.title || item.full_name || 'Untitled')}</h3>
    ${stats ? `<p class="panel-stats">${stats}</p>` : ''}
    ${license || activity ? `<div class="panel-meta">${license}${activity}</div>` : ''}
    ${labels.length ? `<div class="labels">${labels.map(l => `<span class="badge">${escape(l)}</span>`).join('')}</div>` : ''}
    <div class="panel-section"><h4>Description</h4><p>${escape(description || 'No description provided. Open on GitHub to inspect details.')}</p></div>
    ${reasons ? `<div class="panel-section"><h4>Why it matches</h4><ul class="reasons">${reasons}</ul></div>` : ''}
    <div class="panel-section panel-explain" id="panel-explain"></div>
    ${warning}${notes.map(n => `<p class="panel-note">${escape(n)}</p>`).join('')}
    <div class="panel-section panel-similar" id="panel-similar" hidden></div>
    ${kind === 'Issue' && validOwner && /^[\w.-]+$/.test(name) ? `<div class="panel-section panel-starter" id="panel-starter"><h4><button type="button" class="starter-toggle" id="starter-toggle" aria-expanded="false" aria-controls="starter-body"><span class="starter-chevron" aria-hidden="true">▶</span> Starter Pack</button></h4><div class="starter-body" id="starter-body"></div></div>` : ''}
    <div class="panel-actions"><a class="btn btn-primary" href="${escape(href)}" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a><button type="button" class="btn btn-text" id="panel-copy">Copy AI prompt</button></div>`;
}
// Count a number up from 0 with an ease-out curve. The final value is already in the markup, so skipping is safe.
function animateCount(el, target, duration = 600) {
  if (!el || !Number.isFinite(target) || !okToAnimate()) return;
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(Math.pow(progress, 0.5) * target);
    if (progress < 1) requestAnimationFrame(tick);
  }
  el.textContent = '0';
  requestAnimationFrame(tick);
}
// Similar issues: one anonymous GitHub search per opened issue. Any failure (rate limit, network, bad payload) leaves the section hidden.
const SIMILAR_LIMIT = 3;
let similarRequest = 0;
function similarLabel(item) {
  const labels = (item.labels || []).map(x => typeof x === 'string' ? x : x?.name).filter(Boolean);
  return labels.find(l => /^(good first issue|help wanted)$/i.test(l)) || labels[0] || '';
}
// Issues carry no language of their own; fall back to the match reason, then the searcher's first language.
function similarLanguage(item, p) {
  const fromReason = (item._match?.reasons || []).map(r => /^Matches your (.+) preference$/.exec(r)?.[1]).find(Boolean);
  return item.language || fromReason || p?.languages?.[0] || '';
}
const qualifier = (key, value) => `${key}:${/\s/.test(value) ? `"${value.replace(/"/g, '')}"` : value}`;
async function loadSimilar(item, p) {
  const request = ++similarRequest;
  const label = similarLabel(item);
  if (describeOpportunity(item) !== 'Issue' || !label) return;
  const language = similarLanguage(item, p);
  const q = ['is:issue', 'is:open', qualifier('label', label), language && qualifier('language', language)].filter(Boolean).join(' ');
  try {
    const res = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=4&sort=updated`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    const data = await res.json();
    const similar = (Array.isArray(data?.items) ? data.items : [])
      .filter(x => typeof x?.html_url === 'string' && /^https:\/\/github\.com\//.test(x.html_url) && x.html_url !== item.html_url)
      .slice(0, SIMILAR_LIMIT);
    const root = panelBody.querySelector('#panel-similar');
    if (request !== similarRequest || !similar.length || !root) return; // the panel moved on to another item
    root.innerHTML = `<h4>Similar issues</h4><ul class="similar-list">${similar.map(x => {
      const repo = String(x.repository_url || '').replace(/^https:\/\/api\.github\.com\/repos\//, '');
      return `<li><a href="${escape(x.html_url)}" target="_blank" rel="noopener noreferrer"><span class="similar-repo">${escape(repo)}</span> ${escape(x.title || 'Untitled')}</a></li>`;
    }).join('')}</ul>`;
    root.hidden = false;
  } catch {}
}
// BYOK match explanation (requires GitHub sign-in). The key goes from the input field straight to the Worker's
// /api/byok/save, which stores it encrypted server-side and makes the provider call; the browser never stores,
// receives or renders it. Only { hasKey, provider } comes back.
const EXPLAIN_ERROR = 'Could not explain — check your API key or try again.';
const EXPLAIN_PROMPT_LIMIT = 500;
const PROVIDER_NAMES = { openai: 'OpenAI', anthropic: 'Anthropic' };
let explainRequest = 0;
// { hasKey, provider } for the signed-in user once /api/byok/status answers; null while unknown.
let byokStatus = null;
// Re-renders the open panel's key status when byokStatus changes; replaced by each initExplain().
let onByokStatus = () => {};
// Keys saved by the earlier localStorage implementation are purged on load.
try { localStorage.removeItem('contributor:byok:key'); } catch {}
async function byokFetch(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${AUTH_BASE}/api/byok/${path}`, { method, credentials: 'include', headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}
async function loadByokStatus() {
  try {
    const { ok, data } = await byokFetch('status');
    byokStatus = ok && typeof data?.hasKey === 'boolean' ? { hasKey: data.hasKey, provider: data.provider ?? null } : null;
  } catch { byokStatus = null; }
  onByokStatus();
  return byokStatus;
}
function buildExplainPrompt(item, prefs) {
  const list = value => (Array.isArray(value) ? value.join(', ') : String(value ?? '')).slice(0, 80);
  const kind = describeOpportunity(item).replace(' opportunity', '').toLowerCase();
  const title = String(item.title || item.full_name || '').slice(0, 120);
  const repo = String(item._repoName || item.full_name || '').slice(0, 100);
  // The Worker rejects prompts over EXPLAIN_PROMPT_LIMIT characters.
  return `In 2 sentences, explain why this GitHub ${kind} is a good match for someone with these preferences: languages: ${list(prefs.languages)}, interests: ${list(prefs.interests)}, level: ${prefs.level}. Issue: ${title} in ${repo}. Be specific and encouraging.`.slice(0, EXPLAIN_PROMPT_LIMIT);
}
function initExplain(item, p) {
  const root = panelBody.querySelector('#panel-explain');
  if (!root) return;
  const prefs = p || preferences();
  root.innerHTML = `<h4>AI explanation</h4>
    <div class="explain-row"><button type="button" class="btn btn-text explain-btn" id="explain-btn">✦ Explain this match</button><span class="byok-key" id="byok-key"></span></div>
    <form class="byok-form" id="byok-form" hidden autocomplete="off">
      <label for="byok-input">OpenAI or Anthropic API key</label>
      <input id="byok-input" type="password" placeholder="sk-... or sk-ant-..." spellcheck="false" autocapitalize="off" />
      <p class="byok-help" id="byok-help"></p>
      <div class="byok-form-actions"><button type="submit" class="btn btn-primary" id="byok-save">Save</button><button type="button" class="btn btn-text" id="byok-cancel">Cancel</button></div>
    </form>
    <div class="explain-output" id="explain-output" aria-live="polite"></div>
    <p class="explain-disclaimer">Explanation generated by your AI provider. Contributor charges nothing.</p>`;
  const explainBtn = root.querySelector('#explain-btn');
  const keyStatus = root.querySelector('#byok-key');
  const keyForm = root.querySelector('#byok-form');
  const keyInput = root.querySelector('#byok-input');
  const keyHelp = root.querySelector('#byok-help');
  const saveBtn = root.querySelector('#byok-save');
  const output = root.querySelector('#explain-output');
  const KEY_HELP = 'Sent once over HTTPS to Contributor’s sign-in Worker, stored encrypted for 30 days and never returned to your browser. Your AI provider bills you directly.';
  const signInHtml = `<p class="byok-signin">Sign in with GitHub to use AI explanations. <a href="${escape(AUTH_BASE)}/auth/login">Sign in →</a></p>`;
  let explainAfterSave = false;
  function showKeyStatus() {
    if (!root.isConnected) return;
    if (!signedIn) { keyStatus.textContent = ''; return; }
    if (!byokStatus) { keyStatus.textContent = ''; return; }
    keyStatus.innerHTML = byokStatus.hasKey
      ? `API key saved ✓${PROVIDER_NAMES[byokStatus.provider] ? ` (${PROVIDER_NAMES[byokStatus.provider]})` : ''} · <button type="button" class="link-btn" id="byok-change">Change</button> · <button type="button" class="link-btn" id="byok-delete">Delete key</button>`
      : `No key saved · <button type="button" class="link-btn" id="byok-change">Add key</button>`;
    keyStatus.querySelector('#byok-change')?.addEventListener('click', () => openKeyForm(false));
    keyStatus.querySelector('#byok-delete')?.addEventListener('click', deleteKey);
  }
  onByokStatus = showKeyStatus;
  function setHelp(text, invalid = false) { keyHelp.textContent = text; keyHelp.classList.toggle('byok-invalid', invalid); }
  function openKeyForm(thenExplain) {
    explainAfterSave = thenExplain;
    setHelp(KEY_HELP);
    keyForm.hidden = false;
    keyInput.focus();
  }
  function closeKeyForm() { keyInput.value = ''; keyForm.hidden = true; }
  function finish(request, html) {
    if (request !== explainRequest || !root.isConnected) return; // the panel moved on to another item
    output.innerHTML = html;
    explainBtn.disabled = false;
    explainBtn.removeAttribute('aria-busy');
  }
  async function explain() {
    if (!signedIn) { output.innerHTML = signInHtml; return; }
    if (!byokStatus) await loadByokStatus();
    if (!root.isConnected) return;
    if (!byokStatus?.hasKey) { openKeyForm(true); return; }
    const request = ++explainRequest;
    explainBtn.disabled = true;
    explainBtn.setAttribute('aria-busy', 'true');
    output.innerHTML = '<p class="explain-loading"><span class="spinner" aria-hidden="true"></span> Asking your AI provider…</p>';
    let result;
    try { result = await byokFetch('explain', { method: 'POST', body: { prompt: buildExplainPrompt(item, prefs) } }); } catch { result = null; }
    const { ok, status, data } = result || {};
    if (ok && typeof data?.explanation === 'string') return finish(request, `<blockquote class="explain-quote">${escape(data.explanation)}</blockquote>`);
    if (status === 401) return finish(request, signInHtml); // session expired
    if (data?.error === 'no_key') {
      byokStatus = { hasKey: false, provider: null };
      showKeyStatus();
      finish(request, '');
      if (request === explainRequest && root.isConnected) openKeyForm(true);
      return;
    }
    finish(request, `<p class="explain-error">${data?.error === 'key_rejected' ? 'Your AI provider rejected the saved key. Change it and try again.' : EXPLAIN_ERROR}</p>`);
  }
  async function deleteKey() {
    let ok = false;
    try { ({ ok } = await byokFetch('delete', { method: 'DELETE' })); } catch {}
    if (!root.isConnected) return;
    if (!ok) { output.innerHTML = '<p class="explain-error">Could not delete the key. Try again.</p>'; return; }
    byokStatus = { hasKey: false, provider: null };
    output.innerHTML = '<p class="explain-loading">API key deleted.</p>';
    showKeyStatus();
    explainBtn.focus();
  }
  explainBtn.addEventListener('click', explain);
  root.querySelector('#byok-cancel').addEventListener('click', () => { closeKeyForm(); explainBtn.focus(); });
  keyForm.addEventListener('submit', async event => {
    event.preventDefault();
    const key = keyInput.value.trim();
    keyInput.value = ''; // the key is never kept client-side, not even in the field
    if (!key.startsWith('sk-')) { setHelp('Enter an OpenAI (sk-…) or Anthropic (sk-ant-…) API key.', true); keyInput.focus(); return; }
    saveBtn.disabled = true;
    setHelp('Saving…');
    let result;
    try { result = await byokFetch('save', { method: 'POST', body: { key } }); } catch { result = null; }
    saveBtn.disabled = false;
    if (!root.isConnected) return;
    if (!result?.ok || result.data?.saved !== true) {
      setHelp(result?.status === 401 ? 'Your GitHub sign-in expired. Sign in again to save a key.' : typeof result?.data?.message === 'string' ? result.data.message : 'Could not save the key. Try again.', true);
      keyInput.focus();
      return;
    }
    byokStatus = { hasKey: true, provider: key.startsWith('sk-ant-') ? 'anthropic' : 'openai' };
    closeKeyForm();
    showKeyStatus();
    explainBtn.focus();
    if (explainAfterSave) explain();
  });
  showKeyStatus();
}
// Contribution starter pack for issues: a setup checklist inferred from the repo's root files and up to 3 recently
// merged PRs. Both are read-only GitHub calls made only when the section is first expanded; failures degrade silently.
const MERGED_PR_LIMIT = 3;
let starterRequest = 0;
// Signed-in users read through the proxy (higher rate limit); any proxy failure retries once with direct anonymous calls.
async function githubRead(read) {
  if (proxyClient) { try { return await read(proxyClient); } catch {} }
  return read(directClient);
}
function setupChecklist(files, repoUrl, issueUrl) {
  const names = new Set((files || []).map(f => String(f?.name || '').toLowerCase()));
  const steps = [`Clone the repo: <code>git clone ${escape(repoUrl)}</code>`];
  if (names.has('package.json')) steps.push('Install deps: <code>npm install</code>');
  if (names.has('requirements.txt')) steps.push('Install deps: <code>pip install -r requirements.txt</code>');
  else if (names.has('pyproject.toml')) steps.push('Install deps: <code>pip install -e .</code>');
  if (names.has('cargo.toml')) steps.push('Build: <code>cargo build</code>');
  if (names.has('makefile')) steps.push('Run: <code>make</code>');
  if (names.has('contributing.md')) steps.push(`Read <a href="${escape(repoUrl)}/blob/HEAD/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">CONTRIBUTING.md ↗</a>`);
  steps.push(`Find the issue: <a href="${escape(issueUrl)}" target="_blank" rel="noopener noreferrer">${escape(issueUrl.replace('https://github.com/', ''))} ↗</a>`);
  return `<ul class="starter-checklist">${steps.map(s => `<li><label><input type="checkbox" /><span>${s}</span></label></li>`).join('')}</ul>`;
}
function mergedPrList(pulls) {
  const merged = (Array.isArray(pulls) ? pulls : [])
    .filter(pr => pr?.merged_at && typeof pr.html_url === 'string' && /^https:\/\/github\.com\//.test(pr.html_url))
    .slice(0, MERGED_PR_LIMIT);
  if (!merged.length) return '<p class="starter-empty">No recently merged PRs found.</p>';
  return `<ul class="starter-prs">${merged.map(pr => `<li><a href="${escape(pr.html_url)}" target="_blank" rel="noopener noreferrer">${escape(pr.title || 'Untitled')}</a> <span class="starter-when">· merged ${escape(relativeTime(pr.merged_at))}</span></li>`).join('')}</ul>`;
}
async function loadStarterPack(body, owner, name, issueUrl) {
  const request = ++starterRequest;
  const repoUrl = `https://github.com/${owner}/${name}`;
  body.innerHTML = `<div class="starter-inner"><h5>Setup checklist</h5><div id="starter-setup"><p class="starter-empty">Loading…</p></div><div id="starter-prs-section"><h5>Example merged PRs</h5><div id="starter-prs"><p class="starter-empty">Loading…</p></div></div></div>`;
  const stale = () => request !== starterRequest || !body.isConnected; // the panel moved on to another item
  // Each half renders as soon as its own request settles. Without a file listing the checklist still offers the steps that need no repo knowledge.
  githubRead(client => client.getRepoFiles(owner, name)).catch(() => null).then(files => {
    if (!stale()) body.querySelector('#starter-setup').innerHTML = setupChecklist(files, repoUrl, issueUrl);
  });
  // sort=updated defaults to ascending, so ask for newest first explicitly.
  githubRead(client => client.request(`/repos/${owner}/${name}/pulls?state=closed&sort=updated&direction=desc&per_page=10`)).then(
    pulls => { if (!stale()) body.querySelector('#starter-prs').innerHTML = mergedPrList(pulls); },
    () => { if (!stale()) body.querySelector('#starter-prs-section')?.remove(); },
  );
}
// max-height animates between 0 and the measured content height, then lifts the cap so content loaded later is never clipped.
function setStarterOpen(body, open) {
  body.style.maxHeight = `${body.scrollHeight}px`;
  if (open) {
    body.classList.add('open');
    // No motion, or nothing to animate (transitionend would never fire): show at full height straight away.
    if (!okToAnimate() || !body.scrollHeight) { body.style.maxHeight = 'none'; return; }
    body.addEventListener('transitionend', function done(event) {
      if (event.target !== body || event.propertyName !== 'max-height') return;
      body.removeEventListener('transitionend', done);
      if (body.classList.contains('open')) body.style.maxHeight = 'none';
    });
  } else {
    void body.offsetHeight; // commit the measured height so the collapse animates from it
    body.classList.remove('open');
    body.style.maxHeight = '0px';
  }
}
function initStarterPack(item) {
  const toggle = panelBody.querySelector('#starter-toggle');
  const body = panelBody.querySelector('#starter-body');
  if (!toggle || !body) return;
  const [owner, name] = String(item._repoName || '').split('/');
  let loaded = false;
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    // Load first so the Loading… placeholders give setStarterOpen() a height to animate to.
    if (open && !loaded) {
      loaded = true;
      const issueUrl = /^https:\/\/github\.com\//.test(item.html_url) ? item.html_url : `https://github.com/${owner}/${name}/issues`;
      loadStarterPack(body, owner, name, issueUrl);
    }
    setStarterOpen(body, open);
  });
}
function openPanel(item, p) {
  panelReturnFocus = document.activeElement;
  panelBody.innerHTML = detailHtml(item);
  animateCount(panelBody.querySelector('.panel-score'), Number(item._match.score));
  loadSimilar(item, p);
  initExplain(item, p);
  initStarterPack(item);
  panel.setAttribute('aria-labelledby', 'panel-title');
  panel.removeAttribute('aria-label');
  panelBackdrop.hidden = false;
  panel.setAttribute('aria-hidden', 'false');
  document.body.classList.add('panel-open');
  requestAnimationFrame(() => { panel.classList.add('open'); panelBackdrop.classList.add('open'); panelClose.focus(); });
  const copy = panelBody.querySelector('#panel-copy');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(buildHandoffPrompt(item, p || preferences())); copy.textContent = 'Copied ✓'; }
    catch { status.textContent = 'Clipboard unavailable; use an HTTPS origin or copy the GitHub link directly.'; }
  });
}
function closePanel() {
  if (!panel.classList.contains('open')) return;
  panel.classList.remove('open'); panelBackdrop.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('panel-open');
  setTimeout(() => { if (!panel.classList.contains('open')) panelBackdrop.hidden = true; }, 250); // matches the backdrop fade in styles.css
  if (panelReturnFocus?.isConnected) panelReturnFocus.focus();
}
panelClose.addEventListener('click', closePanel);
panelBackdrop.addEventListener('click', closePanel);
document.addEventListener('keydown', event => {
  if (!panel.classList.contains('open')) return;
  if (event.key === 'Escape') { closePanel(); return; }
  if (event.key !== 'Tab') return;
  // Skip controls inside hidden or collapsed sections: they cannot take focus, so they must not anchor the trap.
  const focusable = [...panel.querySelectorAll('a[href], button, input')].filter(el => !el.disabled && !el.closest('[hidden]') &&getComputedStyle(el).visibility !== 'hidden');
  const first = focusable[0], last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
// Cards open the panel when clicked anywhere except their own links and buttons.
let visibleItems = [];
let visiblePrefs = null;
function openFromCard(event) {
  const cardEl = event.target.closest('.result-card');
  if (!cardEl || event.target.closest('a, button')) return;
  if (event.type === 'keydown' && (event.target !== cardEl || (event.key !== 'Enter' && event.key !== ' '))) return;
  event.preventDefault();
  const item = visibleItems[Number(cardEl.dataset.index)];
  if (item) openPanel(item, visiblePrefs);
}
resultRoot.addEventListener('click', openFromCard);
resultRoot.addEventListener('keydown', openFromCard);
let lastResults = null;
let viewingSaved = false;
function renderResults({ items, p }) {
  visibleItems = items; visiblePrefs = p;
  resultRoot.innerHTML = items.map((x, i) => card(x, p, i)).join('');
  staggerCards();
  resultRoot.querySelectorAll('.copy-prompt').forEach(el => el.addEventListener('click', async () => {
    const index = Number(el.dataset.index);
    try {
      await navigator.clipboard.writeText(buildHandoffPrompt(items[index], p));
      el.textContent = 'Copied ✓';
      clearTimeout(el.resetTimer);
      el.resetTimer = setTimeout(() => { el.innerHTML = COPY_LABEL; }, COPIED_RESET_MS);
    }
    catch { status.textContent = 'Clipboard unavailable; use an HTTPS origin or copy the GitHub link directly.'; }
  }));
  resultRoot.querySelectorAll('.save-toggle').forEach(el => el.addEventListener('click', () => {
    const saved = toggleSaved(items[Number(el.dataset.index)]);
    if (saved === null) { status.textContent = 'Saving unavailable: this browser blocked local storage.'; return; }
    el.textContent = saved ? 'Saved ✓' : 'Save'; el.setAttribute('aria-pressed', String(saved)); updateSavedBar();
  }));
}
// Staleness dots on saved issues and PRs. Checks at most STALE_CHECK_LIMIT items per render (anonymous limit is 60 req/hr); failures show no dot.
const STALE_CHECK_LIMIT = 5;
const STALE_DAYS = 30;
const ISSUE_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d+)(?:[/?#]|$)/;
let staleRender = 0;
function staleness(data) {
  if (data?.state === 'closed') return { kind: 'closed', label: 'This issue is closed' };
  const updated = Date.parse(data?.updated_at || '');
  if (data?.state === 'open' && Number.isFinite(updated) && Date.now() - updated > STALE_DAYS * 86400000) return { kind: 'stale', label: 'No activity in 30+ days' };
  return null;
}
function checkStaleness(list) {
  const render = ++staleRender;
  const targets = list.map((item, i) => ({ i, m: ISSUE_URL.exec(item.html_url) })).filter(x => x.m).slice(0, STALE_CHECK_LIMIT);
  targets.forEach(async ({ i, m: [, owner, repo, number] }) => {
    try {
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const state = staleness(await res.json());
      const title = resultRoot.querySelector(`.result-card[data-index="${i}"] h3`);
      if (!state || render !== staleRender || !viewingSaved || !title) return; // the saved list was re-rendered or left
      const dot = document.createElement('span');
      dot.className = `stale-dot stale-${state.kind}`;
      dot.title = state.label;
      dot.setAttribute('role', 'img');
      dot.setAttribute('aria-label', state.label);
      title.appendChild(dot);
    } catch {}
  });
}
function renderSaved() {
  const list = readSaved();
  if (!list.length) { resultRoot.innerHTML = '<div class="empty">Nothing saved yet. Use Save on a result to keep it on this device.</div>'; return; }
  visibleItems = list; visiblePrefs = null;
  resultRoot.innerHTML = list.map((x, i) => card(x, null, i, true)).join('');
  staggerCards();
  checkStaleness(list);
  resultRoot.querySelectorAll('.remove-saved').forEach(el => el.addEventListener('click', () => {
    const target = list[Number(el.dataset.index)];
    if (!writeSaved(readSaved().filter(x => x.html_url !== target.html_url))) status.textContent = 'Removing unavailable: this browser blocked local storage.';
    renderView();
  }));
}
function updateSavedBar() {
  const count = readSaved().length;
  savedToggle.textContent = viewingSaved ? `← Back to results` : `Saved (${count})`;
  savedToggle.setAttribute('aria-pressed', String(viewingSaved));
  clearSaved.hidden = !viewingSaved || !count;
}
function renderView() {
  closePanel();
  if (viewingSaved) renderSaved();
  else if (lastResults) renderResults(lastResults);
  else resultRoot.replaceChildren();
  updateSavedBar();
}
savedToggle.addEventListener('click', () => { viewingSaved = !viewingSaved; renderView(); });
clearSaved.addEventListener('click', () => {
  const count = readSaved().length;
  if (!count || !confirm(`Remove all ${count} saved opportunities from this device?`)) return;
  status.textContent = writeSaved([]) ? `Cleared ${count} saved ${count === 1 ? 'opportunity' : 'opportunities'}.` : 'Clearing unavailable: this browser blocked local storage.';
  renderView();
});
updateSavedBar();
form.addEventListener('submit', async event => {
  event.preventDefault(); const p = preferences(); btn.disabled = true; btn.textContent = 'Searching GitHub…';
  status.textContent = 'Searching live GitHub repositories, issues and pull requests…'; resultRoot.replaceChildren(); lastResults = null; viewingSaved = false; updateSavedBar();
  try {
    let result;
    if (proxyClient) {
      // discover() rewrites upstream failures (a proxy 401 included) into its own error, so don't inspect status codes: any proxy failure falls back to direct calls once.
      try { result = await proxyClient.discover(p, { limit: 10 }); }
      catch { proxyClient = null; proxyNote = 'Enhanced rate limits unavailable; sign in again to restore them.'; }
    }
    if (!result) result = await directClient.discover(p, { limit: 10 });
    const items = result.items.slice(0, 24);
    status.textContent = `${items.length} relevant public opportunities · Updated ${new Date(result.at).toLocaleTimeString()} · Scores indicate relevance, not success probability.${result.warnings.length ? ` Partial results: ${result.warnings.join('; ')}` : ''}${proxyNote ? ` ${proxyNote}` : ''}`;
    if (!items.length) { resultRoot.innerHTML = '<div class="empty">No current matches. Try a different language, topic or discovery mode.</div>'; return; }
    lastResults = { items, p }; viewingSaved = false; renderView();
    try { if (form.elements.remember.checked) localStorage.setItem('contributor:preferences:v1', JSON.stringify(p)); else localStorage.removeItem('contributor:preferences:v1'); } catch {}
  } catch (err) {
    const fallback = `<div class="empty"><a href="https://github.com/search?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22&type=issues" target="_blank" rel="noopener noreferrer">Continue searching on GitHub ↗</a></div>`;
    if (err?.status === 403 || err?.status === 429) {
      // Rate limited. Anonymous users get a sign-in nudge (5,000 req/hr instead of 60); signed-in users already have the higher limit.
      if (signedIn) { status.textContent = 'GitHub rate limit reached. Try again in a few minutes.'; resultRoot.innerHTML = fallback; }
      else {
        status.textContent = '';
        resultRoot.innerHTML = `<div class="nudge" role="alert"><span class="nudge-icon" aria-hidden="true">⚡</span><div class="nudge-copy"><h3>Rate limited by GitHub</h3><p>Sign in with GitHub to get 5,000 requests per hour instead of 60.</p></div><a class="btn btn-primary" href="${escape(AUTH_BASE)}/auth/login">Sign in with GitHub →</a></div>${fallback}`;
      }
    } else {
      status.textContent = `Search unavailable: ${err instanceof Error ? err.message : 'Unknown error'}. Try again later or use GitHub Search directly.`;
      resultRoot.innerHTML = fallback;
    }
  } finally { btn.disabled = false; btn.innerHTML = 'Discover opportunities <span>→</span>'; }
});

// Ripple on primary buttons. Keyboard activation (detail 0) has no pointer position, so it starts from the centre.
document.addEventListener('click', event => {
  const target = event.target.closest('.btn-primary');
  if (!target || !okToAnimate()) return;
  const rect = target.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.detail ? event.clientX - rect.left : rect.width / 2;
  const y = event.detail ? event.clientY - rect.top : rect.height / 2;
  let host = target.querySelector(':scope > .btn-ripple-host');
  if (!host) { host = document.createElement('span'); host.className = 'btn-ripple-host'; host.setAttribute('aria-hidden', 'true'); target.appendChild(host); }
  const ripple = document.createElement('span');
  ripple.className = 'btn-ripple';
  Object.assign(ripple.style, { width: `${size}px`, height: `${size}px`, left: `${x - size / 2}px`, top: `${y - size / 2}px` });
  host.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
});

// Example chips pre-fill the filter fields and run the search immediately.
document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
  if (btn.disabled) return;
  form.elements.languages.value = chip.dataset.languages;
  form.elements.interests.value = chip.dataset.interests;
  form.elements.level.value = chip.dataset.level;
  form.requestSubmit();
}));

// One-click "Find me a PR to review" buttons.
function triggerReviewSearch() {
  if (btn.disabled) return;
  form.elements.mode.value = 'reviews';
  document.querySelector('input[name="mode"][value="reviews"]').checked = true;
  document.querySelector('#discover')?.scrollIntoView({ behavior: 'smooth' });
  form.requestSubmit();
}
document.getElementById('review-now-btn')?.addEventListener('click', triggerReviewSearch);
document.getElementById('quick-review-btn')?.addEventListener('click', triggerReviewSearch);

// Optional GitHub sign-in. The Worker owns the session cookie; this only reads the public identity.
// Any failure (Worker down, blocked, bad payload) leaves the auth UI hidden: sign-in is never required.
const AUTH_BASE = 'https://contributor-auth.evan-workspace.workers.dev';
const PROXY_BASE = `${AUTH_BASE}/api/github`;
const AVATAR_PREFIX = 'https://avatars.githubusercontent.com/';
async function initAuth() {
  const root = document.querySelector('#auth');
  const signIn = document.querySelector('#signin');
  const userBox = document.querySelector('#auth-user');
  if (!root || !signIn || !userBox) return;
  try {
    const res = await fetch(`${AUTH_BASE}/auth/user`, { credentials: 'include', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5000) });
    if (res.status === 401) {
      signIn.href = `${AUTH_BASE}/auth/login`; signIn.hidden = false; root.hidden = false;
      return;
    }
    if (!res.ok) return;
    const user = await res.json();
    if (user?.authenticated !== true || typeof user.login !== 'string' || !user.login) return;
    document.querySelector('#auth-name').textContent = user.login;
    const avatar = document.querySelector('#auth-avatar');
    if (typeof user.avatar_url === 'string' && user.avatar_url.startsWith(AVATAR_PREFIX)) avatar.src = user.avatar_url; else avatar.hidden = true;
    document.querySelector('#signout').href = `${AUTH_BASE}/auth/logout`;
    userBox.hidden = false; root.hidden = false;
    // Signed in: route GitHub calls through the Worker, which attaches the session's token (5000 req/hr instead of 60).
    signedIn = true;
    proxyClient = createGitHubClient({ proxyBase: PROXY_BASE });
    proxyNote = `✓ Signed in as ${user.login} · Enhanced rate limits active`;
    loadByokStatus();
    // Don't clobber a search that finished or started while the sign-in check was in flight.
    if (!lastResults && !btn.disabled) status.textContent = proxyNote;
  } catch {}
}
initAuth();
