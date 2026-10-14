import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Certifies that dist/ is a self-contained static bundle that is free to host: required files present,
// small enough for free tiers, no embedded credentials, no external script dependencies.
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const REQUIRED_FILES = ['index.html', 'app.mjs', 'styles.css', 'lib/matching.mjs', 'lib/github.mjs'];
const MAX_BYTES = 500 * 1024;

// Mirrors SECRET_PATTERNS / PLACEHOLDER in packages/core/review-coach.mjs (not exported there); keep in sync.
const SECRET_PATTERNS = [
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/ },
  { name: 'Anthropic/OpenAI-style API key', re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: 'Slack token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'private key block', re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/ },
  { name: 'hardcoded credential assignment', re: /\b(?:api[_-]?key|secret|token|passw(?:or)?d|auth)[\w-]*["']?\s*[:=]\s*["'][A-Za-z0-9+/=_-]{16,}["']/i },
];
const PLACEHOLDER = /your[-_ ]|example|changeme|placeholder|dummy|xxxx|<[^>]+>|\$\{|process\.env|os\.environ/i;
const EXTERNAL_SCRIPT = /<script\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i;

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const exists = path => stat(path).then(s => s.isFile(), () => false);

async function checkBuild() {
  const result = spawnSync('npm', ['run', 'build'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? [] : [`npm run build exited with ${result.status ?? result.error?.message}`, ...(result.stderr || result.stdout).trim().split('\n').slice(-5)];
}

async function checkRequiredFiles() {
  const missing = [];
  for (const file of REQUIRED_FILES) if (!await exists(join(dist, file))) missing.push(`missing dist/${file}`);
  return missing;
}

async function checkSize(files) {
  let total = 0;
  for (const file of files) total += (await stat(file)).size;
  const kb = (total / 1024).toFixed(1);
  console.log(`  total dist/ size: ${kb} KB of ${MAX_BYTES / 1024} KB`);
  return total < MAX_BYTES ? [] : [`dist/ is ${kb} KB, limit is ${MAX_BYTES / 1024} KB`];
}

async function checkSecrets(files) {
  const problems = [];
  for (const file of files) {
    const buffer = await readFile(file);
    if (buffer.includes(0)) continue; // binary asset
    const lines = buffer.toString('utf8').split('\n');
    lines.forEach((line, index) => {
      const hit = SECRET_PATTERNS.map(({ name, re }) => ({ name, m: re.exec(line) })).find(({ m }) => m && !PLACEHOLDER.test(m[0]));
      if (hit) problems.push(`${relative(root, file)}:${index + 1}: possible ${hit.name} (value withheld)`);
    });
  }
  return problems;
}

async function checkSelfContained() {
  const html = await readFile(join(dist, 'index.html'), 'utf8').catch(() => null);
  if (html === null) return ['dist/index.html is unreadable'];
  return EXTERNAL_SCRIPT.test(html) ? ['dist/index.html has a <script src> pointing to an external origin'] : [];
}

const results = [];
async function run(name, check) {
  const problems = await check();
  results.push({ name, problems });
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${name}`);
  for (const problem of problems) console.log(`  - ${problem}`);
}

await run('npm run build succeeds', checkBuild);
await run(`dist/ contains ${REQUIRED_FILES.join(', ')}`, checkRequiredFiles);
const files = await exists(join(dist, 'index.html')) ? await walk(dist) : [];
await run('dist/ total size under 500 KB', () => checkSize(files));
await run('no hardcoded API key patterns in dist/', () => checkSecrets(files));
await run('index.html loads no external <script src>', checkSelfContained);

const failed = results.filter(r => r.problems.length);
console.log(failed.length ? `\n${failed.length} of ${results.length} checks failed.` : `\nAll ${results.length} checks passed: dist/ is a self-contained static bundle.`);
process.exit(failed.length ? 1 : 0);
