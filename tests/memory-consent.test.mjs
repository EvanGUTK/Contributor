import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConsentPreferences, buildConsentSummary } from '../packages/core/memory-consent.mjs';

test('valid typed preferences pass through unchanged', () => {
  const input = { languages: ['Python', 'Rust'], interests: 'ai agents', level: 'intermediate', hours: 6, mode: 'issues' };
  const result = validateConsentPreferences(input);
  assert.equal(result.valid, true);
  assert.deepEqual(result.sanitized, input);
  assert.deepEqual(result.rejected, []);
});

test('extra keys are stripped and listed by name only', () => {
  const result = validateConsentPreferences({ languages: ['Go'], transcript: 'secret chat', memory_file: '/home/me/MEMORY.md' });
  assert.deepEqual(result.sanitized, { languages: ['Go'] });
  assert.deepEqual(result.rejected, ['transcript', 'memory_file']);
  assert.ok(!JSON.stringify(result).includes('secret chat'));
});

test('empty and missing preferences are valid', () => {
  for (const input of [{}, undefined]) {
    const result = validateConsentPreferences(input);
    assert.deepEqual(result, { valid: true, sanitized: {}, rejected: [] });
  }
});

test('non-object input is invalid and yields nothing', () => {
  for (const input of [null, 'python', 42, ['Python']]) {
    const result = validateConsentPreferences(input);
    assert.equal(result.valid, false);
    assert.deepEqual(result.sanitized, {});
  }
});

test('invalid values for allowed keys are rejected, not coerced', () => {
  const result = validateConsentPreferences({ level: 'wizard', mode: 'delete', hours: 900, languages: 'Python', interests: 7 });
  assert.deepEqual(result.sanitized, {});
  assert.deepEqual(result.rejected.sort(), ['hours', 'interests', 'languages', 'level', 'mode']);
});

test('lengths are bounded like normalizePreferences', () => {
  const languages = Array.from({ length: 12 }, (_, i) => `Lang${i}`);
  const result = validateConsentPreferences({ languages: [...languages, 'x'.repeat(26), ' Lang0 '], interests: 'y'.repeat(300) });
  assert.equal(result.sanitized.languages.length, 8);
  assert.ok(!result.sanitized.languages.includes('x'.repeat(26)));
  assert.equal(result.sanitized.interests.length, 120);
});

test('rejected key names are truncated and capped', () => {
  const input = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`${'k'.repeat(100)}${i}`, 1]));
  const { rejected } = validateConsentPreferences(input);
  assert.equal(rejected.length, 20);
  assert.ok(rejected.every(key => key.length <= 40));
});

test('buildConsentSummary lists every shared preference readably', () => {
  const summary = buildConsentSummary({ languages: ['Python', 'Rust'], interests: 'ai', level: 'beginner', hours: 1, mode: 'reviews' });
  assert.match(summary, /^Shared with Contributor for this session:/);
  assert.match(summary, /- Languages: Python, Rust/);
  assert.match(summary, /- Interests: ai/);
  assert.match(summary, /- Experience level: beginner/);
  assert.match(summary, /- Available time: 1 hour$/m);
  assert.match(summary, /- Opportunity type: reviews/);
});

test('buildConsentSummary says so when nothing was shared', () => {
  assert.match(buildConsentSummary({}), /No preferences were shared/);
  assert.match(buildConsentSummary(), /No preferences were shared/);
});
