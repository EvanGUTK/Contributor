/** Review Coach: pure, explainable PR review checklist. No network calls and no GitHub writes; the user verifies and publishes anything themselves. */
const LARGE_PR_LINES = 500;
const MAX_LISTED = 5;

export const PUBLISH_POLICY = 'Do not post these findings without reading and verifying each one. You are responsible for any review comment you publish.';

const TEST_PATH = /(^|\/)(tests?|__tests__|specs?)\/|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)test_[^/]+\.py$|_test\.(py|go)$|(^|\/)[^/]+Tests?\.(java|kt|cs)$/i;
const DOC_PATH = /\.(md|markdown|rst|txt)$|(^|\/)(docs?|assets)\//i;
const CODE_PATH = /\.([cm]?[jt]sx?|py|go|rs|java|kt|cs|rb|php|swift|c|cc|cpp|h|hpp|sh)$/i;
const MENTIONED_PATH = /`([^`\s]+\.[a-z]{1,5})`|(?<![\w`])((?:[\w.-]+\/)+[\w.-]+\.[a-z]{1,5})(?![\w/])/gi;
const STOPWORDS = new Set(['this', 'that', 'with', 'from', 'into', 'have', 'will', 'when', 'also', 'adds', 'added', 'update', 'updates', 'fixes', 'fixed', 'closes', 'close', 'issue', 'change', 'changes', 'tests', 'test', 'more', 'than', 'then', 'they', 'their', 'there', 'which', 'should', 'would', 'could', 'make', 'makes', 'using', 'used', 'uses', 'file', 'files', 'code', 'based', 'about', 'only', 'other', 'some', 'each', 'does', 'what', 'were', 'been', 'being', 'just', 'like', 'need']);
const GENERIC_SEGMENTS = new Set(['src', 'lib', 'index', 'main', 'test', 'tests', 'spec', 'specs', 'packages', 'apps', 'core', 'mjs', 'cjs', 'json', 'docs', 'readme']);

const SECRET_PATTERNS = [
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { name: 'Anthropic/OpenAI-style API key', re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'private key block', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  { name: 'hardcoded credential assignment', re: /\b(?:api[_-]?key|secret|token|passw(?:or)?d|auth)[\w-]*["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i },
];
const PLACEHOLDER = /your[-_ ]|example|changeme|placeholder|dummy|xxxx|<[^>]+>|\$\{|process\.env|os\.environ/i;
const RISKY_PATTERNS = [
  { name: 'eval()', re: /\beval\s*\(/ },
  { name: 'new Function()', re: /\bnew\s+Function\s*\(/ },
  { name: 'child_process / shell execution', re: /\bchild_process\b|\b(?:execSync|execFileSync|spawnSync)\s*\(|(?<![.\w])exec\s*\(/ },
  { name: 'Python shell execution', re: /\bos\.system\s*\(|\bshell\s*=\s*True\b|\bsubprocess\.(?:call|run|Popen)\b/ },
];

const item = (category, severity, question, evidence) => ({ category, question, evidence, severity });
const list = (values, max = MAX_LISTED) => values.length > max ? `${values.slice(0, max).join(', ')} (+${values.length - max} more)` : values.join(', ');
const isTest = name => TEST_PATH.test(name);
const patchOf = file => file.patch ?? file.patch_excerpt ?? '';
const descriptionOf = pr => String(pr.description_excerpt ?? pr.body ?? '');
const redact = text => text.length <= 8 ? '****' : `${text.slice(0, 4)}…[redacted]`;

/** Added lines only (diff '+' lines minus the '+++' header), so removed secrets and context are never flagged. */
function addedLines(patch) {
  return patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1));
}
function stem(word) {
  return word.replace(/(ing|ed|es|s)$/, '');
}
function tokens(text) {
  const words = text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/);
  return new Set(words.filter(w => w.length >= 4 && !STOPWORDS.has(w) && !GENERIC_SEGMENTS.has(w)).map(stem));
}

function scopeItems(pr, files) {
  const description = `${pr.title ?? ''}\n${descriptionOf(pr)}`;
  const items = [];
  if (descriptionOf(pr).trim().length < 20) {
    items.push(item('SCOPE', 'warn', 'Does the PR description explain what the diff is meant to do?', 'The PR description is empty or very short, so scope cannot be compared against the diff. Ask the author what problem this solves.'));
  }
  const names = files.map(f => f.filename);
  const mentioned = [...description.matchAll(MENTIONED_PATH)].map(m => m[1] ?? m[2]);
  const missing = [...new Set(mentioned)].filter(path => !names.some(name => name === path || name.endsWith(`/${path}`) || path.endsWith(`/${name}`)));
  if (missing.length) {
    items.push(item('SCOPE', 'warn', 'Does the diff include every file the description says was changed?', `Mentioned in the description but absent from the reviewed files: ${list(missing)}. They may be on later pages of the diff or not actually changed.`));
  }
  const descTokens = tokens(description);
  const perFile = files.map(f => ({ name: f.filename, shared: [...tokens(f.filename)].filter(t => descTokens.has(t)) }));
  const shared = new Set(perFile.flatMap(f => f.shared));
  if (descriptionOf(pr).trim().length >= 20 && files.length && !shared.size) {
    items.push(item('SCOPE', 'warn', 'Does the diff match what the PR says it does?', `No terms from the title/description appear in any changed file path (${list(names)}). Possible scope mismatch; compare the description with the actual changes.`));
  } else if (shared.size) {
    const unrelated = perFile.filter(f => !f.shared.length && !isTest(f.name) && !DOC_PATH.test(f.name)).map(f => f.name);
    items.push(unrelated.length >= 2 && unrelated.length >= files.length / 2
      ? item('SCOPE', 'info', 'Are all changed files related to the stated purpose?', `Terms shared with the description: ${list([...shared])}. Files with no obvious link to it: ${list(unrelated)}. Check whether they belong in this PR.`)
      : item('SCOPE', 'info', 'Does the diff match what the PR says it does?', `Description terms found in changed file paths: ${list([...shared])}. Path-level heuristic only; read the diff to confirm.`));
  }
  return items.length ? items : [item('SCOPE', 'info', 'Does the diff match what the PR says it does?', 'No files to compare against the description.')];
}

function testItems(files) {
  const code = files.filter(f => CODE_PATH.test(f.filename) && !isTest(f.filename) && f.status !== 'removed');
  const tests = files.filter(f => isTest(f.filename));
  if (!code.length) {
    return [item('TESTS', 'info', 'Do the code changes have tests?', files.length && files.every(f => DOC_PATH.test(f.filename) || isTest(f.filename))
      ? 'No source code files changed (docs/tests only), so new tests are not expected.'
      : 'No recognizable source code files changed in the reviewed files.')];
  }
  if (!tests.length) {
    return [item('TESTS', 'warn', 'Do the additions have corresponding tests?', `${code.length} source file(s) changed and no test files in the reviewed files: ${list(code.map(f => f.filename))}. Ask whether behavior is covered elsewhere.`)];
  }
  const testText = `${tests.map(f => f.filename).join('\n')}\n${tests.map(patchOf).join('\n')}`.toLowerCase();
  const uncovered = code.filter(f => {
    const base = f.filename.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase();
    return !testText.includes(base);
  }).map(f => f.filename);
  return [uncovered.length
    ? item('TESTS', 'info', 'Does each changed source file have a corresponding test?', `Test files present: ${list(tests.map(f => f.filename))}. No test file name or test content references: ${list(uncovered)}. Name-based heuristic; confirm by reading the tests.`)
    : item('TESTS', 'info', 'Do the additions have corresponding tests?', `Test files present (${list(tests.map(f => f.filename))}) and each changed source file is referenced by name. Verify the tests assert real behavior.`)];
}

const EXPORT_DECL = /^[-+]\s*export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([\w$]+)\s*(\([^)]*\))?/;
function exportChanges(patch) {
  const removed = new Map(), added = new Map();
  for (const line of patch.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    const m = EXPORT_DECL.exec(line);
    if (m) (line[0] === '-' ? removed : added).set(m[1], (m[2] ?? '').replace(/\s+/g, ''));
  }
  const gone = [...removed.keys()].filter(name => !added.has(name));
  const changed = [...removed].filter(([name, sig]) => added.has(name) && added.get(name) !== sig).map(([name]) => name);
  return { gone, changed };
}

function breakingItems(files) {
  const items = [];
  const removed = files.filter(f => f.status === 'removed').map(f => f.filename);
  const renamed = files.filter(f => f.status === 'renamed').map(f => f.previous_filename ? `${f.previous_filename} → ${f.filename}` : f.filename);
  if (removed.length) items.push(item('BREAKING', 'warn', 'Does removing these files break importers or public paths?', `Removed: ${list(removed)}. Search the repository for remaining references.`));
  if (renamed.length) items.push(item('BREAKING', 'warn', 'Does renaming these files break importers or public paths?', `Renamed: ${list(renamed)}. Search for stale imports and documentation links.`));
  for (const file of files) {
    const { gone, changed } = exportChanges(patchOf(file));
    if (gone.length) items.push(item('BREAKING', 'warn', 'Were exports removed or renamed that other modules depend on?', `${file.filename}: export(s) no longer declared: ${list(gone)}. Check callers and public API docs.`));
    if (changed.length) items.push(item('BREAKING', 'warn', 'Did a function signature change for existing callers?', `${file.filename}: signature changed for ${list(changed)}. Check every caller and the default/optional parameter handling.`));
  }
  return items.length ? items : [item('BREAKING', 'info', 'Does the diff remove, rename or re-sign anything public?', 'No removed or renamed files and no removed/changed export declarations found in the available patches.')];
}

function securityItems(files) {
  const items = [];
  for (const file of files) {
    const lines = addedLines(patchOf(file));
    const seen = new Set();
    for (const line of lines) {
      // Patterns are ordered specific-to-generic; the first match wins so one line yields one finding.
      const hit = SECRET_PATTERNS.map(({ name, re }) => ({ name, m: re.exec(line) })).find(({ m }) => m && !PLACEHOLDER.test(m[0]));
      if (!hit || seen.has(hit.name)) continue;
      seen.add(hit.name);
      items.push(item('SECURITY', 'block', 'Is this a real credential committed to the repository?', `${file.filename}: added line looks like a ${hit.name} (${redact(hit.m[0])}). Verify, and if real the author must rotate it; do not repeat the value in a public comment.`));
    }
    for (const { name, re } of RISKY_PATTERNS) {
      if (lines.some(line => re.test(line))) items.push(item('SECURITY', 'warn', 'Can untrusted input reach this dynamic execution?', `${file.filename}: added code uses ${name}. Trace where the argument comes from.`));
    }
  }
  const unscanned = files.filter(f => !patchOf(f) && f.status !== 'removed' && (f.additions ?? 0) > 0).map(f => f.filename);
  if (unscanned.length) items.push(item('SECURITY', 'info', 'Were all changed files scanned?', `No patch text was available for: ${list(unscanned)} (binary or very large diffs). Review these by hand.`));
  return items.length ? items : [item('SECURITY', 'info', 'Does the diff add secrets or dynamic code execution?', 'No secret-like strings or eval/exec patterns found in added lines of the available patches. Pattern matching only; not a security audit.')];
}

function sizeItems(pr, files) {
  const lines = (pr.additions ?? files.reduce((n, f) => n + (f.additions ?? 0), 0)) + (pr.deletions ?? files.reduce((n, f) => n + (f.deletions ?? 0), 0));
  const total = pr.changed_files ?? files.length;
  const items = [lines > LARGE_PR_LINES
    ? item('SIZE', 'warn', 'Is this PR small enough to review well?', `Large PR: ${lines} lines changed across ${total} file(s) (threshold ${LARGE_PR_LINES}). Consider requesting a split.`)
    : item('SIZE', 'info', 'Is this PR small enough to review well?', `${lines} lines changed across ${total} file(s), within the ${LARGE_PR_LINES}-line threshold.`)];
  if (total > files.length) items.push(item('SIZE', 'info', 'Was the whole diff reviewed?', `Only ${files.length} of ${total} changed files were available. Findings cover the first page of files only; read the rest on GitHub.`));
  return items;
}

/** Builds a review checklist from the PR metadata and changed-file list shape returned by `analyze_pull_request`. */
export function buildReviewChecklist(prData, files = []) {
  const pr = prData && typeof prData === 'object' ? prData : {};
  const changed = Array.isArray(files) ? files.filter(f => f && typeof f.filename === 'string') : [];
  const checklistItems = [...scopeItems(pr, changed), ...testItems(changed), ...breakingItems(changed), ...securityItems(changed), ...sizeItems(pr, changed)];
  const count = severity => checklistItems.filter(i => i.severity === severity).length;
  return {
    summary: `${checklistItems.length} checklist item(s) for ${changed.length} reviewed file(s): ${count('block')} block, ${count('warn')} warn, ${count('info')} info. These are heuristic prompts to investigate, not verdicts.`,
    checklistItems,
    draftGuidance: 'Open each warn/block item in the diff and confirm it yourself before writing anything. Structure a comment as: what you observed (with file and line), why it matters, and a concrete suggestion or question, in a respectful tone that assumes good faith. Lead with questions when you are unsure. Check CONTRIBUTING.md and any AI-assistance policy first, and drop any finding you cannot reproduce or explain in your own words.',
    publishPolicy: PUBLISH_POLICY,
  };
}
