import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPassportSummary } from '../packages/core/passport.mjs';
import { createGitHubClient, GitHubApiError } from '../packages/github/client.mjs';

const NOW = Date.parse('2026-10-01T00:00:00Z');
const daysAgo = days => new Date(NOW - days * 86_400_000).toISOString();
const repo = (overrides = {}) => ({ full_name: 'example/app', pushed_at: daysAgo(10), license: { spdx_id: 'MIT' }, open_issues_count: 12, archived: false, ...overrides });
const root = (...names) => names.map(name => ({ name, type: 'file' }));
const summarize = (data, files) => getPassportSummary(data, files, { now: NOW });
const signalIds = summary => summary.signals.map(s => s.id);

test('healthy repository reports contributing, license and recent activity', () => {
  const s = summarize(repo(), root('README.md', 'CONTRIBUTING.md', 'package.json'));
  assert.equal(s.hasContributing, true);
  assert.equal(s.license, 'MIT');
  assert.equal(s.openIssues, 12);
  assert.equal(s.lastPushed, daysAgo(10));
  assert.equal(s.isArchived, false);
  assert.equal(s.setupDifficulty, 'easy');
  assert.deepEqual(signalIds(s).filter(id => ['recently-active', 'license-found', 'contributing-found'].includes(id)), ['recently-active', 'license-found', 'contributing-found']);
});

test('CONTRIBUTING detection accepts common names and rejects look-alikes', () => {
  for (const name of ['CONTRIBUTING', 'contributing.md', 'CONTRIBUTING.rst', 'Contributing.txt']) assert.equal(summarize(repo(), root(name)).hasContributing, true, name);
  for (const name of ['CONTRIBUTING-guide.md', 'contributors.md', 'CONTRIBUTING.md.bak']) assert.equal(summarize(repo(), root(name)).hasContributing, false, name);
});

test('missing CONTRIBUTING is informational, not a failure, because it may live in .github or docs', () => {
  const s = summarize(repo(), root('README.md'));
  assert.equal(s.hasContributing, false);
  const sig = s.signals.find(x => x.id === 'contributing-not-in-root');
  assert.equal(sig.level, 'info');
  assert.match(sig.message, /\.github/);
});

test('unfetched file listing yields null (unknown) rather than false', () => {
  for (const files of [null, undefined]) {
    const s = summarize(repo(), files);
    assert.equal(s.hasContributing, null);
    assert.equal(s.aiPolicyDetected, null);
    assert.equal(s.setupDifficulty, 'unknown');
    assert.ok(signalIds(s).includes('files-unavailable'));
  }
});

test('license resolution distinguishes known, unrecognized and absent', () => {
  assert.equal(summarize(repo({ license: { spdx_id: 'Apache-2.0' } }), []).license, 'Apache-2.0');
  assert.equal(summarize(repo({ license: { spdx_id: 'NOASSERTION' } }), []).license, 'Unrecognized');
  assert.equal(summarize(repo({ license: null }), root('LICENSE')).license, 'Unrecognized');
  const none = summarize(repo({ license: null }), root('README.md'));
  assert.equal(none.license, 'Unknown');
  assert.equal(none.signals.find(x => x.id === 'license-unknown').level, 'caution');
});

test('archived repositories are flagged and never reported as recently active', () => {
  const s = summarize(repo({ archived: true, pushed_at: daysAgo(1) }), root('README.md'));
  assert.equal(s.isArchived, true);
  assert.ok(signalIds(s).includes('archived'));
  assert.ok(!signalIds(s).includes('recently-active'));
});

test('maintainer activity thresholds: active, slowing, stale, unknown', () => {
  const activity = pushed_at => summarize(repo({ pushed_at }), []).signals[0].id;
  assert.equal(activity(daysAgo(90)), 'recently-active');
  assert.equal(activity(daysAgo(91)), 'slowing');
  assert.equal(activity(daysAgo(365)), 'slowing');
  assert.equal(activity(daysAgo(366)), 'stale');
  assert.equal(activity(undefined), 'activity-unknown');
  assert.equal(activity('not-a-date'), 'activity-unknown');
});

test('AI policy files are detected by name, and absence carries an honest caveat', () => {
  for (const name of ['AI_POLICY.md', 'ai-policy.md', 'AI_USAGE.md', 'GENERATIVE_AI.md', 'GENERATIVE_AI_POLICY.md', 'LLM-policy.md']) assert.equal(summarize(repo(), root(name)).aiPolicyDetected, true, name);
  for (const name of ['AI_ROADMAP.md', 'AI.md', 'MAIN_POLICY.md', 'AI_POLICY.md.bak']) assert.equal(summarize(repo(), root(name)).aiPolicyDetected, false, name);
  // AGENTS.md instructs coding agents; it is not a statement of policy on AI contributions.
  const s = summarize(repo(), root('AGENTS.md', 'README.md'));
  assert.equal(s.aiPolicyDetected, false);
  assert.match(s.signals.find(x => x.id === 'ai-policy-not-detected').message, /check them manually/);
});

test('setup difficulty grows with ecosystems and heavyweight tooling', () => {
  assert.equal(summarize(repo(), root('README.md')).setupDifficulty, 'unknown');
  assert.equal(summarize(repo(), root('package.json')).setupDifficulty, 'easy');
  assert.equal(summarize(repo(), root('pyproject.toml', 'Makefile')).setupDifficulty, 'easy');
  assert.equal(summarize(repo(), root('Cargo.toml', 'Dockerfile', 'Makefile')).setupDifficulty, 'moderate');
  assert.equal(summarize(repo(), root('package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod', 'Dockerfile')).setupDifficulty, 'complex');
  assert.equal(summarize(repo(), root('App.csproj', 'App.sln')).setupDifficulty, 'easy');
});

test('open issue count is passed through, large counts add a caveat, missing counts stay null', () => {
  assert.equal(summarize(repo({ open_issues_count: 0 }), []).openIssues, 0);
  assert.ok(!signalIds(summarize(repo({ open_issues_count: 499 }), [])).includes('many-open-items'));
  assert.ok(signalIds(summarize(repo({ open_issues_count: 500 }), [])).includes('many-open-items'));
  assert.equal(summarize(repo({ open_issues_count: undefined }), []).openIssues, null);
});

test('summary rejects non-object repository data and tolerates malformed file entries', () => {
  for (const bad of [null, undefined, 'repo', 42, []]) assert.throws(() => getPassportSummary(bad, []), TypeError);
  const s = summarize(repo(), [null, {}, { name: 42 }, { name: 'CONTRIBUTING.md' }]);
  assert.equal(s.hasContributing, true);
});

test('every signal has a stable id, a known level and a non-empty message', () => {
  const s = summarize(repo({ license: null }), root('CONTRIBUTING.md', 'AI_POLICY.md', 'package.json'));
  assert.ok(s.signals.length >= 4);
  for (const sig of s.signals) {
    assert.match(sig.id, /^[a-z-]+$/);
    assert.ok(['positive', 'info', 'caution'].includes(sig.level));
    assert.ok(sig.message.length > 0);
  }
  assert.equal(new Set(signalIds(s)).size, s.signals.length);
});

test('getRepoFiles requests the read-only contents endpoint, trims fields and caches', async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    return { ok: true, headers: { get: () => null }, json: async () => [{ name: 'README.md', path: 'README.md', type: 'file', size: 10, download_url: 'https://x', sha: 'abc' }] };
  };
  const client = createGitHubClient({ fetchImpl });
  const files = await client.getRepoFiles('example', 'app');
  assert.deepEqual(files, [{ name: 'README.md', path: 'README.md', type: 'file', size: 10 }]);
  await client.getRepoFiles('example', 'app');
  assert.deepEqual(urls, ['https://api.github.com/repos/example/app/contents/']);
});

test('getRepoFiles bounds the listing, treats empty-repo 404 as empty, and propagates other errors', async () => {
  const many = Array.from({ length: 450 }, (_, i) => ({ name: `f${i}`, path: `f${i}`, type: 'file', size: 1 }));
  const respond = (status, body) => async () => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body });
  assert.equal((await createGitHubClient({ fetchImpl: respond(200, many) }).getRepoFiles('a', 'b')).length, 200);
  assert.deepEqual(await createGitHubClient({ fetchImpl: respond(200, { type: 'file' }) }).getRepoFiles('a', 'b'), []);
  assert.deepEqual(await createGitHubClient({ fetchImpl: respond(404, {}) }).getRepoFiles('a', 'b'), []);
  await assert.rejects(createGitHubClient({ fetchImpl: respond(403, {}) }).getRepoFiles('a', 'b'), error => error instanceof GitHubApiError && error.status === 403);
  await assert.rejects(createGitHubClient({ fetchImpl: respond(200, []) }).getRepoFiles('a/b', 'c'), /Invalid GitHub repository identifier/);
});
