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
    <div class="panel-kind"><span class="result-kind">${escape(kind)}</span><span class="match">${match.score} / 100</span></div>
    <h3 class="panel-title" id="panel-title">${escape(item.title || item.full_name || 'Untitled')}</h3>
    ${stats ? `<p class="panel-stats">${stats}</p>` : ''}
    ${license || activity ? `<div class="panel-meta">${license}${activity}</div>` : ''}
    ${labels.length ? `<div class="labels">${labels.map(l => `<span class="badge">${escape(l)}</span>`).join('')}</div>` : ''}
    <div class="panel-section"><h4>Description</h4><p>${escape(description || 'No description provided. Open on GitHub to inspect details.')}</p></div>
    ${reasons ? `<div class="panel-section"><h4>Why it matches</h4><ul class="reasons">${reasons}</ul></div>` : ''}
    ${warning}${notes.map(n => `<p class="panel-note">${escape(n)}</p>`).join('')}
    <div class="panel-actions"><a class="btn btn-primary" href="${escape(href)}" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a><button type="button" class="btn btn-text" id="panel-copy">Copy AI prompt</button></div>`;
}
function openPanel(item, p) {
  panelReturnFocus = document.activeElement;
  panelBody.innerHTML = detailHtml(item);
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
  setTimeout(() => { if (!panel.classList.contains('open')) panelBackdrop.hidden = true; }, 200);
  if (panelReturnFocus?.isConnected) panelReturnFocus.focus();
}
panelClose.addEventListener('click', closePanel);
panelBackdrop.addEventListener('click', closePanel);
document.addEventListener('keydown', event => {
  if (!panel.classList.contains('open')) return;
  if (event.key === 'Escape') { closePanel(); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...panel.querySelectorAll('a[href], button')];
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
function renderSaved() {
  const list = readSaved();
  if (!list.length) { resultRoot.innerHTML = '<div class="empty">Nothing saved yet. Use Save on a result to keep it on this device.</div>'; return; }
  visibleItems = list; visiblePrefs = null;
  resultRoot.innerHTML = list.map((x, i) => card(x, null, i, true)).join('');
  staggerCards();
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

// Example chips pre-fill the filter fields and run the search immediately.
document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
  if (btn.disabled) return;
  form.elements.languages.value = chip.dataset.languages;
  form.elements.interests.value = chip.dataset.interests;
  form.elements.level.value = chip.dataset.level;
  form.requestSubmit();
}));

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
    // Don't clobber a search that finished or started while the sign-in check was in flight.
    if (!lastResults && !btn.disabled) status.textContent = proxyNote;
  } catch {}
}
initAuth();
