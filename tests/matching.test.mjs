import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePreferences, scoreOpportunity, buildHandoffPrompt, buildSearchQuery, extractTopics, ACTIVITY_WINDOW_DAYS, projectIdFromIssue, estimateIssueDifficulty, calibrateExperience, EXPERIENCED_HOURS, QUICK_TASK_HOURS, IN_PROGRESS_PENALTY, scoreResponsiveness, RESPONSIVENESS_NOTE, OUTSIDE_REVIEW_DISCLAIMER, REVIEW_MIN_STARS, isMostlyNonEnglish } from '../packages/core/matching.mjs';
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
  // One issue search, then one bounded linked-PR lookup for the single issue found.
  assert.equal(paths.length, 2); assert.equal(result.items.length, 1);
  assert.match(paths[0], /search\/issues/); assert.match(paths[1], /is%3Apr\+is%3Aopen|is%3Apr%20is%3Aopen/);
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
const advancedIssue = { ...example, title: 'Rework architecture of the scheduler', labels: [{ name: 'architecture' }] };
const repo = { language: 'Python', archived: false, full_name: 'example/vision' };
const score = (item, prefs) => scoreOpportunity(item, { languages: ['Python'], ...prefs }, repo);
test('calibration flags a short-budget beginner as interest-only', () => {
  assert.deepEqual(score(example, { level: 'beginner', hours: 4 }).calibration, { interestOnly: true, quickTask: false });
});
test('a beginner with a 16h+ budget is treated as more experienced', () => {
  assert.equal(EXPERIENCED_HOURS, 16);
  assert.equal(calibrateExperience(normalizePreferences({ level: 'beginner', hours: 15 })).effectiveLevel, 'beginner');
  assert.equal(calibrateExperience(normalizePreferences({ level: 'beginner', hours: 16 })).effectiveLevel, 'intermediate');
  assert.deepEqual(score(example, { level: 'beginner', hours: 16 }).calibration, { interestOnly: false, quickTask: false });
});
test('experienced beginners are steered toward harder work than interest-only beginners', () => {
  const novice = score(example, { level: 'beginner', hours: 4 }).breakdown.accessibility;
  const seasoned = score(example, { level: 'beginner', hours: 16 }).breakdown.accessibility;
  assert.ok(seasoned < novice);
  assert.ok(score(advancedIssue, { level: 'beginner', hours: 16 }).breakdown.accessibility > score(advancedIssue, { level: 'beginner', hours: 4 }).breakdown.accessibility);
});
test('an advanced user with a 2h budget is flagged as quick-task and sent away from large work', () => {
  assert.equal(QUICK_TASK_HOURS, 2);
  const quick = score(example, { level: 'advanced', hours: 2 });
  assert.deepEqual(quick.calibration, { interestOnly: false, quickTask: true });
  assert.ok(quick.reasons.some(x => /short time budget/.test(x)));
  assert.equal(score(example, { level: 'advanced', hours: 3 }).calibration.quickTask, false);
  assert.ok(score(advancedIssue, { level: 'advanced', hours: 2 }).breakdown.accessibility < score(advancedIssue, { level: 'advanced', hours: 8 }).breakdown.accessibility);
});
test('calibration leaves intermediate users and the existing beginner path unchanged', () => {
  assert.deepEqual(score(example, { level: 'intermediate', hours: 1 }).calibration, { interestOnly: false, quickTask: false });
  assert.equal(score(example, { level: 'beginner', hours: 4 }).breakdown.accessibility, 20);
  assert.equal(score(advancedIssue, { level: 'beginner', hours: 4 }).breakdown.accessibility, 1);
});

test('inProgress lowers the score by 15 points and is reported on the result', () => {
  const issue = { title: 'Fix vision bug', repository_url: 'https://api.github.com/repos/a/b', labels: [{ name: 'good first issue' }], updated_at: new Date().toISOString() };
  const free = scoreOpportunity(issue, { languages: [], interests: 'vision' });
  const linked = scoreOpportunity(issue, { languages: [], interests: 'vision' }, null, { inProgress: true });
  assert.equal(free.inProgress, false);
  assert.equal(linked.inProgress, true);
  assert.equal(linked.score, free.score - IN_PROGRESS_PENALTY);
  assert.equal(IN_PROGRESS_PENALTY, 15);
  assert.ok(linked.reasons.some(r => /linked open pull request/.test(r)));
});

test('inProgress=false (or omitted) leaves the score and reasons unchanged', () => {
  const issue = { title: 'Fix vision bug', repository_url: 'https://api.github.com/repos/a/b', updated_at: new Date().toISOString() };
  const omitted = scoreOpportunity(issue, { interests: 'vision' });
  const explicit = scoreOpportunity(issue, { interests: 'vision' }, null, { inProgress: false });
  assert.deepEqual(explicit, omitted);
  assert.ok(!omitted.reasons.some(r => /linked open pull request/.test(r)));
});

test('the in-progress penalty never takes a score below zero', () => {
  const stale = { title: 'x', repository_url: 'https://api.github.com/repos/a/b', updated_at: '2000-01-01T00:00:00Z' };
  assert.ok(scoreOpportunity(stale, { languages: ['Rust'] }, null, { inProgress: true }).score >= 0);
});

const sig = (over = {}) => ({ recentCloseCount: 0, daysSinceLastPush: 200, openIssueCount: 10, archived: false, ...over });

test('scoreResponsiveness scores each push-recency band', () => {
  const fresh = scoreResponsiveness(sig({ daysSinceLastPush: 30 }));
  assert.equal(fresh.score, 8);
  assert.match(fresh.label, /recently active/);
  assert.equal(scoreResponsiveness(sig({ daysSinceLastPush: 31 })).score, 5);
  assert.equal(scoreResponsiveness(sig({ daysSinceLastPush: 90 })).score, 5);
  assert.equal(scoreResponsiveness(sig({ daysSinceLastPush: 91 })).score, 1);
});

test('scoreResponsiveness scores close velocity bands', () => {
  const base = { daysSinceLastPush: 5 };
  assert.equal(scoreResponsiveness(sig({ ...base, recentCloseCount: 0 })).score, 8);
  assert.equal(scoreResponsiveness(sig({ ...base, recentCloseCount: 2 })).score, 10);
  const busy = scoreResponsiveness(sig({ ...base, recentCloseCount: 3 }));
  assert.equal(busy.score, 13);
  assert.ok(busy.reasons.includes('maintainers closing issues'));
});

test('scoreResponsiveness penalizes a backlog above 500 and never goes below zero', () => {
  const heavy = scoreResponsiveness(sig({ daysSinceLastPush: 5, openIssueCount: 501 }));
  assert.equal(heavy.score, 5);
  assert.ok(heavy.reasons.includes('high open issue backlog'));
  assert.equal(scoreResponsiveness(sig({ daysSinceLastPush: 5, openIssueCount: 500 })).score, 8);
  assert.equal(scoreResponsiveness(sig({ openIssueCount: 900 })).score, 0);
});

test('scoreResponsiveness reports archived repositories as zero regardless of other signals', () => {
  const r = scoreResponsiveness(sig({ archived: true, daysSinceLastPush: 1, recentCloseCount: 5 }));
  assert.equal(r.score, 0);
  assert.equal(r.label, 'archived');
});

test('scoreResponsiveness stays within 0-15, always states its uncertainty and treats missing data as unknown', () => {
  const best = scoreResponsiveness(sig({ daysSinceLastPush: 0, recentCloseCount: 5 }));
  assert.ok(best.score <= 15);
  assert.equal(best.note, 'Responsiveness is estimated from public data only.');
  assert.equal(RESPONSIVENESS_NOTE, best.note);
  const unknown = scoreResponsiveness({ daysSinceLastPush: null, recentCloseCount: null, openIssueCount: null, archived: false });
  assert.equal(unknown.score, 0);
  assert.equal(unknown.label, 'activity unknown');
  assert.equal(scoreResponsiveness(sig({ archived: true })).note, RESPONSIVENESS_NOTE);
});

test('scoreOpportunity uses responsiveness signals for the maintainership breakdown when supplied', () => {
  const repo = { language: 'Python', archived: false, full_name: 'example/vision' };
  const signals = sig({ daysSinceLastPush: 3, recentCloseCount: 4 });
  const m = scoreOpportunity(example, { languages: ['Python'] }, repo, { signals });
  assert.equal(m.breakdown.maintainership, 13);
  assert.equal(m.maintainership.label, 'recently active');
  assert.ok(m.reasons.some(r => /closing issues/.test(r)));
});

test('scoreOpportunity keeps the flat maintainership score and no responsiveness result without signals', () => {
  const m = scoreOpportunity(example, { languages: ['Python'] }, { language: 'Python', archived: false });
  assert.equal(m.breakdown.maintainership, 7);
  assert.equal(m.maintainership, null);
});

test('scoreOpportunity scores an archived repo zero even when signals look healthy', () => {
  const m = scoreOpportunity(example, {}, { archived: true }, { signals: sig({ daysSinceLastPush: 1, recentCloseCount: 5 }) });
  assert.equal(m.breakdown.maintainership, 0);
  assert.equal(m.maintainership.label, 'archived');
  assert.ok(m.reasons.some(r => /Archived repository/.test(r)));
});

const reviewPr = (overrides = {}) => ({ pull_request: {}, title: 'Fix parser edge case', body: 'Handles empty input in the tokenizer.', html_url: 'https://github.com/example/parser/pull/7', repository_url: 'https://api.github.com/repos/example/parser', updated_at: new Date().toISOString(), ...overrides });
const safety = (item, stars) => scoreOpportunity(item, {}, stars === undefined ? null : { stargazers_count: stars, full_name: 'example/parser' }).safetyFlags;

test('review search keeps the language filter and sends no stars qualifier, which issue search does not support', () => {
  assert.equal(REVIEW_MIN_STARS, 25);
  assert.equal(buildSearchQuery({ languages: ['Python'] }, 'reviews'), 'is:pr is:open review:none language:Python');
  assert.equal(buildSearchQuery({}, 'reviews'), 'is:pr is:open review:none');
});
test('a review in a repository under 25 stars is flagged, not removed', () => {
  const m = scoreOpportunity(reviewPr(), {}, { stargazers_count: REVIEW_MIN_STARS - 1 });
  assert.equal(m.safetyFlags.outsideReviewWelcome, false);
  assert.equal(m.safetyFlags.disclaimer, OUTSIDE_REVIEW_DISCLAIMER);
  assert.match(m.safetyFlags.disclaimer, /Check CONTRIBUTING\.md before commenting/);
  assert.ok(m.score > 0);
});
test('a mostly non-ASCII review description is flagged even for a popular repository', () => {
  const flags = safety(reviewPr({ title: '修正', body: '金融システムの決済処理のバグを修正しました。レビューをお願いします。' }), 5000);
  assert.equal(flags.outsideReviewWelcome, false);
  assert.equal(flags.disclaimer, OUTSIDE_REVIEW_DISCLAIMER);
});
test('a clean review in an established repository is welcome with no disclaimer', () => {
  assert.deepEqual(safety(reviewPr(), REVIEW_MIN_STARS), { outsideReviewWelcome: true, disclaimer: null });
});
test('a review in an archived repository is flagged even with many stars and English text', () => {
  const m = scoreOpportunity(reviewPr(), {}, { stargazers_count: 9000, archived: true });
  assert.equal(m.safetyFlags.outsideReviewWelcome, false);
  assert.equal(m.safetyFlags.disclaimer, OUTSIDE_REVIEW_DISCLAIMER);
});
test('an unknown star count is not treated as low', () => {
  assert.equal(safety(reviewPr(), undefined).outsideReviewWelcome, true);
});
test('non-English detection ignores empty text, emoji and a few accented letters', () => {
  assert.equal(isMostlyNonEnglish(''), false);
  assert.equal(isMostlyNonEnglish('🎉🎉'), false);
  assert.equal(isMostlyNonEnglish('Add café menu support to the parser'), false);
  assert.equal(isMostlyNonEnglish('Исправить ошибку в разборе'), true);
});
test('only review opportunities carry the outside-review warning', () => {
  const m = scoreOpportunity(example, {}, { stargazers_count: 1 });
  assert.deepEqual(m.safetyFlags, { outsideReviewWelcome: true, disclaimer: null });
});
