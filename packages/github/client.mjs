/** Github public discovery: strictly read-only, bounded calls, transparent rate errors. */
import { buildSearchQuery, normalizePreferences, projectIdFromIssue, scoreOpportunity } from '../core/matching.mjs';
const API = 'https://api.github.com';
const MAX_ROOT_ENTRIES = 200;

export class GitHubApiError extends Error {
  constructor(message, status, reset = null) { super(message); this.name = 'GitHubApiError'; this.status = status; this.reset = reset; }
}
export function createGitHubClient({ fetchImpl = fetch, token = undefined } = {}) {
  const cache = new Map();
  async function request(endpoint, { ttlMs = 8 * 60_000 } = {}) {
    if (!endpoint.startsWith('/')) throw new Error('Only relative GitHub REST API paths are allowed');
    const existing = cache.get(endpoint);
    if (existing && Date.now() - existing.when < ttlMs) return existing.data;
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetchImpl(API + endpoint, { headers, signal: AbortSignal.timeout(12000) });
    if (!response.ok) {
      const reset = response.headers?.get('x-ratelimit-reset');
      const wait = reset ? ` Retry after ${new Date(Number(reset) * 1000).toLocaleTimeString()}.` : '';
      const message = response.status === 403 || response.status === 429 ? `GitHub's rate limit or access policy blocked this search.${wait}` : `GitHub API returned ${response.status}.`;
      throw new GitHubApiError(message, response.status, reset);
    }
    const data = await response.json();
    cache.set(endpoint, { when: Date.now(), data });
    return data;
  }
  async function search(kind, preferences, limit = 15) {
    const q = buildSearchQuery(preferences, kind);
    const endpoint = kind === 'repositories' ? '/search/repositories' : '/search/issues';
    const data = await request(`${endpoint}?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=${Math.min(30, Math.max(1, limit))}`);
    return (data.items || []).slice(0, limit);
  }
  async function discover(preferences, { limit = 12 } = {}) {
    const p = normalizePreferences(preferences);
    const kinds = p.mode === 'all' ? ['repositories', 'issues', 'reviews'] : [p.mode];
    // Limit to three search requests; no background crawling of arbitrary GitHub repos.
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
      if (!Array.isArray(listing)) return [];
      return listing.slice(0, MAX_ROOT_ENTRIES).map(({ name: fileName, path, type, size }) => ({ name: fileName, path, type, size }));
    } catch (error) {
      // GitHub answers 404 for the contents of an empty repository; the repository itself is verified separately by getRepo.
      if (error instanceof GitHubApiError && error.status === 404) return [];
      throw error;
    }
  }
  return { discover, search, getRepo, getRepoFiles, request };
}
