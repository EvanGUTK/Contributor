import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubClient, GitHubApiError } from '../packages/github/client.mjs';

const reply = (body, { status = 200, etag = null } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => (name.toLowerCase() === 'etag' ? etag : null) },
  json: async () => body,
});
const repo = (full_name, language, description) => ({ full_name, name: full_name.split('/')[1], language, description, archived: false, pushed_at: new Date().toISOString() });
const queryOf = url => new URL(url).searchParams.get('q');
const prefs = { mode: 'repositories', interests: 'image processing', languages: ['Python'] };

test('repository search queries each of up to two topic words and keeps the better result set', async () => {
  const queries = [];
  const weak = repo('a/unrelated', 'Go', 'Something else');
  const strong = repo('b/pixels', 'Python', 'image processing toolkit');
  const client = createGitHubClient({ fetchImpl: async url => {
    queries.push(queryOf(url));
    return reply({ items: [queryOf(url).endsWith(' image') ? weak : strong] });
  } });
  const result = await client.discover(prefs);
  assert.equal(queries.length, 2);
  assert.ok(queries.some(q => q.endsWith(' image')) && queries.some(q => q.endsWith(' processing')));
  assert.deepEqual(result.items.map(x => x.full_name), ['b/pixels']);
});

test('repository search with a single topic makes a single request', async () => {
  const queries = [];
  const client = createGitHubClient({ fetchImpl: async url => { queries.push(queryOf(url)); return reply({ items: [repo('a/vision', 'Python', 'vision')] }); } });
  await client.discover({ ...prefs, interests: 'vision' });
  assert.equal(queries.length, 1);
  assert.match(queries[0], / vision$/);
});

test('repository search falls back to the surviving topic when one request fails', async () => {
  const client = createGitHubClient({ fetchImpl: async url => (queryOf(url).endsWith(' image')
    ? reply({}, { status: 500 })
    : reply({ items: [repo('b/pixels', 'Python', 'image processing')] })) });
  const result = await client.discover(prefs);
  assert.deepEqual(result.items.map(x => x.full_name), ['b/pixels']);
});

test('repository search surfaces the error when every topic request fails', async () => {
  const client = createGitHubClient({ fetchImpl: async () => reply({}, { status: 500 }) });
  await assert.rejects(() => client.discover(prefs), GitHubApiError);
});

test('issue search sends one request combining both labels and the activity window', async () => {
  const queries = [];
  const client = createGitHubClient({ fetchImpl: async url => { queries.push(queryOf(url)); return reply({ items: [] }); } });
  await client.discover({ mode: 'issues' });
  assert.equal(queries.length, 1);
  assert.match(queries[0], /label:"good first issue","help wanted" updated:>=\d{4}-\d{2}-\d{2}/);
});

test('cached responses revalidate with If-None-Match and reuse data on 304', async () => {
  const calls = [];
  const payload = { id: 1, name: 'vision' };
  const client = createGitHubClient({ fetchImpl: async (url, init) => {
    calls.push({ ...init.headers });
    if (calls.length === 1) return reply(payload, { etag: 'W/"abc"' });
    return { ok: false, status: 304, headers: { get: () => null }, json: async () => { throw new Error('304 has no body'); } };
  } });
  assert.equal(await client.request('/repos/a/b'), payload);
  assert.equal(await client.request('/repos/a/b'), payload);
  assert.equal(calls.length, 1, 'fresh entry must not hit the network');
  assert.equal(await client.request('/repos/a/b', { ttlMs: 0 }), payload);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]['If-None-Match'], undefined);
  assert.equal(calls[1]['If-None-Match'], 'W/"abc"');
});

test('a 304 refreshes the entry so the next request within the TTL is served from cache', async () => {
  let calls = 0;
  const client = createGitHubClient({ fetchImpl: async () => {
    calls += 1;
    return calls === 1 ? reply({ ok: true }, { etag: '"v1"' }) : { ok: false, status: 304, headers: { get: () => null } };
  } });
  await client.request('/repos/a/b');
  await client.request('/repos/a/b', { ttlMs: 0 });
  await client.request('/repos/a/b');
  assert.equal(calls, 2);
});

test('a changed resource replaces cached data and ETag', async () => {
  const sent = [];
  const responses = [reply({ v: 1 }, { etag: '"v1"' }), reply({ v: 2 }, { etag: '"v2"' }), { ok: false, status: 304, headers: { get: () => null } }];
  const client = createGitHubClient({ fetchImpl: async (url, init) => { sent.push(init.headers['If-None-Match']); return responses[sent.length - 1]; } });
  assert.deepEqual(await client.request('/repos/a/b', { ttlMs: 0 }), { v: 1 });
  assert.deepEqual(await client.request('/repos/a/b', { ttlMs: 0 }), { v: 2 });
  assert.deepEqual(await client.request('/repos/a/b', { ttlMs: 0 }), { v: 2 });
  assert.deepEqual(sent, [undefined, '"v1"', '"v2"']);
});

test('responses without an ETag are never sent a conditional header', async () => {
  const sent = [];
  const client = createGitHubClient({ fetchImpl: async (url, init) => { sent.push(init.headers['If-None-Match']); return reply({ n: sent.length }); } });
  await client.request('/repos/a/b', { ttlMs: 0 });
  await client.request('/repos/a/b', { ttlMs: 0 });
  assert.deepEqual(sent, [undefined, undefined]);
});

test('errors are not cached or masked by a stored ETag', async () => {
  const responses = [reply({ ok: 1 }, { etag: '"v1"' }), ...Array(3).fill(reply({}, { status: 403 }))];
  let i = 0;
  const client = createGitHubClient({ fetchImpl: async () => responses[i++], sleepFn: async () => {} });
  await client.request('/repos/a/b', { ttlMs: 0 });
  await assert.rejects(() => client.request('/repos/a/b', { ttlMs: 0 }), GitHubApiError);
});

const sleeper = () => {
  const delays = [];
  return { delays, sleepFn: async ms => { delays.push(ms); } };
};

test('a rate-limited request retries with 1s then 2s backoff and succeeds on the second attempt', async () => {
  const { delays, sleepFn } = sleeper();
  const responses = [reply({}, { status: 429 }), reply({ id: 7 })];
  let calls = 0;
  const client = createGitHubClient({ fetchImpl: async () => responses[calls++], sleepFn });
  assert.deepEqual(await client.request('/repos/a/b'), { id: 7 });
  assert.equal(calls, 2);
  assert.deepEqual(delays, [1000]);
});

test('a 403 is retried twice with doubling delays before throwing GitHubApiError', async () => {
  const { delays, sleepFn } = sleeper();
  let calls = 0;
  const client = createGitHubClient({ fetchImpl: async () => { calls += 1; return reply({}, { status: 403 }); }, sleepFn });
  await assert.rejects(() => client.request('/repos/a/b'), error => error instanceof GitHubApiError && error.status === 403 && error.retries === 2);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test('non-rate-limit errors are not retried', async () => {
  const { delays, sleepFn } = sleeper();
  let calls = 0;
  const client = createGitHubClient({ fetchImpl: async () => { calls += 1; return reply({}, { status: 500 }); }, sleepFn });
  await assert.rejects(() => client.request('/repos/a/b'), error => error instanceof GitHubApiError && error.retries === 0);
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
});

test('status messages report each retry attempt and the final error names the attempt count', async () => {
  const statuses = [];
  const client = createGitHubClient({ fetchImpl: async () => reply({}, { status: 429 }), sleepFn: async () => {}, onStatus: m => statuses.push(m) });
  await assert.rejects(() => client.request('/repos/a/b'), error => /Gave up after 2\/2 retries/.test(error.message));
  assert.deepEqual(statuses, ['Rate limited, retrying (1/2)...', 'Rate limited, retrying (2/2)...']);
});

test('a request that succeeds first time reports no retry status', async () => {
  const statuses = [];
  const client = createGitHubClient({ fetchImpl: async () => reply({ ok: 1 }), sleepFn: async () => { throw new Error('must not sleep'); }, onStatus: m => statuses.push(m) });
  await client.request('/repos/a/b');
  assert.deepEqual(statuses, []);
});

const issue = (n, repoName = 'a/b') => ({
  number: n, title: `Issue ${n}`, html_url: `https://github.com/${repoName}/issues/${n}`,
  repository_url: `https://api.github.com/repos/${repoName}`, labels: [{ name: 'good first issue' }], updated_at: new Date().toISOString(),
});
const isLookup = url => queryOf(url).includes('is:pr');
const issueMode = { mode: 'issues' };

test('an issue with a linked open PR is flagged inProgress and an unlinked one is not', async () => {
  const lookups = [];
  const client = createGitHubClient({ fetchImpl: async url => {
    if (!isLookup(url)) return reply({ items: [issue(1), issue(2)] });
    lookups.push(queryOf(url));
    return reply({ items: queryOf(url).includes('/issues/1"') ? [{ number: 99 }] : [] });
  } });
  const { items } = await client.discover(issueMode);
  const byNumber = Object.fromEntries(items.map(x => [x.number, x]));
  assert.equal(byNumber[1]._inProgress, true);
  assert.equal(byNumber[1]._match.inProgress, true);
  assert.equal(byNumber[2]._inProgress, false);
  assert.equal(byNumber[2]._match.inProgress, false);
  assert.ok(byNumber[2]._match.score - byNumber[1]._match.score === 15, 'linked issue is penalised by 15 points');
  assert.equal(items[0].number, 2, 'unlinked issue sorts first');
  assert.ok(lookups.every(q => /^is:pr is:open repo:a\/b "https:\/\/github\.com\/a\/b\/issues\/\d+" in:body$/.test(q)));
});

test('the linked PR lookup asks for a single result', async () => {
  const urls = [];
  const client = createGitHubClient({ fetchImpl: async url => { urls.push(url); return reply({ items: isLookup(url) ? [] : [issue(1)] }); } });
  await client.discover(issueMode);
  assert.equal(new URL(urls[1]).searchParams.get('per_page'), '1');
});

test('linked PR lookups run at most five at a time', async () => {
  let active = 0;
  let peak = 0;
  const client = createGitHubClient({ fetchImpl: async url => {
    if (!isLookup(url)) return reply({ items: Array.from({ length: 12 }, (_, i) => issue(i + 1)) });
    active += 1; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active -= 1;
    return reply({ items: [] });
  } });
  await client.discover(issueMode, { limit: 12 });
  assert.equal(peak, 5);
});

test('repeated discovery serves linked PR lookups from the cache', async () => {
  let lookups = 0;
  const client = createGitHubClient({ fetchImpl: async url => {
    if (isLookup(url)) { lookups += 1; return reply({ items: [] }); }
    return reply({ items: [issue(1)] });
  } });
  await client.discover(issueMode);
  await client.discover(issueMode);
  assert.equal(lookups, 1);
});

test('a failed linked PR lookup leaves the issue listed, unflagged, with a warning', async () => {
  const client = createGitHubClient({ fetchImpl: async url => (isLookup(url) ? reply({}, { status: 500 }) : reply({ items: [issue(1)] })) });
  const result = await client.discover(issueMode);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]._inProgress, false);
  assert.match(result.warnings.join(' '), /linked pull requests: could not check 1 issue/);
});

test('review and repository results trigger no linked PR lookups', async () => {
  const queries = [];
  const client = createGitHubClient({ fetchImpl: async url => { queries.push(queryOf(url)); return reply({ items: [{ ...issue(5), pull_request: {} }] }); } });
  await client.discover({ mode: 'reviews' });
  assert.equal(queries.length, 1);
});
