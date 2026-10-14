/** Github public discovery: strictly read-only, bounded calls, transparent rate errors. */
import { buildSearchQuery, extractTopics, normalizePreferences, projectIdFromIssue, scoreOpportunity } from '../core/matching.mjs';
const API = 'https://api.github.com';
const MAX_ROOT_ENTRIES = 200;
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;
const realSleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isRateLimited = status => status === 403 || status === 429;

export class GitHubApiError extends Error {
  constructor(message, status, reset = null, retries = 0) { super(message); this.name = 'GitHubApiError'; this.status = status; this.reset = reset; this.retries = retries; }
}
export function createGitHubClient({ fetchImpl = fetch, token = undefined, sleepFn = realSleep, onStatus = undefined } = {}) {
  const cache = new Map();
  async function request(endpoint, { ttlMs = 8 * 60_000 } = {}) {
    if (!endpoint.startsWith('/')) throw new Error('Only relative GitHub REST API paths are allowed');
    const existing = cache.get(endpoint);
    if (existing && Date.now() - existing.when < ttlMs) return existing.data;
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = `Bearer ${token}`;
    // Stale entries are revalidated; GitHub answers 304 without counting against the rate limit.
    if (existing?.etag) headers['If-None-Match'] = existing.etag;
    let response;
    let retry = 0;
    // Exponential backoff (1s, 2s) on 403/429 before surfacing the rate-limit error.
    for (;; retry += 1) {
      response = await fetchImpl(API + endpoint, { headers, signal: AbortSignal.timeout(12000) });
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
  async function discover(preferences, { limit = 12 } = {}) {
    const p = normalizePreferences(preferences);
    const kinds = p.mode === 'all' ? ['repositories', 'issues', 'reviews'] : [p.mode];
    // At most four search requests (repositories may try two topic words); no background crawling of arbitrary GitHub repos.
    const settled = await Promise.allSettled(kinds.map(kind => search(kind, p, limit)));
    const warnings = [];
    const raw = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') raw.push(...result.value.map(item => ({ ...item, _kind: kinds[i] })));
      else warnings.push(`${kinds[i]}: ${result.reason instanceof Error ? result.reason.message : 'Unavailable'}`);
    });
    if (!raw.length && warnings.length) throw new GitHubApiError(warnings.join(' '), 429);
    const repos = new Map(raw.filter(x => x._kind === 'repositories').map(x => [x.full_name, x]));
    const items = raw.map(item => {
      const repoName = projectIdFromIssue(item);
      const repo = repoName ? repos.get(repoName) : item._kind === 'repositories' ? item : null;
      const result = scoreOpportunity(item, p, repo);
      return { ...item, _repoName: repoName || item.full_name, _match: result };
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
  return { discover, search, getRepo, getRepoFiles, request };
}
