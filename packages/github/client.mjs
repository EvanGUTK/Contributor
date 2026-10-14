/** Github public discovery: strictly read-only, bounded calls, transparent rate errors. */
import { buildSearchQuery, extractTopics, normalizePreferences, projectIdFromIssue, scoreOpportunity } from '../core/matching.mjs';
const API = 'https://api.github.com';
const MAX_ROOT_ENTRIES = 200;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;
/** Linked-PR lookups run at most this many at a time per discover() call. */
const MAX_PARALLEL_LOOKUPS = 5;
/** Star-count lookups for review results are optional; the whole stage gives up after this long so discovery is never held back. */
const REVIEW_LOOKUP_DEADLINE_MS = 8000;
/** Issues closed within this many days count toward maintainer close velocity. */
const RECENT_CLOSE_WINDOW_DAYS = 30;
const realSleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isRateLimited = status => status === 403 || status === 429;
const DRAFT_REVIEW_WARNING = 'Draft PR — not ready for review';

export class GitHubApiError extends Error {
  constructor(message, status, reset = null, retries = 0) { super(message); this.name = 'GitHubApiError'; this.status = status; this.reset = reset; this.retries = retries; }
}
/**
 * With `proxyBase` set, every call goes to `${proxyBase}?path=<endpoint>` with the browser's session cookie instead of
 * straight to api.github.com; the Worker adds the signed-in user's token, so no token is ever handled here.
 */
export function createGitHubClient({ fetchImpl = fetch, token = undefined, proxyBase = undefined, sleepFn = realSleep, onStatus = undefined, reviewLookupDeadlineMs = REVIEW_LOOKUP_DEADLINE_MS } = {}) {
  const cache = new Map();
  async function request(endpoint, { ttlMs = 8 * 60_000 } = {}) {
    if (!endpoint.startsWith('/')) throw new Error('Only relative GitHub REST API paths are allowed');
    const existing = cache.get(endpoint);
    if (existing && Date.now() - existing.when < ttlMs) return existing.data;
    // Through the proxy the Worker sets the API version and Authorization itself, so neither is sent from the browser.
    const headers = { Accept: 'application/vnd.github+json' };
    if (!proxyBase) headers['X-GitHub-Api-Version'] = '2022-11-28';
    if (token && !proxyBase) headers.Authorization = `Bearer ${token}`;
    // Stale entries are revalidated; GitHub answers 304 without counting against the rate limit.
    if (existing?.etag) headers['If-None-Match'] = existing.etag;
    let response;
    let retry = 0;
    // Exponential backoff (1s, 2s) on 403/429 before surfacing the rate-limit error.
    for (;; retry += 1) {
      const target = proxyBase ? `${proxyBase}?path=${encodeURIComponent(endpoint)}` : API + endpoint;
      response = await fetchImpl(target, { headers, signal: AbortSignal.timeout(12000), ...(proxyBase && { credentials: 'include' }) });
      if (!isRateLimited(response.status) || retry >= MAX_RETRIES) break;
      onStatus?.(`Rate limited, retrying (${retry + 1}/${MAX_RETRIES})...`);
      await sleepFn(BASE_DELAY_MS * 2 ** retry);
    }
    if (response.status === 304 && existing) {
      existing.when = Date.now();
      return existing.data;
    }
    if (!response.ok) {
      const reset = response.headers?.get('x-ratelimit-reset');
      const wait = reset ? ` Retry after ${new Date(Number(reset) * 1000).toLocaleTimeString()}.` : '';
      const tried = retry ? ` Gave up after ${retry}/${MAX_RETRIES} retries.` : '';
      const message = isRateLimited(response.status) ? `GitHub's rate limit or access policy blocked this search.${wait}${tried}` : `GitHub API returned ${response.status}.`;
      throw new GitHubApiError(message, response.status, reset, retry);
    }
    const data = await response.json();
    cache.set(endpoint, { when: Date.now(), data, etag: response.headers?.get('etag') || null });
    return data;
  }
  async function fetchSearch(kind, preferences, limit, options) {
    const q = buildSearchQuery(preferences, kind, options);
    const endpoint = kind === 'repositories' ? '/search/repositories' : '/search/issues';
    const data = await request(`${endpoint}?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=${Math.min(30, Math.max(1, limit))}`);
    return (data.items || []).slice(0, limit);
  }
  async function search(kind, preferences, limit = 15) {
    if (kind !== 'repositories') return fetchSearch(kind, preferences, limit);
    const p = normalizePreferences(preferences);
    const topics = extractTopics(p.interests);
    if (topics.length < 2) return fetchSearch(kind, p, limit, { topic: topics[0] });
    // One request per topic word; keep the set whose repositories match the profile best.
    const settled = await Promise.allSettled(topics.map(topic => fetchSearch(kind, p, limit, { topic })));
    const fulfilled = settled.filter(r => r.status === 'fulfilled').map(r => r.value);
    if (!fulfilled.length) throw settled[0].reason;
    const total = items => items.reduce((sum, item) => sum + scoreOpportunity(item, p).score, 0);
    return fulfilled.reduce((best, items) => (total(items) > total(best) ? items : best));
  }
  /**
   * True when an open PR mentions the issue URL in its body. GitHub's `linked:issue` qualifier only filters
   * PRs linked to *some* issue, so it cannot tell whether this one is covered; the body search can.
   * One result is enough; request() caches by endpoint, so repeated lookups cost nothing.
   */
  async function hasLinkedPullRequest(issue) {
    const repoName = projectIdFromIssue(issue);
    const issueUrl = String(issue.html_url || '');
    if (!repoName || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/.test(issueUrl)) return false;
    const q = `is:pr is:open repo:${repoName} "${issueUrl}" in:body`;
    const data = await request(`/search/issues?q=${encodeURIComponent(q)}&per_page=1`);
    return (data.items || []).length > 0;
  }
  /** Look up linked PRs with bounded concurrency; a failed lookup means "unknown" and never fails discovery. */
  async function markLinkedPullRequests(issues, warnings) {
    const linked = new Set();
    let failed = 0;
    const queue = [...issues];
    const worker = async () => {
      for (let issue = queue.shift(); issue; issue = queue.shift()) {
        try { if (await hasLinkedPullRequest(issue)) linked.add(issue); } catch { failed += 1; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_LOOKUPS, issues.length) }, worker));
    if (failed) warnings.push(`linked pull requests: could not check ${failed} issue${failed === 1 ? '' : 's'}; verify manually.`);
    return linked;
  }
  /**
   * Repository records for review results, keyed by "owner/name". GitHub's PR search cannot filter by stars, so the
   * star count comes from the repository itself. One cached lookup per distinct repository, bounded concurrency;
   * a failed lookup means "unknown" (never flagged as low) and never fails discovery.
   */
  async function lookupReviewRepos(reviews, known, warnings) {
    const found = new Map();
    const names = [...new Set(reviews.map(projectIdFromIssue).filter(name => name && !known.has(name)))];
    const queue = [...names];
    const worker = async () => {
      for (let name = queue.shift(); name; name = queue.shift()) {
        try { found.set(name, await getRepo(...name.split('/'))); } catch { /* unknown: counted as unchecked below */ }
      }
    };
    // Past the deadline, stop waiting and use whatever has arrived; late responses are ignored.
    let timer;
    const deadline = new Promise(resolve => { timer = setTimeout(resolve, reviewLookupDeadlineMs); });
    try {
      await Promise.race([Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_LOOKUPS, names.length) }, worker)), deadline]);
    } finally { clearTimeout(timer); }
    queue.length = 0;
    const unchecked = names.length - found.size;
    if (unchecked) warnings.push(`review safety: could not check star counts for ${unchecked} repositor${unchecked === 1 ? 'y' : 'ies'}; verify outside reviews are welcome.`);
    return new Map(found);
  }
  async function discover(preferences, { limit = 12 } = {}) {
    const p = normalizePreferences(preferences);
    const kinds = p.mode === 'all' ? ['repositories', 'issues', 'reviews'] : [p.mode];
    // At most four search requests (repositories may try two topic words) plus one cached repository lookup per distinct review repository; no background crawling of arbitrary GitHub repos.
    const settled = await Promise.allSettled(kinds.map(kind => search(kind, p, limit)));
    const warnings = [];
    const raw = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') raw.push(...result.value.map(item => ({ ...item, _kind: kinds[i] })));
      else warnings.push(`${kinds[i]}: ${result.reason instanceof Error ? result.reason.message : 'Unavailable'}`);
    });
    if (!raw.length && warnings.length) throw new GitHubApiError(warnings.join(' '), 429);
    const repos = new Map(raw.filter(x => x._kind === 'repositories').map(x => [x.full_name, x]));
    const linked = await markLinkedPullRequests(raw.filter(x => x._kind === 'issues' && !x.pull_request), warnings);
    const reviewRepos = await lookupReviewRepos(raw.filter(x => x._kind === 'reviews'), repos, warnings);
    const items = raw.map(item => {
      const repoName = projectIdFromIssue(item);
      const repo = repoName ? repos.get(repoName) ?? reviewRepos.get(repoName) : item._kind === 'repositories' ? item : null;
      const inProgress = linked.has(item);
      const result = scoreOpportunity(item, p, repo, { inProgress });
      if (item._kind !== 'reviews') return { ...item, _repoName: repoName || item.full_name, _inProgress: inProgress, _match: result };
      if (item.draft === true) result.safetyFlags = { ...result.safetyFlags, warnings: [DRAFT_REVIEW_WARNING] };
      // Search results already carry the conversation comment count; null means unknown, never zero.
      const commentCount = Number.isFinite(item.comments) ? item.comments : null;
      return { ...item, _repoName: repoName || item.full_name, _inProgress: inProgress, _commentCount: commentCount, _match: result };
    });
    return { items: items.sort((a, b) => b._match.score - a._match.score), warnings,
      searchedKinds: kinds, at: new Date().toISOString(), profile: p };
  }
  async function getRepo(owner, name) {
    for (const part of [owner, name]) if (!/^[\w.-]{1,100}$/.test(part)) throw new Error('Invalid GitHub repository identifier');
    return request(`/repos/${owner}/${name}`);
  }
  async function getRepoFiles(owner, name) {
    for (const part of [owner, name]) if (!/^[\w.-]{1,100}$/.test(part)) throw new Error('Invalid GitHub repository identifier');
    try {
      const listing = await request(`/repos/${owner}/${name}/contents/`);
      // A file or submodule response is an object, not a directory listing.
      if (!Array.isArray(listing)) return null;
      return listing.slice(0, MAX_ROOT_ENTRIES).map(({ name: fileName, path, type, size }) => ({ name: fileName, path, type, size }));
    } catch (error) {
      // GitHub answers 404 for an empty repository, but also when the listing is otherwise unreachable. null means "could not look", never "no files".
      if (error instanceof GitHubApiError && error.status === 404) return null;
      throw error;
    }
  }
  /**
   * Public-data estimate of maintainer activity: last push, open backlog, archived flag and how many of the
   * 5 most recently updated closed issues (pull requests excluded) closed inside the recent window.
   * Two cached, read-only requests; request() applies the 8 minute TTL.
   */
  async function getResponsivenessSignals(owner, name) {
    for (const part of [owner, name]) if (!/^[\w.-]{1,100}$/.test(part)) throw new Error('Invalid GitHub repository identifier');
    const [repo, closed] = await Promise.all([
      getRepo(owner, name),
      request(`/repos/${owner}/${name}/issues?state=closed&sort=updated&per_page=5`),
    ]);
    const now = Date.now();
    const pushed = Date.parse(repo?.pushed_at || '');
    const cutoff = now - RECENT_CLOSE_WINDOW_DAYS * 86400000;
    const recentCloseCount = (Array.isArray(closed) ? closed : []).slice(0, 5)
      .filter(issue => !issue.pull_request && Date.parse(issue.closed_at || '') >= cutoff).length;
    return {
      recentCloseCount,
      // null means "unknown" (no push timestamp), never "recent".
      daysSinceLastPush: Number.isFinite(pushed) ? Math.max(0, Math.floor((now - pushed) / 86400000)) : null,
      openIssueCount: Number.isFinite(repo?.open_issues_count) ? repo.open_issues_count : null,
      archived: Boolean(repo?.archived),
    };
  }
  return { discover, search, getRepo, getRepoFiles, getResponsivenessSignals, request };
}
