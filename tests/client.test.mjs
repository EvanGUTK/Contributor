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
  const responses = [reply({ ok: 1 }, { etag: '"v1"' }), reply({}, { status: 403 })];
  let i = 0;
  const client = createGitHubClient({ fetchImpl: async () => responses[i++] });
  await client.request('/repos/a/b', { ttlMs: 0 });
  await assert.rejects(() => client.request('/repos/a/b', { ttlMs: 0 }), GitHubApiError);
});
