/** Explainable, deterministic matching. No AI calls or GitHub writes. */
export const LANGUAGES = ['Python', 'TypeScript', 'JavaScript', 'Rust', 'Go', 'C++', 'Java', 'C#', 'Julia', 'MATLAB', 'Swift', 'Kotlin'];
export const MODES = ['all', 'issues', 'reviews', 'repositories'];
export const LEVELS = ['beginner', 'intermediate', 'advanced'];
/** Issues with no activity inside this window are excluded from discovery as likely stale. */
export const ACTIVITY_WINDOW_DAYS = 90;
const DAY_MS = 86400000;
/** Repository search tries at most this many interest words, one request each. */
export const MAX_TOPIC_WORDS = 2;
/**
 * Review opportunities from repositories with fewer stars than this are flagged (a higher bar than the 10 used for repositories).
 * GitHub's issue/PR search has no stars: qualifier (it is treated as free text), so this is enforced on repository metadata after the search.
 */
export const REVIEW_MIN_STARS = 25;
/** Pull requests with no activity inside this window are excluded from review discovery as likely abandoned. */
export const REVIEW_WINDOW_DAYS = 30;

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

/** A declared beginner who can commit this many hours is treated as intermediate, not interest-only. */
export const EXPERIENCED_HOURS = 16;
/** An advanced user with at most this many hours is looking for a quick task, not a deep one. */
export const QUICK_TASK_HOURS = 2;

/** Separate stated interest from demonstrated expertise using the declared level and time budget. */
export function calibrateExperience(p) {
  const promoted = p.level === 'beginner' && p.hours >= EXPERIENCED_HOURS;
  return {
    effectiveLevel: promoted ? 'intermediate' : p.level,
    interestOnly: p.level === 'beginner' && !promoted,
    quickTask: p.level === 'advanced' && p.hours <= QUICK_TASK_HOURS,
  };
}

/** Score points removed from an issue that already has a linked open PR: still shown, but ranked lower. */
export const IN_PROGRESS_PENALTY = 15;

/** Always attached to a responsiveness result so callers never present the estimate as certain. */
export const RESPONSIVENESS_NOTE = 'Responsiveness is estimated from public data only.';

/**
 * Pure 0-15 estimate of maintainer responsiveness from getResponsivenessSignals() output.
 * Missing numbers are treated as unknown and earn no points rather than being guessed.
 */
export function scoreResponsiveness(signals = {}) {
  const { daysSinceLastPush, recentCloseCount, openIssueCount, archived } = signals ?? {};
  if (archived) return { score: 0, label: 'archived', reasons: ['Archived repository: maintainers are not accepting changes'], note: RESPONSIVENESS_NOTE };
  const reasons = [];
  let score = 0;
  let label = 'activity unknown';
  if (Number.isFinite(daysSinceLastPush)) {
    if (daysSinceLastPush <= 30) { score += 8; label = 'recently active'; reasons.push('recently active (pushed within 30 days)'); }
    else if (daysSinceLastPush <= 90) { score += 5; label = 'somewhat active'; reasons.push('last push 31-90 days ago'); }
    else { score += 1; label = 'inactive'; reasons.push('no push in over 90 days'); }
  }
  if (Number.isFinite(recentCloseCount)) {
    if (recentCloseCount >= 3) { score += 5; reasons.push('maintainers closing issues'); }
    else if (recentCloseCount >= 1) score += 2;
  }
  if (Number.isFinite(openIssueCount) && openIssueCount > 500) { score -= 3; reasons.push('high open issue backlog'); }
  return { score: clamp(score, 0, 15), label, reasons, note: RESPONSIVENESS_NOTE };
}

/** Shown whenever a review opportunity looks unlikely to welcome outside reviewers. */
export const OUTSIDE_REVIEW_DISCLAIMER = 'Outside reviews may not be welcome on this repository. Check CONTRIBUTING.md before commenting.';
/** Text is flagged as non-English when more than this share of its letters are non-ASCII. */
export const NON_ENGLISH_RATIO = 0.6;

/** Rough, deterministic check: no language detection, only the share of non-ASCII letters. Empty text is never flagged. */
export function isMostlyNonEnglish(text) {
  const letters = String(text ?? '').match(/\p{L}/gu) ?? [];
  if (!letters.length) return false;
  const nonAscii = letters.filter(ch => ch.charCodeAt(0) > 127).length;
  return nonAscii / letters.length > NON_ENGLISH_RATIO;
}

/**
 * Flags, never filters: the result stays visible so the UI can warn. Only review opportunities are checked.
 * Stars come from the repository record; an unknown count is not treated as low.
 */
export function assessReviewSafety(item, repo, text) {
  const welcome = {
    outsideReviewWelcome: true,
    disclaimer: null,
  };
  if (!item.pull_request) return welcome;
  const stars = repo?.stargazers_count;
  const lowStars = Number.isFinite(stars) && stars < REVIEW_MIN_STARS;
  // Archived repositories are read-only on GitHub: pull requests there cannot take new reviews.
  if (!lowStars && !repo?.archived && !isMostlyNonEnglish(text)) return welcome;
  return { outsideReviewWelcome: false, disclaimer: OUTSIDE_REVIEW_DISCLAIMER };
}

export function scoreOpportunity(item, preferences = {}, repo = null, { inProgress = false, signals = null } = {}) {
  const p = normalizePreferences(preferences);
  const { effectiveLevel, interestOnly, quickTask } = calibrateExperience(p);
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
  if (difficulty === 'beginner' && quickTask) {
    breakdown.accessibility = 18;
    reasons.push('Small, well-scoped task that fits a short time budget');
  } else if (difficulty === 'advanced' && quickTask) {
    breakdown.accessibility = 3;
    reasons.push('Likely too large for a short time budget');
  } else if (difficulty === 'beginner' && interestOnly) {
    breakdown.accessibility = 20;
    reasons.push('Labeled beginner-friendly');
  } else if (difficulty === 'beginner' && effectiveLevel === 'intermediate') {
    breakdown.accessibility = 14;
    reasons.push('Labeled beginner-friendly; your time budget suggests you can take on more');
  } else if (difficulty === 'advanced' && interestOnly) {
    breakdown.accessibility = 1;
    reasons.push('May require advanced experience');
  } else if (difficulty === 'advanced' && effectiveLevel === 'intermediate') {
    breakdown.accessibility = 8;
    reasons.push('May require advanced experience; a stretch given your time budget');
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
  // Without signals keep the original flat 7; with them, the 0-15 responsiveness estimate replaces it.
  const maintainership = signals ? scoreResponsiveness({ ...signals, archived: signals.archived || repo?.archived }) : null;
  breakdown.maintainership = repo?.disabled ? 0 : maintainership ? maintainership.score : repo?.archived ? 0 : 7;
  if (repo?.archived) reasons.push('Archived repository: confirm contribution policy');
  else if (maintainership) reasons.push(...maintainership.reasons.filter(r => /recently active|closing issues|backlog/.test(r)).map(r => `Maintainers: ${r}`));
  const base = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));
  const score = inProgress ? Math.max(0, base - IN_PROGRESS_PENALTY) : base;
  if (inProgress) reasons.push('A linked open pull request may already address this issue');
  const safetyFlags = assessReviewSafety(item, repo, `${name} ${description}`);
  return { score, inProgress, maintainership, breakdown, reasons, difficulty, safetyFlags, confidence: repo ? 'medium' : 'limited',
    calibration: { interestOnly, quickTask },
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
  // No stars: here; /search/issues does not support it and would treat it as text. See REVIEW_MIN_STARS.
  if (kind === 'reviews') {
    const since = new Date(now.getTime() - REVIEW_WINDOW_DAYS * DAY_MS).toISOString().slice(0, 10);
    return `is:pr is:open review:none updated:>=${since}${language}`;
  }
  if (kind === 'repositories') {
    const chosen = topic === undefined ? extractTopics(p.interests, 1)[0] : extractTopics(topic, 1)[0];
    return `archived:false fork:false stars:>=10${language.replace('%2B', '+')}${chosen ? ` ${chosen}` : ''}`;
  }
  throw new Error('Unknown discovery type');
}
