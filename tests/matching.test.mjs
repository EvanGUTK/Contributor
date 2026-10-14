import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreferences, scoreOpportunity, buildHandoffPrompt, buildSearchQuery, extractTopics, ACTIVITY_WINDOW_DAYS, projectIdFromIssue, estimateIssueDifficulty } from '../packages/core/matching.mjs';
import { createGitHubClient, GitHubApiError } from '../packages/github/client.mjs';
const example = { title: 'Handle empty arrays in image processing', body: 'Python OpenCV processing', html_url: 'https://github.com/example/vision/issues/42', repository_url: 'https://api.github.com/repos/example/vision', labels: [{ name: 'good first issue' }], updated_at: new Date().toISOString() };
test('normalization is bounded and rejects invalid modes', () => {
  const p = normalizePreferences({ languages: ['Python', 'Python'], hours: 900, mode: 'delete', level: 'wizard' });
  assert.deepEqual(p.languages, ['Python']); assert.equal(p.hours, 40); assert.equal(p.mode, 'all'); assert.equal(p.level, 'beginner');
});
test('issue repository extraction', () => assert.equal(projectIdFromIssue(example), 'example/vision'));
test('label difficulty', () => assert.equal(estimateIssueDifficulty(example), 'beginner'));
test('matching is explainable and finite', () => {
  const m = scoreOpportunity(example, { languages: ['Python'], interests: 'image processing', level: 'beginner' }, { language: 'Python', archived: false, full_name: 'example/vision' });
  assert.ok(m.score > 70 && m.score <= 100); assert.ok(m.reasons.some(x => x.includes('Python'))); assert.equal(m.confidence, 'medium');
});
test('handoff disallows non-GitHub URL and requires approval', () => {
  assert.throws(() => buildHandoffPrompt({ html_url: 'https://evil.test/r' }), /verified GitHub/);
  assert.match(buildHandoffPrompt(example, { languages: ['Python'] }), /approve the plan/);
});
test('search queries are bounded and do not interpolate malicious interest operators', () => {
  assert.match(buildSearchQuery({ interests: 'is:closed user:admin', languages: ['Python'] }, 'repositories'), /archived:false/);
  assert.doesNotMatch(buildSearchQuery({ interests: 'is:closed user:admin' }, 'issues'), /user:admin/);
});
test('GitHub client builds read-only search request', async () => {
  const paths = [];
  const client = createGitHubClient({ fetchImpl: async (url, init) => { paths.push(url); assert.equal(init.method, undefined); return { ok: true, json: async () => ({ items: [example] }) }; } });
  const result = await client.discover({ mode: 'issues', languages: ['Python'] });
  assert.equal(paths.length, 1); assert.equal(result.items.length, 1); assert.match(paths[0], /search\/issues/);
});
test('rate-limit reports error instead of inventing results', async () => {
  const client = createGitHubClient({ fetchImpl: async () => ({ ok: false, status: 403, headers: { get: () => null } }) });
  await assert.rejects(() => client.discover({ mode: 'issues' }), GitHubApiError);
});
test('issue search matches good first issue or help wanted within the activity window', () => {
  const q = buildSearchQuery({ languages: ['Python'] }, 'issues', { now: new Date('2026-10-14T12:00:00Z') });
  assert.equal(ACTIVITY_WINDOW_DAYS, 90);
  assert.match(q, /label:"good first issue","help wanted"/);
  assert.match(q, /updated:>=2026-07-16(?: |$)/);
  assert.match(q, /language:Python/);
});
test('topic extraction keeps at most two operator-safe words in order', () => {
  assert.deepEqual(extractTopics('image processing machine-learning'), ['image', 'processing']);
  assert.deepEqual(extractTopics('is:closed user:admin vision vision'), ['vision']);
  assert.deepEqual(extractTopics('ab x'), []);
  assert.deepEqual(extractTopics('graphics audio video', 3), ['graphics', 'audio', 'video']);
});
test('repository query uses the first topic by default and an explicit topic when given', () => {
  const prefs = { interests: 'image processing', languages: ['Python'] };
  assert.match(buildSearchQuery(prefs, 'repositories'), / image$/);
  assert.match(buildSearchQuery(prefs, 'repositories', { topic: 'processing' }), / processing$/);
  assert.doesNotMatch(buildSearchQuery(prefs, 'repositories', { topic: 'user:admin' }), /user:admin/);
});
