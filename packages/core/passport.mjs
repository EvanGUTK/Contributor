/** Repository passport: a pure, explainable summary of whether a repo looks ready for outside contributors. */
const DAY_MS = 86_400_000;
const ACTIVE_DAYS = 90;
const STALE_DAYS = 365;
const HIGH_OPEN_ISSUES = 500;

const DOC_EXT = '(\\.(md|markdown|rst|txt))?';
const CONTRIBUTING = new RegExp(`^contributing${DOC_EXT}$`, 'i');
const LICENSE_FILE = new RegExp(`^(licen[sc]e|copying|unlicense)${DOC_EXT}$`, 'i');
const AI_POLICY = new RegExp(`^(ai|llm|genai|generative[-_ ]?ai)[-_ ]?(policy|usage|guidelines?|contributions?)${DOC_EXT}$|^(policy|guidelines?)[-_ ]?(on[-_ ])?(ai|llm)${DOC_EXT}$|^generative[-_ ]?ai${DOC_EXT}$`, 'i');
const DOTNET_PROJECT = /\.(csproj|sln)$/i;
const MANIFEST = /^(package\.json|pyproject\.toml|setup\.py|requirements\.txt|cargo\.toml|go\.mod|pom\.xml|build\.gradle(\.kts)?|cmakelists\.txt|gemfile|composer\.json|mix\.exs)$/i;
const HEAVY_TOOLING = /^(dockerfile|docker-compose\.ya?ml|compose\.ya?ml|makefile|workspace|flake\.nix|\.devcontainer|build\.bazel)$/i;

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const signal = (id, level, message) => ({ id, level, message });

function daysSince(iso, now) {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : Math.max(0, Math.floor((now - time) / DAY_MS));
}

function resolveLicense(repoData, names) {
  const spdx = repoData.license?.spdx_id;
  if (spdx && spdx !== 'NOASSERTION') return spdx;
  if (spdx === 'NOASSERTION' || names.some(name => LICENSE_FILE.test(name))) return 'Unrecognized';
  return 'Unknown';
}

/** Counts distinct build ecosystems plus heavyweight tooling found in the root; a rough proxy for setup effort. */
function classifySetup(names) {
  const ecosystems = new Set(names.filter(name => MANIFEST.test(name)).map(name => name.toLowerCase()));
  if (names.some(name => DOTNET_PROJECT.test(name))) ecosystems.add('.net');
  if (!ecosystems.size) return 'unknown';
  const points = ecosystems.size + names.filter(name => HEAVY_TOOLING.test(name)).length;
  return points <= 2 ? 'easy' : points <= 4 ? 'moderate' : 'complex';
}

function activitySignal(isArchived, lastPushed, now) {
  if (isArchived) return signal('archived', 'caution', 'Repository is archived and read-only; contributions cannot be merged.');
  const days = lastPushed ? daysSince(lastPushed, now) : null;
  if (days === null) return signal('activity-unknown', 'info', 'No push date was available, so maintainer activity cannot be judged.');
  if (days <= ACTIVE_DAYS) return signal('recently-active', 'positive', `Last push was ${days} day(s) ago.`);
  if (days <= STALE_DAYS) return signal('slowing', 'info', `Last push was ${days} days ago; maintainers may respond slowly.`);
  return signal('stale', 'caution', `Last push was ${days} days ago; the project may be unmaintained.`);
}

function licenseSignal(license) {
  if (license === 'Unknown') return signal('license-unknown', 'caution', 'No license was detected; without one, contributions have unclear legal terms.');
  if (license === 'Unrecognized') return signal('license-unrecognized', 'info', 'A license file exists but GitHub could not identify it; read it manually.');
  return signal('license-found', 'positive', `Licensed under ${license}.`);
}

function fileSignals(hasContributing, aiPolicyDetected) {
  return [
    hasContributing
      ? signal('contributing-found', 'positive', 'CONTRIBUTING file found in the repository root; read it before starting.')
      : signal('contributing-not-in-root', 'info', 'No CONTRIBUTING file in the root. It may live in .github/ or docs/, or the README may describe the process.'),
    aiPolicyDetected
      ? signal('ai-policy-found', 'caution', 'An AI usage policy file exists in the root; read it before using AI assistance.')
      : signal('ai-policy-not-detected', 'info', 'No AI policy file in the root. Policies inside CONTRIBUTING or the README are not scanned, so check them manually.'),
  ];
}

/**
 * @param {object} repoData GitHub REST repository object (only public metadata fields are read).
 * @param {Array<{name: string}>|null} files Root directory listing, or null/undefined when it could not be fetched.
 * @param {{now?: number}} [options] Injectable clock for deterministic output.
 */
export function getPassportSummary(repoData, files, { now = Date.now() } = {}) {
  if (!isPlainObject(repoData)) throw new TypeError('getPassportSummary requires GitHub repository metadata');
  const listed = Array.isArray(files);
  const names = listed ? files.map(file => String(file?.name ?? '')).filter(Boolean) : [];
  const isArchived = Boolean(repoData.archived || repoData.disabled);
  const lastPushed = repoData.pushed_at ?? null;
  const openIssues = Number.isFinite(repoData.open_issues_count) ? repoData.open_issues_count : null;
  const license = resolveLicense(repoData, names);
  // Filename checks only see the repo root: null means "could not look", false means "not found there".
  const hasContributing = listed ? names.some(name => CONTRIBUTING.test(name)) : null;
  const aiPolicyDetected = listed ? names.some(name => AI_POLICY.test(name)) : null;
  const setupDifficulty = listed ? classifySetup(names) : 'unknown';

  const signals = [activitySignal(isArchived, lastPushed, now), licenseSignal(license)];
  if (listed) signals.push(...fileSignals(hasContributing, aiPolicyDetected));
  else signals.push(signal('files-unavailable', 'info', 'Root file listing was unavailable, so contribution docs and setup could not be checked.'));
  if (openIssues !== null && openIssues >= HIGH_OPEN_ISSUES) signals.push(signal('many-open-items', 'info', `${openIssues} open items (GitHub counts issues and pull requests together); triage may be slow.`));
  if (setupDifficulty !== 'unknown') signals.push(signal('setup-heuristic', 'info', `Setup looks ${setupDifficulty} based on root build files only; this is a heuristic, not a tested build.`));

  return { hasContributing, license, openIssues, lastPushed, isArchived, aiPolicyDetected, setupDifficulty, signals };
}
