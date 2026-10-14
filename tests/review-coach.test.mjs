import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewChecklist, PUBLISH_POLICY } from '../packages/core/review-coach.mjs';

const pr = (overrides = {}) => ({ title: 'Add widget parser', body: 'Adds a widget parser in `src/widget.mjs` with tests.', changed_files: 2, additions: 40, deletions: 3, ...overrides });
const file = (filename, overrides = {}) => ({ filename, status: 'modified', additions: 10, deletions: 0, patch: '+const ok = true;', ...overrides });
const cleanFiles = () => [file('src/widget.mjs'), file('tests/widget.test.mjs')];
const items = (result, category) => result.checklistItems.filter(i => i.category === category);
const severities = (result, category) => items(result, category).map(i => i.severity);

test('scope mismatch is flagged when the diff shares nothing with the description', () => {
  const result = buildReviewChecklist(pr({ title: 'Fix login redirect', body: 'Corrects the redirect after authentication succeeds.' }), [file('docs/billing/invoice.mjs'), file('tests/invoice.test.mjs')]);
  const scope = items(result, 'SCOPE');
  assert.ok(scope.some(i => i.severity === 'warn' && /scope mismatch/i.test(i.evidence)), JSON.stringify(scope));
});

test('scope flags files the description names that are missing from the diff, and empty descriptions', () => {
  const missing = buildReviewChecklist(pr({ body: 'Changes `src/widget.mjs` and `src/other-thing.mjs` to add the parser.' }), cleanFiles());
  assert.ok(items(missing, 'SCOPE').some(i => i.severity === 'warn' && i.evidence.includes('src/other-thing.mjs')));
  const empty = buildReviewChecklist(pr({ body: '' }), cleanFiles());
  assert.ok(items(empty, 'SCOPE').some(i => i.severity === 'warn' && /empty or very short/.test(i.evidence)));
});

test('missing tests are flagged for source changes but not for docs-only PRs', () => {
  const noTests = buildReviewChecklist(pr(), [file('src/widget.mjs')]);
  assert.deepEqual(severities(noTests, 'TESTS'), ['warn']);
  assert.match(items(noTests, 'TESTS')[0].evidence, /src\/widget\.mjs/);
  const docsOnly = buildReviewChecklist(pr({ title: 'Update widget docs', body: 'Clarifies the widget parser docs.' }), [file('docs/widget.md')]);
  assert.deepEqual(severities(docsOnly, 'TESTS'), ['info']);
});

test('tests that do not reference a changed source file are noted', () => {
  const result = buildReviewChecklist(pr(), [file('src/widget.mjs'), file('src/gadget.mjs'), file('tests/widget.test.mjs')]);
  assert.match(items(result, 'TESTS')[0].evidence, /src\/gadget\.mjs/);
});

test('secret patterns in added lines are blocked and redacted, removed lines and placeholders are ignored', () => {
  const secret = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
  const result = buildReviewChecklist(pr(), [file('src/widget.mjs', { patch: `+const token = "${secret}";` }), file('tests/widget.test.mjs')]);
  const blocks = items(result, 'SECURITY').filter(i => i.severity === 'block');
  assert.equal(blocks.length, 1);
  assert.ok(!JSON.stringify(result).includes(secret), 'secret value must be redacted');
  const safe = buildReviewChecklist(pr(), [
    file('src/widget.mjs', { patch: `-const token = "${secret}";\n+const token = process.env.TOKEN;\n+const apiKey = "your-api-key-here";` }),
    file('tests/widget.test.mjs'),
  ]);
  assert.ok(!severities(safe, 'SECURITY').includes('block'));
});

test('eval and shell execution are warned, but RegExp.exec is not', () => {
  const risky = buildReviewChecklist(pr(), [file('src/widget.mjs', { patch: '+eval(input);\n+execSync(cmd);' }), file('tests/widget.test.mjs')]);
  assert.equal(items(risky, 'SECURITY').filter(i => i.severity === 'warn').length, 2);
  const benign = buildReviewChecklist(pr(), [file('src/widget.mjs', { patch: '+const m = /a(b)/.exec(text);' }), file('tests/widget.test.mjs')]);
  assert.deepEqual(severities(benign, 'SECURITY'), ['info']);
});

test('removed files, renamed files and changed exports are flagged as breaking', () => {
  const result = buildReviewChecklist(pr(), [
    file('src/old.mjs', { status: 'removed' }),
    file('src/new.mjs', { status: 'renamed', previous_filename: 'src/legacy.mjs' }),
    file('src/widget.mjs', { patch: '-export function parse(a) {\n+export function parse(a, b) {\n-export const GONE = 1;' }),
    file('tests/widget.test.mjs'),
  ]);
  const evidence = items(result, 'BREAKING').map(i => i.evidence).join('\n');
  assert.equal(severities(result, 'BREAKING').filter(s => s === 'warn').length, 4);
  assert.match(evidence, /src\/old\.mjs/);
  assert.match(evidence, /src\/legacy\.mjs → src\/new\.mjs/);
  assert.match(evidence, /signature changed for parse/);
  assert.match(evidence, /GONE/);
});

test('large PRs are flagged and truncated file lists are noted', () => {
  const result = buildReviewChecklist(pr({ additions: 480, deletions: 40, changed_files: 45 }), cleanFiles());
  const size = items(result, 'SIZE');
  assert.equal(size[0].severity, 'warn');
  assert.match(size[0].evidence, /520 lines.*consider requesting a split/i);
  assert.ok(size.some(i => /2 of 45/.test(i.evidence)));
  assert.equal(items(buildReviewChecklist(pr({ additions: 500, deletions: 0, changed_files: 2 }), cleanFiles()), 'SIZE')[0].severity, 'info');
});

test('a clean PR produces no block items and covers every category', () => {
  const result = buildReviewChecklist(pr(), cleanFiles());
  assert.ok(!result.checklistItems.some(i => i.severity === 'block'));
  assert.deepEqual([...new Set(result.checklistItems.map(i => i.category))], ['SCOPE', 'TESTS', 'BREAKING', 'SECURITY', 'SIZE']);
  for (const i of result.checklistItems) {
    assert.ok(['info', 'warn', 'block'].includes(i.severity));
    assert.ok(i.question && i.evidence);
  }
  assert.match(result.draftGuidance, /verify|confirm/i);
});

test('publishPolicy is always present, even for empty or malformed input', () => {
  const policy = 'Do not post these findings without reading and verifying each one. You are responsible for any review comment you publish.';
  assert.equal(PUBLISH_POLICY, policy);
  for (const args of [[pr(), cleanFiles()], [{}, []], [undefined, undefined], [null, [null, { nope: 1 }]]]) {
    const result = buildReviewChecklist(...args);
    assert.equal(result.publishPolicy, policy);
    assert.equal(typeof result.summary, 'string');
    assert.ok(Array.isArray(result.checklistItems));
  }
});
