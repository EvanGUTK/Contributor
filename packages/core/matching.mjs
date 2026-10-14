/** Explainable, deterministic matching. No AI calls or GitHub writes. */
export const LANGUAGES = ['Python', 'TypeScript', 'JavaScript', 'Rust', 'Go', 'C++', 'Java', 'C#', 'Julia', 'MATLAB', 'Swift', 'Kotlin'];
export const MODES = ['all', 'issues', 'reviews', 'repositories'];
export const LEVELS = ['beginner', 'intermediate', 'advanced'];
/** Issues with no activity inside this window are excluded from discovery as likely stale. */
export const ACTIVITY_WINDOW_DAYS = 90;
const DAY_MS = 86400000;
/** Repository search tries at most this many interest words, one request each. */
export const MAX_TOPIC_WORDS = 2;

const normalize = value => String(value ?? '').toLowerCase().trim();
const words = value => normalize(value).split(/[,\s]+/).filter(Boolean).slice(0, 12);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function normalizePreferences(input = {}) {
  const languages = (Array.isArray(input.languages) ? input.languages : String(input.languages ?? '').split(','))
    .map(x => String(x).trim()).filter(x => x.length > 0).slice(0, 8);
  return {
    languages: [...new Set(languages)],
    interests: String(input.interests ?? '').trim().slice(0, 120),
    level: LEVELS.includes(input.level) ? input.level : 'beginner',
    hours: clamp(Number.isFinite(Number(input.hours)) ? Number(input.hours) : 4, 1, 40),
    mode: MODES.includes(input.mode) ? input.mode : 'all',
  };
}

export function projectIdFromIssue(issue) {
  const url = issue.repository_url || issue.html_url || '';
  const match = /(?:api\.github\.com\/repos\/|github\.com\/)([^/?#]+\/[^/?#]+)/.exec(url);
  return match?.[1] ?? null;
}

export function estimateIssueDifficulty(issue) {
  const labels = (issue.labels ?? []).map(l => normalize(typeof l === 'string' ? l : l.name));
  const title = normalize(issue.title);
  if (labels.some(x => /good first issue|beginner|easy|first-timer/.test(x))) return 'beginner';
  if (labels.some(x => /complex|breaking|architecture|expert|advanced/.test(x)) || /migrat|refactor entire/.test(title)) return 'advanced';
  return 'unknown';
}

export function scoreOpportunity(item, preferences = {}, repo = null) {
  const p = normalizePreferences(preferences);
  const name = item.name || item.title || '';
  const description = item.description || item.body || '';
  const language = normalize(repo?.language || item.language);
  const searchable = normalize(`${name} ${description} ${repo?.description || ''} ${repo?.full_name || ''}`).slice(0, 6000);
  const reasons = [];
  const breakdown = { technology: 0, interests: 0, accessibility: 0, freshness: 0, maintainership: 0 };
  const langs = p.languages.map(normalize);
  if (!langs.length) {
    breakdown.technology = 14;
  } else if (langs.includes(language)) {
    breakdown.technology = 35;
    reasons.push(`Matches your ${repo?.language || item.language} preference`);
  } else if (langs.some(x => x && searchable.includes(x))) {
    breakdown.technology = 22;
    reasons.push('Mentions a language you selected');
  } else {
    breakdown.technology = 4;
  }
  const terms = words(p.interests).filter(x => x.length > 2);
  const hits = terms.filter(x => searchable.includes(x));
  breakdown.interests = !terms.length ? 13 : Math.round(25 * hits.length / terms.length);
  if (hits.length) reasons.push(`Relevant topics: ${hits.slice(0, 3).join(', ')}`);
  const difficulty = item.pull_request ? 'review' : item.repository_url ? estimateIssueDifficulty(item) : 'repository';
  const labels = (item.labels || []).map(x => normalize(typeof x === 'string' ? x : x.name));
  if (difficulty === 'beginner' && p.level === 'beginner') {
    breakdown.accessibility = 20;
    reasons.push('Labeled beginner-friendly');
  } else if (difficulty === 'advanced' && p.level === 'beginner') {
    breakdown.accessibility = 1;
    reasons.push('May require advanced experience');
  } else if (difficulty === 'review') {
    breakdown.accessibility = p.mode === 'reviews' ? 15 : 9;
    reasons.push('Opportunity to practice code review');
  } else if (difficulty === 'repository') {
    breakdown.accessibility = 11;
  } else {
    breakdown.accessibility = 10;
    if (labels.some(x => /help wanted/.test(x))) reasons.push('Maintainers marked this issue for help');
  }
  const updated = Date.parse(item.updated_at || repo?.pushed_at || '');
  const days = Number.isFinite(updated) ? Math.max(0, (Date.now() - updated) / 86400000) : Infinity;
  breakdown.freshness = days <= 7 ? 12 : days <= 30 ? 9 : days <= 90 ? 5 : 1;
  if (days <= 30) reasons.push('Recent repository activity');
  breakdown.maintainership = repo?.archived || repo?.disabled ? 0 : 7;
  if (repo?.archived) reasons.push('Archived repository: confirm contribution policy');
  const score = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));
  return { score, breakdown, reasons, difficulty, confidence: repo ? 'medium' : 'limited',
    note: 'Heuristic relevance score, not a prediction of acceptance or skill.' };
}

export function describeOpportunity(item) {
  if (item.pull_request) return 'Review opportunity';
  if (item.repository_url) return 'Issue';
  return 'Repository';
}

export function buildHandoffPrompt(item, preferences = {}) {
  const p = normalizePreferences(preferences);
  const url = String(item.html_url || item.url || '');
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\/|$)/.test(url)) throw new Error('A verified GitHub URL is required.');
  const kind = describeOpportunity(item);
  return [
    'You are assisting me with an open-source contribution. Use Contributor to find and evaluate relevant work; this is the selected candidate.',
    `Selected ${kind.toLowerCase()}: ${url}`,
    `My languages: ${p.languages.join(', ') || 'not specified'}.`,
    `My interests: ${p.interests || 'not specified'}.`,
    `My experience level: ${p.level}. My time budget: ${p.hours} hours.`,
    'Before writing or publishing anything, inspect the real repository, CONTRIBUTING.md, license, code of conduct, issue/PR status and any AI-assistance policy.',
    'Check whether the issue is already being worked on or has a linked pull request. Confirm it is still actionable.',
    kind === 'Review opportunity' ? 'Explain the diff, identify testable concerns, inspect existing reviews, and prepare evidence-based draft review comments. Do not post them.' : 'Explain the architecture and relevant files, propose the smallest meaningful scoped change and focused tests.',
    'Distinguish observations from hypotheses. Give an estimated effort range with uncertainty.',
    'Ask me to approve the plan before changing files, posting comments, opening PRs or requesting remote Git writes.'
  ].join('\n');
}

/** Interest words safe to place in a repository query (no operators), in the order the user wrote them. */
export function extractTopics(interests, max = MAX_TOPIC_WORDS) {
  const topics = words(interests).filter(x => /^[a-z0-9-]{3,25}$/.test(x));
  return [...new Set(topics)].slice(0, max);
}

/** Construct a GitHub search string from selected controls, never from raw query operators. */
export function buildSearchQuery(prefs, kind, { now = new Date(), topic } = {}) {
  const p = normalizePreferences(prefs);
  const language = p.languages[0] && LANGUAGES.some(x => x.toLowerCase() === p.languages[0].toLowerCase()) ? ` language:${p.languages[0].replace(/\+/g, '+')}` : '';
  // Do not append arbitrary user interests to issue search: it can crowd out otherwise relevant matches.
  if (kind === 'issues') {
    const since = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
    // A comma between label values is GitHub's OR; the updated: qualifier drops stale issues.
    return `is:issue is:open label:"good first issue","help wanted" updated:>=${since}${language}`;
  }
  if (kind === 'reviews') return `is:pr is:open review:none${language}`;
  if (kind === 'repositories') {
    const chosen = topic === undefined ? extractTopics(p.interests, 1)[0] : extractTopics(topic, 1)[0];
    return `archived:false fork:false stars:>=10${language.replace('%2B', '+')}${chosen ? ` ${chosen}` : ''}`;
  }
  throw new Error('Unknown discovery type');
}
